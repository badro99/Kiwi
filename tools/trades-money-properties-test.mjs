#!/usr/bin/env node
import caisseWorkflowSource from './caisse-test-source.cjs';
// Real trade journal and pricing declarations; independent integer-centime oracles.
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import nativeFs from 'node:fs';
import queueCoreSource from './core-test-source.cjs';
const fs = { ...nativeFs, readFileSync: queueCoreSource.readFileSync };
import {validateRetailTenders,retailTenderMethod} from '../functions/api/_retail-tenders.js';
import {declaration as scan} from './js-declarations.cjs';
const declarations=new Map();
function declaration(text,name){let names=declarations.get(text);if(!names)declarations.set(text,names=new Map());if(names.has(name))return names.get(name);const re=new RegExp('(?:^|\\n)[ \\t]*(?:async\\s+)?(?:function\\s+'+name+'\\s*\\(|(?:const|let|var)\\s+'+name+'\\s*=)');const m=re.exec(text);if(!m)throw Error('Missing '+name);const result=scan(text.slice(m.index).trimStart(),name);names.set(name,result);return result;}


const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ skip fast-check unavailable (npm --prefix app ci), trades money properties not executed');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||300,SEED=process.env.KIWI_PROPERTY_SEED?Number(process.env.KIWI_PROPERTY_SEED):20261026;
let passed=0,failed=0,known=0;
async function strict(label,property,examples=[]){const r=await fc.check(property,{numRuns:RUNS,seed:SEED,examples});if(r.failed){failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance||r.error);}else{passed++;console.log('✓ '+label);}}
async function knownIssue(id,label,property,examples=[]){const r=await fc.check(property,{numRuns:RUNS,seed:SEED,examples});if(r.failed&&r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('✗ known property raised an unexpected error: '+id,r.errorInstance);return;}if(r.failed){known++;console.log(`◦ known ${id} · ${label}\n  shrunk: ${fc.stringify(r.counterexample)}; seed=${r.seed}; path=${r.counterexamplePath}`);}else {failed++;console.error('✗ '+id+' holds: promote to strict');}}

const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const C=x=>Math.round(x*100),sum=xs=>xs.reduce((a,b)=>a+b,0),money=fc.integer({min:1,max:5000000});
function load(file,names,extra={}){const c=vm.createContext({console,Math,Date,...extra});vm.runInContext(names.map(n=>declaration(read(file),n)).join('\n')+'\nObject.assign(globalThis,{'+names.join(',')+'});',c);return c;}
const source=read('assets/pos-sale.js');
const boot=vm.runInNewContext(declaration(read('tools/pos-sale-hold-test.mjs'),'boot').replace('return { api:', 'return { window, api:')+';boot',{source,vm,console,Date,Map,Set,Uint8Array});
const saleIdentityWindow={};vm.runInNewContext(read('assets/live-link/sale-identity.js'),{window:saleIdentityWindow});
const wire=load('assets/live-link.js',['stableId','serverSession','postSale'],{window:saleIdentityWindow,on:()=>true,merchant:()=> 'shop',tenantHold:()=>null,stableId:(_m,e)=>e.ref,serverSession:()=>'',enqueueMoneyBody:body=>body});
const journal=boot();
function reset(t=journal){t.rows.clear();t.rows.set('kiwiPairedVenue',JSON.stringify({merchant:'amira-snack'}));t.rows.set('kiwi:posDevice','A7');t.posted.length=0;delete t.window.KiwiInventoryConsumption;return t;}
let retryCalls=0;
const retryJournal=boot({answer:()=>++retryCalls===1?{ok:false}:{ok:true,queued:true,id:'fixed'}});
const fold=journal.api.foldLines || (rows=>rows.slice(0,40));
wire.window={...saleIdentityWindow,KiwiPosSale:{foldLines:fold}};
const lines=fc.array(fc.integer({min:1,max:80000}),{minLength:1,maxLength:60});
await strict('shared journal and outgoing mirror retain every cent with 1..60 lines',fc.property(lines,amounts=>{
 const t=reset(),stock=[];t.window.KiwiInventoryConsumption={record:entry=>stock.push(entry)};const total=sum(amounts),ls=amounts.map((n,i)=>({name:'Article '+i,qty:1,total:n/100}));
 const entry=t.api.record('epicerie',{total:total/100,method:'cash',ref:'T',lines:ls});
 assert.equal(stock[0].lines.length,amounts.length);assert.equal(sum(stock[0].lines.map(l=>C(l.total))),total);assert.equal(C(entry.total),total);assert.equal(sum(entry.lines.map(l=>C(l.total))),total);assert.equal(entry.lines.length,amounts.length);assert.ok(t.posted[0].lines.length<=40);assert.equal(sum(t.posted[0].lines.map(l=>C(l.total))),total);
}),[[Array(41).fill(1)]]);
await strict('folding is immutable, identity for small baskets and preserves centimes',fc.property(lines,amounts=>{
 const ls=amounts.map((n,i)=>({name:'Article '+i,qty:1,total:n/100})),before=JSON.stringify(ls),out=fold(ls);assert.equal(sum(out.map(l=>C(l.total))),sum(amounts));assert.equal(JSON.stringify(ls),before);if(ls.length<=40)assert.equal(out,ls);else assert.equal(out.length,40);
}));
await strict('refused journal sale retries once with its original identity and cents',fc.property(money,amount=>{
 retryCalls=0;const t=reset(retryJournal);t.api.record('gym',{total:amount/100,method:'card',ref:'R'});assert.equal(t.held().length,1);t.timers.forEach(f=>f());t.intervals.forEach(f=>f());assert.equal(t.held().length,0);assert.equal(t.posted.length,2);assert.equal(t.posted[0].ref,t.posted[1].ref);assert.equal(wire.postSale(t.posted[0]).id,wire.postSale(t.posted[1]).id);assert.equal(C(t.posted[1].amount),amount);
}));
const pizza=load('assets/pos-pizzeria.js',['linePrice','orderTotal','orderDue'],{zoneOf:()=>({fee:0})});
const fast=load('assets/pos-fastfood.js',['unitPrice','lineTotal','orderTotal','saleLines'],{ITEM:{}});
const spa=load('assets/pos-spa.js',['ticketTotal']);
await strict('pizzeria fastfood and spa quantity baskets equal integer line oracle',fc.property(fc.array(fc.record({c:money,q:fc.integer({min:1,max:10})}),{maxLength:60}),rows=>{
 const ls=rows.map(r=>({unit:r.c/100,price:r.c/100,qty:r.q})),expected=sum(rows.map(r=>r.c*r.q));assert.equal(C(pizza.orderTotal({lines:ls}).total),expected);assert.equal(C(fast.orderTotal({lines:ls})),expected);assert.equal(C(spa.ticketTotal({lines:ls})),expected);
}));
const epi=load('assets/pos-epicerie.js',['r2',...(read('assets/pos-epicerie.js').includes('function weighedTotal')?['weighedTotal']:[]),'lineTotal','ticketTotal'],{ITEMS:{a:{price:0}}});
await strict('epicerie weighed unit screen and basket round to the same centime',fc.property(money,fc.integer({min:1,max:100000}),(price,grams)=>{epi.ITEMS.a.price=price/100;const line={itemId:'a',weight:grams/1000},want=Math.round(price*grams/1000+1e-9);assert.equal(C(epi.lineTotal(line)),want);assert.equal(C(epi.ticketTotal({lines:[line]})),want);if(want>0){const t=reset();t.api.record('epicerie',{total:want/100,method:'cash',ref:'P',lines:[{name:'Poids',qty:line.weight,total:epi.lineTotal(line)}]});const out=wire.postSale(t.posted[0]);assert.equal(out.amountCents,want);assert.equal(C(out.lines[0].t),want);}}),[[145,700]]);
const gym=load('assets/pos-gym.js',['planPrice','memberPrice'],{PLAN:{a:{price:0}},STUDENT_OFF:0,pvReal:()=>true});
await strict('real gym membership price stays in ticket and preserves custom paid price',fc.property(money,fc.boolean(),(price,student)=>{gym.PLAN.a.price=price/100;assert.equal(C(gym.planPrice('a',student)),price);assert.equal(C(gym.memberPrice({plan:'a',student,paid:price/100})),price);}));
const ph=load('assets/pos-pharmacie.js',['r2','ticketMut','lineCovered','lineSplit','ticketSplit'],{ITEMS:{a:{price:0,remb:true}},state:{ticket:{patient:{mut:'a'},lines:[]}},mutOf:()=>({rate:0}),MUTUELLES:{sans:{rate:0}}});
await strict('pharmacie patient plus insurer equals ticket and neither exceeds it',fc.property(money,fc.integer({min:1,max:60}),fc.constantFrom(0,70,80),(price,q,pct)=>{ph.ITEMS.a.price=price/100;ph.mutOf=()=>({rate:pct/100});const s=ph.lineSplit({itemId:'a',qty:q}),gross=price*q,mut=Math.round(gross*pct/100+1e-9);assert.equal(C(s.gross),gross);assert.equal(C(s.mut),mut);assert.equal(C(s.pat),gross-mut);assert.ok(s.pat>=0&&s.mut>=0&&C(s.mut)<=gross);}),[[5,1,70],[2214750,29,70]]);
const tr=load('assets/pos-traiteur.js',['perPerson','evTotals','termsOf','buildTranches','paidTotal','dueTotal'],{DEFAULT_TERMS:{c:30,j7:50,valid:7,off:7},DAY:86400000,dishOf:ev=>({price:ev.price}),extraCost:()=>0});
await strict('traiteur tranche schedule conserves quote and paid debt never becomes negative',fc.property(money,fc.integer({min:1,max:100}),fc.boolean(),(price,guests,paid)=>{const ev={menu:['a'],price:price/100,guests,extras:[],date:new Date(),tranches:[]};ev.tranches=tr.buildTranches(ev);assert.equal(sum(ev.tranches.map(x=>C(x.amount))),price*guests);assert.ok(ev.tranches.every(x=>x.amount>=0));if(paid)ev.tranches.forEach(x=>x.paid=true);assert.equal(C(tr.dueTotal(ev)),paid?0:price*guests);}),[[19,9,false]]);
const bread=load('assets/pos-boulangerie.js',['effPrice','tkTotal'],{state:{lastHour:true,ticket:[]},LH_PCT:30,PROD:{}});
await strict('boulangerie last-hour markdown follows declared floor-to-cent policy',fc.property(money,fc.integer({min:0,max:100}),(price,pct)=>{bread.LH_PCT=pct;assert.equal(C(bread.effPrice({price:price/100})),Math.floor(price*(100-pct)/100+1e-6));}));
// Restaurant harness edges are shared with the existing money suite; functions stay real.
const cs=caisseWorkflowSource.liveSource(),h=read('tools/caisse-money-properties-test.mjs');
const selected=vm.runInNewContext(declaration(h,'selected')+';selected');
const context=vm.runInNewContext(declaration(h,'context')+';context',{vm,declaration,caisseWorkflowSource,source:cs,selected,TS:Date.parse('2026-10-22T12:00Z'),Clock:Date,console});
const restaurantPosted=[],restaurant=context({KiwiPosSale:{foldLines:fold},KiwiLive:{postSale:p=>{restaurantPosted.push(p);return {ok:true,queued:true,id:'sale'};}}});
await strict('restaurant mirror folds 41..60 lines without changing full receipt or ticket',fc.property(fc.array(fc.integer({min:1,max:10000}),{minLength:41,maxLength:60}),amounts=>{const posted=restaurantPosted,t=restaurant;posted.length=0;t.c.journal=[];t.c.recordSale(sum(amounts)/100,'cash','Ticket',0,amounts.map((n,i)=>({name:'Plat '+i,qty:1,price:n/100,total:n/100})));assert.equal(posted.length,1);assert.ok(posted[0].lines.length<=40);assert.equal(sum(posted[0].lines.map(l=>C(l.total))),sum(amounts));assert.equal(C(posted[0].amount),sum(amounts));}),[[Array(41).fill(1)]]);
const sc=context().c;
await strict('split tender allocation conserves ticket cents for up to twelve parts',fc.property(money,fc.integer({min:1,max:12}),(amount,n)=>assert.equal(sum(Array.from(sc.shareMoney(amount/100,n),C)),amount)));
await strict('refundable remainder equals paid net of earlier confirmed refunds',fc.property(money,money,(paid,asked)=>{sc.journal=[{id:'original',amount:paid/100,method:'cash',time:new Date()}];const original=sc.journal[0];original.refundedAmount=(asked%(paid+1))/100;const result=sc.refundableLeft(original);assert.equal(C(result),paid-asked%(paid+1));}));

await strict('actual wire preserves displayed cents, split parts, discount facts and tips outside revenue',fc.property(lines,fc.integer({min:0,max:100}),fc.nat(),(amounts,pct,n)=>{
 const gross=sum(amounts),discount=Math.round(gross*pct/100+1e-9),net=gross-discount;if(!net)return;
 const parts=Array.from(sc.shareMoney(net/100,1+n%8),amount=>({method:'cash',amountCents:C(amount)})).filter(p=>p.amountCents>0);
 const out=wire.postSale({amountCents:net,amount:net/100,method:retailTenderMethod(parts),ticketAmountCents:net,ref:'sale',tip:Math.min(n,net)/100,paymentParts:parts,grossAmountCents:gross,discountAmountCents:discount,discountReason:'commercial',actorId:'staff',lines:fold([{name:'Article',qty:1,total:net/100}])});
 assert.ok(validateRetailTenders(out.paymentParts,out.amountCents,out.ticketAmountCents));assert.equal(out.method,retailTenderMethod(out.paymentParts));assert.equal(out.amountCents,net);assert.equal(sum(out.paymentParts.map(p=>p.amountCents)),net);assert.equal(sum(out.lines.map(l=>C(l.t))),net);assert.equal(out.tipCents||0,Math.min(n,net));assert.equal(out.grossAmountCents-out.discountAmountCents,net);
}));
const cf=load('assets/pos-coiffure.js',['lineUnit','ticketTotal','passTotal'],{ITEMS:{a:{price:0}},ADDON:{x:{price:0}},priceOf:item=>item.price});
await strict('coiffure passage and ticket include each service and addon once',fc.property(money,money,fc.integer({min:1,max:60}),(price,addon,n)=>{cf.ITEMS.a.price=price/100;cf.ADDON.x.price=addon/100;const p={lines:Array.from({length:n},()=>({itemId:'a',addons:['x']}))};assert.equal(C(cf.passTotal(p)),n*(price+addon));assert.equal(C(cf.ticketTotal(p)),n*(price+addon));}));
const lib=load('assets/pos-librairie.js',['cartSub','cartRemise','cartTotal','saleLines'],{ITEM:{a:{price:0}},CUST:{a:{points:1000}},FID_RATE:.05,fidTier:()=>true});
await strict('librairie declared whole-MAD loyalty amount is subtracted exactly once',fc.property(money,fc.integer({min:1,max:60}),(price,q)=>{lib.ITEM.a.price=price/100;const cart={lines:[{key:'a',qty:q}],client:{type:'known',id:'a'}},gross=price*q,remise=Math.round(gross*5/10000+1e-9)*100;assert.equal(C(lib.cartTotal(cart)),gross-remise);}));
await knownIssue('TM-P1','librairie loyalty rounds to whole MAD rather than the nearest centime',fc.property(fc.integer({min:1,max:10000}),price=>{lib.ITEM.a.price=price/100;return C(lib.cartRemise({lines:[{key:'a',qty:1}],client:{type:'known',id:'a'}}))===Math.round(price*5/100+1e-9);}),[[10]]);
// Confirm every shared-journal caller uses the same entry point, not an invented roster.
const callers=['pressing','spa','hotel','fastfood','boulangerie','pizzeria','traiteur','foodtruck','epicerie','pharmacie','librairie','fleuriste','coiffure','gym','autre'];
const tradeWorlds=new Map();
for(const trade of callers){
 const captured=[],window={KiwiPosSale:{nextSeq:()=>1,stamp:r=>r,record:(...args)=>{captured.push(args);return {};}}};
 const c=trade==='autre'
  ?load('assets/pos-autre.js',['roundMoney','total','checkout'],{cart:[],render:()=>{},window})
  :load(trade==='pressing'?'assets/pressing-caisse.js':`assets/pos-${trade}.js`,['postDay'],{window,pvReal:()=>true,root:{},state:{},IS_REAL:true});
 tradeWorlds.set(trade,{captured,c});
}
await strict('all fifteen trade wrappers mirror the exact ticket and lines into the shared journal',fc.property(fc.constantFrom(...callers),money,(trade,amount)=>{
 const {captured,c}=tradeWorlds.get(trade);captured.length=0;
 if(trade==='autre'){c.cart=[{name:'Article',price:amount/100}];c.checkout('cash');}
 else c.postDay(amount/100,'cash','Article','T',[{name:'Article',qty:1,total:amount/100}]);
 assert.equal(captured.length,1);assert.equal(captured[0][0],trade);assert.equal(C(captured[0][1].total),amount);assert.equal(C(captured[0][1].lines[0].total),amount);
}));

const fl=load('assets/pos-fleuriste.js',['unitPrice','bqStemsTotal','bqPresetsTotal','bqTotals','allocateLines'],{STEM:{a:{price:0}},saleActive:()=>true,pvReal:()=>true,SALE_RATE:.3,B2B_REMISE:.15,PRESET:{},WRAP:{a:{price:0}},CUST:{a:{b2b:true}}});
await strict('fleuriste promotion and business discount use independent integer percentages',fc.property(money,fc.integer({min:1,max:60}),(price,q)=>{fl.STEM.a.price=price/100;const unit=Math.round(price*70/100+1e-9),s=fl.bqTotals({stems:{a:q},presets:[],wrap:'a',customer:{type:'known',id:'a'}}),gross=unit*q;assert.equal(C(fl.unitPrice('a')),unit);assert.equal(C(s.remise),Math.round(gross*15/100+1e-9));assert.equal(C(s.total),gross-Math.round(gross*15/100+1e-9));}),[[145,1]]);

await strict('cash change never negative or greater than cash received',fc.property(money,money,(amount,given)=>{const t=restaurant;t.c.currentTotal=()=>amount/100;t.c.payTipCustom=0;t.c.cashInput={value:(given/100).toFixed(2)};t.c.cashRendu=t.$('rendu');t.c.cashRenduVal=t.$('val');t.c.cashConfirm={};t.c.updateRendu();assert.equal(t.c.cashConfirm.disabled,given<amount);if(given>=amount){const change=Number(t.c.cashRenduVal.textContent.replace(' MAD','').replace(',','.'));assert.equal(C(change),given-amount);assert.ok(change>=0&&C(change)<=given);}}));

const tipSpa=load('assets/pos-spa.js',['saleLines','postDay'],{PRESTA:{a:{id:'a',name:'Soin',cat:'spa'}},PROD:{},window:{}});
await knownIssue('TM-P2','service tips are revenue lines instead of separate tipCents',fc.property(fc.integer({min:1,max:50000}).map(n=>n*100),tip=>{const t=reset();tipSpa.window.KiwiPosSale=t.api;const lines=tipSpa.saleLines({lines:[{type:'svc',refId:'a',prId:'p',price:10,qty:1}]},tip/100);tipSpa.postDay(10+tip/100,'cash','Soin','T',lines);const out=wire.postSale(t.posted[0]);return out.amountCents===1000&&out.tipCents===tip;}),[[100]]);

const truck=load('assets/pos-foodtruck.js',['nameOf','unitOf','ticketTotal','orderLines'],{ITEM:{a:{label:'Article',price:0}},state:{ticket:{lines:[]}}});
await strict('foodtruck screen and wire-ready lines agree for instant prices and quantities',fc.property(lines,amounts=>{truck.state.ticket.lines=amounts.map(n=>({id:'a',price:n/100,qty:2}));assert.equal(C(truck.ticketTotal()),sum(amounts)*2);assert.equal(sum(truck.orderLines(truck.state.ticket.lines).map(l=>C(l.total))),sum(amounts)*2);}));
const pressing=load('assets/pressing-caisse.js',['B2B_REMISE','lineUnit','lineTotal','orderTotals','saleLines'],{ITEMS:{},priceTable:()=>({}),nameOf:()=> 'Article'});
await strict('pressing declared discount policy subtracts once from garment quantities',fc.property(money,fc.integer({min:1,max:60}),(price,q)=>{const o={lines:[{unitPrice:price/100,qty:q}],b2b:true},sub=price*q;assert.equal(C(pressing.orderTotals(o).total),sub-Math.round(sub*15/10000+1e-9)*100);}));
const hotel=load('assets/pos-hotel.js',['stayTotals'],{stayRate:s=>s.rate,chargeAmt:c=>c.amount,TPT:2});
await strict('hotel nights taxes extras payments and remaining debt reconcile',fc.property(money,fc.integer({min:1,max:60}),money,(rate,n,paid)=>{const st={rate:rate/100,nights:n,adults:2,charges:[{amount:1.25}],payments:[{amount:paid/100}]},total=rate*n+400*n+125,s=hotel.stayTotals(st);assert.equal(C(s.total),total);assert.equal(C(s.due),Math.max(0,total-paid));}));
await strict('a scan-till sale with a credit-book part never carries tender detail the server would refuse',fc.property(fc.array(fc.record({cents:fc.integer({min:1,max:50000}),method:fc.constantFrom('cash','card','credit')}),{minLength:1,maxLength:4}),parts=>{const t=reset(),total=sum(parts.map(p=>p.cents));t.api.record('autre',{total:total/100,method:parts.length>1?'split':parts[0].method,ref:'K',parts:parts.map(p=>({method:p.method,amount:p.cents/100}))});const out=wire.postSale(t.posted[0]);if(out.paymentParts){assert.ok(validateRetailTenders(out.paymentParts,out.amountCents,out.ticketAmountCents),'server would refuse');assert.equal(out.method,retailTenderMethod(out.paymentParts));}if(parts.some(p=>p.method==='credit'))assert.equal(out.paymentParts,undefined);}),[[[{cents:500,method:'cash'},{cents:300,method:'credit'}]],[[{cents:800,method:'credit'}]]]);
await strict('shared journal split parts survive the actual wire serializer',fc.property(fc.array(fc.integer({min:1,max:50000}),{minLength:1,maxLength:8}),amounts=>{const t=reset(),total=sum(amounts);t.api.record('autre',{total:total/100,method:amounts.length===1?'cash':'split',ref:'S',parts:amounts.map((n,i)=>({method:i%2?'card':'cash',amount:n/100}))});const out=wire.postSale(t.posted[0]);assert.equal(sum(out.paymentParts.map(p=>p.amountCents)),total);assert.equal(out.ticketAmountCents,total);assert.ok(validateRetailTenders(out.paymentParts,out.amountCents,out.ticketAmountCents));assert.equal(out.method,retailTenderMethod(out.paymentParts));}));


await strict('custom traiteur terms allocate whole-dirham deposits and an exact nonnegative residual',fc.property(money,fc.integer({min:1,max:98}),fc.nat(),(price,c,n)=>{const j7=1+n%(99-c),ev={menu:['a'],price:price/100,guests:1,extras:[],date:new Date(),terms:{c,j7,valid:7,off:7}};const parts=tr.buildTranches(ev),one=Math.min(price,Math.round(price*c/10000+1e-9)*100),two=Math.min(price-one,Math.round(price*j7/10000+1e-9)*100);assert.deepEqual(Array.from(parts,x=>C(x.amount)),[one,two,price-one-two]);}),[[19,30,49],[187500,30,50]]);


await strict('raw restaurant journal replay is folded at the actual wire boundary too',fc.property(lines,amounts=>{const total=sum(amounts),out=wire.postSale({amount:total/100,ref:'held',lines:amounts.map((n,i)=>({name:'Plat '+i,qty:1,total:n/100}))});assert.ok(out.lines.length<=40);assert.equal(sum(out.lines.map(l=>C(l.t))),total);}),[[Array(41).fill(1)]]);


await strict('partial collections and discount line allocations never invent cents before the final line',fc.property(fc.integer({min:4,max:60}),fc.integer({min:1,max:10000}),fc.nat(),(n,price,seed)=>{const received=1+seed%(n*price),cart={lines:Array.from({length:n},()=>({key:'a',qty:1}))};lib.ITEM.a.price=price/100;const order={lines:Array.from({length:n},()=>({unit:price/100,unitPrice:price/100,qty:1,services:[]})),b2b:false};const sets=[lib.saleLines(cart,received/100),pressing.saleLines(order,received/100),fl.allocateLines(Array.from({length:n},()=>({id:'a',base:price/100,qty:1})),received/100),fast.saleLines(order,received/100)];for(const rows of sets){assert.equal(sum(rows.map(r=>C(r.total))),received);assert.ok(rows.every(r=>r.total>=0));const t=reset();t.api.record('autre',{total:received/100,method:'cash',ref:'P',lines:rows});const out=wire.postSale(t.posted[0]);assert.equal(sum(out.lines.map(l=>C(l.t))),received);}}),[[4,100,1]]);

console.log(`trades-money-properties: ${passed} strict passed, ${failed} strict failed, ${known} known failures; ${RUNS} runs/property; seed=${SEED}`);if(failed)process.exitCode=1;
