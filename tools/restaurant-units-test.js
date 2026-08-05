#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('assets/restaurant-units.js', 'utf8');
const recipesSource = fs.readFileSync('assets/restaurant-recipes.js', 'utf8');
const workspaceSource = fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8');
const stockSource = fs.readFileSync('assets/stock.js', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');

let recipeDoc = { items: {} };
const subscribers = new Set();
const recipeStore = {
  get: () => recipeDoc,
  update: (fn) => { recipeDoc = fn(JSON.parse(JSON.stringify(recipeDoc))) || recipeDoc; subscribers.forEach((cb) => cb(recipeDoc)); return recipeDoc; },
  subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
};
const window = {
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'resto' }) },
  KiwiStore: { define: () => recipeStore },
  KiwiRestaurantStock: { items: () => [{ id: 'tomate', name: 'Tomates', unit: 'kilo', costPerUnit: 20, usageThisWeek: 1 }] },
  KiwiSales: { list: () => [{ ts: Date.now(), lines: [{ id: 'plat', name: 'Salade', qty: 2, total: 100 }] }] },
};
const context = { window, console, Date, Math, Number, String, Array, Object, Map, Set, JSON };
window.window = window;
vm.createContext(context);
new vm.Script(source).runInContext(context);

const units = window.KiwiRestaurantUnits;
assert.strictEqual(units.normalize('kilo'), 'kg');
assert.strictEqual(units.normalize('kilogrammes'), 'kg');
assert.strictEqual(units.normalize('units'), 'unité');
assert.strictEqual(units.normalize('pack'), 'paquet');
assert.strictEqual(units.convert(500, 'g', 'kg'), 0.5);
assert.strictEqual(units.convert(75, 'cl', 'L'), 0.75);
assert.strictEqual(units.convert(1, 'carton', 'unité'), null, 'Kiwi must not invent a carton size');
assert.ok(units.list().some((unit) => unit.id === 'unité'));
assert.ok(units.list().some((unit) => unit.id === 'sac'));
assert.ok(units.list().some((unit) => unit.id === 'bouteille'));

new vm.Script(recipesSource).runInContext(context);
window.KiwiRestaurantRecipes.save('plat', {
  itemName: 'Salade', portions: 1,
  ingredients: [{ stockId: 'tomate', name: 'Tomates', qty: 500, unit: 'g' }],
});
const recipe = window.KiwiRestaurantRecipes.get('plat', 'Salade', 'resto');
const metrics = window.KiwiRestaurantRecipes.metrics({ id: 'plat', name: 'Salade', price: 50 }, recipe, 'resto');
assert.strictEqual(metrics.theoreticalCost, 10, '500 g must cost half of a 20 MAD/kg stock unit');
assert.strictEqual(window.KiwiRestaurantRecipes.theoreticalUsage('tomate', 'resto', 7), 1, 'two sales at 500 g must consume one kg');

assert.match(workspaceSource, /<select class="kf-input" data-ing-unit>/, 'recipe units must be selected');
assert.doesNotMatch(workspaceSource, /<input class="kf-input" data-ing-unit/, 'recipe units must not remain free text');
assert.match(stockSource, /data-stock-add-unit/, 'new stock items must use the shared selector');
assert.match(stockSource, /data-stock-scan-unit/, 'received stock must use the shared selector');
assert.ok(dashboard.indexOf('assets/restaurant-units.js') < dashboard.indexOf('assets/restaurant-recipes.js'), 'unit catalogue must load before recipes');

console.log('✓ restaurant units are canonical across recipes, stock creation and receiving, with safe metric conversion');
