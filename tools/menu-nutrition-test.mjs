#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const N = require('../assets/menu-nutrition.js');

const nutrition = (extra = {}) => ({
  nutrition: { per100g: { kcal: 100, protein: 10, carbs: 20, fat: 5, sugars: 2, salt: 0.4 } },
  allergens: [],
  ...extra,
});

assert.equal(N.quantityToGrams(250, 'g', {}), 250);
assert.equal(N.quantityToGrams(1.5, 'kg', {}), 1500);
assert.equal(N.quantityToGrams(200, 'ml', { gramsPerUnit: 1.03 }), 206);
assert.equal(N.quantityToGrams(25, 'cl', { gramsPerUnit: 1 }), 250);
assert.equal(N.quantityToGrams(0.5, 'l', { gramsPerUnit: 1 }), 500);
assert.equal(N.quantityToGrams(2, 'pièce', { gramsPerUnit: 50 }), 100);
assert.equal(N.quantityToGrams(1, 'pièce', {}), null, 'une pièce sans poids reste insoluble');

const rows = [
  { id: 'farine', name: 'Farine', unit: 'kg', ...nutrition({ allergens: ['gluten'] }) },
  { id: 'oeuf', name: 'Œuf', unit: 'unité', ...nutrition({ gramsPerUnit: 50, allergens: ['oeufs'] }) },
];
const result = N.compute({ portions: 2, ingredients: [
  { stockId: 'farine', name: 'Farine', qty: 0.2, unit: 'kg' },
  { stockId: 'oeuf', name: 'Œuf', qty: 2, unit: 'pièce' },
] }, rows);
assert.deepEqual(result.nutrition, { kcal: 150, protein: 15, carbs: 30, fat: 7.5, sugars: 3, salt: 0.6 });
assert.deepEqual(result.allergens, ['gluten', 'oeufs']);
assert.equal(result.complete, true);

const rounded = N.compute({ portions: 3, ingredients: [{ stockId: 'farine', qty: 0.1, unit: 'kg' }] }, rows);
assert.deepEqual(rounded.nutrition, { kcal: 33, protein: 3.3, carbs: 6.7, fat: 1.7, sugars: 0.7, salt: 0.1 });

const missingNutrition = N.compute({ portions: 1, ingredients: [{ stockId: 'x', name: 'Mystère', qty: 1, unit: 'g' }] }, [{ id: 'x', name: 'Mystère', allergens: [] }]);
assert.equal(missingNutrition.nutritionComplete, false);
assert.equal(missingNutrition.allergensComplete, true);
assert.equal(missingNutrition.nutrition, null);

const missingAllergens = N.compute({ portions: 1, ingredients: [{ stockId: 'farine', qty: 1, unit: 'g' }] }, [{ id: 'farine', name: 'Farine', ...nutrition(), allergens: undefined }]);
assert.equal(missingAllergens.nutritionComplete, true);
assert.equal(missingAllergens.allergensComplete, false);
assert.equal(missingAllergens.complete, false);

const ignoredZero = N.compute({ portions: 1, ingredients: [
  { stockId: 'farine', qty: 100, unit: 'g' }, { stockId: 'missing', qty: 0, unit: 'pièce' },
] }, rows);
assert.equal(ignoredZero.complete, true, 'les lignes à quantité nulle ne bloquent pas la fiche');

const ambiguous = N.compute({ portions: 1, ingredients: [{ name: 'Sucre', qty: 10, unit: 'g' }] }, [
  { id: 'a', name: 'Sucre', ...nutrition() }, { id: 'b', name: 'Sucre', ...nutrition() },
]);
assert.equal(ambiguous.complete, false, 'un nom ambigu échoue sans produire un chiffre possiblement faux');

assert.deepEqual(N.normalizeAllergens(['lait', 'bogus', 'gluten', 'lait']), ['gluten', 'lait']);

const ciqualPath = new URL('../assets/data/ciqual-lite.json', import.meta.url);
const ciqualSize = fs.statSync(ciqualPath).size;
const ciqual = JSON.parse(fs.readFileSync(ciqualPath, 'utf8'));
assert.match(ciqual.source.citation, /Anses\. 2025/);
assert.match(ciqual.source.licence, /Etalab 2\.0/);
assert.ok(ciqual.foods.length >= 800 && ciqual.foods.length <= 1500);
assert.ok(ciqualSize < 250 * 1024, `ciqual-lite dépasse 250 Ko (${ciqualSize} octets)`);
assert.ok(ciqual.foods.every((food) => ['id', 'nameFr', 'nameEn', 'kcal', 'protein', 'carbs', 'fat', 'sugars', 'salt', 'allergenHints'].every((key) => Object.hasOwn(food, key))));
assert.ok(ciqual.foods.every((food) => food.nameFr && food.nameEn && N.NUTRIENT_KEYS.every((key) => Number.isFinite(food[key]) && food[key] >= 0)));
assert.ok(ciqual.foods.every((food) => food.allergenHints.every((key) => N.ALLERGEN_KEYS.includes(key))));
const stockSource = fs.readFileSync(new URL('../assets/stock.js', import.meta.url), 'utf8');
const dashboardSource = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
assert.match(stockSource, /fetch\('assets\/data\/ciqual-lite\.json'/, 'Ciqual reste chargé à la demande dans l’éditeur');
assert.match(stockSource, /data-allergen-confirm/, 'les suggestions allergènes exigent une confirmation explicite');
assert.match(stockSource, /nutritionPatch = \{ nutrition: nutritionData\.nutrition, gramsPerUnit:/, 'la sauvegarde porte les champs optionnels');
assert.match(stockSource, /KiwiRestaurantRecipes\?\.recomputeForStock/, 'la sauvegarde stock déclenche la cascade nutritionnelle');
assert.ok(dashboardSource.indexOf('src="assets/menu-nutrition.js') < dashboardSource.indexOf('src="assets/stock.js'), 'le moteur nutrition charge avant le stock');

const docs = { recipes: { items: {} }, costs: { ingredients: [], recipes: {} } };
let stockRows = [{
  id: 'tomato', name: 'Tomate', unit: 'g', costPerUnit: 0.01, allergens: [],
  nutrition: { per100g: { kcal: 20, protein: 1, carbs: 4, fat: 0.2, sugars: 3, salt: 0.01 } },
}];
const menuDoc = { items: [{ id: 'dish', name: 'Salade', price: 40 }] };
const makeStore = (name) => ({
  get: () => docs[name] || (docs[name] = { items: {} }),
  update: (fn) => { const value = docs[name] || (docs[name] = { items: {} }); docs[name] = fn(value) || value; return docs[name]; },
  subscribe: () => () => {},
});
const recipeContext = {
  window: {
    KiwiStore: { define: (name) => makeStore(name), subscribe: () => () => {} },
    KiwiVenue: { getVenue: () => 'venue-1' },
    KiwiRestaurantUnits: { normalize: (unit) => unit, convert: (qty, from, to) => from === to ? qty : null, unitCost: (cost, from, to) => from === to ? cost : null },
    KiwiRestaurantStock: { rows: () => stockRows },
    KiwiMenuNutrition: N,
    KiwiMenuStore: {
      data: () => menuDoc,
      updateItem: (id, patch) => { const item = menuDoc.items.find((entry) => entry.id === id); Object.assign(item, patch); if (patch.nutrition == null) delete item.nutrition; },
    },
    KiwiCost: { store: makeStore('costs') }, KiwiSales: { list: () => [] },
  },
  console,
};
vm.createContext(recipeContext);
new vm.Script(fs.readFileSync(new URL('../assets/restaurant-recipes.js', import.meta.url), 'utf8')).runInContext(recipeContext);
const recipes = recipeContext.window.KiwiRestaurantRecipes;
recipes.save('dish', { itemName: 'Salade', portions: 1, ingredients: [{ stockId: 'tomato', name: 'Tomate', qty: 100, unit: 'g' }] }, 'venue-1');
assert.deepEqual(JSON.parse(JSON.stringify(menuDoc.items[0].nutrition)), { kcal: 20, protein: 1, carbs: 4, fat: 0.2, sugars: 3, salt: 0, perPortion: true });
assert.equal(menuDoc.items[0].nutritionComplete, true, 'une recette complète est publiée dans le catalogue');
stockRows = [{ ...stockRows[0], nutrition: { per100g: { ...stockRows[0].nutrition.per100g, kcal: 40 } } }];
assert.equal(recipes.recomputeForStock('tomato', 'venue-1'), 1, 'la cascade cible la recette dépendante');
assert.equal(menuDoc.items[0].nutrition.kcal, 40, 'une fiche stock modifiée recalcule le plat');
stockRows = [{ ...stockRows[0], allergens: undefined }];
recipes.recomputeForStock('tomato', 'venue-1');
assert.equal(menuDoc.items[0].nutritionComplete, false);
assert.equal(menuDoc.items[0].nutrition, undefined, 'une cascade incomplète efface un ancien chiffre publiable');

const workspaceSource = fs.readFileSync(new URL('../assets/restaurant-menu-workspace.js', import.meta.url), 'utf8');
assert.match(workspaceSource, /nutritionStatus\(x\)/, 'le workspace affiche un indicateur nutrition par plat');
assert.match(workspaceSource, /data-hide-nutrition/, 'le masquage par plat reste disponible dans la recette');
console.log('✓ menu nutrition (unités, portions, arrondis, complétude et allergènes)');
