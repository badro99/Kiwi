import { entitledMerchant, json } from '../auth/_lib.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked);
  if (!asked || merchant !== asked) return json({ ok: true, ready: false, redacted: true, orders: [] });
  const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
  try {
    const result = await env.DB.prepare(`SELECT merchant, order_id, order_number,
      accepted_ts, sent_ts, ready_ts, served_ts, closed_ts, created_ts, updated_ts
      FROM order_course WHERE merchant = ? AND sent_ts >= ?
      ORDER BY sent_ts ASC LIMIT 2000`).bind(merchant, from).all();
    return json({ ok: true, ready: true, redacted: false, orders: (result && result.results) || [] });
  } catch (_) {
    return json({ ok: true, ready: false, redacted: false, orders: [] });
  }
}
