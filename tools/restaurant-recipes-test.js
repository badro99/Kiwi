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
console.log('✓ restaurant recipes (stock quantities, shared-ingredient allocation, costs and margins)');
