#!/usr/bin/env node
/* Kiwi · God Mode tab isolation
 *
 * 2026-09-26: two God Mode tabs in one browser, one on Amira Café, one on
 * Pasta Corner. Both venues are the transient id 'scoped', so every
 * KiwiStore feature shared one localStorage record between them. An edit in
 * Amira's tab reached Pasta Corner's tab through the `storage` event, which
 * republished it as Pasta Corner's menu; costs, recipes and reservations
 * followed the same path.
 *
 *   node tools/scoped-tab-isolation-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeSrc = fs.readFileSync(path.join(ROOT, 'assets/venue-store.js'), 'utf8');
const menuSrc = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog.js'), 'utf8');
const cloudSrc = fs.readFileSync(path.join(ROOT, 'assets/cloud-doc.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures.push(msg); console.log('  ✗ ' + msg); } }
console.log('■ God Mode tab isolation (tools/scoped-tab-isolation-test.mjs)');

// One browser: one localStorage shared by every tab, `storage` events go to the others.
const data = new Map();
const tabs = [];
const localStorage = {
  get length() { return data.size; },
  key: (i) => [...data.keys()][i] ?? null,
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem(k, v) {
    data.set(k, String(v));
    for (const t of tabs) if (t !== current) t.fire({ key: k });
  },
  removeItem: (k) => data.delete(k),
};
let current = null;

function tab(slug) {
  const listeners = [];
  const win = {
    localStorage,
    addEventListener: (type, fn) => { if (type === 'storage') listeners.push(fn); },
    KiwiVenue: {
      getVenueData: (id) => (id === 'scoped' ? { id: 'scoped', slug, name: slug } : null),
      getCurrentVenueData: () => ({ id: 'scoped', slug, name: slug }),
      getVenue: () => 'scoped',
    },
  };
  win.window = win;
  vm.runInNewContext(storeSrc, win);
  const t = { slug, win, fire: (e) => listeners.forEach((fn) => fn(e)), notified: [] };
  t.menu = win.KiwiStore.define('menu', { blank: () => ({ cats: [], items: [] }) });
  t.menu.subscribe((vid) => t.notified.push(vid));
  tabs.push(t);
  return t;
}
function as(t, fn) { current = t; try { return fn(); } finally { current = null; } }

const amira = tab('amira-cafe');
const pasta = tab('pasta-corner');
as(pasta, () => pasta.menu.set({ cats: [{ id: 'c1', name: 'Choisissez vos Pâtes' }], items: [{ id: 'i1', name: 'Lasagna' }] }));
pasta.notified.length = 0;
as(amira, () => amira.menu.set({ cats: [{ id: 'c1', name: 'Entrées' }], items: [{ id: 'i1', name: 'Harira (copie)' }] }));

ok(as(pasta, () => pasta.menu.get()).items[0].name === 'Lasagna', "Amira's God Mode edit does not replace Pasta Corner's local menu");
ok(pasta.notified.length === 0, "Pasta Corner's tab is not told its menu changed when Amira's tab edits");
ok(as(amira, () => amira.menu.key()) !== as(pasta, () => pasta.menu.key()), 'each God Mode client has its own storage key');
ok(as(pasta, () => pasta.menu.key()).endsWith(':scoped@pasta-corner'), 'the scoped key carries the client slug');

// A second tab on the SAME client still hears its sibling, as before.
const pasta2 = tab('pasta-corner');
as(pasta, () => pasta.menu.set({ cats: [], items: [{ id: 'i2', name: 'Tiramisù' }] }));
ok(pasta2.notified.includes('scoped'), 'a second tab on the same client still receives the change');

// Ordinary (non-scoped) stores keep their existing key format.
ok(as(pasta, () => pasta.win.KiwiStore.define('floorplan', {}).key('v-santos')) === 'kiwi:floorplan:v1:v-santos', 'non-scoped keys are unchanged');

// menu-catalog never publishes another venue's carte under the shown store's slug.
ok(/const shown = \(KV && KV\.getCurrentVenueData && KV\.getCurrentVenueData\(\)\) \|\| \{\};\s*if \(vid && shown\.id && vid !== shown\.id\) return;/.test(menuSrc), 'menu publish refuses a venue other than the one on screen');
ok(/if \(!slug \|\| !venueId \|\| venueId === 'scoped'\) return null;/.test(cloudSrc), 'God Mode never adopts orphaned local records');

if (failures.length) { console.log(`\n✗ ${failures.length} failure(s)`); process.exit(1); }
console.log(`\n✓ ${passed} controls green`);
