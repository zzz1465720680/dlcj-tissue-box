/** /api/designs on Netlify: save one design and read it back by its random id. No listing (the list stays in the browser). */
import {randomUUID} from 'node:crypto';
import {designSchema} from '../lib/schema.ts';

// Netlify synchronous functions accept request bodies up to ~6 MB.
export const MAX_DESIGN_BYTES = 5_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer'};
const reply = (body, status = 200, extra = {}) => Response.json(body, {status, headers: {...headers, ...extra}});

function sameOrigin(request, env) {
  const expected = env.CONTEXT && env.CONTEXT !== 'production' ? env.DEPLOY_PRIME_URL : env.STORE_PUBLIC_ORIGIN;
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return false;
  if (expected) return origin === expected;
  // Fallback when STORE_PUBLIC_ORIGIN is not configured: Origin must match the request host.
  try {return !!origin && new URL(origin).host === new URL(request.url).host;} catch {return false;}
}

async function readText(request) {
  const announced = request.headers.get('content-length');
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > MAX_DESIGN_BYTES)) return null;
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks = []; let bytes = 0;
  for (;;) {const {done, value} = await reader.read(); if (done) break; bytes += value.length; if (bytes > MAX_DESIGN_BYTES) {await reader.cancel(); return null;} chunks.push(value);}
  return new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));
}

export function createNetlifyDesigns({db, env = process.env, now = () => new Date()}) {
  return async request => {
    try {
      const url = new URL(request.url);
      if (url.pathname.replace(/\/+$/, '') !== '/api/designs') return reply({error: '没有找到此接口。'}, 404);
      if (request.method === 'POST') {
        if (!sameOrigin(request, env)) return reply({error: '此操作需要从店铺页面发起。'}, 403);
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({error: '请求格式不受支持。'}, 415);
        const text = await readText(request);
        if (text === null) return reply({error: '设计素材过大（云端上限约 5 MB），已保存在本机。请减少或压缩图片后重试。'}, 413);
        let raw; try {raw = JSON.parse(text);} catch {return reply({error: '设计文件无法读取。'}, 400);}
        const parsed = designSchema.safeParse(raw);
        if (!parsed.success || !parsed.data.name.trim()) return reply({error: '设计数据不完整或素材超出限制。'}, 400);
        const id = randomUUID(), date = now().toISOString(), body = JSON.stringify(parsed.data);
        await db.query('INSERT INTO dlcj_designs(id,name,design,byte_length,created_at) VALUES($1,$2,$3::jsonb,$4,$5)', [id, parsed.data.name, body, Buffer.byteLength(body), date]);
        return reply({id, date});
      }
      if (request.method === 'GET') {
        const id = url.searchParams.get('id');
        if (id === null) return reply({designs: [], scope: 'browser'}); // Listing is browser-local; ids are private share keys.
        if (!UUID.test(id)) return reply({error: '方案编号无效。'}, 400);
        const row = (await db.query('SELECT id,design,created_at FROM dlcj_designs WHERE id=$1', [id])).rows[0];
        if (!row) return reply({error: '没有找到这份设计。'}, 404);
        const parsed = designSchema.safeParse(row.design);
        if (!parsed.success) return reply({error: '这份设计已损坏。'}, 422);
        return reply({id: row.id, date: new Date(row.created_at).toISOString(), design: parsed.data});
      }
      return reply({error: '不支持的操作。'}, 405, {Allow: 'GET, POST'});
    } catch {
      return reply({error: '云端保存暂时不可用，设计已保留在本机，请稍后重试或下载方案文件。'}, 503);
    }
  };
}
