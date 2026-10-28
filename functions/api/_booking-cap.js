// functions/api/_booking-cap.js
//
// Les réservations hors hôtel vivent dans un seul document JSON. Il est borné à
// BOOKING_CAP lignes, mais le bornage ne coupe plus « les plus anciennes dans le
// tableau » : une réservation prise tôt pour une date lointaine est la plus
// ancienne du tableau et la plus précieuse. Règle :
//   1. on retire d'abord les réservations PASSÉES, la plus ancienne fin d'abord ;
//   2. une réservation à venir n'est jamais retirée ;
//   3. s'il reste trop de lignes à venir, `full` est vrai : l'appelant refuse
//      l'écriture avec une erreur claire au lieu de perdre une ligne en silence.
// assets/reservations.js (normalize) porte la même règle ; tools/booking-cap-test.mjs
// fait tourner les deux sur les mêmes cas.
export const BOOKING_CAP = 4000;
const DAY = 86400000;
const OPEN = new Set(['requested', 'confirmed', 'checked_in']);

/* Une ligne est « passée » quand sa fin est derrière nous. Une ligne encore
   ouverte (demandée, confirmée, en séjour) garde sept jours de grâce : un
   départ non clos ou un no-show à marquer ne disparaît pas le lendemain. */
export function isDroppablePast(row, now) {
  const end = +row?.endAt || 0;
  return end < now - (OPEN.has(row?.status) ? 7 * DAY : 0);
}

export function capBookings(rows, now = Date.now(), cap = BOOKING_CAP) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length <= cap) return { bookings: list, dropped: 0, full: false };
  const excess = list.length - cap;
  const victims = list.map((row, i) => ({ i, end: +row?.endAt || 0, row }))
    .filter((x) => isDroppablePast(x.row, now))
    .sort((a, b) => a.end - b.end || a.i - b.i)
    .slice(0, excess);
  const drop = new Set(victims.map((x) => x.i));
  const bookings = list.filter((_, i) => !drop.has(i));
  return { bookings, dropped: victims.length, full: bookings.length > cap };
}
