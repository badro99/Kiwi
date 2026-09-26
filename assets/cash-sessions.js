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
  var repairRequired = false;
  var lastStatus = 0;
  var lastError = '';
  /* A refused event used to be resent every 1.5 s for as long as the till
     stayed open. Back off (1.5 s doubling to 5 min) and reset on success. */
  var RETRY_MIN_MS = 1500, RETRY_MAX_MS = 300000, retryMs = RETRY_MIN_MS;
  var notOpenAttempts = {};

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
    if (flushing || repairRequired) return;
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
      lastStatus = response.status;
      if (response.ok) {
        lastError = '';
        repairRequired = false;
        retryMs = RETRY_MIN_MS;
        delete notOpenAttempts[acknowledgedId];
        return outboxLock(function () {
        var current = readOutbox().filter(function (event) { return event && event.id !== acknowledgedId; });
        writeOutbox(current);
        });
      }
      if (response.status === 403) return response.json().catch(function () { return {}; }).then(function (body) {
        lastError = String(body && body.error || 'forbidden');
        if (lastError === 'write-refused') {
          repairRequired = true;
          window.dispatchEvent(new CustomEvent('kiwi:cash-sessions', {
            detail: { merchant: merchant(), pendingCount: activePendingCount(), repairRequired: true }
          }));
        }
      });
      /* 409 session-not-open: the server never saw this session open. If the
         open event is not waiting in this outbox either, nothing on this till
         can ever make the event valid, and as the head of the queue it holds
         back every later event. After three tries, park it in the durable
         rejected queue (kept for support) and let the rest through. */
      if (response.status === 409) return (typeof response.json === 'function' ? response.json() : Promise.resolve({}))
        .catch(function () { return {}; }).then(function (body) {
          lastError = String(body && body.error || 'HTTP 409');
          if (lastError !== 'session-not-open') return;
          var row = activeRows[0];
          notOpenAttempts[acknowledgedId] = (notOpenAttempts[acknowledgedId] || 0) + 1;
          var openQueued = activeOutboxRows().some(function (event) {
            return event && event.eventType === 'open' && event.sessionId === row.sessionId && event.id !== row.id;
          });
          if (openQueued || notOpenAttempts[acknowledgedId] < 3) return;
          return outboxLock(function () {
            if (!recordRejected(row, 409, 'session-not-open')) return false;
            delete notOpenAttempts[acknowledgedId];
            retryMs = RETRY_MIN_MS;
            var current = readOutbox().filter(function (event) { return event && event.id !== acknowledgedId; });
            return writeOutbox(current);
          });
        });
      if (response.status === 422) return outboxLock(function () {
        if (!recordRejected(activeRows[0], 422, 'schema-rejection')) return false;
        var current = readOutbox().filter(function (event) { return event && event.id !== acknowledgedId; });
        return writeOutbox(current);
      });
      lastError = 'HTTP ' + response.status;
    }).catch(function () { lastError = 'network'; }).finally(function () {
      flushing = false;
      if (!repairRequired && activeOutboxRows().length) {
        var wait = lastStatus >= 200 && lastStatus < 300 ? RETRY_MIN_MS : retryMs;
        if (!(lastStatus >= 200 && lastStatus < 300)) retryMs = Math.min(RETRY_MAX_MS, retryMs * 2);
        setTimeout(flush, wait);
      }
    });
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
  document.addEventListener('kiwi-paired', function () {
    pendingPairingCount = 0;
    repairRequired = false;
    lastError = '';
    drainPending();
  });
  /* A persisted event can be read before the merchant slug is hydrated. In
   * that case boot sees no active rows, and neither online nor kiwi-paired is
   * guaranteed to fire again. Recheck only while this merchant has debt so a
   * drawer opening cannot remain silently stranded until the next reload. */
  setInterval(function () {
    if (paired() && !repairRequired && activePendingCount()) drainPending();
  }, 10000);
  window.KiwiCashSessions = {
    emit: emit, refresh: refresh, list: function () { return events.slice(); },
    retry: function () { repairRequired = false; return drainPending(); },
    ready: function () { return ready; }, terminalId: terminalId,
    status: function () {
      var slug = merchant();
      var count = activePendingCount();
      return { merchant: slug, paired: paired(), pendingPairing: !paired() && count > 0, pendingCount: count,
        storageError: storageError, repairRequired: repairRequired && count > 0, lastStatus: lastStatus, lastError: lastError };
    },
    _test: { merchant: merchant, readOutbox: readOutbox, readRejected: readRejected, flush: flush }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
