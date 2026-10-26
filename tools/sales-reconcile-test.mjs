import coreTestSource from './core-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => coreTestSource.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const live = read('assets/live-link.js'), history = read('assets/sales-history.js');
const operator = read('tools/operator-snapshot-test.mjs');
const harnessBody = operator.slice(operator.indexOf('function harness('), operator.indexOf('// Execute the actual renderers'))
  .replace("new URL('../assets/venues.js', import.meta.url)", JSON.stringify(new URL('../assets/venues.js', import.meta.url).pathname));
const merchant = 'santos-store', ts = 1800000000000, coverage = ts - 86400000;
const settle = () => new Promise(resolve => setImmediate(resolve));
function make(pages, { marker = false, source = live, cached = [], realStore = marker } = {}) {
  const harness = new Function('source', 'dateSource', 'tenant', 'ts', 'settle', 'vm', 'assert', 'fs', 'coreTestSource', harnessBody + '\nreturn harness;')(
    source, read('assets/dateRange.js'), merchant, ts, settle, vm, assert, fs, coreTestSource);
  const h = harness(pages, { realStore, cached });
  const storage = h.context.localStorage;
  if (marker) {
    vm.runInContext("window.KiwiSales.scope = id => SALES_KEY(id).replace(/^kiwiSales:/, ''); window.KiwiSales.reconcile = salesReconcile;", h.context);
    storage.setItem('kiwiSalesCoverage:custom-santos', String(coverage));
    h.window.KiwiOffline.list = async () => [];
  }
  vm.runInContext(history, h.context);
  return h;
}
const row = (cursor, extra = {}) => ({ cursor, id: 'sale-' + cursor, amount: 10, amountCents: 1000, method: 'cash', ts, ...extra });
const tail = (sales = [], cursor = sales.at(-1)?.cursor || 2) => ({ merchant, sales, cursor, voided: [], limit: 500 });
// A fixed Date keeps fixture requests and first-page bounds reproducible.
const NativeDate = Date;
class Clock extends NativeDate { static now() { return ts; } }
function clock(h) { h.context.Date = Clock; }
const windowPage = (sales, next = null, fence = 2) => ({ merchant, from: coverage, to: ts + 7200000, sales, fence, changeFence: 10, next, complete: next === null });
const changes = (rows = [], checkpoint = 'cp-1', next = null) => ({ merchant, changes: rows, checkpoint, next, complete: next === null });
function trace(h) { return { requests: h.requests.map(r => ({ url: r.url, credentials: r.init.credentials, headers: r.init.headers })),
  ledger: h.window.KiwiSales.list('custom-santos'), refunds: h.window.KiwiRefunds.list('custom-santos') }; }
let count = 0;
function pass(label) { count++; console.log('  ✓ ' + label); }

// Recorded from untouched e79d3637 before editing live-link.js.
const noMarkerPages = [tail(Array.from({ length: 50 }, (_, i) => row(i + 1)), 50), tail([], 50)];
// Legacy negotiates 50 when limit is omitted from its response.
delete noMarkerPages[0].limit; delete noMarkerPages[1].limit;

{
  const h = make(noMarkerPages); clock(h); await h.boot(); await h.next();
  assert.deepEqual(JSON.parse(JSON.stringify(trace(h))), JSON.parse(read('tools/fixtures/sales-reconcile/no-marker.json')));
  h.assertReadOnly(); pass('no marker: requests and ledger match the untouched HEAD fixture byte for byte');
}
{
  const restored = row(1, { seq: 11, voided: false, voidTs: null });
  const tip = row(2, { seq: 13, voided: false, voidTs: null, tipCents: 250,
    paymentParts: [{ method: 'card', amountCents: 1000 }], ref: 'UPDATED' });
  const h = make([windowPage([row(2)], 'window-2'), windowPage([]),
    changes([restored], 'cp-11'), tail([row(3, { ts: ts - 1000 })], 3), changes([tip], 'cp-13')], { marker: true });
  clock(h); await h.boot();
  assert.equal(h.state().phase, 'complete');
  const sales = h.window.KiwiSales.list('custom-santos');
  assert.equal(sales.length, 3); assert.equal(sales.filter(r => r.saleId === 'sale-1').length, 1);
  assert.equal(sales.find(r => r.saleId === 'sale-2').tipCents, 250);
  assert.equal(sales.find(r => r.saleId === 'sale-2').paymentParts[0].method, 'card');
  assert.equal(sales.find(r => r.saleId === 'sale-2').ref, 'UPDATED');
  assert.ok(h.requests[0].url.includes('&window=1&from='));
  assert.ok(h.requests[1].url.includes('&after=window-2'));
  assert.ok(h.requests[2].url.includes('&afterChange=10'));
  assert.ok(h.requests[3].url.includes('&since=2'));
  assert.ok(h.requests[4].url.includes('&afterChange=cp-11'));
  assert.equal(h.context.localStorage.getItem('kiwiSalesChangeCheckpoint:custom-santos'), 'cp-13');
  h.resolveVenue(); assert.equal(h.window.KiwiSales.list('custom-santos').length, 3);
  const proof = h.window.KiwiSalesReconcile.proof('custom-santos');
  assert.doesNotThrow(() => h.window.KiwiSalesReconcile.verify(sales, [], proof.rows, proof));
  assert.throws(() => h.window.KiwiSalesReconcile.verify(sales.map(r => ({ ...r, amount: 9 })), [], proof.rows, proof), /ledger/);
  pass('window F/CF -> changes -> rowid F: restore exactly once, tip/parts/ref replace, backdated insert retained, proof detects mismatch');
}
{
  const h = make([windowPage([row(1)]), changes([row(2, { ts: coverage - 1, seq: 11, voided: true, voidTs: ts })]), tail([row(3, { ts: coverage - 1 })], 3), changes()], { marker: true });
  clock(h); let summaries = 0, raws = 0;
  h.window.KiwiSalesSummary = { ...h.window.KiwiSalesSummary, invalidate: () => summaries++ };
  h.window.KiwiSalesWindow = { ...h.window.KiwiSalesWindow, invalidate: () => raws++ };
  await h.boot(); assert.equal(h.state().phase, 'complete');
  assert.ok(summaries && raws); assert.equal(h.window.KiwiSales.list('custom-santos').length, 1);
  h.resolveVenue('other-store'); h.resolveVenue();
  assert.equal(h.window.KiwiSales.list('custom-santos').length, 1);
  pass('pre-coverage void invalidates historical caches and cannot re-enter the ledger on venue resolution');
}
{
  const h = make([windowPage([row(1)], 'more'), { merchant, error: 'cursor' }], { marker: true });
  clock(h); await h.boot(); assert.notEqual(h.state().phase, 'complete');
  assert.equal(h.window.KiwiSales.list('custom-santos').length, 0);
  assert.equal(h.context.localStorage.getItem('kiwiSalesChangeCheckpoint:custom-santos'), null);
  pass('invalid bootstrap prefix never merges into the durable ledger or checkpoint');
}
{
  const h = make([], { marker: true }); clock(h);
  const H = h.window.KiwiSalesReconcile, p = { from: coverage, to: ts + 7200000, fence: 20, scope: 'custom-santos', pendingIds: ['debt'] };
  const rows = [row(1, { ts: coverage - 1 }), row(2), { amount: 5, ts }, row(3, { saleId: 'debt' }), row(30)];
  const kept = H.retain(rows, [], p);
  assert.equal(kept.length, 4); assert.ok(!kept.some(r => r.cursor === 2));
  h.context.localStorage.setItem('kiwiSalesCoverage:scoped', '111');
  vm.runInContext("window.KiwiSales.scope = () => 'scoped@santos-store'", h.context);
  assert.equal(H.coverage('scoped'), null);
  assert.equal(h.window.KiwiSalesSummary.coverageStart('scoped'), null);
  h.context.localStorage.setItem('kiwiSalesCoverage:scoped@santos-store', String(coverage));
  assert.equal(H.coverage('scoped'), coverage);
  assert.equal(h.window.KiwiSalesSummary.coverageStart('scoped'), coverage);
  h.window.KiwiSales.scope = () => 'scoped@other';
  assert.equal(H.coverage('scoped'), null);
  pass('retention preserves pending/manual/outside-proof rows; coverage uses the exact tenant ledger suffix');
}
{
  const responses = [windowPage([row(1)]), changes(), tail(), changes(),
    tail(), changes([row(1, { seq: 12, voided: false, voidTs: null, tipCents: 800, paymentParts: null, ref: '' })], 'cp-12'),
    tail(), changes([{ cursor: 1, id: 'sale-1', seq: 13, deleted: true }], 'cp-13')];
  const h = make([], { marker: true }); clock(h);
  const helper = h.window.KiwiSalesReconcile;
  const controller = helper.create(merchant, 'custom-santos', async () => responses.shift(), () => true);
  for (let i = 0; i < 3; i++) {
    const replay = await controller.cycle();
    h.window.KiwiSales.reconcile('custom-santos', replay.result.rows, replay.result); replay.commit();
    const saved = h.window.KiwiSales.list('custom-santos');
    if (i === 0) assert.equal(saved.length, 1);
    if (i === 1) { assert.equal(saved.length, 1); assert.equal(saved[0].tipCents, 800); assert.equal(saved[0].ref, undefined); }
    if (i === 2) assert.equal(saved.length, 0);
  }
  pass('a tip change replaces an already-persisted row; tombstones remove only the corresponding server row');
}
{
  const h = make([windowPage([row(1)]), () => ({ ok: false, status: 400 })], { marker: true }); clock(h);
  h.context.localStorage.setItem('kiwiSalesChangeCheckpoint:custom-santos', 'stale-cursor');
  await h.boot(); assert.equal(h.window.KiwiSales.list('custom-santos').length, 0);
  assert.equal(h.context.localStorage.getItem('kiwiSalesChangeCheckpoint:custom-santos'), null);
  assert.equal(h.window.KiwiSalesReconcile.proof('custom-santos'), undefined);
  pass('HTTP 400 discards the scoped checkpoint and proof without merging a prefix');
}
{
  const h = make([], { marker: true }); clock(h);
  const p = { from: coverage, to: ts + 7200000, fence: 20, scope: 'custom-santos', pendingIds: ['debt'] };
  h.window.KiwiSales.add('custom-santos', row(1, { ts: coverage - 1 }));
  h.window.KiwiSales.add('custom-santos', row(2));
  h.window.KiwiSales.add('custom-santos', row(3, { id: 'debt' }));
  h.window.KiwiSales.add('custom-santos', { ts, amount: 5, saleId: 'manual' });
  h.window.KiwiRefunds.add('custom-santos', row(4, { ts: coverage - 1 }));
  h.window.KiwiRefunds.add('custom-santos', row(5));
  assert.equal(h.window.KiwiSales.retainCursors('custom-santos', []), 0);
  assert.equal(h.window.KiwiRefunds.retainCursors('custom-santos', []), 0);
  h.window.KiwiSales.retainCursors('custom-santos', [], p);
  h.window.KiwiRefunds.retainCursors('custom-santos', [], p);
  assert.equal(h.window.KiwiSales.list('custom-santos').length, 3);
  assert.equal(h.window.KiwiRefunds.list('custom-santos').length, 1);
  pass('real sales/refund retention APIs restrict reconciliation to the proof and preserve debt/manual/archive rows');
}
{
  const source = read('assets/day-report-dash.js');
  const body = source.slice(source.indexOf('  function archivedDay('), source.indexOf('  /* Une journée est close'));
  let builds = 0, summary = null, archive = { txns: 7, net: 70, gross: 70, closed: true };
  const d = { dayBounds: () => ({ from: coverage - 86400000, to: coverage }), load: () => archive,
    build() { builds++; throw Error('archived rows must never be rebuilt'); } };
  const c = vm.createContext({ window: { KiwiSalesReconcile: { coverage: () => coverage },
    KiwiSalesSummary: { get: () => summary }, KiwiSalesMath: { statsFromSummary: () => ({ revenue: 12, gross: 14, count: 2 }) },
    KiwiLive: { status: () => ({ on: true, backfillComplete: true }) } }, DR: () => d,
    feedTotals() { throw Error('archived totals must not read local lines'); }, isClosed: r => r.closed });
  vm.runInContext(body, c);
  assert.equal(c.resolve('old-day'), archive);
  assert.equal(c.totalsFor('old-day').net, 70);
  assert.equal(c.feedIsAuthoritative('old-day'), false);
  assert.equal(c.snapMissesSales(archive, 'old-day'), false);
  archive = null;
  const pending = c.resolve('old-day'); assert.equal(pending.partial, true); assert.equal(pending.detailsUnavailable, true);
  assert.equal(pending.net, null); summary = { days: [], splits: [] };
  assert.equal(c.resolve('old-day').net, 12); assert.equal(c.totalsFor('old-day').txns, 2);
  assert.equal(builds, 0);
  assert.ok(source.includes('Details unavailable offline / loading'));
  pass('pre-coverage day reports prefer the saved archive, otherwise summary/loading; never build from local lines');
}

{
  const values = new Map(), venues = read('assets/venues.js');
  const localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  const c = vm.createContext({ window: {}, localStorage, setTimeout, clearTimeout });
  const start = venues.indexOf('  const salesSubs = new Set();'), end = venues.indexOf('  function salesTotals(', start);
  vm.runInContext("const TRANSIENT_IDS = ['scoped']; const currentVenue = 'scoped'; let slug = 'santos-store'; const slugOf = () => slug;\n" +
    venues.slice(start, end) + "\nwindow.KiwiSales = { scope: id => SALES_KEY(id).replace(/^kiwiSales:/, '') };", c);
  vm.runInContext(history, c);
  values.set('kiwiSalesCoverage:scoped', '111');
  assert.equal(c.window.KiwiSalesSummary.coverageStart('scoped'), null);
  values.set('kiwiSalesCoverage:scoped@santos-store', String(coverage));
  assert.equal(c.window.KiwiSales.scope(), 'scoped@santos-store');
  assert.equal(c.window.KiwiSalesSummary.coverageStart('scoped'), coverage);
  assert.equal(c.window.KiwiSalesReconcile.coverage(), coverage);
  let passedVenue;
  c.window.KiwiSalesSummary = { stats(_s, _r, _f, _t, venue) { passedVenue = venue; return { receivable: 0 }; } };
  Object.assign(c, { getCurrentVenue: () => 'scoped', realSalesList: () => [], realRefundList: () => [], deliveryDue: () => 0 });
  const statsBody = read('assets/dateRange.js').match(/  function realWindowStats\(from, to\) \{([\s\S]*?)\n  \}/)[1];
  vm.runInContext('function realWindowStats(from, to) {' + statsBody + '\n}', c);
  c.realWindowStats(coverage, ts); assert.equal(passedVenue, 'scoped');
  vm.runInContext("slug = 'other-store'", c);
  assert.equal(c.window.KiwiSalesReconcile.coverage(), null);
  pass('actual SALES_KEY scope and dateRange venue argument agree for scoped tenants and isolate venue switches');
}
console.log(`PASS all sales reconciliation: ${count} scenarios`);
