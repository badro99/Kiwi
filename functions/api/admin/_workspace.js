import { isOperator, json, slugMerchant } from '../../auth/_lib.js';

export async function guard({request,env}, write = false) {
  if (!(await isOperator(request,env))) return json({error:'forbidden'},403);
  if (!env.DB) return json({error:'no-db'},503);
  const origin = request.headers.get('Origin');
  if (write && origin && origin !== new URL(request.url).origin) return json({error:'cross-origin'},403);
  return null;
}
export const clean = (s, max = 300) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max);
export const merchantKey = s => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(s || '')) ? String(s) : '';
export async function merchantExists(env, merchant) {
  if (await env.DB.prepare('SELECT merchant FROM merchant_config WHERE merchant=?').bind(merchant).first()) return true;
  const accounts = await env.DB.prepare('SELECT business,email FROM accounts').all();
  return (accounts.results || []).some(a => slugMerchant(a.business || a.email) === merchant);
}
function readFailure(name, error) {
  // Do not expose SQL text or bindings, but preserve the distinction the
  // operator needs: schema/deployment versus a retryable read failure.
  const message = String(error && (error.message || error) || '').toLowerCase();
  const schema = /no such table|no such column|unknown column|does not exist|syntax error/.test(message);
  return {
    available: false, rows: [], truncated: false,
    reason: name + '-' + (schema ? 'schema' : 'read') + '-unavailable',
    failure: {
      kind: schema ? 'schema' : 'read',
      code: schema ? 'schema-mismatch' : 'read-failed',
      retryable: !schema,
      action: schema ? 'Vérifier le déploiement et les migrations de cette source.' : 'Réessayer la lecture ; si l’échec persiste, vérifier l’accès et le réseau.',
    },
  };
}
export async function source(env, name, sql, binds = [], limit = 200) {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).all();
    return {available:true, rows:(r.results || []).slice(0,limit), truncated:(r.results || []).length > limit};
  } catch (error) { return readFailure(name, error); }
}

export async function workspace(env, merchant = '') {
  const now = Date.now(), where = merchant ? ' AND merchant=?' : '', binds = merchant ? [merchant] : [];
  const definitions = {
    bridges:[`SELECT id,merchant,name,platform,version,last_seen_ts FROM print_bridges WHERE revoked_ts IS NULL${where} ORDER BY last_seen_ts DESC LIMIT 201`, binds],
    print:[`SELECT id,merchant,bridge_id,kind,status,created_ts,done_ts FROM print_jobs WHERE created_ts>=?${where} ORDER BY created_ts DESC LIMIT 201`, [now-86400000,...binds]],
    errors:[`SELECT id,merchant,message,file,version,count,first_seen_ts,last_seen_ts FROM client_errors WHERE last_seen_ts>=?${where} ORDER BY last_seen_ts DESC LIMIT 201`,[now-7*86400000,...binds]],
    support:[`SELECT id,merchant,reference,summary,priority,status,assignee,created_ts,updated_ts FROM support_tickets WHERE status NOT IN ('closed','resolved')${where} ORDER BY updated_ts DESC LIMIT 201`,binds],
    integrations:[`SELECT id,merchant,status,attempt_count,domain,action,updated_ts FROM operational_commands WHERE status NOT IN ('succeeded','completed','cancelled')${where} ORDER BY updated_ts DESC LIMIT 201`,binds],
    /* One row per till: its latest heartbeat of the last 14 days. Tills append
     * a heartbeat row every few minutes (≈650/day in 2026-09), so the latest
     * 500 rows were one or two devices repeated and quieter tills vanished. */
    caisseSync:[`SELECT o.merchant,o.payload,o.updated_ts FROM operational_commands o JOIN (
        SELECT merchant,json_extract(payload,'$.deviceId') AS device,MAX(updated_ts) AS ts FROM operational_commands
        WHERE domain='device' AND action='heartbeat' AND updated_ts>=?${where} GROUP BY merchant,device
      ) latest ON latest.merchant=o.merchant AND latest.ts=o.updated_ts AND json_extract(o.payload,'$.deviceId') IS latest.device
      WHERE o.domain='device' AND o.action='heartbeat' ORDER BY o.updated_ts DESC LIMIT 501`,[now-14*86400000,...binds],500],
    zChecks:[`SELECT merchant,business_day,terminal_id,reported_count,reported_cents,server_count,server_cents,missing_count,missing_cents,mismatch_count,extra_count,status,
        COALESCE(json_array_length(json_extract(result_json,'$.blocked')),0) AS blocked_count,updated_ts
      FROM z_reconciliations WHERE updated_ts>=?${where} ORDER BY business_day DESC,updated_ts DESC LIMIT 201`,[now-14*86400000,...binds]],
    conflicts:[`SELECT merchant,sale_id AS id,amount_cents,method,first_ts,updated_ts FROM sale_sync_conflicts WHERE updated_ts>=?${where} ORDER BY updated_ts DESC LIMIT 201`,[now-14*86400000,...binds]],
    activity:[`SELECT merchant,COUNT(*) AS sales_7d,COUNT(DISTINCT CAST((ts-18000000)/86400000 AS INTEGER)) AS active_days_7d,MAX(ts) AS last_ts
      FROM sales WHERE ts>=? AND void_ts IS NULL AND COALESCE(amount_cents,amount*100)>0${where} GROUP BY merchant LIMIT 201`,[now-7*86400000,...binds]],
    shopify:[`SELECT id,merchant,status,attempts,updated_ts FROM shopify_sync_outbox WHERE status!='done'${where} ORDER BY updated_ts DESC LIMIT 201`,binds],
    tasks:[`SELECT * FROM operator_tasks WHERE 1=1${where} ORDER BY (status='resolved'), priority, updated_ts DESC LIMIT 501`,binds,500],
    notes:[`SELECT id,merchant,body,actor,ts FROM operator_notes WHERE 1=1${where} ORDER BY ts DESC LIMIT 101`,binds,100],
    events:[`SELECT id,task_id,merchant,actor,action,detail,ts FROM operator_task_events WHERE 1=1${where} ORDER BY ts DESC LIMIT 101`,binds,100],

  };
  /* The product board (kiwi-os.com/tickets) is not merchant-scoped. */
  if (!merchant) definitions.board = [`SELECT id,status,kind,area,money_at_risk,substr(body,1,160) AS summary,created_ts,updated_ts FROM kiwi_tickets WHERE status!='done' ORDER BY money_at_risk DESC,id DESC LIMIT 101`,[],100];
  const entries = await Promise.all(Object.entries(definitions).map(async ([name,[sql,args,limit]]) => [name,await source(env,name,sql,args,limit)]));
  const sources = Object.fromEntries(entries);
  /* The first line of the error, never its stack. E-mail addresses and long
   * digit runs (codes, tokens, card or phone numbers) are masked. */
  if (sources.errors.available) sources.errors.rows = sources.errors.rows.map(row => ({ ...row,
    message: clean(String(row.message || '').split('\n')[0], 160).replace(/[^\s@]+@[^\s@]+/g, '•••@•••').replace(/\d{4,}/g, '••••') }));
  if (sources.caisseSync.available) {
    sources.caisseSync.rows = sources.caisseSync.rows.map((row) => {
      let beat = {};
      try { beat = JSON.parse(row.payload || '{}'); } catch (_) {}
      const s = beat.sync && typeof beat.sync === 'object' ? beat.sync : null;
      const count = (value) => Math.max(0, Math.min(100000, Math.trunc(Number(value) || 0)));
      const time = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 && n <= now + 60000 ? n : 0; };
      return { merchant: row.merchant, deviceId: clean(beat.deviceId, 80), app: clean(beat.app, 24),
        updated_ts: Number(row.updated_ts) || 0,
        sync: s ? { total: count(s.total), blocked: count(s.blocked), pending: count(s.pending),
          blockedEntries: (Array.isArray(s.blockedEntries) ? s.blockedEntries : []).filter(r => r && typeof r === 'object').slice(0,200).map(r => ({
            id: String(r.id || '').slice(0,64), amountCents: Math.max(0,Math.min(20000000,Math.round(Number(r.amountCents)||0))),
            method: String(r.method || '').slice(0,16), ts: time(r.ts), reason: String(r.reason || 'unknown').slice(0,96) })),
          oldestPendingAt: time(s.oldestPendingAt), lastAcknowledgedAt: time(s.lastAcknowledgedAt),
          lastStatus: count(s.lastStatus), lastError: clean(s.lastError, 96), storageError: !!s.storageError } : null };
    });
  }
  return {now,merchant,sources,coverage:'cloud-relay',physical_print_verified:false};
}
