#!/usr/bin/env node
/* Kiwi · inventory-cursor-integrity-test — no till skips another till's stock.
 *   node tools/inventory-cursor-integrity-test.mjs
 *
 * Runs the real /api/inventory/movements handlers over node:sqlite and the
 * real assets/inventory-ledger.js in two vm "tills" that talk to them.
 *
 *   1. A reader never advances past a movement whose cursor was allocated but
 *      not yet inserted (the write takes nextCursor() and inserts afterwards;
 *      the GET cursor stays CURSOR_LAG_MS behind the clock, like the order
 *      queue's).
 *   2. A till that acknowledges its own approved movement (maison counter
 *      loss, pushApproved) does not move its read cursor over movements other
 *      tills wrote that it has not pulled yet.
 *   3. Automatic reasons keep their meaning: a till's "sale" only takes stock
 *      out and a "sale-reversal" only puts it back; production, which no
 *      screen writes, needs the same authority as a loss.
 * Cases 1, 2 and 3 are red on the code before 27 October 2026. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, TILL_COOKIE, tillToken } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/inventory/movements.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'inventory-cursor-integrity-secret-32';
const MERCHANT = 'cursor-shop';
let checks = 0;
function check(condition, message, detail) {
  checks += 1;
  assert.ok(condition, message + (detail ? ' · ' + detail : ''));
  console.log(`  ✓ ${message}`);
}

/* The D1 surface over SQLite, with one optional gate: the next movement INSERT
 * waits until the test lets it go, which is the window between nextCursor()
 * and the row becoming visible in production. */
const gate = { armed: false, reached: null, release: null };
function d1(raw) {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values.map((v) => (v === undefined ? null : v)); return statement; },
        async first() { return raw.prepare(sql).get(...args) || null; },
        async all() { return { results: raw.prepare(sql).all(...args), success: true, meta: {} }; },
        async run() {
          if (gate.armed && /INSERT OR IGNORE INTO inventory_movements/.test(sql)) {
            gate.armed = false;
            const go = new Promise((resolve) => { gate.release = resolve; });
            gate.reached();
            await go;
          }
          const r = raw.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes || 0) } };
        },
      };
      return statement;
    },
    async batch(statements) {
      const out = [];
      for (const s of statements) out.push(await s.run());
      return out;
    },
  };
}

const raw = new DatabaseSync(':memory:');
raw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('cursor-owner', 'cursor@example.test', 'Cursor Owner', 'Cursor Shop', 's', 'h', now);
raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run(MERCHANT, '{}', 'boutique', 'active', 'Cursor Shop', 'cursor-owner', now);
const env = { DB: d1(raw), AUTH_SECRET: SECRET };
const OWNER = `${SESS_COOKIE}=${await makeSession('cursor-owner', SECRET)}`;
const TILL = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;

async function call(cookie, url, init = {}) {
  const request = new Request(new URL(url, 'https://kiwi.test'), {
    ...init, headers: { ...(init.headers || {}), cookie },
  });
  return (request.method === 'POST' ? onRequestPost : onRequestGet)({ request, env });
}
const post = (cookie, movements) => call(cookie, '/api/inventory/movements', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ merchant: MERCHANT, movements }),
});
const get = async (since) => (await call(OWNER, `/api/inventory/movements?merchant=${MERCHANT}&since=${since}`)).json();
let n = 0;
const sale = (qty = -1, extra = {}) => ({
  id: `mv-${++n}`, itemId: 'shirt', qty, reason: 'sale', refType: 'sale', refId: `T-${n}`,
  occurredTs: Date.now(), ...extra,
});

/* ── 1. a reader never passes an allocated, not yet inserted cursor ────── */
{
  const late = sale();
  const reached = new Promise((resolve) => { gate.reached = resolve; });
  gate.armed = true;
  const slow = post(OWNER, [late]);           // takes its cursor, then waits
  await reached;
  const fast = await post(OWNER, [sale()]);   // a later cursor, committed first
  check(fast.status === 200, 'a second till writes while the first is between cursor and insert');
  const first = await get(0);
  check(!first.movements.some((m) => m.id === late.id), 'the reader does not see the pending row yet');
  gate.release();
  check((await slow).status === 200, 'the first write then lands');
  const second = await get(first.cursor);
  check(second.movements.some((m) => m.id === late.id),
    'the next poll from the returned cursor still delivers it', `cursor ${first.cursor}`);
  check(first.cursor <= Date.now() - 2000 + 50, 'the returned cursor stays behind the clock by the lag');
}

/* A full page of fresh rows does not ask the till to loop on the same page. */
{
  const insert = raw.prepare(`INSERT INTO inventory_movements
    (id, merchant, item_id, variant_id, location_id, qty_milli, reason, occurred_ts, srv_ts, created_ts)
    VALUES (?, 'cursor-page', 'x', '', 'principal', -1000, 'sale', ?, ?, ?)`);
  const t = Date.now();
  for (let i = 0; i < 500; i++) insert.run(`page-${i}`, t, t + i, t);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run('cursor-page', '{}', 'boutique', 'active', 'Page', 'cursor-owner', t);
  const direct = await (await onRequestGet({ env, request: new Request('https://kiwi.test/api/inventory/movements?merchant=cursor-page&since=0', {
    headers: { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'cursor-page')}` },
  }) })).json();
  check(direct.movements.length === 500 && direct.more === false && direct.cursor === 0 && direct.next === t + 499,
    'a full page inside the lag window keeps its cursor, and names where the next page starts',
    `more ${direct.more} cursor ${direct.cursor} next ${direct.next}`);
}

/* ── two real ledgers in their own vm, talking to the real handlers ────── */
const ledgerSource = fs.readFileSync(path.join(ROOT, 'assets/inventory-ledger.js'), 'utf8');
function till(name, cookie) {
  const memory = new Map();
  const localStorage = {
    getItem: (k) => memory.has(k) ? memory.get(k) : null,
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  const window = {
    localStorage,
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => MERCHANT },
    addEventListener() {},
  };
  window.window = window;
  const fetch = (url, init = {}) => call(cookie, url, init);
  const context = vm.createContext({
    window, localStorage, navigator: { onLine: true }, crypto: globalThis.crypto, fetch,
    console, Date, Math, JSON, Map, Set, Promise, URL,
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
  });
  vm.runInContext(ledgerSource, context, { filename: `inventory-ledger.js (${name})` });
  return window.KiwiInventory;
}

/* ── 2. acknowledging an approved write does not skip other tills ──────── */
{
  const A = till('A', OWNER);
  const B = till('B', OWNER);
  check(await A.sync(), 'till A pulls the shared ledger');
  const fromB = B.add(sale(-2, { itemId: 'scarf' }));
  check(fromB && await B.sync() && B.pending() === 0, 'till B sends a sale till A has not pulled');
  // Till A declares a loss with a manager's approval: posted at once, then
  // acknowledged into its own ledger with the server cursor (pushApproved).
  const loss = { id: `loss-${++n}`, itemId: 'scarf', qty: -1, reason: 'loss', occurredTs: Date.now() };
  const res = await post(OWNER, [loss]);
  const accepted = (await res.json()).accepted[0];
  A.acknowledge([{ ...loss, cursor: accepted.cursor }]);
  check(await A.sync(), 'till A syncs after the acknowledgement');
  check(A.history().some((r) => r.id === fromB.id),
    'till A still receives till B\'s earlier sale', `balance ${A.balance('scarf')}`);
  check(A.balance('scarf') === -3, 'both movements count once on till A');
}

/* ── 3. automatic reasons keep their direction and their scope ─────────── */
{
  const refused = async (movement, status, error, label) => {
    const r = await post(TILL, [movement]);
    const j = await r.json();
    check(r.status === status && j.error === error, label, `${r.status} ${j.error}`);
  };
  await refused(sale(+5), 400, 'bad-movement', 'a till cannot add stock under the "sale" reason');
  await refused(sale(-5, { reason: 'sale-reversal' }), 400, 'bad-movement',
    'a till cannot remove stock under the "sale-reversal" reason');
  await refused({ ...sale(-4), reason: 'production-input' }, 403, 'reason-forbidden',
    'a till cannot write production input without a manager');
  await refused({ ...sale(+4), reason: 'production-output' }, 403, 'reason-forbidden',
    'a till cannot write production output without a manager');
  check((await post(TILL, [sale(-1)])).status === 200, 'a till sale still goes through');
  check((await post(TILL, [sale(+1, { reason: 'sale-reversal' })])).status === 200, 'a till sale reversal still goes through');
  check((await post(OWNER, [{ ...sale(+3), reason: 'production-output' }])).status === 200,
    'the owner may still record production');
  const ownerWrong = await post(OWNER, [sale(+3)]);
  check(ownerWrong.status === 400, 'a positive "sale" is refused for the owner too');

  // The till's own queue: a refused production row is set aside alone and
  // the sale behind it still reaches the server.
  const T = till('T', TILL);
  const prod = T.add({ id: `prod-${++n}`, itemId: 'dough', qty: -1, reason: 'production-input', occurredTs: Date.now() });
  const sold = T.add(sale(-1, { itemId: 'dough' }));
  await T.sync();
  const status = T.status();
  check(status.pending === 0 && status.refused === 1 && status.refusedEntries[0].id === prod.id,
    'the till sets aside only the production row', JSON.stringify(status));
  check(!!raw.prepare('SELECT 1 FROM inventory_movements WHERE id = ?').get(sold.id),
    'the sale queued with it reaches the server');
}

console.log(`inventory-cursor-integrity-test: ${checks} checks passed`);
