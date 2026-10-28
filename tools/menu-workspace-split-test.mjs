/* Preuve stricte : corps déplacés, ordre de chargement et rendu FR en realm. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import menuWorkspaceSource from './menu-workspace-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
const read = f => fs.readFileSync(f, 'utf8');
const map = JSON.parse(read('tools/fixtures/menu-workspace/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/menu-workspace/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
// Recipes were reformatted for reviewability. Keep byte equality for every
// other owner; the renderer comparisons below prove the recipe outputs.
const recipePart = map.segments.find(s => s.name === 'recipes');
const recipeSource = read(recipePart.file);
const recipeStart = '  /* menu-part:recipes */\n';
const recipeBody = recipeSource.slice(recipeSource.indexOf(recipeStart) + recipeStart.length, recipeSource.indexOf('  /* /menu-part:recipes */'));
assert.ok(menuWorkspaceSource().includes(recipeBody));
assert.equal(menuWorkspaceSource().replace(recipeBody, () => original.slice(recipePart.start, recipePart.end)), original, 'other owners retain byte-exact reconstruction');
const core = read('assets/restaurant-menu-workspace.js');
const dashboard = dashboardDependencies.eager(read('dashboard.html'));
const sw = read('kiwi-sw.js');
for (const segment of map.segments) {
  const file = segment.file;
  for (const source of [dashboard, sw]) {
    assert.match(source, new RegExp(file.replaceAll('.', '\\.') + '\\?v=\\d+'));
    assert.ok(source.indexOf(file + '?') < source.indexOf('assets/restaurant-menu-workspace.js?'), file + ' avant le noyau');
  }
  const win = {};
  vm.runInNewContext(read(file), { window: win });
  assert.deepEqual(Object.keys(win), ['KiwiMenuWorkspaceParts'], 'installation inerte sans DOM ni handlers');
  assert.equal(typeof win.KiwiMenuWorkspaceParts[segment.name], 'function');
}
function realm(split) {
const items = [
  { id: 'done', name: 'Tajine complet', price: 90, catId: 'plats', avail: true, nutritionComplete: true, nutrition: { kcal: 512, protein: 31, carbs: 40, fat: 22 } },
  { id: 'todo', name: 'Pastilla à compléter', price: 80, catId: 'plats', avail: true },
  { id: 'hidden', name: 'Soupe masquée', price: 30, catId: 'plats', avail: true, hideNutrition: true, nutritionComplete: true },
  { id: 'none', name: 'Sans recette', price: 20, catId: 'plats', avail: true },
];
const recipes = {
  done: { ingredients: [{ name: 'Poulet', qty: 200, unit: 'g' }], portions: 1 },
  todo: { ingredients: [{ name: 'Amandes', qty: 50, unit: 'g' }, { name: 'Sucre', qty: 20, unit: 'g' }], portions: 1 },
  hidden: { ingredients: [{ name: 'Lentilles', qty: 100, unit: 'g' }], portions: 1 },
};
const results = {
  done: { complete: true, nutrition: { kcal: 512, protein: 31, carbs: 40, fat: 22 }, allergens: ['gluten', 'lait'], missingNutrition: [], missingConversion: [], missingAllergens: [] },
  todo: { complete: false, nutrition: null, allergens: [], missingNutrition: ['Amandes'], missingConversion: [], missingAllergens: ['Amandes', 'Sucre'] },
  hidden: { complete: true, nutrition: { kcal: 200, protein: 12, carbs: 30, fat: 3 }, allergens: [], missingNutrition: [], missingConversion: [], missingAllergens: [] },
};
const updates = [];
const root = { hidden: true, innerHTML: '' };
const breadcrumb = { innerHTML: '' };
const classList = { add() {}, remove() {}, toggle() {}, contains: (x) => x === 'page-menu' };
const node = () => ({ id: '', textContent: '', innerHTML: '', style: {}, classList, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, dataset: {} });
const document = {
  readyState: 'complete', body: { classList }, head: { appendChild() {} },
  querySelector: (s) => s === '[data-menu-root]' ? root : s === '.breadcrumb' ? breadcrumb : null,
  querySelectorAll: () => [], createElement: node, addEventListener() {},
};
const data = { cats: [{ id: 'plats', name: 'Plats' }], items, stations: [], opts: [] };
const window = {
  Kiwi: { handlers: {}, pageShell() {}, setActivePage() {}, toast() {} },
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'resto', name: 'Restaurant test', type: 'restaurant' }), getVenueType: () => 'restaurant', subscribe() {} },
  KiwiMenuStore: { data: () => data, subscribe() {}, kitchenId: () => '', updateItem: (id, patch) => { updates.push([id, patch]); Object.assign(items.find((x) => x.id === id), patch); } },
  KiwiSales: { list: () => [] },
  KiwiRestaurantRecipes: {
    get: (id) => recipes[id] || null,
    metrics: () => ({ costComplete: false }),
    nutrition: (_r, id) => results[id] || null,
  },
  KiwiConfig: { features: {} },
  addEventListener() {},
};
const context = { window, document, console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900, Date, Math, Intl, Number, String, Array, Object, JSON, Set, Map, RegExp, Promise, Error, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { language: 'fr' } };
window.window = window;
window.document = document;
vm.createContext(context);

if (split) for (const segment of map.segments) vm.runInContext(read(segment.file), context);
const expose = '  window.__menuProof = {recipeSummary, recipeUnitOptions, recipeIngredientRow, recipeNutrition, recipeLineInfo};\n';
vm.runInContext((split ? core : original).replace('  let booted=false', expose + '  let booted=false'), context);
return {window, root, updates};
}
const before = realm(false), after = realm(true);
assert.deepEqual(Object.keys(after.window.Kiwi.handlers).sort(), Object.keys(before.window.Kiwi.handlers).sort());
assert.deepEqual(Object.keys(after.window).filter(k=>k!=='KiwiMenuWorkspaceParts').sort(), Object.keys(before.window).sort());
assert.ok(before.root.innerHTML.includes('Tajine complet'), 'carte non vide rendue dès le démarrage');
assert.equal(after.root.innerHTML, before.root.innerHTML, 'premier rendu FR identique');
for (const tab of ['menu','recipes','nutrition','stations','alerts','nfc']) {
  for (const r of [before, after]) r.window.Kiwi.handlers['rmw-tab']({dataset:{tab}});
  assert.equal(after.root.innerHTML, before.root.innerHTML, tab + ' : HTML identique');
}
for (const name of ['recipeUnitOptions', 'recipeIngredientRow']) {
  assert.equal(after.window.__menuProof[name]({name:'Poulet',qty:2,unit:'g'}), before.window.__menuProof[name]({name:'Poulet',qty:2,unit:'g'}), name);
}
for (const r of [before,after]) r.window.KiwiCost = {marginOf:()=>({pct:60,profit:12})};
const api = {metrics:()=>({costComplete:true,theoreticalCost:8}), nutrition:()=>null};
const draft = {portions:1,ingredients:[]};
assert.equal(after.window.__menuProof.recipeSummary({price:20},draft,api,false,[]), before.window.__menuProof.recipeSummary({price:20},draft,api,false,[]), 'résumé de recette avec marge identique');
console.log('✓ menu-workspace-split : reconstruction stricte, chargement eager et précache, installation inerte, globals, handlers et six rendus FR identiques');
