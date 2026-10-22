#!/usr/bin/env node
/* menu promotions · the server side. The published menu keeps its
 * promotions, and priceOrder (the canonical pricer behind the customer QR,
 * the waiter app and the till's kitchen tickets) applies them with the
 * server's clock. A device cannot set a price or a promotion.
 *   node tools/menu-promos-server-test.mjs
 */
import assert from 'node:assert/strict';
import { priceOrder } from '../functions/api/order/_lib.js';
import { sanitizeMenu } from '../functions/api/menu.js';

let passed = 0, failed = 0;
const ok = async (label, fn) => { try { await fn(); passed++; console.log('  ✓ ' + label); } catch (e) { failed++; console.log('  ✗ ' + label + '\n      ' + String(e.message).split('\n')[0]); } };

/* Casablanca has been on UTC+0 all year since 20 September 2026. */
const at = (d, h, mi = 0) => Date.UTC(2026, 9, d, h, mi);
const THU_18 = at(15, 18), THU_20 = at(15, 20);

const RAW = {
  cats: [{ id: 'boissons', name: 'Boissons' }, { id: 'tajines', name: 'Tajines' }],
  opts: [{ id: 'sirop', name: 'Sirop', kind: 'one', choices: [{ id: 'menthe', name: 'Menthe', price: 5 }] }],
  items: [
    { id: 'the', name: 'Thé à la menthe', price: 30, catId: 'boissons', opts: ['sirop'] },
    { id: 'jus', name: 'Jus d\'orange', price: 45, catId: 'boissons' },
    { id: 'kefta', name: 'Tajine kefta', price: 180, catId: 'tajines' },
    { id: 'menu', name: 'Menu midi', price: 120, catId: 'tajines',
      formula: { slots: [{ id: 's1', label: 'Boisson', min: 1, max: 1, choices: [{ itemId: 'the', extra: 0 }] }] } },
  ],
  promos: [{ id: 'hh', name: 'Happy hour', kind: 'percent', value: 20, cats: ['boissons'],
    days: [1, 2, 3, 4], start: '17:00', end: '19:00', createdAt: 1 }],
};
const published = sanitizeMenu(RAW);
const envFor = (menu) => {
  const data = JSON.stringify(menu);
  return { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ data, updated_ts: 1 }) }) }) } };
};
const env = envFor(published);
const without = envFor(sanitizeMenu({ ...RAW, promos: [] }));

console.log('■ menu promotions · published menu');
await ok('sanitizeMenu keeps the promotions, typed', () => {
  assert.equal(published.promos.length, 1);
  assert.deepEqual([published.promos[0].cats, published.promos[0].start, published.promos[0].days], [['boissons'], '17:00', [1, 2, 3, 4]]);
});
await ok('a menu without promotions has no promos key at all: its shape is unchanged', () => {
  assert.equal('promos' in sanitizeMenu({ ...RAW, promos: [] }), false);
  assert.equal('promos' in sanitizeMenu({ cats: RAW.cats, items: RAW.items }), false);
});
await ok('re-saving the published menu (the availability toggle does) keeps them', () => {
  assert.deepEqual(sanitizeMenu(JSON.parse(JSON.stringify(published))).promos, published.promos);
});

console.log('■ menu promotions · priceOrder');
await ok('inside the window: drinks at -20 %, stamped; the tajine at full price', async () => {
  const r = await priceOrder(env, 'm', [{ id: 'the', qty: 2 }, { id: 'jus', qty: 1 }, { id: 'kefta', qty: 1 }], { now: THU_18 });
  const by = Object.fromEntries(r.lines.map((l) => [l.id, l]));
  assert.equal(by.the.unitPrice, 24);
  assert.deepEqual(by.the.promo, { id: 'hh', name: 'Happy hour', badge: '−20 %', before: 30 });
  assert.equal(by.jus.unitPrice, 36);
  assert.equal(by.kefta.unitPrice, 180);
  assert.equal('promo' in by.kefta, false);
  assert.equal(r.total, 24 * 2 + 36 + 180);
});
await ok('options are part of the discounted unit price (30 + 5 syrup, -20 % = 28)', async () => {
  const r = await priceOrder(env, 'm', [{ id: 'the', qty: 1, optionChoices: [{ group: 'sirop', choiceId: 'menthe' }] }], { now: THU_18 });
  assert.deepEqual([r.lines[0].unitPrice, r.lines[0].promo.before], [28, 35]);
});
await ok('outside the window (20:00, or a Friday): full price, no stamp', async () => {
  for (const now of [THU_20, at(16, 18)]) {
    const r = await priceOrder(env, 'm', [{ id: 'the', qty: 1 }], { now });
    assert.deepEqual([r.lines[0].unitPrice, 'promo' in r.lines[0]], [30, false]);
  }
});
await ok('a composed menu and its included drink are not discounted', async () => {
  const uid = 'fml-x';
  const r = await priceOrder(env, 'm', [
    { id: 'menu', qty: 1, kind: 'formula', formulaUid: uid },
    { id: 'the', qty: 1, kind: 'formula-part', formulaUid: uid, formulaSlotId: 's1' },
  ], { now: THU_18 });
  assert.deepEqual(r.lines.map((l) => [l.id, l.unitPrice, 'promo' in l]), [['menu', 120, false], ['the', 0, false]]);
});
await ok('a device cannot set its own price or promotion', async () => {
  const r = await priceOrder(env, 'm', [{ id: 'kefta', qty: 1, unitPrice: 1, price: 1, promo: { id: 'hh', before: 180 } }], { now: THU_18 });
  assert.deepEqual([r.lines[0].unitPrice, 'promo' in r.lines[0]], [180, false]);
});
await ok('no promotions: every line priced exactly as before, at any hour', async () => {
  const lines = [{ id: 'the', qty: 2 }, { id: 'jus', qty: 1 }, { id: 'kefta', qty: 1 }];
  const a = await priceOrder(without, 'm', lines, { now: THU_18 });
  const b = await priceOrder(without, 'm', lines);
  assert.deepEqual(a.lines.map((l) => l.unitPrice), [30, 45, 180]);
  assert.deepEqual(a.lines, b.lines);
  assert.ok(a.lines.every((l) => !('promo' in l)));
});
await ok('the server reads the legal clock: 16:30 is before a 17:00 happy hour, 18:59 is inside, whatever the runtime\'s time zone data', async () => {
  for (const [now, inside] of [[at(15, 16, 30), false], [at(15, 16, 59), false], [at(15, 18, 59), true], [at(15, 19, 0), false]]) {
    const r = await priceOrder(env, 'm', [{ id: 'the', qty: 1 }], { now });
    assert.equal('promo' in r.lines[0], inside, new Date(now).toISOString());
  }
});
await ok('a promotion naming a deleted category drops out on read', async () => {
  const stale = envFor({ ...published, promos: [{ ...published.promos[0], cats: ['gone'] }] });
  const r = await priceOrder(stale, 'm', [{ id: 'the', qty: 1 }], { now: THU_18 });
  assert.equal(r.lines[0].unitPrice, 30);
});

console.log(`\nmenu-promos-server: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
