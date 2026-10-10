#!/usr/bin/env node
/* GET /api/admin/report — the monthly merchant report, run as the real Pages
 * Function on in-memory SQLite. Checks the store-clock month boundary, voids,
 * refunds, line-based product ranking and the operator-only gate.
 *
 *   node tools/admin-report-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { operatorToken, operatorIdToken, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet as report } from '../functions/api/admin/report.js';
import { businessBoundary } from '../functions/api/_business-day.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const secret = 'admin-report-secret-0123456789012345678';
sql.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('op-report','Opérateur','','',1)");
sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-r', 'r@test', 'Café Report', 's', 'h', 1);
sql.prepare('INSERT INTO merchant_config (merchant,features,account_id,name,type,status,city,updated_ts) VALUES (?,?,?,?,?,?,?,?)')
  .run('cafe-report', '{}', 'acc-r', 'Café Report', 'restaurant', 'active', 'Rabat', 1);
class Statement {
  constructor(q) { this.q = q; this.args = []; }
  bind(...a) { this.args = a.map(x => x === undefined ? null : x); return this; }
  async first() { return sql.prepare(this.q).get(...this.args) ?? null; }
  async all() { return { results: sql.prepare(this.q).all(...this.args) }; }
  async run() { const r = sql.prepare(this.q).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}
const env = { DB: { prepare: q => new Statement(q) }, AUTH_SECRET: secret };
let seq = 0;
const sale = (ts, cents, method = 'cash', lines = null, voided = false) => sql.prepare(
  'INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,lines,void_ts) VALUES (?,?,?,?,?,?,?,?)')
  .run('r' + (seq++), 'cafe-report', Math.round(cents / 100), cents, method, ts, lines && JSON.stringify(lines), voided ? ts : null);

// August 2026 in Casablanca, 05:00 cutoff.
const augStart = businessBoundary('2026-08-01', 5, 'Africa/Casablanca');
const sepStart = businessBoundary('2026-09-01', 5, 'Africa/Casablanca');
sale(augStart - 60000, 99900);                                   // 04:59 on 1 Aug → still July
sale(augStart + 3600000, 10000, 'card', [{ n: 'Café', q: 2, t: 30 }, { n: 'Msemen', q: 1, t: 70 }]);
sale(augStart + 86400000 * 3, 20000, 'cash', [{ n: 'Café', q: 4, t: 60 }, { n: 'Tajine', q: 1, t: 140 }]);
sale(augStart + 86400000 * 3 + 600000, 5000);                    // no lines
sale(augStart + 86400000 * 5, -3000, 'cash');                    // refund
sale(augStart + 86400000 * 6, 77700, 'card', null, true);        // voided
sale(sepStart - 60000, 15000, 'card');                            // 04:59 on 1 Sep → still August

const opCookie = `kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret, 'op-report')}`;
const get = async (q, cookie = opCookie) => {
  const r = await report({ env, request: new Request('https://kiwi.test/api/admin/report' + q, { headers: { Cookie: cookie } }) });
  return { status: r.status, data: await r.json() };
};
let n = 0; const check = (v, msg) => { assert.ok(v, msg); n++; };

const owner = sessionCookie(await makeSession('acc-r', secret)).split(';')[0];
check((await get('?merchant=cafe-report&month=2026-08', owner)).status === 403, 'a merchant session is not an operator');
check((await get('?merchant=cafe-report&month=2026-08', '')).status === 403, 'anonymous refused');
check((await get('?merchant=Bad Slug&month=2026-08')).status === 400, 'slug validated');
check((await get('?merchant=cafe-report&month=2026-13')).status === 400, 'month validated');
check((await get('?merchant=nobody&month=2026-08')).status === 404, 'unknown store');

const r = (await get('?merchant=cafe-report&month=2026-08')).data;
check(r.days.length === 31 && r.days[0].d === '2026-08-01' && r.days[30].d === '2026-08-31', 'one entry per day, empty days kept');
check(r.totals.cents === 10000 + 20000 + 5000 - 3000 + 15000, 'month follows the 05:00 store clock; voids excluded; refunds netted');
check(r.totals.count === 4 && r.totals.refunds === 1 && r.totals.refundsCents === -3000, 'sales and refunds counted apart');
check(r.voided.count === 1 && r.voided.cents === 77700, 'voids reported separately');
check(r.days[30].cents === 15000, '04:59 on 1 Sep lands on 31 Aug');
check(r.products.top[0].name === 'Tajine' && r.products.top.find(p => p.name === 'Café').qty === 6, 'products ranked from lines');
check(r.products.detailedTickets === 2 && r.products.tickets === 4, 'ranking says how many tickets it rests on');
check(r.methods.find(m => m.method === 'card').cents === 25000, 'methods summed');
check(r.previous.month === '2026-07' && r.previous.cents === 99900, 'previous month on the same boundary');
check(r.complete === true && r.store.name === 'Café Report', 'closed month, store named');
check(!JSON.stringify(r).includes('acc-r'), 'no account id in the report');

console.log(`admin-report-test: ${n} controls green`);
