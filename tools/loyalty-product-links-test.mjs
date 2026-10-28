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
{
  const { L } = realm({ menuThrows: true, boutique: [{ id: 'b2', name: 'Café moulu' }] });
  ok(same(L.linkedIds('café', null), ['b2']), 'a menu that throws costs its products, not the save');
  ok(same(L.linkedIds('', { item: '', ids: ['x'] }), ['x']) && same(L.linkedIds('   ', null), []), 'an empty word matches nothing new');
}
{
  const many = Array.from({ length: 260 }, (_, i) => ({ id: 'p' + i, name: 'Café ' + i }));
  const { L } = realm({ menu: many });
  ok(L.linkedIds('café', null).length === L.MAX_IDS && L.MAX_IDS === 200, 'the list stops at 200 ids');
}
console.log(`\n✓ loyalty-product-links-test · ${checks} checks`);
