// Server-side validation and helpers for the hotel room document.

const ALLOWED_BULK_FIELDS = new Set(['floorId', 'typeId', 'view', 'charMode', 'characteristics']);
const DEFAULT_CHARACTERISTICS = new Set(['balcony', 'terrace', 'pmr', 'bathtub', 'shower_walkin', 'quiet', 'desk', 'ac']);

export function roomArray(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  if (Array.isArray(doc.rooms)) return doc.rooms;
  if (Array.isArray(doc.roomRecords)) return doc.roomRecords;
  return null;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function payloadHash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}

function validateAuditList(doc) {
  if (doc.roomAudits == null) return { ok: true, value: [] };
  if (!Array.isArray(doc.roomAudits)) return { ok: false, error: 'corrupt-document', status: 503 };
  const seen = new Set();
  for (const audit of doc.roomAudits) {
    if (!audit || typeof audit !== 'object') {
      return { ok: false, error: 'corrupt-document', status: 503 };
    }
    if (audit.operationId) {
      if (!audit.hash || !audit.actor) return { ok: false, error: 'corrupt-document', status: 503 };
      const id = String(audit.operationId);
      if (seen.has(id)) return { ok: false, error: 'corrupt-document', status: 503 };
      seen.add(id);
    }
  }
  return { ok: true, value: doc.roomAudits };
}

export function validateRoomsDocument(cleanDoc, currentDoc, options = {}) {
  if (!cleanDoc || typeof cleanDoc !== 'object' || Array.isArray(cleanDoc)) {
    return { ok: false, error: 'invalid-document-shape', status: 422 };
  }
  const rooms = roomArray(cleanDoc);
  if (!rooms) return { ok: false, error: 'invalid-document-shape', status: 422 };
  const activeRooms = rooms.filter((room) => room && !room.deletedAt);
  const roomById = new Map();
  const roomNumberByValue = new Map();
  for (const room of activeRooms) {
    if (!room.id || room.n == null) return { ok: false, error: 'invalid-room-shape', status: 422, roomId: room?.id };
    const id = String(room.id);
    if (roomById.has(id)) return { ok: false, error: 'duplicate-room-id', status: 422, roomId: id };
    if (options.checkDuplicateNumbers) {
      const number = String(room.n);
      if (roomNumberByValue.has(number)) return { ok: false, error: 'duplicate-room-number', status: 422, roomId: id };
      roomNumberByValue.set(number, id);
    }
    roomById.set(id, room);
  }
  for (const room of activeRooms) {
    for (const rawId of (Array.isArray(room.connectingRoomIds) ? room.connectingRoomIds : [])) {
      const targetId = String(rawId || '');
      if (!targetId) continue;
      if (targetId === String(room.id)) return { ok: false, error: 'self-connecting-room', status: 422, roomId: room.id };
      const target = roomById.get(targetId);
      if (!target) return { ok: false, error: 'missing-connecting-room', status: 422, roomId: room.id, targetId };
      const reciprocal = Array.isArray(target.connectingRoomIds) ? target.connectingRoomIds.map(String) : [];
      if (!reciprocal.includes(String(room.id))) {
        return { ok: false, error: 'non-reciprocal-connecting-room', status: 422, roomId: room.id, targetId };
      }
    }
  }
  const audits = validateAuditList(cleanDoc);
  if (!audits.ok) return audits;
  if (currentDoc) {
    const currentAudits = validateAuditList(currentDoc);
    if (!currentAudits.ok) return currentAudits;
  }
  return { ok: true, value: cleanDoc };
}

export function validateBulkChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { ok: false, error: 'invalid-changes' };
  const keys = Object.keys(changes);
  if (!keys.length || keys.some((key) => !ALLOWED_BULK_FIELDS.has(key))) return { ok: false, error: 'invalid-changes' };
  const out = {};
  for (const key of keys) {
    const value = changes[key];
    if ((key === 'floorId' || key === 'typeId') && (value == null || value === '')) continue;
    if (key === 'view' && value == null) continue;
    if (key === 'charMode' && !['none', 'add', 'remove', 'replace'].includes(value)) return { ok: false, error: 'invalid-changes' };
    if (key === 'characteristics') {
      if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== 'string' || item.length > 120)) return { ok: false, error: 'invalid-changes' };
      out[key] = value.slice();
    } else if (value != null && typeof value !== 'string') {
      return { ok: false, error: 'invalid-changes' };
    } else if (typeof value === 'string' && value.length > 240) {
      return { ok: false, error: 'invalid-changes' };
    } else out[key] = value == null ? '' : value;
  }
  return { ok: true, value: out };
}

export function roomCharacteristicCatalog(doc) {
  const catalog = new Set(DEFAULT_CHARACTERISTICS);
  for (const item of (Array.isArray(doc?.customCharacteristics) ? doc.customCharacteristics : [])) {
    const id = typeof item === 'string' ? item : item?.id;
    if (id) catalog.add(String(id));
  }
  return catalog;
}

export { ALLOWED_BULK_FIELDS };
