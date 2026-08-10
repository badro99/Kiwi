#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
function ok(name, value) {
  if (!value) { console.error('  ✗ ' + name); process.exitCode = 1; return; }
  pass++;
}

const memory = new Map();
const localStorage = {
  getItem: (k) => memory.has(k) ? memory.get(k) : null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const window = {
  localStorage,
  KiwiEnv: { isReal: () => true },
  KiwiStore: { slugFor: () => 'audit-shop' },
  addEventListener() {},
};
window.window = window;
const context = vm.createContext({
  window, localStorage, navigator: { onLine: false }, crypto: globalThis.crypto,
  console, Date, Math, JSON, Map, Set, Promise,
  setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
});
vm.runInContext(read('assets/inventory-ledger.js'), context, { filename: 'inventory-ledger.js' });

const I = window.KiwiInventory;
ok('ledger attaches in a real merchant context', I && I.merchant() === 'audit-shop');
I.ensureOpening('shirt', 5, { unitCost: 20 });
I.ensureOpening('shirt', 5, { unitCost: 20 });
ok('opening balance is deterministic and never duplicates', I.balance('shirt') === 5);

window.KiwiCost = { doc: () => ({
  recipes: {
    dish: { status: 'complete', yield: 2, lines: [{ ing: 'flour', qty: 0.4 }, { ing: 'sauce', qty: 0.1 }] },
  },
}) };
vm.runInContext(read('assets/inventory-consumption.js'), context, { filename: 'inventory-consumption.js' });
I.ensureOpening('flour', 10); I.ensureOpening('sauce', 3);

const C = window.KiwiInventoryConsumption;
C.record({ ref: 'T-1', ts: 1000, lines: [
  { itemId: 'shirt', name: 'Chemise', kind: 'product', qty: 2, unitCost: 20 },
  { itemId: 'ironing', name: 'Repassage', kind: 'service', qty: 1 },
] });
ok('physical product sale decrements its stable item ID', I.balance('shirt') === 3);
ok('service sale never fabricates a stock movement', I.balance('ironing') === 0);
C.record({ ref: 'T-1', ts: 1000, lines: [{ itemId: 'shirt', name: 'Chemise', kind: 'product', qty: 2 }] });
ok('replaying the same ticket is idempotent', I.balance('shirt') === 3);

C.record({ ref: 'T-2', ts: 2000, lines: [{ itemId: 'dish', name: 'Plat', kind: 'product', qty: 2 }] });
ok('complete recipe consumes ingredient quantities by yield', I.balance('flour') === 9.6 && I.balance('sauce') === 2.9);
ok('recipe product is not also double-consumed as finished stock', I.balance('dish') === 0);
C.reverse('T-2', 'Ticket annulé');
ok('sale reversal restores every recipe ingredient', I.balance('flour') === 10 && I.balance('sauce') === 3);
C.reverse('T-2', 'Ticket annulé à nouveau');
ok('replaying a reversal is idempotent', I.balance('flour') === 10 && I.balance('sauce') === 3);

const api = read('functions/api/inventory/movements.js');
ok('server exposes no destructive update/delete route', !/onRequestDelete|\bUPDATE inventory_movements\b/.test(api));
ok('server writes are tenant-checked and idempotent', /strict:\s*true/.test(api) && /INSERT OR IGNORE INTO inventory_movements/.test(api));
ok('server returns the stored cursor on a retried UUID', /SELECT srv_ts AS cursor/.test(api));

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ inventory ledger (${pass} controls: append-only truth, product/service split, recipes, reversal, tenant-safe server contract)`);
