#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · slug d'un commerce sans lettre latine (arabe, chinois…)
 *
 * Avant : slugMerchant() rendait le littéral 'client' pour tout nom sans lettre
 * latine. Toutes ces boutiques tombaient dans le MÊME locataire, l'inscription
 * sautait le contrôle d'unicité pour 'client', et /api/pair/create n'avait
 * aucune garde de propriété sur le repli dérivé du nom : une caisse pouvait
 * s'appairer dans la boutique d'un inconnu.
 *
 * Ce banc garde :
 *   1. un slug propre, stable et distinct par nom (« shop-<hash> ») ;
 *   2. le jumeau navigateur (caisse-link.js, orderpro-publish.js) identique ;
 *   3. l'inscription : deux enseignes arabes différentes passent, la même est
 *      refusée, et personne ne reçoit 'client' ;
 *   4. les anciens comptes (créés avant le correctif) gardent 'client' ;
 *   5. pair/create refuse un slug que le registre donne à un autre compte.
 *
 * Aucun code ni mot de passe réel : le mot de passe est une phrase de test.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  slugMerchant, accountSlug, makeSession, SESS_COOKIE, LEGACY_CLIENT_BEFORE_TS,
} from '../functions/auth/_lib.js';
import { onRequestPost as signup } from '../functions/auth/signup.js';
import { onRequestPost as pairCreate } from '../functions/api/pair/create.js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Slug d\'un commerce sans lettre latine (tools/nonlatin-slug-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function freshEnv() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  db.exec(raw);
  return {
    sql: db,
    AUTH_SECRET: 'nonlatin-slug-test-secret-32-bytes!',
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
    },
  };
}

/* ── 1 · le slug lui-même ─────────────────────────────────────────────────── */
const A = 'متجر الأمل';
const B = 'مقهى النور';
{
  const a = slugMerchant(A), b = slugMerchant(B);
  ok('un nom arabe ne retombe plus sur le littéral partagé', a !== 'client' && b !== 'client', a + ' / ' + b);
  ok('deux enseignes arabes différentes ont deux slugs différents', a !== b);
  ok('le même nom donne toujours le même slug (le contrôle d\'unicité le rattrape)', slugMerchant(A) === slugMerchant('  ' + A + ' '));
  ok('le slug est stable à la vocalisation et à la casse', slugMerchant('مَتْجَر الأمل') === a);
  ok('le slug est sûr (a-z0-9-)', /^shop-[a-z0-9]{14}$/.test(a), a);
  ok('un nom latin garde son slug d\'avant', slugMerchant('Café Atlas') === 'cafe-atlas');
  ok('un nom mixte garde la partie latine', slugMerchant('متجر Atlas') === 'atlas');
  ok('un nom vide reste le repli historique', slugMerchant('') === 'client');
  ok('un nom fait d\'émojis a son propre slug', /^shop-/.test(slugMerchant('😀☕')));
}

/* ── 2 · jumeaux navigateur ───────────────────────────────────────────────── */
{
  for (const file of ['assets/caisse-link.js', 'assets/orderpro-publish.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = src.match(/function slugMerchant\(s\) \{[\s\S]*?\n  \}\n/);
    ok(file + ' : jumeau repéré', !!m);
    if (!m) continue;
    const twin = vm.runInNewContext('(' + m[0].replace(/^function slugMerchant/, 'function') + ')');
    const names = [A, B, 'Café Atlas', 'متجر Atlas', '', '😀☕', '   ', 'مَتْجَر الأمل', '北京小店'];
    const bad = names.filter((n) => twin(n) !== slugMerchant(n));
    ok(file + ' : même slug que le serveur sur ' + names.length + ' noms', bad.length === 0, JSON.stringify(bad));
  }
}

/* ── 3 · inscription ──────────────────────────────────────────────────────── */
const PASS = 'une phrase de passe longue pour le test';
function signupReq(email, business) {
  return new Request('https://kiwi.test/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.' + (email.length % 200) },
    body: JSON.stringify({ email, name: 'Test', business, password: PASS }),
  });
}
{
  const env = freshEnv();
  const r1 = await signup({ request: signupReq('a1@test.ma', A), env, waitUntil() {} });
  const r2 = await signup({ request: signupReq('a2@test.ma', B), env, waitUntil() {} });
  ok('première enseigne arabe : inscription acceptée', r1.status === 200, String(r1.status));
  ok('seconde enseigne arabe, autre nom : acceptée aussi (plus de collision sur « client »)', r2.status === 200, String(r2.status));
  const r3 = await signup({ request: signupReq('a3@test.ma', A), env, waitUntil() {} });
  const j3 = await r3.json();
  ok('le même nom arabe est refusé comme n\'importe quel nom pris', r3.status === 409 && j3.error === 'business-taken', r3.status + ' ' + JSON.stringify(j3));
  const r4 = await signup({ request: signupReq('a4@test.ma', 'client'), env, waitUntil() {} });
  ok('le littéral « client » reste interdit aux nouveaux comptes', r4.status === 409, String(r4.status));
  const rows = env.sql.prepare('SELECT business FROM accounts ORDER BY created_ts').all();
  ok('seuls deux comptes ont été créés', rows.length === 2, String(rows.length));
}

/* ── 4 · anciens comptes : on ne les renomme pas ──────────────────────────── */
{
  const env = freshEnv();
  const old = LEGACY_CLIENT_BEFORE_TS - 86400000;
  env.sql.prepare("INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES ('acc-old','o@t.ma','O',?, '00','00',?)").run(A, old);
  env.sql.prepare("INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES ('acc-new','n@t.ma','N',?, '00','00',?)").run(B, LEGACY_CLIENT_BEFORE_TS + 1000);
  ok('un compte arabe d\'avant le correctif garde « client »', (await accountSlug(env, A, 'acc-old')) === 'client');
  ok('un compte arabe d\'après reçoit un slug propre', (await accountSlug(env, B, 'acc-new')) === slugMerchant(B));
  ok('un compte latin n\'est jamais touché, ancien ou non', (await accountSlug(env, 'Café Atlas', 'acc-old')) === 'cafe-atlas');
  ok('base muette : le nouveau slug, jamais « client »', (await accountSlug({ DB: { prepare() { throw new Error('down'); } } }, B, 'acc-x')) === slugMerchant(B));
}

/* ── 5 · pair/create : propriété vérifiée ─────────────────────────────────── */
async function pairFor(env, aid) {
  const token = await makeSession(aid, env.AUTH_SECRET);
  const request = new Request('https://kiwi.test/api/pair/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESS_COOKIE}=${token}` },
    body: JSON.stringify({}),
  });
  const res = await pairCreate({ request, env });
  return { status: res.status, body: await res.json() };
}
{
  const env = freshEnv();
  const now = Math.max(Date.now(), LEGACY_CLIENT_BEFORE_TS + 1000);
  env.sql.prepare("INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES ('acc-a','a@t.ma','A',?, '00','00',?)").run(A, now);
  env.sql.prepare("INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES ('acc-b','b@t.ma','B',?, '00','00',?)").run(A, now);
  env.sql.prepare("INSERT INTO merchant_config (merchant, features, account_id, name, updated_ts) VALUES (?, '{}', 'acc-a', ?, ?)").run(slugMerchant(A), A, now);
  const okA = await pairFor(env, 'acc-a');
  ok('le propriétaire du slug obtient son code', okA.status === 200 && okA.body.ok === true, JSON.stringify(okA));
  const noB = await pairFor(env, 'acc-b');
  ok('un autre compte au même nom ne peut pas appairer une caisse dans cette boutique', noB.status === 403, JSON.stringify(noB));
  const row = env.sql.prepare('SELECT COUNT(*) AS n FROM pairings WHERE account_id = ?').get('acc-b');
  ok('aucun code n\'a été émis pour lui', row.n === 0, String(row.n));

  env.sql.prepare("INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES ('acc-c','c@t.ma','C','Café Neuf','00','00',?)").run(now);
  const freshC = await pairFor(env, 'acc-c');
  ok('un compte dont la boutique n\'est pas encore au registre pair toujours', freshC.status === 200, JSON.stringify(freshC));
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ slugs sans lettre latine : tout est vert.\n');
process.exitCode = failures ? 1 : 0;
