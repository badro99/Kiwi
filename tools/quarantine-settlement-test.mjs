import assert from 'node:assert/strict';
import nativeFs from 'node:fs';
import queueCoreSource from './core-test-source.cjs';
const fs = { ...nativeFs, readFileSync: queueCoreSource.readFileSync };
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as post, onRequestGet as get } from '../functions/api/quarantine.js';
import { onRequest as gate } from '../functions/_middleware.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestPost as refundPost } from '../functions/api/sale/refund.js';
import { onRequestPost as operationsPost } from '../functions/api/operations.js';
import { workspace } from '../functions/api/admin/_workspace.js';
import { makeSession, tillToken } from '../functions/auth/_lib.js';
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
let loseSettlementAck=false, beforeBatch=null;
const DB = { prepare(q) { let args=[]; return { bind(...v) { args=v; return this; }, run() { if(loseSettlementAck && q.includes("SET status = 'approved'")){loseSettlementAck=false;throw Error('lost settlement ack');} return {meta:{changes:sql.prepare(q).run(...args).changes}}; }, first() { return sql.prepare(q).get(...args) || null; }, all() { return {results:sql.prepare(q).all(...args)}; } }; }, batch(rows) { if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();} sql.exec('BEGIN'); try { const out=rows.map(r=>r.run()); sql.exec('COMMIT'); return out; } catch(e) { sql.exec('ROLLBACK'); throw e; } } };
const env={DB, AUTH_SECRET:'synthetic-quarantine-test'};
for (const name of ['fixture-a','fixture-b']) {
  sql.prepare("INSERT INTO accounts(id,email,name,business,salt,hash,created_ts,status,session_epoch) VALUES(?,?,?,?,?,?,?,'active',0)").run(name,name+'@example.test',name,name,'synthetic','synthetic',Date.now());
  sql.prepare("INSERT INTO merchant_config(merchant,account_id,name,features,status,updated_ts) VALUES(?,?,?,'{}','active',?)").run(name,name,name,Date.now());
}
const owner='kiwi_sess='+await makeSession('fixture-a',env.AUTH_SECRET);
const till='kiwi_till='+await tillToken(env.AUTH_SECRET,'fixture-a');
const other='kiwi_sess='+await makeSession('fixture-b',env.AUTH_SECRET);
async function call(body,cookie=till) { const r=await post({env, request:new Request('https://example.test/api/quarantine',{method:'POST',headers:{cookie},body:JSON.stringify({merchant:'fixture-a',...body})})}); return {...await r.json(),httpStatus:r.status}; }
const payload={id:'synthetic-refund',merchant:'fixture-a',kind:'refund',originalSaleId:'synthetic-sale',amountCents:3000,method:'cash',ts:Date.now()};
assert.equal((await call({action:'upload',payload,reason:'manager-required'})).httpStatus,200);
assert.equal((await call({action:'upload',payload})).httpStatus,200);
assert.equal(sql.prepare("SELECT count(*) n FROM operational_commands WHERE domain='quarantine'").get().n,1);
assert.equal((await call({action:'upload',payload:{...payload,amountCents:4000}})).httpStatus,409);
assert.equal((await call({action:'upload',payload},other)).httpStatus,403);
assert.equal((await call({action:'approve',id:payload.id})).httpStatus,403);
sql.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,? ,100,10000,'cash',?)").run('synthetic-sale','fixture-a',Date.now());
loseSettlementAck=true;
assert.equal((await call({action:'approve',id:payload.id},owner)).httpStatus,503);
assert.equal((await call({action:'approve',id:payload.id},owner)).httpStatus,200);
assert.equal(sql.prepare("SELECT count(*) n FROM sales WHERE id=?").get(payload.id).n,1);
assert.equal(sql.prepare("SELECT actor_id FROM sale_audit WHERE note=?").get(payload.id).actor_id,'owner:fixture-a');
const before=sql.prepare('SELECT sum(amount_cents) n FROM sales').get().n;
await call({action:'upload',payload:{...payload,id:'synthetic-decline'}});
assert.equal((await call({action:'decline',id:'synthetic-decline'},owner)).httpStatus,200);
assert.equal((await call({action:'approve',id:'synthetic-decline'},owner)).httpStatus,409);
assert.equal(sql.prepare('SELECT sum(amount_cents) n FROM sales').get().n,before);
await call({action:'upload',payload:{...payload,id:'synthetic-over',amountCents:8000}});
assert.equal((await call({action:'approve',id:'synthetic-over'},owner)).httpStatus,409);
assert.equal(sql.prepare('SELECT sum(amount_cents) n FROM sales').get().n,before);
const listed=await get({env,request:new Request('https://example.test/api/quarantine?merchant=fixture-a',{headers:{cookie:owner}})});
assert.equal(listed.status,200);
assert.equal((await listed.json()).entries.find(r=>r.id==='synthetic-over').status,'approving');
// A refused approval (cap reached) is not a trap: the owner can still decline it.
assert.equal((await call({action:'decline',id:'synthetic-over'},owner)).httpStatus,200);
assert.equal((await call({action:'status',id:'synthetic-over'})).status,'declined');
assert.equal((await call({action:'approve',id:'synthetic-over'},owner)).httpStatus,409);
assert.equal(sql.prepare('SELECT sum(amount_cents) n FROM sales').get().n,before);
// Permanent decisions survive retries; generic operations cannot mutate them.
assert.equal((await call({action:'decline',id:payload.id},owner)).httpStatus,409);
assert.equal((await call({action:'status',id:payload.id})).status,'approved');
assert.equal((await call({action:'status',id:payload.id},other)).httpStatus,403);
const noAuth=await post({env,request:new Request('https://example.test/api/quarantine',{method:'POST',body:JSON.stringify({merchant:'fixture-a',action:'approve',id:payload.id})})});
assert.equal(noAuth.status,403);
assert.equal((await gate({env,request:new Request('https://example.test/api/quarantine',{method:'POST'}),next:()=>new Response('handler',{status:202})})).status,202,'till upload reaches its own auth boundary');
assert.equal((await call({action:'upload',payload:{...payload,id:'wrong-scope',merchant:'fixture-b'}})).httpStatus,400);
const {managerRefundProof}=await import('../functions/auth/_lib.js');
const proof=await managerRefundProof(env.AUTH_SECRET,{merchant:'fixture-a',refundId:'synthetic-clean',originalSaleId:'synthetic-sale',amountCents:1,staffId:'fixture',staffName:'Fixture',staffRole:'manager'});
await call({action:'upload',payload:{...payload,id:'synthetic-clean',approval:proof,nested:{approval:proof}}});
assert.ok(!sql.prepare("SELECT payload FROM operational_commands WHERE idempotency_key='quarantine:synthetic-clean'").get().payload.includes(proof),'approval capabilities excluded recursively');
await call({action:'upload',payload:{...payload,id:'synthetic-open'}});
const report=await workspace(env,'fixture-a');
assert.ok(report.sources.quarantine.rows.some(r=>r.id==='synthetic-open'),'operator sees unresolved even after custody transfer');
assert.ok(!report.sources.quarantine.rows.some(r=>r.id===payload.id),'operator unresolved source excludes settled operations');
// Missing deployment schema fails soft without claiming custody.
const noDB=await post({env:{},request:new Request('https://example.test/api/quarantine',{method:'POST'})});assert.equal(noDB.status,503);
// Approval versus decline has a single durable winner.
await call({action:'upload',payload:{...payload,id:'synthetic-race',amountCents:1000}});
const race=await Promise.all([call({action:'approve',id:'synthetic-race'},owner),call({action:'decline',id:'synthetic-race'},owner)]);
assert.deepEqual(race.map(r=>r.httpStatus).sort(),[200,409]);
assert.equal(sql.prepare("SELECT count(*) n FROM sale_audit WHERE note='synthetic-race'").get().n,race[0].httpStatus===200?1:0);
await call({action:'upload',payload:{...payload,id:'synthetic-concurrent',amountCents:1000}});
const approved=await Promise.all([call({action:'approve',id:'synthetic-concurrent'},owner),call({action:'approve',id:'synthetic-concurrent'},owner)]);
assert.ok(approved.every(r=>r.httpStatus===200));
assert.equal(sql.prepare("SELECT count(*) n FROM sale_audit WHERE note='synthetic-concurrent'").get().n,1);
const bypass=await operationsPost({env,request:new Request('https://example.test/api/operations',{method:'POST',headers:{cookie:owner},body:JSON.stringify({merchant:'fixture-a',commandId:'quarantine:fixture-a:synthetic-over',transition:'completed',confirmed:true})})});
assert.equal(bypass.status,403,'generic command transitions cannot settle quarantine');
const salePayload={merchant:'fixture-a',id:'synthetic-upload-sale',amountCents:5000,method:'cash',ts:Date.now()};
await call({action:'upload',payload:salePayload});
assert.equal((await call({action:'approve',id:salePayload.id},owner)).httpStatus,200,'sales use the real sale rules too');
const saleTotal=sql.prepare('SELECT sum(amount_cents) n FROM sales').get().n;
await call({action:'upload',payload:{...salePayload,id:'synthetic-sale'}});
assert.equal((await call({action:'approve',id:'synthetic-sale'},owner)).httpStatus,409,'conflicting sale remains unresolved');
assert.equal(sql.prepare('SELECT sum(amount_cents) n FROM sales').get().n,saleTotal);
sql.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES('synthetic-credit-cap','fixture-a',100,10000,'cash',?)").run(Date.now());
sql.prepare("INSERT INTO store_credit_events(id,merchant,credit_id,code,action,amount_cents,balance_after_cents,ref_id,actor,detail,ts) VALUES('synthetic-issue','fixture-a','synthetic-voucher','synthetic-voucher','issue',7000,7000,'synthetic-credit-cap','fixture','',?)").run(Date.now());
await call({action:'upload',payload:{...payload,id:'synthetic-refund-credit-cap',originalSaleId:'synthetic-credit-cap',amountCents:4000}});
assert.equal((await call({action:'approve',id:'synthetic-refund-credit-cap'},owner)).httpStatus,409,'issued credits reduce the actual refundable balance');
// Pasta Corner, Sept 2026: the refund names a sale-ref twin that was later
// voided as a duplicate; the live sale is visit-<same tail>. Same store, one
// live row with that tail = the sale. A sale nobody has stays refused.
sql.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts,void_ts) VALUES('sale-ref-aaaa1111-t-tsx-TwinTwinTwinTwinTwinTw-emp','fixture-a',50,5000,'cash',?,?)").run(Date.now(),Date.now());
sql.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES('visit-tsx-TwinTwinTwinTwinTwinTw-emp','fixture-a',50,5000,'cash',?)").run(Date.now());
await call({action:'upload',payload:{...payload,id:'synthetic-twin-refund',originalSaleId:'sale-ref-aaaa1111-t-tsx-TwinTwinTwinTwinTwinTw-emp',amountCents:1500},reason:'manager-required'});
assert.equal((await call({action:'approve',id:'synthetic-twin-refund'},owner)).httpStatus,200,'a refund naming a voided twin settles on the live sale');
assert.equal(sql.prepare("SELECT sale_id FROM sale_audit WHERE note='synthetic-twin-refund'").get().sale_id,'visit-tsx-TwinTwinTwinTwinTwinTw-emp');
assert.equal((await call({action:'approve',id:'synthetic-twin-refund'},owner)).httpStatus,200,'approving again stays one refund');
assert.equal(sql.prepare("SELECT count(*) n FROM sale_audit WHERE note='synthetic-twin-refund'").get().n,1);
// Un paiement de table est enregistré sous l'id de la visite + un suffixe de paiement (Pasta Corner, 215 et 308 MAD).
sql.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES('visit-tsx-PaidPaidPaidPaidPaidPa-emp-f0a61d650f78caf3ad036d31','fixture-a',50,5000,'cash',?)").run(Date.now());
await call({action:'upload',payload:{...payload,id:'synthetic-paid-refund',originalSaleId:'visit-tsx-PaidPaidPaidPaidPaidPa-emp',amountCents:1500},reason:'manager-required'});
assert.equal((await call({action:'approve',id:'synthetic-paid-refund'},owner)).httpStatus,200,'a refund naming the visit settles on its suffixed payment');
assert.equal(sql.prepare("SELECT sale_id FROM sale_audit WHERE note='synthetic-paid-refund'").get().sale_id,'visit-tsx-PaidPaidPaidPaidPaidPa-emp-f0a61d650f78caf3ad036d31');
await call({action:'upload',payload:{...payload,id:'synthetic-gone-refund',originalSaleId:'visit-tsx-GoneGoneGoneGoneGoneGo-emp',amountCents:1500},reason:'manager-required'});
assert.equal((await call({action:'approve',id:'synthetic-gone-refund'},owner)).error,'sale-not-found','a sale the server never received is not guessed');
assert.equal((await call({action:'decline',id:'synthetic-gone-refund'},owner)).httpStatus,200,'the owner can still declare it not done');
const refusedProof=await managerRefundProof(env.AUTH_SECRET,{merchant:'fixture-a',refundId:'synthetic-decline',originalSaleId:'synthetic-sale',amountCents:3000,refundMethod:'cash',staffId:'fixture',staffName:'Fixture',staffRole:'manager'});
const direct=await refundPost({env,request:new Request('https://example.test/api/sale/refund',{method:'POST',headers:{cookie:till},body:JSON.stringify({...payload,id:'synthetic-decline',refundMethod:'cash',approval:refusedProof})})});
assert.equal(direct.status,409,'normal till refund path cannot bypass owner decline');
// A normal refund already in flight must lose to a recorded decline at the
// transaction boundary, even if it read the custody guard before that decision.
const inFlightId='synthetic-inflight';
const inFlightProof=await managerRefundProof(env.AUTH_SECRET,{merchant:'fixture-a',refundId:inFlightId,originalSaleId:'synthetic-sale',amountCents:1000,refundMethod:'cash',staffId:'fixture',staffName:'Fixture',staffRole:'manager'});
beforeBatch=()=>sql.prepare("INSERT INTO operational_commands(id,merchant,domain,action,status,idempotency_key,payload,result,created_ts,updated_ts) VALUES(?,'fixture-a','quarantine','settle','declined',?,?,?,1,1)").run('quarantine:fixture-a:'+inFlightId,'quarantine:'+inFlightId,JSON.stringify({operation:{...payload,id:inFlightId,amountCents:1000},reason:'manager-required'}),JSON.stringify({action:'decline',actorId:'owner:fixture-a',at:1}));
const inFlight=await refundPost({env,request:new Request('https://example.test/api/sale/refund',{method:'POST',headers:{cookie:till},body:JSON.stringify({...payload,id:inFlightId,amountCents:1000,refundMethod:'cash',approval:inFlightProof})})});
assert.equal(inFlight.status,409);
assert.ok(!sql.prepare('SELECT id FROM sales WHERE id=?').get(inFlightId));
sql.exec('DROP TABLE operational_commands');
assert.equal((await call({action:'upload',payload})).httpStatus,503,'missing schema never acknowledges custody');
const ordinary=await salePost({env,request:new Request('https://example.test/api/sale',{method:'POST',headers:{cookie:till},body:JSON.stringify({...salePayload,id:'synthetic-no-migration'})})});
assert.equal(ordinary.status,200,'ordinary tills still sell if custody table is unavailable');
const translations=fs.readFileSync(new URL('../assets/i18n.js',import.meta.url),'utf8');
const dictStart=translations.indexOf('  const T = {')+'  const T = '.length;
const dictEnd=translations.indexOf('\n  };',dictStart)+4;
const dictionaries=vm.runInNewContext('('+translations.slice(dictStart,dictEnd)+')');
for(const locale of ['fr','en','ar']) {
  for(const key of Object.keys(dictionaries.fr).filter(k=>k.startsWith('quarantine.'))) {
    assert.equal(typeof dictionaries[locale][key],'string',locale+' '+key);
    assert.ok(!dictionaries[locale][key].includes('\u2014'));
  }
}
// Exercise the actual till queue and transfer bridge, without a browser.
const stored=new Map([['kiwiLive','1'],['kiwiPairedVenue',JSON.stringify({merchant:'fixture-a'})],
  ['kiwiSaleQueue',JSON.stringify([{...payload,_blocked:true},{...payload,id:'foreign',merchant:'fixture-b',_blocked:true}])]]);
const storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)};
let settled=false, offline=false; const sent=[];
const window={localStorage:storage,KiwiEnv:{isReal:()=>true},addEventListener(){},dispatchEvent(){}};
const context={window,document:{readyState:'loading',addEventListener(){}},localStorage:storage,
  location:{search:'',hostname:'example.test'},CustomEvent:function(){},setInterval(){},setTimeout(){},clearTimeout(){},URLSearchParams,console,
  fetch:async(url,opts)=>{if(offline)throw Error('offline');sent.push(JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,id:payload.id,status:settled?'approved':'pending'})};}};
vm.runInNewContext(fs.readFileSync(new URL('../assets/live-link.js',import.meta.url),'utf8'),context);
assert.equal(window.KiwiLive.queueStatus().blocked,1);
offline=true; await window.KiwiQuarantine.sync();
assert.equal(window.KiwiLive.queueStatus().blocked,1,'failed upload retains debt');
offline=false; await window.KiwiQuarantine.sync();
assert.equal(window.KiwiLive.queueStatus().blocked,0,'server custody quiets the till banner');
assert.equal(window.KiwiLive.queueStatus().pending,0,'server custody is not sendable debt');
assert.equal(window.KiwiLive.queueStatus().held,1);
assert.equal(JSON.parse(stored.get('kiwiSaleQueue')).length,2,'unresolved and foreign rows retained');
settled=true; await window.KiwiQuarantine.sync();
assert.equal(sent[1].action,'status','full payload only sent until custody acknowledged');
assert.equal(window.KiwiLive.queueStatus().held,0);
assert.equal(JSON.parse(stored.get('kiwiSaleQueue')).length,1,'only settled tenant row removed');
// Run the actual IndexedDB API against a transaction shelf, without a browser.
// This tests scope/state guards and banner aggregation; real Dexie durability
// remains covered by the existing browser suites run by the other engineer.
const shelf=new Map();
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
class Dexie {
  constructor(){this.outbox={get:async id=>clone(shelf.get(id)),put:async r=>shelf.set(r.id,clone(r)),delete:async id=>shelf.delete(id),
    where:()=>({equals:([tenant,channel])=>({sortBy:async()=>[...shelf.values()].filter(r=>r.tenant===tenant&&r.channel===channel).map(clone)})})};}
  version(){return {stores(){}};} open(){return Promise.resolve();} transaction(mode,table,fn){return Promise.resolve().then(fn);}
}
window.Dexie=Dexie;
vm.runInNewContext(fs.readFileSync(new URL('../assets/offline-db.js',import.meta.url),'utf8'),context);
await window.KiwiOffline.ready();
stored.set('kiwiSaleQueue','[]');
shelf.set(payload.id,{id:payload.id,tenant:'fixture-a',channel:'sale',state:'blocked',payload:{...payload},lastError:'manager-required'});
await window.KiwiLive.refreshQueue();
assert.equal(window.KiwiLive.queueStatus().blocked,1);
assert.equal(await window.KiwiOffline.quarantineState('sale','fixture-b',payload.id,true),false,'foreign tenant cannot retire a row');
await window.KiwiOffline.quarantineState('sale','fixture-a',payload.id,false);
await window.KiwiLive.refreshQueue();
assert.equal(window.KiwiLive.queueStatus().blocked,0);
assert.equal(window.KiwiLive.queueStatus().held,1);
assert.equal(shelf.size,1);
await window.KiwiOffline.quarantineState('sale','fixture-a',payload.id,true);
await window.KiwiLive.refreshQueue();
assert.equal(window.KiwiLive.queueStatus().held,0);
assert.equal(shelf.size,0);
console.log('✓ quarantine: upload idempotency, isolation, owner authority, approve once, decline revenue, refund caps, actual till custody and settlement');
