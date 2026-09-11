#!/usr/bin/env node
'use strict';
/* Onglet Nutrition de l'atelier carte : une ligne par plat avec son état
   (complète / à compléter / masquée), les valeurs par portion, les allergènes,
   les filtres et le commutateur Visible/Masquée. Même harnais que le test de
   l'onglet Performance. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

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
new vm.Script(fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8')).runInContext(context);

const H = window.Kiwi.handlers;
H['rmw-tab']({ dataset: { tab: 'nutrition' } });
let html = root.innerHTML;
assert.match(html, /Nutrition et allergènes/, 'titre de l’onglet');
assert.match(html, /1 \/ 4 fiches complètes/, 'progression : une fiche complète visible sur quatre (la masquée ne compte pas comme complète)');
assert.match(html, /512 kcal/, 'valeurs par portion du plat complet');
assert.match(html, />Gluten<\/span><span>Lait<\/span>/, 'allergènes en libellés FR');
assert.match(html, /Incomplet : 2 ingrédient\(s\) à compléter dans Stock/, 'manques dédoublonnés (Amandes compte une fois)');
assert.match(html, /Pas de recette · Ajoutez la recette pour calculer\./, 'plat sans recette');
assert.match(html, /aria-checked="false"[^>]*data-arg="hidden"[^>]*>Masquée</, 'commutateur Masquée sur le plat masqué');
assert.match(html, /aria-checked="true"[^>]*data-arg="done"[^>]*>Visible</, 'commutateur Visible sur le plat complet');
assert.ok(!/rmw-nutri-notice/.test(html), 'pas de bandeau quand la nutrition est allumée');
assert.ok(html.indexOf('data-tab="nutrition"') > 0 && html.indexOf('data-tab="recipes"') < html.indexOf('data-tab="nutrition"'), 'onglet Nutrition juste après Recettes');

H['rmw-nutrition-filter']({}, 'todo');
html = root.innerHTML;
assert.match(html, /Pastilla à compléter/); assert.match(html, /Sans recette/);
assert.ok(!/Tajine complet/.test(html) && !/Soupe masquée/.test(html), 'filtre À compléter : seuls les plats incomplets ou sans recette');

H['rmw-nutrition-hide']({}, 'done');
assert.strictEqual(JSON.stringify(updates.at(-1)), '["done",{"hideNutrition":true}]', 'masquer écrit hideNutrition:true sur l’article');
H['rmw-nutrition-filter']({}, 'hidden');
assert.match(root.innerHTML, /Tajine complet/, 'le plat masqué apparaît sous le filtre Masquées');
H['rmw-nutrition-hide']({}, 'done');
assert.strictEqual(JSON.stringify(updates.at(-1)), '["done",{"hideNutrition":false}]', 'ré-afficher écrit hideNutrition:false');

window.KiwiConfig.features.menuNutrition = false;
H['rmw-nutrition-filter']({}, 'all');
assert.match(root.innerHTML, /rmw-nutri-notice/, 'bandeau opérateur quand la nutrition est coupée, la liste reste');

console.log('restaurant-menu-nutrition-tab-test: 16 controls passed');
