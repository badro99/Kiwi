import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import split from './split-functions.cjs';
const read = f => process.env.NET2_BASE ? execFileSync('git', ['show', 'HEAD:' + f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) : fs.readFileSync(f, 'utf8');
const fast = fn => setTimeout(fn, 2);
const hung = () => new Promise(() => {});
let passed = 0;
async function test(name, run) { try { let timer; try { await Promise.race([run(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('test deadline')), 500); })]); } finally { clearTimeout(timer); } passed++; console.log('✓ ' + name); } catch (e) { console.error('✗ ' + name, e); process.exitCode = 1; } }
const deadlineSource = read('assets/request-deadline.mjs').replace('export ', '');
function transport(file, fetch) {
  const source = read(file).replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  return vm.runInNewContext(deadlineSource + '\n' + source + ';({'+(file.includes('hotel/request')?'hotelRequest':'getJson,post')+'})', { fetch, AbortController, URLSearchParams, setTimeout:fast, clearTimeout });
}
await test('49 economat malformed acknowledgements reject reads and writes', async () => {
  const api = transport('assets/hotel-economat-transport.js', async () => ({ ok:true, json:async () => { throw new SyntaxError('broken'); } }));
  await assert.rejects(api.getJson('/read'));
  await assert.rejects(api.post({ action:'issue' }, 'merchant'), e => e.uncertain === true);
});
await test('17/18/50 hotel owner bounds every route and body, rejects unknown writes and blocks retry until reread', async () => {
  for (const body of [false,true]) {
    const api = transport('assets/hotel/request.mjs', async () => body ? { ok:true, json:hung } : hung());
    for (const url of ['/api/hotel/stays','/api/hotel/commercial','/api/store','/api/inventory/hotel-reports','/api/hotel/room-charges']) await assert.rejects(api.hotelRequest(url, {}, s => 'translated:'+s), /translated:/);
  }
  let writes=0;
  const api=transport('assets/hotel/request.mjs', async (_, o) => { if(o.method) writes++; return { ok:true,json:async()=>{throw Error('bad-json');} }; });
  const options={method:'POST',body:JSON.stringify({merchant:'m',id:'s'})};
  await assert.rejects(api.hotelRequest('/api/hotel/stays',options),e=>e.uncertain);
  await assert.rejects(api.hotelRequest('/api/hotel/stays',options));
  assert.equal(writes,1);
});
await test('17 reception status and cancellation bound hung transport and body in real actions', async () => {
  for(const body of [false,true]) {
    const fetch=async()=>body?{ok:true,json:hung}:hung(), apiTransport=transport('assets/hotel/request.mjs',fetch),window={},notices=[];
    const source=read('assets/hotel/arrivals.js').replace(/import\('\.\/request.mjs'\)/g,'loadRequest()');
    vm.runInNewContext(source,{window,fetch,loadRequest:async()=>apiTransport});
    const api=window.__kiwiHotelSections.arrivals({cuMerchantSlug:()=> 'm',cuStayCache:()=>new Map(),cuStaysChanged(){assert.fail('unknown write cannot refresh cache');},tx:s=>'translated:'+s,toast:s=>notices.push(s)});
    assert.equal(await api.cuStayStatus('s','checked_in'),false);
    assert.equal(await api.cuStayCancel('s'),false);assert.ok(notices.every(s=>s.startsWith('translated:')));assert.ok(notices.length>=2);
  }
});
await test('17 cancellation ignores a response from the previous merchant', async () => {
  let merchant='a', changed=0;
  const window={};
  const source=read('assets/hotel/arrivals.js').replace(/import\('\.\/request.mjs'\)/g,'loadRequest()');
  vm.runInNewContext(source,{window,fetch:async()=>{merchant='b';return {ok:true,json:async()=>({booking:{id:'s'}})};},loadRequest:async()=>({hotelRequest:async()=>{merchant='b';return {ok:true,json:async()=>({booking:{id:'s'}})};}})});
  const api=window.__kiwiHotelSections.arrivals({cuMerchantSlug:()=>merchant,cuStayCache:()=>new Map(),cuStaysChanged(){changed++;},tx:s=>s,toast(){}});
  assert.equal(await api.cuStayCancel('s'),false);assert.equal(changed,0);
});
await test('51 unknown quantity stays distinct from zero in formatting and stock status', () => {
  const source=read('assets/hotel-economat.js');
  const api=vm.runInNewContext(['qty','fmt','isLow','pill'].map(n=>split.declaration(source,n)).join('\n')+';({qty,fmt,isLow,pill})',{lang:()=> 'en',text:()=>({syncFail:'unavailable'}),esc:String});
  for(const v of [null,undefined,'','broken']) {assert.equal(api.qty(v),null);assert.equal(api.fmt(v),'unavailable');assert.equal(api.isLow({qty:api.qty(v),threshold:5}),false);assert.ok(api.pill({qty:api.qty(v)},{syncFail:'unavailable'}).includes('unavailable'));}
  assert.equal(api.qty(0),0);assert.equal(api.isLow({qty:0}),true);assert.equal(api.fmt(0),'0');
});
await test('53/54 quiet reload exposes failure; malformed writes retain draft and idempotency state', async () => {
  const source=read('assets/tickets-data.js').replace(/^export /gm,'').replace(/import\('\.\/request-deadline.mjs'\)/g,'loadDeadline()');
  const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{value:'text',checked:false,hidden:false,textContent:'',focus(){}});return elements.get(id);};
  const state={tickets:[{id:1}],files:[],filters:{}},notices=[];let cleared=0;
  const create=vm.runInNewContext(source+';createData',{FormData,loadDeadline:async()=>({deadlineFetch:async()=>({ok:true,json:async()=>{throw SyntaxError('broken');}})})});
  const api=create({$,API:'/tickets',state,lists:{},renderLoading(){},t:s=>s,friendlyError:s=>s,showToast:s=>notices.push(s),draft:{save:async()=>{}},draftController:Promise.resolve({store:{clear(){cleared++;}}})});
  await api.loadTickets({quiet:true});assert.equal(notices.length,1);assert.equal(state.stale,true);assert.equal(state.tickets[0].id,1);
  await api.publish({preventDefault(){}});assert.equal(cleared,0);assert.ok(state.publishAttempt);assert.equal($('formError').textContent,'uncertain-write');
});
await test('68 console accepts only object acknowledgements and never announces invalid writes',async()=>{
  let body;const window={};let writes=0;
  vm.runInNewContext(read('assets/admin-api.js'),{window,fetch:async()=>({ok:true,json:async()=>body}),AbortController,setTimeout,clearTimeout});
  window.KiwiAdminApi.onWrite(()=>writes++);
  for(body of [null,[],1,'yes',true]) await assert.rejects(window.KiwiAdminApi.request('/fixture',{method:'POST'}),/bad-response/);
  assert.equal(writes,0);body={ok:true};await window.KiwiAdminApi.request('/fixture',{method:'POST'});assert.equal(writes,1);
});
await test('38/39 native promises settle; sheet callback, timeout and pagehide release waiters',async()=>{
  const listeners=new Map(),window={Capacitor:{isNativePlatform:()=>true,Plugins:{}},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n)=>listeners.delete(n),webkit:{messageHandlers:{kiwiShell:{postMessage(){}}}}};
  const document={documentElement:{classList:{add(){}},getAttribute(){}},querySelector(){},addEventListener(){}};
  vm.runInNewContext(read('app/src/native-runtime.js'),{window,document,setTimeout:fast,clearTimeout,performance:{now:()=>0}});
  const api=window.__kiwiNativeRuntime;
  assert.equal((await api.callResult({run:hung},'run')).reason,'timeout');
  let late;const face=api.callResult({authenticateBiometric:()=>new Promise(r=>{late=r;})},'authenticateBiometric');
  await new Promise(r=>setImmediate(r));late('ok');
  assert.equal((await face).value,'ok','a Face ID prompt is never cut off by the machine deadline');
  assert.equal((await api.callResult({run:()=>42},'run')).value,42);
  assert.equal(await api.nativeSheet({}),'dismiss');assert.equal(listeners.has('pagehide'),false);
  const sheet=api.nativeSheet({});listeners.get('pagehide')();assert.equal(await sheet,'dismiss');
  const callback=api.nativeSheet({});window.KiwiNativeSheetResult({id:'sheet-3',action:'accept'});assert.equal(await callback,'accept');assert.equal(listeners.has('pagehide'),false);
});
await test('39 native sheet independently releases lost host callbacks and lifecycle waiters',async()=>{
  const waiters={},listeners=new Map(),window={webkit:{messageHandlers:{kiwiShell:{postMessage(){}}}},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
  const context={window,sheetWaiters:waiters,sheetSeq:0,root:{getAttribute(){}},setTimeout:fast,clearTimeout};
  const sheet=vm.runInNewContext(split.declaration(read('app/src/native-runtime.js'),'nativeSheet')+';nativeSheet',context);
  assert.equal(await sheet({}),'dismiss');assert.equal(Object.keys(waiters).length,0);assert.equal(listeners.size,0);
  const pending=sheet({});listeners.get('pagehide')();assert.equal(await pending,'dismiss');assert.equal(Object.keys(waiters).length,0);
});
await test('42 table lock bounds fetch and body through common owner',async()=>{
  for(const body of [false,true]) {
    const deadline=vm.runInNewContext(deadlineSource+';deadlineFetch',{fetch:async()=>body?{ok:true,json:hung}:hung(),AbortController,setTimeout:fast,clearTimeout});
    const source=split.declaration(read('assets/serveur/service-runtime.js'),'setTableLock').replace(/import\('..\/request-deadline.mjs'\)/g,'loadDeadline()');
    const fn=vm.runInNewContext(source+';setTableLock',{liveEmployeeState:{merchant:'m'},SV_DEMO:false,activeRole:{name:'a'},loadDeadline:async()=>({deadlineFetch:deadline})});
    assert.equal((await fn('1','acquire')).error,'timeout');
  }
});
await test('43 client lookup uses common transport and settles hung headers and body',async()=>{
  for(const body of [false,true]) {
    const deadline=vm.runInNewContext(deadlineSource+';deadlineFetch',{fetch:async()=>body?{ok:true,json:hung}:hung(),AbortController,setTimeout:fast,clearTimeout});
    let sharedCalls=0; const list={},search={value:'0612345678'};
    const source=split.declaration(read('assets/serveur/payments.js'),'renderServiceClients').replace(/import\('..\/request-deadline.mjs'\)/g,'loadDeadline()');
    const fn=vm.runInNewContext(source+';renderServiceClients',{AbortController,$:id=>id.includes('search')?search:list,liveEmployeeState:{merchant:'m'},employeeTranslation:s=>s,fetch:hung,setTimeout:fast,clearTimeout,loadDeadline:async()=>{sharedCalls++;return {deadlineFetch:deadline};}});
    fn();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(list.textContent,'Carnet indisponible.');assert.equal(sharedCalls,1);
  }
});
await test('60 account switch reaches fallback when deadline owner fails',async()=>{
  let click;const location={};const root={setAttribute(){},appendChild(){},addEventListener:(name,f)=>{if(name==='click')click=f;}};
  const source=split.declaration(read('assets/onboarding.js'),'build').replace(/import\('\.\/request-deadline.mjs'\)/g,'loadDeadline()');
  vm.runInNewContext(source+';build()',{root:null,document:{createElement:()=>root,body:{appendChild(){}}},tr:x=>x.en,loadDeadline:async()=>({deadlineFetch:async()=>{throw Error('timeout');}}),location,fetch:hung,render(){},window:{},setTimeout:()=>0});
  click({target:{closest:s=>s==='[data-signin]'?{getAttribute:()=>'/retry'}:null},preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(location.href,'/retry');
});
console.log(passed+' boundary groups passed');
