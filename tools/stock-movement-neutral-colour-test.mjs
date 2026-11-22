#!/usr/bin/env node
/* Stock history · a product created without a colour does not read « Gris ».
 *
 * 2026-11-22. The sizes screen (boutique-sizes.js) creates colourless products
 * on the neutral colour « unique », whose stored label is « Gris ». The till
 * and the labels hide it; the stock history wrote « TU · Gris » (Elham Brand).
 *   node tools/stock-movement-neutral-colour-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mov = readFileSync(path.join(ROOT, 'assets/maison-stock-movements.js'), 'utf8');
const sizes = readFileSync(path.join(ROOT, 'assets/boutique-sizes.js'), 'utf8');
const start = mov.indexOf('function variantLabel(v) {');
const body = mov.slice(start, mov.indexOf('\n  }', start) + 4);
const variantLabel = new Function(`${body}; return variantLabel;`)();

let failed = 0;
function ok(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
console.log('stock history · variant label');
ok('the neutral colour is the one the sizes screen creates', () => {
  assert.match(sizes, /export const ONE_COLOR = 'unique';/);
});
ok('a colourless one-size product reads « TU », not « TU · Gris »', () => {
  assert.equal(variantLabel({ size: 'TU', colorId: 'unique', colorLabel: 'Gris' }), 'TU');
});
ok('a colourless sized product reads its size alone', () => {
  assert.equal(variantLabel({ size: 'M', colorId: 'unique', colorLabel: 'Gris' }), 'M');
});
ok('a real colour is still written, a real grey included', () => {
  assert.equal(variantLabel({ size: 'M', colorId: 'noir', colorLabel: 'Noir' }), 'M · Noir');
  assert.equal(variantLabel({ size: 'TU', colorId: 'gris', colorLabel: 'Gris' }), 'TU · Gris');
  assert.equal(variantLabel({ size: 'TU', colorId: 'custom-e56ea0', colorLabel: '05 Fuchsia' }), 'TU · 05 Fuchsia');
});
ok('no variant, no label', () => { assert.equal(variantLabel(null), ''); });
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
