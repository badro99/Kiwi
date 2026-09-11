#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const at = (hour, minute = 0) => { const d = new Date(); d.setHours(hour, minute, 0, 0); return d.getTime(); };
const items = [
  { id: 'shawarma', name: 'Shawarma poulet', price: 30, catId: 'plats', avail: true },
  { id: 'tajine', name: 'Tajine kefta', price: 50, catId: 'plats', avail: true },
  { id: 'coffee', name: 'Café noir', price: 10, catId: 'boissons', avail: true },
];
const root = { hidden: true, innerHTML: '' };
const breadcrumb = { innerHTML: '' };
const classList = { add() {}, remove() {}, toggle() {}, contains: (x) => x === 'page-menu' };
const node = () => ({ id: '', textContent: '', innerHTML: '', style: {}, classList, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const document = {
  readyState: 'complete', body: { classList }, head: { appendChild() {} },
  querySelector: (s) => s === '[data-menu-root]' ? root : s === '.breadcrumb' ? breadcrumb : null,
  querySelectorAll: () => [], createElement: node, addEventListener() {},
};
const data = { cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }], items, stations: [], opts: [] };
const week = {};
['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(day => { week[day] = { open: true, periods: [{ from: '12:00', to: '02:00' }] }; });
const toMin = (value) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const span = (p) => { const from = toMin(p.from), to = toMin(p.to); return to > from ? to - from : to + 1440 - from; };
const window = {
  Kiwi: { handlers: {}, pageShell() {}, setActivePage() {} },
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'resto', name: 'Restaurant de nuit', type: 'restaurant' }), getVenueType: () => 'restaurant', subscribe() {} },
  KiwiMenuStore: { data: () => data, subscribe() {}, kitchenId: () => '' },
  KiwiHours: { DAYS: Object.keys(week), get: () => ({ week }), isConfigured: () => true, toMin, span, subscribe() {} },
  KiwiSales: { subscribe() {}, list: () => [
    { ts: at(13), lines: [{ id: 'shawarma', qty: 3, total: 90 }, { id: 'tajine', qty: 2, total: 100 }] },
    { ts: at(20), lines: [{ id: 'shawarma', qty: 5, total: 150 }, { id: 'tajine', qty: 1, total: 50 }] },
    { ts: at(9), lines: [{ id: 'coffee', qty: 50, total: 500 }] },
  ] },
  KiwiRestaurantRecipes: { subscribe() {} },
  addEventListener() {},
};

const context = { window, document, console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900, Date, Math, Intl, Map, Number, String, Array, Object, RegExp };
window.window = window;
window.document = document;
vm.createContext(context);
new vm.Script(fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8')).runInContext(context);
window.Kiwi.handlers['rmw-tab']({ dataset: { tab: 'hours' } });

let html = root.innerHTML;
assert.match(html, /Performance par moment de la journée/);
assert.match(html, /Midi \(12h-15h\)/, 'lunch starts when this restaurant actually opens');
assert.match(html, /Soir \(19h-02h\)/, 'the evening service follows an overnight closing time');
assert.doesNotMatch(html, /Matin \(/, 'a restaurant closed in the morning must not get a morning tab');
assert.match(html, />5<\/b>/, 'lunch includes the five detailed items sold at lunch');
assert.match(html, /190 MAD/, 'lunch revenue comes from real sale lines');
assert.doesNotMatch(html, /Café noir/, 'a closed morning is not mixed into lunch performance');

window.Kiwi.handlers['rmw-hours-period']({ dataset: { period: 'soir' } });
html = root.innerHTML;
assert.match(html, />6<\/b>/, 'evening includes the six detailed items sold in that period');
assert.match(html, /200 MAD/, 'evening revenue comes from real sale lines');
assert.match(html, /Shawarma poulet/);
assert.match(html, /données réelles de la caisse/i);

console.log('✓ restaurant peak hours follows opening hours, overnight closing and real cashier lines');
