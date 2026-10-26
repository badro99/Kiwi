#!/usr/bin/env node
import maisonSource from './pos-maison-test-source.cjs';
/* Kiwi · retail-z-reconciliation-test
 *   node tools/retail-z-reconciliation-test.mjs
 *
 * The boutique and Maison tills never compared their receipts with the server
 * (z-reconciliation.js was wired into the restaurant till only): on 21 October
 * Santos Store had 211 sales in two weeks and Maison 121 had 13, with no row in
 * z_reconciliations for either. Both tills now queue the comparison.
 *
 * This suite takes bqZJournal / bqZQueue and the payment helpers out of the two
 * till files as they ship, runs them against the real z-reconciliation.js with
 * a stub outbox, and checks that each receipt is described the way postSale()
 * files it on the server: the server id, the money actually received (never a
 * credit note, a delivery still to collect, or a consigned share), the payment
 * method, voids removed, and nothing reported as « sent without a record ».
 * The browser half (sync-ledger-boutique-browser-test) proves the row ends
 * up « matched » against a real server. */
import assert from 'node:assert/strict';
import nativeFs from 'node:fs';
import queueCoreSource from './core-test-source.cjs';
const fs = { ...nativeFs, readFileSync: queueCoreSource.readFileSync };
import vm from 'node:vm';

const read = (p) => maisonSource(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const zSource = read('assets/z-reconciliation.js');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ✓ ' + msg); };

/* A function's whole text, from its `function name(` to the matching brace. */
function grab(src, name) {
  const start = src.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, `${name} not found`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`${name} never closes`);
}
const constLine = (src, name) => {
  const m = src.match(new RegExp('  const ' + name + ' = [^\\n]*'));
  assert.ok(m, `${name} not found`); return m[0];
};

const files = { boutique: read('assets/pos-boutique.js'), maison: read('assets/pos-maison.js') };
const NAMES = ['bqZJournal', 'bqZQueue'];
for (const n of NAMES) ok(grab(files.boutique, n) === grab(files.maison, n), `${n} is the same code in both tills`);
for (const [till, src] of Object.entries(files)) {
  const prov = grab(src, 'bqSaveProvisional');
  ok(/bqZQueue\(false\)/.test(prov) && prov.indexOf('bqZQueue(false)') < prov.indexOf('90000'),
    `${till} · every provisional save queues a snapshot, before the 90 s report throttle`);
  const close = grab(src, 'bqCloseRegister');
  ok(/bqZQueue\(true\)[\s\S]*bqShift = null/.test(close), `${till} · the close queues the closing comparison before the shift is cleared`);
}

const DAY = '2026-10-21';
const FROM = Date.parse('2026-10-21T04:00:00Z'), TO = Date.parse('2026-10-22T04:00:00Z');
const at = (h) => new Date(FROM + h * 3600000);

function run(src, sales, { demo = false } = {}) {
  const queued = [];
  const storage = new Map();
  const O = {
    available: () => true,
    enqueue(_c, _t, payload, opts) { queued.push({ id: opts.id, payload }); return Promise.resolve(); },
    claim: () => Promise.resolve(null), acknowledge: () => Promise.resolve(true), reject: () => Promise.resolve(true),
  };
  /* stableId stand-in: deterministic and tenant-scoped, like live-link.js. */
  const Live = { merchant: () => 'shop-fixture', saleIdFor: (e, m) => 'sale-ref-' + m + '-' + e.id,
    canonicalSaleId: (_m, id) => id };
  const DR = {
    isReal: () => true, storeSlug: () => 'shop-fixture', businessDay: () => DAY, cutoff: () => 5,
    dayBounds: () => ({ from: FROM, to: TO }),
    normSale: (e) => ({ ...e, ts: new Date(e.time).getTime() }), settlementKey: () => '',
  };
  const window = { KiwiOffline: O, KiwiLive: Live, KiwiDayReport: DR,
    KiwiCashSessions: { terminalId: () => 'term-fixture' }, addEventListener() {} };
  const ctx = vm.createContext({ window, KiwiLive: Live, navigator: { onLine: false },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    document: { readyState: 'complete', getElementById: () => null, querySelector: () => null, addEventListener() {} },
    location: { pathname: '/kiwi-caisse.html' }, setInterval() {}, Promise, Date, Set, Math, console });
  vm.runInContext(zSource, ctx);
  const till = [
    'var IS_DEMO = ' + JSON.stringify(demo) + ';',
    'var SALES = ' + JSON.stringify(sales) + '.map(function (s) { s.at = new Date(s.at); return s; });',
    'function isToday(d) { var t = new Date(d).getTime(); return t >= ' + FROM + ' && t < ' + TO + '; }',
    constLine(src, 'BQ_SRV_METHOD'), grab(src, 'bqPaymentParts'), grab(src, 'bqPaymentMethod'),
    ...NAMES.map((n) => grab(src, n)),
    'this.zQueue = bqZQueue;',
  ].join('\n');
  vm.runInContext(till, ctx);
  return { queued, zQueue: ctx.zQueue, storage };
}

const SALES = [
  { id: 'T1', syncId: 'u-cash', at: at(1), parts: [{ m: 'espèces', amount: 450 }] },
  { id: 'T2', syncId: 'u-split', at: at(2), parts: [{ m: 'carte', amount: 300 }, { m: 'espèces', amount: 120.5 }] },
  /* 200 of credit note, 100 cash: the server holds 100, as a split. */
  { id: 'T3', syncId: 'u-credit', at: at(3), parts: [{ m: 'avoir', amount: 200 }, { m: 'espèces', amount: 100 }] },
  /* Wholly a credit note, or a delivery still to collect: 0 MAD on the server, nothing to compare. */
  { id: 'T4', syncId: 'u-allcredit', at: at(4), parts: [{ m: 'avoir', amount: 350 }] },
  { id: 'T5', syncId: 'u-delivery', at: at(5), parts: [{ m: 'livraison', amount: 690 }] },
  /* A collected delivery carries the id the server gave it. */
  { id: 'LIV-1', syncId: 'srv-77', serverId: 'srv-77', at: at(6), kind: 'livraison-reglement', parts: [{ m: 'espèces', amount: 690 }] },
  /* Voided on the till: it must leave the comparison. */
  { id: 'T6', syncId: 'u-void', at: at(7), voided: true, parts: [{ m: 'espèces', amount: 80 }] },
  /* No syncId (a journal older than the id): never posted under a known id. */
  { id: 'T7', at: at(8), parts: [{ m: 'espèces', amount: 55 }] },
  /* Yesterday's ticket stays out. */
  { id: 'T0', syncId: 'u-yesterday', at: new Date(FROM - 3600000), parts: [{ m: 'espèces', amount: 999 }] },
];

for (const [till, src] of Object.entries(files)) {
  const { queued, zQueue } = run(src, SALES);
  const res = await zQueue(false);
  ok(res && res.ok === true, `${till} · snapshot queued (${res && res.reason || 'ok'})`);
  ok(res.unqueuedCount === 0 && res.unqueuedCents === 0, `${till} · no receipt reported as sent without a record`);
  ok(queued.length === 1, `${till} · one outbox job`);
  const p = queued[0].payload;
  ok(p.merchant === 'shop-fixture' && p.day === DAY && p.terminalId === 'term-fixture' && p.cutoff === 5 && p.closed === false,
    `${till} · the job names the store, the business day, the till and its cut-off`);
  const got = JSON.parse(JSON.stringify(p.entries.map((e) => [e.id, e.amountCents, e.method])));
  assert.deepEqual(got, [
    ['sale-ref-shop-fixture-u-cash', 45000, 'cash'],
    ['sale-ref-shop-fixture-u-split', 42050, 'split'],
    ['sale-ref-shop-fixture-u-credit', 10000, 'split'],
    ['srv-77', 69000, 'cash'],
  ], `${till} · receipts as the server files them`); passed++; console.log(`  ✓ ${till} · receipts as the server files them`);
  ok(p.entries.every((e) => e.local === null), `${till} · no local payload, so a missing receipt is reported, never replayed blind`);

  /* The close: same receipts, closed flag set. */
  const closeRun = run(src, SALES);
  const closed = await closeRun.zQueue(true);
  ok(closed.ok && closeRun.queued[0].payload.closed === true, `${till} · the close sends closed:true`);

  /* A later snapshot after a void drops the voided id from the previous manifest. */
  const later = run(src, SALES);
  await later.zQueue(false);
  const voidedNow = SALES.map((s) => s.syncId === 'u-split' ? { ...s, voided: true } : s);
  const again = run(src, voidedNow);
  for (const [k, v] of later.storage) again.storage.set(k, v);
  const r2 = await again.zQueue(false);
  ok(r2.ok && !again.queued[0].payload.entries.some((e) => e.id === 'sale-ref-shop-fixture-u-split'),
    `${till} · a receipt voided after a snapshot leaves the next one`);

  /* Demo stores never send anything. */
  const demo = run(src, SALES, { demo: true });
  const rd = await demo.zQueue(false);
  ok(rd.ok === false && demo.queued.length === 0, `${till} · the demo till sends nothing`);
}

/* Maison: the consigned share is not the shop's money; postSale() removes it. */
{
  const { queued, zQueue } = run(files.maison, [
    { id: 'M1', syncId: 'u-consigned', at: at(2), consigned: 300, parts: [{ m: 'carte', amount: 1200 }] },
    { id: 'M2', syncId: 'u-allconsigned', at: at(3), consigned: 500, parts: [{ m: 'espèces', amount: 500 }] },
  ]);
  const res = await zQueue(false);
  ok(res.ok && res.unqueuedCount === 0, 'maison · consignment snapshot queued with nothing unaccounted');
  assert.deepEqual(JSON.parse(JSON.stringify(queued[0].payload.entries.map((e) => [e.id, e.amountCents, e.method]))),
    [['sale-ref-shop-fixture-u-consigned', 90000, 'card']], 'maison · 1 200 card less 300 consigned is 900; all-consigned is 0 and stays out');
  passed++; console.log('  ✓ maison · 1 200 card less 300 consigned is 900; all-consigned is 0 and stays out');
}

console.log(`retail-z-reconciliation: ${passed} controls passed (boutique and Maison receipts compared with the server as postSale files them)`);
