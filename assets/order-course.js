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
