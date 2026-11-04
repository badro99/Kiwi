/* r19 till#A2: a database failure on the money routes never ships the raw
 * exception text (table names, SQL) to the till; it gets a stable code. */
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
const root = new URL('..', import.meta.url).pathname;
const f = await fixture(root);
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };
const SECRET_TEXT = 'SQLITE_ERROR: no such table: secret_ledger_internal';
f.insert('sale-detail-1', 5000);
const prepare = f.env.DB.prepare;
const logs = []; const origError = console.error; console.error = (...a) => logs.push(a.join(' '));
f.env.DB.prepare = (q) => { if (/COALESCE\(amount_cents, amount \* 100\) >= 0/.test(q)) throw new Error(SECRET_TEXT); return prepare.call(f.env.DB, q); };
const r = await f.refund('refund-detail-1', 'sale-detail-1', 1000);
f.env.DB.prepare = prepare; console.error = origError;
ok(r.status === 500 && r.body.error === 'db-read-failed', 'the refund read failure answers 500 db-read-failed');
ok(!JSON.stringify(r.body).includes('secret_ledger_internal') && r.body.detail === 'internal', 'the body carries a code, not the exception text');
ok(logs.some((l) => l.includes('secret_ledger_internal')), 'the real message goes to the server log');
f.close();
console.log(`sale-error-detail: ${checks} checks passed`);
