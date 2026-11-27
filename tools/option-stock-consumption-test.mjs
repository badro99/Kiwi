#!/usr/bin/env node
/* Les options et les composants de formule sortent du stock (27 nov. 2026).
 * « Boisson : Coca-Cola » sur un burger, ou le Coca-Cola d'un menu burger,
 * ne sortaient rien : l'option n'était que du texte sur la ligne, et la ligne
 * de formule était sautée. Une option se relie à un article par une fiche
 * `opt:<choix>` du document des coûts (assets/menu-option-stock.js). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ledger = fs.readFileSync(new URL('../assets/inventory-ledger.js', import.meta.url), 'utf8');
const consumption = fs.readFileSync(new URL('../assets/inventory-consumption.js', import.meta.url), 'utf8');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

const optRecipe = (stock, qty, name, group, groupName) => ({
  status: 'complete', kind: 'option', name, group, groupName, yield: 1,
  lines: [{ ing: 'stock:' + stock, qty, stock, stockQty: qty, stockUnit: '' }],
});
const COSTS = {
  ingredients: [],
  recipes: {
    burger: { status: 'complete', name: 'Burger', yield: 1, lines: [{ ing: 'stock:bun', qty: 1, stock: 'bun', stockQty: 1 }, { ing: 'stock:steak', qty: 1, stock: 'steak', stockQty: 1 }] },
    'opt:oc_1': optRecipe('coca', 1, 'Coca-Cola', 'og_1', 'Boisson'),
    'opt:oc_2': optRecipe('cheddar', 0.03, 'Cheddar', 'og_2', 'Supplément'),
    'opt:oc_3': optRecipe('fanta', 1, 'Fanta', 'og_1', 'Boisson'),
    /* Même nom dans deux groupes : le texte seul ne sait pas lequel. */
    'opt:oc_4': optRecipe('mayo', 0.02, 'Sans', 'og_3', 'Sauce'),
    'opt:oc_5': optRecipe('ketchup', 0.02, 'Sans', 'og_4', 'Sauce'),
  },
};

function harness(costs = COSTS) {
  const memory = new Map();
  const localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  const window = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'opt-test' }, addEventListener() {} };
  const context = vm.createContext({ window, localStorage, navigator: { onLine: false }, console,
    async fetch() { return { ok: false, json: async () => ({}) }; },
    Date: class extends Date { static now() { return 10000; } }, setTimeout() {}, setInterval() {} });
  vm.runInContext(ledger, context);
  const I = window.KiwiInventory;
  for (const id of ['bun', 'steak', 'coca', 'cheddar', 'fanta', 'mayo', 'ketchup', 'coca-menu']) {
    I.add({ id: 'open-' + id, itemId: id, qty: 100, unitCost: 2, reason: 'receipt', occurredTs: 100 });
  }
  window.KiwiCost = { doc: () => costs };
  vm.runInContext(consumption, context);
  const sold = (id) => -I.history(id).filter(r => r.reason === 'sale').reduce((s, r) => s + r.qty, 0);
  const restored = (id) => I.history(id).filter(r => r.reason === 'sale-reversal').reduce((s, r) => s + r.qty, 0);
  return { I, C: window.KiwiInventoryConsumption, sold, restored };
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

{ /* La caisse : l'option porte l'identifiant du choix (opts[].c). */
  const h = harness();
  h.C.record({ id: 's1', ref: '#1', ts: 2000, lines: [{ itemId: 'burger', name: 'Burger', qty: 2,
    opts: [{ g: 'og_1', c: 'oc_1', cn: 'Coca-Cola' }, { g: 'og_2', c: 'oc_2', cn: 'Cheddar' }] }] });
  ok(h.sold('bun') === 2 && h.sold('steak') === 2, 'the dish still leaves its own recipe');
  ok(h.sold('coca') === 2, 'two burgers with a Coca-Cola option take two cans');
  ok(near(h.sold('cheddar'), 0.06), 'an extra-cheddar option takes 0.03 kg per dish');
  ok(h.sold('fanta') === 0, 'an option that was not chosen takes nothing');
  const coca = h.I.history('coca').find(r => r.reason === 'sale');
  ok(coca.meta.recipe === 'opt:oc_1' && coca.meta.sourceItemId === 'burger', 'the movement names the option and the dish it came with');
  h.C.record({ id: 's1', ref: '#1', ts: 2000, lines: [{ itemId: 'burger', name: 'Burger', qty: 2,
    opts: [{ g: 'og_1', c: 'oc_1' }, { g: 'og_2', c: 'oc_2' }] }] });
  ok(h.sold('coca') === 2 && h.sold('bun') === 2, 'a replayed sale takes nothing twice');
  h.C.reverse('#1', 'test', 's1');
  ok(h.restored('coca') === 2 && near(h.restored('cheddar'), 0.06), 'cancelling the sale gives the option stock back');
}

{ /* Les mouvements du plat gardent leur identifiant quand une option s'ajoute. */
  const plain = harness(), withOpt = harness();
  plain.C.record({ id: 's2', ref: '#2', ts: 2000, lines: [{ itemId: 'burger', qty: 1 }] });
  withOpt.C.record({ id: 's2', ref: '#2', ts: 2000, lines: [{ itemId: 'burger', qty: 1, optionIds: ['oc_1'] }] });
  const ids = (h) => h.I.history().filter(r => r.reason === 'sale' && r.itemId !== 'coca').map(r => r.id).sort().join();
  ok(ids(plain) === ids(withOpt), 'dish movement ids do not move when options are added');
  ok(withOpt.sold('coca') === 1, 'optionIds (the receipt line) are read');
}

{ /* Une commande du serveur ou d'OrderPro : le texte validé par le serveur. */
  const h = harness();
  h.C.record({ id: 's3', ref: '#3', ts: 2000, lines: [{ itemId: 'burger', qty: 1, optionText: 'Boisson: Coca-Cola · Supplément: Cheddar' }] });
  ok(h.sold('coca') === 1 && near(h.sold('cheddar'), 0.03), 'remote order text « Groupe: Choix » resolves to the options');
  h.C.record({ id: 's4', ref: '#4', ts: 2000, lines: [{ itemId: 'burger', qty: 1, optionChoices: [{ group: 'og_1', label: 'Fanta' }] }] });
  ok(h.sold('fanta') === 1, 'waiter optionChoices {group, label} resolve by group and name');
  h.C.record({ id: 's5', ref: '#5', ts: 2000, lines: [{ itemId: 'burger', qty: 1, visuals: [{ name: 'Sans' }], optionText: 'Sauce: Sans' }] });
  ok(h.sold('mayo') === 0 && h.sold('ketchup') === 0, 'an ambiguous name takes nothing rather than guessing');
}

{ /* Vente rapide (pos-fastfood) : options [{ id, qty }]. */
  const h = harness();
  h.C.record({ id: 's6', ref: '#6', ts: 2000, lines: [{ itemId: 'burger', qty: 3, options: [{ id: 'menu', qty: 3 }, { id: 'oc_3', qty: 3 }] }] });
  ok(h.sold('fanta') === 3, 'fast-food option ids are read');
}

{ /* Un plat sans fiche, inconnu du stock, garde son option. */
  const h = harness();
  h.C.record({ id: 's7', ref: '#7', ts: 2000, lines: [{ itemId: 'wrap', qty: 1, opts: [{ g: 'og_1', c: 'oc_1' }] }] });
  ok(h.sold('coca') === 1, 'a dish with no recipe still takes its option');
  ok(h.I.history('wrap').length === 0, 'and no phantom article is created for the dish');
}

{ /* Une formule : ses composants sortent, la formule elle-même non. */
  const h = harness();
  const r = h.C.record({ id: 's8', ref: '#8', ts: 2000, lines: [{ itemId: 'menu-burger', name: 'Menu burger', kind: 'formula', qty: 2,
    formulaChoices: [{ name: 'Burger', qty: 2, total: 0, itemId: 'burger' }, { name: 'Coca-Cola', qty: 2, total: 0, itemId: 'coca-menu' }, { name: 'Ancien', qty: 2, total: 0 }] }] });
  ok(h.sold('bun') === 2 && h.sold('steak') === 2, 'a formula component with a recipe leaves its recipe');
  ok(h.sold('coca-menu') === 2, 'a formula component that is a stock article leaves itself');
  ok(h.I.history('menu-burger').length === 0, 'the formula itself takes nothing');
  ok(r.written >= 3, 'the formula wrote its movements');
  const legacy = harness();
  const skipped = legacy.C.record({ id: 's9', ref: '#9', ts: 2000, lines: [{ itemId: 'menu-burger', kind: 'formula', qty: 1,
    formulaChoices: [{ name: 'Burger', qty: 1, total: 0 }] }] });
  ok(skipped.written === 0 && skipped.skipped === 1, 'an old formula without component ids is skipped as before');
}

{ /* Le repêchage par nom (addition partagée) ne prend jamais une option pour un plat. */
  const h = harness();
  h.C.record({ id: 's10', ref: '#10', ts: 2000, lines: [{ name: 'Coca-Cola', qty: 1 }] });
  ok(h.sold('coca') === 0, 'a name-only line never matches an option sheet');
}

{ /* La caisse pose optionIds / optionText et l'article de chaque composant. */
  const receipts = fs.readFileSync(new URL('../assets/caisse/receipts.js', import.meta.url), 'utf8');
  ok(/out\.optionIds = optionIds/.test(receipts) && /out\.optionText = String\(line\.options\)/.test(receipts), 'receipt lines carry the chosen options');
  ok(/itemId: String\(part\.id \|\| ''\)/.test(receipts), 'formula components carry their article id');
  const modifiers = fs.readFileSync(new URL('../assets/menu-catalog/modifiers.js', import.meta.url), 'utf8');
  ok(modifiers.includes("'kiwi-menu-options-painted'"), 'the options window announces each paint');
  const editor = fs.readFileSync(new URL('../assets/menu-option-stock.js', import.meta.url), 'utf8');
  ok(/'opt:' \+ ref\.choiceId/.test(editor) && !/\/api\/menu/.test(editor), 'the link is written to the private cost document, never the public menu');
}

console.log(`option-stock-consumption: ${passed} checks passed`);
