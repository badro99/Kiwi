#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHotelRequestHarness, MERCHANT} from './fixtures/hotel-request-db.mjs';
import {allocateTransferAllocation} from '../functions/api/inventory/internal-requests.js';
const fc=createRequire(new URL('../app/package.json',import.meta.url))('fast-check');
const RUNS=+process.env.KIWI_PROPERTY_RUNS||100, SEED=+process.env.KIWI_PROPERTY_SEED||20261022;
let passed=0,failed=0,known=0;
async function strict(name,p,examples=[]){if(process.env.KIWI_PROPERTY_ONLY&&!new RegExp(process.env.KIWI_PROPERTY_ONLY).test(name))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(r.failed){failed++;console.error('FAIL '+name,fc.stringify(r.counterexample),r.errorInstance);}else{passed++;console.log('PASS '+name);}}
async function knownIssue(name,p,examples=[]){if(process.env.KIWI_PROPERTY_ONLY)return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(!r.failed||r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('FAIL promote or investigate '+name);}else{known++;console.log('KNOWN '+name+' '+fc.stringify(r.counterexample));}}
const qty=fc.integer({min:1,max:12});
async function using(fn){const h=await createHotelRequestHarness();try{await fn(h);}finally{h.raw.close();}}
const post=async(h,b,c)=>{const r=await h.post({merchant:MERCHANT,...b},c);return {status:r.status,...await r.json()};};
await strict('replay requires authorization for the stored unit',fc.asyncProperty(qty,fc.constantFrom('create','submit'),async(q,action)=>using(async h=>{
 await h.createSubmitted('private','cola',q);
 assert.equal((await post(h,{action,id:'private',idempotencyKey:action+':private'},'')).status,403);
 // A valid employee assigned to another department must not read a replay either.
 for(const feature of ['team','employee-access']){const d=JSON.parse(h.one('SELECT data FROM store_docs WHERE merchant=? AND feature=?',MERCHANT,feature).data);d.members.push({id:'other',firstName:'Other',role:'Manager',unitId:'laundry'});h.raw.prepare('UPDATE store_docs SET data=? WHERE merchant=? AND feature=?').run(JSON.stringify(d),MERCHANT,feature);}
 assert.equal((await post(h,{action,id:'private',idempotencyKey:action+':private'},await h.employeeCookie('other'))).status,403);
})),[[1,'create']]);
await strict('inactive departments reject new requests and another hotel cannot read requests',fc.asyncProperty(qty,async q=>using(async h=>{
 await h.createSubmitted('scoped','cola',q);
 const denied=await post(h,{merchant:'other-hotel',action:'submit',id:'scoped',revision:2,idempotencyKey:'other'});assert.equal(denied.status,404);
 const registry=JSON.parse(h.one("SELECT data FROM store_docs WHERE feature='hotel-units'").data);registry.units.find(u=>u.id==='rooftop').active=false;
 h.raw.prepare("UPDATE store_docs SET data=? WHERE feature='hotel-units'").run(JSON.stringify(registry));
 assert.equal((await post(h,{action:'create',id:'inactive',unitId:'rooftop',idempotencyKey:'inactive',lines:[{itemId:'cola',unit:'bouteille',qtyRequested:q}]})).status,409);
})));
await strict('review aggregates shared substitute stock before reserving',fc.asyncProperty(fc.integer({min:7,max:12}),async q=>using(async h=>{
 const created=await post(h,{action:'create',id:'shared',unitId:'rooftop',idempotencyKey:'c',lines:['cola','whisky'].map(itemId=>({itemId,unit:'bouteille',qtyRequested:q}))});assert.equal(created.status,200);
 assert.equal((await post(h,{action:'submit',id:'shared',revision:1,idempotencyKey:'s'})).status,200);
 const r=await post(h,{action:'review',id:'shared',revision:2,idempotencyKey:'r',data:{lines:[{itemId:'whisky',qtyApproved:q,resolution:'approved'},{itemId:'cola',qtyApproved:q,resolution:'substituted',substituteFor:'whisky',substituteUnit:'bouteille',substituteReason:'Unavailable'}]}});
 assert.equal(r.status,409);assert.equal(h.one('SELECT COUNT(*) n FROM inventory_request_reservations').n,0);
})),[[7]]);
await strict('random cumulative handovers conserve stock, reservations, frozen cost and provenance through retries and cancellation',fc.asyncProperty(qty,fc.boolean(),fc.array(fc.record({kind:fc.constantFrom('prepare','confirm','cancel','review','accept','stale'),q:qty,device:fc.boolean()}),{minLength:1,maxLength:25}),async(q,sub,steps)=>using(async h=>{
 await h.createSubmitted('sequence','cola',q);
 let serial=0; const cookies=[await h.employeeCookie('econ-a'),await h.employeeCookie('econ-b')];
 let state=await post(h,{action:'review',id:'sequence',revision:2,idempotencyKey:'initial',data:{lines:[sub?{itemId:'cola',qtyApproved:q,resolution:'substituted',substituteFor:'whisky',substituteUnit:'bouteille',substituteReason:'Alternative'}:{itemId:'cola',qtyApproved:q,resolution:'approved'}]}});assert.equal(state.status,200);
 if(sub)state=await post(h,{action:'accept',id:'sequence',revision:state.request.revision,idempotencyKey:'accept'});
 const item=sub?'whisky':'cola',initial=sub?12:24;
 for(const step of [{kind:'prepare',q:Math.min(1,q),device:false},{kind:'confirm',q:Math.min(1,q),device:false},...steps,{kind:'prepare',q,device:false},{kind:'confirm',q,device:false},{kind:'cancel',q,device:false}]){
  const before=state, action=step.kind==='stale'?'prepare':step.kind;
  const data={lines:[action==='review'?(sub?{itemId:'cola',qtyApproved:step.q,resolution:'substituted',substituteFor:'whisky',substituteUnit:'bouteille',substituteReason:'Alternative'}:{itemId:'cola',qtyApproved:Math.min(step.q,q),resolution:step.q<q?'reduced':'approved'}):{itemId:'cola',[action==='confirm'?'qtyReceived':'qtyPrepared']:step.q}]};
  const b={action,id:'sequence',revision:state.request.revision-(step.kind==='stale'?1:0),idempotencyKey:'step:'+serial++,data};
  const r=await post(h,b,action==='prepare'||action==='review'?cookies[+step.device]:undefined);
  if(r.status===200){state=r;const count=h.one('SELECT COUNT(*) n FROM inventory_movements').n;assert.equal((await post(h,b)).status,200);assert.equal(h.one('SELECT COUNT(*) n FROM inventory_movements').n,count);}else{assert.ok([409,422].includes(r.status));assert.equal((await (await h.get('sequence')).json()).request.revision,before.request.revision);}
  const line=state.lines[0];assert.ok(line.qtyReceived<=line.qtyPrepared&&line.qtyPrepared<=line.qtyApproved);
  assert.equal(h.balance(item,'u-economat'),initial-line.qtyReceived);assert.equal(h.balance(item,'u-bar-rooftop'),line.qtyReceived);
  const reserved=h.one('SELECT COALESCE(SUM(qty_milli),0) n FROM inventory_request_reservations').n;
  assert.equal(reserved,state.request.cancelled?0:Math.round((line.qtyApproved-line.qtyReceived)*1000));
  const rows=h.rows("SELECT * FROM inventory_movements WHERE ref_type='transfer'");assert.equal(rows.reduce((s,r)=>s+r.qty_milli,0),0);
  for(const row of rows){const meta=JSON.parse(row.meta);assert.equal(meta.requestId,'sequence');assert.ok(row.actor);assert.ok(meta.allocationBreakdown.every(a=>a.sourceMovementId));assert.equal(Math.abs(row.qty_milli),meta.allocationBreakdown.reduce((s,a)=>s+a.qtyMilli,0));const rate=Math.round(meta.allocationBreakdown.reduce((s,a)=>s+a.qtyMilli*a.unitCost,0)/Math.abs(row.qty_milli)*10000)/10000;assert.equal(row.unit_cost_cents,Math.round(rate*100));}
  // Catalogue changes cannot rewrite previously booked movement cost.
  const frozen=JSON.stringify(rows), catalogue=h.one("SELECT data FROM store_docs WHERE feature='economat-catalogue'").data;h.raw.prepare("UPDATE store_docs SET data='{}' WHERE feature='economat-catalogue'").run();assert.equal(JSON.stringify(h.rows("SELECT * FROM inventory_movements WHERE ref_type='transfer'")),frozen);h.raw.prepare("UPDATE store_docs SET data=? WHERE feature='economat-catalogue'").run(catalogue);
 }
})));

await strict('competing requests cannot overbook; cancellation releases holds once',fc.asyncProperty(fc.array(qty,{minLength:2,maxLength:12}),async quantities=>using(async h=>{
 let held=0;
 for(let i=0;i<quantities.length;i++){
  const q=quantities[i],id='competing:'+i;await h.createSubmitted(id,'whisky',q);
  const r=await post(h,{action:'review',id,revision:2,idempotencyKey:'review:'+id,data:{lines:[{itemId:'whisky',qtyApproved:q,resolution:'approved'}]}});
  assert.equal(r.status,held+q<=12?200:409);if(r.status===200)held+=q;
  if(i%2===1&&r.status===200){const b={action:'cancel',id,revision:r.request.revision,idempotencyKey:'cancel:'+id};assert.equal((await post(h,b)).status,200);assert.equal((await post(h,b)).status,200);held-=q;}
  assert.equal(h.one('SELECT COALESCE(SUM(qty_milli),0) n FROM inventory_request_reservations').n,held*1000);assert.equal(h.balance('whisky','u-economat'),12);
 }
})));
// Une tranche par taux de lot source : la valeur qui arrive au bar est, au centime près, celle qui sort de l'économat.
await strict('a large transfer moves the exact source value, one slice per source rate',fc.asyncProperty(fc.integer({min:1,max:200}),async n=>using(async h=>{
 h.raw.exec('ALTER TABLE inventory_movements ADD COLUMN unit_cost_rate INTEGER');
 h.addMovement({id:'drain',itemId:'cola',qty:-24});h.addMovement({id:'cheap',itemId:'cola',qty:1,unitCost:.01,reason:'receipt'});h.addMovement({id:'dear',itemId:'cola',qty:n,unitCost:.02,reason:'receipt'});
 const ready=await h.ready('exact','cola',n+1);
 const b={action:'confirm',id:'exact',revision:ready.request.revision,idempotencyKey:'confirm:exact',data:{lines:[{itemId:'cola',qtyReceived:n+1}]}};
 assert.equal((await post(h,b)).status,200);assert.equal((await post(h,b)).status,200);
 const value=reason=>h.rows("SELECT qty_milli,unit_cost_rate FROM inventory_movements WHERE ref_type='transfer' AND reason=?",reason).reduce((s,r)=>s+r.qty_milli*r.unit_cost_rate,0);
 assert.equal(value('transfer-in'),(1+2*n)*100*1000);assert.equal(value('transfer-out'),-(1+2*n)*100*1000);
 assert.equal(h.balance('cola','u-bar-rooftop'),n+1);assert.equal(h.balance('cola','u-economat'),0);
 const a=allocateTransferAllocation(h.rows("SELECT * FROM inventory_movements WHERE item_id='cola' AND location_id='u-bar-rooftop'"),(n+1)*1000);
 assert.equal(a.pieces.reduce((s,p)=>s+p.qtyMilli*Math.round(p.unitCost*10000),0),(1+2*n)*100*1000);
})),[[150],[101]]);
console.log(`economat properties: ${passed} strict, ${known} known, ${failed} failures; runs=${RUNS}; seed=${SEED}`);if(failed)process.exitCode=1;
