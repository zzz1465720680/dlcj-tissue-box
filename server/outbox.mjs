/** Operator-only inspection/reconciliation. This command never sends a notification. */
import { isAbsolute, resolve, sep } from 'node:path';
import { realpathSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from './domain.mjs';

const [action, id, confirmation, ...extra] = process.argv.slice(2);
let store; let db;
try {
  if (!['list-held', 'mark-accepted', 'retry'].includes(action)) {
    process.stdout.write('Usage: node server/outbox.mjs list-held\nOr: node server/outbox.mjs mark-accepted|retry NOTICE_ID --confirm-provider-review\nRequires an existing private STORE_DB_PATH. Stop the email worker and check the provider result before reconciliation. No message is sent by this command.\n');
  } else {
    if (!isAbsolute(process.env.STORE_DB_PATH || '')) throw new Error();
    const filename = realpathSync(process.env.STORE_DB_PATH);
    if (!statSync(filename).isFile()) throw new Error();
    for (const folder of ['public', 'dist', 'dist-netlify', 'dist-netlify-preview', '.next']) {
      const root = resolve(folder); if (filename === root || filename.startsWith(root + sep)) throw new Error();
    }
    if (action === 'list-held') {
      if (id || confirmation || extra.length) throw new Error();
      db = new DatabaseSync(filename, { readOnly: true });
      const rows = db.prepare("SELECT id,event_key AS eventKey,attempts,delivery_claimed_at AS claimedAt,last_error AS error FROM store_outbox WHERE status='pending' AND (delivery_token IS NOT NULL OR delivery_requires_review=1) ORDER BY created_at,id LIMIT 100").all();
      process.stdout.write(JSON.stringify({ notices: rows, limit: 100 }) + '\n');
    } else {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id || '') || confirmation !== '--confirm-provider-review' || extra.length) throw new Error();
      store = createStore({ filename });
      const result = store.internal.reconcileOutbox({ id, accepted: action === 'mark-accepted', confirmation: 'provider-result-reviewed' });
      process.stdout.write(JSON.stringify(result) + '\n');
    }
  }
} catch {
  process.stderr.write('Outbox action refused: check the existing private database, notice ID and explicit provider-review confirmation.\n');
  process.exitCode = 1;
} finally { db?.close(); store?.close(); }
