#!/usr/bin/env node
// Local Pages handlers + SQLite D1 and real browser book. No hosted data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {server,browser,ROOT} from './customer-balance-harness.mjs';
import {onRequestPost as post,onRequestGet as get,onRequestDelete as del} from '../functions/api/clients.js';
import {onRequestPost as employeePost,onRequestGet as employeeGet} from '../functions/api/employee-clients.js';
import {phoneKey as serverPhoneKey} from '../functions/api/_phone.js';
import {makeSession,SESS_COOKIE,tillToken,TILL_COOKIE,employeeToken,EMPLOYEE_COOKIE} from '../functions/auth/_lib.js';
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ fast-check unavailable; clients properties skipped');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||100,SEED=Number(process.env.KIWI_PROPERTY_SEED)||20261022;
let passed=0,failed=0,known=0;
async function strict(label,p,examples=[]){if(process.env.KIWI_PROPERTY_ONLY&&!label.includes(process.env.KIWI_PROPERTY_ONLY))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(r.failed){failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance);}else{passed++;console.log('✓ '+label);}}
async function knownIssue(id,label,p){if(process.env.KIWI_PROPERTY_ONLY)return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(r.failed&&r.errorInstance?.message==='Property failed by returning false'){known++;console.log(`◦ ${id}: ${label}; witness=${fc.stringify(r.counterexample)}`);}else{failed++;console.error('✗ unexpected known result '+id,r.errorInstance);}}
const f=await server(),b=browser(f),C=x=>Math.round(x*100),ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.body;};
f.sql.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('foreign-owner','foreign@example.test','Foreign Fixture','s','h',1,'active')").run();
f.sql.prepare("UPDATE merchant_config SET account_id='foreign-owner' WHERE merchant='server-other-shop'").run();
const cookies={owner:`${SESS_COOKIE}=${await makeSession('money-owner',f.env.AUTH_SECRET)}`,till:`${TILL_COOKIE}=${await tillToken(f.env.AUTH_SECRET,f.merchant)}`,employee:`${EMPLOYEE_COOKIE}=${await employeeToken(f.env.AUTH_SECRET,{merchant:f.merchant,staffId:'service-fixture'})}`};
async function request(handler,body={},role='till',method='POST'){
 const url=new URL('https://kiwi.test/api/clients');const data={merchant:f.merchant,...body};if(method!=='POST')for(const[k,v]of Object.entries(data))url.searchParams.set(k,String(v));
 const r=await handler({env:f.env,request:new Request(url,{method,headers:{Cookie:cookies[role]||'','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(data)}:{})})});return{status:r.status,body:await r.json()};
}
function doc(feature,data){f.sql.prepare('INSERT OR REPLACE INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,?)').run(f.merchant,feature,JSON.stringify(data),Date.now());}
async function reset(){await f.reset({});f.sql.exec("DELETE FROM clients WHERE id <> 'client-fixture'");if(f.sql.prepare("SELECT 1 FROM sqlite_master WHERE name='employee_loyalty_events'").get())f.sql.exec('DELETE FROM employee_loyalty_events');doc('team',{members:[{id:'service-fixture',function:'Serveur',password:'synthetic-password-marker',pinCode:'synthetic-code-marker'}]});doc('attendance',{entries:[{memberId:'service-fixture',inTs:Date.now()-1000,outTs:0}]});}
const phoneContext=vm.createContext({window:{},document:{addEventListener(){}}});vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/phone.js'),'utf8'),phoneContext);const phone=phoneContext.window.KiwiPhone;
// Exercise the complete browser upsert, with its normal shared-phone dependency.
const stores={};const define=(name,opts)=>{const store={data:{},get(k){return store.data[k]||(opts.blank?opts.blank():null);},set(v,k){store.data[k]=v;},subscribe(){return()=>{};}};stores[name]=store;return store;};
const device=vm.createContext({window:{KiwiStore:{define,currentVenue:()=>f.merchant},KiwiPhone:phone,addEventListener(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},setInterval:()=>1,clearInterval(){},console,fetch:async()=>({ok:false})});
device.KiwiStore=device.window.KiwiStore;
vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/clients-store.js'),'utf8'),device);const book=device.window.KiwiClients;
// Two independent VM devices execute the shipped store, with writes held in a
// controllable network queue. No browser engine or replicated merge algorithm.
function syncDevice(skew) {
 const stores={},queue=[],storage=new Map();
 const define=(name,opts)=>stores[name]={data:{},get(k){return this.data[k]||(opts.blank?opts.blank():null);},set(v,k){this.data[k]=JSON.parse(JSON.stringify(v));},subscribe(){return()=>{};}};
 class DeviceDate extends Date {static now(){return Date.now()+skew;}}
 const window={KiwiStore:{define,currentVenue:()=>f.merchant},KiwiEnv:{isReal:()=>true},KiwiPhone:phone,addEventListener(){}};
 const context=vm.createContext({window,KiwiStore:window.KiwiStore,KiwiEnv:window.KiwiEnv,Date:DeviceDate,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console,setInterval:()=>1,clearInterval(){},fetch:(url,opts)=>{
  if(!opts||!opts.method)return f.request({},true);
  return new Promise(resolve=>queue.push(async()=>{const result=await f.request(JSON.parse(opts.body));resolve(result);await new Promise(done=>setImmediate(done));}));
 }});
 vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/clients-store.js'),'utf8'),context);
 const book=window.KiwiClients;
 return {book,queue,storage,pull:()=>new Promise(resolve=>book.pull(f.merchant,resolve)),flush:async()=>{while(queue.length)await queue.shift()();}};
}
const number=fc.integer({min:600000000,max:799999999}),cents=fc.integer({min:1,max:1999999});
try{
await strict('Moroccan punctuation and country prefixes share one identity; distinct numbers never collide',fc.property(number,number,(n,m)=>{const variants=['0'+n,'+212'+n,'00212'+n,'+212 '+String(n).split('').join('.'),'0'+String(n).split('').join('-')];for(const v of variants)assert.equal(phone.digits(v),'212'+n);assert.equal(phone.same('0'+n,'+212'+m),n===m);}));
await strict('browser upsert deduplicates equivalent phones while retaining distinct people',fc.property(number,n=>{for(const store of Object.values(stores))store.data={};const a=book.upsert({name:'First',phone:'0'+n},f.merchant);const retry=book.upsert({name:'Again',phone:'+212 '+n},f.merchant);assert.equal(retry.id,a.id);assert.equal(book.count(f.merchant),1);book.upsert({name:'Other',phone:'00212'+(n===799999999?600000000:n+1)},f.merchant);assert.equal(book.count(f.merchant),2);}));
await strict('retried and concurrent same-ref creates keep one profile and cannot overwrite ledger totals',fc.asyncProperty(cents,async amount=>{await reset();const profile={id:'new',name:'Local Fixture',spend:999,visits:999,updated:100};(await Promise.all([request(post,profile),request(post,profile)])).forEach(ok);ok(await request(post,{purchase:{clientId:'new',ref:'sale',amount:amount/100}}));ok(await request(post,{...profile,updated:200}));const rows=ok(await request(get,{},'till','GET')).clients.filter(c=>c.id==='new');assert.equal(rows.length,1);assert.equal(C(rows[0].spend),amount);assert.equal(rows[0].visits,1);}));
await strict('deleted profile stays erased even after equal or future-clock device retries',fc.asyncProperty(fc.integer({min:0,max:1000000}),async skew=>{await reset();ok(await request(post,{id:'new',name:'Erased',phone:'0600000000',updated:Date.now()+skew}));ok(await request(del,{id:'new'},'till','DELETE'));const tomb=f.sql.prepare('SELECT * FROM clients WHERE id=?').get('new');ok(await request(post,{id:'new',name:'Erased',phone:'0600000000',updated:tomb.updated_ts+skew}));const row=ok(await request(get,{},'till','GET')).clients.find(c=>c.id==='new');assert.equal(row.deleted,1);assert.equal(row.phone,'');assert.equal(row.name,'');}),[[0],[1]]);
await strict('employee linked-sale spend keeps centimes across retries and both book projections',fc.asyncProperty(cents,async amount=>{await reset();f.insert('linked',amount);const body={clientId:'client-fixture',saleId:'linked',ref:'employee'};ok(await request(employeePost,body,'employee'));ok(await request(employeePost,body,'employee'));const a=ok(await request(get,{},'till','GET')).clients[0],e=ok(await request(employeeGet,{},'employee','GET')).clients[0];assert.equal(C(a.spend),amount);assert.equal(C(e.spend),amount);assert.equal(a.visits,1);}),[[1],[1999999]]);
await strict('multiple sale-linked purchases sum spend to the centime and visits once per sale in browser and API',fc.asyncProperty(fc.array(cents,{minLength:1,maxLength:8}),async amounts=>{await reset();await b.reset({});for(const [i,amount]of amounts.entries()){const id='sale-'+i;f.insert(id,amount);ok(await f.clients({purchase:{clientId:'client-fixture',ref:'purchase:client-fixture:'+id,saleRef:id,amount:amount/100}}));}await b.pull();const total=f.sql.prepare('SELECT SUM(amount_cents) n FROM sales WHERE void_ts IS NULL').get().n;const row=ok(await request(get,{},'owner','GET')).clients[0];assert.equal(C(row.spend),total);assert.equal(row.visits,amounts.length);assert.equal(C(b.get().spend),total);assert.equal(b.get().visits,amounts.length);assert.equal(C(row.purchase_history.reduce((n,p)=>n+p.amount,0)),total);}));
await strict('points and spend accrue only on money received: voucher, store credit, delivery and consigned shares of a ticket earn nothing, and a replay stays a replay',fc.asyncProperty(cents,fc.integer({min:0,max:1999999}),fc.integer({min:0,max:1999999}),fc.integer({min:0,max:99}),async(cash,credit,delivery,consignedPct)=>{await reset();doc('fidelity',{model:'amount',amount:{perMad:1,threshold:100}});const consigned=Math.floor(cash*consignedPct/100),received=cash-consigned;const parts=[{method:'cash',amountCents:cash}];if(credit)parts.push({method:'credit',amountCents:credit});if(delivery)parts.push({method:'delivery',amountCents:delivery});f.insert('mixed',received,{parts});const claim={clientId:'client-fixture',ref:'purchase:client-fixture:mixed',saleRef:'T-1',amount:(cash+credit+delivery)/100};const first=ok(await request(post,{purchase:claim}));assert.equal(first.points,Math.floor(received/100+1e-6));assert.equal(C(first.spend),received);const row=f.rowClient();assert.equal(C(row.spend),received);assert.equal(row.points,Math.floor(received/100+1e-6));const again=ok(await request(post,{purchase:claim}));assert.equal(again.replayed,true);assert.equal(f.rowClient().points,row.points);}),[[1000,500,0,0],[1000,0,700,0],[1,1999999,1999999,50]]);
await strict('book spend follows linked sale void/refund intent; visits remain historical and browser agrees',fc.asyncProperty(cents,fc.boolean(),async(amount,voided)=>{await reset();await b.reset({});f.insert('linked',amount);ok(await f.clients({purchase:{clientId:'client-fixture',ref:'purchase:client-fixture:linked',saleRef:'linked',amount:amount/100}}));if(voided)ok(await f.call('admin',{ids:['linked'],action:'void',reason:'formation',force:true},'operator'));else ok(await f.clients({refund:{clientId:'client-fixture',ref:'refund:local',saleRef:'linked',amount:amount/100}}));await b.pull();const row=f.rowClient();assert.equal(C(row.spend),0);assert.equal(row.visits,1);assert.equal(C(b.get().spend),0);assert.equal(b.get().visits,1);assert.equal(b.get().points,row.points);}));
await strict('tenant isolation covers read/write/delete, employee routes and payload credential projection',fc.asyncProperty(number,async n=>{await reset();f.sql.prepare('INSERT INTO clients(merchant,id,name,phone) VALUES(?,?,?,?)').run('server-other-shop','foreign','Foreign','+212'+n);for(const [handler,method,body,role]of [[get,'GET',{},'owner'],[post,'POST',{id:'foreign',name:'Changed'},'owner'],[del,'DELETE',{id:'foreign'},'owner'],[get,'GET',{},'till'],[post,'POST',{id:'foreign',name:'Changed'},'till'],[del,'DELETE',{id:'foreign'},'till'],[employeeGet,'GET',{},'employee'],[employeePost,'POST',{clientId:'foreign',ref:'x',amount:1},'employee']]){const r=await request(handler,{...body,merchant:'server-other-shop'},role,method);if(handler===get&&role==='owner'&&r.status===200)assert.notEqual(r.body.merchant,'server-other-shop');else assert.ok([401,403].includes(r.status));assert.ok(!JSON.stringify(r.body).includes('+212'+n));}for(const [handler,role]of [[get,'till'],[employeeGet,'employee']]){const payload=JSON.stringify(ok(await request(handler,{},role,'GET')));for(const marker of ['synthetic-password-marker','synthetic-code-marker','pinCode','password'])assert.ok(!payload.includes(marker));}assert.equal(f.sql.prepare("SELECT name FROM clients WHERE id='foreign'").get().name,'Foreign');assert.equal((await request(get,{},'employee','GET')).status,401);}));
await strict('unsupported self-merge refuses without changing totals',fc.asyncProperty(cents,async amount=>{await reset();const before=JSON.stringify(f.rowClient());assert.equal((await request(post,{merge:{from:'client-fixture',to:'client-fixture'},amount})).status,400);assert.equal(JSON.stringify(f.rowClient()),before);}));
await strict('independent device fields survive either arrival order and arbitrary clock skew',fc.asyncProperty(fc.boolean(),fc.integer({min:-1000000000000000,max:1000000000000000}),async(reverse,skew)=>{await reset();const base={id:'client-fixture',name:'Before',phone:'0600000000',notes:'Before'};ok(await request(post,base));const edits=[{...base,phone:'0700000000',profileBase:base,updated:Date.now()+skew},{...base,notes:'Device B',profileBase:base,updated:1}];if(reverse)edits.reverse();for(const edit of edits)ok(await request(post,edit));const row=f.rowClient();assert.equal(row.phone,'0700000000');assert.equal(row.notes,'Device B');}));
await strict('shipped browser devices preserve independent queued edits and converge despite skew',fc.asyncProperty(fc.boolean(),fc.integer({min:-1000000000000000,max:1000000000000000}),async(reverse,skew)=>{
 await reset();ok(await request(post,{id:'client-fixture',name:'Before',phone:'0600000000',notes:'Before'}));
 const a=syncDevice(skew),b=syncDevice(-skew);await a.pull();await b.pull();
 a.book.upsert({id:'client-fixture',phone:'0700000000'},f.merchant);
 b.book.upsert({id:'client-fixture',notes:'Device B'},f.merchant);
 // A poll arriving before acknowledgement must retain the queued edit.
 await a.pull();await b.pull();
 for(const d of reverse?[b,a]:[a,b])await d.flush();
 assert.equal(phone.digits(f.rowClient().phone),'212700000000');assert.equal(f.rowClient().notes,'Device B');
 for(const d of [a,b]){await d.pull();const row=d.book.get('client-fixture',f.merchant);assert.equal(phone.digits(row.phone),'212700000000');assert.equal(row.notes,'Device B');}
}));
/* Une caisse hors ligne longtemps : la file des fiches à renvoyer est regroupée
 * par client et ne perd aucun jeton, même au-delà de 500 fiches en souffrance. */
{const label='offline profile outbox keeps one token per client and drops none past 500 clients',n=520;try{
 await reset();const d=syncDevice(0);await d.pull();const outbox=()=>JSON.parse(d.storage.get('kiwi:clients-out:v1:'+f.merchant)||'[]');
 const ids=[];for(let i=0;i<n;i++)ids.push(d.book.upsert({name:'Offline '+i,phone:'06'+String(10000000+i)},f.merchant).id);
 for(let i=0;i<3;i++)d.book.upsert({id:ids[0],notes:'Edit '+i},f.merchant);
 assert.equal(outbox().length,n);assert.deepEqual([...outbox()].sort(),[...ids].sort());
 await d.flush();assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM clients WHERE merchant=? AND name LIKE 'Offline %'").get(f.merchant).n,n);assert.equal(outbox().length,0);
passed++;console.log('✓ '+label);}catch(e){failed++;console.error('✗ '+label,e);}}
await strict('ordinary profile snapshots cannot overwrite ledger fields, including financial import retries',fc.asyncProperty(cents,async amount=>{
 await reset();ok(await request(post,{purchase:{clientId:'client-fixture',ref:'ledger',amount:amount/100}}));const before=f.rowClient();
 ok(await request(post,{id:'client-fixture',name:'Edited',points:999999,stamps:999999,spend:999999,visits:999999,balance:999999,credit:999999,financialImport:true,updated:1e15}));
 const after=f.rowClient();for(const key of ['points','stamps','spend','visits'])assert.equal(after[key],before[key]);assert.ok(!Object.hasOwn(after,'balance'));assert.ok(!Object.hasOwn(after,'credit'));
}));
await strict('same field follows server arrival for current browsers and future clocks are clamped',fc.asyncProperty(fc.integer({min:1,max:1000000000000000}),async skew=>{await reset();ok(await request(post,{id:'client-fixture',name:'Future',updated:Date.now()+skew}));assert.ok(f.rowClient().updated_ts<=Date.now());ok(await request(post,{id:'client-fixture',name:'Later',updated:1,profileBase:{name:'Future'}}));assert.equal(f.rowClient().name,'Later');await reset();ok(await request(post,{id:'client-fixture',name:'Future',updated:Date.now()+skew}));ok(await request(post,{id:'client-fixture',name:'Honest',updated:Date.now()}));assert.equal(f.rowClient().name,'Honest')}))
/* Une caisse restée sur l'ancienne version (pas de profileBase) rejoue sa file
 * après une coupure : sa fiche entière, plus vieille que la correction faite
 * entre-temps depuis le tableau de bord, ne l'écrase pas. */
await strict('a legacy whole-record replay older than the stored record does not overwrite it',fc.asyncProperty(fc.integer({min:1,max:3600000}),async age=>{await reset();const fixedAt=Date.now();ok(await request(post,{id:'client-fixture',name:'Fixed',updated:fixedAt,profileBase:{name:'Before'}}));ok(await request(post,{id:'client-fixture',name:'Stale',updated:fixedAt-age}));assert.equal(f.rowClient().name,'Fixed')}))
await knownIssue('CL-2','no duplicate merge contract exists: union of visits/spend/notes/tags and reverse-merge semantics require design',fc.asyncProperty(cents,async amount=>{await reset();ok(await request(post,{id:'duplicate',name:'Duplicate',notes:'Second',tags:['second']}));const r=await request(post,{merge:{from:'duplicate',to:'client-fixture'}});return r.status===200&&f.sql.prepare("SELECT deleted FROM clients WHERE id='duplicate'").get().deleted===1;}));
/* CL-3 · les étiquettes voyagent : écrites par une caisse, lues par l'autre, jamais
 * effacées par un tirage, vidées avec la fiche supprimée ; avant la migration 0009
 * les routes répondent comme avant et l'appareil garde les siennes. */
await strict('CL-3 tags persist on the server, reach a second device and survive pulls',fc.asyncProperty(fc.array(fc.constantFrom('vip','grossiste','famille','Riad 3'),{minLength:1,maxLength:3}),async tags=>{await reset();ok(await request(post,{id:'client-fixture',tags}));const want=[...new Set(tags)];assert.deepEqual(ok(await request(get,{},'till','GET')).clients[0].tags,want);
 const a=syncDevice(0),b=syncDevice(0);await a.pull();await b.pull();assert.deepEqual(a.book.get('client-fixture',f.merchant).tags,want);
 a.book.upsert({id:'client-fixture',tags:['nouveau']},f.merchant);await a.pull();assert.deepEqual(a.book.get('client-fixture',f.merchant).tags,['nouveau']);await a.flush();await b.pull();await a.pull();
 for(const d of [a,b])assert.deepEqual(d.book.get('client-fixture',f.merchant).tags,['nouveau']);
 ok(await request(post,{id:'client-fixture',name:'Sans étiquette',profileBase:{name:'x'}}));assert.equal(f.rowClient().tags,'["nouveau"]');
 ok(await request(del,{id:'client-fixture'},'till','DELETE'));assert.equal(f.rowClient().tags,'[]');f.sql.exec("UPDATE clients SET deleted=0 WHERE id='client-fixture'");
 f.sql.exec('ALTER TABLE clients DROP COLUMN tags');try{const c=syncDevice(0);await c.pull();c.book.upsert({id:'client-fixture',tags:['local']},f.merchant);await c.flush();await c.pull();assert.deepEqual(c.book.get('client-fixture',f.merchant).tags,['local']);assert.equal(ok(await request(get,{},'till','GET')).clients[0].tags,undefined);ok(await request(del,{id:'client-fixture'},'till','DELETE'));}finally{f.sql.exec("ALTER TABLE clients ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");}
}),[[['vip']]]);
await knownIssue('CL-4','on-shift service role can enumerate search results without a distinct export permission; no export route exists',fc.asyncProperty(fc.constant(''),async q=>{await reset();return (await request(employeeGet,{q,export:true},'employee','GET')).status===403;}));
await knownIssue('CL-6','employee purchases use a separate event ledger, so sale void does not reverse their spend; unifying flows requires a migration decision',fc.asyncProperty(cents,async amount=>{await reset();f.insert('linked',amount);ok(await request(employeePost,{clientId:'client-fixture',saleId:'linked'},'employee'));ok(await f.call('admin',{ids:['linked'],action:'void',reason:'formation',force:true},'operator'));return C(f.rowClient().spend)===0;}));
/* CL-5 · un même numéro, une seule fiche au serveur : la seconde caisse qui écrit
 * le numéro autrement rejoint la première, garde ce qu'elle seule savait, n'efface
 * rien, et ses achats en file sous l'ancien id arrivent sur la fiche gardée. */
await strict('CL-5 server phone identity matches KiwiPhone.digits for every input',fc.property(fc.oneof(number.map(n=>'0'+n),number.map(n=>'+212 '+n),number.map(n=>'00212'+String(n).split('').join('.')),fc.string({maxLength:30}),fc.stringMatching(/^[+0-9 ().-]{0,24}$/)),s=>{assert.equal(serverPhoneKey(s),phone.digits(s));}));
await strict('CL-5 a second device creating the same phone written differently joins the first profile without losing or blanking a field, only within its shop',fc.asyncProperty(number,fc.constantFrom('0','+212','00212','+212 ','0'),async(n,prefix)=>{
 await reset();f.sql.prepare('INSERT INTO clients(merchant,id,name,phone) VALUES(?,?,?,?)').run('server-other-shop','foreign','Foreign','0'+n);
 ok(await request(post,{id:'a',name:'Amina',phone:'0'+n,notes:'Première caisse',city:''}));
 const r=ok(await request(post,{id:'b',name:'',phone:prefix+n,email:'amina@example.test',city:'Fès',notes:'Deuxième caisse',tags:['vip'],consent:true}));assert.equal(r.mergedInto,'a');
 const live=ok(await request(get,{},'till','GET')).clients.filter(c=>!c.deleted&&phone.same(c.phone,'0'+n));assert.equal(live.length,1);const row=live[0];
 assert.equal(row.id,'a');assert.equal(row.name,'Amina');assert.equal(row.email,'amina@example.test');assert.equal(row.city,'Fès');assert.equal(row.consent,1);
 assert.ok(row.notes.includes('Première caisse')&&row.notes.includes('Deuxième caisse'));assert.deepEqual(row.tags,['vip']);
 const alias=f.sql.prepare("SELECT * FROM clients WHERE merchant=? AND id='b'").get(f.merchant);assert.equal(alias.deleted,1);for(const k of ['name','phone','email','city','notes'])assert.equal(alias[k],'');
 ok(await request(post,{id:'b',name:'Autre nom',phone:prefix+n,address:'Derb 3'}));ok(await request(post,{purchase:{clientId:'b',ref:'purchase:b:x',amount:12.5}}));ok(await request(post,{purchase:{clientId:'b',ref:'purchase:b:x',amount:12.5}}));
 const a=f.sql.prepare("SELECT * FROM clients WHERE merchant=? AND id='a'").get(f.merchant);assert.equal(a.name,'Amina');assert.equal(a.address,'Derb 3');assert.equal(C(a.spend),1250);assert.equal(a.visits,1);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM clients WHERE merchant=? AND deleted=0 AND id IN ('a','b')").get(f.merchant).n,1);
 const foreign=f.sql.prepare("SELECT * FROM clients WHERE merchant='server-other-shop' AND id='foreign'").get();assert.equal(foreign.deleted,0);assert.equal(foreign.name,'Foreign');assert.equal(foreign.email,'');
 ok(await request(post,{id:'c',name:'Voisin',phone:'0'+(n===799999999?600000000:n+1)}));assert.equal(f.sql.prepare("SELECT deleted FROM clients WHERE merchant=? AND id='c'").get(f.merchant).deleted,0);
}),[[612345678,'+212 ']]);
// Barrière : les deux recherches de numéro partent avant toute écriture, comme
// deux caisses au même instant ; chacune crée donc sa fiche avant de voir l'autre.
async function phoneRace(work){const db=f.env.DB,orig=db.prepare;let n=0,timer;const waits=[],release=()=>{clearTimeout(timer);waits.splice(0).forEach(fn=>queueMicrotask(fn));};db.prepare=function(sql){const st=orig.call(db,sql);if(!String(sql).includes('REPLACE(REPLACE('))return st;const wrap=s=>({bind:(...a)=>wrap(s.bind(...a)),first:(...a)=>s.first(...a),run:(...a)=>s.run(...a),all:(...a)=>{if(n++>=2)return s.all(...a);return new Promise(res=>{waits.push(()=>res(s.all(...a)));if(waits.length===2)release();else timer=setTimeout(release,2000);});}});return wrap(st);};try{return await work();}finally{db.prepare=orig;clearTimeout(timer);}}
await strict('CL-5 two tills creating the same phone at once keep one live profile with both fields',fc.asyncProperty(number,async n=>{
 await reset();await phoneRace(()=>Promise.all([request(post,{id:'x',name:'Sara',phone:'0'+n}),request(post,{id:'y',phone:'+212'+n,email:'sara@example.test'})])).then(rs=>rs.forEach(ok));
 const live=f.sql.prepare("SELECT * FROM clients WHERE merchant=? AND deleted=0 AND id IN ('x','y')").all(f.merchant);assert.equal(live.length,1);assert.equal(live[0].name,'Sara');assert.equal(live[0].email,'sara@example.test');
}));
}finally{f.close();}
console.log(`clients-properties: ${passed} strict passed, ${failed} failed, ${known} known; runs=${RUNS}; seed=${SEED}`);if(failed)process.exitCode=1;
