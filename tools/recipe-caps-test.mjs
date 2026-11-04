// Fiche recette (r19) : dépasser 80 ingrédients ou 40 étapes est refusé, jamais
// coupé en silence ; une fiche dans les limites s'enregistre intacte.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const docs = {};
const win = {
  KiwiStore: { define: (name) => { docs[name] = docs[name] || { items: {} }; return { get: () => docs[name], update: (fn) => { docs[name] = fn(docs[name]) || docs[name]; return docs[name]; }, subscribe: () => () => {} }; } },
  KiwiVenue: { getVenue: () => 'resto' },
  KiwiRestaurantStock: { items: () => [] },
};
const ctx = vm.createContext({ window: win, console, Date, Math, JSON, Number, String, Object, Array, Set, Promise });
vm.runInContext(read('assets/stock-identity.js'), ctx);
vm.runInContext(read('assets/restaurant-recipes.js'), ctx);
const R = win.KiwiRestaurantRecipes;
const ings = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Ing ' + i, qty: 1, unit: 'g' }));
const steps = (n) => Array.from({ length: n }, (_, i) => 'Étape ' + i);
assert.equal(R.tooLong({ ingredients: ings(80), steps: steps(40) }), false);
assert.equal(R.tooLong({ ingredients: ings(81), steps: [] }), true);
assert.equal(R.tooLong({ ingredients: ings(2), steps: steps(41) }), true);
assert.equal(R.save('big', { itemName: 'Gros', ingredients: ings(85), steps: steps(3) }), false);
assert.equal(R.get('big'), null, 'a refused recipe is not stored, not even truncated');
R.save('ok', { itemName: 'Ok', ingredients: ings(80), steps: steps(40) });
assert.equal(R.get('ok').ingredients.length, 80); assert.equal(R.get('ok').steps.length, 40);
console.log('✓ recipe caps refuse instead of truncating');
