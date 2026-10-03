#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../assets/caisse-pairing.js', import.meta.url), 'utf8');
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
  TextEncoder, crypto: webcrypto, localStorage,
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { get onLine() { return online; } },
  location: { search: '', hostname: 'kiwi-os.com' },
  setTimeout, clearTimeout, AbortController,
  CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => null, body: {} },
  fetch: async () => {
    if (!online) throw new TypeError('offline');
    return { ok: true, json: async () => ({ ok: true, staff: { id: 'mgr-1', name: 'Mina', role: 'manager' }, actorProof: 'online-proof' }) };
  },
};
context.window = context;
context.window.KiwiEnv = { demosAllowed: false };
context.window.KiwiRoles = { opensTill: role => /manager|owner|caiss/i.test(String(role)) };
vm.runInNewContext(source, context, { filename: 'assets/caisse-pairing.js' });

assert.equal(await context.KiwiCaissePairing.authorizeTill('2468'), true);
const key = [...storage.keys()].find(value => value.startsWith('kiwi:caisse:offline-pins:v1:'));
assert.ok(key, 'successful online verification creates a tenant-scoped offline verifier');
// A substring search in random hexadecimal data falsely reports disclosure
// whenever a salted digest happens to contain the fixture's four digits.
// Inspect the persisted shape and verify the hash instead of weakening the
// raw-code protection or relying on a probabilistic string assertion.
const rows = JSON.parse(storage.get(key));
assert.equal(rows.length, 1);
const verifier = rows[0];
assert.deepEqual(Object.keys(verifier).sort(), ['digest', 'expiresAt', 'salt', 'staff']);
assert.deepEqual(Object.keys(verifier.staff).sort(), ['id', 'name', 'role']);
assert.match(verifier.salt, /^[a-f0-9]{32}$/);
assert.match(verifier.digest, /^[a-f0-9]{64}$/);
const expectedDigest = Buffer.from(await webcrypto.subtle.digest('SHA-256',
  new TextEncoder().encode('offline-fixture:' + verifier.salt + ':' + ['24', '68'].join('')))).toString('hex');
assert.equal(verifier.digest, expectedDigest, 'only the salted verifier is persisted');

online = false;
assert.equal(await context.KiwiCaissePairing.authorizeTill('2468'), true,
  'the same valid till PIN authorizes a protected action offline');
assert.equal(context.KiwiCaissePairing.lastOperator().name, 'Mina');
assert.equal(await context.KiwiCaissePairing.authorizeTill('9999'), false,
  'an unknown PIN remains rejected offline');
assert.equal(await context.KiwiCaissePairing.authorizeManager('2468'), true,
  'a previously verified manager can authorize cancellation/refund flows offline');

console.log('PASS: caisse offline PIN verifier');
