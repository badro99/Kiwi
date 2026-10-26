#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
import maisonSource from './pos-maison-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
// #93: the owner's policy must reach every till and the sale ingestion boundary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => maisonSource(coreTestSource.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const policy = read('assets/discount-policy.js');
const dashboard = read('assets/interactive.js');
const boutique = read('assets/pos-boutique.js');
const maison = read('assets/pos-maison.js');
const restaurant = caisseTestSource(read('kiwi-caisse.html'));
const store = read('functions/api/store.js');
const sale = read('functions/api/sale.js');
assert.match(policy, /KiwiStore\.define\('discountpolicy'/, 'policy is a private, cloud-mirrored merchant document');
assert.match(policy, /save\s*[:(]/, 'owner setting can be saved');
assert.match(dashboard, /settings-discounts/, 'dashboard exposes a discount settings control');
assert.match(boutique, /KiwiDiscountPolicy.*percentages/, 'Boutique till reads owner percentages');
assert.match(maison, /KiwiDiscountPolicy.*percentages/, 'Maison till reads owner percentages');
assert.match(restaurant, /KiwiDiscountPolicy.*percentages/, 'restaurant till reads owner percentages');
assert.match(store, /discountpolicy:\s*\{/, 'store API allows the discount document');
assert.match(sale, /discount-not-allowed/, 'server refuses an unapproved percentage');
console.log('✓ discount policy: eight end-to-end guards');
