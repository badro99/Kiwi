#!/usr/bin/env node
/* Les options comptent dans le coût matière (27 nov. 2026).
 * Un burger vendu avec « Boisson : Coca-Cola » sortait la canette du stock
 * (tools/option-stock-consumption-test.mjs) mais la marge ne la comptait pas :
 * le coût de la ligne était celui du plat seul. assets/cost.js charge cette
 * suite tel qu'il est livré ; assets/menu-option-stock.js tient le prix de
 * l'article dans le document des coûts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const near = (a, b) => a != null && Math.abs(a - b) < 1e-6;

function boot({ inventory, stockRows } = {}) {
  const mem = new Map();
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const noop = () => {};
  const subs = {};
  const win = { addEventListener: noop, console };
  win.window = win;
  const document = { addEventListener: noop, querySelector: () => null, getElementById: () => null, head: { appendChild: noop }, createElement: () => ({ style: {} }) };
  const ctx = vm.createContext({ window: win, document, localStorage, console, setTimeout: (fn) => { fn(); return 0; }, clearTimeout: noop });
  win.KiwiStore = {
    currentVenue: () => 'v-test',
    subscribe: (feature, fn) => { (subs[feature] = subs[feature] || []).push(fn); },
    define(feature, opts) {
      const key = 'kiwi:' + feature + ':v-test';
      const read = () => (mem.has(key) ? JSON.parse(mem.get(key)) : opts.blank());
      const write = (d) => { mem.set(key, JSON.stringify(d)); return d; };
      return { get: read, set: write, update(fn) { const d = read(); const n = fn(d); return write(n === undefined ? d : n); }, subscribe: noop, cloud: () => null };
    },
  };
  if (inventory) win.KiwiInventory = inventory;
  if (stockRows) win.KiwiRestaurantStock = { rows: () => stockRows.slice() };
  vm.runInContext(read('assets/cost.js'), ctx, { filename: 'cost.js' });
  if (stockRows) vm.runInContext(read('assets/menu-option-stock.js'), ctx, { filename: 'menu-option-stock.js' });
  return { C: win.KiwiCost, fireStock: () => (subs.stock || []).forEach((fn) => fn()) };
}

const opt = (stock, qty, name, group, groupName, ing) => ({
  status: 'complete', kind: 'option', name, group, groupName, yield: 1,
  lines: [{ ing: ing || 'optstock:' + stock, qty, stock, stockQty: qty, stockUnit: '' }],
});
function seed(C, extra) {
  C.setItemCost('burger', 20);
  C.store.update((d) => {
    d.ingredients = [
      { id: 'optstock:coca', name: 'Coca-Cola 33cl', unit: 'canette', useCost: 6, stockId: 'coca' },
      { id: 'optstock:cheddar', name: 'Cheddar', unit: 'kg', useCost: 120, stockId: 'cheddar' },
    ];
    d.recipes = Object.assign({
      'opt:oc_1': opt('coca', 1, 'Coca-Cola', 'og_1', 'Boisson'),
      'opt:oc_2': opt('cheddar', 0.03, 'Cheddar', 'og_2', 'Supplément'),
    }, extra || {});
    return d;
  });
}
const sale = (line, ref) => ({ id: ref, ref, ts: 1000, amount: (line.total || 0), lines: [line] });
const costOf = (C, line) => C.ledger([sale(line, 'r-' + Math.random())]).lines[0];

{ /* Le coût du plat, plus celui de ses options, par plat. */
  const { C } = boot();
  seed(C);
  const plain = costOf(C, { itemId: 'burger', name: 'Burger', qty: 2, total: 100 });
  ok(near(plain.unit, 20) && near(plain.cost, 40), 'a dish without options keeps its own cost');
  const coca = costOf(C, { itemId: 'burger', name: 'Burger', qty: 2, total: 100, optionIds: ['oc_1'] });
  ok(near(coca.unit, 26) && near(coca.cost, 52), 'a Coca-Cola option adds 6 MAD per burger');
  const both = costOf(C, { itemId: 'burger', name: 'Burger', qty: 1, total: 60, opts: [{ g: 'og_1', c: 'oc_1' }, { g: 'og_2', c: 'oc_2' }] });
  ok(near(both.unit, 29.6), '0.03 kg of cheddar at 120 MAD/kg adds 3.60 MAD');
  const remote = costOf(C, { itemId: 'burger', name: 'Burger', qty: 1, total: 60, optionText: 'Boisson: Coca-Cola' });
  ok(near(remote.unit, 26), 'a waiter or OrderPro line counts its option by « Groupe : Choix »');
  const unlinked = costOf(C, { itemId: 'burger', name: 'Burger', qty: 1, total: 60, optionIds: ['oc_9'] });
  ok(near(unlinked.unit, 20), 'an option with no stock link costs nothing');
}

{ /* Jamais un coût partiel : une option reliée sans prix rend la ligne « à chiffrer ». */
  const { C } = boot();
  seed(C, { 'opt:oc_3': opt('sauce', 0.02, 'Maison', 'og_3', 'Sauce') });
  const row = costOf(C, { itemId: 'burger', name: 'Burger', qty: 1, total: 60, optionIds: ['oc_3'] });
  ok(row.cost === null && row.unit === null, 'an unpriced linked option makes the line unpriced, not cheaper');
  const none = costOf(C, { itemId: 'wrap', name: 'Wrap', qty: 1, total: 40, optionIds: ['oc_1'] });
  ok(none.cost === null, 'an unpriced dish stays unpriced even when its option is priced');
}

{ /* Le coût relu au grand livre contient déjà les options : pas deux fois. */
  const rows = [
    { id: 'm1', reason: 'sale', refType: 'sale', refId: 'r-ledger', qty: -1, unitCost: 20, meta: { line: 0, lineQty: 1, sourceItemId: 'burger' } },
    { id: 'm2', reason: 'sale', refType: 'sale', refId: 'r-ledger', qty: -1, unitCost: 6, meta: { line: 0, lineQty: 1, sourceItemId: 'burger', recipe: 'opt:oc_1' } },
  ];
  const { C } = boot({ inventory: { isReal: () => true, history: () => rows } });
  seed(C);
  const row = C.ledger([sale({ itemId: 'burger', name: 'Burger', qty: 1, total: 60, optionIds: ['oc_1'] }, 'r-ledger')]).lines[0];
  ok(near(row.unit, 26) && row.src === 'frozen', 'the stock ledger cost (dish + option) is used once');
}

{ /* Le prix de l'article suit le stock ; une fiche d'avant passe à son ingrédient. */
  const stockRows = [{ id: 'coca', name: 'Coca-Cola 33cl', unit: 'canette', costPerUnit: 6 }, { id: 'jus', name: 'Jus', unit: 'L', costPerUnit: '' }];
  const env = boot({ stockRows });
  const { C } = env;
  C.setItemCost('burger', 20);
  C.store.update((d) => {
    d.recipes = { 'opt:oc_1': opt('coca', 1, 'Coca-Cola', 'og_1', 'Boisson', 'stock:coca'), 'opt:oc_4': opt('jus', 0.25, 'Jus', 'og_1', 'Boisson') };
    return d;
  });
  env.fireStock();
  const d = C.doc();
  ok(d.recipes['opt:oc_1'].lines[0].ing === 'optstock:coca', 'an option sheet from before pricing moves to its optstock ingredient');
  const ing = d.ingredients.find((x) => x.id === 'optstock:coca');
  ok(ing && ing.useCost === 6 && ing.unit === 'canette', 'the ingredient carries the stock unit price');
  ok(d.ingredients.find((x) => x.id === 'optstock:jus').useCost === null, 'an article with no price stays unpriced, never 0');
  ok(near(costOf(C, { itemId: 'burger', name: 'Burger', qty: 1, total: 60, optionIds: ['oc_1'] }).unit, 26), 'the option is priced once its article is');
  stockRows[0].costPerUnit = 7.5;
  env.fireStock();
  ok(C.doc().ingredients.find((x) => x.id === 'optstock:coca').useCost === 7.5, 'a new purchase price reaches the option');
  const before = JSON.stringify(C.doc());
  env.fireStock();
  ok(JSON.stringify(C.doc()) === before, 'nothing is written when everything is already right');
}

{ /* Une seule règle pour le stock et la marge. */
  const rules = JSON.parse(read('tools/shared-rules.json')).rules.find((r) => r.name === 'KiwiOptionIds');
  ok(rules && rules.targets.includes('assets/cost.js') && rules.targets.includes('assets/inventory-consumption.js'), 'cost and stock share KiwiOptionIds');
}

console.log(`option-food-cost: ${passed} checks passed`);
