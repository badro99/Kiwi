#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const browserSource = fs.readFileSync(new URL('../assets/operations.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../assets/operations-ui.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../functions/api/operations.js', import.meta.url), 'utf8');
const teamSource = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');
const pages = ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html']
  .map((name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));

let n = 0;
function ok(condition, label) { assert.ok(condition, label); n++; console.log('  ✓ ' + label); }

/* Server invariants: these are deliberately textual guards around the security
 * boundary, complemented below by a behavioral browser simulation. */
ok(apiSource.includes('UNIQUE INDEX IF NOT EXISTS idx_ops_merchant_idempotency'), 'server deduplicates commands per merchant');
ok(apiSource.includes("tenantFor(request, env, body && body.merchant, { strict: true })"), 'server uses strict tenant resolution for writes');
ok(/onRequestGet[\s\S]*privileged\(request, env\)[\s\S]*owner-session-required/.test(apiSource), 'operational history is account/operator only');
ok(/body\.commandId[\s\S]*privileged\(request, env\)[\s\S]*invalid-transition/.test(apiSource), 'paired tills cannot transition management commands');
ok(apiSource.includes('provider-unconfigured') && apiSource.includes("status = 'blocked'") === false, 'missing providers are represented explicitly, not as success');
ok(apiSource.includes("if (!/^https:\\/\\//.test(url))"), 'payment links accept only provider-confirmed HTTPS URLs');
ok(apiSource.includes('confirmation-required') && apiSource.includes('idempotency_key'), 'risky actions require confirmation and stable idempotency');

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
pages.forEach((page, i) => ok(page.includes('assets/operations.js?v=1'), `operational shell ${i + 1} loads the command client`));
ok(sw.includes('/assets/operations.js?v=1') && sw.includes('/assets/operations-ui.js?v=1'), 'operations assets are present in the offline shell');

console.log(`\n✓ Kiwi Operations — ${n} controls`);
