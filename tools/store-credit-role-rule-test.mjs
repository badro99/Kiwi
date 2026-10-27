#!/usr/bin/env node
/* Annuler ou corriger un avoir engage la boutique : seul un responsable le
 * peut. mayCancelCredit cherchait « gerant|manager|responsable|admin… » dans le
 * texte du poste, alors que le reste du serveur (employeeRoleOpensDashboard)
 * compare le rôle entier. Résultat : « Assistant manager » ou « Responsable de
 * salle » pouvaient annuler un avoir mais pas valider la même opération avec
 * leur code. Une règle, la même partout. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../functions/api/store-credits.js';
import { employeeCookie, employeeToken, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const MERCHANT = 'maison-role-rule';
const SECRET = 'store-credit-role-rule-secret';
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; console.log('  ✓ ' + message); };

function world(role) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) { let args = []; const st = {
    bind(...v) { args = v; return st; },
    run() { const r = raw.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    first() { return raw.prepare(sql).get(...args) || null; },
    all() { return { results: raw.prepare(sql).all(...args) }; } }; return st; },
    batch(list) { raw.exec('BEGIN IMMEDIATE'); try { const out = list.map((s) => s.run()); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; } } };
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?,?)').run('acc-r', 'r@example.test', 'Owner', 'Maison', 's', 'h', now, 'active');
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,till_epoch,updated_ts) VALUES (?,?,?,?,?,?,?,?)').run(MERCHANT, '{}', 'maison', 'active', 'Maison', 'acc-r', 0, now);
  const member = { id: 'staff-1', firstName: 'Sara', lastName: 'Test', role, function: role };
  const doc = raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)');
  doc.run(MERCHANT, 'employee-access', JSON.stringify({ members: [member] }), 1, now);
  doc.run(MERCHANT, 'team', JSON.stringify({ members: [member] }), 1, now);
  return { env: { DB, AUTH_SECRET: SECRET } };
}
const empCookie = (await employeeCookie(await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'staff-1' }))).split(';')[0];
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
async function cancelAs(role) {
  const w = world(role);
  const res = await onRequestPost({ env: w.env, request: new Request('https://kiwi.test/api/store-credits', {
    method: 'POST', headers: { cookie: `${till}; ${empCookie}`, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: MERCHANT, action: 'cancel', id: 'cancel:credit:role-rule', code: 'AV-NOPE', reason: 'Correction' }) }) });
  return { status: res.status, body: await res.json() };
}
/* 403 manager-required = refusé pour le rôle ; toute autre réponse (404 avoir introuvable) = le rôle a passé la porte. */
for (const role of ['Gérant', 'Manager', 'Admin', 'Propriétaire', 'Owner']) {
  const r = await cancelAs(role);
  ok(r.status !== 403, `le rôle « ${role} » passe la porte des avoirs (${r.status} ${r.body.error || ''})`);
}
for (const role of ['Assistant manager', 'Responsable de salle', 'Serveur', 'Caissier', 'Administratif']) {
  const r = await cancelAs(role);
  ok(r.status === 403 && r.body.error === 'manager-required', `le rôle « ${role} » ne passe pas (${r.status} ${r.body.error || ''})`);
}
const source = fs.readFileSync(new URL('../functions/api/store-credits.js', import.meta.url), 'utf8');
ok(!/proprietaire\|owner\|gerant/.test(source), 'la liste de rôles recopiée dans une expression régulière a disparu');
console.log(`  ✓ store-credit-role-rule: ${controls} contrôles`);
