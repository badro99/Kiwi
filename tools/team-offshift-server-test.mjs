#!/usr/bin/env node
/* Un employé non pointé ne prend ni commande ni paiement : le SERVEUR le dit.
 *
 * « Consulter sans pointer » (kiwi-serveur.html) est verrouillé côté client,
 * mais un verrou client ne protège rien si quelqu'un rejoue la requête à la
 * main avec son cookie d'employé. Ce banc fait tourner les vraies Pages
 * Functions contre une base SQLite construite depuis schema.sql, avec de vrais
 * cookies d'employé signés, pour trois profils :
 *
 *   · jamais pointé (aucune entrée de pointage),
 *   · pointé puis sorti (entrée avec outTs),
 *   · pointé et en service (entrée ouverte).
 *
 * Les deux premiers doivent recevoir un refus sur CHAQUE écriture que le
 * client leur ferme : créer un ticket, ouvrir/fermer/annuler une table,
 * transférer, fusionner, annuler une ligne, encaisser, publier un événement de
 * salle, acquitter une demande client. Le troisième continue de passer, et le
 * propriétaire (session de compte) aussi : rien ne change pour eux.
 *
 *   node tools/team-offshift-server-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { employeeToken, employeeCookie, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as queuePost } from '../functions/api/order/queue.js';
import { onRequestPost as eventsPost } from '../functions/api/service/events.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async all() { return { results: db.prepare(sql).all(...args) }; },
  async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } };
DB.batch = async (statements) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    db.exec('COMMIT');
    return results;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }
};
const SECRET = 'team-offshift-secret';
const env = { DB, AUTH_SECRET: SECRET };
const merchant = 'test-restaurant';
const now = Date.now();
const put = (sql, ...args) => db.prepare(sql).run(...args);
put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)',
  'acc-1', 'owner@test.ma', 'Owner', 'Test Restaurant', 's', 'h', now);
put('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)',
  merchant, '{"orderpro":true}', 'restaurant', 'active', 'Test Restaurant', 'acc-1', now);
put('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)', merchant, 'Menu', 'restaurant', JSON.stringify({
  cats: [{ id: 'c1', name: 'Plats', sub: [] }], opts: [],
  items: [{ id: 'i1', name: 'Tajine', price: 80, catId: 'c1', avail: true, opts: [] }],
}), now);
const team = { members: ['sara', 'omar', 'lin'].map((id) => ({
  id, firstName: id[0].toUpperCase() + id.slice(1), lastName: 'Service', function: 'Serveur', department: 'Salle', pinCode: '0000',
})) };
const floor = {
  staff: [], zones: [{ id: 'z1', name: 'Salle' }],
  tables: ['1', '2', '3'].map((n) => ({ id: 't' + n, num: n, zone: 'z1', server: '', seats: 4 })),
};
/* sara : en service. lin : entrée fermée. omar : aucune entrée. */
const attendance = { entries: [
  { id: 'a1', staffId: 'sara', memberId: 'sara', name: 'Sara Service', inTs: now - 1000, outTs: 0 },
  { id: 'a2', staffId: 'lin', memberId: 'lin', name: 'Lin Service', inTs: now - 7200000, outTs: now - 3600000 },
] };
for (const [feature, data] of [['team', team], ['floorplan', floor], ['attendance', attendance]]) {
  put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', merchant, feature, JSON.stringify(data), 1, now);
}
const cookieFor = async (staffId) => employeeCookie(await employeeToken(SECRET, { merchant, staffId })).split(';')[0];
const cookies = { sara: await cookieFor('sara'), lin: await cookieFor('lin'), omar: await cookieFor('omar') };
const ownerCookie = sessionCookie(await makeSession('acc-1', SECRET)).split(';')[0];

let failures = 0;
function ok(value, label) { console.log('  ' + (value ? '✓' : '✗') + ' ' + label); if (!value) failures++; }
async function call(handler, url, cookie, body) {
  const request = new Request('https://kiwi.test' + url, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, ...body }),
  });
  const response = await handler({ request, env });
  let data = {}; try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}

/* Chaque écriture que le client ferme en consultation. */
const writes = {
  'créer un ticket (envoi en cuisine)': (c) => call(queuePost, '/api/order/queue', c, { create: true, mode: 'table', table: '1', lines: [{ id: 'i1', qty: 1 }] }),
  'ouvrir une table': (c) => call(queuePost, '/api/order/queue', c, { openTable: '2', covers: 2 }),
  'fermer / annuler toute la table': (c) => call(queuePost, '/api/order/queue', c, { closeTable: '2', closedBy: 'service' }),
  'transférer une table': (c) => call(queuePost, '/api/order/queue', c, { transferTable: { from: '2', to: '3', covers: 2 } }),
  'fusionner deux tables': (c) => call(queuePost, '/api/order/queue', c, { mergeTables: { sourceTable: '2', targetTable: '3' } }),
  'annuler une ligne envoyée': (c) => call(queuePost, '/api/order/queue', c, { voidLine: { tableNo: '1', lineId: 'x', reason: 'order_error' } }),
  'encaisser une table': (c) => call(salePost, '/api/sale', c, {
    id: 'sale-' + Math.random().toString(36).slice(2), table: '1', amount: 80, method: 'cash', label: 'Table 1',
    lines: [{ name: 'Tajine', qty: 1, total: 80, cat: 'Plats' }],
  }),
  'publier un événement de salle': (c) => call(eventsPost, '/api/service/events', c, { event: { type: 'table-seated', table: '2', server: 'X', covers: 2 } }),
  'acquitter une demande client': (c) => call(eventsPost, '/api/service/events', c, { ackRequest: 'req-1' }),
};

for (const [who, label] of [['omar', 'jamais pointé'], ['lin', 'pointé puis sorti']]) {
  for (const [name, run] of Object.entries(writes)) {
    const r = await run(cookies[who]);
    ok(r.status === 401 || r.status === 403, `${label} : « ${name} » est refusé (HTTP ${r.status}${r.data.error ? ', ' + r.data.error : ''})`);
  }
}
const ledger = db.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant=?').get(merchant).n;
const tickets = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE merchant=?').get(merchant).n;
ok(ledger === 0 && tickets === 0, 'aucune vente ni aucun ticket n\'a été écrit par un employé non pointé');

/* Inchangé pour qui est pointé, et pour le propriétaire. */
let r = await writes['créer un ticket (envoi en cuisine)'](cookies.sara);
ok(r.status === 200 && r.data.ok, 'pointé et en service : créer un ticket passe toujours');
r = await writes['encaisser une table'](cookies.sara);
ok(r.status === 200 && r.data.ok, 'pointé et en service : encaisser passe toujours');
r = await writes['publier un événement de salle'](ownerCookie);
ok(r.status === 200, 'le propriétaire (session de compte) publie toujours un événement de salle');

if (failures) process.exit(1);
console.log('\n✓ employé non pointé : aucune écriture de commande, d\'état de table ou de paiement côté serveur');
