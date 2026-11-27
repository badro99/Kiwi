#!/usr/bin/env node
// The public Wallet routes (functions/api/wallet/): the enrollment page's POST,
// the receipt claim, the till QR, Apple's pass web service, the strip image and
// the web card. Run in process against schema.sql on node:sqlite.
// Spec: docs/superpowers/specs/2026-11-27-wallet-loyalty-card-design.md.
import assert from 'node:assert/strict';
import { walletDb } from './wallet-d1-shim.mjs';
import * as enroll from '../functions/api/wallet/enroll.js';
import * as service from '../functions/api/wallet/v1/[[path]].js';
import * as strip from '../functions/api/wallet/strip/[[path]].js';
import * as cardRoute from '../functions/api/wallet/card.js';
import { mintTillToken, cardsForClient } from '../functions/api/wallet/_store.js';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };
const FID = { model: 'visit', visit: { target: 10, reward: '1 offert' }, amount: { perMad: 1, threshold: 100, reward: '−10 %' }, product: { item: 'Café', target: 10, reward: '1 offert' } };

function world({ walletOn = true, apple = false } = {}) {
  const { DB, sql } = walletDb();
  const put = (merchant, feature, data) => sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,1,1)').run(merchant, feature, JSON.stringify(data));
  put('pasta-corner', 'fidelity', FID);
  put('pasta-corner', 'wallet', { on: walletOn, name: 'Pasta Corner', color: '#B3261E', bg: '#FFF8F0' });
  put('no-wallet', 'fidelity', FID);
  const env = { DB, AUTH_SECRET: 'test-secret' };
  if (apple) Object.assign(env, { WALLET_APPLE_PASS_TYPE_ID: 'pass.com.kiwios.test', WALLET_APPLE_CERT_PEM: 'x', WALLET_APPLE_KEY_PEM: 'x', APNS_TEAM_ID: 'TEAM' });
  return { DB, sql, env };
}
const ctx = (env, method, url, body, headers = {}) => ({
  env, params: {}, waitUntil() {},
  request: new Request('https://kiwi-os.com' + url, { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': headers.ip || '10.0.0.1', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }),
});
const post = async (w, body, headers) => { const r = await enroll.onRequestPost(ctx(w.env, 'POST', '/api/wallet/enroll', body, headers)); return { status: r.status, body: await r.json() }; };
const clientRows = (w) => w.sql.prepare("SELECT id, name, phone, stamps, source FROM clients WHERE merchant = 'pasta-corner' AND deleted = 0").all();

await ok('a new phone gets a client record and a web card', async () => {
  const w = world();
  const r = await post(w, { merchant: 'pasta-corner', name: 'Salma Idrissi', phone: '06 12 34 56 78', consent: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.offers.web, /^https:\/\/kiwi-os\.com\/carte\/pasta-corner\/[a-z0-9]+\?t=[a-z0-9]{32}$/);
  assert.equal(r.body.offers.apple, undefined); assert.equal(r.body.offers.google, undefined);
  const rows = clientRows(w);
  assert.equal(rows.length, 1); assert.equal(rows[0].name, 'Salma Idrissi'); assert.equal(rows[0].source, 'wallet');
});

await ok('a phone already in the book reveals nothing and gets no card', async () => {
  const w = world();
  await post(w, { merchant: 'pasta-corner', name: 'Salma Idrissi', phone: '0612345678', consent: true });
  w.sql.prepare("UPDATE clients SET stamps = 7 WHERE merchant = 'pasta-corner'").run();
  const r = await post(w, { merchant: 'pasta-corner', name: 'Someone', phone: '+212 6 12 34 56 78', consent: true });
  assert.equal(r.status, 200); assert.equal(r.body.exists, true);
  assert.equal(r.body.offers, undefined);
  const text = JSON.stringify(r.body);
  assert.ok(!/Salma|7/.test(text), text);
  assert.equal(clientRows(w).length, 1);
});

await ok('a shop without the Wallet card switched on refuses', async () => {
  const w = world({ walletOn: false });
  assert.equal((await post(w, { merchant: 'pasta-corner', name: 'A', phone: '0611111111', consent: true })).status, 404);
  assert.equal((await post(w, { merchant: 'no-wallet', name: 'A', phone: '0611111111', consent: true })).status, 404);
});

await ok('a bad phone is a 400', async () => {
  const w = world();
  assert.equal((await post(w, { merchant: 'pasta-corner', name: 'A', phone: 'abc', consent: true })).status, 400);
});

function addSale(w, id, { ts = Date.now() - 3600_000, voided = false, ref = '43015' } = {}) {
  w.sql.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts, void_ts) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, 'pasta-corner', 120, 12000, 'cash', ref, ts, voided ? Date.now() : null);
}

await ok('a receipt QR credits its visit to a new card, once', async () => {
  const w = world();
  addSale(w, 'sale-ref-aaa');
  const r = await post(w, { merchant: 'pasta-corner', name: 'Yassine', phone: '0622222222', consent: true, r: 'sale-ref-aaa' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.credited, true); assert.ok(r.body.offers.web);
  assert.equal(clientRows(w)[0].stamps, 1);
  const again = await post(w, { merchant: 'pasta-corner', name: 'Other', phone: '0633333333', consent: true, r: 'sale-ref-aaa' });
  assert.equal(again.body.already, true);
  assert.equal(clientRows(w).length, 1);
});

await ok('a receipt whose sale already had a client is not credited again', async () => {
  const w = world();
  addSale(w, 'sale-ref-bbb', { ref: '43016' });
  w.sql.prepare("INSERT INTO client_purchase_events (merchant, ref, client_id, created_ts, sale_ref) VALUES ('pasta-corner', 'sale-ref-bbb', 'c-old', 1, '43016')").run();
  const r = await post(w, { merchant: 'pasta-corner', name: 'Y', phone: '0644444444', consent: true, r: 'sale-ref-bbb' });
  assert.equal(r.body.already, true);
});

await ok('a voided, foreign or week-old receipt is refused', async () => {
  const w = world();
  addSale(w, 'sale-ref-void', { voided: true });
  addSale(w, 'sale-ref-old', { ts: Date.now() - 8 * 86400_000 });
  for (const id of ['sale-ref-void', 'sale-ref-old', 'sale-ref-none']) {
    const r = await post(w, { merchant: 'pasta-corner', name: 'Y', phone: '0655555555', consent: true, r: id });
    assert.equal(r.status, 410, id); assert.equal(r.body.error, 'receipt-unusable');
  }
});

await ok('a receipt scanned by a known phone credits the stamp but hands no card', async () => {
  const w = world();
  await post(w, { merchant: 'pasta-corner', name: 'Salma', phone: '0612345678', consent: true });
  addSale(w, 'sale-ref-ccc', { ref: '43017' });
  const r = await post(w, { merchant: 'pasta-corner', name: 'x', phone: '0612345678', consent: true, r: 'sale-ref-ccc' });
  assert.equal(r.body.credited, true); assert.equal(r.body.exists, true); assert.equal(r.body.offers, undefined);
  assert.equal(clientRows(w)[0].stamps, 1);
});

await ok('the till QR hands the attached client their own card, once', async () => {
  const w = world();
  await post(w, { merchant: 'pasta-corner', name: 'Salma', phone: '0612345678', consent: true });
  const id = clientRows(w)[0].id;
  const t = await mintTillToken(w.DB, 'pasta-corner', id);
  const r = await post(w, { merchant: 'pasta-corner', t });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.offers.web);
  assert.equal((await post(w, { merchant: 'pasta-corner', t })).status, 410);
  const other = await mintTillToken(w.DB, 'pasta-corner', id);
  assert.equal((await post(w, { merchant: 'no-wallet', t: other })).status, 404);
});

await ok('with the Apple certificate configured, the offer includes the .pkpass link', async () => {
  const w = world({ apple: true });
  const r = await post(w, { merchant: 'pasta-corner', name: 'Nora', phone: '0666666666', consent: true });
  assert.match(r.body.offers.apple, /^https:\/\/kiwi-os\.com\/api\/wallet\/v1\/download\/[a-z0-9]+\.pkpass\?t=[a-z0-9]{32}$/);
});

await ok('twenty enrollments an hour per address, then 429', async () => {
  const w = world();
  for (let i = 0; i < 20; i++) await post(w, { merchant: 'pasta-corner', name: 'N', phone: '06' + String(10000000 + i), consent: true }, { ip: '10.9.9.9' });
  assert.equal((await post(w, { merchant: 'pasta-corner', name: 'N', phone: '0699999999', consent: true }, { ip: '10.9.9.9' })).status, 429);
});

await ok('no tables yet (migration not applied): 503, not a crash', async () => {
  const { DB } = walletDb({ schema: false });
  const r = await enroll.onRequestPost(ctx({ DB, AUTH_SECRET: 's' }, 'POST', '/api/wallet/enroll', { merchant: 'pasta-corner', name: 'A', phone: '0611111111' }));
  assert.equal(r.status, 503);
});

const svc = (env, method, path, auth, body, extra = {}) => service.onRequest({
  env, waitUntil() {}, params: { path: path.split('?')[0].split('/') },
  request: new Request('https://kiwi-os.com/api/wallet/v1/' + path, { method, headers: { ...(auth ? { Authorization: 'ApplePass ' + auth } : {}), 'Content-Type': 'application/json', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) }),
});

await ok('Apple web service: registration needs the card token', async () => {
  const w = world({ apple: true });
  await post(w, { merchant: 'pasta-corner', name: 'Nora', phone: '0666666666', consent: true });
  const card = (await cardsForClient(w.DB, 'pasta-corner', clientRows(w)[0].id)).find((c) => c.platform === 'apple');
  const reg = `devices/dev1/registrations/pass.com.kiwios.test/${card.serial}`;
  assert.equal((await svc(w.env, 'POST', reg, 'wrong-token-wrong-token-wrong-tok', { pushToken: 'ab'.repeat(32) })).status, 401);
  assert.equal((await svc(w.env, 'POST', reg, card.auth_token, { pushToken: 'ab'.repeat(32) })).status, 201);
  assert.equal((await svc(w.env, 'POST', reg, card.auth_token, { pushToken: 'ab'.repeat(32) })).status, 200);
  assert.equal((await svc(w.env, 'POST', `devices/dev1/registrations/pass.com.other/${card.serial}`, card.auth_token, { pushToken: 'ab' })).status, 404);
  const list = await svc(w.env, 'GET', 'devices/dev1/registrations/pass.com.kiwios.test?passesUpdatedSince=0');
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).serialNumbers, [card.serial]);
  const later = await svc(w.env, 'GET', `devices/dev1/registrations/pass.com.kiwios.test?passesUpdatedSince=${card.updated_ts}`);
  assert.equal(later.status, 204);
  assert.equal((await svc(w.env, 'GET', 'devices/nobody/registrations/pass.com.kiwios.test')).status, 204);
  assert.equal((await svc(w.env, 'GET', `passes/pass.com.kiwios.test/${card.serial}`)).status, 401);
  const unchanged = await svc(w.env, 'GET', `passes/pass.com.kiwios.test/${card.serial}`, card.auth_token, null, { 'If-Modified-Since': new Date(card.updated_ts + 1000).toUTCString() });
  assert.equal(unchanged.status, 304);
  assert.equal((await svc(w.env, 'DELETE', reg, card.auth_token)).status, 200);
  assert.equal((await svc(w.env, 'POST', 'log', null, { logs: ['x'] })).status, 200);
});

await ok('strip images are stateless, bounded and cached forever', async () => {
  const r = await strip.onRequestGet({ request: new Request('https://kiwi-os.com/api/wallet/strip/7-10-b3261e-fff8f0@2.png'), params: { path: ['7-10-b3261e-fff8f0@2.png'] }, env: {}, waitUntil() {} });
  assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Type'), 'image/png');
  assert.match(r.headers.get('Cache-Control'), /immutable/);
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.equal(bytes[1], 0x50);
  for (const bad of ['7-99-b3261e-fff8f0@2.png', '7-10-b3261e-fff8f0@9.png', 'x.png']) {
    const b = await strip.onRequestGet({ request: new Request('https://kiwi-os.com/api/wallet/strip/' + bad), params: { path: [bad] }, env: {}, waitUntil() {} });
    assert.equal(b.status, 404, bad);
  }
});

await ok('the web card shows the live balance to its token holder only', async () => {
  const w = world();
  const e = await post(w, { merchant: 'pasta-corner', name: 'Salma Idrissi', phone: '0612345678', consent: true });
  w.sql.prepare("UPDATE clients SET stamps = 4 WHERE merchant = 'pasta-corner'").run();
  const u = new URL(e.body.offers.web), serial = u.pathname.split('/').pop(), t = u.searchParams.get('t');
  const get = (q) => cardRoute.onRequestGet(ctx(w.env, 'GET', '/api/wallet/card?' + q));
  const r = await get(`s=${serial}&t=${t}`);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.card.text, '4 / 10'); assert.equal(b.card.firstName, 'Salma'); assert.equal(b.merchant.name, 'Pasta Corner');
  assert.match(b.card.strip, /^\/api\/wallet\/strip\/4-10-b3261e-fff8f0@2\.png$/);
  assert.equal((await get(`s=${serial}&t=${'x'.repeat(32)}`)).status, 401);
});

console.log(`wallet-routes: ${pass} passed`);
