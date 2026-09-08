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

  function real() { try { return !!window.KiwiEnv.isReal(); } catch (_) { return false; } }
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
  function writeOutbox(rows) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(stableRows(rows))); return true; } catch (_) { return false; }
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
  function outboxLock(action) {
    try {
      if (navigator.locks && navigator.locks.request) {
        return navigator.locks.request('kiwi-cash-session-outbox-v1', action);
      }
    } catch (_) {}
    return Promise.resolve().then(action);
  }
  function uid(event) {
    return ['cash', terminalId(), event.sessionId, event.eventType, event.occurredAt, Math.random().toString(36).slice(2, 8)].join('-').replace(/[^A-Za-z0-9._:-]/g, '');
  }
  function emit(event) {
    var slug = merchant();
    if (!real() || !slug || !event || !event.sessionId) return false;
    var row = Object.assign({}, event, { id: event.id || uid(event), merchant: slug, terminalId: terminalId() });
    var saved = false;
    var write = function () {
      var rows = readOutbox(); rows.push(row);
      saved = writeOutbox(rows);
      return saved;
    };
    /* Web Locks serializes emit/ack across caisse tabs. Browsers without it
       retain the synchronous legacy path; the durable ID-based acknowledgement
       still prevents stale-response deletion within that tab. */
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      outboxLock(write).then(function (ok) { if (ok) flush(); });
      return true;
    }
    write();
    if (!saved) return false;
    /* Legacy contract: writeOutbox(rows); flush(); return true */
    flush(); return true;
  }
  function flush() {
    if (flushing) return;
    var rows = readOutbox(); if (!rows.length) return;
    var acknowledgedId = rows[0].id;
    flushing = true;
    fetch('/api/cash-sessions', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(rows[0])
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
        if (!recordRejected(rows[0], 422, 'schema-rejection')) return false;
        var current = readOutbox().filter(function (event) { return event && event.id !== acknowledgedId; });
        return writeOutbox(current);
      });
    }).catch(function () {}).finally(function () { flushing = false; if (readOutbox().length) setTimeout(flush, 1500); });
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
    var pending = Array.isArray(window.__kiwiCashSessionPending) ? window.__kiwiCashSessionPending.splice(0) : [];
    pending.forEach(emit); flush();
    var paired = false; try { paired = !!(window.KiwiCaissePairing && window.KiwiCaissePairing.isPaired && window.KiwiCaissePairing.isPaired()); } catch (_) {}
    if (!paired) refresh();
    window.dispatchEvent(new CustomEvent('kiwi:cash-sessions-ready'));
  }
  window.KiwiCashSessions = {
    emit: emit, refresh: refresh, list: function () { return events.slice(); },
    ready: function () { return ready; }, terminalId: terminalId,
    _test: { merchant: merchant, readOutbox: readOutbox, readRejected: readRejected, flush: flush }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
