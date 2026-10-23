// Durable custody and owner settlement of permanently refused till money.
// This domain is deliberately inaccessible to generic operations transitions.
import { activeAccountSession, storeOwner, accountSlug, isTillFor, isOperator, managerRefundProof, json } from '../auth/_lib.js';
import { onRequestPost as refund } from './sale/refund.js';
import { onRequestPost as sale } from './sale.js';
import { poke } from './_live.js';

const DOMAIN = 'quarantine';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,64}$/.test(value);
export function cleanPayload(value) {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('_')
    && !/approval|password|pin|token|secret|credential|pairing|staffcode/i.test(key))
    .map(([key, item]) => [key, cleanPayload(item)]));
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
async function ownerFor(request, env, merchant) {
  const session = await activeAccountSession(request, env);
  if (!session) return null;
  const owner = await storeOwner(env, merchant);
  if (owner) return owner === session.aid ? session : null;
  const account = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(session.aid).first();
  return account && await accountSlug(env, account.business, session.aid) === merchant ? session : null;
}
function view(row) {
  const data = JSON.parse(row.payload), p = data.operation;
  return { id:p.id, amountCents: Number(p.amountCents) || Math.round(Number(p.amount)*100),
    method:p.refundMethod || p.method, kind:p.kind === 'refund' ? 'refund' : 'sale', ts:p.ts,
    ref:p.ref || p.id, originalSaleId:p.originalSaleId || null,
    reason:data.reason, status:row.status, decision:row.result ? JSON.parse(row.result) : null,
    lastError:row.last_error };
}
async function find(env, merchant, id) {
  return env.DB.prepare("SELECT * FROM operational_commands WHERE merchant = ? AND domain = 'quarantine' AND idempotency_key = ?")
    .bind(merchant,'quarantine:'+id).first();
}
export async function onRequestGet({request,env}) {
  if (!env?.DB) return json({error:'no-db'},503);
  try {
    const merchant = new URL(request.url).searchParams.get('merchant');
    if (!merchant || !(await ownerFor(request,env,merchant) || await isOperator(request,env))) return json({error:'forbidden'},403);
    const rows = await env.DB.prepare("SELECT * FROM operational_commands WHERE merchant = ? AND domain = 'quarantine' ORDER BY created_ts ASC").bind(merchant).all();
    return json({ok:true,merchant,entries:(rows.results || []).map(view)});
  } catch (_) { return json({error:'quarantine-unavailable'},503); }
}
export async function onRequestPost({request,env}) {
  if (!env?.DB) return json({error:'no-db'},503);
  try {
    const raw = await request.text();
    if (raw.length > 100000) return json({error:'payload-too-large'},413);
    let body; try { body=JSON.parse(raw); } catch (_) { return json({error:'bad-json'},400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error:'bad-json'},400);
    const merchant=String(body.merchant || '');
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(merchant)) return json({error:'bad-merchant'},400);
    const owner = await ownerFor(request,env,merchant);
    if (body.action === 'status') {
      if (!owner && !await isTillFor(request,env,merchant)) return json({error:'forbidden'},403);
      if (!validId(body.id)) return json({error:'bad-id'},400);
      const row=await find(env,merchant,body.id);
      return row ? json({ok:true,id:body.id,status:row.status}) : json({error:'not-found'},404);
    }
    if (body.action === 'upload') {
      if (!owner && !await isTillFor(request,env,merchant)) return json({error:'forbidden'},403);
      const p=cleanPayload(body.payload);
      if (!p || !validId(p.id) || p.merchant !== merchant) return json({error:'bad-operation'},400);
      const data=JSON.stringify({operation:p,reason:String(body.reason || 'unknown').slice(0,96)});
      const at=Date.now();
      await env.DB.prepare(`INSERT OR IGNORE INTO operational_commands
        (id,merchant,domain,action,status,idempotency_key,payload,requested_by,created_ts,updated_ts)
        VALUES(?,?,'quarantine','settle','pending',?,?,?,?,?)`)
        .bind('quarantine:'+merchant+':'+p.id,merchant,'quarantine:'+p.id,data,owner?'owner:'+owner.aid:'till',at,at).run();
      const row=await find(env,merchant,p.id);
      if (!row || canonical(JSON.parse(row.payload).operation) !== canonical(p)) return json({error:'operation-conflict'},409);
      try { await poke(env,merchant,DOMAIN); } catch (_) {}
      return json({ok:true,id:p.id,status:row.status});
    }
    // Paired tills, employees and operators cannot decide the owner's books.
    if (!owner) return json({error:'owner-required'},403);
    if (!validId(body.id) || !['approve','decline'].includes(body.action)) return json({error:'bad-action'},400);
    let row=await find(env,merchant,body.id);
    if (!row) return json({error:'not-found'},404);
    const wanted=body.action==='approve'?'approving':'declined';
    if (row.status==='pending') {
      // A refund that won the database race cannot subsequently be declined.
      await env.DB.prepare("UPDATE operational_commands SET status = ?, result = ?, updated_ts = ? WHERE id = ? AND merchant = ? AND status = 'pending' AND (? != 'declined' OR NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'refund' AND note = ?))")
        .bind(wanted,JSON.stringify({action:body.action,actorId:'owner:'+owner.aid,at:Date.now()}),Date.now(),row.id,merchant,wanted,merchant,body.id).run();
      row=await find(env,merchant,body.id);
    }
    // An approval the sale/refund rules refused (cap reached, sale voided) must
    // not trap the operation: the owner may still decline it, provided nothing
    // was ever booked under its id.
    if (row.status==='approving' && body.action==='decline' && row.last_error) {
      await env.DB.prepare("UPDATE operational_commands SET status = 'declined', result = ?, updated_ts = ? WHERE id = ? AND merchant = ? AND status = 'approving' AND last_error != '' AND NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'refund' AND note = ?) AND NOT EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ?)")
        .bind(JSON.stringify({action:'decline',actorId:'owner:'+owner.aid,at:Date.now(),after:row.last_error}),Date.now(),row.id,merchant,merchant,body.id,merchant,body.id).run();
      row=await find(env,merchant,body.id);
      if (row.status==='declined') { try { await poke(env,merchant,DOMAIN); } catch (_) {} }
    }
    if ((row.status==='approved' && body.action==='approve') || (row.status==='declined' && body.action==='decline')) return json({ok:true,id:body.id,status:row.status});
    if (row.status!==wanted) return json({error:'decision-conflict'},409);
    const p=JSON.parse(row.payload).operation;
    const decision=JSON.parse(row.result);
    if (p.kind && !['sale','refund'].includes(p.kind)) return json({error:'unsupported-operation'},409);
    const operation={...p,merchant};
    if (p.kind==='refund') {
      // Old tills stored the selected refund method as `method`.
      operation.refundMethod=p.refundMethod || p.method || '';
      operation.approval=await managerRefundProof(env.AUTH_SECRET,{merchant,refundId:p.id,
        originalSaleId:p.originalSaleId,amountCents:p.amountCents,refundMethod:operation.refundMethod,
        staffId:decision.actorId,staffName:'Propriétaire',staffRole:'owner'});
    }
    // Keep authenticated owner cookies, never substitute a client identity.
    const response=await (p.kind==='refund'?refund:sale)({env,quarantineSettlement:row.id,request:new Request(new URL(p.kind==='refund'?'/api/sale/refund':'/api/sale',request.url),{
      method:'POST',headers:request.headers,body:JSON.stringify(operation)})});
    const result=await response.json();
    if (!response.ok || !result.ok || result.settlementPending) {
      await env.DB.prepare('UPDATE operational_commands SET last_error = ?, updated_ts = ? WHERE id = ? AND merchant = ?')
        .bind(String(result.error || 'settlement-pending').slice(0,96),Date.now(),row.id,merchant).run();
      return json({error:result.error || 'settlement-pending',status:'approving'},response.ok?503:response.status);
    }
    await env.DB.prepare("UPDATE operational_commands SET status = 'approved', last_error = '', updated_ts = ? WHERE id = ? AND merchant = ? AND status = 'approving'")
      .bind(Date.now(),row.id,merchant).run();
    try { await poke(env,merchant,DOMAIN); } catch (_) {}
    return json({ok:true,id:p.id,status:'approved'});
  } catch (_) { return json({error:'quarantine-unavailable'},503); }
}
