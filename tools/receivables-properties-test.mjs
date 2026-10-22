#!/usr/bin/env node
// Real Pages handlers, local SQLite/D1 atomic batches, no network or browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fixture} from './server-money-fixture.mjs';
import {onRequestPost as cancel} from '../functions/api/sale/cancel.js';
import {makeSession,SESS_COOKIE,tillToken,TILL_COOKIE} from '../functions/auth/_lib.js';
import {businessDate} from '../functions/api/_business-day.js';
const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ skip fast-check unavailable');process.exit(0);}
const RUNS=+process.env.KIWI_PROPERTY_RUNS||100,SEED=+process.env.KIWI_PROPERTY_SEED||20261022;
let passed=0,failed=0,known=0;
async function check(label,p,examples=[],isKnown=false){if(process.env.KIWI_PROPERTY_ONLY&&!label.includes(process.env.KIWI_PROPERTY_ONLY))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(r.failed){if(isKnown&&r.errorInstance?.message==='Property failed by returning false'){known++;console.log('◦ known '+label,fc.stringify(r.counterexample));}else{failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance||r.error);}}else if(isKnown){failed++;console.error('! known holds now, promote to strict: '+label);}else{passed++;console.log('✓ '+label);}}
const strict=(l,p,e=[])=>check(l,p,e),knownIssue=(l,p,e=[])=>check(l,p,e,true);
const f=await fixture(ROOT),{sql}=f,positive=fc.integer({min:1,max:500000}),nat=fc.nat(),sum=a=>a.reduce((s,n)=>s+n,0),C=n=>Math.round(n*100);
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));
const scalar=q=>Number(Object.values(sql.prepare(q).get())[0]);
const now=Date.now;
async function delivery(total,deposit=0,id='delivery-original'){
 const parts=[...(deposit?[{method:'cash',amountCents:deposit}]:[]),{method:'delivery',amountCents:total-deposit}];
 ok(await f.call('sale',{id,ref:id,ts:Date.now(),amountCents:deposit,method:deposit?'split':'delivery',...(deposit?{}:{settlementKind:'receivable'}),ticketAmountCents:total,paymentParts:parts,lines:[{name:'Article',qty:3,total:total/100,itemId:'product-fixture'}]}));
 assert.equal(sql.prepare('SELECT gross_ticket_cents FROM sale_receipts WHERE sale_id=?').get(id).gross_ticket_cents,total);
}
const collect=(id,cents,role='till',saleId='delivery-original',extra={})=>f.call('collect',{id,saleId,method:role==='till'?'cash':'transfer',amountCents:cents,...extra},role);
async function voidSale(id){const cookie=`${SESS_COOKIE}=${await makeSession('money-owner',f.env.AUTH_SECRET)}`;const r=await cancel({env:f.env,request:new Request('https://kiwi.test/api/sale/cancel',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({merchant:f.merchant,id,source:'dashboard'})})});return{status:r.status,body:await r.json()};}
// The actual day-report reducer consumes normalized feed amounts.
const ctx=vm.createContext({window:{addEventListener(){},KiwiConfig:{timezone:'Africa/Casablanca'}},localStorage:{getItem(){return null;},setItem(){}},Date,Intl,console});
for(const file of ['kit/haptics.js','day-report.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'assets',file),'utf8'),ctx);
const D=ctx.window.KiwiDayReport;
async function feed(){const r=await f.call('feed',{since:0,limit:1000},'owner');ok(r);return r.body.sales;}
// Dashboard item books consume monetary feed entries; the unpaid original is
// retained by the server for receivables/return history, outside that item book.
const reports=rows=>[...new Set(rows.map(r=>businessDate(r.ts)))].map(day=>D.build({day,store:{slug:f.merchant,type:'boutique'},sales:rows.filter(r=>r.amountCents>0)}));
const reportQuantity=rows=>sum(reports(rows).flatMap(r=>r.categories).map(c=>c.qty));
const quantity=rows=>sum(rows.filter(r=>r.amountCents>0).flatMap(r=>r.lines||[]).map(l=>l.qty??l.q??0));
try{
 await strict('sequences conserve received + due = ticket, feed revenue and one basket across deposit and collection days',fc.asyncProperty(positive,nat,fc.array(positive,{minLength:1,maxLength:8}),async(total,n,asks)=>{
  await f.reset();const deposit=n%total;Date.now=()=>Date.parse('2026-10-20T12:00Z');await delivery(total,deposit);let received=deposit;
  for(const[i,ask]of [...asks,total].entries()){
   const remaining=total-received;if(!remaining)break;const cents=Math.min(remaining,ask);Date.now=()=>Date.parse('2026-10-21T12:00Z')+i*86400000;
   const r=await collect('sequence-'+i,cents);ok(r);received+=cents;assert.equal(r.body.dueCents,total-received);
   const listing=await f.call('receivables',{},'owner');ok(listing);const row=[...listing.body.open,...listing.body.collected][0];assert.equal(row.dueCents,total-received);assert.equal(sum(row.collections.map(c=>c.amountCents)),received-deposit);
   ok(await collect('sequence-'+i,cents));assert.equal(f.net(),received);
  }
  const rows=await feed();assert.equal(sum(rows.map(r=>r.amountCents)),total);assert.equal(quantity(rows),3);assert.equal(reportQuantity(rows),3);
  const days=[...new Set(rows.map(r=>businessDate(r.ts)))];assert.equal(sum(days.map(day=>C(D.build({day,store:{slug:f.merchant,type:'boutique'},sales:rows}).net))),total);
 }),[[50,0,[1,2,3]],[1001,501,[10,40]]]);
 await strict('RC-1 concurrent first partial collections carry the basket exactly once',fc.asyncProperty(fc.integer({min:2,max:500000}),nat,async(total,n)=>{
  await f.reset();await delivery(total);const first=1+n%(total-1);const rs=await f.race(()=>Promise.all([collect('basket-one',first),collect('basket-two',total-first)]));rs.forEach(ok);assert.equal(f.net(),total);const rows=await feed();assert.equal(quantity(rows),3);assert.equal(reportQuantity(rows),3);
 }),[[2,0]]);
 await strict('two tills plus dashboard racing for the last centimes cannot exceed capacity; retries and cross-sale ids stay unique',fc.asyncProperty(positive,async(total)=>{
  await f.reset();await delivery(total);const rs=await f.race(()=>Promise.all([collect('race-till-one',total),collect('race-till-two',total),collect('race-dashboard',total,'owner')]));assert.equal(rs.filter(r=>r.status===200).length,1);assert.ok(rs.every(r=>[200,409].includes(r.status)));
  const winner=rs.find(r=>r.status===200).body.sale;ok(await collect(winner.id,total,winner.method==='cash'?'till':'owner'));assert.equal(f.net(),total);assert.equal(scalar('SELECT COUNT(*) FROM delivery_collections'),1);
  await delivery(total,0,'delivery-second');assert.equal((await collect(winner.id,total,'till','delivery-second')).status,409);assert.equal(scalar('SELECT COUNT(*) FROM delivery_collections'),1);
 }));
 await strict('same collection id racing and replayed after a lost response writes one sale',fc.asyncProperty(positive,async(total)=>{
  await f.reset();await delivery(total);const rs=await f.race(()=>Promise.all([collect('same-receipt',total),collect('same-receipt',total)]));assert.ok(rs.some(r=>r.status===200));assert.ok(rs.every(r=>[200,409].includes(r.status)));ok(await collect('same-receipt',total));assert.equal(scalar('SELECT COUNT(*) FROM delivery_collections'),1);assert.equal(scalar("SELECT COUNT(*) FROM sales WHERE id='same-receipt'"),1);assert.equal(f.net(),total);
 }));
 await strict('cash requires this merchant till; owner/operator use bank tenders; identity persists without extra credential fields',fc.asyncProperty(positive,async(total)=>{
  await f.reset();await delivery(total);
  for(const role of ['owner','operator'])assert.equal((await collect('deny-'+role,1,role,'delivery-original',{method:'cash'})).status,400);
  for(const[role,method]of [['owner','transfer'],['operator','cheque'],['till','cash']]){await f.reset();await delivery(total);ok(await collect('auth-'+role,total,role,'delivery-original',{method,collectedBy:{id:'staff-fixture',name:'Fixture Cashier',pinCode:'synthetic-secret',code:'synthetic-secret'}}));const row=sql.prepare('SELECT * FROM delivery_collections').get();assert.equal(row.collected_by_id,'staff-fixture');assert.ok(!JSON.stringify(row).includes('synthetic-secret'));assert.ok(!JSON.stringify((await f.call('receivables',{},role)).body).includes('synthetic-secret'));}
 }));
 await strict('unrelated merchant owner and till cannot read or collect this tenant',fc.asyncProperty(positive,async(total)=>{
  await f.reset();await delivery(total);sql.prepare("INSERT OR IGNORE INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('alien-owner','alien@example.test','Fixture','s','h',1,'active')").run();
  for(const cookie of [`${SESS_COOKIE}=${await makeSession('alien-owner',f.env.AUTH_SECRET)}`,`${TILL_COOKIE}=${await tillToken(f.env.AUTH_SECRET,'server-other-shop')}`]){
   for(const method of ['GET','POST']){const request=new Request('https://kiwi.test/api/receivables?merchant='+f.merchant,{method,headers:{cookie,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({merchant:f.merchant,saleId:'delivery-original',id:'alien-receipt',method:'cash',amountCents:total})}:{})});const route=await import('../functions/api/receivables.js');const response=await route[method==='GET'?'onRequestGet':'onRequestPost']({request,env:f.env});if(method==='POST')assert.equal(response.status,403);else{const body=await response.json();assert.ok(response.status===403||((body.open||[]).length===0&&(body.collected||[]).length===0));}}
  }assert.equal(f.net(),0);
 }));
 await strict('voided original refuses collection and disappears from receivables',fc.asyncProperty(positive,async(total)=>{await f.reset();await delivery(total);ok(await voidSale('delivery-original'));assert.equal((await collect('after-void',total)).status,404);const r=await f.call('receivables',{},'owner');assert.equal(r.body.open.length+r.body.collected.length,0);assert.equal(f.net(),0);}));
 await strict('RC-2 cancellation between collection preflight and atomic write cannot book money',fc.asyncProperty(positive,async(total)=>{
  await f.reset();await delivery(total);const batch=f.DB.batch;let intercepted=false;
  f.DB.batch=async statements=>{if(!intercepted&&statements.some(s=>/INSERT INTO delivery_collections/.test(s.query))){intercepted=true;ok(await voidSale('delivery-original'));}return batch(statements);};
  let r;try{r=await collect('void-race-receipt',total);}finally{f.DB.batch=batch;}
  assert.ok(intercepted);assert.ok([404,409].includes(r.status),JSON.stringify(r));assert.equal(f.net(),0);assert.equal(scalar('SELECT COUNT(*) FROM delivery_collections'),0);
 }),[[50]]);
 await strict('collection refunds are capped by collected money and do not automatically reopen courier debt',fc.asyncProperty(positive,async(total)=>{await f.reset();await delivery(total);ok(await collect('refund-collection',total));ok(await f.refund('refund-receipt','refund-collection',total));assert.equal(f.net(),0);assert.equal((await f.call('receivables',{},'owner')).body.collected[0].dueCents,0);assert.equal((await f.refund('refund-excess','refund-collection',1)).status,409);}));
 await knownIssue('policy: cancelling a collected original leaves collections booked; choose linked reversal or refuse cancellation',fc.asyncProperty(positive,async(total)=>{await f.reset();await delivery(total);ok(await collect('before-cancel',total));ok(await voidSale('delivery-original'));return f.net()===0;}),[[50]]);
 await knownIssue('policy: refunding original deposit leaves unpaid delivery collectible; define debt reduction on returns',fc.asyncProperty(positive,positive,async(deposit,owed)=>{await f.reset();await delivery(deposit+owed,deposit);ok(await f.refund('deposit-refund','delivery-original',deposit));const r=await collect('after-refund',owed);return r.status===409;}),[[50,50]]);
 await strict('collection receiving timestamp follows Morocco UTC+0 and the 05:00 boundary, never the delivery day',fc.asyncProperty(positive,fc.constantFrom('2026-10-22T04:59:59.999Z','2026-10-22T05:00:00.000Z'),async(total,instant)=>{
  await f.reset();Date.now=()=>Date.parse('2026-10-19T12:00Z');await delivery(total);const ts=Date.parse(instant);Date.now=()=>ts;ok(await collect('dated-receipt',total));const rows=await feed(),r=rows.find(r=>r.id==='dated-receipt'),day=instant.includes('04:59')?'2026-10-21':'2026-10-22';assert.equal(r.ts,ts);assert.equal(businessDate(ts),day);assert.equal(D.businessDay(ts),day);assert.equal(C(D.build({day,store:{slug:f.merchant,type:'boutique'},sales:rows}).net),total);
 }));
 await strict('subdirham collections preserve cents through feed and day report; whole-dirham storage is compatibility only',fc.asyncProperty(fc.integer({min:1,max:99}),async(cents)=>{await f.reset();await delivery(cents);ok(await collect('centime-receipt',cents));const stored=f.row('centime-receipt');assert.equal(stored.amount,Math.round(cents/100));assert.equal(stored.amount_cents,cents);const rows=await feed();assert.equal(C(rows.find(r=>r.id==='centime-receipt').amount),cents);assert.equal(C(D.build({day:businessDate(Date.now()),store:{slug:f.merchant,type:'boutique'},sales:rows}).net),cents);}),[[50]]);
}finally{Date.now=now;f.close();}
console.log(`receivables-properties: ${passed} strict passed, ${failed} failed, ${known} known; runs=${RUNS}; seed=${SEED}`);if(failed)process.exitCode=1;
