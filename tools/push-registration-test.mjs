#!/usr/bin/env node
// Test suite: Push notification registration (functions/api/push/register.js)
import assert from 'node:assert';
import { onRequestPost, onRequestGet } from '../functions/api/push/register.js';
import { dispatchPushEvent } from '../functions/api/push/_dispatch.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

let passed = 0;
const EXPECTED = 13;

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

// Mock DB implementation
function createMockDb(hasTable = true) {
  const rows = new Map();
  return {
    rows,
    prepare(rawSql) {
      const q = String(rawSql).replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [],
        bind(...params) {
          stmt.args = params;
          return stmt;
        },
        async run() {
          if (!hasTable && q.includes('push_tokens')) {
            throw new Error('no such table: push_tokens');
          }
          if (q.startsWith('DELETE FROM push_tokens')) {
            const [merchant, token] = stmt.args;
            const key = `${merchant}:${token}`;
            const existed = rows.has(key);
            rows.delete(key);
            return { success: true, meta: { changes: existed ? 1 : 0 } };
          }
          if (q.includes('INSERT INTO push_tokens')) {
            const [merchant, token, role, employeeId, platform, deviceId, createdAt, updatedAt] = stmt.args;
            const key = `${merchant}:${token}`;
            rows.set(key, { merchant, token, role, employeeId, platform, deviceId, createdAt, updatedAt });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true };
        },
        async all() {
          if (!hasTable && q.includes('push_tokens')) {
            throw new Error('no such table: push_tokens');
          }
          if (q.startsWith('SELECT token, platform FROM push_tokens')) {
            const [merchant, role] = stmt.args;
            const results = [];
            for (const row of rows.values()) {
              if (row.merchant === merchant) {
                if (!role || role === 'all' || row.role === role || row.role === 'all') {
                  results.push({ token: row.token, platform: row.platform });
                }
              }
            }
            return { results };
          }
          return { results: [] };
        },
        async first() {
          if (q.startsWith('SELECT account_id FROM merchant_config')) {
            return { account_id: 'acc-owner' };
          }
          if (q.startsWith('SELECT business FROM accounts')) {
            return { business: 'Café Atlas' };
          }
          if (q.startsWith('SELECT status FROM merchant_config')) {
            return { status: 'active' };
          }
          return null;
        }
      };
      return stmt;
    }
  };
}

async function run() {
  console.log('\n■ Push Registration & Dispatch Tests');

  // 1. GET requests are rejected with 405 Method Not Allowed
  const getRes = await onRequestGet();
  const getJson = await getRes.json();
  check('GET returns 405 Method Not Allowed', getRes.status === 405 && getJson.error === 'method-not-allowed');

  // 2. Reject unauthenticated or anonymous requests (401)
  const db = createMockDb(true);
  const unauthReq = new Request('https://kiwi.test/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: 'cafe-atlas', token: 'a'.repeat(64), platform: 'ios' })
  });
  const unauthRes = await onRequestPost({ request: unauthReq, env: { DB: db, AUTH_SECRET: SECRET } });
  check('Unauthenticated request returns 401', unauthRes.status === 401);

  // Helper with valid owner session cookie for authorized access
  const sessionToken = await makeSession('acc-owner', SECRET);
  function authRequest(body) {
    return new Request('https://kiwi.test/api/push/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${SESS_COOKIE}=${sessionToken}`
      },
      body: JSON.stringify(body)
    });
  }
  const env = { DB: db, AUTH_SECRET: SECRET };

  // 3. Reject invalid or missing token (400)
  const badTokenReq = authRequest({ merchant: 'cafe-atlas', token: 'short', platform: 'ios' });
  const badTokenRes = await onRequestPost({ request: badTokenReq, env });
  const badTokenJson = await badTokenRes.json();
  check('Short/invalid token returns 400 invalid-token', badTokenRes.status === 400 && badTokenJson.error === 'invalid-token');

  // 4. Reject invalid platform (400)
  const badPlatReq = authRequest({ merchant: 'cafe-atlas', token: 'a'.repeat(64), platform: 'windows' });
  const badPlatRes = await onRequestPost({ request: badPlatReq, env });
  const badPlatJson = await badPlatRes.json();
  check('Invalid platform returns 400 invalid-platform', badPlatRes.status === 400 && badPlatJson.error === 'invalid-platform');

  // 5. Successful registration returns 200 { ok: true } without echoing token
  const validReq = authRequest({
    merchant: 'cafe-atlas',
    token: 'apns_device_token_secret_1234567890abcdef',
    platform: 'ios',
    role: 'caisse',
    deviceId: 'kid_1234'
  });
  const validRes = await onRequestPost({ request: authRequest({ merchant: "cafe-atlas", token: "apns_device_token_secret_1234567890abcdef", platform: "ios", role: "caisse" }), env });
  const validJson = await validRes.json();
  check('Valid registration returns 200 { ok: true }', validRes.status === 200 && validJson.ok === true);
  check('Registration response never contains or leaks the token', !JSON.stringify(validJson).includes('apns_device_token_secret'));

  // 6. Idempotent registration updates existing row without creating duplicate
  const updateReq = authRequest({
    merchant: 'cafe-atlas',
    token: 'apns_device_token_secret_1234567890abcdef',
    platform: 'ios',
    role: 'cuisine',
    deviceId: 'kid_1234'
  });
  const updateRes = await onRequestPost({ request: updateReq, env });
  check('Idempotent update succeeds with 200', updateRes.status === 200);
  check('Token row updated in DB with new role and no duplicate', db.rows.size === 1 && db.rows.get('cafe-atlas:apns_device_token_secret_1234567890abcdef').role === 'cuisine');

  // 7. Unregister action removes the token
  const unregReq = authRequest({
    merchant: 'cafe-atlas',
    token: 'apns_device_token_secret_1234567890abcdef',
    action: 'unregister'
  });
  const unregRes = await onRequestPost({ request: unregReq, env });
  const unregJson = await unregRes.json();
  check('Unregister returns 200 with unregistered: true', unregRes.status === 200 && unregJson.unregistered === true);
  check('Token successfully removed from database', db.rows.size === 0);

  // 8. Honest 503 fallback when D1 table push_tokens has not been migrated
  const unmigratedDb = createMockDb(false);
  const unmigratedEnv = { DB: unmigratedDb, AUTH_SECRET: SECRET };
  const unmigratedReq = authRequest({
    merchant: 'cafe-atlas',
    token: 'apns_device_token_secret_1234567890abcdef',
    platform: 'ios'
  });
  const unmigratedRes = await onRequestPost({ request: unmigratedReq, env: unmigratedEnv });
  const unmigratedJson = await unmigratedRes.json();
  check('Unmigrated D1 table fails honestly with 503 push-tokens-unavailable',
    unmigratedRes.status === 503 && unmigratedJson.error === 'push-tokens-unavailable');

  // 9. Dispatch helper cleanly skips when table missing or credentials unconfigured
  const dispatchMissing = await dispatchPushEvent(unmigratedEnv, 'cafe-atlas', { role: 'caisse', title: 'Test' });
  check('Dispatch gracefully skips without crashing when table is missing', dispatchMissing.skipped === 'table-unavailable');

  // Re-register a token on the provisioned DB to test unconfigured gateway credentials
  await onRequestPost({ request: authRequest({ merchant: "cafe-atlas", token: "apns_device_token_secret_1234567890abcdef", platform: "ios", role: "caisse" }), env });
  const dispatchUnconf = await dispatchPushEvent(env, 'cafe-atlas', { role: 'caisse', title: 'Test' });
  check('Dispatch gracefully skips without crashing when gateway credentials unconfigured', dispatchUnconf.skipped === 'gateway-unconfigured');

  assert.strictEqual(passed, EXPECTED, `Expected ${EXPECTED} checks, passed ${passed}`);
  console.log(`\npush-registration-test: ${passed} checks green\n`);
}

run();
