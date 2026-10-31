/* Étiquettes après une réception : seulement les nouvelles pièces.
 * Santos, 31/10 : un article épuisé reçoit +50, la fiche est fermée puis
 * rouverte, et « Imprimer » sortait 100 étiquettes (l'ancien stock + le
 * nouveau). La réception est maintenant gardée par article (lastReceipt),
 * au-delà de la fiche, et le bouton de la ligne d'inventaire la suit aussi. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } };

const Z = await import(pathToFileURL(path.join(root, 'assets/boutique-sizes.js')).href);

ok('a receipt survives closing the sheet (kept outside mount, and on disk)', () => {
  Z.noteReceipt('p1', { v1: 30, v2: 20 });
  assert.deepEqual(Z.lastReceipt('p1').got, { v1: 30, v2: 20 });
  assert.ok(mem['kiwiLabelReceipt:p1'], 'stored for a reload');
});
ok('two receipts before printing add up', () => {
  Z.noteReceipt('p1', { v1: 5 });
  assert.deepEqual(Z.lastReceipt('p1').got, { v1: 35, v2: 20 });
});
ok('after printing, the next receipt starts from zero', () => {
  Z.markReceiptPrinted('p1');
  assert.equal(Z.lastReceipt('p1').printed, true);
  Z.noteReceipt('p1', { v2: 50 });
  assert.deepEqual(Z.lastReceipt('p1').got, { v2: 50 });
  assert.equal(Z.lastReceipt('p1').printed, false);
});
ok('another article is untouched', () => { assert.equal(Z.lastReceipt('p2'), null); });

const V = [{ id: 'v1', stock: 80 }, { id: 'v2', stock: 20.7 }, { id: 'v3', stock: -2 }];
const count = (got) => Z.labelCounts(V, got).map(([v, n]) => v.id + ':' + n).join(' ');
ok('with a receipt, labels follow the pieces received, not the stock', () => {
  assert.equal(count({ v1: 50 }), 'v1:50 v2:0 v3:0');
});
ok('without a receipt (or "whole stock"), each size prints its stock, never a negative or a fraction', () => {
  assert.equal(count(null), 'v1:80 v2:20 v3:0');
});
ok('the sheet and the inventory row count with that one rule', () => {
  const src = fs.readFileSync(path.join(root, 'assets/boutique-sizes.js'), 'utf8');
  const inv = fs.readFileSync(path.join(root, 'assets/pos-boutique/inventory.js'), 'utf8');
  assert.match(src, /labelCounts\(d\.variants, rec && rec\.got\)/);
  assert.match(inv, /SZ\.labelCounts\(d\.variants, fresh\)/);
});
ok('the count on the button is set apart, and a receipt says "new pieces"', () => {
  const t = Z.words('fr');
  assert.equal(Z.printLabelHtml(t, 50, true), 'Imprimer <b class="kbs-n">50</b> étiquettes · nouvelles pièces');
  assert.equal(Z.printLabelHtml(t, 1, false), 'Imprimer <b class="kbs-n">1</b> étiquette');
  assert.equal(Z.printLabelHtml(t, 0, false), t.print(0));
});
ok('the last receipt and the whole stock are named in every language', () => {
  assert.equal(Z.words('fr').lastIn(50), 'Dernière réception : +50 pièces');
  assert.equal(Z.words('en').printAll(130), 'Whole stock · 130');
  assert.ok(Z.words('ar').lastIn(3).includes('3'));
});
ok('no em dash in the new words', () => {
  for (const lang of ['fr', 'en', 'ar']) {
    const t = Z.words(lang);
    const said = [t.printN(1).join(' '), t.printN(5).join(' '), t.fresh, t.printAll(9), t.lastIn(1), t.lastIn(9)].join(' ');
    assert.doesNotMatch(said, /—/, lang);
  }
});
ok('the inventory row prints an unprinted receipt only, then marks it printed', () => {
  const inv = fs.readFileSync(path.join(root, 'assets/pos-boutique/inventory.js'), 'utf8');
  assert.match(inv, /const fresh = rec && !rec\.printed \? rec\.got : null/);
  assert.match(inv, /SZ\.markReceiptPrinted\(pid\)/);
});
console.log(`\nboutique-label-receipt: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
