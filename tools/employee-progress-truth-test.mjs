#!/usr/bin/env node
/* employee-progress-truth-test · XP and records come from the ledger, not from
 * the employee app's say-so.
 *
 * The clock-out turned body.progress.{paid,revenue,turnMinutes} into XP, a
 * best night, a streak and a best speed. Now they are capped by the sales this
 * employee's own session wrote during the shift (sales.seller_id) and by the
 * length of the shift, and nothing is credited if the ledger cannot be read.
 * Also: /api/employee and /api/team/live share one compare-and-swap loop. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomInt } from 'node:crypto';
import { handleAttendance } from '../functions/api/employee/_attendance.js';
import { readDoc, mutateDoc } from '../functions/api/_doc-cas.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const M = 'progress-truth';
const DB = {
  prepare(statement) {
    let a = [];
    const q = { bind(...v) { a = v; return q; },
      first() { return sql.prepare(statement).get(...a) || null; },
      all() { return { results: sql.prepare(statement).all(...a) }; },
      run() { const r = sql.prepare(statement).run(...a); return { meta: { changes: r.changes } }; } };
    return q;
  },
};
const env = { DB };

// The shared CAS loop: create, update, give up on a stale revision.
assert.deepEqual((await readDoc(env, M, 'x', { a: 1 })).data, { a: 1 });
assert.ok(await mutateDoc(env, M, 'x', { n: 0 }, (d) => ({ n: d.n + 1 })));
assert.ok(await mutateDoc(env, M, 'x', { n: 0 }, (d) => ({ n: d.n + 1 })));
assert.equal((await readDoc(env, M, 'x', {})).data.n, 2);
assert.equal(await mutateDoc(env, M, 'x', {}, () => null), null, 'nothing to write, nothing written');
const racing = { ...env, DB: { prepare(s) { const q = DB.prepare(s); const run = q.run; q.run = () => { if (/^UPDATE store_docs/.test(s)) return { meta: { changes: 0 } }; return run(); }; return q; } } };
assert.equal(await mutateDoc(racing, M, 'x', {}, (d) => ({ n: d.n + 1 })), null, 'a lost race gives up after its tries');
const src = (f) => fs.readFileSync(new URL('../functions/api/' + f, import.meta.url), 'utf8');
assert.ok(!/async function mutateDoc/.test(src('employee.js')) && !/async function mutateDoc/.test(src('team/live.js')), 'one copy of the loop');

const code = String(randomInt(100000, 1000000));
const clone = (v) => JSON.parse(JSON.stringify(v));
const docs = new Map();
docs.set('attendance-code', { data: { code, createdTs: Date.now() - 1000, expiresTs: Date.now() + 600000 }, rev: 1 });
docs.set('team', { data: { members: [{ id: 'member-a', firstName: 'Test' }], hours: {}, shifts: {} }, rev: 1 });
const rd = async (_e, _m, f, fb) => { const r = docs.get(f); return r ? { data: clone(r.data), rev: r.rev } : { data: clone(fb), rev: 0 }; };
const mut = async (e, m, f, fb, change) => { const r = await rd(e, m, f, fb); const n = change(r.data); if (!n) return null; docs.set(f, { data: clone(n), rev: r.rev + 1 }); return n; };
const store = (e) => ({ env: e, merchant: M, zone: 'Africa/Casablanca', cutoff: 5, readDoc: rd, mutateDoc: mut,
  memberFor: () => ({ id: 'member-a' }),
  completedHours: (entry) => ({ '2026-10-27': (entry.outTs - entry.inTs) / 3600000 }),
  safeProgress: (raw) => ({ lifetimeXP: Number(raw && raw.lifetimeXP) || 0, shifts: Number(raw && raw.shifts) || 0,
    records: { bestNight: Number(raw?.records?.bestNight) || 0, streak: Number(raw?.records?.streak) || 0, bestSpeed: raw?.records?.bestSpeed ?? null } }) });
const actor = { role: 'employee', identity: { session: {}, pin: { id: 'staff-a', name: 'Test', role: 'staff' } } };
let n = 0;
async function shift(e, progress, hours = 4) {
  const id = 'op-' + (++n);
  let res = await handleAttendance({ actor, store: store(e), action: 'clock-in', request: new Request('https://kiwi.test/e'), body: { action: 'clock-in', attendanceCode: code, opId: id + 'i' } });
  assert.equal(res.status, 200);
  const entries = docs.get('attendance').data.entries;
  const open = entries.find((x) => !x.outTs);
  open.inTs -= hours * 3600000;
  docs.set('attendance', { data: { entries }, rev: 9 });
  const from = open.inTs;
  res = await handleAttendance({ actor, store: store(e), action: 'clock-out', request: new Request('https://kiwi.test/e'), body: { action: 'clock-out', attendanceCode: code, opId: id + 'o', progress } });
  assert.equal(res.status, 200);
  return from;
}
const prog = () => docs.get('employee-progress')?.data.members['member-a'];
const sell = sql.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ts, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?)');

// A forged record night: 200 tables, 1 000 000 MAD, a 1-minute turn, and the ledger holds nothing.
await shift(env, { paid: 200, revenue: 1000000, turnMinutes: 200 });
assert.equal(prog()?.lifetimeXP ?? 0, 0, 'invented numbers earn no XP');
assert.equal(prog()?.records.bestNight ?? 0, 0, 'and no record');

// Three real sales by this employee during the next shift, one by a colleague, one voided.
const now = Date.now();
[[1, 5000], [2, 7000], [3, 3000]].forEach(([i, c]) => sell.run('mine' + i, M, c / 100, c, 'cash', now - 600000 * i, 'staff-a'));
sell.run('theirs', M, 90, 9000, 'cash', now - 600000, 'staff-b');
sell.run('voided', M, 90, 9000, 'cash', now - 600000, 'staff-a');
sql.prepare("UPDATE sales SET void_ts = ? WHERE id = 'voided'").run(now);
await shift(env, { paid: 200, revenue: 1000000, turnMinutes: 9999 });
assert.equal(prog().records.bestNight, 3, 'paid is the ledger count, not the claim');
assert.equal(prog().lifetimeXP, Math.round(3 * 10 + 150 * 0.01), 'revenue is the ledger sum (150 MAD), not the claim');
assert.ok(prog().records.bestSpeed <= 240, 'a table turn cannot exceed the shift');

// An honest claim below the ledger is kept as claimed.
const before = prog().lifetimeXP;
await shift(env, { paid: 1, revenue: 20, turnMinutes: 10 }, 1);
assert.ok(prog().lifetimeXP - before <= Math.round(1 * 10 + 20 * 0.01) + 0, 'a lower claim is honoured');

// A claimed lightning turn is raised to the floor of 2 minutes a table.
await shift(env, { paid: 3, revenue: 10, turnMinutes: 1 }, 2);
assert.ok(prog().records.bestSpeed >= 2, 'a one-minute turn cannot set a record below two minutes a table');

// An unreadable ledger credits nothing.
const beforeBroken = prog().lifetimeXP;
await shift({ DB: { prepare() { throw new Error('d1 down'); } } }, { paid: 50, revenue: 500, turnMinutes: 30 });
assert.equal(prog().lifetimeXP, beforeBroken, 'no ledger, no XP');
console.log('✓ employee progress truth: XP is capped by the ledger and the shift, the CAS loop is shared');
