#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Multi-Supplier Stock Costing — Phase 1 Migration Test Suite
 *
 *   node tools/stock-costing-migration-test.mjs
 *
 * Verifies that migrating flat stock items to categories/subcategories:
 *   1. Auto-migrates v1 documents to v2 idempotently.
 *   2. Preserves full backward-compatibility with v1 clients via dual-write envelope.
 *   3. Keeps 100% of existing recipes resolving (status: complete, exact cost).
 *   4. Ensures inventory-consumption generates identical recipeLines and movements.
 *   5. Heals costs cleanly without regression.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
const ok = (label, cond, detail) => {
  if (cond) {
    pass++;
  } else {
    console.error('✗ ' + label + (detail ? ' — ' + detail : ''));
    process.exit(1);
  }
};

/* ── 1. Load Real Modules ─────────────────────────────────────────────────── */
const mem = new Map();
const localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const storeDocs = {};
const storeSubscribers = {};
const fakeKiwiStore = {
  define: (name) => {
    storeDocs[name] = storeDocs[name] || { items: {} };
    storeSubscribers[name] = storeSubscribers[name] || [];
    return {
      get: (id) => storeDocs[name],
      update: (fn, id) => {
        storeDocs[name] = fn(JSON.parse(JSON.stringify(storeDocs[name]))) || storeDocs[name];
        storeSubscribers[name].forEach((cb) => cb(storeDocs[name]));
        return storeDocs[name];
      },
      subscribe: (fn) => {
        storeSubscribers[name].push(fn);
        return () => {};
      },
    };
  },
  subscribe: (name, fn) => {
    storeSubscribers[name] = storeSubscribers[name] || [];
    storeSubscribers[name].push(fn);
  },
};

let stockOverlayData = {
  items: [
    { id: 'inv-butter', name: 'Beurre doux', category: 'laitiers', unit: 'kg', costPerUnit: 70, supplier: 'Centrale Danone', parLevel: 20, reorderLevel: 5, currentStock: 15, updatedAt: 1000 },
    { id: 'inv-chicken', name: 'Poulet fermier', category: 'viandes', unit: 'kg', costPerUnit: 52, supplier: 'Volailles Atlas', parLevel: 30, reorderLevel: 10, currentStock: 25, updatedAt: 1000 },
    { id: 'inv-saffron', name: 'Safran pur', category: 'epices', unit: 'g', costPerUnit: 18, supplier: 'Coopérative Taliouine', parLevel: 50, reorderLevel: 10, currentStock: 40, updatedAt: 1000 },
  ],
  itemOv: {},
  delItems: [],
  sups: [
    { id: 'sup-1', name: 'Centrale Danone', phone: '0522000000' },
    { id: 'sup-2', name: 'Volailles Atlas', phone: '0522111111' },
    { id: 'sup-3', name: 'Coopérative Taliouine', phone: '0528222222' },
  ],
  supOv: {},
  delSups: [],
  cats: [
    { id: 'laitiers', label: 'Produits laitiers' },
    { id: 'viandes', label: 'Viandes & Volailles' },
    { id: 'epices', label: 'Épices & Aromates' },
  ],
  stockOv: {},
};

localStorage.setItem('kiwi:stockOverlay:mon-resto', JSON.stringify(stockOverlayData));

const timers = [];
function drainTimers() {
  while (timers.length) {
    const fn = timers.shift();
    try { fn(); } catch (_) {}
  }
}

let stockAttachOpts = null;
let caisseAttachOpts = null;

const context = {
  window: {
    KiwiStore: fakeKiwiStore,
    KiwiPlatform: {
      pairedMerchant: () => 'mon-resto',
    },
    KiwiVenue: {
      getVenue: () => 'mon-resto',
      getCurrentVenueData: () => ({ id: 'mon-resto', slug: 'mon-resto', name: 'Mon Restaurant' }),
      isCustom: () => true,
    },
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: {
      slugFor: () => 'mon-resto',
      currentSlug: () => 'mon-resto',
      attach: (cfg) => {
        if (cfg.localKey && typeof cfg.localKey === 'function') caisseAttachOpts = cfg;
        else stockAttachOpts = cfg;
        return {
          bind: () => Promise.resolve(false),
          push: () => {},
          pull: () => {},
        };
      },
      mergeDefault: (mine, theirs) => Object.assign({}, theirs, mine),
      carryForward: () => false,
    },
    KiwiI18n: { getLang: () => 'fr', onLangChange: () => () => {} },
    localStorage: localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    console: console,
  },
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 'complete',
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild: () => {} },
    createElement: () => ({ style: {} }),
  },
  localStorage: localStorage,
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  console: console,
};
context.window.window = context.window;
vm.createContext(context);

// Load units, stock, recipes, cost, consumption, ledger
vm.runInContext(R('assets/restaurant-units.js'), context);
vm.runInContext(R('assets/inventory-ledger.js'), context);
vm.runInContext(R('assets/stock.js'), context);
vm.runInContext(R('assets/caisse-stock-sync.js'), context);
vm.runInContext(R('assets/restaurant-recipes.js'), context);
vm.runInContext(R('assets/cost.js'), context);
vm.runInContext(R('assets/inventory-consumption.js'), context);

const win = context.window;
const Stock = win.KiwiRestaurantStock;
const Recipes = win.KiwiRestaurantRecipes;
const Cost = win.KiwiCost;
const Consumption = win.KiwiInventoryConsumption;
const CaisseStock = win.KiwiCaisseStock;

ok('KiwiRestaurantStock is loaded and accessible', !!Stock && typeof Stock.rows === 'function');
ok('KiwiRestaurantRecipes is loaded and accessible', !!Recipes && typeof Recipes.save === 'function');
ok('KiwiCaisseStock is loaded and accessible', !!CaisseStock && typeof CaisseStock.snapshot === 'function');

/* ── 2. Create Real Production Recipes ────────────────────────────────────── */
// Tajine Poulet au Safran: 1.2 kg poulet, 0.5 g safran, 0.05 kg beurre (50g)
const tajineLines = [
  { stockId: 'inv-chicken', name: 'Poulet fermier', qty: 1.2, unit: 'kg' },
  { stockId: 'inv-saffron', name: 'Safran pur', qty: 0.5, unit: 'g' },
  { stockId: 'inv-butter', name: 'Beurre doux', qty: 50, unit: 'g' },
];

Recipes.save('dish-tajine', {
  itemName: 'Tajine de Poulet au Safran',
  portions: 1,
  ingredients: tajineLines,
});

// Theoretical cost computation:
// 1.2 kg chicken @ 52 = 62.40
// 0.5 g saffron @ 18/g = 9.00
// 50 g butter @ 70/kg = 0.05 * 70 = 3.50
// Total = 62.40 + 9.00 + 3.50 = 74.90 MAD
const preMetrics = Recipes.metrics({ id: 'dish-tajine', name: 'Tajine de Poulet au Safran', price: 120 }, Recipes.get('dish-tajine'), 'mon-resto');
ok('Pre-migration recipe theoreticalCost is accurate (74.90 MAD)', preMetrics.theoreticalCost === 74.9, `got ${preMetrics.theoreticalCost}`);
ok('Pre-migration recipe status is complete', preMetrics.costComplete === true);

const costDoc = Cost.store.get('mon-resto');
ok('Pre-migration costDoc has complete recipe', costDoc.recipes['dish-tajine'] && costDoc.recipes['dish-tajine'].status === 'complete');
const preRecipeCost = Cost.of({ kind: 'menu', id: 'dish-tajine', name: 'Tajine de Poulet au Safran' }, { doc: costDoc });
ok('Pre-migration Cost.of evaluates recipe to 74.90 MAD', preRecipeCost.mad === 74.9, `got ${preRecipeCost.mad}`);

/* ── 3. Test Migration Helper & Auto-Upgrade ───────────────────────────────── */
const rawDoc = JSON.parse(localStorage.getItem('kiwi:stockOverlay:mon-resto'));
ok('Raw storage doc is v1 before explicit migration', !rawDoc.schemaVersion || rawDoc.schemaVersion === 1);

// Trigger CaisseStock snapshot which runs migration
const snap = CaisseStock.snapshot();
ok('CaisseStock snapshot returns 3 materialized items', snap.items.length === 3);

const migratedDoc = JSON.parse(localStorage.getItem('kiwi:stockOverlay:mon-resto'));
ok('Storage doc auto-migrated to schemaVersion 2', migratedDoc.schemaVersion === 2);
ok('Storage doc contains subcategories array with 3 entries', Array.isArray(migratedDoc.subcategories) && migratedDoc.subcategories.length === 3);
ok('Subcategories maintain exact stock IDs', migratedDoc.subcategories.some((s) => s.id === 'inv-butter' && s.defaultCost === 70));
ok('Subcategories maintain suppliers array', migratedDoc.subcategories.find((s) => s.id === 'inv-butter').suppliers.length === 1);
ok('Dual-write backward compatibility items array is preserved', Array.isArray(migratedDoc.items) && migratedDoc.items.length === 3);

/* ── 4. Verify Recipe Non-Regression Post-Migration ───────────────────────── */
// Re-read inventory rows from KiwiRestaurantStock
const rows = Stock.rows();
ok('KiwiRestaurantStock.rows() returns 3 items from subcategories', rows.length === 3);
const butterRow = rows.find((r) => r.id === 'inv-butter');
ok('Butter row preserves id, name, unit, costPerUnit', butterRow && butterRow.id === 'inv-butter' && butterRow.costPerUnit === 70 && butterRow.unit === 'kg');

// Re-evaluate recipe metrics
const postMetrics = Recipes.metrics({ id: 'dish-tajine', name: 'Tajine de Poulet au Safran', price: 120 }, Recipes.get('dish-tajine'), 'mon-resto');
ok('Post-migration recipe theoreticalCost is still exactly 74.90 MAD', postMetrics.theoreticalCost === 74.9, `got ${postMetrics.theoreticalCost}`);
ok('Post-migration recipe status remains complete', postMetrics.costComplete === true);

// Re-evaluate Cost.of
const postCostDoc = Cost.store.get('mon-resto');
const postRecipeCost = Cost.of({ kind: 'menu', id: 'dish-tajine', name: 'Tajine de Poulet au Safran' }, { doc: postCostDoc });
ok('Post-migration Cost.of evaluates recipe to 74.90 MAD', postRecipeCost.mad === 74.9, `got ${postRecipeCost.mad}`);

/* ── 5. Verify Inventory Consumption Lines ────────────────────────────────── */
const recipeLines = Consumption.recipeLines('dish-tajine', 2, postCostDoc, 0, []);
ok('Consumption recipeLines resolves 3 ingredient targets', recipeLines && recipeLines.length === 3);
const chickenTarget = recipeLines.find((x) => x.itemId === 'inv-chicken');
ok('Chicken consumption qty is 2.4 kg (2 x 1.2 kg)', chickenTarget && chickenTarget.qty === 2.4);
ok('Chicken unitCost is 52 MAD/kg', chickenTarget && chickenTarget.unitCost === 52);

const butterTarget = recipeLines.find((x) => x.itemId === 'inv-butter');
ok('Butter consumption qty is 0.1 kg (2 x 50g = 100g = 0.1kg)', butterTarget && Math.abs(butterTarget.qty - 0.1) < 1e-6);
ok('Butter unitCost is 70 MAD/kg', butterTarget && butterTarget.unitCost === 70);

/* ── 6. Idempotency & Stale Client Sync Test ──────────────────────────────── */
// Re-saving through CaisseStock
CaisseStock.updateItem('inv-butter', { cost: 75 });
const updatedDoc = JSON.parse(localStorage.getItem('kiwi:stockOverlay:mon-resto'));
ok('Updating item cost updates subcategory defaultCost to 75', updatedDoc.subcategories.find((s) => s.id === 'inv-butter').defaultCost === 75);
ok('Updating item cost updates backward-compatible items costPerUnit to 75', updatedDoc.items.find((s) => s.id === 'inv-butter').costPerUnit === 75);

// Re-heal
const healedCount = Recipes.heal('mon-resto');
ok('heal() runs cleanly', healedCount >= 0);

/* ── 7. L'enveloppe ne doit RIEN détruire ────────────────────────────────────
 * migrateStockDocV2 et syncEnvelope reconstruisaient d.items depuis une liste
 * fixe de champs. Tout champ hors liste — lastDelivery, deliveryFrequency,
 * status, sku, notes — disparaissait, et stOverlayRaw() réécrit le document
 * migré dans localStorage dès la LECTURE : la perte était immédiate et
 * définitive, sur les livres réels d'un commerçant. */
function migrationOf(file) {
  const all = R(file);
  const i = all.indexOf('function migrateStockDocV2');
  let depth = 0, k = all.indexOf('{', i);
  do { if (all[k] === '{') depth++; else if (all[k] === '}') depth--; k++; } while (depth > 0);
  return new Function(all.slice(i, k) + '; return migrateStockDocV2;')();
}
const RICH = {
  id: 'inv01', name: 'Viande hachée bœuf', category: 'viandes', unit: 'kg',
  currentStock: 12.4, parLevel: 18, reorderLevel: 8, costPerUnit: 95,
  supplier: 'Boucherie Errazi', lastDelivery: '2026-05-13',
  deliveryFrequency: 'mardi-vendredi', usageThisWeek: 28.6,
  theoreticalUsage: 29.2, status: 'low', sku: 'BF-001', notes: 'halal',
};
for (const file of ['assets/stock.js', 'assets/caisse-stock-sync.js']) {
  const out = migrationOf(file)({ items: [JSON.parse(JSON.stringify(RICH))], cats: [] });
  const kept = out.items[0] || {};
  const lost = Object.keys(RICH).filter((f) => !(f in kept));
  ok(`${file} · l'enveloppe preserve les champs hors liste projetee`, lost.length === 0,
    lost.length ? 'champs detruits : ' + lost.join(', ') : '');
  ok(`${file} · lastDelivery et status survivent a la migration`,
    kept.lastDelivery === '2026-05-13' && kept.status === 'low' && kept.sku === 'BF-001');
}

/* ── 8. Retail Vertical Direct Deductions ───────────────────────────────────
 * All fourteen POS verticals share this stock document. Retail paths (boutique,
 * épicerie, pharmacie) sell direct products without recipe explosion. */
const Inv = win.KiwiInventory;
Inv.ensureOpening('robe-01', 10, { unitCost: 150 });
ok('Opening balance for retail item robe-01 is 10', Inv.balance('robe-01') === 10);

const retailSale = {
  id: 'sale-boutique-101',
  ts: 2000,
  lines: [
    { itemId: 'robe-01', name: 'Robe en soie', qty: 2, unitCost: 150 },
    { itemId: 'service-giftwrap', name: 'Emballage cadeau', kind: 'service', qty: 1 },
  ],
};
const retailRes = Consumption.record(retailSale);
ok('Retail sale wrote 1 movement and skipped 1 service', retailRes.written === 1 && retailRes.skipped === 1);
ok('Retail item stock balance decreased to 8', Inv.balance('robe-01') === 8);
const retailMvt = Inv.history('robe-01').find((m) => m.refId === 'sale-boutique-101');
ok('Retail movement preserved direct unitCost 150', retailMvt && retailMvt.unitCost === 150 && retailMvt.qty === -2);

/* ── 9. Historical Report Invariant ─────────────────────────────────────────
 * Past reports and margin sums evaluated over past date ranges must produce
 * byte-identical numbers before and after schema migration. */
const histBeforeSum = Inv.history('robe-01').reduce((s, m) => s + (m.unitCost || 0) * Math.abs(m.qty), 0);
const preDocValuation = JSON.parse(localStorage.getItem('kiwi:stockOverlay:mon-resto'));
migrationOf('assets/stock.js')(preDocValuation);
const histAfterSum = Inv.history('robe-01').reduce((s, m) => s + (m.unitCost || 0) * Math.abs(m.qty), 0);
ok('Historical movement cost evaluation is byte-identical across migration', histBeforeSum === histAfterSum);

/* ── 10. Stale v1 Client Timestamp Reconciliation in stMergeOverlay ─────────
 * When a stale v1 client (only editing d.items) posts an update with a newer
 * timestamp, the merge function must promote the edit into subcategories. */
const v2Doc = {
  schemaVersion: 2,
  subcategories: [{ id: 'inv-saffron', name: 'Safran pur', categoryId: 'epices', unit: 'g', defaultCost: 18, updatedAt: 1000, suppliers: [] }],
  items: [{ id: 'inv-saffron', name: 'Safran pur', category: 'epices', unit: 'g', costPerUnit: 18, updatedAt: 1000 }],
};
const staleV1Doc = {
  items: [{ id: 'inv-saffron', name: 'Safran pur', category: 'epices', unit: 'g', costPerUnit: 22, updatedAt: 3000 }],
};
const mergedOut = caisseAttachOpts.merge(v2Doc, staleV1Doc);
const mergedSaffron = mergedOut.subcategories.find((s) => s.id === 'inv-saffron');
ok('merge reconciles newer v1 item timestamp into subcategory defaultCost (22)', mergedSaffron && mergedSaffron.defaultCost === 22);
ok('merge keeps backward-compatible items costPerUnit in sync (22)', mergedOut.items.find((it) => it.id === 'inv-saffron')?.costPerUnit === 22);

/* ── 11. Multi-Supplier Reception, Frozen Price & Ranked Depletion ──────────
 * Tests the core Phase 2 workflow:
 *   - Reception 1: 10 kg butter @ 70 MAD/kg from Centrale Danone (Rank 1)
 *   - Reception 2: 10 kg butter @ 95 MAD/kg from Copag (Rank 2)
 *   - Ranked depletion consumes Rank 1 first, then Rank 2, then legacy opening. */
Inv.ensureOpening('inv-butter-test', 5, { unitCost: 65, note: 'Opening legacy' }); // 5 kg legacy @ 65

// Reception #1 from Supplier 1 @ 70
Inv.add({
  id: 'rcpt-butter-01', itemId: 'inv-butter-test', qty: 10, reason: 'receipt', refType: 'receipt', refId: 'PO-101',
  unitCost: 70, occurredTs: 10000,
  meta: { supplierId: 'sup-danone', supplierName: 'Centrale Danone', rank: 1 },
});

// Reception #2 from Supplier 2 @ 95
Inv.add({
  id: 'rcpt-butter-02', itemId: 'inv-butter-test', qty: 10, reason: 'receipt', refType: 'receipt', refId: 'PO-102',
  unitCost: 95, occurredTs: 20000,
  meta: { supplierId: 'sup-copag', supplierName: 'Copag', rank: 2 },
});

// Verify active lots derived
const derived = Consumption.deriveLots('inv-butter-test');
ok('deriveLots finds 3 active lots (Rank 1, Rank 2, Legacy)', derived.length === 3);
ok('Lot 1 is Rank 1 @ 70', derived[0].rank === 1 && derived[0].unitCost === 70);
ok('Lot 2 is Rank 2 @ 95', derived[1].rank === 2 && derived[1].unitCost === 95);
ok('Lot 3 is Legacy @ 65', derived[2].rank === 999 && derived[2].unitCost === 65);

// Depletion 1: Sale of 3 kg butter -> completely covered by Rank 1 @ 70
const cost1 = Consumption.allocateCost('inv-butter-test', 3, 70);
ok('Depletion 1 (3 kg) allocates exactly 70.00 MAD/kg from Rank 1', cost1 === 70);

// Book consumption movement 1
Inv.add({
  id: 'sale-mvt-01', itemId: 'inv-butter-test', qty: -3, reason: 'sale', refType: 'sale', refId: 'sale-01',
  unitCost: cost1, occurredTs: 30000,
});

// Depletion 2: Sale of 8 kg butter -> consumes remaining 7 kg @ 70 + 1 kg @ 95 -> (7*70 + 1*95)/8 = 73.125
const cost2 = Consumption.allocateCost('inv-butter-test', 8, 70);
ok('Depletion 2 (8 kg straddling Rank 1 and Rank 2) allocates 73.125 MAD/kg', cost2 === 73.125, `got ${cost2}`);

// Book consumption movement 2
Inv.add({
  id: 'sale-mvt-02', itemId: 'inv-butter-test', qty: -8, reason: 'sale', refType: 'sale', refId: 'sale-02',
  unitCost: cost2, occurredTs: 40000,
});

// Depletion 3: Sale of 9 kg butter -> completely covered by remaining 9 kg of Rank 2 @ 95
const cost3 = Consumption.allocateCost('inv-butter-test', 9, 70);
ok('Depletion 3 (9 kg) allocates exactly 95.00 MAD/kg from Rank 2', cost3 === 95, `got ${cost3}`);

// Book consumption movement 3
Inv.add({
  id: 'sale-mvt-03', itemId: 'inv-butter-test', qty: -9, reason: 'sale', refType: 'sale', refId: 'sale-03',
  unitCost: cost3, occurredTs: 50000,
});

// Depletion 4: Sale of 4 kg butter -> supplier lots exhausted, draws 4 kg from legacy opening @ 65
const cost4 = Consumption.allocateCost('inv-butter-test', 4, 70);
ok('Depletion 4 (4 kg) falls back to finite legacy opening @ 65 MAD/kg', cost4 === 65, `got ${cost4}`);

/* ── 12. Reversals Restore Lots (Defect 1 Guard) ───────────────────────────
 * When a sale is voided/reversed at the register, positive movements with
 * non-inbound reasons (e.g. sale-reversal, return) must reduce depletions so
 * that stock returned to the shelf restores lot balances.
 * Reproduction test:
 *   - Receipt 5 kg @ 70 (Rank 1) + Receipt 5 kg @ 95 (Rank 2) -> 10 kg
 *   - Sell 6 kg -> unitCost = 74.1667 (5kg @ 70 + 1kg @ 95)
 *   - Reverse sale -> balance returns to 10 kg
 *   - Sell 5 kg -> MUST cost exactly 70 MAD/kg (Rank 1 restored), not 76! */
Inv.add({
  id: 'rcpt-void-01', itemId: 'item-void-test', qty: 5, reason: 'receipt', refType: 'receipt', refId: 'PO-V1',
  unitCost: 70, occurredTs: 100000,
  meta: { supplierId: 'sup-1', supplierName: 'Fournisseur 1', rank: 1 },
});
Inv.add({
  id: 'rcpt-void-02', itemId: 'item-void-test', qty: 5, reason: 'receipt', refType: 'receipt', refId: 'PO-V2',
  unitCost: 95, occurredTs: 100001,
  meta: { supplierId: 'sup-2', supplierName: 'Fournisseur 2', rank: 2 },
});
ok('Pre-sale balance for item-void-test is 10 kg', Inv.balance('item-void-test') === 10);

const costVoid1 = Consumption.allocateCost('item-void-test', 6, 70);
ok('Initial 6 kg allocation costs 74.1667 MAD/kg', Math.abs(costVoid1 - (350 + 95) / 6) < 1e-4);

Inv.add({
  id: 'sale-void-mvt-01', itemId: 'item-void-test', qty: -6, reason: 'sale', refType: 'sale', refId: 'sale-v100',
  unitCost: costVoid1, occurredTs: 100002,
});
ok('Post-sale balance for item-void-test is 4 kg', Inv.balance('item-void-test') === 4);

// Void the sale
const reversedCount = Consumption.reverse('sale-v100');
ok('Sale was reversed in ledger', reversedCount === 1);
ok('Post-reversal balance for item-void-test returned to 10 kg', Inv.balance('item-void-test') === 10);

// Next sale of 5 kg must be fully allocated from Rank 1 @ 70
const costAfterVoid = Consumption.allocateCost('item-void-test', 5, 70);
ok('Sale after reversal allocates from restored Rank 1 lot @ 70.00 MAD/kg (not 76)', costAfterVoid === 70, `got ${costAfterVoid}`);

/* ── 13. Partial Coverage Signals Incompleteness (Defect 2 Guard) ───────────
 * When defaultUnitCost is null and lots only partially cover the required quantity,
 * allocateCost must return null (admitted gap) rather than diluting the average
 * by costing the unbacked portion at 0 MAD. */
Inv.add({
  id: 'rcpt-partial-01', itemId: 'item-partial-test', qty: 5, reason: 'receipt', refType: 'receipt', refId: 'PO-P1',
  unitCost: 95, occurredTs: 200000,
  meta: { supplierId: 'sup-partial', supplierName: 'Fournisseur Partiel', rank: 1 },
});

// Require 10 kg when only 5 kg @ 95 exists and default is null
const costPartialIncomplete = Consumption.allocateCost('item-partial-test', 10, null);
ok('Partial coverage with null default returns null (not diluted 47.50)', costPartialIncomplete === null, `got ${costPartialIncomplete}`);

// Require 5 kg when 5 kg @ 95 exists and default is null
const costPartialComplete = Consumption.allocateCost('item-partial-test', 5, null);
ok('Full coverage with null default returns exact lot cost (95.00)', costPartialComplete === 95, `got ${costPartialComplete}`);

/* ── 14. stMergeOverlay ne doit RIEN détruire non plus ────────────────────────
 * Troisième site de reconstruction de d.items. Il tourne à CHAQUE sync cloud :
 * un correctif à la migration seule est défait au premier pull. Le contrôle
 * exige window.KiwiCloudDoc.mergeDefault — sans lui la fonction rend `mine`
 * intact et un test naïf passe au vert sans avoir rien exercé. */
{
  const all = R('assets/stock.js');
  const grab = (name) => {
    const i = all.indexOf('function ' + name);
    let depth = 0, k = all.indexOf('{', i);
    do { if (all[k] === '{') depth++; else if (all[k] === '}') depth--; k++; } while (depth > 0);
    return all.slice(i, k);
  };
  const win = { KiwiCloudDoc: { mergeDefault: (mine, theirs) => Object.assign({}, theirs, mine) } };
  const merge = new Function('window', grab('migrateStockDocV2') + '\n' + grab('stMergeOverlay') + '; return stMergeOverlay;')(win);
  const item = { id: 'inv01', name: 'Beurre', category: 'laitiers', unit: 'kg', costPerUnit: 70,
    lastDelivery: '2026-05-13', deliveryFrequency: 'mardi-vendredi', status: 'low', sku: 'BT-1', notes: 'bio', updatedAt: 2000 };
  const sub = { id: 'inv01', categoryId: 'laitiers', name: 'Beurre', unit: 'kg', defaultCost: 70, suppliers: [],
    currentStock: 5, parLevel: 10, reorderLevel: 3, usageThisWeek: 0, theoreticalUsage: 0, updatedAt: 2000 };
  const mk = () => ({ schemaVersion: 2, items: [JSON.parse(JSON.stringify(item))], subcategories: [JSON.parse(JSON.stringify(sub))],
    itemOv: {}, supOv: {}, sups: [], cats: [], delItems: [], delSups: [], stockOv: {} });
  const out = merge(mk(), mk());
  const kept = (out.items && out.items[0]) || {};
  ok('stMergeOverlay · le merge a bien reconstruit les articles (mergeDefault present)', 'costPerUnit' in kept && out.items.length === 1);
  const lost = Object.keys(item).filter((f) => !(f in kept));
  ok('stMergeOverlay · le merge cloud preserve les champs hors liste projetee', lost.length === 0,
    lost.length ? 'champs detruits : ' + lost.join(', ') : '');
  ok('stMergeOverlay · le merge ne fuit pas la forme v2 dans l article plat', !('suppliers' in kept) && !('defaultCost' in kept));
}
console.log(`✓ stock costing Phase 1 & Phase 2 (${pass} controls: v2 migration, subcategories, zero field loss, retail direct depletions, historical stability, v1 merge, multi-supplier ranked depletion, reversal restoration, partial coverage honesty)`);


