import { approvedBaseMilli, buildReviewAtpGuard } from './internal-requests/_review.js';
export { buildReviewAtpGuard } from './internal-requests/_review.js';
import { createHandover } from './internal-requests/_handover.js';
import { substitution } from './internal-requests/_substitution.js';
import { releaseReservations } from './internal-requests/_cancellation.js';
import { reserveReview } from './internal-requests/_reservation.js';
import { json } from '../../auth/_lib.js';
import { resolveHotelActor } from './_hotel-actor.js';
import { departmentCatalogueFeature } from './_department-catalogue.js';
import { ECONOMAT_CATALOGUE_FEATURE } from './_economat-catalogue.js';
import { catalogueItem, quantityToBase, snapshotForUnit } from './_economat-catalogue.js';
import {
  applyRequestCommand, createRequestDraft, deriveRequestLabel,
  fulfilmentConversionSnapshot, fulfilmentItemId, requestToken,
} from './_internal-request.js';

const REQUEST_TABLE = 'hotel_internal_requests';
const LINE_TABLE = 'hotel_internal_request_lines';
const EVENT_TABLE = 'hotel_internal_request_events';
const confirmCommand = createHandover({ mayConfirm, json, nowFor, applyRequestCommand, approvedBaseMilli, fulfilmentItemId, sourceRows, allocateTransferAllocation, reserveCursors, inventoryHasColumn, transferMovementId, REQUEST_TABLE, LINE_TABLE, EVENT_TABLE, replayFor, loadRequest });

function nowFor(env) {
  return env && typeof env.NOW === 'function' ? Number(env.NOW()) || Date.now() : Date.now();
}

function hash(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function transferMovementId(merchant, refId, lineNo, itemId, direction, piece = 0) {
  // La première tranche garde l'identifiant historique ; les suivantes sont suffixées.
  const leg = piece ? `${direction}:${piece}` : direction;
  return `inv-transfer-${hash([merchant, refId, lineNo, itemId, leg].join('|'))}`;
}

function parseMeta(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
}

export function allocateTransferAllocation(rowsValue, requestedMilli) {
  const requested = Math.max(0, Number(requestedMilli) || 0);
  if (!requested) return null;
  const rows = (Array.isArray(rowsValue) ? rowsValue : []).slice().sort((a, b) =>
    Number(a.occurred_ts || 0) - Number(b.occurred_ts || 0)
      || Number(a.srv_ts || 0) - Number(b.srv_ts || 0));
  const lots = [];
  const sortedLots = () => lots.filter((lot) => lot.remaining > 0).sort((a, b) =>
    Number(a.expiresAt || Number.MAX_SAFE_INTEGER) - Number(b.expiresAt || Number.MAX_SAFE_INTEGER)
      || Number(a.ts) - Number(b.ts));
  for (const row of rows) {
    const qty = Number(row.qty_milli || 0);
    if (!qty) continue;
    if (qty > 0) {
      const meta = parseMeta(row.meta);
      const expiresAt = meta.expiresAt == null ? null : Number(meta.expiresAt);
      lots.push({
        movementId: String(row.id || ''),
        remaining: qty,
        cost: row.unit_cost_rate != null
          ? Number(row.unit_cost_rate) / 10000
          : (row.unit_cost_cents == null ? null : Number(row.unit_cost_cents) / 100),
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
        batchNum: String(meta.batchNum || ''),
        supplierName: String(meta.supplierName || ''),
        ts: Number(row.occurred_ts || 0),
      });
      continue;
    }
    let depletion = Math.abs(qty);
    for (const lot of sortedLots()) {
      if (!depletion) break;
      const take = Math.min(lot.remaining, depletion);
      lot.remaining -= take;
      depletion -= take;
    }
  }
  let remaining = requested;
  let value = 0;
  const allocations = [];
  for (const lot of sortedLots()) {
    if (!remaining) break;
    const take = Math.min(lot.remaining, remaining);
    if (lot.cost == null) return null;
    value += take * lot.cost;
    allocations.push({
      sourceMovementId: lot.movementId,
      qtyMilli: take,
      unitCost: lot.cost,
      expiresAt: lot.expiresAt,
      batchNum: lot.batchNum,
      supplierName: lot.supplierName,
    });
    remaining -= take;
  }
  if (remaining > 0) return null;
  const expiries = allocations.map((entry) => entry.expiresAt).filter(Number.isFinite);
  /* Un seul taux moyen arrondi à quatre décimales ne peut pas porter la valeur
   * exacte d'un gros transfert : 1 bouteille à 0,01 + 150 à 0,02 = 3,01 MAD,
   * mais 0,0199 × 151 = 3,00. On écrit donc une tranche par taux de lot
   * source (lots consécutifs de même taux regroupés) : chaque tranche garde le
   * taux gelé du lot, et la somme des tranches vaut exactement ce qui sort. */
  const pieces = [];
  for (const entry of allocations) {
    const last = pieces[pieces.length - 1];
    if (last && last.unitCost === entry.unitCost) {
      last.qtyMilli += entry.qtyMilli;
      last.allocations.push(entry);
    } else {
      pieces.push({ qtyMilli: entry.qtyMilli, unitCost: entry.unitCost, allocations: [entry] });
    }
  }
  return {
    unitCost: Math.round((value / requested) * 10000) / 10000,
    allocations,
    pieces,
    expiresAt: expiries.length ? Math.min(...expiries) : null,
  };
}

export function allocateTransferCost(rowsValue, requestedMilli) {
  const allocation = allocateTransferAllocation(rowsValue, requestedMilli);
  return allocation ? allocation.unitCost : null;
}

async function ensureSchema(env) {
  // Schema owned by migrations 0001–0010.
}

function parse(raw, fallback) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' ? value : fallback;
  } catch (_) { return fallback; }
}

async function readDoc(env, merchant, feature, fallback) {
  const row = await env.DB.prepare(
    'SELECT data FROM store_docs WHERE merchant = ? AND feature = ? LIMIT 1'
  ).bind(merchant, feature).first();
  return parse(row && row.data, fallback);
}

async function requestContext(request, env, merchant, unitId) {
  const actor = await resolveHotelActor(request, env, merchant);
  if (!actor) return { error: 'employee-required', status: 403 };
  let registry;
  try { registry = await readDoc(env, merchant, 'hotel-units', { units: [] }); }
  catch (_) { return { error: 'unmigrated', status: 503 }; }
  const unit = (Array.isArray(registry.units) ? registry.units : [])
    .find((entry) => entry && entry.id === unitId) || null;
  if (!unit) return { error: 'unit-not-found', status: 404 };
  const economat = (Array.isArray(registry.units) ? registry.units : [])
    .find((entry) => entry && entry.kind === 'economat' && entry.active !== false) || null;
  if (!actor.canReadUnit(unit) && !(economat && actor.canReadUnit(economat))) {
    return { error: 'unit-forbidden', status: 403 };
  }
  return { actor, unit, economat, registry };
}

function rowRequest(row) {
  return {
    id: row.id, unitId: row.unit_id, state: row.state, cancelled: Boolean(row.cancelled),
    revision: Number(row.revision), requesterId: row.requester_id, requesterName: row.requester_name,
    reviewRevision: Number(row.review_revision) || 0, acceptedRevision: Number(row.accepted_revision) || 0,
    fulfilmentMethod: row.fulfilment_method || 'pickup', deliveryStartedTs: Number(row.delivery_started_ts) || 0,
    disputed: Boolean(row.disputed), createdTs: Number(row.created_ts) || 0,
    updatedTs: Number(row.updated_ts) || 0, submittedTs: Number(row.submitted_ts) || 0,
    closedTs: Number(row.closed_ts) || 0,
  };
}

function rowLine(row) {
  return {
    itemId: row.item_id, unit: row.unit, conversionSnapshot: parse(row.conversion_snapshot, {}),
    qtyRequestedBase: Number(row.qty_requested_base_milli) / 1000,
    qtyRequested: Number(row.qty_requested), qtyApproved: Number(row.qty_approved),
    qtyPrepared: Number(row.qty_prepared), qtyReceived: Number(row.qty_received),
    resolution: row.resolution, substituteFor: row.substitute_for || '',
    substituteUnit: row.substitute_unit || '',
    substituteConversionSnapshot: parse(row.substitute_conversion_snapshot, {}),
    substituteReason: row.substitute_reason || '', note: row.note || '',
  };
}

async function loadRequest(env, merchant, idOrKey, byCreateKey = false) {
  const column = byCreateKey ? 'create_key' : 'id';
  const row = await env.DB.prepare(
    `SELECT * FROM ${REQUEST_TABLE} WHERE merchant = ? AND ${column} = ? LIMIT 1`
  ).bind(merchant, idOrKey).first();
  if (!row) return null;
  const lineRows = await env.DB.prepare(
    `SELECT * FROM ${LINE_TABLE} WHERE merchant = ? AND request_id = ? ORDER BY line_no`
  ).bind(merchant, row.id).all();
  const request = rowRequest(row);
  const lines = ((lineRows && lineRows.results) || []).map(rowLine);
  return { request, lines, label: deriveRequestLabel(request, lines) };
}

async function replayFor(env, merchant, idempotencyKey) {
  const row = await env.DB.prepare(
    `SELECT request_id FROM ${EVENT_TABLE} WHERE merchant = ? AND idempotency_key = ? LIMIT 1`
  ).bind(merchant, idempotencyKey).first();
  return row && row.request_id ? loadRequest(env, merchant, row.request_id) : null;
}

function lineInsert(env, merchant, requestId, createKey, line, lineNo) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO ${LINE_TABLE}
      (merchant, request_id, line_no, item_id, unit, conversion_snapshot,
       qty_requested_base_milli, qty_requested, qty_approved, qty_prepared,
       qty_received, resolution, substitute_for, substitute_unit,
       substitute_conversion_snapshot, substitute_reason, note)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                     WHERE merchant = ? AND id = ? AND create_key = ?)`
  ).bind(
    merchant, requestId, lineNo, line.itemId, line.unit, JSON.stringify(line.conversionSnapshot),
    Math.round(line.qtyRequestedBase * 1000), line.qtyRequested, line.qtyApproved,
    line.qtyPrepared, line.qtyReceived, line.resolution, line.substituteFor,
    line.substituteUnit, JSON.stringify(line.substituteConversionSnapshot || {}),
    line.substituteReason, line.note,
    merchant, requestId, createKey,
  );
}

async function createDraft(request, env, body, merchant, idempotencyKey) {
  const unitId = requestToken(body && body.unitId, 80);
  const context = await requestContext(request, env, merchant, unitId);
  if (context.error) return json({ error: context.error }, context.status);
  if (!context.actor.canReadUnit(context.unit)) return json({ error: 'unit-forbidden' }, 403);
  if (context.unit.active === false) return json({ error: 'unit-inactive' }, 409);
  let department;
  let central;
  try {
    department = await readDoc(env, merchant, departmentCatalogueFeature(unitId), { unitId, items: [] });
    central = await readDoc(env, merchant, ECONOMAT_CATALOGUE_FEATURE, { items: [] });
  } catch (_) { return json({ error: 'unmigrated' }, 503); }
  const checked = createRequestDraft(body, department, central);
  if (!checked.ok) return json({ error: checked.error }, checked.status || 422);
  const now = nowFor(env);
  const value = checked.value;
  const statements = [env.DB.prepare(
    `INSERT OR IGNORE INTO ${REQUEST_TABLE}
      (merchant, id, unit_id, state, cancelled, revision, create_key, last_command_key,
       requester_id, requester_name, created_ts, updated_ts)
     VALUES (?, ?, ?, 'draft', 0, 1, ?, ?, ?, ?, ?, ?)`
  ).bind(
    merchant, value.id, unitId, idempotencyKey, idempotencyKey,
    context.actor.id, context.actor.name, now, now,
  )];
  value.lines.forEach((line, index) => statements.push(lineInsert(env, merchant, value.id, idempotencyKey, line, index)));
  statements.push(env.DB.prepare(
    `INSERT OR IGNORE INTO ${EVENT_TABLE}
      (merchant, id, request_id, revision, event, idempotency_key, actor_id, actor_name, payload, ts)
     SELECT ?, ?, id, revision, 'created', ?, ?, ?, '{}', ?
       FROM ${REQUEST_TABLE} WHERE merchant = ? AND create_key = ?`
  ).bind(
    merchant, `evt:${idempotencyKey}`, idempotencyKey, context.actor.id, context.actor.name,
    now, merchant, idempotencyKey,
  ));
  try { await env.DB.batch(statements); }
  catch (_) { return json({ error: 'write-failed' }, 503); }
  const stored = await loadRequest(env, merchant, idempotencyKey, true);
  return stored ? json({ ok: true, ...stored }) : json({ error: 'write-failed' }, 503);
}

function mayRun(actor, unit, economat, requestRecord, action) {
  const managesDestination = actor.canManageUnit(unit);
  const managesEconomat = economat ? actor.canManageUnit(economat) : false;
  if (action === 'review' || action === 'prepare') return managesEconomat;
  if (action === 'accept' || action === 'submit') return actor.id === requestRecord.requesterId || managesDestination;
  if (action === 'cancel') return managesDestination || managesEconomat || actor.id === requestRecord.requesterId;
  if (action === 'dispute') return actor.canReadUnit(unit) || (economat && actor.canReadUnit(economat));
  return actor.id === requestRecord.requesterId || managesDestination || managesEconomat;
}

async function sourceRows(env, merchant, itemId, locations) {
  const ids = [...new Set((locations || []).filter(Boolean))];
  if (!ids.length) return [];
  const query = `FROM inventory_movements
      WHERE merchant = ? AND item_id = ? AND location_id IN (${ids.map(() => '?').join(',')})
      ORDER BY occurred_ts, srv_ts`;
  try {
    const result = await env.DB.prepare(
      `SELECT id, qty_milli, reason, unit_cost_cents, unit_cost_rate, occurred_ts, srv_ts, meta ${query}`
    ).bind(merchant, itemId, ...ids).all();
    return (result && result.results) || [];
  } catch (_) {
    /* Pre-rate fixtures and an unrolled deployment remain readable. The
     * migration is still required for precise lots; old rows use cents. */
    const result = await env.DB.prepare(
      `SELECT id, qty_milli, reason, unit_cost_cents, occurred_ts, srv_ts, meta ${query}`
    ).bind(merchant, itemId, ...ids).all();
    return (result && result.results) || [];
  }
}

async function inventoryHasColumn(env, column) {
  try {
    const result = await env.DB.prepare('PRAGMA table_info(inventory_movements)').all();
    const rows = (result && result.results) || [];
    // An adapter that cannot expose PRAGMA is assumed to be the current D1
    // schema. Real SQLite/D1 reports its columns and selects the legacy path
    // below when an older deployment is still serving traffic.
    return rows.length ? rows.some((row) => String(row.name || '') === column) : true;
  } catch (_) { return true; }
}

async function reserveCursors(env, merchant, count, now) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO inventory_sync_sequences (merchant, last_ts) VALUES (?, ?)'
  ).bind(merchant, now).run();
  const row = await env.DB.prepare(
    'UPDATE inventory_sync_sequences SET last_ts = last_ts + ? WHERE merchant = ? RETURNING last_ts AS value'
  ).bind(count, merchant).first();
  const end = Number(row && row.value);
  if (!Number.isSafeInteger(end)) throw new Error('cursor-reservation-failed');
  return end - count + 1;
}

function confirmationSide(registry) {
  const raw = String(registry && (registry.confirmationSide || registry.transferConfirmation) || 'recipient').trim();
  return raw === 'economat' ? 'economat' : 'recipient';
}

function mayConfirm(context, requestRecord) {
  const side = confirmationSide(context.registry);
  if (side === 'economat') return !!context.economat && context.actor.canManageUnit(context.economat);
  return context.actor.id === requestRecord.requesterId || context.actor.canManageUnit(context.unit);
}

async function command(request, env, body, merchant, action, idempotencyKey) {
  const id = requestToken(body && body.id, 80);
  let current;
  try { current = await loadRequest(env, merchant, id); }
  catch (_) { return json({ error: 'db' }, 503); }
  if (!current) return json({ error: 'not-found' }, 404);
  const context = await requestContext(request, env, merchant, current.request.unitId);
  if (context.error) return json({ error: context.error }, context.status);
  if (!mayRun(context.actor, context.unit, context.economat, current.request, action)) return json({ error: 'forbidden-action' }, 403);
  const expectedRevision = Math.max(0, Number(body && body.revision) || 0);
  if (expectedRevision !== current.request.revision) return json({ error: 'stale', revision: current.request.revision }, 409);
  if (action === 'confirm') {
    return confirmCommand(env, body, merchant, id, idempotencyKey, current, context, expectedRevision);
  }
  const now = nowFor(env);
  let commandData = { ...(body && body.data || {}) };
  const substituted = await substitution({ action, commandData, readDoc, env, merchant, ECONOMAT_CATALOGUE_FEATURE, json, requestToken, catalogueItem, snapshotForUnit });
  if (substituted instanceof Response) return substituted;
  commandData = substituted;
  const changed = applyRequestCommand(current, action, { ...commandData, now });
  if (!changed.ok) return json({ error: changed.error }, changed.status || 422);
  const next = changed.value;
  const sourceLocations = context.economat
    ? [context.economat.locationId, 'principal']
    : [];
  const atp = action === 'review'
    ? buildReviewAtpGuard(current, next, merchant, sourceLocations)
    : { sql: '', args: [] };
  const updateRequest = env.DB.prepare(
    `UPDATE ${REQUEST_TABLE}
        SET state = ?, cancelled = ?, revision = ?, last_command_key = ?,
            review_revision = ?, accepted_revision = ?, fulfilment_method = ?, delivery_started_ts = ?,
            disputed = ?, updated_ts = ?, submitted_ts = ?, closed_ts = ?
      WHERE merchant = ? AND id = ? AND revision = ?${atp.sql}`
  ).bind(
    next.request.state, next.request.cancelled ? 1 : 0, next.request.revision, idempotencyKey,
    next.request.reviewRevision || 0, next.request.acceptedRevision || 0,
    next.request.fulfilmentMethod || 'pickup', next.request.deliveryStartedTs || null, next.request.disputed ? 1 : 0,
    now, next.request.submittedTs || null, next.request.closedTs || null,
    merchant, id, expectedRevision, ...atp.args,
  );
  const statements = [updateRequest];
  next.lines.forEach((line, index) => statements.push(env.DB.prepare(
    `UPDATE ${LINE_TABLE}
        SET qty_approved = ?, qty_prepared = ?, qty_received = ?,
            resolution = ?, substitute_for = ?, substitute_unit = ?,
            substitute_conversion_snapshot = ?, substitute_reason = ?, note = ?
      WHERE merchant = ? AND request_id = ? AND line_no = ?
        AND EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                     WHERE merchant = ? AND id = ? AND last_command_key = ?)`
  ).bind(
    line.qtyApproved, line.qtyPrepared, line.qtyReceived, line.resolution,
    line.substituteFor, line.substituteUnit, JSON.stringify(line.substituteConversionSnapshot || {}),
    line.substituteReason, line.note, merchant, id, index, merchant, id, idempotencyKey,
  )));
  if (action === 'review' || action === 'cancel') {
    releaseReservations({ statements, env, merchant, id, idempotencyKey, REQUEST_TABLE });
    reserveReview({ action, context, next, approvedBaseMilli, fulfilmentItemId, statements, env, merchant, id, idempotencyKey, now, REQUEST_TABLE });
  }
  statements.push(env.DB.prepare(
    `INSERT OR IGNORE INTO ${EVENT_TABLE}
      (merchant, id, request_id, revision, event, idempotency_key, actor_id, actor_name, payload, ts)
     SELECT ?, ?, ?, revision, ?, ?, ?, ?, ?, ?
       FROM ${REQUEST_TABLE}
      WHERE merchant = ? AND id = ? AND last_command_key = ?`
  ).bind(
    merchant, `evt:${idempotencyKey}`, id, action, idempotencyKey,
    context.actor.id, context.actor.name, JSON.stringify(commandData), now,
    merchant, id, idempotencyKey,
  ));
  let results;
  try { results = await env.DB.batch(statements); }
  catch (_) { return json({ error: 'write-failed' }, 503); }
  const won = Number(results && results[0] && results[0].meta && results[0].meta.changes) > 0;
  if (!won) {
    const replay = await replayFor(env, merchant, idempotencyKey);
    if (replay) return json({ ok: true, replayed: true, ...replay });
    if (action === 'review') {
      const latest = await loadRequest(env, merchant, id);
      if (latest && latest.request.revision === expectedRevision) return json({ error: 'insufficient-stock' }, 409);
    }
    return json({ error: 'stale' }, 409);
  }
  const stored = await loadRequest(env, merchant, id);
  return json({ ok: true, ...stored });
}

/* Liste des demandes récentes (sans `id`) : la page Économat n'a pas d'autre
 * moyen de retrouver une demande qu'elle n'a pas créée elle-même. Même règle
 * de lecture qu'une demande seule : le service destinataire ou l'économat.
 * Chaque demande porte sa piste d'événements (qui, quoi, quand) : c'est la
 * garde enregistrée que l'écran montre à la remise et à la réception. */
async function listRequests(request, env, merchant, url) {
  const actor = await resolveHotelActor(request, env, merchant);
  if (!actor) return json({ error: 'employee-required' }, 403);
  let registry;
  try { registry = await readDoc(env, merchant, 'hotel-units', { units: [] }); }
  catch (_) { return json({ error: 'unmigrated' }, 503); }
  const units = Array.isArray(registry.units) ? registry.units : [];
  const economat = units.find((entry) => entry && entry.kind === 'economat' && entry.active !== false) || null;
  const readsEconomat = !!(economat && actor.canReadUnit(economat));
  const readable = new Set(units.filter((unit) => unit && (readsEconomat || actor.canReadUnit(unit))).map((unit) => unit.id));
  const unitFilter = requestToken(url.searchParams.get('unitId'), 80);
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit')) || 40));
  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT * FROM ${REQUEST_TABLE} WHERE merchant = ? ORDER BY updated_ts DESC, id LIMIT ?`
    ).bind(merchant, 400).all();
  } catch (_) { return json({ error: 'db' }, 503); }
  const picked = ((rows && rows.results) || [])
    .filter((row) => readable.has(row.unit_id) && (!unitFilter || row.unit_id === unitFilter))
    .slice(0, limit);
  const requests = [];
  try {
    for (const row of picked) {
      const lineRows = await env.DB.prepare(
        `SELECT * FROM ${LINE_TABLE} WHERE merchant = ? AND request_id = ? ORDER BY line_no`
      ).bind(merchant, row.id).all();
      const eventRows = await env.DB.prepare(
        `SELECT event, revision, actor_name, ts FROM ${EVENT_TABLE}
          WHERE merchant = ? AND request_id = ? ORDER BY revision, ts LIMIT 40`
      ).bind(merchant, row.id).all();
      const value = rowRequest(row);
      const lines = ((lineRows && lineRows.results) || []).map(rowLine);
      requests.push({
        request: value, lines, label: deriveRequestLabel(value, lines),
        events: ((eventRows && eventRows.results) || []).map((event) => ({
          event: event.event, revision: Number(event.revision) || 0,
          actorName: event.actor_name || '', ts: Number(event.ts) || 0,
        })),
      });
    }
  } catch (_) { return json({ error: 'db' }, 503); }
  return json({
    merchant, requests,
    confirmationSide: confirmationSide(registry),
    actor: { id: actor.id, name: actor.name, kind: actor.kind },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }
  const url = new URL(request.url);
  const merchant = requestToken(url.searchParams.get('merchant'), 80);
  const id = requestToken(url.searchParams.get('id'), 80);
  if (merchant && !url.searchParams.has('id')) return listRequests(request, env, merchant, url);
  if (!merchant || !id) return json({ error: 'bad-request' }, 400);
  let stored;
  try { stored = await loadRequest(env, merchant, id); }
  catch (_) { return json({ error: 'db' }, 503); }
  if (!stored) return json({ error: 'not-found' }, 404);
  const context = await requestContext(request, env, merchant, stored.request.unitId);
  if (context.error) return json({ error: context.error }, context.status);
  return json({ merchant, ...stored });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = requestToken(body && body.merchant, 80);
  const action = String(body && body.action || '').trim();
  const idempotencyKey = requestToken(body && body.idempotencyKey, 100);
  if (!merchant || !idempotencyKey || !['create', 'submit', 'review', 'accept', 'prepare', 'confirm', 'dispute', 'cancel'].includes(action)) {
    return json({ error: 'bad-request' }, 400);
  }
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }
  let replay;
  try {
    replay = action === 'create'
      ? await loadRequest(env, merchant, idempotencyKey, true)
      : await replayFor(env, merchant, idempotencyKey);
  } catch (_) { return json({ error: 'db' }, 503); }
  if (replay) {
    const context = await requestContext(request, env, merchant, replay.request.unitId);
    if (context.error) return json({ error: context.error }, context.status);
    return json({ ok: true, replayed: true, ...replay });
  }
  return action === 'create'
    ? createDraft(request, env, body, merchant, idempotencyKey)
    : command(request, env, body, merchant, action, idempotencyKey);
}
