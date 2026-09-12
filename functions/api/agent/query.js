import { authorize, body, response, text } from './_core.js';

const REQUIRED = {
  merchant_overview: 'overview:read',
  sales_summary: 'sales:read',
  catalog_search: 'catalog:read',
  hotel_stays: 'hotel:read',
  clients_search: 'clients:read',
  orders_list: 'orders:read',
  order_detail: 'orders:read',
  table_sessions: 'tables:read',
  active_tables: 'tables:read',
  payment_events: 'payments:read',
  refund_events: 'payments:read',
  cash_events: 'cash:read',
  operations_notes: 'operations:read',
  operations_tasks: 'operations:read',
};
function range(data) {
  const from = text(data.from, 10), to = text(data.to, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b || b - a > 31 * 86400000 ||
      new Date(a).toISOString().slice(0, 10) !== from || new Date(b).toISOString().slice(0, 10) !== to) return null;
  return { from, to, start: a, end: b + 86400000 };
}
const limit = data => Math.max(1, Math.min(25, Math.floor(Number(data.limit) || 20)));
const offset = data => data.offset === undefined ? 0 :
  Number.isInteger(data.offset) && data.offset >= 0 && data.offset <= 1000 ? data.offset : null;
const finite = x => x !== undefined && x !== null && x !== '' && typeof x !== 'boolean' &&
  Number.isFinite(Number(x)) ? Number(x) : null;
const jsonLines = value => { try { const a = JSON.parse(value); return Array.isArray(a) ? a.slice(0, 40).map(x => ({
  id: text(x?.id, 100) || null, name: text(x?.name, 120), qty: finite(x?.qty),
  unitPrice: finite(x?.unitPrice),
})) : null; } catch (_) { return null; } };
const orderView = row => ({ id: row.id, number: row.number, mode: row.mode, table_no: row.table_no,
  total: row.total, lines: jsonLines(row.lines), status: row.status, created_ts: row.created_ts,
  updated_ts: row.updated_ts, channel: row.channel, ext_ref: row.ext_ref,
  paid_ts: row.paid_ts, cancel_ts: row.cancel_ts, cancel_actor_name: row.cancel_actor_name });

export async function onRequestPost({ request, env }) {
  const data = await body(request);
  if (!data) return response({ error: 'invalid-json' }, 400);
  const tool = text(data.tool, 40), scope = REQUIRED[tool];
  if (!scope) return response({ error: 'unknown-tool' }, 400);
  const grant = await authorize(request, env, scope);
  if (!grant) return response({ error: 'forbidden' }, 403);
  const merchant = grant.merchant;
  try {
    let result;
    if (tool === 'merchant_overview') {
      const row = await env.DB.prepare(`SELECT merchant, name, type, plan, status
        FROM merchant_config WHERE merchant = ?`).bind(merchant).first();
      result = { profile: row };
    } else if (tool === 'sales_summary') {
      const r = range(data);
      if (!r) return response({ error: 'invalid-range' }, 400);
      const rows = await env.DB.prepare(`SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day,
        method, COUNT(*) AS count, SUM(COALESCE(amount_cents, amount * 100)) AS amount_cents
        FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL
        GROUP BY day, method ORDER BY day, method`).bind(merchant, r.start, r.end).all();
      result = { from: r.from, to: r.to, currency: 'MAD', rows: rows.results || [] };
    } else if (tool === 'catalog_search') {
      const q = text(data.query, 80).toLocaleLowerCase(), max = limit(data);
      if (q.length < 2) return response({ error: 'query-too-short' }, 400);
      const row = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first();
      const parsed = row ? JSON.parse(row.data) : {};
      const products = (Array.isArray(parsed.products) ? parsed.products : [])
        .filter(p => p && !p.archived && String(p.name || '').toLocaleLowerCase().includes(q))
        .slice(0, max).map(p => ({ id: p.id, name: p.name, sku: p.sku || '', priceMAD: p.priceMAD ?? null,
          categoryId: p.categoryId || null }));
      result = { rev: row?.rev || 0, products, truncated: products.length === max };
    } else if (tool === 'hotel_stays') {
      const r = range(data);
      if (!r) return response({ error: 'invalid-range' }, 400);
      const rows = await env.DB.prepare(`SELECT id, code, room_id, room_type_id, check_in, check_out,
        status, channel, customer_name, party_size, total
        FROM hotel_reservations WHERE merchant = ? AND check_in < ? AND check_out > ?
        ORDER BY check_in, id LIMIT ?`).bind(merchant, new Date(r.end).toISOString().slice(0, 10), r.from, limit(data)).all();
      result = { from: r.from, to: r.to, stays: rows.results || [] };
    } else if (tool === 'orders_list') {
      const r = range(data), page = offset(data);
      if (!r || page === null) return response({ error: 'invalid-range-or-offset' }, 400);
      const rows = await env.DB.prepare(`SELECT id,number,mode,table_no,total,lines,status,created_ts,updated_ts,
        channel,ext_ref,paid_ts,cancel_ts,cancel_actor_name FROM orders
        WHERE merchant = ? AND created_ts >= ? AND created_ts < ? ORDER BY created_ts DESC,id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, r.start, r.end, limit(data) + 1, page).all();
      const items = rows.results || [], more = items.length > limit(data);
      result = { from: r.from, to: r.to, orders: items.slice(0, limit(data)).map(orderView),
        nextOffset: more ? page + limit(data) : null };
    } else if (tool === 'order_detail') {
      const id = text(data.id, 100);
      if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) return response({ error: 'invalid-id' }, 400);
      const row = await env.DB.prepare(`SELECT id,number,mode,table_no,total,lines,status,created_ts,updated_ts,
        channel,ext_ref,paid_ts,cancel_ts,cancel_actor_name FROM orders WHERE merchant = ? AND id = ?`)
        .bind(merchant, id).first();
      if (!row) return response({ error: 'not-found' }, 404);
      result = { order: orderView(row) };
    } else if (tool === 'table_sessions') {
      const r = range(data), page = offset(data);
      if (!r || page === null) return response({ error: 'invalid-range-or-offset' }, 400);
      // Session IDs are bearer capabilities for the guest phone: never expose them.
      const rows = await env.DB.prepare(`SELECT s.mode,s.table_no,s.status,s.closed_by,s.opened_ts,s.seen_ts,s.closed_ts,
        (SELECT COUNT(*) FROM orders o WHERE o.merchant = s.merchant AND o.session_id = s.id) AS order_count
        FROM table_sessions s WHERE s.merchant = ? AND s.opened_ts >= ? AND s.opened_ts < ?
        ORDER BY s.opened_ts DESC,s.id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, r.start, r.end, limit(data) + 1, page).all();
      const items = rows.results || [];
      result = { from: r.from, to: r.to, sessions: items.slice(0, limit(data)),
        nextOffset: items.length > limit(data) ? page + limit(data) : null };
    } else if (tool === 'active_tables') {
      const page = offset(data);
      if (page === null) return response({ error: 'invalid-offset' }, 400);
      const rows = await env.DB.prepare(`SELECT s.mode,s.table_no,s.status,s.opened_ts,s.seen_ts,
        (SELECT COUNT(*) FROM orders o WHERE o.merchant = s.merchant AND o.session_id = s.id) AS order_count
        FROM table_sessions s WHERE s.merchant = ? AND s.status = 'open'
        ORDER BY s.seen_ts DESC,s.id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, limit(data) + 1, page).all();
      const items = rows.results || [];
      result = { tables: items.slice(0, limit(data)), nextOffset: items.length > limit(data) ? page + limit(data) : null };
    } else if (tool === 'payment_events') {
      const r = range(data), page = offset(data);
      if (!r || page === null) return response({ error: 'invalid-range-or-offset' }, 400);
      // A sale row is a payment posting. Include void state rather than silently
      // erasing the event from operational history. No PAN, token or guest data.
      const rows = await env.DB.prepare(`SELECT id,ref,label,method,channel,ts,
        COALESCE(amount_cents,amount*100) AS amount_cents,void_ts,void_reason,void_actor_id,
        discount_amount_cents FROM sales WHERE merchant = ? AND ts >= ? AND ts < ?
        ORDER BY ts DESC,id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, r.start, r.end, limit(data) + 1, page).all();
      const items = rows.results || [];
      result = { from: r.from, to: r.to, currency: 'MAD', payments: items.slice(0, limit(data)),
        nextOffset: items.length > limit(data) ? page + limit(data) : null };
    } else if (tool === 'refund_events') {
      const r = range(data), page = offset(data);
      if (!r || page === null) return response({ error: 'invalid-range-or-offset' }, 400);
      const rows = await env.DB.prepare(`SELECT command_id,reference,amount_cents,status,created_ts,updated_ts
        FROM payment_refund_reservations WHERE merchant = ? AND created_ts >= ? AND created_ts < ?
        ORDER BY created_ts DESC,command_id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, r.start, r.end, limit(data) + 1, page).all();
      const items = rows.results || [];
      result = { from: r.from, to: r.to, currency: 'MAD', refunds: items.slice(0, limit(data)),
        nextOffset: items.length > limit(data) ? page + limit(data) : null };
    } else if (tool === 'cash_events') {
      const r = range(data), page = offset(data);
      if (!r || page === null) return response({ error: 'invalid-range-or-offset' }, 400);
      const rows = await env.DB.prepare(`SELECT id,terminal_id,event_type,expected_cents,counted_cents,gap_cents,
        movement_kind,movement_amount_cents,movement_reason,actor_id,counterparty_actor_id,occurred_ts
        FROM cash_session_events WHERE merchant = ? AND occurred_ts >= ? AND occurred_ts < ?
        ORDER BY occurred_ts DESC,id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, r.start, r.end, limit(data) + 1, page).all();
      const items = rows.results || [];
      result = { from: r.from, to: r.to, currency: 'MAD', events: items.slice(0, limit(data)),
        nextOffset: items.length > limit(data) ? page + limit(data) : null };
    } else if (tool === 'operations_notes') {
      const r = range(data), page = offset(data);
      if (!r || page === null) return response({ error: 'invalid-range-or-offset' }, 400);
      const rows = await env.DB.prepare(`SELECT id,body,actor_id,actor,ts FROM operator_notes
        WHERE merchant = ? AND ts >= ? AND ts < ? ORDER BY ts DESC,id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, r.start, r.end, limit(data) + 1, page).all();
      const items = rows.results || [];
      result = { notes: items.slice(0, limit(data)), nextOffset: items.length > limit(data) ? page + limit(data) : null };
    } else if (tool === 'operations_tasks') {
      const r = range(data), page = offset(data);
      if (!r || page === null) return response({ error: 'invalid-range-or-offset' }, 400);
      const rows = await env.DB.prepare(`SELECT id,title,detail,priority,status,assignee,due_ts,version,created_ts,updated_ts,created_by
        FROM operator_tasks WHERE merchant = ? AND created_ts >= ? AND created_ts < ?
        ORDER BY created_ts DESC,id DESC LIMIT ? OFFSET ?`)
        .bind(merchant, r.start, r.end, limit(data) + 1, page).all();
      const items = rows.results || [];
      result = { tasks: items.slice(0, limit(data)), nextOffset: items.length > limit(data) ? page + limit(data) : null };
    } else {
      const q = text(data.query, 80);
      if (q.length < 2) return response({ error: 'query-too-short' }, 400);
      const rows = await env.DB.prepare(`SELECT id, name, phone, email, city, substr(notes,1,240) AS notes
        FROM clients WHERE merchant = ? AND deleted = 0
        AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)
        ORDER BY name LIMIT ?`).bind(merchant, '%' + q + '%', '%' + q + '%', '%' + q + '%', limit(data)).all();
      result = { clients: rows.results || [] };
    }
    // Query logs contain no search string or returned personal data.
    await env.DB.prepare(`INSERT INTO agent_audit
      (id,key_id,merchant,action,target_id,request_id,created_ts) VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), grant.id, merchant, tool, '', crypto.randomUUID(), Date.now()).run();
    await env.DB.prepare('UPDATE agent_keys SET last_used_ts = ? WHERE id = ?').bind(Date.now(), grant.id).run();
    return response({ ok: true, merchant, ...result });
  } catch (_) { return response({ error: 'unavailable' }, 503); }
}
