// /api/operations — durable, tenant-scoped operational commands.
//
// This is Kiwi's small orchestration boundary.  It deliberately does not copy
// Novu, Medusa, OpenFGA or ERPNext into a no-build application; it borrows the
// useful invariants: stable command IDs, explicit lifecycle states, provider
// capabilities, confirmation for risky work and an append-only audit trail.
// A missing provider is a BLOCKED command, never a green "sent" toast.

import {
  json, sendMail, readSession, readCookie, SESS_COOKIE, isOperator,
  activeEmployee, isTillFor,
} from '../auth/_lib.js';
import { tenantFor } from './_private.js';

const ACTIONS = {
  notification: new Set(['send-email', 'send-whatsapp', 'send-sms', 'send-receipt', 'send-reminder']),
  procurement: new Set(['create-po', 'submit-po', 'receive-po', 'supplier-return']),
  payroll: new Set(['export-payroll', 'prepare-payslips', 'submit-cnss']),
  accounting: new Set(['export-journal', 'create-invoice', 'credit-note', 'lock-period']),
  payment: new Set(['create-link', 'cancel-link', 'refund-link']),
  device: new Set(['heartbeat', 'test-print', 'ack-alert']),
  ai: new Set(['reprint', 'update-order-status', 'message-customer', 'create-po']),
};
const CONFIRM = new Set([
  'procurement:submit-po', 'procurement:supplier-return', 'payroll:submit-cnss',
  'accounting:credit-note', 'accounting:lock-period', 'payment:cancel-link',
  'payment:refund-link', 'ai:reprint', 'ai:update-order-status',
  'ai:message-customer', 'ai:create-po',
]);
const TRANSITIONS = {
  draft: new Set(['pending-approval', 'cancelled']),
  prepared: new Set(['sent', 'cancelled']),
  'pending-approval': new Set(['approved', 'rejected', 'cancelled']),
  approved: new Set(['processing', 'cancelled']),
  processing: new Set(['completed', 'failed', 'blocked']),
  blocked: new Set(['processing', 'cancelled']),
  failed: new Set(['processing', 'cancelled']),
  active: new Set(['cancelled', 'completed']),
};

const clean = (value, max = 120) => String(value == null ? '' : value).trim().slice(0, max);
const idOk = (value) => /^[A-Za-z0-9._:-]{8,128}$/.test(clean(value, 128));
const now = () => Date.now();
const safeJson = (value, limit = 24000) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try { const out = JSON.stringify(value); return out.length <= limit ? out : null; } catch (_) { return null; }
};
const parseJson = (value) => { try { return value ? JSON.parse(value) : null; } catch (_) { return null; } };

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS operational_commands (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, domain TEXT NOT NULL,
      action TEXT NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL, payload TEXT NOT NULL, result TEXT,
      requested_by TEXT NOT NULL DEFAULT '', attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_merchant_idempotency ON operational_commands (merchant, idempotency_key)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ops_merchant_domain_time ON operational_commands (merchant, domain, updated_ts DESC)'
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY, command_id TEXT NOT NULL, merchant TEXT NOT NULL,
      event TEXT NOT NULL, status TEXT NOT NULL, detail TEXT,
      created_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ops_events_command ON operational_events (merchant, command_id, created_ts)'
  ).run();
}

function providers(env) {
  return {
    email: !!(env && env.MAIL_WEBHOOK),
    whatsapp: !!(env && env.WHATSAPP_WEBHOOK),
    sms: !!(env && env.SMS_WEBHOOK),
    payment: !!(env && env.PAYMENT_LINK_WEBHOOK),
  };
}

function publicRow(row) {
  if (!row) return null;
  return {
    id: row.id, merchant: row.merchant, domain: row.domain, action: row.action,
    status: row.status, provider: row.provider || '',
    payload: parseJson(row.payload) || {}, result: parseJson(row.result),
    requestedBy: row.requested_by || '', attempts: Number(row.attempt_count || 0),
    lastError: row.last_error || '', createdAt: Number(row.created_ts || 0),
    updatedAt: Number(row.updated_ts || 0),
  };
}

/* Server-side authorization.
 *
 * assets/platform-kernel.js carries the same relation table for the browser and
 * says of itself that a front-end check "never replaces server authorization".
 * This is that server authorization — the same table, minus the localStorage
 * grant/deny document, which the client writes and therefore may not widen what
 * a caller is allowed to do here.  Roles this file does not know fall through to
 * `employee`, which can create nothing. */
const ROLE = {
  owner: ['*'], proprietaire: ['*'], operator: ['*'],
  manager: ['read:*', 'write:catalog', 'write:inventory', 'write:planning', 'write:customers',
    'write:orders', 'write:reservations', 'write:reports', 'action:refund', 'action:reprint', 'action:message'],
  caisse: ['read:catalog', 'read:inventory', 'read:customers', 'read:orders', 'read:device',
    'write:orders', 'write:customers', 'action:checkout', 'action:reprint'],
  serveur: ['read:tables', 'read:orders', 'read:planning', 'write:orders', 'action:request-bill'],
  kitchen: ['read:orders', 'write:order-status'],
  stock: ['read:catalog', 'read:inventory', 'write:inventory'],
  employee: ['read:planning'],
  /* A pairing cookie is a device, not a person.  It proves which counter the
     request came from and nothing else, so it may report its own health and
     nothing else — exactly what this endpoint allowed an unpaired-to-a-person
     till to do before roles existed. */
  till: ['read:device'],
};
ROLE.cashier = ROLE.caisse; ROLE.caissier = ROLE.caisse; ROLE.caissiere = ROLE.caisse;
ROLE.server = ROLE.serveur; ROLE.cuisinier = ROLE.kitchen; ROLE.magasinier = ROLE.stock;
ROLE.employe = ROLE.employee;

/* Same normalisation as normEmployeeRole in functions/auth/_lib.js: a job title
   typed as "Caissière" must land on the same row as "caisse". */
function normRole(value) {
  let text = String(value == null ? '' : value).trim().toLowerCase();
  try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return text.replace(/[’`´]/g, "'").replace(/\s+/g, ' ').slice(0, 40);
}

/* The permission a (domain, action) pair costs.  Mirror of needed() in
   assets/operations.js — if one side changes the other must change with it, or
   the dashboard offers a button the Worker answers with 403. */
function needed(domain, action) {
  if (domain === 'device' && action === 'heartbeat') return ['read', 'device'];
  if (domain === 'notification') return ['action', 'message'];
  if (domain === 'procurement') return ['write', 'inventory'];
  if (domain === 'payroll') return ['write', 'payroll'];
  if (domain === 'ai' && action === 'reprint') return ['action', 'reprint'];
  return ['write', domain];
}

function can(role, act, resource) {
  const rules = ROLE[normRole(role)] || ROLE.employee;
  const wanted = `${act}:${resource}`;
  return rules.some((rule) => rule === '*' || rule === wanted || rule === `${act}:*`);
}

/* tenantFor() has already proved the caller may act on this merchant.  actorFor
   answers the next question: as whom.  Cheapest identity first — the employee
   branch costs two D1 reads because the role lives on the live roster, not in
   the cookie. */
async function actorFor(request, env, merchant) {
  try {
    const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (session && session.aid) return { kind: 'owner', role: 'owner' };
  } catch (_) {}
  try { if (await isOperator(request, env)) return { kind: 'operator', role: 'operator' }; } catch (_) {}
  try {
    const staff = await activeEmployee(request, env, merchant);
    if (staff && staff.member) {
      return { kind: 'employee', role: normRole(staff.member.function || staff.member.department || 'employee') };
    }
  } catch (_) {}
  try { if (await isTillFor(request, env, merchant)) return { kind: 'till', role: 'till' }; } catch (_) {}
  return null;
}

async function mayCommand(request, env, merchant, domain, action) {
  const actor = await actorFor(request, env, merchant);
  if (!actor) return false;
  const check = needed(domain, action);
  return can(actor.role, check[0], check[1]);
}

async function event(env, command, name, status, detail) {
  const at = now();
  const id = `${command.id}:${at}:${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    `INSERT INTO operational_events (id, command_id, merchant, event, status, detail, created_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, command.id, command.merchant, clean(name, 48), clean(status, 32), safeJson(detail || {}, 4000), at).run();
}

async function update(env, command, status, provider, result, error) {
  const at = now();
  await env.DB.prepare(
    `UPDATE operational_commands SET status = ?, provider = ?, result = ?,
       last_error = ?, attempt_count = attempt_count + 1, updated_ts = ?
     WHERE id = ? AND merchant = ?`
  ).bind(status, provider || '', safeJson(result || {}, 12000), clean(error, 240), at, command.id, command.merchant).run();
  await event(env, command, 'state', status, { provider: provider || '', reason: error || '' });
  return Object.assign({}, command, { status, provider: provider || '', result: safeJson(result || {}, 12000), last_error: clean(error, 240), updated_ts: at, attempt_count: Number(command.attempt_count || 0) + 1 });
}

async function postWebhook(url, body) {
  if (!url) return { ok: false, reason: 'provider-unconfigured' };
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {}; try { data = await response.json(); } catch (_) {}
    return response.ok ? { ok: true, data } : { ok: false, reason: `provider-http-${response.status}` };
  } catch (_) { return { ok: false, reason: 'provider-network' }; }
}

function notificationProvider(action, payload) {
  if (action === 'send-email') return 'email';
  if (action === 'send-sms') return 'sms';
  if (action === 'send-whatsapp') return 'whatsapp';
  const channel = clean(payload && payload.channel, 20).toLowerCase();
  return ['email', 'sms', 'whatsapp'].includes(channel) ? channel : '';
}

async function execute(env, row, payload) {
  if (row.domain === 'device' && row.action === 'heartbeat') {
    return update(env, row, 'completed', 'kiwi-device', { recorded: true }, '');
  }
  if (row.domain === 'notification') {
    const provider = notificationProvider(row.action, payload);
    if (!provider) return update(env, row, 'blocked', '', {}, 'channel-required');
    let delivered;
    if (provider === 'email') {
      delivered = await sendMail(env, { to: payload.to, subject: payload.subject || 'Kiwi', text: payload.text || '' });
    } else {
      const endpoint = provider === 'sms' ? env.SMS_WEBHOOK : env.WHATSAPP_WEBHOOK;
      delivered = await postWebhook(endpoint, {
        kind: provider, to: clean(payload.to, 120), text: clean(payload.text, 4000),
        reference: clean(payload.reference, 120), merchant: row.merchant, commandId: row.id,
      });
    }
    return delivered && delivered.ok
      ? update(env, row, 'sent', provider, { delivered: true }, '')
      : update(env, row, 'blocked', provider, {}, delivered && delivered.reason || 'delivery-failed');
  }
  if (row.domain === 'payment' && row.action === 'create-link') {
    const amount = Number(payload.amount);
    if (!(amount > 0 && amount <= 10000000)) return update(env, row, 'failed', 'payment-link', {}, 'invalid-amount');
    const delivered = await postWebhook(env.PAYMENT_LINK_WEBHOOK, {
      kind: 'payment-link', merchant: row.merchant, commandId: row.id,
      amount: Math.round(amount * 100) / 100, currency: clean(payload.currency || 'MAD', 3).toUpperCase(),
      description: clean(payload.description, 240), customer: clean(payload.customer, 160),
      expiresAt: Number(payload.expiresAt || 0) || null,
    });
    const url = delivered && delivered.data && clean(delivered.data.url, 800);
    if (!delivered.ok) return update(env, row, 'blocked', 'payment-link', {}, delivered.reason || 'provider-failed');
    if (!/^https:\/\//.test(url)) return update(env, row, 'failed', 'payment-link', {}, 'provider-returned-no-link');
    return update(env, row, 'active', 'payment-link', { url, reference: clean(delivered.data.reference, 160) }, '');
  }
  if (row.domain === 'device' && row.action === 'test-print') {
    return update(env, row, 'pending-approval', 'local-device', { instruction: 'execute-on-requesting-device' }, '');
  }
  if (row.domain === 'ai') {
    return update(env, row, 'pending-approval', 'kiwi-confirmation', { readOnly: true }, '');
  }
  const initial = row.action.startsWith('export-') || row.action.startsWith('prepare-') ? 'prepared' : 'draft';
  return update(env, row, initial, 'kiwi-workflow', { persisted: true }, '');
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  /* Command payloads can contain customer contacts, payment references and
     payroll metadata.  A paired register may report health but must never be
     able to enumerate the merchant's operational ledger — and neither may a
     manager, who is kept out of salary figures everywhere else in the product.
     Deliberately narrower than the per-command permissions below. */
  const reader = await actorFor(request, env, merchant);
  if (!reader || (reader.kind !== 'owner' && reader.kind !== 'operator')) {
    return json({ error: 'owner-session-required' }, 403);
  }
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }
  const domain = clean(url.searchParams.get('domain'), 32);
  const status = clean(url.searchParams.get('status'), 32);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
  const filters = ['merchant = ?']; const values = [merchant];
  if (domain) { filters.push('domain = ?'); values.push(domain); }
  if (status) { filters.push('status = ?'); values.push(status); }
  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM operational_commands WHERE ${filters.join(' AND ')} ORDER BY updated_ts DESC LIMIT ?`
    ).bind(...values, limit).all();
    return json({ merchant, providers: providers(env), commands: (rows.results || []).map(publicRow) });
  } catch (_) { return json({ error: 'db' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }

  if (body && body.commandId && body.transition) {
    const id = clean(body.commandId, 128), wanted = clean(body.transition, 32);
    const row = await env.DB.prepare('SELECT * FROM operational_commands WHERE id = ? AND merchant = ?').bind(id, merchant).first();
    if (!row) return json({ error: 'not-found' }, 404);
    /* Moving a command through its lifecycle costs the same permission as
       creating it.  A paired till may write its own device heartbeat, but it may
       not approve, cancel or complete a purchase order: state transitions are
       management actions and must never be authorized by possession of a
       pairing cookie alone. */
    if (!(await mayCommand(request, env, merchant, row.domain, row.action))) {
      return json({ error: 'permission-denied', domain: row.domain, action: row.action }, 403);
    }
    if (!(TRANSITIONS[row.status] && TRANSITIONS[row.status].has(wanted))) return json({ error: 'invalid-transition', status: row.status }, 409);
    if (['approved', 'cancelled', 'completed'].includes(wanted) && body.confirmed !== true) return json({ error: 'confirmation-required' }, 409);
    const changed = await update(env, row, wanted, row.provider, parseJson(row.result) || {}, '');
    return json({ ok: true, command: publicRow(changed) });
  }

  const domain = clean(body && body.domain, 32).toLowerCase();
  const action = clean(body && body.action, 48).toLowerCase();
  const id = clean(body && body.id, 128);
  const idem = clean(body && body.idempotencyKey, 128);
  const payloadJson = safeJson(body && body.payload, 24000);
  if (!ACTIONS[domain] || !ACTIONS[domain].has(action)) return json({ error: 'unsupported-action' }, 400);
  /* Every command costs a named permission, resolved from the caller's real
     role on this merchant.  A till reports its own heartbeat and nothing else;
     purchasing, payroll, accounting, notifications, payment links and agent
     actions each need the matching grant.  Knowing a pairing cookie is never
     enough to create financial documents or contact arbitrary people. */
  if (!(await mayCommand(request, env, merchant, domain, action))) {
    return json({ error: 'permission-denied', domain, action }, 403);
  }
  if (!idOk(id) || !idOk(idem) || !payloadJson) return json({ error: 'invalid-command' }, 400);
  if (CONFIRM.has(`${domain}:${action}`) && body.confirmed !== true) return json({ error: 'confirmation-required' }, 409);

  const duplicate = await env.DB.prepare(
    'SELECT * FROM operational_commands WHERE merchant = ? AND idempotency_key = ?'
  ).bind(merchant, idem).first();
  if (duplicate) return json({ ok: true, duplicate: true, command: publicRow(duplicate), providers: providers(env) });

  const at = now();
  const row = {
    id, merchant, domain, action, status: 'queued', provider: '', idempotency_key: idem,
    payload: payloadJson, result: null, requested_by: clean(body.requestedBy, 100),
    attempt_count: 0, last_error: '', created_ts: at, updated_ts: at,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO operational_commands
       (id, merchant, domain, action, status, provider, idempotency_key, payload,
        result, requested_by, attempt_count, last_error, created_ts, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.id, merchant, domain, action, row.status, '', idem, payloadJson, null,
      row.requested_by, 0, '', at, at).run();
    await event(env, row, 'created', 'queued', { domain, action });
    const finished = await execute(env, row, body.payload || {});
    return json({ ok: true, duplicate: false, command: publicRow(finished), providers: providers(env) });
  } catch (_) {
    const race = await env.DB.prepare('SELECT * FROM operational_commands WHERE merchant = ? AND idempotency_key = ?').bind(merchant, idem).first();
    if (race) return json({ ok: true, duplicate: true, command: publicRow(race), providers: providers(env) });
    return json({ error: 'db' }, 503);
  }
}
