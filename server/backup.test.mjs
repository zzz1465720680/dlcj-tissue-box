import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createBackup, verifyBackup } from './backup.mjs';
import { createStore } from './domain.mjs';
import { createObjectStore } from './objects.mjs';
import { initialDesign } from '../lib/design.ts';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'store-backup-test-'));
  const filename = join(root, 'live.sqlite'); const store = createStore({ filename });
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, filename, store };
}

test('backup captures committed WAL designs, orders, outbox and private blobs; independent copy restores', async t => {
  const { root, filename, store } = fixture(t);
  store.db.exec('PRAGMA wal_autocheckpoint=0');
  const user = store.registerVerifiedUser({ phone: '+8613800000001' }).user;
  const design = store.saveDesign(user.id, { operationKey: 'fixture-save', design: initialDesign() });
  const order = store.createOrder(user.id, { expectedPricingVersion: store.getPricing().version, expectedUnitPriceFen: store.getPricing().standardFen, operationKey: 'fixture-order', kind: 'standard', stockId: 'ivory',
    checkout: { name: 'Synthetic', phone: '13800000001', address: 'Synthetic private address' }, useCoupons: false });
  createObjectStore({ db: store.db, store });
  store.db.prepare('INSERT INTO private_objects VALUES(?,?,?,?,?,?)').run('fixture-photo', user.id, 'image/webp', Buffer.from('private fixture bytes'), 'fixture-hash', 0);
  assert.ok(statSync(`${filename}-wal`).size > 0);
  const result = await createBackup({ filename, outputDir: root });
  assert.equal(result.integrity, 'ok');
  if (process.platform !== 'win32') {
  assert.equal(statSync(result.directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(result.directory, 'store.sqlite')).mode & 0o777, 0o600);
  assert.equal(statSync(join(result.directory, 'manifest.json')).mode & 0o777, 0o600);
  } // Windows ACLs are not POSIX mode bits; integrity/restoration assertions still run.
  const copy = join(root, 'rehearsal.sqlite'); copyFileSync(join(result.directory, 'store.sqlite'), copy);
  const restored = createStore({ filename: copy });
  try {
    assert.equal(restored.getDesign(user.id, design.id).id, design.id);
    assert.equal(restored.getOrder(user.id, order.id).id, order.id);
    assert.equal(Buffer.from(restored.db.prepare('SELECT bytes FROM private_objects').get().bytes).toString(), 'private fixture bytes');
    assert.equal(restored.internal.listPendingOutbox({ limit: 20 }).length, 1);
    assert.equal(restored.getUser(user.id).role, 'customer');
  } finally { restored.close(); }
  assert.equal((await verifyBackup(result.directory)).integrity, 'ok');
  const manifest = readFileSync(join(result.directory, 'manifest.json'), 'utf8');
  assert.ok(!manifest.includes(user.id) && !manifest.includes(filename) && !manifest.includes('13800000001'));
});

test('backups use unique destinations and never overwrite an earlier snapshot', async t => {
  const { root, filename, store } = fixture(t);
  const first = await createBackup({ filename, outputDir: root });
  store.registerVerifiedUser({ phone: '+8613800000002' });
  const second = await createBackup({ filename, outputDir: root });
  assert.notEqual(first.directory, second.directory);
  for (const [directory, count] of [[first.directory, 0], [second.directory, 1]]) {
    const db = new DatabaseSync(join(directory, 'store.sqlite'), { readOnly: true });
    try { assert.equal(db.prepare('SELECT count(*) AS n FROM store_users').get().n, count); } finally { db.close(); }
  }
});

test('missing source is not created and relative paths are rejected', async t => {
  const { root, filename } = fixture(t); const absent = join(root, 'missing.sqlite');
  await assert.rejects(createBackup({ filename: absent, outputDir: root }));
  assert.equal(existsSync(absent), false);
  await assert.rejects(createBackup({ filename, outputDir: '.' }));
});

test('verification rejects changed bytes and unsafe manifest file paths', async t => {
  const { root, filename } = fixture(t);
  const first = await createBackup({ filename, outputDir: root });
  const dataPath = join(first.directory, 'store.sqlite'); const bytes = readFileSync(dataPath); bytes[bytes.length - 1] ^= 1; writeFileSync(dataPath, bytes);
  await assert.rejects(verifyBackup(first.directory), /checksum/);
  const second = await createBackup({ filename, outputDir: root });
  const manifestPath = join(second.directory, 'manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, file: '../live.sqlite' }));
  await assert.rejects(verifyBackup(second.directory), /manifest/);
});

test('empty SQLite database is never marked as a valid store backup', async t => {
  const { root } = fixture(t); const empty = join(root, 'empty.sqlite'); new DatabaseSync(empty).close();
  await assert.rejects(createBackup({ filename: empty, outputDir: root }), /incomplete/);
});
