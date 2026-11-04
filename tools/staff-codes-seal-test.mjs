import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { publishStaffCredentials } from '../functions/api/_staff-publication.js';
import { onRequestPost as add } from '../functions/api/admin/pins.js';
// Optional imports let the untouched-base run reach the storage assertion.
const { onRequestPost: seal } = await import('../functions/api/admin/codes/seal.js').catch(() => ({}));
import { onRequestPost as save, onRequestGet as get } from '../functions/api/store.js';
import { onRequestPost as login, onRequestGet as employeeGet } from '../functions/api/employee.js';
const { hashStaffCode, codeDocument } = await import('../functions/auth/_staff-codes.js').catch(() => ({}));
import { verifyStaffPin, verifyAccountPin, findEmployeeCredential, makeSession, sessionCookie, tillToken, employeeToken, employeeCookie, operatorToken, operatorIdToken, faceMarkState } from '../functions/auth/_lib.js';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('schema.sql', 'utf8'));
const env = { AUTH_SECRET: 'fixture-staff-seal-auth-material', DB: {
  prepare(sql) {
    const st = db.prepare(sql);
    const bound = (args) => ({ first: async () => st.get(...args) || null, all: async () => ({ results: st.all(...args) }), run: async () => ({ meta: { changes: st.run(...args).changes } }) });
    return { ...bound([]), bind: (...args) => bound(args) };
  },
  async batch(statements) {
    db.exec('BEGIN');
    try { const out = []; for (const st of statements) out.push(await st.run()); db.exec('COMMIT'); return out; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  },
} };
const shop = 'seal-fixture-shop', sibling = 'seal-fixture-sibling';
const code = String(1200 + 34), other = String(2300 + 45), legacy = String(3400 + 56);
db.prepare("INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES ('a','owner@fixture.test',?,'s','h',1)").run(shop);
for (const merchant of [shop, sibling]) db.prepare("INSERT INTO merchant_config (merchant,account_id,plan,features,updated_ts) VALUES (?,'a','pro','{}',1)").run(merchant);
db.exec("INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op','Fixture','s','h',1)");
const owner = sessionCookie(await makeSession('a', env.AUTH_SECRET));
const till = 'kiwi_till=' + await tillToken(env.AUTH_SECRET, shop);
const operator = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET) + '; kiwi_op_id=' + await operatorIdToken(env.AUTH_SECRET, 'op');
const req = (cookie = '', body) => new Request('https://fixture.test/api/test', { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.40' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = (fn, cookie, body) => fn({ request: req(cookie, body), env });
const stored = () => db.prepare('SELECT pin FROM staff_pins').all();
const opaque = () => assert.ok(stored().every((r) => /^k2\$[\w-]{12}\$[\w-]{43}$/.test(r.pin)), 'only keyed hashes persisted');
const published = await publishStaffCredentials(env, shop, { pins: [{ code, name: 'Owner', role: 'owner', memberId: 'm', email: 'member@fixture.test' }] });
assert.equal(published.pins, 1); opaque();
assert.equal((await call(add, operator, { merchant: sibling, pin: other, role: 'cashier', name: 'Cashier' })).status, 200); opaque();
assert.equal((await call(add, operator, { merchant: shop, pin: code, role: 'staff' })).status, 409);
assert.equal((await verifyStaffPin(req(till), env, shop, code)).ok, true);
assert.equal((await verifyStaffPin(req(till), { ...env, AUTH_SECRET: 'wrong-fixture-key' }, shop, code, { requireTill: false })).ok, false);
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('legacy', shop, legacy, 'Legacy', 'manager', 1);
const faceBefore = await faceMarkState(req(owner), env, 'manager');
assert.equal((await verifyStaffPin(req(till), env, shop, legacy)).ok, true); opaque();
assert.deepEqual(await faceMarkState(req(owner), env, 'manager'), faceBefore, 'lazy sealing does not invalidate a new face mark');
assert.equal((await verifyAccountPin(req(owner), env, code)).ok, true);
assert.equal((await verifyStaffPin(req(till), env, shop, other)).ok, false, 'sibling cashier stays local');
db.prepare("UPDATE staff_pins SET role='manager' WHERE merchant=?").run(sibling);
assert.equal((await verifyStaffPin(req(till), env, shop, other)).ok, true, 'sibling manager travels');
// Cross-check the cached RFC 5869 single-block implementation against Web Crypto HKDF.
const utf8 = new TextEncoder();
const material = await crypto.subtle.importKey('raw', utf8.encode(env.AUTH_SECRET), 'HKDF', false, ['deriveKey']);
const referenceKey = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8.encode('kiwi staff pin v1') }, material, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
const referenceHash = 'k1$' + Buffer.from(await crypto.subtle.sign('HMAC', referenceKey, utf8.encode(shop + ':' + code))).toString('base64url');
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('hkdf-old', shop, referenceHash, 'Fixture', 'staff', 1);
assert.equal((await verifyStaffPin(req(till), env, shop, code)).ok, true);
db.prepare("DELETE FROM staff_pins WHERE id='hkdf-old'").run();

assert.notEqual(await hashStaffCode(env, shop, code), await hashStaffCode(env, sibling, code));
assert.notEqual(await hashStaffCode(env, shop, code), await hashStaffCode({ ...env, PIN_PEPPER: 'fixture-pepper' }, shop, code));
const team = { members: [{ id: 'm', firstName: 'Fixture', email: 'member@fixture.test', function: 'owner', pinCode: code, password: code }], hours: {}, shifts: {} };
const write = await call(save, owner, { merchant: shop, feature: 'team', data: team, baseRev: 0 });
assert.equal(write.status, 200, 'owner team write');
function sealedDocs() {
  const rows = db.prepare("SELECT feature,data FROM store_docs WHERE feature IN ('team','employee-access')").all();
  assert.ok(rows.length >= 2);
  for (const row of rows) for (const member of JSON.parse(row.data).members) for (const field of ['pinCode', 'password']) assert.ok(member[field].startsWith('e1$'), 'document credentials encrypted');
}
sealedDocs();
const read = async (cookie) => get({ env, request: new Request(`https://fixture.test/api/store?merchant=${shop}&feature=team`, { headers: { Cookie: cookie } }) });
assert.equal((await (await read(owner)).json()).data.members[0].pinCode, code);
assert.equal((await (await read(operator)).json()).data.members[0].pinCode, code);
const employeeResponse = await call(employeeGet, employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant: shop, staffId: 'm' })));
assert.equal(employeeResponse.status, 200);
assert.ok(!/pinCode|password|e1\$|k1\$/.test(await employeeResponse.text()));
const oldStaffId = db.prepare('SELECT id FROM staff_pins WHERE merchant=? AND pin=?').get(shop, await hashStaffCode(env, shop, code)).id;
const legacyEmployeeResponse = await call(employeeGet, employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant: shop, staffId: oldStaffId })));
assert.equal(legacyEmployeeResponse.status, 200);
assert.equal((await legacyEmployeeResponse.json()).employee.id, 'm', 'pre-canonical session still resolves its member');
for (const cookie of [till, employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant: shop, staffId: 'm' }))]) {
  const res = await read(cookie);
  assert.ok([200, 401, 403].includes(res.status));
  if (res.status === 200) assert.ok(!('pinCode' in (await res.json()).data.members[0]));
}
const redacted = structuredClone(team); delete redacted.members[0].pinCode; delete redacted.members[0].password;
assert.equal((await call(save, owner, { merchant: shop, feature: 'team', data: redacted, baseRev: 1 })).status, 200);
assert.equal((await (await read(owner)).json()).data.members[0].pinCode, code);
sealedDocs();
assert.ok(await findEmployeeCredential(env, 'member@fixture.test', code), 'sealed email and code lookup');
assert.equal((await call(login, '', { action: 'login', email: 'member@fixture.test', pin: code })).status, 200);
const encrypted = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE feature='team'").get().data);
assert.equal((await codeDocument({ AUTH_SECRET: 'wrong-fixture-key' }, shop, 'team', encrypted)).members[0].codeUnreadable, true);
assert.equal((await codeDocument(env, sibling, 'team', encrypted)).members[0].codeUnreadable, true);
const aesReference = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8.encode('kiwi staff code enc v1') }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const [, ivPart, cipherPart] = encrypted.members[0].pinCode.split('$');
const plainReference = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(ivPart, 'base64url'), additionalData: utf8.encode(JSON.stringify([shop, 'team', 'm', 'pinCode'])) }, aesReference, Buffer.from(cipherPart, 'base64url'));
assert.ok(new TextDecoder().decode(plainReference) === code, 'AES derivation equals Web Crypto HKDF');

for (const cookie of ['', owner, till, 'kiwi_op=' + await operatorToken(env.AUTH_SECRET)]) assert.equal((await call(seal, cookie, {})).status, 403);
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('seal-legacy', sibling, legacy, 'Legacy', 'manager', 1);
db.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='team'").run(JSON.stringify(team), shop);
db.prepare("INSERT INTO doc_history (merchant,kind,feature,data,rev,updated_ts,saved_ts) VALUES (?,'store','team',?,1,1,1)").run(shop, JSON.stringify(team));
const first = await (await call(seal, operator, {})).json();
assert.equal(first.ok, true); assert.equal(first.counts.pins, 1); assert.ok(first.counts.documents >= 1); assert.ok(first.counts.history >= 1); opaque(); sealedDocs();
const second = await (await call(seal, operator, {})).json();
assert.deepEqual(second.counts, { auth: 0, unresolved: 0, pins: 0, documents: 0, history: 0, skipped: 0, legacyCodeIds: 0 });
assert.equal((await (await read(owner)).json()).data.members[0].pinCode, code);
// Bounded cursor traversal reaches rows beyond the first batch.
for (let i = 0; i < 51; i++) db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('batch-' + String(i).padStart(3, '0'), sibling, legacy, 'Fixture', 'staff', i);
let cursor = null, changed = 0, rounds = 0;
do { const result = await (await call(seal, operator, cursor ? { cursor } : {})).json(); assert.equal(result.ok, true); changed += result.counts.pins; cursor = result.cursor; rounds++; assert.ok(rounds <= 3); } while (cursor);
assert.equal(changed, 51); opaque();
let throttled = false;
for (let i = 0; i < 9; i++) { if ((await call(seal, operator, {})).status === 429) { throttled = true; break; } }
assert.equal(throttled, false, 'successful operator backfills do not consume failure budget');
console.log('✓ staff codes: publication/add/seal persist hashes; legacy upgrade; role boundaries; encrypted docs, redaction, login; operator-only idempotent backfill');
// Council regression cases use isolated merchants and synthetic credentials only.
const { matchingStaffCodes, accountStaffCodes, sealMerchantStaff } = await import('../functions/auth/_staff-codes.js');
const { planEmployeeAuth, writeEmployeeAuth } = await import('../functions/api/_employee-auth.js');
const rotationShop = 'rotation-fixture';
const keyA = { ...env, PIN_PEPPER: 'fixture-A' };
const keyB = { ...env, PIN_PEPPER: 'fixture-B', PIN_PEPPER_PREVIOUS: keyA.PIN_PEPPER };
const oldHash = await hashStaffCode(keyA, rotationShop, code);
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('rotation', rotationShop, oldHash, 'Fixture', 'staff', 1);
assert.equal((await matchingStaffCodes(keyB, rotationShop, code)).length, 1);
assert.equal(db.prepare("SELECT pin FROM staff_pins WHERE id='rotation'").get().pin, await hashStaffCode(keyB, rotationShop, code));
assert.deepEqual(await matchingStaffCodes(keyB, rotationShop, oldHash), [], 'pass-the-hash refused');
await assert.rejects(hashStaffCode(keyB, rotationShop, oldHash), /invalid/);
assert.deepEqual(await accountStaffCodes(keyB, 'a', rotationShop, oldHash), []);
const sealedA = await codeDocument(keyA, rotationShop, 'team', team, true);
assert.equal((await codeDocument(keyB, rotationShop, 'team', sealedA)).members[0].pinCode, code);
const sealedB = await codeDocument(keyB, rotationShop, 'team', sealedA, true);
assert.equal((await codeDocument({ ...keyB, PIN_PEPPER_PREVIOUS: undefined }, rotationShop, 'team', sealedB)).members[0].pinCode, code);
assert.equal((await codeDocument({ ...keyB, PIN_PEPPER_PREVIOUS: undefined }, rotationShop, 'team', sealedA)).members[0].codeUnreadable, true);
const addedPepper = { ...env, PIN_PEPPER: 'fixture-added-later' };
assert.equal((await matchingStaffCodes(addedPepper, shop, code)).length > 0, true, 'adding pepper retains AUTH_SECRET');
assert.equal((await codeDocument(addedPepper, shop, 'team', encrypted)).members[0].pinCode, code);
const noPrevious = { ...env, AUTH_SECRET: 'fixture-new-auth-without-old' };
assert.equal((await verifyStaffPin(req(), noPrevious, rotationShop, code, { requireTill: false })).ok, false);
const badEditor = await get({ env: { ...env, PIN_PEPPER: 'fixture-missing-key', AUTH_SECRET_PREVIOUS: undefined, AUTH_SECRET: env.AUTH_SECRET }, request: new Request(`https://fixture.test/api/store?merchant=${shop}&feature=team`, { headers: { Cookie: owner } }) });
// AUTH_SECRET remains a fallback when adding PIN_PEPPER, so this read still succeeds.
assert.equal(badEditor.status, 200);
const missingDocEnv = { ...env, PIN_PEPPER: 'fixture-missing-key' };
db.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='team'").run(JSON.stringify(sealedA), shop);
assert.equal((await get({ env: missingDocEnv, request: new Request(`https://fixture.test/api/store?merchant=${shop}&feature=team`, { headers: { Cookie: owner } }) })).status, 200);
db.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='team'").run(JSON.stringify(encrypted), shop);
const legacyText = `${shop}\u0000m\u0000${code}`;
const oldDigest = Buffer.from(await crypto.subtle.digest('SHA-256', utf8.encode(legacyText))).toString('hex');
db.prepare("UPDATE employee_auth_versions SET pin_digest=?,auth_version=7 WHERE merchant=? AND member_id='m'").run(oldDigest, shop);
const plan = await planEmployeeAuth(env, shop, 'm', code);
assert.equal(plan.version, 7, 'legacy digest upgrades without logout'); assert.match(plan.digest, /^p2\$/);
await writeEmployeeAuth(env, shop, plan, 1, { sql: '1', binds: [] }).run();
assert.equal((await planEmployeeAuth(addedPepper, shop, 'm', code)).version, 7, 'key rotation retains version');
assert.equal((await planEmployeeAuth(env, shop, 'm', other)).version, 8);
db.prepare("UPDATE employee_auth_versions SET auth_version=0 WHERE merchant=? AND member_id='m'").run(shop);
// A bad merchant must not abort the email search for a good merchant.
db.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'employee-access',?,1,1)").run('aaa-bad-fixture', '{"members":[{"email":"member@fixture.test","pinCode":"e1$broken"}]}');
const badFirst = { ...env, DB: { ...env.DB, prepare(sql) {
  const st = env.DB.prepare(sql);
  if (!sql.startsWith('SELECT merchant, feature, data, updated_ts FROM store_docs')) return st;
  return { bind(...args) { const bound = st.bind(...args); return { ...bound, async all() { const r = await bound.all(); r.results.reverse(); return r; } }; } };
} } };
assert.ok(await findEmployeeCredential(badFirst, 'member@fixture.test', code));
// Many merchants still cost two reads, with no per-merchant queries.
for (let i = 0; i < 30; i++) db.prepare("INSERT INTO merchant_config (merchant,account_id,plan,features,updated_ts) VALUES (?,'many-fixture','pro','{}',1)").run('many-' + i);
let queries = 0;
const counting = { ...env, DB: { ...env.DB, prepare(sql) { queries++; return env.DB.prepare(sql); } } };
assert.deepEqual(await accountStaffCodes(counting, 'many-fixture', '', code), []);
assert.equal(queries, 2);
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('invalid-legacy', rotationShop, 'not-a-code', 'Fixture', 'staff', 1);
await sealMerchantStaff(env, rotationShop);
assert.equal(db.prepare("SELECT pin FROM staff_pins WHERE id='invalid-legacy'").get().pin, 'not-a-code');
// Reset only fixture limiter rows before exercising backfill failures/rotation.
db.exec('DELETE FROM pair_attempts');
db.prepare('DELETE FROM staff_pins WHERE merchant != ?').run(rotationShop);
db.prepare("DELETE FROM staff_pins WHERE id='rotation'").run();
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('old-key-backfill', rotationShop, await hashStaffCode(keyA, rotationShop, String(2).padStart(4, '0')), 'Fixture', 'staff', 1);
db.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'team',?,1,1)").run(rotationShop, JSON.stringify(sealedA));
db.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'team',?,1,1)").run('corrupt-fixture', '{');
db.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'team',?,1,1)").run('legacy-id-fixture', JSON.stringify({ members: [{ id: 'employee-' + code }] }));
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('old-key-backfill-2', rotationShop, await hashStaffCode(keyA, rotationShop, String(3).padStart(4, '0')), 'Fixture', 'staff', 1);
let next = null, skipped = 0, ids = 0, recoveryRounds = 0;
do {
  const r = await seal({ env: keyB, request: req(operator, next ? { cursor: next } : {}) });
  assert.equal(r.status, 200); recoveryRounds++; const data = await r.json(); skipped += data.counts.skipped; ids += data.counts.legacyCodeIds; next = data.cursor;
} while (next);
assert.ok(skipped >= 2); assert.equal(ids, 1); assert.ok(recoveryRounds >= 2, 'one hash recovery per request advances the cursor');
assert.equal(db.prepare("SELECT pin FROM staff_pins WHERE id='old-key-backfill-2'").get().pin, await hashStaffCode(keyB, rotationShop, String(3).padStart(4, '0')));
assert.equal(db.prepare("SELECT pin FROM staff_pins WHERE id='old-key-backfill'").get().pin, await hashStaffCode(keyB, rotationShop, String(2).padStart(4, '0')));
console.log('✓ council: rotation, invalid inputs, legacy digest, merchant isolation, bounded queries and corrupt-row cursor progress');

const authRotated = { ...env, AUTH_SECRET: 'fixture-auth-rotated', AUTH_SECRET_PREVIOUS: env.AUTH_SECRET };
const authOnlyHash = await hashStaffCode(env, 'auth-rotation-fixture', code);
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('auth-rotation', 'auth-rotation-fixture', authOnlyHash, 'Fixture', 'staff', 1);
assert.equal((await matchingStaffCodes(authRotated, 'auth-rotation-fixture', code)).length, 1);
assert.equal(db.prepare("SELECT pin FROM staff_pins WHERE id='auth-rotation'").get().pin, await hashStaffCode(authRotated, 'auth-rotation-fixture', code));
const migratedDoc = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='team'").get(rotationShop).data);
assert.equal((await codeDocument({ ...keyB, PIN_PEPPER_PREVIOUS: undefined }, rotationShop, 'team', migratedDoc)).members[0].pinCode, code, 'backfill reseals previous-key documents');
// Unsupported pre-production k1 values are deliberately not accepted.
const rawHash = 'k1$fixture-unsupported';
db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('raw-legacy', rotationShop, rawHash, 'Fixture', 'staff', 1);
assert.equal((await matchingStaffCodes(keyB, rotationShop, code)).length, 0);
let lookupCandidates;
const excluding = { ...env, DB: { ...env.DB, prepare(sql) {
  const st = env.DB.prepare(sql);
  if (!sql.includes('json_each(?)')) return st;
  return { bind(value) { lookupCandidates = JSON.parse(value); return st.bind(value); } };
} } };
await accountStaffCodes(excluding, 'a', '', code, shop);
assert.ok(lookupCandidates.length && lookupCandidates.every((candidate) => candidate.merchant !== shop), 'sibling lookup never re-queries current store');
