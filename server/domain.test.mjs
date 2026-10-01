import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { createStore, DomainError, normalizePhone } from './domain.mjs';
import { initialDesign, preset, PRESETS } from '../lib/design.ts';

const BASE = '2026-09-30T12:00:00.000Z';
const checkout = { name: '收货人', phone: '13812345678', address: '福建省厦门市测试路 12 号' };
const key = () => randomUUID();
function fixture(t, options = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'dlcj-domain-')); let time = BASE;
  const store = createStore({ filename: join(folder, 'store.sqlite'), now: () => new Date(time), ...options });
  const user = store.registerVerifiedUser({ phone: '13800000001' }).user;
  const other = store.registerVerifiedUser({ phone: '13800000002' }).user;
  store.registerVerifiedUser({ phone: '13800000003' });
  const admin = store.bootstrapAdmin({ phone: '13800000003' });
  t.after(() => { store.close(); rmSync(folder, { recursive: true, force: true }); });
  return { store, user, other, admin, filename: join(folder, 'store.sqlite'), advance: date => { time = date; } };
}
function code(fn, expected) { assert.throws(fn, e => e instanceof DomainError && e.code === expected); }
function edited(color = '#416e63') { const d = initialDesign(); d.parts.body.color = color; return d; }
function save(store, user, design = edited(), options = {}) { return store.saveDesign(user.id, { design, operationKey: key(), ...options }); }
function grant(f, amountFen = 500, expiresAt = '2026-12-30T12:00:00.000Z') { return f.store.adminGrantCoupon(f.admin.id, { userId: f.user.id, amountFen, expiresAt, reason: '客户关怀', operationKey: key() }); }
function order(f, options = {}) { return f.store.createOrder(f.user.id, { kind: 'standard', stockId: 'white-lime', quantity: 1, checkout, operationKey: key(), ...options }); }
function readyPayment(f, o, shippingFen = 800) { const next = f.store.adminSetShippingQuote(f.admin.id, { orderId: o.id, shippingFen }); return f.store.acceptShippingQuote(f.user.id, { orderId: o.id, version: next.shippingVersion }); }
function pay(f, o) { const ready = readyPayment(f, o); return f.store.internal.confirmPayment({ eventId: key(), orderId: o.id, amountFen: ready.totalFen, providerReference: key() }); }

test('verified unique mobile, explicit operator admin and persistent migrations', t => {
  const f = fixture(t); const { store, user, filename } = f;
  assert.equal(user.role, 'customer'); assert.match(user.inviteCode, /^[A-Za-z0-9_-]{16}$/); assert.ok(!('phone' in user));
  assert.equal(normalizePhone('138 0000 0001'), '+8613800000001');
  assert.equal(store.registerVerifiedUser({ phone: '+8613800000001', role: 'admin' }).user.id, user.id);
  assert.equal(store.registerVerifiedUser({ phone: '13800000001', inviteCode: user.inviteCode }).created, false);
  assert.equal(store.registerVerifiedUser({ phone: '13800000004', inviteCode: 'stale-cookie' }).user.role, 'customer');
  code(() => store.registerVerifiedUser({ phone: '+12025550123' }), 'INVALID_PHONE');
  code(() => store.bootstrapAdmin({ phone: '13800000009' }), 'VERIFIED_USER_REQUIRED');
  const saved = save(store, user); const second = createStore({ filename });
  try { assert.equal(second.getDesign(user.id, saved.id).version, 1); assert.equal(second.db.prepare('SELECT COUNT(*) AS n FROM store_migrations').get().n, 1); } finally { second.close(); }
});

test('private designs, immutable versions, idempotency and immutable order snapshots', t => {
  const f = fixture(t), { store, user, other } = f, design = edited();
  const request = { design, operationKey: key() }; const first = store.saveDesign(user.id, request);
  assert.deepEqual(store.saveDesign(user.id, request), first); assert.equal(store.listDesigns(user.id).length, 1);
  code(() => store.saveDesign(user.id, { ...request, design: edited('#802f3d') }), 'IDEMPOTENCY_CONFLICT');
  code(() => store.getDesign(other.id, first.id), 'NOT_FOUND');
  code(() => save(store, other, design, { id: first.id }), 'NOT_FOUND');
  code(() => order({ ...f, user: other }, { kind: 'custom', designId: first.id }), 'NOT_FOUND');
  const o = order(f, { kind: 'custom', designId: first.id, designVersion: 1, unitPriceFen: 1, goodsTotalFen: 1 });
  assert.equal(o.unitPriceFen, 15900); assert.equal(o.goodsTotalFen, 15900); assert.equal(o.shippingFen, null); assert.equal(o.totalFen, null);
  const next = save(store, user, edited('#802f3d'), { id: first.id });
  assert.equal(next.version, 2); assert.equal(store.getDesign(user.id, first.id, 1).design.parts.body.color, '#416e63');
  assert.equal(store.getOrder(user.id, o.id).designSnapshot.parts.body.color, '#416e63');
  code(() => store.getOrder(other.id, o.id), 'NOT_FOUND'); code(() => store.listAdminOrders(user.id), 'FORBIDDEN');
  assert.throws(() => store.db.prepare('UPDATE store_design_versions SET content_json=? WHERE design_id=?').run('{}', first.id), /immutable/);
  assert.throws(() => store.db.prepare('UPDATE store_orders SET snapshot_json=? WHERE id=?').run('{}', o.id), /immutable/);
});

test('new orders enforce grain and special work is quote-only without fake shipping or price', t => {
  const f = fixture(t); const old = edited(); old.parts.body.material = 'smooth'; const historical = save(f.store, f.user, old);
  assert.equal(historical.design.parts.body.material, 'smooth');
  code(() => order(f, { kind: 'custom', designId: historical.id }), 'MATERIAL_UNAVAILABLE');
  const special = edited(); special.parts.body.art.push({ id: 'art', kind: 'text', x: 0.5, y: 0.5, scale: 1, rotation: 0, color: '#000000', text: '专属文字' });
  const design = save(f.store, f.user, special), o = order(f, { kind: 'custom', designId: design.id, useCoupons: true });
  assert.equal(o.kind, 'bespoke'); assert.equal(o.status, 'quote_pending'); assert.equal(o.unitPriceFen, null); assert.equal(o.goodsTotalFen, null); assert.equal(o.discountFen, 0);
  assert.equal(o.shippingState, 'manual_quote_required'); assert.equal(o.paymentEnabled, false);
  code(() => f.store.internal.confirmPayment({ eventId: key(), orderId: o.id, amountFen: 1, providerReference: key() }), 'ORDER_NOT_PAYABLE');
  for (const stockId of f.store.stockProducts.map(p => p.id)) assert.equal(order(f, { stockId, quantity: 2 }).goodsTotalFen, 19800);
  code(() => order(f, { stockId: 'untrusted-stock' }), 'INVALID_PRODUCT');
});

test('gallery requires explicit consent for exact immutable version and withdrawal unpublishes', t => {
  const f = fixture(t), d = edited(); d.name = '姓名电话不要公开'; d.label = { enabled: true, color: '#000000', ink: '#ffffff', text: 'private' };
  const saved = save(f.store, f.user, d), scope = { designId: saved.id, version: 1 };
  code(() => f.store.publishGallery(f.admin.id, { ...scope, published: true }), 'CONSENT_REQUIRED');
  code(() => f.store.setGalleryConsent(f.user.id, { ...scope, consent: 'true' }), 'EXPLICIT_CONSENT_REQUIRED');
  code(() => f.store.setGalleryConsent(f.other.id, { ...scope, consent: true }), 'NOT_FOUND');
  f.store.setGalleryConsent(f.user.id, { ...scope, consent: true }); f.store.publishGallery(f.admin.id, { ...scope, published: true });
  let gallery = f.store.listGallery(); assert.equal(gallery.length, 1); assert.equal(gallery[0].design.name, '精选配色'); assert.equal(gallery[0].design.label.enabled, false); assert.ok(!JSON.stringify(gallery).includes('private'));
  const next = save(f.store, f.user, edited(), { id: saved.id }); assert.equal(next.galleryConsent, false);
  code(() => f.store.publishGallery(f.admin.id, { designId: saved.id, version: 2, published: true }), 'CONSENT_REQUIRED');
  f.store.setGalleryConsent(f.user.id, { ...scope, consent: false }); gallery = f.store.listGallery(); assert.equal(gallery.length, 0);
  f.store.setGalleryConsent(f.user.id, { ...scope, consent: true }); assert.equal(f.store.listGallery().length, 0, 're-consent needs merchant re-curation');
});

test('referral ignores name-only, initial/preset/trivial edits; one event per new verified friend', t => {
  const f = fixture(t); const friend = f.store.registerVerifiedUser({ phone: '13800000010', inviteCode: f.user.inviteCode }).user;
  const renamed = initialDesign(); renamed.name = '改个名字'; assert.equal(save(f.store, friend, renamed).referral.awarded, false);
  for (let i = 0; i < PRESETS.length; i++) assert.equal(save(f.store, friend, preset(i)).referral.awarded, false);
  const tiny = initialDesign(); tiny.parts.body.color = '#ecebe4'; assert.equal(save(f.store, friend, tiny).referral.awarded, false);
  const rewarded = save(f.store, friend); assert.equal(rewarded.referral.awarded, true);
  assert.equal(f.store.listCoupons(friend.id)[0].amountFen, 500); assert.equal(f.store.listCoupons(f.user.id)[0].amountFen, 500);
  assert.equal(f.store.listCoupons(friend.id)[0].expiresAt, '2026-12-29T12:00:00.000Z');
  assert.equal(save(f.store, friend, edited('#802f3d')).referral.awarded, false);
  f.store.registerVerifiedUser({ phone: '13800000002', inviteCode: f.user.inviteCode }); assert.equal(save(f.store, f.other).referral.awarded, false, 'existing account cannot become new friend');
  const twin = f.store.registerVerifiedUser({ phone: '13800000011', inviteCode: f.user.inviteCode }).user;
  assert.equal(save(f.store, twin).referral.awarded, false, 'identical design is not a second reward');
  assert.equal(save(f.store, twin, edited('#344b65')).referral.awarded, true);
  assert.equal(f.store.getReferralSummary(f.user.id).rewardedInvites, 2);
});

test('coupon earliest expiry, per-order cap for both prices, atomic reservation and cancellation idempotency', t => {
  const f = fixture(t); const late = grant(f, 3000, '2026-12-01T00:00:00.000Z'), early = grant(f, 500, '2026-10-05T00:00:00.000Z');
  const input = { kind: 'standard', stockId: 'white-lime', checkout, quantity: 20, useCoupons: true, operationKey: key() };
  const first = f.store.createOrder(f.user.id, input); assert.equal(first.discountFen, 3000); assert.equal(first.goodsTotalFen, 198000);
  assert.deepEqual(f.store.createOrder(f.user.id, input), first); assert.equal(f.store.listOrders(f.user.id).length, 1);
  let coupons = f.store.listCoupons(f.user.id); assert.equal(coupons.find(c => c.id === early.id).reservedFen, 500); assert.equal(coupons.find(c => c.id === late.id).reservedFen, 2500);
  const saved = save(f.store, f.user), next = order(f, { kind: 'custom', designId: saved.id, useCoupons: true }); assert.equal(next.discountFen, 500);
  code(() => f.store.adminRevokeCoupon(f.admin.id, { couponId: early.id, reason: '撤销' }), 'COUPON_RESERVED');
  const cancel = { orderId: first.id, operationKey: key() }; f.store.cancelOrder(f.user.id, cancel); f.store.cancelOrder(f.user.id, cancel);
  coupons = f.store.listCoupons(f.user.id); assert.equal(coupons.reduce((n, c) => n + c.availableFen, 0), 3000); assert.equal(coupons.reduce((n, c) => n + c.reservedFen, 0), 500);
  code(() => f.store.cancelOrder(f.other.id, { orderId: next.id, operationKey: key() }), 'NOT_FOUND');
});

test('parallel SQLite connections cannot overspend coupon balances', async t => {
  const f = fixture(t); grant(f, 3000);
  const code = `import {parentPort,workerData} from 'node:worker_threads'; import {createStore} from ${JSON.stringify(new URL('./domain.mjs', import.meta.url).href)}; const s=createStore({filename:workerData.filename,now:()=>new Date('${BASE}')}); parentPort.postMessage({ready:true}); parentPort.once('message',()=>{try { parentPort.postMessage({order:s.createOrder(workerData.userId,workerData.request)}); } catch(e){parentPort.postMessage({error:e.message});} finally {s.close();}});`;
  const workers = [1, 2].map(() => new Worker(new URL(`data:text/javascript,${encodeURIComponent(code)}`), { workerData: { filename: f.filename, userId: f.user.id, request: { kind: 'standard', stockId: 'white-lime', checkout, useCoupons: true, operationKey: key() } } }));
  t.after(() => Promise.all(workers.map(w => w.terminate())));
  await Promise.all(workers.map(w => new Promise((resolve, reject) => { w.once('message', resolve); w.once('error', reject); })));
  const pending = workers.map(w => new Promise((resolve, reject) => { w.once('message', resolve); w.once('error', reject); })); workers.forEach(w => w.postMessage('go'));
  const results = await Promise.all(pending); results.forEach(r => assert.ok(!r.error, r.error));
  assert.equal(results.reduce((n, r) => n + r.order.discountFen, 0), 3000); assert.equal(f.store.listCoupons(f.user.id)[0].reservedFen, 3000);
});

test('verified payment exact amount, no quote bypass, reservation redeemed only once', t => {
  const f = fixture(t); grant(f, 500); const o = order(f, { useCoupons: true });
  code(() => f.store.internal.confirmPayment({ eventId: key(), orderId: o.id, amountFen: 9400, providerReference: key() }), 'ORDER_NOT_PAYABLE');
  const payable = readyPayment(f, o, 800); assert.equal(payable.totalFen, 10200);
  code(() => f.store.internal.confirmPayment({ eventId: key(), orderId: o.id, amountFen: 10199, providerReference: key() }), 'PAYMENT_AMOUNT_MISMATCH');
  const event = { eventId: key(), orderId: o.id, amountFen: 10200, providerReference: key() }, paid = f.store.internal.confirmPayment(event);
  assert.deepEqual(f.store.internal.confirmPayment(event), paid); assert.equal(paid.status, 'ready_for_production');
  code(() => f.store.internal.confirmPayment({ ...event, amountFen: 1 }), 'EVENT_CONFLICT');
  code(() => f.store.cancelOrder(f.user.id, { orderId: o.id, operationKey: key() }), 'PAID_ORDER');
  assert.equal(f.store.listCoupons(f.user.id)[0].redeemedFen, 500); assert.equal(f.store.listCoupons(f.user.id)[0].reservedFen, 0);
  assert.equal(paid.production.earliestAt, '2026-10-01T12:00:00.000Z'); assert.equal(paid.production.latestAt, '2026-10-02T12:00:00.000Z');
});

test('partial refunds proportionally return coupon fen; verified full refund restores all and expired merchant return extends 30 days', t => {
  const f = fixture(t); const first = grant(f, 500, '2026-10-01T00:00:00.000Z'); grant(f, 1000, '2026-12-01T00:00:00.000Z');
  const o = pay(f, order(f, { useCoupons: true })); f.advance('2026-10-03T12:00:00.000Z');
  const partial = { eventId: key(), orderId: o.id, goodsRefundFen: 3300, shippingRefundFen: 0, cashRefundFen: 2800, reason: 'merchant_unable' };
  const result = f.store.internal.confirmRefund(partial); assert.equal(result.couponReturnedFen, 500); assert.equal(result.cashRefundFen, 2800); assert.equal(result.fullRefund, false);
  assert.deepEqual(f.store.internal.confirmRefund(partial), result);
  assert.equal(f.store.listCoupons(f.user.id).find(c => c.id === first.id).expiresAt, '2026-10-01T00:00:00.000Z');
  assert.equal(f.store.listCoupons(f.user.id).find(c => c.source === 'refund_return').expiresAt, '2026-11-02T12:00:00.000Z');
  const second = f.store.internal.confirmRefund({ eventId: key(), orderId: o.id, goodsRefundFen: 6600, shippingRefundFen: 800, cashRefundFen: 6400, reason: 'merchant_unable' });
  assert.equal(second.couponReturnedFen, 1000); assert.equal(second.fullRefund, true); assert.equal(second.order.status, 'refunded');
  const coupons = f.store.listCoupons(f.user.id); assert.equal(coupons.reduce((n, c) => n + c.availableFen, 0), 1500); assert.equal(coupons.reduce((n, c) => n + c.spendableFen, 0), 1500);
  code(() => f.store.internal.confirmRefund({ eventId: key(), orderId: o.id, goodsRefundFen: 1, reason: 'customer_request' }), 'REFUND_TOO_LARGE');
});

test('customer cancellation and refunds preserve ordinary expiry; coupons never offset shipping', t => {
  const f = fixture(t); grant(f, 500, '2026-10-01T00:00:00.000Z'); const o = pay(f, order(f, { useCoupons: true }));
  f.advance('2026-10-02T12:00:00.000Z');
  const result = f.store.internal.confirmRefund({ eventId: key(), orderId: o.id, goodsRefundFen: 0, shippingRefundFen: 800, cashRefundFen: 800, reason: 'customer_request' });
  assert.equal(result.couponReturnedFen, 0);
  f.store.internal.confirmRefund({ eventId: key(), orderId: o.id, goodsRefundFen: 9900, cashRefundFen: 9400, reason: 'customer_request' });
  assert.equal(f.store.listCoupons(f.user.id)[0].status, 'expired'); assert.equal(f.store.listCoupons(f.user.id)[0].spendableFen, 0);
  const next = order(f, { useCoupons: true }); assert.equal(next.discountFen, 0);
});

test('custom latest material consent and verified payment are both required before production, then dispatch', t => {
  const f = fixture(t), saved = save(f.store, f.user), o = order(f, { kind: 'custom', designId: saved.id });
  const photo1 = randomUUID(), photo2 = randomUUID();
  const first = f.store.proposeMaterial(f.admin.id, { orderId: o.id, note: '细纹皮料实物照片', photoRefs: [photo1] });
  assert.equal(f.store.canReadMaterialPhoto(f.user.id, photo1), true); assert.equal(f.store.canReadMaterialPhoto(f.other.id, photo1), false);
  f.store.acceptMaterial(f.user.id, { orderId: o.id, version: first.materialVersion });
  code(() => f.store.startProduction(f.admin.id, { orderId: o.id }), 'PRODUCTION_NOT_READY');
  const next = f.store.proposeMaterial(f.admin.id, { orderId: o.id, note: '更新实际可用色卡', photoRefs: [photo2] });
  code(() => f.store.acceptMaterial(f.user.id, { orderId: o.id, version: 1 }), 'STALE_VERSION');
  pay(f, next); code(() => f.store.startProduction(f.admin.id, { orderId: o.id }), 'PRODUCTION_NOT_READY');
  f.advance('2026-10-02T12:00:00.000Z'); const accepted = f.store.acceptMaterial(f.user.id, { orderId: o.id, version: 2 });
  assert.equal(accepted.production.earliestAt, '2026-10-07T12:00:00.000Z'); assert.equal(accepted.production.latestAt, '2026-10-09T12:00:00.000Z');
  assert.equal(f.store.startProduction(f.admin.id, { orderId: o.id }).status, 'in_production');
  code(() => f.store.proposeMaterial(f.admin.id, { orderId: o.id, note: 'late', photoRefs: [photo1] }), 'MATERIAL_NOT_EDITABLE');
  assert.equal(f.store.dispatchOrder(f.admin.id, { orderId: o.id, carrier: '顺丰', tracking: 'SF12345678' }).status, 'shipped');
});

test('quote and shipping changes require customer acceptance of latest version', t => {
  const f = fixture(t), saved = save(f.store, f.user), o = order(f, { kind: 'bespoke', designId: saved.id });
  f.store.adminSetQuote(f.admin.id, { orderId: o.id, unitPriceFen: 21000 });
  f.store.adminSetQuote(f.admin.id, { orderId: o.id, unitPriceFen: 22000 });
  code(() => f.store.acceptQuote(f.user.id, { orderId: o.id, version: 1, operationKey: key() }), 'STALE_VERSION');
  f.store.acceptQuote(f.user.id, { orderId: o.id, version: 2, operationKey: key() });
  code(() => f.store.adminSetQuote(f.admin.id, { orderId: o.id, unitPriceFen: 25000 }), 'QUOTE_ACCEPTED');
  f.store.adminSetShippingQuote(f.admin.id, { orderId: o.id, shippingFen: 800 }); f.store.adminSetShippingQuote(f.admin.id, { orderId: o.id, shippingFen: 1000 });
  code(() => f.store.acceptShippingQuote(f.user.id, { orderId: o.id, version: 1 }), 'STALE_VERSION');
  assert.equal(f.store.acceptShippingQuote(f.user.id, { orderId: o.id, version: 2 }).totalFen, 23000);
});

test('outbox only sends minimal order reference/product/amount/link and persists exponential retries', t => {
  const f = fixture(t), o = order(f); const rows = f.store.internal.listPendingOutbox(); assert.equal(rows.length, 1);
  const row = rows[0]; assert.equal(row.recipient, 'merchant'); assert.equal(row.payload.orderRef, o.id);
  for (const pii of Object.values(checkout)) assert.ok(!JSON.stringify(row).includes(pii));
  f.store.internal.recordOutboxResult({ id: row.id, success: false, error: 'PROVIDER_UNAVAILABLE' }); assert.equal(f.store.internal.listPendingOutbox().length, 0);
  f.advance('2026-09-30T12:01:00.000Z'); assert.equal(f.store.internal.listPendingOutbox()[0].attempts, 1);
  f.store.internal.recordOutboxResult({ id: row.id, success: true }); assert.equal(f.store.internal.listPendingOutbox().length, 0);
});

test('compact list views and configurable design storage quota do not leak full artwork blobs', t => {
  const f = fixture(t, { quotas: { maxDesignVersions: 2 } }); const d = edited(); d.parts.body.art = [{ id: 'art', kind: 'text', x: .5, y: .5, scale: 1, rotation: 0, color: '#ABCDEF', text: 'Private text only in full design' }];
  const saved = save(f.store, f.user, d); const summary = f.store.listDesigns(f.user.id)[0]; assert.equal(summary.summaryOnly, true); assert.equal(summary.name, d.name); assert.equal(summary.design.parts.body.art.length, 0); assert.equal(f.store.getDesign(f.user.id, saved.id).design.parts.body.art[0].color, '#abcdef');
  order(f, { kind: 'custom', designId: saved.id }); assert.equal(f.store.listOrders(f.user.id)[0].summaryOnly, true); assert.ok(!('designSnapshot' in f.store.listOrders(f.user.id)[0]));
  save(f.store, f.user, edited('#802f3d')); code(() => save(f.store, f.user, edited('#344b65')), 'DESIGN_STORAGE_LIMIT');
  assert.deepEqual(f.store.getListCounts(f.user.id), { designs: 2, orders: 1, coupons: 0 });
});

test('expired reservations cannot redeem silently and cancelling them releases without extending expiry', t => {
  const f = fixture(t); grant(f, 500, '2026-10-01T00:00:00.000Z'); const payable = readyPayment(f, order(f, { useCoupons: true }));
  f.advance('2026-10-02T12:00:00.000Z');
  code(() => f.store.internal.confirmPayment({ eventId: key(), orderId: payable.id, amountFen: payable.totalFen, providerReference: key() }), 'COUPON_RESERVATION_EXPIRED');
  assert.equal(f.store.listCoupons(f.user.id)[0].reservedFen, 500);
  f.store.cancelOrder(f.user.id, { orderId: payable.id, operationKey: key() });
  assert.equal(f.store.listCoupons(f.user.id)[0].reservedFen, 0); assert.equal(f.store.listCoupons(f.user.id)[0].spendableFen, 0);
});

test('bespoke quotes cannot apply coupons', t => {
  const f = fixture(t); grant(f, 500); const d = save(f.store, f.user), o = order(f, { kind: 'bespoke', designId: d.id, useCoupons: true });
  f.store.adminSetQuote(f.admin.id, { orderId: o.id, unitPriceFen: 20000 });
  code(() => f.store.acceptQuote(f.user.id, { orderId: o.id, version: 1, useCoupons: true, operationKey: key() }), 'COUPON_PRODUCT_INELIGIBLE');
  assert.equal(f.store.listCoupons(f.user.id)[0].availableFen, 500);
});
