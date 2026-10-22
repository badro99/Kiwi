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
import fs from 'node:fs';
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

async function knownIssue(label, property) {
  const result = await fc.check(property, {numRuns: RUNS, seed: SEED});
  console.log(result.failed ? '○ known: ' + label : '! known now holds: ' + label + '; promote to strict');
}

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
    ticketArb, actionArb, actionArb, fc.integer({ min: 1, max: 24 }), async (ticket, a, b, at) => {
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

  await strict('a return pays back money first in the till\'s method, then restores the original customer credit for the rest, exactly once, including zero-money tickets', fc.asyncProperty(
    fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 0, max: 20000 }), fc.integer({ min: 0, max: 20000 }), fc.array(fc.integer({min:1,max:30000}), {minLength:1,maxLength:5}), async (credit, cash, card, asks) => {
      const saleId = freshSale(cash+card), creditId = 'voucher-' + saleId;
      sql.prepare("UPDATE sales SET method=?, payment_parts=? WHERE id=?").run(cash+card ? 'split' : 'credit', JSON.stringify([{method:'cash',amountCents:cash},{method:'card',amountCents:card},{method:'credit',amountCents:credit}]), saleId);
      sql.prepare("INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts) VALUES(?,?,?,'client-fixture',?,0,'consumed',?,1,1)").run(creditId,merchant,creditId,credit,Date.now()+86400000);
      sql.prepare("INSERT INTO store_credit_events(id,merchant,credit_id,code,action,amount_cents,balance_after_cents,ref_id,ts) VALUES(?,?,?,?,'redeem',?,0,?,1)").run('spent-'+saleId,merchant,creditId,creditId,credit,saleId);
      let returned=0;
      for (const [i, amount] of [...asks, credit+cash+card].entries()) {
        const id='return-'+saleId+'-'+i;
        const approval=await managerRefundProof(secret,{merchant,staffId:'manager-fixture',staffName:'Fixture Manager',staffRole:'manager',refundId:id,originalSaleId:saleId,amountCents:amount});
        const run=()=>post(refundRoute,'/api/sale/refund',{id,originalSaleId:saleId,amountCents:amount,approval},f.env);
        const res=await run();
        if(amount<=credit+cash+card-returned){assert.equal(res.status,200,JSON.stringify(res.body));returned+=amount;assert.equal((await run()).status,200);}
        else assert.equal(res.status,409);
        const row=sql.prepare('SELECT balance_cents,customer_id FROM store_credits WHERE id=?').get(creditId);
        /* L'argent d'abord (ce que le tiroir rend), l'avoir pour ce qui dépasse. */
        assert.equal(row.balance_cents,Math.max(0,returned-(cash+card)));assert.equal(row.customer_id,'client-fixture');
        const out=sql.prepare("SELECT COALESCE(-SUM(amount_cents),0) AS c FROM sales WHERE merchant=? AND channel='refund' AND id LIKE ?").get(merchant,'return-'+saleId+'-%').c;
        assert.equal(out,Math.min(returned,cash+card));
      }
    }));

  /* Le tiroir et les rapports disent la même chose : ce que la caisse demande
     dans un moyen, tant que l'argent encaissé le couvre, sort entier dans ce
     moyen, même sur un ticket payé en partie par avoir. */
  await strict('within the money actually paid, the till\'s requested method and amount are what the books record', fc.asyncProperty(
    fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 0, max: 20000 }), fc.integer({ min: 1, max: 40000 }), async (cash, card, credit, ask) => {
      const amount = Math.min(ask, cash + card);
      const saleId = freshSale(cash + card), creditId = 'drawer-voucher-' + saleId;
      sql.prepare("UPDATE sales SET method='split', payment_parts=? WHERE id=?").run(JSON.stringify([{method:'cash',amountCents:cash},{method:'card',amountCents:card},{method:'credit',amountCents:credit}]), saleId);
      if (credit) {
        sql.prepare("INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts) VALUES(?,?,?,'client-fixture',?,0,'consumed',?,1,1)").run(creditId,merchant,creditId,credit,Date.now()+86400000);
        sql.prepare("INSERT INTO store_credit_events(id,merchant,credit_id,code,action,amount_cents,balance_after_cents,ref_id,ts) VALUES(?,?,?,?,'redeem',?,0,?,1)").run('drawer-spent-'+saleId,merchant,creditId,creditId,credit,saleId);
      }
      const id = 'drawer-return-' + saleId;
      const approval = await managerRefundProof(secret,{merchant,staffId:'manager-fixture',staffName:'Fixture Manager',staffRole:'manager',refundId:id,originalSaleId:saleId,amountCents:amount,refundMethod:'cash'});
      const res = await post(refundRoute,'/api/sale/refund',{id,originalSaleId:saleId,amountCents:amount,refundMethod:'cash',approval},f.env);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const row = sql.prepare('SELECT amount_cents, method FROM sales WHERE merchant=? AND id=?').get(merchant, id);
      assert.equal(row.amount_cents, -amount); assert.equal(row.method, 'cash');
      if (credit) assert.equal(sql.prepare('SELECT balance_cents FROM store_credits WHERE id=?').get(creditId).balance_cents, 0);
    }));

  await strict('a foreign or voided original cannot move either merchant books', fc.asyncProperty(ticketArb, async cents => {
    const saleId = freshSale(cents);
    sql.prepare('UPDATE sales SET void_ts=1 WHERE id=?').run(saleId);
    assert.equal((await f.refund('void-return-'+saleId,saleId,cents)).status,404);
    const foreign='foreign-'+saleId;
    f.insert(foreign,cents,{merchant:'server-other-shop'});
    const before=sql.prepare('SELECT COUNT(*) AS n FROM sale_audit').get().n;
    assert.equal((await f.refund('foreign-return-'+saleId,foreign,cents)).status,404);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM sale_audit').get().n,before);
  }));

  await strict('a redemption pointing at another merchant credit is refused without changing it', fc.asyncProperty(ticketArb, async cents => {
    const saleId=freshSale(0), id='foreign-credit-'+saleId;
    sql.prepare("INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts) VALUES(?,'server-other-shop',?,'foreign-customer',?,0,'consumed',?,1,1)").run(id,id,cents,Date.now()+86400000);
    sql.prepare("INSERT INTO store_credit_events(id,merchant,credit_id,code,action,amount_cents,balance_after_cents,ref_id,ts) VALUES(?,?,?,?,'redeem',?,0,?,1)").run('bad-'+id,merchant,id,id,cents,saleId);
    assert.equal((await f.refund('foreign-credit-return-'+saleId,saleId,cents)).status,409);
    assert.equal(sql.prepare('SELECT balance_cents FROM store_credits WHERE id=?').get(id).balance_cents,0);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE sale_id=?").get(saleId).n,0);
  }));

  await knownIssue('Maison refund preview assumes a single payout; product copy must explain voucher restoration and split payouts before broad UI rollout', fc.property(fc.constant(null), () => {
    const source=fs.readFileSync(path.join(ROOT,'assets/pos-maison/checkout.js'),'utf8');
    return !source.includes("const preferred = ['carte', 'espèces', 'virement', 'chèque']");
  }));

  /* A credit's own ledger: what was issued, plus adjustments, equals what was
     spent, plus what was cancelled, plus what is left, whatever two tills do
     to it at the same moment. */
  const creditOp = fc.oneof(
    fc.record({ kind: fc.constant('redeem'), share: fc.integer({ min: 1, max: 120 }) }),
    fc.record({ kind: fc.constant('redeem-batch'), share: fc.integer({ min: 1, max: 120 }) }),
    fc.record({ kind: fc.constant('adjust'), share: fc.integer({ min: -120, max: 120 }).filter((x) => x !== 0) }),
    fc.constant({ kind: 'cancel' }),
  );
  const creditCall = (op, code, value) => {
    const id = `${op.kind}-${code}-${++serial}`, cents = Math.max(1, Math.round(value * Math.abs(op.share || 0) / 100));
    const body = op.kind === 'redeem' ? { action: 'redeem', id, code, amountCents: cents, saleId: 'next-' + id }
      : op.kind === 'redeem-batch' ? { action: 'redeem-batch', id, saleId: 'next-' + id, credits: [{ code, amountCents: cents }] }
      : op.kind === 'adjust' ? { action: 'adjust', id, code, deltaCents: Math.sign(op.share) * cents, reason: 'Correction' }
      : { action: 'cancel', id, code, reason: 'Erreur' };
    return (env) => post(creditRoute, '/api/store-credits', body, env);
  };
  await strict('a store credit\'s ledger always balances (issued plus adjustments equals spent plus cancelled plus what is left), with two tills acting on it at every step', fc.asyncProperty(
    ticketArb, creditOp, creditOp, fc.integer({ min: 1, max: 24 }), async (value, a, b, at) => {
      const saleId = freshSale(value);
      const issued = await post(creditRoute, '/api/store-credits', { action: 'issue', id: 'iss-' + saleId, originalSaleId: saleId, amountCents: value, reason: 'Retour' }, f.env);
      assert.equal(issued.status, 200, JSON.stringify(issued.body));
      const code = issued.body.credit.code;
      const first = creditCall(a, code, value), second = creditCall(b, code, value);
      const db = pausingDB(f.env.DB, at, async () => { await second(f.env); });
      await first({ ...f.env, DB: db });
      if (!db.fired) await second(f.env);
      const row = sql.prepare('SELECT id, balance_cents, status FROM store_credits WHERE merchant = ? AND code = ?').get(merchant, code);
      const ev = sql.prepare('SELECT action, amount_cents FROM store_credit_events WHERE merchant = ? AND credit_id = ?').all(merchant, row.id);
      const sum = (k) => ev.filter((e) => e.action === k).reduce((t, e) => t + Number(e.amount_cents), 0);
      assert.ok(row.balance_cents >= 0, 'negative balance ' + row.balance_cents);
      if (row.status === 'cancelled') assert.equal(row.balance_cents, 0);
      assert.equal(sum('issue') + sum('adjust'), sum('redeem') + sum('cancel') + Number(row.balance_cents),
        `issued ${sum('issue')} + adjusted ${sum('adjust')} ≠ spent ${sum('redeem')} + cancelled ${sum('cancel')} + left ${row.balance_cents}`);
    }));

  console.log(`${failed ? '✗' : '✓'} sale-return-race-properties-test · ${passed} held, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
