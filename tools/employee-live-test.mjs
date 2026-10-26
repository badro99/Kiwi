#!/usr/bin/env node
import caisseWorkflowSource from './caisse-test-source.cjs';
import teamTestSource from './team-test-source.cjs';
import serveurTestSource from './serveur-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
import nativeFs from 'node:fs';
import queueCoreSource from './core-test-source.cjs';
const fs = { ...nativeFs, readFileSync: queueCoreSource.readFileSync };
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import queueTestSource from './queue-test-source.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
sqlite.exec(schema);
/* schema.sql déclare maintenant `timezone` ; l'ALTER ne sert que sur un schéma qui ne l'aurait pas. */
if (!sqlite.prepare("SELECT 1 FROM pragma_table_info('merchant_config') WHERE name = 'timezone'").get()) {
  sqlite.exec('ALTER TABLE merchant_config ADD COLUMN timezone TEXT');
}
const authMigration = fs.readFileSync(path.join(ROOT, 'migrations/legacy/2026-09-08-auth-session-revocation.sql'), 'utf8');
for (const statement of authMigration.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
  if (/^ALTER TABLE accounts ADD COLUMN session_epoch\b/i.test(statement)
      && /\bsession_epoch\b/i.test(schema)) continue;
  sqlite.exec(statement);
}
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
const API = await import(pathToFileURL(path.join(ROOT, 'functions/api/employee.js')).href);
const TEAM_LIVE = await import(pathToFileURL(path.join(ROOT, 'functions/api/team/live.js')).href);
const STORE = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const SALE = await import(pathToFileURL(path.join(ROOT, 'functions/api/sale.js')).href);
const FEED = await import(pathToFileURL(path.join(ROOT, 'functions/api/feed.js')).href);
const GATE = await import(pathToFileURL(path.join(ROOT, 'functions/_middleware.js')).href);
const AUTH = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

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
async function salePost(body, cookie) {
  return SALE.onRequestPost({ env, request: new Request('https://kiwi.test/api/sale', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  }) });
}
async function paidFeed(from) {
  return FEED.onRequestGet({ env, request: new Request(
    `https://kiwi.test/api/feed?merchant=amira-cafe&from=${from}`,
    { headers: { Cookie: tillCookie } },
  ) });
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
// The same UTC pointage belongs to different civil days in Auckland and
// Casablanca. Both the employee and manager APIs must key it to the store.
// 06:30 in Auckland, after the 05:00 business cutoff: the 27th there, the
// 26th in Casablanca.
const crossZoneTs = Date.parse('2026-09-26T18:30:00Z');
put("UPDATE merchant_config SET timezone='Pacific/Auckland' WHERE merchant='amira-cafe'");
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)',
  'amira-cafe', 'attendance', JSON.stringify({ entries:[{
    id:'tz-entry', staffId:'mem-sara', memberId:'mem-sara', inTs:crossZoneTs, outTs:crossZoneTs+3600000,
  }] }), 1, now);
const zonedEmployee = await (await get(cookie)).json();
const zonedManager = await (await teamLiveGet()).json();
ok(zonedEmployee.store.timezone === 'Pacific/Auckland' && zonedEmployee.pointedHours['2026-09-27'] === 1,
  'l’app employé reçoit le fuseau du magasin et date les heures dans ce fuseau');
ok(zonedManager.pointedHours['mem-sara']['2026-09-27'] === 1,
  'le dashboard date les heures pointées dans le même fuseau');
put("DELETE FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance'");
put("UPDATE merchant_config SET timezone=NULL WHERE merchant='amira-cafe'");
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

const leaveRequest = await post({ action:'planning-request', type:'leave', startDate:'2026-08-20', endDate:'2026-08-22', reason:'Voyage familial' }, cookie);
ok(leaveRequest.status === 200, "l'employé peut demander un congé depuis son application");
const availabilityRequest = await post({ action:'planning-request', type:'availability', weekdays:[1,3,5], available:true, start:'10:00', end:'18:00' }, cookie);
ok(availabilityRequest.status === 200, "l'employé peut envoyer ses disponibilités récurrentes");
const availabilityResult = await availabilityRequest.json();
const cancelPlanning = await post({ action:'planning-request-cancel', requestId:availabilityResult.requestId }, cookie);
ok(cancelPlanning.status === 200, "l'employé peut annuler sa demande tant qu'elle est en attente");
const forgedRequest = await post({ action:'planning-request', type:'leave', memberId:'mem-nora', startDate:'bad', endDate:'2026-08-22' }, cookie);
ok(forgedRequest.status === 400, "une demande invalide ne peut ni viser un collègue ni écrire une fausse date");
let planningDoc = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='team'").get().data);
ok(planningDoc.planning.requests.length === 2 && planningDoc.planning.requests.every((request) => request.memberId === 'mem-sara')
  && planningDoc.planning.requests[1].status === 'cancelled',
  'les demandes sont signées par la session et restent attachées au bon employé');
planningDoc.planning.requests[0].status = 'approved';
planningDoc.planning.publishingEnabled = true;
const futureSaraDay = '2099-08-12';
const futureNoraDay = '2099-08-14';
const futureFakeDay = '2099-08-19';
planningDoc.planning.publishedShifts = {
  'mem-sara': { [futureSaraDay]: { start:'10:00', end:'18:00' } },
  'mem-nora': { [futureNoraDay]: { start:'12:00', end:'20:00' } },
};
/* Un service « à venir » daté en dur cesse de l'être le jour où l'horloge le
   dépasse : la suite se casserait toute seule au changement de calendrier, sans
   qu'une ligne de code ait bougé.  Même convention que les jours publiés
   ci-dessus — l'avenir est en 2099, le passé reste un jour révolu pour de bon. */
const futureOpenDay = '2099-08-13';
const pastOpenDay = '2020-08-01';
planningDoc.planning.openShifts = [
  { id:'open-1', day:futureOpenDay, start:'10:00', end:'18:00', role:'Serveur', note:'Renfort terrasse', status:'open', claimantId:'' },
  { id:'open-cuisine', day:futureOpenDay, start:'10:00', end:'18:00', role:'Cuisine', note:'Préparation', status:'open', claimantId:'' },
  { id:'open-past', day:pastOpenDay, start:'10:00', end:'18:00', role:'Serveur', status:'open', claimantId:'' },
];
planningDoc.planning.swapRequests = [];
planningDoc.planning.notices = [{ id:'notice-1', memberId:'mem-sara', type:'schedule-published', periodKey:'2026-08-10..2026-08-16', createdAt:'2026-08-01T10:00:00Z' }];
put("UPDATE store_docs SET data=?, rev=rev+1 WHERE merchant='amira-cafe' AND feature='team'", JSON.stringify(planningDoc));
const publishedStateRes = await get(cookie); const publishedState = await publishedStateRes.json();
ok(publishedState.schedule[futureSaraDay].start === '10:00' && !publishedState.schedule['2026-08-05'],
  "après la première publication, l'app employé ne voit que le planning publié");
ok(publishedState.planning.requests.length === 2 && publishedState.planning.requests[0].status === 'approved',
  "l'employé voit la décision du responsable sans accéder aux demandes des autres");
ok(publishedState.planning.openShifts.length === 1 && publishedState.planning.notices.length === 1,
  "l'app expose seulement les services futurs correspondant à la fonction de l'employé");
const wrongRoleClaim = await post({ action:'planning-open-shift-claim', shiftId:'open-cuisine' }, cookie);
ok(wrongRoleClaim.status === 409, "un service d'une autre fonction ne peut pas être réclamé par appel direct");
const pastClaim = await post({ action:'planning-open-shift-claim', shiftId:'open-past' }, cookie);
ok(pastClaim.status === 409, "un ancien service ne peut pas être réclamé après sa date");
const claimOpen = await post({ action:'planning-open-shift-claim', shiftId:'open-1', memberId:'mem-nora' }, cookie);
ok(claimOpen.status === 200, "un employé peut candidater à un service ouvert correspondant à sa fonction");
let afterClaim = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='team'").get().data);
ok(afterClaim.planning.openShifts[0].claimantId === 'mem-sara', "la candidature est signée par la session, jamais par un identifiant fourni");
const cancelOpen = await post({ action:'planning-opportunity-cancel', shiftId:'open-1' }, cookie);
afterClaim = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='team'").get().data);
ok(cancelOpen.status === 200 && afterClaim.planning.openShifts[0].status === 'open', "la candidature peut être retirée avant décision");
const swapRequest = await post({ action:'planning-swap-request', day:futureSaraDay }, cookie);
const swapResult = await swapRequest.json();
ok(swapRequest.status === 200 && swapResult.id, "un employé peut proposer l'échange d'un service réellement publié");
const fakeSwap = await post({ action:'planning-swap-request', day:futureFakeDay }, cookie);
ok(fakeSwap.status === 409, "un service absent du planning publié ne peut pas être proposé");
const noraLogin = await post({ action:'login', email:'nora@amira.test', pin:'1357' });
const noraCookie = String(noraLogin.headers.get('set-cookie') || '').split(';')[0];
const claimSwap = await post({ action:'planning-swap-claim', requestId:swapResult.id, offeredDay:futureNoraDay, offeredMemberId:'mem-sara' }, noraCookie);
ok(claimSwap.status === 200, "un collègue peut proposer l'un de ses propres services en échange");
const afterSwap = JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='team'").get().data);
const swapStored = afterSwap.planning.swapRequests.find((item)=>item.id===swapResult.id);
ok(swapStored.claimantId === 'mem-nora' && swapStored.offeredDay === futureNoraDay, "l'offre d'échange reste attachée au collègue authentifié");
const secondClaim = await post({ action:'planning-swap-claim', requestId:swapResult.id, offeredDay:futureSaraDay }, cookie);
ok(secondClaim.status === 409, "une offre déjà prise ne peut pas recevoir une seconde candidature concurrente");

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

// Financial parity simulation: an editable employee order must remain outside
// the immutable sales ledger. The one acknowledged settlement is then the
// single row read by dashboard AND caisse, complete with its frozen basket.
const ledgerNow = Date.now();
put(`INSERT INTO table_sessions
  (id,merchant,mode,table_no,status,closed_by,opened_ts,seen_ts)
  VALUES (?,?,?,?,?,?,?,?)`,
  'tsx-employee-ledger', 'amira-cafe', 'table', '99', 'open', '', ledgerNow - 60000, ledgerNow);
put(`INSERT INTO orders
  (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id,server_name,channel)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  'ord-employee-ledger', 'amira-cafe', 990, 'table', '99', 85,
  JSON.stringify([{ id: 'tajine-kefta', name: 'Tajine kefta œuf', qty: 1, unitPrice: 85 }]),
  'served', ledgerNow - 30000, ledgerNow - 30000, 'tsx-employee-ledger', 'Sara Serveuse', 'kiwi');
const beforeEmployeePayment = await paidFeed(ledgerNow - 120000);
const beforeEmployeeRows = await beforeEmployeePayment.json();
ok(beforeEmployeePayment.status === 200 && beforeEmployeeRows.sales.length === 0,
  "une commande employé encore modifiable n'entre pas dans les ventes");
const employeePaymentBody = {
  merchant: 'amira-cafe', table: '99', session: 'tsx-employee-ledger',
  amount: 85, method: 'cash', ts: ledgerNow, label: 'SB-PARITY', ref: 'SB-PARITY',
  channel: 'dining',
  lines: [{ itemId: 'tajine-kefta', name: 'Tajine kefta œuf', qty: 1, total: 85, cat: 'Plats' }],
};
const employeePayment = await salePost(employeePaymentBody, cookie);
ok(employeePayment.status === 200,
  "le paiement final de l'app employé est acquitté par le journal financier partagé");
const afterEmployeePayment = await paidFeed(ledgerNow - 120000);
const afterEmployeeRows = await afterEmployeePayment.json();
const mirroredEmployeeSale = afterEmployeeRows.sales[0];
ok(afterEmployeePayment.status === 200 && afterEmployeeRows.sales.length === 1
  && mirroredEmployeeSale.amount === 85
  && mirroredEmployeeSale.orderRef === 'SB-PARITY'
  && mirroredEmployeeSale.server === 'Sara Serveuse'
  && mirroredEmployeeSale.lines[0].name === 'Tajine kefta œuf',
  'dashboard et caisse relisent la même vente employé, son serveur et ses articles');
await salePost(employeePaymentBody, cookie);
const afterEmployeeRetry = await paidFeed(ledgerNow - 120000);
const afterEmployeeRetryRows = await afterEmployeeRetry.json();
const settledEmployeeOrder = sqlite.prepare("SELECT paid_ts FROM orders WHERE id='ord-employee-ledger'").get();
ok(afterEmployeeRetryRows.sales.length === 1 && Number(settledEmployeeOrder.paid_ts) > 0,
  'un nouvel envoi du même paiement reste idempotent et la commande devient payée une seule fois');

put(`INSERT INTO table_sessions
  (id,merchant,mode,table_no,status,closed_by,opened_ts,seen_ts)
  VALUES (?,?,?,?,?,?,?,?)`,
  'tsx-employee-split', 'amira-cafe', 'table', '98', 'open', '', ledgerNow - 20000, ledgerNow);
put(`INSERT INTO orders
  (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id,server_name,channel)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  'ord-employee-split', 'amira-cafe', 980, 'table', '98', 90, '[]', 'served',
  ledgerNow - 10000, ledgerNow - 10000, 'tsx-employee-split', 'Sara Serveuse', 'kiwi');
for (const [index, amount, method] of [[0, 35, 'cash'], [1, 55, 'card']]) {
  const response = await salePost({
    merchant: 'amira-cafe', table: '98', session: 'tsx-employee-split',
    split: { index, count: 2 }, amount, amountCents: amount * 100, method,
    ts: ledgerNow, label: `SB-SPLIT · Part ${index + 1}`, ref: `SB-SPLIT · Part ${index + 1}`,
  }, cookie);
  ok(response.status === 200, `la part ${index + 1} est acquittée par le grand livre`);
}
const splitFeedResponse = await paidFeed(ledgerNow - 120000);
const splitFeedRows = (await splitFeedResponse.json()).sales
  .filter(row => String(row.id).startsWith('visit-tsx-employee-split-split-'));
ok(splitFeedRows.length === 2
  && splitFeedRows.every(row => row.server === 'Sara Serveuse'
    && row.origin === 'employee' && row.channel === 'dining'),
  'les parts gardent le serveur, la surface et le canal de leur visite dans le flux financier');

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

const teamSource = teamTestSource();
ok(teamSource.includes('function fmtHours(value)')
  && teamSource.includes('Math.round((Number(value) || 0) * 60)')
  && teamSource.includes('value="${esc(fmtHours(v))}"')
  && teamSource.includes('input.value = fmtHours(input.dataset.hoursValue)')
  && !teamSource.includes("total.toFixed(2).replace('.', ',')"),
  'Paie affiche les heures pointées en heures et minutes, sans décimales ambiguës comme 0,61 h');
ok(/edInput\('email', 'email', m\.email, T\.ph\.email, 'required /.test(teamSource)
  && /\['firstName', 'lastName', 'email', 'function'\]\.forEach/.test(teamSource),
  "l'email est obligatoire dans la fiche employé");
ok(teamSource.includes('`scoped:${String(venue.slug)}`')
  && teamSource.includes('slug: () => teamSlug()'),
  "Équipe synchronise aussi le bon magasin depuis un dashboard ouvert en God Mode");
const configSource = fs.readFileSync(path.join(ROOT, 'functions/api/config.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'functions/api/_staff-publication.js'), 'utf8');   // POST /api/config publishes staff codes through it
ok(configSource.includes("'employee-access'") && configSource.includes('memberId'),
  'la synchronisation des PIN publie aussi les identifiants employés');
ok(configSource.includes('pinGateConfigured') && configSource.includes('employeeRoleOpensTill'),
  "un roster sans caissier reste verrouillé au lieu d'ouvrir la caisse");
const configClientSource = fs.readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8');
ok(configClientSource.includes('scopeConfirmed = true')
  && configClientSource.includes("v.id === 'scoped'")
  && configClientSource.includes('v.slug === urlScope'),
  "God Mode publie l'employé vers le slug confirmé du client, jamais vers un simple paramètre URL");
const serviceSource = serveurTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8'))
  + '\n' + fs.readFileSync(path.join(ROOT, 'assets/serveur-shell.css'), 'utf8');
const employeePlanningSource = fs.readFileSync(path.join(ROOT, 'assets/employee-planning.js'), 'utf8');
const eventsSource = fs.readFileSync(path.join(ROOT, 'functions/api/service/events.js'), 'utf8');
const queueSource = queueTestSource();
ok(serviceSource.includes('Mes tables') && serviceSource.includes('Toutes les tables'), 'les deux vues de couverture restent visibles');
ok(serviceSource.includes('id="table-filters"')
  && serviceSource.includes("activeFilter = btn.dataset.filter")
  && serviceSource.includes('filterMatches(tables[id])'),
  'les filtres de statut servent vraiment à réduire la liste des tables');
ok(serviceSource.includes('function zoneDisplayLabel(table)')
  && serviceSource.includes("terrasse:'Terrasse'")
  && serviceSource.includes("etage:'Étage'"),
  'les zones sans libellé ne se transforment plus toutes en Salle');
ok(serviceSource.includes('s.setAttribute(\'aria-hidden\', active ? \'false\' : \'true\')')
  && serviceSource.includes('s.inert = !active'),
  "un lecteur d'écran ne parcourt plus les écrans inactifs");
ok(serviceSource.includes("const isEditable = (t.status === 'a-commander' || t.status === 'ka-yaklo')")
  && serviceSource.includes('Envoyez d’abord les modifications')
  && serviceSource.includes('disabled aria-disabled="true"'),
  "une addition demandée ne peut plus être modifiée puis encaissée avant l'envoi en cuisine");
ok(serviceSource.includes('tableServerIds(t).includes(currentUser)')
  && serviceSource.includes('tableServerIds(tables[id]).includes(sid)'),
  'chaque employé retrouve une table dès que son identifiant figure parmi les trois affectés');
ok(serviceSource.includes('Pause gérée depuis la caisse')
  && !serviceSource.includes("KiwiEmployeeLive.pause()")
  && !serviceSource.includes("KiwiEmployeeLive.resume()"),
  "le profil employé affiche la pause sans permettre de se l'accorder");
ok(serviceSource.includes('id="employee-login"') && serviceSource.includes('KiwiEmployeeLive.login(email, pin)'),
  'le portail employé possède sa propre connexion email + PIN');
/* Le contrôle porte sur l'accord entre la coquille et le service worker, pas sur
   un numéro figé : épinglé, il retombait en rouge à chaque génération de cache
   alors que le pont était juste. La coquille et le précache doivent demander le
   même fichier, sinon un ancien cache NFC ressert l'ancien pont. */
/* La règle valait déjà pour employee-live.js, mais les deux autres restaient
   épinglés à un numéro en dur — ce qui fait retomber le contrôle en rouge au
   premier bump légitime, précisément le travers que le commentaire ci-dessus
   décrit. On applique donc la même règle aux trois.
   On vérifie l'ACCORD, pas la simple présence : se contenter de « une
   estampille existe » rendrait le contrôle aveugle au seul défaut qu'il
   surveille — une coquille et un précache qui demandent deux fichiers
   différents. */
const swSource = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
const bridgeStamps = ['employee-live', 'employee-planning', 'pwa-update'].map((asset) => {
  const re = new RegExp(`${asset}\\.js\\?v=(\\d+)`);
  const sw = (swSource.match(re) || [])[1] || '';
  const shell = (serviceSource.match(re) || [])[1] || '';
  return { asset, sw, shell, agrees: !!sw && sw === shell };
});
ok(bridgeStamps.every((s) => s.agrees),
  "le pont live du portail est versionné pour qu'un ancien cache NFC ne puisse pas avaler le code caisse"
  + bridgeStamps.filter((s) => !s.agrees).map((s) => ` [${s.asset}: coquille=${s.shell || '—'} sw=${s.sw || '—'}]`).join(''));
ok(employeePlanningSource.includes("requestPlanning(body)")
  && employeePlanningSource.includes("cancelPlanningRequest")
  && employeePlanningSource.includes("@media(max-width:600px)"),
  "le portail employé propose les demandes et leur annulation dans une feuille adaptée au téléphone");
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
  && serviceSource.includes('dayNumber % KG_DEFIS.length')
  && serviceSource.includes("Date.parse(employeeDayKey() + 'T12:00:00Z')"),
  'quatorze défis distincts tournent sans répétition pendant deux semaines');
ok(serviceSource.includes("lifetimeXP: 0")
  && serviceSource.includes("bestNight: 0")
  && !serviceSource.includes("lifetimeXP: 2400"),
  'un nouveau compte commence sans grade ni records de démonstration');
const caisseSource = caisseTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
const dispatchSource = fs.readFileSync(path.join(ROOT, 'assets/pos-dispatch.js'), 'utf8');
const attendanceCodeSource = fs.readFileSync(path.join(ROOT, 'assets/caisse-refresh.js'), 'utf8');
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
  && caisseSource.includes('setTimeout(pollEmployeeFloor, 250)')
  && caisseSource.includes('if (serviceFloorPolling) { serviceFloorPollQueued = true; return; }')
  && caisseSource.includes('if (serviceFloorPollQueued)')
  && caisseSource.includes('if (stateTs && stateTs <= lastRemoteTs) return;')
  && caisseSource.includes("state.source !== 'employee' && state.source !== 'guest'")
  && !caisseSource.includes('stateTs <= Number(serviceFloorLocalVersion[String(id)] || 0)'),
  'la caisse consomme les fermetures employé sans attendre un rechargement navigateur');
ok(caisseSource.includes('terminalHadLocalBill')
  && caisseSource.includes('if (!statusChanged && !terminalHadLocalBill) return;')
  && caisseSource.includes("serviceFloorSignature = ''")
  && caisseSource.includes('setTimeout(publishServiceFloor, 0)')
  && eventsSource.includes('operationalAwaitingAck')
  && !eventsSource.includes('EMPLOYEE_CLOSE_GRACE_MS'),
  "le paiement efface aussi une ancienne addition locale et reste terminal jusqu'à l'acquittement caisse");
const liveSocketSource = fs.readFileSync(path.join(ROOT, 'assets/live-socket.js'), 'utf8');
ok(liveSocketSource.includes('window.KiwiLiveSocket = {')
  && !liveSocketSource.includes('window.KiwiLive = {')
  && caisseSource.includes("KiwiLiveSocket.on(slug, 'caisse', pollEmployeeFloor)")
  && caisseSource.includes('window.KiwiLiveSocket && KiwiLiveSocket.live()')
  && serviceSource.includes("KiwiLiveSocket.on(merchant, 'service', pollServiceSync)")
  && serviceSource.includes('window.KiwiLiveSocket && KiwiLiveSocket.live()'),
  'la socket de réveil ne remplace jamais le journal KiwiLive ni sa boucle automatique');
function exerciseColdSocketRecovery(source) {
  let timerId = 0;
  const timers = new Map();
  const sockets = [];
  const onlineHandlers = [];
  const visibilityHandlers = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; sockets.push(this); }
    send() {}
    close() {}
  }
  const document = {
    visibilityState: 'visible',
    addEventListener(type, fn) {
      if (type === 'visibilitychange') visibilityHandlers.push(fn);
    },
  };
  const window = {
    addEventListener(type, fn) {
      if (type === 'online') onlineHandlers.push(fn);
    },
  };
  const context = {
    window, document, WebSocket: FakeWebSocket,
    location: { protocol: 'https:', host: 'kiwi.test' },
    encodeURIComponent,
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return ++timerId; },
    clearInterval() {},
  };
  vm.runInNewContext(source, context);
  window.KiwiLiveSocket.on('amira-cafe', 'caisse', () => {});

  const failCurrent = () => sockets[sockets.length - 1].onclose();
  const runNextRetry = () => {
    const next = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0];
    if (!next) return null;
    timers.delete(next[0]);
    next[1].fn();
    return next[1].delay;
  };
  failCurrent(); runNextRetry();
  failCurrent(); runNextRetry();
  failCurrent();
  const coldDelay = [...timers.values()].map((entry) => entry.delay).sort((a, b) => b - a)[0] || 0;
  const beforeOnline = sockets.length;
  onlineHandlers.forEach((fn) => fn());
  return {
    coldDelay,
    onlineOpened: sockets.length === beforeOnline + 1,
    visibilityWired: visibilityHandlers.length > 0,
  };
}
const coldSocketRecovery = exerciseColdSocketRecovery(liveSocketSource);
ok(coldSocketRecovery.coldDelay >= 60000,
  'trois refus à froid passent sur un repli long au lieu de tuer la socket pour la page');
ok(coldSocketRecovery.onlineOpened && coldSocketRecovery.visibilityWired,
  'le retour réseau et le retour au premier plan relancent immédiatement la socket froide');
ok(caisseSource.includes('const LIVE_TEAM_VISIBLE_MS = 5000, LIVE_TEAM_HIDDEN_MS = 30000;')
  && caisseSource.includes('document.hidden ? LIVE_TEAM_HIDDEN_MS : LIVE_TEAM_VISIBLE_MS')
  && caisseSource.includes('if (!document.hidden) pollLiveTeam();')
  && !caisseSource.includes('setInterval(pollLiveTeam, 1000)'),
  'la caisse reflète les employés pointés, en pause et sortis (5 s à l’écran, 30 s en arrière-plan, tout de suite au retour)');
ok(caisseSource.includes('function startEmployeeSaleJournalSync()')
  && caisseSource.includes('function ingestSettledCloudSales(sales)')
  && caisseSource.includes('function syncSettledBusinessDay()')
  && caisseSource.includes('if (!sale || !(Number(sale.amount) > 0)) return;')
  && caisseSource.includes('reconcileCloudSaleInJournal(sale)')
  && caisseSource.includes('String(entry.serverSaleId || \'\') === saleId')
  && caisseSource.includes("'&from=' + from")
  && caisseSource.includes('KiwiLive.watchFeed(ingestSettledCloudSales)')
  && caisseSource.includes('saleTs < shiftOpenedAt.getTime()')
  && caisseSource.includes('const from = shiftOpenedAt.getTime()')
  && caisseSource.includes('journal.push(entry)')
  && caisseSource.includes('saveProvisional(true)'),
  "un paiement téléphone rejoint une seule fois le journal du service caisse avec ses lignes");
ok(/function doOpenService\(\)[\s\S]*?shiftOpenedAt = [\s\S]*?startEmployeeSaleJournalSync\(\)/.test(caisseSource)
  && caisseSource.includes('if (shiftOpenedAt) startEmployeeSaleJournalSync();')
  && caisseSource.includes('feed only contains SETTLED sales')
  && serviceSource.includes('if (hasUnsent || dirtyOrders.has(id))')
  && serviceSource.includes("await fetch('/api/sale'")
  && serviceSource.includes('if (!response.ok || !saved || !saved.ok) throw'),
  "le miroir financier démarre après ouverture/reprise et n'importe que les commandes définitivement payées");
ok(caisseSource.includes("label: String(sale.orderRef || sale.label || 'Vente')")
  && caisseSource.includes('cashier: String(sale.server || sourceLabel)')
  && caisseSource.includes("origin === 'employee' ? 'App employé'")
  && caisseSource.includes('if (e.origin)          entry.origin   = e.origin')
  && caisseSource.includes('if (e.channel)         entry.channel  = e.channel'),
  "le journal restauré conserve la référence, le serveur, la source et le canal du paiement");
ok(caisseSource.includes('function renderResume(r)')
  && caisseSource.includes('function renderItems(r)')
  && caisseSource.includes("if (rpTab === 'resume') renderResume(r)")
  && caisseSource.includes("else if (rpTab === 'items') renderItems(r)")
  && caisseSource.includes("rpTab = b.dataset.rpTab"),
  "Résumé et Ventes par article sont de vrais lecteurs du journal financier partagé");
ok(caisseSource.includes('id="open-attendance-code"')
  && caisseSource.includes("action: 'generate-attendance-code'")
  && caisseSource.includes('Valide encore'),
  'la caisse possède un bouton séparé qui régénère et chronomètre le code de pointage');
ok(/assets\/caisse-refresh\.js\?v=\d+/.test(caisseSource)
  && dispatchSource.includes('window.KiwiCaisseAttendanceCode.mount(root)')
  && attendanceCodeSource.includes("action: 'generate-attendance-code'")
  && attendanceCodeSource.includes('button[id$="-lock"]')
  && attendanceCodeSource.includes("localStorage.getItem('kiwiPairedVenue')")
  && attendanceCodeSource.includes('data.merchant === id'),
  'toutes les caisses métier génèrent le même code de pointage, isolé sur leur magasin appairé');
/* La seconde reste la cadence de la page Équipe/Paie, mais elle ne peut plus être
 * un setInterval global : sur les autres pages du tableau de bord, ce battement
 * faisait une requête et une réécriture localStorage par seconde pour personne.
 * On exige donc la cadence rapide ET le fait qu'elle se lève quand la page sort
 * de l'écran ou que l'onglet passe en arrière-plan. */
ok(teamSource.includes('data.pointedHours')
  && teamSource.includes('LIVE_TEAM_FAST_MS = 1000')
  && teamSource.includes('Math.max(pageActive ? LIVE_TEAM_FAST_MS : LIVE_TEAM_IDLE_MS, liveTeamDelay)')
  && teamSource.includes('if (hidden) return;')
  && teamSource.includes("document.addEventListener('visibilitychange', wakeTeam)")
  && !teamSource.includes('setInterval(pollLiveTeam, 1000)'),
  'Équipe et Paie & planning reçoivent les heures de pointage du cloud sans rechargement');
ok(serviceSource.includes('serviceStateVersion.has(id)')
  && serviceSource.includes('legacyBillState')
  && serviceSource.includes("source: 'legacy-cleanup'")
  && serviceSource.includes('SERVICE_BILL_SYNC_VERSION = 4')
  && serviceSource.includes('syncVersion: SERVICE_BILL_SYNC_VERSION')
  && eventsSource.includes('syncVersion: body.state.syncVersion')
  && caisseSource.includes('SERVICE_BILL_SYNC_VERSION = 4')
  && caisseSource.includes('syncVersion: SERVICE_BILL_SYNC_VERSION')
  && caisseSource.includes('serviceFloorLegacyTables')
  && caisseSource.includes('line.sent === true'),
  'un rechargement live ne restaure ni les tables démo ni leurs anciens états employés contaminés');
ok(serviceSource.includes("'a-commander':  'À commander'")
  && serviceSource.includes("t.status === 'a-commander' || t.status === 'ka-yaklo'")
  && /if \(action === 'take-order'\)[\s\S]*?t\.status = 'ka-yaklo'/.test(serviceSource),
  "une table installée affiche son statut et garde les actions commande / fermeture");
ok(serviceSource.includes('function reconcileCanonicalServiceBill(table)')
  && serviceSource.includes('serviceCanonicalOrders.set(order.id')
  && serviceSource.includes('line.sourceLocal === true')
  && serviceSource.includes('sourceCanonical: true')
  && caisseSource.includes('Employee snapshots synchronize OCCUPANCY, never the bill.')
  && !caisseSource.includes('tableOrders[id] = cloudLines.map'),
  "la file des commandes est l'unique source des articles; les snapshots ne peuvent plus fabriquer une addition");
ok(queueSource.includes('ensureServiceTableSession')
  && queueSource.includes('client_ref, session_id')
  /* Une table peut porter DEUX visites ouvertes quand l'index unique partiel
     manque à la base déployée. Le filtre garde donc un ensemble par table, au
     lieu d'un seul identifiant qui écrasait l'autre et effaçait de l'écran les
     commandes du serveur perdant. La règle vérifiée ici ne change pas : une
     commande n'appartient qu'aux visites OUVERTES de sa table. */
  && queueSource.includes('openVisitsByTable')
  && queueSource.includes('visits.has(String(order.session))')
  && caisseSource.includes('ORDER_BRIDGE_SYNC_VERSION = 2')
  && caisseSource.includes('orderSession: String(o.session')
  && caisseSource.includes('String(activeSeat.session) !== String(o.session)'),
  "chaque commande employé appartient à une visite de table unique; une ancienne addition ne peut pas rejoindre la suivante");
ok(serviceSource.includes("uid: 'order-' + order.id + '-' + index")
  && serviceSource.includes("cloudKey: 'order:' + order.id + ':' + index")
  && serviceSource.includes('Object.keys(tables).forEach((table) => reconcileCanonicalServiceBill(table))'),
  "un changement prêt/servi reconstruit les mêmes lignes canoniques au lieu d'en ajouter");
ok(serviceSource.includes('The new visit has no order yet, so nothing legitimate is lost.')
  && serviceSource.includes('serviceCanonicalOrders.delete(orderId)'),
  "ouvrir une nouvelle visite vide le cache canonique de la visite précédente");
ok(caisseSource.includes("startsWith('employee-')")
  && caisseSource.includes('saved.tableOrders[id] = (saved.tableOrders[id] || []).filter'),
  "la migration v4 retire une fois les factures employé v3 déjà contaminées dans la caisse");
ok(!/serviceEventSeen\.add\(event\.id\);\s*const id = serviceTableId/.test(serviceSource),
  "la notification de placement n'est pas marquée lue avant d'être affichée");
ok(serviceSource.includes('function clearEmployeeOperationalState()')
  && serviceSource.includes('serviceDraftTimers.forEach((timer) => clearTimeout(timer))')
  && serviceSource.includes('Object.keys(tableOrders).forEach((id) => delete tableOrders[id])')
  && /function resetToEmployeePortal[\s\S]*?clearEmployeeOperationalState\(\)/.test(serviceSource)
  && /function logoutEmployeeSession[\s\S]*?clearEmployeeOperationalState\(\)/.test(serviceSource),
  "changer de compte annule les uploads différés et efface l'addition mémoire de l'employé précédent");
ok(serviceSource.includes("state.source === 'employee' && currentShiftStart")
  && serviceSource.includes('Number(state.ts || 0) < currentShiftStart'),
  "un nouveau pointage ne ressuscite pas le brouillon employé d'un service précédent");
ok(serviceSource.includes("+ '-emp'")
  && serviceSource.includes('id: paymentId')
  && serviceSource.includes('lines: paidLines')
  && serviceSource.includes("await fetch('/api/sale'")
  && serviceSource.includes('Never free a table locally before that acknowledgement')
  && !/function markTablePaid[\s\S]*?KiwiLive\.postSale/.test(serviceSource),
  "chaque addition employé est confirmée par le serveur avant de libérer la table");
ok(serviceSource.includes('--app-height: 100dvh')
  && serviceSource.includes('height: var(--app-height)')
  && serviceSource.includes('--safe-bottom: max(env(safe-area-inset-bottom, 0px), 0px)')
  && serviceSource.includes('apple-mobile-web-app-capable'),
  "la hauteur et la barre mobile suivent le vrai écran et les zones sûres du téléphone");
const employeePwaSource = fs.readFileSync(path.join(ROOT, 'assets/employee-pwa.js'), 'utf8');
ok(employeePwaSource.includes('beforeinstallprompt') && employeePwaSource.includes('Installer l’app'),
  "le portail propose son installation sur l'écran d'accueil après connexion");
const liveLinkSource = fs.readFileSync(path.join(ROOT, 'assets/live-link.js'), 'utf8');
ok(liveLinkSource.includes("localStorage.getItem('kiwiEmployeeMerchant')")
  && liveLinkSource.includes('if (employeeMerchant) return employeeMerchant'),
  "le paiement employé route vers son magasin avant la validation serveur du pointage");

ok(!/markTablePaid\([^)]*['"]split['"]\)/.test(serviceSource)
  && /async\s+function\s+markSplitPartPaid\s*\(\s*partIdx\s*,\s*method\s*\)[\s\S]*?fetch\(\s*['"]\/api\/sale['"]/.test(serviceSource)
  && /employeePaymentId\([^)]*?:split:/.test(serviceSource)
  && /split:\s*\{\s*index:\s*partIdx,\s*count:\s*flow\.parts\.length,\s*flowId:\s*flow\.id\s*\}/.test(serviceSource)
  && /flow\.parts\.every\(part\s*=>\s*part\.paid\)/.test(serviceSource),
  "le partage d'addition employé enregistre chaque part avec sa vraie méthode (carte/cash) et préserve la ventilation");
ok(/if\s*\(!SV_DEMO\s*&&\s*\(!merchant\s*\|\|\s*!session\)\)[\s\S]{0,180}Session de service expirée/.test(serviceSource),
  "une session absente refuse la part au lieu de l'afficher payée sans écriture cloud");

/* File durable des pointages (assets/employee-live.js) : le vrai client, branché
   sur les vrais gestionnaires, avec un réseau qu'on coupe, une réponse perdue,
   une réouverture de l'app et un autre employé sur le même téléphone. */
{
  const liveSource = fs.readFileSync(path.join(ROOT, 'assets/employee-live.js'), 'utf8');
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); },
  };
  const net = { offline: false, loseResponse: false, jar: '', posts: [] };
  async function fakeFetch(url, opts = {}) {
    if (net.offline) throw new TypeError('Failed to fetch');
    const method = opts.method || 'GET';
    const request = new Request('https://kiwi.test' + url, {
      method, headers: { ...(opts.headers || {}), ...(net.jar ? { Cookie: net.jar } : {}) }, body: opts.body,
    });
    if (method === 'POST') net.posts.push(JSON.parse(opts.body));
    const res = await (method === 'GET' ? API.onRequestGet : API.onRequestPost)({ env, request });
    const set = String(res.headers.get('set-cookie') || '');
    if (set.startsWith('kiwi_employee=')) net.jar = /Max-Age=0/i.test(set) ? '' : set.split(';')[0];
    // Réponse perdue après écriture : seul un pointage (POST) la subit, pas une relecture en vol.
    if (net.loseResponse && method === 'POST') { net.loseResponse = false; throw new TypeError('Failed to fetch'); }
    return res;
  }
  function boot() {
    const timers = new Map(); let timerId = 0;
    const listeners = {}; const events = []; const toasts = [];
    const window = { localStorage, crypto, toast(message) { toasts.push(message); }, addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); } };
    const document = { documentElement:{lang:'en'}, visibilityState: 'visible', addEventListener() {}, dispatchEvent(e) { events.push(e); } };
    const context = {
      window, document, navigator: {}, location: { protocol: 'file:' }, fetch: fakeFetch,
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
      setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    };
    vm.runInNewContext(liveSource, context);
    const app = window.KiwiEmployeeLive;
    return {
      live: app, events, toasts,
      queueEvents: () => events.filter((e) => e.type === 'kiwi-employee-punch-queue').map((e) => e.detail),
      async tick() { const fns = [...timers.values()]; timers.clear(); fns.forEach((fn) => fn()); if (app.flushPunches) await app.flushPunches(); },
      fire(t) { (listeners[t] || []).forEach((fn) => fn()); },
    };
  }
  const attendanceDoc = () => JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance'").get().data);
  const codeDoc = () => JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='attendance-code'").get().data);
  const progressShifts = () => {
    const row = sqlite.prepare("SELECT data FROM store_docs WHERE merchant='amira-cafe' AND feature='employee-progress'").get();
    return Number(row && JSON.parse(row.data).members?.['mem-sara']?.shifts) || 0;
  };
  const QKEY = 'kiwiEmployeePunchQueue:amira-cafe:mem-sara';
  const queued = () => JSON.parse(storage.get(QKEY) || '[]');
  const flushAll = async (app) => { if (app.flushPunches) await app.flushPunches(); };

  /* Les services pointés plus haut ont fini à l'instant ; « jamais avant le
     pointage précédent » les ferait passer devant un geste daté d'il y a dix
     minutes. On les recule d'un jour pour jouer une vraie coupure. */
  const earlier = attendanceDoc();
  earlier.entries.forEach((e) => { if (e.staffId === 'mem-sara') { e.inTs -= 24 * 3600000; if (e.outTs) e.outTs -= 24 * 3600000; } });
  put("UPDATE store_docs SET data=? WHERE merchant='amira-cafe' AND feature='attendance'", JSON.stringify(earlier));
  const A = boot();
  await A.live.login('sara@amira.test', '2468');
  const startEntries = attendanceDoc().entries.length;
  const code1 = await (await teamLivePost({ action: 'generate-attendance-code' })).json();

  // 1. Réseau coupé : l'arrivée est gardée sur le téléphone, avec son heure et son identité.
  net.offline = true;
  let offlineIn = null;
  try { offlineIn = await A.live.clockIn(code1.code); } catch (_) { offlineIn = null; }
  const savedIn = queued()[0] || {};
  ok(offlineIn && offlineIn.queued === true && queued().length === 1 && savedIn.kind === 'clock-in'
    && savedIn.opId && savedIn.at > 0 && attendanceDoc().entries.length === startEntries
    && A.queueEvents().some((d) => d.queued === 'clock-in'),
  "hors ligne, l'arrivée est enregistrée sur le téléphone (heure réelle, identité du geste) sans rien écrire au serveur");

  // 2. Dix minutes plus tard, la caisse a changé de code ; l'app est rouverte et le réseau revient.
  const items = queued();
  if (items[0]) { items[0].at -= 10 * 60000; storage.set(QKEY, JSON.stringify(items)); }
  const lived = codeDoc(); lived.createdTs -= 10 * 60000; lived.expiresTs -= 10 * 60000;
  put("UPDATE store_docs SET data=? WHERE merchant='amira-cafe' AND feature='attendance-code'", JSON.stringify(lived));
  const code2 = await (await teamLivePost({ action: 'generate-attendance-code' })).json();
  net.offline = false;
  const B = boot();
  await B.live.refresh();
  await B.tick();
  const opened = attendanceDoc().entries.filter((e) => savedIn.opId && e.clockInOpId === savedIn.opId);
  ok(!storage.has(QKEY) && opened.length === 1 && !opened[0].outTs
    && Math.abs(opened[0].inTs - items[0].at) < 5000
    && B.queueEvents().some((d) => d.sent === 1 && d.pending === 0),
  "à la réouverture, l'arrivée part une seule fois, datée de son vrai geste et vérifiée contre le code qui valait alors");

  // 3. Départ appliqué mais réponse perdue ; l'employé repointe ailleurs ; le départ rejoué ne ferme pas ce nouveau service.
  const shiftsBefore = progressShifts();
  net.loseResponse = true;
  let lostOut = null;
  try { lostOut = await B.live.clockOut({ paid: 2, revenue: 100, turnMinutes: 40 }, code2.code); } catch (_) { lostOut = null; }
  const lostItem = queued()[0] || {};
  const firstShift = attendanceDoc().entries.filter((e) => savedIn.opId && e.clockInOpId === savedIn.opId)[0];
  ok(lostOut && lostOut.queued === true && lostItem.kind === 'clock-out' && firstShift && firstShift.outTs > 0,
    'un départ dont la réponse se perd reste sur le téléphone');
  const otherDevice = await post({ action: 'clock-in', attendanceCode: code2.code, opId: crypto.randomUUID() }, net.jar);
  ok(otherDevice.status === 200, "l'employé repointe son arrivée depuis un autre appareil");
  await flushAll(B.live);
  const mine = attendanceDoc().entries.filter((e) => e.staffId === 'mem-sara');
  ok(!storage.has(QKEY) && mine.filter((e) => !e.outTs).length === 1
    && mine.filter((e) => lostItem.opId && e.clockOutOpId === lostItem.opId).length === 1
    && progressShifts() === shiftsBefore + 1,
  'le départ rejoué retrouve le service déjà fermé : le nouveau reste ouvert, heures et progression créditées une fois');

  // 4. La file d'un autre employé du même téléphone ne part jamais sous cette session.
  const NKEY = 'kiwiEmployeePunchQueue:amira-cafe:mem-nora';
  storage.set(NKEY, JSON.stringify([{ kind: 'clock-in', opId: 'nora-op', at: Date.now(), code: code2.code }]));
  await flushAll(B.live);
  ok(storage.has(NKEY) && !net.posts.some((p) => p.opId === 'nora-op'),
    "la file d'un autre employé reste rangée sous son nom et n'est jamais envoyée sous cette session");
  storage.delete(NKEY);

  // 5. Refus définitifs : un code faux, un geste de plus de 24 h. Retirés, signalés, rien d'écrit.
  const before = JSON.stringify(attendanceDoc());
  net.offline = true;
  await B.live.clockOut(null, '000000').catch(() => {});
  await B.live.clockOut(null, code2.code).catch(() => {});
  const two = queued();
  if (two[1]) { two[1].at = Date.now() - 25 * 3600000; storage.set(QKEY, JSON.stringify(two)); }
  net.offline = false;
  await flushAll(B.live);
  const rejected = B.queueEvents().filter((d) => d.rejected && d.rejected.length).flatMap((d) => d.rejected).map((r) => r.error);
  ok(two.length === 2 && !storage.has(QKEY) && JSON.stringify(attendanceDoc()) === before
    && rejected.includes('attendance-code-invalid')
    && B.queueEvents().some(d => d.approvals === 1) && B.toasts.includes('Punch kept for manager approval')
    && JSON.parse(sqlite.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'attendance-corrections'").get('amira-cafe').data).items.some(item => item.status === 'pending'),
  "un pointage périmé est gardé pour approbation, un code faux est refusé, sans modifier les heures");

  // 6. Hors ligne avec un départ en attente, la déconnexion garde la session qui l'enverra.
  net.offline = true;
  await B.live.clockOut(null, code2.code).catch(() => {});
  const loggedOut = await B.live.logout().catch((e) => ({ thrown: e }));
  ok(loggedOut && loggedOut.ok === false && loggedOut.pending === 1 && net.jar.startsWith('kiwi_employee='),
    'hors ligne, la déconnexion ne perd ni le départ en attente ni la session qui doit le porter');
  net.offline = false;
  B.fire('online');
  await B.tick();
  ok(!storage.has(QKEY) && attendanceDoc().entries.filter((e) => e.staffId === 'mem-sara' && !e.outTs).length === 0,
    'au retour du réseau, le départ en attente part et ferme le service');
}

/* Deux magasins durables simulés, conservés entre deux ouvertures du client. */
{
  const source = fs.readFileSync(path.join(ROOT, 'assets/employee-live.js'), 'utf8');
  const disk = new Map(), local = new Map();
  let failLocal = false, failIDB = false, offline = true;
  const posts = [];
  // Les requêtes réussissent avant la transaction : seule oncomplete garantit l'écriture.
  const indexedDB = { open() {
    const req = {};
    queueMicrotask(() => {
      if (failIDB) { req.onerror?.(); return; }
      req.result = {
        objectStoreNames: { contains: () => true }, createObjectStore() {}, close() {},
        transaction() {
          const tx = { objectStore() { return {
            get(key) { const r = {}; queueMicrotask(() => { r.result = structuredClone(disk.get(key)); r.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); }); return r; },
            put(value, key) { queueMicrotask(() => { disk.set(key, structuredClone(value)); tx.oncomplete?.(); }); },
          }; } };
          return tx;
        },
      };
      req.onsuccess?.();
    });
    return req;
  } };
  function boot() {
    const window = { indexedDB, crypto, localStorage: {
      getItem: (key) => local.get(key),
      setItem(key, value) { if (failLocal) throw Error('storage unavailable'); local.set(key, value); },
      removeItem(key) { if (failLocal) throw Error('storage unavailable'); local.delete(key); },
    }, addEventListener() {} };
    vm.runInNewContext(source, {
      window, navigator: {}, location: { protocol: 'file:' },
      document: { addEventListener() {}, dispatchEvent() {} },
      setTimeout: () => 1, clearTimeout() {},
      fetch: async (_, opts) => {
        if (offline) throw TypeError('Failed to fetch');
        if (opts.method === 'POST') {
          posts.push(JSON.parse(opts.body).opId);
          if (posts.length > 3) throw TypeError('retry loop bounded by test');
        }
        return { ok: true, json: async () => ({ merchant: 'test-store', employee: { id: 'test-employee' } }) };
      },
    });
    return window.KiwiEmployeeLive;
  }
  for (const mode of ['idb-only', 'both', 'stale-local', 'neither']) {
    disk.clear(); local.clear(); posts.length = 0;
    failLocal = mode === 'idb-only' || mode === 'neither'; failIDB = mode === 'neither'; offline = false;
    const a = boot(); await a.refresh(); offline = true;
    let result;
    try { result = await a.clockIn('', 'durable-' + mode); } catch (_) {}
    ok(mode === 'neither' ? !result : result?.queued === true,
      'durabilité ' + mode + ' : accepté seulement avec une copie durable');
    if (mode === 'both' || mode === 'stale-local') {
      ok(Array.from(local.keys()).filter(key => key !== 'kiwiAttendanceDevice').length === 1 && disk.size === 1, 'le geste est écrit dans les deux magasins');
    }
    if (mode === 'stale-local') failLocal = true;
    offline = false;
    const b = boot(); await b.refresh(); await b.flushPunches(); await b.flushPunches();
    const c = boot(); await c.refresh(); await c.flushPunches();
    ok(posts.length === (mode === 'neither' ? 0 : 1),
      'durabilité ' + mode + ' : après réouvertures, un seul envoi');
  }
}

/* Le gérant voit un pointage envoyé plus tard depuis le téléphone : /api/team/live
   le signale (par jour, délai déclaré compris), la grille des heures
   (assets/team-hours.js) le marque dans la case du jour en FR/EN/AR, et les
   derniers pointages de la caisse l'écrivent sous la ligne. */
{
  const liveState = await (await teamLiveGet()).json();
  const saraDeferred = (liveState.deferredPunches || {})['mem-sara'] || {};
  const deferredDays = Object.keys(saraDeferred);
  ok(deferredDays.length > 0 && Object.values(saraDeferred).flat().every((p) => p.delayMs > 0 && ['in', 'out'].includes(p.kind))
    && (liveState.recentAttendance || []).some((e) => e.memberId === 'mem-sara' && (e.inDeferredMs > 0 || e.outDeferredMs > 0)),
  'la caisse et le tableau de bord reçoivent les pointages envoyés plus tard, avec le délai déclaré');

  const hoursSource = fs.readFileSync(path.join(ROOT, 'assets/team-hours.js'), 'utf8');
  function renderHours(lang, deferredByVenue) {
    const fn = () => '';
    const base = {
      Kiwi: {}, handlers: {}, live: {}, hours: {}, AVATAR_COLORS: {}, IC: {},
      trLang: () => lang, esc: (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
      pad: (n) => String(n).padStart(2, '0'), toISO: (d) => new Date(d).toISOString().slice(0, 10),
      fmtHours: (v) => String(v), buildPeriod: () => ({ days: ['2026-10-20', '2026-10-21'], startFr: '', endFr: '' }),
      getHours: () => ({}), memberFullName: (m) => m.firstName, initials: () => 'S', jobName: (v) => v,
      hourlyPayFor: () => 0, periodPillsHtml: fn, periodNavigatorHtml: fn, svgIcon: fn,
    };
    const core = new Proxy(base, { get: (t, k) => (k in t ? t[k] : fn) });
    const T = new Proxy({}, { get: () => Object.assign(() => '', { toString: () => '' }) });
    const window = { Kiwi: { __teamCore: core }, __kiwiTeamV2: { periodKind: 'week', deferredByVenue } };
    const document = { addEventListener() {}, removeEventListener() {}, documentElement: { lang }, querySelector: () => null, querySelectorAll: () => [] };
    vm.runInNewContext(hoursSource, { window, document, setTimeout, clearTimeout, console });
    return core.hours.renderHoursPane(T, {}, 'scoped:amira-cafe', [{ id: 'mem-sara', firstName: 'Sara' }]);
  }
  const marks = { 'scoped:amira-cafe': { 'mem-sara': { '2026-10-21': [{ kind: 'in', delayMs: 130 * 60000 }] } } };
  const fr = renderHours('fr', marks), en = renderHours('en', marks), ar = renderHours('ar', marks), none = renderHours('fr', {});
  const cell = (html, day) => (html.match(new RegExp(`data-day="${day}"[^>]*/>([\\s\\S]*?)</td>`)) || [])[1] || '';
  ok(cell(fr, '2026-10-21').includes('data-kt-deferred') && cell(fr, '2026-10-21').includes('data-icon="smartphone"')
    && fr.includes('Envoyé plus tard depuis le téléphone · délai déclaré 2 h 10')
    && en.includes('Sent later from the phone · declared delay 2 h 10 min')
    && ar.includes('أُرسل لاحقاً من الهاتف') && ar.includes('2 س 10 د')
    && !cell(fr, '2026-10-20').includes('data-kt-deferred') && !none.includes('data-kt-deferred'),
  'la grille des heures marque le jour du pointage envoyé plus tard, délai déclaré compris, en français, anglais et arabe');
  const teamSourceNow = fs.readFileSync(path.join(ROOT, 'assets/team.js'), 'utf8');
  ok(/deferredByVenue[\s\S]{0,80}\[venueKey\] = data\.deferredPunches/.test(teamSourceNow)
    && teamSourceNow.includes('data.deferredPunches || {}, data.pendingCorrections || []]);'),
  'le tableau de bord range les pointages envoyés plus tard du magasin pour la grille des heures');
  const caisseRefresh = fs.readFileSync(path.join(ROOT, 'assets/caisse-refresh.js'), 'utf8');
  const caisseApp = caisseWorkflowSource.appSource();
  ok(caisseRefresh.includes('deferredNote(entry)') && caisseRefresh.includes('Envoyé plus tard depuis le téléphone')
    && caisseApp.includes('data-attendance-deferred') && caisseApp.includes('Sent later from the phone'),
  'les derniers pointages de la caisse disent quand un pointage a été envoyé plus tard depuis le téléphone');
}

// Review controls use the existing hours surface and the audited server route.
{
  const src = fs.readFileSync(path.join(ROOT,'assets/team-hours.js'),'utf8');
  const block = src.slice(src.indexOf('  function correctionCopy()'),src.indexOf('  /* ═══════════════ HOURS PANE'));
  for (const lang of ['fr','en','ar']) {
    const handlers={},requests=[],notices=[];
    const root={correctionsByVenue:{synthetic:[{id:'pending-one',name:'<synthetic>',action:'clock-out',claimedTs:1,capturedTs:2,receivedTs:3,deviceId:'test-device'}]}};
    const Kiwi={__teamProfileCore:{teamSlug:()=> 'synthetic-shop'}};
    const context={handlers,Kiwi,window:{__kiwiTeamV2:root},trLang:()=>lang,esc:value=>String(value).replaceAll('<','&lt;'),dateLocale:()=> 'en-GB',toast:message=>notices.push(message),render(){},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true};}};
    vm.createContext(context);vm.runInContext(block,context);
    const html=vm.runInContext("correctionsHtml('synthetic')",context);
    ok(html.includes('&lt;synthetic>') && html.includes('test-device') && html.includes('data-decision="approved"') && html.includes('data-decision="rejected"'), 'corrections '+lang+' : identité échappée, appareil et deux décisions visibles');
    await handlers['kt-attendance-decision']({dataset:{rid:'pending-one',decision:'approved'}});
    ok(requests[0]?.url==='/api/team/live' && requests[0].body.merchant==='synthetic-shop' && requests[0].body.action==='attendance-correction-decision' && root.correctionsByVenue.synthetic.length===0, 'corrections '+lang+' : décision envoyée au serveur et liste actualisée');
  }
}

if (failures) process.exit(1);
console.log('\n✓ employee app live gate green');
