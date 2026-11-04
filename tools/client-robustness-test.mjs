import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const read = f => fs.readFileSync('assets/' + f, 'utf8');
const run = (file, name, ctx) => vm.runInNewContext(split.declaration(read(file), name) + '\n' + name, ctx);
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }
await test('merchant resolution fails closed even when URL parsing throws', () => {
  const merchant = run('live-link.js', 'merchant', {URLSearchParams: function(){throw Error('blocked');}, location:{search:''}});
  assert.ok(!merchant());
});
await test('quarantine retains evidence until acknowledgement', () => {
  const data = new Map([['kiwiSaleQueue','broken'],['other','safe']]);
  for(let i=1;i<=8;i++) data.set('kiwiSaleQueue:quarantine:'+i, 'old');
  const localStorage = {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
  const ctx={localStorage,Q_KEY:'kiwiSaleQueue',queueRecoveryError:false,queueReadError:false,queueBlocked:false,Date:{now:()=>9}};
  run('live-link/queue-store.js','qRead',ctx)();
  assert.deepEqual([...data.keys()].filter(k=>k.includes(':quarantine:')).sort(),// Owner ruling docs/decisions/2026-11-04-owner-delegated.md:19, retain all evidence.
    [1,2,3,4,5,6,7,8,9].map(i=>'kiwiSaleQueue:quarantine:'+i));
  assert.equal(data.get('other'),'safe'); assert.equal(data.get('kiwiSaleQueue:quarantine:9'),'broken');
  data.set('kiwiSaleQueue','second');run('live-link/queue-store.js','qRead',ctx)();assert.equal(data.get('kiwiSaleQueue:quarantine:9'),'broken');assert.equal(data.get('kiwiSaleQueue:quarantine:10'),'second');assert.equal([...data.keys()].filter(k=>k.includes(':quarantine:')).length,10); // Owner ruling docs/decisions/2026-11-04-owner-delegated.md:19, no count-based pruning.
});
await test('table refresh marks cached data stale and clears on recovery', async () => {
  const entry={data:{avgMin:12},error:'',ts:0,loading:false}, __state={hotelMerchant:()=> 'fixture',tableTime:new Map([['fixture|1|2',entry]]),TABLE_TIME_TTL:0,renderKpiBand(){}};
  let fail=true;
  const fn=run('daterange/kpi.js','tableTimeEntry',{__state,URLSearchParams,fetch:()=>fail?Promise.reject(Error()):Promise.resolve({ok:true,json:async()=>({ok:true,avgMin:14,visits:8})})});
  fn(1,2); await new Promise(r=>setImmediate(r)); assert.equal(entry.error,'unavailable'); assert.equal(entry.data.avgMin,12);
  const tile=run('dateRange.js','tableTimeTileFrom',{getLang:()=> 'en'})(entry,null);assert.equal(tile.stale,true);assert.equal(tile.text,'Out of date');assert.equal(tile.value,undefined);
  fail=false;entry.ts=0;fn(1,2);await new Promise(r=>setImmediate(r));assert.equal(entry.error,'');assert.equal(entry.data.avgMin,14);
});
await test('browser print failure reaches fallback notice', () => {
  const notices=[], timers=[], root={setAttribute(){},remove(){}};
  const fn=run('printer-bridge.js','browserPrintHTML',{pendingPrint:null,document:{getElementById:()=>null,createElement:()=>root,body:{appendChild(){}}},ensureReceiptPrintCss(){},systemPrintVia:()=> 'browser',setTimeout:fn=>timers.push(fn),window:{print(){throw Error('blocked');}},fallbackNotice:s=>notices.push(s),say:s=>s});
  fn('receipt');timers.shift()();assert.equal(notices.length,1);
});
for(const file of ['booking.js','booking-service.js','booking-submission.js','tickets-data.js']) await test(file+' helper failure bounds headers and body',async()=>{
  const src=read(file), ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true), funcs=[];
  function walk(n){if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='deadlineFetch')funcs.push(n.initializer.getText(ast));ts.forEachChild(n,walk);}walk(ast);
  // A file with no inline fallback must use the shared deadline module and never a raw fetch.
  if(!funcs.length){assert.match(src,/request-deadline\.mjs/);assert.doesNotMatch(src,/(^|[^A-Za-z.])fetch\(/m);return;}
  for(const code of funcs) for(const body of [false,true]) {
    let fire, aborted=false;
    const fn=vm.runInNewContext('('+code+')',{fetch:()=>body?Promise.resolve({json:()=>new Promise(()=>{})}):new Promise(()=>{}),AbortController:class{signal={};abort(){aborted=true;}},setTimeout:fn=>{fire=fn;return 1;},clearTimeout(){}});
    const result=fn('/fixture',{},15); await new Promise(r=>setImmediate(r));assert.equal(typeof fire,'function');fire();await assert.rejects(result,e=>e.code==='request-timeout');assert.equal(aborted,true);
  }
});
await test('briefing corrupt read and identity refusal are distinguishable',async()=>{
  const {createPersistence}=require('../assets/briefing-persistence.js');
  const p=createPersistence({slug:()=> 'fixture',localKey:()=> 'fixture',validSettings:()=>({}),render(){},compute(){},isReal:()=>false,localStorage:{getItem:()=>'{',setItem(){throw Error();}},limits:{},canDispatch:()=>false});
  p.reload();assert.equal(p.durable(),false);assert.equal(p.own().error,'local-read-unavailable');
  const saved=await p.save();assert.equal(saved.ok,false);assert.equal(saved.error,'cloud-unconfirmed');assert.equal(p.durable(),false);assert.equal(p.cloudFailed(),true);
});

await test('clipboard announces only settled success and reports rejected or refused copy', async()=>{
  const source=read('team/profile-ui.js'), ast=ts.createSourceFile('profile.js',source,ts.ScriptTarget.Latest,true);let code;
  function walk(n){if(ts.isBinaryExpression(n)&&n.left.getText(ast)==="handlers['kt-pwd-copy']")code=n.right.getText(ast);ts.forEachChild(n,walk);}walk(ast);assert.ok(code);
  let resolve,reject; const notices=[], input={value:'fixture',select(){}};
  const ctx={window:{__kiwiTeamModal:{el:{querySelector:()=>input}}},navigator:{clipboard:{writeText:()=>new Promise((a,b)=>{resolve=a;reject=b;})}},document:{execCommand:()=>false},Kiwi:{toast:(s,o)=>notices.push(o.type)},t:()=>({})};
  const fn=vm.runInNewContext('('+code+')',ctx);const pending=fn();await Promise.resolve();assert.equal(notices.length,0);resolve();await pending;assert.deepEqual(notices,['success']);
  const denied=fn();await Promise.resolve();reject(Error());await denied;assert.deepEqual(notices,['success','warning']);ctx.navigator.clipboard=null;fn();assert.equal(notices.at(-1),'warning');
});
await test('bind failure reports once and holds publication; hydrate false never publishes',async()=>{
  let published=0;const notices=[],ctx={teamCloudInit:()=>({bind:()=>Promise.reject(Error())}),hydrateCodes:()=>Promise.resolve(false),publishPins:()=>published++,heldPush:false,teamReadTimedOut:e=>notices.push(e)};
  await run('team/member-state.js','teamCloudBind',ctx)();assert.equal(ctx.heldPush,true);assert.equal(notices.length,1);assert.equal(published,0);
  ctx.teamCloudInit=()=>({bind:()=>Promise.resolve()});await run('team/member-state.js','teamCloudBind',ctx)();assert.equal(published,0);
});
await test('takeaway archive stays in memory and warns once on refused storage',()=>{
  const ids=Object.assign(new Set(),{days:new Map()}), notices=[];
  const fn=run('caisse-kitchen.js','rememberArchivedTakeaway',{currentMerchantSlug:()=> 'fixture',archivedTakeawaySet:()=>ids,vrapHistoryDay:()=> '2026-11-04',archivedTakeawayScope:'fixture',localStorage:{setItem(){throw Error();}},toast:s=>notices.push(s),document:{documentElement:{lang:'en'}}});
  fn('a');fn('b');assert.deepEqual([...ids],['a','b']);assert.equal(ids.days.get('a'),'2026-11-04');assert.equal(notices.length,1);
});
await test('pressing archive retains full document, projects it and warns once',()=>{
  const memory=new Map(), notices=[], projected=[],ctx={storeKey:()=> 'fixture',archiveMemory:memory,archiveWarned:new Set(),localStorage:{setItem(){throw Error();},getItem:()=>null},window:{dispatchEvent:e=>notices.push(e.detail.key)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},projectFull:d=>projected.push(d),console};
  ctx.persistenceNotice=run('pressing-ops.js','persistenceNotice',ctx);
  const write=run('pressing-ops.js','writeFull',ctx),doc={customers:[],orders:[{id:'a'}]};write(doc);write(doc);assert.equal(projected.length,2);assert.deepEqual(notices,['persist.archive'],'one notice for the refused archive');assert.equal(run('pressing-ops.js','readFull',ctx)(),doc);
});
await test('stock exception has a reason; failed department catalogue offers retry and can recover',async()=>{
  assert.equal(run('hotel-economat-requests.js','onHand',{window:{KiwiEconomatStock:{rows(){throw Error();}}}})('a').error,'stock-unavailable');
  const box={isConnected:true},ctx={draftCatalogue:[],createRef:{el:{querySelector:()=>box}},getJson:()=>Promise.reject(Error()),merchant:()=> 'fixture',item:()=>({active:true}),pickHtml(){return ctx.draftCatalogue===null?'unavailable':'catalogue';}};
  const load=run('hotel-economat-requests.js','loadDepartment',ctx);await load('a');assert.equal(ctx.draftCatalogue,null);assert.equal(box.innerHTML,'unavailable');
  const html=run('hotel-economat-requests.js','pickHtml',{draftCatalogue:null,T:()=>({offline:'Unavailable',retry:'Retry'}),esc:s=>s})();assert.ok(html.includes('eco-req-catalogue-retry'));assert.ok(html.includes('Unavailable'));
  ctx.getJson=async()=>({data:{items:[{itemId:'a'}]}});await load('a');assert.equal(ctx.draftCatalogue.length,1);assert.equal(box.innerHTML,'catalogue');
});
await test('stamp scanner tracks Live Link module imports',()=>{ assert.ok(require('./stamps.js').scan().get('assets/live-link/queue-store.js').sites.some(s=>s.file==='assets/live-link.js'&&s.kind==='module')); });
process.exitCode=failures?1:0;
