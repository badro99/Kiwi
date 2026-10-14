#!/usr/bin/env node
/* File des commandes · ce qu'un serveur en service a le droit de lire.
 *
 * GET /api/order/queue ouvre la même porte au comptoir et à un serveur pointé.
 * Sans `?role=service`, le serveur recevait la file ENTIÈRE du commerce : les
 * commandes de livraison avec le téléphone et l'adresse du client, et les
 * tables des autres. Désormais, un appelant qui n'est ni la caisse appairée, ni
 * le propriétaire, ni un opérateur est ramené au périmètre « service », et les
 * coordonnées d'un client ne lui sont jamais renvoyées.
 *
 * (Les ÉCRITURES d'un serveur sur « toutes les tables » de la salle sont un choix
 * de produit documenté dans queue.js : un collègue en service peut aider.)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { employeeCookie, employeeToken, makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/order/queue.js';

const SECRET = 'waiter-queue-privacy-secret';
const MERCHANT = 'queue-privacy-resto';
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; console.log('  ✓ ' + message); };

const raw = new DatabaseSync(':memory:');
raw.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values.map((v) => (v === undefined ? null : v)); return statement; },
      async first() { return raw.prepare(sql).get(...args) || null; },
      async all() { return { results: raw.prepare(sql).all(...args) }; },
      async run() { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
    };
    return statement;
  },
  async batch(statements) {
    raw.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await s.run()); raw.exec('COMMIT'); return out; }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-queue', 'queue@example.test', 'Owner', 'Queue Privacy Resto', 's', 'h', now);
raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run(MERCHANT, '{}', 'restaurant', 'active', 'Queue Privacy Resto', 'acc-queue', now);
const member = { id: 'staff-1', firstName: 'Amina', lastName: 'Serveuse', role: 'Serveur', function: 'Serveur' };
const doc = raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)');
doc.run(MERCHANT, 'employee-access', JSON.stringify({ members: [member] }), 1, now);
doc.run(MERCHANT, 'team', JSON.stringify({ members: [member] }), 1, now);
doc.run(MERCHANT, 'attendance', JSON.stringify({ entries: [{ memberId: 'staff-1', staffId: 'staff-1', inTs: now - 60000, outTs: 0 }] }), 1, now);
doc.run(MERCHANT, 'floorplan', JSON.stringify({ tables: [{ num: '1', servers: ['staff-1'] }, { num: '2', servers: ['autre'] }] }), 1, now);
raw.prepare("INSERT INTO table_sessions (id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES ('tsx-privacyvisit0000000001',?,'table','1','open',?,?)")
  .run(MERCHANT, now - 5000, now - 1000);
const order = raw.prepare(`INSERT INTO orders (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,channel,ext_ref,customer,session_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const PHONE = '0600000042';
const ADDRESS = '12 rue des Orangers';
order.run('ord-table-1', MERCHANT, 1, 'table', '1', 60, '[{"name":"Tajine","qty":1}]', 'accepted', now - 4000, now - 3000,
  'kiwi', '', JSON.stringify({ name: 'Mme Alaoui', phone: PHONE }), 'tsx-privacyvisit0000000001');
order.run('ord-delivery-1', MERCHANT, 2, 'takeout', '', 80, '[{"name":"Pastilla","qty":1}]', 'accepted', now - 4000, now - 2000,
  'glovo', 'GL-1', JSON.stringify({ name: 'Youssef', phone: PHONE, address: ADDRESS }), null);

const staff = (await employeeCookie(await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'staff-1' }))).split(';')[0];
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
const owner = `${SESS_COOKIE}=${await makeSession('acc-queue', SECRET)}`;
const get = async (cookie, query = '') => {
  const response = await onRequestGet({ env, request: new Request(
    `https://kiwi.test/api/order/queue?merchant=${MERCHANT}${query}`, { headers: { cookie } }) });
  return { status: response.status, text: await response.clone().text(), body: await response.json() };
};

console.log('■ File des commandes · périmètre d\'un serveur');

let r = await get(staff);
ok(r.status === 200 && r.body.ok, 'un serveur pointé lit la file sans préciser de rôle');
ok(r.body.orders.length === 1 && r.body.orders[0].id === 'ord-table-1',
  'il ne reçoit que les commandes de la salle : la livraison n\'en fait pas partie');
ok(!r.text.includes(PHONE) && !r.text.includes(ADDRESS) && !/orangers/i.test(r.text),
  'ni le téléphone ni l\'adresse d\'un client ne sont dans la réponse');
ok(r.body.orders[0].customer && r.body.orders[0].customer.name === 'Mme Alaoui' && r.body.orders[0].customer.phone === undefined,
  'un client de table reste appelable par son nom, sans coordonnées');
ok(r.body.service && Array.isArray(r.body.service.allTables), 'la réponse porte le périmètre « service »');

r = await get(staff, '&role=kitchen');
ok(r.status === 200 && r.body.orders.length === 1 && !r.text.includes(PHONE),
  'demander un autre rôle ne desserre rien pour un serveur');
r = await get(staff, '&role=service');
ok(r.status === 200 && r.body.orders.length === 1 && !r.text.includes(PHONE), 'le rôle « service » explicite donne la même vue');

r = await get(till);
ok(r.status === 200 && r.body.orders.length === 2 && r.text.includes(PHONE) && r.text.includes(ADDRESS),
  'la caisse appairée garde la file entière, coordonnées comprises');
r = await get(owner);
ok(r.status === 200 && r.body.orders.length === 2 && r.text.includes(ADDRESS), 'le propriétaire aussi');
r = await get('');
ok(r.status === 403, 'sans identité, rien');

console.log(`\n✓ ${controls} contrôles : un serveur ne lit que sa salle, sans coordonnées de client.`);
