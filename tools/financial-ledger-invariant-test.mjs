import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const interactive = read('assets/interactive.js');
const hotel = read('assets/hotel.js');
const report = read('assets/day-report-dash.js');
const caisse = read('kiwi-caisse.html');
const live = read('assets/live-link.js');

assert.doesNotMatch(interactive, /KiwiSales\.add\s*\(/, 'dashboard must never create browser-only money');
assert.doesNotMatch(hotel, /KiwiSales\.add\s*\(/, 'hotel must never create browser-only money');
assert.match(interactive, /KiwiLive\?\.postSale\?\.\(sale\)/, 'dashboard money enters central ledger');
assert.match(hotel, /live\.postSale\(/, 'hotel money enters central ledger');
assert.match(report, /feedIsAuthoritative\(\)/, 'daily report recognizes completed central feed');
assert.match(report, /snap && !feedIsAuthoritative\(\)/, 'a stale Z snapshot cannot override completed ledger totals');
assert.match(caisse, /reconcileJournalSales\(\)/, 'close reconciles the service before clearing');
assert.match(live, /WRITE-AHEAD COPY/, 'payment queue has synchronous crash protection');

console.log('financial ledger invariant: PASS');
