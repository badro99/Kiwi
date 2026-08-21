/* Durable cash-session telemetry and dashboard reader. Financial events stay
 * tenant-scoped; the till outbox is best-effort and never blocks POS actions. */
(function () {
  'use strict';
  var TERMINAL_KEY = 'kiwi:caisse:terminal-id:v1';
  var OUTBOX_KEY = 'kiwi:cash-session-outbox:v1';
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
  function readOutbox() { try { var x = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); return Array.isArray(x) ? x.slice(-200) : []; } catch (_) { return []; } }
  function writeOutbox(rows) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows.slice(-200))); } catch (_) {} }
  function uid(event) {
    return ['cash', terminalId(), event.sessionId, event.eventType, event.occurredAt, Math.random().toString(36).slice(2, 8)].join('-').replace(/[^A-Za-z0-9._:-]/g, '');
  }
  function emit(event) {
    var slug = merchant();
    if (!real() || !slug || !event || !event.sessionId) return false;
    var row = Object.assign({}, event, { id: event.id || uid(event), merchant: slug, terminalId: terminalId() });
    var rows = readOutbox(); rows.push(row); writeOutbox(rows); flush(); return true;
  }
  function flush() {
    if (flushing) return;
    var rows = readOutbox(); if (!rows.length) return;
    flushing = true;
    fetch('/api/cash-sessions', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(rows[0])
    }).then(function (response) {
      if (response.ok || (response.status >= 400 && response.status < 500)) { rows.shift(); writeOutbox(rows); }
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
    _test: { merchant: merchant, readOutbox: readOutbox }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
