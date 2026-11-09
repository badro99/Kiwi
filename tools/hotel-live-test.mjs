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

const hotelLiveJs = fs.readFileSync(new URL('../assets/hotel-live.js', import.meta.url), 'utf8');

function boot({ type = 'hotel', read = true, stays = null } = {}) {
  const listeners = {}, timers = [], intervals = [], toasts = [], pulls = [];
  const doc = { bookings: [{ id: 'bk-old', code: 'H-OLD00001', source: 'public', status: 'confirmed', resourceId: 'room:101', hotel: { checkIn: '2026-11-12', checkOut: '2026-11-13' } }] };
  const status = [{ feature: 'reservations', read }];
  const drawer = { innerHTML: '', inserted: '', querySelector: (sel) => (sel === '.kiwi-drawer-body' ? body : null) };
  const body = { innerHTML: '<div class="notif">x</div>', querySelector: (sel) => (sel === '.notif' ? {} : sel === '#kiwi-hotel-live' && body.added ? {} : null), insertAdjacentHTML(_, html) { body.added = html; } };
  const document = { visibilityState: 'visible', addEventListener: (t, f) => { (listeners['doc:' + t] ||= []).push(f); }, querySelectorAll: () => [drawer] };
  const window = {
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    KiwiCloudDoc: { isReal: () => true, status: () => status, slugFor: () => 'riad-atlas', pullFeatures: async (f) => { pulls.push(f); } },
    KiwiVenue: { getVenueType: () => type },
    KiwiReservations: { get: () => doc },
    KiwiHotelRooms: { current: () => ({ rooms: [{ id: 'room:105', n: 105 }, { id: 'room:101', n: 101 }] }) },
    Kiwi: { toast: (m, o) => toasts.push({ m, desc: o && o.desc, type: o && o.type }), handlers: { notifications: () => 'drawer' } },
  };
  const asked = [];
  const fetch = stays ? async (url) => { asked.push(url); return { ok: true, json: async () => ({ ok: true, stays: stays() }) }; } : undefined;
  vm.runInNewContext(hotelLiveJs, { window, document, Intl, Date, Promise, fetch, setTimeout: (f) => timers.push(f), setInterval: (f, ms) => intervals.push([f, ms]) });
  const fire = (t) => (listeners[t] || []).forEach((f) => f({}));
  return { window, document, doc, status, toasts, pulls, timers, intervals, fire, body, asked };
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

// 4 · an online booking beyond the document's 14-day window (H-699E42F4, 24→25 Nov,
// booked 9 Nov) lives only in D1: it is still announced, once; older ones stay quiet.
{
  const before = { id: 'bk-far-old', code: 'H-FAROLD01', source: 'public', status: 'confirmed', resourceId: 'room:101', createdAt: Date.now() - 864e5, hotel: { checkIn: '2026-12-01', checkOut: '2026-12-02' } };
  const far = { id: 'bk-far', code: 'H-699E42F4', source: 'public', status: 'confirmed', resourceId: 'room:105', createdAt: Date.now() + 1000, hotel: { checkIn: '2026-11-24', checkOut: '2026-11-25' } };
  let rows = [before];
  const t = boot({ stays: () => rows });
  t.timers.forEach((f) => f());
  t.intervals[0][0](); await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.toasts.length, 0, 'a booking made before the page opened is not announced');
  assert.match(t.asked[0], /\/api\/hotel\/stays\?merchant=riad-atlas&includeCancelled=1&updatedSince=\d+/, 'D1 is asked what changed, at any date');
  rows = [before, far];
  t.intervals[0][0](); await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.toasts.length, 1, 'the far-out online booking is announced');
  assert.match(t.toasts[0].desc, /^H-699E42F4 · Ch\. 105 · 24 nov\.? → 25 nov\.?$/);
  t.intervals[0][0](); await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.toasts.length, 1, 'announced once');
  rows = [before, { ...far, status: 'cancelled', updatedAt: Date.now() + 2000 }];
  t.intervals[0][0](); await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.toasts[1]?.m, 'Réservation en ligne annulée', 'its cancellation is announced');
}

console.log('✓ hotel-live: front-desk pages re-read reservations and rooms every 30 s; online bookings and cancellations are announced once, in the bell too');
