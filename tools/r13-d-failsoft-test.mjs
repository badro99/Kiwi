import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(p, 'utf8');
function fn(file, name) {
  const source = read(file), start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  let text = '';
  for (const line of source.slice(start).split('\n')) {
    text += line + '\n';
    try { new vm.Script('(' + text + ')'); return text; } catch {}
  }
  throw Error(name);
}
function realm(extra = {}) {
  const warnings = [], c = vm.createContext({console:{warn:(...v)=>warnings.push(v)}, Promise, Date, AbortController, encodeURIComponent, ...extra});
  return {c, warnings, run:s=>vm.runInContext(s,c)};
}
let failed = 0;
async function test(id, work) { try { await work(); console.log('PASS ' + id); } catch(e) { failed++; console.error('FAIL ' + id + ': ' + e.message); } }
for (const id of ['clients#1','returns#0','creditbook#0']) await test(id, async () => {
  const specifier = read('assets/clients-book/credit.js').match(/import\('([^']+)'\)/)?.[1];
  assert.equal(new URL(specifier || '', 'https://fixture.test/assets/clients-book.js').pathname, '/assets/request-deadline.mjs', 'deadline resolves from the shipped bundle');
  const timers = [], host = {isConnected:true,querySelector:()=>null};
  const r = realm({host,clientLocalCredits:()=>[],creditMerchant:()=> 'fixture',esc:x=>x,tr:x=>x,fmt:String,
    document:{documentElement:{lang:'fr'}}, setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},fetch:()=>new Promise(()=>{})});
  const helper=read('assets/request-deadline.mjs').replace('export ','');
  r.run(helper+';var net={deadlineFetch};');
  r.run(fn('assets/clients-book/credit.js','loadClientCredits').replace(/import\('[^']+'\)/g,'Promise.resolve(net)')+';loadClientCredits("c",host);');
  for(let i=0;i<20;i++)await Promise.resolve();
  assert.ok(timers.length,'credit read must install deadline'); timers[0]();
  for(let i=0;i<30;i++)await Promise.resolve();
  assert.match(host.innerHTML,/data-credit-retry/);
});
for(const [id,file,names] of [['booking#0','assets/booking-manage.js',['openManage','cancelBooking']],['economat#0','assets/hotel-economat-requests.js',['getJson','post']]]) await test(id,async()=>{
  for(const name of names){
    let calls=0,settled=false;
    const r=realm({merchant:'fixture',manageToken:'private',closed(){},t:x=>x,mt:x=>x,renderManage(){},fetch(){calls++;return new Promise(()=>{});}});
    const source=fn(file,name).replace(/import\('[^']+'\)/g,'Promise.reject(new Error("module-unavailable"))');
    r.run('('+source+')')({booking:{}}).then(()=>settled=true,()=>settled=true);
    for(let i=0;i<30;i++)await Promise.resolve();
    assert.ok(settled,'module failure must settle');assert.equal(calls,0,'no unbounded fallback');
  }
});
await test('booking#1',()=>{
  const r=realm({localStorage:{getItem:()=>null,setItem(){throw Error('private');}},merchant:'fixture',state:{lang:'en'},esc:x=>x});
  r.run(read('assets/booking-manage.js').replace('export ',''));
  const api=r.run('createBookingManage')({owner:{getState:()=>({lang:'en'})},merchant:'fixture',esc:x=>x});
  api.rememberManage({manageToken:'private',code:'reference'});
  assert.ok(r.warnings.length);assert.match(api.manageBlock({manageToken:'private',manageUrl:'https://fixture.test'}),/not saved/i);
  assert.ok(!JSON.stringify(r.warnings).includes('private'));
});
for(const [id,file,name,extra,args] of [
  ['employee#2','assets/employee-live.js','notify',{document:{dispatchEvent(){throw Error();}},CustomEvent:class{}},[{}]],
  ['serveur#1','assets/serveur/payments.js','empPayRefsWrite',{EMP_PAY_REFS_KEY:'refs'},[{}]],
  ['pressing#0','assets/pressing-ops.js','writeFull',{storeKey:()=> 'archive',projectFull:()=>assert.fail('no projection')},[{}]],
  ['sync#1','assets/live-link.js','requestWake',{document:{dispatchEvent(){throw Error();}},CustomEvent:class{}},[]],
  ['briefing#2','assets/briefing-persistence.js','writeLocal',{slug:()=> 'fixture',safeDoc:x=>x,localKey:()=> 'briefing',render(){},localKept:true,deps:{canDispatch:()=>false}},[{}]],
])await test(id,()=>{
  const r=realm({localStorage:{setItem(){throw Error('private');}},...extra});
  r.run('('+fn(file,name)+')')(...args);assert.ok(r.warnings.length,'failure needs diagnostic');
  assert.ok(!JSON.stringify(r.warnings).includes('private'));
});
await test('tickets#0',()=>{
  const el={},state={files:[]},r=realm({state,MAX_IMAGES:1,MAX_IMAGE_BYTES:10,t:k=>k,$:()=>el,fileInput:{},fileKey:f=>f.name,renderSelectedImages(){},draft:{save(){}}});
  r.run('('+fn('assets/tickets-composer.js','addFiles')+')')([{name:'bad',type:'text/plain',size:1},{name:'large',type:'image/png',size:20},{name:'good',type:'image/png',size:1},{name:'extra',type:'image/png',size:1}]);
  for(const reason of ['error.bad-image-type','file.tooLarge','error.too-many-images'])assert.ok(el.textContent.includes(reason),reason);
  assert.equal(state.files.length,1);
});
await test('tickets#1',()=>{
  const notice={},r=realm({window:{localStorage:{setItem(){throw Error();}}},FILTER_KEY:'filters',state:{filters:{}},$:()=>notice,t:k=>k});
  r.run('('+fn('assets/tickets-board.js','saveFilters')+')')();assert.ok(r.warnings.length);assert.equal(notice.textContent,'filter.saveFailed');
});
await test('pairing#0',()=>{
  const notices=[],r=realm({localStorage:{setItem(){throw Error('private');}},toast:x=>notices.push(x),window:{KiwiCaisseLang:{tr:x=>'translated:'+x}}});
  r.run('('+fn('assets/caisse-pairing/offline-codes.js','set')+')')('offline','private');
  assert.ok(r.warnings.length);assert.ok(notices[0]?.startsWith('translated:'));assert.ok(!JSON.stringify(r.warnings).includes('private'));
});
await test('briefing#0',()=>{
  const r=realm({GROUPS:[['salesDrop']],LIMITS:{salesDrop:[0,0,0,'Baisse','Drop','انخفاض']},num:String,shown:()=>20,lang:()=> 'en'});
  const line={kind:'sales-drop',evidence:{source:'fixture',text:{fr:'x'.repeat(400),en:'x'.repeat(400),ar:'x'.repeat(400)}}};
  r.run('('+fn('assets/briefing.js','thresholdEvidence')+')')(line);
  for(const [lang,label]of Object.entries({fr:'Baisse 20',en:'Drop 20',ar:'انخفاض 20'})){assert.ok(line.evidence.text[lang].endsWith(label));assert.ok(line.evidence.text[lang].length<=400);}
});
await test('hotel#1',async()=>{
  const r=realm({createImageBitmap:()=>Promise.reject(Error('decode'))});
  await assert.rejects(r.run('('+fn('assets/hotel/room-board.js','cuShrinkHotelPhoto')+')')({type:'image/png',size:1000000}),/photo-conversion/);
});
await test('promos#0',()=>{
  const source=read('assets/menu-promos-dashboard.js');
  const template=source.match(/step="\$\{draft.kind === 'percent'[^}]+\}"/)[0];
  const r=realm({draft:{kind:'amount'}});assert.equal(r.run('`'+template+'`'),'step="0.01"');
});
await test('shopify#0',()=>{
  const r=realm({pendingImportProducts:()=>[]});
  const rows=Array.from({length:151},(_,id)=>({id,title:'fixture',sku:'sku',method:'sku',kiwi:{id},shopify:{id}}));
  const out=r.run('('+fn('functions/api/shopify/status.js','preview')+')')({matches:rows,unmatched:rows,ambiguous:rows,unmatchedShopify:[]},[],{});
  for(const k of ['matches','unmatched','ambiguous'])assert.equal(out[k].length,151,k);
});
if(failed)process.exitCode=1;
