import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { designSchema } from '../lib/schema.ts';
import { ApiError } from './auth.mjs';

export const CHUNK_BYTES = 1_000_000;
export const MAX_DESIGN_BYTES = 12_000_000;
const MAX_PHOTO_BYTES = 8_000_000;
const MAX_PIXELS = 16_000_000;
const bad = () => new ApiError('INVALID_DESIGN', 400, '设计文件或图片无法读取，请重新导出后再试。');
const parts = ['body', 'corner0', 'corner1', 'corner2', 'corner3', 'trim'];

async function decodeRaster(bytes, expectedFormat, budget) {
  try {
    const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_PIXELS, animated: false });
    const metadata = await decoder.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (expectedFormat && expectedFormat !== metadata.format) ||
        !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || metadata.width * metadata.height > MAX_PIXELS) throw bad();
    if (budget) { budget.pixels -= metadata.width * metadata.height; if (budget.pixels < 0) throw bad(); }
    // Full pixel decode catches truncated/invalid contents that only reading metadata would accept.
    const clean = await decoder.rotate().webp({ quality: 90 }).toBuffer();
    return clean;
  } catch { throw bad(); }
}
export async function validateDesignBytes(bytes) {
  if (bytes.length > MAX_DESIGN_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 413, '设计不能超过 12 MB。');
  let raw;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw bad(); }
  const parsed = designSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.name.trim()) throw bad();
  const design = parsed.data;
  const images = [];
  for (const part of parts) for (const item of design.parts[part].art) {
    if (item.kind === 'image' && !item.src) throw bad();
    if (item.kind === 'text' && typeof item.text !== 'string') throw bad();
    if (item.kind === 'stroke' && (!item.points?.length || !item.width)) throw bad();
    if (item.src) images.push(item.src);
  }
  if (design.label.image) images.push(design.label.image);
  // Dedup decoding, but bound all aggregate image work even for repeated source strings.
  if (images.length > 40) throw new ApiError('TOO_MANY_IMAGES', 400, '每份设计最多包含 40 张图片。');
  let decodedBytes = 0; const budget = { pixels: 32_000_000 };
  for (const data of new Set(images)) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(data);
    if (!match || match[2].length % 4 !== 0) throw bad();
    const imageBytes = Buffer.from(match[2], 'base64');
    if (!imageBytes.length || imageBytes.toString('base64') !== match[2]) throw bad();
    decodedBytes += imageBytes.length;
    if (decodedBytes > 9_000_000) throw bad();
    await decodeRaster(imageBytes, match[1], budget);
  }
  return design;
}

/** Private SQLite BLOB adapter. No object path is exposed as a public/static file. */
export function createObjectStore({ db, store, now = Date.now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS private_uploads (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, byte_length INTEGER NOT NULL,
      received INTEGER NOT NULL DEFAULT 0, next_index INTEGER NOT NULL DEFAULT 0,
      operation_key TEXT, design_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      completed_result TEXT
    );
    CREATE TABLE IF NOT EXISTS private_upload_chunks (
      upload_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, bytes BLOB NOT NULL,
      PRIMARY KEY(upload_id,chunk_index), FOREIGN KEY(upload_id) REFERENCES private_uploads(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS private_objects (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, content_type TEXT NOT NULL, bytes BLOB NOT NULL,
      sha256 TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  function getUpload(user, id) {
    const row = db.prepare('SELECT * FROM private_uploads WHERE id=? AND owner_id=?').get(id, user.id);
    if (!row || row.expires_at <= now()) throw new ApiError('UPLOAD_NOT_FOUND', 404, '上传已失效，请重试。');
    return row;
  }
  function begin(user, input) {
    const { kind, byteLength, operationKey, id: designId } = input;
    if (!['design', 'material-photo'].includes(kind) || !Number.isSafeInteger(byteLength) || byteLength < 2 ||
      byteLength > (kind === 'design' ? MAX_DESIGN_BYTES : MAX_PHOTO_BYTES)) throw new ApiError('INVALID_UPLOAD', 400, '上传类型或文件大小无效。');
    if (kind === 'material-photo' && user.role !== 'admin') throw new ApiError('FORBIDDEN', 403);
    if (kind === 'design' && (typeof operationKey !== 'string' || operationKey.length < 8 || operationKey.length > 120)) throw new ApiError('INVALID_OPERATION_KEY', 400);
    if (designId !== undefined && (typeof designId !== 'string' || designId.length > 100)) throw new ApiError('INVALID_DESIGN', 400);
    if (designId) store.getDesign(user.id, designId);
    prune();
    const open = db.prepare('SELECT COUNT(*) AS count FROM private_uploads WHERE owner_id=? AND completed_result IS NULL').get(user.id);
    if (open.count >= 5) throw new ApiError('UPLOAD_LIMIT', 429, '待完成上传过多，请稍后重试。');
    const id = randomUUID(); const t = now();
    db.prepare('INSERT INTO private_uploads(id,owner_id,kind,byte_length,operation_key,design_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, user.id, kind, byteLength, operationKey ?? null, designId ?? null, t, t + 3600000);
    return { uploadId: id, chunkSize: CHUNK_BYTES, maxBytes: kind === 'design' ? MAX_DESIGN_BYTES : MAX_PHOTO_BYTES };
  }
  function chunk(user, id, index, bytes) {
    const row = getUpload(user, id);
    if (row.completed_result) throw new ApiError('UPLOAD_COMPLETE', 409);
    if (!Number.isSafeInteger(index) || index < 0 || bytes.length < 1 || bytes.length > CHUNK_BYTES) throw new ApiError('INVALID_CHUNK', 400);
    if (index < row.next_index) {
      const previous = db.prepare('SELECT bytes FROM private_upload_chunks WHERE upload_id=? AND chunk_index=?').get(id, index);
      if (previous && Buffer.from(previous.bytes).equals(bytes)) return { nextIndex: row.next_index };
      throw new ApiError('CHUNK_CONFLICT', 409);
    }
    if (index !== row.next_index || bytes.length !== Math.min(CHUNK_BYTES, row.byte_length - row.received)) throw new ApiError('CHUNK_CONFLICT', 409);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO private_upload_chunks(upload_id,chunk_index,bytes) VALUES(?,?,?)').run(id, index, bytes);
      db.prepare('UPDATE private_uploads SET received=received+?,next_index=next_index+1 WHERE id=?').run(bytes.length, id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { nextIndex: index + 1 };
  }
  // Serialize completion per upload, so two concurrent completions cannot create multiple photos/versions.
  const completing = new Map();
  const activeOwners = new Set();
  function completedResult(user, value) {
    const result = JSON.parse(value);
    return result.designRef ? { design: store.getDesign(user.id, result.designRef.id, result.designRef.version) } : result;
  }
  async function completeOnce(user, id) {
    const row = getUpload(user, id);
    if (row.completed_result) return completedResult(user, row.completed_result);
    if (row.received !== row.byte_length) throw new ApiError('UPLOAD_INCOMPLETE', 409, '文件尚未上传完成。');
    const bytes = Buffer.concat(db.prepare('SELECT bytes FROM private_upload_chunks WHERE upload_id=? ORDER BY chunk_index').all(id).map(r => Buffer.from(r.bytes)));
    let result;
    if (row.kind === 'design') {
      const design = await validateDesignBytes(bytes);
      result = { design: store.saveDesign(user.id, { design, id: row.design_id ?? undefined, operationKey: row.operation_key }) };
    } else {
      if (user.role !== 'admin') throw new ApiError('FORBIDDEN', 403);
      const clean = await decodeRaster(bytes);
      const objectId = randomUUID();
      result = { object: { id: objectId, url: `/api/store/objects/${objectId}`, contentType: 'image/webp' } };
      db.exec('BEGIN IMMEDIATE');
      try {
        // Recheck under the write lock, including other API processes completing the same upload.
        const latest = getUpload(user, id);
        if (latest.completed_result) { db.exec('COMMIT'); return JSON.parse(latest.completed_result); }
        db.prepare('INSERT INTO private_objects(id,owner_id,content_type,bytes,sha256,created_at) VALUES(?,?,?,?,?,?)')
          .run(objectId, user.id, 'image/webp', clean, createHash('sha256').update(clean).digest('hex'), now());
        db.prepare('UPDATE private_uploads SET completed_result=? WHERE id=?').run(JSON.stringify(result), id);
        db.prepare('DELETE FROM private_upload_chunks WHERE upload_id=?').run(id);
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    const persisted = result.design ? { designRef: { id: result.design.id, version: result.design.version } } : result;
    db.prepare('UPDATE private_uploads SET completed_result=? WHERE id=?').run(JSON.stringify(persisted), id);
    db.prepare('DELETE FROM private_upload_chunks WHERE upload_id=?').run(id);
    return result;
  }
  async function complete(user, id) {
    getUpload(user, id); // Check ownership even when another request is already completing.
    if (!completing.has(id)) {
      if (completing.size >= 4 || activeOwners.has(user.id)) throw new ApiError('PROCESSING_LIMIT', 429, '其他上传正在处理，请稍后重试。');
      activeOwners.add(user.id);
      completing.set(id, completeOnce(user, id).finally(() => { completing.delete(id); activeOwners.delete(user.id); }));
    }
    return completing.get(id);
  }
  function assertPhotoRefs(user, refs) {
    if (!Array.isArray(refs) || refs.length > 12 || refs.some(id => typeof id !== 'string' || !db.prepare('SELECT id FROM private_objects WHERE id=? AND owner_id=?').get(id, user.id))) throw new ApiError('INVALID_PHOTOS', 400, '请选择已上传的材料照片。');
    return refs;
  }
  function read(user, id) {
    const row = db.prepare('SELECT * FROM private_objects WHERE id=?').get(id);
    if (!row) throw new ApiError('OBJECT_NOT_FOUND', 404);
    if (row.owner_id !== user.id && user.role !== 'admin') {
      // Photos may be visible to an order owner only after the merchant attaches them to that order.
      const allowed = typeof store.canReadMaterialPhoto === 'function' && store.canReadMaterialPhoto(user.id, id);
      if (!allowed) throw new ApiError('OBJECT_NOT_FOUND', 404);
    }
    return { bytes: Buffer.from(row.bytes), contentType: row.content_type };
  }
  function prune() {
    // Explicit chunk deletion also covers databases created with foreign_keys disabled by an external caller.
    db.prepare('DELETE FROM private_upload_chunks WHERE upload_id IN (SELECT id FROM private_uploads WHERE expires_at<=?)').run(now());
    db.prepare('DELETE FROM private_uploads WHERE expires_at<=?').run(now());
  }
  return { begin, chunk, complete, read, assertPhotoRefs, prune };
}
