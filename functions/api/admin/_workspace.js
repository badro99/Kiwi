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
export async function source(env, name, sql, binds = [], limit = 200) {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).all();
    return {available:true, rows:(r.results || []).slice(0,limit), truncated:(r.results || []).length > limit};
  } catch (_) { return {available:false, rows:[], truncated:false, reason:name+'-unavailable'}; }
}

export async function workspace(env, merchant = '') {
  const now = Date.now(), where = merchant ? ' AND merchant=?' : '', binds = merchant ? [merchant] : [];
  const definitions = {
    bridges:[`SELECT id,merchant,name,platform,version,last_seen_ts FROM print_bridges WHERE revoked_ts IS NULL${where} ORDER BY last_seen_ts DESC LIMIT 201`, binds],
    print:[`SELECT id,merchant,bridge_id,kind,status,created_ts,done_ts FROM print_jobs WHERE created_ts>=?${where} ORDER BY created_ts DESC LIMIT 201`, [now-86400000,...binds]],
    errors:[`SELECT id,merchant,file,version,count,first_seen_ts,last_seen_ts FROM client_errors WHERE last_seen_ts>=?${where} ORDER BY last_seen_ts DESC LIMIT 201`,[now-7*86400000,...binds]],
    support:[`SELECT id,merchant,reference,summary,priority,status,assignee,created_ts,updated_ts FROM support_tickets WHERE status NOT IN ('closed','resolved')${where} ORDER BY updated_ts DESC LIMIT 201`,binds],
    integrations:[`SELECT id,merchant,status,attempt_count,domain,action,updated_ts FROM operational_commands WHERE status NOT IN ('succeeded','completed','cancelled')${where} ORDER BY updated_ts DESC LIMIT 201`,binds],
    shopify:[`SELECT id,merchant,status,attempts,updated_ts FROM shopify_sync_outbox WHERE status!='done'${where} ORDER BY updated_ts DESC LIMIT 201`,binds],
    tasks:[`SELECT * FROM operator_tasks WHERE 1=1${where} ORDER BY (status='resolved'), priority, updated_ts DESC LIMIT 501`,binds,500],
    notes:[`SELECT id,merchant,body,actor,ts FROM operator_notes WHERE 1=1${where} ORDER BY ts DESC LIMIT 101`,binds,100],
    events:[`SELECT id,task_id,merchant,actor,action,detail,ts FROM operator_task_events WHERE 1=1${where} ORDER BY ts DESC LIMIT 101`,binds,100],
  };
  const entries = await Promise.all(Object.entries(definitions).map(async ([name,[sql,args,limit]]) => [name,await source(env,name,sql,args,limit)]));
  return {now,merchant,sources:Object.fromEntries(entries),coverage:'cloud-relay',physical_print_verified:false};
}
