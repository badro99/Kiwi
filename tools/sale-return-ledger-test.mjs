#!/usr/bin/env node
/* Une vente ne se rend qu'une fois · remboursements, avoirs et annulation.
 *
 * Trois trous de la même famille, tous côté serveur :
 *   1. /api/sale/cancel annulait une vente déjà remboursée ou transformée en
 *      avoir : la somme sortait deux fois des chiffres (revenu, tiroir, KPI) ;
 *   2. le plafond du remboursement ne comptait que les remboursements, celui de
 *      l'avoir que les avoirs : un remboursement espèces PLUS un avoir pouvaient
 *      ensemble dépasser le ticket ;
 *   3. émettre un avoir ne demandait aucun responsable.
 * Les vraies routes tournent sur schema.sql chargé dans un SQLite en mémoire.
 * Aucun code réel : l'approbation est signée avec le secret du banc.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as cancelPost } from '../functions/api/sale/cancel.js';
import * as refundRoute from '../functions/api/sale/refund.js';
const refundPost = refundRoute.onRequestPost;
import { onRequestPost as creditPost } from '../functions/api/store-credits.js';
import { makeSession, managerRefundProof, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const MERCHANT = 'ledger-test-shop';
const SECRET = 'sale-return-ledger-bench-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));

let intercept = null;
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      runSync() { return statement.run(); },
      first() {
        if (intercept && intercept.test(sql)) return { c: 0 };
        return sqlite.prepare(sql).get(...args) || null;
      },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = statements.map((s) => s.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
  VALUES ('acc-ledger', 'ledger@example.test', 'Ledger Test Shop', 's', 'h', ?, 'active')`).run(now);
sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, account_id, updated_ts)
  VALUES (?, '{}', 'Ledger Test Shop', 'boutique', 'active', 0, 'acc-ledger', ?)`).run(MERCHANT, now);
for (const id of ['sale-A', 'sale-B', 'sale-C', 'sale-D', 'sale-E', 'sale-F']) {
  sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, void_ts, lines)
    VALUES (?, ?, 100, 10000, 'cash', 'Robe', ?, ?, NULL, '[{"n":"Robe","q":1,"t":100}]')`).run(id, MERCHANT, id.slice(-1), now - 60000);
}

const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
const owner = `${SESS_COOKIE}=${await makeSession('acc-ledger', SECRET)}`;
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; console.log('  ✓ ' + message); };
const call = async (handler, url, body, cookie) => {
  const response = await handler({ env, request: new Request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ merchant: MERCHANT, ...body }),
  }) });
  return { status: response.status, body: await response.json() };
};
async function refund(saleId, cents, tag) {
  const refundId = `refund:${saleId}:${tag}`;
  const approval = await managerRefundProof(SECRET, { merchant: MERCHANT, staffId: 'staff-mgr', staffName: 'Sara',
    staffRole: 'Manager', refundId, originalSaleId: saleId, amountCents: cents, refundMethod: 'cash' });
  return call(refundPost, 'https://kiwi.test/api/sale/refund',
    { id: refundId, originalSaleId: saleId, amountCents: cents, refundMethod: 'cash', approval, reason: 'retour' }, till);
}
async function avoir(saleId, cents, tag, cookie = owner, approval = '') {
  return call(creditPost, 'https://kiwi.test/api/store-credits',
    { action: 'issue', id: `credit-issue:${saleId}:${tag}`, originalSaleId: saleId, amountCents: cents,
      customerId: 'cl-1', customerName: 'Cliente', reason: 'Retour', approval }, cookie);
}
const cancel = (saleId) => call(cancelPost, 'https://kiwi.test/api/sale/cancel',
  { id: saleId, source: 'dashboard' }, owner);
const voided = (saleId) => sqlite.prepare('SELECT void_ts FROM sales WHERE merchant=? AND id=?').get(MERCHANT, saleId).void_ts;
const voidAudits = (saleId) => sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE merchant=? AND sale_id=? AND action='void'").get(MERCHANT, saleId).n;

console.log('■ Une vente ne se rend qu\'une fois');

/* 1 · l'annulation d'une vente déjà rendue */
let r = await refund('sale-A', 4000, 'one');
ok(r.status === 200 && r.body.ok, 'un remboursement partiel est accepté');
r = await cancel('sale-A');
ok(r.status === 409 && r.body.error === 'sale-has-refunds' && r.body.refundedCents === 4000,
  'annuler une vente déjà remboursée est refusé, avec le montant rendu');
ok(!voided('sale-A') && voidAudits('sale-A') === 0, 'la vente refusée reste intacte, sans ligne d\'annulation');

r = await avoir('sale-B', 3000, 'one');
ok(r.status === 200 && r.body.ok, 'un avoir partiel est accepté (session propriétaire)');
r = await cancel('sale-B');
ok(r.status === 409 && r.body.error === 'sale-has-refunds' && r.body.creditedCents === 3000,
  'annuler une vente déjà transformée en avoir est refusé');
ok(!voided('sale-B') && voidAudits('sale-B') === 0, 'la vente à avoir reste intacte aussi');

r = await cancel('sale-C');
ok(r.status === 200 && r.body.ok && voided('sale-C') && voidAudits('sale-C') === 1,
  'une vente jamais rendue s\'annule toujours (régression)');
r = await refund('sale-C', 1000, 'after-void');
ok(r.status === 404 && r.body.error === 'sale-not-found', 'et une vente annulée ne se rembourse plus');

/* La garde est AUSSI dans l'UPDATE : si la lecture préalable ne voit rien (un
   remboursement posé entre la lecture et l'écriture), l'écriture refuse. */
intercept = /FROM sale_audit\s+WHERE merchant = \? AND sale_id = \? AND action = 'refund'/;
r = await cancel('sale-A');
intercept = null;
ok(r.status === 409 && !voided('sale-A') && voidAudits('sale-A') === 0,
  'un remboursement concurrent est arrêté par la garde de l\'UPDATE lui-même');

/* 2 · un seul plafond pour remboursements + avoirs */
r = await refund('sale-D', 6000, 'cash');
ok(r.status === 200, 'ticket D : 60 MAD remboursés');
r = await avoir('sale-D', 5000, 'over');
ok(r.status === 409 && r.body.error === 'sale-credit-exceeds-available',
  'ticket D : un avoir de 50 dépasserait le ticket (60 + 50 > 100), refusé');
r = await avoir('sale-D', 4000, 'rest');
ok(r.status === 200, 'ticket D : le reste (40) peut devenir avoir');
r = await refund('sale-D', 100, 'more');
ok(r.status === 409 && r.body.error === 'refund-exceeds-sale', 'ticket D : plus un centime à rembourser');

r = await avoir('sale-E', 7000, 'first');
ok(r.status === 200, 'ticket E : 70 MAD en avoir');
r = await refund('sale-E', 4000, 'too-much');
ok(r.status === 409 && r.body.error === 'refund-exceeds-sale',
  'ticket E : un remboursement de 40 dépasserait le ticket (70 + 40 > 100), refusé');
r = await refund('sale-E', 3000, 'fits');
ok(r.status === 200, 'ticket E : le reste (30) se rembourse');

/* 3 · un avoir demande un responsable */
r = await avoir('sale-F', 2000, 'till-only', till);
ok(r.status === 403 && r.body.error === 'manager-required', 'une caisse appairée seule ne peut pas émettre d\'avoir');
const proofFor = (claims = {}) => managerRefundProof(SECRET, { merchant: MERCHANT, staffId: 'staff-mgr', staffName: 'Sara',
  staffRole: 'Manager', refundId: 'credit-issue:sale-F:ok', originalSaleId: 'sale-F', amountCents: 2000, refundMethod: 'avoir', ...claims });
r = await avoir('sale-F', 2000, 'ok', till, await proofFor({ refundMethod: 'cash' }));
ok(r.status === 403, 'l\'accord d\'un remboursement espèces ne vaut pas accord d\'avoir');
r = await avoir('sale-F', 2000, 'ok', till, await proofFor({ amountCents: 1000 }));
ok(r.status === 403, 'l\'accord est lié au montant');
r = await avoir('sale-F', 2000, 'ok', till, await proofFor({ originalSaleId: 'sale-A' }));
ok(r.status === 403, 'l\'accord est lié au ticket');
r = await avoir('sale-F', 2000, 'ok', till, await proofFor({ staffRole: 'Caissier' }));
ok(r.status === 403, 'l\'accord d\'un simple caissier ne suffit pas');
r = await avoir('sale-F', 2000, 'ok', till, await proofFor());
ok(r.status === 200 && r.body.ok, 'avec l\'accord signé d\'un responsable, la caisse émet l\'avoir');

// Wave S: a long-running register reads every authoritative event, not a cache.
assert.equal(typeof refundRoute.onRequestGet, 'function');
for (let i = 0; i < 600; i++) sqlite.prepare(`INSERT INTO sale_audit
  (merchant, sale_id, action, reason, note, amount_cents, ts)
  VALUES (?, 'sale-A', 'refund', 'Taille', ?, 1250, ?)`)
  .run(MERCHANT, 'history-' + i, now + i);
const register = async (offset = 0) => refundRoute.onRequestGet({ env, request: new Request(
  `https://kiwi.test/api/sale/refund?merchant=${MERCHANT}&offset=${offset}`, { headers: { cookie: owner } }) });
let page = await register();
assert.equal(page.status, 200);
let data = await page.json(), events = [...data.list];
assert.equal(data.next, 500);
while (data.next !== null) { data = await (await register(data.next)).json(); events.push(...data.list); }
const historical = events.filter(e => e.id.startsWith('refund:history-'));
assert.equal(historical.length, 600);
assert.equal(historical[0].amount, 12.5); assert.equal(historical[0].reason, 'Taille');
assert.ok(historical[0].saleRef); assert.ok(historical[0].ts);
assert.ok(events.some(e => e.kind === 'avoir'), 'return-funded credits are included');
const failedRead = await refundRoute.onRequestGet({ env: { ...env, DB: { prepare(sql) { if (sql.includes('UNION ALL')) throw new Error('offline'); return DB.prepare(sql); } } },
  request: new Request(`https://kiwi.test/api/sale/refund?merchant=${MERCHANT}`, { headers: { cookie: owner } }) });
assert.equal(failedRead.status, 503);
console.log('✓ Wave S: authoritative register paginates 600 refunds, credits and read failure');
sqlite.close();
console.log(`\n✓ ${controls} contrôles : une vente ne se rend qu'une fois.`);
