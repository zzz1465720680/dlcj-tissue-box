import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, basename, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from './domain.mjs';
import {createStoreServer} from './http.mjs';
import {createBackup} from './backup.mjs';
import {initialDesign} from '../lib/design.ts';
import {INITIAL_PRICING, parsePriceYuan, priceConfirmation} from '../lib/pricing.ts';

const at = '2026-10-03T12:00:00.000Z';
const checkout = {name: '合成客户', phone: '13800000001', address: '合成地址，测试街道 123 号'};
const key = () => randomUUID();
function removeTestDir(folder) {
  const target = resolve(folder);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('dlcj-pricing-')) throw new Error('Unexpected test cleanup path');
  rmSync(target, {recursive: true, force: true});
}
function fixture(t, file = false) {
  const folder = mkdtempSync(join(tmpdir(), 'dlcj-pricing-'));
  const filename = file ? join(folder, 'store.sqlite') : ':memory:';
  const store = createStore({filename, now: () => new Date(at)});
  const user = store.registerVerifiedUser({phone: '13800000001'}).user;
  store.registerVerifiedUser({phone: '13800000003'});
  const admin = store.bootstrapAdmin({phone: '13800000003'});
  t.after(() => {store.close(); removeTestDir(folder);});
  return {folder, filename, store, user, admin};
}
const update = (f, values = {}) => f.store.adminUpdatePricing(f.admin.id, {standardFen: 10900, customFen: 16900, expectedVersion: f.store.getPricing().version, operationKey: key(), ...values});
const orderInput = (f, values = {}) => ({kind: 'standard', stockId: 'ivory', quantity: 1, checkout, operationKey: key(), ...priceConfirmation(f.store.getPricing(), values.kind === 'custom' ? 'custom' : 'standard'), ...values});
const code = (fn, expected) => assert.throws(fn, error => error.code === expected);

test('new pricing starts at the existing 99/159; admin audit and write are atomic and idempotent', t => {
  const f = fixture(t); const original = f.store.getPricing();
  assert.equal(original.standardFen, INITIAL_PRICING.standardFen); assert.equal(original.customFen, INITIAL_PRICING.customFen);
  const input = {standardFen: 10901, customFen: 16999, expectedVersion: original.version, operationKey: key()};
  const result = f.store.adminUpdatePricing(f.admin.id, input);
  assert.deepEqual(f.store.adminUpdatePricing(f.admin.id, input), result);
  const audit = f.store.listPricingAudit(f.admin.id);
  assert.equal(audit.length, 1); assert.equal(audit[0].actorId, f.admin.id); assert.equal(audit[0].at, at);
  assert.deepEqual(audit[0].before, original); assert.deepEqual(audit[0].after, result);
  assert.equal(result.version, original.version + 1);
  code(() => f.store.adminUpdatePricing(f.admin.id, {...input, customFen: 999}), 'IDEMPOTENCY_CONFLICT');
  update(f, {standardFen: result.standardFen, customFen: result.customFen});
  assert.equal(f.store.listPricingAudit(f.admin.id).length, 1, 'unchanged prices do not create artificial changes');
});

test('customers cannot read admin audit or modify pricing by spoofing role/actor', t => {
  const f = fixture(t), before = f.store.getPricing();
  code(() => f.store.adminUpdatePricing(f.user.id, {standardFen: 1, customFen: 1, expectedVersion: 1, operationKey: key(), role: 'admin', userId: f.admin.id}), 'FORBIDDEN');
  code(() => f.store.listPricingAudit(f.user.id), 'FORBIDDEN');
  assert.deepEqual(f.store.getPricing(), before); assert.equal(f.store.listPricingAudit(f.admin.id).length, 0);
});

test('invalid integer-fen prices and malformed versions are rejected with no changes', t => {
  const f = fixture(t), before = f.store.getPricing();
  for (const field of ['standardFen', 'customFen']) for (const value of [0, -1, 1.1, NaN, Infinity, 1000001, Number.MAX_SAFE_INTEGER, '9900', null, undefined]) code(() => update(f, {[field]: value}), 'INVALID_INPUT');
  for (const value of [0, -1, 1.1, '1', null, undefined]) code(() => update(f, {expectedVersion: value}), 'INVALID_INPUT');
  assert.deepEqual(f.store.getPricing(), before); assert.equal(f.store.listPricingAudit(f.admin.id).length, 0);
  for (const value of ['1e2', '0', '0.00', '-2', 'NaN', '1.001', '.50', '10000.01', ' 99 ']) assert.equal(parsePriceYuan(value), null);
  assert.equal(parsePriceYuan('0.01'), 1); assert.equal(parsePriceYuan('109.01'), 10901); assert.equal(parsePriceYuan('10000'), 1000000);
});

test('stale admin edits cannot overwrite a newer price from another connection', t => {
  const f = fixture(t, true), other = createStore({filename: f.filename});
  const before = other.getPricing(); update(f);
  code(() => other.adminUpdatePricing(f.admin.id, {standardFen: 1, customFen: 2, expectedVersion: before.version, operationKey: key()}), 'PRICE_CHANGED');
  assert.deepEqual(other.getPricing(), f.store.getPricing()); assert.equal(f.store.listPricingAudit(f.admin.id).length, 1);
  other.close();
});

test('audit failure rolls back both prices and idempotency so a safe retry can succeed', t => {
  const f = fixture(t), before = f.store.getPricing(), operationKey = key();
  f.store.db.exec("CREATE TEMP TRIGGER fail_pricing_audit BEFORE INSERT ON store_audit WHEN NEW.action='pricing_update' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;");
  assert.throws(() => update(f, {operationKey}), /synthetic audit failure/);
  assert.deepEqual(f.store.getPricing(), before);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM store_operations WHERE operation_key=?').get(operationKey).n, 0);
  f.store.db.exec('DROP TRIGGER fail_pricing_audit'); update(f, {operationKey});
  assert.equal(f.store.listPricingAudit(f.admin.id).length, 1);
});

test('server prices are shared by stock/custom orders and old order snapshots remain unchanged', t => {
  const f = fixture(t);
  const old = f.store.createOrder(f.user.id, orderInput(f, {quantity: 2}));
  const design = f.store.saveDesign(f.user.id, {design: initialDesign(), operationKey: key()});
  const oldCustom = f.store.createOrder(f.user.id, orderInput(f, {kind: 'custom', designId: design.id}));
  const pricing = update(f, {standardFen: 10901, customFen: 16999});
  const next = f.store.createOrder(f.user.id, orderInput(f, {quantity: 3, unitPriceFen: 1, goodsTotalFen: 1, discountFen: 999999, role: 'admin'}));
  const nextCustom = f.store.createOrder(f.user.id, orderInput(f, {kind: 'custom', designId: design.id, quantity: 2}));
  assert.equal(next.unitPriceFen, pricing.standardFen); assert.equal(next.goodsTotalFen, 32703); assert.equal(next.discountFen, 0); assert.equal(next.pricingVersion, pricing.version);
  assert.equal(nextCustom.goodsTotalFen, 33998); assert.equal(nextCustom.unitPriceFen, pricing.customFen);
  assert.ok(f.store.stockProducts.every(p => p.unitPriceFen === pricing.standardFen));
  assert.deepEqual(f.store.getOrder(f.user.id, old.id), old); assert.deepEqual(f.store.getOrder(f.user.id, oldCustom.id), oldCustom);
  assert.throws(() => f.store.db.prepare('UPDATE store_orders SET unit_price_fen=1 WHERE id=?').run(old.id), /immutable order price/);
});

test('missing/stale/forged price confirmation cannot create an order or reserve coupons', t => {
  const f = fixture(t); f.store.adminGrantCoupon(f.admin.id, {userId: f.user.id, amountFen: 500, expiresAt: '2026-12-30T12:00:00Z', reason: '合成测试', operationKey: key()});
  const input = orderInput(f, {useCoupons: true}); update(f);
  code(() => f.store.createOrder(f.user.id, input), 'PRICE_CHANGED');
  code(() => f.store.createOrder(f.user.id, {...input, expectedPricingVersion: undefined, expectedUnitPriceFen: undefined}), 'PRICE_CONFIRMATION_REQUIRED');
  code(() => f.store.createOrder(f.user.id, {...orderInput(f), expectedUnitPriceFen: 1, unitPriceFen: 1}), 'PRICE_CHANGED');
  assert.equal(f.store.listOrders(f.user.id).length, 0); assert.equal(f.store.listCoupons(f.user.id)[0].reservedFen, 0);
  assert.equal(f.store.listCoupons(f.user.id)[0].availableFen, 500);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM store_coupon_allocations').get().n, 0);
  const order = f.store.createOrder(f.user.id, orderInput(f, {useCoupons: true})); assert.equal(order.discountFen, 500);
});

test('successful order replay survives later price changes without creating duplicates or new coupon allocations', t => {
  const f = fixture(t); const request = orderInput(f); const old = f.store.createOrder(f.user.id, request);
  update(f); assert.deepEqual(f.store.createOrder(f.user.id, request), old);
  assert.equal(f.store.listOrders(f.user.id).length, 1);
});

test('low prices and multiple quantities keep coupon deductions within goods and the 30-yuan cap', t => {
  const f = fixture(t); update(f, {standardFen: 101, customFen: 11});
  f.store.adminGrantCoupon(f.admin.id, {userId: f.user.id, amountFen: 100000, expiresAt: '2026-12-30T12:00:00Z', reason: '合成测试', operationKey: key()});
  const low = f.store.createOrder(f.user.id, orderInput(f, {useCoupons: true})); assert.equal(low.discountFen, 101); assert.equal(low.goodsPayableFen, 0);
  const large = f.store.createOrder(f.user.id, orderInput(f, {quantity: 100, useCoupons: true})); assert.equal(large.discountFen, 3000); assert.equal(large.goodsPayableFen, 7100);
  const saved = f.store.saveDesign(f.user.id, {design: initialDesign(), operationKey: key()});
  const custom = f.store.createOrder(f.user.id, orderInput(f, {kind: 'custom', designId: saved.id, useCoupons: true})); assert.equal(custom.discountFen, 11); assert.equal(custom.goodsPayableFen, 0);
});

test('special work remains separately quoted after store prices change', t => {
  const f = fixture(t); update(f);
  const design = initialDesign();
  design.label = {...design.label, enabled: true, text: '合成特殊工艺'};
  const saved = f.store.saveDesign(f.user.id, {design, operationKey: key()});
  const order = f.store.createOrder(f.user.id, {kind: 'custom', designId: saved.id, checkout, useCoupons: true, operationKey: key()});
  assert.equal(order.kind, 'bespoke'); assert.equal(order.unitPriceFen, null); assert.equal(order.discountFen, 0); assert.equal(order.paymentEnabled, false);
  const quoted = f.store.adminSetQuote(f.admin.id, {orderId: order.id, unitPriceFen: 25000}); assert.equal(quoted.unitPriceFen, 25000);
});

test('migration from the prior schema preserves old amounts and initializes pricing only once', t => {
  const folder = mkdtempSync(join(tmpdir(), 'dlcj-pricing-migration-')), filename = join(folder, 'store.sqlite');
  const legacy = new DatabaseSync(filename);
  legacy.exec('PRAGMA foreign_keys=ON; CREATE TABLE store_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const name of ['001_store.sql', '002_outbox_claims.sql']) {legacy.exec(readFileSync(new URL('./migrations/' + name, import.meta.url), 'utf8')); legacy.prepare('INSERT INTO store_migrations VALUES (?,?)').run(name, at);}
  legacy.prepare('INSERT INTO store_users(id,phone,invite_code,created_at,verified_at) VALUES (?,?,?,?,?)').run('legacy-user', '+8613800000001', 'legacy-invite', at, at);
  legacy.prepare('INSERT INTO store_orders(id,user_id,kind,product,quantity,snapshot_json,checkout_json,status,unit_price_fen,goods_total_fen,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy-order','legacy-user','standard','合成旧单',2,'{}',JSON.stringify(checkout),'awaiting_confirmation',9900,19800,at,at);
  const before = legacy.prepare('SELECT * FROM store_orders').get(); legacy.close();
  let store = createStore({filename}); t.after(() => {store.close(); removeTestDir(folder);});
  const after = store.db.prepare('SELECT * FROM store_orders').get(); delete after.pricing_version; assert.deepEqual(after, before);
  store.registerVerifiedUser({phone: '13800000003'}); const admin = store.bootstrapAdmin({phone: '13800000003'});
  const updated = store.adminUpdatePricing(admin.id, {standardFen: 11900, customFen: 17900, expectedVersion: 1, operationKey: key()});
  store.close(); store = createStore({filename});
  assert.deepEqual(store.getPricing(), updated); assert.equal(store.getOrder('legacy-user', 'legacy-order').goodsTotalFen, 19800);
  assert.equal(store.getOrder('legacy-user', 'legacy-order').pricingVersion, null);
});

test('consistent backup and reopen preserve prices and audit alongside orders', async t => {
  const f = fixture(t, true), updated = update(f); const backup = await createBackup({filename: f.filename, outputDir: f.folder});
  const restored = createStore({filename: join(backup.directory, 'store.sqlite')});
  try {assert.deepEqual(restored.getPricing(), updated); assert.deepEqual(restored.listPricingAudit(f.admin.id), f.store.listPricingAudit(f.admin.id));} finally {restored.close();}
});

async function httpFixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'dlcj-pricing-http-')), filename = join(folder, 'store.sqlite');
  const origin = 'http://localhost:5186', secret = 'synthetic-pricing-http-secret-only-123456789';
  let store, app, base; const sent = [];
  const start = async () => {
    store = createStore({filename}); app = createStoreServer({store, origin, secret, testMode: true, providers: {sms: {available: true, sendOtp: async value => sent.push(value)}, email: {available: false}}});
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.server.address().port}/api/store`;
  };
  const stop = async () => {app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); store.close();};
  await start(); t.after(async () => {await stop(); removeTestDir(folder);});
  async function call(path, {method = 'GET', data, cookie, sendOrigin = true} = {}) {
    const res = await fetch(base + path, {method, headers: {...(sendOrigin && method !== 'GET' ? {origin} : {}), ...(data ? {'content-type': 'application/json'} : {}), ...(cookie ? {cookie} : {})}, body: data ? JSON.stringify(data) : undefined});
    return {status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0], cache: res.headers.get('cache-control')};
  }
  async function login(phone) {
    const challenge = await call('/auth/otp/request', {method: 'POST', data: {phone}});
    return call('/auth/otp/verify', {method: 'POST', data: {phone, challengeId: challenge.body.challengeId, code: sent.at(-1).code}});
  }
  return {call, login, get store() {return store;}, restart: async () => {await stop(); await start();}};
}

test('real HTTP enforces admin role and Origin; public pricing exposes no operator data', async t => {
  const f = await httpFixture(t), customer = await f.login('13800000001'), admin = await f.login('13800000003'); f.store.bootstrapAdmin({phone: '13800000003'});
  const publicRead = await f.call('/pricing'); assert.equal(publicRead.status, 200); assert.match(publicRead.cache, /no-store/);
  assert.deepEqual(Object.keys(publicRead.body.pricing).sort(), ['currency','customFen','standardFen','updatedAt','version']);
  const input = {standardFen: 10900, customFen: 16900, expectedVersion: 1, operationKey: key(), userId: admin.body.user.id, role: 'admin'};
  assert.equal((await f.call('/admin/pricing')).status, 401);
  assert.equal((await f.call('/admin/pricing', {cookie: customer.cookie})).status, 403);
  assert.equal((await f.call('/admin/pricing', {method: 'POST', data: input, cookie: customer.cookie})).status, 403);
  assert.equal((await f.call('/admin/pricing', {method: 'POST', data: input, cookie: admin.cookie, sendOrigin: false})).status, 403);
  const saved = await f.call('/admin/pricing', {method: 'POST', data: input, cookie: admin.cookie}); assert.equal(saved.status, 200);
  assert.deepEqual((await f.call('/pricing')).body.pricing, saved.body.pricing);
  assert.equal((await f.call('/admin/pricing', {cookie: admin.cookie})).body.audit[0].actorId, admin.body.user.id);
});

test('real HTTP price changes require fresh confirmation; restart and cookie-authenticated reads retain pricing', async t => {
  const f = await httpFixture(t), customer = await f.login('13800000001'), admin = await f.login('13800000003'); f.store.bootstrapAdmin({phone: '13800000003'});
  const old = (await f.call('/pricing')).body.pricing;
  const input = {kind: 'standard', stockId: 'ivory', quantity: 2, checkout, operationKey: key(), ...priceConfirmation(old, 'standard')};
  const oldOrder = await f.call('/orders', {method: 'POST', cookie: customer.cookie, data: input}); assert.equal(oldOrder.status, 201);
  const saved = await f.call('/admin/pricing', {method: 'POST', cookie: admin.cookie, data: {standardFen: 10901, customFen: 16999, expectedVersion: old.version, operationKey: key()}});
  const stale = await f.call('/orders', {method: 'POST', cookie: customer.cookie, data: {...input, operationKey: key()}}); assert.equal(stale.status, 409); assert.equal(stale.body.error, 'PRICE_CHANGED'); assert.deepEqual(stale.body.pricing, saved.body.pricing);
  const missing = await f.call('/orders', {method: 'POST', cookie: customer.cookie, data: {...input, operationKey: key(), expectedPricingVersion: undefined}}); assert.equal(missing.status, 409); assert.equal(missing.body.error, 'PRICE_CONFIRMATION_REQUIRED');
  assert.equal(f.store.listOrders(customer.body.user.id).length, 1);
  await f.restart(); assert.deepEqual((await f.call('/pricing')).body.pricing, saved.body.pricing);
  assert.equal((await f.call('/admin/pricing', {cookie: admin.cookie})).body.audit.length, 1);
  const created = await f.call('/orders', {method: 'POST', cookie: customer.cookie, data: {...input, operationKey: key(), ...priceConfirmation(saved.body.pricing, 'standard'), unitPriceFen: 1}});
  assert.equal(created.status, 201); assert.equal(created.body.order.goodsTotalFen, 21802);
  const snapshot = await f.call('/orders/' + oldOrder.body.order.id, {cookie: customer.cookie}); assert.deepEqual(snapshot.body.order, oldOrder.body.order);
});
