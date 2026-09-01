const TOKEN = /^[A-Za-z0-9._:-]+$/;

function token(value, max = 100) {
  const text = String(value == null ? '' : value).trim();
  return text && text.length <= max && TOKEN.test(text) ? text : '';
}

function text(value, max = 120) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function positiveCents(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100000000000 ? amount : 0;
}

function timestamp(value) {
  const at = Number(value);
  return Number.isSafeInteger(at) && at > 0 ? at : 0;
}

function sourceLines(value) {
  return Array.isArray(value) ? value : [];
}

export function roomChargeId(saleIdValue) {
  const saleId = token(saleIdValue, 64);
  return saleId ? `folio-charge:${saleId}` : '';
}

export function roomChargeReversalId(saleIdValue) {
  const saleId = token(saleIdValue, 64);
  return saleId ? `folio-charge-reversal:${saleId}` : '';
}

export function appendRoomCharge(linesValue, inputValue) {
  const lines = sourceLines(linesValue);
  const input = inputValue && typeof inputValue === 'object' ? inputValue : {};
  const saleId = token(input.saleId, 64);
  const outletId = token(input.outletId, 80);
  const shiftId = token(input.shiftId, 80);
  const cashierId = token(input.cashierId, 80);
  const amountCents = positiveCents(input.amountCents);
  const occurredTs = timestamp(input.occurredTs);
  if (!saleId || !outletId || !shiftId || !cashierId || !amountCents || !occurredTs) {
    return { ok: false, error: 'invalid-room-charge', lines };
  }
  const id = roomChargeId(saleId);
  const existing = lines.find((line) => line && line.id === id) || null;
  if (existing) return { ok: true, created: false, line: existing, lines };
  const line = {
    id,
    kind: 'room-charge',
    saleId,
    outletId,
    shiftId,
    cashierId,
    cashierName: text(input.cashierName, 100),
    amountCents,
    occurredTs,
  };
  return { ok: true, created: true, line, lines: [...lines, line] };
}

export function reverseRoomCharge(linesValue, saleIdValue, inputValue = {}) {
  const lines = sourceLines(linesValue);
  const saleId = token(saleIdValue, 64);
  const originalId = roomChargeId(saleId);
  const original = originalId
    ? lines.find((line) => line && line.id === originalId && line.kind === 'room-charge') || null
    : null;
  if (!original) return { ok: false, error: 'room-charge-not-found', created: false, lines };
  const id = roomChargeReversalId(saleId);
  const existing = lines.find((line) => line && line.id === id) || null;
  if (existing) return { ok: true, created: false, line: existing, lines };
  const occurredTs = timestamp(inputValue.occurredTs);
  if (!occurredTs) return { ok: false, error: 'invalid-reversal-time', created: false, lines };
  const line = {
    id,
    kind: 'room-charge-reversal',
    saleId,
    outletId: original.outletId,
    shiftId: original.shiftId,
    cashierId: original.cashierId,
    cashierName: original.cashierName || '',
    amountCents: -positiveCents(original.amountCents),
    occurredTs,
    reversalOf: original.id,
    reversedById: token(inputValue.actorId, 80),
  };
  return { ok: true, created: true, line, lines: [...lines, line] };
}

export function roomChargesByCashier(linesValue, optionsValue = {}) {
  const options = optionsValue && typeof optionsValue === 'object' ? optionsValue : {};
  const shiftId = token(options.shiftId, 80);
  const since = timestamp(options.since);
  const until = timestamp(options.until) || Number.MAX_SAFE_INTEGER;
  const rows = sourceLines(linesValue).filter((line) => {
    if (!line || !['room-charge', 'room-charge-reversal'].includes(line.kind)) return false;
    if (shiftId) return line.shiftId === shiftId;
    const at = timestamp(line.occurredTs);
    return at >= since && at <= until;
  });
  const grouped = new Map();
  let chargesCents = 0;
  let reversalsCents = 0;
  let netCents = 0;
  for (const line of rows) {
    const cashierId = token(line.cashierId, 80) || 'unattributed';
    const current = grouped.get(cashierId) || {
      cashierId,
      cashierName: text(line.cashierName, 100),
      chargeCount: 0,
      reversalCount: 0,
      chargesCents: 0,
      reversalsCents: 0,
      netCents: 0,
    };
    const amount = Number.isSafeInteger(Number(line.amountCents)) ? Number(line.amountCents) : 0;
    if (line.kind === 'room-charge') {
      current.chargeCount += 1;
      current.chargesCents += amount;
      chargesCents += amount;
    } else {
      const reversed = Math.abs(amount);
      current.reversalCount += 1;
      current.reversalsCents += reversed;
      reversalsCents += reversed;
    }
    current.netCents += amount;
    netCents += amount;
    grouped.set(cashierId, current);
  }
  return {
    shiftId,
    cashiers: [...grouped.values()].sort((a, b) => a.cashierId.localeCompare(b.cashierId)),
    totals: {
      lineCount: rows.length,
      chargeCount: rows.filter((line) => line.kind === 'room-charge').length,
      reversalCount: rows.filter((line) => line.kind === 'room-charge-reversal').length,
      chargesCents,
      reversalsCents,
      netCents,
    },
  };
}
