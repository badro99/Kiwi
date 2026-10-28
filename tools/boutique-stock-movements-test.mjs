#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Boutique — l'historique des mouvements, et rien d'autre
 *
 *   node tools/boutique-stock-movements-test.mjs
 *
 * La caisse boutique écrit déjà au registre durable : vente, retour, échange
 * passent par `enable('boutique')`, donc leurs lignes portent
 * `meta.module = 'boutique'`. Le tableau de bord ne faisait que ne pas les
 * montrer. Ce lot ajoute la LECTURE, et seulement elle.
 *
 * Les contrôles :
 *   · les lignes boutique se lisent, et celles du métier maison du même
 *     établissement ne s'y mêlent pas — ni l'inverse ;
 *   · l'historique d'un produit rend ses mouvements, du plus récent au plus
 *     ancien ;
 *   · les filtres de période et de type rendent le sous-ensemble attendu ;
 *   · LE CONTRÔLE QUI COMPTE · lire ne pose aucun crochet et n'écrit nulle
 *     part : `window.KiwiStockJournal` reste absent, le catalogue ne reçoit ni
 *     `adjustStock` ni `setStock`, et aucune ligne n'apparaît au registre.
 *     Au tableau de bord boutique, personne ne pose ce crochet aujourd'hui ·
 *     le poser ferait écrire des lignes à des magasins qui tournent.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import retailSource from './pos-retail-test-source.cjs';
import pagesProSource from './pages-pro-test-source.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => retailSource(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };

/* ── le bac à sable ──────────────────────────────────────────────────────── */
function boot(trade) {
  const memory = new Map();
  const localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  const win = {
    localStorage,
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => 'boutique-test' },
    KiwiStaff: { name: 'Salma Idrissi', role: 'Caissier' },
    addEventListener() {}, dispatchEvent() {},
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage, navigator: { onLine: false }, crypto: globalThis.crypto,
    console, Date, Math, JSON, Map, Set, Promise, document: { addEventListener() {} },
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    fetch: () => Promise.reject(new Error('offline')),
  });
  vm.runInContext(R('assets/inventory-ledger.js'), ctx, { filename: 'inventory-ledger.js' });
  vm.runInContext(R('assets/boutique-catalog-parts.js'), ctx, { filename: 'boutique-catalog-parts.js' });
  vm.runInContext(R('assets/boutique-catalog.js'), ctx, { filename: 'boutique-catalog.js' });
  win.KiwiStoreTemplates = { currentTrade: () => trade };
  vm.runInContext(R('assets/maison-stock-movements.js'), ctx, { filename: 'maison-stock-movements.js' });
  const cat = win.KiwiBoutiqueCatalog;
  cat.use('boutique-test');
  return { win, cat, MZ: win.KiwiMaisonStock };
}

const { win, cat, MZ } = boot('boutique');

/* La caisse, elle, a le droit d'écrire : c'est elle qui pose le crochet en
 * vendant. On rejoue ce qu'elle fait, pour avoir une histoire à lire. */
MZ.enable('boutique');
const cid = cat.addCategory('Caftans').id;
const prod = cat.addProduct({ name: 'Caftan brodé', categoryId: cid, priceMAD: 1200, cost: 540, kind: 'taille' });
const vM = cat.addVariant({ productId: prod.id, colorId: 'vert', colorLabel: 'Vert', size: 'M', stock: 5 });
const vL = cat.addVariant({ productId: prod.id, colorId: 'vert', colorLabel: 'Vert', size: 'L', stock: 3 });
cat.adjustStock(vM.id, -1, 'vente', { ref: '2201', actor: 'Salma Idrissi' });
cat.adjustStock(vL.id, -2, 'vente', { ref: '2202', actor: 'Salma Idrissi' });
cat.adjustStock(vM.id, 1, 'remb', { ref: '2201', actor: 'Salma Idrissi' });

/* Et le même établissement tient aussi des lignes « maison » : le registre est
 * partagé, c'est précisément ce que le filtre doit séparer. */
MZ.enable('maison');
cat.adjustStock(vL.id, -1, 'vente', { ref: 'M-7', actor: 'Autre comptoir' });
MZ.enable('boutique');

/* ── I · chaque métier ne lit que ses lignes ─────────────────────────────── */
const bq = MZ.list({ module: 'boutique' });
const mz = MZ.list({ module: 'maison' });
ok('les lignes boutique se lisent', bq.length === 5, `${bq.length} ligne(s)`);
ok('aucune ligne maison ne se mêle à la boutique',
  bq.every((m) => m.ref !== 'M-7'), JSON.stringify(bq.map((m) => m.ref)));
ok('et la réciproque tient : la maison ne voit pas la boutique',
  mz.length === 1 && mz[0].ref === 'M-7', JSON.stringify(mz.map((m) => m.ref)));
ok('la vente boutique porte l\'avant, l\'après, le ticket et l\'employé', (() => {
  const sale = bq.find((m) => m.ref === '2202');
  return !!sale && sale.qty === -2 && sale.before === 3 && sale.after === 1 && sale.actor === 'Salma Idrissi';
})());

/* ── II · l'historique d'un produit, du plus récent au plus ancien ───────── */
const hist = MZ.productHistory(prod.id, 20, 'boutique');
ok('l\'historique du produit rend ses mouvements',
  hist.length === 5 && hist.every((m) => m.productId === prod.id), `${hist.length} ligne(s)`);
ok('il est rendu du plus récent au plus ancien',
  hist.every((m, i) => i === 0 || hist[i - 1].at >= m.at));
ok('la limite est respectée', MZ.productHistory(prod.id, 2, 'boutique').length === 2);
ok('un produit inconnu rend une liste vide, pas une erreur',
  MZ.productHistory('inexistant', 20, 'boutique').length === 0);

/* ── III · les filtres ───────────────────────────────────────────────────── */
ok('le filtre de type rend le bon sous-ensemble',
  MZ.list({ module: 'boutique', type: 'vente' }).length === 2,
  JSON.stringify(MZ.list({ module: 'boutique', type: 'vente' }).map((m) => m.ref)));
ok('le filtre de type sépare la vente du remboursement',
  MZ.list({ module: 'boutique', type: 'remboursement' }).length === 1);
ok('une période qui couvre tout rend tout',
  MZ.list({ module: 'boutique', from: Date.now() - 86400000 }).length === 5);
ok('une période ancienne et close ne rend rien',
  MZ.list({ module: 'boutique', from: Date.now() - 86400000 * 90, to: Date.now() - 86400000 * 30 }).length === 0);
ok('les facettes ne proposent que des valeurs du métier lu',
  MZ.facets('boutique').actors.indexOf('Autre comptoir') < 0
  && MZ.facets('boutique').actors.indexOf('Salma Idrissi') >= 0);
ok('le filtre de catégorie rend le rayon demandé',
  MZ.list({ module: 'boutique', categoryId: cid }).length === 5);

/* ── IV · LIRE N'ÉCRIT RIEN ──────────────────────────────────────────────── */
/* Le tableau de bord boutique n'a aucun crochet posé. On se remet dans cet
 * état — crochet retiré — et on piège le catalogue : toute écriture lève. */
delete win.KiwiStockJournal;
const stockBefore = { m: cat.variantStock(prod.id, 'M', 'vert'), l: cat.variantStock(prod.id, 'L', 'vert') };
const ledgerBefore = MZ.list({ module: 'boutique' }).length + MZ.list({ module: 'maison' }).length;
const trapped = [];
for (const fn of ['adjustStock', 'setStock', 'addVariant', 'addProduct']) {
  const real = cat[fn];
  cat[fn] = function () { trapped.push(fn); return real.apply(this, arguments); };
}
MZ.list({ module: 'boutique' });
MZ.productHistory(prod.id, 20, 'boutique');
MZ.facets('boutique');
MZ.totals(MZ.list({ module: 'boutique' }));
ok('lire ne pose aucun crochet sur le catalogue', win.KiwiStockJournal === undefined,
  String(win.KiwiStockJournal && Object.keys(win.KiwiStockJournal)));
ok('lire n\'appelle aucune écriture du catalogue', trapped.length === 0, trapped.join(', '));
ok('lire ne bouge aucun stock',
  cat.variantStock(prod.id, 'M', 'vert') === stockBefore.m && cat.variantStock(prod.id, 'L', 'vert') === stockBefore.l);
ok('lire n\'ajoute aucune ligne au registre',
  MZ.list({ module: 'boutique' }).length + MZ.list({ module: 'maison' }).length === ledgerBefore);

/* ── V · et l'écran lui-même ne peut pas appeler l'écriture ──────────────── */
/* La source du tableau de bord : le chemin boutique ne doit jamais traverser
 * enable() — qui poserait le crochet — et la page ne doit pas offrir la saisie
 * manuelle. Ce sont des interdictions de code, pas des goûts. */
const src = pagesProSource(ROOT);
const navHandler = (src.match(/handlers\['nav-stock-movements'\][\s\S]*?\n\};/) || [''])[0];
ok('ouvrir les mouvements n\'appelle enable() que hors boutique',
  /_mzModule\(\)\s*!==\s*'boutique'\s*\)\s*MZS\(\)\.enable\(\)/.test(navHandler), navHandler.slice(0, 160));
ok('les lignes de la page sont lues avec le module du métier',
  /Object\.assign\(\{\}, _mzFilter, \{ module: _mzModule\(\),/.test(src));
ok('l\'historique de la fiche produit aussi',
  /productHistory\(pid, 20, _mzModule\(\)\)/.test(src));
ok('la saisie manuelle n\'est pas rendue pour la boutique',
  /_mzModule\(\) === 'boutique' \? '' : `<button[^`]*data-action="mz-new"/.test(src));
ok('le bouton des mouvements s\'affiche pour les deux métiers qui ont un registre',
  /_mzReadable\(\) \? `<button type="button" data-action="nav-stock-movements">/.test(src));
ok('le pied de page boutique ne promet pas un historique exhaustif',
  /n'y figurent pas, et rien de cet écran ne touche au stock/.test(src));

/* ── V bis · LE MIROIR : la caisse et le tableau de bord montrent la même chose ──
 * Propriétaire, 2026-10-28 : « they need to be a mirror of each other ». Les
 * deux écrans lisent le même registre (D1). Ce qui pouvait encore les séparer :
 *   · une ligne refusée par le serveur reste sur la tablette, « en attente »
 *     pour toujours, et n'arrive jamais au tableau de bord ;
 *   · la caisse s'ouvrait sur 30 jours, le tableau de bord sur « Tout » ;
 *   · le tableau de bord ne relisait pas le serveur à l'ouverture.
 * La lecture `shared` écarte la ligne refusée ; les deux sources la passent. */
{
  const KEY = 'kiwi:inventoryLedger:v1:boutique-test';
  const doc = JSON.parse(win.localStorage.getItem(KEY));
  const victim = doc.rows.find((r) => r.meta && r.meta.module === 'boutique' && r.meta.type === 'remboursement');
  victim.blocked = 1; victim.refused = 'reason-forbidden';
  win.localStorage.setItem(KEY, JSON.stringify(doc));
  const everything = MZ.list({ module: 'boutique' });
  const mirror = MZ.list({ module: 'boutique', shared: true });
  ok('sans `shared`, la lecture ne change pas (la ligne refusée y est encore)',
    everything.length === 5 && everything.some((m) => m.id === victim.id && m.refused));
  ok('avec `shared`, la ligne refusée par le serveur n\'est pas montrée',
    mirror.length === 4 && !mirror.some((m) => m.id === victim.id), `${mirror.length} ligne(s)`);
  ok('les facettes partagées ne proposent pas un type qui n\'existe que refusé',
    MZ.facets('boutique', true).types.indexOf('remboursement') < 0
    && MZ.facets('boutique').types.indexOf('remboursement') >= 0, JSON.stringify(MZ.facets('boutique', true).types));
  victim.blocked = 0; delete victim.refused;
  win.localStorage.setItem(KEY, JSON.stringify(doc));

  const caisse = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique/inv-moves.js'), 'utf8');
  const fiche = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique/inventory.js'), 'utf8');
  ok('caisse · la page lit la boutique en miroir', /\{ module: MODULE, shared: true,/.test(caisse));
  ok('caisse · ses filtres aussi', /MZ\.facets\(MODULE, true\)/.test(caisse));
  ok('caisse · la fiche article aussi', /list\?\.\(\{ productId: pid, module: 'boutique', shared: true \}\)/.test(fiche));
  ok('caisse · elle s\'ouvre sur « Tout », comme le tableau de bord',
    /const f = \{ q: '', days: 0,/.test(caisse) && /f\.days = 0;/.test(caisse));
  ok('caisse · elle relit le serveur à l\'ouverture', /L\.sync\(\)/.test(caisse));
  ok('tableau de bord · la page lit la boutique en miroir',
    /\{ module: _mzModule\(\), shared: _mzModule\(\) === 'boutique' \}/.test(src));
  ok('tableau de bord · ses filtres aussi', /M\.facets\(_mzModule\(\), _mzModule\(\) === 'boutique'\)/.test(src));
  ok('tableau de bord · il s\'ouvre sur « Tout »', /_mzFilter\.days = 0;/.test(navHandler));
  ok('tableau de bord · il relit le serveur à l\'ouverture', /L\.sync\(\)/.test(navHandler));
  ok('les deux côtés lisent le même module',
    /const MODULE = 'boutique';/.test(caisse) && /_mzTrade\(\)\.trim\(\)\.toLowerCase\(\) === 'boutique' \? 'boutique'/.test(src));
}

/* ── VI · le métier maison n'a pas bougé d'un bit ────────────────────────── */
const { MZ: MZm, cat: catm } = boot('maison');
MZm.enable();
const mcid = catm.addCategory('Linge').id;
const mprod = catm.addProduct({ name: 'Plaid', categoryId: mcid, priceMAD: 400, cost: 150, kind: 'taille' });
catm.addVariant({ productId: mprod.id, colorId: 'bleu', colorLabel: 'Bleu', size: 'TU', stock: 4 });
ok('sans argument, list() rend toujours le métier maison',
  MZm.list({}).length === 1 && MZm.list({})[0].type === 'initial');
ok('sans argument, productHistory() se comporte comme avant',
  MZm.productHistory(mprod.id).length === 1);
ok('sans argument, facets() se comporte comme avant',
  MZm.facets().categories.length === 1);
ok('et le crochet maison est bien posé, lui', !!MZm.isMaison && typeof MZm.enable === 'function');

/* ── le verdict ──────────────────────────────────────────────────────────── */
console.log(`\nboutique-stock-movements: ${pass} contrôle(s) au vert, ${fails.length} au rouge`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
console.log('  ✓ la boutique lit son registre, et lire ne touche à rien');
