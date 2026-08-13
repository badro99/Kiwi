import { tenantFor } from '../../_private.js';

const nope=()=>new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
export async function onRequestGet({request,env,params}){
  if(!env||!env.DB||!env.MEDIA)return nope();
  const raw=Array.isArray(params.key)?params.key.join('/'):String(params.key||'');
  const id=raw.split('/').pop();
  if(!/^attachment-[\w-]+$/.test(id||''))return nope();
  const row=await env.DB.prepare(`SELECT * FROM support_attachments WHERE id=?`).bind(id).first();
  if(!row)return nope();
  const tenant=await tenantFor(request,env,row.merchant);
  if(tenant!==row.merchant)return nope();
  const object=await env.MEDIA.get(row.object_key); if(!object)return nope();
  const h=new Headers(); object.writeHttpMetadata(h); h.set('Cache-Control','private, no-store'); h.set('X-Content-Type-Options','nosniff');
  h.set('Content-Disposition',`inline; filename="${String(row.name||'attachment').replace(/["\r\n]/g,'')}"`);
  return new Response(object.body,{headers:h});
}
