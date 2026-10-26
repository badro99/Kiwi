#!/usr/bin/env node
/* ticket-sequence-properties-test · two tills never print the same receipt number.
 *
 * Each till reserves a range of receipt numbers from /api/ticket-sequence
 * (reserveTicketRange in functions/api/ticket-sequence.js) so it can keep
 * numbering through a network outage. Generated bursts of reservations, some
 * at the same moment, some with a till's own floor, some too big to fit, run on
 * the SQLite D1 fixture:
 *   1. every range handed out is disjoint from every other, inside 1000..99999;
 *   2. a range starts above every numeric receipt already in the year's sales
 *      and above the floor the till asked for;
 *   3. a refused request leaves the counter where it was;
 *   4. one store's reservations never move another store's counter. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import { reserveTicketRange } from '../functions/api/ticket-sequence.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; ticket sequence properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0;
async function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample).slice(0, 1500), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

const f = await fixture(ROOT), { sql, merchant, env } = f, OTHER = 'server-other-shop';
const YEAR = new Date().getUTCFullYear();
const reset = () => sql.exec("DELETE FROM sales; DROP TABLE IF EXISTS ticket_sequences");
const counter = (m) => { try { const r = sql.prepare('SELECT next_value FROM ticket_sequences WHERE merchant = ? AND period = ?').get(m, YEAR); return r ? r.next_value : null; } catch { return null; } };
const reserve = (m, req) => reserveTicketRange(env, m, req.size, req.floor, req.period).then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, error: e.message }));

const reqArb = fc.record({ size: fc.oneof(fc.integer({ min: 1, max: 500 }), fc.constantFrom(undefined, 0, -5, 'x', 10000)), floor: fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 99999 })), store: fc.constantFrom(merchant, merchant, OTHER) });
const burstArb = fc.array(fc.array(reqArb, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 6 });
const oldRefs = fc.array(fc.oneof(fc.integer({ min: 1, max: 99999 }).map(String), fc.constantFrom('1000-X', 'A12', '', '0042')), { maxLength: 5 });

console.log('ticket-sequence-properties-test');
try {
  await strict('ranges handed out, even at the same moment, never overlap and stay inside 1000..99999', fc.asyncProperty(burstArb, async (bursts) => {
    reset();
    const got = [];
    for (const burst of bursts) for (const r of await Promise.all(burst.map((q) => reserve(q.store, q)))) if (r.ok) got.push(r);
    for (const r of got) { assert.ok(r.start >= 1000 && r.end <= 99999 && r.start <= r.end, JSON.stringify(r)); }
    for (const m of [merchant, OTHER]) {
      const mine = got.filter((r) => r.merchant === m).sort((a, b) => a.start - b.start);
      for (let i = 1; i < mine.length; i++) assert.ok(mine[i].start > mine[i - 1].end, 'overlap ' + JSON.stringify([mine[i - 1], mine[i]]));
    }
  }));

  await strict('a range starts above every numeric receipt of the year and above the floor the till asked for', fc.asyncProperty(oldRefs, reqArb, async (refs, q) => {
    reset();
    refs.forEach((ref, i) => f.insert('old-' + i, 1000, { ref, ts: Date.UTC(YEAR, 0, 2) }));
    const r = await reserve(merchant, q);
    if (!r.ok) return;
    const numeric = refs.filter((x) => /^\d+$/.test(x)).map(Number).filter((n) => n >= 1 && n <= 99999);
    for (const n of numeric) assert.ok(r.start > n, `start ${r.start} not above old ${n}`);
    if (Number.isFinite(Number(q.floor))) assert.ok(r.start >= Math.min(99999, Math.max(1000, Math.floor(q.floor))));
  }));

  await strict('a refused request leaves the counter exactly where it was', fc.asyncProperty(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 99000, max: 99999 }), fc.integer({ min: 1, max: 500 }), async (first, floor, size) => {
    reset();
    const a = await reserve(merchant, { size: first });
    assert.ok(a.ok);
    const before = counter(merchant);
    const b = await reserve(merchant, { size, floor });
    if (!b.ok) assert.equal(counter(merchant), before);
    else assert.ok(b.end <= 99999 && b.start >= floor);
    const c = await reserve(merchant, { size: 1 });
    if (c.ok) assert.ok(c.start > (b.ok ? b.end : a.end));
  }));

  await strict('one store\'s reservations never move another store\'s counter', fc.asyncProperty(fc.array(reqArb, { maxLength: 8 }), async (reqs) => {
    reset();
    await reserve(OTHER, { size: 10 });
    const before = counter(OTHER);
    for (const q of reqs) await reserve(merchant, q);
    assert.equal(counter(OTHER), before);
  }));

  console.log(`${failed ? '✗' : '✓'} ticket-sequence-properties-test · ${passed} held, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
