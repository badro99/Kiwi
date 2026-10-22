#!/usr/bin/env node
// Real Pages handlers against local SQLite. No pricing duplication or hosted data.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fixture} from './server-money-fixture.mjs';
import {onRequestPost as seat,onRequestGet as sessionGet} from '../functions/api/order/session.js';
import {onRequestPost as order,onRequestGet as orderGet} from '../functions/api/order/index.js';
import {onRequestPost as queue} from '../functions/api/order/queue.js';
import {settleCoveredOrders} from '../functions/api/_visit-cover.js';
import {makeSession,SESS_COOKIE} from '../functions/auth/_lib.js';
const ROOT=path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ fast-check unavailable; OrderPro properties skipped');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||100,SEED=Number(process.env.KIWI_PROPERTY_SEED)||20261022;
let failed=0,passed=0;
async function strict(label,p){if(process.env.KIWI_PROPERTY_ONLY&&!new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(r.failed){failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance);}else{passed++;console.log('✓ '+label);}}
const f=await fixture(ROOT),{sql,merchant}=f,other='server-other-shop';
const cookie=SESS_COOKIE+'='+await makeSession('money-owner',f.env.AUTH_SECRET);
for(const m of [merchant,other]){
 sql.prepare("UPDATE merchant_config SET type='restaurant',features=? WHERE merchant=?").run('{"orderpro":true}',m);
 sql.prepare('INSERT INTO order_desk(merchant,seen_ts) VALUES(?,?)').run(m,Date.now());
 sql.prepare('INSERT INTO menus(merchant,name,type,data,updated_ts) VALUES(?,?,?,?,?)').run(m,'Menu','restaurant',JSON.stringify({cats:[{id:'c',name:'Food'}],items:[{id:'dish',catId:'c',name:'Dish',price:10,avail:true}]}),Date.now());
}
async function request(handler,body={},staff=false,get=false){const url=new URL('https://kiwi.test/api/test');if(get)for(const[k,v]of Object.entries({merchant,...body}))url.searchParams.set(k,v);const pending=[];const r=await handler({env:f.env,request:new Request(url,{method:get?'GET':'POST',headers:{Cookie:staff?cookie:'','Content-Type':'application/json'},...(get?{}:{body:JSON.stringify({merchant,...body})})}),waitUntil:p=>pending.push(p)});await Promise.all(pending);return{status:r.status,body:await r.json()};}
function ok(r){assert.equal(r.status,200,JSON.stringify(r));return r.body;}
async function reset(){await f.reset();for(const t of ['orders','order_course','table_sessions','kitchen_voids'])sql.exec('DELETE FROM '+t);sql.prepare('UPDATE order_desk SET seen_ts=?').run(Date.now());}
async function visit(table='1',m=merchant){return ok(await request(seat,{table,merchant:m})).session;}
const submit=(session,ref='phone-ref-0001',extra={})=>request(order,{table:'1',session,ref,lines:[{id:'dish',qty:1}],...extra});
const qty=fc.integer({min:1,max:5});
try{
await strict('sequential and concurrent retries create one durable order',fc.asyncProperty(qty,fc.boolean(),async(q,concurrent)=>{await reset();const s=await visit(),send=()=>submit(s,'same-client-reference',{lines:[{id:'dish',qty:q}]});const rs=concurrent?await Promise.all([send(),send()]):[await send(),await send()];rs.forEach(ok);assert.equal(rs[0].body.id,rs[1].body.id);assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,1);assert.equal(sql.prepare('SELECT session_id FROM orders').get().session_id,s);}));
await strict('visit cannot order at another table, mode, merchant or closed visit',fc.asyncProperty(fc.constantFrom('table','mode','merchant','closed'),async(kind)=>{await reset();const s=await visit();const extra=kind==='table'?{table:'2'}:kind==='mode'?{mode:'takeout'}:kind==='merchant'?{merchant:other}:{};if(kind==='closed')ok(await request(queue,{closeSession:s,closedBy:'caisse'},true));assert.equal((await submit(s,'ownership-ref',extra)).status,409);assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);}));
await strict('settlement revokes phone and reseating creates a fresh visit',fc.asyncProperty(qty,async(q)=>{await reset();const s=await visit();const o=ok(await submit(s,'settlement-ref',{lines:[{id:'dish',qty:q}]}));ok(await request(queue,{id:o.id,status:'accepted'},true));ok(await request(queue,{closeSession:s,closedBy:'settle'},true));assert.equal((await submit(s,'after-settle-ref')).status,409);assert.notEqual(await visit(),s);assert.equal(ok(await request(sessionGet,{session:s},false,true)).status,'closed');}));
await strict('rejected orders stay outside visit coverage and never receive paid_ts',fc.asyncProperty(qty,async(q)=>{await reset();const s=await visit(),a=ok(await submit(s,'accepted-ref')),b=ok(await submit(s,'rejected-ref',{lines:[{id:'dish',qty:q}]}));ok(await request(queue,{id:a.id,status:'accepted'},true));ok(await request(queue,{id:b.id,status:'rejected'},true));f.insert('visit-receipt',1000);sql.prepare('UPDATE sales SET session_id=?').run(s);assert.equal(await settleCoveredOrders(f.env,merchant,s,Date.now()),null);ok(await request(queue,{closeSession:s,closedBy:'settle'},true));const rows=sql.prepare('SELECT id,paid_ts FROM orders').all();assert.ok(rows.find(r=>r.id===a.id).paid_ts);assert.equal(rows.find(r=>r.id===b.id).paid_ts,null);assert.equal(sql.prepare("SELECT SUM(total) total FROM orders WHERE session_id=? AND status<>'rejected'").get(s).total,10);}));
await strict('partial visit receipts cover oldest non-rejected courses only',fc.asyncProperty(qty,qty,async(a,b)=>{
 await reset();const s=await visit();
 const first=ok(await submit(s,'oldest-course',{lines:[{id:'dish',qty:a}]}));
 const rejected=ok(await submit(s,'declined-course'));
 ok(await request(queue,{id:rejected.id,status:'rejected'},true));
 const last=ok(await submit(s,'latest-course',{lines:[{id:'dish',qty:b}]}));
 // Equal timestamps exercise the rowid tie-break in _visit-cover.js.
 sql.prepare('UPDATE orders SET created_ts=1').run();
 f.insert('partial-visit-receipt',a*1000);sql.prepare('UPDATE sales SET session_id=?').run(s);
 const covered=await settleCoveredOrders(f.env,merchant,s,Date.now());
 assert.equal(covered.remainingCents,b*1000);assert.deepEqual(covered.settledOrders,[first.id]);
 for(const id of [rejected.id,last.id])assert.equal(sql.prepare('SELECT paid_ts FROM orders WHERE id=?').get(id).paid_ts,null);
}));
await strict('concurrent submissions have unique numbers and preserve prior courses',fc.asyncProperty(fc.integer({min:2,max:6}),async(n)=>{await reset();const s=await visit();const first=ok(await submit(s,'first-course'));const rs=await Promise.all(Array.from({length:n},(_,i)=>submit(s,'parallel-course-'+i)));rs.forEach(ok);const rows=sql.prepare('SELECT id,number,session_id FROM orders ORDER BY rowid').all();assert.equal(rows.length,n+1);assert.equal(rows[0].id,first.id);assert.equal(new Set(rows.map(r=>r.number)).size,n+1);assert.ok(rows.every(r=>r.session_id===s));assert.deepEqual(rows.map(r=>r.number),rows.map(r=>r.number).sort((a,b)=>a-b));}));
await strict('reset and expired empty visits cannot be revived after reseating',fc.asyncProperty(fc.constantFrom('caisse','prune-stale','expiry'),async(why)=>{await reset();const s=await visit();if(why==='expiry')sql.prepare('UPDATE table_sessions SET opened_ts=?,seen_ts=? WHERE id=?').run(Date.now()-7*3600000,Date.now()-7*3600000,s);else ok(await request(queue,{closeTable:'1',expectedSession:s,closedBy:why},true));const next=await visit();assert.notEqual(next,s);assert.equal((await submit(s,'old-phone-ref')).status,409);ok(await submit(next,'new-phone-ref'));}));
await strict('two merchants isolate refs, sessions, status reads and staff writes',fc.asyncProperty(qty,async(q)=>{await reset();const a=await visit(),b=await visit('1',other);const x=ok(await submit(a,'shared-ref',{lines:[{id:'dish',qty:q}]})),y=ok(await submit(b,'shared-ref',{merchant:other}));assert.notEqual(x.id,y.id);assert.equal((await request(orderGet,{id:x.id,merchant:other},false,true)).status,404);assert.equal(ok(await request(sessionGet,{session:a,merchant:other},false,true)).status,'closed');assert.equal((await request(queue,{id:x.id,status:'rejected',merchant:other},true)).status,404);ok(await request(queue,{closeSession:a,merchant:other,closedBy:'settle'},true));assert.equal(sql.prepare('SELECT status FROM table_sessions WHERE id=?').get(a).status,'open');assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders WHERE merchant=?').get(other).n,1);}));
}finally{f.close();}
console.log(`${passed} OrderPro properties passed; ${failed} failed; seed=${SEED}; runs=${RUNS}`);process.exitCode=failed?1:0;
