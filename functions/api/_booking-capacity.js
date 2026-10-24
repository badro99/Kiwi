// Half-open service occupancy: one booking consumes one simultaneous place,
// regardless of which eligible resource serves it. Cancelled stays consume none.
const ACTIVE = new Set(['requested', 'confirmed', 'checked_in']);
export function serviceCapacityAvailable(doc, service, startAt, endAt, ignoreId = '') {
  const events = [];
  for (const b of doc.bookings || []) {
    if (b.id === ignoreId || b.serviceId !== service.id || !ACTIVE.has(b.status)
      || b.startAt >= endAt || b.endAt <= startAt) continue;
    events.push([Math.max(startAt, b.startAt), 1], [Math.min(endAt, b.endAt), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let occupied = 0;
  for (const [, delta] of events) {
    occupied += delta;
    if (occupied >= Math.max(1, Number(service.capacity) || 1)) return false;
  }
  return true;
}
export function serviceCapacityConflict(doc) {
  for (const service of doc.services || []) {
    for (const b of doc.bookings || []) {
      if (b.hotel || b.serviceId !== service.id || !ACTIVE.has(b.status)) continue;
      if (!serviceCapacityAvailable(doc, service, b.startAt, b.endAt, b.id)) return service.id;
    }
  }
  return null;
}
