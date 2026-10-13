#!/usr/bin/env node
/* « À suivre » et file de secours du relais cuisine.
 *
 * Le bon d'entrée porte l'annonce (`following`), le bon « Suite » la éteint.
 * Mais le relais rejoue un bon qui a échoué APRÈS les bons suivants : un wifi
 * qui tombe pendant l'envoi de l'entrée, la suite part, puis l'entrée arrive.
 * Sans garde, l'entrée écrivait alors une annonce qui ne serait plus jamais
 * éteinte (la suite est déjà passée) : la cuisine lisait « À suivre · 2×
 * Tajine » sur un plat déjà envoyé.
 *
 * Le serveur compare l'horodatage que la caisse a mis dans l'identifiant des
 * deux bons (même horloge, aucun écart d'horloge à craindre) : si une suite de
 * la même table est née APRÈS l'entrée, l'annonce n'a plus rien à dire.
 *
 *   node tools/course-following-retry-test.mjs
 *
 * Base SQLite en mémoire bâtie depuis schema.sql, commerce de test qui
 * n'existe que dans ce banc. Aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MERCHANT = 'course-retry-bistro';
const AUTH_SECRET = 'course-retry-secret';

function makeDb() {
  const sql = new DatabaseSync(':memory:');
  for (const stmt of fs.readFileSync(path.join(root, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) sql.exec(stmt);
  sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
    .run(MERCHANT, JSON.stringify({ orderpro: true }), 'Course Retry Bistro', Date.now());
  const DB = {
    prepare(query) {
      let args = [];
      const st = {
        bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
        first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
        all() { return { results: sql.prepare(query).all(...args) }; },
        run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
      };
      return st;
    },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out; }
      catch (e) { try { sql.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  };
  return { sql, env: { DB, AUTH_SECRET } };
}
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(env, method, body, query = '') {
  const request = new Request('https://kiwi.test/api/order/queue' + query, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const res = await (method === 'POST' ? queue.onRequestPost : queue.onRequestGet)({ request, env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
}
/* Le même gabarit que KiwiKitchenRelay.newId : ord- + Date.now() en base 36. */
const idAt = (ms, salt) => 'ord-' + ms.toString(36) + '-' + salt;
const line = (name, qty) => [{ name, qty, unitPrice: 20, note: '', visuals: [], station: '' }];
const starter = (id, table, following) => ({ merchant: MERCHANT, create: { id, mode: 'table', table, server: 'Salma', lines: line('Harira', 2), following } });
const suite = (id, table) => ({ merchant: MERCHANT, create: { id, mode: 'table', table, server: 'Salma', course: 'suite', lines: line('Tajine kefta', 2) } });
const followingOf = async (env, id) => {
  const g = await call(env, 'GET', null, `?merchant=${MERCHANT}&since=0`);
  const o = g.body.orders.find((x) => x.id === id);
  return o ? o.following : 'absent';
};

const T0 = Date.now() - 600000;
console.log('■ the starter ticket arrives after the suite (relay retry)');
{
  const { env } = makeDb();
  const s = await call(env, 'POST', suite(idAt(T0 + 120000, 'aaaaaaaa'), '7'));
  check(s.status === 200 && s.body.ok, 'the suite ticket lands first');
  await sleep(3);
  const a = await call(env, 'POST', starter(idAt(T0, 'bbbbbbbb'), '7', [{ name: 'Tajine kefta', qty: 2 }]));
  check(a.status === 200 && a.body.ok && a.body.number != null, 'the late starter is accepted as a normal ticket');
  check(await followingOf(env, idAt(T0, 'bbbbbbbb')) === undefined, 'but it announces nothing: the suite it announces already left');
}

console.log('■ the normal order is untouched');
{
  const { env } = makeDb();
  await call(env, 'POST', starter(idAt(T0, 'cccccccc'), '7', [{ name: 'Tajine kefta', qty: 2 }]));
  check(JSON.stringify(await followingOf(env, idAt(T0, 'cccccccc'))) === JSON.stringify([{ name: 'Tajine kefta', qty: 2 }]),
    'starter first: the announcement is kept');
  await call(env, 'POST', suite(idAt(T0 + 120000, 'dddddddd'), '7'));
  check(await followingOf(env, idAt(T0, 'cccccccc')) === undefined, 'and the suite still extinguishes it');
}

console.log('■ a later round is a new announcement');
{
  const { env } = makeDb();
  await call(env, 'POST', suite(idAt(T0, 'eeeeeeee'), '7'));
  await call(env, 'POST', starter(idAt(T0 + 1800000, 'ffffffff'), '7', [{ name: 'Pastilla', qty: 1 }]));
  check(JSON.stringify(await followingOf(env, idAt(T0 + 1800000, 'ffffffff'))) === JSON.stringify([{ name: 'Pastilla', qty: 1 }]),
    'a starter minted AFTER an earlier suite announces its own suite');
}

console.log('■ another table is unaffected');
{
  const { env } = makeDb();
  await call(env, 'POST', suite(idAt(T0 + 120000, 'gggggggg'), '8'));
  await call(env, 'POST', starter(idAt(T0, 'hhhhhhhh'), '7', [{ name: 'Tajine kefta', qty: 2 }]));
  check((await followingOf(env, idAt(T0, 'hhhhhhhh'))) && true, 'a suite on table 8 does not silence table 7');
}

console.log('■ foreign id shapes keep the old behaviour');
{
  const { env } = makeDb();
  await call(env, 'POST', suite('ord-legacy-suite-1', '7'));
  await call(env, 'POST', starter('ord-legacy-start-1', '7', [{ name: 'Tajine kefta', qty: 2 }]));
  check(Array.isArray(await followingOf(env, 'ord-legacy-start-1')), 'an id without a readable timestamp is never silenced');
}

console.log(`\ncourse-following-retry: ${checks} passed`);
