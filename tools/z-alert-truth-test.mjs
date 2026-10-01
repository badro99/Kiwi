#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE, makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { businessBoundary } from '../functions/api/_business-day.js';
import { onRequestGet as getMe } from '../functions/api/me.js';
import { OP_COOKIE, OPID_COOKIE, operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import * as endpoint from '../functions/api/z-reconciliation.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'z-reconcile-fixture', secret = 'z-reconcile-only';
db.prepare("INSERT INTO merchant_config(merchant,features,status,updated_ts) VALUES (?,'{}','active',?)")
  .run(merchant, Date.now());
db.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES ('z-owner','z@example.test',?,'','',?)")
  .run(merchant, Date.now());
db.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run('z-owner', merchant);
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { args = values; return this; },
  first() { return db.prepare(sql).get(...args) || null; },
  all() { return { results: db.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: db.prepare(sql).run(...args) }; },
}; } };
const env = { DB, AUTH_SECRET: secret };
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(body, withCookie = true) {
  const request = new Request('https://kiwi.test/api/z-reconciliation', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ merchant, terminalId: 'till-fixture', ...body }) });
  const response = await endpoint.onRequestPost({ env, request });
  return { status: response.status, body: await response.json() };
}

const day='2026-09-30', ts=businessBoundary(day)+17*3600000;
const owner = `${SESS_COOKIE}=${await makeSession('z-owner', secret)}`;
const read = async()=> (await (await endpoint.onRequestGet({env,request:new Request(`https://kiwi.test/api/z-reconciliation?merchant=${merchant}&day=${day}`,{headers:{Cookie:owner}})})).json()).daySummary;
await post({day,closed:false,sales:[],count:0,totalCents:0});
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,32,3200,'cash',?)").run('later-sale',merchant,ts);
let s=await read();assert.notEqual(s.source,'open-z','an empty early snapshot cannot accuse a later sale');assert.equal(s.gapCents,0);assert.equal(s.recordedCents,3200);
await post({day,closed:false,sales:[{id:'missing-paid',amountCents:3200,method:'cash'}],count:1,totalCents:3200});
s=await read();assert.equal(s.source,'open-z');assert.equal(s.gapCents,3200);assert.equal(s.missingCount,1,'a genuinely unsynced paid receipt stays actionable');
db.prepare("INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,32,3200,'cash',?)").run('missing-paid',merchant,ts+1000);
s=await read();assert.notEqual(s.source,'open-z');assert.equal(s.gapCents,0,'a different till sale is not an extra against the open snapshot');
await post({day,closed:false,sales:[{id:'missing-paid',amountCents:3200,method:'card'}],count:1,totalCents:3200});
s=await read();assert.equal(s.source,'open-z');assert.equal(s.mismatchedCount,1,'equal totals do not hide a payment-method mismatch');
await post({day,closed:false,sales:[],count:0,totalCents:0});
await post({day,terminalId:'till-closed',closed:true,sales:[{id:'missing-paid',amountCents:3200,method:'cash'}],count:1,totalCents:3200});
s=await read();assert.equal(s.gapCents,0,'a partial closed shift is not the entire day ledger');
await post({day,closed:true,sales:[],count:0,totalCents:0});
s=await read();assert.equal(s.source,'closed-z');assert.equal(s.gapCents,-3200,'a completed closed-day comparison still exposes a missing counted sale');
console.log('✓ z-alert-truth-test: stale snapshot, real gap, method mismatch and partial/full closure');

// #145: operator identity comes from the registered account of a second store,
// not a primary business-name slug. URL-only scoping still grants nothing.
db.exec('CREATE TABLE IF NOT EXISTS operators(id TEXT PRIMARY KEY)');
db.prepare("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('fixture-op','QA fixture','s','h',?)").run(Date.now());
db.prepare("UPDATE accounts SET name='Amira El Mansouri' WHERE id='z-owner'").run();
db.prepare("INSERT INTO merchant_config(merchant,features,status,account_id,updated_ts) VALUES('second-fixture','{}','active','z-owner',?)").run(Date.now());
const opCookie=`${OP_COOKIE}=${await operatorToken(secret)}; ${OPID_COOKIE}=${await operatorIdToken(secret,'fixture-op')}`;
const opMe=await (await getMe({env,request:new Request('https://kiwi.test/api/me?merchant=second-fixture',{headers:{Cookie:opCookie}})})).json();
assert.equal(opMe.name,'Amira El Mansouri');assert.equal(opMe.operator,true);assert.equal(opMe.authenticated,true);
const stranger=await (await getMe({env,request:new Request('https://kiwi.test/api/me?merchant=second-fixture')})).json();assert.equal(stranger.authenticated,false);
console.log('✓ operator second-store identity is account-authoritative and operator-gated');
