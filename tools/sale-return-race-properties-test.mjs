#!/usr/bin/env node
/* sale-return-race-properties-test · money leaves a ticket once.
 *
 * Three routes take value back out of a paid ticket: a void
 * (functions/api/sale/cancel.js), a refund (functions/api/sale/refund.js) and
 * a store credit issued against it (functions/api/store-credits.js, action
 * « issue »). Each guards the others: a voided ticket cannot be refunded or
 * credited, a refunded or credited ticket cannot be voided, and refunds plus
 * credits never pass the ticket. Two devices can press at the same moment, so
 * every guard has to hold inside the write itself, not in a read before it.
 *
 * The suite runs the real routes on the SQLite D1 fixture. One request is
 * paused before each of its database steps in turn while the other runs to
 * completion there; then the books are checked:
 *   1. a voided ticket keeps no refund and no store credit;
 *   2. refunds plus credits never pass the ticket;
 *   3. every « ok » answer left its row, and every row came from an « ok ».
 * A second property plays ordinary sequences of up to five of these actions
 * with no overlap, under the same three checks. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import { makeSession, SESS_COOKIE, managerRefundProof } from '../functions/auth/_lib.js';
import { onRequestPost as cancelRoute } from '../functions/api/sale/cancel.js';
import { onRequestPost as refundRoute } from '../functions/api/sale/refund.js';
import { onRequestPost as creditRoute } from '../functions/api/store-credits.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; sale return race properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 200, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0;
async function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample).slice(0, Number(process.env.KIWI_WITNESS_CHARS) || 1500), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

const f = await fixture(ROOT), { sql, merchant } = f;
const secret = f.env.AUTH_SECRET;
const owner = `${SESS_COOKIE}=${await makeSession('money-owner', secret)}`;

/* A D1 that can pause its caller: before the route's n-th database step, the
 * interloper runs to completion. Statements inside one batch stay atomic. */
function pausingDB(base, at, interloper) {
  let step = 0, fired = false;
  const pause = async () => { step++; if (!fired && step === at) { fired = true; await interloper(); } };
  const wrap = (inner) => {
    const s = {
      inner,
      bind(...values) { inner.bind(...values); return s; },
      async first() { await pause(); return inner.first(); },
      async all() { await pause(); return inner.all(); },
      async run() { await pause(); return inner.run(); },
    };
    return s;
  };
  return {
    prepare: (q) => wrap(base.prepare(q)),
    async batch(statements) { await pause(); return base.batch(statements.map((s) => s.inner || s)); },
    get fired() { return fired; },
  };
}

async function post(route, url, body, env) {
  const res = await route({ env, request: new Request('https://kiwi.test' + url, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, ...body }) }) });
  let out = null; try { out = await res.json(); } catch (_) {}
  return { status: res.status, body: out };
}
let serial = 0;
/* One action against the ticket; returns a function the harness can run against any D1. */
function action(a, saleId, ticket) {
  if (a.share) a = { ...a, cents: Math.max(1, Math.round(ticket * a.share / 100)) };
  const id = `${a.kind}-${saleId}-${++serial}`;
  if (a.kind === 'void') return { id, kind: 'void', cents: 0, run: (env) => post(cancelRoute, '/api/sale/cancel', { id: saleId, source: 'dashboard', reason: 'property' }, env) };
  if (a.kind === 'refund') return { id, kind: 'refund', cents: a.cents, run: async (env) => {
    const approval = await managerRefundProof(secret, { merchant, staffId: 'manager-fixture', staffName: 'Fixture Manager', staffRole: 'manager', refundId: id, originalSaleId: saleId, amountCents: a.cents });
    return post(refundRoute, '/api/sale/refund', { id, originalSaleId: saleId, amountCents: a.cents, approval, reason: 'property', ref: id }, env);
  } };
  return { id, kind: 'credit', cents: a.cents, run: (env) => post(creditRoute, '/api/store-credits', { action: 'issue', id, originalSaleId: saleId, amountCents: a.cents, reason: 'Retour' }, env) };
}

function books(saleId) {
  const sale = sql.prepare('SELECT amount_cents, void_ts FROM sales WHERE merchant = ? AND id = ?').get(merchant, saleId);
  const refunds = sql.prepare("SELECT note, amount_cents FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'refund'").all(merchant, saleId);
  const negatives = sql.prepare("SELECT id, amount_cents FROM sales WHERE merchant = ? AND channel = 'refund' AND id LIKE ?").all(merchant, 'refund-' + saleId + '-%');
  let credits = [];
  try { credits = sql.prepare("SELECT credit_id, amount_cents FROM store_credit_events WHERE merchant = ? AND ref_id = ? AND action = 'issue'").all(merchant, saleId); } catch (_) {}
  return { sale, refunds, negatives, credits };
}
function check(saleId, ticket, done) {
  const b = books(saleId);
  const refunded = b.refunds.reduce((s, r) => s + Number(r.amount_cents), 0);
  const credited = b.credits.reduce((s, r) => s + Number(r.amount_cents), 0);
  if (b.sale.void_ts) {
    assert.equal(b.refunds.length + b.negatives.length, 0, `voided ticket kept a refund (${refunded})`);
    assert.equal(b.credits.length, 0, `voided ticket kept a store credit (${credited})`);
  }
  assert.ok(refunded + credited <= ticket, `refunds ${refunded} + credits ${credited} pass the ticket ${ticket}`);
  assert.equal(b.refunds.length, b.negatives.length, 'a refund audit without its negative sale, or the reverse');
  const okVoids = done.filter((d) => d.kind === 'void' && d.res.status === 200 && d.res.body && d.res.body.ok).length;
  assert.equal(okVoids, b.sale.void_ts ? 1 : 0, `${okVoids} void(s) answered ok, ticket ${b.sale.void_ts ? 'voided' : 'open'}`);
  for (const d of done) {
    const ok = !!(d.res.status === 200 && d.res.body && d.res.body.ok);
    if (d.kind === 'refund') assert.equal(ok, b.refunds.some((r) => r.note === d.id), 'refund answer ' + d.res.status + ' vs state');
    if (d.kind === 'credit') assert.equal(ok, b.credits.some((r) => r.credit_id === d.id), 'credit answer ' + d.res.status + ' vs state');
  }
}

/* Amounts are a share of the ticket (up to 120 %), so most of them fit and the guards are what decide. */
const actionArb = fc.oneof(
  fc.constant({ kind: 'void' }),
  fc.record({ kind: fc.constant('refund'), share: fc.integer({ min: 1, max: 120 }) }),
  fc.record({ kind: fc.constant('credit'), share: fc.integer({ min: 1, max: 120 }) }),
);
const ticketArb = fc.integer({ min: 100, max: 20000 });
let saleSerial = 0;
function freshSale(ticket) { const id = 'race-sale-' + (++saleSerial); f.insert(id, ticket, { ts: Date.now() - 60000 }); return id; }

console.log('sale-return-race-properties-test');
try {
  await strict('two devices taking value back from one ticket at the same moment, paused at every step of the first: a voided ticket keeps no refund or credit, refunds plus credits stay within the ticket, and every answer matches the books', fc.asyncProperty(
    ticketArb, actionArb, actionArb, fc.integer({ min: 1, max: 16 }), async (ticket, a, b, at) => {
      const saleId = freshSale(ticket);
      const first = action(a, saleId, ticket), second = action(b, saleId, ticket);
      const done = [];
      const db = pausingDB(f.env.DB, at, async () => { done.push({ ...second, res: await second.run(f.env) }); });
      done.push({ ...first, res: await first.run({ ...f.env, DB: db }) });
      if (!db.fired) done.push({ ...second, res: await second.run(f.env) });
      check(saleId, ticket, done);
    }));

  await strict('ordinary sequences of voids, refunds and store credits on one ticket keep the same three rules', fc.asyncProperty(
    ticketArb, fc.array(actionArb, { minLength: 1, maxLength: 5 }), async (ticket, acts) => {
      const saleId = freshSale(ticket);
      const done = [];
      for (const a of acts) { const x = action(a, saleId, ticket); done.push({ ...x, res: await x.run(f.env) }); }
      check(saleId, ticket, done);
    }));

  console.log(`${failed ? '✗' : '✓'} sale-return-race-properties-test · ${passed} held, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
