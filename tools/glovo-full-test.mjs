#!/usr/bin/env node
/* Glovo · l'intégration complète, prouvée contre une fausse API Glovo qui note
 * chaque appel (méthode, chemin, en-têtes, corps) et répond ce qu'on lui dit.
 *
 *   1. CLIENT     glovoCall : jeton, en-tête d'adresse sur les routes de commande,
 *                 120 appels/min par adresse (Kiwi s'arrête à 110), 4xx et 429
 *                 jamais rejoués, 500/503 rejoués deux fois puis notés pour
 *                 l'opérateur, un succès efface la note
 *   2. COMMANDE   sac, livraison et supplément (Marketplace), remise du magasin,
 *                 frais de service notés hors ticket, écart visible, centimes
 *   3. CYCLE      Marketplace : servie → out_for_delivery, livrée → /v1/delivered
 *                 une fois ; coursier Glovo : +N min → adjust_preparation_time ;
 *                 webhook picked_up idempotent
 *   4. CAISSE     /api/channel/glovo/till : la caisse appairée voit ses commandes ;
 *                 fermer Glovo depuis la caisse demande un code responsable ; le
 *                 patron ferme et rouvre ; une adresse d'un autre magasin : 404
 *   5. CARTE      carte Kiwi → modèle Glovo (ids du catalogue, groupes, emojis
 *                 retirés, prix à 0 et formules écartés) ; validation avant envoi,
 *                 menuUrl, 5 envois par jour ; menu-feed sous jeton ; vérification
 *   6. LOTS       une rupture à la caisse (vraie route) part seule en lot, prix
 *                 changé → price, rien de changé → aucun appel ; un élément refusé
 *                 par Glovo repart au lot suivant
 *
 * Exemples : ceux de https://api-docs.glovoapp.com/partners (Order, Menu,
 * BulkUpdateItemsStatus).   node tools/glovo-full-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const API = await imp('functions/api/channel/glovo/_glovo-api.js');
const G = await imp('functions/api/channel/glovo/_glovo.js');
const OPS = await imp('functions/api/channel/glovo/_glovo-ops.js');
const MENU = await imp('functions/api/channel/glovo/_glovo-menu.js');
const tillRoute = await imp('functions/api/channel/glovo/till.js');
const menuRoute = await imp('functions/api/channel/glovo/menu.js');
const feedRoute = await imp('functions/api/channel/glovo/menu-feed.js');
const pickedRoute = await imp('functions/api/channel/glovo/picked_up.js');
const availRoute = await imp('functions/api/menu/availability.js');
const { makeSession, sessionCookie, tillToken, TILL_COOKIE } = await imp('functions/auth/_lib.js');

const SECRET = 'glovo-full-bench-secret-0123456789';
const TOKEN = 'glovo-shared-test-token-0123456789';
const SHOP = 'glovo-banc-resto', OTHER = 'glovo-banc-voisin';
const CODES = { manager: '7411', caisse: '7412' };
const NOW = Date.now();

/* ── D1 sur node:sqlite, schéma de production ─────────────────────────────── */
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(query) {
    const st = sql.prepare(query);
    const bound = (args = []) => ({
      first: async () => (/\bRETURNING\b/i.test(query) ? st.all(...args)[0] : st.get(...args)) ?? null,
      all: async () => ({ results: st.all(...args) }),
      run: async () => { const r = st.run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      _sync: () => {
        if (/\bRETURNING\b/i.test(query)) { const rows = st.all(...args); return { results: rows, meta: { changes: rows.length } }; }
        const r = st.run(...args); return { results: [], meta: { changes: Number(r.changes) } };
      },
    });
    return { ...bound(), bind: (...a) => bound(a.map((x) => (x === undefined ? null : x))) };
  },
  async batch(list) {
    sql.exec('BEGIN IMMEDIATE');
    try { const out = list.map((s) => s._sync()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
};
const env = { DB, AUTH_SECRET: SECRET, GLOVO_TOKEN: TOKEN, GLOVO_API_BASE: 'https://stageapi.glovoapp.com' };

sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?)').run('acc-g', 'o@glovo-banc.invalid', 'Resto', 's', 'h', NOW, 'active');
sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?)').run('acc-v', 'v@glovo-banc.invalid', 'Voisin', 's', 'h', NOW, 'active');
const cfg = sql.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, status, updated_ts) VALUES (?, '{}', 'pro', 'restaurant', ?, ?, 'active', ?)`);
cfg.run(SHOP, 'acc-g', 'Resto', NOW); cfg.run(OTHER, 'acc-v', 'Voisin', NOW);
const pin = sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)');
pin.run('pin-sara', SHOP, CODES.manager, 'Sara', 'Manager', NOW);
pin.run('pin-yassine', SHOP, CODES.caisse, 'Yassine', 'Caisse', NOW);
const store = sql.prepare(`INSERT INTO glovo_stores (store_id, merchant, prep_minutes, status, created_ts, updated_ts, marketplace) VALUES (?, ?, 15, 'active', ?, ?, ?)`);
store.run('resto-courier', SHOP, NOW, NOW, 0);
store.run('resto-market', SHOP, NOW, NOW, 1);
store.run('voisin-store', OTHER, NOW, NOW, 0);

/* ── La fausse API Glovo ──────────────────────────────────────────────────── */
const calls = [];
let script = [];                      // réponses à servir, dans l'ordre ; vide = 204
const fakeFetch = async (url, init) => {
  calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
  const next = script.length ? script.shift() : { status: 204 };
  if (next.throw) throw new Error(next.throw);
  const text = next.json !== undefined ? JSON.stringify(next.json) : (next.text || '');
  return { status: next.status, text: async () => text };
};
const deps = { fetch: fakeFetch, sleep: async () => {} };
globalThis.fetch = fakeFetch;          // les routes appellent glovoCall sans deps
const reset = (s = []) => { calls.length = 0; script = s.slice(); };
const apiErr = (id) => sql.prepare('SELECT api_err FROM glovo_stores WHERE store_id = ?').get(id).api_err;

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('  ✓ ' + name); };

/* ── 1 · le client ────────────────────────────────────────────────────────── */
await ok('client: token and store header exactly as Glovo documents them; no Content-Type without a body', async () => {
  reset([{ status: 204 }]);
  const r = await API.glovoCall(env, 'resto-courier', { method: 'PUT', orderRoute: true, path: '/api/v0/integrations/orders/1/ready_for_pickup' }, deps);
  assert.equal(r.ok, true);
  assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/api/v0/integrations/orders/1/ready_for_pickup');
  assert.deepEqual(calls[0].headers, { Authorization: TOKEN, 'Glovo-Store-Address-External-Id': 'resto-courier' });
  reset([{ status: 204 }]);
  await API.glovoCall(env, 'resto-courier', { method: 'PUT', path: '/webhook/stores/resto-courier/closing', body: { until: 'x' } }, deps);
  assert.deepEqual(calls[0].headers, { Authorization: TOKEN, 'Content-Type': 'application/json' }, 'store routes carry no address header');
});

await ok('client: 4xx and 429 are never replayed; 500 and 503 are replayed twice with growing waits, then written for the operator', async () => {
  for (const status of [400, 404, 429]) {
    reset([{ status, json: { error: { message: 'nope' } } }]);
    const r = await API.glovoCall(env, 'resto-courier', { method: 'PUT', path: '/x' }, deps);
    assert.equal(r.ok, false); assert.equal(calls.length, 1, status + ' is not replayed');
  }
  assert.match(apiErr('resto-courier'), /429/);
  const waits = [];
  reset([{ status: 500 }, { status: 503 }, { status: 503 }]);
  const r = await API.glovoCall(env, 'resto-courier', { method: 'PUT', path: '/y' }, { fetch: fakeFetch, sleep: async (ms) => waits.push(ms) });
  assert.equal(calls.length, 3); assert.deepEqual(waits, [400, 1200]);
  assert.match(r.error, /503/); assert.match(apiErr('resto-courier'), /route désactivée/);
  reset([{ status: 500 }, { status: 200, json: { ok: 1 } }]);
  const back = await API.glovoCall(env, 'resto-courier', { method: 'GET', path: '/z' }, deps);
  assert.equal(back.ok, true); assert.deepEqual(back.data, { ok: 1 });
  assert.equal(apiErr('resto-courier'), null, 'a success clears the operator note');
});

await ok('client: 120 calls a minute per store address, Kiwi stops at 110 without calling Glovo', async () => {
  const minute = Math.floor(NOW / 60000);
  sql.prepare('INSERT INTO glovo_rate (store_id, minute, n) VALUES (?, ?, ?)').run('resto-market', minute, API.RATE_CAP);
  reset();
  const r = await API.glovoCall(env, 'resto-market', { method: 'PUT', path: '/q' }, Object.assign({ now: NOW }, deps));
  assert.equal(r.error, 'rate-local'); assert.equal(calls.length, 0, 'nothing reaches Glovo');
  const other = await API.glovoCall(env, 'resto-courier', { method: 'PUT', path: '/q' }, Object.assign({ now: NOW }, deps));
  assert.equal(other.ok, true, 'another address has its own budget');
  sql.prepare('DELETE FROM glovo_rate').run();
});

/* ── 2 · la commande ──────────────────────────────────────────────────────── */
const ORDER = {
  order_id: 98765, store_id: 'resto-courier', order_code: 'BA7DWBUL', payment_method: 'DELAYED', currency: 'MAD',
  estimated_total_price: 3080, partner_discounts_products: 1550, partner_discounted_products_total: 1530, service_fee: 120, bag_fee: 125,
  is_picked_up_by_customer: false, cutlery_requested: true, loyalty_card: 'CUSTOMER123', allergy_info: 'tomate',
  customer: { name: 'Waleed', phone_number: '+212600000000' }, courier: {},
  products: [{ id: 'burger1', name: 'Burger', price: 1000, quantity: 2, attributes: [{ id: 'g1.c1', name: 'Extra meat', price: 300, quantity: 1 }] },
    { id: 'fries', name: 'Frites', price: 480, quantity: 1 }],
};
await ok('order: products after the shop\'s own discount, the bag on the ticket, the discount explained, service fee not billed, all in centimes', async () => {
  const m = G.mapGlovoOrder(ORDER, { marketplace: false });
  assert.equal(m.total, 16.55, '15,30 products + 1,25 bag');
  assert.deepEqual(m.lines.map((l) => [l.name, l.qty, l.unitPrice]), [['Burger', 2, 13], ['Frites', 1, 4.8], ['Sac', 1, 1.25]]);
  assert.equal(m.customer.channelAdjustmentCents, -1550);
  assert.match(m.customer.note, /Remise du magasin -15\.50 MAD/);
  assert.doesNotMatch(m.customer.note, /Écart Glovo/);
  assert.doesNotMatch(m.customer.note, /Frais de service/, 'a Glovo-courier order does not mention the marketplace service fee');
  assert.match(m.customer.note, /Couverts/); assert.match(m.customer.note, /Carte fidélité CUSTOMER123/);
  assert.equal(m.customer.glovo.bagCents, 125); assert.equal(m.customer.glovo.serviceFeeCents, 120);
});

await ok('order: Marketplace adds delivery and minimum-basket lines, notes what the customer pays and the cash given; an unexplained gap stays visible', async () => {
  const p = Object.assign({}, ORDER, { delivery_fee: 900, minimum_basket_surcharge: 200, total_customer_to_pay: 2955, customer_cash_payment_amount: 5000, payment_method: 'CASH' });
  const m = G.mapGlovoOrder(p, { marketplace: true });
  assert.equal(m.total, 27.55, '15,30 + 1,25 + 9,00 + 2,00');
  assert.ok(m.lines.some((l) => l.name === 'Livraison' && l.unitPrice === 9));
  assert.ok(m.lines.some((l) => l.name === 'Supplément panier minimum' && l.unitPrice === 2));
  assert.match(m.customer.note, /Client paie 29\.55 MAD/); assert.match(m.customer.note, /Espèces remises 50\.00 MAD/);
  assert.match(m.customer.note, /Frais de service Glovo 1\.20 MAD \(hors ticket\)/);
  const odd = G.mapGlovoOrder(Object.assign({}, ORDER, { partner_discounted_products_total: 2000 }), {});
  assert.match(odd.customer.note, /Écart Glovo/, 'a total the lines do not explain is never silently fixed');
  const lineCents = (mm) => mm.lines.reduce((t, l) => t + Math.round(l.unitPrice * 100) * l.qty, 0);
  assert.equal(lineCents(m) + m.customer.channelAdjustmentCents, Math.round(m.total * 100), 'lines + adjustment = total, to the centime');
});

/* ── 3 · le cycle d'une commande ──────────────────────────────────────────── */
const link = (orderId, storeId, kiwiId, pickup = 0) => {
  sql.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, channel) VALUES (?, ?, 1, ?, '', 10, '[]', 'accepted', ?, ?, 'glovo')`)
    .run(kiwiId, SHOP, pickup ? 'takeout' : 'delivery', NOW, NOW);
  sql.prepare('INSERT INTO glovo_orders (order_id, store_id, merchant, kiwi_order_id, order_code, pickup, created_ts) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(orderId, storeId, SHOP, kiwiId, 'C-' + orderId, pickup, NOW);
};
link('5001', 'resto-courier', 'ord-courier');
link('5002', 'resto-market', 'ord-market');
link('5003', 'resto-courier', 'ord-pickup', 1);

await ok('lifecycle: the queue status chooses the Glovo route by order type (courier, customer pickup, Marketplace)', async () => {
  assert.equal(G.glovoRoute('accepted', {}), 'accept');
  assert.equal(G.glovoRoute('ready', {}), 'ready_for_pickup');
  assert.equal(G.glovoRoute('ready', { marketplace: 1 }), null, 'ready_for_pickup is for Glovo couriers only');
  assert.equal(G.glovoRoute('served', { pickup: 1 }), 'customer_picked_up');
  assert.equal(G.glovoRoute('served', { marketplace: 1 }), 'out_for_delivery');
  assert.equal(G.glovoRoute('served', {}), null, 'a Glovo courier hand-off is Glovo\'s to report');
  reset([{ status: 204 }]);
  const r = await G.notifyGlovo(env, SHOP, 'ord-market', 'served', NOW, deps);
  assert.equal(r.route, 'out_for_delivery');
  assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/api/v0/integrations/orders/5002/out_for_delivery');
  assert.ok(sql.prepare("SELECT out_ts FROM glovo_orders WHERE order_id = '5002'").get().out_ts);
  reset([{ status: 204 }]);
  await G.notifyGlovo(env, SHOP, 'ord-courier', 'accepted', NOW, deps);
  assert.deepEqual(calls[0].body, { committedPreparationTime: new Date(NOW + 15 * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z') });
  assert.equal(sql.prepare("SELECT pickup_at FROM glovo_orders WHERE order_id = '5001'").get().pickup_at, calls[0].body.committedPreparationTime);
});

const owner = sessionCookie(await makeSession('acc-g', SECRET));
const stranger = sessionCookie(await makeSession('acc-v', SECRET));
const till = `${TILL_COOKIE}=${await tillToken(SECRET, SHOP)}`;
const req = (url, cookie, body, method) => new Request('https://kiwi-os.com' + url, {
  method: method || (body ? 'POST' : 'GET'),
  headers: Object.assign({ 'CF-Connecting-IP': '10.1.2.3' }, cookie ? { Cookie: cookie } : {}, body ? { 'Content-Type': 'application/json' } : {}),
  body: body ? JSON.stringify(body) : undefined,
});
const waits = [];
const call = async (fn, url, cookie, body, e = env, method) => {
  const r = await fn({ request: req(url, cookie, body, method), env: e, waitUntil: (p) => waits.push(p) });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const drain = async () => { while (waits.length) await waits.shift(); };

await ok('lifecycle: +N minutes reaches adjust_preparation_time for a Glovo courier order, never a Marketplace or pickup one', async () => {
  reset([{ status: 204 }]);
  const r = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'prep', orderId: 'ord-courier', minutes: 10 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/api/v1/integrations/orders/5001/adjust_preparation_time');
  assert.match(calls[0].body.expectedPickupAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  for (const id of ['ord-market', 'ord-pickup']) {
    reset();
    const no = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'prep', orderId: id, minutes: 5 });
    assert.equal(no.status, 409); assert.equal(calls.length, 0);
  }
  const bad = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'prep', orderId: 'ord-courier', minutes: 600 });
  assert.equal(bad.status, 400);
});

await ok('lifecycle: « livrée » is Marketplace only, calls /v1/delivered once and is replay-safe', async () => {
  reset([{ status: 204 }]);
  const r = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'delivered', orderId: 'ord-market' });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/api/v1/integrations/orders/5002/delivered');
  assert.equal(calls[0].body, undefined, 'Glovo dates the delivery itself: no body');
  reset();
  const again = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'delivered', orderId: 'ord-market' });
  assert.equal(again.data.replayed, true); assert.equal(calls.length, 0);
  const courier = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'delivered', orderId: 'ord-courier' });
  assert.equal(courier.status, 409);
});

await ok('webhook picked_up: Glovo\'s token only, stamps the order once, answers 200 to an unknown order', async () => {
  const hook = (body, auth = TOKEN) => pickedRoute.onRequestPost({ request: new Request('https://kiwi-os.com/api/channel/glovo/picked_up', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: auth } : {}), body: JSON.stringify(body) }), env });
  assert.equal((await hook({ order_id: '5001', store_id: 'resto-courier' }, 'wrong')).status, 401);
  assert.equal((await hook({ order_id: '5001', store_id: 'resto-courier' })).status, 200);
  const ts = sql.prepare("SELECT picked_up_ts FROM glovo_orders WHERE order_id = '5001'").get().picked_up_ts;
  assert.ok(ts);
  assert.equal((await hook({ order_id: '5001', store_id: 'resto-courier' })).status, 200);
  assert.equal(sql.prepare("SELECT picked_up_ts FROM glovo_orders WHERE order_id = '5001'").get().picked_up_ts, ts, 'replay changes nothing');
  assert.equal((await hook({ order_id: '5001', store_id: 'voisin-store' })).status, 200, 'another store id does not stamp it');
  assert.equal((await hook({ order_id: 'nope', store_id: 'resto-courier' })).status, 200);
  reset();
  assert.equal((await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'prep', orderId: 'ord-courier', minutes: 5 })).status, 409, 'no more prep adjustments once the courier has it');
});

/* ── 4 · la caisse et le tableau de bord ─────────────────────────────────── */
await ok('till: the paired till sees its stores and Glovo orders; another shop and an anonymous caller see nothing', async () => {
  const r = await call(tillRoute.onRequestGet, '/api/channel/glovo/till?merchant=' + SHOP, till);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.stores.map((s) => [s.storeId, s.marketplace]), [['resto-courier', false], ['resto-market', true]]);
  const o = r.data.orders.find((x) => x.kiwiOrderId === 'ord-market');
  assert.ok(o.deliveredTs && o.outTs && o.marketplace);
  assert.ok(r.data.orders.find((x) => x.kiwiOrderId === 'ord-courier').pickedUpTs);
  assert.equal((await call(tillRoute.onRequestGet, '/api/channel/glovo/till?merchant=' + SHOP, stranger)).status, 401);
  assert.equal((await call(tillRoute.onRequestGet, '/api/channel/glovo/till?merchant=' + SHOP, '')).status, 401);
  assert.ok(!JSON.stringify(r.data).includes(TOKEN), 'the shared token never leaves the server');
});

await ok('closing: from the till a manager code is required (a cashier code is refused); the owner closes and reopens; Glovo gets until in ISO with offset', async () => {
  reset();
  const noPin = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'close', storeId: 'resto-courier', minutes: 30 });
  assert.notEqual(noPin.status, 200); assert.equal(calls.length, 0);
  const cashier = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'close', storeId: 'resto-courier', minutes: 30, pin: CODES.caisse });
  assert.equal(cashier.status, 403); assert.equal(calls.length, 0);
  reset([{ status: 204 }]);
  const mgr = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'close', storeId: 'resto-courier', minutes: 30, pin: CODES.manager });
  assert.equal(mgr.status, 200, JSON.stringify(mgr.data));
  assert.equal(calls[0].method, 'PUT'); assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/webhook/stores/resto-courier/closing');
  assert.match(calls[0].body.until, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/);
  assert.ok(Math.abs(Date.parse(calls[0].body.until) - (Date.now() + 30 * 60000)) < 5000);
  reset([{ status: 204 }]);
  const re = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', owner, { merchant: SHOP, action: 'reopen', storeId: 'resto-courier' });
  assert.equal(re.status, 200); assert.equal(calls[0].method, 'DELETE');
  assert.equal(sql.prepare("SELECT closing_until FROM glovo_stores WHERE store_id = 'resto-courier'").get().closing_until, null);
  reset();
  const foreign = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', owner, { merchant: SHOP, action: 'close', storeId: 'voisin-store', minutes: 30 });
  assert.equal(foreign.status, 404); assert.equal(calls.length, 0, 'another shop\'s address is never closed');
  const week = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', owner, { merchant: SHOP, action: 'close', storeId: 'resto-courier', minutes: 60 * 24 * 8 });
  assert.equal(week.status, 400, 'more than seven days is a typing mistake');
  reset([{ status: 200, json: { until: new Date(Date.now() + 3600000).toISOString().replace(/\.\d{3}Z$/, '+00:00') } }]);
  const read = await call(tillRoute.onRequestPost, '/api/channel/glovo/till', owner, { merchant: SHOP, action: 'closing', storeId: 'resto-courier' });
  assert.ok(read.data.until, 'a closing set elsewhere is read back from Glovo');
});

/* ── 5 · la carte ─────────────────────────────────────────────────────────── */
const KIWI_MENU = {
  cats: [{ id: 'c-plats', name: 'Plats 🍔', sub: [{ id: 's-burgers', name: 'Burgers' }] }, { id: 'c-boissons', name: 'Boissons', sub: [] }],
  opts: [{ id: 'cuisson', name: 'Cuisson', kind: 'one', required: true, choices: [{ id: 'saignant', name: 'Saignant', price: 0 }, { id: 'apoint', name: 'À point', price: 0 }] },
    { id: 'extras', name: 'Extras', kind: 'many', max: 3, choices: [{ id: 'cheddar', name: 'Cheddar', price: 5 }, { id: 'bacon', name: 'Bacon ✨', price: 7.5 }] }],
  items: [
    { id: 'burger1', name: 'Burger 🔥', price: 65, catId: 'c-plats', subId: 's-burgers', avail: true, opts: ['cuisson', 'extras'], photo: '/api/media/burger.jpg', desc: 'Bœuf' },
    { id: 'the', name: 'Thé', price: 12, catId: 'c-boissons', avail: false },
    { id: 'eau', name: 'Eau', price: 0, catId: 'c-boissons' },
    { id: 'menu-midi', name: 'Menu midi', price: 80, catId: 'c-plats', formulaOnly: true },
    { id: 'old', name: 'Ancien', price: 30, catId: 'c-plats', archived: true },
    { id: 'tajine', name: 'Tajine', price: 90, avail: true },
  ],
};
sql.prepare("INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, 'Resto', 'restaurant', ?, ?)").run(SHOP, JSON.stringify(KIWI_MENU), NOW);

await ok('menu: Kiwi menu → Glovo model with the catalogue ids, groups, emojis removed, 0 MAD and formula-only items left out with a reason', async () => {
  const { sanitizeMenu } = await imp('functions/api/menu.js');
  const b = MENU.buildGlovoMenu(sanitizeMenu(KIWI_MENU, NOW), { origin: 'https://kiwi-os.com' });
  assert.deepEqual(b.menu.products.map((p) => p.id), ['burger1', 'the', 'tajine']);
  const burger = b.menu.products[0];
  assert.equal(burger.name, 'Burger'); assert.equal(burger.price, 65);
  assert.equal(burger.image_url, 'https://kiwi-os.com/api/media/burger.jpg');
  assert.deepEqual(burger.attributes_groups, ['grp.cuisson', 'grp.extras']);
  assert.equal(b.menu.products.find((p) => p.id === 'the').available, false);
  assert.equal(b.menu.products.find((p) => p.id === 'the').image_url, null, 'the key is required, its value may be null');
  assert.deepEqual(b.menu.attributes.map((a) => [a.id, a.name, a.price_impact]), [['cuisson.saignant', 'Saignant', 0], ['cuisson.apoint', 'À point', 0], ['extras.cheddar', 'Cheddar', 5], ['extras.bacon', 'Bacon', 7.5]]);
  const g = b.menu.attribute_groups.find((x) => x.id === 'grp.extras');
  assert.deepEqual([g.min, g.max, g.multiple_selection], [0, 3, true]);
  const c = b.menu.attribute_groups.find((x) => x.id === 'grp.cuisson');
  assert.deepEqual([c.min, c.max, c.multiple_selection], [1, 1, false]);
  assert.deepEqual(b.menu.collections.map((x) => [x.name, x.sections.map((s) => [s.name, s.products])]),
    [['Plats', [['Burgers', ['burger1']]]], ['Boissons', [['Boissons', ['the']]]], ['Autres', [['Autres', ['tajine']]]]]);
  assert.ok(b.menu.collections.every((x) => !x.schedule), 'at least one collection without a schedule');
  assert.deepEqual(b.skipped.map((s) => [s.id, s.why]), [['eau', 'prix à 0'], ['menu-midi', 'formule seulement']]);
  assert.ok(!/\p{Extended_Pictographic}/u.test(JSON.stringify(b.menu)), 'no emoji reaches Glovo');
});

await ok('menu: validated first (an invalid menu costs no upload), then menuUrl; five uploads a day; the owner only', async () => {
  reset([{ status: 200, json: { valid: false, errors: ['products[0].price must be > 0'], warnings: [] } }]);
  const bad = await call(menuRoute.onRequestPost, '/api/channel/glovo/menu', owner, { merchant: SHOP, action: 'push', storeId: 'resto-courier' });
  assert.equal(bad.status, 422); assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/paris/menu/validate');
  assert.equal(sql.prepare("SELECT menu_count FROM glovo_stores WHERE store_id = 'resto-courier'").get().menu_count, 0);
  reset([{ status: 200, json: { valid: true, errors: [], warnings: [] } }, { status: 200, json: { transaction_id: 'tx-menu-1' } }]);
  const good = await call(menuRoute.onRequestPost, '/api/channel/glovo/menu', owner, { merchant: SHOP, action: 'push', storeId: 'resto-courier' });
  assert.equal(good.status, 200, JSON.stringify(good.data));
  assert.equal(calls[1].url, 'https://stageapi.glovoapp.com/webhook/stores/resto-courier/menu');
  assert.deepEqual(calls[1].body, { menuUrl: 'https://kiwi-os.com/api/channel/glovo/menu-feed?store=resto-courier' });
  sql.prepare("UPDATE glovo_stores SET menu_count = 5 WHERE store_id = 'resto-courier'").run();
  reset();
  const sixth = await call(menuRoute.onRequestPost, '/api/channel/glovo/menu', owner, { merchant: SHOP, action: 'push', storeId: 'resto-courier' });
  assert.equal(sixth.status, 429); assert.equal(calls.length, 0, 'the sixth upload of the day never reaches Glovo');
  sql.prepare("UPDATE glovo_stores SET menu_count = 1 WHERE store_id = 'resto-courier'").run();
  assert.equal((await call(menuRoute.onRequestPost, '/api/channel/glovo/menu', till, { merchant: SHOP, action: 'push', storeId: 'resto-courier' })).status, 401, 'the till never uploads a menu');
  assert.equal((await call(menuRoute.onRequestPost, '/api/channel/glovo/menu', stranger, { merchant: SHOP, action: 'push', storeId: 'resto-courier' })).status, 401);
});

await ok('menu feed: Glovo reads the built menu with « Bearer <token> »; no token, no menu', async () => {
  const get = (auth, store = 'resto-courier') => feedRoute.onRequestGet({ request: new Request('https://kiwi-os.com/api/channel/glovo/menu-feed?store=' + store,
    { headers: auth ? { Authorization: auth } : {} }), env });
  assert.equal((await get('')).status, 401);
  assert.equal((await get('Bearer wrong')).status, 401);
  const r = await get('Bearer ' + TOKEN);
  assert.equal(r.status, 200);
  const menu = await r.json();
  assert.deepEqual(menu.products.map((p) => p.id), ['burger1', 'the', 'tajine']);
  assert.equal((await get('Bearer ' + TOKEN, 'unknown-store')).status, 404);
});

await ok('menu: the owner screen reads back a PROCESSING upload from Glovo; SUCCESS makes it the reference for later batches', async () => {
  reset([{ status: 200, json: { transaction_id: 'tx-menu-1', status: 'SUCCESS', details: [] } }]);
  const r = await call(menuRoute.onRequestGet, '/api/channel/glovo/menu?merchant=' + SHOP, owner);
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/webhook/stores/resto-courier/menu/tx-menu-1');
  assert.equal(r.data.stores.find((s) => s.storeId === 'resto-courier').menu.status, 'SUCCESS');
  assert.equal(r.data.preview.products, 3); assert.equal(r.data.preview.unavailable, 1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM glovo_menu_state WHERE store_id = 'resto-courier'").get().n, 7, '3 products + 4 attributes');
});

/* ── 6 · les lots ─────────────────────────────────────────────────────────── */
await ok('batches: a dish sold out at the till (real route) leaves for Glovo on its own, only { id, available }; nothing changed, no call', async () => {
  reset([{ status: 200, json: { transaction_id: 'tx-bulk-1' } }]);
  const r = await call(availRoute.onRequestPost, '/api/menu/availability', till, { merchant: SHOP, itemId: 'burger1', available: false });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await drain();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://stageapi.glovoapp.com/webhook/stores/resto-courier/menu/updates');
  assert.deepEqual(calls[0].body, { products: [{ id: 'burger1', available: false }] }, 'no null, no empty list, only what changed');
  reset();
  const again = await MENU.syncGlovoItems(env, SHOP, Date.now(), deps);
  assert.equal(calls.length, 0); assert.equal(again.stores[0].sent, 0);
});

await ok('batches: a new price leaves as dirhams; a store whose menu is not on Glovo yet gets no batch', async () => {
  const m = JSON.parse(sql.prepare('SELECT data FROM menus WHERE merchant = ?').get(SHOP).data);
  m.items.find((i) => i.id === 'tajine').price = 95.5;
  m.opts[1].choices[0].price = 6;
  sql.prepare('UPDATE menus SET data = ? WHERE merchant = ?').run(JSON.stringify(m), SHOP);
  reset([{ status: 200, json: { transaction_id: 'tx-bulk-2' } }]);
  await MENU.syncGlovoItems(env, SHOP, Date.now(), deps);
  assert.equal(calls.length, 1, 'resto-market has no menu on Glovo: no batch for it');
  assert.deepEqual(calls[0].body, { products: [{ id: 'tajine', price: 95.5 }], attributes: [{ id: 'extras.cheddar', price_impact: 6 }] });
});

await ok('batches: what Glovo did not take (PARTIALLY_PROCESSED) is sent again, both fields, in the next batch', async () => {
  reset([{ status: 200, json: { transaction_id: 'tx-bulk-2', status: 'PARTIALLY_PROCESSED', details: ['Products updated: []', 'Products not updated: [tajine]', 'Attributes updated: [extras.cheddar]'] } }]);
  const v = await MENU.verifyGlovoBulk(env, SHOP, 'resto-courier', Date.now(), deps);
  assert.equal(v.status, 'PARTIALLY_PROCESSED');
  reset([{ status: 200, json: { transaction_id: 'tx-bulk-3' } }]);
  await MENU.syncGlovoItems(env, SHOP, Date.now(), deps);
  assert.deepEqual(calls[0].body, { products: [{ id: 'tajine', price: 95.5, available: true }] });
  assert.deepEqual(MENU.notUpdated(['Products not updated: [11111, 22222]', 'Attributes not updated: [33333]']), { product: ['11111', '22222'], attribute: ['33333'] });
});

await ok('fail-soft: without GLOVO_TOKEN nothing calls Glovo, the webhooks answer 503 and the owner routes say not-configured', async () => {
  const bare = { DB, AUTH_SECRET: SECRET };
  reset();
  assert.deepEqual(await MENU.syncGlovoItems(bare, SHOP), { ok: true, skipped: 'not-configured' });
  assert.equal((await call(menuRoute.onRequestPost, '/api/channel/glovo/menu', owner, { merchant: SHOP, action: 'sync' }, bare)).status, 503);
  assert.equal((await call(tillRoute.onRequestPost, '/api/channel/glovo/till', till, { merchant: SHOP, action: 'prep', orderId: 'ord-courier', minutes: 5 }, bare)).status, 503);
  const g = await call(tillRoute.onRequestGet, '/api/channel/glovo/till?merchant=' + SHOP, till, null, bare);
  assert.equal(g.status, 200); assert.equal(g.data.configured, false);
  assert.equal(calls.length, 0);
});

console.log(`glovo-full: ${passed} passed`);
