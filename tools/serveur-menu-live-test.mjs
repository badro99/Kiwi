#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8');
const applyStart = source.indexOf('    function svApplyCarte(d) {');
const applyEnd = source.indexOf('    function svRebuildCarte()', applyStart);
const fetchStart = source.indexOf('    function svFetchCarte() {', applyEnd);
const fetchEnd = source.indexOf('\n\n    /* ── Envoyer la commande', fetchStart);
assert.ok(applyStart > 0 && applyEnd > applyStart && fetchStart > applyEnd && fetchEnd > fetchStart,
  'live menu functions remain discoverable');

const menu = {
  cats: [{ id: 'cat_1', name: 'Entrées', station: 'st_1' }],
  items: [{ id: 'it_1', name: 'Harira', price: 28, catId: 'cat_1', avail: true }],
  stations: [{ id: 'st_1', name: 'Cuisine' }],
  opts: [],
};
let paints = 0;
const context = {
  SV_DEMO: false,
  SV_CARTE_MIRROR: 'kiwi:menuMirror:v1:',
  svSlug: () => 'amira-cafe',
  localStorage: { setItem() { throw new Error('storage-blocked'); } },
  fetch: async () => ({ ok: true, json: async () => ({ menu }) }),
  svStations: [], optionGroups: {}, itemOptions: {},
  catLabels: { all: 'Tout' }, catOrder: ['all'], menuItems: [], activeCat: 'all',
  renderCatPills() { paints++; }, renderMenu() { paints++; },
  console,
};
vm.createContext(context);
new vm.Script(source.slice(applyStart, applyEnd) + '\n' + source.slice(fetchStart, fetchEnd)).runInContext(context);

const shown = await context.svFetchCarte();
assert.equal(shown, true, 'a valid network menu is applied');
assert.equal(context.menuItems.length, 1, 'the live product reaches the server menu');
assert.equal(context.menuItems[0].name, 'Harira');
assert.equal(context.catLabels.cat_1, 'Entrées');
assert.equal(paints, 2, 'category pills and menu cards repaint immediately');

console.log('✓ live server menu renders even when its offline localStorage mirror cannot be written');
