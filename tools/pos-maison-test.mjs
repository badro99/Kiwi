#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POS Maison (Art de table & Décoration · Vogue Home) Unit Test Suite
 *
 * Verifies:
 * 1. Pin 0017 registration in pos-dispatch.js
 * 2. Pos-maison assets (.js and .css) integrity and matching revisions
 * 3. Maison categories, default products, brands, motifs, and fragile flags in boutique-catalog.js
 * 4. Format handling (Service complet vs À la pièce) & inventory arithmetic
 * 5. Gift receipts (no prices), gift wrap, and fragile delivery slips
 * 6. Wedding & gift registries (listes de mariage/naissance) contributions
 * 7. Breakage & loss declaration (casse), unit cost depreciation & stock deduction
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

console.log('■ POS Maison (Art de table & Décoration) Test Suite');

// 1. Check dispatch registration
const dispatchSrc = fs.readFileSync(path.join(ROOT, 'assets/pos-dispatch.js'), 'utf8');
ok(dispatchSrc.includes("'0017':"), "PIN '0017' registered in pos-dispatch.js");
ok(dispatchSrc.includes("id: 'maison'"), "id: 'maison' declared in pos-dispatch.js");
ok(dispatchSrc.includes("file: 'pos-maison'"), "file: 'pos-maison' declared in pos-dispatch.js");

// 2. Check assets existence & syntax
const jsPath = path.join(ROOT, 'assets/pos-maison.js');
const cssPath = path.join(ROOT, 'assets/pos-maison.css');
const catPath = path.join(ROOT, 'assets/boutique-catalog.js');
ok(fs.existsSync(jsPath), 'assets/pos-maison.js exists on disk');
ok(fs.existsSync(cssPath), 'assets/pos-maison.css exists on disk');
ok(fs.existsSync(catPath), 'assets/boutique-catalog.js exists on disk');

const jsSrc = fs.readFileSync(jsPath, 'utf8');
const cssSrc = fs.readFileSync(cssPath, 'utf8');
const catSrc = fs.readFileSync(catPath, 'utf8');

// Ensure valid JS syntax via Function constructor
let syntaxOk = false;
try {
  new Function(jsSrc);
  new Function(catSrc);
  syntaxOk = true;
} catch (e) {
  console.error('Syntax error in scripts:', e);
}
ok(syntaxOk, 'pos-maison.js and boutique-catalog.js parse as valid JavaScript without syntax errors');

// 3. Check specialized categories & products in boutique-catalog SEED_MAISON
ok(catSrc.includes('SEED_MAISON'), 'SEED_MAISON declared in boutique-catalog.js');
ok(catSrc.includes('Arts de la table'), 'Arts de la table rayon defined');
ok(catSrc.includes('Verrerie & Cristallerie'), 'Verrerie & Cristallerie rayon defined');
ok(catSrc.includes('Bougies & Senteurs'), 'Bougies & Senteurs rayon defined');
ok(catSrc.includes('Décoration & Cadeaux'), 'Décoration & Cadeaux rayon defined');

// Check Moroccan luxury brands & motifs
ok(catSrc.includes('Vogue Table'), 'Vogue Table brand present');
ok(catSrc.includes('Beldi Glass'), 'Beldi Glass brand present');
ok(catSrc.includes('Baobab Collection'), 'Baobab Collection brand present');
ok(catSrc.includes('Céramique Majorelle'), 'Céramique Majorelle brand present');
ok(catSrc.includes('Fès Bleu'), 'Fès Bleu motif present');
ok(catSrc.includes('Zellige Vert'), 'Zellige Vert motif present');
ok(catSrc.includes('fragile: true'), 'Fragile flag present on ceramic/crystal items');

// 4. Check Service vs Piece logic
ok(jsSrc.includes("format: 'service'") || catSrc.includes("format: 'service'"), 'Service format supported');
ok(jsSrc.includes('servicePieces') || catSrc.includes('servicePieces'), 'servicePieces attribute tracked');
ok(jsSrc.includes('piecePriceMAD') || catSrc.includes('piecePriceMAD'), 'piecePriceMAD attribute supported');
ok(jsSrc.includes('STOCK ARITHMETIC : Service vs Pièce'), 'Clear stock arithmetic documented and handled');

// 5. Check Gift Receipt & Delivery Notes
ok(jsSrc.includes('*** TICKET CADEAU ***'), 'Gift receipt layout with no prices present');
ok(jsSrc.includes('BON DE LIVRAISON SÉCURISÉ'), 'Fragile delivery note template present');
ok(jsSrc.includes('printDeliveryNoteNow'), 'printDeliveryNoteNow function defined');
ok(jsSrc.includes('mz-tk-giftwrap'), 'Gift wrap option toggle on ticket');
ok(jsSrc.includes('mz-tk-delivery'), 'Delivery option on ticket');
ok(jsSrc.includes('mz-fragile-alert'), 'Automatic fragile warning banner in ticket');

// 6. Check Gift & Wedding Registries (Listes de Mariage / Naissance)
ok(jsSrc.includes('renderRegistries'), 'renderRegistries function defined');
ok(jsSrc.includes('loadRegistries'), 'loadRegistries function defined');
ok(jsSrc.includes('updateRegistryContribution'), 'updateRegistryContribution function defined');
ok(jsSrc.includes('Mariage Sarah & Mehdi Benjelloun'), 'Demo wedding registry present');

// 7. Check Breakage & Loss Management (Déclaration de casse)
ok(jsSrc.includes('renderCasse'), 'renderCasse function defined');
ok(jsSrc.includes('recordCasse'), 'recordCasse function defined');
ok(jsSrc.includes('loadCasseLog'), 'loadCasseLog function defined');
ok(jsSrc.includes("reason: 'waste'"), 'Waste reason forwarded to KiwiInventory');

// 8. Check CSS styling tokens
ok(cssSrc.includes('.mz-reg-card'), 'Registry card CSS styles present');
ok(cssSrc.includes('.mz-casse-box'), 'Casse box CSS styles present');
ok(cssSrc.includes('.mz-fragile-alert'), 'Fragile alert CSS styles present');
ok(cssSrc.includes('.mz-tk-opt-bar'), 'Ticket option bar CSS styles present');

/* 9. Le fork boutique → maison a renommé les ATTRIBUTS (data-bq-* → data-mz-*)
 * mais pas toujours les LECTURES, qui sont en camelCase : `dataset.bqM` ne
 * contient aucun tiret, donc un balayage de « bq- » le rate entièrement. Le
 * résultat ne lève rien et ne loggue rien — le bouton est simplement mort. On
 * avait ainsi perdu le choix du moyen de paiement, la sélection client, la
 * fiche produit, les avoirs et le paiement fractionné.
 *
 * Deux sens à vérifier, parce qu'un seul laisse passer la moitié des cas :
 *   a) plus aucune lecture `dataset.bq*` ;
 *   b) tout attribut data-mz-* posé dans le markup est effectivement LU
 *      quelque part — sinon le contrôle est décoratif. */
/* data-mz-ret-qty → mzRetQty : on retire « data- », PAS « data-mz- » — la clé
   dataset garde le préfixe mz. */
const camel = (attr) => attr.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const staleReads = [...jsSrc.matchAll(/\.dataset\.bq([A-Z][A-Za-z]*)/g)].map((m) => 'bq' + m[1]);
ok(staleReads.length === 0, `aucune lecture dataset.bq* résiduelle (trouvé : ${[...new Set(staleReads)].join(', ') || 'aucune'})`);

const emitted = [...new Set([...jsSrc.matchAll(/\b(data-mz-[a-z-]+)=/g)].map((m) => m[1]))];
ok(emitted.length >= 20, `le markup pose bien ses attributs data-mz-* (${emitted.length})`);
/* Marqueurs de PRÉSENCE : leur valeur ne veut rien dire, seul le fait qu'ils
 * existent compte (`closest('[data-mz-locked]')`). Ils sont nommés un par un —
 * accepter n'importe quelle requête `[data-mz-*]` comme une lecture aurait
 * laissé passer le bug d'origine, puisque `$$('[data-mz-m]')` existait bel et
 * bien pendant que `dataset.bqM` renvoyait undefined. */
const PRESENCE_ONLY = new Set(['data-mz-locked']);
const unread = emitted.filter((attr) => !PRESENCE_ONLY.has(attr)).filter((attr) => {
  const key = camel(attr);
  /* lu soit via dataset.mzFoo, soit via une requête [data-mz-foo] suivie d'un
     accès générique (getAttribute) — les deux comptent comme une lecture. */
  return !new RegExp(`dataset\\.${key}\\b`).test(jsSrc)
      && !new RegExp(`getAttribute\\(\\s*['"\`]${attr}['"\`]`).test(jsSrc);
});
ok(unread.length === 0, `chaque attribut data-mz-* est lu (orphelins : ${unread.join(', ') || 'aucun'})`);

/* 10. ARITHMÉTIQUE PIÈCE / SET — exécutée, pas relue.
 * On découpe le vrai bloc de pos-maison.js (de LOOSE_KEY jusqu'à addToTicket)
 * et on l'exécute avec un stock et un localStorage bouchonnés. C'est le CODE
 * EXPÉDIÉ qui tourne ici : une copie de l'algorithme dans le test ne prouverait
 * que la copie. Le bug d'origine — un set entier sorti du stock à chaque pièce
 * vendue, soit 1 450 MAD de stock pour 85 MAD encaissés — tombe sur le scénario 1. */
{
  const from = jsSrc.indexOf("  const LOOSE_KEY = 'kiwi:mzLoose';");
  const to = jsSrc.indexOf('  function addToTicket(pid, cfg, opts) {');
  ok(from > 0 && to > from, 'le bloc pièces dépareillées est isolable dans la source');
  const block = jsSrc.slice(from, to);

  const store = {};
  const shim = `
    const localStorage = { getItem: (k) => (k in __store ? __store[k] : null), setItem: (k, v) => { __store[k] = String(v); } };
    const merchantSlug = () => 'vogueHome';
    const P = __P;
    const stockAdd = (pid, size, d) => { P[pid].sizes[size] = Math.max(0, (P[pid].sizes[size] || 0) + d); };
  `;
  const api = new Function('__store', '__P', shim + block + '\n; return { holdStock, releaseStock, looseOf, sellsLoose };');

  const SET = () => ({ sizes: { TU: 4 }, format: 'service', servicePieces: 18 });
  const PLATE = () => ({ sizes: { TU: 24 }, format: 'piece', servicePieces: null });

  // 1 — vendre UNE pièce ouvre un seul set, pas un par pièce
  let P1 = { svc: SET() }, S1 = {};
  let a = api(S1, P1);
  let u = a.holdStock('svc', 'TU', 1, true);
  ok(u === 1 && P1.svc.sizes.TU === 3 && a.looseOf('svc', 'TU') === 17,
    `1 pièce → 1 set ouvert, 17 dépareillées (u=${u}, sets=${P1.svc.sizes.TU}, loose=${a.looseOf('svc','TU')})`);

  // 2 — la pièce suivante sort du dépareillé : le catalogue ne bouge PAS
  u = a.holdStock('svc', 'TU', 1, true);
  ok(u === 0 && P1.svc.sizes.TU === 3 && a.looseOf('svc', 'TU') === 16,
    `2e pièce → 0 unité catalogue, 16 dépareillées (u=${u}, sets=${P1.svc.sizes.TU})`);

  // 3 — 19 pièces au total = 2 sets, jamais 19
  u = a.holdStock('svc', 'TU', 17, true);
  ok(P1.svc.sizes.TU === 2 && a.looseOf('svc', 'TU') === 17,
    `19 pièces vendues = 2 sets consommés (sets=${P1.svc.sizes.TU}, loose=${a.looseOf('svc','TU')})`);

  // 4 — un retour qui reconstitue un set entier le referme
  const back = a.releaseStock('svc', 'TU', 1, true);
  ok(back === 1 && P1.svc.sizes.TU === 3 && a.looseOf('svc', 'TU') === 0,
    `retour reconstituant un set → set refermé (back=${back}, sets=${P1.svc.sizes.TU}, loose=${a.looseOf('svc','TU')})`);

  // 5 — garde anti-survente : refus SANS rien modifier
  let P2 = { svc: SET() }, S2 = {};
  let b = api(S2, P2);
  const refused = b.holdStock('svc', 'TU', 4 * 18 + 1, true);
  ok(refused === false && P2.svc.sizes.TU === 4 && b.looseOf('svc', 'TU') === 0,
    `survente refusée sans effet de bord (ret=${refused}, sets=${P2.svc.sizes.TU})`);

  // 6 — un article vendu à la pièce QUI N'EST PAS un service garde le compte normal
  let P3 = { plate: PLATE() }, S3 = {};
  let c = api(S3, P3);
  ok(c.sellsLoose(P3.plate, true) === false, 'une assiette vendue seule n’est pas du dépareillé');
  u = c.holdStock('plate', 'TU', 2, true);
  ok(u === 2 && P3.plate.sizes.TU === 22, `assiette simple → décompte direct (u=${u}, stock=${P3.plate.sizes.TU})`);
}

/* 11. DÉPÔT-VENTE (catégorie B) — la marchandise appartient à un tiers.
 * La règle qui compte, et qui est vérifiée ici en premier : la vente est
 * ENREGISTRÉE INTÉGRALEMENT. Ce qui change est l'ATTRIBUTION de l'argent, pas
 * l'existence de la vente. Un jour où quelqu'un « optimisera » ce code, c'est
 * ce test-là qui doit l'arrêter. */
{
  // a) le journal des ventes reçoit TOUTES les lignes — aucun filtre sur consigned
  const saleBlock = jsSrc.slice(jsSrc.indexOf('          lines: t.lines.map((ln) => ({'), jsSrc.indexOf('          reward: rewardUsed'));
  ok(saleBlock.length > 0 && !/filter\s*\(/.test(saleBlock),
    'le journal des ventes enregistre toutes les lignes, sans filtrer le dépôt-vente');
  ok(/consigned: Math\.round\(tot\.consigned\)/.test(jsSrc) && /own: Math\.round\(tot\.own\)/.test(jsSrc),
    'la vente écrit les trois montants : total payé, part des déposants, recette propre');

  // b) la recette du jour exclut le dépôt-vente, avec repli pour l'historique
  ok(/caToday = \(\) => salesToday\(\)\.reduce\(\(s, x\) => s \+ \(x\.own != null \? x\.own : x\.total\)/.test(jsSrc),
    'la recette du jour lit `own`, et retombe sur `total` pour les ventes d’avant');
  ok(/cashIn = Math\.max\(0, cashIn - Math\.round\(tot\.consigned\)\)/.test(jsSrc),
    'ce qui remonte au tableau de bord exclut la part des déposants');

  // c) la caisse ne tient AUCUN solde de reversement — décision explicite de la
  //    patronne : l'argent des déposants se règle hors caisse. Un solde ici
  //    serait un second livre jamais tenu à jour. Ce contrôle est là pour que
  //    la remise en place soit une décision, pas une dérive.
  ok(!/mzDepotRemis/.test(jsSrc) && !/depotByConsignor|depotDue/.test(jsSrc),
    'aucun compte de « reste à reverser » n’est tenu par la caisse');
  ok(/consigned: isConsigned\(ln\)/.test(jsSrc),
    'la ligne vendue garde la propriété FIGÉE au moment de l’encaissement');

  // d) le catalogue partagé n'accepte pas une propriété devinée
  ok(/ownership: data\.ownership === 'consignment' \? 'consignment' : 'outright'/.test(catSrc),
    'addProduct ne retient « consignment » que s’il est explicite');
  ok(/consignor: String\(data\.consignor \|\| ''\)\.trim\(\)/.test(catSrc), 'le déposant est porté par le produit');

  // e) l'arithmétique, exécutée sur la source expédiée
  const from = jsSrc.indexOf('  const isConsigned = (ln) =>');
  const to = jsSrc.indexOf('  function ticketTotals(t) {');
  ok(from > 0 && to > from, 'le bloc dépôt-vente est isolable dans la source');
  const shim = 'const lineTotal = (ln) => ln.unit * ln.qty; const P = __P;';
  const api = new Function('__P', shim + jsSrc.slice(from, to) + '\n; return { isConsigned, consignedOf };');
  const PROD = {
    bougie: { ownership: 'consignment', consignor: 'Baobab Collection' },
    aurum:  { ownership: 'consignment', consignor: 'Baobab Collection' },
    vase:   { ownership: 'outright', consignor: '' },
  };
  const a = api(PROD);
  const lines = [
    { pid: 'vase', unit: 650, qty: 1 },
    { pid: 'bougie', unit: 1850, qty: 1 },
    { pid: 'aurum', unit: 1250, qty: 2 },
  ];
  ok(a.consignedOf(lines) === 1850 + 2500, `part des déposants = 4350 (obtenu ${a.consignedOf(lines)})`);
  ok(a.consignedOf([{ pid: 'vase', unit: 650, qty: 1 }]) === 0, 'un ticket sans dépôt-vente ne doit rien');
  ok(a.isConsigned({ pid: 'inconnu' }) === false, 'un article absent du catalogue n’est jamais réputé en dépôt-vente');
}

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
}
