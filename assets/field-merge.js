/* Per-field registers. Reading/merging never creates edit times. Arrays of records
 * are addressed by stable IDs; other arrays are one field. No credentials enter
 * the conflict journal. Legacy records use their existing update time. */
(function (root) {
  'use strict';
  const copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  const stable = x => JSON.stringify(x && typeof x === 'object' ? (Array.isArray(x) ? x.map(v => JSON.parse(stable(v))) : Object.fromEntries(Object.keys(x).sort().map(k => [k, JSON.parse(stable(x[k]))]))) : x === undefined ? null : x);
  function digest(value) {
    const text = stable(value); let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16);
  }
  const secret = k => /password|pinCode|manageToken|publicRef|secret|token/i.test(k);
  const identity = (k, at, value) => String(at) + ':' + (secret(k) ? 'private' : digest(value));
  const key = path => JSON.stringify(path);
  const time = x => Number.isFinite(+x) ? +x : Date.parse(x) || 0;
  function flatten(doc) {
    const fields = {};
    function walk(x, path, at) {
      if (x && !Array.isArray(x) && typeof x === 'object') {
        at = time(x.updatedAt || x.createdAt) || at;
        const keys = Object.keys(x).filter(k => k !== 'fieldEdits' && k !== '__proto__' && k !== 'constructor' && k !== 'prototype').sort();
        if (keys.length) { keys.forEach(k => walk(x[k], path.concat(k), at)); return; }
      }
      if (Array.isArray(x) && x.length && x.every(v => v && typeof v.id === 'string')) {
        x.forEach(v => walk(v, path.concat({ id:v.id }), at)); return;
      }
      fields[key(path)] = { value:copy(x), at:at || 0 };
    }
    walk(doc || {}, [], 0);
    return fields;
  }
  function assign(out, path, value) {
    let dst = out;
    for (let i = 0; i < path.length; i++) {
      const part = path[i];
      if (part === '__proto__' || part === 'constructor' || part === 'prototype') return;
      const last = i === path.length - 1;
      if (typeof part === 'object') {
        let item = dst.find(v => v.id === part.id);
        if (!item) { item = { id:part.id }; dst.push(item); }
        dst = item;
      } else if (last) dst[part] = copy(value);
      else {
        const array = typeof path[i + 1] === 'object';
        if (!dst[part] || typeof dst[part] !== 'object' || Array.isArray(dst[part]) !== array) dst[part] = array ? [] : {};
        dst = dst[part];
      }
    }
  }
  // Arrays avoid the store's 400-key object limit and 120-character key limit.
  function versions(doc) {
    const fields = doc && doc.fieldEdits && doc.fieldEdits.fields;
    return Array.isArray(fields) ? Object.fromEntries(fields.map(([k,at,id,seen,deleted]) => [k,{at,id,seen,deleted}])) : fields || {};
  }
  const pack = fields => Object.keys(fields).sort().map(k => { const v = fields[k]; return [k,v.at,v.id,v.seen || [],!!v.deleted]; });
  function register(doc, fields, k, known) {
    const v = (known || versions(doc))[k];
    const f = fields[k];
    return v || { at:f ? f.at : 0, id:identity(k, f ? f.at : 0, f && f.value), seen:[], deleted:!f };
  }
  function stamp(next, previous, now) {
    const out = copy(next || {}), prev = previous || {}, a = flatten(out), b = flatten(prev);
    const fields = copy(versions(out.fieldEdits ? out : prev)), previousVersions = versions(prev);
    let at = time(now) || Date.now();
    [...Object.values(fields), ...Object.values(previousVersions)].forEach(v => { at = Math.max(at, v.at + 1); });
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (stable(a[k] && a[k].value) === stable(b[k] && b[k].value) && !!a[k] === !!b[k]) {
        if (!fields[k]) fields[k] = copy(register(prev, b, k, previousVersions));
        continue;
      }
      const old = register(prev, b, k, previousVersions);
      fields[k] = { at, id:identity(k, at, [!!a[k], a[k] && a[k].value]), seen:[...new Set([...(old.seen || []), old.id])].sort(), deleted:!a[k] };
    }
    out.fieldEdits = { fields:pack(fields), conflicts:copy((out.fieldEdits || prev.fieldEdits || {}).conflicts || []) };
    return out;
  }
  function merge(a, b) {
    a = a || {}; b = b || {};
    const aa = flatten(a), bb = flatten(b), out = {}, fields = {}, va = versions(a), vb = versions(b);
    const conflicts = new Map(), values = [];
    [...((a.fieldEdits || {}).conflicts || []), ...((b.fieldEdits || {}).conflicts || [])].forEach(c => conflicts.set(stable(c), c));
    const keys = [...new Set([...Object.keys(aa), ...Object.keys(bb), ...Object.keys(va), ...Object.keys(vb)])].sort();
    for (const k of keys) {
      const av = register(a, aa, k, va), bv = register(b, bb, k, vb);
      const hasA = !!aa[k] || !!va[k], hasB = !!bb[k] || !!vb[k];
      const chooseA = !hasB || (hasA && (av.at > bv.at || (av.at === bv.at && (av.id > bv.id || (av.id === bv.id && stable(aa[k] && aa[k].value) >= stable(bb[k] && bb[k].value))))));
      const win = chooseA ? av : bv, lose = chooseA ? bv : av, f = chooseA ? aa[k] : bb[k], other = chooseA ? bb[k] : aa[k];
      fields[k] = copy(win);
      if (!win.deleted && f) {
        values.push({ path:JSON.parse(k), value:f.value });
      }
      if (hasA && hasB && av.id !== bv.id && stable(aa[k] && aa[k].value) !== stable(bb[k] && bb[k].value) && !(win.seen || []).includes(lose.id) && !(lose.seen || []).includes(win.id)) {
        const c = { field:k, kept:win.id, discarded:lose.id };
        // Credential conflicts never enter the journal.
        if (!/password|pinCode|manageToken|publicRef|secret|token/i.test(k)) { if (other) c.value = copy(other.value); conflicts.set(stable(c), c); }
      }
    }
    values.sort((a,b) => a.path.length - b.path.length).forEach(v => assign(out, v.path, v.value));
    out.fieldEdits = { fields:pack(fields), conflicts:[...conflicts.entries()].sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0).map(([, c]) => c) };
    return out;
  }
  function message() {
    let lang = 'fr';
    try { lang = root.KiwiI18n?.getLang?.() || root.localStorage.getItem('kiwiLang') || 'fr'; } catch (_) {}
    const fallback = lang === 'ar' ? 'تعديلات متزامنة. تم الاحتفاظ بالأحدث وحفظ النسخة الأخرى للمراجعة.' : lang === 'en' ? 'Concurrent edits. The newest was kept and the alternative saved for review.' : 'Modifications simultanées. La plus récente est conservée, l’autre est gardée pour vérification.';
    if (root.KiwiI18n?.T?.[lang]) { root.KiwiI18n.T[lang]['merge.concurrent'] ||= fallback; return root.KiwiI18n.T[lang]['merge.concurrent']; }
    return fallback;
  }
  let shown = '';
  function notice(doc) {
    const cs = doc && doc.fieldEdits && doc.fieldEdits.conflicts;
    if (!cs || !cs.length) return;
    const signature = stable(cs);
    if (signature !== shown && root.Kiwi && root.Kiwi.toast) { shown = signature; root.Kiwi.toast(message(), { type:'warning' }); }
  }
  function review(base, current) { return stable(base) !== stable(current); }
  function floorDoc(doc) {
    const out = copy(doc || {});
    ['tables','elements','zones'].forEach(k => (out[k] || []).forEach(item => {
      Object.keys(item).forEach(f => { if (f === 'status' || f === 'since' || f[0] === '_') delete item[f]; });
    }));
    return out;
  }
  function floorStamp(doc, prev) { return stamp(floorDoc(doc), floorDoc(prev)); }
  function floorMerge(a, b) {
    const out = merge(floorDoc(a), floorDoc(b));
    (out.tables || []).forEach(item => {
      const local = (a.tables || []).find(t => t.id === item.id);
      if (local) ['status','since'].forEach(k => { if (Object.hasOwn(local,k)) item[k] = local[k]; });
    });
    return out;
  }
  root.KiwiFieldMerge = { stamp, merge, notice, message, review, floorStamp, floorMerge };
})(typeof globalThis !== 'undefined' ? globalThis : window);
