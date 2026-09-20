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
let recoveryCalls = 0;
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
    requests.push({ url, options, body: options && options.body ? JSON.parse(options.body) : null });
    if (url === '/api/pair/recover') {
      recoveryCalls++;
      return recoveryCalls === 1
        ? Response.json({ error: 'forbidden-terminal' }, { status: 403 })
        : Response.json({ ok: true, merchant: venue.merchant });
    }
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
assert.deepEqual(requests.map((request) => request.url),
  ['/api/pair/recover', '/api/pair/create', '/api/pair/redeem', '/api/pair/recover']);
assert.equal(requests[1].body.merchant, venue.merchant, 'owner asks to pair the exact merchant');
assert.equal(requests[2].body.code, '314159', 'fresh one-time code is redeemed immediately');
assert.match(requests[2].body.terminalId, /^term_[A-Za-z0-9_-]{12,80}$/);
assert.ok(requests.every((request) => request.options.credentials === 'same-origin'));
assert.equal(values.get('kiwiSaleQueue'), queue, 'legacy durable receipt queue is preserved byte-for-byte');
assert.equal(values.get('kiwiSales:scoped@pasta-corner'), '[{"id":"sale-1","total":64}]', 'merchant sales stay intact');
assert.equal(JSON.parse(values.get('kiwiPairedVenue')).venueId, venue.venueId, 'display venue metadata survives API redemption');
assert.ok(events.some((event) => event.type === 'kiwi-paired'), 'successful repair wakes the outbox sender');

const beforeTerminalRepair = requests.length;
const recovered = await window.KiwiCaissePairing.repair();
assert.equal(recovered.recovered, true);
assert.deepEqual(requests.slice(beforeTerminalRepair).map((request) => request.url), ['/api/pair/recover'],
  'a known terminal restores its till proof without minting another pairing');

const beforeTypedCode = requests.length;
const typed = await window.KiwiCaissePairing.redeem('314159');
assert.equal(typed.ok, true);
assert.deepEqual(requests.slice(beforeTypedCode).map((request) => request.url),
  ['/api/pair/redeem', '/api/pair/recover'],
  'a manually entered code also confirms the one-cookie till recovery before replay');

/* Ce que cette assertion protège — réparer AVANT de rejouer — est intact. Le
 * second argument est né du terminal qui n'a pas de session tableau de bord :
 * un geste du caissier autorise l'ouverture du pavé à six chiffres, la
 * tentative silencieuse reste silencieuse. Voir caisse-pairing-recovery-test. */
assert.match(pwaSource, /repairPairing\(true, true\)\.then\(function \(result\)[\s\S]{0,500}result && result\.pad[\s\S]{0,500}KiwiLive\.flush\(true\)/,
  'manual auth recovery waits for a real pairing before replaying receipts');
assert.match(pwaSource, /result && result\.waitingForPairCode[\s\S]{0,160}status\(\)[\s\S]{0,80}return/,
  'opening the code pad releases the status spinner without showing another 403');
assert.match(pairingSource, /bootWithPin\(handed\);[\s\S]{0,180}pairFromAccount\(handed\)/,
  'same-device dashboard hand-off also mints the secure till proof');

console.log('Caisse pairing repair: secure create/redeem flow preserves queued sales.');
