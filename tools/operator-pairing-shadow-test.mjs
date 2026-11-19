#!/usr/bin/env node
/* Vue opérateur : l'appairage de caisse du poste ne décide plus du commerce.
 *
 * Santos, 19 nov. 2026 : la vue opérateur de Santos (dashboard?op=1&merchant=
 * santos-store) interrogeait aussi le catalogue, les clients, les rapports du
 * jour, la fidélité, les opérations et la quarantaine d'Amira Boutique : ce
 * navigateur avait été appairé un jour comme caisse d'Amira Boutique
 * (kiwiPairedVenue), et six modules lisent cet appairage avant le commerce à
 * l'écran. Sur la vue opérateur, assets/dashboard-startup-gate.js fait lire
 * l'appairage vide ; ailleurs rien ne change, et rien n'est jamais effacé.
 * Vrai fichier, vrai KiwiPlatform.tenant() (assets/platform-kernel.js).
 *   node tools/operator-pairing-shadow-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const ok = (label, fn) => { fn(); passed++; console.log('  ✓ ' + label); };
const gate = fs.readFileSync('assets/dashboard-startup-gate.js', 'utf8');
const kernel = fs.readFileSync('assets/platform-kernel.js', 'utf8');
function page(search) {
  class Storage {
    constructor() { this.m = new Map(); }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
  }
  const localStorage = new Storage(), sessionStorage = new Storage();
  localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'amira-boutique', venueId: 'v-amira-boutique', type: 'boutique' }));
  localStorage.setItem('kiwiPaired', '1');
  localStorage.setItem('kiwiLiveMerchant', 'santos-store');
  sessionStorage.setItem('kiwiPairedVenue', 'session-copy');
  const window = { localStorage, sessionStorage, addEventListener() {},
    KiwiVenue: { getCurrentVenueData: () => ({ id: 'own' }) } };
  const document = { readyState: 'complete', body: {}, querySelector: () => null, addEventListener() {} };
  const c = vm.createContext({ window, document, location: { search }, URLSearchParams, Storage, localStorage, sessionStorage, getComputedStyle: () => ({}), setTimeout, clearTimeout });
  window.window = window;
  vm.runInContext(gate, c);
  vm.runInContext(kernel, c);
  return { c, window, localStorage, sessionStorage };
}

ok('operator view of Santos: a stale Amira till pairing reads empty', () => {
  const p = page('?op=1&merchant=santos-store');
  assert.equal(p.localStorage.getItem('kiwiPairedVenue'), null);
  assert.equal(p.localStorage.getItem('kiwiPaired'), null);
  assert.equal(p.localStorage.getItem('kiwiLiveMerchant'), 'santos-store', 'other keys untouched');
});
ok('KiwiPlatform.tenant() no longer answers amira-boutique there', () => {
  const p = page('?op=1&merchant=santos-store');
  assert.notEqual(p.window.KiwiPlatform.tenant(), 'amira-boutique');
  assert.equal(p.window.KiwiPlatform.tenant(), 'santos-store');
});
ok('nothing is erased: the device stays paired for its till', () => {
  const p = page('?op=1&merchant=santos-store');
  assert.ok(p.localStorage.m.get('kiwiPairedVenue').includes('amira-boutique'));
  assert.equal(p.sessionStorage.getItem('kiwiPairedVenue'), 'session-copy', 'only localStorage is shadowed');
});
ok('the owner dashboard and other pages keep reading the pairing', () => {
  for (const search of ['', '?merchant=santos-store', '?op=1']) {
    const p = page(search);
    assert.ok(String(p.localStorage.getItem('kiwiPairedVenue')).includes('amira-boutique'), search || 'no query');
  }
});
console.log(`operator-pairing-shadow: ${passed} passed`);
