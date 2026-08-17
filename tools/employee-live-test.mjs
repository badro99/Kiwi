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
const SALE = await import(path.join(ROOT, 'functions/api/sale.js'));
const FEED = await import(path.join(ROOT, 'functions/api/feed.js'));
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
ok(teamSource.includes('function fmtHours(value)')
  && teamSource.includes('Math.round((Number(value) || 0) * 60)')
  && teamSource.includes('value="${esc(fmtHours(v))}"')
  && teamSource.includes('input.value = fmtHours(input.dataset.hoursValue)')
  && !teamSource.includes("total.toFixed(2).replace('.', ',')"),
  'Paie affiche les heures pointées en heures et minutes, sans décimales ambiguës comme 0,61 h');
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
const employeePlanningSource = fs.readFileSync(path.join(ROOT, 'assets/employee-planning.js'), 'utf8');
const eventsSource = fs.readFileSync(path.join(ROOT, 'functions/api/service/events.js'), 'utf8');
const queueSource = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
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
  && serviceSource.includes('kgDayNumber % KG_DEFIS.length'),
  'quatorze défis distincts tournent sans répétition pendant deux semaines');
ok(serviceSource.includes("lifetimeXP: 0")
  && serviceSource.includes("bestNight: 0")
  && !serviceSource.includes("lifetimeXP: 2400"),
  'un nouveau compte commence sans grade ni records de démonstration');
const caisseSource = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const dispatchSource = fs.readFileSync(path.join(ROOT, 'assets/pos-dispatch.js'), 'utf8');
const attendanceCodeSource = fs.readFileSync(path.join(ROOT, 'assets/caisse-attendance-code.js'), 'utf8');
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
ok(caisseSource.includes('setInterval(pollLiveTeam, 1000)'),
  'la caisse reflète en direct les employés pointés, en pause et sortis');
ok(caisseSource.includes('function startEmployeeSaleJournalSync()')
  && caisseSource.includes('function ingestSettledCloudSales(sales)')
  && caisseSource.includes('function syncSettledBusinessDay()')
  && caisseSource.includes('if (!sale || !(Number(sale.amount) > 0)) return;')
  && caisseSource.includes('saleRefs.some((ref) => String(entry.ref || \'\') === ref)')
  && caisseSource.includes("'&from=' + from")
  && caisseSource.includes('KiwiLive.watchFeed(ingestSettledCloudSales)')
  && caisseSource.includes('DR.businessDay(saleTs || Date.now()) !== currentBusinessDay()')
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
ok(/assets\/caisse-attendance-code\.js\?v=\d+/.test(caisseSource)
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
  && teamSource.includes('(pageActive && !hidden) ? LIVE_TEAM_FAST_MS : LIVE_TEAM_IDLE_MS')
  && teamSource.includes("document.addEventListener('visibilitychange', scheduleLiveTeam)")
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

if (failures) process.exit(1);
console.log('\n✓ employee app live gate green');
