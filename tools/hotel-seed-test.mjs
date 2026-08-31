#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LE LOCATAIRE HÔTELIER DE TEST (tools/fixtures/hotel-tenant.mjs)
 *
 * Le plan de l'économat fait reposer l'acceptation des douze phases sur un
 * locataire ensemencé « de forme réelle », parce qu'il est interdit de muter
 * un marchand qui paie pour prouver une migration. Une fixture sur laquelle
 * douze suites vont s'appuyer doit elle-même être gardée : sinon elle pourrit
 * en silence et emporte les douze avec elle.
 *
 * Cette suite garde TROIS choses :
 *
 *  1. LA FORME EST RÉELLE. Le vrai registre est chargé, il se croit réel, il
 *     résout le bon locataire, et il n'a ni réseau ni minuterie vivante.
 *  2. LE CLOISONNEMENT EXISTE DÉJÀ. Les soldes par unité sont indépendants —
 *     c'est l'affirmation centrale de la spec §0 : le registre est multi-lieux
 *     depuis toujours et n'a jamais reçu autre chose que 'principal'.
 *  3. LE COÛT EST CLOISONNÉ. L'allocateur reçoit le lieu source et ne peut
 *     jamais valoriser une sortie avec le lot d'une autre unité.
 * ─────────────────────────────────────────────────────────────────────────── */
import { createHotelTenant, UNITS } from './fixtures/hotel-tenant.mjs';

let passed = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else { failures.push(msg); console.error(`  ✗ ${msg}`); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0001;

console.log('■ Locataire hôtelier de test (fixtures/hotel-tenant)');

const t = createHotelTenant();

/* ── 1 · la forme est réelle ─────────────────────────────────────────────── */
ok(t.ledger && typeof t.ledger.add === 'function', 'le VRAI KiwiInventory est chargé, pas une simulation');
ok(t.ledger.isReal() === true, 'le registre se croit réel — sinon add() refuse tout en silence');
ok(t.ledger.merchant() === t.merchant, `le locataire résolu est « ${t.merchant} »`);
ok(t.consumption && typeof t.consumption.allocateCost === 'function', 'le vrai allocateur de coût est chargé');
ok(t.window.fetch !== undefined, 'un fetch existe…');
await t.window.fetch().then(() => ok(false, 'le réseau devrait être interdit'), () => ok(true, '…et il refuse : une fixture ne parle jamais au réseau'));

/* ── 2 · un locataire, des unités cloisonnées (spec §2.2) ────────────────── */
ok(UNITS.filter((u) => u.kind === 'economat').length === 1, 'exactement un économat par hôtel');
ok(new Set(UNITS.map((u) => u.locationId)).size === UNITS.length, 'chaque unité a un locationId unique');
ok(UNITS.every((u) => u.locationId && u.id), 'aucune unité sans identité stable');

ok(t.balanceAt('economat', 'whisky') === 12, 'économat : 12 whisky');
ok(t.balanceAt('bar-rooftop', 'whisky') === 6, 'rooftop : 6 whisky');
ok(t.balanceAt('bar-lobby', 'whisky') === 0, 'lobby : 0 whisky — un solde par unité, pas un cumul');
ok(t.balanceHotel('whisky') === 18, 'hôtel : 18 whisky au total');
ok(t.balanceAt('economat', 'savon') === 100 && t.balanceAt('housekeeping', 'savon') === 0,
  'la fourniture d\'un département part de l\'économat, pas de sa réserve');

/* ── 3 · le coût FEFO reste dans le lieu source ─────────────────────────── */
const A = t.consumption.allocateCost;
ok(near(A('whisky', 6, null, { locationId: 'u-economat' }), 120), '6 whisky économat → 120,00');
ok(near(A('whisky', 12, null, { locationId: 'u-economat' }), 135),
  '12 whisky économat → 135,00 : UN taux mélangé (6×120 + 6×150) / 12');
ok(A('cola', 10, null, { locationId: 'u-economat' }) === 4, 'un article à lot unique reste à son coût');
ok(A('verrerie', 5, null, { locationId: 'u-economat' }) === null,
  "un article sans coût connu rend null — c'est le refus de confirmation de la spec §3.4.1");

/* ── 4 · le coût ne traverse jamais une frontière d'unité ───────────────── */
ok(A('whisky', 13, null, { locationId: 'u-economat' }) === null,
  '13 whisky économat sans taux de secours → null, sans emprunter le rooftop');
ok(near(A('whisky', 6, null, { locationId: 'u-bar-rooftop' }), 300),
  '6 whisky rooftop → 300,00 : uniquement le lot du rooftop');
const lots = t.consumption.deriveLots('whisky', { locationId: 'u-economat' });
ok(lots.length === 2, "l'économat ne voit que ses deux lots");
ok(lots.every((l) => l.locationId === 'u-economat'),
  'chaque lot dérivé porte le lieu source demandé');

/* ── 5 · le socle reste inerte ───────────────────────────────────────────── */
ok(t.count() === 6, '6 mouvements semés, pas un de plus — la fixture n\'écrit rien en douce');
const before = t.count();
t.put({ itemId: 'cola', locationId: 'u-bar-lobby', qty: 6, reason: 'transfer-in', unitCost: 4, occurredTs: t.now });
ok(t.count() === before + 1 && t.balanceAt('bar-lobby', 'cola') === 6,
  'un test peut ajouter un mouvement et le voir dans le solde de SON unité');

console.log(`  ${passed} contrôle(s) vert(s)${failures.length ? ` · ${failures.length} rouge(s)` : ''}`);
if (failures.length) process.exit(1);
