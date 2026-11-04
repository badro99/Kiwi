import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { hashStaffCode, codeDocument, matchingStaffCodes, pinHashes, rotateStaffRow } from '../functions/auth/_staff-codes.js';
import { publishStaffCredentials } from '../functions/api/_staff-publication.js';
import { onRequestPost as add } from '../functions/api/admin/pins.js';
import { onRequestPost as roster } from '../functions/api/admin/roster.js';
import { onRequestPost as seal } from '../functions/api/admin/codes/seal.js';
import { onRequestPost as save, onRequestGet as get } from '../functions/api/store.js';
import { onRequestGet as employeeGet } from '../functions/api/employee.js';
import { makeSession, sessionCookie, employeeToken, employeeCookie, operatorToken, operatorIdToken, findEmployeeCredential } from '../functions/auth/_lib.js';
import { planEmployeeAuth } from '../functions/api/_employee-auth.js';
const schema = fs.readFileSync('schema.sql', 'utf8'), merchant = 'round2-fixture';
const code = String(1200 + 34), other = String(2300 + 45);
async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(schema);
  const DB = { prepare(sql) {
    const st = db.prepare(sql), bind = (args) => ({ first: async () => st.get(...args) || null, all: async () => ({ results: st.all(...args) }), run: async () => ({ meta: { changes: st.run(...args).changes } }) });
    return { ...bind([]), bind: (...args) => bind(args) };
  }, async batch(stmts) { db.exec('BEGIN'); try { const out = []; for (const st of stmts) out.push(await st.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  const env = { DB, AUTH_SECRET: 'round2-auth-fixture', PIN_PEPPER: 'round2-new-fixture', PIN_PEPPER_PREVIOUS: 'round2-old-fixture' };
  const old = { ...env, PIN_PEPPER: env.PIN_PEPPER_PREVIOUS, PIN_PEPPER_PREVIOUS: undefined };
  db.exec("INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES ('a','owner@fixture.test','Fixture','s','h',1); INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op','Fixture','s','h',1)");
  db.prepare("INSERT INTO merchant_config (merchant,account_id,plan,features,updated_ts) VALUES (?,'a','pro','{}',1)").run(merchant);
  const owner = sessionCookie(await makeSession('a', env.AUTH_SECRET));
  const operator = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET) + '; kiwi_op_id=' + await operatorIdToken(env.AUTH_SECRET, 'op');
  const request = (cookie, body) => new Request('https://fixture.test/api/store?merchant=' + merchant + '&feature=team', { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.55' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const call = (fn, cookie, body, e = env) => fn({ env: e, request: request(cookie, body) });
  const putDoc = (feature, doc) => db.prepare('INSERT OR REPLACE INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,1)').run(merchant, feature, JSON.stringify(doc));
  const pin = async (e = old, role = 'owner') => db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,1)').run('existing', merchant, await hashStaffCode(e, merchant, code), 'Fixture', role);
  const members = [{ id: 'bad', firstName: 'Bad', email: 'bad@fixture.test', pinCode: other, password: other }, { id: 'good', firstName: 'Good', email: 'good@fixture.test', pinCode: code, password: code }];
  return { db, env, old, owner, operator, request, call, putDoc, pin, members };
}
const cases = {
  async digest(f) {
    const { db, env, old, putDoc, members, call, operator } = f;
    for (const feature of ['team', 'employee-access']) putDoc(feature, await codeDocument(old, merchant, feature, { members }, true));
    for (const [id, value, legacy] of [['good', code, true], ['bad', other, false]]) {
      const digest = legacy ? Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${merchant}\0${id}\0${value}`))).toString('hex') : (await planEmployeeAuth(old, merchant, id, value)).digest;
      db.prepare('INSERT INTO employee_auth_versions VALUES (?,?,7,?,1)').run(merchant, id, digest);
    }
    const result = await (await call(seal, operator, {})).json();
    for (const [id, value] of [['good', code], ['bad', other]]) {
      const row = db.prepare('SELECT * FROM employee_auth_versions WHERE member_id=?').get(id);
      assert.equal(row.pin_digest, (await planEmployeeAuth(env, merchant, id, value)).digest, 'seal upgrades legacy and old-key digests');
      assert.equal(row.auth_version, 7);
    }
    assert.equal(result.done, true); assert.equal(result.counts.auth, 2);
    // An unmatched durable digest remains unresolved.
    db.prepare("UPDATE employee_auth_versions SET pin_digest='unrecoverable' WHERE member_id='bad'").run();
    const unresolved = await (await call(seal, operator, {})).json();
    assert.equal(unresolved.done, false); assert.equal(unresolved.counts.unresolved, 1);
    db.prepare('UPDATE employee_auth_versions SET pin_digest=? WHERE member_id=?').run((await planEmployeeAuth(old, merchant, 'good', code)).digest, 'good');
    let raced = false;
    const racingEnv = { ...env, DB: { ...env.DB, prepare(sql) {
      if (sql.startsWith('UPDATE employee_auth_versions SET pin_digest')) return { bind(...args) { return { run: async () => {
        raced = true;
        db.prepare("UPDATE employee_auth_versions SET pin_digest='concurrent-edit', auth_version=8 WHERE member_id='good'").run();
        return env.DB.prepare(sql).bind(...args).run();
      } }; } };
      return env.DB.prepare(sql);
    } } };
    const race = await (await call(seal, operator, {}, racingEnv)).json();
    assert.equal(raced, true); assert.equal(race.done, false); assert.equal(race.counts.unresolved, 2);
    const preserved = db.prepare("SELECT pin_digest,auth_version FROM employee_auth_versions WHERE member_id='good'").get();
    assert.equal(preserved.pin_digest, 'concurrent-edit'); assert.equal(preserved.auth_version, 8);

  },
  async duplicate(f) { await f.pin(); assert.equal((await f.call(add, f.operator, { merchant, pin: code, role: 'staff' })).status, 409); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM staff_pins').get().n, 1); },
  async submittedCount(f) {
    await f.pin(f.old, 'staff');
    const knownOnly = await f.call(roster, f.operator, { merchant, pins: [{ code, name: 'Fixture', role: 'staff' }, ...Array.from({ length: 4 }, (_, i) => ({ code: String(4500 + i), name: 'Fixture', role: 'staff' }))] });
    assert.equal(knownOnly.status, 200, 'old-key submitted code is known, allowing four new codes');
    f.db.prepare('DELETE FROM staff_pins WHERE merchant=?').run(merchant);
    await f.pin(f.old, 'staff');
    f.db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,1)').run('plain', merchant, code, 'Fixture', 'staff');
    const pins = [code, ...Array.from({ length: 5 }, (_, i) => String(3400 + i))].map(code => ({ code, name: 'Fixture', role: 'staff' }));
    const response = await f.call(roster, f.operator, { merchant, pins });
    assert.equal(response.status, 400, 'two representations of one submitted code count as one known code');
    assert.equal((await response.json()).error, 'too-many-new-codes');
  },
  async ownerRoster(f) { await f.pin(); assert.equal((await f.call(roster, f.operator, { merchant, pins: [{ code, role: 'staff', name: 'Employee' }] })).status, 409); },
  async ownerPublication(f) { await f.pin(); await publishStaffCredentials(f.env, merchant, { pins: [{ code, role: 'staff', name: 'Employee' }] }); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM staff_pins').get().n, 1); assert.equal(f.db.prepare('SELECT role FROM staff_pins').get().role, 'owner'); },
  async corrupt(f) {
    for (const feature of ['team', 'employee-access']) {
      const doc = await codeDocument(f.env, merchant, feature, { members: f.members }, true); doc.members[0].pinCode = 'e1$broken'; f.putDoc(feature, doc);
    }
    assert.ok(await findEmployeeCredential(f.env, 'good@fixture.test', code), 'healthy colleague still logs in');
    assert.equal(await findEmployeeCredential(f.env, 'bad@fixture.test', other), null, 'fallback password cannot revive corrupted member');
    const response = await f.call(get, f.owner); assert.equal(response.status, 200);
    const doc = (await response.json()).data; assert.equal(doc.members[0].codeUnreadable, true); assert.equal(doc.members[0].password, ''); assert.equal(doc.members[1].pinCode, code);
    const cookie = employeeCookie(await employeeToken(f.env.AUTH_SECRET, { merchant, staffId: 'good' }));
    assert.equal((await f.call(employeeGet, cookie)).status, 200, 'unaffected live session retained');
    doc.members[0].pinCode = other; doc.members[0].password = other;
    assert.equal((await f.call(save, f.owner, { merchant, feature: 'team', data: doc, baseRev: 1 })).status, 200, 'owner can replace unreadable code');
    assert.equal((await (await f.call(get, f.owner)).json()).data.members[0].pinCode, other);
    assert.equal((await f.call(employeeGet, cookie)).status, 200, 'repair preserves healthy colleague session');
  },
  async formats(f) { const candidates = await pinHashes(f.env, merchant, code); assert.equal(candidates.length, 3); assert.ok(candidates.every((p) => p.startsWith('k2$'))); },
  async upgrade(f) {
    await f.pin();
    const env = { ...f.env, DB: { ...f.env.DB, prepare(sql) { if (sql.startsWith('UPDATE staff_pins SET pin')) return { bind() { return { run: async () => { throw Error('fixture-write-unavailable'); } }; } }; return f.env.DB.prepare(sql); } } };
    assert.equal((await matchingStaffCodes(env, merchant, code)).length, 1, 'upgrade failure does not deny correct code');
  },
  async budget(f) { for (let i = 0; i < 25; i++) assert.equal((await f.call(seal, f.operator, {})).status, 200, 'successful backfills never consume failure limiter'); },
  async numericId(f) {
    f.putDoc('team', await codeDocument(f.env, merchant, 'team', { members: [{ ...f.members[1], id: 42 }] }, true));
    const doc = { members: [{ id: '42', firstName: 'Good', email: 'good@fixture.test' }] };
    assert.equal((await f.call(save, f.owner, { merchant, feature: 'team', data: doc, baseRev: 1 })).status, 200);
    assert.equal((await (await f.call(get, f.owner)).json()).data.members[0].pinCode, code, 'numeric prior identity preserves omitted credential');
  },
  async poll(f) {
    for (const feature of ['team', 'employee-access']) f.putDoc(feature, await codeDocument(f.env, merchant, feature, { members: f.members }, true));
    const subtle = crypto.subtle, original = subtle.decrypt; let decryptions = 0;
    subtle.decrypt = function (...args) { decryptions++; return original.apply(this, args); };
    try { const cookie = employeeCookie(await employeeToken(f.env.AUTH_SECRET, { merchant, staffId: 'good' })); assert.equal((await f.call(employeeGet, cookie)).status, 200); } finally { subtle.decrypt = original; }
    assert.equal(decryptions, 4, 'poll decrypts two fields in two documents for session member only');
  },
  async recovery(f) {
    const last = String(9999), row = { merchant, pin: await hashStaffCode(f.old, merchant, last) };
    const begin = process.cpuUsage(); let chunks = 0, maxCPU = 0, result;
    for (let start = 0; start < 10000; start += 250) {
      const cpu = process.cpuUsage(); result = await rotateStaffRow(f.env, row, start, 250); chunks++;
      const used = process.cpuUsage(cpu); maxCPU = Math.max(maxCPU, (used.user + used.system) / 1000);
      if (start < 9750) assert.equal(result, null, 'request yields after at most 250 HMACs');
    }
    assert.equal(chunks, 40); assert.equal(result, await hashStaffCode(f.env, merchant, last));
    const used = process.cpuUsage(begin), total = (used.user + used.system) / 1000;
    assert.ok(total < 2000 && maxCPU < 100, 'recovery CPU bounded well below paid Pages 30s budget');
    console.log(`recovery CPU: 10k candidates ${total.toFixed(1)}ms, max 250-candidate chunk ${maxCPU.toFixed(1)}ms`);
    f.db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,1)').run('recovery', merchant, row.pin, 'Fixture', 'staff');
    const response = await (await f.call(seal, f.operator, {})).json();
    assert.equal(response.done, false); assert.equal(response.cursor.recovery, 250); assert.equal(response.counts.pins, 0);
  },
};
for (const [name, run] of Object.entries(cases)) if (!process.env.SEAL_CASE || process.env.SEAL_CASE === name) {
  const f = await fixture(); try { await run(f); console.log('✓ round2 ' + name); } finally { f.db.close(); }
}
