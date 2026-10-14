#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · durcissement de la porte (octobre 2026)
 *
 *   A. POST /api/error passe la barrière : une caisse appairée (cookie
 *      kiwi_till seul) et une session employé rapportent leurs plantages.
 *      Le corps reste borné et la limite par boutique+IP reste en place.
 *   B. POST /__unlock (connexion employé) a un plafond PAR COMPTE, en plus de
 *      celui de l'adresse IP : changer d'adresse ne repart plus de zéro.
 *   C. Le compteur du verrou du dashboard (verifyAccountPin) n'est remis à zéro
 *      que par le code du PROPRIÉTAIRE, jamais par celui d'un gérant.
 *   D. Un employé retiré (pierre tombale du document team) perd sa session
 *      même si le miroir d'accès le porte encore, et une publication de codes
 *      d'un appareil périmé ne le réinscrit pas dans ce miroir.
 *
 * Aucun code réel : les codes de test sont posés ici, dans une base en mémoire.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  makeSession, SESS_COOKIE, tillToken, employeeToken, employeeCookie, activeEmployee,
  verifyAccountPin, teamRemovedIds,
} from '../functions/auth/_lib.js';
import { onRequest as gate } from '../functions/_middleware.js';
import { onRequestPost as postError } from '../functions/api/error.js';
import { onRequestPost as postConfig } from '../functions/api/config.js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Durcissement de la porte (tools/auth-hardening-2-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'auth-hardening-2-secret-32-bytes!!';
function freshEnv() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    try { db.exec(stmt); } catch (_) { /* sans objet ici */ }
  }
  return {
    sql: db,
    AUTH_SECRET: SECRET,
    DB: {
      prepare(q) {
        let args = [];
        const st = {
          bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
          first() { const r = db.prepare(q).get(...args); return r === undefined ? null : r; },
          all() { return { results: db.prepare(q).all(...args) }; },
          run() { const r = db.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; },
        };
        return st;
      },
      async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    },
  };
}
const NEXT = 'NEXT-REACHED';
const next = async () => new Response(NEXT, { status: 200 });
async function viaGate(env, request) {
  const res = await gate({ request, env, next });
  const text = await res.clone().text();
  return { status: res.status, passed: text === NEXT, res };
}

/* ── A · /api/error passe la barrière ─────────────────────────────────────── */
{
  const env = freshEnv();
  const till = await tillToken(SECRET, 'cafe-test');
  const report = (headers, body = { message: 'TypeError: x is undefined', file: '/assets/a.js', line: 3 }) =>
    new Request('https://kiwi.test/api/error', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  const withTill = await viaGate(env, report({ cookie: 'kiwi_till=' + till }));
  ok('un rapport de plantage venu d\'une caisse (cookie kiwi_till seul) passe la barrière', withTill.passed, String(withTill.status));
  const empId = await employeeToken(SECRET, { merchant: 'cafe-test', staffId: 'm1', authVersion: 0 });
  const withEmp = await viaGate(env, report({ cookie: employeeCookie(empId).split(';')[0] }));
  ok('un rapport venu d\'une session employé passe aussi', withEmp.passed, String(withEmp.status));
  const get = await viaGate(env, new Request('https://kiwi.test/api/error', { method: 'GET' }));
  ok('seul POST est ouvert : un GET reste derrière la porte', !get.passed, String(get.status));
  const sub = await viaGate(env, new Request('https://kiwi.test/api/error/extra', { method: 'POST', body: '{}' }));
  ok('chemin exact : rien sous /api/error/ n\'est ouvert', !sub.passed, String(sub.status));

  /* Le handler lui-même : bucket anonyme pour une boutique qu'on ne détient pas,
     corps démesuré refusé, limite par IP conservée. */
  const direct = (body, ip = '198.51.100.7', extra = {}) => postError({
    env,
    request: new Request('https://kiwi.test/api/error', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...extra },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  });
  const r1 = await direct({ message: 'boom', merchant: 'someone-elses-shop' });
  const j1 = await r1.json();
  ok('un rapport nommant la boutique d\'un autre est rangé dans le seau anonyme', j1.ok === true);
  const row = env.sql.prepare('SELECT merchant FROM client_errors').get();
  ok('… sous le marchand vide, jamais celui du corps', row && row.merchant === '', JSON.stringify(row));
  const big = await direct({ message: 'x', stack: 'y'.repeat(60 * 1024) });
  const jb = await big.json();
  ok('un corps démesuré est refusé avant d\'être lu', jb.ok === false && jb.error === 'too-large', JSON.stringify(jb));
  let blocked = 0;
  for (let i = 0; i < 12; i++) {
    const r = await direct({ message: 'flood ' + i }, '198.51.100.99');
    if (r.status === 429) blocked++;
  }
  ok('le plafond par IP coupe toujours un déluge', blocked > 0, 'blocked=' + blocked);
}

/* ── B · /__unlock : plafond par compte ───────────────────────────────────── */
{
  const env = freshEnv();
  const unlock = (email, ip) => new Request('https://kiwi.test/__unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip },
    body: new URLSearchParams({ email, pin: '0000' }).toString(),
  });
  let lockedAt = 0;
  for (let i = 1; i <= 12; i++) {
    const r = await viaGate(env, unlock('target@test.ma', '203.0.113.' + i));   // une IP neuve à chaque essai
    if (r.status === 429) { lockedAt = i; break; }
  }
  ok('changer d\'adresse IP ne remet plus le compteur d\'un compte à zéro', lockedAt > 0 && lockedAt <= 10, 'bloqué à l\'essai ' + lockedAt);
  const other = await viaGate(env, unlock('someone-else@test.ma', '203.0.113.200'));
  ok('un autre compte n\'est pas bloqué par ce compteur', other.status !== 429, String(other.status));
  const sameFromNewIp = await viaGate(env, unlock('TARGET@test.ma', '203.0.113.201'));
  ok('la clé est insensible à la casse de l\'e-mail', sameFromNewIp.status === 429, String(sameFromNewIp.status));
}

/* ── C · verifyAccountPin : seul le propriétaire remet à zéro ─────────────── */
async function pinEnv() {
  const env = freshEnv();
  const now = Date.now();
  env.sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-p','p@t.ma','P','Café Test','00','00',?)").run(now);
  env.sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,updated_ts) VALUES ('cafe-test','{}','acc-p','Café Test',?)").run(now);
  const pin = (id, code, name, role) => env.sql.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)').run(id, 'cafe-test', code, name, role, now);
  pin('p1', '1111', 'Patronne', 'owner');
  pin('p2', '2222', 'Gérant', 'manager');
  const token = await makeSession('acc-p', SECRET);
  const request = () => new Request('https://kiwi.test/api/pin/verify', { headers: { cookie: `${SESS_COOKIE}=${token}`, 'CF-Connecting-IP': '192.0.2.5' } });
  return { env, request };
}
{
  const { env, request } = await pinEnv();
  for (let i = 0; i < 6; i++) await verifyAccountPin(request(), env, '9999');
  const mgr = await verifyAccountPin(request(), env, '2222');
  ok('le code du gérant ouvre toujours le dashboard', mgr.ok === true, JSON.stringify(mgr));
  let blockedAt = 0;
  for (let i = 1; i <= 6; i++) {
    const r = await verifyAccountPin(request(), env, '9999');
    if (r.response && r.response.status === 429) { blockedAt = i; break; }
  }
  ok('un code de gérant réussi ne remet PAS le compteur à zéro (blocage rapide)', blockedAt > 0 && blockedAt <= 3, 'blocage à l\'essai ' + blockedAt);
}
{
  const { env, request } = await pinEnv();
  for (let i = 0; i < 6; i++) await verifyAccountPin(request(), env, '9999');
  const own = await verifyAccountPin(request(), env, '1111');
  ok('le code du propriétaire ouvre', own.ok === true, JSON.stringify(own));
  let blocked = false;
  for (let i = 0; i < 6; i++) {
    const r = await verifyAccountPin(request(), env, '9999');
    if (r.response && r.response.status === 429) blocked = true;
  }
  ok('le code du propriétaire, lui, remet le compteur à zéro', blocked === false);
}

/* ── D · employé retiré : plus de session via le miroir d'accès ───────────── */
{
  const env = freshEnv();
  const now = Date.now();
  const access = { members: [{ id: 'm1', email: 'gone@test.ma', pinCode: '4321', password: '4321', authVersion: 0, function: 'serveur', venueSlug: 'cafe-test' }] };
  env.sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES ('cafe-test','employee-access',?,1,?)").run(JSON.stringify(access), now);
  const cookie = employeeCookie(await employeeToken(SECRET, { merchant: 'cafe-test', staffId: 'm1', authVersion: 0 })).split(';')[0];
  const req = () => new Request('https://kiwi.test/api/order/queue', { headers: { cookie } });

  ok('avant le retrait, la session employé est valide', !!(await activeEmployee(req(), env)));
  env.sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES ('cafe-test','team',?,1,?)")
    .run(JSON.stringify({ members: [], removed: [{ id: 'm1', ts: now }] }), now - 1000);
  ok('retiré (pierre tombale) : la session ne vaut plus rien, miroir périmé ou non', (await activeEmployee(req(), env)) === null);
  ok('teamRemovedIds lit les pierres tombales', teamRemovedIds({ removed: [{ id: 'a' }, { id: 'b' }, null] }).has('b') && teamRemovedIds(null).size === 0);

  // Une publication de codes d'un appareil périmé ne réinscrit pas la personne.
  env.sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-d','d@t.ma','D','Café Test','00','00',?)").run(now);
  env.sql.prepare("INSERT OR REPLACE INTO merchant_config (merchant,features,account_id,name,updated_ts) VALUES ('cafe-test','{}','acc-d','Café Test',?)").run(now);
  const sess = await makeSession('acc-d', SECRET);
  const publish = await postConfig({
    env,
    request: new Request('https://kiwi.test/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `${SESS_COOKIE}=${sess}` },
      body: JSON.stringify({ merchant: 'cafe-test', pins: [
        { code: '4321', name: 'Gone', role: 'serveur', memberId: 'm1', email: 'gone@test.ma', firstName: 'G', lastName: 'One' },
        { code: '5678', name: 'Stay', role: 'serveur', memberId: 'm2', email: 'stay@test.ma', firstName: 'S', lastName: 'Tay' },
      ] }),
    }),
  });
  const pj = await publish.json();
  ok('la publication des codes aboutit', publish.status === 200 && pj.ok === true, JSON.stringify(pj));
  const mirror = JSON.parse(env.sql.prepare("SELECT data FROM store_docs WHERE merchant='cafe-test' AND feature='employee-access'").get().data);
  const ids = mirror.members.map((m) => m.id);
  ok('le miroir d\'accès ne contient plus la personne retirée', !ids.includes('m1'), JSON.stringify(ids));
  ok('… et garde les autres', ids.includes('m2'), JSON.stringify(ids));
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ durcissement de la porte : tout est vert.\n');
process.exitCode = failures ? 1 : 0;
