#!/usr/bin/env node
// Test suite: Push notification registration (functions/api/push/register.js)
import assert from 'node:assert';
import { onRequestPost, onRequestGet } from '../functions/api/push/register.js';
import { dispatchPushEvent } from '../functions/api/push/_dispatch.js';
import {
  makeSession, SESS_COOKIE, TILL_COOKIE, TERMINAL_COOKIE, tillToken, terminalToken,
} from '../functions/auth/_lib.js';

let passed = 0;
const EXPECTED = 21;
function check(label, ok) {
  assert(ok, label);
  passed++;
  console.log('  + ' + label);
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection in push-registration-test:', err);
  process.exit(1);
});

const SECRET = 'push-test-auth-secret-32-bytes!!';
const MERCHANT_A = 'cafe-atlas';
const MERCHANT_B = 'maison-rivale';
const TOKEN_A = 'test_apns_' + 'a'.repeat(32);
const TOKEN_B = 'test_apns_' + 'b'.repeat(32);
const TOKEN_C = 'test_apns_' + 'c'.repeat(32);

function createMockDb({ hasTable = true } = {}) {
  const rows = new Map();
  const merchants = new Map([
    [MERCHANT_A, { account_id: 'acc-owner-a', status: 'active', till_epoch: 0 }],
    [MERCHANT_B, { account_id: 'acc-owner-b', status: 'active', till_epoch: 0 }],
    ['cafe-suspended', { account_id: 'acc-owner-a', status: 'suspended', till_epoch: 0 }],
    ['cafe-pending', { account_id: 'acc-owner-a', status: 'pending', till_epoch: 0 }],
  ]);
  const accounts = new Map([
    ['acc-owner-a', { business: 'Café Atlas' }],
    ['acc-owner-b', { business: 'Maison Rivale' }],
  ]);
  return {
    rows,
    prepare(rawSql) {
      const q = String(rawSql).replace(/\s+/g, ' ').trim();
      const placeholderCount = (q.match(/\?/g) || []).length;
      const stmt = {
        args: [],
        bind(...params) {
          if (params.length !== placeholderCount) {
            throw new Error(`D1 bind arity mismatch: expected ${placeholderCount}, received ${params.length}`);
          }
          stmt.args = params;
          return stmt;
        },
        async run() {
          if (!hasTable && q.includes('push_tokens')) throw new Error('no such table: push_tokens');
          if (q.startsWith('DELETE FROM push_tokens')) {
            const [merchant, token, requiredRole] = stmt.args;
            const key = `${merchant}:${token}`;
            const row = rows.get(key);
            const allowed = !!row && (!requiredRole || row.role === requiredRole);
            if (allowed) rows.delete(key);
            return { success: true, meta: { changes: allowed ? 1 : 0 } };
          }
          if (q.includes('INSERT INTO push_tokens')) {
            const [merchant, token, role, employeeId, platform, deviceId, createdAt, updatedAt] = stmt.args;
            rows.set(`${merchant}:${token}`, { merchant, token, role, employeeId, platform, deviceId, createdAt, updatedAt });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          if (!hasTable && q.includes('push_tokens')) throw new Error('no such table: push_tokens');
          if (q.startsWith('SELECT token, platform FROM push_tokens')) {
            const [merchant, role] = stmt.args;
            return { results: [...rows.values()].filter((row) =>
              row.merchant === merchant && (!role || role === 'all' || row.role === role || row.role === 'all')
            ).map((row) => ({ token: row.token, platform: row.platform })) };
          }
          return { results: [] };
        },
        async first() {
          if (q.startsWith('SELECT account_id FROM merchant_config')) {
            const row = merchants.get(String(stmt.args[0]));
            return row ? { account_id: row.account_id } : null;
          }
          if (q.startsWith('SELECT business FROM accounts')) return accounts.get(String(stmt.args[0])) || null;
          if (q.startsWith('SELECT status FROM merchant_config')) {
            const row = merchants.get(String(stmt.args[0]));
            return row ? { status: row.status } : null;
          }
          if (q.startsWith('SELECT till_epoch FROM merchant_config')) {
            const row = merchants.get(String(stmt.args[0]));
            return row ? { till_epoch: row.till_epoch } : null;
          }
          return null;
        },
      };
      return stmt;
    },
  };
}

function request(body, cookie = '') {
  return new Request('https://kiwi.test/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function ownerCookie(accountId) {
  return `${SESS_COOKIE}=${await makeSession(accountId, SECRET)}`;
}

async function tillCookie(merchant, terminalId = 'terminal-counter-1') {
  const till = await tillToken(SECRET, merchant);
  const terminal = await terminalToken(SECRET, merchant, terminalId);
  return `${TILL_COOKIE}=${till}; ${TERMINAL_COOKIE}=${terminal}`;
}

async function run() {
  console.log('\n■ Push Registration & Dispatch Tests');
  const db = createMockDb();
  const env = { DB: db, AUTH_SECRET: SECRET };
  const ownerA = await ownerCookie('acc-owner-a');
  const ownerB = await ownerCookie('acc-owner-b');

  const getRes = await onRequestGet();
  check('GET returns 405 Method Not Allowed', getRes.status === 405 && (await getRes.json()).error === 'method-not-allowed');

  const unauthRes = await onRequestPost({ request: request({ merchant: MERCHANT_A, token: TOKEN_A, platform: 'ios' }), env });
  check('unauthenticated registration returns 401 and writes no row', unauthRes.status === 401 && db.rows.size === 0);

  const crossOwner = await onRequestPost({
    request: request({ merchant: MERCHANT_B, token: TOKEN_A, platform: 'ios' }, ownerA), env,
  });
  check('owner A cannot register against merchant B and no row is written', crossOwner.status === 401 && db.rows.size === 0);

  const crossTill = await onRequestPost({
    request: request({ merchant: MERCHANT_B, token: TOKEN_A, platform: 'ios' }, await tillCookie(MERCHANT_A)), env,
  });
  check('till paired to A cannot register against B and no row is written', crossTill.status === 401 && db.rows.size === 0);

  for (const merchant of ['cafe-suspended', 'cafe-pending']) {
    const blocked = await onRequestPost({
      request: request({ merchant, token: TOKEN_A, platform: 'ios' }, ownerA), env,
    });
    check(`${merchant} is refused by strict tenant resolution and writes no row`, blocked.status === 401 && db.rows.size === 0);
  }

  const badToken = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: 'short', platform: 'ios' }, ownerA), env,
  });
  check('short token returns 400 invalid-token', badToken.status === 400 && (await badToken.json()).error === 'invalid-token');

  const badPlatform = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_A, platform: 'windows' }, ownerA), env,
  });
  check('invalid platform returns 400 invalid-platform', badPlatform.status === 400 && (await badPlatform.json()).error === 'invalid-platform');

  const tillA = await tillCookie(MERCHANT_A);
  const tillRegister = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_A, platform: 'ios', role: 'caisse', employeeId: 'forged-employee' }, tillA), env,
  });
  const tillJson = await tillRegister.json();
  const rowA = db.rows.get(`${MERCHANT_A}:${TOKEN_A}`);
  check('paired till may register a caisse token without accepting an employee identity',
    tillRegister.status === 200 && tillJson.ok === true && rowA?.role === 'caisse' && rowA?.employeeId === null);
  check('registration response never contains a token', !JSON.stringify(tillJson).includes(TOKEN_A));

  const beforeForbiddenRole = db.rows.size;
  const tillKitchen = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_B, platform: 'ios', role: 'cuisine' }, tillA), env,
  });
  check('paired till cannot register an arbitrary notification role or write a row',
    tillKitchen.status === 403 && (await tillKitchen.json()).error === 'forbidden-role' && db.rows.size === beforeForbiddenRole);

  const ownerUpdate = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_A, platform: 'ios', role: 'cuisine', deviceId: 'kid-test' }, ownerA), env,
  });
  check('owner can update an existing token to another role without a duplicate',
    ownerUpdate.status === 200 && db.rows.size === 1 && db.rows.get(`${MERCHANT_A}:${TOKEN_A}`)?.role === 'cuisine');

  const sameMerchantCrossRole = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_A, action: 'unregister', role: 'caisse' }, tillA), env,
  });
  const sameMerchantCrossRoleJson = await sameMerchantCrossRole.json();
  check('paired till cannot unregister a kitchen token in its own merchant',
    sameMerchantCrossRole.status === 200 && sameMerchantCrossRoleJson.unregistered === false &&
    db.rows.get(`${MERCHANT_A}:${TOKEN_A}`)?.role === 'cuisine');

  const ownCaisseRegister = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_C, platform: 'ios', role: 'caisse' }, tillA), env,
  });
  check('paired till can still create its own caisse token before unregistering it',
    ownCaisseRegister.status === 200 && db.rows.get(`${MERCHANT_A}:${TOKEN_C}`)?.role === 'caisse');

  const ownerBRegister = await onRequestPost({
    request: request({ merchant: MERCHANT_B, token: TOKEN_B, platform: 'ios', role: 'dashboard' }, ownerB), env,
  });
  check('owner B can register its own merchant token', ownerBRegister.status === 200 && db.rows.has(`${MERCHANT_B}:${TOKEN_B}`));

  const foreignUnregister = await onRequestPost({
    request: request({ merchant: MERCHANT_B, token: TOKEN_B, action: 'unregister' }, ownerA), env,
  });
  check('owner A cannot unregister merchant B token and the row remains',
    foreignUnregister.status === 401 && db.rows.has(`${MERCHANT_B}:${TOKEN_B}`));

  const tillForeignUnregister = await onRequestPost({
    request: request({ merchant: MERCHANT_B, token: TOKEN_B, action: 'unregister' }, tillA), env,
  });
  check('till A cannot unregister merchant B token and the row remains',
    tillForeignUnregister.status === 401 && db.rows.has(`${MERCHANT_B}:${TOKEN_B}`));

  const ownUnregister = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_C, action: 'unregister' }, tillA), env,
  });
  check('paired till may unregister its own merchant caisse token only',
    ownUnregister.status === 200 && (await ownUnregister.json()).unregistered === true &&
    !db.rows.has(`${MERCHANT_A}:${TOKEN_C}`) && db.rows.has(`${MERCHANT_A}:${TOKEN_A}`) &&
    db.rows.has(`${MERCHANT_B}:${TOKEN_B}`));

  const unmigratedDb = createMockDb({ hasTable: false });
  const unmigratedEnv = { DB: unmigratedDb, AUTH_SECRET: SECRET };
  const unmigrated = await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_A, platform: 'ios' }, ownerA), env: unmigratedEnv,
  });
  check('missing push_tokens table fails honestly with 503',
    unmigrated.status === 503 && (await unmigrated.json()).error === 'push-tokens-unavailable');

  const dispatchMissing = await dispatchPushEvent(unmigratedEnv, MERCHANT_A, { role: 'caisse', title: 'Test' });
  check('dispatch skips safely when the table is missing', dispatchMissing.skipped === 'table-unavailable');

  await onRequestPost({
    request: request({ merchant: MERCHANT_A, token: TOKEN_A, platform: 'ios', role: 'caisse' }, ownerA), env,
  });
  const dispatchUnconfigured = await dispatchPushEvent(env, MERCHANT_A, { role: 'caisse', title: 'Test' });
  check('dispatch skips safely when gateway credentials are absent', dispatchUnconfigured.skipped === 'gateway-unconfigured');

  assert.strictEqual(passed, EXPECTED, `Expected ${EXPECTED} checks, passed ${passed}`);
  console.log(`\npush-registration-test: ${passed} checks green\n`);
}

run();
