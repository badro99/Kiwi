#!/usr/bin/env node
// #93: an owner policy of 5% is audited at ingestion; paid money is never refused.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(statement) {
    let args = [];
    const q = {
      bind(...v) { args = v; return q; },
      first() { return sql.prepare(statement).get(...args) || null; },
      all() { return { results: sql.prepare(statement).all(...args) }; },
      run() { const r = sql.prepare(statement).run(...args); return { meta: { changes: r.changes } }; },
    };
    return q;
  },
  batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try { const result = statements.map(q => q.run()); sql.exec('COMMIT'); return result; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
};
const env = { DB, AUTH_SECRET: 'discount-fixture-secret' };
const now = Date.now();
sql.prepare(`INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch)
 VALUES ('account-discount','discount@example.test','Owner','discount-test',?,?,?,'active',0)`)
  .run('00'.repeat(16), '11'.repeat(32), now);
sql.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts)
 VALUES ('discount-test','{}','boutique','account-discount','Discount test','active',1,?)`).run(now);
sql.prepare(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts)
 VALUES ('discount-test','discountpolicy',?,1,?)`).run(JSON.stringify({ percentages: [5] }), now - 1000);

async function post(id, extra = {}) {
  const body = { id, merchant: 'discount-test', amountCents: 950, amount: 10,
    method: 'cash', label: 'TEST KIWI', ref: id, ts: now, ...extra };
  const token = await tillToken(env.AUTH_SECRET, 'discount-test', 1);
  const request = new Request('https://kiwi.test/api/sale', { method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `kiwi_gate=1; ${TILL_COOKIE}=${token}` }, body: JSON.stringify(body) });
  const response = await salePost({ request, env });
  return { status: response.status, body: await response.json() };
}

const audit = id => sql.prepare("SELECT reason, note, amount_cents FROM sale_audit WHERE sale_id=? AND action='discount-policy'").all(id);
const booked = id => sql.prepare("SELECT count(*) n FROM sales WHERE id=?").get(id).n;

// A till that loaded the policy before the owner removed 20% still offers it.
// The customer has paid: the sale is booked and flagged, never refused.
let r = await post('bad-retail', { discountPercents: [20] });
assert.equal(r.status, 200, '20% retail receipt booked, not refused');
assert.equal(booked('bad-retail'), 1, 'paid money reaches the books');
assert.equal(audit('bad-retail').length, 1, '20% retail receipt flagged for the operator');
assert.equal(audit('bad-retail')[0].reason, 'discount-not-allowed');
assert.match(audit('bad-retail')[0].note, /20 %/);
r = await post('bad-retail', { discountPercents: [20] });
assert.equal(r.status, 200, 'outbox retry of the same receipt is idempotent');
assert.equal(audit('bad-retail').length, 1, 'a retried receipt is flagged once');
r = await post('good-retail', { discountPercents: [5] });
assert.equal(r.status, 200, '5% retail receipt accepted');
assert.equal(audit('good-retail').length, 0, 'allowed percentage is not flagged');
r = await post('bad-restaurant', { grossAmountCents: 1000, discountAmountCents: 50,
  discountKind: 'percent', discountPercent: 20, discountReason: 'commercial', actorId: 'manager' });
assert.equal(r.status, 200, '20% restaurant receipt booked');
assert.equal(audit('bad-restaurant').length, 1, '20% restaurant receipt flagged');
r = await post('good-restaurant', { grossAmountCents: 1000, discountAmountCents: 50,
  discountKind: 'percent', discountPercent: 5, discountReason: 'commercial', actorId: 'manager' });
assert.equal(r.status, 200, '5% restaurant receipt accepted');
assert.equal(audit('good-restaurant').length, 0);
r = await post('amount-restaurant', { grossAmountCents: 1000, discountAmountCents: 50,
  discountKind: 'amount', discountReason: 'commercial', actorId: 'manager' });
assert.equal(r.status, 200, 'fixed-amount discount is outside the percentage policy');
assert.equal(audit('amount-restaurant').length, 0);
r = await post('unproved-restaurant', { grossAmountCents: 1000, discountAmountCents: 50,
  discountReason: 'commercial', actorId: 'manager' });
assert.equal(r.status, 200, 'a till bundle older than the policy still books its discounted sale');
assert.equal(audit('unproved-restaurant')[0].reason, 'discount-unproved');
r = await post('historic-replay', { ts: now - 2000, discountPercents: [20] });
assert.equal(r.status, 200, 'an offline receipt made before the policy still syncs');
assert.equal(audit('historic-replay').length, 0, 'a receipt older than the policy is not flagged');
r = await post('malformed', { discountPercents: [0] });
assert.equal(r.status, 400, 'a malformed percentage is still a bad request');
console.log('✓ discount policy API: paid sales always book, out-of-policy ones are flagged');
