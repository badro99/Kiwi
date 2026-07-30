#!/usr/bin/env node
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
function makeWindow() {
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
    KiwiEnv: { isReal: () => true, local: false, hosted: true, demosAllowed: false },
    setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error('hors ligne')),
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
const C = win.KiwiBoutiqueCatalog;
if (!C || !C._merge) {
  console.log('  ✗ KiwiBoutiqueCatalog._merge introuvable');
  process.exit(1);
}

/* The offline transport guards are as important as merge arithmetic: a local
 * movement that never retries is still lost to the other device, and a failed
 * first read must never authorize a blind overwrite. */
{
  const source = fs.readFileSync(path.join(ROOT, 'assets/boutique-catalog.js'), 'utf8');
  const valid = source.indexOf('if (!res || slug !== VENUE) return false;');
  const mark = source.indexOf('cloud.read[slug] = 1;', valid);
  ok(valid >= 0 && mark > valid, 'un GET serveur en erreur ne valide jamais la lecture avant écriture');
  ok(source.includes("window.addEventListener('online'") && source.includes('if (cloud.dirty) schedulePush(0)'),
    'un mouvement de stock hors-ligne repart dès le retour du réseau');
  ok(source.includes("'kiwiCatalogDirty:v1:'") && source.includes('cloud.dirty = !!dirtyToken(slug)') &&
    source.includes('clearCatalogDirty(slug, sentDirty)'),
  'le stock en attente survit au rechargement et seul le POST correspondant peut l’acquitter');
  ok(/batchDirty = false;\s*markCatalogDirty\(\);/.test(source),
    'un import ou autre mutation groupée est marqué en attente comme une vente isolée');
}

const NOW = Date.now();
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

if (fail) {
  console.log(`\n  ${fail} contrôle(s) en échec sur ${pass + fail}`);
  process.exit(1);
}
console.log(`  ✓ fusion du catalogue boutique (${pass} contrôles : la vente remonte, la suppression tient, ce que l'autre ajoute arrive)`);
