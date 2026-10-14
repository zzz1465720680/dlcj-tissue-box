import test from 'node:test';
import assert from 'node:assert/strict';
import {createNetlifyDesigns} from './netlify-designs.mjs';
import {initialDesign} from '../lib/design.ts';

function fakeDb() {
  const rows = new Map();
  return {rows, async query(sql, params) {
    if (sql.startsWith('INSERT')) {rows.set(params[0], {id: params[0], design: JSON.parse(params[2]), created_at: params[4]}); return {rows: []};}
    if (sql.startsWith('SELECT')) return {rows: rows.has(params[0]) ? [rows.get(params[0])] : []};
    throw new Error('unexpected sql');
  }};
}
const env = {CONTEXT: 'production', STORE_PUBLIC_ORIGIN: 'https://shop.example'};
const post = (body, origin = 'https://shop.example') => new Request('https://shop.example/api/designs', {method: 'POST', headers: {'content-type': 'application/json', origin}, body});

test('design saves and reads back by id', async () => {
  const db = fakeDb(), api = createNetlifyDesigns({db, env});
  const design = {...initialDesign(), name: '云端测试'};
  const saved = await api(post(JSON.stringify(design)));
  assert.equal(saved.status, 200);
  const {id} = await saved.json();
  const got = await api(new Request('https://shop.example/api/designs?id=' + id));
  assert.equal(got.status, 200);
  assert.deepEqual((await got.json()).design, design);
});
test('rejects cross-origin, bad schema, bad id, oversize, missing', async () => {
  const api = createNetlifyDesigns({db: fakeDb(), env});
  assert.equal((await api(post(JSON.stringify(initialDesign()), 'https://evil.example'))).status, 403);
  assert.equal((await api(post(JSON.stringify({...initialDesign(), name: ''})))).status, 400);
  assert.equal((await api(post('{bad'))).status, 400);
  assert.equal((await api(post('x'.repeat(5_000_001)))).status, 413);
  assert.equal((await api(new Request('https://shop.example/api/designs?id=../x'))).status, 400);
  assert.equal((await api(new Request('https://shop.example/api/designs?id=11111111-1111-4111-8111-111111111111'))).status, 404);
  assert.equal((await api(new Request('https://shop.example/api/designs', {method: 'DELETE'}))).status, 405);
});
test('database failure returns 503 without leaking', async () => {
  const api = createNetlifyDesigns({db: {query: async () => {throw new Error('secret conn string');}}, env});
  const r = await api(post(JSON.stringify(initialDesign())));
  assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /secret/);
});
