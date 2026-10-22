#!/usr/bin/env node
const retailSource = require('./pos-retail-test-source.cjs');
/* ═════════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU de la fusion du catalogue boutique
 * ---------------------------------------------------------------------------
 * Deux appareils tiennent le MÊME inventaire : le tableau de bord et la caisse
 * appairée. Chacun écrit dans son navigateur, chacun remonte au serveur, et
 * quand les deux copies ne sont pas d'accord c'est mergeDocs() qui tranche.
 *
 * Une erreur là-dedans ne lève RIEN. Elle rend simplement au commerçant un
 * stock qu'il croyait avoir corrigé — et il ne peut pas savoir pourquoi. C'est
 * arrivé à un vrai client le 30/07/2026 : son stock revenait indéfiniment à
 * 4 078 unités, quoi qu'il vende et quoi qu'il supprime. La cause tenait en une
 * ligne de commentaire qui se croyait prudente — « union par id, rien ne
 * disparaît jamais » — et deux conséquences qu'elle n'avait pas vues :
 *
 *   · une ABSENCE ne se distingue pas d'une IGNORANCE. L'appareil qui supprime
 *     un article se retrouve à ne plus l'avoir ; la copie serveur l'a encore ;
 *     l'union le rend, puis le republie. La suppression n'était pas perdue,
 *     elle était ANNULÉE.
 *   · « cet appareil d'abord » se juge DEPUIS CHAQUE APPAREIL. La caisse vend et
 *     son compte baisse ; l'onglet tableau de bord garde l'ancien et, quand
 *     c'est lui qui pousse, l'ancien gagne. Les deux se renvoyaient le même
 *     document et le stock ne bougeait plus.
 *
 * Ces contrôles rejouent la VRAIE fonction du VRAI module. S'ils tombent, un
 * commerçant est en train de perdre le contrôle de son inventaire.
 * ═════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

/* ── un navigateur de poche ───────────────────────────────────────────────── */
function makeWindow(opts) {
  opts = opts || {};
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i],
  };
  const el = () => ({
    id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    classList: { add() {}, remove() {} },
  });
  const doc = {
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    visibilityState: 'visible', readyState: 'complete',
    getElementById: () => null, createElement: el,
    querySelector: () => null, querySelectorAll: () => [], head: el(), body: el(),
  };
  const win = {
    localStorage, document: doc,
    addEventListener() {}, removeEventListener() {},
    /* Un commerçant RÉEL : c'est le seul cas où la copie serveur existe, donc le
       seul où la fusion a lieu. La démo ne quitte jamais son navigateur. */
    KiwiEnv: { isReal: () => opts.real !== false, local: false, hosted: true, demosAllowed: false },
    setTimeout, clearTimeout,
    fetch: opts.fetch || (() => Promise.reject(new Error('hors ligne'))),
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = (o || {}).detail; } },
    navigator: { userAgent: 'node' },
  };
  win.window = win;
  return win;
}

function load(win, file) {
  const src = retailSource(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const fn = new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout',
    'fetch', 'CustomEvent', 'navigator', 'self', 'console', src);
  fn(win, win.document, win.localStorage, win.setTimeout, win.clearTimeout,
    win.fetch, win.CustomEvent, win.navigator, win, console);
}

const win = makeWindow();
load(win, 'assets/barcode.js');
load(win, 'assets/color-palette.js');
load(win, 'assets/boutique-catalog-parts.js');
load(win, 'assets/boutique-catalog.js');
const C = win.KiwiBoutiqueCatalog;
if (!C || !C._merge) {
  console.log('  ✗ KiwiBoutiqueCatalog._merge introuvable');
  process.exit(1);
}

/* ═══ 0 · UNE CAISSE APPAIRÉE EST UN APPAREIL CLOUD ════════════════════════
 * La tablette n'a pas de session propriétaire : KiwiEnv.isReal() y est faux.
 * Son cookie d'appairage est pourtant précisément ce qui l'autorise à lire le
 * stock de CE magasin. Sans cette branche, elle garde un vieux localStorage et
 * affiche « épuisé » pendant que le dashboard montre le vrai stock. */
{
  const calls = [];
  const paired = makeWindow({ real: false, fetch: (url) => { calls.push(url); return Promise.reject(new Error('stop')); } });
  paired.localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'santos-store', name: 'Santos Store' }));
  load(paired, 'assets/barcode.js');
  load(paired, 'assets/color-palette.js');
  load(paired, 'assets/boutique-catalog-parts.js');
  load(paired, 'assets/boutique-catalog.js');
  paired.KiwiBoutiqueCatalog.use('santos-store');
  ok(calls.some((u) => String(u).includes('/api/catalog?merchant=santos-store')),
    'une caisse appairée relit le catalogue serveur même sans session propriétaire');

  const foreignCalls = [];
  const foreign = makeWindow({ real: false, fetch: (url) => { foreignCalls.push(url); return Promise.reject(new Error('stop')); } });
  foreign.localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'autre-store' }));
  load(foreign, 'assets/barcode.js');
  load(foreign, 'assets/color-palette.js');
  load(foreign, 'assets/boutique-catalog-parts.js');
  load(foreign, 'assets/boutique-catalog.js');
  foreign.KiwiBoutiqueCatalog.use('santos-store');
  eq(foreignCalls.length, 0, 'l’appairage d’un autre magasin ne déclenche aucune lecture');
}

/* The offline transport guards are as important as merge arithmetic: a local
 * movement that never retries is still lost to the other device, and a failed
 * first read must never authorize a blind overwrite. */
{
  // La copie serveur vit dans assets/boutique-catalog-parts.js ; batch() reste dans le principal.
  const source = ['assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js']
    .map((f) => retailSource(fs.readFileSync(path.join(ROOT, f), 'utf8'))).join('\n');
  const valid = source.indexOf('if (!res || slug !== core.VENUE) return false;');
  const mark = source.indexOf('cloud.read[slug] = 1;', valid);
  ok(valid >= 0 && mark > valid, 'un GET serveur en erreur ne valide jamais la lecture avant écriture');
  ok(source.includes("window.addEventListener('online'") && source.includes('if (cloud.dirty) schedulePush(0)'),
    'un mouvement de stock hors-ligne repart dès le retour du réseau');
  ok(source.includes("'kiwiCatalogDirty:v1:'") && source.includes('cloud.dirty = !!dirtyToken(slug)') &&
    source.includes('clearCatalogDirty(slug, sentDirty)'),
  'le stock en attente survit au rechargement et seul le POST correspondant peut l’acquitter');
  ok(/batchDirty = false;[\s\S]{0,180}markCatalogDirty\(\);/.test(source),
    'un import ou autre mutation groupée est marqué en attente comme une vente isolée');
}

const NOW = Date.now();

/* ═══ 11 · LES MODIFICATIONS MÉTIER LES PLUS RÉCENTES TRAVERSENT ═════════════
 * Keeping the local record unconditionally made an old till resurrect an archived
 * product and its old price, then publish both on its next sale. */
{
  const base = { v: 2, seq: 1, categories: [], removed: {}, moves: [],
    variants: [{ id: 'v-meta', productId: 'p-meta', size: 'S', colorId: 'noir', colorFamily: 'noir', stock: 2, base: 2, baseAt: NOW }] };
  const local = Object.assign({}, base, { products: [{ id: 'p-meta', name: 'Polo', priceMAD: 400, archived: false, metaAt: NOW }] });
  const server = Object.assign({}, base, { products: [{ id: 'p-meta', name: 'Polo nouveau', priceMAD: 500, archived: true, metaAt: NOW + 1 }] });
  const merged = C._merge(local, server);
  eq(merged.products[0].priceMAD, 500, 'le prix le plus récent atteint la caisse');
  eq(merged.products[0].archived, true, 'un article archivé ne reste pas vendable sur une vieille caisse');

  const localCodes = Object.assign({}, base, { products: local.products,
    variants: [{ id: 'v-meta', productId: 'p-meta', size: 'S', colorId: 'noir', colorFamily: 'noir', stock: 2, base: 2, baseAt: NOW,
      metaAt: NOW, barcodes: [{ code: 'LOCAL', at: NOW, primary: true }], barcodeRemoved: {} }] });
  const serverCodes = Object.assign({}, base, { products: server.products,
    variants: [{ id: 'v-meta', productId: 'p-meta', size: 'S', colorId: 'noir', colorFamily: 'noir', stock: 2, base: 2, baseAt: NOW,
      metaAt: NOW + 1, barcodes: [{ code: 'REMOTE', at: NOW + 1, primary: true }], barcodeRemoved: {} }] });
  const both = C._merge(localCodes, serverCodes);
  eq(both.variants[0].barcodes.map((b) => b.code).sort().join(','), 'LOCAL,REMOTE',
    'deux codes ajoutés sur deux appareils survivent ensemble');
  serverCodes.variants[0].barcodeRemoved.LOCAL = NOW + 2;
  const removed = C._merge(both, serverCodes);
  eq(removed.variants[0].barcodes.some((b) => b.code === 'LOCAL'), false,
    'la suppression horodatée d’un code traverse les appareils');
}

/* ═══ 12 · COMPACTION : AUCUNE UNITÉ NE RÉAPPARAÎT ═════════════════════════════ */
{
  const old = Date.now() - 46 * 86400000;
  const d = { v: 2, seq: 1, categories: [], products: [{ id: 'p-fold', name: 'Polo' }], removed: {},
    variants: [{ id: 'v-fold', productId: 'p-fold', size: 'S', stock: 0, base: 1, baseAt: 1 }],
    moves: [
      { id: 'fold-a', vid: 'v-fold', d: -1, at: old, why: 'vente' },
      { id: 'fold-b', vid: 'v-fold', d: -1, at: old + 1, why: 'vente' },
      { id: 'fold-c', vid: 'v-fold', d: 1, at: old + 2, why: 'retour' },
    ] };
  const merged = C._merge(d, d);
  eq(merged.variants[0].stock, 0, 'la compaction conserve le zéro réel après survente puis retour');
  eq(merged.variants[0].base, 0, 'le socle replié reste algébriquement exact');
}

/* Un document minimal, à la forme du vrai. */
const doc = (variants, removed) => ({
  v: 1, seq: 10,
  categories: [{ id: 'cat_1', name: 'Hauts' }],
  products: [{ id: 'prod_1', name: 'Chemise', categoryId: 'cat_1' }],
  variants: variants,
  removed: removed || {},
});
const vr = (stock, stockAt) => ({ id: 'var_1', productId: 'prod_1', size: 'M', stock, stockAt });

/* ═══ 1 · LA VENTE NE REMONTE PAS ═══════════════════════════════════════════
 * La caisse a vendu (12 → 9, à l'instant). L'onglet du tableo de bord porte
 * encore 12, d'une heure plus tôt. Le compte le plus RÉCENT doit gagner, quel
 * que soit celui des deux appareils qui pousse. */
{
  const vendu = vr(9, NOW);
  const vieux = vr(12, NOW - 3600000);

  const a = C._merge(doc([vieux]), doc([vendu]));   // le vieil onglet pousse
  eq(a.variants[0].stock, 9, 'le compte vendu gagne même quand le vieil onglet pousse');

  const b = C._merge(doc([vendu]), doc([vieux]));   // la caisse pousse
  eq(b.variants[0].stock, 9, 'et il gagne aussi quand la caisse pousse');
}

/* ═══ 2 · UN DOCUMENT D'AVANT LE CORRECTIF PERD ═════════════════════════════
 * La copie serveur du client (révision 165) n'a pas d'horodatage : elle doit
 * compter pour la plus ancienne, sinon le 4 078 gagnerait éternellement et le
 * correctif ne réparerait rien pour lui. */
{
  const sansDate = { id: 'var_1', productId: 'prod_1', size: 'M', stock: 4078 };
  const apres = vr(37, NOW);
  const m = C._merge(doc([sansDate]), doc([apres]));
  eq(m.variants[0].stock, 37, 'une copie sans horodatage cède à une écriture datée');
  const m2 = C._merge(doc([apres]), doc([sansDate]));
  eq(m2.variants[0].stock, 37, 'dans les deux sens');
}

/* ═══ 3 · UNE SUPPRESSION TIENT ═════════════════════════════════════════════
 * Le cœur du bug. L'appareil qui supprime n'a plus l'article ; l'autre l'a
 * encore. Sans la carte des suppressions, l'union le ressuscite. */
{
  const mine = doc([], { var_1: NOW, prod_1: NOW });
  mine.products = [];
  const theirs = doc([vr(12, NOW - 3600000)]);        // l'autre ne sait pas encore

  const m = C._merge(mine, theirs);
  eq(m.products.length, 0, 'le produit supprimé ne revient pas');
  eq(m.variants.length, 0, 'sa déclinaison ne revient pas non plus');

  /* Et dans l'autre sens : la suppression faite AILLEURS doit s'appliquer ici. */
  const m2 = C._merge(theirs, mine);
  eq(m2.products.length, 0, 'la suppression faite sur l\'autre appareil s\'applique ici');
  eq(m2.variants.length, 0, 'y compris à la déclinaison');
  ok(m2.removed && m2.removed.prod_1 > 0, 'la carte des suppressions traverse la fusion');
}

/* ═══ 4 · CE QUE L'AUTRE A AJOUTÉ ARRIVE QUAND MÊME ═════════════════════════
 * Le garde-fou d'origine avait raison sur un point : un article créé sur
 * l'autre appareil ne doit pas disparaître parce que celui-ci l'ignore. */
{
  const mine = doc([vr(5, NOW)]);
  const theirs = doc([vr(5, NOW - 1000), { id: 'var_9', productId: 'prod_1', size: 'L', stock: 3, stockAt: NOW }]);
  theirs.products = theirs.products.concat([{ id: 'prod_9', name: 'Pantalon' }]);
  const m = C._merge(mine, theirs);
  eq(m.variants.length, 2, 'la déclinaison créée ailleurs arrive');
  eq(m.products.length, 2, 'le produit créé ailleurs arrive');
}

/* ═══ 5 · SUPPRIMER PUIS FUSIONNER, PAR L'API PUBLIQUE ══════════════════════
 * MEDIA REGRESSION (4b): a caisse may already know the product with blank media when
 * the dashboard uploads the photo. The newer media state must cross devices. */
{
  const caisse = doc([vr(5, NOW)]);
  caisse.products[0].photo = '';
  caisse.products[0].video = '';
  const dashboard = JSON.parse(JSON.stringify(caisse));
  dashboard.products[0].photo = '/api/media/boutique/photo.jpg';
  dashboard.products[0].mediaAt = NOW;
  const added = C._merge(caisse, dashboard);
  eq(added.products[0].photo, '/api/media/boutique/photo.jpg', 'la photo ajoutée au dashboard arrive en caisse');
  eq(added.products[0].mediaAt, NOW, 'la date du média traverse la fusion');

  const removed = JSON.parse(JSON.stringify(dashboard));
  removed.products[0].photo = '';
  removed.products[0].mediaAt = NOW + 1000;
  eq(C._merge(dashboard, removed).products[0].photo, '', 'une suppression de photo plus récente arrive aussi en caisse');

  const legacyCaisse = doc([vr(5, NOW)]);
  const legacyDashboard = JSON.parse(JSON.stringify(legacyCaisse));
  legacyDashboard.products[0].photo = '/api/media/boutique/legacy.jpg';
  eq(C._merge(legacyCaisse, legacyDashboard).products[0].photo, '/api/media/boutique/legacy.jpg',
    'une photo existante sans horodatage répare une ancienne caisse vide');
}

/* ═══ 5 · SUPPRIMER PUIS FUSIONNER, PAR L'API PUBLIQUE
 * On ne teste pas seulement la fonction : on vérifie que le geste réel
 * (deleteProduct) inscrit bien la suppression. Un tombstone que personne ne
 * pose ne protège rien. */
{
  C.use('santos-store');
  const p = C.addProduct({ name: 'Test', priceMAD: 100 });
  const v = C.addVariant({ productId: p.id, colorId: 'noir', size: 'M', stock: 7 });
  ok(!!(v && v.baseAt && v.base != null), 'une déclinaison créée porte son socle et son instant');

  const serveur = JSON.parse(JSON.stringify(C._doc()));   // ce que l'autre appareil a lu
  C.deleteProduct(p.id);
  const apres = C._merge(C._doc(), serveur);
  eq(apres.products.filter((x) => x.id === p.id).length, 0,
    'le produit supprimé par le geste réel ne revient pas de la copie serveur');
  eq(apres.variants.filter((x) => x.id === v.id).length, 0, 'ni sa déclinaison');
}

/* ═══ 6 · LA VENTE, PAR L'API PUBLIQUE ══════════════════════════════════════
 * adjustStock() est ce que la caisse appelle à chaque article vendu
 * (assets/pos-boutique.js). S'il n'horodate pas, tout le reste est décoratif. */
{
  const p = C.addProduct({ name: 'Test 2', priceMAD: 100 });
  const v = C.addVariant({ productId: p.id, colorId: 'blanc', size: 'L', stock: 10 });
  const after = C.adjustStock(v.id, -3, 'vente');
  eq(after.stock, 7, 'la vente décrémente');
  const j = (C._doc().moves || []).filter((m) => m.vid === v.id);
  eq(j.length, 1, 'et elle écrit un mouvement plutôt que d\'écraser le compte');
}

/* ═══ 7 · DEUX VENTES SIMULTANÉES S'ADDITIONNENT ════════════════════════════
 * Le trou que l'horodatage ne bouchait pas. La caisse vend 2 (10 → 8), le
 * tableau de bord en vend 1 (10 → 9) dans la même minute. « Le plus récent
 * gagne » retient 8 ou 9 — jamais 7, et un article part sans sortir du stock.
 * Deux mouvements distincts, en revanche, s'additionnent. */
{
  const socle = (n, at) => ({ id: 'var_1', productId: 'prod_1', size: 'M', stock: n, base: n, baseAt: at });
  const base = { v: 1, seq: 10, categories: [], products: [{ id: 'prod_1', name: 'Chemise' }] };
  const caisse = Object.assign({}, base, {
    variants: [socle(10, NOW - 7200000)], removed: {},
    moves: [{ id: 'dev-A-1', vid: 'var_1', d: -2, at: NOW - 60000, why: 'vente' }],
  });
  const dash = Object.assign({}, base, {
    variants: [socle(10, NOW - 7200000)], removed: {},
    moves: [{ id: 'dev-B-1', vid: 'var_1', d: -1, at: NOW - 30000, why: 'vente' }],
  });

  const m = C._merge(caisse, dash);
  eq(m.variants[0].stock, 7, 'deux ventes simultanées sur deux appareils s\'additionnent');
  eq(m.moves.length, 2, 'les deux mouvements survivent');

  const m2 = C._merge(dash, caisse);
  eq(m2.variants[0].stock, 7, 'et dans l\'autre sens aussi (la fusion est commutative)');

  /* IDEMPOTENCE. Le même journal reçu deux fois ne doit pas vendre deux fois —
     sinon chaque sondage réseau ferait fondre le stock. */
  const m3 = C._merge(m, dash);
  eq(m3.variants[0].stock, 7, 'refusionner ne redéduit pas les mêmes ventes');
  const m4 = C._merge(m3, m3);
  eq(m4.variants[0].stock, 7, 'ni fusionner un document avec lui-même');
}

/* ═══ 8 · UN COMPTAGE PHYSIQUE ANNULE CE QUI PRÉCÈDE ════════════════════════
 * Quand on compte les cartons à la main, l'historique d'avant ne discute pas.
 * Mais une vente POSTÉRIEURE au comptage doit encore s'appliquer. */
{
  const base = { v: 1, seq: 10, categories: [], products: [{ id: 'prod_1', name: 'Chemise' }], removed: {} };
  const compte = Object.assign({}, base, {
    variants: [{ id: 'var_1', productId: 'prod_1', size: 'M', stock: 50, base: 50, baseAt: NOW - 1000 }],
    moves: [],
  });
  const vieux = Object.assign({}, base, {
    variants: [{ id: 'var_1', productId: 'prod_1', size: 'M', stock: 3, base: 3, baseAt: NOW - 86400000 }],
    moves: [{ id: 'dev-C-1', vid: 'var_1', d: -1, at: NOW - 80000000, why: 'vente' }],
  });

  const m = C._merge(vieux, compte);
  eq(m.variants[0].stock, 50, 'le comptage du jour l\'emporte sur le chiffre de la veille');
  eq(m.moves.length, 0, 'et les mouvements qu\'il annule ne traînent pas');

  const apresVente = Object.assign({}, compte, {
    moves: [{ id: 'dev-C-2', vid: 'var_1', d: -4, at: NOW, why: 'vente' }],
  });
  const m2 = C._merge(compte, apresVente);
  eq(m2.variants[0].stock, 46, 'une vente POSTÉRIEURE au comptage s\'applique quand même');
}

/* ═══ 9 · LA VENTE, PAR L'API PUBLIQUE, EST UN MOUVEMENT ════════════════════
 * adjustStock() est ce que la caisse appelle par article vendu. S'il repose un
 * socle au lieu d'écrire un mouvement, tout le reste est décoratif. */
{
  const p = C.addProduct({ name: 'Test 3', priceMAD: 100 });
  const v = C.addVariant({ productId: p.id, colorId: 'rouge', size: 'S', stock: 20 });
  C.adjustStock(v.id, -5, 'vente');
  const doc = C._doc();
  const mv = (doc.moves || []).filter((m) => m.vid === v.id);
  eq(mv.length, 1, 'une vente écrit UN mouvement');
  eq(mv[0].d, -5, 'du bon delta');
  eq(mv[0].why, 'vente', 'avec son motif');
  eq(C.getVariant ? C.getVariant(v.id).stock : doc.variants.find((x) => x.id === v.id).stock, 15,
    'et le stock matérialisé suit');

  /* Un comptage direct, lui, repose le socle et efface le journal de cet article. */
  C.setStock(v.id, 12);
  const doc2 = C._doc();
  eq((doc2.moves || []).filter((m) => m.vid === v.id).length, 0,
    'un comptage direct annule le journal de cette déclinaison');
  eq(doc2.variants.find((x) => x.id === v.id).stock, 12, 'et pose le nouveau compte');
}

/* ═══ 10 · NE PAS REPUBLIER CE QU'ON VIENT DE LIRE ══════════════════════════
 * La boucle qui a porté le document d'un client à la révision 165 pour 41
 * articles. Un appareil qui n'a rien à dire ne doit rien remonter — c'est sous
 * ce bruit que l'écrasement du stock passait inaperçu. */
{
  const doc1 = {
    v: 1, seq: 5, categories: [], removed: {}, moves: [],
    products: [{ id: 'prod_1', name: 'Chemise' }],
    variants: [{ id: 'var_1', productId: 'prod_1', size: 'M', stock: 4, base: 4, baseAt: NOW - 1000 }],
  };
  const copie = JSON.parse(JSON.stringify(doc1));

  C._merge(doc1, copie);
  ok(C._ahead && C._ahead().mine === false,
    'fusionner deux documents identiques ne donne RIEN à remonter');

  /* Mais dès qu'on porte quelque chose de neuf, il faut remonter. */
  const avecVente = JSON.parse(JSON.stringify(doc1));
  avecVente.moves = [{ id: 'dev-D-1', vid: 'var_1', d: -1, at: NOW, why: 'vente' }];
  C._merge(avecVente, copie);
  ok(C._ahead().mine === true, 'une vente d\'ici doit remonter');

  const avecSuppr = JSON.parse(JSON.stringify(doc1));
  avecSuppr.products = [];
  avecSuppr.removed = { prod_1: NOW };
  C._merge(avecSuppr, copie);
  ok(C._ahead().mine === true, 'une suppression d\'ici doit remonter');

  /* Et à l'inverse : ce que l'AUTRE porte ne nous oblige pas à republier. */
  const leurVente = JSON.parse(JSON.stringify(doc1));
  leurVente.moves = [{ id: 'dev-E-1', vid: 'var_1', d: -1, at: NOW, why: 'vente' }];
  C._merge(copie, leurVente);
  ok(C._ahead().mine === false, 'apprendre la vente de l\'autre ne nous fait pas republier');
  ok(C._ahead().theirs === true, 'mais elle est bien apprise');
}

/* ═══ UN REFUS 413 SE VOIT ════════════════════════════════════════════════
 * Le serveur refuse maintenant un catalogue hors bornes (catalog-too-large)
 * au lieu de le tronquer en silence. Le client doit le dire au commerçant, une
 * fois, et garder sa copie locale « à remonter ». */
async function tooLargeIsShown() {
  const toasts = [], posts = [];
  const w = makeWindow({ fetch: (url, init) => {
    if (init && init.method === 'POST') {
      posts.push(url);
      return Promise.resolve({ ok: false, status: 413, json: () => Promise.resolve({ error: 'catalog-too-large', field: 'products', max: 5000, count: 5001 }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ merchant: 'grand-store', data: null, rev: 0 }) });
  } });
  w.Kiwi = { toast: (title, o) => toasts.push({ title, desc: (o || {}).desc, type: (o || {}).type }) };
  load(w, 'assets/barcode.js');
  load(w, 'assets/color-palette.js');
  load(w, 'assets/boutique-catalog-parts.js');
  load(w, 'assets/boutique-catalog.js');
  const cat = w.KiwiBoutiqueCatalog;
  cat.use('grand-store');
  await new Promise((r) => setTimeout(r, 20));
  cat.addProduct({ name: 'Polo', priceMAD: 100 });
  for (let i = 0; i < 60 && !posts.length; i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 20));
  ok(posts.length >= 1, 'le catalogue tente sa remontée');
  ok(toasts.length === 1 && toasts[0].type === 'error' && /5 000 produits/.test(toasts[0].desc || '') && !/—/.test(toasts[0].desc + toasts[0].title),
    'un catalogue refusé (413 catalog-too-large) est annoncé au commerçant, avec la borne : ' + JSON.stringify(toasts));
  ok(!!w.localStorage.getItem('kiwiCatalogDirty:v1:grand-store'), 'la copie locale reste « à remonter » après le refus');
}

/* ═══ UN STOCKAGE LOCAL QUI LÈVE SE DIT ═══════════════════════════════════
 * Quota plein, navigation privée : localStorage.setItem lève. persist()
 * avalait l'exception, commit() prévenait les abonnés et la vente comme la
 * saisie de stock semblaient enregistrées, alors qu'un rechargement les
 * perdait. Attendu : la mémoire garde la modification, la remontée serveur
 * part quand même, commit() rend faux, durable() aussi, et un événement
 * « kiwi:local-save » le dit à la surface ; une écriture qui reprend le
 * rétablit. */
async function storageFailureIsSaid() {
  const posts = [], events = [];
  const w = makeWindow({ fetch: (url, init) => {
    if (init && init.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, rev: posts.length }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ merchant: 'plein-store', data: null, rev: 0 }) });
  } });
  w.dispatchEvent = (e) => { events.push(e); return true; };
  load(w, 'assets/barcode.js');
  load(w, 'assets/color-palette.js');
  load(w, 'assets/boutique-catalog-parts.js');
  load(w, 'assets/boutique-catalog.js');
  const cat = w.KiwiBoutiqueCatalog;
  cat.use('plein-store');
  await new Promise((r) => setTimeout(r, 20));
  const pr = cat.addProduct({ name: 'Caftan', priceMAD: 900 });
  const pid = (pr && (pr.id || (pr.product && pr.product.id))) || cat.listProducts()[0].id;
  const v = cat.addVariant({ productId: pid, colorId: 'noir', size: 'M', stock: 5 });
  const vid = (v && (v.id || (v.variant && v.variant.id))) || cat.listVariants(pid)[0].id;
  ok(typeof cat.durable === 'function' && cat.durable() === true, 'une écriture locale réussie est annoncée durable');

  let heard = 0;
  cat.subscribe(() => { heard++; });
  const realSet = w.localStorage.setItem;
  w.localStorage.setItem = (k, val) => {
    if (String(k).indexOf('kiwiBoutiqueCatalog:v1:') === 0) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    return realSet(k, val);
  };
  events.length = 0;
  let threw = null;
  try { cat.adjustStock(vid, -1, 'vente'); } catch (e) { threw = e; }
  ok(!threw, 'un stockage plein ne bloque jamais la vente');
  eq(cat.listVariants(pid)[0].stock, 4, 'la baisse de stock reste en mémoire');
  ok(heard >= 1, 'les abonnés sont prévenus du changement');
  ok(cat.durable() === false, 'durable() dit que la baisse ne vit qu\'en mémoire');
  const said = events.filter((e) => e.type === 'kiwi:local-save');
  ok(said.length === 1 && said[0].detail && said[0].detail.store === 'catalog' && said[0].detail.durable === false,
    'un événement kiwi:local-save { durable:false } prévient la surface : ' + JSON.stringify(said.map((e) => e.detail)));
  for (let i = 0; i < 60 && !posts.some((d) => (d.data.variants || []).some((x) => x.id === vid && x.stock === 4)); i++) await new Promise((r) => setTimeout(r, 50));
  ok(posts.some((d) => (d.data.variants || []).some((x) => x.id === vid && x.stock === 4)),
    'la baisse part quand même au serveur');

  w.localStorage.setItem = realSet;
  events.length = 0;
  cat.adjustStock(vid, 2, 'reception');
  ok(cat.durable() === true, 'la première écriture qui reprend rétablit durable()');
  const back = events.filter((e) => e.type === 'kiwi:local-save');
  ok(back.length === 1 && back[0].detail.durable === true, 'et le retour à la normale est annoncé une fois');
  ok(JSON.parse(w.localStorage.getItem('kiwiBoutiqueCatalog:v1:plein-store')).variants.some((x) => x.id === vid && x.stock === 6),
    'la copie locale rattrape tout ce que la mémoire portait');

  /* Et les surfaces l'entendent : les deux caisses (traduites par
     caisse-lang.js) et l'inventaire du tableau de bord (FR / EN / AR). */
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lang = read('assets/caisse-lang.js');
  for (const f of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
    const s = read(f);
    ok(/addEventListener\('kiwi:local-save'[\s\S]{0,400}d\.store !== 'catalog'[\s\S]{0,600}toast\('Stock non enregistré sur cette caisse', 9000, 'warn'/.test(s),
      f + ' avertit, sans bloquer, quand le stock n\'a pas pris sur la tablette');
  }
  for (const fr of ['Stock non enregistré sur cette caisse', 'Stock de nouveau enregistré sur cette caisse',
    'La vente continue et le stock part au serveur dès que le réseau le permet. Libérez du stockage avant de recharger la page.']) {
    ok(lang.includes(`'${fr}': ['`), 'caisse-lang traduit « ' + fr.slice(0, 40) + ' » en anglais et en arabe');
  }
  const dash = read('assets/pages-pro-boutique.js');
  ok(/window\.addEventListener\('kiwi:local-save'[\s\S]{0,300}d\.store !== 'catalog'[\s\S]{0,500}toast\(t\.unsaved, \{ desc: t\.unsavedDesc, type: 'warn'/.test(dash),
    'l\'inventaire du tableau de bord avertit aussi');
  ok((dash.match(/^\s+unsaved: '/gm) || []).length === 3 && (dash.match(/^\s+unsavedDesc: '/gm) || []).length === 3 && (dash.match(/^\s+resaved: '/gm) || []).length === 3,
    'son avertissement existe en français, en anglais et en arabe');
}

tooLargeIsShown().catch((e) => ok(false, 'refus 413 : ' + (e && e.message)))
  .then(() => storageFailureIsSaid()).catch((e) => ok(false, 'stockage plein : ' + (e && e.stack))).then(() => {
if (fail) {
  console.log(`\n  ${fail} contrôle(s) en échec sur ${pass + fail}`);
  process.exit(1);
}
console.log(`  ✓ fusion du catalogue boutique (${pass} contrôles : la vente remonte, la suppression tient, ce que l'autre ajoute arrive)`);
});
