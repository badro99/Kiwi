// Durable dispute history. Refusal retries retain one event; purchases and
// refunds remain in their original ledger. No financial totals are rewritten.
import { json, activeAccountSession, isTillFor } from '../auth/_lib.js';
import { mayMergeClients } from './_client-merge.js';
export async function mayRecordReward(request, env, merchant) {
  if (await isTillFor(request, env, merchant)) return true;
  const session = await activeAccountSession(request, env);
  const row = session && await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?').bind(merchant).first();
  return !!session && row?.account_id === session.aid;
}
export async function ensureClientRefusals(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS client_reward_refusals (
    merchant TEXT NOT NULL, ref TEXT NOT NULL, client_id TEXT NOT NULL,
    error TEXT NOT NULL, created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, client_id, ref))`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS client_reward_refusals_day ON client_reward_refusals (merchant, created_ts)').run();
}
export async function refuseReward(env, merchant, clientId, ref, error, status = 409) {
  if (!/^[A-Za-z0-9:_-]{1,96}$/.test(ref) || !['client-not-found', 'loyalty-off', 'reward-not-ready'].includes(error)) return json({ error: 'invalid-refusal' }, 400);
  await ensureClientRefusals(env);
  const now = Date.now(), start = Math.floor(now / 86400000) * 86400000;
  // Existence, daily budget and idempotency are decided in one SQLite statement.
  await env.DB.prepare(`INSERT OR IGNORE INTO client_reward_refusals
    (merchant, ref, client_id, error, created_ts) SELECT ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM clients WHERE merchant = ? AND id = ? AND deleted = 0)
      AND (SELECT COUNT(*) FROM client_reward_refusals WHERE merchant = ? AND created_ts >= ?) < 500`)
    .bind(merchant, ref, clientId, error, now, merchant, clientId, merchant, start).run();
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
