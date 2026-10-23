// Server-owned recovery ledger. No presence codes or credentials are retained.
import { json, entitledMerchant, activeAccountSession, isOperator, operatorActor, readEmployee } from '../auth/_lib.js';
import { businessDate, merchantZone, merchantCutoff } from './_business-day.js';
import { hoursByDay } from './_worked-hours.js';
const FEATURE = 'attendance-corrections';
const MAX_PENDING_PER_STAFF = 20;
const DECIDED_KEEP_MS = 90 * 24 * 3600000;
async function read(env, merchant, feature, fallback) {
  const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, feature).first();
  // Fail closed on malformed or unavailable documents; never replace them with emptiness.
  return row ? { data: JSON.parse(row.data), rev: Number(row.rev) } : { data: fallback, rev: 0 };
}
async function seed(env, merchant, feature, data) {
  await env.DB.prepare('INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').bind(merchant, feature, JSON.stringify(data), Date.now()).run();
}
export async function retainCorrection(env, merchant, staff, body) {
  const opId = String(body.opId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0,64);
  if (!opId) return json({ error:'attendance-operation-required' },400);
  const receivedTs = Date.now(), delay = Math.floor(Number(body.capturedAgoMs));
  if (!Number.isSafeInteger(delay) || delay <= 12*3600000 || receivedTs-delay <= 0) return json({error:'attendance-capture-invalid'},400);
  try {
    await seed(env, merchant, FEATURE, {items:[]});
    for (let n=0;n<6;n++) {
      const row = await read(env,merchant,FEATURE,{items:[]});
      const existing = row.data.items.find(i=>i.staffId===staff.id && i.opId===opId && i.action===body.action);
      if (existing) return json({ok:true,pendingApproval:existing.status==='pending',correction:existing});
      // Bounded: one person cannot fill the manager's queue, and decided items
      // older than DECIDED_KEEP_MS leave the document (their effect is in attendance).
      if (row.data.items.filter(i=>i.staffId===staff.id && i.status==='pending').length>=MAX_PENDING_PER_STAFF) return json({error:'attendance-corrections-full'},429);
      row.data.items = row.data.items.filter(i=>i.status==='pending' || !(Number(i.decidedAt)>0) || receivedTs-Number(i.decidedAt)<DECIDED_KEEP_MS);
      const item = {id:crypto.randomUUID(),opId,staffId:staff.id,memberId:staff.memberId || staff.id,name:staff.name || '',action:body.action,
        claimedTs:receivedTs-delay,capturedTs:Number.isSafeInteger(body.capturedAt) && body.capturedAt>0 ? body.capturedAt : receivedTs-delay,
        receivedTs,deviceId:String(body.deviceId || 'legacy-device').slice(0,120),status:'pending'};
      row.data.items.push(item);
      const r=await env.DB.prepare('UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?')
        .bind(JSON.stringify(row.data),row.rev+1,receivedTs,merchant,FEATURE,row.rev).run();
      if (Number(r.meta?.changes)>0) return json({ok:true,pendingApproval:true,correction:item});
    }
  } catch (_) {}
  return json({error:'attendance-correction-write-failed'},503);
}
export async function correctionList(env,merchant) {
  return (await read(env,merchant,FEATURE,{items:[]})).data.items.filter(i=>i.status==='pending');
}
export async function decideCorrection(request,env,merchant,body) {
  // Same dashboard owner / named-operator boundary as editing attendance/team.
  if (await entitledMerchant(request,env,merchant)!==merchant) return json({error:'forbidden-merchant'},403);
  const operator=await isOperator(request,env);
  const session=await activeAccountSession(request,env);
  const actor=operator ? {type:'operator',...(await operatorActor(request,env))} : session?.aid ? {type:'owner',id:session.aid} : null;
  if (!actor?.id) return json({error:'attendance-actor-required'},403);
  const employee=await readEmployee(request,env);
  const decision=String(body.decision || '');
  if (!['approved','rejected'].includes(decision)) return json({error:'attendance-decision-invalid'},400);
  try {
    const account=session?.aid ? await env.DB.prepare('SELECT email FROM accounts WHERE id = ?').bind(session.aid).first() : null;
    const accountEmail=String(account?.email || '').trim().toLowerCase();
    const [zone,cutoff]=await Promise.all([merchantZone(env,merchant),merchantCutoff(env,merchant)]);
    await seed(env,merchant,'attendance',{entries:[]});
    await seed(env,merchant,'team',{members:[],hours:{},shifts:{}});
    for(let n=0;n<6;n++) {
      const [c,a,t]=await Promise.all([read(env,merchant,FEATURE,{items:[]}),read(env,merchant,'attendance',{}),read(env,merchant,'team',{})]);
      const item=c.data.items.find(i=>i.id===body.correctionId);
      if(!item)return json({error:'attendance-correction-not-found'},404);
      const member=(t.data.members || []).find(m=>String(m.id)===item.memberId);
      if((employee?.merchant===merchant && employee.staffId===item.staffId) || actor.id===item.staffId
        || (accountEmail && String(member?.email || '').trim().toLowerCase()===accountEmail)) return json({error:'attendance-self-approval-forbidden'},403);
      if(item.status!=='pending')return item.status===decision ? json({ok:true,correction:item,replay:true}) : json({error:'attendance-already-decided'},409);
      if(decision==='approved') {
        const entries=a.data.entries, mine=entries.filter(e=>e && String(e.staffId)===item.staffId);
        const field=item.action==='clock-in'?'clockInOpId':'clockOutOpId';
        // A previously accepted operation must not be counted a second time.
        if(!mine.some(e=>e[field]===item.opId)) {
          const at=item.claimedTs;
          if(item.action==='clock-in') {
            if(mine.some(e=>!e.outTs || e.outTs>at))return json({error:'attendance-correction-conflict'},409);
            entries.push({id:crypto.randomUUID(),staffId:item.staffId,memberId:item.memberId,name:item.name,inTs:at,outTs:0,clockInOpId:item.opId,correctionId:item.id});
          } else {
            const open=mine.filter(e=>!e.outTs && e.inTs<=at);
            if(open.length!==1)return json({error:'attendance-correction-conflict'},409);
            const e=open[0], floor=Math.max(e.inTs,Number(e.pauseTs)||0,...(e.breaks || []).map(b=>Number(b.outTs)||0));
            if(at<floor || mine.some(other=>other!==e && other.inTs<at && (other.outTs || Infinity)>e.inTs)) return json({error:'attendance-correction-conflict'},409);
            if(e.pauseTs){e.breaks=e.breaks || [];e.breaks.push({inTs:e.pauseTs,outTs:at});e.pauseTs=0;}
            e.outTs=at;e.clockOutOpId=item.opId;e.outCorrectionId=item.id;
            const hours=hoursByDay([{key:item.memberId,id:e.id,closed:true,start:e.inTs,end:at,breaks:(e.breaks || []).map(b=>[b.inTs,b.outTs])}],ts=>businessDate(ts,cutoff,zone),ts=>businessDate(ts,0,zone))[item.memberId] || {};
            t.data.hours=t.data.hours || {};const bucket=t.data.hours[item.memberId]=t.data.hours[item.memberId] || {};
            for(const [day,h] of Object.entries(hours))bucket[day]=(Number(bucket[day])||0)+h;
          }
        }
      }
      item.status=decision;item.decidedAt=Date.now();item.actor=actor;item.decisionId=crypto.randomUUID();
      // First statement wins only if ALL revisions still match. Following writes
      // are gated by its unique result, inside the same atomic D1 batch.
      const text=JSON.stringify(c.data),next=c.rev+1,now=Date.now();
      const guard='EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = ? AND rev = ? AND data = ?)';
      const result=await env.DB.batch([
        env.DB.prepare("UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ? AND EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = 'attendance' AND rev = ?) AND EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = 'team' AND rev = ?)")
          .bind(text,next,now,merchant,FEATURE,c.rev,merchant,a.rev,merchant,t.rev),
        env.DB.prepare('UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND '+guard)
          .bind(JSON.stringify(a.data),a.rev+1,now,merchant,'attendance',merchant,FEATURE,next,text),
        env.DB.prepare('UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND '+guard)
          .bind(JSON.stringify(t.data),t.rev+1,now,merchant,'team',merchant,FEATURE,next,text),
      ]);
      if(Number(result[0].meta?.changes)>0)return json({ok:true,correction:item});
    }
  } catch (_) {}
  return json({error:'attendance-correction-write-failed'},503);
}
