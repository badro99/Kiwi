import { json } from '../../auth/_lib.js';
import { authorize } from './commercial.js';
import { readCommercial } from './_commercial.js';
import { hydrateReservation, resolveStayActor } from './_stay-events.js';
import { draftIdOK, digest, draftSource, draftRooms, buildDraft } from './_billing-draft.js';
const reply=(b,s=200)=>json(b,s,{'Cache-Control':'no-store'});
// The identical ordered snapshot is compared inside the single CAS write.
// An added room, cancellation or changed price cannot race a saved draft.
/* A completed individual stay must remain billable even when an older
 * checkout/sync path left a stale dossierId in raw_json.  A group id still
 * finds every member, while an exact reservation id is always accepted as a
 * safe fallback.  Keep the predicate identical in GET and the CAS write. */
const snapshotSQL=`SELECT COALESCE(json_group_array(json_object('id',id,'code',code,'room_type_id',room_type_id,'room_id',room_id,'check_in',check_in,'check_out',check_out,'start_at',start_at,'end_at',end_at,'status',status,'party_size',party_size,'customer_name',customer_name,'rate',rate,'total',total,'updated_ts',updated_ts,'raw_json',raw_json)),'[]') FROM (SELECT * FROM hotel_reservations WHERE merchant=? AND (id=? OR COALESCE(NULLIF(CASE WHEN json_valid(raw_json) THEN json_extract(raw_json,'$.hotel.dossierId') END,''),id)=?) ORDER BY id LIMIT 201)`;
async function load(env,merchant,id){
  const row=await env.DB.prepare(snapshotSQL).bind(merchant,id,id).first();
  const raw=Object.values(row||{})[0];
  if(typeof raw!=='string')throw new Error('unavailable');
  const rows=JSON.parse(raw);
  if(!rows.length)throw Object.assign(new Error(),{code:'dossier-not-found'});
  if(rows.length>200)throw Object.assign(new Error(),{code:'billing-limit'});
  const stays=rows.map(hydrateReservation);
  // The rooms list must survive broken billing material: a legacy row, a bad
  // status or a stale accepted quote hides no room. Money stays strict.
  let directory, directoryError=null;
  try { directory=await readCommercial(env,merchant); }
  catch(_) { directory={rev:0,accounts:[]}; directoryError='directory-unreadable'; }
  const feature='hotel-billing-draft:'+id;
  const stored=await env.DB.prepare('SELECT data,rev FROM store_docs WHERE merchant=? AND feature=?').bind(merchant,feature).first();
  // A malformed saved draft no longer bricks its dossier. The stored document
  // is left untouched and the next save overwrites it through the normal CAS.
  let saved=null, savedWarning=null;
  if (stored) { try { saved=JSON.parse(stored.data); if(!saved?.draft||saved.draft.kind!=='preinvoice'||!saved.input) throw new Error('bad-shape'); } catch(_) { saved=null; savedWarning='saved-unreadable'; } }
  let source, billingError=directoryError;
  try { source=draftSource(stays,directory.accounts); }
  catch(e) { source=draftRooms(stays,directory.accounts); billingError=billingError||e.code||'billing-source-invalid'; }
  return {raw,source,feature,rev:stored?Number(stored.rev):0,saved,savedWarning,sourceDigest:await digest(raw),directoryRev:directory.rev,billingError};
}
export async function onRequestGet({request,env}){
  try{
    const u=new URL(request.url),merchant=await authorize(request,env,u.searchParams.get('merchant')),id=u.searchParams.get('dossierId');
    if(!merchant)return reply({error:'unauthorized'},401);
    if(!draftIdOK(id))return reply({error:'invalid-dossier'},400);
    const d=await load(env,merchant,id);
    let preview=null, billingError=d.billingError;
    if (!billingError) {
      try { preview=buildDraft(d.source,{extras:[],allocations:[]}); }
      catch(e) { billingError=e.code||'billing-build-failed'; }
    }
    if (billingError) d.source={...d.source,lines:[]};
    return reply({ok:true,dossierId:id,rev:d.rev,sourceDigest:d.sourceDigest,directoryRev:d.directoryRev,source:d.source,
      saved:d.saved,savedWarning:d.savedWarning,stale:!!d.saved&&(d.saved.sourceDigest!==d.sourceDigest||d.saved.directoryRev!==d.directoryRev),preview,billingError});
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
    // Writes fail closed with the specific reason while reads stay open:
    // without trustworthy lines there is nothing a draft may allocate.
    if (d.billingError) return reply({error:d.billingError},409);
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
      .bind(merchant,d.feature,data,now,merchant,b.dossierId,b.dossierId,d.raw,merchant,d.directoryRev,d.rev,merchant,d.feature,d.rev,d.rev).run();
    if(Number(result.meta?.changes)!==1)return reply({error:'draft-stale'},409);
    return reply({ok:true,rev:d.rev+1,saved});
  }catch(e){return reply({error:e.code||'billing-unavailable'},e.code?400:503);}
}
