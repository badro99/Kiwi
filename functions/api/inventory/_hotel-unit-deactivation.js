function active(value) { return !value || value.active !== false; }

function deactivatedUnits(previousValue, nextValue) {
  const previous = Array.isArray(previousValue && previousValue.units) ? previousValue.units : [];
  const next = Array.isArray(nextValue && nextValue.units) ? nextValue.units : [];
  const byId = new Map(previous.filter(Boolean).map((unit) => [unit.id, unit]));
  return next.filter((unit) => {
    const before = unit && byId.get(unit.id);
    return before && active(before) && unit.active === false;
  });
}

export async function hotelUnitDeactivationBlockers(db, merchant, previous, next) {
  const units = deactivatedUnits(previous, next);
  if (!units.length) return { ok: true, blockers: [] };
  if (!db || typeof db.prepare !== 'function') throw new Error('inventory-db-required');
  const sql = [
    'SELECT',
    '(SELECT COALESCE(SUM(qty_milli), 0) FROM inventory_movements',
    ' WHERE merchant = ? AND location_id = ?) AS on_hand_milli,',
    '(SELECT COUNT(*) FROM hotel_internal_requests',
    " WHERE merchant = ? AND unit_id = ? AND state = 'open' AND cancelled = 0) AS open_requests,",
    '(SELECT COUNT(*) FROM hotel_internal_request_lines l',
    ' JOIN hotel_internal_requests r ON r.merchant = l.merchant AND r.id = l.request_id',
    " WHERE r.merchant = ? AND r.unit_id = ? AND r.state = 'open' AND r.cancelled = 0",
    ' AND l.qty_approved > l.qty_received) AS reserved_lines,',
    '(SELECT COUNT(*) FROM hotel_internal_request_lines l',
    ' JOIN hotel_internal_requests r ON r.merchant = l.merchant AND r.id = l.request_id',
    " WHERE r.merchant = ? AND r.unit_id = ? AND r.state = 'open' AND r.cancelled = 0",
    ' AND l.qty_prepared > l.qty_received) AS in_transit_lines',
  ].join(' ');
  const blockers = [];
  for (const unit of units) {
    const row = await db.prepare(sql).bind(
      merchant, unit.locationId,
      merchant, unit.id,
      merchant, unit.id,
      merchant, unit.id,
    ).first();
    const detail = {
      unitId: unit.id,
      locationId: unit.locationId,
      onHandMilli: Number(row && row.on_hand_milli) || 0,
      openRequests: Number(row && row.open_requests) || 0,
      reservedLines: Number(row && row.reserved_lines) || 0,
      inTransitLines: Number(row && row.in_transit_lines) || 0,
    };
    if (detail.onHandMilli !== 0 || detail.openRequests || detail.reservedLines || detail.inTransitLines) {
      blockers.push(detail);
    }
  }
  return blockers.length
    ? { ok: false, error: 'hotel-unit-not-drained', status: 409, blockers }
    : { ok: true, blockers: [] };
}
