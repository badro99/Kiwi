import { json, operatorActor } from '../../auth/_lib.js';
import { guard, clean, merchantKey, merchantExists } from './_workspace.js';
export async function onRequestPost(context){
  const bad=await guard(context,true);if(bad)return bad;
  let b;try{b=await context.request.json();}catch(_){return json({error:'bad-json'},400);}
  const merchant=merchantKey(b.merchant),body=clean(b.body,4000),id=clean(b.id,100);
  if(!merchant||!body||!/^[a-zA-Z0-9_-]{8,100}$/.test(id))return json({error:'invalid-note'},400);
  try{
    if(!(await merchantExists(context.env,merchant)))return json({error:'merchant-not-found'},404);
    const actor=await operatorActor(context.request,context.env);
    await context.env.DB.prepare('INSERT INTO operator_notes(id,merchant,body,actor_id,actor,ts) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,merchant,body,actor.id,actor.label,Date.now()).run();
    const note=await context.env.DB.prepare('SELECT id,merchant,body,actor,ts FROM operator_notes WHERE id=?').bind(id).first();
    if(note.merchant!==merchant||note.body!==body)return json({error:'id-conflict'},409);
    return json({ok:true,note});
  }catch(_){return json({error:'notes-storage-unavailable'},503);}
}
