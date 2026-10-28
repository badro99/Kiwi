#!/usr/bin/env node
/* Kiwi · the staff apps in the 2027 skin, per store (owner, 2026-10-23).
 *
 * One switch, features.skin2027 in kiwi-admin, already put a store's guest app
 * (OrderPro) in the 2027 skin. functions/_middleware.js now marks the staff
 * apps the same way, <html data-store-skin="2027">, and each app's head reads
 * the mark as it reads ?skin=2027:
 *   · the caisse and the kitchen screen, for the paired device's store;
 *   · the team app, for the signed-in employee's store.
 * The dashboard is deliberately excluded (owner, 2026-10-27): the 2027 work is
 * a till redesign, so a store's switch must never move the dashboard off the
 * screens it shipped with. Held here: the right store decides, a store without
 * the switch stays as shipped, the dashboard stays as shipped for everyone, a
 * copy cached before the switch does not come back as a bare 304, a database
 * error leaves the page alone, and only these three pages move.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  TILL_COOKIE, TILL_STORE_COOKIE, SESS_COOKIE, EMPLOYEE_COOKIE, tillDeviceToken, makeSession, employeeToken,
} from '../functions/auth/_lib.js';
import { onRequest as middleware } from '../functions/_middleware.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const check = (ok, label, detail) => { assert.ok(ok, label + (detail ? ' · ' + detail : '')); n++; console.log('  ✓ ' + label); };

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
const store = (m, features, account) => sql.prepare("INSERT INTO merchant_config (merchant, features, status, updated_ts, account_id) VALUES (?, ?, 'active', ?, ?)").run(m, JSON.stringify(features), now, account);
store('kit-cafe', { skin2027: true }, 'acc-kit');
store('kit-boutique', {}, 'acc-kit');
store('plain-shop', { skin2027: false }, 'acc-plain');
for (const [id, mail] of [['acc-kit', 'kit@shop.invalid'], ['acc-plain', 'plain@shop.invalid']]) {
  sql.prepare("INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES (?, ?, 'Shop', 'x', 'y', ?, 'active')").run(id, mail, now);
}
const makeD1 = ({ broken = false } = {}) => ({ prepare(q) { let a = []; return {
  bind(...v) { a = v.map((x) => (x === undefined ? null : x)); return this; },
  async first() { if (broken) throw new Error('D1 down'); return sql.prepare(q).get(...a) ?? null; },
  async all() { if (broken) throw new Error('D1 down'); return { results: sql.prepare(q).all(...a) }; },
  async run() { if (broken) throw new Error('D1 down'); const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } });
const SECRET = 'staff-skin-fixture-only';
const PAGE = '<!doctype html><html lang="fr"><head></head><body>app</body></html>';
const assets = { fetch: async () => new Response(PAGE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"fresh"' } }) };
const env = { AUTH_SECRET: SECRET, DB: makeD1(), ASSETS: assets };

const cookies = (pairs) => pairs.filter(Boolean).map(([k, v]) => `${k}=${v}`).join('; ');
async function load(p, { cookie = '', method = 'GET', e = env, status = 200, type = 'text/html; charset=utf-8' } = {}) {
  const headers = { 'Sec-Fetch-Dest': 'document', Accept: 'text/html' };
  if (cookie) headers.Cookie = cookie;
  const res = await middleware({
    request: new Request('https://k.invalid' + p, { method, headers }), env: e,
    next: async () => (status === 304
      ? new Response(null, { status: 304, headers: { ETag: '"old"' } })
      : new Response(PAGE, { status, headers: { 'Content-Type': type, ETag: '"old"' } })),
  });
  const body = res.status === 304 ? '' : await res.text();
  return { res, body, marked: /<html data-store-skin="2027"/.test(body) };
}
const owner = async (aid) => [SESS_COOKIE, await makeSession(aid, SECRET)];
const till = async (m) => [[TILL_COOKIE, await tillDeviceToken(SECRET, m, 0, 'term_staffskin00000001')], [TILL_STORE_COOKIE, m]];
const employee = async (m) => [EMPLOYEE_COOKIE, await employeeToken(SECRET, { merchant: m, staffId: 'st-1', authVersion: 0 })];

console.log('The dashboard is never moved by a store\'s switch');
check(!(await load('/dashboard', { cookie: cookies([await owner('acc-kit')]) })).marked, 'an account with a store switched on still gets the shipped dashboard');
check(!(await load('/dashboard.html', { cookie: cookies([await owner('acc-kit')]) })).marked, 'and on /dashboard.html too');
check(!(await load('/dashboard', { cookie: cookies([await owner('acc-plain')]) })).marked, 'an account with none, likewise');

console.log('The caisse and the kitchen screen follow the paired device\'s store');
check((await load('/kiwi-caisse', { cookie: cookies(await till('kit-cafe')) })).marked, 'a till paired to a switched-on store gets the 2027 caisse');
/* The kitchen page still opens on the owner's session; its paired store decides. */
check((await load('/kiwi-cuisine', { cookie: cookies([...(await till('kit-cafe')), await owner('acc-plain')]) })).marked,
  'and the kitchen screen paired to it, whoever is signed in');
check(!(await load('/kiwi-caisse', { cookie: cookies(await till('plain-shop')) })).marked, 'a till of a store without it keeps the shipped caisse');
check(!(await load('/kiwi-caisse', { cookie: cookies([...(await till('kit-boutique')), await owner('acc-kit')]) })).marked,
  'the device\'s own store decides, not another store of the same owner');
check((await load('/kiwi-caisse', { cookie: cookies([await owner('acc-kit')]) })).marked, 'an unpaired caisse opened by the owner follows the account');

console.log('The team app follows the employee\'s store');
check((await load('/kiwi-serveur', { cookie: cookies([await employee('kit-cafe')]) })).marked, 'an employee of a switched-on store gets the 2027 team app');
check(!(await load('/kiwi-serveur', { cookie: cookies([await employee('plain-shop')]) })).marked, 'an employee of another store does not');
check(!(await load('/kiwi-serveur')).marked, 'nobody signed in: the shipped page');

console.log('Edges');
const cached = await load('/kiwi-caisse', { cookie: cookies(await till('kit-cafe')), status: 304 });
check(cached.res.status === 200 && cached.marked && !cached.res.headers.get('ETag'),
  'a copy cached before the switch comes back marked, not as a bare 304', `${cached.res.status} ${cached.res.headers.get('ETag')}`);
check(cached.res.headers.get('Cache-Control') === 'no-cache', 'and a marked page is never served from a stale cache');
check((await load('/kiwi-caisse', { cookie: cookies(await till('plain-shop')), status: 304 })).res.status === 304, 'an unmarked page keeps its 304');
const down = await load('/kiwi-serveur', { cookie: cookies([await employee('kit-cafe')]), e: { ...env, DB: makeD1({ broken: true }) } });
check(down.res.status === 200 && !down.marked, 'a database error leaves the page as shipped');
check(!(await load('/kiwi-serveur', { cookie: cookies([await employee('kit-cafe')]), type: 'application/json' })).marked, 'only an HTML page is touched');
check(!(await load('/reset.html', { cookie: cookies([await owner('acc-kit')]) })).marked, 'and only the three staff pages');

console.log('Each staff page reads the mark before its first paint');
for (const [file, flag] of [['kiwi-caisse.html', 'till'], ['kiwi-cuisine.html', 'kds'], ['kiwi-serveur.html', 'team']]) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  check(src.includes(`on = document.documentElement.getAttribute('data-store-skin') === '2027' || /[?&]skin=2027(?:&|$)/.test(location.search) || localStorage.getItem('kiwiSkin2027:${flag}') === '1'`),
    `${file} turns the kit on for the store's mark, as for ?skin=2027`);
}

console.log('The dashboard has no 2027 design (it left on 27 Oct 2026)');
{
  const src = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  check(!/getAttribute\('data-store-skin'\)/.test(src), 'dashboard.html does not read the store mark, so no switch can move it');
  check(!src.includes('kiwiSkin2027:dashboard') && !/setAttribute\('data-skin-2027'/.test(src), 'and loads no kit: no flag, no 2027 head loader');
}

console.log(`✓ staff-skin-test · ${n} checks`);
