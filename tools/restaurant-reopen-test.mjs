#!/usr/bin/env node
/* Execute the real cancel and sale routes against transactional SQLite. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as cancel } from '../functions/api/sale/cancel.js';
import { onRequestPost as sale } from '../functions/api/sale.js';
import * as queueRoute from '../functions/api/order/queue.js';
import { onRequestPost as serviceEventsPost } from '../functions/api/service/events.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { businessDate } from '../functions/api/_business-day.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'reopen-fixture', secret = 'synthetic-reopen-secret', now = Date.now();
const reopenedFloorBills = queueRoute.reopenedFloorBills || (async () => []);
const DB = {
  prepare(query) { let args = []; return {
    bind(...values) { args = values.map(v => v === undefined ? null : v); return this; },
    first() { return sql.prepare(query).get(...args) || null; },
    all() { return { results: sql.prepare(query).all(...args) }; },
    run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; },
  }; },
  batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try { const out = statements.map(statement => statement.run()); sql.exec('COMMIT'); return out; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: secret };
sql.prepare("INSERT INTO merchant_config(merchant,features,type,name,status,updated_ts) VALUES (?, '{}', 'restaurant', 'Reopen Fixture', 'active', ?)").run(merchant, now);
sql.prepare("INSERT INTO staff_pins(id,merchant,pin,name,role,created_ts) VALUES ('fixture-manager', ?, '2468', 'Fixture Manager', 'manager', ?)").run(merchant, now);
sql.prepare("INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,'floorplan',?,1,?)")
  .run(merchant, JSON.stringify({ tables: [{ id: '1', num: '1' }, { id: '2', num: '2' }, { id: '3', num: '3' }] }), now);
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(handler, body) {
  const request = new Request('https://kiwi.test/api/test', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, ...body }) });
  const response = await handler({ env, request, waitUntil() {} });
  return { status: response.status, body: await response.json() };
}
function seed(id, visit, table, amount, method, flow = '') {
  sql.prepare("INSERT INTO table_sessions(id,merchant,mode,table_no,status,closed_by,opened_ts,seen_ts,closed_ts) VALUES (?,?,'table',?,'closed','service-payment',?,?,?)")
    .run(visit, merchant, table, now - 60000, now - 60000, now - 1000);
  sql.prepare(`INSERT INTO sales(id,merchant,amount,amount_cents,method,label,ref,ts,session_id,split_flow_id,lines,channel)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'dining')`).run(id, merchant, amount, amount * 100, method,
      `Table ${table}`, `Table ${table} #77`, now - 2000, visit, flow || null,
      JSON.stringify([{ n: 'Article libre', q: 1, t: amount }]));
}
function voidAndReopen(id, table) {
  return post(cancel, { id, pin: '2468', source: 'cashier', reopen: true, reopenTable: table, covers: 2 });
}

seed('sale-simple', 'tsx-simple', '1', 10, 'cash');
let r = await voidAndReopen('sale-simple', '1');
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.body.reopened, true);
assert.equal(r.body.table, '1');
assert.ok(r.body.sessionId && r.body.sessionId !== 'tsx-simple');
assert.equal(sql.prepare("SELECT void_ts FROM sales WHERE id='sale-simple'").get().void_ts > 0, true);
assert.equal(sql.prepare("SELECT status FROM table_sessions WHERE id=?").get(r.body.sessionId).status, 'open');
let floor = JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='service-events'").get(merchant).data);
assert.equal(floor.states['1'].status, 'bgha-ykhlass', 'waiter floor sees reopened occupied table');
assert.equal(floor.states['1'].source, 'employee');
assert.equal(floor.states['1'].reopenSessionId, r.body.sessionId, 'floor carries exact authorized reopen visit');
const echo = await post(serviceEventsPost, { snapshot: { tables: [{ table: '1', status: 'bgha-ykhlass', covers: 2, syncVersion: 4 }] } });
assert.equal(echo.status, 200, JSON.stringify(echo));
floor = JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='service-events'").get(merchant).data);
assert.equal(floor.states['1'].reopenSessionId, r.body.sessionId, 'matching till echo retains crash-recovery proof');
let waiterBills = await reopenedFloorBills(env, merchant, [{ id: r.body.sessionId, table: '1' }], Date.now());
assert.equal(waiterBills.length, 1, 'waiter sees the reopened payment, not a zero-MAD empty bill');
assert.equal(waiterBills[0].amountCents, 1000);
assert.equal(waiterBills[0].lines[0].name, 'Article libre');
const realPrepare = DB.prepare;
DB.prepare = function(query) {
  if (query.includes('FROM sale_audit a WHERE')) throw new Error('synthetic audit outage');
  return realPrepare.call(this, query);
};
assert.equal(await reopenedFloorBills(env, merchant, [{ id: r.body.sessionId, table: '1' }], Date.now()), null,
  'an unreadable audit must fail closed instead of offering a zero-MAD waiter payment');
DB.prepare = realPrepare;
let next = await post(sale, { id: 'sale-simple-repaid', table: '1', session: r.body.sessionId,
  ref: 'Table 1 #77', amountCents: 1000, method: 'card', ts: now,
  lines: [{ n: 'Article libre', q: 1, t: 10 }] });
assert.equal(next.status, 200, JSON.stringify(next));
assert.equal(sql.prepare("SELECT COUNT(*) n FROM sales WHERE merchant=? AND void_ts IS NULL").get(merchant).n, 1);
assert.equal(sql.prepare('SELECT status FROM table_sessions WHERE id=?').get(r.body.sessionId).status, 'closed');
waiterBills = await reopenedFloorBills(env, merchant, [], Date.now());
assert.equal(waiterBills.length, 0, 'closed replacement visit disappears from the live waiter projection');
floor = JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='service-events'").get(merchant).data);
assert.equal(floor.states['1'].status, 'khawya', 'waiter floor sees table free after replacement tender');
const retry = await voidAndReopen('sale-simple', '1');
assert.equal(retry.status, 200, JSON.stringify(retry));
assert.equal(retry.body.sessionId, r.body.sessionId);
assert.equal(sql.prepare("SELECT COUNT(*) n FROM sale_audit WHERE sale_id='sale-simple' AND action='reopen'").get().n, 1);

seed('sale-split-cash', 'tsx-split', '1', 5, 'cash', 'split-fixture-77');
sql.prepare(`INSERT INTO sales(id,merchant,amount,amount_cents,method,label,ref,ts,session_id,split_flow_id,lines,channel)
  VALUES ('sale-split-card',?,5,500,'card','Table 1 · part 1','Table 1 #78',?,?,?,?,'dining')`)
  .run(merchant, now - 3000, 'tsx-split', 'split-fixture-77', JSON.stringify([{ n: 'Article libre', q: 1, t: 5 }]));
r = await voidAndReopen('sale-split-cash', '1');
assert.equal(r.status, 200, JSON.stringify(r));
waiterBills = await reopenedFloorBills(env, merchant, [{ id: r.body.sessionId, table: '1' }], Date.now());
assert.equal(waiterBills[0].amountCents, 500, 'waiter context shows only the voided split part due');
next = await post(sale, { id: 'sale-split-repaid', table: '1', session: r.body.sessionId,
  ref: 'Table 1 #78', amountCents: 500, method: 'card', ts: now + 1,
  split: { index: 1, count: 2, flowId: 'split-fixture-77' }, lines: [{ n: 'Article libre', q: 1, t: 5 }] });
assert.equal(next.status, 200, JSON.stringify(next));
assert.equal(sql.prepare("SELECT COUNT(*) n FROM sales WHERE split_flow_id='split-fixture-77' AND void_ts IS NULL").get().n, 2);
assert.equal(sql.prepare('SELECT status FROM table_sessions WHERE id=?').get(r.body.sessionId).status, 'closed');

seed('sale-occupied', 'tsx-occupied', '1', 4, 'cash');
sql.prepare("INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES ('tsx-new-party',?,'table','1','open',?,?)").run(merchant, now, now);
r = await voidAndReopen('sale-occupied', '1');
assert.equal(r.status, 409, JSON.stringify(r));
assert.equal(r.body.error, 'table-occupied');
assert.equal(sql.prepare("SELECT void_ts FROM sales WHERE id='sale-occupied'").get().void_ts, null);
r = await voidAndReopen('sale-occupied', 'T1');
assert.equal(r.status, 409, 'an alternate spelling cannot bypass the occupied-table guard');
r = await voidAndReopen('sale-occupied', '2');
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.body.table, '2');
assert.equal(sql.prepare('SELECT table_no FROM table_sessions WHERE id=?').get(r.body.sessionId).table_no, '2');

seed('sale-alias', 'tsx-alias', '3', 4, 'cash');
sql.prepare("INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES ('tsx-alias-party',?,'table','T3','open',?,?)")
  .run(merchant, now, now);
r = await voidAndReopen('sale-alias', '3');
assert.equal(r.status, 409, 'a new party under legacy T3 spelling blocks a reopen on table 3');
assert.equal(sql.prepare("SELECT void_ts FROM sales WHERE id='sale-alias'").get().void_ts, null);
sql.prepare("UPDATE table_sessions SET status='closed',closed_by='manual',closed_ts=? WHERE id='tsx-alias-party'").run(now);

seed('sale-old', 'tsx-old', '2', 3, 'cash');
sql.prepare("UPDATE sales SET ts=? WHERE id='sale-old'").run(now - 3 * 86400000);
r = await voidAndReopen('sale-old', '2');
assert.equal(r.status, 409, 'previous business day cannot reopen');
assert.equal(sql.prepare("SELECT void_ts FROM sales WHERE id='sale-old'").get().void_ts, null);

seed('sale-open-part', 'tsx-open-part', '3', 2, 'cash');
sql.prepare("UPDATE table_sessions SET status='open',closed_by='',closed_ts=NULL WHERE id='tsx-open-part'").run();
r = await voidAndReopen('sale-open-part', '3');
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.body.sessionId, 'tsx-open-part', 'an already-open visit is not duplicated');
sql.prepare("UPDATE table_sessions SET status='closed',closed_by='service-payment',closed_ts=? WHERE id='tsx-open-part'").run(now);
const openRetry = await voidAndReopen('sale-open-part', '3');
assert.equal(openRetry.status, 200, JSON.stringify(openRetry));
assert.equal(openRetry.body.sessionId, 'tsx-open-part', 'retry stays idempotent after the visit closes');

seed('sale-open-legacy', 'tsx-open-legacy', 'T3', 2, 'cash');
sql.prepare("UPDATE table_sessions SET status='open',closed_by='',closed_ts=NULL WHERE id='tsx-open-legacy'").run();
r = await voidAndReopen('sale-open-legacy', '3');
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.body.sessionId, 'tsx-open-legacy', 'legacy table spelling keeps its already-open visit');
assert.equal(r.body.floorPending, undefined, 'waiter floor accepts the same visit under its legacy table alias');
sql.prepare("UPDATE table_sessions SET status='closed',closed_by='service-payment',closed_ts=? WHERE id='tsx-open-legacy'").run(now);

seed('sale-open-duplicate', 'tsx-open-duplicate', '3', 2, 'cash');
sql.prepare("UPDATE table_sessions SET status='open',closed_by='',closed_ts=NULL WHERE id='tsx-open-duplicate'").run();
sql.prepare("INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES ('tsx-open-duplicate-other',?,'table','T3','open',?,?)")
  .run(merchant, now, now);
r = await voidAndReopen('sale-open-duplicate', '3');
assert.equal(r.status, 409, 'an already-open visit cannot hide a second party under a table alias');
assert.equal(sql.prepare("SELECT void_ts FROM sales WHERE id='sale-open-duplicate'").get().void_ts, null);
sql.prepare("UPDATE table_sessions SET status='closed',closed_by='manual',closed_ts=? WHERE id IN ('tsx-open-duplicate','tsx-open-duplicate-other')").run(now);

seed('sale-raced', 'tsx-raced', '3', 6, 'cash');
const originalBatch = DB.batch;
let raced = false;
DB.batch = function(statements) {
  if (!raced) {
    raced = true;
    sql.prepare("INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES ('tsx-racing-party',?,'table','3','open',?,?)")
      .run(merchant, now + 1, now + 1);
  }
  return originalBatch(statements);
};
r = await voidAndReopen('sale-raced', '3');
DB.batch = originalBatch;
assert.equal(r.status, 409, JSON.stringify(r));
assert.equal(sql.prepare("SELECT void_ts FROM sales WHERE id='sale-raced'").get().void_ts, null,
  'occupancy race cannot void the receipt without reopening a bill');

sql.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='floorplan'")
  .run(JSON.stringify({ tables: [{ num: '1' }, { num: '2' }, { num: '3' }, { num: '4' }] }), merchant);
seed('sale-floor-retry', 'tsx-floor-retry', '4', 6, 'cash');
const originalPrepare = DB.prepare;
let failFloorOnce = true;
DB.prepare = function(query) {
  if (failFloorOnce && query.includes('UPDATE store_docs SET data = ?')) {
    failFloorOnce = false;
    throw new Error('synthetic floor write outage');
  }
  return originalPrepare.call(this, query);
};
r = await voidAndReopen('sale-floor-retry', '4');
DB.prepare = originalPrepare;
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.body.floorPending, true, 'post-void floor outage is explicit; cashier must not collect again');
assert.equal(sql.prepare("SELECT void_ts FROM sales WHERE id='sale-floor-retry'").get().void_ts > 0, true);
const floorRetry = await voidAndReopen('sale-floor-retry', '2');
assert.equal(floorRetry.status, 200, JSON.stringify(floorRetry));
assert.equal(floorRetry.body.replayed, true);
assert.equal(floorRetry.body.table, '4', 'audit directs a retry back to its existing table even if picker selection changed');
assert.equal(floorRetry.body.floorPending, undefined, 'retry republishes the waiter floor before cashier resumes');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM sale_audit WHERE sale_id='sale-floor-retry' AND action='reopen'").get().n, 1);

const legacyAudit = { DB: { prepare(query) {
  if (query.includes('a.amount_cents')) throw new Error('no such column: amount_cents');
  return { bind() { return { all() { return { results: [{ sale_id: 'legacy-centime',
    ref: 'Table 4 #88', amount: 4,
    impact: JSON.stringify({ sessionId: 'tsx-legacy-centime', totals: { amountCents: 425 }, lines: [] }),
  }] }; } }; } };
} } };
const legacyBills = await reopenedFloorBills(legacyAudit, merchant, [{ id: 'tsx-legacy-centime', table: '4' }], Date.now());
assert.equal(legacyBills[0].amountCents, 425, 'legacy whole-MAD audit column never rounds away centimes');

/* The till may trade outside Morocco. A sale before Casablanca's day boundary
 * can still belong to the current business day in the store's own zone. */
const fixedNow = Date.UTC(2026, 8, 26, 13);
const zonedSaleTime = fixedNow - 17 * 3600000;
assert.notEqual(businessDate(zonedSaleTime), businessDate(fixedNow));
assert.equal(businessDate(zonedSaleTime, 5, 'Pacific/Kiritimati'),
  businessDate(fixedNow, 5, 'Pacific/Kiritimati'));
sql.exec('ALTER TABLE merchant_config ADD COLUMN timezone TEXT');
sql.prepare("UPDATE merchant_config SET timezone='Pacific/Kiritimati' WHERE merchant=?").run(merchant);
sql.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='floorplan'")
  .run(JSON.stringify({ tables: [1, 2, 3, 4, 5].map(num => ({ num: String(num) })) }), merchant);
seed('sale-zoned', 'tsx-zoned', '5', 2, 'cash');
sql.prepare("UPDATE sales SET ts=? WHERE id='sale-zoned'").run(zonedSaleTime);
const realNow = Date.now;
Date.now = () => fixedNow;
try { r = await voidAndReopen('sale-zoned', '5'); }
finally { Date.now = realNow; }
assert.equal(r.status, 200, 'reopen follows the stored merchant zone rather than Morocco: ' + JSON.stringify(r));

sql.close();
console.log('restaurant reopen: 12 scenarios passed');
