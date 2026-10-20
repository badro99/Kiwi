#!/usr/bin/env node
/* Kiwi · d1-variable-limit-test — no statement binds more than D1 accepts.
 *   node tools/d1-variable-limit-test.mjs
 *
 * Production D1 refuses a statement with more than 100 bound parameters
 * (« too many SQL variables at offset … », measured on kiwi-sales on
 * 2026-10-21: 100 passes, 101 fails). node:sqlite, which every other suite
 * runs on, accepts 32 766, so a route that binds one `?` per item passed
 * every test and broke for real at the 101st.
 *
 * It did: the till sends its stock queue 200 movements at a time, and
 * /api/inventory/movements bound one `?` per movement in its duplicate check
 * and 21 + 2 per movement in each insert's guard. Pasta Corner's queue passed
 * 39 movements on 30 September; from then on every batch answered 503, and on
 * 20 October its heartbeat reported 1 156 movements waiting.
 *
 * This suite runs the real handlers over a D1 stand-in that refuses what
 * production refuses. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as movementPost } from '../functions/api/inventory/movements.js';
import { purgeExpired } from '../functions/api/tickets/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'd1-variable-limit-secret';
const MERCHANT = 'd1-limit-merchant';
const D1_MAX_VARS = 100;
let checks = 0, refusedStatements = 0;
function check(condition, message, detail) {
  checks += 1;
  assert.ok(condition, message + (detail ? ' · ' + detail : ''));
  console.log(`  ✓ ${message}`);
}

/* The same surface as the D1 binding, with D1's ceiling on bound parameters. */
function d1(raw) {
  const guard = (args) => {
    if (args.length > D1_MAX_VARS) {
      refusedStatements += 1;
      throw new Error(`too many SQL variables (${args.length}): SQLITE_ERROR`);
    }
  };
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values.map((v) => (v === undefined ? null : v)); return statement; },
        async first(col) { guard(args); const row = raw.prepare(sql).get(...args) || null; return row && col ? row[col] ?? null : row; },
        async all() { guard(args); return { results: raw.prepare(sql).all(...args), success: true, meta: {} }; },
        async run() { guard(args); const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
        __run() { guard(args); const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
      };
      return statement;
    },
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = statements.map((s) => s.__run()); raw.exec('COMMIT'); return out; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
    async exec(sql) { raw.exec(sql); return { count: 1 }; },
  };
}
function fullDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  return { raw, DB: d1(raw) };
}

/* ── the stand-in itself refuses what production refuses ─────────────── */
{
  const { DB } = fullDb();
  const marks = (n) => Array.from({ length: n }, () => '?').join(',');
  const ids = (n) => Array.from({ length: n }, (_, i) => 'x' + i);
  const ok = await DB.prepare(`SELECT COUNT(*) AS n FROM inventory_movements WHERE id IN (${marks(100)})`).bind(...ids(100)).first();
  check(ok && ok.n === 0, 'the D1 stand-in accepts 100 bound parameters, like production');
  const refused = await DB.prepare(`SELECT COUNT(*) AS n FROM inventory_movements WHERE id IN (${marks(101)})`).bind(...ids(101)).first().then(() => false, () => true);
  check(refused, 'the D1 stand-in refuses 101, like production');
}

/* ── the till's stock queue, 200 movements in one batch ──────────────── */
const owner = sessionCookie(await makeSession('d1-limit-owner', SECRET)).split(';')[0];
function stockStore() {
  const { raw, DB } = fullDb();
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('d1-limit-owner', 'd1-limit@example.test', 'Owner', 'Store', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Store', 'd1-limit-owner', now);
  const env = { DB, AUTH_SECRET: SECRET };
  const post = (movements) => movementPost({
    env,
    request: new Request('https://kiwi.test/api/inventory/movements', {
      method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, movements }),
    }),
  });
  return { raw, post, now };
}
const saleMovements = (n, now, prefix = 'mv') => Array.from({ length: n }, (_, i) => ({
  id: `${prefix}-${String(i).padStart(4, '0')}`, itemId: 'pasta-' + (i % 7), locationId: 'principal',
  qty: -1, reason: 'sale', refType: 'sale', refId: 'T-' + i, occurredTs: now - (n - i) * 1000,
}));

{
  const { raw, post, now } = stockStore();
  const batch = saleMovements(200, now);
  refusedStatements = 0;
  const res = await post(batch);
  const body = await res.json().catch(() => ({}));
  check(res.status === 200, 'a full batch of 200 sale movements is accepted', `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
  check(Array.isArray(body.accepted) && body.accepted.length === 200, 'every one of the 200 is acknowledged', `${body.accepted && body.accepted.length}`);
  const stored = raw.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE merchant = ?').get(MERCHANT).n;
  check(stored === 200, 'the 200 movements are stored', `${stored} rows`);
  check(refusedStatements === 0, 'no statement went over 100 bound parameters', `${refusedStatements} refused`);

  const again = await post(batch);
  const againBody = await again.json().catch(() => ({}));
  check(again.status === 200 && againBody.accepted && againBody.accepted.length === 200,
    'replaying the same 200 is idempotent (the till resends after a lost answer)', `HTTP ${again.status}`);
  check(raw.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE merchant = ?').get(MERCHANT).n === 200,
    'the replay stores nothing twice');
}

{
  /* An id that already belongs to another store, at position 150: refused by
     name, so the till can set that one line aside and send the rest. */
  const { raw, post, now } = stockStore();
  const batch = saleMovements(200, now, 'cross');
  raw.prepare(`INSERT INTO inventory_movements (id,merchant,item_id,location_id,qty_milli,reason,occurred_ts,srv_ts,created_ts)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(batch[150].id, 'another-store', 'x', 'principal', -1000, 'sale', now, 1, now);
  const res = await post(batch);
  const body = await res.json().catch(() => ({}));
  check(res.status === 409 && body.error === 'id-conflict' && (body.ids || []).includes(batch[150].id),
    'an id owned by another store, 150th of 200, is refused by name', `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
  check(raw.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE merchant = ?').get(MERCHANT).n === 0,
    'and nothing of that batch is written before the refusal');
}

{
  /* The same id sent again with another quantity, deep in a large batch. */
  const { post, now } = stockStore();
  const first = saleMovements(120, now, 'edit');
  check((await post(first)).status === 200, 'a batch of 120 is accepted');
  const changed = first.map((m, i) => (i === 110 ? { ...m, qty: -2 } : m));
  const res = await post(changed);
  const body = await res.json().catch(() => ({}));
  check(res.status === 409 && (body.ids || []).includes(first[110].id),
    'a changed payload at position 110 is refused by name, not with a 503', `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
}

/* ── the ticket board's 20-day purge ─────────────────────────────────── */
{
  const { raw, DB } = fullDb();
  const now = Date.now();
  const ins = raw.prepare(`INSERT INTO kiwi_tickets (body, status, created_ts, updated_ts, expires_ts) VALUES (?, 'done', ?, ?, ?)`);
  for (let i = 0; i < 150; i++) ins.run('expired ticket ' + i, now - 30 * 86400000, now - 25 * 86400000, now - 1000);
  const env = { DB, MEDIA: { async delete() {} } };
  refusedStatements = 0;
  let purged = 0, threw = null;
  try { purged += await purgeExpired(env, now); purged += await purgeExpired(env, now); } catch (error) { threw = error; }
  check(!threw, '150 expired tickets purge without a statement over the limit', threw && threw.message);
  check(purged === 150 && raw.prepare('SELECT COUNT(*) AS n FROM kiwi_tickets').get().n === 0,
    'two passes remove all 150', `${purged} purged`);
}

console.log(`\n✓ d1-variable-limit-test · ${checks} checks`);
