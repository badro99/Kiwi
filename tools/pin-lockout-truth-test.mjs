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
import vm from 'node:vm';
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

console.log('dashboard lock · run');
/* Run the shipped askServer against a server that answers each way. */
async function asked(reply, { online = true } = {}) {
  const ctx = {
    navigator: { onLine: online }, ASK_TIMEOUT_MS: 1000, AbortController, setTimeout, clearTimeout, JSON, Number, Math, String, Promise,
    accessTier: (role) => (role === 'cashier' ? 'staff' : 'owner'),
    fetch: async () => { if (reply === 'network') throw new TypeError('Failed to fetch');
      const body = reply.body;
      return { status: reply.status, ok: reply.status >= 200 && reply.status < 300,
        headers: { get: (k) => (reply.headers || {})[k.toLowerCase()] || null },
        json: async () => { if (typeof body === 'string') throw new SyntaxError('html'); return body; } }; },
  };
  vm.createContext(ctx);
  const at = dash.indexOf('  function askServer(code) {');
  const end = dash.indexOf('.catch(() => { clearTimeout(timer); return null; });\n  }', at);
  assert.ok(at > 0 && end > at, 'askServer found whole');
  vm.runInContext(dash.slice(at, end) + '.catch(() => { clearTimeout(timer); return null; });\n  }\nthis.ask = askServer;', ctx);
  return ctx.ask('fixture');
}
for (const [label, reply, want] of [
  ['429 with retry_after → busy seconds', { status: 429, body: { error: 'too_many_attempts', retry_after: 120 } }, { busy: 120 }],
  ['429 with only a Retry-After header → busy seconds', { status: 429, body: 'x', headers: { 'retry-after': '90' } }, { busy: 90 }],
  ['401 bad-pin → no', { status: 401, body: { error: 'bad-pin' } }, 'no'],
  ['401 with the sign-in page → signed-out, not « wrong code »', { status: 401, body: '<html>' }, 'signed-out'],
  ['500 → unknown (null), never a refusal', { status: 500, body: {} }, null],
  ['network failure → unknown (null)', 'network', null],
  ['a cashier code does not open the dashboard', { status: 200, body: { ok: true, staff: { id: 's1', name: 'C', role: 'cashier' } } }, 'no'],
]) {
  await (async () => { try { const got = await asked(reply); assert.deepEqual(JSON.parse(JSON.stringify(got)), want); passed++; console.log('  ✓ run: ' + label); }
    catch (e) { failed++; console.log('  ✗ run: ' + label + '\n      ' + String(e.message).split('\n')[0]); } })();
}
await (async () => { try { assert.equal(await asked({ status: 429, body: {} }, { online: false }), null); passed++; console.log('  ✓ run: offline device does not call the server'); }
  catch (e) { failed++; console.log('  ✗ run: offline device does not call the server'); } })();

console.log(`\npin-lockout-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
