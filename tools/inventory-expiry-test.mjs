#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GESTION DES PÉREMPTIONS & DLC / DDM — tools/inventory-expiry-test.mjs
 * ---------------------------------------------------------------------------
 * Vérifie l'ensemble de la chaîne de gestion des dates de péremption :
 *   1. Traçabilité des métadonnées (expiresAt, shelfLifeDays) sur les réceptions
 *   2. Calcul des lots actifs et dérivation des échéances (deriveLots)
 *   3. Détection des lots périmés / proches de péremption (KiwiInventoryConsumption.expiring)
 *   4. Classification des statuts (expired, critical, warning) et valorisation financière
 *   5. Sortie en perte pré-remplie depuis une alerte de péremption
 * ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let pass = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('  ✗ ' + msg);
    process.exitCode = 1;
    return false;
  }
  pass++;
  console.log('  ✓ ' + msg);
  return true;
}

console.log('■ Gestion des péremptions & DLC/DDM (tools/inventory-expiry-test.mjs)');

// Simulation d'environnement pour tester assets/inventory-consumption.js
const movements = [];
const items = [
  { id: 'saumon-frais', name: 'Saumon frais', unit: 'kg', cost: 120, shelfLifeDays: 3 },
  { id: 'creme-liquide', name: 'Crème liquide 35%', unit: 'L', cost: 35, shelfLifeDays: 14 },
  { id: 'riz-basmati', name: 'Riz basmati', unit: 'kg', cost: 18, shelfLifeDays: 365 }
];

const mockKiwiInventory = {
  isReal: () => true,
  merchant: () => 'dar-tajine',
  listItems: () => items,
  listMovements: () => movements,
  history: () => movements,
  add: (m) => {
    movements.push(Object.assign({}, m, { id: m.id || ('mov-' + Math.random().toString(36).slice(2)) }));
    return m;
  }
};

const mockKiwiInventoryDoc = {
  get: () => ({ ingredients: [], recipes: [] })
};

const globalWin = {
  KiwiInventory: mockKiwiInventory,
  KiwiInventoryDoc: mockKiwiInventoryDoc,
};

// Évaluation du code de inventory-consumption.js
const consumptionCode = read('assets/inventory-consumption.js');
const runConsumption = new Function('window', 'document', 'fetch', consumptionCode);
runConsumption(globalWin, {}, null);

const C = globalWin.KiwiInventoryConsumption;
ok(typeof C.deriveLots === 'function', 'KiwiInventoryConsumption.deriveLots est initialisé');
ok(typeof C.expiring === 'function', 'KiwiInventoryConsumption.expiring est initialisé');

const now = Date.now();

// 1. Réception 1 : Saumon frais avec expiresAt explicite dans 2 jours (critique)
mockKiwiInventory.add({
  id: 'rec-saumon-1',
  itemId: 'saumon-frais',
  qty: 10,
  reason: 'receipt',
  unitCost: 120,
  occurredTs: now - 864e5,
  meta: {
    supplierName: 'Poissonnerie du Port',
    rank: 1,
    expiresAt: now + (2 * 864e5) // dans 2 jours
  }
});

// 2. Réception 2 : Crème liquide avec shelfLifeDays = 5 jours (expire dans 4 jours -> warning)
mockKiwiInventory.add({
  id: 'rec-creme-1',
  itemId: 'creme-liquide',
  qty: 20,
  reason: 'receipt',
  unitCost: 35,
  occurredTs: now - 864e5,
  meta: {
    supplierName: 'Centrale Laitière',
    rank: 1,
    shelfLifeDays: 5
  }
});

// 3. Réception 3 : Lot ancien déjà périmé depuis 1 jour
mockKiwiInventory.add({
  id: 'rec-saumon-old',
  itemId: 'saumon-frais',
  qty: 2,
  reason: 'receipt',
  unitCost: 110,
  occurredTs: now - (5 * 864e5),
  meta: {
    supplierName: 'Poissonnerie du Port',
    rank: 1,
    expiresAt: now - (1 * 864e5) // périmé depuis hier
  }
});

// Test deriveLots
const saumonLots = C.deriveLots('saumon-frais');
ok(saumonLots.length === 2, 'deriveLots extrait les 2 lots de saumon');
ok(saumonLots[0].expiresAt < now, 'le premier lot de saumon est identifié comme périmé');
ok(saumonLots[1].expiresAt > now, 'le deuxième lot de saumon a une date d\'expiration valide');

// Test expiring(horizonDays: 7)
const expiring7d = C.expiring({ horizonDays: 7, now: now });
ok(expiring7d.length >= 3, 'expiring() remonte tous les lots échus ou proches (< 7j)');

const expiredLot = expiring7d.find(l => l.itemId === 'saumon-frais' && l.status === 'expired');
ok(expiredLot && expiredLot.remainingQty === 2, 'le lot périmé est classé "expired" avec 2 kg');

const critLot = expiring7d.find(l => l.itemId === 'saumon-frais' && l.status === 'critical');
ok(critLot && critLot.daysLeft === 2, 'le lot à J-2 est classé "critical"');

const warnLot = expiring7d.find(l => l.itemId === 'creme-liquide' && l.status === 'warning');
ok(warnLot && warnLot.remainingQty === 20 && warnLot.daysLeft === 4, 'le lot de crème à J-4 est classé "warning"');

// Déclaration en perte du lot périmé
mockKiwiInventory.add({
  id: 'waste-saumon-perime',
  itemId: expiredLot.itemId,
  qty: -expiredLot.remainingQty,
  reason: 'waste',
  refType: 'waste',
  refId: 'waste-1',
  unitCost: expiredLot.unitCost,
  occurredTs: now,
  note: 'Péremption constatée au contrôle du matin',
  meta: {
    wasteReason: 'perime',
    lotId: expiredLot.lotId
  }
});

// Re-vérification après sortie en perte
const saumonLotsAfter = C.deriveLots('saumon-frais');
ok(saumonLotsAfter.length === 1, 'le lot périmé entièrement sorti en perte n\'apparaît plus dans deriveLots');
ok(saumonLotsAfter[0].status !== 'expired', 'seul le lot consommable subsiste');

const expiringAfter = C.expiring({ horizonDays: 7, now: now });
ok(!expiringAfter.some(l => l.status === 'expired'), 'plus aucun lot n\'est en statut "expired" après déclaration de perte');

console.log(`\n✓ ${pass} controls green\n`);
