// R2 retention for hotel room galleries. Only the dedicated hotel-room prefix
// is eligible; legacy menu/product media can never enter the candidate set.
const KEEP_MS = 7 * 86400000;
const str=(v,n=200)=>String(v==null?'':v).trim().slice(0,n);
function parse(v){try{const x=JSON.parse(v);return x&&typeof x==='object'?x:{};}catch(_){return{};}}
export function hotelRoomMediaKey(value,merchant){
  const url=str(typeof value==='string'?value:value?.url,260), prefixes=['/api/media/media/'+merchant+'/hotel-room/','/api/media/'+merchant+'/hotel-room/'];
  if(!prefixes.some((prefix)=>url.startsWith(prefix)))return'';
  const key=url.slice('/api/media/'.length);
  return /^(?:media\/)?[a-z0-9][a-z0-9-]{2,63}\/hotel-room\/[a-z0-9-]{6,80}\.(?:jpe?g|png|webp|gif|avif)$/i.test(key)?key:'';
}
export async function cleanupHotelMedia(env,options={}){
  const merchant=str(options.merchant,64),dryRun=options.dryRun!==false,now=+options.now||Date.now(),limit=Math.max(1,Math.min(500,+options.limit||100));
  if(!merchant||!env?.DB||!env?.MEDIA)throw new Error('cleanup-not-configured');
  const row=await env.DB.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").bind(merchant).first();
  if(!row)throw new Error('rooms-document-missing');
  const doc=parse(row.data),live=new Set();
  for(const type of (Array.isArray(doc.roomTypes)?doc.roomTypes:[]))for(const photo of (Array.isArray(type?.photos)?type.photos:[])){const key=hotelRoomMediaKey(photo,merchant);if(key)live.add(key);}
  const candidates=[];
  for(const prefix of ['media/'+merchant+'/hotel-room/',merchant+'/hotel-room/']){
    let cursor;
    do{
      const page=await env.MEDIA.list({prefix,limit:1000,...(cursor?{cursor}:{})});
      for(const object of (page.objects||[])){
        const uploaded=object.uploaded instanceof Date?object.uploaded.getTime():Date.parse(object.uploaded||0);
        if(!live.has(object.key)&&uploaded&&uploaded<=now-KEEP_MS)candidates.push(object.key);
        if(candidates.length>=limit)break;
      }
      cursor=page.truncated&&candidates.length<limit?page.cursor:'';
    }while(cursor);
    if(candidates.length>=limit)break;
  }
  if(!dryRun&&candidates.length)await env.MEDIA.delete(candidates);
  return{ok:true,merchant,dryRun,live:live.size,candidates:candidates.length,deleted:dryRun?0:candidates.length,keys:dryRun?candidates:[]};
}
export async function cleanupHotelMediaAll(env,options={}){
  const result=await env.DB.prepare("SELECT merchant FROM merchant_config WHERE status='active' AND LOWER(type) IN ('hotel','riad') ORDER BY merchant LIMIT 100").all(),rows=[];
  for(const item of result.results||[]){try{rows.push(await cleanupHotelMedia(env,{merchant:item.merchant,dryRun:false,limit:100,now:options.now}));}catch(error){rows.push({ok:false,merchant:item.merchant,error:str(error?.message||error,160)});}}
  return{ok:true,processed:rows.length,failed:rows.filter((x)=>!x.ok).length,deleted:rows.reduce((n,x)=>n+(x.deleted||0),0),results:rows};
}
