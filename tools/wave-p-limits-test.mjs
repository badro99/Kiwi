import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sanitizeFormula } from '../functions/api/_menu-formula.js';
const mode = process.argv[2];
if (!mode || mode === 'formula') {
 const raw = {slots: Array.from({length:11},(_,i)=>({id:'s'+i,choices:Array.from({length:21},(_,j)=>({itemId:'i'+j}))}))};
 const result = sanitizeFormula(raw,new Set(Array.from({length:21},(_,j)=>'i'+j)));
 assert.equal(result.slots.length,11); assert.equal(result.slots[10].choices[20].itemId,'i20');
}
if (!mode || mode === 'pressing') {
 const memory = new Map(); const w = {addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('assets/pressing-ops.js','utf8'),{window:w,localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},Set,console});
 const pieces=Array.from({length:121},(_,i)=>({pid:'p'+i,svcs:Array.from({length:9},(_,j)=>'svc'+j)}));
 assert.equal(w.KiwiPressingOps.replace([{id:'order',pieces}],{},'test'),true);
 const result=w.KiwiPressingOps.read('test')[0]; assert.equal(result.pieces.length,121);assert.equal(result.pieces[120].services[8],'svc8');
}
if (!mode || mode === 'photos') {
 const listeners={};const notices=[];let calls=0;const stage={innerHTML:''};
 const el={setAttribute(){},querySelector:()=>stage,addEventListener:(n,f)=>listeners[n]=f};
 const w={Kiwi:{modal:()=>({el,close(){}}),toast:(...args)=>notices.push(args)},KiwiAiImageImport:{downscaleImage(){calls++;throw Error('unexpected');}}};
 w.window=w;w.KiwiI18n={};
 vm.runInNewContext(fs.readFileSync('assets/salle-scan.js','utf8'),{...w,document:{getElementById:()=>true},AbortController});
 w.KiwiSalleScan.open();listeners.change({target:{matches:()=>true,files:Array.from({length:6},(_,i)=>({name:'room'+i+'.jpg'}))}});
 await new Promise(r=>setTimeout(r,0));assert.equal(calls,0);assert.match(JSON.stringify(notices),/room4.jpg/);assert.match(JSON.stringify(notices),/room5.jpg/);
}
console.log('✓ wave P limits',mode||'all');
