// Local D1 semantics: statement-level atomicity and serialized atomic batches.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {makeSession,SESS_COOKIE,tillToken,tillDeviceToken,TILL_COOKIE,operatorToken,operatorIdToken,managerRefundProof} from '../functions/auth/_lib.js';
import {onRequestPost as sale} from '../functions/api/sale.js';
import {onRequestPost as refund} from '../functions/api/sale/refund.js';
import {onRequestPost as collect,onRequestGet as receivables} from '../functions/api/receivables.js';
import {onRequestPost as credit} from '../functions/api/store-credits.js';
import {onRequestGet as balances} from '../functions/api/retail-balances.js';
import {onRequestPost as z} from '../functions/api/z-reconciliation.js';
import {onRequestGet as feed} from '../functions/api/feed.js';
import {onRequestPost as admin} from '../functions/api/admin/sales.js';
export async function fixture(root){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));
 let queue=Promise.resolve(),gate=null;const trace=[];
 const financial=/(?:INSERT(?: OR IGNORE)? INTO (?:sales|retail_balance_receipts|store_credits)|UPDATE store_credits|INSERT INTO delivery_collections)/i;
 function schedule(query,execute){
  if(!gate||gate.seen>=2||!financial.test(query))return execute();
  const active=gate;active.seen++;
  return new Promise((resolve,reject)=>{active.waiters.push(()=>{try{resolve(execute());}catch(e){reject(e);}});if(active.seen===2){clearTimeout(active.timer);for(const resume of active.waiters)queueMicrotask(resume);}});
 }
 const DB={prepare(query){let args=[];const s={query,bind(...values){if(values.length>100)throw Error('D1 bound parameter limit');args=values;return s;},run(){return schedule(query,()=>{trace.push(query);const r=sql.prepare(query).run(...args);return{success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};});},first(){trace.push(query);return sql.prepare(query).get(...args)||null;},all(){trace.push(query);return{results:sql.prepare(query).all(...args)};}};return s;},
 batch(statements){const execute=()=>{sql.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}};return schedule(statements.map(s=>s.query).join('\n'),()=>{const task=queue.then(execute,execute);queue=task.catch(()=>{});return task;});}};
 const merchant='server-money-shop',secret='fake-server-money-secret',env={DB,AUTH_SECRET:secret};
 sql.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('money-owner','money@example.test','Server Properties','s','h',?,'active')").run(Date.now());
 for(const m of [merchant,'server-other-shop'])sql.prepare("INSERT INTO merchant_config(merchant,account_id,features,name,type,status,till_epoch,updated_ts) VALUES(?,'money-owner','{}','Properties','boutique','active',0,?)").run(m,Date.now());
 sql.prepare("INSERT INTO clients(merchant,id,name) VALUES(?,'client-fixture','Client')").run(merchant);
 sql.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('money-operator','Property Operator','s','h',1)");
 const cookies={owner:`${SESS_COOKIE}=${await makeSession('money-owner',secret)}`,till:`${TILL_COOKIE}=${await tillToken(secret,merchant)}`,operator:`kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret,'money-operator')}`};
 /* Caisses appairées à jeton d'appareil (`<millésime>.<appareil>.<hmac>`) ; `shared` = la même tablette où le propriétaire est aussi connecté. */
 const devices={a:'term_fixture_device_a',b:'term_fixture_device_b'};
 cookies.deviceA=`${TILL_COOKIE}=${await tillDeviceToken(secret,merchant,0,devices.a)}`;cookies.deviceB=`${TILL_COOKIE}=${await tillDeviceToken(secret,merchant,0,devices.b)}`;cookies.sharedA=cookies.deviceA+'; '+cookies.owner;
 const routes={sale,refund,collect,credit,z,admin,feed,balances,receivables};
 async function call(route,body={},role='till'){
  const get=['feed','balances','receivables'].includes(route),url=new URL('https://kiwi.test/api/'+route);
  if(get)for(const[k,v]of Object.entries({merchant,...body}))url.searchParams.set(k,String(v));
  const request=new Request(url,{method:get?'GET':'POST',headers:{Cookie:cookies[role]||'', 'Content-Type':'application/json'},...(get?{}:{body:JSON.stringify({merchant,...body})})});
  const response=await routes[route]({request,env});return{status:response.status,body:await response.json()};
 }
 const tables=['sale_sync_conflicts','sale_settlement_keys','sale_receipts','sale_audit','sale_changes','sale_invoices','delivery_collections','retail_balance_receipts','retail_balances','store_credit_events','store_credits','z_reconciliations','sales'];
 return{sql,DB,env,merchant,devices,trace,call,async race(work){const active={seen:0,waiters:[],timer:null};gate=active;const timeout=new Promise((_,reject)=>{active.timer=setTimeout(()=>reject(Error('Race failed to reach both financial writes')),5000);});try{const result=await Promise.race([work(),timeout]);if(active.seen!==2)throw Error('Race did not synchronize both requests');return result;}finally{clearTimeout(active.timer);gate=null;}},close:()=>sql.close(),async reset(){await queue;for(const t of tables)if(sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t))sql.exec('DELETE FROM '+t);trace.length=0;},
 insert(id,cents,extra={}){sql.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,label,ref,ts,lines,channel,tip_cents,payment_parts,void_ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,extra.merchant||merchant,Math.round(cents/100),cents,extra.method||'cash',extra.label||id,extra.ref||id,extra.ts||Date.now(),JSON.stringify(extra.lines||[{n:'Article',q:1,t:Math.abs(cents)/100}]),extra.channel||'counter',extra.tip||null,extra.parts?JSON.stringify(extra.parts):null,extra.voided?Date.now():null);},
 async refund(id,originalSaleId,amountCents){const approval=await managerRefundProof(secret,{merchant,staffId:'manager-fixture',staffName:'Fixture Manager',staffRole:'manager',refundId:id,originalSaleId,amountCents});return call('refund',{id,originalSaleId,amountCents,approval,reason:'Property return',ref:id});},
 row:id=>sql.prepare('SELECT * FROM sales WHERE merchant=? AND id=?').get(merchant,id),
 net:()=>Number(sql.prepare('SELECT COALESCE(SUM(amount_cents),0) AS cents FROM sales WHERE merchant=? AND void_ts IS NULL').get(merchant).cents),
 };
}
