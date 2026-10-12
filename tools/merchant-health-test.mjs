#!/usr/bin/env node
/* Kiwi Health · la vraie route, sur une vraie base (docs/specs/kiwi-health.md).
 *
 * functions/api/merchant-health.js tourne sur le schéma complet (schema.sql) chargé dans
 * un SQLite en mémoire ; le calcul pur (functions/api/_merchant-health.js) est essayé
 * sur chaque métier. Ce que la suite tient :
 *   · chaque ligne dit ce que la base contient, chiffres à l'appui ;
 *   · ce que Kiwi ne voit pas sort du score, il ne compte jamais zéro ;
 *   · un module coupé disparaît de la liste ;
 *   · le score ne lit que son commerce, et seul son propriétaire le lit ;
 *   · aucun code d'équipe ne sort de la route.
 * Les codes ci-dessous sont des valeurs de banc inventées pour ce fichier.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet, resetHealthCache } = await import(path.join(ROOT, 'functions/api/merchant-health.js'));
const { computeHealth, baseOf } = await import(path.join(ROOT, 'functions/api/_merchant-health.js'));
const { makeSession, SESS_COOKIE, TILL_COOKIE, tillToken } = await import(path.join(ROOT, 'functions/auth/_lib.js'));

const SECRET = 'kiwi-health-bench-secret-0123456';
const SHOP = 'resto-sante-banc';
const OTHER = 'boutique-sante-banc';
const BENCH_CODE = 'banc-code-ne-doit-pas-sortir';
const DAY = 86400000;
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

function world({ drop = [], shopFeatures = {}, shopType = 'restaurant' } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const now = Date.now();
  const acc = sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)');
  acc.run('acc-sante', 'o@banc.invalid', 'Resto Santé Banc', 's', 'h', now);
  acc.run('acc-voisin', 'v@banc.invalid', 'Boutique Santé Banc', 's', 'h', now);
  const cfg = sql.prepare('INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, updated_ts) VALUES (?,?,?,?,?,?,?)');
  cfg.run(SHOP, JSON.stringify(shopFeatures), 'basic', shopType, 'acc-sante', 'Resto Santé Banc', now);
  cfg.run(OTHER, '{}', 'basic', 'boutique', 'acc-voisin', 'Boutique Santé Banc', now);
  const doc = sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,1,?)');
  const put = (m, feature, data) => doc.run(m, feature, JSON.stringify(data), now);

  // the till: sales on 10 distinct days, 3 of them closed; one voided sale
  const sale = sql.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, void_ts) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (let k = 0; k < 10; k++) sale.run('s' + k, SHOP, 100, 10000, 'cash', 'Table', 'R' + k, now - k * DAY - 60000, '[]', null);
  sale.run('s-void', SHOP, 100, 10000, 'cash', 'Table', 'RV', now - 12 * DAY, '[]', now - 12 * DAY + 1000);
  for (let k = 0; k < 25; k++) sale.run('o' + k, OTHER, 100, 10000, 'card', 'Robe', 'B' + k, now - k * DAY - 60000, '[]', null);
  const close = sql.prepare("INSERT INTO cash_session_events (id, merchant, session_id, terminal_id, event_type, expected_cents, counted_cents, gap_cents, actor_id, opened_ts, occurred_ts) VALUES (?,?,?,?, 'close', 0, 0, 0, 'a', ?, ?)");
  for (let k = 1; k <= 3; k++) close.run('c' + k, SHOP, 'sess' + k, 't1', now - k * DAY - 30000, now - k * DAY - 20000);
  // a week open every day: 30 open days in the window
  const week = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: true, periods: [{ from: '09:00', to: '23:00' }] }]));
  put(SHOP, 'hours', { v: 1, week, exceptions: [], overrides: [] });

  // the team: three members, two with a code; one of them clocked in
  const pin = sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)');
  pin.run('p1', SHOP, BENCH_CODE, 'Sara', 'Manager', now);
  put(SHOP, 'team', { members: [
    { id: 'm1', name: 'Sara', pinCode: BENCH_CODE },
    { id: 'm2', name: 'Omar', pinCode: BENCH_CODE + '-2' },
    { id: 'm3', name: 'Nora', pinCode: '' },
  ], shifts: { m1: [{ day: 'mon', from: '09:00', to: '17:00' }] } });
  put(SHOP, 'attendance', { entries: [{ id: 'e1', staffId: 'm1', inTs: now - 2 * DAY, outTs: now - 2 * DAY + 8 * 3600000 }] });

  // clients: 2 of the 10 sales tied to a client (20 % ≥ 10 % → done)
  const cpe = sql.prepare('INSERT INTO client_purchase_events (merchant, ref, client_id, amount, created_ts, srv_ts) VALUES (?,?,?,?,?,?)');
  cpe.run(SHOP, 'R1', 'cl1', 100, now - DAY, now); cpe.run(SHOP, 'R2', 'cl2', 100, now - 2 * DAY, now);

  // identity: name and legal, no logo
  put(SHOP, 'business', { v: 1, name: 'Resto Santé Banc', tradeName: '', logo: '', slogan: '', legal: { ice: '000' } });

  // the menu: 4 dishes, 1 with a photo, 2 with a recipe
  sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?,?,?,?,?)').run(SHOP, 'Resto', 'restaurant', JSON.stringify({ cats: [], items: [
    { id: 'it1', name: 'Tajine', price: 90, photo: 'https://kiwi.test/p.webp' },
    { id: 'it2', name: 'Harira', price: 28 },
    { id: 'it3', name: 'Thé', price: 12 },
    { id: 'it4', name: 'Café', price: 12 },
    { id: 'it5', name: 'Ancien plat', price: 10, archived: true },
  ] }), now);
  put(SHOP, 'recipes', { items: {
    it1: { itemId: 'it1', ingredients: [{ name: 'Poulet', qty: 0.3, unit: 'kg' }] },
    it2: { itemId: 'it2', ingredients: [{ name: 'Lentilles', qty: 0.1, unit: 'kg' }] },
    it3: { itemId: 'it3', ingredients: [] },
  } });
  put(SHOP, 'floorplan', { rooms: [], tables: [{ id: 't1' }, { id: 't2' }], zones: [], objects: [] });
  sql.prepare("INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts) VALUES ('ts1', ?, 'salle', '1', 'closed', ?, ?)").run(SHOP, now - DAY, now - DAY);
  put(SHOP, 'stock', { items: [{ id: 'st1', name: 'Poulet' }], lines: [], movements: [], suppliers: [] });
  for (const t of drop) sql.exec(`DROP TABLE ${t}`);
  return { sql, env: { DB: d1(sql), AUTH_SECRET: SECRET } };
}
function d1(sql) {
  return {
    prepare(query) {
      const statement = sql.prepare(query);
      const bound = (args = []) => ({
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => ({ success: true, meta: { changes: statement.run(...args).changes } }),
      });
      return { ...bound(), bind: (...args) => bound(args) };
    },
  };
}
const ask = async (w, merchant, cookie) => {
  resetHealthCache();
  const res = await onRequestGet({ env: w.env, request: new Request(`https://kiwi.test/api/merchant-health?merchant=${merchant}`, { headers: cookie ? { Cookie: cookie } : {} }) });
  return { status: res.status, text: await res.text() };
};
const owner = async (aid) => `${SESS_COOKIE}=${await makeSession(aid, SECRET)}`;
const byId = (body, id) => body.checks.find((c) => c.id === id);

/* 1 · each line says what the base holds */
{
  const w = world();
  const r = await ask(w, SHOP, await owner('acc-sante'));
  check(r.status === 200, 'the owner reads their own store: 200');
  const body = JSON.parse(r.text);
  const till = byId(body, 'till');
  check(till.n === 10 && till.of === 30 && till.state === 'partial' && till.value === 0.33, `till: sales on 10 of 30 open days, the voided sale ignored (${till.n}/${till.of})`);
  const close = byId(body, 'close');
  check(close.n === 3 && close.of === 10 && close.value === 0.3, 'close: 3 of the 10 days with sales were closed');
  const codes = byId(body, 'codes');
  check(codes.n === 2 && codes.state === 'done', 'codes: two people hold their own code');
  const clock = byId(body, 'clock');
  check(clock.n === 1 && clock.of === 3 && clock.value === 0.33, 'time clock: 1 of 3 members clocked in');
  check(byId(body, 'planning').state === 'done', 'planning: shifts are set');
  const clients = byId(body, 'clients');
  check(clients.n === 2 && clients.of === 10 && clients.state === 'done', 'clients: 2 sales in 10 tied to a client is « done » (threshold one in ten)');
  const id = byId(body, 'identity');
  check(id.n === 2 && id.of === 3, 'identity: name and legal mentions, no logo (2 of 3)');
  check(byId(body, 'hours').state === 'done', 'hours: the week is set');
  const menu = byId(body, 'menu');
  check(menu.n === 1 && menu.of === 4 && menu.value === 0.63, 'menu: 4 live dishes (the archived one ignored), 1 with a photo');
  const recipes = byId(body, 'recipes');
  check(recipes.n === 2 && recipes.of === 4 && recipes.value === 0.5, 'recipes: a sheet without ingredients does not count (2 of 4)');
  check(byId(body, 'floor').state === 'done', 'floor plan: tables drawn and a table opened');
  check(byId(body, 'stock').value === 0.5, 'stock: items exist, no movement and no count yet (half)');
  check(byId(body, 'waiter').state === 'todo', 'waiter app: no order taken by a named waiter');
  check(byId(body, 'charges').state === 'todo' && byId(body, 'charges').nav.action === 'charges-open', 'fixed costs: none entered, « Ensuite » opens the editor');

  /* not measurable is never zero */
  const printer = byId(body, 'printer');
  check(printer.state === 'unmeasured' && printer.value === null && printer.why === 'browser-printing', 'printer: no bridge seen is « not measurable » (Bluetooth and USB leave no trace), never 0');
  check(byId(body, 'kitchen').state === 'unmeasured', 'kitchen: no ticket sent through Kiwi is « not measurable » (a kitchen printer leaves no trace)');
  const scored = body.checks.filter((c) => c.state !== 'unmeasured' && c.weight > 0);
  const expected = Math.round(100 * scored.reduce((s, c) => s + c.weight * c.value, 0) / scored.reduce((s, c) => s + c.weight, 0));
  check(body.score === expected && body.measured === scored.length, `score ${body.score} is the weighted share of the ${scored.length} measured lines only`);
  check(body.next.length === 3 && body.next.every((id) => byId(body, id).state !== 'done'), `three next actions, none already done (${body.next.join(', ')})`);
  check(body.next[0] === 'till', 'the next action is the one with the most weight left (the till)');
  check(Array.isArray(body.optional) && body.optional.every((c) => c.weight === 0), 'optional tools carry no weight');

  /* no code ever leaves */
  check(!r.text.includes(BENCH_CODE) && !/pinCode|"pin"/.test(r.text), 'no team code and no code field in the response');
}

/* 1b · fixed costs: one live line is « entered », a removed one is not */
{
  const w = world();
  w.sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,1,?)")
    .run(SHOP, 'charges', JSON.stringify({ lines: [{ id: 'r', label: 'Loyer', cat: 'rent', freq: 'month', versions: [{ from: '2026-01', amount: 7777 }] }] }), Date.now());
  const r = await ask(w, SHOP, await owner('acc-sante'));
  check(byId(JSON.parse(r.text), 'charges').state === 'done', 'fixed costs: a rent entered is « done »');
  check(!r.text.includes('7777') && !r.text.includes('Loyer'), 'the amount and the label never leave in the health answer');
  w.sql.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'charges'")
    .run(JSON.stringify({ lines: [{ id: 'r', deleted: true, versions: [] }] }), SHOP);
  check(byId(JSON.parse((await ask(w, SHOP, await owner('acc-sante'))).text), 'charges').state === 'todo', 'fixed costs: only a removed line left is « todo » again');
}

/* 2 · a table prod D1 does not have yet makes its lines unmeasured, not zero */
{
  const w = world({ drop: ['z_reconciliations', 'cash_session_events', 'client_purchase_events'] });
  const body = JSON.parse((await ask(w, SHOP, await owner('acc-sante'))).text);
  check(byId(body, 'close').state === 'unmeasured' && byId(body, 'clients').state === 'unmeasured', 'missing tables: close and clients are « not measurable », and the route still answers');
  const full = JSON.parse((await ask(world(), SHOP, await owner('acc-sante'))).text);
  check(body.measured === full.measured - 2, 'the two unmeasured lines leave the score instead of dragging it down');
}

/* 3 · a module switched off leaves the list */
{
  const w = world({ shopFeatures: { stock: false, salle: false, crm: false } });
  const body = JSON.parse((await ask(w, SHOP, await owner('acc-sante'))).text);
  const ids = body.checks.map((c) => c.id);
  check(!ids.includes('stock') && !ids.includes('floor') && !ids.includes('waiter') && !ids.includes('clients') && !ids.includes('loyalty'),
    'stock, floor plan, waiter app, clients and loyalty switched off: none of them is listed or scored');
}

/* 4 · only its own store, only its owner */
{
  const w = world();
  check((await ask(w, SHOP)).status === 403, 'no session: 403');
  check((await ask(w, SHOP, await owner('acc-voisin'))).status === 403, "another merchant's owner: 403");
  check((await ask(w, SHOP, `${TILL_COOKIE}=${await tillToken(SECRET, SHOP)}`)).status === 403, "the store's own paired till: 403 (the counter device has no business here)");
  check((await ask(w, '../x', await owner('acc-sante'))).status === 400, 'a malformed slug: 400');
  const body = JSON.parse((await ask(w, SHOP, await owner('acc-sante'))).text);
  check(byId(body, 'till').n === 10, "the neighbour's 25 sales never count in this store");
}

/* 5 · every trade, from facts */
{
  const shop = computeHealth({ type: 'epicerie', products: 10, productsWithBarcode: 9, productsWithCost: 3, stockMoves: 4, stockCounts: 0 });
  check(shop.base === 'boutique', 'an épicerie is scored as a shop');
  check(shop.checks.find((c) => c.id === 'catalog').state === 'done' && shop.checks.find((c) => c.id === 'costs').value === 0.3, 'shop: 9 of 10 barcoded is done, 3 of 10 with a cost is 0.3');
  check(shop.checks.find((c) => c.id === 'stock').value === 0.5, 'shop: movements but no count is half');
  check(!shop.checks.some((c) => c.id === 'menu' || c.id === 'floor'), 'a shop is never asked for a menu or a floor plan');

  const pressing = computeHealth({ type: 'pressing', pressingServices: 12, pressingOrders: 8, pressingTracked: 6 });
  check(pressing.base === 'pressing' && pressing.checks.find((c) => c.id === 'pressing-orders').value === 0.75, 'pressing: 6 of 8 drop-offs with a phone and a pickup date');

  const salon = computeHealth({ type: 'coiffure', services: 5, practitioners: 0, appointments: 3, linkedSales: 1, saleCount: 20 });
  check(salon.base === 'spa' && salon.checks.find((c) => c.id === 'practitioners').state === 'todo', 'salon: no practitioner yet is « to do »');
  check(salon.checks.find((c) => c.id === 'clients').weight === 2, 'beauty trades weigh client records double');

  const hotel = computeHealth({ type: 'hotel', rooms: 9, stays: 10, staysCheckedIn: 9, roomCharges: 0, internalRequests: 2 });
  check(hotel.checks.find((c) => c.id === 'stays').state === 'done' && hotel.checks.find((c) => c.id === 'folios').state === 'todo', 'hotel: 9 of 10 stays checked in is done, no room charge is to do');

  const empty = computeHealth({ type: 'restaurant' });
  check(empty.score === null && empty.measured === 0 && empty.checks.every((c) => c.state === 'unmeasured'), 'nothing readable: no score at all, never a made-up number');
  check(baseOf('') === 'restaurant' && baseOf('Sport') === 'spa', 'an unknown type falls back to the restaurant, case-insensitive');
}

console.log(`\nmerchant-health-test: ${checks} passed, 0 failed`);
