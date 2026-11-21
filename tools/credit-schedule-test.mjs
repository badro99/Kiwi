#!/usr/bin/env node
/* Carnet de crédit du patron, côté serveur (functions/api/_credit-plan.js,
 * _credit-accounts.js, credit/book.js, credit/till.js).
 *   · les règles : premier échéancier = une ligne du montant entier, somme des
 *     lignes ≤ ce qui est dû, cascade d'un règlement (entier, partiel, trop-perçu) ;
 *   · l'idempotence : relire le carnet ne verse jamais deux fois un règlement ;
 *   · les règlements viennent des carnets existants (ardoise de l'épicerie,
 *     notes de la boutique payées par /api/sale), jamais d'ailleurs ;
 *   · le plafond se juge au serveur, l'accord d'un responsable passe par
 *     verifyStaffPin et seul un rôle de responsable l'accorde ;
 *   · un magasin ne lit ni n'écrit le carnet d'un autre.
 * Base SQLite du banc (server-money-fixture), vrais handlers. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as plan from '../functions/api/_credit-plan.js';
import { settle } from '../functions/api/_credit-accounts.js';
import * as book from '../functions/api/credit/book.js';
import * as tillRoute from '../functions/api/credit/till.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = await fixture(ROOT);
const { sql, env, merchant } = f;
let n = 0;
const ok = (name) => { n++; console.log('  ✓ ' + name); };

/* ── 1. les règles, sans base ── */
{
  const seeded = plan.seedRows(45000, '2026-12-01', 1, 'seed-1');
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].amountCents, 45000);
  assert.equal(seeded[0].status, 'pending');
  assert.deepEqual(plan.seedRows(0, '2026-12-01', 1, 'x'), [], 'nothing owed, nothing seeded');
  ok('seeding: one row, the whole balance');

  const rows = plan.cleanRows([
    { id: 'row-aaa1', amountCents: 10000, dueDate: '2026-12-10' },
    { id: 'row-aaa2', amountCents: 20000, dueDate: '2026-12-01' },
    { id: 'row-aaa3', amountCents: 15000, dueDate: '2026-12-20', note: 'fin du mois' },
  ], { now: 5 }).rows;
  assert.equal(plan.checkTotal(rows, 45000), '');
  assert.equal(plan.checkTotal(rows, 44999), 'schedule-exceeds-balance');
  assert.equal(plan.cleanRows([{ id: 'row-bad1', amountCents: 100, dueDate: '2026-02-30' }]).error, 'bad-schedule-date');
  assert.equal(plan.cleanRows([{ id: 'row-bad2', amountCents: 10.5, dueDate: '2026-02-03' }]).error, 'bad-schedule-amount');
  assert.equal(plan.cleanRows([{ id: 'dup-row1', amountCents: 1, dueDate: '2026-02-03' }, { id: 'dup-row1', amountCents: 1, dueDate: '2026-02-04' }]).error, 'bad-schedule-id');
  ok('rows total never above the balance; bad dates, amounts, ids refused');

  let w = plan.waterfall(rows, 20000, 9);
  assert.deepEqual(w.collected, ['row-aaa2'], 'the earliest date is covered first');
  assert.equal(w.reduced, null);
  assert.equal(w.leftoverCents, 0);
  w = plan.waterfall(rows, 25000, 9);
  assert.deepEqual(w.collected, ['row-aaa2']);
  assert.deepEqual(w.reduced, { id: 'row-aaa1', fromCents: 10000, toCents: 5000 }, 'a partial payment reduces the next row');
  assert.equal(plan.pendingTotal(w.rows), 20000);
  w = plan.waterfall(rows, 60000, 9);
  assert.equal(w.collected.length, 3, 'every row collected');
  assert.equal(w.appliedCents, 45000);
  assert.equal(w.leftoverCents, 15000, 'over-payment creates no row, it is reported');
  assert.equal(rows[0].status, 'pending', 'the input rows are not mutated');
  ok('waterfall: full, partial, over-payment');

  const v = plan.viewRows(rows, 30000);
  assert.equal(v.overCents, 15000);
  assert.equal(v.scheduledCents, 30000, 'the view never shows more than is owed');
  assert.equal(v.pending.find((r) => r.id === 'row-aaa3'), undefined, 'the latest row is trimmed first');
  assert.equal(plan.viewRows(rows.slice(0, 1), 30000).unscheduledCents, 20000, 'the rest without a date is shown');
  ok('view: clamped to the balance from the latest row, unscheduled remainder');

  const pieces = plan.unpaidPieces([{ cents: 5000, day: '2026-08-01' }, { cents: 3000, day: '2026-10-15' }, { cents: 2000, day: '2026-11-20' }], 6000);
  assert.deepEqual(pieces, [{ cents: 2000, day: '2026-10-15' }, { cents: 2000, day: '2026-11-20' }]);
  const age = plan.ageing([{ shownCents: 1000, dueDate: '2026-11-25' }, { shownCents: 700, dueDate: '2026-11-01' }], [{ cents: 400, day: '2026-07-01' }], '2026-11-21');
  assert.deepEqual(age.buckets, { notDue: 1000, d1_30: 700, d31_60: 0, d61_90: 0, d90p: 400 });
  assert.equal(age.daysLate, 143);
  assert.equal(age.nextDue, '2026-11-25');
  assert.equal(plan.bucketFor(30), 'd1_30'); assert.equal(plan.bucketFor(31), 'd31_60'); assert.equal(plan.bucketFor(91), 'd90p'); assert.equal(plan.bucketFor(0), 'notDue');
  ok('ageing buckets: not due, 1-30, 31-60, 61-90, 90+');

  assert.deepEqual(plan.limitDecision({ owedCents: 40000, addCents: 10000, limitCents: 50000 }).over, false);
  assert.equal(plan.limitDecision({ owedCents: 40000, addCents: 10001, limitCents: 50000 }).over, true);
  assert.equal(plan.limitDecision({ owedCents: 40000, addCents: 99999, limitCents: null }).over, false, 'no limit, nothing to ask');
  assert.equal(plan.endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(plan.addDays('2026-11-28', 7), '2026-12-05');
  ok('limit decision and promise dates');

  const acct = { rows, paidMarkCents: 1000 };
  const a = settle(acct, 21000, 1);
  assert.equal(a.plan.appliedCents, 20000);
  assert.equal(a.next.paidMarkCents, 21000);
  assert.equal(settle(a.next, 21000, 2), null, 'the same total paid again applies nothing');
  assert.equal(settle(a.next, 15000, 2).plan, null, 'a voided payment lowers the mark without reopening rows');
  ok('settle: payments counted once against the mark');
}

/* ── 2. de bout en bout, sur la base ── */
const owner = `${SESS_COOKIE}=${await makeSession('money-owner', env.AUTH_SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
sql.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('credit-stranger','s@example.test','Stranger Shop','s','h',?,'active')").run(Date.now());
sql.prepare("INSERT INTO merchant_config(merchant,account_id,features,name,type,status,till_epoch,updated_ts) VALUES('stranger-shop','credit-stranger','{}','Stranger','boutique','active',0,?)").run(Date.now());
const stranger = `${SESS_COOKIE}=${await makeSession('credit-stranger', env.AUTH_SECRET)}`;
const strangerTill = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, 'stranger-shop')}`;

const call = async (route, method, cookie, body, query = '') => {
  const url = 'https://kiwi.test/api/credit/' + (route === book ? 'book' : 'till') + (method === 'GET' ? '?merchant=' + (body && body.merchant || merchant) + query : '');
  const request = new Request(url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.9.9' },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ merchant, ...body }) }) });
  const res = await (method === 'GET' ? route.onRequestGet : route.onRequestPost)({ request, env });
  return { status: res.status, body: await res.json() };
};

/* L'ardoise de l'épicerie : Mme Rkia doit 300 MAD (TEST KIWI). */
const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const carnet = [{ id: 'k-rkia', name: 'TEST KIWI Rkia', phone: '0661000000', hist: [
  { id: 'h1', type: 'debt', label: 'Courses', amt: 200, at: iso(40) },
  { id: 'h2', type: 'debt', label: 'Courses', amt: 150, at: iso(10) },
  { id: 'h3', type: 'pay', label: 'Règlement', amt: 50, at: iso(5) },
] }];
const writeBook = (list) => sql.prepare("INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'creditbook', ?, 1, ?)").run(merchant, JSON.stringify({ carnet: list }), Date.now());
writeBook(carnet);

let r = await call(book, 'GET', owner);
assert.equal(r.status, 200, JSON.stringify(r.body));
let rkia = r.body.customers.find((c) => c.key === 'k-rkia');
assert.equal(rkia.owedCents, 30000);
assert.equal(rkia.hasSchedule, false);
assert.equal(r.body.summary.debtors, 1);
assert.equal(r.body.summary.owedCents, 30000);
ok('owner book reads the épicerie credit book: owed, debtors');

r = await call(book, 'GET', owner, null, '&source=carnet&customer=k-rkia');
assert.equal(r.status, 200);
assert.equal(r.body.seed.length, 1);
assert.equal(r.body.seed[0].amountCents, 30000, 'the detail offers one seeded row of the full balance');
r = await call(book, 'POST', owner, { action: 'schedule', source: 'carnet', customer: 'k-rkia', seed: true });
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await call(book, 'POST', owner, { action: 'schedule', source: 'carnet', customer: 'k-rkia', seed: true });
assert.equal(r.status, 409, 'seeding twice is refused');
ok('seeding through the API');

const today = (await call(book, 'GET', owner)).body.today;
r = await call(book, 'POST', owner, { action: 'schedule', source: 'carnet', customer: 'k-rkia', rows: [
  { id: 'rk-row-1', amountCents: 10000, dueDate: plan.addDays(today, -3) },
  { id: 'rk-row-2', amountCents: 25000, dueDate: plan.addDays(today, 10) },
] });
assert.equal(r.status, 409);
assert.equal(r.body.error, 'schedule-exceeds-balance', 'rows above what is owed are refused by the server');
r = await call(book, 'POST', owner, { action: 'schedule', source: 'carnet', customer: 'k-rkia', rows: [
  { id: 'rk-row-1', amountCents: 10000, dueDate: plan.addDays(today, -3) },
  { id: 'rk-row-2', amountCents: 15000, dueDate: plan.addDays(today, 10) },
] });
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await call(book, 'GET', owner);
rkia = r.body.customers.find((c) => c.key === 'k-rkia');
assert.equal(rkia.scheduledCents, 25000);
assert.equal(rkia.unscheduledCents, 5000, 'the remaining amount without a date is shown');
assert.equal(rkia.dueCents, 10000, 'a late row is due today');
assert.equal(r.body.summary.dueToday, 1);
assert.equal(rkia.buckets.d1_30, 15000, 'the late row and the undated rest (from the purchase 10 days ago)');
assert.equal(rkia.buckets.notDue, 15000);
ok('schedule saved, total ≤ balance, unscheduled remainder, due today');

/* Un règlement noté à l'ardoise (n'importe quelle caisse) : 120 MAD. */
carnet[0].hist.push({ id: 'h4', type: 'pay', label: 'Règlement', amt: 120, at: iso(0) });
writeBook(carnet);
r = await call(book, 'GET', owner);
rkia = r.body.customers.find((c) => c.key === 'k-rkia');
assert.equal(rkia.owedCents, 18000);
assert.deepEqual(rkia.pending.map((p) => [p.id, p.amountCents]), [['rk-row-2', 13000]], 'row 1 collected, row 2 reduced by the rest');
r = await call(book, 'GET', owner);
rkia = r.body.customers.find((c) => c.key === 'k-rkia');
assert.deepEqual(rkia.pending.map((p) => [p.id, p.amountCents]), [['rk-row-2', 13000]], 'reading again applies nothing twice');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM credit_events WHERE merchant = ? AND kind = 'collected'").get(merchant).n, 1);
ok('a carnet payment waterfalls once, idempotent on every read');

/* Trop-perçu : 200 MAD alors qu'il en reste 180. */
carnet[0].hist.push({ id: 'h5', type: 'pay', label: 'Règlement', amt: 200, at: iso(0) });
writeBook(carnet);
r = await call(book, 'GET', owner, null, '&source=carnet&customer=k-rkia');
assert.equal(r.body.customer.pending.length, 0, 'over-payment: every row collected');
assert.equal(r.body.collected.length, 2);
assert.equal(r.body.customer.owedCents, 0);
ok('over-payment collects every row, creates nothing');

/* La boutique : une note ouverte « compte client » de 500 MAD, payée par /api/sale. */
const bill = { id: 'credit-bill-0001', customerId: 'client-fixture', ticketRef: 'TEST-KIWI-CR1', totalCents: 50000 };
const sale = async (id, cents, method, stage) => f.call('sale', { id, amountCents: cents, amount: cents / 100, ticketAmountCents: cents,
  paymentParts: [{ method, amountCents: cents }], method, label: 'TEST KIWI', ref: bill.ticketRef, ts: Date.now(),
  retailBalance: { ...bill, stage },
  lines: stage === 'open' ? [{ name: 'TEST KIWI item', qty: 1, total: 500 }] : undefined });
r = await sale('credit-open-0', 20000, 'cash', 'open');
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await call(book, 'POST', owner, { action: 'schedule', source: 'client', customer: 'client-fixture', rows: [
  { id: 'cl-row-1', amountCents: 10000, dueDate: plan.addDays(today, 2) },
  { id: 'cl-row-2', amountCents: 20000, dueDate: plan.addDays(today, 30) },
] });
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await sale('credit-pay-1', 15000, 'card', 'payment');
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await call(book, 'GET', owner, null, '&source=client&customer=client-fixture');
assert.equal(r.body.customer.owedCents, 15000);
assert.deepEqual(r.body.customer.pending.map((p) => [p.id, p.amountCents]), [['cl-row-2', 15000]]);
ok('a boutique balance payment (/api/sale) waterfalls over the schedule');

/* ── 3. plafond, au serveur ── */
r = await call(book, 'POST', owner, { action: 'limit', source: 'carnet', customer: 'k-rkia', limitCents: 50000 });
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await call(tillRoute, 'GET', till);
assert.equal(r.body.limits['carnet:k-rkia'], 50000, 'the till reads the limits');
r = await call(tillRoute, 'POST', till, { action: 'check', source: 'carnet', customer: 'k-rkia', addCents: 40000 });
assert.equal(r.body.over, false);
r = await call(tillRoute, 'POST', till, { action: 'check', source: 'carnet', customer: 'k-rkia', addCents: 40000, localOwedCents: 20000 });
assert.equal(r.body.over, true, 'the larger of the server and the till balance counts');
r = await call(tillRoute, 'POST', till, { action: 'check', source: 'carnet', customer: 'k-rkia', addCents: 50001 });
assert.equal(r.body.over, true);
const code = String(1000 + Math.floor(Math.random() * 9000));
sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)').run('pin-credit-mgr', merchant, code, 'TEST KIWI Manager', 'Manager', Date.now());
let cashierCode = String(1000 + Math.floor(Math.random() * 9000));
while (cashierCode === code) cashierCode = String(1000 + Math.floor(Math.random() * 9000));
sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)').run('pin-credit-cash', merchant, cashierCode, 'TEST KIWI Cashier', 'Caissier', Date.now());
r = await call(tillRoute, 'POST', till, { action: 'approve', source: 'carnet', customer: 'k-rkia', addCents: 50001, pin: cashierCode });
assert.equal(r.status, 403);
assert.equal(r.body.error, 'not-manager', 'a cashier cannot approve going over the limit');
r = await call(tillRoute, 'POST', till, { action: 'approve', source: 'carnet', customer: 'k-rkia', addCents: 50001, pin: code });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.approved, true);
assert.equal(r.body.approvedBy.name, 'TEST KIWI Manager');
assert.equal(JSON.stringify(r.body).includes(code), false, 'the answer never carries a code');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM credit_events WHERE merchant = ? AND kind = 'limit-override'").get(merchant).n, 1);
r = await call(book, 'POST', till, { action: 'limit', source: 'carnet', customer: 'k-rkia', limitCents: 99999999 });
assert.equal(r.status, 403, 'a till cannot raise a limit');
ok('credit limit: server check, manager-only approval through verifyStaffPin, logged');

/* ── 4. « paiera le … » au comptoir, rejouable ── */
const promise = { action: 'promise', source: 'carnet', customer: 'k-rkia', id: 'promise-0001', amountCents: 4000, dueDate: plan.addDays(today, 7) };
carnet[0].hist.push({ id: 'h6', type: 'debt', label: 'Courses', amt: 40, at: iso(0) });
writeBook(carnet);
r = await call(tillRoute, 'POST', till, promise);
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await call(tillRoute, 'POST', till, promise);
assert.equal(r.body.duplicate, true, 'a retried promise is written once');
r = await call(tillRoute, 'POST', till, { ...promise, id: 'promise-0002', dueDate: plan.addDays(today, -1) });
assert.equal(r.status, 400, 'a promise date in the past is refused');
r = await call(book, 'GET', owner, null, '&source=carnet&customer=k-rkia');
assert.deepEqual(r.body.customer.pending.map((p) => [p.id, p.amountCents, p.origin]), [['promise-0001', 2000, 'till']],
  'the promise shows, clamped to what is owed (the earlier 20 MAD advance)');
ok('promise date from the till: one row, idempotent');

/* ── 5. un magasin ne voit que le sien ── */
for (const [who, cookie] of [['stranger owner', stranger], ['another shop till', strangerTill], ['anonymous', '']]) {
  r = await call(book, 'GET', cookie);
  assert.equal(r.status, 403, who + ' cannot read the book');
  r = await call(book, 'POST', cookie, { action: 'schedule', source: 'carnet', customer: 'k-rkia', seed: true });
  assert.equal(r.status, 403, who + ' cannot write a schedule');
  r = await call(tillRoute, 'POST', cookie, { action: 'check', source: 'carnet', customer: 'k-rkia', addCents: 100 });
  assert.equal(r.status, 403, who + ' cannot check a limit');
}
r = await call(book, 'GET', stranger, { merchant: 'stranger-shop' });
assert.equal(r.status, 200);
assert.equal(r.body.customers.length, 0, 'the stranger sees an empty book of its own');
r = await call(book, 'POST', owner, { action: 'schedule', source: 'carnet', customer: 'nobody-here', seed: true });
assert.equal(r.status, 404, 'an unknown customer cannot get a schedule');
r = await call(book, 'POST', owner, { action: 'schedule', source: 'ledger', customer: 'k-rkia', seed: true });
assert.equal(r.status, 400, 'an unknown source is refused');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM credit_accounts WHERE merchant <> ?").get(merchant).n, 0, 'nothing written under another merchant');
ok('tenant isolation: owner of another shop, its till, anonymous');

/* ── 6. le rappel ── */
r = await call(book, 'POST', owner, { action: 'prefs', source: 'carnet', customer: 'k-rkia', lang: 'darija', reminded: true });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.ok(r.body.remindedTs > 0);
r = await call(book, 'POST', owner, { action: 'prefs', source: 'carnet', customer: 'k-rkia', lang: 'klingon' });
assert.equal(r.status, 400);
r = await call(book, 'GET', owner);
rkia = r.body.customers.find((c) => c.key === 'k-rkia');
assert.equal(rkia.lang, 'darija');
assert.ok(rkia.remindedTs > 0, 'reminded today is remembered');
ok('reminder language and "reminded" timestamp');

console.log(`credit-schedule-test: ${n} checks passed`);
