// Three-way merge of a menu document, item by item.
//
// When a device publishes its menu and the server already holds a newer copy,
// the device keeps three versions: base (the server copy it last synced),
// mine (its own edit) and theirs (the server copy now). A field changed on one
// side only takes that side's value; a field changed identically on both sides
// is kept; a field changed differently on both sides is a conflict, resolved to
// the server's value and reported so the screen can name the item. Lists keep
// the server's order, then append what only this device added.

export const MENU_LISTS = ['cats', 'items', 'stations', 'opts', 'formulaTemplates', 'promos'];
// seq numbers new ids on each device: keep the higher one so ids never collide.
export const MENU_COUNTERS = ['seq'];

const stable = (value) => {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
};

export const sameValue = (a, b) => stable(a) === stable(b);

const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

// One value: base b, mine m, theirs t. Returns { value, conflict }.
// A missing value is passed as undefined and means "absent".
export const mergeValue = (b, m, t) => {
  if (sameValue(m, b)) return { value: t, conflict: false };
  if (sameValue(t, b)) return { value: m, conflict: false };
  if (sameValue(m, t)) return { value: t, conflict: false };
  return { value: t, conflict: true };
};

const isIdList = (v) => v === undefined || (Array.isArray(v) && v.every((e) => e && typeof e === 'object' && e.id != null));

// Two objects edited on both sides: merge field by field. A field holding a
// list of objects with ids (a category's subcategories, an option group's
// choices) is merged entry by entry instead of as one value.
export const mergeFields = (b, m, t) => {
  const base = b || {};
  const keys = new Set([...Object.keys(base), ...Object.keys(m || {}), ...Object.keys(t || {})]);
  const out = {};
  const fields = [];
  for (const key of keys) {
    const bv = has(base, key) ? base[key] : undefined;
    const mv = has(m, key) ? m[key] : undefined;
    const tv = has(t, key) ? t[key] : undefined;
    const r = mergeValue(bv, mv, tv);
    if (r.conflict && Array.isArray(mv) && Array.isArray(tv) && isIdList(bv) && isIdList(mv) && isIdList(tv)) {
      const nested = mergeList(bv, mv, tv);
      out[key] = nested.value;
      for (const c of nested.conflicts) fields.push(key + '.' + c.id);
      continue;
    }
    if (r.conflict) fields.push(key);
    if (r.value !== undefined) out[key] = r.value;
  }
  return { value: out, fields };
};

const byId = (list) => {
  const map = new Map();
  for (const entry of Array.isArray(list) ? list : []) {
    const id = entry && entry.id != null ? String(entry.id) : '';
    if (id && !map.has(id)) map.set(id, entry);
  }
  return map;
};

// One id-keyed list. Returns { value, conflicts: [{ id, fields }] }.
export const mergeList = (baseList, mineList, theirList) => {
  const B = byId(baseList), M = byId(mineList), T = byId(theirList);
  const decided = new Map();
  const conflicts = [];
  const ids = new Set([...B.keys(), ...M.keys(), ...T.keys()]);
  for (const id of ids) {
    const b = B.get(id), m = M.get(id), t = T.get(id);
    if (sameValue(m, b)) { if (t !== undefined) decided.set(id, t); continue; }
    if (sameValue(t, b)) { if (m !== undefined) decided.set(id, m); continue; }
    if (sameValue(m, t)) { if (t !== undefined) decided.set(id, t); continue; }
    if (m === undefined || t === undefined) {
      // Deleted on one side, changed on the other: keep the surviving edit, report it.
      decided.set(id, m === undefined ? t : m);
      conflicts.push({ id, fields: ['deleted'] });
      continue;
    }
    const r = mergeFields(b, m, t);
    decided.set(id, r.value);
    if (r.fields.length) conflicts.push({ id, fields: r.fields });
  }
  const value = [];
  for (const id of T.keys()) if (decided.has(id)) { value.push(decided.get(id)); decided.delete(id); }
  for (const id of M.keys()) if (decided.has(id)) { value.push(decided.get(id)); decided.delete(id); }
  for (const [, entry] of decided) value.push(entry);
  return { value, conflicts };
};

// The whole menu. Lists merge by id, counters keep the higher value, any
// other field follows mergeValue.
export const mergeMenu = (base, mine, theirs) => {
  const b = base || {}, m = mine || {}, t = theirs || {};
  const out = {};
  const conflicts = [];
  const keys = new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)]);
  for (const key of keys) {
    if (MENU_LISTS.includes(key)) {
      const r = mergeList(b[key], m[key], t[key]);
      out[key] = r.value;
      for (const c of r.conflicts) conflicts.push({ list: key, id: c.id, fields: c.fields });
      continue;
    }
    if (MENU_COUNTERS.includes(key)) {
      const n = Math.max(Number(b[key]) || 0, Number(m[key]) || 0, Number(t[key]) || 0);
      if (has(m, key) || has(t, key)) out[key] = n;
      continue;
    }
    const r = mergeValue(has(b, key) ? b[key] : undefined, has(m, key) ? m[key] : undefined, has(t, key) ? t[key] : undefined);
    if (r.value !== undefined) out[key] = r.value;
    if (r.conflict) conflicts.push({ list: '', id: key, fields: [key] });
  }
  return { value: out, conflicts };
};
