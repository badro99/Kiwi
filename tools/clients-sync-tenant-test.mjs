#!/usr/bin/env node
/* Ticket #0154 · Till and dashboard share ONE client book per venue.
 *
 * Issue found:
 * On Amira's Boutique, the dashboard Clients page showed 3 clients:
 *   - Zakariae 0623455444
 *   - badro 0645647733
 *   - safouane (email only)
 * The till's "Cliente" sheet showed ONLY ONE ("Zakariae 0612343355", a different
 * phone number) and failed to find badro's number.
 *
 * Root cause:
 * `KiwiClients.bookId()` used `kiwiLiveMerchant` (a browser-wide key set by
 * operator views and dashboard venue switches) before checking `kiwiPairedVenue`.
 * When an operator viewed another store (e.g. Amira Café), `kiwiLiveMerchant` was
 * updated to `amira-cafe`. The boutique till then read and wrote to `amira-cafe`'s
 * client book instead of `amira-boutique`'s client book.
 *
 * Fix:
 * On a paired till (or active POS session), the till's pairing identity
 * (`KiwiCaissePairing.pairedVenue()` / `kiwiPairedVenue`) strictly outranks
 * `kiwiLiveMerchant`.
 *
 * Replayed with the real modules in a vm.
 *   node tools/clients-sync-tenant-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const el = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'style' || k === 'dataset' || k === 'classList') ? new Proxy({}, { get: () => () => {} })
    : (k === 'children' || k === 'childNodes') ? [] : (k === Symbol.toPrimitive ? () => '' : el()),
  set: () => true, apply: () => el(),
});
const body = { className: 'is-unlocked is-pos-boutique', appendChild() {} };
const document = {
  readyState: 'complete', head: { appendChild() {} }, body,
  documentElement: { lang: 'fr' },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => el(), addEventListener() {}, dispatchEvent() {},
};

const asked = [];
function fetch(url, opts) {
  const u = new URL(String(url), 'https://kiwi.test');
  asked.push({ pathname: u.pathname, search: u.search, method: (opts && opts.method) || 'GET' });
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, list: [] }),
  });
}

const listeners = {};
const window = {
  document, localStorage, fetch, navigator: { onLine: true },
  addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
  dispatchEvent() {},
  KiwiEnv: { isReal: () => true },
};
window.window = window;
Object.assign(window, {
  console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Promise, JSON, Date,
  Math, URL, URLSearchParams, AbortController,
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }
});

const ctx = vm.createContext(window);
// Load real cloud-doc, venue-store, clients-store
for (const f of ['assets/cloud-doc.js', 'assets/venue-store.js', 'assets/clients-store.js']) {
  vm.runInContext(read(f), ctx, { filename: f });
}

const Clients = window.KiwiClients;
assert.ok(Clients, 'KiwiClients must be defined');

/* 1. Unpaired initial state: reads kiwiLiveMerchant or falls back to demo */
store.kiwiLiveMerchant = 'amira-boutique';
ok('unpaired till uses kiwiLiveMerchant', () => {
  assert.equal(Clients.bookId(), 'amira-boutique');
});

/* 2. Till paired to Amira Boutique. Operator opens Amira Café dashboard. */
store.kiwiPaired = '1';
store.kiwiPairedVenue = JSON.stringify({ merchant: 'amira-boutique', name: "Amira's Boutique", type: 'boutique' });
// Operator views amira-cafe in dashboard tab
store.kiwiLiveMerchant = 'amira-cafe';

ok('paired till prioritizes paired venue over stale kiwiLiveMerchant', () => {
  assert.equal(Clients.bookId(), 'amira-boutique');
});

/* 3. Clients added to paired till are saved under paired venue namespace */
Clients.upsert({ name: 'Zakariae', phone: '0623455444' });
Clients.upsert({ name: 'badro', phone: '0645647733' });
Clients.upsert({ name: 'safouane', email: 'safouane@example.com' });

const boutiqueRaw = store['kiwi:clients:v1:amira-boutique'];
assert.ok(boutiqueRaw, 'clients must be saved under kiwi:clients:v1:amira-boutique');
const boutiqueData = JSON.parse(boutiqueRaw);
ok('clients are saved under the paired boutique book', () => {
  assert.equal(boutiqueData.list.length, 3);
  assert.equal(boutiqueData.list[0].name, 'Zakariae');
  assert.equal(boutiqueData.list[1].name, 'badro');
});

const cafeRaw = store['kiwi:clients:v1:amira-cafe'];
ok('amira-cafe book remains completely isolated', () => {
  assert.ok(!cafeRaw || JSON.parse(cafeRaw).list.length === 0);
});

/* 4. Cross-tab storage sync: pairing moves to pasta-corner */
store.kiwiPairedVenue = JSON.stringify({ merchant: 'pasta-corner', name: 'Pasta Corner', type: 'restaurant' });
body.className = 'is-unlocked is-pos-restaurant';
(listeners.storage || []).forEach((fn) => fn({ key: 'kiwiPairedVenue' }));

ok('after re-pairing, bookId switches to new venue', () => {
  assert.equal(Clients.bookId(), 'pasta-corner');
});

/* 5. Till modals call KiwiClients.pull(callback): the callback must NOT become
 * the merchant key (regression: it fetched /api/clients?merchant=function…). */
store.kiwiPairedVenue = JSON.stringify({ merchant: 'amira-boutique', name: "Amira's Boutique", type: 'boutique' });
store.kiwiLive = '1';
asked.length = 0;
await new Promise((resolve) => Clients.pull((changed) => {
  ok('pull(cb) fetches the till book, not the callback source', () => {
    assert.ok(asked.length > 0, 'expected at least one fetch');
    assert.ok(asked[0].search.includes('merchant=amira-boutique'), `got ${asked[0].pathname}${asked[0].search}`);
    assert.equal(changed, false);
  });
  resolve();
}));

console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}clients-sync-tenant: ${passed} passed, ${failed} failed\x1b[0m`);
process.exit(failed ? 1 : 0);
