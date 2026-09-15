#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost } from '../functions/api/store-credits.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const MERCHANT = 'maison-credit-test';
const SECRET = 'store-credit-test-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));

const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = statements.map((statement) => statement.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts)
  VALUES (?, '{}', 'Maison Credit Test', 'maison', 'active', 0, ?)`).run(MERCHANT, Date.now());
sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
  VALUES ('acc-credit-owner', 'credit-owner@example.test', 'Maison Credit Test', 'salt', 'hash', ?, 'active')`).run(Date.now());
sqlite.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run('acc-credit-owner', MERCHANT);
sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines)
  VALUES ('sale-origin-1', ?, 100, 10000, 'card', 'Service', '0042', ?, NULL, '[]')`).run(MERCHANT, Date.now());

const cookie = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
const ownerCookie = `${SESS_COOKIE}=${await makeSession('acc-credit-owner', SECRET)}`;
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; console.log('  ✓ ' + message); };
async function post(body, customCookie = cookie) {
  const response = await onRequestPost({ request: new Request('https://kiwi.test/api/store-credits', {
    method: 'POST', headers: { cookie: customCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: MERCHANT, ...body }),
  }), env });
  return { status: response.status, body: await response.json() };
}

console.log('■ Maison store-credit ledger');
let reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', originalRef: '0042', amountCents: 6000,
  customerId: 'client-1', customerName: 'Cliente Test', reason: 'Retour', expiresAt: Date.now() + 86400000 });
ok(reply.status === 200 && /^AV-[A-Z0-9]+$/.test(reply.body.credit.code), 'a return issues one server-generated credit');
const codeA = reply.body.credit.code;
reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', amountCents: 6000 });
ok(reply.status === 200 && reply.body.replay && reply.body.credit.code === codeA, 'issuance retry is idempotent');
reply = await post({ action: 'issue', id: 'issue:return:over', originalSaleId: 'sale-origin-1', amountCents: 5000 });
ok(reply.status === 409 && reply.body.error === 'sale-credit-exceeds-available', 'credits cannot exceed the original sale');
reply = await post({ action: 'issue', id: 'issue:return:0002', originalSaleId: 'sale-origin-1', amountCents: 4000 });
ok(reply.status === 200, 'remaining sale value can be credited once');
const codeB = reply.body.credit.code;

reply = await post({ action: 'redeem-batch', id: 'redeem:ticket:0001', saleId: 'sale-new-1', credits: [
  { code: codeA, amountCents: 3000 }, { code: codeB, amountCents: 2000 },
] });
ok(reply.status === 200 && reply.body.credits.length === 2, 'several credits redeem atomically on one ticket');
let balances = Object.fromEntries(reply.body.credits.map((credit) => [credit.code, credit.balanceCents]));
ok(balances[codeA] === 3000 && balances[codeB] === 2000, 'partial redemption preserves both remaining balances');
reply = await post({ action: 'redeem-batch', id: 'redeem:ticket:0001', saleId: 'sale-new-1', credits: [
  { code: codeA, amountCents: 3000 }, { code: codeB, amountCents: 2000 },
] });
ok(reply.status === 200 && reply.body.replay, 'lost-response retry does not spend either credit twice');

reply = await post({ action: 'redeem-batch', id: 'redeem:ticket:over', credits: [
  { code: codeA, amountCents: 3001 }, { code: codeB, amountCents: 1 },
] });
ok(reply.status === 409 && reply.body.error === 'credit-batch-refused', 'one insufficient balance refuses the whole batch');
const afterRefusal = sqlite.prepare('SELECT code, balance_cents FROM store_credits WHERE merchant=? ORDER BY code').all(MERCHANT);
ok(afterRefusal.find((row) => row.code === codeA).balance_cents === 3000
  && afterRefusal.find((row) => row.code === codeB).balance_cents === 2000, 'failed batch leaves every balance unchanged');

reply = await post({ action: 'cancel', id: 'cancel:credit:forbidden', code: codeB, reason: 'Correction gérant' });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'a paired till alone cannot cancel a store liability');
reply = await post({ action: 'cancel', id: 'cancel:credit:0001', code: codeB, reason: 'Correction gérant' }, ownerCookie);
ok(reply.status === 200 && reply.body.credit.status === 'cancelled' && reply.body.credit.balanceCents === 0, 'manager cancellation closes the liability with an audit event');
const eventCount = sqlite.prepare('SELECT COUNT(*) AS n FROM store_credit_events WHERE merchant=?').get(MERCHANT).n;
ok(eventCount === 5, 'immutable ledger contains two issues, two redemptions and one cancellation');

const get = await onRequestGet({ request: new Request(`https://kiwi.test/api/store-credits?merchant=${MERCHANT}&active=1`, { headers: { cookie } }), env });
const listed = await get.json();
ok(get.status === 200 && listed.credits.length === 1 && listed.credits[0].code === codeA, 'active register excludes consumed or cancelled credits');
reply = await post({ action: 'redeem', id: 'redeem:cross:0001', code: codeA, amountCents: 100 }, '');
ok(reply.status === 401, 'an unpaired browser cannot spend a store credit');

sqlite.close();
console.log(`\n✓ ${controls} store-credit controls passed.`);
