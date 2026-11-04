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
const opaque = () => assert.ok(stored().every((r) => /^k1\$[\w-]{43}$/.test(r.pin)), 'only keyed hashes persisted');
const published = await publishStaffCredentials(env, shop, { pins: [{ code, name: 'Owner', role: 'owner', memberId: 'm', email: 'member@fixture.test' }] });
assert.equal(published.pins, 1); opaque();
assert.equal((await call(add, operator, { merchant: sibling, pin: other, role: 'cashier', name: 'Cashier' })).status, 200); opaque();
assert.equal((await call(add, operator, { merchant: shop, pin: code, role: 'staff' })).status, 409);
assert.equal((await verifyStaffPin(req(till), env, shop, code)).ok, true);
assert.equal((await verifyStaffPin(req(till), { ...env, PIN_PEPPER: 'wrong-fixture-key' }, shop, code, { requireTill: false })).ok, false);
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
assert.ok(await hashStaffCode(env, shop, code) === referenceHash, 'PIN derivation equals Web Crypto HKDF');

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
await assert.rejects(codeDocument({ AUTH_SECRET: 'wrong-fixture-key' }, shop, 'team', encrypted));
await assert.rejects(codeDocument(env, sibling, 'team', encrypted));
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
assert.deepEqual(second.counts, { pins: 0, documents: 0, history: 0 });
assert.equal((await (await read(owner)).json()).data.members[0].pinCode, code);
// Bounded cursor traversal reaches rows beyond the first batch.
for (let i = 0; i < 51; i++) db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('batch-' + String(i).padStart(3, '0'), sibling, legacy, 'Fixture', 'staff', i);
let cursor = null, changed = 0, rounds = 0;
do { const result = await (await call(seal, operator, cursor ? { cursor } : {})).json(); assert.equal(result.ok, true); changed += result.counts.pins; cursor = result.cursor; rounds++; assert.ok(rounds <= 3); } while (cursor);
assert.equal(changed, 51); opaque();
let throttled = false;
for (let i = 0; i < 9; i++) { if ((await call(seal, operator, {})).status === 429) { throttled = true; break; } }
assert.ok(throttled, 'operator backfill is rate limited');
console.log('✓ staff codes: publication/add/seal persist hashes; legacy upgrade; role boundaries; encrypted docs, redaction, login; operator-only idempotent backfill');
