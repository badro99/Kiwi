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
import { makeSession, sessionCookie, employeeToken, employeeCookie, operatorToken, operatorIdToken, findEmployeeCredential, activeEmployee, entitledMerchant, tillToken } from '../functions/auth/_lib.js';
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
  async endpointCorruption(f) {
    f.putDoc('attendance', { entries: f.members.map(m => ({ memberId: m.id, inTs: Date.now() })) });
    for (const feature of ['team', 'employee-access']) {
      const doc = await codeDocument(f.env, merchant, feature, { members: f.members.map(m => ({ ...m, function: 'manager' })) }, true);
      doc.members[0].password = 'e1$broken'; f.putDoc(feature, doc);
    }
    const till = 'kiwi_till=' + await tillToken(f.env.AUTH_SECRET, merchant);
    const routes = [
      ['clients', 'auditClient=missing'], ['store-credits', ''],
    ];
    for (const id of ['bad', 'good']) {
      const cookie = employeeCookie(await employeeToken(f.env.AUTH_SECRET, { merchant, staffId: id }));
      assert.equal(Boolean(await activeEmployee(f.request(cookie), f.env, merchant, { allowEmployee: true })), id === 'good');
      assert.equal(Boolean(await entitledMerchant(f.request(cookie), f.env, merchant, { allowEmployee: true })), id === 'good');
      assert.equal((await f.call(employeeGet, cookie)).status, id === 'good' ? 200 : 401);
      const { mayMergeClients } = await import('../functions/api/_client-merge.js');
      assert.equal(await mayMergeClients(f.request(cookie), f.env, merchant), id === 'good');
      const { moveIdentity } = await import('../functions/_origin-move.js');
      assert.equal(Boolean(await moveIdentity(f.request(cookie), f.env, 'employee')), id === 'good');
      const { onRequestGet: operations } = await import('../functions/api/operations.js');
      const op = await operations({ env: f.env, request: new Request('https://fixture.test/api/operations?merchant=' + merchant + '&view=whoami', { headers: { Cookie: cookie + '; ' + till } }) });
      assert.equal((await op.json()).kind, id === 'good' ? 'employee' : 'till', 'operations refuses corrupted employee authority even on paired device');
      const { onRequestPost: bulk } = await import('../functions/api/hotel/rooms-bulk.js');
      const rooms = await bulk({ env: f.env, request: new Request('https://fixture.test/api/hotel/rooms-bulk', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ merchant, operationId: 'fixture', targets: [{ id: 'missing' }], changes: {} }) }) });
      assert.equal(rooms.status, id === 'good' ? 422 : 403, 'hotel checks employee before changes');
      const { onRequestPost: clientsPost } = await import('../functions/api/clients.js');
      const merge = await f.call(clientsPost, cookie, { merchant, merge: { from: 'same', to: 'same' } });
      assert.equal(merge.status, id === 'good' ? 400 : 401, 'client merge requires readable member');
      const { onRequestPost: creditPost } = await import('../functions/api/store-credits.js');
      const credit = await f.call(creditPost, cookie, { merchant, action: 'cancel', id: 'missing' });
      assert.equal(credit.status, id === 'good' ? 400 : 401, 'store-credit management requires readable member');
      const { onRequestPost: move } = await import('../functions/api/origin-move.js');
      const origin = await move({ env: f.env, request: new Request('https://kiwi-maroc.pages.dev/api/origin-move', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://kiwi-maroc.pages.dev' }, body: JSON.stringify({ action: 'status', role: 'employee' }) }) });
      assert.equal((await origin.json()).login, id !== 'good', 'origin handoff refuses unreadable member');
      for (const [route, query] of routes) {
        const { onRequestGet } = await import('../functions/api/' + route + '.js');
        const response = await onRequestGet({ env: f.env, request: new Request('https://fixture.test/api/' + route + '?merchant=' + merchant + '&' + query, { headers: { Cookie: cookie } }) });
        assert.equal(response.status, id === 'good' ? 200 : 401, route + ' enforces live credential state');
      }
    }
  },
  async preserveMissingKey(f) { await cases.preserveUnreadable(f, true); },
  async preserveUnreadable(f, missingKey = false) {
    for (const feature of ['team', 'employee-access']) {
      const doc = await codeDocument(missingKey ? f.old : f.env, merchant, feature, { members: f.members }, true);
      if (!missingKey) doc.members[0].pinCode = 'e1$broken'; f.putDoc(feature, doc);
    }
    const raw = feature => JSON.parse(f.db.prepare('SELECT data FROM store_docs WHERE merchant=? AND feature=?').get(merchant, feature).data);
    if (missingKey) delete f.env.PIN_PEPPER_PREVIOUS;
    const originals = Object.fromEntries(['team', 'employee-access'].map(feature => [feature, raw(feature).members[0]]));
    const doc = (await (await f.call(get, f.owner)).json()).data;
    doc.members[0].firstName = 'Updated'; doc.members[0].email = 'moved@fixture.test'; doc.members[0].function = 'Caissier';
    assert.equal((await f.call(save, f.owner, { merchant, feature: 'team', data: doc, baseRev: 1 })).status, 200);
    for (const feature of ['team', 'employee-access']) {
      const member = raw(feature).members.find(m => m.id === 'bad');
      for (const field of ['pinCode', 'password']) assert.equal(member[field], originals[feature][field], feature + ' preserves raw ciphertext');
      assert.equal(Object.hasOwn(member, 'codeUnreadable'), false, 'read-time marker never stored');
    }
    const access = raw('employee-access').members.find(m => m.id === 'bad');
    assert.deepEqual([access.firstName, access.email, access.function], ['Updated', 'moved@fixture.test', 'Caissier'], 'owner identity edits apply while the code is unreadable');
    if (missingKey) {
      f.env.PIN_PEPPER_PREVIOUS = f.old.PIN_PEPPER;
      assert.ok(await findEmployeeCredential(f.env, 'moved@fixture.test', other), 'restored previous key recovers unchanged ciphertext under the new e-mail');
      assert.ok(!(await findEmployeeCredential(f.env, 'bad@fixture.test', other)), 'the old e-mail no longer signs in');
    }
    const edited = (await (await f.call(get, f.owner)).json()).data;
    edited.members[0].pinCode = ' ' + code + ' '; // a padded replacement still replaces
    assert.equal((await f.call(save, f.owner, { merchant, feature: 'team', data: edited, baseRev: 2 })).status, 200);
    assert.ok(await findEmployeeCredential(f.env, 'moved@fixture.test', code), 'replacement code usable');
  },
  async sealMarker(f) {
    const sealed = await codeDocument(f.env, merchant, 'team', { members: [{ id: 'bad', pinCode: 'e1$broken', codeUnreadable: true }] }, true);
    assert.equal(Object.hasOwn(sealed.members[0], 'codeUnreadable'), false);
  },
  async recoveryDeleted(f) { await cases.recoveryPagination(f, 'delete'); },
  async recoveryReplaced(f) { await cases.recoveryPagination(f, 'replace'); },
  async recoveryPagination(f, mutation = 'login') {
    const second = merchant + '-second';
    for (let i = 0; i < 53; i++) {
      const tenant = i % 2 ? second : merchant, value = String(i === 0 ? 760 : i === 1 ? 12 : 20 + i).padStart(4, '0');
      f.db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,1)').run('page-' + String(i).padStart(3, '0'), tenant, await hashStaffCode(f.old, tenant, value), 'Fixture', 'staff');
    }
    let response = await (await f.call(seal, f.operator, {})).json();
    assert.equal(response.cursor.recovery, 250);
    const storedValues = f.db.prepare('SELECT pin FROM staff_pins').all().map((r) => r.pin);
    assert.ok(!storedValues.some((v) => JSON.stringify(response.cursor).includes(v)), 'the resume cursor never carries a stored code value');
    // A normal login upgrades the pending row while the operator is between requests.
    if (mutation === 'delete') f.db.prepare('DELETE FROM staff_pins WHERE id=?').run('page-000');
    else if (mutation === 'replace') f.db.prepare('UPDATE staff_pins SET pin=? WHERE id=?').run(await hashStaffCode(f.old, merchant, String(10).padStart(4, '0')), 'page-000');
    else await matchingStaffCodes(f.env, merchant, String(760).padStart(4, '0'));
    let requests = 1;
    while (!response.done && response.cursor && requests < 100) { response = await (await f.call(seal, f.operator, { cursor: response.cursor })).json(); requests++; }
    assert.equal(response.done, true, 'pagination completes after pending row changes');
    assert.ok(requests > 50, 'several recovery rows and full SQL pagination exercised');
    for (let i = 0; i < 53; i++) {
      if (i === 0 && mutation === 'delete') continue;
      const row = f.db.prepare('SELECT merchant,pin FROM staff_pins WHERE id=?').get('page-' + String(i).padStart(3, '0'));
      const value = String(i === 0 ? 760 : i === 1 ? 12 : 20 + i).padStart(4, '0');
      assert.equal(row.pin === await hashStaffCode(f.env, row.merchant, i === 0 && mutation === 'replace' ? String(10).padStart(4, '0') : value), true, 'every tenant row recovered');
    }
  },
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
  async numericIncoming(f) { await cases.numericId(f, true); },
  async numericId(f, incomingNumber = false) {
    f.putDoc('team', await codeDocument(f.env, merchant, 'team', { members: [{ ...f.members[1], id: incomingNumber ? '42' : 42 }] }, true));
    const doc = { members: [{ id: incomingNumber ? 42 : '42', firstName: 'Good', email: 'good@fixture.test' }] };
    assert.equal((await f.call(save, f.owner, { merchant, feature: 'team', data: doc, baseRev: 1 })).status, 200);
    assert.equal((await (await f.call(get, f.owner)).json()).data.members[0].pinCode, code, 'numeric prior identity preserves omitted credential');
  },
  async poll(f) {
    for (const feature of ['team', 'employee-access']) f.putDoc(feature, await codeDocument(f.env, merchant, feature, { members: f.members }, true));
    const subtle = crypto.subtle, original = subtle.decrypt; let decryptions = 0;
    subtle.decrypt = function (...args) { decryptions++; return original.apply(this, args); };
    try { const cookie = employeeCookie(await employeeToken(f.env.AUTH_SECRET, { merchant, staffId: 'good' })); assert.equal((await f.call(employeeGet, cookie)).status, 200); } finally { subtle.decrypt = original; }
    assert.equal(decryptions, 4, 'poll decrypts two fields in two documents for session member only');
    decryptions = 0;
    subtle.decrypt = function (...args) { decryptions++; return original.apply(this, args); };
    try { const cookie = employeeCookie(await employeeToken(f.env.AUTH_SECRET, { merchant, staffId: 'good' })); assert.ok(await activeEmployee(f.request(cookie), f.env, merchant)); } finally { subtle.decrypt = original; }
    assert.equal(decryptions, 4, 'shared endpoint guard decrypts only the session member');
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
