import { catalogueItem, quantityToBase, snapshotForUnit } from './_economat-catalogue.js';
import { departmentAllowsItem } from './_department-catalogue.js';

export const REQUEST_STATES = Object.freeze(['draft', 'open', 'closed']);
export const REQUEST_ACTIONS = Object.freeze(['submit', 'review', 'accept', 'prepare', 'confirm', 'dispute', 'cancel']);
const RESOLUTIONS = new Set(['approved', 'reduced', 'refused', 'rejected']);

function token(value, max = 100) {
  const text = String(value == null ? '' : value).trim();
  return text && text.length <= max && /^[A-Za-z0-9._:-]+$/.test(text) ? text : '';
}

function quantity(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1e9 ? number : null;
}

function same(a, b) { return Math.abs(Number(a) - Number(b)) <= 1e-9; }

function baseQuantity(line, displayQuantity) {
  return quantityToBase(displayQuantity, line && line.conversionSnapshot);
}

function lineByItem(lines, itemId) {
  return (Array.isArray(lines) ? lines : []).find((line) => line && line.itemId === itemId) || null;
}

export function createRequestDraft(input, departmentCatalogue, economatCatalogue) {
  const id = token(input && input.id, 80);
  const unitId = token(input && input.unitId, 80);
  const sourceLines = Array.isArray(input && input.lines) ? input.lines : [];
  if (!id || !unitId || !sourceLines.length || sourceLines.length > 200) {
    return { ok: false, error: 'bad-request', status: 400 };
  }
  const lines = [];
  const seen = new Set();
  for (const source of sourceLines) {
    const itemId = token(source && source.itemId, 80);
    if (!itemId || seen.has(itemId)) return { ok: false, error: 'duplicate-or-bad-item', status: 422 };
    if (!departmentAllowsItem(departmentCatalogue, itemId, 'request')) {
      return { ok: false, error: `item-not-approved:${itemId}`, status: 422 };
    }
    const central = catalogueItem(economatCatalogue, itemId);
    const unit = String(source && source.unit || '').trim();
    const conversionSnapshot = snapshotForUnit(central, unit);
    const qtyRequested = quantity(source && source.qtyRequested);
    const qtyRequestedBase = conversionSnapshot && qtyRequested != null
      ? quantityToBase(qtyRequested, conversionSnapshot)
      : null;
    if (!central || !conversionSnapshot || qtyRequested == null || qtyRequested <= 0 || qtyRequestedBase == null) {
      return { ok: false, error: `bad-request-line:${itemId}`, status: 422 };
    }
    seen.add(itemId);
    lines.push({
      itemId, unit: conversionSnapshot.unit,
      conversionSnapshot: { ...conversionSnapshot },
      qtyRequestedBase, qtyRequested, qtyApproved: 0, qtyPrepared: 0, qtyReceived: 0,
      resolution: 'pending', substituteFor: '', note: String(source.note || '').trim().slice(0, 500),
    });
  }
  return { ok: true, value: { id, unitId, lines } };
}

function reviewLines(currentLines, updates) {
  const next = currentLines.map((line) => ({ ...line, conversionSnapshot: { ...line.conversionSnapshot } }));
  const provided = Array.isArray(updates) ? updates : [];
  if (!provided.length) return { error: 'review-lines-required', status: 422 };
  for (const update of provided) {
    const line = lineByItem(next, token(update && update.itemId, 80));
    const qtyApproved = quantity(update && update.qtyApproved);
    const resolution = String(update && update.resolution || '').trim();
    if (!line || qtyApproved == null || !RESOLUTIONS.has(resolution)) return { error: 'bad-review-line', status: 422 };
    if (token(update && update.substituteFor, 80)) return { error: 'substitution-v2', status: 422 };
    const approvedBase = baseQuantity(line, qtyApproved);
    if (approvedBase == null || approvedBase > line.qtyRequestedBase + 1e-9) {
      return { error: `approved-exceeds-requested:${line.itemId}`, status: 422 };
    }
    if (qtyApproved < line.qtyPrepared || qtyApproved < line.qtyReceived) {
      return { error: `approved-below-progress:${line.itemId}`, status: 422 };
    }
    const full = same(approvedBase, line.qtyRequestedBase);
    if ((qtyApproved === 0 && !['refused', 'rejected'].includes(resolution))
      || (qtyApproved > 0 && qtyApproved < line.qtyRequested && resolution !== 'reduced')
      || (full && resolution !== 'approved')) {
      return { error: `resolution-quantity-mismatch:${line.itemId}`, status: 422 };
    }
    line.qtyApproved = qtyApproved;
    line.resolution = resolution;
    line.substituteFor = '';
    line.note = String(update && update.note || line.note || '').trim().slice(0, 500);
  }
  return { value: next };
}

function progressLines(currentLines, updates, field, ceilingField) {
  const next = currentLines.map((line) => ({ ...line, conversionSnapshot: { ...line.conversionSnapshot } }));
  const provided = Array.isArray(updates) ? updates : [];
  if (!provided.length) return { error: `${field}-lines-required`, status: 422 };
  for (const update of provided) {
    const line = lineByItem(next, token(update && update.itemId, 80));
    const value = quantity(update && update[field]);
    if (!line || value == null || value + 1e-9 < line[field] || value > line[ceilingField] + 1e-9) {
      return { error: `bad-${field}:${line ? line.itemId : ''}`, status: 422 };
    }
    if (baseQuantity(line, value) == null) return { error: `precision-loss:${line.itemId}`, status: 422 };
    line[field] = value;
  }
  return { value: next };
}

export function applyRequestCommand(current, actionValue, payload = {}) {
  const request = { ...(current && current.request) };
  let lines = (Array.isArray(current && current.lines) ? current.lines : [])
    .map((line) => ({ ...line, conversionSnapshot: { ...line.conversionSnapshot } }));
  const action = String(actionValue || '').trim();
  if (!REQUEST_ACTIONS.includes(action) || !REQUEST_STATES.includes(request.state)) {
    return { ok: false, error: 'bad-action', status: 400 };
  }
  if (request.cancelled) return { ok: false, error: 'request-cancelled', status: 409 };

  if (action === 'submit') {
    if (request.state !== 'draft') return { ok: false, error: 'not-draft', status: 409 };
    request.state = 'open';
    request.submittedTs = Number(payload.now) || Date.now();
  } else if (action === 'review') {
    if (request.state !== 'open') {
      return { ok: false, error: 'review-locked', status: 409 };
    }
    const checked = reviewLines(lines, payload.lines);
    if (!checked.value) return { ok: false, error: checked.error, status: checked.status };
    lines = checked.value;
    request.reviewRevision = Number(request.revision) + 1;
  } else if (action === 'accept') {
    if (request.state !== 'open' || !request.reviewRevision
      || Number(request.acceptedRevision) >= Number(request.reviewRevision)) {
      return { ok: false, error: 'nothing-to-accept', status: 409 };
    }
    request.acceptedRevision = Number(request.reviewRevision);
  } else if (action === 'prepare') {
    if (request.state !== 'open' || !request.reviewRevision) return { ok: false, error: 'not-approved', status: 409 };
    if (lines.some((line) => !line.resolution || line.resolution === 'pending')) {
      return { ok: false, error: 'review-incomplete', status: 409 };
    }
    const changed = lines.some((line) => !same(baseQuantity(line, line.qtyApproved), line.qtyRequestedBase));
    if (changed && Number(request.acceptedRevision) < Number(request.reviewRevision)) {
      return { ok: false, error: 'changes-not-accepted', status: 409 };
    }
    const checked = progressLines(lines, payload.lines, 'qtyPrepared', 'qtyApproved');
    if (!checked.value) return { ok: false, error: checked.error, status: checked.status };
    lines = checked.value;
    if (payload.fulfilmentMethod != null) {
      const method = String(payload.fulfilmentMethod || '').trim();
      if (!['pickup', 'delivery'].includes(method)) return { ok: false, error: 'bad-fulfilment-method', status: 422 };
      request.fulfilmentMethod = method;
    }
    if (payload.handover && request.fulfilmentMethod === 'delivery' && !request.deliveryStartedTs) {
      request.deliveryStartedTs = Number(payload.now) || Date.now();
    }
  } else if (action === 'confirm') {
    if (request.state !== 'open' || !request.reviewRevision) return { ok: false, error: 'not-approved', status: 409 };
    const changed = lines.some((line) => !same(baseQuantity(line, line.qtyApproved), line.qtyRequestedBase));
    if (changed && Number(request.acceptedRevision) < Number(request.reviewRevision)) {
      return { ok: false, error: 'changes-not-accepted', status: 409 };
    }
    const checked = progressLines(lines, payload.lines, 'qtyReceived', 'qtyPrepared');
    if (!checked.value) return { ok: false, error: checked.error, status: checked.status };
    lines = checked.value;
    const approved = lines.filter((line) => Number(line.qtyApproved) > 0);
    if (approved.length && approved.every((line) => same(line.qtyReceived, line.qtyApproved))) {
      request.state = 'closed';
      request.closedTs = Number(payload.now) || Date.now();
    }
  } else if (action === 'dispute') {
    if (!['open', 'closed'].includes(request.state)) return { ok: false, error: 'not-disputable', status: 409 };
    request.disputed = true;
  } else if (action === 'cancel') {
    request.cancelled = true;
    request.state = 'closed';
    request.closedTs = Number(payload.now) || Date.now();
  }
  request.revision = Number(request.revision) + 1;
  return { ok: true, value: { request, lines } };
}

export function deriveRequestLabel(requestValue, linesValue) {
  const request = requestValue || {};
  const lines = Array.isArray(linesValue) ? linesValue : [];
  if (request.cancelled) return 'cancelled';
  if (request.disputed) return 'disputed';
  if (request.state === 'draft') return 'draft';
  const allRefused = lines.length && lines.every((line) => Number(line.qtyApproved) === 0
    && ['refused', 'rejected'].includes(line.resolution));
  if (allRefused) return 'rejected';
  if (request.state === 'closed') return 'received';
  if (!lines.length) return 'submitted';
  const reviewed = lines.filter((line) => line.resolution && line.resolution !== 'pending');
  if (!reviewed.length) return 'submitted';
  if (reviewed.length !== lines.length) return 'under-review';
  const changed = lines.some((line) => !same(baseQuantity(line, line.qtyApproved), line.qtyRequestedBase));
  if (changed && Number(request.acceptedRevision) < Number(request.reviewRevision)) return 'changes-proposed';
  const anyReceived = lines.some((line) => Number(line.qtyReceived) > 0);
  const allReceived = lines.every((line) => same(line.qtyReceived, line.qtyPrepared));
  if (anyReceived && !allReceived) return 'partially-received';
  if (request.deliveryStartedTs) return 'out-for-delivery';
  const anyPrepared = lines.some((line) => Number(line.qtyPrepared) > 0);
  const allPrepared = lines.every((line) => same(line.qtyPrepared, line.qtyApproved));
  if (allPrepared && lines.some((line) => Number(line.qtyApproved) > 0)) return 'ready';
  if (anyPrepared) return 'preparing';
  return 'approved';
}

export function requestToken(value, max = 100) { return token(value, max); }
