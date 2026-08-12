import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/dateRange.js', import.meta.url), 'utf8');
const now = Date.now();
let sales = [];
let stock = [];
const window = {
  addEventListener() {},
  dispatchEvent() {},
  KiwiEnv: { isReal: () => true },
  KiwiVenue: { getVenue: () => 'truth-venue', getVenueType: () => 'restaurant' },
  KiwiSales: { list: () => sales },
  KiwiRestaurantStock: { items: () => stock },
};
const storage = new Map();
const context = {
  window,
  document: { readyState: 'loading', addEventListener() {}, querySelector() { return null; } },
  localStorage: { getItem(k) { return storage.get(k) ?? null; }, setItem(k, v) { storage.set(k, String(v)); } },
  CustomEvent: class CustomEvent {},
  Date, Map, Set, Intl, Math, Number, String, Array, Object, Infinity,
  requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, console,
};
vm.runInNewContext(source, context, { filename: 'assets/dateRange.js' });
const truth = window.KiwiDateRange._truth;

assert.equal(truth.tenderBucket('cash'), 'cash');
assert.equal(truth.tenderBucket('espèces'), 'cash');
assert.equal(truth.tenderBucket('visa'), 'card');
assert.equal(truth.tenderBucket('tap'), 'tap');
assert.equal(truth.tenderBucket('wallet'), 'qr');
assert.equal(truth.tenderBucket('compte'), null, 'customer credit is not collected cash');
assert.equal(truth.tenderBucket('delivery'), null, 'delivery receivable is not collected cash');
assert.equal(truth.tenderBucket('new-terminal'), 'other', 'an unknown tender is never silently called a card');

sales = [
  { ts: now, amount: 100, method: 'cash' },
  { ts: now, amount: 80, method: 'card' },
  { ts: now, amount: 60, method: 'compte' },
  { ts: now, amount: 20, method: 'new-terminal' },
];
const mix = truth.realMixRows('fr', 'aujourdhui');
assert.equal(mix.total, 200, 'credit stays out of the encaissement donut');
assert.equal(Math.round(mix.rows.find((x) => x.label === 'Espèces').pct), 50);
assert.equal(Math.round(mix.rows.find((x) => x.label === 'Carte bancaire').pct), 40);
assert.equal(Math.round(mix.rows.find((x) => x.label === 'Autre mode').pct), 10);

sales = [
  { ts: now, amount: 50, lines: [{ itemId: 'tea', name: 'Thé', qty: 2, total: 30 }, { itemId: 'cake', name: 'Cake', qty: 1, total: 20 }] },
  { ts: now, amount: 35, lines: [{ itemId: 'tea', name: 'Thé', qty: 3, total: 35 }] },
  { ts: now, amount: 40 },
];
const products = truth.realTopProducts('aujourdhui');
assert.equal(products.sales, 3);
assert.equal(products.covered, 2, 'coverage reports tickets with usable line detail');
assert.equal(products.rows[0].name, 'Thé');
assert.equal(products.rows[0].qty, 5);
assert.equal(products.rows[0].revenue, 65);

stock = [
  { id: 'milk', name: 'Lait', currentStock: 2, reorderLevel: 5, parLevel: 10, unit: 'L', costPerUnit: 8 },
  { id: 'tea', name: 'Thé', currentStock: 8, reorderLevel: 4, parLevel: 10, unit: 'kg', costPerUnit: 30 },
  { id: 'salt', name: 'Sel', currentStock: 1, reorderLevel: 0, parLevel: 0, unit: 'kg', costPerUnit: 4 },
];
const low = truth.realLowStock();
assert.equal(low.tracked, 3);
assert.equal(low.configured, 2, 'items without a threshold are disclosed but never guessed');
assert.equal(low.rows.length, 1);
assert.equal(low.rows[0].name, 'Lait');
assert.equal(low.rows[0].suggested, 10);

sales = [
  { ts: now - 864e5, amount: 592, method: 'card' },
];
let insight = truth.realInsightSummary('aujourdhui');
assert.equal(insight.count, 0, 'today never falls back to older sales');
assert.equal(truth.buildRealHeroRec(), null, 'an empty active period produces an honest empty insight');
sales = [
  { ts: now, amount: 100, method: 'cash' },
  { ts: now, amount: 50, method: 'compte' },
];
insight = truth.realInsightSummary('aujourdhui');
assert.equal(insight.count, 2);
assert.equal(insight.revenue, 150);
assert.equal(insight.collected, 100, 'credit is excluded from collected tender claims');
assert.match(truth.buildRealHeroRec().obs, /2 ventes aujourd'hui pour 150 MAD/);

assert.match(source, /window\.KiwiReservations\?\.get\?\.\(\)/, 'reservation card reads the booking store');
assert.match(source, /PRODUCTS_NO_LINES/, 'product ranking has an explicit missing-line coverage state');
assert.doesNotMatch(source, /mode inconnu → carte/, 'unknown tenders are no longer attributed to card');
assert.match(source, /renderHeroAi\(\);[\s\S]*renderHeatmapAi\(\);[\s\S]*renderMix\(\)/, 'sales repaint every sales-derived insight');
assert.match(source, /kiwi-day-report-ready/, 'business-day cutoff repaints time-windowed cards');

const venueSource = fs.readFileSync(new URL('../assets/venues.js', import.meta.url), 'utf8');
assert.doesNotMatch(venueSource, /function miCustomHeroRec/, 'the obsolete all-time insight calculator is removed');
assert.doesNotMatch(venueSource, /function miCustomHeatmapRec/, 'the duplicate calendar-midnight heatmap is removed');

const html = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
assert.match(html, /data-mix-plan-name>Abonnement Kiwi</, 'first paint does not claim an unverified paid plan');
assert.doesNotMatch(html, /data-mix-plan-name[^>]*>Abonnement Kiwi Pro</, 'Pro is never the live default');

console.log('dashboard-card-truth-test: 41 controls passed');
