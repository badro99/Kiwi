export const reservationContract = Object.freeze({
  insert: Object.freeze([]),
  update: Object.freeze([]),
  delete: true,
});
// Contrat : libère uniquement les lignes du merchant/request_id dont le CAS a gagné ; DELETE sans mise à jour de champ. Utilisé aussi avant remplacement à la revue.
export function releaseReservations({ statements, env, merchant, id, idempotencyKey, REQUEST_TABLE }) {
    /* The ATP check and this replacement are one D1 batch. Holds are therefore
     * visible to the next request before it can pass its own guarded UPDATE. */
    statements.push(env.DB.prepare(
      `DELETE FROM inventory_request_reservations
        WHERE merchant = ? AND request_id = ?
          AND EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                      WHERE merchant = ? AND id = ? AND last_command_key = ?)`
    ).bind(merchant, id, merchant, id, idempotencyKey));
}
