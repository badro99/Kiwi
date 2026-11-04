import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
const read = f => fs.readFileSync(f, 'utf8');
const data = new Map([['kiwiSaleQueue', '{unsent']]);
const localStorage = { getItem:k=>data.get(k)??null, setItem:(k,v)=>data.set(k,String(v)), removeItem:k=>data.delete(k), key:i=>[...data.keys()][i], get length(){return data.size;} };
const window = {dispatchEvent(){}};
vm.runInNewContext(read('assets/live-link/queue-store.js'), {window,localStorage,CustomEvent:class{}});
const queue = window.KiwiSaleQueueStore.create({merchant:()=> 'test'});
for(let i=0;i<8;i++){data.set('kiwiSaleQueue','{unsent'+i);queue.peek();}
assert.equal(queue.recoveryCopies().length,8,'all corrupt copies retained beyond five');
const copy=queue.recoveryCopies()[0];
assert.equal(queue.recoveryCopies(copy.key),'{unsent0','export returns exact bytes');
queue.recoveryCopies(copy.key,true);
assert.equal(data.has(copy.key),false,'only explicit acknowledgement removes evidence');
data.set('kiwiSaleQueue:quarantine:1','x'.repeat(524288));
data.set('kiwiSaleQueue','{money');
queue.peek();
assert.equal(data.get('kiwiSaleQueue'),'{money','byte bound leaves original intact');
assert.ok(queue.status().recoveryBytes>=1048576,'warning can measure retained bytes');
assert.equal(queue.status().storageError,true);
const card=split.declaration(read('assets/pos-boutique/sales.js'),'cardFlag');
const product={id:'p'};
const ledger=[{id:'v',base:1,baseAt:1,stock:1},{stock:2}];
const materialize=split.declaration(read('assets/boutique-catalog-parts.js').slice(read('assets/boutique-catalog-parts.js').indexOf('  function materialize(doc, vid)')),'materialize');
vm.runInNewContext(materialize+';materialize', {baseOf:v=>v.base||0,baseAtOf:v=>v.baseAt||0})({variants:[ledger[0]],moves:[{vid:'v',at:2,d:-4}]});
assert.equal(ledger[0].ledgerStock,-3); assert.equal(ledger[0].stock,0);
const badge=vm.runInNewContext(card+';cardFlag', {stockOf:()=>-1,esc:String,window:{KiwiBoutiqueCatalog:{listVariants:()=>ledger},KiwiCaisseLang:{tr:s=>s}}})(product);
assert.match(badge,/0 · stock à vérifier · écart −3/);
assert.equal(ledger[0].ledgerStock,-3,'display never mutates ledger');
const invRow=split.declaration(read('assets/pos-boutique/inventory.js'),'invRow');
const row=vm.runInNewContext(invRow+';invRow',{catDB:()=>({getProduct:()=>({variants:ledger,stock:0,colors:[],sizes:['M'],category:null})}),artOf:()=>'',esc:String,fmtMAD:String,globalThis:{window:{KiwiCaisseLang:{tr:s=>s}}}})({id:'p',name:'Robe',priceMAD:100});
assert.match(row,/class="bqi-stock rupture">0 · stock à vérifier · écart −3</,'till inventory row shows 0 and the gap');
const source=read('assets/stock.js');
for(const name of ['renderDenseItem','renderItemRow','renderItemCard']){
 const fn=split.declaration(source,name);
 const html=vm.runInNewContext(fn+';'+name, {currentStockFor:()=>-3,statusOf:()=> 'out',t:k=>k,esc:String,fmtUnit:String,fmtNum:String,fmtMad:String,catLabel:String,variance:()=>0,daysOfStock:()=>0,theoreticalUsageFor:()=>0,svg:()=>'',fmtPct:String,actualLastDelivery:()=>null})({id:'p',name:'Product',supplier:'Supplier',unit:'u',costPerUnit:1,parLevel:10});
 assert.match(html,/stockGap.*−3/,name+' shows gap');
 assert.doesNotMatch(html,/class="st-(?:cell-stock|card-stock)">-3|<b>-3<\/b>/,name+' clamps shelf quantity');
}
console.log('✓ stockqueue owner ruling: evidence retention, acknowledgement, byte bound, real stock renderers');
// Execute the review surface, including export and explicit acknowledgement.
class Node {
  constructor(tag){this.tag=tag;this.children=[];this.style={};}
  append(...nodes){this.children.push(...nodes);for(const n of nodes)if(n&&typeof n==='object')n.parent=this;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  setAttribute(k,v){this[k]=v;}
  click(){downloads.push(this);}
}
const downloads=[],blobs=[],body=new Node('body'),events={};
const copies=new Map([['kiwiSaleQueue:quarantine:7','é'.repeat(420000)]]);
const disk={...localStorage,getItem:k=>copies.get(k)??null,removeItem:k=>copies.delete(k),key:i=>[...copies.keys()][i],get length(){return copies.size;}};
const I={T:{fr:{},en:{},ar:{}},getLang:()=> 'en'};
vm.runInNewContext(read('assets/queue-recovery.js'),{window:{KiwiLive:{queueRecoveryCopies:(key,ack)=>{if(key){const raw=copies.get(key);if(ack)copies.delete(key);return raw;}return [...copies].map(([key,raw])=>({key,bytes:2*(key.length+raw.length)}));}},KiwiI18n:I,addEventListener:(k,f)=>events[k]=f,confirm:()=>true},document:{body,readyState:'complete',createElement:tag=>new Node(tag)},localStorage:disk,Blob:class{constructor(parts){blobs.push(parts);}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:f=>f()});
const panel=body.children[0];
assert.equal(panel.children[0].textContent,'Sale copies to review · 1');
assert.match(panel.children[1].textContent,/nearly full/,'near byte bound warning translated');
const line=panel.children[2];line.children[0].onclick();
assert.equal(blobs[0][0],copies.values().next().value,'export keeps exact raw bytes');
assert.equal(copies.size,1,'export never removes evidence');
assert.equal(downloads[0].download,'kiwiSaleQueue-quarantine-7.txt');
line.children[1].onclick();assert.equal(copies.size,0,'explicit confirmation acknowledges only chosen copy');
assert.ok(events['kiwi:langchange']);
console.log('✓ corrupt copy review: translated warning, lossless export, explicit acknowledgement');
// Acknowledging an active valid queue can never erase new unsent receipts.
data.set('kiwiSaleQueue','[{"id":"safe"}]');
assert.equal(queue.recoveryCopies('kiwiSaleQueue',true),null);
assert.equal(data.get('kiwiSaleQueue'),'[{"id":"safe"}]');
for(const lang of ['en','ar']){
 const context={localStorage:{getItem:()=>lang},document:{readyState:'loading',addEventListener(){}},console};context.window=context;
 vm.runInNewContext(read('assets/caisse-lang.js'),context);
 for(const phrase of ['stock à vérifier · écart','Copies de ventes à vérifier','Exporter','Accuser réception et supprimer','Stockage des copies presque plein. Exportez et vérifiez les copies avant de les supprimer.']) assert.notEqual(context.KiwiCaisseLang.tr(phrase),phrase,lang+' till dictionary: '+phrase);
 assert.ok(I.T[lang]['queueRecovery.4'],lang+' dashboard warning');
}
console.log('✓ active valid queue protected; actual till EN/AR translations and dashboard warning dictionaries');
