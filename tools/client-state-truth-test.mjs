import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import split from './split-functions.cjs';
const root = process.env.KIWI_STATE_ROOT || '.';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fn = (file, names) => names.map(n => split.declaration(read(file), n)).join('\n');
const cases = {};
cases.stock = () => {
  const window = { KiwiInventory: { isReal: () => true, ensureOpening() {}, balance: () => 5, add() { throw Error('offline'); } } };
  vm.runInNewContext(read('assets/stock/state.js'), { window });
  let owner, retailValue;
  owner = window.KiwiStockState(() => ({ stShowReal: () => true, stockLocationId: () => '', stockUnitId: () => '', currentStockFor: it => owner.ledgerOpeningFor(it), retailCatalog: () => true, retailSetProductStock: (_, q) => retailValue = q }));
  const item = { id: 'a', currentStock: 5 };
  owner.moveStock(item, -7, 'sale');
  assert.equal(owner.overrides().a.unsynced, true, 'failed movement remains explicitly unsynced');
  assert.equal(owner.overrides().a.quantity, -2);
  assert.equal(item.stockSyncFailed, true);
  assert.equal(owner.ledgerOpeningFor(item), 5, 'failed override cannot seed the ledger as truth');
  window.KiwiInventory.add = payload => payload;
  owner.moveStock(item, 1, 'receipt');
  assert.equal(owner.overrides().a.unsynced,true,'unrelated successful write cannot acknowledge a failed movement');
};
cases.returns = async () => {
  const cache = new Map([['kiwi:returnsLedger', JSON.stringify({ m:'shop', v:'shop', at:1, window:null, list:[{ts:100,amount:12.34}] })]]);
  const c = vm.createContext({ window:{ KiwiCloudDoc:{currentSlug:()=> 'shop'} }, localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)}, Date, Promise, Object });
  vm.runInContext("const KEY='kiwi:returnsLedger', MAX_AGE=60000; let warming=null,lastTry='',lastChanged=false; const selectedPeriod=()=>null; const readReturnsLedger=()=>Promise.reject(Error('offline'));" + fn('assets/returns-ledger.js',['coversWindow','warmCreditReturns']).replaceAll('export function','function') + ';this.warm=warmCreditReturns;',c);
  assert.equal(await c.warm(), true, 'failure triggers repaint');
  assert.equal(JSON.parse(cache.get('kiwi:returnsLedger')).stale, true);
  assert.equal(JSON.parse(cache.get('kiwi:returnsLedger')).list[0].amount,12.34);
  const source=read('assets/daterange/kpi.js');
  const tile=source.slice(source.indexOf('tauxRetour: data.tauxRetour ?'),source.indexOf('\n      };',source.indexOf('tauxRetour: data.tauxRetour ?')));
  const d=vm.runInNewContext('({' + tile + '})',{data:{tauxRetour:{}},creditStale:true,__state:{getLang:()=> 'en'}});
  assert.equal(d.tauxRetour.note,'Figure not current');
};
cases.export = () => {
  for (const lang of ['fr','en','ar']) {
    const c=vm.createContext({window:{},uiLang:()=>lang,bounds:()=>({from:0,to:100}),norm:String,num:Number});
    vm.runInContext((['unavailableRows','unavailableSection'].filter(n=>read('assets/day-report-export.js').includes('function '+n+'(')).map(n=>fn('assets/day-report-export.js',[n])).join('\n') + fn('assets/day-report-export.js',['teamRows','stockRows','reservationRows']))+';this.rows=[teamRows({}),stockRows({}),reservationRows({})];this.note=typeof unavailableSection === "function" ? unavailableSection() : "";',c);
    for(const rows of c.rows) assert.equal(rows.unavailable,true,'missing service is unavailable, never zero');
    assert.ok(c.note.length>10);
    const runtime=vm.createContext({window:{KiwiI18n:{getLang:()=>lang},KiwiDayReport:{timezone:()=> 'Africa/Casablanca',dayBounds:()=>({from:1,to:2})}},document:{},Intl,Date});
    vm.runInContext(read('assets/day-report-export.js'),runtime);
    const report={day:'2026-11-04',store:{slug:'shop'},cash:{},methods:{},cashiers:[],categories:[],handovers:[],revisions:[]};
    const choices={team:true,stock:true,reservations:true},api=runtime.window.KiwiDayReportExport;
    assert.equal(api.build(report,choices).split(c.note).length-1,3,'CSV marks every unavailable enrichment');
    assert.equal(api.reportHtml(report,choices).split(c.note).length-1,3,'print export marks every unavailable enrichment');
    for(const service of ['KiwiTeam','KiwiInventory','KiwiReservations']) c.window[service]=new Proxy({}, {get(){throw Error('read');}});
    vm.runInContext('this.rows=[teamRows({}),stockRows({}),reservationRows({})]',c);
    for(const rows of c.rows) assert.equal(rows.unavailable,true,'read rejection carries marker');
  }
};
cases.onboarding = async () => {
  const c=vm.createContext({});vm.runInContext(read('assets/onboarding-data.js'),c);
  const values=new Map();const storage={get:k=>values.get(k),set:(k,v)=>(values.set(k,v),true),del:k=>values.delete(k)};
  const draft=c.KiwiOnboardingData.createDraft(storage,['shop'],[]), S={typeId:'shop',bizName:'Local',pins:[]};
  draft.save(S);draft.transport=async()=>{throw Error('offline');};
  assert.equal(await draft.sync(),false);assert.equal(draft.saved(),false);assert.match(draft.warning('en'),/sync/i);
  await draft.restore(S);assert.equal(draft.saved(),false);
  let local=JSON.parse(values.get('kiwiOnboardingDraft:v1'));
  draft.transport=async()=>({...local,bizName:'Server',revision:local.revision+100});
  await draft.restore(S);assert.equal(S.bizName,'Server','newer remote wins');
  local=JSON.parse(values.get('kiwiOnboardingDraft:v1'));draft.transport=async()=>({...local,bizName:'Old',revision:local.revision-1});
  await draft.restore(S);assert.equal(S.bizName,'Server','older remote loses');
  draft.transport=async()=>({...local,bizName:'Tie',revision:local.revision});
  await draft.restore(S);assert.equal(S.bizName,'Server','ties deterministically prefer local');
  let stored;
  const route=vm.createContext({activeAccountSession:async()=>({aid:'test'}),json:(v,status=200)=>new Response(JSON.stringify(v),{status}),URL,Date});
  vm.runInContext(read('functions/api/account/onboarding-draft.js').replace(/^import .*;$/m,'').replace('export async function','async function'),route);
  const env={AUTH_SECRET:'test-only',DB:{prepare(){return{bind(...args){return{run:async()=>{stored=JSON.parse(args[2]);}};}};}}};
  const response=await route.onRequest({env,request:new Request('https://local/api/account/onboarding-draft',{method:'POST',headers:{'X-Kiwi-Draft-Account':'test'},body:JSON.stringify({...local,revision:42})})});
  assert.equal(response.status,200);assert.equal(stored.revision,42,'API round trip preserves revision metadata');

};
cases.booking = async () => {
  const error={textContent:''}, button={}, form={querySelector:s=>s==='[data-error]'?error:button}, refs=[];
  let sequence=0;
  const state={lang:'en',service:{id:'svc'},slot:123};
  const context={owner:{getState:()=>state},ssGet:()=>null,ssSet(){throw Error('quota');},ssDel(){},t:k=>k,party:()=>1};
  const c=vm.createContext({context,crypto:{randomUUID:()=>String(++sequence)},FormData:class {get(k){return {name:'Test',email:'test@example.com'}[k]||'';}},window:{},deadline:{deadlineFetch:async(_,o)=>{refs.push(JSON.parse(o.body).ref);throw Error('offline');}}});
  vm.runInContext(read('assets/booking-submission.js').replace('export function','function').replaceAll("import('./request-deadline.mjs')",'Promise.resolve(deadline)')+';this.api=createBookingSubmission(context);',c);
  await c.api.submit({preventDefault(){},currentTarget:form});
  assert.match(error.textContent,/duplicate|double/,'failed reference persistence warns about duplicate booking');
  await c.api.submit({preventDefault(){},currentTarget:form});
  assert.equal(refs.length,2);assert.equal(refs[0],refs[1],'same-tab retry keeps reference despite failed storage');
};
cases.catalog = () => {
  let listener,alerts=[];const c=vm.createContext({window:{addEventListener:(_,f)=>listener=f,alert:s=>alerts.push(s)},document:{documentElement:{lang:'en'}},cloud:{dirty:true},localKept:false,KEY:'catalog',VENUE:'shop',DIRTY_KEY:()=> 'dirty',db:{products:[{id:'local'}]},dropIndex(){},migrate(){},notify(){}});
  const s=read('assets/boutique-catalog.js');const start=s.indexOf("  window.addEventListener('storage'");
  vm.runInContext(s.slice(start,s.indexOf('\n  });',start)+6),c);
  listener({key:'dirty',newValue:null});assert.equal(c.cloud.dirty,true,'another tab cannot clear our dirty status');
  listener({key:'catalog',newValue:JSON.stringify({products:[]})});assert.equal(c.db.products[0].id,'local');assert.match(alerts[0],/local edits are kept/);
  // A tab whose own write was kept shares the catalogue: it adopts the other tab's sale, and a cleared mark clears.
  c.localKept=true;listener({key:'catalog',newValue:JSON.stringify({products:[{id:'other-tab'}]})});assert.equal(c.db.products[0].id,'other-tab','a kept tab adopts the shared catalogue even while unsynced');
  listener({key:'dirty',newValue:null});assert.equal(c.cloud.dirty,false,'the shared dirty mark follows the other tab once nothing is held only here');assert.equal(alerts.length,1);
};
cases.clock = async () => {
  const c=vm.createContext({Date,clockOffset:7*86400000});
  vm.runInContext((read('assets/employee-live.js').includes('function serverNow(')?fn('assets/employee-live.js',['serverNow']):'')+fn('assets/employee-live.js',['needsCorrection'])+';this.test=needsCorrection;',c);
  assert.equal(c.test({at:Date.now()+7*86400000-13*3600000}),true,'wrong device clock cannot make an old punch fresh');
  c.clockOffset=-7*86400000;assert.equal(c.test({at:Date.now()-7*86400000-3600000}),false,'wrong clock cannot expire a fresh punch');
  const stored=new Map();Object.assign(c,{QUEUE_PREFIX:'queue:',copies:{},merge:a=>a,records:()=>[],store:()=>({setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)}),idb:async(_,items)=>items,console});
  vm.runInContext(fn('assets/employee-live.js',['writeQueue'])+';this.write=writeQueue;',c);
  await c.write('owner',[{opId:'recent',done:true,at:Date.now()-7*86400000-3600000}]);
  assert.match(stored.get('queue:owner:outcomes'),/recent/,'ack horizon retains recent server-clock acknowledgement');
  const server=Date.now()+3*86400000;
  Object.assign(c,{fetchDeadline:async()=>({ok:true,headers:{get:()=>new Date(server).toUTCString()},json:async()=>({})})});
  vm.runInContext(fn('assets/employee-live.js',['call'])+';this.call=call;',c);
  await c.call('GET');assert.ok(Math.abs(c.clockOffset-3*86400000)<1500,'response Date header teaches the server clock offset');
};
cases.archive = () => {
  let now=Date.parse('2026-11-04T06:00:00Z'); const values=new Map();
  const day=ts=>new Date(ts-5*3600000).toISOString().slice(0,10);
  const rows=Array.from({length:1200},(_,i)=>({id:String(i),day:day(now)}));rows.push({id:'old',day:'2026-10-01'});
  values.set('kiwi-archived-takeaways:shop',JSON.stringify(rows));
  const c=vm.createContext({currentMerchantSlug:()=> 'shop',Date:class extends Date{static now(){return now;}},vrapHistoryDay:day,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},archivedTakeawayScope:'',archivedTakeawayIds:new Set(),toast(){}});
  vm.runInContext(fn('assets/caisse-kitchen.js',['archivedTakeawaySet','rememberArchivedTakeaway'])+';this.ids=archivedTakeawaySet;this.keep=rememberArchivedTakeaway;',c);
  assert.equal(c.ids().has('0'),true,'more than 1000 young ids survive');assert.equal(c.ids().has('old'),false,'old business days expire');
  c.keep('new');assert.equal(JSON.parse(values.get('kiwi-archived-takeaways:shop')).at(-1).day,day(now));
  now+=15*86400000;assert.equal(c.ids().size,0,'open tab expires archived ids too');
};
let failures=0;
for(const [name,test] of Object.entries(cases)) { if(process.env.KIWI_STATE_CASE && process.env.KIWI_STATE_CASE!==name)continue;try{await test();console.log('✓ client state '+name);}catch(e){failures++;console.error('✗ client state '+name,e.stack);}}
if(failures)process.exitCode=1;
