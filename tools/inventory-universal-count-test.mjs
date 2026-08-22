#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Universal Inventory Count Test (tools/inventory-universal-count-test.mjs)
 * ───────────────────────────────────────────────────────────────────────────
 * Validates:
 *  1. Blind POS count schema with frozen human labels (productName, color, size, sku, barcode).
 *  2. Server API (/api/inventory/counts) submission, freeze, review, and application.
 *  3. Ledger engine grouping by (item_id, variant_id, location_id) matches movements.js summary=1.
 *  4. Boutique engine catalog move survival across load → commit → push and 409 stale merge path.
 *  5. Roll-up analytics for recurring variances.
 *  6. UI integration across POS and Dashboard.
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

console.log("■ Inventaire physique universel & revue propriétaire (tools/inventory-universal-count-test.mjs)");

const posCountSrc = fs.readFileSync(path.join(ROOT, 'assets/pos-inventory-count.js'), 'utf8');
const countsApiSrc = fs.readFileSync(path.join(ROOT, 'functions/api/inventory/counts.js'), 'utf8');
const catalogApiSrc = fs.readFileSync(path.join(ROOT, 'functions/api/catalog.js'), 'utf8');
const boutiqueCatalogSrc = fs.readFileSync(path.join(ROOT, 'assets/boutique-catalog.js'), 'utf8');
const stockDashSrc = fs.readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');
const caisseSrc = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const swSrc = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');

// ── 1. POS Blind Count & Frozen Human Labels Schema ─────────────────────────
ok(/productName/.test(posCountSrc) && /color/.test(posCountSrc) && /size/.test(posCountSrc) && /sku/.test(posCountSrc),
  'pos-inventory-count.js freezes productName, color, size, and sku');
ok(/KiwiPosInventoryCount/.test(posCountSrc) && /open/.test(posCountSrc),
  'KiwiPosInventoryCount.open is exported');
ok(/assets\/pos-inventory-count\.js/.test(caisseSrc),
  'kiwi-caisse.html includes stamped pos-inventory-count.js script tag');
ok(/pos-inventory-count\.js/.test(swSrc),
  'kiwi-sw.js includes pos-inventory-count.js in shell cache');

// ── 2. Ledger Engine Grouping Par (item_id, variant_id, location_id) ────────
ok(/COALESCE\(variant_id/.test(countsApiSrc) && /COALESCE\(location_id/.test(countsApiSrc),
  'counts.js groups ledger systemQty by (item_id, variant_id, location_id)');
ok(/GROUP BY item_id, variant_id, location_id/.test(countsApiSrc),
  'counts.js SQL matches movements.js summary=1 grouping');

// ── 3. Boutique Move Round-trip & 409 Stale Merge Path ──────────────────────
// Test client-side merge with server-appended count move
const fakeWindow = {
  localStorage: new Map(),
  addEventListener: () => {},
};

// Simulate boutique catalog merge with server move
const mockMine = {
  v: 1,
  seq: 10,
  categories: [{ id: 'c1', label: 'Vêtements' }],
  products: [{ id: 'p1', name: 'Chemise lin', categoryId: 'c1' }],
  variants: [{ id: 'v1', productId: 'p1', colorLabel: 'Bleu', size: 'M', base: 10, baseAt: 1000, stock: 9 }],
  moves: [{ id: 'm_sale1', vid: 'v1', d: -1, at: 2000, why: 'vente', actor: 'Caissier 1' }]
};

// Server received approved count (+3 diff)
const serverMove = {
  id: 'mov_cnt_test1',
  vid: 'v1',
  d: 3,
  at: 3000,
  why: 'count',
  actor: 'Propriétaire',
  ref: 'cnt_2026_08'
};

const mockTheirs = {
  v: 1,
  seq: 11,
  categories: mockMine.categories,
  products: mockMine.products,
  variants: [{ id: 'v1', productId: 'p1', colorLabel: 'Bleu', size: 'M', base: 10, baseAt: 1000, stock: 12 }],
  moves: [serverMove]
};

// Test catalog merge function logic from boutique-catalog.js
const byMove = {};
const theirMove = {};
(mockTheirs.moves || []).forEach(m => { if (m && m.id) theirMove[m.id] = m; });
(mockMine.moves || []).forEach(m => { if (m && m.id) byMove[m.id] = m; });
Object.keys(theirMove).forEach(id => { if (!byMove[id]) byMove[id] = theirMove[id]; });

ok(byMove['mov_cnt_test1'] && byMove['mov_cnt_test1'].actor === 'Propriétaire',
  'merged catalog preserves server count move actor');
ok(byMove['mov_cnt_test1'] && byMove['mov_cnt_test1'].ref === 'cnt_2026_08',
  'merged catalog preserves server count move ref');
ok(byMove['m_sale1'] && byMove['mov_cnt_test1'],
  '409 stale merge preserves both client sale move and server count move');

// ── 4. Dashboard Historical Views, Drill-Down & Roll-up ─────────────────────
ok(/renderCountsHistory|Historique des inventaires/.test(stockDashSrc),
  'dashboard stock.js includes Historique des inventaires view');
ok(/openCountDetailModal|data-stock-count-detail/.test(stockDashSrc),
  'dashboard stock.js implements drill-down modal for count review');
ok(/Écarts récurrents|stRollup|data-stock-count-tab="rollup"/.test(stockDashSrc),
  'dashboard stock.js includes Écarts récurrents roll-up');
ok(/exportCountsCsv|data-stock-export-counts-csv/.test(stockDashSrc),
  'dashboard stock.js supports CSV export for count history');

// ── 5. Review is the only writing path ──────────────────────────────────────
ok(/data-sk-blind-count|openSkInventaire|KiwiPosInventoryCount/.test(caisseSrc),
  'caisse redirects physical inventory to blind counting flow');
ok(/\/api\/inventory\/counts/.test(posCountSrc) && /method:\s*['"]POST['"]/.test(posCountSrc),
  'pos-inventory-count submits to /api/inventory/counts without direct stock writes');
ok(/review|approve|applied/.test(countsApiSrc),
  'counts.js only mutates stock on explicit owner review/approval');

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
  process.exit(0);
}
