// Réservations : les règles de créneau, de ressource et de capacité ont UN
// propriétaire (functions/api/_rules-booking.js), copié dans le navigateur par
// tools/build-shared-rules.mjs. Ce test exécute le vrai navigateur et le vrai
// serveur sur les mêmes cas : ils répondent pareil, y compris sur la capacité
// d'un service, que la copie du navigateur ne connaissait pas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as rules from '../functions/api/_rules-booking.js';
import { serviceCapacityAvailable } from '../functions/api/_booking-capacity.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };
const client = fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../functions/api/booking.js', import.meta.url), 'utf8');

const ctx = { console, setTimeout: () => 0, clearTimeout() {}, Date, Math, JSON, Intl, location: { origin: 'https://kiwi.test' }, navigator: {}, document: { addEventListener() {} }, addEventListener() {} };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(client, ctx);
const R = ctx.KiwiReservations;

ok(!/function overlaps\(/.test(client) && !/var ACTIVE\s*=/.test(client), 'the browser no longer defines its own overlap and active-status rules');
ok(!/function overlaps\(/.test(server) && !/const ACTIVE\s*=/.test(server) && !/function free\(/.test(server) && !/function candidates\(/.test(server), 'the server no longer defines them either');
ok(/GENERATED SHARED KiwiBookingRules BEGIN/.test(client), 'the browser carries the generated shared copy');

const day = Date.now() + 5 * 86400000;
const doc = (capacity, resources = 2) => R.normalize({
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365, cancellationHours: 12, slotStep: 15 },
  services: [{ id: 's', name: 'Table', duration: 30, price: 0, deposit: 0, capacity, resourceIds: [], active: true }],
  resources: Array.from({ length: resources }, (_, i) => ({ id: 'r' + i, name: 'R' + i, kind: 'table', capacity: 4, active: true })),
  blocked: [], bookings: [],
});
const withBooking = (d, resourceId, startAt, status = 'confirmed') => {
  d.bookings.push({ id: 'b' + d.bookings.length, code: 'c' + d.bookings.length, serviceId: 's', resourceId, startAt, endAt: startAt + 30 * 60000, status, partySize: 2, customer: { name: 'X' }, createdAt: 1, updatedAt: 1 });
  return d;
};
const ask = (d, startAt, ignoreId) => R.validate({ customer: { name: 'New' }, serviceId: 's', startAt, partySize: 2 }, d, ignoreId);

// Service capacity: one place at a time, even with a second free resource.
let d = withBooking(doc(1), 'r0', day);
let end = day + 30 * 60000;
ok(serviceCapacityAvailable(d, d.services[0], day, end) === false, 'server: a service of capacity 1 is full while a booking runs');
ok(ask(d, day).ok === false && ask(d, day).error === 'conflict', 'browser: the same request is a conflict (it used to pick the free resource)');
ok(ask(d, end).ok === true && serviceCapacityAvailable(d, d.services[0], end, end + 30 * 60000), 'both accept the adjacent half-open slot');
ok(ask(d, day, 'b0').ok === true, 'both ignore the booking being edited');
d = doc(2);
withBooking(d, 'r0', day);
ok(ask(d, day).ok === true && serviceCapacityAvailable(d, d.services[0], day, end), 'capacity 2 admits a second booking on the other resource');
d = withBooking(doc(1), 'r0', day, 'cancelled');
ok(ask(d, day).ok === true && serviceCapacityAvailable(d, d.services[0], day, end), 'a cancelled booking holds no place');

// Resource rules: overlap, blocking, party size, restricted resource list.
d = doc(2); withBooking(d, 'r0', day); withBooking(d, 'r1', day + 3600000);
ok(rules.bookingResourceFree(d, 'r0', day, end) === false && rules.bookingResourceFree(d, 'r0', end, end + 1) === true, 'a resource is busy only during its booking');
ok(R.resourceFree(d, 'r0', day, end) === rules.bookingResourceFree(d, 'r0', day, end), 'browser and server agree on resource freedom');
d.blocked.push({ id: 'x', resourceId: '', startAt: day + 7200000, endAt: day + 7500000 });
ok(rules.bookingResourceFree(d, 'r1', day + 7200000, day + 7300000) === false, 'a blocking without resource closes every resource');
d.resources[0].capacity = 2;
ok(rules.bookingResourceCandidates(d, d.services[0], '', 3).map((r) => r.id).join() === 'r1', 'a party of 3 only fits the larger table');
console.log(`booking-rules-shared: ${checks} checks passed`);
