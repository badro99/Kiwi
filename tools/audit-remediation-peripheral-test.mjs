import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {onRequestGet as media} from '../functions/api/media/[[key]].js';
import {quotaOk} from '../functions/api/ai/_quota.js';
import {runWithFallback} from '../functions/api/ai/_run.js';
import {fetchUrlText} from '../functions/api/ai/menu-import.js';
let n=0;function check(condition,label){assert.ok(condition,label);console.log('  ok '+(++n)+' - '+label);}
for(const key of ['intake/a/doc.pdf','support/a/ticket/photo.jpg','support/photo.jpg','media/intake/photo.jpg','a/../private.jpg','a/%252e%252e/private.jpg','a/x.html']){
  let reads=0;const r=await media({request:new Request('https://kiwi.test/api/media/'+key),params:{key},env:{MEDIA:{async get(){reads++;return {};}}}});
  check(r.status===404&&reads===0,'private/invalid path refused before storage: '+key);
}
for(const key of ['cafe/photo.jpg','cafe/hotel-room/room.webp','media/cafe/photo.mp4','media/cafe/hotel-room/room.jpg']){
  const r=await media({request:new Request('https://kiwi.test/api/media/'+key),params:{key},env:{MEDIA:{async get(){return {body:'synthetic',httpEtag:'fixture',writeHttpMetadata(h){h.set('content-type','image/jpeg');}};}}}});
  check(r.status===200,'published current/legacy media remains accessible: '+key);
}
const sqlite=new DatabaseSync(':memory:');
const DB={prepare(sql){let params=[];return {bind(...v){params=v;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async run(){return sqlite.prepare(sql).run(...params);}};}};
const results=await Promise.all(Array.from({length:30},()=>quotaOk({DB},'audit','ask',5)));
check(results.filter(Boolean).length===5,'concurrent AI calls respect exact cap');
check(sqlite.prepare('SELECT calls FROM ai_usage_kind').get().calls===5,'quota counter does not exceed cap');
check(await quotaOk({DB:{prepare(){throw new Error('DB unavailable');}}},'audit','ask',5)===false,'unavailable quota storage fails closed');
let calls=0;try{await runWithFallback({AI:{async run(){calls++;throw Object.assign(new Error('quota'),{status:429});}}},'a','b',{});}catch(_){}
check(calls===1,'gateway quota refusal does not call fallback or direct route');
const nativeFetch=globalThis.fetch;
try {
  for (const target of ['https://127.0.0.1/private','https://10.0.0.1/','http://example.com/','https://user:pass@example.com/']) {
    let seen=0;
    globalThis.fetch=async (_url,options)=>{seen++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:target}});};
    const result=await fetchUrlText('https://menu.example.com/');
    check(result.error==='url-forbidden'&&seen===1,'unsafe redirect rejected before request: '+target);
  }
  let seen=0;
  globalThis.fetch=async ()=>{seen++;return seen===1?new Response(null,{status:302,headers:{location:'/menu'}}):new Response('<p>'+('Public menu content '.repeat(20))+'</p>');};
  const result=await fetchUrlText('https://menu.example.com/');
  check(!!result.text&&seen===2,'bounded public relative redirects still import');
} finally {globalThis.fetch=nativeFetch;}
sqlite.close();console.log('ok '+n+' checks');
