#!/usr/bin/env node
/* Actual Pages Functions + in-memory D1 facade: one visit, three payments. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';
import * as sale from '../functions/api/sale.js';

const merchant = 'restaurant-payment-identity-fixture';
const secret = 'synthetic-payment-identity-only';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { args = values.map(v => v === undefined ? null : v); return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() { return { results: sqlite.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; }, async batch(statements) {
  sqlite.exec('BEGIN IMMEDIATE');
  try { const out = []; for (const statement of statements) out.push(await statement.run()); sqlite.exec('COMMIT'); return out; }
  catch (error) { sqlite.exec('ROLLBACK'); throw error; }
} };
const env = { DB, AUTH_SECRET: secret };
const at = Date.now();
sqlite.prepare("INSERT INTO merchant_config(merchant, features, status, updated_ts) VALUES (?, ?, 'active', ?)")
  .run(merchant, '{"orderpro":true}', at);
sqlite.prepare("INSERT INTO store_docs(merchant, feature, data, rev, updated_ts) VALUES (?, 'floorplan', ?, 1, ?)")
  .run(merchant, JSON.stringify({ tables: [{ id: 'T6', num: '6' }] }), at);
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(handler, body) {
  const request = new Request('https://kiwi.test/api/test', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await handler({ env, request, waitUntil() {} });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const order = await post(queue.onRequestPost, { merchant, create: { id: 'ord-probe-000001', mode: 'table', table: '6',
  lines: [{ id: 'p1', name: 'Penne', qty: 1, unitPrice: 90 }], total: 90 } });
assert.equal(order.status, 200, JSON.stringify(order));
const visit = sqlite.prepare("SELECT id FROM table_sessions WHERE merchant=? AND table_no='6' ORDER BY opened_ts DESC LIMIT 1")
  .get(merchant)?.id;
assert.ok(visit, 'queue created a table visit');
const payments = [
  { id: 'pay-card-90-a', ref: 'receipt-1', ts: at + 1, amount: 90, method: 'card' },
  { id: 'pay-cash-57-b', ref: 'receipt-2', ts: at + 2, amount: 57, method: 'cash' },
  { id: 'pay-card-90-c', ref: 'receipt-3', ts: at + 3, amount: 90, method: 'card' },
];
for (const payment of payments) {
  const result = await post(sale.onRequestPost, { merchant, table: '6', session: visit,
    ...payment, amountCents: payment.amount * 100, label: payment.ref });
  assert.equal(result.status, 200, `${payment.id}: ${JSON.stringify(result)}`);
  assert.equal(result.body?.ok, true);
}
const rows = sqlite.prepare('SELECT id, amount_cents, method, ref FROM sales WHERE merchant=? ORDER BY ts').all(merchant);
assert.equal(rows.length, 3, JSON.stringify(rows));
assert.equal(new Set(rows.map(row => row.id)).size, 3);
for (const payment of payments) {
  const replay = await post(sale.onRequestPost, { merchant, table: '6', session: visit,
    ...payment, amountCents: payment.amount * 100, label: payment.ref });
  assert.equal(replay.status, 200, `${payment.id} retry: ${JSON.stringify(replay)}`);
}
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(merchant).n, 3);

// A queued pre-upgrade receipt retains its visit ID. A different payment with
// that same key must be remapped, including when only the ref/ts differs.
const legacy = 'visit-' + visit + '-emp';
sqlite.prepare(`INSERT INTO sales(id,merchant,amount,amount_cents,method,ref,ts,session_id)
  VALUES(?,?,?,?,?,?,?,?)`).run(legacy, merchant, 40, 4000, 'cash', 'old-ticket', at - 1000, visit);
const stuck = { merchant, table: '6', session: visit, id: legacy, amount: 40,
  amountCents: 4000, method: 'cash', ref: 'later-ticket', ts: at + 4000 };
const recovered = await post(sale.onRequestPost, stuck);
assert.equal(recovered.status, 200, JSON.stringify(recovered));
assert.notEqual(recovered.body.id, legacy);
const recoveredAgain = await post(sale.onRequestPost, stuck);
assert.equal(recoveredAgain.body.id, recovered.body.id);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(merchant).n, 5);
const sameOld = await post(sale.onRequestPost, { ...stuck, ref: 'old-ticket', ts: at - 1000 });
assert.equal(sameOld.body.id, legacy);
const [concurrentA, concurrentB] = await Promise.all([
  post(sale.onRequestPost, { ...stuck, ref: 'third-ticket', ts: at + 4100 }),
  post(sale.onRequestPost, { ...stuck, ref: 'fourth-ticket', ts: at + 4200 }),
]);
assert.equal(concurrentA.status, 200);
assert.equal(concurrentB.status, 200);
assert.notEqual(concurrentA.body.id, concurrentB.body.id);

// The visit is only a link. Two separate split flows can use part 0 on it.
for (const [flowId, ts] of [['split-flow-first', at + 5000], ['split-flow-second', at + 6000]]) {
  const result = await post(sale.onRequestPost, { merchant, table: '6', session: visit,
    id: 'pay-' + flowId, split: { index: 0, count: 1, flowId },
    amount: 20, amountCents: 2000, method: 'cash', ref: flowId, ts });
  assert.equal(result.status, 200, JSON.stringify(result));
}
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(merchant).n, 9);

// Cashier and waiter may each submit the same bill with different local IDs.
const bill = { merchant, table: '6', session: visit, amount: 35,
  amountCents: 3500, method: 'card', ts: at + 7000 };
const cashier = await post(sale.onRequestPost, { ...bill, id: 'caisse-payment-86', ref: 'Table 6 #86' });
const waiter = await post(sale.onRequestPost, { ...bill, id: 'employee-payment-86', ref: '86', ts: bill.ts + 1000 });
assert.equal(cashier.status, 200);
assert.equal(waiter.status, 200);
assert.equal(waiter.body.id, cashier.body.id);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(merchant).n, 10);
const afterClose = await post(sale.onRequestPost, { ...bill, id: 'late-replay-86', ref: 'Table 6 #86' });
assert.equal(afterClose.body.id, cashier.body.id);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(merchant).n, 10);
const concurrentBill = { merchant, table: '6', session: visit, amount: 44,
  amountCents: 4400, method: 'cash', ts: at + 8000 };
const simultaneous = await Promise.all([
  post(sale.onRequestPost, { ...concurrentBill, id: 'caisse-payment-87', ref: 'Table 6 #87' }),
  post(sale.onRequestPost, { ...concurrentBill, id: 'employee-payment-87', ref: '87' }),
]);
assert.ok(simultaneous.every(result => [200, 503].includes(result.status)), JSON.stringify(simultaneous));
const settled = await Promise.all([
  post(sale.onRequestPost, { ...concurrentBill, id: 'caisse-payment-87', ref: 'Table 6 #87' }),
  post(sale.onRequestPost, { ...concurrentBill, id: 'employee-payment-87', ref: '87' }),
]);
assert.equal(settled[0].status, 200);
assert.equal(settled[1].status, 200);
assert.equal(settled[0].body.id, settled[1].body.id);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(merchant).n, 11);
// A voided payment releases its bill: the corrected payment is a new receipt,
// and a replay of that correction stays one row.
const voided = settled[0].body.id;
sqlite.prepare("UPDATE sales SET void_ts=?, void_reason='erreur' WHERE id=?").run(at + 9000, voided);
const correction = { ...concurrentBill, id: 'caisse-correction-87', ref: 'Table 6 #87', method: 'card', ts: at + 10000 };
const corrected = await post(sale.onRequestPost, correction);
assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
assert.equal(corrected.body.id, 'caisse-correction-87');
assert.equal((await post(sale.onRequestPost, correction)).body.id, 'caisse-correction-87');
const secondCorrection = await post(sale.onRequestPost, { ...correction, id: 'other-correction-87', method: 'cash', ts: at + 11000 });
assert.equal(secondCorrection.status, 409, 'a live payment still holds the bill');
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=? AND void_ts IS NULL').get(merchant).n, 11);
// The customer has paid on the till. Missing or stale operational metadata
// must never erase that financial event from the central ledger.
const orphan = { merchant, table: '6', session: 'deleted-visit-for-paid-receipt',
  id: 'paid-with-missing-visit', ref: 'paid-ticket-1', ts: at,
  amount: 63, amountCents: 6300, method: 'cash', lines: [{ n: 'Penne', q: 1, t: 63 }] };
const orphanResult = await post(sale.onRequestPost, orphan);
assert.equal(orphanResult.status, 200, JSON.stringify(orphanResult));
assert.equal(orphanResult.body.visitLinkWarning, 'table-session-missing');
assert.equal(sqlite.prepare('SELECT amount_cents FROM sales WHERE merchant=? AND id=?')
  .get(merchant, orphan.id)?.amount_cents, 6300);
const orphanReplay = await post(sale.onRequestPost, orphan);
assert.equal(orphanReplay.status, 200);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=? AND id=?')
  .get(merchant, orphan.id).n, 1);
const wrongTable = await post(sale.onRequestPost, { ...orphan, id: 'paid-with-wrong-table',
  session: visit, table: '7', ref: 'paid-ticket-2', ts: at + 20000 });
assert.equal(wrongTable.status, 200, JSON.stringify(wrongTable));
assert.equal(wrongTable.body.visitLinkWarning, 'service-session-table-mismatch');
assert.equal(sqlite.prepare('SELECT session_id FROM sales WHERE merchant=? AND id=?')
  .get(merchant, 'paid-with-wrong-table')?.session_id, null);
sqlite.close();
console.log('✓ restaurant payment identity and paid receipts with missing table visits');
