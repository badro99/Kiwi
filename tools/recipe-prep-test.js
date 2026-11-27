#!/usr/bin/env node
/* Kiwi · préparations (sous-recettes) dans les Recettes
 *
 *   node tools/recipe-prep-test.js
 *
 * Une préparation (« Poulet épicé ») est une recette qui ne se vend pas : elle
 * rend une quantité dans une unité (7 kg) et entre comme ingrédient dans les
 * plats (150 g dans un tacos). Ce banc charge les vrais modules
 * (restaurant-units, restaurant-recipes, cost) et vérifie que :
 *   · le coût d'une ligne préparation suit le prix de ses matières ;
 *   · le document `costs` reçoit une ligne { sub, qty } dans l'unité rendue,
 *     ce que cost.js et inventory-consumption.js savent déjà lire ;
 *   · une préparation n'est jamais un plat (pas de nutrition publiée sur la
 *     carte, pas de repli par nom vers elle) ;
 *   · un cycle ne boucle pas, le rattrapage des prix ne boucle pas.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const docs = {};
function makeStore(name) {
  docs[name] = docs[name] || { items: {} };
  return {
    get: () => docs[name],
    update: (fn) => { docs[name] = fn(docs[name]) || docs[name]; return docs[name]; },
    subscribe: () => () => {},
  };
}
docs.costs = { items: {}, ingredients: [], recipes: {}, charges: [], targets: {} };
const now = Date.now();
let stock = [
  { id: 'poulet', name: 'Poulet', unit: 'kg', costPerUnit: 40 },
  { id: 'epices', name: 'Épices', unit: 'kg', costPerUnit: 100 },
  { id: 'tortilla', name: 'Tortilla', unit: 'unité', costPerUnit: 2 },
];
const menuWrites = [];
const context = {
  window: {
    KiwiStore: { define: (name) => makeStore(name) },
    KiwiVenue: { getVenue: () => 'restaurant-1' },
    KiwiRestaurantStock: { items: () => stock },
    KiwiSales: { list: () => [{ id: 's1', ts: now, lines: [{ itemId: 'tacos', name: 'Tacos', qty: 10 }] }] },
    KiwiMenuStore: { items: () => [{ id: 'tacos', name: 'Tacos', price: 30 }], updateItem: (id) => menuWrites.push(String(id)) },
  },
  console,
};
vm.createContext(context);
for (const f of ['assets/restaurant-units.js', 'assets/stock-identity.js', 'assets/cost.js', 'assets/restaurant-recipes.js']) {
  new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f }).runInContext(context);
}
const R = context.window.KiwiRestaurantRecipes;
const C = context.window.KiwiCost;
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass += 1; };
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));  // objets du bac à sable : autre royaume
const eq = (a, b, msg) => { assert.deepStrictEqual(plain(a), b, msg); pass += 1; };

ok(typeof R.newPrepId === 'function' && typeof R.preps === 'function', 'le module expose newPrepId() et preps()');

// Un plat enregistré AVANT sa préparation : incomplet, jamais chiffré à moitié.
const prepId = R.newPrepId();
ok(/^prep:/.test(prepId), 'un identifiant de préparation commence par prep:');
const tacos = { itemName: 'Tacos', portions: 1, ingredients: [
  { recipeId: prepId, name: 'Poulet épicé', qty: 150, unit: 'g' },
  { stockId: 'tortilla', name: 'Tortilla', qty: 1, unit: 'unité' },
] };
R.save('tacos', tacos);
eq(docs.costs.recipes.tacos.status, 'incomplete', 'un plat dont la préparation n’existe pas encore reste incomplet');
eq(R.get('tacos').ingredients[0].recipeId, prepId, 'la ligne garde la préparation qu’elle désigne');

R.save(prepId, { kind: 'prep', itemName: 'Poulet épicé', portions: 7, yieldUnit: 'kg', ingredients: [
  { stockId: 'poulet', name: 'Poulet', qty: 10, unit: 'kg' },
  { stockId: 'epices', name: 'Épices', qty: 200, unit: 'g' },
] });
eq(R.preps().map((p) => p.itemId), [prepId], 'preps() liste la préparation');
eq(R.preps()[0].yieldUnit, 'kg', 'la préparation garde son unité rendue');
ok(!R.all().some((r) => r.itemId === prepId && r.kind !== 'prep'), 'une préparation est marquée comme telle');

const info = R.ingredientInfo({ recipeId: prepId, name: 'Poulet épicé', qty: 150, unit: 'g' });
eq(info.cost, 60, 'coût d’une préparation = (400 + 20) MAD ÷ 7 kg = 60 MAD/kg');
eq(info.lineCost, 9, '150 g de poulet épicé à 60 MAD/kg = 9 MAD');
eq(info.stockUnit, 'kg', 'la ligne se convertit dans l’unité rendue par la préparation');

const m = R.metrics({ id: 'tacos', name: 'Tacos', price: 30 }, R.get('tacos'));
eq(m.costComplete, true, 'le plat avec sa préparation est chiffré');
eq(m.theoreticalCost, 11, 'tacos = 9 MAD de poulet épicé + 2 MAD de tortilla');

const prepDoc = docs.costs.recipes[prepId];
eq(prepDoc && prepDoc.status, 'complete', 'la préparation est recopiée au moteur de coût');
eq(prepDoc.yield, 7, 'son rendement est la quantité obtenue');
const subLine = docs.costs.recipes.tacos.lines.find((l) => l.sub);
ok(subLine, 'le plat porte une ligne sous-recette { sub }');
eq(subLine.sub, prepId, 'la ligne désigne la préparation');
eq(subLine.qty, 0.15, 'quantité exprimée dans l’unité rendue (150 g = 0,15 kg)');
ok(subLine.stockQty == null && !subLine.ing, 'une ligne sous-recette ne porte ni article ni quantité de stock');
eq(docs.costs.recipes.tacos.status, 'complete', 'enregistrer la préparation recopie les plats qui l’utilisent');
eq(C.of({ kind: 'menu', id: 'tacos', name: 'Tacos' }).mad, 11, 'le vrai moteur de coût chiffre le plat à travers la préparation');
eq(C.of({ kind: 'menu', id: 'tacos', name: 'Tacos' }).src, 'recipe', 'la source est la fiche technique');

stock = stock.map((s) => (s.id === 'poulet' ? { ...s, costPerUnit: 50 } : s));
eq(R.metrics({ id: 'tacos', name: 'Tacos', price: 30 }, R.get('tacos')).theoreticalCost, 13.14,
  'le poulet passe à 50 MAD/kg : le tacos suit (0,15 × 520 ÷ 7 + 2)');
stock = stock.map((s) => (s.id === 'poulet' ? { ...s, costPerUnit: 40 } : s));

eq(R.theoreticalUsage('poulet', 'restaurant-1', 7), 2.14, '10 tacos vendus sortent 10 × 0,15 ÷ 7 × 10 kg de poulet cru');
eq(R.theoreticalUsage('epices', 'restaurant-1', 7), 0.04, 'et les épices de la préparation');

ok(!menuWrites.includes(prepId), 'une préparation ne publie jamais de nutrition sur la carte');
eq(R.get('', 'Poulet épicé'), null, 'le repli par nom d’un plat ne tombe jamais sur une préparation');
eq(R.get(prepId).itemName, 'Poulet épicé', 'une préparation se lit par son identifiant');
eq(R.heal(), 0, 'le rattrapage des prix ne réécrit rien en boucle pour une ligne préparation');

const unitInfo = R.ingredientInfo({ recipeId: prepId, name: 'Poulet épicé', qty: 2, unit: 'unité' });
eq(unitInfo.lineCost, null, 'une unité incompatible (2 unités d’une préparation en kg) n’invente pas de coût');

// Cycle : A contient B qui contient A. Rien ne boucle, rien n'est chiffré.
const a = R.newPrepId(), b = R.newPrepId();
ok(a !== b, 'deux identifiants de préparation sont distincts');
R.save(a, { kind: 'prep', itemName: 'Base A', portions: 1, yieldUnit: 'kg', ingredients: [{ recipeId: b, name: 'Base B', qty: 1, unit: 'kg' }] });
R.save(b, { kind: 'prep', itemName: 'Base B', portions: 1, yieldUnit: 'kg', ingredients: [{ recipeId: a, name: 'Base A', qty: 1, unit: 'kg' }] });
eq(R.ingredientInfo({ recipeId: a, name: 'Base A', qty: 1, unit: 'kg' }).cost, null, 'un cycle de préparations ne se chiffre pas');
eq(R.theoreticalUsage('poulet', 'restaurant-1', 7), 2.14, 'un cycle ne casse pas le calcul de consommation');

// La vente d'un tacos sort du stock les matières de la préparation (moteur de la caisse).
new vm.Script(fs.readFileSync('assets/inventory-consumption.js', 'utf8'), { filename: 'inventory-consumption.js' }).runInContext(context);
const out = plain(context.window.KiwiInventoryConsumption.recipeLines('tacos', 1, docs.costs, 0, []));
const moved = Object.fromEntries((out || []).map((x) => [x.itemId, Math.round(x.qty * 1e4) / 1e4]));
eq(moved.poulet, 0.2143, 'un tacos vendu sort 10 kg × 0,15 ÷ 7 = 0,2143 kg de poulet cru');
eq(moved.epices, 0.0043, 'et 0,2 kg × 0,15 ÷ 7 d’épices');
eq(moved.tortilla, 1, 'et sa tortilla');
eq(plain(context.window.KiwiInventoryConsumption.recipeLines(a, 1, docs.costs, 0, [])), null, 'un cycle ne sort rien du stock');
// Une ligne de ticket sans identifiant qui porte le nom d'une préparation n'est pas une vente de préparation.
eq(C.of({ kind: 'menu', name: 'Poulet épicé' }).mad, null, 'le repli par nom du coût ne tombe pas sur une préparation');
const src = fs.readFileSync('assets/inventory-consumption.js', 'utf8');
ok(/function recipeByName[\s\S]{0,400}prep/.test(src), 'le repli par nom du stock écarte les préparations');

// Nutrition : une préparation se déplie en ses matières, à sa part du rendement.
let seenRecipe = null;
context.window.KiwiMenuNutrition = { compute: (r) => { seenRecipe = plain(r); return null; } };
R.nutrition(R.get('tacos'));
const nIng = Object.fromEntries((seenRecipe?.ingredients || []).map((l) => [l.stockId || l.name, Math.round(l.qty * 1e4) / 1e4]));
eq(nIng.poulet, 0.2143, 'la nutrition du tacos voit 0,2143 kg de poulet cru');
eq(nIng.epices, 4.2857, 'et 4,2857 g d’épices (200 g × 0,15 ÷ 7)');
ok(!(seenRecipe?.ingredients || []).some((l) => l.recipeId), 'aucune ligne préparation n’arrive au moteur de nutrition');
delete context.window.KiwiMenuNutrition;

// Rupture : le poulet manque, le tacos est bloqué à travers sa préparation.
ok(R.usesStock(R.get('tacos'), 'poulet'), 'le tacos sort du poulet à travers le poulet épicé');
ok(!R.usesStock(R.get('tacos'), 'inconnu'), 'et pas un article qu’il n’utilise pas');
eq(R.stockFor({ recipeId: prepId, name: 'Poulet' }), null, 'une ligne préparation ne se rattache jamais à un article par son nom');
eq(R.usesStock(R.get(a), 'poulet'), false, 'un cycle ne boucle pas dans la recherche de rupture');

// Supprimer la préparation : le plat redevient incomplet, il ne garde pas un vieux chiffre.
R.remove(prepId);
eq(docs.costs.recipes[prepId], undefined, 'la préparation quitte le moteur de coût');
eq(docs.costs.recipes.tacos.status, 'incomplete', 'le plat qui l’utilisait redevient incomplet');
eq(C.of({ kind: 'menu', id: 'tacos', name: 'Tacos' }).mad, null, 'et se dit « non chiffré »');
ok(!menuWrites.includes(prepId), 'supprimer une préparation ne touche pas la carte');

console.log(`recipe-prep-test · ${pass} contrôles verts`);
