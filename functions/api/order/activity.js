// Read-only, tenant-scoped operations history. These are recorded events, not
// synthetic receipts. Legacy closures have a source, but no reliable actor name.
import { entitledMerchant, json } from '../../auth/_lib.js';

function lines(raw) {
  try {
    const rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(rows) ? rows.slice(0, 250).map(l => ({
      name: String(l.name ?? l.n ?? '').slice(0, 160),
      qty: Number(l.qty ?? l.q) || 0,
      total: Number(l.total ?? l.t ?? ((Number(l.unitPrice) || 0) * (Number(l.qty) || 0))) || 0,
    })) : [];
  } catch (_) { return []; }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked);
  if (!merchant || merchant !== asked) return json({ error: 'forbidden-merchant' }, 403);
  if (!env?.DB) return json({ error: 'activity-unavailable' }, 503);
  const from = Number(url.searchParams.get('from'));
  const to = Number(url.searchParams.get('to'));
  const before = Number(url.searchParams.get('before') || to);
  const beforeId = url.searchParams.get('beforeId') || '\uffff';
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(to) || to <= from ||
      to - from > 32 * 86400000 || !Number.isSafeInteger(before) || before > to || before < from || beforeId.length > 150) {
    return json({ error: 'invalid-window' }, 400);
  }
  try {
    // Keyset pagination prevents same-millisecond events disappearing at a page
    // boundary. Every branch and every join has its own merchant constraint.
    const rs = await env.DB.prepare(`
      SELECT * FROM (
        SELECT 'audit:' || a.id AS eventId, a.action AS kind, a.ts,
          a.sale_id AS saleId, a.note AS note, a.actor, a.actor_id AS actorId,
          a.reason, a.method, a.ref, s.ref AS originalRef, s.label,
          COALESCE(a.amount_cents, ROUND(a.amount * 100)) AS amountCents,
          s.lines, '' AS sessionId, '' AS tableNo, '' AS source
        FROM sale_audit a LEFT JOIN sales s ON s.id = a.sale_id AND s.merchant = a.merchant
        WHERE a.merchant = ? AND a.action IN ('void', 'restore', 'refund') AND a.ts >= ? AND a.ts < ?
        UNION ALL
        SELECT 'session:' || s.id,
          CASE WHEN s.mode = 'takeout' AND s.closed_by IN ('served', 'takeout-handover')
            THEN 'takeout-handover' ELSE 'closure' END,
          s.closed_ts, '', '', s.closed_actor_name, s.closed_actor_id,
          s.closed_by, '', '', '', '', 0, NULL, s.id, s.table_no, s.closed_by
        FROM table_sessions s
        WHERE s.merchant = ? AND s.status = 'closed' AND s.closed_ts >= ? AND s.closed_ts < ?
          AND s.closed_by IS NOT NULL AND s.closed_by NOT IN ('settle', 'service-payment', '')
        UNION ALL
        SELECT 'order:' || o.id, 'order-cancel', o.cancel_ts, o.id, '', o.cancel_actor_name, o.cancel_actor_id,
          'order-cancelled', '', CAST(o.number AS TEXT), '', '', ROUND(o.total * 100), o.lines, o.session_id, o.table_no, 'caisse'
        FROM orders o WHERE o.merchant = ? AND o.status = 'rejected' AND o.cancel_ts >= ? AND o.cancel_ts < ?
      ) WHERE ts < ? OR (ts = ? AND eventId < ?)
      ORDER BY ts DESC, eventId DESC LIMIT 101
    `).bind(merchant, from, to, merchant, from, to, merchant, from, to, before, before, beforeId).all();
    const rows = rs.results || [];
    const page = rows.slice(0, 100);
    const sessions = page.filter(r => r.kind === 'closure' || r.kind === 'takeout-handover').map(r => r.sessionId);
    const bySession = new Map();
    for (let i = 0; i < sessions.length; i += 80) {
      const ids = sessions.slice(i, i + 80);
      const orders = await env.DB.prepare(`SELECT * FROM (
        SELECT id, number, total, lines, session_id,
          ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_ts, id) AS rn
        FROM orders WHERE merchant = ? AND session_id IN (${ids.map(() => '?').join(',')})
      ) WHERE rn <= 251 ORDER BY session_id, rn`).bind(merchant, ...ids).all();
      for (const order of orders.results || []) {
        if (!bySession.has(order.session_id)) bySession.set(order.session_id, []);
        bySession.get(order.session_id).push(order);
      }
    }
    const events = [];
    for (const row of page) {
      const event = { ...row, lines: lines(row.lines), amountCents: Number(row.amountCents) || 0 };
      if (row.kind === 'closure' || row.kind === 'takeout-handover') {
        const detail = bySession.get(row.sessionId) || [];
        event.detailsTruncated = detail.length > 250;
        event.orders = detail.slice(0, 250).map(o => ({ id: o.id, number: o.number, total: o.total, lines: lines(o.lines) }));
        event.orderAmountCents = event.orders.reduce((sum, o) => sum + Math.round(Number(o.total || 0) * 100), 0);
        event.lines = event.orders.flatMap(o => o.lines);
        event.amountCents = 0; // Closing/resetting a table does not move money.
      }
      if (row.kind === 'refund') event.refundId = row.note;
      events.push(event);
    }
    const last = page[page.length - 1];
    return json({ merchant, from, to, events, next: rows.length > 100 ? { before: last.ts, beforeId: last.eventId } : null });
  } catch (_) {
    // An absent schema or failed query is not evidence of an empty history.
    return json({ error: 'activity-unavailable' }, 503);
  }
}
