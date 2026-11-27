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
  assert.equal(await S.claimSale(DB, 'pasta-corner', 'sale-ref-1', 'c1', T), 'claimed');
  assert.equal(await S.claimSale(DB, 'pasta-corner', 'sale-ref-1', 'c2', T), 'taken');
  assert.equal(await S.claimSale(DB, 'other-shop', 'sale-ref-1', 'c2', T), 'claimed');
  assert.equal(await S.claimSale(DB, 'pasta-corner', 'sale-ref-2', 'c1', T, 1), 'limit', 'c1 already has one claim today');
  assert.equal(await S.claimSale(DB, 'pasta-corner', 'sale-ref-2', 'c1', T + 86400_001, 1), 'claimed', 'a day later the cap is free again');
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

await ok('the owner\'s counts: cards by phone type, Apple cards actually in a Wallet, revoked and other shops left out', async () => {
  const { DB: db } = walletDb();
  const a1 = await S.issueCard(db, { merchant: 'santos-store', clientId: 'k1', platform: 'apple', now: T });
  await S.issueCard(db, { merchant: 'santos-store', clientId: 'k2', platform: 'apple', now: T });
  await S.issueCard(db, { merchant: 'santos-store', clientId: 'k1', platform: 'google', now: T });
  await S.issueCard(db, { merchant: 'santos-store', clientId: 'k3', platform: 'web', now: T });
  await S.issueCard(db, { merchant: 'santos-store', clientId: 'k4', platform: 'web', now: T });
  await S.revokeClientCards(db, 'santos-store', 'k4');
  await S.issueCard(db, { merchant: 'other-shop', clientId: 'z', platform: 'apple', now: T });
  await S.registerDevice(db, { deviceId: 'd1', serial: a1.serial, pushToken: 'p1', now: T });
  await S.registerDevice(db, { deviceId: 'd2', serial: a1.serial, pushToken: 'p2', now: T });
  const { week: _w1, ...counts } = await S.walletStats(db, 'santos-store');
  assert.deepEqual(counts, { clients: 3, apple: 2, appleInWallet: 1, google: 1, web: 1 });
  const { week: _w2, ...none } = await S.walletStats(db, 'empty-shop');
  assert.deepEqual(none, { clients: 0, apple: 0, appleInWallet: 0, google: 0, web: 0 });
});

await ok('the week, for the owner: new card holders, receipts claimed, rewards used, and the share of sales made with a card', async () => {
  const { DB: db, sql: q } = walletDb();
  const now = Date.now(), old = now - 9 * 86400_000;
  await S.issueCard(db, { merchant: 'amira-cafe', clientId: 'h1', platform: 'web', now: now - 3600_000 });
  await S.issueCard(db, { merchant: 'amira-cafe', clientId: 'h1', platform: 'apple', now: now - 3600_000 });
  await S.issueCard(db, { merchant: 'amira-cafe', clientId: 'h2', platform: 'web', now: old });
  await S.claimSale(db, 'amira-cafe', 'sale-a', 'h1', now - 7200_000);
  await S.claimSale(db, 'amira-cafe', 'sale-old', 'h2', old);
  const sale = q.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts, void_ts) VALUES (?,?,?,?,?,?,?,?)');
  for (const [id, ts, v] of [['s1', now - 1000, null], ['s2', now - 2000, null], ['s3', now - 3000, null], ['s4', now - 4000, null], ['s5', now - 5000, now], ['s6', old, null]]) sale.run(id, 'amira-cafe', 10, 1000, 'cash', id, ts, v);
  const buy = q.prepare("INSERT INTO client_purchase_events (merchant, ref, client_id, created_ts, visits) VALUES ('amira-cafe', ?, ?, ?, ?)");
  buy.run('s1', 'h1', now - 1000, 1); buy.run('s2', 'h2', now - 2000, 1); buy.run('s3', 'walk-in', now - 3000, 1); buy.run('refund:void:1:x', 'h1', now - 900, 0);
  const reward = q.prepare("INSERT INTO client_reward_events (merchant, ref, client_id, points_delta, stamps_delta, created_ts) VALUES ('amira-cafe', ?, ?, ?, ?, ?)");
  reward.run('r1', 'h1', -300, 0, now - 500); reward.run('r2', 'h2', 0, -10, old); reward.run('r3', 'walk-in', -300, 0, now - 400);
  const { week } = await S.walletStats(db, 'amira-cafe', now);
  assert.deepEqual(week, { newHolders: 1, receipts: 1, rewards: 1, sales: 4, salesWithCard: 2 });
});

void sql;
console.log(`wallet-store: ${pass} passed`);
