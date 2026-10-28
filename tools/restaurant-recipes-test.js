'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const docs = {};
function makeStore(name) {
  docs[name] = docs[name] || { items: {} };
  return {
    get: () => docs[name],
    update: (fn) => { docs[name] = fn(docs[name]) || docs[name]; return docs[name]; },
    subscribe: () => () => {},
  };
}
const costStore = makeStore('costs');
docs.costs = { items: {}, ingredients: [], recipes: {}, charges: [], targets: {} };
const now = Date.now();
const context = {
  window: {
    KiwiStore: { define: (name) => makeStore(name) },
    KiwiVenue: { getVenue: () => 'restaurant-1' },
    KiwiRestaurantStock: { items: () => [{ id: 'tomato', name: 'Tomates', unit: 'kg', costPerUnit: 10, usageThisWeek: 30 }] },
    KiwiSales: { list: () => [
      { ts: now, lines: [{ id: 'dish-1', name: 'Plat 1', qty: 10 }] },
      { ts: now, lines: [{ id: 'dish-2', name: 'Plat 2', qty: 10 }] },
    ] },
    KiwiCost: { store: costStore },
  },
  console,
};
vm.createContext(context);
new vm.Script(fs.readFileSync('assets/stock-identity.js', 'utf8')).runInContext(context);
new vm.Script(fs.readFileSync('assets/restaurant-recipes.js', 'utf8')).runInContext(context);
const R = context.window.KiwiRestaurantRecipes;
const line = { stockId: 'tomato', name: 'Tomates', qty: 1, unit: 'kg' };
R.save('dish-1', { itemName: 'Plat 1', portions: 1, ingredients: [line] });
R.save('dish-2', { itemName: 'Plat 2', portions: 1, ingredients: [line] });

assert.equal(R.theoreticalUsage('tomato', 'restaurant-1', 7), 20, 'sales × exact recipe quantity drives theoretical stock usage');
const m = R.metrics({ id: 'dish-1', name: 'Plat 1', price: 100 }, R.get('dish-1'), 'restaurant-1');
assert.equal(m.theoreticalCost, 10, 'ingredient quantity × stock cost drives theoretical recipe cost');
assert.equal(m.actualCost, 15, 'physical usage is allocated pro-rata across dishes sharing an ingredient');
assert.equal(m.profit, 85, 'observed cost drives per-portion profit when available');
assert.equal(docs.costs.recipes['dish-1'].status, 'complete', 'recipe is mirrored to the central cost engine');
assert.equal(docs.costs.ingredients.find((x) => x.id === 'stock:tomato').useCost, 10, 'stock price is mirrored without demo values');
assert.equal(Object.keys(docs.recipes.items).length, 2, 'no demo recipe data is seeded');

docs.recipes.items.legacy = {
  itemName: 'Ancien tajine', portions: 1,
  ingredients: [{ name: 'Tomates', qty: 0.25, unit: 'kg' }],
};
const legacyBefore = JSON.stringify(docs.recipes.items.legacy);
const legacy = R.get('legacy');
assert.equal(R.metrics({ id: 'legacy', price: 30 }, legacy, 'restaurant-1').theoreticalCost, 2.5,
  'un ancien document sans stockId résout encore son article par nom');
assert.equal(JSON.stringify(docs.recipes.items.legacy), legacyBefore,
  'la simple lecture ne migre ni ne réécrit l’ancien document');
R.save('legacy', legacy, 'restaurant-1');
assert.equal(docs.recipes.items.legacy.ingredients[0].stockId, 'tomato',
  'le prochain enregistrement ajoute l’identifiant stable à la recette');
context.window.KiwiSales.list = () => [
 { id: 'a', ts: now, lines: [{itemId: 'dish-1', qty: 10}] },
 { id: 'b', ts: now, lines: [{itemId: 'dish-2', qty: 10}] },
 { id: 'void', ts: now, voided: true, lines: [{itemId: 'dish-1', qty: 50}] },
 { id: 'void-ts', ts: now, void_ts: now, lines: [{itemId: 'dish-1', qty: 50}] },
 { id: 'r1', ts: now, kind: 'refund', lines: [{itemId: 'dish-1', qty: 4}] },
];
context.window.KiwiRefunds = {list: () => [
 {id: 'r1', ts: now, kind: 'refund', lines: [{itemId: 'dish-1', qty: 4}]},
 {id: 'r2', ts: now, kind: 'refund', lines: [{itemId: 'dish-2', qty: -2}]},
]};
assert.equal(R.theoreticalUsage('tomato', 'restaurant-1', 7), 14, 'voids excluded, positive/negative refunds reversed exactly once');
const reversed = R.metrics({id:'dish-1', price:100}, R.get('dish-1'), 'restaurant-1');
assert.equal(reversed.sold, 6);
assert.equal(reversed.actualCost, 21.43, 'menu analysis allocates physical cost using net quantities');
// Wave 11 (analysis#0): ten pinches of 0.4 centime each are still 4 centimes.
// Each line used to be rounded to the centime before the sum (0 + 0 + … = 0),
// so menu analysis showed a cheaper dish than the Coût simple sheet, which sums
// first. Lines keep their precision; the dish cost is rounded once.
context.window.KiwiRestaurantStock = { items: () => Array.from({ length: 10 }, (_, i) => ({ id: 'spice-' + i, name: 'Épice ' + i, unit: 'kg', costPerUnit: 4 })) };
const pinches = { itemName: 'Harira', portions: 1, ingredients: Array.from({ length: 10 }, (_, i) => ({ stockId: 'spice-' + i, name: 'Épice ' + i, qty: 0.001, unit: 'kg' })) };
const pinched = R.metrics({ id: 'harira', price: 20 }, pinches, 'restaurant-1');
assert.equal(pinched.theoreticalCost, 0.04, 'sub-centime lines are summed before the dish is rounded');
assert.equal(pinched.theoreticalProfit, 19.96, 'the margin carries the pinches');
const halves = R.metrics({ id: 'harira', price: 20 }, { ...pinches, portions: 3, ingredients: pinches.ingredients.map((l) => ({ ...l, qty: 0.1 })) }, 'restaurant-1');
assert.equal(halves.theoreticalCost, 1.33, 'one rounding, after the division by portions (4 / 3)');
console.log('✓ restaurant recipes (stock quantities, shared-ingredient allocation, costs and margins)');
