// Real store-credit endpoint on isolated SQLite, including authentication.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../functions/api/store-credits.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
export async function ledger(root) {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));
 const DB={prepare(sql){let args=[];const s={bind(...v){args=v;return s;},run(){return{meta:{changes:sqlite.prepare(sql).run(...args).changes}};},first(){return sqlite.prepare(sql).get(...args)||null;},all(){return{results:sqlite.prepare(sql).all(...args)};}};return s;},batch(ss){sqlite.exec('BEGIN IMMEDIATE');try{const out=ss.map(s=>s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const merchant='retail-property-shop',secret='fake-retail-property-secret';
 sqlite.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('property-owner','retail@example.test','Properties','salt','hash',?,'active')").run(Date.now());
 sqlite.prepare("INSERT INTO merchant_config(merchant,features,name,type,status,till_epoch,updated_ts,account_id) VALUES(?,'{}','Properties','boutique','active',0,?,'property-owner')").run(merchant,Date.now());
 const cookie=`${SESS_COOKIE}=${await makeSession('property-owner',secret)}`;let seq=0;
 return{merchant,balance:code=>sqlite.prepare('SELECT balance_cents FROM store_credits WHERE merchant=? AND code=?').get(merchant,code).balance_cents,close:()=>sqlite.close(),sale(cents){const id='sale-property-'+ ++seq;sqlite.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,label,ref,ts,lines) VALUES(?,?,?,?,'cash','Article',?,?,'[]')").run(id,merchant,cents/100,cents,id,Date.now());return id;},
 async post(body){const response=await onRequestPost({request:new Request('https://kiwi.test/api/store-credits',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({merchant,...body})}),env:{DB,AUTH_SECRET:secret}});return{status:response.status,body:await response.json()};}};
}
