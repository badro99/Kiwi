/* Durable cash-session telemetry and dashboard reader. Financial events stay
 * tenant-scoped; the till outbox is best-effort and never blocks POS actions. */
(function () {
  'use strict';
  var TERMINAL_KEY = 'kiwi:caisse:terminal-id:v1';
  var OUTBOX_KEY = 'kiwi:cash-session-outbox:v1';
  var REJECTED_KEY = 'kiwi:cash-session-rejected:v1';
  var events = [];
  var ready = false;
  var flushing = false;
  var drainingPending = false;
  var pendingPairingCount = 0;
  var storageError = false;

  function real() { try { return !!window.KiwiEnv.isReal(); } catch (_) { return false; } }
  function paired() {
    try {
      return !!(window.KiwiCaissePairing && window.KiwiCaissePairing.isPaired
        && window.KiwiCaissePairing.isPaired());
    } catch (_) { return false; }
  }
  function merchant() {
    try {
      if (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug) return String(window.KiwiCloudDoc.currentSlug() || '');
      if (window.KiwiDayReport && window.KiwiDayReport.storeSlug) return String(window.KiwiDayReport.storeSlug() || '');
    } catch (_) {}
    return '';
  }
  function terminalId() {
    var id = '';
    try { id = localStorage.getItem(TERMINAL_KEY) || ''; } catch (_) {}
    if (/^[A-Za-z0-9_-]{12,80}$/.test(id)) return id;
    try { id = 'term_' + crypto.randomUUID().replace(/-/g, ''); }
    catch (_) { id = 'term_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 18); }
    try { localStorage.setItem(TERMINAL_KEY, id); } catch (_) {}
    return id;
  }
  /* Keep the legacy 200-row window as a stable copy operation, but preserve
   * the prefix too. A full local queue is a storage-pressure signal, not a
   * licence to silently erase cash-session evidence. If storage cannot hold a
   * new snapshot, setItem fails and the existing durable rows remain intact. */
  function stableRows(rows) {
    var recent = rows.slice(-200);
    return recent.length === rows.length ? recent : rows.slice(0, -200).concat(recent);
  }
  function readOutbox() {
    try {
      var x = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
      return Array.isArray(x) ? stableRows(x) : [];
    } catch (_) { return []; }
  }
  function activeOutboxRows() {
    var slug = merchant();
    return readOutbox().filter(function (event) { return event && event.merchant === slug; });
  }
  function pendingBuffer() {
    if (!Array.isArray(window.__kiwiCashSessionPending)) window.__kiwiCashSessionPending = [];
    return window.__kiwiCashSessionPending;
  }
  function removePending(id) {
    var pending = pendingBuffer();
    for (var i = pending.length - 1; i >= 0; i--) {
      if (pending[i] && pending[i].id === id) pending.splice(i, 1);
    }
  }
  function retainPending(row) {
    var pending = pendingBuffer();
    if (!pending.some(function (event) { return event && event.id === row.id; })) pending.push(row);
  }
  function activePendingRows() {
    var slug = merchant();
    return pendingBuffer().filter(function (event) { return event && event.merchant === slug; });
  }
  function activePendingCount() {
    var ids = {};
    activeOutboxRows().concat(activePendingRows()).forEach(function (event) { if (event && event.id) ids[event.id] = true; });
    return Object.keys(ids).length;
  }
  function writeOutbox(rows) {
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(stableRows(rows)));
      storageError = false;
      return true;
    } catch (_) { storageError = true; return false; }
  }
  function readRejected() {
    try {
      var x = JSON.parse(localStorage.getItem(REJECTED_KEY) || '[]');
      return Array.isArray(x) ? x : [];
    } catch (_) { return []; }
  }
  function recordRejected(row, status, reason) {
    try {
      var rows = readRejected();
      if (!rows.some(function (event) { return event && event.id === row.id && event.rejectedStatus === status; })) {
        rows.push(Object.assign({}, row, {
          deliveryStatus: 'rejected', rejectedStatus: status, rejectedAt: Date.now(), rejectionReason: reason
        }));
        localStorage.setItem(REJECTED_KEY, JSON.stringify(rows));
      }
      return true;
    } catch (_) { return false; }
  }
  function hasOutboxLock() {
    try { return typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request; } catch (_) { return false; }
  }
  function outboxLock(action) {
    try {
      if (hasOutboxLock()) {
        return navigator.locks.request('kiwi-cash-session-outbox-v1', action);
      }
    } catch (_) {}
    return Promise.resolve().then(action);
  }
  function uid(event) {
    return ['cash', terminalId(), event.sessionId, event.eventType, event.occurredAt, Math.random().toString(36).slice(2, 8)].join('-').replace(/[^A-Za-z0-9._:-]/g, '');
  }
  function emit(event, onSaved) {
    var slug = merchant();
    /* Persistence and transport are separate. An operator/demo caisse may be
     * unable to prove a till write, but a real merchant event must still land
     * in the durable outbox so a later pairing can deliver it. */
    if (!real() || !slug || !event || !event.sessionId) return false;
    var row = Object.assign({}, event, { id: event.id || uid(event) });
    if (!row.merchant) row.merchant = slug;
    if (!row.terminalId) row.terminalId = terminalId();
    var persist = function () {
      var rows = readOutbox();
      if (!rows.some(function (old) { return old && old.id === row.id; })) rows.push(row);
      var saved = writeOutbox(rows);
      if (saved) {
        if (typeof onSaved === 'function') onSaved();
        else removePending(row.id);
      } else retainPending(row);
      return saved;
    };
    if (hasOutboxLock()) {
      return outboxLock(persist).then(function (saved) {
        if (saved) flush();
        return saved;
      });
    }
    var saved = persist();
    if (saved) flush();
    return saved;
  }
  function announcePendingPairing() {
    var slug = merchant(), count = activePendingCount();
    if (!slug || !count || pendingPairingCount === count) return;
    pendingPairingCount = count;
    var detail = { merchant: slug, pendingCount: count, pendingPairing: true };
    try {
      window.dispatchEvent(new CustomEvent('kiwi:cash-sessions-pending-pairing', { detail: detail }));
      /* Keep the state on the public cash-session channel as well. A page
       * which has not installed the specialised listener can still render or
       * inspect the durable pairing backlog. */
      window.dispatchEvent(new CustomEvent('kiwi:cash-sessions', {
        detail: { merchant: slug, ready: ready, pendingPairing: true, pendingCount: count }
      }));
    } catch (_) {}
  }
  function flush() {
    if (flushing) return;
    if (!paired()) { announcePendingPairing(); return; }
    var activeRows = activeOutboxRows();
    if (!activeRows.length) return;
    pendingPairingCount = 0;
    var acknowledgedId = activeRows[0].id;
    flushing = true;
    fetch('/api/cash-sessions', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(activeRows[0])
    }).then(function (response) {
      /* 403 means the till/session proof needs recovery and 409 means the
         session open is not visible yet. Both events remain retryable. Only
         the route's explicit schema rejection (422) is permanently invalid;
         record it in a durable rejected queue before removing it from retry.
         All other failures preserve the exact event for later replay. Remove
         only the acknowledged ID from the CURRENT durable queue so a newer
         event emitted while this request was in flight cannot be erased by a
         stale snapshot. */
      if (response.ok) return outboxLock(function () {
        var current = readOutbox().filter(function (event) { return event && event.id !== acknowledgedId; });
        writeOutbox(current);
      });
      if (response.status === 422) return outboxLock(function () {
        if (!recordRejected(activeRows[0], 422, 'schema-rejection')) return false;
        var current = readOutbox().filter(function (event) { return event && event.id !== acknowledgedId; });
        return writeOutbox(current);
      });
    }).catch(function () {}).finally(function () { flushing = false; if (activeOutboxRows().length) setTimeout(flush, 1500); });
  }
  function drainPending() {
    if (drainingPending) return Promise.resolve(false);
    drainingPending = true;
    var drain = function () {
      var pending = pendingBuffer();
      if (!pending.length) { flush(); return Promise.resolve(true); }
      var event = pending[0];
      /* Freeze legacy boot-buffer identity before persistence. If storage
       * fails, retrying the same event must not generate a second UUID. */
      if (event && !event.id) event.id = uid(event);
      var saved = emit(event, function () { removePending(event.id); });
      return Promise.resolve(saved).then(function (ok) { return ok ? drain() : false; });
    };
    return Promise.resolve().then(drain).finally(function () { drainingPending = false; });
  }
  function refresh() {
    var slug = merchant();
    if (!real() || !slug) return Promise.resolve([]);
    var from = Date.now() - 45 * 86400000;
    return fetch('/api/cash-sessions?merchant=' + encodeURIComponent(slug) + '&from=' + from, {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
    }).then(function (response) { return response.json(); }).then(function (data) {
      ready = !!(data && data.ready && !data.redacted);
      events = ready && Array.isArray(data.events) ? data.events : [];
      window.dispatchEvent(new CustomEvent('kiwi:cash-sessions', { detail: { merchant: slug, ready: ready } }));
      return events.slice();
    }).catch(function () { ready = false; return []; });
  }
  function boot() {
    var isPaired = paired();
    drainPending();
    if (!isPaired) refresh();
    window.dispatchEvent(new CustomEvent('kiwi:cash-sessions-ready'));
  }
  /* An unpaired flush deliberately returns without a retry timer. Pairing and
   * network restoration are the authoritative transport wake-ups, so a queue
   * held before either event is retried immediately without hiding the debt. */
  window.addEventListener('online', function () { pendingPairingCount = 0; drainPending(); });
  document.addEventListener('kiwi-paired', function () { pendingPairingCount = 0; drainPending(); });
  window.KiwiCashSessions = {
    emit: emit, refresh: refresh, list: function () { return events.slice(); },
    ready: function () { return ready; }, terminalId: terminalId,
    status: function () {
      var slug = merchant();
      var count = activePendingCount();
      return { merchant: slug, paired: paired(), pendingPairing: !paired() && count > 0, pendingCount: count, storageError: storageError };
    },
    _test: { merchant: merchant, readOutbox: readOutbox, readRejected: readRejected, flush: flush }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
