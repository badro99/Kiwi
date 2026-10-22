#!/usr/bin/env node
/* team-roster-cap-test · a team larger than twenty keeps every member's access.
 *
 * POST /api/config replaces the store's till codes (staff_pins) and the
 * employee-app login roster (store_docs 'employee-access') from the list the
 * Team page publishes. Since July it stopped reading that list at twenty
 * entries, silently: the 21st member and every one after kept their place in
 * the Team page but lost their till code and their employee-app login at the
 * next save, and the route still answered ok. Nothing on the Team page caps a
 * roster at twenty.
 *
 * Real route on the SQLite D1 fixture. The codes are generated test values
 * ('2001', '2002', ...), never a merchant's. Nothing here prints a code. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import * as config from '../functions/api/config.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = await fixture(ROOT);
const { sql, merchant } = f;
let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const cookie = SESS_COOKIE + '=' + await makeSession('money-owner', f.env.AUTH_SECRET);

const roster = (n) => Array.from({ length: n }, (_, i) => ({
  memberId: 'member-' + (i + 1), code: String(2001 + i), name: 'Membre ' + (i + 1),
  firstName: 'Membre', lastName: String(i + 1), email: `membre${i + 1}@example.test`, role: 'cashier',
}));
async function publish(pins) {
  const res = await config.onRequestPost({ env: f.env, request: new Request('https://kiwi.test/api/config', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, pins }),
  }) });
  return { status: res.status, body: await res.json() };
}
const tillCodes = () => Number(sql.prepare('SELECT COUNT(*) n FROM staff_pins WHERE merchant = ?').get(merchant).n);
const logins = () => {
  const row = sql.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'").get(merchant);
  return row ? JSON.parse(row.data).members.length : 0;
};

console.log('team-roster-cap-test');
try {
  for (const n of [1, 20, 21, 25, 60]) {
    const r = await publish(roster(n));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    ok(tillCodes() === n && logins() === n, `a team of ${n} keeps ${n} till codes and ${n} employee logins`);
  }
  const before = [tillCodes(), logins()];
  const tooMany = await publish(roster(201));
  ok(tooMany.status === 413 && tooMany.body.error === 'too-many-members',
    'past the bound (200) the save is refused out loud, not cut short');
  ok(tillCodes() === before[0] && logins() === before[1], 'and a refused save leaves the previous roster whole');
  console.log(`✓ team-roster-cap-test · ${checks} checks`);
} finally { f.close(); }
