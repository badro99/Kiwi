#!/usr/bin/env node
// Operator console · a truncated source can be read to its end.
// 450 print jobs for one store: the workspace shows the 200 latest and says the
// view is partial. The console's "Charger la suite" button (real
// assets/admin-workspace.js code, run in a vm) reads on through the real paged
// route (functions/api/admin/workspace.js ?source=&before=, real authorization,
// node:sqlite): two presses reach all 450 jobs, none twice, the partial notice
// and the button go away, another store's jobs never appear, and a failed page
// keeps the rows already loaded.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import policy from '../assets/admin-policy.js';
import * as auth from '../functions/auth/_lib.js';
import * as workspace from '../functions/api/admin/workspace.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
db.exec(fs.readFileSync(new URL('../migrations/legacy/2026-09-07-operator-workspace.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { let args = []; const st = { bind(...v) { args = v; return st; }, first() { return db.prepare(sql).get(...args) || null; }, all() { return { results: db.prepare(sql).all(...args) }; }, run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; } }; return st; },
  batch(list) { return list.map((s) => s.run()); } };
const env = { DB, AUTH_SECRET: crypto.randomUUID(), SITE_PASSWORD: crypto.randomUUID() };
db.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('op-a','Alice','','',1)");
db.exec("INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES('account-a','a@example.test','Shop A','','',1),('account-b','b@example.test','Shop B','','',1)");
db.exec("INSERT INTO merchant_config(merchant,features,plan,account_id,updated_ts) VALUES('shop-a','{}','pro','account-a',1),('shop-b','{}','pro','account-b',1)");
const now = Date.now();
const ins = db.prepare("INSERT INTO print_jobs(id,merchant,bridge_id,kind,target,data_b64,status,created_ts,expires_ts) VALUES(?,?,?,?,'{}','',?,?,?)");
for (let i = 0; i < 450; i++) ins.run('job-a-' + i, 'shop-a', 'bridge-1', 'receipt', 'failed', now - 60000 + i, now + 3600000);
for (let i = 0; i < 30; i++) ins.run('job-b-' + i, 'shop-b', 'bridge-2', 'receipt', 'failed', now - 60000 + i, now + 3600000);

const cookie = `kiwi_op=${await auth.operatorToken(env.AUTH_SECRET)}; kiwi_op_id=${await auth.operatorIdToken(env.AUTH_SECRET, 'op-a')}`;
let failNext = false, calls = 0;
async function api(path) {
  calls++;
  if (failNext) { failNext = false; const e = new Error('down'); e.status = 503; e.body = { error: 'source-read-unavailable' }; throw e; }
  const res = await workspace.onRequestGet({ request: new Request('https://kiwi.test/api/admin' + path, { headers: { Cookie: cookie } }), env });
  const body = await res.json();
  if (!res.ok) { const e = new Error(body.error); e.status = res.status; e.body = body; throw e; }
  return body;
}

// The production module, its event bootstrap replaced by a test handle.
const source = fs.readFileSync(new URL('../assets/admin-workspace.js', import.meta.url), 'utf8');
const ui = source.slice(0, source.indexOf("  document.addEventListener('click'")) + `
  render = function () { window.__renders = (window.__renders || 0) + 1; };
  toast = function (s) { window.__toasts.push(s); };
  window.testPaging = { state: state, more: loadMore, notice: noticeCore };
})();`;
const el = () => ({ innerHTML: '', textContent: '', dataset: {}, style: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
const win = { KiwiAdminPolicy: policy, KiwiOperator: { api }, __toasts: [] };
vm.runInNewContext(ui, { window: win, document: { getElementById: el, querySelector() { return null; }, querySelectorAll() { return []; }, body: el(), createElement: el, addEventListener() {} }, setTimeout, clearTimeout, console });
const T = win.testPaging;
T.state.live = true; T.state.route = 'merchant'; T.state.merchant = 'shop-a';

const first = await api('/workspace?merchant=shop-a');
assert.equal(first.sources.print.rows.length, 200, 'the workspace shows the 200 latest jobs');
assert.equal(first.sources.print.truncated, true);
T.state.data = first;
assert.match(T.notice(), /data-op="more" data-value="print"/, 'the partial notice offers to read on');

await T.more('print');
assert.equal(T.state.data.sources.print.rows.length, 400, 'one press: page one with its cursors, then page two');
assert.match(T.notice(), /data-op="more" data-value="print"/, 'still more to read');

failNext = true;
await T.more('print');
assert.equal(T.state.data.sources.print.rows.length, 400, 'a failed page keeps what was loaded');
assert.equal(win.__toasts.length, 1, 'and says so');

await T.more('print');
const rows = T.state.data.sources.print.rows, ids = rows.map((r) => r.id);
assert.equal(rows.length, 450, 'every job is reachable');
assert.equal(new Set(ids).size, 450, 'none twice');
assert.ok(rows.every((r) => r.merchant === 'shop-a'), 'another store never appears in this dossier');
assert.equal(T.state.data.sources.print.truncated, false, 'the view is complete');
assert.doesNotMatch(T.notice(), /data-op="more"/, 'and the button is gone');

const before = calls;
await T.more('print');
assert.equal(calls, before, 'a press after the end reads nothing');
assert.equal(T.state.data.sources.print.rows.length, 450);

console.log('✓ operator-workspace-paging · 450 jobs read to the end in 200-row pages, no duplicate, scoped, failure keeps loaded rows');
