import { json } from '../../auth/_lib.js';
import { resolveHotelActor } from './_hotel-actor.js';
import { departmentCatalogueFeature } from './_department-catalogue.js';
import { ECONOMAT_CATALOGUE_FEATURE } from './_economat-catalogue.js';
import { quantityToBase } from './_economat-catalogue.js';
import {
  applyRequestCommand, createRequestDraft, deriveRequestLabel, requestToken,
} from './_internal-request.js';

const REQUEST_TABLE = 'hotel_internal_requests';
const LINE_TABLE = 'hotel_internal_request_lines';
const EVENT_TABLE = 'hotel_internal_request_events';

function nowFor(env) {
  return env && typeof env.NOW === 'function' ? Number(env.NOW()) || Date.now() : Date.now();
}

function hash(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function transferMovementId(merchant, refId, lineNo, itemId, direction) {
  return `inv-transfer-${hash([merchant, refId, lineNo, itemId, direction].join('|'))}`;
}

function parseMeta(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
}

export function allocateTransferCost(rowsValue, requestedMilli) {
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
        remaining: qty,
        cost: row.unit_cost_cents == null ? null : Number(row.unit_cost_cents) / 100,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
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
  for (const lot of sortedLots()) {
    if (!remaining) break;
    const take = Math.min(lot.remaining, remaining);
    if (lot.cost == null) return null;
    value += take * lot.cost;
    remaining -= take;
  }
  if (remaining > 0) return null;
  return Math.round((value / requested) * 10000) / 10000;
}

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${REQUEST_TABLE} (
      merchant TEXT NOT NULL, id TEXT NOT NULL, unit_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft', cancelled INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1, create_key TEXT NOT NULL,
      last_command_key TEXT NOT NULL DEFAULT '', requester_id TEXT NOT NULL DEFAULT '',
      requester_name TEXT NOT NULL DEFAULT '', review_revision INTEGER NOT NULL DEFAULT 0,
      accepted_revision INTEGER NOT NULL DEFAULT 0, fulfilment_method TEXT NOT NULL DEFAULT 'pickup',
      delivery_started_ts INTEGER, disputed INTEGER NOT NULL DEFAULT 0,
      created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, submitted_ts INTEGER, closed_ts INTEGER,
      PRIMARY KEY (merchant, id), UNIQUE (merchant, create_key)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${LINE_TABLE} (
      merchant TEXT NOT NULL, request_id TEXT NOT NULL, line_no INTEGER NOT NULL,
      item_id TEXT NOT NULL, unit TEXT NOT NULL, conversion_snapshot TEXT NOT NULL,
      qty_requested_base_milli INTEGER NOT NULL, qty_requested REAL NOT NULL,
      qty_approved REAL NOT NULL DEFAULT 0, qty_prepared REAL NOT NULL DEFAULT 0,
      qty_received REAL NOT NULL DEFAULT 0, resolution TEXT NOT NULL DEFAULT 'pending',
      substitute_for TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (merchant, request_id, line_no)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (
      merchant TEXT NOT NULL, id TEXT NOT NULL, request_id TEXT NOT NULL,
      revision INTEGER NOT NULL, event TEXT NOT NULL, idempotency_key TEXT NOT NULL,
      actor_id TEXT NOT NULL DEFAULT '', actor_name TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}', ts INTEGER NOT NULL,
      PRIMARY KEY (merchant, id), UNIQUE (merchant, idempotency_key)
    )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_hotel_requests_unit ON ${REQUEST_TABLE} (merchant, unit_id, updated_ts)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_hotel_request_events ON ${EVENT_TABLE} (merchant, request_id, revision)`).run();
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
    resolution: row.resolution, substituteFor: row.substitute_for || '', note: row.note || '',
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
       qty_received, resolution, substitute_for, note)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                     WHERE merchant = ? AND id = ? AND create_key = ?)`
  ).bind(
    merchant, requestId, lineNo, line.itemId, line.unit, JSON.stringify(line.conversionSnapshot),
    Math.round(line.qtyRequestedBase * 1000), line.qtyRequested, line.qtyApproved,
    line.qtyPrepared, line.qtyReceived, line.resolution, line.substituteFor, line.note,
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

function approvedBaseMilli(line, field = 'qtyApproved') {
  const base = quantityToBase(Number(line && line[field]) || 0, line && line.conversionSnapshot);
  return base == null ? null : Math.round(base * 1000);
}

export function buildReviewAtpGuard(current, next, merchant, sourceLocations) {
  const locations = [...new Set((sourceLocations || []).filter(Boolean))];
  if (!locations.length) return { sql: ' AND 0', args: [] };
  const clauses = [];
  const args = [];
  next.lines.forEach((line, index) => {
    const receivedMilli = approvedBaseMilli(current.lines[index], 'qtyReceived') || 0;
    const proposedMilli = Math.max(0, (approvedBaseMilli(line) || 0) - receivedMilli);
    if (!proposedMilli) return;
    const marks = locations.map(() => '?').join(',');
    clauses.push(`? <=
      (SELECT COALESCE(SUM(qty_milli), 0) FROM inventory_movements
        WHERE merchant = ? AND item_id = ? AND location_id IN (${marks}))
      - (SELECT COALESCE(SUM(CAST(ROUND(MAX(0, l.qty_approved - l.qty_received)
          * l.qty_requested_base_milli / l.qty_requested) AS INTEGER)), 0)
           FROM ${LINE_TABLE} l JOIN ${REQUEST_TABLE} r
             ON r.merchant = l.merchant AND r.id = l.request_id
          WHERE r.merchant = ? AND r.id <> ? AND r.state = 'open' AND r.cancelled = 0
            AND l.item_id = ? AND r.review_revision > 0
            AND (r.accepted_revision >= r.review_revision
              OR ABS(l.qty_approved - l.qty_requested) < 0.000000001))`);
    args.push(proposedMilli, merchant, line.itemId, ...locations, merchant, next.request.id, line.itemId);
  });
  return { sql: clauses.length ? ` AND ${clauses.map((clause) => `(${clause})`).join(' AND ')}` : '', args };
}

async function sourceRows(env, merchant, itemId, locations) {
  const ids = [...new Set((locations || []).filter(Boolean))];
  if (!ids.length) return [];
  const result = await env.DB.prepare(
    `SELECT qty_milli, reason, unit_cost_cents, occurred_ts, srv_ts, meta
       FROM inventory_movements
      WHERE merchant = ? AND item_id = ? AND location_id IN (${ids.map(() => '?').join(',')})
      ORDER BY occurred_ts, srv_ts`
  ).bind(merchant, itemId, ...ids).all();
  return (result && result.results) || [];
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
    const rows = await sourceRows(env, merchant, after.itemId, sourceLocations);
    const onHandMilli = rows.reduce((sum, row) => sum + Number(row.qty_milli || 0), 0);
    if (onHandMilli < deltaMilli) return json({ error: `source-shortage:${after.itemId}` }, 409);
    const unitCost = allocateTransferCost(rows, deltaMilli);
    if (unitCost == null) return json({ error: `source-cost-unknown:${after.itemId}` }, 409);
    transfers.push({ index, line: after, deltaMilli, unitCost });
  }
  if (!transfers.length) return json({ error: 'nothing-to-confirm' }, 409);
  const movementCount = transfers.length * 2;
  let cursor;
  try { cursor = await reserveCursors(env, merchant, movementCount, now); }
  catch (_) { return json({ error: 'cursor-failed' }, 503); }
  const movements = [];
  const movementStatements = [];
  for (const transfer of transfers) {
    for (const direction of ['out', 'in']) {
      const isOut = direction === 'out';
      const movement = {
        id: transferMovementId(merchant, transferRef, transfer.index, transfer.line.itemId, direction),
        itemId: transfer.line.itemId,
        variantId: '',
        locationId: isOut ? sourceLocation : destinationLocation,
        qty: (isOut ? -1 : 1) * transfer.deltaMilli / 1000,
        reason: isOut ? 'transfer-out' : 'transfer-in',
        unitCost: transfer.unitCost,
        currency: 'MAD', refType: 'transfer', refId: transferRef,
        note: transfer.line.note || '', actor: context.actor.name,
        occurredTs: now, cursor: cursor++, reversalOf: '',
        meta: { requestId: id, line: transfer.index, reviewRevision: current.request.reviewRevision },
      };
      movements.push(movement);
      movementStatements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO inventory_movements
          (id, merchant, item_id, variant_id, location_id, qty_milli, reason,
           unit_cost_cents, currency, ref_type, ref_id, note, actor, occurred_ts,
           srv_ts, reversal_of, meta, created_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        movement.id, merchant, movement.itemId, movement.variantId, movement.locationId,
        Math.round(movement.qty * 1000), movement.reason, Math.round(movement.unitCost * 100),
        movement.currency, movement.refType, movement.refId, movement.note, movement.actor,
        movement.occurredTs, movement.cursor, movement.reversalOf, JSON.stringify(movement.meta), now,
      ));
    }
  }
  const updateRequest = env.DB.prepare(
    `UPDATE ${REQUEST_TABLE}
        SET state = ?, cancelled = ?, revision = ?, last_command_key = ?,
            review_revision = ?, accepted_revision = ?, fulfilment_method = ?, delivery_started_ts = ?,
            disputed = ?, updated_ts = ?, submitted_ts = ?, closed_ts = ?
      WHERE merchant = ? AND id = ? AND revision = ?`
  ).bind(
    next.request.state, next.request.cancelled ? 1 : 0, next.request.revision, idempotencyKey,
    next.request.reviewRevision || 0, next.request.acceptedRevision || 0,
    next.request.fulfilmentMethod || 'pickup', next.request.deliveryStartedTs || null,
    next.request.disputed ? 1 : 0, now, next.request.submittedTs || null,
    next.request.closedTs || null, merchant, id, expectedRevision,
  );
  const statements = [...movementStatements, updateRequest];
  next.lines.forEach((line, index) => statements.push(env.DB.prepare(
    `UPDATE ${LINE_TABLE} SET qty_received = ?
      WHERE merchant = ? AND request_id = ? AND line_no = ?
        AND EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                    WHERE merchant = ? AND id = ? AND last_command_key = ?)`
  ).bind(line.qtyReceived, merchant, id, index, merchant, id, idempotencyKey)));
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
  const requestResult = results[movementStatements.length];
  if (!(Number(requestResult && requestResult.meta && requestResult.meta.changes) > 0)) {
    const replay = await replayFor(env, merchant, idempotencyKey);
    return replay ? json({ ok: true, replayed: true, ...replay }) : json({ error: 'stale' }, 409);
  }
  const stored = await loadRequest(env, merchant, id);
  return json({ ok: true, transferRef, movements, ...stored });
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
  const changed = applyRequestCommand(current, action, { ...(body && body.data || {}), now });
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
            resolution = ?, substitute_for = ?, note = ?
      WHERE merchant = ? AND request_id = ? AND line_no = ?
        AND EXISTS (SELECT 1 FROM ${REQUEST_TABLE}
                     WHERE merchant = ? AND id = ? AND last_command_key = ?)`
  ).bind(
    line.qtyApproved, line.qtyPrepared, line.qtyReceived, line.resolution,
    line.substituteFor, line.note, merchant, id, index, merchant, id, idempotencyKey,
  )));
  statements.push(env.DB.prepare(
    `INSERT OR IGNORE INTO ${EVENT_TABLE}
      (merchant, id, request_id, revision, event, idempotency_key, actor_id, actor_name, payload, ts)
     SELECT ?, ?, ?, revision, ?, ?, ?, ?, ?, ?
       FROM ${REQUEST_TABLE}
      WHERE merchant = ? AND id = ? AND last_command_key = ?`
  ).bind(
    merchant, `evt:${idempotencyKey}`, id, action, idempotencyKey,
    context.actor.id, context.actor.name, JSON.stringify(body && body.data || {}), now,
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

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }
  const url = new URL(request.url);
  const merchant = requestToken(url.searchParams.get('merchant'), 80);
  const id = requestToken(url.searchParams.get('id'), 80);
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
  if (replay) return json({ ok: true, replayed: true, ...replay });
  return action === 'create'
    ? createDraft(request, env, body, merchant, idempotencyKey)
    : command(request, env, body, merchant, action, idempotencyKey);
}

export const INTERNAL_REQUEST_TABLES = Object.freeze([REQUEST_TABLE, LINE_TABLE, EVENT_TABLE]);
