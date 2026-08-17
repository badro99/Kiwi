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
  /* Production inventory follows CloudDoc's current establishment identity;
   * KiwiStore.slugFor was retired because it merged sibling venues. */
  KiwiCloudDoc: { currentSlug: () => 'audit-shop' },
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
    dish: { status: 'complete', yield: 2, lines: [{ ing: 'stock:flour', stock: 'flour', qty: 0.4 }, { ing: 'stock:sauce', stock: 'sauce', qty: 0.1 }] },
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

/* ── Dashboard cancellation & void restock wiring ── */
const dateRangeCode = read('assets/dateRange.js');
const customFeedBlock = dateRangeCode.slice(
  dateRangeCode.indexOf('function buildCustomFeed('),
  dateRangeCode.indexOf('function renderFeed(')
);
ok('buildCustomFeed propage ref et receiptNo',
  /^\s*ref:\s*String\(s\.ref/m.test(customFeedBlock) && /^\s*receiptNo:\s*String\(s\.ref/m.test(customFeedBlock));

const interactiveCode = read('assets/interactive.js');
ok('le tiroir de commande dispatche la référence de commande',
  /^\s*const targetRef = String\(o\.ref \|\| o\.receiptNo/m.test(interactiveCode));

const pagesProCode = read('assets/pages-pro.js');
ok('pages-pro reverse le stock sur kiwi-sales-voided et alerte si non recrédité',
  /^\s*reversed\s*=\s*window\.KiwiInventoryConsumption\.reverse/m.test(pagesProCode) && /stock non recrédité/.test(pagesProCode));

/* Exécution de l'écouteur extrait directement de pages-pro.js */
let toastWarning = null;
context.toast = (msg, opts) => { if (opts && opts.type === 'warning') toastWarning = msg; };
context.loadCancelAudit = () => {};
context.cancelAuditVoidSig = '';

const startMarker = "document.addEventListener('kiwi-sales-voided', (e) => {";
const startIdx = pagesProCode.indexOf(startMarker);
let handlerBody = '';
if (startIdx >= 0) {
  const bodyStart = startIdx + startMarker.length;
  let depth = 1;
  let idx = bodyStart;
  while (idx < pagesProCode.length && depth > 0) {
    if (pagesProCode[idx] === '{') depth++;
    else if (pagesProCode[idx] === '}') depth--;
    idx++;
  }
  handlerBody = pagesProCode.slice(bodyStart, idx - 1);
}
ok('l’écouteur kiwi-sales-voided est présent dans pages-pro.js', !!handlerBody);
const runVoidHandler = (refs) => {
  context.eventMock = { detail: { refs } };
  vm.runInContext(`((e) => { ${handlerBody} })(eventMock)`, context);
};

C.record({ ref: 'T-3', ts: 3000, lines: [{ itemId: 'shirt', name: 'Chemise', kind: 'product', qty: 1 }] });
ok('nouvelle vente T-3 décrémente le stock', I.balance('shirt') === 2);
runVoidHandler(['T-3']);
ok('l’annulation tableau de bord recrédite le stock', I.balance('shirt') === 3);

toastWarning = null;
runVoidHandler(['']);
ok('une référence vide déclenche l’alerte visible', !!toastWarning && toastWarning.includes('stock non recrédité'));

toastWarning = null;
runVoidHandler(['T-UNKNOWN-99']);
ok('une référence sans ligne de stock déclenche l’alerte visible', !!toastWarning && toastWarning.includes('stock non recrédité'));

// Test pairing resolution when KiwiCloudDoc is absent
const pairedMem = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'santos-store', name: 'Santos Store' })]]);
const pairedStorage = { getItem: (k) => pairedMem.get(k) || null, setItem: (k, v) => pairedMem.set(k, String(v)), removeItem: (k) => pairedMem.delete(k) };

// With KiwiPlatform present
const pairedWinWith = {
  localStorage: pairedStorage,
  KiwiEnv: { isReal: () => true },
  addEventListener: () => {},
};
pairedWinWith.window = pairedWinWith;
const pairedCtxWith = vm.createContext({
  window: pairedWinWith, localStorage: pairedStorage, navigator: { onLine: false }, crypto: globalThis.crypto,
  console, Date, Math, JSON, Map, Set, Promise,
  setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
});
vm.runInContext(read('assets/platform-kernel.js'), pairedCtxWith);
vm.runInContext(read('assets/inventory-ledger.js'), pairedCtxWith);
ok('inventory ledger resolves paired merchant via KiwiPlatform when CloudDoc absent', pairedWinWith.KiwiInventory && pairedWinWith.KiwiInventory.merchant() === 'santos-store');

// Without KiwiPlatform (fallback)
const pairedWinWithout = {
  localStorage: pairedStorage,
  KiwiEnv: { isReal: () => true },
  addEventListener: () => {},
};
pairedWinWithout.window = pairedWinWithout;
const pairedCtxWithout = vm.createContext({
  window: pairedWinWithout, localStorage: pairedStorage, navigator: { onLine: false }, crypto: globalThis.crypto,
  console, Date, Math, JSON, Map, Set, Promise,
  setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
});
vm.runInContext(read('assets/inventory-ledger.js'), pairedCtxWithout);
ok('inventory ledger resolves paired merchant via fallback when KiwiPlatform absent', pairedWinWithout.KiwiInventory && pairedWinWithout.KiwiInventory.merchant() === 'santos-store');

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ inventory ledger (${pass} controls: append-only truth, product/service split, recipes, reversal, dashboard void restock, tenant-safe server contract, paired merchant resolution)`);
