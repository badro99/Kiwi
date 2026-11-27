#!/usr/bin/env node
// The card store (functions/api/wallet/_store.js) over the real schema.sql.
import assert from 'node:assert/strict';
import { walletDb } from './wallet-d1-shim.mjs';
import * as S from '../functions/api/wallet/_store.js';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };
const { DB, sql } = walletDb();
const T = 1_795_700_000_000;

await ok('a card has an unguessable serial and a 32-char token, and is reused', async () => {
  const a = await S.issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'apple', now: T });
  assert.match(a.serial, /^[a-z0-9]{20,}$/); assert.equal(a.authToken.length, 32);
  const b = await S.issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'apple', now: T + 1 });
  assert.equal(b.serial, a.serial);
  const g = await S.issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'google', now: T });
  assert.notEqual(g.serial, a.serial);
  assert.equal((await S.cardBySerial(DB, a.serial)).client_id, 'c1');
  assert.equal(await S.cardBySerial(DB, 'nope'), null);
});

await ok('touch only moves cards whose balance changed', async () => {
  const first = await S.touchCards(DB, 'pasta-corner', 'c1', '7/10', T + 5);
  assert.equal(first.length, 2);
  assert.deepEqual(await S.touchCards(DB, 'pasta-corner', 'c1', '7/10', T + 6), []);
  assert.equal((await S.touchCards(DB, 'pasta-corner', 'c1', '8/10', T + 7)).length, 2);
  assert.deepEqual(await S.touchCards(DB, 'other-shop', 'c1', '9/10', T + 8), []);
});

await ok('devices register once, list changed serials, and unregister', async () => {
  const { serial } = await S.issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'apple', now: T });
  assert.equal(await S.registerDevice(DB, { deviceId: 'dev1', serial, pushToken: 'aa', now: T }), 'created');
  assert.equal(await S.registerDevice(DB, { deviceId: 'dev1', serial, pushToken: 'bb', now: T }), 'exists');
  assert.deepEqual((await S.devicesForSerial(DB, serial)).map((d) => d.push_token), ['bb']);
  const all = await S.serialsUpdatedSince(DB, 'dev1', 0);
  assert.deepEqual(all.serials, [serial]); assert.equal(all.lastUpdated, String(T + 7));
  assert.deepEqual((await S.serialsUpdatedSince(DB, 'dev1', T + 7)).serials, []);
  await S.dropPushToken(DB, 'bb');
  assert.equal((await S.devicesForSerial(DB, serial)).length, 0);
  await S.registerDevice(DB, { deviceId: 'dev1', serial, pushToken: 'cc', now: T });
  await S.unregisterDevice(DB, 'dev1', serial);
  assert.equal((await S.devicesForSerial(DB, serial)).length, 0);
});

await ok('a receipt credits one card, once', async () => {
  assert.equal(await S.claimSale(DB, 'pasta-corner', 'sale-ref-1', 'c1', T), true);
  assert.equal(await S.claimSale(DB, 'pasta-corner', 'sale-ref-1', 'c2', T), false);
  assert.equal(await S.claimSale(DB, 'other-shop', 'sale-ref-1', 'c2', T), true);
});

await ok('a till QR token works once and expires after ten minutes', async () => {
  const t = await S.mintTillToken(DB, 'pasta-corner', 'c1', T);
  assert.match(t, /^[a-z0-9]{24,}$/);
  assert.deepEqual(await S.useTillToken(DB, t, T + 60_000), { merchant: 'pasta-corner', clientId: 'c1' });
  assert.equal(await S.useTillToken(DB, t, T + 61_000), null);
  const late = await S.mintTillToken(DB, 'pasta-corner', 'c1', T);
  assert.equal(await S.useTillToken(DB, late, T + 10 * 60_000 + 1), null);
});

await ok('revoking a client retires its cards', async () => {
  const n = await S.revokeClientCards(DB, 'pasta-corner', 'c1', T + 9);
  assert.equal(n, 2);
  assert.equal((await S.cardsForClient(DB, 'pasta-corner', 'c1')).length, 0);
  const again = await S.issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'apple', now: T + 10 });
  assert.equal((await S.cardBySerial(DB, again.serial)).revoked, 0);
});

void sql;
console.log(`wallet-store: ${pass} passed`);
