#!/usr/bin/env node
/* The till's offline staff-code verifier (assets/caisse-pairing.js).
 * After the server proves a code, the till keeps PBKDF2-SHA-256 (1M rounds,
 * one 16-byte salt per till) over merchant:code, never the code. Proven here
 * on the real file: v2 rows, no plain hash, a wrong code neither unlocks nor
 * migrates, a v1 SHA-256 row is removed on boot without an unlock, one derivation per unlock however many staff are
 * cached, the online unlock never waits on the derivation, and enumerating a
 * copied cache costs minutes on this machine. Codes are generated, never real. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto, randomInt } from 'node:crypto';

const source = fs.readFileSync(path.join(process.env.KIWI_ROOT || process.cwd(), 'assets/caisse-pairing.js'), 'utf8');
const storage = new Map([
  ['kiwiPaired', '1'],
  ['kiwiPairedVenue', JSON.stringify({ merchant: 'offline-fixture', name: 'Offline Fixture', type: 'restaurant' })],
]);
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
let online = true;
const context = {
  console, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp,
  TextEncoder, crypto: null, localStorage,
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { get onLine() { return online; } },
  location: { search: '', hostname: 'kiwi-os.com' },
  setTimeout, clearTimeout, AbortController,
  CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => null, body: {} },
  fetch: async (url, init) => {
    if (!online) throw new TypeError('offline');
    const pin = JSON.parse(init && init.body || '{}').pin;
    return { ok: true, json: async () => ({ ok: true, staff: { id: 'st-' + pin, name: 'Staff ' + pin, role: 'manager' }, actorProof: 'online-proof' }) };
  },
};
/* WebCrypto with a counter on the expensive call. */
let derivations = 0, slowNext = 0;
context.crypto = {
  getRandomValues: (a) => webcrypto.getRandomValues(a),
  subtle: {
    digest: (...a) => webcrypto.subtle.digest(...a),
    importKey: (...a) => webcrypto.subtle.importKey(...a),
    deriveBits: async (...a) => { derivations++; if (slowNext) { const d = slowNext; slowNext = 0; await new Promise((r) => setTimeout(r, d)); } return webcrypto.subtle.deriveBits(...a); },
  },
};
context.window = context;
const until = async (fn, what) => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 25)); } assert.fail('timed out: ' + what); };
context.window.KiwiEnv = { demosAllowed: false };
context.window.KiwiRoles = { opensTill: role => /manager|owner|caiss/i.test(String(role)) };
const bootKey = 'kiwi:caisse:offline-pins:v1:offline-fixture';
storage.set(bootKey, JSON.stringify([{digest: 'a'.repeat(64), expiresAt: Date.now() + 60000, staff: {id:'old-unused'}}]));
vm.runInNewContext(source, context, { filename: 'assets/caisse-pairing.js' });
assert.deepEqual(JSON.parse(storage.get(bootKey)), [], 'boot purges unused legacy verifiers before any code is entered');

const code = String(randomInt(10000)).padStart(4, '0');
const wrong = String((Number(code) + 1) % 10000).padStart(4, '0');
const api = context.KiwiCaissePairing;
const key = 'kiwi:caisse:offline-pins:v1:offline-fixture';
await api.authorizeTill(code);
await until(() => JSON.parse(storage.get(key) || '[]').length === 1, 'first verifier written');
let row = JSON.parse(storage.get(key))[0];
assert.equal(row.v, 2, 'new entries must use v2');
assert.equal(row.kdf, 'pbkdf2-sha256');
assert.ok(row.it >= 1000000, 'at least 1M rounds');
assert.match(row.salt, /^[a-f0-9]{32}$/);
const material = new TextEncoder().encode('offline-fixture:' + code);
const imported = await webcrypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
const derive = () => webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: row.it,
  salt: Buffer.from(row.salt, 'hex') }, imported, 256);
assert.equal(Buffer.from(await derive()).toString('hex'), row.hash);
assert.equal(row.digest, undefined);
const plain = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(code))).toString('hex');
assert.ok(!storage.get(key).includes(plain));
/* A second staff member on the same till shares the salt. */
const code2 = String((Number(code) + 5000) % 10000).padStart(4, '0');
await api.authorizeTill(code2);
await until(() => JSON.parse(storage.get(key)).length === 2, 'second verifier written');
const rows2 = JSON.parse(storage.get(key));
assert.equal(new Set(rows2.map((r) => r.salt)).size, 1, 'one salt per till');
assert.notEqual(rows2[0].hash, rows2[1].hash);
/* The online unlock does not wait for the derivation. */
slowNext = 1500;
const t0 = performance.now();
assert.equal(await api.authorizeTill(code), true);
assert.ok(performance.now() - t0 < 1000, 'online unlock waited on the offline verifier');
await until(() => slowNext === 0 && derivations > 0, 'background refresh');
await new Promise((r) => setTimeout(r, 1700));
online = false;
derivations = 0;
assert.equal((await api.offlineRow(code2)).id, 'st-' + code2);
assert.equal(derivations, 1, 'one derivation per offline unlock, not one per cached row');
assert.ok(await api.offlineRow(code));
assert.equal(await api.offlineRow(wrong), null);
row = JSON.parse(storage.get(key)).find((r) => r.staff.id === 'st-' + code);
const legacySalt = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex');
const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('offline-fixture:' + legacySalt + ':' + code))).toString('hex');
const legacy = JSON.stringify([{ salt: legacySalt, digest, staff: row.staff, expiresAt: row.expiresAt }]);
storage.set(key, legacy);
assert.equal(await api.offlineRow(wrong), null);
assert.deepEqual(JSON.parse(storage.get(key)), [], 'unused legacy rows are deleted without a successful unlock');
assert.equal(await api.offlineRow(code), null, 'legacy proof can never unlock offline');
storage.set(key, legacy);
online = true;
await api.authorizeTill(code);
await until(() => JSON.parse(storage.get(key))[0]?.v === 2, 'online migration');
const start = performance.now();
for (let i = 0; i < 20; i++) await derive();
const ms = (performance.now() - start) / 20;
const minutes = ms * 10000 / 60000;
console.log(`PBKDF2 ${row.it}: ${ms.toFixed(1)} ms/derivation; 10 000 guesses: ${minutes.toFixed(1)} minutes (20 samples)`);
assert.ok(minutes > 10, 'copied cache enumeration must exceed 10 minutes on this machine');
/* A till unpaired (or moved to another store) while the verifier was being
   derived: the old store's verifier must not reappear after its purge. */
online = true;
storage.delete(key);
slowNext = 600;
assert.equal(await api.authorizeTill(code), true);
storage.set('kiwiPairedVenue', JSON.stringify({ merchant: 'another-store', name: 'Another', type: 'restaurant' }));
await new Promise((r) => setTimeout(r, 1200));
assert.ok(!storage.has(key), 'a verifier finished after a store switch is not written for the old store');
storage.set('kiwiPairedVenue', JSON.stringify({ merchant: 'offline-fixture', name: 'Offline Fixture', type: 'restaurant' }));
await api.authorizeTill(code);
await until(() => storage.has(key), 'verifier written again once paired back');
await new Promise((r) => setTimeout(r, 300));
const cached = storage.get(key);
context.crypto = undefined;
assert.equal(await api.offlineRow(code), null, 'no subtle preserves unavailable offline verification');
assert.equal(await api.authorizeTill(code), true, 'no subtle cannot block a server-proven unlock');
assert.equal(storage.get(key), cached, 'no subtle never writes a legacy fallback');
console.log('PASS: caisse PBKDF2 verifier and migration');
