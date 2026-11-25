import menuWorkspaceSource from './menu-workspace-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* L'éditeur de recette, redessiné (2026-10-11). Avant : une feuille de verre
 * translucide sur une page floutée, des cartes dans des cartes, « 32.00 MAD »
 * en français, des libellés d'unité tronqués (« Gramme (... »), un suffixe
 * « min » dessiné par-dessus le champ. Ce test garde la nouvelle forme. */
const js = menuWorkspaceSource();
const dashboard = dashboardDependencies(fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8'));
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');
const fn = (name) => { const a = js.indexOf(`  function ${name}(`); assert.ok(a > 0, name + ' exists'); const b = js.indexOf('\n  function ', a + 10); return js.slice(a, b); };

const summary = fn('recipeSummary'), row = fn('recipeIngredientRow'), open = fn('openRecipe'), units = fn('recipeUnitOptions');
assert.match(open, /class="rmw-rx-main"/, 'composition and method in the main column');
assert.match(open, /class="rmw-rx-side" data-recipe-summary/, 'cost summary in a side panel');
assert.match(js, /\.kiwi-backdrop\.rmw-recipe-modal \.kiwi-modal\.kiwi-modal\{[^}]*background:var\(--rx-bg\)!important;backdrop-filter:none!important/, 'the recipe sheet is opaque, not glass');
assert.match(js, /\.kiwi-backdrop\.rmw-recipe-modal\{[^}]*backdrop-filter:none!important/, 'the page behind is dimmed, not blurred');
assert.doesNotMatch(summary, /toFixed\(2\)/, 'money goes through the locale formatter, never toFixed(2)');
assert.match(summary, /C\?\.marginOf/, 'contribution uses KiwiCost.marginOf (pre-VAT when prices include VAT), like Analyse du menu');
assert.match(summary, /rxAtLeast/, 'an incomplete recipe shows « au moins », never a fake total');
assert.doesNotMatch(summary + open, /'(Prix de vente|Coût théorique|Marge théorique|À compléter|Recette enregistrée)'/, 'no hardcoded French in the editor');
assert.match(row, /data-kiwi-native-select/, 'the compact unit select is not wrapped by the enhancer that truncated its label');
assert.match(units, /unit\.family==='mass'\|\|unit\.family==='volume'\?unit\.id:unit\.label/, 'short unit labels (g, kg, ml) in the list');
/* Jon's Burgers, 25 Nov 2026: the empty choice read « Unité », the same word
 * as the real unit « Unité » (a piece), so a recipe looked complete and the save
 * refused with « Unités manquantes ». The empty choice now asks to choose. */
assert.match(units, /<option value="">\$\{esc\(ui\('rxUnitPh'\)\)\}<\/option>/, 'the empty unit choice has its own wording');
{
  const strings = fs.readFileSync(new URL('../assets/restaurant-menu/strings.js', import.meta.url), 'utf8');
  const unitsSrc = fs.readFileSync(new URL('../assets/restaurant-units.js', import.meta.url), 'utf8');
  const labels = new Set([...unitsSrc.matchAll(/label: '([^']+)'/g)].map((m) => m[1].toLowerCase()));
  const ph = [...strings.matchAll(/rxUnitPh: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(ph.length, 3, 'the empty unit choice is worded in FR, EN and AR');
  for (const p of ph) assert.ok(!labels.has(p.toLowerCase()) && p.toLowerCase() !== 'unité' && p.toLowerCase() !== 'unit', `« ${p} » cannot be read as a unit`);
}
assert.match(row, /data-ing-meta/, 'each line says how stock sees it (linked, no price, unit mismatch)');
assert.match(row, /viewBox="0 -960 960 960"/, 'Material icon for the remove button');
assert.doesNotMatch(js, /\.rmw-recipe-suffix b\{margin-left:-30px/, 'no suffix drawn over its field');
assert.match(js, /@media\(max-width:900px\)\{\.rmw-rx\{grid-template-columns:1fr\}/, 'one column on narrow screens');
assert.match(open, /title:ui\('rxTitle',\{name:t\(x\.name\)\}\)/, 'the title is escaped once by Kiwi.modal, not twice');

const workspaceStamp = dashboard.match(/assets\/restaurant-menu-workspace\.js\?v=(\d+)/)?.[1];
assert.ok(workspaceStamp, 'dashboard loads the recipe workspace with a cache stamp');
assert.match(sw, new RegExp(`assets/restaurant-menu-workspace\\.js\\?v=${workspaceStamp}`), 'service worker uses the dashboard stamp');
console.log('✓ restaurant recipe layout: 19 checks');
