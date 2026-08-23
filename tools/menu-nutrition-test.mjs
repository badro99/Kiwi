#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

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
console.log('✓ menu nutrition (unités, portions, arrondis, complétude et allergènes)');
