// /api/order/queue — the STAFF half of the order relay (the caisse).
//
//   GET  ?merchant=slug&since=<ts>        → { ok, orders:[…], now }
//   POST { merchant, id, status }         → { ok, id, status }
//
// NOT public. This path is deliberately left OUT of the gate's OrderPro
// carve-out (which matches /api/order exactly, not the prefix), so reaching it
// requires the same credentials as the rest of the site — in practice the
// caisse's kiwi_gate staff cookie, exactly like /api/sale.
//
// This is where the human decision lives. An order arrives as `pending` and
// STAYS pending until staff accept it; only then is it a kitchen ticket. Nothing
// here is automatic — no auto-accept, no timeout that promotes an order. If the
// till is busy the customer sees "waiting for the till", which is the truth.
//
// Status flow:  pending → accepted → ready
//                   └──→ rejected            (staff declined; terminal)

import { json } from '../../auth/_lib.js';

const NEXT = { accepted: 1, ready: 1, rejected: 1 };
const ORDER_ID = /^ord-[a-z0-9-]{6,48}$/;
const MAX_ROWS = 100;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  // `since` is the caisse's cursor: it polls for anything that changed after the
  // last answer, so a long shift costs one small response per poll.
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const now = Date.now();

  let rows = { results: [] };
  try {
    rows = await env.DB.prepare(
      `SELECT id, number, mode, table_no, total, lines, status, created_ts, updated_ts
         FROM orders
        WHERE merchant = ? AND updated_ts > ? AND status IN ('pending','accepted','ready')
        ORDER BY created_ts
        LIMIT ?`
    ).bind(merchant, since, MAX_ROWS).all();
  } catch (_) {
    // Table not migrated yet → an empty queue, never an error the till has to
    // handle. The caisse keeps polling and lights up when the partner deploys.
    return json({ ok: true, orders: [], now });
  }

  const orders = (rows.results || []).map((r) => {
    let lines = [];
    try { lines = JSON.parse(r.lines) || []; } catch (_) { lines = []; }
    return {
      id: r.id, number: r.number, mode: r.mode, table: r.table_no || '',
      total: r.total, lines, status: r.status,
      created_ts: r.created_ts, updated_ts: r.updated_ts,
    };
  });
  return json({ ok: true, orders, now });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = String((b && b.merchant) || '').trim().toLowerCase().slice(0, 64);
  const id = String((b && b.id) || '').trim();
  const status = String((b && b.status) || '').trim();
  if (!merchant || !ORDER_ID.test(id)) return json({ error: 'bad-request' }, 400);
  if (!NEXT[status]) return json({ error: 'bad-status' }, 400);

  const now = Date.now();
  let row;
  try {
    // merchant in the WHERE keeps one store from touching another's tickets,
    // and RETURNING tells us whether the row really existed.
    row = await env.DB.prepare(
      `UPDATE orders SET status = ?, updated_ts = ?
        WHERE id = ? AND merchant = ?
        RETURNING id, status, number`
    ).bind(status, now, id, merchant).first();
  } catch (e) {
    return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
  }
  if (!row) return json({ error: 'not-found' }, 404);
  return json({ ok: true, id: row.id, status: row.status, number: row.number });
}
