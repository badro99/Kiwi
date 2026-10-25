#!/usr/bin/env node
// Real Pages handlers on transactional local SQLite, no network or browser.
import { hotelTestSource } from './hotel-test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {declaration} from './js-declarations.cjs';
import {makeSession,SESS_COOKIE,tillToken,TILL_COOKIE} from '../functions/auth/_lib.js';
import {onRequestPost as stays,onRequestGet as getStays} from '../functions/api/hotel/stays.js';
import {onRequestGet as billing,onRequestPost as saveBilling} from '../functions/api/hotel/billing-draft.js';
import {onRequestPost as charge} from '../functions/api/hotel/room-charges.js';
import {onRequestGet as declarations} from '../functions/api/hotel/declarations.js';
import {stayBalance} from '../functions/api/hotel/_stay-balance.js';
import {draftSource,buildDraft} from '../functions/api/hotel/_billing-draft.js';
import {businessDate} from '../functions/api/_business-day.js';
const ROOT=path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ fast-check unavailable; hotel properties skipped');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||100,SEED=Number(process.env.KIWI_PROPERTY_SEED)||20261022;
let passed=0,failed=0,known=0;
async function strict(label,p,examples=[]){if(process.env.KIWI_PROPERTY_ONLY&&!new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(r.failed){failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance);}else{passed++;console.log('✓ '+label);}}
async function knownIssue(label,p){if(process.env.KIWI_PROPERTY_ONLY)return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(!r.failed||r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('✗ known must fail as documented: '+label,r.errorInstance);}else{known++;console.log('◦ known '+label+'; witness '+fc.stringify(r.counterexample));}}
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(path.join(ROOT,'schema.sql'),'utf8'));
// D1 executes each batch atomically. Do not yield between SQLite statements:
// interleaving two transactions on one connection would model a fixture bug.
let beforeBatch=null;
const DB={
  prepare(q){
    let args=[];
    return{
      query:q,
      bind(...a){args=a;return this;},
      async first(){return sql.prepare(q).get(...args)||null;},
      async all(){return{results:sql.prepare(q).all(...args)};},
      async run(){return this.execute();},
      execute(){
        if(/^\s*SELECT/i.test(q))return{results:sql.prepare(q).all(...args)};
        const r=sql.prepare(q).run(...args);return{success:true,meta:{changes:Number(r.changes)}};
      }
    };
  },
  async batch(ss){
    if(beforeBatch&&ss.some(s=>s.query.startsWith('UPDATE store_docs SET data'))){const fn=beforeBatch;beforeBatch=null;fn();}
    sql.exec('BEGIN IMMEDIATE');
    try{const out=ss.map(s=>s.execute());sql.exec('COMMIT');return out;}
    catch(e){sql.exec('ROLLBACK');throw e;}
  }
};
const merchant='property-hotel',other='other-hotel',secret='local-hotel-properties-secret',env={DB,AUTH_SECRET:secret};
for(const [m,a]of [[merchant,'owner'],[other,'stranger']]){sql.prepare('INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?)').run(a,a+'@example.test',m,'s','h',1);sql.prepare("INSERT INTO merchant_config(merchant,account_id,type,features,status,updated_ts) VALUES(?,?,'hotel','{}','active',1)").run(m,a);}
const cookies={stranger:SESS_COOKIE+'='+await makeSession('stranger',secret),owner:SESS_COOKIE+'='+await makeSession('owner',secret),till:TILL_COOKIE+'='+await tillToken(secret,merchant)};
async function call(handler,b={},role='owner',get=false){const u=new URL('https://kiwi.test/api/hotel/test');if(get)for(const[k,v]of Object.entries({merchant,...b}))u.searchParams.set(k,v);const r=await handler({env,request:new Request(u,{method:get?'GET':'POST',headers:{Cookie:cookies[role]||'','Content-Type':'application/json'},...(get?{}:{body:JSON.stringify({merchant,...b})})})});return{status:r.status,body:await r.json()};}
const ok=r=>assert.equal(r.status,200,JSON.stringify(r)),cents=x=>Math.round(x*100),day=n=>new Date(Date.UTC(2026,10,1+n)).toISOString().slice(0,10);
function doc(feature,data,m=merchant){sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,1) ON CONFLICT(merchant,feature) DO UPDATE SET data=excluded.data,rev=1').run(m,feature,JSON.stringify(data));}
function reset(rate=100){for(const t of ['hotel_room_charge_events','hotel_stay_events','hotel_reservations','sales','store_docs'])sql.exec('DELETE FROM '+t);doc('rooms',{baseRate:rate,roomTypes:[{id:'type-basic',name:'Basic',rate,maxGuests:4}],rooms:[1,2].map(n=>({id:'room:'+n,n,typeId:'type-basic',status:'libre'})),folios:[]});doc('reservations',{v:1,settings:{},services:[],resources:[],blocked:[],bookings:[]});doc('hotel-units',{units:[{id:'bar',name:'Bar',kind:'outlet',storeType:'bar',locationId:'bar-stock',active:true},{id:'eco',name:'Economat',kind:'economat',storeType:'economat',locationId:'eco-stock',active:true}]});doc('team',{members:[{id:'cashier',firstName:'Fixture'}]});}
const payload=(i=0,start=0,n=2,room=1)=>({action:'save',clientRef:'property-ref-'+i,roomTypeId:'type-basic',resourceId:'room:'+room,checkIn:day(start),checkOut:day(start+n),partySize:1,customer:{name:'Guest '+i},guests:[{name:'Guest '+i,idDocType:'passeport',idDocNumber:'SYNTHETIC-'+i}]});
function rows(){return sql.prepare('SELECT * FROM hotel_reservations ORDER BY id').all();}
function invariant(){const a=rows().filter(b=>['requested','confirmed','checked_in'].includes(b.status));for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i].room_id===a[j].room_id)assert.ok(a[i].end_at<=a[j].start_at||a[j].end_at<=a[i].start_at,'overlapping active stays');}
function snapshot(){return JSON.stringify(['store_docs','hotel_reservations','hotel_stay_events'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));}
async function create(p=payload()){const r=await call(stays,p);ok(r);return r.body.booking;}
const source=fs.readFileSync(path.join(ROOT,'assets/pos-hotel.js'),'utf8');
const ctx=vm.createContext({Number,Math,CHARGE:{test:{unit:0}},TPT:0,roomRate:()=>999});
for(const name of ['chargeAmt','stayRate','stayTotals'])vm.runInContext(declaration(source.slice(source.indexOf('function '+name+'(')),name),ctx);
try{
await strict('folio centimes and exact settled balance survive fractional nightly prices',fc.property(fc.integer({min:1,max:1000000}),fc.integer({min:1,max:30}),(rate,n)=>{const total=rate*n;const st={room:1,nightlyRate:rate/100,nights:n,adults:0,charges:[],payments:[{amount:total/100}]};const t=ctx.stayTotals(st);assert.equal(t.due,0);assert.equal(t.total,total/100);}),[[10,3],[7,3]]);
await strict('folio deposits payments refunds extras and tourist tax conserve signed centimes',fc.property(
  fc.integer({min:1,max:1000000}),fc.integer({min:1,max:30}),fc.integer({min:1,max:4}),
  fc.array(fc.integer({min:1,max:100000}),{maxLength:8}),
  fc.array(fc.integer({min:-100000,max:100000}),{maxLength:8}),
  (rate,n,adults,extras,payments)=>{
    ctx.TPT=27;
    try{
      const st={room:1,nightlyRate:rate/100,nights:n,adults,
        charges:extras.map(v=>({unit:v/100,qty:1})),payments:payments.map(v=>({amount:v/100}))};
      const t=ctx.stayTotals(st),paid=payments.reduce((a,b)=>a+b,0),total=rate*n+2700*adults*n+extras.reduce((a,b)=>a+b,0);
      assert.equal(t.total,total/100);assert.equal(t.paid,paid/100);assert.equal(t.due,Math.max(0,total-paid)/100);
    }finally{ctx.TPT=0;}
  }));
await strict('group rooms race with individual bookings without overselling and cancel independently',fc.asyncProperty(
  fc.integer({min:1,max:8}),fc.integer({min:1,max:1000000}),async(n,rate)=>{
    reset(rate/100);const dossierId='group-property-001';
    const ps=[{...payload(1,0,n,1),dossierId},{...payload(2,0,n,2),dossierId},payload(3,0,n,1)];
    const rs=await Promise.all(ps.map(p=>call(stays,p)));
    assert.equal(rs.filter(r=>r.status===200).length,2);assert.equal(rows().length,2);invariant();
    const members=rs.filter(r=>r.status===200&&r.body.booking.hotel.dossierId===dossierId).map(r=>r.body.booking);
    assert.ok(members.length>=1);
    const d=await call(billing,{dossierId},'owner',true);ok(d);
    assert.equal(d.body.preview.totalCents,rate*n*members.length);
    const a=members[0],beforeOther=rows().filter(r=>r.id!==a.id);
    ok(await call(stays,{action:'cancel',id:a.id}));
    assert.deepEqual(rows().filter(r=>r.id!==a.id),beforeOther);invariant();
  }));
await strict('lifecycle reopening cannot reclaim a room already resold to a confirmed guest',fc.asyncProperty(fc.integer({min:1,max:8}),fc.boolean(),async(n,pruned)=>{reset();const a=await create(payload(1,0,n));ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));ok(await call(stays,{action:'status',id:a.id,status:'completed',force:true}));await create(payload(2,0,n));if(pruned){const r=sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='reservations'").get(merchant);const d=JSON.parse(r.data);d.bookings=[];sql.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='reservations'").run(JSON.stringify(d),merchant);}const before=snapshot();assert.equal((await call(stays,{action:'status',id:a.id,status:'checked_in',reopen:true})).status,409);assert.equal(snapshot(),before);invariant();}));
await strict('reopening versus reselling the released room admits exactly one concurrent request',fc.asyncProperty(
  fc.integer({min:1,max:8}),async n=>{
    reset();const a=await create(payload(1,0,n));
    ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));
    ok(await call(stays,{action:'status',id:a.id,status:'completed',force:true}));
    const rs=await Promise.all([
      call(stays,{action:'status',id:a.id,status:'checked_in',reopen:true}),
      call(stays,payload(2,0,n))
    ]);
    assert.equal(rs.filter(r=>r.status===200).length,1,JSON.stringify(rs));
    assert.equal(rs.filter(r=>r.status===409).length,1,JSON.stringify(rs));invariant();
  }));
await strict('racing creates and identical retries consume one room and one creation event',fc.asyncProperty(fc.integer({min:1,max:10}),async n=>{reset();const p=payload(1,0,n);const rs=await Promise.all([call(stays,p),call(stays,p)]);rs.forEach(ok);assert.equal(rows().length,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM hotel_stay_events').get().n,1);const race=await Promise.all([call(stays,payload(2,0,n)),call(stays,payload(3,0,n))]);race.forEach(r=>assert.equal(r.status,409));invariant();}));
await strict('create extend shorten move cancel sequences preserve overlap and refused-write atomicity',fc.asyncProperty(fc.array(fc.record({kind:fc.constantFrom('create','extend','shorten','move','cancel'),start:fc.integer({min:0,max:8}),n:fc.integer({min:1,max:5}),room:fc.integer({min:1,max:2})}),{minLength:1,maxLength:20}),async actions=>{reset();for(const[i,a]of actions.entries()){const saved=rows(),old=saved.length?JSON.parse(saved[i%saved.length].raw_json):null;let p=payload(i,a.start,a.n,a.room);if(old&&a.kind!=='create'){p={...payload(i,0,1),id:old.id,clientRef:old.publicRef,expectedUpdatedAt:old.updatedAt,resourceId:a.kind==='move'?'room:'+a.room:old.resourceId,checkIn:old.hotel.checkIn,checkOut:a.kind==='extend'?day(a.start+a.n+10):a.kind==='shorten'?day(a.start+1):old.hotel.checkOut};if(a.kind==='cancel')p={action:'cancel',id:old.id};}const before=snapshot(),r=await call(stays,p);assert.ok([200,400,409].includes(r.status),JSON.stringify(r));if(r.status!==200)assert.equal(snapshot(),before);invariant();}}));
await strict('checkout day is available and nights retain accepted centime rate after catalogue changes',fc.asyncProperty(fc.integer({min:1,max:1000000}),fc.integer({min:1,max:10}),async(rate,n)=>{reset(rate/100);const p=payload(1,0,n),a=await create(p);assert.equal(cents(a.hotel.total),rate*n);await create(payload(2,n,1));doc('rooms',{roomTypes:[{id:'type-basic',name:'Basic',rate:999,maxGuests:4}],rooms:[{id:'room:1',n:1,typeId:'type-basic',status:'libre'}]});const r=await call(stays,{...p,id:a.id,expectedUpdatedAt:a.updatedAt,customer:{name:'Changed'}});ok(r);assert.equal(cents(r.body.booking.hotel.total),rate*n);invariant();}));
await strict('invalid zero negative and impossible overnight ranges leave no ledger or event',fc.asyncProperty(fc.constantFrom(['2026-11-01','2026-11-01'],['2026-11-02','2026-11-01'],['2027-02-30','2027-03-04']),async([a,b])=>{reset();const before=snapshot();assert.equal((await call(stays,{...payload(),checkIn:a,checkOut:b})).status,400);assert.equal(snapshot(),before);}));
await strict('draft conserves each night and allocated payer centime for indivisible totals',fc.property(fc.integer({min:0,max:10000000}),fc.integer({min:1,max:30}),(total,n)=>{const b={id:'stay-test',status:'confirmed',resourceId:'room:1',customer:{name:'Guest'},hotel:{checkIn:day(0),checkOut:day(n),total:total/100}};const s=draftSource([b]);const d=buildDraft(s,{extras:[],allocations:[]});assert.equal(d.totalCents,total);assert.equal(d.payers.reduce((a,p)=>a+p.amountCents,0),total);assert.equal(d.lines.length,n);assert.ok(d.lines.every(l=>l.stayId===b.id&&Number.isSafeInteger(l.amountCents)));}));
await strict('billing API separates guests and rejects stale draft after stay price changes',fc.asyncProperty(fc.integer({min:1,max:1000000}),async rate=>{reset(rate/100);const a=await create(payload(1)),b=await create(payload(2,0,2,2));const r=await call(billing,{dossierId:a.id},'owner',true);ok(r);assert.equal(r.body.preview.totalCents,rate*2);assert.ok(r.body.source.lines.every(l=>l.stayId===a.id));assert.ok(!JSON.stringify(r.body).includes(b.id));const input={action:'save-draft',dossierId:a.id,commandId:'draft-command-001',rev:r.body.rev,sourceDigest:r.body.sourceDigest,directoryRev:r.body.directoryRev,input:{extras:[],allocations:[]}};ok(await call(saveBilling,input));ok(await call(saveBilling,input));const changed=await call(stays,{...payload(1),id:a.id,expectedUpdatedAt:a.updatedAt,checkOut:day(3)});ok(changed);assert.equal((await call(saveBilling,{...input,commandId:'draft-command-002',rev:1})).status,409);}));
await strict('restaurant charges retry once on their stay and refuse closed or other-tenant targets',fc.asyncProperty(fc.integer({min:1,max:1000000}),async amount=>{reset();const a=await create();const ts=a.startAt+3600000;sql.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,?,?,?,?)').run('meal',merchant,amount/100,amount,'room',ts);const p={saleId:'meal',outletId:'bar',shiftId:'shift-test',cashierId:'cashier',roomId:a.resourceId};const rs=await Promise.all([call(charge,p),call(charge,p)]);rs.forEach(ok);assert.equal(sql.prepare('SELECT COUNT(*) n FROM hotel_room_charge_events').get().n,1);const d=await call(billing,{dossierId:a.id},'owner',true);ok(d);assert.equal(d.body.preview.totalCents,20000+amount);assert.equal((await call(charge,{...p,shiftId:'different-shift'})).status,409);sql.prepare("UPDATE sales SET void_ts=? WHERE id='meal'").run(ts+1000);ok(await call(charge,{...p,action:'reverse'}));ok(await call(charge,{...p,action:'reverse'}));const reversed=await call(billing,{dossierId:a.id},'owner',true);ok(reversed);assert.equal(reversed.body.preview.totalCents,20000);sql.prepare("UPDATE sales SET void_ts=NULL WHERE id='meal'").run();assert.equal((await call(charge,{...p,merchant:other})).status,403);ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));ok(await call(stays,{action:'status',id:a.id,status:'completed',force:true}));sql.prepare("UPDATE sales SET id='late-meal'").run();assert.equal((await call(charge,{...p,saleId:'late-meal'})).status,409);}));
await strict('tenant stay lookup and owner-only drafts declarations reveal no guest identity to outsiders',fc.asyncProperty(fc.integer({min:0,max:10000}),async i=>{reset();const a=await create(payload(i));for(const [handler,p]of [[getStays,{id:a.id,merchant:other}],[billing,{dossierId:a.id,merchant:other}],[billing,{dossierId:a.id}],[declarations,{month:'2026-11'}]]){const role=p.merchant?'owner':'till',r=await call(handler,p,role,true);assert.ok([401,403,404].includes(r.status),JSON.stringify(r));assert.ok(!JSON.stringify(r.body).includes('SYNTHETIC'));}}));
await strict('Morocco business date switches at 05:00 UTC after zone law',fc.property(fc.integer({min:0,max:29}),fc.integer({min:0,max:59}),(d,m)=>{const date=day(d),ts=Date.parse(date+'T04:'+String(m).padStart(2,'0')+':00Z');assert.equal(businessDate(ts,5,'Africa/Casablanca'),day(d-1));assert.equal(businessDate(ts+3600000,5,'Africa/Casablanca'),date);}));
await strict('preinvoice policy explicitly forbids fiscal issuance until tax and payments are verified',fc.property(fc.integer({min:1,max:10000}),total=>{const s=draftSource([{id:'stay-test',status:'confirmed',customer:{name:'Guest'},hotel:{checkIn:day(0),checkOut:day(1),total:total/100}}]);const d=buildDraft(s,{extras:[],allocations:[]});assert.equal(d.issuancePolicy,'draft-only');assert.equal(d.finalizable,false);assert.equal(d.kind,'preinvoice');assert.equal(d.taxStatus,'unverified');assert.equal(d.paymentStatus,'not-reconciled');}));
await strict('preinvoice names each line missing a VAT rate or tourist tax and never verifies without them',fc.property(fc.integer({min:1,max:30}),fc.array(fc.integer({min:1,max:100000}),{maxLength:5}),(n,charges)=>{const b={id:'stay-tax',status:'checked_in',resourceId:'room:1',customer:{name:'Guest'},hotel:{checkIn:day(0),checkOut:day(n),total:n}};const ev=charges.map((a,i)=>({id:'charge-'+i,kind:'room-charge',stayId:b.id,roomId:'room:1',amountCents:a,occurredTs:Date.parse(day(0)+'T12:00:00Z')}));const d=buildDraft(draftSource([b],[],ev,[]),{extras:[],allocations:[]});assert.equal(d.taxStatus,'unverified');assert.equal(d.finalizable,false);assert.deepEqual(d.taxIssues.map(i=>i.lineId),d.lines.map(l=>l.id));for(const i of d.taxIssues)assert.deepEqual(i.missing,i.lineId.startsWith('stay:')?['vatRate','touristTax']:['vatRate']);}));
await strict('payment status reconciles linked folio centimes exactly and lists what the server cannot see',fc.property(fc.integer({min:1,max:1000000}),fc.integer({min:0,max:1000000}),fc.integer({min:1,max:5}),(total,paid,n)=>{
  const b={id:'stay-pay',status:'completed',resourceId:'room:1',customer:{name:'Guest'},hotel:{checkIn:day(0),checkOut:day(n),total:total/100}};
  const split=[Math.floor(paid/2),paid-Math.floor(paid/2)];
  const linked={room:1,stayId:b.id,lines:split.map(c=>({amt:c/100,src:'room',paid:true})).concat([{amt:total/100,src:'room'}])};
  const run=f=>buildDraft(draftSource([b],[],[],f),{extras:[],allocations:[]});
  const d=run([linked,{room:1,stayId:'later-guest',lines:[{amt:total/100,src:'room',paid:true}]}]);
  if(paid===total){assert.equal(d.paymentStatus,'reconciled');assert.equal(d.owedCents,0);}
  else if(paid<total){assert.equal(d.paymentStatus,'partial');assert.equal(d.owedCents,total-paid);assert.equal(d.paidCents,paid);}
  else{assert.equal(d.paymentStatus,'not-reconciled');assert.deepEqual(d.paymentIssues,[{stayId:null,issue:'paid-exceeds-total',amountCents:paid-total}]);}
  assert.equal(run([{...linked,stayId:'other'}]).paymentIssues[0].issue,'no-linked-folio');
  assert.equal(run(null).paymentIssues[0].issue,'folios-unavailable');
  assert.deepEqual(run([{...linked,closedAt:1,settlementAmount:0.01}]).paymentIssues,[{stayId:b.id,issue:'settlement-unconfirmed',amountCents:1}]);
  assert.deepEqual(run([{...linked,lines:[...linked.lines,{amt:0.25,src:'taxe'},{amt:-0.25,src:'fee'}]}]).paymentIssues,[{stayId:b.id,issue:'folio-lines-outside-draft',amountCents:0}]);
  for(const x of [run(null),run([linked])])assert.equal(x.finalizable,false);
}),[[100,100,1],[100,99,1],[100,101,1]]);
await strict('billing API reads payments only from this tenant folio linked to the stay',fc.asyncProperty(fc.integer({min:0,max:20000}),async paid=>{
  reset();const a=await create(payload(1));
  const folio={room:1,stayId:a.id,lines:[{amt:paid/100,src:'room',paid:true}]};
  doc('rooms',{folios:[{room:1,stayId:a.id,lines:[{amt:200,src:'room',paid:true}]}]},other);
  const before=await call(billing,{dossierId:a.id},'owner',true);ok(before);assert.equal(before.body.preview.paymentStatus,'not-reconciled');assert.deepEqual(before.body.preview.paymentIssues,[{stayId:a.id,issue:'no-linked-folio'}]);
  doc('rooms',{baseRate:100,roomTypes:[{id:'type-basic',name:'Basic',rate:100,maxGuests:4}],rooms:[1,2].map(n=>({id:'room:'+n,n,typeId:'type-basic',status:'libre'})),folios:[folio]});
  const r=await call(billing,{dossierId:a.id},'owner',true);ok(r);const p=r.body.preview;
  assert.equal(p.totalCents,20000);assert.equal(p.paymentStatus,paid===20000?'reconciled':'partial');assert.equal(p.owedCents,20000-paid);assert.equal(p.finalizable,false);
  assert.equal(before.body.sourceDigest,r.body.sourceDigest);
  sql.prepare("UPDATE store_docs SET data='{' WHERE merchant=? AND feature='rooms'").run(merchant);
  const broken=await call(billing,{dossierId:a.id},'owner',true);ok(broken);assert.equal(broken.body.preview.paymentIssues[0].issue,'folios-unavailable');
}),[[20000],[0]]);
await strict('a charge arriving between balance read and checkout write is rechecked',fc.asyncProperty(fc.integer({min:1,max:1000000}),async amount=>{
  reset(0);const a=await create();ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));
  const roomDoc=JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
  roomDoc.folios=[{room:1,stayId:a.id,lines:[]}];doc('rooms',roomDoc);
  const eventCount=sql.prepare('SELECT COUNT(*) n FROM hotel_stay_events').get().n;
  beforeBatch=()=>sql.prepare("INSERT INTO hotel_room_charge_events(merchant,id,kind,sale_id,outlet_id,shift_id,cashier_id,stay_id,room_id,amount_cents,occurred_ts) VALUES(?,?,'room-charge',?,?,?,?,?,?,?,?)").run(merchant,'racing-charge','racing-sale','bar','shift','cashier',a.id,a.resourceId,amount,a.startAt);
  const r=await call(stays,{action:'status',id:a.id,status:'completed'});
  assert.equal(r.status,409);assert.equal(r.body.owedCents,amount);
  assert.equal(rows()[0].status,'checked_in');assert.equal(sql.prepare('SELECT COUNT(*) n FROM hotel_stay_events').get().n,eventCount);
}));
await strict('dashboard checkout displays cents and sends force only after confirmation',fc.asyncProperty(fc.boolean(),fc.integer({min:1,max:1000000}),async(approved,owed)=>{
  const requests=[],prompts=[],cache=new Map(),button={disabled:false};
  const ui=vm.createContext({
    cuMerchantSlug:()=>merchant,cuStayScope:()=>merchant,cuStayCache:()=>cache,cuStaysChanged:()=>{},
    tx:(text,vars={})=>text.replace(/\{(\w+)\}/g,(_,key)=>vars[key]),cuDraftMoney:c=>(c/100).toFixed(2),
    confirm:message=>{prompts.push(message);return approved;},toast:()=>{},rerender:()=>{},window:{},
    fetch:async(url,init)=>{const p=JSON.parse(init.body);requests.push(p);return {status:p.force?200:409,ok:!!p.force,json:async()=>p.force?{booking:{id:'ui-stay'}}:{error:'stay-unpaid',owedCents:owed}};}
  });
  const src=hotelTestSource();
  vm.runInContext(declaration(src.slice(src.indexOf('async function cuMoveStayStatus(')),'cuMoveStayStatus'),ui);
  await ui.cuMoveStayStatus('ui-stay','completed',button);
  assert.equal(prompts.length,1);assert.ok(prompts[0].includes((owed/100).toFixed(2)));
  assert.equal(requests.length,approved?2:1);assert.equal(requests[0].force,false);
  if(approved)assert.equal(requests[1].force,true);
  assert.equal(cache.has('ui-stay'),approved);assert.equal(button.disabled,false);
}));
await strict('server outstanding equals signed charges minus payments through every prefix and reversal',fc.property(
  fc.integer({min:0,max:10000000}),fc.array(fc.record({kind:fc.constantFrom('extra','payment','restaurant','reverse'),amount:fc.integer({min:-100000,max:100000})}),{maxLength:40}),
  (base,actions)=>{
    const stay={id:'stay-money',hotel:{total:base/100}},folio={stayId:stay.id,lines:[]},charges=[];
    let total=base,paid=0;const active=[];
    for(const [i,a] of actions.entries()){
      if(a.kind==='extra'){folio.lines.push({src:'minibar',amt:a.amount/100});total+=a.amount;}
      if(a.kind==='payment'){folio.lines.push({src:'room',paid:true,amt:a.amount/100});paid+=a.amount;}
      if(a.kind==='restaurant'){const amount=Math.abs(a.amount)+1;charges.push({id:String(i),kind:'room-charge',amount_cents:amount});active.push({id:String(i),amount});total+=amount;}
      if(a.kind==='reverse'&&active.length){const last=active.pop();charges.push({id:'reverse'+i,kind:'room-charge-reversal',reversal_of:last.id});total-=last.amount;}
      const balance=stayBalance(stay,[folio,{stayId:'other-stay',lines:[{src:'minibar',amt:999}]}],charges);
      assert.deepEqual(balance,{totalCents:total,paidCents:paid,owedCents:total-paid,linked:true});
    }
  }));
await strict('checkout balance gate conserves centimes, refuses atomically, forces and retries once',fc.asyncProperty(
  fc.integer({min:1,max:1000000}),fc.array(fc.integer({min:-100000,max:100000}),{maxLength:12}),fc.array(fc.integer({min:0,max:100000}),{maxLength:12}),
  async(rate,payments,extras)=>{
    reset(rate/100);const a=await create();ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));
    const roomDoc=JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
    roomDoc.folios=[{room:1,stayId:a.id,lines:[...extras.map(v=>({src:'minibar',amt:v/100})),...payments.map(v=>({src:'room',amt:v/100,paid:true}))]}];doc('rooms',roomDoc);
    sql.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,?,?,?,?)').run('checkout-meal',merchant,0.37,37,'room',a.startAt+3600000);
    ok(await call(charge,{saleId:'checkout-meal',outletId:'bar',shiftId:'shift-test',cashierId:'cashier',roomId:a.resourceId}));
    const owed=37+rate*2+extras.reduce((s,v)=>s+v,0)-payments.reduce((s,v)=>s+v,0),before=snapshot();
    let r=await call(stays,{action:'status',id:a.id,status:'completed'});
    if(owed>0){
      const current=JSON.parse(rows()[0].raw_json);
      const viaSave=await call(stays,{...payload(),id:a.id,expectedUpdatedAt:current.updatedAt,status:'completed'});
      assert.equal(viaSave.status,409);assert.equal(viaSave.body.owedCents,owed);assert.equal(snapshot(),before);
      assert.equal(r.status,409);assert.equal(r.body.error,'stay-unpaid');assert.equal(r.body.owedCents,owed);assert.equal(snapshot(),before);r=await call(stays,{action:'status',id:a.id,status:'completed',force:true});}
    ok(r);if(owed>0){assert.equal(r.body.booking.checkout.forced,true);assert.equal(r.body.booking.checkout.actor.id,'owner');}const closed=snapshot();ok(await call(stays,{action:'status',id:a.id,status:'completed'}));assert.equal(snapshot(),closed);
    const outsider=await call(stays,{merchant:other,action:'status',id:a.id,status:'completed',force:true},'stranger');assert.equal(outsider.status,404);assert.equal(snapshot(),closed);
  }),[[100,[],[]],[1,[40],[]],[1,[39],[]]]);
/* La caisse hôtel garde ses propres paiements : un séjour sans folio du tableau
   de bord n'est pas un séjour impayé. Le serveur ne sait rien de ce qui a été
   payé, donc il ne demande rien (sinon chaque séjour réglé au comptoir
   afficherait tout son prix comme dû). */
await strict('a stay with no linked dashboard folio checks out without an unpaid prompt',fc.asyncProperty(fc.integer({min:1,max:1000000}),async rate=>{
  reset(rate/100);const a=await create();ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));
  const r=await call(stays,{action:'status',id:a.id,status:'completed'});ok(r);
  assert.equal(r.body.booking.checkout.linked,false);assert.equal(r.body.booking.checkout.forced,false);
}));
await strict('early checkout records actual departure once and retains the contracted price without an invented cancellation fee',fc.asyncProperty(fc.integer({min:2,max:30}),async n=>{reset();const a=await create(payload(1,0,n));ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));const r=await call(stays,{action:'status',id:a.id,status:'completed',force:true});ok(r);const departure=r.body.booking.checkout;assert.ok(departure.actualDepartureAt>0);assert.equal(departure.billingPolicy,'booked-nights-retained');assert.equal(departure.cancellationFeeCents,0);const source=draftSource([r.body.booking]);assert.equal(source.lines.length,n);assert.equal(source.lines.reduce((s,l)=>s+l.amountCents,0),Math.round(a.hotel.total*100));const retry=await call(stays,{action:'status',id:a.id,status:'completed'});ok(retry);assert.deepEqual(retry.body.booking.checkout,departure);}));
}finally{sql.close();}
console.log(`hotel-properties: ${passed} strict passed, ${failed} failed, ${known} known; ${RUNS} cases/property; seed=${SEED}`);if(failed)process.exitCode=1;
