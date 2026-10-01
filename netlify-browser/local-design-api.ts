import {designSchema} from '../lib/schema';
import type {Design} from '../lib/design';

const DATABASE = 'dlcj-saved-designs';
const STORE = 'designs';
const MAX_BYTES = 12_000_000;
type SavedDesign = {id: string; date: string; design: Design};
const json = (data: unknown, status = 200) => Response.json(data, {status});

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let finished = false;
    const timer = setTimeout(() => {finished = true; reject(new Error('本机存储暂时无法打开，请关闭其他页面后重试。'));}, 8000);
    request.onupgradeneeded = () => {if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, {keyPath: 'id'});};
    request.onsuccess = () => {clearTimeout(timer); if (finished) request.result.close(); else resolve(request.result);};
    request.onerror = () => {clearTimeout(timer); reject(request.error);};
  });
}

async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      // Resolve only after commit, so a failed/quota-exceeded write never looks saved.
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? request.error);
    });
  } finally {db.close();}
}

/** A narrow in-process adapter. Never intercepts global fetch or sends designs off-device. */
export const localDesignRequest: typeof fetch = async (input, init) => {
  try {
    const req = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), window.location.origin), init);
    const url = new URL(req.url);
    if (url.origin !== window.location.origin || url.pathname !== '/api/designs') return json({error: '不支持的本机存储请求。'}, 400);
    if (req.method === 'POST') {
      const text = await req.text();
      if (new Blob([text]).size > MAX_BYTES) return json({error: '设计素材过大，请减少图片后重试。'}, 413);
      let raw: unknown;
      try {raw = JSON.parse(text);} catch {return json({error: '设计文件无法读取。'}, 400);}
      const parsed = designSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.name.trim()) return json({error: '设计数据不完整或素材超出限制。'}, 400);
      const record: SavedDesign = {id: crypto.randomUUID(), date: new Date().toISOString(), design: parsed.data};
      await transaction('readwrite', store => store.put(record));
      return json({id: record.id, date: record.date});
    }
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id !== null) {
        if (!/^[a-f0-9-]{36}$/.test(id)) return json({error: '方案编号无效。'}, 400);
        const record = await transaction<SavedDesign | undefined>('readonly', store => store.get(id));
        if (!record) return json({error: '没有找到这份本机设计。'}, 404);
        const parsed = designSchema.safeParse(record.design);
        if (!parsed.success) return json({error: '这份本机设计已损坏，请导入备份方案。'}, 422);
        return json({...record, design: parsed.data});
      }
      const records = await transaction<SavedDesign[]>('readonly', store => store.getAll());
      return json({designs: records.filter(record => record && typeof record.id === 'string' && typeof record.date === 'string' && designSchema.safeParse(record.design).success).map(({id, date, design}) => ({id, date, name: design.name})).sort((a, b) => b.date.localeCompare(a.date))});
    }
    return json({error: '不支持的操作。'}, 405);
  } catch {
    return json({error: '浏览器未能读取或保存本机设计。当前设计仍在页面上，请下载方案文件备份，或检查浏览器存储空间和隐私设置。'}, 503);
  }
};
