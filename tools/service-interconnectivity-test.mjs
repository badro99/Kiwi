#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { employeeToken, employeeCookie, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet as queueGet, onRequestPost as queuePost } from '../functions/api/order/queue.js';
import { onRequestGet as eventsGet, onRequestPost as eventsPost } from '../functions/api/service/events.js';
import { onRequestPost as employeePost } from '../functions/api/employee.js';
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
  cats: [{ id: 'c1', name: 'Plats', sub: [] }], items: [{ id: 'i1', name: 'Tajine', price: 80, catId: 'c1', avail: true }],
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
    { id: 't1', num: '1', zone: 'z1', server: 'fs-sara', seats: 4 },
    { id: 't2', num: '2', zone: 'z1', server: 'fs-omar', seats: 4 },
  ],
};
const attendance = { entries: [
  { id: 'a1', staffId: 'sara', memberId: 'sara', name: 'Sara Service', inTs: now - 1000, outTs: 0 },
  { id: 'a2', staffId: 'omar', memberId: 'omar', name: 'Omar Service', inTs: now - 1000, outTs: 0 },
] };
for (const [feature, data] of [['team', team], ['floorplan', floor], ['attendance', attendance]]) {
  put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', merchant, feature, JSON.stringify(data), 1, now);
}
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

let result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '1', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 200 && result.body.ok && result.body.total === 80, 'le serveur pointé envoie sa table en cuisine');
const saraOrderId = result.body.id;
result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 200, "Toutes les tables permet à un serveur de couvrir la table d'un collègue");
result = await qpost(kitchenCookie, { merchant, create: true, mode: 'table', table: '1', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 403, "un rôle cuisine n'ouvre jamais le canal de commande serveur");

put(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 'ord-orderpro-sara', merchant, 91, 'table', '1', 80,
  JSON.stringify([{ id: 'i1', name: 'Tajine', qty: 1, unitPrice: 80 }]), 'pending', now, now, 'sess-orderpro');

await qpost(ownerCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }], ref: 'omar-order' });
let saraQueue = await qget(saraCookie);
ok(saraQueue.response.status === 200
  && saraQueue.body.orders.some((order) => order.table === '1')
  && saraQueue.body.orders.some((order) => order.table === '2')
  && saraQueue.body.service.mineTables.includes('1')
  && saraQueue.body.service.allTables.includes('2'), 'Mes tables reste identifié, Toutes les tables reçoit le plan complet');
ok(saraQueue.body.orders.some((order) => order.id === 'ord-orderpro-sara' && order.status === 'pending' && order.session),
  'une nouvelle commande OrderPro de sa table atteint Sara');
const omarQueue = await qget(omarCookie);
ok(omarQueue.response.status === 200 && omarQueue.body.service.mineTables.includes('2'), 'Omar garde la propriété de sa table');

result = await qpost(ownerCookie, { merchant, id: saraOrderId, status: 'ready' });
ok(result.response.status === 200 && result.body.status === 'ready', 'le KDS publie le statut prêt');
saraQueue = await qget(saraCookie);
ok(saraQueue.body.orders.some((order) => order.id === saraOrderId && order.status === 'ready'), 'le serveur affecté reçoit le prêt cuisine');

let request = new Request('https://kiwi.test/api/service/events', { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
  merchant, event: { type: 'table-seated', table: '1', server: 'Sara Service', customer: 'Famille Alaoui', covers: 4 },
}) });
let response = await eventsPost({ request, env });
ok(response.status === 200, 'la caisse publie une installation depuis la file attente');
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: saraCookie } });
response = await eventsGet({ request, env }); const saraEvents = await json(response);
ok(response.status === 200 && saraEvents.events.length === 1, 'seule la serveuse affectée reçoit la notification de table installée');
request = new Request(`https://kiwi.test/api/service/events?merchant=${merchant}&since=0`, { headers: { Cookie: omarCookie } });
response = await eventsGet({ request, env }); const omarEvents = await json(response);
ok(response.status === 200 && omarEvents.events.length === 0, "le collègue non affecté ne reçoit pas l'évènement");

request = new Request('https://kiwi.test/api/employee', { method: 'POST', headers: { Cookie: omarCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }) });
response = await employeePost({ request, env });
ok(response.status === 200, 'Omar signale sa pause dans le pointage partagé');
saraQueue = await qget(saraCookie);
ok(saraQueue.body.service.pausedTables.includes('2'), 'les tables du collègue en pause sont signalées à couvrir');
result = await qpost(omarCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 403 && result.body.error === 'employee-on-pause', 'le serveur en pause ne prend pas de commande');
result = await qpost(saraCookie, { merchant, create: true, mode: 'table', table: '2', lines: [{ id: 'i1', qty: 1 }] });
ok(result.response.status === 200, 'un collègue pointé couvre la table pendant la pause');

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

request = new Request('https://kiwi.test/api/employee', { method: 'POST', headers: { Cookie: omarCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resume' }) });
response = await employeePost({ request, env });
ok(response.status === 200, 'Omar reprend son service et ferme sa période de pause');

const attendanceOff = { entries: attendance.entries.map((entry) => entry.staffId === 'sara' ? { ...entry, outTs: now } : entry) };
put("UPDATE store_docs SET data=?, rev=rev+1 WHERE merchant=? AND feature='attendance'", JSON.stringify(attendanceOff), merchant);
saraQueue = await qget(saraCookie);
ok(saraQueue.response.status === 403, 'hors service, la commande et les notifications sont fermées');
request = new Request(`https://kiwi.test/api/order/queue?merchant=${merchant}&role=service`, { headers: { Cookie: saraCookie } });
response = await gate({ request, env, next: () => new Response('next') });
ok(response.status === 401, 'la porte edge refuse aussi le canal après pointage de sortie');

if (failures) process.exit(1);
console.log('\n✓ interconnexion service (caisse · plan · OrderPro/KDS · serveur)');
