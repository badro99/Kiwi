import assert from 'node:assert/strict';
import vm from 'node:vm';
import split from './split-functions.cjs';
import {read,esc} from './ui-runtime-harness.mjs';
import {deadlineVmSource} from './deadline-vm-source.mjs';
for(const lang of ['fr','en','ar']) {
 const docLang={readyState:'loading',documentElement:{lang},addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null};
 const langWindow={};
 // Use the actual till translator, which owns credential labels and errors.
 vm.runInNewContext(read('assets/caisse-lang.js'),{window:langWindow,document:docLang,localStorage:{getItem:()=>lang},MutationObserver:class{observe(){}},setTimeout(){}});
 let sheets=[],requests=[],toasts=[];
 const node=tag=>({tag,attrs:{},listeners:{},children:[],setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},appendChild(n){this.children.push(n);},remove(){this.removed=true;},addEventListener(k,f){this.listeners[k]=f;}});
 const cancel={focus(){}};const detail={innerHTML:''};
 const order={id:'fixture-order',pay:{mode:'cash',paid:0},pieces:[],lines:[]};
 const document={documentElement:{lang},createElement:node,body:{appendChild:s=>sheets.push(s)}};
 const context={prompt:()=>null,document,window:{KiwiCaisseLang:langWindow.KiwiCaisseLang,KiwiPressingOps:{notification:()=>null}},state:{},root:{},findOrder:()=>order,custOf:()=>({name:'Guest'}),orderTotals:()=>({total:0}),orderStatus:()=> 'recu',STATUS:{recu:{label:'Reçu'}},isLate:()=>false,publicOrderNo:()=> 'fixture',dataText:esc,esc,fmtDT:()=>'',payPill:()=>'',icons(){},openVeil(){},$$:()=>[],$:sel=>sel==='#px-detailm'?detail:sel==='#px-dt-cancel'?cancel:sel==='#px-dt-tags'?{}:null,pressingScope:()=> 'test-venue',toast:s=>toasts.push(s),fetch:async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>{throw Error('unreadable');}};},setTimeout,clearTimeout,AbortController};
 const source=split.declaration(read('assets/pressing/workshop.js'),'openDetail');
 vm.runInNewContext(deadlineVmSource(source)+'\nopenDetail("fixture-order");',context);
 let pending=cancel.onclick();assert.equal(requests.length,0);assert.equal(sheets.length,1,'cancellation opens a branded credential sheet');assert.equal(sheets[0].tag,'k-sheet');
 const pad=sheets[0].children[0];assert.equal(pad.tag,'k-pin-pad');
 assert.equal(pad.attrs.heading,langWindow.KiwiCaisseLang.tr('Code manager'));
 if (lang==='en') assert.equal(pad.attrs.heading,'Manager code');
 if (lang==='ar') assert.equal(pad.attrs.heading,'رمز المسؤول');
 sheets[0].listeners['kiwi:action']({detail:{action:'k.sheet.close'}});await pending;assert.equal(requests.length,0,'dismiss never verifies');
 pending=cancel.onclick();sheets[1].children[0].onsubmit('test-credential');await pending;
 assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/pressing/cancel');assert.equal(requests[0].body.pin,'test-credential','credential is forwarded, never compared in browser');
 assert.equal(order.cancelledAt,undefined,'unreadable write response cannot announce successful cancellation');
 assert.equal(toasts.at(-1),langWindow.KiwiCaisseLang.tr('Résultat de l’annulation incertain. Vérifiez la commande avant de réessayer.'));
}
console.log('✓ pressing: branded masked pad, translated labels, dismissal, server-only credential forwarding, unreadable write rejection');
