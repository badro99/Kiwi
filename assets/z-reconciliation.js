/* Continuous day snapshot comparison. Full local receipts remain in the
   durable Z job so missing IDs can replay through the normal sale endpoint. */
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
    var seenIds = Object.create(null), seenSettlements = Object.create(null);
    return journal.filter(function (entry) {
      if (!entry || entry.voided || entry.void_ts) return false;
      if (entry.kind === 'refund' && entry.refundSyncStatus === 'rejected'
        && !(entry.cashHandedOut === true || Number(entry.cashHandedOutAt) > 0
          || entry.refundReconciliation === 'cash-handed-out')) return false;
      var ts = new Date(entry.time).getTime();
      return ts >= bounds.from && ts < bounds.to;
    }).map(function (entry) {
      var requested = String(entry.serverSaleId || (entry.origin ? entry.id : Live.saleIdFor(entry, slug)) || '');
      var id = Live.canonicalSaleId ? Live.canonicalSaleId(slug, requested) : requested;
      var normalized = DR.normSale ? DR.normSale(entry) : entry;
      var key = DR.settlementKey ? DR.settlementKey(normalized) : '';
      if (seenIds[id] || key && seenSettlements[key]) return null;
      seenIds[id] = 1; if (key) seenSettlements[key] = 1;
      return { id: id,
        amountCents: entry.kind === 'refund' ? -Math.abs(Math.round(Number(entry.amount) * 100))
          : Math.round(Number(entry.amount) * 100), method: String(entry.method || 'cash'),
        settlementKey: key.length <= 12000 ? key : '',
        local: entry.origin ? null : entry };
    }).filter(Boolean);
  }
  function manifestKey(slug, day, terminalId) { return 'kiwi:z-manifest:' + slug + ':' + terminalId + ':' + day; }
  function manifest(slug, day, terminalId) {
    try {
      var rows = JSON.parse(localStorage.getItem(manifestKey(slug, day, terminalId)) || '[]');
      return Array.isArray(rows) ? rows.filter(function (row) {
        return row && typeof row.id === 'string' && Number.isSafeInteger(row.amountCents)
          && typeof row.method === 'string';
      }).map(function (row) { return Object.assign({}, row, {
        settlementKey: typeof row.settlementKey === 'string' && row.settlementKey.length <= 12000
          ? row.settlementKey : '' }); }) : [];
    } catch (_) { return []; }
  }
  function queueSnapshot(report, journal, closed) {
    var O = window.KiwiOffline;
    var slug = report && report.store && report.store.slug;
    if (!O || !O.available() || !slug || merchant() !== slug) return Promise.resolve({ ok: false, reason: 'outbox-unavailable' });
    var terminalId = String(report.terminalId || 'terminal').slice(0, 64);
    var current = entriesFor(report, journal);
    var prior = manifest(slug, report.day, terminalId);
    var Live = window.KiwiLive;
    function canonical(id) { return Live.canonicalSaleId ? Live.canonicalSaleId(slug,id) : id; }
    var voided = new Set((journal || []).filter(function(e) { return e && e.voided; }).map(function(e) {
      return canonical(String(e.serverSaleId || (e.origin ? e.id : Live.saleIdFor(e,slug)) || ''));
    }));
    var entries = [], overlapConflict = false;
    prior.forEach(function (entry) {
      var row = Object.assign({}, entry, { id: canonical(entry.id) });
      if (voided.has(row.id)) return;
      var previous = entries.find(function (candidate) { return candidate.id === row.id
        || row.settlementKey && candidate.settlementKey === row.settlementKey; });
      if (previous) {
        if (previous.amountCents !== row.amountCents || previous.method !== row.method) overlapConflict = true;
      } else entries.push(row);
    });
    (current || []).forEach(function (entry) {
      var previous = entries.find(function (row) { return row.id === entry.id
        || entry.settlementKey && row.settlementKey === entry.settlementKey; });
      if (!previous) entries.push(entry);
      else {
        if (previous.amountCents !== entry.amountCents || previous.method !== entry.method) overlapConflict = true;
        if (!previous.local) previous.local = entry.local;
      }
    });
    var presentCount = entries.filter(function (row) { return row.amountCents >= 0; }).length;
    var presentCents = entries.reduce(function (sum, row) { return sum + row.amountCents; }, 0);
    var reportNet = Math.round(Number(report.net == null ? report.gross : report.net) * 100);
    var unqueuedCount = Number(report.txns) - presentCount;
    var unqueuedCents = reportNet - presentCents;
    if (!current || overlapConflict || new Set(entries.map(function (row) { return row.id; })).size !== entries.length
      || !Number.isSafeInteger(unqueuedCount) || unqueuedCount < 0 || !Number.isSafeInteger(unqueuedCents)
      || entries.some(function (row) { return !row.id || !Number.isSafeInteger(row.amountCents)
        || Math.abs(row.amountCents) > 20000000; })) {
      return Promise.resolve({ ok: false, reason: 'z-journal-mismatch' });
    }
    var hash = 2166136261, source = slug + ':' + terminalId;
    for (var i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    var id = 'z:' + (hash >>> 0).toString(16) + ':' + report.day;
    var payload = { id: id, merchant: slug, day: report.day,
      terminalId: terminalId, cutoff: report.cutoff, closed: !!closed, entries: entries,
      unqueuedCount: unqueuedCount, unqueuedCents: unqueuedCents };
    return O.enqueue(CHANNEL, slug, payload, { id: id, replaceExisting: true })
      .then(function () {
        try { localStorage.setItem(manifestKey(slug, report.day, terminalId), JSON.stringify(entries.map(function (row) {
          return { id: row.id, amountCents: row.amountCents, method: row.method,
            settlementKey: row.settlementKey || '' };
        }))); } catch (_) { /* IndexedDB still owns this close; next shift may need support. */ }
        flush(); return { ok: true, queued: true, unqueuedCount: unqueuedCount, unqueuedCents: unqueuedCents };
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
        closed: !!payload.closed, cutoff: payload.cutoff,
        unqueuedCount: payload.unqueuedCount || 0, unqueuedCents: payload.unqueuedCents || 0,
        blocked: window.KiwiLive && KiwiLive.queueStatus ? (KiwiLive.queueStatus().blockedEntries || []) : [],
        sales: payload.entries.map(function (entry) {
          var Live = window.KiwiLive;
          var id = Live && Live.canonicalSaleId ? Live.canonicalSaleId(slug, entry.id) : entry.id;
          return { id: id, amountCents: entry.amountCents, method: entry.method,
            kind: entry.amountCents < 0 ? 'refund' : 'sale' };
        }),
        count: payload.entries.filter(function (entry) { return entry.amountCents >= 0; }).length + (payload.unqueuedCount || 0),
        totalCents: payload.entries.reduce(function (sum, entry) { return sum + entry.amountCents; }, 0) + (payload.unqueuedCents || 0) };
      return fetch('/api/z-reconciliation', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(function (response) {
        return response.json().then(function (result) {
          if (!response.ok || !result.ok) throw new Error(result.error || 'z-server-rejected');
          var repairs = [];
          if (Array.isArray(result.missing)) {
            result.missing.forEach(function (id) {
              var entry = payload.entries.find(function (candidate) {
                return candidate.id === id || window.KiwiLive && KiwiLive.canonicalSaleId
                  && KiwiLive.canonicalSaleId(slug, candidate.id) === id;
              });
              if (entry && entry.local && entry.amountCents >= 0 && window.KiwiLive && KiwiLive.postSale) {
                // Re-arm only with evidence that the original blocking rule changed.
                // Permanent 400/422/conflicts and refunds remain visible for
                // support. A refund needs manager approval and must NEVER be
                // replayed through postSale() as a positive payment.
                repairs.push(Promise.resolve(KiwiLive.retrySale
                  ? KiwiLive.retrySale(entry.local, (result.retryable || []).find(function (permit) { return permit.id === id; })) : true).then(function (ready) {
                  if (ready === false) return false;
                  var queued = KiwiLive.postSale(entry.local);
                  return !!(queued && queued.ok);
                }));
              }
            });
          }
          return Promise.all(repairs).then(function (queued) {
            if (queued.some(Boolean) && window.KiwiLive && KiwiLive.flush) KiwiLive.flush(true);
            // A Z mismatch is NEVER acknowledged merely because this device
            // no longer has the receipt. Keep it durable and visible for audit.
            var mismatch = result.status === 'mismatch'
              || Array.isArray(result.missing) && result.missing.length
              || Array.isArray(result.mismatched) && result.mismatched.length;
            return mismatch ? O.reject(row.id, row.leaseToken, { error: queued.some(Boolean)
              ? 'missing-after-requeue' : 'z-ledger-mismatch' })
              : O.acknowledge(row.id, row.leaseToken);
          });
        });
      }).catch(function (error) {
        return O.reject(row.id, row.leaseToken, { error: String(error.message || error) });
      });
    }).catch(function () {}).finally(function () { sending = false; });
  }
  var dayReference = null, referenceMerchant = '', requestSequence = 0;
  function selectedDay(range) {
    var D = window.KiwiDateRange;
    return D && D.selectedBusinessDay ? D.selectedBusinessDay(range == null && document.documentElement.getAttribute('data-mode') === 'simple' ? 'aujourdhui' : range) : null;
  }
  function reference(range) {
    return dashboardUnlocked && (!window.__kiwiRole || window.__kiwiRole === 'owner')
      && referenceMerchant === merchant() && dayReference && dayReference.day === selectedDay(range)
      ? dayReference : null;
  }
  function amount(cents) { return (Number(cents)/100).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' MAD'; }
  // The merchant only hears about the Z when something needs a look: money
  // the till counted that the server doesn't have, or a blocked receipt.
  // A day that matches (or can't be compared yet) stays quiet.
  function needsAttention(s) {
    if (!s) return false;
    if (s.ambiguous) return true;
    if (Array.isArray(s.blocked) && s.blocked.length) return true;
    return (s.source === 'closed-z' || s.source === 'open-z')
      && (Number(s.gapCents) !== 0 || Number(s.missingCount) > 0 || Number(s.unqueuedCount) > 0);
  }
  function referenceText(s) {
    if (!needsAttention(s)) return '';
    var text = s.source === 'ambiguous-z'
      ? 'Rapports Z avec seuils de journée différents · rapprochement impossible sans vérification humaine'
      : s.source === 'sync-gap'
      ? 'Reçus refusés non enregistrés : ' + amount(s.gapCents) + ' · ' + s.missingCount
        + ' reçu(s) bloqué(s) · Z indisponible tant que la caisse ne l’a pas transmis'
      : s.source === 'closed-z' || s.source === 'open-z'
      ? (s.source === 'closed-z' ? 'Rapport Z de la caisse : ' : 'Rapport provisoire de la caisse : ') + amount(s.reportedCents) + ' · enregistré : ' + amount(s.recordedCents)
        + ' · écart : ' + amount(s.gapCents) + ' · ' + s.missingCount + ' reçu(s) manquant(s)'
        + (s.unqueuedCount || s.unqueuedCents ? ' · ' + (s.unqueuedCount
          ? s.unqueuedCount + ' reçu(s) hors file (' + amount(s.unqueuedCents) + ')'
          : 'écart local non associé à un reçu (' + amount(s.unqueuedCents) + ')') : '')
        + ' · ' + (Array.isArray(s.blocked) ? s.blocked.length : 0) + ' reçu(s) bloqué(s)'
      : 'Enregistré : ' + amount(s.recordedCents) + (s.source === 'live-ledger'
        ? (s.syncObserved === false ? ' · état de synchronisation de la caisse inconnu' : ' · synchronisation : ' + s.waitingCount + ' reçu(s) en attente (dernière déclaration)')
        : s.comparisonAvailable ? ' · Z non clôturé : référence de caisse indisponible.'
        : ' · Journée antérieure sans comparaison Z : impossible de vérifier avec la caisse.');
    if (s.closedTerminals > 0 && s.closedTerminals < s.totalTerminals) text += ' · ' + s.closedTerminals + '/' + s.totalTerminals + ' caisses clôturées (Z partiel).';
    if (s.ambiguous && s.ambiguousReason !== 'cutoff-conflict') text += ' · Plusieurs anciens Z sans détail : total Z non vérifiable.';
    return text;
  }
  // A Z problem is a notification, not a banner: a badge on the bell, the
  // detail in the notifications drawer, and one toast the first time a given
  // problem shows up in this tab.
  var toasted = '';
  function currentAlert() {
    var s = reference();
    return needsAttention(s) ? { text: referenceText(s), blocked: s.blocked || [] } : null;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function notificationHtml() {
    var a = currentAlert();
    if (!a) return '';
    var rows = a.blocked.map(function (b) {
      return '<div class="n-desc">' + esc(b.id + ' · ' + amount(b.amountCents) + ' · ' + b.method
        + ' · ' + new Date(b.ts).toLocaleString() + ' · ' + b.reason) + '</div>';
    }).join('');
    return '<div class="notif unread" id="kiwi-z-reconciliation-alert" role="status">'
      + '<div class="n-ico" style="background:color-mix(in srgb, var(--warn-ink) 16%, var(--surface));color:var(--warn-ink);">'
      + '<svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z"/></svg></div>'
      + '<div class="n-body"><div class="n-title">Écart avec le rapport Z de la caisse</div>'
      + '<div class="n-desc">' + esc(a.text) + '</div>'
      + (a.blocked.length ? '<div class="n-desc">' + a.blocked.length + ' reçu(s) payé(s) non enregistré(s) · contacter le support</div>' + rows : '')
      + '</div></div>';
  }
  function updateBell() {
    var bell = document.querySelector('button[data-mobile-notifications], button[aria-label="Notifications"]');
    var a = currentAlert();
    var badge = bell && bell.querySelector('[data-z-badge]');
    if (bell && a && !badge) {
      badge = document.createElement('span');
      badge.className = 'badge'; badge.setAttribute('data-z-badge', '');
      badge.textContent = '1';
      bell.appendChild(badge);
    }
    if (badge && !a) badge.remove();
    if (!a) return;
    var key = merchant() + '|' + a.text + '|' + a.blocked.length;
    if (key !== toasted && window.Kiwi && Kiwi.toast) {
      toasted = key;
      Kiwi.toast('Écart avec le rapport Z', { type: 'warn', desc: 'Le détail est dans les notifications.',
        action: { label: 'Voir', onClick: function () { if (Kiwi.handlers && Kiwi.handlers.notifications) Kiwi.handlers.notifications(); } } });
    }
  }
  function showDashboard() {
    if (!document.getElementById('kw-main')) return;
    var day = selectedDay(), slug = merchant(), sequence = ++requestSequence;
    if (!dashboardUnlocked || (window.__kiwiRole && window.__kiwiRole !== 'owner') || !day || !slug) {
      dayReference = null;
      updateBell();
      return;
    }
    return fetch('/api/z-reconciliation?merchant=' + encodeURIComponent(slug) + '&day=' + encodeURIComponent(day),
      { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) { if (!response.ok) throw new Error('comparison-unavailable'); return response.json(); })
      .then(function (data) {
        if (sequence !== requestSequence || slug !== merchant() || day !== selectedDay()
          || !dashboardUnlocked || (window.__kiwiRole && window.__kiwiRole !== 'owner')) return;
        dayReference = data.daySummary; referenceMerchant = slug;
        window.dispatchEvent(new CustomEvent('kiwi:z-reference'));
        updateBell();
      }).catch(function () {
        if (sequence !== requestSequence) return;
        dayReference = null;
        window.dispatchEvent(new CustomEvent('kiwi:z-reference'));
        updateBell();
      });
  }
  window.KiwiZReconciliation = {
    queueClose: function (report, journal) { return queueSnapshot(report, journal, true); },
    queueSnapshot: function (report, journal) { return queueSnapshot(report, journal, false); },
    flush: flush, showDashboard: showDashboard, reference: reference, referenceText: referenceText,
    notificationHtml: notificationHtml,
  };
  var dashboardUnlocked = false;
  function start() {
    if (location.pathname.indexOf('dashboard') >= 0) {
      function unlocked() { dashboardUnlocked = true; showDashboard(); }
      window.addEventListener('kiwi:dashboard-unlocked', unlocked);
      if (window.KiwiDashboardBoot && KiwiDashboardBoot.whenUnlocked) KiwiDashboardBoot.whenUnlocked(unlocked);
      if (window.KiwiDateRange && KiwiDateRange.subscribe) KiwiDateRange.subscribe(showDashboard);
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
