// Real client modules; storage transactions, clock and transport are controlled edges.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {declaration as scan} from './js-declarations.cjs';
import {onRequestPost as saleHandler} from '../functions/api/sale.js';
import {tillToken,TILL_COOKIE} from '../functions/auth/_lib.js';
export const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
const cache=new Map();
export function named(text,name){let m=cache.get(text);if(!m)cache.set(text,m=new Map());if(m.has(name))return m.get(name);const re=new RegExp('(?:^|\\n)[ \\t]*(?:async\\s+)?(?:function\\s+'+name+'\\s*\\(|(?:const|let|var)\\s+'+name+'\\s*=)');const found=re.exec(text);if(!found)throw Error('Missing declaration '+name);const out=scan(text.slice(found.index).trimStart(),name);m.set(name,out);return out;}
const files=new Map(),scripts=new Map();
export const read=file=>{if(!files.has(file))files.set(file,fs.readFileSync(path.join(ROOT,file),'utf8'));return files.get(file);};
function run(text,c,opts={}){if(!scripts.has(text))scripts.set(text,new vm.Script(text,opts));return scripts.get(text).runInContext(c);}
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
export async function harness(f){
 const cookies={};for(const m of [f.merchant,'server-other-shop'])cookies[m]=`${TILL_COOKIE}=${await tillToken(f.env.AUTH_SECRET,m)}`;
 const s={values:new Map(),idb:new Map(),meta:new Map(),events:[],requests:[],timers:new Map(),listeners:new Map(),plan:[],gates:[],inflight:new Set(),now:Date.now(),active:f.merchant,online:false,quota:false,private:false,readError:false,capacity:Infinity,idbFail:false,epoch:0,indexed:false,serial:Promise.resolve(),id:0};
 const pools=[vm.createContext({}),vm.createContext({})];let browser;
 const drain=async()=>{for(let n=0;n<12;n++)await new Promise(r=>setImmediate(r));};
 function table(map,key='id'){return{get:async id=>copy(map.get(id)),add:async row=>{if(map.has(row[key]))throw Error('ConstraintError');map.set(row[key],copy(row));return row[key];},put:async row=>{map.set(row[key],copy(row));return row[key];},update:async(id,patch)=>{if(!map.has(id))return 0;map.set(id,{...map.get(id),...copy(patch)});return 1;},delete:async id=>map.delete(id),where:()=>({equals:scope=>{const rows=()=>[...map.values()].filter(r=>r.tenant===scope[0]&&r.channel===scope[1]).map(copy);return{toArray:async()=>rows(),sortBy:async key=>rows().sort((a,b)=>a[key]-b[key])};}})};}
 class Dexie{constructor(){this.outbox=table(s.idb);this.meta=table(s.meta,'key');}version(){return{stores(){}};}open(){return s.idbFail?Promise.reject(Error('IndexedDB denied')):Promise.resolve(this);}transaction(_mode,_table,work){const task=s.serial.then(async()=>{if(s.idbFail)throw Error('IndexedDB denied');const before=copy([...s.idb]);try{return await work();}catch(e){s.idb.clear();for(const [k,v]of before)s.idb.set(k,v);throw e;}});s.serial=task.catch(()=>{});return task;}}
 function storage(epoch){return{getItem:k=>{if(s.readError)throw Error('SecurityError');return s.values.get(k)??null;},setItem:(k,v)=>{if(epoch!==s.epoch||s.private||s.quota&&k==='kiwiSaleQueue'||k==='kiwiSaleQueue'&&String(v).length>s.capacity)throw Error('QuotaExceededError');s.values.set(k,String(v));},removeItem:k=>{if(epoch!==s.epoch||s.private)throw Error('SecurityError');s.values.delete(k);},key:i=>[...s.values.keys()][i]||null,get length(){return s.values.size;}};}
 function emit(target,type,event){for(const fn of s.listeners.get(target+':'+type)||[])fn(event||{type});}
 function request(url,opts={}){
  const epoch=s.epoch,body=opts.body?JSON.parse(opts.body):null,merchant=s.active,mode=body?s.plan.shift()||'ok':'ok';s.requests.push({url:String(url),body:copy(body),merchant,mode});
  const work=(async()=>{
   if(!s.online||mode==='drop')throw new TypeError('offline');
   if([500,503,429,409,400,422].includes(mode))return new Response(JSON.stringify({error:mode===409?'open-service-session-required':'injected'}),{status:mode});
   if(mode==='timeout'){const e=Error('timeout');e.name='AbortError';throw e;}
   const execute=async()=>{
    if(body){const response=await saleHandler({request:new Request('https://kiwi.test/api/sale',{method:'POST',headers:{Cookie:cookies[merchant],'Content-Type':'application/json'},body:JSON.stringify(body)}),env:f.env});return response;}
    const u=new URL(url,'https://kiwi.test');const r=await f.call('feed',Object.fromEntries(u.searchParams),'owner');return new Response(JSON.stringify(r.body),{status:r.status});
   };
   function gate(){return new Promise((resolve,reject)=>{const abort=()=>{const e=Error('timed out');e.name='AbortError';reject(e);};opts.signal?.addEventListener('abort',abort,{once:true});s.gates.push(()=>{opts.signal?.removeEventListener('abort',abort);resolve();});});}
   if(mode==='delay')await gate();
   let response=await execute();
   if(mode==='duplicate'){const again=await execute();if(again.status!==response.status)throw Error('duplicate request changed status');}
   if(mode==='lost'){const e=Error('response lost after commit');e.name='AbortError';throw e;}
   if(mode==='after-commit')await gate();
   if(epoch!==s.epoch){const e=Error('old page gone');e.name='AbortError';throw e;}
   return response;
  })();s.inflight.add(work);work.then(()=>s.inflight.delete(work),()=>s.inflight.delete(work));return work;
 }
 function installStore(c){
  const names=['salesTenant','SALES_KEY','deepFreeze','cachedLedger','salesList','salesWrite','salesEntry','salesAdd','salesAddMany','annotatedEntry','salesAnnotateMany','salesAnnotate','salesRemove','salesRetainCursors','REFUNDS_KEY','refundsList','refundsWrite','refundsAdd','refundsRemove','refundsRetainCursors'];
  c.currentVenue='own';c.TRANSIENT_IDS=['own','scoped'];c.slugOf=()=>s.active;c.salesSubs=new Set();c.refundSubs=new Set();c.ledgerCache=new Map();c.mergeLiveRetention=()=>{};
  run(names.map(n=>named(read('assets/venues.js'),n)).join('\n')+'\nwindow.KiwiSales={list:salesList,add:salesAdd,addMany:salesAddMany,remove:salesRemove,annotate:salesAnnotate,annotateMany:salesAnnotateMany,retainCursors:salesRetainCursors};window.KiwiRefunds={list:refundsList,add:refundsAdd,remove:refundsRemove,retainCursors:refundsRetainCursors};',c);
 }
 async function boot(indexed=s.indexed){
  s.indexed=indexed;s.epoch++;const epoch=s.epoch;s.timers.clear();s.listeners.clear();const c=pools[epoch%2];
  class Clock extends Date{constructor(...args){super(...(args.length?args:[s.now]));}static now(){return s.now;}static [Symbol.hasInstance](x){return x instanceof Date;}}
  const listen=(target)=>({addEventListener:(type,fn)=>{const key=target+':'+type;s.listeners.set(key,[...(s.listeners.get(key)||[]),fn]);},removeEventListener:(type,fn)=>{const key=target+':'+type;s.listeners.set(key,(s.listeners.get(key)||[]).filter(x=>x!==fn));},dispatchEvent:e=>{if(epoch===s.epoch){s.events.push(e);emit(target,e.type,e);}return true;}});
  const localStorage=storage(epoch),document={...listen('document'),readyState:'loading',hidden:false,documentElement:{lang:'fr'},querySelectorAll:()=>[],createElement:()=>({})};
  const window={...listen('window'),document,localStorage,KiwiEnv:{isReal:()=>true},KiwiVenue:{getVenue:()=> 'own',isCustom:()=>true,get:()=>({slug:s.active})},crypto:{randomUUID:()=> 'queue-'+(++s.id)}};
  Object.assign(c,{console,window,document,localStorage,location:{search:'',hostname:'kiwi.test'},navigator:{get onLine(){return s.online;}},Date:Clock,URLSearchParams,URL,AbortController,Uint8Array,crypto:window.crypto,structuredClone,CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},setTimeout:(fn,ms=0)=>{const id=++s.id;s.timers.set(id,{fn,ms,at:s.now+ms,epoch});return id;},clearTimeout:id=>s.timers.delete(id),setInterval:()=>0,clearInterval(){},fetch:request});
  window.window=window;
  if(indexed){window.Dexie=Dexie;run(read('assets/offline-db.js'),c);}
  let source=read('assets/live-link.js');source=source.replace('  window.KiwiLiveLink = window.KiwiLive;','  window.KiwiLiveLink = window.KiwiLive; window.__queue={initOutbox,qRead,qWrite,accumulateFeed,bridgeToStore,applyVoids};');
  run(source,c,{filename:'assets/live-link.js'});installStore(c);
  run(read('assets/retail-sale-hold.js'),c);run(read('assets/pos-sale.js').replace('  window.KiwiPosSale = {','  window.__posHold={heldRead,heldWrite}; window.KiwiPosSale = {'),c);
  c.HELD_SALES_PREFIX='kiwi-caisse-held-sales:';c.heldSalesCache=null;c.journal=[];c.shiftOpenedAt=new Clock();c.shiftMerchant=s.active;c.currentMerchantSlug=()=>s.active;c.paintHeldSales=()=>{};c.persistShift=()=>localStorage.setItem('test:journal',JSON.stringify(c.journal));
  const restaurant=read('assets/caisse-accounting.js')+'\n'+read('assets/caisse-app.js');
  run('(function(){'+['money','reviveJournalEntry','heldSalesKey','heldSaleRows','saveHeldSales','holdSaleLocally','releaseHeldSale','retryHeldSales'].map(n=>named(restaurant,n)).join('\n')+'\nwindow.__restaurant={hold:holdSaleLocally,replay:retryHeldSales,rows:heldSaleRows};})();',c);
  browser={c,window,api:window.KiwiLive,q:window.__queue};if(indexed)await browser.q.initOutbox();await drain();return browser;
 }
 async function until(test,label){const deadline=Date.now()+5000;while(!test()){if(Date.now()>deadline)throw Error(label);await new Promise(r=>setImmediate(r));}}
 async function idle(){await drain();await until(()=>!s.inflight.size,'network failed to settle');await drain();}
 async function flush(force=false){const result=browser.api.flush(force);await result;await idle();}
 async function recover(){s.online=true;emit('window','online');for(let i=0;i<30;i++){s.now+=301000;await flush(true);await browser.api.refreshQueue();const q=browser.api.queueStatus();if(!q.pending&&!q.sending)return;}throw Error('recovery did not drain');}
 async function timers(ms){s.now+=ms;for(const [id,t]of [...s.timers])if(t.epoch===s.epoch&&t.at<=s.now){s.timers.delete(id);t.fn();}await idle();}
 async function reset(indexed=false){await until(()=>{s.gates.splice(0).forEach(f=>f());return !s.inflight.size;},'previous case failed to settle');await drain();await f.reset();s.values.clear();s.idb.clear();s.meta.clear();s.events.length=0;s.requests.length=0;s.plan.length=0;s.now=Date.now();s.active=f.merchant;s.online=false;s.quota=false;s.private=false;s.readError=false;s.capacity=Infinity;s.idbFail=false;s.values.set('kiwiLive','1');s.values.set('kiwiPairedVenue',JSON.stringify({merchant:s.active}));s.values.set('kiwi:posDevice','A7');await boot(indexed);}
 function pair(m){s.active=m;s.values.set('kiwiPairedVenue',JSON.stringify({merchant:m}));s.values.delete('kiwiLiveMerchant');}
 async function feed(){const from=s.now-172800000,to=s.now+172800000;const r=await f.call('feed',{merchant:s.active,window:1,from,to,limit:500},'owner');if(r.status!==200)throw Error(JSON.stringify(r));return r.body.sales;}
 return{s,boot,reset,drain,idle,flush,recover,timers,pair,feed,get b(){return browser;},release:()=>s.gates.splice(0).forEach(f=>f()),waitGate:()=>until(()=>s.gates.length>0,'request never reached delay gate'),queue:()=>JSON.parse(s.values.get('kiwiSaleQueue')||'[]'),emit};
}
