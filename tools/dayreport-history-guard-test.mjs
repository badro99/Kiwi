#!/usr/bin/env node
/* A closed Z is history. Through the real /api/store route and a real SQLite
 * base: a write that rebuilt the Z book from a stale copy (a closed day gone,
 * a lower closedCount, a closure revision missing) is answered like any stale
 * write, 409 with the server copy, so the till merges before retrying; a write
 * that keeps every closure, or only prunes old days the way tills do, lands.
 * Synthetic data only (TEST KIWI). */
import assert from 'node:assert/strict';
import { ROOT } from './invoice-vat-harness.mjs';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost } from '../functions/api/store.js';
import { dayreportHistoryLost } from '../functions/api/_dayreport-history.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const f = await fixture(ROOT);
const owner = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
const post = async (data, baseRev) => {
  const r = await onRequestPost({ env: f.env, request: new Request('https://kiwi.test/api/store', { method: 'POST',
    headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'dayreports', merchant: f.merchant, data, baseRev }) }) });
  return { status: r.status, body: await r.json() };
};
const close = (at, terminalId = 'T1') => ({ at, closed: true, closedAt: at, sessionId: 's-' + at, terminalId, by: 'TEST KIWI', gross: 10, txns: 1, note: 'clôture' });
const day = (d, revisions) => ({ day: d, gross: 10, closedAt: revisions.length ? revisions.at(-1).closedAt : null, closedCount: revisions.length, revisions });

const base = { days: { '2026-09-01': day('2026-09-01', [close(1)]), '2026-11-03': day('2026-11-03', [close(2), close(3, 'T2')]) } };
let r = await post(base, 0);
assert.equal(r.status, 200, 'the first Z book is stored');
let rev = r.body.rev;

// A till rebuilt 3 November from a copy that only saw the first closure.
r = await post({ days: { '2026-09-01': base.days['2026-09-01'], '2026-11-03': day('2026-11-03', [close(2)]) } }, rev);
assert.equal(r.status, 409, 'a lost closure is refused');
assert.equal(r.body.error, 'stale', 'answered like a stale write so the till merges');
assert.equal(r.body.data.days['2026-11-03'].revisions.length, 2, 'the server copy comes back whole');

// A closed day of the protected months vanishing is refused even if it is the oldest.
r = await post({ days: { '2026-11-04': day('2026-11-04', []) , '2026-11-03': base.days['2026-11-03'] } }, rev);
assert.equal(r.status, 200, 'pruning a closed day older than the month before is allowed');
rev = r.body.rev;
r = await post({ days: { '2026-11-04': day('2026-11-04', [close(4)]) } }, rev);
assert.equal(r.status, 409, 'dropping a closed day of the current month is refused');

// Adding a closure on top of the full history lands.
r = await post({ days: { '2026-11-03': day('2026-11-03', [close(2), close(3, 'T2'), close(5)]), '2026-11-04': day('2026-11-04', [close(4)]) } }, rev);
assert.equal(r.status, 200, 'a new closure on top of the history lands');

// The rule itself, without the route.
assert.equal(dayreportHistoryLost({ days: { '2026-11-03': day('2026-11-03', [close(2)]) } }, { days: {} }), '2026-11-03', 'an emptied book loses its closed day');
assert.equal(dayreportHistoryLost({ days: { '2026-11-03': day('2026-11-03', []) } }, { days: {} }), '', 'an open day carries no closure to lose');
assert.equal(dayreportHistoryLost({ days: { '2026-01-02': day('2026-01-02', [close(1)]) } }, { days: { '2026-01-20': day('2026-01-20', []) } }), '2026-01-02',
  'January protects December and January: the month before crosses the year');
console.log('✓ dayreport history guard · lost closures refused as stale, pruning and new closures land');
