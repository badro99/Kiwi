#!/usr/bin/env node
/* tools/service-settlement-test.mjs — les quatre pannes qui coûtent de l'argent.
 *
 * Ce banc fait tourner les VRAIES Pages Functions (functions/api/order/queue.js
 * et functions/api/sale.js) contre une base SQLite construite depuis schema.sql,
 * avec un vrai cookie employé signé. Ce n'est pas une imitation du serveur :
 * c'est le code qui part en production.
 *
 * Ce qu'on vérifie, et pourquoi chacun a coûté quelque chose :
 *
 *   1. LA COUPURE DE DEUX HEURES. `seen_ts` n'était rafraîchi que par le
 *      téléphone du client. Une session ouverte par un SERVEUR gardait donc
 *      l'horodatage de son ouverture, tombait hors de la fenêtre de présence au
 *      bout de deux heures, et la caisse cessait d'attacher les tournées
 *      suivantes à l'addition. Le dessert n'était pas facturé.
 *
 *   2. LE BALAYAGE PAR NUMÉRO DE TABLE. Le règlement soldait « toute commande
 *      impayée de cette table depuis minuit ». La tablée de midi payait donc
 *      celle du soir, ou l'inverse — au hasard de ce qui restait impayé.
 *
 *   3. LE 503 APRÈS ENCAISSEMENT. La vente était durable, mais l'échec de
 *      l'écriture du plan de salle la faisait rapporter comme un échec de
 *      paiement. Le serveur rechargeait, repayait, et la recette comptait deux
 *      fois le même couvert.
 *
 *   4. L'IDENTIFIANT REJOUÉ. Le même identifiant de vente présenté deux fois ne
 *      doit produire qu'une seule ligne — c'est ce qui rend le point 3 sûr.
 *
 *   node tools/service-settlement-test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';
import * as sale from '../functions/api/sale.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'test-secret-for-this-process-only';
const MERCHANT = 'resto-test';
const STAFF_ID = 'mem-lin';
const HOUR = 3600000;

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

/* ── D1 → node:sqlite, la même façade que tools/live-mock-server.mjs ──────── */
function makeDB() {
  const db = new DatabaseSync(':memory:');
  /* Depuis que les ALTER ne vivent plus en commentaire, schema.sql construit à
   * lui seul une base complète : on le joue tel quel. Si cette ligne casse un
   * jour, c'est que schema.sql a cessé d'être auto-suffisant — exactement ce
   * que tools/d1-schema-test.mjs empêche. */
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
      _exec() { return st.run(); },
    };
    return st;
  };
  return { prepare, batch(s) { return s.map((x) => x._exec()); }, _db: db };
}

const db = makeDB();
const env = { DB: db, AUTH_SECRET };
const raw = (sql, ...args) => db._db.prepare(sql).all(...args);
const exec = (sql, ...args) => db._db.prepare(sql).run(...args);

function doc(feature, data) {
  exec('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)',
    MERCHANT, feature, JSON.stringify(data), Date.now());
}

function seed() {
  exec('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)',
    MERCHANT, JSON.stringify({ orderpro: true }), Date.now());
  /* La carte : c'est elle qui tarife, jamais la tablette (priceOrder). */
  exec('INSERT INTO menus (merchant, data, updated_ts) VALUES (?, ?, ?)', MERCHANT, JSON.stringify({
    stations: [{ id: 'kitchen', name: 'Cuisine' }], kitchenId: 'kitchen',
    cats: [{ id: 'c1', name: 'Plats', station: 'kitchen' }],
    items: [
      { id: 'i1', name: 'Tagine', price: 90, catId: 'c1', avail: true },
      { id: 'i2', name: 'Dessert', price: 40, catId: 'c1', avail: true },
    ],
  }), Date.now());
  const member = {
    id: STAFF_ID, firstName: 'Lin', lastName: 'Ilin', email: 'lin@example.com',
    pinCode: '3535', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT,
  };
  doc('employee-access', { members: [member] });
  doc('team', { members: [member] });
  doc('attendance', { entries: [{ memberId: STAFF_ID, name: 'Lin Ilin', inTs: Date.now() - 4 * HOUR }] });
  /* Trois tables, aucun serveur affecté : c'est le cas courant, et celui où
     « toutes les tables » entre dans la portée de l'employé. */
  doc('floorplan', { tables: [{ num: '3' }, { num: '4' }, { num: '5' }], staff: [] });
}

async function cookieHeader() {
  const token = await employeeToken(AUTH_SECRET, { merchant: MERCHANT, staffId: STAFF_ID });
  return `${EMPLOYEE_COOKIE}=${token}`;
}

async function post(handler, body, cookie) {
  const request = new Request('https://kiwi.test/api/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const response = await handler({ request, env });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function get(handler, url, cookie) {
  const request = new Request(url, { headers: { Cookie: cookie } });
  const response = await handler({ request, env });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const sessionsOf = (table) =>
  raw('SELECT id, status, seen_ts, opened_ts FROM table_sessions WHERE merchant = ? AND table_no = ?', MERCHANT, table);

async function main() {
  seed();
  const cookie = await cookieHeader();

  /* ── 1. La coupure de deux heures ─────────────────────────────────────── */
  console.log('\n1 · La table qui cesse d\'être facturée après deux heures');

  const opened = await post(queue.onRequestPost,
    { merchant: MERCHANT, openTable: '3', covers: 2 }, cookie);
  check('confirmer les couverts ouvre immédiatement la visite',
    opened.status === 200 && opened.body && opened.body.session, JSON.stringify(opened.body));
  const visit = opened.body && opened.body.session;
  const premature = await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '3', session: visit, amount: 10, method: 'cash' }, cookie);
  check('une table sans commande envoyée ne peut pas être encaissée',
    premature.status === 409 && premature.body.error === 'send-order-before-payment', JSON.stringify(premature.body));
  const first = await post(queue.onRequestPost,
    { merchant: MERCHANT, create: true, mode: 'table', table: '3', lines: [{ id: 'i1', qty: 2 }] }, cookie);
  check('le serveur peut lancer une commande', first.status === 200 && first.body && first.body.ok,
    JSON.stringify(first.body));
  check('la commande rejoint la visite ouverte aux couverts', first.body && first.body.session === visit);

  /* On vieillit la session de trois heures — le dîner qui dure. */
  exec('UPDATE table_sessions SET seen_ts = ?, opened_ts = ? WHERE id = ?',
    Date.now() - 3 * HOUR, Date.now() - 3 * HOUR, visit);

  const staleBefore = sessionsOf('3')[0];
  check('la session est bien devenue « ancienne »', Date.now() - staleBefore.seen_ts > 2 * HOUR);

  /* Le sondage du serveur en service est le battement de cœur : il doit la
     ramener dans la fenêtre de présence. */
  const poll = await get(queue.onRequestGet,
    `https://kiwi.test/api/order/queue?merchant=${MERCHANT}&since=0&role=service`, cookie);
  check('le sondage du serveur aboutit', poll.status === 200, JSON.stringify(poll.body));
  const refreshed = sessionsOf('3')[0];
  check('le sondage rafraîchit seen_ts', Date.now() - refreshed.seen_ts < 60000,
    `âge : ${Math.round((Date.now() - refreshed.seen_ts) / 60000)} min`);

  /* Et la caisse doit revoir la table comme occupée. */
  const deskPoll = await get(queue.onRequestGet,
    `https://kiwi.test/api/order/queue?merchant=${MERCHANT}&since=0`, cookie);
  const seatedTables = (deskPoll.body.sessions || []).map((s) => s.table);
  check('la caisse voit encore la table 3 occupée', seatedTables.includes('3'),
    `sessions vues : ${JSON.stringify(seatedTables)}`);

  /* La deuxième tournée, trois heures après la première, doit rejoindre la
     MÊME visite — c'est elle qui n'était plus facturée. */
  exec('UPDATE table_sessions SET seen_ts = ? WHERE id = ?', Date.now() - 3 * HOUR, visit);
  const dessert = await post(queue.onRequestPost,
    { merchant: MERCHANT, create: true, mode: 'table', table: '3', lines: [{ id: 'i2', qty: 2 }] }, cookie);
  check('le dessert part bien en cuisine', dessert.status === 200 && dessert.body.ok);
  check('le dessert rejoint la visite en cours', dessert.body.session === visit,
    `${dessert.body.session} ≠ ${visit}`);
  const touched = sessionsOf('3')[0];
  check('commander rafraîchit aussi seen_ts', Date.now() - touched.seen_ts < 60000);

  const afterDessert = await get(queue.onRequestGet,
    `https://kiwi.test/api/order/queue?merchant=${MERCHANT}&since=0`, cookie);
  check('la caisse reçoit les deux commandes de la table 3',
    (afterDessert.body.orders || []).filter((o) => o.table === '3').length === 2,
    `reçu : ${(afterDessert.body.orders || []).filter((o) => o.table === '3').length}`);

  /* ── 2. Le règlement ne solde que la visite en cours ──────────────────── */
  console.log('\n2 · Une tablée ne paie pas l\'addition d\'une autre');

  /* Une commande impayée d'un service précédent sur LA MÊME table, laissée
     derrière par une fermeture sans encaissement. */
  const orphan = 'ord-orphan-1';
  exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
        created_ts, updated_ts, session_id) VALUES (?, ?, 99, 'table', '3', 250, '[]', 'served', ?, ?, ?)`,
    orphan, MERCHANT, Date.now() - 8 * HOUR, Date.now() - 8 * HOUR, 'tsx-oldvisitoldvisitold1');
  exec(`INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts, closed_ts, closed_by)
        VALUES (?, ?, 'table', '3', 'closed', ?, ?, ?, 'service')`,
    'tsx-oldvisitoldvisitold1', MERCHANT, Date.now() - 9 * HOUR, Date.now() - 9 * HOUR, Date.now() - 8 * HOUR);

  const paid = await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '3', amount: 260, method: 'cash', id: 'employee-pay3-emp', lines: [] }, cookie);
  check('le règlement aboutit', paid.status === 200 && paid.body.ok, JSON.stringify(paid.body));

  const orphanRow = raw('SELECT paid_ts FROM orders WHERE id = ?', orphan)[0];
  check('la commande orpheline d\'un service précédent reste IMPAYÉE',
    orphanRow.paid_ts === null,
    'elle a été soldée par le paiement d\'une autre tablée — c\'est le bug d\'origine');

  const visitRows = raw('SELECT id, paid_ts FROM orders WHERE session_id = ?', visit);
  check('les commandes de la visite réglée sont soldées',
    visitRows.length === 2 && visitRows.every((r) => r.paid_ts !== null),
    JSON.stringify(visitRows));
  check('la session de la table est fermée',
    sessionsOf('3').filter((s) => s.status === 'open').length === 0);
  const closureFeed = await get(queue.onRequestGet,
    `https://kiwi.test/api/order/queue?merchant=${MERCHANT}&since=0`, cookie);
  check('la caisse reçoit la fermeture durable de la visite',
    (closureFeed.body.closedSessions || []).some((s) => s.id === visit && s.table === '3'));

  /* ── 3. Une commande sans session, née pendant la visite, est soldée ──── */
  console.log('\n3 · Le bon déposé par la caisse suit l\'addition');

  const second = await post(queue.onRequestPost,
    { merchant: MERCHANT, create: true, mode: 'table', table: '4', lines: [{ id: 'i1', qty: 1 }] }, cookie);
  const visit4 = second.body.session;
  /* createTicket (le bon de caisse) ne pose PAS de session_id. */
  exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
        created_ts, updated_ts) VALUES ('ord-caisse-1', ?, 50, 'table', '4', 60, '[]', 'accepted', ?, ?)`,
    MERCHANT, Date.now(), Date.now());
  await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '4', amount: 150, method: 'cash', id: 'employee-pay4-emp', lines: [] }, cookie);
  check('le bon sans session, né pendant la visite, est soldé',
    raw("SELECT paid_ts FROM orders WHERE id = 'ord-caisse-1'")[0].paid_ts !== null);
  check('la commande de la visite est soldée',
    raw('SELECT paid_ts FROM orders WHERE session_id = ?', visit4).every((r) => r.paid_ts !== null));

  /* ── 4. L'argent enregistré n'est jamais rapporté comme un échec ──────── */
  console.log('\n4 · Une vente durable ne se rapporte pas comme un échec');

  const visit5 = 'tsx-settlevisitfive00001';
  exec(`INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts)
        VALUES (?, ?, 'table', '5', 'open', ?, ?)`, visit5, MERCHANT, Date.now(), Date.now());
  exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
        created_ts, updated_ts, session_id) VALUES ('ord-pay-five', ?, 105, 'table', '5', 90, '[]', 'served', ?, ?, ?)`,
    MERCHANT, Date.now(), Date.now(), visit5);
  const before = raw('SELECT COUNT(*) AS n FROM sales')[0].n;
  const replay = await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '5', session: visit5, amount: 90, method: 'cash', id: 'employee-pay5-emp', lines: [] }, cookie);
  check('le premier règlement répond 200', replay.status === 200 && replay.body.ok);
  const again = await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '5', session: visit5, amount: 90, method: 'cash', id: 'employee-pay5-emp', lines: [] }, cookie);
  check('le rejeu du MÊME identifiant répond encore 200', again.status === 200 && again.body.ok);
  check('…et n\'a créé qu\'UNE vente',
    raw('SELECT COUNT(*) AS n FROM sales')[0].n === before + 1,
    `${raw('SELECT COUNT(*) AS n FROM sales')[0].n - before} ligne(s) créée(s)`);

  /* Un identifiant DIFFÉRENT ne peut plus doubler la même visite : l'identité
     financière vient de la session, partagée par caisse et employé. */
  await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '5', session: visit5, amount: 90, method: 'cash', id: 'employee-pay5bis-emp', lines: [] }, cookie);
  check('un identifiant neuf ne peut plus doubler la même visite',
    raw('SELECT COUNT(*) AS n FROM sales')[0].n === before + 1);

  /* Le cœur du problème : un règlement dont l'écriture du plan de salle
     ÉCHOUE. On le provoque proprement — settleServiceTable refuse une table
     absente du plan — et on vérifie que la vente est quand même enregistrée ET
     rapportée comme un succès. Avant, cette réponse était un 503 : le serveur
     lisait « paiement non enregistré », rechargeait, repayait. */
  const beforeFail = raw('SELECT COUNT(*) AS n FROM sales')[0].n;
  const visit9 = 'tsx-settlevisitnine00001';
  exec(`INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts)
        VALUES (?, ?, 'table', '9', 'open', ?, ?)`, visit9, MERCHANT, Date.now(), Date.now());
  exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
        created_ts, updated_ts, session_id) VALUES ('ord-pay-nine', ?, 109, 'table', '9', 120, '[]', 'served', ?, ?, ?)`,
    MERCHANT, Date.now(), Date.now(), visit9);
  const pending = await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '9', session: visit9, amount: 120, method: 'cash', id: 'employee-pay9-emp', lines: [] }, cookie);
  check('un règlement dont le plan de salle échoue répond 200, pas 503',
    pending.status === 200 && pending.body && pending.body.ok === true,
    `reçu ${pending.status} · ${JSON.stringify(pending.body)}`);
  check('…et le dit franchement (settlementPending)', pending.body && pending.body.settlementPending === true,
    JSON.stringify(pending.body));
  check('…et l\'argent est bien en base',
    raw('SELECT COUNT(*) AS n FROM sales')[0].n === beforeFail + 1);
  check('…et un rejeu ne double toujours pas la recette', await (async () => {
    await post(sale.onRequestPost,
      { merchant: MERCHANT, table: '9', session: visit9, amount: 120, method: 'cash', id: 'employee-pay9-emp', lines: [] }, cookie);
    return raw('SELECT COUNT(*) AS n FROM sales')[0].n === beforeFail + 1;
  })());

  /* ── 5. La porte reste fermée à qui n'est pas en service ──────────────── */
  console.log('\n5 · Les garde-fous n\'ont pas bougé');
  const noCookie = await post(queue.onRequestPost,
    { merchant: MERCHANT, create: true, mode: 'table', table: '3', lines: [{ id: 'i1', qty: 1 }] }, '');
  check('sans cookie employé, la commande est refusée', noCookie.status === 403,
    `reçu ${noCookie.status}`);
  const offShift = await post(sale.onRequestPost,
    { merchant: MERCHANT, table: '3', amount: 10, method: 'cash', id: 'x-emp', lines: [] }, '');
  check('sans cookie employé, le règlement est refusé', offShift.status === 403,
    `reçu ${offShift.status}`);

  console.log(failures ? `\n${failures} échec(s)\n` : '\nTout passe.\n');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => { console.error(error); process.exitCode = 2; });
