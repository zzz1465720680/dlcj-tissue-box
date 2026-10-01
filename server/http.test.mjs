import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { request as httpRequest } from 'node:http';
import { createStore } from './domain.mjs';
import { createStoreServer, loadConfig } from './http.mjs';
import { initialDesign } from '../lib/design.ts';
import { createProviders, drainEmailOutbox } from './providers.mjs';
import { MAX_DESIGN_BYTES, CHUNK_BYTES } from './objects.mjs';

const origin = 'http://localhost:5173';
const secret = 'test-only-http-secret-do-not-use-production-123456789';
async function fixture(t, { smsEnabled = true } = {}) {
  let instant = Date.parse('2026-09-30T12:00:00Z');
  const store = createStore({ now: () => new Date(instant) }); const sent = [];
  const app = createStoreServer({ store, origin, secret, now: () => instant, testMode: true,
    providers: { sms: { available: smsEnabled, sendOtp: async value => { sent.push(value); } }, email: { available: false } } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api/store`;
  t.after(async () => { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); store.close(); });
  async function call(path, { method = 'GET', data, bytes, cookie, headers = {} } = {}) {
    const response = await fetch(base + path, { method, headers: { ...(method !== 'GET' ? { origin } : {}),
      ...(data !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(bytes ? { 'content-type': 'application/octet-stream' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: bytes || (data !== undefined ? JSON.stringify(data) : undefined) });
    const json = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : null;
    return { response, json, status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(phone) {
    const challenge = await call('/auth/otp/request', { method: 'POST', data: { phone } }); assert.equal(challenge.status, 202);
    const result = await call('/auth/otp/verify', { method: 'POST', data: { phone, challengeId: challenge.json.challengeId, code: sent.at(-1).code } });
    assert.equal(result.status, 200); return { cookie: result.cookie, user: result.json.user };
  }
  async function upload(cookie, bytes, kind = 'design', operationKey = crypto.randomUUID()) {
    const begun = await call('/uploads', { method: 'POST', cookie, data: { kind, byteLength: bytes.length, operationKey } });
    assert.equal(begun.status, 201);
    const id = begun.json.uploadId;
    for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTES, index++) {
      const chunk = await call(`/uploads/${id}/chunks/${index}`, { method: 'PUT', cookie, bytes: bytes.subarray(offset, offset + CHUNK_BYTES) }); assert.equal(chunk.status, 200);
    }
    return { id, result: await call(`/uploads/${id}/complete`, { method: 'POST', cookie, data: {} }) };
  }
  return { ...app, base, store, call, login, upload, sent, advance: ms => { instant += ms; } };
}

test('HTTP session, origin/CSRF and RBAC reject spoofed identity and disabled SMS', async t => {
  const f = await fixture(t, { smsEnabled: false });
  const session = await f.call('/session'); assert.equal(session.json.user, null); assert.equal(session.json.capabilities.sms, false); assert.equal(session.json.capabilities.payment, false);
  assert.equal((await f.call('/designs', { headers: { 'x-user-id': 'admin', 'x-oai-user-id': 'admin', 'x-role': 'admin' } })).status, 401);
  assert.equal((await f.call('/auth/otp/request', { method: 'POST', data: { phone: '+8613800000001' } })).status, 503);
  const crossSite = await f.call('/auth/otp/request', { method: 'POST', data: { phone: '+8613800000001' }, headers: { origin: 'https://evil.example' } });
  assert.equal(crossSite.status, 403); assert.equal(crossSite.json.error, 'ORIGIN_REJECTED');
  assert.equal((await f.call('/auth/logout', { method: 'POST', data: {}, headers: { origin: '' } })).status, 403);
  assert.equal(f.sent.length, 0);
});

test('private designs require owner, validate decoded content, support chunk replay and preserve gallery consent', async t => {
  const f = await fixture(t); const alice = await f.login('+8613800000001'); const bob = await f.login('+8613800000002');
  const bytes = Buffer.from(JSON.stringify(initialDesign())); const saved = await f.upload(alice.cookie, bytes);
  assert.equal(saved.result.status, 200); const design = saved.result.json.design; assert.equal(design.galleryConsent, false);
  assert.equal((await f.call(`/designs/${design.id}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await f.call(`/uploads/${saved.id}/complete`, { method: 'POST', cookie: bob.cookie, data: {} })).status, 404);
  const repeat = await f.call(`/uploads/${saved.id}/complete`, { method: 'POST', cookie: alice.cookie, data: {} }); assert.equal(repeat.json.design.id, design.id);
  assert.deepEqual((await f.call('/gallery')).json.gallery, []);
  const corrupt = initialDesign(); corrupt.label.image = 'data:image/png;base64,aGVsbG8=';
  const invalid = await f.upload(alice.cookie, Buffer.from(JSON.stringify(corrupt))); assert.equal(invalid.result.status, 400); assert.equal(invalid.result.json.error, 'INVALID_DESIGN');
  const adminLogin = await f.login('+8613800000003'); const admin = f.store.bootstrapAdmin({ phone: '+8613800000003' });
  assert.equal(adminLogin.user.id, admin.id);
  const refuse = await f.call('/admin/gallery', { method: 'POST', cookie: adminLogin.cookie, data: { designId: design.id, version: 1, published: true } }); assert.equal(refuse.status, 409);
  await f.call(`/designs/${design.id}/consent`, { method: 'POST', cookie: alice.cookie, data: { version: 1, consent: true } });
  const publish = await f.call('/admin/gallery', { method: 'POST', cookie: adminLogin.cookie, data: { designId: design.id, version: 1, published: true } }); assert.equal(publish.status, 200);
  const publicItem = (await f.call('/gallery')).json.gallery[0]; assert.equal(publicItem.design.name, '精选配色'); assert.equal(publicItem.userId, undefined); assert.equal(publicItem.design.label.enabled, false);
  await f.call(`/designs/${design.id}/consent`, { method: 'POST', cookie: alice.cookie, data: { version: 1, consent: false } });
  assert.deepEqual((await f.call('/gallery')).json.gallery, []);
});

test('upload size, row-amplification, ownership and open-upload quotas are bounded', async t => {
  const f = await fixture(t); const alice = await f.login('+8613800000001');
  const begin = size => f.call('/uploads', { method: 'POST', cookie: alice.cookie, data: { kind: 'design', byteLength: size, operationKey: crypto.randomUUID() } });
  assert.equal((await begin(MAX_DESIGN_BYTES + 1)).status, 400);
  const first = await begin(CHUNK_BYTES + 1); const id = first.json.uploadId;
  assert.equal((await f.call(`/uploads/${id}/chunks/0`, { method: 'PUT', cookie: alice.cookie, bytes: Buffer.from('x') })).status, 409);
  assert.equal((await f.call(`/uploads/${id}/chunks/0`, { method: 'PUT', cookie: alice.cookie, bytes: Buffer.alloc(CHUNK_BYTES + 1) })).status, 413);
  const chunk = Buffer.alloc(CHUNK_BYTES, ' ');
  assert.equal((await f.call(`/uploads/${id}/chunks/0`, { method: 'PUT', cookie: alice.cookie, bytes: chunk })).status, 200);
  assert.equal((await f.call(`/uploads/${id}/chunks/0`, { method: 'PUT', cookie: alice.cookie, bytes: chunk })).status, 200);
  assert.equal((await f.call(`/uploads/${id}/chunks/1`, { method: 'PUT', cookie: alice.cookie, bytes: Buffer.from('x') })).status, 200);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM private_upload_chunks WHERE upload_id=?').get(id).n, 2);
  for (let i = 0; i < 4; i++) assert.equal((await begin(10)).status, 201);
  assert.equal((await begin(10)).status, 429);
  f.advance(3600001); assert.equal((await begin(10)).status, 201);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM private_upload_chunks').get().n, 0);
});

test('material photos are decoded, re-encoded and private; customers cannot create them', async t => {
  const f = await fixture(t); const customer = await f.login('+8613800000001');
  const admin = await f.login('+8613800000002'); f.store.bootstrapAdmin({ phone: '+8613800000002' });
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).png().toBuffer();
  assert.equal((await f.call('/uploads', { method: 'POST', cookie: customer.cookie, data: { kind: 'material-photo', byteLength: bytes.length } })).status, 403);
  const photo = await f.upload(admin.cookie, bytes, 'material-photo'); assert.equal(photo.result.status, 200); const object = photo.result.json.object;
  const image = await f.call(`/objects/${object.id}`, { cookie: admin.cookie }); assert.equal(image.status, 200); assert.equal(image.response.headers.get('content-type'), 'image/webp');
  assert.equal((await f.call(`/objects/${object.id}`, { cookie: customer.cookie })).status, 404);
  assert.equal((await f.call(`/objects/${object.id}`)).status, 401);
  const saved = (await f.upload(customer.cookie, Buffer.from(JSON.stringify(initialDesign())))).result.json.design;
  const order = (await f.call('/orders', { method: 'POST', cookie: customer.cookie, data: { operationKey: crypto.randomUUID(), kind: 'custom', designId: saved.id, designVersion: saved.version,
    checkout: { name: '测试', phone: '+8613800000001', address: '测试地址' } } })).json.order;
  const material = await f.call(`/admin/orders/${order.id}/material`, { method: 'POST', cookie: admin.cookie, data: { note: '确认本版细纹皮革', photoRefs: [object.id] } });
  assert.equal(material.status, 200);
  assert.equal((await f.call(`/objects/${object.id}`, { cookie: customer.cookie })).status, 200);
  const outsider = await f.login('+8613800000003'); assert.equal((await f.call(`/objects/${object.id}`, { cookie: outsider.cookie })).status, 404);
  const accepted = await f.call(`/orders/${order.id}/material/accept`, { method: 'POST', cookie: customer.cookie, data: { version: 1 } }); assert.equal(accepted.status, 200);
  const newer = await f.call(`/admin/orders/${order.id}/material`, { method: 'POST', cookie: admin.cookie, data: { note: '更新后的细纹皮革', photoRefs: [object.id] } }); assert.equal(newer.json.order.acceptedMaterialVersion, null);
  assert.equal((await f.call(`/orders/${order.id}/material/accept`, { method: 'POST', cookie: customer.cookie, data: { version: 1 } })).status, 409);
  assert.equal((await f.call(`/admin/orders/${order.id}/production`, { method: 'POST', cookie: admin.cookie, data: {} })).status, 409);
  assert.equal((await f.upload(admin.cookie, Buffer.from('not an image'), 'material-photo')).result.status, 400);
});

test('order price and owner are server-authoritative; no payment/refund mutation route exists', async t => {
  const f = await fixture(t); const alice = await f.login('+8613800000001'); const bob = await f.login('+8613800000002');
  const created = await f.call('/orders', { method: 'POST', cookie: alice.cookie, data: { operationKey: crypto.randomUUID(), kind: 'standard', stockId: 'white-lime', quantity: 2,
    checkout: { name: '测试顾客', phone: '+8613800000001', address: '测试地址' }, userId: bob.user.id, paid: true, status: 'paid', totalFen: 1 } });
  assert.equal(created.status, 201); const order = created.json.order; assert.equal(order.userId, alice.user.id); assert.equal(order.goodsTotalFen, 19800); assert.equal(order.paidAt, null); assert.equal(order.paymentEnabled, false);
  assert.equal((await f.call(`/orders/${order.id}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await f.call('/admin/orders', { cookie: alice.cookie })).status, 403);
  for (const route of [`/orders/${order.id}/paid`, `/orders/${order.id}/refund`, '/payment', '/internal/confirmPayment']) assert.equal((await f.call(route, { method: 'POST', cookie: alice.cookie, data: {} })).status, 404);
  const outbox = f.store.internal.listPendingOutbox({ limit: 1 }); const notice = JSON.stringify(outbox[0].payload);
  assert.equal(outbox[0].recipient, 'merchant'); assert.equal(notice.includes('测试地址'), false); assert.equal(notice.includes('+8613800000001'), false);
  const canceled = await f.call(`/orders/${order.id}/cancel`, { method: 'POST', cookie: alice.cookie, data: { operationKey: crypto.randomUUID() } }); assert.equal(canceled.json.order.status, 'cancelled');
});

test('JSON media type/body limits and logout are enforced with safe error responses', async t => {
  const f = await fixture(t); const alice = await f.login('+8613800000001');
  assert.equal((await f.call('/uploads', { method: 'POST', cookie: alice.cookie, bytes: Buffer.from('{}') })).status, 415);
  assert.equal((await f.call('/orders', { method: 'POST', cookie: alice.cookie, data: { oversized: 'x'.repeat(65000) } })).status, 413);
  const logout = await f.call('/auth/logout', { method: 'POST', cookie: alice.cookie, data: {} }); assert.equal(logout.status, 200); assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.call('/designs', { cookie: alice.cookie })).status, 401);
  assert.equal((await f.call('/session', { cookie: alice.cookie })).json.user, null);
});

test('production config fails closed, and no production test-provider injection is accepted', t => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }));
  assert.throws(() => loadConfig({ NODE_ENV: 'production', STORE_PUBLIC_ORIGIN: 'http://example.test', STORE_AUTH_SECRET: secret, STORE_DB_PATH: '/tmp/store.sqlite' }));
  assert.throws(() => loadConfig({ NODE_ENV: 'production', STORE_PUBLIC_ORIGIN: 'https://example.test', STORE_AUTH_SECRET: secret, STORE_DB_PATH: `${process.cwd()}/public/store.sqlite` }));
  const config = loadConfig({ NODE_ENV: 'production', STORE_PUBLIC_ORIGIN: 'https://example.test', STORE_AUTH_SECRET: secret, STORE_DB_PATH: '/tmp/private-store.sqlite' });
  assert.equal(config.host, '127.0.0.1'); assert.equal(config.port, 8788);
  const store = createStore(); t.after(() => store.close());
  assert.throws(() => createStoreServer({ store, origin: 'https://example.test', secret, production: true, providers: createProviders({}) }));
});

test('email outbox worker uses only minimal persisted payload and retries failures without leaking error text', async t => {
  const f = await fixture(t); const customer = f.store.registerVerifiedUser({ phone: '+8613800000001' }).user;
  f.store.createOrder(customer.id, { operationKey: 'outbox-test', kind: 'standard', stockId: 'white-lime', checkout: { name: '姓名', phone: '+8613800000001', address: '收货地址' } });
  const failed = await drainEmailOutbox({ store: f.store, email: { available: true, sendOrderNotice: async () => { throw new Error('private provider payload'); } } });
  assert.equal(failed.failed, 1); assert.equal(f.store.db.prepare('SELECT last_error FROM store_outbox').get().last_error, 'DELIVERY_FAILED');
  f.advance(60001); const delivered = [];
  const retried = await drainEmailOutbox({ store: f.store, email: { available: true, sendOrderNotice: async payload => { delivered.push(payload); } } });
  assert.equal(retried.sent, 1); assert.equal(delivered[0].amountFen, 9900); assert.equal(typeof delivered[0].idempotencyKey, 'string');
  assert.equal(f.store.internal.listPendingOutbox({ limit: 1 }).length, 0);
});


test('streaming oversized request still receives a bounded JSON 413 response', async t => {
  const f = await fixture(t); const user = await f.login('+8613800000001');
  const result = await new Promise((resolve, reject) => {
    const req = httpRequest(f.base + '/orders', { method: 'POST', headers: { origin, cookie: user.cookie, 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject); req.write('{"oversized":"'); req.end('x'.repeat(65000) + '"}');
  });
  assert.equal(result.status, 413); assert.equal(result.body.error, 'PAYLOAD_TOO_LARGE');
});

test('logout-all revokes every account session while retaining another account session', async t => {
  const f = await fixture(t); const first = await f.login('+8613800000001');
  f.advance(60001); const second = await f.login('+8613800000001'); const other = await f.login('+8613800000002');
  assert.equal((await f.call('/auth/logout-all', { method: 'POST', cookie: first.cookie, data: {} })).status, 200);
  assert.equal((await f.call('/session', { cookie: second.cookie })).json.user, null);
  assert.equal((await f.call('/session', { cookie: other.cookie })).json.user.id, other.user.id);
});


test('configured email gateway receives only approved minimal fields and canonical absolute admin link', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url: String(url), options }); return new Response(null, { status: 200 }); });
  const provider = createProviders({ STORE_PUBLIC_ORIGIN: 'https://shop.example.test', STORE_EMAIL_MODE: 'approved-gateway',
    STORE_EMAIL_DELIVERY_APPROVED: 'true', STORE_ORDER_EMAIL_TO: 'orders@example.com', STORE_EMAIL_GATEWAY_URL: 'https://gateway.example.test/not-real', STORE_EMAIL_GATEWAY_TOKEN: 'test-only-not-a-real-provider-credential' });
  await provider.email.sendOrderNotice({ orderRef: 'order_123', product: '特殊需求待报价', amountFen: null, adminLink: '/admin?order=order_123', idempotencyKey: 'event_123',
    checkout: { name: 'must not forward', phone: '+8613800000001', address: 'must not forward' }, designSnapshot: { private: true } });
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(payload, { to: 'orders@example.com', type: 'order_notice', reference: 'order_123', product: '特殊需求待报价', amountFen: null,
    adminLink: 'https://shop.example.test/admin?order=order_123', idempotencyKey: 'event_123' });
  assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(provider.email.sendOrderNotice({ orderRef: 'order_123', product: '商品', amountFen: 1, adminLink: '//evil.example/x' }), { code: 'INVALID_NOTICE' });
  assert.equal(calls.length, 1);
});


test('list responses are compact and paginated without omitting access controls', async t => {
  const f = await fixture(t); const user = await f.login('+8613800000001');
  for (let i = 0; i < 3; i++) {
    const design = initialDesign(); design.name = `方案${i}`;
    await f.upload(user.cookie, Buffer.from(JSON.stringify(design)));
  }
  const first = await f.call('/designs?limit=2&offset=0', { cookie: user.cookie });
  assert.deepEqual(first.json.pagination, { limit: 2, offset: 0, total: 3, hasMore: true });
  assert.equal(first.json.designs.length, 2); assert.equal(first.json.designs[0].summaryOnly, true);
  const second = await f.call('/designs?limit=2&offset=2', { cookie: user.cookie });
  assert.equal(second.json.designs.length, 1); assert.equal(second.json.pagination.hasMore, false);
  assert.equal((await f.call('/designs?limit=101', { cookie: user.cookie })).status, 400);
  assert.equal((await f.call('/gallery?limit=-1')).status, 400);
  assert.equal((await f.call('/admin/designs?limit=100', { cookie: user.cookie })).status, 403);
});


test('email delivery fails closed without a single private recipient and never accepts a notice recipient', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls.push(JSON.parse(options.body)); return new Response(null, { status: 200 }); });
  const env = { STORE_PUBLIC_ORIGIN: 'https://shop.example.test', STORE_EMAIL_MODE: 'approved-gateway',
    STORE_EMAIL_DELIVERY_APPROVED: 'true', STORE_EMAIL_GATEWAY_URL: 'https://gateway.example.test/not-real',
    STORE_EMAIL_GATEWAY_TOKEN: 'test-only-not-a-real-provider-credential' };
  for (const recipient of [undefined, '', 'orders@example.com,other@example.com', 'orders@example.com\r\nBcc:other@example.com', 'Name <orders@example.com>', ' orders@example.com', 'orders@-example.com']) {
    assert.throws(() => createProviders({ ...env, STORE_ORDER_EMAIL_TO: recipient }), /STORE_ORDER_EMAIL_TO/);
  }
  assert.equal(createProviders({}).email.available, false);
  assert.equal(calls.length, 0);
  const provider = createProviders({ ...env, STORE_ORDER_EMAIL_TO: 'orders@example.com' });
  await provider.email.sendOrderNotice({ to: 'other@example.com', recipient: 'other@example.com', orderRef: 'order_123',
    product: '商品', amountFen: 9900, adminLink: '/admin?order=order_123', idempotencyKey: 'event_123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, 'orders@example.com');
  assert.equal('recipient' in calls[0], false);
});
