// /api/store-credits — server-authoritative Maison store-credit ledger.
//
// Credits are liabilities, not browser preferences.  Issuance and redemption
// therefore live in D1, are tenant scoped and append an immutable event.  The
// request id is the idempotency key: retries cannot issue or spend twice.

import {
  activeEmployee, entitledMerchant, isOperator, json, readCookie, readSession,
  SESS_COOKIE, storeOwner,
} from '../auth/_lib.js';
import { storeSubscriptionPending, storeSuspended } from './_private.js';
import { poke } from './_live.js';

const MAX_CENTS = 20000000;
const clean = (value, max = 120) => String(value == null ? '' : value).trim().slice(0, max);
const cleanId = (value, max = 96) => clean(value, max).replace(/[^A-Za-z0-9:._-]/g, '');
const amount = (value) => {
  const n = Math.round(Number(value));
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_CENTS ? n : 0;
};
const now = () => Date.now();

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS store_credits (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, code TEXT NOT NULL,
      customer_id TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL DEFAULT '',
      original_sale_id TEXT NOT NULL DEFAULT '', original_ref TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL, balance_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', expires_ts INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '', issued_by TEXT NOT NULL DEFAULT '',
      last_event_id TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_store_credit_code ON store_credits (merchant, code)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_store_credit_customer ON store_credits (merchant, customer_id, updated_ts DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_store_credit_sale ON store_credits (merchant, original_sale_id)').run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS store_credit_events (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, credit_id TEXT NOT NULL,
      code TEXT NOT NULL, action TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL, ref_id TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_store_credit_events_credit ON store_credit_events (merchant, credit_id, ts)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_store_credit_events_sale ON store_credit_events (merchant, ref_id, action)').run();
}

async function actorName(request, env, merchant) {
  try {
    const employee = await activeEmployee(request, env, merchant);
    const member = employee && employee.member;
    const name = clean(member && (member.name || [member.firstName, member.lastName].filter(Boolean).join(' ')), 100);
    if (name) return name;
  } catch (_) {}
  return 'Caisse';
}

async function mayCancelCredit(request, env, merchant) {
  try { if (await isOperator(request, env)) return true; } catch (_) {}
  try {
    const session = await readSession(readCookie(request, SESS_COOKIE), env && env.AUTH_SECRET);
    if (session && session.aid && await storeOwner(env, merchant) === session.aid) return true;
  } catch (_) {}
  try {
    const employee = await activeEmployee(request, env, merchant);
    const member = employee && employee.member;
    const role = clean(member && (member.function || member.role || member.title), 80)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /proprietaire|owner|gerant|manager|responsable|admin/.test(role);
  } catch (_) { return false; }
}

function view(row) {
  return {
    id: clean(row.id, 96), code: clean(row.code, 40), customerId: clean(row.customer_id, 96),
    customerName: clean(row.customer_name, 120), originalSaleId: clean(row.original_sale_id, 96),
    originalRef: clean(row.original_ref, 40), amountCents: Number(row.amount_cents || 0),
    balanceCents: Number(row.balance_cents || 0), status: clean(row.status, 20),
    expiresAt: Number(row.expires_ts || 0), reason: clean(row.reason, 160),
    issuedBy: clean(row.issued_by, 100), createdAt: Number(row.created_ts || 0),
    updatedAt: Number(row.updated_ts || 0),
  };
}

function generatedCode() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `AV-${bytes[0].toString(36).toUpperCase().padStart(7, '0')}${bytes[1].toString(36).toUpperCase().padStart(7, '0')}`;
}

async function merchantFor(request, env, asked) {
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true, allowEmployee: true });
  return merchant && merchant === asked ? merchant : '';
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const asked = clean(url.searchParams.get('merchant'), 64);
  const merchant = await merchantFor(request, env, asked);
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  await ensureSchema(env);
  const code = clean(url.searchParams.get('code'), 40);
  const customerId = cleanId(url.searchParams.get('customerId'), 96);
  const active = url.searchParams.get('active') === '1';
  const clauses = ['merchant = ?']; const binds = [merchant];
  if (code) { clauses.push('code = ?'); binds.push(code); }
  if (customerId) { clauses.push('customer_id = ?'); binds.push(customerId); }
  if (active) { clauses.push("status = 'active' AND balance_cents > 0 AND expires_ts >= ?"); binds.push(now()); }
  const rows = await env.DB.prepare(
    `SELECT * FROM store_credits WHERE ${clauses.join(' AND ')} ORDER BY updated_ts DESC LIMIT 500`
  ).bind(...binds).all();
  return json({ merchant, credits: ((rows && rows.results) || []).map(view) });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = clean(body && body.merchant, 64);
  const merchant = await merchantFor(request, env, asked);
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  if (await storeSuspended(env, merchant)) return json({ error: 'store-suspended' }, 423);
  if (await storeSubscriptionPending(env, merchant)) return json({ error: 'subscription-required' }, 402);
  await ensureSchema(env);

  const action = clean(body && body.action, 20);
  const requestId = cleanId(body && body.id, 96);
  const cents = amount(body && body.amountCents);
  if (!requestId || !['issue', 'redeem', 'redeem-batch', 'cancel'].includes(action)) return json({ error: 'invalid-request' }, 400);
  if (action === 'cancel' && !await mayCancelCredit(request, env, merchant)) return json({ error: 'manager-required' }, 403);
  if (action !== 'cancel' && action !== 'redeem-batch' && !cents) return json({ error: 'bad-amount' }, 400);
  const eventId = `${requestId}:${action}`;
  const at = now();
  const actor = await actorName(request, env, merchant);

  const prior = action === 'redeem-batch' ? null
    : await env.DB.prepare('SELECT * FROM store_credit_events WHERE merchant = ? AND id = ?').bind(merchant, eventId).first();
  if (prior) {
    if (action !== 'cancel' && Number(prior.amount_cents) !== cents) return json({ error: 'idempotency-conflict' }, 409);
    const credit = await env.DB.prepare('SELECT * FROM store_credits WHERE merchant = ? AND id = ?').bind(merchant, prior.credit_id).first();
    return credit ? json({ ok: true, replay: true, credit: view(credit) }) : json({ error: 'ledger-incomplete' }, 503);
  }

  if (action === 'issue') {
    const originalSaleId = cleanId(body && body.originalSaleId, 96);
    if (!originalSaleId) return json({ error: 'sale-required' }, 400);
    const customerId = cleanId(body && body.customerId, 96);
    const customerName = clean(body && body.customerName, 120) || 'Porteur du bon';
    const reason = clean(body && body.reason, 160) || 'Retour';
    const originalRef = clean(body && body.originalRef, 40);
    const detail = JSON.stringify({ lines: Array.isArray(body && body.lines) ? body.lines.slice(0, 40) : [], resellable: body && body.resellable !== false }).slice(0, 12000);
    const expiresAt = Math.min(at + 730 * 86400000, Math.max(at + 86400000, Number(body && body.expiresAt) || at + 182 * 86400000));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = generatedCode();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO store_credits
             (id, merchant, code, customer_id, customer_name, original_sale_id, original_ref,
              amount_cents, balance_cents, status, expires_ts, reason, issued_by,
              last_event_id, created_ts, updated_ts)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?
             FROM sales s
            WHERE s.merchant = ? AND s.id = ? AND s.void_ts IS NULL
              AND ? <= COALESCE(s.amount_cents, s.amount * 100) - COALESCE((
                SELECT SUM(e.amount_cents) FROM store_credit_events e
                 WHERE e.merchant = ? AND e.ref_id = ? AND e.action = 'issue'
              ), 0)`
        ).bind(requestId, merchant, code, customerId, customerName, originalSaleId, originalRef,
          cents, cents, expiresAt, reason, actor, eventId, at, at,
          merchant, originalSaleId, cents, merchant, originalSaleId),
        env.DB.prepare(
          `INSERT OR IGNORE INTO store_credit_events
             (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
           SELECT ?, ?, id, code, 'issue', ?, balance_cents, original_sale_id, ?, ?, ?
             FROM store_credits WHERE merchant = ? AND id = ? AND last_event_id = ?`
        ).bind(eventId, merchant, cents, actor, detail, at, merchant, requestId, eventId),
      ]);
      const credit = await env.DB.prepare('SELECT * FROM store_credits WHERE merchant = ? AND id = ?').bind(merchant, requestId).first();
      if (credit) {
        try { await poke(env, merchant, 'store-credit-issued'); } catch (_) {}
        return json({ ok: true, credit: view(credit) });
      }
    }
    return json({ error: 'sale-credit-exceeds-available' }, 409);
  }

  if (action === 'redeem-batch') {
    const entries = Array.isArray(body && body.credits) ? body.credits.slice(0, 10).map((entry, index) => ({
      code: clean(entry && entry.code, 40), amountCents: amount(entry && entry.amountCents),
      eventId: `${requestId}:redeem:${index}`,
    })) : [];
    if (!entries.length || entries.some((entry) => !entry.code || !entry.amountCents)
        || new Set(entries.map((entry) => entry.code)).size !== entries.length) {
      return json({ error: 'invalid-credits' }, 400);
    }
    const existingEvents = await env.DB.prepare(
      `SELECT id, code, amount_cents FROM store_credit_events WHERE merchant = ? AND id IN (${entries.map(() => '?').join(',')})`
    ).bind(merchant, ...entries.map((entry) => entry.eventId)).all();
    const existing = (existingEvents && existingEvents.results) || [];
    if (existing.length) {
      const exactReplay = existing.length === entries.length && entries.every((entry) => existing.some((event) =>
        event.id === entry.eventId && event.code === entry.code && Number(event.amount_cents) === entry.amountCents));
      if (!exactReplay) return json({ error: 'idempotency-conflict' }, 409);
      const rows = await env.DB.prepare(
        `SELECT * FROM store_credits WHERE merchant = ? AND code IN (${entries.map(() => '?').join(',')})`
      ).bind(merchant, ...entries.map((entry) => entry.code)).all();
      return json({ ok: true, replay: true, credits: ((rows && rows.results) || []).map(view) });
    }

    const amountCase = `CASE code ${entries.map(() => 'WHEN ? THEN ?').join(' ')} ELSE 0 END`;
    const eventCase = `CASE code ${entries.map(() => 'WHEN ? THEN ?').join(' ')} ELSE last_event_id END`;
    const eligibility = entries.map(() => "(code = ? AND status = 'active' AND expires_ts >= ? AND balance_cents >= ?)").join(' OR ');
    const ids = entries.map(() => '?').join(',');
    const amountBinds = entries.flatMap((entry) => [entry.code, entry.amountCents]);
    const eventBinds = entries.flatMap((entry) => [entry.code, entry.eventId]);
    const eligibleBinds = entries.flatMap((entry) => [entry.code, at, entry.amountCents]);
    const statements = [env.DB.prepare(
      `UPDATE store_credits
          SET balance_cents = balance_cents - ${amountCase},
              status = CASE WHEN balance_cents - ${amountCase} = 0 THEN 'consumed' ELSE 'active' END,
              last_event_id = ${eventCase}, updated_ts = ?
        WHERE merchant = ? AND code IN (${ids})
          AND (SELECT COUNT(*) FROM store_credits WHERE merchant = ? AND (${eligibility})) = ?
          AND NOT EXISTS (SELECT 1 FROM store_credit_events WHERE merchant = ? AND id IN (${ids}))`
    ).bind(...amountBinds, ...amountBinds, ...eventBinds, at, merchant,
      ...entries.map((entry) => entry.code), merchant, ...eligibleBinds, entries.length,
      merchant, ...entries.map((entry) => entry.eventId))];
    entries.forEach((entry) => {
      statements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO store_credit_events
           (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
         SELECT ?, ?, id, code, 'redeem', ?, balance_cents, ?, ?, ?, ?
           FROM store_credits WHERE merchant = ? AND code = ? AND last_event_id = ?`
      ).bind(entry.eventId, merchant, entry.amountCents, cleanId(body && body.saleId, 96), actor,
        clean(body && body.detail, 500), at, merchant, entry.code, entry.eventId));
    });
    await env.DB.batch(statements);
    const events = await env.DB.prepare(
      `SELECT id FROM store_credit_events WHERE merchant = ? AND id IN (${entries.map(() => '?').join(',')})`
    ).bind(merchant, ...entries.map((entry) => entry.eventId)).all();
    if (((events && events.results) || []).length !== entries.length) return json({ error: 'credit-batch-refused' }, 409);
    const rows = await env.DB.prepare(
      `SELECT * FROM store_credits WHERE merchant = ? AND code IN (${entries.map(() => '?').join(',')})`
    ).bind(merchant, ...entries.map((entry) => entry.code)).all();
    try { await poke(env, merchant, 'store-credit-redeemed'); } catch (_) {}
    return json({ ok: true, credits: ((rows && rows.results) || []).map(view) });
  }

  const code = clean(body && body.code, 40);
  if (!code) return json({ error: 'code-required' }, 400);
  const credit = await env.DB.prepare('SELECT * FROM store_credits WHERE merchant = ? AND code = ?').bind(merchant, code).first();
  if (!credit) return json({ error: 'credit-not-found' }, 404);
  if (action === 'redeem') {
    const detail = clean(body && body.detail, 500);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE store_credits
            SET balance_cents = balance_cents - ?,
                status = CASE WHEN balance_cents - ? = 0 THEN 'consumed' ELSE 'active' END,
                last_event_id = ?, updated_ts = ?
          WHERE merchant = ? AND code = ? AND status = 'active' AND expires_ts >= ?
            AND balance_cents >= ?
            AND NOT EXISTS (SELECT 1 FROM store_credit_events WHERE merchant = ? AND id = ?)`
      ).bind(cents, cents, eventId, at, merchant, code, at, cents, merchant, eventId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO store_credit_events
           (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
         SELECT ?, ?, id, code, 'redeem', ?, balance_cents, ?, ?, ?, ?
           FROM store_credits WHERE merchant = ? AND code = ? AND last_event_id = ?`
      ).bind(eventId, merchant, cents, cleanId(body && body.saleId, 96), actor, detail, at, merchant, code, eventId),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE store_credits SET balance_cents = 0, status = 'cancelled', last_event_id = ?, updated_ts = ?
          WHERE merchant = ? AND code = ? AND status = 'active'
            AND NOT EXISTS (SELECT 1 FROM store_credit_events WHERE merchant = ? AND id = ?)`
      ).bind(eventId, at, merchant, code, merchant, eventId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO store_credit_events
           (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
         SELECT ?, ?, id, code, 'cancel', ?, 0, ?, ?, ?, ?
           FROM store_credits WHERE merchant = ? AND code = ? AND last_event_id = ?`
      ).bind(eventId, merchant, Number(credit.balance_cents || 0), cleanId(body && body.refId, 96), actor,
        clean(body && body.reason, 500), at, merchant, code, eventId),
    ]);
  }
  const event = await env.DB.prepare('SELECT * FROM store_credit_events WHERE merchant = ? AND id = ?').bind(merchant, eventId).first();
  const saved = await env.DB.prepare('SELECT * FROM store_credits WHERE merchant = ? AND code = ?').bind(merchant, code).first();
  if (!event || !saved) {
    const reason = Number(credit.expires_ts) < at ? 'credit-expired'
      : credit.status !== 'active' ? `credit-${credit.status}` : 'insufficient-balance';
    return json({ error: reason }, 409);
  }
  try { await poke(env, merchant, action === 'redeem' ? 'store-credit-redeemed' : 'store-credit-cancelled'); } catch (_) {}
  return json({ ok: true, credit: view(saved) });
}
