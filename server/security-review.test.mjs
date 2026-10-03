import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './domain.mjs';
import { initialDesign, preset } from '../lib/design.ts';
import { createObjectStore } from './objects.mjs';

// Independent review regressions. Providers, network services and production data are never used.
function fixture(t) {
  let instant = Date.parse('2026-09-30T12:00:00Z');
  const store = createStore({ now: () => new Date(instant) });
  t.after(() => store.close());
  store.registerVerifiedUser({ phone: '13800000000' });
  const admin = store.bootstrapAdmin({ phone: '13800000000' });
  const alice = store.registerVerifiedUser({ phone: '13800000001' }).user;
  const bob = store.registerVerifiedUser({ phone: '13800000002' }).user;
  return { store, admin, alice, bob, advance: days => { instant += days * 86400000; } };
}
const checkout = { name: 'PRIVATE CUSTOMER NAME', phone: '13800000001', address: 'PRIVATE CUSTOMER ADDRESS' };
function grant(f, amountFen, expiresAt, operationKey) {
  return f.store.adminGrantCoupon(f.admin.id, { userId: f.alice.id, amountFen, expiresAt, reason: 'isolated test fixture', operationKey });
}
function order(f, overrides = {}) {
  return f.store.createOrder(f.alice.id, { expectedPricingVersion: f.store.getPricing().version, expectedUnitPriceFen: overrides.kind === 'custom' ? f.store.getPricing().customFen : f.store.getPricing().standardFen, operationKey: 'create-order', kind: 'standard', stockId: 'ivory', checkout, useCoupons: true, ...overrides });
}
function pay(f, row, shippingFen = 0) {
  f.store.adminSetShippingQuote(f.admin.id, { orderId: row.id, shippingFen });
  f.store.acceptShippingQuote(f.alice.id, { orderId: row.id, version: 1 });
  return f.store.internal.confirmPayment({ eventId: `payment:${row.id}`, providerReference: `reference:${row.id}`, orderId: row.id, amountFen: row.goodsTotalFen - row.discountFen + shippingFen });
}

test('review: copied noninitial preset with tiny RGB edit never earns referral credit', t => {
  const f = fixture(t);
  const friend = f.store.registerVerifiedUser({ phone: '13800000003', inviteCode: f.alice.inviteCode }).user;
  const design = preset(1); design.parts.body.color = '#273138'; // Original is #273137.
  const result = f.store.saveDesign(friend.id, { operationKey: 'tiny-preset-change', design });
  assert.equal(result.referral.awarded, false);
  assert.equal(f.store.listCoupons(friend.id).length, 0);
  assert.equal(f.store.listCoupons(f.alice.id).length, 0);
});

test('review: expired merchant-inability return revives only returned value, not unused coupon remainder', t => {
  const f = fixture(t);
  grant(f, 5000, '2026-10-01T12:00:00Z', 'grant-large');
  const row = pay(f, order(f));
  f.advance(2);
  assert.equal(f.store.listCoupons(f.alice.id).reduce((n, c) => n + c.spendableFen, 0), 0);
  const request = { eventId: 'refund-first-half', orderId: row.id, goodsRefundFen: 4950, reason: 'merchant_unable' };
  const first = f.store.internal.confirmRefund(request);
  assert.equal(first.couponReturnedFen, 1500);
  assert.equal(first.cashRefundFen, 3450);
  let available = f.store.listCoupons(f.alice.id).filter(c => c.spendableFen > 0);
  assert.equal(available.reduce((n, c) => n + c.spendableFen, 0), 1500);
  assert.ok(available.every(c => c.expiresAt === '2026-11-01T12:00:00.000Z'));
  assert.deepEqual(f.store.internal.confirmRefund(request), first);
  assert.equal(f.store.listCoupons(f.alice.id).reduce((n, c) => n + c.spendableFen, 0), 1500);
  f.store.internal.confirmRefund({ ...request, eventId: 'refund-second-half' });
  assert.equal(f.store.listCoupons(f.alice.id).reduce((n, c) => n + c.spendableFen, 0), 3000);
});

test('review: partial refund cumulative rounding returns exact discount and never discounts shipping', t => {
  const f = fixture(t);
  for (let i = 0; i < 7; i++) grant(f, 500, `2026-12-${10 + i}T00:00:00Z`, `grant-${i}`);
  const design = initialDesign(); design.parts.body.color = '#123456';
  const saved = f.store.saveDesign(f.alice.id, { operationKey: 'save-for-refund', design });
  const row = pay(f, order(f, { kind: 'custom', stockId: undefined, designId: saved.id, designVersion: saved.version }), 1234);
  assert.equal(row.goodsTotalFen, 15900); assert.equal(row.discountFen, 3000); assert.equal(row.totalFen, 14134);
  let cumulativeGoods = 0, cumulativeCoupons = 0, cumulativeCash = 0;
  for (const [index, value] of [1, 1, 98, 4000, 11, 5000, 6789].entries()) {
    const request = { eventId: `partial-${index}`, orderId: row.id, goodsRefundFen: value, reason: 'customer_request' };
    const result = f.store.internal.confirmRefund(request);
    cumulativeGoods += value; cumulativeCoupons += result.couponReturnedFen; cumulativeCash += result.cashRefundFen;
    assert.equal(cumulativeCoupons, Math.floor(3000 * cumulativeGoods / 15900));
    assert.ok(result.couponReturnedFen >= 0 && result.cashRefundFen >= 0);
    assert.deepEqual(f.store.internal.confirmRefund(request), result);
  }
  assert.equal(cumulativeGoods, 15900); assert.equal(cumulativeCoupons, 3000); assert.equal(cumulativeCash, 12900);
  const shippingOnly = f.store.internal.confirmRefund({ eventId: 'shipping-only', orderId: row.id, goodsRefundFen: 0, shippingRefundFen: 1234, reason: 'customer_request' });
  assert.equal(shippingOnly.couponReturnedFen, 0); assert.equal(shippingOnly.cashRefundFen, 1234); assert.equal(shippingOnly.fullRefund, true);
  assert.equal(shippingOnly.order.status, 'refunded');
  assert.throws(() => f.store.internal.confirmRefund({ eventId: 'over-refund', orderId: row.id, goodsRefundFen: 1, reason: 'customer_request' }), { code: 'REFUND_TOO_LARGE' });
  assert.equal(f.store.listCoupons(f.alice.id).reduce((n, c) => n + c.availableFen, 0), 3500);
});

test('review: earliest expiry, per-order cap, idempotency and cancellation preserve coupon value', t => {
  const f = fixture(t);
  const later = grant(f, 4000, '2026-12-20T00:00:00Z', 'later');
  const sooner = grant(f, 500, '2026-10-01T12:00:00Z', 'sooner');
  const row = order(f, { quantity: 5, unitPriceFen: 1, goodsTotalFen: 1, discountFen: 9999, paidAt: '2026-01-01', userId: f.bob.id });
  assert.equal(row.userId, f.alice.id); assert.equal(row.goodsTotalFen, 49500); assert.equal(row.discountFen, 3000); assert.equal(row.paidAt, null);
  const allocated = f.store.db.prepare('SELECT coupon_id,amount_fen FROM store_coupon_allocations WHERE order_id=?').all(row.id);
  assert.equal(allocated.find(c => c.coupon_id === sooner.id).amount_fen, 500);
  assert.equal(allocated.find(c => c.coupon_id === later.id).amount_fen, 2500);
  assert.throws(() => order(f, { quantity: 6 }), { code: 'IDEMPOTENCY_CONFLICT' });
  f.advance(2);
  const cancelled = f.store.cancelOrder(f.alice.id, { orderId: row.id, operationKey: 'cancel-order' });
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(f.store.cancelOrder(f.alice.id, { orderId: row.id, operationKey: 'cancel-order' }), cancelled);
  const coupons = f.store.listCoupons(f.alice.id);
  assert.equal(coupons.find(c => c.id === sooner.id).spendableFen, 0);
  assert.equal(coupons.find(c => c.id === later.id).spendableFen, 4000);
  assert.equal(coupons.reduce((n, c) => n + c.reservedFen, 0), 0);
});

test('review: gallery requires per-version owner consent, strips private content, and revokes immediately', t => {
  const f = fixture(t); const design = initialDesign();
  design.name = 'Private Name 13800000001';
  design.parts.body.art.push({ id: 'private-art', kind: 'text', text: 'Private Address 13800000001', x: 0.5, y: 0.5, scale: 1, rotation: 0, color: '#123456' });
  design.label = { enabled: true, color: '#123456', ink: '#ffffff', text: 'PRIVATE-LBL', image: 'data:image/png;base64,cHJpdmF0ZQ==' };
  const saved = f.store.saveDesign(f.alice.id, { operationKey: 'private-gallery-v1', design });
  assert.throws(() => f.store.publishGallery(f.admin.id, { designId: saved.id, version: 1, published: true }), { code: 'CONSENT_REQUIRED' });
  assert.throws(() => f.store.setGalleryConsent(f.bob.id, { designId: saved.id, version: 1, consent: true }), { code: 'NOT_FOUND' });
  f.store.setGalleryConsent(f.alice.id, { designId: saved.id, version: 1, consent: true });
  f.store.publishGallery(f.admin.id, { designId: saved.id, version: 1, published: true });
  const gallery = f.store.listGallery(); assert.equal(gallery.length, 1);
  const encoded = JSON.stringify(gallery);
  for (const privateValue of ['Private Name', '13800000001', 'Private Address', 'PRIVATE-LBL', 'data:image', f.alice.id]) assert.ok(!encoded.includes(privateValue));
  assert.ok(Object.values(gallery[0].design.parts).every(part => part.art.length === 0));
  const revised = structuredClone(design); revised.parts.body.color = '#abcdef';
  const v2 = f.store.saveDesign(f.alice.id, { id: saved.id, operationKey: 'private-gallery-v2', design: revised });
  assert.equal(v2.galleryConsent, false); assert.equal(v2.galleryPublished, false);
  assert.throws(() => f.store.publishGallery(f.admin.id, { designId: saved.id, version: 2, published: true }), { code: 'CONSENT_REQUIRED' });
  f.store.setGalleryConsent(f.alice.id, { designId: saved.id, version: 1, consent: false });
  assert.equal(f.store.listGallery().length, 0);
});

test('review: owner/admin isolation and immutable order snapshots survive later design updates', t => {
  const f = fixture(t); const design = initialDesign(); design.parts.body.color = '#123456';
  const saved = f.store.saveDesign(f.alice.id, { operationKey: 'original-design', design });
  const row = order(f, { kind: 'custom', stockId: undefined, designId: saved.id, designVersion: 1 });
  assert.throws(() => f.store.getOrder(f.bob.id, row.id), { code: 'NOT_FOUND' });
  assert.throws(() => f.store.getDesign(f.bob.id, saved.id), { code: 'NOT_FOUND' });
  assert.throws(() => f.store.getAdminOrder(f.bob.id, row.id), { code: 'FORBIDDEN' });
  assert.throws(() => f.store.adminGrantCoupon(f.bob.id, {}), { code: 'FORBIDDEN' });
  const changed = structuredClone(design); changed.parts.body.color = '#abcdef';
  f.store.saveDesign(f.alice.id, { id: saved.id, operationKey: 'update-design', design: changed });
  assert.deepEqual(f.store.getOrder(f.alice.id, row.id).designSnapshot, design);
  assert.equal(f.store.getOrder(f.alice.id, row.id).designVersion, 1);
  assert.throws(() => f.store.db.prepare('UPDATE store_design_versions SET content_json=? WHERE design_id=?').run('{}', saved.id), /immutable/);
  assert.throws(() => f.store.db.prepare('UPDATE store_orders SET snapshot_json=? WHERE id=?').run('{}', row.id), /immutable/);
  assert.throws(() => f.store.adminSetQuote(f.admin.id, { orderId: row.id, unitPriceFen: 1 }), { code: 'FIXED_PRICE' });
});


test('review: hex case and non-rendered artwork fields cannot bypass duplicate referral fingerprint', t => {
  const f = fixture(t); const design = initialDesign(); design.parts.body.color = '#123456';
  design.parts.body.art.push({ id: 'text-art', kind: 'text', text: 'hello', color: '#abcdef', x: 0.5, y: 0.5, scale: 1, rotation: 0 });
  const first = f.store.registerVerifiedUser({ phone: '13800000003', inviteCode: f.alice.inviteCode }).user;
  assert.equal(f.store.saveDesign(first.id, { operationKey: 'first-visible-design', design }).referral.awarded, true);
  const second = f.store.registerVerifiedUser({ phone: '13800000004', inviteCode: f.alice.inviteCode }).user;
  const same = structuredClone(design); same.parts.body.art[0].color = '#ABCDEF';
  assert.equal(f.store.saveDesign(second.id, { operationKey: 'same-hex-case', design: same }).referral.awarded, false);
  const third = f.store.registerVerifiedUser({ phone: '13800000005', inviteCode: f.alice.inviteCode }).user;
  const ignored = structuredClone(design); ignored.parts.body.art[0].points = [[0, 0], [1, 1]]; // Text rendering ignores stroke points.
  assert.equal(f.store.saveDesign(third.id, { operationKey: 'same-non-rendered-points', design: ignored }).referral.awarded, false);
});


test('review: completed uploads retain a bounded pointer and replay without duplicating private design', async t => {
  const f = fixture(t); const objects = createObjectStore({ db: f.store.db, store: f.store });
  const design = initialDesign(); design.name = 'PRIVATE UPLOAD NAME';
  const bytes = Buffer.from(JSON.stringify(design));
  let savedId;
  for (let i = 0; i < 3; i++) {
    const begun = objects.begin(f.alice, { kind: 'design', byteLength: bytes.length, operationKey: 'identical-upload-key' });
    objects.chunk(f.alice, begun.uploadId, 0, bytes);
    const completed = await objects.complete(f.alice, begun.uploadId);
    if (!savedId) savedId = completed.design.id;
    assert.equal(completed.design.id, savedId);
    const replay = await objects.complete(f.alice, begun.uploadId);
    assert.deepEqual(replay.design.design, design);
    const row = f.store.db.prepare('SELECT completed_result FROM private_uploads WHERE id=?').get(begun.uploadId);
    assert.ok(Buffer.byteLength(row.completed_result) < 200);
    assert.ok(!row.completed_result.includes(design.name));
  }
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM store_design_versions').get().n, 1);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM private_upload_chunks').get().n, 0);
});
