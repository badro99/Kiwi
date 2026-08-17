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

// Case F: Invariant — isPaired() === true strictly implies pairedMerchant() !== ''
ls.setItem('kiwiPairedVenue', JSON.stringify({ name: 'Orphan Store Name', type: 'restaurant' }));
ok(K2.isPaired() === false, 'name-only payload without merchant/slug/venueId is not paired');
ok(K2.pairedMerchant() === '', 'name-only payload yields empty merchant string');
ok(K2.isPaired() === (K2.pairedMerchant() !== ''), 'isPaired() strictly implies pairedMerchant() is non-empty');

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ pairing resolver (${pass} controls: pairing agreement, storage fallback, purge immediacy, fail-soft JSON, isPaired invariant)`);
