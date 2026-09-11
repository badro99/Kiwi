#!/usr/bin/env node
/* Caisse and dashboard must share one catalog document and one quantity ledger. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0; const fails = [];
const ok = (name, cond, detail = '') => cond ? pass++ : fails.push(name + (detail ? ` — ${detail}` : ''));
const mem = new Map();
const localStorage = {
  getItem: (k) => mem.has(k) ? mem.get(k) : null,
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'amira-cafe' }));
const listeners = {};
const win = {
  localStorage, KiwiEnv: { isReal: () => true },
  addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  dispatchEvent() {}, CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o?.detail; } },
};
win.window = win;
const documentListeners = {};
const document = {
  readyState: 'complete', visibilityState: 'visible',
  addEventListener(type, fn) { (documentListeners[type] ||= []).push(fn); },
};
const ctx = vm.createContext({
  window: win, localStorage, document, navigator: { onLine: false },
  console, Date, Math, JSON, Map, Set, Promise, Object, Array,
  crypto: globalThis.crypto, CustomEvent: win.CustomEvent,
  setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
});

vm.runInContext(R('assets/inventory-ledger.js'), ctx, { filename: 'inventory-ledger.js' });
let attached = null; let pushes = 0;
win.KiwiCloudDoc = {
  currentSlug: () => 'amira-cafe',
  mergeDefault: (a, b) => Object.assign({}, b || {}, a || {}),
  attach(opts) {
    attached = opts;
    return { bind: async () => false, pull: async () => false, push: () => { pushes++; } };
  },
};
vm.runInContext(R('assets/caisse-stock-sync.js'), ctx, { filename: 'caisse-stock-sync.js' });
const S = win.KiwiCaisseStock;

ok('bridge uses the paired merchant slug', S.slug() === 'amira-cafe');
ok('bridge binds the canonical stock cloud document', attached?.feature === 'stock' && attached.slug() === 'amira-cafe');
ok('bridge stores the dashboard overlay under the tenant', attached?.localKey() === 'kiwi:stockOverlay:amira-cafe');
const id = S.addItem({ name: 'Tomates', cat: 'legumes', unit: 'kg', supplier: 'Marché', stock: 12, par: 20, reorder: 5, cost: 9 });
let item = S.items().find((row) => row.id === id);
ok('caisse-created item is immediately materialized', item?.name === 'Tomates' && item.stock === 12 && item.cost === 9);
const raw = JSON.parse(localStorage.getItem('kiwi:stockOverlay:amira-cafe'));
ok('caisse writes the dashboard catalog schema', raw.items[0].category === 'legumes' && raw.items[0].currentStock === 12 && raw.items[0].costPerUnit === 9);
ok('catalog changes request a cloud push', pushes > 0);
S.move(id, 3, 'receipt', 'PO-1', 9);
item = S.items().find((row) => row.id === id);
ok('receiving stock appends to the shared ledger', item.stock === 15, `stock=${item.stock}`);
S.count(id, 8, 'COUNT-1');
item = S.items().find((row) => row.id === id);
ok('physical count reconciles through the ledger', item.stock === 8, `stock=${item.stock}`);
S.updateItem(id, { par: 25, reorder: 7, cost: 10, stock: 9 });
item = S.items().find((row) => row.id === id);
ok('caisse edits dashboard metadata and stock together', item.par === 25 && item.reorder === 7 && item.cost === 10 && item.stock === 9);
const after = JSON.parse(localStorage.getItem('kiwi:stockOverlay:amira-cafe'));
ok('metadata edits are timestamped item overrides', after.itemOv[id].parLevel === 25 && after.itemOv[id].updatedAt > 0);
const caisse = R('kiwi-caisse.html'); const dashboard = R('assets/stock.js');
ok('caisse shell loads the bridge after the ledger', caisse.indexOf('inventory-ledger.js') < caisse.indexOf('caisse-stock-sync.js'));
ok('all caisse quantity entry paths use the bridge', /KiwiCaisseStock\.move/.test(caisse) && /KiwiCaisseStock\.count/.test(caisse) && /KiwiCaisseStock\.updateItem/.test(caisse));
ok('dashboard repaints from cross-tab ledger changes', /KiwiInventory\?\.subscribe\?\.\(repaintFromSharedStock\)/.test(dashboard));
ok('dashboard applies caisse overrides to user-created items', /applyItemOverlay\(stUserItems\)/.test(dashboard));
ok('dashboard and caisse converge on the same tenant-local stock key', /stShowReal\(\).*KiwiCloudDoc.*slugFor\(vid\)/s.test(dashboard));
ok('dashboard adopts its former operator-scoped stock key', /stockOverlay:scoped:/.test(dashboard));
ok('dashboard repaints immediately after adopting legacy stock', /if \(carried \|\| migratedLocal\)[\s\S]*stEnsureOverlay\(\)[\s\S]*render\(\)/.test(dashboard));
ok('opening stock refreshes catalog and ledger together', /Promise\.all\(\[Promise\.resolve\(catalog\), Promise\.resolve\(ledger\)\]\)/.test(R('assets/caisse-stock-sync.js')));
ok('new pairing rebinds from the event target pairing actually uses', (documentListeners['kiwi-paired'] || []).length === 1);

if (fails.length) {
  console.error(`\n${fails.length} caisse stock sync failure(s):`);
  fails.forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log(`✓ caisse stock sync: ${pass} controls`);
