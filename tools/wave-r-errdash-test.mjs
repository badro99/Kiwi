import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = f => fs.readFileSync(f, 'utf8');
const section = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); } catch(e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }
await test('clients#0 hotel#1 authoritative failure, malformed body, retry and recovery', async () => {
  const source = read('assets/clients-book.js');
  let response = {ok:false}, calls = 0;
  const host = {isConnected:true, innerHTML:'', querySelector:()=>button}, button = {};
  const ctx = {host, clientLocalCredits:()=>[{code:'local',balanceCents:900,status:'active'}],creditMerchant:()=> 'fixture',fmt:String,esc:String,tr:s=>s,encodeURIComponent,fetch:async()=>{calls++;return response;}};
  vm.createContext(ctx);
  vm.runInContext(section(source,'  function loadClientCredits(', '  /* ── launcher chip'),ctx);
  const settle = async()=> { for(let i=0;i<10;i++) await Promise.resolve(); };
  ctx.loadClientCredits('customer',host); await settle();
  assert.match(host.innerHTML,/role="alert"/); assert.doesNotMatch(host.innerHTML,/Aucun avoir|900|solde 0/);
  response={ok:true,json:async()=>({})}; button.onclick(); await settle(); assert.match(host.innerHTML,/role="alert"/);
  response={ok:true,json:async()=>({credits:[]})}; button.onclick(); await settle(); assert.match(host.innerHTML,/solde 9/); assert.equal(calls,3);
});
await test('clients#1 financial labels use caisse dictionary in EN and AR',()=>{
  const source=read('assets/clients-book.js'), dict=read('assets/caisse-lang.js');
  for(const key of ['Avoirs · solde','Aucun avoir','Les crédits boutique émis à ce client apparaîtront ici.']) {
    assert.ok(source.includes("tr('"+key+"')"));
    for(const lang of ['en','ar']) assert.ok(dict.slice(dict.indexOf('    '+lang+': {')).includes(JSON.stringify(key)+':'));
  }
});
const food=read('assets/simple-food-cost.js');
await test('analysis#1 invalid yield is incomplete and names yield',()=>{
  const ctx={STALE_DAYS:90}; vm.createContext(ctx);
  // Export only the pure calculation block, independent of the view.
  vm.runInContext(section(food,'  const isNum =','  const S =')+';globalThis.calculate=compute;',ctx);
  for(const y of [0,-1,101,'bad','']) { const c=ctx.calculate({lines:[{packPrice:10,packQty:1,useQty:1,packUnit:'kg',yieldPct:y}]});assert.equal(c.total,null);assert.equal(c.lines[0].reason,'yield'); }
});
await test('analysis#0 history and snapshot failures have retry and recover',async()=>{
  let status=503, painting=0;const ctx={S:{openId:'sheet',merchant:'fixture'},api:async()=>({status,data:{history:[],snapshot:{version:2}}}),encodeURIComponent,paint:()=>painting++};
  vm.createContext(ctx);vm.runInContext(section(food,'  async function loadHistory()', '  /* ── export'),ctx);
  await ctx.loadHistory(); assert.equal(ctx.S.historyError,true);
  await ctx.loadSnapshot(2);assert.equal(ctx.S.snapshotError,2);
  status=200;await ctx.loadSnapshot(2);assert.equal(ctx.S.snapshotError,null);assert.equal(ctx.S.snapshot.version,2);
  await ctx.loadHistory();assert.equal(ctx.S.historyError,false);assert.ok(painting>=4);
  assert.match(food,/role="alert"[\s\S]*retryRead/);
});
function briefing() {
 const card={parentNode:{},innerHTML:'',closest:()=>null,querySelector:()=>null};
 const listeners={},message={textContent:''};const document={readyState:'loading',documentElement:{lang:'en'},addEventListener:(k,f)=>(listeners[k]||=[]).push(f),querySelector:sel=>sel==='[data-briefing-card]'?card:null,getElementById:()=>message,createElement:()=>({setAttribute(){}})};
 const memory=new Map(),localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const window={KiwiEnv:{isReal:()=>true},KiwiAgentTier:()=> 'owner',KiwiCloudDoc:{currentSlug:()=> 'fixture'},addEventListener(){}};
 vm.runInNewContext(read('assets/briefing.js'),{window,document,localStorage,console,Date,setTimeout,clearTimeout});
 return {B:window.KiwiBriefing,listeners,message,card,document};
}
await test('briefing#0 failing rule records unavailable analysis and render suppresses calm',()=>{
 const {B,card,document,listeners}=briefing();const row=B._test.compute([function stockRule(){throw Error('unreadable');}]);
 assert.equal(row.unavailable[0],'stockRule');assert.equal(B._test.read().days[0].unavailable[0],'stockRule');
 for(const [lang,label] of [['fr','Analyse indisponible'],['en','Analysis unavailable'],['ar','التحليل غير متاح']]) {
   document.documentElement.lang=lang; B._test.render(); assert.ok(card.innerHTML.includes(label));assert.match(card.innerHTML,/role="alert"/);assert.match(card.innerHTML,/data-briefing-analysis-retry/);assert.doesNotMatch(card.innerHTML,/Nothing urgent|Rien d’urgent|لا توجد أمور عاجلة/);
   assert.ok(B.reply('morning briefing',{lang}).text.includes(label));
 }
 listeners.click.forEach(f=>f({target:{closest:sel=>sel==='[data-briefing-analysis-retry]'?{}:null}})); assert.equal(B._test.read().days[0].unavailable.length,0);
});
await test('briefing#1 concurrent edits to different fields merge and converge',()=>{
 const {B}=briefing(), T=B._test;
 const base={days:[],settings:{samples:10,stockFactor:1},settingsAt:1};
 const a={...base,settings:{samples:20,stockFactor:1},settingsAt:3,settingsFieldsAt:{samples:3,stockFactor:1}};
 const b={...base,settings:{samples:10,stockFactor:2},settingsAt:4,settingsFieldsAt:{samples:1,stockFactor:4}};
 const merged=T.mergeDocs(a,b);assert.equal(merged.settings.samples,20);assert.equal(merged.settings.stockFactor,2);assert.equal(JSON.stringify(merged),JSON.stringify(T.mergeDocs(b,a)));
 const zero=T.mergeDocs({...a,settingsFieldsAt:{samples:3,stockFactor:0}}, {...b,settingsFieldsAt:{samples:0,stockFactor:4}});assert.equal(zero.settings.samples,20);assert.equal(zero.settings.stockFactor,2);
 B.setSettings({samples:25});assert.ok(T.read().settingsFieldsAt.samples>0);
});
await test('briefing#2 real change handler explains invalid integer and keeps input',()=>{
 const {listeners,message}=briefing();const attrs={};const input={value:'1.5',getAttribute:k=>k==='data-briefing-limit'?'samples':null,setAttribute:(k,v)=>attrs[k]=v};
 listeners.change.forEach(f=>f({target:input}));assert.equal(attrs['aria-invalid'],'true');assert.equal(input.value,'1.5');assert.match(message.textContent,/whole number/);
 input.value='20';listeners.change.forEach(f=>f({target:input}));assert.equal(attrs['aria-invalid'],'false');assert.equal(message.textContent,'');
 assert.match(read('assets/briefing.js'),/integerLimit\(key\) \? '1' : 'any'/);
});
await test('invoices#0 selector includes customers after 400 with stable indices',()=>{
 const s=read('assets/invoicing.js');const template=section(s,s.includes('${book.slice')?'${book.slice':'${book.map',"</select></div>");
 const book=Array.from({length:450},(_,i)=>({name:'Customer'+i}));
 const html=new Function('book','esc','return `'+template+'`;')(book,String);assert.match(html,/value="449">Customer449/);
});
await test('invoices#1 actual autosave warns on quota, clears after retry',()=>{
 const s=read('assets/invoicing.js'), note={textContent:'',setAttribute(k,v){this[k]=v;}};let blocked=true,callback;
 const ctx={localStorage:{setItem(){if(blocked)throw Error('quota');}},overlay:{querySelector:()=>note},cmp:{},currentView:'compose',autosaveTimer:null,setTimeout:f=>{callback=f;},clearTimeout(){},draftKey:()=> 'draft',formSnapshot:()=>({name:'Fixture'}),T:()=>({autosave:'Saved',autosaveError:'Storage blocked'}),Date};
 vm.createContext(ctx);vm.runInContext(section(s,'  const lsSet =','\n',)+'\n'+section(s,'  function scheduleAutosave()', '  function checkIce()'),ctx);
 ctx.scheduleAutosave();callback();assert.equal(note.textContent,'Storage blocked');assert.equal(note.role,'alert');
 blocked=false;ctx.scheduleAutosave();callback();assert.equal(note.textContent,'Saved');assert.equal(note.role,'status');
});
if(failures)process.exitCode=1;
