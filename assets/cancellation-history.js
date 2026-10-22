/* Kiwi · tenant-scoped, read-only cancellation facts for the morning briefing. */
(function () {
  'use strict';
  var state = { merchant: '', events: [], ready: false, loading: false };
  var subs = new Set();
  function merchant() {
    try { return String(window.KiwiLive && window.KiwiLive.merchant ? window.KiwiLive.merchant() : ''); }
    catch (_) { return ''; }
  }
  function real() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); }
    catch (_) { return false; }
  }
  function clean(row) {
    var ts = Number(row && row.voidedAt), amount = Number(row && row.amountCents);
    if (!row || !row.id || !row.saleId || !Number.isFinite(ts) || ts <= 0 || !Number.isFinite(amount) || amount < 0) return null;
    return {
      id: String(row.id).slice(0, 140), saleId: String(row.saleId).slice(0, 80), ref: String(row.ref || '').slice(0, 80),
      voidedAt: ts, reason: String(row.reason || '').slice(0, 40), actorId: String(row.actorId || '').slice(0, 96), amountCents: Math.round(amount)
    };
  }
  function notify() {
    subs.forEach(function (fn) { try { fn(snapshot()); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('kiwi:cancellation-history', { detail: { merchant: state.merchant, ready: state.ready } })); } catch (_) {}
  }
  function snapshot() { return { merchant: state.merchant, events: state.events.slice(), ready: state.ready, loading: state.loading }; }
  function load() {
    var m = merchant();
    if (!real() || !m || typeof fetch !== 'function') {
      state = { merchant: m, events: [], ready: false, loading: false }; notify(); return Promise.resolve(snapshot());
    }
    if (state.merchant !== m) state = { merchant: m, events: [], ready: false, loading: false };
    if (state.loading) return Promise.resolve(snapshot());
    state.loading = true; notify();
    var from = Date.now() - 180 * 86400000;
    return fetch('/api/sale/cancel?merchant=' + encodeURIComponent(m) + '&history=1&from=' + from, { credentials: 'same-origin' })
      .then(function (response) { if (!response.ok) throw new Error('history-http'); return response.json(); })
      .then(function (payload) {
        if (!payload || payload.merchant !== m || payload.unavailable) throw new Error('history-unavailable');
        state.events = (Array.isArray(payload.events) ? payload.events : []).map(clean).filter(Boolean);
        state.ready = true;
      }).catch(function () { state.events = []; state.ready = false; })
      .finally(function () { state.loading = false; notify(); });
  }
  window.KiwiCancellationHistory = {
    load: load, list: function () { return state.events.slice(); }, ready: function () { return state.ready; },
    merchant: function () { return state.merchant; }, subscribe: function (fn) { subs.add(fn); return function () { subs.delete(fn); }; }, _clean: clean
  };
  window.addEventListener('load', load);
  try { if (window.KiwiVenue && window.KiwiVenue.subscribe) window.KiwiVenue.subscribe(load); } catch (_) {}
}());

/* ── Ci-dessous, l'ancien assets/order-course.js (réuni ici le 22 octobre 2026, corps inchangé). ── */
/* Tenant-scoped, read-only order-course milestones for the morning briefing. */
(function () {
  'use strict';
  var rows = [];
  var isReady = false;
  function real() { try { return !!window.KiwiEnv.isReal(); } catch (_) { return false; } }
  function merchant() { try { return String(window.KiwiCloudDoc.currentSlug() || ''); } catch (_) { return ''; } }
  function refresh() {
    var slug = merchant();
    if (!real() || !slug) return Promise.resolve([]);
    return fetch('/api/order-course?merchant=' + encodeURIComponent(slug) + '&from=' + (Date.now() - 35 * 86400000), {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
    }).then(function (response) { return response.json(); }).then(function (data) {
      isReady = !!(data && data.ready && !data.redacted);
      rows = isReady && Array.isArray(data.orders) ? data.orders : [];
      window.dispatchEvent(new CustomEvent('kiwi:order-course', { detail: { merchant: slug, ready: isReady } }));
      return rows.slice();
    }).catch(function () { isReady = false; return []; });
  }
  window.KiwiOrderCourse = {
    refresh: refresh, list: function () { return rows.slice(); }, ready: function () { return isReady; },
    _test: { merchant: merchant }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
}());
