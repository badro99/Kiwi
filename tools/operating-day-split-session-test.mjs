#!/usr/bin/env node
/* Regression: a local takeaway split token must never be treated as a D1 visit. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const merchant = 'cafe-atlas';
const secret = 'split-session-regression';
const saleId = 'sale-ref-24dfc6e9-le-ord-mtslc19k-sxqebbvs-split-0';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const now = Date.now();
db.prepare(`INSERT INTO accounts(id,email,business,salt,hash,created_ts,status,session_epoch)
  VALUES ('split-account','split@test',?,'s','h',?,'active',0)`).run(merchant, now);
db.prepare(`INSERT INTO merchant_config(merchant,features,type,account_id,name,status,till_epoch,updated_ts)
  VALUES (?, '{}', 'cafe', 'split-account', 'Cafe Atlas', 'active', 7, ?)`).run(merchant, now);

const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      first() { return db.prepare(sql).get(...args) || null; },
      all() { return { results: db.prepare(sql).all(...args) }; },
      run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; },
    };
    return statement;
  },
  batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try { const out = statements.map(s => s.run()); db.exec('COMMIT'); return out; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};
const env = { DB, AUTH_SECRET: secret };
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant, 7)}`;
const payload = {
  id: saleId, merchant, amount: 35, amountCents: 3500, method: 'cash', channel: 'takeaway',
  label: 'À emporter #2', lines: [{ n: 'Pâtes', q: 1, t: 35 }], orderId: 'ord-mtslc19k-sxqebbvs',
  ref: '2', session: 'flow-mtslbe6n-dp942', split: { index: 0, count: 2 }, ts: 1788867184445,
};
const post = body => salePost({ env, request: new Request('https://kiwi.test/api/sale', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) });

db.prepare(`INSERT INTO sales
  (id,merchant,amount,amount_cents,method,label,ref,ts,lines,channel)
  VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
  saleId, merchant, 35, 3500, 'cash', 'À emporter #2', '2', now,
  '[{"n":"Pâtes","q":1,"t":35}]', 'takeaway');
let response = await post(payload);
assert.equal(response.status, 200, await response.text());
console.log('✓ real sale handler reconciles an already-visible sale through canonical validation');
assert.equal(db.prepare('SELECT id,amount_cents FROM sales WHERE id=?').get(saleId).amount_cents, 3500);
response = await post(payload);
assert.equal(response.status, 200);
assert.equal(db.prepare('SELECT COUNT(*) n FROM sales WHERE id=?').get(saleId).n, 1);
console.log('✓ exact stable sale ID replay remains idempotent');

response = await post({ ...payload, amount: 36, amountCents: 3600 });
assert.equal(response.status, 409);
assert.equal(db.prepare('SELECT amount_cents FROM sales WHERE id=?').get(saleId).amount_cents, 3500);
console.log('✓ same stable sale ID with changed money remains a conflict');

const recoveredId = 'sale-ref-recovered-local-split';
response = await post({ ...payload, id: recoveredId, ref: '4' });
assert.equal(response.status, 200);
assert.equal(db.prepare('SELECT COUNT(*) n FROM sales WHERE id=?').get(recoveredId).n, 1);
console.log('✓ absent legacy local split sale still recovers without inventing a session');

const localPart0 = { ...payload, id: 'sale-local-new-part-0', amount: 35, amountCents: 3500, ref: '1', split: { index: 0, count: 2 } };
const localPart1 = { ...payload, id: 'sale-local-new-part-1', amount: 25, amountCents: 2500, ref: '2', split: { index: 1, count: 2 }, lines: [{ n: 'Dessert', q: 1, t: 25 }] };
assert.equal((await post(localPart0)).status, 200);
assert.equal((await post(localPart1)).status, 200);
const localTotals = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) cents
  FROM sales WHERE merchant=? AND id IN (?,?)`).get(merchant, localPart0.id, localPart1.id);
assert.equal(localTotals.n, 2);
assert.equal(localTotals.cents, 6000);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM table_sessions WHERE merchant=? AND id LIKE 'flow-%'`).get(merchant).n, 0);
console.log('✓ new local 35+25 split parts persist as two receipts without closing/creating a server session');

response = await post({ ...payload, id: 'sale-real-session-missing', session: 'tsx-genuine-missing', ref: '3' });
assert.equal(response.status, 404);
assert.equal(db.prepare("SELECT COUNT(*) n FROM sales WHERE id='sale-real-session-missing'").get().n, 0);
console.log('✓ genuine missing server session remains fail-closed');

const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
assert.match(source, /function serverSession\(entry\)/);
assert.match(source, /flow-\[a-z0-9-\]/i);
assert.match(source, /if \(session\) body\.session/);
const outboxPayloads = [];
const localStore = { kiwiLive: '1', kiwiPairedVenue: JSON.stringify({ merchant }) };
const browserWindow = {
  addEventListener() {}, dispatchEvent() {},
  location: { hostname: 'app.kiwi.local', search: '' },
  document: { readyState: 'complete', addEventListener() {}, dispatchEvent() {}, getElementById: () => null },
  localStorage: { getItem: k => localStore[k] || null, setItem: (k, v) => { localStore[k] = String(v); }, removeItem() {} },
  fetch: (url, opts) => { if (opts?.body) outboxPayloads.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: async () => ({ ok: true }) }); },
  KiwiEnv: { isReal: () => true }, KiwiVenue: { getVenue: () => merchant, isCustom: () => true },
  KiwiSales: { list: () => [], add() {}, annotate() {} }, Kiwi: { toast() {} },
};
const vmContext = vm.createContext({ window: browserWindow, document: browserWindow.document,
  localStorage: browserWindow.localStorage, fetch: browserWindow.fetch, location: browserWindow.location,
  navigator: { onLine: true }, console, Date, Math, Number, String, Array, JSON,
  setTimeout: () => 1, setInterval: () => 1, clearTimeout() {}, clearInterval() {},
});
vm.runInContext(source, vmContext);
vmContext.window.KiwiLive.postSale({ ...payload, id: 'le-ord-mtslc19k-sxqebbvs-split-0' });
const emitted = outboxPayloads.find(x => x.channel === 'takeaway' && x.amountCents === 3500);
assert.ok(emitted); assert.equal(emitted.session, undefined);
console.log('✓ live-link outbox execution strips only the local flow token');

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
assert.match(caisse, /if \(!splitState\.isVrap && splitState\.flow && splitState\.flow\.session/);
console.log('✓ takeaway split producer no longer attaches local flow token as session');
db.close();
