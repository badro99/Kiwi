#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · un document de coûts amputé se répare tout seul
 *
 *   node tools/recipe-heal-test.js
 *
 * Ce que ce banc défend.
 *
 * Le prix d'achat de chaque matière vit en double : `costPerUnit` sur l'article
 * d'inventaire, et une copie ramenée à l'unité de la recette dans le document
 * de coûts (`ingredients[]`), écrite par mirrorCost() au moment où le
 * commerçant enregistre une fiche technique. La copie a été effacée en
 * production — le fusionneur de assets/cost.js remplaçait le tableau en bloc
 * dès qu'un appareil sans fiches techniques (la caisse ne charge pas ce
 * module) poussait sa version. Le fusionneur est corrigé ; mais un document
 * DÉJÀ amputé le restait, parce que mirrorCost() ne tourne qu'à
 * l'enregistrement d'une fiche. Neuf plats sortaient donc à coût matière nul —
 * en silence, une fiche sans prix rendant `null` et jamais une erreur.
 *
 * heal() recroise les deux sources restées intactes chacune de son côté : la
 * recette porte ses lignes, l'inventaire son costPerUnit. Ce banc CHARGE
 * assets/restaurant-recipes.js et assets/cost.js tels qu'ils sont livrés, monte
 * la scène de production (recettes complètes, inventaire chiffré, document de
 * coûts vidé de ses prix), et vérifie que le prix revient — puis qu'un second
 * passage n'écrit plus rien, sinon deux appareils se renverraient la balle
 * indéfiniment.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };
const near = (a, b) => a != null && Math.abs(a - b) < 1e-9;

/* ── le bac à sable ─────────────────────────────────────────────────────── */
function boot(stockRows) {
  const mem = new Map();
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const noop = () => {};
  const timers = [];
  const win = { addEventListener: noop, console, setTimeout: (fn) => { timers.push(fn); return timers.length; } };
  win.window = win;
  const document = { addEventListener: noop, querySelector: () => null, head: { appendChild: noop },
    createElement: () => ({ style: {} }), body: { classList: { add: noop, remove: noop, contains: () => false } },
    readyState: 'complete' };
  const ctx = vm.createContext({ window: win, document, localStorage, console,
    setTimeout: win.setTimeout, clearTimeout: noop });

  /* KiwiStore réduit à ce que define() promet, PLUS le subscribe(feature, fn)
     global : c'est par lui que restaurant-recipes.js apprend qu'une copie
     serveur vient de se poser, donc qu'il faut repasser. */
  vm.runInContext(`
    window.__v = 'v-test';
    window.__subs = {};
    window.__writes = 0;
    /* Le moteur de venues, réduit à l'identité : c'est par lui que ce module
       résout l'établissement courant (venue()). Sans lui — à la caisse — il ne
       tourne pas du tout, et c'est voulu. */
    window.KiwiVenue = { getVenue: () => window.__v, getCurrentVenueData: () => ({ id: window.__v }) };
    window.KiwiStore = {
      currentVenue: () => window.__v,
      subscribe(feature, fn) {
        (window.__subs[feature] = window.__subs[feature] || []).push(fn);
        return () => {};
      },
      define(feature, opts) {
        const key = () => 'kiwi:' + feature + ':v1:' + window.__v;
        const read = () => { const r = localStorage.getItem(key()); return r ? JSON.parse(r) : opts.blank(); };
        const write = (d) => {
          localStorage.setItem(key(), JSON.stringify(d));
          window.__writes++;
          (window.__subs[feature] || []).forEach(f => f(window.__v));
          return d;
        };
        return { feature, get: read, set: write,
          update(fn) { const d = read(); const n = fn(d); return write(n === undefined ? d : n); },
          subscribe(fn) { return window.KiwiStore.subscribe(feature, fn); }, cloud: () => null };
      }
    };
  `, ctx);

  /* L'inventaire, tel que la page Stock le persiste : le prix d'achat s'appelle
     costPerUnit, la quantité currentStock. */
  vm.runInContext('window.KiwiRestaurantStock = { rows: () => ' + JSON.stringify(stockRows)
    + ', items: () => ' + JSON.stringify(stockRows) + ', theoreticalUsage: () => 0 };', ctx);

  vm.runInContext(R('assets/restaurant-units.js'), ctx, { filename: 'restaurant-units.js' });
  vm.runInContext(R('assets/cost.js'), ctx, { filename: 'cost.js' });
  vm.runInContext(R('assets/restaurant-recipes.js'), ctx, { filename: 'restaurant-recipes.js' });
  const flush = () => { while (timers.length) { const fn = timers.shift(); fn(); } };
  flush();
  return { win, ctx, flush, key: (f) => 'kiwi:' + f + ':v1:v-test',
    doc: (f) => JSON.parse(localStorage.getItem('kiwi:' + f + ':v1:v-test') || 'null'),
    put: (f, d) => localStorage.setItem('kiwi:' + f + ':v1:v-test', JSON.stringify(d)) };
}

/* ── la scène : deux matières chiffrées, une fiche technique, zéro prix ──── */
const STOCK = [
  { id: 'usr-am01', name: 'Poulet fermier', unit: 'kg', costPerUnit: 62, currentStock: 18 },
  { id: 'usr-am05', name: 'Tomates', unit: 'kg', costPerUnit: 9, currentStock: 24 },
  /* Une matière que l'inventaire ne chiffre pas : elle ne doit JAMAIS produire
     un prix inventé, et elle ne doit pas non plus provoquer une réécriture à
     chaque notification. */
  { id: 'usr-am09', name: 'Persil', unit: 'botte', currentStock: 12 },
];
const RECIPE = {
  itemId: 'it_3', itemName: 'Tajine poulet citron', portions: 1,
  ingredients: [
    { stockId: 'usr-am01', name: 'Poulet fermier', qty: 260, unit: 'g' },
    { stockId: 'usr-am05', name: 'Tomates', qty: 150, unit: 'g' },
    { stockId: 'usr-am09', name: 'Persil', qty: 1, unit: 'botte' },
  ],
  steps: [], note: '',
};

const env = boot(STOCK);
const RR = env.win.KiwiRestaurantRecipes;
const COST = env.win.KiwiCost;
ok('le module se charge', !!RR && !!COST);

/* On enregistre la fiche comme le commerçant l'aurait fait au tableau de bord :
   mirrorCost() chiffre les ingrédients au passage. */
RR.save('it_3', RECIPE);
env.flush();
let costs = env.doc('costs');
const ingOf = (d, id) => (d.ingredients || []).find((x) => x.id === id) || null;
ok('mirrorCost chiffre à l\'enregistrement', (costs.ingredients || []).length === 3,
  'ingredients=' + JSON.stringify((costs.ingredients || []).map((x) => x.id)));
ok('· le prix suit l\'unité de la recette (62 MAD/kg → 0,062 MAD/g)',
  near(ingOf(costs, 'stock:usr-am01')?.useCost, 0.062),
  'useCost=' + ingOf(costs, 'stock:usr-am01')?.useCost);
ok('· une matière non chiffrée reste sans prix, jamais à zéro',
  ingOf(costs, 'stock:usr-am09') && ingOf(costs, 'stock:usr-am09').useCost == null);

/* ── l'amputation, telle que la production l'a subie ────────────────────── */
const amputed = JSON.parse(JSON.stringify(costs));
amputed.ingredients = [];
env.put('costs', amputed);
ok('la scène est bien celle de la production : recettes intactes, prix effacés',
  Object.keys(env.doc('costs').recipes || {}).length === 1 && env.doc('costs').ingredients.length === 0);

const healed = RR.heal();
costs = env.doc('costs');
ok('heal() répare la fiche amputée', healed === 1, 'fiches réparées=' + healed);
ok('· les deux prix connus de l\'inventaire reviennent',
  near(ingOf(costs, 'stock:usr-am01')?.useCost, 0.062) && near(ingOf(costs, 'stock:usr-am05')?.useCost, 0.009),
  JSON.stringify((costs.ingredients || []).map((x) => [x.id, x.useCost])));
ok('· la recette n\'est pas perdue au passage',
  costs.recipes && costs.recipes.it_3 && (costs.recipes.it_3.lines || []).length === 3
    && costs.recipes.it_3.lines[0].stockQty === 0.26,
  JSON.stringify(costs.recipes && costs.recipes.it_3 && costs.recipes.it_3.lines));

/* Le seul vrai risque du rattrapage : une matière que mirrorCost() ne peut pas
   chiffrer resterait un écart permanent, et heal() réécrirait le même null à
   chaque notification — deux appareils se renvoyant la balle à l'infini. */
const writesBefore = env.win.__writes;
const again = RR.heal();
ok('un second passage n\'écrit rien', again === 0 && env.win.__writes === writesBefore,
  'réparées=' + again + ' écritures=' + (env.win.__writes - writesBefore));

/* Et il ne doit pas non plus réparer ce qui n'est pas cassé : un document
   complet reste tel quel. */
const flushed = env.flush();
ok('les notifications ne déclenchent pas d\'écriture sur un document sain',
  env.win.__writes === writesBefore, 'écritures=' + (env.win.__writes - writesBefore));

/* ── un prix révisé à l'inventaire ne doit pas être écrasé par heal() ───── */
const bumped = env.doc('costs');
bumped.ingredients = bumped.ingredients.map((x) => (x.id === 'stock:usr-am01' ? { ...x, useCost: 0.07, at: Date.now() } : x));
env.put('costs', bumped);
RR.heal();
ok('heal() ne touche pas à un prix déjà présent',
  near(ingOf(env.doc('costs'), 'stock:usr-am01')?.useCost, 0.07),
  'useCost=' + ingOf(env.doc('costs'), 'stock:usr-am01')?.useCost);

/* ── verdict ────────────────────────────────────────────────────────────── */
console.log('\n' + (fails.length ? '✗' : '✓') + ' ' + pass + '/' + (pass + fails.length) + ' contrôles');
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
