import { json, operatorActor } from '../../auth/_lib.js';
import { guard, clean, merchantKey, merchantExists } from './_workspace.js';

const idKey = s => /^[a-zA-Z0-9_-]{8,100}$/.test(String(s || '')) ? String(s) : '';
const stamp = s => s == null || s === '' ? null : Number.isSafeInteger(Number(s)) && Number(s)>0 ? Number(s) : NaN;
async function ownerValid(env, id) { return !id || !!(await env.DB.prepare('SELECT id FROM operators WHERE id=?').bind(id).first()); }

export async function onRequestPost(context) {
  const bad = await guard(context,true); if (bad) return bad;
  let b; try { b = await context.request.json(); } catch (_) { return json({error:'bad-json'},400); }
  const id=idKey(b.id), merchant=merchantKey(b.merchant), title=clean(b.title,160), detail=clean(b.detail,2000);
  const priority=Number(b.priority || 3), due=stamp(b.due_ts), assignee=clean(b.assignee,100);
  const sourceTs=Number(b.source_ts||0);
  if (!id || !merchant || !title || !Number.isInteger(priority) || priority<1 || priority>4 || Number.isNaN(due)||!Number.isSafeInteger(sourceTs)||sourceTs<0) return json({error:'invalid-task'},400);
  try {
    if (!(await merchantExists(context.env,merchant))) return json({error:'merchant-not-found'},404);
    if (!(await ownerValid(context.env,assignee))) return json({error:'assignee-not-found'},400);
    const signal=clean(b.signal_key,160) || null, now=Date.now(), actor=await operatorActor(context.request,context.env), mutation=crypto.randomUUID();
    const existing=await context.env.DB.prepare('SELECT * FROM operator_tasks WHERE id=? OR (merchant=? AND signal_key=?)').bind(id,merchant,signal).first();
    if (existing) return existing.merchant===merchant ? json({ok:true,task:existing,replayed:true}) : json({error:'id-conflict'},409);
    await context.env.DB.batch([
      context.env.DB.prepare(`INSERT INTO operator_tasks (id,merchant,signal_key,title,detail,priority,assignee,due_ts,source_ts,mutation_id,created_ts,updated_ts,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(id,merchant,signal,title,detail,priority,assignee,due,Number(b.source_ts)||0,mutation,now,now,actor.id),
      context.env.DB.prepare(`INSERT INTO operator_task_events (id,task_id,merchant,actor_id,actor,action,detail,ts) SELECT ?,id,merchant,?,?,'created',title,? FROM operator_tasks WHERE id=? AND mutation_id=?`).bind(mutation,actor.id,actor.label,now,id,mutation),
    ]);
    const task=await context.env.DB.prepare('SELECT * FROM operator_tasks WHERE id=? OR (merchant=? AND signal_key=?)').bind(id,merchant,signal).first();
    if (!task || task.merchant!==merchant) return json({error:'id-conflict'},409);
    return json({ok:true,task});
  } catch (_) { return json({error:'task-storage-unavailable'},503); }
}

export async function onRequestPatch(context) {
  const bad=await guard(context,true); if(bad)return bad;
  let b; try {b=await context.request.json();}catch(_){return json({error:'bad-json'},400);}
  const id=idKey(b.id),merchant=merchantKey(b.merchant),version=Number(b.version);
  if(!id||!merchant||!Number.isInteger(version)||version<1)return json({error:'invalid-task'},400);
  try {
    const task=await context.env.DB.prepare('SELECT * FROM operator_tasks WHERE id=? AND merchant=?').bind(id,merchant).first();
    if(!task)return json({error:'task-not-found'},404);
    if(task.version!==version)return json({error:'version-conflict',task},409);
    const status=b.status===undefined?task.status:String(b.status),outcome=b.outcome===undefined?task.outcome:clean(b.outcome,2000);
    const assignee=b.assignee===undefined?task.assignee:clean(b.assignee,100),due=b.due_ts===undefined?task.due_ts:stamp(b.due_ts);
    const snooze=status==='snoozed'?stamp(b.snoozed_until===undefined?task.snoozed_until:b.snoozed_until):null;
    if(!['open','in_progress','snoozed','resolved'].includes(status)||Number.isNaN(due)||status==='snoozed'&&!(snooze>Date.now()))return json({error:'invalid-task-state'},400);
    if(status==='resolved'&&outcome.length<3)return json({error:'outcome-required'},400);
    if(!(await ownerValid(context.env,assignee)))return json({error:'assignee-not-found'},400);
    const now=Date.now(),actor=await operatorActor(context.request,context.env),mutation=crypto.randomUUID();
    const results=await context.env.DB.batch([
      context.env.DB.prepare(`UPDATE operator_tasks SET status=?,assignee=?,due_ts=?,snoozed_until=?,outcome=?,version=version+1,updated_ts=?,mutation_id=? WHERE id=? AND merchant=? AND version=?`).bind(status,assignee,due,snooze,outcome,now,mutation,id,merchant,version),
      context.env.DB.prepare(`INSERT INTO operator_task_events(id,task_id,merchant,actor_id,actor,action,detail,ts) SELECT ?,id,merchant,?,?,?, ?,? FROM operator_tasks WHERE id=? AND merchant=? AND mutation_id=?`).bind(mutation,actor.id,actor.label,status,JSON.stringify({before:{status:task.status,assignee:task.assignee,due_ts:task.due_ts},after:{status,assignee,due_ts:due,snoozed_until:snooze},outcome}),now,id,merchant,mutation),
    ]);
    if(!results[0].meta?.changes)return json({error:'version-conflict'},409);
    return json({ok:true,task:await context.env.DB.prepare('SELECT * FROM operator_tasks WHERE id=? AND merchant=?').bind(id,merchant).first()});
  }catch(_){return json({error:'task-storage-unavailable'},503);}
}
