import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), declaration = require('./live-declaration.cjs');
const root = process.env.KIWI_MONEY_SOURCE_ROOT || '.';
const read = file => fs.readFileSync(root + '/' + file, 'utf8');
const moduleOf = async file => import('data:text/javascript;base64,' + Buffer.from(read(file)).toString('base64'));
let failed = 0;
async function test(name, fn) { try { await fn(); console.log('PASS '+name); } catch(e) { failed++; console.error('FAIL '+name+': '+e.message); } }
await test('return rows conserve every centime, including zero and unweighted returns', async () => {
  globalThis.window = {};
  const {returnRows} = await moduleOf('assets/returns-ledger.js');
  assert.equal(returnRows([{amount:.02,items:[{amount:1},{amount:1},{amount:1}]}],x=>x).reduce((sum,row)=>sum+Math.round(row.amt*100),0),2);
  for (let cents = 0; cents < 100; cents++) for(let n=1;n<12;n++) {
    const rows=returnRows([{amount:cents/100,items:Array.from({length:n},()=>({amount:1}))}], x=>x);
    assert.equal(rows.reduce((s,r)=>s+Math.round(r.amt*100),0),cents);
    assert.ok(rows.every(r=>r.amt === Math.round(r.amt*100)/100));
  }
  assert.equal(returnRows([{amount:.02,items:[{},{},{}]}],x=>x).reduce((s,r)=>s+Math.round(r.amt*100),0),2);
});
await test('return civil date follows merchant in a different device zone', async () => {
  globalThis.window={KiwiDayReport:{timezone:()=> 'Pacific/Honolulu'}};
  const {returnRows}=await moduleOf('assets/returns-ledger.js');
  assert.equal(returnRows([{ts:Date.parse('2026-11-04T01:00:00Z'),amount:1}], (fr,en)=>en)[0].d,'03/11/2026');
});
await test('supplier estimates convert all matching lines and divide portions/yield', () => {
  let api;
  const history=[{reason:'receipt',unitCost:12,occurredTs:2},{reason:'receipt',unitCost:10,occurredTs:1}];
  const recipes={r:{name:'Soup',portions:4,ingredients:[{stockId:'s',qty:500,unit:'g'},{stockId:'s',qty:500,unit:'g'}]}};
  const window={KiwiStockInternal:{install:(_,factory)=>api=factory({stOverlayRaw:()=>({subcategories:[{id:'s',name:'Flour',unit:'kg'}]}),stOverlayScope:()=> 'own',t:k=>k})},KiwiInventory:{history:()=>history},KiwiCost:{doc:()=>({recipes})},KiwiRestaurantRecipes:{all:()=>recipes},KiwiRestaurantUnits:{convert:(q,a,b)=>a===b?q:a==='g'&&b==='kg'?q/1000:null}};
  vm.runInNewContext(read('assets/stock/purchasing.js'),{window});
  assert.equal(api.computeRealSupplierPriceChanges()[0].impactedRecipes[0].dishCostDelta,.5);
  delete recipes.r.portions; recipes.r.yield=2;
  assert.equal(api.computeRealSupplierPriceChanges()[0].impactedRecipes[0].dishCostDelta,1);
  recipes.r.ingredients[0].unit='L';
  assert.equal(api.computeRealSupplierPriceChanges()[0].impactedRecipes.length,0);
});
await test('a free initial supplier receipt has no numeric percentage',()=>{
  let api;const window={KiwiStockInternal:{install:(_,factory)=>api=factory({stOverlayRaw:()=>({subcategories:[{id:'s'}]}),t:k=>k})},KiwiInventory:{history:()=>[{reason:'receipt',unitCost:3,occurredTs:2},{reason:'receipt',unitCost:0,occurredTs:1}]}};
  vm.runInNewContext(read('assets/stock/purchasing.js'),{window});
  assert.equal(api.computeRealSupplierPriceChanges()[0].pct,null);
});
await test('free previous supplier price has unavailable percent and localized cards', () => {
  for (const lang of ['fr','en','ar']) {
    let api, hist=[];
    const window={KiwiStockInternal:{install:(_,factory)=>api=factory({stOverlayRaw:()=>({subcategories:[{id:'s',name:'Rice',unit:'kg'}]}),stOverlayScope:()=>'',t:k=>window.KiwiStockStrings[lang][k],esc:String,svg:()=>'',fmtMad:String,fmtPct:String})},KiwiInventory:{history:()=>hist},KiwiRestaurantRecipes:{all:()=>({r:{name:'Recipe',ingredients:[{stockId:'s',qty:1,unit:'kg'}]}})}};
    vm.runInNewContext(read('assets/stock/strings.js'),{window});
    vm.runInNewContext(read('assets/stock/purchasing.js'),{window});
    assert.ok(api.renderRealSupplierPriceChanges().includes(window.KiwiStockStrings[lang].priceStableBody));
    hist=[{reason:'receipt',unitCost:3,occurredTs:2},{reason:'receipt',unitCost:0,occurredTs:1}];
    assert.equal(api.computeRealSupplierPriceChanges()[0].pct,null);
    assert.ok(api.renderRealSupplierPriceChanges().includes(window.KiwiStockStrings[lang].priceUnavailable));
    assert.ok(api.renderRealSupplierPriceChanges().includes(window.KiwiStockStrings[lang].priceImpact));
  }
});
await test('valid promotions survive invalid prefixes and invalid duplicate IDs',()=>{
  const window={}; const ctx={window,console,Intl};
  vm.runInNewContext(read('assets/promo-rules.js')+'\n'+read('assets/menu-promos.js'),ctx);
  const valid={id:'good',name:'Good',kind:'percent',value:10,all:true};
  const rows=window.KiwiMenuPromos.sanitize([...Array(40).fill(null),{...valid,value:0},valid]);
  assert.equal(rows.length,1); assert.equal(rows[0].id,'good');
});
await test('team salary formatter preserves 3000.50 MAD in every locale',()=>{
  for(const lang of ['fr','en','ar']) {
    const ctx={window:{},document:{documentElement:{lang}},Intl};
    const format=vm.runInNewContext(declaration(read('assets/team.js'),'fmtMad')+';fmtMad',ctx);
    assert.equal(format(3000.5),new Intl.NumberFormat(lang==='en'?'en-GB':'fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(3000.5)+' MAD');
    ctx.window.KiwiNumber={number:(n,d)=>new Intl.NumberFormat('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n)};
    assert.equal(format(3000.5),'3,000.50 MAD');
  }
});
await test('profile payroll tile and roster salary display exact centimes',()=>{
  for(const lang of ['fr','en','ar']) {
    const member={id:'m',firstName:'A',baseSalary:3000.5};
    const ctx={window:{},document:{documentElement:{lang}},Intl,Date,esc:String,memberState:{current:()=>({})},catalogFor:()=>({departments:[]}),tradeKey:()=>'',buildPeriod:()=>({days:[]}),getHours:()=>({}),toISO:()=>'',isCustomVenue:()=>false,memberDutyStatus:()=> 'off-duty',fmtHours:String,activeFilters:{},CONTRACT_TYPES:[],memberMatchesFilters:()=>true,svgIcon:()=>'',IC:{},initials:()=> 'A',AVATAR_COLORS:{},memberFullName:()=> 'A',jobName:String};
    const f=vm.runInNewContext(declaration(read('assets/team.js'),'fmtMad')+';fmtMad',ctx); ctx.fmtMad=f;
    const T=new Proxy({statTotalSub:()=>'',secAllMembersBadge:()=>''},{get:(obj,k)=>obj[k]||''});
    const code=['renderMembersTable','renderProfilesPane'].map(n=>declaration(read('assets/team/profile-ui.js'),n)).join('\n');
    const render=vm.runInNewContext(code+';renderProfilesPane',ctx);
    const html=render(T,{name:'Venue'},'own',[member]),expected=f(3000.5);
    assert.equal(html.split(expected).length-1,2);
    assert.ok(html.includes(new Intl.NumberFormat(lang==='en'?'en-GB':'fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(3000.5)+' MAD'));
  }
});
await test('hour editor rejects malformed, empty and out-of-range text before any mutation', async()=>{
  const listeners={}; let saved=0;
  const window={__kiwiTeamV2:{hoursByVenue:{},periodLocked:false}};
  globalThis.window=window;globalThis.document={addEventListener:(name,fn)=>listeners[name]=fn,querySelector:()=>null,querySelectorAll:()=>[]};
  const {createPayrollView}=await moduleOf('assets/planning/payroll-view.js');
  createPayrollView({handlers:{},live:{pageActive:true},teamKey:()=> 'own',trLang:()=> 'en',saveCustomTeams:()=>saved++});
  const input={value:'',dataset:{},matches:()=>true,getAttribute:k=>k==='data-mid'?'m':'day',setCustomValidity(v){this.error=v},reportValidity(){}};
  for(const text of ['7h30','','abc','-1','25','Infinity']) {input.value=text;listeners.input({target:input});assert.equal(saved,0);assert.deepEqual(window.__kiwiTeamV2.hoursByVenue,{}); assert.ok(input.error);}
  input.value='7,5'; listeners.input({target:input});
  assert.equal(saved,1); assert.equal(window.__kiwiTeamV2.hoursByVenue.own.m.day,7.5); assert.equal(input.error,'');
});
await test('booking normalizers retain 501 live closures on server and browser',()=>{
  const blocked=Array.from({length:501},(_,i)=>({id:'b'+i,startAt:Date.now()+10000,endAt:Date.now()+20000}));
  const ctx={Date,console,window:{addEventListener(){}},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>null}};
  vm.runInNewContext(read('assets/reservations.js'),ctx);
  assert.equal(ctx.window.KiwiReservations.normalize({blocked}).blocked.length,501);
  const names=['str','num','blank','safeDoc'];
  const code=names.map(n=>declaration(read('functions/api/booking.js'),n)).join('\n');
  const safe=vm.runInNewContext(code+';safeDoc', {Date,capBookings:x=>x,normalizeGuestSegments:x=>x,readRoomSegments:()=>[],commercialSnapshot:()=>null});
  assert.equal(safe({blocked}).blocked.length,501);
});
await test('booking retries bind refs to merchant and complete intent', async()=>{
  const code=read('assets/booking-submission.js');
  // Execute the live private retry allocator with its real dependencies.
  const retry=declaration(code,'retryRef');
  const storage=new Map();let serial=0;
  const ctx={merchant:'one',state:{service:{id:'s'},slot:1,lang:'en'},party:()=>1,retryRefs:{},ssGet:k=>storage.get(k),ssSet:(k,v)=>storage.set(k,v),crypto:{randomUUID:()=>String(++serial)},FormData:class {constructor(form){this.form=form} get(k){return this.form.fields[k]}},retryWarning:()=> 'warning'};
  const alloc=vm.runInNewContext(retry+';retryRef',ctx),form={fields:{name:'A',email:'a@b.com'},querySelector:()=>({})};
  const first=alloc('kiwiBookingRef','web_',form);
  assert.equal(alloc('kiwiBookingRef','web_',form),first);
  form.fields.phone='0600000000';form.fields.note='late';assert.equal(alloc('kiwiBookingRef','web_',form),first,'a contact edit after a lost answer keeps the same booking ref');
  ctx.state.slot=2;const next=alloc('kiwiBookingRef','web_',form);assert.notEqual(next,first);
  ctx.merchant='two';assert.notEqual(alloc('kiwiBookingRef','web_',form),next);
  ctx.retryRefs={};assert.equal(alloc('kiwiBookingRef','web_',form),storage.get('kiwiBookingRef'));
});
await test('unreadable successful booking write remains uncertain with its retry reference',async()=>{
  const sent=[],storage=new Map(),state={lang:'en',service:{id:'s'},slot:1},error={textContent:''},button={};
  const form={querySelector:k=>k==='[data-error]'?error:button};
  const ctx={window:{},crypto:{randomUUID:()=> 'unique'},FormData:class {get(k){return {name:'Test',email:'test@example.com',note:'note'}[k]||''}},loadDeadline:async()=>({deadlineFetch:async(url,opts)=>{sent.push(JSON.parse(opts.body));return {ok:true,json:async()=>{throw Error('broken JSON')}}}})};
  const source=read('assets/booking-submission.js').replace('export function ','function ').replace("import('./request-deadline.mjs')",'loadDeadline()');
  const create=vm.runInNewContext(source+';createBookingSubmission',ctx);
  const api=create({owner:{getState:()=>state},merchant:'merchant',party:()=>1,t:k=>k,ssGet:k=>storage.get(k),ssSet:(k,v)=>storage.set(k,v),ssDel:k=>storage.delete(k)});
  await api.submit({preventDefault(){},currentTarget:form});
  // A malformed reply is uncertain, distinct from an actual deadline expiry (#20).
  assert.equal(error.textContent,'Booking confirmation could not be read. Your booking may have been saved. Retry from this page with the same reference.');assert.equal(button.disabled,false);
  await api.submit({preventDefault(){},currentTarget:form});assert.equal(sent[0].ref,sent[1].ref);
});
await test('unreadable successful invoice write is reported as uncertain',async()=>{
  const ctx={ownData:()=>true,merchantSlug:()=> 'merchant',fetchDeadline:async()=>({ok:true,status:200,json:async()=>{throw Error('broken JSON')}})};
  const source=read('assets/invoicing/transport.js');
  const api=vm.runInNewContext(declaration(source,'apiError')+'\n'+declaration(source,'api')+';api',ctx);
  await assert.rejects(api('POST',{action:'issue'}),error=>error.code==='timeout');
});
await test('demo annual invoice allocator restarts per year and respects existing numbers',()=>{
  const ctx={S:{seq:{F:77},docs:[{type:'invoice',issueDate:'2026-01-01',seq:4}]},PREFIX:{invoice:'F'},today:()=> '2026-11-04',number:(p,s,y)=>`${p}-${y}-${s}`};
  const allocate=vm.runInNewContext(declaration(read('assets/invoicing/transport.js'),'allocate')+';allocate',ctx);
  const doc={type:'invoice',issueDate:'2026-12-31'};allocate(doc);assert.equal(doc.seq,5);ctx.S.docs.push({...doc});
  doc.issueDate='2027-01-01';allocate(doc);assert.equal(doc.seq,1);
  allocate(doc);assert.equal(doc.seq,2);
});
if(failed) process.exitCode=1;
