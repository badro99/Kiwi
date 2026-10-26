/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · floorplan-live.js — the room as it really is, for the Plan de salle
 *
 * The owner's plan used to show a status typed by hand. A table ticked
 * « Occupée » one Tuesday read "1514 h 59" two months later, and the KPI
 * "1 occ." disagreed with the counter. This module is the one place the
 * dashboard learns what the till knows:
 *
 *   · watch(cb)     polls GET /api/floor/live while the page is visible, for a
 *                   real store only (a demo venue has no counter behind it);
 *   · resolve()     one table's effective service status, from the till first,
 *                   then today's booking, then the owner's own holds;
 *   · bookings()    today's Réservations, matched onto plan tables;
 *   · since()       the seated-time chip, capped so a forgotten table reads as
 *                   "to check", never as 63 days.
 *
 * Fail-soft: no network, an old base or a 5xx keeps the last known room and
 * says so (`stale`), it never paints every table free.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var POLL_MS = 8000;
  var subs = [];
  var timer = 0;
  var last = null, lastSlug = '';
  function currentRoom() { return lastSlug === slug() ? last : null; }
  var inflight = false;
  var idleDelay = POLL_MS, signature = null;

  /* The till's vocabulary → the plan's. Same five states the caisse paints. */
  var FROM_TILL = {
    'khawya': 'free',
    'a-commander': 'ordering',
    'ka-yaklo': 'occupied',
    'ka-tkhdam': 'occupied',
    'bgha-ykhlass': 'bill',
    'khlass': 'paid',
  };
  /* Every status the plan can show. `reserved` and `out` are the owner's: the
     till does not know a booking is due or that table 6 has a broken leg. */
  var STATUSES = ['free', 'ordering', 'occupied', 'bill', 'paid', 'reserved', 'out'];
  /* Older plans stored « À nettoyer ». It meant paid and waiting to be cleared,
     which is the till's `khlass`. */
  function normalizeStatus(s) {
    s = String(s || 'free');
    if (s === 'cleaning') return 'paid';
    return STATUSES.indexOf(s) >= 0 ? s : 'free';
  }

  function tableKey(value) {
    return String(value == null ? '' : value).trim().replace(/^table\s*/i, '').replace(/^t(?=\d+$)/i, '').slice(0, 32);
  }

  function isReal() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true;
    } catch (_) {}
    return false;
  }
  function slug() {
    try { return (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || ''; }
    catch (_) { return ''; }
  }

  function emit() { subs.slice().forEach(function (fn) { try { fn(last); } catch (_) {} }); }

  function poll() {
    if (inflight || !subs.length) return;
    if (document.visibilityState === 'hidden') return;
    var s = slug();
    if (!s || !isReal()) {
      lastSlug = s;
      last = { ok: false, live: false, reason: 'demo', tables: {}, stats: {}, at: Date.now() };
      emit();
      schedule();
      return;
    }
    inflight = true;
    import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; }).then(function (net) { return net.deadlineFetch('/api/floor/live?merchant=' + encodeURIComponent(s), { credentials: 'same-origin', cache: 'no-store' }); })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http-' + r.status)); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error('bad-body');
        /* The plan may have switched store while the request was in flight. */
        if (s !== slug()) return;
        var next = JSON.stringify([s, d.tables || {}, d.stats || {}, d.partial || {}, d.dayStart]);
        idleDelay = next === signature ? Math.min(60000, idleDelay * 2) : POLL_MS;
        signature = next;
        lastSlug = s;
        last = { ok: true, live: true, stale: false, tables: d.tables || {}, stats: d.stats || {},
                 dayStart: Number(d.dayStart) || 0, partial: d.partial || {},
                 /* Last authenticated poll from a paired till (server clock).
                    `live` only says the server answered; this says a till
                    is actually switched on. 0 = never seen. */
                 tillSeen: Number(d.tillSeen) || 0,
                 at: Date.now(), skew: (Number(d.now) || Date.now()) - Date.now() };
        emit();
      })
      .catch(function () {
        if (s !== slug()) return;
        idleDelay = Math.min(60000, idleDelay * 2);
        /* Keep the last room, flagged. A blank room would be a lie too. */
        last = currentRoom() && last.live
          ? Object.assign({}, last, { stale: true })
          : { ok: false, live: false, reason: 'offline', tables: {}, stats: {}, at: Date.now() };
        lastSlug = s;
        emit();
      })
      .then(function () { inflight = false; schedule(); });
  }

  function schedule() {
    stop();
    if (subs.length && !document.hidden) timer = setTimeout(poll, Math.min(15000, window.KiwiPoll?.delay(idleDelay) ?? idleDelay));
  }
  function start() { if (!timer && !inflight) poll(); }
  function stop() { if (timer) { clearTimeout(timer); timer = 0; } }
  function wake() {
    stop(); idleDelay = POLL_MS;
    if (!document.hidden && subs.length) poll();
  }
  document.addEventListener('visibilitychange', wake);
  document.addEventListener('kiwi:request-wake', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);

  function watch(fn) {
    if (typeof fn !== 'function') return function () {};
    subs.push(fn);
    if (currentRoom()) { try { fn(currentRoom()); } catch (_) {} }
    start();
    return function () {
      subs = subs.filter(function (x) { return x !== fn; });
      if (!subs.length) stop();
    };
  }

  /* ── Réservations → tables ───────────────────────────────────────────────
   * A booking reaches a plan table through its resource: either the resource
   * the floor-plan template created (`tpl-floor-<table id>`), or any table
   * resource whose name carries the table number ("Table 7"). Anything else
   * is an unplaced booking, offered for a table that fits its party. */
  var ACTIVE = { requested: 1, confirmed: 1, checked_in: 1 };
  function resourceTableId(id) { return 'tpl-floor-' + String(id || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40); }
  function bookings(doc, tables, now, dayStart) {
    var out = { byTable: {}, unplaced: [] };
    if (!doc || !Array.isArray(doc.bookings) || !Array.isArray(tables)) return out;
    now = now || Date.now();
    var from = dayStart || (now - 6 * 3600000);
    var to = from + 24 * 3600000;
    var resById = {};
    (doc.resources || []).forEach(function (r) { if (r && r.id) resById[r.id] = r; });
    var byRes = {}, byNum = {};
    tables.forEach(function (t) { byRes[resourceTableId(t.id)] = t; byNum[tableKey(t.num)] = t; });
    doc.bookings.forEach(function (b) {
      if (!b || !ACTIVE[b.status] || !(b.startAt >= from && b.startAt < to)) return;
      if (b.endAt && b.endAt < now) return;
      var r = resById[b.resourceId];
      var t = byRes[b.resourceId] || (r && r.kind === 'table' ? byNum[tableKey(r.name)] : null);
      var item = { id: b.id, name: (b.customer && b.customer.name) || '', startAt: b.startAt, endAt: b.endAt,
                   partySize: +b.partySize || 0, status: b.status, tableId: t ? t.id : null };
      if (t) (out.byTable[t.id] = out.byTable[t.id] || []).push(item);
      else out.unplaced.push(item);
    });
    Object.keys(out.byTable).forEach(function (k) { out.byTable[k].sort(function (a, b) { return a.startAt - b.startAt; }); });
    out.unplaced.sort(function (a, b) { return a.startAt - b.startAt; });
    return out;
  }
  /* The smallest free table that seats the party — the one a maître d'
   * would pick — skipping tables already promised in that time slot. */
  function suggestTable(booking, tables, statusOf, index) {
    var need = Math.max(1, +booking.partySize || 2);
    var clash = function (t) {
      return ((index && index.byTable[t.id]) || []).some(function (b) {
        return b.id !== booking.id && b.startAt < (booking.endAt || booking.startAt + 5400000) && (b.endAt || b.startAt + 5400000) > booking.startAt;
      });
    };
    var fits = tables.filter(function (t) {
      var seats = +t.seats || 0;
      var st = statusOf ? statusOf(t) : 'free';
      return seats >= need && st !== 'out' && !clash(t);
    }).sort(function (a, b) { return (+a.seats || 0) - (+b.seats || 0); });
    return fits[0] || null;
  }

  /* ── Effective status ────────────────────────────────────────────────────
   * Order of authority:
   *   1. the owner put the table out of service;
   *   2. the till says it is not free (seated, ordering, bill, paid);
   *   3. a booking is due within 30 minutes (or 15 minutes late);
   *   4. the owner holds it (« Réservée » by hand, with a name and a time);
   *   5. live feed answers: free. No live feed (demo, offline): the owner's
   *      own marking, which on a demo is the whole point. */
  var SOON = 30 * 60000, LATE = 15 * 60000;
  function resolve(t, liveRoom, index, now) {
    now = now || Date.now();
    var res = { status: 'free', source: 'plan', since: 0, covers: 0, billCents: 0, booking: null, askBill: false };
    if (!t) return res;
    if (t.out || t.status === 'out') { res.status = 'out'; return res; }
    var L = liveRoom && liveRoom.live && liveRoom.tables ? liveRoom.tables[tableKey(t.num)] : null;
    if (L && FROM_TILL[L.status] && L.status !== 'khawya') {
      res.status = FROM_TILL[L.status]; res.source = 'till';
      res.since = +L.since || 0; res.covers = +L.covers || 0; res.billCents = +L.billCents || 0;
      res.askBill = !!L.askBill;
      return res;
    }
    var list = index && index.byTable ? (index.byTable[t.id] || []) : [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.startAt - now <= SOON && now - b.startAt <= LATE && b.status !== 'checked_in') {
        res.status = 'reserved'; res.source = 'booking'; res.booking = b; return res;
      }
    }
    var manual = normalizeStatus(t.status);
    if (manual === 'reserved') { res.status = 'reserved'; res.source = 'plan'; return res; }
    if (liveRoom && liveRoom.live) {
      res.status = 'free'; res.source = 'till';
      res.next = list.find(function (b) { return b.startAt > now; }) || null;
      return res;
    }
    res.status = manual; res.source = 'plan';
    res.since = manual === 'occupied' || manual === 'ordering' || manual === 'bill' ? (+t.since || 0) : 0;
    res.next = list.find(function (b) { return b.startAt > now; }) || null;
    return res;
  }

  /* Seated time for the chip. Past four hours a table is far more likely
   * forgotten than still eating: it reads « à vérifier », not « 63 h ». */
  var CHECK_AFTER = 4 * 3600000;
  function since(ts, now) {
    now = now || Date.now();
    ts = +ts || 0;
    if (!ts || ts > now + 60000) return null;
    var ms = Math.max(0, now - ts);
    var min = Math.round(ms / 60000);
    /* Past a day, hours stop meaning anything: « 40 j », not « 967 h 11 ». */
    var lang = 'fr';
    try { lang = localStorage.getItem('kiwiLang') || 'fr'; } catch (_) {}
    var day = lang === 'en' ? ' d' : lang === 'ar' ? ' ي' : ' j';
    var label = min < 60 ? min + ' min'
      : min < 1440 ? Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0')
      : Math.floor(min / 1440) + day;
    return { minutes: min, label: label, check: ms >= CHECK_AFTER };
  }

  window.KiwiFloorLive = {
    watch: watch, last: currentRoom, refresh: poll,
    resolve: resolve, since: since, bookings: bookings, suggestTable: suggestTable,
    tableKey: tableKey, normalizeStatus: normalizeStatus, resourceTableId: resourceTableId,
    FROM_TILL: FROM_TILL, STATUSES: STATUSES, CHECK_AFTER: CHECK_AFTER,
  };
})();
