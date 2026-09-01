import { json } from '../../auth/_lib.js';
import { resolveHotelActor } from './_hotel-actor.js';
import { departmentCatalogueFeature } from './_department-catalogue.js';
import { ECONOMAT_CATALOGUE_FEATURE } from './_economat-catalogue.js';
import {
  applyRequestCommand, createRequestDraft, deriveRequestLabel, requestToken,
} from './_internal-request.js';

const REQUEST_TABLE = 'hotel_internal_requests';
const LINE_TABLE = 'hotel_internal_request_lines';
const EVENT_TABLE = 'hotel_internal_request_events';

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
  if (!actor) return { error: 'unauthorized', status: 401 };
  let registry;
  try { registry = await readDoc(env, merchant, 'hotel-units', { units: [] }); }
  catch (_) { return { error: 'unmigrated', status: 503 }; }
  const unit = (Array.isArray(registry.units) ? registry.units : [])
    .find((entry) => entry && entry.id === unitId) || null;
  if (!unit) return { error: 'unit-not-found', status: 404 };
  if (!actor.canReadUnit(unit)) return { error: 'unit-forbidden', status: 403 };
  return { actor, unit };
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
  if (context.unit.active === false) return json({ error: 'unit-inactive' }, 409);
  let department;
  let central;
  try {
    department = await readDoc(env, merchant, departmentCatalogueFeature(unitId), { unitId, items: [] });
    central = await readDoc(env, merchant, ECONOMAT_CATALOGUE_FEATURE, { items: [] });
  } catch (_) { return json({ error: 'unmigrated' }, 503); }
  const checked = createRequestDraft(body, department, central);
  if (!checked.ok) return json({ error: checked.error }, checked.status || 422);
  const now = Date.now();
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

function mayRun(actor, unit, requestRecord, action) {
  const manages = actor.canManageUnit(unit);
  if (action === 'review' || action === 'prepare') return manages;
  if (action === 'cancel') return manages || actor.id === requestRecord.requesterId;
  return actor.id === requestRecord.requesterId || manages;
}

async function command(request, env, body, merchant, action, idempotencyKey) {
  const id = requestToken(body && body.id, 80);
  let current;
  try { current = await loadRequest(env, merchant, id); }
  catch (_) { return json({ error: 'db' }, 503); }
  if (!current) return json({ error: 'not-found' }, 404);
  const context = await requestContext(request, env, merchant, current.request.unitId);
  if (context.error) return json({ error: context.error }, context.status);
  if (!mayRun(context.actor, context.unit, current.request, action)) return json({ error: 'forbidden-action' }, 403);
  const expectedRevision = Math.max(0, Number(body && body.revision) || 0);
  if (expectedRevision !== current.request.revision) return json({ error: 'stale', revision: current.request.revision }, 409);
  const changed = applyRequestCommand(current, action, { ...(body && body.data || {}), now: Date.now() });
  if (!changed.ok) return json({ error: changed.error }, changed.status || 422);
  const next = changed.value;
  const now = Date.now();
  const updateRequest = env.DB.prepare(
    `UPDATE ${REQUEST_TABLE}
        SET state = ?, cancelled = ?, revision = ?, last_command_key = ?,
            review_revision = ?, accepted_revision = ?, delivery_started_ts = ?,
            disputed = ?, updated_ts = ?, submitted_ts = ?, closed_ts = ?
      WHERE merchant = ? AND id = ? AND revision = ?`
  ).bind(
    next.request.state, next.request.cancelled ? 1 : 0, next.request.revision, idempotencyKey,
    next.request.reviewRevision || 0, next.request.acceptedRevision || 0,
    next.request.deliveryStartedTs || null, next.request.disputed ? 1 : 0,
    now, next.request.submittedTs || null, next.request.closedTs || null,
    merchant, id, expectedRevision,
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
    return replay ? json({ ok: true, replayed: true, ...replay }) : json({ error: 'stale' }, 409);
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
  if (!merchant || !idempotencyKey || !['create', 'submit', 'review', 'accept', 'prepare', 'confirm', 'cancel'].includes(action)) {
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
