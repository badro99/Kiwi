import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { normalizeModifier } from '../functions/api/_rules-menu-schema.js';
import { movementMilli, recipeQuantity, convert } from '../functions/api/_rules-recipe-units.js';
import { sanitizeMenu } from '../functions/api/menu.js';
const require = createRequire(import.meta.url);
const menu = require('../assets/menu-catalog.js');
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const window = {};
vm.runInNewContext(fs.readFileSync(new URL('../assets/restaurant-units.js', import.meta.url), 'utf8'), { window });
fc.assert(fc.property(fc.double({ min: 0, max: 2e6, noNaN: true }), price => {
  const raw = { id: 'choice', name: 'Choix', price, emoji: '☕' };
  const till = menu.normalizeChoice(raw.name, price, raw.emoji, raw.id, 'Choix');
  assert.deepEqual(till, normalizeModifier(raw));
  assert.deepEqual(till, sanitizeMenu({ opts: [{ id: 'group', name: 'Options', choices: [raw] }] }, 0).opts[0].choices[0]);
}), { seed: 20261026, numRuns: 500 });
assert.equal(menu.normalizeChoice('Choix', 0.004, '', 'choice', '').price, 0);
fc.assert(fc.property(fc.integer({ min: 0, max: 100000 }), fc.constantFrom('g', 'kg', 'mg', 'ml', 'cl', 'L', 'unité'), (q, unit) => {
  for (const to of ['g', 'kg', 'mg', 'ml', 'cl', 'L', 'unité']) {
    assert.equal(window.KiwiRestaurantUnits.convert(q / 1000, unit, to), convert(q / 1000, unit, to));
  }
}), { seed: 20261026, numRuns: 500 });
for (const file of ['assets/inventory-ledger.js', 'assets/inventory-consumption.js']) {
  const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const block = source.match(/\/\* GENERATED SHARED KiwiRecipeUnits BEGIN \*\/[\s\S]*?\/\* GENERATED SHARED KiwiRecipeUnits END \*\//)[0];
  const till = vm.runInNewContext(block + ';KiwiRecipeUnits');
  fc.assert(fc.property(fc.integer({ min: -100000, max: 100000 }), fc.integer({ min: 1, max: 20 }), (q, y) => {
    assert.equal(till.movementMilli({ qty: q / 1000 }), movementMilli({ qty: q / 1000 }));
    assert.equal(till.movementMilli({ qtyMilli: q, qty: 99 }), movementMilli({ qtyMilli: q, qty: 99 }));
    assert.equal(till.recipeQuantity({ stockQty: q / 1000 }, 3, y), recipeQuantity({ stockQty: q / 1000 }, 3, y));
  }), { seed: 20261026, numRuns: 500 });
}
console.log('✓ modifier server/till parity, unit conversions and milli-unit recipe copies');
