import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SOURCES,DOCUMENTS,onRequestGet } from '../functions/api/month-report.js';
import { onRequestPost as saveReportSettings,onRequestGet as readReportSettings } from '../functions/api/store.js';
import { makeSession,sessionCookie } from '../functions/auth/_lib.js';
import { fixture,ROOT } from './month-report-fixtures.mjs';
const d=fixture(1107),db=new DatabaseSync(':memory:');let checks=0;function check(v,msg){assert.ok(v,msg);checks++;}
db.exec('CREATE TABLE accounts (id TEXT, business TEXT, status TEXT, session_epoch INTEGER); CREATE TABLE merchant_config (merchant TEXT, account_id TEXT, name TEXT, type TEXT, timezone TEXT, business_cutoff INTEGER, status TEXT); CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY(merchant,feature))');
db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run('synthetic-owner','synthetic-month','active',0);
db.prepare('INSERT INTO merchant_config VALUES(?,?,?,?,?,?,?)').run(d.merchant,'synthetic-owner','Synthetic QA only','restaurant',d.zone,d.cutoff,'active');
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
// Real store handler, isolated writable synthetic database. Report reads above
// retain their stricter SELECT/PRAGMA-only adapter.
let raceBarrier=null;const writes=[];const settingsEnv={AUTH_SECRET:secret,DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){const row=db.prepare(sql).get(...args)||null;if(raceBarrier&&/^SELECT data, rev FROM store_docs WHERE merchant = \? AND feature = \?$/.test(sql)){const barrier=raceBarrier;await new Promise(resolve=>{barrier.push(resolve);if(barrier.length===2)barrier.forEach(r=>r());});}return row;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){writes.push(sql);const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:result.changes}};}};}}};
async function settings(data,baseRev=1,auth=cookie,merchant=d.merchant){return saveReportSettings({request:new Request('https://synthetic.invalid/api/store',{method:'POST',headers:{Cookie:auth,'Content-Type':'application/json'},body:JSON.stringify({merchant,feature:'monthreport',baseRev,data})}),env:settingsEnv});}
const periods=d.docs.monthreport.taxPeriods;
let saved=await settings({taxPeriods:periods,accountantEmail:'qa-accountant@example.invalid'});check(saved.status===200,'actual owner store handler saves accountant email');
let reread=await readReportSettings({request:new Request('https://synthetic.invalid/api/store?merchant='+d.merchant+'&feature=monthreport',{headers:{Cookie:cookie}}),env:settingsEnv});const stored=await reread.json();check(stored.data.accountantEmail==='qa-accountant@example.invalid'&&stored.rev===2,'email persists through independent store reread with revision');
check(JSON.stringify(stored.data.taxPeriods)===JSON.stringify(periods),'email save preserves every historical tax period');
check((await settings({taxPeriods:periods,accountantEmail:'bad-email'},2)).status===400,'actual handler rejects invalid email');
check((await settings({taxPeriods:periods,accountantEmail:'old@example.invalid'},1)).status===409,'stale email update refused');
check((await settings({taxPeriods:periods,accountantEmail:'cross@example.invalid'},2,cookie,'another-owner')).status>=400,'cross-establishment email save denied');
check((await settings({taxPeriods:periods,accountantEmail:'unauth@example.invalid'},2,'')).status>=400,'unsigned email save denied');
check((await settings({taxPeriods:[],accountantEmail:'qa-accountant@example.invalid'},2)).status===400,'email save cannot delete historical tax rates');
check((await settings({taxPeriods:periods,accountantEmail:''},2)).status===200,'actual handler supports clearing optional email');
check(writes.filter(q=>/store_docs/.test(q)).length===2,'only two explicitly requested synthetic settings saves write the report store');
db.prepare("DELETE FROM store_docs WHERE merchant=? AND feature='monthreport'").run(d.merchant);
check((await settings({taxPeriods:[],accountantEmail:'qa@example.invalid'},0)).status===200,'email save without any tax configuration');
check((await settings({taxPeriods:[],accountantEmail:''},1)).status===200,'explicit email clear works even with no tax periods');
raceBarrier=[];const racing=await Promise.all([settings({taxPeriods:[],accountantEmail:'first@example.invalid'},2),settings({taxPeriods:[],accountantEmail:'second@example.invalid'},2)]);raceBarrier=null;
check(racing.filter(r=>r.status===200).length===1&&racing.filter(r=>r.status===409).length===1,'two actual concurrent email saves arbitrate by revision, never both succeed');
const afterRace=db.prepare("SELECT data,rev FROM store_docs WHERE merchant=? AND feature='monthreport'").get(d.merchant);check(afterRace.rev===3&&['first@example.invalid','second@example.invalid'].includes(JSON.parse(afterRace.data).accountantEmail),'concurrent save preserves one complete winning document and exactly one revision');
db.close();console.log(`✓ monthly owner-scoped read-only API (${checks} controls)`);
