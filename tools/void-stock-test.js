#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU du stock rendu par une vente sortie des livres
 * ---------------------------------------------------------------------------
 * Quand la console opérateur retire une vente d'essai des livres, la caisse qui
 * l'avait encaissée remet sa marchandise en rayon (assets/pos-boutique.js ·
 * reconcileVoids). Trois façons de se tromper, et chacune coûte du stock réel :
 *
 *   · rendre DEUX FOIS. /api/feed renvoie la liste complète des retraits à
 *     CHAQUE sondage — toutes les 90 s. Un compteur mal tenu et l'inventaire
 *     gonfle tout seul, toute la journée.
 *   · ne pas ressortir la marchandise quand la vente est REMISE dans les livres.
 *   · rendre une ligne déjà retournée au comptoir, qui a déjà regagné le stock.
 *
 * On rejoue donc l'algorithme contre le VRAI KiwiBoutiqueCatalog et le VRAI
 * KiwiPosSale.refMatcher — les deux pièces où une erreur se paie en articles.
 * ═════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

/* ── un navigateur de poche ───────────────────────────────────────────────── */
function makeWindow() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i],
  };
  const listeners = {};
  const el = () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {} } });
  const doc = {
    addEventListener: (t, f) => { (listeners[t] || (listeners[t] = [])).push(f); },
    removeEventListener: () => {},
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); return true; },
    visibilityState: 'visible', readyState: 'complete',
    getElementById: () => null, createElement: el, querySelector: () => null, querySelectorAll: () => [],
    head: el(), body: el(),
  };
  const win = {
    localStorage, document: doc,
    addEventListener: () => {}, removeEventListener: () => {},
    KiwiEnv: { isReal: () => true, local: false, hosted: true, demosAllowed: false },
    setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('hors ligne')),
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = (o || {}).detail; } },
    navigator: { userAgent: 'node' },
  };
  win.window = win;
  return win;
}

function load(win, file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout',
    'fetch', 'CustomEvent', 'navigator', 'self', 'console', src);
  fn(win, win.document, win.localStorage, win.setTimeout, win.clearTimeout,
     win.fetch, win.CustomEvent, win.navigator, win, console);
}

const win = makeWindow();
load(win, 'assets/barcode.js');
load(win, 'assets/color-palette.js');
load(win, 'assets/boutique-catalog.js');
load(win, 'assets/pos-sale.js');

const CAT = win.KiwiBoutiqueCatalog;
const KP = win.KiwiPosSale;

console.log('\n── le comparateur de références (KiwiPosSale.refMatcher) ──');
{
  eq(KP.refMatcher([]), null, 'liste vide → null');
  eq(KP.refMatcher(null), null, 'liste absente → null');
  const tag = KP.deviceTag();
  const hit = KP.refMatcher(['T-014-' + tag]);
  ok(hit('T-014-' + tag), 'reconnaît la forme étiquetée telle quelle');
  ok(hit('T-014'), 'reconnaît la forme nue quand le serveur a l’étiquetée');
  ok(!hit('T-015'), 'ne reconnaît pas une autre vente');
  ok(!hit(''), 'référence vide → non');
  const hit2 = KP.refMatcher(['T-020']);
  ok(hit2('T-020-' + tag), 'reconnaît l’étiquetée quand le serveur a la nue');
}

/* ── un magasin avec du vrai stock ────────────────────────────────────────── */
CAT.use('boutique-test');
const cat = CAT.addCategory({ name: 'Jeans' });
const jean = CAT.addProduct({ name: 'Jean noir', categoryId: cat.id, priceMAD: 400, cost: 180 });
const vNoirS = CAT.ensureVariant({ productId: jean.id, colorId: 'noir', size: 'S', stock: 10 }).variant;
const vNoirM = CAT.ensureVariant({ productId: jean.id, colorId: 'noir', size: 'M', stock: 4 }).variant;
const stockOf = (id) => CAT.listVariants(jean.id).find((v) => v.id === id).stock;

/* ── l'algorithme, copié trait pour trait depuis pos-boutique.js ──────────── */
function persistStock(pid, size, color, delta) {
  if (!delta) return;
  const sameSize = (CAT.listVariants(pid) || []).filter((x) => String(x.size) === String(size));
  const fam = (x) => (CAT.colorFamily ? CAT.colorFamily(x) : x.colorId);
  const covers = (x) => (x.stock || 0) >= -delta;
  const v = (delta < 0 && sameSize.find((x) => x.colorId === color && covers(x)))
         || (delta < 0 && sameSize.find((x) => fam(x) === color && covers(x)))
         || sameSize.find((x) => x.colorId === color)
         || sameSize.find((x) => fam(x) === color)
         || sameSize[0];
  if (v) CAT.adjustStock(v.id, delta);
}
function reconcile(SALES, refs) {
  const hit = KP.refMatcher(refs);
  let touched = 0;
  const move = (sale, sign) => {
    (sale.lines || []).forEach((ln) => {
      if (!ln || ln.returned) return;
      persistStock(ln.pid, ln.size, ln.color, sign * (+ln.qty || 0));
    });
  };
  SALES.forEach((sale) => {
    if (!sale || !sale.id) return;
    const out = !!(hit && hit(sale.id));
    if (out === !!sale.voided) return;
    if (out) { move(sale, +1); sale.voided = true; } else { move(sale, -1); sale.voided = false; }
    touched++;
  });
  return touched;
}

const mkSale = (id, lines) => ({ id, at: new Date(), total: 0, lines });

console.log('\n── une vente d’essai sortie des livres rend son stock ──');
{
  const SALES = [mkSale('T-101', [{ pid: jean.id, size: 'S', color: 'noir', qty: 2, returned: false }])];
  persistStock(jean.id, 'S', 'noir', -2);                 // l’encaissement
  eq(stockOf(vNoirS.id), 8, 'la vente a décrémenté');
  eq(reconcile(SALES, ['T-101']), 1, 'une vente traitée');
  eq(stockOf(vNoirS.id), 10, 'le stock est revenu');
  ok(SALES[0].voided === true, 'la vente est marquée sortie');
}

console.log('\n── exactement une fois, quel que soit le nombre de sondages ──');
{
  const SALES = [mkSale('T-102', [{ pid: jean.id, size: 'S', color: 'noir', qty: 3, returned: false }])];
  persistStock(jean.id, 'S', 'noir', -3);
  eq(stockOf(vNoirS.id), 7, 'décrémenté');
  reconcile(SALES, ['T-102']);
  eq(stockOf(vNoirS.id), 10, 'rendu');
  for (let i = 0; i < 25; i++) eq(reconcile(SALES, ['T-102']), 0, 'sondage ' + i + ' : rien à faire');
  eq(stockOf(vNoirS.id), 10, 'vingt-cinq sondages plus tard, toujours 10');
}

console.log('\n── « Remettre » refait sortir la marchandise ──');
{
  const SALES = [mkSale('T-103', [{ pid: jean.id, size: 'M', color: 'noir', qty: 1, returned: false }])];
  persistStock(jean.id, 'M', 'noir', -1);
  eq(stockOf(vNoirM.id), 3, 'vendu');
  reconcile(SALES, ['T-103']);
  eq(stockOf(vNoirM.id), 4, 'sortie des livres → rendu');
  eq(reconcile(SALES, []), 1, 'disparue de la liste → une vente traitée');
  eq(stockOf(vNoirM.id), 3, 'remise dans les livres → repartie');
  ok(SALES[0].voided === false, 'la marque est retombée');
  for (let i = 0; i < 10; i++) reconcile(SALES, []);
  eq(stockOf(vNoirM.id), 3, 'et elle ne repart pas dix fois');
}

console.log('\n── une ligne déjà rendue au comptoir n’est pas rendue deux fois ──');
{
  const SALES = [mkSale('T-104', [
    { pid: jean.id, size: 'S', color: 'noir', qty: 1, returned: true },   // retournée par la cliente
    { pid: jean.id, size: 'M', color: 'noir', qty: 1, returned: false },
  ])];
  const s0 = stockOf(vNoirS.id), m0 = stockOf(vNoirM.id);
  reconcile(SALES, ['T-104']);
  eq(stockOf(vNoirS.id), s0, 'la ligne déjà retournée ne bouge pas');
  eq(stockOf(vNoirM.id), m0 + 1, 'la ligne encore vendue revient');
}

console.log('\n── une vente d’une AUTRE caisse ne fait rien ici ──');
{
  const SALES = [mkSale('T-105', [{ pid: jean.id, size: 'S', color: 'noir', qty: 1, returned: false }])];
  const s0 = stockOf(vNoirS.id);
  eq(reconcile(SALES, ['T-999-XX']), 0, 'référence inconnue de ce journal');
  eq(stockOf(vNoirS.id), s0, 'stock intact');
}

console.log('\n── plusieurs ventes sorties d’un coup ──');
{
  const SALES = [
    mkSale('T-201', [{ pid: jean.id, size: 'S', color: 'noir', qty: 1, returned: false }]),
    mkSale('T-202', [{ pid: jean.id, size: 'M', color: 'noir', qty: 2, returned: false }]),
    mkSale('T-203', [{ pid: jean.id, size: 'S', color: 'noir', qty: 1, returned: false }]),
  ];
  persistStock(jean.id, 'S', 'noir', -1); persistStock(jean.id, 'M', 'noir', -2); persistStock(jean.id, 'S', 'noir', -1);
  const s0 = stockOf(vNoirS.id), m0 = stockOf(vNoirM.id);
  eq(reconcile(SALES, ['T-201', 'T-202']), 2, 'deux ventes traitées, pas trois');
  eq(stockOf(vNoirS.id), s0 + 1, 'seule T-201 a rendu sa taille S');
  eq(stockOf(vNoirM.id), m0 + 2, 'T-202 a rendu ses deux M');
  ok(SALES[2].voided !== true, 'T-203 est restée dans les livres');
}

console.log('\n── le stock rendu est bien celui du serveur, pas d’une projection ──');
{
  const raw = JSON.parse(win.localStorage.getItem('kiwiBoutiqueCatalog:v1:boutique-test'));
  const v = raw.variants.find((x) => x.id === vNoirS.id);
  ok(v && typeof v.stock === 'number', 'la déclinaison est bien persistée');
  eq(v.stock, stockOf(vNoirS.id), 'le disque et la mémoire disent la même chose');
}

console.log(`\n${fail ? '✗' : '✓'} ventes sorties des livres — ${pass} contrôles, ${fail} échec(s)\n`);
process.exit(fail ? 1 : 0);
