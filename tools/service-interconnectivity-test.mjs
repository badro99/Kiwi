#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { employeeToken, employeeCookie, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet as queueGet, onRequestPost as queuePost } from '../functions/api/order/queue.js';
import { onRequestGet as eventsGet, onRequestPost as eventsPost } from '../functions/api/service/events.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestPost as teamLivePost } from '../functions/api/team/live.js';
import { onRequestGet as employeeClientsGet, onRequestPost as employeeClientsPost } from '../functions/api/employee-clients.js';
import { onRequest as gate } from '../functions/_middleware.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async all() { return { results: db.prepare(sql).all(...args) }; },
  async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } };
const SECRET = 'service-interconnectivity-secret';
const env = { DB, AUTH_SECRET: SECRET, SITE_PASSWORD: 'staff-gate' };
const merchant = 'test-restaurant';
const now = Date.now();
const put = (sql, ...args) => db.prepare(sql).run(...args);
put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)',
  'acc-1', 'owner@test.ma', 'Owner', 'Test Restaurant', 's', 'h', now);
put('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)',
  merchant, '{"orderpro":true}', 'restaurant', 'active', 'Test Restaurant', 'acc-1', now);
put('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)', merchant, 'Menu', 'restaurant', JSON.stringify({
  cats: [{ id: 'c1', name: 'Plats', sub: [] }],
  opts: [{ id: 'sauce', name: 'Sauce', kind: 'one', choices: [
    { id: 'nature', name: 'Nature', price: 0, emoji: '⚪' },
    { id: 'epicee', name: 'Épicée', price: 10, emoji: '🔴' },
  ] }],
  items: [{ id: 'i1', name: 'Tajine', price: 80, catId: 'c1', avail: true, opts: ['sauce'] }],
}), now);
const team = { members: [
  { id: 'sara', firstName: 'Sara', lastName: 'Service', function: 'Serveur', department: 'Salle', pinCode: '1111' },
  { id: 'omar', firstName: 'Omar', lastName: 'Service', function: 'Serveur', department: 'Salle', pinCode: '2222' },
  { id: 'karim', firstName: 'Karim', lastName: 'Cuisine', function: 'Cuisinier', department: 'Cuisine' },
] };
const floor = {
  staff: [{ id: 'fs-sara', name: 'Sara Service' }, { id: 'fs-omar', name: 'Omar Service' }],
  zones: [{ id: 'z1', name: 'Salle' }],
  tables: [
    { id: 't1', num: '1', zone: 'z1', server: 'tm-sara', servers: ['tm-sara'], seats: 4 },
    { id: 't2', num: '2', zone: 'z1', server: 'fs-omar', seats: 4 },
    { id: 't3', num: '3', zone: 'z1', server: '', seats: 2 },
    { id: 't4', num: '4', zone: 'z1', server: 'tm-sara', servers: ['tm-sara', 'tm-omar'], seats: 4 },
  ],
};
const attendance = { entries: [
  { id: 'a1', staffId: 'sara', memberId: 'sara', name: 'Sara Service', inTs: now - 1000, outTs: 0 },
  { id: 'a2', staffId: 'omar', memberId: 'omar', name: 'Omar Service', inTs: now - 1000, outTs: 0 },
] };
for (const [feature, data] of [['team', team], ['floorplan', floor], ['attendance', attendance]]) {
  put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', merchant, feature, JSON.stringify(data), 1, now);
}
put("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)", merchant, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 2, threshold: 100 } }), 1, now);
put(`INSERT INTO clients (merchant,id,name,phone,points,stamps,visits,spend,last_seen,updated_ts,srv_ts)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`, merchant, 'c1', 'Amina Client', '0612345678', 10, 0, 1, 80, now, now, now);
const saraCookie = employeeCookie(await employeeToken(SECRET, { merchant, staffId: 'sara' })).split(';')[0];
const omarCookie = employeeCookie(await employeeToken(SECRET, { merchant, staffId: 'omar' })).split(';')[0];
const kitchenCookie = employeeCookie(await employeeToken(SECRET, { merchant, staffId: 'karim' })).split(';')[0];
const ownerCookie = sessionCookie(await makeSession('acc-1', SECRET)).split(';')[0];
let failures = 0;
function ok(value, label) { console.log('  ' + (value ? '✓' : '✗') + ' ' + label); if (!value) failures++; }
async function json(response) { try { return await response.json(); } catch (_) { return {}; } }
async function qget(cookie, since = 0) {
  const request = new Request(`https://kiwi.test/api/order/queue?merchant=${merchant}&since=${since}&role=service`, { headers: { Cookie: cookie } });
  const response = await queueGet({ request, env }); return { response, body: await json(response) };
}
async function qpost(cookie, body) {
  const request = new Request('https://kiwi.test/api/order/queue', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await queuePost({ request, env }); return { response, body: await json(response) };
}
async function employeeSale(cookie, body) {
  const request = new Request('https://kiwi.test/api/sale', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, ...body }),
  });
  const response = await salePost({ request, env }); return { response, body: await json(response) };
}

let result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '1', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 200 && result.body.ok && result.body.total === 80, 'le serveur pointé envoie sa table en cuisine');
const firstSession = db.prepare("SELECT id FROM table_sessions WHERE merchant=? AND table_no='1' AND status='open'").get(merchant);
ok(/^tsx-[A-Za-z0-9]{22}$/.test(String(result.body.session || ''))
  && firstSession && firstSession.id === result.body.session,
  'le bon employé est rattaché à une visite de table unique');
const saraOrderId = result.body.id;
let request, response;
request = new Request(`https://kiwi.test/api/employee-clients?merchant=${merchant}`, { headers: { Cookie: saraCookie } });
response = await gate({ request, env, next: () => new Response('next') });
ok(response.status === 200 && await response.text() === 'next', 'la porte edge laisse le serveur pointé atteindre le carnet clients');
request = new Request(`https://kiwi.test/api/employee-clients?merchant=${merchant}`, { headers: { Cookie: saraCookie } });
response = await employeeClientsGet({ request, env }); let clientBook = await json(response);
ok(response.status === 200 && clientBook.clients.length === 1 && clientBook.clients[0].name === 'Amina Client',
  'le serveur pointé voit le carnet fidélité de ce magasin seulement');
request = new Request('https://kiwi.test/api/employee-clients', { method: 'POST', headers: { Cookie: saraCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, clientId: 'c1', amount: 80, ref: 'employee-payment:1:test',
}) });
response = await employeeClientsPost({ request, env }); const loyalty = await json(response);
ok(response.status === 200 && loyalty.points === 160, 'le paiement serveur crédite la règle fidélité du dashboard');
request = new Request('https://kiwi.test/api/employee-clients', { method: 'POST', headers: { Cookie: saraCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, clientId: 'c1', amount: 80, ref: 'employee-payment:1:test',
}) });
response = await employeeClientsPost({ request, env });
ok(response.status === 200 && (await json(response)).replayed === true, 'un retry Wi-Fi ne crédite jamais les points deux fois');
result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '1', lines: [
  { id: 'i1', qty: 2, optionChoices: [{ group: 'sauce', label: 'Épicée' }] },
] });
ok(result.response.status === 200 && result.body.total === 180
  && result.body.lines[0].unitPrice === 90
  && result.body.lines[0].options.includes('Épicée')
  && result.body.lines[0].visuals[0].emoji === '🔴',
  'les suppléments serveur sont validés et tarifés depuis le menu cloud');
result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '1', lines: [
  { id: 'i1', qty: 1, optionChoices: [{ group: 'sauce', label: 'Option inventée' }] },
] });
ok(result.response.status === 409 && result.body.error === 'menu-changed',
  'une option inventée ou périmée par la tablette est refusée');
result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 200, "Toutes les tables permet à un serveur de couvrir la table d'un collègue");
result = await qpost(kitchenCookie, { merchant, create: true, mode: 'table', table: '1', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 403, "un rôle cuisine n'ouvre jamais le canal de commande serveur");

put(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 'ord-orderpro-sara', merchant, 91, 'table', '1', 80,
  JSON.stringify([{ id: 'i1', name: 'Tajine', qty: 1, unitPrice: 80 }]), 'pending', now, now, firstSession.id);
put(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
     VALUES (?,?,?,?,?,?,?,?,?,?)`, 'ord-before-shift', merchant, 90, 'table', '1', 80,
  JSON.stringify([{ id: 'i1', name: 'Tajine', qty: 1, unitPrice: 80 }]), 'ready', now - 5000, now - 5000);

await qpost(ownerCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }], ref: 'omar-order' });
let saraQueue = await qget(saraCookie);
ok(saraQueue.response.status === 200
  && saraQueue.body.orders.some((order) => order.table === '1')
  && saraQueue.body.orders.some((order) => order.table === '2')
  && saraQueue.body.service.mineTables.includes('1')
  && saraQueue.body.service.allTables.includes('2'), 'Mes tables reste identifié, Toutes les tables reçoit le plan complet');
ok(saraQueue.body.orders.some((order) => order.id === 'ord-orderpro-sara' && order.status === 'pending' && order.session),
  'une nouvelle commande OrderPro de sa table atteint Sara');
ok(!saraQueue.body.orders.some((order) => order.id === 'ord-before-shift'),
  'un ancien prêt antérieur au pointage ne rejoue pas à chaque rechargement');
const omarQueue = await qget(omarCookie);
ok(omarQueue.response.status === 200 && omarQueue.body.service.mineTables.includes('2'), 'Omar garde la propriété de sa table');

put(`INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts)
     VALUES (?,?,?,?,?,?,?)`, 'sess-shared', merchant, 'table', '4', 'open', now, now);
put(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 'ord-shared-orderpro', merchant, 92, 'table', '4', 80,
  JSON.stringify([{ id: 'i1', name: 'Tajine', qty: 1, unitPrice: 80 }]), 'pending', now + 10, now + 10, 'sess-shared');
let sharedSara = await qget(saraCookie), sharedOmar = await qget(omarCookie);
ok(sharedSara.body.service.mineTables.includes('4') && sharedOmar.body.service.mineTables.includes('4')
  && sharedSara.body.orders.some((order) => order.id === 'ord-shared-orderpro' && order.status === 'pending')
  && sharedOmar.body.orders.some((order) => order.id === 'ord-shared-orderpro' && order.status === 'pending'),
  'OrderPro atteint tous les serveurs affectés à une même table');
await qpost(ownerCookie, { merchant, id: 'ord-shared-orderpro', status: 'accepted' });
await qpost(ownerCookie, { merchant, id: 'ord-shared-orderpro', status: 'ready' });
sharedSara = await qget(saraCookie); sharedOmar = await qget(omarCookie);
ok(sharedSara.body.orders.some((order) => order.id === 'ord-shared-orderpro' && order.status === 'ready')
  && sharedOmar.body.orders.some((order) => order.id === 'ord-shared-orderpro' && order.status === 'ready'),
  'le KDS prêt atteint tous les serveurs affectés à la table');

result = await qpost(ownerCookie, { merchant, id: saraOrderId, status: 'ready' });
ok(result.response.status === 200 && result.body.status === 'ready', 'le KDS publie le statut prêt');
saraQueue = await qget(saraCookie);
ok(saraQueue.body.orders.some((order) => order.id === saraOrderId && order.status === 'ready'), 'le serveur affecté reçoit le prêt cuisine');

request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, event: { type: 'table-seated', table: '1', server: 'Sara Service', customer: 'Famille Alaoui', covers: 4 },
}) });
response = await eventsPost({ request, env });
ok(response.status === 200, 'la caisse publie une installation depuis la file attente');
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: saraCookie } });
response = await eventsGet({ request, env }); const saraEvents = await json(response);
ok(response.status === 200 && saraEvents.events.length === 1, 'seule la serveuse affectée reçoit la notification de table installée');
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: omarCookie } });
response = await eventsGet({ request, env }); const omarEvents = await json(response);
ok(response.status === 200 && omarEvents.events.length === 0, "le collègue non affecté ne reçoit pas l'évènement");
ok(saraEvents.events[0].serverId === 'sara' && saraEvents.events[0].serverIds.includes('sara'),
  "les notifications convertissent l'ancien identifiant tm- vers le compte employé réel");
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, event: { type: 'table-seated', table: '4', customer: 'Famille Partagée', covers: 4 },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: saraCookie } });
const seatedSara = await json(await eventsGet({ request, env }));
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: omarCookie } });
const seatedOmar = await json(await eventsGet({ request, env }));
ok(seatedSara.events.some((event) => event.table === '4' && event.type === 'table-seated')
  && seatedOmar.events.some((event) => event.table === '4' && event.type === 'table-seated'),
  'un client installé alerte tous les serveurs affectés à la table');

request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '3', status: 'a-commander', covers: 2, lines: [] }] },
}) });
response = await eventsPost({ request, env });
ok(response.status === 200, 'une table sans serveur affecté peut être installée depuis la caisse');
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=${now}`, { headers: { Cookie: saraCookie } });
response = await eventsGet({ request, env }); const unassignedEvents = await json(response);
ok(unassignedEvents.events.some((event) => event.table === '3' && event.status === 'a-commander'),
  "la première installation d'une table non affectée alerte les serveurs disponibles");

request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'ka-yaklo', covers: 4, lines: [
    { uid: 'cash-line-1', id: 'i1', name: 'Tajine', price: 80, qty: 2, note: 'sans oignon', opts: [{ group: 'sauce', label: 'Épicée', p: 10, emoji: '🔴' }] },
  ] }, { table: '2', status: 'khawya', covers: 2, lines: [] }] },
}) });
response = await eventsPost({ request, env });
ok(response.status === 200, 'la caisse publie son état de salle complet vers le cloud');
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: saraCookie } });
response = await eventsGet({ request, env }); const openedState = await json(response);
ok(openedState.states['1'] && openedState.states['1'].status === 'ka-yaklo',
  "la table ouverte en caisse remplace l'état vide du téléphone serveur");
/* L'addition ne voyage PLUS par ce document. Elle avait ici une seconde
   représentation vivante, à côté de la table `orders`, et rien ne disait
   laquelle gagne : c'est cette rivalité qui produisait les additions
   dupliquées et ressuscitées. Le document ne garde que l'occupation ; les
   articles saisis au comptoir atteignent le serveur par la file, à laquelle
   le bon de caisse est désormais rattaché (voir order-delivery-test). */
ok(openedState.states['1'].lines === undefined,
  "le document d'occupation ne transporte plus d'addition");
ok(openedState.events.some((event) => event.type === 'table-state' && event.table === '1' && event.status === 'ka-yaklo'),
  'le serveur affecté garde la notification de table ouverte dans son historique');
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: saraCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, state: { table: '1', status: 'ka-yaklo', covers: 4, lines: [
    { key: 'employee-line-1', id: 'i1', name: 'Tajine', price: 90, qty: 3, sentQty: 2, note: 'peu épicé' },
  ] },
}) });
response = await eventsPost({ request, env });
ok(response.status === 200, "l'app employé sauvegarde l'addition complète avant même un rechargement");
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const employeeBillState = await json(response);
/* L'occupation traverse, l'addition non. Ce que le serveur a ENVOYÉ en cuisine
   atteint la caisse par la file (attachOrderProTable) ; ce qu'il a seulement
   saisi sans l'envoyer reste sur son appareil, où un brouillon a sa place. La
   partager entretenait une addition sans identité ni cycle de vie sur deux
   appareils à la fois — la mécanique même des doublons. */
/* `source` n'est plus vérifié ici : l'envoi du serveur ne porte que
   l'occupation, identique à celle que la caisse venait de publier, donc il ne
   change rien — et un état inchangé garde légitimement sa provenance. C'est
   l'ancienne recopie des lignes qui rendait chaque envoi « différent ». */
ok(employeeBillState.states['1'].status === 'ka-yaklo'
  && employeeBillState.states['1'].covers === 4
  && employeeBillState.states['1'].lines === undefined,
  "la caisse reçoit l'occupation de la table, jamais son addition");
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'ka-yaklo', covers: 4, syncVersion: 3, lines: [] }] },
}) });
response = await eventsPost({ request, env });
ok(response.status === 200, "le heartbeat vide et en retard de la caisse est accepté sans effacer l'addition");
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: saraCookie } });
response = await eventsGet({ request, env }); const billAfterEmptyHeartbeat = await json(response);
/* Ce contrôle gardait un arbitrage — « garder les lignes de l'employé tant que
   la caisse ne les a pas répétées » — écrit contre un symptôme : un battement
   de caisse en retard effaçait l'addition du serveur. L'arbitrage a disparu
   avec sa cause. Le document ne portant plus d'addition, un battement vide n'a
   plus rien à effacer ; il ne peut agir que sur l'occupation. */
ok(billAfterEmptyHeartbeat.states['1'].lines === undefined
  && billAfterEmptyHeartbeat.states['1'].status === 'ka-yaklo',
  "un battement de caisse vide ne peut plus toucher à une addition qu'il ne porte pas");
/* An Addition request is an employee transition, not a cosmetic local flag.
   Until the till has echoed the same state, its older occupied heartbeat must
   not erase the pink request before the till's reader sees it. */
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: saraCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, state: { table: '1', status: 'bgha-ykhlass', covers: 4, syncVersion: 4 },
}) });
response = await eventsPost({ request, env });
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'ka-yaklo', covers: 4, syncVersion: 4 }] },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const billRequestBeforeAck = await json(response);
ok(billRequestBeforeAck.states['1'].status === 'bgha-ykhlass'
  && billRequestBeforeAck.states['1'].source === 'employee',
  "le heartbeat occupé de la caisse n'efface jamais une demande d'addition serveur");
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'bgha-ykhlass', covers: 4, syncVersion: 4 }] },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const billRequestAcknowledged = await json(response);
ok(billRequestAcknowledged.states['1'].status === 'bgha-ykhlass'
  && billRequestAcknowledged.states['1'].source === 'caisse',
  "la caisse acquitte l'addition en répétant exactement l'état reçu");
/* Closing must still carry an employee intent when the cloud document already
   says free: the caisse can have an occupied local bill that the document does
   not know about yet. */
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '3', status: 'khawya', covers: 0, syncVersion: 4 }] },
}) });
response = await eventsPost({ request, env });
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: saraCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, state: { table: '3', status: 'khawya', covers: 0, syncVersion: 4 },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const sameStateCloseIntent = await json(response);
ok(sameStateCloseIntent.states['3'].status === 'khawya'
  && sameStateCloseIntent.states['3'].source === 'employee',
  "fermer une table déjà libre dans le cloud transmet quand même l'intention à la caisse");
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: saraCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, state: { table: '1', status: 'khawya', covers: 0, syncVersion: 4 },
}) });
response = await eventsPost({ request, env });
ok(response.status === 200, 'le serveur libère la table dans le même état cloud que la caisse');
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'ka-yaklo', covers: 4, syncVersion: 3, lines: [
    { key: 'stale-caisse-line', id: 'i1', name: 'Tajine', price: 80, qty: 1, sentQty: 1 },
  ] }] },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const closeAfterStaleHeartbeat = await json(response);
ok(closeAfterStaleHeartbeat.states['1'].status === 'khawya'
  && closeAfterStaleHeartbeat.states['1'].source === 'employee',
  "le heartbeat encore ouvert de la caisse ne peut plus annuler le paiement employé");
/* The close is a barrier, not a 15-second race. It remains authoritative until
   the caisse has read it and explicitly echoed the terminal state. */
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'ka-yaklo', covers: 6 }] },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const closeStillWaiting = await json(response);
ok(closeStillWaiting.states['1'].status === 'khawya' && closeStillWaiting.states['1'].source === 'employee',
  "une ancienne table occupée ne ressuscite jamais avant l'acquittement caisse");
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'khawya', covers: 0, lines: [], syncVersion: 4 }] },
}) });
response = await eventsPost({ request, env });
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'ka-yaklo', covers: 2, lines: [], syncVersion: 4 }] },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const nextVisit = await json(response);
ok(nextVisit.states['1'].status === 'ka-yaklo' && nextVisit.states['1'].source === 'caisse',
  "après acquittement, une nouvelle visite ouvre une addition vraiment neuve");
ok(closeAfterStaleHeartbeat.states['1'].status === 'khawya'
  && closeAfterStaleHeartbeat.states['1'].source === 'employee'
  && closeAfterStaleHeartbeat.states['1'].lines === undefined,
  'la caisse reçoit immédiatement la fermeture et aucune ancienne ligne ne survit');
result = await qpost(saraCookie, { merchant, closeTable: '1', closedBy: 'service' });
ok(result.response.status === 200 && result.body.ok && result.body.closed === 1,
  'fermer côté serveur coupe aussi la session OrderPro qui rouvrait la table');
request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, snapshot: { tables: [{ table: '1', status: 'khawya', covers: 0 }, { table: '2', status: 'khlass', covers: 2 }] },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: omarCookie } });
response = await eventsGet({ request, env }); const paidState = await json(response);
ok(paidState.states['2'] && paidState.states['2'].status === 'khlass'
  && paidState.events.some((event) => event.table === '2' && event.status === 'khlass'),
  "l'addition réglée en caisse atteint la table et le centre de notifications du serveur");

request = new Request('https://kiwi.test/api/team/live', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, action: 'manager-pause', memberId: 'omar' }) });
response = await teamLivePost({ request, env });
ok(response.status === 200, 'la caisse met Omar en pause dans le pointage partagé');
saraQueue = await qget(saraCookie);
ok(saraQueue.body.service.pausedTables.includes('2'), 'les tables du collègue en pause sont signalées à couvrir');
result = await qpost(omarCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 403 && result.body.error === 'employee-on-pause', 'le serveur en pause ne prend pas de commande');
result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 200, 'un collègue pointé couvre la table pendant la pause');

const employeePayment = {
  id: 'employee-sale-bill-1-emp', table: '1', session: 'sess-payment-table-1', amount: 180, method: 'cash', label: 'Table 1 · Sara', ref: '1',
  lines: [{ name: 'Tajine', qty: 2, total: 180, cat: 'Plats' }],
};
/* La visite commence AVANT les commandes qu'elle porte — sans quoi la scène
   décrit une addition ouverte après ses propres tickets, ce qui n'arrive pas.
   Le détail compte depuis que /api/sale solde la VISITE et non « tout ce qui
   traîne sur cette table depuis minuit » : une tablée ne doit plus pouvoir
   payer l'addition de la précédente. `INSERT OR REPLACE` remplace ici la
   session vivante ouverte par les commandes ci-dessus (l'index unique partiel
   n'en tolère qu'une), et c'est voulu : on force la scène du paiement. */
put(`INSERT OR REPLACE INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts)
     VALUES (?,?,?,?,?,?,?)`, 'sess-payment-table-1', merchant, 'table', '1', 'open', now - 3600000, now);
put(`UPDATE orders SET session_id=? WHERE merchant=? AND table_no='1' AND paid_ts IS NULL`,
  'sess-payment-table-1', merchant);
request = new Request('https://kiwi.test/api/sale', {
  method: 'POST', headers: { Cookie: saraCookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ merchant, ...employeePayment }),
});
response = await gate({ request, env, next: () => new Response('next') });
ok(response.status === 200 && await response.text() === 'next',
  "la porte edge laisse le serveur pointé atteindre l'encaissement");
let paid = await employeeSale(saraCookie, employeePayment);
ok(paid.response.status === 200 && paid.body.ok,
  "un serveur pointé inscrit le paiement dans le même journal cloud que la caisse");
const settledSession = db.prepare("SELECT status FROM table_sessions WHERE id='sess-payment-table-1'").get();
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&role=caisse&since=0`, { headers: { Cookie: ownerCookie } });
response = await eventsGet({ request, env }); const settledFloor = await json(response);
ok(settledSession.status === 'closed'
  && settledFloor.states['1'].status === 'khawya'
  && db.prepare("SELECT COUNT(*) AS n FROM orders WHERE merchant=? AND table_no='1' AND paid_ts IS NULL").get(merchant).n === 0,
  "le même acquittement libère la table, ferme OrderPro et solde ses tickets avant de répondre");
paid = await employeeSale(saraCookie, employeePayment);
const savedPayments = db.prepare("SELECT id, amount, lines FROM sales WHERE merchant=? AND id='visit-sess-payment-table-1-emp'").all(merchant);
const savedLines = JSON.parse(savedPayments[0] && savedPayments[0].lines || '[]');
ok(paid.response.status === 200 && savedPayments.length === 1 && savedPayments[0].amount === 180
  && savedLines[0].n === 'Tajine' && savedLines[0].q === 2,
  "un retry Wi-Fi du paiement reste unique et conserve les articles pour l'historique");

request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, event: { type: 'table-seated', table: '2', server: 'Omar Service', customer: 'Famille Bennis', covers: 3 },
}) });
response = await eventsPost({ request, env });
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=${now}`, { headers: { Cookie: saraCookie } });
response = await eventsGet({ request, env }); const coverageEvents = await json(response);
ok(response.status === 200 && coverageEvents.events.some((event) => event.table === '2'), 'la notification du serveur en pause atteint les collègues disponibles');
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=${now}`, { headers: { Cookie: omarCookie } });
response = await eventsGet({ request, env }); const pausedEvents = await json(response);
ok(response.status === 200 && pausedEvents.events.length === 0, 'le serveur en pause ne reçoit pas les alertes opérationnelles');

request = new Request('https://kiwi.test/api/team/live', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, action: 'manager-resume', memberId: 'omar' }) });
response = await teamLivePost({ request, env });
ok(response.status === 200, 'la caisse termine la pause d’Omar et ferme sa période');

const attendanceOff = { entries: attendance.entries.map((entry) => entry.staffId === 'sara' ? { ...entry, outTs: now } : entry) };
put("UPDATE store_docs SET data=?, rev=rev+1 WHERE merchant=? AND feature='attendance'", JSON.stringify(attendanceOff), merchant);
saraQueue = await qget(saraCookie);
ok(saraQueue.response.status === 403, 'hors service, la commande et les notifications sont fermées');
paid = await employeeSale(saraCookie, { ...employeePayment, id: 'employee-sale-off-shift' });
ok(paid.response.status === 403,
  "hors service, le même compte ne peut pas inscrire un encaissement");
request = new Request(`https://kiwi.test/api/order/queue?merchant=${merchant}&role=service`, { headers: { Cookie: saraCookie } });
response = await gate({ request, env, next: () => new Response('next') });
ok(response.status === 401, 'la porte edge refuse aussi le canal après pointage de sortie');

if (failures) process.exit(1);
console.log('\n✓ interconnexion service (caisse · plan · OrderPro/KDS · serveur)');
