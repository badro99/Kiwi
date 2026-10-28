#!/usr/bin/env node
/* sale-server-truth-test · /api/sale and /api/sale/refund: what the till says
 * is checked against what the server knows, and a gap is recorded, never a
 * reason to refuse paid money.
 *
 *  - a basket over the 24 000 character cap is shrunk (detail removed, tail
 *    folded) and keeps its money; it is no longer stored as lines = NULL;
 *  - a basket whose lines add up to none of the sale's figures is flagged;
 *  - a till clock that is ahead, skewed at send time, or that books into a
 *    business day already closed by a Z is flagged;
 *  - every sale above is still booked, and a retried receipt is flagged once.
 * Runs the real routes over an in-memory D1. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestPost as refundPost } from '../functions/api/sale/refund.js';
import { fitBasket, basketCents } from '../functions/api/_sale-truth.js';
import { businessDate, merchantCutoff, merchantZone } from '../functions/api/_business-day.js';
import { tillToken, TILL_COOKIE, managerRefundProof } from '../functions/auth/_lib.js';

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
const env = { DB, AUTH_SECRET: 'sale-truth-fixture-secret' };
const M = 'truth-test';
const now = Date.now();
sql.prepare(`INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch)
 VALUES ('account-truth','truth@example.test','Owner','truth-test',?,?,?,'active',0)`)
  .run('00'.repeat(16), '11'.repeat(32), now);
sql.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts)
 VALUES (?,'{}','boutique','account-truth','Truth test','active',1,?)`).run(M, now);

async function call(route, path, body) {
  const token = await tillToken(env.AUTH_SECRET, M, 1);
  const request = new Request('https://kiwi.test' + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `kiwi_gate=1; ${TILL_COOKIE}=${token}` }, body: JSON.stringify(body) });
  const response = await route({ request, env });
  return { status: response.status, body: await response.json() };
}
const post = (id, extra = {}) => call(salePost, '/api/sale', { id, merchant: M, amountCents: 950, amount: 10,
  method: 'cash', label: 'TEST KIWI', ref: id, ts: now, ...extra });
const flagRows = (id, action) => sql.prepare('SELECT reason, note, impact FROM sale_audit WHERE sale_id=? AND action=?').all(id, action);
const booked = id => sql.prepare('SELECT count(*) n FROM sales WHERE id=?').get(id).n;
const storedLines = id => sql.prepare('SELECT lines FROM sales WHERE id=?').get(id).lines;
const matching = [{ n: 'Pain', q: 1, t: 4.5 }, { n: 'Lait', q: 1, t: 5 }];

// A basket that agrees with the money: nothing to report, stored as sent.
let r = await post('ok-basket', { lines: matching });
assert.equal(r.status, 200);
assert.equal(flagRows('ok-basket', 'basket-flag').length, 0, 'an honest basket is not flagged');
assert.equal(flagRows('ok-basket', 'clock-flag').length, 0, 'an honest clock is not flagged');
assert.equal(r.body.flags, undefined);

// Lines worth 50 MAD against a 9.50 MAD sale.
r = await post('inflated', { lines: [{ n: 'Caftan', q: 1, t: 50 }] });
assert.equal(r.status, 200, 'a basket that disagrees never refuses the sale');
assert.equal(booked('inflated'), 1);
assert.equal(flagRows('inflated', 'basket-flag')[0].reason, 'basket-sum-mismatch');
assert.deepEqual(r.body.flags, ['basket-sum-mismatch']);
await post('inflated', { lines: [{ n: 'Caftan', q: 1, t: 50 }] });
assert.equal(flagRows('inflated', 'basket-flag').length, 1, 'a retried receipt is flagged once');

// A discounted ticket: lines add up to the gross.
r = await post('gross-ok', { grossAmountCents: 1000, discountAmountCents: 50, discountReason: 'commercial',
  actorId: 'manager', lines: [{ n: 'Thé', q: 2, t: 10 }] });
assert.equal(r.status, 200);
assert.equal(flagRows('gross-ok', 'basket-flag').length, 0, 'lines matching the gross are consistent');

// A big basket keeps its lines. Each line carries 30 formula choices.
const choices = Array.from({ length: 30 }, (_, i) => ({ n: 'Choix numéro ' + i + ' du menu', q: 1, t: 0 }));
const heavy = Array.from({ length: 40 }, (_, i) => ({ n: 'Plat ' + i, q: 1, t: 1, fc: choices }));
assert.ok(JSON.stringify(heavy).length > 24000, 'fixture is over the old cap');
r = await post('heavy', { amountCents: 4000, amount: 40, lines: heavy });
assert.equal(r.status, 200);
const kept = storedLines('heavy');
assert.ok(kept && kept.length <= 24000, 'an oversized basket is shrunk, not stored as NULL');
assert.equal(basketCents(JSON.parse(kept)), 4000, 'and it keeps every centime');
assert.equal(flagRows('heavy', 'basket-flag')[0].reason, 'basket-folded', 'and the owner can see it was reduced');
assert.equal(flagRows('heavy', 'basket-flag')[0].note.includes('basket-sum-mismatch'), false);

// fitBasket on its own: when stripping detail is not enough the tail is folded.
const wide = Array.from({ length: 40 }, (_, i) => ({ n: 'x'.repeat(60), q: 2, t: 3.25, i: 'i'.repeat(80), v: 'v'.repeat(80), r: 'r'.repeat(80) }));
const fit = fitBasket(wide, 2000);
assert.ok(fit.text.length <= 2000 && fit.folded && fit.rows.length >= 1);
assert.equal(basketCents(fit.rows), basketCents(wide), 'folding keeps the total');
assert.equal(fit.rows.reduce((n, l) => n + l.q, 0), 80, 'and the units');
assert.equal(fitBasket(wide, 100).rows.length, 1, 'down to one line when nothing else fits');

// The device clock.
r = await post('ahead', { ts: now + 3 * 3600000 });
assert.equal(r.status, 200, 'a till three hours ahead still books its sale');
assert.equal(booked('ahead'), 1);
assert.equal(flagRows('ahead', 'clock-flag')[0].reason, 'ts-ahead');
r = await post('skewed', { sentAt: now - 40 * 60000 });
assert.equal(r.status, 200);
assert.equal(flagRows('skewed', 'clock-flag')[0].reason, 'device-clock-skew');
assert.ok(JSON.parse(flagRows('skewed', 'clock-flag')[0].impact).receivedTs >= now, 'the server time of reception is recorded');
r = await post('wild', { ts: now + 10 * 86400000 });
assert.equal(r.status, 200);
assert.equal(flagRows('wild', 'clock-flag')[0].reason, 'ts-clamped');
assert.equal(sql.prepare('SELECT ts FROM sales WHERE id=?').get('wild').ts < now + 60000, true, 'a wild future date is replaced by the server time');
r = await post('in-sync', { sentAt: now + 1000 });
assert.equal(flagRows('in-sync', 'clock-flag').length, 0, 'a clock within five minutes is fine');
r = await post('offline-yesterday', { ts: now - 3 * 3600000, sentAt: Date.now() });
assert.equal(r.status, 200);
assert.equal(flagRows('offline-yesterday', 'clock-flag').length, 0, 'an old offline sale with a correct send clock is not a clock error');

// A sale booked into a business day that a Z has already closed.
const cutoff = await merchantCutoff(env, M), zone = await merchantZone(env, M);
const yesterday = businessDate(now - 30 * 3600000, cutoff, zone);
sql.prepare(`INSERT INTO z_reconciliations (merchant,business_day,terminal_id,reported_count,reported_cents,server_count,server_cents,
  missing_count,missing_cents,mismatch_count,extra_count,status,result_json,updated_ts) VALUES (?,?,?,0,0,0,0,0,0,0,0,'ok','{}',?)`)
  .run(M, yesterday, 'till-1', now);
r = await post('late', { ts: now - 30 * 3600000, sentAt: Date.now() });
assert.equal(r.status, 200, 'a sale into a closed day is still booked');
assert.equal(booked('late'), 1);
assert.equal(flagRows('late', 'clock-flag')[0].reason, 'closed-business-day');
assert.equal(JSON.parse(flagRows('late', 'clock-flag')[0].impact).flags[0].detail.businessDay, yesterday);

// Refunds follow the same rule.
await post('to-refund', { amountCents: 4000, amount: 40, ts: now - 3600000 });
const refund = async (id, extra = {}) => {
  const body = { id, merchant: M, originalSaleId: 'to-refund', amountCents: 500, refundMethod: 'cash', reason: 'test', ts: now, ...extra };
  body.approval = await managerRefundProof(env.AUTH_SECRET, { merchant: M, staffId: 'staff-mgr', staffName: 'Sara',
    staffRole: 'Manager', refundId: id, originalSaleId: 'to-refund', amountCents: 500, refundMethod: 'cash' });
  return call(refundPost, '/api/sale/refund', body);
};
r = await refund('refund-ahead', { ts: now + 5 * 3600000 });
assert.equal(r.status, 200, 'refund booked: ' + JSON.stringify(r.body));
assert.equal(flagRows('refund-ahead', 'clock-flag')[0].reason, 'ts-ahead', 'a refund dated hours ahead is flagged');
r = await refund('refund-before', { ts: now - 5 * 3600000 });
assert.equal(r.status, 200, 'a refund dated before its sale is booked');
assert.ok(flagRows('refund-before', 'clock-flag').some(row => row.note.includes('before-original-sale')));
r = await refund('refund-closed', { ts: now - 30 * 3600000, sentAt: Date.now() });
assert.equal(r.status, 200);
assert.ok(flagRows('refund-closed', 'clock-flag')[0].note.includes('closed-business-day'), 'a refund cannot land in a closed day unflagged');
r = await refund('refund-fine');
assert.equal(r.status, 200);
assert.equal(flagRows('refund-fine', 'clock-flag').length, 0, 'a refund with a good clock is not flagged');
r = await refund('refund-skew', { sentAt: now - 20 * 60000 });
assert.equal(flagRows('refund-skew', 'clock-flag')[0].reason, 'device-clock-skew');
console.log('✓ sale server truth: baskets keep their money, clocks and totals are flagged, paid sales always book');
