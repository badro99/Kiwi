#!/usr/bin/env node
/* menu promotions · the rule (assets/menu-promos.js), without a browser.
 *   node tools/menu-promos-test.mjs
 * The same file prices the till, the waiter app and the server's canonical
 * ticket, so what it decides here is what a customer pays everywhere. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Every runtime that ships the rule hands it the zone law first (the kit in
   the browser, order/_lib.js on the server). Without it the answer would depend
   on this node's own time zone data. */
const law = await import(pathToFileURL(path.join(root, 'functions/api/_zone-law.js')).href);
globalThis.KiwiZoneLaw = { ZONE_LAWS: law.ZONE_LAWS, effectiveZone: law.effectiveZone, DateTimeFormat: law.DateTimeFormat };
await import(pathToFileURL(path.join(root, 'assets/menu-promos.js')).href);
const P = globalThis.KiwiMenuPromos;

let passed = 0, failed = 0;
const ok = (label, fn) => { try { fn(); passed++; console.log('  ✓ ' + label); } catch (e) { failed++; console.log('  ✗ ' + label + '\n      ' + String(e.message).split('\n')[0]); } };

/* Casablanca has been on UTC+0 all year since 20 September 2026; every
   instant below is in October 2026. */
const at = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi);
const FRI_18 = at(2026, 10, 16, 18, 0);      /* Friday 16 October, 18:00 */

const MENU = {
  cats: [{ id: 'boissons' }, { id: 'tajines' }],
  items: [{ id: 'the', catId: 'boissons' }, { id: 'jus', catId: 'boissons' }, { id: 'kefta', catId: 'tajines' }, { id: 'brunch', catId: 'tajines' }],
};
const happy = (extra) => P.sanitize([{ id: 'hh', name: 'Happy hour', kind: 'percent', value: 20, cats: ['boissons'], createdAt: 1, ...extra }], MENU)[0];
const drink = { itemId: 'the', catId: 'boissons' };

console.log('■ menu promotions · sanitize');
ok('a well-formed promotion survives, typed and bounded', () => {
  const p = happy({ days: [1, 2, 3, 4], start: '17:00', end: '19:00', from: '2026-10-01', to: '2026-12-31' });
  assert.deepEqual(p, { id: 'hh', name: 'Happy hour', kind: 'percent', value: 20, all: false, cats: ['boissons'], items: [], from: '2026-10-01', to: '2026-12-31', days: [1, 2, 3, 4], start: '17:00', end: '19:00', paused: false, createdAt: 1 });
});
ok('unknown categories and items are dropped, and a promotion that targets nothing goes', () => {
  const out = P.sanitize([{ id: 'a', name: 'A', value: 10, cats: ['nope'] }, { id: 'b', name: 'B', value: 10, cats: ['boissons', 'nope'], items: ['ghost', 'kefta'] }], MENU);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].cats, out[0].items], [['boissons'], ['kefta']]);
});
ok('no id, no name, a duplicate id or a zero discount is refused; percent is capped at 100', () => {
  const out = P.sanitize([{ name: 'x', value: 5, all: true }, { id: 'n', value: 5, all: true }, { id: 'z', name: 'Z', value: 0, all: true },
    { id: 'c', name: 'C', value: 250, all: true }, { id: 'c', name: 'C2', value: 5, all: true }], MENU);
  assert.deepEqual(out.map((p) => [p.id, p.value]), [['c', 100]]);
});
ok('all seven days means every day; a half-set or empty window means all day', () => {
  const p = happy({ days: [0, 1, 2, 3, 4, 5, 6], start: '17:00' });
  assert.deepEqual([p.days, p.start, p.end], [[], '', '']);
  assert.deepEqual(happy({ start: '17:00', end: '17:00' }).start, '');
});

console.log('■ menu promotions · price');
ok('-20 % on drinks: a 30 MAD tea is 24 MAD, a tajine is untouched', () => {
  const p = [happy()];
  assert.deepEqual(P.resolve(p, drink, 30, FRI_18), { price: 24, promo: { id: 'hh', name: 'Happy hour', badge: '−20 %', before: 30 } });
  assert.equal(P.resolve(p, { itemId: 'kefta', catId: 'tajines' }, 180, FRI_18), null);
});
ok('centimes are kept: -15 % on 45 MAD is 38,25, not 38', () => {
  assert.equal(P.resolve([happy({ value: 15 })], drink, 45, FRI_18).price, 38.25);
});
ok('amount off never goes below zero; a fixed price never raises a cheaper item', () => {
  const amount = P.sanitize([{ id: 'a', name: 'A', kind: 'amount', value: 50, cats: ['boissons'] }], MENU);
  assert.equal(P.resolve(amount, drink, 30, FRI_18).price, 0);
  const fixed = P.sanitize([{ id: 'f', name: 'F', kind: 'fixed', value: 25, cats: ['boissons'] }], MENU);
  assert.equal(P.resolve(fixed, drink, 30, FRI_18).price, 25);
  assert.equal(P.resolve(fixed, drink, 20, FRI_18), null, 'a 20 MAD drink is not raised to 25');
});
ok('a promotion on one item, or on the whole menu', () => {
  const one = P.sanitize([{ id: 'o', name: 'O', value: 10, items: ['kefta'] }], MENU);
  assert.equal(P.resolve(one, { itemId: 'kefta', catId: 'tajines' }, 180, FRI_18).price, 162);
  assert.equal(P.resolve(one, drink, 30, FRI_18), null);
  const all = P.sanitize([{ id: 'w', name: 'W', value: 10, all: true }], MENU);
  assert.equal(P.resolve(all, { itemId: 'kefta', catId: 'tajines' }, 180, FRI_18).price, 162);
});
ok('a composed menu and its components are never discounted', () => {
  const all = P.sanitize([{ id: 'w', name: 'W', value: 10, all: true }], MENU);
  assert.equal(P.resolve(all, { itemId: 'brunch', catId: 'tajines', kind: 'formula' }, 120, FRI_18), null);
  assert.equal(P.resolve(all, { itemId: 'the', catId: 'boissons', kind: 'formula-part' }, 30, FRI_18), null);
});
ok('two promotions never add up: the lower price wins, and on a tie the older one', () => {
  const two = P.sanitize([
    { id: 'old', name: 'Old', value: 10, cats: ['boissons'], createdAt: 5 },
    { id: 'big', name: 'Big', value: 30, cats: ['boissons'], createdAt: 9 },
    { id: 'tie', name: 'Tie', kind: 'amount', value: 9, cats: ['boissons'], createdAt: 7 },
  ], MENU);
  const r = P.resolve(two, drink, 30, FRI_18);
  assert.equal(r.price, 21);
  assert.ok(['big', 'tie'].includes(r.promo.id));
  assert.equal(r.promo.id, 'tie', '30 % and 9 MAD both give 21; the older (createdAt 7) wins');
});
ok('no promotions, or a free item: nothing to resolve', () => {
  assert.equal(P.resolve([], drink, 30, FRI_18), null);
  assert.equal(P.resolve(undefined, drink, 30, FRI_18), null);
  assert.equal(P.resolve([happy()], drink, 0, FRI_18), null);
});

console.log('■ menu promotions · when (Casablanca, 05:00 business day)');
ok('the business moment reads Casablanca wall time, not the machine\'s', () => {
  assert.deepEqual(P.businessMoment(FRI_18), { date: '2026-10-16', weekday: 5, min: 18 * 60 });
});
ok('before 05:00 it is still the day before', () => {
  assert.deepEqual(P.businessMoment(at(2026, 10, 17, 4, 59)), { date: '2026-10-16', weekday: 5, min: 4 * 60 + 59 });
  assert.equal(P.businessMoment(at(2026, 10, 17, 5, 0)).date, '2026-10-17');
});
ok('17:00 to 19:00: on at 17:00 and 18:59, off at 16:59 and 19:00', () => {
  const p = happy({ start: '17:00', end: '19:00' });
  assert.deepEqual([at(2026, 10, 16, 16, 59), at(2026, 10, 16, 17, 0), at(2026, 10, 16, 18, 59), at(2026, 10, 16, 19, 0)].map((t) => P.isActive(p, t)), [false, true, true, false]);
});
ok('22:00 to 01:00 on Fridays still runs at 00:30 Saturday, and not on Saturday night', () => {
  const p = happy({ days: [5], start: '22:00', end: '01:00' });
  assert.equal(P.isActive(p, at(2026, 10, 16, 23, 0)), true);
  assert.equal(P.isActive(p, at(2026, 10, 17, 0, 30)), true);
  assert.equal(P.isActive(p, at(2026, 10, 17, 1, 0)), false);
  assert.equal(P.isActive(p, at(2026, 10, 17, 23, 0)), false);
});
ok('weekdays follow the business day', () => {
  const p = happy({ days: [1, 2, 3, 4] });
  assert.equal(P.isActive(p, FRI_18), false);
  assert.equal(P.isActive(p, at(2026, 10, 15, 18, 0)), true);
  assert.equal(P.isActive(p, at(2026, 10, 16, 3, 0)), true, '03:00 Friday is Thursday\'s business day');
});
ok('first and last day are business days, inclusive', () => {
  const p = happy({ from: '2026-10-16', to: '2026-10-16' });
  assert.equal(P.isActive(p, at(2026, 10, 16, 4, 0)), false, '04:00 on the 16th is the 15th');
  assert.equal(P.isActive(p, FRI_18), true);
  assert.equal(P.isActive(p, at(2026, 10, 17, 2, 0)), true, '02:00 on the 17th is still the 16th');
  assert.equal(P.isActive(p, at(2026, 10, 17, 6, 0)), false);
});
ok('status says why a promotion is not running', () => {
  assert.equal(P.status(happy({ paused: true }), FRI_18), 'paused');
  assert.equal(P.status(happy({ from: '2026-11-01' }), FRI_18), 'scheduled');
  assert.equal(P.status(happy({ to: '2026-10-01' }), FRI_18), 'ended');
  assert.equal(P.status(happy({ start: '20:00', end: '22:00' }), FRI_18), 'waiting');
  assert.equal(P.status(happy(), FRI_18), 'active');
});
ok('a paused promotion prices nothing', () => {
  assert.equal(P.resolve([happy({ paused: true })], drink, 30, FRI_18), null);
});
ok('two units at two prices never share a stack key', () => {
  const r = P.resolve([happy()], drink, 30, FRI_18);
  assert.equal(P.stackKey(r.promo), 'hh@30');
  assert.equal(P.stackKey(null), '');
});

console.log(`\nmenu-promos: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
