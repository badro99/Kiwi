import { json, isOperator, isSeniorOperator, sendMail } from '../../auth/_lib.js';
import { ensureSupport, cleanText, parseJson, supportActor } from '../_support.js';
import { publicTriage, consoleRank, retriageTicket, escalationOf } from '../_support-triage.js';

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
  /* Le tri automatique (Clef) n'existe que côté équipe. `triage_alert` est fondu dans
     `triage.alert` ; une demande jamais triée a `triage: null` (affiché « non triée »). */
  const {triage_alert,...rest}=row;
  return {...rest,triage:publicTriage(row),diagnostics:parseJson(row.diagnostics,{}),messages:messages.results||[],attachments:attachments.results||[]};
}
export async function onRequestGet({request,env}){
  const bad=await guard(request,env,false); if(bad)return bad;
  const u=new URL(request.url), status=cleanText(u.searchParams.get('status')||'',24), merchant=cleanText(u.searchParams.get('merchant')||'',64);
  /* La lecture légère du bandeau de la console : les demandes urgentes encore ouvertes
     (tous établissements) et combien n'ont reçu aucune alerte courriel. */
  if(u.searchParams.get('escalation')){
    const rows=await env.DB.prepare(`SELECT id,reference,merchant,priority,status,created_ts,triage,triage_alert FROM support_tickets WHERE status='open' AND (priority='urgent' OR json_extract(triage,'$.verdict')='urgent') ORDER BY created_ts DESC LIMIT 200`).all();
    return json({escalation:escalationOf(rows.results||[])});
  }
  const where=[], binds=[];
  if(status&&status!=='all'){where.push('status=?');binds.push(status);}
  if(merchant){where.push('merchant=?');binds.push(merchant);}
  const sql=`SELECT * FROM support_tickets ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, updated_ts DESC LIMIT 200`;
  const rows=await env.DB.prepare(sql).bind(...binds).all();
  const tickets=[]; for(const row of rows.results||[])tickets.push(await hydrate(env,row));
  /* Tri stable : alerte IA d'abord, puis urgence par mots-clés ou « à vérifier », puis le reste ;
     à rang égal l'ordre SQL (récent d'abord) est conservé. */
  tickets.sort((a,b)=>consoleRank(a)-consoleRank(b));
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
    await env.DB.batch([
      env.DB.prepare(`UPDATE support_tickets SET assignee=?,updated_ts=? WHERE id=?`).bind(assignee,now,id),
      env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'assignment','internal',actor,assignee?'Assigné à '+assignee:'Non assigné','',now),
    ]);
  }else if(action==='status'){
    const status=['open','waiting-client','resolved','closed'].includes(b.status)?b.status:'';
    if(!status)return json({error:'bad-status'},400);
    /* Le changement de statut et sa trace (qui, quand, de quoi vers quoi) partent
       dans le même batch : un statut changé sans auteur n'existe pas. */
    await env.DB.batch([
      env.DB.prepare(`UPDATE support_tickets SET status=?,updated_ts=?,closed_ts=? WHERE id=?`).bind(status,now,status==='closed'?now:null,id),
      env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'status','internal',actor,'Statut : '+(ticket.status||'')+' → '+status,'',now),
    ]);
  }else if(action==='note'){
    const body=cleanText(b.body,5000); if(!body)return json({error:'body-required'},400);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'note','internal',actor,body,'',now),
      env.DB.prepare(`UPDATE support_tickets SET updated_ts=? WHERE id=?`).bind(now,id),
    ]);
  }else if(action==='reply'){
    const body=cleanText(b.body,5000); if(!body)return json({error:'body-required'},400);
    /** @type {{ok: boolean, reason?: string}} */
    let delivery={ok:false,reason:'manual-whatsapp-handoff'};
    if(ticket.channel==='email')delivery=await sendMail(env,{to:ticket.contact,subject:`Re: ${ticket.reference} · Kiwi Support`,text:`${body}\n\nRépondez à cet e-mail en gardant ${ticket.reference} dans l’objet.`});
    /* La réponse consignée et le statut qui en découle partent dans le même batch :
       un message sans changement de statut (ou l'inverse) laisserait le fil et la
       file de l'équipe en désaccord. Un renvoi WhatsApp manuel ou un courriel
       échoué n'a pas atteint le client : la demande reste ouverte. */
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'reply',ticket.channel,actor,body,delivery.ok?'sent':delivery.reason,now),
      env.DB.prepare(`UPDATE support_tickets SET status=?,updated_ts=? WHERE id=?`).bind(delivery.ok?'waiting-client':'open',now,id),
    ]);
    return json({ok:true,delivery,whatsapp:ticket.channel==='whatsapp'?{contact:ticket.contact,text:`${ticket.reference} · ${body}`} : null});
  }else if(action==='retriage'){
    /* Relance du tri par un opérateur senior : l'issue (réussie ou non) est consignée dans le fil interne. */
    const result=await retriageTicket(env,ticket,now);
    await env.DB.batch([
      ...(result.status==='triaged'?[env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`).bind('msg-'+crypto.randomUUID(),id,'triage','internal',actor,'Tri relancé : '+(result.triage.verdict||'normal')+(result.triage.alert?' · alerte '+result.triage.alert.state:''),'',now)]:[]),
      env.DB.prepare(`UPDATE support_tickets SET updated_ts=? WHERE id=?`).bind(now,id),
    ]);
  }else return json({error:'bad-action'},400);
  return json({ok:true,ticket:await hydrate(env,await env.DB.prepare(`SELECT * FROM support_tickets WHERE id=?`).bind(id).first())});
}
