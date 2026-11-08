#!/usr/bin/env node
/* pressing-long-run-test · r21 pressing#A2. Two older tills (no letter) keep stale local copies for several rounds, create tickets under the same numbers and only sometimes sync with the real store route: afterwards the server and both tills hold the same tickets, every garment tag is unique and scans to its own ticket. Split from pressing-money-properties-test.mjs (assertion-mix pin). */
import pressingSource from './pressing-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {declaration as scan} from './js-declarations.cjs';
import {fixture} from './server-money-fixture.mjs';
import {onRequestPost as cancel} from '../functions/api/pressing/cancel.js';
import {onRequestPost as storePost,onRequestGet as storeGet} from '../functions/api/store.js';
import {makeSession,SESS_COOKIE,TILL_COOKIE,tillToken} from '../functions/auth/_lib.js';
import {businessBoundary,businessDate} from '../functions/api/_business-day.js';
import * as zoneLaw from '../functions/api/_zone-law.js';
import {numberingWindow} from './pressing-numbering-model.mjs';
const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ skip fast-check unavailable, pressing properties not executed');process.exit(0);}
const RUNS=Math.min(60,+process.env.KIWI_PROPERTY_RUNS||60),SEED=+process.env.KIWI_PROPERTY_SEED||20261108;
let passed=0,failed=0;
async function check(label,p){const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(r.failed){failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance||r.error);}else{passed++;console.log('✓ '+label);}}
const bytesOf=p=>pressingSource.readFileSync(path.join(ROOT,p),'utf8'),C=n=>Math.round(n*100),sum=a=>a.reduce((s,n)=>s+n,0);
function decl(source,name){const m=new RegExp('(?:^|\\n)\\s*(?:function '+name+'\\s*\\(|(?:const|let|var) '+name+'\\s*=)').exec(source);if(!m)throw Error(name);return scan(source.slice(m.index).trimStart(),name);}
function liftFns(file,names,extra={}){const c=vm.createContext({console,Date,Math,...extra});vm.runInContext(names.map(n=>decl(bytesOf(file),n)).join('\n')+'\nObject.assign(globalThis,{'+names.join(',')+'});',c);return c;}
const c=liftFns('assets/pressing-caisse.js',['priceTable','clampQty','buildPieces','lineUnit','lineTotal','orderTotals','B2B_LEGACY_PERCENT','b2bClean','b2bPercentOf','b2bPercentLabel','b2bDiscountCents','b2bPercentFor','ticketTotals','saleLines','validDeposit','effectiveStatus','orderStatus','isLiveOrder','mergePressingDocuments','findScannedOrder','matchesQuery','publicPieceNo','searchDigits','custOf','isTicketNo','normalizeOrderNo','normalizeTicketNo','publicOrderNo','nextAvailableOrderNo','seqAfterOrderNo','TILL_LETTERS','tillLetterAt','mergeTills','freeTillLetter','claimTill','numberingRules','tillHash','orderIdentity','renumberedOrder','STORE_ZONE','ZONE_FMTS','zoneFormatter','storeZone','storeWall','storeInstant','pressingServiceDay','pressingSlot','relativeServiceDay','readyOptions','suggestReady'],{window:numberingWindow(),ORDERS:[],KiwiZoneLaw:{ZONE_LAWS:zoneLaw.ZONE_LAWS,effectiveZone:zoneLaw.effectiveZone,DateTimeFormat:zoneLaw.DateTimeFormat},ITEMS:{g:{label:'Garment',prices:{lavage:12.5}}},MAX_QTY:99,CUST:{business:{b2b:true}},H:3600000,pad2:n=>String(n).padStart(2,'0'),fmtDay:d=>d.toISOString().slice(0,10)});
const money=fc.integer({min:1,max:500000}),basket=fc.array(fc.record({unit:money,qty:fc.integer({min:1,max:99})}),{minLength:1,maxLength:60});
const order=(rows,b2b=false)=>({id:'1001',b2b,lines:rows.map(r=>({itemId:'g',unitPrice:r.unit/100,qty:r.qty,services:['lavage']})),pieces:[{status:'recu'}],pay:{paid:0}});
const f=await fixture(ROOT),{sql,merchant}=f;
sql.prepare("UPDATE merchant_config SET type='pressing' WHERE merchant=?").run(merchant);
const cookies={owner:SESS_COOKIE+'='+await makeSession('money-owner',f.env.AUTH_SECRET),till:TILL_COOKIE+'='+await tillToken(f.env.AUTH_SECRET,merchant)};
async function request(handler,body,role='owner',get=false){const url=new URL('https://kiwi.test/api/test');if(get)for(const[k,v]of Object.entries(body))url.searchParams.set(k,v);const r=await handler({env:f.env,request:new Request(url,{method:get?'GET':'POST',headers:{Cookie:cookies[role]||'','Content-Type':'application/json'},...(get?{}:{body:JSON.stringify(body)})})});return{status:r.status,body:await r.json()};}
const buildOrder=(num,at,qty)=>{c.ITEMS.g={label:'Garment',prices:{lavage:12.5}};const o={...order([{unit:1250,qty}]),id:num,displayNo:num,droppedAt:new Date(at).toISOString(),readyAt:new Date(at+86400000).toISOString(),updatedAt:at};o.pieces=Array.from(c.buildPieces(num,o.lines,null),p=>({pid:p.pid,n:p.n,of:p.of,status:p.status}));return o;};
const pieceCount=d=>sum(d.orders.map(o=>o.pieces.length));
// r21 pressing#A2 : deux caisses de l'ancienne génération (sans lettre) qui gardent chacune leur copie locale périmée pendant plusieurs tours, créent des bons sous les mêmes numéros, ne se resynchronisent que par moments : à la fin le serveur et les deux caisses portent les mêmes bons, chaque étiquette de vêtement est unique et se scanne vers son bon.
await check('long-running tills with stale local copies keep every ticket and garment tag unique and scannable after recovery',fc.asyncProperty(fc.array(fc.record({a:fc.integer({min:0,max:2}),b:fc.integer({min:0,max:2}),syncA:fc.boolean(),syncB:fc.boolean(),qty:fc.integer({min:1,max:3})}),{minLength:2,maxLength:5}),async(rounds)=>{
  sql.prepare("DELETE FROM store_docs WHERE merchant=? AND feature='pressing-orders'").run(merchant);
  const push=(data,baseRev)=>request(storePost,{merchant,feature:'pressing-orders',baseRev,data},'till');
  const pull=async()=>(await request(storeGet,{merchant,feature:'pressing-orders'},'till',true)).body;
  const sync=async(dev)=>{for(let i=0;i<8;i++){const r=await push(dev.doc,dev.rev);if(r.status===200){dev.rev=r.body.rev;return true;}assert.equal(r.status,409,JSON.stringify(r.body));if(r.body.data){dev.doc=c.mergePressingDocuments(dev.doc,r.body.data);dev.rev=r.body.rev;}}return false;};
  const s0=await pull();const A={doc:{customers:[],orders:[],cancellations:[],seq:41},rev:s0?.rev||0},B={doc:{customers:[],orders:[],cancellations:[],seq:41},rev:s0?.rev||0};
  let clock=Date.UTC(2026,9,22,8),garments=0;
  for(const r of rounds){
    for(const [dev,count] of [[A,r.a],[B,r.b]])for(let i=0;i<count;i++){clock+=60000;const num=c.nextAvailableOrderNo(dev.doc.seq,dev.doc.orders,'');const o=buildOrder(num,clock,r.qty);garments+=o.pieces.length;dev.doc={...dev.doc,orders:[o,...dev.doc.orders],seq:Math.max(+dev.doc.seq||0,c.seqAfterOrderNo(dev.doc.seq,num))};}
    if(r.syncA)assert.ok(await sync(A));
    if(r.syncB)assert.ok(await sync(B));
  }
  for(let pass=0;pass<2;pass++)for(const dev of [A,B]){const s=await pull();if(s&&s.data)dev.doc=c.mergePressingDocuments(dev.doc,s.data);assert.ok(await sync(dev));}
  const server=(await pull()).data;
  for(const dev of [A,B]){const s=await pull();dev.doc=c.mergePressingDocuments(dev.doc,s.data);}
  const ids=d=>d.orders.map(o=>o.id+'@'+o.droppedAt).sort().join();
  assert.equal(ids(A.doc),ids(server));assert.equal(ids(B.doc),ids(server));
  assert.equal(pieceCount(server),garments);
  const pids=server.orders.flatMap(o=>o.pieces.map(p=>p.pid));assert.equal(new Set(pids).size,pids.length,'every garment tag is unique');
  c.ORDERS=server.orders;
  for(const o of server.orders)for(const p of o.pieces){const found=c.findScannedOrder(p.pid);assert.ok(found&&found.id===o.id,'tag '+p.pid+' scans to its own ticket');}
}));

f.close();
console.log('pressing long-run: '+passed+' passed, '+failed+' failed; runs='+RUNS+'; seed='+SEED);if(failed)process.exitCode=1;
