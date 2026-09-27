#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE, managerRefundProof } from '../functions/auth/_lib.js';
import { onRequestPost } from '../functions/api/sale.js';
import { onRequestPost as refundPost } from '../functions/api/sale/refund.js';
import { onRequestGet } from '../functions/api/feed.js';
import { validateRetailTenders, retailTenderMethod } from '../functions/api/_retail-tenders.js';

const read = name => fs.readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');
const memory = new Map();
const storage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
const posted = [];
const window = {
  localStorage: storage, addEventListener() {}, dispatchEvent() {},
  KiwiEnv: { isReal: () => true },
  KiwiLive: { isOn: () => true, merchant: () => 'test-retail', postSale: body => { posted.push(body); return { id: 'posted-id' }; } },
  KiwiPlatform: { pairedMerchant: () => 'test-retail' },
};
const context = vm.createContext({ window, localStorage: storage, Date, Intl, crypto: globalThis.crypto, TextEncoder, CustomEvent: class {} });
vm.runInContext(read('pos-sale.js'), context);
for (const [raw, expected] of [['virement', 'transfer'], ['chèque', 'cheque']]) {
  const entry = window.KiwiPosSale.record('test', { total: 10, method: raw, label: 'TEST', ref: raw });
  assert.equal(entry.method, expected, `${raw} retains its own payment identity`);
  assert.equal(posted.at(-1).method, expected, `${raw} reaches the outbox unchanged`);
}

vm.runInContext(read('day-report.js'), context);
const report = window.KiwiDayReport.build({
  day: '2026-09-14', store: { slug: 'test-retail', type: 'boutique' },
  sales: [{ id: 'split-one', ts: Date.parse('2026-09-14T13:00:00Z'), amount: 60, method: 'split',
    parts: [{ method: 'cash', amountCents: 2000 }, { method: 'transfer', amountCents: 2500 }, { method: 'cheque', amountCents: 1500 }],
    lines: [{ name: 'TEST item', qty: 1, total: 60 }] }],
  session: { openingFloat: 0, countedCash: 20 },
});
assert.equal(report.txns, 1, 'a split is one receipt');
assert.equal(report.net, 60, 'a split contributes its total once');
assert.equal(report.methods.cash, 20, 'cash share reaches Z');
assert.equal(report.methods.transfer, 25, 'bank transfer share reaches Z');
assert.equal(report.methods.cheque, 15, 'cheque share reaches Z');
assert.equal(report.cash.expected, 20, 'only cash is expected in the drawer');
const creditMix = window.KiwiDayReport.build({
  day: '2026-09-14', store: { slug: 'test-retail', type: 'boutique' },
  sales: [{ id: 'cash-and-credit', ts: Date.parse('2026-09-14T13:00:00Z'), amount: 20,
    method: 'split', paymentParts: [{ method: 'cash', amountCents: 2000 }, { method: 'credit', amountCents: 2000 }] }],
  session: { openingFloat: 0, countedCash: 20 },
});
assert.equal(creditMix.net, 20, 'server-backed report keeps only received revenue');
assert.equal(creditMix.methods.cash, 20, 'server-backed report keeps the cash share');
assert.equal(creditMix.receivable, 0, 'server-backed report does not subtract store credit twice');
const parts = [{ method: 'cash', amountCents: 2000 }, { method: 'transfer', amountCents: 2500 }, { method: 'cheque', amountCents: 1500 }];
assert.equal(retailTenderMethod(parts), 'split', 'the cloud receipt keeps one split identity');
assert.deepEqual(validateRetailTenders(parts, 6000, 6000, 0), parts, 'the server accepts an exactly allocated split');
assert.equal(validateRetailTenders(parts, 5900, 6000, 0), false, 'the server rejects missing money');
assert.equal(validateRetailTenders(parts, 6000, 6500, 0), false, 'the server rejects unallocated ticket balance');
assert.equal(validateRetailTenders([{ method: 'cheque', amountCents: 1000 }], 1000, 1000, 0)[0].method,
  'cheque', 'the server keeps cheque distinct from wallet');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { args = values.map(value => value === undefined ? null : value); return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() { return { results: sqlite.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; }, async batch(statements) {
  sqlite.exec('BEGIN IMMEDIATE');
  try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
  catch (error) { sqlite.exec('ROLLBACK'); throw error; }
} };
const merchant = 'retail-tender-fixture';
const secret = 'synthetic-retail-tender-only';
const env = { DB, AUTH_SECRET: secret };
sqlite.prepare("INSERT INTO merchant_config(merchant, features, status, updated_ts) VALUES (?, ?, 'active', ?)")
  .run(merchant, '{}', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(id, method, paymentParts, amountCents) {
  const request = new Request('https://kiwi.test/api/sale', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, id, method, paymentParts, amountCents,
      ticketAmountCents: amountCents, consignedAmountCents: 0, label: 'TEST item', ref: id,
      ts: Date.now(), lines: [{ name: 'TEST item', qty: 1, total: amountCents / 100 }] }),
  });
  const response = await onRequestPost({ request, env, waitUntil() {} });
  return { status: response.status, body: await response.json() };
}
for (const [id, method, cents] of [['transfer-one', 'transfer', 1000], ['cheque-one', 'cheque', 1500]]) {
  const result = await post(id, method, [{ method, amountCents: cents }], cents);
  assert.equal(result.status, 200, `${method} persists: ${JSON.stringify(result)}`);
  assert.equal(sqlite.prepare('SELECT method FROM sales WHERE id=?').get(id).method, method);
}
const split = await post('split-one', 'split', parts, 6000);
assert.equal(split.status, 200, `split persists: ${JSON.stringify(split)}`);
assert.deepEqual(JSON.parse(sqlite.prepare('SELECT payment_parts FROM sales WHERE id=?').get('split-one').payment_parts), parts);
assert.equal((await post('split-one', 'split', parts, 6000)).status, 200, 'retry is idempotent');
assert.equal((await post('split-one', 'split', [...parts.slice(0, 2), { method: 'cheque', amountCents: 1400 }], 6000)).status,
  400, 'a changed tender allocation cannot overwrite an accepted receipt');
const feedRequest = new Request(`https://kiwi.test/api/feed?merchant=${merchant}`, { headers: { Cookie: cookie } });
const feed = await onRequestGet({ request: feedRequest, env });
assert.equal(feed.status, 200);
const ledger = await feed.json();
assert.equal(ledger.sales.length, 3, 'two full tenders and one split remain three receipts');
assert.deepEqual(ledger.sales.find(row => row.id === 'split-one').paymentParts, parts,
  'the dashboard feed receives the tender breakdown');

const refundId = 'refund-transfer-one';
const approval = await managerRefundProof(secret, { merchant, staffId: 'synthetic-manager', staffName: 'Fixture Manager',
  staffRole: 'manager', refundId, originalSaleId: 'transfer-one', amountCents: 500, refundMethod: 'transfer' });
const refundRequest = new Request('https://kiwi.test/api/sale/refund', { method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ merchant, id: refundId, originalSaleId: 'transfer-one', amountCents: 500,
    refundMethod: 'transfer', approval, reason: 'TEST', ref: 'TEST-RETURN' }),
});
const refundResponse = await refundPost({ request: refundRequest, env });
assert.equal(refundResponse.status, 200, `manager-approved transfer refund: ${await refundResponse.text()}`);
assert.equal(sqlite.prepare('SELECT method FROM sales WHERE id=?').get(refundId).method, 'transfer',
  'a transfer refund never becomes a cash-drawer movement');
const refundRetry = new Request('https://kiwi.test/api/sale/refund', { method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ merchant, id: refundId, originalSaleId: 'transfer-one', amountCents: 500,
    refundMethod: 'transfer', approval, reason: 'TEST', ref: 'TEST-RETURN' }),
});
assert.equal((await refundPost({ request: refundRetry, env })).status, 200,
  'repeating a transfer refund cannot duplicate it');
const omittedMethod = new Request('https://kiwi.test/api/sale/refund', { method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ merchant, id: refundId, originalSaleId: 'transfer-one', amountCents: 500,
    approval, reason: 'TEST', ref: 'TEST-RETURN' }),
});
assert.equal((await refundPost({ request: omittedMethod, env })).status, 403,
  'omitting the method cannot evade the manager-approved refund attribution');

const now = Date.now();
const dashboardRows = ledger.sales.map(row => ({
  ts: now, amount: row.amount, method: row.method, paymentParts: row.paymentParts,
}));
const dashWindow = {
  addEventListener() {}, dispatchEvent() {}, KiwiEnv: { isReal: () => true },
  KiwiVenue: { getVenue: () => 'retail-tender-fixture', getVenueType: () => 'boutique' },
  KiwiSales: { list: () => dashboardRows },
};
const dashContext = vm.createContext({ window: dashWindow,
  document: { readyState: 'loading', addEventListener() {}, querySelector() { return null; } },
  localStorage: storage, CustomEvent: class {}, Date, Map, Set, Intl, Math, Number, String, Array, Object,
  Infinity, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, console,
});
vm.runInContext(read('dateRange.js'), dashContext);
const mix = dashWindow.KiwiDateRange._truth.realMixRows('fr', 'aujourdhui');
assert.equal(mix.total, 85, 'dashboard payment total matches the three accepted receipts');
const shares = Object.fromEntries(mix.rows.map(row => [row.label, Math.round(row.pct * mix.total) / 100]));
assert.equal(shares['Espèces'], 20, 'dashboard shows the split cash part');
assert.equal(shares['Virement'], 35, 'dashboard keeps both transfer receipts and split part');
assert.equal(shares['Chèque'], 30, 'dashboard keeps both cheque receipts and split part');
console.log('✓ retail tender methods: transfer, cheque and split Z attribution');
