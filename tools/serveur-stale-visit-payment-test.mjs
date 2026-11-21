#!/usr/bin/env node
/* Une table soldée à la caisse ne s'encaisse pas une seconde fois depuis un
 * téléphone resté sur l'ancienne image (functions/api/_visit-cover.js ›
 * staleVisitPayment, appelé par /api/sale).
 *
 *   node tools/serveur-stale-visit-payment-test.mjs
 *
 * Le défaut, « connu » de tools/shared-table-two-devices-browser-test.mjs :
 * la caisse encaisse 52,00 et clôt la visite ; le téléphone du serveur, qui
 * n'a pas encore relu, touche « Encaisser » avec son propre identifiant de
 * vente. La visite étant close, aucun contrôle ne tournait : 52,00 + 52,00.
 * Ici, contre la vraie route et une base bâtie depuis schema.sql :
 *   · téléphone, visite close, tickets tous payés ⇒ 409, aucune ligne de vente ;
 *   · le même téléphone qui REJOUE une vente déjà écrite ⇒ accepté, une ligne ;
 *   · téléphone, visite close mais un ticket encore dû ⇒ pas refusé ici ;
 *   · la caisse appairée, visite close ⇒ sa règle reste (elle écrit sa vente) ;
 *   · une autre boutique ne voit rien de la visite (409 jamais par erreur) ;
 *   · table rouverte sous une autre visite (alias compris) ⇒ 409 qui la nomme, rien sur l'ancienne. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { employeeToken, employeeCookie, tillToken, TILL_COOKIE, makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as sale } from '../functions/api/sale.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = await fixture(root);
const { sql, env, merchant } = f;
const now = Date.now();
sql.prepare("UPDATE merchant_config SET type='restaurant' WHERE merchant=?").run(merchant);
const doc = (feature, data) => sql.prepare('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
  .run(merchant, feature, JSON.stringify(data), now);
doc('team', { members: [{ id: 'w1', firstName: 'Salma', lastName: 'Test', function: 'serveur', department: 'salle' }] });
doc('attendance', { entries: [{ id: 'att-1', staffId: 'w1', memberId: 'w1', name: 'Salma Test', role: 'serveur', inTs: now - 3600e3, outTs: 0 }] });
const waiter = employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant, staffId: 'w1', authVersion: 0 })).split(';')[0];
const till = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
const owner = `${SESS_COOKIE}=${await makeSession('money-owner', env.AUTH_SECRET)}`;

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
async function pay(cookie, body) {
  const request = new Request('https://kiwi-os.com/api/sale', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://kiwi-os.com' },
    body: JSON.stringify({ merchant, method: 'cash', ts: Date.now(), lines: [{ name: 'Msemen', qty: 2, total: 28 }], ...body }),
  });
  const res = await sale({ request, env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
}
function visit(id, table, { closed = true, paid = [true] } = {}) {
  sql.prepare("INSERT INTO table_sessions (id, merchant, mode, table_no, status, closed_by, opened_ts, seen_ts, closed_ts) VALUES (?, ?, 'table', ?, ?, ?, ?, ?, ?)")
    .run(id, merchant, table, closed ? 'closed' : 'open', closed ? 'settle' : '', now - 1800e3, now - 60e3, closed ? now - 30e3 : null);
  paid.forEach((isPaid, i) => sql.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, session_id, paid_ts) VALUES (?, ?, ?, 'table', ?, 28, ?, 'served', ?, ?, ?, ?)")
    .run(`${id}-o${i}`, merchant, 100 + i, table, JSON.stringify([{ id: 'it_msemen', name: 'Msemen', qty: 2, unitPrice: 14 }]), now - 1700e3, now - 60e3, id, isPaid ? now - 30e3 : null));
}
const salesOn = (session) => sql.prepare('SELECT id FROM sales WHERE merchant = ? AND session_id = ? AND void_ts IS NULL').all(merchant, session).length;
const salesById = (id) => sql.prepare('SELECT id FROM sales WHERE merchant = ? AND id = ?').all(merchant, id).length;

/* 1 · la caisse a soldé la table 4 ; le téléphone tente d'encaisser 28,00. */
visit('tsx-settled-at-till-0001', '4');
sql.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, session_id) VALUES ('till-sale-1', ?, 28, 2800, 'cash', 'T4', 'T4', ?, '[]', 'table', 'tsx-settled-at-till-0001')").run(merchant, now - 30e3);
let r = await pay(waiter, { id: 'emp-pay-stale-1', table: '4', session: 'tsx-settled-at-till-0001', amount: 28, amountCents: 2800, ref: 'ST-100', label: 'ST-100' });
check(r.status === 409 && r.body.error === 'visit-already-settled', `téléphone, visite déjà soldée : refusé 409 visit-already-settled (${r.status} ${r.body.error || ''})`);
check(salesById('emp-pay-stale-1') === 0 && salesOn('tsx-settled-at-till-0001') === 1, 'aucune seconde vente : la visite garde la seule vente de la caisse');

/* 2 · un rejeu de la vente du téléphone déjà écrite reste accepté. */
visit('tsx-paid-by-phone-00002', '5', { closed: false, paid: [false] });
r = await pay(waiter, { id: 'emp-pay-own-2', table: '5', session: 'tsx-paid-by-phone-00002', amount: 28, amountCents: 2800, ref: 'ST-101', label: 'ST-101' });
check(r.status === 200 && r.body.ok, `le téléphone encaisse sa table ouverte (${r.status})`);
const closedNow = sql.prepare('SELECT status FROM table_sessions WHERE id = ?').get('tsx-paid-by-phone-00002');
check(closedNow && closedNow.status === 'closed', 'sa vente clôt la visite et solde les tickets');
r = await pay(waiter, { id: 'emp-pay-own-2', table: '5', session: 'tsx-paid-by-phone-00002', amount: 28, amountCents: 2800, ref: 'ST-101', label: 'ST-101' });
check(r.status === 200 && r.body.ok && salesById('emp-pay-own-2') === 1, `la réponse perdue rejouée avec le même identifiant est acceptée, une seule ligne (${r.status})`);

/* 3 · visite close, mais un ticket encore dû : ce n'est pas « déjà réglée ». */
visit('tsx-closed-still-owed-03', '6', { paid: [true, false] });
r = await pay(waiter, { id: 'emp-pay-owed-3', table: '6', session: 'tsx-closed-still-owed-03', amount: 28, amountCents: 2800, ref: 'ST-102', label: 'ST-102' });
check(!(r.status === 409 && r.body.error === 'visit-already-settled'), `visite close avec un ticket dû : pas refusée comme « déjà réglée » (${r.status} ${r.body.error || ''})`);

/* 4 · la caisse garde sa règle : sa vente écrite après sa propre clôture passe. */
visit('tsx-till-closed-first-04', '7');
r = await pay(till, { id: 'till-pay-4', table: '7', session: 'tsx-till-closed-first-04', amount: 28, amountCents: 2800, ref: 'T7', label: 'T7' });
check(r.status === 200 && r.body.ok && salesById('till-pay-4') === 1, `la caisse écrit la vente d'une visite qu'elle vient de clore (${r.status})`);

/* 5 · une visite d'une autre boutique n'est jamais lue d'ici. */
sql.prepare("INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts, closed_ts) VALUES ('tsx-other-shop-000005', 'server-other-shop', 'table', '8', 'closed', ?, ?, ?)").run(now - 1800e3, now, now);
sql.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, session_id, paid_ts) VALUES ('other-o', 'server-other-shop', 1, 'table', '8', 28, '[]', 'served', ?, ?, 'tsx-other-shop-000005', ?)").run(now, now, now);
r = await pay(waiter, { id: 'emp-pay-other-5', table: '8', session: 'tsx-other-shop-000005', amount: 28, amountCents: 2800, ref: 'ST-103', label: 'ST-103' });
check(!(r.status === 409 && r.body.error === 'visit-already-settled'), `la visite d'une autre boutique ne décide rien ici (${r.status} ${r.body.error || ''})`);

/* 6 · le patron sert lui-même avec l'app serveur (pas de fiche employé) : même garde. */
visit('tsx-owner-on-the-app-06', '9');
r = await pay(owner, { id: 'own-pay-stale-6', table: '9', session: 'tsx-owner-on-the-app-06', surface: 'serveur', amount: 28, amountCents: 2800, ref: 'ST-104', label: 'ST-104' });
check(r.status === 409 && r.body.error === 'visit-already-settled' && salesById('own-pay-stale-6') === 0, `patron sur l'app serveur, visite déjà soldée : refusé (${r.status} ${r.body.error || ''})`);

/* 7 · le même patron à la caisse (sans « surface ») garde la règle de la caisse. */
visit('tsx-owner-at-the-till-07', '10');
r = await pay(owner, { id: 'own-till-pay-7', table: '10', session: 'tsx-owner-at-the-till-07', amount: 28, amountCents: 2800, ref: 'T10', label: 'T10' });
check(r.status === 200 && r.body.ok && salesById('own-till-pay-7') === 1, `patron à la caisse : la vente d'une visite qu'il vient de clore passe (${r.status} ${r.body.error || ''})`);

/* 8 · la table a déjà une nouvelle visite ouverte, le téléphone envoie encore l'identifiant de la
 * visite soldée. Revue de sécurité : accepter ici écrivait la vente sur la visite soldée (un second
 * encaissement « à travers » elle, rangé sur la mauvaise visite). Refusé, et le refus nomme la
 * visite ouverte ; la relance contre elle, même identifiant de vente, passe une fois. */
visit('tsx-previous-settled-08', '11');
visit('tsx-new-visit-open-0008', '11', { closed: false, paid: [false] });
const before8 = salesOn('tsx-previous-settled-08');
r = await pay(waiter, { id: 'emp-pay-new-8', table: '11', session: 'tsx-previous-settled-08', amount: 28, amountCents: 2800, ref: 'ST-105', label: 'ST-105' });
check(r.status === 409 && r.body.error === 'visit-already-settled' && r.body.reopened === true && r.body.openSession === 'tsx-new-visit-open-0008', `nouvelle visite ouverte : refusé, et le refus nomme la visite ouverte (${r.status} ${r.body.error || ''} ${r.body.openSession || ''})`);
check(salesById('emp-pay-new-8') === 0 && salesOn('tsx-previous-settled-08') === before8, "rien n'est écrit, et surtout pas sur la visite soldée");
r = await pay(waiter, { id: 'emp-pay-new-8', table: '11', session: 'tsx-new-visit-open-0008', amount: 28, amountCents: 2800, ref: 'ST-105', label: 'ST-105' });
check(r.status === 200 && r.body.ok && salesOn('tsx-new-visit-open-0008') === 1 && salesOn('tsx-previous-settled-08') === before8, `relu, le téléphone relance contre la visite ouverte : une vente, sur elle (${r.status} ${r.body.error || ''})`);
r = await pay(waiter, { id: 'emp-pay-new-8', table: '11', session: 'tsx-new-visit-open-0008', amount: 28, amountCents: 2800, ref: 'ST-105', label: 'ST-105' });
check(r.status === 200 && r.body.ok && salesById('emp-pay-new-8') === 1, `le rejeu du même identifiant reste accepté, une seule ligne (${r.status})`);
r = await pay(waiter, { id: 'emp-pay-new-8', table: '11', session: 'tsx-previous-settled-08', amount: 28, amountCents: 2800, ref: 'ST-105', label: 'ST-105' });
check(r.status === 200 && r.body.ok && salesById('emp-pay-new-8') === 1 && salesOn('tsx-previous-settled-08') === before8, `même rejoué avec l'ancienne visite, la vente déjà écrite répond 200 sans seconde ligne (${r.status})`);

/* 9 · la nouvelle visite est rangée sous un alias (« T12 ») et le téléphone dit « 12 » : même refus. */
visit('tsx-alias-settled-00009', 'T12');
visit('tsx-alias-reopened-0009', 'T12', { closed: false, paid: [false] });
r = await pay(waiter, { id: 'emp-pay-alias-9', table: '12', session: 'tsx-alias-settled-00009', amount: 28, amountCents: 2800, ref: 'ST-106', label: 'ST-106' });
check(r.status === 409 && r.body.reopened === true && r.body.openSession === 'tsx-alias-reopened-0009' && salesById('emp-pay-alias-9') === 0, `alias « 12 » / « T12 » : la visite rouverte est trouvée, rien n'est écrit (${r.status} ${r.body.openSession || ''})`);

/* 10 · soldée sans nouvelle visite : le refus ne prétend pas qu'il y en a une. */
check(salesById('emp-pay-stale-1') === 0, 'rappel : la table 4 soldée sans nouvelle visite a été refusée plus haut');
r = await pay(waiter, { id: 'emp-pay-stale-10', table: '4', session: 'tsx-settled-at-till-0001', amount: 28, amountCents: 2800, ref: 'ST-107', label: 'ST-107' });
check(r.status === 409 && !r.body.reopened && !r.body.openSession, `sans nouvelle visite, le refus ne nomme aucune visite ouverte (${r.status})`);

f.close();
console.log(`serveur-stale-visit-payment-test: ${checks} checks passed`);
