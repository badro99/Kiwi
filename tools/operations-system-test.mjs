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
  .run(MERCHANT, 'team', JSON.stringify({ members: [{ id: 'emp-1', name: 'Salma', function: 'Caissière' }] }), 2);

const env = { DB: D1(db), AUTH_SECRET: SECRET };

/* No provider webhook is configured on purpose: `postWebhook` short-circuits
   before any network call, so the "blocked, not sent" claim is proved offline. */
const ownerCookie = `kiwi_sess=${await makeSession('acc-owner', SECRET)}`;
const tillCookie = `kiwi_till=${await tillToken(SECRET, MERCHANT)}`;
const staffCookie = `kiwi_employee=${await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'emp-1' })}`;

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

const beat = await post(tillCookie, command({ id: 'op:till-beat-01', idempotencyKey: 'op:till-beat-01', domain: 'device', action: 'heartbeat', payload: { app: 'caisse' } }));
ok(beat.status === 200 && beat.data.command.status === 'completed' && beat.data.command.provider === 'kiwi-device', 'a paired till records its own heartbeat');

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

const staffReprintOk = await post(staffAtTill, command({ id: 'op:emp-print-01', idempotencyKey: 'op:emp-print-01', domain: 'ai', action: 'reprint', confirmed: true, payload: { orderId: '260812-0001-UE' } }));
ok(staffReprintOk.status === 200 && staffReprintOk.data.command.status === 'pending-approval', 'a confirmed reprint is staged, never silently executed');

const staffMessage = await post(staffAtTill, command({ id: 'op:emp-msg-0001', idempotencyKey: 'op:emp-msg-0001', domain: 'notification', action: 'send-whatsapp', confirmed: true, payload: { to: '+212600000000' } }));
ok(staffMessage.status === 403 && staffMessage.data.error === 'permission-denied', 'the roster role, not the pairing, decides what a cashier may do');

const staffHistory = await get(staffAtTill, '?merchant=' + MERCHANT);
ok(staffHistory.status === 403 && staffHistory.data.error === 'owner-session-required', 'an employee cannot read payroll metadata out of the ledger');

const ownerPo = await post(ownerCookie, command({ id: 'op:owner-po-001', idempotencyKey: 'op:owner-po-001', domain: 'procurement', action: 'create-po', payload: { supplier: 'Sofrap' } }));
ok(ownerPo.status === 200 && ownerPo.data.duplicate === false && ownerPo.data.command.status === 'draft', 'the owner opens a purchase order');

const replay = await post(ownerCookie, command({ id: 'op:owner-po-002', idempotencyKey: 'op:owner-po-001', domain: 'procurement', action: 'create-po', payload: { supplier: 'Sofrap' } }));
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
provider.close();

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

db.prepare('UPDATE merchant_config SET status = ? WHERE merchant = ?').run('suspended', MERCHANT);
const suspendedWrite = await post(ownerCookie, command({ id: 'op:owner-po-009', idempotencyKey: 'op:owner-po-009', domain: 'procurement', action: 'create-po' }));
ok(suspendedWrite.status === 401 && suspendedWrite.data.error === 'unauthorized', 'a suspended store cannot write new commands');
const suspendedRead = await get(ownerCookie, '?merchant=' + MERCHANT);
ok(suspendedRead.status === 200, 'a suspended store can still be read for support and settlement');
db.prepare('UPDATE merchant_config SET status = ? WHERE merchant = ?').run('active', MERCHANT);

/* Source invariants that no request can demonstrate: a schema constraint and the
   shape of the tenant call itself. */
ok(apiSource.includes('UNIQUE INDEX IF NOT EXISTS idx_ops_merchant_idempotency'), 'the database enforces one command per merchant idempotency key');
ok(apiSource.includes("tenantFor(request, env, body && body.merchant, { strict: true })"), 'writes resolve the tenant in strict mode');

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
const offlineResult = await context.window.KiwiOperations.create('procurement', 'create-po', { purchaseOrderId: 'PO-1' });
ok(offlineResult.queued === true && queued.length === 1, 'offline command is persisted instead of reported as completed');
ok(queued[0].tenant === 'amira-boutique' && queued[0].payload.id === queued[0].opts.id, 'offline retry preserves tenant and command ID');

online = true; role = 'cashier';
await assert.rejects(() => context.window.KiwiOperations.create('procurement', 'create-po', {}), /permission-denied/); n++; console.log('  ✓ cashier cannot create a purchase order');
await assert.rejects(() => context.window.KiwiOperations.create('notification', 'send-receipt', { to: 'x' }), /permission-denied/); n++; console.log('  ✓ generic operations API cannot be abused by till to message arbitrary contacts');
const heartbeat = await context.window.KiwiOperations.create('device', 'heartbeat', { app: 'caisse' });
ok(heartbeat.ok === true && sent.at(-1).body.domain === 'device', 'paired app can report only its device heartbeat');

await context.window.KiwiOperations.list({ domain: 'device', limit: 2 });
ok(sent.at(-1).url.includes('merchant=amira-boutique') && sent.at(-1).url.includes('domain=device'), 'history reads are explicitly tenant and domain scoped');

ok(teamSource.includes("new Blob([content], { type: 'text/csv;charset=utf-8' })") && teamSource.includes("window.KiwiOperations?.create?.('payroll', 'export-payroll'"), 'payroll button downloads a real CSV and records its hand-off');
ok(uiSource.includes("O.create('payment', 'create-link'") && !uiSource.includes('kiwi-pay.ma/'), 'payment UI calls the provider workflow and invents no URL');
ok(uiSource.includes('window.KiwiProcurement') && uiSource.includes("O.create('procurement', 'create-po'"), 'purchase-order UI uses Kiwi procurement truth and durable audit');
/* Version-agnostic on purpose: a cache-stamp bump is how a fix ships, so the
   gate must assert the script is wired, never which generation it is on. */
pages.forEach((page, i) => ok(/assets\/operations\.js\?v=\d+/.test(page), `operational shell ${i + 1} loads the command client`));
ok(/\/assets\/operations\.js\?v=\d+/.test(sw) && /\/assets\/operations-ui\.js\?v=\d+/.test(sw), 'operations assets are present in the offline shell');

console.log(`\n✓ Kiwi Operations — ${n} controls`);
