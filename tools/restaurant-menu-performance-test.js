#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const now = Date.now();
const items = [
  { id: 'star', name: 'Tajine vedette', price: 100, catId: 'plats', avail: true },
  { id: 'plow', name: 'Tajine populaire', price: 50, catId: 'plats', avail: true },
  { id: 'puzzle', name: 'Pastilla rentable', price: 100, catId: 'plats', avail: true },
  { id: 'dog', name: 'Soupe lente', price: 50, catId: 'plats', avail: true },
  { id: 'unknown', name: 'Recette absente', price: 40, catId: 'plats', avail: true },
];
const costs = { star: 20, plow: 40, puzzle: 10, dog: 40 };
const root = { hidden: true, innerHTML: '' };
const breadcrumb = { innerHTML: '' };
const classList = { add() {}, remove() {}, toggle() {}, contains: (x) => x === 'page-menu' };
const node = () => ({ id: '', textContent: '', innerHTML: '', style: {}, classList, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const document = {
  readyState: 'complete', body: { classList }, head: { appendChild() {} },
  querySelector: (s) => s === '[data-menu-root]' ? root : s === '.breadcrumb' ? breadcrumb : null,
  querySelectorAll: () => [], createElement: node, addEventListener() {},
};
const data = { cats: [{ id: 'plats', name: 'Plats' }], items, stations: [], opts: [] };
const window = {
  Kiwi: { handlers: {}, pageShell() {}, setActivePage() {} },
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'resto', name: 'Restaurant test', type: 'restaurant' }), getVenueType: () => 'restaurant', subscribe() {} },
  KiwiMenuStore: { data: () => data, subscribe() {}, kitchenId: () => '' },
  KiwiSales: { list: () => [
    { ts: now, lines: [
      { id: 'star', name: 'Tajine vedette', qty: 20, total: 2000 },
      { name: 'Tajine populaire', qty: 20, total: 1000 },
      { name: 'Pastilla rentable', qty: 5, total: 500 },
      { name: 'Soupe lente', qty: 5, total: 250 },
      { name: 'Recette absente', qty: 2, total: 80 },
    ] },
    { ts: now - 40 * 864e5, lines: [{ id: 'star', qty: 999, total: 99900 }] },
  ] },
  KiwiRestaurantRecipes: {
    get: (id) => costs[id] == null ? null : { itemId: id, ingredients: [{}] },
    metrics: (item) => ({ costComplete: true, theoreticalCost: costs[item.id], actualCost: null }),
  },
  addEventListener() {},
};

const context = { window, document, console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900, Date, Math, Intl, Map, Number, String, Array, Object, RegExp };
window.window = window;
window.document = document;
vm.createContext(context);
new vm.Script(fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8')).runInContext(context);
window.Kiwi.handlers['rmw-tab']({ dataset: { tab: 'performance' } });

const html = root.innerHTML;
assert.match(html, /Performance des articles/);
assert.match(html, /30 derniers jours/);
assert.match(html, /★ STARS/);
assert.match(html, /🐴 PLOWHORSES/);
assert.match(html, /❓ PUZZLES/);
assert.match(html, /🐕 DOGS/);
assert.match(html, /Tajine vedette/);
assert.match(html, /2[\s\u202f]?000 MAD/);
assert.match(html, /Compléter la recette/);
assert.doesNotMatch(html, /999[\s\u202f]?00 MAD/, 'sales older than 30 days must stay outside the analysis');
assert.match(html, /données réelles de la caisse/i);

console.log('✓ restaurant Performance uses real 30-day sales, recipe costs, margins and four-quadrant ranking');
