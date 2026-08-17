/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Client Errors Operator Diagnostics Endpoint
 *
 *   GET /api/admin/errors(?merchant=...&limit=100)
 *
 * Returns recent client exceptions aggregated from production browsers,
 * allowing operators to inspect runtime issues per merchant and version.
 * Operator-gated.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { isOperator, json } from '../../auth/_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) {
    return json({ error: 'forbidden' }, 403);
  }
  if (!env.DB) {
    return json({ error: 'no-db' }, 503);
  }

  const url = new URL(request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

  try {
    let rows;
    if (merchant) {
      rows = await env.DB.prepare(
        `SELECT id, merchant, message, file, line, col, stack, url, version, user_agent, count, first_seen_ts, last_seen_ts
         FROM client_errors
         WHERE merchant = ?
         ORDER BY last_seen_ts DESC
         LIMIT ?`
      ).bind(merchant, limit).all();
    } else {
      rows = await env.DB.prepare(
        `SELECT id, merchant, message, file, line, col, stack, url, version, user_agent, count, first_seen_ts, last_seen_ts
         FROM client_errors
         ORDER BY last_seen_ts DESC
         LIMIT ?`
      ).bind(limit).all();
    }

    return json({
      ok: true,
      errors: rows.results || [],
      count: (rows.results || []).length,
      now: Date.now()
    });
  } catch (err) {
    // If table doesn't exist yet, return empty array gracefully
    return json({ ok: true, errors: [], count: 0, now: Date.now() });
  }
}
