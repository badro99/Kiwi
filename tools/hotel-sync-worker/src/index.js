// Always-on scheduler for hotel channel calendars. Pages retains all database
// and encryption keys; this Worker holds only a narrow invocation secret.
export async function run(env){
  if(!env.HOTEL_CRON_SECRET)return{ok:false,error:'not-configured'};
  const base=String(env.KIWI_BASE_URL||'https://kiwi-os.com').replace(/\/$/,'');
  const call=env.HOTEL_CRON_FETCH||fetch;
  const res=await call(base+'/api/hotel/cron',{method:'POST',headers:{Authorization:'Bearer '+env.HOTEL_CRON_SECRET,'Content-Type':'application/json'},body:JSON.stringify({action:'sync'})});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error('hotel-cron-http-'+res.status+':'+String(body.error||'unknown'));
  return body;
}
export default{
  async scheduled(_controller,env,ctx){ctx.waitUntil(run(env).then((result)=>{if(result.processed||result.failed)console.log(JSON.stringify({event:'hotel-channel-sync',...result}));}).catch((error)=>console.error('[hotel-channel-sync]',error.message)));},
  async fetch(request){const url=new URL(request.url);if(url.pathname!=='/health')return new Response('Not found',{status:404});return Response.json({ok:true,service:'kiwi-hotel-sync',scheduled:'every 15 minutes'},{headers:{'Cache-Control':'no-store'}});},
};
