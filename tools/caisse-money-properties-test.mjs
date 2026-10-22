#!/usr/bin/env node
/* Real restaurant accounting functions; integer-centime oracles, no browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ROOT = process.env.KIWI_ROOT || path.resolve(import.meta.dirname, '..');
let fc;
try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); }
catch { console.log('○ skip fast-check unavailable (npm --prefix app ci), caisse money properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300;
const SEED = process.env.KIWI_PROPERTY_SEED ? Number(process.env.KIWI_PROPERTY_SEED) : 20261022;
const options = extra => ({ numRuns: RUNS, seed: SEED, ...extra });
let passed = 0, failed = 0, known = 0;
async function strict(label, property) {
  const result = await fc.check(property, options());
  if (result.failed) { failed++; console.error('✗ ' + label, fc.stringify(result.counterexample), result.errorInstance || result.error); }
  else { passed++; console.log('✓ ' + label); }
}
async function knownIssue(id, label, property, examples) {
  const result = await fc.check(property, options({ examples }));
  if (result.failed && result.errorInstance?.message !== 'Property failed by returning false') {
    failed++; console.error('✗ known property raised an unexpected error: ' + id, result.errorInstance); return;
  }
  if (result.failed) {
    known++; console.log(`◦ known ${id} · ${label}\n  shrunk: ${fc.stringify(result.counterexample)}; seed=${result.seed}; path=${result.counterexamplePath}`);
  } else console.log(`! known ${id} holds now: promote to strict in tools/caisse-money-properties-test.mjs`);
}
// The split manifest gives exact declaration boundaries, including template literals.
// Read current production fragments, never the frozen reference or copied math.
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/caisse-app/split.json'), 'utf8'));
const texts = new Map([map.prelude, map.core].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
const offsets = new Map(), functions = new Map(), statements = [];
for (const fragment of map.fragments) {
  const offset = offsets.get(fragment.file) || 0, length = fragment.end - fragment.start;
  const source = texts.get(fragment.file).slice(offset, offset + length);
  offsets.set(fragment.file, offset + length); statements.push(source);
  if (fragment.kind === 'FunctionDeclaration') functions.set(fragment.name, source);
}
for (const [file, text] of texts) assert.equal(offsets.get(file) + (file === map.prelude ? 1 : 0), text.length, 'update split map after source edits');
const cents = mad => Math.round(mad * 100);
const add = rows => rows.reduce((a,b) => a+b, 0);
const MAX = 5_000_000;
const amount = fc.integer({ min: 0, max: MAX });
const positive = fc.integer({ min: 1, max: MAX });
const nParts = fc.integer({ min: 1, max: 12 });
const weights = fc.array(fc.integer({ min: 0, max: MAX }), { minLength: 1, maxLength: 12 });
const lineArb = fc.record({ priceC: fc.integer({ min: 0, max: 16666 }), qty: fc.integer({ min: 1, max: 5 }) });
const linesArb = fc.array(lineArb, { minLength: 1, maxLength: 60 }).map(rows => rows.map((r,i) => ({ name: 'Dish ' + i, qty:r.qty, price:r.priceC/100, total:r.priceC*r.qty/100 })));
const rowArb = fc.record({ amountC: amount, tipC: amount, cash: fc.boolean(), refund: fc.boolean(), voided: fc.boolean(), rejected: fc.boolean(), handed: fc.boolean(), time: fc.integer({ min: 0, max: 120 }) }).map(r=>({...r,tipC:r.refund?0:Math.min(r.tipC,r.amountC)}));
const ledgerArb = fc.array(rowArb, { maxLength: 60 });
const movementArb = fc.array(fc.record({ amountC: amount, input: fc.boolean(), time: fc.integer({ min: 0, max: 120 }) }), { maxLength: 30 });
const TS = Date.parse('2026-10-22T12:00:00Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [TS])); }
  static now() { return TS; }
  static [Symbol.hasInstance](value) { return value instanceof Date; }
}
function rowsOf(rows) { return rows.map((r,i) => ({ id:'s'+i,ref:'r'+i,time:new Date(TS+r.time*1000),amount:(r.refund?-r.amountC:r.amountC)/100,method:r.cash?'cash':'card',tip:r.refund?0:r.tipC/100,kind:r.refund?'refund':'sale',voided:r.voided,refundSyncStatus:r.rejected?'rejected':'confirmed',cashHandedOut:r.handed })); }
function movesOf(rows) { return rows.map(r=>({amount:r.amountC/100,type:r.input?'in':'out',time:new Date(TS+r.time*1000)})); }
const selected = ['recordSale','markSplitPartPaid','genRef','cashSessionId','cashTerminalId','shareMoney','shareWeighted','payTipPct','payTipAmount','updateRendu','vrapDiscountAmount','discountAmountFor',
  'activeSaleDiscount','discountReasonCode','accountActiveDiscount','refundedSoFar','refundableLeft','clampRefundAmount','confirmRefund','updateEcart','updateCardEcart',
  'refundOriginalFor','applyAcceptedRefund','markRejectedRefund','refundHasCashException','isReportableJournalEntry','rollupLedger','journalTotals','posteRollup','drawerExpected','handoverGapCents',
  'renderReceipt','cloudSaleJournalEntry','receiptSaleFrom','dayReportSession','currentBusinessDay','buildDayReport','splitArticleAllocation','effectiveTipPct','launchSplitFlow',
  'reconcileVoids','refreshOpenReconciliationModals'];
function context(extra = {}) {
  const nodes = new Map(), timers = [];
  const $ = s => { if(!nodes.has(s)) nodes.set(s,{ value:'',textContent:'',hidden:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false} }); return nodes.get(s); };
  const c = vm.createContext({ console, Math, Number, Date:Clock, Intl, Map, Set, String, Array, Object, JSON,
    $, $$:()=>[], addEventListener(){},dispatchEvent(){}, localStorage:{getItem:()=>null,setItem(){}}, document:{querySelectorAll:()=>[],addEventListener(){}}, lucide:{createIcons(){}}, journal:[],cashMovements:[],handovers:[],openingFloat:0,
    splitState:{}, splitPayCallback:null, payTipMode:'0',payTipCustom:0, mode:'salle',vrapEditingNum:null,kdsOrders:[],selectedId:'T1',tables:{T1:{}},cart:[],vrapDiscount:null,
    shift:{discounts:0,discountsCount:0,cancels:0,refunds:0},currentCashier:{id:'c',name:'Test'},shiftOpenedAt:new Date(TS),shiftOpenedBy:'Test',cashSessionKey:'session',terminalCardTotal:null,
    generateOrder:()=>[], currentTotal:()=>0, currentMerchantSlug:()=> 'property-test',storeIsReal:()=>true,storePaired:()=>null,storeName:()=> 'Test',storeCity:()=> '',
    receiptDocFor:()=>null,escTeam:value=>String(value||''),openCashDrawer(){},printSaleTicket(){},settleVrapPayment(){},markPaid(){},attachReceipt(){},closeRefund(){},showRefundStep(){},requireManager(_label,approve){approve();},renderSplitFlow(){},lineCat:()=> 'Food',phoneSessionOf:()=>'',toast(){},persistShift(){},renderShiftStats(){},saveProvisional(){},renderJournal(){},renderVrapBoard(){},renderSalle(){},
    setTimeout:fn=>{timers.push(fn);return 1;}, clearTimeout(){}, ...extra });
  c.window = c;
  for(const name of ['money','minor','major','fmtMAD','fmtMADcents']) {
    const statement = statements.find(s=>new RegExp('\\bconst '+name+'\\s*=').test(s)); assert.ok(statement,name); vm.runInContext(statement,c);
  }
  vm.runInContext(selected.map(name=>{assert.ok(functions.has(name),name);return functions.get(name);}).join('\n'),c);
  return { c, nodes, timers, $ };
}
const { c } = context();
await strict('equal tenders conserve cents, differ by <=1 cent, and are nonnegative',fc.property(amount,nParts,(total,n)=>{
  const parts=Array.from(c.shareMoney(total/100,n),cents); assert.equal(add(parts),total);assert.equal(parts.length,n);assert.ok(Math.max(...parts)-Math.min(...parts)<=1);assert.ok(parts.every(x=>x>=0));
}));
await strict('weighted tenders conserve cents and respect floor/ceil quotas',fc.property(amount,weights,(total,w)=>{
  const parts=Array.from(c.shareWeighted(total/100,w),cents);assert.equal(add(parts),total);assert.ok(parts.every(x=>x>=0));const sum=add(w);
  if(sum)parts.forEach((p,i)=>{assert.ok(p>=Math.floor(total*w[i]/sum)&&p<=Math.ceil(total*w[i]/sum));if(!w[i])assert.equal(p,0);});
}));
await strict('regular tips stay outside the ticket and split callback suppresses double tipping',fc.property(amount,fc.integer({min:0,max:100}),(base,pct)=>{
  c.currentTotal=()=>base/100;c.payTipMode='autre';c.payTipCustom=pct;c.splitPayCallback=null;
  assert.ok(c.payTipAmount()>=0&&c.payTipAmount()<=base/100);assert.equal(c.currentTotal(),base/100);
  c.splitPayCallback=()=>{};assert.equal(c.payTipAmount(),0);c.splitPayCallback=null;
}));
await strict('cash change is given minus base/tip and insufficient cash cannot confirm',fc.property(amount,amount,amount,(base,tip,given)=>{
  const t=context({currentTotal:()=>base/100,payTipCustom:0});t.c.payTipAmount=()=>tip/100;
  t.c.cashInput={value:(given/100).toFixed(2).replace('.',',')};t.c.cashRendu=t.$('rendu');t.c.cashRenduVal=t.$('val');t.c.cashConfirm={};t.c.updateRendu();
  assert.equal(t.c.cashConfirm.disabled,given<base+tip);
  if(given>=base+tip){const change=Number(t.c.cashRenduVal.textContent.replace(' MAD','').replace(',','.'));assert.equal(cents(change),given-base-tip);assert.ok(change>=0&&cents(change)<=given);}
}));
await strict('table and takeaway discounts are bounded, rounded and agree',fc.property(amount,fc.integer({min:0,max:200}),amount,fc.boolean(),(gross,pct,fixed,percent)=>{
  const d={kind:percent?'pct':'amount',value:percent?pct:fixed/100};c.tables={T1:{discount:d}};c.vrapDiscount=d;
  const expected=Math.min(gross,percent?Math.round(gross*pct/100):fixed);
  assert.equal(cents(c.discountAmountFor('T1',gross/100)),expected);assert.equal(cents(c.vrapDiscountAmount(gross/100)),expected);
}));
await strict('discount metadata reconciles up to 60 lines with net ticket cents',fc.property(linesArb,fc.integer({min:0,max:100}),(lines,pct)=>{
  const gross=add(lines.map(l=>cents(l.total))),cut=Math.round(gross*pct/100);c.mode='salle';c.tables={T1:{discount:{kind:'pct',value:pct}}};
  const d=c.activeSaleDiscount((gross-cut)/100,lines,'T1');if(!cut||!gross)assert.equal(d,null);else{assert.equal(d.grossAmountCents,gross);assert.equal(d.discountAmountCents,cut);}
}));
await strict('approved discount hits shift counters exactly once',fc.property(positive,(cut)=>{
  c.mode='vrap';c.cart=[];c.vrapDiscount={kind:'amount',value:cut/100,accounted:false};c.shift={discounts:0,discountsCount:0};
  c.accountActiveDiscount('',{discountAmountCents:cut});c.accountActiveDiscount('',{discountAmountCents:cut});assert.equal(cents(c.shift.discounts),cut);assert.equal(c.shift.discountsCount,1);
}));
await strict('refund availability never negative and paid = refunded + remaining',fc.property(amount,amount,(paid,refund)=>{
  const used=Math.min(paid,refund),row={amount:paid/100,refundedAmount:used/100};assert.equal(cents(c.refundableLeft(row)),paid-used);assert.equal(cents(c.refundedSoFar(row)),used);assert.equal(c.refundableLeft({amount:paid/100,refunded:true}),0);
}));
await strict('refund input clamp stays inside positive remaining balance',fc.property(positive,amount,amount,(remaining,used,requested)=>{
  const t=context({refundState:{orig:{amount:(remaining+used)/100,refundedAmount:used/100}}});t.$('#rf-amount').value=(requested/100).toFixed(2);t.c.clampRefundAmount();assert.equal(cents(t.c.refundState.amount),Math.max(1,Math.min(remaining,requested)));
}));
await strict('manager-approved refund never exceeds paid or remaining, including exhausted tickets',fc.property(positive,amount,amount,(paid,prior,requested)=>{
  const used=Math.min(paid,prior),orig={id:'original',ref:'ref',label:'Table',method:'cash',amount:paid/100,refundedAmount:used/100};
  const t=context({refundState:{orig,reason:'Return'},journal:[]});t.$('#rf-amount').value=(requested/100).toFixed(2);t.c.confirmRefund();
  if(used===paid){assert.equal(t.c.journal.length,0);return;}
  const entry=t.c.journal[0];assert.ok(entry&&entry.kind==='refund');const issued=-cents(entry.amount);
  assert.ok(issued>0&&issued<=paid-used);assert.equal(cents(orig.refundedAmount),used+issued);assert.ok(cents(orig.refundedAmount)<=paid);
}));
await strict('refund rejection/re-acceptance is idempotent and preserves physical cash exceptions',fc.property(positive,amount,fc.boolean(),(paid,rawRefund,handed)=>{
  const refund=Math.min(paid,rawRefund),orig={id:'original',amount:paid/100,method:'cash',refundedAmount:refund/100};
  const entry={id:'refund',kind:'refund',refundOfId:'original',amount:-refund/100,method:'cash',cashHandedOut:handed};
  const t=context({journal:[orig,entry],shift:{refunds:refund/100}});t.c.markRejectedRefund(entry,409);t.c.markRejectedRefund(entry,409);
  assert.equal(cents(orig.refundedAmount),handed?refund:0);assert.equal(t.c.journalTotals().revenueC,paid-(handed?refund:0));
  entry.refundSyncStatus='accepted';t.c.applyAcceptedRefund(entry);t.c.applyAcceptedRefund(entry);assert.equal(cents(orig.refundedAmount),refund);assert.equal(cents(t.c.shift.refunds),refund);assert.equal(t.c.journalTotals().revenueC,paid-refund);
}));
await strict('cash and card counted-versus-expected UI gaps preserve every centime and sign',fc.property(amount,amount,(expected,counted)=>{
  const t=context({clotureExpected:expected/100,clotureCardExpected:expected/100});t.$('#clo-count').value=(counted/100).toFixed(2);t.$('#clo-card-z').value=(counted/100).toFixed(2);
  t.c.updateEcart();t.c.updateCardEcart();const gap=counted-expected;
  const parse=text=>cents(Number(text.replace('−','-').replace(/[^0-9.,+-]/g,'').replace(',','.')));
  assert.equal(parse(t.$('#clo-ecart').textContent),gap);
  const card=t.$('#clo-card-ecart').textContent;assert.equal(Math.abs(parse(card)),Math.abs(gap));
  if(gap)assert.ok(card.startsWith(gap>0?'Terminal +':'Kiwi +'));else assert.ok(card.startsWith('Rapproché'));
}));
function expectedRoll(rows,moves,since=0){const active=rows.filter(r=>!r.voided&&(!r.refund||!r.rejected||r.handed)&&r.time>=since);return{
  revenueC:add(active.map(r=>(r.refund?-1:1)*r.amountC)),cashC:add(active.filter(r=>r.cash).map(r=>(r.refund?-1:1)*r.amountC)),
  tipsC:add(active.filter(r=>!r.refund).map(r=>r.tipC)),cashTipsC:add(active.filter(r=>!r.refund&&r.cash).map(r=>r.tipC)),
  txns:active.filter(r=>!r.refund&&r.amountC>0).length,movesInC:add(moves.filter(r=>r.input&&r.time>=since).map(r=>r.amountC)),movesOutC:add(moves.filter(r=>!r.input&&r.time>=since).map(r=>r.amountC))};}
await strict('journal/poste rollup excludes voids/rejected refunds, counts sales only, and separates tips',fc.property(ledgerArb,movementArb,fc.integer({min:0,max:120}),(rows,moves,since)=>{
  c.journal=rowsOf(rows);c.cashMovements=movesOf(moves);
  for(const cut of [null,since]){const r=cut===null?c.journalTotals():c.posteRollup(TS+cut*1000);const expected=expectedRoll(rows,moves,cut??0);for(const [k,v]of Object.entries(expected))assert.equal(r[k],v,k);assert.equal(r.revenueC,r.cashC+r.cardC);assert.equal(cents(r.revenue),r.revenueC);}
}));
await strict('tips never change revenue and cash tips alone enter drawer',fc.property(amount,amount,fc.boolean(),(base,tip,cash)=>{
  c.journal=[{amount:base/100,method:cash?'cash':'card',tip:tip/100}];c.cashMovements=[];c.handovers=[];c.openingFloat=0;const r=c.journalTotals();assert.equal(r.revenueC,base);assert.equal(r.tipsC,tip);assert.equal(cents(c.drawerExpected()),cash?base+tip:0);
}));
await strict('drawer expected = float + cash net + cash tips + signed moves + signed handover gaps',fc.property(ledgerArb,movementArb,amount,fc.array(fc.integer({min:-MAX,max:MAX}),{maxLength:12}),(rows,moves,float,gaps)=>{
  c.journal=rowsOf(rows);c.cashMovements=movesOf(moves);c.openingFloat=float/100;c.handovers=gaps.map(ecart=>({ecart:ecart/100}));const e=expectedRoll(rows,moves);assert.equal(cents(c.drawerExpected()),float+e.cashC+e.cashTipsC+e.movesInC-e.movesOutC+add(gaps));
}));
await strict('void by unique sale id removes exactly its revenue/tip, is idempotent and restores once',fc.property(fc.array(positive,{minLength:1,maxLength:60}),amount,(values,tip)=>{
  const t=context();t.c.journal=values.map((v,i)=>({id:'s'+i,ref:'r'+i,amount:v/100,tip:i?0:tip/100,time:new Date(TS),method:'cash'}));
  const total=add(values);assert.equal(t.c.reconcileVoids([],['s0'],[],{}),1);assert.equal(t.c.journalTotals().revenueC,total-values[0]);assert.equal(t.c.journalTotals().tipsC,0);
  assert.equal(t.c.reconcileVoids([],['s0'],[],{}),0);assert.equal(t.c.reconcileVoids([],[],[],{restoredIds:new Set(['s0'])}),1);assert.equal(t.c.journalTotals().revenueC,total);
}));
await strict('recordSale journals the paid base once and keeps tips out of revenue',fc.property(positive,amount,fc.boolean(),(base,rawTip,cash)=>{
  const tip=Math.min(base,rawTip),t=context();const r=t.c.recordSale(base/100,cash?'cash':'card','Table',tip/100);
  assert.ok(r);assert.equal(t.c.journal.length,1);assert.equal(cents(r.amount),base);assert.equal(cents(r.tip),tip);assert.equal(t.c.journalTotals().revenueC,base);assert.equal(t.c.journalTotals().tipsC,tip);
}));
await strict('receipt base/tip stay separate and refund receipts never include a tip',fc.property(amount,amount,fc.boolean(),(base,tip,refund)=>{
  const r=c.receiptSaleFrom({amount:(refund?-1:1)*base/100,tip:tip/100,kind:refund?'refund':'sale',time:new Date(TS),lines:[]});assert.equal(cents(r.total),base);assert.equal(cents(r.tip),refund?0:tip);
}));
function fallbackReceipt(base,tip,refund=false){
  const t=context();t.c.renderReceipt({amount:(refund?-1:1)*base/100,tip:tip/100,kind:refund?'refund':'sale',time:new Date(TS),ref:'test',label:'Table',method:'cash'});
  const totals={};for(const m of t.$('#receipt-body').innerHTML.matchAll(/<span class="rct-tot-k">([^<]+)<\/span><span class="rct-tot-v">([^<]+)<\/span>/g))totals[m[1]]=cents(Number(m[2].replace('−','-').replace(/[^0-9.,+-]/g,'').replace(',','.')));
  return totals;
}
await strict('legacy receipt fallback conserves principal/tax components and outside tips',fc.property(amount,amount,fc.boolean(),(base,tip,refund)=>{
  const r=fallbackReceipt(base,tip,refund);assert.equal(Math.abs(r[refund?'TOTAL REMBOURSÉ':'TOTAL PAYÉ']),base+(refund?0:tip));assert.equal(Math.abs(r['Total HT']+r['TVA 10 %']),base);
}));
function flow(base,n,price=base,tipMode='0'){const t=context({splitState:{total:base/100,splitMode:'egal',numParts:n,tipMode,itemTotals:{Dish:{unitPrice:price/100,totalQty:1}},sourceLines:[],isVrap:true}});t.c.launchSplitFlow();return t.c.splitState.flow;}
await strict('real equal split flow conserves base in up to 12 tenders',fc.property(positive,nParts,(base,n)=>{
  const f=flow(base,n);if(base<n){assert.equal(f,undefined);return;}assert.ok(f);assert.equal(add(Array.from(f.parts,p=>cents(p.base))),base);assert.equal(add(Array.from(f.parts,p=>cents(p.tip))),0);for(const p of f.parts)assert.equal(cents(p.amount),cents(p.base)+cents(p.tip));
}));
await strict('real split flow keeps exact whole-MAD percentage tips outside its base',fc.property(fc.integer({min:1,max:50000}),nParts,fc.integer({min:0,max:100}),(mad,n,pct)=>{
  const f=flow(mad*100,n,mad*100,String(pct));assert.equal(add(Array.from(f.parts,p=>cents(p.tip))),mad*pct);assert.equal(add(Array.from(f.parts,p=>cents(p.amount))),mad*100+mad*pct);
}));
await strict('real split payments journal cash/card parts once even after repeated taps',fc.property(fc.integer({min:1,max:50000}),nParts,fc.integer({min:0,max:100}),(mad,n,pct)=>{
  const t=context({mode:'vrap',splitState:{total:mad,splitMode:'egal',numParts:n,tipMode:String(pct),itemTotals:{Dish:{unitPrice:mad,totalQty:1}},sourceLines:[],isVrap:true}});
  t.c.launchSplitFlow();const f=t.c.splitState.flow;let cash=0;
  for(let i=0;i<n;i++){if(i%2===0)cash+=cents(f.parts[i].base);t.c.markSplitPartPaid(i,i%2?'carte':'cash');t.c.markSplitPartPaid(i,i%2?'carte':'cash');}
  const r=t.c.journalTotals();assert.equal(t.c.journal.length,n);assert.equal(r.revenueC,mad*100);assert.equal(r.cashC,cash);assert.equal(r.cardC,mad*100-cash);assert.equal(r.tipsC,mad*pct);assert.equal(f.paidCount,n);
}));
await strict('real article split conserves a 60-line ticket without reassigning whole units',fc.property(linesArb,nParts,(input,n)=>{
  const lines=input.map(l=>({...l,price:Math.max(0.01,l.price),total:Math.max(1,cents(l.price))*l.qty/100}));
  const itemTotals={},perConvive={};lines.forEach((l,i)=>{itemTotals[l.name]={unitPrice:l.price,totalQty:l.qty};(perConvive[i%n+1]??={})[l.name]=l.qty;});
  const gross=add(lines.map(l=>cents(l.total)));const t=context({splitState:{total:gross/100,splitMode:'article',numConvives:n,perConvive,itemTotals,tipMode:'0',isVrap:true}});
  t.c.launchSplitFlow();const f=t.c.splitState.flow;assert.ok(f);assert.equal(add(Array.from(f.parts,p=>cents(p.base))),gross);assert.equal(add(Array.from(f.parts,p=>add(Array.from(p.lines,l=>l.qty)))),add(lines.map(l=>l.qty)));
}));
await strict('cloud journal conversion preserves paid amount and line cents',fc.property(amount,linesArb,(base,lines)=>{
  const r=c.cloudSaleJournalEntry({id:'server-sale',ts:TS,amount:base/100,amountCents:base,method:'cash',lines});assert.equal(cents(r.amount),base);assert.equal(r.amountCents,base);assert.deepEqual(Array.from(r.lines,l=>cents(l.total)),lines.map(l=>cents(l.total)));
}));
await strict('article allocation accepts exactly all whole units and rejects fractional or excess units',fc.property(linesArb,nParts,(lines,n)=>{
  const totals={},assigned={};lines.forEach((l,i)=>{totals[l.name]={totalQty:l.qty,unitPrice:l.price};(assigned[i%n+1]??={})[l.name]=l.qty;});c.splitState={itemTotals:totals,numConvives:n,perConvive:assigned};assert.equal(c.splitArticleAllocation().ok,true);
  const name=lines[0].name;assigned[1][name]+=1;assert.equal(c.splitArticleAllocation().ok,false);assigned[1][name]=0.5;assert.equal(c.splitArticleAllocation().ok,false);
}));
// The actual report builder is delegated by caisse-accounting, not reimplemented.
const report = context();vm.runInContext(fs.readFileSync(path.join(ROOT,'assets/day-report.js'),'utf8'),report.c);
await strict('Z net/method/tips/drawer totals match journal rollup and counted minus expected',fc.property(ledgerArb,movementArb,amount,amount,(rows,moves,float,counted)=>{
  report.c.journal=rowsOf(rows);report.c.cashMovements=movesOf(moves);report.c.openingFloat=float/100;report.c.handovers=[];const r=report.c.buildDayReport(counted/100,TS+300000),e=expectedRoll(rows,moves);
  assert.equal(cents(r.net),e.revenueC);assert.equal(cents(r.methods.cash||0),e.cashC);assert.equal(cents(r.methods.card||0),e.revenueC-e.cashC);assert.equal(cents(r.tips),e.tipsC);
  assert.equal(cents(r.cash.expected),float+e.cashC+e.cashTipsC+e.movesInC-e.movesOutC);assert.equal(cents(r.cash.ecart),counted-cents(r.cash.expected));
}));
// Known failures are intentionally not production fixes. Replay examples prevent green-by-luck.
await knownIssue('CM-1','equal-split line totals should conserve the undiscounted ticket',fc.property(positive,fc.constantFrom(2,3,4,5,6,8),(base,n)=>{
  if(base<n)return true;const f=flow(base,n);return add(Array.from(f.parts,p=>add(Array.from(p.lines,l=>cents(l.total)))))===base;
}),[[3,2]]);
await knownIssue('CM-2','standalone refund clamp should not exceed a zero remaining balance',fc.property(amount,(paid)=>{
  const t=context({refundState:{orig:{amount:paid/100,refundedAmount:paid/100}}});t.$('#rf-amount').value='1';t.c.clampRefundAmount();return cents(t.c.refundState.amount)<=0;
}),[[0]]);
await knownIssue('CM-3','Z expected cash should equal the live drawer after signed handover gaps',fc.property(fc.integer({min:-MAX,max:MAX}),(gap)=>{
  report.c.journal=[];report.c.cashMovements=[];report.c.openingFloat=100;report.c.handovers=[{id:'h1',time:new Date(TS),fromName:'A',toName:'B',expected:100,counted:100+gap/100,ecart:gap/100}];const r=report.c.buildDayReport(null,0);return cents(r.cash.expected)===cents(report.c.drawerExpected());
}),[[1]]);
await knownIssue('CM-4','percentage tips on fractional MAD tickets round half cents upward',fc.property(positive,fc.integer({min:0,max:100}),(base,pct)=>{
  c.currentTotal=()=>base/100;c.payTipMode='autre';c.payTipCustom=pct;c.splitPayCallback=null;return cents(c.payTipAmount())===Math.round(base*pct/100);
}),[[2135,10]]);
await knownIssue('CM-5','a fresh journal import must preserve server tipCents outside revenue',fc.property(positive,(tip)=>{
  const r=c.cloudSaleJournalEntry({id:'server-sale',ts:TS,amount:1,amountCents:100,method:'cash',tipCents:tip});return cents(r.tip)===tip;
}),[[1]]);
await knownIssue('CM-6','a pending manager approval must re-clamp after another refund is accepted',fc.property(fc.integer({min:2,max:MAX}),(paid)=>{
  const orig={id:'original',ref:'ref',label:'Table',amount:paid/100,method:'cash',refundedAmount:0};
  const old={id:'old-refund',kind:'refund',refundOfId:'original',amount:-0.01,method:'cash',refundSyncStatus:'pending',refundLedgerReversed:true};
  let t;t=context({journal:[orig,old],refundState:{orig,reason:'Return'},requireManager(_label,approve){old.refundSyncStatus='accepted';t.c.applyAcceptedRefund(old);approve();}});
  t.$('#rf-amount').value=(paid/100).toFixed(2);t.c.confirmRefund();return cents(orig.refundedAmount)<=paid;
}),[[2]]);
await knownIssue('CM-7','legacy receipt fallback must not print negative VAT for a positive sale',fc.property(positive,(base)=>{
  const r=fallbackReceipt(base,0);return r['TVA 10 %']>=0&&r['Total HT']<=base;
}),[[55]]);
console.log(`caisse-money-properties: ${passed} strict passed, ${failed} strict failed, ${known} known failures; ${RUNS} runs/property; seed=${SEED}`);
if(failed)process.exit(1);
