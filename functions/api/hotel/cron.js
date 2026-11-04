// Private target for the always-on hotel scheduler. The Worker owns no D1 or
// R2 credentials; it can only ask this Pages project to run bounded jobs.
import { json } from '../../auth/_lib.js';
import { syncHotelChannels } from './_channels.js';
import { cleanupHotelMediaAll } from './_media_cleanup.js';
import { retryPendingAlerts } from '../_support-triage.js';

function same(a,b){a=String(a||'');b=String(b||'');if(!a||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export async function onRequestPost({request,env}){
  if(!env.DB||!env.AUTH_SECRET||!env.HOTEL_CRON_SECRET)return json({error:'not-configured'},503);
  const sent=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!same(sent,env.HOTEL_CRON_SECRET))return json({error:'unauthorized'},401);
  let body={};try{body=await request.json();}catch(_){}
  if(body.action==='sync')return json(await syncHotelChannels(env,{limit:25}));
  if(body.action!=='maintenance')return json({error:'bad-action'},400);
  const sync=await syncHotelChannels(env,{limit:25});
  const cleanup=env.MEDIA?await cleanupHotelMediaAll(env):{ok:false,skipped:true,error:'no-media'};
  /* Same always-on schedule also re-sends urgent support alerts that failed, so
     recovery never waits for an operator to relaunch triage. Never fails the run. */
  let support;try{support=await retryPendingAlerts(env);}catch(_){support={error:'unexpected'};}
  return json({ok:true,sync,cleanup,support});
}
