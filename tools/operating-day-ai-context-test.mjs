#!/usr/bin/env node
/* QA08: the financial assistant must use the real bounded sales contract.
 * This loads the shipped agent and day-report modules, then gives them a
 * ledger containing July history, September sales, and a September refund. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const FIXED_NOW = Date.parse('2026-09-08T12:00:00Z');
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
}

const store = new Map();
const localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  key: (index) => [...store.keys()][index] ?? null,
};
Object.defineProperty(localStorage, 'length', { get: () => store.size });

const node = () => ({
  dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, removeEventListener() {}, appendChild() {}, insertAdjacentHTML() {},
  querySelector() { return null; }, querySelectorAll() { return []; }, setAttribute() {},
  getAttribute() { return null; }, focus() {}, textContent: '', innerHTML: '',
});
const document = {
  readyState: 'complete', documentElement: node(), head: node(), body: node(),
  createElement: node, querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener() {}, getElementById() { return null; },
};

const venue = {
  isCustom: () => true,
  getVenue: () => 'venue-sept',
  getCurrentVenueData: () => ({ id: 'venue-sept', slug: 'merchant-sept', timezone: 'Africa/Casablanca', name: 'Test septembre' }),
};
const sale = (iso, amount) => ({ ts: Date.parse(iso), amount });
const salesRows = [
  sale('2026-07-31T12:00:00Z', 1000), // must not enter the rolling window
  sale('2026-08-11T12:00:00Z', 200),
  sale('2026-09-07T12:00:00Z', 300),
];
const refunds = [sale('2026-09-07T13:00:00Z', 50)];
const calls = [];
const KiwiSales = {
  list: () => salesRows,
  totals: (_venue, from, to) => {
    calls.push({ _venue, from, to });
    const rows = salesRows.filter((x) => x.ts >= from && x.ts < to);
    const returned = refunds.filter((x) => x.ts >= from && x.ts < to);
    const gross = rows.reduce((sum, x) => sum + x.amount, 0);
    const revenue = gross - returned.reduce((sum, x) => sum + x.amount, 0);
    return { revenue, count: rows.length, basket: rows.length ? gross / rows.length : 0 };
  },
};

const window = {
  document, localStorage, Date: FixedDate, addEventListener() {},
  KiwiEnv: { isReal: () => true },
  KiwiVenue: venue, KiwiSales, KiwiRefunds: { list: () => refunds },
  KiwiI18n: { getLang: () => 'fr' },
  KiwiMe: { business: 'Test septembre' },
  Kiwi: { handlers: {} },
};
window.window = window;
const context = { window, document, localStorage, Date: FixedDate, console, navigator: { language: 'fr-FR' },
  location: { href: 'https://kiwi.test/dashboard.html', search: '' },
  setTimeout() { return 0; }, clearTimeout() {}, setInterval() {}, clearInterval() {},
  fetch() { return Promise.reject(new Error('network disabled')); } };
context.globalThis = context;
vm.createContext(context);

vm.runInContext(fs.readFileSync('assets/day-report.js', 'utf8'), context, { filename: 'assets/day-report.js' });
const dayReport = window.KiwiDayReport;
assert.equal(dayReport.storeSlug(), 'merchant-sept', 'canonical report helper resolves merchant slug, not custom venue id');
const dateKeys = [];
const originalBusinessDay = dayReport.businessDay;
const originalDayBounds = dayReport.dayBounds;
const originalShiftDay = dayReport.shiftDay;
const originalTimezone = dayReport.timezone;
const originalCutoff = dayReport.cutoff;
dayReport.businessDay = (stamp, key) => { dateKeys.push(key); return originalBusinessDay(stamp, key); };
dayReport.dayBounds = (key, merchant) => { dateKeys.push(merchant); return originalDayBounds(key, merchant); };
dayReport.shiftDay = (key, delta, merchant) => { dateKeys.push(merchant); return originalShiftDay(key, delta, merchant); };
dayReport.timezone = (key) => { dateKeys.push(key); return originalTimezone(key); };
dayReport.cutoff = (key) => { dateKeys.push(key); return originalCutoff(key); };

for (const file of ['assets/agent-data.js', 'assets/agent-features.js', 'assets/agent-truth.js', 'assets/agent.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const profile = window.KiwiAgentProfile();
assert.ok(dateKeys.length > 0, 'rolling window consults the production business-day helpers');
assert.ok(dateKeys.every((key) => key === 'merchant-sept'), 'custom venue id never replaces canonical merchant slug for cutoff/date resolution');
assert.equal(calls.length, 1, 'profile reads the bounded sales API once');
assert.equal(calls[0]._venue, 'venue-sept');
assert.equal(new FixedDate(calls[0].from).toISOString(), '2026-08-10T04:00:00.000Z', 'window starts at the Casablanca 05:00 business-day boundary');
assert.equal(new FixedDate(calls[0].to).toISOString(), '2026-09-09T04:00:00.000Z', 'window ends at the next Casablanca 05:00 boundary');
assert.equal(profile.salesWindowStart, '2026-08-10');
assert.equal(profile.salesWindowEnd, '2026-09-08');
assert.equal(profile.salesTimezone, 'Africa/Casablanca');
assert.equal(profile.salesCutoff, 5);
assert.equal(profile.revenue, 450, 'rolling revenue is sales less the in-window refund');
assert.equal(profile.ordersPerMonth, 2, 'refund does not become a sale denominator');
assert.equal(profile.avgBasket, 250, 'basket denominator is the two bounded sales, not all-time rows');
assert.equal(profile.dailyRev, 15, 'daily revenue uses the 30-day window denominator');
assert.equal(profile.ordersPerDay, 2 / 30, 'orders/day uses the same bounded 30-day denominator');
assert.equal(profile.salesAsOf, Date.parse('2026-09-07T13:00:00Z'), 'freshness includes the latest sale/refund event');
assert.equal(window.KiwiAgentAsk('mon chiffre d’affaires').stats[0].v, '450 MAD', 'answer uses the corrected rolling total');

console.log('✓ QA08 operating-day AI context: bounded 30-day sales, Casablanca business-day cutoff, refunds, denominator and freshness all pass');
