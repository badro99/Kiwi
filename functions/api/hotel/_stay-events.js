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
