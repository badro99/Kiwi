#!/usr/bin/env node
/* Locks · a lockout says « wait », never « offline » or « wrong code ».
 *
 * 2026-10-12. After a few attempts POST /api/pin/verify answers 429 with
 * { retry_after }. The dashboard lock folded every non-2xx into « on ne sait
 * pas » and told an operator on working Wi-Fi « Connexion requise pour
 * vérifier le code · appareil hors ligne ». The till pad said « Code incorrect
 * ou impossible à vérifier » to someone typing the right code. A server error
 * read « hors ligne » too.
 *   node tools/pin-lockout-truth-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dash = readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
const pad = readFileSync(path.join(ROOT, 'assets/caisse-pairing.js'), 'utf8');
const lib = readFileSync(path.join(ROOT, 'functions/auth/_lib.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const between = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? '' : s.slice(i, s.indexOf(b, i + a.length)); };
const ask = between(dash, '  function askServer(code) {', '\n  }\n');
/* Le chemin complet de la porte : la décision (settle) puis la réponse du serveur. */
const caller = between(dash, '      const askable = ', '\n  }\n\n  /* La porte s\'ouvre');

console.log('server · what a lockout looks like');
ok('the limiter answers 429 with retry_after (the contract both locks read)', () => {
  assert.match(lib, /return json\(\{ error: 'too_many_attempts', retry_after: Math\.ceil\(\(a\.blocked_until - now\) \/ 1000\) \}, 429\);/);
});

console.log('dashboard lock');
ok('a 429 becomes { busy: seconds }, not the « unknown » null', () => {
  assert.match(ask, /if \(r\.status === 429\) \{\n\s+return r\.json\(\)\.catch\(\(\) => \(\{\}\)\)\.then\(\(d\) => \(\{ busy: Math\.max\(0, Number\(d && d\.retry_after\) \|\| Number\(r\.headers\.get\('Retry-After'\)\) \|\| 0\) \}\)\);/);
  assert.ok(ask.indexOf('r.status === 429') < ask.indexOf('if (!r.ok) return null;'), '429 is read before the generic failure');
});
ok('a busy reply is handled before anything can read it as an identity', () => {
  assert.ok(caller, 'caller found');
  const busyAt = caller.indexOf('if (answer && answer.busy != null) {');
  const unlockAt = caller.indexOf("if (answer && answer !== 'no') { finishUnlock(val, answer, true); return; }");
  assert.ok(busyAt > 0 && unlockAt > busyAt, 'busy check precedes the unlock');
  assert.match(caller, /if \(!demosOn\(\) \|\| isConfiguredAccount\(\)\) \{ rejectPin\('busy', answer\.busy\); return; \}/);
});
ok('« appareil hors ligne » only when the browser is offline; otherwise « Kiwi ne répond pas »', () => {
  assert.match(caller, /rejectPin\(navigator\.onLine === false \? 'offline' : 'unreachable'\)/);
  assert.match(dash, /fr: "Kiwi ne répond pas, le code n'a pas pu être vérifié\. Réessayez dans un instant\.",/);
});
ok('the wait is said in minutes, in FR, EN and AR', () => {
  assert.match(dash, /const mins = wait > 0 \? Math\.max\(1, Math\.ceil\(wait \/ 60\)\) : 0;/);
  assert.match(dash, /fr: `Trop d'essais\. Réessayez dans \$\{mins\} min\.`,/);
  assert.match(dash, /en: `Too many attempts\. Try again in \$\{mins\} min\.`,/);
  assert.match(dash, /ar: `محاولات كثيرة\. أعد المحاولة بعد \$\{mins\} دقيقة\.`,/);
});

console.log('till PIN pad');
ok('the pad remembers a 429 and its wait, and says so instead of « Code incorrect »', () => {
  assert.match(pad, /if \(r && r\.status === 429\) \{\n\s+lastVerify\.status = 429;/);
  assert.match(pad, /lastVerify = \{ status: 0, wait: 0, offline: false \};\n\s+return fetch\('\/api\/pin\/verify'/);
  const refuseAt = pad.indexOf('if (lastVerify.status === 429) {');
  const wrongAt = pad.indexOf("'Code incorrect ou impossible à vérifier.'");
  assert.ok(refuseAt > 0 && wrongAt > refuseAt, 'lockout message comes first');
  assert.match(pad, /refuse\(mins \? 'Trop d’essais\. Réessayez dans ' \+ mins \+ ' min\.' : 'Trop d’essais\. Réessayez dans quelques minutes\.'\);/);
});
ok('a lockout never counts as an approval (manager codes still fail closed)', () => {
  // the 429 branch resolves to null, which every caller of verifyCode treats as « no »
  assert.match(pad, /lastVerify\.wait = Math\.max\(0, Number\(d && d\.retry_after\) \|\| Number\(r\.headers\.get\('Retry-After'\)\) \|\| 0\);\n\s+return null;/);
});

console.log(`\npin-lockout-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
