#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * STOCK & FICHES TECHNIQUES · CE QUE LE STOCK ET LA CAISSE AFFIRMENT
 *
 * Mesuré le 2026-10-11 sur le stack local (un article « Lait », 10 L à
 * 9 MAD/L, une fiche « Café crème » à 0,15 puis 0,2 L, trois ventes) :
 *
 * 1. La caisse n'ouvrait le document des fiches (`costs`) qu'à la première
 *    vente : sans copie locale, cette vente partait avec une copie vide et ne
 *    sortait aucun lait du stock.
 * 2. L'usage théorique cherchait `line.id` sur des lignes qui portent
 *    `itemId` : un café crème vendu « (Lait entier) » n'existait pas, et la
 *    carte en comptait un sur trois.
 * 3. « Ratio coût matière : 15,7 % » pour 3,6 % réels : une semaine
 *    extrapolée à un mois, comparée aux ventes réelles de 30 jours.
 * 4. « 1 articles en stock », « paiement T+15 à T+30 sur la majorité » écrit
 *    pour un commerçant qui n'a aucun fournisseur, une courbe de tendance
 *    dessinée sans historique, et un coût matière qui « bougeait » de ±0,5 %
 *    sur une minuterie.
 * 5. Accueil : « 2 articles sont au-dessus de son seuil ».
 *
 *   node tools/stock-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOCK = readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');
const RECIPES = readFileSync(path.join(ROOT, 'assets/restaurant-recipes.js'), 'utf8');
const CAISSE = readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const DR = readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');

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

ok('la caisse ouvre les fiches techniques au démarrage et à l’appairage, pas à la première vente', () => {
  const body = grab(CAISSE, 'function bindRecipes(');
  assert.match(body, /window\.KiwiCost\.store\.get\(\)/);
  assert.match(CAISSE, /if \(document\.readyState === 'loading'\) document\.addEventListener\('DOMContentLoaded', bindRecipes\);/);
  assert.match(CAISSE, /document\.addEventListener\('kiwi-paired', bindRecipes\);/);
});

/* The recipe engine's own sales counter, run on the till's real line shape. */
const now = Date.now();
const SALES = [
  { ts: now - 3600e3, lines: [{ itemId: 'it_2', name: "Café crème (Lait d'avoine)", qty: 1 }] },
  { ts: now - 1800e3, lines: [{ itemId: 'it_2', name: 'Café crème (Lait entier)', qty: 2 }] },
  { ts: now - 60e3, lines: [{ itemId: 'it_2', name: 'Café crème', qty: 1 }, { itemId: 'it_9', name: 'Café crème', qty: 5 }] },
  { ts: now - 60e3, lines: [{ name: 'Café crème', qty: 1 }] },                       // legacy row, no id: by name
  { ts: now - 10 * 864e5, lines: [{ itemId: 'it_2', name: 'Café crème', qty: 7 }] },  // outside the week
];
const ctx = vm.createContext({ window: { KiwiSales: { list: () => SALES } }, Date, Math, Number, String });
vm.runInContext([
  "const clean = (v) => String(v == null ? '' : v).trim();",
  "const norm = (v) => clean(v).toLocaleLowerCase('fr').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');",
  "const number = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };",
  "const venue = (id) => id || 'v1';",
  grab(RECIPES, 'function salesFor('),
  'this.salesFor = salesFor;',
].join('\n'), ctx);
ok('un plat vendu avec une option compte dans l’usage théorique', () => {
  // 1 + 2 + 1 by id, + 1 legacy by name; it_9 shares the name but is another dish
  assert.equal(ctx.salesFor('it_2', 'Café crème', 'v1', 7), 5);
});

ok('coût matière et ventes sur la même semaine chez un vrai commerçant', () => {
  assert.match(grab(STOCK, 'function weeklyRevenue('), /to - 7 \* 864e5, to/);
  assert.match(STOCK, /const costWeek = !costKnown \? null : stShowReal\(\) \? costMonth \/ 4\.33 : costMonth \/ 4;/);
  assert.match(STOCK, /stShowReal\(\) \? \(wRev > 0 \? \(costWeek \/ wRev\) \* 100 : null\)/);
  assert.ok(!/Standard restauration marocaine/.test(STOCK), 'no invented "Moroccan standard"');
});
ok('un coût matière inconnu s’affiche « · », jamais « 0 MAD · ratio 0,0 % »', () => {
  assert.match(STOCK, /const costKnown = !stShowReal\(\) \|\| costMonth > 0;/);
  assert.match(STOCK, /kpiCostNone: 'Aucun coût matière connu'/);
});
ok('le coût matière d’un vrai commerce ne bouge pas sur une minuterie', () => {
  assert.match(grab(STOCK, 'function tickFoodCost('), /if \(stShowReal\(\)\) return;/);
});
ok('pas de courbe de tendance sans historique', () => {
  assert.match(STOCK, /const trendBars = stShowReal\(\) \? '' :/);
});
ok('accords et fournisseurs : rien d’inventé', () => {
  assert.match(STOCK, /kpiValueSub: \(n\) => `\$\{n\} \$\{n > 1 \? 'articles' : 'article'\} en stock`/);
  assert.match(STOCK, /supSub: \(n\) => `\$\{n\} \$\{n > 1 \? 'fournisseurs actifs' : 'fournisseur actif'\}`/);
  assert.ok(!/T\+15/.test(STOCK), 'no invented payment terms');
});
ok('accueil : « 1 article est au-dessus de son seuil », « 2 articles … de leur seuil »', () => {
  const c = vm.createContext({});
  vm.runInContext(grab(DR, 'const STOCK_OK_STR = {') + '\nthis.S = STOCK_OK_STR;', c);
  assert.equal(c.S.fr(1), 'Rien à recommander : 1 article est au-dessus de son seuil configuré.');
  assert.equal(c.S.fr(2), 'Rien à recommander : 2 articles sont au-dessus de leur seuil configuré.');
  assert.equal(c.S.en(1), 'Nothing to reorder: 1 item is above its configured threshold.');
});

console.log(`\nstock-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
