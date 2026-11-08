/* Kiwi · PRESSING NUMBERING — the rules that give each ticket its number when
 * two copies of the shop document meet (dashboard side).
 *
 * Moved out of assets/pressing-ops.js on 29 October 2026 (note 13 pressing#1):
 * the snapshot owner no longer carries the numbering rules in its own body.
 * r21 pressing#B1: this is now the ONLY copy of the rules. The till
 * (assets/pressing/custody.js) no longer carries a twin: it reads them from
 * KiwiPressingOps.numbering(). pressing-ops.js receives them once, through
 * configureNumbering, and calls them when it merges documents.
 * Loaded right after pressing-ops.js (dashboard.html) and as a dependency of
 * the pressing till (assets/pos-dispatch.js).
 */
(function () {
  'use strict';

  /* Règles uniques, lues par la caisse (assets/pressing/custody.js) comme par
     le tableau de bord : si l'un fusionnait autrement, deux bons distincts
     sous le même numéro redeviendraient un seul, ou le même bon prendrait deux
     numéros. */
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
  /* Qui garde le numéro d'origine ne dépend pas de l'ordre dans lequel deux
     copies se rencontrent (r21 pressing#B0) : toutes les lignes sont d'abord
     rangées par heure de dépôt (sans heure en premier), puis par leur contenu.
     Le bon déposé le premier garde donc « 0042 ».
     Une exception voulue, `options.anchored` : face à la copie du SERVEUR
     (`theirs`), un numéro que le serveur a déjà accepté ne change plus (c'est
     aussi ce que fait store.js : un numéro porté par un autre bon y répond 409).
     Les bons du serveur passent alors avant ceux de la caisse, chaque côté
     restant rangé de la même façon. Sans cette règle, la caisse renuméroterait
     le bon du serveur et se ferait refuser sans fin. Les appelants qui
     fusionnent avec le serveur (caisse, tableau de bord) l'ont tous.
     `options.reconcile(old, row)` choisit la copie gagnante d'un même bon ; le
     tableau de bord garde la plus récente, la caisse y ajoute les remises et
     annulations (assets/pressing/custody.js). */
  function newerRow(old, row) { return (+row.updatedAt || 0) >= (+old.updatedAt || 0) ? row : old; }
  function stableKey(row) { try { return JSON.stringify(row); } catch (_) { return String(row.id); } }
  function mergeOrders(mine, theirs, options, depth) {
    var reconcile = options && typeof options.reconcile === 'function' ? options.reconcile : newerRow;
    var anchored = !!(options && options.anchored);
    function item(side) {
      return function (row) { return { row: row, side: anchored ? side : 0, t: orderIdentity(row), key: stableKey(row) }; };
    }
    var rows = (theirs || []).filter(function (row) { return row && row.id; }).map(item(0))
      .concat((mine || []).filter(function (row) { return row && row.id; }).map(item(1)))
      .sort(function (x, y) {
        if (x.side !== y.side) return x.side - y.side;
        var tx = x.t === null ? -Infinity : x.t, ty = y.t === null ? -Infinity : y.t;
        return tx < ty ? -1 : tx > ty ? 1 : (x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
      });
    var groups = Object.create(null);
    rows.forEach(function (entry) {
      var row = entry.row, t = entry.t;
      var g = groups[row.id] || (groups[row.id] = []);
      var slot = g.filter(function (x) { return x.t === null || t === null || x.t === t; })[0];
      if (!slot) { g.push({ t: t, row: row }); return; }
      if (slot.t === null) slot.t = t;
      slot.row = reconcile(slot.row, row);
    });
    var renamed = false, out = [];
    Object.keys(groups).forEach(function (id) {
      var g = groups[id];
      out.push(g[0].row);
      g.slice(1).forEach(function (x) { renamed = true; out.push(renumberedOrder(x.row)); });
    });
    return renamed && (depth || 0) < 4 ? mergeOrders(out, [], options, (depth || 0) + 1) : out;
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

  window.KiwiPressingOps.configureNumbering(Object.freeze({ tillHash: tillHash, orderIdentity: orderIdentity, renumberedOrder: renumberedOrder, mergeOrders: mergeOrders, mergeTills: mergeTills }));
})();
