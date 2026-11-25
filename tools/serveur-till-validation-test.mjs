#!/usr/bin/env node
/* Commandes des serveurs validées à la caisse (Browse, 25 nov. 2026).
 *
 * Contre une vraie base SQLite (schema.sql) et la vraie route /api/order/queue :
 *  A · éteint (par défaut), la commande d'un serveur part en cuisine comme avant ;
 *  B · allumé (kiwi-admin › features.serveurValidation), elle arrive « pending » :
 *      la caisse sonne, la valide (ou la refuse), et rien ne part avant ;
 *  C · le téléphone du serveur ne peut pas valider sa propre commande ;
 *  D · une commande de serveur en attente n'expire jamais toute seule
 *      (la commande QR d'un client, si, après trente minutes). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
let checks = 0;
function ok(label, cond, extra) { checks++; if (!cond) { console.error('✗ serveur-till-validation-test : ' + label + (extra ? ' · ' + extra : '')); process.exit(1); } console.log('  ✓ ' + label); }

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return st; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return st;
  },
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
};
const SECRET = 'synthetic-serveur-validation-only';
const env = { DB, AUTH_SECRET: SECRET };
const SHOP = 'validation-fixture';
const now = Date.now();
sqlite.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-v','v@shop.ma','V','Shop','00','00',?)").run(now);
sqlite.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','pro','restaurant','acc-v','Shop','active',0,?)").run(SHOP, now);
const features = (f) => sqlite.prepare('UPDATE merchant_config SET features = ? WHERE merchant = ?').run(JSON.stringify(f), SHOP);

const AUTH = await mod('functions/auth/_lib.js');
const QUEUE = await mod('functions/api/order/queue.js');
const STAFF = 'emp-sara';
const member = { id: STAFF, firstName: 'Sara', lastName: 'Bennani', email: 'sara@shop.ma', function: 'Serveur', department: 'Salle', venueSlug: SHOP };
const doc = (feature, data) => sqlite.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run(SHOP, feature, JSON.stringify(data), now);
doc('employee-access', { members: [member] });
doc('attendance', { entries: [{ id: 'att-sara', memberId: STAFF, staffId: STAFF, name: 'Sara Bennani', inTs: now - 3600000, outTs: null, pauseTs: null }] });
doc('floorplan', { staff: [{ id: STAFF, name: 'Sara Bennani' }], tables: [{ id: 'T7', num: '7', servers: [STAFF] }] });
sqlite.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)').run(SHOP, 'Carte', 'restaurant', JSON.stringify({
  cats: [{ id: 'bar', name: 'Bar', station: 'bar' }], stations: [{ id: 'bar', name: 'Bar' }],
  items: [{ id: 'the', name: 'Thé', price: 10, catId: 'bar', avail: true }] }), now);

const tillCookie = `${AUTH.TILL_COOKIE}=${await AUTH.tillToken(SECRET, SHOP)}`;
const waiterCookie = `${AUTH.EMPLOYEE_COOKIE}=${await AUTH.employeeToken(SECRET, { staffId: STAFF, merchant: SHOP })}`;
const req = (url, cookie, body) => new Request('https://kiwi.test' + url, {
  method: body ? 'POST' : 'GET',
  headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '192.0.2.7' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const queue = async (cookie, body) => {
  const res = await QUEUE.onRequestPost({ request: req('/api/order/queue', cookie, { merchant: SHOP, ...body }), env, waitUntil() {} });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const row = (id) => sqlite.prepare('SELECT status, channel FROM orders WHERE id = ?').get(id);
const lines = (uid) => [{ uid, id: 'the', name: 'Thé', unitPrice: 10, qty: 1 }];
let n = 0;
const send = () => { n += 1; return queue(waiterCookie, { create: true, mode: 'table', table: '7', lines: lines('l' + n), ref: 'ref-' + 'v'.repeat(20) + n, server: 'Sara' }); };

/* ── A · éteint : rien ne change ── */
const a = await send();
ok('A1 éteint : la commande du serveur part en cuisine (accepted), comme avant', a.status === 200 && a.body.status === 'accepted' && row(a.body.id).status === 'accepted', JSON.stringify(a));

/* ── B · allumé : la caisse valide d'abord ── */
features({ serveurValidation: true });
const b = await send();
ok('B1 allumé : la commande du serveur arrive en attente de la caisse (pending)', b.status === 200 && b.body.status === 'pending', JSON.stringify(b));
ok('B2 elle est écrite pending, au canal serveur', row(b.body.id).status === 'pending' && row(b.body.id).channel === 'serveur', JSON.stringify(row(b.body.id)));

/* ── C · le serveur ne valide pas sa propre commande ── */
const c = await queue(waiterCookie, { id: b.body.id, status: 'accepted', server: 'Sara' });
ok('C1 le téléphone du serveur ne peut pas la valider lui-même', c.status === 403 && c.body.error === 'till-validation-required', JSON.stringify(c));
ok('C2 elle reste en attente', row(b.body.id).status === 'pending');
const t = await queue(tillCookie, { id: b.body.id, status: 'accepted' });
ok('B3 la caisse la valide : elle part en cuisine', t.status === 200 && row(b.body.id).status === 'accepted', JSON.stringify(t));
const r = await send();
const refused = await queue(tillCookie, { id: r.body.id, status: 'rejected' });
ok('B4 la caisse peut aussi la refuser', refused.status === 200 && row(r.body.id).status === 'rejected', JSON.stringify(refused));

/* Une commande QR d'un client reste acceptable depuis la salle, comme avant. */
sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts, channel) VALUES ('ord-guestqr01', ?, 90, 'table', '7', ?, 10, 'pending', ?, ?, 'kiwi')").run(SHOP, JSON.stringify(lines('g1')), now, now);
const g = await queue(waiterCookie, { id: 'ord-guestqr01', status: 'accepted', server: 'Sara' });
ok('C3 une commande QR de client sur sa table reste acceptable par le serveur', g.status === 200 && row('ord-guestqr01').status === 'accepted', JSON.stringify(g));

/* ── D · l'attente d'une commande de serveur ne meurt pas en silence ── */
const old = now - 45 * 60000;
sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts, channel) VALUES ('ord-oldwaiter1', ?, 91, 'table', '7', ?, 10, 'pending', ?, ?, 'serveur')").run(SHOP, JSON.stringify(lines('o1')), old, old);
sqlite.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, lines, total, status, created_ts, updated_ts, channel) VALUES ('ord-oldguest01', ?, 92, 'table', '7', ?, 10, 'pending', ?, ?, 'kiwi')").run(SHOP, JSON.stringify(lines('o2')), old, old);
const poll = await QUEUE.onRequestGet({ request: req('/api/order/queue?merchant=' + SHOP + '&since=0', tillCookie), env, waitUntil() {} });
ok('D0 la caisse sonde la file', poll.status === 200, String(poll.status));
ok('D1 une commande de serveur en attente depuis 45 min reste en attente', row('ord-oldwaiter1').status === 'pending', JSON.stringify(row('ord-oldwaiter1')));
ok('D2 une commande QR de client oubliée 45 min expire comme avant', row('ord-oldguest01').status === 'rejected', JSON.stringify(row('ord-oldguest01')));

console.log(`\n✓ ${checks} serveur till validation controls passed`);
