#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost, onRequestDelete } from '../functions/api/account/deletion-request.js';
import { hashPassword, makeSession, SESS_COOKIE, TILL_COOKIE, tillToken } from '../functions/auth/_lib.js';

const SECRET = 'account-deletion-test-secret-only';
const PASSWORD = 'Synthetic-é-مرحبا-only';
const credentials = await hashPassword(PASSWORD);
let controls = 0;
function check(label, value) { assert.ok(value, label); controls++; console.log('  ✓ ' + label); }
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const id of ['a', 'b']) sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run(id, id + '@example.invalid', 'Synthetic ' + id, credentials.salt, credentials.hash, 1);
  const DB = {
    prepare(query) {
      const statement = sql.prepare(query);
      const bound = (args = []) => ({
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run() { const result = statement.run(...args); return { success: true, meta: { changes: result.changes } }; }
      });
      return { ...bound(), bind: (...args) => bound(args) };
    },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try { const result = statements.map((s) => s.run()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    }
  };
  return { sql, env: { DB, AUTH_SECRET: SECRET } };
}
const cookie = async (id) => `${SESS_COOKIE}=${await makeSession(id, SECRET)}`;
const owner = await cookie('a'), other = await cookie('b');
const makeRequest = (method, value, auth = owner, extra = {}) => new Request('https://kiwi.test/api/account/deletion-request', {
  method, headers: { Cookie: auth, 'Content-Type': 'application/json', ...extra },
  ...(method === 'POST' ? { body: JSON.stringify(value) } : {})
});
const world = database();
const count = (table, w = world) => w.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const post = (body = { confirm: true, password: PASSWORD }, auth = owner, headers = {}, w = world) => onRequestPost({ env: w.env, request: makeRequest('POST', body, auth, headers) });
check('anonymous users cannot read deletion status', (await onRequestGet({ env: world.env, request: makeRequest('GET', null, '') })).status === 401);
const till = `${TILL_COOKIE}=${await tillToken(SECRET, 'synthetic-a')}`;
check('a paired till cannot initiate an account request', (await post(undefined, till)).status === 401);
check('cross-origin submission is refused', (await post(undefined, owner, { Origin: 'https://attacker.invalid' })).status === 403);
check('a form cannot submit a deletion request', (await post(undefined, owner, { 'Content-Type': 'text/plain' })).status === 415);
check('explicit confirmation is required', (await post({ password: PASSWORD })).status === 400);
check('password reauthentication is required', (await post({ confirm: true, password: 'incorrect' })).status === 401);
check('refusals create no tickets or messages', count('support_tickets') === 0 && count('support_messages') === 0);
const result = await post({ confirm: true, password: PASSWORD, accountId: 'b', merchant: 'other-store', email: 'attacker@example.invalid' }, owner, { Origin: 'capacitor://localhost' });
const saved = await result.json();
check('native owner submission succeeds with Unicode password', result.status === 200 && saved.ok && saved.request.reference);
const row = world.sql.prepare('SELECT * FROM support_tickets').get();
check('target and contact come only from the owner session', row.contact === 'a@example.invalid' && JSON.parse(row.diagnostics).account_id === 'a' && row.merchant === '');
check('one durable request and message, no accounts deleted', count('support_tickets') === 1 && count('support_messages') === 1 && count('accounts') === 2);
check('response contains no password, hash, salt or token', !JSON.stringify(saved).includes(PASSWORD) && !/password|salt|hash|token/.test(JSON.stringify(saved)));
const retry = await (await post()).json();
check('retry reuses the same reference and original date', retry.duplicate && retry.request.reference === saved.request.reference && retry.request.createdAt === saved.request.createdAt && count('support_messages') === 1);
const mine = await (await onRequestGet({ env: world.env, request: makeRequest('GET') })).json();
const theirs = await (await onRequestGet({ env: world.env, request: makeRequest('GET', null, other) })).json();
check('GET is account scoped and preserves retry status', mine.request.reference === saved.request.reference && theirs.request === null);
const race = database();
const responses = await Promise.all([post(undefined, owner, {}, race), post(undefined, owner, {}, race)]);
check('concurrent retries converge in actual SQLite', responses.every((r) => r.status === 200) && count('support_tickets', race) === 1 && count('support_messages', race) === 1);
const failure = database();
failure.sql.exec("CREATE TRIGGER fail_request_message BEFORE INSERT ON support_messages BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
check('partial writes roll back instead of claiming success', (await post(undefined, owner, {}, failure)).status === 503 && count('support_tickets', failure) === 0);
failure.sql.exec('DROP TRIGGER fail_request_message; DROP TABLE support_tickets;');
check('missing schema fails closed', (await post(undefined, owner, {}, failure)).status === 503);
check('DELETE is not an account destruction endpoint', onRequestDelete().status === 405);
const throttled = database();
for (let i = 0; i < 8; i++) await post({ confirm: true, password: 'incorrect' }, owner, {}, throttled);
check('repeated reauthentication failures are rate limited', (await post(undefined, owner, {}, throttled)).status === 429);
for (const w of [world, race, failure, throttled]) w.sql.close();
console.log(`account-deletion-test: ${controls} controls passed`);
