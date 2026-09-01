const RECEIPT_REASONS = new Set(['receipt', 'supplier-return', 'return', 'production-output']);
const CONSUMPTION_REASONS = new Set([
  'sale', 'sale-reversal', 'production-input', 'loss', 'expiry', 'gift', 'staff-meal',
]);
const CORRECTION_REASONS = new Set(['count', 'manual']);

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function token(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, 100) : fallback;
}

function movement(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const directMilli = raw.qty_milli ?? raw.qtyMilli;
  const qtyMilli = directMilli == null
    ? Math.round((Number(raw.qty) || 0) * 1000)
    : integer(directMilli);
  return {
    id: token(raw.id),
    itemId: token(raw.item_id ?? raw.itemId),
    variantId: token(raw.variant_id ?? raw.variantId),
    locationId: token(raw.location_id ?? raw.locationId, 'principal'),
    reason: token(raw.reason),
    qtyMilli,
    occurredTs: integer(raw.occurred_ts ?? raw.occurredTs),
  };
}

function blankReconciliation(locationId) {
  return {
    locationId,
    openingMilli: 0,
    receiptsMilli: 0,
    transfersInMilli: 0,
    transfersOutMilli: 0,
    consumptionMilli: 0,
    correctionsMilli: 0,
    unclassifiedMilli: 0,
    computedClosingMilli: 0,
    closingMilli: 0,
    differenceMilli: 0,
    balanced: true,
  };
}

export function reconcileUnitMovements(rowsValue, locationIdValue) {
  const locationId = token(locationIdValue, 'principal');
  const summary = blankReconciliation(locationId);
  const rows = (Array.isArray(rowsValue) ? rowsValue : []).map(movement)
    .filter((row) => row.locationId === locationId && row.itemId && row.qtyMilli);
  for (const row of rows) {
    summary.closingMilli += row.qtyMilli;
    if (row.reason === 'opening') summary.openingMilli += row.qtyMilli;
    else if (RECEIPT_REASONS.has(row.reason)) summary.receiptsMilli += row.qtyMilli;
    else if (row.reason === 'transfer-in' && row.qtyMilli > 0) summary.transfersInMilli += row.qtyMilli;
    else if (row.reason === 'transfer-out' && row.qtyMilli < 0) summary.transfersOutMilli += Math.abs(row.qtyMilli);
    else if (CONSUMPTION_REASONS.has(row.reason)) summary.consumptionMilli += -row.qtyMilli;
    else if (CORRECTION_REASONS.has(row.reason)) summary.correctionsMilli += row.qtyMilli;
    else summary.unclassifiedMilli += row.qtyMilli;
  }
  summary.computedClosingMilli = summary.openingMilli
    + summary.receiptsMilli
    + summary.transfersInMilli
    - summary.transfersOutMilli
    - summary.consumptionMilli
    + summary.correctionsMilli;
  summary.differenceMilli = summary.closingMilli - summary.computedClosingMilli;
  summary.balanced = summary.differenceMilli === 0 && summary.unclassifiedMilli === 0;
  return summary;
}

function itemBalances(rows) {
  const items = new Map();
  for (const row of rows) {
    const key = `${row.itemId}|${row.variantId}`;
    items.set(key, (items.get(key) || 0) + row.qtyMilli);
  }
  return [...items.entries()].map(([key, closingMilli]) => {
    const [itemId, variantId] = key.split('|');
    return { itemId, variantId, closingMilli };
  }).sort((a, b) => a.itemId.localeCompare(b.itemId) || a.variantId.localeCompare(b.variantId));
}

export function buildHotelInventoryReport(inputValue = {}) {
  const input = inputValue && typeof inputValue === 'object' ? inputValue : {};
  const at = integer(input.at) || Number.MAX_SAFE_INTEGER;
  const rows = (Array.isArray(input.movements) ? input.movements : []).map(movement)
    .filter((row) => row.itemId && row.qtyMilli && (!row.occurredTs || row.occurredTs <= at));
  const locations = [...new Set(rows.map((row) => row.locationId))].sort();
  const units = locations.map((locationId) => {
    const unitRows = rows.filter((row) => row.locationId === locationId);
    return {
      locationId,
      items: itemBalances(unitRows),
      reconciliation: reconcileUnitMovements(unitRows, locationId),
    };
  });
  const counts = (Array.isArray(input.physicalCounts) ? input.physicalCounts : []).filter((count) => {
    const submittedAt = integer(count && (count.submitted_at ?? count.submittedAt));
    return !submittedAt || submittedAt <= at;
  });
  return {
    asOf: at,
    consolidated: {
      items: itemBalances(rows),
      closingMilli: rows.reduce((sum, row) => sum + row.qtyMilli, 0),
    },
    units,
    physicalCounts: {
      observed: counts.length,
      applied: counts.filter((count) => String(count && count.status) === 'applied').length,
    },
  };
}

export async function queryHotelInventoryReport(db, merchantValue, optionsValue = {}) {
  const merchant = token(merchantValue);
  const at = integer(optionsValue && optionsValue.at) || Date.now();
  if (!db || typeof db.prepare !== 'function' || !merchant) throw new Error('invalid-hotel-report-query');
  const movementResult = await db.prepare(
    `SELECT id, item_id, variant_id, location_id, qty_milli, reason, occurred_ts
       FROM inventory_movements
      WHERE merchant = ? AND occurred_ts <= ?
      ORDER BY occurred_ts, srv_ts, id`
  ).bind(merchant, at).all();
  let physicalCounts = [];
  try {
    const countResult = await db.prepare(
      `SELECT id, store_id, status, submitted_at, applied_at
         FROM inventory_counts
        WHERE merchant = ? AND submitted_at <= ?
        ORDER BY submitted_at, id`
    ).bind(merchant, at).all();
    physicalCounts = (countResult && countResult.results) || [];
  } catch (_) {
    physicalCounts = [];
  }
  return buildHotelInventoryReport({
    movements: (movementResult && movementResult.results) || [],
    physicalCounts,
    at,
  });
}
