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

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ pairing resolver (${pass} controls: pairing agreement, storage fallback, purge immediacy, fail-soft JSON, isPaired invariant, direct module tests with/without platform across 19 modules)`);
