#!/usr/bin/env node
/* « − », « + » et la note d'un plat déjà envoyé, tels que le téléphone les
 * envoie (functions/api/order/_queue-quantities.js › editLine).
 *
 *   node tools/serveur-sent-line-edit-test.mjs
 *
 * Café réel, 21 nov. 2026. Le téléphone nomme une ligne envoyée par son uid
 * (deux lignes peuvent porter le même plat, avec deux notes). editLine la
 * trouvait bien, puis cherchait sa copie de travail par `l.id || l.uid` :
 * jamais d'uid, copie introuvable, exception, 500. Au banc
 * (tools/serveur-live-harness.mjs, vrais clics) : « − » sur 2 msemen envoyés
 * → « Modification refusée · opération impossible », « + » → « Ajout
 * refusé », la note d'un plat envoyé jamais enregistrée. Ici, contre la vraie
 * route, une commande créée par le vrai chemin du téléphone (create), puis
 * les trois gestes par uid, et la ligne visée parmi deux du même plat. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { employeeToken, employeeCookie } from '../functions/auth/_lib.js';
import * as queueApi from '../functions/api/order/queue.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = await fixture(root);
const { sql, env, merchant } = f;
const prepare = f.DB.prepare.bind(f.DB);
f.DB.prepare = (query) => {
  const statement = prepare(query);
  for (const method of ['first', 'all']) { const run = statement[method].bind(statement); statement[method] = async (...args) => run(...args); }
  return statement;
};
const now = Date.now();
sql.prepare("UPDATE merchant_config SET type='restaurant', features=? WHERE merchant=?").run('{"orderpro":true}', merchant);
sql.prepare('INSERT INTO order_desk(merchant, seen_ts) VALUES(?, ?)').run(merchant, now);
const MENU = { cats: [{ id: 'cat_p', name: 'Petit déjeuner' }], items: [
  { id: 'it_msemen', name: 'Msemen miel', price: 14, catId: 'cat_p', avail: true },
  { id: 'it_cafe', name: 'Café noir', price: 12, catId: 'cat_p', avail: true },
] };
sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)').run(merchant, 'Banc', 'restaurant', JSON.stringify(MENU), now);
const doc = (feature, data) => sql.prepare('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run(merchant, feature, JSON.stringify(data), now);
doc('team', { members: [{ id: 'w1', firstName: 'Salma', lastName: 'Test', function: 'serveur', department: 'salle' }] });
doc('floorplan', { zones: [{ id: 'z1', name: 'Salle' }], tables: [{ id: 't4', num: '4', zone: 'z1', seats: 4, status: 'free', server: 'w1', servers: ['w1'] }] });
doc('attendance', { entries: [{ id: 'att-1', staffId: 'w1', memberId: 'w1', name: 'Salma Test', role: 'serveur', inTs: now - 3600e3, outTs: 0 }] });
const cookie = employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant, staffId: 'w1', authVersion: 0 })).split(';')[0];

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
async function post(body) {
  const request = new Request('https://kiwi-os.com/api/order/queue', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://kiwi-os.com' },
    body: JSON.stringify({ merchant, ...body }),
  });
  const res = await queueApi.onRequestPost({ request, env, waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const order = () => sql.prepare("SELECT id, total, lines FROM orders WHERE merchant = ? AND table_no = '4' AND paid_ts IS NULL ORDER BY rowid DESC LIMIT 1").get(merchant);
const lineOf = (uid) => JSON.parse(order().lines).find((l) => l.uid === uid);

/* Le téléphone ouvre la table et envoie : 2 msemen (ln1), 1 msemen « bien chaud » (ln2), 1 café (ln3). */
const opened = await post({ openTable: '4', covers: 2 });
check(opened.status === 200 && opened.data.ok, 'la table 4 s’ouvre');
const line = (uid, id, name, qty, unitPrice, note = '') => ({ id, uid, name, qty, unitPrice, options: '', visuals: [], optionChoices: [], note, station: '' });
const sent = await post({ create: true, mode: 'table', table: '4', ref: 'sv-banc-1', server: 'Salma Test', expectedSession: opened.data.session,
  lines: [line('ln1', 'it_msemen', 'Msemen miel', 2, 14), line('ln2', 'it_msemen', 'Msemen miel', 1, 14, 'bien chaud'), line('ln3', 'it_cafe', 'Café noir', 1, 12)] });
check(sent.status === 200 && sent.data.ok, `la commande part en cuisine (${sent.status})`);
const id = order().id;
check(order().total === 54, `54 MAD au serveur (${order().total})`);

/* « − » sur la ligne ln1 (2 → 1), par uid, comme le téléphone. */
let r = await post({ editLine: { table: '4', orderId: id, lineId: 'ln1', qty: 1, isWaste: 0, actor: 'Salma Test' } });
check(r.status === 200 && r.data && r.data.ok, `« − » sur un plat envoyé, non commencé : accepté (${r.status} ${r.data && r.data.error || ''})`);
check(lineOf('ln1').qty === 1 && lineOf('ln2').qty === 1, 'seule la ligne visée descend (ln1 à 1, la ligne « bien chaud » reste à 1)');
check(order().total === 40, `l’addition suit : 40 MAD (${order().total})`);

/* « + » sur la ligne ln2 (1 → 2). */
r = await post({ editLine: { table: '4', orderId: id, lineId: 'ln2', qty: 2, actor: 'Salma Test' } });
check(r.status === 200 && r.data && r.data.ok, `« + » sur un plat envoyé : accepté (${r.status} ${r.data && r.data.error || ''})`);
check(lineOf('ln2').qty === 2 && lineOf('ln2').note === 'bien chaud' && lineOf('ln1').qty === 1, 'la ligne « bien chaud » monte à 2, sa note intacte, l’autre ne bouge pas');
check(order().total === 54, `54 MAD (${order().total})`);

/* La note d'un plat envoyé, par uid. */
r = await post({ editLine: { table: '4', lineId: 'ln3', note: 'sans sucre', actor: 'Salma Test' } });
check(r.status === 200 && r.data && r.data.ok, `la note d’un plat envoyé s’enregistre (${r.status} ${r.data && r.data.error || ''})`);
check(lineOf('ln3').note === 'sans sucre' && lineOf('ln3').qty === 1, 'le café porte « sans sucre »');

/* Un uid inconnu reste un refus propre, jamais une exception. */
r = await post({ editLine: { table: '4', orderId: id, lineId: 'ln-absent', qty: 1 } });
check(r.status === 404 && r.data && r.data.error === 'line-not-on-order', `uid inconnu : 404 line-not-on-order (${r.status})`);

f.close();
console.log(`serveur-sent-line-edit-test: ${checks} checks passed`);
