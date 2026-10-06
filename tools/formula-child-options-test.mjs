#!/usr/bin/env node
/* tools/formula-child-options-test.mjs · a formula's included coffee does not
 * block the order because the coffee, sold alone, has a required option.
 *
 * Browse, 2026-10-05: every brunch formula sent from the waiter app came back
 * « carte modifiée · un plat n'est plus disponible ». The formula's hot-drink
 * slot offers Espresso / Americano / Latte, and those articles carry a required
 * "Hot or Ice" group of their own. priceOrder() enforced that group on the
 * formula-part line, which no formula sheet collects. The till path never
 * applied that rule, so the same formula worked at the counter.
 *
 * Runs the shipped priceOrder() on a synthetic menu of the same shape.
 *
 *   node tools/formula-child-options-test.mjs
 */
import assert from 'node:assert/strict';
import { priceOrder } from '../functions/api/order/_lib.js';

const menu = {
  cats: [{ id: 'cat_brunch', name: 'Brunch' }],
  opts: [
    { id: 'og_temp', name: 'Hot or Ice', kind: 'one', required: true,
      choices: [{ id: 'oc_hot', name: 'Hot', price: 0 }, { id: 'oc_ice', name: 'Ice', price: 0 }] },
    { id: 'og_yog', name: 'Yogurt', kind: 'one', required: true,
      choices: [{ id: 'oc_granola', name: 'Granola & Fruit', price: 0 }, { id: 'oc_chia', name: 'Chia Bowl', price: 0 }] },
  ],
  items: [
    { id: 'it_veggie', name: 'Le Veggie', price: 89, catId: 'cat_brunch', avail: true, opts: ['og_yog'],
      formula: { slots: [
        { id: 'sl_cold', label: 'Breakfast Cold Drink', min: 1, max: 1, choices: [{ itemId: 'it_lemonade', extra: 0 }] },
        { id: 'sl_hot', label: 'Breakfast Hot Drink', min: 1, max: 1, choices: [{ itemId: 'it_espresso', extra: 0 }, { itemId: 'it_tea', extra: 0 }] },
        { id: 'sl_sweet', label: 'Brunch Sweet', min: 0, max: 1, choices: [{ itemId: 'it_toast', extra: 20 }] },
      ] } },
    { id: 'it_lemonade', name: 'Home Lemonade', price: 30, catId: 'cat_brunch', avail: true, opts: [] },
    { id: 'it_espresso', name: 'Espresso', price: 18, catId: 'cat_brunch', avail: true, opts: ['og_temp'] },
    { id: 'it_tea', name: 'Moroccan tea', price: 15, catId: 'cat_brunch', avail: true, opts: [] },
    { id: 'it_toast', name: 'French toast Pear & Caramel', price: 45, catId: 'cat_brunch', avail: true, opts: [] },
  ],
};
const data = JSON.stringify(menu);
const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ data, updated_ts: 1 }) }) }) } };
let checks = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail ? ' · ' + JSON.stringify(detail) : '')); checks++; };

/* Exactly what kiwi-serveur.html confirmFormula() + svSendOrderBatch() send. */
function waiterFormula(hot, hotChoices) {
  const uid = 'fml-fixture-ab12';
  return [
    { id: 'it_veggie', qty: 1, kind: 'formula', formulaUid: uid, formulaName: 'Le Veggie',
      optionChoices: [{ group: 'og_yog', label: 'Chia Bowl' }] },
    { id: 'it_lemonade', qty: 1, kind: 'formula-part', formulaUid: uid, slotLabel: 'Breakfast Cold Drink',
      formulaSlotId: 'sl_cold', lineId: uid + '-sl_cold', optionChoices: [] },
    { id: hot, qty: 1, kind: 'formula-part', formulaUid: uid, slotLabel: 'Breakfast Hot Drink',
      formulaSlotId: 'sl_hot', lineId: uid + '-sl_hot', optionChoices: hotChoices || [] },
    { id: 'it_toast', qty: 1, kind: 'formula-part', formulaUid: uid, slotLabel: 'Brunch Sweet',
      formulaSlotId: 'sl_sweet', lineId: uid + '-sl_sweet', optionChoices: [] },
  ];
}
const rejected = (r) => [...(r.unknown || []), ...(r.unavailable || []), ...(r.invalidOptions || []),
  ...(r.archived || []), ...(r.formulaOnly || [])];

{
  const r = await priceOrder(env, 'fixture', waiterFormula('it_espresso'));
  ok(rejected(r).length === 0, 'a formula whose included coffee has a required option is accepted', rejected(r));
  ok(r.total === 109, 'the parent carries its price plus the slot supplement, once', r.total);
  ok(r.lines.find((l) => l.id === 'it_espresso')?.unitPrice === 0, 'the included coffee stays at zero');
}
{
  const r = await priceOrder(env, 'fixture', waiterFormula('it_espresso', [{ group: 'og_temp', label: 'Ice' }]));
  ok(rejected(r).length === 0, 'an included coffee may still carry an explicit choice', rejected(r));
  ok(/Hot or Ice: Ice/.test(r.lines.find((l) => l.id === 'it_espresso')?.options || ''), 'and the kitchen sees it');
}
{
  const r = await priceOrder(env, 'fixture', waiterFormula('it_espresso', [{ group: 'og_temp', label: 'Lukewarm' }]));
  ok(r.invalidOptions.includes('Espresso'), 'an invented choice on an included coffee is still refused', r.invalidOptions);
}
{
  const r = await priceOrder(env, 'fixture', [{ id: 'it_espresso', qty: 1, optionChoices: [] }]);
  ok(r.invalidOptions.includes('Espresso'), 'an Espresso sold alone still requires its option', r.invalidOptions);
}
{
  const r = await priceOrder(env, 'fixture', waiterFormula('it_toast'));
  ok(r.invalidOptions.length > 0, 'a child outside its slot still invalidates the formula', r.invalidOptions);
}
{
  const lines = waiterFormula('it_espresso');
  lines[0].optionChoices = [];
  const r = await priceOrder(env, 'fixture', lines);
  ok(r.invalidOptions.includes('Le Veggie') || r.lines.some((l) => l.id === 'it_veggie'),
    'the formula parent keeps its existing option contract');
}

console.log(`formula-child-options-test: ${checks} checks passed`);
