#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * COMMERCE DE DÉTAIL · CE QUE L'INVENTAIRE, LES CATÉGORIES ET LES PROMOTIONS AFFIRMENT
 *
 * Mesuré le 2026-10-11 sur le stack local (une boutique et une épicerie
 * créées par l'inscription, produits et variantes saisis, caisse appairée,
 * ventes encaissées, une promotion) :
 *
 * 1. Épicerie (et pharmacie, librairie, fleuriste, autre) : « base partagée
 *    avec la caisse », « disponible en caisse », « créez un produit depuis la
 *    caisse (code 0002) » et « Synchronisé avec la caisse » étaient affichés
 *    alors que seules les caisses boutique et maison lisent ce catalogue. La
 *    décision se prenait sur getVenueType(), qui renvoie « boutique » pour
 *    tous ces métiers ; la bonne clé est le métier (currentTrade()).
 * 2. Un vrai commerçant se voyait indiquer le code de la caisse DE DÉMO.
 * 3. « Valeur du stock » mélangeait le coût des produits chiffrés et le prix
 *    de vente des autres sous un seul libellé.
 * 4. Une promotion sur le rayon « Divers » (produits sans catégorie) ne visait
 *    aucun article : l'article porte son id d'origine, pas '_uncat'.
 * 5. « 1 variantes », « 1 couleurs », « 1 dernières », « 0 pièces » ; un
 *    retour de 14,50 MAD affiché « 15 ».
 * 6. Le pointeur « Marges » renvoyait vers une tuile que la bande retail ne
 *    propose pas ; « Ventes aujourd'hui » des pages métier comptait depuis
 *    minuit du navigateur et non depuis le service de 5 h du commerçant.
 *
 *   node tools/retail-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => readFileSync(path.join(ROOT, f), 'utf8');
/* La section promos / retours se charge à part (assets/pages-pro/boutique-promos-returns.js). */
const PAGES = pagesProSource() + '\n' + rd('assets/pages-pro/boutique-promos-returns.js');
const CATALOG = rd('assets/boutique-catalog.js');
const PROMOS = rd('assets/promos.js');
const BPD = rd('assets/boutique-promos-dashboard.js');
const DR = rd('assets/dateRange.js');
const EXTRA = rd('assets/dashboard-extra.js');
const TW = rd('assets/trade-workspaces.js');
const SOLD = rd('assets/sold-insights.js');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* ── pages-pro.js : les vraies fonctions, dans une fenêtre simulée ──────── */
function pagesCtx({ trade = 'boutique', real = true } = {}) {
  const win = {
    KiwiStoreTemplates: { currentTrade: () => trade },
    KiwiVenue: { isCustom: () => real },
    KiwiEnv: { isReal: () => real },
  };
  const ctx = vm.createContext({ window: win, Math, Number, String, Object });
  vm.runInContext([
    "function _bqxCopy(t){ const tr = t !== undefined ? String(t||'') : win2.KiwiStoreTemplates.currentTrade(); return { trade: tr }; }",
    'var win2 = window;',
    "function _mad(n){ return String(Math.round(n)); }",
    grab(PAGES, 'function _bqxN('),
    grab(PAGES, 'function _bqxTillCode('),
    grab(PAGES, 'function _bqxTillReads('),
    grab(PAGES, 'function _bqxTillHint('),
    // La page parle la langue de l'écran (sans KiwiI18n : le français).
    grab(PAGES, 'function _bqxArCount('),
    PAGES.match(/^const _bqxEnN = .*$/m)[0],
    PAGES.match(/^const _arProducts = .*$/m)[0],
    grab(PAGES, 'const _BQX_INV = {'),
    'const _BQX_PF = { fr: 1, en: 1, ar: 1 };',
    grab(PAGES, 'function _bqxPfLang('),
    grab(PAGES, 'function _bqxPfFill('),
    grab(PAGES, 'function _bqxInvT('),
    grab(PAGES, 'function _bqxShared('),
    grab(PAGES, 'function _bqxStockKPI('),
  ].join('\n'), ctx);
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);

ok('_bqxN : le français met au singulier 0 et 1, pas 2', () => {
  const c = pagesCtx();
  assert.equal(run(c, "_bqxN(0,'variante')"), '0 variante');
  assert.equal(run(c, "_bqxN(1,'variante')"), '1 variante');
  assert.equal(run(c, "_bqxN(2,'variante')"), '2 variantes');
  assert.equal(run(c, "_bqxN(0,'pièce')"), '0 pièce');
});

ok('seules les caisses boutique et maison sont dites partager le catalogue', () => {
  for (const [trade, reads] of [['boutique', true], ['maison', true], ['', true], ['epicerie', false], ['pharmacie', false], ['librairie', false], ['fleuriste', false], ['autre', false]]) {
    const c = pagesCtx({ trade });
    assert.equal(run(c, '_bqxTillReads()'), reads, trade || '(inconnu)');
    assert.equal(run(c, '_bqxShared()'), reads ? ' · base partagée avec la caisse' : '', trade || '(inconnu)');
  }
});

ok('le code de la caisse de démonstration n’est montré qu’à la démo', () => {
  assert.equal(run(pagesCtx({ trade: 'boutique', real: true }), '_bqxTillHint()'), '');
  assert.equal(run(pagesCtx({ trade: 'maison', real: true }), '_bqxTillHint()'), '');
  assert.equal(run(pagesCtx({ trade: 'boutique', real: false }), '_bqxTillHint()'), ' (code 0002)');
  assert.equal(run(pagesCtx({ trade: 'maison', real: false }), '_bqxTillHint()'), ' (code 0017)');
});

ok('les écrans sans caisse partagée ne promettent plus la caisse', () => {
  for (const needle of [
    "Créez votre premier produit ici.",
    "'Un produit archivé sort du catalogue",
    "'De nouveau au catalogue.'",
    "const catTill = _bqxTillReads();",
  ]) assert.ok(PAGES.includes(needle), needle);
  assert.ok(!PAGES.includes('Les couleurs de catégorie apparaissent aussi en caisse'), 'fausse promesse retirée');
  assert.ok(!/getVenueType\?\.\(\) \|\| window\.KiwiConfig\?\.type \|\| ''\)\.toLowerCase\(\)\);\s*\n\s*toast\('Catégorie créée'/.test(PAGES));
});

ok('valeur du stock : trois cas, jamais coût et prix mélangés', () => {
  const c = pagesCtx({ real: true });
  const base = { products: 4, stockValue: 1000, stockCost: 700, stockCostKnown: 400 };
  assert.deepEqual(JSON.parse(JSON.stringify(run(c, `_bqxStockKPI(${JSON.stringify({ ...base, costed: 0 })})`))),
    { amount: 1000, note: ' · au prix de vente, coûts non saisis' });
  const partial = JSON.parse(JSON.stringify(run(c, `_bqxStockKPI(${JSON.stringify({ ...base, costed: 1 })})`)));
  assert.equal(partial.amount, 400);
  assert.equal(partial.note, ' · 1 produit sur 4 au coût d’achat');
  const full = JSON.parse(JSON.stringify(run(c, `_bqxStockKPI(${JSON.stringify({ ...base, costed: 4 })})`)));
  assert.equal(full.amount, 700);
  assert.match(full.note, /potentiel 1000 MAD/);
  // La démo garde le prix de vente, comme avant.
  assert.equal(run(pagesCtx({ real: false }), `_bqxStockKPI(${JSON.stringify({ ...base, costed: 4 })})`).amount, 1000);
});

/* ── boutique-catalog.js : stats() réel ─────────────────────────────────── */
ok('stats() sépare le coût réel (stockCostKnown) du repli sur le prix (stockCost)', () => {
  const ctx = vm.createContext({ Math, Number });
  vm.runInContext(`
    var db = { products: [
      { id: 'a', priceMAD: 100, cost: 40 },
      { id: 'b', priceMAD: 50, cost: 0 },
      { id: 'c', priceMAD: 10, cost: 5, archived: true } ], variants: [{}, {}, {}], categories: [{}] };
    function groupVariants() { return { a: [{ stock: 3 }], b: [{ stock: 2 }, { stock: 1 }], c: [{ stock: 9 }] }; }
    ${grab(CATALOG, 'function stats(')}
  `, ctx);
  const st = vm.runInContext('stats()', ctx);
  assert.equal(st.products, 2);
  assert.equal(st.totalStock, 6);
  assert.equal(st.stockValue, 3 * 100 + 3 * 50);   // 450
  assert.equal(st.stockCost, 3 * 40 + 3 * 50);     // repli prix pour b : 270 (inchangé pour les caisses)
  assert.equal(st.stockCostKnown, 3 * 40);         // 120 : seulement ce qui est chiffré
  assert.equal(st.costed, 1);
});

/* ── promotions : le rayon « Divers » vise bien ses articles ────────────── */
ok('une promotion sur « Divers » vise les articles sans catégorie', () => {
  assert.match(CATALOG, /if \(bucket === uncat\) item\.uncat = true;/);
  const ctx = vm.createContext({ Number, Math, Date });
  vm.runInContext(`
    ${grab(PROMOS, 'function toTs(')}
    ${grab(PROMOS, 'function stockOf(')}
    ${grab(PROMOS, 'function matches(')}
  `, ctx);
  const promo = { scope: { type: 'rayon', ids: ['_uncat'] } };
  const m = (item) => vm.runInContext(`matches(${JSON.stringify(promo)}, ${JSON.stringify(item)}, 0)`, ctx);
  assert.equal(m({ id: 'x', rayon: '', uncat: true }), true);
  assert.equal(m({ id: 'y', rayon: 'cat_deleted', uncat: true }), true);   // catégorie orpheline
  assert.equal(m({ id: 'z', rayon: 'cat_1' }), false);
  const real = { scope: { type: 'rayon', ids: ['cat_1'] } };
  assert.equal(vm.runInContext(`matches(${JSON.stringify(real)}, ${JSON.stringify({ id: 'z', rayon: 'cat_1' })}, 0)`, ctx), true);
});

ok('la page Promotions décide sur le métier, pas sur le type de base', () => {
  const body = grab(BPD, 'function tillApplies(');
  assert.match(body, /currentTrade/);
  assert.ok(!/getVenueType/.test(body.replace(/\/\*[\s\S]*?\*\//g, '')));
  for (const [trade, expected] of [['boutique', true], ['maison', true], ['', true], ['epicerie', false], ['pharmacie', false]]) {
    const ctx = vm.createContext({ window: { KiwiStoreTemplates: { currentTrade: () => trade } }, String });
    vm.runInContext(body, ctx);
    assert.equal(vm.runInContext('tillApplies()', ctx), expected, trade || '(inconnu)');
  }
});

/* ── retours : les centimes ne s'arrondissent plus ──────────────────────── */
ok('un retour de 14,50 MAD ne s’affiche plus « 15 »', () => {
  const m = PAGES.match(/const fmtAmt = \(n\) => (.+);/);
  assert.ok(m, 'fmtAmt présent');
  const fmtMAD = (n, dec) => n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtAmt = vm.runInNewContext(`(fmtMAD) => (n) => ${m[1].replace(/fmtMAD\(n, /, 'fmtMAD(n, ')}`)(fmtMAD);
  assert.match(fmtAmt(14.5), /^14,50$/);
  assert.equal(fmtAmt(240), '240');
  assert.match(fmtAmt(0), /^0$/);
  assert.ok(!/fmtMAD\((r\.amt|sumAmt|creditBalance), 0\)/.test(PAGES));
});

/* ── Accueil / pages métier ─────────────────────────────────────────────── */
ok('« 1 dernière » au singulier dans le flux de l’Accueil', () => {
  assert.match(DR, /\(n < 2 \? 'dernière' : 'dernières'\)/);
});

ok('Marges : le tiroir retail ne renvoie plus vers une tuile absente', () => {
  assert.match(EXTRA, /const retail = \(window\.KiwiVenue\?\.getVenueType\?\.\(\) \|\| ''\) === 'boutique';/);
  assert.match(EXTRA, /Le détail des marges n’est pas encore affiché ici/);
});

ok('« Ventes aujourd’hui » suit le service du commerçant, hors remboursements', () => {
  assert.match(TW, /KiwiDateRange\?\.bounds\?\.\('aujourdhui'\)/);
  assert.match(TW, /String\(s\.kind\|\|''\)!=='refund'/);
});

ok('« Aujourd’hui » ouvert (fin à Infinity) est bien la borne retenue, pas un repli', () => {
  const fn = TW.match(/function businessWindow\(\) \{[\s\S]*?\n  \}/)[0];
  const run = (w) => new Function('window', fn + ';return businessWindow();')(w);
  const b = run({ KiwiDateRange: { bounds: () => [1000, Infinity] }, KiwiDayReport: { businessDay: () => 'x', dayBounds: () => ({ from: 7, to: 9 }) } });
  assert.equal(b.from, 1000);
  assert.equal(b.to, Infinity);
});

ok('Vendus dit qu’il compte les ventes brutes', () => {
  assert.match(SOLD, /ventes brutes, les retours ne sont pas déduits/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
