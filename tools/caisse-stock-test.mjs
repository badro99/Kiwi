#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · une addition réglée au restaurant sort sa marchandise
 *
 *   node tools/caisse-stock-test.mjs
 *
 * Ce que ce banc défend.
 *
 * Les quatorze métiers de assets/pos-*.js encaissent par KiwiPosSale.record(),
 * qui appelle le moteur de consommation au passage. Le service à table est le
 * flux NATIF de la caisse : il règle par recordSale() (kiwi-caisse.html) et ne
 * passe pas par KiwiPosSale. Pendant un temps, RIEN dans le dépôt n'appelait
 * KiwiInventoryConsumption en dehors de assets/pos-sale.js — un restaurant
 * pouvait servir dix-neuf tables sans qu'un gramme de poulet ne quitte
 * l'inventaire. La fiche technique, le coût matière et la valeur de stock
 * disaient chacun la vérité de leur côté ; le pont entre la vente et la matière
 * n'existait pas.
 *
 * Le banc tient les deux moitiés du pont :
 *
 *   · le CÂBLAGE — les trois portes par lesquelles une vente entre au journal
 *     (comptoir, annulation, miroir du téléphone serveur) appellent bien le
 *     moteur. Un contrôle textuel sur kiwi-caisse.html, parce qu'un défaut de
 *     câblage ne se voit dans aucun test fonctionnel du moteur seul.
 *   · le CONTRAT — les lignes que la caisse fabrique vraiment (avec itemId au
 *     comptoir, sans itemId quand elles reviennent du serveur) sortent la bonne
 *     matière, une seule fois, et la rendent à l'annulation. Le moteur et le
 *     registre sont chargés tels qu'ils sont livrés.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ── I · le câblage, lu dans la caisse elle-même ─────────────────────────── */
const CAISSE = R('kiwi-caisse.html');

/* Le corps d'une fonction de premier niveau du script de caisse : de sa
   signature jusqu'à la prochaine déclaration au même niveau d'indentation. */
function body(name) {
  const start = CAISSE.indexOf('\n    function ' + name + '(');
  if (start < 0) return '';
  const next = CAISSE.indexOf('\n    function ', start + 1);
  return CAISSE.slice(start, next < 0 ? CAISSE.length : next);
}

ok('la caisse charge le moteur de consommation',
  /<script src="assets\/inventory-consumption\.js/.test(CAISSE) && /<script src="assets\/inventory-ledger\.js/.test(CAISSE));
ok('le règlement au comptoir sort la marchandise',
  /KiwiInventoryConsumption\?\.record\?\.\(entry\)/.test(body('recordSale')));
ok('une vente sortie des livres rend la marchandise',
  /KiwiInventoryConsumption\?\.reverse\?\./.test(body('reconcileVoids')));
ok('une addition réglée sur le téléphone du serveur sort la marchandise',
  /KiwiInventoryConsumption\?\.record\?\.\(entry\)/.test(body('ingestSettledCloudSales')));
/* Les lignes doivent porter leur identifiant, sinon tout repose sur le nom. */
ok('les lignes du comptoir portent leur itemId', /itemId:\s*(c\.id|l\.id)/.test(body('currentSaleLines')));

/* ── II · le contrat, contre le vrai moteur et le vrai registre ──────────── */
const memory = new Map();
const localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const win = {
  localStorage,
  KiwiEnv: { isReal: () => true },
  KiwiCloudDoc: { currentSlug: () => 'amira-cafe' },
  addEventListener() {},
};
win.window = win;
const ctx = vm.createContext({
  window: win, localStorage, navigator: { onLine: false }, crypto: globalThis.crypto,
  console, Date, Math, JSON, Map, Set, Promise,
  setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
});
vm.runInContext(R('assets/inventory-ledger.js'), ctx, { filename: 'inventory-ledger.js' });

/* Le document de coûts tel que le tableau de bord l'écrit : la ligne de recette
   porte l'article (`stock`) et la quantité déjà ramenée à l'unité du stock
   (`stockQty`), parce que la caisse ne connaît aucune table de conversion. */
win.KiwiCost = { doc: () => ({
  ingredients: [
    { id: 'stock:usr-am01', stockId: 'usr-am01', name: 'Poulet fermier', useCost: 0.062 },
    { id: 'stock:usr-am05', stockId: 'usr-am05', name: 'Tomates', useCost: 0.009 },
    { id: 'stock:usr-am0d', stockId: 'usr-am0d', name: 'Menthe fraîche', useCost: 0.02 },
    /* Une épice tenue au gramme : son taux vaut moins d'un centime. */
    { id: 'stock:usr-am0z', stockId: 'usr-am0z', name: 'Cumin', useCost: 0.008 },
  ],
  recipes: {
    it_3: { status: 'complete', name: 'Tajine poulet citron', yield: 1, lines: [
      { ing: 'stock:usr-am01', stock: 'usr-am01', qty: 260, stockQty: 0.26 },
      { ing: 'stock:usr-am05', stock: 'usr-am05', qty: 150, stockQty: 0.15 },
    ] },
    it_6: { status: 'complete', name: 'Thé à la menthe', yield: 1, lines: [
      { ing: 'stock:usr-am0d', stock: 'usr-am0d', qty: 20, stockQty: 0.02 },
    ] },
    /* Recette dont l'article est tenu dans la même unité que la fiche : le taux
       reste sous le centime et ne doit pas être arrondi à l'entrée du journal. */
    it_5: { status: 'complete', name: 'Brochettes mixtes', yield: 1, lines: [
      { ing: 'stock:usr-am0z', stock: 'usr-am0z', qty: 5, stockQty: 5 },
    ] },
  },
}) };
vm.runInContext(R('assets/inventory-consumption.js'), ctx, { filename: 'inventory-consumption.js' });

const I = win.KiwiInventory;
const C = win.KiwiInventoryConsumption;
I.ensureOpening('usr-am01', 18, { unitCost: 62 });
I.ensureOpening('usr-am05', 25, { unitCost: 9 });
I.ensureOpening('usr-am0d', 40, { unitCost: 20 });
ok('le moteur et le registre se chargent sur le bon commerçant', !!C && I.merchant() === 'amira-cafe');

/* L'entrée du journal, fabriquée exactement comme recordSale la fabrique :
   `time` est un objet Date, la référence vient de KiwiReceipt, et chaque ligne
   porte itemId / name / qty / total / cat. */
const ticket = (ref, lines) => ({
  id: 'visit-7-emp', time: new Date(1770000000000), label: 'Table 7', amount: 214,
  method: 'card', ref, tip: 0, cashier: 'Amira', lines,
});

C.record(ticket('KW-0001', [
  { itemId: 'it_3', name: 'Tajine poulet citron', qty: 2, total: 190, cat: 'Plats' },
  { itemId: 'it_6', name: 'Thé à la menthe', qty: 2, total: 24, cat: 'Boissons' },
]));
ok('deux tajines et deux thés sortent leur matière',
  near(I.balance('usr-am01'), 17.48) && near(I.balance('usr-am05'), 24.7) && near(I.balance('usr-am0d'), 39.96),
  `poulet=${I.balance('usr-am01')} tomates=${I.balance('usr-am05')} menthe=${I.balance('usr-am0d')}`);
ok('le plat lui-même n\'est jamais consommé comme un article de stock', I.balance('it_3') === 0);

/* Une sortie de recette doit porter sa VALEUR, pas seulement sa quantité. Sans
   elle le journal comptait juste les grammes : le coût matière réel n'était
   dérivable d'aucune vente, et le compte de résultat retombait sur une moyenne
   théorique non pondérée. Le coût d'usage est donné dans l'unité de la recette
   (0,062 MAD le gramme), le mouvement est écrit dans l'unité du stock (le kilo) :
   c'est le rapport qty/stockQty de la ligne qui fait la conversion. */
const sold = (ref) => I.history().filter((r) => r.refType === 'sale' && r.refId === ref);
const valued = sold('KW-0001');
ok('chaque sortie de recette porte un coût unitaire',
  valued.length === 3 && valued.every((r) => r.unitCost != null && r.unitCost > 0),
  valued.map((r) => `${r.itemId}=${r.unitCost}`).join(' '));
ok('le coût unitaire est converti dans l\'unité du stock',
  near(valued.find((r) => r.itemId === 'usr-am01').unitCost, 62)
  && near(valued.find((r) => r.itemId === 'usr-am05').unitCost, 9)
  && near(valued.find((r) => r.itemId === 'usr-am0d').unitCost, 20),
  valued.map((r) => `${r.itemId}=${r.unitCost}`).join(' '));
/* Deux tajines et deux thés : 0,52 kg de poulet à 62, 0,30 kg de tomates à 9,
   0,04 kg de menthe à 20 — le coût matière du ticket se relit au centime. */
ok('le coût matière du ticket se recalcule depuis le journal',
  near(valued.reduce((s, r) => s + Math.abs(r.qty) * r.unitCost, 0), 35.74),
  String(valued.reduce((s, r) => s + Math.abs(r.qty) * r.unitCost, 0)));

/* Un rechargement de la caisse rejoue le journal : les identifiants de
   mouvement dérivent de la référence du ticket, donc rien ne bouge. */
C.record(ticket('KW-0001', [
  { itemId: 'it_3', name: 'Tajine poulet citron', qty: 2, total: 190, cat: 'Plats' },
  { itemId: 'it_6', name: 'Thé à la menthe', qty: 2, total: 24, cat: 'Boissons' },
]));
ok('rejouer le même ticket ne sort rien de plus',
  near(I.balance('usr-am01'), 17.48) && near(I.balance('usr-am0d'), 39.96),
  `poulet=${I.balance('usr-am01')}`);

/* Le miroir du téléphone serveur renvoie des lignes SANS itemId : le moteur
   repêche la recette par nom de plat. C'est la seule voie de repêchage, et elle
   doit tomber sur la même matière. */
C.record(ticket('KW-0002', [
  { name: 'Tajine poulet citron', qty: 1, total: 95, cat: 'Plats' },
  { name: 'Service', qty: 1, total: 20, kind: 'service' },
  { name: 'Pourboire', qty: 1, total: 10, kind: 'tip' },
]));
ok('une addition réglée au téléphone sort la même matière, par le nom du plat',
  near(I.balance('usr-am01'), 17.22) && near(I.balance('usr-am05'), 24.55),
  `poulet=${I.balance('usr-am01')} tomates=${I.balance('usr-am05')}`);
ok('service et pourboire ne sortent jamais de marchandise', I.balance('usr-am0d') === 39.96);

/* La même vente peut arriver deux fois : une fois par le comptoir (avec
   itemId), une fois par le miroir (sans). Même référence, donc une seule
   sortie — sinon un service entier partirait en double. */
C.record(ticket('KW-0002', [{ itemId: 'it_3', name: 'Tajine poulet citron', qty: 1, total: 95, cat: 'Plats' }]));
ok('un ticket qui entre par les deux portes ne sort la matière qu\'une fois',
  near(I.balance('usr-am01'), 17.22), `poulet=${I.balance('usr-am01')}`);

/* Une ligne dont le nom ne correspond à aucune fiche technique ne doit pas
   inventer d'article : c'est ce qui peuplerait l'inventaire de fantômes. */
const before = I.history().length;
C.record(ticket('KW-0003', [{ name: 'Plat du jour non fiché', qty: 1, total: 60, cat: 'Plats' }]));
ok('un plat sans fiche technique ne crée pas d\'article fantôme', I.history().length === before);

/* Une vente sortie des livres par la console opérateur rend sa marchandise —
   sans quoi l'inventaire reste bas pour toujours. */
C.reverse('KW-0001', 'Vente sortie des livres');
ok('une vente annulée rend toute sa matière',
  near(I.balance('usr-am01'), 17.74) && near(I.balance('usr-am0d'), 40),
  `poulet=${I.balance('usr-am01')} menthe=${I.balance('usr-am0d')}`);
C.reverse('KW-0001', 'Annulation rejouée');
ok('rejouer l\'annulation ne rend pas deux fois',
  near(I.balance('usr-am01'), 17.74) && near(I.balance('usr-am0d'), 40),
  `poulet=${I.balance('usr-am01')}`);

/* Le mouvement doit rester traçable jusqu'au ticket : c'est ce qui permet à la
   console opérateur de retrouver quoi annuler. */
const moves = I.history().filter((r) => r.reason === 'sale');
ok('chaque sortie porte la référence de son ticket',
  moves.length > 0 && moves.every((r) => r.refType === 'sale' && /^KW-\d+$/.test(String(r.refId))),
  `mouvements=${moves.length}`);

/* Un taux inférieur au centime doit survivre au nettoyage du registre : arrondi
   à deux décimales, 0,008 MAD le gramme devient 0,01 — un quart de coût matière
   inventé sur toute épice, tout levure, tout colorant tenu au gramme. */
I.ensureOpening('usr-am0z', 500, { unitCost: 0.008 });
C.record(ticket('KW-0004', [{ itemId: 'it_5', name: 'Brochettes mixtes', qty: 1, total: 90, cat: 'Plats' }]));
const spice = sold('KW-0004')[0];
ok('un coût unitaire sous le centime n\'est pas arrondi à zéro virgule un',
  !!spice && near(spice.unitCost, 0.008), spice ? String(spice.unitCost) : 'aucun mouvement');

/* ── verdict ────────────────────────────────────────────────────────────── */
if (fails.length) {
  console.log('\n✗ caisse restaurant · stock — ' + pass + '/' + (pass + fails.length) + ' contrôles');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log(`  ✓ caisse restaurant · stock (${pass} contrôles : câblage des trois portes, recette par identifiant et par nom, idempotence, annulation, traçabilité)`);
