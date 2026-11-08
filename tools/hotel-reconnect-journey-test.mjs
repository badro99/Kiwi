#!/usr/bin/env node
/* Hôtel · séjour de groupe déplacé et retarifé sur un appareil, dossier rouvert
 * sur un second appareil après une coupure (hotel#A2).
 *
 * Vraies routes Pages (/api/hotel/stays, /api/hotel/billing-draft) sur SQLite
 * transactionnelle bâtie depuis schema.sql ; aucun navigateur ici (voir la
 * limite en bas). Deux appareils = deux copies du dossier lues à des moments
 * différents, avec la révision (updatedAt) que chacun a vue.
 *  1 · un dossier de deux chambres, 2 nuits, 100 MAD la nuit ;
 *  2 · l'appareil A déplace la chambre 1 vers une chambre d'une autre catégorie
 *      (150 MAD) : l'envoi part, la RÉPONSE se perd (coupure) ;
 *  3 · A se reconnecte et rejoue la même écriture (même clientRef, même révision
 *      périmée) : un seul déplacement existe, un seul événement, la chambre 2 et
 *      le total de l'autre séjour ne bougent pas ;
 *  4 · l'appareil B, resté sur l'ancienne révision, tente une correction : refus
 *      net (409), rien n'est écrasé ;
 *  5 · B rouvre le dossier : il lit le séjour déplacé, retarifé, et la
 *      facturation du dossier (la « folio ») donne 150 × 2 + 100 × 2 centimes
 *      exacts ; B corrige le nom avec la révision fraîche et le déplacement
 *      comme le tarif survivent ;
 *  6 · A relit : même état que B.
 * Ce que ce test NE prouve PAS : le rendu des écrans (modale du dossier, rack,
 * folio) ni le rejeu automatique du navigateur après coupure ; ces gestes sont
 * couverts par hotel-stays-group-browser-test.mjs et hotel-journey-browser-test.mjs.
 * Il prouve l'état que les deux appareils retrouvent côté serveur. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as stays, onRequestGet as getStays } from '../functions/api/hotel/stays.js';
import { onRequestGet as billing } from '../functions/api/hotel/billing-draft.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(q) {
    let args = [];
    return {
      query: q,
      bind(...a) { args = a; return this; },
      async first() { return sql.prepare(q).get(...args) || null; },
      async all() { return { results: sql.prepare(q).all(...args) }; },
      async run() { return this.execute(); },
      execute() {
        if (/^\s*SELECT/i.test(q)) return { results: sql.prepare(q).all(...args) };
        const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } };
      },
    };
  },
  async batch(ss) {
    sql.exec('BEGIN IMMEDIATE');
    try { const out = ss.map((s) => s.execute()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
};
const merchant = 'reconnect-hotel', secret = 'local-hotel-reconnect-secret';
const env = { DB, AUTH_SECRET: secret };
sql.prepare('INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?)').run('owner', 'owner@example.test', merchant, 's', 'h', 1);
sql.prepare("INSERT INTO merchant_config(merchant,account_id,type,features,status,updated_ts) VALUES(?,?,'hotel','{}','active',1)").run(merchant, 'owner');
const cookie = SESS_COOKIE + '=' + await makeSession('owner', secret);
const doc = (feature, data) => sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,1) ON CONFLICT(merchant,feature) DO UPDATE SET data=excluded.data,rev=1').run(merchant, feature, JSON.stringify(data));
doc('rooms', { baseRate: 100, roomTypes: [{ id: 'type-basic', name: 'Basic', rate: 100, maxGuests: 4 }, { id: 'type-suite', name: 'Suite', rate: 150, maxGuests: 4 }], rooms: [{ id: 'room:1', n: 1, typeId: 'type-basic', status: 'libre' }, { id: 'room:2', n: 2, typeId: 'type-basic', status: 'libre' }, { id: 'room:3', n: 3, typeId: 'type-suite', status: 'libre' }], folios: [] });
doc('reservations', { v: 1, settings: {}, services: [], resources: [], blocked: [], bookings: [] });
doc('hotel-units', { units: [] });
doc('team', { members: [{ id: 'cashier', firstName: 'Fixture' }] });
async function call(handler, body = {}, get = false) {
  const u = new URL('https://kiwi.test/api/hotel/test');
  if (get) for (const [k, v] of Object.entries({ merchant, ...body })) u.searchParams.set(k, v);
  const r = await handler({ env, request: new Request(u, { method: get ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(get ? {} : { body: JSON.stringify({ merchant, ...body }) }) }) });
  return { status: r.status, body: await r.json() };
}
const day = (n) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);
let controls = 0;
const check = (yes, msg) => { assert.ok(yes, msg); controls++; console.log('  ✓ ' + msg); };
const dossierId = 'group-reconnect-001';
const base = (i, room) => ({ action: 'save', clientRef: 'reconnect-ref-' + i, dossierId, roomTypeId: 'type-basic', resourceId: 'room:' + room, checkIn: day(0), checkOut: day(2), partySize: 1, customer: { name: 'Guest ' + i }, guests: [{ name: 'Guest ' + i, idDocType: 'passeport', idDocNumber: 'SYNTHETIC-' + i }] });
const read = async () => (await call(getStays, { dossierId }, true)).body.stays;
const rows = () => sql.prepare('SELECT * FROM hotel_reservations ORDER BY id').all();
const events = () => sql.prepare('SELECT COUNT(*) n FROM hotel_stay_events').get().n;

const a1 = await call(stays, base(1, 1)); assert.equal(a1.status, 200, JSON.stringify(a1));
const b1 = await call(stays, base(2, 2)); assert.equal(b1.status, 200, JSON.stringify(b1));
const stayA = a1.body.booking, stayB = b1.body.booking;
check(stayA.hotel.total === 200 && stayB.hotel.total === 200, 'le dossier compte deux chambres à 100 MAD la nuit, 200 MAD chacune');
const seenByA = await read(), seenByB = await read();
const revA = seenByA.find((s) => s.id === stayA.id).updatedAt, revB = seenByB.find((s) => s.id === stayA.id).updatedAt;

// 2 · A moves the stay to the suite (rate edit by category change); the answer never reaches it.
const move = { ...base(1, 3), id: stayA.id, roomTypeId: 'type-suite', expectedUpdatedAt: revA };
const lost = await call(stays, move);
assert.equal(lost.status, 200, JSON.stringify(lost));
const after = events();
check(true, 'A déplace le séjour vers la suite ; la réponse est perdue (coupure)');

// 3 · reconnect: A replays the very same write with the revision it still holds.
const replay = await call(stays, move);
check([200, 409].includes(replay.status), 'le rejeu après reconnexion est accepté ou refusé net (' + replay.status + '), jamais une erreur serveur');
const moved = (await read()).find((s) => s.id === stayA.id);
check(moved.resourceId === 'room:3' && moved.serviceId === 'type-suite', 'un seul déplacement existe : chambre 3, catégorie suite');
check(Math.round(moved.hotel.total * 100) === 30000 && moved.hotel.rate === 150, 'le séjour porte le nouveau tarif : 150 MAD x 2 nuits = 300 MAD');
check(events() === after, 'le rejeu n’a écrit aucun événement de plus (' + events() + ')');
const other = (await read()).find((s) => s.id === stayB.id);
check(other.resourceId === 'room:2' && Math.round(other.hotel.total * 100) === 20000, 'l’autre chambre du dossier n’a pas bougé : chambre 2, 200 MAD');
const overlap = rows().filter((r) => ['requested', 'confirmed', 'checked_in'].includes(r.status));
check(new Set(overlap.map((r) => r.room_id)).size === overlap.length, 'aucune chambre n’est occupée deux fois');

// 4 · B still holds the old revision.
const snapshot = JSON.stringify(rows().map((r) => [r.id, r.room_id, r.updated_at ?? r.raw_json]));
const stale = await call(stays, { ...base(1, 1), id: stayA.id, customer: { name: 'Guest 1 corrigé' }, expectedUpdatedAt: revB });
check(stale.status === 409, 'B, resté sur l’ancienne révision, est refusé net (409)');
check(JSON.stringify(rows().map((r) => [r.id, r.room_id, r.updated_at ?? r.raw_json])) === snapshot, 'le refus n’a rien écrasé');

// 5 · B reopens the dossier and the folio (billing preview).
const fresh = (await read()).find((s) => s.id === stayA.id);
check(fresh.resourceId === 'room:3' && fresh.hotel.rate === 150, 'B rouvre le dossier : séjour déplacé et retarifé');
const folio = await call(billing, { dossierId }, true);
assert.equal(folio.status, 200, JSON.stringify(folio));
check(folio.body.preview.totalCents === 50000, 'la facturation du dossier donne 300 + 200 MAD = 50 000 centimes exacts');
const fixed = await call(stays, { ...base(1, 3), id: stayA.id, roomTypeId: 'type-suite', customer: { name: 'Guest 1 corrigé' }, expectedUpdatedAt: fresh.updatedAt });
assert.equal(fixed.status, 200, JSON.stringify(fixed));
check(fixed.body.booking.resourceId === 'room:3' && Math.round(fixed.body.booking.hotel.total * 100) === 30000, 'la correction de B garde le déplacement et le tarif');

// 6 · A reads again.
const seenAgain = (await read()).find((s) => s.id === stayA.id);
check(seenAgain.customer.name === 'Guest 1 corrigé' && seenAgain.resourceId === 'room:3', 'A relit le même état que B');
check((await call(billing, { dossierId }, true)).body.preview.totalCents === 50000, 'et la même facturation, au centime');
console.log(`hotel-reconnect-journey: ${controls} controls green`);
