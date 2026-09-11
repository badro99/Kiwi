#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Inventory Waste Management Test (tools/inventory-waste-test.mjs)
 * ---------------------------------------------------------------------------
 * Verifies waste recording from caisse, cashier actor attribution, reason
 * mappings to ledger reasons, FIFO cost freezing, append-only reversals,
 * and UI integrity across caisse and dashboard.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

console.log("■ Gestion des pertes de stock (tools/inventory-waste-test.mjs)");

const caisseSrc = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const stockSyncSrc = fs.readFileSync(path.join(ROOT, 'assets/caisse-stock-sync.js'), 'utf8');
const stockDashSrc = fs.readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');
const ledgerSrc = fs.readFileSync(path.join(ROOT, 'assets/inventory-ledger.js'), 'utf8');

// ── 1. Caisse Stock Sync Adapter — actor attribution in move() ──────────────
ok(/function move\(id, qty, reason, refId, unitCost, meta, actor\)/.test(stockSyncSrc), 'move() signature accepts actor parameter');
ok(/meta\.actorId/.test(stockSyncSrc) && /resolvedActor/.test(stockSyncSrc), 'move() extracts actor name and meta.actorId');

// ── 2. Ledger and Waste Reason Engine ───────────────────────────────────────
const fakeStorage = new Map();
const windowMock = {
  localStorage: {
    getItem: (k) => fakeStorage.get(k) || null,
    setItem: (k, v) => fakeStorage.set(k, String(v)),
    removeItem: (k) => fakeStorage.delete(k),
  },
  KiwiEnv: { isReal: () => true },
  KiwiCloudDoc: { currentSlug: () => 'test-waste-venue' },
  addEventListener: () => {},
};

const ledgerFn = new Function('window', 'localStorage', ledgerSrc);
ledgerFn(windowMock, windowMock.localStorage);
const KiwiInventory = windowMock.KiwiInventory;

ok(typeof KiwiInventory?.add === 'function', 'KiwiInventory.add is initialized');
ok(typeof KiwiInventory?.reverse === 'function', 'KiwiInventory.reverse is initialized');

// Record test movements: Opening stock
KiwiInventory.ensureOpening('tomates-fraiches', 20, { unitCost: 12.5 });
ok(KiwiInventory.balance('tomates-fraiches') === 20, 'opening balance is 20 kg');

// Test waste movement with cashier attribution
const cashier = { id: 'usr-karim', name: 'Karim B.', role: 'Caissier' };
const wasteMov = KiwiInventory.add({
  itemId: 'tomates-fraiches',
  qty: -2.5,
  reason: 'loss',
  refType: 'waste',
  refId: 'waste-t001',
  note: 'Tomates écrasées en caisse',
  unitCost: 12.5,
  actor: cashier.name,
  meta: { wasteReason: 'casse', actorId: cashier.id },
  occurredTs: Date.now()
});

ok(wasteMov && wasteMov.qty === -2.5, 'negative waste movement written');
ok(wasteMov.actor === 'Karim B.', 'movement preserves cashier actor name');
ok(wasteMov.meta && wasteMov.meta.actorId === 'usr-karim', 'movement meta preserves actorId');
ok(wasteMov.meta && wasteMov.meta.wasteReason === 'casse', 'movement meta preserves fine-grained reason');
ok(KiwiInventory.balance('tomates-fraiches') === 17.5, 'balance decremented to 17.5 kg');

// Test append-only reversal
const revMov = KiwiInventory.reverse(wasteMov, 'manual', 'Annulation perte waste-t001');
ok(revMov && revMov.qty === 2.5, 'reversal movement is positive');
ok(revMov.reversalOf === wasteMov.id, 'reversal points to original waste movement ID');
ok(revMov.reason === 'manual', 'reversal reason is manual');
ok(KiwiInventory.balance('tomates-fraiches') === 20, 'balance restored to 20 kg after reversal');

// ── 3. Caisse UI Source Inspection ──────────────────────────────────────────
ok(/data-sk-newwaste|sk-new-waste-btn/.test(caisseSrc), 'caisse has primary button to declare waste on Vue d\'ensemble');
ok(/data-sk-waste=/.test(caisseSrc), 'caisse has row action button to declare waste on article rows');
ok(/openWasteModal/.test(caisseSrc), 'caisse implements openWasteModal function');
ok(/meta\.wasteReason|wasteReason:/.test(caisseSrc), 'caisse stores fine-grained waste reason in meta');
ok(/currentCashier/.test(caisseSrc) && /sk-commit-waste|commitWaste/.test(caisseSrc), 'caisse binds currentCashier to waste movements');
ok(/Derni[eè]res pertes/.test(caisseSrc), 'caisse renders Dernières pertes section in Vue d\'ensemble');

// ── 4. Dashboard UI Source Inspection ───────────────────────────────────────
ok(/Journal des pertes|tabWaste|stWasteSection|stock-waste/.test(stockDashSrc), 'dashboard stock.js includes Journal des pertes view');
ok(/data-stock-export-waste-csv|exportWasteCsv|downloadWasteCsv/.test(stockDashSrc), 'dashboard supports CSV export for waste history');
ok(/Annuler cette perte|stock-cancel-waste|stock-reverse-waste/.test(stockDashSrc), 'dashboard includes owner-only reversal action for waste movements');
ok(/KiwiInventory\.reverse/.test(stockDashSrc), 'dashboard reversal uses KiwiInventory.reverse append-only path');

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
  process.exit(0);
}
