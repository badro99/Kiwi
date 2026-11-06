#!/usr/bin/env node
/* Les réservations du plan suivent la journée commerciale du magasin, pas 24 h
 * après un début calculé sur l'appareil ; deux tables dont l'identifiant se
 * réduit à la même clé de ressource ne reçoivent jamais la réservation de
 * l'une ou de l'autre au hasard. Exécute le vrai floorplan-live.js et les
 * vraies bornes serveur (functions/api/_business-day.js). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
import { addBusinessDays, businessBoundary, businessDate } from '../functions/api/_business-day.js';

const H = 3600000;
const src = fs.readFileSync(new URL('../assets/floorplan-live.js', import.meta.url), 'utf8');
function load(feed) {
  const pending = [];
  const window = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'paris' }, addEventListener() {} };
  vm.runInNewContext(deadlineVmSource(src), deadlineVmContext({ window, document: { addEventListener() {}, visibilityState: 'visible' },
    fetch: () => new Promise(r => pending.push(r)), setTimeout: () => 1, clearTimeout() {} }));
  const api = window.KiwiFloorLive; api.watch(() => {});
  return { api, async answer() {
    for (let k = 0; k < 50 && !pending[0]; k++) await Promise.resolve();
    pending[0]({ ok: true, json: async () => ({ ok: true, tables: {}, ...feed }) });
    for (let k = 0; k < 30; k++) await Promise.resolve();
  } };
}
const tables = [{ id: 't1', num: '1', seats: 4 }];
const doc = (...at) => ({ resources: [{ id: 'tpl-floor-t1', kind: 'table', name: 'Table 1' }],
  bookings: at.map((startAt, i) => ({ id: 'b' + i, status: 'confirmed', startAt, endAt: startAt + H, resourceId: 'tpl-floor-t1', customer: { name: 'C' + i } })) });

/* Paris, samedi 24 octobre 2026 05:00 → dimanche 25 05:00 : retour à l'heure d'hiver, journée de 25 h (05:00 → 05:00). */
const zone = 'Europe/Paris';
const day = '2026-10-24';
const start = businessBoundary(day, 5, zone), end = businessBoundary(addBusinessDays(day, 1), 5, zone);
assert.equal(end - start, 25 * H, 'la journée commerciale du 24 octobre dure 25 h');
const now = start + H;
const lastHour = start + 24 * H + 30 * 60000;   /* 04:30 le lendemain : encore dans la journée de 25 h */
const nextDay = end + 30 * 60000;                /* 05:30 : journée suivante */
const plain = load({});
let ids = plain.api.bookings(doc(lastHour, nextDay), tables, now, start, end).byTable.t1.map(b => b.id);
assert.equal(JSON.stringify(ids), '["b0"]', 'avec les bornes marchandes : la dernière heure est comprise, le lendemain exclu');
ids = (plain.api.bookings(doc(lastHour, nextDay), tables, now, start).byTable.t1 || []).map(b => b.id);
assert.equal(JSON.stringify(ids), '[]', 'sans borne de fin, le repli de 24 h reste celui d\'avant (aucun changement pour les appelants gelés)');

/* Le flux serveur porte les bornes : elles gagnent sur le début de l'appareil, que l'appelant gelé passe seul. */
const feed = load({ dayStart: start, dayEnd: end });
await feed.answer();
ids = feed.api.bookings(doc(lastHour, nextDay), tables, now, start - 3 * H).byTable.t1.map(b => b.id);
assert.equal(JSON.stringify(ids), '["b0"]', 'les bornes du flux couvrent la journée de 25 h même si l\'appelant ne donne que son début');
/* Journée de 23 h (Paris, 28 mars 2026 05:00 → 29 mars 05:00) : la réservation de la 24e heure appartient au lendemain. */
const spring = '2026-03-28';
const s2 = businessBoundary(spring, 5, zone), e2 = businessBoundary(addBusinessDays(spring, 1), 5, zone);
assert.equal(e2 - s2, 23 * H);
const early = e2 + 30 * 60000;                   /* 05:30 : déjà le 29 mars */
assert.equal(JSON.stringify(plain.api.bookings(doc(early), tables, s2 + H, s2, e2).byTable.t1 || []), '[]', 'journée de 23 h : la réservation de 05:30 n\'est pas celle d\'hier');
assert.equal(businessDate(early, 5, zone), '2026-03-29');

/* Deux tables au même identifiant réduit : la réservation reste non placée. */
const long = 'x'.repeat(40);
const twins = [{ id: long + 'A', num: '1', seats: 2 }, { id: long + 'B', num: '2', seats: 2 }];
assert.equal(plain.api.resourceTableId(twins[0].id), plain.api.resourceTableId(twins[1].id), 'les deux ids se réduisent à la même clé');
const key = plain.api.resourceTableId(twins[0].id);
const out = plain.api.bookings({ resources: [{ id: key, kind: 'table', name: 'Table 9' }],
  bookings: [{ id: 'bz', status: 'confirmed', startAt: now + H, endAt: now + 2 * H, resourceId: key, customer: { name: 'Z' } }] }, twins, now, start, end);
assert.equal(JSON.stringify(out.byTable), '{}', 'aucune des deux tables ne reçoit la réservation');
assert.equal(out.unplaced.length, 1, 'elle est proposée comme non placée');
console.log('✓ floor-booking-day-test');
