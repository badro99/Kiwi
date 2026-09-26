#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE, makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { businessBoundary } from '../functions/api/_business-day.js';
import * as endpoint from '../functions/api/z-reconciliation.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'z-reconcile-fixture', secret = 'z-reconcile-only';
db.prepare("INSERT INTO merchant_config(merchant,features,status,updated_ts) VALUES (?,'{}','active',?)")
  .run(merchant, Date.now());
db.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES ('z-owner','z@example.test',?,'','',?)")
  .run(merchant, Date.now());
db.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run('z-owner', merchant);
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { args = values; return this; },
  first() { return db.prepare(sql).get(...args) || null; },
  all() { return { results: db.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: db.prepare(sql).run(...args) }; },
}; } };
const env = { DB, AUTH_SECRET: secret };
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(body, withCookie = true) {
  const request = new Request('https://kiwi.test/api/z-reconciliation', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ merchant, terminalId: 'till-fixture', ...body }) });
  const response = await endpoint.onRequestPost({ env, request });
  return { status: response.status, body: await response.json() };
}
const day = '2026-02-14'; // Casablanca's 25-hour winter-time business day
const ts = businessBoundary(day) + 1000;
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,40,4000,'cash',?)")
  .run('sale-one', merchant, ts);
const report = { day, sales: [
  { id: 'sale-one', amountCents: 4000, method: 'cash' },
  { id: 'sale-missing', amountCents: 5700, method: 'card' },
], count: 2, totalCents: 9700 };
assert.equal((await post(report, false)).status, 403, 'only paired till can submit Z');
assert.equal((await post({ ...report, day: '2026-02-31' })).status, 400, 'invalid civil day is rejected');
assert.equal((await post({ ...report, totalCents: 9800 })).status, 400, 'reported total must match receipt list');
let result = await post(report);
assert.equal(result.status, 200, JSON.stringify(result));
assert.deepEqual(result.body.missing, ['sale-missing']);
assert.equal(result.body.gapCents, 5700);
assert.equal(result.body.status, 'mismatch');
assert.equal(db.prepare('SELECT missing_count FROM z_reconciliations WHERE merchant=?').get(merchant).missing_count, 1);
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,57,5700,'card',?)")
  .run('sale-missing', merchant, ts + 1000);
result = await post(report);
assert.equal(result.body.status, 'matched');
assert.equal(result.body.missing.length, 0);
assert.equal(db.prepare('SELECT status FROM z_reconciliations WHERE merchant=?').get(merchant).status, 'matched');
// Another terminal's sale is not an "extra" against this terminal's Z.
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,23,2300,'cash',?)")
  .run('other-terminal-sale', merchant, ts + 2000);
result = await post({ ...report, closed: false });
assert.equal(result.body.status, 'matched');
assert.equal(result.body.serverCents, 9700);
assert.equal(result.body.closed, false);
const owner = `${SESS_COOKIE}=${await makeSession('z-owner', secret)}`;
db.prepare("INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,'dayreports',?,1,?)")
  .run(merchant, JSON.stringify({ days: { [day]: { gross: 150, txns: 4, cutoff: 5, closedCount: 1 } } }), Date.now());
const read = await endpoint.onRequestGet({ env, request: new Request(
  'https://kiwi.test/api/z-reconciliation?merchant=' + merchant, { headers: { Cookie: owner } }) });
assert.equal(read.status, 200);
const readBody = await read.json();
assert.equal(readBody.rows[0].status, 'matched');
assert.equal(readBody.rows[0].closed, false);
assert.equal(readBody.dayReports[0].reported_cents, 15000);
assert.equal(readBody.dayReports[0].server_cents, 12000);
assert.equal(readBody.dayReports[0].status, 'mismatch');
assert.equal(readBody.dayReports[0].closed, true);
const foreign = await endpoint.onRequestGet({ env, request: new Request(
  'https://kiwi.test/api/z-reconciliation?merchant=another-store', { headers: { Cookie: owner } }) });
assert.equal(foreign.status, 403, 'owner cannot read another merchant Z');
// A sale just before the next 05:00 boundary belongs to this day; the next
// second does not. No fixed UTC offset may be used across the winter shift.
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,10,1000,'cash',?)")
  .run('next-day', merchant, businessBoundary('2026-02-15'));
result = await post(report);
assert.equal(result.body.status, 'matched');
db.close();
console.log('✓ Z reconciliation: till auth, missing receipt, repair, idempotent upsert, winter boundary');
