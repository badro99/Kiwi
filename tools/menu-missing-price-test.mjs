// Import de carte (r19) : un prix absent ou illisible ne devient jamais un plat
// à 0 MAD. Route : price null. Import : article neuf sans prix non créé ;
// un 0 explicite reste valable.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const { validateMenuItems } = await import('../functions/api/ai/menu-import.js');
const v = validateMenuItems({ items: [
  { name: 'Sans prix' }, { name: 'Null', price: null }, { name: 'Vide', price: '  ' }, { name: 'Texte', price: 'abc' },
  { name: 'Négatif', price: -3 }, { name: 'Zéro', price: 0 }, { name: 'Chaîne', price: '12.5' },
] }).items;
assert.deepEqual(v.map((i) => i.price), [null, null, null, null, null, 0, 12.5]);

const doc = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), head: { appendChild() {} }, addEventListener() {}, documentElement: { appendChild() {} } };
const win = { document: doc, addEventListener() {}, Kiwi: {}, KiwiMenuStore: { categories: () => [], items: () => [] } }; win.window = win;
vm.runInContext(read('assets/catalog-import.js'), vm.createContext({ window: win, document: doc, console, setTimeout, FileReader: function () {}, Intl }));
const K = win.KiwiCatalogImport;
// Le CSV que produit le scan : prix null => case vide.
const reader = {};
const rdWin = { document: doc, addEventListener() {}, Kiwi: {} }; rdWin.window = rdWin;
vm.runInContext(read('assets/menu-scan-reader.js'), vm.createContext({ window: rdWin, document: doc, console, URL, Image: function () {}, setTimeout }));
const csv = rdWin.KiwiMenuScanReader.toCsvText(v.slice(0, 1).concat(v.slice(5)));
const plan = K.analyseMenu(K.parse(csv));
assert.equal(plan.rows.length, 2, 'only the two items with a price are importable');
assert.deepEqual(Array.from(plan.rows, (r) => r.name + ':' + r.price), ['Zéro:0', 'Chaîne:12.5']);
assert.ok(plan.issues.some((i) => i.level === 'skip' && /prix manquant/.test(i.msg)), 'the missing price is reported, not hidden');
console.log('✓ menu import: missing price is never a 0 MAD dish');
