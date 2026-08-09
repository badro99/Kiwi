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
  var listeners = new Set();

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
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      if (p) return slug(p.merchant || p.slug || p.venueId || p.name);
    } catch (_) {}
    return '';
  }

  function key(explicit) {
    var s = scope(explicit);
    return s ? PREFIX + s : '';
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
    var x = d instanceof Date ? d : new Date(d || 0);
    return Number.isFinite(x.getTime()) ? x.toISOString() : '';
  }

  function orderStatus(pieces) {
    var st = (pieces || []).map(function (p) { return p.status; });
    if (st.length && st.every(function (s) { return s === 'livre'; })) return 'livre';
    if (st.length && st.every(function (s) { return s === 'pret' || s === 'livre'; })) return 'pret';
    if (st.some(function (s) { return s === 'trait' || s === 'pret'; })) return 'trait';
    return 'recu';
  }

  function sanitizeOrder(o, customer, total) {
    var pieces = (o.pieces || []).slice(0, 120).map(function (p) {
      return {
        id: text(p.pid, 40), label: text(p.label, 100), itemId: text(p.itemId, 40),
        status: ['recu', 'trait', 'pret', 'livre'].indexOf(p.status) >= 0 ? p.status : 'recu',
        photos: number(p.photos), notes: number(p.photos) > 0
      };
    });
    var paid = number(o.pay && o.pay.paid);
    var amount = number(total);
    return {
      id: text(o.id, 40),
      customer: { name: text(customer && customer.name, 100), phone: text(customer && customer.phone, 40), b2b: !!(customer && customer.b2b) },
      droppedAt: iso(o.droppedAt), readyAt: iso(o.readyAt), collectedAt: iso(o.collectedAt),
      status: orderStatus(pieces), pieces: pieces, rack: text(o.rack, 20),
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
    var out = { orders: rows, active: 0, received: 0, treating: 0, ready: 0, delivered: 0, late: 0, due: 0, pieces: 0, attention: 0, racks: 0, unnotified: 0 };
    rows.forEach(function (o) {
      var live = o.status !== 'livre';
      if (live) out.active++;
      if (o.status === 'recu') out.received++;
      if (o.status === 'trait') out.treating++;
      if (o.status === 'pret') out.ready++;
      if (o.status === 'livre') out.delivered++;
      if (live && o.status !== 'pret' && o.readyAt && new Date(o.readyAt).getTime() < now) out.late++;
      if (live) out.due += number(o.due);
      if (live) out.pieces += (o.pieces || []).filter(function (p) { return p.status !== 'livre'; }).length;
      if (live) out.attention += (o.pieces || []).filter(function (p) { return p.notes; }).length;
      if (live && o.rack) out.racks++;
      if (o.status === 'pret' && !o.notified) out.unnotified++;
    });
    return out;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
    var rows = read();
    listeners.forEach(function (fn) { try { fn(rows); } catch (_) {} });
  });

  window.KiwiPressingOps = { read: read, replace: replace, summary: summary, subscribe: subscribe, scope: scope };
})();
