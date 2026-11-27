#!/usr/bin/env node
// When a client's balance moves, their Wallet cards are told
// (functions/api/wallet/_notify.js): Apple by an empty APNs push on the Pass
// Type ID topic, Google by a PATCH of the loyalty object. fetch is stubbed;
// nothing leaves the machine.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { walletDb } from './wallet-d1-shim.mjs';
import { notifyClientChanged } from '../functions/api/wallet/_notify.js';
import { issueCard, registerDevice, devicesForSerial, touchCards } from '../functions/api/wallet/_store.js';
import { _resetGoogleToken } from '../functions/api/wallet/_google.js';
import { resetApnsJwtCache } from '../functions/api/push/_dispatch.js';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };
const pem = (label, buf) => `-----BEGIN ${label}-----\n${Buffer.from(buf).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const APNS = { APNS_KEY_ID: 'KEY1234567', APNS_TEAM_ID: 'TEAM123456', APNS_PRIVATE_KEY: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', ec.privateKey)), WALLET_APPLE_PASS_TYPE_ID: 'pass.com.kiwios.test' };
const GOOGLE = { WALLET_GOOGLE_ISSUER_ID: '3388000000012345678', WALLET_GOOGLE_SA_EMAIL: 'wallet@kiwi.iam.gserviceaccount.com', WALLET_GOOGLE_SA_KEY: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', rsa.privateKey)).replace(/\n/g, '\\n') };
const FID = { model: 'visit', visit: { target: 10, reward: '1 offert' } };

let calls = [], reply = () => new Response('{}', { status: 200 });
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return reply(String(url), init); };

async function world(env = {}) {
  const { DB, sql } = walletDb();
  sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('pasta-corner','fidelity',?,1,1), ('pasta-corner','wallet',?,1,1)")
    .run(JSON.stringify(FID), JSON.stringify({ on: true, name: 'Pasta Corner', color: '#B3261E', bg: '#FFF8F0' }));
  sql.prepare("INSERT INTO clients (merchant, id, name, phone, stamps, updated_ts, srv_ts) VALUES ('pasta-corner','c1','Salma','0612345678',2,1,1)").run();
  const e = { DB, ...env };
  const apple = await issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'apple' });
  const google = await issueCard(DB, { merchant: 'pasta-corner', clientId: 'c1', platform: 'google' });
  await touchCards(DB, 'pasta-corner', 'c1', 'visit:2/10:0');
  await registerDevice(DB, { deviceId: 'dev1', serial: apple.serial, pushToken: 'ab'.repeat(32) });
  return { sql, env: e, apple, google };
}
const stamps = (w, n) => w.sql.prepare("UPDATE clients SET stamps = ? WHERE id = 'c1'").run(n);

await ok('a new stamp sends one empty push on the pass topic', async () => {
  calls = []; resetApnsJwtCache();
  const w = await world(APNS);
  stamps(w, 3);
  const r = await notifyClientChanged(w.env, 'pasta-corner', 'c1');
  assert.equal(r.apple, 1);
  const push = calls.find((c) => c.url.includes('/3/device/'));
  assert.equal(push.url, 'https://api.push.apple.com/3/device/' + 'ab'.repeat(32));
  assert.equal(push.init.headers['apns-topic'], 'pass.com.kiwios.test');
  assert.equal(push.init.body, '{}');
  assert.match(push.init.headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
});

await ok('the same balance again sends nothing', async () => {
  const w = await world(APNS);
  stamps(w, 3);
  await notifyClientChanged(w.env, 'pasta-corner', 'c1');
  calls = [];
  const r = await notifyClientChanged(w.env, 'pasta-corner', 'c1');
  assert.equal(r.cards, 0); assert.equal(calls.length, 0);
});

await ok('a device Apple says is gone (410) is forgotten', async () => {
  const w = await world(APNS);
  reply = (url) => new Response('{"reason":"Unregistered"}', { status: url.includes('/3/device/') ? 410 : 200 });
  stamps(w, 4);
  await notifyClientChanged(w.env, 'pasta-corner', 'c1');
  assert.equal((await devicesForSerial(w.env.DB, w.apple.serial)).length, 0);
  reply = () => new Response('{}', { status: 200 });
});

await ok('a Google card is patched with the new balance, and told when the reward is ready', async () => {
  calls = []; _resetGoogleToken();
  reply = (url) => url.includes('oauth2') ? new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 })) : new Response('{}', { status: 200 });
  const w = await world(GOOGLE);
  stamps(w, 10);
  const r = await notifyClientChanged(w.env, 'pasta-corner', 'c1');
  assert.equal(r.google, 1);
  const patch = calls.find((c) => c.init.method === 'PATCH');
  assert.equal(patch.url, 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/' + encodeURIComponent('3388000000012345678.' + w.google.serial));
  assert.equal(patch.init.headers.Authorization, 'Bearer ya29.test');
  const body = JSON.parse(patch.init.body);
  assert.equal(body.loyaltyPoints.balance.string, '10 / 10');
  assert.match(body.heroImage.sourceUri.uri, /\/api\/wallet\/strip\/10-10-b3261e-fff8f0@3\.png$/);
  assert.equal(body.messages[0].messageType, 'TEXT_AND_NOTIFY');
  const tokenCall = calls.find((c) => c.url.includes('oauth2'));
  const assertion = new URLSearchParams(tokenCall.init.body).get('assertion');
  const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url'));
  assert.equal(claims.iss, GOOGLE.WALLET_GOOGLE_SA_EMAIL);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/wallet_object.issuer');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', rsa.publicKey, Buffer.from(assertion.split('.')[2], 'base64url'), new TextEncoder().encode(assertion.split('.').slice(0, 2).join('.')));
  assert.equal(ok, true);
  reply = () => new Response('{}', { status: 200 });
});

await ok('nothing configured: the balance is recorded and nothing is sent', async () => {
  calls = [];
  const w = await world({});
  stamps(w, 5);
  const r = await notifyClientChanged(w.env, 'pasta-corner', 'c1');
  assert.equal(r.cards, 2); assert.equal(calls.length, 0);
});

await ok('/api/clients tells the cards after a purchase, a refund and a reward, and retires them on delete', () => {
  const src = fs.readFileSync(new URL('../functions/api/clients.js', import.meta.url), 'utf8');
  for (const k of ['applyPurchase', 'applyRefund', 'applyRedemption']) assert.match(src, new RegExp(`told\\(await ${k}\\(`));
  assert.match(src, /revokeClientCards\(env\.DB, merchant, id\)/);
});

console.log(`wallet-notify: ${pass} passed`);
