#!/usr/bin/env node
/* Équipe · retirer quelqu'un en plein service clôt son pointage.
 *
 * 2026-10-12. Un salarié retiré pendant son service gardait son pointage
 * OUVERT : son app employé est déconnectée, la caisse ne l'affiche plus, donc
 * personne ne pouvait plus le clore, et /api/team/live comptait ses heures
 * jusqu'à « maintenant » à chaque lecture. Le tableau de bord les refusionnait
 * ensuite toutes les secondes dans son stockage local.
 *
 * Exécute les vrais functions/api/store.js et functions/api/team/live.js sur une
 * base SQLite en mémoire, puis contrôle le côté tableau de bord.
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestPost: storePost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const { onRequestGet: teamLiveGet } = await import(pathToFileURL(path.join(ROOT, 'functions/api/team/live.js')).href);
const { makeSession, sessionCookie, DEMO_MERCHANTS } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const AUTH_SECRET = 'team-removal-shift-secret-0123456';
const SHOP = 'cafe-pointage-banc';
const now = Date.now();
const H = 3600000, M = 60000;

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE employee_auth_versions (merchant TEXT NOT NULL, member_id TEXT NOT NULL, auth_version INTEGER NOT NULL DEFAULT 0, pin_digest TEXT NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, member_id));
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
db.prepare(`INSERT INTO accounts VALUES ('acc-1','o@banc.test','Café Banc','s','h',?,'active',0)`).run(now);
db.prepare(`INSERT INTO merchant_config VALUES (?, '{}','pro','restaurant','acc-1','Café Banc','active',0,?)`).run(SHOP, now);

const member = (id, firstName) => ({ id, firstName, lastName: 'T.', email: `${id}@banc.test`, function: 'Serveur', department: 'Salle', pinCode: '', password: '' });
const TEAM = { members: [member('m1', 'Samira'), member('m2', 'Rachid'), member('m3', 'Nadia')], hours: {}, shifts: {} };
const ATT = { entries: [
  { id: 'a1', memberId: 'm1', name: 'Samira', inTs: now - 3 * H },
  { id: 'a2', memberId: 'm2', name: 'Rachid', inTs: now - 2 * H, pauseTs: now - 20 * M, breaks: [] },
  { id: 'a3', memberId: 'm3', name: 'Nadia', inTs: now - 26 * H, outTs: now - 20 * H },
] };
db.prepare(`INSERT INTO store_docs VALUES (?,'team',?,1,?)`).run(SHOP, JSON.stringify(TEAM), now);
db.prepare(`INSERT INTO store_docs VALUES (?,'attendance',?,1,?)`).run(SHOP, JSON.stringify(ATT), now);

const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    return { bind(...p) { return {
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    }; } };
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
} };
const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));
const doc = (feature) => { const r = db.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(SHOP, feature); return { data: JSON.parse(r.data), rev: r.rev }; };
const entry = (id) => doc('attendance').data.entries.find((e) => e.id === id);
const writeTeam = (data) => storePost({ request: new Request('https://k/api/store', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: owner },
  body: JSON.stringify({ feature: 'team', merchant: SHOP, data, baseRev: doc('team').rev }) }), env });
const liveHours = async () => {
  const res = await teamLiveGet({ request: new Request(`https://k/api/team/live?merchant=${SHOP}`, { headers: { Cookie: owner, 'CF-Connecting-IP': '10.0.0.2' } }), env });
  const body = await res.json();
  const total = (id) => Object.values(body.pointedHours[id] || {}).reduce((a, b) => a + Number(b || 0), 0);
  return { status: res.status, total, members: body.members };
};

check(!DEMO_MERCHANTS[SHOP], 'the bench store is not a demo slug (a demo slug lets anyone in)');

/* 1 · Samira est retirée en plein service, il y a 30 minutes */
const gone1 = now - 30 * M;
{
  const res = await writeTeam({ members: [member('m2', 'Rachid'), member('m3', 'Nadia')], hours: {}, shifts: {}, removed: [{ id: 'm1', ts: gone1 }] });
  check(res.status === 200, 'the owner removes a member who is on duty');
  const a1 = entry('a1');
  check(a1.outTs === gone1 && a1.closedBy === 'removal', 'their open shift is closed at the removal time, and says so');
  check(!entry('a2').outTs && entry('a3').outTs === now - 20 * H, 'the other shifts are untouched (one open, one long closed)');
  const live = await liveHours();
  check(live.status === 200 && Math.abs(live.total('m1') - 2.5) < 0.02, 'pointed hours stop at the removal: 2.5 h, not 3 h and counting');
}

/* 2 · Rachid est retiré pendant sa pause */
const gone2 = now - 5 * M;
{
  const res = await writeTeam({ members: [member('m3', 'Nadia')], hours: {}, shifts: {}, removed: [{ id: 'm1', ts: gone1 }, { id: 'm2', ts: gone2 }] });
  const a2 = entry('a2');
  const last = (a2.breaks || []).slice(-1)[0] || {};
  check(res.status === 200 && a2.outTs === gone2 && !a2.pauseTs && last.inTs === now - 20 * M && last.outTs === gone2, 'a member removed on a break: the break closes with the shift, at the same instant');
  const live = await liveHours();
  check(Math.abs(live.total('m2') - (115 - 15) / 60) < 0.02, 'and their hours are the shift minus the break (1 h 40)');
}

/* 3 · Une seconde écriture ne touche à rien */
{
  const before = doc('attendance').rev;
  const res = await writeTeam({ members: [member('m3', 'Nadia')], hours: {}, shifts: {}, removed: [{ id: 'm1', ts: gone1 }, { id: 'm2', ts: gone2 }] });
  check(res.status === 200 && doc('attendance').rev === before, 'idempotent: rewriting the team does not rewrite attendance');
}

/* 4 · Un pointage resté ouvert, écrit avant le correctif : la lecture s'arrête au retrait */
{
  const att = doc('attendance');
  att.data.entries.push({ id: 'a9', memberId: 'm9', name: 'Ancien', inTs: now - 5 * H });
  db.prepare(`UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'attendance'`).run(JSON.stringify(att.data), SHOP);
  const team = doc('team');
  team.data.removed = [...(team.data.removed || []), { id: 'm9', ts: now - 4 * H }];
  db.prepare(`UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'team'`).run(JSON.stringify(team.data), SHOP);
  const live = await liveHours();
  check(Math.abs(live.total('m9') - 1) < 0.02, 'an old open shift of a removed member counts up to the removal (1 h), not to now (5 h)');
  check(!live.members.some((x) => x.id === 'm9' || x.id === 'm1'), 'removed members are not on the live roster');
}

/* 5 · Le tableau de bord prévient, et ne refusionne pas les heures d'un retiré */
{
  const src = fs.readFileSync(path.join(ROOT, 'assets/team.js'), 'utf8');
  const onDuty = [...src.matchAll(/delOnDuty:\s*\(hm\)\s*=>\s*`([^`]*)`/g)].map((m) => m[1]);
  check(onDuty.length === 3 && onDuty.every((s) => s.includes('${hm}')), 'the remove dialog says « on duty since HH:MM » in FR, EN and AR');
  check(/const live = \(liveTeam\.members \|\| \[\]\)\.find\(\(x\) => x && x\.id === id\);/.test(src) && /\$\{esc\(T\.delDesc\)\}<\/p>\$\{onDuty\}/.test(src), 'and shows it only for a member the live channel reports on duty');
  check(/if \(gone\.has\(memberId\)\) return;/.test(src), 'the live poller no longer merges a removed member\'s hours back');
}

console.log(`\nteam-removal-shift: ${checks} passed, 0 failed`);
