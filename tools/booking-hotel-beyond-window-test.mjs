#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Réservation en ligne d'hôtel au-delà de la fenêtre chaude
 *
 * `pruneReservationsDoc` ne garde dans le document `reservations` que les
 * séjours dans [-3j, +14j]. Un séjour pris à plus de 14 jours n'existe alors
 * que dans hotel_reservations. Avant ce correctif :
 *   - le lien de gestion (GET ?manage=) répondait 404, l'annulation aussi ;
 *   - un nouvel essai avec la même référence ne retrouvait pas la première
 *     réservation et réservait une seconde chambre.
 *
 * Tourne en mémoire (node:sqlite) sur le vrai schema.sql et le vrai booking.js.
 * ─────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost, onRequestDelete } from '../functions/api/booking.js';
import { resetTableStateCacheForTests } from '../functions/api/hotel/_stay-events.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const now = Date.now();
sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-atlas', 'owner@atlas.ma', 'Owner', 'Riad Atlas', 's', 'h', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run('riad-atlas', '{}', 'hotel', 'acc-atlas', 'Riad Atlas', 'active', now);
const doc = {
  v: 1,
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365, cancellationHours: 12, slotStep: 15, updatedAt: 1 },
  services: [], resources: [], blocked: [], bookings: [],
};
const rooms = {
  v: 4, baseRate: 700,
  roomTypes: [{ id: 'type-atlas', name: 'Chambre Atlas', rate: 850, maxGuests: 2, public: true }],
  rooms: [
    { id: 'room:101', n: 101, typeId: 'type-atlas', status: 'libre' },
    { id: 'room:102', n: 102, typeId: 'type-atlas', status: 'libre' },
  ],
  folios: [],
};
sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'reservations',?,1,?)").run('riad-atlas', JSON.stringify(doc), now);
sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'rooms',?,1,?)").run('riad-atlas', JSON.stringify(rooms), now);

class Statement {
  constructor(text) { this.text = text; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return sql.prepare(this.text).get(...this.args) || null; }
  async run() { const r = sql.prepare(this.text).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
  async all() { return { results: sql.prepare(this.text).all(...this.args) }; }
  rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
}
const DB = {
  prepare: (text) => new Statement(text),
  async batch(statements) {
    if (!statements.some((s) => !/^\s*SELECT\b/i.test(s.text))) return statements.map((s) => s.rows());
    sql.exec('BEGIN IMMEDIATE');
    try {
      const out = [];
      for (const s of statements) out.push(/^\s*SELECT\b/i.test(s.text) ? s.rows() : await s.run());
      sql.exec('COMMIT');
      return out;
    } catch (err) { sql.exec('ROLLBACK'); throw err; }
  },
};
const env = { DB };
resetTableStateCacheForTests();

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' };
const post = (b) => onRequestPost({ env, request: new Request('https://kiwi.test/api/booking', { method: 'POST', headers, body: JSON.stringify(b) }) });
const get = (q) => onRequestGet({ env, request: new Request('https://kiwi.test/api/booking?' + q, { headers }) });
const del = (b) => onRequestDelete({ env, request: new Request('https://kiwi.test/api/booking', { method: 'DELETE', headers, body: JSON.stringify(b) }) });
const storedDoc = () => JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant='riad-atlas' AND feature='reservations'").get().data);

const request = {
  merchant: 'riad-atlas', ref: 'far-future-ref-0001', roomTypeId: 'type-atlas',
  checkIn: day(60), checkOut: day(63), partySize: 2,
  customer: { name: 'Salma', phone: '0612345678', email: '' },
};

console.log('--- Séjour à +60 jours : créé, élagué du document, vivant dans D1 ---');
let res = await post(request), body = await res.json();
assert.equal(res.status, 200, 'la réservation lointaine est acceptée');
const token = body.manageToken, firstId = body.id;
assert.ok(token, 'le jeton de gestion est rendu une fois');
assert.equal(storedDoc().bookings.find((x) => x.id === firstId), undefined, 'le séjour à +60j a quitté le document');
assert.ok(sql.prepare("SELECT 1 FROM hotel_reservations WHERE merchant='riad-atlas' AND id=?").get(firstId), 'il reste dans hotel_reservations');
console.log('  ✓ séjour hors fenêtre uniquement dans hotel_reservations');

console.log('--- Le lien de gestion le retrouve ---');
res = await get(`merchant=riad-atlas&manage=${token}`); body = await res.json();
assert.equal(res.status, 200, 'GET ?manage= ne répond plus 404');
assert.equal(body.kind, 'manage');
assert.equal(body.booking.hotel.checkIn, day(60));
assert.equal(body.booking.customer.name, 'Salma');
res = await get('merchant=riad-atlas&manage=' + 'a'.repeat(32));
assert.equal(res.status, 404, 'un jeton inconnu reste 404');
console.log('  ✓ consultation par jeton au-delà de la fenêtre');

console.log('--- Un nouvel essai ne réserve pas deux fois ---');
res = await post(request); body = await res.json();
assert.equal(res.status, 200);
assert.equal(body.replayed, true, 'le second essai est reconnu comme un rejeu');
assert.equal(body.id, firstId, 'même réservation');
assert.ok(!('manageToken' in body), 'le rejeu ne rend pas le jeton');
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM hotel_reservations WHERE merchant='riad-atlas'").get().n, 1, 'une seule ligne en D1');
res = await post({ ...request, checkOut: day(64) }); body = await res.json();
assert.equal(res.status, 409);
assert.equal(body.error, 'reference-conflict', 'la même référence avec d\'autres dates reste refusée');
res = await post({ ...request, customer: { name: 'Autre', phone: '0699999999', email: '' } }); body = await res.json();
assert.equal(res.status, 409);
assert.ok(!body.manageToken, 'une autre personne ne récupère rien avec une référence rejouée');
console.log('  ✓ rejeu idempotent au-delà de la fenêtre');

console.log('--- L\'annulation par jeton fonctionne aussi ---');
res = await del({ merchant: 'riad-atlas', manageToken: token }); body = await res.json();
assert.equal(res.status, 200, 'DELETE ne répond plus 404');
assert.equal(body.status, 'cancelled');
assert.equal(sql.prepare("SELECT status FROM hotel_reservations WHERE merchant='riad-atlas' AND id=?").get(firstId).status, 'cancelled', 'D1 porte l\'annulation');
res = await del({ merchant: 'riad-atlas', manageToken: token }); body = await res.json();
assert.equal(body.already, true, 'une seconde annulation répond « déjà annulée »');
console.log('  ✓ annulation d\'un séjour hors fenêtre');

console.log('booking-hotel-beyond-window-test: ok');
