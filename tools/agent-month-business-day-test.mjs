#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* The assistant's month-to-date runs on the store's business days (05:00,
 * Casablanca), like the dashboard and the Z. At 02:00 on 1 October a sale
 * made at 01:30 still belongs to September: the old device-calendar month
 * counted it as October and said "your first 1 days of the month". */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

process.env.TZ = 'Europe/Paris';
const FIXED_NOW = Date.parse('2026-10-01T01:00:00Z'); /* 02:00 Casablanca, 1 Oct */
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
  getVenue: () => 'venue-oct',
  getCurrentVenueData: () => ({ id: 'venue-oct', slug: 'merchant-oct', timezone: 'Africa/Casablanca', name: 'Test octobre' }),
};
const sale = (iso, amount) => ({ ts: Date.parse(iso), amount });
const salesRows = [
  sale('2026-08-20T12:00:00Z', 400),   /* August: the month before last */
  sale('2026-09-15T12:00:00Z', 700),   /* September */
  sale('2026-10-01T00:30:00Z', 90),    /* 01:30 Casablanca on 1 Oct: September's last service */
];
const KiwiSales = {
  list: () => salesRows,
  totals: (_v, from, to) => { const rows = salesRows.filter((x) => x.ts >= from && x.ts < to); const g = rows.reduce((n, x) => n + x.amount, 0); return { revenue: g, count: rows.length, basket: rows.length ? g / rows.length : 0 }; },
};
const window = {
  document, localStorage, Date: FixedDate, addEventListener() {},
  KiwiEnv: { isReal: () => true },
  KiwiVenue: venue, KiwiSales, KiwiRefunds: { list: () => [] },
  KiwiI18n: { getLang: () => 'fr' },
  KiwiMe: { business: 'Test octobre' },
  Kiwi: { handlers: {} },
};
window.window = window;
const context = { window, document, localStorage, Date: FixedDate, console, navigator: { language: 'fr-FR' },
  location: { href: 'https://kiwi.test/dashboard.html', search: '' },
  setTimeout() { return 0; }, clearTimeout() {}, setInterval() {}, clearInterval() {},
  fetch() { return Promise.reject(new Error('network disabled')); } };
context.globalThis = context;
vm.createContext(context);
for (const file of ['assets/day-report.js', 'assets/agent-data.js', 'assets/agent-features.js', 'assets/agent-truth.js', 'assets/agent.js']) {
  vm.runInContext(coreTestSource.readFileSync(file, 'utf8'), context, { filename: file });
}
assert.equal(window.KiwiDayReport.today(), '2026-09-30', 'at 02:00 on 1 Oct the business day is 30 Sept');
const profile = window.KiwiAgentProfile();
assert.equal(profile.mtdRevenue, 790, 'month to date is September, including its 01:30 sale');
assert.equal(profile.mtdDays, 30, 'thirty days of September have run');
assert.equal(profile.daysInMonth, 30);
console.log('✓ agent month business day: month to date, its day count and its length follow the store’s 05:00 day');
