import { authorize, body, response, text } from './_core.js';

const REQUIRED = {
  merchant_overview: 'overview:read',
  sales_summary: 'sales:read',
  catalog_search: 'catalog:read',
  hotel_stays: 'hotel:read',
  clients_search: 'clients:read',
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
