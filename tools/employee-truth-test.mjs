#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * APP EMPLOYÉ · CE QUE L'ÉCRAN AFFIRME
 *
 * 1. Un salarié retiré ne se reconnecte pas — et ne ressuscite pas.
 * Le roster se fusionnait par UNION de membres : le dernier salarié supprimé
 * faisait un document « vide », que le serveur refusait (refused-empty), et la
 * fusion le ramenait aussitôt. Résultat observé : « Sara » supprimée du
 * tableau de bord gardait sa connexion à l'app employé. Les suppressions sont
 * maintenant des pierres tombales (`removed: [{ id, ts }]`) que le serveur
 * conserve, quel que soit le client qui écrit.
 *
 * 2. Le code de pointage (six chiffres, cinq minutes) a un plafond d'essais :
 * sans lui, un employé chez lui pouvait le deviner par script et « pointer »
 * sans être au comptoir.
 *
 * 3. Un message du comptoir ne ressort pas le lendemain.
 *
 * 4. L'écran ne dit « autorisé » que quand le serveur l'a dit, et les heures du
 *    jour déduisent les pauses comme le fait le pointage de sortie.
 *
 * 5. La carte « Planning & demandes » suit les décisions du patron, et le
 *    Centre d'aide montre le statut réel d'une demande de support au lieu de
 *    promettre une « demande suivie » que le commerçant ne pouvait pas suivre.
 *
 *   node tools/employee-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet: storeGet, onRequestPost: storePost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const { onRequestGet: employeeGet, onRequestPost: employeePost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/employee.js')).href);
const { makeSession, sessionCookie } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

let fails = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); return; }
  fails++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`);
}

const AUTH_SECRET = 'employee-truth-secret-0123456789';
const SHOP = 'amira-boutique';          // pas un slug de démo (voir team-doc-redaction-test)
const now = Date.now();

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE employee_auth_versions (merchant TEXT NOT NULL, member_id TEXT NOT NULL, auth_version INTEGER NOT NULL DEFAULT 0, pin_digest TEXT NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, member_id));
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status,session_epoch) VALUES ('acc-1','o@amira.ma','Amira Boutique','s','h',?,'active',0)`).run(now);
db.prepare(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?, '{}','pro','restaurant','acc-1','Amira Boutique','active',0,?)`).run(SHOP, now);

const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    const bound = (p) => ({
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    });
    // findEmployeeCredential lit tous les magasins d'un coup, sans bind().
    return { bind(...p) { return bound(p); }, ...bound([]) };
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try {
      const results = [];
      for (const stmt of stmts) results.push(await stmt.run());
      db.exec('COMMIT');
      return results;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  },
} };

const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));
const member = (id, first, email, code) => ({ id, firstName: first, lastName: 'T.', email, function: 'Serveur', department: 'Salle', pinCode: code, password: code });
const getDoc = (feature) => { const r = db.prepare(`SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?`).get(SHOP, feature); return r ? { data: JSON.parse(r.data), rev: r.rev } : null; };
const put = (feature, data) => db.prepare(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?) ON CONFLICT(merchant,feature) DO UPDATE SET data=excluded.data, rev=store_docs.rev+1, updated_ts=excluded.updated_ts`).run(SHOP, feature, JSON.stringify(data), Date.now());
const ownerPostTeam = async (doc) => {
  const cur = getDoc('team');
  const res = await storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: owner, 'CF-Connecting-IP': '10.9.9.9' },
    body: JSON.stringify({ feature: 'team', merchant: SHOP, data: doc, baseRev: cur ? cur.rev : 0 }) }), env });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const empLogin = async (email, pin, ip = '10.1.1.1') => {
  const res = await employeePost({ request: new Request('https://k/api/employee', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ action: 'login', email, pin }) }), env });
  const cookie = (res.headers.get('Set-Cookie') || '').split(';')[0];
  return { status: res.status, cookie, body: await res.json().catch(() => ({})) };
};
const empGet = (cookie) => employeeGet({ request: new Request('https://k/api/employee', { headers: { Cookie: cookie, 'CF-Connecting-IP': '10.1.1.1' } }), env });
const empAct = (cookie, body) => employeePost({ request: new Request('https://k/api/employee', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '10.1.1.1' }, body: JSON.stringify(body) }), env });

console.log('\n\x1b[1mApp employé — retrait, pointage, messages\x1b[0m');

/* ── 1. Retrait du dernier salarié ────────────────────────────────────────── */
const SARA = member('mem-sara', 'Sara', 'sara@amira.ma', '4821');
{
  const first = await ownerPostTeam({ members: [SARA], hours: {}, shifts: {} });
  ok('le patron enregistre son équipe (un seul salarié)', first.status === 200, JSON.stringify(first));
  const access = getDoc('employee-access');
  ok('…et le miroir d’accès porte ce salarié', access && access.data.members.length === 1);
}
let saraCookie = '';
{
  const login = await empLogin('sara@amira.ma', '4821');
  saraCookie = login.cookie;
  ok('Sara se connecte à l’app employé', login.status === 200 && /kiwi_employee=/.test(saraCookie), JSON.stringify(login.body) + JSON.stringify(getDoc('employee-access')));
  const res = await empGet(saraCookie);
  ok('…sa session lit son espace (200)', res.status === 200);
}
{
  // Ce que le navigateur envoyait AVANT : l'équipe vidée, sans pierre tombale.
  const empty = await ownerPostTeam({ members: [], hours: {}, shifts: {} });
  ok('SANS pierre tombale, l’équipe vidée est refusée (refused-empty) : c’est le trou d’origine',
    empty.status === 409 && empty.body.error === 'refused-empty', JSON.stringify(empty));
}
{
  const removal = await ownerPostTeam({ members: [], removed: [{ id: 'mem-sara', ts: Date.now() }], hours: {}, shifts: {} });
  ok('AVEC la pierre tombale, la suppression du dernier salarié est enregistrée (200)', removal.status === 200, JSON.stringify(removal));
  const access = getDoc('employee-access');
  ok('…le miroir d’accès n’a plus personne', access && access.data.members.length === 0, JSON.stringify(access && access.data));
  const res = await empGet(saraCookie);
  ok('…la session ouverte de Sara est refusée (401), pas figée', res.status === 401, String(res.status));
  const again = await empLogin('sara@amira.ma', '4821', '10.1.1.2');
  ok('…et elle ne peut plus se reconnecter (401)', again.status === 401, String(again.status));
}
{
  // Un appareil resté sur l'ancien roster (ou une version d'assets qui ignore `removed`).
  const stale = await ownerPostTeam({ members: [SARA, member('mem-yass', 'Yass', 'yass@amira.ma', '7390')], hours: {}, shifts: {} });
  ok('un appareil périmé repousse l’ancien roster : accepté pour les autres salariés', stale.status === 200, JSON.stringify(stale));
  const team = getDoc('team').data;
  ok('…mais le serveur retire Sara du roster entrant', !team.members.some((m) => m.id === 'mem-sara') && team.members.length === 1, JSON.stringify(team.members.map((m) => m.id)));
  ok('…et garde la pierre tombale', Array.isArray(team.removed) && team.removed.some((r) => r.id === 'mem-sara'));
  const access = getDoc('employee-access').data.members.map((m) => m.id);
  ok('…donc Sara reste hors du miroir d’accès', !access.includes('mem-sara') && access.includes('mem-yass'), JSON.stringify(access));
  const again = await empLogin('sara@amira.ma', '4821', '10.1.1.3');
  ok('…et reste refusée à la connexion', again.status === 401);
  const yass = await empLogin('yass@amira.ma', '7390', '10.1.1.4');
  ok('…alors que les autres salariés se connectent normalement', yass.status === 200);
}
{
  // Défense en profondeur : même si le miroir d'accès gardait une trace, la tombale tranche.
  const sara2 = await empLogin('yass@amira.ma', '7390', '10.1.1.5');
  put('employee-access', { members: [{ ...SARA, venueSlug: SHOP, authVersion: 0 }, { ...member('mem-yass', 'Yass', 'yass@amira.ma', '7390'), venueSlug: SHOP, authVersion: 0 }] });
  const res = await empLogin('sara@amira.ma', '4821', '10.1.1.6');
  ok('un miroir d’accès qui garderait Sara ne suffit pas : la pierre tombale la refuse (401)', res.status === 401, String(res.status));
  void sara2;
}

/* ── 2. Plafond d'essais sur le code de pointage ──────────────────────────── */
{
  const room = member('mem-room', 'Room', 'room@amira.ma', '1357');
  const cur = getDoc('team').data;
  await ownerPostTeam({ ...cur, members: [...cur.members, room] });
  const login = await empLogin('room@amira.ma', '1357', '10.2.2.2');
  ok('un employé se connecte', login.status === 200, String(login.status));
  put('attendance-code', { code: '123456', createdTs: Date.now(), expiresTs: Date.now() + 5 * 60000 });
  const statuses = [];
  for (let i = 0; i < 10; i++) {
    const res = await empAct(login.cookie, { action: 'clock-in', attendanceCode: String(100000 + i) });
    statuses.push(res.status);
  }
  ok('huit mauvais codes = 403, puis 429 : le devinage par script s’arrête', statuses.slice(0, 8).every((s) => s === 403) && statuses.slice(8).every((s) => s === 429), statuses.join(','));
  const right = await empAct(login.cookie, { action: 'clock-in', attendanceCode: '123456' });
  ok('…même le BON code est refusé tant que le blocage dure', right.status === 429, String(right.status));
}
{
  const fresh = member('mem-fresh', 'Fresh', 'fresh@amira.ma', '2468');
  const cur = getDoc('team').data;
  await ownerPostTeam({ ...cur, members: [...cur.members, fresh] });
  const login = await empLogin('fresh@amira.ma', '2468', '10.3.3.3');
  put('attendance-code', { code: '654321', createdTs: Date.now(), expiresTs: Date.now() + 5 * 60000 });
  const wrong = await empAct(login.cookie, { action: 'clock-in', attendanceCode: '000000' });
  const right = await empAct(login.cookie, { action: 'clock-in', attendanceCode: '654321' });
  ok('une faute de frappe puis le bon code : le pointage passe (pas de blocage injuste)', wrong.status === 403 && right.status === 200, `${wrong.status}/${right.status}`);
  const left = db.prepare(`SELECT COUNT(*) AS n FROM pair_attempts WHERE ip LIKE 'attcode%' AND fails > 0`).get();
  ok('…et le compteur est remis à zéro après le succès', left.n === 1 /* le blocage de « Room » seul */, JSON.stringify(left));
}

/* ── 3. Un message du comptoir vaut 24 heures ─────────────────────────────── */
{
  const login = await empLogin('fresh@amira.ma', '2468', '10.4.4.4');
  put('team-messages', { messages: [
    { id: 'old', target: 'ALL', text: 'La salle B ferme ce soir', ts: Date.now() - 48 * 3600000, sender: 'Caisse' },
    { id: 'new', target: 'ALL', text: 'Table 4 prête', ts: Date.now() - 5 * 60000, sender: 'Caisse' },
    { id: 'undated', target: 'ALL', text: 'sans date', sender: 'Caisse' },
  ] });
  const body = await (await empGet(login.cookie)).json();
  const ids = (body.messages || []).map((m) => m.id);
  ok('le message d’avant-hier ne ressort pas ; celui de cinq minutes oui', ids.length === 1 && ids[0] === 'new', JSON.stringify(ids));
}

/* ── 4. Côté navigateur : la fusion respecte les pierres tombales ──────────── */
{
  const SRC = readFileSync(path.join(ROOT, 'assets/team.js'), 'utf8');
  const grab = (start) => {
    const i = SRC.indexOf(start);
    assert.ok(i >= 0, start + ' introuvable');
    let d = 0;
    for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
      if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
    }
    throw new Error('unbalanced ' + start);
  };
  const ctx = vm.createContext({ window: {} });
  vm.runInContext([
    'const REMOVED_CAP = 200;',
    'const LOCK_KEY_RE = /^(week|fortnight|month):\\d{4}-\\d{2}-\\d{2}:\\d{4}-\\d{2}-\\d{2}$/;',
    'function teamSlug() { return ""; }',
    grab('function cleanLocks('), grab('function mergeLocks('), grab('function cleanRemoved('),
    grab('function mergeRemoved('), grab('function memberBelongsToStore('), grab('function scopeTeamDoc('),
    grab('function isCode('), grab('function memberCode('), grab('function fillCodes('),
    grab('function mergeByDay('), grab('function mergeTeamDoc('),
    'this.merge = mergeTeamDoc; this.scope = scopeTeamDoc;',
  ].join('\n'), ctx);
  const { merge, scope } = ctx;
  const a = { id: 'a', firstName: 'A' }, b = { id: 'b', firstName: 'B' };
  const local = { members: [b], removed: [{ id: 'a', ts: 10 }], hours: {}, shifts: {}, planning: {}, locks: {} };
  const server = { members: [a, b], hours: { a: { '2026-10-01': 4 } }, shifts: {}, planning: {}, locks: {} };
  const merged = merge(local, server);
  ok('fusion : le salarié supprimé ici ne revient pas depuis le serveur', merged.members.map((m) => m.id).join() === 'b', JSON.stringify(merged.members));
  ok('…ses heures ne reviennent pas non plus', !merged.hours.a, JSON.stringify(merged.hours));
  ok('…et la pierre tombale survit à la fusion', merged.removed.length === 1 && merged.removed[0].id === 'a');
  const lone = merge({ members: [], removed: [{ id: 'a', ts: 10 }], hours: {}, shifts: {}, planning: {}, locks: {} }, { members: [a], hours: {}, shifts: {}, planning: {}, locks: {} });
  ok('le dernier salarié supprimé reste supprimé (le cas du « document vide »)', lone.members.length === 0 && lone.removed.length === 1);
  const scoped = scope({ members: [a, b], removed: [{ id: 'b', ts: 1 }], hours: {}, shifts: {}, planning: {}, locks: {} }, '');
  ok('scopeTeamDoc écarte les salariés tombés', scoped.members.length === 1 && scoped.members[0].id === 'a');
  ok('le document renvoyé à l’hôte déclare `removed` comme non vide (sinon refused-empty)', /isEmpty: \(d\) => !d \|\| !\(\(d\.members && d\.members\.length\) \|\| \(d\.removed && d\.removed\.length\)\)/.test(SRC));
  ok('la suppression écrit la pierre tombale', /kt-confirm-delete[\s\S]{0,900}removedByVenue\[venueType\] = mergeRemoved\(/.test(SRC));
}

/* ── 5. Côté écran de l'employé ───────────────────────────────────────────── */
{
  const HTML = readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
  // Le dictionnaire EN/AR de l'app serveur vit dans assets/serveur-lang.js.
  const SERVEUR_LANG = readFileSync(path.join(ROOT, 'assets', 'serveur-lang.js'), 'utf8');
  const grab = (start) => {
    const i = HTML.indexOf(start);
    assert.ok(i >= 0, start + ' introuvable');
    let d = 0;
    for (let k = HTML.indexOf('{', i); k < HTML.length; k++) {
      if (HTML[k] === '{') d++; else if (HTML[k] === '}' && --d === 0) return HTML.slice(i, k + 1);
    }
    throw new Error('unbalanced ' + start);
  };
  const T0 = Date.UTC(2026, 9, 11, 18, 0, 0);
  const run = (state, shiftStart, at) => {
    const ctx = vm.createContext({ Date: class extends Date { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } } });
    ctx.SV_DEMO = false; ctx.liveEmployeeState = state; ctx.shiftStart = shiftStart ? new ctx.Date(shiftStart) : null;
    vm.runInContext(grab('function shiftElapsedMs(') + '; this.f = shiftElapsedMs;', ctx);
    return ctx.f();
  };
  const IN = T0;
  const noBreak = run({ attendance: { open: { inTs: IN } } }, IN, T0 + 3 * 3600000);
  ok('trois heures sans pause = 180 min', Math.round(noBreak / 60000) === 180, String(noBreak));
  const withBreak = run({ attendance: { open: { inTs: IN, breaks: [{ inTs: IN + 3600000, outTs: IN + 3600000 + 20 * 60000 }] } } }, IN, T0 + 3 * 3600000);
  ok('…avec une pause de 20 min terminée : 160 min (comme le départ l’enregistrera)', Math.round(withBreak / 60000) === 160, String(withBreak));
  const paused = run({ attendance: { open: { inTs: IN, pauseTs: IN + 2.5 * 3600000 } } }, IN, T0 + 3 * 3600000);
  ok('…en pause depuis 30 min : le compteur s’arrête (150 min)', Math.round(paused / 60000) === 150, String(paused));

  const gate = grab('function fireNfcTap(');
  ok('le pointage réel n’affiche plus « Arrivée autorisée » avant la réponse du serveur',
    /if \(SV_DEMO\) \{[\s\S]*Arrivée autorisée[\s\S]*\} else if \(c\) \{[\s\S]*Code saisi/.test(gate), gate.slice(0, 200));
  const err = grab('function pinError(');
  ok('une coupure réseau n’accuse plus le code personnel', /!code && !status[\s\S]{0,60}Connexion indisponible/.test(err));
  ok('une session retirée referme l’app (401 → portail)', /employee-session-required/.test(err) && /endRevokedSession/.test(HTML));

  /* Les messages nouveaux existent dans les trois langues : le dictionnaire EN et
     le dictionnaire AR portent chacun la clé (l'écran n'a pas de repli visible). */
  const NEW = ['Session expirée · reconnectez-vous', 'Pointage non enregistré · réessayez', 'Connexion indisponible · vérifiez le réseau',
    'Opération impossible · réessayez', 'Code saisi · il sera vérifié au pointage', 'Email ou code personnel incorrect.',
    'Connexion indisponible. Vérifiez le réseau et réessayez.', 'Service momentanément indisponible. Réessayez.'];
  const missing = [];
  for (const key of NEW) {
    const n = SERVEUR_LANG.split(JSON.stringify(key) + ':').length - 1;
    if (n < 2) missing.push(key);
  }
  ok('chaque message nouveau a sa traduction EN et AR', missing.length === 0, missing.join(' | '));

  const PLAN = readFileSync(path.join(ROOT, 'assets/employee-planning.js'), 'utf8');
  ok('la carte « Planning & demandes » suit chaque lecture de /api/employee (sondage, pointage), pas seulement ses actions',
    /addEventListener\('kiwi-employee-data'/.test(PLAN));

  const HELP = readFileSync(path.join(ROOT, 'assets/help-centre.js'), 'utf8');
  ok('le Centre d’aide affiche le statut réel des demandes du commerçant (GET /api/support/tickets), en FR, EN et AR',
    /fetch\('\/api\/support\/tickets\?merchant='/.test(HELP) && (HELP.match(/mine:'/g) || []).length === 3 && (HELP.match(/status:\{open:/g) || []).length === 3);
  ok('…et ne promet plus « une demande suivie » sans la montrer',
    !/Une demande suivie|A tracked request|طلب متابع/.test(HELP));

  const CAISSE = readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
  ok('le bouton du tiroir message dit ce qu’il fait (il envoie, il ne copie pas)',
    /id="msg-send"[^>]*>\s*<i data-lucide="send"><\/i> Envoyer le message/.test(CAISSE) && !/Copier le message/.test(CAISSE));
  ok('« 1 serveur en service », au singulier', /serveur\$\{n > 1 \? 's' : ''\} en service/.test(CAISSE));
}

if (fails) {
  console.log(`\n\x1b[31m✗ ${fails} contrôle(s) échoué(s).\x1b[0m`);
  process.exit(1);
}
console.log('\n\x1b[32m✓ l’app employé ne dit que ce que le serveur a confirmé.\x1b[0m');
