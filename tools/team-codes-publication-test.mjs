#!/usr/bin/env node
/* Kiwi · team-codes-publication-test.mjs · team#2.
 *
 * team-codes-at-rest-test.mjs pins the wiring of the roster's code handling
 * with source patterns. This runs it: the real assets/team/member-state.js
 * (roster, disk copy, publication holds, hydration), the real
 * assets/cloud-doc.js (the browser-to-route transport) and the real
 * functions/api/store.js route on SQLite, with the network cut at each
 * interesting moment:
 *
 *   · the POST reaches the server and the ANSWER is lost: the new code must
 *     still be on disk (the browser has no proof the server has it), and after a
 *     reload the hydration moves it off the disk without it ever being absent
 *     from both places;
 *   · the POST never reaches the server: the code stays on disk, and the
 *     reloaded browser publishes it once;
 *   · a browser that forgot the codes (its disk holds only hasCode markers) and
 *     whose hydration read fails: nothing is published by any path (roster
 *     save, push, pin sync), so the server keeps every code; once the read
 *     works the held publication goes out and no code is lost;
 *   · at no checkpoint does localStorage hold a code the server already has.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet: storeGet, onRequestPost: storePost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const { makeSession, sessionCookie } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

const AUTH_SECRET = 'team-publication-secret-0123456789', SHOP = 'atelier-test-shop', now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE employee_auth_versions (merchant TEXT NOT NULL, member_id TEXT NOT NULL, auth_version INTEGER NOT NULL DEFAULT 0, pin_digest TEXT NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, member_id));
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status,session_epoch) VALUES ('acc-1','o@shop.test',?,'s','h',?,'active',0)`).run(SHOP, now);
db.prepare(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?, '{}','pro','boutique','acc-1','Shop','active',0,?)`).run(SHOP, now);
const env = { AUTH_SECRET, DB: {
  prepare(q) { const st = db.prepare(q); return { bind(...p) { return {
    async first() { const row = st.get(...p); return row === undefined ? null : row; },
    async all() { return { results: st.all(...p) }; },
    async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
  }; } }; },
  async batch(stmts) { db.exec('BEGIN'); try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; } },
} };
const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));

/* the network: the real route, and a switch that cuts it */
const net = { cut: null, gets: 0, posts: [], redact: false };
const reply = (r) => ({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => r.clone().json(), text: () => r.clone().text() });
async function fetchImpl(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const u = new URL(url, 'https://kiwi.test');
  const request = new Request(u, { method, headers: { 'content-type': 'application/json', Cookie: owner, 'CF-Connecting-IP': '10.0.0.9' }, ...(method === 'POST' ? { body: opts.body } : {}) });
  if (method === 'GET') { net.gets++; if (net.cut === 'get') throw Object.assign(new Error('offline'), { code: 'timeout' }); const res = await storeGet({ request, env });
    if (net.redact) { const j = await res.json(); for (const m of (j.data && j.data.members) || []) { delete m.pinCode; delete m.password; } return { ok: res.ok, status: res.status, json: async () => j }; }
    return reply(res); }
  net.posts.push(JSON.parse(opts.body));
  if (net.cut === 'before') throw new Error('offline');
  const response = await storePost({ request, env });
  if (net.cut === 'after') throw new Error('answer-lost');
  return reply(response);
}
/* the owner's own view of the server copy (the route unseals at rest and shows the owner the codes) */
const serverDoc = async () => { const r = await storeGet({ request: new Request(`https://kiwi.test/api/store?feature=team&merchant=${SHOP}`, { headers: { Cookie: owner, 'CF-Connecting-IP': '10.0.0.9' } }), env }); const j = await r.json(); return j.data || null; };
const serverCodes = async () => Object.fromEntries((((await serverDoc()) || {}).members || []).map((m) => [m.id, m.pinCode || m.password || '']));

/* one browser = one window; the disk (localStorage) outlives it */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function browser(disk) {
  const listeners = {};
  const localStorage = { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => { disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); }, key: (i) => [...disk.keys()][i] || null, get length() { return disk.size; } };
  const document = { visibilityState: 'visible', addEventListener(t, f) { (listeners[t] ||= []).push(f); } };
  const syncs = [];
  const window = { document, localStorage, KiwiEnv: { isReal: () => true }, addEventListener(t, f) { (listeners[t] ||= []).push(f); }, dispatchEvent() {},
    KiwiVenue: { getCurrentVenueData: () => ({ id: 'v1', custom: true, slug: SHOP, type: 'boutique' }) },
    KiwiConfig: { syncPins: (pins) => { syncs.push(pins); } }, KiwiTeamParts: {} };
  window.window = window;
  new Function('window', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', read('assets/cloud-doc.js'))(window, document, localStorage, fetchImpl, setTimeout, clearTimeout);
  const sandbox = { window, document, localStorage, console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, Number, String, Promise, Set, Map, Error, Event: class { constructor(t) { this.type = t; } } };
  vm.runInNewContext(read('assets/team/member-state.js'), sandbox, { filename: 'member-state.js' });
  const identity = (d) => ({ fieldEdits: {}, members: [], removed: [], hours: {}, shifts: {}, planning: {}, locks: {}, ...(d || {}) });
  const ms = window.KiwiTeamParts.memberState.create({
    fetchDeadline: (url, opts) => fetchImpl(url, opts), teamKey: () => 'v1', teamVenueKey: () => 'v1', teamSlug: () => SHOP,
    memberBelongsToStore: () => true, scopeTeamDoc: identity, persistableTeamKey: () => true, memberFullName: (m) => m.firstName || '',
    restorePeriodLock() {}, buildPeriod: () => ({}), render() {}, trLang: () => 'fr', toast() {}, seedFor: () => [], seedHours: () => ({}),
  });
  ms.loadCustomTeams && ms.loadCustomTeams();
  return { ms, window, syncs, disk, handle: () => ms.teamCloudInit() };
}
const onDisk = (disk) => JSON.stringify(JSON.parse(disk.get('kiwiTeamV2:custom') || '{}'));
/* a push may already be in flight (hydration, a scheduled one): wait it out, then push for real */
async function flush(b) { for (let i = 0; i < 8; i++) { await settle(25); const r = await b.handle().pushNow(); if (!(r && r.error === 'busy')) return r; } }
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const C = { a: '4821', b: '7390', c: '2468' };
const people = () => [
  { id: 'm1', firstName: 'Sara', pinCode: C.a, password: C.a, venueSlug: SHOP },
  { id: 'm2', firstName: 'Omar', pinCode: C.b, password: C.b, venueSlug: SHOP },
];
const place = (b, members) => { b.window.__kiwiTeamV2.byVenue.v1 = members; };

console.log('■ Codes du roster : publication interrompue, du navigateur à la route');

/* seed: a first browser publishes two members and the server has both codes */
{
  const b = browser(new Map());
  place(b, people());
  await b.handle().bind();
  b.ms.saveCustomTeams(); await flush(b);
  assert.deepEqual(await serverCodes(), { m1: C.a, m2: C.b }, 'seed: the server holds both codes');
}

/* A · the POST reaches the server, the answer is lost */
{
  const disk = new Map(), b = browser(disk);
  place(b, people().concat([{ id: 'm3', firstName: 'Neo', pinCode: C.c, password: C.c, venueSlug: SHOP }]));
  await b.handle().bind();
  net.cut = 'after'; b.ms.saveCustomTeams(); await flush(b); net.cut = null;
  assert.equal((await serverCodes()).m3, C.c, 'the server applied the new hire');
  assert.ok(onDisk(disk).includes(`"${C.c}"`), 'the answer was lost: the new code is still on disk (no proof the server has it)');
  /* reload: a fresh browser on the same disk */
  const r = browser(disk);
  assert.ok(r.window.__kiwiTeamV2.byVenue.v1 && JSON.stringify(r.window.__kiwiTeamV2.byVenue.v1).includes(C.c), 'the reloaded roster still carries the code');
  const ok = await r.ms.hydrateCodes();
  assert.equal(ok, true, 'hydration read the server copy');
  assert.ok(!onDisk(disk).includes(`"${C.c}"`) && !onDisk(disk).includes(`"${C.a}"`), 'once the server confirmed them, no code stays on disk');
  assert.equal((await serverCodes()).m3, C.c, 'and the server still has it');
  assert.ok(JSON.stringify(r.window.__kiwiTeamV2.byVenue.v1).includes(C.c), 'the owner still reads it in memory');
}

/* B · the POST never reaches the server */
{
  const disk = new Map(), b = browser(disk);
  place(b, people().concat([{ id: 'm4', firstName: 'Lea', pinCode: '1357', password: '1357', venueSlug: SHOP }]));
  await b.handle().bind();
  net.cut = 'before'; b.ms.saveCustomTeams(); await flush(b); net.cut = null;
  assert.equal((await serverCodes()).m4, undefined, 'the server never saw the hire');
  assert.ok(onDisk(disk).includes('"1357"'), 'the code stays on disk');
  const r = browser(disk);
  await r.handle().bind();
  await r.ms.hydrateCodes(); r.ms.saveCustomTeams(); await flush(r);
  assert.equal((await serverCodes()).m4, '1357', 'the reloaded browser publishes it');
  assert.equal(Object.keys(await serverCodes()).filter((id) => id === 'm4').length, 1, 'once');
}

/* C · a browser that forgot the codes (its disk holds markers only) and whose
   reads fail: no path may publish. publishPins() would REPLACE the till's code
   list without those members, and a roster push would erase them server side. */
{
  const disk = new Map(), b = browser(disk);
  place(b, people());
  await b.handle().bind(); await b.ms.hydrateCodes(); b.ms.persistTeams();
  assert.ok(!onDisk(disk).includes(C.a), 'the disk holds markers, not codes');
  const before = JSON.stringify(await serverCodes());
  assert.ok(before.includes(C.a) && before.includes(C.b), 'the server holds the codes');
  const r = browser(disk);
  net.cut = 'get';
  assert.equal(r.ms.rosterHasUnresolved(r.window.__kiwiTeamV2.byVenue.v1), true, 'the reloaded roster has members without their code');
  const postsBefore = net.posts.length;
  assert.equal(await r.ms.hydrateCodes(), false, 'hydration failed');
  r.ms.saveCustomTeams(); r.ms.publishPins(); r.ms.afterTeamChange();
  await flush(r);
  assert.equal(net.posts.length, postsBefore, 'no POST left the browser while codes were unresolved');
  assert.equal(r.syncs.length, 0, 'no pin sync either: the till keeps the code list it has');
  assert.equal(JSON.stringify(await serverCodes()), before, 'the server kept every code');
  /* the network comes back: the real bind sequence reads, resolves, then publishes the FULL roster */
  net.cut = null;
  await r.ms.teamCloudBind();
  await flush(r);
  assert.equal(r.ms.rosterHasUnresolved(r.window.__kiwiTeamV2.byVenue.v1), false, 'codes resolved after the read');
  assert.ok(r.syncs.length >= 1, 'the held publication went out');
  const last = r.syncs[r.syncs.length - 1];
  assert.equal(JSON.stringify(last.map((p) => p.code).sort()), JSON.stringify([C.a, C.b, '1357', C.c].sort()), 'and it carries EVERY member code, none dropped');
  assert.equal(JSON.stringify(await serverCodes()), before, 'the server still holds the same codes');
  assert.ok(!onDisk(disk).includes(C.a) && !onDisk(disk).includes(C.b), 'and nothing the server has stays on disk');
}
/* D · the answer arrives: the code leaves the disk at once (onPushed), the server has it */
{
  const disk = new Map(), b = browser(disk);
  await b.handle().bind(); await b.ms.hydrateCodes();
  place(b, b.window.__kiwiTeamV2.byVenue.v1.concat([{ id: 'm5', firstName: 'Ida', pinCode: '8642', password: '8642', venueSlug: SHOP }]));
  b.ms.saveCustomTeams();
  assert.ok(onDisk(disk).includes('"8642"'), 'before the server answers, the new code is on disk');
  await flush(b);
  assert.equal((await serverCodes()).m5, '8642', 'the server has it');
  assert.ok(!onDisk(disk).includes('"8642"'), 'the confirmed push took the code off the disk');
}
/* E · the read worked, then a member's code is unknown in memory: the roster push is held, then released */
{
  const disk = new Map(), b = browser(disk);
  await b.handle().bind(); await b.ms.hydrateCodes();
  const full = b.window.__kiwiTeamV2.byVenue.v1;
  const before = JSON.stringify(await serverCodes());
  place(b, full.map((m, i) => (i === 0 ? { id: m.id, firstName: m.firstName, venueSlug: SHOP, hasCode: true } : m)));
  const posts = net.posts.length;
  b.ms.saveCustomTeams();
  const held = await flush(b);
  assert.equal(held && held.status, 423, 'the push is held while a code is unresolved');
  assert.equal(net.posts.length, posts, 'nothing left the browser');
  assert.equal(JSON.stringify(await serverCodes()), before, 'the server kept every code');
  place(b, full);
  const sent = await flush(b);
  assert.ok(sent && sent.ok, 'resolved, the push goes out');
  assert.equal(JSON.stringify(await serverCodes()), before, 'and loses nothing');
}
console.log('  ✓ codes du roster : réponse perdue, requête perdue et lecture en panne, du vrai navigateur à la vraie route, sans perte ni copie en clair');
process.exit(0);
