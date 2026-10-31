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

const src = fs.readFileSync(path.join(root, 'assets/boutique-sizes.js'), 'utf8');
ok('the sheet prints from lastReceipt, not a per-mount variable', () => {
  assert.doesNotMatch(src, /let last = null/);
  assert.match(src, /const rec = all \? null : lastReceipt\(pid\)/);
  assert.match(src, /noteReceipt\(pid, got\)/);
});
ok('the count on the button is set apart, and the whole stock stays one tap away', () => {
  assert.match(src, /<b class="kbs-n">\$\{n\}<\/b>/);
  assert.match(src, /data-kbs-print-all/);
  assert.match(src, /lastIn: \(n\) => `Dernière réception/);
});
const inv = fs.readFileSync(path.join(root, 'assets/pos-boutique/inventory.js'), 'utf8');
ok('the inventory row printer prints an unprinted receipt only', () => {
  assert.match(inv, /SZ\.lastReceipt\(pid\)/);
  assert.match(inv, /SZ\.markReceiptPrinted\(pid\)/);
  assert.doesNotMatch(inv, /Imprimer toutes les étiquettes/);
});
ok('no em dash in the new words', () => {
  const words = src.slice(src.indexOf('printN:'), src.indexOf('printN:') + 400);
  assert.doesNotMatch(words, /—/);
});
console.log(`\nboutique-label-receipt: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
