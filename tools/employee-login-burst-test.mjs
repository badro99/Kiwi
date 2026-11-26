// Connexion employé (e-mail + code) : une rafale ne passe pas le plafond (audit du 26 nov. 2026).
//
// Le contrôle lisait le compteur, comparait le code, puis écrivait la faute :
// 10 000 requêtes envoyées d'un coup passaient toutes la lecture avant qu'une
// seule faute soit écrite, et la bonne recevait une session kiwi_employee. Le
// compteur RÉSERVE maintenant l'essai avant la comparaison. Ce fichier envoie
// une rafale qui contient le bon code et vérifie qu'aucune session ne sort.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emp = await import(pathToFileURL(path.join(ROOT, 'functions/api/employee.js')).href);
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const stmt = (q, p = []) => {
    const st = db.prepare(q);
    return {
      bind(...b) { return stmt(q, b); },
      async first(col) { const r = st.get(...p); return r === undefined ? null : (col ? r[col] : r); },
      async all() { return { results: st.all(...p), meta: {} }; },
      async run() { const r = st.run(...p); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
  };
  return { env: { AUTH_SECRET: 'employee-burst-secret-0123456789-abc', DB: { prepare: (q) => stmt(q) } }, db };
}
const login = (env, pin, ip = '203.0.113.9') => emp.onRequestPost({ env, waitUntil() {}, request: new Request('https://kiwi-os.com/api/employee', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: 'https://kiwi-os.com' },
  body: JSON.stringify({ action: 'login', email: 'sam@shop.ma', pin }) }) });
const seed = (db, code) => {
  const now = Date.now();
  const members = [{ id: 'm1', firstName: 'Sam', lastName: 'L', email: 'sam@shop.ma', function: 'Serveur', pinCode: code, password: code, venueSlug: 'shop-a' }];
  db.prepare("INSERT INTO merchant_config (merchant, features, name, account_id, updated_ts) VALUES ('shop-a','{}','Shop A','acc-1',?)").run(now);
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('shop-a','employee-access',?,1,?)").run(JSON.stringify({ members }), now);
};
// A throwaway code made for this run, never a real one.
const code = String(1000 + Math.floor(Math.random() * 9000));

{
  const { env, db } = makeEnv();
  seed(db, code);
  const guesses = Array.from({ length: 300 }, (_, i) => String((Number(code) + 1 + i) % 10000).padStart(4, '0'));
  guesses.splice(200, 0, code);
  const results = await Promise.all(guesses.map((pin) => login(env, pin)));
  const statuses = results.map((r) => r.status);
  ok(!statuses.includes(200), `a 301-request burst holding the right code issues no session (${JSON.stringify(statuses.reduce((o, s) => ({ ...o, [s]: (o[s] || 0) + 1 }), {}))})`);
  ok(statuses.filter((s) => s === 401).length <= 8, 'at most the allowed number of guesses is ever compared');
  ok(results.every((r) => !(r.headers.getSetCookie() || []).some((c) => c.startsWith('kiwi_employee='))), 'no employee cookie leaves the burst');
}
{
  const { env, db } = makeEnv();
  seed(db, code);
  const wrong = String((Number(code) + 1) % 10000).padStart(4, '0');
  for (let i = 0; i < 3; i++) await login(env, wrong);
  const right = await login(env, code);
  ok(right.status === 200 && (right.headers.getSetCookie() || []).some((c) => c.startsWith('kiwi_employee=')), 'the right code after a few typos still signs in');
  const source = db.prepare('SELECT fails FROM pair_attempts ORDER BY fails DESC').all().map((r) => r.fails);
  ok(source.length && Math.max(...source) === 3, 'the success gives back its own reservation: only the three typos stay counted at the source');
}
{
  // A non-ASCII address is looked up through its ASCII part, never by reading every store's team.
  const { env, db } = makeEnv();
  const now = Date.now();
  for (let i = 0; i < 5; i++) db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,'team',?,1,?)").run('other-' + i, JSON.stringify({ members: [{ id: 'x' + i, email: 'x' + i + '@other.ma', pinCode: code }] }), now);
  db.prepare("INSERT INTO merchant_config (merchant, features, name, account_id, updated_ts) VALUES ('shop-e','{}','Shop E','acc-2',?)").run(now);
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('shop-e','employee-access',?,1,?)").run(JSON.stringify({ members: [{ id: 'e1', firstName: 'Élodie', email: 'élodie@shop-e.ma', function: 'Serveur', pinCode: code, password: code, venueSlug: 'shop-e' }] }), now);
  const seen = [];
  const prepare = env.DB.prepare;
  env.DB.prepare = (q) => { seen.push(q); return prepare(q); };
  const r = await emp.onRequestPost({ env, waitUntil() {}, request: new Request('https://kiwi-os.com/api/employee', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10', Origin: 'https://kiwi-os.com' },
    body: JSON.stringify({ action: 'login', email: 'Élodie@shop-e.ma', pin: code }) }) });
  ok(r.status === 200, 'an employee whose address is not ASCII still signs in');
  ok(!seen.some((q) => /FROM store_docs WHERE feature IN \('employee-access', 'team'\)\s*$/.test(q.trim())), 'and no query reads every store\'s team documents');
}
console.log(`✓ employee-login-burst-test : ${checks} contrôles (rafale plafonnée, aucune session, réussite qui rend sa réservation)`);
