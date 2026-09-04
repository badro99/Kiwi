#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as refundPost } from '../functions/api/sale/refund.js';
import { onRequestPost as pinPost } from '../functions/api/pin/verify.js';
import { onRequestGet as feedGet } from '../functions/api/feed.js';
import { tillToken } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));

const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      sql,
      bind(...values) { args = values; statement.args = values; return statement; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const out = statements.map((statement) => statement.run());
      sqlite.exec('COMMIT');
      return out;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};

const secret = 'refund-reporting-secret';
const merchant = 'pasta-corner';
const cookie = `kiwi_till=${await tillToken(secret, merchant)}`;
sqlite.prepare(`INSERT INTO sales
  (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run('sale-90', merchant, 90, 9000, 'cash', 'À emporter #1', '260904-0001', Date.now() - 60000,
       '[{"n":"Prépare ton Plat","q":1,"t":90}]', 'takeaway');
sqlite.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?, ?, ?, ?, ?, ?)')
  .run('staff-manager-1', merchant, '2819', 'Sara', 'manager', Date.now());

async function approvalFor(id, amountCents, originalSaleId) {
  const response = await pinPost({
    env: { DB, AUTH_SECRET: secret },
    request: new Request('https://kiwi.test/api/pin/verify', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        merchant, pin: '2819',
        action: { kind: 'refund', refundId: id, originalSaleId, amountCents },
      }),
    }),
  });
  const data = await response.json();
  return data.approval || '';
}

async function refund(id, amountCents, originalSaleId = 'sale-90', useApproval = true) {
  const approval = useApproval ? await approvalFor(id, amountCents, originalSaleId) : '';
  return refundPost({
    env: { DB, AUTH_SECRET: secret },
    request: new Request('https://kiwi.test/api/sale/refund', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        merchant, id, originalSaleId, amountCents, ref: `RB-${id}`, reason: 'Erreur de saisie',
        approval, actorId: 'forged-manager', actor: 'Forged', actorRole: 'owner', ts: Date.now(),
      }),
    }),
  });
}

let checks = 0;
function ok(label, condition) { assert.ok(condition, label); checks++; console.log('  ✓ ' + label); }

let response = await refund('refund-35', 3500);
ok('manager-approved refund is accepted', response.status === 200 && (await response.json()).ok === true);
let row = sqlite.prepare("SELECT amount, amount_cents, channel FROM sales WHERE id='refund-35'").get();
ok('refund is a negative immutable row in the financial feed', row.amount === -35 && row.amount_cents === -3500 && row.channel === 'refund');
ok('refund audit retains original sale, amount and actor', (() => {
  const audit = sqlite.prepare("SELECT sale_id, action, amount_cents, actor_id FROM sale_audit WHERE note='refund-35'").get();
  return audit && audit.sale_id === 'sale-90' && audit.action === 'refund' && audit.amount_cents === 3500 && audit.actor_id === 'staff-manager-1';
})());

response = await refund('refund-35', 3500);
ok('lost-response retry remains 200 and idempotent', response.status === 200);
ok('retry creates one refund row and one audit row',
  sqlite.prepare("SELECT COUNT(*) AS n FROM sales WHERE id='refund-35'").get().n === 1
  && sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE note='refund-35'").get().n === 1);

response = await refund('refund-55', 5500);
ok('a second partial refund may consume the exact remaining value', response.status === 200);
response = await refund('refund-over', 1);
ok('cumulative refunds cannot exceed the original sale', response.status === 409);
ok('rejected over-refund writes neither ledger nor audit',
  !sqlite.prepare("SELECT id FROM sales WHERE id='refund-over'").get()
  && !sqlite.prepare("SELECT id FROM sale_audit WHERE note='refund-over'").get());

sqlite.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts) VALUES ('sale-other', ?, 50, 5000, 'cash', 'Other', 'O-1', ?)")
  .run(merchant, Date.now());
response = await refund('refund-35', 3500, 'sale-other');
ok('an idempotency key cannot be relinked to another original sale', response.status === 409);

response = await refund('refund-no-manager', 1, 'sale-90', false);
ok('a browser-forged manager identity fails without a signed approval', response.status === 403);
const boundApproval = await approvalFor('refund-bound', 100, 'sale-90');
response = await refundPost({
  env: { DB, AUTH_SECRET: secret },
  request: new Request('https://kiwi.test/api/sale/refund', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      merchant, id: 'refund-bound', originalSaleId: 'sale-90', amountCents: 101,
      approval: boundApproval, actorId: 'forged-manager', actorRole: 'owner',
    }),
  }),
});
ok('signed manager approval cannot be reused for an altered amount', response.status === 403);
response = await refund('refund-foreign', 100, 'other-merchant-sale');
ok('unknown or foreign original sale cannot receive a refund', response.status === 404);

sqlite.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts) VALUES ('sale-voided', ?, 20, 2000, 'cash', 'Voided', 'V-1', ?, ?)")
  .run(merchant, Date.now(), Date.now());
response = await refund('refund-voided', 100, 'sale-voided');
ok('a voided sale cannot also be refunded', response.status === 404);

const feedResponse = await feedGet({
  env: { DB, AUTH_SECRET: secret },
  request: new Request(`https://kiwi.test/api/feed?merchant=${merchant}&since=0`, { headers: { cookie } }),
});
const feed = await feedResponse.json();
ok('the normal merchant feed returns refund counter-entries with signed centimes',
  feed.sales.some((sale) => sale.id === 'refund-35' && sale.amountCents === -3500 && sale.amount === -35));

/* Execute the shipped browser module: the original sale must enter the same
   queue before its refund, and the PIN itself must never appear in either body. */
const source = fs.readFileSync(path.join(ROOT, 'assets/live-link.js'), 'utf8');
const queued = [];
const storage = { kiwiLive: '1', kiwiPairedVenue: JSON.stringify({ merchant }) };
const window = {
  location: { hostname: 'kiwi-os.com', search: '' },
  localStorage: { getItem: (k) => storage[k] || null, setItem: (k, v) => { storage[k] = String(v); }, removeItem: (k) => { delete storage[k]; } },
  addEventListener() {}, dispatchEvent() {}, KiwiEnv: { isReal: () => true },
};
const document = { readyState: 'complete', addEventListener() {}, dispatchEvent() {}, getElementById: () => null };
window.document = document;
const context = vm.createContext({ window, document, localStorage: window.localStorage, location: window.location,
  navigator: { onLine: false }, CustomEvent: function () {}, BroadcastChannel: undefined,
  fetch: async () => ({ ok: true, json: async () => ({ sales: [], cursor: 0, voided: [] }) }),
  console, Date, Math, Number, String, Array, JSON,
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} });
vm.runInContext(source, context, { filename: 'assets/live-link.js' });
const original = { id: 'local-sale-90', amount: 90, ref: '260904-0001', time: new Date(), label: 'À emporter #1' };
const refundEntry = { id: 'local-refund-35', amount: -35, ref: '260904-0002-PY', time: new Date(), reason: 'Erreur de saisie' };
context.window.KiwiLive.postRefund(refundEntry, original, {
  id: 'staff-manager-1', name: 'Sara', role: 'manager', approval: 'signed-test-proof',
});
queued.push(...JSON.parse(storage.kiwiSaleQueue || '[]'));
ok('client queues the original before the refund', queued.length === 2 && queued[0].kind !== 'refund' && queued[1].kind === 'refund');
ok('durable refund command contains signed approval but never the manager PIN',
  queued[1].actorId === 'staff-manager-1' && queued[1].approval
  && !('pin' in queued[1]) && !JSON.stringify(queued).includes('2819'));
const refusedBefore = JSON.parse(storage.kiwiSaleQueue || '[]').length;
const refused = context.window.KiwiLive.postRefund(
  { id: 'legacy-without-proof', amount: -10, ref: 'LEGACY-RB', time: new Date() }, original,
  { id: 'staff-manager-1', name: 'Sara', role: 'manager' },
);
ok('an unsigned legacy refund never pollutes the durable outbox',
  refused && refused.ok === false && refused.reason === 'manager-approval-required'
  && JSON.parse(storage.kiwiSaleQueue || '[]').length === refusedBefore);
context.window.KiwiLive.postRefund(refundEntry, original, {
  id: 'staff-manager-1', name: 'Sara', role: 'manager', approval: 'fresh-signed-proof',
}, { replaceExisting: true });
const refreshedQueue = JSON.parse(storage.kiwiSaleQueue || '[]');
ok('manager reconciliation replaces the same queued refund instead of adding another',
  refreshedQueue.length === 2 && refreshedQueue.filter((row) => row.id === queued[1].id).length === 1
  && refreshedQueue.find((row) => row.id === queued[1].id).approval === 'fresh-signed-proof');

/* The same shipped feed bridge must keep the negative row out of KiwiSales
   (product counts) while placing it in KiwiRefunds (revenue/reporting). */
const bridgedSales = [];
const bridgedRefunds = [];
const bridgeStorage = { kiwiLive: '1', kiwiPairedVenue: JSON.stringify({ merchant }) };
const bridgeDocument = { readyState: 'complete', addEventListener() {}, dispatchEvent() {}, getElementById: () => null };
const bridgeWindow = {
  location: { hostname: 'kiwi-os.com', search: '' }, document: bridgeDocument,
  localStorage: { getItem: (k) => bridgeStorage[k] || null, setItem: (k, v) => { bridgeStorage[k] = String(v); }, removeItem: (k) => { delete bridgeStorage[k]; } },
  addEventListener() {}, dispatchEvent() {}, KiwiEnv: { isReal: () => true },
  KiwiVenue: { getVenue: () => 'pasta-corner', isCustom: () => true },
  KiwiSales: { list: () => [], add: (_id, sale) => bridgedSales.push(sale), annotate() {}, retainCursors() {} },
  KiwiRefunds: { list: () => [], add: (_id, event) => bridgedRefunds.push(event), retainCursors() {} },
  Kiwi: { toast() {} },
};
const bridgeContext = vm.createContext({ window: bridgeWindow, document: bridgeDocument,
  localStorage: bridgeWindow.localStorage, location: bridgeWindow.location, navigator: { onLine: true },
  CustomEvent: function () {}, BroadcastChannel: undefined,
  fetch: async () => ({ ok: true, json: async () => ({ merchant, cursor: 2, voided: [], sales: [
    { cursor: 1, id: 'sale-positive', amount: 90, amountCents: 9000, method: 'cash', ts: Date.now() - 10 },
    { cursor: 2, id: 'sale-refund', amount: -35, amountCents: -3500, method: 'cash', ts: Date.now() },
  ] }) }), console, Date, Math, Number, String, Array, JSON,
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} });
vm.runInContext(source, bridgeContext, { filename: 'assets/live-link.js' });
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
ok('feed bridge keeps refunds out of product sales and in the refund ledger',
  bridgedSales.length === 1 && bridgedSales[0].amount === 90
  && bridgedRefunds.length === 1 && bridgedRefunds[0].amount === 35);

const caisse = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const offlineDb = fs.readFileSync(path.join(ROOT, 'assets/offline-db.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
const report = fs.readFileSync(path.join(ROOT, 'assets/report.js'), 'utf8');
const transactions = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
ok('provisional heartbeat heals sales skipped before merchant resolution', /reconcileJournalSales\(true\)/.test(caisse));
ok('refund approval persists signed manager proof for crash-safe replay',
  /refundActor:\s*\{/.test(caisse) && /approval:\s*String\(manager\.approval/.test(caisse)
  && /postRefund\(entry, orig, actor\)/.test(caisse));
ok('old local refunds expose an exact manager-approved reconciliation action',
  /id="rf-recovery"/.test(caisse) && /data-rf-recover/.test(caisse)
  && /requireManager\('Synchroniser le remboursement/.test(caisse)
  && /postRefund\?\.\(entry, original, manager, \{ replaceExisting: true \}\)/.test(caisse));
ok('refund reconciliation metadata survives a till reload',
  /if \(e\.serverSaleId\)\s+entry\.serverSaleId/.test(caisse)
  && /if \(e\.refundActor/.test(caisse) && /if \(e\.refundSynced\)/.test(caisse));
ok('accepted server/feed evidence retires the capability and closes recovery',
  /kiwi:money-sync/.test(caisse) && /entry\.refundSynced = true/.test(caisse)
  && /entry\.refundActor\.approval = ''/.test(caisse));
ok('IndexedDB refreshes only the same scoped command during manager reconciliation',
  /opts\.replaceExisting/.test(offlineDb) && /existing\.tenant !== scope\.tenant/.test(offlineDb)
  && /payload: clone\(payload\), state: 'pending'/.test(offlineDb));
ok('dashboard revenue subtracts its dedicated refund store', /realRefundList\(\)/.test(dashboard) && /revenue\s*-=?\s*Math\.abs/.test(dashboard));
ok('generated reports consume signed refund events', /KiwiRefunds/.test(report) && /out\.revenue\s*\+=\s*amount/.test(report));
ok('dashboard transaction rows render refunds without counting them as sales', /const refunds\s*=/.test(transactions) && /kind\s*!==\s*'refund'/.test(transactions));

console.log(`\n✓ ${checks} refund reporting checks green`);
