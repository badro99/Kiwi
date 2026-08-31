// Private target for the always-on hotel scheduler. The Worker owns no D1 or
// R2 credentials; it can only ask this Pages project to run bounded jobs.
import { json } from '../../auth/_lib.js';
import { syncHotelChannels } from './_channels.js';

function same(a,b){a=String(a||'');b=String(b||'');if(!a||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export async function onRequestPost({request,env}){
  if(!env.DB||!env.AUTH_SECRET||!env.HOTEL_CRON_SECRET)return json({error:'not-configured'},503);
  const sent=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!same(sent,env.HOTEL_CRON_SECRET))return json({error:'unauthorized'},401);
  let body={};try{body=await request.json();}catch(_){}
  if(body.action!=='sync')return json({error:'bad-action'},400);
  return json(await syncHotelChannels(env,{limit:25}));
}
