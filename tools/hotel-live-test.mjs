#!/usr/bin/env node
/* B23 · A web booking (H-CF2F6C4B, yassine, 9 Nov 2026) reached the server but the
 * open front-desk page (Réservations & séjours) kept its old copy until a reload:
 * the 30 s re-read only ran on the « Réservations & RDV » page. Runs the real
 * assets/hotel-live.js: on a real hotel with a visible tab, reservations and rooms
 * are re-read every 30 s whatever the page; a new online booking or an online
 * booking's cancellation is announced (toast + top of the notifications bell);
 * bookings already there when the page opened, staff bookings, hidden tabs and
 * non-hotel stores stay quiet. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/hotel-live.js', import.meta.url), 'utf8');

function boot({ type = 'hotel', read = true } = {}) {
  const listeners = {}, timers = [], intervals = [], toasts = [], pulls = [];
  const doc = { bookings: [{ id: 'bk-old', code: 'H-OLD00001', source: 'public', status: 'confirmed', resourceId: 'room:101', hotel: { checkIn: '2026-11-12', checkOut: '2026-11-13' } }] };
  const status = [{ feature: 'reservations', read }];
  const drawer = { innerHTML: '', inserted: '', querySelector: (sel) => (sel === '.kiwi-drawer-body' ? body : null) };
  const body = { innerHTML: '<div class="notif">x</div>', querySelector: (sel) => (sel === '.notif' ? {} : sel === '#kiwi-hotel-live' && body.added ? {} : null), insertAdjacentHTML(_, html) { body.added = html; } };
  const document = { visibilityState: 'visible', addEventListener: (t, f) => { (listeners['doc:' + t] ||= []).push(f); }, querySelectorAll: () => [drawer] };
  const window = {
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    KiwiCloudDoc: { isReal: () => true, status: () => status, pullFeatures: async (f) => { pulls.push(f); } },
    KiwiVenue: { getVenueType: () => type },
    KiwiReservations: { get: () => doc },
    KiwiHotelRooms: { current: () => ({ rooms: [{ id: 'room:105', n: 105 }, { id: 'room:101', n: 101 }] }) },
    Kiwi: { toast: (m, o) => toasts.push({ m, desc: o && o.desc, type: o && o.type }), handlers: { notifications: () => 'drawer' } },
  };
  vm.runInNewContext(source, { window, document, Intl, Date, Promise, setTimeout: (f) => timers.push(f), setInterval: (f, ms) => intervals.push([f, ms]) });
  const fire = (t) => (listeners[t] || []).forEach((f) => f({}));
  return { window, document, doc, status, toasts, pulls, timers, intervals, fire, body };
}

// 1 · every 30 s on a visible hotel tab, only the two front-desk documents are re-read.
{
  const t = boot();
  assert.equal(t.intervals.length, 1); assert.equal(t.intervals[0][1], 30000, 'a 30 s re-read');
  t.intervals[0][0]();
  assert.equal(JSON.stringify(t.pulls), JSON.stringify([['reservations', 'rooms']]), 'reservations and rooms are re-read, whatever page is open');
  t.document.visibilityState = 'hidden'; t.intervals[0][0]();
  assert.equal(t.pulls.length, 1, 'a hidden tab does not poll');
  t.document.visibilityState = 'visible'; t.fire('doc:visibilitychange');
  assert.equal(t.pulls.length, 2, 'coming back to the tab re-reads at once');
  const r = boot({ type: 'restaurant' }); r.intervals[0][0]();
  assert.equal(r.pulls.length, 0, 'not a hotel: no polling');
}

// 2 · announcements.
{
  const t = boot();
  t.timers.forEach((f) => f());                          // first scan seeds silently
  assert.equal(t.toasts.length, 0, 'bookings already there are not announced');
  t.doc.bookings.push({ id: 'bk-new', code: 'H-CF2F6C4B', source: 'public', status: 'confirmed', resourceId: 'room:105', hotel: { checkIn: '2026-11-20', checkOut: '2026-11-22' } });
  t.doc.bookings.push({ id: 'bk-staff', code: 'H-STAFF001', source: 'staff', status: 'confirmed', resourceId: 'room:101', hotel: { checkIn: '2026-11-20', checkOut: '2026-11-21' } });
  t.fire('kiwi-reservations-changed');
  assert.equal(t.toasts.length, 1, 'one announcement: the online booking, not the desk one');
  assert.equal(t.toasts[0].m, 'Nouvelle réservation en ligne');
  assert.match(t.toasts[0].desc, /^H-CF2F6C4B · Ch\. 105 · 20 nov\.? → 22 nov\.?$/);
  t.fire('kiwi-reservations-changed');
  assert.equal(t.toasts.length, 1, 'announced once');
  t.doc.bookings.find((b) => b.id === 'bk-old').status = 'cancelled';
  t.fire('kiwi-reservations-changed');
  assert.equal(t.toasts[1].m, 'Réservation en ligne annulée');
  assert.match(t.toasts[1].desc, /^H-OLD00001 · Ch\. 101/);
  // The bell: its drawer gets the events at the top.
  assert.equal(t.window.Kiwi.handlers.notifications(), 'drawer');
  assert.match(t.body.added || '', /id="kiwi-hotel-live"[\s\S]*Réservation en ligne annulée[\s\S]*Nouvelle réservation en ligne/, 'newest first in the bell');
}

// 3 · nothing is announced before the server copy has been read once.
{
  const t = boot({ read: false });
  t.timers.forEach((f) => f());
  t.doc.bookings.push({ id: 'bk-x', code: 'H-X', source: 'public', status: 'confirmed', resourceId: 'room:105', hotel: {} });
  t.fire('kiwi-reservations-changed');
  assert.equal(t.toasts.length, 0, 'unread: no seed, no announcement');
  t.status[0].read = true; t.fire('kiwi-reservations-changed');
  assert.equal(t.toasts.length, 0, 'the first read seeds silently');
}

console.log('✓ hotel-live: front-desk pages re-read reservations and rooms every 30 s; online bookings and cancellations are announced once, in the bell too');
