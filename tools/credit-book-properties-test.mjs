#!/usr/bin/env node
// Vraies déclarations de caisse, fusion verticalops et routes D1, sans réseau.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {ROOT,read,declarations} from './invoice-vat-harness.mjs';
import {fixture} from './server-money-fixture.mjs';
import {onRequestGet,onRequestPost} from '../functions/api/store.js';
import {makeSession,SESS_COOKIE,tillDeviceToken,TILL_COOKIE,operatorToken,operatorIdToken} from '../functions/auth/_lib.js';
let fc;try{fc=createRequire(ROOT+'/app/package.json')('fast-check');}catch{console.log('○ skip fast-check unavailable (npm --prefix app ci), credit book properties not executed');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||300,SEED=Number(process.env.KIWI_PROPERTY_SEED)||20261023;
let passed=0,failed=0,known=0;
async function strict(label,p,examples=[]){const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(r.failed){failed++;console.error('✗ '+label,fc.stringify(r.counterexample),r.errorInstance||r.error);}else{passed++;console.log('✓ '+label);}}
async function knownIssue(id,label,p,examples=[]){const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(r.failed&&r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('✗ unexpected '+id,r.errorInstance);return;}if(r.failed){known++;console.log(`◦ known ${id} · ${label}\n  shrunk: ${fc.stringify(r.counterexample)}; seed=${r.seed}; path=${r.counterexamplePath}`);}else{failed++;console.error('✗ '+id+' holds: promote to strict');}}
const clone=x=>JSON.parse(JSON.stringify(x)),C=x=>Math.round(x*100);
let merge;
const window={KiwiStore:{define(name,opts){if(name==='verticalops')merge=opts.merge;return{};},currentVenue:()=> 'fixture'},addEventListener(){}};
vm.runInNewContext(read('assets/vertical-state.js'),{window,localStorage:{getItem:()=>null,setItem(){}},document:{addEventListener(){}},setInterval:()=>0,setTimeout:()=>0,console});
assert.equal(typeof merge,'function');
const ep=declarations('assets/pos-epicerie.js',['r2','balanceOf','totalCredit','advanceTxt','balTxt'],{CARNET:[],fmtMAD:n=>n.toFixed(2)+' MAD'});
vm.runInContext('this.balTxt = balTxt;',ep);
const f=await fixture(ROOT),other='server-other-shop';
// Un véritable autre propriétaire : les deux magasins de la fixture initiale appartiennent au même compte.
f.sql.exec("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('foreign-owner','foreign@example.test','Foreign','s','h',1,'active')");
f.sql.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run('foreign-owner',other);
const cookies={owner:`${SESS_COOKIE}=${await makeSession('money-owner',f.env.AUTH_SECRET)}`,foreignOwner:`${SESS_COOKIE}=${await makeSession('foreign-owner',f.env.AUTH_SECRET)}`,foreignTill:`${TILL_COOKIE}=${await tillDeviceToken(f.env.AUTH_SECRET,other,0,'term_foreign_fixture')}`,none:'',forged:`${TILL_COOKIE}=invalid-fixture`,operator:`kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET,'money-operator')}`};
for(let i=0;i<3;i++)cookies[i]=`${TILL_COOKIE}=${await tillDeviceToken(f.env.AUTH_SECRET,f.merchant,0,'term_credit_fixture_'+i)}`;
async function call(role,{data,baseRev=0,merchant=f.merchant}={}){const get=data===undefined,url=new URL('https://kiwi.test/api/store');if(get){url.searchParams.set('feature','verticalops');url.searchParams.set('merchant',merchant);}const r=await(get?onRequestGet:onRequestPost)({env:f.env,request:new Request(url,{method:get?'GET':'POST',headers:{Cookie:cookies[role]||'','Content-Type':'application/json'},...(get?{}:{body:JSON.stringify({merchant,feature:'verticalops',data,baseRev})})})});return{status:r.status,body:await r.json()};}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const blank=()=>({verticals:{epicerie:{schema:1,device:'fixture',updatedAt:1,data:{v:2,carnet:[{id:'client',name:'TEST KIWI',hist:[]}],day:{}}}},commands:[],seq:0});
const hist=d=>d.verticals.epicerie.data.carnet[0].hist;
function append(d,id,type,cents){hist(d).push({id,type,amt:cents/100,label:'TEST KIWI',at:new Date(1792404000000+Number(id.replace(/\D/g,''))*1000).toISOString()});d.verticals.epicerie.updatedAt++;}
function reset(){f.sql.exec("DELETE FROM store_docs; DELETE FROM doc_history; DELETE FROM sales WHERE channel='credit-book'; DELETE FROM sale_audit WHERE action='credit-book-refund';");}
async function sync(d,role){for(let i=0;i<10;i++){const r=await call(role,{data:d.doc,baseRev:d.rev});if(r.status===409){assert.equal(r.body.error,'stale');d.doc=merge(clone(d.doc),r.body.data);d.rev=r.body.rev;continue;}const b=ok(r);d.rev=b.rev;d.doc=b.data||d.doc;return;}assert.fail('sync did not converge');}
async function pull(d,role){const b=ok(await call(role));if(b.data)d.doc=merge(clone(d.doc),b.data);d.rev=b.rev;}
async function creditRefund(role,id,amount,extra={}) {
 const r=await onRequestPost({env:f.env,request:new Request('https://kiwi.test/api/store',{method:'POST',headers:{Cookie:cookies[role]||'','Content-Type':'application/json'},body:JSON.stringify({merchant:f.merchant,feature:'verticalops',action:'credit-book-refund',clientId:'client',id,amountCents:amount,method:'transfer',...extra})})});
 return {status:r.status,body:await r.json()};
}
const money=fc.integer({min:1,max:100000}),step=fc.record({device:fc.nat(2),kind:fc.constantFrom('debt','payment','advance','refund'),cents:money,online:fc.boolean(),retry:fc.boolean(),order:fc.nat(5)});
try{
await strict('two or three offline/online tills converge to the centime ledger sum; retries count each id once',fc.asyncProperty(fc.integer({min:2,max:3}),fc.array(step,{minLength:1,maxLength:35}),async(n,steps)=>{
 reset();const ds=Array.from({length:n},()=>({doc:blank(),rev:0})),expected=new Map();let paid=0,refunded=0;
 for(const[i,s]of steps.entries()){
  const k=s.device%n,d=ds[k];let amount=s.cents,type=s.kind==='debt'?'debt':'pay';
  // Avance = versement pay. Le carnet n'a pas de commande de remboursement :
  // une restitution se représente ici par une contre-écriture debt, identifiée.
  // Le plafond absent de l'API est testé séparément, sans le présupposer acquis.
  if(s.kind==='refund'){amount=Math.min(amount,paid-refunded);type='debt';refunded+=amount;}else if(type==='pay')paid+=amount;
  if(amount){const id='e'+i;append(d.doc,id,type,amount);expected.set(id,type==='debt'?amount:-amount);}
  if(s.online){await sync(d,k);if(s.retry)await sync(d,k);await pull(ds[s.order%n],s.order%n);for(const x of ds){const hs=hist(x.doc);assert.equal(new Set(hs.map(h=>h.id)).size,hs.length);assert.equal(C(ep.balanceOf(x.doc.verticals.epicerie.data.carnet[0])),hs.reduce((sum,h)=>sum+expected.get(h.id),0));}}
 }
 const order=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]][steps.at(-1).order].filter(k=>k<n);
 for(const k of order)await sync(ds[k],k);
 for(const k of order)await pull(ds[k],k);
 const server=ok(await call('owner')).data,ids=[...expected.keys()].sort(),sum=[...expected.values()].reduce((a,b)=>a+b,0);
 for(const d of [server,...ds.map(x=>x.doc)]){assert.deepEqual(hist(d).map(h=>h.id).sort(),ids);assert.equal(C(ep.balanceOf(d.verticals.epicerie.data.carnet[0])),sum);}
}));
await strict('racing first pushes return a conflict; merging and retrying retains both devices',fc.asyncProperty(money,money,async(a,b)=>{reset();const ds=[{doc:blank(),rev:0},{doc:blank(),rev:0}];append(ds[0].doc,'e0','debt',a);append(ds[1].doc,'e1','pay',b);const rs=await Promise.all(ds.map((d,i)=>call(i,{data:d.doc})));assert.equal(rs.filter(r=>r.status===200).length,1);assert.equal(rs.filter(r=>r.status===409&&r.body.error==='stale').length,1);for(let i=0;i<2;i++)await sync(ds[i],i);for(let i=0;i<2;i++){await pull(ds[i],i);assert.equal(C(ep.balanceOf(ds[i].doc.verticals.epicerie.data.carnet[0])),a-b);assert.equal(hist(ds[i].doc).length,2);}}));
await strict('independent full payments become an explicit advance; other customer debt stays intact',fc.property(money,money,(paid,owed)=>{const a=blank(),b=blank();append(a,'e0','debt',paid);append(a,'e1','pay',paid);append(b,'e0','debt',paid);append(b,'e2','pay',paid);const c=merge(a,b).verticals.epicerie.data.carnet[0];assert.equal(C(ep.balanceOf(c)),-paid);assert.match(ep.balTxt(ep.balanceOf(c)),/^Avance /);ep.CARNET.length=0;ep.CARNET.push(c,{hist:[{type:'debt',amt:owed/100}]});assert.equal(C(ep.totalCredit()),owed);}));
await strict('foreign owner, foreign paired till, anonymous and forged credentials cannot read or write this merchant',fc.asyncProperty(money,fc.constantFrom('foreignOwner','foreignTill','none','forged'),async(cents,role)=>{reset();const d=blank();append(d,'e0','debt',cents);ok(await call('owner',{data:d}));const before=f.sql.prepare('SELECT * FROM store_docs').all();const get=await call(role);assert.ok(get.status===401||get.body.merchant!==f.merchant);assert.ok(!JSON.stringify(get.body).includes('e0'));const post=await call(role,{data:blank(),baseRev:1});assert.ok([401,403].includes(post.status));assert.deepEqual(f.sql.prepare('SELECT * FROM store_docs').all(),before);}));
await strict('owner and each of three paired devices can write and read their own credit book',fc.asyncProperty(money,fc.constantFrom('owner',0,1,2),async(cents,role)=>{reset();const d=blank();append(d,'e0','debt',cents);ok(await call(role,{data:d}));assert.equal(C(ep.balanceOf(ok(await call(role)).data.verticals.epicerie.data.carnet[0])),cents);}));
await strict('CRB-1 · legacy offline refund counterentries are refused; real owner refunds cap the advance and replay once',fc.asyncProperty(money,async paid=>{reset();const d=blank();append(d,'e0','pay',paid);ok(await call(0,{data:d}));const ds=[{doc:clone(d),rev:1},{doc:clone(d),rev:1}];for(let i=0;i<2;i++){append(ds[i].doc,'e'+(i+1),'debt',paid);hist(ds[i].doc).at(-1).label='TEST KIWI refund';assert.equal((await call(i,{data:ds[i].doc,baseRev:1})).status,409);}const refund=async id=>{const r=await onRequestPost({env:f.env,request:new Request('https://kiwi.test/api/store',{method:'POST',headers:{Cookie:cookies.owner,'Content-Type':'application/json'},body:JSON.stringify({merchant:f.merchant,feature:'verticalops',action:'credit-book-refund',clientId:'client',id,amountCents:paid,method:'transfer'})})});return {status:r.status,body:await r.json()};};const rs=await Promise.all([refund('refund-device-a'),refund('refund-device-b')]);assert.equal(rs.filter(r=>r.status===200).length,1);const id=rs[0].status===200?'refund-device-a':'refund-device-b';ok(await refund(id));const hs=hist(ok(await call('owner')).data);assert.equal(hs.filter(h=>h.kind==='advance-refund').reduce((n,h)=>n+C(h.amt),0),paid);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sales WHERE channel='credit-book'").get().n,1);}),[[1]]);
await strict('advance refunds require the owner, exact available cents and immutable history',fc.asyncProperty(money,async paid=>{
 reset();const d=blank();append(d,'e0','pay',paid);ok(await call(0,{data:d}));
 for(const role of ['operator',0,'foreignOwner','none'])assert.ok([401,403].includes((await creditRefund(role,'auth-refund',paid)).status));
 assert.equal((await creditRefund('owner','too-much-refund',paid+1)).status,409);
 assert.equal((await creditRefund('owner','fraction-refund',paid+.5)).status,400);
 ok(await creditRefund('owner','owner-refund',paid));
 assert.equal((await creditRefund('owner','owner-refund',paid+1)).status,409);
 const b=ok(await call('owner')),erase=clone(b.data);hist(erase).splice(0,1);
 assert.equal((await call('owner',{data:erase,baseRev:b.rev})).status,409);
 const tamper=clone(b.data);hist(tamper).at(-1).amt=0;
 assert.equal((await call(0,{data:tamper,baseRev:b.rev})).status,409);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sale_audit WHERE action='credit-book-refund'").get().n,1);
}));
await strict('CRB-2 · operator without owner session or paired till may write the credit book through the shared tenant policy',fc.asyncProperty(money,async cents=>{reset();const d=blank();append(d,'e0','debt',cents);const r=await call('operator',{data:d});return r.status===401||r.status===403;}),[[1]]);
}finally{f.close();}
console.log(`credit-book-properties · ${passed} passed, ${failed} failed, ${known} known; seed=${SEED}; runs=${RUNS}`);if(failed)process.exit(1);
