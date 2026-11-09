#!/usr/bin/env node
/* B25 · The manage link of a HOTEL stay (booking?merchant=…&manage=…) showed the
 * appointment copy in its left panel (« Réservez sans appeler, sans attendre… »)
 * instead of the hotel's (« Votre séjour commence ici. »): the manage answer
 * carries kind « manage », so the page no longer knew it was a hotel. Runs the
 * real booking-view.js and booking-manage.js factories (and the real
 * request-deadline.mjs) against a stubbed /api/booking answer. */
import assert from 'node:assert/strict';

const { createBookingView } = await import(new URL('../assets/booking-view.js', import.meta.url));
const { createBookingManage } = await import(new URL('../assets/booking-manage.js', import.meta.url));

globalThis.document = { documentElement: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
globalThis.location = { origin: 'https://kiwi.test', pathname: '/booking.html', search: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = globalThis.localStorage;

async function openManage(booking) {
  const state = { lang: 'fr', step: 1 };
  const owner = { getState: () => state };
  const app = { innerHTML: '', contains: () => false, querySelector: () => null, querySelectorAll: () => [] };
  const view = createBookingView({ owner, app });
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, kind: 'manage', merchant: 'riad-atlas', tz: 'Africa/Casablanca', name: 'Riad Atlas', trade: booking.hotel ? 'hotel' : 'spa', booking, cancellableUntil: Date.now() + 864e5, cancellationHours: 12 }) });
  const manage = createBookingManage({ owner, app, merchant: 'riad-atlas', manageToken: 'a'.repeat(32), t: view.t, ht: view.ht, esc: view.esc, money: view.money, fmt: view.fmt, layout: view.layout, closed: view.closed });
  await manage.openManage();
  return app.innerHTML;
}

const stay = { id: 'bk-1', code: 'H-CF2F6C4B', status: 'confirmed', customer: { name: 'Salma' }, startAt: Date.now() + 2 * 864e5, endAt: Date.now() + 4 * 864e5,
  hotel: { roomTypeName: 'Chambre Atlas', checkIn: '2026-11-20', checkOut: '2026-11-22', nights: 2, total: 1700 } };
const hotelPage = await openManage(stay);
assert.match(hotelPage, /Votre séjour commence ici\./, 'a stay keeps the hotel copy on its manage page');
assert.doesNotMatch(hotelPage, /Réservez sans appeler/, 'never the appointment copy');
assert.match(hotelPage, /H-CF2F6C4B/, 'the stay itself is shown');

const appointment = { id: 'bk-2', code: 'R-12345678', status: 'confirmed', customer: { name: 'Salma' }, startAt: Date.now() + 864e5, endAt: Date.now() + 864e5 + 36e5 };
assert.match(await openManage(appointment), /Réservez sans appeler, sans attendre\./, 'an appointment keeps its own copy');

console.log('✓ booking-manage-hotel-copy: a hotel stay\'s manage page shows the hotel copy, an appointment its own');
