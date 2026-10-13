#!/usr/bin/env node
/* Regression: the manager pad must check a code against the store this till is
 * paired to NOW, never against the store the staff pad last opened for.
 *
 * askStaff() remembers the store it asked about (`pinVenue`). Nothing cleared it
 * when the till was re-paired to another store or unpaired, and verifyCode (the
 * one path behind the till pad, authorizeTill and authorizeManager) preferred it
 * over the paired store. So after a re-pair that skipped the staff pad, another
 * store's manager code was judged by the PREVIOUS store, through the server, and
 * could approve a discount on this till. See docs/specs/kiwi-design-2027.md
 * §10.26 (R10). No real code is used: the fixture code is fake and only the
 * request body's merchant is inspected. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/caisse-pairing.js', import.meta.url), 'utf8');

const storeA = { merchant: 'store-a', venueId: 'venue-a', type: 'restaurant', name: 'Store A' };
const storeB = { merchant: 'store-b', venueId: 'venue-b', type: 'restaurant', name: 'Store B' };
const FIXTURE_CODE = '0000';

function boot() {
  const values = new Map([
    ['kiwiPaired', '1'],
    ['kiwiPairedVenue', JSON.stringify(storeA)],
  ]);
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
  const verifyMerchants = [];
  const elements = new Map();
  const makeEl = () => ({
    style: {}, classList: { add() {}, remove() {} }, innerHTML: '', setAttribute() {},
    appendChild(el) { if (el.id) elements.set(el.id, el); },
    remove() {},
  });
  const document = {
    readyState: 'complete',
    addEventListener() {}, dispatchEvent() {},
    getElementById: id => elements.get(id) || null,
    createElement: () => makeEl(),
    head: makeEl(), body: makeEl(),
  };
  const context = {
    console, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp,
    localStorage: storage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { onLine: true },
    location: { search: '', hostname: 'kiwi-os.com', href: 'https://kiwi-os.com/kiwi-caisse.html' },
    setTimeout, clearTimeout, AbortController, document,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    fetch: async (url, init = {}) => {
      const u = String(url);
      if (u.startsWith('/api/config')) {
        return { ok: true, json: async () => ({ pins: [{ name: 'Sam', role: 'manager' }], pinGateConfigured: true }) };
      }
      if (u.startsWith('/api/pin/verify')) {
        const body = JSON.parse(init.body);
        verifyMerchants.push(body.merchant);
        return { ok: true, json: async () => ({ ok: true, staff: { id: 'mgr-' + body.merchant, name: 'Mina', role: 'manager' } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  context.window = context;
  context.window.KiwiEnv = { demosAllowed: false };
  context.window.KiwiRoles = { opensTill: role => /manager|owner|caiss/i.test(String(role)) };
  vm.runInNewContext(source, context, { filename: 'assets/caisse-pairing.js' });
  return { context, values, verifyMerchants, setVenue: v => values.set('kiwiPairedVenue', JSON.stringify(v)) };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

// 1. Baseline: the staff pad opened for store A, the manager pad checks store A.
{
  const t = boot();
  await settle();                       // boot() → askStaff(store A) → pad shown, pinVenue = A
  assert.equal(await t.context.KiwiCaissePairing.authorizeManager(FIXTURE_CODE), true);
  assert.deepEqual(t.verifyMerchants, ['store-a'], 'paired to A: the code is checked against A');
}

// 2. Re-paired to B without passing through the staff pad: checked against B.
{
  const t = boot();
  await settle();
  t.setVenue(storeB);                   // the pair-back / idle re-pair path
  assert.equal(await t.context.KiwiCaissePairing.authorizeManager(FIXTURE_CODE), true);
  assert.deepEqual(t.verifyMerchants, ['store-b'],
    're-paired to B: authorizeManager must not check the code against the previous store A');
  assert.equal(await t.context.KiwiCaissePairing.authorizeTill(FIXTURE_CODE), true);
  assert.deepEqual(t.verifyMerchants, ['store-b', 'store-b'], 'authorizeTill follows the paired store too');
}

// 3. Unpaired: there is no store to check against, so nothing is sent anywhere.
{
  const t = boot();
  await settle();
  t.values.delete('kiwiPairedVenue');
  t.values.delete('kiwiPaired');
  assert.equal(await t.context.KiwiCaissePairing.authorizeManager(FIXTURE_CODE), false,
    'unpaired till authorizes nobody');
  assert.deepEqual(t.verifyMerchants, [], 'unpaired till never asks the server about the old store');
}

console.log('PASS: manager pad checks codes against the currently paired store');
