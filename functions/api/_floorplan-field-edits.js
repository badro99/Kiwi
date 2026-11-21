/* Floor plan written to the store: the markup rule on the plan, a shape check
 * on its field-merge record.
 *
 * `fieldEdits` is the per-field edit record of assets/field-merge.js: rows of
 * [path, editedAt, versionId, seenIds, deleted, edited?], where `path` is JSON
 * ('["tables",{"id":"t1"},"x"]'). No renderer reads it. From 27 Oct to 21 Nov
 * 2026 it went through the plan's markup rule like any other string, which
 * turns quotes typographic: every path key bent, the merge stopped finding any
 * edit time, and two devices that disagreed settled on a hash. A dashboard
 * holding a two-day-old plan moved ten of Browse's tables back to where they
 * stood before, with nobody touching the plan.
 *
 * So the record is taken out before the rule runs and checked by shape: a path
 * is names and ids only, a time is a number, a version or seen id keeps the id
 * characters, a conflict value goes through the markup rule. A key bent by the
 * old rule is read back straight, so a stored plan heals on its next write.
 */
import { cleanFloorplan, safeId } from './_rules-floorplan-clean.js';

const PART = /^[A-Za-z0-9_.:-]{0,80}$/;
const MAX_DEPTH = 12, MAX_FIELDS = 20000, MAX_CONFLICTS = 50, MAX_SEEN = 8;
const num = (v) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0; };

export function cleanPath(text) {
  if (typeof text !== 'string' || text.length > 800) return null;
  let path;
  try { path = JSON.parse(text.replace(/[“”]/g, '"')); } catch (_) { return null; }
  if (!Array.isArray(path) || path.length > MAX_DEPTH) return null;
  const out = [];
  for (const part of path) {
    if (typeof part === 'string' && PART.test(part)) out.push(part);
    else if (part && typeof part === 'object' && !Array.isArray(part) && Object.keys(part).length === 1 && typeof part.id === 'string') out.push({ id: safeId(part.id) });
    else return null;
  }
  return JSON.stringify(out);
}

export function cleanFieldEdits(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  let rows = record.fields;
  if (rows && typeof rows === 'object' && !Array.isArray(rows)) {
    rows = Object.keys(rows).map((k) => { const v = rows[k] || {}; return [k, v.at, v.id, v.seen, v.deleted, v.edited]; });
  }
  const fields = [];
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, MAX_FIELDS)) {
    if (!Array.isArray(row)) continue;
    const key = cleanPath(row[0]);
    if (key == null) continue;
    const out = [key, num(row[1]), safeId(row[2] == null ? '' : row[2]),
      Array.isArray(row[3]) ? row[3].slice(0, MAX_SEEN).map((v) => safeId(v)) : [], row[4] === true];
    if (row[5]) out.push(1);
    fields.push(out);
  }
  const conflicts = [];
  for (const c of (Array.isArray(record.conflicts) ? record.conflicts : []).slice(0, MAX_CONFLICTS)) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const field = cleanPath(c.field);
    if (field == null) continue;
    const out = { field, kept: safeId(c.kept == null ? '' : c.kept), discarded: safeId(c.discarded == null ? '' : c.discarded) };
    if (Object.prototype.hasOwnProperty.call(c, 'value')) out.value = cleanFloorplan({ value: c.value }).value;
    conflicts.push(out);
  }
  return { fields, conflicts };
}

/* What the store keeps of a floor plan. Changes the document in place. */
export function cleanStoredFloorplan(doc) {
  const plan = doc && typeof doc === 'object' && !Array.isArray(doc);
  const record = plan ? doc.fieldEdits : undefined;
  if (record !== undefined) delete doc.fieldEdits;
  cleanFloorplan(doc);
  if (record !== undefined) { const kept = cleanFieldEdits(record); if (kept) doc.fieldEdits = kept; }
  return doc;
}
