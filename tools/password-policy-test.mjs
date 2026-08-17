#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PASSWORD POLICY BEHAVIOURAL TEST (NIST SP 800-63B)
 *
 * Checks:
 *   - 9 chars rejected ('short')
 *   - 10 chars accepted (null)
 *   - Passphrase with spaces accepted ('mon cafe a casablanca')
 *   - Over-blocking regression guards:
 *       'mon cafe a casablanca' (accepted)
 *       'le pressing du marshan' (accepted)
 *       '2026 fut une bonne annee' (accepted)
 *       'AtlasSecret1!' (accepted, proves NO composition rules)
 *   - Common passwords rejected ('common'):
 *       'password1234'
 *       'casablanca2024'
 *       'marrakech2026'
 *       'motdepasse2026'
 *       'azerty123456'
 *       'Password1!' (root 'password' + suffix)
 *   - Digit-only strings rejected ('common')
 *   - Single repeated character rejected ('common')
 *   - Personal context checks with spaces and dots stripped ('personal'):
 *       'spabahia2026xx' with business 'Spa Bahia'
 *       'amirabenali2026' with email 'amira.benali@test.ma'
 *   - 4-char password reports 'short' (order precedence over 'common')
 *   - /auth/signup endpoint returns { error: 'weak', reason: ... } with 400
 *   - /auth/reset endpoint returns { error: 'weak', reason: ... } with 400
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { passwordProblem, PASSWORD_MAX, makeResetToken, resetVerifierHash } from '../functions/auth/_lib.js';
import { onRequestPost as signup } from '../functions/auth/signup.js';
import { onRequestPost as reset } from '../functions/auth/reset.js';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

console.log('\n■ Password Policy Validator Tests (functions/auth/_lib.js)');

// 1. Length checks
check('9 characters rejected with "short"', passwordProblem('123456789') === 'short');
check('10 characters accepted', passwordProblem('abcdefghij') === null);
check('Passphrase with spaces accepted', passwordProblem('mon cafe a casablanca') === null);
check('Oversized password rejected with "long"', passwordProblem('a'.repeat(PASSWORD_MAX + 1)) === 'long');

// 2. Blocklist & Pattern checks ('common') with de-suffixing
check('Blocklist entry "motdepasse" rejected with "common"', passwordProblem('motdepasse') === 'common');
check('Blocklist entry "casablanca" rejected with "common"', passwordProblem('casablanca') === 'common');
check('Blocklist entry "1234567890" rejected with "common"', passwordProblem('1234567890') === 'common');
check('Blocklist + digits "password1234" rejected with "common"', passwordProblem('password1234') === 'common');
check('Blocklist + year "casablanca2024" rejected with "common"', passwordProblem('casablanca2024') === 'common');
check('Blocklist + year "marrakech2026" rejected with "common"', passwordProblem('marrakech2026') === 'common');
check('Blocklist + year "motdepasse2026" rejected with "common"', passwordProblem('motdepasse2026') === 'common');
check('Blocklist + digits "azerty123456" rejected with "common"', passwordProblem('azerty123456') === 'common');
check('Blocklist + suffix "Password1!" rejected with "common"', passwordProblem('Password1!') === 'common');
check('Digit-only password rejected with "common"', passwordProblem('9876543210123') === 'common');
check('Single repeated character rejected with "common"', passwordProblem('aaaaaaaaaaaa') === 'common');

// 3. Personal context checks ('personal') with squashing (spaces/dots stripped)
const ctxSignup = { email: 'karim.atlas@kiwi.ma', business: 'Café Atlas' };
check('Password containing email local part rejected with "personal"',
  passwordProblem('my-karim.atlas-pass', ctxSignup) === 'personal');
check('Password containing business name rejected with "personal"',
  passwordProblem('secret-café atlas', ctxSignup) === 'personal');
check('Password containing squashed business "spabahia2026xx" rejected with "personal"',
  passwordProblem('spabahia2026xx', { business: 'Spa Bahia' }) === 'personal');
check('Password containing squashed email "amirabenali2026" rejected with "personal"',
  passwordProblem('amirabenali2026', { email: 'amira.benali@test.ma' }) === 'personal');
check('Password with unrelated personal info accepted',
  passwordProblem('unrelated-passphrase-secure', ctxSignup) === null);

// 4. Over-blocking regression guards (valid passphrases accepted)
check('Passphrase "mon cafe a casablanca" accepted', passwordProblem('mon cafe a casablanca') === null);
check('Passphrase "le pressing du marshan" accepted', passwordProblem('le pressing du marshan') === null);
check('Passphrase "2026 fut une bonne annee" accepted', passwordProblem('2026 fut une bonne annee') === null);
check('Mixed string "AtlasSecret1!" accepted (proves NO composition rules)', passwordProblem('AtlasSecret1!') === null);

// 5. Order precedence: 4-character password reports "short", NOT "common"
check('4-character "1234" reports "short" (length check precedes blocklist)',
  passwordProblem('1234') === 'short');
check('4-character "kiwi" reports "short" (length check precedes blocklist)',
  passwordProblem('kiwi') === 'short');

// 6. Endpoint Integration: /auth/signup
console.log('\n■ Endpoint Integration Tests (/auth/signup and /auth/reset)');

const db = new DatabaseSync(':memory:');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaRaw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
for (const stmt of schemaRaw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
  db.exec(stmt);
}
const env = {
  DB: {
    prepare(q) {
      let args = [];
      const st = {
        bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
        first() { const r = db.prepare(q).get(...args); return r === undefined ? null : r; },
        all() { return { results: db.prepare(q).all(...args) }; },
        run() {
          const r = db.prepare(q).run(...args);
          return { success: true, meta: { changes: r.changes } };
        },
      };
      return st;
    },
  },
  AUTH_SECRET: 'password-policy-secret',
};

const postSignup = (body) => new Request('https://kiwi.test/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const signupWeakRes = await signup({
  request: postSignup({ email: 'owner@test.ma', name: 'Owner', business: 'Boutique', password: 'short' }),
  env,
  waitUntil() {},
});
const signupWeakData = await signupWeakRes.json();
check('Signup returns 400 with { error: "weak", reason: "short" }',
  signupWeakRes.status === 400 && signupWeakData.error === 'weak' && signupWeakData.reason === 'short');

const signupCommonRes = await signup({
  request: postSignup({ email: 'owner2@test.ma', name: 'Owner', business: 'Boutique', password: 'motdepasse' }),
  env,
  waitUntil() {},
});
const signupCommonData = await signupCommonRes.json();
check('Signup returns 400 with { error: "weak", reason: "common" } for blocklisted password',
  signupCommonRes.status === 400 && signupCommonData.error === 'weak' && signupCommonData.reason === 'common');

// 7. Endpoint Integration: /auth/reset
const { selector, verifier, token } = makeResetToken();
const verifierHmac = await resetVerifierHash(env.AUTH_SECRET, verifier);
db.prepare(`INSERT INTO reset_tokens (selector, account_id, verifier, expires_ts, created_ts)
            VALUES (?, 'acc-1', ?, ?, ?)`).run(selector, verifierHmac, Date.now() + 3600000, Date.now());
db.prepare(`INSERT INTO accounts (id, email, name, business, salt, hash, created_ts)
            VALUES ('acc-1', 'reset-user@test.ma', 'User', 'Spa Bahia', '00', '00', ?)`).run(Date.now());

const postReset = (body) => new Request('https://kiwi.test/auth/reset', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const resetWeakRes = await reset({
  request: postReset({ token, password: 'short' }),
  env,
});
const resetWeakData = await resetWeakRes.json();
check('Reset returns 400 with { error: "weak", reason: "short" }',
  resetWeakRes.status === 400 && resetWeakData.error === 'weak' && resetWeakData.reason === 'short');

const resetPersonalRes = await reset({
  request: postReset({ token, password: 'spabahia2026xx' }),
  env,
});
const resetPersonalData = await resetPersonalRes.json();
check('Reset returns 400 with { error: "weak", reason: "personal" } when password contains account email or business',
  resetPersonalRes.status === 400 && resetPersonalData.error === 'weak' && resetPersonalData.reason === 'personal');

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All password policy checks green.\n`);
process.exitCode = failures ? 1 : 0;
