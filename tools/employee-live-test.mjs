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
const TEAM_LIVE = await import(path.join(ROOT, 'functions/api/team/live.js'));
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
  members: [
    { id: 'mem-sara', firstName: 'Sara', lastName: 'Serveuse', email: 'sara@amira.test', function: 'Serveur', department: 'Salle', pinCode: '2468' },
    { id: 'mem-nora', firstName: 'Nora', lastName: 'Soir', email: 'nora@amira.test', function: 'Serveur', department: 'Salle', pinCode: '1357' },
  ],
  shifts: { 'mem-sara': { '2026-08-05': { start: '12:00', end: '20:00' } } },
  hours: { 'mem-sara': {} },
};
const floor = {
  zones: [{ id: 'z1', name: 'Salle' }],
  staff: [{ id: 'fs1', name: 'Sara Serveuse' }, { id: 'fs2', name: 'Nora Soir' }, { id: 'fs3', name: 'Aya Renfort' }],
  tables: [{ id: 't1', num: '1', zone: 'z1', type: 'round4', status: 'free', server: 'fs1', servers: ['fs1', 'fs2', 'fs3'] }],
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
const tillCookie = `kiwi_till=${await AUTH.tillToken(env.AUTH_SECRET, 'amira-cafe')}`;
async function teamLivePost(body) {
  return TEAM_LIVE.onRequestPost({ env, request: new Request('https://kiwi.test/api/team/live', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: tillCookie },
    body: JSON.stringify({ merchant: 'amira-cafe', ...body }),
  }) });
}
async function teamLiveGet() {
  return TEAM_LIVE.onRequestGet({ env, request: new Request('https://kiwi.test/api/team/live?merchant=amira-cafe', {
    headers: { Cookie: tillCookie },
  }) });
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
ok(JSON.stringify(state.floor.tables[0].servers) === JSON.stringify(['mem-sara', 'mem-nora', 'fs3'])
  && state.floor.tables[0].server === 'mem-sara',
  "les identifiants propres au plan sont résolus vers les vrais comptes employés");
const reassignedFloor = structuredClone(floor);
reassignedFloor.tables[0].server = 'tm-mem-nora';
reassignedFloor.tables[0].servers = ['tm-mem-nora'];
put("UPDATE store_docs SET data=?, rev=rev+1, updated_ts=? WHERE merchant='amira-cafe' AND feature='floorplan'",
  JSON.stringify(reassignedFloor), now + 1);
const reassignedRes = await get(cookie); const reassignedState = await reassignedRes.json();
ok(reassignedRes.status === 200
  && reassignedState.floor.tables[0].server === 'mem-nora'
  && JSON.stringify(reassignedState.floor.tables[0].servers) === JSON.stringify(['mem-nora']),
  "une nouvelle affectation du dashboard remplace l'ancienne au prochain rafraîchissement employé");
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

const remoteClock = await post({ action: 'clock-in' }, cookie);
ok(remoteClock.status === 403, "un pointage sans code actif de la caisse est refusé");
const generatedCodeResponse = await teamLivePost({ action: 'generate-attendance-code' });
const generatedCode = await generatedCodeResponse.json();
ok(generatedCodeResponse.status === 200 && /^\d{6}$/.test(generatedCode.code)
  && generatedCode.expiresTs > generatedCode.createdTs,
  'la caisse génère un code de pointage à six chiffres et limité dans le temps');
const cin = await post({ action: 'clock-in', attendanceCode: generatedCode.code }, cookie);
ok(cin.status === 200, 'le pointage d’arrivée est persisté');
const duringShiftReload = await get(cookie); const duringShiftState = await duringShiftReload.json();
ok(duringShiftReload.status === 200 && duringShiftState.attendance.open,
  'recharger pendant un service conserve la session et le pointage ouvert');
const att = sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance'").get();
const attDoc = JSON.parse(att.data);
attDoc.entries[0].inTs = Date.now() - 2 * 3600000;
put("UPDATE store_docs SET data=? WHERE merchant='amira-cafe' AND feature='attendance'", JSON.stringify(attDoc));
const selfPause = await post({ action: 'pause' }, cookie);
ok(selfPause.status === 403, "un employé ne peut pas s'accorder sa propre pause");
const liveBeforePause = await teamLiveGet(); const liveBeforeState = await liveBeforePause.json();
ok(liveBeforePause.status === 200 && liveBeforeState.members[0].status === 'on-duty',
  'la caisse lit le vrai pointage en cours, pas le roster sauvegardé');
const pause = await teamLivePost({ action: 'manager-pause', memberId: 'mem-sara' });
ok(pause.status === 200, 'la caisse donne la pause dans le pointage partagé');
const duringPause = await get(cookie); const pausedState = await duringPause.json();
ok(pausedState.colleagues[0].status === 'on-pause', "l'app employé reçoit immédiatement la pause décidée en caisse");
const message = await teamLivePost({ action: 'message', target: 'mem-sara', text: 'Passe au comptoir.' });
const afterMessage = await get(cookie); const messageState = await afterMessage.json();
ok(message.status === 200 && messageState.messages.some((item) => item.text === 'Passe au comptoir.'),
  "un message de la caisse arrive dans le centre de notifications de l'employé");
const pausedDoc = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance'").get().data);
pausedDoc.entries[0].pauseTs = Date.now() - 30 * 60000;
put("UPDATE store_docs SET data=? WHERE merchant='amira-cafe' AND feature='attendance'", JSON.stringify(pausedDoc));
const resume = await teamLivePost({ action: 'manager-resume', memberId: 'mem-sara' });
ok(resume.status === 200, 'la caisse termine la pause et ferme sa période');
const replacementCodeResponse = await teamLivePost({ action: 'generate-attendance-code' });
const replacementCode = await replacementCodeResponse.json();
const staleCodeOut = await post({ action: 'clock-out', attendanceCode: generatedCode.code }, cookie);
ok(replacementCode.code !== generatedCode.code && staleCodeOut.status === 403,
  'chaque clic caisse remplace immédiatement le code précédent');
const cout = await post({ action: 'clock-out', attendanceCode: replacementCode.code, progress: { paid: 9, revenue: 1200, turnMinutes: 270 } }, cookie);
ok(cout.status === 200, 'le pointage de sortie ferme le service');
const teamAfter = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='team'").get().data);
const day = Object.values(teamAfter.hours['mem-sara'])[0];
ok(day >= 1.49 && day <= 1.51, 'les heures pointées excluent la pause dans Paie & planning');
const historyState = await get(cookie); const history = await historyState.json();
ok(Object.values(history.pointedHours || {}).some((value) => value >= 1.49 && value <= 1.51),
  "l'employé conserve son historique vérifiable directement depuis les pointages");
ok(history.progress.lifetimeXP === 102 && history.progress.records.bestNight === 9
  && history.progress.records.bestSpeed === 30 && history.progress.records.streak === 1,
  'grade et records viennent du service réel et sont conservés dans le cloud');

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
const eventsSource = fs.readFileSync(path.join(ROOT, 'functions/api/service/events.js'), 'utf8');
ok(serviceSource.includes('Mes tables') && serviceSource.includes('Toutes les tables'), 'les deux vues de couverture restent visibles');
ok(serviceSource.includes('tableServerIds(t).includes(currentUser)')
  && serviceSource.includes('tableServerIds(tables[id]).includes(sid)'),
  'chaque employé retrouve une table dès que son identifiant figure parmi les trois affectés');
ok(serviceSource.includes('Pause gérée depuis la caisse')
  && !serviceSource.includes("KiwiEmployeeLive.pause()")
  && !serviceSource.includes("KiwiEmployeeLive.resume()"),
  "le profil employé affiche la pause sans permettre de se l'accorder");
ok(serviceSource.includes('id="employee-login"') && serviceSource.includes('KiwiEmployeeLive.login(email, pin)'),
  'le portail employé possède sa propre connexion email + PIN');
ok(serviceSource.includes('assets/employee-live.js?v=2'),
  "le pont live du portail est versionné pour qu'un ancien cache NFC ne puisse pas avaler le code caisse");
ok(serviceSource.includes('id="attendance-code"')
  && serviceSource.includes("prepareAttendanceGate('clock-out')")
  && serviceSource.includes('attendance-code-invalid'),
  'arrivée et départ passent par le code temporaire affiché dans la caisse');
ok(/openEmployeeSession[\s\S]*?data\.attendance && data\.attendance\.open[\s\S]*?shiftStart = new Date/.test(serviceSource),
  'un rechargement restaure le service ouvert au lieu de reconnecter ou repointer l’employé');
ok(!serviceSource.includes("location.replace('/dashboard?employee=1')"),
  "un échec de session reste dans le portail au lieu de rebondir vers le propriétaire");
ok(serviceSource.includes("localStorage.getItem('kiwiEmployeeMerchant') || localStorage.getItem('kiwiLiveMerchant')")
  && /openEmployeeSession[\s\S]*?svRebuildCarte\(\); svFetchCarte\(\)/.test(serviceSource),
  "la carte charge dès l'authentification depuis le magasin exact de l'employé");
ok(/function pollServiceSync\(\)[\s\S]*?svFetchCarte\(\)/.test(serviceSource),
  "les changements de carte du dashboard atteignent l'app employé pendant le service");
ok(/function pollServiceSync\(\)[\s\S]*?if \(window\.KiwiEmployeeLive\)/.test(serviceSource)
  && !serviceSource.includes('servicePlanTick % 3'),
  "équipe, planning et plan de salle se relisent sur la boucle Wi-Fi courte");
ok(serviceSource.includes("emoji: String(c.emoji || '')") && serviceSource.includes("v.emoji ? `${esc(v.emoji)} `"),
  "les emojis des options publiés par le dashboard restent visibles dans l'app employé");
ok(serviceSource.includes('data-tab="notifications"')
  && serviceSource.includes('id="notification-list"')
  && !serviceSource.includes('data-tab="paiement"')
  && serviceSource.includes('serviceNotifications.unshift'),
  'le troisième onglet est un centre de notifications avec historique, plus un raccourci paiement');
ok(serviceSource.includes('id="hours-history-modal"')
  && serviceSource.includes('liveEmployeeState.pointedHours')
  && serviceSource.includes('Aucune heure enregistrée pour ce mois.'),
  "l'employé peut contrôler chaque mois depuis le registre de pointage");
const challengeBlock = serviceSource.match(/const KG_DEFIS = \[([\s\S]*?)\n\s*\];/);
ok(challengeBlock && (challengeBlock[1].match(/metric:/g) || []).length >= 14
  && serviceSource.includes('kgDayNumber % KG_DEFIS.length'),
  'quatorze défis distincts tournent sans répétition pendant deux semaines');
ok(serviceSource.includes("lifetimeXP: 0")
  && serviceSource.includes("bestNight: 0")
  && !serviceSource.includes("lifetimeXP: 2400"),
  'un nouveau compte commence sans grade ni records de démonstration');
const caisseSource = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
ok(caisseSource.includes('function publishServiceFloor()')
  && caisseSource.includes("snapshot: { tables: live }")
  && serviceSource.includes('Object.keys(data.states || {})'),
  "les états ouverts, réglés et libérés remontent de la caisse vers l'app employé");
/* Ce contrôle portait sur la forme exacte `setInterval(pollEmployeeFloor, 1000)`.
   Le sondage est devenu adaptatif — la seconde reste la cadence de référence et
   ne s'espace que TANT QU'une socket temps réel est ouverte, auquel cas le
   changement arrive plus vite qu'avant, pas moins. On vérifie donc l'invariant
   (une seconde par défaut, relance automatique, amorce immédiate) plutôt que
   l'appel qui le portait. */
ok(caisseSource.includes('const FLOOR_POLL_FAST = 1000;')
  && caisseSource.includes('scheduleEmployeeFloor()')
  && /employeeFloorTimer = setTimeout\(/.test(caisseSource)
  && caisseSource.includes('live ? FLOOR_POLL_LIVE : FLOOR_POLL_FAST')
  && caisseSource.includes('setTimeout(pollEmployeeFloor, 250)'),
  'la caisse consomme les fermetures employé sans attendre un rechargement navigateur');
ok(caisseSource.includes('setInterval(pollLiveTeam, 1000)'),
  'la caisse reflète en direct les employés pointés, en pause et sortis');
ok(caisseSource.includes('id="open-attendance-code"')
  && caisseSource.includes("action: 'generate-attendance-code'")
  && caisseSource.includes('Valide encore'),
  'la caisse possède un bouton séparé qui régénère et chronomètre le code de pointage');
ok(teamSource.includes('data.pointedHours') && teamSource.includes('setInterval(pollLiveTeam, 1000)'),
  'Équipe et Paie & planning reçoivent les heures de pointage du cloud sans rechargement');
ok(serviceSource.includes('serviceStateVersion.has(id)')
  && serviceSource.includes('legacyBillState')
  && serviceSource.includes("source: 'legacy-cleanup'")
  && serviceSource.includes('SERVICE_BILL_SYNC_VERSION = 3')
  && serviceSource.includes('syncVersion: SERVICE_BILL_SYNC_VERSION')
  && eventsSource.includes('syncVersion: body.state.syncVersion')
  && caisseSource.includes('SERVICE_BILL_SYNC_VERSION = 3')
  && caisseSource.includes('syncVersion: SERVICE_BILL_SYNC_VERSION')
  && caisseSource.includes('serviceFloorLegacyTables')
  && caisseSource.includes('line.sent === true'),
  'un rechargement live ne restaure ni les tables démo ni leurs anciens états employés contaminés');
ok(serviceSource.includes("'a-commander':  'À commander'")
  && serviceSource.includes("t.status === 'a-commander' || t.status === 'ka-yaklo'")
  && /if \(action === 'take-order'\)[\s\S]*?t\.status = 'ka-yaklo'/.test(serviceSource),
  "une table installée affiche son statut et garde les actions commande / fermeture");
ok(!serviceSource.includes("const queueKey = 'order:' + order.id + ':' + index")
  && serviceSource.includes('lines: (tableOrders[id] || []).slice(0, 80)')
  && caisseSource.includes("state.source !== 'employee'")
  && caisseSource.includes('tableOrders[id] = cloudLines.map'),
  "l'addition courante circule dans les deux sens sans rejouer l'historique au rechargement");
ok(!/serviceEventSeen\.add\(event\.id\);\s*const id = serviceTableId/.test(serviceSource),
  "la notification de placement n'est pas marquée lue avant d'être affichée");
ok(serviceSource.includes('--app-height: 100dvh')
  && serviceSource.includes('height: var(--app-height)')
  && serviceSource.includes('--safe-bottom: max(env(safe-area-inset-bottom, 0px), 0px)')
  && serviceSource.includes('apple-mobile-web-app-capable'),
  "la hauteur et la barre mobile suivent le vrai écran et les zones sûres du téléphone");
const employeePwaSource = fs.readFileSync(path.join(ROOT, 'assets/employee-pwa.js'), 'utf8');
ok(employeePwaSource.includes('beforeinstallprompt') && employeePwaSource.includes('Installer l’app'),
  "le portail propose son installation sur l'écran d'accueil après connexion");

if (failures) process.exit(1);
console.log('\n✓ employee app live gate green');
