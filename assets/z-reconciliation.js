/* Closed-Z comparison. The report and full local receipts stay on the till;
   only bounded receipt IDs, cents and methods go to the server. */
(function () {
  'use strict';
  var CHANNEL = 'closed-z-reconciliation';
  var sending = false;
  function merchant() {
    try { return String(window.KiwiLive && KiwiLive.merchant && KiwiLive.merchant() || ''); }
    catch (_) { return ''; }
  }
  function entriesFor(report, journal) {
    var DR = window.KiwiDayReport, Live = window.KiwiLive;
    var slug = report && report.store && report.store.slug;
    if (!DR || !Live || !slug || !Array.isArray(journal)) return null;
    var bounds = DR.dayBounds(report.day, slug);
    return journal.filter(function (entry) {
      if (!entry || entry.voided || entry.kind === 'refund' || Number(entry.amount) < 0) return false;
      var ts = new Date(entry.time).getTime();
      return ts >= bounds.from && ts < bounds.to;
    }).map(function (entry) {
      var requested = String(entry.serverSaleId || (entry.origin ? entry.id : Live.saleIdFor(entry, slug)) || '');
      return { id: Live.canonicalSaleId ? Live.canonicalSaleId(slug, requested) : requested,
        amountCents: Math.round(Number(entry.amount) * 100), method: String(entry.method || 'cash'),
        local: entry.origin ? null : entry };
    });
  }
  function manifestKey(slug, day, terminalId) { return 'kiwi:z-manifest:' + slug + ':' + terminalId + ':' + day; }
  function manifest(slug, day, terminalId) {
    try {
      var rows = JSON.parse(localStorage.getItem(manifestKey(slug, day, terminalId)) || '[]');
      return Array.isArray(rows) ? rows.filter(function (row) {
        return row && typeof row.id === 'string' && Number.isSafeInteger(row.amountCents)
          && typeof row.method === 'string';
      }) : [];
    } catch (_) { return []; }
  }
  function queueClose(report, journal) {
    var O = window.KiwiOffline;
    var slug = report && report.store && report.store.slug;
    if (!O || !O.available() || !slug || merchant() !== slug) return Promise.resolve({ ok: false, reason: 'outbox-unavailable' });
    var terminalId = String(report.terminalId || 'terminal').slice(0, 64);
    var current = entriesFor(report, journal);
    var prior = manifest(slug, report.day, terminalId);
    var entries = prior.slice();
    var overlapConflict = false;
    (current || []).forEach(function (entry) {
      var previous = entries.find(function (row) { return row.id === entry.id; });
      if (!previous) entries.push(entry);
      else {
        if (previous.amountCents !== entry.amountCents || previous.method !== entry.method) overlapConflict = true;
        if (!previous.local) previous.local = entry.local;
      }
    });
    if (!current || overlapConflict || new Set(entries.map(function (row) { return row.id; })).size !== entries.length
      || entries.length !== Number(report.txns)
      || entries.reduce(function (sum, row) { return sum + row.amountCents; }, 0) !== Math.round(Number(report.gross) * 100)
      || entries.some(function (row) { return !row.id || row.amountCents < 0; })) {
      return Promise.resolve({ ok: false, reason: 'z-journal-mismatch' });
    }
    var hash = 2166136261, source = slug + ':' + terminalId;
    for (var i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    var id = 'z:' + (hash >>> 0).toString(16) + ':' + report.day;
    var payload = { id: id, merchant: slug, day: report.day,
      terminalId: terminalId, entries: entries };
    return O.enqueue(CHANNEL, slug, payload, { id: id, replaceExisting: true })
      .then(function () {
        try { localStorage.setItem(manifestKey(slug, report.day, terminalId), JSON.stringify(entries.map(function (row) {
          return { id: row.id, amountCents: row.amountCents, method: row.method };
        }))); } catch (_) { /* IndexedDB still owns this close; next shift may need support. */ }
        flush(); return { ok: true, queued: true };
      })
      .catch(function () { return { ok: false, reason: 'outbox-write-failed' }; });
  }
  function flush() {
    var O = window.KiwiOffline, slug = merchant();
    if (!O || !slug || sending || navigator.onLine === false || !O.available()) return Promise.resolve();
    sending = true;
    return O.claim(CHANNEL, slug).then(function (row) {
      if (!row) return;
      var payload = row.payload;
      var body = { merchant: slug, day: payload.day, terminalId: payload.terminalId,
        sales: payload.entries.map(function (entry) {
          var Live = window.KiwiLive;
          var id = Live && Live.canonicalSaleId ? Live.canonicalSaleId(slug, entry.id) : entry.id;
          return { id: id, amountCents: entry.amountCents, method: entry.method };
        }),
        count: payload.entries.length,
        totalCents: payload.entries.reduce(function (sum, entry) { return sum + entry.amountCents; }, 0) };
      return fetch('/api/z-reconciliation', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(function (response) {
        return response.json().then(function (result) {
          if (!response.ok || !result.ok) throw new Error(result.error || 'z-server-rejected');
          var repaired = 0;
          if (Array.isArray(result.missing)) {
            result.missing.forEach(function (id) {
              var entry = payload.entries.find(function (candidate) {
                return candidate.id === id || window.KiwiLive && KiwiLive.canonicalSaleId
                  && KiwiLive.canonicalSaleId(slug, candidate.id) === id;
              });
              if (entry && entry.local && window.KiwiLive && KiwiLive.postSale) {
                var queued = KiwiLive.postSale(entry.local);
                if (queued && queued.ok) repaired++;
              }
            });
            if (repaired && window.KiwiLive && KiwiLive.flush) KiwiLive.flush(true);
          }
          // Recheck after the sales outbox drains. Until then the server's
          // mismatch remains visible; a crash cannot erase this Z obligation.
          return repaired ? O.reject(row.id, row.leaseToken, { error: 'missing-after-requeue' })
            : O.acknowledge(row.id, row.leaseToken);
        });
      }).catch(function (error) {
        return O.reject(row.id, row.leaseToken, { error: String(error.message || error) });
      });
    }).catch(function () {}).finally(function () { sending = false; });
  }
  function showDashboard() {
    if (!document.getElementById('kw-main')) return;
    // Never fetch or paint financial reconciliation while the PIN gate is up.
    // The dashboard's ready event also covers the short unlock animation.
    if (!dashboardUnlocked || (window.__kiwiRole && window.__kiwiRole !== 'owner')) {
      var hidden = document.getElementById('kiwi-z-reconciliation-alert');
      if (hidden) hidden.remove();
      return;
    }
    var slug = merchant();
    if (!slug) return;
    fetch('/api/z-reconciliation?merchant=' + encodeURIComponent(slug), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!dashboardUnlocked || (window.__kiwiRole && window.__kiwiRole !== 'owner')) return;
        var row = data && data.rows && data.rows.find(function (item) { return item.status === 'mismatch'; });
        var conflicts = data && data.conflicts || [];
        var old = document.getElementById('kiwi-z-reconciliation-alert');
        if (!row && !conflicts.length) { if (old) old.remove(); return; }
        var alert = old || document.createElement('div');
        alert.id = 'kiwi-z-reconciliation-alert';
        alert.setAttribute('role', 'status');
        alert.style.cssText = 'position:fixed;bottom:18px;left:18px;right:18px;z-index:9990;padding:13px 17px;' +
          'border-radius:12px;background:#9F3028;color:white;font:600 14px/1.4 "Inter Tight",system-ui;' +
          'box-shadow:0 6px 24px #0003;pointer-events:none';
        var gap = row ? Math.abs(Number(row.reported_cents || 0) - Number(row.server_cents || 0)) / 100 : 0;
        alert.textContent = (row ? 'Rapport Z et tableau de bord différents de ' + gap.toFixed(2).replace('.', ',') +
          ' MAD · ' + Number(row.missing_count || 0) + ' vente(s) en attente de synchronisation · ' + row.business_day : '') +
          (conflicts.length ? (row ? ' · ' : '') + conflicts.length + ' conflit(s) de vente à examiner dans la caisse' : '');
        if (!old) document.body.appendChild(alert);
      }).catch(function () {});
  }
  window.KiwiZReconciliation = { queueClose: queueClose, flush: flush, showDashboard: showDashboard };
  var dashboardUnlocked = false;
  function start() {
    if (location.pathname.indexOf('dashboard') >= 0) {
      window.addEventListener('kiwi:dashboard-unlocked', function () {
        dashboardUnlocked = true;
        showDashboard();
      });
      document.addEventListener('kiwi:operator-snapshot', showDashboard);
      document.addEventListener('kiwi-config', showDashboard);
      setInterval(showDashboard, 60000);
    } else {
      flush();
      window.addEventListener('online', flush);
      window.addEventListener('focus', flush);
      document.addEventListener('kiwi-paired', flush);
      setInterval(flush, 30000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
