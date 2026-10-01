#!/usr/bin/env node
/* Ticket #0142 · a till relays ITS store's order queue, never another's.
 *
 * Found 2026-09-30: Pasta Corner's takeaway order #129 sat on Amira Café's
 * counter, with "Encaisser" and "Annuler". Both pollers on the till
 * (assets/kitchen-relay.js, assets/orderpro-inbox.js) asked the server for the
 * merchant in `kiwiLiveMerchant`, a browser-wide key that the operator console
 * ("Ouvrir dashboard") and the dashboard rewrite for the store they show. The
 * server allows an operator any store, so the Amira tab received Pasta
 * Corner's queue. The till's identity is its pairing (kiwiPairedVenue).
 *
 * Replayed with the real modules in a vm and a recording fetch.
 *   node tools/order-queue-tenant-test.mjs
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
const pair = (slug) => {
  store.kiwiPaired = '1';
  store.kiwiPairedVenue = JSON.stringify({ merchant: slug, name: slug });
  store.kiwiLiveMerchant = slug;
};

// A forgiving DOM: the inbox paints a chip and a panel, none of which matter here.
const el = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'style' || k === 'dataset' || k === 'classList') ? new Proxy({}, { get: () => () => {} })
    : (k === 'children' || k === 'childNodes') ? [] : (k === Symbol.toPrimitive ? () => '' : el()),
  set: () => true, apply: () => el(),
});
const document = {
  readyState: 'complete', head: { appendChild() {} }, body: { appendChild() {} },
  documentElement: { lang: 'fr' },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => el(), addEventListener() {}, dispatchEvent() {},
};

const asked = [];
const queues = {
  'amira-cafe': [{ id: 'ord-amira-2', number: 2, mode: 'takeout', status: 'accepted', lines: [], total: 32, updated_ts: 1 }],
  'pasta-corner': [{ id: 'ord-pasta-129', number: 129, mode: 'takeout', status: 'accepted', lines: [{ name: 'Lasagna', qty: 1 }], total: 240, updated_ts: 1 }],
};
function fetch(url) {
  const u = new URL(String(url), 'https://kiwi.test');
  if (u.pathname === '/api/order/queue') {
    const m = u.searchParams.get('merchant');
    asked.push(m);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, now: 2, orders: queues[m] || [], sessions: [], closedSessions: [], expired: [] }) });
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
}

const ingested = [];
const listeners = {};
const window = {
  document, localStorage, fetch, navigator: { onLine: true },
  addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
  KiwiConfig: { features: { orderpro: true } },
  KiwiCaissePairing: { isPaired: () => store.kiwiPaired === '1' },
  KiwiCaisseKitchen: { ingest(delta, all) { ingested.push(all.map((o) => o.id)); } },
};
window.window = window;
// The page's globals ARE window's properties, as in a browser (bare KiwiCaissePairing…).
Object.assign(window, { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Promise, JSON, Date,
  Math, URL, URLSearchParams, AbortController, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } });
const ctx = vm.createContext(window);
for (const f of ['assets/kitchen-relay.js', 'assets/orderpro-inbox.js']) {
  vm.runInContext(read(f), ctx, { filename: f });
}
const relay = window.KiwiKitchenRelay, inbox = window.KiwiOrderInbox;
const flush = () => new Promise((r) => setTimeout(r, 0));
const lastAll = () => ingested.at(-1) || [];

/* 1. The till is paired to Amira Café and relays its own queue. */
pair('amira-cafe');
asked.length = 0;
await inbox.refresh(); await flush();
ok('a till paired to amira-cafe polls amira-cafe', () => assert.deepEqual([...new Set(asked)], ['amira-cafe']));

/* 2. The operator opens Pasta Corner's dashboard in the same browser. Only the
 *    browser-wide key moves; the till's pairing does not. */
store.kiwiLiveMerchant = 'pasta-corner';
asked.length = 0;
(listeners.storage || []).forEach((fn) => fn({ key: 'kiwiLiveMerchant' }));
await inbox.refresh(); await flush();
ok('the kitchen relay still names the paired store', () => assert.equal(relay.merchant(), 'amira-cafe'));
ok('the inbox still names the paired store', () => assert.equal(inbox.merchant(), 'amira-cafe'));
ok('no poll asks for pasta-corner', () => assert.ok(!asked.includes('pasta-corner'), JSON.stringify(asked)));
ok('the counter never receives a Pasta Corner order', () => assert.ok(!ingested.some((ids) => ids.includes('ord-pasta-129'))));
ok('the counter still has its own order', () => assert.ok(lastAll().includes('ord-amira-2')));

/* 3. A real re-pairing (code redeemed, here in another tab) does move the
 *    till, and nothing of the previous store is handed over with it. */
pair('pasta-corner');
asked.length = 0;
(listeners.storage || []).forEach((fn) => fn({ key: 'kiwiLiveMerchant' }));
await inbox.refresh(); await flush();
ok('after a re-pairing the till polls its new store', () => assert.deepEqual([...new Set(asked)], ['pasta-corner']));
ok('the previous store\'s orders are dropped on a re-pairing', () => assert.deepEqual([...lastAll()], ['ord-pasta-129']));

/* 4. The kitchen screen loads its stations for the paired store too. */
const cuisine = read('kiwi-cuisine.html');
ok('the kitchen screen reads its stations for the paired store', () => {
  assert.match(cuisine, /function loadStations\(\) \{[\s\S]{0,200}KiwiKitchenRelay\.merchant\(\)/);
  assert.doesNotMatch(cuisine, /function loadStations\(\) \{\s*var m = ls\('kiwiLiveMerchant'\)/);
});

console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}order-queue-tenant: ${passed} passed, ${failed} failed\x1b[0m`);
process.exit(failed ? 1 : 0);
