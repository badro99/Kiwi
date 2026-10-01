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
  function lang() { return window.KiwiI18n?.getLang?.() || document.documentElement.lang || 'fr'; }
  const WORDS = {
    title: {fr:'Des ventes de caisse sont à vérifier',en:'Till sales need checking',ar:'مبيعات الصندوق تحتاج إلى مراجعة'},
    detail: {fr:'Vérifiez les ventes du jour dans les notifications.',en:'Check the day’s sales in notifications.',ar:'راجع مبيعات اليوم في الإشعارات.'},
    view: {fr:'Voir les ventes du jour',en:'View the day’s sales',ar:'عرض مبيعات اليوم'},
    resolved: {fr:'Ventes de caisse vérifiées',en:'Till sales checked',ar:'تمت مراجعة مبيعات الصندوق'},
    resolvedDetail: {fr:'La différence signalée pour ce jour est résolue.',en:'The reported difference for this day is resolved.',ar:'تم حل الفرق المسجل لهذا اليوم.'},
    till: {fr:'Caisse',en:'Till',ar:'الصندوق'},
    totals: {fr:'Compté en caisse',en:'Counted at the till',ar:'المبلغ في الصندوق'},
    recorded: {fr:'Ventes correspondantes enregistrées',en:'Matching sales recorded',ar:'المبيعات المقابلة المسجلة'},
    gap: {fr:'Différence',en:'Difference',ar:'الفرق'},
    pending: {fr:'ventes payées à synchroniser',en:'paid sales need syncing',ar:'مبيعات مدفوعة تحتاج إلى مزامنة'},
    rejected: {fr:'ventes payées non enregistrées après un refus',en:'paid sales not recorded after a rejection',ar:'مبيعات مدفوعة لم تسجل بعد رفضها'},
    unqueued: {fr:'ventes payées sans envoi enregistré',en:'paid sales with no recorded send',ar:'مبيعات مدفوعة لم يرسل سجلها'},
    mismatch: {fr:'ventes dont le montant ou le paiement diffère',en:'sales with a different amount or payment method',ar:'مبيعات يختلف مبلغها أو طريقة دفعها'},
    next: {fr:'Ouvrez les ventes de ce jour pour vérifier. Pour une vente absente, ouvrez la caisse concernée et synchronisez-la.',en:'Open this day’s sales to check. For a missing sale, open the affected till and sync it.',ar:'افتح مبيعات هذا اليوم للتحقق. إذا كانت عملية مفقودة، افتح الصندوق المعني وزامنه.'},
    boundary: {fr:'Les caisses utilisent des heures de fin de journée différentes. Vérifiez leurs réglages avant de comparer les ventes.',en:'These tills use different day-end times. Check their settings before comparing sales.',ar:'تستخدم هذه الصناديق أوقاتا مختلفة لنهاية اليوم. تحقق من إعداداتها قبل مقارنة المبيعات.'},
    legacy: {fr:'Le détail des ventes de certaines caisses est indisponible. Vérifiez le rapport dans la caisse concernée.',en:'Some tills have no receipt detail available. Check the report on the affected till.',ar:'تفاصيل مبيعات بعض الصناديق غير متوفرة. راجع التقرير في الصندوق المعني.'}
  };
  function word(key) { return window.KiwiI18n?.T?.[lang()]?.['z.'+key] || WORDS[key]?.[lang()] || WORDS[key]?.fr || ''; }
  function amount(cents) {
    return window.KiwiNumber?.money?.(Number(cents)/100,2)
      || (Number(cents)/100).toLocaleString(lang()==='en'?'en-GB':'fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' MAD';
  }
  function needsAttention(s) {
    if (!s) return false;
    if (s.ambiguous || (Array.isArray(s.blocked) && s.blocked.length)) return true;
    return (s.source === 'closed-z' || s.source === 'open-z')
      && (Number(s.gapCents) !== 0 || Number(s.missingCount)>0 || Number(s.unqueuedCount)>0 || Number(s.mismatchedCount)>0);
  }
  function referenceText(s) {
    if (!needsAttention(s)) return '';
    var lines = [s.day + (s.terminalIds?.length ? ' · '+word('till')+' '+s.terminalIds.map(id=>String(id).slice(-6)).join(', ') : '')];
    if (s.ambiguous) lines.push(word(s.ambiguousReason==='cutoff-conflict'?'boundary':'legacy'));
    else if (s.reportedCents != null) lines.push(word('totals')+': '+amount(s.reportedCents)+' · '+word('recorded')+': '+amount(s.comparisonCents ?? s.recordedCents)+' · '+word('gap')+': '+amount(s.gapCents));
    [[s.missingCount,'pending'],[s.blocked?.length,'rejected'],[s.unqueuedCount,'unqueued'],[s.mismatchedCount,'mismatch']].forEach(([n,k])=>{if(Number(n)>0) lines.push(n+' '+word(k));});
    lines.push(word('next'));
    return lines.join(' · ');
  }
  function fingerprint(s) {
    return [s.day,s.source,s.gapCents,s.reportedCents,s.comparisonCents ?? s.recordedCents,s.missingCount,s.unqueuedCount,s.mismatchedCount,
      (s.terminalIds||[]).slice().sort().join(','),(s.blocked||[]).map(b=>b.id+':'+b.amountCents+':'+b.reason).sort().join(',')].join('|');
  }
  function storageKey() { return 'kiwi:z-alert:v1:'+merchant(); }
  function history() { try { return JSON.parse(localStorage.getItem(storageKey())||'{}'); } catch (_) { return {}; } }
  function saveHistory(value) { try { localStorage.setItem(storageKey(),JSON.stringify(value)); } catch (_) {} }
  function currentAlert() { var s=reference(); return needsAttention(s) ? {summary:s,text:referenceText(s)} : null; }
  function esc(v) { return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function notificationHtml() {
    var a=currentAlert(), past=history();
    if (!a && !(past.resolved && reference()?.day===past.day)) return '';
    var title=a?word('title'):word('resolved'), text=a?a.text:past.day+' · '+word('resolvedDetail');
    return '<div class="notif '+(a?'unread':'resolved')+'" id="kiwi-z-reconciliation-alert" role="status">'
      +'<div class="n-ico" style="background:var('+(a?'--warn-soft':'--mint-soft')+');color:var('+(a?'--warn-ink':'--atlas')+');"><span aria-hidden="true" style="display:block;width:20px;height:20px;background:currentColor;-webkit-mask:url(assets/icons/material/'+(a?'warning':'task_alt')+'.svg) center/contain no-repeat;mask:url(assets/icons/material/'+(a?'warning':'task_alt')+'.svg) center/contain no-repeat"></span></div>'
      +'<div class="n-body"><div class="n-title" data-i18n="z.'+(a?'title':'resolved')+'">'+esc(title)+'</div><div class="n-desc">'+esc(text)+'</div>'
      +'<button type="button" class="kb ghost" style="margin-top:10px;min-height:44px" data-action="z-view-sales" data-i18n="z.view">'+esc(word('view'))+'</button></div></div>';
  }
  function viewSales() {
    var day=reference()?.day;
    if (!day) return;
    var H=window.Kiwi?.handlers;
    (H?.['nav-transactions-day'] || H?.['nav-transactions'])?.(null,day);
  }
  var toasted='';
  function updateBell() {
    if (window.Kiwi?.handlers) Kiwi.handlers['z-view-sales']=viewSales;
    var bell=document.querySelector('button[data-mobile-notifications], button[aria-label="Notifications"]'), a=currentAlert();
    var badge=bell?.querySelector('[data-z-badge]'), past=history(), s=reference();
    if (bell && a && !badge) { badge=document.createElement('span');badge.className='badge';badge.setAttribute('data-z-badge','');badge.textContent='1';bell.appendChild(badge); }
    if (badge && !a) badge.remove();
    if (!a) { if (s && past.day===s.day && !past.resolved) { past.resolved=true;saveHistory(past); } return; }
    var key=fingerprint(a.summary), seen=Array.isArray(past.seen)?past.seen:[];
    saveHistory({day:a.summary.day,resolved:false,seen:seen.includes(key)?seen:seen.concat(key).slice(-20)});
    if (key!==toasted && !seen.includes(key) && window.Kiwi?.toast) {
      toasted=key;
      Kiwi.toast(word('title'),{type:'warn',desc:word('detail'),action:{label:word('view'),onClick:viewSales}});
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
