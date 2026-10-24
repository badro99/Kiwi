// Durable dispute history. Refusal retries retain one event; purchases and
// refunds remain in their original ledger. No financial totals are rewritten.
import { json } from '../auth/_lib.js';
import { mayMergeClients } from './_client-merge.js';
export async function ensureClientRefusals(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS client_reward_refusals (
    merchant TEXT NOT NULL, ref TEXT NOT NULL, client_id TEXT NOT NULL,
    error TEXT NOT NULL, created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, ref))`).run();
}
export async function refuseReward(env, merchant, clientId, ref, error, status = 409) {
  await ensureClientRefusals(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO client_reward_refusals
    (merchant, ref, client_id, error, created_ts) VALUES (?, ?, ?, ?, ?)`)
    .bind(merchant, ref, clientId, error, Date.now()).run();
  return json({ error }, status);
}
export async function clientAudit(request, env, merchant, clientId) {
  if (!await mayMergeClients(request, env, merchant)) return json({ error: 'manager-required' }, 403);
  const url = new URL(request.url);
  let cursor = [Number.MAX_SAFE_INTEGER, '\uffff', '\uffff'];
  if (url.searchParams.has('auditBefore')) {
    try { cursor = JSON.parse(url.searchParams.get('auditBefore')); } catch (_) { return json({ error: 'invalid-cursor' }, 400); }
    if (!Array.isArray(cursor) || cursor.length !== 3 || !Number.isSafeInteger(cursor[0]) || cursor.slice(1).some(v => typeof v !== 'string' || v.length > 160)) return json({ error: 'invalid-cursor' }, 400);
  }
  await ensureClientRefusals(env);
  const service = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'employee_loyalty_events'").first();
  const serviceSql = service ? `UNION ALL SELECT created_ts, 'service', ref, amount, '', '{}', '', 0, 0
      FROM employee_loyalty_events WHERE merchant = ? AND client_id = ?` : '';
  const result = await env.DB.prepare(`WITH events AS (
    SELECT created_ts, 'purchase' AS kind, ref, amount, method, items, '' AS error, 0 AS points_delta, 0 AS stamps_delta
      FROM client_purchase_events WHERE merchant = ? AND client_id = ?
    UNION ALL SELECT created_ts, 'reward', ref, 0, '', '{}', '', points_delta, stamps_delta
      FROM client_reward_events WHERE merchant = ? AND client_id = ?
    UNION ALL SELECT created_ts, 'refusal', ref, 0, '', '{}', error, 0, 0
      FROM client_reward_refusals WHERE merchant = ? AND client_id = ?
    ${serviceSql})
    SELECT * FROM events WHERE (created_ts, kind, ref) < (?, ?, ?)
    ORDER BY created_ts DESC, kind DESC, ref DESC LIMIT 101`)
    .bind(merchant, clientId, merchant, clientId, merchant, clientId, ...(service ? [merchant, clientId] : []), ...cursor).all();
  const events = (result.results || []).slice(0, 100), last = events.at(-1);
  return json({ ok: true, events, next: result.results.length > 100 ? JSON.stringify([last.created_ts, last.kind, last.ref]) : null });
}
