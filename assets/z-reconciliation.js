/* Two modules ship here, both loaded wherever the day report is built: the continuous day snapshot comparison, then (below) the day report's VAT by rate (KiwiDayReportVat).
   Continuous day snapshot comparison. Full local receipts remain in the
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
  function notificationDetail(s) {
    const bdi = value => '<bdi>'+esc(value)+'</bdi>';
    const line = value => '<div style="margin-top:8px">'+value+'</div>';
    let html = bdi(s.day) + (s.terminalIds?.length ? ' · '+esc(word('till'))+' '+s.terminalIds.map(id=>bdi(String(id).slice(-6))).join(', ') : '');
    if (s.ambiguous) html += line(esc(word(s.ambiguousReason==='cutoff-conflict'?'boundary':'legacy')));
    else if (s.reportedCents != null) {
      html += '<div style="display:grid;gap:4px;margin-top:10px">';
      [['totals',s.reportedCents],['recorded',s.comparisonCents ?? s.recordedCents],['gap',s.gapCents]].forEach(([key,cents])=>{
        html += '<div>'+esc(word(key))+': <strong style="font-weight:600">'+bdi(amount(cents))+'</strong></div>';
      });
      html += '</div>';
    }
    [[s.missingCount,'pending'],[s.blocked?.length,'rejected'],[s.unqueuedCount,'unqueued'],[s.mismatchedCount,'mismatch']].forEach(([n,key])=>{
      if (Number(n)>0) html += line(bdi(n)+' '+esc(word(key)));
    });
    return html + line(esc(word('next')));
  }
  function notificationHtml() {
    var a=currentAlert(), past=history();
    if (!a && !(past.resolved && reference()?.day===past.day)) return '';
    var title=a?word('title'):word('resolved'), text=a?a.text:past.day+' · '+word('resolvedDetail');
    return '<div class="notif '+(a?'unread':'resolved')+'" id="kiwi-z-reconciliation-alert" role="status">'
      +'<div class="n-ico" style="background:var('+(a?'--warn-soft':'--mint-soft')+');color:var('+(a?'--warn-ink':'--atlas')+');"><span aria-hidden="true" style="display:block;width:20px;height:20px;background:currentColor;-webkit-mask:url(assets/icons/material/'+(a?'warning':'task_alt')+'.svg) center/contain no-repeat;mask:url(assets/icons/material/'+(a?'warning':'task_alt')+'.svg) center/contain no-repeat"></span></div>'
      +'<div class="n-body"><div class="n-title" data-i18n="z.'+(a?'title':'resolved')+'">'+esc(title)+'</div><div class="n-desc">'+(a?notificationDetail(a.summary):esc(text))+'</div>'
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

/* Rapport journalier · la TVA par taux.
 *
 * Un comptable ne peut pas passer la journée en écriture avec un seul total
 * TTC : il lui faut, par taux, le HT, la TVA et le TTC. Ce module les calcule
 * à partir des lignes que le rapport compte déjà (build() dans day-report.js),
 * en centimes entiers, et les met à disposition de l'écran, des exports et du
 * ticket Z.
 *
 * Le taux d'une ligne est celui qu'elle porte (`rate`), sinon le taux par
 * défaut du commerçant (le réglage TVA du ticket). Sans l'un ni l'autre, la
 * vente reste sous « taux non renseigné » : Kiwi ne devine jamais un taux.
 *
 * La règle de calcul est partagée avec le serveur
 * (functions/api/_rules-day-vat.js, copiée ici par tools/build-shared-rules.mjs).
 *
 *   compute(rows, opts)  → { rows, totals, ... } ou null si rien à ventiler
 *   merge(a, b)          → deux services de la même journée
 *   html(report, ui)     → le bloc de l'écran (ui = { LANG, esc, money, CUR, row })
 *   csvRows(vat, lang)   → lignes de tableur (tableaux de cellules)
 *   tableRows(vat, lang) → { title, headers, rows, note } pour l'export PDF
 *   ticketBlock(vat, lang, fmt) → { title, lines: [[libellé, valeur]] } pour le ticket Z */
(function () {
  'use strict';
  /* GENERATED SHARED KiwiDayVatRules BEGIN */
  /* Copy of functions/api/_rules-day-vat.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiDayVatRules = (function () {
    /* VAT by rate for one business day. Callers supply the day's normalised rows
     * (the ones the day report already counts) and the merchant's default rate.
     * Money stays in integer centimes. A line without a rate takes the merchant's
     * default rate; with no default it lands under "rate unknown" (rate: null) and
     * is never guessed. Pure: no clock, no storage, no DOM.
     *
     * Row: { amount (MAD, signed), kind, lines: [{ total, rate? }] | null }
     * opts: { defaultRate: number|null, included: boolean (prices carry the VAT) }
     * Result: { v, included, defaultRate, rows: [{ rate, baseC, htC, vatC, ttcC }],
     *           totals: { htC, vatC, ttcC, unknownC, allC } }
     * `baseC` is the amount the till recorded for that rate: it is what merges. */
    const toC = function (n) { return Math.round(((Number(n) || 0) + Number.EPSILON) * 100); }
    const goodRate = function (v) {
      if (v == null || v === '' || typeof v === 'boolean') return null;
      const r = Number(v);
      return Number.isFinite(r) && r >= 0 && r <= 100 ? Math.round(r * 100) / 100 : null;
    }
    /* Half up on the magnitude, so a refund mirrors its sale to the centime. */
    const divRound = function (num, den) {
      const sign = num < 0 ? -1 : 1;
      return sign * Math.floor((Math.abs(num) * 2 + den) / (2 * den));
    }
    /* Largest remainder: the parts add up to `total` exactly. */
    const split = function (total, weights) {
      const sum = weights.reduce(function (a, b) { return a + b; }, 0);
      if (!(sum > 0)) return null;
      const sign = total < 0 ? -1 : 1, mag = Math.abs(total);
      const parts = weights.map(function (w, i) {
        const exact = mag * w;
        return { i: i, v: Math.floor(exact / sum), rem: exact % sum };
      });
      let left = mag - parts.reduce(function (a, p) { return a + p.v; }, 0);
      parts.slice().sort(function (a, b) { return b.rem - a.rem || a.i - b.i; }).forEach(function (p) {
        if (left > 0) { p.v++; left--; }
      });
      return parts.map(function (p) { return p.v * sign; });
    }
    const settle = function (rate, baseC, included) {
      if (rate == null) return { rate: null, baseC: baseC, htC: null, vatC: null, ttcC: baseC };
      const bp = Math.round(rate * 100);
      if (included) {
        const htC = divRound(baseC * 10000, 10000 + bp);
        return { rate: rate, baseC: baseC, htC: htC, vatC: baseC - htC, ttcC: baseC };
      }
      const vatC = divRound(baseC * bp, 10000);
      return { rate: rate, baseC: baseC, htC: baseC, vatC: vatC, ttcC: baseC + vatC };
    }
    const finish = function (byRate, included, defaultRate) {
      const keys = Object.keys(byRate).filter(function (k) { return k !== 'unknown'; })
        .sort(function (a, b) { return Number(a) - Number(b); });
      if (byRate.unknown) keys.push('unknown');
      const rows = keys.map(function (k) {
        return settle(k === 'unknown' ? null : Number(k), byRate[k], included);
      });
      const totals = { htC: 0, vatC: 0, ttcC: 0, unknownC: 0, allC: 0 };
      rows.forEach(function (r) {
        if (r.rate == null) { totals.unknownC += r.ttcC; } else {
          totals.htC += r.htC; totals.vatC += r.vatC; totals.ttcC += r.ttcC;
        }
        totals.allC += r.ttcC;
      });
      return { v: 1, included: included, defaultRate: defaultRate, rows: rows, totals: totals };
    }
    const keyOf = function (rate) { return rate == null ? 'unknown' : String(rate); }
    const dayVat = function (rows, opts) {
      const o = opts || {};
      const included = o.included !== false;
      const defaultRate = goodRate(o.defaultRate);
      const byRate = Object.create(null);
      const put = function (rate, c) { const k = keyOf(rate); byRate[k] = (byRate[k] || 0) + c; };
      (rows || []).forEach(function (row) {
        if (!row) return;
        const magC = Math.abs(toC(row.amount));
        if (!magC) return;
        const neg = row.kind === 'refund' || Number(row.amount) < 0;
        const totalC = neg ? -magC : magC;
        const lines = (row.lines || []).filter(function (l) { return l && Number(l.total) > 0; });
        const weights = lines.map(function (l) { return toC(l.total); });
        const parts = lines.length ? split(totalC, weights) : null;
        if (!parts) { put(defaultRate, totalC); return; }
        lines.forEach(function (l, i) {
          const own = goodRate(l.rate);
          put(own != null ? own : defaultRate, parts[i]);
        });
      });
      return finish(byRate, included, defaultRate);
    }
    /* Two services of the same business day: add the recorded amounts per rate and
     * settle again, so rounding never accumulates. */
    const mergeDayVat = function (a, b) {
      if (!a || !b) return a || b || null;
      const byRate = Object.create(null);
      [a, b].forEach(function (v) {
        (v.rows || []).forEach(function (r) { const k = keyOf(r.rate); byRate[k] = (byRate[k] || 0) + (Number(r.baseC) || 0); });
      });
      return finish(byRate, a.included !== false, a.defaultRate != null ? a.defaultRate : b.defaultRate);
    }
    return { dayVat, mergeDayVat };
  })();
  /* GENERATED SHARED KiwiDayVatRules END */

  var TXT = {
    title: { fr: 'TVA par taux', en: 'VAT by rate', ar: 'الضريبة حسب النسبة' },
    rate: { fr: 'Taux', en: 'Rate', ar: 'النسبة' },
    ht: { fr: 'HT', en: 'Excl. VAT', ar: 'خارج الضريبة' },
    vat: { fr: 'TVA', en: 'VAT', ar: 'الضريبة' },
    ttc: { fr: 'TTC', en: 'Incl. VAT', ar: 'شامل الضريبة' },
    total: { fr: 'Total', en: 'Total', ar: 'المجموع' },
    unknown: { fr: 'Taux non renseigné', en: 'Rate not set', ar: 'النسبة غير محددة' },
    unknownNote: {
      fr: 'Aucun taux de TVA n’est réglé pour ces ventes, et Kiwi n’en devine pas. Réglez le taux par défaut dans les réglages du ticket.',
      en: 'No VAT rate is set for these sales, and Kiwi does not guess one. Set the default rate in the receipt settings.',
      ar: 'لا توجد نسبة ضريبة محددة لهذه المبيعات ولا يخمّنها كيوي. حدّد النسبة الافتراضية في إعدادات الوصل.'
    },
    missing: {
      fr: 'Ventilation de la TVA non enregistrée pour cette journée.',
      en: 'The VAT breakdown was not recorded for this day.',
      ar: 'لم يتم تسجيل تفصيل الضريبة لهذا اليوم.'
    },
    excl: {
      fr: 'Prix saisis hors taxe : la TVA s’ajoute au HT.',
      en: 'Prices are entered excluding VAT: VAT is added on top.',
      ar: 'الأسعار مدخلة دون ضريبة: تُضاف الضريبة فوقها.'
    }
  };
  function pick(lang) { return lang === 'en' || lang === 'ar' ? lang : 'fr'; }
  function T(key, lang) { var o = TXT[key]; return o[pick(lang)] != null ? o[pick(lang)] : o.fr; }
  function curLang() { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } }
  function pct(rate) { return String(rate).replace('.', ',') + ' %'; }

  /* Le réglage TVA du commerçant, tel que le ticket l'applique. `mode:'none'`
     veut dire « pas de TVA affichée » : ce n'est pas un taux, donc inconnu. */
  function merchantBasis() {
    var v = null;
    try { var cfg = window.KiwiReceipt && window.KiwiReceipt.config && window.KiwiReceipt.config(); v = cfg && cfg.vat; } catch (_) { v = null; }
    if (!v || v.mode !== 'rate' || !(+v.rate > 0)) return { defaultRate: null, included: true };
    return { defaultRate: +v.rate, included: v.included !== false };
  }

  function compute(rows, opts) {
    var b = merchantBasis(), o = opts || {};
    var vat = KiwiDayVatRules.dayVat(rows, {
      defaultRate: o.defaultRate !== undefined ? o.defaultRate : b.defaultRate,
      included: o.included !== undefined ? o.included : b.included
    });
    return vat.rows.length ? vat : null;
  }
  function merge(a, b) { return KiwiDayVatRules.mergeDayVat(a, b); }

  function mad(c) { return (c || 0) / 100; }
  function cells(vat, lang, fmt) {
    var out = vat.rows.map(function (r) {
      return r.rate == null
        ? [T('unknown', lang), '', '', fmt(r.ttcC)]
        : [pct(r.rate), fmt(r.htC), fmt(r.vatC), fmt(r.ttcC)];
    });
    var t = vat.totals;
    out.push([T('total', lang), fmt(t.htC), fmt(t.vatC), fmt(t.ttcC)]);
    return out;
  }

  function html(r, ui) {
    var L = ui.LANG(), money = function (c) { return ui.money(mad(c)) + ' ' + ui.CUR(); };
    var vat = r && r.vat;
    if (!vat || !vat.rows || !vat.rows.length) {
      if (!r || !(+r.txns > 0) || r.historical || r.detailsUnavailable) return '';
      return '<div class="kdr-sec" data-kdr-vat><div class="kdr-h"><span>' + ui.esc(T('title', L)) + '</span></div>'
        + '<div class="kdr-note">' + ui.esc(T('missing', L)) + '</div></div>';
    }
    var body = vat.rows.map(function (x) {
      if (x.rate == null) return ui.row(T('unknown', L), money(x.ttcC), 'sub');
      return ui.row(pct(x.rate) + ' · ' + T('ht', L) + ' ' + money(x.htC), T('vat', L) + ' ' + money(x.vatC));
    }).join('');
    var t = vat.totals;
    body += ui.row(T('total', L) + ' · ' + T('ht', L) + ' ' + money(t.htC), T('vat', L) + ' ' + money(t.vatC), 'total');
    body += ui.row(T('ttc', L), money(t.ttcC + t.unknownC), 'sub');
    var notes = (t.unknownC ? '<div class="kdr-note">' + ui.esc(T('unknownNote', L)) + '</div>' : '')
      + (vat.included === false ? '<div class="kdr-note">' + ui.esc(T('excl', L)) + '</div>' : '');
    return '<div class="kdr-sec" data-kdr-vat><div class="kdr-h"><span>' + ui.esc(T('title', L)) + '</span><em>'
      + ui.esc(money(t.vatC)) + '</em></div>' + body + notes + '</div>';
  }

  function plain(c) { return (c / 100).toFixed(2); }
  function csvRows(vat, lang) {
    var L = lang || curLang();
    if (!vat || !vat.rows || !vat.rows.length) return [[T('title', L)], [T('missing', L)]];
    return [[T('title', L), 'MAD'], [T('rate', L), T('ht', L), T('vat', L), T('ttc', L)]].concat(cells(vat, L, plain))
      .concat(vat.totals.unknownC ? [[T('unknownNote', L)]] : []);
  }
  function tableRows(vat, lang) {
    var L = lang || curLang();
    var money = function (c) { return new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(mad(c)) + ' MAD'; };
    if (!vat || !vat.rows || !vat.rows.length) return { title: T('title', L), headers: [], rows: [], note: T('missing', L) };
    return { title: T('title', L), headers: [T('rate', L), T('ht', L), T('vat', L), T('ttc', L)], rows: cells(vat, L, money),
      note: vat.totals.unknownC ? T('unknownNote', L) : '' };
  }
  /* Le ticket Z : un titre, puis un libellé et une valeur par ligne. */
  function ticketBlock(vat, lang, fmt) {
    var L = lang || curLang(), f = fmt || function (c) { return plain(c); };
    if (!vat || !vat.rows || !vat.rows.length) return null;
    var lines = [];
    vat.rows.forEach(function (x) {
      if (x.rate == null) { lines.push([T('unknown', L), f(mad(x.ttcC))]); return; }
      lines.push([T('vat', L) + ' ' + pct(x.rate), f(mad(x.vatC))]);
      lines.push(['  ' + T('ht', L), f(mad(x.htC))]);
    });
    lines.push([T('total', L) + ' ' + T('vat', L), f(mad(vat.totals.vatC))]);
    return { title: T('title', L).toUpperCase(), lines: lines };
  }

  window.KiwiDayReportVat = { compute: compute, merge: merge, html: html, csvRows: csvRows, tableRows: tableRows, ticketBlock: ticketBlock };
})();
