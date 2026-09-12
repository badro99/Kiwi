#!/usr/bin/env node
/* Focused A02-A09 regression coverage.
 *
 * This uses the real route/helper implementations over SQLite, including an
 * ownership-read barrier for the store-claim race and concurrent atomic limiter
 * increments. It deliberately does not model the implementation in a second
 * toy function.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { onRequestPost as postConfig } from '../functions/api/config.js';
import { onRequestPost as postEmployee, onRequestGet as getEmployee } from '../functions/api/employee.js';
import { onRequestGet as getMe } from '../functions/api/me.js';
import { onRequestPost as postStore } from '../functions/api/store.js';
import { onRequestPost as postTeam } from '../functions/api/team/live.js';
import { onRequestPost as postPair } from '../functions/api/pair/redeem.js';
import { onRequestPost as postReset } from '../functions/auth/reset.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import {
  EMPLOYEE_COOKIE, SESS_COOKIE, TILL_COOKIE, employeeCookie, employeeToken,
  forgetTillEpoch, hashPassword, limitCheck, limitFail, makeResetToken,
  makeSession, resetVerifierHash, sessionCookie, tillToken,
  tillEpoch,
} from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'audit-remediation-auth-secret-32-chars';
const failures = [];
let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (condition) console.log('  ✓ ' + label);
  else { failures.push(label); console.log('  ✗ ' + label + (detail ? ` — ${detail}` : '')); }
}
function normalize(sql) { return String(sql).replace(/\s+/g, ' ').trim(); }

const db = new DatabaseSync(':memory:');
const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
for (const statement of schema.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) db.exec(statement);
/* schema.sql is now the parent integration surface and may already include
 * session_epoch. Keep this focused fixture able to exercise both a fresh
 * schema and the standalone existing-database migration without masking any
 * other migration statement. */
const authMigration = fs.readFileSync(path.join(ROOT, 'migrations/2026-09-08-auth-session-revocation.sql'), 'utf8');
for (const statement of authMigration.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
  if (/^ALTER TABLE accounts ADD COLUMN session_epoch\b/i.test(statement)
      && /\bsession_epoch\b/i.test(schema)) continue;
  db.exec(statement);
}

let claimReads = 0;
let releaseClaimReads;
const claimGate = new Promise((resolve) => { releaseClaimReads = resolve; });
function makeD1({ barrier = false, broken = false } = {}) {
  return {
    prepare(sql) {
      if (broken) throw new Error('synthetic-db-outage');
      const q = normalize(sql);
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async first() {
          if (barrier && q.startsWith('SELECT account_id FROM merchant_config WHERE merchant = ?') && claimReads < 2) {
            const turn = claimReads++;
            if (turn === 1) releaseClaimReads();
            else await claimGate;
          }
          const row = db.prepare(q).get(...args);
          return row === undefined ? null : row;
        },
        async all() { return { results: db.prepare(q).all(...args) }; },
        async run() {
          const result = db.prepare(q).run(...args);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: result.lastInsertRowid }, changes: Number(result.changes) };
        },
      };
      return stmt;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}
const env = { DB: makeD1(), AUTH_SECRET: SECRET };

function request(url, { method = 'GET', cookie = '', body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h['content-type'] = 'application/json';
  return new Request('https://kiwi.test' + url, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function jsonBody(response) { return response.json(); }
function cookieValue(response, name) {
  const setCookie = response.headers.get('set-cookie') || '';
  const match = setCookie.match(new RegExp(`${name}=([^;,]+)`));
  return match ? match[1] : '';
}
function cookiePair(name, value) { return `${name}=${value}`; }

/* A02: both handlers observe a free slug, but only the SQLite winner may write
 * the PIN roster and employee-access mirror. */
console.log('\nA02 · owner-conditional store claim');
db.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch) VALUES (?,?,?,?,?,?,?,?,0)")
  .run('acc-race-a', 'race-a@test.ma', 'A', 'Race A', '00', '00', Date.now(), 'active');
db.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch) VALUES (?,?,?,?,?,?,?,?,0)")
  .run('acc-race-b', 'race-b@test.ma', 'B', 'Race B', '00', '00', Date.now(), 'active');
const raceBody = (code) => ({ merchant: 'shared-race-store', name: 'Shared Race Store', fresh: true,
  pins: [{ code, name: 'Cashier', role: 'caisse', memberId: 'member-race', email: 'cashier@race.test', firstName: 'Cashier' }] });
const raceReq = async (aid, code) => postConfig({
  env: { ...env, DB: makeD1({ barrier: true }) },
  request: request('/api/config', {
    method: 'POST', cookie: cookiePair(SESS_COOKIE, await makeSession(aid, SECRET)), body: raceBody(code),
  }),
});
const [raceA, raceB] = await Promise.all([raceReq('acc-race-a', '1111'), raceReq('acc-race-b', '2222')]);
const raceStatuses = [raceA.status, raceB.status].sort((a, b) => a - b);
check('claim race has one success and one ownership conflict', raceStatuses[0] === 200 && raceStatuses[1] === 409, raceStatuses.join(','));
const raceOwner = db.prepare("SELECT account_id FROM merchant_config WHERE merchant = 'shared-race-store'").get();
const racePins = db.prepare("SELECT pin FROM staff_pins WHERE merchant = 'shared-race-store'").all();
check('loser cannot write a PIN into the winner tenant', racePins.length === 1 && racePins[0].pin === (raceOwner.account_id === 'acc-race-a' ? '1111' : '2222'));
check('loser cannot write an employee-access document', db.prepare("SELECT COUNT(*) AS n FROM store_docs WHERE merchant = 'shared-race-store' AND feature = 'employee-access'").get().n === 1);

/* A03/A04: infrastructure failures are not active/revocation epoch zero. */
console.log('\nA03/A04 · fail-closed revocation reads');
// Real pre-migration layout: preserve the merchant payload and old epoch-zero
// token through the additive prerequisite; then prove revocation still works.
const legacyDb = new DatabaseSync(':memory:');
legacyDb.exec('CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT NOT NULL, updated_ts INTEGER NOT NULL)');
legacyDb.prepare('INSERT INTO merchant_config VALUES (?,?,?)').run('migration-shop', '{"menu":true}', 123);
const legacyEnv = { AUTH_SECRET: SECRET, DB: { prepare(sql) { let args = []; return {
  bind(...values) { args = values; return this; },
  async first() { return legacyDb.prepare(sql).get(...args) ?? null; },
}; } } };
const preservedTill = request('/api/private', { cookie: cookiePair(TILL_COOKIE, await tillToken(SECRET, 'migration-shop', 0)) });
const { isTillFor } = await import('../functions/auth/_lib.js');
/* Cette assertion disait l'inverse, et c'est elle qui a coûté un parc entier.
 * « La base ne SAIT pas révoquer » n'est pas « la base ne PEUT pas répondre » :
 * la colonne `till_epoch` n'est posée que par POST /api/pair/revoke, qui
 * exécute son propre ALTER avant d'incrémenter. Une base où la colonne n'existe
 * pas est donc une base où AUCUN dépairage n'a jamais pu être enregistré — le
 * millésime y vaut zéro par démonstration, pas par défaut prudent, et refuser
 * ne protégeait aucun appairage révoqué. Ce que ça faisait, en revanche : la
 * production est régulièrement en retard sur schema.sql (CLAUDE.md §3), donc
 * chaque caisse du parc se voyait refuser chaque vente en 403 — sans recours,
 * puisque /api/pair/redeem lisait le même millésime et répondait 503.
 * Ce qui reste fermé, et que les deux contrôles suivants tiennent : une panne
 * de LECTURE (la base est là, elle ne répond pas) et un millésime incrémenté. */
check('a database that cannot record a revocation admits the existing pairing',
  await isTillFor(preservedTill, legacyEnv, 'migration-shop'));
forgetTillEpoch('migration-shop', legacyEnv.DB);
legacyDb.exec(fs.readFileSync(path.join(ROOT, 'migrations/2026-09-08-till-epoch-prerequisite.sql'), 'utf8'));
check('additive till prerequisite preserves the existing pairing', await isTillFor(preservedTill, legacyEnv, 'migration-shop'));
const preservedConfig = legacyDb.prepare('SELECT * FROM merchant_config').get();
check('till prerequisite preserves config data and timestamps', preservedConfig.features === '{"menu":true}' && preservedConfig.updated_ts === 123 && preservedConfig.till_epoch === 0);
legacyDb.exec('UPDATE merchant_config SET till_epoch = 1');
forgetTillEpoch('migration-shop', legacyEnv.DB);
check('migrated till still rejects a subsequently revoked pairing', !(await isTillFor(preservedTill, legacyEnv, 'migration-shop')));
legacyDb.close();
let nextCalled = false;
const oldAccount = await makeSession('acc-race-a', SECRET, 0);
const denied = await middleware({
  request: request('/api/private', { cookie: cookiePair(SESS_COOKIE, oldAccount) }),
  env: { AUTH_SECRET: SECRET, DB: makeD1({ broken: true }) },
  next: async () => { nextCalled = true; return new Response('authorized'); },
});
check('account status/epoch read failure is a recoverable denial', denied.status === 503 && !nextCalled
  && !denied.headers.has('X-KiwiAccountRevoked'), String(denied.status));
forgetTillEpoch('epoch-read-failure');
const failedTill = await tillToken(SECRET, 'epoch-read-failure', 0);
const tillAllowed = await (await import('../functions/auth/_lib.js')).isTillFor(
  request('/api/private', { cookie: cookiePair(TILL_COOKIE, failedTill) }),
  { AUTH_SECRET: SECRET, DB: makeD1({ broken: true }) }, 'epoch-read-failure');
check('till epoch read failure rejects an epoch-zero token', tillAllowed === false);
const cacheDbA = {
  prepare() { return { bind() { return this; }, async first() { return { till_epoch: 7 }; } }; },
};
const cacheDbB = {
  prepare() { return { bind() { return this; }, async first() { return { till_epoch: 0 }; } }; },
};
check('till epoch cache is isolated per database and merchant',
  await tillEpoch({ DB: cacheDbA }, 'same-cache-key') === 7
  && await tillEpoch({ DB: cacheDbB }, 'same-cache-key') === 0);
check('missing till registration stays unavailable instead of becoming epoch zero',
  await tillEpoch({ DB: makeD1() }, 'unregistered-till') === null);

/* A05/A06: limiter outages deny and concurrent failures accumulate atomically. */
console.log('\nA05/A06 · atomic fail-closed limiter');
const limiterRequest = request('/auth/login', { headers: { 'CF-Connecting-IP': '198.51.100.77' } });
const results = await Promise.all(Array.from({ length: 20 }, () => limitFail(limiterRequest, env, 'audit-wave')));
check('all concurrent limiter increments report durable success', results.every(Boolean));
const limiterRow = db.prepare("SELECT fails FROM pair_attempts WHERE ip = 'audit-wave|198.51.100.77'").get();
check('concurrent failures are not lost', limiterRow && limiterRow.fails === 20, String(limiterRow && limiterRow.fails));
const blocked = await limitCheck(limiterRequest, env, 'audit-wave');
check('the accumulated wave blocks the next attempt', blocked && blocked.status === 429);
const brokenLimiter = { AUTH_SECRET: SECRET, DB: makeD1({ broken: true }) };
const unavailableRead = await limitCheck(limiterRequest, brokenLimiter, 'audit-wave');
check('limiter read failure returns 503', unavailableRead && unavailableRead.status === 503);
check('limiter write failure is not reported as recorded', await limitFail(limiterRequest, brokenLimiter, 'audit-wave') === false);
const pairOutage = await postPair({
  env: brokenLimiter,
  request: request('/api/pair/redeem', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.78' }, body: { code: '000000' } }),
});
check('pairing limiter outage returns 503', pairOutage.status === 503);

/* A07: an access-mirror PIN change increments the credential revision and
 * invalidates an already-issued employee cookie. */
console.log('\nA07 · employee credential revision');
const employeeMerchant = 'employee-revision-store';
db.prepare("INSERT INTO merchant_config (merchant,features,status,till_epoch,account_id,updated_ts) VALUES (?, '{}', 'active', 0, ?, ?)").run(employeeMerchant, 'acc-race-a', Date.now());
const employeeDoc = { members: [{ id: 'employee-1', email: 'worker@revision.test', firstName: 'Worker', lastName: '', pinCode: '1234', password: '1234', authVersion: 0, function: 'caisse', venueSlug: employeeMerchant }] };
db.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?, 'employee-access', ?, 1, ?)").run(employeeMerchant, JSON.stringify(employeeDoc), Date.now());
db.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?, 'team', ?, 1, ?)").run(employeeMerchant, JSON.stringify(employeeDoc), Date.now());
const employeeLogin = await postEmployee({ env, request: request('/api/employee', { method: 'POST', body: { action: 'login', email: 'worker@revision.test', pin: '1234' } }) });
const employeeCookieValue = cookieValue(employeeLogin, EMPLOYEE_COOKIE);
check('employee login issues the revisioned cookie', employeeLogin.status === 200 && !!employeeCookieValue);
const changedEmployeeDoc = { ...employeeDoc, members: [{ ...employeeDoc.members[0], pinCode: '5678', password: '5678' }] };
const configPinChange = await postConfig({
  env,
  request: request('/api/config', {
    method: 'POST', cookie: cookiePair(SESS_COOKIE, await makeSession('acc-race-a', SECRET)),
    body: { merchant: employeeMerchant, name: 'Employee Revision Store', pins: [{
      code: '5678', name: 'Worker', role: 'caisse', memberId: 'employee-1',
      email: 'worker@revision.test', firstName: 'Worker',
    }] },
  }),
});
const storedAfterConfig = db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'").get(employeeMerchant);
const accessAfterConfig = JSON.parse(storedAfterConfig.data);
check('main config PIN change persists a nonzero credential revision', configPinChange.status === 200
  && accessAfterConfig.members[0].authVersion === 1,
  JSON.stringify({ status: configPinChange.status, body: await configPinChange.clone().json(), accessAfterConfig }));
const staleEmployee = await getEmployee({ env, request: request('/api/employee', { cookie: cookiePair(EMPLOYEE_COOKIE, employeeCookieValue) }) });
check('employee cookie issued before PIN change is rejected', staleEmployee.status === 401, String(staleEmployee.status));
const currentEmployeeLogin = await postEmployee({ env, request: request('/api/employee', { method: 'POST', body: { action: 'login', email: 'worker@revision.test', pin: '5678' } }) });
const currentEmployeeCookie = cookieValue(currentEmployeeLogin, EMPLOYEE_COOKIE);
const teamProfileEdit = await postStore({
  env,
  request: request('/api/store', {
    method: 'POST', cookie: cookiePair(SESS_COOKIE, await makeSession('acc-race-a', SECRET)),
    body: { feature: 'team', merchant: employeeMerchant, baseRev: 1, data: changedEmployeeDoc },
  }),
});
const accessAfterProfile = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'").get(employeeMerchant).data);
check('team profile write preserves the credential revision', teamProfileEdit.status === 200
  && accessAfterProfile.members[0].authVersion === 1,
  JSON.stringify({ status: teamProfileEdit.status, body: await teamProfileEdit.clone().json(), accessAfterProfile }));
const changedAgain = { ...changedEmployeeDoc, members: [{ ...changedEmployeeDoc.members[0], pinCode: '9999', password: '9999' }] };
const teamPinChange = await postStore({
  env,
  request: request('/api/store', {
    method: 'POST', cookie: cookiePair(SESS_COOKIE, await makeSession('acc-race-a', SECRET)),
    body: { feature: 'team', merchant: employeeMerchant, baseRev: 2, data: changedAgain },
  }),
});
const accessAfterTeamChange = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'").get(employeeMerchant).data);
check('team PIN change advances the durable revision', teamPinChange.status === 200
  && accessAfterTeamChange.members[0].authVersion === 2,
  JSON.stringify({ status: teamPinChange.status, body: await teamPinChange.clone().json(), accessAfterTeamChange }));
const staleAfterTeamChange = await getEmployee({ env, request: request('/api/employee', { cookie: cookiePair(EMPLOYEE_COOKIE, currentEmployeeCookie) }) });
check('cookie issued before the team PIN change is rejected', staleAfterTeamChange.status === 401);

/* Deterministic A→B→A document race: B has durably published revision 2,
 * then A's already-prepared revision-1 JSON arrives last. Both credential
 * issuance and an already-issued revision-2 session must fail closed until the
 * replaceable document catches up. */
const revisionTwoLogin = await postEmployee({ env, request: request('/api/employee', { method: 'POST', body: { action: 'login', email: 'worker@revision.test', pin: '9999' } }) });
const revisionTwoCookie = cookieValue(revisionTwoLogin, EMPLOYEE_COOKIE);
const durableRevision = db.prepare('SELECT auth_version FROM employee_auth_versions WHERE merchant = ? AND member_id = ?').get(employeeMerchant, 'employee-1');
check('durable revision 2 is present before the stale document arrives', revisionTwoLogin.status === 200 && !!revisionTwoCookie && durableRevision.auth_version === 2);
const staleAccessDoc = { members: [{ id: 'employee-1', email: 'worker@revision.test', firstName: 'Worker', lastName: '', pinCode: '5678', password: '5678', authVersion: 1, function: 'caisse', venueSlug: employeeMerchant }] };
db.prepare("UPDATE store_docs SET data = ?, updated_ts = ? WHERE merchant = ? AND feature = 'employee-access'")
  .run(JSON.stringify(staleAccessDoc), Date.now(), employeeMerchant);
const staleAccessBeforeLogin = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'").get(employeeMerchant).data);
check('the fixture installs the stale access document after durable revision 2', staleAccessBeforeLogin.members[0].pinCode === '5678' && staleAccessBeforeLogin.members[0].authVersion === 1);
const staleDocumentLogin = await postEmployee({ env, request: request('/api/employee', { method: 'POST', body: { action: 'login', email: 'worker@revision.test', pin: '5678' } }) });
check('login refuses a stale document version after a newer durable revision', staleDocumentLogin.status === 401 && !cookieValue(staleDocumentLogin, EMPLOYEE_COOKIE), String(staleDocumentLogin.status));
const revisionTwoSessionAfterStaleDoc = await getEmployee({ env, request: request('/api/employee', { cookie: cookiePair(EMPLOYEE_COOKIE, revisionTwoCookie) }) });
const staleRowForEvidence = db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'").get(employeeMerchant);
check('live employee authorization refuses a current cookie beside a stale document', revisionTwoSessionAfterStaleDoc.status === 401,
  JSON.stringify({ status: revisionTwoSessionAfterStaleDoc.status, access: JSON.parse(staleRowForEvidence.data), durable: durableRevision }));
db.prepare("UPDATE store_docs SET data = ?, updated_ts = ? WHERE merchant = ? AND feature = 'employee-access'")
  .run(JSON.stringify({ ...changedAgain, members: [{ ...changedAgain.members[0], authVersion: 2 }] }), Date.now(), employeeMerchant);
const durableRevisionReadFailureDb = {
  prepare(sql) {
    if (normalize(sql).startsWith('SELECT auth_version FROM employee_auth_versions')) throw new Error('synthetic-revision-read-outage');
    return env.DB.prepare(sql);
  },
  batch(statements) { return env.DB.batch(statements); },
};
const unavailableRevisionLogin = await postEmployee({
  env: { ...env, DB: durableRevisionReadFailureDb },
  request: request('/api/employee', { method: 'POST', body: { action: 'login', email: 'worker@revision.test', pin: '9999' } }),
});
check('employee login fails closed when the durable revision read is unavailable', unavailableRevisionLogin.status === 401 && !cookieValue(unavailableRevisionLogin, EMPLOYEE_COOKIE));
const unavailableRevisionSession = await getEmployee({
  env: { ...env, DB: durableRevisionReadFailureDb },
  request: request('/api/employee', { cookie: cookiePair(EMPLOYEE_COOKIE, revisionTwoCookie) }),
});
check('live employee authorization fails closed when the durable revision read is unavailable', unavailableRevisionSession.status === 401);

/* A08: password recovery bumps the account epoch; middleware accepts the fresh
 * replacement session and rejects the old one. */
console.log('\nA08 · password-reset session invalidation');
const resetPassword = await hashPassword('OldPassword-123');
db.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch) VALUES (?,?,?,?,?,?,?,?,0)")
  .run('acc-reset', 'reset@audit.test', 'Reset', 'Reset Store', resetPassword.salt, resetPassword.hash, Date.now(), 'active');
const resetToken = makeResetToken();
db.prepare("INSERT INTO reset_tokens (selector,account_id,verifier,created_ts,expires_ts,used_ts,actor,actor_id) VALUES (?,?,?,?,?,NULL,'client','')")
  .run(resetToken.selector, 'acc-reset', await resetVerifierHash(SECRET, resetToken.verifier), Date.now(), Date.now() + 3600000);
const oldResetSession = await makeSession('acc-reset', SECRET, 0);
const resetResponse = await postReset({ env, request: request('/auth/reset', { method: 'POST', body: { token: resetToken.token, password: 'NewPassword-456' } }) });
const freshResetCookie = cookieValue(resetResponse, SESS_COOKIE);
check('password reset succeeds and returns a replacement cookie', resetResponse.status === 200 && !!freshResetCookie);
let oldNext = false;
const oldResetResult = await middleware({
  request: request('/api/private', { cookie: cookiePair(SESS_COOKIE, oldResetSession) }), env,
  next: async () => { oldNext = true; return new Response('authorized'); },
});
let freshNext = false;
const freshResetResult = await middleware({
  request: request('/api/private', { cookie: cookiePair(SESS_COOKIE, freshResetCookie) }), env,
  next: async () => { freshNext = true; return new Response('authorized'); },
});
check('old account session is rejected after password reset', oldResetResult.status === 401 && !oldNext);
check('replacement account session is accepted', freshResetResult.status === 200 && freshNext);
const oldMe = await getMe({
  env,
  request: request('/api/me', { cookie: cookiePair(SESS_COOKIE, oldResetSession) }),
});
check('public account identity endpoint rejects the old reset cookie', oldMe.status === 200
  && (await oldMe.json()).authenticated === false);
const oldConfig = await postConfig({
  env,
  request: request('/api/config', {
    method: 'POST',
    cookie: `${cookiePair(SESS_COOKIE, oldResetSession)}; ${cookiePair(TILL_COOKIE, await tillToken(SECRET, 'reset-store', 0))}`,
    body: { merchant: 'reset-store', pins: [] },
  }),
});
check('owner config route rejects the old reset cookie even beside a till cookie', oldConfig.status === 401);

/* A09: operational writes are refused after store suspension, while no
 * document mutation is attempted. */
console.log('\nA09 · suspended-store operational writes');
const replacementEmployeeLogin = await postEmployee({ env, request: request('/api/employee', { method: 'POST', body: { action: 'login', email: 'worker@revision.test', pin: '9999' } }) });
const replacementEmployeeCookie = cookieValue(replacementEmployeeLogin, EMPLOYEE_COOKIE);
db.prepare('UPDATE merchant_config SET status = ? WHERE merchant = ?').run('suspended', employeeMerchant);
const beforeTeamRev = db.prepare("SELECT rev FROM store_docs WHERE merchant = ? AND feature = 'team'").get(employeeMerchant).rev;
const employeeWrite = await postEmployee({
  env,
  request: request('/api/employee', {
    method: 'POST', cookie: cookiePair(EMPLOYEE_COOKIE, replacementEmployeeCookie),
    body: { action: 'planning-request', type: 'leave', startDate: '2026-09-10', endDate: '2026-09-10' },
  }),
});
check('suspended employee planning write is refused', employeeWrite.status === 403);
check('suspended employee planning write does not mutate team', db.prepare("SELECT rev FROM store_docs WHERE merchant = ? AND feature = 'team'").get(employeeMerchant).rev === beforeTeamRev);
const tillForSuspended = await tillToken(SECRET, employeeMerchant, 0);
const teamWrite = await postTeam({
  env,
  request: request('/api/team/live', { method: 'POST', cookie: cookiePair(TILL_COOKIE, tillForSuspended), body: { merchant: employeeMerchant, action: 'message', text: 'should not write' } }),
});
check('suspended team-live operational write is refused', teamWrite.status === 403);

if (failures.length) {
  console.error(`\n✗ ${failures.length}/${checks} auth remediation checks failed`);
  process.exitCode = 1;
} else {
  console.log(`\n✓ ${checks} auth remediation checks green`);
}
