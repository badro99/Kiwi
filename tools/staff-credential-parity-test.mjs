import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { fixture } from './server-money-fixture.mjs';
import { canonicalCode, normalizeMember } from '../functions/api/_rules-staff-credential.js';
import { findEmployeeCredential } from '../functions/auth/_lib.js';
import { onRequestPost } from '../functions/api/store.js';
import { publishStaffCredentials } from '../functions/api/_staff-publication.js';

const ui = createRequire(import.meta.url)('./team-owners-test-source.cjs').originalFile('assets/team/profile-ui.js');
const generated = ui.match(/var KiwiStaffCredential = [\s\S]*?\}\)\(\);/)[0];
const browser = vm.runInNewContext(generated + '; KiwiStaffCredential');
// Obviously fake fixtures. Numeric values needed by the actual route are derived,
// never logged, and assertion failures expose only booleans.
const pin = String(10000 - 1), legacy = String(10000 - 2);
const member = { id: 'fake-member', email: 'fake@example.test', firstName: 'Fake', lastName: 'Fixture', function: 'cashier', pinCode: pin, password: legacy };
for (const m of [member, { password: 'FAKE_LEGACY' }, { pinCode: '', password: 'FAKE_FALLBACK' }, { pinCode: ' FAKE_CANONICAL ', password: 'FAKE_OLD' }, null]) {
  assert.ok(browser.canonicalCode(m) === canonicalCode(m), 'browser/server credential parity');
  assert.ok(JSON.stringify(browser.normalizeMember(m)) === JSON.stringify(normalizeMember(m)), 'browser/server normalization parity');
}
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
fc.assert(fc.property(fc.record({ pinCode: fc.string(), password: fc.string() }), m => browser.canonicalCode(m) === canonicalCode(m) && JSON.stringify(browser.normalizeMember(m)) === JSON.stringify(normalizeMember(m))), { numRuns: 100 });
const prefill = ui.match(/name="password" value="\$\{esc\((.*?)\)\}"/)[1];
assert.ok(vm.runInNewContext(prefill, { m: member, isCode: v => /^\d{4}$/.test(v), KiwiStaffCredential: browser }) === pin, 'editor prefill preserves canonical value');
const start = ui.indexOf('    const savedCode =');
const save = ui.slice(start < 0 ? ui.indexOf('    const member = {', ui.indexOf('const effectiveCode')) : start, ui.indexOf('\n    if (st.editing)', ui.indexOf('const effectiveCode')));
for (const entered of ['', pin]) {
  const saved = vm.runInNewContext(save + '\nmember', { code: entered, prev: member, data: { firstName: 'Fake', lastName: 'Fixture', function: 'cashier' }, st: { memberId: member.id, languages: [], avatarTone: 'fake', origCreatedAt: 1 }, venueType: 'fake', teamSlug: () => 'fake-shop', makeCode: () => 'FAKE_GENERATED', memberCode: canonicalCode, KiwiStaffCredential: browser });
  assert.ok(saved.pinCode === pin && saved.password === pin, 'editor save keeps canonical credential in both fields');
}
const f = await fixture(new URL('..', import.meta.url).pathname);
const { sql, env, merchant } = f;
try {
  sql.prepare("INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,'team',?,1,1)").run(merchant, JSON.stringify({ members: [member] }));
  assert.ok(!!await findEmployeeCredential(env, member.email, pin), 'divergent document verifies canonical value');
  assert.ok(!await findEmployeeCredential(env, member.email, legacy), 'divergent document rejects legacy value');
  const response = await onRequestPost({ env, request: new Request('https://kiwi.test/api/store', { method: 'POST', headers: { Cookie: SESS_COOKIE + '=' + await makeSession('money-owner', env.AUTH_SECRET), 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, feature: 'team', baseRev: 1, data: { members: [member], hours: {}, shifts: {} } }) }) });
  assert.ok(response.status === 200, 'team publication succeeds');
  const check = feature => { const doc = JSON.parse(sql.prepare('SELECT data FROM store_docs WHERE merchant=? AND feature=?').get(merchant, feature).data); assert.ok(doc.members.length === 1 && doc.members[0].pinCode === pin && doc.members[0].password === pin, 'publication stores equal canonical fields'); };
  check('team'); check('employee-access');
  sql.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='employee-access'").run(JSON.stringify({ members: [member] }), merchant);
  const published = await publishStaffCredentials(env, merchant, { pins: [{ code: pin, memberId: member.id, email: member.email, role: 'cashier' }] });
  assert.ok(!(published instanceof Response), 'staff publication succeeds'); check('employee-access');
  assert.ok(sql.prepare('SELECT 1 FROM staff_pins WHERE merchant=? AND pin=?').get(merchant, pin) !== undefined, 'till publication matches canonical credential');
  console.log('✓ staff credential: verifier, editor, publications and browser/server parity');
} finally { f.close(); }
