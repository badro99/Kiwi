#!/usr/bin/env node
/* Glovo · le connecteur de la caisse, prouvé sur le vrai schéma.
 *
 * Glovo ne construit rien côté caisse (ticket NFQC-5519, 19 nov. 2026) : il
 * POSTe chaque commande sur NOTRE webhook et attend que NOUS lui disions
 * « acceptée », « prête ». Ce fichier tient les deux sens :
 *   1. AUTH        le jeton partagé de Glovo, rien d'autre ; sans jeton configuré, 503
 *   2. MAGASIN     le store_id du corps choisit le commerçant, via glovo_stores ;
 *                  inconnu ou en pause, rien ne s'écrit
 *   3. TRADUCTION  prix en centimes, options et sous-produits, remise du
 *                  partenaire, adresse, code de retrait, retrait par le client
 *   4. IDEMPOTENCE Glovo rejoue jusqu'à 3 fois : un order_id = un ticket
 *   5. ANNULATION  la commande passe « rejetée », signée Glovo ; jamais celle d'un
 *                  autre magasin, jamais une commande encaissée
 *   6. RETOUR      accepter à la caisse appelle /accept avec l'heure promise,
 *                  « prête » appelle /ready_for_pickup, un retrait client
 *                  servi appelle /customer_picked_up ; une commande Kiwi n'appelle rien
 *   7. ROUTE       la file réelle (/api/order/queue, advanceOrder) déclenche l'appel
 *
 * Exemples de corps : ceux de la documentation Glovo
 * (api-docs.glovoapp.com/partners, « Order Dispatched Webhook »).
 *   node tools/glovo-channel-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestPost: dispatched } = await import('../functions/api/channel/glovo/dispatched.js');
const { onRequestPost: cancelled } = await import('../functions/api/channel/glovo/cancelled.js');
const { mapGlovoOrder, notifyGlovo, upsertGlovoStore } = await import('../functions/api/channel/glovo/_glovo.js');
const { advanceOrder } = await import('../functions/api/order/_queue-status.js');

/* ── D1 sur node:sqlite, schéma de production ─────────────────────────────── */
const SCHEMA = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const wrap = (sql) => {
    let args = [];
    const s = {
      sql,
      bind(...a) { args = a; return s; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const i = db.prepare(sql).run(...args); return { meta: { changes: Number(i.changes) } }; },
      _exec() {
        if (/\bRETURNING\b|^\s*SELECT/i.test(sql)) { const rows = db.prepare(sql).all(...args); return { results: rows, meta: { changes: rows.length } }; }
        const i = db.prepare(sql).run(...args); return { results: [], meta: { changes: Number(i.changes) } };
      },
    };
    return s;
  };
  return {
    raw: db,
    prepare: wrap,
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((st) => st._exec()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const TOKEN = 'glovo-shared-test-token-0123456789';
const NOW = Date.parse('2026-11-19T19:00:00Z');
const req = (body, auth = TOKEN) => new Request('https://kiwi-os.com/api/channel/glovo/dispatched', {
  method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth == null ? {} : { Authorization: auth }),
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const call = async (fn, env, body, auth) => { const r = await fn({ request: req(body, auth), env, waitUntil() {} }); return { status: r.status, body: await r.json().catch(() => null) }; };

/* Le corps d'exemple de la documentation, store_id remplacé par le nôtre. */
const SAMPLE = {
  order_id: '12345', store_id: 'kiwi-amira-cafe', order_time: '2026-11-19 19:00:00', estimated_pickup_time: '2026-11-19 19:20:00',
  utc_offset_minutes: '0', payment_method: 'DELAYED', currency: 'MAD', order_code: 'BA7DWBUL',
  allergy_info: 'I am allergic to tomato', special_requirements: 'Make sure there is no meat',
  estimated_total_price: 3080, delivery_fee: null, minimum_basket_surcharge: null, customer_cash_payment_amount: null,
  courier: { name: 'Flash', phone_number: '+212600000000' },
  customer: { name: 'Waldo', phone_number: 'N/A', hash: '1111' },
  products: [
    { id: 'pd1', purchased_product_id: 'A1', name: 'Burger', price: 1000, quantity: 2, attributes: [
      { id: 'at1', name: 'Extra meat', price: 300, quantity: 1 }, { id: 'at3', name: 'Tomato sauce', price: 0, quantity: 1 }] },
    { id: 'pd2', purchased_product_id: 'A2', name: 'Ice cream', price: 480, quantity: 1, attributes: [
      { id: 'at5', name: 'Vanilla', price: 0, quantity: 1 }] },
  ],
  delivery_address: { label: '123 Rue Fake, Casablanca', floor_number: '2', door_number: '4', additional_information: 'Porte rouge' },
  pick_up_code: '433', is_picked_up_by_customer: false, cutlery_requested: true,
  partner_discounts_products: 0, glovo_discounts_products: 500, partner_discounted_products_total: 3080, discounted_products_total: 2580,
};

let passed = 0;
const ok = async (label, run) => { await run(); passed++; console.log('  ✓ ' + label); };

async function freshEnv(extra = {}) {
  const DB = makeDB();
  await upsertGlovoStore({ DB }, { storeId: 'kiwi-amira-cafe', merchant: 'amira-cafe', prepMinutes: 15 }, NOW);
  await upsertGlovoStore({ DB }, { storeId: 'kiwi-rival', merchant: 'chez-rival', prepMinutes: 10 }, NOW);
  return Object.assign({ DB, GLOVO_TOKEN: TOKEN }, extra);
}
const orders = (env) => env.DB.raw.prepare('SELECT * FROM orders ORDER BY created_ts').all();

/* ── 3. Traduction (pure) ──────────────────────────────────────────────────── */
await ok('translation: unit price = product + its attributes, in MAD, options listed', () => {
  const m = mapGlovoOrder(SAMPLE);
  assert.equal(m.lines.length, 2);
  assert.deepEqual([m.lines[0].name, m.lines[0].qty, m.lines[0].unitPrice], ['Burger', 2, 13]);
  assert.equal(m.lines[0].options, 'Extra meat · Tomato sauce');
  assert.deepEqual([m.lines[1].name, m.lines[1].unitPrice, m.lines[1].options], ['Ice cream', 4.8, 'Vanilla']);
  assert.equal(m.total, 30.8);
  assert.equal(m.mode, 'delivery');
  assert.equal(m.ref, 'BA7DWBUL');
});
await ok('translation: the customer is the client, never the courier; « N/A » is no phone', () => {
  const m = mapGlovoOrder(SAMPLE);
  assert.equal(m.customer.name, 'Waldo');
  assert.equal(m.customer.phone, '');
  assert.match(m.customer.address, /123 Rue Fake, Casablanca/);
  assert.match(m.customer.address, /2/);
  assert.match(m.customer.address, /Porte rouge/);
  assert.match(m.customer.note, /I am allergic to tomato/);
  assert.match(m.customer.note, /Make sure there is no meat/);
  assert.match(m.customer.note, /433/);
  const { glovo, ...who } = m.customer;
  assert.doesNotMatch(JSON.stringify(who), /Flash/, 'the courier is never the customer (name, phone, address, note)');
  assert.equal(glovo.courier.name, 'Flash', 'the courier has his own place, read by the till card');
});
await ok('translation: a combo lists its sub-products, their paid extras count in the price', () => {
  const m = mapGlovoOrder(Object.assign({}, SAMPLE, { products: [{ id: 'pd3', name: 'Burger Combo!', price: 10000, quantity: 1,
    attributes: [{ id: 'at7', name: 'Very large!', price: 300, quantity: 1 }],
    sub_products: [{ id: 'sp1', name: 'Cheese Burger', price: 0, quantity: 1, attributes: [{ id: 'at8', name: 'Extra cheese', price: 100, quantity: 1 }] },
      { id: 'sp2', name: 'Fries', price: 0, quantity: 1, attributes: [] }] }], estimated_total_price: 10400, partner_discounted_products_total: 10400 }));
  assert.equal(m.lines[0].unitPrice, 104);
  assert.equal(m.lines[0].options, 'Very large! · Cheese Burger (Extra cheese) · Fries');
});
await ok('translation: a partner-funded discount lowers the ticket total, the gap is written on the ticket', () => {
  const m = mapGlovoOrder(Object.assign({}, SAMPLE, { partner_discounts_products: 1550, partner_discounted_products_total: 1530 }));
  assert.equal(m.total, 15.3);
  assert.match(m.customer.note, /-15\.50 MAD/);
});
await ok('translation: a customer pickup is a takeout, not a delivery', () => {
  assert.equal(mapGlovoOrder(Object.assign({}, SAMPLE, { is_picked_up_by_customer: true })).mode, 'takeout');
});

/* ── 1 · 2. Authentification et magasin ───────────────────────────────────── */
await ok('auth: no token, a wrong token, a Bearer-wrapped wrong token are all 401 and write nothing', async () => {
  const env = await freshEnv();
  for (const auth of [null, '', 'nope', 'Bearer nope', TOKEN + 'x']) {
    assert.equal((await call(dispatched, env, SAMPLE, auth)).status, 401, String(auth));
  }
  assert.equal(orders(env).length, 0);
});
await ok('auth: without GLOVO_TOKEN configured the webhook says 503, it never accepts an empty token', async () => {
  const env = await freshEnv({ GLOVO_TOKEN: '' });
  assert.equal((await call(dispatched, env, SAMPLE, '')).status, 503);
  assert.equal(orders(env).length, 0);
});
await ok('store: an unknown or paused store_id writes nothing', async () => {
  const env = await freshEnv();
  assert.equal((await call(dispatched, env, Object.assign({}, SAMPLE, { store_id: 'who-knows' }))).status, 404);
  await upsertGlovoStore(env, { storeId: 'kiwi-amira-cafe', merchant: 'amira-cafe', status: 'paused' }, NOW);
  assert.equal((await call(dispatched, env, SAMPLE)).status, 404);
  assert.equal(orders(env).length, 0);
});
await ok('store: the merchant comes from glovo_stores, never from the body', async () => {
  const env = await freshEnv();
  const r = await call(dispatched, env, Object.assign({}, SAMPLE, { merchant: 'chez-rival' }));
  assert.equal(r.status, 200);
  assert.equal(orders(env)[0].merchant, 'amira-cafe');
});

/* ── 4. Dépôt et idempotence ──────────────────────────────────────────────── */
await ok('dispatch: one pending Glovo delivery ticket, code BA7DWBUL, nothing auto-accepted', async () => {
  const env = await freshEnv();
  const r = await call(dispatched, env, SAMPLE);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const [o] = orders(env);
  assert.equal(o.status, 'pending');
  assert.equal(o.channel, 'glovo');
  assert.equal(o.ext_ref, 'BA7DWBUL');
  assert.equal(o.mode, 'delivery');
  assert.equal(o.number, 1);
  assert.equal(JSON.parse(o.lines).length, 2);
});
await ok('dispatch: Glovo retries the same order_id three times, still one ticket, same number', async () => {
  const env = await freshEnv();
  const first = await call(dispatched, env, SAMPLE);
  for (let i = 0; i < 3; i++) {
    const again = await call(dispatched, env, SAMPLE);
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.number, first.body.number);
  }
  assert.equal(orders(env).length, 1);
});
await ok('dispatch: a body with no product or an unreadable body is refused, nothing written', async () => {
  const env = await freshEnv();
  assert.equal((await call(dispatched, env, Object.assign({}, SAMPLE, { products: [] }))).status, 400);
  assert.equal((await call(dispatched, env, '{not json')).status, 400);
  assert.equal(orders(env).length, 0);
});

/* ── 5. Annulation ───────────────────────────────────────────────────────── */
await ok('cancel: the ticket becomes rejected, signed Glovo; a replay changes nothing', async () => {
  const env = await freshEnv();
  await call(dispatched, env, SAMPLE);
  const body = { order_id: '12345', store_id: 'kiwi-amira-cafe', cancel_reason: 'USER_ERROR', payment_strategy: 'PAY_NOTHING' };
  assert.equal((await call(cancelled, env, body)).status, 200);
  let [o] = orders(env);
  assert.equal(o.status, 'rejected');
  assert.equal(o.cancel_actor_name, 'Glovo');
  const ts = o.updated_ts;
  assert.equal((await call(cancelled, env, body)).status, 200);
  [o] = orders(env);
  assert.equal(o.updated_ts, ts);
});
await ok('cancel: another store_id cannot cancel this order, an unknown order is acknowledged and ignored', async () => {
  const env = await freshEnv();
  await call(dispatched, env, SAMPLE);
  const r = await call(cancelled, env, { order_id: '12345', store_id: 'kiwi-rival', cancel_reason: 'OTHER' });
  assert.equal(r.status, 200);
  assert.equal(orders(env)[0].status, 'pending');
  const unknown = await call(cancelled, env, { order_id: '999', store_id: 'kiwi-amira-cafe', cancel_reason: 'OTHER' });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.ignored, true);
  assert.equal((await call(cancelled, env, { order_id: '12345', store_id: 'kiwi-amira-cafe' }, 'nope')).status, 401);
});
await ok('cancel: a ticket already cashed at the till is not reversed by Glovo', async () => {
  const env = await freshEnv();
  await call(dispatched, env, SAMPLE);
  env.DB.raw.prepare("UPDATE orders SET status = 'accepted', paid_ts = ?").run(NOW);
  await call(cancelled, env, { order_id: '12345', store_id: 'kiwi-amira-cafe', cancel_reason: 'OTHER' });
  assert.equal(orders(env)[0].status, 'accepted');
});

/* ── 6. Retour vers Glovo ─────────────────────────────────────────────────── */
function fakeGlovo(status = 204) {
  const calls = [];
  return { calls, fetch: async (url, init) => { calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null }); return new Response(null, { status }); } };
}
await ok('status: accepting calls /accept with the promised time (now + the store prep minutes) and the store header', async () => {
  const env = await freshEnv();
  await call(dispatched, env, SAMPLE);
  const g = fakeGlovo();
  await notifyGlovo(env, 'amira-cafe', orders(env)[0].id, 'accepted', NOW, { fetch: g.fetch });
  assert.equal(g.calls.length, 1);
  assert.equal(g.calls[0].url, 'https://api.glovoapp.com/api/v0/integrations/orders/12345/accept');
  assert.equal(g.calls[0].method, 'PUT');
  assert.equal(g.calls[0].headers.Authorization, TOKEN);
  assert.equal(g.calls[0].headers['Glovo-Store-Address-External-Id'], 'kiwi-amira-cafe');
  assert.equal(g.calls[0].body.committedPreparationTime, '2026-11-19T19:15:00Z');
});
await ok('status: ready calls /ready_for_pickup; a served customer pickup calls /customer_picked_up', async () => {
  const env = await freshEnv({ GLOVO_API_BASE: 'https://stageapi.glovoapp.com/' });
  await call(dispatched, env, SAMPLE);
  await call(dispatched, env, Object.assign({}, SAMPLE, { order_id: '777', order_code: 'PICK7', is_picked_up_by_customer: true }));
  const [deliv, pick] = orders(env);
  const g = fakeGlovo();
  await notifyGlovo(env, 'amira-cafe', deliv.id, 'ready', NOW, { fetch: g.fetch });
  await notifyGlovo(env, 'amira-cafe', deliv.id, 'served', NOW, { fetch: g.fetch });
  await notifyGlovo(env, 'amira-cafe', pick.id, 'served', NOW, { fetch: g.fetch });
  assert.deepEqual(g.calls.map((c) => c.url), [
    'https://stageapi.glovoapp.com/api/v0/integrations/orders/12345/ready_for_pickup',
    'https://stageapi.glovoapp.com/api/v0/integrations/orders/777/customer_picked_up',
  ]);
});
await ok('status: a Kiwi order, another merchant, or no token configured never calls Glovo', async () => {
  const env = await freshEnv();
  await call(dispatched, env, SAMPLE);
  const g = fakeGlovo();
  await notifyGlovo(env, 'chez-rival', orders(env)[0].id, 'accepted', NOW, { fetch: g.fetch });
  await notifyGlovo(env, 'amira-cafe', 'ord-not-glovo', 'accepted', NOW, { fetch: g.fetch });
  await notifyGlovo(Object.assign({}, env, { GLOVO_TOKEN: '' }), 'amira-cafe', orders(env)[0].id, 'accepted', NOW, { fetch: g.fetch });
  assert.equal(g.calls.length, 0);
});
await ok('status: a refused call is recorded on the order link, it never throws into the till', async () => {
  const env = await freshEnv();
  await call(dispatched, env, SAMPLE);
  const g = fakeGlovo(400);
  const result = await notifyGlovo(env, 'amira-cafe', orders(env)[0].id, 'accepted', NOW, { fetch: g.fetch });
  assert.equal(result.ok, false);
  const link = env.DB.raw.prepare("SELECT last_call, last_call_err FROM glovo_orders WHERE order_id = '12345'").get();
  assert.equal(link.last_call, 'accept');
  assert.match(link.last_call_err, /400/);
  const boom = await notifyGlovo(env, 'amira-cafe', orders(env)[0].id, 'ready', NOW, { fetch: async () => { throw new Error('offline'); } });
  assert.equal(boom.ok, false);
});

/* ── 7. La vraie file ─────────────────────────────────────────────────────── */
await ok('queue: accepting the ticket through advanceOrder tells Glovo, after the response', async () => {
  const env = await freshEnv();
  await call(dispatched, env, SAMPLE);
  const g = fakeGlovo();
  const realFetch = globalThis.fetch;
  globalThis.fetch = g.fetch;
  const deferred = [];
  try {
    const res = await advanceOrder({ context: { waitUntil: (p) => deferred.push(p) }, env, b: {}, merchant: 'amira-cafe', now: NOW, employee: null, pinActor: null },
      orders(env)[0].id, 'accepted');
    assert.equal(res.status, 200);
    await Promise.all(deferred);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(orders(env)[0].status, 'accepted');
  assert.equal(g.calls.filter((c) => c.url.endsWith('/12345/accept')).length, 1);
});

/* ── Console opérateur ─────────────────────────────────────────────────────── */
const admin = await import('../functions/api/admin/glovo-stores.js');
await ok('admin: without an operator session the store links are neither listed nor written', async () => {
  const env = await freshEnv({ AUTH_SECRET: 'x'.repeat(32) });
  const get = await admin.onRequestGet({ request: new Request('https://kiwi-os.com/api/admin/glovo-stores'), env });
  const post = await admin.onRequestPost({ request: new Request('https://kiwi-os.com/api/admin/glovo-stores', { method: 'POST', body: JSON.stringify({ storeId: 'evil', merchant: 'amira-cafe' }) }), env });
  assert.equal(get.status, 403);
  assert.equal(post.status, 403);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM glovo_stores WHERE store_id = 'evil'").get().n, 0);
});
await ok('admin: a store link refuses a malformed store id or merchant, and clamps the prep time', async () => {
  const env = await freshEnv();
  assert.equal((await upsertGlovoStore(env, { storeId: 'has space', merchant: 'amira-cafe' }, NOW)).ok, false);
  assert.equal((await upsertGlovoStore(env, { storeId: 'ok-1', merchant: 'Bad Slug!' }, NOW)).ok, false);
  const r = await upsertGlovoStore(env, { storeId: 'ok-1', merchant: 'amira-cafe', prepMinutes: 900 }, NOW);
  assert.equal(r.prepMinutes, 120);
});

/* ── La porte du site ──────────────────────────────────────────────────────
 * Glovo n'a pas de cookie : sans exception exacte dans le middleware, ses appels
 * reçoivent la page de connexion et aucune commande n'arrive jamais. */
const { onRequest: gate } = await import('../functions/_middleware.js');
await ok('gate: the three Glovo webhooks and the menu feed reach their handler without a session; nothing else under /api/channel/glovo/ does', async () => {
  const hit = async (p, method = 'POST') => {
    const r = await gate({ request: new Request('https://kiwi-os.com' + p, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined }),
      env: { AUTH_SECRET: 'x'.repeat(40) }, next: async () => new Response('NEXT', { status: 299 }), waitUntil() {}, data: {} });
    return r.status;
  };
  assert.equal(await hit('/api/channel/glovo/dispatched'), 299);
  assert.equal(await hit('/api/channel/glovo/cancelled'), 299);
  assert.equal(await hit('/api/channel/glovo/picked_up'), 299);
  assert.equal(await hit('/api/channel/glovo/menu-feed', 'GET'), 299);
  assert.notEqual(await hit('/api/channel/glovo/menu-feed'), 299, 'the feed is GET only');
  assert.notEqual(await hit('/api/channel/glovo/menu'), 299, 'the owner menu route stays behind the gate');
  assert.notEqual(await hit('/api/channel/glovo/till'), 299, 'the till route stays behind the gate');
  assert.notEqual(await hit('/api/channel/glovo/dispatched/x'), 299);
  assert.notEqual(await hit('/api/admin/glovo-stores'), 299);
});

console.log(`glovo-channel: ${passed} passed`);
