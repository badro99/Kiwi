import { json } from '../../auth/_lib.js';
import { authorize } from './commercial.js';
import { readCommercial } from './_commercial.js';
import { hydrateReservation, resolveStayActor } from './_stay-events.js';
import { draftIdOK, digest, draftSource, buildDraft } from './_billing-draft.js';
const reply=(b,s=200)=>json(b,s,{'Cache-Control':'no-store'});
// The identical ordered snapshot is compared inside the single CAS write.
// An added room, cancellation or changed price cannot race a saved draft.
const snapshotSQL=`SELECT COALESCE(json_group_array(json_object('id',id,'code',code,'room_type_id',room_type_id,'room_id',room_id,'check_in',check_in,'check_out',check_out,'start_at',start_at,'end_at',end_at,'status',status,'party_size',party_size,'customer_name',customer_name,'rate',rate,'total',total,'updated_ts',updated_ts,'raw_json',raw_json)),'[]') FROM (SELECT * FROM hotel_reservations WHERE merchant=? AND COALESCE(NULLIF(CASE WHEN json_valid(raw_json) THEN json_extract(raw_json,'$.hotel.dossierId') END,''),id)=? ORDER BY id LIMIT 201)`;
async function load(env,merchant,id){
  const row=await env.DB.prepare(snapshotSQL).bind(merchant,id).first();
  const raw=Object.values(row||{})[0];
  if(typeof raw!=='string')throw new Error('unavailable');
  const rows=JSON.parse(raw);
  if(!rows.length)throw Object.assign(new Error(),{code:'dossier-not-found'});
  if(rows.length>200)throw Object.assign(new Error(),{code:'billing-limit'});
  for(const r of rows) { if(!r.raw_json||!JSON.parse(r.raw_json)?.hotel)throw new Error('invalid-source'); }
  const directory=await readCommercial(env,merchant);
  const source=draftSource(rows.map(hydrateReservation),directory.accounts);
  const feature='hotel-billing-draft:'+id;
  const stored=await env.DB.prepare('SELECT data,rev FROM store_docs WHERE merchant=? AND feature=?').bind(merchant,feature).first();
  const saved=stored?JSON.parse(stored.data):null;
  if(saved&&(!saved.draft||saved.draft.kind!=='preinvoice'||!saved.input))throw new Error('invalid-draft');
  return {raw,source,feature,rev:stored?Number(stored.rev):0,saved,sourceDigest:await digest(raw),directoryRev:directory.rev};
}
export async function onRequestGet({request,env}){
  try{
    const u=new URL(request.url),merchant=await authorize(request,env,u.searchParams.get('merchant')),id=u.searchParams.get('dossierId');
    if(!merchant)return reply({error:'unauthorized'},401);
    if(!draftIdOK(id))return reply({error:'invalid-dossier'},400);
    const d=await load(env,merchant,id);
    return reply({ok:true,dossierId:id,rev:d.rev,sourceDigest:d.sourceDigest,directoryRev:d.directoryRev,source:d.source,
      saved:d.saved,stale:!!d.saved&&(d.saved.sourceDigest!==d.sourceDigest||d.saved.directoryRev!==d.directoryRev),preview:buildDraft(d.source,{extras:[],allocations:[]})});
  }catch(e){return reply({error:e.code||'billing-unavailable'},e.code==='dossier-not-found'?404:503);}
}
export async function onRequestPost({request,env}){
  let b;try{b=await request.json();}catch(_){return reply({error:'bad-json'},400);}
  try{
    const merchant=await authorize(request,env,b?.merchant);
    if(!merchant)return reply({error:'unauthorized'},401);
    if(b.action!=='save-draft')return reply({error:'final-invoicing-not-enabled'},409);
    if(!draftIdOK(b.dossierId)||!draftIdOK(b.commandId))return reply({error:'invalid-dossier'},400);
    const d=await load(env,merchant,b.dossierId);
    const requestHash=await digest(JSON.stringify({sourceDigest:b.sourceDigest,directoryRev:b.directoryRev,input:b.input}));
    if(d.saved?.commandId===b.commandId){
      if(d.saved.requestHash!==requestHash)return reply({error:'command-conflict'},409);
      return reply({ok:true,rev:d.rev,saved:d.saved,replayed:true});
    }
    if(b.rev!==d.rev||b.sourceDigest!==d.sourceDigest||b.directoryRev!==d.directoryRev)return reply({error:'draft-stale'},409);
    const draft=buildDraft(d.source,b.input||{}),actor=await resolveStayActor(request,env,merchant),now=Date.now();
    const saved={draft,input:b.input,sourceDigest:d.sourceDigest,directoryRev:d.directoryRev,commandId:b.commandId,requestHash,updatedAt:now,actor};
    const data=JSON.stringify(saved);if(new TextEncoder().encode(data).length>1000000)return reply({error:'billing-limit'},400);
    const directoryCheck="COALESCE((SELECT rev FROM store_docs WHERE merchant=? AND feature='hotel-commercial'),0)=?";
    const result=await env.DB.prepare(`INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) SELECT ?,?,?,1,? WHERE (${snapshotSQL})=? AND ${directoryCheck} AND (?=0 OR EXISTS(SELECT 1 FROM store_docs WHERE merchant=? AND feature=? AND rev=?))
      ON CONFLICT(merchant,feature) DO UPDATE SET data=excluded.data,rev=store_docs.rev+1,updated_ts=excluded.updated_ts WHERE store_docs.rev=?`)
      .bind(merchant,d.feature,data,now,merchant,b.dossierId,d.raw,merchant,d.directoryRev,d.rev,merchant,d.feature,d.rev,d.rev).run();
    if(Number(result.meta?.changes)!==1)return reply({error:'draft-stale'},409);
    return reply({ok:true,rev:d.rev+1,saved});
  }catch(e){return reply({error:e.code||'billing-unavailable'},e.code?400:503);}
}
