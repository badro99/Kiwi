#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* Retours de livraison et confirmation automatique à 15 jours
 * (functions/api/receivables.js), sur le vrai schéma.
 *
 * Une livraison compte 0 MAD tant que l'argent n'est pas là : un retour ne
 * retire donc rien du chiffre d'affaires, il réduit ce qui reste à recevoir.
 * Sans retour après 15 jours, le reste dû entre dans le chiffre, daté du
 * quinzième jour, une seule fois.
 *
 * (en-tête d'origine :) Livraisons à recevoir, sur le vrai schéma.
 *
 * Une vente partie en livraison est à 0 MAD : le tableau de bord ne la voyait
 * nulle part et rien ne permettait de dire que le transporteur avait payé. On
 * vérifie qu'elle est listée avec ce qui reste dû, qu'une encaisse écrit UNE
 * vente du montant reçu avec son panier, qu'on ne reçoit pas deux fois, et que
 * seuls le propriétaire ou un opérateur peuvent le dire. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost, CONFIRM_DAYS } from '../functions/api/receivables.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const MERCHANT = 'boutique-returns-test';
const OTHER = 'boutique-other-test';
const SECRET = 'returns-test-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(coreTestSource.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
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
    try { const out = statements.map((s) => s.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
for (const [m, acc] of [[MERCHANT, 'acc-dlv-owner'], [OTHER, 'acc-other-owner']]) {
  sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts)
    VALUES (?, '{}', 'TEST KIWI', 'boutique', 'active', 0, ?)`).run(m, now);
  sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
    VALUES (?, ?, 'TEST KIWI', 'salt', 'hash', ?, 'active')`).run(acc, acc + '@example.test', now);
  sqlite.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run(acc, m);
}

const DAY = 86400e3;
const basket = [
  { n: 'Robe lin M', q: 1, t: 450, c: 'Robes', i: 'prod_1', v: 'prod_1:M:bleu' },
  { n: 'Cape TU', q: 2, t: 700, c: 'Divers', i: 'prod_2', v: 'prod_2:TU:noir' },
  { n: 'Jean S', q: 1, t: 200, c: 'Jeans', i: 'prod_3', v: 'prod_3:S:noir' },
];
const sale = (id, dueC, ts, lines = basket) => {
  sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, payment_parts, label, ref, ts, void_ts, lines, channel)
    VALUES (?, ?, 0, 0, 'delivery', ?, 'Livraison', ?, ?, NULL, ?, 'delivery')`).run(id, MERCHANT,
    JSON.stringify([{ method: 'delivery', amountCents: dueC }]), id.toUpperCase(), ts, JSON.stringify(lines));
};
sale('r-part', 135000, now - 2 * DAY);
sale('r-full', 135000, now - 3 * DAY);
sale('r-old', 135000, now - (CONFIRM_DAYS + 1) * DAY);
sale('r-oldpart', 135000, now - (CONFIRM_DAYS + 2) * DAY);
// La mise en service est simulée 20 jours en arrière : ce qui est vendu avant
// reste à recevoir, jamais confirmé en bloc.
env.DELIVERY_AUTO_FROM_TS = now - 20 * DAY;
sale('r-backlog', 40000, now - 21 * DAY);
sale('r-young', 50000, now - (CONFIRM_DAYS - 1) * DAY, [{ n: 'Sac', q: 1, t: 500, i: 'prod_9', v: 'prod_9:TU:noir' }]);

const owner = `${SESS_COOKIE}=${await makeSession('acc-dlv-owner', SECRET)}`;
const otherOwner = `${SESS_COOKIE}=${await makeSession('acc-other-owner', SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls++; console.log('  ✓ ' + message); };
async function get(cookie, q = '') {
  const r = await onRequestGet({ request: new Request(`https://kiwi.test/api/receivables?merchant=${MERCHANT}${q}`, { headers: { cookie } }), env });
  return { status: r.status, body: await r.json() };
}
async function post(body, cookie = till) {
  const r = await onRequestPost({ request: new Request('https://kiwi.test/api/receivables', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: MERCHANT, ...body }) }), env });
  return { status: r.status, body: await r.json() };
}
const mgr = { id: 'staff-1', name: 'Nadia' };

// Le retour partiel d'un colis plus vieux que le délai est posé AVANT la
// première lecture, qui déclenche la confirmation automatique.
let r = await post({ saleId: 'r-oldpart', action: 'return', id: 'ret-oldpart-1', lines: [{ i: 1, q: 1 }], returnedBy: mgr });
ok(r.status === 200 && r.body.returnedCents === 35000, 'one of two capes comes back: 350 MAD less to receive');

console.log('■ Retours · partiel');
r = await post({ saleId: 'r-part', action: 'return', id: 'ret-part-1', lines: [{ i: 0, q: 1 }], returnedBy: mgr });
ok(r.status === 200 && r.body.already === false && r.body.returnedCents === 45000 && r.body.dueCents === 90000, 'the dress comes back: 450 MAD less to receive, 900 still due');
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM sales WHERE merchant = ? AND id LIKE 'dlv-%'").get(MERCHANT).n === 0, 'a return writes no sale: nothing was ever counted in revenue');
r = await post({ saleId: 'r-part', action: 'return', id: 'ret-part-1', lines: [{ i: 0, q: 1 }], returnedBy: mgr });
ok(r.status === 200 && r.body.already === true && r.body.returnedCents === 45000, 'replaying the same return counts once (the till restocks only when already is false)');
r = await post({ saleId: 'r-part', action: 'return', id: 'ret-part-2', lines: [{ i: 0, q: 1 }] });
ok(r.status === 409 && r.body.error === 'exceeds-line', 'the same dress cannot come back twice');
r = await post({ saleId: 'r-part', action: 'return', id: 'ret-part-3', lines: [{ i: 7, q: 1 }] });
ok(r.status === 400, 'a line that is not in the basket is refused');
r = await post({ saleId: 'r-part', action: 'return', id: 'x', lines: [{ i: 1, q: 1 }] });
ok(r.status === 400 && r.body.error === 'bad-id', 'a return needs a proper id');
r = await post({ saleId: 'r-part', action: 'return', id: 'ret-part-4', lines: [{ i: 1, q: 1 }] }, otherOwner);
ok(r.status === 403, 'another merchant cannot record a return here');

console.log('■ Retours · commande complète');
r = await post({ saleId: 'r-full', action: 'return', id: 'ret-full-1', all: true, returnedBy: mgr });
ok(r.status === 200 && r.body.returnedCents === 135000 && r.body.dueCents === 0 && r.body.lines.length === 3, 'the whole order comes back: nothing left to receive');
r = await post({ saleId: 'r-full', action: 'return', id: 'ret-full-2', all: true });
ok(r.status === 409 && r.body.error === 'nothing-due', 'a fully returned order cannot be returned again');
r = await post({ saleId: 'r-full', method: 'transfer' }, owner);
ok(r.status === 409 && r.body.error === 'nothing-due', 'a fully returned order cannot be collected');

console.log('■ Lecture · listes et confirmation automatique');
r = await get(till, '&lines=1');
ok(r.status === 200 && r.body.confirmDays === 15, 'the list says the delay is 15 days');
const open = Object.fromEntries(r.body.open.map((d) => [d.saleId, d]));
ok(open['r-part'] && open['r-part'].dueCents === 90000 && open['r-part'].returnedCents === 45000, 'a partly returned order stays open for what is still out');
ok(open['r-part'].lines[0].returnedQty === 1 && open['r-part'].lines[1].returnedQty === 0, 'its lines say what already came back');
ok(open['r-young'] && !r.body.collected.some((d) => d.saleId === 'r-young'), 'an order younger than 15 days is not confirmed');
ok(open['r-backlog'] && open['r-backlog'].dueCents === 40000, 'an order sold before the launch cutoff stays to receive: history is never confirmed in bulk');
ok(r.body.returned.some((d) => d.saleId === 'r-full'), 'the fully returned order is listed as returned, not collected');
const col = Object.fromEntries(r.body.collected.map((d) => [d.saleId, d]));
ok(col['r-old'] && col['r-old'].collected.auto === true && col['r-old'].collected.amountCents === 135000, 'an order older than 15 days with no return is confirmed automatically for its whole amount');
ok(col['r-oldpart'] && col['r-oldpart'].collected.amountCents === 100000, 'a partly returned old order is confirmed only for what was kept (1000 MAD)');
const autoSale = sqlite.prepare('SELECT amount_cents, method, ts, lines FROM sales WHERE id = ?').get('dlv-auto-r-old');
const oldTs = sqlite.prepare('SELECT ts FROM sales WHERE id = ?').get('r-old').ts;
ok(autoSale && autoSale.amount_cents === 135000 && autoSale.method === 'transfer', 'the confirmation is ONE ordinary sale: revenue enters then, never before');
ok(autoSale.ts === oldTs + CONFIRM_DAYS * DAY, 'it is dated the fifteenth day, whenever the list was read');
const kept = JSON.parse(sqlite.prepare('SELECT lines FROM sales WHERE id = ?').get('dlv-auto-r-oldpart').lines);
ok(kept.find((l) => l.n === 'Cape TU').q === 1 && kept.find((l) => l.n === 'Cape TU').t === 350, 'its basket leaves out the cape that came back');
r = await get(owner);
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM sales WHERE id LIKE 'dlv-auto-%'").get().n === 2, 'reading again confirms nothing twice');
ok(!('lines' in r.body.open[0]) || r.body.open[0].lines === undefined, 'the dashboard list stays light: no basket unless asked');
r = await post({ saleId: 'r-old', action: 'return', id: 'ret-old-late', all: true });
ok(r.status === 409, 'a confirmed order is no longer a pending return (a late return is a refund)');

console.log(`\n${controls} controls · delivery returns and 15-day confirmation hold.`);
