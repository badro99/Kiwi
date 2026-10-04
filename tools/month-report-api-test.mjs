import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SOURCES,DOCUMENTS,onRequestGet } from '../functions/api/month-report.js';
import { makeSession,sessionCookie } from '../functions/auth/_lib.js';
import { fixture,ROOT } from './month-report-fixtures.mjs';
const d=fixture(1107),db=new DatabaseSync(':memory:');let checks=0;function check(v,msg){assert.ok(v,msg);checks++;}
db.exec('CREATE TABLE accounts (id TEXT, business TEXT, status TEXT, session_epoch INTEGER); CREATE TABLE merchant_config (merchant TEXT, account_id TEXT, name TEXT, type TEXT, timezone TEXT, business_cutoff INTEGER); CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER)');
db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run('synthetic-owner','synthetic-month','active',0);
db.prepare('INSERT INTO merchant_config VALUES(?,?,?,?,?,?)').run(d.merchant,'synthetic-owner','Synthetic QA only','restaurant',d.zone,d.cutoff);
for(const feature of DOCUMENTS)if(d.docs[feature])db.prepare('INSERT INTO store_docs VALUES(?,?,?,?,?)').run(d.merchant,feature,JSON.stringify(d.docs[feature]),1,d.from-1);
const numeric=new Set('amount amount_cents gross_amount_cents discount_amount_cents ts sale_ts void_ts seq created_ts occurred_ts srv_ts opened_ts expected_cents counted_cents gap_cents movement_amount_cents qty_milli unit_cost_cents unit_cost_rate submitted_at reviewed_at applied_at updated_ts total_lines total_counted total_system total_diff total_variance_cost_mad abs_variance_cost_mad total_cents invoiced_cents line_no qty unit_cents received_qty returned_qty balance_after_cents gross_ticket_cents consigned_cents'.split(' '));
for(const [key,spec] of Object.entries(SOURCES)){const cols=spec.columns.split(' ');db.exec(`CREATE TABLE ${spec.table} (${cols.map(c=>c+' '+(numeric.has(c)?'REAL':'TEXT')).join(',')})`);for(const r of d.rows[key]||[]){db.prepare(`INSERT INTO ${spec.table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>r[c]==null?null:typeof r[c]==='object'?JSON.stringify(r[c]):r[c]));}}
const secret='synthetic-only-session-fixture',cookie=sessionCookie(await makeSession('synthetic-owner',secret)).split(';')[0];
const queries=[];const env={AUTH_SECRET:secret,DB:{prepare(sql){assert.match(sql,/^\s*(SELECT|PRAGMA)\b/i,'report must never issue a write');queries.push(sql);let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},run(){throw Error('No writes allowed');}};}}};
async function get(query='',auth=cookie,environment=env){return onRequestGet({request:new Request('https://synthetic.invalid/api/month-report?merchant='+d.merchant+'&month='+d.month+query,{headers:auth?{Cookie:auth}:{}}),env:environment});}
check((await get('',null)).status===403,'unauthenticated access denied');
check((await get('','kiwi_till=synthetic-invalid')).status===403,'till-only access denied');
check((await get('',cookie,{})).status===503,'no secrets/database fail closed');
check((await onRequestGet({request:new Request('https://synthetic.invalid/api/month-report?merchant=another-owner&month=2026-09',{headers:{Cookie:cookie}}),env})).status===403,'cross-establishment export denied');
let response=await get(),data=await response.json();check(response.status===200,'authorized owner bootstrap');check(data.from===d.from&&data.to===d.to&&data.cutoff===5&&data.zone==='Africa/Casablanca','canonical merchant clock/cutoff');check(data.clock[d.docs.procurement.receipts[0].receivedAt].local.includes('13:00'),'document timestamps use canonical establishment clock');check(data.sources.sales.count===1107,'no 1000-row total cap');check(!JSON.stringify(data).includes('session_epoch')&&!JSON.stringify(data).includes(secret),'bootstrap contains no account credentials');
let cursor=0,all=[];do{response=await get(`&asOf=${data.asOf}&source=sales&cursor=${cursor}&fence=${data.sources.sales.maxRowid}`);const page=await response.json();check(response.status===200&&page.merchant===d.merchant,'each page authenticated and merchant-scoped');all.push(...page.rows);cursor=page.next;}while(cursor!=null);
check(all.length===1107&&all.at(-1).id==='SYN-SALE-01107','every record across 3 pages retained');
check((await get('&source=accounts&fence=1')).status===400,'only financial source allowlist');
check((await get('&source=sales&fence=1&cursor=-1')).status===400,'invalid cursor rejected');
check((await get('&asOf=not-a-time')).status===400,'invalid snapshot rejected');
response=await onRequestGet({request:new Request('https://synthetic.invalid/api/month-report?merchant='+d.merchant+'&month=9999-12',{headers:{Cookie:cookie}}),env});check(response.status===400,'future accounting month rejected');
db.exec('DROP TABLE inventory_counts');data=await (await get()).json();check(data.sources.counts.status==='not-recorded'&&data.sources.counts.count===null,'missing ledger not represented as zero');
db.prepare('INSERT INTO sales (id,merchant,ts) VALUES(?,?,NULL)').run('SYN-UNDATED',d.merchant);data=await (await get()).json();check(data.sources.sales.count===1108,'undated source preserved for unassignable annex');
db.exec('ALTER TABLE sales DROP COLUMN ts');data=await (await get()).json();check(data.sources.sales.count===1108&&data.sources.sales.periodStatus==='unassignable'&&data.sources.sales.missingColumns.includes('ts'),'missing timestamp preserves source records for an unassignable annex, not zero or an aborted dossier');
check(queries.every(q=>/^(SELECT|PRAGMA)/.test(q)),'generation only performed reads including auth');
const src=fs.readFileSync(ROOT+'/functions/api/store.js','utf8');check(src.includes("'discountpolicy', 'monthreport'")&&src.includes('validateMonthReportPolicy(clean.value, mine'),'configuration separately owner-gated and historical periods validated');
db.close();console.log(`✓ monthly owner-scoped read-only API (${checks} controls)`);
