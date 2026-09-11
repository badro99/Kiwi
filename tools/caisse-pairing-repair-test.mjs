#!/usr/bin/env node
/* Regression: a locally paired till can renew its secure server proof without
 * deleting or rewriting the durable receipt outbox. This is the production
 * path behind the red "Appairage à vérifier" control. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const pairingSource = fs.readFileSync(new URL('../assets/caisse-pairing.js', import.meta.url), 'utf8');
const commitSource = fs.readFileSync(new URL('../assets/pairing-commit.js', import.meta.url), 'utf8');
const pwaSource = fs.readFileSync(new URL('../assets/caisse-pwa.js', import.meta.url), 'utf8');

const venue = {
  merchant: 'pasta-corner', venueId: 'venue-pasta', type: 'restaurant',
  subtype: 'restaurant', name: 'Pasta Corner', location: 'Tanger',
};
const queue = '[{"id":"sale-1"},{"id":"sale-2"}]';
const values = new Map([
  ['kiwiPaired', '1'],
  ['kiwiLive', '1'],
  ['kiwiLiveMerchant', venue.merchant],
  ['kiwiPairedVenue', JSON.stringify(venue)],
  ['kiwiSaleQueue', queue],
  ['kiwiSales:scoped@pasta-corner', '[{"id":"sale-1","total":64}]'],
]);
const storage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  key: (index) => Array.from(values.keys())[index] ?? null,
  get length() { return values.size; },
};
const events = [];
const requests = [];
const document = {
  readyState: 'loading',
  addEventListener() {},
  dispatchEvent(event) { events.push(event); },
  getElementById() { return null; },
  querySelector() { return null; },
};
const window = {
  localStorage: storage,
  sessionStorage: storage,
  KiwiEnv: { demosAllowed: false },
  KiwiReportError() {},
};
window.window = window;
const context = vm.createContext({
  window, document, localStorage: storage, sessionStorage: storage,
  location: { search: '', pathname: '/kiwi-caisse.html' },
  navigator: { onLine: true },
  crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  fetch: async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    if (url === '/api/pair/create') return Response.json({ ok: true, code: '314159' });
    if (url === '/api/pair/redeem') return Response.json({
      ok: true, merchant: venue.merchant, type: venue.type,
      subtype: venue.subtype, name: venue.name,
    });
    throw new Error('unexpected fetch ' + url);
  },
  Response, Promise, Error, Date, Math, JSON, String, Number, Object, Array,
  setTimeout, clearTimeout, console,
});

vm.runInContext(commitSource, context);
vm.runInContext(pairingSource, context);
assert.equal(typeof window.KiwiCaissePairing?.repair, 'function', 'repair API is exported');

const result = await window.KiwiCaissePairing.repair();
assert.equal(result.ok, true);
assert.deepEqual(requests.map((request) => request.url), ['/api/pair/create', '/api/pair/redeem']);
assert.equal(requests[0].body.merchant, venue.merchant, 'owner asks to pair the exact merchant');
assert.equal(requests[1].body.code, '314159', 'fresh one-time code is redeemed immediately');
assert.match(requests[1].body.terminalId, /^term_[A-Za-z0-9_-]{12,80}$/);
assert.ok(requests.every((request) => request.options.credentials === 'same-origin'));
assert.equal(values.get('kiwiSaleQueue'), queue, 'legacy durable receipt queue is preserved byte-for-byte');
assert.equal(values.get('kiwiSales:scoped@pasta-corner'), '[{"id":"sale-1","total":64}]', 'merchant sales stay intact');
assert.equal(JSON.parse(values.get('kiwiPairedVenue')).venueId, venue.venueId, 'display venue metadata survives API redemption');
assert.ok(events.some((event) => event.type === 'kiwi-paired'), 'successful repair wakes the outbox sender');

assert.match(pwaSource, /lastStatus === 401 \|\| qNow\.lastStatus === 403[\s\S]{0,500}repairPairing\(true\)\.then[\s\S]{0,500}KiwiLive\.flush\(true\)/,
  'manual auth recovery repairs pairing before replaying receipts');
assert.match(pairingSource, /bootWithPin\(handed\);[\s\S]{0,180}pairFromAccount\(handed\)/,
  'same-device dashboard hand-off also mints the secure till proof');

console.log('Caisse pairing repair: secure create/redeem flow preserves queued sales.');
