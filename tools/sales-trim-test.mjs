import coreTestSource from './core-test-source.cjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { summarize } from '../functions/api/sales-summary.js';
import { businessBoundary, businessDate, addBusinessDays } from '../functions/api/_business-day.js';
const read = f => coreTestSource.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const history = read('assets/sales-history.js'), venues = read('assets/venues.js');
const zone = 'Africa/Casablanca', merchant = 'trim-fixture', scope = 'scoped@' + merchant;
const boundary = n => businessBoundary(addBusinessDays('2026-01-01', n), 5, zone), now = boundary(200) + 3600000;
const sales = [], refunds = [], raw = [];
for (let d = 0; d < 200; d++) {
  const sale = { ts: boundary(d) + 1000, amount: 10, method: 'cash', cursor: d + 1, saleId: 'sale-' + d, tipCents: 100, channel: 'counter' };
  sales.push(sale); raw.push({ ...sale, id: sale.saleId, amountCents: 1000, tip_cents: 100 });
  if (d % 10 === 0) {
    const r = { ts: boundary(d) + 2000, amount: 2, method: 'card', cursor: 201 + d, saleId: 'refund-' + d };
    refunds.push(r); raw.push({ ...r, id: r.saleId, amount: -2, amountCents: -200 });
  }
}
raw.sort((a, b) => a.ts - b.ts || a.cursor - b.cursor);
const fence = Math.max(...raw.map(r => r.cursor));
const settle = () => new Promise(r => setImmediate(r));
function setup(options = {}) {
  const storage = options.storage || new Map(), requests = [], logs = [], writes = [];
  const old = { ...sales[0], ts: boundary(-250) + 1000, cursor: 300, saleId: 'old-chunk' };
  const localSales = options.long ? [old, ...sales] : sales;
  const sourceRows = options.long ? [{ ...old, id: old.saleId, amountCents: 1000, tip_cents: 100 }, ...raw] : raw;
  if (!storage.has('kiwiSales:' + scope)) {
    storage.set('kiwiSales:' + scope, JSON.stringify(localSales)); storage.set('kiwiRefunds:' + scope, JSON.stringify(refunds));
    storage.set('kiwi:dayreports:v1:' + merchant, JSON.stringify({ days: Object.fromEntries(localSales.map(s => [businessDate(s.ts, 5, zone), { closed: true }])) }));
  }
  if (!options.off) storage.set('kiwiSalesTrim', '1');
  const localStorage = { getItem: k => storage.get(k) ?? null, removeItem: k => storage.delete(k), setItem(k, v) {
    writes.push(k); storage.set(k, String(v));
    if (options.crash && k === 'kiwiSalesCoverage:' + scope) throw Error('simulated-crash');
  } };
  let activeMerchant = merchant;
  class Clock extends Date { static now() { return now; } }
  const R = { today: () => businessDate(now, 5, zone), businessDay: ts => businessDate(ts, 5, zone), shiftDay: addBusinessDays,
    dayBounds: day => ({ from: businessBoundary(day, 5, zone), to: businessBoundary(addBusinessDays(day, 1), 5, zone) }) };
  const window = { KiwiLive: { merchant: () => activeMerchant, status: () => ({ backfillComplete: true }) },
    KiwiVenue: { getVenue: () => 'scoped' }, KiwiEnv: { isReal: () => true }, KiwiDayReport: R,
    KiwiOffline: { async list() { if (options.unreadable) throw Error('debt-unreadable'); return options.debt ? [{ id: 'pending-sale' }] : []; } } };
  const c = vm.createContext({ window, localStorage, Date: Clock, location: { pathname: '/dashboard.html' }, console: { info: s => logs.push(s) }, setTimeout, clearTimeout, AbortController,
    fetch: async (url, init) => {
      requests.push(url); assert.equal(init.credentials, 'include'); assert.equal(init.cache, 'no-store');
      const q = new URL(url, 'https://test.invalid').searchParams, from = Number(q.get('from')), to = Number(q.get('to'));
      if (options.switchVenue) activeMerchant = 'other';
      let data;
      if (url.startsWith('/api/sales-summary')) {
        data = { merchant, ...summarize(sourceRows.map(r => ({ ...r, amount_cents: r.amountCents })), from, to, 5, zone) };
        if (options.mismatch) data.days[0].cents++;
        if (options.noTips) delete data.days[0].tipCents;
        if (options.noChannels) delete data.days[0].channels;
        if (options.insertFresh) { const rows = JSON.parse(storage.get('kiwiSales:' + scope)); rows.push({ ts: now, amount: 5, method: 'cash', saleId: 'new-manual' }); storage.set('kiwiSales:' + scope, JSON.stringify(rows)); }
      } else if (q.has('window')) data = { merchant, from, to, sales: sourceRows.filter(r => r.ts >= from && r.ts < to).sort((a,b) => a.ts - b.ts || a.cursor - b.cursor), fence, changeFence: 500,
        complete: !options.incomplete, next: null };
      else if (q.has('changes')) data = { merchant, changes: [], checkpoint: 'cp-500', complete: true, next: null };
      else data = { merchant, sales: [], cursor: Number(q.get('since')), voided: [], limit: 500 };
      return { ok: true, json: async () => data };
    } });
  const start = venues.indexOf('  const salesSubs = new Set();'), end = venues.indexOf('  function salesTotals(', start);
  vm.runInContext("const TRANSIENT_IDS = ['scoped']; const currentVenue = 'scoped'; const slugOf = () => 'trim-fixture';\n" + venues.slice(start, end) +
    "\nwindow.KiwiSales = { scope: id => SALES_KEY(id).replace(/^kiwiSales:/, ''), list: salesList, trimWrite(id,s,r) { if (!salesWrite(id,s) || !refundsWrite(id,r)) throw Error('write'); } }; window.KiwiRefunds = { list: refundsList };", c);
  vm.runInContext(history, c);
  const trimBody = venues.match(/    trimWrite\(id, sales, refunds, scope\) \{([\s\S]*?)\n    \},/)[1];
  vm.runInContext('window.KiwiSales.trimWrite = function(id,sales,refunds,scope) {' + trimBody + '\n}', c);
  return { c, storage, requests, logs, writes, run: () => window.KiwiSalesHistory.run('scoped'), window };
}
let checks = 0;
function pass(s) { checks++; console.log('  ✓ ' + s); }
{
  const h = setup({ off: true }), before = JSON.stringify([...h.storage]);
  assert.equal(await h.run(), false); assert.equal(JSON.stringify([...h.storage]), before); assert.equal(h.requests.length, 0);
  pass('off by default: byte-identical storage and zero requests');
}
for (const [label, options] of Object.entries({ incomplete: { incomplete: true }, debt: { debt: true }, mismatch: { mismatch: true }, tips: { noTips: true }, channels: { noChannels: true }, unreadableDebt: { unreadable: true }, scopeSwitch: { switchVenue: true } })) {
  const h = setup(options), before = h.storage.get('kiwiSales:' + scope), refundBefore = h.storage.get('kiwiRefunds:' + scope);
  assert.equal(await h.run(), false, label); assert.equal(h.storage.get('kiwiSales:' + scope), before, label);
  assert.equal(h.storage.get('kiwiRefunds:' + scope), refundBefore, label); assert.equal(h.storage.has('kiwiSalesCoverage:' + scope), false, label);
  assert.equal(h.logs.length, 1, label); pass(label + ' fails closed with one reason');
}
async function parity(h) {
  const M = h.window.KiwiSalesMath, S = h.window.KiwiSalesSummary;
  for (const days of [7, 30, 200]) {
    const from = boundary(200 - days), to = boundary(200);
    let actual = S.stats(h.window.KiwiSales.list(), h.window.KiwiRefunds.list(), from, to, 'scoped');
    if (actual.partial) { await settle(); actual = S.stats(h.window.KiwiSales.list(), h.window.KiwiRefunds.list(), from, to, 'scoped'); }
    const expected = M.statsFromSales(sales, refunds, from, to);
    assert.equal(actual.partial, undefined);
    for (const key of Object.keys(expected)) assert.ok(Math.abs(expected[key] - actual[key]) < 1e-6, days + ':' + key);
  }
}
{
  const h = setup(); assert.equal(await h.run(), true);
  assert.equal(h.storage.get('kiwiSalesCoverage:' + scope), String(boundary(80)));
  assert.equal(h.window.KiwiSales.list().length, 120);
  assert.ok(h.window.KiwiSales.list().every(r => r.ts >= boundary(80)));
  const marker = h.writes.indexOf('kiwiSalesCoverage:' + scope);
  assert.ok(marker < h.writes.indexOf('kiwiSales:' + scope)); assert.ok(marker < h.writes.indexOf('kiwiRefunds:' + scope));
  await parity(h); const calls = h.requests.length; assert.equal(await h.run(), false); assert.equal(h.requests.length, calls);
  pass('aligned marker first, batched trim, 24h guard, all 7/30/200-day math fields match the untrimmed ledger');
  h.storage.set('kiwiSales:' + scope, JSON.stringify(sales)); h.storage.set('kiwiRefunds:' + scope, JSON.stringify(refunds));
  await parity(h);
  h.storage.set('kiwiSalesTrimAt:' + scope, String(now - 86400001)); assert.equal(await h.run(), true); await parity(h);
  pass('stale-tab resurrection does not double-count; the next eligible trim removes resurrected rows');
}
{
  const h = setup({ crash: true }); assert.equal(await h.run(), false);
  assert.equal(h.window.KiwiSales.list().length, 200); assert.equal(h.storage.get('kiwiSalesCoverage:' + scope), String(boundary(80)));
  const retry = setup({ storage: h.storage }); assert.equal(await retry.run(), true); await parity(retry);
  pass('crash after marker: extra rows remain safe and the next load finishes trimming');
}
{
  const h = setup(); const rows = JSON.parse(h.storage.get('kiwiSales:' + scope)); rows[0].pending = true;
  h.storage.set('kiwiSales:' + scope, JSON.stringify(rows)); const before = h.storage.get('kiwiSales:' + scope);
  assert.equal(await h.run(), false); assert.equal(h.storage.get('kiwiSales:' + scope), before); assert.equal(h.storage.has('kiwiSalesCoverage:' + scope), false);
  pass('pending old row survives and defers the entire scope');
}
for (const [label, value] of [['oldShift', JSON.stringify({ openedAt: boundary(0) })], ['unreadableShift', '{']]) {
  const h = setup(); h.storage.set('kiwi:bqShift', value); const before = h.storage.get('kiwiSales:' + scope);
  assert.equal(await h.run(), false); assert.equal(h.storage.get('kiwiSales:' + scope), before); assert.equal(h.storage.has('kiwiSalesCoverage:' + scope), false);
  pass(label + ' aborts the scope');
}
{
  const h = setup(); const rows = JSON.parse(h.storage.get('kiwiSales:' + scope));
  Object.assign(rows[0], { balanceDue: 5 }); rows[1].unknownFinancialField = true;
  h.storage.set('kiwiSales:' + scope, JSON.stringify(rows));
  const reports = JSON.parse(h.storage.get('kiwi:dayreports:v1:' + merchant)); reports.days[businessDate(rows[2].ts, 5, zone)].closed = false;
  h.storage.set('kiwi:dayreports:v1:' + merchant, JSON.stringify(reports));
  assert.equal(await h.run(), true); assert.equal(h.window.KiwiSales.list().length, 123);
  for (const patch of [{ method: 'delivery' }, { method: 'credit' }, { kind: 'acompte' }, { pendingCents: 10 }, { partial: true }, { total: 'unknown' }, { lines: [{ consigned: true }] }, { settlementKind: 'store-credit' }, { parts: [{ m: 'avoir', amount: 10 }] }]) {
    assert.equal(h.window.KiwiSalesHistory.settled({ ...sales[0], ...patch }), false);
  }
  pass('open balances, unknown fields, unclosed days, credit/delivery/acompte/partial tenders are retained');
}
{
  const h = setup(); await h.run(); const source = read('assets/day-report-dash.js');
  let built = 0; const archive = { txns: 1, net: 10 };
  Object.assign(h.c, { DR: () => ({ dayBounds: () => ({ from: boundary(0), to: boundary(1) }), load: () => archive, build() { built++; } }) });
  const body = source.slice(source.indexOf('  function archivedDay('), source.indexOf('  /* Une journée est close'));
  vm.runInContext(body, h.c); assert.equal(h.c.resolve('2026-01-01'), archive); assert.equal(built, 0);
  pass('trimmed day returns its archive without rebuilding local totals');
}
{
  const h = setup({ long: true }); assert.equal(await h.run(), true);
  const windows = h.requests.filter(url => url.includes('&window=1'));
  assert.equal(windows.length, 2); assert.ok(windows[1].includes('&fence=' + fence + '&changeFence=500'));
  for (const url of windows) { const q = new URL(url, 'https://test.invalid').searchParams; assert.ok(Number(q.get('to')) - Number(q.get('from')) <= 400 * 86400000 + 7200000); }
  assert.equal(h.window.KiwiSales.list().length, 120);
  assert.ok(!h.writes.includes('kiwiSalesChangeCheckpoint:' + scope));
  pass('initial history over 400 days uses bounded read-only chunks with the same F/CF and no checkpoint writes');
}
{
  const h = setup({ insertFresh: true }); assert.equal(await h.run(), true);
  assert.ok(h.window.KiwiSales.list().some(r => r.saleId === 'new-manual'));
  assert.equal(h.window.KiwiSales.list().length, 121);
  pass('the final synchronous step rereads storage and preserves a recent row added after preflight');
}
{
  const h = setup(); vm.runInContext(read('assets/channel-sales.js'), h.c);
  const expected = h.window.KiwiChannelSales.breakdown(sales, ['counter'], boundary(0), boundary(200), null, '', refunds);
  vm.runInContext('let saleDraws = 0, refundDraws = 0; salesSubs.add(() => saleDraws++); refundSubs.add(() => refundDraws++);', h.c);
  assert.equal(await h.run(), true);
  assert.equal(vm.runInContext('saleDraws', h.c), 1); assert.equal(vm.runInContext('refundDraws', h.c), 1);
  let result = h.window.KiwiSalesHistory.channels(h.window.KiwiSales.list(), h.window.KiwiRefunds.list(), ['counter'], boundary(0), boundary(200), null, '');
  assert.equal(result.partial, true); await settle();
  result = h.window.KiwiSalesHistory.channels(h.window.KiwiSales.list(), h.window.KiwiRefunds.list(), ['counter'], boundary(0), boundary(200), null, '');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), JSON.parse(JSON.stringify(expected)));
  let tips = h.window.KiwiSalesHistory.oldTips(boundary(0), boundary(200), new Set());
  if (tips.partial) { await settle(); tips = h.window.KiwiSalesHistory.oldTips(boundary(0), boundary(200), new Set()); }
  assert.equal(tips.sum, 80); assert.equal(tips.days, 80);
  pass('actual batch writer redraws once per ledger; historical channels and summary tips retain their original values');
}
console.log(`PASS sales trim: ${checks} scenarios`);
