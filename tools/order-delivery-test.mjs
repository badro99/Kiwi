#!/usr/bin/env node
/* tools/order-delivery-test.mjs — aucune commande ne se perd en chemin.
 *
 * Trois pertes silencieuses, toutes de la même famille : la commande EXISTE en
 * base, le client ne la voit jamais, et personne n'est averti. Elles ne se
 * manifestent qu'à l'addition, en moins.
 *
 *   1. LE CURSEUR D'UNE MILLISECONDE. Les sondages avancent avec `since` et le
 *      serveur ne rend que `updated_ts > since`. Comme `now` est pris AVANT la
 *      lecture, une commande écrite entre les deux n'est vue ni à ce tour ni au
 *      suivant. Jamais présentée, donc jamais attachée à l'addition.
 *
 *   2. DEUX SESSIONS SUR UNE TABLE. Le filtre du serveur gardait UN identifiant
 *      de visite par table dans une Map : la seconde écrasait la première, et
 *      les commandes du serveur perdant disparaissaient de son écran.
 *
 *   3. LA PRÉSENTATION UNIQUE. `delta` ne montre une commande qu'une fois. La
 *      caisse avait le droit de la refuser (table pas encore chargée, session
 *      qui ne correspond pas) — et un refus valait perte définitive.
 *
 *   node tools/order-delivery-test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';
import { CURSOR_LAG_MS } from '../functions/api/order/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'test-secret-for-this-process-only';
const MERCHANT = 'resto-delivery';
const STAFF_ID = 'mem-ali';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

function makeDB() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) db.exec(stmt);
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
const raw = (sql, ...a) => db._db.prepare(sql).all(...a);
const exec = (sql, ...a) => db._db.prepare(sql).run(...a);
const doc = (feature, data) => exec(
  'INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)',
  MERCHANT, feature, JSON.stringify(data), Date.now());

function seed() {
  exec('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)',
    MERCHANT, JSON.stringify({ orderpro: true }), Date.now());
  exec('INSERT INTO menus (merchant, data, updated_ts) VALUES (?, ?, ?)', MERCHANT, JSON.stringify({
    stations: [{ id: 'kitchen' }], kitchenId: 'kitchen',
    cats: [{ id: 'c1', station: 'kitchen' }],
    items: [{ id: 'i1', name: 'Tagine', price: 90, catId: 'c1', avail: true }],
  }), Date.now());
  const member = { id: STAFF_ID, firstName: 'Ali', lastName: 'B', email: 'a@b.c',
    pinCode: '1111', function: 'Serveur', venueSlug: MERCHANT };
  doc('employee-access', { members: [member] });
  doc('team', { members: [member] });
  doc('attendance', { entries: [{ memberId: STAFF_ID, inTs: Date.now() - 3600000 }] });
  doc('floorplan', { tables: [{ num: '3' }, { num: '7' }], staff: [] });
}

async function cookieHeader() {
  return `${EMPLOYEE_COOKIE}=${await employeeToken(AUTH_SECRET, { merchant: MERCHANT, staffId: STAFF_ID })}`;
}
async function post(body, cookie) {
  const request = new Request('https://kiwi.test/api/order/queue', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  });
  const r = await queue.onRequestPost({ request, env });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function poll(since, role, cookie) {
  const url = `https://kiwi.test/api/order/queue?merchant=${MERCHANT}&since=${since}`
    + (role ? `&role=${role}` : '');
  const r = await queue.onRequestGet({ request: new Request(url, { headers: { Cookie: cookie } }), env });
  return { status: r.status, body: await r.json().catch(() => null) };
}

/* ═══ 3. Le bloc de rattrapage de la caisse, exécuté pour de vrai ═══════════
 * On EXTRAIT le bloc de kiwi-caisse.html et on le fait tourner avec des
 * dépendances de test. Ce n'est pas un contrôle de motif : les décisions
 * (ignorer ce qui est déjà attaché, retenter ce qui ne l'est pas, n'avertir
 * qu'une fois) sont réellement exécutées. Si le bloc déménage, l'extraction
 * échoue bruyamment — ce qui est le bon comportement. */
function extractReconciliation() {
  const src = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
  const start = src.indexOf('const attachedOrders = new Set();');
  const end = src.indexOf('const pend = new Map();', start);
  if (start < 0 || end < 0) return null;
  return src.slice(start, end);
}

function runReconciliation(body, world) {
  const fn = new Function(
    'all', 'tableOrders', 'tableKey', 'caisseTableId', 'opUnmatchedTables',
    'attachOrderProTable', 'toast', 'console',
    `let touched = false;\n${body}\nreturn touched;`,
  );
  return fn(world.all, world.tableOrders, world.tableKey, world.caisseTableId,
    world.opUnmatchedTables, world.attachOrderProTable, world.toast, world.console);
}

async function main() {
  seed();
  const cookie = await cookieHeader();

  /* ── 1. Le curseur regarde en arrière ─────────────────────────────────── */
  console.log('\n1 · Une commande écrite pendant la lecture est quand même livrée');

  const made = await post({ merchant: MERCHANT, create: true, mode: 'table', table: '3',
    lines: [{ id: 'i1', qty: 1 }] }, cookie);
  check('la commande est créée', made.status === 200 && made.body.ok, JSON.stringify(made.body));

  const firstPoll = await poll(0, '', cookie);
  const cursor = firstPoll.body.now;
  check('le premier sondage livre la commande',
    (firstPoll.body.orders || []).some((o) => o.id === made.body.id));
  check('le curseur rendu recule bien de la marge',
    Date.now() - cursor >= CURSOR_LAG_MS - 50 && Date.now() - cursor < CURSOR_LAG_MS + 5000,
    `écart : ${Date.now() - cursor} ms (attendu ≈ ${CURSOR_LAG_MS})`);

  /* Le tour suivant doit RE-présenter ce qui est dans la marge. C'est ce
     chevauchement qui rattrape une écriture glissée entre l'heure et la
     lecture ; sans lui, elle n'aurait jamais de deuxième chance. */
  const secondPoll = await poll(cursor, '', cookie);
  check('le sondage suivant re-présente la commande (chevauchement)',
    (secondPoll.body.orders || []).some((o) => o.id === made.body.id),
    'sans chevauchement, une commande écrite dans l\'intervalle est perdue pour toujours');

  const orderTs = raw('SELECT updated_ts FROM orders WHERE id = ?', made.body.id)[0].updated_ts;
  const exact = await poll(orderTs, '', cookie);
  check('un curseur posé pile sur updated_ts l\'exclut (le piège d\'origine)',
    !(exact.body.orders || []).some((o) => o.id === made.body.id));

  /* ── 2. Deux visites ouvertes sur une table ───────────────────────────── */
  console.log('\n2 · Deux sessions sur une table ne cachent plus la moitié des commandes');

  /* On retire l'index unique partiel : c'est exactement l'état d'une base qui
     n'a jamais reçu `table_sessions_live`. */
  exec('DROP INDEX IF EXISTS table_sessions_live');
  const now = Date.now();
  for (const [id, ord] of [['tsx-aaaaaaaaaaaaaaaaaaaaaa', 'ord-dup-a'], ['tsx-bbbbbbbbbbbbbbbbbbbbbb', 'ord-dup-b']]) {
    exec(`INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts)
          VALUES (?, ?, 'table', '7', 'open', ?, ?)`, id, MERCHANT, now, now);
    exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
          created_ts, updated_ts, session_id)
          VALUES (?, ?, 1, 'table', '7', 90, '[]', 'accepted', ?, ?, ?)`, ord, MERCHANT, now, now, id);
  }
  check('la base porte bien deux sessions ouvertes sur la table 7',
    raw("SELECT id FROM table_sessions WHERE merchant=? AND table_no='7' AND status='open'", MERCHANT).length === 2);

  const service = await poll(0, 'service', cookie);
  const seen = (service.body.orders || []).map((o) => o.id);
  check('les commandes des DEUX sessions sont visibles',
    seen.includes('ord-dup-a') && seen.includes('ord-dup-b'),
    `vu : ${JSON.stringify(seen)} — avant, la Map en écrasait une`);
  check('le doublon est signalé, pas avalé en silence',
    Array.isArray(service.body.service && service.body.service.duplicateVisits)
    && service.body.service.duplicateVisits.some((d) => d.table === '7'),
    JSON.stringify(service.body.service && service.body.service.duplicateVisits));

  /* ── 3. La seconde chance de la caisse ────────────────────────────────── */
  console.log('\n3 · Une commande refusée une fois n\'est plus perdue pour toujours');

  const block = extractReconciliation();
  check('le bloc de rattrapage est bien présent dans kiwi-caisse.html', !!block,
    'introuvable — le test doit être remis en face du code');
  if (!block) { console.log(`\n${failures} échec(s)\n`); process.exitCode = 1; return; }

  const attached = [];
  const warned = [];
  const world = {
    tableOrders: { T3: [{ orderProLine: 'ord-known:0' }] },
    tableKey: (v) => String(v || '').toUpperCase().replace(/\s+/g, ''),
    caisseTableId: (v) => (String(v) === '3' ? 'T3' : ''),   // la table 9 n'est pas au plan
    opUnmatchedTables: new Set(),
    attachOrderProTable: (o) => { attached.push(o.id); return true; },
    toast: (m) => warned.push(m),
    console: { warn() {} },
    all: [
      { id: 'ord-known', mode: 'table', table: '3', status: 'accepted' },   // déjà attachée
      { id: 'ord-missed', mode: 'table', table: '3', status: 'accepted' },  // refusée au premier tour
      { id: 'ord-paid', mode: 'table', table: '3', status: 'served', paid: true },
      { id: 'ord-caisse', mode: 'table', table: '3', status: 'accepted', channel: 'caisse' },
      { id: 'ord-nowhere', mode: 'table', table: '9', status: 'accepted' }, // table absente du plan
    ],
  };

  const touched = runReconciliation(block, world);
  check('la commande manquée est rattrapée', attached.includes('ord-missed'));
  check('la commande déjà attachée n\'est pas ré-attachée', !attached.includes('ord-known'));
  check('une commande réglée est laissée tranquille', !attached.includes('ord-paid'));
  check('un bon de caisse suit son propre chemin', !attached.includes('ord-caisse'));
  check('une table absente du plan ne rattache rien', !attached.includes('ord-nowhere'));
  check('…mais elle est signalée à l\'écran', warned.length === 1, JSON.stringify(warned));
  check('le sondage se déclare modifié', touched === true);

  /* Deuxième tour : rien de neuf ne doit être attaché, et l'avertissement ne
     doit pas se répéter à chaque sondage — sinon la caisse crie toutes les six
     secondes et le message perd tout son sens. */
  world.tableOrders.T3.push({ orderProLine: 'ord-missed:0' });
  attached.length = 0;
  runReconciliation(block, world);
  check('au tour suivant, plus rien à rattraper', attached.length === 0, JSON.stringify(attached));
  check('l\'avertissement ne se répète pas', warned.length === 1, `${warned.length} avertissement(s)`);

  /* Et quand la table réapparaît au plan (chargement tardif, renommage annulé),
     la commande rentre enfin — c'est tout l'intérêt de réessayer. */
  world.caisseTableId = (v) => (String(v) === '3' ? 'T3' : (String(v) === '9' ? 'T9' : ''));
  runReconciliation(block, world);
  check('la table revenue au plan récupère sa commande', attached.includes('ord-nowhere'));

  /* ── 4. Une seule source pour l'addition ──────────────────────────────── */
  console.log('\n4 · Le document d\'occupation ne porte plus d\'addition');

  const events = await import('../functions/api/service/events.js');
  const evPost = async (body) => {
    const request = new Request('https://kiwi.test/api/service/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
    const r = await events.onRequestPost({ request, env });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  /* Un client d'une version antérieure envoie encore ses lignes. Le serveur doit
     les ignorer sans se plaindre — et surtout ne pas les stocker, sinon la
     deuxième vérité revient par la porte de derrière. */
  const pushed = await evPost({ merchant: MERCHANT, state: {
    table: '3', status: 'ka-yaklo', covers: 2, syncVersion: 4,
    lines: [{ key: 'k1', id: 'i1', name: 'Fantôme', price: 999, qty: 3 }],
  } });
  check('un état d\'occupation est accepté', pushed.status === 200 && pushed.body.ok,
    JSON.stringify(pushed.body));
  const stored = JSON.parse(raw(
    "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'", MERCHANT)[0].data);
  check('aucune ligne d\'addition n\'est stockée',
    !JSON.stringify(stored.states || {}).includes('Fantôme'),
    JSON.stringify(stored.states));
  check('l\'occupation, elle, est bien gardée',
    stored.states && stored.states['3'] && stored.states['3'].status === 'ka-yaklo'
    && stored.states['3'].covers === 2, JSON.stringify(stored.states));

  /* Le bon saisi AU COMPTOIR doit atteindre le serveur. C'est ce que les lignes
     recopiées faisaient avant ; il passe maintenant par la file, parce que le
     bon de caisse rejoint la visite de la table au lieu de flotter sans
     session — sans quoi le filtre de l'app employé ne l'aurait jamais montré. */
  const tillCookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;
  const fromTill = await post({ merchant: MERCHANT, create: {
    id: 'ord-comptoir-1', mode: 'table', table: '3', server: 'Caissier',
    lines: [{ name: 'Thé', qty: 2, unitPrice: 15 }],
  } }, tillCookie);
  check('la caisse dépose son bon', fromTill.status === 200 && fromTill.body.ok,
    JSON.stringify(fromTill.body));
  check('le bon de caisse est rattaché à la visite de la table',
    !!raw("SELECT session_id FROM orders WHERE id = 'ord-comptoir-1'")[0].session_id,
    'sans session, l\'app employé ne le verra jamais');
  const serviceSees = await poll(0, 'service', cookie);
  check('le serveur voit l\'article saisi au comptoir',
    (serviceSees.body.orders || []).some((o) => o.id === 'ord-comptoir-1'),
    `vu : ${JSON.stringify((serviceSees.body.orders || []).map((o) => o.id))}`);

  /* ── 5. Le mode dégradé s'annonce ─────────────────────────────────────── */
  console.log('\n5 · Une base incomplète le DIT');

  const healthy = await poll(0, '', cookie);
  check('base complète : rien à signaler', healthy.body.degraded === undefined,
    JSON.stringify(healthy.body.degraded));

  /* L'index qui la nomme part d'abord — SQLite refuse de laisser un index
     pendre sur une colonne disparue. Une base qui n'a jamais reçu la
     migration n'a ni l'un ni l'autre, ce qui est bien l'état simulé. */
  exec('DROP INDEX IF EXISTS idx_orders_session');
  exec('DROP INDEX IF EXISTS orders_client_ref');
  exec('ALTER TABLE orders DROP COLUMN session_id');
  const hurt = await poll(0, '', cookie);
  check('colonne absente : la réponse la nomme',
    Array.isArray(hurt.body.degraded) && hurt.body.degraded.includes('session_id'),
    `reçu : ${JSON.stringify(hurt.body.degraded)}`);
  check('…et la file continue de répondre', hurt.status === 200 && hurt.body.ok === true);

  console.log(failures ? `\n${failures} échec(s)\n` : '\nTout passe.\n');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => { console.error(error); process.exitCode = 2; });
