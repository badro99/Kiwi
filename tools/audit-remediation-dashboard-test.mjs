#!/usr/bin/env node
/* Focused R01-R04 regression.  The browser modules are evaluated as shipped;
   SQLite supplies the fixture rows so the assertions do not exercise a toy
   copy of the dashboard arithmetic. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as calendar from '../functions/api/_business-day.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const memory = new Map();
const localStorage = {
  getItem: (k) => memory.has(k) ? memory.get(k) : null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const merchant = 'audit-dashboard-merchant';
const zone = 'Africa/Casablanca';
const now = Date.parse('2026-02-15T08:00:00Z');
process.env.TZ = 'Europe/Berlin'; // operator timezone must not affect merchant books

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(read('schema.sql'));
sqlite.exec(`
  INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel)
  VALUES
    ('sale-cash', '${merchant}', 100, 10000, 'cash', 'Cash sale', 'S-CASH', ${Date.parse('2026-02-15T01:00:00Z')}, '[]', 'caisse'),
    ('sale-credit', '${merchant}', 50, 5000, 'delivery', 'Unpaid delivery', 'S-CREDIT', ${Date.parse('2026-02-15T06:00:00Z')}, '[]', 'caisse'),
    ('refund-cash', '${merchant}', -12.5, -1250, 'cash', 'Cash refund', 'R-CASH', ${Date.parse('2026-02-15T07:00:00Z')}, '[]', 'refund')
`);
const rows = sqlite.prepare('SELECT id, amount, method, label, ref, ts FROM sales WHERE merchant = ? ORDER BY ts').all(merchant);
const sales = rows.filter((r) => r.amount > 0);
const refunds = rows.filter((r) => r.amount < 0).map((r) => ({ ...r, amount: Math.abs(r.amount) }));

const venue = {
  id: merchant, slug: merchant, name: 'Audit dashboard', timezone: zone,
  type: 'restaurant', fullDisplay: 'Audit dashboard', goal: 0,
};
const windowBase = {
  localStorage,
  KiwiEnv: { isReal: () => true },
  KiwiConfig: { timezone: zone },
  KiwiVenue: {
    getVenue: () => merchant,
    isCustom: () => true,
    getCurrentVenueData: () => venue,
  },
  KiwiSales: { list: () => sales },
  KiwiRefunds: { list: () => refunds },
  KiwiI18n: { getLang: () => 'fr', T: { fr: {}, en: {}, ar: {} } },
  KiwiLive: { merchant: () => merchant },
  addEventListener: () => {},
  dispatchEvent: () => {},
};

const dayContext = vm.createContext({
  window: { ...windowBase }, localStorage, Date, Intl, Math, JSON, Number, String, Array, Object, RegExp,
  CustomEvent: function CustomEvent() {}, console,
});
dayContext.window.window = dayContext.window;
vm.runInContext(read('assets/day-report.js'), dayContext, { filename: 'assets/day-report.js' });
const dayReport = dayContext.window.KiwiDayReport;

assert.equal(dayReport.businessDay(Date.parse('2026-02-15T04:30:00Z'), merchant), '2026-02-14');
assert.equal(dayReport.businessDay(Date.parse('2026-02-15T05:00:00Z'), merchant), '2026-02-15');
assert.equal(dayReport.dayBounds('2026-02-14', merchant).to - dayReport.dayBounds('2026-02-14', merchant).from, 25 * 3600000);
assert.equal(dayReport.dayBounds('2026-03-21', merchant).to - dayReport.dayBounds('2026-03-21', merchant).from, 23 * 3600000);
assert.equal(calendar.businessBoundary('2026-02-14') , dayReport.dayBounds('2026-02-14', merchant).from);
assert.equal(calendar.businessBoundary('2026-03-21'), dayReport.dayBounds('2026-03-21', merchant).from);

const fixedDate = class extends Date { static now() { return now; } };
const reportWindow = {
  ...windowBase,
  KiwiDayReport: dayReport,
  KiwiDateRange: {
    getDateRange: () => 'aujourdhui',
    bounds: () => [dayReport.dayBounds('2026-02-14', merchant).from, Infinity],
  },
};
const reportDocument = {
  baseURI: 'https://kiwi.test/dashboard/',
  createElement: () => ({ style: {}, click() {}, remove() {} }),
  body: { appendChild() {} },
};
const reportContext = vm.createContext({
  window: reportWindow, localStorage, document: reportDocument, Date: fixedDate, Intl, Math, JSON, Number, String, Array, Object,
  Blob, URL: { createObjectURL: () => 'blob:audit', revokeObjectURL() {} }, setTimeout: () => 1, console,
});
reportWindow.window = reportWindow;
vm.runInContext(read('assets/report.js'), reportContext, { filename: 'assets/report.js' });
const snapshot = reportWindow.KiwiReport.snapshot();
assert.equal(snapshot.grossSales, 150);
assert.equal(snapshot.refunds, 12.5);
assert.equal(snapshot.revenue, 137.5);
assert.equal(snapshot.collected, 87.5);
assert.equal(snapshot.receivable, 50);
assert.equal(snapshot.metrics.find((m) => m.label === 'Ventes nettes').value, 137.5);
assert.equal(snapshot.metrics.find((m) => m.label === 'Encaissé').value, 87.5);
assert.equal(snapshot.metrics.find((m) => m.label === 'Créances').value, 50);

let csvBlob;
reportContext.document.createElement = () => ({ style: {}, click() {}, remove() {} });
reportContext.URL = { createObjectURL: (blob) => { csvBlob = blob; return 'blob:audit'; }, revokeObjectURL() {} };
reportWindow.KiwiReport.downloadTransactions();
const csv = await csvBlob.text();
assert.match(csv, /type_transaction/);
assert.match(csv, /Remboursement/);
assert.match(csv, /-12,5/);
assert.match(csv, /R-CASH/);

const feedNodes = {
  feed: { innerHTML: '', classList: { toggle() {} } },
  sub: { textContent: '' },
  title: { textContent: '' },
};
const feedDocument = {
  readyState: 'loading',
  querySelector(selector) {
    if (selector === '[data-feed]') return feedNodes.feed;
    if (selector === '[data-feed-sub]') return feedNodes.sub;
    if (selector === '[data-feed-title]') return feedNodes.title;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
};
const feedWindow = {
  ...windowBase,
  KiwiDayReport: dayReport,
  KiwiDemoClock: undefined,
  KiwiDateRange: undefined,
  window: null,
};
const feedSource = read('assets/dateRange.js').replace(
  '  window.KiwiDateRange = {',
  '  window.__auditDashboard = { renderFeed, buildCustomFeed, rangeBounds, realSalesTotals, realInsightSummary };\n  window.KiwiDateRange = {'
);
const feedContext = vm.createContext({
  window: feedWindow, document: feedDocument, localStorage, location: { search: '' }, Date: fixedDate, Intl, Math, JSON, Number, String, Array, Object, RegExp,
  URLSearchParams, CustomEvent: function CustomEvent() {}, console,
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, requestAnimationFrame: () => 1,
});
feedWindow.window = feedWindow;
vm.runInContext(feedSource, feedContext, { filename: 'assets/dateRange.js' });
feedWindow.__auditDashboard.renderFeed();
assert.match(feedNodes.sub.textContent, /1 commande aujourd'hui/);
assert.match(feedNodes.feed.innerHTML, /Unpaid delivery/);
assert.doesNotMatch(feedNodes.feed.innerHTML, /Cash sale/);

sqlite.close();
console.log('audit-remediation-dashboard-test: R01-R04 green (DST windows, signed CSV, tender definitions, feed cutoff)');
