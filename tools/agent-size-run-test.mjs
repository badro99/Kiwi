#!/usr/bin/env node
/* L'assortiment d'une étiquette de carton devient une réception de stock, sur
 * le VRAI catalogue boutique : rien n'est écrit avant apply(), une référence
 * déjà au catalogue reçoit du stock au lieu d'être créée en double, un prix
 * absent n'est jamais un article gratuit. (assets/agent-size-run.mjs) */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import retailSource from './pos-retail-test-source.cjs';
import { cleanRun, kindOf, findProducts, plan, apply, readRun } from '../assets/agent-size-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (value, message) => { if (!value) { console.error('  ✗ ' + message); process.exitCode = 1; } else passed++; };
const eq = (actual, expected, message) => ok(JSON.stringify(actual) === JSON.stringify(expected),
  `${message} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);

/* 22 nov. 2026, vraie lecture du modèle sur une étiquette « SIZE: 36-41 · 12 PRS »
 * sans quantité par taille : il a rendu UNE ligne « 36-41 × 12 ». Reçue telle
 * quelle, elle créait une taille « 36-41 » de 12 paires. Une plage devient ses
 * tailles, sans quantité inventée : le commerçant les tape. */
eq(readRun([{ size: '36-41', qty: 12 }]), { rows: [], sizes: ['36', '37', '38', '39', '40', '41'] }, 'une plage de pointures devient ses tailles, quantités à saisir');
eq(readRun([{ size: '36 à 41', qty: 12 }]).sizes, ['36', '37', '38', '39', '40', '41'], 'plage écrite « à »');
eq(readRun([{ size: '38 to 40', qty: 6 }]).sizes, ['38', '39', '40'], 'plage écrite « to »');
eq(readRun([{ size: 'S-XL', qty: 10 }]).sizes, ['S', 'M', 'L', 'XL'], 'plage de tailles en lettres');
eq(readRun([{ size: '36', qty: 1 }, { size: '37', qty: 2 }]), { rows: [{ size: '36', qty: 1 }, { size: '37', qty: 2 }], sizes: [] }, 'un assortiment normal ne change pas');
eq(readRun([{ size: '41-36', qty: 3 }]).sizes, [], 'une plage à l\'envers n\'est pas devinée');
eq(readRun([{ size: '1-90', qty: 3 }]).sizes, [], 'une plage démesurée n\'est pas dépliée');
eq(readRun([]), { rows: [], sizes: [] }, 'rien lu, rien inventé');
eq(readRun([], ['36', '37', '36', '']), { rows: [], sizes: ['36', '37'] }, 'lecture incertaine : les tailles seules, sans quantité');
eq(readRun([{ size: '38', qty: 2 }], ['36']), { rows: [{ size: '38', qty: 2 }], sizes: [] }, 'un assortiment lu passe avant les tailles seules');
/* Même jour : « SIZE: ASSORTED · QTY 24 » lu comme une taille « ASSORTED » de 24. */
for (const word of ['ASSORTED', 'Assorti', 'assortis', 'MIXED', 'Mix', 'ASST', 'Varié', 'Divers'])
  eq(readRun([{ size: word, qty: 24 }]), { rows: [], sizes: [] }, `« ${word} » n'est pas une taille : tailles à saisir`);
eq(readRun([{ size: 'TU', qty: 5 }]).rows, [{ size: 'TU', qty: 5 }], 'taille unique reste une taille');

/* Les quatre scripts du catalogue, lus une fois ; chaque boutique les exécute. */
const CATALOG_SCRIPTS = ['assets/barcode.js', 'assets/color-palette.js', 'assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js']
  .map((rel) => retailSource(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
function shop() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => Array.from(store.keys())[i],
  };
  const node = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} });
  const document = { addEventListener() {}, dispatchEvent() {}, createElement: node, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], head: node(), body: node(), readyState: 'complete' };
  const window = {
    document, localStorage, addEventListener() {}, removeEventListener() {},
    KiwiEnv: { isReal: () => false, local: true, hosted: false, demosAllowed: true },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = (opts || {}).detail; } },
    navigator: { userAgent: 'node' }, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('offline test')),
  };
  window.window = window;
  for (const src of CATALOG_SCRIPTS) {
    new Function('window', 'document', 'localStorage', 'CustomEvent', 'navigator', 'setTimeout', 'clearTimeout', 'fetch', 'self', 'console', src)(
      window, document, localStorage, window.CustomEvent, window.navigator, setTimeout, clearTimeout, window.fetch, window, console);
  }
  return { cat: window.KiwiBoutiqueCatalog, colors: window.KiwiColors };
}
const RUN = [['36', 1], ['37', 2], ['38', 3], ['39', 3], ['40', 2], ['41', 1]].map(([size, qty]) => ({ size, qty }));
const stockOf = (cat, pid) => Object.fromEntries(cat.listVariants(pid).map((v) => [v.size, v.stock]));

/* ── les petites règles ─────────────────────────────────────────────────── */
eq(cleanRun([{ size: ' 36 ', qty: '1' }, { size: '37', qty: 2.5 }, { size: '', qty: 1 }, { size: '36', qty: 4 }, { size: '38', qty: -1 }]),
  [{ size: '36', qty: 1 }], 'une ligne fractionnaire, vide, négative ou en double ne passe pas');
eq([kindOf(RUN), kindOf([{ size: 'M', qty: 1 }, { size: 'L', qty: 1 }]), kindOf([{ size: 'TU', qty: 4 }])],
  ['pointure', 'taille', 'tu'], 'pointures, tailles, taille unique');

/* ── 1 · un article neuf : rien d'écrit avant apply, prix obligatoire ───── */
{
  const { cat, colors } = shop();
  const before = cat.listProducts({ includeArchived: true }).length;
  eq(findProducts(cat, '1986-10').length, 0, 'la référence est inconnue du catalogue');
  const noPrice = plan(cat, { productId: '', name: '1986-10 Khaki', price: '', color: 'KHAKI', cartons: 1, rows: RUN }, colors);
  eq([noPrice.ok, noPrice.error], [false, 'price'], 'sans prix de vente, pas de réception : un prix absent n’est pas un article gratuit');
  eq(plan(cat, { productId: '', name: ' ', price: '450', color: 'KHAKI', cartons: 1, rows: RUN }, colors).error, 'name', 'un article neuf a un nom');
  eq(plan(cat, { productId: '', name: 'X', price: '450', color: 'KHAKI', cartons: 0, rows: RUN }, colors).error, 'cartons', 'zéro carton n’est pas une réception');
  eq(plan(cat, { productId: '', name: 'X', price: '450', color: 'KHAKI', cartons: 1.5, rows: RUN }, colors).error, 'cartons', 'un demi-carton non plus');
  eq(plan(cat, { productId: '', name: 'X', price: '450', color: 'KHAKI', cartons: 1, rows: RUN.map((r) => ({ size: r.size, qty: 0 })) }, colors).error, 'empty', 'zéro pièce n’est pas une réception');
  eq(plan(cat, { productId: '', name: 'X', price: '450', cost: 'abc', color: 'KHAKI', cartons: 1, rows: RUN }, colors).error, 'cost', 'un coût illisible est refusé, pas remis à zéro');

  const p = plan(cat, { productId: '', name: '1986-10 Khaki', price: '450,50', cost: '210', color: 'KHAKI', cartons: 2, rows: RUN }, colors);
  ok(p.ok && p.productId === null, 'le plan annonce une création');
  eq([p.total, p.priceMAD, p.cost, p.kind], [24, 450.5, 210, 'pointure'], 'deux cartons : 24 paires, prix avec virgule, coût, pointures');
  eq(p.lines.map((l) => [l.size, l.qty, l.before, l.after]), RUN.map((r) => [r.size, r.qty * 2, 0, r.qty * 2]), 'chaque pointure, avant et après');
  eq(cat.listProducts({ includeArchived: true }).length, before, 'préparer le plan n’écrit rien au catalogue');
  const ten = plan(cat, { productId: '', name: 'X', price: '450', color: 'KHAKI', cartons: '10', rows: RUN }, colors);
  eq([ten.total, ten.lines.map((l) => l.qty)], [120, [10, 20, 30, 30, 20, 10]], 'une photo, dix cartons : chaque pointure ×10');
  eq(plan(cat, { productId: '', name: 'X', price: '450', color: 'KHAKI', cartons: 501, rows: RUN }, colors).error, 'cartons', 'au-delà de 500 cartons, c’est une faute de frappe');

  const done = apply(cat, p);
  ok(done.ok && done.received === 24 && done.failed.length === 0, 'la réception écrit les 24 paires');
  const made = cat.getProduct(done.productId).product;
  eq([made.name, made.priceMAD, made.cost, made.kind], ['1986-10 Khaki', 450.5, 210, 'pointure'], 'la fiche créée porte ce que le commerçant a confirmé');
  eq(stockOf(cat, done.productId), { 36: 2, 37: 4, 38: 6, 39: 6, 40: 4, 41: 2 }, 'la grille des pointures est remplie');
  ok(cat.listVariants(done.productId).every((v) => v.colorFamily === 'vert'), '« KHAKI » est rangé dans la famille du kaki, pas dans le gris par défaut');
  eq(findProducts(cat, '1986-10').map((x) => x.id), [done.productId], 'le carton suivant retrouve la fiche par sa référence');
}

/* ── 2 · la référence existe déjà : on ajoute, on ne double pas ─────────── */
{
  const { cat, colors } = shop();
  const boot = cat.addProduct({ name: 'Bottine 1986-10', priceMAD: 480, kind: 'pointure' });
  const v38 = cat.addVariant({ productId: boot.id, colorId: 'khaki', colorLabel: 'Khaki', size: '38', stock: 4 });
  cat.addVariant({ productId: boot.id, colorId: 'noir', size: '38', stock: 7 });
  cat.addVariant({ productId: boot.id, colorId: 'noir', size: '39', stock: 5 });
  const other = cat.addProduct({ name: 'Sandale 2001', priceMAD: 200 });
  eq(findProducts(cat, '1986-10').map((x) => x.id), [boot.id], 'la fiche est retrouvée par la référence dans son nom');
  eq(findProducts(cat, '86').length, 0, 'une référence trop courte ne rapproche rien');
  const count = cat.listProducts({ includeArchived: true }).length;

  const p = plan(cat, { productId: boot.id, price: '', color: 'KHAKI', cartons: 1, rows: RUN }, colors);
  ok(p.ok && p.productId === boot.id, 'sur une fiche existante, aucun prix n’est demandé');
  const l38 = p.lines.find((l) => l.size === '38'), l39 = p.lines.find((l) => l.size === '39');
  eq([l38.variantId, l38.before, l38.after], [v38.id, 4, 7], 'le 38 kaki existant reçoit ses 3 paires');
  eq([l39.variantId, l39.before, l39.after], [null, 0, 3], 'le 39 kaki n’existe pas : il sera créé, le 39 noir n’est pas touché');

  const done = apply(cat, p);
  ok(done.ok && done.received === 12, 'douze paires reçues');
  eq(cat.listProducts({ includeArchived: true }).length, count, 'aucune fiche en double');
  eq(cat.variantStock(boot.id, '38', 'noir'), 7, 'le noir garde son stock');
  eq(cat.listVariants(boot.id).find((v) => v.id === v38.id).stock, 7, 'le 38 kaki passe de 4 à 7 : une réception s’ajoute');
  eq(cat.getProduct(boot.id).product.priceMAD, 480, 'le prix de la fiche n’a pas bougé');
  eq(cat.productStock(other.id), 0, 'l’autre article n’a rien reçu');
  eq(plan(cat, { productId: 'prod_absent', color: 'KHAKI', cartons: 1, rows: RUN }, colors).error, 'product', 'une fiche disparue entre-temps est refusée');
}

/* ── 3 · sans couleur sur l'étiquette ───────────────────────────────────── */
{
  const { cat, colors } = shop();
  const one = cat.addProduct({ name: 'Mule 77-A', priceMAD: 150, kind: 'pointure' });
  const only = cat.addVariant({ productId: one.id, colorId: 'noir', size: '37', stock: 1 });
  const p = plan(cat, { productId: one.id, color: '', cartons: 1, rows: [{ size: '37', qty: 2 }] }, colors);
  eq([p.ok, p.lines[0].variantId], [true, only.id], 'une seule couleur à cette pointure : la réception y va');
  cat.addVariant({ productId: one.id, colorId: 'blanc', size: '37', stock: 1 });
  eq(plan(cat, { productId: one.id, color: '', cartons: 1, rows: [{ size: '37', qty: 2 }] }, colors).error, 'color',
    'deux couleurs possibles et aucune sur l’étiquette : la couleur est demandée, pas devinée');
}

/* ── le module est chargé à la demande, hors des tampons de la coquille ───
 * Son adresse porte donc son propre « ?v= » dans agent-voice.js. Modifier le
 * module sans monter ce numéro laisse l'ancien fichier aux navigateurs déjà
 * passés (le service worker le sert d'abord). Le sceau ci-dessous rend l'oubli
 * rouge : montez « ?v= » dans agent-voice.js, puis recopiez ici v et sha. */
{
  const SEALED = { v: 4, sha: '796aad509743937c' };
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'assets/agent-size-run.mjs'))).digest('hex').slice(0, 16);
  const asked = /agent-size-run\.mjs\?v=(\d+)/.exec(fs.readFileSync(path.join(ROOT, 'assets/agent-voice.js'), 'utf8'));
  eq(asked && Number(asked[1]), SEALED.v, 'agent-voice.js charge la version scellée du module');
  eq(sha, SEALED.sha, 'le module a changé : montez « ?v= » dans agent-voice.js, puis scellez v et sha ici');
}

if (!process.exitCode) console.log('✓ agent-size-run · ' + passed + ' contrôles : plan sans écriture, réception additive, pas de doublon, prix jamais inventé');
