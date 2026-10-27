#!/usr/bin/env node
/* team-properties-test · staff codes and employee logins, as the server keeps them.
 *
 * The Team page publishes its roster through two routes: POST /api/config
 * (till codes in staff_pins + the employee-app login mirror) and POST
 * /api/store feature 'team' (the Team document, which rewrites the same
 * mirror). A login is valid only when the mirror's authVersion equals the
 * durable revision in employee_auth_versions. These properties drive the real
 * routes and the real verifiers (verifyStaffPin, findEmployeeCredential) on the
 * SQLite D1 fixture. Codes are generated test values, never printed. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import * as auth from '../functions/auth/_lib.js';
import * as config from '../functions/api/config.js';
import { onRequestPost as storePost } from '../functions/api/store.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; team properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 60, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0, known = 0;
async function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

const f = await fixture(ROOT), { sql, merchant } = f, raw = f.DB;
/* Hold: the first statement (first/run/all or batch) whose SQL matches `re`
 * waits until released, so a second request can run in between. */
let hold = null;
const gate = (q) => { if (!hold || hold.used || !hold.re.test(q)) return null; hold.used = true; return hold.gate; };
const wrap = (s) => {
  const out = { query: s.query, bind(...v) { s.bind(...v); return out; } };
  for (const m of ['first', 'run', 'all']) out[m] = async () => { const g = gate(s.query); if (g) await g; return s[m](); };
  out._inner = s; return out;
};
f.env.DB = {
  prepare: (q) => wrap(raw.prepare(q)),
  batch: async (ss) => { const g = gate(ss.map((s) => s.query).join('\n')); if (g) await g; return raw.batch(ss.map((s) => s._inner || s)); },
};
const env = f.env;
const owner = auth.SESS_COOKIE + '=' + await auth.makeSession('money-owner', env.AUTH_SECRET);
const till = auth.TILL_COOKIE + '=' + await auth.tillToken(env.AUTH_SECRET, merchant);

const ROLES = ['cashier', 'manager', 'server', 'chef', 'staff'];
const PEOPLE = Array.from({ length: 6 }, (_, k) => ({
  id: 'member-' + k, firstName: 'Membre', lastName: String(k), role: ROLES[k % ROLES.length],
  email: k % 3 === 2 ? '' : `membre${k}@example.test`,
}));
const CODES = ['2001', '2002', '2003', '2004', '2005', '1999', 'abcd'];
const OWNER_CODE = '1999';

async function publish(list) {
  const pins = list.map(({ p, code }) => ({ memberId: p.id, code, name: p.firstName + ' ' + p.lastName, firstName: p.firstName, lastName: p.lastName, email: p.email, role: p.role }));
  const res = await config.onRequestPost({ env, request: new Request('https://kiwi.test/api/config', { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, pins }) }) });
  return { status: res.status, body: await res.json() };
}
const teamRev = () => { const r = sql.prepare("SELECT rev FROM store_docs WHERE merchant = ? AND feature = 'team'").get(merchant); return r ? Number(r.rev) : 0; };
async function saveTeam(list, baseRev = teamRev()) {
  const data = { members: list.map(({ p, code }) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, pinCode: code, function: p.role })), hours: {}, shifts: {} };
  const res = await storePost({ env, request: new Request('https://kiwi.test/api/store', { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, feature: 'team', data, baseRev }) }), waitUntil() {} });
  return { status: res.status, body: await res.json() };
}
async function reset() {
  hold = null;
  sql.exec("DELETE FROM staff_pins; DELETE FROM employee_auth_versions; DELETE FROM pair_attempts; DELETE FROM store_docs WHERE feature IN ('team','employee-access')");
  sql.prepare("INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES ('pin-owner', ?, ?, 'Patron', 'owner', 1)").run(merchant, OWNER_CODE);
}
async function staffFor(code) {
  sql.exec('DELETE FROM pair_attempts');
  const r = await auth.verifyStaffPin(new Request('https://kiwi.test/api/pin/verify', { method: 'POST', headers: { Cookie: till } }), env, merchant, code);
  return r.ok ? r.staff.name : null;
}
const access = () => { const r = sql.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'").get(merchant); return r ? JSON.parse(r.data).members : []; };
const durable = () => new Map(sql.prepare('SELECT member_id, auth_version FROM employee_auth_versions WHERE merchant = ?').all(merchant).map((r) => [r.member_id, Number(r.auth_version)]));

/* What the published roster must leave behind. */
function expected(list) {
  const seen = new Set(), clean = [];
  for (const e of list) { if (!/^\d{4}$/.test(e.code) || seen.has(e.code)) continue; seen.add(e.code); clean.push(e); }
  const tillRows = clean.filter((e) => auth.employeeRoleOpensTill(e.p.role) && e.code !== OWNER_CODE);
  const pins = new Map([[OWNER_CODE, 'Patron'], ...tillRows.map((e) => [e.code, e.p.firstName + ' ' + e.p.lastName])]);
  return { pins, logins: clean.filter((e) => e.p.email) };
}
/* Two different people on one valid code: the server refuses the whole save
 * (409 duplicate-staff-code) and changes nothing, instead of silently dropping
 * the second person's till code and login (wave 11). */
function sharesCode(list) {
  const owner = new Map();
  return list.some((e) => /^\d{4}$/.test(e.code) && owner.has(e.code) && owner.get(e.code) !== e.p.id || (owner.set(e.code, e.p.id), false));
}
const snapshot = () => JSON.stringify([sql.prepare('SELECT pin, name, role FROM staff_pins WHERE merchant = ? ORDER BY pin').all(merchant), access(), [...durable()]]);
async function refusedUnchanged(list) {
  const before = snapshot();
  const r = await publish(list);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.error, 'duplicate-staff-code');
  assert.equal(snapshot(), before, 'a refused save changes nothing');
}

/* Every mirror entry must open the employee app with its own code. */
async function everyLoginWorks() {
  for (const m of access()) {
    const c = await auth.findEmployeeCredential(env, m.email, m.pinCode);
    if (!c || c.id !== m.id) return false;
  }
  return true;
}

const entry = fc.record({ who: fc.integer({ min: 0, max: PEOPLE.length - 1 }), code: fc.constantFrom(...CODES) });
const rosterOf = (min) => fc.uniqueArray(entry, { selector: (e) => e.who, minLength: min, maxLength: PEOPLE.length }).map((xs) => xs.map(({ who, code }) => ({ p: PEOPLE[who], code })));
const roster = rosterOf(0), crew = rosterOf(1);

console.log('team-properties-test');
try {
  await strict('a sequence of roster saves leaves exactly the published till codes, each opening the till as its own member, and the owner code untouched', fc.asyncProperty(fc.array(roster, { minLength: 1, maxLength: 5 }), async (saves) => {
    await reset();
    for (const list of saves) {
      if (sharesCode(list)) { await refusedUnchanged(list); continue; }
      const r = await publish(list); assert.equal(r.status, 200, JSON.stringify(r.body));
      const want = expected(list);
      const rows = sql.prepare('SELECT pin, name FROM staff_pins WHERE merchant = ?').all(merchant);
      assert.equal(rows.length, want.pins.size);
      for (const code of CODES.filter((c) => /^\d{4}$/.test(c))) assert.equal(await staffFor(code), want.pins.get(code) || null);
    }
  }));

  await strict('every member with an e-mail logs in with the code just published, and only with it', fc.asyncProperty(fc.array(roster, { minLength: 1, maxLength: 5 }), async (saves) => {
    await reset();
    for (const list of saves) {
      if (sharesCode(list)) { await refusedUnchanged(list); continue; }
      assert.equal((await publish(list)).status, 200);
      const want = expected(list);
      assert.deepEqual(access().map((m) => m.id).sort(), want.logins.map((e) => e.p.id).sort());
      for (const e of want.logins) {
        const c = await auth.findEmployeeCredential(env, e.p.email, e.code);
        assert.ok(c && c.id === e.p.id, 'login refused for ' + e.p.id);
        for (const other of CODES.filter((x) => /^\d{4}$/.test(x) && x !== e.code)) assert.equal(await auth.findEmployeeCredential(env, e.p.email, other), null);
      }
    }
  }));

  await strict('a login revision never goes back, and moves exactly when that member\'s code changes', fc.asyncProperty(fc.array(roster, { minLength: 1, maxLength: 6 }), async (saves) => {
    await reset();
    const last = new Map();
    for (const list of saves) {
      if (sharesCode(list)) { await refusedUnchanged(list); continue; }
      const before = durable();
      assert.equal((await publish(list)).status, 200);
      const after = durable();
      for (const [id, v] of before) assert.ok((after.get(id) ?? -1) >= v, 'revision went back for ' + id);
      for (const e of expected(list).logins) {
        const id = e.p.id, prev = last.get(id);
        if (prev !== undefined) assert.equal(after.get(id), before.get(id) + (prev === e.code ? 0 : 1));
        last.set(id, e.code);
      }
      for (const m of access()) assert.equal(m.authVersion, after.get(m.id));
    }
  }));

  await strict('the Team document and the code publish of one save, landing together, leave every login working', fc.asyncProperty(crew, crew, async (first, next) => {
    fc.pre(!sharesCode(first) && !sharesCode(next));
    await reset();
    assert.equal((await publish(first)).status, 200);
    assert.equal((await saveTeam(first)).status, 200);
    const rs = await Promise.all([saveTeam(next), publish(next)]);
    rs.forEach((r) => assert.ok(r.status === 200, JSON.stringify(r.body)));
    assert.ok(await everyLoginWorks());
  }));

  /* Two devices saving different codes for the same people at the same moment.
   * Before 22 October each route bumped the durable revision BEFORE writing the
   * mirror: the write that landed last could carry a revision the other had
   * already moved, and that employee could log in with neither code. */
  await strict('two saves with different codes racing, whatever the route and the moment, never lock an employee out', fc.asyncProperty(
    crew, crew, fc.constantFrom('config', 'team'), fc.constantFrom('config', 'team'), fc.constantFrom('auth', 'batch'),
    async (a, b, ra, rb, at) => {
      // A shared code is refused before any write, so it never reaches the hold.
      fc.pre(!sharesCode(a) && !sharesCode(b));
      await reset();
      const base = PEOPLE.filter((p) => p.email).map((p, i) => ({ p, code: CODES[i] }));
      assert.equal((await publish(base)).status, 200);
      assert.equal((await saveTeam(base)).status, 200);
      const rev = teamRev();
      let release; hold = { re: at === 'auth' ? /employee_auth_versions/ : /INSERT INTO store_docs[\s\S]*employee-access/, used: false, gate: new Promise((r) => { release = r; }) };
      const run = (route, list) => route === 'config' ? publish(list) : saveTeam(list, rev);
      const pa = run(ra, a);
      for (let i = 0; i < 200 && !hold.used; i++) await new Promise((r) => setImmediate(r));
      const rB = await run(rb, b);
      release(); const rA = await pa; hold = null;
      for (const r of [rA, rB]) assert.ok([200, 409].includes(r.status), JSON.stringify(r.body));
      assert.ok(await everyLoginWorks(), 'an employee in the mirror cannot log in');
    }));

  console.log(`${failed ? '✗' : '✓'} team-properties-test · ${passed} held, ${known} known, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
