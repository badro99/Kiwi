#!/usr/bin/env node
/* Un magasin EN ATTENTE d'activation enregistre déjà sa configuration.
 *
 * L'assistant d'installation monte l'équipe, le plan de salle, les services,
 * les prix. Le serveur refusait toute écriture `store_docs` d'un magasin en
 * attente : ces fiches restaient sur l'appareil de l'installation et
 * manquaient partout ailleurs jusqu'à l'activation. Décision du propriétaire
 * (2026-10-13) : la configuration passe, depuis la session du compte
 * propriétaire seulement. Ce banc tient les deux moitiés : ce qui passe, et
 * tout ce qui reste fermé (opérations, caisse appairée, magasin suspendu). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestPost: storePost } = await import(path.join(ROOT, 'functions/api/store.js'));
const { tillToken, makeSession, sessionCookie } = await import(path.join(ROOT, 'functions/auth/_lib.js'));

let fails = 0, passed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  fails++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const AUTH_SECRET = 'pending-setup-secret-0123456789';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-p','o@pending.test','Pending Group','s','h',?,'active')`).run(now);
for (const [merchant, status] of [['setup-pending', 'pending'], ['setup-shut', 'suspended'], ['setup-active', 'active']]) {
  db.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','restaurant','acc-p',?,?,0,?)`)
    .run(merchant, merchant, status, now);
}

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
    catch (error) { try { db.exec('ROLLBACK'); } catch (_) {} throw error; }
  },
} };

const owner = sessionCookie(await makeSession('acc-p', AUTH_SECRET)).split(';')[0];
const tillPending = `kiwi_till=${await tillToken(AUTH_SECRET, 'setup-pending')}`;
const post = async (merchant, feature, data, cookie = owner) => {
  const res = await storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '10.0.0.9' },
    body: JSON.stringify({ feature, merchant, data, baseRev: 0 }) }), env });
  return res.status;
};
const stored = (merchant, feature) => !!db.prepare('SELECT 1 FROM store_docs WHERE merchant = ? AND feature = ?').get(merchant, feature);

console.log('■ Magasin en attente · la configuration passe, les opérations non');
const team = { members: [{ id: 'm1', firstName: 'Test', lastName: 'Setup', function: 'Serveur', department: 'Salle' }], hours: {}, shifts: {} };
let st = await post('setup-pending', 'team', team);
ok('le propriétaire enregistre l’équipe pendant l’installation (200)', st === 200 && stored('setup-pending', 'team'), 'status ' + st);
st = await post('setup-pending', 'floorplan', { rooms: [], tables: [{ id: 't1', n: 1 }], zones: [], objects: [] });
ok('…et le plan de salle (200)', st === 200 && stored('setup-pending', 'floorplan'), 'status ' + st);
st = await post('setup-pending', 'attendance', { entries: [] });
ok('le pointage reste fermé avant l’activation (401)', st === 401 && !stored('setup-pending', 'attendance'), 'status ' + st);
st = await post('setup-pending', 'payroll', { periods: [], list: [] });
ok('la paie reste fermée (401)', st === 401 && !stored('setup-pending', 'payroll'), 'status ' + st);
st = await post('setup-pending', 'retailcredit', { entries: [], seq: 0 });
ok('les avoirs et ardoises restent fermés (401)', st === 401, 'status ' + st);
st = await post('setup-pending', 'floorplan', { rooms: [], tables: [], zones: [], objects: [] }, tillPending);
ok('une caisse appairée n’écrit rien avant l’activation, même la configuration (401)', st === 401, 'status ' + st);
st = await post('setup-shut', 'team', team);
ok('un magasin suspendu n’écrit rien (401)', st === 401 && !stored('setup-shut', 'team'), 'status ' + st);
st = await post('setup-active', 'team', team);
ok('un magasin actif écrit comme avant (200)', st === 200, 'status ' + st);
st = await post('setup-active', 'attendance', { entries: [] });
ok('…opérations comprises (200)', st === 200, 'status ' + st);

console.log(fails ? `\n✗ ${fails} échec(s) sur ${passed + fails}` : `\n✓ ${passed} contrôles`);
process.exit(fails ? 1 : 0);
