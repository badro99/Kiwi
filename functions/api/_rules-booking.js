/* Règles de réservation : une seule source (piste A, une règle, un propriétaire).
 *
 * Quel statut occupe une place, quand deux créneaux se chevauchent, quelle
 * ressource convient à un groupe, combien de réservations simultanées un
 * service accepte : ces règles étaient écrites deux fois, dans
 * functions/api/booking.js et dans assets/reservations.js, et la copie du
 * navigateur ne connaissait pas la capacité d'un service (le serveur la refusait
 * à l'enregistrement). Module pur : le serveur l'importe, le navigateur en
 * reçoit une copie générée par tools/build-shared-rules.mjs (KiwiBookingRules). */

export const BOOKING_ACTIVE = new Set(['requested', 'confirmed', 'checked_in']);

const ignored = (b, ignoreId) => ignoreId != null && ignoreId !== '' && b.id === ignoreId;

export function bookingOverlaps(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }

// Une ressource est libre quand aucune réservation active ni aucun blocage ne la chevauche.
export function bookingResourceFree(doc, rid, startAt, endAt, ignoreId) {
  const busy = (doc.bookings || []).some((b) => !ignored(b, ignoreId) && b.resourceId === rid
    && BOOKING_ACTIVE.has(b.status) && bookingOverlaps(startAt, endAt, b.startAt, b.endAt));
  if (busy) return false;
  return !(doc.blocked || []).some((b) => (!b.resourceId || b.resourceId === rid)
    && bookingOverlaps(startAt, endAt, b.startAt, b.endAt));
}

// Les ressources actives assez grandes, limitées à celles du service quand il en liste.
export function bookingResourceCandidates(doc, svc, asked, partySize) {
  const allowed = svc && svc.resourceIds && svc.resourceIds.length ? svc.resourceIds : null;
  return (doc.resources || []).filter((r) => r.active && (Number(r.capacity) || 1) >= partySize
    && (!asked || r.id === asked) && (!allowed || allowed.indexOf(r.id) >= 0));
}

// Réservations actives simultanées sur la plage, toutes ressources confondues.
export function bookingConcurrent(doc, startAt, endAt, ignoreId) {
  return (doc.bookings || []).filter((b) => !ignored(b, ignoreId) && BOOKING_ACTIVE.has(b.status)
    && bookingOverlaps(startAt, endAt, b.startAt, b.endAt)).length;
}

// Occupation d'un service : une réservation consomme une place simultanée quelle
// que soit la ressource qui la sert. Intervalles demi-ouverts, annulées exclues.
export function bookingServiceCapacityAvailable(doc, service, startAt, endAt, ignoreId) {
  const events = [];
  for (const b of doc.bookings || []) {
    if (ignored(b, ignoreId) || b.serviceId !== service.id || !BOOKING_ACTIVE.has(b.status)
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
