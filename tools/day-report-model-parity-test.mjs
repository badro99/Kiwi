import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as server from '../functions/api/_rules-day-report.js';
const require = createRequire(import.meta.url);
const fc = require('../app/node_modules/fast-check');
const { declaration } = require('./js-declarations.cjs');
const plain = x => JSON.parse(JSON.stringify(x));
const contexts = ['assets/day-report.js', 'assets/caisse-accounting.js'].map(file => {
  const source = fs.readFileSync((process.env.KIWI_REPORT_SOURCE_ROOT || '.') + '/' + file, 'utf8');
  // This ownership assertion fails against the pre-extraction files.
  assert.match(source, /KiwiDayReportModel\.(?:reportFigures|ledgerFigures)\(/);
  const block = source.match(/\/\* GENERATED SHARED KiwiDayReportModel BEGIN \*\/[\s\S]*?\/\* GENERATED SHARED KiwiDayReportModel END \*\//);
  assert.ok(block, file + ' uses the generated owner');
  const c = vm.createContext({Date});
  vm.runInContext(block[0], c);
  if (file.endsWith('caisse-accounting.js')) vm.runInContext(declaration(source, 'rollupLedger'), c);
  return c;
});
const sale = fc.record({amount: fc.integer({min:-100000,max:100000}).map(n=>n/100),
  method: fc.constantFrom('cash','card','credit'), tip: fc.integer({min:0,max:1000}).map(n=>n/100),
  kind: fc.constantFrom('sale','refund','complimentary'), voided: fc.boolean(),
  refundSyncStatus: fc.constantFrom('accepted','rejected'), cashHandedOut: fc.boolean(),
  time: fc.integer({min:1,max:100000}), ts: fc.integer({min:1,max:100000})});
fc.assert(fc.property(fc.array(sale), fc.integer({min:0,max:100000}), (rows, since) => {
  const original = JSON.stringify(rows);
  for (const c of contexts) {
    assert.deepEqual(plain(c.KiwiDayReportModel.reportFigures(rows)), plain(server.reportFigures(rows)));
    assert.deepEqual(plain(c.KiwiDayReportModel.ledgerFigures(rows, [], since)), plain(server.ledgerFigures(rows, [], since)));
    assert.equal(c.KiwiDayReportModel.expectedCash(100, 10.12, 1.03, 5, 2, -.01), server.expectedCash(100,10.12,1.03,5,2,-.01));
  }
  const till = contexts[1]; till.journal = rows; till.cashMovements = [];
  assert.deepEqual(plain(till.rollupLedger(since)), plain(server.ledgerFigures(rows, [], since)));
  assert.equal(JSON.stringify(rows), original);
}), {numRuns:300, seed:20261026});
assert.equal(server.expectedCashCents(10000, 1012, 103, 500, 200, -1), 11414);
assert.match(fs.readFileSync('functions/api/cash-sessions.js','utf8'), /import \{ expectedCashCents \} from '.\/_rules-day-report.js'/);
console.log('day-report model: 300 parity cases, two browser copies and actual till rollup vs server module; pure inputs');
// Note 13, dayreport#2: the dashboard report carries no copy of its own; its
// figures are the till's model, read through window.KiwiDayReport.model.
const dashSource = fs.readFileSync((process.env.KIWI_REPORT_SOURCE_ROOT || '.') + '/assets/day-report-dash.js', 'utf8');
assert.ok(!/GENERATED SHARED KiwiDayReportModel/.test(dashSource), 'the dashboard report has no second copy of the day-report model');
// Exercise the actual dashboard presenter with caller-supplied 05:00 bounds.
const from = Date.parse('2026-10-26T05:00:00Z'), to = from + 86400000;
const rows = [
  {id:'sale', ts:from, amount:100, method:'card', tip:10,
    parts:[{method:'cash',amountCents:7000},{method:'card',amountCents:3000}]},
  {id:'refund', ts:from+1, amount:-20, method:'cash', kind:'refund', tip:0},
];
assert.ok(!/\bKiwiDayReportModel\b/.test(dashSource), 'the dashboard report names no model of its own, not even a forwarding one');
const c = vm.createContext({Date});
let ownerCalls = 0; const owner = contexts[0].KiwiDayReportModel.reportFigures;
c.DR = () => ({dayBounds:()=>({from,to}), normSale:s=>s, model:{reportFigures:(r)=>{ownerCalls++; return owner(r);}}});
c.dashSales = () => [...rows, rows[0], {id:'before',ts:from-1,amount:999}, {id:'after',ts:to,amount:999}];
vm.runInContext(declaration(dashSource.split('  function feedTotals')[1].replace(/^/, 'function feedTotals'), 'feedTotals'),c);
assert.deepEqual(plain(c.feedTotals('2026-10-26')), {net:80,gross:100,txns:1});
assert.equal(ownerCalls, 1, 'the dashboard figures come from the till model');
const figures = server.reportFigures(rows);
assert.deepEqual(plain(figures.methods), {cash:50,card:30});
assert.equal(figures.cashTips,7);
assert.equal(server.expectedCash(100,figures.methods.cash,figures.cashTips,0,0,0),157);
const memory = new Map([['kiwiDayCutoff', '5']]);
const window = {addEventListener(){}, KiwiConfig:{timezone:'UTC'}};
const reportContext = vm.createContext({window, Date, Intl, localStorage:{getItem:k=>memory.get(k)||null}});
vm.runInContext(fs.readFileSync('assets/day-report.js','utf8'), reportContext);
const report = window.KiwiDayReport.build({day:'2026-10-26', store:{slug:'parity',type:'boutique'}, sales:rows,
  categoryIndex:{},session:{openingFloat:100}});
assert.equal(report.net, figures.net);
assert.equal(report.tips,figures.tips);
assert.deepEqual(plain(report.methods),plain(figures.methods));
assert.equal(report.cash.expected,157);
console.log('actual report and dashboard paths: boundary, duplicate, split tenders, refund, tips and expected cash match server');
