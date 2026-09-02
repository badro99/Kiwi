#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · le relais OrderPro — prix, présence, session, transitions.
 *
 *   node tools/orderpro-relay-test.js
 *
 * Les trois portes du relais (/api/order, /api/order/session, /api/order/queue)
 * ont chacune l'air juste isolément. Ce qui casse, c'est leur RELATION : un prix
 * qu'on croit vérifié et qui vient du téléphone, une session qu'on croit fermée
 * et qui laisse encore commander, une étape franchie qu'un deuxième tap défait.
 * Aucune de ces pannes ne se voit à l'écran, et aucune ne se voyait sans
 * déployer.
 *
 * Contrairement aux autres bancs du dépôt, celui-ci n'imite pas D1 : il ouvre un
 * SQLite en mémoire sur le VRAI schema.sql. C'est indispensable — la moitié des
 * règles vérifiées ici sont tenues par le SQL lui-même (index unique partiel,
 * UPDATE conditionné à l'état de départ, RETURNING vide), et une fausse base
 * aurait répondu « oui » à tout ça sans rien prouver.
 *
 *   1. PRIX        le téléphone propose, la carte publiée dispose
 *   2. PRÉSENCE    comptoir éteint ⇒ plus personne ne commande
 *   3. SESSION     une par table, partagée, révocable, périmable
 *   4. TRANSITIONS pending → accepted → ready → served, et rien d'autre
 *   5. TENANCY     un slug ne donne pas la file, ni les commandes d'un autre
 *   6. IDEMPOTENCE un double-tap n'imprime pas deux tickets
 *   7. ADDITION    encaisser ferme la session et solde ses commandes
 *   8. SALLE       « Lancer la commande » part vraiment en cuisine
 * ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, sessionCookie, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as placeOrder, onRequestGet as readOrder } from '../functions/api/order/index.js';
import { onRequestPost as openSession, onRequestGet as readSession } from '../functions/api/order/session.js';
import { onRequestPost as queuePost, onRequestGet as queueGet } from '../functions/api/order/queue.js';
import { startOfWeek } from '../functions/api/order/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret-not-a-real-key';
const SLUG = 'chez-nadia';
const OTHER = 'chez-rival';
const ACC = 'acc-nadia';

let pass = 0; const fails = [];
const ok = (l, c, d) => { if (c) pass++; else fails.push(l + (d ? ' — ' + d : '')); };

/* ── D1 sur du vrai SQLite ─────────────────────────────────────────────────
 * Même adaptateur que tools/live-mock-server.mjs : `meta.changes` n'est pas
 * décoratif, plusieurs handlers s'en servent pour distinguer « mis à jour » de
 * « rien ne correspondait ». */
function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  };
  return { prepare, _db: db };
}

const DB = makeDB();
const env = { DB, AUTH_SECRET: SECRET };

/* ── amorçage ─────────────────────────────────────────────────────────────── */
const CARTE = {
  cats: [{ id: 'c1', name: 'Plats', station: 'cuisson', sub: [] }],
  stations: [{ id: 'cuisson', name: 'Cuisine' }],
  items: [
    { id: 'i1', name: 'Tajine poulet', price: 90, catId: 'c1', avail: true },
    { id: 'i2', name: 'Thé à la menthe', price: 15, catId: 'c1', avail: true },
    { id: 'i3', name: 'Pastilla', price: 120, catId: 'c1', avail: false },
    { id: 'i4', name: 'Continental', price: 68, catId: 'c1', avail: true, opts: ['egg-style'],
      formula: { slots: [{ id: 'drink', label: 'Boisson', min: 1, max: 1, choices: [
        { itemId: 'i5', extra: 0 }, { itemId: 'i6', extra: 20 },
      ] }] } },
    { id: 'i5', name: 'Carrot Juice', price: 28, catId: 'c1', avail: true, formulaOnly: true },
    { id: 'i6', name: 'Coconut Matcha', price: 63, catId: 'c1', avail: true, formulaOnly: true },
    { id: 'i7', name: 'Ancien dessert', price: 40, catId: 'c1', avail: true, archived: true },
  ],
  opts: [{ id: 'egg-style', name: 'Œufs', kind: 'one', required: true, choices: [
    { id: 'fried', name: 'Œufs au plat', price: 0, emoji: '🍳' },
  ] }],
};
function seed() {
  const now = Date.now();
  DB._db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(ACC, 'nadia@example.ma', 'Nadia', 'Chez Nadia', 's', 'h', now);
  for (const [m, feat] of [[SLUG, '{"orderpro":true}'], [OTHER, '{"orderpro":true}']]) {
    DB._db.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,updated_ts) VALUES (?,?,?,?,?)')
      .run(m, feat, 'restaurant', m === SLUG ? ACC : 'acc-other', now);
  }
  DB._db.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)')
    .run(SLUG, 'Chez Nadia', 'restaurant', JSON.stringify(CARTE), now);
  DB._db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(SLUG, 'floorplan', JSON.stringify({ tables: [{ id: 'T7', num: 'T7' }] }), 1, now);
}
const deskAt = (ts) => DB._db.prepare(
  'INSERT INTO order_desk (merchant,seen_ts) VALUES (?,?) ON CONFLICT(merchant) DO UPDATE SET seen_ts=excluded.seen_ts'
).run(SLUG, ts);

/* ── appels ───────────────────────────────────────────────────────────────── */
const J = async (r) => { try { return await r.json(); } catch (_) { return null; } };
async function post(fn, body, headers = {}) {
  const request = new Request('https://k.test/api/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const res = await fn({ request, env });
  return { status: res.status, body: await J(res) };
}
async function get(fn, qs, headers = {}) {
  const request = new Request('https://k.test/api/order?' + qs, { method: 'GET', headers });
  const res = await fn({ request, env });
  return { status: res.status, body: await J(res) };
}

(async () => {
  seed();
  const staff = sessionCookie(await makeSession(ACC, SECRET)).split(';')[0];
  const asStaff = { Cookie: staff };
  const line = (id, qty = 1) => ({ id, qty });

  const orderProPage = fs.readFileSync(path.join(ROOT, 'OrderPro.html'), 'utf8');
  const publicOrderPage = fs.readFileSync(path.join(ROOT, 'kiwi-order.html'), 'utf8');
  const caissePage = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
  const kitchenPage = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
  ok('OrderPro affiche OPD sur le retrait',
    /orderNumber\s*=\s*'OPD-'\s*\+\s*String\(res\.number/.test(orderProPage));
  ok('la caisse distingue OP et OPD selon le mode OrderPro',
    /o\.opChannel\s*===\s*'kiwi'[\s\S]{0,320}'OPD-'\s*:\s*'OP-'/.test(caissePage));
  ok('la caisse donne aux commandes employé les initiales du serveur, pas OP',
    /const employeePrefix = orderServerInitials\(o\.server\);[\s\S]{0,100}employeePrefix \+ '-' \+ n/.test(caissePage));
  ok('une session OrderPro occupe la table dans la caisse sans redemander les couverts',
    /function caisseTableId\(v\)/.test(caissePage)
      && /const id = caisseTableId\(s\.table\);[\s\S]{0,180}tables\[id\]\.status = 'ka-yaklo'/.test(caissePage));
  ok('les lignes OrderPro rejoignent une seule fois l’addition de leur table',
    /function attachOrderProTable\(o\)/.test(caissePage)
      && /orderProLine: marker/.test(caissePage)
      && /attachOrderProTable\(o\);/.test(caissePage));
  ok('l\'\u00e9cran cuisine distingue OP et OPD selon le mode OrderPro',
    /o\.channel\s*===\s*'kiwi'[\s\S]{0,320}'OPD-'\s*:\s*'OP-'/.test(kitchenPage));
  ok('l\'écran cuisine affiche les initiales sur un ticket employé',
    /var employeePrefix = serverInitials\(o\.server\);[\s\S]{0,100}employeePrefix \+ '-' \+ n/.test(kitchenPage));
  ok('le paiement employé envoie la référence commande au journal de caisse',
    /const orderRef = serviceTableOrderRef\(id\);[\s\S]{0,2400}label: orderRef,[\s\S]{0,80}ref: orderRef/.test(
      fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8')));
  ok('le QR public ouvre une session de visite avant la commande',
    /fetch\('\/api\/order\/session',\s*\{/.test(publicOrderPage)
      && /ensureTableSession\(\)\.then/.test(publicOrderPage));
  ok('le QR public joint la session à chaque commande à table',
    /table:\s*tableNumber,\s*session:\s*session\s*\|\|\s*undefined/.test(publicOrderPage));
  ok('le QR public sonde la révocation de sa session',
    /setInterval\(check,\s*5000\)/.test(publicOrderPage)
      && /d\.status\s*!==\s*'open'/.test(publicOrderPage));
  ok('le QR ne montre pas un faux succès après un refus serveur',
    /postOrderToTill\(totalNow,\s*linesCopy\)\.then/.test(publicOrderPage)
      && /order_send_failed/.test(publicOrderPage));

  ok('la semaine restaurant commence lundi à minuit au Maroc',
    startOfWeek(Date.parse('2026-08-03T12:00:00Z')) === Date.parse('2026-08-02T23:00:00Z'));
  ok('le dimanche reste dans la semaine qui précède',
    startOfWeek(Date.parse('2026-08-02T12:00:00Z')) === Date.parse('2026-07-26T23:00:00Z'));

  /* ═══ 1. PRIX ═══════════════════════════════════════════════════════════ */
  deskAt(Date.now());
  const priceSession = (await post(openSession, { merchant: SLUG, mode: 'table', table: '7' })).body.session;
  let r = await post(placeOrder, {
    merchant: SLUG, mode: 'table', table: '7', session: priceSession,
    total: 1,                                   // le mensonge
    lines: [{ id: 'i1', qty: 1, name: 'Caviar', unitPrice: 1,
      options: 'Tomate',
      visuals: [{ emoji: '🍅', name: 'Tomate' }] }],
  });
  ok('une commande passe', r.status === 200 && r.body.ok, JSON.stringify(r.body));
  ok('le prix vient de la carte, pas du téléphone', r.body.total === 90, 'total=' + r.body.total);
  ok('le nom aussi', r.body.lines[0].name === 'Tajine poulet', r.body.lines[0].name);
  ok('le poste de la catégorie voyage avec la ligne tarifée',
    r.body.lines[0].station === 'cuisson', JSON.stringify(r.body.lines[0]));
  ok('le repère visuel de l’option arrive avec la ligne',
    r.body.lines[0].visuals[0].emoji === '🍅' && r.body.lines[0].visuals[0].name === 'Tomate',
    JSON.stringify(r.body.lines[0].visuals));
  ok('le libellé de l’option OrderPro arrive lui aussi avec la ligne',
    r.body.lines[0].options === 'Tomate', JSON.stringify(r.body.lines[0]));
  ok('OrderPro ouvre les options avec le même ajout en salle et à emporter',
    /function handleAddClick\(itemId\)[\s\S]{0,220}item\.options && item\.options\.length > 0[\s\S]{0,80}openCustomizer\(item\)/.test(orderProPage)
      && !/function handleAddClick\(itemId\)[\s\S]{0,220}orderMode\s*===/.test(orderProPage));
  ok('OrderPro envoie le texte et les repères visuels choisis',
    /options: describeOptionChoices\(l\)\.map/.test(orderProPage)
      && /visuals: describeOptionVisuals\(l, true\)/.test(orderProPage));
  ok('OrderPro envoie les formules comme parent et composants liés',
    /kind: 'formula', formulaUid, formulaName: nameOf\(l\.id\)/.test(orderProPage)
      && /kind: 'formula-part', formulaUid/.test(orderProPage)
      && /formulaSlotId: slot\.formulaSlotId/.test(orderProPage));
  ok('OrderPro garde un registre séparé pour refuser les ajouts directs périmés',
    /const MENU_ALL = new Map\(\)/.test(orderProPage)
      && /function standaloneMenuItem\(itemId\)[\s\S]{0,260}source\.archived \|\| source\.formulaOnly \|\| source\.avail === false/.test(orderProPage));
  ok('OrderPro applique les bornes min/max des étapes et retire une formule devenue impossible',
    /count < Math\.max\(0, Number\(opt\.min\)/.test(orderProPage)
      && /arr\.length < Math\.max\(1, Number\(def\.max\)/.test(orderProPage)
      && /if \(formulaBroken\) continue;/.test(orderProPage));
  ok('OrderPro envoie les identifiants canoniques des options ordinaires',
    /optionChoices: describeOptionChoices\(l\)/.test(orderProPage)
      && /if \(opt\.formulaSlotId\) continue/.test(orderProPage));
  const priced = DB._db.prepare('SELECT total, priced_ts, menu_rev FROM orders WHERE id=?').get(r.body.id);
  ok('c\'est le prix recalculé qui est écrit', priced.total === 90);
  ok('la révision de carte est horodatée', !!priced.priced_ts && !!priced.menu_rev);

  r = await post(placeOrder, {
    merchant: SLUG, mode: 'table', table: '7', session: priceSession,
    lines: [{ id: 'i1', qty: 1, optionChoices: [{ group: 'absent', label: 'Option fantôme' }] }],
  });
  ok('OrderPro refuse une option invalide au lieu de supprimer silencieusement le plat parent',
    r.status === 409 && r.body.error === 'menu-changed'
      && r.body.invalidOptions && r.body.invalidOptions.length === 1,
    JSON.stringify(r.body));

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', session: priceSession, lines: [line('i1', 2), line('i2', 3)] });
  ok('les quantités multiplient bien', r.body.total === 90 * 2 + 15 * 3, 'total=' + r.body.total);

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', session: priceSession, lines: [line('i5')] });
  ok('un article réservé aux formules est refusé seul avec un motif distinct',
    r.status === 409 && r.body.error === 'formula_only', JSON.stringify(r.body));
  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', session: priceSession, lines: [line('i7')] });
  ok('un article archivé est refusé partout avec un motif distinct',
    r.status === 409 && r.body.error === 'archived', JSON.stringify(r.body));

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', session: priceSession, lines: [line('inconnu')] });
  ok('un plat qui n\'est pas à la carte est refusé', r.status === 409 && r.body.error === 'menu-changed');
  ok('…et on dit lequel', Array.isArray(r.body.unknown) && r.body.unknown[0] === 'inconnu');

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', session: priceSession, lines: [line('i3')] });
  ok('un plat épuisé est refusé', r.status === 409 && r.body.unavailable[0] === 'Pastilla');

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', session: priceSession, lines: [] });
  ok('une commande vide est refusée', r.status === 400 && r.body.error === 'empty-order');

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', lines: [line('i1')] });
  ok('une commande QR sans session de visite est refusée',
    r.status === 409 && r.body.error === 'session-required', JSON.stringify(r.body));

  /* ═══ 2. PRÉSENCE DU COMPTOIR ═══════════════════════════════════════════ */
  deskAt(Date.now() - 30 * 60 * 1000);          // sondé il y a une demi-heure
  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '7', lines: [line('i1')] });
  ok('comptoir éteint ⇒ plus de commande', r.status === 409 && r.body.error === 'service-closed');
  r = await post(openSession, { merchant: SLUG, mode: 'table', table: '7' });
  ok('…ni de session', r.status === 409 && r.body.error === 'service-closed');

  DB._db.prepare('DELETE FROM order_desk').run();
  r = await post(openSession, { merchant: SLUG, mode: 'table', table: '9' });
  ok('comptoir JAMAIS vu ⇒ on laisse passer (migration, 1er jour)', r.status === 200 && r.body.ok);
  DB._db.prepare('DELETE FROM table_sessions').run();
  deskAt(Date.now());

  /* le sondage de la caisse EST le pointage */
  DB._db.prepare('DELETE FROM order_desk').run();
  await get(queueGet, 'merchant=' + SLUG + '&since=0', asStaff);
  const desk = DB._db.prepare('SELECT seen_ts FROM order_desk WHERE merchant=?').get(SLUG);
  ok('le sondage de la caisse pointe la présence', !!desk && (Date.now() - desk.seen_ts) < 5000);

  const staleId = 'ord-stale-test01';
  const staleAt = Date.now() - 31 * 60 * 1000;
  DB._db.prepare(
    `INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(staleId, SLUG, 999, 'takeout', '', 15, '[]', 'pending', staleAt, staleAt);
  r = await get(queueGet, 'merchant=' + SLUG + '&since=0', asStaff);
  ok('une commande test abandonnée ne revient pas après chaque rechargement',
    !r.body.orders.some((o) => o.id === staleId));
  ok('…elle est fermée durablement côté serveur',
    DB._db.prepare('SELECT status FROM orders WHERE id=?').get(staleId).status === 'rejected');

  /* ═══ 3. SESSION ════════════════════════════════════════════════════════ */
  r = await post(openSession, { merchant: SLUG, mode: 'table', table: 'T7' });
  const sess = r.body.session;
  ok('une session s\'ouvre', r.status === 200 && /^tsx-[A-Za-z0-9]{22}$/.test(sess || ''), sess);
  ok('le numéro de table garde ses lettres', r.body.table === 'T7', r.body.table);

  r = await post(openSession, { merchant: SLUG, mode: 'table', table: 'T7' });
  ok('le voisin de table rejoint la MÊME session', r.body.session === sess && r.body.resumed === true);

  r = await post(openSession, { merchant: SLUG, mode: 'takeout' });
  const t1 = r.body.session;
  r = await post(openSession, { merchant: SLUG, mode: 'takeout' });
  ok('deux retraits au comptoir coexistent', t1 && r.body.session && r.body.session !== t1);

  r = await post(openSession, { merchant: SLUG, mode: 'table', table: '' });
  ok('une commande en salle sans table est refusée', r.status === 400 && r.body.error === 'table-required');

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: 'T7', session: sess, lines: [line('i1')] });
  ok('la session accompagne la commande', r.status === 200);
  const bound = DB._db.prepare('SELECT session_id FROM orders WHERE id=?').get(r.body.id);
  ok('…et est écrite sur la ligne', bound.session_id === sess);
  const tableOrderId = r.body.id;

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '3', session: sess, lines: [line('i1')] });
  ok('une session de la 7 ne commande pas pour la 3', r.status === 409 && r.body.error === 'session-table-mismatch');

  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: 'T7', session: 'tsx-AAAAAAAAAAAAAAAAAAAAAA', lines: [line('i1')] });
  ok('une session inventée est refusée', r.status === 409 && r.body.error === 'session-closed');

  r = await get(readSession, 'merchant=' + SLUG + '&session=' + sess);
  ok('le téléphone lit son état', r.status === 200 && r.body.status === 'open');
  r = await get(readSession, 'merchant=' + OTHER + '&session=' + sess);
  ok('…mais pas à travers le slug d\'un autre', r.body.status === 'closed');

  r = await post(openSession, { merchant: SLUG, session: sess, action: 'call-server' });
  let serviceDoc = JSON.parse(DB._db.prepare(
    "SELECT data FROM store_docs WHERE merchant=? AND feature='service-events'"
  ).get(SLUG).data);
  ok('Appeler un serveur publie une notification liée à la table ouverte',
    r.status === 200 && serviceDoc.events.some((event) => event.type === 'guest-call' && event.table === '7'));

  r = await post(openSession, { merchant: SLUG, session: sess, action: 'ask-bill' });
  serviceDoc = JSON.parse(DB._db.prepare(
    "SELECT data FROM store_docs WHERE merchant=? AND feature='service-events'"
  ).get(SLUG).data);
  ok('Demander l’addition passe la table au statut rose dans serveur et caisse',
    r.status === 200 && serviceDoc.states['7'].status === 'bgha-ykhlass'
      && serviceDoc.states['7'].source === 'guest');
  r = await post(openSession, {
    merchant: SLUG, session: 'tsx-AAAAAAAAAAAAAAAAAAAAAA', action: 'call-server',
  });
  ok('une session inventée ne peut pas notifier le personnel',
    r.status === 409 && r.body.error === 'session-closed');

  /* ═══ 4. TRANSITIONS ════════════════════════════════════════════════════ */
  r = await post(queuePost, { merchant: SLUG, id: tableOrderId, status: 'ready' }, asStaff);
  ok('on ne saute pas la cuisine (pending → ready)', r.status === 409 && r.body.error === 'bad-transition');
  ok('…et on dit où elle en est', r.body.status === 'pending');

  r = await post(queuePost, { merchant: SLUG, id: tableOrderId, status: 'accepted', server: 'Yassine' }, asStaff);
  ok('pending → accepted', r.status === 200 && r.body.status === 'accepted');
  ok('le serveur de la table est posé sur le ticket',
    DB._db.prepare('SELECT server_name FROM orders WHERE id=?').get(tableOrderId).server_name === 'Yassine');

  r = await post(queuePost, { merchant: SLUG, id: tableOrderId, status: 'accepted' }, asStaff);
  ok('accepter deux fois ne repart pas', r.status === 409);

  r = await post(queuePost, { merchant: SLUG, id: tableOrderId, status: 'ready' }, asStaff);
  ok('accepted → ready', r.status === 200);
  r = await post(queuePost, { merchant: SLUG, id: tableOrderId, status: 'served' }, asStaff);
  ok('ready → served', r.status === 200);
  r = await post(queuePost, { merchant: SLUG, id: tableOrderId, status: 'accepted' }, asStaff);
  ok('servie, elle ne se rouvre pas', r.status === 409 && r.body.status === 'served');
  r = await post(queuePost, { merchant: SLUG, id: tableOrderId, status: 'rejected' }, asStaff);
  ok('…ni ne se refuse après coup', r.status === 409);

  r = await post(placeOrder, { merchant: SLUG, mode: 'takeout', session: t1, lines: [line('i2')] });
  const rejId = r.body.id;
  r = await post(queuePost, { merchant: SLUG, id: rejId, status: 'rejected' }, asStaff);
  ok('pending → rejected', r.status === 200);
  r = await post(queuePost, { merchant: SLUG, id: rejId, status: 'accepted' }, asStaff);
  ok('refusée, elle est terminale', r.status === 409);

  r = await post(queuePost, { merchant: SLUG, id: 'ord-nexistepas', status: 'accepted' }, asStaff);
  ok('une commande inconnue est un 404, pas un 409', r.status === 404);

  /* ═══ 4bis. « SERVIE » NE VEUT PAS DIRE LA MÊME CHOSE DES DEUX CÔTÉS ═════
     Au comptoir, la remise en main propre est la FIN : il n'y a pas d'addition
     à encaisser plus tard, donc si la session restait ouverte le client
     repartait avec son sac et un lien encore actif.
     En salle, « servie » veut dire que le plat est arrivé sur la table — les
     convives mangent et commanderont peut-être un dessert. Fermer là serait
     leur couper la carte au milieu du repas. */
  const tkSess = (await post(openSession, { merchant: SLUG, mode: 'takeout' })).body.session;
  let tk = await post(placeOrder, { merchant: SLUG, mode: 'takeout', session: tkSess, lines: [line('i1')] });
  const tkId = tk.body.id;
  await post(queuePost, { merchant: SLUG, id: tkId, status: 'accepted', paid: true }, asStaff);
  await post(queuePost, { merchant: SLUG, id: tkId, status: 'ready' }, asStaff);
  r = await post(queuePost, { merchant: SLUG, id: tkId, status: 'served' }, asStaff);
  ok('la commande à emporter est remise', r.status === 200);
  r = await get(readSession, 'merchant=' + SLUG + '&session=' + tkSess);
  ok('…et sa session se ferme avec elle', r.body.status === 'closed' && r.body.closedBy === 'served');
  r = await post(placeOrder, { merchant: SLUG, mode: 'takeout', session: tkSess, lines: [line('i1')] });
  ok('…donc on ne commande plus depuis le trottoir', r.status === 409 && r.body.error === 'session-closed');

  const tblSess = (await post(openSession, { merchant: SLUG, mode: 'table', table: '21' })).body.session;
  let tb = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '21', session: tblSess, lines: [line('i2')] });
  await post(queuePost, { merchant: SLUG, id: tb.body.id, status: 'accepted' }, asStaff);
  await post(queuePost, { merchant: SLUG, id: tb.body.id, status: 'ready' }, asStaff);
  await post(queuePost, { merchant: SLUG, id: tb.body.id, status: 'served' }, asStaff);
  r = await get(readSession, 'merchant=' + SLUG + '&session=' + tblSess);
  ok('en salle, le plat servi ne ferme PAS la table', r.body.status === 'open');
  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: '21', session: tblSess, lines: [line('i2')] });
  ok('…et le dessert se commande encore', r.status === 200, JSON.stringify(r.body));

  /* ═══ 5. TENANCY ════════════════════════════════════════════════════════
   * Attention à ce qu'on vérifie ici. `entitledMerchant` ne REFUSE pas un slug
   * étranger : il le remplace par celui du compte connecté (« un slug non
   * possédé retombe sur le compte »). Le 403 n'est donc pas la propriété à
   * tester — la propriété, c'est qu'on obtient SES données et jamais celles de
   * l'autre. Un banc qui attendrait un 403 passerait au vert le jour où la
   * substitution se mettrait à fuir. */
  const rivalOrder = 'ord-rival-0001';
  DB._db.prepare(
    `INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(rivalOrder, OTHER, 1, 'table', '2', 500, '[]', 'pending', Date.now(), Date.now());

  r = await get(readOrder, 'merchant=' + OTHER + '&id=' + tableOrderId);
  ok('une commande ne se lit pas via le slug d\'un autre', r.status === 404);

  r = await get(queueGet, 'merchant=' + OTHER + '&since=0', asStaff);
  ok('demander la file d\'un autre rend la SIENNE', r.status === 200);
  ok('…et jamais une ligne de l\'autre',
    !(r.body.orders || []).some((o) => o.id === rivalOrder), JSON.stringify(r.body.orders && r.body.orders.map((o) => o.id)));

  r = await post(queuePost, { merchant: OTHER, id: rivalOrder, status: 'accepted' }, asStaff);
  ok('on n\'accepte pas la commande d\'un autre commerçant', r.status === 404);
  ok('…et elle n\'a pas bougé',
    DB._db.prepare('SELECT status FROM orders WHERE id=?').get(rivalOrder).status === 'pending');

  r = await get(queueGet, 'merchant=' + SLUG + '&since=0', {});
  ok('sans session, pas de file du tout', r.status === 403);

  /* ═══ 6. IDEMPOTENCE ════════════════════════════════════════════════════ */
  const ref = 'ref-double-tap';
  const a = await post(placeOrder, { merchant: SLUG, mode: 'takeout', ref, lines: [line('i1')] });
  const b = await post(placeOrder, { merchant: SLUG, mode: 'takeout', ref, lines: [line('i1')] });
  ok('le double-tap rejoue la même commande', a.body.id === b.body.id && b.body.replayed === true);
  ok('…et n\'écrit qu\'une ligne',
    DB._db.prepare('SELECT COUNT(*) n FROM orders WHERE client_ref=?').get(ref).n === 1);
  ok('…avec un seul numéro', a.body.number === b.body.number);

  /* ═══ 7. L'ADDITION FERME LA SESSION ════════════════════════════════════ */
  r = await post(queuePost, { merchant: SLUG, closeSession: sess, closedBy: 'settle' }, asStaff);
  ok('la caisse ferme la session', r.status === 200 && r.body.closed === 1);
  r = await get(readSession, 'merchant=' + SLUG + '&session=' + sess);
  ok('le téléphone l\'apprend', r.body.status === 'closed' && r.body.closedBy === 'settle');
  r = await post(placeOrder, { merchant: SLUG, mode: 'table', table: 'T7', session: sess, lines: [line('i1')] });
  ok('et ne peut plus commander', r.status === 409 && r.body.error === 'session-closed');
  ok('les commandes de la session sont soldées',
    !!DB._db.prepare('SELECT paid_ts FROM orders WHERE id=?').get(tableOrderId).paid_ts);

  r = await post(openSession, { merchant: SLUG, mode: 'table', table: 'T7' });
  ok('la table se rouvre pour le client suivant', r.status === 200 && r.body.session !== sess);

  /* fermer par numéro de table — c'est ce que markPaid() a sous la main */
  const sess2 = r.body.session;
  r = await post(queuePost, { merchant: SLUG, closeTable: 'T7' }, asStaff);
  ok('on peut aussi fermer par table', r.status === 200 && r.body.closed === 1);
  r = await get(readSession, 'merchant=' + SLUG + '&session=' + sess2);
  ok('…même effet', r.body.status === 'closed');

  /* ═══ 8. CE QUE LA FILE RAPPORTE ════════════════════════════════════════ */
  deskAt(Date.now());
  await post(openSession, { merchant: SLUG, mode: 'table', table: '12' });
  r = await get(queueGet, 'merchant=' + SLUG + '&since=0', asStaff);
  ok('la file répond', r.status === 200 && r.body.ok);
  ok('…et dit que la table existe', r.body.ordersAvailable === true);
  ok('les sessions vivantes voyagent avec la file',
    Array.isArray(r.body.sessions) && r.body.sessions.some((s) => s.table === '12'),
    JSON.stringify(r.body.sessions));

  /* Ce qui termine une session, c'est l'addition — pas le silence du téléphone.
     Une fenêtre de présence trop courte éteignait la table dès que le client
     verrouillait son écran, et le serveur voyait sa salle se vider devant des
     clients toujours attablés. */
  DB._db.prepare("UPDATE table_sessions SET seen_ts = ? WHERE table_no = '12' AND status = 'open'")
    .run(Date.now() - 20 * 60 * 1000);
  r = await get(queueGet, 'merchant=' + SLUG + '&since=0', asStaff);
  ok('un téléphone en veille depuis 20 min reste attablé',
    r.body.sessions.some((s) => s.table === '12'));
  ok('une session fermée n\'y est plus',
    !r.body.sessions.some((s) => s.id === sess || s.id === sess2));
  ok('la commande servie du jour reste visible pour l\'historique',
    r.body.orders.some((o) => o.id === tableOrderId && o.status === 'served'));
  ok('la commande refusée disparaît de la file',
    !r.body.orders.some((o) => o.id === rejId));
  const served = r.body.orders.find((o) => o.id === tableOrderId);
  ok('le ticket porte son serveur', served && served.server === 'Yassine');
  ok('…et son état de paiement', served && served.paid === true);

  /* ═══ 9. L'OPTION COUPÉE FERME TOUT ═════════════════════════════════════ */
  DB._db.prepare('UPDATE merchant_config SET features=? WHERE merchant=?').run('{"orderpro":false}', SLUG);
  r = await post(placeOrder, { merchant: SLUG, mode: 'takeout', lines: [line('i1')] });
  ok('Order Pro coupé ⇒ aucune commande', r.status === 403 && r.body.error === 'orderpro-off');
  r = await post(openSession, { merchant: SLUG, mode: 'table', table: '4' });
  ok('…ni aucune session', r.status === 403);
  DB._db.prepare('UPDATE merchant_config SET features=? WHERE merchant=?').run('{}', SLUG);
  r = await post(placeOrder, { merchant: SLUG, mode: 'takeout', lines: [line('i1')] });
  ok('clé absente ⇒ coupé aussi (l\'option s\'ouvre, elle ne se suppose pas)', r.status === 403);

  /* ═══ 10. LE PRIX, MÊME QUAND IL N'Y A PAS DE « CARTE » ═════════════════
     Le repli « aucun catalogue ⇒ on croit le téléphone » se présentait comme le
     cas rare du commerçant qui n'a rien publié. C'était le même trou derrière
     quatre conditions, dont une VERTICALE entière : une boutique publie
     {categories, products, variants, colors} avec `priceMAD` et AUCUNE clé
     `items`, donc toute boutique avec Order Pro allumé se tarifait depuis le
     téléphone du client. Ces contrôles tiennent les deux moitiés du correctif :
     on sait lire la forme boutique, et sans catalogue on REFUSE. */
  DB._db.prepare('UPDATE merchant_config SET features=? WHERE merchant=?').run('{"orderpro":true}', SLUG);
  deskAt(Date.now());

  const SHOP = {
    categories: [{ id: 'c1', name: 'Prêt-à-porter' }],
    products: [
      { id: 'p1', name: 'Chemise en lin', categoryId: 'c1', priceMAD: 340 },
      { id: 'p2', name: 'Caftan brodé', categoryId: 'c1', priceMAD: 1800 },
    ],
    variants: [
      { id: 'v1', productId: 'p1', colorId: 'k1', size: 'M', stock: 4 },
      { id: 'v2', productId: 'p2', colorId: 'k1', size: 'L', stock: 0 },
    ],
    colors: [{ id: 'k1', label: 'Écru', hex: '#EEE' }],
  };
  DB._db.prepare('UPDATE menus SET data=?, updated_ts=? WHERE merchant=?')
    .run(JSON.stringify(SHOP), Date.now(), SLUG);

  r = await post(placeOrder, {
    merchant: SLUG, mode: 'takeout',
    lines: [{ id: 'p1', qty: 2, name: 'Bricole à 1 MAD', unitPrice: 1 }],
  });
  ok('une boutique se tarifie depuis SON catalogue', r.status === 200 && r.body.total === 680,
    'total=' + (r.body && r.body.total));
  ok('…et le nom vient du catalogue, pas du téléphone',
    r.body.lines && r.body.lines[0].name === 'Chemise en lin');

  r = await post(placeOrder, { merchant: SLUG, mode: 'takeout', lines: [{ id: 'p2', qty: 1 }] });
  ok('un article dont tout le stock est à zéro est épuisé',
    r.status === 409 && r.body.error === 'menu-changed', JSON.stringify(r.body));

  r = await post(placeOrder, { merchant: SLUG, mode: 'takeout', lines: [{ id: 'inconnu', qty: 1 }] });
  ok('un identifiant absent du catalogue boutique est refusé', r.status === 409);

  // Plus AUCUN catalogue : on refuse, on ne devine pas.
  DB._db.prepare('DELETE FROM menus WHERE merchant=?').run(SLUG);
  r = await post(placeOrder, {
    merchant: SLUG, mode: 'takeout',
    lines: [{ id: 'x1', qty: 1, name: 'Ce que je veux', unitPrice: 1 }],
  });
  ok('sans catalogue, la commande est refusée et non tarifée par le client',
    r.status === 409 && r.body.error === 'menu-not-published', JSON.stringify(r.body));
  ok('…et rien n\'a été écrit',
    !DB._db.prepare("SELECT id FROM orders WHERE merchant=? AND lines LIKE '%Ce que je veux%'").get(SLUG));

  /* ═══ 11. UN CORPS MALFORMÉ SE FAIT REFUSER, IL NE FAIT PAS TOMBER ══════
     `FROM[status]` traversait Object.prototype : « constructor », « toString »,
     « valueOf » répondaient une FONCTION, donc « truthy », donc la garde
     `bad-status` les laissait passer — et `from.map()`, hors du try, levait un
     TypeError non rattrapé. La caisse recevait un 500 là où un 400 était dû. */
  DB._db.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)')
    .run(SLUG, 'Chez Nadia', 'restaurant', JSON.stringify(CARTE), Date.now());
  deskAt(Date.now());
  r = await post(placeOrder, { merchant: SLUG, mode: 'takeout', lines: [line('i1')] });
  const protoOrder = r.body.id;
  for (const key of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
    r = await post(queuePost, { merchant: SLUG, id: protoOrder, status: key }, asStaff);
    ok(`« ${key} » est un état invalide, pas une panne`,
      r.status === 400 && r.body.error === 'bad-status', 'status=' + r.status);
  }
  ok('…et la commande n\'a pas bougé',
    DB._db.prepare('SELECT status FROM orders WHERE id=?').get(protoOrder).status === 'pending');

  /* ═══ 12. LA COURSE À L'IDEMPOTENCE ═════════════════════════════════════
     Le SELECT d'idempotence court AVANT l'insertion : il ne voit pas deux envois
     simultanés. C'est l'index unique qui les départage — mais sa violation
     tombait dans le MÊME catch que « colonne absente », et le repli réinsérait
     sans la clé. Les deux passaient donc : deux tickets, deux numéros, deux fois
     le plat en cuisine. On simule la course en posant la ligne gagnante juste
     avant l'insertion perdante. */
  const RACE = 'ref-course-42';
  const first = await post(placeOrder, {
    merchant: SLUG, mode: 'takeout', ref: RACE, lines: [line('i1', 2)],
  });
  ok('la première des deux passe', first.status === 200 && first.body.ok);
  const before = DB._db.prepare('SELECT COUNT(*) n FROM orders WHERE merchant=? AND client_ref=?')
    .get(SLUG, RACE).n;
  const second = await post(placeOrder, {
    merchant: SLUG, mode: 'takeout', ref: RACE, lines: [line('i1', 2)],
  });
  const after = DB._db.prepare('SELECT COUNT(*) n FROM orders WHERE merchant=? AND client_ref=?')
    .get(SLUG, RACE).n;
  ok('le renvoi rend LA MÊME commande', second.status === 200 && second.body.id === first.body.id,
    JSON.stringify(second.body));
  ok('…et n\'en crée pas une seconde', before === 1 && after === 1, `${before} → ${after}`);
  ok('le total des commandes de cette clé reste unique',
    DB._db.prepare('SELECT COUNT(*) n FROM orders WHERE merchant=? AND client_ref=?').get(SLUG, RACE).n === 1);

  /* ═══ 13. UNE TABLE NE DÉPENSE PAS LA JOURNÉE DU COMMERÇANT ═════════════
     Le plafond global (60/jour) borne la base mais ne protège pas le commerce :
     c'est son allocation, et un script qui connaît le slug la dépense contre des
     tables inventées. Le plafond par table est ce qui distingue un convive d'une
     boucle — sans brider la salle entière, qui partage une seule adresse IP
     derrière le wifi du café. */
  const FLOOD = 'table-inondee';
  const floodSession = (await post(openSession, { merchant: SLUG, mode: 'table', table: FLOOD })).body.session;
  for (let i = 0; i < 8; i++) {
    r = await post(placeOrder, {
      merchant: SLUG, mode: 'table', table: FLOOD, session: floodSession,
      ref: 'flood-' + i, lines: [line('i2')],
    });
    ok(`commande ${i + 1}/8 sur une même table passe`, r.status === 200, JSON.stringify(r.body));
  }
  r = await post(placeOrder, {
    merchant: SLUG, mode: 'table', table: FLOOD, session: floodSession,
    ref: 'flood-9', lines: [line('i2')],
  });
  ok('la neuvième est refusée', r.status === 429 && r.body.error === 'table-queue-full',
    r.status + ' ' + JSON.stringify(r.body));

  // …et une AUTRE table continue d'être servie normalement.
  const neighborSession = (await post(openSession, { merchant: SLUG, mode: 'table', table: 'voisine' })).body.session;
  r = await post(placeOrder, {
    merchant: SLUG, mode: 'table', table: 'voisine', session: neighborSession,
    ref: 'voisine-1', lines: [line('i2')],
  });
  ok('la table d\'à côté commande toujours', r.status === 200, JSON.stringify(r.body));

  // Le comptoir accepte : la table repasse sous le plafond.
  const stuck = DB._db.prepare(
    "SELECT id FROM orders WHERE merchant=? AND table_no=? AND status='pending' ORDER BY created_ts LIMIT 1"
  ).get(SLUG, FLOOD);
  await post(queuePost, { merchant: SLUG, id: stuck.id, status: 'accepted' }, asStaff);
  r = await post(placeOrder, {
    merchant: SLUG, mode: 'table', table: FLOOD, session: floodSession,
    ref: 'flood-10', lines: [line('i2')],
  });
  ok('dès que le comptoir accepte, la table peut à nouveau commander', r.status === 200,
    JSON.stringify(r.body));

  /* ═══ 8. LA SALLE ═══════════════════════════════════════════════════════
   * « Lancer la commande » dans kiwi-serveur.html n'était qu'un toast : il
   * effaçait le drapeau « non envoyé » et affichait « commande envoyée ». Rien
   * ne partait. Le seul défaut du lot où le produit AFFIRME avoir fait une
   * chose qu'il n'a pas faite — et le seul, donc, qu'un banc doit garder fermé.
   *
   * Ce que ce chemin doit faire AUTREMENT du téléphone du client, et pourquoi
   * chaque écart est ici vérifié plutôt que commenté :
   *   • il traverse Order Pro éteint (c'est l'option du QR, pas celle de la salle)
   *   • il traverse le comptoir éteint (le serveur EST la preuve du service)
   *   • …mais il ne fait PAS passer le comptoir pour allumé (sinon la salle
   *     rouvrirait la commande client alors que la caisse dort)
   *   • il entre en `accepted` (le serveur a déjà décidé ; `pending` ferait
   *     expirer en `rejected` un ticket bel et bien lancé)
   * Et ce qu'il fait PAREIL : le prix vient de la carte publiée, jamais de la
   * tablette. */
  const SALLE = 'chez-brahim';
  const ACC_SALLE = 'acc-brahim';
  DB._db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(ACC_SALLE, 'brahim@example.ma', 'Brahim', 'Chez Brahim', 's', 'h', Date.now());
  // Order Pro explicitement ÉTEINT : c'est le cas du restaurant qui veut la
  // salle sans le QR client, et c'est celui qui doit marcher.
  DB._db.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,updated_ts) VALUES (?,?,?,?,?)')
    .run(SALLE, '{"orderpro":false}', 'restaurant', ACC_SALLE, Date.now());
  DB._db.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)')
    .run(SALLE, 'Chez Brahim', 'restaurant', JSON.stringify(CARTE), Date.now());
  const asSalle = { Cookie: sessionCookie(await makeSession(ACC_SALLE, SECRET)).split(';')[0] };

  /* La semaine restaurant est lundi–dimanche, heure Maroc. Un ancien numéro de
   * la semaine courante compte ; celui de la semaine précédente ne compte plus. */
  const thisWeek = startOfWeek(Date.now());
  DB._db.prepare(
    `INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run('ord-week-current', SALLE, 41, 'table', 'OLD', 90, '[]', 'served', thisWeek + 1000, thisWeek + 1000);
  DB._db.prepare(
    `INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run('ord-week-before', SALLE, 99, 'table', 'OLD', 90, '[]', 'served', thisWeek - 1000, thisWeek - 1000);

  r = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T7',
    lines: [{ id: 'i1', qty: 2, note: 'sans olives', visuals: [{ emoji: '🚫🫒', name: 'Sans olives' }] }, { id: 'i2', qty: 3 }],
  }, asSalle);
  ok('la salle envoie sa commande, Order Pro éteint', r.status === 200 && r.body.ok,
    r.status + ' ' + JSON.stringify(r.body));
  ok('le numéro restaurant continue sur la semaine courante', r.body.number === 42,
    'number=' + r.body.number);
  ok('le prix vient de la carte, pas de la tablette', r.body.total === 90 * 2 + 15 * 3,
    'total=' + r.body.total);
  const salleRow = DB._db.prepare('SELECT status, table_no, total, lines FROM orders WHERE id=?')
    .get(r.body.id);
  ok('elle entre acceptée, pas en attente', salleRow.status === 'accepted', salleRow.status);
  ok('la table voyage avec', salleRow.table_no === 'T7', salleRow.table_no);
  ok('la note du convive aussi',
    JSON.parse(salleRow.lines)[0].note === 'sans olives', salleRow.lines);
  ok('le repère visuel de la cuisine aussi',
    JSON.parse(salleRow.lines)[0].visuals[0].emoji === '🚫🫒', salleRow.lines);

  r = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T7F',
    lines: [
      { id: 'i4', qty: 1, kind: 'formula', formulaUid: 'fml-included' },
      { id: 'i5', qty: 1, kind: 'formula-part', formulaUid: 'fml-included', formulaSlotId: 'drink', lineId: 'fml-included-drink' },
      { id: 'i4', qty: 1, kind: 'formula', formulaUid: 'fml-premium' },
      { id: 'i6', qty: 1, kind: 'formula-part', formulaUid: 'fml-premium', formulaSlotId: 'drink', lineId: 'fml-premium-drink' },
    ],
  }, asSalle);
  ok('les composants inclus restent gratuits après la tarification serveur',
    r.status === 200 && r.body.total === 68 + 88, JSON.stringify(r.body));
  const formulaRow = DB._db.prepare("SELECT lines FROM orders WHERE merchant=? AND table_no='T7F'").get(SALLE);
  const formulaLines = formulaRow ? JSON.parse(formulaRow.lines) : [];
  ok('les lignes enfants persistent à zéro et gardent leur type formule',
    formulaLines.length === 4
      && formulaLines[1].kind === 'formula-part' && formulaLines[1].unitPrice === 0
      && formulaLines[3].kind === 'formula-part' && formulaLines[3].unitPrice === 0,
    formulaRow && formulaRow.lines);
  ok('le reçu garde le supplément exact de chaque choix sans le refacturer',
    formulaLines[1] && formulaLines[1].formulaExtra === 0
      && formulaLines[3] && formulaLines[3].formulaExtra === 20,
    formulaRow && formulaRow.lines);
  ok('seul le supplément configuré est ajouté au parent',
    formulaLines[0] && formulaLines[0].unitPrice === 68
      && formulaLines[2] && formulaLines[2].unitPrice === 88,
    formulaRow && formulaRow.lines);

  r = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T7OP',
    lines: [
      { id: 'i4', qty: 1, kind: 'formula', formulaUid: 'orderpro-formula', formulaName: 'Continental',
        optionChoices: [{ group: 'egg-style', label: 'Œufs au plat' }] },
      { id: 'i5', qty: 1, kind: 'formula-part', formulaUid: 'orderpro-formula', formulaName: 'Continental',
        formulaSlotId: 'drink', slotLabel: 'Boisson', lineId: 'orderpro-formula-drink-0' },
    ],
  }, asSalle);
  const orderProFormula = r.body && r.body.lines;
  ok('la formule OrderPro conserve son composant pour la cuisine',
    r.status === 200 && orderProFormula.length === 2
      && orderProFormula[1].kind === 'formula-part' && orderProFormula[1].name === 'Carrot Juice',
    JSON.stringify(r.body));
  ok('les options OrderPro restent sur le parent canonique pour le KDS',
    orderProFormula[0].visuals.some(v => v.name === 'Œufs au plat'), JSON.stringify(orderProFormula[0]));

  // La caisse la voit. C'est tout l'objet : un ticket que la cuisine reçoit.
  r = await get(queueGet, 'merchant=' + SALLE + '&since=0', asSalle);
  ok('le comptoir la voit dans sa file',
    r.body.orders.some((o) => o.table === 'T7' && o.status === 'accepted'),
    JSON.stringify(r.body.orders));

  // …et le comptoir n'a jamais pointé : la salle ne doit pas l'avoir fait pour
  // lui. (Ce GET-ci, si — c'est la caisse. On regarde donc AVANT.)
  DB._db.prepare('DELETE FROM order_desk').run();
  await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T8', lines: [{ id: 'i2', qty: 1 }],
  }, asSalle);
  ok('la salle ne fait pas passer le comptoir pour allumé',
    !DB._db.prepare('SELECT seen_ts FROM order_desk WHERE merchant=?').get(SALLE));

  // Comptoir éteint depuis une demi-heure : le téléphone du client est refusé,
  // la salle passe quand même.
  DB._db.prepare(
    'INSERT INTO order_desk (merchant,seen_ts) VALUES (?,?) ON CONFLICT(merchant) DO UPDATE SET seen_ts=excluded.seen_ts'
  ).run(SALLE, Date.now() - 30 * 60 * 1000);
  r = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T9', lines: [{ id: 'i1', qty: 1 }],
  }, asSalle);
  ok('comptoir éteint : la salle envoie quand même', r.status === 200 && r.body.ok,
    r.status + ' ' + JSON.stringify(r.body));

  // Idempotence — le wifi du fond de terrasse, et le serveur qui retape.
  const REF = 'sv-double-tap';
  const svFirst = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T10', ref: REF,
    lines: [{ id: 'i1', qty: 1 }],
  }, asSalle);
  const again = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T10', ref: REF,
    lines: [{ id: 'i1', qty: 1 }],
  }, asSalle);
  ok('un deuxième « Lancer » rejoue le même ticket',
    again.status === 200 && again.body.replayed === true && again.body.id === svFirst.body.id,
    JSON.stringify(again.body));
  ok('…et la cuisine n\'a qu\'un ticket',
    DB._db.prepare("SELECT COUNT(*) n FROM orders WHERE merchant=? AND table_no='T10'").get(SALLE).n === 1);
  await post(queuePost, { merchant: SALLE, closeTable: 'T10', closedBy: 'service' }, asSalle);
  const lateReplay = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T10', ref: REF,
    lines: [{ id: 'i1', qty: 1 }],
  }, asSalle);
  ok('un retry Wi-Fi après paiement ne rouvre pas une nouvelle visite',
    lateReplay.body.replayed === true
      && DB._db.prepare("SELECT COUNT(*) n FROM table_sessions WHERE merchant=? AND table_no='T10' AND status='open'").get(SALLE).n === 0,
    JSON.stringify(lateReplay.body));

  /* Tenancy. `entitledMerchant` ne REFUSE pas un slug étranger réclamé par un
   * commerçant connecté : il le ramène à SON établissement (voir le commentaire
   * de la fonction — un slug non possédé retombe sur le compte). L'invariant à
   * tenir n'est donc pas « 403 », c'est « rien n'est écrit chez le voisin » —
   * et c'est celui-là qu'on vérifie, sinon le banc décrirait une porte qui
   * n'existe pas. */
  const otherBefore = DB._db.prepare('SELECT COUNT(*) n FROM orders WHERE merchant=?').get(OTHER).n;
  r = await post(queuePost, {
    merchant: OTHER, create: true, mode: 'table', table: 'T-voisin', lines: [{ id: 'i1', qty: 1 }],
  }, asSalle);
  ok('la salle d\'un commerce n\'écrit rien chez le voisin',
    DB._db.prepare('SELECT COUNT(*) n FROM orders WHERE merchant=?').get(OTHER).n === otherBefore,
    r.status + ' ' + JSON.stringify(r.body));
  ok('…le ticket est retombé chez elle',
    !!DB._db.prepare("SELECT id FROM orders WHERE merchant=? AND table_no='T-voisin'").get(SALLE));

  // Sans aucune signature, la porte est fermée — c'est la garde d'entrée, pas
  // le repli ci-dessus.
  r = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T12', lines: [{ id: 'i1', qty: 1 }],
  });
  ok('sans cookie, la salle n\'écrit nulle part',
    r.status === 403 && r.body.error === 'forbidden-merchant', r.status + ' ' + JSON.stringify(r.body));

  // Rien de publié en face : on refuse EN LE DISANT, au lieu de croire la
  // tablette sur le prix.
  DB._db.prepare('DELETE FROM menus WHERE merchant=?').run(SALLE);
  r = await post(queuePost, {
    merchant: SALLE, create: true, mode: 'table', table: 'T11', lines: [{ id: 'i1', qty: 1 }],
  }, asSalle);
  ok('carte non publiée ⇒ refus explicite, pas un prix inventé',
    r.status === 409 && r.body.error === 'menu-not-published', JSON.stringify(r.body));

  // Une table sans nom, une commande vide : les deux refusées avant toute
  // écriture.
  r = await post(queuePost, { merchant: SALLE, create: true, mode: 'table', table: '', lines: [{ id: 'i1' }] }, asSalle);
  ok('une commande sans table est refusée', r.status === 400 && r.body.error === 'table-required');
  r = await post(queuePost, { merchant: SALLE, create: true, mode: 'table', table: 'T1', lines: [] }, asSalle);
  ok('une commande vide est refusée', r.status === 400 && r.body.error === 'empty-order');

  console.log('');
  if (fails.length) {
    fails.forEach((f) => console.log('  ✗ ' + f));
    console.log(`\n✗ relais OrderPro : ${pass} ok, ${fails.length} échec(s)\n`);
    process.exit(1);
  }
  console.log(`  ✓ relais OrderPro (${pass} contrôles : prix canonique, catalogue boutique, refus sans carte, présence du comptoir, session de table, transitions, corps malformé, tenancy, idempotence, plafond par table, addition, salle)\n`);
})().catch((e) => { console.log('  ✗ ' + (e && e.stack || e)); process.exit(1); });
