#!/usr/bin/env node
/* loyalty-product-links-test · which products a « per product » loyalty card
 * keeps by id when the programme is saved (assets/loyalty-product-links.js,
 * note 13 loyalty#0). Runs the real file in a realm with fake catalogues:
 *   · the word matches whole words, ignoring accents, case and punctuation;
 *   · the menu and the boutique catalogue both count, the boutique on the
 *     current venue's key;
 *   · saving the same word keeps the earlier links, a new word drops them;
 *   · a catalogue that throws costs its own products, not the save.
 *   node tools/loyalty-product-links-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/loyalty-product-links.js', import.meta.url), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; console.log('  ✓ ' + msg); };

function realm({ menu = [], boutique = [], menuThrows = false } = {}) {
  const used = [];
  const window = {
    KiwiVenue: { getVenue: () => 'v-1' },
    KiwiMenuStore: { items: (vid) => { if (menuThrows) throw new Error('menu'); return vid === 'v-1' ? menu : []; } },
    KiwiBoutiqueVenueKey: () => 'shop-key',
    KiwiBoutiqueCatalog: { use: (k) => used.push(k), listProducts: () => (used.at(-1) === 'shop-key' ? boutique : []) },
  };
  vm.runInContext(source, vm.createContext({ window }));
  return { L: window.KiwiLoyaltyLinks, used };
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

{
  const { L, used } = realm({
    menu: [{ id: 'm1', name: 'Café' }, { id: 'm2', name: 'Café crème' }, { id: 'm3', name: 'Cafetière' }, { id: 'm4', name: 'Thé' }],
    boutique: [{ id: 'b1', name: 'CAFÉ en grains, 1 kg' }, { name: 'Café sans id' }],
  });
  const ids = L.linkedIds('cafe', null);
  ok(same(ids, ['m1', 'm2', 'b1']), `the word names whole words across menu and boutique, accents and case aside (${ids})`);
  ok(used.includes('shop-key'), 'the boutique catalogue is read on the current venue');
}
{
  const { L } = realm({ menu: [{ id: 'm9', name: 'Café noir' }] });
  const prev = { item: 'Café', ids: ['m1', 'b1'] };
  ok(same(L.linkedIds('Café', prev), ['m1', 'b1', 'm9']), 'saving the same word keeps the earlier links and adds the new matches');
  ok(same(L.linkedIds('Croissant', prev), []), 'a new word drops the links of the old one');
}
/* r21 loyalty#B0/B2 · editing a saved word between its accented and plain forms,
   with ids already linked: the old ids stay only while the new spelling matches
   the same names as the old one (the earning side's own rule). */
{
  const { L } = realm({ menu: [{ id: 't1', name: 'Thé vert' }, { id: 't2', name: 'The Burger' }] });
  ok(same(L.linkedIds('The', null), ['t1', 't2']), 'the plain « The » links both the tea and the burger');
  ok(same(L.linkedIds('Thé', { item: 'The', ids: ['t1', 't2'] }), ['t1']), 'changing The to Thé drops the burger linked earlier: « Thé » is accent-sensitive');
  ok(same(L.linkedIds('Thé', { item: 'Thé', ids: ['t1', 'old'] }), ['t1', 'old']), 'saving Thé again keeps its earlier links');
  ok(same(L.linkedIds('THÉ', { item: 'Thé', ids: ['t1', 'old'] }), ['t1', 'old']), 'a change of case alone keeps the links');
  ok(same(L.linkedIds('The', { item: 'Thé', ids: ['t1'] }), ['t1', 't2']), 'going back to the plain The matches both again');
  const cafe = realm({ menu: [{ id: 'c1', name: 'Café' }] }).L;
  ok(same(cafe.linkedIds('Cafe', { item: 'Café', ids: ['gone'] }), ['gone', 'c1']), 'a long word keeps folding accents: Café to Cafe keeps the earlier ids');
}
{
  const { L } = realm({ menuThrows: true, boutique: [{ id: 'b2', name: 'Café moulu' }] });
  ok(same(L.linkedIds('café', null), ['b2']), 'a menu that throws costs its products, not the save');
  ok(L.unavailable().join() === 'menu', 'the unavailable catalogue is reported so the save can refuse');
  L.linkedIds('café', null, []); // items given: no read, previous report stays
  ok(same(L.linkedIds('', { item: '', ids: ['x'] }), ['x']) && same(L.linkedIds('   ', null), []), 'an empty word matches nothing new');
}
{
  const { L } = realm({ menu: [{ id: 't1', name: 'Thé' }, { id: 't2', name: 'The Burger' }, { id: 't3', name: 'Thé à la menthe' }, { id: 'c1', name: 'Café' }, { id: 'c2', name: 'Cafe latte' }] });
  ok(same(L.linkedIds('Thé', null), ['t1', 't3']), 'a short accented word is accent-sensitive, like the earning rule: « The Burger » is not linked');
  ok(same(L.linkedIds('The', null), ['t1', 't2', 't3']), 'the same short word typed without the accent still folds');
  ok(same(L.linkedIds('Café', null), ['c1', 'c2']), 'a word of 4+ letters keeps folding accents');
  const ok2 = realm({ menu: [] }); ok(ok2.L.unavailable().length === 0, 'no failure reported when both catalogues answer');
}
{
  const many = Array.from({ length: 260 }, (_, i) => ({ id: 'p' + i, name: 'Café ' + i }));
  const { L } = realm({ menu: many });
  // Owner ruling docs/decisions/2026-11-04-owner-delegated.md:16, never truncate links.
  ok(L.linkedIds('café', null).length === 260 && L.MAX_IDS === 2000, 'all 260 links survive below the new 2000 cap');
  ok(L.linkedIds('café', null, Array.from({length: 2001}, (_, i) => ({id: String(i + 1), name: 'Café'}))).length === 2001, 'overflow stays visible to the save guard');
}
console.log(`\n✓ loyalty-product-links-test · ${checks} checks`);
