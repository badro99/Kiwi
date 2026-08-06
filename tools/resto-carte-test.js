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
const menuCatalogSrc = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog.js'), 'utf8');

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
  // Le routage vit sur la CATÉGORIE : « Boissons chaudes → bar », une fois.
  cats: [
    { id: 'c-chaud', name: 'Boissons chaudes', station: 'bar', sub: [] },
    { id: 'c-froid', name: 'Boissons fraîches', sub: [] },
  ],
  items: [
    { id: 'a-01', name: 'Nous-nous',   price: 14, catId: 'c-chaud', avail: true },
    // `station` sur le PLAT : un reste de l'ancien modèle. Il ne doit plus rien
    // décider — sinon un vieux document continuerait de router en douce.
    { id: 'a-02', name: 'Café noir',   price: 12, catId: 'c-chaud', avail: true, station: 'st_perime' },
    { id: 'a-03', name: 'Citronnade',  price: 20, catId: 'c-froid', avail: true },
    { id: 'a-04', name: 'Épuisé',      price: 30, catId: 'c-froid', avail: false },
    { id: 'a-05', name: 'Bouteille',   price: 8,  catId: null,      avail: true },
    { id: 'a-06', name: 'Fantôme',     price: 9,  catId: 'c-inexistante', avail: true },
  ],
};

/* La palette des postes, telle qu'elle est écrite dans la caisse — on la relit
   du fichier plutôt que de la recopier, sinon le test validerait sa propre
   copie le jour où la vraie change. */
const STATION_PALETTE = JSON.parse(
  (/const STATION_PALETTE = (\[[^\]]*\]);/.exec(caisse) || [, '[]'])[1].replace(/'/g, '"'));

function runRebuild(payload) {
  const scope = {
    IS_DEMO: false, CAT_PALETTE, STATION_PALETTE,
    catLabels: { all: 'Tout' }, catColor: {}, catOrder: ['all'], menuItems: [],
    activeCat: 'all',
    // kdsReady: false → rebuildCarte ne doit PAS toucher à l'écran cuisine tant
    // qu'il n'est pas monté (c'est tout l'objet de ce drapeau : au premier
    // appel, à l'amorçage, la section KDS n'est pas encore évaluée).
    carteState: { stations: [], kitchenId: '', opts: [], kdsReady: false },
    caisseCarte: () => payload,
    renderCatPills() {}, renderMenu() {},
  };
  const body = extract(caisse, 'rebuildCarte');
  const fn = new Function('scope', `
    let { catLabels, catColor, catOrder, menuItems, activeCat } = scope;
    const { IS_DEMO, CAT_PALETTE, STATION_PALETTE, carteState, caisseCarte, renderCatPills, renderMenu } = scope;
    // Si rebuildCarte l'appelle alors que kdsReady est faux, le test explose —
    // et c'est voulu : ce serait la ReferenceError silencieuse de l'amorçage.
    function kdsRepaintStations() { throw new Error('kdsRepaintStations appelé alors que l\\'écran cuisine n\\'est pas monté'); }
    ${body}
    const changed = rebuildCarte();
    return { changed, catLabels, catColor, catOrder, menuItems, activeCat, stations: carteState.stations, kitchenId: carteState.kitchenId, opts: carteState.opts };
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
/* LE point du modèle : le poste vient de la catégorie, pour tous ses plats, y
   compris ceux auxquels personne n'a jamais rien dit — et un vieux `station`
   posé sur le plat ne décide plus de rien. */
eq(r.menuItems.find((m) => m.id === 'a-01').station, 'bar',
  'un plat auquel personne n\'a rien dit suit sa CATÉGORIE — « Boissons chaudes → bar »');
eq(r.menuItems.find((m) => m.id === 'a-02').station, 'bar',
  'un plat qui portait encore un poste de l\'ancien modèle suit quand même sa catégorie');
eq(r.menuItems.find((m) => m.id === 'a-03').station, '',
  'une catégorie sans poste ne route rien : ses plats partiront en cuisine');
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
    IS_DEMO: false, CAT_PALETTE, STATION_PALETTE,
    catLabels: { all: 'Tout', tajines: 'Tajines' }, catColor: {}, catOrder: ['all', 'tajines'],
    menuItems: [], activeCat: 'tajines',
    carteState: { stations: [], kdsReady: false },
    caisseCarte: () => PAYLOAD, renderCatPills() {}, renderMenu() {},
  };
  const fn = new Function('scope', `
    let { catLabels, catColor, catOrder, menuItems, activeCat } = scope;
    const { IS_DEMO, CAT_PALETTE, STATION_PALETTE, carteState, caisseCarte, renderCatPills, renderMenu } = scope;
    function kdsRepaintStations() {}
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

/* ── 9. les postes de préparation, du bureau jusqu'au bon papier ───────────── */

const menuApi = fs.readFileSync(path.join(ROOT, 'functions/api/menu.js'), 'utf8');
ok(/station: str\(c && c\.station, 40\)/.test(menuApi),
  'sanitizeMenu garde le poste de la CATÉGORIE — c\'est là que vit le routage');
ok(/out\.kitchenId = str\(raw\.kitchenId, 40\)/.test(menuApi),
  'sanitizeMenu garde le nom de la cuisine — sans lui la caisse retombe sur « le premier de la liste »');
ok(/const stations = Array\.isArray\(raw\.stations\)/.test(menuApi),
  'sanitizeMenu laisse passer la LISTE des postes, pas seulement celui du plat');
ok(/\/\^#\[0-9a-fA-F\]\{6\}\$\/\.test/.test(menuApi),
  'une couleur de poste qui n\'est pas un #RRGGBB est refusée — elle finit dans un attribut style');

/* rebuildCarte projette les postes du patron, dans SON ordre. */
eq(r.stations.length, 0, 'une carte publiée sans postes n\'en invente aucun');

const withStations = runRebuild(Object.assign({}, PAYLOAD, {
  stations: [
    { id: 'bar', name: 'Bar', color: '#3677A6' },
    { id: 'cuisine', name: 'Cuisine', color: 'rouge vif' },   // couleur illisible
  ],
}));
eq(withStations.stations.length, 2, 'les deux postes du patron descendent au comptoir');
eq(withStations.stations[0].id, 'bar', 'l\'ordre du patron est conservé — c\'est l\'ordre des onglets de l\'écran cuisine');
/* Le repli est NOMMÉ. Ici la carte ne le dit pas : on retombe sur le premier
   poste, ce qui redonne exactement l'ancien comportement à une carte écrite
   avant que ce réglage existe. */
eq(withStations.kitchenId, 'bar', 'sans kitchenId, la cuisine reste le premier poste — aucune carte ne change de routage à la mise à jour');
const namedKitchen = runRebuild(Object.assign({}, PAYLOAD, {
  kitchenId: 'cuisine',
  stations: [
    { id: 'bar', name: 'Bar', color: '#3677A6' },
    { id: 'cuisine', name: 'Cuisine', color: '#1F5D3C' },
  ],
}));
eq(namedKitchen.kitchenId, 'cuisine',
  'la cuisine nommée gagne, même rangée en second — monter un onglet ne détourne plus la carte');
const ghostKitchen = runRebuild(Object.assign({}, PAYLOAD, {
  kitchenId: 'st_supprime',
  stations: [{ id: 'bar', name: 'Bar', color: '#3677A6' }],
}));
eq(ghostKitchen.kitchenId, 'bar',
  'une cuisine supprimée ne laisse pas la caisse sans repli');
eq(withStations.stations[0].raw, '#3677A6', 'une couleur valable passe telle quelle');
ok(STATION_PALETTE.includes(withStations.stations[1].raw),
  'une couleur illisible retombe sur la palette, jamais dans un attribut style tel quel');

/* kdsStationFor — LA règle de routage, une seule pour toute la caisse. */
function runStationFor(opts) {
  const scope = Object.assign({
    IS_DEMO: false, STATION_PALETTE,
    carteState: { stations: [], kitchenId: '', kdsReady: true },
    KDS_CAT_STATION: { boissons: 'boissons' },
    KDS_STATIONS_DEMO: [{ id: 'cuisson', name: 'Cuisson chaude', raw: '#1F5D3C' }],
    KDS_STATION_SOLO: { id: 'cuisson', name: 'Cuisine', raw: STATION_PALETTE[0] },
  }, opts);
  const fn = new Function('scope', `
    const { IS_DEMO, STATION_PALETTE, carteState, KDS_CAT_STATION, KDS_STATIONS_DEMO, KDS_STATION_SOLO } = scope;
    let kdsActiveStation = 'all';
    const $ = () => null;
    function kdsStationBar() { return ''; }
    ${extract(caisse, 'kdsStations')}
    ${extract(caisse, 'kdsKitchenId')}
    ${extract(caisse, 'kdsStationFor')}
    return { stationFor: (m) => kdsStationFor(m), list: kdsStations() };
  `);
  return fn(scope);
}

const solo = runStationFor({});
eq(solo.list.length, 1, 'un café qui n\'a déclaré aucun poste en a UN, pas zéro et pas les sept de la démo');
eq(solo.list[0].id, 'cuisson', 'ce poste unique implicite est sa cuisine');
eq(solo.stationFor({ id: 'x', station: '' }), 'cuisson', 'un plat sans poste y va');

const STATIONS_2 = [
  { id: 'st_1', name: 'Cuisson', raw: '#1F5D3C' },
  { id: 'st_2', name: 'Bar', raw: '#3677A6' },
];
const real = runStationFor({ carteState: { stations: STATIONS_2, kitchenId: 'st_1', kdsReady: true } });
eq(real.stationFor({ id: 'a', station: 'st_2' }), 'st_2', 'le poste de la catégorie gagne');
eq(real.stationFor({ id: 'b', station: '' }), 'st_1',
  'un plat qu\'aucune catégorie n\'envoie ailleurs part en cuisine');
eq(real.stationFor({ id: 'c', station: 'st_supprime' }), 'st_1',
  'un poste supprimé au bureau ne laisse pas le plat dans un filtre fantôme');
eq(real.stationFor(null), 'st_1', 'un plat introuvable dans la carte part quand même quelque part');
eq(real.stationFor({ id: 'd', station: '', cat: 'boissons' }), 'st_1',
  'la table par catégorie de la DÉMO ne s\'applique pas à un vrai commerçant');

/* LE piège qu'on vient de retirer : l'ordre de la liste ne route plus rien.
   Même liste, même carte — seule la cuisine nommée change, et c'est elle seule
   qui décide. Monter le bar en tête ne déverse plus la carte au bar. */
const kitchenLast = runStationFor({ carteState: { stations: [
  { id: 'st_2', name: 'Bar', raw: '#3677A6' },
  { id: 'st_1', name: 'Cuisson', raw: '#1F5D3C' },
], kitchenId: 'st_1', kdsReady: true } });
eq(kitchenLast.stationFor({ id: 'e', station: '' }), 'st_1',
  'le bar rangé en PREMIER ne devient pas le poste par défaut — l\'ordre n\'est plus un réglage');
const noKitchen = runStationFor({ carteState: { stations: STATIONS_2, kitchenId: '', kdsReady: true } });
eq(noKitchen.stationFor({ id: 'f', station: '' }), 'st_1',
  'une carte d\'avant ce changement route exactement comme hier : premier poste');

const demo = runStationFor({ IS_DEMO: true });
eq(demo.list.length, 1, 'la démo garde SA liste de postes');
eq(demo.stationFor({ id: 'e', station: '', cat: 'boissons' }), 'boissons',
  'en démo, la table par catégorie route encore');

/* ── 9 bis. les options d'un produit, du bureau jusqu'à la question posée ──
   Le comptoir doit POUVOIR poser la question : sans la bibliothèque de groupes
   et sans les identifiants portés par le produit, la caisse ajouterait le café
   à la note sans jamais demander le lait. */
ok(/out\.opts = opts\.map/.test(menuApi),
  'sanitizeMenu publie la bibliothèque de groupes d\'options');
ok(/kind: \(g && g\.kind\) === 'many' \? 'many' : 'one'/.test(menuApi),
  'deux règles seulement — un choix, ou plusieurs — et rien d\'autre ne passe');
ok(/required: !!\(g && g\.required\)/.test(menuApi),
  '« obligatoire » survit à la publication : c\'est lui qui bloque l\'ajout au comptoir');
ok(/opts: \(Array\.isArray\(it && it\.opts\)/.test(menuApi),
  'chaque produit garde la liste des groupes qu\'il porte');

const withOpts = runRebuild(Object.assign({}, PAYLOAD, {
  opts: [
    { id: 'og_lait', name: 'Type de lait', kind: 'one', required: true, choices: [
      { id: 'oc_e', name: 'Entier', price: 0 }, { id: 'oc_v', name: 'Végétal', price: 3 } ] },
    { id: 'og_vide', name: 'Groupe sans choix', kind: 'one', required: false, choices: [] },
  ],
  items: PAYLOAD.items.map((it) => (it.id === 'a-02' ? Object.assign({}, it, { opts: ['og_lait', 'og_vide', 'og_fantome'] }) : it)),
}));
eq(withOpts.opts.length, 1,
  'un groupe SANS choix ne descend pas au comptoir — il ouvrirait une fenêtre sans réponse possible');
eq(withOpts.opts[0].id, 'og_lait', 'le groupe utilisable, lui, descend');
eq(withOpts.opts[0].required, true, '« obligatoire » arrive jusqu\'au comptoir');
eq(withOpts.opts[0].choices.length, 2, 'avec ses deux choix');
eq(withOpts.opts[0].choices[1].price, 3, 'et le supplément de l\'un d\'eux');
const cafe = withOpts.menuItems.find((m) => m.id === 'a-02');
eq(cafe.opts.length, 3, 'le produit garde ses identifiants tels quels — le tri se fait à l\'usage');
const plain = withOpts.menuItems.find((m) => m.id === 'a-01');
eq(plain.opts.length, 0, 'un produit sans options n\'en invente aucune : il s\'ajoute d\'un seul geste');

/* Le tri à l'usage : un identifiant orphelin (groupe supprimé au bureau, ou
   groupe vide) ne doit pas ouvrir une question sans réponse. */
const caisseSrc = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
ok(/return ids\.map\(id => lib\.find\(g => g && g\.id === id\)\)\.filter\(Boolean\)/.test(caisseSrc),
  'itemOptGroups écarte un groupe disparu plutôt que de bloquer la vente');
ok(/const groups = itemOptGroups\(item\);\s*\n\s*if \(groups\.length\) \{ openOptSheet/.test(caisseSrc),
  'un produit à options ouvre la feuille AVANT d\'entrer dans la note');
ok(/function addToTableOrder\(tableId, itemId\)[\s\S]{0,260}itemOptGroups\(item\)[\s\S]{0,220}openOptSheet\(item, groups,[\s\S]{0,100}pushTableOrderLine/.test(caisseSrc),
  'la prise de commande à table ouvre la même feuille d\'options que la vente à emporter');
ok(/const line = tableOrders\[tableId\]\.find\(l => l\.id === item\.id[\s\S]{0,180}\(l\.optSig \|\| ''\) === sig/.test(caisseSrc)
  && /price: item\.price \+ extra, qty: 1, note: '', opts: \(opts \|\| \[\]\)\.slice\(\), optSig: sig/.test(caisseSrc),
  'une table conserve chaque combinaison d\'options sur une ligne distincte et tarifée');
ok(/name: lineLabel\(l\)/.test(caisseSrc),
  'les options de la table restent lisibles sur l\'addition et le reçu');
ok(/missing\.length \? 'disabled' : ''/.test(caisseSrc),
  'tant qu\'un groupe obligatoire est sans réponse, « Ajouter » ne répond pas');
ok(/c\.optSig \|\| ''\) === sig/.test(caisseSrc),
  'deux cafés aux laits différents font deux lignes — les empiler en enverrait un seul en cuisine');
ok(/paperNote: kitchenNote\(l\), visuals: optVisuals\(l\.opts\)/.test(caisseSrc),
  'les choix partent en texte sur le papier et en repères visuels structurés sur le KDS');
ok(/note: i\.paperNote \|\| i\.note \|\| '', visuals: i\.visuals \|\| \[\]/.test(caisseSrc),
  'le relais vers une tablette cuisine distante conserve aussi le texte des options');
ok(/emoji: optionEmoji\(c && c\.emoji\)/.test(menuApi)
  && /OPTION_EMOJIS = new Set/.test(menuApi),
  'le repère visuel choisi survit à la publication sans accepter de texte libre');
ok(/emoji: String\(c\.emoji \|\| ''\)/.test(caisseSrc),
  'la caisse conserve le repère visuel de chaque choix');
ok(/\.mx-og-ch\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*48px minmax\(0, 1fr\) auto auto;/.test(menuCatalogSrc),
  'le bouton emoji et le nom du choix gardent chacun leur colonne sans se chevaucher');

/* Le bon papier : un par poste, avec SES lignes, et jamais deux jobs en même
   temps sur une thermique. */
/* Les bons partent en CHAÎNE (une thermique ne mélange pas deux jobs), donc le
   premier ne s'imprime qu'au tour de boucle suivant : le test doit rendre la
   main avant de lire, sinon il ne verrait jamais un seul bon. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function runTickets(items, stations) {
  const jobs = [];
  const scope = {
    STATION_PALETTE, IS_DEMO: false,
    carteState: { stations: stations, kitchenId: (stations[0] || {}).id || '', kdsReady: true },
    KDS_CAT_STATION: {}, KDS_STATIONS_DEMO: [], KDS_STATION_SOLO: { id: 'cuisson', name: 'Cuisine', raw: '#000000' },
    jobs,
  };
  const fn = new Function('scope', `
    const { STATION_PALETTE, IS_DEMO, carteState, KDS_CAT_STATION, KDS_STATIONS_DEMO, KDS_STATION_SOLO, jobs } = scope;
    const window = { KiwiPrinter: {
      isConnected: () => true,
      printKitchen: (o) => { jobs.push(o); return Promise.resolve({ ok: true }); },
    } };
    const pad2HO = (n) => String(n).padStart(2, '0');
    ${extract(caisse, 'kdsStations')}
    ${extract(caisse, 'kdsKitchenId')}
    ${extract(caisse, 'kdsStationFor')}
    ${extract(caisse, 'printKitchenTickets')}
    printKitchenTickets({ num: 7, sentAt: new Date(2026, 0, 1, 12, 5) }, ${JSON.stringify(items)});
  `);
  fn(scope);
  return jobs;
}

const STS = [{ id: 'st_1', name: 'Cuisson', raw: '#1F5D3C' }, { id: 'st_2', name: 'Bar', raw: '#3677A6' }];
const split = runTickets([
  { q: 1, n: 'Café noir', note: '', stations: ['st_2'] },
  { q: 2, n: 'Harira', note: 'bien chaude', stations: ['st_1'] },
  { q: 1, n: 'Pastilla', note: '', stations: ['st_1', 'st_2'] },
], STS);
const solo1 = runTickets([{ q: 1, n: 'Café noir', note: '', stations: ['st_2'] }], STS);
const ticketChecks = tick().then(() => {
  eq(split.length, 2, 'deux postes concernés → deux bons, pas un fourre-tout');
  if (split.length === 2) {
    eq(split[0].title, 'CUISSON', 'les bons sortent dans l\'ordre des postes du patron');
    eq(split[1].title, 'BAR', 'et le second est le sien');
    eq(split[0].order, '#7', 'chaque bon porte le numéro de commande pour recoller au passe');
    eq(split[0].time, '12:05', 'et son heure d\'envoi');
    eq(split[0].items.map((i) => i.name).join('|'), 'Harira|Pastilla', 'la cuisson ne reçoit QUE ses lignes');
    eq(split[1].items.map((i) => i.name).join('|'), 'Café noir|Pastilla', 'le bar ne reçoit QUE les siennes');
    eq(split[0].items[0].note, 'bien chaude', 'la note du client suit son plat sur le bon');
  }
  eq(solo1.length, 1, 'un seul poste concerné → un seul bon, comme avant');
  if (solo1.length === 1) eq(solo1[0].title, 'BAR', 'et il est adressé à ce poste');
});

/* Une caisse SANS imprimante n'envoie rien et ne jette pas : l'écran cuisine
   reste le chemin nominal, le papier est un plus. */
const noPrinterJobs = [];
const noPrinter = (() => {
  const jobs = noPrinterJobs;
  const fn = new Function('jobs', `
    const window = { KiwiPrinter: { isConnected: () => false, printKitchen: (o) => { jobs.push(o); } } };
    const IS_DEMO = false;
    const carteState = { stations: [], kdsReady: true };
    const KDS_CAT_STATION = {}, KDS_STATIONS_DEMO = [], KDS_STATION_SOLO = { id: 'c', name: 'Cuisine', raw: '#000000' };
    const pad2HO = (n) => String(n).padStart(2, '0');
    ${extract(caisse, 'kdsStations')}
    ${extract(caisse, 'kdsKitchenId')}
    ${extract(caisse, 'kdsStationFor')}
    ${extract(caisse, 'printKitchenTickets')}
    printKitchenTickets({ num: 1, sentAt: new Date() }, [{ q: 1, n: 'X', note: '', stations: ['c'] }]);
    return jobs.length;
  `);
  return fn(jobs);
})();
eq(noPrinter, 0, 'sans imprimante jointe, aucun bon n\'est tenté — et rien ne casse');

/* La salle part en cuisine, elle aussi — et n'y renvoie pas deux fois. */
ok(/function sendTableToKitchen\(tableId\)/.test(caisse),
  'une mesa validée a un chemin vers l\'écran cuisine');
ok(/\.filter\(l => l && l\.qty > 0 && !l\.sent\)/.test(caisse),
  'seules les lignes JAMAIS envoyées repartent — rouvrir une mesa ne relance pas le repas');
ok(/lines\.forEach\(\(l\) => \{ l\.sent = true; \}\);/.test(caisse),
  'et elles sont marquées une fois parties');
ok(/kdsOrders: storeIsReal\(\) \? kdsOrders\.filter\(o => !staleQueuedServerTicket\(o\)\)\.map/.test(caisse),
  'le board cuisine persiste sans réenregistrer les vieux tickets serveur en attente');
ok(/if \(!o \|\| staleQueuedServerTicket\(o\)\) return;/.test(caisse),
  'un ancien ticket C-xxx en attente ne ressuscite pas au rechargement');
ok(/o\.opNum == null.*o\.status !== 'new'.*o\.status !== 'held'/.test(caisse),
  'la purge vise les tickets serveur en attente, pas une préparation active');
ok(/let\s+kdsOrderSeq = IS_DEMO \? 52 : 0;/.test(caisse),
  'un vrai commerçant commence sa numérotation à 1, pas à 53');

/* La tablette du serveur annonce la VRAIE destination. Elle triait sur une
   catégorie nommée `boissons` — une rubrique de la démo : chez un vrai café, le
   test ne tombait jamais juste et une tournée de thés partait « · cuisine ». */
ok(!/const drinkCats = new Set\(\['boissons'\]\)/.test(serveur),
  'le serveur ne devine plus la destination depuis une catégorie de la démo');
ok(/function svStationNames\(order\)/.test(serveur),
  'il nomme les postes réellement concernés');
ok(/if \(SV_DEMO \|\| !svStations\.length\) return '';/.test(serveur),
  'et sans postes déclarés il ne nomme rien plutôt que d\'inventer');

function runSvNames(order, stations, items) {
  const fn = new Function('scope', `
    const { SV_DEMO } = scope;
    let svStations = scope.svStations;
    const menuItems = scope.menuItems;
    ${extract(serveur, 'svStationNames')}
    return svStationNames(scope.order);
  `);
  return fn({ SV_DEMO: false, svStations: stations, menuItems: items, order });
}
const SV_ITEMS = [{ id: 'i1', station: 'st_2' }, { id: 'i2', station: '' }, { id: 'i3', station: 'st_1' }];
const SV_STS = [{ id: 'st_1', name: 'Cuisson' }, { id: 'st_2', name: 'Bar' }];
eq(runSvNames([{ id: 'i1', qty: 1 }], SV_STS, SV_ITEMS), 'bar',
  'une tournée de cafés annonce le bar, pas la cuisine');
eq(runSvNames([{ id: 'i1', qty: 1 }, { id: 'i3', qty: 1 }], SV_STS, SV_ITEMS), 'cuisson + bar',
  'deux postes concernés se lisent dans l\'ordre du patron, pas dans celui de la saisie');
eq(runSvNames([{ id: 'i2', qty: 1 }], SV_STS, SV_ITEMS), 'cuisson',
  'un plat sans poste part vers le défaut, et on le dit');
eq(runSvNames([{ id: 'i1', qty: 1 }], [], SV_ITEMS), '',
  'sans postes déclarés, aucune destination inventée');

/* ── 10. le carnet clients existe VRAIMENT sur la caisse restaurant ────────── */

ok(/creditSaleToClient\(entry\);/.test(caisse),
  'recordSale crédite la fidélité du client attaché — le carnet n\'était jamais appelé ici');
ok(/saleClient = null;\s+\/\/ une note = un passage/.test(caisse),
  'une addition partagée en quatre ne donne pas quatre tampons');
ok(/KiwiClients\.recordPurchase\(cid, \{ amount: entry\.amount \}\)/.test(caisse),
  'et c\'est bien KiwiClients qui applique SES règles de fidélité');
ok(/if \(saleClient && saleClient\.ctx && saleClient\.ctx !== saleContextKey\(\)\) saleClient = null;/.test(caisse),
  'changer de note détache la fiche — sinon la mesa 7 créditerait le client de la mesa 3');
ok(/function clientsOn\(\)[\s\S]{0,180}storeIsReal\(\) && window\.KiwiClients/.test(caisse),
  'le bouton client ne s\'affiche que sur un comptoir réel, qui a un carnet');
ok(/\.cl-list\[hidden\] \{ display: none; \}/.test(caisse),
  'display:flex bat [hidden] — sans cette règle la liste resterait sous le formulaire');

/* ═════════════════════════════════════════════════════════════════════════ */
/* Le bilan attend les contrôles d'impression : eux seuls sont asynchrones,
   parce que le vrai code chaîne ses bons au lieu de les lancer ensemble. */
ticketChecks.then(() => {
  // Une thermique reçoit ses bons l'un après l'autre — s'ils partaient tous en
  // même temps, elle en perdrait.
  eq(noPrinterJobs.length, 0, 'et sans imprimante, la chaîne ne pousse rien non plus');
  console.log(fail === 0
    ? `  ✓ carte du restaurant (${pass} contrôles : frontière démo, projection, postes, retraits, impression, fidélité)`
    : `  ✗ ${fail} échec(s) sur ${pass + fail} contrôles`);
  process.exit(fail === 0 ? 0 : 1);
});
