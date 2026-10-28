import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import policy from '../assets/admin-policy.js';
import * as auth from '../functions/auth/_lib.js';
import * as tasks from '../functions/api/admin/tasks.js';
import * as notes from '../functions/api/admin/notes.js';
import * as workspace from '../functions/api/admin/workspace.js';
import * as config from '../functions/api/admin/config.js';
import * as clients from '../functions/api/admin/clients.js';
import * as overview from '../functions/api/admin/overview.js';
import * as errors from '../functions/api/admin/errors.js';
import * as support from '../functions/api/admin/support.js';

// Real routes, real authorization and transactionally faithful D1 adapter.
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
const migration=fs.readFileSync(new URL('../migrations/legacy/2026-09-07-operator-workspace.sql',import.meta.url),'utf8');
db.exec(migration);db.exec(migration);
const DB={prepare(sql){let args=[];const st={bind(...values){assert.ok(values.length<=100);args=values;return st;},first(){return db.prepare(sql).get(...args)||null;},all(){return {results:db.prepare(sql).all(...args)};},run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};return st;},batch(statements){db.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,AUTH_SECRET:crypto.randomUUID(),SITE_PASSWORD:crypto.randomUUID()};
const now=Date.now();
db.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('op-a','Alice','','',1),('op-b','Bob','','',1)");
db.exec("INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES('account-a','a@example.test','Shop A','','',1),('account-b','b@example.test','Shop B','','',1)");
db.exec("INSERT INTO merchant_config(merchant,features,plan,account_id,updated_ts) VALUES('shop-a','{\"menu\":true,\"stock\":true}','pro','account-a',1),('shop-b','{}','pro','account-b',1)");
const token=await auth.operatorToken(env.AUTH_SECRET);
const cookies={operator:`kiwi_op=${token}; kiwi_op_id=${await auth.operatorIdToken(env.AUTH_SECRET,'op-a')}`,other:`kiwi_op=${token}; kiwi_op_id=${await auth.operatorIdToken(env.AUTH_SECRET,'op-b')}`,merchant:`kiwi_sess=${await auth.makeSession('account-a',env.AUTH_SECRET)}`,shared:`kiwi_gate=${await auth.staffToken(env.SITE_PASSWORD)}`,anonymous:''};
async function call(route,method,body={},query='',as='operator',origin){const req=new Request('https://kiwi.test/api/admin/test'+query,{method,headers:{'Content-Type':'application/json',Cookie:cookies[as],...(origin?{Origin:origin}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});const response=await route['onRequest'+method[0]+method.slice(1).toLowerCase()]({request:req,env});return {status:response.status,...await response.json()};}
let checks=0;
function check(name,condition){assert.ok(condition,name);checks++;}
const base={id:'task-first',merchant:'shop-a',title:'Confirm receipt with merchant',detail:'Do not infer physical printing',priority:1,signal_key:'print:job1',assignee:'op-b',due_ts:now+86400000};
for(const as of ['anonymous','merchant','shared']){
  check(as+' cannot read workspace',(await call(workspace,'GET',{},'',as)).status===403);
  check(as+' cannot create task',(await call(tasks,'POST',base,'',as)).status===403);
  check(as+' cannot append note',(await call(notes,'POST',{id:'note-first',merchant:'shop-a',body:'Note'},'',as)).status===403);
}
check('cross-origin write rejected',(await call(tasks,'POST',base,'','operator','https://evil.test')).status===403);
check('unknown merchant rejected',(await call(tasks,'POST',{...base,merchant:'missing'})).status===404);
check('unknown owner rejected',(await call(tasks,'POST',{...base,assignee:'missing'})).status===400);
check('invalid priority rejected',(await call(tasks,'POST',{...base,priority:5})).status===400);
const created=await call(tasks,'POST',base);
check('task created with named actor',created.ok&&created.task.created_by==='op-a'&&created.task.version===1);
check('creation audit',db.prepare('SELECT COUNT(*) n FROM operator_task_events').get().n===1);
const replay=await call(tasks,'POST',base);
check('retry returns original',replay.replayed&&replay.task.id===base.id);
check('retry does not duplicate audit',db.prepare('SELECT COUNT(*) n FROM operator_task_events').get().n===1);
check('same signal deduplicated across devices',(await call(tasks,'POST',{...base,id:'task-second'},'','other')).task.id===base.id);
check('cross-merchant id collision rejected',(await call(tasks,'POST',{...base,merchant:'shop-b'})).status===409);
check('cross-merchant patch rejected',(await call(tasks,'PATCH',{id:base.id,merchant:'shop-b',version:1,status:'resolved',outcome:'Done'})).status===404);
check('resolution needs outcome',(await call(tasks,'PATCH',{id:base.id,merchant:'shop-a',version:1,status:'resolved'})).status===400);
check('past snooze rejected',(await call(tasks,'PATCH',{id:base.id,merchant:'shop-a',version:1,status:'snoozed',snoozed_until:now-1})).status===400);
const concurrent=await Promise.all(['op-a','op-b'].map((_,i)=>call(tasks,'PATCH',{id:base.id,merchant:'shop-a',version:1,status:'in_progress',assignee:i?'op-b':'op-a'},'',i?'other':'operator')));
check('optimistic concurrency exactly one winner',concurrent.filter(r=>r.ok).length===1&&concurrent.filter(r=>r.status===409).length===1);
check('loser writes no audit',db.prepare('SELECT COUNT(*) n FROM operator_task_events').get().n===2);
let task=db.prepare('SELECT * FROM operator_tasks WHERE id=?').get(base.id);
const snoozed=await call(tasks,'PATCH',{id:base.id,merchant:'shop-a',version:task.version,status:'snoozed',snoozed_until:now+86400000});
check('snooze durable',snoozed.task.snoozed_until===now+86400000);
const done=await call(tasks,'PATCH',{id:base.id,merchant:'shop-a',version:snoozed.task.version,status:'resolved',outcome:'Merchant confirmed paper receipt on the phone'});
check('resolution clears snooze with result',done.task.status==='resolved'&&!done.task.snoozed_until&&done.task.outcome.includes('confirmed'));
db.exec("CREATE TRIGGER fail_task_audit BEFORE INSERT ON operator_task_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
const failed=await call(tasks,'POST',{...base,id:'task-failure',signal_key:'print:other'});
check('failed audit rolls back task',failed.status===503&&!db.prepare("SELECT id FROM operator_tasks WHERE id='task-failure'").get());
const failedPatch=await call(tasks,'PATCH',{id:base.id,merchant:'shop-a',version:done.task.version,status:'open'});
check('failed audit rolls back update',failedPatch.status===503&&db.prepare('SELECT status FROM operator_tasks WHERE id=?').get(base.id).status==='resolved');
db.exec('DROP TRIGGER fail_task_audit');
const note={id:'note-first',merchant:'shop-a',body:'Next appointment confirmed.'};
check('note created',(await call(notes,'POST',note)).ok);
check('note replay idempotent',(await call(notes,'POST',note)).ok&&db.prepare('SELECT COUNT(*) n FROM operator_notes').get().n===1);
check('note immutable id rejects changed body',(await call(notes,'POST',{...note,body:'Altered'})).status===409);
check('note cannot move tenant',(await call(notes,'POST',{...note,merchant:'shop-b'})).status===409);
const scoped=await call(workspace,'GET',{},'?merchant=shop-b');
check('dossier scope has no neighbour data',scoped.sources.tasks.available&&!scoped.sources.tasks.rows.length&&!scoped.sources.notes.rows.length&&!scoped.sources.events.rows.length);
check('workspace actor named',(await call(workspace,'GET')).actor.id==='op-a');
db.prepare('INSERT INTO print_bridges(id,merchant,name,token_hash,created_ts,last_seen_ts) VALUES(?,?,?,?,?,?)').run('bridge1','shop-a','Receipt bridge','SECRET-BRIDGE',now,now);
db.prepare('INSERT INTO print_jobs(id,merchant,kind,target,data_b64,status,created_ts,expires_ts) VALUES(?,?,?,?,?,?,?,?)').run('job1','shop-a','receipt','SECRET-TARGET','SECRET-PAYLOAD','failed',now,now+60000);
db.prepare('INSERT INTO client_errors(id,merchant,message,stack,file,count,first_seen_ts,last_seen_ts) VALUES(?,?,?,?,?,?,?,?)').run('err1','shop-a','SECRET-MESSAGE','SECRET-STACK','app.js',2,now,now);
const fleet=await call(workspace,'GET');
check('fleet actual observations',fleet.sources.bridges.rows.length===1&&fleet.sources.print.rows[0].status==='failed'&&fleet.sources.errors.rows[0].count===2);
check('fleet excludes credentials, payloads and stacks',!/SECRET-(BRIDGE|TARGET|PAYLOAD|STACK)/.test(JSON.stringify(fleet)));
check('error keeps its first line so an operator can act on it',fleet.sources.errors.rows[0].message==='SECRET-MESSAGE');
check('physical output never claimed',fleet.physical_print_verified===false);
// Store health: tills append a heartbeat every few minutes; the workspace must
// return each till's latest one, not the latest 500 rows of one busy device.
const beat=(id,m,device,ts,sync)=>db.prepare("INSERT INTO operational_commands(id,merchant,domain,action,status,idempotency_key,payload,created_ts,updated_ts) VALUES(?,?,'device','heartbeat','completed',?,?,?,?)").run(id,m,id,JSON.stringify({deviceId:device,app:'caisse',sync}),ts,ts);
for(let i=0;i<600;i++)beat('hb-busy-'+i,'shop-a','till-busy',now-i*60000,{total:0,blocked:0});
beat('hb-quiet','shop-a','till-quiet',now-20*3600000,{total:1,blocked:1,oldestPendingAt:now-21*3600000,blockedEntries:[{id:'refund-1',amountCents:4500,method:'cash',ts:now,reason:'manager-required'}]});
beat('hb-old','shop-a','till-quiet',now-22*3600000,{total:0,blocked:0});
db.prepare("INSERT INTO z_reconciliations VALUES('shop-a','2026-09-25','till-quiet',10,100000,9,95500,1,4500,0,0,'mismatch',?,?)").run(JSON.stringify({blocked:[{id:'refund-1'}]}),now);
db.prepare("INSERT INTO client_errors(id,merchant,message,file,version,count,first_seen_ts,last_seen_ts) VALUES('err-code','shop-a',?,'assets/x.js','1',1,?,?)").run('Card 4111111111111111 refused for a@b.test\n    at stack (x.js:1)',now,now);
db.prepare("INSERT INTO kiwi_tickets(body,status,kind,money_at_risk,created_ts,updated_ts) VALUES('Board ticket','problem','bug',1,?,?)").run(now,now);
const ws=await call(workspace,'GET');
const tills=ws.sources.caisseSync.rows.filter(r=>r.merchant==='shop-a');
check('one heartbeat row per till, quiet till not crowded out',tills.length===2&&tills.some(r=>r.deviceId==='till-quiet'&&r.sync.blocked===1));
check('each till keeps its latest heartbeat',tills.find(r=>r.deviceId==='till-quiet').updated_ts===now-20*3600000);
check('Z comparison carries blocked count and gap',ws.sources.zChecks.rows[0].blocked_count===1&&ws.sources.zChecks.rows[0].reported_cents-ws.sources.zChecks.rows[0].server_cents===4500);
const errMsg=ws.sources.errors.rows.find(r=>r.id==='err-code').message;
check('error message: first line only, digits and e-mails masked',!errMsg.includes('4111')&&!errMsg.includes('a@b.test')&&!errMsg.includes('stack')&&errMsg.includes('refused'));
db.prepare("INSERT INTO tenant_guard_events VALUES(?,?,?,?,?,?,?)").run(now-60000,'shop-a','costs','shop-b','records',6,6);
db.prepare("INSERT INTO tenant_guard_events VALUES(?,?,?,?,?,?,?)").run(now,'shop-a','costs','shop-b','records',6,6);
db.prepare("INSERT INTO tenant_guard_events VALUES(?,?,?,?,?,?,?)").run(now-20*86400000,'shop-a','menu','shop-b','whole',1,1);
{const g=(await call(workspace,'GET')).sources.tenantGuard.rows;
check('refused cross-store copies grouped per store, feature and source, 14 days',g.length===1&&g[0].attempts===2&&g[0].source_merchant==='shop-b'&&g[0].updated_ts===now);
check('refused copies stay in the writing store dossier',!(await call(workspace,'GET',{},'?merchant=shop-b')).sources.tenantGuard.rows.length);}
db.prepare("INSERT INTO sale_audit (merchant,sale_id,action,reason,note,amount_cents,method,ref,sale_ts,ts) VALUES (?,?,?,?,?,?,?,?,?,?)").run('shop-a','sale-disc','discount-policy','discount-not-allowed','Remise 20 % hors réglage (5 %)',950,'cash','T-12',now-5000,now);
db.prepare("INSERT INTO sale_audit (merchant,sale_id,action,reason,note,amount_cents,method,ref,sale_ts,ts) VALUES (?,?,?,?,?,?,?,?,?,?)").run('shop-a','sale-void','void','erreur','',950,'cash','T-13',now-5000,now);
{const d=(await call(workspace,'GET')).sources.discountPolicy.rows;
check('out-of-policy discounts listed from sale_audit, other audit actions excluded',d.length===1&&d[0].id==='sale-disc'&&d[0].note.includes('20 %'));
check('out-of-policy discounts stay in their store dossier',!(await call(workspace,'GET',{},'?merchant=shop-b')).sources.discountPolicy.rows.length);}
for(const [id,action,reason,note,ts] of [['sale-bk','basket-flag','basket-mismatch','basket-mismatch',now-1000],['sale-ck','clock-flag','clock-skew','clock-skew',now-2000],['sale-old','basket-flag','basket-mismatch','basket-mismatch',now-20*86400000]])
  db.prepare("INSERT INTO sale_audit (merchant,sale_id,action,reason,note,amount_cents,method,ref,sale_ts,ts) VALUES (?,?,?,?,?,?,?,?,?,?)").run('shop-a',id,action,reason,note,1200,'cash','T-'+id,now-5000,ts);
{const f=(await call(workspace,'GET')).sources.saleFlags.rows;
check('basket and clock flags from sale_audit are listed for the operator, 14 days, newest first',f.length===2&&f[0].id==='sale-bk'&&f[0].action==='basket-flag'&&f[1].action==='clock-flag'&&!f.some(r=>r.action==='discount-policy'||r.id==='sale-old'));
check('sale flags stay in their store dossier',!(await call(workspace,'GET',{},'?merchant=shop-b')).sources.saleFlags.rows.length);}
check('product board loaded fleet-wide only',ws.sources.board.rows.length===1&&!(await call(workspace,'GET',{},'?merchant=shop-a')).sources.board);
const health=policy.storeHealth({merchant:'shop-a',last_ts:now},{caisseSync:tills,zChecks:ws.sources.zChecks.rows,activity:[{active_days_7d:5,last_ts:now}],errors:[]},now);
check('blocked sale and Z gap make the store « à traiter »',health.level==='bad'&&health.problems.some(p=>p.includes('bloquée'))&&health.problems.some(p=>p.includes('écart 45 MAD')));
check('a blocked sale is not also counted as merely unconfirmed',!health.problems.some(p=>p.includes('non confirmée')));
check('a regular store gone quiet is « à surveiller »',policy.storeHealth({merchant:'q',last_ts:now-3*86400000},{activity:[{active_days_7d:4,last_ts:now-3*86400000}]},now).level==='warn');
check('a store without sales or tills is inactive, not alarming',policy.storeHealth({merchant:'i'},{},now).level==='idle');
check('matched Z and confirmed sales are normal',policy.storeHealth({merchant:'n',last_ts:now},{caisseSync:[{app:'caisse',deviceId:'t',updated_ts:now,sync:{total:0,blocked:0}}],zChecks:[{status:'matched'}],activity:[{active_days_7d:6,last_ts:now}]},now).level==='good');
// Money signals: synthetic tenants only, exact centimes and escaped rendering.
for (const m of ['shop-a','shop-b']) {
  db.prepare(`INSERT INTO shopify_connections(merchant,shop_domain,access_token_enc,connected_ts,updated_ts,last_error)
    VALUES(?,?,?,?,?,?)`).run(m,m+'.myshopify.com','SECRET-OAUTH',now,now,'Connexion <refusée>');
  db.prepare(`INSERT INTO channel_links(id,merchant,channel,hash,config,created_ts,last_ts,last_err)
    VALUES(?,?,'shopify',?,?, ?,?,?)`).run('link-'+m,m,'SECRET-HASH','SECRET-CONFIG',now,now,'Domaine <inattendu>');
}
for (const [id,m,age,cents,channel,voided] of [
  ['due-old','shop-a',10,40099,'delivery',null],['due-paid','shop-a',10,10000,'delivery',null],
  ['due-new','shop-a',1,10000,'delivery',null],['due-other','shop-b',10,10000,'delivery',null],
  ['due-void','shop-a',10,10000,'delivery',now],['due-store','shop-a',10,10000,'counter',null]]) {
  db.prepare(`INSERT INTO sales(id,merchant,amount,amount_cents,method,payment_parts,channel,ref,ts,void_ts)
    VALUES(?,?,0,0,'delivery',?,?,?,?,?)`).run(id,m,JSON.stringify([{method:'delivery',amountCents:cents}]),channel,'T-'+id,now-age*86400000,voided);
}
db.prepare(`INSERT INTO delivery_collections(merchant,collection_sale_id,sale_id,method,amount_cents,ts)
  VALUES('shop-a','col-paid','due-paid','cash',10000,?),('shop-a','col-part','due-old','cash',50,?),
  ('shop-b','col-neighbour','due-old','cash',40099,?)`).run(now,now,now);
// Tables closed with orders never paid (Pasta Corner, 15 October: 131 MAD).
for (const [id,m,closedBy,age,paid,sale,cancelled] of [
  ['tsx-unpaid','shop-a','caisse',1,null,false,''],['tsx-paid','shop-a','service-payment',1,now,true,''],
  ['tsx-settled','shop-a','caisse',1,null,true,''],['tsx-cancel','shop-a','caisse',1,null,false,'Rim'],
  ['tsx-old','shop-a','caisse',20,null,false,''],['tsx-other','shop-b','caisse',1,null,false,'']]) {
  db.prepare(`INSERT INTO table_sessions(id,merchant,mode,table_no,status,closed_by,closed_actor_name,opened_ts,seen_ts,closed_ts)
    VALUES(?,?,'table','2','closed',?,'Yassine <s>',?,?,?)`).run(id,m,closedBy,now-age*86400000-3600000,now-age*86400000,now-age*86400000);
  for (const [n,total] of [[1,69],[2,62]]) db.prepare(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id,paid_ts,cancel_actor_name)
    VALUES(?,?,?,'table','2',?,'[]','accepted',?,?,?,?,?)`).run(id+'-o'+n,m,n,total,now-age*86400000,now-age*86400000,id,paid,cancelled);
  if (sale) db.prepare(`INSERT INTO sales(id,merchant,amount,amount_cents,method,ts,session_id) VALUES(?,?,131,13100,'cash',?,?)`).run('sale-'+id,m,now-age*86400000,id);
}
/* A split bill paid for one part only (50 of 131 MAD), then the table closed;
   and a table paid in full with a 10 % discount (gross 131, charged 117,90). */
for (const [id,cents,gross] of [['tsx-split',5000,null],['tsx-disc',11790,13100]]) {
  db.prepare(`INSERT INTO table_sessions(id,merchant,mode,table_no,status,closed_by,closed_actor_name,opened_ts,seen_ts,closed_ts)
    VALUES(?,'shop-c','table','5','closed','caisse','Yassine',?,?,?)`).run(id,now-2*3600000,now-3600000,now-3600000);
  for (const [n,total] of [[1,69],[2,62]]) db.prepare(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id,paid_ts,cancel_actor_name)
    VALUES(?,'shop-c',?,'table','5',?,'[]','accepted',?,?,?,NULL,'')`).run(id+'-o'+n,n,total,now-3600000,now-3600000,id);
  db.prepare(`INSERT INTO sales(id,merchant,amount,amount_cents,gross_amount_cents,method,ts,session_id) VALUES(?,'shop-c',?,?,?,'cash',?,?)`).run('sale-'+id,cents/100,cents,gross,now-3600000,id);
}
// A till that found an update and never took it (Santos Store, 21 October).
for (const [id,device,ready,seen] of [['hb-stale','till-stale',now-8*3600000,now-60000],['hb-fresh','till-fresh',now-3600000,now-60000],['hb-gone','till-gone',now-30*3600000,now-5*3600000]])
  db.prepare("INSERT INTO operational_commands(id,merchant,domain,action,status,idempotency_key,payload,created_ts,updated_ts) VALUES(?,?,'device','heartbeat','completed',?,?,?,?)")
    .run(id,'shop-a',id,JSON.stringify({deviceId:device,app:'caisse',sync:{total:0,blocked:0},loadedAt:now-4*86400000,updateReadyAt:ready,secret:'SECRET-BEAT'}),seen,seen);
const moneyWorkspace=await call(workspace,'GET',{},'?merchant=shop-a');
{const st=moneyWorkspace.sources.caisseSync.rows.find(r=>r.deviceId==='till-stale');
check('heartbeat projection keeps page age and update-waiting time',st&&st.loadedAt===now-4*86400000&&st.updateReadyAt===now-8*3600000);
check('heartbeat projection drops unknown fields',!JSON.stringify(moneyWorkspace.sources.caisseSync).includes('SECRET-BEAT'));}
{const t=moneyWorkspace.sources.unpaidTables;
check('only the table closed with unpaid orders, no sale, last 14 days',t?.available&&t.rows.length===1&&t.rows[0].id==='tsx-unpaid');
check('its unpaid total and order count',t.rows[0].unpaid_mad===131&&t.rows[0].orders===2);
const tc=(await call(workspace,'GET',{},'?merchant=shop-c')).sources.unpaidTables,ids=(tc?.rows||[]).map(r=>r.id);
const sp=tc.rows.find(r=>r.id==='tsx-split');
check('a split bill paid for one part shows what is still owed',sp&&sp.unpaid_mad===81&&sp.orders===2);
check('a discounted bill paid in full is not a debt',!ids.includes('tsx-disc'));
check('unpaid tables stay in their store dossier',(await call(workspace,'GET',{},'?merchant=shop-b')).sources.unpaidTables.rows.every(r=>r.merchant==='shop-b'));}
check('only old outstanding courier delivery returned',moneyWorkspace.sources.receivables?.available&&moneyWorkspace.sources.receivables.rows.length===1&&moneyWorkspace.sources.receivables.rows[0].id==='due-old');
check('partial collections keep exact outstanding centimes',moneyWorkspace.sources.receivables.rows[0].total_cents===40099&&moneyWorkspace.sources.receivables.rows[0].remaining_cents===40049);
check('other merchant delivery stays scoped',(await call(workspace,'GET',{},'?merchant=shop-b')).sources.receivables.rows.every(r=>r.merchant==='shop-b'));
check('both Shopify error paths returned',moneyWorkspace.sources.shopifyLink?.available&&moneyWorkspace.sources.shopifyLink.rows.length===2);
check('Shopify errors are scoped',moneyWorkspace.sources.shopifyLink.rows.every(r=>r.merchant==='shop-a'));
check('Shopify projections exclude credentials',!/SECRET-(OAUTH|HASH|CONFIG)/.test(JSON.stringify(moneyWorkspace))&&moneyWorkspace.sources.shopifyLink.rows.every(r=>Object.keys(r).every(k=>!/token|secret|hash|config/i.test(k))));
// Keep all production functions and renderers, replacing only event bootstrap.
const uiSource=fs.readFileSync(new URL('../assets/admin-workspace.js',import.meta.url),'utf8');
const ui=uiSource.slice(0,uiSource.indexOf("  document.addEventListener('click'"))+`
  window.testWorkspace={render:function(data){state.data=data;state.clients=[{merchant:'shop-a'}];return taskRows('shop-a');},signals:allSignals};
})();`;
const win={KiwiAdminPolicy:policy,KiwiOperator:{}};
vm.runInNewContext(ui,{window:win,document:{getElementById(){return {};}}});
const rendered=win.testWorkspace.render(moneyWorkspace);
check('Shopify alerts render both escaped errors',rendered.includes('Shopify signale une erreur')&&rendered.includes('Connexion &lt;refusée&gt;')&&rendered.includes('Domaine &lt;inattendu&gt;')&&!rendered.includes('<refusée>'));
check('delivery alert renders centimes, ticket, age and action',rendered.includes((400.49).toLocaleString('fr-MA',{maximumFractionDigits:2})+' MAD')&&rendered.includes('T-due-old')&&rendered.includes('10 jours')&&rendered.includes('Acomptes ou Créances'));
check('unpaid table alert: table, amount, count, who closed it (escaped)',rendered.includes('Table fermée sans encaissement')&&rendered.includes('Table 2 · 131 MAD')&&rendered.includes('(2)')&&rendered.includes('Yassine &lt;s&gt;')&&!rendered.includes('Yassine <s>'));
check('unpaid table alert has priority two',win.testWorkspace.signals().some(s=>s.title==='Table fermée sans encaissement'&&s.priority===2));
check('stale till alert after six hours of a waiting update, with the button to press',win.testWorkspace.signals().some(s=>s.title==='Caisse sur une ancienne version'&&s.detail.includes('till-stale')&&s.detail.includes('depuis 8 h')&&s.detail.includes('« Rafraîchir »')&&s.priority===2));
check('no stale alert for an update one hour old, nor for a till silent for hours',!win.testWorkspace.signals().some(s=>s.title==='Caisse sur une ancienne version'&&/till-(fresh|gone)/.test(s.detail)));
check('delivery alert has priority two',win.testWorkspace.signals().some(s=>s.title==='Livraison non encaissée'&&s.priority===2));
check('Shopify alerts carry priority and recovery action',win.testWorkspace.signals().filter(s=>s.title==='Shopify signale une erreur').every(s=>s.priority===1&&s.detail.includes('depuis le 21 octobre')));
db.exec('DROP TABLE delivery_collections');
check('missing delivery collections unavailable',(await call(workspace,'GET')).sources.receivables.available===false);
db.exec('DROP TABLE channel_links');
check('missing Shopify links unavailable',(await call(workspace,'GET')).sources.shopifyLink.available===false);
db.exec('DROP TABLE client_errors');
check('missing telemetry is unavailable',(await call(workspace,'GET')).sources.errors.available===false);
const err=await call(errors,'GET');check('error route does not return healthy empty result',err.status===503&&err.errors===null);
const snapshot=await call(config,'GET',{},'?merchant=shop-a');
check('config revision returned',snapshot.revision===1);
const configResults=await Promise.all([call(config,'PATCH',{merchant:'shop-a',feature:'menu',enabled:false,revision:1}),call(config,'PATCH',{merchant:'shop-a',feature:'stock',enabled:false,revision:1},'','other')]);
check('config concurrency exactly one winner',configResults.filter(r=>r.ok).length===1&&configResults.filter(r=>r.status===409).length===1);
check('config atomic audit exactly once',db.prepare('SELECT COUNT(*) n FROM config_audit').get().n===1);
check('config does not overwrite plan',db.prepare("SELECT plan FROM merchant_config WHERE merchant='shop-a'").get().plan==='pro');
let cfg=await call(config,'GET',{},'?merchant=shop-a');
db.exec("CREATE TRIGGER fail_config_audit BEFORE INSERT ON config_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
check('config audit failure refuses mutation',(await call(config,'PATCH',{merchant:'shop-a',feature:'safecheck',enabled:false,revision:cfg.revision})).status===503);
check('configuration rolled back after audit failure',!(await call(config,'GET',{},'?merchant=shop-a')).features.hasOwnProperty('safecheck'));
db.exec('DROP TRIGGER fail_config_audit');
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts,void_ts) VALUES('sale-live','shop-a',999,12345,'cash',?,NULL),('sale-void','shop-a',500,50000,'cash',?,?),('sale-refund','shop-a',-9,-945,'cash',?,NULL)").run(now,now,now,now);
const roster=await call(clients,'GET'), totals=await call(overview,'GET');
check('roster uses centimes minus refunds and voids',roster.clients.find(c=>c.merchant==='shop-a').today_amount===114);
check('overview reconciles roster',totals.gmv.today===114);
db.exec("UPDATE merchant_config SET subscription_kind='trial' WHERE merchant='shop-a'; UPDATE merchant_config SET status='pending' WHERE merchant='shop-b'");
const commercial=await call(overview,'GET');
check('trial and pending contribute no MRR',commercial.mrr.total===0&&commercial.mrr.excluded===2);
check('MRR exclusions explained',commercial.mrr.contributions.some(c=>c.status==='trial')&&commercial.mrr.contributions.some(c=>c.status==='pending'));
db.exec("UPDATE merchant_config SET status='active',subscription_end='2000-01-01' WHERE merchant='shop-b'");
check('expired paid contract excluded',(await call(overview,'GET')).mrr.total===0);
check('missing plan is not pending access',policy.access({plan:'',store_status:'active'})==='active');
const signals=policy.signals([{merchant:'shop-a',plan:'',last_ts:now-9*86400000,city:''}],now);
check('independent signals do not hide each other',['terms','activity','profile'].every(k=>signals.some(s=>s.signal_key===k)));
check('demo never generates real work',policy.signals([{merchant:'demo',demo:true}],now).length===0);
check('business-specific onboarding',policy.onboarding('hotel').find(s=>s.key==='onboarding:workflow').detail.includes('Réservation')&&policy.onboarding('pressing').find(s=>s.key==='onboarding:workflow').detail.includes('Dépôt'));
db.exec('DROP TABLE operator_task_events; DROP TABLE operator_tasks');
check('missing task schema explicitly unavailable',(await call(workspace,'GET')).sources.tasks.available===false);
check('missing task schema cannot claim write',(await call(tasks,'POST',base)).status===503);
for(const channel of ['email','whatsapp']){
  db.prepare('INSERT INTO support_tickets(id,reference,merchant,category,priority,channel,contact,summary,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?,?,?,?)').run('ticket-'+channel,'TEST-'+channel,'shop-a','materiel','normal',channel,'fixture@example.test','Local synthetic ticket',now,now);
  const reply=await call(support,'PATCH',{id:'ticket-'+channel,action:'reply',body:'Synthetic reply, delivery not configured'});
  check(channel+' reply not falsely delivered',reply.ok&&reply.delivery.ok===false);
  check(channel+' reply stays operator-owned',db.prepare('SELECT status FROM support_tickets WHERE id=?').get('ticket-'+channel).status==='open');
}


// Les formulaires historiques doivent partager une traduction complète et une reprise clavier.
const legacyPath = new URL('../assets/admin-legacy.js', import.meta.url);
check('module des formulaires historiques présent', fs.existsSync(legacyPath));
const legacy = fs.readFileSync(legacyPath, 'utf8');
const sandbox = { window: {}, URLSearchParams, location: { search: '?lang=ar' }, localStorage: { getItem: () => null } };
vm.runInNewContext(legacy.split('/* DOM */')[0], sandbox);
const i18n = sandbox.window.KiwiAdminI18n;
check('arabe sélectionné', i18n.lang === 'ar');
for (const [fr, pair] of Object.entries(i18n.copy)) {
  check('traductions complètes : '+fr, pair.length === 2 && pair.every(s => typeof s === 'string' && s.trim() && !s.includes('\u2014')));
  check('résolution arabe : '+fr, i18n.text(fr) === pair[1]);
}
for (const label of ['Chargement…','Aucun détail de panier enregistré pour cette vente.','code opérateur','Lecture seule.','Établissement supprimé.','Tables purgées : {value}','Ce commerce tient un carnet de {value} clients.']) check('message historique complet : '+label,Object.hasOwn(i18n.copy,label));
check('clavier et alertes récupérables', /requestSubmit/.test(legacy) && /Escape/.test(legacy) && /role.*alert/.test(legacy));
const legacyHtml = fs.readFileSync(new URL('../kiwi-admin.html', import.meta.url), 'utf8');
check('module historique chargé par la console', /<script src="assets\/admin-legacy\.js(\?v=\d+)?"><\/script>/.test(legacyHtml));
check('focus visible et champs RTL isolés', /#op-config-panel :focus-visible/.test(legacyHtml) && /html\[dir="rtl"\] #operators/.test(legacyHtml));



for (const lang of ['fr','en','ar']) {
  const context={window:{},URLSearchParams,location:{search:'?lang='+lang},localStorage:{getItem:()=>null}};
  vm.runInNewContext(legacy.split('/* DOM */')[0],context);
  check('langue historique '+lang,context.window.KiwiAdminI18n.lang===lang);
  check('titre dynamique '+lang,context.window.KiwiAdminI18n.text('Supprimer « Commerce fictif »').includes('Commerce fictif'));
}
// Exécuter les gestionnaires, sans navigateur ni requête : Entrée déclenche
// exactement un clic et reste sans effet tant que l’enregistrement est bloqué.
const handlers={},forms=[],buttons={};
const doc={readyState:'complete',documentElement:{},body:{},querySelectorAll:()=>[],
  getElementById(id){if(id.endsWith('add')||id.endsWith('save')||id.endsWith('search'))return buttons[id]||=( {disabled:false,type:'',click(){this.clicks=(this.clicks||0)+1;}} );return {closest:()=>({parentNode:{insertBefore(){} }})};},
  createElement(){const events={};const form={appendChild(){},addEventListener:(k,fn)=>events[k]=fn,requestSubmit(){events.submit({preventDefault(){}});},events};forms.push(form);return form;},
  addEventListener:(k,fn)=>handlers[k]=fn};
vm.runInNewContext(legacy,{window:{},document:doc,URLSearchParams,location:{search:'?lang=ar'},localStorage:{getItem:()=>null},MutationObserver:class{observe(){}}});
check('direction arabe',doc.documentElement.dir==='rtl');
for(const [index,id] of ['pin-add','op-add','biz-save','ts-search'].entries()){
  const event={key:'Enter',target:{matches:()=>true},preventDefault(){}};
  forms[index].events.keydown(event);check('Entrée unique '+id,buttons[id].clicks===1);
  buttons[id].disabled=true;forms[index].events.keydown(event);check('envoi bloqué '+id,buttons[id].clicks===1);
}
const catalogue = legacyHtml.slice(legacyHtml.indexOf('var TYPES ='),legacyHtml.indexOf('// ── store:'));
for (const match of catalogue.matchAll(/(?:label|hint):'([^']+)'/g)) check('libellé de configuration traduit : '+match[1],Object.hasOwn(i18n.copy,match[1]));
const staffCatalogue=fs.readFileSync(new URL('../assets/staff-roles.js',import.meta.url),'utf8').split('var LABELS = {')[1].split('};')[0];
for (const match of staffCatalogue.matchAll(/:\s*'([^']+)'/g)) check('rôle traduit : '+match[1],Object.hasOwn(i18n.copy,match[1]));
let cancelled=0,submitted=0,focused=0;
const firstControl={disabled:false,getClientRects:()=>[{}],focus(){focused=1;}},lastControl={disabled:false,getClientRects:()=>[{}],focus(){focused=2;}};
const card={querySelector:selector=>selector==='.mini.ghost'?{click(){cancelled++;}}:{disabled:false,click(){submitted++;}},matches:()=>true,querySelectorAll:()=>[firstControl,lastControl]};
const target={closest:()=>card,matches:()=>true};
handlers.keydown({key:'Enter',target,preventDefault(){}});check('Entrée dans un éditeur',submitted===1);
handlers.keydown({key:'Escape',target,preventDefault(){},stopImmediatePropagation(){}});check('Échap annule l’éditeur',cancelled===1);
doc.activeElement=lastControl;handlers.keydown({key:'Tab',target,preventDefault(){}});check('Tab contenu dans le dialogue',focused===1);
doc.activeElement=firstControl;handlers.keydown({key:'Tab',target,shiftKey:true,preventDefault(){}});check('Maj Tab contenu dans le dialogue',focused===2);
console.log('operator-workspace-test: '+checks+' controls passed');
