// /api/operations — durable, tenant-scoped operational commands.
//
// This is Kiwi's small orchestration boundary.  It deliberately does not copy
// Novu, Medusa, OpenFGA or ERPNext into a no-build application; it borrows the
// useful invariants: stable command IDs, explicit lifecycle states, provider
// capabilities, confirmation for risky work and an append-only audit trail.
// A missing provider is a BLOCKED command, never a green "sent" toast.

import {
  json, sendMail, readSession, readCookie, SESS_COOKIE, isOperator,
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

async function privileged(request, env) {
  try {
    const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (session && session.aid) return true;
  } catch (_) {}
  try { return !!(await isOperator(request, env)); } catch (_) { return false; }
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
     able to enumerate the merchant's operational ledger. */
  if (!(await privileged(request, env))) return json({ error: 'owner-session-required' }, 403);
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
    /* A paired till may write its own device heartbeat/receipt, but it may not
       approve, cancel or complete a durable command.  State transitions are
       management actions and must never be authorized by possession of a
       pairing cookie alone. */
    if (!(await privileged(request, env))) return json({ error: 'owner-session-required' }, 403);
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
  /* A paired till can report its own heartbeat. Purchasing, payroll,
     accounting, notifications, payment links and agent actions require an
     account/operator session; knowing a till pairing cookie is never enough to
     create financial documents or contact arbitrary people. */
  if (!(await privileged(request, env)) && !(domain === 'device' && action === 'heartbeat')) {
    return json({ error: 'owner-session-required' }, 403);
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
