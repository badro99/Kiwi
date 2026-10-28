import coreTestSource from './core-test-source.cjs';
import { hotelTestSource } from './hotel-test-source.mjs';
import caisseTestSource from './caisse-test-source.cjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => coreTestSource.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const interactive = read('assets/interactive.js');
const hotel = hotelTestSource();
const report = read('assets/day-report-dash.js');
const caisse = caisseTestSource(read('kiwi-caisse.html'));
const live = read('assets/live-link.js');

assert.doesNotMatch(interactive, /KiwiSales\.add\s*\(/, 'dashboard must never create browser-only money');
assert.doesNotMatch(hotel, /KiwiSales\.add\s*\(/, 'hotel must never create browser-only money');
assert.match(interactive, /KiwiLive\?\.postSale\?\.\(sale\)/, 'dashboard money enters central ledger');
assert.match(hotel, /live\.postSale\(/, 'hotel money enters central ledger');
assert.match(report, /feedIsAuthoritative\(day\)/, 'daily report recognizes completed central feed');
assert.match(report, /snap && !feedIsAuthoritative\(day\)/, 'a stale Z snapshot cannot override completed ledger totals');
assert.match(caisse, /reconcileJournalSales\(\)/, 'close reconciles the service before clearing');
assert.match(live, /WRITE-AHEAD COPY/, 'payment queue has synchronous crash protection');

/* Run: mutation net -= Math.abs(s.amount) + 1 keeps the source contracts
 * green but subtracts a dirham too much from the real feed totals. */
const vm = await import('node:vm');
const { createRequire } = await import('node:module');
const { declaration } = createRequire(import.meta.url)('./js-declarations.cjs');
let sales = [{ id: 'a', ts: 10, amount: 12.50 }, { id: 'a', ts: 10, amount: 12.50 },
  { id: 'r', ts: 11, kind: 'refund', amount: 2.25 }, { id: 'old', ts: 0, amount: 100 },
  { id: 'next', ts: 20, amount: 100 }];
const ctx = vm.createContext({ DR: () => ({ dayBounds: () => ({ from: 10, to: 20 }), normSale: s => s, model: ctx.KiwiDayReportModel }),
  dashSales: () => sales, archivedDay: () => false, window: { KiwiLive: { status: () => ({ on: true, backfillComplete: true }) } } });
/* The dashboard report reads the till's model (day-report.js), its single browser copy. */
vm.runInContext(read('assets/day-report.js').match(/\/\* GENERATED SHARED KiwiDayReportModel BEGIN \*\/[\s\S]*?\/\* GENERATED SHARED KiwiDayReportModel END \*\//)[0], ctx);
vm.runInContext(declaration(report.slice(report.indexOf('  function feedTotals')), 'feedTotals') + '\n' + declaration(report.slice(report.indexOf('  function feedIsAuthoritative')), 'feedIsAuthoritative'), ctx);
assert.equal(Math.round(ctx.feedTotals('day').net * 100), 1025, 'run: refunds subtract exact centimes once');
assert.equal(Math.round(ctx.feedTotals('day').gross * 100), 1250);
assert.equal(ctx.feedTotals('day').txns, 1, 'run: duplicate and out-of-day sales excluded');
assert.equal(ctx.feedIsAuthoritative('day'), true);
ctx.window.KiwiLive.status = () => ({ on: true, backfillComplete: false });
assert.equal(ctx.feedIsAuthoritative('day'), false, 'run: incomplete feed cannot supersede the snapshot');
ctx.window.KiwiLive.status = () => { throw Error('offline'); };
assert.equal(ctx.feedIsAuthoritative('day'), false);

console.log('financial ledger invariant: PASS');
