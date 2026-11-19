/* Application serveur · le « − » d'une carte du menu retire une formule ENTIÈRE.
 *
 * Browse, 19 nov. 2026 : « les formules s'annulaient, mais les extras restaient,
 * gratuits ». changeMenuQty baissait la formule seule : 2× Le Gourmand → 1×,
 * mais ses boissons et son dessert (lignes à 0 MAD, liées par formulaUid)
 * restaient à 2. Une formule de moins sur l'addition, une boisson et un
 * dessert offerts en cuisine. Et le « − » d'« Espresso » pouvait retirer
 * l'espresso compris dans une formule au lieu d'un espresso vendu seul.
 *
 * Le code testé est celui que charge kiwi-serveur.html.
 *   node tools/serveur-formula-minus-test.mjs
 */
import serveurTestSource from './serveur-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = serveurTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8'));
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name + ' exists');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(name + ' unclosed');
}
const make = new Function('tableOrders', `
  const itemHasFormula = () => false, itemHasOptions = () => false;
  const openFormulaSheet = () => {}, openOptionsSheet = () => {}, addToTableOrder = () => {};
  const markDirty = () => {}, renderMenu = () => {}, renderCartBar = () => {};
  ${fn('applyGroupedLineQtyDelta')}
  ${fn('changeMenuQty')}
  return changeMenuQty;`);

const gourmand = (qty) => [
  { uid: 'ln1', id: 'it_35', name: 'Le Gourmand', qty, unitPrice: 109, kind: 'formula', formulaUid: 'f-1' },
  { uid: 'ln2', id: 'it_70', name: 'Orange Juice', qty, unitPrice: 0, kind: 'formula-part', formulaUid: 'f-1' },
  { uid: 'ln3', id: 'it_80', name: 'Espresso', qty, unitPrice: 0, kind: 'formula-part', formulaUid: 'f-1' },
  { uid: 'ln4', id: 'it_90', name: 'San Sebastien', qty, unitPrice: 0, kind: 'formula-part', formulaUid: 'f-1' },
];
let passed = 0;
const ok = (label, run) => { run(); passed++; console.log('  ✓ ' + label); };
const shape = (lines) => lines.map(l => l.name + '×' + l.qty);

ok('2× formula, −1: the formula AND its included items go to 1', () => {
  const orders = { t1: gourmand(2) };
  make(orders)('t1', 'it_35', -1);
  assert.deepEqual(shape(orders.t1), ['Le Gourmand×1', 'Orange Juice×1', 'Espresso×1', 'San Sebastien×1']);
});

ok('1× formula, −1: nothing of it stays on the bill', () => {
  const orders = { t1: gourmand(1).concat([{ uid: 'ln9', id: 'it_5', name: 'Mango tango', qty: 1, unitPrice: 38 }]) };
  make(orders)('t1', 'it_35', -1);
  assert.deepEqual(shape(orders.t1), ['Mango tango×1']);
});

ok('− on « Espresso » removes the espresso sold alone, never the one inside a formula', () => {
  const orders = { t1: gourmand(1).concat([{ uid: 'ln8', id: 'it_80', name: 'Espresso', qty: 2, unitPrice: 15 }]) };
  make(orders)('t1', 'it_80', -1);
  assert.deepEqual(shape(orders.t1), ['Le Gourmand×1', 'Orange Juice×1', 'Espresso×1', 'San Sebastien×1', 'Espresso×1']);
  assert.equal(orders.t1[4].unitPrice, 15);
});

ok('− on an item that is only inside a formula does nothing', () => {
  const orders = { t1: gourmand(1) };
  make(orders)('t1', 'it_90', -1);
  assert.deepEqual(shape(orders.t1), ['Le Gourmand×1', 'Orange Juice×1', 'Espresso×1', 'San Sebastien×1']);
});

console.log(`serveur-formula-minus: ${passed} passed`);
