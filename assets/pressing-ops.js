/* Kiwi · shared pressing operations snapshot
 *
 * The pressing till owns the detailed garment workflow. This tiny bridge keeps
 * a tenant-scoped, presentation-safe snapshot so the owner dashboard can show
 * the same orders, promised dates, rack locations and balances. It deliberately
 * does not invent demo work for a real merchant and it never stores a PIN.
 */
(function () {
  'use strict';

  var PREFIX = 'kiwi:pressing-ops:v1:';
  var STORE_PREFIX = 'kiwi:pressing-store:v1:';
  var listeners = new Set();
  var cloudHandle = null;

  function slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function scope(explicit) {
    if (explicit) return slug(explicit);
    try {
      var v = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (v) return slug(v.slug || v.id || v.name);
    } catch (_) {}
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
        var pm = window.KiwiPlatform.pairedMerchant();
        if (pm) return slug(pm);
      }
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      if (p) return slug(p.merchant || p.slug || p.venueId || p.name);
    } catch (_) {}
    return '';
  }

  function key(explicit) {
    var s = scope(explicit);
    return s ? PREFIX + s : '';
  }

  function storeKey(explicit) {
    var s = scope(explicit);
    return s ? STORE_PREFIX + s : '';
  }

  function read(explicit) {
    var k = key(explicit);
    if (!k) return [];
    try {
      var rows = JSON.parse(localStorage.getItem(k) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }

  function number(n) { return Math.max(0, Number(n) || 0); }
  function text(s, max) { return String(s == null ? '' : s).trim().slice(0, max || 100); }
  function iso(d) {
    if (d == null || d === '') return '';
    var x = d instanceof Date ? d : new Date(d || 0);
    return Number.isFinite(x.getTime()) ? x.toISOString() : '';
  }

  function effectiveStatus(p, readyAt, now) {
    if (!p) return 'recu';
    if (p.status === 'livre') return 'livre';
    if (p.status === 'pret') return 'pret';
    return p.status || 'recu';
  }

  function orderStatus(pieces, readyAt, now, cancelledAt) {
    if (cancelledAt) return 'annule';
    var t = now || Date.now();
    var st = (pieces || []).map(function (p) { return effectiveStatus(p, readyAt, t); });
    if (st.length && st.every(function (s) { return s === 'livre'; })) return 'livre';
    if (st.length && st.every(function (s) { return s === 'pret' || s === 'livre'; })) return 'pret';
    if (st.some(function (s) { return s === 'trait' || s === 'pret'; })) return 'trait';
    return 'recu';
  }

  function sanitizeOrder(o, customer, total) {
    var pieces = (o.pieces || []).map(function (p) {
      return {
        id: text(p.pid, 40), label: text(p.label, 100), itemId: text(p.itemId, 40), variantId: text(p.variantId, 40),
        status: ['recu', 'trait', 'pret', 'livre'].indexOf(p.status) >= 0 ? p.status : 'recu',
        services: (p.svcs || p.services || []).map(function (s) { return text(s, 24); }),
        photos: number(p.photos),
        notes: number(p.photos) > 0 || !!(p.freeNote && text(p.freeNote, 300)) || !!(p.notes && p.notes.length)
      };
    });
    var paid = number(o.pay && o.pay.paid);
    var amount = number(total);
    return {
      id: text(o.id, 40),
      customer: { name: text(customer && customer.name, 100), phone: text(customer && customer.phone, 40), b2b: !!(customer && customer.b2b) },
      droppedAt: iso(o.droppedAt), readyAt: iso(o.readyAt), collectedAt: iso(o.collectedAt),
      status: o.cancelledAt ? 'annule' : orderStatus(pieces, o.readyAt), pieces: pieces, rack: text(o.rack, 20),
      refundDue: Math.max(0, Number(o.refundDue) || 0), refundEntry: o.refundEntry || null,
      cancelledAt: iso(o.cancelledAt), cancelledBy: o.cancelledBy ? {
        id: text(o.cancelledBy.id, 80), name: text(o.cancelledBy.name, 100), role: text(o.cancelledBy.role, 40)
      } : null,
      notified: !!o.notified, total: amount, paid: Math.min(amount, paid),
      due: o.pay && o.pay.mode === 'compte' ? 0 : Math.max(0, amount - paid),
      channel: text(o.channel || 'counter', 24)
    };
  }

  function replace(orders, helpers, explicit) {
    var k = key(explicit);
    if (!k) return false;
    helpers = helpers || {};
    var safe = (orders || []).map(function (o) {
      var customer = helpers.customer ? helpers.customer(o) : (o.customer || o.guest || {});
      var total = helpers.total ? helpers.total(o) : o.total;
      return sanitizeOrder(o, customer, total);
    }).filter(function (o) { return o.id; });
    var json = JSON.stringify(safe), previous = null;
    try { previous = localStorage.getItem(k); localStorage.setItem(k, json); } catch (_) { return false; }
    /* Une relecture périodique qui ne change rien ne doit pas reconstruire la
       page : on ne prévient les abonnés que si le contenu a bougé. */
    if (previous === json) return true;
    listeners.forEach(function (fn) { try { fn(safe); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('kiwi:pressing-ops', { detail: { scope: scope(explicit) } })); } catch (_) {}
    return true;
  }

  function summary(explicit) {
    var rows = read(explicit);
    var now = Date.now();
    var out = { orders: rows, active: 0, received: 0, treating: 0, ready: 0, delivered: 0, late: 0, due: 0, pieces: 0, attention: 0, racks: 0, unnotified: 0, services: {} };
    rows.forEach(function (o) {
      if (o.cancelledAt || o.status === 'annule') return;
      var st = orderStatus(o.pieces, o.readyAt, now);
      var live = st !== 'livre';
      if (live) out.active++;
      if (st === 'recu') out.received++;
      if (st === 'trait') out.treating++;
      if (st === 'pret') out.ready++;
      if (st === 'livre') out.delivered++;
      if (live && o.readyAt && new Date(o.readyAt).getTime() < now) out.late++;
      if (live) out.due += number(o.due);
      if (live) out.pieces += (o.pieces || []).filter(function (p) { return effectiveStatus(p, o.readyAt, now) !== 'livre'; }).length;
      if (live) out.attention += (o.pieces || []).filter(function (p) { return p.notes; }).length;
      if (live) (o.pieces || []).forEach(function (p) {
        (p.services || []).forEach(function (service) { out.services[service] = number(out.services[service]) + 1; });
      });
      if (live && o.rack) out.racks++;
      if (st === 'pret' && !o.notified) out.unnotified++;
    });
    return out;
  }

  /* Les dépôts d'une fenêtre : combien de bons ont été DÉPOSÉS, et pour quel
     montant. L'Accueil lisait « Dépôts » et « Bon moyen » dans le journal des
     encaissements : un bon payé au retrait n'y entre qu'au retrait, un acompte
     puis son solde y comptent deux fois, un bon annulé y reste. Trois bons
     déposés (226, 64 et 90 MAD) s'affichaient « 2 dépôts · bon moyen 57 MAD ».
     Ici on compte les bons eux-mêmes, par date de dépôt, annulés exclus. */
  function dropoffStats(from, to, explicit) {
    var lo = +from || 0, hi = to == null || to === Infinity ? Infinity : +to;
    var count = 0, total = 0;
    read(explicit).forEach(function (o) {
      if (!o || o.cancelledAt || o.status === 'annule') return;
      var ts = o.droppedAt ? Date.parse(o.droppedAt) : NaN;
      if (!Number.isFinite(ts) || ts < lo || ts >= hi) return;
      count++; total += number(o.total);
    });
    return { count: count, total: total, basket: count ? total / count : 0 };
  }

  function subscribe(fn) {
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  function mergeRows(mine, theirs) {
    var byId = Object.create(null);
    (theirs || []).concat(mine || []).forEach(function (row) {
      if (!row || !row.id) return;
      var old = byId[row.id];
      if (!old || (+row.updatedAt || 0) >= (+old.updatedAt || 0)) byId[row.id] = row;
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

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

  function mergeDocuments(mine, theirs) {
    var cancellations = mergeRows(mine && mine.cancellations, theirs && theirs.cancellations);
    var orders = mergeOrders(mine && mine.orders, theirs && theirs.orders).map(function (row) {
      var tombstone = cancellations.find(function (c) { return c.id === row.id; });
      if (!tombstone) return row;
      return Object.assign({}, row, {
        cancelledAt: tombstone.cancelledAt,
        cancelledBy: tombstone.cancelledBy || null,
        updatedAt: Math.max(+row.updatedAt || 0, Date.parse(tombstone.cancelledAt || '') || 0)
      });
    });
    return {
      customers: mergeRows(mine && mine.customers, theirs && theirs.customers),
      orders: orders,
      cancellations: cancellations,
      seq: Math.max(+(mine && mine.seq) || 0, +(theirs && theirs.seq) || 0),
      tills: mergeTills(mine && mine.tills, theirs && theirs.tills),
      updatedAt: Math.max(+(mine && mine.updatedAt) || 0, +(theirs && theirs.updatedAt) || 0)
    };
  }

  function readFull() {
    var k = storeKey();
    if (!k) return { customers: [], orders: [], cancellations: [], seq: 0, updatedAt: 0 };
    try {
      var doc = JSON.parse(localStorage.getItem(k) || 'null');
      return doc && Array.isArray(doc.customers) && Array.isArray(doc.orders)
        ? Object.assign({ cancellations: [] }, doc) : { customers: [], orders: [], cancellations: [], seq: 0, updatedAt: 0 };
    } catch (_) { return { customers: [], orders: [], cancellations: [], seq: 0, updatedAt: 0 }; }
  }

  function projectFull(doc) {
    if (!doc || !Array.isArray(doc.orders)) return;
    var customers = Object.create(null);
    (doc.customers || []).forEach(function (c) { if (c && c.id) customers[c.id] = c; });
    var cancellations = Object.create(null);
    (doc.cancellations || []).forEach(function (c) {
      if (c && c.id) cancellations[c.id] = c;
    });
    var orders = doc.orders.map(function (o) {
      var tombstone = o && cancellations[o.id];
      return tombstone ? Object.assign({}, o, {
        cancelledAt: tombstone.cancelledAt,
        cancelledBy: tombstone.cancelledBy || null
      }) : o;
    });
    replace(orders, {
      customer: function (o) { return customers[o.custId] || o.guest || {}; },
      total: function (o) { return number(o.total); }
    });
  }


  function writeFull(doc) {
    var k = storeKey();
    if (!k || !doc) return;
    try { localStorage.setItem(k, JSON.stringify(doc)); } catch (_) { return; }
    projectFull(doc);
  }

  function bindCloud() {
    if (cloudHandle) {
      projectFull(readFull());
      cloudHandle.bind();
      startLive();
      return cloudHandle;
    }
    if (!window.KiwiCloudDoc || !scope()) return cloudHandle;
    cloudHandle = KiwiCloudDoc.attach({
      feature: 'pressing-orders', slug: scope, localKey: storeKey,
      read: readFull, write: writeFull, merge: mergeDocuments,
      isEmpty: function (doc) { return !doc || (!(doc.orders || []).length && !(doc.customers || []).length && !(doc.cancellations || []).length); },
      onPulled: projectFull
    });
    projectFull(readFull());
    cloudHandle.bind();
    startLive();
    return cloudHandle;
  }

  function cancelOrder(id, actor, at) {
    if (!id) return false;
    var cancelledAt = iso(at) || new Date().toISOString();
    var full = readFull();
    if (full && Array.isArray(full.orders)) {
      var found = false;
      var safeActor = actor ? { id: text(actor.id, 80), name: text(actor.name, 100), role: text(actor.role, 40) } : null;
      full.orders = full.orders.map(function (o) {
        if (!o || o.id !== id) return o;
        found = true;
        return Object.assign({}, o, { cancelledAt: cancelledAt, cancelledBy: safeActor, updatedAt: Date.parse(cancelledAt) });
      });
      if (!found) return false;
      full.cancellations = Array.isArray(full.cancellations) ? full.cancellations.filter(function (c) { return c && c.id !== id; }) : [];
      full.cancellations.push({ id: text(id, 40), cancelledAt: cancelledAt, cancelledBy: safeActor });
      full.updatedAt = Date.now();
      writeFull(full);
      if (cloudHandle && cloudHandle.push) cloudHandle.push();
    }
    var rows = read();
    var filtered = rows.map(function (o) {
      return o && o.id === id ? Object.assign({}, o, { status: 'annule', cancelledAt: cancelledAt, cancelledBy: actor || null }) : o;
    });
    var k = key();
    if (k) {
      try { localStorage.setItem(k, JSON.stringify(filtered)); } catch (_) {}
    }
    listeners.forEach(function (fn) { try { fn(filtered); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('kiwi:pressing-ops', { detail: { scope: scope() } })); } catch (_) {}
    return true;
  }

  /* Le tableau de bord ne relisait la copie serveur qu'à l'ouverture et au
     retour sur l'onglet : une page « Dépôts & commandes » laissée ouverte
     pendant que la caisse travaille restait figée. Tant que l'onglet est
     visible, on relit toutes les 20 s ; projectFull() ne notifie que si les
     commandes ont réellement changé, pour ne pas reconstruire la page sous le
     curseur à vide. */
  var LIVE_MS = 20000, liveTimer = null;
  function liveTick() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!cloudHandle || !cloudHandle.pull) return;
    try { var r = cloudHandle.pull(false); if (r && r.catch) r.catch(function () {}); } catch (_) {}
  }
  function startLive() {
    if (liveTimer) return;
    liveTimer = setInterval(liveTick, LIVE_MS);
  }

  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(STORE_PREFIX) === 0) { projectFull(readFull()); return; }
    if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
    var rows = read();
    listeners.forEach(function (fn) { try { fn(rows); } catch (_) {} });
  });

  /* `orderStatus` is exported so the owner dashboard derives readiness the same
     way `summary()` does. The snapshot's stored `status` is frozen at sync time;
     anything reading it after an order crosses `readyAt` gets a stale answer. */
  window.KiwiPressingOps = { read: read, replace: replace, summary: summary, subscribe: subscribe, scope: scope, bindCloud: bindCloud, cancelOrder: cancelOrder, orderStatus: orderStatus, dropoffStats: dropoffStats, mergeDocuments: mergeDocuments };
})();

/* ── Garment product art (formerly assets/pressing-garment-icons.js) ──────────
 * Same file, same order as the two former <script> tags: kept verbatim below. */
/* Kiwi · shared pressing product photography
 * One semantic product-art system for the owner dashboard and every paired till.
 */
(function () {
  'use strict';
  var art = (inner) => `<svg class="px-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  var ART = {
    chemise: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3-5 5h-6z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12l6 8 6-8" /><path class="thin" d="M32 22v30"/><circle class="thin" cx="29.5" cy="28" r=".9"/><circle class="thin" cx="29.5" cy="36" r=".9"/><circle class="thin" cx="29.5" cy="44" r=".9"/>`),
    tshirt: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M22 12c2 3.5 10 3.5 12 0" transform="translate(4 0)"/>`),
    pull: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12c1.5 3 10.5 3 12 0" /><path class="thin" d="M20 49h24M20 45.5h24"/><path class="thin" d="M16.5 28.5l3.5-2.5M47.5 28.5 44 26"/>`),
    veste: art(`<path class="fill" d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4-4-1c-2 3-8 3-12 0z"/><path d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4"/><path d="M26 11l6 13 6-13"/><path d="M32 24v30"/><circle class="thin" cx="35.5" cy="36" r="1.1"/>`),
    costume: art(`<path d="M32 5c-2.6 0-4 1.6-4 3.4 0 1.7 1.4 3 3.2 3.2L32 12"/><path d="M32 12l17 9H15z"/><path class="fill" d="M17 21l4 33h22l4-33z"/><path d="M17 21l4 33h22l4-33"/><path d="M25 21l7 11 7-11"/><path class="thin" d="M32 32v22"/>`),
    manteau: art(`<path class="fill" d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5-3-1c-2 3-9 3-13 0z"/><path d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5"/><path d="M26 9l6 11 6-11"/><path d="M20 40h24"/><path class="thin" d="M30 40h4v3h-4z"/><path class="thin" d="M32 20v34"/>`),
    pantalon: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M26.5 24v24M37.5 24v24"/>`),
    jean: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M22 21c3 3 7 3 9 0M42 21c-3 3-7 3-9 0"/><circle class="thin" cx="32" cy="13.5" r="1"/>`),
    jupe: art(`<path d="M24 11h16l1 6H23z"/><path class="fill" d="M23 17 15 51c10 4 24 4 34 0l-8-34z"/><path d="M23 17 15 51c10 4 24 4 34 0l-8-34"/><path class="thin" d="M27 20l-4 30M37 20l4 30"/>`),
    short: art(`<path class="fill" d="M20 12h24v7l3 20H33l-1-11-1 11H17l3-20z"/><path d="M20 12h24v7H20z"/><path d="M20 19l-3 20h14l1-11 1 11h14l-3-20"/><path class="thin" d="M32 22v6"/>`),
    robe: art(`<path d="M27 9c1.5 2.6 8.5 2.6 10 0l4 7-2 9"/><path d="M27 9l-4 7 2 9"/><path class="fill" d="M25 25h14c6 9 8 17 8 27H17c0-10 2-18 8-27z"/><path d="M25 25c-6 9-8 17-8 27h30c0-10-2-18-8-27"/><path d="M25 25h14"/>`),
    robe_soiree: art(`<path d="M28 8c1.3 2.2 6.7 2.2 8 0l3 5-2 9"/><path d="M28 8l-3 5 2 9"/><path class="fill" d="M27 22h10l11 30c-10 4-22 4-32 0z"/><path d="M27 22 16 52c10 4 22 4 32 0L37 22"/><path d="M27 22h10"/><path class="thin" d="M30 30 24 50M36 32l5 16"/>`),
    caftan: art(`<path class="fill" d="M26 8h12l3 7v39H23V15z"/><path d="M26 8h12l3 7v39H23V15z"/><path d="M26 9 10 23l4 5 9-7"/><path d="M38 9l16 14-4 5-9-7"/><path d="M32 15v39"/><path class="thin" d="M29 20h6M29 25h6M29 30h6M29 35h6"/>`),
    drap: art(`<rect class="fill" x="10" y="17" width="44" height="30" rx="4"/><rect x="10" y="17" width="44" height="30" rx="4"/><path class="thin" d="M10 27h44M10 37h44"/>`),
    housse: art(`<rect class="fill" x="10" y="14" width="44" height="36" rx="4"/><rect x="10" y="14" width="44" height="36" rx="4"/><path class="thin" d="M10 16l22 16 22-16"/><circle class="thin" cx="24" cy="44" r="1"/><circle class="thin" cx="32" cy="44" r="1"/><circle class="thin" cx="40" cy="44" r="1"/>`),
    couverture: art(`<path class="fill" d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M14 30c0-8 5-14 14-14h22v8H28"/><path class="thin" d="M6 39h52"/>`),
    nappe: art(`<path class="fill" d="M9 22h46l-5 22H14z"/><path d="M9 22h46l-5 22H14z"/><path d="M9 22l-3 9M55 22l3 9"/><path class="thin" d="M22 22l2 22M42 22l-2 22M12 33h40"/><path d="M18 44v10M46 44v10"/>`),
    rideaux: art(`<path d="M8 10h48"/><path class="fill" d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path class="thin" d="M21 14v13M26 14v11"/><path d="M12 34c7 4 15 4 20-1"/><path class="thin" d="M40 14h8v40h-8c2-14 2-26 0-40z"/>`),
    tapis: art(`<circle class="fill" cx="19" cy="25" r="9.5"/><circle cx="19" cy="25" r="9.5"/><circle class="thin" cx="19" cy="25" r="4"/><path class="fill" d="M19 34.5h27l9 15H13z"/><path d="M28.5 25H46l9 15.5"/><path d="M19 34.5h27l9 15H13z"/><path class="thin" d="M22 54v4M30 54v4M38 54v4M46 54v4"/>`),
    veste_cuir: art(`<path class="fill" d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4-4-2c-2 3-8 3-12 0z"/><path d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4"/><path d="M25 12l4 6-3 5"/><path d="M39 12l-4 6 3 5"/><path d="M29 23l8 31"/><path class="thin" d="M31 28l3-1M33 35l3-1M35 42l3-1"/><circle class="thin" cx="24" cy="20" r="1"/><circle class="thin" cx="40" cy="20" r="1"/>`),
    daim: art(`<path class="fill" d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4-3-1c-2 3-9 3-13 0z"/><path d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4"/><path d="M26 11c2 3 10 3 12 0"/><path d="M21 38h22"/><path class="thin" d="M24 38v8M28 38v7M32 38v8M36 38v7M40 38v8"/>`),
    doudoune: art(`<path class="fill" d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6-3-1c-2 3-10 3-12 0z"/><path d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6"/><path d="M26 11c1.5 3 10.5 3 12 0"/><path class="thin" d="M19 24c8 3 18 3 26 0M19 32c8 3 18 3 26 0M19 40c8 3 18 3 26 0M19 47.5c8 3 18 3 26 0"/><path d="M32 14v40"/>`),
    chaussures: art(`<path class="fill" d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 45h44"/><path class="thin" d="M27 30l4 3M24 33l4 3M21 36l4 3"/>`),
    baskets: art(`<path class="fill" d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44h48v3c-18 3-32 3-48 0z"/><path class="thin" d="M26 29l4 3M23 32l4 3"/><path class="thin" d="M38 31c-3 5-8 7-14 7"/>`),
    babouches: art(`<path class="fill" d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path class="thin" d="M26 34.5c4 1.5 6 4 6 7.5"/><path class="thin" d="M40 32.6c-1 4.4-1 6.6 0 9.4"/>`),
  };

  /* Real catalogue photography replaces the old line-art at every shared
   * render site (catalogue, till, ticket, detail and owner dashboard). Variant
   * assets keep suits and carpets visually truthful without changing the
   * catalogue document or any historical ticket. */
  var PHOTO = {
    chemise:'chemise', tshirt:'tshirt', pull:'pull', veste:'veste',
    costume:'costume-2p', manteau:'manteau', pantalon:'pantalon', jean:'jean',
    jupe:'jupe', short:'short', robe:'robe', robe_soiree:'robe-soiree',
    caftan:'caftan', drap:'drap', housse:'housse', couverture:'couverture',
    nappe:'nappe', rideaux:'rideaux', tapis:'tapis-s', veste_cuir:'veste-cuir',
    daim:'daim', doudoune:'doudoune', chaussures:'chaussures', baskets:'baskets',
    babouches:'babouches'
  };

  function resolve(item) {
    item = item || {};
    if (ART[item.id]) return item.id;
    var text = String((item.label || '') + ' ' + (item.id || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    var names = [
      ['robe_soiree', /robe de soiree|gown/], ['veste_cuir', /veste cuir|cuir/],
      ['tshirt', /t[ -]?shirt/], ['chemise', /chemise|shirt/], ['pull', /pull|sweat|hoodie/],
      ['costume', /costume|gilet|suit/], ['manteau', /manteau|coat/], ['doudoune', /doudoune/],
      ['pantalon', /pantalon|trouser/], ['jean', /jean/], ['jupe', /jupe|skirt/], ['short', /short/],
      ['caftan', /caftan|takchita/], ['robe', /robe|dress/], ['drap', /drap/], ['housse', /housse/],
      ['couverture', /couverture|blanket/], ['nappe', /nappe/], ['rideaux', /rideau|curtain/], ['tapis', /tapis|rug/],
      ['daim', /daim|suede/], ['baskets', /basket|sneaker/], ['babouches', /babouche/], ['chaussures', /chaussure|shoe/],
      ['veste', /veste|blazer|jacket/]
    ];
    for (var i=0;i<names.length;i++) if (names[i][1].test(text)) return names[i][0];
    if (ART[item.art]) return item.art;
    return { bas:'pantalon', robes:'robe', linge:'drap', cuir:'veste_cuir', chaussures:'chaussures' }[item.cat] || 'chemise';
  }
  function render(item, cls) {
    item = item || {};
    var id = resolve(item);
    var photo = PHOTO[id] || PHOTO.chemise;
    if (id === 'costume' && item.variantId === '3p') photo = 'costume-3p';
    if (id === 'tapis' && ['s','m','l'].indexOf(item.variantId) >= 0) photo = 'tapis-' + item.variantId;
    var classes = 'px-product-photo' + (cls ? ' ' + String(cls).replace(/[^a-z0-9_-]+/gi, ' ') : '');
    return '<img class="' + classes + '" src="assets/pressing-products/' + photo + '.png" alt="" aria-hidden="true" loading="lazy" decoding="async">';
  }
  window.KiwiPressingGarmentIcons = Object.freeze({
    render: render,
    resolve: resolve,
    has: function (id) { return !!ART[id]; },
    ids: Object.freeze(Object.keys(ART))
  });
})();
