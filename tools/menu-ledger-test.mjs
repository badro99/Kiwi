#!/usr/bin/env node
import menuWorkspaceSource from './menu-workspace-test-source.cjs';
/* « Analyse du menu » · phase 0 : un seul moteur de marge.
 *
 * Avant, la vue d'ensemble (KiwiCost.coverage) et la Performance des plats
 * (restaurant-menu-workspace.js) calculaient chacune leur marge : la première
 * comptait les ventes annulées et les règlements reçus deux fois, ignorait
 * les remboursements ; la seconde ignorait la TVA, les coûts forfaitaires et
 * les remises au ticket. Côte à côte sur la même page, elles se seraient
 * contredites. Les deux lisent maintenant KiwiCost.ledger.
 *
 *   1. Le registre : annulation, doublon, remboursement, remise, TVA, frais,
 *      coût gelé, fiche technique, coût forfaitaire, coût inconnu, ligne à 0,
 *      montant absent, fenêtre [from, to).
 *   2. La même période rendue par les deux onglets affiche la même marge. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* Les ventes de banc sont datées de 05:00:01 à 05:05:01 de la journée
 * commerciale en cours : dans les dix premières minutes après la coupure de
 * 05:00 elles seraient encore dans le futur, et la suite échouait chaque
 * matin à cette heure-là. Le bac à sable lit alors l'horloge dix minutes
 * plus tard ; le reste du temps, elle est intacte. */
const benchShift = (() => {
  const d = new Date();
  const since = ((d.getHours() + 19) % 24) * 3600e3 + d.getMinutes() * 60e3 + d.getSeconds() * 1e3 + d.getMilliseconds();
  return since < 600e3 ? 600e3 - since : 0;
})();
class BenchDate extends Date {
  constructor(...args) { if (args.length) super(...args); else super(Date.now() + benchShift); }
  static now() { return Date.now() + benchShift; }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadCost } = require('./kiwi-cost-harness.js');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra != null ? '\n      ' + String(extra).slice(0, 400) : '')); }
};
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.005;
console.log('■ Un seul moteur de marge (tools/menu-ledger-test.mjs)');

/* ── 1 · le registre, seul ── */
function bare(opts) {
  const win = { addEventListener() {}, console, setTimeout };
  win.window = win;
  const ctx = vm.createContext({ window: win, document: { addEventListener() {} }, console, setTimeout, clearTimeout });
  if (opts && opts.menu) win.KiwiMenuStore = { items: () => opts.menu };
  return loadCost(ctx, opts);
}
{
  const C = bare({ costs: { items: { flat: { cost: 4 } }, recipes: {}, ingredients: [], charges: [], targets: {} } });
  const T = 1_000_000;
  const L = C.ledger([
    { saleId: 'a', ts: T + 1, amount: 45, lines: [{ itemId: 'flat', name: 'Thé', qty: 5, total: 50 }] },          // remise 5
    { saleId: 'a', ts: T + 1, amount: 45, lines: [{ itemId: 'flat', name: 'Thé', qty: 5, total: 50 }] },          // même id
    { saleId: 'v', ts: T + 2, amount: 99, void_ts: T + 3, lines: [{ itemId: 'flat', qty: 9, total: 99 }] },      // annulée
    { saleId: 'r', ts: T + 4, amount: -12 },                                                                      // remboursement
    { saleId: 'f', ts: T + 5, amount: 33, lines: [{ itemId: 'flat', name: 'Thé', qty: 3, total: 30 }] },          // frais +3
    { saleId: 'g', ts: T + 6, amount: 20, lines: [{ itemId: 'gel', name: 'Gelé', qty: 2, total: 20, unitCost: 7 }] },
    { saleId: 'u', ts: T + 7, amount: 10, lines: [{ itemId: 'x', name: 'Inconnu', qty: 1, total: 10 }] },
    { saleId: 'z', ts: T + 8, amount: 25, lines: [{ itemId: 'flat', name: 'Thé', qty: 2, total: 25 }, { itemId: 'flat', name: 'Thé (formule)', qty: 1, total: 0 }] },
    { saleId: 'n', ts: T + 9, lines: [{ itemId: 'flat', name: 'Thé', qty: 1, total: 8 }] },                       // sans montant
    { saleId: 'o', ts: T + 10, amount: 0, lines: [{ itemId: 'flat', name: 'Thé', qty: 1, total: 8 }] },            // offert
    { saleId: 'early', ts: T - 1, amount: 500, lines: [{ itemId: 'flat', qty: 50, total: 500 }] },
    { saleId: 'late', ts: T + 100, amount: 500, lines: [{ itemId: 'flat', qty: 50, total: 500 }] },
  ], { from: T, to: T + 100, refunds: [{ saleId: 'r', ts: T + 4, amount: 12 }, { saleId: 'r2', ts: T + 11, amount: 6 }, { saleId: 'r3', ts: T + 200, amount: 70 }] });
  ok(L.grossN === 7 && near(L.gross, 45 + 33 + 20 + 10 + 25 + 8 + 0), 'brut : chaque règlement de la fenêtre une fois (sans montant ⇒ ses lignes ; offert ⇒ 0)', `${L.grossN} · ${L.gross}`);
  ok(L.voidN === 1 && !L.lines.some((x) => x.saleId === 'v'), 'une vente annulée n’entre pas dans les livres');
  ok(L.refundN === 2 && near(L.refunds, 18) && near(L.net, L.gross - 18), 'remboursements : montant négatif et registre KiwiRefunds, comptés une fois, dans la fenêtre seulement', `${L.refundN} · ${L.refunds}`);
  ok(near(L.discounts, 5 + 8), 'remises déclarées : 5 MAD au ticket, 8 MAD offerts', L.discounts);
  const a = L.lines.find((x) => x.saleId === 'a');
  ok(near(a.collected, 45) && near(a.listed, 50), 'une remise au ticket est répartie sur la ligne de CE ticket', JSON.stringify(a && { l: a.listed, c: a.collected }));
  const f = L.lines.find((x) => x.saleId === 'f');
  ok(near(f.collected, 30) && near(L.unitemisedAmt, 3), 'des frais encaissés au-dessus des lignes ne gonflent jamais une ligne, ils sont déclarés à part');
  const g = L.lines.find((x) => x.saleId === 'g');
  ok(g.src === 'frozen' && g.unit === 7 && g.frozen, 'le coût gelé sur la ligne gagne');
  ok(a.src === 'flat' && a.unit === 4 && !a.frozen, 'sinon le coût forfaitaire saisi');
  const u = L.lines.find((x) => x.saleId === 'u');
  ok(u.cost === null && u.unit === null, 'coût inconnu : null, jamais 0');
  const zero = L.lines.find((x) => x.saleId === 'z' && x.collected === 0);
  ok(zero && zero.qty === 1 && zero.cost === null, 'une ligne à 0 MAD (formule) garde sa quantité, sans coût ni CA');
  ok(!L.lines.some((x) => x.saleId === 'early' || x.saleId === 'late'), 'fenêtre [from, to) : rien avant, rien à `to`');
  const S = C.summarize(L);
  ok(near(S.revenueCosted, 45 + 30 + 20 + 25 + 8) && S.missing.length === 1 && S.missing[0].name === 'Inconnu', 'résumé : la part chiffrée et la file « à chiffrer »', JSON.stringify(S.missing));
  ok(S.todayCostQty === 5 + 3 + 2 + 1 && S.costedQty === S.todayCostQty + 2, 'résumé : les unités au coût d’aujourd’hui sont comptées à part des unités gelées', `${S.todayCostQty} / ${S.costedQty}`);

  const injected = C.ledger([{ saleId: 'i', ts: T + 1, amount: 10, lines: [{ itemId: 'flat', qty: 1, total: 10 }] }],
    { from: T, to: T + 100, lineCost: () => ({ mad: 2.5, src: 'recipe' }) });
  ok(injected.lines[0].src === 'recipe' && injected.lines[0].unit === 2.5, 'la fiche technique (lineCost) passe devant le coût forfaitaire');

  const V = bare({ vat: { mode: 'rate', rate: 10, included: true }, costs: { items: { t: { cost: 5 } }, recipes: {}, ingredients: [], charges: [], targets: {} } });
  const VL = V.ledger([{ saleId: 'h', ts: 5, amount: 22, lines: [{ itemId: 't', qty: 2, total: 22 }] }], { from: 0, to: 10 });
  const VS = V.summarize(VL);
  ok(near(VL.lines[0].net, 20) && near(VS.profit, 10) && near(VS.marginPct, 50), 'TVA incluse : la marge se calcule hors TVA (22 TTC → 20 HT, 10 de coût, 50 %)', JSON.stringify({ net: VL.lines[0].net, p: VS.profit, m: VS.marginPct }));

  const dupKey = C.ledger([
    { saleId: 'k1', ts: 7, amount: 10, ref: '9', lines: [{ itemId: 't', qty: 1, total: 10 }] },
    { saleId: 'k2', ts: 7, amount: 10, ref: '9', lines: [{ itemId: 't', qty: 1, total: 10 }] },
  ], { from: 0, to: 10, settlementKey: (s) => `${s.ref}|${s.ts}|${s.amount}` });
  ok(dupKey.grossN === 1 && dupKey.dupN === 1 && near(dupKey.dupAmt, 10), 'même règlement sous deux ids : compté une fois, le doublon est déclaré');

  const cov = C.coverage([{ saleId: 'c', ts: 5, amount: 10, lines: [{ itemId: 'flat', qty: 1, total: 10 }] }, { saleId: 'cv', ts: 6, amount: 10, void_ts: 7, lines: [] }], 0, 10);
  ok(near(cov.revenue, 10) && cov.voidN === 1, 'coverage() est le résumé du registre : une vente annulée n’y compte plus');
}

/* ── 2 · la même période, les deux onglets, la même marge ── */
{
  const noop = () => {};
  const roots = { fin: { innerHTML: '' }, menu: { hidden: true, innerHTML: '' }, bc: { innerHTML: '' } };
  const el = () => ({ classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, removeAttribute: noop,
    appendChild: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '', style: {}, dataset: {} });
  const document = { readyState: 'complete', body: el(), documentElement: el(), head: el(), addEventListener: noop, createElement: el, getElementById: () => null,
    querySelector: (s) => (s === '[data-finance-root]' ? roots.fin : s === '[data-menu-root]' ? roots.menu : s === '.breadcrumb' ? roots.bc : null), querySelectorAll: () => [] };
  const items = [
    { id: 'tajine', name: 'Tajine', price: 110, catId: 'plats', avail: true },   // fiche technique 40
    { id: 'the', name: 'Thé', price: 22, catId: 'boissons', avail: true },       // coût saisi 3
    { id: 'salade', name: 'Salade', price: 33, catId: 'plats', avail: true },    // sans coût
  ];
  const data = { cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }], items, stations: [], opts: [] };
  const mem = new Map();
  const win = {
    Kiwi: { handlers: {}, toast: noop, setActivePage: noop, pageShell: noop, modal: noop },
    KiwiVenue: { getVenue: () => 'resto', getVenueData: () => ({ name: 'Resto' }), getCurrentVenueData: () => ({ id: 'resto', name: 'Resto', type: 'restaurant' }), getVenueType: () => 'restaurant', isCustom: () => true, subscribe: noop },
    KiwiEnv: { isReal: () => true, demosAllowed: false },
    KiwiI18n: { getLang: () => 'fr' },
    KiwiMenuStore: { data: () => data, items: () => items, subscribe: noop, kitchenId: () => '' },
    KiwiSales: { list: () => salesRows, subscribe: noop },
    KiwiRefunds: { list: () => refundRows },
    KiwiLive: { status: () => ({ backfillComplete: true }) },
    KiwiRestaurantRecipes: {
      get: (id) => (id === 'tajine' ? { itemId: id, ingredients: [{}] } : null),
      metrics: () => ({ costComplete: true, theoreticalCost: 40, actualCost: 46 }),
      subscribe: noop,
    },
    addEventListener: noop, setTimeout, clearTimeout, console, scrollTo: noop,
  };
  win.window = win;
  let salesRows = [], refundRows = [];
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  win.localStorage = localStorage;
  const ctx = vm.createContext({ Date: BenchDate, window: win, Kiwi: win.Kiwi, document, console, setTimeout, clearTimeout, localStorage, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900 });
  vm.runInContext(R('assets/day-report.js'), ctx, { filename: 'day-report.js' });
  const DR = win.KiwiDayReport;
  /* La vue d'ensemble lit ses bornes dans KiwiDateRange (journées
     commerciales) ; la Performance dans KiwiDayReport. Mêmes journées. */
  win.KiwiDateRange = { bounds: (p) => { const d = p === 'trenteJours' ? 30 : p === 'septJours' ? 7 : 1; return [DR.dayBounds(DR.shiftDay(DR.today(), -(d - 1))).from, Infinity]; } };
  loadCost(ctx, { vat: { mode: 'rate', rate: 10, included: true }, costs: { items: { the: { cost: 3 } }, recipes: {}, ingredients: [], charges: [], targets: {} } });
  vm.runInContext(menuWorkspaceSource(), ctx, { filename: 'restaurant-menu-workspace.js' });
  vm.runInContext(R('assets/finance.js'), ctx, { filename: 'finance.js' });

  /* Aujourd'hui (journée commerciale) : dans « 7 jours » de la vue d'ensemble
     comme dans les 30 journées de la Performance. */
  const start = DR.dayBounds(DR.today()).from + 1000;
  const L = (id, name, qty, total) => ({ itemId: id, name, qty, total });
  salesRows = [
    { saleId: 's1', ts: start, amount: 264, lines: [L('tajine', 'Tajine', 2, 220), L('the', 'Thé', 2, 44)] },
    { saleId: 's2', ts: start + 60e3, amount: 99, lines: [L('tajine', 'Tajine', 1, 110)] },                  // remise 11
    { saleId: 's3', ts: start + 120e3, amount: 33, lines: [L('salade', 'Salade', 1, 33)] },
    { saleId: 's1', ts: start, amount: 264, lines: [L('tajine', 'Tajine', 2, 220), L('the', 'Thé', 2, 44)] }, // même id
    { saleId: 's4', ts: start + 180e3, amount: 110, void_ts: start + 200e3, lines: [L('tajine', 'Tajine', 1, 110)] },
    { saleId: 's5', ts: start + 240e3, amount: 22, lines: [L('the', 'Thé', 1, 22)] },
  ];
  refundRows = [{ saleId: 'r1', ts: start + 300e3, amount: 22 }];

  /* Attendu, HT (TVA 10 % incluse) :
     Tajine 220 + 99 = 319 TTC → 290 HT, 3 × 40 = 120 de coût → 170
     Thé 44 + 22 = 66 TTC → 60 HT, 3 × 3 = 9 de coût → 51
     Total chiffré 350 HT − 129 = 221 de marge. Salade : à chiffrer. */
  mem.set('kiwiMenuAnalysisTab', 'overview');
  win.Kiwi.handlers['nav-finance']();
  win.KiwiFinance && win.KiwiFinance.render && win.KiwiFinance.render();
  const overview = roots.fin.innerHTML;
  const text = overview.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/Marge brute 221(,00)? MAD/.test(text), 'vue d’ensemble (30 j) : 221 MAD de marge hors TVA', text.slice(0, 600));
  ok(/remises au ticket/.test(text) && /11 MAD/.test(text), 'vue d’ensemble : la remise de 11 MAD est déclarée');
  ok(/22 MAD de remboursements/.test(text), 'vue d’ensemble : le remboursement est déclaré, non réparti par plat');
  ok(/Coûts actuels appliqués aux ventes passées/.test(text), 'vue d’ensemble : coût d’aujourd’hui appliqué au passé, dit');

  win.KiwiFinance.open('performance');
  const perf = roots.fin.innerHTML;
  const ptext = perf.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const kpi = (perf.match(/CONTRIBUTION CALCUL[ÉE]E[^<]*<\/span><b>([^<]+)<\/b>/i) || [])[1];
  ok(kpi && /^221(,00)? MAD$/.test(kpi.trim()), 'Performance (30 journées) : la même contribution, 221 MAD', kpi || ptext.slice(0, 500));
  ok(/data-ledger-gross="418\.00"/.test(perf) && /data-ledger-net="396\.00"/.test(perf), 'Performance : brut 418, net 396 (annulée et doublon exclus, remboursement déduit)', (perf.match(/data-ledger-[a-z]+="[^"]+"/g) || []).join(' '));
  ok(/Tajine[\s\S]{0,400}?Recette · observé 46 MAD/.test(perf), 'Performance : le coût de la fiche technique, le coût observé affiché à côté, jamais à la place');
  ok(/Thé[\s\S]{0,300}?Coût saisi/.test(perf), 'Performance : un coût forfaitaire saisi compte aussi (il était ignoré)');
  ok(/Contribution calculée hors TVA \(10 % incluse/.test(ptext), 'Performance : la base hors TVA est dite');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} contrôles verts${fail ? `, ${fail} en échec` : ''}`);
process.exit(fail ? 1 : 0);
