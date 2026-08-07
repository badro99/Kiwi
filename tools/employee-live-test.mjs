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
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
};
const env = { DB, AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID() };
const API = await import(path.join(ROOT, 'functions/api/employee.js'));
const STORE = await import(path.join(ROOT, 'functions/api/store.js'));
const GATE = await import(path.join(ROOT, 'functions/_middleware.js'));
const AUTH = await import(path.join(ROOT, 'functions/auth/_lib.js'));

function put(sql, ...args) { sqlite.prepare(sql).run(...args); }
const now = Date.now();
put('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)',
  'amira-cafe', '{}', 'pro', 'restaurant', 'active', 'Amira Cafe', now);
put('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)',
  'voisin', '{}', 'pro', 'restaurant', 'active', 'Voisin', now);
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
ok(accessPage.status === 401 && accessHtml.includes('href="/kiwi-serveur"'),
  'Accès équipe ouvre directement le portail employé');
ok(!accessHtml.includes('id="staff-form"') && !accessHtml.includes('name="passcode"'),
  "la page propriétaire ne porte plus de formulaire employé ni l'ancien code partagé");
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
ok(!sqlite.prepare("SELECT 1 FROM staff_pins WHERE merchant='amira-cafe'").get(),
  "la connexion ne dépend pas d'une copie du code dans la caisse");
const stateRes = await get(cookie);
const state = await stateRes.json();
ok(stateRes.status === 200 && state.employee.id === 'mem-sara', 'le profil vient du roster cloud du magasin');
ok(state.floor.tables.length === 1 && state.floor.tables[0].num === '1', 'le plan de salle réel atteint l’app employé');
ok(!JSON.stringify(state).includes('Yassir'), 'aucune donnée de démonstration ne fuit dans la réponse live');

// A PIN roster can reach the cloud before the larger Team document. The small
// access mirror must be sufficient for login, and its exact replacement must
// revoke an existing session without accepting a stale Team fallback.
put('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)',
  'mirror-only', '{}', 'pro', 'restaurant', 'active', 'Mirror Only', now);
const mirror = { members: [{
  id: 'mem-mirror', firstName: 'Nora', lastName: 'Test', email: 'nora@mirror.test',
  function: 'Serveur', department: 'Salle', pinCode: '8642', venueSlug: 'mirror-only',
}] };
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)',
  'mirror-only', 'employee-access', JSON.stringify(mirror), 1, now);
const mirrorLogin = await post({ action: 'login', email: 'nora@mirror.test', pin: '8642' });
const mirrorCookie = String(mirrorLogin.headers.get('set-cookie') || '').split(';')[0];
ok(mirrorLogin.status === 200 && mirrorCookie.startsWith('kiwi_employee='),
  "le miroir d'accès suffit même si le document Équipe attend encore sa synchro");
put("UPDATE store_docs SET data=?, rev=rev+1 WHERE merchant='mirror-only' AND feature='employee-access'",
  JSON.stringify({ members: [] }));
const revoked = await get(mirrorCookie);
ok(revoked.status === 401, "retirer l'employé du miroir révoque immédiatement sa session");

// Saving Équipe and its smaller access mirror are two network requests. If the
// Team save lands last, that newer roster must admit the new hire instead of an
// older mirror hiding them forever. A later empty mirror still revokes access.
put('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)',
  'lag-store', '{}', 'pro', 'restaurant', 'active', 'Lag Store', now);
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)',
  'lag-store', 'employee-access', JSON.stringify({ members: [] }), 1, now - 1000);
const lagTeam = { members: [{
  id: 'mem-lin', firstName: 'Lin', lastName: 'Ilin', email: 'lin9@gmail.com',
  function: 'Serveur', department: 'Salle', password: '3535', venueSlug: 'lag-store',
}] };
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)',
  'lag-store', 'team', JSON.stringify(lagTeam), 1, now);
const lagLogin = await post({ action: 'login', email: 'lin9@gmail.com', pin: '3535' });
const lagCookie = String(lagLogin.headers.get('set-cookie') || '').split(';')[0];
ok(lagLogin.status === 200 && lagCookie.startsWith('kiwi_employee='),
  "un employé du roster Équipe plus récent n'est plus masqué par un ancien miroir");
const lagState = await get(lagCookie);
ok(lagState.status === 200, 'la session issue du roster récent reste valide dans le portail');
put("UPDATE store_docs SET data=?, rev=rev+1, updated_ts=? WHERE merchant='lag-store' AND feature='employee-access'",
  JSON.stringify({ members: [] }), now + 1000);
const lagRevoked = await get(lagCookie);
ok(lagRevoked.status === 401, 'un miroir plus récent conserve la révocation après la réparation');

// The Dashboard saves Équipe through /api/store. That one accepted write must
// create the private employee-login mirror atomically; a second fire-and-forget
// browser request is not allowed to decide whether the visible employee can
// actually sign in.
put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?,?)',
  'acc-sync', 'owner@sync.test', 'Owner', 'Sync Cafe', '00', '00', now, 'active');
put('INSERT INTO merchant_config (merchant,features,plan,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?,?)',
  'sync-cafe', '{}', 'pro', 'restaurant', 'active', 'Sync Cafe', 'acc-sync', now);
const syncTeam = { members: [{
  id: 'mem-sync', firstName: 'Aya', lastName: 'Serveuse', email: 'aya@sync.test',
  function: 'Serveur', department: 'Salle', password: '4242', venueSlug: 'sync-cafe',
}], hours: {}, shifts: {} };
const ownerSession = await AUTH.makeSession('acc-sync', env.AUTH_SECRET);
const syncSave = await STORE.onRequestPost({ env, request: new Request('https://kiwi.test/api/store', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: `kiwi_sess=${ownerSession}` },
  body: JSON.stringify({ feature: 'team', merchant: 'sync-cafe', baseRev: 0, data: syncTeam }),
}) });
const syncMirrorRow = sqlite.prepare("SELECT data FROM store_docs WHERE merchant='sync-cafe' AND feature='employee-access'").get();
const syncMirror = JSON.parse((syncMirrorRow && syncMirrorRow.data) || '{}');
ok(syncSave.status === 200 && syncMirror.members && syncMirror.members[0].email === 'aya@sync.test',
  "enregistrer Équipe crée le compte employé dans la même transaction cloud");
const syncedLogin = await post({ action: 'login', email: 'aya@sync.test', pin: '4242' });
ok(syncedLogin.status === 200,
  "l'employé peut se connecter dès que l'enregistrement Équipe est confirmé");
ok(AUTH.employeeRoleOpensTill('Caissier') && AUTH.employeeRoleOpensTill('Manager'),
  'caissier et manager gardent leur accès caisse');
ok(!AUTH.employeeRoleOpensTill('Serveur') && !AUTH.employeeRoleOpensTill('Cuisinier'),
  "serveur et cuisine gardent l'app employé sans ouvrir la caisse");

const cin = await post({ action: 'clock-in' }, cookie);
ok(cin.status === 200, 'le pointage d’arrivée est persisté');
const att = sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance'").get();
const attDoc = JSON.parse(att.data);
attDoc.entries[0].inTs = Date.now() - 2 * 3600000;
put("UPDATE store_docs SET data=? WHERE merchant='amira-cafe' AND feature='attendance'", JSON.stringify(attDoc));
const pause = await post({ action: 'pause' }, cookie);
ok(pause.status === 200, 'une pause est partagée avec les autres serveurs');
const duringPause = await get(cookie); const pausedState = await duringPause.json();
ok(pausedState.colleagues[0].status === 'on-pause', "l'équipe voit immédiatement le statut en pause");
const pausedDoc = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance'").get().data);
pausedDoc.entries[0].pauseTs = Date.now() - 30 * 60000;
put("UPDATE store_docs SET data=? WHERE merchant='amira-cafe' AND feature='attendance'", JSON.stringify(pausedDoc));
const resume = await post({ action: 'resume' }, cookie);
ok(resume.status === 200, 'reprendre ferme la période de pause');
const cout = await post({ action: 'clock-out' }, cookie);
ok(cout.status === 200, 'le pointage de sortie ferme le service');
const teamAfter = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='team'").get().data);
const day = Object.values(teamAfter.hours['mem-sara'])[0];
ok(day >= 1.49 && day <= 1.51, 'les heures pointées excluent la pause dans Paie & planning');

const anon = await get('');
ok(anon.status === 401, 'planning, collègues et salle restent privés sans session employé');

const teamSource = fs.readFileSync(path.join(ROOT, 'assets/team.js'), 'utf8');
ok(/name="email"[^>]*required/.test(teamSource), "l'email est obligatoire dans la fiche employé");
ok(teamSource.includes('`scoped:${String(venue.slug)}`')
  && teamSource.includes('slug: () => teamSlug()'),
  "Équipe synchronise aussi le bon magasin depuis un dashboard ouvert en God Mode");
const configSource = fs.readFileSync(path.join(ROOT, 'functions/api/config.js'), 'utf8');
ok(configSource.includes("'employee-access'") && configSource.includes('memberId'),
  'la synchronisation des PIN publie aussi les identifiants employés');
ok(configSource.includes('pinGateConfigured') && configSource.includes('employeeRoleOpensTill'),
  "un roster sans caissier reste verrouillé au lieu d'ouvrir la caisse");
const configClientSource = fs.readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8');
ok(configClientSource.includes('scopeConfirmed = true')
  && configClientSource.includes("v.id === 'scoped'")
  && configClientSource.includes('v.slug === urlScope'),
  "God Mode publie l'employé vers le slug confirmé du client, jamais vers un simple paramètre URL");
const serviceSource = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
ok(serviceSource.includes('Mes tables') && serviceSource.includes('Toutes les tables'), 'les deux vues de couverture restent visibles');
ok(serviceSource.includes('Prendre une pause') && serviceSource.includes('Reprendre le service'), 'le serveur contrôle sa pause depuis son profil');
ok(serviceSource.includes('id="employee-login"') && serviceSource.includes('KiwiEmployeeLive.login(email, pin)'),
  'le portail employé possède sa propre connexion email + PIN');
ok(!serviceSource.includes("location.replace('/dashboard?employee=1')"),
  "un échec de session reste dans le portail au lieu de rebondir vers le propriétaire");
const employeePwaSource = fs.readFileSync(path.join(ROOT, 'assets/employee-pwa.js'), 'utf8');
ok(employeePwaSource.includes('beforeinstallprompt') && employeePwaSource.includes('Installer l’app'),
  "le portail propose son installation sur l'écran d'accueil après connexion");

if (failures) process.exit(1);
console.log('\n✓ employee app live gate green');
