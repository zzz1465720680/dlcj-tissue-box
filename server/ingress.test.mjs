import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createIngressVerifier, loadIngressConfig } from './ingress.mjs';
import { createStoreServer, loadConfig, startServer } from './http.mjs';
import { createStore } from './domain.mjs';
import { checkProductionConfig } from './check-config.mjs';
import { createProviders, drainEmailOutbox } from './providers.mjs';

// Synthetic keys and example addresses only; provider transport is always mocked.
const now = Date.parse('2026-10-01T10:00:00Z');
const key = 'synthetic-proxy-key-for-tests-only-0123456789';
const env = { STORE_INGRESS_MODE: 'netlify-signed', STORE_NETLIFY_PROXY_SECRET: key,
  STORE_NETLIFY_SITE_ID: '11111111-2222-3333-4444-555555555555', STORE_NETLIFY_SITE_URL: 'https://shop.example.test' };
const claims = { iss: 'netlify', exp: Math.floor(now / 1000) + 60, netlify_id: env.STORE_NETLIFY_SITE_ID,
  site_url: env.STORE_NETLIFY_SITE_URL, deploy_context: 'production' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(payload = claims, header = { alg: 'HS256', typ: 'JWT' }, secret = key) {
  const value = `${encode(header)}.${encode(payload)}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}
const request = value => ({ headers: { 'x-nf-sign': value }, rawHeaders: ['x-nf-sign', value] });
const verify = createIngressVerifier(loadIngressConfig(env), () => now);

test('Netlify signing is opt-in, validates configuration, and only accepts the configured site/context', () => {
  assert.deepEqual(loadIngressConfig({}), { mode: 'direct' });
  assert.doesNotThrow(() => createIngressVerifier()({ headers: {} }));
  assert.doesNotThrow(() => verify(request(token())));
  for (const replacement of [{ STORE_INGRESS_MODE: 'typo' }, { STORE_INGRESS_MODE: 'direct' }, { STORE_NETLIFY_PROXY_SECRET: 'short' },
    { STORE_NETLIFY_SITE_ID: 'any-site' }, { STORE_NETLIFY_SITE_URL: 'https://shop.example.test/path' }, { STORE_NETLIFY_DEPLOY_CONTEXTS: 'production,*' }]) {
    assert.throws(() => loadIngressConfig({ ...env, ...replacement }));
  }
  for (const replacement of [{ iss: 'other' }, { netlify_id: 'other-site' }, { site_url: 'https://other.example.test' }, { deploy_context: 'branch-deploy' }]) {
    assert.throws(() => verify(request(token({ ...claims, ...replacement }))), { code: 'INGRESS_REJECTED' });
  }
  const preview = createIngressVerifier(loadIngressConfig({ ...env, STORE_NETLIFY_DEPLOY_CONTEXTS: 'deploy-preview,branch-deploy' }), () => now);
  assert.doesNotThrow(() => preview(request(token({ ...claims, deploy_context: 'branch-deploy' }))));
  assert.throws(() => preview(request(token())), { code: 'INGRESS_REJECTED' });
});

test('Netlify verifier rejects missing/tampered signatures, alternate algorithms, malformed encoding and duplicate headers', () => {
  for (const value of [undefined, '', 'a.b.c', token(claims, { alg: 'none' }), token(claims, { alg: 'HS512' }),
    token(claims, { alg: 'HS256', crit: ['unknown'] }), token(claims, { alg: 'HS256', b64: false }),
    token(claims, { alg: 'HS256', typ: 'other' }), token(claims, undefined, 'different-key'), `${token()}=`, 'a'.repeat(8193)]) {
    assert.throws(() => verify(request(value)), { code: 'INGRESS_REJECTED' });
  }
  const parts = token().split('.'); parts[1] = encode({ ...claims, deploy_context: 'branch-deploy' });
  assert.throws(() => verify(request(parts.join('.'))), { code: 'INGRESS_REJECTED' });
  const duplicate = request(token()); duplicate.rawHeaders.push('X-Nf-Sign', token());
  assert.throws(() => verify(duplicate), { code: 'INGRESS_REJECTED' });
});

test('Netlify verifier enforces exact expiry and optional not-before without leaking tokens or claims', () => {
  for (const replacement of [{ exp: Math.floor(now / 1000) }, { exp: Math.floor(now / 1000) - 1 }, { exp: '9999999999' },
    { exp: null }, { nbf: Math.floor(now / 1000) + 1 }, { nbf: 'invalid' }]) {
    try { verify(request(token({ ...claims, ...replacement }))); assert.fail('Rejected claims were accepted'); }
    catch (error) { assert.equal(error.code, 'INGRESS_REJECTED'); assert.equal(error.status, 403); assert.equal(error.message.includes(key), false); assert.equal(error.message.includes('example.test'), false); }
  }
  assert.doesNotThrow(() => verify(request(token({ ...claims, nbf: Math.floor(now / 1000) }))));
});

test('HTTP signed ingress runs before routes and retains Origin checks and session authorization', async t => {
  const store = createStore(); const app = createStoreServer({ store, secret: key, origin: env.STORE_NETLIFY_SITE_URL,
    now: () => now, testMode: true, ingress: loadIngressConfig(env), providers: createProviders({}) });
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  t.after(async () => { app.server.closeAllConnections(); await new Promise(done => app.server.close(done)); store.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}/api/store`;
  assert.equal((await fetch(base + '/health')).status, 403);
  assert.equal((await fetch(base + '/health', { headers: { 'x-nf-sign': token() } })).status, 200);
  assert.equal((await fetch(base + '/designs', { headers: { 'x-nf-sign': token(), 'x-user-id': 'admin', 'x-role': 'admin' } })).status, 401);
  assert.equal((await fetch(base + '/auth/otp/request', { method: 'POST', headers: { 'x-nf-sign': token(), origin: 'https://other.example.test', 'content-type': 'application/json' }, body: '{}' })).status, 403);
});

test('production config rejects static paths, normalized traversal, existing and dangling symlinks, and wildcard proxy trust', t => {
  const directory = mkdtempSync(join(tmpdir(), 'dlcj-config-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const base = { NODE_ENV: 'production', STORE_PUBLIC_ORIGIN: 'https://shop.example.test', STORE_AUTH_SECRET: key, STORE_DB_PATH: join(directory, 'new', 'store.sqlite') };
  assert.equal(loadConfig(base).filename, base.STORE_DB_PATH);
  assert.equal(existsSync(join(directory, 'new')), false);
  for (const filename of [resolve('dist-netlify-preview/store.sqlite'), resolve('public') + '/../public/store.sqlite', resolve('.private') + '/../public/store.sqlite']) {
    assert.throws(() => loadConfig({ ...base, STORE_DB_PATH: filename }));
  }
  symlinkSync(resolve('public'), join(directory, 'linked-public'));
  symlinkSync(resolve('public/not-created'), join(directory, 'dangling-public'));
  for (const link of ['linked-public', 'dangling-public']) assert.throws(() => loadConfig({ ...base, STORE_DB_PATH: join(directory, link, 'store.sqlite') }));
  assert.throws(() => loadConfig({ ...base, STORE_TRUSTED_PROXY_IPS: '*' }));
  assert.throws(() => loadConfig({ ...base, STORE_TRUSTED_PROXY_IPS: '10.0.0.0/8' }));
  assert.throws(() => loadConfig({ ...base, STORE_HOST: 'unexpected.example' }));
});

test('production preflight validates without opening storage, contacting providers or emitting private values', t => {
  const directory = mkdtempSync(join(tmpdir(), 'dlcj-check-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Configuration checks cannot send requests'); });
  const configured = { STORE_PUBLIC_ORIGIN: 'https://private-host.example.test', STORE_AUTH_SECRET: key, STORE_DB_PATH: join(directory, 'not-created', 'store.sqlite') };
  const result = checkProductionConfig(configured); assert.equal(result.valid, true); assert.equal(result.checks.smsConfigured, false);
  assert.equal(result.checks.paymentEnabled, false); assert.equal(existsSync(join(directory, 'not-created')), false);
  const serialized = JSON.stringify(result); for (const value of Object.values(configured)) assert.equal(serialized.includes(value), false);
  assert.equal(checkProductionConfig({}).valid, false);
  const invalidProvider = checkProductionConfig({ ...configured, STORE_EMAIL_MODE: 'aliyun', STORE_EMAIL_DELIVERY_APPROVED: 'true' });
  assert.equal(invalidProvider.valid, false); assert.ok(invalidProvider.errors.some(error => error.code === 'PROVIDER_CONFIG_INVALID'));
  const cli = spawnSync(process.execPath, ['server/check-config.mjs'], { cwd: process.cwd(), env: { PATH: process.env.PATH, ...configured }, encoding: 'utf8' });
  assert.equal(cli.status, 0); assert.equal(JSON.parse(cli.stdout).valid, true);
  for (const value of Object.values(configured)) assert.equal((cli.stdout + cli.stderr).includes(value), false);
});

test('startup rejects incomplete approved providers before creating a database or storage directory', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dlcj-startup-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Startup validation cannot send requests'); });
  const filename = join(directory, 'not-created', 'store.sqlite');
  await assert.rejects(startServer({ NODE_ENV: 'production', STORE_PUBLIC_ORIGIN: 'https://shop.example.test', STORE_AUTH_SECRET: key,
    STORE_DB_PATH: filename, STORE_SMS_MODE: 'aliyun', STORE_SMS_DELIVERY_APPROVED: 'true' }));
  assert.equal(existsSync(join(directory, 'not-created')), false);
});

const gatewayEnv = { STORE_EMAIL_MODE: 'approved-gateway', STORE_EMAIL_DELIVERY_APPROVED: 'true',
  STORE_EMAIL_GATEWAY_URL: 'https://gateway.example.test/send', STORE_EMAIL_GATEWAY_TOKEN: 'synthetic-gateway-token-for-tests-only',
  STORE_ORDER_EMAIL_TO: 'orders@example.com', STORE_PUBLIC_ORIGIN: 'https://shop.example.test' };
const notice = { orderRef: 'order_test', product: '常规款', amountFen: 9900, adminLink: '/admin?order=order_test', idempotencyKey: 'event_test' };

test('gateway transport treats timeout and ambiguous statuses as uncertain without echoing provider errors', async t => {
  const email = createProviders(gatewayEnv).email;
  for (const status of [408, 409, 500, 502, 504]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('private provider details', { status }));
    await assert.rejects(email.sendOrderNotice(notice), error => error.deliveryUncertain === true && !error.message.includes('private')); mock.mock.restore();
  }
  for (const status of [400, 401, 403, 404, 410, 422, 429]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status }));
    await assert.rejects(email.sendOrderNotice(notice), error => error.deliveryUncertain === false); mock.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('private token and recipient'); });
  await assert.rejects(email.sendOrderNotice(notice), error => error.deliveryUncertain === true && !error.message.includes('private'));
});

test('gateway uncertain delivery is held durably instead of retried by a second worker', async t => {
  const store = createStore(); t.after(() => store.close()); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Response lost after acceptance'); });
  const user = store.registerVerifiedUser({ phone: '+8613800000001' }).user;
  store.createOrder(user.id, { operationKey: 'gateway-hold-test', kind: 'standard', stockId: 'white-lime', checkout: { name: '合成测试', phone: '+8613800000001', address: '合成测试地址' } });
  const email = createProviders(gatewayEnv).email;
  assert.equal((await drainEmailOutbox({ store, email })).held, 1);
  assert.equal((await drainEmailOutbox({ store, email })).sent, 0);
  assert.equal(calls, 1); assert.equal(store.internal.listHeldOutbox().length, 1);
});

test('gateway acceptance is preserved if discarding the unused response body fails', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ cancel() { throw new Error('Synthetic response cleanup failure'); } }), { status: 202 }));
  await assert.doesNotReject(createProviders(gatewayEnv).email.sendOrderNotice(notice));
});
