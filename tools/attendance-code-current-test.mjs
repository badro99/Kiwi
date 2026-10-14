#!/usr/bin/env node
/* attendance-code-current-test · one shared attendance code per merchant
 * (stage 4, §10.34): the new `current-attendance-code` action of
 * functions/api/team/live.js, on the real handler and a base built from
 * schema.sql, with a test store's till cookie.
 *
 *   node tools/attendance-code-current-test.mjs
 *
 * What it holds:
 *   · no code yet: one is drawn (six digits, 5 minutes), reused:false, and
 *     the answer carries the server's clock (now);
 *   · asked again: the same code, reused:true, nothing rewritten;
 *   · 61 s of life left: still the same code; 59 s left: a new one, never
 *     the old;
 *   · two tills asking at the same instant on an expiring code end with ONE
 *     code;
 *   · the shipped generate-attendance-code still replaces it, and the next
 *     current-attendance-code shows the replacement. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...v) { args = v; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
  },
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
};
const env = { DB, AUTH_SECRET: 'synthetic-attendance-code-only' };
const MERCHANT = 'attendance-code-fixture';
sqlite.prepare("INSERT INTO merchant_config(merchant, features, status, till_epoch, updated_ts) VALUES (?, '{}', 'active', 0, ?)").run(MERCHANT, Date.now());
const AUTH = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
const LIVE = await import(pathToFileURL(path.join(ROOT, 'functions/api/team/live.js')).href);
const cookie = `${AUTH.TILL_COOKIE}=${await AUTH.tillToken(env.AUTH_SECRET, MERCHANT)}`;
async function post(action) {
  const res = await LIVE.onRequestPost({ env, request: new Request('https://kiwi.test/api/team/live', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ merchant: MERCHANT, action }),
  }) });
  return { status: res.status, body: await res.json() };
}
const doc = () => { const r = sqlite.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'attendance-code'").get(MERCHANT); return r && { data: JSON.parse(r.data), rev: r.rev }; };
const setLife = (ms) => {
  const d = doc();
  d.data.expiresTs = Date.now() + ms;
  sqlite.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'attendance-code'").run(JSON.stringify(d.data), MERCHANT);
};

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log('  ✓ ' + label); };
console.log('■ Le code de pointage partagé (tools/attendance-code-current-test.mjs)');

const first = await post('current-attendance-code');
ok('no code yet: one is drawn, six digits, five minutes, reused:false, with the server\'s clock', () => {
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.match(first.body.code, /^\d{6}$/);
  assert.equal(first.body.expiresTs - first.body.createdTs, 5 * 60 * 1000);
  assert.equal(first.body.reused, false);
  assert.ok(Number.isFinite(first.body.now) && Math.abs(first.body.now - Date.now()) < 5000);
});
const revBefore = doc().rev;
const again = await post('current-attendance-code');
ok('asked again: the same code, reused:true, nothing rewritten', () => {
  assert.equal(again.body.code, first.body.code);
  assert.equal(again.body.reused, true);
  assert.equal(doc().rev, revBefore);
});
setLife(61 * 1000);
const keep = await post('current-attendance-code');
ok('61 s of life left: still the same code', () => { assert.equal(keep.body.code, first.body.code); assert.equal(keep.body.reused, true); });
setLife(59 * 1000);
const renew = await post('current-attendance-code');
ok('59 s left: a new code, never the old one', () => {
  assert.equal(renew.body.reused, false);
  assert.match(renew.body.code, /^\d{6}$/);
  assert.notEqual(renew.body.code, first.body.code);
  assert.equal(doc().data.code, renew.body.code);
});
setLife(10 * 1000);
const [a, b] = await Promise.all([post('current-attendance-code'), post('current-attendance-code')]);
ok('two tills at the same instant on an expiring code end with one code', () => {
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.body.code, b.body.code, `${a.body.code} / ${b.body.code}`);
  assert.equal(doc().data.code, a.body.code);
  assert.equal([a.body.reused, b.body.reused].filter((x) => x === false).length, 1, 'exactly one of them drew it');
});
const replaced = await post('generate-attendance-code');
const shown = await post('current-attendance-code');
ok('the shipped generate-attendance-code still replaces it; the next current call shows the replacement', () => {
  assert.equal(replaced.status, 200);
  assert.notEqual(replaced.body.code, a.body.code);
  assert.equal(shown.body.code, replaced.body.code);
  assert.equal(shown.body.reused, true);
});
console.log(`✓ attendance-code-current-test · ${n} checks`);
