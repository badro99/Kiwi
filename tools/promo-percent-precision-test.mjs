#!/usr/bin/env node
/* promo-percent-precision-test · wave 12, lane G (promos#1).
 *
 * normalize() rounded a percentage to a whole number (12.5 % became 13 %),
 * against the wave Q centime-precision ruling: a promotion keeps the value the
 * merchant configured. Checked on every surface that holds a copy of the rule:
 * the server module, the boutique engine, the menu engine and the menu schema. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as pricing from '../functions/api/_rules-promotion-pricing.js';
import { sanitizeMenu } from '../functions/api/menu.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let n = 0;
const ok = (label, f) => { f(); n++; console.log('  ✓ ' + label); };

const window = {}, localStorage = { getItem: () => null };
const ctx = vm.createContext({ window, localStorage, console });
for (const f of ['assets/kit/haptics.js', 'assets/promo-rules.js', 'assets/promos.js', 'assets/menu-promos.js']) vm.runInContext(read(f), ctx);

ok('server rule keeps 12.5 % and clamps at 100', () => {
  assert.equal(pricing.normalize({ kind: 'percent', value: 12.5 }).value, 12.5);
  assert.equal(pricing.normalize({ kind: 'percent', value: '7,5'.replace(',', '.') }).value, 7.5);
  assert.equal(pricing.normalize({ kind: 'percent', value: 12.345 }).value, 12.35, 'two decimals, like every amount');
  assert.equal(pricing.normalize({ kind: 'percent', value: 130 }).value, 100);
  assert.equal(pricing.normalize({ kind: 'percent', value: 15 }).value, 15, 'a whole percentage stays whole');
});
ok('boutique engine keeps the configured percentage', () => {
  const p = window.KiwiPromos.normalize({ id: 'p', name: 'Solde', kind: 'percent', value: 12.5, all: true });
  assert.equal(p.value, 12.5);
  assert.equal(window.KiwiPromos.applyTo(p, 99), 86.63, '99 MAD at -12.5 % is 86.63, not 86.13 (13 %)');
});
ok('menu engine keeps it, and so does the server schema', () => {
  const [m] = window.KiwiMenuPromos.sanitize([{ id: 'p', name: 'Happy', kind: 'percent', value: 12.5, all: true }]);
  assert.equal(m.value, 12.5);
  const menu = sanitizeMenu({ cats: [{ id: 'c', name: 'Cat' }], items: [{ id: 'i', name: 'Item', price: 40, catId: 'c' }],
    promos: [{ id: 'p', name: 'Happy', kind: 'percent', value: 12.5, all: true }] });
  assert.equal(menu.promos[0].value, 12.5);
  const hit = window.KiwiMenuPromos.resolve(menu.promos, { itemId: 'i', catId: 'c' }, 40, Date.UTC(2026, 9, 26, 12));
  assert.equal(hit.price, 35, '40 MAD at -12.5 % is 35');
});
ok('the dashboards let the merchant type a decimal percentage', () => {
  const b = read('assets/boutique-promos-dashboard.js'), m = read('assets/menu-promos-dashboard.js');
  assert.ok(/id="bpd-value"[^>]*step="any"/.test(b), 'boutique value input accepts decimals');
  assert.ok(!/Math\.round\(\+val\.value \|\| 0\)/.test(b), 'boutique entry no longer rounds to whole MAD or %');
  assert.ok(/'percent' \? 'any'/.test(m), 'menu percentage input accepts decimals');
});
console.log(`PASS promotion percentage precision (${n} checks)`);
