#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet as listKeys, onRequestPost as changeKeys } from '../functions/api/agent/keys.js';
import { onRequestPost as query } from '../functions/api/agent/query.js';
import { onRequestPost as action } from '../functions/api/agent/action.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));
const now=Date.now(), secret='agent-test-secret-012345678901234567890', aid='acc-agent-owner', other='acc-other-owner';
sql.prepare('INSERT INTO accounts (id,email,salt,hash,created_ts) VALUES (?,?,?,?,?)').run(aid,'owner@agent.test','s','h',now);
sql.prepare('INSERT INTO accounts (id,email,salt,hash,created_ts) VALUES (?,?,?,?,?)').run(other,'other@agent.test','s','h',now);
for (const [m,a] of [['agent-shop',aid],['other-shop',other]])
  sql.prepare('INSERT INTO merchant_config (merchant,features,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?)').run(m,'{}',a,m,'active',now);
sql.prepare('INSERT INTO sales (id,merchant,amount,amount_cents,method,ts) VALUES (?,?,?,?,?,?)')
  .run('sale-own','agent-shop',100,10000,'cash',now);
sql.prepare('INSERT INTO sales (id,merchant,amount,amount_cents,method,ts) VALUES (?,?,?,?,?,?)')
  .run('sale-other','other-shop',500,50000,'card',now);
sql.prepare(`INSERT INTO sales (id,merchant,amount,amount_cents,method,ts,void_ts,void_reason,void_actor_id)
  VALUES (?,?,?,?,?,?,?,?,?)`).run('sale-void','agent-shop',20,2000,'cash',now,now,'formation','staff-1');
sql.prepare(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
  VALUES (?,?,?,?,?,?,?,?,?,?)`).run('order-own','agent-shop',12,'table','4',100,
  JSON.stringify([{id:'p1',name:'T-shirt',qty:1,unitPrice:100}]),'accepted',now,now);
sql.prepare(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
  VALUES (?,?,?,?,?,?,?,?,?,?)`).run('order-other','other-shop',13,'table','5',900,'[]','pending',now,now);
sql.prepare(`INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts)
  VALUES (?,?,?,?,?,?,?)`).run('tsx-secret-guest-capability','agent-shop','table','4','open',now,now);
sql.prepare(`INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts)
  VALUES (?,?,?,?,?,?,?)`).run('tsx-other-secret','other-shop','table','5','open',now,now);
sql.prepare('UPDATE orders SET session_id=? WHERE id=?').run('tsx-secret-guest-capability','order-own');
sql.prepare(`INSERT INTO cash_session_events (id,merchant,session_id,terminal_id,event_type,actor_id,opened_ts,occurred_ts)
  VALUES (?,?,?,?,?,?,?,?)`).run('cash-own','agent-shop','cash-session-secret','term-1','open','staff-1',now,now);
sql.prepare(`INSERT INTO payment_refund_reservations (merchant,command_id,reference,amount_cents,status,created_ts,updated_ts)
  VALUES (?,?,?,?,?,?,?)`).run('agent-shop','refund-own','sale-own',1000,'pending',now,now);
sql.prepare(`INSERT INTO payment_refund_reservations (merchant,command_id,reference,amount_cents,status,created_ts,updated_ts)
  VALUES (?,?,?,?,?,?,?)`).run('other-shop','refund-other','sale-other',9000,'pending',now,now);
sql.prepare('INSERT INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,?,?)')
  .run('agent-shop',JSON.stringify({products:[{id:'p1',name:'T-shirt',priceMAD:200}]}),1,now);
class Statement {
  constructor(q){this.q=q;this.args=[];}
  bind(...a){this.args=a.map(x=>x===undefined?null:x);return this;}
  async first(){return sql.prepare(this.q).get(...this.args)??null;}
  async all(){return {results:sql.prepare(this.q).all(...this.args)};}
  async run(){const r=sql.prepare(this.q).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}};}
}
const DB={prepare:q=>new Statement(q),async batch(stmts){
  sql.exec('BEGIN IMMEDIATE');
  try {const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}
  catch(e){sql.exec('ROLLBACK');throw e;}
}};
const env={DB,AUTH_SECRET:secret};
const cookie=sessionCookie(await makeSession(aid,secret)).split(';')[0];
const otherCookie=sessionCookie(await makeSession(other,secret)).split(';')[0];
const url='https://kiwi.test';
const req=(path,method='POST',data={},headers={})=>new Request(url+path,{
  method,headers:{'Content-Type':'application/json',...headers},
  ...(method==='GET'?{}:{body:JSON.stringify(data)}),
});
const ownerReq=(path,data,c=cookie)=>req(path,'POST',data,{Cookie:c,Origin:url});
const agentReq=(path,data,token)=>req(path,'POST',data,{Authorization:'Bearer '+token});
const out=async r=>({status:r.status,data:await r.json()});
const ownerKey=async x=>out(await changeKeys({env,request:ownerReq('/api/agent/keys',x)}));
const runQuery=async(x,t)=>out(await query({env,request:agentReq('/api/agent/query',x,t)}));
const runAction=async(x,t)=>out(await action({env,request:agentReq('/api/agent/action',x,t)}));
let n=0;const check=(v,msg)=>{assert.ok(v,msg);n++;};
const noOwner=await out(await changeKeys({env,request:ownerReq('/api/agent/keys',{action:'create',merchant:'agent-shop',label:'QA agent',scopes:['overview:read'],expiresInDays:7},otherCookie)}));
check(noOwner.status===401,'other owner cannot mint');
const invalid=await ownerKey({action:'create',merchant:'agent-shop',label:'QA agent',scopes:['all'],expiresInDays:7});
check(invalid.status===400,'no all-powerful scope');
const crossOrigin=await out(await changeKeys({env,request:req('/api/agent/keys','POST',{action:'create',merchant:'agent-shop'}, {Cookie:cookie,Origin:'https://evil.test'})}));
check(crossOrigin.status===403,'no cross-origin key creation');
const minted=await ownerKey({action:'create',merchant:'agent-shop',label:'QA agent',
  scopes:['overview:read','sales:read','catalog:read','clients:read','clients:create',
    'orders:read','tables:read','payments:read','cash:read','operations:read','operations:write'],expiresInDays:7});
check(minted.status===201 && /^kwa\./.test(minted.data.token),'owner can mint');
const token=minted.data.token,id=minted.data.key.id;
check(!fs.readFileSync(path.join(root,'schema.sql'),'utf8').includes(token),'secret not in schema');
check(sql.prepare('SELECT token_hash FROM agent_keys WHERE id=?').get(id).token_hash!==token,'secret only hashed');
const listing=await out(await listKeys({env,request:req('/api/agent/keys?merchant=agent-shop','GET',null,{Cookie:cookie})}));
check(listing.status===200 && !JSON.stringify(listing.data).includes(token),'secret never listed');
const otherList=await out(await listKeys({env,request:req('/api/agent/keys?merchant=other-shop','GET',null,{Cookie:cookie})}));
check(otherList.status===401,'no cross-merchant listing');
const overview=await runQuery({tool:'merchant_overview',merchant:'other-shop'},token);
check(overview.status===200 && overview.data.merchant==='agent-shop','body merchant ignored');
const day=new Date(now).toISOString().slice(0,10);
const sales=await runQuery({tool:'sales_summary',from:day,to:day},token);
check(sales.status===200 && sales.data.rows.length===1 && sales.data.rows[0].amount_cents===10000,'sales tenant-bound');
const orders=await runQuery({tool:'orders_list',from:day,to:day,merchant:'other-shop'},token);
check(orders.status===200 && orders.data.orders.length===1 && orders.data.orders[0].id==='order-own','individual orders tenant-bound');
check(orders.data.orders[0].lines[0].name==='T-shirt' && !JSON.stringify(orders.data).includes('order-other'),'order lines returned, other tenant absent');
const orderDetail=await runQuery({tool:'order_detail',id:'order-own'},token);
check(orderDetail.status===200 && orderDetail.data.order.status==='accepted','order detail readable');
check((await runQuery({tool:'order_detail',id:'order-other'},token)).status===404,'cross-merchant order ID denied');
const sessions=await runQuery({tool:'table_sessions',from:day,to:day},token);
check(sessions.status===200 && sessions.data.sessions.length===1 && sessions.data.sessions[0].table_no==='4' &&
  sessions.data.sessions[0].order_count===1,'table session tenant-bound with order count');
check(!JSON.stringify(sessions.data).includes('tsx-secret-guest-capability'),'guest bearer session ID redacted');
const active=await runQuery({tool:'active_tables'},token);
check(active.status===200 && active.data.tables.length===1 && active.data.tables[0].table_no==='4' &&
  active.data.tables[0].order_count===1,'active table view tenant-bound with order count');
check(!JSON.stringify(active.data).includes('tsx-secret-guest-capability'),'active view redacts guest bearer session ID');
const payments=await runQuery({tool:'payment_events',from:day,to:day},token);
check(payments.status===200 && payments.data.payments.length===2 &&
  payments.data.payments.some(x=>x.id==='sale-own' && x.amount_cents===10000),'individual payment tenant-bound');
check(payments.data.payments.some(x=>x.id==='sale-void' && x.void_reason==='formation' && x.void_actor_id==='staff-1'),
  'voided payment remains visible with actor');
const refunds=await runQuery({tool:'refund_events',from:day,to:day},token);
check(refunds.status===200 && refunds.data.refunds.length===1 && refunds.data.refunds[0].command_id==='refund-own','refund event tenant-bound');
const cash=await runQuery({tool:'cash_events',from:day,to:day},token);
check(cash.status===200 && cash.data.events.length===1 && cash.data.events[0].id==='cash-own','cash events tenant-bound');
check((await runQuery({tool:'orders_list',from:day,to:day,offset:1001},token)).status===400,'pagination bounded');
const catalog=await runQuery({tool:'catalog_search',query:'shirt'},token);
check(catalog.status===200 && catalog.data.products[0].name==='T-shirt','catalog compact search');
const hotel=await runQuery({tool:'hotel_stays',from:day,to:day},token);
check(hotel.status===403,'hotel scope denied');
const broad=await runQuery({tool:'sales_summary',from:'2026-01-01',to:'2026-03-01'},token);
check(broad.status===400,'date range bounded');
const bad=await runQuery({tool:'merchant_overview'},token+'x');
check(bad.status===403,'altered token denied');
const oversized=await runQuery({tool:'catalog_search',query:'x'.repeat(9000)},token);
check(oversized.status===400,'streamed request body bounded');
const readOnly=await ownerKey({action:'create',merchant:'agent-shop',label:'Read only',
  scopes:['overview:read'],expiresInDays:1});
check(readOnly.status===201,'read-only key minted');
check((await runAction({action:'create_client',requestId:'readonly-request-0001',name:'Never Written',phone:'0611223344'},
  readOnly.data.token)).status===403,'read-only key cannot write');
check((await runQuery({tool:'clients_search',query:'Never'},readOnly.data.token)).status===403,'PII requires distinct scope');
check((await runQuery({tool:'orders_list',from:day,to:day},readOnly.data.token)).status===403,'orders require own scope');
check((await runAction({action:'create_operations_note',requestId:'readonly-note-request-0001',note:'Never written'},readOnly.data.token)).status===403,'notes require write scope');
sql.prepare('UPDATE agent_keys SET expires_ts=? WHERE id=?').run(now-1,readOnly.data.key.id);
check((await runQuery({tool:'merchant_overview'},readOnly.data.token)).status===403,'expiry enforced');
const rid='client-request-20260912-0001';
const first=await runAction({action:'create_client',requestId:rid,name:'QA Client',phone:'0611223344'},token);
check(first.status===201 && first.data.id.startsWith('agent-'),'client creation');
const replay=await runAction({action:'create_client',requestId:rid,name:'QA Client',phone:'0611223344'},token);
check(replay.status===200 && replay.data.replayed && replay.data.id===first.data.id,'retry reuses client');
const altered=await runAction({action:'create_client',requestId:rid,name:'Different Name',phone:'0611223344'},token);
check(altered.status===409,'changed retry payload conflicts');
check(sql.prepare('SELECT COUNT(*) AS n FROM clients WHERE merchant=?').get('agent-shop').n===1,'no duplicate');
check(sql.prepare('SELECT COUNT(*) AS n FROM clients WHERE merchant=?').get('other-shop').n===0,'no cross-tenant write');
check(sql.prepare('SELECT COUNT(*) AS n FROM agent_audit WHERE key_id=? AND action=?').get(id,'create_client').n===1,'write audited once');
const noteId='note-request-20260912-0001';
const note=await runAction({action:'create_operations_note',requestId:noteId,note:'Check the kitchen printer'},token);
check(note.status===201 && note.data.id.startsWith('agent-'),'operations note created');
const noteReplay=await runAction({action:'create_operations_note',requestId:noteId,note:'Check the kitchen printer'},token);
check(noteReplay.status===200 && noteReplay.data.replayed && noteReplay.data.id===note.data.id,'note retry idempotent');
check((await runAction({action:'create_operations_note',requestId:noteId,note:'Different note'},token)).status===409,'note idempotency conflict');
const notes=await runQuery({tool:'operations_notes',from:day,to:day},token);
check(notes.status===200 && notes.data.notes.length===1 && notes.data.notes[0].body==='Check the kitchen printer','note visible via read API');
check(sql.prepare('SELECT COUNT(*) AS n FROM agent_audit WHERE key_id=? AND action=?').get(id,'create_operations_note').n===1,'note audited once');
check(sql.prepare('SELECT COUNT(*) AS n FROM operator_notes WHERE merchant=?').get('other-shop').n===0,'no cross-tenant note');
const taskId='task-request-20260912-0001';
const task=await runAction({action:'create_task',requestId:taskId,title:'Check printer',priority:2},token);
check(task.status===201 && task.data.id.startsWith('agent-'),'task created');
check((await runAction({action:'create_task',requestId:taskId,title:'Check printer',priority:2},token)).data.replayed,'task retry idempotent');
check((await runAction({action:'create_task',requestId:taskId,title:'Different task',priority:2},token)).status===409,'task retry conflict');
const tasks=await runQuery({tool:'operations_tasks',from:day,to:day},token);
check(tasks.status===200 && tasks.data.tasks.length===1 && tasks.data.tasks[0].id===task.data.id,'task readable');
check(sql.prepare('SELECT COUNT(*) AS n FROM operator_task_events WHERE merchant=?').get('agent-shop').n===1,'task event written once');
check(sql.prepare('SELECT COUNT(*) AS n FROM operator_tasks WHERE merchant=?').get('other-shop').n===0,'no cross-tenant task');
const client=await runQuery({tool:'clients_search',query:'QA Client'},token);
check(client.status===200 && client.data.clients[0].id===first.data.id,'client searchable');
const noId=await runAction({action:'create_client',name:'Bad Client',phone:'0611223344'},token);
check(noId.status===400,'idempotency required');
const paused=await ownerKey({action:'pause',merchant:'agent-shop',id});
check(paused.status===200,'owner pause');
check((await runQuery({tool:'merchant_overview'},token)).status===403,'pause takes effect');
check((await ownerKey({action:'resume',merchant:'agent-shop',id})).status===200,'owner resume');
check((await runQuery({tool:'merchant_overview'},token)).status===200,'resume takes effect');
sql.prepare('UPDATE accounts SET session_epoch=1 WHERE id=?').run(aid);
check((await runQuery({tool:'merchant_overview'},token)).status===403,'password/session epoch invalidates agent key');
sql.prepare('UPDATE accounts SET session_epoch=0 WHERE id=?').run(aid);
check((await ownerKey({action:'revoke',merchant:'agent-shop',id})).status===200,'owner revokes');
check((await runQuery({tool:'merchant_overview'},token)).status===403,'revocation effective');
check((await ownerKey({action:'resume',merchant:'agent-shop',id})).status===404,'revocation irreversible');
sql.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run(other,'agent-shop');
sql.prepare('UPDATE agent_keys SET expires_ts=? WHERE id=?').run(now+86400000,readOnly.data.key.id);
check((await runQuery({tool:'merchant_overview'},readOnly.data.token)).status===403,'ownership transfer denies old key');
check(!fs.readFileSync(path.join(root,'tools/kiwi-agent-mcp/server.js'),'utf8').includes(token),'no token in MCP source');
const mcp=spawnSync(process.execPath,[path.join(root,'tools/kiwi-agent-mcp/server.js')],{
  input:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}})+'\n'+
    JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n',encoding:'utf8',timeout:5000,
});
check(mcp.status===0,'MCP server exits cleanly');
const messages=mcp.stdout.trim().split('\n').map(JSON.parse);
check(messages[0].result.serverInfo.name==='kiwi-agent','MCP initialization');
check(messages[1].result.tools.length===17 && !messages[1].result.tools.some(x=>/generic|http/i.test(x.name)),'MCP tools bounded');
const received=[];
const bridge=createServer((request,reply)=>{
  let s='';request.on('data',c=>{s+=c;});
  request.on('end',()=>{
    received.push({path:request.url,authorization:request.headers.authorization,body:JSON.parse(s)});
    reply.setHeader('Content-Type','application/json');reply.end(JSON.stringify({ok:true,merchant:'agent-shop'}));
  });
});
await new Promise(resolve=>bridge.listen(0,resolve));
const child=spawn(process.execPath,[path.join(root,'tools/kiwi-agent-mcp/server.js')],{
  env:{...process.env,KIWI_AGENT_BASE:'http://localhost:'+bridge.address().port,KIWI_AGENT_TOKEN:token},
  stdio:['pipe','pipe','pipe'],
});
const answer=new Promise((resolve,reject)=>{
  let s='';child.stdout.on('data',c=>{s+=c;const lines=s.trim().split('\n');if(lines.length>=2 && s.endsWith('\n'))resolve(lines.map(JSON.parse));});
  child.on('error',reject);child.on('exit',code=>{if(!s)reject(new Error('MCP exited '+code));});
});
child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',
  params:{name:'sales_summary',arguments:{from:day,to:day}}})+'\n'+
  JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/call',
    params:{name:'create_task',arguments:{requestId:'mcp-task-request-0001',title:'Check printer'}}})+'\n');
let timeoutId;
const callResult=await Promise.race([answer,new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('MCP timeout')),5000);})]);
clearTimeout(timeoutId);
check(callResult.every(x=>x.result.content[0].type==='text'),'MCP calls return compact text');
check(received.some(x=>x.path==='/api/agent/query' && x.body.tool==='sales_summary'),'MCP read uses bounded gateway route');
check(received.some(x=>x.path==='/api/agent/action' && x.body.action==='create_task'),'MCP write uses bounded action route');
check(received.every(x=>x.authorization==='Bearer '+token),'MCP forwards bearer only in Authorization header');
await new Promise(resolve=>bridge.close(resolve));
check(fs.readFileSync(path.join(root,'functions/_middleware.js'),'utf8').includes("path === '/api/agent/query' || path === '/api/agent/action'"),
  'only exact bearer endpoints bypass account gate');
sql.exec('DROP TABLE agent_audit; DROP TABLE agent_keys');
check((await runQuery({tool:'merchant_overview'},token)).status===403,'missing key table fails closed');
sql.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run(aid,'agent-shop');
const healed=await ownerKey({action:'create',merchant:'agent-shop',label:'Newly migrated',
  scopes:['overview:read'],expiresInDays:1});
check(healed.status===201,'owner provisioning self-heals missing tables');
console.log('kiwi-agent-access-test: '+n+' controls green');
