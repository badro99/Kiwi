import { BOOKING_ACTIVE as ACTIVE, bookingServiceCapacityAvailable } from './_rules-booking.js';
/* L'occupation d'un service vit dans _rules-booking.js (règle partagée avec le
 * navigateur) ; ce module garde son nom pour le serveur et ses tests. */
export function serviceCapacityAvailable(doc, service, startAt, endAt, ignoreId = '') {
  return bookingServiceCapacityAvailable(doc, service, startAt, endAt, ignoreId);
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
