import planningSourceHelper from './planning-test-source.cjs';
import teamOwners from './team-owners-test-source.cjs';
import invoicingSourceHelper from './invoicing-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => name === 'team-hours' ? planningSourceHelper.planningTestSource() : name === 'team' ? teamOwners.originalFile('assets/team.js') : name === 'invoicing' ? invoicingSourceHelper.invoicingTestSource() : fs.readFileSync(new URL('../assets/' + name + '.js', import.meta.url), 'utf8');
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
const drain = async () => { for (let i=0;i<40;i++) await Promise.resolve(); };
function fixture(name, extra={}) {
  const source=read(name), timers=new Map(), requests=[];
  let id=0, healthy=false;
  const c={Promise, Error, Object, URLSearchParams, AbortController, console,
    setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(key){timers.delete(key);},
    fetch(url,opts){requests.push({url,opts});return healthy?Promise.resolve({ok:true,status:200,json:async()=>({ok:true,clients:[],merchant:'shop'})}):new Promise(()=>{});},...extra};
  vm.createContext(c);
  if(source.includes('  function fetchDeadline(')) vm.runInContext(between(source,'  function fetchDeadline(', '\n  }')+'\n  }',c);
  return {source,c,requests,timers,healthy(){healthy=true;},async expire(){await drain();for(const [key,t] of [...timers])if(t.ms===12000){timers.delete(key);t.fn();}await drain();}};
}
async function ended(p,f){let done=false;p.then(()=>done=true,()=>done=true);await f.expire();assert.ok(done,'hung action must settle at its deadline');}
let failures=0;
async function test(name,fn){try{await fn();console.log('✓ '+name);}catch(e){failures++;console.error('✗ '+name+': '+e.message);}}
await test('invoices#0 · deadline reports offline, retry succeeds',async()=>{
 const f=fixture('invoicing',{ownData:()=>true,merchantSlug:()=> 'shop',apiError:code=>Object.assign(new Error(code),{code})});
 vm.runInContext(between(f.source,'  async function api(', '\n  /* ── moteur'),f.c);
 const p=f.c.api('POST',{});const rejected=assert.rejects(p,{code:'offline'});await ended(p,f);await rejected;
 assert.ok(f.requests[0].opts.signal.aborted);f.healthy();assert.equal((await f.c.api('GET',{})).ok,true);assert.equal(f.timers.size,0);
});
await test('team#0 · roster and live reads release failure state and retry',async()=>{
 const notices=[];
 const f=fixture('team',{pageActive:true,trLang:()=> 'en',toast:m=>notices.push(m),teamCloudInit:()=>({enabled:()=>true}),teamSlug:()=> 'shop',teamVenueKey:()=> 'shop',document:{hidden:false},isCustomVenue:()=>true});
 vm.runInContext(between(f.source,'  let teamReadFailed', '  function hydrateCodes()'),f.c);
 vm.runInContext(between(f.source,'  function hydrateCodes()', '\n  function teamCloudBind()')+'\n'+between(f.source,'  function pollLiveTeam()', '\n  /* Le pointage reprend'),f.c);
 vm.runInContext('var liveTeamBusy=false,liveTeamDelay=1000;',f.c);
 let p=f.c.hydrateCodes();await ended(p,f);assert.equal(await p,false);
 p=f.c.pollLiveTeam();await ended(p,f);assert.equal(f.c.liveTeamBusy,false);assert.equal(f.c.liveTeamDelay,2000);assert.equal(notices.length,1);assert.match(notices[0],/retry/);
 // Null successful response avoids unrelated roster merging, preserving failure semantics.
 f.c.fetch=async()=>({ok:false});await f.c.hydrateCodes();await f.c.pollLiveTeam();assert.equal(f.c.liveTeamBusy,false);
 const cloud=fixture('cloud-doc',{slugOf:()=> 'shop',on:()=>true,feature:'team',opts:{onPullError:()=>{}}});
 vm.runInContext(between(cloud.source,'    function pull(first)', '\n    function push('),cloud.c);
 p=cloud.c.pull(true);await ended(p,cloud);assert.equal(await p,false);cloud.c.fetch=async()=>({ok:false});assert.equal(await cloud.c.pull(true),false);
});
await test('planning#0 · correction failure re-enables retry and keeps pending row',async()=>{
 const root={correctionsByVenue:{shop:[{id:'row'}]}},notices=[],handlers={};
 const f=fixture('team-hours',{handlers,Kiwi:{__teamProfileCore:{teamSlug:()=> 'shop'}},window:{__kiwiTeamV2:root},trLang:()=> 'en',toast:m=>notices.push(m),render(){}});
 vm.runInContext(between(f.source,'  function correctionCopy()', '\n  /* ═══════════════ HOURS PANE'),f.c);
 const el={dataset:{rid:'row',decision:'approved'},disabled:false};let p=handlers['kt-attendance-decision'](el);await ended(p,f);assert.equal(el.disabled,false);assert.equal(notices.length,1);assert.equal(root.correctionsByVenue.shop.length,1);
 f.healthy();await handlers['kt-attendance-decision'](el);assert.equal(root.correctionsByVenue.shop.length,0);
});
await test('employee#0 · hung punch releases flush chain, preserves opId and retries',async()=>{
 const queue=[{opId:'one',kind:'clock-in'},{opId:'two',kind:'clock-out'}], retries=[];
 const f=fixture('employee-live',{queueOwner:'shop',readQueue:()=>queue,loadQueue:async()=>{},bodyFor:x=>x,dropItem:async(_,id)=>{assert.equal(queue[0].opId,id);queue.shift();},outcomes:{},lastBlock:null,retryDelay:0,schedule:ms=>retries.push(ms),notify(){},remember(){},renderCorrections(){},window:{},document:{}});
 vm.runInContext(between(f.source,'  function transient(', '  function notify('),f.c);
 vm.runInContext(between(f.source,'  function call(', '\n  function newOpId()')+'\nvar flushing=Promise.resolve();\n'+between(f.source,'  function runOnce()', '\n  function flush()')+'\n'+between(f.source,'  function flush()', '\n  }')+'\n  }',f.c);
 const p=f.c.flush();await ended(p,f);assert.equal(queue.length,2);assert.equal(f.c.lastBlock.code,'timeout');assert.deepEqual(retries,[15000]);
 f.healthy();await f.c.flush();assert.equal(queue.length,0);assert.equal(f.c.outcomes.one.data.ok,true);assert.equal(f.c.outcomes.two.data.ok,true);assert.deepEqual(f.requests.filter(r=>r.opts.method==='POST').map(r=>JSON.parse(r.opts.body).opId),['one','one','two']);
});
await test('clients#1 · coalesced callbacks fail together, release book, retry',async()=>{
 const f=fixture('clients-store',{bookId:()=> 'shop',syncable:()=>true,getCursor:()=>0,setCursor(){},mergeServer:()=>false});
 vm.runInContext('var clientPulls=Object.create(null);\n'+between(f.source,'  function pull(book, cb, depth)', '\n  var pollTimer'),f.c);
 const results=[],errors=[];f.c.pull('shop',(v,e)=>{results.push(v);errors.push(e);});f.c.pull('shop',v=>results.push(v));await drain();assert.equal(f.requests.length,1,'one in-flight read per book');
 f.c.pull('other',v=>results.push(v));await drain();assert.equal(f.requests.length,2,'books remain isolated');await f.expire();assert.deepEqual(results,[false,false,false]);assert.equal(errors[0].code,'timeout');assert.equal(Object.keys(f.c.clientPulls).length,0);
 f.healthy();f.c.pull('shop',v=>results.push(v));await drain();assert.equal(f.requests.length,3);assert.equal(results.length,4);assert.equal(f.timers.size,0);
});
await test('all transports · fallback without AbortController and stalled JSON are bounded',async()=>{
 for(const name of ['invoicing','team','team-hours','employee-live','clients-store','cloud-doc']) {
  const f=fixture(name,{AbortController:undefined});
  let p=f.c.fetchDeadline('/test',{}),rejected=assert.rejects(p,{code:'timeout'});await ended(p,f);await rejected;
  assert.equal(f.requests[0].opts.signal,undefined);
  f.c.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
  p=f.c.fetchDeadline('/test',{});rejected=assert.rejects(p,{code:'timeout'});await ended(p,f);await rejected;
  f.healthy(); f.c.fetch=async()=>({ok:true,json:async()=>({ok:true})});
  assert.equal((await (await f.c.fetchDeadline('/test',{})).json()).ok,true);assert.equal(f.timers.size,0);
 }
});
process.exitCode=failures?1:0;
