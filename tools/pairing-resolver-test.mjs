#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'assets/platform-kernel.js'), 'utf8');

let pass = 0;
function ok(v, msg) {
  if (!v) { console.error('  ✗ ' + msg); process.exitCode = 1; return; }
  pass++;
}

// 1. Static assertions on platform-kernel.js
ok(/isPaired:\s*isPaired/.test(src) && /pairedMerchant:\s*pairedMerchant/.test(src) && /pairedVenue:\s*pairedVenue/.test(src),
  'platform-kernel exposes isPaired, pairedMerchant, pairedVenue');

// 2. Runtime environment setup
const memory = new Map();
const ls = {
  getItem: (k) => memory.has(k) ? memory.get(k) : null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

function createContext(windowExtras = {}) {
  const window = {
    localStorage: ls,
    addEventListener: () => {},
    dispatchEvent: () => {},
    ...windowExtras,
  };
  window.window = window;
  const ctx = vm.createContext({
    window,
    localStorage: ls,
    sessionStorage: { getItem: () => null },
    navigator: {},
    performance: { now: () => Date.now() },
    crypto: { randomUUID: () => `id-${Math.random()}` },
    BroadcastChannel: class { postMessage() {} },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
    Set, Map, Promise, Date, Math, JSON, String, Object, Array, Number, Boolean, console,
  });
  vm.runInContext(src, ctx);
  return ctx.window.KiwiPlatform;
}

// Case A: KiwiCaissePairing is PRESENT (e.g. on kiwi-caisse.html)
const sampleVenue = {
  merchant: 'atlas-marrakech',
  venueId: 'v-999',
  name: 'Café Atlas Guéliz',
  type: 'restaurant',
  subtype: 'cafe',
  location: 'Marrakech',
};

memory.set('kiwiPairedVenue', JSON.stringify(sampleVenue));

const K1 = createContext({
  KiwiCaissePairing: {
    pairedVenue: () => sampleVenue,
    isPaired: () => true,
  },
});

ok(K1.isPaired() === true, 'isPaired() is true when KiwiCaissePairing is present and paired');
ok(K1.pairedMerchant() === 'atlas-marrakech', 'pairedMerchant() matches KiwiCaissePairing.pairedVenue()');
ok(K1.pairedVenue() && K1.pairedVenue().venueId === 'v-999', 'pairedVenue() matches KiwiCaissePairing.pairedVenue()');

// Case B: KiwiCaissePairing is ABSENT (e.g. on dashboard.html or kiwi-serveur.html)
const K2 = createContext(); // no KiwiCaissePairing

ok(K2.isPaired() === true, 'isPaired() is true via raw storage fallback when KiwiCaissePairing is absent');
ok(K2.pairedMerchant() === 'atlas-marrakech', 'pairedMerchant() resolves identical merchant via raw storage fallback');
ok(K2.pairedVenue() && K2.pairedVenue().name === 'Café Atlas Guéliz', 'pairedVenue() resolves venue metadata via fallback');

// Case C: Immediate unpair / tenant-purge (no memoization lag)
ls.removeItem('kiwiPairedVenue');

ok(K2.isPaired() === false, 'isPaired() returns false immediately after key removal');
ok(K2.pairedMerchant() === '', 'pairedMerchant() returns empty string immediately after key removal');
ok(K2.pairedVenue() === null, 'pairedVenue() returns null immediately after key removal');

// Case D: Malformed / corrupted JSON
ls.setItem('kiwiPairedVenue', '{invalid json');

ok(K2.isPaired() === false, 'isPaired() returns false without throwing on corrupted storage');
ok(K2.pairedMerchant() === '', 'pairedMerchant() returns empty string without throwing on corrupted storage');
ok(K2.pairedVenue() === null, 'pairedVenue() returns null without throwing on corrupted storage');

// Case E: Null/empty storage
ls.setItem('kiwiPairedVenue', 'null');

ok(K2.isPaired() === false, 'isPaired() returns false on null string');
ok(K2.pairedMerchant() === '', 'pairedMerchant() returns empty on null string');
ok(K2.pairedVenue() === null, 'pairedVenue() returns null on null string');

// Case F: Invariant & Deliberate Behaviour Change:
// Unlike the legacy raw `!!JSON.parse(...)` check (which returned true for any
// object, including `{}` or `{ name: 'foo' }`), `isPaired()` strictly requires
// genuine tenant identity (`merchant`, `slug`, or `venueId`). An empty object or
// a name-only object cannot scope ledger data, inventory, or transactions, so it
// must deliberately evaluate to `isPaired() === false`.
ls.setItem('kiwiPairedVenue', JSON.stringify({}));
ok(K2.isPaired() === false, 'empty object {} deliberately yields isPaired() === false');
ok(K2.pairedMerchant() === '', 'empty object {} yields empty pairedMerchant()');

ls.setItem('kiwiPairedVenue', JSON.stringify({ name: 'Maison Test', location: 'Tanger' }));
ok(K2.isPaired() === false, 'name-only payload without merchant/slug/venueId is not paired');
ok(K2.pairedMerchant() === '', 'name-only payload yields empty merchant string');
ok(K2.isPaired() === (K2.pairedMerchant() !== ''), 'isPaired() strictly implies pairedMerchant() is non-empty');

// Case G: Slice Width Convention (64 characters)
// The whole Kiwi codebase convention (pos-sale, caisse-stock-sync, inventory-ledger,
// cloud-doc, KiwiLive) slices merchant strings to 64 chars. pairedMerchant must
// strictly adhere to 64 chars so namespaced storage keys match across modules.
const longMerchant = 'a'.repeat(70);
ls.setItem('kiwiPairedVenue', JSON.stringify({ merchant: longMerchant }));
ok(K2.pairedMerchant().length === 64, 'pairedMerchant truncates >64 char merchant to exactly 64');
ok(K2.pairedMerchant() === 'a'.repeat(64), 'pairedMerchant content matches first 64 characters');

// Case H: Live Pairing Fixture Invariant on Helper
// Verify that KiwiPlatform helpers resolve the expected values for a live-shaped pairing object.
const santosFixture = { merchant: 'santos-store', venueId: '', type: 'boutique', name: 'Santos Store' };
ls.setItem('kiwiPairedVenue', JSON.stringify(santosFixture));
ok(K2.pairedMerchant() === 'santos-store', 'helper pairedMerchant resolves santos-store');
ok(K2.pairedVenue() && K2.pairedVenue().name === 'Santos Store', 'helper pairedVenue().name resolves Santos Store');
ok(K2.isPaired() === true, 'helper isPaired() is true for live Santos Store fixture');

// Case I: Direct Module Execution on Actual Files (Both With and Without KiwiPlatform)
// Rather than testing only the helper, load each actual migrated money/transaction module
// in a sandboxed VM and verify it resolves the correct merchant under both runtime states.
const readAsset = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// 1. assets/inventory-ledger.js (window.KiwiInventory.merchant())
function testInventoryLedger(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {}, KiwiEnv: { isReal: () => true } };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/inventory-ledger.js'), ctx);
  return win.KiwiInventory ? win.KiwiInventory.merchant() : null;
}
ok(testInventoryLedger(true) === 'santos-store', 'inventory-ledger.js resolves santos-store with KiwiPlatform present');
ok(testInventoryLedger(false) === 'santos-store', 'inventory-ledger.js resolves santos-store via fallback without KiwiPlatform');

// 2. assets/caisse-stock-sync.js (window.KiwiCaisseStock.slug())
function testCaisseStockSync(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const doc = { addEventListener: () => {} };
  const win = { localStorage: storage, document: doc, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({ window: win, document: doc, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/caisse-stock-sync.js'), ctx);
  return win.KiwiCaisseStock ? win.KiwiCaisseStock.slug() : null;
}
ok(testCaisseStockSync(true) === 'santos-store', 'caisse-stock-sync.js resolves santos-store with KiwiPlatform present');
ok(testCaisseStockSync(false) === 'santos-store', 'caisse-stock-sync.js resolves santos-store via fallback without KiwiPlatform');

// 3. assets/pos-sale.js (KiwiPosSale.record & today)
function testPosSale(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {}, KiwiEnv: { isReal: () => true } };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp, isNaN,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/pos-sale.js'), ctx);
  if (!win.KiwiPosSale) return null;
  const rec = win.KiwiPosSale.record('boutique', { ref: 'T-100', total: 50, lines: [{ name: 'Test', qty: 1, total: 50 }] });
  const rows = win.KiwiPosSale.today('boutique');
  return { isReal: win.KiwiPosSale.isReal(), merchant: (rec && rec.m) || (rows[0] && rows[0].m) };
}
const psWith = testPosSale(true);
const psWithout = testPosSale(false);
ok(psWith && psWith.isReal === true && psWith.merchant === 'santos-store', 'pos-sale.js scopes sale to santos-store with KiwiPlatform present');
ok(psWithout && psWithout.isReal === true && psWithout.merchant === 'santos-store', 'pos-sale.js scopes sale to santos-store via fallback without KiwiPlatform');

// 4. assets/receipt.js (KiwiReceipt.venueKey() & business())
function testReceipt(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const doc = {
    addEventListener: () => {},
    createElement: () => ({ appendChild: () => {}, setAttribute: () => {} }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
  };
  const win = { localStorage: storage, document: doc, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    Intl, setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/receipt.js'), ctx);
  if (!win.KiwiReceipt) return null;
  return {
    venueKey: win.KiwiReceipt.venueKey(),
    businessName: win.KiwiReceipt.business() && win.KiwiReceipt.business().name,
  };
}
const rcWith = testReceipt(true);
const rcWithout = testReceipt(false);
ok(rcWith && rcWith.venueKey === 'santos-store' && rcWith.businessName === 'Santos Store', 'receipt.js resolves venueKey and business name with KiwiPlatform present');
ok(rcWithout && rcWithout.venueKey === 'santos-store' && rcWithout.businessName === 'Santos Store', 'receipt.js resolves venueKey and business name via fallback without KiwiPlatform');

// 5. assets/pos-reprint.js (fetch query parameter)
function testPosReprint(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let fetchedUrl = '';
  const makeEl = () => ({
    appendChild: () => {},
    setAttribute: () => {},
    classList: { contains: () => false, add: () => {}, remove: () => {} },
    addEventListener: () => {},
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
  });
  const doc = {
    addEventListener: () => {},
    createElement: makeEl,
    getElementById: () => null,
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
  };
  const win = {
    localStorage: storage,
    document: doc,
    addEventListener: () => {},
    fetch: (url) => { fetchedUrl = url; return Promise.resolve({ ok: true, json: () => Promise.resolve({ sales: [] }) }); },
    KiwiEnv: { isReal: () => true },
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp, encodeURIComponent,
    fetch: win.fetch, setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/pos-reprint.js'), ctx);
  win.KiwiPosReprint.open('boutique');
  return fetchedUrl;
}
const rpWith = testPosReprint(true);
const rpWithout = testPosReprint(false);
const getMerchantParam = (u) => new URL(u, 'http://localhost').searchParams.get('merchant');
ok(getMerchantParam(rpWith) === 'santos-store', 'pos-reprint.js queries /api/feed for santos-store with KiwiPlatform present');
ok(getMerchantParam(rpWithout) === 'santos-store', 'pos-reprint.js queries /api/feed for santos-store via fallback without KiwiPlatform');

// 6. assets/cloud-doc.js (KiwiCloudDoc.isReal())
function testCloudDoc(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/cloud-doc.js'), ctx);
  return win.KiwiCloudDoc ? win.KiwiCloudDoc.isReal('v-1') : null;
}
ok(testCloudDoc(true) === true, 'cloud-doc.js isReal is true with KiwiPlatform present');
ok(testCloudDoc(false) === true, 'cloud-doc.js isReal is true via fallback without KiwiPlatform');

// 7. assets/hotel.js (isCustomHotel())
function testHotel(withPlatform) {
  const hotelFixture = { merchant: 'hotel-atlas', type: 'hotel', name: 'Atlas Hotel' };
  const mem = new Map([
    ['kiwiPairedVenue', JSON.stringify(hotelFixture)],
    ['kiwiPaired', '1'],
  ]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const hotelSrc = readAsset('assets/hotel.js');
  const match = hotelSrc.match(/const isCustomHotel = \(\) => \{([\s\S]*?)\n  \};/);
  if (!match) return null;
  const fn = new Function('window', 'localStorage', match[1]);
  return fn(win, storage);
}
ok(testHotel(true) === true, 'hotel.js isCustomHotel is true with KiwiPlatform present');
ok(testHotel(false) === true, 'hotel.js isCustomHotel is true via fallback without KiwiPlatform');

// 8. assets/hours.js (KiwiHours venueKey resolution)
function testHours(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let queriedKey = null;
  const win = {
    localStorage: storage,
    addEventListener: () => {},
    KiwiStore: {
      define: (name) => ({
        get: (k) => { queriedKey = k; return null; },
        set: (v, k) => { queriedKey = k; },
      }),
      subscribe: () => {},
    },
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/hours.js'), ctx);
  win.KiwiHours.get();
  return queriedKey;
}
ok(testHours(true) === 'santos-store', 'hours.js queries store with santos-store with KiwiPlatform present');
ok(testHours(false) === 'santos-store', 'hours.js queries store with santos-store via fallback without KiwiPlatform');

// 9. assets/live-link.js (KiwiLive.merchant())
function testLiveLink(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const doc = { addEventListener: () => {}, readyState: 'complete' };
  const win = {
    localStorage: storage, document: doc, addEventListener: () => {}, KiwiEnv: { isReal: () => true },
    location: { hostname: 'localhost', search: '' },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    fetch: win.fetch, location: win.location, encodeURIComponent, URLSearchParams: globalThis.URLSearchParams,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/live-link.js'), ctx);
  return win.KiwiLive ? win.KiwiLive.merchant() : null;
}
ok(testLiveLink(true) === 'santos-store', 'live-link.js resolves santos-store with KiwiPlatform present');
ok(testLiveLink(false) === 'santos-store', 'live-link.js resolves santos-store via fallback without KiwiPlatform');

// 10. assets/retail-scan.js (KiwiRetailScan storageKey resolution)
function testRetailScan(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let queriedKey = null;
  const originalGetItem = storage.getItem;
  storage.getItem = (k) => {
    if (k && k.startsWith('kiwi:retailScan:v1:')) queriedKey = k;
    return originalGetItem(k);
  };
  const makeEl = () => ({
    isConnected: true,
    appendChild: () => {},
    setAttribute: () => {},
    classList: { contains: () => false, add: () => {}, remove: () => {} },
    addEventListener: () => {},
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    textContent: '',
    hidden: false,
  });
  const doc = {
    addEventListener: () => {},
    createElement: makeEl,
    getElementById: () => null,
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    body: { appendChild: () => {} },
  };
  const win = { localStorage: storage, document: doc, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/retail-scan.js'), ctx);
  const root = { isConnected: true, appendChild: () => {}, querySelector: () => makeEl(), querySelectorAll: () => [] };
  win.KiwiRetailScan.mount(root, 'boutique');
  return queriedKey;
}
ok(testRetailScan(true) === 'kiwi:retailScan:v1:santos-store', 'retail-scan.js mounts on santos-store key with KiwiPlatform present');
ok(testRetailScan(false) === 'kiwi:retailScan:v1:santos-store', 'retail-scan.js mounts on santos-store key via fallback without KiwiPlatform');

// 11. assets/pressing-caisse.js (pvReal and pvName resolution)
function testPressingCaisse(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const pSrc = readAsset('assets/pressing-caisse.js');
  const match = pSrc.match(/function pvPaired\(\)[\s\S]*?function pvReal\(\)[\s\S]*?function pvName\(demo\) \{([\s\S]*?)\}/);
  if (!match) return null;
  const snippet = match[0] + '; return { real: pvReal(), name: pvName("demo") };';
  const fn = new Function('window', 'localStorage', snippet);
  return fn(win, storage);
}
const pcWith = testPressingCaisse(true);
const pcWithout = testPressingCaisse(false);
ok(pcWith && pcWith.real === true && pcWith.name === 'Santos Store', 'pressing-caisse.js pvReal and pvName resolve with KiwiPlatform present');
ok(pcWithout && pcWithout.real === true && pcWithout.name === 'Santos Store', 'pressing-caisse.js pvReal and pvName resolve via fallback without KiwiPlatform');

// 12. assets/pressing-catalog.js (KiwiPressingCatalog.read() scoped storage)
function testPressingCatalog(withPlatform) {
  const mem = new Map([
    ['kiwiPairedVenue', JSON.stringify(santosFixture)],
    ['kiwi:pressing-catalog:v1:santos-store', JSON.stringify({ items: [{ id: 'chemise', label: 'Chemise Santos Custom', updatedAt: 1000 }] })],
  ]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/pressing-catalog.js'), ctx);
  const data = win.KiwiPressingCatalog ? win.KiwiPressingCatalog.read() : null;
  const item = data && data.items && data.items.find((x) => x.id === 'chemise');
  return item && item.label;
}
ok(testPressingCatalog(true) === 'Chemise Santos Custom', 'pressing-catalog.js reads scoped santos-store data with KiwiPlatform present');
ok(testPressingCatalog(false) === 'Chemise Santos Custom', 'pressing-catalog.js reads scoped santos-store data via fallback without KiwiPlatform');

// 13. assets/pressing-ops.js (KiwiPressingOps.scope())
function testPressingOps(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/pressing-ops.js'), ctx);
  return win.KiwiPressingOps ? win.KiwiPressingOps.scope() : null;
}
ok(testPressingOps(true) === 'santos-store', 'pressing-ops.js resolves scope santos-store with KiwiPlatform present');
ok(testPressingOps(false) === 'santos-store', 'pressing-ops.js resolves scope santos-store via fallback without KiwiPlatform');

// 14. assets/day-report.js (KiwiDayReport storeSlug, isReal, and canonical slug preservation)
function testDayReport(withPlatform, fixture) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(fixture !== undefined ? fixture : santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {}, dispatchEvent: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/day-report.js'), ctx);
  return {
    slug: win.KiwiDayReport ? win.KiwiDayReport.storeSlug() : null,
    real: win.KiwiDayReport ? win.KiwiDayReport.isReal() : null,
  };
}
const drWith = testDayReport(true);
const drWithout = testDayReport(false);
ok(drWith.slug === 'santos-store' && drWith.real === true, 'day-report.js resolves santos-store and real with KiwiPlatform present');
ok(drWithout.slug === 'santos-store' && drWithout.real === true, 'day-report.js resolves santos-store and real via fallback without KiwiPlatform');

// Canonical slug preservation: fixture with name and slug (no merchant) MUST return slug, never name-derived slug
const drCanonWith = testDayReport(true, { name: 'Santos Super Boutique', slug: 'santos-canonical' });
const drCanonWithout = testDayReport(false, { name: 'Santos Super Boutique', slug: 'santos-canonical' });
ok(drCanonWith.slug === 'santos-canonical', 'day-report.js preserves canonical slug over name with KiwiPlatform present');
ok(drCanonWithout.slug === 'santos-canonical', 'day-report.js preserves canonical slug over name via fallback without KiwiPlatform');

// 15. assets/sold-insights.js (slug() resolution)
function testSoldInsights(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const sSrc = readAsset('assets/sold-insights.js');
  const match = sSrc.match(/function slug\(\) \{([\s\S]*?)\n  \}/);
  if (!match) return null;
  const fn = new Function('window', 'localStorage', 'KiwiLive', match[0] + '; return slug();');
  return fn(win, storage, win.KiwiLive);
}
ok(testSoldInsights(true) === 'santos-store', 'sold-insights.js resolves santos-store with KiwiPlatform present');
ok(testSoldInsights(false) === 'santos-store', 'sold-insights.js resolves santos-store via fallback without KiwiPlatform');

// 16. assets/vertical-state.js (KiwiVerticalState.isReal and venueKey)
function testVerticalState(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = {
    localStorage: storage, addEventListener: () => {},
    KiwiStore: { define: () => ({}) },
  };
  win.window = win;
  const doc = { addEventListener: () => {} };
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const vSrc = readAsset('assets/vertical-state.js');
  vm.runInContext(vSrc, ctx);
  const match = vSrc.match(/function venueKey\(value\) \{([\s\S]*?)\n  \}/);
  let vKey = null;
  if (match) {
    const fn = new Function('window', 'localStorage', 'pairedVenue', match[0] + '; return venueKey();');
    const pVenueMatch = vSrc.match(/function pairedVenue\(value\) \{([\s\S]*?)\n  \}/);
    const pVenueFn = new Function('window', 'localStorage', pVenueMatch[0] + '; return pairedVenue;');
    vKey = fn(win, storage, pVenueFn(win, storage));
  }
  return {
    real: win.KiwiVerticalState ? win.KiwiVerticalState.isReal() : null,
    venueKey: vKey,
  };
}
const vsWith = testVerticalState(true);
const vsWithout = testVerticalState(false);
ok(vsWith.real === true && vsWith.venueKey === 'santos-store', 'vertical-state.js resolves real and santos-store venueKey with KiwiPlatform present');
ok(vsWithout.real === true && vsWithout.venueKey === 'santos-store', 'vertical-state.js resolves real and santos-store venueKey via fallback without KiwiPlatform');

// 17. assets/simple.js (pairedVenue and isReal)
function testSimple(withPlatform) {
  const mem = new Map([
    ['kiwiPaired', '1'],
    ['kiwiPairedVenue', JSON.stringify(santosFixture)],
  ]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const sSrc = readAsset('assets/simple.js');
  const match = sSrc.match(/const pairedVenue = \(\) => \{[\s\S]*?const isReal = \(\) => !!\([\s\S]*?\);/);
  if (!match) return null;
  const fn = new Function('window', 'localStorage', match[0] + '; return { paired: pairedVenue(), real: isReal() };');
  return fn(win, storage);
}
const smpWith = testSimple(true);
const smpWithout = testSimple(false);
ok(smpWith && smpWith.real === true && smpWith.paired && smpWith.paired.merchant === 'santos-store', 'simple.js resolves pairedVenue and isReal with KiwiPlatform present');
ok(smpWithout && smpWithout.real === true && smpWithout.paired && smpWithout.paired.merchant === 'santos-store', 'simple.js resolves pairedVenue and isReal via fallback without KiwiPlatform');

// 18. assets/account.js (pairedVenue and isReal)
function testAccount(withPlatform) {
  const mem = new Map([
    ['kiwiPaired', '1'],
    ['kiwiPairedVenue', JSON.stringify(santosFixture)],
  ]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const aSrc = readAsset('assets/account.js');
  const match = aSrc.match(/const pairedVenue = \(\) => \{[\s\S]*?const isReal = \(\) => !!\([\s\S]*?\);/);
  if (!match) return null;
  const fn = new Function('window', 'localStorage', match[0] + '; return { paired: pairedVenue(), real: isReal() };');
  return fn(win, storage);
}
const accWith = testAccount(true);
const accWithout = testAccount(false);
ok(accWith && accWith.real === true && accWith.paired && accWith.paired.merchant === 'santos-store', 'account.js resolves pairedVenue and isReal with KiwiPlatform present');
ok(accWithout && accWithout.real === true && accWithout.paired && accWithout.paired.merchant === 'santos-store', 'account.js resolves pairedVenue and isReal via fallback without KiwiPlatform');

// 19. assets/venue-store.js (KiwiStore.currentVenue() paired resolution)
function testVenueStore(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/venue-store.js'), ctx);
  return win.KiwiStore ? win.KiwiStore.currentVenue() : null;
}
ok(testVenueStore(true) === 'santos-store', 'venue-store.js resolves currentVenue santos-store with KiwiPlatform present');
ok(testVenueStore(false) === 'santos-store', 'venue-store.js resolves currentVenue santos-store via fallback without KiwiPlatform');

// 20. assets/venues.js (isRealMerchant, ensureOwnEmptyVenue, and cycle prevention with platform-kernel)
function testVenues(withPlatform) {
  const mem = new Map([
    ['kiwiPaired', '1'],
    ['kiwiPairedVenue', JSON.stringify(santosFixture)],
  ]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const doc = {
    addEventListener: () => {},
    documentElement: { setAttribute: () => {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const win = {
    localStorage: storage,
    document: doc,
    location: { pathname: '/dashboard.html', search: '', hostname: 'localhost' },
    addEventListener: () => {},
    dispatchEvent: () => {},
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, location: win.location, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const vSrc = readAsset('assets/venues.js');
  const match = vSrc.match(/function isRealMerchant\(\) \{[\s\S]*?\n  \}/);
  const ownMatch = vSrc.match(/function ensureOwnEmptyVenue\(\) \{[\s\S]*?\n  \}/);
  if (!match || !ownMatch) return null;
  const fnReal = new Function('window', 'localStorage', match[0] + '; return isRealMerchant();');
  const VENUES = {};
  const customIds = new Set();
  const fnOwn = new Function('window', 'localStorage', 'SUBTYPE_BASE', 'TYPE_BASES', 'VENUES', 'customIds', ownMatch[0] + '; return ensureOwnEmptyVenue();');
  const real = fnReal(win, storage);
  fnOwn(win, storage, { boutique: 'boutique' }, ['restaurant', 'boutique', 'spa'], VENUES, customIds);
  return { real: real, ownName: VENUES.own && VENUES.own.name };
}
const vWith = testVenues(true);
const vWithout = testVenues(false);
ok(vWith && vWith.real === true && vWith.ownName === 'Santos Store', 'venues.js resolves isRealMerchant and ensureOwnEmptyVenue with KiwiPlatform present');
ok(vWithout && vWithout.real === true && vWithout.ownName === 'Santos Store', 'venues.js resolves isRealMerchant and ensureOwnEmptyVenue via fallback without KiwiPlatform');

// 21. venues.js ↔ platform-kernel.js cycle safety invariant
function testCycleSafety() {
  const mem = new Map(); // Unpaired session: pairedMerchant() is empty, forcing tenant() to evaluate window.KiwiVenue.getCurrentVenueData()
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const makeEl = () => ({
    setAttribute: () => {},
    removeAttribute: () => {},
    getAttribute: () => null,
    classList: { remove: () => {}, add: () => {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    appendChild: () => {},
  });
  const doc = {
    addEventListener: () => {},
    documentElement: makeEl(),
    body: makeEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: makeEl,
  };
  const win = {
    localStorage: storage,
    document: doc,
    location: { pathname: '/dashboard.html', search: '', hostname: 'localhost' },
    addEventListener: () => {},
    dispatchEvent: () => {},
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, location: win.location, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  // Load real platform-kernel first, then real venues.js, in the same window
  vm.runInContext(src, ctx);
  vm.runInContext(readAsset('assets/venues.js'), ctx);

  ok(win.KiwiPlatform && typeof win.KiwiPlatform.tenant === 'function', 'KiwiPlatform.tenant is mounted');
  ok(win.KiwiVenue && typeof win.KiwiVenue.getCurrentVenueData === 'function', 'real KiwiVenue.getCurrentVenueData is mounted');

  const vId = win.KiwiVenue.createVenue('Atlas Spa', 'spa', 'Gauthier');
  win.KiwiVenue.setVenue(vId);

  const t = win.KiwiPlatform.tenant();
  return t;
}
ok(testCycleSafety() === 'mon-activite', 'platform-kernel tenant() calls real venues.js getCurrentVenueData without recursion or stack overflow');

// 22. assets/pages-pro.js (pairedDeviceLines paired venue resolution)
function testPagesPro(withPlatform) {
  const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
  const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = { localStorage: storage, addEventListener: () => {} };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  if (withPlatform) vm.runInContext(src, ctx);
  const pSrc = readAsset('assets/pages-pro.js');
  const match = pSrc.match(/function pairedDeviceLines\(nav\) \{([\s\S]*?)\n  \}/);
  if (!match) return null;
  const fn = new Function('window', 'localStorage', match[0] + '; return pairedDeviceLines("terminaux");');
  return fn(win, storage);
}
const ppWith = testPagesPro(true);
const ppWithout = testPagesPro(false);
ok(Array.isArray(ppWith) && ppWith[0] === 'Caisse Kiwi · Santos Store · connectée', 'pages-pro.js resolves pairedDeviceLines with KiwiPlatform present');
ok(Array.isArray(ppWithout) && ppWithout[0] === 'Caisse Kiwi · Santos Store · connectée', 'pages-pro.js resolves pairedDeviceLines via fallback without KiwiPlatform');

/* 23-24. Les deux coquilles HTML. Un fichier HTML ne se charge pas dans une
   sandbox VM : on extrait le résolveur en ligne et on l'exécute pour de vrai,
   comme aux contrôles 20 et 22. Ce n'est pas un chargement de module — mais le
   code exécuté est bien celui du shell, et l'extraction échoue en rouge si la
   fonction est renommée ou reformatée. */
function testShellResolver(shell, fnName) {
  const html = readAsset(shell);
  const match = html.match(new RegExp('function ' + fnName + '\\(\\) \\{[\\s\\S]*?\\n    \\}'));
  if (!match) return { found: false };
  const run = (withPlatform) => {
    const mem = new Map([['kiwiPairedVenue', JSON.stringify(santosFixture)]]);
    const storage = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    const win = { localStorage: storage, addEventListener: () => {} };
    win.window = win;
    const ctx = vm.createContext({
      window: win, localStorage: storage, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
      setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
    });
    if (withPlatform) vm.runInContext(src, ctx);
    const fn = new Function('window', 'localStorage', match[0] + '; return ' + fnName + '();');
    return fn(win, storage);
  };
  return { found: true, withPlatform: run(true), fallback: run(false) };
}

for (const [shell, fnName] of [['kiwi-caisse.html', 'storePaired'], ['kiwi-serveur.html', 'svPaired']]) {
  const r = testShellResolver(shell, fnName);
  ok(r.found, `${shell} exposes an extractable ${fnName}() resolver`);
  ok(r.found && r.withPlatform && r.withPlatform.merchant === 'santos-store',
    `${shell} ${fnName}() resolves santos-store with KiwiPlatform present`);
  ok(r.found && r.fallback && r.fallback.merchant === 'santos-store',
    `${shell} ${fnName}() resolves santos-store via fallback without KiwiPlatform`);
}

/* Le shell est prioritaire sur le brut : si le noyau répond, c'est SA valeur
   qui sort. Sans cette assertion, un résolveur qui ignore KiwiPlatform et lit
   toujours localStorage passerait les deux contrôles ci-dessus. */
for (const [shell, fnName] of [['kiwi-caisse.html', 'storePaired'], ['kiwi-serveur.html', 'svPaired']]) {
  const html = readAsset(shell);
  const match = html.match(new RegExp('function ' + fnName + '\\(\\) \\{[\\s\\S]*?\\n    \\}'));
  let out = null;
  if (match) {
    const mem = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'stale-store', name: 'Stale' })]]);
    const storage = { getItem: (k) => mem.get(k) || null, setItem: () => {}, removeItem: () => {} };
    const win = {
      localStorage: storage,
      addEventListener: () => {},
      KiwiPlatform: { pairedVenue: () => ({ merchant: 'fresh-store', name: 'Fresh' }) },
    };
    win.window = win;
    const fn = new Function('window', 'localStorage', match[0] + '; return ' + fnName + '();');
    out = fn(win, storage);
  }
  ok(out && out.merchant === 'fresh-store',
    `${shell} ${fnName}() prefers KiwiPlatform over a stale localStorage copy`);
}

/* 25. Invariant d'écrivain unique pour kiwiPairedVenue.
   Écrire kiwiPairedVenue n'est pas une simple écriture de clé : cela engage la
   détection de changement de commerce (onTenantSwitch), la purge des données de
   l'ancien locataire (ventes, catalogue, shifts) et l'événement 'kiwi-paired'.
   Pour empêcher qu'un écran (cuisine, serveur, caisse) ou un module d'arrière-plan
   ne réintroduise une écriture directe qui contourne la purge, ce contrôle statique
   garantit qu'il n'existe EXACTEMENT QU'UN SEUL écrivain dans toute la base de production :
   assets/pairing-commit.js. */

function findPairingWriterSites() {
  const scanFiles = [];
  function scanDir(dir, relPrefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'tools') continue;
      if (ent.name.includes(' 2.')) continue; // exclude iCloud conflict copies
      const rel = relPrefix ? path.join(relPrefix, ent.name) : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!relPrefix && (ent.name === 'assets' || ent.name === 'functions')) {
          scanDir(full, rel);
        } else if (relPrefix.startsWith('functions')) {
          scanDir(full, rel);
        }
      } else if (ent.isFile()) {
        if (!relPrefix && ((ent.name.startsWith('kiwi-') && ent.name.endsWith('.html')) || ent.name === 'dashboard.html')) {
          scanFiles.push(rel);
        } else if (relPrefix === 'assets' && ent.name.endsWith('.js')) {
          scanFiles.push(rel);
        } else if (relPrefix.startsWith('functions') && ent.name.endsWith('.js')) {
          scanFiles.push(rel);
        }
      }
    }
  }
  scanDir(root);

  const hits = [];
  function isPairingWrite(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return false;
    if (!/['"]kiwiPairedVenue['"]/.test(line)) return false;

    // Mutating actions: setItem, removeItem, bracket assignment, delete, .set(), bare set()
    if (/setItem|removeItem|\[\s*['"]kiwiPairedVenue['"]\s*\]\s*=|\bdelete\s+/.test(line)) return true;
    if (/(?:\.|\b)set\s*\(/.test(line)) return true;

    return false;
  }

  for (const rel of scanFiles) {
    const full = path.join(root, rel);
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (isPairingWrite(lines[i])) {
        hits.push({ file: rel, line: i + 1, snippet: lines[i].trim() });
      }
    }
  }
  return { scanFiles, hits };
}

const pairingScan = findPairingWriterSites();
const nonCanonicalHits = pairingScan.hits.filter(h => h.file !== 'assets/pairing-commit.js');

ok(pairingScan.hits.length === 1,
  `exactly 1 writer of kiwiPairedVenue across production files (found ${pairingScan.hits.length}: ${pairingScan.hits.map(h => `${h.file}:${h.line}`).join(', ') || 'none'})`);
ok(nonCanonicalHits.length === 0,
  `zero rogue writers or removers of kiwiPairedVenue outside assets/pairing-commit.js (offending: ${nonCanonicalHits.map(h => `${h.file}:${h.line} [${h.snippet}]`).join(', ') || 'none'})`);
ok(pairingScan.hits.length > 0 && pairingScan.hits[0].file === 'assets/pairing-commit.js',
  `canonical writer is located in assets/pairing-commit.js (at line ${pairingScan.hits[0]?.line || '?'})`);

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ pairing resolver (${pass} controls: pairing agreement, storage fallback, purge immediacy, fail-soft JSON, isPaired invariant, direct module tests with/without platform across 21 modules + cycle safety + 2 HTML shell resolvers + single writer invariant)`);

