// Local-only integration fixture. Never imports production secrets or touches D1.
// Run: node tools/operator-workspace-dev.mjs (synthetic SQLite data resets on exit).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as auth from '../functions/auth/_lib.js';
const root=path.resolve(import.meta.dirname,'..'),db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));
const env={AUTH_SECRET:crypto.randomUUID(),SITE_PASSWORD:crypto.randomUUID(),DB:{prepare(sql){let args=[];const s={bind(...a){args=a;return s;},first(){return db.prepare(sql).get(...args)||null;},all(){return {results:db.prepare(sql).all(...args)};},run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};return s;},batch(ss){db.exec('BEGIN');try{const r=ss.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
db.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('fixture-operator','Opérateur test','','',1),('fixture-teammate','Collègue test','','',1)");
const now=Date.now();
const merchants=[['atelier-test','Atelier test','pressing','pro','active','paid','Rabat'],['cafe-test','Café test','restaurant','pro','active','trial','Casablanca'],['hotel-test','Hôtel test','hotel','','pending','paid','Marrakech']];
for(const [m,name,type,plan,status,kind,city] of merchants){db.prepare('INSERT INTO accounts(id,email,business,name,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)').run(m,m+'@example.test',name,'Contact test','','',now-30*86400000);db.prepare('INSERT INTO merchant_config(merchant,account_id,name,features,type,plan,status,subscription_kind,city,updated_ts) VALUES(?,?,?,?,?,?,?,?,?,?)').run(m,m,name,'{}',type,plan,status,kind,city,now);}
db.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,?,?,?,?)').run('fixture-sale','atelier-test',245,24500,'cash',now);
db.prepare('INSERT INTO print_bridges(id,merchant,name,token_hash,created_ts,last_seen_ts,platform,version) VALUES(?,?,?,?,?,?,?,?)').run('fixture-bridge','atelier-test','Relais test','non-secret-fixture',now,now,'android','fixture');
db.prepare('INSERT INTO print_jobs(id,merchant,bridge_id,kind,target,data_b64,status,created_ts,expires_ts) VALUES(?,?,?,?,?,?,?,?,?)').run('fixture-job','atelier-test','fixture-bridge','receipt','fixture','fixture','failed',now,now+60000);
db.prepare('INSERT INTO client_errors(id,merchant,message,file,version,count,first_seen_ts,last_seen_ts) VALUES(?,?,?,?,?,?,?,?)').run('fixture-error','cafe-test','Synthetic error','assets/test.js','fixture',3,now,now);
// Store-health fixture: a restaurant whose till holds a refused sale and whose
// Z disagrees with the server, a boutique that has gone quiet, and board tickets.
db.prepare('INSERT INTO accounts(id,email,business,name,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)').run('boutique-test','boutique-test@example.test','Boutique test','Contact test','','',now-60*86400000);
db.prepare('INSERT INTO merchant_config(merchant,account_id,name,features,type,plan,status,subscription_kind,city,updated_ts) VALUES(?,?,?,?,?,?,?,?,?,?)').run('boutique-test','boutique-test','Boutique test','{}','boutique','basic','active','paid','Tanger',now);
for(let d=2;d<7;d++)db.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,?,?,?,?)').run('fixture-bq-'+d,'boutique-test',120,12000,'card',now-d*86400000);
for(let d=0;d<5;d++)db.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,?,?,?,?)').run('fixture-cafe-'+d,'cafe-test',310,31000,'cash',now-d*86400000-3600000);
const beat=(id,m,device,ts,sync)=>db.prepare('INSERT INTO operational_commands(id,merchant,domain,action,status,idempotency_key,payload,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?,?,?)').run(id,m,'device','heartbeat','completed',id,JSON.stringify({deviceId:device,app:'caisse',sync}),ts,ts);
for(let i=0;i<40;i++)beat('fixture-beat-a'+i,'cafe-test','caisse-comptoir',now-i*300000,{total:1,blocked:1,pending:0,oldestPendingAt:now-5400000,lastAcknowledgedAt:now-600000,lastStatus:403,lastError:'manager-required',blockedEntries:[{id:'fixture-refund',amountCents:4500,method:'cash',ts:now-5400000,reason:'manager-required'}]});
beat('fixture-beat-b','cafe-test','caisse-terrasse',now-20*3600000,{total:0,blocked:0,pending:0,lastAcknowledgedAt:now-20*3600000});
beat('fixture-beat-c','atelier-test','caisse-atelier',now-120000,{total:0,blocked:0,pending:0,lastAcknowledgedAt:now-120000});
db.prepare('INSERT INTO z_reconciliations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('cafe-test','2026-09-25','caisse-comptoir',42,1320000,40,1275000,2,45000,0,0,'mismatch',JSON.stringify({blocked:[{id:'fixture-refund'}]}),now-3600000);
db.prepare('INSERT INTO z_reconciliations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('atelier-test','2026-09-25','caisse-atelier',9,210000,9,210000,0,0,0,0,'matched','{"blocked":[]}',now-7200000);
db.prepare("INSERT INTO kiwi_tickets(body,status,kind,money_at_risk,created_ts,updated_ts) VALUES(?,?,?,?,?,?)").run('Le tableau de bord du restaurant ne concorde pas avec le Z de la caisse.','problem','bug',1,now,now);
db.prepare("INSERT INTO kiwi_tickets(body,status,kind,money_at_risk,created_ts,updated_ts) VALUES(?,?,?,?,?,?)").run('Masquer le bouton Campagne dans Clients pour tous les métiers.','problem','improvement',0,now,now);
db.prepare("INSERT INTO kiwi_tickets(body,status,kind,money_at_risk,created_ts,updated_ts) VALUES(?,?,?,?,?,?)").run('Un article retourné revient en stock.','testing','unsorted',0,now,now);
const cookie=`kiwi_op=${await auth.operatorToken(env.AUTH_SECRET)}; kiwi_op_id=${await auth.operatorIdToken(env.AUTH_SECRET,'fixture-operator')}`;
const allowed=new Set(['workspace','clients','overview','operators','tasks','notes','health','config','pins','attendance-link','audit','sales','account','support','support-articles']);
const mutable=new Set(['tasks','notes','config']);
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:8767');
    if(req.headers.host!=='127.0.0.1:8767'){res.writeHead(403);return res.end('Local fixture only');}
    if(url.pathname.startsWith('/api/admin/')){
      const route=url.pathname.slice('/api/admin/'.length);
      if(!allowed.has(route)||req.method!=='GET'&&!mutable.has(route)){res.writeHead(405);return res.end('{}');}
      const mod=await import('../functions/api/admin/'+route+'.js'),handler=mod['onRequest'+req.method[0]+req.method.slice(1).toLowerCase()];
      if(!handler){res.writeHead(405);return res.end('{}');}
      const chunks=[];for await(const c of req)chunks.push(c);
      const request=new Request(url,{method:req.method,headers:{'Content-Type':'application/json',Cookie:cookie,...(req.headers.origin?{Origin:req.headers.origin}:{})},...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
      const result=await handler({request,env});res.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(await result.text());
    }
    const relative=url.pathname==='/'?'kiwi-admin.html':decodeURIComponent(url.pathname).slice(1),file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||!(relative==='kiwi-admin.html'||relative.startsWith('assets/'))){res.writeHead(404);return res.end();}
    let body=fs.readFileSync(file);
    if(relative==='kiwi-admin.html')body=body.toString().replace('<main class="wrap">','<main class="wrap"><p class="op-notice">TEST LOCAL · données entièrement fictives · SQLite en mémoire, aucun accès à la production.</p>');
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'local-fixture-error'}));console.error(e.message);}
}).listen(8767,'127.0.0.1',()=>console.log('Synthetic operator integration fixture: http://127.0.0.1:8767/kiwi-admin.html'));
