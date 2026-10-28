/* Kiwi · PRESSING NUMBERING — the rules that give each ticket its number when
 * two copies of the shop document meet (dashboard side).
 *
 * Moved out of assets/pressing-ops.js on 29 October 2026 (note 13 pressing#1):
 * the snapshot owner no longer carries the numbering rules in its own body.
 * The functions below are the former ones, unchanged, and still the exact twin
 * of the till's (assets/pressing/custody.js). pressing-ops.js receives them
 * once, through configureNumbering, and calls them when it merges documents.
 * Loaded right after pressing-ops.js (dashboard.html) and as a dependency of
 * the pressing till (assets/pos-dispatch.js).
 */
(function () {
  'use strict';

  /* Jumeau exact des règles de la caisse (assets/pressing-caisse.js :
     orderIdentity, renumberedOrder, mergeTills). Le tableau de bord remonte
     lui aussi ce document : s'il fusionnait autrement, deux bons distincts
     sous le même numéro redeviendraient un seul, ou le même bon prendrait deux
     numéros. tools/pressing-money-properties-test.mjs compare les deux. */
  function tillHash(textValue) {
    var a = 2166136261, b = 5381, str = String(textValue || '');
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619) >>> 0;
      b = (Math.imul(b, 33) + c) >>> 0;
    }
    return a.toString(36) + b.toString(36);
  }
  function baseNo(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    var m = raw.match(/(\d{4})/);
    if (m) return m[1];
    var digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return digits.length >= 4 ? digits.slice(0, 4) : ('0000' + digits).slice(-4);
  }
  function shownNo(o) {
    if (o && o.displayNo && /^(\d{4})(?:-([A-Z][A-Z0-9]{0,2}))?$/.test(String(o.displayNo))) return String(o.displayNo);
    return baseNo(o && o.id) || '0000';
  }
  function orderIdentity(o) {
    var t = o && o.droppedAt != null ? new Date(o.droppedAt).getTime() : NaN;
    return isFinite(t) ? t : null;
  }
  function renumberedOrder(o) {
    var A = 'abcdefghjklmnpqrstuvwxyz23456789'.toUpperCase();
    var h = tillHash(String(orderIdentity(o)) + ':' + String(o.id));
    var base = baseNo(o.id) || '0000';
    var id = base + '-R' + A[parseInt(h.slice(0, 6), 36) % 32];
    if (id === String(o.id)) id = base + '-R' + A[parseInt(h.slice(-6), 36) % 32] + A[parseInt(h.slice(0, 6), 36) % 32];
    var old = String(o.id);
    return Object.assign({}, o, {
      id: id, displayNo: id, renumberedFrom: o.renumberedFrom || shownNo(o),
      pieces: Array.isArray(o.pieces) ? o.pieces.map(function (p) {
        return p && typeof p.pid === 'string' && p.pid.indexOf(old + '-') === 0 ? Object.assign({}, p, { pid: id + p.pid.slice(old.length) }) : p;
      }) : o.pieces
    });
  }
  function mergeOrders(mine, theirs, depth) {
    var groups = Object.create(null);
    (theirs || []).concat(mine || []).forEach(function (row) {
      if (!row || !row.id) return;
      var g = groups[row.id] || (groups[row.id] = []);
      var t = orderIdentity(row);
      var slot = g.filter(function (x) { return x.t === null || t === null || x.t === t; })[0];
      if (!slot) { g.push({ t: t, row: row }); return; }
      if (slot.t === null) slot.t = t;
      if ((+row.updatedAt || 0) >= (+slot.row.updatedAt || 0)) slot.row = row;
    });
    var renamed = false, out = [];
    Object.keys(groups).forEach(function (id) {
      var g = groups[id];
      out.push(g[0].row);
      g.slice(1).forEach(function (x) { renamed = true; out.push(renumberedOrder(x.row)); });
    });
    return renamed && (depth || 0) < 4 ? mergeOrders(out, [], (depth || 0) + 1) : out;
  }
  function mergeTills(mine, theirs) {
    var out = {}, owner = Object.create(null);
    function rows(m) {
      m = m && typeof m === 'object' ? m : {};
      return Object.keys(m).map(function (k) { return [k, m[k]]; }).filter(function (e) {
        return /^d[a-z0-9]{6,24}$/.test(e[0]) && e[1] && /^[A-Z]{1,2}$/.test(String(e[1].letter || ''));
      }).sort(function (x, y) { return (+x[1].at || 0) - (+y[1].at || 0) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0); });
    }
    rows(theirs).concat(rows(mine)).forEach(function (e) {
      var letter = String(e[1].letter);
      if (out[e[0]] || owner[letter]) return;
      out[e[0]] = { letter: letter, at: +e[1].at || 0 };
      owner[letter] = e[0];
    });
    return out;
  }

  window.KiwiPressingOps.configureNumbering(Object.freeze({ renumberedOrder: renumberedOrder, mergeOrders: mergeOrders, mergeTills: mergeTills }));
})();
