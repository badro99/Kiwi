/* Fusion locale-first : suppression, égalité d'horloge, ordre de fusion.
 * Charge le VRAI assets/cost.js et le VRAI assets/restaurant-recipes.js. */
import { createRequire } from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { loadCost } = require('./kiwi-cost-harness.js');

function costWorld() {
  const merges = {};
  const ctx = { window: {}, console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  const cost = loadCostWithMerge(ctx, merges);
  return { cost, merge: merges.costs };
}
function loadCostWithMerge(ctx, merges) {
  const win = ctx.window;
  const docs = new Map();
  win.KiwiStore = {
    currentVenue: () => 'v-test',
    define(feature, def) {
      merges[feature] = def.merge; merges[feature + ':def'] = def;
      const read = () => (docs.has(feature) ? JSON.parse(docs.get(feature)) : def.blank());
      const write = (d) => { docs.set(feature, JSON.stringify(d)); return d; };
      return { get: read, set: write, update(fn) { const d = read(); const n = fn(d); return write(n === undefined ? d : n); }, subscribe: () => () => {}, cloud: () => null };
    },
  };
  vm.runInContext(fs.readFileSync(new URL('../assets/cost.js', import.meta.url), 'utf8'), ctx, { filename: 'cost.js' });
  return win.KiwiCost;
}

// 1 · un coût effacé ne revient pas quand un appareil en retard le renvoie
{
  const { cost, merge } = costWorld();
  cost.setItemCost('dish', 12, 'a');
  const stale = JSON.parse(JSON.stringify(cost.doc()));       // l'autre appareil garde l'ancien coût
  cost.setItemCost('dish', 0, 'a');                           // le patron l'efface
  const mine = cost.doc();
  assert.equal(mine.items.dish, undefined);
  for (const merged of [merge(mine, stale), merge(stale, mine)]) {
    assert.equal(merged.items.dish, undefined, 'le coût effacé ne ressuscite pas');
  }
  // ressaisi après : la nouvelle saisie gagne sur la pierre tombale
  cost.setItemCost('dish', 15, 'a');
  assert.equal(merge(cost.doc(), mine).items.dish.cost, 15);
  assert.equal(merge(mine, cost.doc()).items.dish.cost, 15);
}

// 2 · même instant : le résultat ne dépend pas de l'ordre de fusion
{
  const { merge } = costWorld();
  const A = { items: { x: { cost: 5, at: 1000, by: 'a' } }, recipes: {}, ingredients: [{ id: 'i', useCost: 1, at: 7 }] };
  const B = { items: { x: { cost: 9, at: 1000, by: 'b' } }, recipes: {}, ingredients: [{ id: 'i', useCost: 2, at: 7 }] };
  const ab = merge(A, B), ba = merge(B, A);
  assert.deepEqual(ab.items, ba.items, 'saisies de même instant : même gagnant dans les deux ordres');
  assert.deepEqual(ab.ingredients, ba.ingredients, 'ingrédients de même instant : même gagnant');
}

// 3 · fiche miroir effacée : pas de retour par la fusion
{
  const { cost, merge } = costWorld();
  const stale = { items: {}, recipes: { r1: { status: 'complete', name: 'Plat', yield: 1, lines: [], at: 500 } }, ingredients: [] };
  cost.store.update((d) => { d.recipes = { r1: stale.recipes.r1 }; return d; });
  cost.removeRecipe('r1');
  const mine = cost.doc();
  assert.equal(mine.recipes.r1, undefined);
  assert.equal(merge(mine, stale).recipes.r1, undefined);
  assert.equal(merge(stale, mine).recipes.r1, undefined);
}

// 4 · restaurant-recipes : remove() pose la pierre tombale dans les deux documents, la fusion la respecte
{
  const merges = {}; const docs = new Map();
  const ctx = { window: {}, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
  const win = ctx.window;
  win.KiwiStore = {
    currentVenue: () => 'v-test',
    define(feature, def) {
      merges[feature] = def;
      const read = () => (docs.has(feature) ? JSON.parse(docs.get(feature)) : def.blank());
      const write = (d) => { docs.set(feature, JSON.stringify(d)); return d; };
      return { get: read, set: write, update(fn) { const d = read(); const n = fn(d); return write(n === undefined ? d : n); }, subscribe: () => () => {}, cloud: () => null };
    },
  };
  win.KiwiVenue = { getVenue: () => 'v-test' };
  win.KiwiRestaurantStock = { items: () => [{ id: 'tom', name: 'Tomates', unit: 'kg', costPerUnit: 10 }] };
  vm.runInContext(fs.readFileSync(new URL('../assets/cost.js', import.meta.url), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(new URL('../assets/stock-identity.js', import.meta.url), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(new URL('../assets/restaurant-recipes.js', import.meta.url), 'utf8'), ctx);
  const R = win.KiwiRestaurantRecipes;
  R.save('d1', { itemName: 'Plat', portions: 1, ingredients: [{ stockId: 'tom', name: 'Tomates', qty: 1, unit: 'kg' }] });
  const staleRecipes = JSON.parse(docs.get('recipes'));
  const staleCosts = JSON.parse(docs.get('costs'));
  assert.ok(staleRecipes.items.d1 && staleCosts.recipes.d1);
  R.remove('d1');
  const mineR = JSON.parse(docs.get('recipes')), mineC = JSON.parse(docs.get('costs'));
  assert.equal(mineR.items.d1, undefined);
  assert.equal(mineC.recipes.d1, undefined);
  const mr = merges.recipes.merge, mc = merges.costs.merge;
  assert.equal(mr(mineR, staleRecipes).items.d1, undefined, 'la fiche effacée ne revient pas (appareil en retard)');
  assert.equal(mr(staleRecipes, mineR).items.d1, undefined);
  assert.equal(mc(mineC, staleCosts).recipes.d1, undefined, 'le miroir de coût non plus');
  assert.equal(mc(staleCosts, mineC).recipes.d1, undefined);
  // la fiche recréée ensuite revient bien
  R.save('d1', { itemName: 'Plat', portions: 2, ingredients: [{ stockId: 'tom', name: 'Tomates', qty: 1, unit: 'kg' }] });
  assert.ok(mr(JSON.parse(docs.get('recipes')), mineR).items.d1, 'recréée après l’effacement : elle gagne');
  assert.ok(mc(JSON.parse(docs.get('costs')), mineC).recipes.d1);
  // égalité d'horloge entre deux fiches : même gagnant dans les deux ordres
  const X = { items: { z: { itemName: 'A', updatedAt: 50, portions: 1 } }, removed: {} };
  const Y = { items: { z: { itemName: 'B', updatedAt: 50, portions: 1 } }, removed: {} };
  assert.deepEqual(mr(X, Y).items, mr(Y, X).items);
}
console.log('merge-tombstones · ok');
