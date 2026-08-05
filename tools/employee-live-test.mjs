#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...v) { args = v; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
  },
};
const env = { DB, AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID() };
const API = await import(path.join(ROOT, 'functions/api/employee.js'));
const GATE = await import(path.join(ROOT, 'functions/_middleware.js'));

function put(sql, ...args) { sqlite.prepare(sql).run(...args); }
const now = Date.now();
put('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)',
  'amira-cafe', '{}', 'pro', 'restaurant', 'active', 'Amira Cafe', now);
put('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)',
  'voisin', '{}', 'pro', 'restaurant', 'active', 'Voisin', now);
put('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)',
  'pin-amira', 'amira-cafe', '2468', 'Sara Serveuse', 'Serveur', now);
put('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)',
  'pin-voisin', 'voisin', '1357', 'Autre Employé', 'Serveur', now);
const team = {
  members: [{ id: 'mem-sara', firstName: 'Sara', lastName: 'Serveuse', email: 'sara@amira.test', function: 'Serveur', department: 'Salle', pinCode: '2468' }],
  shifts: { 'mem-sara': { '2026-08-05': { start: '12:00', end: '20:00' } } },
  hours: { 'mem-sara': {} },
};
const floor = {
  zones: [{ id: 'z1', name: 'Salle' }], staff: [{ id: 'fs1', name: 'Sara Serveuse' }],
  tables: [{ id: 't1', num: '1', zone: 'z1', type: 'round4', status: 'free', server: 'fs1' }],
};
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', 'amira-cafe', 'team', JSON.stringify(team), 1, now);
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', 'amira-cafe', 'floorplan', JSON.stringify(floor), 1, now);

let failures = 0;
function ok(cond, label) { if (cond) console.log('  ✓ ' + label); else { failures++; console.log('  ✗ ' + label); } }
async function post(body, cookie = '') {
  return API.onRequestPost({ env, request: new Request('https://kiwi.test/api/employee', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  }) });
}
async function get(cookie) {
  return API.onRequestGet({ env, request: new Request('https://kiwi.test/api/employee', { headers: { Cookie: cookie } }) });
}

const bad = await post({ action: 'login', email: 'sara@amira.test', pin: '1111' });
ok(bad.status === 401, 'un code inconnu est refusé');
const pinOnly = await post({ action: 'login', merchant: 'amira-cafe', pin: '2468' });
ok(pinOnly.status === 401, "un PIN sans email n'ouvre plus l'app employé");
const cross = await post({ action: 'login', email: 'autre@voisin.test', pin: '2468' });
ok(cross.status === 401, "l'email et le code doivent appartenir au même employé");

async function gate(request) {
  return GATE.onRequest({ request, env: { ...env, SITE_PASSWORD: 'ancien-code-partage' }, next: () => new Response('next') });
}
const accessPage = await gate(new Request('https://kiwi.test/dashboard'));
const accessHtml = await accessPage.text();
ok(accessPage.status === 401 && accessHtml.includes('name="email"') && accessHtml.includes('name="pin"'),
  'Accès équipe demande email et code personnel');
ok(!accessHtml.includes('name="passcode"'), "l'ancien champ de code partagé a disparu");
const legacyForm = new URLSearchParams({ passcode: 'ancien-code-partage' });
const legacy = await gate(new Request('https://kiwi.test/__unlock', { method: 'POST', body: legacyForm }));
ok(legacy.status === 401 && !legacy.headers.get('set-cookie'), "l'ancien code équipe partagé ne crée plus de session");
const employeeForm = new URLSearchParams({ email: 'sara@amira.test', pin: '2468' });
const employeeAccess = await gate(new Request('https://kiwi.test/__unlock', { method: 'POST', body: employeeForm }));
ok(employeeAccess.status === 303 && employeeAccess.headers.get('location') === '/kiwi-serveur'
  && String(employeeAccess.headers.get('set-cookie') || '').includes('kiwi_employee='),
  'Accès équipe ouvre directement une session employé');

const login = await post({ action: 'login', email: '  SARA@AMIRA.TEST ', pin: '2468' });
const cookie = String(login.headers.get('set-cookie') || '').split(';')[0];
ok(login.status === 200 && cookie.startsWith('kiwi_employee='), "l'email et le PIN réels ouvrent une session employé httpOnly");
const stateRes = await get(cookie);
const state = await stateRes.json();
ok(stateRes.status === 200 && state.employee.id === 'mem-sara', 'le profil vient du roster cloud du magasin');
ok(state.floor.tables.length === 1 && state.floor.tables[0].num === '1', 'le plan de salle réel atteint l’app employé');
ok(!JSON.stringify(state).includes('Yassir'), 'aucune donnée de démonstration ne fuit dans la réponse live');

const cin = await post({ action: 'clock-in' }, cookie);
ok(cin.status === 200, 'le pointage d’arrivée est persisté');
const att = sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance'").get();
const attDoc = JSON.parse(att.data);
attDoc.entries[0].inTs = Date.now() - 2 * 3600000;
put("UPDATE store_docs SET data=? WHERE merchant='amira-cafe' AND feature='attendance'", JSON.stringify(attDoc));
const cout = await post({ action: 'clock-out' }, cookie);
ok(cout.status === 200, 'le pointage de sortie ferme le service');
const teamAfter = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='team'").get().data);
const day = Object.values(teamAfter.hours['mem-sara'])[0];
ok(day >= 1.99 && day <= 2.01, 'les heures pointées alimentent Paie & planning');

const anon = await get('');
ok(anon.status === 401, 'planning, collègues et salle restent privés sans session employé');

const teamSource = fs.readFileSync(path.join(ROOT, 'assets/team.js'), 'utf8');
ok(/name="email"[^>]*required/.test(teamSource), "l'email est obligatoire dans la fiche employé");

if (failures) process.exit(1);
console.log('\n✓ employee app live gate green');
