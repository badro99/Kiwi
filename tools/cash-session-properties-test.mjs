#!/usr/bin/env node
/* cash-session-properties-test · what the drawer ledger keeps of a shift.
 *
 * The till posts each step of a cash shift to /api/cash-sessions: open (the
 * float), cash in and out, signed handovers between cashiers, and the close
 * with its count. The till computes the expected cash
 * (drawerExpected: float + cash sales − cash refunds + in − out + every signed
 * handover gap); the server cannot see a terminal's sales, so it keeps a FLOOR
 * the declared expected may not pass, to stop a till hiding a shortage by
 * announcing a low expected.
 *
 * Generated shifts (sales, refunds larger than the sales, handovers that find
 * a shortage or a surplus, movements) run through the real route on the SQLite
 * D1 fixture:
 *   1. an honest till's numbers are stored exactly as declared;
 *   2. a till declaring less than float + in − out + handover gaps − refunds
 *      has its expected raised, and the gap shows the shortage;
 *   3. a replayed event changes nothing. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as post } from '../functions/api/cash-sessions.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; cash session properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0;
async function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample).slice(0, 1500), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

const f = await fixture(ROOT), { sql, merchant } = f;
const tillCookie = (await (async () => { const { TILL_COOKIE, tillToken } = await import('../functions/auth/_lib.js'); return TILL_COOKIE + '=' + await tillToken(f.env.AUTH_SECRET, merchant); })());
let terminalCookie = '', serial = 0;

async function send(body) {
  const res = await post({ env: f.env, request: new Request('https://kiwi.test/api/cash-sessions', { method: 'POST', headers: { Cookie: [tillCookie, terminalCookie].filter(Boolean).join('; '), 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, terminalId: 'term-props-01', ...body }) }) });
  const set = res.headers.get('set-cookie');
  if (set) terminalCookie = set.split(';')[0];
  return { status: res.status, body: await res.json() };
}
const stored = (id) => sql.prepare('SELECT expected_cents, counted_cents, gap_cents FROM cash_session_events WHERE id = ?').get(id);

/* A shift as the till lives it. */
const stepArb = fc.oneof(
  fc.record({ k: fc.constant('sale'), c: fc.integer({ min: 100, max: 50000 }) }),
  fc.record({ k: fc.constant('refund'), c: fc.integer({ min: 100, max: 80000 }) }),
  fc.record({ k: fc.constant('in'), c: fc.integer({ min: 100, max: 30000 }) }),
  fc.record({ k: fc.constant('out'), c: fc.integer({ min: 100, max: 30000 }) }),
  fc.record({ k: fc.constant('handover'), off: fc.integer({ min: -5000, max: 5000 }) }),
);
const shiftArb = fc.record({ float: fc.integer({ min: 0, max: 100000 }), steps: fc.array(stepArb, { maxLength: 12 }), closeOff: fc.integer({ min: -5000, max: 5000 }) });

/* Plays a shift; `declare(expected, floor)` is what the till announces at each
 * handover and at the close. Returns the till's true numbers per event. */
async function shift({ float, steps, closeOff }, declare) {
  sql.exec('DELETE FROM cash_session_events; DELETE FROM sales');
  terminalCookie = '';
  const session = 'sess-' + (++serial), openedAt = Date.now() - 3 * 3600e3;
  let t = openedAt, expected = float, floor = float, k = 0;
  const truth = [];
  const ev = async (eventType, extra) => { t += 60e3; const id = `${session}-e${++k}`; const r = await send({ id, sessionId: session, eventType, actorId: 'cashier-a', openedAt, occurredAt: t, ...extra }); assert.equal(r.status, 201, JSON.stringify(r)); return id; };
  await ev('open', { expectedCents: float });
  for (const s of steps) {
    if (s.k === 'sale') { t += 60e3; f.insert('sale-' + session + '-' + (++k), s.c, { method: 'cash', ts: t }); expected += s.c; }
    else if (s.k === 'refund') { t += 60e3; f.insert('rfd-' + session + '-' + (++k), -s.c, { method: 'cash', ts: t, channel: 'refund' }); expected -= s.c; floor -= s.c; }
    else if (s.k === 'in' || s.k === 'out') {
      const sign = s.k === 'in' ? 1 : -1; expected += sign * s.c; floor += sign * s.c;
      await ev('movement', { movementKind: s.k, movementAmountCents: s.c, movementReason: 'Fond', expectedCents: Math.max(0, expected) });
    } else {
      const counted = Math.max(0, expected + s.off), said = declare(expected, floor), gap = counted - said;
      const id = await ev('handover', { expectedCents: Math.max(0, said), countedCents: counted, gapCents: counted - Math.max(0, said), counterpartyActorId: 'cashier-b' });
      truth.push({ id, expected: Math.max(0, said), counted, honest: Math.max(0, expected), floor });
      expected = counted; floor += counted - Math.max(Math.max(0, said), floor); void gap;   // the stored signed gap rides into the expected
    }
  }
  const counted = Math.max(0, expected + closeOff), said = Math.max(0, declare(expected, floor));
  const id = await ev('close', { expectedCents: said, countedCents: counted, gapCents: counted - said });
  truth.push({ id, expected: said, counted, honest: Math.max(0, expected), floor });
  return truth;
}

console.log('cash-session-properties-test');
try {
  await strict('an honest till keeps exactly the expected cash and gap it declared, refunds and signed handover shortages included', fc.asyncProperty(shiftArb, async (s) => {
    for (const e of await shift(s, (expected) => expected)) {
      const row = stored(e.id);
      assert.equal(row.expected_cents, e.expected, 'expected moved for ' + e.id);
      assert.equal(row.gap_cents, e.counted - e.expected, 'gap moved for ' + e.id);
    }
  }));

  await strict('a till announcing less than float + in − out + signed gaps − refunds cannot hide the shortage', fc.asyncProperty(shiftArb, fc.integer({ min: 1, max: 20000 }), async (s, cut) => {
    for (const e of await shift(s, (expected, floor) => Math.min(expected, floor) - cut)) {
      const row = stored(e.id);
      assert.ok(row.expected_cents >= Math.min(e.floor, 1e9) || e.floor <= e.expected, `expected ${row.expected_cents} under floor ${e.floor}`);
      assert.equal(row.gap_cents, row.counted_cents - row.expected_cents);
    }
  }));

  await strict('replaying any event of a shift changes nothing', fc.asyncProperty(shiftArb, async (s) => {
    const truth = await shift(s, (expected) => expected);
    const before = sql.prepare('SELECT * FROM cash_session_events ORDER BY id').all();
    const last = truth[truth.length - 1];
    const row = sql.prepare('SELECT * FROM cash_session_events WHERE id = ?').get(last.id);
    const r = await send({ id: last.id, sessionId: row.session_id, eventType: row.event_type, actorId: row.actor_id, openedAt: row.opened_ts, occurredAt: row.occurred_ts, expectedCents: row.expected_cents, countedCents: row.counted_cents, gapCents: row.gap_cents });
    assert.equal(r.status, 201);
    assert.deepEqual(sql.prepare('SELECT * FROM cash_session_events ORDER BY id').all(), before);
  }));

  console.log(`${failed ? '✗' : '✓'} cash-session-properties-test · ${passed} held, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
