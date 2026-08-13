import { json, isOperator, isSeniorOperator, sendMail } from '../../auth/_lib.js';
import { ensureSupport, cleanText, parseJson, supportActor } from '../_support.js';

async function guard(request,env,write){
  const ok=write?await isSeniorOperator(request,env):await isOperator(request,env);
  if(!ok)return json({error:'forbidden'},403);
  if(!env||!env.DB)return json({error:'no-db'},503);
  await ensureSupport(env); return null;
}
async function hydrate(env,row){
  const [messages,attachments]=await Promise.all([
    env.DB.prepare(`SELECT id,kind,channel,author,body,delivery,ts FROM support_messages WHERE ticket_id=? ORDER BY ts`).bind(row.id).all(),
    env.DB.prepare(`SELECT id,name,mime,size,created_ts FROM support_attachments WHERE ticket_id=? ORDER BY created_ts`).bind(row.id).all(),
  ]);
  return {...row,diagnostics:parseJson(row.diagnostics,{}),messages:messages.results||[],attachments:attachments.results||[]};
}
export async function onRequestGet({request,env}){
  const bad=await guard(request,env,false); if(bad)return bad;
  const u=new URL(request.url), status=cleanText(u.searchParams.get('status')||'',24), merchant=cleanText(u.searchParams.get('merchant')||'',64);
  const where=[], binds=[];
  if(status&&status!=='all'){where.push('status=?');binds.push(status);}
  if(merchant){where.push('merchant=?');binds.push(merchant);}
  const sql=`SELECT * FROM support_tickets ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, updated_ts DESC LIMIT 200`;
  const rows=await env.DB.prepare(sql).bind(...binds).all();
  const tickets=[]; for(const row of rows.results||[])tickets.push(await hydrate(env,row));
  return json({tickets});
}
export async function onRequestPatch({request,env}){
  const bad=await guard(request,env,true); if(bad)return bad;
  let b; try{b=await request.json();}catch(_){return json({error:'bad-json'},400);}
  const id=cleanText(b.id,96), action=cleanText(b.action,32);
  const ticket=await env.DB.prepare(`SELECT * FROM support_tickets WHERE id=?`).bind(id).first();
  if(!ticket)return json({error:'not-found'},404);
  const actor=await supportActor(request,env), now=Date.now();
  if(action==='assign'){
    const assignee=cleanText(b.assignee,80);
    await env.DB.prepare(`UPDATE support_tickets SET assignee=?,updated_ts=? WHERE id=?`).bind(assignee,now,id).run();
    await env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'assignment','internal',actor,assignee?'Assigné à '+assignee:'Non assigné','',now).run();
  }else if(action==='status'){
    const status=['open','waiting-client','resolved','closed'].includes(b.status)?b.status:'';
    if(!status)return json({error:'bad-status'},400);
    await env.DB.prepare(`UPDATE support_tickets SET status=?,updated_ts=?,closed_ts=? WHERE id=?`).bind(status,now,status==='closed'?now:null,id).run();
  }else if(action==='note'){
    const body=cleanText(b.body,5000); if(!body)return json({error:'body-required'},400);
    await env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'note','internal',actor,body,'',now).run();
    await env.DB.prepare(`UPDATE support_tickets SET updated_ts=? WHERE id=?`).bind(now,id).run();
  }else if(action==='reply'){
    const body=cleanText(b.body,5000); if(!body)return json({error:'body-required'},400);
    let delivery={ok:false,reason:'manual-whatsapp-handoff'};
    if(ticket.channel==='email')delivery=await sendMail(env,{to:ticket.contact,subject:`Re: ${ticket.reference} · Kiwi Support`,text:`${body}\n\nRépondez à cet e-mail en gardant ${ticket.reference} dans l’objet.`});
    await env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'reply',ticket.channel,actor,body,delivery.ok?'sent':delivery.reason,now).run();
    await env.DB.prepare(`UPDATE support_tickets SET status='waiting-client',updated_ts=? WHERE id=?`).bind(now,id).run();
    return json({ok:true,delivery,whatsapp:ticket.channel==='whatsapp'?{contact:ticket.contact,text:`${ticket.reference} · ${body}`} : null});
  }else return json({error:'bad-action'},400);
  return json({ok:true,ticket:await hydrate(env,await env.DB.prepare(`SELECT * FROM support_tickets WHERE id=?`).bind(id).first())});
}
