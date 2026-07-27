#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · catalogue import gate — node tools/import-test.js
 *
 * Exercises assets/catalog-import.js against the REAL assets/boutique-catalog.js
 * rather than a stand-in, so the contract being tested is the one production
 * uses: addVariant's de-dupe on couleur+taille, attachBarcode's ownership rule,
 * the per-venue localStorage key.
 *
 * Why this file exists: an import is the one feature that can destroy data a
 * merchant already typed. The two properties that must never regress are
 *   1. IDEMPOTENCE — importing the same file twice changes nothing the second
 *      time (so "exporter → corriger → réimporter" is safe, and a double-click
 *      does not duplicate a 300-article inventory), and
 *   2. NO SILENT LOSS — a file with no stock column must not zero the stock
 *      that was counted in Kiwi, and a code-barres already printed on another
 *      article's labels must never be reassigned.
 * Neither is visible by reading the code; both are cheap to assert.
 *
 * Exit 0 = green · 1 = at least one failure. Called by tools/check.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { failures++; console.log('  ✗ ' + m); };
const section = (t) => console.log('\n■ ' + t);
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) ok(label + ' → ' + a);
  else bad(label + ' → attendu ' + e + ', obtenu ' + a);
}
function truthy(v, label) { if (v) ok(label); else bad(label); }

/* ───────────────── a browser, in about forty lines ─────────────────
 * Only what the two modules touch at load time and in the paths under test.
 * The UI half of catalog-import.js (ensureCss / open) is never entered here. */
function makeEnv() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  const noopEl = () => ({
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, appendChild() {}, removeChild() {}, remove() {}, click() {},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    set textContent(v) {}, get textContent() { return ''; },
    set innerHTML(v) {}, get innerHTML() { return ''; },
  });
  const document = {
    addEventListener() {}, removeEventListener() {},
    createElement: noopEl, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    head: noopEl(), body: noopEl(), readyState: 'complete', visibilityState: 'visible',
  };
  const window = {
    addEventListener() {}, removeEventListener() {},
    localStorage, document,
    // barcode.js is loaded next to the catalogue in every real page; a counter
    // keeps generated EANs distinct (the module's own fallback derives them from
    // Date.now() and would collide inside one millisecond).
    KiwiBarcode: (() => { let n = 0; return {
      nextInStoreEan: () => '200000000' + String(++n).padStart(4, '0'),
      detect: () => 'imported',
      isValidEan13: () => false,
    }; })(),
    // No server in a test: the catalogue's cloud mirror must fail soft.
    fetch: () => Promise.reject(new Error('offline')),
    setTimeout, clearTimeout, navigator: { onLine: false },
    TextDecoder,
  };
  window.window = window;
  const ctx = vm.createContext(window);
  ctx.globalThis = window;
  return { ctx, window, localStorage };
}

function loadInto(ctx, rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  new vm.Script(src, { filename: rel }).runInContext(ctx);
}

const { ctx, window } = makeEnv();
try {
  loadInto(ctx, 'assets/boutique-catalog.js');
  loadInto(ctx, 'assets/catalog-import.js');
} catch (e) {
  console.log('  ✗ chargement des modules — ' + e.message);
  process.exit(1);
}
process.on('unhandledRejection', () => {});   // the offline cloudBind above

const IMP = window.KiwiCatalogImport;
const CAT = window.KiwiBoutiqueCatalog;
if (!IMP || !CAT) { console.log('  ✗ modules non exposés sur window'); process.exit(1); }

/* Every test runs in its own empty store: use() a venue that is not the demo
 * one, so nothing is pre-seeded (boutique-catalog seeds maisonMansour only). */
let venueSeq = 0;
const freshVenue = () => { CAT.use('test-import-' + (++venueSeq)); return CAT; };

/* ── 1 · number parsing, as spreadsheets in Morocco actually write it ── */
section('Nombres (virgule décimale, espace milliers)');
eq(IMP._num('320'), 320, '"320"');
eq(IMP._num('12,50'), 12.5, '"12,50" (décimale FR)');
eq(IMP._num('1 234,50'), 1234.5, '"1 234,50" (espace milliers)');
eq(IMP._num('1.234,50'), 1234.5, '"1.234,50" (point milliers)');
eq(IMP._num('1,234'), 1234, '"1,234" (virgule milliers)');
eq(IMP._num('89,00 MAD'), 89, '"89,00 MAD" (unité collée)');
eq(IMP._num('1234.56'), 1234.56, '"1234.56" (décimale EN)');
truthy(!isFinite(IMP._num('abc')), '"abc" → NaN');
truthy(!isFinite(IMP._num('')), '"" → NaN');

/* ── 2 · header normalisation, incl. accents ── */
section('En-têtes normalisés');
eq(IMP._normKey('Prix (MAD)'), 'prix_mad', '"Prix (MAD)"');
eq(IMP._normKey('Code-barres'), 'code_barres', '"Code-barres"');
eq(IMP._normKey('  Couleur '), 'couleur', '"  Couleur "');
eq(IMP._normKey('Désignation'), 'designation', '"Désignation" (accent)');
eq(IMP._normKey('Qté'), 'qte', '"Qté"');
eq(IMP._bool('Oui'), true, 'disponible "Oui"');
eq(IMP._bool('non'), false, 'disponible "non"');
eq(IMP._bool('', true), true, 'disponible vide → défaut');

/* ── 3 · encodings Excel produces ── */
section('Encodage (UTF-8 et windows-1252)');
eq(IMP._decode(Buffer.from('brodée', 'utf8')), 'brodée', 'octets UTF-8');
eq(IMP._decode(Buffer.from([0x62, 0x72, 0x6f, 0x64, 0xe9, 0x65])), 'brodée', 'octets windows-1252');

/* ── 4 · CSV shapes ── */
section('Lecture CSV (séparateur, guillemets, BOM)');
{
  const a = IMP.parse('produit,prix\nChemise,320\n');
  eq([a.ok, a.delimiter, a.rows.length], [true, ',', 1], 'virgule');

  const b = IMP.parse('produit;categorie;prix\nChemise;Hauts;320\n');
  eq([b.ok, b.delimiter, b.header.length], [true, ';', 3], 'point-virgule (Excel FR)');

  const c = IMP.parse('produit,description\n"Chemise, en lin","Il a dit ""oui"""\n');
  eq(c.rows[0], ['Chemise, en lin', 'Il a dit "oui"'], 'guillemets + virgule interne');

  const d = IMP.parse('﻿produit,prix\r\nChemise,320\r\n');
  eq([d.ok, d.header[0], d.rows.length], [true, 'produit', 1], 'BOM + CRLF');

  const e = IMP.parse('produit,prix\n');
  eq(e.error, 'une-seule-ligne', 'en-tête seul → erreur explicite');

  const f = IMP.parse('   ');
  eq(f.error, 'vide', 'fichier vide → erreur explicite');

  const g = IMP.parse('produit,prix\nChemise,320\n\n\n');
  eq(g.rows.length, 1, 'lignes vides ignorées');
}

/* ── 5 · the real import, end to end ── */
section('Import boutique (contre le vrai catalogue)');
{
  freshVenue();
  eq(CAT.listProducts().length, 0, 'magasin neuf vide');

  const parsed = IMP.parse(IMP.templates().boutique);
  const plan = IMP.analyseBoutique(parsed);
  truthy(plan.ok, 'plan construit');
  eq(plan.counts.newProducts, 2, 'plan · 2 articles à créer');
  eq(plan.counts.newVariants, 4, 'plan · 4 variantes');
  eq(plan.counts.newCategories, 2, 'plan · 2 catégories');
  eq(plan.counts.newCodes, 1, 'plan · 1 code-barres du fichier');
  eq(CAT.listProducts().length, 0, 'analyse n\'écrit rien');

  const r = IMP.applyBoutique(plan, {});
  eq([r.products, r.variants, r.codes], [2, 4, 1], 'écriture · produits/variantes/codes');
  eq(CAT.listProducts().length, 2, 'catalogue · 2 articles');
  eq(CAT.listCategories().length, 2, 'catalogue · 2 catégories');

  const chemise = CAT.listProducts().find((p) => /Chemise/.test(p.name));
  truthy(chemise, 'article « Chemise en lin » créé');
  eq(chemise.priceMAD, 320, 'prix repris');
  eq(CAT.listVariants(chemise.id).length, 3, '3 variantes (Ivoire M/L, Noir M)');
  eq(CAT.productStock(chemise.id), 12, 'stock total 4+2+6');

  const babouches = CAT.listProducts().find((p) => /Babouches/.test(p.name));
  eq(babouches.kind, 'pointure', 'famille de tailles déduite (42 → pointure)');

  const owner = CAT.findByBarcode('3210000001234');
  truthy(owner && /Chemise/.test(owner.product.name), 'code-barres du fichier attaché au bon article');
}

/* ── 6 · IDEMPOTENCE — the property that makes re-import safe ── */
section('Réimport du même fichier (idempotence)');
{
  const before = {
    products: CAT.listProducts().length,
    variants: CAT.listProducts().reduce((n, p) => n + CAT.listVariants(p.id).length, 0),
    cats: CAT.listCategories().length,
  };
  const plan2 = IMP.analyseBoutique(IMP.parse(IMP.templates().boutique));
  eq(plan2.counts.newProducts, 0, 'plan · 0 nouvel article');
  eq(plan2.counts.newVariants, 0, 'plan · 0 nouvelle variante');
  eq(plan2.counts.newCodes, 0, 'plan · 0 nouveau code-barres');
  eq(plan2.counts.newCategories, 0, 'plan · 0 nouvelle catégorie');
  eq(plan2.issues.length, 0, 'aucun conflit signalé sur soi-même');

  const r2 = IMP.applyBoutique(plan2, {});
  eq([r2.products, r2.variants, r2.codes], [0, 0, 0], 'écriture · rien de créé');
  eq([
    CAT.listProducts().length,
    CAT.listProducts().reduce((n, p) => n + CAT.listVariants(p.id).length, 0),
    CAT.listCategories().length,
  ], [before.products, before.variants, before.cats], 'catalogue inchangé');
}

/* ── 7 · round-trip through the real exportCsv ── */
section('Aller-retour export → import');
{
  const plan = IMP.analyseBoutique(IMP.parse(CAT.exportCsv()));
  truthy(plan.ok, 'export relu sans erreur');
  eq([plan.counts.newProducts, plan.counts.newVariants, plan.counts.newCodes], [0, 0, 0],
    'un export réimporté ne crée rien');
  eq(plan.issues.length, 0, 'aucun conflit de code-barres avec lui-même');
}

/* ── 8 · NO SILENT LOSS — stock and barcodes are never clobbered ── */
section('Aucune perte silencieuse');
{
  freshVenue();
  IMP.applyBoutique(IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,prix_mad,stock\nPull,Noir,M,400,9\n')), {});
  let pull = CAT.listProducts()[0];
  eq(CAT.productStock(pull.id), 9, 'stock initial 9');

  // A file WITHOUT a stock column must leave the counted stock alone.
  IMP.applyBoutique(IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,prix_mad\nPull,Noir,M,450\n')), {});
  pull = CAT.getProduct(pull.id).product;
  eq(CAT.productStock(pull.id), 9, 'stock préservé (colonne absente)');
  eq(pull.priceMAD, 450, 'prix mis à jour');

  // An empty stock CELL is likewise not a zero.
  IMP.applyBoutique(IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,stock\nPull,Noir,M,\n')), {});
  eq(CAT.productStock(pull.id), 9, 'stock préservé (cellule vide)');

  // ...but an explicit 0 IS a zero.
  IMP.applyBoutique(IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,stock\nPull,Noir,M,0\n')), {});
  eq(CAT.productStock(pull.id), 0, 'stock 0 explicite appliqué');
}

/* ── 9 · a code-barres already owned is reported, never reassigned ── */
section('Conflit de code-barres');
{
  freshVenue();
  IMP.applyBoutique(IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,code_barres\nSac,Camel,TU,3210000009999\n')), {});
  const sac = CAT.listProducts()[0];

  const plan = IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,code_barres\nCeinture,Noir,TU,3210000009999\n'));
  truthy(plan.issues.some((i) => /appartient/.test(i.msg)), 'conflit signalé au commerçant');
  eq(plan.counts.newCodes, 0, 'le code n\'est pas réattribué');

  IMP.applyBoutique(plan, {});
  const still = CAT.findByBarcode('3210000009999');
  eq(still.product.id, sac.id, 'le code appartient toujours au « Sac »');
  eq(CAT.listProducts().length, 2, 'la Ceinture est tout de même créée (sans code)');

  // The same code twice in ONE file: second occurrence flagged, not applied.
  freshVenue();
  const dup = IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,code_barres\nA,Noir,TU,111222333444\nB,Noir,TU,111222333444\n'));
  truthy(dup.issues.some((i) => /deja utilise|déjà utilisé/i.test(i.msg)), 'doublon interne au fichier signalé');
  eq(dup.counts.newCodes, 1, 'un seul des deux codes retenu');
}

/* ── 10 · a real merchant's headers, not ours ── */
section('En-têtes du monde réel (alias + point-virgule)');
{
  freshVenue();
  const csv = 'Désignation;Rayon;Coloris;Pointure;Prix;Qté;Gencod\n'
            + 'Mocassin cuir;Chaussures;Camel;41;690;3;3210000007777\n'
            + 'Mocassin cuir;Chaussures;Noir;42;690;2;\n';
  const plan = IMP.analyseBoutique(IMP.parse(csv));
  truthy(plan.ok, 'colonnes reconnues via alias');
  eq(plan.counts.newProducts, 1, '1 article');
  eq(plan.counts.newVariants, 2, '2 variantes');
  const r = IMP.applyBoutique(plan, {});
  eq(r.codes, 1, 'le Gencod est repris');
  const prod = CAT.listProducts()[0];
  eq(prod.priceMAD, 690, 'prix lu depuis « Prix »');
  eq(CAT.productStock(prod.id), 5, 'stock lu depuis « Qté »');
  eq(CAT.listCategories()[0].name, 'Chaussures', 'catégorie créée depuis « Rayon »');
}

/* ── 11 · missing product column fails loudly, writes nothing ── */
section('Fichier inexploitable');
{
  freshVenue();
  const plan = IMP.analyseBoutique(IMP.parse('reference;quantite\nX-1;4\n'));
  eq(plan.ok, false, 'refus explicite');
  eq(plan.error, 'colonne-produit', 'motif nommé');
  truthy(Array.isArray(plan.headerRaw), 'les colonnes lues sont renvoyées pour l\'écran d\'erreur');
  eq(CAT.listProducts().length, 0, 'rien écrit');

  // Rows with no name are skipped and counted, not silently dropped.
  const p2 = IMP.analyseBoutique(IMP.parse('produit,prix\n,320\nRobe,450\n'));
  eq(p2.counts.skipped, 1, 'ligne sans nom comptée comme ignorée');
  eq(p2.counts.newProducts, 1, 'la ligne valide passe');
}

/* ── 12 · générer les codes manquants (option explicite) ── */
section('Génération des codes-barres manquants');
{
  freshVenue();
  const plan = IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,stock\nJupe,Noir,S,3\nJupe,Noir,M,4\n'));
  eq(plan.counts.missingCodes, 2, 'plan · 2 variantes sans code');

  IMP.applyBoutique(plan, {});
  let coded = CAT.listVariants(CAT.listProducts()[0].id).filter((v) => v.barcodes.length).length;
  eq(coded, 0, 'sans l\'option, aucun code inventé');

  freshVenue();
  const plan2 = IMP.analyseBoutique(IMP.parse(
    'produit,couleur,taille,stock\nJupe,Noir,S,3\nJupe,Noir,M,4\n'));
  const r = IMP.applyBoutique(plan2, { generateMissing: true });
  eq(r.generated, 2, 'avec l\'option, 2 codes générés');
  coded = CAT.listVariants(CAT.listProducts()[0].id).filter((v) => v.barcodes.length).length;
  eq(coded, 2, 'chaque variante a son code');
}

/* ── 13 · la carte (KiwiMenuStore) ── */
section('Import carte');
{
  /* KiwiMenuStore's real implementation drags in KiwiStore and the whole render
   * layer; the shape under test here is the API contract catalog-import.js uses
   * (categories / items / addCategory / addSubcategory / addItem / updateItem). */
  const doc = { seq: 0, cats: [], items: [] };
  const nid = (p) => p + '_' + (++doc.seq);
  window.KiwiMenuStore = {
    categories: () => doc.cats,
    items: () => doc.items,
    addCategory: (name) => { doc.cats.push({ id: nid('cat'), name: String(name), sub: [] }); return doc; },
    addSubcategory: (catId, name) => {
      const c = doc.cats.find((x) => x.id === catId);
      if (c) { c.sub = c.sub || []; c.sub.push({ id: nid('sub'), name: String(name) }); }
      return doc;
    },
    addItem: (d) => {
      doc.items.push({ id: nid('it'), name: d.name, price: +d.price || 0, catId: d.catId || null,
        subId: d.subId || null, desc: d.desc || '', avail: d.avail !== false });
      return doc;
    },
    updateItem: (id, patch) => {
      const it = doc.items.find((x) => x.id === id);
      if (it) Object.assign(it, patch);
      return doc;
    },
  };

  const plan = IMP.analyseMenu(IMP.parse(IMP.templates().menu));
  truthy(plan.ok, 'plan carte construit');
  eq(plan.counts.newItems, 3, 'plan · 3 articles');
  eq(plan.counts.newCategories, 2, 'plan · 2 catégories');
  eq(plan.counts.newSubs, 2, 'plan · 2 sous-catégories');
  eq(doc.items.length, 0, 'analyse n\'écrit rien');

  const r = IMP.applyMenu(plan);
  eq([r.items, r.cats, r.subs], [3, 2, 2], 'écriture carte');
  eq(doc.items.length, 3, 'carte · 3 articles');
  const the = doc.items.find((i) => /menthe/i.test(i.name));
  eq(the.price, 12, 'prix repris');
  truthy(the.catId && the.subId, 'catégorie et sous-catégorie rattachées');
  eq(the.avail, true, 'disponibilité « oui » lue');

  // Re-import: prices update, nothing duplicates.
  const plan2 = IMP.analyseMenu(IMP.parse(
    'article,categorie,prix_mad,disponible\nThé à la menthe,Boissons,15,non\n'));
  eq(plan2.counts.newItems, 0, 'réimport · aucun doublon');
  eq(plan2.counts.updatedItems, 1, 'réimport · 1 mise à jour');
  IMP.applyMenu(plan2);
  const again = doc.items.find((i) => /menthe/i.test(i.name));
  eq([again.price, again.avail], [15, false], 'prix et disponibilité mis à jour');
  eq(doc.items.length, 3, 'toujours 3 articles');
}

/* ───────────────── summary ───────────────── */
console.log('\n' + '─'.repeat(60));
if (failures) { console.log('✗ ' + failures + ' échec(s)'); process.exit(1); }
console.log('✓ import · tous les contrôles passent');
