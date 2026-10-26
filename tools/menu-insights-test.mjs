#!/usr/bin/env node
import menuWorkspaceSource from './menu-workspace-test-source.cjs';
/* « Analyse du menu » · phase 4 : contribution, estimations, « À faire ».
 *
 *   1. Le vocabulaire : la Performance parle de contribution (prix hors TVA
 *      moins coût matière), jamais de profit ni de bénéfice, en FR, EN, AR.
 *   2. L'estimation d'une fiche Coût simple liée à un plat s'affiche À CÔTÉ
 *      du coût de la recette, jamais à sa place : elle ne change ni la
 *      contribution, ni le quadrant, ni le coût unitaire.
 *   3. « À faire » : chaque constat sort d'un chiffre affiché (ventes sans
 *      coût, écart observé ≥ 15 %, fiche ≠ recette ≥ 15 %, plats populaires à
 *      faible contribution, plats rentables peu commandés, prix de plus de
 *      90 jours) ; un plat sans coût complet n'a ni écart ni quadrant.
 *   4. Option éteinte ou fiches illisibles : aucune estimation, aucun 0. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadCost } = require('./kiwi-cost-harness.js');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra != null ? '\n      ' + String(extra).slice(0, 500) : '')); }
};
console.log('■ Analyse du menu · contribution, « À faire », brouillon de recette (tools/menu-insights-test.mjs)');

/* ── 1 · le vocabulaire ── */
{
  const src = menuWorkspaceSource();
  const keys = ['perfSub', 'grossProfitCalc', 'grossProfitPerItem', 'colProfit', 'colMargin', 'marginMissing', 'quadStarHint', 'quadPlowHint', 'quadPuzzleHint', 'quadDogHint', 'ledgerVatBasis', 'completeRecipesForProfit'];
  const vals = (k) => [...src.matchAll(new RegExp(`^\\s+${k}: '([^']*)'`, 'gm'))].map((m) => m[1]);
  const bad = [];
  keys.forEach((k) => {
    const v = vals(k);
    if (v.length !== 3) bad.push(`${k} ×${v.length}`);
    v.forEach((s) => { if (/profit|bénéfice|marge|margin|ربح|هامش/i.test(s)) bad.push(`${k}: ${s}`); });
  });
  ok(!bad.length, 'Performance : « contribution » dans les trois langues, plus de profit ni de marge', bad.join(' | '));
  ok(vals('colProfit').join('|') === 'Contribution|المساهمة|Contribution', 'la colonne s’appelle Contribution (EN · AR · FR)', vals('colProfit').join('|'));
  const nk = ['estimateLabel', 'estimateStale', 'estimateIncomplete', 'insightsTitle', 'insightsSub', 'insightUncosted', 'insightUncosted1', 'insightObservedGap', 'insightEstimateGap', 'insightPlow', 'insightPuzzle', 'insightStale', 'insightNone', 'insightOpenSheet', 'insightOpenRecipe'];
  const missing = nk.filter((k) => vals(k).length !== 3);
  ok(!missing.length, 'les nouvelles clés existent en EN, AR et FR', missing.join(', '));
  const dash = nk.flatMap(vals).filter((s) => /—/.test(s));
  ok(!dash.length, 'aucun tiret cadratin dans le texte', dash.join(' | '));
}

/* ── 2-4 · la page, rendue ── */
async function boot({ features = { simple_food_cost: true }, sheets = null, status = 200 } = {}) {
  const noop = () => {};
  const roots = { fin: { innerHTML: '' }, menu: { hidden: true, innerHTML: '' }, bc: { innerHTML: '' } };
  const el = () => ({ classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, removeAttribute: noop,
    appendChild: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', style: {}, dataset: {} });
  const document = { readyState: 'complete', body: el(), documentElement: el(), head: el(), addEventListener: noop, createElement: el, getElementById: () => null,
    querySelector: (s) => (s === '[data-finance-root]' ? roots.fin : s === '[data-menu-root]' ? roots.menu : s === '.breadcrumb' ? roots.bc : null), querySelectorAll: () => [] };
  const items = [
    { id: 'tajine', name: 'Tajine', price: 110, catId: 'plats', avail: true },     // recette 40, observé 50
    { id: 'couscous', name: 'Couscous', price: 99, catId: 'plats', avail: true },  // recette 30, observé 31
    { id: 'the', name: 'Thé', price: 22, catId: 'boissons', avail: true },         // coût saisi 3
    { id: 'salade', name: 'Salade', price: 33, catId: 'plats', avail: true },      // sans coût
    { id: 'pastilla', name: 'Pastilla', price: 140, catId: 'plats', avail: true }, // recette 35, jamais vendue
  ];
  const recipes = { tajine: { t: 40, a: 50 }, couscous: { t: 30, a: 31 }, pastilla: { t: 35, a: null } };
  const data = { cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }], items, stations: [], opts: [] };
  const mem = new Map(), wl = {}, fetches = [];
  const win = {
    Kiwi: { handlers: {}, toast: noop, setActivePage: noop, pageShell: noop, modal: noop },
    KiwiVenue: { getVenue: () => 'resto', getVenueData: () => ({ name: 'Resto' }), getCurrentVenueData: () => ({ id: 'resto', slug: 'resto-test', name: 'Resto', type: 'restaurant' }), getVenueType: () => 'restaurant', isCustom: () => true, subscribe: noop },
    KiwiCloudDoc: { currentSlug: () => 'resto-test' },
    KiwiEnv: { isReal: () => true, demosAllowed: false },
    KiwiConfig: { features },
    KiwiI18n: { getLang: () => 'fr' },
    KiwiMenuStore: { data: () => data, items: () => items, subscribe: noop, kitchenId: () => '' },
    KiwiSales: { list: () => salesRows, subscribe: noop },
    KiwiRefunds: { list: () => [] },
    KiwiLive: { status: () => ({ backfillComplete: true }) },
    KiwiRestaurantRecipes: {
      get: (id) => (recipes[id] ? { itemId: id, ingredients: [{}] } : null),
      metrics: (item) => { const r = recipes[item.id]; return r ? { costComplete: true, theoreticalCost: r.t, actualCost: r.a } : { costComplete: false, theoreticalCost: 0, actualCost: null }; },
      inventory: () => [], saves: [], save(id, v) { this.saves.push([id, v]); },
      subscribe: noop,
    },
    addEventListener: (t, fn) => { (wl[t] ||= []).push(fn); },
    dispatchEvent: (e) => { (wl[e.type] || []).forEach((fn) => fn(e)); return true; },
    setTimeout, clearTimeout, console, scrollTo: noop,
  };
  win.window = win;
  let salesRows = [];
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  win.localStorage = localStorage;
  const fetch = async (url) => { fetches.push(url); return { status, json: async () => (status === 200 ? { enabled: true, canEdit: true, sheets: sheets || [] } : { error: 'forbidden' }) }; };
  class CustomEvent { constructor(type) { this.type = type; } }
  const ctx = vm.createContext({ window: win, Kiwi: win.Kiwi, document, navigator: { onLine: true }, fetch, CustomEvent, console, setTimeout, clearTimeout, localStorage, Intl, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900 });
  vm.runInContext(R('assets/day-report.js'), ctx, { filename: 'day-report.js' });
  const DR = win.KiwiDayReport;
  win.KiwiDateRange = { bounds: () => [DR.dayBounds(DR.today()).from, Infinity] };
  loadCost(ctx, { vat: { mode: 'rate', rate: 10, included: true }, costs: { items: { the: { cost: 3 } }, recipes: {}, ingredients: [], charges: [], targets: {} } });
  vm.runInContext(R('assets/restaurant-units.js'), ctx, { filename: 'restaurant-units.js' });
  vm.runInContext(R('assets/simple-food-cost.js'), ctx, { filename: 'simple-food-cost.js' });
  vm.runInContext(menuWorkspaceSource(), ctx, { filename: 'restaurant-menu-workspace.js' });
  vm.runInContext(R('assets/finance.js'), ctx, { filename: 'finance.js' });

  const start = DR.dayBounds(DR.today()).from + 1000;
  const L = (id, name, qty, total) => ({ itemId: id, name, qty, total });
  /* Tajine 6 (populaire), Couscous 1 (rentable), Thé 8 (populaire, faible),
     Salade 2 (sans coût). TVA 10 % incluse. */
  salesRows = [
    { saleId: 's1', ts: start, amount: 660, lines: [L('tajine', 'Tajine', 6, 660)] },
    { saleId: 's2', ts: start + 1e3, amount: 99, lines: [L('couscous', 'Couscous', 1, 99)] },
    { saleId: 's3', ts: start + 2e3, amount: 176, lines: [L('the', 'Thé', 8, 176)] },
    { saleId: 's4', ts: start + 3e3, amount: 66, lines: [L('salade', 'Salade', 2, 66)] },
  ];
  const render = () => { win.KiwiFinance.open('performance'); return roots.fin.innerHTML; };
  return { win, render, fetches, wl };
}
const flush = () => new Promise((r) => setTimeout(r, 5));
const today = new Date().toISOString().slice(0, 10);
const old = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
const sheet = (id, itemId, perPortion, priceDate, extra = {}) => ({
  id, name: 'Fiche ' + itemId, kind: 'sheet', version: 1, archived: false, updatedTs: Date.now(), ...extra,
  data: { name: 'Fiche ' + itemId, kind: 'sheet', menuItemId: itemId, portions: 1, sellingPrice: null, vatIncluded: false, vatRate: null, targetPct: 30,
    lines: [{ id: 'l1', name: 'Tout', type: 'food', packPrice: perPortion, packQty: 1, packUnit: 'kg', useQty: 1000, useUnit: extra.useUnit || 'g', yieldPct: 100, priceDate }] },
});

{
  const sheets = [
    sheet('fc-1', 'tajine', 24, today),            // fiche 24 contre recette 40 : écart −40 %
    sheet('fc-2', 'couscous', 31, old),            // prix de plus de 90 jours
    sheet('fc-3', 'the', 2, today, { kind: 'template' }),   // un modèle ne compte pas
    sheet('fc-4', 'salade', 9, today, { archived: true }),  // archivée : ne compte pas
    sheet('fc-5', 'pastilla', 12, today, { useUnit: 'bouteille' }), // kg → bouteille : inconvertible
  ];
  const B = await boot({ sheets });
  const before = B.render();
  ok(!/data-estimate=/.test(before), 'tant que les fiches ne sont pas lues : aucune estimation affichée, jamais un 0');
  await flush();
  const html = B.render();
  ok(B.fetches.length === 1 && /\/api\/foodcost\?merchant=resto-test/.test(B.fetches[0]), 'les fiches sont lues une fois, pour ce commerce', B.fetches.join(' '));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/data-estimate="tajine"/.test(html) && /Fiche de coût · 24 MAD/.test(text), 'Tajine : l’estimation de la fiche s’affiche', text.slice(0, 300));
  ok(/40 MAD[\s\S]{0,200}?Fiche de coût · 24 MAD/.test(text), 'à CÔTÉ du coût de la recette (40 MAD), pas à sa place');
  ok(/Fiche de coût · 31 MAD · prix de plus de 90 jours/.test(text), 'Couscous : une fiche aux prix de plus de 90 jours le dit');
  ok(/Fiche de coût · fiche incomplète/.test(text) && !/Fiche de coût · 0/.test(text), 'Pastilla : unité inconvertible, « fiche incomplète », jamais 0 MAD');
  ok(!/data-estimate="the"/.test(html) && !/data-estimate="salade"/.test(html), 'un modèle et une fiche archivée ne donnent aucune estimation');

  const ins = B.win.KiwiRestaurantMenuWorkspace.analysis.insights();
  const by = (k) => ins.filter((x) => x.key === k);
  ok(by('uncosted').length === 1 && /66 MAD de ventes sans coût connu \(1 plat\)/.test(by('uncosted')[0].text) && by('uncosted')[0].item === 'salade',
    'ventes sans coût : 66 MAD encaissés (la colonne Ventes), un plat (Salade), avec le lien vers sa recette', JSON.stringify(by('uncosted')));
  ok(by('observed').length === 1 && /Tajine : coût observé 50 MAD, recette 40 MAD \(\+25\u00a0%\)/.test(by('observed')[0].text),
    'écart observé ≥ 15 % : Tajine +25 % ; Couscous (+3 %) n’est pas signalé', JSON.stringify(by('observed')));
  ok(by('estimate').length === 1 && /Tajine : la fiche de coût dit 24 MAD, la recette 40 MAD \(−40\u00a0%\)/.test(by('estimate')[0].text),
    'fiche ≠ recette ≥ 15 % : Tajine −40 %', JSON.stringify(by('estimate')));
  ok(by('stale').length === 1 && /Fiche couscous/.test(by('stale')[0].text), 'prix de plus de 90 jours : la fiche est nommée', JSON.stringify(by('stale')));
  ok(by('plow').length === 1 && /Thé/.test(by('plow')[0].text) && by('puzzle').length === 1 && /Couscous/.test(by('puzzle')[0].text),
    'quadrants : Thé à revoir (populaire, faible contribution), Couscous à mettre en avant', JSON.stringify(ins.map((x) => x.key + ':' + x.text)));
  ok(!ins.some((x) => /Salade/.test(x.text) && x.key !== 'uncosted') && !ins.some((x) => /Pastilla/.test(x.text)),
    'un plat sans coût n’a ni écart ni quadrant ; un plat jamais vendu ne produit aucun constat');
  ok(/<section class="mi-section rmw-perf-insights">/.test(html) && /À faire/.test(text) && /data-insight="uncosted"[\s\S]*?Compléter la recette/.test(html) && /data-insight="observed"[\s\S]*?Ouvrir la recette/.test(html) && /data-insight="stale"[\s\S]*?data-fin-tab="cost"/.test(html),
    '« À faire » est rendu, chaque constat avec son action');

  /* L'estimation ne remplace rien : contribution et quadrants identiques
     avec et sans fiches. */
  const B0 = await boot({ features: {} });
  const html0 = B0.render();
  await flush();
  const html0b = B0.render();
  const strip = (h) => h.slice(h.indexOf('<div class="rmw-performance">')).replace(/<small class="rmw-perf-est"[^>]*>[^<]*<\/small>/g, '').replace(/<section class="mi-section rmw-perf-insights">[\s\S]*?<\/section>/, '');
  ok(strip(html) === strip(html0b), 'sans l’option : le reste de la Performance est identique au caractère près (l’estimation n’entre dans aucun chiffre)');
  ok(B0.fetches.length === 0 && !/data-estimate=/.test(html0 + html0b), 'option éteinte : aucune lecture, aucune estimation');
  const ins0 = B0.win.KiwiRestaurantMenuWorkspace.analysis.insights();
  ok(!ins0.some((x) => x.key === 'estimate' || x.key === 'stale') && ins0.some((x) => x.key === 'observed'), 'option éteinte : les constats des fiches disparaissent, les autres restent');

  const B403 = await boot({ status: 403 });
  B403.render(); await flush(); const h403 = B403.render();
  ok(!/data-estimate=/.test(h403) && B403.fetches.length === 1, 'fiches refusées (pas le propriétaire) : une seule tentative, aucune estimation');
  ok(typeof B.wl['kiwi:simple-food-cost'] === 'object' && B.wl['kiwi:simple-food-cost'].length >= 1, 'la page se redessine quand les fiches changent (kiwi:simple-food-cost)');
}

/* ── 4b · la matrice ── */
{
  const B = await boot({ features: {} });
  const html = B.render();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(!/rmw-perf-matrix|#080b09/.test(html) && /<section class="mi-section rmw-mx" data-mx>/.test(html), 'la matrice est sur la page, sans l’ancien bloc noir');
  const dots = [...html.matchAll(/class="rmw-mx-dot ([a-z]+)[^"]*" style="left:([\d.]+)%;bottom:([\d.]+)%/g)];
  ok(dots.length === 3 && dots.every((d) => +d[2] >= 4 && +d[2] <= 96 && +d[3] >= 5 && +d[3] <= 93), 'trois plats chiffrés, aucun point collé au bord du cadre', JSON.stringify(dots.map((d) => d.slice(1))));
  ok(['Tajine', 'Couscous', 'Thé'].every((n) => new RegExp(`class="rmw-mx-lab[^"]*"[^>]*>${n}<`).test(html)), 'chaque plat est nommé à côté de son point');
  ok(['Tajine', 'Couscous', 'Thé'].every((n) => new RegExp(`data-quad="[a-z]+"[\\s\\S]*?data-arg="[a-z]+">${n}</button>`).test(html)), 'chaque plat est listé dans son quadrant, cliquable vers sa recette');
  ok(/À développer/.test(text) && /À optimiser/.test(text) && /À revoir/.test(text) && !/Plowhorses|Puzzles|Dogs/.test(text), 'quadrants nommés en français, plus de jargon anglais');
  ok(/populaire dès [\d,]+ vendus/.test(text) && /moyenne · [\d,]+ MAD/.test(text) && !/médiane/.test(text), 'les deux seuils (part équitable, contribution moyenne pondérée) sont chiffrés sur la matrice');
  ok(/Calculé sur 3 plats/.test(text), 'la base de calcul est dite (3 plats)');
  ok(!/\d\.\d %/.test(text), 'les pourcentages suivent la langue (virgule en français)', (text.match(/\d\.\d %/) || [''])[0]);
}

/* ── 5 · fiche → brouillon de recette ── */
{
  const B = await boot({});
  const F = B.win.KiwiSimpleFoodCost, W = B.win.KiwiRestaurantMenuWorkspace, RR = B.win.KiwiRestaurantRecipes;
  const d = { name: 'Salade du chef', kind: 'sheet', menuItemId: 'salade', menuItemName: 'Salade', portions: 4, note: 'Dressage froid',
    lines: [
      { id: 'a', name: 'Tomate', type: 'food', packPrice: 12, packQty: 1, packUnit: 'kg', useQty: 400, useUnit: 'g', yieldPct: 80 },
      { id: 'b', name: 'Huile', type: 'food', packPrice: 60, packQty: 1, packUnit: 'L', useQty: 3, useUnit: 'cl', yieldPct: 100 },
      { id: 'c', name: '', type: 'food', packPrice: 5, packQty: 1, packUnit: 'kg', useQty: 10, useUnit: 'g' },
      { id: 'd', name: 'Barquette', type: 'packaging', packPrice: 1, packQty: 1, packUnit: 'unité', useQty: 1, useUnit: 'unité' },
    ] };
  const r = F.recipeSeed(d);
  const ing = r.seed.ingredients;
  ok(ing.length === 2 && ing[0].name === 'Tomate' && ing[0].qty === 500 && ing[0].unit === 'g' && ing[1].qty === 3 && ing[1].unit === 'cl',
    'brouillon : lignes alimentaires nommées seulement, quantité brute (400 g à 80 % → 500 g), unité gardée', JSON.stringify(ing));
  ok(r.packaging === 1 && r.seed.portions === 4 && r.seed.note === 'Dressage froid' && !ing.some((x) => x.stockId), 'emballage compté à part, portions et note reprises, aucun lien de stock inventé');

  /* La question passe par Kiwi.modal (plus de window.confirm) : la fenêtre
     de la question porte data-sfc-ask, l'éditeur de recette non. « Non »
     ferme sans rien faire (Annuler, Échap, le fond). */
  const modals = [], questions = [];
  const stub = () => ({ classList: { add() {} }, addEventListener() {}, querySelector: () => stub(), querySelectorAll: () => [], innerHTML: '', value: '', dataset: {}, focus() {} });
  B.win.Kiwi.modal = (o) => {
    if (/data-sfc-ask/.test(o.foot || '')) {
      const yes = [];
      const q = { o, closed: false, close() { q.closed = true; }, el: { querySelector: (sel) => (/data-sfc-ask="yes"/.test(sel) ? { addEventListener: (t, fn) => yes.push(fn) } : null) } };
      q.answer = (ok) => { if (ok) yes.forEach((fn) => fn()); else q.close(); };
      questions.push(q); return q;
    }
    modals.push(o); return { el: stub(), close() {} };
  };
  let native = 0;
  B.win.confirm = () => { native++; return true; };
  const asked = () => { const q = questions[questions.length - 1]; return q ? q.o.title + ' ' + q.o.body : ''; };
  F._state.draft = d;
  ok(F._toRecipe() === true && questions.length === 1 && modals.length === 0 && /Salade/.test(asked()) && /2 ingrédient/.test(asked()) && /1 ligne\(s\) d’emballage/.test(asked()),
    'la question s’ouvre dans la fenêtre partagée et dit ce qui sera repris ; aucun éditeur avant la réponse', asked());
  ok(/data-sfc-ask="no" data-dismiss data-autofocus>Annuler</.test(questions[0].o.foot) && /Ouvrir le brouillon/.test(questions[0].o.foot), 'Annuler a le focus par défaut, le oui dit ce qu’il fait');
  questions[0].answer(false);
  ok(modals.length === 0 && RR.saves.length === 0, 'Annuler : aucun éditeur ouvert, rien d’écrit');
  F._toRecipe(); questions[1].answer(true);
  ok(modals.length === 1, 'confirmé : l’éditeur de recette s’ouvre');
  const body = modals[0].body || '';
  ok(/data-recipe-draft/.test(body) && /Brouillon, non enregistré/.test(body) && /Salade du chef/.test(body), 'l’éditeur dit « Brouillon, non enregistré » et nomme la fiche');
  ok(/value="Tomate"/.test(body) && /value="500"/.test(body) && /value="Huile"/.test(body) && /data-portions value="4"/.test(body), 'pré-rempli : ingrédients, quantités brutes, portions');
  ok(RR.saves.length === 0, 'rien n’est écrit dans les recettes avant Enregistrer');

  F._state.draft = { ...d, menuItemId: 'tajine', menuItemName: 'Tajine' };
  F._toRecipe();
  ok(/déjà une recette/.test(asked()), 'un plat qui a déjà une recette : la question le dit');
  questions[questions.length - 1].answer(true);
  ok(/La recette actuelle reste en place/.test(modals[modals.length - 1].body), 'et l’éditeur rappelle que la recette actuelle reste en place');
  F._state.draft = { ...d, lines: [d.lines[3]] };
  const n = modals.length, nq = questions.length; F._toRecipe();
  ok(modals.length === n && questions.length === nq && /Aucune ligne alimentaire/.test(F._state.message), 'aucune ligne alimentaire : ni question ni éditeur, le motif est dit');
  ok(native === 0, 'aucune boîte native (window.confirm)');
  F._state.draft = { ...d, menuItemId: '' };
  ok(F._toRecipe() === false, 'fiche liée à aucun plat : pas de brouillon');
}

/* ── wiring ── */
{
  const fin = R('assets/finance.js');
  ok(/addEventListener\('kiwi:simple-food-cost', again\)/.test(fin), 'finance.js écoute le changement des fiches');
  ok(/estimates,/.test(R('assets/simple-food-cost.js')), 'KiwiSimpleFoodCost.estimates est exporté');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} contrôles verts${fail ? `, ${fail} en échec` : ''}`);
process.exit(fail ? 1 : 0);
