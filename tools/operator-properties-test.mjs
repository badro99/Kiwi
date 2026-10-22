#!/usr/bin/env node
// Local real Pages handlers and transactional SQLite, no external services.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {fixture} from './server-money-fixture.mjs';
import * as auth from '../functions/auth/_lib.js';
import {onRequestGet as menuGet} from '../functions/api/menu.js';
import {onRequestPost as employeePost} from '../functions/api/employee.js';
const ROOT=path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ fast-check unavailable; operator properties skipped');process.exit(0);}
const routes=Object.fromEntries(await Promise.all(['operators','account','config','pins','reset','overview','clients','sales','notes','tasks','support','audit','workspace','attendance-link','demo-requests'].map(async n=>[n,await import('../functions/api/admin/'+n+'.js')])));
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||60,seed=20261022;
let passed=0,failed=0,known=0;
async function strict(label,p){if(process.env.KIWI_PROPERTY_ONLY&&!new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label))return;const r=await fc.check(p,{numRuns:RUNS,seed});if(r.failed){failed++;console.error('✗ '+label+'; seed='+r.seed+'; path='+r.counterexamplePath);}else{passed++;console.log('✓ '+label);}}
async function knownIssue(label,p){if(process.env.KIWI_PROPERTY_ONLY)return;const r=await fc.check(p,{numRuns:RUNS,seed});if(!r.failed||(r.errorInstance && r.errorInstance.message!=='Property failed by returning false')){failed++;console.error('✗ known issue changed or threw: '+label);}else{known++;console.log('◦ known: '+label);}}
async function setup(){const f=await fixture(ROOT);const secret=f.env.AUTH_SECRET;
 // Real D1 read methods are promises, including consumers attaching .catch.
 const prepare=f.DB.prepare.bind(f.DB);f.DB.prepare=q=>{const st=prepare(q);for(const name of ['first','all']){const read=st[name].bind(st);st[name]=async()=>read();}return st;};
 const at=Date.now;let expired,expiredOperator;try{Date.now=()=>1;expired=await auth.makeSession('money-owner',secret);expiredOperator=await auth.operatorIdToken(secret,'money-operator');}finally{Date.now=at;}
 f.cookies={expiredOperator:`kiwi_op=${await auth.operatorToken(secret)}; kiwi_op_id=${expiredOperator}`,forgedOperator:`kiwi_op=${await auth.operatorToken(secret)}; kiwi_op_id=${await auth.operatorIdToken('wrong-local-secret','money-operator')}`,owner:`${auth.SESS_COOKIE}=${await auth.makeSession('money-owner',secret)}`,employee:`${auth.EMPLOYEE_COOKIE}=${await auth.employeeToken(secret,{merchant:f.merchant,staffId:'fixture-staff'})}`,till:`${auth.TILL_COOKIE}=${await auth.tillToken(secret,f.merchant)}`,expired:`${auth.SESS_COOKIE}=${expired}`,forged:`${auth.SESS_COOKIE}=${await auth.makeSession('money-owner','wrong-local-secret')}`,unnamed:`kiwi_op=${await auth.operatorToken(secret)}`,operator:`kiwi_op=${await auth.operatorToken(secret)}; kiwi_op_id=${await auth.operatorIdToken(secret,'money-operator')}`,revoked:`kiwi_op=${await auth.operatorToken(secret)}; kiwi_op_id=${await auth.operatorIdToken(secret,'removed-operator')}`};
 f.callAdmin=async(name,method='GET',body={},role='operator',query={})=>{const u=new URL('https://kiwi.test/api/admin/'+name);for(const[k,v]of Object.entries({merchant:f.merchant,...query}))u.searchParams.set(k,v);const request=new Request(u,{method,headers:{Cookie:f.cookies[role]||'','Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});const res=await routes[name]['onRequest'+method[0]+method.slice(1).toLowerCase()]({request,env:f.env});return{status:res.status,body:await res.json()};};return f;}
function snapshot(f){return JSON.stringify(f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,f.sql.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));}
function tenantSnapshot(f,merchant){return JSON.stringify(f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().filter(({name})=>f.sql.prepare('PRAGMA table_info("'+name+'")').all().some(c=>c.name==='merchant')).map(({name})=>[name,f.sql.prepare('SELECT * FROM "'+name+'" WHERE merchant=? ORDER BY rowid').all(merchant)]));}
const methods=Object.entries(routes).flatMap(([n,r])=>Object.keys(r).filter(k=>/^onRequest/.test(k)).map(k=>[n,k.slice(9).toUpperCase()]));
await strict('every admin handler rejects nonoperators without changing any row',fc.asyncProperty(fc.constantFrom('owner','employee','till','expired','forged','forgedOperator','unnamed','revoked','anonymous'),async role=>{const f=await setup();try{for(const[n,m]of methods){const before=snapshot(f);const r=await f.callAdmin(n,m,{merchant:f.merchant,id:'fixture-id',status:'suspended'},role);assert.equal(r.status,403);assert.equal(snapshot(f),before);}}finally{f.close();}}));
const roster=fc.array(fc.record({name:fc.string({maxLength:30}),role:fc.constantFrom('manager','serveur','cashier')}),{minLength:1,maxLength:6});
await knownIssue('operators can read staff codes in the console list (Afficher button; owner decision, codes stay operator-readable like the team doc)',fc.asyncProperty(roster,async rows=>{const f=await setup();try{rows.forEach((r,i)=>f.sql.prepare('INSERT INTO staff_pins(id,merchant,pin,name,role,created_ts) VALUES(?,?,?,?,?,?)').run('p'+i,f.merchant,String(1000+i),r.name,r.role,i));const r=await f.callAdmin('pins');assert.equal(r.status,200);assert.equal(r.body.pins.length,rows.length);return r.body.pins.every(p=>!('pin' in p));}finally{f.close();}}));
await knownIssue('PIN creation echoes the code to the operator who just typed it (same owner decision)',fc.asyncProperty(fc.integer({min:1000,max:9999}),async value=>{const f=await setup();try{const r=await f.callAdmin('pins','POST',{merchant:f.merchant,pin:String(value),name:'Fixture',role:'manager'});assert.equal(r.status,200);return !('pin' in r.body.pin);}finally{f.close();}}));
await strict('login revert uses login history even after billing or contact edits',fc.asyncProperty(fc.constantFrom('billing','contact'),fc.integer({min:1,max:999}),async(field,n)=>{const f=await setup();try{const accountId='money-owner',original=f.sql.prepare('SELECT email FROM accounts WHERE id=?').get(accountId).email;for(const [key,email]of [['login',`login${n}@example.test`],[field,`other${n}@example.test`]]){const r=await f.callAdmin('account','PUT',{accountId,field:key,email,merchant:f.merchant,reason:'Synthetic correction'});assert.equal(r.status,200);}
 const r=await f.callAdmin('account','PUT',{accountId,field:'login',revert:true,reason:'Synthetic recovery'});assert.equal(r.status,200);assert.equal(f.sql.prepare('SELECT email FROM accounts WHERE id=?').get(accountId).email,original);}finally{f.close();}}));
await strict('credential storage is excluded from admin read projections',fc.asyncProperty(fc.uuid(),async nonce=>{const f=await setup();try{
 const hidden='synthetic-private-'+nonce;
 f.sql.prepare('UPDATE accounts SET salt=?,hash=?').run(hidden,hidden);
 f.sql.prepare('UPDATE operators SET salt=?,hash=?').run(hidden,hidden);
 f.sql.prepare('INSERT INTO reset_tokens(selector,account_id,verifier,created_ts,expires_ts) VALUES(?,?,?,?,?)').run(hidden,'money-owner',hidden,Date.now(),Date.now()+60000);
 for(const feature of ['team','employee-access'])f.sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,1)').run(f.merchant,feature,JSON.stringify({members:[{id:'synthetic',name:'Synthetic',pinCode:hidden,password:hidden,email:'staff@example.test'}]}));
 for(const name of ['operators','account','reset','config','pins','clients','overview','sales','audit','workspace','support','demo-requests']){const r=await f.callAdmin(name,'GET',{},'operator',{accountId:'money-owner'});assert.equal(r.status,200);assert.ok(!JSON.stringify(r.body).includes(hidden));}
 }finally{f.close();}}));
await strict('task sequences audit each accepted version once and preserve neighboring merchant',fc.asyncProperty(fc.array(fc.constantFrom('open','in_progress'),{minLength:1,maxLength:10}),async states=>{const f=await setup();try{const m=f.merchant,other=JSON.stringify(f.sql.prepare('SELECT * FROM merchant_config WHERE merchant=?').get('server-other-shop'));const body={id:'task-property',merchant:m,title:'Synthetic follow up'};assert.equal((await f.callAdmin('tasks','POST',body)).status,200);await f.callAdmin('tasks','POST',body);let version=1;for(const status of states){const b={id:body.id,merchant:m,version,status};assert.equal((await f.callAdmin('tasks','PATCH',b)).status,200);assert.equal((await f.callAdmin('tasks','PATCH',b)).status,409);version++;}const events=f.sql.prepare('SELECT * FROM operator_task_events').all();assert.equal(events.length,version);assert.ok(events.every(e=>e.actor_id==='money-operator'&&e.actor==='Property Operator'&&e.merchant===m));assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM merchant_config WHERE merchant=?').get('server-other-shop')),other);}finally{f.close();}}));
await strict('invalid slug lookalikes cannot write notes or tasks',fc.asyncProperty(fc.constantFrom('SERVER-MONEY-SHOP',' server-money-shop','server-money-shop ','ѕerver-money-shop','server-money-shop/other'),async merchant=>{const f=await setup();try{for(const route of ['notes','tasks']){const before=snapshot(f);const r=await f.callAdmin(route,'POST',{merchant,id:'lookalike-id',title:'Synthetic',body:'Synthetic'});assert.equal(r.status,400);assert.equal(snapshot(f),before);}}finally{f.close();}}));
await strict('deletion without exact confirmation refuses without writes',fc.asyncProperty(fc.constantFrom('', 'other-shop','SERVER-MONEY-SHOP','ѕerver-money-shop'),async confirm=>{const f=await setup();try{const before=snapshot(f);assert.equal((await f.callAdmin('clients','DELETE',{},'operator',{confirm})).status,400);assert.equal(snapshot(f),before);}finally{f.close();}}));
await strict('reset without mail creates no token or audit and changes no account',fc.asyncProperty(fc.boolean(),async spoof=>{const f=await setup();try{const before=snapshot(f);const r=await f.callAdmin('reset','POST',{accountId:'money-owner',merchant:f.merchant,...(spoof?{to:'attacker@example.test'}:{})});assert.equal(r.status,503);assert.equal(snapshot(f),before);}finally{f.close();}}));
await strict('reset delivery stays account-scoped, hides token, audits once and throttles retries',fc.asyncProperty(fc.integer({min:1,max:4}),async retries=>{const f=await setup(),fetch=globalThis.fetch;try{
 f.sql.exec("INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES('other-owner','other@example.test','Other','s','h',1)");
 f.sql.prepare('INSERT INTO reset_tokens(selector,account_id,verifier,created_ts,expires_ts) VALUES(?,?,?,?,?)').run('synthetic-other-selector','other-owner','synthetic-other-verifier',1,9999999999999);
 const other=JSON.stringify(f.sql.prepare("SELECT * FROM reset_tokens WHERE account_id='other-owner'").all()),account=f.sql.prepare("SELECT * FROM accounts WHERE id='money-owner'").get();
 let delivered=null,calls=0;f.env.MAIL_WEBHOOK='https://local-mail.invalid';globalThis.fetch=async(url,options)=>{assert.equal(url,f.env.MAIL_WEBHOOK);calls++;delivered=JSON.parse(options.body);return new Response('',{status:200});};
 const body={accountId:'money-owner',merchant:f.merchant,to:'attacker@example.test'};
 const r=await f.callAdmin('reset','POST',body);assert.equal(r.status,200);assert.equal(calls,1);assert.equal(delivered.to,account.email);
 const row=f.sql.prepare("SELECT * FROM reset_tokens WHERE account_id='money-owner'").get();assert.ok(row);const response=JSON.stringify(r.body);for(const secret of [row.selector,row.verifier,delivered.text])assert.ok(!response.includes(secret));
 for(let i=0;i<retries;i++)assert.equal((await f.callAdmin('reset','POST',body)).status,429);
 assert.equal(calls,1);const audit=f.sql.prepare("SELECT * FROM account_audit WHERE action='reset'").all();assert.equal(audit.length,1);assert.equal(audit[0].actor_id,'money-operator');assert.equal(audit[0].actor,'Property Operator');assert.equal(audit[0].merchant,f.merchant);assert.equal(audit[0].account_id,'money-owner');
 assert.equal(JSON.stringify(f.sql.prepare("SELECT * FROM reset_tokens WHERE account_id='other-owner'").all()),other);assert.deepEqual(f.sql.prepare("SELECT * FROM accounts WHERE id='money-owner'").get(),account);
 }finally{globalThis.fetch=fetch;f.close();}}));
await strict('confirmed deletion preserves every neighboring merchant row',fc.asyncProperty(fc.integer({min:1,max:5}),async n=>{const f=await setup();try{for(const m of [f.merchant,'server-other-shop']){
 for(let i=0;i<n;i++)f.insert(m+'-'+i,123,{merchant:m});
 f.sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,?,?)').run(m,'team',JSON.stringify({members:[{id:'synthetic-member',name:m}]}),3,123);
 f.sql.prepare('INSERT INTO staff_pins(id,merchant,pin,name,role,created_ts) VALUES(?,?,?,?,?,?)').run('pin-'+m,m,String(1000),'Synthetic','manager',1);
 f.sql.prepare('INSERT INTO operator_notes(id,merchant,body,actor_id,actor,ts) VALUES(?,?,?,?,?,?)').run('note-'+m,m,'Synthetic','money-operator','Property Operator',1);
 f.sql.prepare("INSERT INTO support_tickets(id,reference,merchant,category,priority,channel,contact,summary,created_ts,updated_ts) VALUES(?,?,?,'materiel','normal','email','synthetic@example.test','Synthetic',1,1)").run('ticket-'+m,'REF-'+m,m);
 f.sql.prepare("INSERT INTO support_messages(id,ticket_id,kind,channel,author,body,ts) VALUES(?,?,'note','internal','Property Operator','Synthetic',1)").run('message-'+m,'ticket-'+m);
 }
 const before=tenantSnapshot(f,'server-other-shop'),messages=JSON.stringify(f.sql.prepare("SELECT * FROM support_messages WHERE ticket_id='ticket-server-other-shop'").all());const r=await f.callAdmin('clients','DELETE',{},'operator',{confirm:f.merchant});assert.equal(r.status,200);assert.equal(tenantSnapshot(f,'server-other-shop'),before);assert.equal(JSON.stringify(f.sql.prepare("SELECT * FROM support_messages WHERE ticket_id='ticket-server-other-shop'").all()),messages);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sales WHERE merchant=?').get(f.merchant).n,0);}finally{f.close();}}));
await strict('operator status changes enforce sale and employee writes and suspended public menu',fc.asyncProperty(fc.array(fc.constantFrom('pending','active','suspended'),{minLength:3,maxLength:8}),async states=>{const f=await setup();try{
 const member={id:'fixture-staff',firstName:'Synthetic',function:'serveur',authVersion:0};
 for(const feature of ['team','employee-access'])f.sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,1)').run(f.merchant,feature,JSON.stringify({members:[member]}));
 let i=0;for(const status of states){assert.equal((await f.callAdmin('clients','PATCH',{merchant:f.merchant,status})).status,200);
 const before=f.sql.prepare('SELECT COUNT(*) n FROM sales').get().n;
 const sale=await f.call('sale',{id:'status-sale-'+(++i),amount:10,amountCents:1000,method:'cash',ts:Date.now()},'owner');
 assert.equal(sale.status,status==='pending'?402:status==='suspended'?423:200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sales').get().n,before+(status==='active'?1:0));
 const request=new Request('https://kiwi.test/api/employee',{method:'POST',headers:{Cookie:f.cookies.employee,'Content-Type':'application/json'},body:JSON.stringify({action:'planning-request',type:'leave',startDate:'2026-11-01',endDate:'2026-11-02'})});
 const employee=await employeePost({request,env:f.env});assert.equal(employee.status,status==='pending'?402:status==='suspended'?403:200);
 const menu=await menuGet({request:new Request('https://kiwi.test/api/menu?merchant='+f.merchant),env:f.env});const data=await menu.json();if(status==='suspended'){assert.equal(data.suspended,true);assert.equal(data.menu,null);assert.equal(data.shop,null);}
 }
 }finally{f.close();}}));
// Pending stores intentionally retain screen reads (_private.js); no invented
// transition graph or separate operator roles: isSeniorOperator == isOperator.
// Ex-known : la configuration et ses lignes de config_audit partent dans le même batch.
await strict('config PUT changes nothing when its module audit insert fails',fc.asyncProperty(fc.boolean(),async enabled=>{const f=await setup();try{
 f.sql.exec("CREATE TRIGGER property_audit_failure BEFORE INSERT ON config_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 const before=snapshot(f);const r=await f.callAdmin('config','PUT',{merchant:f.merchant,features:{menu:enabled}});
 assert.notEqual(r.status,200);assert.equal(snapshot(f),before);
 }finally{f.close();}}));
await knownIssue('status retries append duplicate audit rows; transition policy is not specified',fc.asyncProperty(fc.constantFrom('pending','active','suspended'),async status=>{const f=await setup();try{for(let i=0;i<2;i++)await f.callAdmin('clients','PATCH',{merchant:f.merchant,status});return f.sql.prepare('SELECT COUNT(*) n FROM account_audit').get().n===1;}finally{f.close();}}));
// Ex-known : créer ou retirer un code d'équipe écrit, dans le même batch, une ligne
// d'account_audit qui nomme l'opérateur et ne contient jamais le code.
await strict('operator staff code creation and removal are audited atomically without the code',fc.asyncProperty(fc.integer({min:1000,max:9999}),async value=>{const f=await setup();try{const pin=String(value),audit=()=>f.sql.prepare('SELECT * FROM account_audit ORDER BY id').all();
 const r=await f.callAdmin('pins','POST',{merchant:f.merchant,pin,name:'Synthetic',role:'manager'});assert.equal(r.status,200);
 const d=await f.callAdmin('pins','DELETE',{id:r.body.pin.id});assert.equal(d.status,200);
 const rows=audit();assert.deepEqual(rows.map(x=>x.action),['staff-pin-create','staff-pin-delete']);
 assert.ok(rows.every(x=>x.merchant===f.merchant&&x.actor==='Property Operator'&&x.actor_id==='money-operator'&&x.ts>0&&!Object.values(x).some(v=>String(v).includes(pin))));
 f.sql.exec("CREATE TRIGGER property_audit_failure BEFORE INSERT ON account_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 const before=snapshot(f);assert.notEqual((await f.callAdmin('pins','POST',{merchant:f.merchant,pin,name:'Synthetic'})).status,200);assert.equal(snapshot(f),before);
 }finally{f.close();}}));
// Ex-known : l'échéance est signée dans kiwi_op_id (v2) et vérifiée par le serveur.
await strict('operator credentials expire server-side, whatever the browser keeps',fc.asyncProperty(fc.integer({min:1,max:29}),async days=>{const f=await setup();try{const secret=f.env.AUTH_SECRET,op=`kiwi_op=${await auth.operatorToken(secret)}; kiwi_op_id=`,at=Date.now;assert.equal((await f.callAdmin('operators','GET',{},'expiredOperator')).status,403);let token;try{Date.now=()=>at()-days*86400000;token=await auth.operatorIdToken(secret,'money-operator');}finally{Date.now=at;}f.cookies.recent=op+token;assert.equal((await f.callAdmin('operators','GET',{},'recent')).status,200);try{Date.now=()=>at()+(31-days)*86400000;assert.equal((await f.callAdmin('operators','GET',{},'recent')).status,403);}finally{Date.now=at;}f.cookies.v1=op+'money-operator.'+createHmac('sha256',secret).update('kiwi-operator-id-v1:money-operator').digest('hex');assert.equal((await f.callAdmin('operators','GET',{},'v1')).status,403);}finally{f.close();}}));
// Ex-known : suspendre ou réactiver (compte ou établissement) écrit son relevé dans le même batch.
await strict('account and store status changes are audited atomically with the operator',fc.asyncProperty(fc.constantFrom('pending','active','suspended'),fc.boolean(),async(status,whole)=>{const f=await setup();try{const body=whole?{email:'money@example.test',status}:{merchant:f.merchant,status};
 const r=await f.callAdmin('clients','PATCH',body);assert.equal(r.status,200);
 const rows=f.sql.prepare('SELECT * FROM account_audit').all();assert.equal(rows.length,1);const[a]=rows;
 assert.equal(a.action,whole?'account-status':'store-status');assert.equal(a.next,status);assert.equal(a.actor,'Property Operator');assert.equal(a.actor_id,'money-operator');assert.ok(a.ts>0);
 if(whole)assert.equal(a.account_id,'money-owner');else assert.equal(a.merchant,f.merchant);
 f.sql.exec("CREATE TRIGGER property_audit_failure BEFORE INSERT ON account_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 const before=snapshot(f);assert.notEqual((await f.callAdmin('clients','PATCH',{...body,status:status==='suspended'?'active':'suspended'})).status,200);assert.equal(snapshot(f),before);
 }finally{f.close();}}));
// Ex-known : le statut d'une demande et son événement d'auteur partent dans le même batch.
await strict('support status change writes a durable actor event atomically',fc.asyncProperty(fc.constantFrom('open','waiting-client','resolved','closed'),async status=>{const f=await setup();try{f.sql.prepare("INSERT INTO support_tickets(id,reference,merchant,category,priority,channel,contact,summary,created_ts,updated_ts) VALUES('synthetic-ticket','SYNTHETIC',?,'materiel','normal','email','synthetic@example.test','Synthetic',1,1)").run(f.merchant);
 const r=await f.callAdmin('support','PATCH',{id:'synthetic-ticket',action:'status',status});assert.equal(r.status,200);
 const rows=f.sql.prepare('SELECT * FROM support_messages').all();assert.equal(rows.length,1);assert.equal(rows[0].kind,'status');assert.equal(rows[0].channel,'internal');assert.equal(rows[0].author,'Property Operator');assert.ok(rows[0].body.endsWith(status));
 f.sql.exec("CREATE TRIGGER property_audit_failure BEFORE INSERT ON support_messages BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 const before=snapshot(f);await f.callAdmin('support','PATCH',{id:'synthetic-ticket',action:'status',status:status==='closed'?'open':'closed'}).catch(()=>{});assert.equal(snapshot(f),before);
 }finally{f.close();}}));
// attendance-link intentionally issues a signed NFC URL. Reset is account-scoped,
// not store-scoped; delivery above uses a local fetch stub and never sends mail.
console.log(`operator properties: ${passed} held, ${failed} failed, ${known} known`);if(failed)process.exitCode=1;
