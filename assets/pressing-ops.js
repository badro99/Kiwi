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
    var rTs = readyAt instanceof Date ? readyAt.getTime() : (readyAt ? new Date(readyAt).getTime() : 0);
    if (rTs && rTs <= (now || Date.now())) return 'pret';
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
    var pieces = (o.pieces || []).slice(0, 120).map(function (p) {
      return {
        id: text(p.pid, 40), label: text(p.label, 100), itemId: text(p.itemId, 40), variantId: text(p.variantId, 40),
        status: ['recu', 'trait', 'pret', 'livre'].indexOf(p.status) >= 0 ? p.status : 'recu',
        services: (p.svcs || p.services || []).slice(0, 8).map(function (s) { return text(s, 24); }),
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
    var safe = (orders || []).slice(0, 500).map(function (o) {
      var customer = helpers.customer ? helpers.customer(o) : (o.customer || o.guest || {});
      var total = helpers.total ? helpers.total(o) : o.total;
      return sanitizeOrder(o, customer, total);
    }).filter(function (o) { return o.id; });
    try { localStorage.setItem(k, JSON.stringify(safe)); } catch (_) { return false; }
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

  function mergeDocuments(mine, theirs) {
    var cancellations = mergeRows(mine && mine.cancellations, theirs && theirs.cancellations);
    var orders = mergeRows(mine && mine.orders, theirs && theirs.orders).map(function (row) {
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

  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(STORE_PREFIX) === 0) { projectFull(readFull()); return; }
    if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
    var rows = read();
    listeners.forEach(function (fn) { try { fn(rows); } catch (_) {} });
  });

  /* `orderStatus` is exported so the owner dashboard derives readiness the same
     way `summary()` does. The snapshot's stored `status` is frozen at sync time;
     anything reading it after an order crosses `readyAt` gets a stale answer. */
  window.KiwiPressingOps = { read: read, replace: replace, summary: summary, subscribe: subscribe, scope: scope, bindCloud: bindCloud, cancelOrder: cancelOrder, orderStatus: orderStatus };
})();
