#!/usr/bin/env node
/* Dépenses · le côté serveur. Trois portes, une seule règle : le patron (la
 * session du compte qui possède le magasin) et un opérateur Kiwi nommé, et
 * personne d'autre. Une caisse appairée, un employé (gérant compris) ou un
 * navigateur anonyme ne lisent ni n'écrivent le document `expenses`, ni le
 * résumé du mois, ni les photos de reçus.
 *
 * Et le résumé dit juste : les ventes par journée commerciale (coupure 05:00),
 * remboursements déduits, ventes annulées exclues ; les retraits de caisse du
 * mois, sorties seulement. Le magasin du banc n'est pas un slug de démo
 * (entitledMerchant laisse tout passer sur une démo). */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { onRequestGet: storeGet, onRequestPost: storePost } = await load('functions/api/store.js');
const summary = await load('functions/api/expenses/summary.js');
const receipt = await load('functions/api/expenses/receipt.js');
const { tillToken, makeSession, sessionCookie, employeeToken, employeeCookie, operatorToken, operatorIdToken, DEMO_MERCHANTS } =
  await load('functions/auth/_lib.js');

const AUTH_SECRET = 'expenses-api-secret-0123456789abcd';
const SHOP = 'pasta-bench';
const now = Date.now();
assert.ok(!DEMO_MERCHANTS[SHOP], 'bench store must not be a demo slug');

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER, timezone TEXT, business_cutoff INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE doc_history (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, saved_ts INTEGER);
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE employee_auth_versions (merchant TEXT NOT NULL, member_id TEXT NOT NULL, auth_version INTEGER NOT NULL DEFAULT 0, pin_digest TEXT NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, member_id));
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
CREATE TABLE operators (id TEXT PRIMARY KEY, label TEXT, salt TEXT, hash TEXT, created_ts INTEGER);
CREATE TABLE sales (id TEXT PRIMARY KEY, merchant TEXT, amount REAL, amount_cents INTEGER, method TEXT, ts INTEGER, void_ts INTEGER);
CREATE TABLE cash_session_events (id TEXT PRIMARY KEY, merchant TEXT, session_id TEXT, terminal_id TEXT, event_type TEXT, movement_kind TEXT, movement_amount_cents INTEGER, movement_reason TEXT, actor_id TEXT, occurred_ts INTEGER);
`);
db.prepare(`INSERT INTO accounts VALUES ('acc-1','o@pasta.ma','Pasta Bench','s','h',?,'active',0)`).run(now);
db.prepare(`INSERT INTO accounts VALUES ('acc-2','x@other.ma','Other Shop','s','h',?,'active',0)`).run(now);
db.prepare(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts,timezone,business_cutoff) VALUES (?, '{"expenses":true}','pro','restaurant','acc-1','Pasta Bench','active',0,?,'Africa/Casablanca',5)`).run(SHOP, now);
db.prepare(`INSERT INTO operators VALUES ('op-1','Support','','',1)`).run();
const TEAM = { members: [
  { id: 'm1', firstName: 'Saad', role: 'cashier', function: 'Caissier' },
  { id: 'm2', firstName: 'Mehdi', role: 'manager', function: 'Gérant' },
] };
db.prepare(`INSERT INTO store_docs VALUES (?,'team',?,1,?)`).run(SHOP, JSON.stringify(TEAM), now);
db.prepare(`INSERT INTO store_docs VALUES (?,'expenses',?,1,?)`).run(SHOP, JSON.stringify({ list: [{ id: 'x1', date: '2026-11-03', amountCents: 25000, category: 'meat', updatedAt: 1 }] }), now);

/* Ventes : deux sur la journée commerciale du 3 (20:00 et 02:00 UTC, avant la
   coupure de 05:00 quelle que soit l'heure d'été), une annulée, un
   remboursement le 4, une vente d'octobre hors du mois. */
const T = (d, h) => Date.UTC(2026, 10, d, h);
const sale = db.prepare('INSERT INTO sales VALUES (?,?,?,?,?,?,?)');
sale.run('s1', SHOP, 100, 10000, 'cash', T(3, 20), null);
sale.run('s2', SHOP, 50, 5000, 'card', T(4, 2), null);
sale.run('s3', SHOP, 70, 7000, 'cash', T(4, 13), T(4, 14));
sale.run('s4', SHOP, -15, -1500, 'cash', T(4, 13), null);
sale.run('s5', SHOP, 30, 3000, 'cash', T(4, 13), null);
sale.run('s6', SHOP, 99, 9900, 'cash', Date.UTC(2026, 9, 20, 12), null);
sale.run('o1', 'other-shop', 500, 50000, 'cash', T(3, 12), null);
const cash = db.prepare('INSERT INTO cash_session_events VALUES (?,?,?,?,?,?,?,?,?,?)');
cash.run('c1', SHOP, 'sess', 'term', 'movement', 'out', 5000, 'Légumes', 'm1', T(3, 11));
cash.run('c2', SHOP, 'sess', 'term', 'movement', 'in', 2000, 'Fond', 'm1', T(3, 11));
cash.run('c3', SHOP, 'sess', 'term', 'close', null, null, null, 'm1', T(3, 23));
cash.run('c4', SHOP, 'sess', 'term', 'movement', 'out', 9000, 'Poulet', 'm1', Date.UTC(2026, 9, 20, 12));

const D1 = {
  prepare(q) {
    const st = db.prepare(q);
    const api = (p) => ({
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    });
    return { bind: (...p) => api(p), ...api([]) };
  },
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
};
const media = new Map();
const MEDIA = {
  async put(key, body, opts) { media.set(key, { body: new Uint8Array(await new Response(body).arrayBuffer()), type: opts?.httpMetadata?.contentType }); },
  async get(key) { const o = media.get(key); return o ? { body: o.body, httpMetadata: { contentType: o.type }, writeHttpMetadata(h) { h.set('Content-Type', o.type); } } : null; },
};
const env = { AUTH_SECRET, DB: D1, MEDIA };

const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));
const stranger = sessionCookie(await makeSession('acc-2', AUTH_SECRET));
const till = `kiwi_till=${await tillToken(AUTH_SECRET, SHOP)}`;
const cashier = employeeCookie(await employeeToken(AUTH_SECRET, { merchant: SHOP, staffId: 'm1' }));
const manager = employeeCookie(await employeeToken(AUTH_SECRET, { merchant: SHOP, staffId: 'm2' }));
const operator = `kiwi_op=${await operatorToken(AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(AUTH_SECRET, 'op-1')}`;

const req = (url, cookie, init = {}) => new Request(url, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': '10.0.0.9' } });
let n = 0;
const ok = (name) => { n++; console.log('✓ ' + name); };

/* managerAndTillRefused · le document */
{
  const read = (c) => storeGet({ request: req(`https://k/api/store?feature=expenses&merchant=${SHOP}`, c), env });
  const r1 = await read(owner);
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).data.list[0].id, 'x1');
  const r2 = await read(operator);
  assert.equal(r2.status, 200, 'operator reads for support');
  for (const [who, c] of [['till', till], ['cashier', cashier], ['manager', manager], ['stranger', stranger], ['anonymous', '']]) {
    const r = await read(c);
    const body = await r.text();
    /* Refusé, ou ramené à SON propre magasin (tenantFor ignore un slug qui
       n'est pas le sien) : jamais une ligne de celui-ci. */
    const own = r.status === 200 && JSON.parse(body).merchant !== SHOP;
    assert.ok(r.status === 401 || r.status === 403 || own, who + ' read status ' + r.status);
    assert.ok(!/x1/.test(body), who + ' must not see a row');
  }
  const write = (c) => storePost({ request: req('https://k/api/store', c, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: 'expenses', merchant: SHOP, baseRev: 1, data: { list: [] } }) }), env });
  for (const [who, c] of [['till', till], ['cashier', cashier], ['manager', manager], ['stranger', stranger]]) {
    const r = await write(c);
    assert.ok(r.status === 401 || r.status === 403, who + ' write status ' + r.status);
  }
  assert.equal(JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='expenses'").get(SHOP).data).list.length, 1, 'nothing erased');
  const w = await storePost({ request: req('https://k/api/store', owner, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: 'expenses', merchant: SHOP, baseRev: 1, data: { list: [{ id: 'x1', date: '2026-11-03', amountCents: 26000, category: 'meat', updatedAt: 2 }] } }) }), env });
  assert.equal(w.status, 200, 'owner writes');
  ok('expenses document: owner and operator only; till, staff, manager, other account refused');
}

/* summaryMath */
{
  const get = (c, month = '2026-11') => summary.onRequestGet({ request: req(`https://k/api/expenses/summary?merchant=${SHOP}&month=${month}`, c), env });
  const r = await get(owner);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.month, '2026-11');
  assert.equal(j.cutoff, 5);
  assert.deepEqual(j.salesDays, [{ day: '2026-11-03', salesCents: 15000 }, { day: '2026-11-04', salesCents: 1500 }]);
  assert.deepEqual(j.cashOuts.map((e) => [e.id, e.day, e.movement_amount_cents, e.movement_reason, e.actor_id]), [['c1', '2026-11-03', 5000, 'Légumes', 'm1']]);
  for (const c of [till, cashier, manager, stranger, '']) assert.equal((await get(c)).status, 403);
  assert.equal((await get(owner, '2026-13')).status, 400);
  assert.equal((await get(operator)).status, 200);
  ok('month summary: business-day takings net of refunds and voids, cash-outs only, owner only');
}

/* receiptPrivate */
{
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const up = (c, id = 'exp_abc123', e = env, type = 'image/jpeg') => receipt.onRequestPost({ request: req(`https://k/api/expenses/receipt?merchant=${SHOP}&id=${id}`, c, { method: 'POST', headers: { 'Content-Type': type }, body: jpeg }), env: e });
  const r = await up(owner);
  assert.equal(r.status, 200);
  const { key } = await r.json();
  assert.equal(key, `private/expenses/${SHOP}/exp_abc123.jpg`);
  assert.ok(media.has(key));
  assert.equal((await up(owner, '../x')).status, 400);
  assert.equal((await up(owner, 'exp_abc123', env, 'text/html')).status, 415);
  assert.equal((await up(owner, 'exp_abc123', { AUTH_SECRET, DB: D1 })).status, 503);
  for (const c of [till, manager, stranger, '']) assert.equal((await up(c)).status, 403);
  const read = (c) => receipt.onRequestGet({ request: req(`https://k/api/expenses/receipt?merchant=${SHOP}&id=exp_abc123`, c), env });
  const g = await read(owner);
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('Content-Type'), 'image/jpeg');
  assert.match(g.headers.get('Cache-Control') || '', /private/);
  assert.deepEqual(new Uint8Array(await g.arrayBuffer()), jpeg);
  for (const c of [till, manager, stranger, '']) assert.equal((await read(c)).status, 403);
  assert.equal((await receipt.onRequestGet({ request: req(`https://k/api/expenses/receipt?merchant=${SHOP}&id=exp_none00`, owner), env })).status, 404);
  ok('receipt photos: private prefix, owner only, image types only, fail-soft without storage');
}

console.log(n + ' groupes · expenses api');
