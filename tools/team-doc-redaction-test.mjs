#!/usr/bin/env node
/* Le code personnel d'un salarié ne descend pas sur le comptoir.
 *
 * Le document `team` porte, pour chaque salarié, le code à quatre chiffres qui
 * lui ouvre l'app employé (`pinCode` et `password`, même valeur dans deux
 * champs). La page Équipe du tableau de bord les AFFICHE, et c'est voulu : c'est
 * là que le patron lit le code qu'il va donner à sa caissière.
 *
 * Une caisse appairée les recevait aussi. `tenantFor()` accepte le jeton de
 * caisse (functions/api/_private.js › resolveTenant), donc
 * `GET /api/store?feature=team` rendait tous les codes du personnel à un
 * appareil de comptoir que n'importe qui peut approcher. Même fuite que celle
 * que /api/config a perdue, autre porte.
 *
 * Ce banc tient les DEUX moitiés, et la seconde compte autant que la première :
 * la caisse ne LIT plus les codes, et elle n'ÉCRIT plus le document qui les
 * porte. Sans le second verrou, la rédaction creuse un trou pire que celui
 * qu'elle bouche — une caisse relit l'équipe expurgée, la repousse telle quelle,
 * et tous les codes du magasin disparaissent.
 *
 * ⚠ Le magasin de ce banc n'est PAS un slug de démo. `entitledMerchant()` finit
 *   par `DEMO_MERCHANTS[asked] ? asked : ''`, donc sur `cafe-atlas` n'importe
 *   quel appelant est « chez lui » et le banc passerait au vert sans rien
 *   prouver. Voir DEMO_MERCHANTS dans functions/auth/_lib.js.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet: storeGet, onRequestPost: storePost } =
  await import(path.join(ROOT, 'functions/api/store.js'));
const { onRequestGet: teamLiveGet } = await import(path.join(ROOT, 'functions/api/team/live.js'));
const { onRequestGet: employeeGet } = await import(path.join(ROOT, 'functions/api/employee.js'));
const { tillToken, makeSession, sessionCookie, employeeToken, employeeCookie, DEMO_MERCHANTS } =
  await import(path.join(ROOT, 'functions/auth/_lib.js'));

let fails = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); return; }
  fails++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`);
}

const AUTH_SECRET = 'team-redaction-secret-0123456789';
const SHOP = 'amira-boutique';
const CODES = /\b(2580|1379)\b/;
const now = Date.now();

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
db.prepare(`INSERT INTO accounts VALUES ('acc-1','o@amira.ma','Amira Boutique','s','h',?,'active')`).run(now);
db.prepare(`INSERT INTO merchant_config VALUES (?, '{}','pro','boutique','acc-1','Amira Boutique','active',?)`).run(SHOP, now);

const TEAM = { members: [
  { id: 'm1', firstName: 'Samira', lastName: 'L.', email: 'samira@amira.ma', function: 'Caissier',      department: 'Salle',     pinCode: '2580', password: '2580' },
  { id: 'm2', firstName: 'Rachid', lastName: 'O.', email: 'rachid@amira.ma', function: 'Proprietaire',  department: 'Direction', pinCode: '1379', password: '1379' },
], hours: {}, shifts: {} };
const ACCESS = { members: TEAM.members.map((m) => ({ ...m, venueSlug: SHOP })) };
db.prepare(`INSERT INTO store_docs VALUES (?,'team',?,1,?)`).run(SHOP, JSON.stringify(TEAM), now);
db.prepare(`INSERT INTO store_docs VALUES (?,'employee-access',?,1,?)`).run(SHOP, JSON.stringify(ACCESS), now);
db.prepare(`INSERT INTO store_docs VALUES (?,'attendance',?,1,?)`).run(SHOP, JSON.stringify({ entries: [] }), now);

const env = { AUTH_SECRET, DB: { prepare(q) { const st = db.prepare(q); return { bind(...p) { return {
  async first() { return st.get(...p); },
  async all() { return { results: st.all(...p) }; },
  async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
}; } }; }, async batch(stmts) { return Promise.all(stmts); } } };

const till  = `kiwi_till=${await tillToken(AUTH_SECRET, SHOP)}`;
const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));
const emp   = employeeCookie(await employeeToken(AUTH_SECRET, { merchant: SHOP, staffId: 'm1' }));

const get = (fn, url, cookie) => fn({
  request: new Request(url, { headers: { ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': '10.0.0.1' } }), env,
});

console.log('\n\x1b[1mCodes du personnel — document `team`\x1b[0m');

ok('le magasin du banc n’est pas un slug de démo (sinon tout passe)', !DEMO_MERCHANTS[SHOP], SHOP);

/* ── 1. Lecture ───────────────────────────────────────────────────────────── */
{
  const res = await get(storeGet, `https://k/api/store?feature=team&merchant=${SHOP}`, till);
  const body = await res.text();
  ok('une caisse appairée lit l’équipe SANS les codes', res.status === 200 && !CODES.test(body));
  const members = JSON.parse(body).data.members;
  ok('…et sans les champs qui les portaient',
    members.every((m) => !('pinCode' in m) && !('password' in m)), JSON.stringify(members[0]));
  ok('…mais garde ce dont elle se sert : le nom et le rôle',
    members.length === 2 && members[0].firstName === 'Samira' && members[0].function === 'Caissier');
}
{
  const res = await get(storeGet, `https://k/api/store?feature=team&merchant=${SHOP}`, owner);
  const body = await res.text();
  ok('le patron les lit toujours — la page Équipe les affiche, c’est sa raison d’être',
    res.status === 200 && CODES.test(body));
}
{
  const res = await get(storeGet, `https://k/api/store?feature=team&merchant=${SHOP}`, '');
  ok('sans preuve d’aucune sorte : 401, pas un document', res.status === 401);
}

/* ── 2. Écriture — le trou que la rédaction ouvrirait si on s'arrêtait là ─── */
{
  const stripped = { members: TEAM.members.map(({ pinCode, password, ...rest }) => rest), hours: {}, shifts: {} };
  const res = await storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: till },
    body: JSON.stringify({ feature: 'team', merchant: SHOP, data: stripped, baseRev: 1 }) }), env });
  ok('une caisse ne peut pas repousser l’équipe expurgée (403)', res.status === 403);
  const row = db.prepare(`SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'`).get(SHOP);
  ok('…donc aucun code n’a disparu de la base', CODES.test(row.data));
}
{
  const res = await storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: owner },
    body: JSON.stringify({ feature: 'team', merchant: SHOP, data: TEAM, baseRev: 1 }) }), env });
  ok('le patron écrit son équipe comme avant', res.status === 200);
}

/* ── 3. Le miroir dérivé, et les deux surfaces qui le lisent ─────────────── */
{
  const res = await get(storeGet, `https://k/api/store?feature=employee-access&merchant=${SHOP}`, owner);
  ok('`employee-access` n’est servi à personne par le coffre générique', res.status === 400);
}
{
  const res = await get(teamLiveGet, `https://k/api/team/live?merchant=${SHOP}`, till);
  const body = await res.text();
  ok('/api/team/live projette le roster sans les codes', res.status === 200 && !CODES.test(body));
}
{
  const res = await get(employeeGet, 'https://k/api/employee', emp);
  const body = await res.text();
  ok('/api/employee ne rend pas au salarié son propre code', res.status === 200 && !CODES.test(body));
}

if (fails) {
  console.log(`\n\x1b[31m✗ ${fails} contrôle(s) échoué(s).\x1b[0m`);
  process.exit(1);
}
console.log('\n\x1b[32m✓ les codes du personnel ne quittent pas la surface qui les gère.\x1b[0m');
