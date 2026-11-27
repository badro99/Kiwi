/* Bons et reçus imprimés · une seule graisse, peu de tailles, chacune son rôle.
 *
 * Browse, 19 nov. 2026 (photo d'un bon « Le Gourmand ») : gras et maigre,
 * grand et petit mélangés sur le même papier. Le propriétaire veut un papier
 * « parfaitement homogène ». La règle tenue ici, octet par octet :
 *  - tout est imprimé en gras (ESC E 1), et le gras ne s'éteint jamais ;
 *  - bon de cuisine : grand (poste, table, plat), double hauteur pour le
 *    détail d'un plat (choix, options, notes : Jon's Burgers, 26 nov.) et
 *    normal (heure, « À suivre »), chaque détail commençant par le même « > » ;
 *  - reçu client : enseigne en grand, TOTAL en double hauteur, le reste normal.
 *   node tools/print-type-uniform-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; } };
const window = { document };
const ctx = vm.createContext({ window, document, console, Date, Promise, Uint8Array,
  localStorage: { length: 0, getItem() { return null; }, setItem() {}, key() { return null; }, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} }, setTimeout() { return 0; }, clearTimeout() {} });
vm.runInContext(read('assets/escpos.js'), ctx);
vm.runInContext(read('assets/receipt.js'), ctx);
const E = window.KiwiEscPos, R = window.KiwiReceipt;

/* Every ESC E n (bold) and GS ! n (size) in print order. */
function styles(bytes) {
  const b = Buffer.from(bytes), bold = [], size = [];
  for (let i = 0; i + 2 < b.length; i++) {
    if (b[i] === 0x1b && b[i + 1] === 0x45) bold.push(b[i + 2]);
    if (b[i] === 0x1d && b[i + 1] === 0x21) size.push(b[i + 2]);
  }
  return { bold, size, text: b.toString('latin1') };
}
let passed = 0;
const ok = (label, run) => { run(); passed++; console.log('  ✓ ' + label); };

const kitchen = styles(E.kitchenTicket({ title: 'COMPTOIR', table: 'Table 1', order: '#1', time: '18:29', paper: '80',
  items: [
    { qty: 1, name: 'Le Gourmand', note: 'sans jambon', formulaChoices: [{ name: 'Granola & Fruit', note: '' },
      { name: 'Orange Juice', note: '' }, { name: 'Espresso', note: 'Hot' }] },
    { qty: 2, name: 'Harira', note: 'bien chaude' },
  ],
  following: [{ qty: 1, name: 'Pancakes' }] }));

ok('kitchen ticket: bold from the first line to the cut, never switched off', () => {
  assert.ok(kitchen.bold.length > 0);
  assert.deepEqual([...new Set(kitchen.bold)], [1]);
});
/* Jon's Burgers, 26 nov. 2026 (f95fad8eb) : options, choix et notes sous un plat en
   double hauteur, pour que la cuisine les lise. Trois tailles, chacune son rôle :
   grand (poste, table, plat), double hauteur (le détail d'un plat), normal (le reste). */
ok('kitchen ticket: three sizes, each with its role: big, double height, normal', () => {
  assert.deepEqual([...new Set(kitchen.size)].sort((a, b) => a - b), [0x00, 0x01, 0x11]);
});
ok('kitchen ticket: every detail under a dish is in double height, and size goes back to normal after it', () => {
  const b = Buffer.from(E.kitchenTicket({ paper: '80', title: 'C', items: [{ qty: 1, name: 'Burger', note: 'sans oignon' }], following: [{ qty: 1, name: 'Frites' }] }));
  const txt = b.toString('latin1'), at = txt.indexOf('> sans oignon');
  const sizeBefore = (i) => { for (let j = i; j >= 0; j--) if (b[j] === 0x1d && b[j + 1] === 0x21) return b[j + 2]; return null; };
  assert.equal(sizeBefore(at), 0x01);
  assert.equal(sizeBefore(txt.indexOf('Frites')) === 0x01, false);
});
ok('kitchen ticket: every detail under a dish starts with the same « > », flush left', () => {
  for (const s of ['> Granola & Fruit', '> Orange Juice', '> Espresso · Hot', '> sans jambon', '> bien chaude']) {
    assert.ok(kitchen.text.includes('\n' + s) || kitchen.text.includes(s), s);
    assert.ok(!kitchen.text.includes('   ' + s), s + ' is not indented differently');
  }
});

const doc = R.build({ ref: 'TEST-1', ts: Date.now(), total: 140, method: 'cash', discount: 10,
  lines: [{ name: 'Le Gourmand', qty: 1, total: 109, note: 'sans jambon' }, { name: 'Mango tango', qty: 1, total: 41 }] },
  { config: R.blankConfig(), business: { name: 'Browse', legal: {} } });
const receipt = styles(R.escpos(doc, {}));

ok('customer receipt: bold everywhere, never switched off', () => {
  assert.ok(receipt.bold.length > 0);
  assert.deepEqual([...new Set(receipt.bold)], [1]);
});
ok('customer receipt: shop name big, total double height, the rest normal', () => {
  assert.deepEqual([...new Set(receipt.size)].sort(), [0x00, 0x01, 0x11]);
  assert.ok(receipt.text.includes('Browse'));
});

const simple = styles(E.receipt({ shop: 'Browse', lines: [{ qty: 1, name: 'Mango tango', price: '38.00' }], total: '38.00', method: 'Espèces', copy: 'DUPLICATA' }));
ok('quick receipt (printer bridge): same rule', () => {
  assert.deepEqual([...new Set(simple.bold)], [1]);
  assert.deepEqual([...new Set(simple.size)].sort(), [0x00, 0x01, 0x11]);
});

/* Browse, 19 nov. 2026 : « Le Gourmand » a des choix de formule ET une option
   sur la formule elle-même (« Granola & Fruit »). L'option sortait en note,
   double hauteur. Elle est un choix comme les autres ; la note libre du serveur
   reste une ligne de détail, après les choix. */
/* kitchen-paper.js is the till's own formatter, proven byte-identical to
   caisse-kitchen.js by caisse-kitchen-split-test. */
vm.runInContext(read('assets/caisse-kitchen/kitchen-paper.js'), ctx);
const kitchenPaperItems = ctx.kitchenPaperItems;
const gourmand = kitchenPaperItems([
  { q: 1, n: 'Le Gourmand', kind: 'formula', formulaUid: 'f-g', formulaName: 'Le Gourmand', note: 'sans jambon',
    paperNote: 'Granola & Fruit · sans jambon', visuals: [{ emoji: '', name: 'Granola & Fruit' }], stations: ['bar'] },
  { q: 1, n: 'Orange Juice', kind: 'formula-part', formulaUid: 'f-g', formulaName: 'Le Gourmand', paperNote: '[Le Gourmand · Jus]', stations: ['bar'] },
  { q: 1, n: 'Espresso', kind: 'formula-part', formulaUid: 'f-g', formulaName: 'Le Gourmand', paperNote: '[Le Gourmand · Boisson] · Hot', stations: ['bar'] },
], 'bar', 'kitchen');
ok("a formula's own option is one more choice; the free note stays a note", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(gourmand)), [{ qty: 1, name: 'Le Gourmand', note: 'sans jambon', formulaChoices: [
    { name: 'Granola & Fruit', note: '' }, { name: 'Orange Juice', note: '' }, { name: 'Espresso', note: 'Hot' },
  ] }]);
});
/* Where a line lands on the printed ticket, and at which ESC/POS size. */
function printed(items) {
  const bytes = Buffer.from(E.kitchenTicket({ title: 'COMPTOIR', order: '#1', paper: '80', items }));
  const text = bytes.toString('latin1');
  return (needle) => {
    const where = text.indexOf(needle);
    let size = -1;
    for (let i = where; i > 1; i--) if (bytes[i - 2] === 0x1d && bytes[i - 1] === 0x21) { size = bytes[i]; break; }
    return { where, size };
  };
}
ok('Le Gourmand prints dish big, then option, choices and note at one double-height size', () => {
  const ticket = printed(gourmand), dish = ticket('1× Le Gourmand'), granola = ticket('> Granola & Fruit'),
    juice = ticket('> Orange Juice'), espresso = ticket('> Espresso · Hot'), note = ticket('> sans jambon');
  assert.equal(dish.size, 0x11);
  assert.ok(dish.where < granola.where && granola.where < juice.where && juice.where < espresso.where && espresso.where < note.where);
  assert.deepEqual([granola.size, juice.size, espresso.size, note.size], [1, 1, 1, 1]);
});

console.log(`print-type-uniform: ${passed} passed`);
