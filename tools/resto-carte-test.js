#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU de la carte du restaurant / café
 * ---------------------------------------------------------------------------
 * La caisse restaurant est l'écran par défaut de kiwi-caisse.html — celui de la
 * vitrine Café Atlas. Pendant longtemps elle servait donc SA carte à tout le
 * monde : un vrai café appairé voyait « Tajine kefta 180 MAD » dans son écran
 * de vente, et pouvait l'encaisser.
 *
 * Trois choses doivent rester vraies, et chacune se paie en argent réel :
 *
 *   · un commerce APPAIRÉ ne voit JAMAIS une donnée semée — ni la carte, ni les
 *     commandes de table, ni les recettes de cuisine ;
 *   · la carte publiée depuis le tableau de bord arrive telle quelle — mêmes
 *     plats, mêmes prix, mêmes catégories, et un plat sans catégorie ne
 *     disparaît pas de l'écran (le patron l'a créé, il se vend) ;
 *   · une vente sortie des livres par le support quitte les totaux du comptoir,
 *     revient si elle est rétablie, et ne bouge plus aux sondages suivants.
 *
 * On teste contre le VRAI code des deux pages (kiwi-caisse.html et
 * kiwi-serveur.html) plutôt que contre une copie : c'est la copie qui dérive.
 * ═════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

const caisse  = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const serveur = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');

/* ── 1. la frontière démo / réel est posée, et sur TOUT ────────────────────── */

ok(/const IS_DEMO = !storeIsReal\(\);/.test(caisse),
  'kiwi-caisse.html déclare IS_DEMO à partir de storeIsReal()');
ok(/const SV_DEMO = !svReal\(\);/.test(serveur),
  'kiwi-serveur.html déclare SV_DEMO à partir de svReal()');

/* Chaque jeu de données semé doit être derrière le drapeau. Un seul oubli et
   c'est un plat inventé sur une addition réelle. */
const GATED = [
  [caisse,  /let menuItems = IS_DEMO \? \[/,      'la carte (menuItems)'],
  [caisse,  /let catLabels = IS_DEMO \? \{/,      'les catégories (catLabels)'],
  [caisse,  /let catColor = IS_DEMO \? \{/,       'les couleurs (catColor)'],
  [caisse,  /const orders = IS_DEMO \? \{/,       'les commandes de table (orders)'],
  [caisse,  /const menu = IS_DEMO \? \[/,         'la seconde carte (menu)'],
  [caisse,  /const KDS_RECIPES = IS_DEMO \? \{/,  'les recettes cuisine (KDS_RECIPES)'],
  [serveur, /let menuItems = SV_DEMO \? \[/,      'la carte du serveur'],
  [serveur, /let catLabels = SV_DEMO \? \{/,      'les catégories du serveur'],
];
GATED.forEach(([src, re, what]) => ok(re.test(src), `${what} est derrière le drapeau démo`));

/* generateOrder() FABRIQUE des lignes à partir de la carte de démo, et il est
   appelé sans condition par l'addition, le partage de note et la remise. Sans
   sortie anticipée, une table réelle sans commande saisie sort une addition
   inventée — le pire bug possible sur une caisse. */
ok(/function generateOrder\([\s\S]{0,900}?if \(!IS_DEMO\) return \[\];/.test(caisse),
  'generateOrder() rend une liste vide chez un vrai commerçant');
ok(/function buildInitialOrder\([\s\S]{0,700}?if \(!SV_DEMO\) return \[\];/.test(serveur),
  'buildInitialOrder() rend une liste vide chez un vrai commerçant (serveur)');

/* Les pastilles de catégories étaient écrites en dur : même avec les plats du
   commerçant chargés, ses rubriques à lui ne pouvaient pas s'afficher. */
ok(!/const cats = \['all', ?'entrees'/.test(caisse), 'la caisse ne code plus les catégories en dur');
ok(!/const cats = \['all','entrees'/.test(serveur),  'le serveur ne code plus les catégories en dur');
ok(/const cats = catOrder;/.test(caisse),  'la caisse lit catOrder');
ok(/const cats = catOrder;/.test(serveur), 'le serveur lit catOrder');

/* Une carte vide doit se dire, sinon la caisse a juste l'air cassée. */
ok(/function emptyMenuHTML\(\)/.test(caisse), 'la caisse a un état vide pour la carte');
ok(/Carte pas encore composée/.test(caisse),  'l\'état vide nomme ce qui manque');
ok(/tableau de bord/.test(caisse.slice(caisse.indexOf('function emptyMenuHTML'), caisse.indexOf('function emptyMenuHTML') + 700)),
  'l\'état vide dit OÙ composer la carte');
ok(/Carte pas encore composée/.test(serveur), 'le serveur aussi a son état vide');

/* ── 2. la carte ne remonte jamais du comptoir vers le bureau ──────────────── */

/* menu-catalog.js s'abonne au magasin et republie sur /api/menu. Chargé sur une
   caisse, il ferait écraser la vraie carte du patron par un cache périmé. */
/* On cherche une BALISE, pas une mention : les deux fichiers citent le module
   en commentaire pour expliquer précisément pourquoi ils ne le chargent pas. */
const loadsMenuCatalog = (src) => /<script[^>]+src=["']assets\/menu-catalog\.js/.test(src);
ok(!loadsMenuCatalog(caisse),
  'la caisse ne charge PAS menu-catalog.js (elle publierait la carte)');
ok(!loadsMenuCatalog(serveur),
  'le serveur ne charge PAS menu-catalog.js');
ok(/<script[^>]+src=["']assets\/menu-catalog\.js/.test(
  fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8')),
  'c\'est bien le tableau de bord qui le charge — le contrôle ci-dessus a donc un sens');
/* Les deux pages ne doivent parler à /api/menu qu'en lecture. */
[['caisse', caisse], ['serveur', serveur]].forEach(([name, src]) => {
  const posts = src.match(/fetch\(\s*'\/api\/menu'[^)]*method:\s*'POST'/g) || [];
  eq(posts.length, 0, `${name} ne publie jamais sur /api/menu`);
});

/* ── 3. la projection serveur → écran de vente ─────────────────────────────── */

/* On rejoue rebuildCarte() extrait du fichier, contre la charge utile réelle de
   GET /api/menu (celle que sanitizeMenu renvoie). */
function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} introuvable`);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`${name} non refermée`);
}

const CAT_PALETTE = ['var(--forest)', '#B5532A', '#C9922E', '#A8574E', '#6E7B3D', '#2E7D8C', '#8A5A9E'];
const PAYLOAD = {
  cats: [
    { id: 'c-chaud', name: 'Boissons chaudes', sub: [] },
    { id: 'c-froid', name: 'Boissons fraîches', sub: [] },
  ],
  items: [
    { id: 'a-01', name: 'Nous-nous',   price: 14, catId: 'c-chaud', avail: true },
    { id: 'a-02', name: 'Café noir',   price: 12, catId: 'c-chaud', avail: true, station: 'bar' },
    { id: 'a-03', name: 'Citronnade',  price: 20, catId: 'c-froid', avail: true },
    { id: 'a-04', name: 'Épuisé',      price: 30, catId: 'c-froid', avail: false },
    { id: 'a-05', name: 'Bouteille',   price: 8,  catId: null,      avail: true },
    { id: 'a-06', name: 'Fantôme',     price: 9,  catId: 'c-inexistante', avail: true },
  ],
};

function runRebuild(payload) {
  const scope = {
    IS_DEMO: false, CAT_PALETTE,
    catLabels: { all: 'Tout' }, catColor: {}, catOrder: ['all'], menuItems: [],
    activeCat: 'all',
    caisseCarte: () => payload,
    renderCatPills() {}, renderMenu() {},
  };
  const body = extract(caisse, 'rebuildCarte');
  const fn = new Function('scope', `
    let { catLabels, catColor, catOrder, menuItems, activeCat } = scope;
    const { IS_DEMO, CAT_PALETTE, caisseCarte, renderCatPills, renderMenu } = scope;
    ${body}
    const changed = rebuildCarte();
    return { changed, catLabels, catColor, catOrder, menuItems, activeCat };
  `);
  return fn(scope);
}

const r = runRebuild(PAYLOAD);
ok(r.changed === true, 'rebuildCarte() signale qu\'elle a reconstruit');
eq(r.menuItems.length, 5, 'un plat marqué indisponible ne descend pas au comptoir');
ok(!r.menuItems.some((m) => m.name === 'Épuisé'), 'le plat indisponible est bien celui qui manque');

const noCat = r.menuItems.find((m) => m.id === 'a-05');
ok(!!noCat, 'un plat SANS catégorie reste vendable');
eq(noCat.cat, '_autres', 'il atterrit dans « Autres »');
eq(r.catLabels._autres, 'Autres', '« Autres » a un libellé lisible');

const ghost = r.menuItems.find((m) => m.id === 'a-06');
eq(ghost.cat, '_autres', 'un plat pointant une catégorie disparue atterrit aussi dans « Autres », pas dans le vide');

eq(r.menuItems.find((m) => m.id === 'a-02').price, 12, 'le prix du patron passe tel quel');
eq(r.menuItems.find((m) => m.id === 'a-02').station, 'bar', 'le poste de préparation suit le plat');
eq(r.catLabels['c-chaud'], 'Boissons chaudes', 'la catégorie du patron garde SON nom');
ok(!r.catLabels.tajines, 'aucune catégorie de la démo ne survit');

eq(r.catOrder[0], 'all', '« Tout » reste en tête');
eq(r.catOrder.length, 4, 'les rubriques réelles + Autres, et rien d\'autre');
ok(CAT_PALETTE.includes(r.catColor['c-chaud']),
  'les couleurs viennent de la palette maison — pas d\'une teinte inventée');
ok(r.catColor['c-chaud'] !== r.catColor['c-froid'],
  'deux rubriques voisines ne portent pas la même couleur');

/* Une carte vide ne doit pas écraser celle qu'on affiche déjà : hors ligne,
   mieux vaut la dernière carte connue qu'un écran blanc. */
const empty = runRebuild(null);
eq(empty.changed, false, 'sans miroir, rebuildCarte() ne touche à rien');
eq(empty.menuItems.length, 0, 'et ne fabrique pas de plats');

/* La rubrique ouverte doit rester valide après un changement de carte. */
const stale = (() => {
  const scope = {
    IS_DEMO: false, CAT_PALETTE,
    catLabels: { all: 'Tout', tajines: 'Tajines' }, catColor: {}, catOrder: ['all', 'tajines'],
    menuItems: [], activeCat: 'tajines',
    caisseCarte: () => PAYLOAD, renderCatPills() {}, renderMenu() {},
  };
  const fn = new Function('scope', `
    let { catLabels, catColor, catOrder, menuItems, activeCat } = scope;
    const { IS_DEMO, CAT_PALETTE, caisseCarte, renderCatPills, renderMenu } = scope;
    ${extract(caisse, 'rebuildCarte')}
    rebuildCarte();
    return { activeCat };
  `);
  return fn(scope);
})();
eq(stale.activeCat, 'all', 'une rubrique qui n\'existe plus retombe sur « Tout » au lieu d\'un écran vide');

/* ── 4. le miroir local est rangé par établissement ────────────────────────── */

ok(/const CARTE_MIRROR = 'kiwi:menuMirror:v1:';/.test(caisse),
  'le miroir de la carte est préfixé kiwi: (donc balayé au changement de compte)');
ok(/CARTE_MIRROR \+ slug/.test(caisse),
  'et rangé par slug — deux commerces sur un appareil ne se mélangent pas');
ok(/kiwi:openingFloat:v1:/.test(caisse),
  'le fond d\'ouverture mémorisé est lui aussi par établissement et sous kiwi:');

/* ── 5. les ventes sorties des livres quittent le comptoir ─────────────────── */

/* On rejoue reconcileVoids() extraite du fichier, contre le VRAI refMatcher. */
const posSaleSrc = fs.readFileSync(path.join(ROOT, 'assets/pos-sale.js'), 'utf8');
ok(/refMatcher: matcher/.test(posSaleSrc), 'KiwiPosSale expose bien refMatcher');

function makeMatcher() {
  const g = { window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { addEventListener() {} } };
  const fn = new Function('window', 'localStorage', 'document', posSaleSrc + '\nreturn window.KiwiPosSale;');
  return fn(g.window, g.localStorage, g.document).refMatcher;
}
const refMatcher = makeMatcher();

function runVoids(journalRows, refs, opts) {
  const scope = {
    journal: journalRows,
    storeIsReal: () => (opts && opts.real === false ? false : true),
    window: { KiwiPosSale: { refMatcher } },
    renderShiftStats() { scope.painted = (scope.painted || 0) + 1; },
    persistShift() { scope.persisted = (scope.persisted || 0) + 1; },
    saveProvisional() {},
    $: () => ({ classList: { contains: () => false } }),
    painted: 0, persisted: 0,
  };
  const fn = new Function('scope', `
    const { journal, storeIsReal, window, renderShiftStats, persistShift, saveProvisional, $ } = scope;
    ${extract(caisse, 'reconcileVoids')}
    return reconcileVoids(scope.__refs);
  `);
  scope.__refs = refs;
  const touched = fn(scope);
  return { touched, journal: journalRows, painted: scope.painted, persisted: scope.persisted };
}

const mkJournal = () => ([
  { ref: 'AB-1', amount: 44, method: 'cash', tip: 0 },
  { ref: 'AB-2', amount: 80, method: 'card', tip: 5 },
]);

let J = mkJournal();
let v = runVoids(J, ['AB-1']);
eq(v.touched, 1, 'une vente retirée est marquée');
eq(J[0].voided, true, 'la bonne vente porte le drapeau');
eq(!!J[1].voided, false, 'la voisine n\'est pas touchée');
ok(v.persisted >= 1, 'le poste est réécrit — sinon un rechargement ressuscite la vente');

/* /api/feed renvoie la liste ENTIÈRE des retraits toutes les 90 s. Rejouer ne
   doit rien changer, sinon les totaux dérivent toute la journée. */
let drift = 0;
for (let i = 0; i < 25; i++) drift += runVoids(J, ['AB-1']).touched;
eq(drift, 0, 'vingt-cinq sondages de plus ne bougent rien (idempotent)');

/* Rétablir : la liste ne contient plus la référence ⇒ la vente revient. */
v = runVoids(J, []);
eq(v.touched, 1, 'le rétablissement est vu');
eq(!!J[0].voided, false, 'la vente est remise dans les livres');
eq(runVoids(J, []).touched, 0, 'et le rétablissement est idempotent lui aussi');

/* Une référence étrangère ne doit toucher à rien. */
J = mkJournal();
eq(runVoids(J, ['ZZ-9']).touched, 0, 'une référence d\'un autre magasin ne retire rien');

/* La démo n'a pas de livres à tenir. */
J = mkJournal();
eq(runVoids(J, ['AB-1'], { real: false }).touched, 0, 'la démo ne réconcilie rien');

/* Les totaux et la liste doivent EXCLURE le retiré — c'est là qu'un caissier
   rembourserait une vente qui n'existe plus. */
ok(/if \(e\.voided\) continue;/.test(caisse), 'journalTotals() saute les ventes retirées');
ok(/journal\.filter\(e => !e\.voided\)\.reverse\(\)/.test(caisse), 'le journal affiché les cache');

/* ── 6. les boutons d'impression impriment ─────────────────────────────────── */

ok(!/toast\('Ticket en impression…'\)/.test(caisse),
  'plus aucun bouton n\'annonce une impression sans imprimer');
ok(!/toast\('Envoyé · SMS \/ WhatsApp'\)/.test(caisse),
  'plus aucun bouton n\'annonce un envoi sans envoyer');
ok(!/toast\('Bon de passation envoyé à l\\'imprimante'\); return;/.test(caisse),
  'le bon de passation n\'annonce plus une impression sans imprimer');
ok(/function printSaleTicket\(/.test(caisse), 'un chemin d\'impression unique existe');
ok(/window\.KiwiReceipt\.print\(doc\)/.test(caisse), 'il passe par KiwiReceipt.print (qui a le repli système)');
ok(/data-jr-print=/.test(caisse), 'l\'icône imprimante du journal a sa propre cible');
ok(/const pr = e\.target\.closest\('\[data-jr-print\]'\);[\s\S]{0,200}?stopPropagation\(\)/.test(caisse),
  'et elle est interceptée AVANT la ligne, sinon elle ouvre l\'aperçu');

/* Le repli « pilote du système » : sans lui, une caisse Windows dont
   l'imprimante est installée dans le système n'imprime rien du tout. */
ok(/KP\.browserReceipt\(/.test(caisse), 'l\'addition se rabat sur le pilote du système');
ok(!/vérifiez l’imprimante dans Réglages/.test(caisse),
  'plus de renvoi vers un écran « Réglages » qui n\'existe pas sur la caisse');

/* Deux pièces entièrement écrites et jamais appelées. */
ok(/KiwiHardware.*openDrawer|H\.openDrawer/.test(caisse), 'le tiroir-caisse s\'ouvre sur un paiement espèces');
ok(/KP\.printKitchen\(/.test(caisse), 'le bon de cuisine part à l\'imprimante');

/* ── 7. le signet de révision nomme la copie qu'il décrit ──────────────────── */

const pagesPro = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
const pdsBlock = pagesPro.slice(pagesPro.indexOf("feature: 'floorplan'"), pagesPro.indexOf("feature: 'floorplan'") + 900);
ok(/localKey:/.test(pdsBlock), 'le plan de salle du tableau de bord déclare sa clé locale');
const caisseFp = caisse.slice(caisse.indexOf("feature: 'floorplan'"), caisse.indexOf("feature: 'floorplan'") + 900);
ok(/localKey:/.test(caisseFp), 'le plan de salle de la caisse déclare la sienne');

/* ── 8. un duplicata dit DUPLICATA ─────────────────────────────────────────── */

const receiptSrc = fs.readFileSync(path.join(ROOT, 'assets/receipt.js'), 'utf8');
ok(/opts\.copy === true \? d\.T\.copy : str\(opts\.copy, 40\)/.test(receiptSrc),
  'une réimpression porte « DUPLICATA » et non « true »');

/* ── 9. le poste de préparation survit au serveur ──────────────────────────── */

const menuApi = fs.readFileSync(path.join(ROOT, 'functions/api/menu.js'), 'utf8');
ok(/station: str\(it && it\.station, 40\)/.test(menuApi),
  'sanitizeMenu ne retire plus le poste de préparation à la publication');
ok(/\(m && m\.station\) \|\| \(m && KDS_CAT_STATION\[m\.cat\]\)/.test(caisse),
  'la caisse route sur le poste du plat avant la table par catégorie');

/* ═════════════════════════════════════════════════════════════════════════ */
console.log(fail === 0
  ? `  ✓ carte du restaurant (${pass} contrôles : frontière démo, projection, retraits, impression)`
  : `  ✗ ${fail} échec(s) sur ${pass + fail} contrôles`);
process.exit(fail === 0 ? 0 : 1);
