#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../assets/platform-kernel.js',import.meta.url),'utf8');
const memory=new Map();
const window={dispatchEvent(){},addEventListener(){}};
const context={window,localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},sessionStorage:{getItem(){return null;}},navigator:{},performance:{now:()=>Date.now()},crypto:{randomUUID:()=>`id-${Math.random()}`},BroadcastChannel:class{postMessage(){}},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}},Set,Map,Promise,Date,Math,JSON,String,Object,Array,Number,Boolean,console};
vm.createContext(context);vm.runInContext(source,context);
const K=window.KiwiPlatform;let n=0;const ok=(cond,msg)=>{assert.ok(cond,msg);n++;console.log('  ✓ '+msg);};

ok(K&&K.version===1,'kernel exposes a versioned API');
ok(K.tenant()==='local-demo','unknown browsers stay in an explicit local demo tenant');
memory.set('kiwiPairedVenue',JSON.stringify({merchant:'atlas-casa'}));
ok(K.tenant()==='atlas-casa','paired merchant is the tenant identity');
K.register('demo',{engine:'test',available:true});ok(K.capability('demo').available,'registered capability reports ready');
ok(!K.capability('missing').available,'missing capability is honest');
ok(K.access.can({role:'manager'},'write','planning'),'manager can edit planning');
ok(!K.access.can({role:'serveur'},'write','inventory'),'server cannot edit inventory');
K.access.write({denies:[{subject:'manager',action:'write',resource:'planning'}]});ok(!K.access.can({role:'manager'},'write','planning'),'explicit deny wins');
K.search.register('fixture',()=>[{id:'p1',title:'Chemise blanche',subtitle:'Catalogue'},{id:'p2',title:'Pantalon noir',subtitle:'Catalogue'}]);
const hits=await K.search.query('chemise');ok(hits.length===1&&hits[0].id==='p1','local search ranks matching records');
const span=K.telemetry.start('fixture',{capability:'test',phone:'secret'});span.end('ok');const row=K.telemetry.list()[0];ok(row.attrs.capability==='test'&&!('phone' in row.attrs),'telemetry allow-list excludes private attributes');
ok(K.telemetry.summary().total===1,'telemetry summary counts spans');
console.log(`\n✓ Platform kernel — ${n} controls`);
