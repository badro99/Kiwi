#!/usr/bin/env node
/* tools/sale-replay-visit-binding-test.mjs
 *
 * Restaurant MixMax, 11–12 septembre 2026. Le même encaissement est entré au
 * registre sous deux ou trois ids : même ticket, même milliseconde, même
 * montant, mêmes lignes (4 lignes en trop, 320 MAD). Mécanisme prouvé en
 * production : /api/sale dérivait l'id de « la visite ouverte de cette table »
 * au moment où la requête arrivait. Rejouée plus tard par la file de la caisse,
 * la même vente tombait sur une AUTRE visite (ouverte après elle, parfois le
 * lendemain soir) et recevait un nouvel id, donc une nouvelle ligne — et la
 * vieille addition pouvait solder la table de la nouvelle tablée.
 *
 * Banc : la vraie Pages Function contre SQLite construit depuis schema.sql,
 * avec un vrai cookie de caisse appairée. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as sale from '../functions/api/sale.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'test-secret-for-this-process-only';
const MERCHANT = 'resto-replay';
const MIN = 60000;

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const db = new DatabaseSync(':memory:');
for (const stmt of fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
  db.exec(stmt);
}
const facade = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
      _exec() { return st.run(); },
    };
    return st;
  },
  batch(s) { return s.map((x) => x._exec()); },
};
const env = { DB: facade, AUTH_SECRET };
const exec = (sql, ...args) => db.prepare(sql).run(...args);
const rows = (sql, ...args) => db.prepare(sql).all(...args);

exec('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)', MERCHANT, '{}', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT, 0)}`;

async function post(body) {
  const request = new Request('https://kiwi.test/api/sale', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  });
  const response = await sale.onRequestPost({ request, env });
  return { status: response.status, body: await response.json().catch(() => null) };
}
function visit(id, table, openedTs, status = 'open') {
  exec(`INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts, closed_ts)
        VALUES (?, ?, 'table', ?, ?, ?, ?, ?)`, id, MERCHANT, table, status, openedTs, openedTs, status === 'open' ? null : openedTs + 30 * MIN);
}

const now = Date.now();
const paidAt = now - 26 * 60 * MIN; // hier soir
const basket = [{ n: 'Pizza Al Tonno', q: 1, t: 45, i: 'it_53' }, { n: 'Pizza Bolognese', q: 1, t: 55, i: 'it_52' }];
const body = { merchant: MERCHANT, id: 'sale-ref-96-client', amount: 100, amountCents: 10000, method: 'cash', ref: '96', label: '96', table: '8', ts: paidAt, lines: basket, channel: 'dining' };

/* 1. The original visit, opened a second after the payment (the till opens it
      while settling), is still open: the sale binds to it as before. */
visit('tsx-original', '8', paidAt + 1000);
const first = await post(body);
check('the first delivery is stored', first.status === 200 && first.body && first.body.ok, JSON.stringify(first));
check('it keeps its payment ID while linking to the visit opened at payment time',
  first.body && first.body.id === body.id
    && rows('SELECT session_id FROM sales WHERE id = ?', body.id)[0]?.session_id === 'tsx-original', first.body && first.body.id);

/* 2. That visit closes. The next evening a NEW party sits at table 8, and the
      till replays its queue. */
exec("UPDATE table_sessions SET status = 'closed', closed_ts = ? WHERE id = 'tsx-original'", paidAt + 5 * MIN);
visit('tsx-next-evening', '8', now - 30 * MIN);
const replay = await post(body);
check('the replay is acknowledged', replay.status === 200 && replay.body && replay.body.ok, JSON.stringify(replay));
check('the replay resolves to the ORIGINAL ledger row', replay.body && replay.body.id === body.id, JSON.stringify(replay.body));
const sameTicket = rows('SELECT id FROM sales WHERE merchant = ? AND ref = ?', MERCHANT, '96');
check('the ledger still holds exactly one row for this payment', sameTicket.length === 1, JSON.stringify(sameTicket));
const newParty = rows("SELECT status FROM table_sessions WHERE id = 'tsx-next-evening'")[0];
check("an old payment never closes the new party's table", newParty && newParty.status === 'open', JSON.stringify(newParty));

/* 3. A visit opened well after the payment is never used to derive an id,
      even when no earlier row exists (first delivery happens late). */
const late = await post(Object.assign({}, body, { id: 'sale-ref-97-client', ref: '97', ts: paidAt + 60 * MIN }));
check('a late first delivery is stored under its own client id', late.status === 200 && late.body && late.body.id === 'sale-ref-97-client', JSON.stringify(late.body));
check('and leaves the new party open', rows("SELECT status FROM table_sessions WHERE id = 'tsx-next-evening'")[0].status === 'open');

/* 4. Two genuinely different sales that share a receipt label and basket but
      not the millisecond stay two rows. */
const other = await post(Object.assign({}, body, { id: 'sale-ref-96-b', table: undefined, ts: paidAt + 9 * MIN }));
check('a same-basket sale at another time is a second sale', other.status === 200 && other.body && other.body.id === 'sale-ref-96-b', JSON.stringify(other.body));
check('the ledger now holds two rows for ticket 96', rows('SELECT id FROM sales WHERE merchant = ? AND ref = ?', MERCHANT, '96').length === 2);

/* 5. Equal split parts share ticket, time, amount and basket, and are real. */
visit('tsx-split', '5', now - 10 * MIN);
const splitBody = { merchant: MERCHANT, amount: 40, amountCents: 4000, method: 'cash', ref: 'T5', label: 'Table 5', session: 'tsx-split', ts: now - 5 * MIN, lines: [{ n: 'Tacos', q: 1, t: 40, i: 'it_40' }], channel: 'dining' };
const partA = await post(Object.assign({}, splitBody, { split: { index: 0, count: 2 } }));
const partB = await post(Object.assign({}, splitBody, { split: { index: 1, count: 2 } }));
check('both equal split parts are stored', partA.status === 200 && partB.status === 200 && partA.body.id !== partB.body.id, JSON.stringify([partA.body, partB.body]));
check('two split rows exist', rows("SELECT id FROM sales WHERE merchant = ? AND ref = 'T5'", MERCHANT).length === 2);

if (failures) { console.log(`\nsale-replay-visit-binding-test: ${failures} failure(s)`); process.exit(1); }
console.log('\nsale-replay-visit-binding-test: a replayed payment keeps one ledger row and never settles a later visit');
