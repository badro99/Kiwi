// Transférer ou fusionner une table ne déplace que les plats de la visite en cours
// (audit du 26 nov. 2026).
//
// Les commandes suivaient le NUMÉRO de table : une table 5 fermée de force sans
// paiement laissait son tajine, et la clientèle suivante, transférée de 5 à 6,
// en héritait sur son addition. Vraie route /api/order/queue sur schema.sql.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const AUTH = await mod('functions/auth/_lib.js');
const QUEUE = await mod('functions/api/order/queue.js');
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };

async function shop() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const DB = { prepare(sql) { let args = []; const st = {
      bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return st; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return st; },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
  const SECRET = 'table-move-secret', SHOP = 'table-move-shop', now = Date.now(), STAFF = 'emp-sara';
  const env = { DB, AUTH_SECRET: SECRET };
  sqlite.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc','a@a.ma','A','Shop','00','00',?)").run(now);
  sqlite.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','pro','restaurant','acc','Shop','active',0,?)").run(SHOP, now);
  const doc = (feature, data) => sqlite.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run(SHOP, feature, JSON.stringify(data), now);
  doc('employee-access', { members: [{ id: STAFF, firstName: 'Sara', lastName: 'B', email: 's@a.ma', function: 'Serveur', department: 'Salle', venueSlug: SHOP }] });
  doc('attendance', { entries: [{ id: 'att', memberId: STAFF, staffId: STAFF, name: 'Sara B', inTs: now - 3600000, outTs: null, pauseTs: null }] });
  doc('floorplan', { staff: [{ id: STAFF, name: 'Sara B' }], tables: ['5', '6', '7'].map((n) => ({ id: 'T' + n, num: n, servers: [STAFF] })) });
  sqlite.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)').run(SHOP, 'Carte', 'restaurant', JSON.stringify({
    cats: [{ id: 'bar', name: 'Bar', station: 'bar' }], stations: [{ id: 'bar', name: 'Bar' }],
    items: [{ id: 'the', name: 'Thé', price: 10, catId: 'bar', avail: true }, { id: 'taj', name: 'Tajine', price: 80, catId: 'bar', avail: true }] }), now);
  const till = `${AUTH.TILL_COOKIE}=${await AUTH.tillToken(SECRET, SHOP)}`;
  const waiter = `${AUTH.EMPLOYEE_COOKIE}=${await AUTH.employeeToken(SECRET, { staffId: STAFF, merchant: SHOP })}`;
  const post = async (cookie, body) => { const res = await QUEUE.onRequestPost({ request: new Request('https://kiwi.test/api/order/queue', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '192.0.2.7' }, body: JSON.stringify({ merchant: SHOP, ...body }) }), env, waitUntil() {} });
    return { ...(await res.json().catch(() => ({}))), http: res.status }; };
  let n = 0;
  const send = (table, item) => { n++; return post(waiter, { create: true, mode: 'table', table, lines: [{ uid: 'u' + n, id: item, name: item, qty: 1 }], ref: 'ref-' + 'x'.repeat(20) + n, server: 'Sara B' }); };
  const row = (id) => sqlite.prepare('SELECT table_no, session_id FROM orders WHERE id = ?').get(id);
  return { post, send, row, till, waiter };
}

{
  const s = await shop();
  const a = await s.send('5', 'taj');
  ok(a.http === 200 && a.session, 'a first party orders a tajine at table 5');
  const closed = await s.post(s.till, { closeTable: '5', expectedSession: a.session, force: true, closedBy: 'caisse' });
  ok(closed.http === 200, 'the till force-closes table 5 unpaid');
  const b = await s.send('5', 'the');
  const tr = await s.post(s.waiter, { transferTable: { from: '5', to: '6', expectedSession: b.session } });
  ok(tr.http === 200 && tr.ordersMoved === 1, `the next party's transfer moves its own order only (moved ${tr.ordersMoved})`);
  ok(s.row(a.id).table_no === '5' && s.row(a.id).session_id === a.session, 'the closed visit\'s tajine stays with its visit');
}
{
  const s = await shop();
  const a = await s.send('5', 'taj');
  await s.post(s.till, { closeTable: '5', expectedSession: a.session, force: true, closedBy: 'caisse' });
  const b = await s.send('5', 'the');
  const c = await s.send('7', 'the');
  const mg = await s.post(s.waiter, { mergeTables: { source: '5', target: '7', expectedSession: b.session, expectedRevision: undefined } });
  ok(mg.http === 200 && mg.ordersMerged === 1, `merging 5 into 7 carries this visit's order only (merged ${mg.ordersMerged})`);
  ok(s.row(a.id).table_no === '5', 'the closed visit\'s tajine is not merged');
  ok(s.row(c.id).table_no === '7', 'table 7 keeps its own order');
}
console.log(`✓ table-move-visit-test : ${checks} contrôles (transfert et fusion limités à la visite en cours)`);
