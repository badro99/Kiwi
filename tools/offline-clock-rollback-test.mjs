#!/usr/bin/env node
/* offline-clock-rollback-test · wave 12, lane G (pairing#1).
 *
 * The offline staff identity (72 h, 24 h for a manager act) was measured with
 * the till's own Date.now(): setting the device clock back kept a revoked code
 * working. assets/pairing-commit.js now anchors the till on the last
 * server time it saw (the Date header of /api/pin/verify) and never lets time
 * run backwards: a rolled-back clock refuses offline codes until the next
 * server contact. Runs the REAL caisse-pairing.js and trusted clock in vm. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const H = 3600e3;
const T0 = Date.parse('2026-10-20T10:00:00Z');

function till({ withClock = true } = {}) {
  const storage = new Map([
    ['kiwiPaired', '1'],
    ['kiwiPairedVenue', JSON.stringify({ merchant: 'clock-fixture', name: 'Clock Fixture', type: 'restaurant' })],
  ]);
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const dev = { offset: 0, serverOffset: 0 };            // device clock vs T0 reality
  class FakeDate extends Date { static now() { return T0 + dev.offset; } }
  let online = true, realNow = 0;                       // realNow: true elapsed ms since T0
  const ctx = {
    console, Promise, Date: FakeDate, Math, JSON, Object, Array, String, Number, RegExp, isFinite,
    TextEncoder, crypto: webcrypto, localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { get onLine() { return online; } },
    location: { search: '', hostname: 'kiwi-os.com' },
    setTimeout, clearTimeout, AbortController,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => null, body: {} },
    fetch: async () => {
      if (!online) throw new TypeError('offline');
      return {
        ok: true, status: 200,
        headers: { get: (h) => (/^date$/i.test(h) ? new Date(T0 + realNow).toUTCString() : null) },
        json: async () => ({ ok: true, staff: { id: 'mgr-1', name: 'Mina', role: 'manager' }, actorProof: 'online-proof' }),
      };
    },
  };
  ctx.window = ctx;
  ctx.window.KiwiEnv = { demosAllowed: false };
  ctx.window.KiwiRoles = { opensTill: (role) => /manager|owner|caiss/i.test(String(role)) };
  ctx.addEventListener = () => {};
  if (withClock) vm.runInNewContext(read('assets/pairing-commit.js'), ctx, { filename: 'assets/pairing-commit.js' });
  vm.runInNewContext(read('assets/caisse-pairing.js'), ctx, { filename: 'assets/caisse-pairing.js' });
  return {
    ctx, storage, dev,
    setOnline: (v) => { online = v; },
    /* time passes for real: the device clock follows, unless the user moves it */
    pass: (ms) => { realNow += ms; dev.offset += ms; },
    P: () => ctx.KiwiCaissePairing,
    reload: () => vm.runInNewContext(read('assets/pairing-commit.js'), ctx, { filename: 'assets/pairing-commit.js' }),
  };
}
async function proven(t) {
  assert.equal(await t.P().authorizeTill('2468'), true, 'online unlock');
  for (let i = 0; i < 400 && ![...t.storage.keys()].some((k) => k.startsWith('kiwi:caisse:offline-pins:v1:')); i++) await new Promise((r) => setTimeout(r, 25));
  assert.ok([...t.storage.keys()].some((k) => k.startsWith('kiwi:caisse:offline-pins:v1:')), 'verifier cached');
}
let n = 0;
const ok = async (label, f) => { await f(); n++; console.log('  ✓ ' + label); };

await ok('baseline: an offline code works inside 72 h and is refused after', async () => {
  const t = till(); await proven(t); t.setOnline(false);
  t.pass(10 * H);
  assert.equal(await t.P().authorizeTill('2468'), true);
  t.pass(70 * H);
  assert.equal(await t.P().authorizeTill('2468'), false, '80 h after the proof');
});

await ok('setting the device clock back after expiry does NOT bring the code back', async () => {
  const t = till(); await proven(t); t.setOnline(false);
  t.pass(80 * H);
  assert.equal(await t.P().authorizeTill('2468'), false, 'expired');
  t.dev.offset -= 70 * H;                                   // the user sets the clock back to 10 h after the proof
  assert.equal(await t.P().authorizeTill('2468'), false, 'a rolled-back clock must not revive a code');
});

await ok('rolling back after hours of use (no code typed in between) is seen through the heartbeat', async () => {
  const t = till(); await proven(t); t.setOnline(false);
  t.pass(30 * H); t.ctx.KiwiTrustedClock.now();             // the heartbeat while the till is open
  t.dev.offset -= 25 * H;
  assert.equal(await t.P().authorizeTill('2468'), false, 'clock moved 25 h back: refused until the till reaches the server');
  assert.equal(await t.P().authorizeManager('2468'), false);
});

await ok('a manager act (24 h) is measured on the same clock', async () => {
  const t = till(); await proven(t); t.setOnline(false);
  t.pass(30 * H);
  assert.equal(await t.P().authorizeManager('2468'), false, 'older than 24 h');
  t.dev.offset -= 20 * H;
  assert.equal(await t.P().authorizeManager('2468'), false, 'a rolled-back clock does not make it young again');
});

await ok('back online, the server time anchors the clock and the next offline window is normal', async () => {
  const t = till(); await proven(t); t.setOnline(false);
  t.pass(30 * H); t.ctx.KiwiTrustedClock.now();
  t.dev.offset -= 25 * H;
  assert.equal(await t.P().authorizeTill('2468'), false);
  t.setOnline(true);
  assert.equal(await t.P().authorizeTill('2468'), true, 'online proof again');
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 50));
  t.setOnline(false);
  t.pass(2 * H);
  assert.equal(await t.P().authorizeTill('2468'), true, 'anchored on server time, the cache works again');
});

await ok('a small correction (3 min) is not mistaken for a rollback', async () => {
  const t = till(); await proven(t); t.setOnline(false);
  t.pass(2 * H); t.ctx.KiwiTrustedClock.now();
  t.dev.offset -= 3 * 60 * 1000;
  assert.equal(await t.P().authorizeTill('2468'), true);
});

await ok('the clock persists across a reload (the high-water mark survives)', async () => {
  const t = till(); await proven(t); t.setOnline(false);
  t.pass(80 * H); t.ctx.KiwiTrustedClock.now(); t.ctx.KiwiTrustedClock.anchor(T0 + 80 * H); // saved
  t.dev.offset -= 79 * H; t.reload();
  assert.equal(t.ctx.KiwiTrustedClock.rolledBack(), true);
  assert.equal(await t.P().authorizeTill('2468'), false);
});

console.log(`PASS offline clock rollback (${n} scenarios)`);
