// Authenticated hotel stay writer. Manual, direct and OTA stays are committed
// into the same revisioned reservations document used by /api/booking, so a
// room accepted here disappears from public availability in the same write.
import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { poke } from '../_live.js';

const ACTIVE = new Set(['requested', 'confirmed', 'checked_in']);
const CHANNELS = new Set(['direct', 'booking', 'airbnb', 'expedia', 'walkin', 'other']);
const STATUSES = new Set(['requested', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show']);
const STATUS_TRANSITIONS = new Map([
  ['requested', new Set(['confirmed', 'cancelled', 'no_show'])],
  ['confirmed', new Set(['checked_in', 'cancelled', 'no_show'])],
  ['checked_in', new Set(['completed'])],
  ['completed', new Set()],
  ['cancelled', new Set()],
  ['no_show', new Set()],
]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[A-Za-z0-9_-]{8,80}$/;
const TZ = 'Africa/Casablanca';
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, min, max, fallback) => Number.isFinite(+v) ? Math.max(min, Math.min(max, +v)) : fallback;

function blank() {
  return { v: 1, settings: { published: false, confirmation: 'instant', minNoticeMinutes: 60, windowDays: 60, cancellationHours: 12, slotStep: 15, staffingEnabled: false, tablesPerStaff: 4 }, services: [], resources: [], blocked: [], bookings: [] };
}
function safeDoc(raw) {
  let d = raw;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = null; } }
  if (!d || typeof d !== 'object') return blank();
  const out = blank(), s = d.settings || {};
  out.settings = { ...out.settings, ...s, updatedAt: +s.updatedAt || 0 };
  out.services = Array.isArray(d.services) ? d.services.slice(0, 120) : [];
  out.resources = Array.isArray(d.resources) ? d.resources.slice(0, 120) : [];
  out.blocked = Array.isArray(d.blocked) ? d.blocked.slice(-500) : [];
  out.bookings = (Array.isArray(d.bookings) ? d.bookings : []).slice(-4000).map((x) => {
    const h = x?.hotel && typeof x.hotel === 'object' ? {
      roomTypeName: str(x.hotel.roomTypeName, 100), checkIn: str(x.hotel.checkIn, 10), checkOut: str(x.hotel.checkOut, 10),
      nights: num(x.hotel.nights, 1, 365, 1), rate: num(x.hotel.rate, 0, 1000000, 0), total: num(x.hotel.total, 0, 100000000, 0),
      channel: CHANNELS.has(x.hotel.channel) ? x.hotel.channel : (x.source === 'public' ? 'direct' : 'other'),
      externalRef: str(x.hotel.externalRef, 80),
      feedId: str(x.hotel.feedId, 64), syncedAt: +x.hotel.syncedAt || 0, conflict: !!x.hotel.conflict,
    } : null;
    return {
      id: str(x?.id, 64), code: str(x?.code, 24), customer: { name: str(x?.customer?.name, 100), phone: str(x?.customer?.phone, 32), email: str(x?.customer?.email, 160) },
      serviceId: str(x?.serviceId, 64), resourceId: str(x?.resourceId, 64), startAt: +x?.startAt || 0, endAt: +x?.endAt || 0,
      partySize: num(x?.partySize, 1, 999, 1), status: STATUSES.has(x?.status) ? x.status : 'requested',
      source: ['public', 'staff', 'import'].includes(x?.source) ? x.source : 'staff', note: str(x?.note, 600),
      manageToken: str(x?.manageToken, 80), publicRef: str(x?.publicRef, 80), hotel: h,
      createdAt: +x?.createdAt || 0, updatedAt: +x?.updatedAt || 0,
    };
  }).filter((x) => x.id && x.customer.name && x.serviceId && x.startAt && x.endAt > x.startAt);
  return out;
}
function safeRooms(raw) {
  let d = raw;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = null; } }
  d = d && typeof d === 'object' ? d : {};
  const types = (Array.isArray(d.roomTypes) ? d.roomTypes : []).slice(0, 200).map((x) => ({
    id: str(x?.id, 64), name: str(x?.name, 100), rate: x?.rate == null ? null : num(x.rate, 0, 1000000, null), maxGuests: num(x?.maxGuests, 1, 12, 2),
  })).filter((x) => x.id && x.name);
  const ids = new Set(types.map((x) => x.id));
  const rooms = (Array.isArray(d.rooms) ? d.rooms : []).slice(0, 1000).map((x) => ({
    id: str(x?.id, 64), n: num(x?.n, 1, 9999, 0), typeId: str(x?.typeId, 64), status: ['libre', 'sale', 'hs', 'occ', 'depart', 'arrivee'].includes(x?.status) ? x.status : 'libre', updatedAt: +x?.updatedAt || 0,
  })).filter((x) => x.id && x.n && ids.has(x.typeId));
  const folios = (Array.isArray(d.folios) ? d.folios : []).slice(0, 1000).map((x) => ({ room: num(x?.room, 1, 9999, 0), nights: num(x?.nights, 1, 365, 1), updatedAt: +x?.updatedAt || 0 })).filter((x) => x.room);
  return { baseRate: d.baseRate == null ? null : num(d.baseRate, 0, 1000000, null), types, rooms, folios };
}
function dateParts(epoch) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epoch));
  const out = {}; parts.forEach((p) => { if (p.type !== 'literal') out[p.type] = p.value; }); return out;
}
function zonedEpoch(date, time) {
  if (!DATE.test(date)) return 0;
  const target = Date.parse(`${date}T${time}:00Z`); let guess = target;
  for (let i = 0; i < 3; i++) { const p = dateParts(guess); const seen = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); guess += target - seen; }
  return guess;
}
function addDays(date, count) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
function overlaps(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }
function canTransition(from, to) {
  return from === to || !!STATUS_TRANSITIONS.get(from)?.has(to);
}
function currentRoomFree(hotel, room, startAt, endAt) {
  if (room.status === 'hs') return false;
  if (!['occ', 'depart', 'arrivee'].includes(room.status)) return true;
  const folio = hotel.folios.find((x) => x.room === room.n), stamp = room.updatedAt || folio?.updatedAt;
  const p = dateParts(stamp || Date.now()), day = `${p.year}-${p.month}-${p.day}`;
  return !overlaps(startAt, endAt, zonedEpoch(day, '15:00'), zonedEpoch(addDays(day, folio?.nights || 1), '11:00'));
}
function roomFree(doc, hotel, room, startAt, endAt, ignoreId) {
  if (!currentRoomFree(hotel, room, startAt, endAt)) return false;
  return !doc.bookings.some((b) => b.id !== ignoreId && ACTIVE.has(b.status) && b.resourceId === room.id && overlaps(startAt, endAt, b.startAt, b.endAt));
}
async function rowsFor(env, merchant) {
  const rows = await env.DB.batch([
    env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'reservations'").bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'rooms'").bind(merchant),
  ]);
  const first = (r) => r?.results?.[0] || null;
  return { reservation: first(rows[0]), rooms: first(rows[1]) };
}
async function write(env, merchant, doc, rev, now) {
  const text = JSON.stringify(doc), next = rev + 1;
  let result;
  if (rev) result = await env.DB.prepare("UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = 'reservations' AND rev = ?").bind(text, next, now, merchant, rev).run();
  else result = await env.DB.prepare("INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'reservations', ?, 1, ?)").bind(merchant, text, now).run();
  return (result?.meta?.changes || 0) > 0 ? next : 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, b?.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const action = str(b?.action || 'save', 16), existingId = str(b?.id, 64);

  for (let attempt = 0; attempt < 4; attempt++) {
    let rows; try { rows = await rowsFor(env, merchant); } catch (_) { return json({ error: 'unavailable' }, 503); }
    const doc = safeDoc(rows.reservation?.data), hotel = safeRooms(rows.rooms?.data), rev = +rows.reservation?.rev || 0;
    const old = existingId ? doc.bookings.find((x) => x.id === existingId && x.hotel) : null;
    if (existingId && !old) return json({ error: 'stay-not-found' }, 404);
    const now = Date.now();

    if (action === 'cancel') {
      if (!old) return json({ error: 'stay-not-found' }, 404);
      if (!canTransition(old.status, 'cancelled')) {
        return json({ error: 'invalid-status-transition', from: old.status, to: 'cancelled' }, 409);
      }
      old.status = 'cancelled'; old.updatedAt = now;
      try { const next = await write(env, merchant, doc, rev, now); if (next) { await poke(env, merchant, 'reservations'); return json({ ok: true, rev: next, booking: old }); } } catch (_) { return json({ error: 'write-failed' }, 503); }
      continue;
    }
    if (action !== 'save') return json({ error: 'bad-action' }, 400);

    const checkIn = str(b?.checkIn, 10), checkOut = str(b?.checkOut, 10), typeId = str(b?.roomTypeId, 64), askedRoom = str(b?.resourceId, 64);
    const name = str(b?.customer?.name, 100), phone = str(b?.customer?.phone, 32), email = str(b?.customer?.email, 160), note = str(b?.note, 600);
    const channel = CHANNELS.has(b?.channel) ? b.channel : 'direct', externalRef = str(b?.externalRef, 80), status = STATUSES.has(b?.status) ? b.status : 'confirmed';
    const partySize = num(b?.partySize, 1, 12, 1), clientRef = str(b?.clientRef, 80);
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn || !typeId || !name || !REF.test(clientRef)) return json({ error: 'invalid' }, 400);
    const nights = Math.round((Date.parse(checkOut + 'T12:00:00Z') - Date.parse(checkIn + 'T12:00:00Z')) / 86400000);
    if (nights < 1 || nights > 365) return json({ error: 'invalid-dates' }, 400);
    const startAt = zonedEpoch(checkIn, '15:00'), endAt = zonedEpoch(checkOut, '11:00');
    const type = hotel.types.find((x) => x.id === typeId && x.maxGuests >= partySize);
    if (!type) return json({ error: 'room-type-not-found' }, 409);
    if (old && !canTransition(old.status, status)) {
      return json({ error: 'invalid-status-transition', from: old.status, to: status }, 409);
    }
    if (!old) {
      const replay = doc.bookings.find((x) => x.publicRef === clientRef);
      if (replay) return json({ ok: true, rev, booking: replay, replayed: true });
    }
    if (externalRef && doc.bookings.some((x) => x.id !== existingId && x.hotel?.channel === channel && x.hotel?.externalRef === externalRef)) return json({ error: 'duplicate-reference' }, 409);
    const candidates = hotel.rooms.filter((r) => r.typeId === typeId && (!askedRoom || r.id === askedRoom) && roomFree(doc, hotel, r, startAt, endAt, existingId));
    if (!candidates.length) return json({ error: 'room-unavailable' }, 409);
    const room = candidates[0], rate = type.rate == null ? hotel.baseRate : type.rate;
    const rec = {
      id: old?.id || 'bk-' + crypto.randomUUID(), code: old?.code || 'H-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      customer: { name, phone, email }, serviceId: type.id, resourceId: room.id, startAt, endAt, partySize, status,
      source: old?.source || (channel === 'direct' || channel === 'walkin' ? 'staff' : 'import'), note,
      manageToken: old?.manageToken || '', publicRef: old?.publicRef || clientRef,
      hotel: {
        roomTypeName: type.name, checkIn, checkOut, nights,
        rate: rate == null ? 0 : rate, total: rate == null ? 0 : Math.round(rate * nights),
        channel, externalRef: externalRef || old?.hotel?.externalRef || '',
        feedId: old?.hotel?.feedId || '', syncedAt: old?.hotel?.syncedAt || 0,
        conflict: false,
      },
      createdAt: old?.createdAt || now, updatedAt: now,
    };
    const index = old ? doc.bookings.findIndex((x) => x.id === old.id) : -1;
    if (index < 0) doc.bookings.push(rec); else doc.bookings[index] = rec;
    try { const next = await write(env, merchant, doc, rev, now); if (next) { await poke(env, merchant, 'reservations'); return json({ ok: true, rev: next, booking: rec }); } } catch (_) { return json({ error: 'write-failed' }, 503); }
  }
  return json({ error: 'write-conflict' }, 409);
}
