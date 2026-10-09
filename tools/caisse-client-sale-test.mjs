#!/usr/bin/env node
/* Tickets #0166, #0167, #0168 · the till's customer page and the end of a sale.
 *
 * #0166: a paid boutique sale left the phone ticket sheet open on « The sale is
 *        empty ». The register now announces `vx-ticket-done` and the sheet folds.
 * #0167: on the customer page, the amount field pushed « Confirm » past the
 *        card and the reward button sat half-width under it.
 * #0168: the customer page lives in every till, but only the boutique fed its
 *        purchase history. The restaurant now credits items, ticket and method;
 *        the KiwiPosSale tills can attach a client to the next paid sale.
 *
 *   node tools/caisse-client-sale-test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const pm = read('assets/pos-mobile.js');
const bq = read('assets/pos-boutique.js');
const cb = read('assets/clients-book.js');
const caisse = read('kiwi-caisse.html');
const lang = read('assets/caisse-lang.js');

await ok('#0166 the boutique announces the end of a paid sale', () => {
  assert.match(bq, /freshTicket\(\);[\s\S]{0,260}dispatchEvent\(new CustomEvent\('vx-ticket-done', \{ bubbles: true \}\)\)/);
});
await ok('#0166 the phone ticket sheet folds on vx-ticket-done', () => {
  assert.match(pm, /addEventListener\('vx-ticket-done', function \(\) \{\s*screen\.classList\.remove\('vx-ticket-open'\)/);
});
await ok('#0167 the amount field can shrink, the confirm button cannot', () => {
  assert.match(cb, /\.kcb-recrow input\{flex:1;min-width:0;/);
  assert.match(cb, /\.kcb-big\{flex:none;/);
});
await ok('#0167 the reward button spans the card', () => {
  assert.match(cb, /id="kcb-redeem" style="display:block;width:100%;/);
});
await ok('#0168 the restaurant credits items, ticket and method to the client', () => {
  assert.match(caisse, /recordPurchase\(cid, \{[\s\S]{0,120}method: entry\.method, saleRef: entry\.ref,[\s\S]{0,160}items: \(entry\.lines \|\| \[\]\)/);
});
await ok('#0168 the customer page offers « attach to the sale » on KiwiPosSale tills only', () => {
  assert.match(cb, /POS_ATTACH = \/\(\^\|\\s\)is-pos-\(boulangerie\|foodtruck\|epicerie\|librairie\|coiffure\|gym\|fastfood\|pharmacie\|fleuriste\|spa\|traiteur\|pizzeria\)/);
  assert.doesNotMatch(cb.match(/POS_ATTACH = [^\n]+/)[0], /boutique|maison|hotel/);
  assert.match(cb, /KiwiPosSale\.attachClient\(c\)/);
});
await ok('#0168 new till copy is translated in EN and AR', () => {
  for (const k of ['Attacher à la vente en cours', 'Détacher de la vente', 'Client de la vente', 'Client attaché']) {
    assert.equal(lang.split(`'${k}'`).length - 1, 2, k);
  }
});

/* ── KiwiPosSale: an attached client receives exactly the next paid sale ── */
function loadPosSale(recorded) {
  const rows = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'amira-snack' })], ['kiwi:posDevice', 'A7']]);
  const localStorage = {
    getItem: (k) => rows.has(k) ? rows.get(k) : null, setItem: (k, v) => rows.set(k, String(v)),
    removeItem: (k) => rows.delete(k), key: (i) => [...rows.keys()][i] || null, get length() { return rows.size; },
  };
  const events = [];
  const document = { hidden: false, addEventListener() {}, dispatchEvent() { return true; } };
  const window = {
    localStorage, document,
    KiwiEnv: { isReal: () => true },
    KiwiDayReport: { businessDay: () => '2026-10-08', today: () => '2026-10-08', dayBounds: () => ({ from: 0, to: Date.now() + 1e8 }) },
    KiwiClients: { recordPurchase: (id, opts) => { recorded.push({ id, opts }); return { client: { id }, rewardReady: false }; } },
    addEventListener() {},
    dispatchEvent(e) { events.push(e); return true; },
  };
  window.window = window;
  const context = {
    console, window, document, localStorage, Date, Map, Set, Uint8Array,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    crypto: { getRandomValues(a) { a[0] = 1; a[1] = 2; return a; } },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ sales: [] }) }),
  };
  vm.createContext(context);
  vm.runInContext(read('assets/pos-sale.js'), context, { filename: 'pos-sale.js' });
  return { api: window.KiwiPosSale, events };
}

await ok('#0168 an attached client is credited with amount, items, ticket and method', () => {
  const recorded = [];
  const { api, events } = loadPosSale(recorded);
  api.attachClient({ id: 'c-1', name: 'TEST KIWI' });
  assert.equal(api.attachedClient().id, 'c-1');
  assert.ok(events.some(e => e.type === 'kiwi:pos-sale-client' && e.detail && e.detail.id === 'c-1'), 'the pill hears the attach');
  const entry = api.record('fastfood', { total: 45, method: 'especes', label: 'Comptoir', ref: 'T-1', lines: [{ name: 'Tacos', qty: 1, total: 45 }] });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].id, 'c-1');
  assert.equal(recorded[0].opts.amount, 45);
  assert.equal(recorded[0].opts.saleRef, entry.ref);
  assert.deepEqual(JSON.parse(JSON.stringify(recorded[0].opts.items)), [{ name: 'Tacos', qty: 1, total: 45 }]);
  assert.equal(recorded[0].opts.method, 'especes');
});
await ok('#0168 one sale is one visit: the client lets go after the sale', () => {
  const recorded = [];
  const { api } = loadPosSale(recorded);
  api.attachClient({ id: 'c-1', name: 'TEST KIWI' });
  api.record('fastfood', { total: 45, method: 'carte', label: 'A', ref: 'T-1', lines: [] });
  api.record('fastfood', { total: 30, method: 'carte', label: 'B', ref: 'T-2', lines: [] });
  assert.equal(recorded.length, 1);
  assert.equal(api.attachedClient(), null);
});
await ok('#0168 a sale with no attached client credits nobody', () => {
  const recorded = [];
  const { api } = loadPosSale(recorded);
  api.record('fastfood', { total: 45, method: 'carte', label: 'A', ref: 'T-1', lines: [] });
  assert.equal(recorded.length, 0);
});
await ok('#0168 detaching before the sale credits nobody', () => {
  const recorded = [];
  const { api } = loadPosSale(recorded);
  api.attachClient({ id: 'c-1', name: 'TEST KIWI' });
  api.attachClient(null);
  api.record('fastfood', { total: 45, method: 'carte', label: 'A', ref: 'T-1', lines: [] });
  assert.equal(recorded.length, 0);
});

console.log(`\ncaisse-client-sale: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
