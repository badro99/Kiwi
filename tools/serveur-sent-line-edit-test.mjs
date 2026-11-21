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

/* Plats acceptés en cuisine : « + » et « − » sont des deltas. Le téléphone
 * dont la réponse se perd (12 s) rejoue le même geste avec le même
 * requestId : la première réponse revient, rien n'est compté deux fois. */
const accept = (uids) => { const o = order(); const ls = JSON.parse(o.lines).map((l) => uids.includes(l.uid) ? { ...l, stationAccepted: true } : l);
  sql.prepare('UPDATE orders SET lines = ?, status = ?, updated_ts = updated_ts + 1 WHERE id = ?').run(JSON.stringify(ls), 'accepted', o.id); };
const seen = () => sql.prepare('SELECT updated_ts FROM orders WHERE id = ?').get(id).updated_ts;
accept(['ln2', 'ln3']);
const before = order().total;
const plus = { table: '4', orderId: id, lineId: 'ln3', qty: 2, actor: 'Salma Test', requestId: 'edl-banc-plus-0001', seenTs: seen() };
const p1 = await post({ editLine: plus });
const p2 = await post({ editLine: plus });
check(p1.status === 200 && p1.data.action === 'appended' && p2.status === 200 && p2.data.replayed === true, `« + » sur un café accepté, rejoué : la première réponse revient (${p1.status}/${p2.status} ${p2.data && (p2.data.error || '')})`);
check(order().total === before + 12, `un seul café de plus sur l’addition (${before} → ${order().total}, attendu ${before + 12})`);
check(JSON.parse(order().lines).filter((l) => l.name === 'Café noir').length === 2, 'une seule ligne ajoutée pour le delta');
const stale = await post({ editLine: { ...plus, requestId: 'edl-banc-plus-0002' } });
check(stale.status === 409 && stale.data.error === 'order-changed', `un nouveau « + » sur l’image d’avant est refusé : order-changed (${stale.status} ${stale.data && stale.data.error})`);
check(order().total === before + 12, 'l’addition ne bouge pas');

const minus = { table: '4', orderId: id, lineId: 'ln2', qty: 1, isWaste: 0, actor: 'Salma Test', requestId: 'edl-banc-minus-0001', seenTs: seen() };
const m1 = await post({ editLine: minus });
const m2 = await post({ editLine: minus });
const voids = () => sql.prepare("SELECT id, qty FROM kitchen_voids WHERE merchant = ? AND status = 'pending'").all(merchant);
check(m1.status === 200 && m1.data.alertSent && m2.status === 200 && m2.data.replayed === true, `« − » sur 2 msemen « bien chaud » acceptés, rejoué : une seule demande (${m1.status}/${m2.status})`);
check(voids().length === 1 && voids()[0].qty === 1, `une seule annulation en attente, pour 1 msemen (${JSON.stringify(voids())})`);
const m3 = await post({ editLine: { ...minus, requestId: 'edl-banc-minus-0002' } });
check(m3.status === 409 && m3.data.error === 'pending-kitchen-approval' && voids().length === 1, `un second « − » pendant l’attente : refusé, toujours une seule annulation (${m3.status} ${m3.data && m3.data.error})`);

/* La cuisine valide l'annulation ; la réponse perdue arrive enfin à se rejouer. */
{ const o = order(); const ls = JSON.parse(o.lines).map((l) => l.uid === 'ln2' ? { ...l, qty: 1, voidAlert: null } : l);
  sql.prepare('UPDATE orders SET lines = ?, updated_ts = updated_ts + 1 WHERE id = ?').run(JSON.stringify(ls), o.id);
  sql.prepare("UPDATE kitchen_voids SET status = 'approved' WHERE id = 'voi-edl-banc-minus-0001'").run(); }
const m4 = await post({ editLine: { ...minus, qty: 1 } });
check(m4.status === 200 && m4.data.replayed === true && lineOf('ln2').qty === 1, `rejoué après la validation cuisine : réponse rejouée, le msemen restant n’est pas annulé (${m4.status})`);

/* Une app d'avant le requestId : son « + » sur un plat accepté est refusé (update-required), le plat
 * passe par la carte et « Lancer ». Le même « + » avec un identifiant passe. */
const cafeQty = () => JSON.parse(order().lines).filter((l) => l.id === 'it_cafe').reduce((n, l) => n + l.qty, 0);
const legacyBefore = order().total, cafesBefore = cafeQty();
const legacy = await post({ editLine: { table: '4', orderId: id, lineId: 'ln3', qty: 2, actor: 'Salma Test' } });
check(legacy.status === 409 && legacy.data.error === 'update-required' && order().total === legacyBefore, `« + » sans identifiant sur un plat accepté : refusé, update-required, l’addition ne bouge pas (${legacy.status} ${legacy.data && legacy.data.error})`);
const withId = await post({ editLine: { table: '4', orderId: id, lineId: 'ln3', qty: 2, actor: 'Salma Test', requestId: 'edl-banc-plus-0003', seenTs: seen() } });
check(withId.status === 200 && withId.data.action === 'appended' && cafeQty() === cafesBefore + 1, `le même « + » avec un identifiant ajoute le café (${withId.status} ${withId.data && (withId.data.error || withId.data.action)})`);

/* « Annuler 1 » sur un plat pas encore commencé (2 msemen), réponse perdue puis rejouée : une seule unité retirée. */
const second = await post({ create: true, mode: 'table', table: '4', ref: 'sv-banc-2', server: 'Salma Test', expectedSession: opened.data.session,
  lines: [line('ln9', 'it_msemen', 'Msemen miel', 2, 14)] });
check(second.status === 200 && second.data.ok, `un second bon : 2 msemen (${second.status})`);
const ln9 = () => sql.prepare("SELECT lines FROM orders WHERE merchant = ? AND table_no = '4' AND paid_ts IS NULL").all(merchant)
  .flatMap((o) => JSON.parse(o.lines)).find((l) => l.uid === 'ln9');
const cancel = { table: '4', lineId: 'ln9', qty: 1, reason: 'client_change', isWaste: 0, actor: 'Salma Test', requestId: 'voi-banc-cancel-000001' };
const c1 = await post({ voidLine: cancel });
const c2 = await post({ voidLine: cancel });
check(c1.status === 200 && c1.data.directVoid && c2.status === 200 && c2.data.replayed === true, `annulation rejouée : la première réponse revient (${c1.status}/${c2.status} ${c2.data && c2.data.error || ''})`);
check(ln9() && ln9().qty === 1, `une seule unité retirée : il reste 1 msemen (${ln9() && ln9().qty})`);

f.close();
console.log(`serveur-sent-line-edit-test: ${checks} checks passed`);
