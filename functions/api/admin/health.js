/* /api/admin/health — read-only support dossier for one establishment.
 * It answers “what last reached Kiwi?” without exposing customer/order content
 * or granting a mutation. Missing schema is reported, never disguised as zero. */
import { json, isOperator } from '../../auth/_lib.js';

async function first(env, sql, args, name, missing) {
  try { return await env.DB.prepare(sql).bind(...args).first(); }
  catch (e) { missing.push({ area: name, error: String(e && e.message || e).slice(0, 160) }); return null; }
}

export async function onRequestGet({ request, env }) {
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);

  const now = Date.now();
  const missing = [];
  const [config, sales, docs, pins, pairing, orders, channels, catalog, clients] = await Promise.all([
    first(env,
      `SELECT mc.updated_ts, mc.account_id, mc.name, mc.type, mc.plan, a.status AS account_status
         FROM merchant_config mc LEFT JOIN accounts a ON a.id = mc.account_id
        WHERE mc.merchant = ?`, [merchant], 'configuration', missing),
    first(env,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN ts >= ? AND void_ts IS NULL THEN 1 ELSE 0 END) AS last_24h,
              SUM(CASE WHEN ts >= ? AND void_ts IS NULL THEN amount ELSE 0 END) AS amount_24h,
              MAX(CASE WHEN void_ts IS NULL THEN ts ELSE NULL END) AS last_ts
         FROM sales WHERE merchant = ?`, [now - 86400000, now - 86400000, merchant], 'sales', missing),
    first(env,
      'SELECT COUNT(*) AS total, MAX(updated_ts) AS last_ts FROM store_docs WHERE merchant = ?',
      [merchant], 'cloud-documents', missing),
    first(env,
      'SELECT COUNT(*) AS total FROM staff_pins WHERE merchant = ?',
      [merchant], 'staff-access', missing),
    first(env,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN used_ts IS NULL AND expires_ts > ? THEN 1 ELSE 0 END) AS active,
              MAX(COALESCE(used_ts, created_ts)) AS last_ts
         FROM pairings WHERE merchant = ?`, [now, merchant], 'pairing', missing),
    first(env,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
              MIN(CASE WHEN status = 'pending' THEN created_ts ELSE NULL END) AS oldest_pending,
              MAX(updated_ts) AS last_ts
         FROM orders WHERE merchant = ?`, [merchant], 'orders', missing),
    first(env,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
              MAX(last_ts) AS last_ts,
              MAX(CASE WHEN last_err <> '' THEN last_err ELSE NULL END) AS last_error
         FROM channel_links WHERE merchant = ?`, [merchant], 'channels', missing),
    first(env,
      'SELECT rev, updated_ts FROM catalogs WHERE merchant = ?',
      [merchant], 'catalog', missing),
    first(env,
      'SELECT COUNT(*) AS total, MAX(srv_ts) AS last_ts FROM clients WHERE merchant = ? AND deleted = 0',
      [merchant], 'customers', missing),
  ]);

  return json({
    merchant, checked_ts: now, missing,
    account: config ? { status: config.account_status || 'unclaimed', account_id: config.account_id || '', name: config.name || '', type: config.type || '', plan: config.plan || '' } : null,
    configuration: config ? { last_ts: Number(config.updated_ts) || 0 } : null,
    sales: sales ? { total: Number(sales.total) || 0, last_24h: Number(sales.last_24h) || 0, amount_24h: Number(sales.amount_24h) || 0, last_ts: Number(sales.last_ts) || 0 } : null,
    documents: docs ? { total: Number(docs.total) || 0, last_ts: Number(docs.last_ts) || 0 } : null,
    staff: pins ? { total: Number(pins.total) || 0 } : null,
    pairing: pairing ? { total: Number(pairing.total) || 0, active: Number(pairing.active) || 0, last_ts: Number(pairing.last_ts) || 0 } : null,
    orders: orders ? { total: Number(orders.total) || 0, pending: Number(orders.pending) || 0, oldest_pending: Number(orders.oldest_pending) || 0, last_ts: Number(orders.last_ts) || 0 } : null,
    channels: channels ? { total: Number(channels.total) || 0, active: Number(channels.active) || 0, last_ts: Number(channels.last_ts) || 0, last_error: String(channels.last_error || '').slice(0, 160) } : null,
    catalog: catalog ? { rev: Number(catalog.rev) || 0, last_ts: Number(catalog.updated_ts) || 0 } : null,
    customers: clients ? { total: Number(clients.total) || 0, last_ts: Number(clients.last_ts) || 0 } : null,
  });
}
