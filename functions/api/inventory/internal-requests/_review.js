export const reservationContract = Object.freeze({
  insert: Object.freeze([]),
  update: Object.freeze([]),
  delete: false,
});
import { quantityToBase } from '../_economat-catalogue.js';
import { fulfilmentConversionSnapshot, fulfilmentItemId } from '../_internal-request.js';
// Contrat : conversions et garde ATP en lecture seule ; aucune écriture de réservation.

function approvedBaseMilli(line, field = 'qtyApproved') {
  const base = quantityToBase(Number(line && line[field]) || 0, fulfilmentConversionSnapshot(line));
  return base == null ? null : Math.round(base * 1000);
}

export function buildReviewAtpGuard(current, next, merchant, sourceLocations) {
  const locations = [...new Set((sourceLocations || []).filter(Boolean))];
  if (!locations.length) return { sql: ' AND 0', args: [] };
  const clauses = [];
  const args = [];
  const proposedByItem = new Map();
  next.lines.forEach((line, index) => {
    const receivedMilli = approvedBaseMilli(current.lines[index], 'qtyReceived') || 0;
    const proposedMilli = Math.max(0, (approvedBaseMilli(line) || 0) - receivedMilli);
    if (!proposedMilli) return;
    const itemId = fulfilmentItemId(line);
    proposedByItem.set(itemId, (proposedByItem.get(itemId) || 0) + proposedMilli);
  });
  for (const [fulfilmentItem, proposedMilli] of proposedByItem) {
    const marks = locations.map(() => '?').join(',');
    clauses.push(`? <=
      (SELECT COALESCE(SUM(qty_milli), 0) FROM inventory_movements
        WHERE merchant = ? AND item_id = ? AND location_id IN (${marks}))
      - (SELECT COALESCE(SUM(qty_milli), 0)
           FROM inventory_request_reservations
          WHERE merchant = ? AND item_id = ? AND location_id IN (${marks})
            AND request_id <> ?)`);
    args.push(proposedMilli, merchant, fulfilmentItem, ...locations,
      merchant, fulfilmentItem, ...locations, next.request.id);
  }
  return { sql: clauses.length ? ` AND ${clauses.map((clause) => `(${clause})`).join(' AND ')}` : '', args };
}

export { approvedBaseMilli };
