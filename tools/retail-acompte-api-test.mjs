#!/usr/bin/env node
// #94b: a 1,000 MAD bill is two immutable receipts on two business days.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../functions/api/sale.js';
import { onRequestGet } from '../functions/api/retail-balances.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(statement) { let args = []; const q = {
  bind(...values) { args = values; return q; },
  first() { return sql.prepare(statement).get(...args) || null; },
  all() { return { results: sql.prepare(statement).all(...args) }; },
  run() { return { meta: { changes: sql.prepare(statement).run(...args).changes } }; },
}; return q; } };
const merchant = 'acompte-fixture';
const env = { DB, AUTH_SECRET: 'synthetic-acompte-secret' };
sql.prepare("INSERT INTO merchant_config(merchant,features,status,updated_ts) VALUES (?,'{}','active',?)")
  .run(merchant, Date.now());
sql.prepare("INSERT INTO clients(merchant,id,name,updated_ts) VALUES (?,?,?,?)")
  .run(merchant, 'client-001', 'TEST KIWI customer', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
const bill = { id: 'balance-test-0001', customerId: 'client-001', ticketRef: 'TEST-KIWI-1000', totalCents: 100000 };
async function post(id, cents, method, day, stage, extra = {}) {
  const request = new Request('https://kiwi.test/api/sale', { method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, id, amountCents: cents, amount: cents / 100,
      ticketAmountCents: cents, paymentParts: [{ method, amountCents: cents }], method,
      label: stage === 'open' ? 'Acompte · TEST KIWI' : 'Règlement acompte',
      ref: bill.ticketRef, ts: Date.parse(day + 'T12:00:00Z'),
      retailBalance: { ...bill, stage },
      lines: stage === 'open' ? [{ name: 'TEST KIWI item', qty: 1, total: 1000 }] : undefined,
      ...extra }),
  });
  const response = await onRequestPost({ request, env, waitUntil() {} });
  return { status: response.status, body: await response.json() };
}
async function balance() {
  const request = new Request('https://kiwi.test/api/retail-balances?merchant=' + merchant + '&q=TEST-KIWI-1000',
    { headers: { cookie } });
  const response = await onRequestGet({ request, env });
  assert.equal(response.status, 200, 'paired till can retrieve its own open bill');
  return (await response.json()).balances[0];
}

let r = await post('acompte-cash-300', 30000, 'cash', '2026-09-26', 'open');
assert.equal(r.status, 200, `first cash receipt accepted: ${JSON.stringify(r)}`);
assert.equal(sql.prepare("SELECT amount_cents FROM sales WHERE id='acompte-cash-300'").get().amount_cents, 30000);
assert.equal((await balance()).balanceCents, 70000, '700 MAD remains server-side');
r = await post('acompte-cash-300', 30000, 'cash', '2026-09-26', 'open');
assert.equal(r.status, 200, 'same receipt retries idempotently');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM retail_balance_receipts").get().n, 1);
r = await post('acompte-cash-300', 30000, 'cash', '2026-09-26', 'open', {
  retailBalance: { ...bill, id: 'balance-test-0002', ticketRef: 'TEST-KIWI-other', stage: 'open' },
});
assert.equal(r.status, 409, 'a reused receipt id cannot move to a different open bill');
r = await post('acompte-too-much', 80000, 'transfer', '2026-09-27', 'payment');
assert.equal(r.status, 409, 'overpayment rejected before inserting a sale');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM sales WHERE id='acompte-too-much'").get().n, 0);
r = await post('acompte-transfer-700', 70000, 'transfer', '2026-09-27', 'payment');
assert.equal(r.status, 200, `second transfer receipt accepted: ${JSON.stringify(r)}`);
assert.equal(await balance(), undefined, 'open bill closes after second receipt');
assert.deepEqual(sql.prepare('SELECT id,amount_cents,method FROM sales WHERE merchant=? ORDER BY ts').all(merchant)
  .map(row => [row.id, row.amount_cents, row.method]), [
    ['acompte-cash-300', 30000, 'cash'], ['acompte-transfer-700', 70000, 'transfer'],
  ], 'one sale row per payment, by its own day and method');

const secondBill = { ...bill, id: 'balance-test-0003', ticketRef: 'TEST-KIWI-capacity' };
await post('capacity-open-300', 30000, 'cash', '2026-09-26', 'open', { retailBalance: { ...secondBill, stage: 'open' } });
const contenders = await Promise.all([
  post('capacity-claim-a', 40000, 'card', '2026-09-27', 'payment', { retailBalance: { ...secondBill, stage: 'payment' } }),
  post('capacity-claim-b', 40000, 'card', '2026-09-27', 'payment', { retailBalance: { ...secondBill, stage: 'payment' } }),
]);
assert.deepEqual(contenders.map(x => x.status).sort(), [200, 409], 'two tills cannot overspend one remaining balance');

const memory = new Map();
const storage = { getItem: key => memory.get(key) || null, setItem: (key,value) => memory.set(key,value), removeItem: key => memory.delete(key) };
const window = { localStorage: storage, addEventListener() {}, dispatchEvent() {},
  KiwiEnv: { isReal: () => true }, KiwiLive: { merchant: () => merchant },
  KiwiPlatform: { pairedMerchant: () => merchant } };
vm.runInNewContext(fs.readFileSync(new URL('../assets/day-report.js', import.meta.url), 'utf8'),
  { window, localStorage: storage, Date, Intl, crypto: globalThis.crypto, TextEncoder, CustomEvent: class {} });
const localWindow = { localStorage: storage };
vm.runInNewContext(fs.readFileSync(new URL('../assets/retail-balances.js', import.meta.url), 'utf8'), {
  window: localWindow, localStorage: storage, navigator: { onLine: true },
  fetch: async () => ({ ok: true, json: async () => ({ balances: [{
    ...bill, paidCents: 30000, pendingCents: 0, balanceCents: 70000, receiptIds: ['local-cash'],
  }] }) }),
});
const local = localWindow.KiwiRetailBalances;
assert.ok(local.record(merchant, { ...bill, receipt: {
  id: 'local-cash', amountCents: 30000, method: 'cash' } }));
assert.ok(local.record(merchant, { ...bill, receipt: {
  id: 'local-transfer', amountCents: 70000, method: 'transfer' } }));
assert.equal((await local.list(merchant)).length, 0,
  'stale server GET cannot reopen money already collected in the local outbox');
assert.equal(local.record(merchant, { ...bill, receipt: {
  id: 'local-transfer', amountCents: 70000, method: 'transfer' } }).paidCents, 100000,
  'a retried local receipt does not double-count');
const receipts = sql.prepare('SELECT id,ts,amount_cents,method,label,ref FROM sales WHERE merchant=? ORDER BY ts').all(merchant)
  .filter(row => ['acompte-cash-300', 'acompte-transfer-700'].includes(row.id))
  .map(row => ({ ...row, amount: row.amount_cents / 100 }));
assert.equal(window.KiwiDayReport.settlementKey({ id: 'acompte-A', ref: bill.ticketRef,
  ts: 123, amount: 300, label: 'Acompte' }), '', 'independent payments are not fingerprint-deduplicated');
for (const [day, expected, method, outstanding] of [
  ['2026-09-26', 300, 'cash', 700], ['2026-09-27', 700, 'transfer', 0],
]) {
  const report = window.KiwiDayReport.build({ day, store: { slug: merchant, type: 'boutique' }, sales: receipts,
    session: { openingFloat: 0, acomptes: { outstanding } } });
  assert.equal(report.txns, 1, `${day} Z counts one received payment`);
  assert.equal(report.net, expected, `${day} Z and dashboard use received takings`);
  assert.equal(report.methods[method], expected, `${day} Z has its actual method`);
  assert.equal(report.acomptes.received, expected, `${day} Z displays acomptes received`);
  assert.equal(report.acomptes.outstanding, outstanding, `${day} Z displays outstanding balances`);
  assert.equal(report.cash.expected, method === 'cash' ? 300 : 0, `${day} drawer excludes transfer`);
}
console.log('✓ retail acompte API: 2 days, 2 distinct receipts, retry, overpayment and Z totals');
