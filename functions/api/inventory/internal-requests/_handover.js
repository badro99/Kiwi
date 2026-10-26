export const reservationContract = Object.freeze({
  insert: Object.freeze(["merchant", "request_id", "line_no", "item_id", "location_id", "qty_milli", "review_revision", "created_ts"]),
  update: Object.freeze(["qty_milli", "review_revision", "created_ts"]),
  delete: true,
});
// Contrat : contexte autorisé et révision vérifiée ; Response inchangée.
// Réservations : adoption historique INSERT, décrément qty_milli, review_revision et created_ts, suppression des lignes épuisées. Même batch CAS que les mouvements.
export function createHandover({ mayConfirm, json, nowFor, applyRequestCommand, approvedBaseMilli, fulfilmentItemId, sourceRows, allocateTransferAllocation, reserveCursors, inventoryHasColumn, transferMovementId, REQUEST_TABLE, LINE_TABLE, EVENT_TABLE, replayFor, loadRequest }) {
async function confirmCommand(env, body, merchant, id, idempotencyKey, current, context, expectedRevision) {
  if (!mayConfirm(context, current.request)) return json({ error: 'confirmation-side-forbidden' }, 403);
  const now = nowFor(env);
  const changed = applyRequestCommand(current, 'confirm', { ...(body && body.data || {}), now });
  if (!changed.ok) return json({ error: changed.error }, changed.status || 422);
  const next = changed.value;
  const sourceLocation = context.economat && context.economat.locationId;
  const destinationLocation = context.unit && context.unit.locationId;
  if (!sourceLocation || !destinationLocation || sourceLocation === destinationLocation) {
    return json({ error: 'bad-transfer-locations' }, 422);
  }
  const sourceLocations = [sourceLocation, 'principal'];
  const transferRef = `request:${id}:${idempotencyKey}`.slice(0, 100);
  const transfers = [];
  for (let index = 0; index < next.lines.length; index += 1) {
    const before = current.lines[index];
    const after = next.lines[index];
    const beforeMilli = approvedBaseMilli(before, 'qtyReceived');
    const afterMilli = approvedBaseMilli(after, 'qtyReceived');
    const deltaMilli = Number(afterMilli) - Number(beforeMilli);
    if (!(deltaMilli > 0)) continue;
    const itemId = fulfilmentItemId(after);
    const rows = await sourceRows(env, merchant, itemId, sourceLocations);
    const onHandMilli = rows.reduce((sum, row) => sum + Number(row.qty_milli || 0), 0);
    if (onHandMilli < deltaMilli) return json({ error: `source-shortage:${after.itemId}` }, 409);
    const allocation = allocateTransferAllocation(rows, deltaMilli);
    if (!allocation) return json({ error: `source-cost-unknown:${after.itemId}` }, 409);
    transfers.push({
      index, line: after, itemId, deltaMilli,
      unitCost: allocation.unitCost,
      allocation,
    });
  }
  if (!transfers.length) return json({ error: 'nothing-to-confirm' }, 409);
  /* Requests reviewed before the hold table existed have no reservation row.
   * They may be adopted at confirmation, but only by the same guarded UPDATE
   * that wins the command token and only when SQL still sees enough unreserved
   * stock. This is an inline, serialized legacy adoption — never a blind
   * backfill — so two old requests cannot both consume the last unit. */
  const legacyLocations = [...new Set(sourceLocations.filter(Boolean))];
  const legacyMarks = legacyLocations.map(() => '?').join(',');
  const reservationGuard = transfers.map(() => `AND (
    EXISTS (
      SELECT 1 FROM inventory_request_reservations
       WHERE merchant = ? AND request_id = ? AND line_no = ? AND item_id = ?
         AND location_id = ? AND qty_milli >= ?
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM inventory_request_reservations
         WHERE merchant = ? AND request_id = ? AND line_no = ? AND item_id = ?
           AND location_id = ?
      )
      AND ? <= (
        (SELECT COALESCE(SUM(qty_milli), 0) FROM inventory_movements
          WHERE merchant = ? AND item_id = ? AND location_id IN (${legacyMarks}))
        - (SELECT COALESCE(SUM(qty_milli), 0)
             FROM inventory_request_reservations
            WHERE merchant = ? AND item_id = ? AND location_id IN (${legacyMarks})
              AND request_id <> ?)
      )
    )
  )`).join('\n');
  const sliceExpiry = (slice) => {
    const dates = (slice.allocations || []).map((entry) => Number(entry.expiresAt)).filter((n) => Number.isFinite(n) && n > 0);
    return dates.length ? Math.min(...dates) : null;
  };
  const movementCount = transfers.reduce((sum, transfer) => sum + transfer.allocation.pieces.length * 2, 0);
  let cursor;
  try { cursor = await reserveCursors(env, merchant, movementCount, now); }
  catch (_) { return json({ error: 'cursor-failed' }, 503); }
  const movements = [];
  const movementStatements = [];
  const hasCostRate = await inventoryHasColumn(env, 'unit_cost_rate');
  for (const transfer of transfers) {
    for (const [piece, slice] of transfer.allocation.pieces.entries()) for (const direction of ['out', 'in']) {
      const isOut = direction === 'out';
      const movement = {
        id: transferMovementId(merchant, transferRef, transfer.index, transfer.itemId, direction, piece),
        itemId: transfer.itemId,
        variantId: '',
        locationId: isOut ? sourceLocation : destinationLocation,
        qty: (isOut ? -1 : 1) * slice.qtyMilli / 1000,
        reason: isOut ? 'transfer-out' : 'transfer-in',
        unitCost: slice.unitCost,
        currency: 'MAD', refType: 'transfer', refId: transferRef,
        note: transfer.line.note || '', actor: context.actor.name,
        occurredTs: now, cursor: cursor++, reversalOf: '',
        meta: {
          requestId: id,
          line: transfer.index,
          reviewRevision: current.request.reviewRevision,
          allocationBreakdown: slice.allocations,
          /* Chaque lot arrive avec SA date : la plus proche du transfert
             entier donnait au second lot la péremption du premier. */
          ...(isOut || sliceExpiry(slice) == null
            ? {}
            : { expiresAt: sliceExpiry(slice) }),
        },
      };
      movements.push(movement);
      const columns = hasCostRate
        ? `(id, merchant, item_id, variant_id, location_id, qty_milli, reason,
             unit_cost_cents, unit_cost_rate, currency, ref_type, ref_id, note, actor, occurred_ts,
             srv_ts, reversal_of, meta, created_ts)`
        : `(id, merchant, item_id, variant_id, location_id, qty_milli, reason,
             unit_cost_cents, currency, ref_type, ref_id, note, actor, occurred_ts,
             srv_ts, reversal_of, meta, created_ts)`;
      const values = hasCostRate
        ? [movement.id, merchant, movement.itemId, movement.variantId, movement.locationId,
          Math.round(movement.qty * 1000), movement.reason, Math.round(movement.unitCost * 100),
          Math.round(movement.unitCost * 10000), movement.currency, movement.refType, movement.refId, movement.note,
          movement.actor, movement.occurredTs, movement.cursor, movement.reversalOf, JSON.stringify(movement.meta), now]
        : [movement.id, merchant, movement.itemId, movement.variantId, movement.locationId,
          Math.round(movement.qty * 1000), movement.reason, Math.round(movement.unitCost * 100), movement.currency,
          movement.refType, movement.refId, movement.note, movement.actor, movement.occurredTs, movement.cursor,
          movement.reversalOf, JSON.stringify(movement.meta), now];
      movementStatements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO inventory_movements ${columns}
         SELECT ${values.map(() => '?').join(', ')}
          WHERE EXISTS (
            SELECT 1 FROM ${REQUEST_TABLE}
             WHERE merchant = ? AND id = ? AND last_command_key = ?
          )`
      ).bind(...values, merchant, id, idempotencyKey));
    }
  }
  const updateRequest = env.DB.prepare(
    `UPDATE ${REQUEST_TABLE}
        SET state = ?, cancelled = ?, revision = ?, last_command_key = ?,
            review_revision = ?, accepted_revision = ?, fulfilment_method = ?, delivery_started_ts = ?,
            disputed = ?, updated_ts = ?, submitted_ts = ?, closed_ts = ?
      WHERE merchant = ? AND id = ? AND revision = ?
        ${reservationGuard}`
  ).bind(
    next.request.state, next.request.cancelled ? 1 : 0, next.request.revision, idempotencyKey,
    next.request.reviewRevision || 0, next.request.acceptedRevision || 0,
    next.request.fulfilmentMethod || 'pickup', next.request.deliveryStartedTs || null,
    next.request.disputed ? 1 : 0, now, next.request.submittedTs || null,
    next.request.closedTs || null, merchant, id, expectedRevision,
    ...transfers.flatMap((transfer) => [
      merchant, id, transfer.index, transfer.itemId, sourceLocation, transfer.deltaMilli,
      merchant, id, transfer.index, transfer.itemId, sourceLocation,
      transfer.deltaMilli, merchant, transfer.itemId, ...legacyLocations,
      merchant, transfer.itemId, ...legacyLocations, id,
    ]),
  );
  const statements = [updateRequest, ...movementStatements];
  next.lines.forEach((line, index) => statements.push(env.DB.prepare(
    `UPDATE ${LINE_TABLE} SET qty_received = ?
      WHERE merchant = ? AND request_id = ? AND line_no = ?
        AND EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                    WHERE merchant = ? AND id = ? AND last_command_key = ?)`
  ).bind(line.qtyReceived, merchant, id, index, merchant, id, idempotencyKey)));
  for (const transfer of transfers) {
    /* Materialise a legacy hold only after the request CAS has won. The
     * following decrement/delete consumes it in this same atomic batch; it is
     * never a free-standing reservation that can overbook stock. */
    statements.push(env.DB.prepare(
      `INSERT OR IGNORE INTO inventory_request_reservations
        (merchant, request_id, line_no, item_id, location_id, qty_milli, review_revision, created_ts)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                      WHERE merchant = ? AND id = ? AND last_command_key = ?)
          AND NOT EXISTS (
            SELECT 1 FROM inventory_request_reservations
             WHERE merchant = ? AND request_id = ? AND line_no = ? AND item_id = ?
               AND location_id = ?
          )`
    ).bind(
      merchant, id, transfer.index, transfer.itemId, sourceLocation, transfer.deltaMilli,
      current.request.reviewRevision, now, merchant, id, idempotencyKey,
      merchant, id, transfer.index, transfer.itemId, sourceLocation,
    ));
    statements.push(env.DB.prepare(
      `UPDATE inventory_request_reservations
          SET qty_milli = qty_milli - ?, review_revision = ?, created_ts = ?
        WHERE merchant = ? AND request_id = ? AND line_no = ? AND item_id = ?
          AND location_id = ? AND qty_milli >= ?
          AND EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                      WHERE merchant = ? AND id = ? AND last_command_key = ?)`
    ).bind(
      transfer.deltaMilli, current.request.reviewRevision, now,
      merchant, id, transfer.index, transfer.itemId, sourceLocation, transfer.deltaMilli,
      merchant, id, idempotencyKey,
    ));
  }
  statements.push(env.DB.prepare(
    `DELETE FROM inventory_request_reservations
      WHERE merchant = ? AND request_id = ? AND qty_milli <= 0
        AND EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                   WHERE merchant = ? AND id = ? AND last_command_key = ?)`
  ).bind(merchant, id, merchant, id, idempotencyKey));
  statements.push(env.DB.prepare(
    `INSERT OR IGNORE INTO ${EVENT_TABLE}
      (merchant, id, request_id, revision, event, idempotency_key, actor_id, actor_name, payload, ts)
     SELECT ?, ?, ?, revision, 'confirm', ?, ?, ?, ?, ? FROM ${REQUEST_TABLE}
      WHERE merchant = ? AND id = ? AND last_command_key = ?`
  ).bind(
    merchant, `evt:${idempotencyKey}`, id, idempotencyKey, context.actor.id, context.actor.name,
    JSON.stringify(body && body.data || {}), now, merchant, id, idempotencyKey,
  ));
  let results;
  try { results = await env.DB.batch(statements); }
  catch (_) { return json({ error: 'write-failed' }, 503); }
  const requestResult = results[0];
  if (!(Number(requestResult && requestResult.meta && requestResult.meta.changes) > 0)) {
    const replay = await replayFor(env, merchant, idempotencyKey);
    if (replay) return json({ ok: true, replayed: true, ...replay });
    const latest = await loadRequest(env, merchant, id);
    if (latest && latest.request.revision === expectedRevision) {
      return json({ error: 'reservation-required', action: 'review', revision: expectedRevision }, 409);
    }
    return json({ error: 'stale' }, 409);
  }
  const stored = await loadRequest(env, merchant, id);
  return json({ ok: true, transferRef, movements, ...stored });
}

return confirmCommand;
}
