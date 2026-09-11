import { json } from '../../auth/_lib.js';
import { ensureSupport, cleanText } from '../_support.js';

export async function onRequestPost({request,env}){
  if(!env||!env.DB||!env.SUPPORT_INBOUND_SECRET)return json({error:'not-configured'},503);
  if(request.headers.get('X-Kiwi-Support-Secret')!==env.SUPPORT_INBOUND_SECRET)return json({error:'forbidden'},403);
  let b;try{b=await request.json();}catch(_){return json({error:'bad-json'},400);}
  await ensureSupport(env);
  const reference=cleanText(b.reference,48),body=cleanText(b.body,5000),channel=b.channel==='whatsapp'?'whatsapp':'email';
  if(!reference||!body)return json({error:'missing-fields'},400);
  const ticket=await env.DB.prepare(`SELECT id FROM support_tickets WHERE reference=?`).bind(reference).first();
  if(!ticket)return json({error:'not-found'},404);
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`)
    .bind('msg-'+crypto.randomUUID(),ticket.id,'client',channel,'client',body,'received',now).run();
  await env.DB.prepare(`UPDATE support_tickets SET status='open',closed_ts=NULL,updated_ts=? WHERE id=?`).bind(now,ticket.id).run();
  return json({ok:true});
}
