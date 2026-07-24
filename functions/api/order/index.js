// /api/order — the PUBLIC half of the order relay (a customer's phone).
//
//   POST { merchant, mode, table, total, lines }  → { ok, id, number }
//   GET  ?merchant=slug&id=ord-…                  → { ok, status, number }
//
// This is the one write a device with no account is allowed to make, so it is
// deliberately narrow. Compare with queue.js, which does the reading and the
// deciding and is staff-gated behind the normal site gate.
//
// ── Why this is public ───────────────────────────────────────────────────────
// The guest tapped an NFC tag; they have no session and no passcode. The gate
// (functions/_middleware.js) carves out this EXACT path — not the /api/order/
// prefix, so /api/order/queue stays protected. The capability is the merchant
// slug in the tag's URL, the same model as /api/pair/redeem's 6-digit code.
//
// ── What a stranger with a slug can and cannot do ────────────────────────────
// CAN: place an order at that store (a stranger can also walk in and order), and
//      read back the status of an order ID they were given.
// CANNOT: list orders, see anyone else's order, see totals or items for an ID
//      they don't hold, accept anything, or touch another merchant.
// The GET therefore returns ONLY { status, number } — never lines or totals.
//
// Abuse is bounded rather than trusted: OrderPro must be switched ON for the
// merchant, the payload is capped, and a merchant's pending queue is capped, so
// a flood fills one store's queue with rejects instead of the database.

import { json } from '../../auth/_lib.js';

const MAX_LINES = 60;              // one order, generously
const MAX_TOTAL = 200000;          // 200 000 MAD — a sanity ceiling, not a rule
const MAX_PENDING = 60;            // per merchant: a queue no staff could ever work through
const ORDER_ID = /^ord-[a-z0-9-]{6,48}$/;

function startOfDay(now) {
  // Ticket numbers restart each day. Morocco is UTC+1 year-round, so the day
  // boundary is computed at +1h — a 00:30 order belongs to the new day, not
  // yesterday's numbering.
  const shifted = now + 3600000;
  return Math.floor(shifted / 86400000) * 86400000 - 3600000;
}

async function orderProEnabled(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT features FROM merchant_config WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row || !row.features) return false;
    return (JSON.parse(row.features) || {}).orderpro === true;
  } catch (_) { return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = String((b && b.merchant) || '').trim().toLowerCase().slice(0, 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!(await orderProEnabled(env, merchant))) return json({ error: 'orderpro-off' }, 403);

  const mode = b.mode === 'takeout' ? 'takeout' : 'table';
  const table = mode === 'table' ? String(b.table || '').replace(/\D/g, '').slice(0, 4) : '';
  const total = Math.round(Number(b.total) || 0);
  if (total <= 0 || total > MAX_TOTAL) return json({ error: 'bad-total' }, 400);

  const rawLines = Array.isArray(b.lines) ? b.lines : [];
  if (!rawLines.length) return json({ error: 'empty-order' }, 400);
  if (rawLines.length > MAX_LINES) return json({ error: 'too-many-lines' }, 400);

  const lines = rawLines.map((l) => ({
    id: String((l && l.id) || '').slice(0, 40),
    name: String((l && l.name) || '').slice(0, 80),
    qty: Math.min(99, Math.max(1, Math.round(Number(l && l.qty) || 1))),
    unitPrice: Math.max(0, Math.round(Number(l && l.unitPrice) || 0)),
    options: String((l && l.options) || '').slice(0, 200),
    note: String((l && l.note) || '').slice(0, 200),
  }));

  // A queue nobody could work through is an attack, not a rush.
  try {
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND status = 'pending'"
    ).bind(merchant).first();
    if (pending && pending.n >= MAX_PENDING) return json({ error: 'queue-full' }, 429);
  } catch (_) { /* table not migrated yet → the insert below reports it */ }

  const now = Date.now();
  const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);

  // The ticket number is assigned INSIDE the insert: one statement, so two
  // phones ordering in the same second can never be handed the same number.
  let row;
  try {
    row = await env.DB.prepare(
      `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts)
       SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, ?, ?, ?, 'pending', ?, ?
         FROM orders WHERE merchant = ? AND created_ts >= ?
       RETURNING number`
    ).bind(
      id, merchant, mode, table, total, JSON.stringify(lines), now, now,
      merchant, startOfDay(now)
    ).first();
  } catch (e) {
    return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
  }

  return json({ ok: true, id, number: (row && row.number) || 1 });
}

// Status of ONE order the caller already holds the id for. Intentionally the
// thinnest possible answer: no items, no total, no other order.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const id = (url.searchParams.get('id') || '').trim();
  if (!merchant || !id) return json({ error: 'bad-request' }, 400);
  if (!ORDER_ID.test(id)) return json({ error: 'bad-request' }, 400);
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let row = null;
  try {
    // merchant is part of the WHERE, so an id guessed for store A can't be read
    // through store B's slug.
    row = await env.DB.prepare(
      'SELECT status, number FROM orders WHERE id = ? AND merchant = ?'
    ).bind(id, merchant).first();
  } catch (_) { /* table missing → not found */ }

  if (!row) return json({ error: 'not-found' }, 404);
  return json({ ok: true, status: row.status, number: row.number });
}
