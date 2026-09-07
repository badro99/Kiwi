import {
  SESS_COOKIE, isOperator, isTerminalFor, isTillFor,
  operatorActor, readCookie, readSession,
} from '../../auth/_lib.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const GUEST_ID = /^[A-Za-z0-9:_-]{8,80}$/;
const AGE = new Set(['adult', 'minor', 'unknown']);

const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
const country = (value) => {
  const code = text(value, 2).toUpperCase();
  return COUNTRY.test(code) ? code : '';
};
const segmentDates = (raw, checkIn, checkOut) => {
  const fromDate = DATE.test(raw?.fromDate) && raw.fromDate >= checkIn && raw.fromDate < checkOut
    ? raw.fromDate : checkIn;
  const toDate = DATE.test(raw?.toDate) && raw.toDate > fromDate && raw.toDate <= checkOut
    ? raw.toDate : checkOut;
  return { fromDate, toDate };
};

export function readGuestSegments(raw, checkIn, checkOut) {
  if (!Array.isArray(raw) || !DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) return [];
  return raw.slice(0, 20).map((item) => {
    const guestId = text(item?.guestId, 80);
    if (!GUEST_ID.test(guestId)) return null;
    return {
      guestId,
      nationalityCountry: country(item?.nationalityCountry),
      usualResidenceCountry: country(item?.usualResidenceCountry),
      ageCategory: AGE.has(item?.ageCategory) ? item.ageCategory : 'unknown',
      ...segmentDates(item, checkIn, checkOut),
    };
  }).filter(Boolean);
}

export function normalizeGuestSegments(raw, previous, partySize, checkIn, checkOut) {
  const wanted = Math.max(1, Math.min(12, Number(partySize) || 1));
  const supplied = Array.isArray(raw) ? raw : previous;
  const out = readGuestSegments(supplied, checkIn, checkOut).slice(0, wanted);
  while (out.length < wanted) {
    out.push({
      guestId: `gst_${crypto.randomUUID()}`,
      nationalityCountry: '',
      usualResidenceCountry: '',
      ageCategory: 'unknown',
      fromDate: checkIn,
      toDate: checkOut,
    });
  }
  return out;
}

export function readRoomSegments(raw, checkIn, checkOut) {
  if (!Array.isArray(raw) || !DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) return [];
  return raw.slice(0, 40).map((item) => {
    const roomId = text(item?.roomId, 64);
    return roomId ? { roomId, ...segmentDates(item, checkIn, checkOut) } : null;
  }).filter(Boolean);
}

export function currentRoomSegment(roomId, checkIn, checkOut) {
  roomId = text(roomId, 64);
  return roomId ? [{ roomId, fromDate: checkIn, toDate: checkOut }] : [];
}

export function stayEventType(previous, current, action) {
  if (action === 'cancel') return 'cancelled';
  if (!previous) return 'created';
  if (previous.status !== current.status) return `status_${current.status}`;
  return 'updated';
}

// Deliberately excludes customer, contact, identity-document and free-note data.
export function stayEventPayload(booking) {
  return {
    v: 1,
    stayId: text(booking?.id, 64),
    status: text(booking?.status, 24),
    source: text(booking?.source, 16),
    roomTypeId: text(booking?.serviceId, 64),
    roomId: text(booking?.resourceId, 64),
    checkIn: text(booking?.hotel?.checkIn, 10),
    checkOut: text(booking?.hotel?.checkOut, 10),
    guestSegments: readGuestSegments(booking?.hotel?.guestSegments, booking?.hotel?.checkIn, booking?.hotel?.checkOut),
    roomSegments: readRoomSegments(booking?.hotel?.roomSegments, booking?.hotel?.checkIn, booking?.hotel?.checkOut),
  };
}

export async function resolveStayActor(request, env, merchant, terminalId = '') {
  try {
    const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (session?.aid) return { id: text(session.aid, 96), role: 'owner' };
  } catch (_) {}
  try {
    if (terminalId && await isTerminalFor(request, env, merchant, terminalId)) {
      return { id: text(terminalId, 96), role: 'till' };
    }
    if (await isTillFor(request, env, merchant)) return { id: `till:${text(merchant, 64)}`, role: 'till' };
  } catch (_) {}
  try {
    const actor = await operatorActor(request, env);
    if (actor?.id) return { id: text(actor.id, 96), role: 'operator' };
    if (await isOperator(request, env)) return { id: 'team', role: 'operator' };
  } catch (_) {}
  return { id: text(merchant, 96) || 'authenticated', role: 'authenticated' };
}

let eventTableState = null;
let reservationsTableState = null;

export function resetTableStateCacheForTests() {
  eventTableState = null;
  reservationsTableState = null;
}

export async function eventTableExists(env) {
  if (eventTableState !== null) return eventTableState;
  try {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_stay_events'").first();
    eventTableState = !!row;
    return eventTableState;
  } catch (err) {
    throw new Error('d1-probe-failed');
  }
}

export async function hotelReservationsTableExists(env) {
  if (reservationsTableState !== null) return reservationsTableState;
  try {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_reservations'").first();
    reservationsTableState = !!row;
    return reservationsTableState;
  } catch (err) {
    throw new Error('d1-probe-failed');
  }
}

export function hydrateReservation(row) {
  if (!row) return null;
  let parsed = {};
  try { parsed = JSON.parse(row.raw_json || '{}'); } catch (_) {}
  return {
    ...parsed,
    id: row.id,
    code: row.code,
    serviceId: row.room_type_id,
    resourceId: row.room_id,
    startAt: Number(row.start_at),
    endAt: Number(row.end_at),
    status: row.status,
    partySize: Number(row.party_size) || 1,
    customer: {
      ...(parsed.customer || {}),
      name: row.customer_name || parsed.customer?.name || '',
      phone: row.customer_phone || parsed.customer?.phone || '',
      email: row.customer_email || parsed.customer?.email || '',
    },
    hotel: {
      ...(parsed.hotel || {}),
      roomTypeName: parsed.hotel?.roomTypeName || '',
      checkIn: row.check_in,
      checkOut: row.check_out,
      rate: Number(row.rate) || 0,
      total: Number(row.total) || 0,
      channel: row.channel || 'direct',
      externalRef: row.external_ref || '',
    },
    createdAt: Number(row.created_ts) || parsed.createdAt || 0,
    updatedAt: Number(row.updated_ts) || parsed.updatedAt || 0,
  };
}

function reservationUpsertStatement(env, merchant, stay, now, next, docText) {
  const h = stay?.hotel || {};
  const cust = stay?.customer || {};
  const code = text(stay?.code, 24);
  const roomId = text(stay?.resourceId, 64);
  const roomTypeId = text(stay?.serviceId, 64);
  const startAt = Math.max(0, Number(stay?.startAt) || 0);
  const endAt = Math.max(0, Number(stay?.endAt) || 0);
  const checkIn = text(h.checkIn, 10);
  const checkOut = text(h.checkOut, 10);
  const status = text(stay?.status, 24) || 'confirmed';
  const channel = text(h.channel, 24) || 'direct';
  const externalRef = text(h.externalRef, 80);
  const customerName = text(cust.name, 100);
  const customerPhone = text(cust.phone, 32);
  const customerEmail = text(cust.email, 160);
  const partySize = Math.max(1, Number(stay?.partySize) || 1);
  const rate = Math.max(0, Number(h.rate) || 0);
  const total = Math.max(0, Number(h.total) || 0);
  const rawJson = JSON.stringify(stay || {});
  const createdTs = Math.max(1, Number(stay?.createdAt) || now);

  return env.DB.prepare(
    "INSERT INTO hotel_reservations (" +
    "merchant, id, code, room_id, room_type_id, start_at, end_at, check_in, check_out, " +
    "status, channel, external_ref, customer_name, customer_phone, customer_email, " +
    "party_size, rate, total, raw_json, created_ts, updated_ts" +
    ") SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? " +
    "WHERE EXISTS (SELECT 1 FROM store_docs WHERE merchant=? AND feature='reservations' AND rev=? AND data=?) " +
    "ON CONFLICT (merchant, id) DO UPDATE SET " +
    "code = excluded.code, " +
    "room_id = excluded.room_id, " +
    "room_type_id = excluded.room_type_id, " +
    "start_at = excluded.start_at, " +
    "end_at = excluded.end_at, " +
    "check_in = excluded.check_in, " +
    "check_out = excluded.check_out, " +
    "status = excluded.status, " +
    "channel = excluded.channel, " +
    "external_ref = excluded.external_ref, " +
    "customer_name = excluded.customer_name, " +
    "customer_phone = excluded.customer_phone, " +
    "customer_email = excluded.customer_email, " +
    "party_size = excluded.party_size, " +
    "rate = excluded.rate, " +
    "total = excluded.total, " +
    "raw_json = excluded.raw_json, " +
    "updated_ts = excluded.updated_ts"
  ).bind(
    merchant, text(stay?.id, 64), code, roomId, roomTypeId, startAt, endAt, checkIn, checkOut,
    status, channel, externalRef, customerName, customerPhone, customerEmail,
    partySize, rate, total, rawJson, createdTs, now,
    merchant, next, docText
  );
}

function writeStatement(env, merchant, textValue, rev, next, now) {
  return rev
    ? env.DB.prepare("UPDATE store_docs SET data=?,rev=?,updated_ts=? WHERE merchant=? AND feature='reservations' AND rev=?")
      .bind(textValue, next, now, merchant, rev)
    : env.DB.prepare("INSERT OR IGNORE INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'reservations',?,1,?)")
      .bind(merchant, textValue, now);
}

export async function writeReservationWithEvents(env, options) {
  const merchant = text(options?.merchant, 64), rev = Math.max(0, Number(options?.rev) || 0);
  const now = Math.max(1, Number(options?.now) || Date.now()), next = rev + 1;
  const docText = JSON.stringify(options?.doc || {}), actor = options?.actor || {};
  const write = writeStatement(env, merchant, docText, rev, next, now);
  const rawEvents = Array.isArray(options?.events) ? options.events : [];

  const hasEventsTable = await eventTableExists(env);
  const hasResTable = await hotelReservationsTableExists(env);

  if (!rawEvents.length && !hasEventsTable && !hasResTable) {
    const result = await write.run();
    return (result?.meta?.changes || 0) > 0 ? next : 0;
  }

  const statements = [write];

  if (hasResTable) {
    const seenStays = new Set();
    for (const entry of rawEvents) {
      const stay = entry?.current;
      if (stay && stay.id && !seenStays.has(stay.id)) {
        seenStays.add(stay.id);
        statements.push(reservationUpsertStatement(env, merchant, stay, now, next, docText));
      }
    }
  }


  if (hasEventsTable && rawEvents.length) {
    const events = rawEvents.map((entry, index) => ({
      entry,
      index,
      stayId: text(entry?.current?.id, 64),
      type: stayEventType(entry?.previous || null, entry?.current || {}, entry?.action || ''),
    })).filter((entry) => entry.stayId).sort((a, b) => (
      a.stayId.localeCompare(b.stayId) || a.type.localeCompare(b.type) || a.index - b.index
    ));
    if (!events.length) throw new Error('stay-event-required');

    events.forEach((event, ordinal) => {
      const payload = JSON.stringify(stayEventPayload(event.entry.current));
      const eventId = `hse:${event.stayId}:${next}:${ordinal}`;
      statements.push(env.DB.prepare(
        "INSERT INTO hotel_stay_events (merchant,id,stay_id,event_type,payload_json,occurred_ts,srv_cursor,event_ordinal,actor_id,actor_role) " +
        "SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM store_docs WHERE merchant=? AND feature='reservations' AND rev=? AND data=?)"
      ).bind(
        merchant, eventId, event.stayId, event.type, payload, now, next, ordinal,
        text(actor.id, 96) || 'authenticated', text(actor.role, 24) || 'authenticated',
        merchant, next, docText,
      ));
    });
  }

  const results = await env.DB.batch(statements);
  return (results?.[0]?.meta?.changes || 0) > 0 ? next : 0;
}

