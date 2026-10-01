/** Operator-only consistent SQLite backup. No network, providers, credentials or live restore. */
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, openSync, closeSync, mkdtempSync, realpathSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

function privatePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('An absolute private path is required');
  const canonical = realpathSync(value);
  for (const exposed of ['public', 'dist', 'dist-netlify', '.next']) {
    const offset = relative(resolve(exposed), canonical);
    if (offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))) {
      throw new Error('Database and backups must stay outside served directories');
    }
  }
  return canonical;
}
async function sha256(filename) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}
function inspectDatabase(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const checks = db.prepare('PRAGMA quick_check').all();
    if (checks.length !== 1 || checks[0].quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('Database integrity check failed');
    }
    const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name));
    for (const name of ['store_migrations', 'store_users', 'store_orders', 'store_design_versions', 'store_coupons', 'store_outbox']) {
      if (!tables.has(name)) throw new Error('Not a complete store database');
    }
    return { integrity: 'ok', schema: 'store-v1' };
  } finally { db.close(); }
}

/** outputDir must already be an operator-approved private directory. Never overwrites a backup. */
export async function createBackup({ filename, outputDir }) {
  const source = privatePath(filename);
  const output = privatePath(outputDir);
  if (!statSync(source).isFile() || !statSync(output).isDirectory()) throw new Error('Invalid backup paths');
  // Open read-only first: a typo cannot silently create an empty production database.
  const db = new DatabaseSync(source, { readOnly: true });
  let directory;
  try {
    directory = mkdtempSync(join(output, 'store-backup-'));
    const destination = join(directory, 'store.sqlite');
    closeSync(openSync(destination, 'wx', 0o600));
    await backup(db, destination);
    inspectDatabase(destination);
    const manifest = { format: 1, file: 'store.sqlite', createdAt: new Date().toISOString(),
      bytes: statSync(destination).size, sha256: await sha256(destination) };
    writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { directory, ...await verifyBackup(directory) };
  } catch (error) {
    // Preserve any partial copy privately for operator inspection; no valid manifest means no valid backup.
    throw new Error(directory ? `Backup incomplete in ${directory}; do not restore it` : 'Backup could not begin', { cause: error });
  } finally { db.close(); }
}

/** Read-only verification. The manifest checksum detects corruption, not malicious replacement. */
export async function verifyBackup(backupDir) {
  const directory = privatePath(backupDir);
  const manifestPath = join(directory, 'manifest.json');
  if (statSync(manifestPath).size > 4096) throw new Error('Invalid backup manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 1 || manifest.file !== 'store.sqlite' || !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes <= 0 || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error('Invalid backup manifest');
  }
  const filename = privatePath(join(directory, manifest.file));
  if (filename !== join(directory, manifest.file) || statSync(filename).size !== manifest.bytes || await sha256(filename) !== manifest.sha256) {
    throw new Error('Backup checksum mismatch');
  }
  return { ...inspectDatabase(filename), bytes: manifest.bytes, createdAt: manifest.createdAt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, option, path, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw new Error('Unexpected arguments');
    let result;
    if (action === 'create' && option === '--output-dir' && path) result = await createBackup({ filename: process.env.STORE_DB_PATH, outputDir: path });
    else if (action === 'verify' && option === '--backup-dir' && path) result = await verifyBackup(path);
    else throw new Error('Use create --output-dir ABSOLUTE_PRIVATE_DIR or verify --backup-dir ABSOLUTE_BACKUP_DIR');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Backup operation failed: check private paths, database integrity and manifest. No live database was restored or changed.\n');
    process.exitCode = 1;
  }
}
