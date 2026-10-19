#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { foldedCode, onRequestGet, onRequestPost } from '../functions/api/store-credits.js';
import { makeSession, managerRefundProof, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

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

/* Émettre un avoir demande un responsable : la capacité que /api/pin/verify
   délivre après vérification serveur du code, liée à CETTE émission. */
const approve = (id, saleId, cents, claims = {}) => managerRefundProof(SECRET, {
  merchant: MERCHANT, staffId: 'staff-manager', staffName: 'Sara', staffRole: 'Manager',
  refundId: id, originalSaleId: saleId, amountCents: cents, refundMethod: 'avoir', ...claims,
});

console.log('■ Maison store-credit ledger');
let reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', originalRef: '0042', amountCents: 6000,
  customerId: 'client-1', customerName: 'Cliente Test', reason: 'Retour', expiresAt: Date.now() + 86400000 });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'a paired till alone cannot issue a store credit');
reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', amountCents: 6000,
  approval: await approve('issue:return:0001', 'sale-origin-1', 5000) });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'an approval for another amount does not authorise the issue');
reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', amountCents: 6000,
  approval: await approve('issue:return:0001', 'sale-origin-1', 6000, { refundMethod: 'cash' }) });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'a cash-refund approval cannot be replayed as a store-credit issue');
reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', amountCents: 6000,
  approval: await approve('issue:return:0001', 'sale-origin-1', 6000, { staffRole: 'Caissier' }) });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'a cashier-tier approval is not enough');
reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', amountCents: 6000,
  approval: await approve('issue:return:0001', 'sale-origin-1', 6000, { merchant: 'autre-boutique' }) });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'an approval minted for another merchant is refused');
reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', originalRef: '0042', amountCents: 6000,
  customerId: 'client-1', customerName: 'Cliente Test', reason: 'Retour', expiresAt: Date.now() + 86400000,
  approval: await approve('issue:return:0001', 'sale-origin-1', 6000) });
ok(reply.status === 200 && /^AV-[A-Z0-9]+$/.test(reply.body.credit.code), 'a return issues one server-generated credit once a manager approved it');
const codeA = reply.body.credit.code;
reply = await post({ action: 'issue', id: 'issue:return:0001', originalSaleId: 'sale-origin-1', amountCents: 6000 });
ok(reply.status === 200 && reply.body.replay && reply.body.credit.code === codeA, 'issuance retry is idempotent');
reply = await post({ action: 'issue', id: 'issue:return:over', originalSaleId: 'sale-origin-1', amountCents: 5000,
  approval: await approve('issue:return:over', 'sale-origin-1', 5000) });
ok(reply.status === 409 && reply.body.error === 'sale-credit-exceeds-available', 'credits cannot exceed the original sale');
reply = await post({ action: 'issue', id: 'issue:return:0002', originalSaleId: 'sale-origin-1', amountCents: 4000 }, ownerCookie);
ok(reply.status === 200, 'the owner session needs no extra approval, and the remaining sale value can be credited once');
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

reply = await post({ action: 'adjust', id: 'adjust:credit:forbidden', code: codeA, deltaCents: 500, reason: 'Correction test' });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'a paired till alone cannot correct a store-credit balance');
reply = await post({ action: 'adjust', id: 'adjust:credit:plus', code: codeA, deltaCents: 500, reason: 'Erreur de saisie documentée' }, ownerCookie);
ok(reply.status === 200 && reply.body.credit.balanceCents === 3500, 'an owner can add a documented balance correction');
reply = await post({ action: 'adjust', id: 'adjust:credit:minus', code: codeA, deltaCents: -250, reason: 'Rectification après contrôle' }, ownerCookie);
ok(reply.status === 200 && reply.body.credit.balanceCents === 3250, 'an owner can subtract a documented balance correction');
reply = await post({ action: 'adjust', id: 'adjust:credit:minus', code: codeA, deltaCents: -250, reason: 'Rectification après contrôle' }, ownerCookie);
ok(reply.status === 200 && reply.body.replay && reply.body.credit.balanceCents === 3250, 'a repeated correction is idempotent');

reply = await post({ action: 'cancel', id: 'cancel:credit:forbidden', code: codeB, reason: 'Correction gérant' });
ok(reply.status === 403 && reply.body.error === 'manager-required', 'a paired till alone cannot cancel a store liability');
reply = await post({ action: 'cancel', id: 'cancel:credit:0001', code: codeB, reason: 'Correction gérant' }, ownerCookie);
ok(reply.status === 200 && reply.body.credit.status === 'cancelled' && reply.body.credit.balanceCents === 0, 'manager cancellation closes the liability with an audit event');
const eventCount = sqlite.prepare('SELECT COUNT(*) AS n FROM store_credit_events WHERE merchant=?').get(MERCHANT).n;
ok(eventCount === 7, 'immutable ledger contains issues, redemptions, corrections and cancellation');

const get = await onRequestGet({ request: new Request(`https://kiwi.test/api/store-credits?merchant=${MERCHANT}&active=1`, { headers: { cookie } }), env });
const listed = await get.json();
ok(get.status === 200 && listed.credits.length === 1 && listed.credits[0].code === codeA && listed.credits[0].balanceCents === 3250, 'active register excludes cancelled credits and shows corrected balance');
const correctionEvent = listed.credits[0].events.find((event) => event.action === 'adjust' && event.amountCents === -250);
ok(correctionEvent && correctionEvent.note === 'Rectification après contrôle', 'credit register returns documented correction reasons');
const getAll = await onRequestGet({ request: new Request(`https://kiwi.test/api/store-credits?merchant=${MERCHANT}`, { headers: { cookie } }), env });
const allListed = await getAll.json();
const cancelledCredit = allListed.credits.find((credit) => credit.code === codeB);
const cancelEvent = cancelledCredit && cancelledCredit.events.find((event) => event.action === 'cancel');
ok(getAll.status === 200 && cancelEvent && cancelEvent.note === 'Correction gérant', 'credit register returns documented cancellation reasons');
reply = await post({ action: 'redeem', id: 'redeem:cross:0001', code: codeA, amountCents: 100 }, '');
ok(reply.status === 401, 'an unpaired browser cannot spend a store credit');

/* Mesuré le 2026-10-19 sur une vraie caisse boutique : le bon portait
   « AV-07OUG9E0R065X6 », la caissière le tapait avec un zéro à la place du O
   (ou en minuscules) et le registre ne retrouvait rien ; l'émetteur inscrit
   était « Caisse » alors qu'une responsable avait donné son code ; et la
   consommation ne disait pas quel ticket l'avait faite. */
const redeemEvent = sqlite.prepare("SELECT ref_id FROM store_credit_events WHERE merchant=? AND id=?")
  .get(MERCHANT, 'redeem:ticket:0001:redeem:0');
ok(redeemEvent && redeemEvent.ref_id === 'sale-new-1', 'a redemption records the ticket that consumed the credit');
sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines)
  VALUES ('sale-origin-2', ?, 250, 25000, 'cash', 'Robe', '1000', ?, NULL, '[]')`).run(MERCHANT, Date.now());
reply = await post({ action: 'issue', id: 'issue:return:robe', originalSaleId: 'sale-origin-2', originalRef: '1000', amountCents: 25000,
  customerId: 'client-2', customerName: 'Cliente Robe', reason: 'Taille', approval: await approve('issue:return:robe', 'sale-origin-2', 25000) });
ok(reply.status === 200 && /^AV-[0-9A-HJKMNP-TV-Z]{14}$/.test(reply.body.credit.code), 'new credit codes use only characters with no look-alike (no I, L, O, U)');
ok(reply.body.credit.issuedBy === 'Sara', 'the credit names the manager who approved it, not the till');
const issueRow = sqlite.prepare("SELECT actor FROM store_credit_events WHERE merchant=? AND id='issue:return:robe:issue'").get(MERCHANT);
ok(issueRow && issueRow.actor === 'Sara', 'the issue event in the ledger names the approving manager too');
sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines)
  VALUES ('sale-origin-3', ?, 100, 10000, 'cash', 'Robe', '1006', ?, NULL, '[]')`).run(MERCHANT, Date.now());
reply = await post({ action: 'issue', id: 'issue:return:owner-tablet', originalSaleId: 'sale-origin-3', originalRef: '1006', amountCents: 10000,
  approval: await approve('issue:return:owner-tablet', 'sale-origin-3', 10000) }, `${cookie}; ${ownerCookie}`);
ok(reply.status === 200 && reply.body.credit.issuedBy === 'Sara', 'on a tablet where the owner is also signed in, the approving manager is still the one named');
const legacy = 'AV-07OUG9E0R065X6';
sqlite.prepare(`INSERT INTO store_credits (id, merchant, code, customer_id, customer_name, original_sale_id, original_ref,
  amount_cents, balance_cents, status, expires_ts, reason, issued_by, last_event_id, created_ts, updated_ts)
  VALUES ('legacy-credit', ?, ?, '', 'Porteur', 'sale-origin-1', '0042', 100, 100, 'active', ?, 'Retour', 'Caisse', 'legacy', ?, ?)`)
  .run(MERCHANT, legacy, Date.now() + 86400000, Date.now(), Date.now());
for (const typed of ['av-07oug9e0r065x6', 'AV-070UG9E0R065X6', ' av 07OUG9EOR065X6 ']) {
  const found = await onRequestGet({ request: new Request(`https://kiwi.test/api/store-credits?merchant=${MERCHANT}&code=${encodeURIComponent(typed)}`, { headers: { cookie } }), env });
  const body = await found.json();
  ok(found.status === 200 && body.credits.length === 1 && body.credits[0].code === legacy, `a printed code typed as « ${typed.trim()} » still finds the credit`);
}
ok(foldedCode('av-1lI0o') === 'AV-11100', 'folding maps I and L to 1 and O to 0, case-insensitively');

sqlite.close();
console.log(`\n✓ ${controls} store-credit controls passed.`);
