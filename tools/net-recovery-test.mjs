import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
import { deadlineVmSource } from './deadline-vm-source.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const read = f => fs.readFileSync(f, 'utf8');
const fn = (f,n) => split.declaration(read(f),n);
const flush = async () => { for(let i=0;i<40;i++) await Promise.resolve(); };
for(const method of ['GET','POST']) for(const mode of ['fetch','body','malformed','array']) {
  const timers=new Map();let id=0,signal;
  const c=vm.createContext({window:{},AbortController,setTimeout(f){timers.set(++id,f);return id;},clearTimeout(i){timers.delete(i);},
    fetch:async(_,o)=>{signal=o.signal;if(mode==='fetch')return new Promise(()=>{});return {ok:true,status:200,json:()=>mode==='body'?new Promise(()=>{}):mode==='malformed'?Promise.reject(Error('json')):Promise.resolve([])};}});
  vm.runInContext(deadlineVmSource(read('assets/admin-api.js')),c);
  const p=c.window.KiwiAdminApi.request('/tasks',{method});
  const checked=assert.rejects(p,e=>e.uncertainCommit===(method==='POST') && e.code===(mode==='fetch'?'timeout':mode==='body'?'timeout':'bad-response'));
  await flush();for(const f of [...timers.values()])f();await checked;
  if(mode==='fetch'||mode==='body')assert.equal(signal.aborted,true);
}
// Both persistence tiers are identified immediately, without waiting for a later projection.
for(const saved of [false,true])for(const stored of [false,true]) {
  const persistence={},calls=[];
  const c=vm.createContext({persistence,queueOwner:'a',copies:{},recoveryBlocked:{},QUEUE_PREFIX:'q',
    merge:(a)=>a,records:()=>[],serverNow:()=>0,needsCorrection:()=>false,
    store:()=>({setItem(){if(!saved)throw Error('quota');},removeItem(){if(!saved)throw Error('quota');}}),
    idb:async()=>stored,renderCorrections(){calls.push(persistence.a);}});
  vm.runInContext(fn('assets/employee-live.js','writeQueue'),c);
  await c.writeQueue('a',[{opId:'one',at:1}]);
  assert.equal(persistence.a,[saved?'':'localStorage',stored?'':'IndexedDB'].filter(Boolean).join(', '));assert.ok(calls.length);
}
for(const lang of ['fr','en','ar']) {
  const notifications=Array.from({length:101},(_,id)=>({id})),warnings=[];
  const c=vm.createContext({serviceHistoryKey:'a',serviceNotifications:notifications,employeeLanguage:lang,
    employeePick:(fr,en,ar)=>lang==='ar'?ar:lang==='en'?en:fr,
    localStorage:{getItem:()=>null,setItem(){throw Error('quota');}},toast:s=>warnings.push(s)});
  vm.runInContext(fn('assets/serveur/service-runtime.js','saveServiceHistory'),c);c.saveServiceHistory();
  assert.equal(notifications.length,101);assert.ok(warnings.length);assert.ok(warnings.every(x=>x.length>10));
}
// Execute the real registered restore method: an open history is refreshed after sync.
{
 const text=read('assets/pos-epicerie.js'),ast=ts.createSourceFile('p.js',text,ts.ScriptTarget.Latest,true);let method;
 (function walk(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='restore')method=n;ts.forEachChild(n,walk);})(ast);
 const CRED={},CARNET=[],opened=[];
 const c=vm.createContext({root:{},pvReal:()=>true,CARNET,CRED,day:{},state:{},
   $:sel=>sel==='#ep-ard-veil'?{classList:{contains:()=>true}}:{dataset:{creditId:'one'}},openArdoise:id=>opened.push(id),closeVeil:()=>opened.push('closed')});
 vm.runInContext('globalThis.restore=function'+text.slice(method.name.end,method.end),c);
 c.restore({carnet:[{id:'one',hist:[{type:'pay',amt:1}]}]});assert.deepEqual(opened,['one']);assert.equal(CRED.one.hist[0].type,'pay');
 c.restore({carnet:[]});assert.equal(opened.at(-1),'closed');
}
// Fallback exports text, classification, retry identity and original image bytes.
{
 const module=await import('../assets/tickets-recovery.js');
 let button,blob,clicked=false;
 const fields={formError:{appendChild:b=>button=b},ticketBody:{value:'help'},ticketKind:{value:'bug'},ticketArea:{value:'till'},ticketSubkind:{value:'x'},ticketMoneyRisk:{checked:true}};
 const previous={document:globalThis.document,URL:globalThis.URL,setTimeout:globalThis.setTimeout};
 globalThis.document={createElement:tag=>tag==='a'?{click(){clicked=true;}}:{}};
 globalThis.URL={createObjectURL:b=>{blob=b;return 'blob:x';},revokeObjectURL(){}};globalThis.setTimeout=f=>f();
 try{
 const state={files:[new File(['image'],'x.png',{type:'image/png'})],publishAttempt:'attempt'};
 const text=read('assets/tickets.js'), ast=ts.createSourceFile('tickets.js',text,ts.ScriptTarget.Latest,true);let declaration;
 (function walk(n){if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='draftController'))declaration=n;ts.forEachChild(n,walk);})(ast);
 const c=vm.createContext({$:id=>fields[id],state,t:x=>x,draftFallback:module.draftFallback});
 // The VM's unsupported dynamic import rejects, exercising the entry's actual import-failure catch.
 vm.runInContext(text.slice(declaration.getStart(ast),declaration.end)+';globalThis.result=draftController;',c);
 const controller=await c.result;
 controller.saveDraft();await button.onclick();const bytes=new Uint8Array(await blob.arrayBuffer());const decoder=new TextDecoder();const size=parseInt(decoder.decode(bytes.slice(124,136)),8);const snapshot=JSON.parse(decoder.decode(bytes.slice(512,512+size)));assert.equal(snapshot.body,'help');assert.equal(snapshot.attempt,'attempt');assert.equal(snapshot.files[0].path,'attachments/0');const next=512+Math.ceil(size/512)*512;assert.equal(decoder.decode(bytes.slice(next+512,next+517)),'image');assert.ok(clicked);
 }finally{Object.assign(globalThis,previous);}
}
console.log('✓ admin uncertainty and deadlines; persistence tier warnings; notification recovery; synced credit history; fallback draft export');
// Real audit owner: bounded accumulation, progress, cancellation and stale scope.
{
 const {exportAudit}=await import('../assets/clients-audit.js');
 const original=globalThis.fetch;
 try {
  for(const mode of ['normal','limit','cancel','scope']){
   let count=0,downloaded=0,current=true;const progress=[],controller=new AbortController();
   globalThis.fetch=async()=>({ok:true,json:async()=>({events:[{id:++count}],next:count<3?String(count):null})});
   const p=exportAudit({book:'a',clientId:'one',controller,current:()=>current,limit:mode==='limit'?1:10,
    progress:n=>{progress.push(n);if(mode==='cancel')controller.abort();if(mode==='scope')current=false;},download(){downloaded++;}});
   /* r21 (clients#B0): past the limit the export is delivered in parts, not refused. */
   const result=await p;
   if(mode==='limit'){assert.equal(result.partial,true);assert.equal(result.count,1);}
   assert.equal(downloaded,mode==='normal'||mode==='limit'?1:0);assert.ok(progress.length);assert.ok(count<=3);
  }
 }finally{globalThis.fetch=original;}
}
// Execute merge's real modal callbacks, including shared fetch/body deadlines.
for(const mode of ['fetch','body','malformed','scope','ok']){
 const timers=new Map(),modals=[],toasts=[];let id=0,book='a',calls=0,signal;
 const modal=()=>{const button={addEventListener(_,f){this.click=f;}},select={value:'from'};
  const m={el:{querySelector:sel=>sel==='select'?select:button},close(){this.closed=true;},button};modals.push(m);return m;};
 const clients={bookId:()=>book,list:()=>[{id:'from'}],pull(){calls++;}};
 const c=vm.createContext({window:{KiwiClients:clients},KiwiClients:clients,Kiwi:{modal,toast:s=>toasts.push(s)},esc:String,AbortController,
  setTimeout(f){timers.set(++id,f);return id;},clearTimeout(i){timers.delete(i);},
  fetch:async(_,o)=>{signal=o.signal;if(mode==='fetch')return new Promise(()=>{});return {ok:true,json:async()=>{if(mode==='scope')book='b';if(mode==='body')return new Promise(()=>{});if(mode==='malformed')throw Error('json');return {ok:true};}};}});
 vm.runInContext(deadlineVmSource(fn('assets/clients-directory.js','openMerge')),c);
 c.openMerge({id:'to'},{merge:'merge',mergeConfirm:'confirm',mergeExplain:'explain',mergePick:'pick',mergeError:'error',mergeUncertain:'uncertain',mergeDone:'done'});
 modals[0].button.click();let settled=false;const p=modals[1].button.click().then(()=>{settled=true;});await flush();for(const f of [...timers.values()])f();await flush();assert.ok(settled,'merge settles after its deadline');await p;
 assert.equal(calls,mode==='ok'?1:0);if(['fetch','body','malformed'].includes(mode)){assert.equal(modals[1].button.disabled,false);assert.equal(toasts.at(-1),'uncertain');}
 if(mode==='fetch'||mode==='body')assert.equal(signal.aborted,true);
}
console.log('✓ audit progress, bound, cancellation and scope; merge deadlines, malformed writes and stale merchant');
// Drive the real audit UI into its size limit, through the real pagination owner.
{
 const {exportAudit}=await import('../assets/clients-audit.js');let count=0,downloaded=0,progress=0;const notices=[];
 const original=globalThis.fetch;
 const fetch=async()=>({ok:true,json:async()=>({events:Array.from({length:100},()=>({id:'event'})),next:++count<102?String(count):null})});
 const status={set textContent(_){progress++;}},button={},modal={el:{isConnected:true,querySelector:s=>s==='button'?button:status},close(){}};
 const Kiwi={modal:()=>modal,toast:s=>notices.push(s)},clients={bookId:()=> 'a'};
 const c=vm.createContext({auditModule:{exportAudit},Kiwi,KiwiClients:clients,window:{Kiwi},AbortController,Blob,
   URL:{createObjectURL(){downloaded++;return 'blob:x';},revokeObjectURL(){}},document:{createElement:()=>({click(){}})},
   fetch,encodeURIComponent,esc:String,setTimeout(){}});
 globalThis.fetch=fetch;
 try{
   const source=fn('assets/clients-directory.js','downloadAudit').replace(/import\('\.\/clients-audit.js\?v=\d+'\)/g,'Promise.resolve(auditModule)');
   vm.runInContext(source,c);await c.downloadAudit({id:'one'},{audit:'audit',auditError:'error',auditLimit:'limit',auditPartial:'partial {n}',auditCancel:'cancel',auditProgress:'progress'});
   assert.equal(downloaded,1,'oversized audit is exported in a bounded first part');assert.match(String(notices.at(-1)),/partial/);assert.equal(progress,100);assert.equal(count,101);
 }finally{globalThis.fetch=original;}
}
console.log('✓ real audit UI exports oversized histories in a bounded part after bounded progress');
