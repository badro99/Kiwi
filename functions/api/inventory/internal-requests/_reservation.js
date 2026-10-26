export const reservationContract = Object.freeze({
  insert: Object.freeze(["merchant", "request_id", "line_no", "item_id", "location_id", "qty_milli", "review_revision", "created_ts"]),
  update: Object.freeze([]),
  delete: false,
});
// Contrat : ajoute au batch les réservations de revue après libération ; INSERT des huit champs déclarés, sans exécuter le batch.
export function reserveReview({ action, context, next, approvedBaseMilli, fulfilmentItemId, statements, env, merchant, id, idempotencyKey, now, REQUEST_TABLE }) {
    if (action === 'review') {
      const sourceLocation = context.economat && context.economat.locationId;
      next.lines.forEach((line, index) => {
        const qtyMilli = Math.max(0,
          (approvedBaseMilli(line) || 0) - (approvedBaseMilli(line, 'qtyReceived') || 0));
        const itemId = fulfilmentItemId(line);
        if (!sourceLocation || !qtyMilli || !itemId) return;
        statements.push(env.DB.prepare(
          `INSERT INTO inventory_request_reservations
            (merchant, request_id, line_no, item_id, location_id, qty_milli, review_revision, created_ts)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                          WHERE merchant = ? AND id = ? AND last_command_key = ?)`
        ).bind(merchant, id, index, itemId, sourceLocation, qtyMilli, next.request.reviewRevision, now,
          merchant, id, idempotencyKey));
      });
    }
}
