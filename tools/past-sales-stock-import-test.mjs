/* Jon's Burgers, 26 nov. 2026 : les ventes d'avant Kiwi (assets/past-sales.js)
 * et l'import d'une liste d'articles de stock (assets/stock/import.js).
 * La logique tourne ici telle quelle, dans vm, avec le vrai lecteur CSV
 * (assets/catalog-import.js) ; l'écran se vérifie au navigateur à part. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('  ok ' + checks + ' - ' + name); };
/* Les valeurs nées dans vm ont un autre Array.prototype : on compare leur JSON. */
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

function world() {
  const window = { KiwiI18n: { getLang: () => 'fr' } };
  const ctx = vm.createContext({ window, document: { documentElement: { lang: 'fr' } }, TextDecoder, Intl, URL, Blob: class {}, console });
  vm.runInContext(read('assets/catalog-import.js'), ctx);
  return { window, ctx };
}

/* ───────── ventes antérieures ───────── */
const W = world();
vm.runInContext(read('assets/past-sales.js'), W.ctx);
const P = W.window.KiwiPastSales;
const sum = (a) => a.reduce((s, x) => s + x, 0);

check('a period total spreads in whole numbers and keeps its exact sum', () => {
  for (const [q, n] of [[31, 30], [7, 30], [100, 7], [0, 5], [5, 5], [2.5, 4]]) {
    const out = P.spread(q, n);
    assert.equal(out.length, n);
    assert.equal(Math.round(sum(out) * 1000) / 1000, q, q + ' over ' + n);
    assert.ok(out.every((x) => x >= 0));
  }
  deq(P.spread(3, 6), [0, 1, 0, 1, 0, 1], 'the remainder is spaced out, not piled at the end');
});

check('a period becomes one entry per day; empty days are sent empty so a re-entered period replaces them', () => {
  const days = P.periodDays('2026-11-01', '2026-11-03', [{ name: 'Tacos Indien', qty: 4, unitCents: 4000, cat: 'Blue Tacos' }]);
  deq(days.map((d) => d.day), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.equal(sum(days.map((d) => d.lines.reduce((s, l) => s + l.qty, 0))), 4);
  assert.equal(P.totalCents(days), 16000);
  const sparse = P.periodDays('2026-11-01', '2026-11-03', [{ name: 'Rare', qty: 1, unitCents: 1000 }]);
  assert.equal(sparse.filter((d) => !d.lines.length).length, 2);
});

check('dates as merchants write them', () => {
  assert.equal(P.parseDay('2026-11-03'), '2026-11-03');
  assert.equal(P.parseDay('03/11/2026'), '2026-11-03');
  assert.equal(P.parseDay('3/11/26'), '2026-11-03');
  assert.equal(P.parseDay('03-11-2026'), '2026-11-03');
  assert.equal(P.parseDay('03.11.2026'), '2026-11-03');
  assert.equal(P.parseDay('31/02/2026'), '');
  assert.equal(P.parseDay('hier'), '');
});

const MENU = [{ name: 'Tacos Indien', price: 40, cat: 'Blue Tacos' }, { name: 'Double Cheese', price: 65, cat: 'Burgers' }];

check('a semicolon file from Excel FR: menu price when the file has none, total ÷ quantity when it gives a total', () => {
  const csv = 'Date;Article;Quantité;Prix;Total\n'
    + '01/11/2026;Tacos indien;12;;\n'
    + '01/11/2026;Double Cheese;3;70;\n'
    + '02/11/2026;Milkshake;4;;100\n'
    + '02/11/2026;Inconnu;2;;\n'
    + '02/11/2026;Tacos Indien;abc;;\n'
    + '31/02/2026;Tacos Indien;1;;\n';
  const p = P.planFromText(csv, MENU, '');
  assert.ok(p.ok);
  deq(p.days.map((d) => d.day), ['2026-11-01', '2026-11-02']);
  deq(p.days[0].lines[0], { name: 'Tacos Indien', qty: 12, unitCents: 4000, cat: 'Blue Tacos' }, 'menu spelling and price');
  assert.equal(p.days[0].lines[1].unitCents, 7000, 'the file price wins');
  assert.equal(p.days[1].lines[0].unitCents, 2500, 'total / quantity');
  deq(p.issues.map((x) => x.why), ['noPrice', 'badQty', 'badDate']);
  const fr = P.planFromText('article;quantite;prix\nTacos Indien;2;42,5\n', MENU, '2026-11-10');
  assert.equal(fr.days[0].lines[0].unitCents, 4250, '« 42,5 » is 42.50 MAD');
});

check('a paste from Excel without a date column uses the chosen day, or asks for one', () => {
  const tsv = 'article\tquantite\nTacos Indien\t5\nDouble Cheese\t2\n';
  const p = P.planFromText(tsv, MENU, '2026-11-10');
  deq(p.days.map((d) => d.day), ['2026-11-10']);
  assert.equal(P.totalCents(p.days), 5 * 4000 + 2 * 6500);
  const q = P.planFromText(tsv, MENU, '');
  assert.equal(q.days.length, 0);
  deq(q.issues.map((x) => x.why), ['noDate', 'noDate']);
  assert.equal(P.planFromText('foo;bar\n1;2', MENU, '').error, 'columns');
});

/* ───────── import d'une liste de stock ───────── */
function stockWorld(items) {
  const w = world();
  let part = null;
  w.window.KiwiStockInternal = { install: (name, factory) => { part = { name, factory }; } };
  vm.runInContext(read('assets/stock/import.js'), w.ctx);
  const counts = [], openings = [];
  w.window.KiwiInventory = { ensureOpening: (id, qty) => openings.push([id, qty]) };
  const S = {
    stUserItems: items.map((x) => ({ ...x })), stUserCategories: [], stPageActive: false,
    allCategories: () => [{ id: 'viandes', label: 'Viandes' }, { id: 'consommables', label: 'Consommables' }].concat(S.stUserCategories),
    catLabel: (id) => id, closeTopModal() {}, countStock: (it, qty, ref) => counts.push([it.id, qty, ref.split('-')[0]]),
    currentStockFor: (it) => S.stUserItems.find((x) => x.id === it.id)?.currentStock ?? it.currentStock,
    esc: (s) => String(s), fmtMad: (n) => n + ' MAD', getInv: () => S.stUserItems, getSup: () => [{ name: 'Nutrisla' }], lang: () => 'fr',
    render() {}, retailCatalog: () => null, stItemOverrides: {}, stOverlayScope: () => 'v', saved: 0, stSaveOverlay: () => { S.saved++; },
    stShowReal: () => true, stStockOverrides: {}, stockLocationId: () => 'principal',
    stockUnit: (u) => ({ kg: 'kg', kilo: 'kg', g: 'g', gramme: 'g', l: 'L', litre: 'L', unite: 'unité', 'unité': 'unité', piece: 'unité' })[String(u).toLowerCase()] || 'unité',
  };
  return { api: part.factory(S), S, counts, openings, name: part.name };
}

check('the stock import registers as a stock part', () => {
  assert.equal(stockWorld([]).name, 'import');
});

check('Jon\'s list: new items are created with cost, unit and quantity; an existing one is updated, never duplicated', () => {
  const { api, S, counts, openings } = stockWorld([{ id: 'usr-1', name: 'Blanc de Poulet', category: 'viandes', unit: 'kg', currentStock: 0, costPerUnit: 50, parLevel: 15, reorderLevel: 10 }]);
  const csv = 'Article;Unité;Catégorie;Fournisseur;Coût;Stock;Stock idéal;Seuil\n'
    + 'blanc de poulet;kg;Viandes;;53;12;;\n'
    + 'Tortilla;unité;Consommables;nutrisla;1,875;240;400;108\n'
    + 'Sauce Biggy;g;Sauces;;0,054;;3800;\n'
    + 'Tortilla;unité;;;;;;\n'
    + ';kg;;;;;;\n'
    + 'Cheddar;kg;;;douze;;;\n';
  const plan = api.analyse(csv);
  assert.ok(plan.ok);
  assert.equal(plan.rows.length, 3);
  deq(plan.newCats, ['Sauces']);
  assert.equal(plan.issues.length, 3, 'duplicate, empty name, unreadable number');
  const r = api.apply(plan);
  deq(r, { created: 2, updated: 1, cats: 1 });
  assert.equal(S.stUserItems.length, 3, 'no duplicate of the chicken');
  const chicken = S.stUserItems.find((x) => x.id === 'usr-1');
  assert.equal(chicken.costPerUnit, 53);
  assert.equal(chicken.currentStock, 12);
  deq(counts, [['usr-1', 12, 'import']], 'a changed quantity on an existing item is a count, like the edit form');
  const tortilla = S.stUserItems.find((x) => x.name === 'Tortilla');
  assert.equal(tortilla.costPerUnit, 1.875);
  assert.equal(tortilla.currentStock, 240);
  assert.equal(tortilla.supplier, 'Nutrisla', 'supplier matched to its saved spelling');
  assert.equal(tortilla.category, 'consommables');
  assert.equal(tortilla.status, 'ok');
  const sauce = S.stUserItems.find((x) => x.name === 'Sauce Biggy');
  assert.equal(sauce.currentStock, 0, 'no stock column: zero, to be counted in the physical count');
  assert.equal(sauce.costPerUnit, 0.054, '« 0,054 » is a decimal comma, not 54');
  assert.equal(sauce.reorderLevel, Math.round(3800 * 0.4), 'empty threshold follows the house rule');
  assert.match(sauce.category, /^usr-cat-sauces-/);
  assert.equal(S.stUserCategories[0].label, 'Sauces');
  deq(openings.map((o) => o[1]), [240, 0], 'opening balances in the real ledger');
  assert.equal(S.saved, 1, 'one overlay save');
});

check('the stock import refuses a file without an item column', () => {
  const { api } = stockWorld([]);
  assert.equal(api.analyse('prix;stock\n3;4\n').error, 'noCols');
  assert.equal(api.analyse('').error, 'empty');
});

console.log(`\n${checks} past sales and stock import checks passed`);
