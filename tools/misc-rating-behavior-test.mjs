import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const root = process.env.KIWI_MISC_ROOT || process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function fn(file, name, globals = {}) {
  const source = read(file), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let node;
  function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) node = n; else ts.forEachChild(n, visit); }
  visit(ast); assert.ok(node, name);
  return vm.runInNewContext('(' + node.getText(ast).replace(/^export /, '') + ')', globals);
}
let visionSource = read('functions/api/ai/_vision.js').replace(/from (['"])(\.[^'"]+)\1/g, (_,q,relative) => 'from ' + q + pathToFileURL(path.resolve('functions/api/ai', relative)).href + q);
const { payloadForModel, visionMessages } = await import('data:text/javascript;base64,' + Buffer.from(visionSource).toString('base64'));
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'vision') {
const payload = {messages:visionMessages({system:'system',text:'read',dataUrl:'data:image/png;base64,AQID'}),max_tokens:10,reasoning_effort:'low'};
assert.deepEqual(payloadForModel('@cf/meta/llama-3.2-11b-vision-instruct',payload), {prompt:'system\n\nread',image:[1,2,3],max_tokens:10});
assert.equal(payload.reasoning_effort,'low');
console.log('PASS Llama rollback uses native prompt and exact image bytes');
}
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'queue') {
  const window = {}, values = new Map([['kiwiSaleQueue','[{"id":"unsent"}]']]); let broken = true;
  const localStorage = { getItem(k){if(broken)throw Error('denied');return values.get(k)??null;},setItem(k,v){values.set(k,v);},get length(){return values.size;},key(i){return [...values.keys()][i];} };
  vm.runInNewContext(read('assets/live-link/queue-store.js'),{window,localStorage});
  const queue = window.KiwiSaleQueueStore.create({merchant:()=> 'shop'});
  assert.equal(queue.status().lastError,'queue-read-unavailable');
  assert.equal(queue.status().storageError,true);
  assert.equal(values.get('kiwiSaleQueue'),'[{"id":"unsent"}]');
  let writes=0;
  const bindings={localStorage:{getItem(){throw Error('denied');},setItem(){writes++;}},Q_KEY:'queue',queueReadError:false,queueBlocked:false,queueSignal(){}};
  bindings.qRead=fn('assets/live-link/queue-store.js','qRead',bindings);
  const write=fn('assets/live-link/queue-store.js','qWrite',bindings);
  assert.equal(write([]),false);assert.equal(writes,0);
  broken=false; assert.equal(queue.status().storageError,false);
}
console.log('PASS unreadable sale storage is distinct and recovers without losing bytes');
if (!process.env.KIWI_MISC_CASE || ['briefing','clock'].includes(process.env.KIWI_MISC_CASE)) {
  const {createPersistence} = require(path.join(root, 'assets/briefing-persistence.js')); let pushed=0;
  const p = createPersistence({slug:()=> 'shop',localKey:()=> 'brief',validSettings:x=>x||{},limits:{share:1},render(){},compute(){},isReal:()=>true,localStorage:{getItem:()=>null,setItem(){throw Error('quota');}},cloudDoc:()=>({attach:()=>({bind:async()=>true,pushNow:async()=>{pushed++;return {ok:true};}})}),canDispatch:()=>false});
  p.attachCloud(); if (process.env.KIWI_MISC_CASE !== 'clock') { assert.equal((await p.save()).ok,true); assert.equal(pushed,1); assert.equal(p.durable(),false); }
  const merged=p.mergeDocs({days:[],settings:{share:90},settingsFieldsAt:{share:Date.now()+864000000}},{days:[],settings:{share:12},settingsFieldsAt:{share:Date.now()-1}});
  assert.equal(merged.settings.share,12);
}
console.log('PASS briefing reaches cloud despite quota failure and rejects future field clocks');
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'cursor') {
  let durable=false, callback, events=[];
  const globals={syncable:()=>true,bookId:()=> 'shop',clientPulls:{},getCursor:()=>0,setCursor:()=>durable,mergeServer:()=>true,fetchDeadline:async()=>({ok:true,json:async()=>({clients:[{}],cursor:2,more:true})}),window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
  globals.pull=fn('assets/clients-store/sync.js','pull',globals);
  globals.pull('shop',(changed,error)=>{callback={changed,error};});
  await new Promise(r=>setImmediate(r));
  assert.equal(callback.changed,true);assert.equal(callback.error.message,'cursor-storage-unavailable');assert.equal(events[0].detail.error,'cursor-storage-unavailable');
}
console.log('PASS client pull reports cursor durability failure rather than recursing from zero');
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'employee') {
  const memory=new Map(), recovery={}, recoveryBlocked={};
  const store={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  memory.set('q:staff','broken queue'); memory.set('q:staff:outcomes','{"wrong":true}');
  const records=fn('assets/employee-live.js','records',{store:()=>store,QUEUE_PREFIX:'q:',copies:{},recovery,recoveryBlocked,merge:(a,b)=>a.concat(b)});
  assert.equal(records('staff').length,0); assert.equal(recovery.staff,true);
  assert.ok([...memory.values()].includes('broken queue')); assert.ok([...memory.values()].includes('{"wrong":true}'));assert.equal(memory.get('q:staff:recovery'),'1');
  const blocked=fn('assets/employee-live.js','records',{store:()=>({...store,setItem(){throw Error('quota');}}),QUEUE_PREFIX:'q:',copies:{},recovery,recoveryBlocked,merge:(a,b)=>a.concat(b)});
  memory.set('q:staff','retain me');blocked('staff');assert.equal(recoveryBlocked.staff,true);assert.equal(memory.get('q:staff'),'retain me');
  for (const lang of ['fr','en','ar']) {
    let panel;
    const node=()=>({children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v;},appendChild(child){this.children.push(child);}});
    const document={documentElement:{lang},body:{},createElement:node,getElementById:id=>id==='main-content'?{prepend(value){panel=value;}}:null};
    fn('assets/employee-live.js','renderCorrections',{document,queueOwner:'staff',records:()=>[],needsCorrection:()=>false,recovery,correctionWords:fn('assets/employee-live.js','correctionWords')})();
    assert.ok(panel.children.some(child=>child.attrs.role==='alert'&&child.textContent.length>30),lang);
  }

}
console.log('PASS corrupt employee queue and outcomes retain bytes and block unsafe replacement');
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'pressing') {
  const loaded=fn('assets/pressing-ops.js','loaded',{orderMemory:new Map(),archiveMemory:new Map(),key:()=> 'orders',storeKey:()=> 'full',localStorage:{getItem:k=>k==='orders'?'[]':null}});
  assert.equal(loaded(),true);
  const missing=fn('assets/pressing-ops.js','loaded',{orderMemory:new Map(),archiveMemory:new Map(),key:()=> 'orders',storeKey:()=> 'full',localStorage:{getItem:()=>null}});
  assert.equal(missing(),false);
}
console.log('PASS loaded empty pressing book differs from unavailable book');
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'loyalty') {
  const esc=s=>String(s).replaceAll('"','&quot;');
  let value=.42;const host={innerHTML:'',querySelectorAll:()=>[]};
  const render=fn('assets/clients-book/profiles.js','renderList',{document:{getElementById:()=>host,documentElement:{hasAttribute:()=>false}},KC:{config:()=>({model:'amount',visit:{target:10}}),list:()=>[{id:'a',name:'Client',points:42}],segment:()=> 'new',progress:()=>value},renderStrip(){},renderSegs(){},state:{},matches:()=>true,localCreditsByHolder:()=>({}),fmt:String,esc,initials:()=> 'C',SEG_LBL:{new:'New'},lastSeenTxt:()=> '',tr:()=> 'Loyalty'});
  for(const [progress,expected] of [[.42,42],[2,100],[-1,0],[NaN,0]]) { value=progress;render();assert.ok(host.innerHTML.includes('aria-valuenow="'+expected+'"'));assert.ok(host.innerHTML.includes('width:'+expected+'%'));assert.ok(host.innerHTML.includes('role="progressbar"')); }
}
console.log('PASS actual loyalty row matches numeric accessible progress, including bounds');
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'promos') {
  let body='';const window={Kiwi:{modal:options=>{body=options.body;return null;}},KiwiDayReport:{timezone:()=> 'Pacific/Auckland'}};
  vm.runInNewContext(read('assets/promo-rules.js'),{window,Intl,Date});
  vm.runInNewContext(read('assets/menu-promos.js'),{window,Intl,Date});
  assert.equal(window.KiwiMenuPromos.clock().zone,'Pacific/Auckland');
  const ast=ts.createSourceFile('promos',read('assets/menu-promos-dashboard.js'),ts.ScriptTarget.Latest,true);let translations;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='T')translations=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
  const T=vm.runInNewContext('('+translations+')');
  for(const lang of ['fr','en','ar']) {
    const editor=fn('assets/menu-promos-dashboard.js','editor',{window,data:()=>({cats:[]}),P:()=>window.KiwiMenuPromos,esc:String,tr:key=>T[lang][key]||key,name:String});
    editor();assert.ok(body.includes('Pacific/Auckland'),lang);assert.ok(!body.includes('{zone}'));
  }
}
console.log('PASS real promotion editor names pricing clock zone in FR/EN/AR');
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'kpi') {
  const ast=ts.createSourceFile('kpi',read('assets/daterange/kpi.js'),ts.ScriptTarget.Latest,true);let expression;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='pressingStats')expression=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
  const ops={read:()=>[],loaded:()=>true,dropoffStats:()=>({count:0})};
  const stats=vm.runInNewContext(expression,{window:{KiwiPressingOps:ops},activeVenue:{trade:'pressing'}});
  assert.equal(stats(0,1).count,0);ops.loaded=()=>false;
  assert.equal(vm.runInNewContext(expression,{window:{KiwiPressingOps:ops},activeVenue:{trade:'pressing'}}),null);
}
console.log('PASS actual KPI selector uses zero drop-offs for loaded empty book');
if (!process.env.KIWI_MISC_CASE || process.env.KIWI_MISC_CASE === 'timezone') {
  const {DatabaseSync}=await import('node:sqlite');
  const {tillToken,TILL_COOKIE}=await import('../functions/auth/_lib.js');
  let source=read('functions/api/timezone.js').replace(/from (['"])(\.[^'"]+)\1/g,(_,q,relative)=>'from '+q+pathToFileURL(path.resolve('functions/api',relative)).href+q);
  const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('schema.sql','utf8'));db.prepare("INSERT INTO merchant_config(merchant,features,status,updated_ts) VALUES ('shop','{}','active',0)").run();
  let ddl=0;
  const DB={prepare(sql){if(/^\s*(CREATE|ALTER)\b/i.test(sql))ddl++;let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:db.prepare(sql).run(...args)};}};}};
  const secret='misc-timezone-fixture',token=await tillToken(secret,'shop');
  const response=await onRequestPost({env:{DB,AUTH_SECRET:secret},request:new Request('https://kiwi.test/api/timezone',{method:'POST',headers:{Cookie:TILL_COOKIE+'='+token,'Content-Type':'application/json'},body:JSON.stringify({merchant:'shop',timeZone:'Pacific/Auckland',businessCutoff:6})})});
  assert.equal(response.status,200);assert.equal(ddl,0);assert.equal(db.prepare("SELECT timezone FROM merchant_config WHERE merchant='shop'").get().timezone,'Pacific/Auckland');db.close();
}
console.log('PASS real timezone route updates migrated SQLite with zero DDL');
