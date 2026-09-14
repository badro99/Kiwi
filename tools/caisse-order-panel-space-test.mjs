import assert from 'node:assert/strict';
import fs from 'node:fs';

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const panel = caisse.split('<!-- --------- RIGHT BILL PANEL --------- -->')[1]
  ?.split('<!-- ============ FULL ORDER REVIEW MODAL ============ -->')[0];
assert.ok(panel, 'shared caisse order panel exists');
assert.match(panel, /<div class="rp-items" id="rp-items"><\/div>[\s\S]*?<div class="rp-total">/,
  'the item list runs straight into the total');
assert.doesNotMatch(panel, /Sous-total|Service \(0%\)|TVA comprise dans les prix|rp-subtotal/,
  'the panel does not spend space on the redundant breakdown');
for (const id of ['rp-total', 'rp-client', 'rp-add-items', 'rp-pay-normal', 'rp-pay-order']) {
  assert.match(panel, new RegExp(`id="${id}"`), `${id} remains available`);
}
assert.doesNotMatch(caisse, /\$\('#rp-subtotal'\)/, 'render paths no longer write to a removed node');
assert.match(caisse, /\.rp-items\s*\{[^}]*flex:\s*1;\s*overflow-y:\s*auto;/,
  'the recovered height goes to the scrollable item list');
assert.match(caisse, /\.rp-client\s*\{[^}]*min-height:\s*44px;/,
  'the tighter layout keeps a usable touch target');
console.log('✓ caisse order panel has more room for items without changing payment controls');
