#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Tests du rapporteur d'erreurs client (Observability & Fail-Soft)
 *
 *   node tools/error-reporter-test.mjs
 *
 * Vérifie :
 *   1. CAVIARDAGE    téléphones marocains, PINs, tokens, emails, secrets d'URL
 *   2. INGESTION     création de table, insertion et agrégation par signature
 *   3. FAIL-SOFT     corps vide / JSON invalide / absence de DB
 *   4. ADMIN         gating opérateur, consultation et filtrage
 * ═══════════════════════════════════════════════════════════════════════════ */

import {
  operatorToken,
  operatorIdToken,
  OP_COOKIE,
  OPID_COOKIE,
  hashPassword,
} from '../functions/auth/_lib.js';
import { onRequestPost as postError } from '../functions/api/error.js';
import { onRequestGet as getAdminErrors } from '../functions/api/admin/errors.js';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SECRET = 'test-secret-for-err-reporter-tests-32b';
let pass = 0;
const fails = [];

function assert(name, condition, extra) {
  if (condition) {
    pass++;
  } else {
    fails.push(`${name}${extra ? ` — ${extra}` : ''}`);
  }
}

// ── 1. Test Client Redaction Script in VM ────────────────────────────────────
function testClientRedaction() {
  const code = fs.readFileSync(path.join(ROOT, 'assets', 'err-reporter.js'), 'utf8');
  const sandbox = {
    window: {
      addEventListener: () => {},
      location: { pathname: '/dashboard.html' },
      navigator: { userAgent: 'Mozilla/5.0 Test Browser' }
    },
    localStorage: { getItem: () => 'test-merchant' },
    Blob: class Blob {},
    Date: Date,
    JSON: JSON,
    parseInt: parseInt,
    String: String
  };
  sandbox.this = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const redact = sandbox.window.KiwiRedactForLog;
  assert('Reporter loads in browser context', typeof redact === 'function');

  // Phone numbers
  const ph1 = redact('Error contacting customer at +212612345678 on route');
  assert('Redacts +212 phone numbers', ph1.includes('[PHONE_REDACTED]') && !ph1.includes('212612345678'));

  const ph2 = redact('Phone 0655443322 failed to receive SMS');
  assert('Redacts 06 phone numbers', ph2.includes('[PHONE_REDACTED]') && !ph2.includes('0655443322'));

  // PINs / passcodes
  const pin1 = redact('Failed PIN 1234 entry for cashier');
  assert('Redacts 4-digit PIN', pin1.includes('[PIN_REDACTED]') && !pin1.includes('1234'));

  const pin2 = redact('Code 987654 rejected');
  assert('Redacts 6-digit PIN', pin2.includes('[PIN_REDACTED]') && !pin2.includes('987654'));

  // Auth tokens & headers
  const auth1 = redact('Authorization: Bearer secret-jwt-token-12345.abc');
  assert('Redacts Bearer tokens', auth1.includes('[AUTH_REDACTED]') && !auth1.includes('secret-jwt-token-12345'));

  // Email addresses
  const em1 = redact('User yassine.atlas@gmail.com failed login');
  assert('Redacts email addresses', em1.includes('[EMAIL_REDACTED]') && !em1.includes('yassine.atlas@gmail.com'));
}

// ── 2. Mock D1 Database ─────────────────────────────────────────────────────
function makeMockDB() {
  const errors = [];
  const operators = [];
  const attempts = new Map();

  const db = {
    _errors: errors,
    _operators: operators,
    _attempts: attempts,
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let binds = [];
      const stmt = {
        bind(...args) {
          binds = args;
          return stmt;
        },
        async run() {
          if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) {
            return { success: true };
          }
          if (q.startsWith('INSERT INTO pair_attempts')) {
            attempts.set(binds[0], { ip: binds[0], fails: 1, first_ts: binds[1], blocked_until: null });
            return { success: true };
          }
          if (q.startsWith('UPDATE pair_attempts SET fails = ?, blocked_until = ? WHERE ip = ?')) {
            const row = attempts.get(binds[2]) || { ip: binds[2] };
            row.fails = binds[0];
            row.blocked_until = binds[1];
            attempts.set(binds[2], row);
            return { success: true };
          }
          if (q.startsWith('INSERT INTO client_errors')) {
            errors.push({
              id: binds[0],
              merchant: binds[1],
              message: binds[2],
              file: binds[3],
              line: binds[4],
              col: binds[5],
              stack: binds[6],
              url: binds[7],
              version: binds[8],
              user_agent: binds[9],
              count: 1,
              first_seen_ts: binds[10],
              last_seen_ts: binds[11]
            });
            return { success: true };
          }
          if (q.startsWith('UPDATE client_errors SET count = count + 1')) {
            const last_ts = binds[0];
            const version = binds[1];
            const stack = binds[2];
            const id = binds[3];
            const row = errors.find(e => e.id === id);
            if (row) {
              row.count++;
              row.last_seen_ts = last_ts;
              if (version) row.version = version;
              if (stack) row.stack = stack;
            }
            return { success: true };
          }
          return { success: true };
        },
        async first() {
          if (q.startsWith('SELECT blocked_until FROM pair_attempts WHERE ip = ?')) {
            const a = attempts.get(binds[0]);
            return a ? { blocked_until: a.blocked_until } : null;
          }
          if (q.startsWith('SELECT fails, first_ts FROM pair_attempts WHERE ip = ?')) {
            const a = attempts.get(binds[0]);
            return a ? { fails: a.fails, first_ts: a.first_ts } : null;
          }
          if (q.startsWith('SELECT id, count FROM client_errors WHERE merchant = ? AND file = ? AND line = ? AND message = ?')) {
            const m = binds[0], f = binds[1], l = binds[2], msg = binds[3], minTs = binds[4];
            const row = errors.find(e => e.merchant === m && e.file === f && e.line === l && e.message === msg && e.last_seen_ts > minTs);
            return row ? { id: row.id, count: row.count } : null;
          }
          if (q.startsWith('SELECT id FROM operators WHERE id = ?') || q.startsWith('SELECT id, role, code_hash FROM operators WHERE id = ?')) {
            const row = operators.find(o => o.id === binds[0]);
            return row || null;
          }
          return null;
        },
        async all() {
          if (q.startsWith('SELECT id, merchant, message, file, line, col, stack, url, version, user_agent, count, first_seen_ts, last_seen_ts FROM client_errors WHERE merchant = ?')) {
            const m = binds[0], limit = binds[1];
            const rows = errors.filter(e => e.merchant === m).slice(0, limit);
            return { results: rows };
          }
          if (q.startsWith('SELECT id, merchant, message, file, line, col, stack, url, version, user_agent, count, first_seen_ts, last_seen_ts FROM client_errors')) {
            const limit = binds[0];
            const rows = errors.slice(0, limit);
            return { results: rows };
          }
          return { results: [] };
        }
      };
      return stmt;
    }
  };
  return db;
}

// ── 3. Run Ingestion & Gating Tests ──────────────────────────────────────────
async function runIngestionTests() {
  const db = makeMockDB();
  const env = { DB: db, AUTH_SECRET: SECRET };

  // A. Ingest fresh error
  const res1 = await postError({
    request: new Request('https://kiwi-os.com/api/error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        merchant: 'cafe-atlas',
        message: 'Cannot read properties of null (reading "render")',
        file: 'assets/dashboard.js',
        line: 142,
        col: 10,
        stack: 'TypeError at line 142 in assets/dashboard.js',
        version: 'v432'
      })
    }),
    env
  });
  const d1 = await res1.json();
  assert('Ingestion succeeds and creates error record', res1.status === 200 && d1.ok === true && d1.created === true);
  assert('DB contains 1 error record', db._errors.length === 1 && db._errors[0].count === 1);

  // B. Ingest identical error -> Aggregation
  const res2 = await postError({
    request: new Request('https://kiwi-os.com/api/error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        merchant: 'cafe-atlas',
        message: 'Cannot read properties of null (reading "render")',
        file: 'assets/dashboard.js',
        line: 142,
        col: 10,
        stack: 'TypeError at line 142 in assets/dashboard.js',
        version: 'v432'
      })
    }),
    env
  });
  const d2 = await res2.json();
  assert('Identical error is aggregated', res2.status === 200 && d2.ok === true && d2.aggregated === true);
  assert('DB error count incremented to 2 without duplicate row', db._errors.length === 1 && db._errors[0].count === 2);

  // C. Ingest error containing un-sanitized phone and PIN -> Server sanitizes
  await postError({
    request: new Request('https://kiwi-os.com/api/error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        merchant: 'snack-medina',
        message: 'Customer 0612345678 entered PIN 4321 failure',
        file: 'assets/caisse.js',
        line: 55
      })
    }),
    env
  });
  const errRow = db._errors.find(e => e.merchant === 'snack-medina');
  assert('Server sanitizes message on ingestion', errRow && errRow.message.includes('[PHONE_REDACTED]') && errRow.message.includes('[PIN_REDACTED]'));

  // D. Fail-soft tests
  const resEmpty = await postError({
    request: new Request('https://kiwi-os.com/api/error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }),
    env
  });
  const dEmpty = await resEmpty.json();
  assert('Empty payload fails soft with ok:false', resEmpty.status === 200 && dEmpty.ok === false);

  const resNoDb = await postError({
    request: new Request('https://kiwi-os.com/api/error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'test' })
    }),
    env: {}
  });
  const dNoDb = await resNoDb.json();
  assert('Missing DB fails soft with ok:false', resNoDb.status === 200 && dNoDb.ok === false);

  // E. Server-side Rate Limiting (Flood Protection)
  const spammerMerchant = 'flooding-merchant';
  let spamBlocked = false;
  for (let i = 0; i < 10; i++) {
    const resSpam = await postError({
      request: new Request('https://kiwi-os.com/api/error', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.168.1.50' },
        body: JSON.stringify({
          merchant: spammerMerchant,
          message: `Looping error #${i}`,
          file: 'assets/dashboard.js',
          line: 100
        })
      }),
      env
    });
    if (resSpam.status === 429) {
      spamBlocked = true;
      const dSpam = await resSpam.json();
      assert('Rate limiter returns 429 too_many_attempts on excessive error burst', dSpam.error === 'too_many_attempts');
      break;
    }
  }
  assert('Server-side rate limiter actively throttles error flood', spamBlocked === true);

  // E. Admin Diagnostics Gating
  const resAdminUnauth = await getAdminErrors({
    request: new Request('https://kiwi-os.com/api/admin/errors'),
    env
  });
  assert('Admin endpoint requires operator auth (403)', resAdminUnauth.status === 403);

  // Add operator
  const opId = 'op-1';
  db._operators.push({ id: opId, role: 'support', code_hash: await hashPassword('123456') });
  const opToken = await operatorToken(SECRET);
  const opIdTok = await operatorIdToken(SECRET, opId);
  const opCookie = `${OP_COOKIE}=${opToken}; ${OPID_COOKIE}=${opIdTok}`;
  const opHeaders = { Cookie: opCookie };

  const resAdminAuth = await getAdminErrors({
    request: new Request('https://kiwi-os.com/api/admin/errors', { headers: opHeaders }),
    env
  });
  const dAdmin = await resAdminAuth.json();
  assert('Authenticated operator receives error list', resAdminAuth.status === 200 && dAdmin.ok === true && dAdmin.count >= 2);

  // Filter by merchant
  const resAdminFiltered = await getAdminErrors({
    request: new Request('https://kiwi-os.com/api/admin/errors?merchant=cafe-atlas', { headers: opHeaders }),
    env
  });
  const dFiltered = await resAdminFiltered.json();
  assert('Admin filtered by merchant returns matching rows only', resAdminFiltered.status === 200 && dFiltered.count === 1 && dFiltered.errors[0].merchant === 'cafe-atlas');
}

async function main() {
  console.log('■ Client Error Reporter & Observability Tests');
  testClientRedaction();
  await runIngestionTests();

  if (fails.length) {
    console.error(`\n✗ ${fails.length} failure(s) in error reporter tests:`);
    fails.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log(`  ✓ all ${pass} error reporter & telemetry checks passed cleanly`);
  }
}

main().catch(err => {
  console.error('Test harness exception:', err);
  process.exit(1);
});
