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

function boot({ type = 'hotel', read = true, stays = null, at = null, rooms = null } = {}) {
  const listeners = {}, timers = [], intervals = [], toasts = [], pulls = [];
  const doc = { bookings: [{ id: 'bk-old', code: 'H-OLD00001', source: 'public', status: 'confirmed', resourceId: 'room:101', hotel: { checkIn: '2026-11-12', checkOut: '2026-11-13' } }] };
  const status = [{ feature: 'reservations', read }];
  const drawer = { innerHTML: '', inserted: '', querySelector: (sel) => (sel === '.kiwi-drawer-body' ? body : null) };
  const body = { innerHTML: '<div class="notif">x</div>', querySelector: (sel) => (sel === '.notif' ? {} : sel === '#kiwi-hotel-live' && body.added ? {} : null), insertAdjacentHTML(_, html) { body.added = html; } };
  const document = { visibilityState: 'visible', addEventListener: (t, f) => { (listeners['doc:' + t] ||= []).push(f); }, querySelectorAll: () => [drawer] };
  const window = {
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    KiwiCloudDoc: { isReal: () => true, status: () => status, slugFor: (id) => (id === 'v-riad-atlas' ? 'riad-atlas' : ''), currentSlug: () => 'riad-atlas', pullFeatures: async (f) => { pulls.push(f); } },
    KiwiVenue: { getVenueType: () => type },
    KiwiReservations: { get: () => doc },
    KiwiHotelRooms: { current: () => ({ rooms: rooms || [{ id: 'room:105', n: 105 }, { id: 'room:101', n: 101 }] }) },
    KiwiHours: { zone: () => 'Africa/Casablanca' },
    Kiwi: { toast: (m, o) => toasts.push({ m, desc: o && o.desc, type: o && o.type }), handlers: { notifications: () => 'drawer' } },
  };
  const asked = [];
  const fetch = stays ? async (url) => { asked.push(url); return { ok: true, json: async () => ({ ok: true, stays: stays(url) }) }; } : undefined;
  const Clock = at == null ? Date : class extends Date { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } };
  vm.runInNewContext(hotelLiveJs, { window, document, Intl, Date: Clock, Promise, fetch, setTimeout: (f) => timers.push(f), setInterval: (f, ms) => intervals.push([f, ms]) });
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
  assert.ok(t.asked.some((u) => /\/api\/hotel\/stays\?merchant=riad-atlas&includeCancelled=1&updatedSince=\d+/.test(u)), 'D1 is asked what changed, at any date');
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

// 5 · B22 · departure-day reminders, at the store's declared time (Africa/Casablanca, UTC+1 in November).
{
  const rooms = [{ id: 'room:206', n: 206 }, { id: 'room:303', n: 303 }, { id: 'room:202', n: 202, hk: 'dirty' }, { id: 'room:105', n: 105 }, { id: 'room:110', n: 110 }];
  const inHouse = [
    { id: 's-overdue', code: 'H-OVER', status: 'checked_in', resourceId: 'room:206', customer: { name: 'Dupont' }, hotel: { checkIn: '2026-11-07', checkOut: '2026-11-09' } },
    { id: 's-today', code: 'H-TODAY', status: 'checked_in', resourceId: 'room:303', customer: { name: 'Benali' }, hotel: { checkIn: '2026-11-08', checkOut: '2026-11-10' } },
    { id: 's-later', code: 'H-LATER', status: 'checked_in', resourceId: 'room:110', customer: { name: 'Kim' }, hotel: { checkIn: '2026-11-09', checkOut: '2026-11-12' } },
  ];
  const around = [
    { id: 'a-sahara', code: 'H-SAHARA', status: 'confirmed', resourceId: 'room:202', customer: { name: 'Sahara' }, hotel: { checkIn: '2026-11-11', checkOut: '2026-11-13' } },
    { id: 'a-today', code: 'H-ARR', status: 'confirmed', resourceId: 'room:105', customer: { name: 'Haddad' }, hotel: { checkIn: '2026-11-10', checkOut: '2026-11-11' } },
  ];
  const stays = (url) => (/status=checked_in/.test(url) ? inHouse : /from=/.test(url) ? around : []);
  const run = async (iso) => { const t = boot({ stays, rooms, at: Date.parse(iso) }); t.timers.forEach((f) => f()); await new Promise((r) => setTimeout(r, 0)); return t; };

  const morning = await run('2026-11-10T07:30:00Z');                     // 08:30 in Casablanca
  let desk = morning.window.KiwiHotelLive.desk();
  assert.equal(JSON.stringify(desk.late.map((b) => b.id)), '["s-overdue"]', 'morning: only yesterday\'s departure is late');
  assert.equal(JSON.stringify(desk.due.map((b) => b.id)), '["s-today"]', 'morning: today\'s departure is due');
  assert.equal(JSON.stringify(desk.toClean.map((x) => x.b.resourceId + ':' + x.when)), '["room:202:tomorrow"]', 'a dirty room with an arrival tomorrow is flagged');
  assert.equal(desk.noShow.length, 0, 'arrivals are not « missed » in the morning');
  assert.match(morning.window.KiwiHotelLive.bellHtml(), /Départs en retard · 1[\s\S]*Départs du jour · 1[\s\S]*À nettoyer avant une arrivée · 1[\s\S]*Ch\. 202 \(demain\)/, 'the bell lists the day');
  assert.equal(morning.toasts.length, 1, 'the late departure is announced once');
  assert.match(morning.toasts[0].desc, /Ch\. 206 Dupont/);

  const evening = await run('2026-11-10T18:30:00Z');                     // 19:30 in Casablanca
  desk = evening.window.KiwiHotelLive.desk();
  assert.equal(JSON.stringify(desk.late.map((b) => b.id).sort()), '["s-overdue","s-today"]', 'after 11:00, today\'s departure still in house is late');
  assert.equal(JSON.stringify(desk.noShow.map((b) => b.id)), '["a-today"]', 'in the evening, an arrival not checked in is listed');
  assert.match(evening.toasts[0].desc, /Ch\. 206 Dupont · Ch\. 303 Benali/, 'one grouped announcement');
}

console.log('✓ hotel-live: front-desk pages re-read reservations and rooms every 30 s; online bookings and cancellations are announced once, in the bell too');
