import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { deadlineFetch } from '../assets/request-deadline.mjs';
import { readReplayProgress } from '../functions/api/shopify/_replay-orders.js';
import { enqueueStockChanges } from '../functions/api/shopify/_lib.js';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let failed = 0;
async function test(name, fn) { try { await fn(); console.log('✓ ' + name); } catch (e) { failed++; console.error('✗ ' + name, e.message); } }
function extract(source, name) {
 let start = source.indexOf('function ' + name + '('); assert.ok(start >= 0, name);
 if(source.slice(start-6,start)==='async ') start-=6;
 for(let end=start;end<source.length;end++) if(source[end]==='}') {
  const text=source.slice(start,end+1);
  try {new vm.Script(text);return text;}catch(e){if(!(e instanceof SyntaxError))throw e;}
 }
 throw new Error('No declaration: '+name);
}
const transportSource = source => source.replace(/import\(['"][^'"]*request-deadline\.mjs['"]\)/g, 'Promise.resolve({deadlineFetch: boundedFetch})');
const waitFor = promise => new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('UI did not recover')),100);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
await test('invoices#0 full venue identity and legacy cache read', () => {
 const source = read('assets/invoicing.js');
 const id = 'a'.repeat(32) + 'suffix';
 const ctx = vm.createContext({window:{KiwiVenue:{getVenue:()=>id}}});
 assert.equal(vm.runInContext('(' + extract(source,'venueId') + ')()',ctx), id);
 assert.ok(source.includes("k.replace(':' + id"));
 const legacy = 'kiwi:invdocs:cache:v2:' + id.slice(0,32);
 ctx.localStorage = {getItem:k=>k===legacy?'foreign ambiguous cache':null};ctx.ownData=()=>true;
 const getter=source.slice(source.indexOf('const lsGet ='),source.indexOf('  const lsSet ='));
 vm.runInContext(extract(source,'venueId')+'\n'+getter+'\nthis.get=lsGet;',ctx);
 assert.equal(ctx.get('kiwi:invdocs:cache:v2:'+id),null,'ambiguous old key cannot cross venues');
});
for (const [name, file, target] of [
 ['invoices#1','assets/invoicing.js','/api/invoice?'],
 ['booking#0 hotel#0','assets/booking.js','/api/booking'],
 ['app#0','app/src/native-shell.js','/api/me'],
 ['returns#0','assets/pages-pro/boutique-promos-returns.js','/api/store-credits']
]) await test(name + ' bounded network and body', async () => {
 const source = read(file);
 assert.ok(source.includes('request-deadline.mjs'));
 assert.ok(!new RegExp('(?:await |return |    )fetch\\([\"\x27]' + target.replace(/[?]/g,'\\?')).test(source), 'plain endpoint fetch');
 const old = globalThis.fetch;
 try {
  globalThis.fetch = () => new Promise(()=>{});
  await assert.rejects(deadlineFetch(target,{},5), /request-timeout/);
  globalThis.fetch = async () => ({json:()=>new Promise(()=>{})});
  const response = await deadlineFetch(target,{},5);
  await assert.rejects(response.json(), /request-timeout/);
 } finally { globalThis.fetch = old; }
 if (name==='invoices#1') assert.ok(!source.includes('.catch(() => {});'));
 if (name==='returns#0') assert.ok(source.includes('Credits unavailable. Try again shortly.'));
});
await test('economat#1 configuration failure stays an error', () => {
 const source=read('assets/hotel-economat-requests.js');
 for (const feature of ['hotel-units','economat-catalogue']) assert.ok(!source.split('\n').find(l=>l.includes('feature='+feature)).includes('catch'),feature);
});
await test('shopify#0 damaged progress rejects, absent progress is empty',async()=>{
 const env = value => ({DB:{prepare:()=>({bind:()=>({first:async()=>value})})}});
 assert.equal(await readReplayProgress(env(null),'shop'),null);
 for (const data of ['{', 'null', '[]', '{}', JSON.stringify({since:0,done:-1,after:null,more:false})]) await assert.rejects(readReplayProgress(env({data}),'shop'), /replay-progress-corrupt/);
});
await test('shopify#1 mapping read failure rejects',async()=>{
 const env={DB:{prepare:sql=>({bind:()=>({first:async()=>({status:'active',location_id:'location'}),all:async()=>{throw new Error('unavailable');}})})}};
 await assert.rejects(enqueueStockChanges(env,'shop',{variants:[]},{variants:[{id:'v',stock:1}]},1,false), /shopify-mappings-unavailable/);
 const errors=[];
 const ctx=vm.createContext({enqueueStockChanges:async()=>{throw new Error('shopify-mappings-unavailable');},flushShopifyOutbox(){throw new Error('must not flush');},Date});
 vm.runInContext(extract(read('functions/api/catalog.js'),'scheduleShopifySync'),ctx);
 await ctx.scheduleShopifySync({DB:{prepare:()=>({bind:(...args)=>({run:async()=>errors.push(args)})})}},'shop',{}, {},1);
 assert.equal(errors[0]?.[0],'shopify-sync-unavailable','catalogue records a visible sync failure');

});
await test('dayreport#0 failed archive write is explicit and does not push',()=>{
 const source=read('assets/day-report.js');let pushed=0;
 const ctx=vm.createContext({localStorage:{setItem(){throw new Error('quota');}},localKey:()=> 'book',pruneToBudget(){},push(){pushed++;}});
 vm.runInContext(extract(source,'lset')+'\n'+extract(source,'writeAll'),ctx);
 assert.equal(vm.runInContext('writeAll({},"shop")',ctx),false);assert.equal(pushed,0);
 assert.ok(source.includes("if (!writeAll(doc, slug)) return false"));
});
await test('sync#0 ref identity uses full framed SHA256 and legacy ids remain',()=>{
 const ctx=vm.createContext({window:{},unescape,encodeURIComponent});
 vm.runInContext(read('assets/live-link/sale-identity.js'),ctx);
 const source=read('assets/live-link.js');
 vm.runInContext(extract(source,'stableId'),ctx);
 const suffix='shared-'.repeat(6), seen=new Map();let pair;
 for(let i=0;i<200000&&!pair;i++){
  const ref='long-reference-'+createHash('sha256').update(String(i)).digest('hex').slice(0,24)+'-'+suffix;let hash=2166136261;
  for(const ch of 'shop|'+ref){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  if(seen.has(hash))pair=[seen.get(hash),ref];else seen.set(hash,ref);
 }
 assert.ok(pair,'fixture finds an old FNV collision with identical suffix');
 assert.notEqual(ctx.stableId('shop',{ref:pair[0]}),ctx.stableId('shop',{ref:pair[1]}));
 for(const ref of ['a'.repeat(200)+'suffix','b'.repeat(200)+'suffix','مرحبا']){
 const entry={ref,idDay:'20261026'};
 assert.equal(ctx.window.KiwiSaleIdentity('shop',entry),createHash('sha256').update(JSON.stringify(['shop',ref,entry.idDay])).digest('hex'));
 }
 assert.ok(source.includes("return 'sale-ref-'"));
});
for(const file of ['functions/api/order/index.js','functions/api/order/_queue-create.js']) await test('orderpro#0 missing column fails closed '+file,()=>{
 const source=read(file);
 assert.ok(!source.includes("pas d'idempotence, comme avant"));
 assert.ok(source.includes("if (clientRef) return json({ error: 'idempotency-unavailable' }, 503)"));
});
await test('booking#0 hotel#0 stalled reads and cancellation recover their UI',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});
 try {
  for(const name of ['init','loadSlots','loadHotelRooms','openManage','cancelBooking']){
   const messages=[];
   const state={lang:'en',service:{id:'service'},date:'2026-10-26',partySize:2,hotelRooms:[{id:'obsolete'}]};
   const ctx=vm.createContext({state,merchant:'fixture',manageToken:'',slotSeq:0,hotelSeq:0,party:()=>2,
    boundedFetch:(u,o)=>deadlineFetch(u,o,5),fetch:globalThis.fetch,encodeURIComponent,
    t:x=>x,ht:x=>x,mt:x=>x,closed:x=>messages.push(x),renderTimes(){},hotelRoomList(){},
    renderManage:(_data,_mode,message)=>messages.push(message),app:{querySelector:()=>null}});
   vm.runInContext(transportSource(extract(read('assets/booking.js'),name)),ctx);
   await waitFor(ctx[name]({booking:{status:'confirmed'}}));
   if(name==='loadSlots'||name==='loadHotelRooms'){assert.equal(state.loading,false);assert.equal(state.error,'timeout');}
   else assert.ok(messages.includes('timeout'),name+' actionable timeout');
   if(name==='loadHotelRooms')assert.equal(state.hotelRooms.length,0,'stale rooms cannot survive failed availability');
  }
 }finally{globalThis.fetch=old;}
});
await test('invoices#1 stalled register load identifies merchant and reports error',async()=>{
 const old=globalThis.fetch;let requested;globalThis.fetch=u=>{requested=u;return new Promise(()=>{});};
 try {
  let recover;const recovered=new Promise(r=>recover=r);
  const ctx=vm.createContext({fetch:globalThis.fetch,merchantSlug:()=> 'fixture-merchant',boundedFetch:(u,o)=>deadlineFetch(u,o,5),encodeURIComponent,toast:recover,T:()=>({errLoad:'retry-register'})});
  vm.runInContext(transportSource(extract(read('assets/invoicing.js'),'syncServerInvoices')),ctx);
  ctx.syncServerInvoices();assert.equal(await waitFor(recovered),'retry-register');
  assert.equal(requested,'/api/invoice?merchant=fixture-merchant');
 }finally{globalThis.fetch=old;}
});
await test('app#0 native helper rejects a stalled connection',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});
 try{const ctx=vm.createContext({fetch:globalThis.fetch,boundedFetch:(u,o)=>deadlineFetch(u,o,5)});
 vm.runInContext(transportSource(extract(read('app/src/native-shell.js'),'nativeRequest')),ctx);
 await assert.rejects(waitFor(ctx.nativeRequest('/api/me',{})),/request-timeout/);
 }finally{globalThis.fetch=old;}
});
await test('returns#0 stalled list releases loading and mutation rejects',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});
 try{
  let recover;const recovered=new Promise(r=>recover=r);
  const ctx=vm.createContext({fetch:globalThis.fetch,boundedFetch:(u,o)=>deadlineFetch(u,o,5),encodeURIComponent,
   window:{KiwiCloudDoc:{currentSlug:()=> 'fixture'}},realReturnsStore:()=>true,
   liveCreditsOwnerSlug:'',liveCreditsLoadedSlug:'',liveCreditsShown:false,liveCredits:[],liveCreditsChanged:false,liveCreditsLoading:false,
   liveCreditsTimer:0,setTimeout:()=>0,clearTimeout(){},toast:recover,_rL:(_fr,en)=>en,
   document:{querySelector:()=>true},handlers:{'nav-returns'(){}}});
  const source=read('assets/pages-pro/boutique-promos-returns.js');
  vm.runInContext(transportSource(extract(source,'loadLiveCredits')+'\n'+extract(source,'mutateLiveCredit')),ctx);
  ctx.loadLiveCredits();assert.match(await waitFor(recovered),/Try again/);
  for(let i=0;i<5;i++)await Promise.resolve();assert.equal(ctx.liveCreditsLoading,false);
  await assert.rejects(waitFor(ctx.mutateLiveCredit({})),/request-timeout/);
 }finally{globalThis.fetch=old;}
});
await test('economat#1 missing configuration and service failure differ',async()=>{
 for(const feature of ['hotel-units','economat-catalogue'])for(const unavailable of [true,false]){
  const S={requests:[],units:[],catalogue:[]};
  const ctx=vm.createContext({S,merchant:()=> 'fixture',sheet:null,paint(){},encodeURIComponent,
   getJson:async url=>{if(unavailable&&url.includes('feature='+feature))throw new Error('configuration-offline');return url.includes('internal-requests')?{requests:[]}:{data:null};}});
  vm.runInContext(extract(read('assets/hotel-economat-requests.js'),'load'),ctx);await ctx.load();
  assert.equal(S.error,unavailable?'configuration-offline':'');assert.equal(S.loading,false);
 }
});
process.exitCode=failed?1:0;
