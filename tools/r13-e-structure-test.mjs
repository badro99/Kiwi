import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// A caller may reuse or mutate its array after opening a dossier. Navigation
// must retain the same book that supplied the balance at open time.
const source = fs.readFileSync('assets/credit-history-page.js', 'utf8');
const list = { innerHTML: '', after() {} };
const buttons = [{ focus() {} }, { focus() {} }], status = {};
const nav = { querySelectorAll: () => buttons, querySelector: () => status };
const c = vm.createContext({ document: { documentElement: { lang: 'fr' }, createElement: () => nav } });
vm.runInContext(source.replaceAll('export ', ''), c);
const entries = Array.from({ length: 101 }, (_, id) => ({ id }));
c.bindHistoryPages({ querySelector: () => list }, entries, row => `${row.id},`, () => {});
entries[50].id = 'changed';
entries.splice(0, entries.length);
buttons[1].onclick();
assert.equal(list.innerHTML, Array.from({ length: 50 }, (_, i) => `${i + 50},`).join(''), 'navigation owns its immutable opening snapshot');
assert.equal(status.textContent, '2 / 3');
buttons[1].onclick();
assert.equal(list.innerHTML, '100,');
assert.equal(buttons[1].disabled, true);

// Execute the shipped renderers, including hostile merchant-provided names.
const recipes = fs.readFileSync('assets/restaurant-menu/recipes.js', 'utf8');
const window = {};
vm.runInNewContext(recipes, { window });
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const api = window.KiwiMenuWorkspaceParts.recipes({ esc, ui: key => key });
const html = api.recipeIngredientRow({ name: '\"><script>bad()</script>', stockId: '"' }, 0);
assert.ok(!html.includes('<script>'));
for (const label of ['rxIngredient', 'rxQty', 'rxChoose', 'rxRemove']) assert.ok(html.includes(`aria-label="${label}"`));
assert.ok(html.includes('data-ing-delete'));
// Readability is a structure contract, complementary to execution assertions.
assert.ok(Math.max(...recipes.split('\n').map(line => line.length)) < 650, 'recipe rendering statements must be reviewable');
const stamps = createRequire(import.meta.url)('./stamps.js').scan();
assert.ok(stamps.get('assets/credit-history-page.js')?.sites.some(site => site.kind === 'module' && site.file === 'assets/pos-epicerie.js'), 'credit history import participates in stamp propagation');
console.log('✓ lane E snapshot navigation and recipe rendering');
