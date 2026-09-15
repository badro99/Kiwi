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
assert.ok(!storage.get(key).includes('2468'), 'the raw PIN is never persisted');

online = false;
assert.equal(await context.KiwiCaissePairing.authorizeTill('2468'), true,
  'the same valid till PIN authorizes a protected action offline');
assert.equal(context.KiwiCaissePairing.lastOperator().name, 'Mina');
assert.equal(await context.KiwiCaissePairing.authorizeTill('9999'), false,
  'an unknown PIN remains rejected offline');
assert.equal(await context.KiwiCaissePairing.authorizeManager('2468'), true,
  'a previously verified manager can authorize cancellation/refund flows offline');

console.log('PASS: caisse offline PIN verifier');
