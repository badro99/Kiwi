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

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ pairing resolver (${pass} controls: pairing agreement, storage fallback, purge immediacy, fail-soft JSON, isPaired invariant, direct module tests with/without platform)`);
