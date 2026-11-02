#!/usr/bin/env node
/* Delivery exchanges through Ozon (functions/api/ozon/exchange.js), on the
 * real schema, with Ozon replaced by a recorder.
 *
 *   node tools/ozon-exchange-test.mjs
 *
 * Santos, 2 Nov 2026 (voice notes): a delivery customer, usually already paid
 * to the courier, wants another size or colour. « Échange » picks the
 * replacement and sends it again; Ozon delivers it, takes the old piece back,
 * and does not collect the order total again. Held here:
 *   · a size or colour swap of the same article collects nothing but the
 *     delivery fee, even when the ticket carried a discount;
 *   · a dearer article collects the difference; « Payé » writes it into
 *     revenue once; a cheaper one collects nothing (the shop keeps it);
 *   · the parcel is an Ozon « échange » (parcel-replace = 1);
 *   · one exchange per id: a replay sends nothing; a swapped unit can be
 *     neither swapped again nor returned on the original line, even by two
 *     tablets at the same instant (the earliest trace keeps it);
 *   · prices and values come from the server (catalogue, frozen basket),
 *     never the tablet; stock and unknown variants are refused before Ozon;
 *   · Ozon refusing leaves no sale and no trace;
 *   · the recipient comes from the original parcel or the delivery card. */
import assert from 'node:assert/strict';
import coreTestSource from './core-test-source.cjs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as account from '../functions/api/ozon/account.js';
import * as parcels from '../functions/api/ozon/parcels.js';
import * as exchange from '../functions/api/ozon/exchange.js';
import * as receivables from '../functions/api/receivables.js';
import { __resetCities } from '../functions/api/ozon/_lib.js';

const MERCHANT = 'ozon-xch-shop', OTHER = 'ozon-xch-other', SECRET = 'ozon-exchange-test-secret-0123456789';
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
  batch(list) { sqlite.exec('BEGIN IMMEDIATE'); try { const o = list.map((s) => s.run()); sqlite.exec('COMMIT'); return o; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};

const calls = [];
const ozon = { status: {}, nextTracking: 1, refuseAdd: '' };
const cityList = { CITIES: { 37: { ID: 37, REF: 'AGA', NAME: 'Agadir', 'DELIVERED-PRICE': 35, 'RETURNED-PRICE': 0, 'REFUSED-PRICE': 10 },
  1790: { ID: 1790, REF: 'TNT', NAME: 'Tan-Tan', 'DELIVERED-PRICE': 40, 'RETURNED-PRICE': 0, 'REFUSED-PRICE': 10 } }, DEBUG: {} };
async function fakeFetch(url, init = {}) {
  const u = String(url);
  const reply = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.endsWith('/cities')) return reply(cityList);
  const m = u.match(/\/customers\/([^/]+)\/([^/]+)\/(.+)$/);
  const body = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : (init.body ? JSON.parse(init.body) : null);
  calls.push({ path: m && m[3], body });
  const ok = { CHECK_API: { RESULT: 'SUCCESS' } };
  if (m && decodeURIComponent(m[2]) !== KEY) return reply({ CHECK_API: { RESULT: 'ERROR', MESSAGE: 'Please verify your API Key' } });
  switch (m && m[3]) {
    case 'add-parcel':
      if (ozon.refuseAdd) return reply({ ...ok, 'ADD-PARCEL': { RESULT: 'ERROR', MESSAGE: ozon.refuseAdd } });
      return reply({ ...ok, 'ADD-PARCEL': { RESULT: 'SUCCESS', 'NEW-PARCEL': { 'TRACKING-NUMBER': 'OZX' + String(ozon.nextTracking++).padStart(6, '0'),
        RECEIVER: body['parcel-receiver'], 'CITY-NAME': 'Agadir', PRICE: body['parcel-price'], 'DELIVERED-PRICE': '35', 'RETURNED-PRICE': '0', 'REFUSED-PRICE': '10' } } });
    case 'tracking': {
      const asked = Array.isArray(body['tracking-number']) ? body['tracking-number'] : [body['tracking-number']];
      const out = {};
      asked.forEach((t) => { if (ozon.status[t]) out[t] = { RESULT: 'SUCCESS', LAST_TRACKING: { STATUT: ozon.status[t], TIME_STR: '2026-11-02 10:00:00' } }; });
      return reply({ ...ok, TRACKING: out });
    }
    default: return reply({ ...ok });
  }
}
const env = { DB, AUTH_SECRET: SECRET, __ozonFetch: fakeFetch };
__resetCities();

const now = Date.now();
for (const [m, acc] of [[MERCHANT, 'acc-xch-owner'], [OTHER, 'acc-xch-other']]) {
  sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES (?, ?, 'TEST KIWI', 's', 'h', ?, 'active')`).run(acc, acc + '@example.test', now);
  sqlite.prepare(`INSERT INTO merchant_config (merchant, account_id, features, name, type, status, till_epoch, updated_ts) VALUES (?, ?, '{}', 'TEST KIWI', 'boutique', 'active', 0, ?)`).run(m, acc, now);
}
/* The shop's catalogue: a dress at 450 in black and grey, S/M/L, and a shirt at 600. */
const variant = (id, pid, size, color, stock) => ({ id, productId: pid, size, colorId: color, colorFamily: color, stock, base: stock, baseAt: now - 86400e3 });
sqlite.prepare('INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)').run(MERCHANT, JSON.stringify({ v: 1, categories: [], seq: 0, removed: {}, moves: [],
  products: [{ id: 'p-robe', name: 'Robe', priceMAD: 450 }, { id: 'p-chem', name: 'Chemise', priceMAD: 600 }, { id: 'p-foul', name: 'Foulard', priceMAD: 120 }],
  variants: [variant('v1', 'p-robe', 'S', 'noir', 2), variant('v2', 'p-robe', 'M', 'noir', 1), variant('v3', 'p-robe', 'M', 'gris', 0),
    variant('v4', 'p-chem', 'L', 'blanc', 3), variant('v5', 'p-foul', 'U', 'rouge', 5)] }), now);

/* A delivery sale: the till writes it at 0 MAD, the whole ticket to collect. */
const sale = (id, lines, ts = now - 3600e3) => {
  const cents = lines.reduce((n, l) => n + Math.round(l.t * 100), 0);
  sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, payment_parts, label, ref, ts, lines, channel)
    VALUES (?, ?, 0, 0, 'delivery', ?, 'TEST KIWI', ?, ?, ?, 'delivery')`).run(id, MERCHANT, JSON.stringify([{ method: 'delivery', amountCents: cents }]), id.toUpperCase(), ts, JSON.stringify(lines));
  sqlite.prepare(`INSERT INTO sale_receipts (merchant, sale_id, gross_ticket_cents, consigned_cents, created_ts) VALUES (?, ?, ?, 0, ?)`).run(MERCHANT, id, cents, ts);
};
/* A dress M bought at 405 (10 % off), and a two-piece order. */
sale('dlv-a', [{ n: 'Robe M', q: 1, t: 405, v: 'p-robe:M:noir' }]);
sale('dlv-b', [{ n: 'Robe S', q: 2, t: 900, v: 'p-robe:S:noir' }]);
sale('dlv-c', [{ n: 'Robe M', q: 1, t: 450, v: 'p-robe:M:noir' }]);
sale('dlv-card', [{ n: 'Robe S', q: 1, t: 450, v: 'p-robe:S:noir' }]);
sqlite.prepare(`INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
  VALUES (?, 'dlv-card', 'delivery-card', '', '', '', '', 0, 0, 'delivery', '', 0, ?, ?)`).run(MERCHANT,
  JSON.stringify({ name: 'Cliente Fiche', phone: '0612345678', city: 'Tan-Tan', address: '2 rue Fiche', cityId: 1790 }), now);

const owner = `${SESS_COOKIE}=${await makeSession('acc-xch-owner', SECRET)}`;
const stranger = `${SESS_COOKIE}=${await makeSession('acc-xch-other', SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
const req = (path, method, cookie, body) => new Request('https://kiwi.test' + path, {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const call = async (mod, fn, path, method, cookie, body) => { const r = await mod[fn]({ request: req(path, method, cookie, body), env }); return { status: r.status, body: await r.json() }; };
const swap = (body, cookie = till) => call(exchange, 'onRequestPost', '/api/ozon/exchange', 'POST', cookie, { merchant: MERCHANT, by: { id: 'm1', name: 'Responsable' }, ...body });
const lastAdd = () => calls.filter((c) => c.path === 'add-parcel').pop();
const addCount = () => calls.filter((c) => c.path === 'add-parcel').length;
const refresh = () => call(parcels, 'onRequestGet', `/api/ozon/parcels?merchant=${MERCHANT}&force=1`, 'GET', till);
const listing = async () => (await call(receivables, 'onRequestGet', `/api/receivables?lines=1&merchant=${MERCHANT}`, 'GET', till)).body;
const collections = (saleId) => sqlite.prepare('SELECT * FROM delivery_collections WHERE merchant = ? AND sale_id = ?').all(MERCHANT, saleId);

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e && e.stack || e).split('\n').slice(0, 6).join(' ')}`); }
}

console.log('ozon-exchange');
assert.equal((await call(account, 'onRequestPost', '/api/ozon/account', 'POST', owner, { merchant: MERCHANT, customerId: '12345', apiKey: KEY })).status, 200);
const sent = await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-a', receiver: 'Cliente A',
  phone: '0611223344', cityId: 37, address: '1 rue Test', feeOnCustomer: true });
assert.equal(sent.status, 200, JSON.stringify(sent.body));
for (const id of ['dlv-b', 'dlv-c']) {
  assert.equal((await call(parcels, 'onRequestPost', '/api/ozon/parcels', 'POST', till, { merchant: MERCHANT, saleId: id, receiver: 'Cliente ' + id,
    phone: '0611223344', cityId: 37, address: '1 rue Test' })).status, 200);
}

await ok('the customer paid, then swaps M for S: Ozon collects the delivery fee only, an « échange » parcel', async () => {
  ozon.status[sent.body.parcel.tracking] = 'Payé';
  await refresh();
  assert.equal(collections('dlv-a').length, 1, 'the order was paid by Ozon first');
  const before = addCount();
  const r = await swap({ saleId: 'dlv-a', id: 'xch-aaaaaaaa01', feeOnCustomer: true, swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(addCount(), before + 1);
  const add = lastAdd().body;
  assert.equal(add['parcel-replace'], '1', 'an Ozon exchange parcel');
  assert.equal(add['parcel-price'], '50', 'the 405 already paid is not collected again; same article, discount kept');
  assert.equal(add['parcel-receiver'], 'Cliente A', 'recipient from the original parcel');
  assert.match(add['parcel-note'], /reprendre Robe M/);
  assert.equal(r.body.exchange.diffCents, 0); assert.equal(r.body.exchange.codCents, 5000); assert.equal(r.body.exchange.creditCents, 0);
  assert.match(r.body.parcel.tracking, /^OZX/);
  const row = sqlite.prepare('SELECT * FROM sales WHERE id = ?').get('xch-aaaaaaaa01');
  assert.equal(row.method, 'delivery'); assert.equal(row.amount_cents, 0);
  assert.deepEqual(JSON.parse(row.lines).map((l) => [l.n, l.q, l.t, l.v]), [['Robe S', 1, 0, 'p-robe:S:noir']]);
});

await ok('the list shows the swap on the original order and closes its units', async () => {
  const data = await listing();
  const a = data.collected.find((x) => x.saleId === 'dlv-a');
  assert.ok(a, 'the paid order stays in Confirmées');
  assert.equal(a.exchanges.length, 1);
  assert.deepEqual(a.exchanges[0].swaps, [{ i: 0, q: 1, from: 'Robe M', to: 'Robe S' }]);
  assert.equal(a.lines[0].exchangedQty, 1);
  assert.ok(!data.open.some((x) => x.saleId === 'xch-aaaaaaaa01'), 'nothing to collect for the shop: not an open delivery');
});

await ok('replaying the same exchange sends nothing; the swapped unit cannot be swapped again', async () => {
  const before = addCount();
  const again = await swap({ saleId: 'dlv-a', id: 'xch-aaaaaaaa01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] });
  assert.equal(again.status, 200); assert.equal(again.body.already, true); assert.equal(again.body.parcel.tracking, sqlite.prepare(`SELECT tracking FROM ozon_parcels WHERE sale_id = 'xch-aaaaaaaa01'`).get().tracking);
  const twice = await swap({ saleId: 'dlv-a', id: 'xch-aaaaaaaa02', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] });
  assert.equal(twice.status, 409); assert.equal(twice.body.error, 'exceeds-line');
  assert.equal(addCount(), before, 'Ozon never called');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM sale_audit WHERE action = 'delivery-exchange'`).get().n, 1);
});

let dearer;
await ok('a dearer article collects the difference, and « Payé » writes it into revenue once', async () => {
  const r = await swap({ saleId: 'dlv-c', id: 'xch-cccccccc01', feeOnCustomer: false, swaps: [{ i: 0, q: 1, pid: 'p-chem', size: 'L', color: 'blanc', price: 1 }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(lastAdd().body['parcel-price'], '150', '600 − 450, the tablet\'s price ignored');
  assert.equal(r.body.exchange.diffCents, 15000);
  dearer = r.body.parcel.tracking;
  const open = (await listing()).open.find((x) => x.saleId === 'xch-cccccccc01');
  assert.ok(open, 'the difference waits like any delivery'); assert.equal(open.dueCents, 15000);
  ozon.status[dearer] = 'Payé';
  await refresh(); await refresh();
  const got = collections('xch-cccccccc01');
  assert.equal(got.length, 1); assert.equal(got[0].amount_cents, 15000);
  const s = sqlite.prepare('SELECT amount_cents, lines FROM sales WHERE id = ?').get(got[0].collection_sale_id);
  assert.equal(s.amount_cents, 15000);
  assert.deepEqual(JSON.parse(s.lines).map((l) => [l.n, l.t]), [['Chemise L', 150]], 'the shirt counts once, at the difference');
});

await ok('a swapped unit cannot be returned on the original line', async () => {
  const r = await call(receivables, 'onRequestPost', '/api/receivables', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-c', action: 'return', id: 'ret-xch-c-0001', lines: [{ i: 0, q: 1 }] });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'exceeds-line');
});

await ok('one of two pieces swapped for a cheaper article: nothing to collect, the shop keeps the rest', async () => {
  const r = await swap({ saleId: 'dlv-b', id: 'xch-bbbbbbbb01', feeOnCustomer: true, swaps: [{ i: 0, q: 1, pid: 'p-foul', size: 'U', color: 'rouge' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.exchange.diffCents, 0); assert.equal(r.body.exchange.creditCents, 33000, '450 back, 120 out');
  assert.equal(lastAdd().body['parcel-price'], '50');
  const b = (await listing()).open.find((x) => x.saleId === 'dlv-b');
  assert.equal(b.lines[0].exchangedQty, 1); assert.equal(b.dueCents, 90000, 'the order itself still owes its total');
  const ret = await call(receivables, 'onRequestPost', '/api/receivables', 'POST', till, { merchant: MERCHANT, saleId: 'dlv-b', action: 'return', id: 'ret-xch-b-0001', lines: [{ i: 0, q: 1 }] });
  assert.equal(ret.status, 200, 'the other piece can still come back'); assert.equal(ret.body.returnedCents, 45000);
});

await ok('stock, unknown articles and bad input are refused before Ozon', async () => {
  const before = addCount();
  let r = await swap({ saleId: 'dlv-card', id: 'xch-dddddddd01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'M', color: 'gris' }] });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'stock-insufficient');
  r = await swap({ saleId: 'dlv-card', id: 'xch-dddddddd01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'XL', color: 'noir' }] });
  assert.equal(r.body.error, 'unknown-variant');
  r = await swap({ saleId: 'dlv-card', id: 'xch-dddddddd01', swaps: [{ i: 3, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] });
  assert.equal(r.body.error, 'bad-swaps');
  r = await swap({ saleId: 'dlv-card', id: 'bad', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] });
  assert.equal(r.body.error, 'bad-id');
  r = await swap({ saleId: 'nope', id: 'xch-dddddddd01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] });
  assert.equal(r.status, 404);
  r = await swap({ saleId: 'dlv-card', id: 'xch-dddddddd01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] }, stranger);
  assert.equal(r.status, 403);
  assert.equal(addCount(), before);
});

await ok('Ozon refusing leaves no sale and no trace; the same exchange goes through once fixed', async () => {
  ozon.refuseAdd = 'Téléphone invalide';
  let r = await swap({ saleId: 'dlv-card', id: 'xch-eeeeeeee01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'M', color: 'noir' }] });
  assert.equal(r.status, 422); assert.equal(r.body.message, 'Téléphone invalide');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM sales WHERE id = 'xch-eeeeeeee01'`).get().n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM sale_audit WHERE action = 'delivery-exchange' AND note = 'xch-eeeeeeee01'`).get().n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ozon_parcels WHERE sale_id = 'xch-eeeeeeee01'`).get().n, 0);
  ozon.refuseAdd = '';
  r = await swap({ saleId: 'dlv-card', id: 'xch-eeeeeeee01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'M', color: 'noir' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const add = lastAdd().body;
  assert.equal(add['parcel-receiver'], 'Cliente Fiche', 'no Ozon parcel on that sale: the delivery card names the recipient');
  assert.equal(add['parcel-city'], '1790');
  assert.equal(add['parcel-price'], '0', 'same price, the shop offers the delivery: the courier collects nothing');
});

await ok('two tablets swap the same piece at the same instant: the first keeps it, the second sends nothing', async () => {
  sale('dlv-race', [{ n: 'Robe S', q: 1, t: 450, v: 'p-robe:S:noir' }]);
  sqlite.prepare(`INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
    VALUES (?, 'dlv-race', 'delivery-card', '', '', '', '', 0, 0, 'delivery', '', 0, ?, ?)`).run(MERCHANT,
    JSON.stringify({ name: 'Cliente Course', phone: '0612345678', city: 'Agadir', address: '3 rue Course', cityId: 37 }), now);
  /* The other tablet's exchange lands between this one's check and its write. */
  const batch = DB.batch;
  DB.batch = (list) => {
    DB.batch = batch;
    sqlite.prepare(`INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
      VALUES (?, 'dlv-race', 'delivery-exchange', 'customer-exchange', 'xch-other-tablet-01', '', '', 0, 45000, 'delivery', '', 0, ?, ?)`)
      .run(MERCHANT, JSON.stringify({ swaps: [{ i: 0, q: 1 }] }), Date.now() - 1);
    return batch(list);
  };
  const before = addCount();
  const r = await swap({ saleId: 'dlv-race', id: 'xch-race000001', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'M', color: 'noir' }] });
  DB.batch = batch;
  assert.equal(r.status, 409, JSON.stringify(r.body)); assert.equal(r.body.error, 'exceeds-line');
  assert.equal(addCount(), before, 'Ozon never called for the loser');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM sales WHERE id = 'xch-race000001'`).get().n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM sale_audit WHERE note = 'xch-race000001'`).get().n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM sale_audit WHERE note = 'xch-other-tablet-01'`).get().n, 1, 'the first one stays');
});

await ok('another shop\'s till cannot swap this shop\'s order', async () => {
  const other = `${TILL_COOKIE}=${await tillToken(SECRET, OTHER)}`;
  const r = await call(exchange, 'onRequestPost', '/api/ozon/exchange', 'POST', other, { merchant: MERCHANT, saleId: 'dlv-b', id: 'xch-ffffffff01', swaps: [{ i: 0, q: 1, pid: 'p-robe', size: 'S', color: 'noir' }] });
  assert.equal(r.status, 403);
});

console.log(`\nozon-exchange: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
