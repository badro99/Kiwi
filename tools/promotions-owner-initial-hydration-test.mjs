import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks=0, failures=0;
const check=(v,label)=>{checks++;if(!v)failures++;console.log((v?'✓ ':'✗ ')+label);};
const plain=v=>JSON.parse(JSON.stringify(v));
const component=fs.readFileSync(ROOT+'/assets/boutique-promos-dashboard.js','utf8');
for(const state of [{value:20,paused:false},{value:30,paused:false},{value:30,paused:true}]){
  const data=new Map(),timers=new Map(),requests=[],winEvents=new Map(),docEvents=new Map();
  let tid=0, selected='fixture-owner-a';
  const metadata=[{id:'fixture-owner-a',slug:'fixture-shop-a',name:'Synthetic A',custom:true},{id:'fixture-owner-b',slug:'fixture-shop-b',name:'Synthetic B',custom:true}];
  const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
  const listen=(map)=>(name,fn)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(fn);};
  const document={readyState:'complete',visibilityState:'visible',documentElement:{lang:'en'},addEventListener:listen(docEvents)};
  const window={document,localStorage,addEventListener:listen(winEvents),Kiwi:{handlers:{}},KiwiEnv:{isReal:()=>true},
    KiwiBoutiqueVenueKey:()=>selected,KiwiBoutiqueCatalog:{use:()=>{},compat:()=>({P:{},RAYONS:[],BY_EAN:{}})},
    KiwiVenue:{getVenueData:k=>metadata.find(v=>v.id===k),getCurrentVenueData:()=>metadata.find(v=>v.id===selected),getVenues:()=>metadata}};
  let serverRule={id:'fixture-remote-rule',name:'Remote <opaque> عرض',kind:'percent',value:state.value,scope:{type:'tout'},paused:state.paused,createdAt:100,updatedAt:200};
  const fetch=async(url,options={})=>{
    const u=new URL(url,'https://fixture.invalid');
    if(u.origin!=='https://fixture.invalid'||u.pathname!=='/api/store'||options.method==='POST')throw Error('unexpected transport/write');
    const merchant=u.searchParams.get('merchant');requests.push(merchant);
    return {ok:true,status:200,json:async()=>({rev:1,data:{v:1,promos:merchant==='fixture-shop-a'?[plain(serverRule)]:[],deleted:[]}})};
  };
  const context=vm.createContext({window,document,localStorage,fetch,Date,Intl,URL,AbortController,console,
    setTimeout:fn=>{timers.set(++tid,fn);return tid;},clearTimeout:id=>timers.delete(id)});
  for(const file of ['cloud-doc.js','promos.js'])vm.runInContext(fs.readFileSync(ROOT+'/assets/'+file,'utf8'),context);
  serverRule=plain(window.KiwiPromos.normalize(serverRule));
  const source=component, at=source.lastIndexOf('})();');
  vm.runInContext(source.slice(0,at)+'window.__context=context;\n'+source.slice(at),context);
  const drain=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
  window.__context();window.__context();window.__context();await drain();
  const PR=window.KiwiPromos, handle=PR.cloud();
  console.log(JSON.stringify({mode:'actual',remoteValue:state.value,remotePaused:state.paused,initialGETs:requests.length,initialLocalRules:PR.list().length}));
  check(handle.enabled(),'synthetic real owner document enabled');
  check(requests.length===1,'initial same-venue context burst initiates exactly one promotion GET');
  check(PR.get(serverRule.id)?.value===state.value&&PR.get(serverRule.id)?.paused===state.paused,'first owner entry hydrates latest remote edit/pause');
  check(PR.get(serverRule.id)?.name===serverRule.name,'hydration preserves remote authored name');
  const count=requests.length;window.__context();await drain();
  check(requests.length===count,'repeated context does not repeatedly fetch same hydrated venue');
  // Actual CloudDoc's online recovery remains independent of the initial read.
  for(const fn of winEvents.get('online')||[])fn();await drain();
  check(PR.get(serverRule.id)?.value===state.value&&PR.get(serverRule.id)?.paused===state.paused,'actual online event can hydrate current owner later');
  selected='fixture-owner-b';window.__context();await drain();
  check(handle.slug()==='fixture-shop-b'&&PR.list().length===0,'venue switch preserves B scope and never adopts A');
  check(requests.at(-1)==='fixture-shop-b','first B context reads B remote document');
  check(requests.every(m=>['fixture-shop-a','fixture-shop-b'].includes(m)),'all synthetic requests tenant scoped');
  check(timers.size===0,'all actual owned request timeout timers cleared');
}
// Deferred, real pull responses test the current-venue guard, not DOM or clock injection.
for (const dirty of [false,true]) {
  const data=new Map(),timers=new Map(),requests=[],pending=[];
  let tid=0,selected='fixture-race-a';
  const metadata=[{id:'fixture-race-a',slug:'fixture-race-shop-a',custom:true},{id:'fixture-race-b',slug:'fixture-race-shop-b',custom:true}];
  const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
  const document={readyState:'complete',visibilityState:'visible',documentElement:{lang:'en'},addEventListener:()=>{}};
  const window={document,localStorage,addEventListener:()=>{},Kiwi:{handlers:{}},KiwiEnv:{isReal:()=>true},
    KiwiBoutiqueVenueKey:()=>selected,KiwiBoutiqueCatalog:{use:()=>{},compat:()=>({P:{},RAYONS:[],BY_EAN:{}})},
    KiwiVenue:{getVenueData:k=>metadata.find(v=>v.id===k),getCurrentVenueData:()=>metadata.find(v=>v.id===selected),getVenues:()=>metadata}};
  let PR;
  const fetch=(url,options={})=>{
    const u=new URL(url,'https://fixture.invalid');
    if(u.origin!=='https://fixture.invalid'||u.pathname!=='/api/store'||options.method==='POST')throw Error('unexpected transport/write');
    const merchant=u.searchParams.get('merchant');requests.push(merchant);
    return new Promise(resolve=>pending.push({merchant,resolve:()=>resolve({ok:true,status:200,json:async()=>({rev:1,data:{v:1,promos:[plain(PR.normalize({id:merchant+'-rule',name:merchant+' <opaque> عرض',kind:'percent',value:20,scope:{type:'tout'},createdAt:100,updatedAt:200}))],deleted:[]}})})}));
  };
  const context=vm.createContext({window,document,localStorage,fetch,Date,Intl,URL,AbortController,console,
    setTimeout:fn=>{timers.set(++tid,fn);return tid;},clearTimeout:id=>timers.delete(id)});
  for(const file of ['cloud-doc.js','promos.js'])vm.runInContext(fs.readFileSync(ROOT+'/assets/'+file,'utf8'),context);
  PR=window.KiwiPromos;
  if(dirty){PR.use(selected);PR.save({id:'fixture-unsynced-local',name:'Local <opaque> عرض',kind:'percent',value:40,scope:{type:'tout'}});}
  const source=component,at=source.lastIndexOf('})();');
  vm.runInContext(source.slice(0,at)+'window.__context=context;\n'+source.slice(at),context);
  const drain=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
  window.__context();window.__context();
  selected='fixture-race-b';window.__context();window.__context();
  selected='fixture-race-a';window.__context();
  check(requests.length===2,'pending A→B→A burst has one request per distinct venue');
  pending.find(p=>p.merchant==='fixture-race-shop-b')?.resolve();await drain();
  check(!PR.list().some(p=>p.id==='fixture-race-shop-b-rule'),'late B response cannot inject B into active A');
  pending.find(p=>p.merchant==='fixture-race-shop-a')?.resolve();await drain();
  check(PR.get('fixture-race-shop-a-rule')?.value===20,'initial A response hydrates A after switchback');
  if(dirty){
    check(PR.get('fixture-unsynced-local')?.value===40&&PR.get('fixture-unsynced-local')?.name==='Local <opaque> عرض','initial hydration preserves unsynced authored local rule');
    check([...data.keys()].some(k=>k.startsWith('kiwiDocDirty:v1:promotions:fixture-race-shop-a')),'merge retains explicit dirty obligation for later normal push');
    check(timers.size===1,'nonidentical local merge schedules exactly one existing normal push');
  }else check(timers.size===0,'identical fresh adoption leaves no debounce/timeout');
  selected='fixture-race-b';window.__context();await drain();
  pending.filter(p=>p.merchant==='fixture-race-shop-b').at(-1)?.resolve();await drain();
  check(PR.get('fixture-race-shop-b-rule')?.value===20&&!PR.get('fixture-race-shop-a-rule')&&!PR.get('fixture-unsynced-local'),'returning B hydrates B only, excluding A and its draft rule');
  check(requests.length===3,'discarded B response is retried once on legitimate B revisit');
  check(requests.every(m=>metadata.some(v=>v.slug===m)),'deferred requests stay within their declared synthetic tenants');
  // A dirty local edit is intentionally still owed; never execute fixture POST.
  timers.clear();
}
// Negative eligibility and a rejected first GET use the actual CloudDoc enabled/pull contract.
for (const disabled of [true,false]) {
  const data=new Map(),timers=new Map(),requests=[];
  let tid=0,attempt=0;
  const metadata={id:'fixture-negative-owner',slug:'fixture-negative-shop',custom:true};
  const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
  const document={readyState:'complete',visibilityState:'visible',documentElement:{lang:'en'},addEventListener:()=>{}};
  const window={document,localStorage,addEventListener:()=>{},Kiwi:{handlers:{}},KiwiEnv:{isReal:()=>!disabled},
    KiwiBoutiqueVenueKey:()=>metadata.id,KiwiBoutiqueCatalog:{use:()=>{},compat:()=>({P:{},RAYONS:[],BY_EAN:{}})},
    KiwiVenue:{getVenueData:k=>k===metadata.id?metadata:null,getCurrentVenueData:()=>metadata,getVenues:()=>[metadata]}};
  let PR;
  const fetch=async(url,options={})=>{
    const u=new URL(url,'https://fixture.invalid');
    if(u.origin!=='https://fixture.invalid'||u.pathname!=='/api/store'||options.method==='POST')throw Error('unexpected transport/write');
    requests.push(u.searchParams.get('merchant'));
    if(++attempt===1)throw Error('synthetic initial GET rejected');
    return {ok:true,status:200,json:async()=>({rev:1,data:{v:1,promos:[plain(PR.normalize({id:'fixture-retry-rule',name:'Retry <opaque> عرض',kind:'percent',value:30,scope:{type:'tout'},createdAt:100,updatedAt:200}))],deleted:[]}})};
  };
  const context=vm.createContext({window,document,localStorage,fetch,Date,Intl,URL,AbortController,console,
    setTimeout:fn=>{timers.set(++tid,fn);return tid;},clearTimeout:id=>timers.delete(id)});
  for(const file of ['cloud-doc.js','promos.js'])vm.runInContext(fs.readFileSync(ROOT+'/assets/'+file,'utf8'),context);
  PR=window.KiwiPromos;
  const at=component.lastIndexOf('})();');
  vm.runInContext(component.slice(0,at)+'window.__context=context;\n'+component.slice(at),context);
  const drain=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
  window.__context();window.__context();await drain();
  if(disabled){
    check(!PR.cloud().enabled(),'public demo disables actual promotion cloud document');
    check(requests.length===0,'public demo context burst makes no promotion network request');
    window.__context();await drain();
    check(PR.list().length===0&&requests.length===0,'repeated demo context remains local and does not adopt remote data');
  }else{
    check(requests.length===1,'rejected first GET is deduplicated during context burst');
    check(PR.list().length===0,'rejected initial read never fabricates server rules');
    window.__context();await drain();
    check(requests.length===2,'settled rejected read permits the next normal context retry');
    check(PR.get('fixture-retry-rule')?.value===30&&PR.get('fixture-retry-rule')?.name==='Retry <opaque> عرض','successful retry hydrates exact remote rule and authored data');
    window.__context();await drain();
    check(requests.length===2,'successful retry is bound once and not repeatedly fetched');
  }
  check(requests.every(m=>m===metadata.slug),'negative fixture requests remain in exact synthetic merchant scope');
  check(timers.size===0,'negative fixture owns no remaining request or push timer');
}
console.log(`${failures?'✗':'✓'} owner initial promotions hydration: ${checks-failures}/${checks}; ${failures} failures; isolated actual modules`);
process.exitCode=failures?1:0;
