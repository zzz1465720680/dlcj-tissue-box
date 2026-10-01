import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './domain.mjs';
import { createAuth, normalizePhone, clientIp, enforceOrigin, SESSION_COOKIE } from './auth.mjs';
import { createProviders, drainEmailOutbox } from './providers.mjs';

const secret = 'test-only-secret-do-not-use-in-deployment-123456789';
function fixture(t, options = {}) {
  let instant = Date.parse('2026-09-30T10:00:00Z');
  const store = createStore({ now: () => new Date(instant), filename: options.filename || ':memory:' });
  t.after(() => store.close());
  const sent = [];
  const sms = options.sms || { available: true, sendOtp: async message => { sent.push(message); } };
  const auth = createAuth({ db: store.db, store, secret, sms, now: () => instant, testMode: true });
  return { store, auth, sent, advance: ms => { instant += ms; } };
}
const request = (f, phone = '+8613800000001', ip = '127.0.0.1') => f.auth.requestOtp({ phone, ip });
function verify(f, challenge, phone = '+8613800000001', code = f.sent.at(-1).code) {
  return f.auth.verifyOtp({ challengeId: challenge.challengeId, phone, code, ip: '127.0.0.1' });
}
const cookieRequest = result => ({ headers: { cookie: result.cookie.split(';')[0] } });

test('OTP and sessions are hashed, single-use, bounded and Secure/HttpOnly', async t => {
  const f = fixture(t); const challenge = await request(f);
  assert.deepEqual(Object.keys(challenge).sort(), ['challengeId', 'expiresInSeconds', 'retryAfterSeconds']);
  const row = f.store.db.prepare('SELECT * FROM auth_challenges').get();
  assert.match(row.code_hash, /^[a-f0-9]{64}$/); assert.notEqual(row.code_hash, f.sent[0].code);
  const result = verify(f, challenge);
  assert.equal(result.user.role, 'customer'); assert.equal(result.user.phone, undefined);
  assert.match(result.cookie, /HttpOnly; Secure; SameSite=Lax/); assert.match(result.cookie, /^__Host-dlcj_session=/);
  const token = result.cookie.split(';')[0].split('=')[1];
  assert.notEqual(f.store.db.prepare('SELECT token_hash FROM auth_sessions').get().token_hash, token);
  assert.equal(f.auth.session(cookieRequest(result)).id, result.user.id);
  assert.throws(() => verify(f, challenge), { code: 'OTP_INVALID' });
  f.auth.logout(cookieRequest(result)); assert.equal(f.auth.session(cookieRequest(result)), null);
});

test('OTP expires, locks after five guesses, enforces resend cooldown, invalidates older code', async t => {
  const f = fixture(t); const first = await request(f);
  await assert.rejects(request(f), { code: 'RATE_LIMITED' });
  const oldCode = f.sent[0].code;
  f.advance(60001); const second = await request(f);
  assert.throws(() => verify(f, first, '+8613800000001', oldCode), { code: 'OTP_INVALID' });
  const wrong = f.sent.at(-1).code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.throws(() => verify(f, second, '+8613800000001', wrong), { code: 'OTP_INVALID' });
  assert.throws(() => verify(f, second), { code: 'OTP_INVALID' });
  f.advance(60001); const third = await request(f); f.advance(300000);
  assert.throws(() => verify(f, third), { code: 'OTP_INVALID' });
});

test('session expiry/revocation and authoritative roles are checked each request', async t => {
  const f = fixture(t); const result = verify(f, await request(f)); const req = cookieRequest(result);
  assert.throws(() => f.auth.requireUser(req, true), { code: 'FORBIDDEN' });
  f.store.bootstrapAdmin({ phone: '+8613800000001' }); assert.equal(f.auth.requireUser(req, true).role, 'admin');
  f.auth.revokeAll(result.user.id); assert.equal(f.auth.session(req), null);
  f.advance(60001); const another = verify(f, await request(f)); f.advance(7 * 86400000);
  assert.equal(f.auth.session(cookieRequest(another)), null);
  assert.equal(f.auth.session({ headers: { cookie: `${SESSION_COOKIE}=fake` } }), null);
  assert.equal(f.auth.session({ headers: { cookie: `${another.cookie.split(';')[0]}; ${another.cookie.split(';')[0]}` } }), null);
});

test('persistent auth rows survive reopening with same secret', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dlcj-auth-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = join(dir, 'store.sqlite'); const first = fixture(t, { filename });
  const result = verify(first, await request(first));
  const second = fixture(t, { filename }); assert.equal(second.auth.session(cookieRequest(result)).id, result.user.id);
  second.auth.revokeAll(result.user.id); assert.equal(first.auth.session(cookieRequest(result)), null);
});

test('default providers are disabled and failures never return OTP or authenticate', async t => {
  const providers = createProviders({}); assert.equal(providers.sms.available, false); assert.equal(providers.email.available, false);
  const f = fixture(t, { sms: providers.sms }); await assert.rejects(request(f), { code: 'SMS_UNAVAILABLE' });
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM auth_challenges').get().n, 0);
  assert.equal((await drainEmailOutbox({ store: f.store, email: providers.email })).enabled, false);
  const failing = fixture(t, { sms: { available: true, sendOtp: async () => { throw new Error('never expose provider body'); } } });
  await assert.rejects(request(failing), { code: 'SMS_UNAVAILABLE' });
  assert.equal(failing.store.db.prepare('SELECT consumed FROM auth_challenges').get().consumed, 1);
});

test('IP limits are persistent and do not trust forwarded or identity headers by default', async t => {
  const f = fixture(t);
  for (let i = 0; i < 20; i++) await request(f, `+86138000${String(i).padStart(5, '0')}`, 'same-ip');
  await assert.rejects(request(f, '+8613900000000', 'same-ip'), { code: 'RATE_LIMITED' });
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.5', 'x-user-id': 'admin' } };
  assert.equal(clientIp(req), '127.0.0.1'); assert.equal(clientIp(req, ['127.0.0.1']), '203.0.113.5');
  req.headers['x-forwarded-for'] = '203.0.113.5, 10.0.0.1'; assert.equal(clientIp(req, ['127.0.0.1']), '127.0.0.1');
  assert.equal(f.auth.session(req), null);
});

test('Origin is mandatory for writes and signed referral cannot be forged', t => {
  const f = fixture(t);
  assert.equal(normalizePhone('138 0000 0001'), '+8613800000001');
  assert.throws(() => enforceOrigin({ method: 'POST', headers: {} }, 'https://shop.example'), { code: 'ORIGIN_REJECTED' });
  assert.throws(() => enforceOrigin({ method: 'POST', headers: { origin: 'https://evil.example' } }, 'https://shop.example'), { code: 'ORIGIN_REJECTED' });
  enforceOrigin({ method: 'POST', headers: { origin: 'https://shop.example' } }, 'https://shop.example');
  const cookie = f.auth.captureReferral({ headers: {} }, 'abcdefghijklmnop');
  assert.equal(f.auth.referral({ headers: { cookie } }), 'abcdefghijklmnop');
  assert.equal(f.auth.referral({ headers: { cookie: cookie.replace('=', '=tampered') } }), undefined);
  f.advance(7 * 86400000); assert.equal(f.auth.referral({ headers: { cookie } }), undefined);
});
