#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie, employeeToken, employeeCookie } from '../functions/auth/_lib.js';
import { onRequestPost as seat, onRequestGet as sessionGet } from '../functions/api/order/session.js';
import { onRequestPost as order } from '../functions/api/order/index.js';
import { onRequestPost as queue, onRequestGet as queueGet } from '../functions/api/order/queue.js';
import { onRequestPost as eventsPost, onRequestGet as eventsGet } from '../functions/api/service/events.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
let beforeWrite = null, beforeBatch = null;
const DB = { prepare(sql) {
  let args = [];
  const hook = () => { if (beforeWrite) { const fn = beforeWrite; fn(sql); } };
  return { bind(...values) { args = values; return this; },
    async first() { hook(); return db.prepare(sql).get(...args) || null; },
    async all() { hook(); return { results: db.prepare(sql).all(...args) }; },
    async run() { hook(); return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
  };
}, async batch(statements) {
  if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; hook(); }
  db.exec('BEGIN IMMEDIATE');
  try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
} };
const env = { DB, AUTH_SECRET: 'shared-table-test-secret' }, merchant = 'cashier-only-test', now = Date.now();
db.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)')
  .run('owner','owner@test.invalid','Owner','Test','s','h',now);
db.prepare('INSERT INTO merchant_config(merchant,features,type,account_id,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant,'{"orderpro":true}','restaurant','owner',now);
db.prepare('INSERT INTO order_desk(merchant,seen_ts) VALUES(?,?)').run(merchant,now);
db.prepare('INSERT INTO menus(merchant,name,type,data,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant,'Menu','restaurant',JSON.stringify({cats:[{id:'c',name:'Food'}],items:[{id:'dish',name:'Pasta',catId:'c',price:50,avail:true}]}),now);
function doc(feature,data) {
  db.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,?) ON CONFLICT(merchant,feature) DO UPDATE SET data=excluded.data,rev=store_docs.rev+1')
    .run(merchant,feature,JSON.stringify(data),Date.now());
}
doc('floorplan',{ tables:Array.from({length:12},(_,i)=>({id:'T'+(i+1),num:String(i+1)})) });
const owner = sessionCookie(await makeSession('owner',env.AUTH_SECRET)).split(';')[0];
async function post(fn,body,cookie='') {
  const response = await fn({env, request:new Request('https://kiwi.test/api/test',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({merchant,...body})})});
  return {status:response.status,...await response.json()};
}
async function get(fn,qs,cookie='') {
  const response = await fn({env,request:new Request('https://kiwi.test/api/test?merchant='+merchant+'&'+qs,{headers:{Cookie:cookie}})});
  return {http:response.status,...await response.json()};
}
const success = (value,label) => { assert.equal(value,true,label); console.log('✓ '+label); };
const phones = await Promise.all([1,2,3].map(()=>post(seat,{mode:'table',table:'1'})));
success(phones.every(p=>p.ok&&p.session===phones[0].session),'Three simultaneous phones share one table visit');
const session=phones[0].session;
const orders = await Promise.all([1,2,3].map(i=>post(order,{mode:'table',table:'1',session,ref:'phone-'+i,lines:[{id:'dish',qty:i}]})));
success(orders.every(o=>o.ok)&&new Set(orders.map(o=>o.id)).size===3,'Independent baskets become three distinct orders');
const retry=await post(order,{mode:'table',table:'1',session,ref:'phone-2',lines:[{id:'dish',qty:2}]});
success(retry.id===orders[1].id&&retry.replayed,'Network retry does not duplicate an order');
const total=db.prepare('SELECT SUM(total) AS n FROM orders WHERE session_id=?').get(session).n;
success(total===300,'Canonical table total includes all three phones exactly once');
db.prepare('UPDATE table_sessions SET opened_ts=?,seen_ts=? WHERE id=?').run(now-7*3600000,now-3600000,session);
success((await post(seat,{mode:'table',table:'1'})).session===session,'Late phone joins the unpaid visit even after a long meal');
success((await get(sessionGet,'session='+session)).status==='open','Existing phones retain the same unpaid visit');
const [call,bill]=await Promise.all(['call-server','ask-bill'].map(action=>post(seat,{session,action})));
success(call.ok&&bill.ok,'Cashier-only venue accepts both types of guest request');
let feed=await get(eventsGet,'role=caisse',owner);
success(feed.requests.length===2,'Caisse receives BOTH requests without any waiter configured');
success((await post(seat,{session,action:'ask-bill'})).replayed===true,'Repeated taps coalesce while a request is pending');
success((await get(eventsGet,'role=caisse')).http===403,'Guest cannot read the staff inbox');
const stored=JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='service-events'").get(merchant).data);
doc('service-events',{...stored,events:[]});
success((await get(eventsGet,'role=caisse&since='+Date.now(),owner)).requests.length===2,'Unresolved requests survive event rollover and reconnect cursor');
doc('team',{members:[{id:'waiter',firstName:'Waiter',lastName:'Test',function:'Serveur',department:'Salle',pinCode:'1111'}]});
doc('attendance',{entries:[{id:'a',staffId:'waiter',memberId:'waiter',inTs:now-1000,outTs:0}]});
const waiter=employeeCookie(await employeeToken(env.AUTH_SECRET,{merchant,staffId:'waiter'})).split(';')[0];
success((await get(eventsGet,'',waiter)).requests.length===2,'On-shift waiter receives the same request IDs');
const cashierDone=await post(eventsPost,{ackRequest:bill.event.id},owner);
success(cashierDone.ok&&(await get(eventsGet,'',waiter)).requests.length===1,'Caisse acknowledgement clears the request for waiters');
success((await post(eventsPost,{ackRequest:call.event.id},waiter)).ok&&(await get(eventsGet,'role=caisse',owner)).requests.length===0,'Waiter acknowledgement clears it for the caisse');
success((await post(eventsPost,{ackRequest:bill.event.id},owner)).replayed===true,'Acknowledgement retry is idempotent');
await post(seat,{session,action:'call-server'});
// A payment wins after order validation, immediately before INSERT.
beforeWrite=sql=>{if(sql.includes('INSERT INTO orders')){beforeWrite=null;db.prepare("UPDATE table_sessions SET status='closed',closed_by='settle' WHERE id=?").run(session);}};
const late=await post(order,{mode:'table',table:'1',session,ref:'late-order',lines:[{id:'dish',qty:1}]});
success(late.status===409&&!db.prepare("SELECT id FROM orders WHERE client_ref='late-order'").get(),'Settlement racing with submission prevents a ghost order');
success((await get(eventsGet,'role=caisse',owner)).requests.length===0,'Settled visit cannot leave alerts on a reused table');
success((await get(sessionGet,'session='+session)).status==='closed','Every phone sees the visit closed');
success((await post(seat,{session,action:'call-server'})).status===409,'Closed phone cannot request service');

async function pendingAt(table,ref) {
  const s=await post(seat,{mode:'table',table});
  const o=await post(order,{mode:'table',table,session:s.session,ref,lines:[{id:'dish',qty:1}]});
  assert.ok(o.ok); return {s,o};
}
const move=await pendingAt('2','movable');
success((await post(queue,{transferTable:{from:'2',to:'3',operationId:'before-send'}},owner)).ok,'Pending, unsubmitted order can move');
db.prepare("UPDATE orders SET status='accepted' WHERE id=?").run(move.o.id);
const blocked=await post(queue,{transferTable:{from:'3',to:'4',operationId:'after-send'}},owner);
success(blocked.status===409&&blocked.error==='table-kitchen-locked','Accepted order cannot move even before printer acknowledgement');
await pendingAt('4','merge-pending');
success((await post(queue,{mergeTables:{source:'4',target:'3',operationId:'merge-blocked'}},owner)).error==='table-kitchen-locked','Merge cannot bypass the lock on its destination');
db.prepare("UPDATE orders SET status='served',paid_ts=? WHERE id=?").run(now,move.o.id);
success((await post(queue,{transferTable:{from:'3',to:'5',operationId:'paid-lock'}},owner)).error==='table-kitchen-locked','Paying one submitted order does not unlock the still-open visit');
const race=await pendingAt('6','race-kitchen');
beforeBatch=()=>db.prepare("UPDATE orders SET status='accepted' WHERE id=?").run(race.o.id);
success((await post(queue,{transferTable:{from:'6',to:'7',operationId:'race-send'}},owner)).error==='table-kitchen-locked','Kitchen submission racing with transfer is rejected inside the transaction');
success(!db.prepare("SELECT id FROM table_transfers WHERE id='race-send'").get()&&db.prepare('SELECT table_no FROM orders WHERE id=?').get(race.o.id).table_no==='6','Rejected race leaves neither moved orders nor an audit claim');
db.prepare('INSERT INTO order_course(merchant,order_id,sent_ts,created_ts,updated_ts) VALUES(?,?,?,?,?)').run(merchant,race.o.id,now,now,now);
db.prepare("UPDATE orders SET status='rejected' WHERE id=?").run(race.o.id);
success((await post(queue,{transferTable:{from:'6',to:'7',operationId:'cancelled-lock'}},owner)).error==='table-kitchen-locked','Cancelling after kitchen submission does not unlock the visit');
const a=await pendingAt('8','merge-a'),b=await pendingAt('9','merge-b');
success((await post(queue,{mergeTables:{source:'8',target:'9',operationId:'merge-before-send'}},owner)).ok,'Two pending visits still merge before kitchen submission');
const fresh=await get(queueGet,'',owner);
success(fresh.ok,'Staff order queue still works after the new safeguards');
const mergeRace=await pendingAt('10','merge-race');
beforeBatch=()=>db.prepare("UPDATE orders SET status='accepted' WHERE id=?").run(mergeRace.o.id);
const mergeLost=await post(queue,{mergeTables:{source:'10',target:'11',operationId:'race-merge-empty'}},owner);
success(mergeLost.error==='table-kitchen-locked'
  && !db.prepare("SELECT id FROM table_sessions WHERE merchant=? AND table_no='11' AND status='open'").get(merchant),
  'Failed merge race does not create an empty destination visit');
const staffSeat=await post(seat,{mode:'table',table:'12'});
beforeWrite=sql=>{if(sql.includes('INSERT INTO orders')){beforeWrite=null;db.prepare("UPDATE table_sessions SET status='closed',closed_by='settle' WHERE id=?").run(staffSeat.session);}};
const staffLate=await post(queue,{create:true,mode:'table',table:'12',expectedSession:staffSeat.session,ref:'staff-late',lines:[{id:'dish',qty:1}]},owner);
success(staffLate.status===409&&!db.prepare("SELECT id FROM orders WHERE client_ref='staff-late'").get(),
  'Staff submission also validates its visit at the INSERT boundary');
const durableCall=await post(seat,{session:b.s.session,action:'call-server'});
assert.ok(durableCall.ok);
beforeWrite=sql=>{if(sql.includes('SELECT data, rev FROM store_docs')){beforeWrite=null;throw new Error('simulated read failure');}};
success((await get(eventsGet,'role=caisse',owner)).http===503,'Read failure is not reported as an empty request inbox');
beforeWrite=sql=>{if(sql.includes('SELECT data, rev FROM store_docs')){beforeWrite=null;throw new Error('simulated read failure');}};
success((await post(eventsPost,{ackRequest:durableCall.event.id},owner)).status===503,'Failed read cannot falsely acknowledge a request');
success((await get(eventsGet,'role=caisse',owner)).requests.some(r=>r.id===durableCall.event.id),'Request survives acknowledgement storage failure');
console.log('\nShared-table and service-request integration tests passed.');
