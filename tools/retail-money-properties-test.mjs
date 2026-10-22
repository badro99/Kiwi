#!/usr/bin/env node
// Checkout handlers and accounting declarations are extracted from live files.
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { world, load, source, TS } from './retail-money-harness.cjs';
const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}
catch{console.log('○ skip fast-check unavailable (npm --prefix app ci), retail money properties not executed');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||300, SEED=process.env.KIWI_PROPERTY_SEED?Number(process.env.KIWI_PROPERTY_SEED):20261023;
let passed=0,failed=0,known=0;
async function strict(label,property,examples=[]){const r=await fc.check(property,{numRuns:RUNS,seed:SEED,examples});
  if(r.failed){failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance||r.error);}
  else{passed++;console.log('✓ '+label);}}
async function knownIssue(id,label,property,examples=[]){const r=await fc.check(property,{numRuns:RUNS,seed:SEED,examples});
  if(r.failed&&r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('✗ known property raised an unexpected error: '+id,r.errorInstance);return;}
  if(r.failed){known++;console.log(`◦ known ${id} · ${label}\n  shrunk: ${fc.stringify(r.counterexample)}; seed=${r.seed}; path=${r.counterexamplePath}`);}
  else console.log('! known '+id+' holds now: promote to strict');}
const C=x=>Math.round(x*100),sum=xs=>xs.reduce((s,x)=>s+x,0),flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const amount=fc.integer({min:0,max:5_000_000}),positive=fc.integer({min:1,max:5_000_000});
const partsArb=fc.array(fc.record({cents:fc.integer({min:1,max:400000}),method:fc.constantFrom('cash','card','virement','cheque','livraison')}),{minLength:1,maxLength:12});
const basket=fc.array(fc.record({price:fc.integer({min:1,max:16666}),promo:fc.integer({min:0,max:100}),remise:fc.integer({min:0,max:100}),qty:fc.integer({min:1,max:5})}),{minLength:1,maxLength:60});
function ticket(w,rows,reward){w.c.P={};const lines=rows.map((r,i)=>{w.c.P['p'+i]={price:r.price/100};return{pid:'p'+i,qty:r.qty,remise:r.remise,promoPrice:Math.floor(r.price*(100-r.promo)/100)/100};});return{client:'customer',reward:{clientId:'customer',kind:'percent',value:reward},lines};}
for(const vertical of ['boutique','maison']){
 const w=world(vertical),c=w.c,p=w.prefix;
 await strict(vertical+' split checkout and server payment parts conserve cents; final tap books once',fc.property(partsArb,parts=>{
   const total=sum(parts.map(x=>x.cents));w.start(total/100);
   for(const part of parts)w.part(part.cents/100,part.method);
   assert.equal(w.receipts.length,1);const receipt=w.receipts[0];assert.equal(C(receipt.meta.paidNow),total);
   assert.equal(sum(receipt.parts.map(x=>C(x.amount))),total);assert.equal(sum(Array.from(c.bqPaymentParts(receipt.parts),x=>x.amountCents)),total);
   const button=w.$(`#${p}-${parts.at(-1).method==='cash'?'cash':parts.at(-1).method==='card'?'card':'external'}-ok`);button?.onclick();assert.equal(w.receipts.length,1);
 }));
 await strict(vertical+' 25/50 percent sharing and final remainder conserve the ticket to a centime',fc.property(positive,fc.array(fc.constantFrom('0.25','0.5'),{maxLength:11}),(total,shares)=>{
   w.start(total/100);let consumed=0;
   for(const share of shares){if(consumed===total)break;const button=w.$$(`[data-${p}-share]`).find(n=>n.dataset[p+'Share']===share);if(!button)break;button.onclick();
     w.$$(`[data-${p}-m]`).find(n=>n.dataset[p+'M']==='especes').onclick();const portion=C(Number(w.$(`#${p}-cash-in`).value));assert.ok(portion>0&&portion<=total-consumed);consumed+=portion;w.click(`#${p}-cash-ok`);}
   if(consumed<total)w.part((total-consumed)/100);assert.equal(w.receipts.length,1);assert.equal(sum(w.receipts[0].parts.map(x=>C(x.amount))),total);
 }));
 await strict(vertical+' cash change is nonnegative, at most cash given; insufficient tender cannot confirm',fc.property(positive,amount,(due,given)=>{
   w.start(due/100);const button=w.$$(`[data-${p}-m]`).find(n=>n.dataset[p+'M']==='especes');button.onclick();
   const input=w.$(`#${p}-cash-in`);input.value=String(given/100);input.oninput({target:input});
   const change=Number(w.$(`#${p}-cash-rendu`).textContent);assert.equal(C(change),Math.max(0,given-due));assert.ok(change>=0&&C(change)<=given);
   assert.equal(w.$(`#${p}-cash-ok`).disabled,given<due);w.click(`#${p}-cash-ok`);assert.equal(w.receipts.length,given<due?0:1);
 }));
 await strict(vertical+' positive discounted basket payload lines equal ticket, including folded 41..60-line baskets',fc.property(basket,fc.integer({min:0,max:99}),(rows,reward)=>{
   const t=ticket(w,rows,reward),tot=c.ticketTotals(t);if(!tot.total)return;
   const lines=t.lines.map(l=>({...l,unit:c.lineUnit(l)}));const sale={id:'ticket',syncId:'sync',at:new Date(TS),total:tot.total,reward:t.reward,lines,tenderVersion:2,parts:[{m:'carte',amount:tot.total}]};
   const payload=c.originalSalePayload(sale);assert.equal(sum(Array.from(payload.lines,l=>C(l.total))),C(tot.total));assert.ok(payload.lines.length<=40);
   assert.equal(sum(Array.from(payload.paymentParts,l=>l.amountCents)),C(tot.total));assert.ok(payload.lines.every(l=>l.total>=0));
 }));
 await strict(vertical+' positive loyalty returns over all quantities never exceed paid ticket; returned quantities stay capped',fc.property(basket,fc.integer({min:0,max:99}),(rows,reward)=>{
   const t=ticket(w,rows,reward),tot=c.ticketTotals(t);if(!tot.total)return;
   const sale={total:tot.total,reward:t.reward,lines:t.lines.map(l=>({...l,unit:c.lineUnit(l)}))};
   const credit=sum(sale.lines.map(l=>C(c.paidUnit(sale,l))*l.qty));assert.ok(credit<=C(sale.total));
   for(const l of sale.lines){c.markLineReturned(l,l.qty,'return');c.markLineReturned(l,l.qty,'retry');assert.equal(c.lineAvailableQty(l),0);assert.equal(c.lineReturnedQty(l),l.qty);}
 }));
 await strict(vertical+' actual return-for-credit issues only the picked paid quantities and blocks a simultaneous retry',fc.asyncProperty(fc.integer({min:100,max:100000}),fc.integer({min:1,max:10}),fc.integer({min:0,max:99}),fc.nat(),async(unit,qty,discount,pick)=>{
   const picked=1+pick%qty;
   const sale={id:'return-sale',total:Math.floor(unit*qty*(100-discount)/100)/100,reward:{kind:'percent'},lines:[{pid:'p',unit:unit/100,qty}]};
   c.SALES=[sale];c.P={p:{name:'Article'}};c.state={ret:{saleId:sale.id,picks:new Set([0]),quantities:new Map([[0,picked]]),motif:'Taille'}};
   const issued=[];c.issueAvoir=async(value)=>{issued.push(value);await Promise.resolve();return{code:'AV-TEST'};};
   Object.assign(c,{stableCreditIssueId:()=> 'credit-id',restoreLines(){},recordReturn(){},useKiwiCl:()=>true,refreshOps(){},openVoucher(){},creditErrorDetail:e=>String(e)});
   const a=c.doAvoir(),b=c.doAvoir();await Promise.all([a,b]);assert.equal(issued.length,1);assert.ok(C(issued[0])<=Math.floor(C(sale.total)*picked/qty));
 }));
 await strict(vertical+' partial checkout receipt tracks total minus all prior and current collections',fc.property(fc.integer({min:2,max:5_000_000}),fc.nat(),fc.nat(),(total,a,b)=>{
   const prior=a%total,remaining=total-prior,payment=1+b%remaining;const opts={balanceExisting:true,balanceTotal:total/100,balancePaid:prior/100};w.start(remaining/100,opts);w.part(payment/100);
   assert.equal(w.receipts.length,1);const printed=w.events.at(-1)[1];assert.equal(C(printed.acompte.remaining),total-prior-payment);assert.equal(C(printed.acompte.paid),prior+payment);
 }));
 await strict(vertical+' voucher spent over several tickets conserves balance and a repeated confirm cannot spend twice',fc.asyncProperty(positive,fc.array(positive,{minLength:1,maxLength:8}),async(balance,asks)=>{
   c.AVOIRS=[{code:'AV-TEST',balance:balance/100,holderId:'customer'}];let spent=0;
   for(const ask of asks){if(spent===balance)break;w.start(ask/100);w.voucher('AV-TEST');await flush();const applied=Math.min(balance-spent,ask);
     if(applied<ask)w.part((ask-applied)/100);await flush();assert.equal(w.receipts.length,1);
     const credit=sum(w.receipts[0].parts.filter(p=>p.m==='avoir').map(p=>C(p.amount)));assert.equal(credit,applied);spent+=credit;
     assert.equal(C(c.AVOIRS[0].balance),balance-spent);assert.ok(c.AVOIRS[0].balance>=0);
     const button=w.$(`#${p}-cash-ok`);button?.onclick();await flush();assert.equal(w.receipts.length,1);
   }
 }));
 await strict(vertical+' initial deposit saves exactly the single received amount and protects its ticket from returns',fc.asyncProperty(fc.integer({min:2,max:5_000_000}),fc.nat(),async(total,raw)=>{
   const deposit=1+raw%(total-1);w.start(total/100);w.part(deposit/100);assert.equal(w.receipts.length,0);w.click(`#${p}-save-acompte`);await flush();
   assert.equal(w.receipts.length,1);assert.equal(w.receipts[0].meta.partial,true);assert.equal(C(w.receipts[0].meta.paidNow),deposit);
   const sale={id:'deposit',kind:'acompte',total:deposit/100,lines:[{pid:'p',unit:total/100,qty:1}]};c.SALES=[sale];c.state={ret:{saleId:sale.id,picks:new Set([0])}};let issued=0;c.issueAvoir=async()=>{issued++;};await c.doAvoir();assert.equal(issued,0);
 }));
 const exchangeWorld=world(vertical);
 await strict(vertical+' exchange difference requests exactly replacement minus the frozen paid return unit',fc.asyncProperty(fc.integer({min:1,max:50000}),fc.integer({min:1,max:50000}),async(oldPrice,newPrice)=>{
   const e=exchangeWorld,ctx=e.c;const old=oldPrice/100,replacement=newPrice/100;
   ctx.P={old:{name:'Old',price:old},new:{name:'New',price:replacement}};ctx.SALES=[{id:'original',total:old,lines:[{pid:'old',unit:old,qty:1,size:'M'}]}];ctx.state={exchange:{saleId:'original',idx:0}};
   Object.assign(ctx,{firstName:s=>s,lineDeal:()=>({price:ctx.shelf(replacement)}),variantStock:()=>1,canHoldStock:()=>true,holdStock:()=>false,persistStock:()=>false,showStockIssue(){},nextStandaloneTicketNumber:async()=> 'next',stableCreditIssueId:()=> 'return',refreshOps(){},openVoucher(){},creditErrorDetail:e=>String(e)});
   const requests=[];ctx.openPay=opts=>requests.push(C(opts.amount));ctx.issueAvoir=async amount=>{requests.push(-C(amount));return{code:'AV'};};
   ctx.openExchSummary('new','M','');e.click(`#${e.prefix}-exch-go`);await flush();
   const difference=C(ctx.shelf(replacement))-oldPrice;if(difference)assert.deepEqual(requests,[difference]);else assert.equal(requests.length,0);
 }));
 const feedWorld=world(vertical);
 await strict(vertical+' repeated server return-history imports retain a sale once and preserve paid revenue',fc.asyncProperty(positive,async(value)=>{
   const c=feedWorld.c;c.SALES=[];c.IS_DEMO=false;c.P={p:{id:'p',name:'Article'}};
   const row={id:'remote',ref:'ticket',ts:TS,method:'card',amountCents:value,lines:[{itemId:'p',name:'Article',qty:1,total:value/100}]};
   c.fetch=async()=>({ok:true,json:async()=>({sales:[row,row]})});assert.equal(await c.syncReturnSales(),1);assert.equal(await c.syncReturnSales(),0);assert.equal(c.SALES.length,1);assert.equal(C(c.caToday()),value);
 }));
 await knownIssue('RM-2-'+vertical,'imported unpaid delivery/store-credit must remain outside header and daily money-in',fc.asyncProperty(positive,fc.constantFrom('delivery','credit'),async(value,method)=>{
   const c=feedWorld.c;c.SALES=[];c.IS_DEMO=false;c.P={p:{id:'p',name:'Article'}};c.AVOIRS=[];
   c.fetch=async()=>({ok:true,json:async()=>({sales:[{id:'remote',ref:'unpaid',ts:TS,method,amountCents:0,lines:[{itemId:'p',name:'Article',qty:1,total:value/100}]}]})});
   await c.syncReturnSales();return C(c.caToday())===0&&C(c.bqDayTotals().moneyIn)===0;
 }),[[1,'credit'],[1,'delivery']]);
 await strict(vertical+' zero-payment loyalty basket is identified by its explicit zero ticket',fc.property(fc.integer({min:100,max:5000000}),price=>{
   const rows=[{price,promo:0,remise:0,qty:1}],t=ticket(w,rows,100);assert.equal(c.ticketTotals(t).total,0);
 }));
 const journal=fc.array(fc.record({cents:positive,method:fc.constantFrom('espèces','carte','virement','chèque','avoir','livraison'),old:fc.boolean(),voided:fc.boolean()}),{maxLength:60});
 await strict(vertical+' today header and Z count live monetary sales only, on their receiving day',fc.property(journal,rows=>{
   c.AVOIRS=[];c.SALES=rows.map((r,i)=>({id:'s'+i,syncId:'sync'+i,at:new Date(TS-(r.old?86400000:0)),voided:r.voided,total:r.cents/100,parts:[{m:r.method,amount:r.cents/100}],lines:[]}));
   const live=rows.filter(r=>!r.old&&!r.voided),paid=live.filter(r=>!['avoir','livraison'].includes(r.method)),want=sum(paid.map(r=>r.cents));
   assert.equal(C(c.caToday()),want);const z=Array.from(c.bqZJournal('test-shop')).filter(r=>!r.voided);assert.equal(sum(z.map(r=>C(r.amount))),want);assert.equal(z.length,paid.length);
   const day=c.bqDayTotals();assert.equal(C(day.moneyIn),want);assert.equal(day.txns,live.length);assert.equal(C(day.delivery),sum(live.filter(r=>r.method==='livraison').map(r=>r.cents)));
 }));
}
for(const vertical of ['boutique','maison']){
 const w=world(vertical),c=w.c;
 await knownIssue('RM-1-'+vertical,'explicit free reward ticket must send zero-valued lines and return zero credit',fc.property(fc.integer({min:100,max:5000000}),price=>{
   const unit=c.shelf(price/100),sale={id:'free',total:0,reward:{kind:'percent',value:100},lines:[{pid:'p',unit,qty:1}],parts:[],tenderVersion:2};
   const payload=c.originalSalePayload(sale);return C(c.paidUnit(sale,sale.lines[0]))===0&&sum(Array.from(payload.lines,l=>C(l.total)))===0&&payload.ticketAmountCents===0;
 }),[[100]]);
}
// Shared balance journal, hold/replay and repeat guard use their live declarations.
const shared=vm.createContext({console,Date,Math,Number,JSON,Map,Set,navigator:{onLine:false}});shared.window=shared;
let store=new Map();shared.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
load(shared,'assets/retail-balances.js',['key','read','write','cents','due','record','list']);
await strict('retail balances conserve total = paid + due; repeated receipt counts once; tenants stay isolated',fc.property(positive,fc.array(positive,{maxLength:12}),(total,asks)=>{
 store=new Map();const input={id:'balance',customerId:'customer',ticketRef:'ticket',totalCents:total,basePaidCents:0};let paid=0;shared.record('shop-a',input);
 for(const[i,ask]of asks.entries()){const fits=ask<=total-paid;const next={...input,receipt:{id:'receipt'+i,amountCents:ask,method:'cash'}};const row=shared.record('shop-a',next);assert.equal(!!row,fits);if(fits){paid+=ask;shared.record('shop-a',next);}const saved=shared.read('shop-a')[0];assert.equal(saved.paidCents,paid);assert.equal(shared.due(saved),total-paid);assert.ok(saved.paidCents<=total);}
 assert.equal(shared.read('shop-b').length,0);
}));
await strict('remote balance receipts and unsynced collections are disjoint by id, including partial acknowledgement',fc.asyncProperty(fc.integer({min:3,max:5_000_000}),fc.nat(),fc.nat(),async(total,a,b)=>{
 store=new Map();const first=1+a%(total-1),second=1+b%(total-first);const input={id:'balance',customerId:'customer',ticketRef:'ticket',totalCents:total,basePaidCents:0};
 shared.record('shop', {...input,receipt:{id:'one',amountCents:first,method:'cash'}});shared.record('shop',{...input,receipt:{id:'two',amountCents:second,method:'cash'}});
 shared.navigator.onLine=true;shared.fetch=async()=>({ok:true,json:async()=>({balances:[{...input,paidCents:first,pendingCents:0,receiptIds:['one']}]})});
 const rows=await shared.list('shop','');assert.equal(rows.length,total===first+second?0:1);if(rows.length)assert.equal(shared.due(rows[0]),total-first-second);shared.navigator.onLine=false;
}));
const delivery=world('boutique');
await strict('delivery collection replay creates one receipt, excluded yesterday and counted on collection day by header and Z',fc.property(positive,positive,(owed,requested)=>{
 const c=delivery.c,paid=Math.min(owed,requested);c.SALES=[{id:'delivery',syncId:'origin',at:new Date(TS-86400000),total:owed/100,parts:[{m:'livraison',amount:owed/100}],lines:[]}];
 const receipt={id:'collection',amountCents:paid,ts:TS};c.recordDeliveryCash(receipt,{saleId:'origin',ref:'delivery'});c.recordDeliveryCash(receipt,{saleId:'origin',ref:'delivery'});
 assert.equal(c.SALES.length,2);assert.equal(C(c.caToday()),paid);assert.equal(C(c.bqDayTotals().moneyIn),paid);assert.equal(sum(Array.from(c.bqZJournal('shop')).filter(r=>!r.voided).map(r=>C(r.amount))),paid);
}));
const network=vm.createContext({console,Math,Number,String,JSON,encodeURIComponent});
load(network,'assets/delivery-collect.js',['toCents','postCash']);
await strict('delivery collection input preserves centimes, and retries send identical amount and id',fc.asyncProperty(positive,async(value)=>{
 const raw=(value/100).toFixed(2).replace('.',',');assert.equal(network.toCents(raw),value);const requests=[];
 network.fetch=async(url,opts)=>{requests.push(JSON.parse(opts.body));return{ok:true,json:async()=>({sale:{id:'receipt',amountCents:value},dueCents:0})};};
 await network.postCash('shop',{saleId:'origin'},value,'same-id',{name:'Cashier'});await network.postCash('shop',{saleId:'origin'},value,'same-id',{name:'Cashier'});
 assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].amountCents,value);assert.equal(requests[0].id,'same-id');
}));
load(shared,'assets/retail-sale-hold.js',['create']);
await strict('sale hold preserves centimes, payment parts and id across rejected upload, replay and duplicate retries',fc.property(partsArb,parts=>{
 const payload={id:'stable',time:new Date(TS),amount:sum(parts.map(p=>p.cents))/100,paymentParts:parts.map(p=>({method:p.method,amountCents:p.cents}))};const sale={at:new Date(TS)},sales=[sale],received=new Map();let accept=false;
 shared.KiwiLive={merchant:()=> 'shop',isOn:()=>true,postSale:p=>{if(!accept)return{ok:false};received.set(p.id,JSON.parse(JSON.stringify(p)));return{ok:true,queued:true};}};
 const kit=shared.create({sales:()=>sales,slug:()=> 'shop',persist(){}});kit.post(sale,payload);assert.ok(sale.pendingPost);accept=true;assert.equal(kit.replay(),1);assert.equal(kit.replay(),0);assert.equal(received.size,1);assert.equal(C(received.get('stable').amount),C(payload.amount));assert.deepEqual(received.get('stable').paymentParts,payload.paymentParts);
}));
load(shared,'assets/repeat-sale-guard.js',['signature','read','remember','recent']);
vm.runInContext("var PREFIX='kiwi:lastCharge:',mem=Object.create(null),WINDOW_MS=120000;",shared);
await strict('repeat guard signature is order-independent and a repeat is scoped and time-bounded',fc.property(basket,positive,(rows,total)=>{
 store=new Map();const lines=rows.map((r,i)=>({pid:'p'+i,qty:r.qty,unit:r.price/100}));const sig=shared.signature(lines,total/100);assert.equal(sig,shared.signature([...lines].reverse(),total/100));
 shared.remember('scope-a',sig,'ticket',TS);assert.ok(shared.recent('scope-a',sig,TS+119999));assert.equal(shared.recent('scope-a',sig,TS+120000),null);assert.equal(shared.recent('scope-b',sig,TS),null);
}));
// Keep the real authority in the loop: the client only knows a cached balance.
const { ledger }=await import('./retail-money-ledger.mjs');
const db=await ledger(ROOT);
try {
 await strict('real credit authority caps multiple ticket spends and applies an identical redemption once',fc.asyncProperty(fc.integer({min:100,max:5_000_000}),fc.array(positive,{minLength:1,maxLength:6}),async(total,asks)=>{
   const original=db.sale(total),issue=await db.post({action:'issue',id:'issue:'+original,originalSaleId:original,amountCents:total,reason:'Retour'});assert.equal(issue.status,200);
   const code=issue.body.credit.code;let spent=0;
   for(const [i,amountCents]of asks.entries()){
     const body={action:'redeem-batch',id:'redeem:'+original+':'+i,saleId:'ticket-'+i,credits:[{code,amountCents}]};
     const result=await db.post(body),retry=await db.post(body);assert.equal(retry.status,result.status);
     if(amountCents<=total-spent){assert.equal(result.status,200);spent+=amountCents;const saved=retry.body.credits.find(c=>c.code===code);assert.equal(saved.balanceCents,total-spent);}
     else assert.equal(result.status,409);
     assert.equal(db.balance(code),total-spent);assert.ok(db.balance(code)>=0);
   }
 }));
} finally {db.close();}
console.log(`retail-money-properties: ${passed} strict passed, ${failed} strict failed, ${known} known failures; ${RUNS} runs/property; seed=${SEED}`);
if(failed)process.exitCode=1;
