// POST /api/hotel/rooms-bulk — atomic, tenant-scoped room metadata updates.
import { json, activeAccountSession, activeEmployee, employeeRoleOpensDashboard, readTillActorProof } from '../../auth/_lib.js';
import { storeOwner } from '../_private.js';
import { payloadHash, roomArray, roomCharacteristicCatalog, validateBulkChanges, validateRoomsDocument } from './_rooms.js';
import { poke } from '../_live.js';

const MAX_TARGETS = 200;

async function actorFor(request, env, merchant, pinProof) {
  const ownerId = await storeOwner(env, merchant);
  const session = await activeAccountSession(request, env);
  let principal = null;
  if (session && session.aid && ownerId && String(ownerId) === String(session.aid)) {
    const account = await env.DB.prepare('SELECT id, name, email, business FROM accounts WHERE id=?').bind(session.aid).first();
    principal = { id: `account:${session.aid}`, name: String(account?.name || account?.business || account?.email || 'Owner').slice(0, 120), role: 'owner' };
  }
  const employee = principal ? null : await activeEmployee(request, env, merchant);
  if (!principal && employee && employeeRoleOpensDashboard(employee.member.function || employee.member.department)) {
    const member = employee.member;
    const name = String(member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email || employee.session.staffId).slice(0, 120);
    principal = { id: String(employee.session.staffId).slice(0, 96), name, role: String(member.function || member.department || 'manager').slice(0, 80) };
  }
  if (!principal) return null;
  if (pinProof) {
    const proof = await readTillActorProof(pinProof, env.AUTH_SECRET, merchant);
    if (proof) return { principal, authorizer: { id: String(proof.id).slice(0, 96), name: String(proof.name || 'Operator').slice(0, 120), role: String(proof.role || 'operator').slice(0, 80) } };
    return { error: 'invalid-pin-proof' };
  }
  return { principal, authorizer: null };
}

function staleResponse(feature, latest) {
  let data = null;
  try { data = latest?.data ? JSON.parse(latest.data) : null; } catch (_) {}
  return json({ error: 'stale', feature, rev: Number(latest?.rev) || 0, data }, 409);
}

export async function onRequestPost({ request, env }) {
  if (!env?.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String(body?.merchant || '').trim();
  const operationId = String(body?.operationId || '').trim();
  if (!merchant || !operationId || !Array.isArray(body?.targets) || body.targets.length < 1 || body.targets.length > MAX_TARGETS) {
    return json({ error: 'invalid-request' }, 400);
  }
  if (merchant.length > 64 || operationId.length > 120) return json({ error: 'invalid-request', detail: 'field-too-long' }, 413);
  const actor = await actorFor(request, env, merchant, body.pinProof);
  if (actor?.error) return json({ error: actor.error }, 403);
  if (!actor) return json({ error: 'forbidden' }, 403);
  const changeCheck = validateBulkChanges(body.changes);
  if (!changeCheck.ok) return json({ error: changeCheck.error }, 422);
  const changes = changeCheck.value;
  const actionable = Object.prototype.hasOwnProperty.call(changes, 'floorId')
    || Object.prototype.hasOwnProperty.call(changes, 'typeId')
    || Object.prototype.hasOwnProperty.call(changes, 'view')
    || (changes.charMode && changes.charMode !== 'none');
  if (!actionable) return json({ error: 'no-op' }, 422);
  const targets = [];
  const ids = new Set();
  for (const raw of body.targets) {
    const id = String(raw?.id || '').trim();
    const n = raw?.n;
    const expectedUpdatedAt = Number(raw?.expectedUpdatedAt);
    if (!id || ids.has(id) || n == null || !Number.isSafeInteger(expectedUpdatedAt) || expectedUpdatedAt < 0) {
      return json({ error: 'invalid-target', roomId: id || null }, 422);
    }
    if (id.length > 96) return json({ error: 'invalid-target', detail: 'room-id-too-long' }, 413);
    ids.add(id);
    targets.push({ id, n: String(n), expectedUpdatedAt });
  }
  const operationInput = { targets, changes };
  const hash = await payloadHash(operationInput);
  let row;
  try {
    row = await env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant=? AND feature='rooms'").bind(merchant).first();
  } catch (_) { return json({ error: 'unmigrated' }, 503); }
  if (!row) return json({ error: 'rooms-not-found' }, 404);
  let current;
  try { current = JSON.parse(row.data); } catch (_) { return json({ error: 'corrupt-document' }, 503); }
  const currentCheck = validateRoomsDocument(current, current);
  if (!currentCheck.ok) return json({ error: currentCheck.error }, 503);
  const audits = Array.isArray(current.roomAudits) ? current.roomAudits : [];
  const prior = audits.find((audit) => audit && audit.operationId === operationId);
  if (prior) {
    if (prior.hash !== hash) return json({ error: 'operation-conflict', operationId }, 409);
    return json({ ok: true, rev: Number(row.rev) || 0, data: current, operation: { ...prior, replayed: true } });
  }
  const rooms = roomArray(current);
  const roomById = new Map(rooms.map((room) => [String(room?.id || ''), room]));
  const floorById = new Map((Array.isArray(current.floors) ? current.floors : []).filter((f) => f && !f.deletedAt).map((f) => [String(f.id), f]));
  const typeById = new Map((Array.isArray(current.roomTypes) ? current.roomTypes : []).filter((t) => t && !t.deletedAt).map((t) => [String(t.id), t]));
  const characteristicCatalog = roomCharacteristicCatalog(current);
  if (changes.charMode && changes.charMode !== 'none') {
    const unknown = (changes.characteristics || []).find((id) => !characteristicCatalog.has(id));
    if (unknown) return json({ error: 'invalid-characteristic', characteristic: unknown }, 422);
  }
  for (const target of targets) {
    const room = roomById.get(target.id);
    if (!room || room.deletedAt || String(room.n) !== target.n) return json({ error: 'target-mismatch', roomId: target.id }, 409);
    if ((Number(room.updatedAt) || 0) !== target.expectedUpdatedAt) return json({ error: 'room-conflict', roomId: target.id }, 409);
    if (Object.prototype.hasOwnProperty.call(changes, 'floorId') && !floorById.has(changes.floorId)) return json({ error: 'invalid-destination', field: 'floorId' }, 422);
    if (Object.prototype.hasOwnProperty.call(changes, 'typeId') && !typeById.has(changes.typeId)) return json({ error: 'invalid-destination', field: 'typeId' }, 422);
  }
  const now = Date.now();
  const next = JSON.parse(JSON.stringify(current));
  const allowedSnapshot = (room) => ({
    floorId: room.floorId || '', floor: room.floor || '', typeId: room.typeId || '', typeName: room.typeName || '',
    view: room.view || '', characteristics: Array.isArray(room.characteristics) ? room.characteristics.slice() : [],
  });
  const updateCollection = (collection) => {
    if (!Array.isArray(collection)) return;
    for (const target of targets) {
      const index = collection.findIndex((room) => room && String(room.id) === target.id);
      if (index < 0) continue;
      const room = { ...collection[index] };
      if (Object.prototype.hasOwnProperty.call(changes, 'floorId')) {
        room.floorId = changes.floorId;
        room.floor = String(floorById.get(changes.floorId)?.name || changes.floorId);
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'typeId')) {
        room.typeId = changes.typeId;
        room.typeName = String(typeById.get(changes.typeId)?.name || changes.typeId);
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'view')) room.view = changes.view;
      if (changes.charMode && changes.charMode !== 'none') {
        const currentCharacteristics = new Set(Array.isArray(room.characteristics) ? room.characteristics.map(String) : []);
        const selected = new Set(Array.isArray(changes.characteristics) ? changes.characteristics : []);
        if (changes.charMode === 'replace') {
          room.characteristics = Array.from(selected);
        } else if (changes.charMode === 'add') {
          selected.forEach((value) => currentCharacteristics.add(value));
          room.characteristics = Array.from(currentCharacteristics);
        } else if (changes.charMode === 'remove') {
          selected.forEach((value) => currentCharacteristics.delete(value));
          room.characteristics = Array.from(currentCharacteristics);
        }
      }
      const previousUpdatedAt = Number.isSafeInteger(Number(room.updatedAt)) ? Number(room.updatedAt) : 0;
      room.updatedAt = Math.max(now, Math.min(Number.MAX_SAFE_INTEGER, previousUpdatedAt + 1));
      collection[index] = room;
    }
  };
  updateCollection(next.rooms);
  updateCollection(next.roomRecords);
  const candidateCheck = validateRoomsDocument(next, current, { checkDuplicateNumbers: true });
  if (!candidateCheck.ok) return json({ error: candidateCheck.error, roomId: candidateCheck.roomId }, candidateCheck.status || 422);
  const operation = {
    operationId, hash, at: now, actor: actor.principal, authorizer: actor.authorizer,
    targets: targets.map((target) => ({ ...target })),
    changes: JSON.parse(JSON.stringify(changes)),
    targetSnapshots: targets.map((target) => ({
      id: target.id,
      before: allowedSnapshot(roomById.get(target.id)),
      after: allowedSnapshot(roomArray(next).find((room) => room && String(room.id) === target.id)),
    })),
  };
  next.roomAudits = audits.concat(operation);
  const text = JSON.stringify(next);
  if (text.length > 400000) return json({ error: 'too-large', why: 'byte-size' }, 413);
  const nextRev = (Number(row.rev) || 0) + 1;
  let written;
  try {
    written = await env.DB.prepare("UPDATE store_docs SET data=?, rev=?, updated_ts=? WHERE merchant=? AND feature='rooms' AND rev=?")
      .bind(text, nextRev, now, merchant, Number(row.rev) || 0).run();
  } catch (_) { return json({ error: 'write-failed' }, 503); }
  if (Number(written?.meta?.changes) !== 1) {
    let latest = null;
    try { latest = await env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant=? AND feature='rooms'").bind(merchant).first(); } catch (_) {}
    return staleResponse('rooms', latest || row);
  }
  try { await poke(env, merchant, 'rooms'); } catch (_) {}
  return json({ ok: true, rev: nextRev, data: next, operation });
}
