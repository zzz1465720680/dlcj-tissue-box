/** Persistent business rules. Never expose `internal` or bootstrapAdmin as HTTP actions.
 * Money is integer CNY fen. The authenticated user ID must come from the session,
 * never from request bodies. Provider adapters must verify events before calling internal.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { designSchema } from '../lib/schema.ts';
import { PARTS, PRESETS, preset } from '../lib/design.ts';
import { INITIAL_PRICING, MAX_UNIT_PRICE_FEN, needsSpecialWork } from '../lib/pricing.ts';

export const STORE_POLICY = Object.freeze({ currency: 'CNY', couponCapFen: 3000, referralRewardFen: 500, referralValidDays: 90, newOrderMaterial: 'grain', shipping: 'manual_quote_required', paymentEnabled: false });
export const STOCK_PRODUCTS = Object.freeze([
  { id: 'white-lime', name: '白瓷 · 青柠' }, { id: 'black-coral', name: '曜石 · 珊瑚红' }, { id: 'ivory', name: '奶油白' },
  { id: 'warm-grey', name: '暖灰' }, { id: 'diamond-ivory', name: '菱格打孔' }, { id: 'orange', name: '橙色' }, { id: 'yellow', name: '明黄' },
].map(p => Object.freeze({ ...p, material: 'grain' })));
const DAY = 86_400_000;
const stable = value => JSON.stringify(value, function (_key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item; });
const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const addDays = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString();
export class DomainError extends Error { constructor(code, message, status = 400, details) { super(message); this.name = 'DomainError'; this.code = code; this.status = status; this.details = details; } }
const fail = (code, message, status = 400, details) => { throw new DomainError(code, message, status, details); };
function text(value, name, max = 200, min = 1) { if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('INVALID_INPUT', `${name}无效`); return value.trim(); }
function integer(value, name, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_INPUT', `${name}无效`); return value; }
export function normalizePhone(value) { if (typeof value !== 'string') fail('INVALID_PHONE', '请填写中国大陆手机号'); const phone = value.replace(/[\s()-]/g, ''); const normalized = phone.startsWith('+86') ? phone : `+86${phone}`; if (!/^\+861[3-9]\d{9}$/.test(normalized)) fail('INVALID_PHONE', '请填写中国大陆手机号'); return normalized; }
function validDate(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('INVALID_INPUT', '有效期无效'); return new Date(value).toISOString(); }
function parseDesign(value) {
  if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > 12_000_000) fail('DESIGN_TOO_LARGE', '设计素材过大', 413);
  const result = designSchema.safeParse(value); if (!result.success) fail('INVALID_DESIGN', '设计数据不完整或素材超出限制');
  const design = result.data;
  for (const part of PARTS) { for (const key of ['color', 'edge', 'thread']) design.parts[part][key] = design.parts[part][key].toLowerCase(); for (const art of design.parts[part].art) art.color = art.color.toLowerCase(); }
  design.label.color = design.label.color.toLowerCase(); design.label.ink = design.label.ink.toLowerCase();
  return design;
}
function visualDesign(design) {
  // Only fields the renderer actually uses participate. IDs, hex letter case,
  // hidden labels and unused kind-specific fields cannot generate new rewards.
  const visualArt = a => a.kind === 'stroke' ? { kind: a.kind, color: a.color, width: a.width ?? .008, points: a.points } : a.kind === 'text' ? { kind: a.kind, color: a.color, text: a.text.trim(), x: a.x, y: a.y, scale: a.scale, rotation: a.rotation === -180 ? 180 : a.rotation } : { kind: a.kind, src: a.src, x: a.x, y: a.y, scale: a.scale, rotation: a.rotation === -180 ? 180 : a.rotation };
  return { parts: Object.fromEntries(PARTS.map(p => [p, { ...design.parts[p], art: design.parts[p].art.filter(a => !a.erase && ((a.kind === 'text' && a.text?.trim()) || (a.kind === 'image' && a.src) || (a.kind === 'stroke' && a.points?.length >= 2))).map(visualArt) }])), label: design.label.enabled ? design.label : { enabled: false } };
}
function colorDistance(a, b) { return Math.sqrt([1, 3, 5].reduce((sum, offset) => sum + (parseInt(a.slice(offset, offset + 2), 16) - parseInt(b.slice(offset, offset + 2), 16)) ** 2, 0)); }
function materialEditsFrom(design, base, minimumColorDistance) {
  let edits = 0;
  const visuals = visualDesign(design), baseline = visualDesign(base);
  for (const p of PARTS) {
    const a = design.parts[p], b = base.parts[p];
    edits += Number(a.material !== b.material) + Number(a.perforated !== b.perforated);
    for (const key of ['color', 'edge', 'thread']) if (colorDistance(a[key], b[key]) >= minimumColorDistance) edits++;
    if (stable(visuals.parts[p].art) !== stable(baseline.parts[p].art)) edits++;
  }
  if (design.label.enabled !== base.label.enabled) edits++;
  else if (design.label.enabled && (design.label.text.trim() !== base.label.text.trim() || design.label.image !== base.label.image || colorDistance(design.label.color, base.label.color) >= minimumColorDistance || colorDistance(design.label.ink, base.label.ink) >= minimumColorDistance)) edits++;
  return edits;
}
function materialEdits(design, minimumColorDistance) { return Math.min(...PRESETS.map((_p, i) => materialEditsFrom(design, preset(i), minimumColorDistance))); }
const needsBespoke = needsSpecialWork;
function publicProjection(design) { return { version: 1, name: '精选配色', parts: Object.fromEntries(PARTS.map(p => { const { color, material, perforated, edge, thread } = design.parts[p]; return [p, { color, material, perforated, edge, thread, art: [] }]; })), label: { enabled: false, color: '#222c28', ink: '#eee9df', text: 'DLCJ' } }; }

export function createStore({ filename = ':memory:', now = () => new Date(), antiAbuse = {}, quotas = {} } = {}) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename); db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  const clock = () => { const value = new Date(now()); if (!Number.isFinite(value.getTime())) throw new Error('Invalid store clock'); return value.toISOString(); };
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
  db.exec('CREATE TABLE IF NOT EXISTS store_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const migrations = fileURLToPath(new URL('./migrations/', import.meta.url));
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) transaction(() => { if (!one('SELECT name FROM store_migrations WHERE name=?', name)) { db.exec(readFileSync(`${migrations}/${name}`, 'utf8')); run('INSERT INTO store_migrations VALUES (?,?)', name, clock()); } });
  transaction(() => run('INSERT OR IGNORE INTO store_pricing(id,version,standard_fen,custom_fen,updated_at) VALUES (1,?,?,?,?)', INITIAL_PRICING.version, INITIAL_PRICING.standardFen, INITIAL_PRICING.customFen, clock()));
  const abuse = { minimumColorDistance: 24, minimumChangedFields: 1, preventDuplicateDesigns: true, ...antiAbuse };
  const quota = { maxDesignBytes: 128 * 1024 * 1024, maxDesignVersions: 500, maxActiveDesigns: 100, ...quotas };
  for (const value of Object.values(quota)) integer(value, 'storage quota', 1, 1_000_000_000);
  integer(abuse.minimumColorDistance, 'minimumColorDistance', 1, 442); integer(abuse.minimumChangedFields, 'minimumChangedFields', 1, 100);
  function rawUser(id) { return one('SELECT * FROM store_users WHERE id=?', id) ?? fail('UNAUTHENTICATED', '请先登录', 401); }
  function userView(user) { return { id: user.id, phoneMasked: `${user.phone.slice(0, 6)}****${user.phone.slice(-4)}`, role: user.role, inviteCode: user.invite_code, createdAt: user.created_at }; }
  const getUser = id => userView(rawUser(id));
  function admin(id) { const user = rawUser(id); if (user.role !== 'admin') fail('FORBIDDEN', '需要商家权限', 403); return user; }
  function audit(actor, action, target, detail = {}) { run('INSERT INTO store_audit VALUES (?,?,?,?,?,?)', randomUUID(), actor, action, target, JSON.stringify(detail), clock()); }
  function operation(actor, key, action, request, fn) {
    text(key, '操作编号', 160); const digest = hash(request);
    return transaction(() => { const previous = one('SELECT * FROM store_operations WHERE actor_id=? AND operation_key=?', actor, key); if (previous) { if (previous.action !== action || previous.request_hash !== digest) fail('IDEMPOTENCY_CONFLICT', '该操作编号已用于其他请求', 409); return JSON.parse(previous.response_json); } const result = fn(); run('INSERT INTO store_operations VALUES (?,?,?,?,?,?)', actor, key, action, digest, JSON.stringify(result), clock()); return result; });
  }
  function getPricing() {
    const row = one('SELECT * FROM store_pricing WHERE id=1');
    return { currency: 'CNY', version: row.version, standardFen: row.standard_fen, customFen: row.custom_fen, updatedAt: row.updated_at };
  }
  function adminUpdatePricing(adminId, request = {}) {
    admin(adminId);
    const standardFen = integer(request.standardFen, '现有款单价（分）', 1, MAX_UNIT_PRICE_FEN);
    const customFen = integer(request.customFen, '配色定制单价（分）', 1, MAX_UNIT_PRICE_FEN);
    const expectedVersion = integer(request.expectedVersion, '价格版本', 1, Number.MAX_SAFE_INTEGER - 1);
    return operation(adminId, request.operationKey, 'pricing_update', { standardFen, customFen, expectedVersion }, () => {
      const before = getPricing();
      if (before.version !== expectedVersion) fail('PRICE_CHANGED', '商品价格已被更新，请核对最新价格后重新保存。', 409, { pricing: before });
      if (before.standardFen === standardFen && before.customFen === customFen) return before;
      run('UPDATE store_pricing SET standard_fen=?,custom_fen=?,version=version+1,updated_at=?,updated_by=? WHERE id=1', standardFen, customFen, clock(), adminId);
      const after = getPricing();
      audit(adminId, 'pricing_update', 'tissue-box', { before, after });
      return after;
    });
  }
  function listPricingAudit(adminId, options) {
    admin(adminId); const { limit, offset } = page(options);
    return all("SELECT a.*,u.phone FROM store_audit a LEFT JOIN store_users u ON u.id=a.actor_id WHERE a.action='pricing_update' ORDER BY a.created_at DESC,a.rowid DESC LIMIT ? OFFSET ?", limit, offset).map(row => ({
      id: row.id, actorId: row.actor_id, actorLabel: row.phone ? `${row.phone.slice(0,6)}****${row.phone.slice(-4)}` : row.actor_id,
      at: row.created_at, ...JSON.parse(row.detail_json),
    }));
  }
  function registerVerifiedUser({ phone, inviteCode } = {}) {
    phone = normalizePhone(phone);
    return transaction(() => {
      const found = one('SELECT * FROM store_users WHERE phone=?', phone); if (found) return { user: userView(found), created: false };
      let inviter = null;
      // Invalid referral cookies never prevent an otherwise verified signup.
      if (typeof inviteCode === 'string' && /^[A-Za-z0-9_-]{16}$/.test(inviteCode)) inviter = one('SELECT * FROM store_users WHERE invite_code=?', inviteCode);
      const id = randomUUID(), at = clock();
      run('INSERT INTO store_users(id,phone,role,invite_code,referred_by,created_at,verified_at) VALUES (?,?,?,?,?,?,?)', id, phone, 'customer', randomBytes(12).toString('base64url'), inviter?.id ?? null, at, at);
      return { user: getUser(id), created: true };
    });
  }
  function bootstrapAdmin({ phone } = {}) {
    phone = normalizePhone(phone);
    // Explicit operator CLI bootstrap only. No first-signup or client-selected admin role.
    const user = one('SELECT * FROM store_users WHERE phone=?', phone);
    if (!user) fail('VERIFIED_USER_REQUIRED', '请先使用该手机号完成验证登录，再由操作员授予商家权限', 409);
    transaction(() => { run("UPDATE store_users SET role='admin' WHERE id=?", user.id); audit('operator-bootstrap', 'admin_bootstrap', user.id); });
    return getUser(user.id);
  }
  function designRow(userId, id, version) {
    text(id, '设计编号', 100);
    rawUser(userId); const design = one('SELECT * FROM store_designs WHERE id=? AND user_id=? AND archived_at IS NULL', id, userId);
    if (!design) fail('NOT_FOUND', '没有找到这份设计', 404);
    const v = version ?? design.latest_version; integer(v, '设计版本', 1, 1000000);
    const row = one('SELECT * FROM store_design_versions WHERE design_id=? AND version=?', id, v); if (!row) fail('NOT_FOUND', '没有找到这份设计版本', 404);
    return { ...design, ...row };
  }
  function designView(row) { const gallery = one('SELECT * FROM store_gallery WHERE design_id=? AND version=?', row.design_id, row.version); return { id: row.design_id, version: row.version, name: JSON.parse(row.content_json).name, design: JSON.parse(row.content_json), createdAt: row.created_at, galleryConsent: Boolean(gallery?.consent), galleryPublished: Boolean(gallery?.published) }; }
  const getDesign = (userId, id, version) => designView(designRow(userId, id, version));
  function issueCoupon(userId, amountFen, expiresAt, source, sourceRef) {
    const id = randomUUID(); run('INSERT INTO store_coupons(id,user_id,amount_fen,available_fen,expires_at,created_at,source,source_ref) VALUES (?,?,?,?,?,?,?,?)', id, userId, amountFen, amountFen, expiresAt, clock(), source, sourceRef ?? null);
    run('INSERT INTO store_coupon_ledger VALUES (?,?,?,?,?,?,?)', randomUUID(), id, null, 'issue', amountFen, `issue:${id}`, clock()); return id;
  }
  function rewardReferral(userId, designId, version, design, fingerprint) {
    const user = rawUser(userId); if (!user.referred_by || user.referred_by === user.id || one('SELECT id FROM store_referral_rewards WHERE friend_id=?', user.id)) return { awarded: false };
    if (PRESETS.some((_p, index) => hash(visualDesign(preset(index))) === fingerprint)) return { awarded: false, reason: 'unmodified_preset' };
    if (materialEdits(design, abuse.minimumColorDistance) < abuse.minimumChangedFields) return { awarded: false, reason: 'no_material_edit' };
    if (abuse.preventDuplicateDesigns && one('SELECT id FROM store_referral_rewards WHERE fingerprint=?', fingerprint)) return { awarded: false, reason: 'duplicate_design' };
    const id = randomUUID(), expiresAt = addDays(clock(), STORE_POLICY.referralValidDays);
    run('INSERT INTO store_referral_rewards VALUES (?,?,?,?,?,?,?)', id, user.referred_by, user.id, designId, version, fingerprint, clock());
    issueCoupon(user.id, 500, expiresAt, 'referral_friend', id); issueCoupon(user.referred_by, 500, expiresAt, 'referral_inviter', id);
    return { awarded: true, amountFen: 500, expiresAt };
  }
  function saveDesign(userId, request = {}) {
    rawUser(userId); const design = parseDesign(request.design);
    return operation(userId, request.operationKey, 'save_design', { id: request.id ?? null, design }, () => {
      const usage = one('SELECT COUNT(*) AS versions,COALESCE(SUM(length(CAST(v.content_json AS BLOB))),0) AS bytes FROM store_design_versions v JOIN store_designs d ON d.id=v.design_id WHERE d.user_id=?', userId);
      if (usage.versions >= quota.maxDesignVersions || usage.bytes + Buffer.byteLength(JSON.stringify(design), 'utf8') > quota.maxDesignBytes || (!request.id && one('SELECT COUNT(*) AS count FROM store_designs WHERE user_id=? AND archived_at IS NULL', userId).count >= quota.maxActiveDesigns)) fail('DESIGN_STORAGE_LIMIT', '云端设计空间已满，请先下载方案并联系商家处理', 429);
      const id = request.id ?? randomUUID(); let version = 1; const at = clock();
      if (request.id) { const previous = designRow(userId, id); version = previous.latest_version + 1; run('UPDATE store_designs SET latest_version=?,updated_at=? WHERE id=?', version, at, id); }
      else run('INSERT INTO store_designs(id,user_id,latest_version,created_at,updated_at) VALUES (?,?,?,?,?)', id, userId, 1, at, at);
      const fingerprint = hash(visualDesign(design));
      run('INSERT INTO store_design_versions VALUES (?,?,?,?,?)', id, version, JSON.stringify(design), fingerprint, at);
      // Consent is NEVER inherited from previous versions or inferred from saving.
      run('INSERT INTO store_gallery(design_id,version) VALUES (?,?)', id, version);
      const referral = rewardReferral(userId, id, version, design, fingerprint);
      return { ...getDesign(userId, id, version), referral };
    });
  }
  function page(options = {}) { return { limit: integer(options.limit ?? 100, '分页数量', 1, 100), offset: integer(options.offset ?? 0, '分页起点', 0, 1_000_000) }; }
  function listDesigns(userId, options) { rawUser(userId); const { limit, offset } = page(options); return all('SELECT id FROM store_designs WHERE user_id=? AND archived_at IS NULL ORDER BY updated_at DESC,id LIMIT ? OFFSET ?', userId, limit, offset).map(({ id }) => { const full = getDesign(userId, id); return { ...full, design: publicProjection(full.design), summaryOnly: true }; }); }
  function archiveDesign(userId, { designId } = {}) { return transaction(() => { designRow(userId, designId); run('UPDATE store_designs SET archived_at=? WHERE id=?', clock(), designId); run('UPDATE store_gallery SET consent=0,published=0 WHERE design_id=?', designId); return { id: designId, archived: true }; }); }
  function setGalleryConsent(userId, { designId, version, consent } = {}) {
    if (typeof consent !== 'boolean') fail('EXPLICIT_CONSENT_REQUIRED', '请明确选择是否同意展示');
    return transaction(() => { designRow(userId, designId, version); integer(version, '设计版本', 1, 1000000); run('UPDATE store_gallery SET consent=?,consent_at=?,published=CASE WHEN ?=0 THEN 0 ELSE published END WHERE design_id=? AND version=?', Number(consent), clock(), Number(consent), designId, version); return getDesign(userId, designId, version); });
  }
  function publishGallery(adminId, { designId, version, published } = {}) {
    admin(adminId); if (typeof published !== 'boolean') fail('INVALID_INPUT', '展示状态无效'); integer(version, '设计版本', 1, 1000000);
    return transaction(() => { const row = one('SELECT g.* FROM store_gallery g JOIN store_designs d ON d.id=g.design_id WHERE g.design_id=? AND g.version=? AND d.archived_at IS NULL', designId, version); if (!row) fail('NOT_FOUND', '没有找到设计', 404); if (published && !row.consent) fail('CONSENT_REQUIRED', '顾客尚未授权展示此版本', 409); run('UPDATE store_gallery SET published=?,published_at=?,curated_by=? WHERE design_id=? AND version=?', Number(published), published ? clock() : null, adminId, designId, version); audit(adminId, 'gallery_publish', designId, { version, published }); return { designId, version, published }; });
  }
  function listGallery(options) { const { limit, offset } = page(options); return all('SELECT g.design_id,g.version FROM store_gallery g JOIN store_designs d ON d.id=g.design_id WHERE g.consent=1 AND g.published=1 AND d.archived_at IS NULL ORDER BY g.published_at DESC,g.design_id,g.version LIMIT ? OFFSET ?', limit, offset).map(row => ({ id: `${row.design_id}:${row.version}`, version: row.version, design: publicProjection(JSON.parse(one('SELECT content_json FROM store_design_versions WHERE design_id=? AND version=?', row.design_id, row.version).content_json)) })); }
  function listGalleryCandidates(adminId, options) { admin(adminId); const { limit, offset } = page(options); return all('SELECT g.design_id,g.version,g.published FROM store_gallery g JOIN store_designs d ON d.id=g.design_id WHERE g.consent=1 AND d.archived_at IS NULL ORDER BY g.consent_at DESC,g.design_id,g.version LIMIT ? OFFSET ?', limit, offset).map(row => ({ designId: row.design_id, version: row.version, published: Boolean(row.published), design: publicProjection(JSON.parse(one('SELECT content_json FROM store_design_versions WHERE design_id=? AND version=?', row.design_id, row.version).content_json)) })); }
  function couponView(row) { const spendable = !row.revoked_at && row.expires_at > clock(); return { id: row.id, userId: row.user_id, amountFen: row.amount_fen, availableFen: row.available_fen, spendableFen: spendable ? row.available_fen : 0, reservedFen: row.reserved_fen, redeemedFen: row.redeemed_fen, expiresAt: row.expires_at, source: row.source, status: row.revoked_at ? 'revoked' : row.expires_at <= clock() ? 'expired' : row.available_fen ? 'available' : row.reserved_fen ? 'reserved' : 'redeemed' }; }
  function listCoupons(userId, options) { rawUser(userId); const { limit, offset } = page(options); return all('SELECT * FROM store_coupons WHERE user_id=? ORDER BY (revoked_at IS NOT NULL), (expires_at<=?),expires_at,created_at,id LIMIT ? OFFSET ?', userId, clock(), limit, offset).map(couponView); }
  function getReferralSummary(userId) { const user = rawUser(userId); return { inviteCode: user.invite_code, rewardedInvites: one('SELECT COUNT(*) AS count FROM store_referral_rewards WHERE inviter_id=?', userId).count, rewardFen: 500, couponRewardFen: 500, validDays: 90, perOrderCapFen: 3000, notice: '新手机号验证后，首次完成有效修改并保存，双方各获5元券；仅改名、初始方案及重复方案不计入。规则降低滥用风险，无法证明真实身份。' }; }
  function adminGrantCoupon(adminId, request = {}) {
    admin(adminId); rawUser(request.userId); const amount = integer(request.amountFen, '抵扣券金额', 1, 100000), expiresAt = validDate(request.expiresAt); if (expiresAt <= clock()) fail('INVALID_INPUT', '有效期必须晚于当前时间'); const reason = text(request.reason, '发券原因', 300);
    return operation(adminId, request.operationKey, 'grant_coupon', { userId: request.userId, amount, expiresAt, reason }, () => { const id = issueCoupon(request.userId, amount, expiresAt, 'merchant', adminId); audit(adminId, 'grant_coupon', id, { reason }); return couponView(one('SELECT * FROM store_coupons WHERE id=?', id)); });
  }
  function adminRevokeCoupon(adminId, { couponId, reason } = {}) { admin(adminId); reason = text(reason, '停用原因', 300); return transaction(() => { const coupon = one('SELECT * FROM store_coupons WHERE id=?', couponId); if (!coupon) fail('NOT_FOUND', '未找到抵扣券', 404); if (coupon.reserved_fen > 0) fail('COUPON_RESERVED', '抵扣券已被订单占用，请先取消未付款订单', 409); run('UPDATE store_coupons SET revoked_at=? WHERE id=?', clock(), couponId); audit(adminId, 'revoke_coupon', couponId, { reason }); return couponView(one('SELECT * FROM store_coupons WHERE id=?', couponId)); }); }
  function orderRow(id) { text(id, '订单编号', 100); return one('SELECT * FROM store_orders WHERE id=?', id) ?? fail('NOT_FOUND', '没有找到订单', 404); }
  function ownedOrder(userId, id) { rawUser(userId); const row = orderRow(id); if (row.user_id !== userId) fail('NOT_FOUND', '没有找到订单', 404); return row; }
  function orderView(row, summaryOnly = false) {
    const materials = all('SELECT * FROM store_material_confirmations WHERE order_id=? ORDER BY version DESC', row.id).map(m => ({ version: m.version, note: m.note, photoRefs: JSON.parse(m.photo_refs_json), createdAt: m.created_at }));
    return { id: row.id, userId: row.user_id, kind: row.kind, product: row.product, quantity: row.quantity, designId: row.design_id, designVersion: row.design_version, ...(summaryOnly ? { summaryOnly: true } : { designSnapshot: JSON.parse(row.snapshot_json) }), checkout: JSON.parse(row.checkout_json), status: row.status, currency: 'CNY', pricingVersion: row.pricing_version, unitPriceFen: row.unit_price_fen, goodsTotalFen: row.goods_total_fen, discountFen: row.discount_fen, goodsPayableFen: row.goods_total_fen === null ? null : row.goods_total_fen - row.discount_fen, shippingFen: row.shipping_fen, shippingState: row.shipping_state, shippingVersion: row.shipping_version, acceptedShippingVersion: row.accepted_shipping_version, totalFen: row.goods_total_fen === null || row.shipping_fen === null ? null : row.goods_total_fen - row.discount_fen + row.shipping_fen, quoteVersion: row.quote_version, acceptedQuoteVersion: row.accepted_quote_version, materialVersion: row.material_version, acceptedMaterialVersion: row.accepted_material_version, materials, createdAt: row.created_at, updatedAt: row.updated_at, paidAt: row.paid_at, goodsRefundedFen: row.goods_refunded_fen, shippingRefundedFen: row.shipping_refunded_fen, couponReturnedFen: row.coupon_returned_fen, production: { startedAt: row.production_started_at, earliestAt: row.production_earliest_at, latestAt: row.production_latest_at, calendarDays: row.kind === 'standard' ? [1, 2] : [5, 7] }, shipment: row.dispatched_at ? { carrier: row.carrier, tracking: row.tracking, dispatchedAt: row.dispatched_at } : null, paymentEnabled: false };
  }
  const getOrder = (userId, id) => orderView(ownedOrder(userId, id));
  function getAdminOrder(adminId, id) { admin(adminId); return orderView(orderRow(id)); }
  function listOrders(userId, options) { rawUser(userId); const { limit, offset } = page(options); return all('SELECT id FROM store_orders WHERE user_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?', userId, limit, offset).map(({ id }) => orderView(orderRow(id), true)); }
  function listAdminOrders(adminId, options) { admin(adminId); const { limit, offset } = page(options); return all('SELECT id FROM store_orders ORDER BY created_at DESC,id LIMIT ? OFFSET ?', limit, offset).map(({ id }) => orderView(orderRow(id), true)); }
  function notifyOrder(order, event) {
    // Persist a logical destination only. The delivery adapter reads the private recipient configuration.
    const payload = { orderRef: order.id, product: order.kind === 'standard' ? order.product : order.kind === 'custom' ? '自由定制' : '特殊需求待报价', amountFen: order.goods_total_fen === null ? null : order.goods_total_fen - order.discount_fen, currency: 'CNY', adminLink: `/admin?order=${encodeURIComponent(order.id)}`, event };
    run('INSERT OR IGNORE INTO store_outbox(id,event_key,recipient,payload_json,next_attempt_at,created_at) VALUES (?,?,?,?,?,?)', randomUUID(), `${event}:${order.id}`, 'merchant', JSON.stringify(payload), clock(), clock());
  }
  function reserveCoupons(userId, orderId, goodsTotal) {
    let remaining = Math.min(STORE_POLICY.couponCapFen, goodsTotal), total = 0;
    const coupons = all('SELECT * FROM store_coupons WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND available_fen>0 ORDER BY expires_at,created_at,id', userId, clock());
    for (const coupon of coupons) { if (!remaining) break; const amount = Math.min(remaining, coupon.available_fen); run('UPDATE store_coupons SET available_fen=available_fen-?,reserved_fen=reserved_fen+? WHERE id=? AND available_fen>=?', amount, amount, coupon.id, amount); run("INSERT INTO store_coupon_allocations(order_id,coupon_id,amount_fen,state) VALUES (?,?,?,'reserved')", orderId, coupon.id, amount); run('INSERT INTO store_coupon_ledger VALUES (?,?,?,?,?,?,?)', randomUUID(), coupon.id, orderId, 'reserve', amount, `reserve:${orderId}:${coupon.id}`, clock()); remaining -= amount; total += amount; }
    return total;
  }
  function createOrder(userId, request = {}) {
    rawUser(userId); const quantity = integer(request.quantity ?? 1, '数量', 1, 100); if (!['standard', 'custom', 'bespoke'].includes(request.kind)) fail('INVALID_PRODUCT', '商品类型无效');
    if (request.useCoupons !== undefined && typeof request.useCoupons !== 'boolean') fail('INVALID_INPUT', '抵扣券选择无效');
    const checkout = { name: text(request.checkout?.name, '收货姓名', 80), phone: normalizePhone(request.checkout?.phone), address: text(request.checkout?.address, '收货地址', 500) };
    return operation(userId, request.operationKey, 'create_order', { ...request, checkout }, () => {
      const pricing = getPricing();
      let kind = request.kind, snapshot, product, unitPrice, designId = null, designVersion = null;
      if (kind === 'standard') { const stock = STOCK_PRODUCTS.find(p => p.id === request.stockId); if (!stock) fail('INVALID_PRODUCT', '请选择有效的现有款'); product = stock.name; unitPrice = pricing.standardFen; snapshot = { type: 'stock', stockId: stock.id, product: stock.name, material: 'grain' }; }
      else { const design = designRow(userId, request.designId, request.designVersion); const content = JSON.parse(design.content_json); if (PARTS.some(p => content.parts[p].material !== 'grain')) fail('MATERIAL_UNAVAILABLE', '第一阶段新订单仅支持细纹皮革；原设计可继续保存'); if (needsBespoke(content)) kind = 'bespoke'; snapshot = content; designId = design.design_id; designVersion = design.version; product = kind === 'custom' ? '自由定制' : '特殊需求待报价'; unitPrice = kind === 'custom' ? pricing.customFen : null; }
      if (unitPrice !== null) {
        if (request.expectedPricingVersion === undefined || request.expectedUnitPriceFen === undefined) fail('PRICE_CONFIRMATION_REQUIRED', '请先读取并确认当前商品价格，再保存订单。', 409, { pricing });
        integer(request.expectedPricingVersion, '确认价格版本', 1, Number.MAX_SAFE_INTEGER);
        integer(request.expectedUnitPriceFen, '确认商品单价', 1, MAX_UNIT_PRICE_FEN);
        if (request.expectedPricingVersion !== pricing.version || request.expectedUnitPriceFen !== unitPrice) fail('PRICE_CHANGED', '商品价格已变化，请核对最新金额并重新确认。', 409, { pricing });
      }
      const id = randomUUID(), at = clock(), goodsTotal = unitPrice === null ? null : unitPrice * quantity;
      run('INSERT INTO store_orders(id,user_id,kind,product,quantity,design_id,design_version,snapshot_json,checkout_json,status,unit_price_fen,goods_total_fen,pricing_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, userId, kind, product, quantity, designId, designVersion, JSON.stringify(snapshot), JSON.stringify(checkout), kind === 'bespoke' ? 'quote_pending' : 'awaiting_confirmation', unitPrice, goodsTotal, unitPrice === null ? null : pricing.version, at, at);
      if (request.useCoupons && goodsTotal !== null) { const discount = reserveCoupons(userId, id, goodsTotal); run('UPDATE store_orders SET discount_fen=? WHERE id=?', discount, id); }
      notifyOrder(orderRow(id), 'order_created'); return getOrder(userId, id);
    });
  }
  function cancelOrder(userId, request = {}) {
    rawUser(userId); return operation(userId, request.operationKey, 'cancel_order', { orderId: request.orderId }, () => { const order = ownedOrder(userId, request.orderId); if (order.paid_at) fail('PAID_ORDER', '已付款订单需要核实退款后处理', 409); if (order.status === 'cancelled') return orderView(order);
      for (const allocation of all("SELECT * FROM store_coupon_allocations WHERE order_id=? AND state='reserved'", order.id)) { run('UPDATE store_coupons SET available_fen=available_fen+?,reserved_fen=reserved_fen-? WHERE id=?', allocation.amount_fen, allocation.amount_fen, allocation.coupon_id); run("UPDATE store_coupon_allocations SET state='released' WHERE order_id=? AND coupon_id=?", order.id, allocation.coupon_id); run('INSERT INTO store_coupon_ledger VALUES (?,?,?,?,?,?,?)', randomUUID(), allocation.coupon_id, order.id, 'release', allocation.amount_fen, `release:${order.id}:${allocation.coupon_id}`, clock()); }
      run("UPDATE store_orders SET status='cancelled',updated_at=? WHERE id=?", clock(), order.id); return getOrder(userId, order.id); });
  }
  function editableOrder(order) { if (order.paid_at || ['cancelled', 'refunded', 'shipped'].includes(order.status)) fail('ORDER_NOT_EDITABLE', '订单当前不能修改确认内容', 409); }
  function refreshReadyStatus(id) {
    const order = orderRow(id); if (['cancelled', 'refunded', 'in_production', 'shipped'].includes(order.status)) return;
    let status;
    if (order.paid_at) status = order.kind === 'standard' || (order.material_version > 0 && order.accepted_material_version === order.material_version) ? 'ready_for_production' : 'awaiting_material';
    else if (order.kind === 'bespoke' && order.accepted_quote_version !== order.quote_version) status = 'quote_pending';
    else if (order.goods_total_fen === null) status = 'quote_pending';
    else status = order.shipping_state === 'confirmed' ? 'awaiting_payment' : 'awaiting_confirmation';
    run('UPDATE store_orders SET status=?,updated_at=? WHERE id=?', status, clock(), id);
    if (order.paid_at && status === 'ready_for_production') {
      const basis = order.kind === 'standard' ? order.paid_at : [order.paid_at, order.material_accepted_at].sort().at(-1);
      run('UPDATE store_orders SET production_earliest_at=?,production_latest_at=? WHERE id=?', addDays(basis, order.kind === 'standard' ? 1 : 5), addDays(basis, order.kind === 'standard' ? 2 : 7), id);
    }
  }
  function adminSetShippingQuote(adminId, { orderId, shippingFen } = {}) {
    admin(adminId); integer(shippingFen, '运费', 0, 1_000_000);
    return transaction(() => { const order = orderRow(orderId); editableOrder(order); run("UPDATE store_orders SET shipping_fen=?,shipping_version=shipping_version+1,accepted_shipping_version=NULL,shipping_state='awaiting_customer_confirmation',updated_at=? WHERE id=?", shippingFen, clock(), orderId); refreshReadyStatus(orderId); audit(adminId, 'shipping_quote', orderId, { shippingFen }); return getAdminOrder(adminId, orderId); });
  }
  function acceptShippingQuote(userId, { orderId, version } = {}) {
    integer(version, '运费版本', 1, 1000000);
    return transaction(() => { const order = ownedOrder(userId, orderId); editableOrder(order); if (order.shipping_version !== version || order.shipping_fen === null) fail('STALE_VERSION', '请确认最新运费', 409); run("UPDATE store_orders SET accepted_shipping_version=?,shipping_state='confirmed',updated_at=? WHERE id=?", version, clock(), orderId); refreshReadyStatus(orderId); return getOrder(userId, orderId); });
  }
  function adminSetQuote(adminId, { orderId, unitPriceFen } = {}) {
    admin(adminId); integer(unitPriceFen, '商品单价', 1, 1_000_000);
    return transaction(() => { const order = orderRow(orderId); editableOrder(order); if (order.kind !== 'bespoke') fail('FIXED_PRICE', '现有款和配色定制保留创建订单时的价格快照', 409); if (order.accepted_quote_version !== null) fail('QUOTE_ACCEPTED', '已确认报价不可覆盖，请取消后重新建单', 409); run('UPDATE store_orders SET unit_price_fen=?,goods_total_fen=?,quote_version=quote_version+1,accepted_quote_version=NULL,updated_at=? WHERE id=?', unitPriceFen, unitPriceFen * order.quantity, clock(), orderId); refreshReadyStatus(orderId); audit(adminId, 'bespoke_quote', orderId, { unitPriceFen }); return getAdminOrder(adminId, orderId); });
  }
  function acceptQuote(userId, request = {}) {
    rawUser(userId); integer(request.version, '报价版本', 1, 1000000); if (request.useCoupons !== undefined && typeof request.useCoupons !== 'boolean') fail('INVALID_INPUT', '抵扣券选择无效');
    return operation(userId, request.operationKey, 'accept_quote', { orderId: request.orderId, version: request.version, useCoupons: Boolean(request.useCoupons) }, () => { const order = ownedOrder(userId, request.orderId); editableOrder(order); if (order.kind !== 'bespoke' || order.quote_version !== request.version || order.goods_total_fen === null) fail('STALE_VERSION', '请确认最新报价', 409); if (order.accepted_quote_version === request.version) return getOrder(userId, order.id); if (request.useCoupons) fail('COUPON_PRODUCT_INELIGIBLE', '抵扣券仅适用于现有款及配色定制，特殊工艺报价不参与抵扣'); const discount = 0; run('UPDATE store_orders SET accepted_quote_version=?,discount_fen=? WHERE id=?', request.version, discount, order.id); refreshReadyStatus(order.id); return getOrder(userId, order.id); });
  }
  function proposeMaterial(adminId, { orderId, note, photoRefs } = {}) {
    admin(adminId); note = text(note, '材料说明', 2000); if (!Array.isArray(photoRefs) || photoRefs.length < 1 || photoRefs.length > 12 || photoRefs.some(ref => typeof ref !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ref)) || new Set(photoRefs).size !== photoRefs.length) fail('INVALID_PHOTO_REFS', '请附上1至12张私有材料照片');
    return transaction(() => { const order = orderRow(orderId); if (order.kind === 'standard' || ['cancelled', 'refunded', 'in_production', 'shipped'].includes(order.status)) fail('MATERIAL_NOT_EDITABLE', '订单当前不能修改材料确认', 409); const version = order.material_version + 1;
      run('INSERT INTO store_material_confirmations VALUES (?,?,?,?,?,?)', orderId, version, note, JSON.stringify(photoRefs), adminId, clock());
      run('UPDATE store_orders SET material_version=?,accepted_material_version=NULL,material_accepted_at=NULL,production_earliest_at=NULL,production_latest_at=NULL,updated_at=? WHERE id=?', version, clock(), orderId); refreshReadyStatus(orderId); audit(adminId, 'material_proposal', orderId, { version }); return getAdminOrder(adminId, orderId); });
  }
  function acceptMaterial(userId, { orderId, version } = {}) {
    integer(version, '材料版本', 1, 1000000);
    return transaction(() => { const order = ownedOrder(userId, orderId); if (['cancelled', 'refunded', 'in_production', 'shipped'].includes(order.status)) fail('ORDER_NOT_EDITABLE', '订单当前不能确认材料', 409); if (order.material_version !== version || !one('SELECT version FROM store_material_confirmations WHERE order_id=? AND version=?', orderId, version)) fail('STALE_VERSION', '材料已更新，请确认最新照片与说明', 409); if (order.accepted_material_version === version) return getOrder(userId, orderId); run('UPDATE store_orders SET accepted_material_version=?,material_accepted_at=?,updated_at=? WHERE id=?', version, clock(), clock(), orderId); refreshReadyStatus(orderId); return getOrder(userId, orderId); });
  }
  function canReadMaterialPhoto(userId, objectId) {
    const user = rawUser(userId); if (user.role === 'admin') return true;
    return all('SELECT m.photo_refs_json FROM store_material_confirmations m JOIN store_orders o ON o.id=m.order_id WHERE o.user_id=?', userId).some(row => JSON.parse(row.photo_refs_json).includes(objectId));
  }
  function startProduction(adminId, { orderId } = {}) {
    admin(adminId); return transaction(() => { const order = orderRow(orderId); if (order.status === 'in_production') return getAdminOrder(adminId, orderId); if (!order.paid_at || order.status !== 'ready_for_production' || order.goods_refunded_fen > 0) fail('PRODUCTION_NOT_READY', '请先核实付款并完成最新材料确认', 409); if (order.kind !== 'standard' && (!order.material_version || order.accepted_material_version !== order.material_version)) fail('MATERIAL_CONFIRMATION_REQUIRED', '顾客需要确认最新材料版本', 409); run("UPDATE store_orders SET status='in_production',production_started_at=?,updated_at=? WHERE id=?", clock(), clock(), orderId); audit(adminId, 'start_production', orderId); notifyOrder(orderRow(orderId), 'production_started'); return getAdminOrder(adminId, orderId); });
  }
  function dispatchOrder(adminId, { orderId, carrier, tracking } = {}) {
    admin(adminId); carrier = text(carrier, '承运商', 80); tracking = text(tracking, '物流单号', 120);
    return transaction(() => { const order = orderRow(orderId); if (order.status === 'shipped' && order.carrier === carrier && order.tracking === tracking) return getAdminOrder(adminId, orderId); if (order.status !== 'in_production' || !order.paid_at || order.goods_refunded_fen > 0) fail('DISPATCH_NOT_READY', '订单尚未满足发货条件', 409); run("UPDATE store_orders SET status='shipped',carrier=?,tracking=?,dispatched_at=?,updated_at=? WHERE id=?", carrier, tracking, clock(), clock(), orderId); audit(adminId, 'dispatch', orderId, { carrier, tracking }); notifyOrder(orderRow(orderId), 'order_dispatched'); return getAdminOrder(adminId, orderId); });
  }
  function providerEvent(type, request, fn) {
    text(request.eventId, '服务商事件编号', 200); const digest = hash(request);
    return transaction(() => { const prior = one('SELECT * FROM store_provider_events WHERE event_id=?', request.eventId); if (prior) { if (prior.type !== type || prior.request_hash !== digest) fail('EVENT_CONFLICT', '服务商事件内容冲突', 409); return JSON.parse(prior.response_json); } const result = fn(); run('INSERT INTO store_provider_events VALUES (?,?,?,?,?)', request.eventId, type, digest, JSON.stringify(result), clock()); return result; });
  }
  function confirmPayment(request = {}) {
    integer(request.amountFen, '核实付款金额', 0, 101_000_000); text(request.providerReference, '核实付款流水号', 200);
    return providerEvent('payment', request, () => {
      const order = orderRow(request.orderId);
      if (order.paid_at) { if (order.payment_reference === request.providerReference && order.payment_amount_fen === request.amountFen) return orderView(order); fail('ALREADY_PAID', '订单已关联其他付款事件', 409); }
      if (order.status === 'cancelled' || order.goods_total_fen === null || order.shipping_state !== 'confirmed' || order.shipping_fen === null || order.accepted_shipping_version !== order.shipping_version || (order.kind === 'bespoke' && (order.quote_version === 0 || order.accepted_quote_version !== order.quote_version))) fail('ORDER_NOT_PAYABLE', '报价或运费尚未确认，不能记为已付款', 409);
      const expected = order.goods_total_fen - order.discount_fen + order.shipping_fen; if (expected !== request.amountFen) fail('PAYMENT_AMOUNT_MISMATCH', '核实金额与应付总额不一致', 409);
      if (one('SELECT id FROM store_orders WHERE payment_reference=?', request.providerReference)) fail('PAYMENT_REFERENCE_USED', '付款流水号已用于其他订单', 409);
      if (one("SELECT a.coupon_id FROM store_coupon_allocations a JOIN store_coupons c ON c.id=a.coupon_id WHERE a.order_id=? AND a.state='reserved' AND (c.expires_at<=? OR c.revoked_at IS NOT NULL)", order.id, clock())) fail('COUPON_RESERVATION_EXPIRED', '抵扣券已过期，请人工核对付款金额；不能直接标记已付款', 409);
      for (const allocation of all("SELECT * FROM store_coupon_allocations WHERE order_id=? AND state='reserved'", order.id)) {
        run('UPDATE store_coupons SET reserved_fen=reserved_fen-?,redeemed_fen=redeemed_fen+? WHERE id=?', allocation.amount_fen, allocation.amount_fen, allocation.coupon_id);
        run("UPDATE store_coupon_allocations SET state='redeemed' WHERE order_id=? AND coupon_id=?", order.id, allocation.coupon_id);
        run('INSERT INTO store_coupon_ledger VALUES (?,?,?,?,?,?,?)', randomUUID(), allocation.coupon_id, order.id, 'redeem', allocation.amount_fen, `redeem:${order.id}:${allocation.coupon_id}`, clock());
      }
      run('UPDATE store_orders SET paid_at=?,payment_reference=?,payment_amount_fen=?,updated_at=? WHERE id=?', clock(), request.providerReference, request.amountFen, clock(), order.id); refreshReadyStatus(order.id); notifyOrder(orderRow(order.id), 'payment_verified'); return orderView(orderRow(order.id));
    });
  }
  function confirmRefund(request = {}) {
    // goodsRefundFen is PRE-DISCOUNT goods value returned, not cash. The returned
    // cash amount is computed below; adapters must reconcile provider cash amount.
    integer(request.goodsRefundFen, '退款商品原价金额', 0, 100_000_000); integer(request.shippingRefundFen ?? 0, '退款运费', 0, 1_000_000);
    if (!['customer_request', 'merchant_unable', 'other'].includes(request.reason)) fail('INVALID_INPUT', '退款原因无效');
    if (request.goodsRefundFen + (request.shippingRefundFen ?? 0) === 0) fail('INVALID_INPUT', '退款金额必须大于零');
    return providerEvent('refund', request, () => {
      const order = orderRow(request.orderId); if (!order.paid_at) fail('NOT_PAID', '订单没有核实付款记录', 409);
      const goodsTotal = order.goods_refunded_fen + request.goodsRefundFen, shippingTotal = order.shipping_refunded_fen + (request.shippingRefundFen ?? 0);
      if (goodsTotal > order.goods_total_fen || shippingTotal > order.shipping_fen) fail('REFUND_TOO_LARGE', '累计退款不能超过订单金额', 409);
      const targetCouponReturn = Math.floor(order.discount_fen * goodsTotal / order.goods_total_fen), deltaCoupon = targetCouponReturn - order.coupon_returned_fen;
      const cashRefundFen = request.goodsRefundFen - deltaCoupon + (request.shippingRefundFen ?? 0);
      if (request.cashRefundFen !== undefined && request.cashRefundFen !== cashRefundFen) fail('REFUND_AMOUNT_MISMATCH', '服务商现金退款与分摊金额不一致', 409);
      const allocations = all("SELECT a.*,c.expires_at FROM store_coupon_allocations a JOIN store_coupons c ON c.id=a.coupon_id WHERE a.order_id=? AND a.state='redeemed' ORDER BY c.expires_at,c.created_at,c.id", order.id).map(row => ({ ...row, delta: 0 }));
      // Cumulative proportional allocation, one fen at a time. Largest deficit
      // gives deterministic rounding and no negative returns across partial events.
      for (let fen = 0; fen < deltaCoupon; fen++) {
        let selected = null, deficit = -Infinity;
        for (const a of allocations) { if (a.returned_fen + a.delta >= a.amount_fen) continue; const d = a.amount_fen * goodsTotal / order.goods_total_fen - a.returned_fen - a.delta; if (d > deficit) { selected = a; deficit = d; } }
        if (!selected) throw new Error('Coupon allocation invariant failed'); selected.delta++;
      }
      for (const a of allocations.filter(a => a.delta > 0)) {
        const reissue = request.reason === 'merchant_unable' && a.expires_at <= clock();
        if (reissue) {
          // Keep the old redemption as historical consumption and reissue only the
          // returned tranche. Unspent expired balance must not be revived.
          issueCoupon(order.user_id, a.delta, addDays(clock(), 30), 'refund_return', `${request.eventId}:${a.coupon_id}`);
        } else run('UPDATE store_coupons SET available_fen=available_fen+?,redeemed_fen=redeemed_fen-? WHERE id=?', a.delta, a.delta, a.coupon_id);
        run('UPDATE store_coupon_allocations SET returned_fen=returned_fen+? WHERE order_id=? AND coupon_id=?', a.delta, order.id, a.coupon_id);
        run('INSERT INTO store_coupon_ledger VALUES (?,?,?,?,?,?,?)', randomUUID(), a.coupon_id, order.id, reissue ? 'refund_reissue' : 'refund_return', a.delta, `refund:${request.eventId}:${a.coupon_id}`, clock());
      }
      const full = goodsTotal === order.goods_total_fen && shippingTotal === order.shipping_fen;
      run('UPDATE store_orders SET goods_refunded_fen=?,shipping_refunded_fen=?,coupon_returned_fen=?,status=?,updated_at=? WHERE id=?', goodsTotal, shippingTotal, targetCouponReturn, full ? 'refunded' : order.status, clock(), order.id);
      audit('verified-provider', 'refund', order.id, { eventId: request.eventId, goodsRefundFen: request.goodsRefundFen, shippingRefundFen: request.shippingRefundFen ?? 0, couponReturnedFen: deltaCoupon, cashRefundFen, reason: request.reason });
      return { order: orderView(orderRow(order.id)), cashRefundFen, couponReturnedFen: deltaCoupon, fullRefund: full };
    });
  }
  function listPendingOutbox({ limit = 20 } = {}) {
    integer(limit, '批次数量', 1, 100);
    return all("SELECT * FROM store_outbox WHERE status='pending' AND delivery_token IS NULL AND delivery_requires_review=0 AND next_attempt_at<=? ORDER BY created_at,id LIMIT ?", clock(), limit)
      .map(row => ({ id: row.id, eventKey: row.event_key, recipient: row.recipient, payload: JSON.parse(row.payload_json), attempts: row.attempts, nextAttemptAt: row.next_attempt_at }));
  }
  function claimOutbox({ id } = {}) {
    const token = randomUUID(); const claimedAt = clock();
    const result = run("UPDATE store_outbox SET delivery_token=?,delivery_claimed_at=? WHERE id=? AND status='pending' AND delivery_token IS NULL AND delivery_requires_review=0 AND next_attempt_at<=?", token, claimedAt, id, claimedAt);
    return result.changes ? { id, token } : null;
  }
  function listHeldOutbox({ limit = 20 } = {}) {
    integer(limit, '批次数量', 1, 100);
    return all("SELECT id,event_key AS eventKey,attempts,delivery_claimed_at AS claimedAt,last_error AS error FROM store_outbox WHERE status='pending' AND (delivery_token IS NOT NULL OR delivery_requires_review=1) ORDER BY created_at,id LIMIT ?", limit);
  }
  function recordOutboxResult({ id, success, error, deliveryToken } = {}) {
    if (typeof success !== 'boolean') fail('INVALID_INPUT', '发送结果无效');
    return transaction(() => {
      const row = one('SELECT * FROM store_outbox WHERE id=?', id);
      if (!row) fail('NOT_FOUND', '没有找到通知', 404);
      if (row.status === 'sent') return { id, status: 'sent' };
      if (row.delivery_requires_review || (row.delivery_token && row.delivery_token !== deliveryToken) || (!row.delivery_token && deliveryToken)) fail('DELIVERY_CLAIM_MISMATCH', '通知需核对当前投递状态', 409);
      const next = new Date(Date.parse(clock()) + Math.min(24 * 3600000, 60000 * 2 ** Math.min(row.attempts, 11))).toISOString();
      // Do not retain provider errors containing addresses, request bodies or secrets.
      const safeError = success ? null : typeof error === 'string' && /^[A-Z_]{1,64}$/.test(error) ? error : 'DELIVERY_FAILED';
      const held = !success && safeError === 'DELIVERY_UNCERTAIN';
      run('UPDATE store_outbox SET status=?,attempts=attempts+1,next_attempt_at=?,last_error=?,sent_at=?,delivery_token=NULL,delivery_requires_review=? WHERE id=?', success ? 'sent' : 'pending', next, safeError, success ? clock() : null, held ? 1 : 0, id);
      return { id, status: success ? 'sent' : held ? 'review_required' : 'pending', nextAttemptAt: success || held ? null : next };
    });
  }
  // Operator-only reconciliation after checking the provider; never exposed through HTTP.
  function reconcileOutbox({ id, accepted, confirmation } = {}) {
    if (typeof accepted !== 'boolean' || confirmation !== 'provider-result-reviewed') fail('REVIEW_REQUIRED', '须先核对供应商投递结果', 409);
    return transaction(() => {
      const row = one('SELECT * FROM store_outbox WHERE id=?', id);
      if (!row) fail('NOT_FOUND', '没有找到通知', 404);
      if (row.status === 'sent') return { id, status: 'sent' };
      if (!row.delivery_token && !row.delivery_requires_review) fail('NOT_HELD', '该通知未等待人工核对', 409);
      run('UPDATE store_outbox SET status=?,sent_at=?,delivery_token=NULL,delivery_requires_review=0,next_attempt_at=?,last_error=? WHERE id=?', accepted ? 'sent' : 'pending', accepted ? clock() : null, clock(), accepted ? null : 'OPERATOR_RETRY_APPROVED', id);
      audit('operator', 'notification_reconciled', id, { accepted });
      return { id, status: accepted ? 'sent' : 'pending' };
    });
  }
  return {
    db, close: () => db.close(), getListCounts: userId => { rawUser(userId); return { designs: one('SELECT COUNT(*) AS n FROM store_designs WHERE user_id=? AND archived_at IS NULL', userId).n, orders: one('SELECT COUNT(*) AS n FROM store_orders WHERE user_id=?', userId).n, coupons: one('SELECT COUNT(*) AS n FROM store_coupons WHERE user_id=?', userId).n }; }, getAdminListCounts: adminId => { admin(adminId); return { orders: one('SELECT COUNT(*) AS n FROM store_orders').n, coupons: one('SELECT COUNT(*) AS n FROM store_coupons').n, designs: one('SELECT COUNT(*) AS n FROM store_gallery g JOIN store_designs d ON d.id=g.design_id WHERE g.consent=1 AND d.archived_at IS NULL').n }; }, getGalleryCount: () => one('SELECT COUNT(*) AS n FROM store_gallery g JOIN store_designs d ON d.id=g.design_id WHERE g.consent=1 AND g.published=1 AND d.archived_at IS NULL').n, policy: STORE_POLICY, get stockProducts() { const price = getPricing().standardFen; return STOCK_PRODUCTS.map(p => ({...p, unitPriceFen: price})); }, getPricing, adminUpdatePricing, listPricingAudit,
    getUser, findUserByPhone: phone => { const user = one('SELECT * FROM store_users WHERE phone=?', normalizePhone(phone)); return user ? userView(user) : null; }, registerVerifiedUser, bootstrapAdmin,
    saveDesign, getDesign, listDesigns, archiveDesign, deleteDesign: archiveDesign, setGalleryConsent, publishGallery, listGallery, listGalleryCandidates, listAdminDesigns: listGalleryCandidates,
    listCoupons, getReferralSummary, adminGrantCoupon, adminRevokeCoupon, listAdminCoupons: (adminId, options) => { admin(adminId); const { limit, offset } = page(options); return all('SELECT * FROM store_coupons ORDER BY (revoked_at IS NOT NULL),(expires_at<=?),expires_at,id LIMIT ? OFFSET ?', clock(), limit, offset).map(couponView); },
    createOrder, getOrder, listOrders, getAdminOrder, adminGetOrder: getAdminOrder, listAdminOrders, adminListOrders: listAdminOrders, cancelOrder,
    adminSetShippingQuote, acceptShippingQuote, adminSetQuote, acceptQuote, proposeMaterial, acceptMaterial, canReadMaterialPhoto, startProduction, dispatchOrder, adminDispatch: dispatchOrder,
    internal: Object.freeze({ confirmPayment, confirmRefund, listPendingOutbox, claimOutbox, listHeldOutbox, recordOutboxResult, reconcileOutbox }),
  };
}
export const createStoreDomain = ({ dbPath, ...options } = {}) => createStore({ ...options, ...(dbPath ? { filename: dbPath } : {}) });
