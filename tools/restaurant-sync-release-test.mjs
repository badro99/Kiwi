#!/usr/bin/env node
/* Actual Pages Functions + in-memory D1 facade: one visit, three payments. */
import test from 'node:test';
import * as z from '../functions/api/z-reconciliation.js';
import { makeSession, SESS_COOKIE, employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import { businessDate, businessBoundary } from '../functions/api/_business-day.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';
import * as sale from '../functions/api/sale.js';

const merchant = 'restaurant-payment-identity-fixture';
const secret = 'synthetic-payment-identity-only';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
let failVisit = false, failSchema = false, failOrder = false;
const DB = { prepare(sql) { if(failOrder && sql.includes('SELECT id FROM orders WHERE') && sql.includes('session_id')) throw new Error('temporary order lookup'); if(failSchema && sql.includes('PRAGMA table_info(sales)')) throw new Error('temporary schema lookup'); if(failVisit && sql.includes('FROM table_sessions')) throw new Error('temporary outage'); let args = []; return {
  bind(...values) { args = values.map(v => v === undefined ? null : v); return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() { return { results: sqlite.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; }, async batch(statements) {
  sqlite.exec('BEGIN IMMEDIATE');
  try { const out = []; for (const statement of statements) out.push(await statement.run()); sqlite.exec('COMMIT'); return out; }
  catch (error) { sqlite.exec('ROLLBACK'); throw error; }
} };
const env = { DB, AUTH_SECRET: secret };
const at = Date.now();
sqlite.prepare("INSERT INTO merchant_config(merchant, features, status, updated_ts) VALUES (?, ?, 'active', ?)")
  .run(merchant, '{"orderpro":true}', at);
sqlite.prepare("INSERT INTO store_docs(merchant, feature, data, rev, updated_ts) VALUES (?, 'floorplan', ?, 1, ?)")
  .run(merchant, JSON.stringify({ tables: [{ id: 'T6', num: '6' }] }), at);
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(handler, body, authCookie = cookie) {
  const request = new Request('https://kiwi.test/api/test', { method: 'POST',
    headers: { Cookie: authCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await handler({ env, request, waitUntil() {} });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const ownerId='release-owner';
sqlite.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES (?,?,?,'','',?)").run(ownerId,'release@example.test',merchant,at);
sqlite.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run(ownerId,merchant);
const ownerCookie=SESS_COOKIE+'='+await makeSession(ownerId,secret);
const day=businessDate(at);
async function summary(d=day) {
 const response=await z.onRequestGet({env,request:new Request('https://kiwi.test/api/z-reconciliation?merchant='+merchant+'&day='+d,{headers:{Cookie:ownerCookie}})});
 assert.equal(response.status,200); return (await response.json()).daySummary;
}
test('temporary lookup returns 503; recovered retry links and closes visit',async()=>{
 const order=await post(queue.onRequestPost,{merchant,create:{id:'ord-release-001',mode:'table',table:'6',lines:[{id:'p1',name:'Penne',qty:1,unitPrice:90}],total:90}});
 assert.equal(order.status,200);
 const visit=sqlite.prepare("SELECT id FROM table_sessions WHERE merchant=? AND table_no='6' ORDER BY opened_ts DESC LIMIT 1").get(merchant).id;
 const payment={merchant,id:'release-recover',table:'6',session:visit,amount:90,amountCents:9000,method:'cash',ref:'Table 6 #900',ts:at};
 failVisit=true; let failed; try{failed=await post(sale.onRequestPost,payment);}finally{failVisit=false;}
 assert.equal(failed.status,503,JSON.stringify(failed));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM sales WHERE id=?').get(payment.id).n,0);
 assert.equal((await post(sale.onRequestPost,payment)).status,200);
 assert.equal(sqlite.prepare('SELECT session_id FROM sales WHERE id=?').get(payment.id).session_id,visit);
 assert.equal(sqlite.prepare('SELECT status FROM table_sessions WHERE id=?').get(visit).status,'closed');
});
test('unlinked cross-device bill 60 seconds apart deduplicates and void releases',async()=>{
 const p={merchant,table:'77',amount:35,amountCents:3500,method:'card',ref:'Table 77 #999',ts:at+1000};
 const a=await post(sale.onRequestPost,{...p,id:'release-waiter'}); assert.equal(a.status,200,JSON.stringify(a));
 const b=await post(sale.onRequestPost,{...p,id:'release-till',ref:'999',ts:at+61000}); assert.equal(b.status,200); assert.equal(b.body.id,a.body.id);
 const other=await post(sale.onRequestPost,{...p,table:'78',ref:'Table 78 #999',id:'release-other-table',ts:at+61001});
 assert.equal(other.status,200); assert.equal(other.body.id,'release-other-table','same order on different table is not a duplicate');
 sqlite.prepare('UPDATE sales SET void_ts=? WHERE id=?').run(at,a.body.id);
 const c=await post(sale.onRequestPost,{...p,id:'release-corrected',ts:at+121000}); assert.equal(c.status,200); assert.equal(c.body.id,'release-corrected');
});
test('blocked replay requires changed server reason and a comparison bound permit',async()=>{
 const r=await post(z.onRequestPost,{merchant,terminalId:'release-till',day,count:1,totalCents:1000,sales:[{id:'blocked-001',amountCents:1000,method:'cash'}],blocked:[{id:'blocked-001',amountCents:1000,method:'cash',ts:at,reason:'bad-amount',status:422}]});
 assert.equal(r.status,200); assert.deepEqual(r.body.retryable,[]); assert.equal(r.body.blocked[0].reason,'bad-amount'); assert.ok(r.body.comparisonId);
 const relaxed=await post(z.onRequestPost,{merchant,terminalId:'release-till',day,count:1,totalCents:1000,sales:[{id:'blocked-002',amountCents:1000,method:'cash'}],blocked:[{id:'blocked-002',amountCents:1000,method:'cash',ts:at,reason:'table-session-missing',status:404}]});
 assert.deepEqual(relaxed.body.retryable.map(x=>x.id),['blocked-002']);
});
test('closed day uses Z reference; open day uses live server total',async()=>{
 const r=await post(z.onRequestPost,{merchant,terminalId:'release-till',day,closed:true,count:1,totalCents:150700,sales:[{id:'z-missing-001',amountCents:150700,method:'cash'}]}); assert.equal(r.status,200);
 let s=await summary(); assert.equal(s.source,'closed-z'); assert.equal(s.referenceCents,150700); assert.equal(s.missingCount,1); assert.equal(s.gapCents,150700-s.recordedCents);
 await post(z.onRequestPost,{merchant,terminalId:'release-till',day,closed:false,count:1,totalCents:150700,sales:[{id:'z-missing-001',amountCents:150700,method:'cash'}]});
 s=await summary(); assert.equal(s.source,'live-ledger'); assert.equal(s.referenceCents,s.recordedCents); assert.equal(s.waitingCount,1);
});
test('pre-comparison history uses only ledger even if a legacy Z exists',async()=>{
 const d='2026-01-12';
 sqlite.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES ('history-001',?,12.34,1234,'cash',?)").run(merchant,businessBoundary(d));
 sqlite.prepare("INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,'dayreports',?,1,?)").run(merchant,JSON.stringify({days:{[d]:{gross:9999,txns:99,closedCount:1}}}),at);
 const s=await summary(d); assert.equal(s.source,'ledger-only'); assert.equal(s.referenceCents,1234); assert.equal(s.comparisonAvailable,false); assert.equal(s.reportedCents,null);
});

test('temporary visit-link schema failure preserves outbox retry and closes after recovery',async()=>{
 const o=await post(queue.onRequestPost,{merchant,create:{id:'ord-link-test-001',mode:'table',table:'6',lines:[{id:'p1',name:'Penne',qty:1,unitPrice:12}],total:12}}); assert.equal(o.status,200);
 const visit=sqlite.prepare("SELECT id FROM table_sessions WHERE merchant=? AND table_no='6' AND status='open'").get(merchant).id;
 const payment={merchant,id:'release-schema',table:'6',session:visit,amount:12,amountCents:1200,method:'cash',ref:'Table 6 #1001',ts:at+2000};
 failSchema=true;let r;try{r=await post(sale.onRequestPost,payment);}finally{failSchema=false;}
 assert.equal(r.status,503);
 assert.equal((await post(sale.onRequestPost,payment)).status,200);
 assert.equal(sqlite.prepare('SELECT status FROM table_sessions WHERE id=?').get(visit).status,'closed');
});
test('multi-terminal closed manifests union receipts, never sum overlapping money twice',async()=>{
 const d='2026-01-20'; const one={id:'union-one',amountCents:1234,method:'cash'},two={id:'union-two',amountCents:2000,method:'card'};
 const before=sqlite.prepare('SELECT COUNT(*) n FROM sales').get().n;
 for(const [terminalId,sales] of [['terminal-one',[one]],['terminal-two',[one,two]]]){
  const r=await post(z.onRequestPost,{merchant,day:d,terminalId,sales,closed:true,count:sales.length,totalCents:sales.reduce((n,s)=>n+s.amountCents,0)});assert.equal(r.status,200);
 }
 const s=await summary(d); assert.equal(s.referenceCents,3234);assert.equal(s.missingCount,2);assert.equal(s.recordedCents,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM sales').get().n,before,'Z never fabricates sales');
});

test('temporary employee order verification failure is retryable, never an unlinked sale',async()=>{
 const member={id:'release-staff',firstName:'Amira',lastName:'Fixture',function:'Serveur',department:'Salle',venueSlug:merchant};
 for(const [feature,data] of [['employee-access',{members:[member]}],['team',{members:[member]}],['attendance',{entries:[{memberId:member.id,inTs:at-3600000}]}]]){
  sqlite.prepare('INSERT OR REPLACE INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?)').run(merchant,feature,JSON.stringify(data),at);
 }
 const auth=EMPLOYEE_COOKIE+'='+await employeeToken(secret,{merchant,staffId:member.id});
 const o=await post(queue.onRequestPost,{merchant,create:{id:'ord-order-check-001',mode:'table',table:'6',lines:[{id:'p1',name:'Penne',qty:1,unitPrice:14}],total:14}});assert.equal(o.status,200);
 const visit=sqlite.prepare("SELECT id FROM table_sessions WHERE merchant=? AND table_no='6' AND status='open'").get(merchant).id;
 const p={merchant,id:'release-order-recover',table:'6',session:visit,amount:14,amountCents:1400,method:'cash',ref:'Table 6 #1002',ts:at+3000};
 failOrder=true;let r;try{r=await post(sale.onRequestPost,p,auth);}finally{failOrder=false;}
 assert.equal(r.status,503,JSON.stringify(r));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM sales WHERE id=?').get(p.id).n,0);
 const recovered=await post(sale.onRequestPost,p,auth);assert.equal(recovered.status,200,JSON.stringify(recovered));
 assert.equal(sqlite.prepare('SELECT status FROM table_sessions WHERE id=?').get(visit).status,'closed');
});
