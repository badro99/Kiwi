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
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE employee_auth_versions (merchant TEXT NOT NULL, member_id TEXT NOT NULL, auth_version INTEGER NOT NULL DEFAULT 0, pin_digest TEXT NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, member_id));
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status,session_epoch) VALUES ('acc-1','o@amira.ma','Amira Boutique','s','h',?,'active',0)`).run(now);
db.prepare(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?, '{}','pro','boutique','acc-1','Amira Boutique','active',0,?)`).run(SHOP, now);

const TEAM = { members: [
  { id: 'm1', firstName: 'Samira', lastName: 'L.', email: 'samira@amira.ma', function: 'Caissier',      department: 'Salle',     pinCode: '2580', password: '2580' },
  { id: 'm2', firstName: 'Rachid', lastName: 'O.', email: 'rachid@amira.ma', function: 'Proprietaire',  department: 'Direction', pinCode: '1379', password: '1379' },
], hours: {}, shifts: {} };
const ACCESS = { members: TEAM.members.map((m) => ({ ...m, venueSlug: SHOP })) };
db.prepare(`INSERT INTO store_docs VALUES (?,'team',?,1,?)`).run(SHOP, JSON.stringify(TEAM), now);
db.prepare(`INSERT INTO store_docs VALUES (?,'employee-access',?,1,?)`).run(SHOP, JSON.stringify(ACCESS), now);
db.prepare(`INSERT INTO store_docs VALUES (?,'attendance',?,1,?)`).run(SHOP, JSON.stringify({ entries: [] }), now);
const AGENT_ACTIONS = { items: [{ id: 'a1', action: 'customer-message-draft', args: { phone: '+212600000000' }, status: 'pending' }], versions: [{ id: 'v1', itemId: 'a1', status: 'pending', at: now }] };
db.prepare(`INSERT INTO store_docs VALUES (?,'agentactions',?,1,?)`).run(SHOP, JSON.stringify(AGENT_ACTIONS), now);

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

/* ── 3. Les actions IA restent hors de la caisse appairée ────────────────── */
{
  const res = await get(storeGet, `https://k/api/store?feature=agentactions&merchant=${SHOP}`, till);
  const body = await res.json();
  ok('une caisse appairée lit un Centre d’actions vide', res.status === 200 && Array.isArray(body.data.items) && body.data.items.length === 0 && body.data.versions.length === 0);
}
{
  const res = await storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: till },
    body: JSON.stringify({ feature: 'agentactions', merchant: SHOP, data: { items: [], versions: [] }, baseRev: 1 }) }), env });
  const row = db.prepare(`SELECT data FROM store_docs WHERE merchant = ? AND feature = 'agentactions'`).get(SHOP);
  ok('une caisse appairée ne peut pas réécrire le Centre d’actions (403)', res.status === 403 && /212600000000/.test(row.data));
}

/* ── 3b. Les charges fixes : le compte d'exploitation n'est pas un réglage de
 *        caisse. Loyer, taux de commission et charges sociales restent chez le
 *        propriétaire ; la caisse et l'employé ne les lisent ni ne les écrasent. */
{
  const CHARGES = { v: 1, lines: [{ id: 'c1', label: 'Loyer', cat: 'rent', freq: 'month', versions: [{ from: '2026-01', amount: 8765 }], until: null }],
    social: { rate: 21 }, commissions: { methods: { card: 1.5 }, channels: { glovo: 25 } } };
  db.prepare(`INSERT INTO store_docs VALUES (?,'charges',?,1,?)`).run(SHOP, JSON.stringify(CHARGES), now);
  const SECRET = /8765|Loyer|glovo/;
  for (const [who, cookie] of [['une caisse appairée', till], ['un employé connecté', emp]]) {
    const res = await get(storeGet, `https://k/api/store?feature=charges&merchant=${SHOP}`, cookie);
    const body = await res.text();
    ok(`${who} lit des charges vides, pas le loyer`, (res.status === 200 && !SECRET.test(body)) || res.status === 401 || res.status === 403, `${res.status} ${body.slice(0, 160)}`);
  }
  {
    const res = await get(storeGet, `https://k/api/store?feature=charges&merchant=${SHOP}`, owner);
    const body = await res.json();
    ok('le patron lit ses charges entières', res.status === 200 && body.data.lines[0].versions[0].amount === 8765 && body.data.commissions.channels.glovo === 25);
  }
  {
    const res = await storePost({ request: new Request('https://k/api/store', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: till },
      body: JSON.stringify({ feature: 'charges', merchant: SHOP, data: { lines: [], social: { rate: null }, commissions: { methods: {}, channels: {} } }, baseRev: 1 }) }), env });
    const row = db.prepare(`SELECT data FROM store_docs WHERE merchant = ? AND feature = 'charges'`).get(SHOP);
    ok('une caisse ne peut pas repousser des charges vides (403), le loyer reste', res.status === 403 && /8765/.test(row.data));
  }
  {
    const res = await storePost({ request: new Request('https://k/api/store', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: owner },
      body: JSON.stringify({ feature: 'charges', merchant: SHOP, data: { ...CHARGES, social: { rate: 20 } }, baseRev: 1 }) }), env });
    ok('le patron écrit ses charges', res.status === 200);
  }
}

/* ── 3c. Données de santé, fiches techniques, compte d'exploitation ─────────
 *        `workspaces` et `costs` sont ÉCRITS par la caisse, donc REDACT ne peut
 *        pas les fermer : la caisse en reçoit une vue (PARTIAL dans store.js),
 *        et ce qu'elle n'a pas reçu survit à ce qu'elle renvoie. */
{
  const post = (cookie, feature, data, baseRev) => storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ feature, merchant: SHOP, data, baseRev }) }), env });
  const rowOf = (feature) => JSON.parse(db.prepare(`SELECT data FROM store_docs WHERE merchant = ? AND feature = ?`).get(SHOP, feature).data);
  const revOf = (feature) => db.prepare(`SELECT rev FROM store_docs WHERE merchant = ? AND feature = ?`).get(SHOP, feature).rev;
  const rec = (id, values, at) => ({ id, title: id, status: 3, values, createdAt: at, updatedAt: at, deletedAt: 0 });

  const WS = { trade: 'pharmacie', records: {
    prescriptions: [rec('rx-1', { patient: 'Fatima Zahra K.', doctor: 'Dr Alaoui', note: 'allergie pénicilline' }, now - 5000)],
    insurers: [rec('cl-1', { patient: 'Fatima Zahra K.', payer: 'CNOPS' }, now - 5000)],
    drugs: [rec('dr-1', { dci: 'paracétamol' }, now - 5000)],
  } };
  db.prepare(`INSERT INTO store_docs VALUES (?,'workspaces',?,1,?)`).run(SHOP, JSON.stringify(WS), now);
  const HEALTH = /Fatima|Alaoui|pénicilline|CNOPS/;
  for (const [who, cookie] of [['une caisse appairée', till], ['un employé connecté', emp]]) {
    const res = await get(storeGet, `https://k/api/store?feature=workspaces&merchant=${SHOP}`, cookie);
    const body = await res.text();
    ok(`${who} ne lit ni ordonnance ni dossier de tiers payant`, (res.status === 200 && !HEALTH.test(body)) || res.status === 401 || res.status === 403, `${res.status} ${body.slice(0, 200)}`);
    if (res.status === 200) ok(`…mais garde les fiches médicament dont la vente a besoin (${who})`, /paracétamol/.test(body));
  }
  {
    const res = await get(storeGet, `https://k/api/store?feature=workspaces&merchant=${SHOP}`, owner);
    ok('le titulaire lit ordonnances et dossiers', res.status === 200 && HEALTH.test(await res.text()));
  }
  {
    /* La caisse renvoie la vue qu'elle a reçue, plus l'ordonnance qu'elle vient de délivrer. */
    const view = JSON.parse(await (await get(storeGet, `https://k/api/store?feature=workspaces&merchant=${SHOP}`, till)).text()).data;
    view.records.prescriptions = [rec('rx-2', { patient: 'Youssef B.' }, now)];
    const res = await post(till, 'workspaces', view, 1);
    const body = await res.text();
    const row = rowOf('workspaces');
    const rx = row.records.prescriptions.map((r) => r.id).sort().join(',');
    ok('la caisse dépose une ordonnance délivrée sans effacer les autres', res.status === 200 && rx === 'rx-1,rx-2' && row.records.insurers.length === 1, `${res.status} ${rx} ${body.slice(0, 120)}`);
    ok('…et la réponse ne lui rend rien de ce qu’elle ne lit pas', !HEALTH.test(body));
  }
  {
    const res = await post(till, 'workspaces', { trade: 'pharmacie', records: { drugs: [] } }, 1);
    const body = await res.text();
    ok('un conflit de révision rend à la caisse la vue, pas le document entier', res.status === 409 && !HEALTH.test(body) && !/Youssef/.test(body), `${res.status} ${body.slice(0, 160)}`);
  }
  {
    const full = rowOf('workspaces');
    full.records.prescriptions = full.records.prescriptions.filter((r) => r.id !== 'rx-1');
    const res = await post(owner, 'workspaces', full, revOf('workspaces'));
    ok('le titulaire, lui, peut retirer une ordonnance', res.status === 200 && rowOf('workspaces').records.prescriptions.map((r) => r.id).join(',') === 'rx-2');
  }

  const COSTS = { items: { 'm-1': { cost: 12.5, at: now } }, ingredients: [{ id: 'i-1', name: 'Farine', price: 9, at: now }], recipes: {},
    charges: [{ id: 'c1', label: 'Loyer du local', amount: 9123 }], targets: { foodCostPct: 31 }, seq: 1 };
  db.prepare(`INSERT INTO store_docs VALUES (?,'costs',?,1,?)`).run(SHOP, JSON.stringify(COSTS), now);
  {
    const res = await get(storeGet, `https://k/api/store?feature=costs&merchant=${SHOP}`, till);
    const body = JSON.parse(await res.text());
    ok('la caisse lit les coûts dont elle gèle la vente, pas les charges ni les objectifs',
      res.status === 200 && body.data.items['m-1'].cost === 12.5 && body.data.ingredients.length === 1 && body.data.charges.length === 0 && !Object.keys(body.data.targets).length);
    const back = await post(till, 'costs', { ...body.data, items: { 'm-1': { cost: 13, at: now + 1 } } }, 1);
    const row = rowOf('costs');
    ok('…et ce qu’elle renvoie n’efface pas les charges ni les objectifs', back.status === 200 && row.charges[0].amount === 9123 && row.targets.foodCostPct === 31 && row.items['m-1'].cost === 13);
  }

  db.prepare(`INSERT INTO store_docs VALUES (?,'recipes',?,1,?)`).run(SHOP, JSON.stringify({ items: { 'r-1': { name: 'Tajine', lines: [{ g: 180 }] } } }), now);
  {
    const res = await get(storeGet, `https://k/api/store?feature=recipes&merchant=${SHOP}`, till);
    const body = await res.text();
    ok('la caisse ne lit pas les fiches techniques du tableau de bord', res.status === 200 && !/Tajine/.test(body));
    const w = await post(till, 'recipes', { items: {} }, 1);
    ok('…et ne peut pas les réécrire (403)', w.status === 403 && /Tajine/.test(JSON.stringify(rowOf('recipes'))));
    const o = await get(storeGet, `https://k/api/store?feature=recipes&merchant=${SHOP}`, owner);
    ok('le patron les lit', /Tajine/.test(await o.text()));
  }
}

/* ── 4. Le miroir dérivé, et les deux surfaces qui le lisent ─────────────── */
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
