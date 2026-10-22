#!/usr/bin/env node
// Real Pages handlers and local SQLite only. Never log bearer credentials.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fixture} from './server-money-fixture.mjs';
import * as keys from '../functions/api/channel/keys.js';
import {onRequestPost as deposit} from '../functions/api/channel/order.js';
import * as orders from '../functions/api/order/index.js';
import * as queue from '../functions/api/order/queue.js';
import * as store from '../functions/api/store.js';
import * as feed from '../functions/api/feed.js';
import * as sale from '../functions/api/sale.js';
import {employeeToken,EMPLOYEE_COOKIE,makeSession,SESS_COOKIE} from '../functions/auth/_lib.js';
const ROOT=path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ fast-check unavailable; channel properties skipped');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||100,SEED=Number(process.env.KIWI_PROPERTY_SEED)||20261022;
let passed=0,failed=0,known=0;
async function strict(label,p){if(process.env.KIWI_PROPERTY_ONLY&&!new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(r.failed){failed++;console.error('✗ '+label,r.errorInstance?.message);}else{passed++;console.log('✓ '+label);}}
async function knownIssue(label,p){const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(r.failed&&r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('✗ known property crashed: '+label,r.errorInstance?.message);}else if(r.failed){known++;console.log('○ known: '+label);}else console.log('! promote to strict: '+label);}
const f=await fixture(ROOT),{sql,merchant}=f,other='server-other-shop';
// Match D1 promises, including handlers that attach .catch directly.
const prepare=f.DB.prepare.bind(f.DB);
f.DB.prepare=query=>{const statement=prepare(query);for(const method of ['first','all']){const execute=statement[method].bind(statement);statement[method]=async(...args)=>execute(...args);}return statement;};
sql.exec("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status) VALUES('channel-other','channel@example.test','Other','s','h',1,'active')");
sql.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run('channel-other',other);
sql.prepare("UPDATE merchant_config SET type='restaurant',features=? WHERE merchant=?").run('{"orderpro":true}',merchant);
const cookies={owner:SESS_COOKIE+'='+await makeSession('money-owner',f.env.AUTH_SECRET),other:SESS_COOKIE+'='+await makeSession('channel-other',f.env.AUTH_SECRET)};
const auth=await import('../functions/auth/_lib.js');
cookies.till=auth.TILL_COOKIE+'='+await auth.tillToken(f.env.AUTH_SECRET,merchant);
cookies.otherWithTill=cookies.other+'; '+cookies.till;
cookies.operator='kiwi_op='+await auth.operatorToken(f.env.AUTH_SECRET)+'; kiwi_op_id='+await auth.operatorIdToken(f.env.AUTH_SECRET,'money-operator');
cookies.employee=EMPLOYEE_COOKIE+'='+await employeeToken(f.env.AUTH_SECRET,{merchant,staffId:'staff-channel'});
async function call(handler,body={},headers={},get=false,raw){const url=new URL('https://kiwi.test/api/test');if(get)for(const[k,v]of Object.entries(body))url.searchParams.set(k,v);const pending=[];const r=await handler({env:f.env,request:new Request(url,{method:get?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(get?{}:{body:raw??JSON.stringify(body)})}),waitUntil:p=>pending.push(p)});await Promise.all(pending);return{status:r.status,body:await r.json()};}
function ok(r){assert.equal(r.status,200);return r.body;}
async function reset(){await f.reset();sql.exec('DELETE FROM orders; DELETE FROM channel_links');sql.prepare("UPDATE merchant_config SET status='active' WHERE merchant=?").run(merchant);}
async function mint(){return ok(await call(keys.onRequestPost,{merchant,channel:'generic'},{Cookie:cookies.owner}));}
for(const feature of ['team','employee-access'])sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,?)').run(merchant,feature,JSON.stringify({members:[{id:'staff-channel',firstName:'Staff',function:'serveur',authVersion:0}]}),Date.now());
const base={total:12.34,lines:[{name:'Dish',qty:1,unitPrice:12.34}]};
const send=(token,b=base,raw)=>call(deposit,b,{Authorization:'Bearer '+token},false,raw);
try{
await strict('management excludes tills employees and unrelated owners',fc.asyncProperty(fc.constantFrom('till','employee','other','otherWithTill'),fc.constantFrom('create','list','revoke','pause'),async(role,action)=>{await reset();const k=await mint();const r=await call(action==='list'?keys.onRequestGet:keys.onRequestPost,{merchant,...(action==='create'?{channel:'generic'}:{id:k.key.id,...(action==='revoke'?{revoke:true}:{status:'paused'})})},{Cookie:cookies[role]},action==='list');if(action==='list'&&role.startsWith('other'))assert.ok(!JSON.stringify(r.body).includes(k.key.id));else assert.ok(r.status>=400);assert.equal(sql.prepare('SELECT COUNT(*) n FROM channel_links').get().n,1);assert.equal(sql.prepare('SELECT status FROM channel_links').get().status,'active');}));
await strict('suspended and unpaid stores share invalid credential response',fc.asyncProperty(fc.constantFrom('suspended','pending'),fc.constantFrom('valid','invalid-json','oversize'),async(status,bodyKind)=>{await reset();const k=await mint();sql.prepare('UPDATE merchant_config SET status=? WHERE merchant=?').run(status,merchant);const raw=bodyKind==='invalid-json'?'{':bodyKind==='oversize'?JSON.stringify({...base,padding:'x'.repeat(300000)}):undefined;assert.deepEqual(await send(k.token,base,raw),{status:401,body:{error:'unauthorized'}});assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);}));
await strict('oversize UTF8 body refused without trusting content length',fc.asyncProperty(fc.integer({min:1,max:4}),async(n)=>{await reset();const k=await mint();const raw=JSON.stringify({...base,padding:'é'.repeat(150000+n)});assert.equal((await send(k.token,base,raw)).status,413);assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);}));
await strict('scope pending inert text bounded quantities and concurrent retries',fc.asyncProperty(fc.integer({min:1,max:1000}),fc.string({maxLength:100}),async(q,text)=>{await reset();const k=await mint(),b={...base,merchant:other,slug:other,status:'accepted',ref:'same-ref',customer:{name:text,note:'<img src=x onerror=alert(1)>'},lines:[{name:text,qty:q,unitPrice:12.345}]};const rs=await Promise.all([send(k.token,b),send(k.token,b)]);rs.forEach(ok);assert.equal(rs[0].body.id,rs[1].body.id);const rows=sql.prepare('SELECT * FROM orders').all();assert.equal(rows.length,1);const r=rows[0];assert.equal(r.merchant,merchant);assert.equal(r.status,'pending');assert.equal(r.paid_ts,null);assert.equal(JSON.parse(r.customer).note,b.customer.note);assert.equal(JSON.parse(r.lines)[0].qty,Math.min(99,q));assert.equal(JSON.parse(r.lines)[0].unitPrice,12.35);assert.equal(f.net(),0);}));
await strict('one time secret hashed uniform failures immediate revocation',fc.asyncProperty(fc.constantFrom('wrong','missing','malformed','paused','revoked'),async(kind)=>{await reset();const k=await mint(),secret=k.token.split('.')[2],row=sql.prepare('SELECT * FROM channel_links').get();assert.match(row.hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(row).includes(secret));assert.ok(!JSON.stringify(ok(await call(keys.onRequestGet,{merchant},{Cookie:cookies.owner},true))).includes(secret));let token=k.token;if(kind==='wrong')token=token.slice(0,token.lastIndexOf('.')+1)+'x'.repeat(43);if(kind==='missing')token=token.replace(k.key.id,'chl-nonexistent');if(kind==='malformed')token='kwc.bad';if(kind==='paused'||kind==='revoked')ok(await call(keys.onRequestPost,{merchant,id:k.key.id,...(kind==='paused'?{status:'paused'}:{revoke:true})},{Cookie:cookies.owner}));assert.deepEqual(await send(token),{status:401,body:{error:'unauthorized'}});}));
await strict('bearer and cookie confer no private route authority',fc.asyncProperty(fc.constantFrom('bearer','cookie'),fc.constantFrom('store','feed','sale','queueGet','queuePost','orderGet','orderPost','keysGet','keysPost'),async(transport,route)=>{
 await reset();f.insert('private-channel-receipt',1234);const k=await mint(),o=ok(await send(k.token));
 const headers=transport==='bearer'?{Authorization:'Bearer '+k.token}:{Cookie:SESS_COOKIE+'='+k.token+'; kiwi_till='+k.token+'; kiwi_employee='+k.token+'; kiwi_op='+k.token};
 const routes={store:store.onRequestGet,feed:feed.onRequestGet,sale:sale.onRequestPost,queueGet:queue.onRequestGet,queuePost:queue.onRequestPost,orderGet:orders.onRequestGet,orderPost:orders.onRequestPost,keysGet:keys.onRequestGet,keysPost:keys.onRequestPost};
 const payload={merchant,feature:'team',id:route==='keysPost'?k.key.id:o.id,status:'accepted',revoke:true,...(route==='orderPost'?base:{})};
 const r=await call(routes[route],payload,headers,!['sale','queuePost','orderPost','keysPost'].includes(route));
 // Public status reads and empty feeds must be identical to anonymous reads.
 if(route==='feed'||route==='orderGet')assert.deepEqual(r,await call(routes[route],payload,{},true));else assert.ok(r.status>=400,route+': '+r.status);
 assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(o.id).status,'pending');assert.equal(sql.prepare('SELECT COUNT(*) n FROM channel_links').get().n,1);assert.equal(f.net(),1234);
}));
await strict('invalid totals line counts and queue pressure bounded',fc.asyncProperty(fc.constantFrom('negative','huge','nan','lines','queue'),async(kind)=>{await reset();const k=await mint();let b={...base};if(kind==='negative')b.total=-1;if(kind==='huge')b.total=200000.01;if(kind==='nan')b.total='NaN';if(kind==='lines')b.lines=Array(61).fill(base.lines[0]);if(kind==='queue')for(let i=0;i<60;i++)ok(await send(k.token,{...base,ref:'limit-'+i}));const r=await send(k.token,b);assert.equal(r.status,kind==='queue'?429:400);assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,kind==='queue'?60:0);}));
await strict('staff acceptance is required before kitchen work can advance',fc.asyncProperty(fc.integer({min:1,max:99}),async(q)=>{await reset();const k=await mint(),o=ok(await send(k.token,{...base,lines:[{name:'Dish',qty:q,unitPrice:1}]}));const kitchen=()=>call(queue.onRequestGet,{merchant,role:'kitchen'},{Cookie:cookies.owner},true);assert.equal(ok(await kitchen()).orders.find(r=>r.id===o.id)?.status,'pending');assert.equal((await call(queue.onRequestPost,{merchant,id:o.id,status:'ready'},{Cookie:cookies.owner})).status,409);ok(await call(queue.onRequestPost,{merchant,id:o.id,status:'accepted'},{Cookie:cookies.owner}));assert.ok(ok(await kitchen()).orders.some(r=>r.id===o.id));assert.equal(f.net(),0);}));
await strict('finite money is rounded to centimes rather than stored fractionally',fc.asyncProperty(fc.integer({min:1,max:19999999}),fc.integer({min:1,max:9}),async(cents,fraction)=>{await reset();const k=await mint();ok(await send(k.token,{...base,total:(cents+fraction/10)/100}));const total=sql.prepare('SELECT total FROM orders').get().total;assert.ok(Math.abs(total*100-Math.round(total*100))<1e-7);assert.ok(total>0&&total<=200000);}));
// Count digest-byte visits rather than asserting noisy wall-clock timing.
const comparisonSource=fs.readFileSync(path.join(ROOT,'functions/api/channel/order.js'),'utf8').match(/function sameHex\(a, b\) \{[\s\S]*?\n\}/)[0];
await strict('digest comparison visits every byte regardless of mismatch position',fc.asyncProperty(fc.integer({min:0,max:63}),fc.boolean(),async(position,equal)=>{let visits=0;const comparison=new Function('String','return ('+comparisonSource+')')(value=>({length:String(value).length,charCodeAt(i){visits++;return String(value).charCodeAt(i);}}));const a='a'.repeat(64),b=equal?a:a.slice(0,position)+'b'+a.slice(position+1);assert.equal(comparison(a,b),equal);assert.equal(visits,128);}));
await strict('operator retains explicit key management permission',fc.asyncProperty(fc.constantFrom('generic','glovo','yassir'),async(channel)=>{await reset();const k=ok(await call(keys.onRequestPost,{merchant,channel},{Cookie:cookies.operator}));ok(await call(keys.onRequestGet,{merchant},{Cookie:cookies.operator},true));ok(await call(keys.onRequestPost,{merchant,id:k.key.id,revoke:true},{Cookie:cookies.operator}));}));
await knownIssue('channel total is authoritative, reconciliation with line sum needs a product rule',fc.asyncProperty(fc.integer({min:1,max:100}),async(n)=>{await reset();const k=await mint();ok(await send(k.token,{...base,total:n+100}));return sql.prepare('SELECT total FROM orders').get().total===12.34;}));
}finally{f.close();}
console.log(`${passed} channel properties passed; ${failed} failed; ${known} known; seed=${SEED}; runs=${RUNS}`);process.exitCode=failed?1:0;
