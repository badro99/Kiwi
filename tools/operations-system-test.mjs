#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { onRequestGet, onRequestPost } from '../functions/api/operations.js';
import { makeSession, tillToken, employeeToken, slugMerchant } from '../functions/auth/_lib.js';

const browserSource = fs.readFileSync(new URL('../assets/operations.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../assets/operations-ui.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../functions/api/operations.js', import.meta.url), 'utf8');
const teamSource = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const agentSource = fs.readFileSync(new URL('../assets/agent.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');
const pages = ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html']
  .map((name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));

let n = 0;
function ok(condition, label) { assert.ok(condition, label); n++; console.log('  ✓ ' + label); }

/* ── Server: real requests against the real Worker ────────────────────────────
 *
 * `node:sqlite` is a Node built-in, so the gate stays dependency-free while the
 * commands run against actual SQL — including the UNIQUE idempotency index, which
 * is what makes the duplicate and race paths testable at all.  These assertions
 * replace three earlier greps of this file's source: two of them pinned a helper
 * name that no longer exists, and the third asserted that a string was ABSENT,
 * which passes for a file that does nothing.  A permission boundary has to be
 * exercised, not spelled. */

const D1 = (db) => ({
  prepare(sql) {
    const params = [];
    const stmt = {
      bind(...args) { params.push(...args); return stmt; },
      async run() { db.prepare(sql).run(...params); return { success: true }; },
      async first() { const row = db.prepare(sql).get(...params); return row === undefined ? null : row; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
    };
    return stmt;
  },
});

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE accounts (id TEXT PRIMARY KEY, business TEXT);
  CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, account_id TEXT, status TEXT);
  CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, updated_ts INTEGER);
  CREATE TABLE operators (id TEXT PRIMARY KEY);
`);

const SECRET = 'operations-suite-secret';
const BUSINESS = 'Amira Café';
const MERCHANT = slugMerchant(BUSINESS);
const OTHER = 'someone-elses-shop';

db.prepare('INSERT INTO accounts (id, business) VALUES (?, ?)').run('acc-owner', BUSINESS);
db.prepare('INSERT INTO merchant_config (merchant, account_id, status) VALUES (?, ?, ?)').run(MERCHANT, 'acc-owner', 'active');
db.prepare('INSERT INTO merchant_config (merchant, account_id, status) VALUES (?, ?, ?)').run(OTHER, 'acc-stranger', 'active');
db.prepare('INSERT INTO store_docs (merchant, feature, data, updated_ts) VALUES (?, ?, ?, ?)')
  .run(MERCHANT, 'team', JSON.stringify({ members: [
    { id: 'emp-1', name: 'Salma', function: 'Caissière' },
    /* Une responsable de salle : elle porte `action:refund` sans porter
       `write:payment`, ce qui est exactement la frontière que les liens de
       paiement doivent respecter. */
    { id: 'emp-2', name: 'Nadia', function: 'Manager' },
  ] }), 2);

const env = { DB: D1(db), AUTH_SECRET: SECRET };

/* No provider webhook is configured on purpose: `postWebhook` short-circuits
   before any network call, so the "blocked, not sent" claim is proved offline. */
const ownerCookie = `kiwi_sess=${await makeSession('acc-owner', SECRET)}`;
const tillCookie = `kiwi_till=${await tillToken(SECRET, MERCHANT)}`;
const staffCookie = `kiwi_employee=${await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'emp-1' })}`;
const managerCookie = `kiwi_employee=${await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'emp-2' })}`;

function request(cookie, { method = 'GET', query = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://kiwi.test/api/operations' + query, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function post(cookie, body, useEnv = env) {
  const response = await onRequestPost({ request: request(cookie, { method: 'POST', body }), env: useEnv });
  return { status: response.status, data: await response.json() };
}
async function get(cookie, query = '', useEnv = env) {
  const response = await onRequestGet({ request: request(cookie, { query }), env: useEnv });
  return { status: response.status, data: await response.json() };
}
const command = (extra) => Object.assign({ merchant: MERCHANT, payload: {} }, extra);

const anonymous = await post('', command({ id: 'op:anon-0001', idempotencyKey: 'op:anon-0001', domain: 'device', action: 'heartbeat' }));
ok(anonymous.status === 401 && anonymous.data.error === 'unauthorized', 'an unsigned caller cannot write a command');

const beat = await post(tillCookie, command({ id: 'op:till-beat-01', idempotencyKey: 'op:till-beat-01', domain: 'device', action: 'heartbeat', payload: { app: 'caisse', deviceId: 'dev-till-01', label: 'Caisse comptoir', printerConfigured: true, printerConnected: true } }));
ok(beat.status === 200 && beat.data.command.status === 'completed' && beat.data.command.provider === 'kiwi-device', 'a paired till records its own heartbeat');

const beatAnon = await post(tillCookie, command({ id: 'op:till-beat-02', idempotencyKey: 'op:till-beat-02', domain: 'device', action: 'heartbeat', payload: { app: 'caisse' } }));
ok(beatAnon.status === 200 && beatAnon.data.command.status === 'failed' && beatAnon.data.command.lastError === 'device-id-required', 'a heartbeat without a device identity is refused, not merged into one anonymous row');

const tillPo = await post(tillCookie, command({ id: 'op:till-po-0001', idempotencyKey: 'op:till-po-0001', domain: 'procurement', action: 'create-po' }));
ok(tillPo.status === 403 && tillPo.data.error === 'permission-denied', 'a pairing cookie cannot open a purchase order');

const tillMessage = await post(tillCookie, command({ id: 'op:till-msg-0001', idempotencyKey: 'op:till-msg-0001', domain: 'notification', action: 'send-whatsapp', payload: { to: '+212600000000' } }));
ok(tillMessage.status === 403 && tillMessage.data.error === 'permission-denied', 'a pairing cookie cannot message arbitrary contacts');

const tillHistory = await get(tillCookie, '?merchant=' + MERCHANT);
ok(tillHistory.status === 403 && tillHistory.data.error === 'owner-session-required', 'a paired till cannot enumerate the operational ledger');

/* A signed-in cashier at a paired register: `resolveTenant` has no employee
   branch, so the roster role is reachable only alongside the till pairing —
   which is exactly the real deployment shape. */
const staffAtTill = staffCookie + '; ' + tillCookie;
const staffReprint = await post(staffAtTill, command({ id: 'op:emp-print-01', idempotencyKey: 'op:emp-print-01', domain: 'ai', action: 'reprint', payload: { orderId: '260812-0001-UE' } }));
ok(staffReprint.status === 409 && staffReprint.data.error === 'confirmation-required', 'a cashier holds action:reprint but still must confirm it');

/* Le domaine `ai` avait un jeu d'actions et pas de moteur : n'importe quelle
   demande restait « pending-approval » pour toujours, ce que l'ancienne
   assertion prenait pour de la prudence. Maintenant qu'un moteur existe, une
   action dictée sans la phrase qui l'a dictée est refusée : un ordre venu de
   l'assistant doit pouvoir répondre à « pourquoi ceci s'est-il produit ». */
const staffReprintOk = await post(staffAtTill, command({ id: 'op:emp-print-01', idempotencyKey: 'op:emp-print-01', domain: 'ai', action: 'reprint', confirmed: true, payload: { orderId: '260812-0001-UE' } }));
ok(staffReprintOk.status === 200 && staffReprintOk.data.command.status === 'failed' && staffReprintOk.data.command.lastError === 'intent-required', 'an assistant action with no recorded sentence is refused, not staged forever');

const staffMessage = await post(staffAtTill, command({ id: 'op:emp-msg-0001', idempotencyKey: 'op:emp-msg-0001', domain: 'notification', action: 'send-whatsapp', confirmed: true, payload: { to: '+212600000000' } }));
ok(staffMessage.status === 403 && staffMessage.data.error === 'permission-denied', 'the roster role, not the pairing, decides what a cashier may do');

const staffHistory = await get(staffAtTill, '?merchant=' + MERCHANT);
ok(staffHistory.status === 403 && staffHistory.data.error === 'owner-session-required', 'an employee cannot read payroll metadata out of the ledger');

const SOFRAP = { supplier: 'Sofrap', expectedDate: '2026-08-20', lines: [{ sku: 'FARINE-25', label: 'Farine T55 25 kg', unit: 'sac', qty: 4, unitPrice: 210 }] };
const ownerPo = await post(ownerCookie, command({ id: 'op:owner-po-001', idempotencyKey: 'op:owner-po-001', domain: 'procurement', action: 'create-po', payload: SOFRAP }));
ok(ownerPo.status === 200 && ownerPo.data.duplicate === false && ownerPo.data.command.status === 'draft', 'the owner opens a purchase order');

const replay = await post(ownerCookie, command({ id: 'op:owner-po-002', idempotencyKey: 'op:owner-po-001', domain: 'procurement', action: 'create-po', payload: SOFRAP }));
ok(replay.status === 200 && replay.data.duplicate === true && replay.data.command.id === 'op:owner-po-001', 'a replayed idempotency key returns the original command, not a second one');

const badAction = await post(ownerCookie, command({ id: 'op:owner-bad-01', idempotencyKey: 'op:owner-bad-01', domain: 'device', action: 'wipe-terminal' }));
ok(badAction.status === 400 && badAction.data.error === 'unsupported-action', 'an unlisted action is refused before anything is written');

const crossTenant = await post(ownerCookie, command({ merchant: OTHER, id: 'op:cross-po-001', idempotencyKey: 'op:cross-po-001', domain: 'procurement', action: 'create-po' }));
ok(crossTenant.status === 401 && crossTenant.data.error === 'unauthorized', 'an owner cannot write into a store they do not own');

const blockedLink = await post(ownerCookie, command({ id: 'op:owner-pay-001', idempotencyKey: 'op:owner-pay-001', domain: 'payment', action: 'create-link', payload: { amount: 214, currency: 'MAD' } }));
ok(blockedLink.status === 200 && blockedLink.data.command.status === 'blocked' && blockedLink.data.command.lastError === 'provider-unconfigured', 'an unconfigured payment provider blocks the command instead of faking a link');
ok(blockedLink.data.providers.payment === false && !blockedLink.data.command.result?.url, 'the response admits the provider is absent and invents no URL');

let webhookReply = { url: 'http://pay.example/insecure', reference: 'REF-BAD' };
const provider = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(webhookReply)); });
});
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
const payEnv = Object.assign({}, env, { PAYMENT_LINK_WEBHOOK: `http://127.0.0.1:${provider.address().port}/pay` });

const insecureLink = await post(ownerCookie, command({ id: 'op:owner-pay-002', idempotencyKey: 'op:owner-pay-002', domain: 'payment', action: 'create-link', payload: { amount: 214 } }), payEnv);
ok(insecureLink.data.command.status === 'failed' && insecureLink.data.command.lastError === 'provider-returned-no-link', 'a provider answering with a non-HTTPS link fails the command');

webhookReply = { url: 'https://pay.example/abc', reference: 'REF-OK' };
const liveLink = await post(ownerCookie, command({ id: 'op:owner-pay-003', idempotencyKey: 'op:owner-pay-003', domain: 'payment', action: 'create-link', payload: { amount: 214, currency: 'MAD' } }), payEnv);
ok(liveLink.data.command.status === 'active' && liveLink.data.command.result.url === 'https://pay.example/abc', 'a provider-confirmed HTTPS link reaches active state');

const badAmount = await post(ownerCookie, command({ id: 'op:owner-pay-004', idempotencyKey: 'op:owner-pay-004', domain: 'payment', action: 'create-link', payload: { amount: -5 } }), payEnv);
ok(badAmount.data.command.status === 'failed' && badAmount.data.command.lastError === 'invalid-amount', 'a negative amount never reaches the provider');

/* ── Le lien de paiement, de l'encaissement au remboursement ──────────────────
 *
 * `create-link` était la seule des quatre actions réellement branchée : annuler
 * et rembourser n'existaient que dans la liste blanche, retombaient sur la
 * branche par défaut d'execute() et répondaient `draft` + {persisted:true} sans
 * appeler personne.  Ce bloc conduit PAY-000001 — le lien que `liveLink` vient
 * d'ouvrir — jusqu'au remboursement intégral, et vérifie que le plafond tient. */
const payCmd = (id, action, payload) => command({
  id, idempotencyKey: id, domain: 'payment', action, confirmed: true, payload,
});

const unknownRef = await post(ownerCookie, payCmd('op:owner-pay-005', 'cancel-link', { reference: 'PAY-999999' }), payEnv);
ok(unknownRef.data.command.status === 'failed' && unknownRef.data.command.lastError === 'link-not-found', 'a reference the merchant never issued cannot be cancelled');

const earlyRefund = await post(ownerCookie, payCmd('op:owner-pay-006', 'refund-link', { reference: 'PAY-000001', amount: 50 }), payEnv);
ok(earlyRefund.data.command.status === 'failed' && earlyRefund.data.command.lastError === 'link-not-paid', 'a link nobody has paid cannot be refunded');

/* Le fournisseur annonce 300 MAD sur un lien de 214 : on encaisse 214. */
webhookReply = { status: 'paid', paidAmount: 300 };
const paySettled = await post(ownerCookie, payCmd('op:owner-pay-007', 'settle-link', { reference: 'PAY-000001' }), payEnv);
ok(paySettled.data.command.status === 'completed' && paySettled.data.command.result.status === 'paid'
  && paySettled.data.command.result.paidCents === 21400, 'a talkative provider cannot bank more than the link asked for');

const cancelPaid = await post(ownerCookie, payCmd('op:owner-pay-008', 'cancel-link', { reference: 'PAY-000001' }), payEnv);
ok(cancelPaid.data.command.status === 'failed' && cancelPaid.data.command.lastError === 'link-already-paid', 'a paid link is refunded, never cancelled');

webhookReply = { reference: 'REF-REFUND-1' };
const partRefund = await post(ownerCookie, payCmd('op:owner-pay-009', 'refund-link', { reference: 'PAY-000001', amount: 100, reason: 'Article manquant' }), payEnv);
ok(partRefund.data.command.status === 'completed' && partRefund.data.command.result.number === 'PAY-000001/R1'
  && partRefund.data.command.result.refundedCents === 10000 && partRefund.data.command.result.status === 'partially-refunded',
  'a partial refund is numbered against its link and moves it out of `paid`');

const overRefund = await post(ownerCookie, payCmd('op:owner-pay-010', 'refund-link', { reference: 'PAY-000001', amount: 150 }), payEnv);
ok(overRefund.data.command.status === 'failed' && overRefund.data.command.lastError === 'refund-exceeds-paid', 'the remboursé is a sum, not a counter: 100 + 150 cannot come out of 214');

/* Une responsable de salle rembourse — c'est `action:refund` — mais n'émet pas
   de lien, qui coûte `write:payment` et n'appartient qu'au propriétaire. */
const managerAtTill = managerCookie + '; ' + tillCookie;
const managerRefund = await post(managerAtTill, payCmd('op:mgr-pay-001', 'refund-link', { reference: 'PAY-000001', amount: 114 }), payEnv);
ok(managerRefund.status === 200 && managerRefund.data.command.result.number === 'PAY-000001/R2'
  && managerRefund.data.command.result.status === 'refunded' && managerRefund.data.command.result.refundableCents === 0,
  'a manager may hand money back, and the second line closes the link');

const managerIssues = await post(managerAtTill, command({ id: 'op:mgr-pay-002', idempotencyKey: 'op:mgr-pay-002', domain: 'payment', action: 'create-link', payload: { amount: 40 } }), payEnv);
ok(managerIssues.status === 403 && managerIssues.data.error === 'permission-denied', 'refunding is not issuing: a manager cannot open a payment link');

const tillRefund = await post(tillCookie, payCmd('op:till-pay-001', 'refund-link', { reference: 'PAY-000001', amount: 10 }), payEnv);
ok(tillRefund.status === 403 && tillRefund.data.error === 'permission-denied', 'a pairing cookie cannot refund anything');

webhookReply = { url: 'https://pay.example/def', reference: 'REF-OK-2' };
const second = await post(ownerCookie, command({ id: 'op:owner-pay-011', idempotencyKey: 'op:owner-pay-011', domain: 'payment', action: 'create-link', payload: { amount: 60 } }), payEnv);
ok(second.data.command.result.reference === 'PAY-000002', 'the merchant’s own numbering continues, whatever the provider calls it');

webhookReply = { accepted: true };
const cancelled = await post(ownerCookie, payCmd('op:owner-pay-012', 'cancel-link', { reference: 'PAY-000002' }), payEnv);
ok(cancelled.data.command.status === 'completed' && cancelled.data.command.result.status === 'cancelled'
  && cancelled.data.command.result.alreadyCancelled === false, 'an unpaid link is cancelled at the provider and in the book');

const cancelAgain = await post(ownerCookie, payCmd('op:owner-pay-013', 'cancel-link', { reference: 'PAY-000002' }), payEnv);
ok(cancelAgain.data.command.status === 'completed' && cancelAgain.data.command.result.alreadyCancelled === true,
  'replaying a cancellation succeeds and admits it had nothing left to do');

const payView = await get(ownerCookie, '?merchant=' + MERCHANT + '&view=payments');
const linkBook = new Map((payView.data.links || []).map((l) => [l.reference, l]));
ok(payView.status === 200 && payView.data.links.length === 2 && payView.data.links[0].reference === 'PAY-000002', 'the payments book reads back newest first');
ok(linkBook.get('PAY-000001').status === 'refunded' && linkBook.get('PAY-000001').refundedCents === 21400
  && linkBook.get('PAY-000001').refunds === 2, 'the book recomputes the remboursé from the refund lines themselves');

const tillPayView = await get(tillCookie, '?merchant=' + MERCHANT + '&view=payments');
ok(tillPayView.status === 403, 'a paired till cannot read the merchant’s payment book');

provider.close();

/* Parc d'appareils.  Un battement est un fait daté : le serveur le range,
   en tire une alarme, et cette alarme ne se calme que si quelqu'un la tait
   ou si l'appareil guérit. */
const fleetOf = async (cookie, merchant) => {
  const view = await get(cookie, '?merchant=' + (merchant || MERCHANT) + '&view=devices');
  return { status: view.status, data: view.data, byId: new Map(((view.data && view.data.devices) || []).map((d) => [d.deviceId, d])) };
};

const fleetFirst = await fleetOf(ownerCookie);
ok(fleetFirst.status === 200 && fleetFirst.byId.get('dev-till-01') && fleetFirst.byId.get('dev-till-01').alert === ''
  && fleetFirst.byId.get('dev-till-01').label === 'Caisse comptoir' && fleetFirst.data.thresholds.beatMs === 300000,
  'the fleet reads back the till that beat, healthy, with the thresholds it is judged against');

const beatTwice = await post(tillCookie, command({ id: 'op:till-beat-03', idempotencyKey: 'op:till-beat-03', domain: 'device', action: 'heartbeat', payload: { app: 'caisse', deviceId: 'dev-till-01', printerConfigured: true, printerConnected: true } }));
ok(beatTwice.data.command.status === 'completed', 'a second beat from the same device updates the row it already owns');
const fleetTwice = await fleetOf(ownerCookie);
ok(fleetTwice.data.devices.length === 1 && fleetTwice.byId.get('dev-till-01').beats === 2,
  'the parc counts beats on one row per device — it does not grow a row per heartbeat');

const noPrinter = await post(ownerCookie, command({ id: 'op:dev-noprint-01', idempotencyKey: 'op:dev-noprint-01', domain: 'device', action: 'heartbeat', payload: { app: 'caisse', deviceId: 'dev-caisse-02', label: 'Caisse terrasse' } }));
ok(noPrinter.data.command.status === 'completed' && noPrinter.data.command.result.alert === 'printer-unconfigured',
  'a till that has never been given a printer is an alarm, not a silence');

const unreachable = await post(ownerCookie, command({ id: 'op:dev-unreach-01', idempotencyKey: 'op:dev-unreach-01', domain: 'device', action: 'heartbeat', payload: { app: 'caisse', deviceId: 'dev-caisse-03', printerConfigured: true, printerConnected: false } }));
ok(unreachable.data.command.result.alert === 'printer-unreachable', 'a configured printer that answers nobody raises its own alarm');

/* Un battement daté d'une heure passe le contrôle d'ancienneté (24 h) mais
   dépasse largement les trois battements manqués : l'alarme tombe à l'écriture,
   sans horloge truquée. */
const aged = await post(ownerCookie, command({ id: 'op:dev-old-01', idempotencyKey: 'op:dev-old-01', domain: 'device', action: 'heartbeat', payload: { app: 'dashboard', deviceId: 'dev-old-01', label: 'Tablette salle', at: Date.now() - 3600000 } }));
ok(aged.data.command.status === 'completed' && aged.data.command.result.alert === 'device-offline',
  'an appliance whose last word is an hour old is offline, whatever it claims about itself');

const tillAck = await post(tillCookie, command({ id: 'op:till-ack-01', idempotencyKey: 'op:till-ack-01', domain: 'device', action: 'ack-alert', payload: { deviceId: 'dev-old-01' } }));
ok(tillAck.status === 403 && tillAck.data.error === 'permission-denied',
  'a pairing cookie reports its own health but cannot silence the parc');

const mgrAck = await post(managerAtTill, command({ id: 'op:mgr-ack-01', idempotencyKey: 'op:mgr-ack-01', domain: 'device', action: 'ack-alert', payload: { deviceId: 'dev-old-01' } }));
ok(mgrAck.status === 200 && mgrAck.data.command.status === 'completed' && mgrAck.data.command.result.acknowledged === true
  && mgrAck.data.command.result.code === 'device-offline' && mgrAck.data.command.result.ackedBy,
  'a manager acquits the alarm and the acquittal carries a name');

const fleetAcked = await fleetOf(ownerCookie);
ok(fleetAcked.byId.get('dev-old-01').acknowledged === true && fleetAcked.byId.get('dev-old-01').alert === 'device-offline'
  && fleetAcked.byId.get('dev-old-01').silentMs > 0,
  'acquitting silences the alarm without curing it: the device is still offline in the book');
ok(fleetAcked.data.offline === 1 && fleetAcked.data.alerts === 2,
  'the fleet counts what is wrong, not what has been acknowledged away');

const healthyAck = await post(managerAtTill, command({ id: 'op:mgr-ack-02', idempotencyKey: 'op:mgr-ack-02', domain: 'device', action: 'ack-alert', payload: { deviceId: 'dev-till-01' } }));
ok(healthyAck.data.command.status === 'failed' && healthyAck.data.command.lastError === 'no-open-alert',
  'there is nothing to acquit on a device that is well');

const ghostAck = await post(managerAtTill, command({ id: 'op:mgr-ack-03', idempotencyKey: 'op:mgr-ack-03', domain: 'device', action: 'ack-alert', payload: { deviceId: 'dev-never-seen' } }));
ok(ghostAck.data.command.status === 'failed' && ghostAck.data.command.lastError === 'device-unknown',
  'an appliance that never beat cannot have its silence acquitted');

/* L'impression d'essai est exécutée par l'appareil qui la demande : le serveur
   la met en route et attend le verdict du matériel, il ne l'invente pas. */
const testPrint = await post(tillCookie, command({ id: 'op:till-print-01', idempotencyKey: 'op:till-print-01', domain: 'device', action: 'test-print', payload: { deviceId: 'dev-till-01' } }));
ok(testPrint.status === 200 && testPrint.data.command.status === 'processing' && testPrint.data.command.provider === 'local-device'
  && testPrint.data.command.result.instruction === 'execute-on-requesting-device',
  'a test print is handed to the device that asked for it, not declared a success by the server');

const printFailed = await post(tillCookie, { merchant: MERCHANT, commandId: 'op:till-print-01', transition: 'failed', reason: 'printer-timeout' });
ok(printFailed.status === 200 && printFailed.data.command.status === 'failed' && printFailed.data.command.lastError === 'printer-timeout',
  'the device reports its own failure back and the command records it');

const printBlocked = await post(tillCookie, command({ id: 'op:till-print-02', idempotencyKey: 'op:till-print-02', domain: 'device', action: 'test-print', payload: { deviceId: 'dev-till-01', printerConfigured: false } }));
ok(printBlocked.data.command.status === 'blocked' && printBlocked.data.command.lastError === 'printer-unconfigured',
  'a test print with no printer behind it is blocked, never queued into nowhere');

const printNowhere = await post(tillCookie, command({ id: 'op:till-print-03', idempotencyKey: 'op:till-print-03', domain: 'device', action: 'test-print', payload: {} }));
ok(printNowhere.data.command.status === 'failed' && printNowhere.data.command.lastError === 'device-id-required',
  'no device, no print');

const strangeAction = await post(managerAtTill, command({ id: 'op:mgr-dev-99', idempotencyKey: 'op:mgr-dev-99', domain: 'device', action: 'reboot', payload: { deviceId: 'dev-till-01' } }));
ok(strangeAction.status === 400 && strangeAction.data.error === 'unsupported-action',
  'an action the device module does not implement is refused at the door, never written down as a command');

const otherFleet = await fleetOf(ownerCookie, OTHER);
ok(otherFleet.status === 401 || (otherFleet.status === 200 && otherFleet.data.merchant === MERCHANT),
  'a merchant cannot read another merchant’s parc');
const tillFleet = await fleetOf(tillCookie);
ok(tillFleet.status === 403, 'a paired till cannot enumerate the parc it belongs to');

const staged = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'pending-approval' });
ok(staged.status === 200 && staged.data.command.status === 'pending-approval', 'the owner advances a purchase order through its lifecycle');

const tillApproves = await post(tillCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'approved', confirmed: true });
ok(tillApproves.status === 403 && tillApproves.data.error === 'permission-denied', 'a paired till cannot approve a management command');

const unconfirmed = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'approved' });
ok(unconfirmed.status === 409 && unconfirmed.data.error === 'confirmation-required', 'approval is refused without an explicit confirmation');

const illegal = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'completed', confirmed: true });
ok(illegal.status === 409 && illegal.data.error === 'invalid-transition', 'the lifecycle refuses a jump it does not define');

const approved = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'approved', confirmed: true });
ok(approved.status === 200 && approved.data.command.status === 'approved', 'a confirmed approval lands');

const ledger = await get(ownerCookie, '?merchant=' + MERCHANT);
ok(ledger.status === 200 && ledger.data.commands.some((c) => c.id === 'op:owner-po-001' && c.status === 'approved'), 'the owner reads the ledger and sees the current state');
const audit = db.prepare('SELECT event, status FROM operational_events WHERE command_id = ? ORDER BY rowid').all('op:owner-po-001');
ok(audit[0].event === 'created' && audit.map((e) => e.status).join(',') === 'queued,draft,pending-approval,approved', 'every state change leaves an append-only audit row');

/* Un cycle de vie qu'on peut ouvrir mais jamais refermer ne consigne rien.
   Le registre des décisions doit pouvoir mener une commande jusqu'au bout. */
const takenInHand = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'processing' });
ok(takenInHand.status === 200 && takenInHand.data.command.status === 'processing', 'an approved command can be taken in hand');
const closedUnconfirmed = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'completed' });
ok(closedUnconfirmed.status === 409 && closedUnconfirmed.data.error === 'confirmation-required', 'closing a command demands an explicit confirmation too');
const closedByHand = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-001', transition: 'completed', confirmed: true });
ok(closedByHand.status === 200 && closedByHand.data.command.status === 'completed', 'the lifecycle can be closed by a human, not only started');

const noSuchCommand = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-does-not-exist', transition: 'cancelled', confirmed: true });
ok(noSuchCommand.status === 404 && noSuchCommand.data.error === 'not-found', 'a transition on a command that does not exist is a 404, never a silent success');


db.prepare('UPDATE merchant_config SET status = ? WHERE merchant = ?').run('suspended', MERCHANT);
const suspendedWrite = await post(ownerCookie, command({ id: 'op:owner-po-009', idempotencyKey: 'op:owner-po-009', domain: 'procurement', action: 'create-po' }));
ok(suspendedWrite.status === 401 && suspendedWrite.data.error === 'unauthorized', 'a suspended store cannot write new commands');
const suspendedRead = await get(ownerCookie, '?merchant=' + MERCHANT);
ok(suspendedRead.status === 200, 'a suspended store can still be read for support and settlement');
db.prepare('UPDATE merchant_config SET status = ? WHERE merchant = ?').run('active', MERCHANT);

/* ── Comptabilité : les quatre actions qui n'existaient que de nom ──────────── */

const acct = (id, action, payload) => command({ id, idempotencyKey: id, domain: 'accounting', action, payload });

const tillInvoice = await post(tillCookie, acct('op:acct-till-01', 'create-invoice', { date: '2026-08-03', amount: 100 }));
ok(tillInvoice.status === 403 && tillInvoice.data.error === 'permission-denied', 'a paired till cannot write into the books');

const noDate = await post(ownerCookie, acct('op:acct-nodate-1', 'create-invoice', { amount: 100 }));
ok(noDate.data.command.status === 'failed' && noDate.data.command.lastError === 'date-required',
  'an invoice without an explicit date is refused rather than dated by the server clock');

const invoiceOne = await post(ownerCookie, acct('op:acct-inv-0001', 'create-invoice', { date: '2026-08-03', amount: 1200, taxRate: 20, customer: 'Traiteur Zniber' }));
ok(invoiceOne.data.command.status === 'completed' && invoiceOne.data.command.result.number === 'FA-2026-000001',
  'the first invoice of the year is numbered by the server, not the browser');
ok(invoiceOne.data.command.result.taxCents === 20000 && invoiceOne.data.command.result.netCents === 100000,
  'a 1 200 MAD TTC invoice at 20 % splits into 1 000 net and 200 of TVA');

const invoiceTwo = await post(ownerCookie, acct('op:acct-inv-0002', 'create-invoice', { date: '2026-08-04', amount: 60 }));
ok(invoiceTwo.data.command.result.number === 'FA-2026-000002', 'the second invoice takes the next number, with no gap');
ok(invoiceTwo.data.command.result.taxCents === 0 && invoiceTwo.data.command.result.entries === 2,
  'no tax rate means no invented TVA line');

const creditUnconfirmed = await post(ownerCookie, acct('op:acct-cn-0001', 'credit-note', { date: '2026-08-05', amount: 300, invoice: 'FA-2026-000001' }));
ok(creditUnconfirmed.status === 409 && creditUnconfirmed.data.error === 'confirmation-required', 'a credit note is never issued without confirmation');

const orphan = await post(ownerCookie, Object.assign(acct('op:acct-cn-0009', 'credit-note', { date: '2026-08-05', amount: 10, invoice: 'FA-2026-999999' }), { confirmed: true }));
ok(orphan.data.command.status === 'failed' && orphan.data.command.lastError === 'invoice-not-found', 'a credit note must point at an invoice that exists');

const credit = await post(ownerCookie, Object.assign(acct('op:acct-cn-0001', 'credit-note', { date: '2026-08-05', amount: 300, invoice: 'FA-2026-000001' }), { confirmed: true }));
ok(credit.data.command.status === 'completed' && credit.data.command.result.number === 'AV-2026-000001' && credit.data.command.result.remainingCents === 90000,
  'a credit note is linked to its invoice and reports what is left to credit');
ok(credit.data.command.result.taxCents === 5000, 'the credit note carries the same proportion of TVA as the invoice it cancels');

const overCredit = await post(ownerCookie, Object.assign(acct('op:acct-cn-0002', 'credit-note', { date: '2026-08-05', amount: 1000, invoice: 'FA-2026-000001' }), { confirmed: true }));
ok(overCredit.data.command.status === 'failed' && overCredit.data.command.lastError === 'exceeds-invoice', 'the books refuse to credit more than the invoice is worth');

const journal = await post(ownerCookie, acct('op:acct-jrnl-01', 'export-journal', { from: '2026-08-01', to: '2026-08-31' }));
ok(journal.data.command.status === 'completed' && journal.data.command.result.count === 8, 'the journal export returns actual entry lines, not an acknowledgement');
ok(journal.data.command.result.balanced === true && journal.data.command.result.debitCents === journal.data.command.result.creditCents,
  'the exported journal balances: total debit equals total credit');
ok(journal.data.command.result.accounts['3421'].debitCents === 126000 && journal.data.command.result.accounts['4455'].creditCents === 20000,
  'the lines land on the Moroccan CGNC accounts, client debit against TVA facturée');

const badRange = await post(ownerCookie, acct('op:acct-jrnl-02', 'export-journal', { from: '2026-08-31', to: '2026-08-01' }));
ok(badRange.data.command.status === 'failed' && badRange.data.command.lastError === 'range-required', 'an inverted date range exports nothing');

const lock = await post(ownerCookie, Object.assign(acct('op:acct-lock-01', 'lock-period', { period: '2026-06' }), { confirmed: true }));
ok(lock.data.command.status === 'completed' && lock.data.command.result.alreadyLocked === false, 'the owner locks a closed accounting period');

const relock = await post(ownerCookie, Object.assign(acct('op:acct-lock-02', 'lock-period', { period: '2026-06' }), { confirmed: true }));
ok(relock.data.command.status === 'completed' && relock.data.command.result.alreadyLocked === true, 'locking an already-locked period is idempotent, not an error');

const backdated = await post(ownerCookie, acct('op:acct-inv-0003', 'create-invoice', { date: '2026-06-15', amount: 500 }));
ok(backdated.data.command.status === 'failed' && backdated.data.command.lastError === 'period-locked:2026-06',
  'a lock actually rejects a write into the closed period');
ok(!db.prepare('SELECT id FROM accounting_documents WHERE merchant = ? AND doc_date = ?').get(MERCHANT, '2026-06-15'),
  'the refused invoice left nothing behind in the ledger');

const numbers = db.prepare('SELECT number FROM accounting_documents WHERE merchant = ? ORDER BY series, seq').all(MERCHANT).map((r) => r.number);
ok(numbers.join(',') === 'AV-2026-000001,FA-2026-000001,FA-2026-000002', 'every written document — and only those — holds a number');

/* Source invariants that no request can demonstrate: a schema constraint and the
   shape of the tenant call itself. */
ok(apiSource.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_acc_seq'), 'the database refuses two documents on the same number');
ok(apiSource.includes('UNIQUE INDEX IF NOT EXISTS idx_ops_merchant_idempotency'), 'the database enforces one command per merchant idempotency key');
ok(apiSource.includes("tenantFor(request, env, body && body.merchant, { strict: true })"), 'writes resolve the tenant in strict mode');

/* ── Achats : le bon de commande, de l'engagement à la réception ────────────── */

const proc = (id, action, payload) => command({ id, idempotencyKey: id, domain: 'procurement', action, payload });
const confirmed = (body) => Object.assign(body, { confirmed: true });
const poRow = (number) => db.prepare('SELECT * FROM purchase_orders WHERE merchant = ? AND number = ?').get(MERCHANT, number);
const poLine = (number, sku) => db.prepare('SELECT * FROM purchase_order_lines WHERE merchant = ? AND number = ? AND sku = ?').get(MERCHANT, number, sku);

ok(poRow('BC-2026-000001').total_cents === 84000 && poLine('BC-2026-000001', 'FARINE-25').qty === 4,
  'the purchase order opened earlier persisted its supplier, its line and its value');

const noLines = await post(ownerCookie, proc('op:po-nolines-1', 'create-po', { supplier: 'Sofrap' }));
ok(noLines.data.command.status === 'failed' && noLines.data.command.lastError === 'no-lines',
  'a purchase order without a single line is refused rather than stored empty');

const noSupplier = await post(ownerCookie, proc('op:po-nosup-01', 'create-po', { lines: [{ sku: 'X', qty: 1, unitPrice: 1 }] }));
ok(noSupplier.data.command.status === 'failed' && noSupplier.data.command.lastError === 'supplier-required', 'a purchase order must name who it engages');

const dupSku = await post(ownerCookie, proc('op:po-dup-0001', 'create-po', { supplier: 'Sofrap', lines: [{ sku: 'LAIT-1L', qty: 2, unitPrice: 8.5 }, { sku: 'LAIT-1L', qty: 3, unitPrice: 8.5 }] }));
ok(dupSku.data.command.status === 'failed' && dupSku.data.command.lastError === 'duplicate-sku',
  'the same reference twice on one order is refused — reception could not tell the two apart');

const fracQty = await post(ownerCookie, proc('op:po-frac-001', 'create-po', { supplier: 'Sofrap', lines: [{ sku: 'LAIT-1L', qty: 2.5, unitPrice: 8.5 }] }));
ok(fracQty.data.command.status === 'failed' && fracQty.data.command.lastError === 'invalid-quantity', 'quantities are whole units, so "tout reçu" stays decidable');

const COPAG = { supplier: 'Copag', expectedDate: '2026-08-22', lines: [{ sku: 'LAIT-1L', label: 'Lait demi-écrémé 1 L', qty: 24, unitPrice: 8.5 }, { sku: 'BEURRE-500', label: 'Beurre doux 500 g', qty: 6, unitPrice: 42 }] };
const po2 = await post(ownerCookie, proc('op:po-copag-01', 'create-po', COPAG));
ok(po2.data.command.result.number === 'BC-2026-000002' && po2.data.command.result.totalCents === 45600,
  'the next purchase order takes the next number with no gap, and totals its own lines');

const earlyReceive = await post(ownerCookie, proc('op:po-early-01', 'receive-po', { po: 'BC-2026-000002', lines: [{ sku: 'LAIT-1L', qty: 1 }] }));
ok(earlyReceive.data.command.status === 'failed' && earlyReceive.data.command.lastError === 'not-submitted:draft',
  'nothing can be received against an order the supplier was never sent');

const unsentSubmit = await post(ownerCookie, proc('op:po-submit-01', 'submit-po', { po: 'BC-2026-000002' }));
ok(unsentSubmit.status === 409 && unsentSubmit.data.error === 'confirmation-required', 'sending a purchase order to a supplier demands an explicit confirmation');

const submitted = await post(ownerCookie, confirmed(proc('op:po-submit-01', 'submit-po', { po: 'BC-2026-000002' })));
ok(submitted.data.command.status === 'completed' && poRow('BC-2026-000002').status === 'submitted', 'the confirmed order leaves for the supplier');

const resubmit = await post(ownerCookie, confirmed(proc('op:po-submit-02', 'submit-po', { po: 'BC-2026-000002' })));
ok(resubmit.data.command.status === 'failed' && resubmit.data.command.lastError === 'bad-transition:submitted',
  'a second send is refused — it would be a second order nobody decided');

const ghost = await post(ownerCookie, confirmed(proc('op:po-ghost-01', 'submit-po', { po: 'BC-2026-999999' })));
ok(ghost.data.command.status === 'failed' && ghost.data.command.lastError === 'po-not-found', 'an order that does not exist cannot be acted on');

const overReceive = await post(ownerCookie, proc('op:po-over-001', 'receive-po', { po: 'BC-2026-000002', lines: [{ sku: 'LAIT-1L', qty: 30 }] }));
ok(overReceive.data.command.status === 'failed' && overReceive.data.command.lastError === 'exceeds-ordered', 'more cannot be received than was ordered');
ok(poLine('BC-2026-000002', 'LAIT-1L').received_qty === 0, 'the refused reception wrote nothing at all');

const mismatch = await post(ownerCookie, proc('op:po-mism-001', 'receive-po', { po: 'BC-2026-000002', lines: [{ sku: 'LAIT-1L', qty: 12 }], invoiceAmount: 150 }));
ok(mismatch.data.command.status === 'failed' && mismatch.data.command.lastError === 'invoice-mismatch',
  'a supplier invoice that does not equal what enters stock is refused — the three-way match');
ok(poLine('BC-2026-000002', 'LAIT-1L').received_qty === 0 && poRow('BC-2026-000002').invoiced_cents === 0,
  'the mismatched delivery left neither stock nor money behind');

const partial = await post(ownerCookie, proc('op:po-recv-001', 'receive-po', { po: 'BC-2026-000002', lines: [{ sku: 'LAIT-1L', qty: 12 }], invoiceAmount: 102 }));
ok(partial.data.command.status === 'completed' && partial.data.command.result.status === 'partial' && partial.data.command.result.outstandingUnits === 18,
  'a half-delivered order stays partial and says what is still owed');
ok(poRow('BC-2026-000002').invoiced_cents === 10200, 'the matched supplier invoice is booked against the order');

const unknownLine = await post(ownerCookie, proc('op:po-line-001', 'receive-po', { po: 'BC-2026-000002', lines: [{ sku: 'SUCRE-1K', qty: 1 }] }));
ok(unknownLine.data.command.status === 'failed' && unknownLine.data.command.lastError === 'line-not-found', 'a reference nobody ordered cannot be received against the order');

const rest = await post(ownerCookie, proc('op:po-recv-002', 'receive-po', { po: 'BC-2026-000002', lines: [{ sku: 'LAIT-1L', qty: 12 }, { sku: 'BEURRE-500', qty: 6 }] }));
ok(rest.data.command.result.status === 'received' && rest.data.command.result.outstandingUnits === 0, 'the closing delivery completes the order');

const settled = await post(ownerCookie, proc('op:po-recv-003', 'receive-po', { po: 'BC-2026-000002', lines: [{ sku: 'LAIT-1L', qty: 1 }] }));
ok(settled.data.command.status === 'failed' && settled.data.command.lastError === 'not-submitted:received', 'a closed order takes no further delivery');

const overReturn = await post(ownerCookie, confirmed(proc('op:po-ret-001', 'supplier-return', { po: 'BC-2026-000002', lines: [{ sku: 'BEURRE-500', qty: 9 }] })));
ok(overReturn.data.command.status === 'failed' && overReturn.data.command.lastError === 'exceeds-received', 'only what actually came in can be sent back');

const returned = await post(ownerCookie, confirmed(proc('op:po-ret-002', 'supplier-return', { po: 'BC-2026-000002', lines: [{ sku: 'BEURRE-500', qty: 2 }] })));
ok(returned.data.command.result.creditCents === 8400 && returned.data.command.result.heldUnits === 28,
  'a return prices the credit at the ordered unit price and leaves what is still held');

const doubleReturn = await post(ownerCookie, confirmed(proc('op:po-ret-003', 'supplier-return', { po: 'BC-2026-000002', lines: [{ sku: 'BEURRE-500', qty: 5 }] })));
ok(doubleReturn.data.command.status === 'failed' && doubleReturn.data.command.lastError === 'exceeds-received', 'the same crate cannot be returned twice');

const tillOrders = await post(tillCookie, proc('op:po-till-001', 'create-po', COPAG));
ok(tillOrders.status === 403 && tillOrders.data.error === 'permission-denied', 'a paired till cannot engage the business with a supplier');

ok(apiSource.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_po_seq'), 'the database refuses two purchase orders on the same rank');

/* Un domaine qui ne sait qu'écrire ne peut pas porter d'écran de réception : le
   commerçant taperait le numéro et la référence de mémoire.  Le livre des achats
   se relit donc, ligne par ligne, avec le reste dû. */
const book = await get(ownerCookie, `?merchant=${MERCHANT}&view=purchase-orders&limit=25`);
ok(book.status === 200 && book.data.orders.map((o) => o.number).join(',') === 'BC-2026-000002,BC-2026-000001',
  'the purchase book reads back, most recent order first');
const closed = book.data.orders.find((o) => o.number === 'BC-2026-000002');
const closedLine = closed.lines.find((l) => l.sku === 'BEURRE-500');
ok(closed.status === 'received' && closed.invoicedCents === 10200 && closed.supplier === 'Copag',
  'each order carries its state, its supplier and what has been invoiced against it');
ok(closedLine.qty === 6 && closedLine.receivedQty === 6 && closedLine.returnedQty === 2 && closedLine.unitCents === 4200,
  'every line reports ordered, received and returned quantities — the reception screen needs no memory');

const openBook = await get(ownerCookie, `?merchant=${MERCHANT}&view=purchase-orders&state=open&limit=25`);
ok(openBook.data.orders.length === 1 && openBook.data.orders[0].number === 'BC-2026-000001' && openBook.data.orders[0].status === 'draft',
  'the open view hides settled orders and keeps what still owes something');

const tillBook = await get(tillCookie, `?merchant=${MERCHANT}&view=purchase-orders`);
ok(tillBook.status === 403 && tillBook.data.error === 'owner-session-required', 'a paired till cannot enumerate what the business owes its suppliers');

const strangerBook = await get(ownerCookie, `?merchant=${OTHER}&view=purchase-orders`);
ok(strangerBook.status === 401 || (strangerBook.status === 200 && strangerBook.data.merchant === MERCHANT),
  'the purchase book cannot be read across tenants');

/* ── Paie : du bulletin calculé à l'écriture au journal et à la déclaration ── */

const pay = (id, action, payload) => command({ id, idempotencyKey: id, domain: 'payroll', action, payload });
const pySlip = (period, member) => db.prepare('SELECT * FROM payslips WHERE merchant = ? AND period = ? AND member_id = ?').get(MERCHANT, period, member);
const pyCount = (period) => db.prepare('SELECT COUNT(*) AS n FROM payslips WHERE merchant = ? AND period = ?').get(MERCHANT, period).n;
const pyPeriod = (period) => db.prepare('SELECT * FROM payroll_periods WHERE merchant = ? AND period = ?').get(MERCHANT, period);
/* Trois salaires choisis pour traverser le barème : au-dessus du plafond CNSS,
   sous le premier seuil d'IGR avec deux enfants, et pile sur le seuil des frais
   professionnels avec un seul.  Les montants sont en dirhams — le serveur
   multiplie par cent, une saisie en centimes centuplerait chaque paie. */
const JULY = [
  { id: 'emp-amira', name: 'Amira Haddad', role: 'gérante', base: 8000, dependents: 0 },
  { id: 'emp-bilal', name: 'Bilal Naji', role: 'serveur', base: 4000, dependents: 2, advance: 500 },
  { id: 'emp-chaimae', name: 'Chaimae Ouali', role: 'cuisine', base: 6000, overtime: 500, dependents: 1 },
];

const tillPay = await post(tillCookie, pay('op:pay-till-001', 'prepare-payslips', { period: '2026-07', employees: JULY }));
ok(tillPay.status === 403 && tillPay.data.error === 'permission-denied', 'a paired till cannot compute what the staff is owed');

const staffPay = await post(staffAtTill, pay('op:pay-staff-01', 'prepare-payslips', { period: '2026-07', employees: JULY }));
ok(staffPay.status === 403 && staffPay.data.error === 'permission-denied', 'a cashier at the register holds no key to the salary book');

/* Un refus métier revient en HTTP 200 : le statut du commandement porte l'échec. */
const noPeriod = await post(ownerCookie, pay('op:pay-noper-01', 'prepare-payslips', { employees: JULY }));
ok(noPeriod.data.command.status === 'failed' && noPeriod.data.command.lastError === 'period-required',
  'a payslip run without a month refuses instead of guessing one');

const noStaff = await post(ownerCookie, pay('op:pay-nostaff1', 'prepare-payslips', { period: '2026-07', employees: [] }));
ok(noStaff.data.command.lastError === 'no-employees', 'an empty payroll is a mistake, not an empty month');

const overAdvance = await post(ownerCookie, pay('op:pay-adv-001', 'prepare-payslips',
  { period: '2026-07', employees: [{ id: 'emp-amira', name: 'Amira Haddad', base: 3000, advance: 4000 }] }));
ok(overAdvance.data.command.lastError === 'advance-exceeds-gross',
  'an advance larger than the month refuses before it can become a negative payslip');

const emptyBook = await post(ownerCookie, pay('op:pay-empty-01', 'export-payroll', { period: '2026-05' }));
ok(emptyBook.data.command.lastError === 'no-payslips', 'a month nobody computed cannot be posted to the journal');

const prepared = await post(ownerCookie, pay('op:pay-prep-001', 'prepare-payslips', { period: '2026-07', employees: JULY }));
const pj = prepared.data.command.result || {};
ok(prepared.data.command.status === 'prepared' && pj.rateSet === 'ma-2026' && pj.employees === 3,
  'a prepared month stops at prepared — nothing has been posted and nothing has been declared');
ok(pj.grossCents === 1850000 && pj.cappedCents === 1600000 && pj.cnssCents === 71680 && pj.amoCents === 41810
  && pj.igrCents === 28274 && pj.employerCents === 367715 && pj.advanceCents === 50000 && pj.netCents === 1658236,
  'the month totals hold: CNSS on the capped base, AMO on the whole, IGR by bracket, employer charges apart');

const amira = pySlip('2026-07', 'emp-amira');
ok(amira.gross_cents === 800000 && amira.capped_cents === 600000 && amira.cnss_cents === 26880
  && amira.igr_cents === 27678 && amira.net_cents === 727362,
  'a salary above the CNSS ceiling contributes on the ceiling and is taxed on the whole');
const bilal = pySlip('2026-07', 'emp-bilal');
ok(bilal.igr_cents === 0 && bilal.advance_cents === 50000 && bilal.net_cents === 323040,
  'family relief cannot drive the income tax below zero, and an advance leaves the net, never the gross');
const chaimae = pySlip('2026-07', 'emp-chaimae');
ok(chaimae.gross_cents === 650000 && chaimae.igr_cents === 596 && chaimae.net_cents === 607834,
  'one dependent shaves the tax without erasing it');

const again = await post(ownerCookie, pay('op:pay-prep-002', 'prepare-payslips', { period: '2026-07', employees: JULY }));
ok(again.data.command.status === 'prepared' && pyCount('2026-07') === 3,
  'recomputing a month replaces its payslips instead of stacking a second set beside them');

const payBook = await get(ownerCookie, `?merchant=${MERCHANT}&view=payslips&period=2026-07`);
ok(payBook.data.status === 'prepared' && payBook.data.payslips.length === 3
  && payBook.data.payslips.map((slip) => slip.memberId).join(',') === 'emp-amira,emp-bilal,emp-chaimae'
  && payBook.data.totals.netCents === 1658236,
  'the owner reads the month back in name order, line by line, with the totals');

const tillSlips = await get(tillCookie, `?merchant=${MERCHANT}&view=payslips`);
ok(tillSlips.status === 403 && tillSlips.data.error === 'owner-session-required', 'a paired till cannot read what the staff is paid');

const posted = await post(ownerCookie, pay('op:pay-post-001', 'export-payroll', { period: '2026-07' }));
const pb = posted.data.command.result || {};
ok(posted.data.command.status === 'completed' && pb.number === 'PAIE-2026-000001' && pb.seq === 1
  && pb.series === 'PAIE-2026' && pb.date === '2026-07-31' && pb.entries === 6 && pb.balanced === true
  && pb.alreadyPosted === false && pb.rows.length === 3 && pb.truncated === false,
  'posting a month writes one journal entry, numbered from its own series and dated on the last day');

const payLines = db.prepare(
  'SELECT account, debit_cents, credit_cents FROM accounting_entries WHERE merchant = ? AND number = ?'
).all(MERCHANT, 'PAIE-2026-000001');
const payDebit = payLines.reduce((sum, line) => sum + line.debit_cents, 0);
const payCredit = payLines.reduce((sum, line) => sum + line.credit_cents, 0);
ok(payLines.length === 6 && payDebit === payCredit && payDebit === 2217715,
  'gross plus employer charges on the debit equals net, social, tax and advances on the credit');

const reposted = await post(ownerCookie, pay('op:pay-post-002', 'export-payroll', { period: '2026-07' }));
ok(reposted.data.command.result.alreadyPosted === true && reposted.data.command.result.number === 'PAIE-2026-000001',
  'posting a month twice returns the entry already written rather than numbering a second one');

const frozen = await post(ownerCookie, pay('op:pay-prep-003', 'prepare-payslips', { period: '2026-07', employees: JULY }));
ok(frozen.data.command.lastError === 'period-posted', 'a month carried to the journal can no longer be recomputed under the ledger');

const cnssRaw = await post(ownerCookie, pay('op:pay-cnss-001', 'submit-cnss', { period: '2026-07' }));
ok(cnssRaw.status === 409 && cnssRaw.data.error === 'confirmation-required', 'declaring to the CNSS asks before it speaks for the merchant');

const declared = await post(ownerCookie, confirmed(pay('op:pay-cnss-002', 'submit-cnss', { period: '2026-07' })));
ok(declared.data.command.result.declaration === 'DS-2026-07' && declared.data.command.result.alreadyDeclared === false
  && declared.data.command.result.socialCents === 481205 && pyPeriod('2026-07').journal_number === 'PAIE-2026-000001',
  'the declaration carries employee and employer charges together and leaves the journal number standing');

const redeclared = await post(ownerCookie, confirmed(pay('op:pay-cnss-003', 'submit-cnss', { period: '2026-07' })));
ok(redeclared.data.command.result.alreadyDeclared === true, 'a month declared twice reports the first declaration instead of filing a second');

/* Juin est verrouillé plus haut par la comptabilité : la paie doit s'y heurter. */
const june = await post(ownerCookie, pay('op:pay-jun-0001', 'prepare-payslips',
  { period: '2026-06', employees: [{ id: 'emp-amira', name: 'Amira Haddad', base: 5000 }] }));
ok(june.data.command.status === 'prepared' && june.data.command.result.netCents === 466300, 'June computes on its own figures');

const juneBlocked = await post(ownerCookie, pay('op:pay-jun-0002', 'export-payroll', { period: '2026-06' }));
ok(juneBlocked.data.command.lastError === 'period-locked:2026-06',
  'a closed accounting month refuses the payroll entry and names the month that closed it');

const juneCnss = await post(ownerCookie, confirmed(pay('op:pay-jun-0003', 'submit-cnss', { period: '2026-06' })));
ok(juneCnss.data.command.result.declaration === 'DS-2026-06' && juneCnss.data.command.result.socialCents === 139150,
  'a month still reaches the CNSS even when the ledger is closed to it');

const juneFrozen = await post(ownerCookie, pay('op:pay-jun-0004', 'prepare-payslips',
  { period: '2026-06', employees: [{ id: 'emp-amira', name: 'Amira Haddad', base: 5200 }] }));
ok(juneFrozen.data.command.lastError === 'period-declared', 'a declared month cannot quietly change under the figure already sent');

const months = await get(ownerCookie, `?merchant=${MERCHANT}&view=payslips`);
ok(months.data.periods.length === 2 && months.data.periods[0].period === '2026-07' && months.data.periods[1].period === '2026-06'
  && months.data.periods[0].number === 'PAIE-2026-000001' && months.data.periods[1].declaration === 'DS-2026-06',
  'the payroll index lists months newest first, each with whatever entry and declaration it carries');

/* ── Notifications: what actually left the building ───────────────────────────
 *
 * Un « envoyé ✓ » au-dessus d'un message jamais parti est le pire écran que
 * puisse afficher une caisse.  Ces contrôles font tourner de VRAIS fournisseurs
 * — un serveur http local dont on pilote le code de réponse par chemin — parce
 * qu'un `fetch` stubé prouve que le code appelle quelque chose, jamais qu'il
 * sait quoi faire quand ce quelque chose répond 500. */

const ntHits = [];
let waStatus = 200;
let smsStatus = 200;
let mailStatus = 200;
const notifier = http.createServer((req, res) => {
  const path = req.url;
  req.resume();
  req.on('end', () => {
    ntHits.push(path);
    const status = path === '/wa' ? waStatus : path === '/sms' ? smsStatus : mailStatus;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{}');
  });
});
await new Promise((resolve) => notifier.listen(0, '127.0.0.1', resolve));
const notifyBase = `http://127.0.0.1:${notifier.address().port}`;
const ntEnv = Object.assign({}, env, {
  WHATSAPP_WEBHOOK: `${notifyBase}/wa`,
  SMS_WEBHOOK: `${notifyBase}/sms`,
  MAIL_WEBHOOK: `${notifyBase}/mail`,
});
const nt = (id, action, payload) => command({ id, idempotencyKey: id, domain: 'notification', action, payload });

const ntDark = await post(ownerCookie, nt('op:nt-0001', 'send-receipt',
  { to: '+212600000001', reference: 'NT-DARK-1', text: 'Merci' }));
ok(ntDark.data.command.status === 'blocked' && ntDark.data.command.lastError === 'provider-unconfigured'
  && ntDark.data.command.result.attempts.length === 0,
  'with no messaging provider configured nothing is attempted and nothing is called sent');

waStatus = 500;
const ntFall = await post(ownerCookie, nt('op:nt-0002', 'send-receipt',
  { to: '+212600000002', reference: '260812-0001-UE', text: 'Reçu' }), ntEnv);
const fall = ntFall.data.command;
ok(fall.status === 'sent' && fall.result.channel === 'sms' && fall.result.attempts.length === 2
  && fall.result.attempts[0].channel === 'whatsapp' && fall.result.attempts[0].status === 'failed'
  && fall.result.attempts[0].reason === 'provider-http-500',
  'a receipt whose WhatsApp provider answers 500 walks down to SMS instead of failing');

const ntBefore = ntHits.length;
const ntAgain = await post(ownerCookie, nt('op:nt-0003', 'send-receipt',
  { to: '+212600000002', reference: '260812-0001-UE', text: 'Reçu' }), ntEnv);
ok(ntAgain.data.command.status === 'sent' && ntAgain.data.command.result.deduped === true
  && ntAgain.data.command.result.of === 'op:nt-0002' && ntHits.length === ntBefore,
  'the same receipt asked twice inside the window reports the first send instead of messaging the client again');

const ntPinned = await post(ownerCookie, nt('op:nt-0004', 'send-whatsapp',
  { phone: '+212600000003', text: 'Bonjour' }), ntEnv);
ok(ntPinned.data.command.status === 'blocked' && ntPinned.data.command.lastError === 'provider-http-500'
  && ntPinned.data.command.result.attempts.length === 1,
  'send-whatsapp names its channel: it fails rather than delivering the message by SMS');

waStatus = 200;
const ntMailOnly = await post(ownerCookie, nt('op:nt-0005', 'send-reminder',
  { email: 'amira@example.com', subject: 'Rappel', text: 'Rappel' }), ntEnv);
const mailOnly = ntMailOnly.data.command;
ok(mailOnly.status === 'sent' && mailOnly.result.channel === 'email' && mailOnly.result.attempts.length === 3
  && mailOnly.result.attempts[0].status === 'skipped' && mailOnly.result.attempts[0].reason === 'no-recipient'
  && mailOnly.result.attempts[1].status === 'skipped',
  'a channel with no usable address is skipped, not counted as a delivery failure');

const ntPref = await post(ownerCookie, nt('op:nt-0006', 'set-preferences',
  { kind: 'receipt', channels: ['email', 'whatsapp'] }));
ok(ntPref.data.command.status === 'completed' && ntPref.data.command.result.channels.join(',') === 'email,whatsapp',
  'a merchant can reorder the channels a receipt walks down');

const ntOrdered = await post(ownerCookie, nt('op:nt-0007', 'send-receipt',
  { email: 'client@example.com', phone: '+212600000004', reference: '260812-0002-UE', text: 'Reçu' }), ntEnv);
ok(ntOrdered.data.command.result.channel === 'email',
  'the stored order beats the default: WhatsApp is up and reachable, and the receipt still leaves by e-mail');

const ntUnknown = await post(ownerCookie, nt('op:nt-0008', 'set-preferences', { kind: 'facture', channels: ['email'] }));
ok(ntUnknown.data.command.status === 'failed' && ntUnknown.data.command.lastError === 'unknown-kind',
  'preferences can only be set for a kind the server actually routes');

const ntEmpty = await post(ownerCookie, nt('op:nt-0009', 'set-preferences', { kind: 'reminder', channels: [] }));
ok(ntEmpty.data.command.status === 'failed' && ntEmpty.data.command.lastError === 'channels-required',
  'a preference with no channel left is refused rather than stored as silence');

const ntOff = await post(ownerCookie, nt('op:nt-0010', 'set-preferences',
  { kind: 'payment-link', channels: ['sms'], enabled: false }));
ok(ntOff.data.command.result.enabled === false, 'a merchant can switch a whole kind of message off');

const ntBlocked = await post(ownerCookie, nt('op:nt-0011', 'send-link',
  { phone: '+212600000005', url: 'https://pay.test/x', text: 'Lien' }), ntEnv);
ok(ntBlocked.data.command.status === 'blocked' && ntBlocked.data.command.lastError === 'kind-disabled',
  'a kind switched off blocks the send even when the provider is up');

const ntMgrPref = await post(managerAtTill, nt('op:nt-0012', 'set-preferences',
  { kind: 'reminder', channels: ['sms'] }), ntEnv);
ok(ntMgrPref.status === 403 && ntMgrPref.data.error === 'permission-denied',
  'a floor manager may message a client but may not rewrite the merchant-wide routing');

const ntMgrSend = await post(managerAtTill, nt('op:nt-0013', 'send-whatsapp',
  { phone: '+212600000006', text: 'Table prête' }), ntEnv);
ok(ntMgrSend.data.command.status === 'sent', 'the same manager can still send the message itself');

const ntView = await get(ownerCookie, `?merchant=${MERCHANT}&view=notifications&limit=100`);
const ntReceipt = ntView.data.preferences.find((row) => row.kind === 'receipt');
ok(ntView.data.preferences.length === 4 && ntReceipt.custom === true
  && ntReceipt.channels.join(',') === 'email,whatsapp'
  && ntView.data.preferences.find((row) => row.kind === 'payment-link').enabled === false
  && ntView.data.preferences.find((row) => row.kind === 'message').custom === false,
  'the console reads back every kind, marking which ones the merchant actually changed');

/* La piste d'audit ne doit pas devenir un carnet d'adresses : elle dit quel
   canal a été essayé et pourquoi il a échoué, jamais chez qui. */
const ntJournal = JSON.stringify(ntView.data.deliveries);
ok(ntView.data.deliveries.length > 0
  && ntView.data.deliveries.every((row) => !('recipient' in row) && !('to' in row))
  && !/212600000/.test(ntJournal) && !/example\.com/.test(ntJournal),
  'the delivery journal carries the channel and the reason, never the customer address');

notifier.close();

/* ── L'assistant : ce qu'une phrase dictée a le droit de faire ─────────────── */

const ai = (id, action, payload) => command({ id, idempotencyKey: id, domain: 'ai', action, confirmed: true, payload });

const aiUnknownAction = await post(ownerCookie, command({ id: 'op:ai-x-01', idempotencyKey: 'op:ai-x-01', domain: 'ai', action: 'close-the-shop', confirmed: true, payload: { said: 'ferme la boutique' } }));
ok(aiUnknownAction.status === 400 && aiUnknownAction.data.error === 'unsupported-action',
  'the assistant may only ask for the four actions the Worker names, whatever the sentence says');

/* La table des commandes appartient au module de la salle, pas au schéma des
   opérations : une base qui n'a jamais pris de commande n'est pas une base en
   panne, et l'assistant doit le dire ainsi plutôt que de prétendre au succès. */
const aiNoTable = await post(ownerCookie, ai('op:ai-ord-00', 'update-order-status', { said: 'valide la 12', orderId: 'ord-260814-0001', status: 'accepted' }));
ok(aiNoTable.data.command.status === 'failed' && aiNoTable.data.command.lastError === 'orders-unavailable',
  'a merchant whose orders table was never created gets a named refusal, not a false confirmation');

const aiNoView = await get(ownerCookie, `?merchant=${MERCHANT}&view=orders`);
ok(aiNoView.status === 200 && aiNoView.data.unavailable === true && aiNoView.data.orders.length === 0,
  'the read degrades to an empty, explicitly-unavailable list rather than a 500');

db.exec(`
  CREATE TABLE orders (
    id TEXT PRIMARY KEY, merchant TEXT NOT NULL, number INTEGER NOT NULL,
    mode TEXT NOT NULL, table_no TEXT, total INTEGER NOT NULL, lines TEXT NOT NULL,
    status TEXT NOT NULL, created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL
  );
`);
const seedOrder = (id, number, table, status, total, ts) => db.prepare(
  'INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts) VALUES (?,?,?,?,?,?,?,?,?,?)'
).run(id, MERCHANT, number, table ? 'table' : 'takeout', table || '', total, '[]', status, ts, ts);
seedOrder('ord-260814-0001', 12, '12', 'pending', 214, 1786600000000);
seedOrder('ord-260814-0002', 13, '4', 'ready', 131, 1786600001000);
seedOrder('ord-260814-0003', 14, '', 'served', 102, 1786600002000);
/* Le ticket d'un autre commerçant porte le même numéro de table : c'est
   exactement la collision que le filtre par locataire doit absorber. */
db.prepare('INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .run('ord-260814-9999', OTHER, 12, 'table', '12', 999, '[]', 'pending', 1786600003000, 1786600003000);

const aiAccept = await post(staffAtTill, ai('op:ai-ord-01', 'update-order-status', { said: 'valide la commande 12', orderId: 'ord-260814-0001', status: 'accepted' }));
ok(aiAccept.status === 200 && aiAccept.data.command.status === 'completed'
  && aiAccept.data.command.result.from === 'pending' && aiAccept.data.command.result.status === 'accepted'
  && aiAccept.data.command.result.number === 12 && aiAccept.data.command.result.said === 'valide la commande 12',
  'a cashier can move a ticket by voice, and the ticket carries the sentence that moved it');

ok(db.prepare('SELECT status FROM orders WHERE id = ?').get('ord-260814-0001').status === 'accepted',
  'the order row itself changed — the command did not merely report a change');

const aiAgain = await post(staffAtTill, ai('op:ai-ord-02', 'update-order-status', { said: 'valide la 12', orderId: 'ord-260814-0001', status: 'accepted' }));
ok(aiAgain.data.command.status === 'failed' && aiAgain.data.command.lastError === 'already-accepted',
  'asking twice for the same state is named as such, never replayed as a second acceptance');

const aiBack = await post(staffAtTill, ai('op:ai-ord-03', 'update-order-status', { said: 'accepte la 14', orderId: 'ord-260814-0003', status: 'accepted' }));
ok(aiBack.data.command.status === 'failed' && aiBack.data.command.lastError === 'bad-transition:served',
  'a served ticket cannot be walked backwards into acceptance by a sentence');

const aiReady = await post(staffAtTill, ai('op:ai-ord-04', 'update-order-status', { said: 'la 13 est servie', orderId: 'ord-260814-0002', status: 'served' }));
ok(aiReady.data.command.status === 'completed' && aiReady.data.command.result.from === 'ready',
  'a ready ticket can be served');

const aiGhost = await post(staffAtTill, ai('op:ai-ord-05', 'update-order-status', { said: 'valide la 99', orderId: 'ord-260814-0404', status: 'accepted' }));
ok(aiGhost.data.command.status === 'failed' && aiGhost.data.command.lastError === 'order-unknown',
  'an order nobody has is unknown, not created on the way past');

const aiStranger = await post(staffAtTill, ai('op:ai-ord-06', 'update-order-status', { said: 'valide la 12', orderId: 'ord-260814-9999', status: 'accepted' }));
ok(aiStranger.data.command.status === 'failed' && aiStranger.data.command.lastError === 'order-unknown',
  "another merchant's ticket is unknown here, whatever its identifier");

const aiNoId = await post(staffAtTill, ai('op:ai-ord-07', 'update-order-status', { said: 'valide la commande', status: 'accepted' }));
ok(aiNoId.data.command.status === 'failed' && aiNoId.data.command.lastError === 'order-id-required',
  'a sentence that names no ticket is refused rather than applied to the newest one');

const aiBadStatus = await post(staffAtTill, ai('op:ai-ord-08', 'update-order-status', { said: 'facture la 13', orderId: 'ord-260814-0002', status: 'facturee' }));
ok(aiBadStatus.data.command.status === 'failed' && aiBadStatus.data.command.lastError === 'unsupported-status',
  'only the four states of the kitchen board are reachable by voice');

const aiTillOrder = await post(tillCookie, ai('op:ai-ord-09', 'update-order-status', { said: 'valide la 12', orderId: 'ord-260814-0001', status: 'served' }));
ok(aiTillOrder.status === 403 && aiTillOrder.data.error === 'permission-denied',
  'a pairing cookie is a counter, not a cashier: it cannot move anyone else’s ticket');

/* Réimpression : le même prédicat qui allume l'alarme de parc refuse le
   travail, et l'exécution revient à l'appareil qui l'a demandée. */
const aiPrint = await post(staffAtTill, ai('op:ai-print-01', 'reprint', { said: 'réimprime le dernier ticket', deviceId: 'dev-till-01' }));
ok(aiPrint.data.command.status === 'processing' && aiPrint.data.command.provider === 'local-device'
  && aiPrint.data.command.result.instruction === 'execute-on-requesting-device',
  'a reprint is handed back to the device that asked for it, never executed in the cloud');

const aiPrintNoDevice = await post(staffAtTill, ai('op:ai-print-02', 'reprint', { said: 'réimprime' }));
ok(aiPrintNoDevice.data.command.status === 'failed' && aiPrintNoDevice.data.command.lastError === 'device-id-required',
  'a reprint with no printer named is refused rather than broadcast to the whole fleet');

const aiPrintGhost = await post(staffAtTill, ai('op:ai-print-03', 'reprint', { said: 'réimprime', deviceId: 'dev-never-seen' }));
ok(aiPrintGhost.data.command.status === 'failed' && aiPrintGhost.data.command.lastError === 'device-unknown',
  'a device that never reported in cannot be promised a job');

const aiPrintBlocked = await post(staffAtTill, ai('op:ai-print-04', 'reprint', { said: 'réimprime', deviceId: 'dev-caisse-03' }));
ok(aiPrintBlocked.data.command.status === 'blocked' && aiPrintBlocked.data.command.lastError === 'printer-unreachable',
  'promising a reprint to an unreachable printer would be a lie, so it is blocked');

/* Déléguer : l'ordre dicté passe par le moteur qui fait déjà ce travail pour
   un humain, invariants compris — il n'existe pas de deuxième numérotation de
   bon d'achat ni de deuxième journal d'envois. */
const aiPo = await post(managerAtTill, ai('op:ai-po-01', 'create-po', {
  said: 'commande 10 kg de café chez Atlas', supplier: 'Atlas Torréfaction',
  lines: [{ sku: 'CAFE-1KG', label: 'Café en grains 1 kg', qty: 10, unitPrice: 120 }],
}));
ok(aiPo.data.command.status === 'draft' && /^BC-\d{4}-000003$/.test(aiPo.data.command.result.number)
  && aiPo.data.command.result.totalCents === 120000
  && poRow(aiPo.data.command.result.number).supplier === 'Atlas Torréfaction',
  'a purchase order dictated to the assistant takes the next rank in the same book as a typed one — and lands as a draft, not as an order already sent');

const aiPoNoSupplier = await post(managerAtTill, ai('op:ai-po-02', 'create-po', { said: 'commande du café', lines: [{ sku: 'CAFE-1KG', qty: 1, unitPrice: 1 }] }));
ok(aiPoNoSupplier.data.command.status === 'failed' && aiPoNoSupplier.data.command.lastError === 'supplier-required',
  'the delegated engine keeps its own refusals: no supplier, no purchase order');

const aiMessage = await post(managerAtTill, ai('op:ai-msg-01', 'message-customer', { said: 'préviens la table 4', phone: '+212600000009', text: 'Votre table est prête' }));
ok(aiMessage.data.command.status === 'blocked' && aiMessage.data.command.lastError === 'provider-unconfigured',
  'a dictated message goes through the notification engine, so an absent provider blocks it instead of faking a send');

const aiSilent = await post(managerAtTill, command({ id: 'op:ai-msg-02', idempotencyKey: 'op:ai-msg-02', domain: 'ai', action: 'message-customer', confirmed: true, payload: { phone: '+212600000009', text: 'Bonjour' } }));
ok(aiSilent.data.command.status === 'failed' && aiSilent.data.command.lastError === 'intent-required',
  'the sentence is required before delegation, not after: nothing leaves without a recorded reason');

const aiView = await get(ownerCookie, `?merchant=${MERCHANT}&view=orders&limit=10`);
ok(aiView.status === 200 && !aiView.data.unavailable && aiView.data.orders.length === 3
  && aiView.data.orders[0].id === 'ord-260814-0003' && aiView.data.orders[0].table === ''
  && aiView.data.orders[2].number === 12 && aiView.data.orders[2].status === 'accepted',
  'the read lists this merchant’s tickets newest-first, with the state the assistant just wrote');

const aiOpen = await get(ownerCookie, `?merchant=${MERCHANT}&view=orders&state=open`);
ok(aiOpen.data.orders.length === 1 && aiOpen.data.orders[0].id === 'ord-260814-0001',
  'the open view keeps what the kitchen still owes and drops what is served');

const aiViewTill = await get(tillCookie, `?merchant=${MERCHANT}&view=orders`);
ok(aiViewTill.status === 403 && aiViewTill.data.error === 'owner-session-required',
  'the ticket reader is a console read, not something a pairing cookie can enumerate');

/* Le locataire est décidé par la session, pas par la requête : demander la
   maison d'à côté ne la lit pas, cela relit la sienne. Le ticket semé sous
   `OTHER` porte le même numéro de table que le nôtre — il ne doit jamais
   apparaître ici. */
const aiViewStranger = await get(ownerCookie, `?merchant=${OTHER}&view=orders`);
ok((aiViewStranger.status === 401)
  || (aiViewStranger.status === 200 && aiViewStranger.data.merchant === MERCHANT
      && !aiViewStranger.data.orders.some((order) => order.id === 'ord-260814-9999')),
  "one merchant cannot read another merchant's tickets");

/* Le motif est ce qui distingue « échouée » d'un constat muet : le client
   l'envoie, le serveur l'écrit, et la commande le rend au registre. */
const beaten = await post(ownerCookie, command({ id: 'op:owner-po-020', idempotencyKey: 'op:owner-po-020', domain: 'procurement', action: 'create-po', payload: SOFRAP }));
ok(beaten.data.command.status === 'draft', 'a second purchase order opens as a draft');
await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-020', transition: 'pending-approval' });
await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-020', transition: 'approved', confirmed: true });
await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-020', transition: 'processing' });
const marked = await post(ownerCookie, { merchant: MERCHANT, commandId: 'op:owner-po-020', transition: 'failed', reason: 'Le fournisseur ne livre pas cette semaine' });
ok(marked.status === 200 && marked.data.command.status === 'failed' && marked.data.command.lastError === 'Le fournisseur ne livre pas cette semaine',
  'a human motif reaches the command instead of being dropped between client and server');

/* ── Browser: the client contract, simulated ──────────────────────────────── */

const registrations = {};
const sent = [];
const queued = [];
let role = 'owner';
let online = true;
const offline = {
  available: () => true,
  enqueue: async (channel, tenant, payload, opts) => { queued.push({ channel, tenant, payload, opts }); return { ok: true }; },
  claim: async () => null,
  acknowledge: async () => true,
  reject: async () => true,
};
const platform = {
  tenant: () => 'amira-boutique',
  register: (name, adapter) => { registrations[name] = adapter; },
  access: {
    role: () => role,
    can: (_subject, action, resource) => role === 'owner' || (role === 'cashier' && action === 'read' && resource === 'orders'),
  },
  telemetry: { start: () => ({ end() {} }) },
};
const navigator = {};
Object.defineProperty(navigator, 'onLine', { get: () => online });
const context = {
  window: { KiwiPlatform: platform, KiwiOffline: offline, addEventListener() {}, dispatchEvent() {} },
  navigator, location: { pathname: '/kiwi-caisse.html' }, document: { body: { classList: { contains: () => false } } },
  fetch: async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    sent.push({ url: String(url), options, body });
    if (String(url).startsWith('/api/operations?')) return { ok: true, status: 200, json: async () => ({ merchant: 'amira-boutique', providers: {}, commands: [] }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, command: { id: body.id, merchant: body.merchant, domain: body.domain, action: body.action, status: body.domain === 'payment' ? 'active' : 'draft', result: body.domain === 'payment' ? { url: 'https://pay.example/abc' } : {} } }) };
  },
  crypto: { randomUUID: (() => { let i = 0; return () => '00000000-0000-4000-8000-' + String(++i).padStart(12, '0'); })() },
  URLSearchParams, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  setInterval() {}, setTimeout() {}, console, Date, Math, Promise, Set, Error, Object, String, Number, JSON,
};
context.window.window = context.window;
context.window.navigator = navigator;
context.window.location = context.location;
vm.createContext(context);
vm.runInContext(browserSource, context, { filename: 'operations.js' });

ok(Object.keys(registrations).sort().join(',') === 'accounting,actions,devices,notifications,payment-links,payroll,procurement', 'all seven operational capabilities register');
const first = await context.window.KiwiOperations.create('payment', 'create-link', { amount: 120, currency: 'MAD' });
ok(first.command.status === 'active' && first.command.result.url.startsWith('https://'), 'provider-confirmed payment link reaches active state');
ok(sent[0].body.merchant === 'amira-boutique' && sent[0].body.id === sent[0].body.idempotencyKey, 'online command carries tenant and stable idempotency');

online = false;
const offlineResult = await context.window.KiwiOperations.create('procurement', 'create-po', { supplier: 'Copag', lines: [{ sku: 'LAIT-1L', qty: 24, unitPrice: 8.5 }] });
ok(offlineResult.queued === true && queued.length === 1, 'offline command is persisted instead of reported as completed');
ok(queued[0].tenant === 'amira-boutique' && queued[0].payload.id === queued[0].opts.id, 'offline retry preserves tenant and command ID');

online = true; role = 'cashier';
await assert.rejects(() => context.window.KiwiOperations.create('procurement', 'create-po', {}), /permission-denied/); n++; console.log('  ✓ cashier cannot create a purchase order');
await assert.rejects(() => context.window.KiwiOperations.create('notification', 'send-receipt', { to: 'x' }), /permission-denied/); n++; console.log('  ✓ generic operations API cannot be abused by till to message arbitrary contacts');
const heartbeat = await context.window.KiwiOperations.create('device', 'heartbeat', { app: 'caisse' });
ok(heartbeat.ok === true && sent.at(-1).body.domain === 'device', 'paired app can report only its device heartbeat');

await context.window.KiwiOperations.list({ domain: 'device', limit: 2 });
ok(sent.at(-1).url.includes('merchant=amira-boutique') && sent.at(-1).url.includes('domain=device'), 'history reads are explicitly tenant and domain scoped');

/* L'assistant, côté navigateur : il lit les tickets par la porte en lecture
   seule, et tout ce qu'il déclenche emporte la phrase qui l'a déclenché. */
role = 'owner';
await context.window.KiwiOperations.orders({ open: true, limit: 5 });
ok(sent.at(-1).url.includes('view=orders') && sent.at(-1).url.includes('state=open')
  && sent.at(-1).url.includes('merchant=amira-boutique') && !sent.at(-1).url.includes('/api/order/queue'),
  'the assistant reads tickets through the read-only view, never through the kitchen queue that wakes the counter');
await context.window.KiwiOperations.agentRun('update-order-status', { orderId: 'ord-260814-0001', status: 'accepted' }, 'valide la commande 12');
ok(sent.at(-1).body.domain === 'ai' && sent.at(-1).body.confirmed === true
  && sent.at(-1).body.payload.said === 'valide la commande 12' && sent.at(-1).body.payload.orderId === 'ord-260814-0001',
  'a dictated action leaves the browser already confirmed and carrying its sentence');
ok(context.window.KiwiOperations.agentAllowed('update-order-status') === true, 'the client can tell in advance whether this seat may dictate the action');
role = 'cashier';
ok(context.window.KiwiOperations.agentAllowed('create-po') === false, 'a cashier is told no before the assistant offers the button, not after the server refuses');
role = 'owner';

/* La carte de proposition : rien ne part sans un deuxième geste, et le bouton
   se désarme avant l'envoi pour qu'un double clic ne fasse pas deux ordres. */
ok(agentSource.includes('data-fa-run') && agentSource.includes('data-fa-said') && agentSource.includes('KiwiOperations'),
  'the assistant proposes the action as a card wired to the real command API');
ok(agentSource.includes('window.KiwiAgentOperation'), 'the order reader is exposed so the gate can assert the sentence was read, not just answered');

ok(teamSource.includes("new Blob([content], { type: 'text/csv;charset=utf-8' })") && teamSource.includes("window.KiwiOperations?.create?.('payroll', 'export-payroll'"), 'payroll button downloads a real CSV and records its hand-off');
ok(uiSource.includes("O.create('payment', 'create-link'") && !uiSource.includes('kiwi-pay.ma/'), 'payment UI calls the provider workflow and invents no URL');
ok(uiSource.includes('window.KiwiProcurement') && uiSource.includes("O.create('procurement', 'create-po'"), 'purchase-order UI uses Kiwi procurement truth and durable audit');
/* Achats — le serveur valide désormais fournisseur et lignes ; un bouton qui
   postait un identifiant plat passait le contrôle par grep et échouait en vrai. */
ok(uiSource.includes("currency:'MAD', lines:[]") && uiSource.includes('payload.lines.push({ sku:sku') && !uiSource.includes('purchaseOrderId'),
  'the purchase-order console sends a real supplier and real lines, not a flat identifier');
ok(uiSource.includes("O.create('procurement', action, payload"), 'the procurement console dispatches the lifecycle through the durable command API');
['submit-po', 'receive-po', 'supplier-return'].forEach((action) =>
  ok(uiSource.includes(`data-po-run="${action}"`), `the product can reach procurement ${action}`));
ok(uiSource.includes('invoiceAmount') && uiSource.includes('data-po-invoice'),
  'the reception screen carries the supplier invoice, so the three-way match is reachable');
ok(uiSource.includes('O.purchaseOrders({ open:true') && browserSource.includes("view: 'purchase-orders'"),
  'the console reads the purchase book back instead of asking the merchant to recall a number');
/* create-po se termine en `draft` — c'est l'état du bon, pas un échec.  Le
   discriminateur partagé le lirait comme une erreur. */
ok(uiSource.includes("cmd.status !== 'completed' && cmd.status !== 'draft'"), 'a freshly opened purchase order is not reported as a failure');
ok(uiSource.includes("H['supplier-new-po']") && uiSource.includes("openProcurement('create')") && uiSource.includes("openProcurement('orders')"),
  'both purchase-order entry points open the real console for a real merchant');
/* Comptabilité — les quatre actions serveur doivent être atteignables depuis le
   produit, sinon le livre n'existe que dans les tests. */
ok(uiSource.includes("O.create('accounting', action, payload"), 'the accounting console dispatches through the durable command API');
['create-invoice', 'credit-note', 'lock-period', 'export-journal'].forEach((action) =>
  ok(uiSource.includes(`action = '${action}'`), `the product can reach accounting ${action}`));
ok(/\['open-comptabilite',[^\]]*\]\.forEach/.test(uiSource) && uiSource.includes('openLedger(tab)'), 'the accounting entry point opens the real ledger for a real merchant');
/* Un refus métier revient en HTTP 200 avec status:'failed' — un simple
   try/catch ne le verrait jamais. */
ok(uiSource.includes("cmd.status !== 'completed'") && uiSource.includes('cmd.lastError'), 'the console reads server-side domain refusals, not only thrown errors');
ok(uiSource.includes('confirmed:true') && uiSource.includes('data-acct-confirm'), 'credit notes and period locks demand an explicit confirmation');
/* Paie — les trois actions serveur doivent être atteignables depuis le produit. */
ok(uiSource.includes("O.create('payroll', 'prepare-payslips'"), 'the payroll console computes through the durable command API');
['export-payroll', 'submit-cnss'].forEach((action) =>
  ok(uiSource.includes(`data-py-run-book="${action}"`), `the product can reach payroll ${action}`));
ok(uiSource.includes('data-py-run') && uiSource.includes('data-py-period') && uiSource.includes('data-py-base'),
  'the payroll console takes a month and real per-employee amounts, not a flat total');
/* prepare-payslips se termine en `prepared` : la paie est calculée, pas payée. */
ok(uiSource.includes("cmd.status !== 'completed' && cmd.status !== 'prepared'"), 'a prepared month is not reported as a failure');
ok(/\['eq-export-payroll', 'pay-export', 'export-payroll', 'acct-paie'\]\.forEach/.test(uiSource) && uiSource.includes('openPayroll(key ==='),
  'all four payroll entry points open the real console for a real merchant');
ok(uiSource.includes('openPayroll:openPayroll') && browserSource.includes("view: 'payslips'"),
  'the payroll console is exported and reads the month back from the server');
/* Paiements — un lien qu'on ne peut pas relire, annuler ni rembourser depuis le
   produit n'est pas un livre, c'est un formulaire. */
['settle-link', 'cancel-link', 'refund-link'].forEach((action) =>
  ok(uiSource.includes(`data-lk-run="${action}"`), `the product can reach payment ${action}`));
ok(uiSource.includes("O.create('payment', 'create-link'") && uiSource.includes('data-lk-book'),
  'the payments console emits a link and reads the payment book back');
/* create-link se termine en `active` : le lien vit, il n'est pas terminé. */
ok(uiSource.includes("cmd.status !== 'completed' && cmd.status !== 'active'"), 'a live payment link is not reported as a failure');
ok(uiSource.includes('data-lk-confirm="cancel-link"') && uiSource.includes('data-lk-confirm="refund-link"'),
  'cancelling and refunding a link both demand an explicit confirmation');
/* Le serveur rembourse tout le remboursable quand le montant est absent —
   envoyer 0 se ferait refuser.  Le champ vide ne doit donc rien envoyer. */
ok(uiSource.includes("if (asked !== '')") && uiSource.includes('payload.amount = Number(asked)'),
  'an empty refund amount means the whole refundable, never a zero the server would refuse');
ok(uiSource.includes('openPayments:openPayments') && uiSource.includes("openPayments('link')") && browserSource.includes("view: 'payments'"),
  'the payments console is exported, opened from the payment-link button and reads the book from the server');

ok(uiSource.includes('openDevices:openDevices') && uiSource.includes("H['nav-terminaux']") && browserSource.includes("view: 'devices'"),
  'the parc console is exported, takes over the Terminaux destination and reads the fleet from the server');
ok(uiSource.includes('data-dv-ack') && uiSource.includes('data-dv-test'),
  'the product can acquit an alarm and ask a device for a test print');
ok(browserSource.includes("'device', 'heartbeat'") && /setInterval\([\s\S]{0,160}?beat\(\)/.test(browserSource),
  'the client beats on its own, it does not wait to be asked');
ok(uiSource.includes('legacyTerminals') && uiSource.includes('!real() && legacyTerminals'),
  'a demo session keeps its storytelling fleet — only a real merchant is shown real appliances');

/* Registre des décisions — la seule verbe du cycle de vie qui n'était appelée
   par personne.  Une commande qu'aucun humain ne peut faire avancer depuis le
   produit reste bloquée quoi qu'en dise le serveur. */
ok(browserSource.includes("reason: clean(opts.reason || '', 120)"),
  'the client sends the motif the server already reads, instead of always sending an empty one');
ok(uiSource.includes('openCommands:openCommands') && uiSource.includes("H['operations-history'] = function () { return openCommands('all'); }"),
  'the decision register is exported and takes over the read-only history drawer');
ok(uiSource.includes('data-cm-move=') && uiSource.includes('O.transition(row.getAttribute'),
  'the product can actually move a command, not only list it');
ok(uiSource.includes('data-cm-ok') && uiSource.includes("CM_CONFIRM[wanted] && !(box && box.checked)"),
  'the console demands the same explicit confirmation the server does');
ok(uiSource.includes('data-cm-input') && uiSource.includes("!(why && why.value.trim())"),
  'marking a command failed requires a written motif before it is sent');
/* blocked → processing existe côté serveur ; l'offrir ici annoncerait une
   reprise automatique que rien n'exécute. */
ok(/blocked: \['cancelled'\],\s*\n\s*failed: \['cancelled'\],/.test(uiSource),
  'a stopped command can only be closed by hand — the console never promises an automatic retry');
ok(uiSource.includes("O.allowed('payroll', 'export')") && uiSource.includes('cmDenied'),
  'the register is gated client-side on a permission only the owner holds, mirroring the server');

/* Version-agnostic on purpose: a cache-stamp bump is how a fix ships, so the
   gate must assert the script is wired, never which generation it is on. */
pages.forEach((page, i) => ok(/assets\/operations\.js\?v=\d+/.test(page), `operational shell ${i + 1} loads the command client`));
ok(/\/assets\/operations\.js\?v=\d+/.test(sw) && /\/assets\/operations-ui\.js\?v=\d+/.test(sw), 'operations assets are present in the offline shell');

console.log(`\n✓ Kiwi Operations — ${n} controls`);
