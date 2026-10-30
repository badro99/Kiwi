#!/usr/bin/env node
/* Ozon Express (functions/api/ozon/), on the real schema, with Ozon itself
 * replaced by a recorder that answers like api.ozonexpress.ma.
 *
 *   node tools/ozon-express-test.mjs
 *
 * Owner, 30 Oct 2026: link Santos's Ozon account so a delivery sale leaves
 * as an Ozon parcel, is tracked, and counts in revenue when Ozon says
 * « Payé ». Returned or refused parcels wait for a manager. Held here:
 *   · the API key is checked with Ozon, stored encrypted, never sent back,
 *     never in an error, and only the owner (not the till) can set it;
 *   · a parcel's price is what is still owed on the sale, one parcel per sale
 *     even when two devices send at once, pickup mode from the connection;
 *   · tracking reads Ozon's words: « Payé » writes ONE collection for the
 *     remaining due (a second refresh writes nothing), « Retourné » moves no
 *     money and no stock, « Livré » alone moves nothing;
 *   · an Ozon parcel is out of the 15-day auto-confirm;
 *   · a delivery note runs Ozon's three steps and marks the parcels. */
import assert from 'node:assert/strict';
import coreTestSource from './core-test-source.cjs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as account from '../functions/api/ozon/account.js';
import * as parcels from '../functions/api/ozon/parcels.js';
import * as notes from '../functions/api/ozon/notes.js';
import { onRequestGet as receivablesGet } from '../functions/api/receivables.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { readStatus as ozonStatusOf, __resetCities } from '../functions/api/ozon/_lib.js';

const MERCHANT = 'ozon-test-shop', OTHER = 'ozon-other-shop', SECRET = 'ozon-express-test-secret-0123456789';
const KEY = 'test-ozon-key-abcdef123456';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(coreTestSource.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...v) { args = v; return st; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return st;
  },
  failBatch: 0,
  batch(list) { if (DB.failBatch) { DB.failBatch--; throw new Error('D1 blip (test)'); } sqlite.exec('BEGIN IMMEDIATE'); try { const o = list.map((s) => s.run()); sqlite.exec('COMMIT'); return o; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};

/* Ozon, simulated. Records every call (path and body) and answers from `ozon`. */
const calls = [];
const ozon = { status: {}, keyOk: true, nextTracking: 1, refuseAdd: '' };
const cityList = { CITIES: { 37: { ID: 37, REF: 'AGA', NAME: 'Agadir', 'DELIVERED-PRICE': 35, 'RETURNED-PRICE': 0, 'REFUSED-PRICE': 10 },
  2174: { ID: 2174, REF: 'CCV', NAME: 'Casablanca – Centre Ville', 'DELIVERED-PRICE': 20, 'RETURNED-PRICE': 0, 'REFUSED-PRICE': 10 } }, DEBUG: {} };
async function fakeFetch(url, init = {}) {
  const u = String(url);
  const reply = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.endsWith('/cities')) return reply(cityList);
  const m = u.match(/\/customers\/([^/]+)\/([^/]+)\/(.+)$/);
  const body = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : (init.body ? JSON.parse(init.body) : null);
  calls.push({ path: m && m[3], customer: m && decodeURIComponent(m[1]), key: m && decodeURIComponent(m[2]), body });
  if (!ozon.keyOk || (m && decodeURIComponent(m[2]) !== KEY)) return reply({ CHECK_API: { RESULT: 'ERROR', MESSAGE: 'Please verify your API Key' } });
  const ok = { CHECK_API: { RESULT: 'SUCCESS' } };
  switch (m[3]) {
    case 'add-parcel':
      if (ozon.refuseAdd) return reply({ ...ok, 'ADD-PARCEL': { RESULT: 'ERROR', MESSAGE: ozon.refuseAdd } });
      return reply({ ...ok, 'ADD-PARCEL': { RESULT: 'SUCCESS', 'NEW-PARCEL': { 'TRACKING-NUMBER': 'OZE' + String(ozon.nextTracking++).padStart(6, '0'),
        RECEIVER: body['parcel-receiver'], 'CITY-NAME': 'Agadir', PRICE: body['parcel-price'], 'DELIVERED-PRICE': '35', 'RETURNED-PRICE': '0', 'REFUSED-PRICE': '10' } } });
    case 'tracking': {
      const asked = Array.isArray(body['tracking-number']) ? body['tracking-number'] : [body['tracking-number']];
      const out = {};
      asked.forEach((t) => { if (ozon.status[t]) out[t] = { RESULT: 'SUCCESS', LAST_TRACKING: { STATUT: ozon.status[t], TIME_STR: '2026-10-30 10:00:00' } }; });
      return reply({ ...ok, TRACKING: out });
    }
    case 'add-delivery-note': return reply({ ...ok, 'ADD-BL': { RESULT: 'SUCCESS', NEW: { REF: 'BL261030001' } } });
    case 'add-parcel-to-delivery-note': return reply({ ...ok, 'ADD-PARCEL-TO-BL': { RESULT: 'SUCCESS' } });
    case 'save-delivery-note': return reply({ ...ok, 'SAVE-BL': { RESULT: 'SUCCESS' } });
    default: return reply({ ...ok });
  }
}
const env = { DB, AUTH_SECRET: SECRET, __ozonFetch: fakeFetch };

const now = Date.now();
for (const [m, acc] of [[MERCHANT, 'acc-ozon-owner'], [OTHER, 'acc-ozon-other']]) {
  sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES (?, ?, 'TEST KIWI', 's', 'h', ?, 'active')`).run(acc, acc + '@example.test', now);
  sqlite.prepare(`INSERT INTO merchant_config (merchant, account_id, features, name, type, status, till_epoch, updated_ts) VALUES (?, ?, '{}', 'TEST KIWI', 'boutique', 'active', 0, ?)`).run(m, acc, now);
}
const sale = (id, cents, ts, deposit = 0) => {
  const parts = deposit ? [{ method: 'cash', amountCents: deposit }, { method: 'delivery', amountCents: cents }] : [{ method: 'delivery', amountCents: cents }];
  sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, payment_parts, label, ref, ts, lines, channel)
    VALUES (?, ?, ?, ?, ?, ?, 'TEST KIWI robe', ?, ?, ?, 'delivery')`).run(id, MERCHANT, Math.round(deposit / 100), deposit, deposit ? 'split' : 'delivery',
    JSON.stringify(parts), id.toUpperCase(), ts, JSON.stringify([{ n: 'Robe', q: 1, t: (cents + deposit) / 100 }]));
  sqlite.prepare(`INSERT INTO sale_receipts (merchant, sale_id, gross_ticket_cents, consigned_cents, created_ts) VALUES (?, ?, ?, 0, ?)`).run(MERCHANT, id, cents + deposit, ts);
};
sale('dlv-1', 45000, now - 3600e3);
sale('dlv-2', 25000, now - 1800e3, 10000);
sale('dlv-old', 30000, now - 20 * 86400e3);
sale('dlv-fee', 85000, now - 600e3);
sale('sale-ref-fdbc450d-945e-a96b-4b8b-b947-5f02f05190ed', 85000, now - 300e3);

const owner = `${SESS_COOKIE}=${await makeSession('acc-ozon-owner', SECRET)}`;
const stranger = `${SESS_COOKIE}=${await makeSession('acc-ozon-other', SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
const req = (path, method, cookie, body) => new Request('https://kiwi.test' + path, {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const call = async (mod, fn, path, method, cookie, body) => { const r = await mod[fn]({ request: req(path, method, cookie, body), env }); return { status: r.status, body: await r.json() }; };

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e && e.message).split('\n').slice(0, 5).join(' ')}`); }
}
const collections = (saleId) => sqlite.prepare('SELECT * FROM delivery_collections WHERE merchant = ? AND sale_id = ?').all(MERCHANT, saleId);

console.log('ozon-express');
await ok('readStatus: « Payé » counts, « Livré » alone does not, returns and refusals are told apart', () => {
  assert.equal(ozonStatusOf('Payé'), 'paid');
  assert.equal(ozonStatusOf('Livré et payé'), 'paid');
  assert.equal(ozonStatusOf('Livré'), 'delivered');
  assert.equal(ozonStatusOf('Livré non payé'), 'delivered');
  assert.equal(ozonStatusOf('Non livré'), 'in_transit');
  assert.equal(ozonStatusOf('Retourné'), 'returned');
  assert.equal(ozonStatusOf('Refusé'), 'refused');
  assert.equal(ozonStatusOf('Annulé'), 'cancelled');
  assert.equal(ozonStatusOf('En cours de livraison'), 'in_transit');
  /* Money never enters on a word that denies it (security review, 30 Oct 2026). */
  for (const label of ['Livré, pas encore payé', 'Livré en attente de paiement', 'Livré impayé']) assert.equal(ozonStatusOf(label), 'delivered', label);
  for (const label of ['Impayé', 'Unpaid', 'not paid', 'Non réglé']) assert.notEqual(ozonStatusOf(label), 'paid', label);
  assert.equal(ozonStatusOf('Réglé'), 'paid');
});

await ok('the till and a stranger cannot connect an account; a refused key is not stored', async () => {
  assert.equal((await call(account, 'onRequestPost', '/api/ozon/account', 'POST', till, { merchant: MERCHANT, customerId: '12345', apiKey: KEY })).status, 403);
  assert.equal((await call(account, 'onRequestPost', '/api/ozon/account', 'POST', stranger, { merchant: MERCHANT, customerId: '12345', apiKey: KEY })).status, 403);
  const bad = await call(account, 'onRequestPost', '/api/ozon/account', 'POST', owner, { merchant: MERCHANT, customerId: '12345', apiKey: 'wrong-key-000000' });
  assert.equal(bad.status, 400); assert.equal(bad.body.error, 'ozon-key-refused');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ozon_accounts').get().n, 0);
});

await ok('the owner connects; the key is stored encrypted and never comes back', async () => {
  const r = await call(account, 'onRequestPost', '/api/ozon/account', 'POST', owner, { merchant: MERCHANT, customerId: '12345', apiKey: KEY });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.connected, true); assert.equal(r.body.customerTail, '345'); assert.equal(r.body.pickupMode, 0);
  const row = sqlite.prepare('SELECT * FROM ozon_accounts WHERE merchant = ?').get(MERCHANT);
  assert.ok(!JSON.stringify(row).includes(KEY), 'key not stored in clear');
  assert.match(row.api_key_enc, /^v1\./);
  const seen = await call(account, 'onRequestGet', `/api/ozon/account?merchant=${MERCHANT}`, 'GET', till);
  assert.equal(seen.status, 200); assert.equal(seen.body.connected, true);
  assert.ok(!JSON.stringify(seen.body).includes(KEY) && !JSON.stringify(seen.body).includes('12345'));
});

let first;
await ok('the till sends a delivery sale: price is what is owed, Ozon picks up at the shop', async () => {
  const r = await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-2', receiver: 'Client Test',
    phone: '06 12 34 56 78', cityId: 37, address: '1 rue Test', priceCents: 1, open: 2, fragile: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  first = r.body.parcel;
  assert.match(first.tracking, /^OZE/);
  assert.equal(first.priceCents, 25000, 'the tablet\'s price is ignored: the owed part of the sale is sent');
  const add = calls.filter((c) => c.path === 'add-parcel').pop();
  assert.equal(add.body['parcel-price'], '250'); assert.equal(add.body['parcel-stock'], '0');
  assert.equal(add.body['parcel-open'], '2'); assert.equal(add.body['parcel-fragile'], '1'); assert.equal(add.body['parcel-phone'], '0612345678');
  assert.equal(first.fees.deliveredCents, 3500);
});

await ok('sending the same sale again returns the same parcel; Ozon is not called twice', async () => {
  const before = calls.filter((c) => c.path === 'add-parcel').length;
  const r = await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', owner, { merchant: MERCHANT, saleId: 'dlv-2', receiver: 'X', phone: '0612345678', cityId: 37, address: 'y' });
  assert.equal(r.body.already, true); assert.equal(r.body.parcel.tracking, first.tracking);
  assert.equal(calls.filter((c) => c.path === 'add-parcel').length, before);
});

await ok('two devices sending one sale at once create one parcel', async () => {
  const send = () => call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-1', receiver: 'Client Deux', phone: '0700000000', cityId: 2174, address: 'Maarif' });
  const [a, b] = await Promise.all([send(), send()]);
  const trackings = new Set([a, b].filter((x) => x.body.parcel).map((x) => x.body.parcel.tracking));
  assert.equal(trackings.size, 1, JSON.stringify([a.body, b.body]));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ozon_parcels WHERE sale_id = 'dlv-1'").get().n, 1);
});

await ok('an Ozon refusal frees the sale and says why; bad input never reaches Ozon', async () => {
  ozon.refuseAdd = 'Ville invalide';
  const r = await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-old', receiver: 'Z', phone: '0612345678', cityId: 37, address: 'a' });
  assert.equal(r.status, 422); assert.equal(r.body.message, 'Ville invalide');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ozon_parcels WHERE sale_id = 'dlv-old'").get().n, 0);
  ozon.refuseAdd = '';
  const before = calls.length;
  assert.equal((await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-old', receiver: 'Z', phone: '12', cityId: 37, address: 'a' })).body.error, 'bad-phone');
  assert.equal((await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'cash-x', receiver: 'Z', phone: '0612345678', cityId: 37, address: 'a' })).body.error, 'not-a-delivery');
  assert.equal(calls.length, before);
  assert.equal((await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', stranger, { merchant: MERCHANT, saleId: 'dlv-old' })).status, 403);
});

await ok('« Livré » alone writes nothing; « Payé » writes one collection for what is owed; a second refresh writes nothing', async () => {
  ozon.status[first.tracking] = 'Livré';
  let r = await call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}&force=1`, 'GET', till);
  assert.equal(r.body.parcels.find((p) => p.tracking === first.tracking).status, 'delivered');
  assert.equal(collections('dlv-2').length, 0);
  ozon.status[first.tracking] = 'Payé';
  /* The revenue write fails once: the parcel is not marked as handled, so the
     next refresh collects it (security review, 30 Oct 2026). */
  DB.failBatch = 1;
  r = await call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}&force=1`, 'GET', till);
  assert.equal(r.body.refreshed.paid, 0);
  assert.equal(collections('dlv-2').length, 0);
  assert.equal(sqlite.prepare('SELECT paid_ts FROM ozon_parcels WHERE tracking = ?').get(first.tracking).paid_ts, 0, 'retried next time');
  r = await call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}&force=1`, 'GET', till);
  assert.equal(r.body.refreshed.paid, 1);
  const got = collections('dlv-2');
  assert.equal(got.length, 1); assert.equal(got[0].amount_cents, 25000); assert.equal(got[0].collection_sale_id, 'dlv-ozon-dlv-2');
  assert.equal(sqlite.prepare("SELECT amount_cents FROM sales WHERE id = 'dlv-ozon-dlv-2'").get().amount_cents, 25000, 'one revenue line, what was owed');
  await call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}&force=1`, 'GET', till);
  assert.equal(collections('dlv-2').length, 1);
});

await ok('« Retourné » moves no money: the order waits for a manager in Livraisons', async () => {
  const t = sqlite.prepare("SELECT tracking FROM ozon_parcels WHERE sale_id = 'dlv-1'").get().tracking;
  ozon.status[t] = 'Retourné';
  const r = await call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}&force=1`, 'GET', till);
  assert.equal(r.body.parcels.find((p) => p.tracking === t).status, 'returned');
  assert.equal(collections('dlv-1').length, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE sale_id = 'dlv-1'").get().n, 0, 'no return recorded on its own');
});

await ok('an Ozon parcel is out of the 15-day auto-confirm; a plain delivery still gets it', async () => {
  sqlite.prepare("UPDATE sales SET ts = ? WHERE id = 'dlv-1'").run(now - 20 * 86400e3);
  const r = await receivablesGet({ request: req(`/api/receivables?merchant=${MERCHANT}`, 'GET', owner), env: { ...env, DELIVERY_AUTO_FROM_TS: 1 } });
  assert.equal(r.status, 200);
  assert.equal(collections('dlv-1').length, 0, 'Ozon parcel waits for Ozon');
  assert.equal(collections('dlv-old').length, 1, 'plain delivery confirmed at 15 days');
});

await ok('a delivery note runs Ozon\'s three steps on open parcels and marks them', async () => {
  sqlite.prepare("INSERT INTO ozon_parcels (merchant, tracking, sale_id, city_id, price_cents, status, created_ts) VALUES (?, 'OZE-OPEN', 'dlv-x', 37, 100, 'pending', ?)").run(MERCHANT, now);
  const r = await call(notes, 'onRequestPost', '/api/ozon/notes', 'POST', till, { merchant: MERCHANT });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ref, 'BL261030001'); assert.equal(r.body.parcels, 1);
  assert.match(r.body.pdf.labels10x10, /pdf-delivery-note-tickets-4-4\?dn-ref=BL261030001$/);
  const add = calls.filter((c) => c.path === 'add-parcel-to-delivery-note').pop();
  assert.equal(add.body.Ref, 'BL261030001'); assert.equal(add.body['Codes[0]'], 'OZE-OPEN');
  assert.equal(sqlite.prepare("SELECT bl_ref FROM ozon_parcels WHERE tracking = 'OZE-OPEN'").get().bl_ref, 'BL261030001');
  assert.equal((await call(notes, 'onRequestPost', '/api/ozon/notes', 'POST', till, { merchant: MERCHANT })).body.error, 'no-parcels');
});

await ok('the customer pays delivery: Ozon collects price + fee, revenue on « Payé » is the price only', async () => {
  const r = await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-fee', receiver: 'Client Frais',
    phone: '0612345678', cityId: 37, address: '2 rue Test', feeOnCustomer: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const add = calls.filter((c) => c.path === 'add-parcel').pop();
  assert.equal(add.body['parcel-price'], '900', 'the courier collects 850 + 50, whatever the city');
  assert.equal(r.body.parcel.priceCents, 90000);
  ozon.status[r.body.parcel.tracking] = 'Payé';
  const t = await call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}&force=1`, 'GET', till);
  assert.equal(t.body.refreshed.paid, 1);
  const got = collections('dlv-fee');
  assert.equal(got.length, 1); assert.equal(got[0].amount_cents, 85000, 'the fee is Ozon\'s, never counted as a sale');
});

await ok('the till\'s own sale id (sale-<uuid>) finds the row the server stored as sale-ref-…', async () => {
  const r = await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'sale-1d2c3b4a-945e-a96b-4b8b-b947-5f02f05190ed',
    receiver: 'Client Id', phone: '0612345678', cityId: 37, address: '3 rue Test', feeOnCustomer: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ozon_parcels WHERE sale_id = 'sale-ref-fdbc450d-945e-a96b-4b8b-b947-5f02f05190ed'").get().n, 1);
});

/* Santos, 30 Oct 2026: an Instagram or WhatsApp order is typed once at the
   till (name, phone, Ozon city, address) and the parcel leaves by itself. */
const tillSale = async (id, card) => {
  const body = { id, merchant: MERCHANT, amount: 0, amountCents: 0, method: 'delivery', channel: 'delivery', settlementKind: 'receivable',
    paymentParts: [{ method: 'delivery', amountCents: 20000 }], ticketAmountCents: 20000, label: 'Ensemble', ref: id.toUpperCase(), ts: Date.now(),
    lines: [{ itemId: 'prod_1', variantId: 'prod_1:TU:noir', name: 'Ensemble TU', qty: 1, total: 200, cat: 'Ensembles', unit: 'piece', kind: 'product' }],
    deliveryCard: card };
  const res = await salePost({ request: new Request('https://kiwi.test/api/sale', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: till }, body: JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json() };
};
await ok('a delivery sale whose card names an Ozon city creates its parcel by itself, 50 MAD on top', async () => {
  const before = calls.filter((c) => c.path === 'add-parcel').length;
  const r = await tillSale('dlv-auto-1', { name: 'Imane Instagram', phone: '06 12 34 56 78', city: 'Agadir', cityId: 37, address: 'Hay Salam, rue 4' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = sqlite.prepare("SELECT * FROM ozon_parcels WHERE merchant = ? AND sale_id = 'dlv-auto-1'").get(MERCHANT);
  assert.ok(row && !String(row.tracking).startsWith('pending:'), 'parcel created');
  assert.equal(row.receiver, 'Imane Instagram');
  const sent = calls.filter((c) => c.path === 'add-parcel');
  assert.equal(sent.length, before + 1);
  assert.equal(sent[sent.length - 1].body['parcel-price'], '250', 'the courier collects 200 + 50');
  await tillSale('dlv-auto-1', { name: 'Imane Instagram', phone: '0612345678', city: 'Agadir', cityId: 37, address: 'Hay Salam, rue 4' });
  assert.equal(calls.filter((c) => c.path === 'add-parcel').length, before + 1, 'a resent ticket never makes a second parcel');
  /* « Imprimer l'étiquette » : un bon pour ce seul colis, puis son PDF public. */
  const label = await call(notes, 'onRequestPost', '/api/ozon/notes', 'POST', till, { merchant: MERCHANT, trackings: [row.tracking] });
  assert.equal(label.status, 200, JSON.stringify(label.body));
  assert.equal(label.body.parcels, 1, 'the label note holds only that parcel');
  assert.ok(/pdf-delivery-note-tickets-4-4\?dn-ref=/.test(label.body.pdf.labels10x10));
  assert.equal(sqlite.prepare("SELECT bl_ref FROM ozon_parcels WHERE merchant = ? AND sale_id = 'dlv-auto-1'").get(MERCHANT).bl_ref, label.body.ref);
});
await ok('a card without an Ozon city creates no parcel; a refused one is shown on the delivery', async () => {
  const before = calls.filter((c) => c.path === 'add-parcel').length;
  await tillSale('dlv-auto-2', { name: 'Sans ville', phone: '0612345678', city: 'Agadir', address: 'Rue 1' });
  assert.equal(calls.filter((c) => c.path === 'add-parcel').length, before, 'no Ozon city, no parcel');
  ozon.refuseAdd = 'Adresse incomplète';
  await tillSale('dlv-auto-3', { name: 'Refusée', phone: '0612345678', city: 'Agadir', cityId: 37, address: 'x' });
  ozon.refuseAdd = '';
  const list = await (await receivablesGet({ request: new Request(`https://kiwi.test/api/receivables?merchant=${MERCHANT}`, { headers: { Cookie: till } }), env })).json();
  const d = (list.open || []).find((x) => x.saleId === 'dlv-auto-3');
  assert.ok(d && d.ozonError && d.ozonError.error === 'ozon-refused', JSON.stringify(d && d.ozonError));
  assert.ok(!(list.open || []).find((x) => x.saleId === 'dlv-auto-1').ozonError, 'a created parcel carries no error');
});

await ok('the key never appears in any reply or stored row, and every Ozon call used it', async () => {
  const replies = JSON.stringify([
    (await call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}`, 'GET', till)).body,
    (await call(notes, 'onRequestGet', `/api/ozon/notes?merchant=${MERCHANT}`, 'GET', till)).body,
    (await call(account, 'onRequestGet', `/api/ozon/account?merchant=${MERCHANT}`, 'GET', owner)).body,
  ]);
  assert.ok(!replies.includes(KEY));
  const dump = JSON.stringify(sqlite.prepare('SELECT * FROM ozon_parcels').all()) + JSON.stringify(sqlite.prepare('SELECT * FROM ozon_delivery_notes').all());
  assert.ok(!dump.includes(KEY));
  assert.ok(calls.filter((c) => c.path !== undefined).every((c) => c.customer === '12345'));
});

await ok('disconnecting stops new parcels but keeps the history', async () => {
  assert.equal((await call(account, 'onRequestDelete', `/api/ozon/account?merchant=${MERCHANT}`, 'DELETE', till)).status, 403);
  assert.equal((await call(account, 'onRequestDelete', `/api/ozon/account?merchant=${MERCHANT}`, 'DELETE', owner)).status, 200);
  assert.equal((await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-old', receiver: 'Z', phone: '0612345678', cityId: 37, address: 'a' })).body.error, 'not-connected');
  assert.ok(sqlite.prepare('SELECT COUNT(*) AS n FROM ozon_parcels WHERE merchant = ?').get(MERCHANT).n >= 2);
});

__resetCities();
console.log(`\nozon-express: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
