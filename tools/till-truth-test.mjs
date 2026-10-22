#!/usr/bin/env node
import maisonSource from './pos-maison-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
/* Kiwi · la caisse restaurant dit ce qui est vrai
 *
 *   node tools/till-truth-test.mjs
 *
 * Neuf défauts mesurés au clic, sur une pile locale, dans un vrai navigateur :
 *
 *   1  le fond d'ouverture était présélectionné (500) puis jamais compté
 *   2  « Carte » sans lecteur écrivait la vente toute seule, deux secondes après
 *   3  le Z d'un vrai commerce annonçait « à 2 % de l'objectif » (18 000 inventé)
 *   4  une remise à emporter n'était pas comptée au Z (le panier était déjà vidé)
 *   5  « Moyenne table » était un ticket moyen (CA / transactions)
 *   6  une addition partagée à parts égales comptait le plat entier dans CHAQUE part
 *   7  un plat épuisé (86) disparaissait de la grille au lieu de rester grisé
 *   8  une vente de plat sans recette écrivait « -1 » sur un article fantôme du stock
 *   9  le rapport journalier du patron perdait les 2e, 3e... additions partagées
 *      d'une même journée (identité de vente = libellé « À emporter · part 1 »)
 *      et le Z perdait ses remises au rechargement de la caisse
 *
 * Ce banc tient les contrats par lecture du code livré (le câblage) et, quand
 * c'est possible, par exécution du vrai module (stock, rapport journalier).
 * Il n'est pas branché dans tools/check.js : à l'intégrateur de le faire.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => maisonSource(fs.readFileSync(path.join(ROOT, p), 'utf8'));
let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' · ' + detail : '')); };

const CAISSE = caisseTestSource(R('kiwi-caisse.html'));
const body = (name) => {
  const start = CAISSE.indexOf('\n    function ' + name + '(');
  if (start < 0) return '';
  const next = CAISSE.indexOf('\n    function ', start + 1);
  return CAISSE.slice(start, next < 0 ? CAISSE.length : next);
};

/* 1 · fond d'ouverture */
ok('1 · aucune pastille de fond n\'est présélectionnée dans le gabarit',
  !/class="ci-float-chip is-active"/.test(CAISSE));
ok('1 · un vrai commerce ne peut pas ouvrir sans fond indiqué',
  /if \(!floatChosen\)/.test(body('openService')));
ok('1 · le dernier fond n\'est qu\'un raccourci, pas une valeur d\'office',
  /id="ci-float-last"/.test(CAISSE) && /Dernier fond : /.test(CAISSE));

/* 2 · carte sans lecteur */
const HW = R('assets/caisse-hardware.js');
ok('2 · le matériel dit si « Carte » est une déclaration de TPE externe',
  /externalCardTerminal:\s*function\s*\(\)\s*\{\s*return realTill\(\)/.test(HW));
const openCard = body('openCardModal');
ok('2 · pas de minuteur d\'encaissement automatique sur un TPE externe',
  /if \(externalTerminal\) return;\s*cardSuccessTimer = setTimeout/.test(openCard));
ok('2 · l\'encaissement attend la confirmation du caissier',
  /id="card-confirm"/.test(CAISSE) && /reader\.confirm\.addEventListener\('click'/.test(CAISSE));

/* 3 · objectif */
const closeRender = CAISSE.slice(CAISSE.indexOf("Highlight · objectif d'lyoum progress"));
ok('3 · le Z d\'un vrai commerce n\'invente pas d\'objectif',
  /if \(storeIsReal\(\)\) \{[\s\S]{0,700}encaissés sur ce service[\s\S]{0,200}\} else if \(tot\.revenue >= DAILY_OBJECTIF\)/.test(closeRender));

/* 4 · remise à emporter */
ok('4 · la remise de la vente est comptée même si le panier est déjà vidé',
  /function accountActiveDiscount\(settlementTable, saleDiscount\)/.test(CAISSE)
  && /accountActiveDiscount\(settlementTable, split \? null : discount\)/.test(CAISSE));
ok('4 · un service relu n\'est pas remis à zéro à la saisie du code',
  /if \(!shiftOpenedAt\) \{ shift\.discounts = 0; shift\.discountsCount = 0; shift\.cancels = 0; \}/.test(CAISSE));

/* 5 · libellé */
ok('5 · « Moyenne table » devient « Ticket moyen », traduit', !/>Moyenne table</.test(CAISSE)
  && />Ticket moyen</.test(CAISSE) && /'Ticket moyen': 'Average ticket'/.test(R('assets/caisse-lang.js')));

/* 6 · addition partagée */
ok('6 · chaque part égale compte 1/N de plat au journal',
  /shareDen: splitState\.numParts/.test(CAISSE)
  && /l\.qty = Math\.round\(\(Number\(l\.qty\) \|\| 1\) \/ l\.shareDen \* 1000\) \/ 1000/.test(CAISSE));

/* 7 · 86 */
ok('7 · un plat épuisé reste sur la grille, grisé et non vendable',
  /carteState\.soldOut = allItems\.filter/.test(CAISSE)
  && /menu-item is-86/.test(CAISSE)
  && /menuCard\.classList\.contains\('is-86'\)\) \{ toast\(/.test(CAISSE));

/* 8 · stock : exécution du vrai moteur */
{
  const memory = new Map();
  const localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  const win = { localStorage, KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'amira-cafe' }, addEventListener() {} };
  win.window = win;
  const ctx = vm.createContext({ window: win, localStorage, navigator: { onLine: false }, crypto: globalThis.crypto, console, Date, Math, JSON, Map, Set, Promise,
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {} });
  vm.runInContext(R('assets/inventory-ledger.js'), ctx);
  win.KiwiCost = { doc: () => ({ ingredients: [], recipes: {} }) };
  vm.runInContext(R('assets/inventory-consumption.js'), ctx);
  const I = win.KiwiInventory, C = win.KiwiInventoryConsumption;
  I.ensureOpening('retail-sku-1', 10, {});
  const sale = (ref, lines) => ({ id: ref, ref, time: new Date(1770000000000), amount: 10, method: 'cash', lines });
  C.record(sale('T-1', [{ itemId: 'it_2', name: 'Café noir', qty: 1, total: 12, cat: 'Boissons' }]));
  ok('8 · un plat sans recette n\'écrit aucun mouvement fantôme', I.history('it_2').length === 0 && I.balance('it_2') === 0,
    JSON.stringify(I.history('it_2').map((r) => r.qty)));
  C.record(sale('T-2', [{ itemId: 'retail-sku-1', name: 'Article', qty: 2, total: 20 }]));
  ok('8 · un vrai article de stock sort toujours sa marchandise', I.balance('retail-sku-1') === 8, String(I.balance('retail-sku-1')));
}

/* 9 · rapport journalier : exécution du vrai module */
{
  const memory = new Map();
  const ls = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  ls.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'resto-test', name: 'Resto', type: 'restaurant' }));
  const ctx = vm.createContext({ window: { localStorage: ls, addEventListener: () => {} }, localStorage: ls, Date, Math, JSON, RegExp, Array, Object, String, Number });
  ctx.window.window = ctx.window;
  vm.runInContext(R('assets/day-report.js'), ctx);
  const DR = ctx.window.KiwiDayReport;
  const t0 = Date.parse('2026-10-11T15:00:00Z');
  /* La forme exacte d'une vente du feed du tableau de bord : pas d'id, un saleId
     serveur, et pour une part d'addition partagée une `ref` qui est le libellé. */
  const part = (n, saleId, ts) => ({ ts, amount: 51.67, method: 'cash', label: 'À emporter · part ' + n, ref: 'À emporter · part ' + n, saleId,
    lines: [{ name: 'Tajine poulet · 1/3', baseName: 'Tajine poulet', qty: 0.333, total: 28.33, cat: 'Plats' }] });
  const sales = [part(1, 'sale-a-split-0', t0), part(1, 'sale-b-split-0', t0 + 600000), part(2, 'sale-b-split-1', t0 + 610000)];
  const rep = DR.build({ day: '2026-10-11', sales, store: { slug: 'resto-test', name: 'Resto', type: 'restaurant' } });
  ok('9 · deux additions partagées du même libellé comptent toutes leurs parts', rep.txns === 3, 'txns=' + rep.txns);
  ok('9 · normSale retient l\'identifiant serveur', DR.normSale(sales[0]).id === 'sale-a-split-0');
}
ok('9 · l\'export du rapport ne perd pas non plus ces ventes', /s\.id \|\| s\.saleId \|\| s\.ref/.test(R('assets/day-report-export.js')));

/* 10 · « God Mode » est le nom interne de la console opérateur : le caissier ne
   le voit jamais, un module coupé l'est « pour cet établissement ». */
{
  const strip = (src) => src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['kiwi-caisse.html', 'assets/pos-maison.js']) {
    const hits = (strip(R(f)).match(/[^\n]*God Mode[^\n]*/g) || []).map((l) => l.trim().slice(0, 80));
    ok('10 · aucun « God Mode » montré au caissier dans ' + f, !hits.length, hits.join(' | '));
  }
}

if (fails.length) { console.error('\n✗ ' + fails.length + ' contrôle(s) rouge(s)\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('✓ till-truth: ' + pass + ' contrôles verts');
