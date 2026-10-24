import { isOperator, json } from '../../auth/_lib.js';
export async function onRequestGet({ request, env }) {
  if (!await isOperator(request, env)) return json({ error: 'forbidden' }, 403);
  if (!env?.DB) return json({ error: 'not-configured' }, 503);
  try {
    const { results } = await env.DB.prepare(`SELECT COALESCE(m.name, d.merchant) AS name, d.role, d.last_seen
      FROM origin_devices d LEFT JOIN merchant_config m ON m.merchant = d.merchant
      WHERE d.last_seen >= ? ORDER BY d.last_seen DESC LIMIT 500`).bind(Date.now() - 7 * 86400000).all();
    return json({ devices: results || [] }, 200, { 'Cache-Control': 'no-store' });
  } catch (_) { return json({ error: 'devices-unavailable' }, 503); }
}
