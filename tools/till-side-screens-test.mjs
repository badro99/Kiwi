/* The till's full-screen pages (Stock & appro, Menu, the till check) close
 * when the cashier picks another place.
 *
 * Owner, 2026-11-09: Stock stayed painted over the till after tapping Salle,
 * because the rail only switched the mode underneath. closeSideScreens()
 * (assets/caisse/till-frame.js) runs on every rail destination, every Plus
 * row that opens a page, and every mode pill (assets/caisse-app.js). It
 * leaves the kitchen screen to closeKds(), which the rail already calls.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed += 1; console.log('  ✓ ' + msg); };

const frame = read('assets/caisse/till-frame.js');
const app = read('assets/caisse-app.js');

/* 1 · the helper, run against a stub DOM */
const m = /function closeSideScreens\(\) \{[\s\S]*?\n {4}\}/.exec(frame);
ok(!!m, 'till-frame.js declares closeSideScreens()');

function screen(id, closeId) {
  const cls = new Set(['kds-screen', 'is-open']);
  const s = { id, clicked: 0, classList: { remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } };
  const x = closeId ? { click: () => { s.clicked += 1; cls.delete('is-open'); } } : null;
  s.querySelector = (sel) => (x && sel.split(',').map((t) => t.trim()).includes('#' + closeId) ? x : null);
  return s;
}
const screens = [
  screen('kds-screen', null),
  screen('stock-screen', 'stock-close-btn'),
  screen('menu-availability-screen', 'menu-availability-close'),
  screen('caisse-doctor', 'kd-close'),
  screen('some-future-page', null),
];
const document = { querySelectorAll: (sel) => (sel === '.kds-screen.is-open' ? screens.filter((s) => s.classList.contains('is-open')) : []) };
vm.runInNewContext(m[0] + '\ncloseSideScreens();', { document });
const by = Object.fromEntries(screens.map((s) => [s.id, s]));
ok(by['kds-screen'].classList.contains('is-open'), 'the kitchen screen is left to closeKds()');
ok(!by['stock-screen'].classList.contains('is-open') && by['stock-screen'].clicked === 1, 'Stock closes through its own close button');
ok(!by['menu-availability-screen'].classList.contains('is-open') && by['menu-availability-screen'].clicked === 1, 'Menu closes through its own close button, which also closes its sheet');
ok(!by['caisse-doctor'].classList.contains('is-open') && by['caisse-doctor'].clicked === 1, 'the till check closes through its own close button');
ok(!by['some-future-page'].classList.contains('is-open'), 'a page with no known close button still closes');

/* 2 · every way off the page calls it */
const railSelect = /function tillKitRailSelect\(id\) \{[\s\S]*?\n {4}\}/.exec(frame);
ok(!!railSelect && /tillKitSetMore\(false\);\s*closeSideScreens\(\);/.test(railSelect[0]), 'a rail destination (Salle, À emporter, En attente, Cuisine, Clients) closes the page first');
const more = /function tillKitMore\(id\) \{[\s\S]*?\n {4}\}/.exec(frame);
ok(!!more && /if \(id !== 'sync' && id !== 'fullscreen'\) closeSideScreens\(\);/.test(more[0]), 'a Plus row that opens another page closes the current one; sync and full screen do not');
ok(/\$\$\('\.mode-pill'\)\.forEach\(btn => \{\s*btn\.addEventListener\('click', \(\) => \{[\s\S]{0,200}?closeSideScreens\(\);/.test(app), 'a mode pill on the shipped till closes the page too');

console.log(`till-side-screens: ${passed} passed`);
