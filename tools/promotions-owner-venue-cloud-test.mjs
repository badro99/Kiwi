#!/usr/bin/env node
// Actual component, engine and CloudDoc; isolated transport and metadata, NOT cloud acceptance.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function validateOwnerVenueCloud(ROOT, componentSource = fs.readFileSync(path.join(ROOT,'assets/boutique-promos-dashboard.js'),'utf8')) {
  let checks=0, failures=0;
  const check=(condition,label)=>{checks++;if(!condition)failures++;console.log((condition?'✓ ':'✗ ')+label);};
  const data=new Map(),timers=new Map(),requests=[],remote=new Map();
  let timerId=0,selected='fixture-boutique-a';
  const metadata=[{id:'fixture-boutique-a',slug:'fixture-shop-a',name:'Fixture A',custom:true},{id:'fixture-boutique-b',slug:'fixture-shop-b',name:'Fixture B',custom:true}];
  const localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),key:i=>[...data.keys()][i],get length(){return data.size;}};
  const document={readyState:'loading',visibilityState:'visible',addEventListener:()=>{},documentElement:{lang:'en'}};
  const window={Kiwi:{handlers:{}},KiwiEnv:{isReal:()=>true},addEventListener:()=>{},document,localStorage,
    KiwiBoutiqueVenueKey:()=>selected,KiwiBoutiqueCatalog:{use:()=>{},compat:()=>({P:{},RAYONS:[],BY_EAN:{}})},
    KiwiVenue:{getVenueData:key=>metadata.find(v=>v.id===key),getCurrentVenueData:()=>metadata.find(v=>v.id===selected),getVenues:()=>metadata}};
  const plain=value=>JSON.parse(JSON.stringify(value));
  const fetch=async(url,options={})=>{
    const u=new URL(url,'https://fixture.invalid');
    if(u.origin!=='https://fixture.invalid'||u.pathname!=='/api/store')throw Error('outside fixture transport');
    let body,status=200;
    if(options.method==='POST'){
      const payload=JSON.parse(options.body);requests.push({method:'POST',...plain(payload)});
      const old=remote.get(payload.merchant)||{rev:0,data:null};
      if(payload.baseRev!==old.rev){status=409;body={error:'stale',rev:old.rev,data:old.data};}
      else{const stored={rev:old.rev+1,data:plain(payload.data)};remote.set(payload.merchant,stored);body={ok:true,rev:stored.rev};}
    }else{
      const merchant=u.searchParams.get('merchant');requests.push({method:'GET',merchant});
      body=remote.get(merchant)||{rev:0,data:null};
    }
    return {ok:status>=200&&status<300,status,json:async()=>plain(body)};
  };
  const context=vm.createContext({window,document,localStorage,fetch,Date,Intl,console,URL,AbortController,
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/cloud-doc.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/promos.js'),'utf8'),context);
  const at=componentSource.lastIndexOf('})();');
  if(at<0)throw Error('actual component closure missing');
  vm.runInContext(componentSource.slice(0,at)+'window.__actualPromoContext=context;\n'+componentSource.slice(at),context);
  const PR=window.KiwiPromos;
  window.__actualPromoContext();
  // Drain the immediate synthetic GET before the existing explicit bind/flush sequence.
  await new Promise(resolve=>setImmediate(resolve));
  const handle=PR.cloud();
  check(handle.enabled(),'actual CloudDoc enabled with synthetic entitled venue metadata');
  check(handle.feature==='promotions','actual retained cloud handle uses promotions feature');
  console.log('Initial owner context transport calls (diagnostic, not an acceptance requirement): '+requests.length);
  check(handle.slug()==='fixture-shop-a','initial owner A resolves A cloud merchant');
  await handle.bind();
  PR.save({id:'fixture-a-rule',name:'A <opaque> عرض',kind:'percent',value:20,scope:{type:'tout'}});
  let result=await handle.flush();
  check(result.ok,'actual A flush succeeds after explicit fixture bind');
  check(requests.filter(r=>r.method==='POST').at(-1).merchant==='fixture-shop-a','A payload posts only under A');
  const savedA=plain(remote.get('fixture-shop-a'));
  selected='fixture-boutique-b';window.__actualPromoContext();
  await new Promise(resolve=>setImmediate(resolve));
  check(PR.currentVenue()==='fixture-boutique-b','normal component context switches engine local venue to B');
  check(PR.list().length===0,'B local document does not adopt A rules');
  check(handle.slug()==='fixture-shop-b','same retained cloud handle resolves B after owner venue switch');
  await handle.bind();
  PR.save({id:'fixture-b-rule',name:'B <opaque> عرض',kind:'percent',value:30,scope:{type:'tout'}});
  result=await handle.flush();
  check(result.ok,'actual B flush succeeds');
  const postedB=requests.filter(r=>r.method==='POST').at(-1);
  check(postedB.merchant==='fixture-shop-b','actual B POST cannot be sent under A merchant');
  check(postedB.data.promos.length===1&&postedB.data.promos[0].id==='fixture-b-rule'&&postedB.data.promos[0].name==='B <opaque> عرض','B POST preserves only B authored rule bytes');
  check(JSON.stringify(remote.get('fixture-shop-a'))===JSON.stringify(savedA),'switch and B flush leave A remote document untouched');
  check(remote.get('fixture-shop-b')?.data.promos[0].id==='fixture-b-rule','B remote document receives B rule');
  selected='fixture-boutique-a';window.__actualPromoContext();
  check(handle.slug()==='fixture-shop-a','switchback resolves A cloud merchant');
  check(PR.list().length===1&&PR.get('fixture-a-rule')?.name==='A <opaque> عرض'&&PR.get('fixture-b-rule')===null,'switchback restores exact A local rule without B adoption');
  PR.setPaused('fixture-a-rule',true);result=await handle.flush();
  const postedA=requests.filter(r=>r.method==='POST').at(-1);
  check(result.ok&&postedA.merchant==='fixture-shop-a','switchback pause POST uses A identity');
  check(postedA.data.promos.length===1&&postedA.data.promos[0].id==='fixture-a-rule'&&postedA.data.promos[0].paused===true,'switchback pauses only original A rule');
  check(remote.get('fixture-shop-b')?.data.promos[0].paused===false,'A switchback pause never changes B rule');
  check(requests.every(r=>['fixture-shop-a','fixture-shop-b'].includes(r.merchant)),'all actual requests stay within the two synthetic fixture tenants');
  check(timers.size===0,'actual explicit flush clears owned debounce/timeout timers');
  console.log(`${failures?'✗':'✓'} owner promotions cloud venue scope: ${checks-failures}/${checks}; ${failures} failures; isolated actual modules`);
  return failures?1:0;
}

if(fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  process.exitCode=await validateOwnerVenueCloud(ROOT);
}
