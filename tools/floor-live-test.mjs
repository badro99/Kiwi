#!/usr/bin/env node
/* Kiwi · /api/floor/live — the owner's Plan de salle reads the room the till
 * reports, never a status typed by hand two months ago.
 *
 * Runs the real handler against schema.sql in an in-memory SQLite:
 *   · the owner reads their own store, and only their own store;
 *   · till states, open visits, open bills, guest requests and today's turns
 *     land on the right table key ("T4", "Table 4" and "4" are one table);
 *   · a guest request from a closed visit does not light a table;
 *   · no visit id (a bearer capability for the guest phone) leaves the route;
 *   · a base missing the newer columns degrades a field, never the room;
 *   · the route writes nothing.
 *
 * And the dashboard side of the same contract: floorplan-live.js resolves a
 * table from the till first, caps a forgotten table at « à vérifier », and
 * suggests the smallest table for a booking; the plan's zone rotation keeps
 * each zone staffed by its share and is fair over a cycle; and a number the
 * till folds into another (« T1 » = « 1 ») is flagged as a duplicate. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, assemble, tableKey } from '../functions/api/floor/live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; const fails = [];
const ok = (cond, label) => { if (cond) pass++; else fails.push(label); };

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
let writes = 0;
let breakOn = null;   // a regexp: queries matching it throw, as on an old base
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  async first() { if (breakOn && breakOn.test(sql)) throw new Error('no such column'); return db.prepare(sql).get(...args) || null; },
  async all() { if (breakOn && breakOn.test(sql)) throw new Error('no such column'); return { results: db.prepare(sql).all(...args) }; },
  async run() { writes++; const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } };
const SECRET = 'floor-live-secret';
const env = { DB, AUTH_SECRET: SECRET };
const merchant = 'cafe-test';
const now = Date.now();
const put = (sql, ...a) => db.prepare(sql).run(...a);
put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)', 'acc-1', 'o@t.ma', 'O', 'Cafe Test', 's', 'h', now);
put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)', 'acc-2', 'x@t.ma', 'X', 'Autre Resto', 's', 'h', now);
put('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)', merchant, '{}', 'restaurant', 'active', 'Cafe Test', 'acc-1', now);

const min = 60000;
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', merchant, 'service-events', JSON.stringify({
  states: {
    '4': { table: '4', status: 'ka-yaklo', covers: 3, ts: now - 40 * min, source: 'caisse' },
    '7': { table: '7', status: 'a-commander', covers: 2, ts: now - 5 * min, source: 'caisse' },
    '9': { table: '9', status: 'khawya', covers: 0, ts: now - 90 * min, source: 'caisse' },
    'B1': { table: 'B1', status: 'not-a-status', covers: 1, ts: now },
  },
  requests: [
    { id: 'r1', table: '7', action: 'ask-bill', sessionId: 'tsx-open-seven', ts: now - min },
    { id: 'r2', table: '9', action: 'call', sessionId: 'tsx-closed-nine', ts: now - 80 * min },
  ],
  events: [],
}), 1, now);
put("INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES (?,?,?,?,?,?,?)", 'tsx-open-four', merchant, 'table', 'T4', 'open', now - 42 * min, now);
put("INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES (?,?,?,?,?,?,?)", 'tsx-open-seven', merchant, 'table', '7', 'open', now - 6 * min, now);
put("INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES (?,?,?,?,?,?,?)", 'tsx-open-twelve', merchant, 'table', '12', 'open', now - 3 * min, now);
put("INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts,closed_ts,closed_by) VALUES (?,?,?,?,?,?,?,?,?)", 'tsx-closed-nine', merchant, 'table', '9', 'closed', now - 100 * min, now - 60 * min, now - 60 * min, 'settle');
put("INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES (?,?,?,?,?,?,?)", 'tsx-other-store', 'autre-resto', 'table', '4', 'open', now - 5 * min, now);
const order = (id, table, session, total, status, paid) => put(
  'INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id,paid_ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  id, merchant, 1, 'table', table, total, '[]', status, now - 30 * min, now - 30 * min, session, paid);
order('ord-a', '4', 'tsx-open-four', 120, 'served', null);
order('ord-b', '4', 'tsx-open-four', 45, 'accepted', null);
order('ord-c', '4', 'tsx-open-four', 999, 'rejected', null);
order('ord-d', '4', 'tsx-open-four', 300, 'served', now - 10 * min);
order('ord-e', '9', 'tsx-closed-nine', 210, 'served', now - 60 * min);
put('INSERT INTO sales (id,merchant,amount,method,label,ts,amount_cents,session_id) VALUES (?,?,?,?,?,?,?,?)', 's1', merchant, 210, 'cash', 'Table 9', now - 60 * min, 21000, 'tsx-closed-nine');
put('INSERT INTO sales (id,merchant,amount,method,label,ts,amount_cents,session_id,void_ts) VALUES (?,?,?,?,?,?,?,?,?)', 's2', merchant, 50, 'cash', 'Table 9', now - 59 * min, 5000, 'tsx-closed-nine', now - 58 * min);

const owner = sessionCookie(await makeSession('acc-1', SECRET)).split(';')[0];
const stranger = sessionCookie(await makeSession('acc-2', SECRET)).split(';')[0];
const get = async (cookie, m = merchant) => {
  const res = await onRequestGet({ request: new Request(`https://kiwi.test/api/floor/live?merchant=${m}`, { headers: cookie ? { Cookie: cookie } : {} }), env });
  return { status: res.status, body: await res.json() };
};

ok(tableKey('Table 4') === '4' && tableKey('T4') === '4' && tableKey('B1') === 'B1', 'tableKey folds "Table 4" / "T4" to "4" and keeps "B1"');

let r = await get(owner);
ok(r.status === 200 && r.body.ok, 'the owner reads their own room');
const T = r.body.tables || {};
ok(T['4'] && T['4'].status === 'ka-yaklo' && T['4'].covers === 3, 'table 4 · the till state and covers');
ok(T['4'] && Math.abs(T['4'].since - (now - 42 * min)) < 1000, 'table 4 · seated since the visit opened, not since the last state change');
ok(T['4'] && T['4'].billCents === 16500 && T['4'].orders === 2, 'table 4 · open bill = unpaid, not-rejected orders of the open visit (120 + 45 MAD)');
ok(T['7'] && T['7'].status === 'bgha-ykhlass' && T['7'].askBill === true, 'table 7 · a guest asking for the bill reads as "addition demandée"');
ok(T['12'] && T['12'].status === 'ka-yaklo', 'table 12 · an open visit without a till snapshot is still occupied');
ok(T['9'] && T['9'].status === 'khawya' && T['9'].requests === 0, 'table 9 · a request from a closed visit does not light the table');
ok(!T['B1'], 'an unknown status is ignored, not invented');
const S = r.body.stats || {};
ok(S['9'] && S['9'].turns === 1 && S['9'].avgMinutes === 40, 'table 9 · one turn today, 40 minutes');
ok(S['9'] && S['9'].revenueCents === 21000, 'table 9 · today\'s revenue counts the live sale and skips the voided one');
ok(!/tsx-/.test(JSON.stringify(r.body)), 'no visit id ever leaves the route');
ok(writes === 0, 'reading the room writes nothing');

/* entitledMerchant snaps an unowned slug back to the caller's own store, so a
   stranger asking for this room gets THEIR room, never this one. */
r = await get(stranger);
ok(r.status === 403 || (r.body.merchant === 'autre-resto' && !(r.body.tables || {})['7'] && !(r.body.tables || {})['12']),
  'another merchant asking for this room is answered with their own, never this one');
r = await get('');
ok(r.status === 403, 'an anonymous caller cannot read this room');

breakOn = /paid_ts|void_ts/;
r = await get(owner);
ok(r.status === 200 && r.body.tables && r.body.tables['4'] && r.body.tables['4'].status === 'ka-yaklo', 'an old base without paid_ts/void_ts still returns the room');
ok(r.body.partial && r.body.partial.revenue === true, 'and says which statistic it could not compute');
ok(r.body.tables['4'].billCents > 0, 'the bill falls back to orders on the table since the visit opened');
breakOn = null;

const pure = assemble({ states: {}, requests: [], sessions: [], bills: [], turns: [], sales: [], now });
ok(pure && Object.keys(pure.tables).length === 0, 'an empty room is an empty answer');

const SRC = fs.readFileSync(path.join(ROOT, 'functions/api/floor/live.js'), 'utf8');
ok(!/\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(SRC.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), 'the route source contains no write statement');

/* ── The dashboard side: assets/floorplan-live.js ───────────────────────── */
const win = { KiwiEnv: { isReal: () => false } };
const ctx = vm.createContext({ window: win, document: { visibilityState: 'visible', addEventListener() {} }, setInterval, clearInterval, fetch: async () => ({ ok: false }) });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/floorplan-live.js'), 'utf8'), ctx);
const FL = win.KiwiFloorLive;
ok(FL && typeof FL.resolve === 'function', 'floorplan-live.js exposes KiwiFloorLive');
const room = { live: true, tables: { '4': { status: 'bgha-ykhlass', covers: 3, since: now - 30 * min, billCents: 9000 }, '9': { status: 'khawya' } } };
ok(FL.resolve({ id: 'a', num: 'T4', status: 'free' }, room).status === 'bill', 'resolve · the till wins over the plan (T4 is table 4, addition demandée)');
ok(FL.resolve({ id: 'b', num: '9', status: 'occupied', since: now - 63 * 24 * 60 * min }, room).status === 'free',
  'resolve · with the till live, a stale hand-typed « occupée » reads free');
ok(FL.resolve({ id: 'c', num: '6', status: 'out' }, room).status === 'out', 'resolve · out of service is the owner\'s and outranks everything');
const idx = { byTable: { d: [{ id: 'bk', startAt: now + 20 * min, status: 'confirmed' }] } };
ok(FL.resolve({ id: 'd', num: '12', status: 'free' }, room, idx, now).status === 'reserved', 'resolve · a booking within 30 minutes reserves the table');
ok(FL.resolve({ id: 'e', num: '3', status: 'occupied', since: now - 10 * min }, null).status === 'occupied', 'resolve · no feed (demo): the owner\'s marking stands');
ok(FL.since(now - 63 * 24 * 60 * min, now).check === true && FL.since(now - 50 * min, now).label === '50 min',
  'since · past four hours a table reads « à vérifier », never « 1514 h »');
const tables = [{ id: 't2', num: '2', seats: 2 }, { id: 't4', num: '4', seats: 4 }, { id: 't6', num: '6', seats: 6 }, { id: 't8', num: '8', seats: 8 }];
const want = { id: 'x', partySize: 5, startAt: now + 60 * min, endAt: now + 150 * min };
ok(FL.suggestTable(want, tables, () => 'free', { byTable: {} }).id === 't6', 'suggestTable · the smallest table that seats the party');
ok(FL.suggestTable(want, tables, () => 'free', { byTable: { t6: [{ id: 'y', startAt: now + 90 * min, endAt: now + 180 * min }] } }).id === 't8',
  'suggestTable · skips a table already promised in that slot');
const doc = { resources: [{ id: 'r7', kind: 'table', name: 'Table 7' }], bookings: [
  { id: 'b1', status: 'confirmed', startAt: now + min, endAt: now + 90 * min, resourceId: FL.resourceTableId('t4'), customer: { name: 'A' } },
  { id: 'b2', status: 'confirmed', startAt: now + min, endAt: now + 90 * min, resourceId: 'r7', customer: { name: 'B' } },
  { id: 'b3', status: 'cancelled', startAt: now + min, endAt: now + 90 * min, resourceId: FL.resourceTableId('t4'), customer: { name: 'C' } }] };
const bk = FL.bookings(doc, tables.concat({ id: 't7', num: '7', seats: 4 }), now, now - 6 * 60 * min);
ok(bk.byTable.t4 && bk.byTable.t4.length === 1 && bk.byTable.t7 && bk.byTable.t7.length === 1, 'bookings · matched by template resource and by « Table 7 », cancelled ones dropped');

/* ── The rotation is fair over a cycle (assets/pages-pro.js › pdsRotateStep) ── */
const PRO = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
const grab = (name) => {
  const i = PRO.indexOf('function ' + name + '(');
  let d = 0;
  for (let k = PRO.indexOf('{', i); k < PRO.length; k++) {
    if (PRO[k] === '{') d++;
    else if (PRO[k] === '}' && --d === 0) return PRO.slice(i, k + 1);
  }
  return '';
};
const rot = vm.createContext({ pdsServerIds: (t) => t.servers || [], pdsTablesInOrder: (s, t) => t });
vm.runInContext(grab('pdsHomeZones') + '\n' + grab('pdsRotateStep') + '\nthis.step = pdsRotateStep;', rot);
const staff = 'KR YS OM SK MH NR AY IM'.split(' ').map((id) => ({ id }));
let tb = []; let tn = 0;
const lay = (z, c, who) => { for (let i = 0; i < c; i++) tb.push({ id: 't' + (tn++), zone: z, servers: [who[i % who.length]] }); };
lay('z1', 12, ['KR', 'YS', 'OM', 'SK']); lay('z2', 7, ['MH', 'NR', 'AY', 'IM']); lay('z3', 5, ['KR', 'YS']);
const st = { staff, zones: [{ id: 'z1' }, { id: 'z2' }, { id: 'z3' }] };
const visits = {};
let balanced = true;
for (let r = 0; r < 8; r++) {
  const m = rot.step(st, tb, 'zones');
  tb = tb.map((t) => ({ ...t, servers: m[t.id] }));
  const crew = {};
  tb.forEach((t) => { (crew[t.zone] = crew[t.zone] || new Set()).add(t.servers[0]); });
  if (crew.z1.size !== 4 || crew.z2.size !== 2 || crew.z3.size !== 2) balanced = false;
  Object.keys(crew).forEach((z) => crew[z].forEach((s) => { visits[s] = visits[s] || {}; visits[s][z] = (visits[s][z] || 0) + 1; }));
}
ok(balanced, 'rotation · each zone keeps servers in proportion to its tables (4 / 2 / 2 for 12 / 7 / 5)');
ok(Object.values(visits).every((v) => v.z1 === 4 && v.z2 === 2 && v.z3 === 2), 'rotation · over a cycle every server works every zone for its share');

/* ── A number the till reads as another one is a duplicate on a real store ── */
const dupCtx = vm.createContext({ pdsIsRealStore: () => true });
vm.runInContext(grab('pdsNumKey') + '\n' + grab('pdsDuplicateNums') + '\nthis.dups = pdsDuplicateNums;', dupCtx);
ok(dupCtx.dups({ tables: [{ num: '1' }, { num: 'T1' }, { num: '2' }] }).join() === '1 = T1', 'duplicates · « 1 » and « T1 » are one table for the till');
ok(!/Lettre par zone|pdsZoneLetter/.test(PRO), 'renumber · no letter prefixes that the till would fold into another table');

if (fails.length) {
  console.error(`\x1b[31m✗ floor-live: ${fails.length} échec(s)\x1b[0m`);
  fails.forEach((f) => console.error('  · ' + f));
  process.exit(1);
}
console.log(`\x1b[32m✓ floor-live: ${pass} vérifications\x1b[0m`);
