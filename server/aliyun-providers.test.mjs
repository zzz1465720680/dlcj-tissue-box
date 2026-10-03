import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { createProviders, drainEmailOutbox } from './providers.mjs';
import { signAliyunRequest } from './aliyun-providers.mjs';
import { createStore } from './domain.mjs';

// All credentials, addresses and numbers below are synthetic fixtures. Every fetch is mocked.
const smsEnv = { STORE_SMS_MODE: 'aliyun', STORE_SMS_DELIVERY_APPROVED: 'true', STORE_SMS_ALI_ACCESS_KEY_ID: 'exampleAccessKeyId',
  STORE_SMS_ALI_ACCESS_KEY_SECRET: 'exampleAccessKeySecret', STORE_SMS_ALI_SIGN_NAME: '示例商店', STORE_SMS_ALI_TEMPLATE_CODE: 'SMS_123456',
  STORE_SMS_ALI_MAINLAND_EGRESS_CONFIRMED: 'true', STORE_SMS_ALI_MINUTES_VARIABLE: 'minutes' };
const mailEnv = { STORE_EMAIL_MODE: 'aliyun', STORE_EMAIL_DELIVERY_APPROVED: 'true', STORE_EMAIL_ALI_ACCESS_KEY_ID: 'exampleAccessKeyId',
  STORE_EMAIL_ALI_ACCESS_KEY_SECRET: 'exampleAccessKeySecret', STORE_EMAIL_ALI_FROM_ADDRESS: 'notice@example.com',
  STORE_ORDER_EMAIL_TO: 'orders@example.com', STORE_PUBLIC_ORIGIN: 'https://shop.example.test' };
const otp = { phone: '+8613800000001', code: '123456', expiresInSeconds: 300 };
const notice = { orderRef: 'order_123', product: '自由定制', amountFen: 15900, adminLink: '/admin?order=order_123', idempotencyKey: 'event_123' };
const okSms = () => Response.json({ Code: 'OK', BizId: 'example-biz', RequestId: 'example-request' });
const okMail = () => Response.json({ EnvId: 'example-envelope', RequestId: 'example-request' });

test('ACS3 signing matches the official fixed-parameter test vector', () => {
  const request = signAliyunRequest({ host: 'ecs.cn-shanghai.aliyuncs.com', action: 'RunInstances', version: '2014-05-26',
    accessKeyId: 'YourAccessKeyId', accessKeySecret: 'YourAccessKeySecret', timestamp: '2023-10-26T10:22:32Z',
    nonce: '3156853299f313e23d1673dc12e1703d', query: { RegionId: 'cn-shanghai', ImageId: 'win2019_1809_x64_dtc_zh-cn_40G_alibase_20230811.vhd' } });
  assert.ok(request.headers.authorization.endsWith('Signature=06563a9e1b43f5dfe96b81484da74bceab24a1d853912eee15083a6f0f3283c0'));
  assert.equal(request.headers['x-acs-content-sha256'], 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('direct providers stay disabled without approval and fail closed for incomplete configuration', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('No provider request is allowed in this test'); });
  const disabled = createProviders({ STORE_SMS_MODE: 'aliyun', STORE_EMAIL_MODE: 'aliyun' });
  assert.equal(disabled.sms.available, false); assert.equal(disabled.email.available, false);
  await assert.rejects(disabled.sms.sendOtp(otp), { code: 'SMS_UNAVAILABLE' });
  for (const key of ['STORE_SMS_ALI_ACCESS_KEY_ID', 'STORE_SMS_ALI_ACCESS_KEY_SECRET', 'STORE_SMS_ALI_SIGN_NAME', 'STORE_SMS_ALI_TEMPLATE_CODE', 'STORE_SMS_ALI_MAINLAND_EGRESS_CONFIRMED']) {
    assert.throws(() => createProviders({ ...smsEnv, [key]: '' }));
  }
  for (const key of ['STORE_EMAIL_ALI_ACCESS_KEY_ID', 'STORE_EMAIL_ALI_ACCESS_KEY_SECRET', 'STORE_EMAIL_ALI_FROM_ADDRESS', 'STORE_ORDER_EMAIL_TO', 'STORE_PUBLIC_ORIGIN']) {
    assert.throws(() => createProviders({ ...mailEnv, [key]: '' }));
  }
  assert.throws(() => createProviders({ ...mailEnv, STORE_EMAIL_ALI_REGION: 'ap-southeast-2' }));
  assert.throws(() => createProviders({ ...smsEnv, STORE_SMS_MODE: 'typo' }));
});

test('SMS sends one canonical +86 recipient through HTTPS POST body with fresh nonces', async t => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return okSms(); });
  const sms = createProviders(smsEnv).sms;
  await sms.sendOtp(otp); await sms.sendOtp(otp);
  assert.equal(calls.length, 2); assert.equal(calls[0].url, 'https://dysmsapi.aliyuncs.com/');
  const { options } = calls[0]; const body = Object.fromEntries(new URLSearchParams(options.body));
  assert.deepEqual(body, { PhoneNumbers: '13800000001', SignName: '示例商店', TemplateCode: 'SMS_123456', TemplateParam: '{"code":"123456","minutes":"5"}' });
  assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.headers['x-acs-action'], 'SendSms'); assert.equal(options.headers['x-acs-version'], '2017-05-25');
  assert.notEqual(options.headers['x-acs-signature-nonce'], calls[1].options.headers['x-acs-signature-nonce']);
  for (const phone of ['+12025550123', '+8613800000001,+8613900000000', '13800000001']) await assert.rejects(sms.sendOtp({ ...otp, phone }), { code: 'INVALID_OTP' });
  await assert.rejects(sms.sendOtp({ ...otp, code: '12<script>' }), { code: 'INVALID_OTP' });
  assert.equal(calls.length, 2);
});

test('service rejections differ from uncertain transport outcomes without leaking provider replies', async t => {
  const cases = [
    [() => Response.json({ Code: 'isv.BUSINESS_LIMIT_CONTROL', Message: 'secret details' }), false],
    [() => Response.json({ Code: 'Throttling', Message: 'secret details' }, { status: 429 }), false],
    [() => Response.json({ Code: 'InternalError', Message: 'secret details' }, { status: 500 }), true],
    [() => new Response('not json secret details'), true],
    [() => new Response('x'.repeat(65537)), true],
    [() => Response.json({ Code: 'OK' }), true],
    [() => { throw new Error('network secret details'); }, true],
  ];
  for (const [respond, uncertain] of cases) {
    const mock = t.mock.method(globalThis, 'fetch', async () => respond());
    await assert.rejects(createProviders(smsEnv).sms.sendOtp(otp), error => {
      assert.equal(error.deliveryUncertain, uncertain); assert.equal(String(error).includes('secret details'), false); return true;
    });
    assert.equal(mock.mock.calls.length, 1); mock.mock.restore();
  }
});

test('DirectMail uses the private fixed recipient and minimal plain text with stable reconciliation ID', async t => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return okMail(); });
  const email = createProviders(mailEnv).email;
  const input = { ...notice, to: 'unapproved@example.com', checkout: { name: 'PRIVATE_NAME', address: 'PRIVATE_ADDRESS' }, designSnapshot: 'PRIVATE_DESIGN' };
  await email.sendOrderNotice(input); await email.sendOrderNotice(input);
  const bodies = calls.map(call => Object.fromEntries(new URLSearchParams(call.options.body)));
  assert.equal(calls[0].url, 'https://dm.aliyuncs.com/'); assert.equal(bodies[0].ToAddress, 'orders@example.com');
  assert.equal(bodies[0].AccountName, 'notice@example.com'); assert.equal(bodies[0].ReplyToAddress, 'false');
  assert.equal(bodies[0].ClickTrace, '0'); assert.equal(bodies[0].Headers, bodies[1].Headers);
  assert.equal(bodies[0].TextBody.includes('CNY 159.00'), true);
  assert.equal(bodies[0].TextBody.includes('https://shop.example.test/admin?order=order_123'), true);
  for (const privateValue of ['PRIVATE_NAME', 'PRIVATE_ADDRESS', 'PRIVATE_DESIGN', 'unapproved@example.com']) assert.equal(calls[0].options.body.includes(privateValue), false);
  assert.equal('BccAddress' in bodies[0], false); assert.equal('HtmlBody' in bodies[0], false);
  await assert.rejects(email.sendOrderNotice({ ...notice, idempotencyKey: undefined }), { code: 'INVALID_NOTICE' });
  assert.equal(calls.length, 2);
});

function queue(t) {
  const dir = mkdtempSync(join(tmpdir(), 'store-delivery-')); const filename = join(dir, 'private.sqlite'); let time = Date.now();
  const store = createStore({ filename, now: () => new Date(time) });
  const other = createStore({ filename, now: () => new Date(time) });
  const user = store.registerVerifiedUser({ phone: '13800000001' }).user;
  store.createOrder(user.id, { expectedPricingVersion: store.getPricing().version, expectedUnitPriceFen: store.getPricing().standardFen, operationKey: 'test-order', kind: 'standard', stockId: 'white-lime', checkout: { name: '示例', phone: '13800000001', address: '示例地址' } });
  t.after(() => { store.close(); other.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, other, advance: () => { time += 86400000; } };
}

test('atomic claims prevent two independent store workers from sending the same outbox notice', async t => {
  const { store, other } = queue(t); let release; let calls = 0;
  const email = { available: true, sendOrderNotice: async () => { calls++; await new Promise(resolve => { release = resolve; }); } };
  const first = drainEmailOutbox({ store, email });
  const second = await drainEmailOutbox({ store: other, email });
  assert.equal(calls, 1); assert.equal(second.sent, 0); assert.equal(other.internal.listHeldOutbox().length, 1);
  release(); assert.equal((await first).sent, 1); assert.equal(store.internal.listPendingOutbox().length, 0);
});

test('uncertain DirectMail outcomes remain held across store connections until explicit reconciliation', async t => {
  const { store, other, advance } = queue(t); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('private network failure'); });
  const email = createProviders(mailEnv).email;
  const result = await drainEmailOutbox({ store, email }); assert.equal(result.held, 1);
  advance(); assert.equal((await drainEmailOutbox({ store: other, email })).sent, 0); assert.equal(calls, 1);
  const held = other.internal.listHeldOutbox()[0]; assert.equal(held.error, 'DELIVERY_UNCERTAIN');
  assert.throws(() => other.internal.reconcileOutbox({ id: held.id, accepted: false }), { code: 'REVIEW_REQUIRED' });
  other.internal.reconcileOutbox({ id: held.id, accepted: true, confirmation: 'provider-result-reviewed' });
  assert.equal(other.internal.listHeldOutbox().length, 0); assert.equal(other.internal.listPendingOutbox().length, 0);
});

test('abandoned claims require operator review, and stale workers cannot complete a released claim', t => {
  const { store, other, advance } = queue(t); const id = store.internal.listPendingOutbox()[0].id;
  const claim = store.internal.claimOutbox({ id }); advance();
  assert.equal(other.internal.claimOutbox({ id }), null); assert.equal(other.internal.listPendingOutbox().length, 0);
  other.internal.reconcileOutbox({ id, accepted: false, confirmation: 'provider-result-reviewed' });
  assert.throws(() => store.internal.recordOutboxResult({ id, deliveryToken: claim.token, success: true }), { code: 'DELIVERY_CLAIM_MISMATCH' });
  assert.equal(other.internal.listPendingOutbox().length, 1);
});

test('an accepted message with failed local bookkeeping stays held instead of becoming an automatic retry', async t => {
  const { store, other } = queue(t); let calls = 0;
  const email = { available: true, sendOrderNotice: async () => { calls++; } };
  const failingStore = { internal: { ...store.internal, recordOutboxResult: () => { throw new Error('synthetic disk failure'); } } };
  await assert.rejects(drainEmailOutbox({ store: failingStore, email }), /synthetic disk failure/);
  assert.equal(other.internal.listHeldOutbox().length, 1);
  await drainEmailOutbox({ store: other, email }); assert.equal(calls, 1);
});

test('outbox migration preserves existing queued notices and only the new migration runs', t => {
  const root = mkdtempSync(join(tmpdir(), 'store-outbox-upgrade-')); const filename = join(root, 'old.sqlite');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const old = new DatabaseSync(filename);
  old.exec(readFileSync(new URL('./migrations/001_store.sql', import.meta.url), 'utf8'));
  old.exec("CREATE TABLE store_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO store_migrations VALUES('001_store.sql','2026-10-01T00:00:00Z')");
  old.prepare('INSERT INTO store_outbox(id,event_key,recipient,payload_json,next_attempt_at,created_at) VALUES(?,?,?,?,?,?)').run('legacy-notice', 'legacy-event', 'merchant', JSON.stringify(notice), '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'); old.close();
  const store = createStore({ filename });
  try {
    const queued = store.internal.listPendingOutbox(); assert.equal(queued.length, 1); assert.equal(queued[0].id, 'legacy-notice');
    assert.equal(queued[0].payload.orderRef, notice.orderRef); assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM store_migrations').get().n, 3);
  } finally { store.close(); }
});

test('operator CLI lists only held metadata and reconciliation requires explicit review', t => {
  const { store } = queue(t); const row = store.internal.listPendingOutbox()[0]; store.internal.claimOutbox({ id: row.id });
  const filename = store.db.prepare('PRAGMA database_list').get().file;
  const command = (...args) => spawnSync(process.execPath, ['server/outbox.mjs', ...args], { cwd: process.cwd(), env: { ...process.env, STORE_DB_PATH: filename }, encoding: 'utf8' });
  const listed = command('list-held'); assert.equal(listed.status, 0); const result = JSON.parse(listed.stdout);
  assert.equal(result.notices[0].id, row.id); assert.equal(listed.stdout.includes('recipient'), false); assert.equal(listed.stdout.includes('payload'), false);
  assert.notEqual(command('retry', row.id).status, 0); assert.equal(store.internal.listPendingOutbox().length, 0);
  const resolved = command('mark-accepted', row.id, '--confirm-provider-review'); assert.equal(resolved.status, 0);
  assert.equal(store.internal.listHeldOutbox().length, 0); assert.equal(store.internal.listPendingOutbox().length, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM store_audit WHERE action='notification_reconciled'").get().n, 1);
});
