/* Candidate selection runs inside the movement INSERT in the atomic D1 batch.
 * Never read a free id before the batch: another command could claim it. */
export async function movementProbe(merchant, movement) {
  const candidates = Array.from({ length: 9 }, (_, i) => i ? `${movement.id}-c${i}` : movement.id);
  // A tenant-scoped digest resolves occupied legacy probe slots deterministically.
  const identity = JSON.stringify([merchant, movement.refId, movement.meta.requestId,
    movement.meta.line, movement.itemId, movement.reason, movement.meta.transferPiece]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  candidates.push('inv-transfer-s-' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''));
  const sql = `WITH candidates(id, n) AS (VALUES ${candidates.map((_, i) => `(?, ${i})`).join(',')})
    SELECT c.id FROM candidates c LEFT JOIN inventory_movements m ON m.id = c.id
     WHERE m.id IS NULL OR (
       m.merchant = ? AND m.ref_type = 'transfer' AND m.ref_id = ?
       AND m.item_id = ? AND m.reason = ?
       AND CASE WHEN json_valid(m.meta) THEN
         json_extract(m.meta, '$.requestId') = ? AND json_extract(m.meta, '$.line') = ?
         AND CASE WHEN json_extract(m.meta, '$.transferPiece') IS NOT NULL
           THEN json_extract(m.meta, '$.transferPiece') = ?
           ELSE json_extract(m.meta, '$.allocationBreakdown') = json(?) END
         ELSE 0 END
     ) ORDER BY CASE WHEN m.id IS NULL THEN 1 ELSE 0 END, c.n LIMIT 1`;
  return { sql, args: [...candidates, merchant, movement.refId, movement.itemId,
    movement.reason, movement.meta.requestId, movement.meta.line,
    movement.meta.transferPiece, JSON.stringify(movement.meta.allocationBreakdown)] };
}

export async function probedMovementInsert(env, columns, values, merchant, movement, requestId, key) {
  const probe = await movementProbe(merchant, movement);
  // Malformed JSON deliberately aborts the whole batch when all slots conflict.
  return env.DB.prepare(`INSERT INTO inventory_movements ${columns}
    SELECT COALESCE((${probe.sql}), json('transfer-id-probe-exhausted')), ${values.slice(1).map(() => '?').join(', ')}
     WHERE EXISTS (SELECT 1 FROM hotel_internal_requests
       WHERE merchant = ? AND id = ? AND last_command_key = ?)
     ON CONFLICT(id) DO NOTHING`)
    .bind(...probe.args, ...values.slice(1), merchant, requestId, key);
}
