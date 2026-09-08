// Authenticated hotel stay writer. Manual, direct and OTA stays are committed
// into the same revisioned reservations document used by /api/booking, so a
// room accepted here disappears from public availability in the same write.
import { json, entitledMerchant } from '../../auth/_lib.js';
import { commercialSnapshot, readCommercial, quote, BOARDS } from './_commercial.js';
import { stayOptions } from './_stay-options.js';
import { tenantFor } from '../_private.js';
import { poke } from '../_live.js';
import {
  currentRoomSegment, normalizeGuestSegments, readGuestSegments, readRoomSegments,
  resolveStayActor, writeReservationWithEvents,
  hotelReservationsTableExists, hydrateReservation,
} from './_stay-events.js';


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
      ...stayOptions(x.hotel),
      nights: x.hotel.dayUse === true ? 0 : num(x.hotel.nights, 1, 365, 1), rate: num(x.hotel.rate, 0, 1000000, 0), total: num(x.hotel.total, 0, 100000000, 0),
      channel: CHANNELS.has(x.hotel.channel) ? x.hotel.channel : (x.source === 'public' ? 'direct' : 'other'),
      externalRef: str(x.hotel.externalRef, 80),
      feedId: str(x.hotel.feedId, 64), syncedAt: +x.hotel.syncedAt || 0, conflict: !!x.hotel.conflict,
      guestSegments: readGuestSegments(x.hotel.guestSegments, str(x.hotel.checkIn, 10), str(x.hotel.checkOut, 10)),
      roomSegments: readRoomSegments(x.hotel.roomSegments, str(x.hotel.checkIn, 10), str(x.hotel.checkOut, 10)),
    } : null;
    const guests = (Array.isArray(x?.guests) ? x.guests : []).slice(0, 20).map((g) => ({
      id: str(g?.id, 64) || ('gst_' + crypto.randomUUID().slice(0, 12)),
      name: str(g?.name, 100),
      sex: ['M', 'F'].includes(g?.sex) ? g.sex : '',
      nationality: str(g?.nationality, 64),
      birthDate: str(g?.birthDate, 10),
      residenceCountry: str(g?.residenceCountry, 64),
      minorsUnder18: num(g?.minorsUnder18, 0, 10, 0),
      idDocType: ['CNIE', 'passeport', 'carte_sejour', 'autre'].includes(g?.idDocType) ? g.idDocType : '',
      idDocNumber: str(g?.idDocNumber, 40),
    })).filter((g) => g.name || g.nationality || g.idDocNumber);
    const roomSegments = (Array.isArray(x?.roomSegments) ? x.roomSegments : []).slice(0, 20).map((rs) => ({
      roomId: str(rs?.roomId, 64),
      fromDate: str(rs?.fromDate, 10),
      toDate: str(rs?.toDate, 10),
    })).filter((rs) => rs.roomId && rs.fromDate && rs.toDate);
    return {
      id: str(x?.id, 64), code: str(x?.code, 24), customer: { name: str(x?.customer?.name, 100), phone: str(x?.customer?.phone, 32), email: str(x?.customer?.email, 160) },
      serviceId: str(x?.serviceId, 64), resourceId: str(x?.resourceId, 64), startAt: +x?.startAt || 0, endAt: +x?.endAt || 0,
      partySize: num(x?.partySize, 1, 999, 1), status: STATUSES.has(x?.status) ? x.status : 'requested',
      source: ['public', 'staff', 'import'].includes(x?.source) ? x.source : 'staff', note: str(x?.note, 600),
      manageToken: str(x?.manageToken, 80), publicRef: str(x?.publicRef, 80), hotel: h,
      guests, roomSegments, commercial: commercialSnapshot(x?.commercial),
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
function isCalendarDate(date) {
  if (!DATE.test(date) || date.startsWith('0000-')) return false;
  const epoch = Date.parse(`${date}T12:00:00Z`);
  // Date.parse normalizes e.g. February 30 into March instead of rejecting it.
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === date;
}
function zonedEpoch(date, time) {
  if (!isCalendarDate(date)) return 0;
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
export const MAX_DOC_BOOKINGS = 250;
export const HARD_DOC_LIMIT = 300;

export function pruneReservationsDoc(doc, now = Date.now()) {
  if (!doc || !Array.isArray(doc.bookings)) return doc;
  const p = dateParts(now);
  const today = `${p.year}-${p.month}-${p.day}`;
  const pastBound = addDays(today, -3);
  const futureBound = addDays(today, 14);

  const hotelBookings = [];
  const otherBookings = [];

  for (const b of doc.bookings) {
    if (!b || !b.id) continue;
    if (!b.hotel) {
      otherBookings.push(b);
      continue;
    }
    const cin = b.hotel.checkIn || '';
    const cout = b.hotel.checkOut || '';
    if (cout >= pastBound && cin <= futureBound) {
      hotelBookings.push(b);
    }
  }

  if (hotelBookings.length > MAX_DOC_BOOKINGS) {
    const todayEpoch = Date.parse(`${today}T12:00:00Z`);
    hotelBookings.sort((a, b) => {
      const aInHouse = a.status === 'checked_in' ? 0 : 1;
      const bInHouse = b.status === 'checked_in' ? 0 : 1;
      if (aInHouse !== bInHouse) return aInHouse - bInHouse;

      const aToday = (a.hotel?.checkIn === today || a.hotel?.checkOut === today) ? 0 : 1;
      const bToday = (b.hotel?.checkIn === today || b.hotel?.checkOut === today) ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;

      const aActive = (a.status === 'confirmed' || a.status === 'requested') ? 0 : 1;
      const bActive = (b.status === 'confirmed' || b.status === 'requested') ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const aDist = Math.abs((a.startAt || 0) - todayEpoch);
      const bDist = Math.abs((b.startAt || 0) - todayEpoch);
      return aDist - bDist;
    });

    hotelBookings.splice(HARD_DOC_LIMIT);
  }

  const combined = hotelBookings.concat(otherBookings.slice(-100));
  doc.bookings = combined.slice(-HARD_DOC_LIMIT);
  return doc;
}

function roomFree(doc, hotel, room, startAt, endAt, ignoreId) {
  if (!currentRoomFree(hotel, room, startAt, endAt)) return false;
  return !doc.bookings.some((b) => b.id !== ignoreId && ACTIVE.has(b.status) && b.resourceId === room.id && overlaps(startAt, endAt, b.startAt, b.endAt));
}

async function d1RoomFree(env, merchant, roomId, startAt, endAt, ignoreId) {
  const row = await env.DB.prepare(
    "SELECT id FROM hotel_reservations " +
    "WHERE merchant = ? AND room_id = ? AND status IN ('requested','confirmed','checked_in') " +
    "AND start_at < ? AND end_at > ? AND id != ? LIMIT 1"
  ).bind(merchant, roomId, endAt, startAt, ignoreId || '').first();
  return !row;
}

async function d1BusyRoomsForType(env, merchant, roomTypeId, startAt, endAt, ignoreId) {
  const stmt = env.DB.prepare(
    "SELECT DISTINCT room_id FROM hotel_reservations " +
    "WHERE merchant = ? AND room_type_id = ? AND status IN ('requested','confirmed','checked_in') " +
    "AND start_at < ? AND end_at > ? AND id != ?"
  ).bind(merchant, roomTypeId, endAt, startAt, ignoreId || '');
  const rows = typeof stmt.all === 'function' ? await stmt.all() : (typeof stmt.rows === 'function' ? await stmt.rows() : null);
  return new Set((rows?.results || []).map((r) => r.room_id));
}


async function rowsFor(env, merchant) {
  const rows = await env.DB.batch([
    env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'reservations'").bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'rooms'").bind(merchant),
  ]);
  const first = (r) => r?.results?.[0] || null;
  return { reservation: first(rows[0]), rooms: first(rows[1]) };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const u = new URL(request.url);
  const merchantParam = str(u.searchParams.get('merchant'), 64);
  const merchant = await tenantFor(request, env, merchantParam, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  const fromParam = str(u.searchParams.get('from'), 32);
  const toParam = str(u.searchParams.get('to'), 32);
  const roomId = str(u.searchParams.get('roomId'), 64);
  const accountId = str(u.searchParams.get('accountId'), 80);
  const dossierId = str(u.searchParams.get('dossierId'), 64);
  const stayId = str(u.searchParams.get('id'), 64);
  const statusParam = str(u.searchParams.get('status'), 24);
  const includeCancelled = u.searchParams.get('includeCancelled') === '1' || statusParam === 'cancelled';

  // Keep numeric epoch bounds, but never normalize impossible calendar dates
  // or silently turn malformed date filters into an unbounded query.
  if ([fromParam, toParam].some((value) => value && !isCalendarDate(value)
    && !(Number.isFinite(+value) && +value >= 0))) {
    return json({ error: 'invalid-dates' }, 400);
  }

  const fromEpoch = DATE.test(fromParam)
    ? zonedEpoch(fromParam, '00:00')
    : (Number.isFinite(+fromParam) && +fromParam > 0 ? +fromParam : 0);
  const toEpoch = DATE.test(toParam)
    ? zonedEpoch(toParam, '23:59')
    : (Number.isFinite(+toParam) && +toParam > 0 ? +toParam : Number.MAX_SAFE_INTEGER);

  let hasResTable = false;
  try {
    hasResTable = await hotelReservationsTableExists(env);
  } catch (_) {
    return json({ error: 'service-unavailable' }, 503);
  }

  if (hasResTable) {
    try {
      let query = "SELECT * FROM hotel_reservations WHERE merchant = ? AND start_at < ? AND end_at > ?";
      const params = [merchant, toEpoch, fromEpoch];
      if (stayId) { query += ' AND id = ?'; params.push(stayId); }
      if (dossierId) {
        query += " AND COALESCE(NULLIF(CASE WHEN json_valid(raw_json) THEN json_extract(raw_json, '$.hotel.dossierId') END,''),id) = ?";
        params.push(dossierId);
      }
      if (accountId) {
        query += " AND CASE WHEN json_valid(raw_json) THEN json_extract(raw_json, '$.commercial.accountId') END = ?";
        params.push(accountId);
      }
      if (!includeCancelled) query += " AND status != 'cancelled'";

      if (roomId) {
        query += " AND room_id = ?";
        params.push(roomId);
      }
      if (statusParam && STATUSES.has(statusParam)) {
        query += " AND status = ?";
        params.push(statusParam);
      }
      query += " ORDER BY start_at ASC LIMIT 1000";

      const stmt = env.DB.prepare(query).bind(...params);
      const rows = typeof stmt.all === 'function' ? await stmt.all() : (typeof stmt.rows === 'function' ? await stmt.rows() : null);
      const stays = (rows?.results || []).map(hydrateReservation).filter(Boolean);
      return json({ ok: true, stays, coverage: 'ledger', capped: stays.length === 1000 }, 200, { 'Cache-Control': 'no-store' });

    } catch (_) {
      return json({ error: 'service-unavailable' }, 503);
    }
  }

  try {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'reservations'").bind(merchant).first();
    const doc = safeDoc(row?.data);
    const stays = (doc.bookings || []).filter((b) => {
      if (!b.hotel || (!includeCancelled && b.status === 'cancelled')) return false;
      if (stayId && b.id !== stayId) return false;
      if (accountId && b.commercial?.accountId !== accountId) return false;
      if (dossierId && (b.hotel.dossierId || b.id) !== dossierId) return false;
      if (roomId && b.resourceId !== roomId) return false;
      if (statusParam && b.status !== statusParam) return false;
      return overlaps(fromEpoch, toEpoch, b.startAt, b.endAt);
    });
    return json({ ok: true, stays, coverage: 'document' }, 200, { 'Cache-Control': 'no-store' });
  } catch (_) {
    return json({ error: 'service-unavailable' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, b?.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const action = str(b?.action || 'save', 16), existingId = str(b?.id, 64);
  const actor = await resolveStayActor(request, env, merchant, str(b?.terminalId, 96));

  for (let attempt = 0; attempt < 4; attempt++) {
    let rows; try { rows = await rowsFor(env, merchant); } catch (_) { return json({ error: 'unavailable' }, 503); }
    const doc = safeDoc(rows.reservation?.data), hotel = safeRooms(rows.rooms?.data), rev = +rows.reservation?.rev || 0;
    let old = existingId ? doc.bookings.find((x) => x.id === existingId && x.hotel) : null;

    let hasResTable = false;
    try {
      hasResTable = await hotelReservationsTableExists(env);
    } catch (_) {
      return json({ error: 'service-unavailable' }, 503);
    }

    if (existingId && hasResTable) {
      try {
        const row = await env.DB.prepare("SELECT * FROM hotel_reservations WHERE merchant = ? AND id = ?").bind(merchant, existingId).first();
        if (row) old = hydrateReservation(row);
      } catch (_) {
        return json({ error: 'service-unavailable' }, 503);
      }
    }
    if (existingId && !old) return json({ error: 'stay-not-found' }, 404);
    const now = Date.now();

    if (action === 'cancel') {
      if (!old) return json({ error: 'stay-not-found' }, 404);
      if (!canTransition(old.status, 'cancelled')) {
        return json({ error: 'invalid-status-transition', from: old.status, to: 'cancelled' }, 409);
      }
      const previous = { ...old, hotel: { ...old.hotel } };
      old.status = 'cancelled'; old.updatedAt = now;
      const indexInDoc = doc.bookings.findIndex((x) => x.id === old.id);
      if (indexInDoc >= 0) doc.bookings[indexInDoc] = old;
      /* Le bornage ne s'applique QUE si hotel_reservations existe. Sans la table,
         le document est l'unique copie : l'élaguer détruirait pour de bon toute
         réservation confirmée au-delà de la fenêtre, et la chambre repartirait
         à la vente. La disponibilité retombe déjà sur le document dans ce cas. */
      if (hasResTable) pruneReservationsDoc(doc, now);
      try {
        const next = await writeReservationWithEvents(env, { merchant, doc, rev, now, actor, events: [{ previous, current: old, action: 'cancel' }] });
        if (next) { await poke(env, merchant, 'reservations'); return json({ ok: true, rev: next, booking: old }); }
      } catch (_) { return json({ error: 'write-failed' }, 503); }
      continue;
    }
    if (action !== 'save') return json({ error: 'bad-action' }, 400);

    const checkIn = str(b?.checkIn, 32), checkOut = str(b?.checkOut, 32), typeId = str(b?.roomTypeId, 64), askedRoom = str(b?.resourceId, 64);
    const name = str(b?.customer?.name, 100), phone = str(b?.customer?.phone, 32), email = str(b?.customer?.email, 160), note = str(b?.note, 600);
    const channel = CHANNELS.has(b?.channel) ? b.channel : 'direct', externalRef = str(b?.externalRef, 80), status = STATUSES.has(b?.status) ? b.status : 'confirmed';
    const partySize = num(b?.partySize, 1, 12, 1), clientRef = str(b?.clientRef, 80);
    const dayUse = b.dayUse === undefined ? old?.hotel?.dayUse === true : b.dayUse === true;
    const arrivalTime = dayUse ? str(b.arrivalTime ?? old?.hotel?.arrivalTime, 5) : '15:00';
    const departureTime = dayUse ? str(b.departureTime ?? old?.hotel?.departureTime, 5) : '11:00';
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || (dayUse ? checkOut !== checkIn : checkOut <= checkIn) || !typeId || !name || !REF.test(clientRef)) return json({ error: 'invalid' }, 400);
    if (!isCalendarDate(checkIn) || !isCalendarDate(checkOut)) return json({ error: 'invalid-dates' }, 400);
    const nights = Math.round((Date.parse(checkOut + 'T12:00:00Z') - Date.parse(checkIn + 'T12:00:00Z')) / 86400000);
    if ((!dayUse && nights < 1) || nights > 365) return json({ error: 'invalid-dates' }, 400);
    if (dayUse && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(departureTime) || arrivalTime >= departureTime)) return json({ error: 'invalid-day-use' }, 400);
    if (old && !!old.hotel.dayUse !== dayUse) return json({ error: 'stay-mode-locked' }, 409);
    if (dayUse && old?.hotel?.feedId) return json({ error: 'feed-day-use-unsupported' }, 409);
    const startAt = zonedEpoch(checkIn, arrivalTime), endAt = zonedEpoch(checkOut, departureTime);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return json({ error: 'invalid-day-use' }, 400);
    if (!old) {
      // Future stays may live only in D1. publicRef is stored in raw_json,
      // not a public_ref column; never let pruning defeat the form's retry key.
      // Read D1 first so a stale compact copy cannot resurrect an old status.
      let replay = null;
      if (hasResTable) {
        try {
          const row = await env.DB.prepare(
            "SELECT * FROM hotel_reservations WHERE merchant = ? " +
            "AND CASE WHEN json_valid(raw_json) THEN json_extract(raw_json, '$.publicRef') END = ? LIMIT 1"
          ).bind(merchant, clientRef).first();
          if (row) replay = hydrateReservation(row);
        } catch (_) {
          return json({ error: 'service-unavailable' }, 503);
        }
      }
      if (!replay) replay = doc.bookings.find((x) => x.publicRef === clientRef);
      if (replay) return json({ ok: true, rev, booking: replay, replayed: true });
    }
    const type = hotel.types.find((x) => x.id === typeId && x.maxGuests >= partySize);
    if (!type) return json({ error: 'room-type-not-found' }, 409);
    if (old && !canTransition(old.status, status)) {
      return json({ error: 'invalid-status-transition', from: old.status, to: status }, 409);
    }
    // A linked room is a new independently cancellable reservation, not an
    // update to the original room. The root is resolved in this tenant only.
    let dossierId = old?.hotel?.dossierId || old?.id || '';
    if (!old && b.linkedStayId) {
      let linked;
      try {
        linked = hasResTable ? hydrateReservation(await env.DB.prepare('SELECT * FROM hotel_reservations WHERE merchant = ? AND id = ?').bind(merchant, str(b.linkedStayId, 64)).first()) : doc.bookings.find(x => x.id === b.linkedStayId);
      } catch (_) { return json({ error: 'service-unavailable' }, 503); }
      if (!linked?.hotel) return json({ error: 'linked-stay-not-found' }, 404);
      dossierId = linked.hotel.dossierId || linked.id;
    }
    if (externalRef) {
      if (hasResTable) {
        try {
          const dupRow = await env.DB.prepare(
            "SELECT id FROM hotel_reservations WHERE merchant = ? AND channel = ? AND external_ref = ? AND id != ? LIMIT 1"
          ).bind(merchant, channel, externalRef, existingId || '').first();
          if (dupRow) return json({ error: 'duplicate-reference' }, 409);
        } catch (_) {
          return json({ error: 'service-unavailable' }, 503);
        }
      } else if (doc.bookings.some((x) => x.id !== existingId && x.hotel?.channel === channel && x.hotel?.externalRef === externalRef)) {
        return json({ error: 'duplicate-reference' }, 409);
      }
    }

    let room = null;
    if (hasResTable) {
      if (askedRoom) {
        const candidate = hotel.rooms.find((r) => r.id === askedRoom && r.typeId === typeId && currentRoomFree(hotel, r, startAt, endAt) && roomFree(doc, hotel, r, startAt, endAt, existingId));
        if (!candidate) return json({ error: 'room-unavailable' }, 409);
        let isFree = false;
        try {
          isFree = await d1RoomFree(env, merchant, askedRoom, startAt, endAt, existingId);
        } catch (_) {
          return json({ error: 'service-unavailable' }, 503);
        }
        if (!isFree) return json({ error: 'room-unavailable' }, 409);
        room = candidate;
      } else {
        let busyRooms = new Set();
        try {
          busyRooms = await d1BusyRoomsForType(env, merchant, typeId, startAt, endAt, existingId);
        } catch (_) {
          return json({ error: 'service-unavailable' }, 503);
        }
        const candidates = hotel.rooms.filter((r) => r.typeId === typeId && !busyRooms.has(r.id) && currentRoomFree(hotel, r, startAt, endAt) && roomFree(doc, hotel, r, startAt, endAt, existingId));
        if (!candidates.length) return json({ error: 'room-unavailable' }, 409);
        room = candidates[0];
      }
    } else {
      const candidates = hotel.rooms.filter((r) => r.typeId === typeId && (!askedRoom || r.id === askedRoom) && roomFree(doc, hotel, r, startAt, endAt, existingId));
      if (!candidates.length) return json({ error: 'room-unavailable' }, 409);
      room = candidates[0];
    }


    // A saved stay owns its price. Editing identity, status, dates or the room
    // within the same category must not reprice it after a catalogue change.
    // An explicit category change still takes that category's current rate.
    const sameType = old && old.serviceId === type.id;
    let rate = sameType ? old.hotel.rate : (type.rate == null ? hotel.baseRate : type.rate);
    let total = sameType && nights === old.hotel.nights
      ? old.hotel.total
      : (rate == null ? 0 : Math.round(rate * nights * 100) / 100);
    if (dayUse) {
      if ((await entitledMerchant(request, env, merchant)) !== merchant) return json({ error: 'commercial-forbidden' }, 403);
      const cents = b.dayUseAmountCents === undefined && old ? Math.round(old.hotel.total * 100) : b.dayUseAmountCents;
      if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) return json({ error: 'day-use-price-required' }, 400);
      if (old && ['completed','cancelled','no_show'].includes(old.status) && (cents !== Math.round(old.hotel.total * 100) || startAt !== old.startAt || endAt !== old.endAt)) return json({ error: 'closed-commercial' }, 409);
      total = cents / 100; rate = total;
    }
    let commercial = commercialSnapshot(old?.commercial);
    const spec = b?.commercial;
    if (dayUse && (spec?.quoted || commercial?.quoted)) return json({ error: 'day-use-contract-unsupported' }, 409);
    const changedStay = old && (old.serviceId !== typeId || old.hotel.checkIn !== checkIn || old.hotel.checkOut !== checkOut || old.partySize !== partySize);
    if (commercial?.quoted && changedStay && (!spec || !b.acceptQuote)) return json({ error: 'quote-required' }, 409);
    if (spec !== undefined) {
      if ((await entitledMerchant(request, env, merchant)) !== merchant) return json({ error: 'commercial-forbidden' }, 403);
      const accountId = str(spec?.accountId, 80), board = BOARDS.includes(spec?.board) ? spec.board : 'room_only';
      const quoted = spec?.quoted === true;
      const changedPricing = changedStay || accountId !== (commercial?.accountId || '') || board !== (commercial?.board || 'room_only') || quoted !== !!commercial?.quoted;
      if (old && ['completed', 'cancelled', 'no_show'].includes(old.status) && (b.acceptQuote || changedPricing || str(spec?.voucher, 100) !== (commercial?.voucher || '') || str(spec?.booker, 160) !== (commercial?.booker || ''))) return json({ error: 'closed-commercial' }, 409);
      try {
        const directory = await readCommercial(env, merchant);
        const selected = accountId ? directory.accounts.find(a => a.id === accountId) : null;
        if (accountId && (!selected || (selected.archived && accountId !== commercial?.accountId))) return json({ error: 'account-unavailable' }, 409);
        let accepted = commercial?.quote || null;
        if (quoted && (!commercial?.quoted || changedPricing || b.acceptQuote)) {
          if (old?.hotel?.feedId) return json({ error: 'feed-contract-unsupported' }, 409);
          if (b.acceptQuote !== true || b.quoteRevision !== directory.rev) return json({ error: 'quote-required' }, 409);
          accepted = quote(directory, { accountId, roomTypeId: typeId, checkIn, checkOut, occupancy: partySize, board });
          // HT can be simulated but not booked as TTC until hotel taxes are configured.
          if (accepted.taxBasis !== 'inclusive') return json({ error: 'tax-configuration-required' }, 409);
        }
        if (!quoted && board !== 'room_only') return json({ error: 'quote-required' }, 409);
        commercial = { accountId, billTo: accountId === commercial?.accountId ? commercial.billTo : selected,
          booker: str(spec?.booker, 160), voucher: str(spec?.voucher, 100), board, occupancy: partySize,
          quoted, acceptedAt: quoted && b.acceptQuote ? now : (commercial?.acceptedAt || 0), quote: quoted ? accepted : null };
        if (!quoted && old?.commercial?.quoted) {
          if (!b.acceptQuote) return json({ error: 'quote-required' }, 409);
          rate = type.rate == null ? hotel.baseRate : type.rate;
          total = Math.round((rate || 0) * nights * 100) / 100;
        }
        if (!commercial.accountId && !commercial.booker && !commercial.voucher && !commercial.quoted) commercial = null;
      } catch (e) { return json({ error: e?.code || 'commercial-unavailable' }, e?.code ? 409 : 503); }
    }
    if (commercial?.quoted && commercial.quote) { total = commercial.quote.totalCents / 100; rate = Math.round(total / nights * 100) / 100; }
    const saveGuests = (Array.isArray(b?.guests) ? b.guests : (old?.guests || [])).slice(0, 20).map((g) => ({
      id: str(g?.id, 64) || ('gst_' + crypto.randomUUID().slice(0, 12)),
      name: str(g?.name, 100),
      sex: ['M', 'F'].includes(g?.sex) ? g.sex : '',
      nationality: str(g?.nationality, 64),
      birthDate: str(g?.birthDate, 10),
      residenceCountry: str(g?.residenceCountry, 64),
      minorsUnder18: num(g?.minorsUnder18, 0, 10, 0),
      idDocType: ['CNIE', 'passeport', 'carte_sejour', 'autre'].includes(g?.idDocType) ? g.idDocType : '',
      idDocNumber: str(g?.idDocNumber, 40),
    })).filter((g) => g.name || g.nationality || g.idDocNumber);
    const saveRoomSegments = (Array.isArray(b?.roomSegments) ? b.roomSegments : (old?.roomSegments || [])).slice(0, 20).map((rs) => ({
      roomId: str(rs?.roomId, 64),
      fromDate: str(rs?.fromDate, 10),
      toDate: str(rs?.toDate, 10),
    })).filter((rs) => rs.roomId && rs.fromDate && rs.toDate);
    const rec = {
      id: old?.id || 'bk-' + crypto.randomUUID(), code: old?.code || 'H-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      customer: { name, phone, email }, serviceId: type.id, resourceId: room.id, startAt, endAt, partySize, status,
      source: old?.source || (channel === 'direct' || channel === 'walkin' ? 'staff' : 'import'), note,
      manageToken: old?.manageToken || '', publicRef: old?.publicRef || clientRef,
      guests: saveGuests, commercial,
      roomSegments: saveRoomSegments,
      hotel: {
        dossierId, dayUse, arrivalTime, departureTime,
        roomTypeName: type.name, checkIn, checkOut, nights,
        rate: rate == null ? 0 : rate, total,
        channel, externalRef: externalRef || old?.hotel?.externalRef || '',
        feedId: old?.hotel?.feedId || '', syncedAt: old?.hotel?.syncedAt || 0,
        conflict: false,
        guestSegments: dayUse ? [] : normalizeGuestSegments(b?.guestSegments, old?.hotel?.guestSegments, partySize, checkIn, checkOut),
        roomSegments: dayUse ? [] : currentRoomSegment(room.id, checkIn, checkOut),
      },
      createdAt: old?.createdAt || now, updatedAt: now,
    };
    rec.hotel.dossierId ||= rec.id;
    const index = old ? doc.bookings.findIndex((x) => x.id === old.id) : -1;
    if (index < 0) doc.bookings.push(rec); else doc.bookings[index] = rec;
    /* Le bornage ne s'applique QUE si hotel_reservations existe. Sans la table,
       le document est l'unique copie : l'élaguer détruirait pour de bon toute
       réservation confirmée au-delà de la fenêtre, et la chambre repartirait
       à la vente. La disponibilité retombe déjà sur le document dans ce cas. */
    if (hasResTable) pruneReservationsDoc(doc, now);
    try {
      const next = await writeReservationWithEvents(env, { merchant, doc, rev, now, actor, events: [{ previous: old, current: rec, action: old ? 'update' : 'create' }] });
      if (next) { await poke(env, merchant, 'reservations'); return json({ ok: true, rev: next, booking: rec }); }
    } catch (_) { return json({ error: 'write-failed' }, 503); }
  }
  return json({ error: 'write-conflict' }, 409);
}
