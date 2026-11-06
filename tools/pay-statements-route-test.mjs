#!/usr/bin/env node
/* Pay-statement archive (functions/api/pay-statements.js) on the real schema.
 *
 *   node tools/pay-statements-route-test.mjs
 *
 * Owner ruling 5, 4 Nov 2026: advances live on the server per staff member and
 * period; a statement is immutable and numbered RP-YYYY-NNNN, sequential per
 * merchant and calendar year, allocated atomically; a reprint shows the same
 * number and amounts; a correction is a new numbered statement that references
 * the one it replaces. Held here: numbering under two concurrent issues and
 * under a forced collision, year rollover, reprint identity, tenant isolation,
 * role refusal (till, employee, stranger, no cookie), immutability, correction
 * rules, replay of a retried request, input refusals. */
import assert from 'node:assert/strict';
import coreTestSource from './core-test-source.cjs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE, employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as route from '../functions/api/pay-statements.js';

const A = 'pay-shop-a', B = 'pay-shop-b', SECRET = 'pay-statements-test-secret-0123456789';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(coreTestSource.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
let injected = 0;
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...v) { args = v; return st; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return st;
  },
  batch(list) {
    if (injected) { injected--; throw new Error('UNIQUE constraint failed: pay_statements.merchant, pay_statements.year, pay_statements.seq'); }
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = list.map((s) => s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
for (const [m, acc] of [[A, 'acc-pay-a'], [B, 'acc-pay-b']]) {
  sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES (?, ?, 'TEST KIWI', 's', 'h', ?, 'active')`).run(acc, acc + '@example.test', now);
  sqlite.prepare(`INSERT INTO merchant_config (merchant, account_id, features, name, type, status, till_epoch, updated_ts) VALUES (?, ?, '{}', 'TEST KIWI', 'restaurant', 'active', 0, ?)`).run(m, acc, now);
}
const ownerA = `${SESS_COOKIE}=${await makeSession('acc-pay-a', SECRET)}`;
const ownerB = `${SESS_COOKIE}=${await makeSession('acc-pay-b', SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, A)}`;
const employee = `${EMPLOYEE_COOKIE}=${await employeeToken(SECRET, { merchant: A, staffId: 'staff-1' })}`;
const call = async (fn, method, path, cookie, body) => {
  const r = await route[fn]({ request: new Request('https://kiwi.test' + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env });
  return { status: r.status, body: await r.json() };
};
const post = (cookie, body) => call('onRequestPost', 'POST', '/api/pay-statements', cookie, body);
const get = (cookie, query) => call('onRequestGet', 'GET', '/api/pay-statements?' + query, cookie);
const P = { periodStart: '2026-10-05', periodEnd: '2026-10-11' };
const row = (id, gross, advance, extra = {}) => ({ memberId: id, memberName: 'Test ' + id, hours: 38.5, rateCents: 2347, baseCents: gross, grossCents: gross, advanceCents: advance, netCents: gross - advance, rated: 1, ...extra });
const issue = (cookie, rows, extra = {}, merchant = A) => post(cookie, { merchant, action: 'issue', ...P, rows, venue: { name: 'TEST KIWI', ice: '001234567000089' }, ...extra });
const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric' }).format(now));

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e && e.stack || e).split('\n').slice(0, 4).join(' ')}`); }
}
console.log('pay-statements');

await ok('role refusal: no cookie, till, employee and another merchant\'s owner read and write nothing', async () => {
  for (const cookie of ['', till, employee, ownerB]) {
    assert.equal((await issue(cookie, [row('m1', 10000, 0)])).status, 403, 'issue ' + cookie.slice(0, 10));
    assert.equal((await get(cookie, `merchant=${A}`)).status, 403, 'list ' + cookie.slice(0, 10));
    assert.equal((await post(cookie, { merchant: A, action: 'advances', ...P, advances: { m1: 100 } })).status, 403, 'advances ' + cookie.slice(0, 10));
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM pay_statements').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM pay_advances').get().n, 0);
});

await ok('advances are stored per staff member and period, and read back; another period is empty', async () => {
  const saved = await post(ownerA, { merchant: A, action: 'advances', ...P, advances: { m1: 12340, m2: 0 } });
  assert.equal(saved.status, 200);
  const read = await get(ownerA, `merchant=${A}&periodStart=${P.periodStart}&periodEnd=${P.periodEnd}`);
  assert.deepEqual(read.body.advances, { m1: 12340, m2: 0 });
  assert.deepEqual((await get(ownerA, `merchant=${A}&periodStart=2026-10-12&periodEnd=2026-10-18`)).body.advances, {});
  await post(ownerA, { merchant: A, action: 'advances', ...P, advances: { m1: 5000 } });
  assert.equal((await get(ownerA, `merchant=${A}&periodStart=${P.periodStart}&periodEnd=${P.periodEnd}`)).body.advances.m1, 5000, 'an edit replaces the stored value');
  assert.deepEqual((await get(ownerB, `merchant=${B}&periodStart=${P.periodStart}&periodEnd=${P.periodEnd}`)).body.advances, {}, 'tenant isolation');
});

await ok('two concurrent issues get two different sequential numbers', async () => {
  const [x, y] = await Promise.all([issue(ownerA, [row('m1', 100000, 5000)]), issue(ownerA, [row('m2', 90000, 0)])]);
  assert.equal(x.status, 200); assert.equal(y.status, 200);
  const numbers = [x.body.statements[0].number, y.body.statements[0].number].sort();
  assert.deepEqual(numbers, [`RP-${year}-0001`, `RP-${year}-0002`]);
  assert.throws(() => sqlite.prepare(`INSERT INTO pay_statements (id, merchant, year, seq, number, member_id, period_start, period_end, gross_cents, net_cents, snapshot, issued_ts)
    VALUES ('dup', ?, ?, 1, 'RP-x', 'm', 'a', 'b', 0, 0, '{}', 1)`).run(A, year), /UNIQUE/, 'the unique index refuses a second seq 1');
});

await ok('a forced allocation collision is replayed and still yields the next number, no gap', async () => {
  injected = 2;
  const r = await issue(ownerA, [row('m3', 80000, 0)]);
  assert.equal(r.status, 200);
  assert.equal(r.body.statements[0].number, `RP-${year}-0003`);
  injected = 99;
  assert.equal((await issue(ownerA, [row('m4', 80000, 0)])).status, 503, 'persistent collision ends as a refusal, not a duplicate');
  injected = 0;
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM pay_statements WHERE merchant = ?').get(A).n, 3);
});

await ok('a batch of several staff gets consecutive numbers; the issue also stores their advances', async () => {
  const r = await issue(ownerA, [row('m5', 50000, 1000), row('m6', 60000, 2000)]);
  assert.deepEqual(r.body.statements.map((s) => s.number), [`RP-${year}-0004`, `RP-${year}-0005`]);
  const adv = (await get(ownerA, `merchant=${A}&periodStart=${P.periodStart}&periodEnd=${P.periodEnd}`)).body.advances;
  assert.equal(adv.m5, 1000); assert.equal(adv.m6, 2000);
});

await ok('numbers are per merchant: the other shop starts at 0001', async () => {
  const r = await issue(ownerB, [row('m1', 70000, 0)], {}, B);
  assert.equal(r.body.statements[0].number, `RP-${year}-0001`);
});

await ok('year rollover: the series restarts at 0001 in January, by the merchant\'s calendar', async () => {
  const dec = Date.UTC(2026, 11, 31, 22, 30), jan = Date.UTC(2026, 11, 31, 23, 30);
  assert.equal(route.issueYear(dec, 'Africa/Casablanca'), 2026);
  assert.equal(route.issueYear(jan, 'Pacific/Kiritimati'), 2027, 'the zone decides, not UTC');
  const ctx = (ts, y) => ({ start: P.periodStart, end: P.periodEnd, rows: [{ memberId: 'yr', memberName: 'Y', gross: 100, advance: 0, net: 100, rated: 1, rate: 1, base: 100, hours: 1 }], now: ts, year: y, by: 'owner', venueName: '', ice: '' });
  const last = await route.issueStatements(env, 'pay-year-shop', {}, ctx(dec, 2026));
  const first = await route.issueStatements(env, 'pay-year-shop', {}, ctx(jan, 2027));
  assert.equal(last.rows[0].number, 'RP-2026-0001');
  assert.equal(first.rows[0].number, 'RP-2027-0001');
});

await ok('reprint by id returns the same number and amounts, even after the advance changed', async () => {
  const issued = (await issue(ownerA, [row('m7', 123456, 7890)])).body.statements[0];
  await post(ownerA, { merchant: A, action: 'advances', ...P, advances: { m7: 1 } });
  const again = (await get(ownerA, `merchant=${A}&id=${issued.id}`)).body.statement;
  assert.deepEqual(again, issued, 'identical record');
  assert.equal(again.number, issued.number);
  assert.equal(again.grossCents, 123456); assert.equal(again.advanceCents, 7890); assert.equal(again.netCents, 115566);
  assert.equal(again.snapshot.venueName, 'TEST KIWI'); assert.equal(again.snapshot.ice, '001234567000089');
  assert.equal((await get(ownerB, `merchant=${B}&id=${issued.id}`)).status, 404, 'another tenant cannot reprint it');
  assert.equal((await get(ownerB, `merchant=${A}&id=${issued.id}`)).status, 403);
});

await ok('immutable: UPDATE and DELETE on an issued statement are refused by the database', async () => {
  const id = sqlite.prepare('SELECT id FROM pay_statements WHERE merchant = ? LIMIT 1').get(A).id;
  assert.throws(() => sqlite.prepare('UPDATE pay_statements SET net_cents = 1 WHERE id = ?').run(id), /immutable/);
  assert.throws(() => sqlite.prepare('DELETE FROM pay_statements WHERE id = ?').run(id), /immutable/);
});

await ok('a correction is a new numbered statement referencing the old one; one correction per statement', async () => {
  const old = (await issue(ownerA, [row('m8', 100000, 0)])).body.statements[0];
  const fix = await issue(ownerA, [row('m8', 100000, 4000)], { replacesId: old.id });
  assert.equal(fix.status, 200);
  const s = fix.body.statements[0];
  assert.equal(s.replacesId, old.id); assert.notEqual(s.number, old.number); assert.equal(s.advanceCents, 4000);
  const oldNow = (await get(ownerA, `merchant=${A}&id=${old.id}`)).body.statement;
  assert.equal(oldNow.replacedById, s.id); assert.equal(oldNow.netCents, 100000, 'the original is untouched');
  assert.equal((await issue(ownerA, [row('m8', 100000, 5000)], { replacesId: old.id })).body.error, 'already-replaced');
  assert.equal((await issue(ownerA, [row('m9', 100000, 0)], { replacesId: s.id })).body.error, 'replaces-mismatch', 'another employee');
  assert.equal((await issue(ownerA, [row('m8', 1, 0)], { replacesId: 'nope' })).status, 404);
  assert.equal((await issue(ownerB, [row('m8', 1, 0)], { replacesId: old.id }, B)).status, 404, 'cannot replace another merchant\'s statement');
  const list = (await get(ownerA, `merchant=${A}&periodStart=${P.periodStart}&periodEnd=${P.periodEnd}`)).body.statements;
  assert.equal(list.find((x) => x.id === old.id).replacedById, s.id);
});

await ok('a retried request (same requestId) returns the stored statements and issues nothing more', async () => {
  const before = sqlite.prepare('SELECT COUNT(*) n FROM pay_statements WHERE merchant = ?').get(A).n;
  const first = await issue(ownerA, [row('m10', 40000, 0)], { requestId: 'req-abcdef01' });
  const second = await issue(ownerA, [row('m10', 40000, 0)], { requestId: 'req-abcdef01' });
  assert.equal(second.body.replayed, true);
  assert.equal(second.body.statements[0].number, first.body.statements[0].number);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM pay_statements WHERE merchant = ?').get(A).n, before + 1);
});

await ok('bad input is refused and consumes no number', async () => {
  const before = sqlite.prepare('SELECT COUNT(*) n FROM pay_statements').get().n;
  const bad = [
    [row('x1', 1000, 2000)],                                   // advance above gross on a rated row
    [{ ...row('x1', 1000, 0), netCents: 999 }],                // net is not gross - advance
    [{ ...row('x1', 1000, 0), grossCents: 10.5 }],             // not integer centimes
    [{ ...row('x1', 1000, 0), advanceCents: -1, netCents: 1001 }],
    [row('x1', 1000, 0), row('x1', 1000, 0)],                  // same employee twice
    [],
  ];
  for (const rows of bad) assert.equal((await issue(ownerA, rows)).status, 400, JSON.stringify(rows).slice(0, 60));
  assert.equal((await post(ownerA, { merchant: A, action: 'issue', periodStart: '2026-10-11', periodEnd: '2026-10-05', rows: [row('x1', 1, 0)] })).status, 400);
  assert.equal((await post(ownerA, { merchant: A, action: 'issue', periodStart: '2026-13-01', periodEnd: '2026-13-02', rows: [row('x1', 1, 0)] })).status, 400);
  assert.equal((await post(ownerA, { merchant: A, action: 'advances', ...P, advances: { x1: 1.5 } })).status, 400);
  assert.equal((await post(ownerA, { merchant: A, action: 'nope', ...P })).status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM pay_statements').get().n, before);
  assert.equal((await issue(ownerA, [row('x2', 1000, 0)])).body.statements[0].seq, sqlite.prepare('SELECT MAX(seq) m FROM pay_statements WHERE merchant = ?').get(A).m, 'next number follows the last one with no hole');
});

await ok('r20 planning#A0: the longest valid id (request 64 + member 64) is stored whole and read back by id', async () => {
  const requestId = 'r'.repeat(64), memberId = 'm'.repeat(64);
  const made = await issue(ownerA, [row(memberId, 5000, 0)], { requestId });
  assert.equal(made.status, 200);
  const id = made.body.statements[0].id;
  assert.equal(id, `ps-${requestId}-${memberId}`, 'id kept whole, no truncation');
  assert.ok(id.length > 120);
  const back = await get(ownerA, `merchant=${A}&id=${encodeURIComponent(id)}`);
  assert.equal(back.status, 200, 'the reprint API finds it');
  assert.equal(back.body.statement.number, made.body.statements[0].number);
  const twin = await issue(ownerA, [row('m'.repeat(63) + 'n', 5000, 0)], { requestId });
  assert.notEqual(twin.body.statements[0].id, id, 'two long members of one request never share an id');
  const fix = await issue(ownerA, [row(memberId, 5100, 0)], { requestId: 'c'.repeat(64), replacesId: id });
  assert.equal(fix.status, 200); assert.equal(fix.body.statements[0].replacesId, id, 'a long replaced id is accepted whole');
});

await ok('r20 planning#A2/B2: a period with more than 500 statements pages by cursor, nothing dropped; the client follows it', async () => {
  const PP = { periodStart: '2026-11-02', periodEnd: '2026-11-08' };
  const insert = sqlite.prepare(`INSERT INTO pay_statements (id, merchant, year, seq, number, member_id, member_name, period_start, period_end, gross_cents, advance_cents, net_cents, rated, snapshot, issued_ts, issued_by) VALUES (?, ?, 2090, ?, ?, 'cap', 'Cap', ?, ?, 100, 0, 100, 1, '{}', ?, 'owner')`);
  sqlite.exec('BEGIN');
  for (let i = 1; i <= 620; i++) insert.run('cap-' + i, A, i, 'RP-2090-' + String(i).padStart(4, '0'), PP.periodStart, PP.periodEnd, 1000 + Math.floor(i / 3));
  sqlite.exec('COMMIT');
  const q = `merchant=${A}&periodStart=${PP.periodStart}&periodEnd=${PP.periodEnd}`;
  const first = await get(ownerA, q);
  assert.equal(first.body.statements.length, 500); assert.ok(first.body.nextCursor, 'a cursor says there is more');
  const second = await get(ownerA, q + '&after=' + first.body.nextCursor);
  assert.equal(second.body.statements.length, 120); assert.equal(second.body.nextCursor, null);
  const seen = new Set([...first.body.statements, ...second.body.statements].map((s) => s.id));
  assert.equal(seen.size, 620, 'no statement lost or repeated across pages');
  assert.equal((await get(ownerA, q + '&after=nope')).status, 400);
  const { createArchive } = await import('../assets/planning/pay-statement-archive.js');
  const archive = createArchive(A, async (url, options = {}) => route.onRequestGet({ request: new Request(new URL(url, 'https://kiwi.test'), { headers: { ...options.headers, Cookie: ownerA } }), env }));
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  assert.equal((await archive.forPeriod({ days })).statements.length, 620, 'the client reads every page');
  const hist = await get(ownerA, `merchant=${A}`);
  assert.equal(hist.body.statements.length, 100); assert.ok(hist.body.nextCursor, 'the merchant-wide history pages too');
  const older = await get(ownerA, `merchant=${A}&before=${hist.body.nextCursor}`);
  assert.equal(older.body.statements.length, 100);
  assert.ok(!older.body.statements.some((s) => hist.body.statements.some((t) => t.id === s.id)), 'next page starts after the last row');
});

await ok('r20 planning#A1: the request id changes when hours, rate, base or name change with the same totals', async () => {
  const { requestIdFor } = await import('../assets/planning/pay-statement-archive.js');
  const period = { days: ['2026-10-05', '2026-10-11'] };
  const base = { memberId: 'a', memberName: 'A', hours: 7, rateCents: 2347, baseCents: 16820, grossCents: 16820, advanceCents: 0, netCents: 16820, rated: 1 };
  const id = requestIdFor(period, [base]);
  assert.equal(requestIdFor(period, [{ ...base }]), id, 'same snapshot, same id (retry replays)');
  for (const change of [{ hours: 7.5 }, { rateCents: 2400 }, { baseCents: 16000 }, { memberName: 'B' }]) assert.notEqual(requestIdFor(period, [{ ...base, ...change }]), id, JSON.stringify(change));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
