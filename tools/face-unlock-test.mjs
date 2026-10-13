#!/usr/bin/env node
/* Face ID on the native owner lock: the server decides whether a device's record
 * still stands. Runs the real route functions/api/pin/face.js against SQLite.
 *
 *   node tools/face-unlock-test.mjs
 *
 * What this holds (CLAUDE.md §6: no code leaves the server, none is compared in
 * the browser):
 *   1 · the mark is issued only by faceMarkState, which POST /api/pin/verify calls
 *       for a code it has just proven, at that code's tier; it is bound to the
 *       tier (a manager's mark is never the owner's) and carries no code; the
 *       face route itself never issues one;
 *   2 · a confirmation with the same mark answers { ok, access } and nothing else;
 *   3 · a changed, added, removed or re-roled owner or manager code changes the
 *       mark, and the old mark is refused with 403; a cashier's code is not part
 *       of it, so changing one leaves Face ID alone;
 *   4 · a tier the account no longer has (no code opens the dashboard at it) is
 *       refused, and a request without a mark is rejected;
 *   5 · the mark is scoped to its account: another account's list never confirms;
 *   6 · no session, a forged session, or a suspended account answers 401;
 *   7 · the native app's client (app/src/native-runtime.js) reads the mark, sends
 *       no code, drops the record on a refusal and on an expired offline record,
 *       and uses the same seven-day TTL as the dashboard vault.
 * The on-device half (taps, offline window, the revocation event) is in
 * tools/native-face-entry-test.mjs.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost as facePost } from '../functions/api/pin/face.js';
import { makeSession, sessionCookie, faceMarkState } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0, passes = 0;
function check(desc, cond) {
  if (cond) { passes++; console.log('  ✓ ' + desc); }
  else { failures++; console.log('  ✗ ' + desc); }
}

const AUTH_SECRET = 'face-test-secret-32-chars-long!!';
const SECRET_CODES = ['2468', '1357', '9876', '4242', '0808', '5151'];
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT,
    created_ts INTEGER, status TEXT NOT NULL DEFAULT 'active',
    session_epoch INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE staff_pins (
    id TEXT PRIMARY KEY, merchant TEXT NOT NULL, pin TEXT NOT NULL, name TEXT,
    role TEXT NOT NULL, created_ts INTEGER NOT NULL
  );
  CREATE TABLE merchant_config (
    merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT,
    account_id TEXT, name TEXT, status TEXT, updated_ts INTEGER,
    till_epoch INTEGER NOT NULL DEFAULT 0
  );
`);
const now = Date.now();
sqlite.exec(`
  INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch)
  VALUES ('acc-1', 'owner@cafe.test', 'Café Atlas', 's', 'h', ${now}, 'active', 0),
         ('acc-2', 'owner@shop.test', 'Shop Two', 's', 'h', ${now}, 'active', 0),
         ('acc-3', 'owner@cash.test', 'Cash Only', 's', 'h', ${now}, 'active', 0);
  INSERT INTO merchant_config (merchant, features, account_id, name, updated_ts)
  VALUES ('cafe-atlas', '{}', 'acc-1', 'Café Atlas', ${now}),
         ('atlas-medina', '{}', 'acc-1', 'Atlas Médina', ${now}),
         ('shop-two', '{}', 'acc-2', 'Shop Two', ${now}),
         ('cash-only', '{}', 'acc-3', 'Cash Only', ${now});
  INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES
    ('p-owner', 'cafe-atlas', '2468', 'Rachid', 'Proprietaire', ${now}),
    ('p-manager', 'atlas-medina', '1357', 'Ali', 'Gerant', ${now}),
    ('p-cashier', 'cafe-atlas', '9876', 'Samira', 'Caissier', ${now}),
    ('p-two', 'shop-two', '4242', 'Owner Two', 'owner', ${now}),
    ('p-cash-a', 'cash-only', '0808', 'Cashier A', 'Caissier', ${now}),
    ('p-cash-b', 'cash-only', '5151', 'Cashier B', 'staff', ${now});
`);

// Wrap SQLite to look like the Cloudflare D1 binding the route uses.
const env = {
  AUTH_SECRET,
  DB: {
    prepare(query) {
      const stmt = sqlite.prepare(query);
      return {
        bind(...params) {
          return {
            async first() { return stmt.get(...params) ?? null; },
            async all() { return { results: stmt.all(...params) }; },
            async run() { const r = stmt.run(...params); return { meta: { changes: r.changes }, success: true }; },
          };
        },
      };
    },
  },
};

const sess = {
  acc1: sessionCookie(await makeSession('acc-1', AUTH_SECRET)),
  acc2: sessionCookie(await makeSession('acc-2', AUTH_SECRET)),
  acc3: sessionCookie(await makeSession('acc-3', AUTH_SECRET)),
  forged: sessionCookie(await makeSession('acc-1', 'not-the-secret-not-the-secret!!')),
};

async function post(body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const req = new Request('https://kiwi.test/api/pin/face', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res = await facePost({ request: req, env });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { status: res.status, data, text };
}
/* What /api/pin/verify does after proving a code (functions/api/pin/verify.js). */
async function issue(access, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  return faceMarkState(new Request('https://kiwi.test/api/pin/verify', { method: 'POST', headers }), env, access);
}
const leaksCode = (text) => SECRET_CODES.some((c) => text.includes(c));
const setPin = (id, pin) => sqlite.prepare('UPDATE staff_pins SET pin = ? WHERE id = ?').run(pin, id);
const setRole = (id, role) => sqlite.prepare('UPDATE staff_pins SET role = ? WHERE id = ?').run(role, id);
const removePin = (id) => sqlite.prepare('DELETE FROM staff_pins WHERE id = ?').run(id);

console.log('\n1 · Issuing the mark (only next to a proven code, bound to its tier)');
let ownerMark = '', managerMark = '';
{
  const o = await issue('owner', sess.acc1);
  ownerMark = o.mark;
  check('the owner tier gets a mark', o.status === 'ok');
  check('the mark is 64 hex characters', typeof ownerMark === 'string' && /^[0-9a-f]{64}$/.test(ownerMark));
  check('the mark carries no code', !leaksCode(JSON.stringify(o)));
  const m = await issue('manager', sess.acc1);
  managerMark = m.mark;
  check('the manager tier gets its own mark, never the owner\'s', m.status === 'ok' && managerMark && managerMark !== ownerMark);
  const none = await issue('owner');
  check('no session, no mark', none.status === 'unauthorized' && !none.mark);
  const self = await post({ access: 'owner' }, sess.acc1);
  check('the face route never issues a mark (a session alone cannot enrol)', self.status === 400 && !(self.data && self.data.mark));
  const verifySrc = read('functions/api/pin/verify.js');
  check('POST /api/pin/verify issues the mark only for an account-wide proven code, at its tier',
    /if \(!merchant\) \{\s*const tier = faceAccessTier\(verified\.staff\.role\);/.test(verifySrc)
    && /faceMarkState\(request, env, tier\)/.test(verifySrc)
    && verifySrc.indexOf('faceMarkState(') > verifySrc.indexOf('if (!verified.ok)'));
}

console.log('\n2 · Confirmation with the mark');
{
  const r = await post({ access: 'owner', mark: ownerMark }, sess.acc1);
  check('the same mark confirms with 200', r.status === 200 && r.data.ok === true && r.data.access === 'owner');
  check('confirmation answers exactly { ok, access }', JSON.stringify(Object.keys(r.data).sort()) === '["access","ok"]');
  check('confirmation carries no code and no mark', !leaksCode(r.text) && !('mark' in r.data));
}

console.log('\n3 · A dashboard code change drops the old mark; a cashier code does not');
{
  setPin('p-cashier', '0505');
  const r = await post({ access: 'owner', mark: ownerMark }, sess.acc1);
  check('a changed cashier code leaves the owner record standing', r.status === 200 && r.data.ok === true);
  setPin('p-cashier', '9876');
}
{
  setPin('p-owner', '1212');
  const r = await post({ access: 'owner', mark: ownerMark }, sess.acc1);
  check('a changed owner code is refused', r.status === 403 && r.data.ok === false);
  check('the refusal carries no code', !leaksCode(r.text) && !r.text.includes('1212'));
  const fresh = await issue('owner', sess.acc1);
  check('the new list has a new mark', fresh.mark && fresh.mark !== ownerMark);
  setPin('p-owner', '2468');
  const back = await post({ access: 'owner', mark: fresh.mark }, sess.acc1);
  check('a mark from a changed list does not confirm once the list is back', back.status === 403);
  const restored = await issue('owner', sess.acc1);
  check('the list as it was gives the original mark back', restored.mark === ownerMark);
}
{
  setPin('p-manager', '1111');
  const r = await post({ access: 'owner', mark: ownerMark }, sess.acc1);
  check('a changed manager code refuses the owner record too (one dashboard list per account)', r.status === 403);
  setPin('p-manager', '1357');
}
{
  setRole('p-cashier', 'Manager');
  const r = await post({ access: 'owner', mark: ownerMark }, sess.acc1);
  check('a cashier promoted to manager refuses the old mark', r.status === 403);
  setRole('p-cashier', 'Caissier');
}
{
  removePin('p-manager');
  const r = await post({ access: 'owner', mark: ownerMark }, sess.acc1);
  check('a removed manager code refuses the old mark', r.status === 403);
  sqlite.prepare("INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES ('p-manager','atlas-medina','1357','Ali','Gerant',?)").run(now);
  const again = await post({ access: 'owner', mark: ownerMark }, sess.acc1);
  check('the same list again confirms', again.status === 200);
}
{
  const r = await post({ access: 'owner', mark: 'a'.repeat(64) }, sess.acc1);
  check('a made-up mark is refused', r.status === 403 && r.data.ok === false);
  const swap = await post({ access: 'owner', mark: managerMark }, sess.acc1);
  check('a manager\'s mark never confirms the owner tier', swap.status === 403);
  const mOk = await post({ access: 'manager', mark: managerMark }, sess.acc1);
  check('the manager\'s mark confirms the manager tier', mOk.status === 200 && mOk.data.access === 'manager');
}

console.log('\n4 · Tiers the account no longer has');
{
  const r = await issue('manager', sess.acc2);
  check('an account with no manager code gets no manager mark', r.status === 'no-such-access' && !r.mark);
  const c = await issue('owner', sess.acc3);
  check('an account with only cashier codes has no owner tier', c.status === 'no-such-access' && !c.mark);
  const cf = await post({ access: 'owner', mark: ownerMark }, sess.acc3);
  check('so a confirmation there is refused', cf.status === 403);
  const bad = await post({ access: 'staff', mark: ownerMark }, sess.acc1);
  check('the staff tier is never a Face ID tier', bad.status === 400);
  const missing = await post({ access: 'owner' }, sess.acc1);
  check('a request without a mark is rejected', missing.status === 400);
  const junk = await post('not json', sess.acc1);
  check('a malformed body is rejected', junk.status === 400);
}

console.log('\n5 · Scoped to the account');
{
  const two = await issue('owner', sess.acc2);
  check('account two has its own mark', two.status === 'ok' && two.mark && two.mark !== ownerMark);
  const cross = await post({ access: 'owner', mark: ownerMark }, sess.acc2);
  check('account one\'s mark never confirms account two', cross.status === 403);
  const cross2 = await post({ access: 'owner', mark: two.mark }, sess.acc1);
  check('account two\'s mark never confirms account one', cross2.status === 403);
}

console.log('\n6 · Sessions');
{
  const none = await post({ access: 'owner', mark: ownerMark });
  check('no session answers 401', none.status === 401 && none.data.ok === false);
  const forged = await post({ access: 'owner', mark: ownerMark }, sess.forged);
  check('a forged session answers 401', forged.status === 401);
  sqlite.prepare("UPDATE accounts SET status = 'suspended' WHERE id = 'acc-2'").run();
  const susp = await post({ access: 'owner', mark: ownerMark }, sess.acc2);
  check('a suspended account answers 401', susp.status === 401);
  sqlite.prepare("UPDATE accounts SET status = 'active' WHERE id = 'acc-2'").run();
}

console.log('\n7 · The native client (app/src/native-runtime.js) and the dashboard vault');
{
  const rt = read('app/src/native-runtime.js');
  const dash = read('dashboard.html');
  const vault = read('assets/dashboard-pin-vault.js');
  const vaultTtl = /var TTL = 7 \* 24 \* 60 \* 60 \* 1000;/.test(vault);
  const faceTtl = /FACE_TTL = 7 \* 24 \* 60 \* 60 \* 1000/.test(rt);
  check('the Face ID TTL is the dashboard vault TTL (seven days)', vaultTtl && faceTtl);
  check('the client confirms with POST /api/pin/face', /FACE_CONFIRM_PATH = '\/api\/pin\/face'/.test(rt) && /fetch\(FACE_CONFIRM_PATH, \{\s*method: 'POST'/.test(rt));
  const askBody = (rt.match(/function askFace\(body\)[\s\S]*?\n  \}\n/) || [''])[0];
  check('the request carries an access tier and a mark, never a code', askBody.includes('JSON.stringify(body)') && !/\bpin\b|\bcode\b/.test(askBody.replace(/\/\/.*$/gm, '')));
  check('a 401 or 403 is a refusal, anything unreachable is not', /r\.status === 401 \|\| r\.status === 403\) return 'no'/.test(askBody) && /if \(!r\.ok\) return null;/.test(askBody));
  check('an unmarked record is inert (predates the server check)', /typeof r\.mark === 'string' && r\.mark \? r : null/.test(rt));
  const tryFaceSrc = (rt.match(/function tryFace\(\) \{[\s\S]*?\n    \}\n/) || [''])[0];
  check('tryFace asks the server before it unlocks', /confirmFace\(record\)/.test(tryFaceSrc) && tryFaceSrc.indexOf('confirmFace(record)') < tryFaceSrc.indexOf('unlockAs('));
  check('a refusal or an expired record drops the record, never unlocks', /c\.state === 'refused' \|\| c\.state === 'expired'\) \{ dropFace\(\); return; \}/.test(tryFaceSrc));
  check('the offline window counts from the last online proof', /age <= FACE_TTL \? \{ state: 'offline' \}/.test(rt) && /at: Date\.now\(\), mark: record\.mark/.test(rt));
  check('the native app listens for the dashboard vault revocation', /addEventListener\('kiwi:dashboard-code-revoked', dropFace\)/.test(rt));
  check('enrolment writes only the mark that came with the proven code', /if \(typeof who\.faceMark !== 'string' \|\| !who\.faceMark\) return false;/.test(rt) && /mark: who\.faceMark/.test(rt) && !/enrolFace/.test(rt));
  check('Face ID is offered only for a code proven online at owner or manager tier', /if \(typeof who\.faceMark !== 'string' \|\| !who\.faceMark \|\| \(who\.access !== 'owner' && who\.access !== 'manager'\)\) return;/.test(rt));
  check('the dashboard passes the server\'s mark with the unlock, never a code', /faceMark: typeof d\.faceMark === 'string' \? d\.faceMark : ''/.test(dash) && /detail: \{ access: role, name: hit\.name \|\| '', faceMark: hit\.faceMark \|\| '' \}/.test(dash));
  check('the dashboard announces a revocation only when the vault forgot a proven code', /Promise\.resolve\(v\.forget\(code\)\)\.then\(\(dropped\) => \{\s*if \(dropped\) window\.dispatchEvent\(new CustomEvent\('kiwi:dashboard-code-revoked'\)\);/.test(dash));
  const idleSrc = (rt.match(/function maybePromptBiometricUnlock\(\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  check('the idle relock opens the dashboard only after the server confirms the stored record', /__kiwiLock\.reveal[\s\S]{0,200}/.test(idleSrc) && /return confirmStoredFace\(\)\.then\(function \(c\) \{\s*if \(c\.state !== 'ok' && c\.state !== 'offline'\) return false;\s*window\.__kiwiLock\.reveal\(\);/.test(idleSrc) && /__kiwiUnlockApp\(\);/.test(idleSrc));
  check('the offer sheet puts no code in the stored record', !/code: |pin: /.test(rt.slice(rt.indexOf('function offerFaceUnlock'), rt.indexOf('function offerFaceUnlock') + 1600)));
}

console.log(`\nface-unlock: ${passes} checks passed${failures ? `, ${failures} failed` : ''}`);
if (failures) process.exit(1);
