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

async function eventTableExists(env) {
  const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_stay_events'").first();
  return !!row;
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

  if (!rawEvents.length || !(await eventTableExists(env))) {
    const result = await write.run();
    return (result?.meta?.changes || 0) > 0 ? next : 0;
  }

  const events = rawEvents.map((entry, index) => ({
    entry,
    index,
    stayId: text(entry?.current?.id, 64),
    type: stayEventType(entry?.previous || null, entry?.current || {}, entry?.action || ''),
  })).filter((entry) => entry.stayId).sort((a, b) => (
    a.stayId.localeCompare(b.stayId) || a.type.localeCompare(b.type) || a.index - b.index
  ));
  if (!events.length) throw new Error('stay-event-required');

  const statements = [write];
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
  const results = await env.DB.batch(statements);
  return (results?.[0]?.meta?.changes || 0) > 0 ? next : 0;
}
