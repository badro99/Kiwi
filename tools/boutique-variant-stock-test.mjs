#!/usr/bin/env node
/* Kiwi · une vente ne peut consommer que produit × taille × couleur choisie. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (value, message) => {
  if (!value) { console.error('  ✗ ' + message); process.exitCode = 1; }
  else passed++;
};
const eq = (actual, expected, message) => ok(actual === expected,
  `${message} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);

function browser() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i],
  };
  const node = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} });
  const document = {
    addEventListener() {}, dispatchEvent() {}, createElement: node,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    head: node(), body: node(),
  };
  const window = {
    document, localStorage, addEventListener() {}, removeEventListener() {},
    KiwiEnv: { isReal: () => false, local: true, hosted: false, demosAllowed: true },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = (opts || {}).detail; } },
    navigator: { userAgent: 'node' }, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error('offline test')),
  };
  window.window = window;
  return window;
}

function load(win, rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const run = new Function('window', 'document', 'localStorage', 'CustomEvent', 'navigator',
    'setTimeout', 'clearTimeout', 'fetch', 'self', 'console', src);
  run(win, win.document, win.localStorage, win.CustomEvent, win.navigator,
    win.setTimeout, win.clearTimeout, win.fetch, win, console);
}

const win = browser();
load(win, 'assets/barcode.js');
load(win, 'assets/color-palette.js');
load(win, 'assets/boutique-catalog.js');
const C = win.KiwiBoutiqueCatalog;
const product = C.addProduct({ name: 'Polo Stretch test', priceMAD: 400 });
const blackS = C.addVariant({ productId: product.id, colorId: 'noir', size: 'S', stock: 0 });
const whiteS = C.addVariant({ productId: product.id, colorId: 'blanc', size: 'S', stock: 6 });
C.addVariant({ productId: product.id, colorId: 'noir', size: 'M', stock: 2 });
C.addVariant({ productId: product.id, colorId: 'nuit', size: 'L', stock: 1 });
C.addVariant({ productId: product.id, colorId: 'bleu', size: 'L', stock: 2 });

eq(C.compat().P[product.id].sizes.S, 6, 'la carte produit peut garder le total de S toutes couleurs');
eq(C.variantStock(product.id, 'S', 'noir'), 0, 'le modal lit zéro pour le S noir');
eq(C.variantStock(product.id, 'S', 'blanc'), 6, 'le modal lit six pour le S blanc');
eq(C.variantStock(product.id, 'M', 'noir'), 2, 'le M noir reste indépendant');
eq(C.variantStock(product.id, 'L', 'bleu'), 3, 'les tons d’une même famille sont additionnés');
eq(C.adjustVariantStock(product.id, 'S', 'noir', -1), false, 'une vente S noir épuisée est refusée');
eq(C.listVariants(product.id).find((v) => v.id === whiteS.id).stock, 6,
  'le refus ne prélève jamais une pièce blanche');

C.setStock(blackS.id, 2);
eq(C.adjustVariantStock(product.id, 'S', 'noir', -2), true, 'deux S noirs disponibles peuvent être vendus');
eq(C.variantStock(product.id, 'S', 'noir'), 0, 'la déclinaison noire atteint zéro');
eq(C.variantStock(product.id, 'S', 'blanc'), 6, 'la déclinaison blanche reste intacte après la vente noire');
eq(C.adjustVariantStock(product.id, 'L', 'bleu', -4), false, 'une famille refuse une quantité supérieure à son total');
eq(C.variantStock(product.id, 'L', 'bleu'), 3, 'un refus ne décrémente aucune déclinaison à moitié');
eq(C.adjustVariantStock(product.id, 'L', 'bleu', -3), true, 'une famille peut vider plusieurs tons sans changer de couleur');
eq(C.variantStock(product.id, 'L', 'bleu'), 0, 'les trois pièces bleues ont été décrémentées');

const pos = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');
ok(pos.includes('availableStock(pid, cfg.size, cfg.color, state.ticket)'),
  'l’ajout au ticket vérifie couleur × taille');
ok(pos.includes('const stockIssue = ticketStockIssue(t);'),
  'le checkout revalide le stock avant le paiement');
ok(pos.includes('const st = availableStock(p.id, s, sheet.color);'),
  'les nombres du modal suivent la couleur sélectionnée');
ok(!pos.includes('const st = p.sizes[s];'),
  'le modal n’affiche plus le total toutes couleurs');

if (!process.exitCode) console.log(`✓ stock boutique par déclinaison : ${passed} contrôles`);
