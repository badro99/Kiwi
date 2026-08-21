/* Kiwi AI - le point du matin.
 *
 * This module owns the durable, deterministic briefing envelope. Rules are
 * intentionally absent in Phase 1b: a real merchant gets a calm empty state,
 * never demo recommendations or placeholders for data Kiwi cannot yet read.
 */
(function () {
  'use strict';

  var FEATURE = 'briefing';
  var PREFIX = 'kiwi:briefing:v1:';
  var MAX_DAYS = 45;
  var RULES = [salesDropRule, lowStockRule, marginErosionRule, planningGapRule, cancellationRateRule, discountShareRule, cashGapRule, lateOrdersRule];
  var doc = { days: [] };
  var cloud = null;

  var COPY = {
    fr: {
      eyebrow: 'KIWI AI', title: 'Le point du matin', empty: 'Rien d’urgent à signaler.', calm: 'Rien d’urgent', signalOne: '1 signal', signalMany: '{n} signaux',
      emptyNote: 'Kiwi surveille uniquement les données mesurées de cet établissement.', ask: 'Voir le point du matin',
      coverage: 'Je surveille les signaux déjà mesurables, sans inventer les données manquantes.',
      coveredLabel: 'Couverture active', covered: 'Ventes · stock · marge · planning · remises · annulations · caisse · délais de service',
      waitingLabel: 'Signaux bloqués', waiting: 'Aucun',
      demo: 'Le point du matin s’active sur un établissement réel connecté. La démonstration ne fabrique aucune alerte.',
      handled: 'Traité', dismiss: 'Masquer', propose: 'Proposer'
    },
    en: {
      eyebrow: 'KIWI AI', title: 'Morning briefing', empty: 'Nothing urgent to flag.', calm: 'Nothing urgent', signalOne: '1 signal', signalMany: '{n} signals',
      emptyNote: 'Kiwi monitors only measured data from this venue.', ask: 'Open morning briefing',
      coverage: 'I monitor the signals that are already measurable, without inventing missing data.',
      coveredLabel: 'Active coverage', covered: 'Sales · stock · margin · staffing · discounts · cancellations · cash · service timing',
      waitingLabel: 'Blocked signals', waiting: 'None',
      demo: 'Morning briefing activates for a connected real venue. The demo never fabricates alerts.',
      handled: 'Handled', dismiss: 'Dismiss', propose: 'Propose'
    },
    ar: {
      eyebrow: 'KIWI AI', title: 'ملخص الصباح', empty: 'لا توجد أمور عاجلة الآن.', calm: 'لا شيء عاجل', signalOne: 'إشارة واحدة', signalMany: '{n} إشارات',
      emptyNote: 'يراقب Kiwi فقط البيانات المقاسة لهذا المحل.', ask: 'عرض ملخص الصباح',
      coverage: 'أراقب الإشارات القابلة للقياس حاليا، من دون اختراع البيانات الناقصة.',
      coveredLabel: 'التغطية الحالية', covered: 'المبيعات · المخزون · الهامش · جدول العمل · التخفيضات · الإلغاءات · الصندوق · مدة الخدمة',
      waitingLabel: 'إشارات محجوبة', waiting: 'لا شيء',
      demo: 'يتفعل ملخص الصباح في محل حقيقي متصل. العرض التجريبي لا يصنع تنبيهات.',
      handled: 'تمت المعالجة', dismiss: 'إخفاء', propose: 'اقتراح'
    }
  };

  function lang(wanted) {
    var v = String(wanted || document.documentElement.lang || localStorage.getItem('kiwiLang') || 'fr').slice(0, 2);
    return COPY[v] ? v : 'fr';
  }
  function tr(wanted) { return COPY[lang(wanted)]; }
  function isReal() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); }
    catch (_) { return false; }
  }
  function tier() {
    try { return window.KiwiAgentTier ? window.KiwiAgentTier() : 'staff'; }
    catch (_) { return 'staff'; }
  }
  function slug() {
    try { return String(window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug ? window.KiwiCloudDoc.currentSlug() : ''); }
    catch (_) { return ''; }
  }
  function accountId() {
    try {
      var me = window.KiwiMe || {};
      var identity = window.KiwiIdentity || {};
      return String(me.accountId || me.id || identity.accountId || identity.id || 'session').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 96) || 'session';
    } catch (_) { return 'session'; }
  }
  function businessDay(now) {
    now = Number(now) || Date.now();
    try {
      var R = window.KiwiDayReport;
      if (R && R.businessDay) return String(R.businessDay(now));
      var cut = R && R.cutoff ? Number(R.cutoff()) : 5;
      var d = new Date(now - (isFinite(cut) ? cut : 5) * 3600000);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } catch (_) { return new Date(now).toISOString().slice(0, 10); }
  }
  function scopeKey(now) { return [accountId(), slug(), businessDay(now)].join(':'); }
  function localKey(now) { return PREFIX + scopeKey(now); }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
  function safeDoc(value) {
    value = value && typeof value === 'object' ? value : {};
    var days = Array.isArray(value.days) ? value.days.filter(function (x) { return x && x.id && x.day; }) : [];
    days.sort(function (a, b) { return (+b.updatedAt || 0) - (+a.updatedAt || 0); });
    return { days: days.slice(0, MAX_DAYS) };
  }
  function readLocal() {
    if (!slug()) return { days: [] };
    try { return safeDoc(JSON.parse(localStorage.getItem(localKey()) || 'null')); }
    catch (_) { return { days: [] }; }
  }
  function writeLocal(value) {
    doc = safeDoc(value);
    if (slug()) { try { localStorage.setItem(localKey(), JSON.stringify(doc)); } catch (_) {} }
    render();
  }
  function mergeDocs(a, b) {
    var rows = Object.create(null);
    safeDoc(a).days.concat(safeDoc(b).days).forEach(function (x) {
      var old = rows[x.id];
      if (!old || (+x.updatedAt || 0) >= (+old.updatedAt || 0)) rows[x.id] = x;
    });
    return safeDoc({ days: Object.keys(rows).map(function (k) { return rows[k]; }) });
  }
  function normalizeEvidence(value) {
    if (!value || typeof value !== 'object') return null;
    var count = Number(value.count);
    var windowLabel = String(value.window || '').trim().slice(0, 120);
    var source = String(value.source || '').trim().slice(0, 120);
    return Number.isFinite(count) && count >= 0 && windowLabel && source ? { count: count, window: windowLabel, source: source } : null;
  }
  function normalizeLine(value) {
    if (!value || typeof value !== 'object') return null;
    var evidence = normalizeEvidence(value.evidence);
    var id = String(value.id || '').trim().slice(0, 96);
    if (!id || !evidence) return null;
    var roles = Array.isArray(value.roles) ? value.roles.filter(function (x) { return /^(owner|manager|staff)$/.test(x); }) : [];
    return {
      id: id, kind: String(value.kind || '').slice(0, 40), tone: String(value.tone || 'neutral').slice(0, 20),
      copy: clone(value.copy) || {}, evidence: evidence, roles: roles.length ? roles : ['owner'],
      action: value.action ? clone(value.action) : null
    };
  }
  function salesRows() {
    try {
      var id = window.KiwiVenue && window.KiwiVenue.getVenue ? window.KiwiVenue.getVenue() : null;
      var rows = window.KiwiSales && window.KiwiSales.list ? window.KiwiSales.list(id) : null;
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }
  function dayBoundsAt(ts) {
    try {
      var R = window.KiwiDayReport;
      if (R && R.businessDay && R.dayBounds) {
        var b = R.dayBounds(R.businessDay(ts));
        if (b && isFinite(b.from) && isFinite(b.to)) return { from: +b.from, to: +b.to };
      }
    } catch (_) {}
    var cut = 5;
    try { cut = Number(window.KiwiDayReport && window.KiwiDayReport.cutoff ? window.KiwiDayReport.cutoff() : 5); } catch (_) {}
    if (!isFinite(cut)) cut = 5;
    var d = new Date(ts - cut * 3600000); d.setHours(0, 0, 0, 0);
    var from = d.getTime() + cut * 3600000;
    return { from: from, to: from + 86400000 };
  }
  function windowStats(rows, from, to) {
    var revenue = 0, count = 0;
    rows.forEach(function (row) {
      var ts = Number(row && row.ts) || 0;
      if (ts < from || ts >= to) return;
      revenue += Math.max(0, Number(row.amount) || 0); count++;
    });
    return { revenue: Math.round(revenue * 100) / 100, count: count };
  }
  function median(values) {
    var a = values.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }
  function salesDropRule(input) {
    input = input || {};
    var ready = input.backfillComplete;
    if (ready == null) {
      try {
        var status = window.KiwiLive && window.KiwiLive.status ? window.KiwiLive.status() : null;
        ready = !!(status && status.on && status.backfillComplete && status.merchant === slug());
      } catch (_) { ready = false; }
    }
    if (!ready) return null;
    var now = Number(input.now) || Date.now();
    var rows = Array.isArray(input.rows) ? input.rows : salesRows();
    var currentBounds = dayBoundsAt(now);
    var elapsed = Math.max(0, Math.min(now - currentBounds.from, currentBounds.to - currentBounds.from));
    if (!(elapsed > 0)) return null;
    var current = windowStats(rows, currentBounds.from, currentBounds.from + elapsed);
    function sample(daysBack) {
      var b = dayBoundsAt(currentBounds.from - daysBack * 86400000 + 1000);
      return windowStats(rows, b.from, Math.min(b.to, b.from + elapsed));
    }
    var sameWeekday = [7, 14, 21, 28].map(sample).filter(function (x) { return x.count > 0; });
    var trailing = [1, 2, 3, 4, 5, 6, 7].map(sample).filter(function (x) { return x.count > 0; });
    if (sameWeekday.length < 3 || trailing.length < 3) return null;
    var weekdayMedian = median(sameWeekday.map(function (x) { return x.revenue; }));
    var trailingMedian = median(trailing.map(function (x) { return x.revenue; }));
    var threshold = 0.20;
    if (!(weekdayMedian > 0) || !(trailingMedian > 0)) return null;
    if (current.revenue > weekdayMedian * (1 - threshold) || current.revenue > trailingMedian * (1 - threshold)) return null;
    var weekdayDrop = 100 * (1 - current.revenue / weekdayMedian);
    var trailingDrop = 100 * (1 - current.revenue / trailingMedian);
    var drop = Math.max(0, Math.round(Math.min(weekdayDrop, trailingDrop)));
    var day = businessDay(now);
    var end = new Date(currentBounds.from + elapsed);
    var time = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
    var cur = Math.round(current.revenue).toLocaleString('fr-FR');
    var wd = Math.round(weekdayMedian).toLocaleString('fr-FR');
    var tr7 = Math.round(trailingMedian).toLocaleString('fr-FR');
    return {
      id: 'sales-drop:' + day, kind: 'sales-drop', tone: 'warn', roles: ['owner', 'manager', 'staff'],
      copy: {
        fr: 'Ventes en baisse de ' + drop + ' % : ' + cur + ' MAD à ' + time + ', contre ' + wd + ' MAD les mêmes jours et ' + tr7 + ' MAD sur les 7 derniers jours. Seuil : -20 %.',
        en: 'Sales are down ' + drop + '%: ' + cur + ' MAD by ' + time + ', versus ' + wd + ' MAD on matching weekdays and ' + tr7 + ' MAD over the last 7 days. Threshold: -20%.',
        ar: 'انخفضت المبيعات بنسبة ' + drop + '٪: ' + cur + ' درهم حتى ' + time + '، مقابل ' + wd + ' درهم في الأيام المماثلة و' + tr7 + ' درهم خلال آخر 7 أيام. العتبة: -20٪.'
      },
      evidence: { count: current.count, window: day + ' · 05:00-' + time, source: 'KiwiSales.list · backfill complet' }
    };
  }
  function stockItems() {
    try {
      var rows = window.KiwiStockBriefing && window.KiwiStockBriefing.items ? window.KiwiStockBriefing.items() : null;
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }
  function marginErosionRule(input) {
    input = input || {};
    var D = window.KiwiDayReport, C = window.KiwiCost;
    var currentDay = input.currentDay, baselineDay = input.baselineDay;
    var current = input.current, baseline = input.baseline;
    if (!current || !baseline) {
      if (!D || typeof D.lastClosedDay !== 'function' || typeof D.shiftDay !== 'function'
        || typeof D.dayBounds !== 'function' || !C || typeof C.coverage !== 'function') return null;
      var currentBounds, baselineBounds, rows;
      try {
        currentDay = D.lastClosedDay();
        baselineDay = D.shiftDay(currentDay, -7);
        currentBounds = D.dayBounds(currentDay);
        baselineBounds = D.dayBounds(baselineDay);
        rows = window.KiwiSales && window.KiwiSales.list ? window.KiwiSales.list(venueId()) : [];
        if (!Array.isArray(rows)) return null;
        current = C.coverage(rows, currentBounds.from, currentBounds.to);
        baseline = C.coverage(rows, baselineBounds.from, baselineBounds.to);
      } catch (_) { return null; }
    }
    var currentCoverage = +(current && current.pctCosted);
    var baselineCoverage = +(baseline && baseline.pctCosted);
    var currentMargin = +(current && current.marginPct);
    var baselineMargin = +(baseline && baseline.marginPct);
    if (!(current && baseline) || !(current.revenueCosted > 0) || !(baseline.revenueCosted > 0)
      || !isFinite(currentCoverage) || !isFinite(baselineCoverage)
      || currentCoverage < 80 || baselineCoverage < 80
      || Math.abs(currentCoverage - baselineCoverage) > 10
      || !isFinite(currentMargin) || !isFinite(baselineMargin)) return null;
    var erosion = baselineMargin - currentMargin;
    if (erosion < 5) return null;
    var pct = function (n) { return Math.round(n * 10) / 10; };
    return {
      id: 'margin-erosion:' + String(currentDay || 'period'),
      kind: 'margin-erosion', roles: ['owner'],
      copy: {
        fr: 'La marge brute baisse de ' + pct(erosion) + ' points (alerte dès 5 points). Couverture des coûts : ' + pct(currentCoverage) + ' % contre ' + pct(baselineCoverage) + ' %.',
        en: 'Gross margin fell by ' + pct(erosion) + ' points (alert from 5 points). Cost coverage: ' + pct(currentCoverage) + '% vs ' + pct(baselineCoverage) + '%.',
        ar: 'انخفض الهامش الإجمالي بمقدار ' + pct(erosion) + ' نقاط (التنبيه من 5 نقاط). تغطية التكلفة: ' + pct(currentCoverage) + '% مقابل ' + pct(baselineCoverage) + '٪.'
      },
      evidence: {
        count: 2,
        window: String(currentDay || 'période') + ' vs ' + String(baselineDay || 'référence'),
        source: 'KiwiCost.coverage · ' + pct(currentCoverage) + '% / ' + pct(baselineCoverage) + '% chiffré'
      }
    };
  }

  function lowStockRule(input) {
    input = input || {};
    var items = Array.isArray(input.items) ? input.items : stockItems();
    if (!items.length) return null;
    var tracked = items.filter(function (item) {
      return item && item.tracked === true && Number.isFinite(+item.balance) && Number.isFinite(+item.threshold) && +item.threshold > 0;
    });
    var low = tracked.filter(function (item) { return +item.balance < +item.threshold; }).sort(function (a, b) {
      return (+a.balance / +a.threshold) - (+b.balance / +b.threshold);
    });
    if (!low.length) return null;
    var names = low.slice(0, 3).map(function (item) { return String(item.name || item.id); }).join(', ');
    var extra = low.length > 3 ? ' +' + (low.length - 3) : '';
    var coverageFr = tracked.length + ' articles suivis sur ' + items.length;
    var coverageEn = tracked.length + ' tracked items out of ' + items.length;
    var coverageAr = tracked.length + ' صنفاً متابعاً من أصل ' + items.length;
    var first = low.find(function (item) { return String(item.supplier || '').trim(); });
    var action = null;
    if (first) {
      var qty = Math.max(1, Math.ceil((Number(first.par) > Number(first.balance) ? Number(first.par) : Number(first.threshold)) - Number(first.balance)));
      action = { name: 'create-po', args: { supplierName: String(first.supplier), lines: [{ itemId: String(first.id), name: String(first.name || first.id), qty: qty, unit: String(first.unit || '') }], note: 'Proposition du point du matin · stock sous seuil' } };
    }
    return {
      id: 'low-stock:' + businessDay(Date.now()), kind: 'low-stock', tone: 'warn', roles: ['owner', 'manager'], action: action,
      copy: {
        fr: low.length + ' article' + (low.length > 1 ? 's sont' : ' est') + ' sous le seuil : ' + names + extra + '. Couverture : ' + coverageFr + '.',
        en: low.length + ' item' + (low.length > 1 ? 's are' : ' is') + ' below reorder level: ' + names + extra + '. Coverage: ' + coverageEn + '.',
        ar: low.length + ' من الأصناف تحت عتبة إعادة الطلب: ' + names + extra + '. التغطية: ' + coverageAr + '.'
      },
      evidence: { count: tracked.length, window: 'stock actuel · ' + businessDay(Date.now()), source: 'KiwiInventory.balance' }
    };
  }
  function minute(value) {
    var match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    var out = (+match[1] * 60) + +match[2];
    return out >= 0 && out < 1440 ? out : null;
  }
  function spans(from, to) {
    var a = minute(from), b = minute(to);
    if (a == null || b == null || a === b) return [];
    return b > a ? [[a, b]] : [[a, 1440], [0, b]];
  }
  function planningGapRule(input) {
    input = input || {};
    var day = input.day, plan = input.plan, periods = input.periods;
    if (!plan || !Array.isArray(periods)) {
      var D = window.KiwiDayReport, T = window.KiwiTeam, H = window.KiwiHours;
      if (!D || typeof D.today !== 'function' || !T || typeof T.planningDay !== 'function'
        || !H || typeof H.isConfigured !== 'function' || typeof H.periodsOn !== 'function') return null;
      try {
        day = D.today();
        var vid = venueId();
        if (!H.isConfigured(vid)) return null;
        plan = T.planningDay(day);
        periods = H.periodsOn(day, vid);
      } catch (_) { return null; }
    }
    if (!plan || plan.configured !== true || plan.published !== true || !Array.isArray(periods) || !periods.length) return null;
    var openings = [];
    periods.forEach(function (p) { openings = openings.concat(spans(p && p.from, p && p.to)); });
    if (!openings.length) return null;
    var shifts = [];
    (Array.isArray(plan.members) ? plan.members : []).forEach(function (m) {
      if (!m || m.off) return;
      spans(m.start, m.end).forEach(function (range) { shifts.push({ from: range[0], to: range[1], firstName: String(m.firstName || '').slice(0, 40) }); });
    });
    var gap = openings.some(function (opening) {
      for (var at = opening[0]; at < opening[1]; at += 15) {
        if (!shifts.some(function (shift) { return shift.from <= at && shift.to >= Math.min(at + 15, opening[1]); })) return true;
      }
      return false;
    });
    if (!gap) return null;
    return {
      id: 'planning-gap:' + String(day || 'day'), kind: 'planning-gap', tone: 'warn', roles: ['owner', 'manager'],
      copy: {
        fr: 'Le planning publié laisse une partie des horaires d’ouverture sans couverture.',
        en: 'The published schedule leaves part of an opening period uncovered.',
        ar: 'يترك الجدول المنشور جزءًا من فترة الافتتاح دون تغطية.'
      },
      evidence: { count: openings.length, window: String(day || '') + ' · ' + periods.map(function (p) { return p.from + '-' + p.to; }).join(', '), source: 'planning publié + KiwiHours.periodsOn' },
      action: { name: 'open-planning', args: {}, summary: 'Ouvrir le planning' }
    };
  }
  function cancellationRateRule(input) {
    input = input || {};
    var current = input.current, baselineRates = input.baselineRates, day = input.day;
    if (!current || !Array.isArray(baselineRates)) {
      var H = window.KiwiCancellationHistory, D = window.KiwiDayReport;
      if (!H || typeof H.ready !== 'function' || !H.ready() || typeof H.list !== 'function'
        || !D || typeof D.lastClosedDay !== 'function' || typeof D.dayBounds !== 'function' || typeof D.shiftDay !== 'function') return null;
      var events, rows;
      try { events = H.list(); rows = salesRows(); day = D.lastClosedDay(); } catch (_) { return null; }
      if (!Array.isArray(events) || !Array.isArray(rows)) return null;
      var stats = function (targetDay) {
        var bounds = D.dayBounds(targetDay);
        var cancelled = events.filter(function (event) { return +event.voidedAt >= bounds.from && +event.voidedAt < bounds.to; });
        var active = rows.filter(function (sale) { return +sale.ts >= bounds.from && +sale.ts < bounds.to; }).length;
        var reasons = Object.create(null);
        cancelled.forEach(function (event) { var key = String(event.reason || 'non-renseigne'); reasons[key] = (reasons[key] || 0) + 1; });
        return { cancellations: cancelled.length, total: active + cancelled.length, reasons: reasons };
      };
      current = stats(day); baselineRates = [];
      for (var i = 1; i <= 4; i += 1) {
        var comparable = stats(D.shiftDay(day, -7 * i));
        if (comparable.total > 0) baselineRates.push((comparable.cancellations / comparable.total) * 100);
      }
    }
    if (!current || baselineRates.length < 3 || !(current.total > 0) || current.cancellations < 2) return null;
    var currentRate = (current.cancellations / current.total) * 100;
    var baseline = median(baselineRates);
    if (!Number.isFinite(baseline) || currentRate < 5 || currentRate < Math.max(5, baseline * 2)) return null;
    var reasonRows = Object.keys(current.reasons || {}).map(function (key) { return { key: key, count: +current.reasons[key] || 0 }; }).sort(function (a, b) { return b.count - a.count; });
    var top = reasonRows[0] || { key: 'non-renseigne', count: current.cancellations };
    var rate = Math.round(currentRate * 10) / 10, base = Math.round(baseline * 10) / 10;
    return {
      id: 'cancellation-rate:' + String(day || 'day'), kind: 'cancellation-rate', tone: 'warn', roles: ['owner', 'manager'],
      copy: {
        fr: 'Annulations à ' + rate + ' % contre ' + base + ' % habituellement. Motif principal : ' + top.key + ' (' + top.count + '). Seuil : au moins 5 % et 2× la référence.',
        en: 'Cancellations are ' + rate + '% versus a usual ' + base + '%. Main reason: ' + top.key + ' (' + top.count + '). Threshold: at least 5% and 2× baseline.',
        ar: 'بلغت الإلغاءات ' + rate + '٪ مقابل ' + base + '٪ عادةً. السبب الرئيسي: ' + top.key + ' (' + top.count + '). العتبة: 5٪ على الأقل وضعف المرجع.'
      },
      evidence: { count: current.cancellations, window: String(day || '') + ' · 4 mêmes jours de semaine', source: 'sale_void_history + KiwiSales.list' }
    };
  }
  function discountShareRule(input) {
    input = input || {};
    var current = input.current, baselineShares = input.baselineShares, day = input.day;
    if (!current || !Array.isArray(baselineShares)) {
      var ready = input.backfillComplete;
      if (ready == null) {
        try { var live = window.KiwiLive && window.KiwiLive.status ? window.KiwiLive.status() : null; ready = !!(live && live.on && live.backfillComplete && live.merchant === slug()); }
        catch (_) { ready = false; }
      }
      var D = window.KiwiDayReport;
      if (!ready || !D || typeof D.lastClosedDay !== 'function' || typeof D.dayBounds !== 'function' || typeof D.shiftDay !== 'function') return null;
      var rows = salesRows(); day = D.lastClosedDay();
      var stats = function (targetDay) {
        var bounds = D.dayBounds(targetDay), gross = 0, discount = 0, discountedCount = 0, actors = Object.create(null);
        rows.forEach(function (sale) {
          if (!(+sale.ts >= bounds.from && +sale.ts < bounds.to)) return;
          var net = sale.amountCents != null ? +sale.amountCents : Math.round((+sale.amount || 0) * 100);
          var saleGross = sale.grossAmountCents != null ? +sale.grossAmountCents : net;
          if (!(saleGross > 0)) return;
          gross += saleGross;
          var cut = +sale.discountAmountCents || 0;
          if (cut > 0 && cut <= saleGross && sale.actorId) {
            discount += cut; discountedCount += 1;
            actors[sale.actorId] = (actors[sale.actorId] || 0) + cut;
          }
        });
        return { gross: gross, discount: discount, discountedCount: discountedCount, actors: actors };
      };
      current = stats(day); baselineShares = [];
      for (var i = 1; i <= 4; i += 1) {
        var comparable = stats(D.shiftDay(day, -7 * i));
        if (comparable.gross > 0) baselineShares.push((comparable.discount / comparable.gross) * 100);
      }
    }
    if (!current || baselineShares.length < 3 || !(current.gross > 0) || current.discountedCount < 2 || !(current.discount > 0)) return null;
    var share = (current.discount / current.gross) * 100, baseline = median(baselineShares);
    if (!Number.isFinite(baseline) || share < 5 || share < Math.max(5, baseline * 2)) return null;
    var actorRows = Object.keys(current.actors || {}).map(function (id) { return { id: id, amount: +current.actors[id] || 0 }; }).sort(function (a, b) { return b.amount - a.amount; });
    var actor = actorRows[0] ? actorRows[0].id : 'id-inconnu';
    var pct = Math.round(share * 10) / 10, base = Math.round(baseline * 10) / 10;
    return {
      id: 'discount-share:' + String(day || 'day'), kind: 'discount-share', tone: 'warn', roles: ['owner'],
      copy: {
        fr: 'Les remises représentent ' + pct + ' % du brut contre ' + base + ' % habituellement. Acteur principal : ' + actor + '. Seuil : au moins 5 % et 2× la référence.',
        en: 'Discounts represent ' + pct + '% of gross versus a usual ' + base + '%. Leading actor: ' + actor + '. Threshold: at least 5% and 2× baseline.',
        ar: 'تمثل الخصومات ' + pct + '٪ من الإجمالي مقابل ' + base + '٪ عادةً. المعرّف الرئيسي: ' + actor + '. العتبة: 5٪ على الأقل وضعف المرجع.'
      },
      evidence: { count: current.discountedCount, window: String(day || '') + ' · 4 mêmes jours de semaine', source: 'sales.discount_amount_cents / gross_amount_cents' }
    };
  }

  function cashGapRule(input) {
    input = input || {};
    var C = window.KiwiCashSessions;
    var sourceReady = input.ready;
    if (sourceReady == null) sourceReady = !!(C && C.ready && C.ready());
    if (!sourceReady) return null;
    var rows = Array.isArray(input.events) ? input.events : (C && C.list ? C.list() : []);
    var wantedMerchant = String(input.merchant == null ? slug() : input.merchant);
    var day = String(input.day || businessDay(Date.now() - 86400000));
    var threshold = Number(input.thresholdCents == null ? 10000 : input.thresholdCents);
    var dayOf = typeof input.businessDay === 'function' ? input.businessDay : businessDay;
    var reconciliations = rows.filter(function (row) {
      if (!row || (wantedMerchant && String(row.merchant || '') !== wantedMerchant)) return false;
      if (row.event_type !== 'close' && row.eventType !== 'close' && row.event_type !== 'handover' && row.eventType !== 'handover') return false;
      var opened = Number(row.opened_ts == null ? row.openedAt : row.opened_ts);
      var gap = Number(row.gap_cents == null ? row.gapCents : row.gap_cents);
      return opened > 0 && dayOf(opened) === day && Number.isFinite(gap);
    });
    if (!Number.isFinite(threshold) || threshold < 0 || !reconciliations.length) return null;
    var worst = reconciliations.slice().sort(function (a, b) {
      var ga = Number(a.gap_cents == null ? a.gapCents : a.gap_cents);
      var gb = Number(b.gap_cents == null ? b.gapCents : b.gap_cents);
      return Math.abs(gb) - Math.abs(ga);
    })[0];
    var gapCents = Number(worst.gap_cents == null ? worst.gapCents : worst.gap_cents);
    if (Math.abs(gapCents) < threshold) return null;
    var gapLabel = (gapCents / 100).toFixed(2), thresholdLabel = (threshold / 100).toFixed(2);
    return {
      id: 'cash-gap:' + day, kind: 'cash-gap', tone: 'warn', roles: ['owner'],
      copy: {
        fr: 'Écart de caisse de ' + gapLabel + ' MAD, seuil visible ' + thresholdLabel + ' MAD.',
        en: 'Cash gap of ' + gapLabel + ' MAD, visible threshold ' + thresholdLabel + ' MAD.',
        ar: 'فرق الصندوق ' + gapLabel + ' MAD، والحد الظاهر ' + thresholdLabel + ' MAD.'
      },
      evidence: { count: reconciliations.length, window: day, source: 'cash_session_events · seuil ' + thresholdLabel + ' MAD' }
    };
  }

  function lateOrdersRule(input) {
    input = input || {};
    var O = window.KiwiOrderCourse;
    var sourceReady = input.ready;
    if (sourceReady == null) sourceReady = !!(O && O.ready && O.ready());
    if (!sourceReady) return null;
    var rows = Array.isArray(input.orders) ? input.orders : (O && O.list ? O.list() : []);
    var wantedMerchant = String(input.merchant == null ? slug() : input.merchant);
    var day = String(input.day || businessDay(Date.now() - 86400000));
    var dayOf = typeof input.businessDay === 'function' ? input.businessDay : businessDay;
    var dayMs = Number(input.dayMs) || 86400000;
    var end = Number(input.endAt) || Date.now();
    function ts(row, snake, camel) { return Number(row[snake] == null ? row[camel] : row[snake]); }
    function durations(row) {
      var sent = ts(row, 'sent_ts', 'sentAt'), readyAt = ts(row, 'ready_ts', 'readyAt'), served = ts(row, 'served_ts', 'servedAt');
      return {
        kitchen: sent > 0 && readyAt > sent && readyAt - sent <= 4 * 3600000 ? readyAt - sent : null,
        service: readyAt > 0 && served > readyAt && served - readyAt <= 4 * 3600000 ? served - readyAt : null,
        sent: sent
      };
    }
    var scoped = rows.filter(function (row) { return row && (!wantedMerchant || String(row.merchant || '') === wantedMerchant); });
    var current = scoped.filter(function (row) { var d = durations(row); return d.sent > 0 && dayOf(d.sent) === day; }).map(durations);
    var baseline = scoped.filter(function (row) {
      var d = durations(row); return d.sent > 0 && dayOf(d.sent) !== day && d.sent >= end - 28 * dayMs && d.sent < end;
    }).map(durations);
    function stage(key, labelFr, labelEn, labelAr) {
      var nowRows = current.map(function (d) { return d[key]; }).filter(Number.isFinite);
      var baseRows = baseline.map(function (d) { return d[key]; }).filter(Number.isFinite);
      if (nowRows.length < 3 || baseRows.length < 5) return null;
      var nowMedian = median(nowRows), baseMedian = median(baseRows);
      if (!(baseMedian > 0) || nowMedian < baseMedian * 1.5 || nowMedian - baseMedian < 300000) return null;
      var nowMin = Math.round(nowMedian / 60000), baseMin = Math.round(baseMedian / 60000);
      return {
        id: 'late-orders:' + key + ':' + day, kind: 'late-orders-' + key, tone: 'warn', roles: ['owner', 'manager'],
        copy: {
          fr: labelFr + ' médian ' + nowMin + ' min contre ' + baseMin + ' min, alerte à 1,5× et +5 min.',
          en: labelEn + ' median ' + nowMin + ' min versus ' + baseMin + ' min, alert at 1.5x and +5 min.',
          ar: labelAr + ' ' + nowMin + ' دقيقة مقابل ' + baseMin + ' دقيقة، التنبيه عند 1.5x و+5 دقائق.'
        },
        evidence: { count: nowRows.length, window: day + ' · baseline 28 jours (' + baseRows.length + ')', source: 'order_course.' + key }
      };
    }
    return [
      stage('kitchen', 'Préparation', 'Preparation', 'مدة التحضير'),
      stage('service', 'Service après préparation', 'Service after ready', 'مدة التقديم بعد الجاهزية')
    ].filter(Boolean);
  }
  function visibleLines(lines, role) {
    role = role || tier();
    return (Array.isArray(lines) ? lines : []).filter(function (line) {
      return line && Array.isArray(line.roles) && line.roles.indexOf(role) !== -1;
    });
  }
  function current() {
    var id = scopeKey();
    return doc.days.find(function (x) { return x.id === id; }) || null;
  }
  function save() {
    writeLocal(doc);
    if (cloud) Promise.resolve(cloud.bind()).then(function () { cloud.push(0); }).catch(function () {});
  }
  function compute(rules) {
    if (!isReal() || !slug()) return null;
    var lines = [];
    (rules || RULES).forEach(function (rule) {
      try {
        var result = typeof rule === 'function' ? rule() : null;
        (Array.isArray(result) ? result : [result]).forEach(function (candidate) {
          var line = normalizeLine(candidate);
          if (line) lines.push(line);
        });
      } catch (_) {}
    });
    var now = Date.now(), id = scopeKey(now), old = current();
    var row = {
      id: id, accountId: accountId(), venue: slug(), day: businessDay(now), generatedAt: now,
      updatedAt: now, lines: lines, dismissed: clone(old && old.dismissed) || {}, handled: clone(old && old.handled) || {}
    };
    doc.days = [row].concat(doc.days.filter(function (x) { return x.id !== id; }));
    save();
    return row;
  }
  function setState(lineId, field) {
    var row = current();
    if (!row || !lineId || (field !== 'dismissed' && field !== 'handled')) return false;
    row[field] = row[field] && typeof row[field] === 'object' ? row[field] : {};
    row[field][lineId] = Date.now(); row.updatedAt = Date.now(); save(); return true;
  }
  function activeLines(role) {
    var row = current();
    if (!row) return [];
    return visibleLines(row.lines, role).filter(function (x) { return !(row.dismissed && row.dismissed[x.id]) && !(row.handled && row.handled[x.id]); });
  }
  function openPlanning() {
    var open = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['nav-payroll'];
    if (typeof open !== 'function') return { ok: false, reason: 'unavailable' };
    open();
    return { ok: true, opened: 'planning' };
  }
  function proposeLine(id) {
    var line = activeLines(tier()).find(function (x) { return x.id === id; });
    if (!line || !line.action) return { ok: false, reason: 'unavailable' };
    if (line.action.name === 'open-planning') return openPlanning();
    if (!window.KiwiAgentActions || typeof window.KiwiAgentActions.request !== 'function') return { ok: false, reason: 'unavailable' };
    var args = clone(line.action.args) || {};
    args.commandId = ('briefing-' + line.id).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60);
    args.said = lineText(line, 'fr');
    var result = window.KiwiAgentActions.request(line.action.name, args);
    if (result && result.confirmationRequired) {
      try { if (window.KiwiActionCenter && window.KiwiActionCenter.open) window.KiwiActionCenter.open(); } catch (_) {}
    }
    return result || { ok: false, reason: 'refused' };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function lineText(line, wanted) {
    var c = line && line.copy || {};
    return String(c[lang(wanted)] || c.fr || c.en || '');
  }
  /* Point d'ancrage du point du matin. Il vit DANS la carte Kiwi Insights
   * (.hero-right : « Recommandations du jour »), juste avant les puces de
   * questions — les deux servaient le même propos et occupaient deux cartes.
   * La peau Vexel déplace .hero-right entière dans .vexel-insights-row : le
   * bloc la suit. Repli (sans .hero-right) : après .hero-today, jamais dans
   * .vexel-revenue-row — rangée flex à hauteur fixe qui faisait déborder tout
   * l'accueil (2026-08-21). Recalculé à chaque rendu. */
  function anchor() {
    var chips = document.querySelector('.hero-right .hai-chips');
    if (chips && chips.parentNode) return { parent: chips.parentNode, before: chips };
    var hero = document.querySelector('.hero-today');
    if (!hero || !hero.parentNode) return null;
    var row = hero.closest('.vexel-revenue-row');
    if (row && row.parentNode) return { parent: row.parentNode, before: row.nextSibling };
    return { parent: hero.parentNode, before: hero.nextSibling };
  }
  function place(el) {
    var at = anchor(); if (!at) return false;
    if (el.parentNode !== at.parent || el.nextSibling !== at.before) at.parent.insertBefore(el, at.before);
    return true;
  }
  function card() {
    var el = document.querySelector('[data-briefing-card]');
    if (!el && !isReal()) return null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'briefing-inline'; el.setAttribute('data-briefing-card', '');
    }
    if (!place(el)) return el.parentNode ? el : null;
    return el;
  }
  function installStyle() {
    if (document.querySelector('[data-briefing-style]')) return;
    var s = document.createElement('style'); s.setAttribute('data-briefing-style', '');
    s.textContent = [
      /* Section « point du matin » dans la carte Kiwi Insights : filet, kicker mono, liste de signaux. */
      '.briefing-inline{display:flex;flex-direction:column;gap:10px;margin:4px 0 2px;padding-top:16px;border-top:1px solid var(--n-200)}',
      '.briefing-kicker{display:flex;align-items:center;gap:10px;font:600 10.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--atlas)}',
      '.briefing-kicker small{font:500 10.5px/1 var(--mono);letter-spacing:.06em;text-transform:none;color:var(--n-500)}',
      /* Une ligne = un signal : marqueur, titre, preuve, actions. Grille 1fr/auto sur large, empilée sur étroit. */
      '.briefing-line{display:grid;grid-template-columns:1fr auto;gap:6px 18px;align-items:center;padding:12px 14px 12px 16px;border:1px solid var(--n-200);border-radius:14px;background:color-mix(in srgb,var(--atlas) 5%,transparent);position:relative;animation:briefing-in .32s cubic-bezier(.2,.7,.2,1) both}',
      '.briefing-line:nth-child(3){animation-delay:.05s}.briefing-line:nth-child(4){animation-delay:.1s}.briefing-line:nth-child(5){animation-delay:.15s}',
      '.briefing-line::before{content:"";position:absolute;inset-inline-start:-1px;top:14px;bottom:14px;width:3px;border-radius:3px;background:var(--atlas)}',
      '.briefing-line .hai-rec-title{font-size:14px;font-weight:600;line-height:1.35;letter-spacing:-.005em}',
      '.briefing-evidence{grid-column:1;font:500 10.5px/1.4 var(--mono);letter-spacing:.02em;color:var(--n-500)}',
      '.briefing-actions{grid-column:2;grid-row:1/span 2;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}',
      '.briefing-actions button{border:1px solid var(--n-300);background:transparent;color:var(--n-600);border-radius:999px;padding:7px 12px;font:600 11.5px/1 var(--sans);letter-spacing:-.005em;cursor:pointer;transition:border-color .14s ease,color .14s ease,background .14s ease,transform .09s ease}',
      '.briefing-actions button:hover{border-color:var(--atlas);color:var(--atlas)}.briefing-actions button:active{transform:translateY(1px)}',
      '.briefing-actions button[data-briefing-propose]{background:var(--atlas);border-color:var(--atlas);color:var(--paper)}',
      '.briefing-actions button[data-briefing-propose]:hover{background:var(--riad);border-color:var(--riad);color:var(--paper)}',
      /* État calme : une seule rangée feutrée, sans bordure ni marqueur plein. */
      '.briefing-empty{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;padding:2px 0 0}',
      '.briefing-empty::before{content:"";width:8px;height:8px;border-radius:50%;border:1.5px solid var(--mint);align-self:center;flex:none}',
      '.briefing-empty .hai-rec-title{font-size:14px;font-weight:600}.briefing-empty .hai-rec-obs{margin:0;font-size:13px;color:var(--n-500)}',
      /* Badge d’état en tête de carte, aligné sur l’œil-de-bœuf KIWI INSIGHTS. */
      '.briefing-status{position:absolute;top:0;inset-inline-end:0;display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;border:1px solid var(--n-200);font:600 11px/1 var(--sans);letter-spacing:-.005em;color:var(--n-600);background:transparent;white-space:nowrap}',
      '.briefing-status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 3px color-mix(in srgb,var(--mint) 22%,transparent)}',
      '.briefing-status.is-alert{color:var(--atlas);border-color:color-mix(in srgb,var(--atlas) 40%,transparent);background:color-mix(in srgb,var(--atlas) 7%,transparent)}',
      '.briefing-status.is-alert::before{background:var(--atlas);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 18%,transparent)}',
      '@keyframes briefing-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
      '@media (max-width:720px){.briefing-line{grid-template-columns:1fr}.briefing-actions{grid-column:1;grid-row:auto;justify-content:flex-start;margin-top:4px}.briefing-status{position:static;align-self:flex-start;margin-top:-6px}}',
      '@media (prefers-reduced-motion:reduce){.briefing-line{animation:none}}'
    ].join('');
    document.head.appendChild(s);
  }
  function statusBadge(el, t, n) {
    var host = el.closest && el.closest('.hero-right'); if (!host) return;
    var b = host.querySelector('[data-briefing-status]');
    if (!b) { b = document.createElement('span'); b.className = 'briefing-status'; b.setAttribute('data-briefing-status', ''); host.appendChild(b); }
    var label = n ? (n === 1 ? t.signalOne : t.signalMany.replace('{n}', String(n))) : t.calm;
    if (b.textContent !== label) b.textContent = label;
    b.classList.toggle('is-alert', n > 0);
  }
  function dayLabel() {
    try {
      var d = businessDay(), L = lang(), loc = L === 'ar' ? 'ar-MA' : (L === 'en' ? 'en-GB' : 'fr-FR');
      return new Date(d + 'T12:00:00').toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (_) { return ''; }
  }
  function render() {
    var el = card(); if (!el) return;
    var t = tr(), lines = activeLines(tier());
    var body = lines.length ? lines.map(function (line) {
      return '<article class="briefing-line"><div class="hai-rec-title">' + esc(lineText(line)) + '</div><div class="briefing-evidence">' +
        esc(line.evidence.count + ' · ' + line.evidence.window + ' · ' + line.evidence.source) + '</div><div class="briefing-actions">' + (line.action ? '<button data-briefing-propose="' + esc(line.id) + '">' + esc(t.propose) + '</button>' : '') + '<button data-briefing-handled="' + esc(line.id) + '">' + esc(t.handled) + '</button><button data-briefing-dismiss="' + esc(line.id) + '">' + esc(t.dismiss) + '</button></div></article>';
    }).join('') : '<div class="briefing-empty"><div class="hai-rec-title">' + esc(t.empty) + '</div><div class="hai-rec-obs">' + esc(t.emptyNote) + '</div></div>';
    var day = dayLabel();
    el.innerHTML = '<div class="briefing-kicker">' + esc(t.title) + (day ? '<small>' + esc(day) + '</small>' : '') + '</div>' + body;
    statusBadge(el, t, lines.length);
  }
  function mode(raw) {
    var q = String(raw || '').toLowerCase();
    try { q = q.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    if (/surveill|monitor|watch|coverage|couverture|katra9eb|كتراقب|تراقب/.test(q)) return 'coverage';
    if (/point du matin|morning brief|morning point|brief du matin|ملخص الصباح|نقطة الصباح|point dyal sbah|nokta dyal sbah|chno khasni n3ref lyoum|شنو خاصني نعرف اليوم/.test(q)) return 'briefing';
    return '';
  }
  function canHandle(raw) { return !!mode(raw); }
  function reply(raw, opts) {
    var t = tr(opts && opts.lang), wanted = mode(raw);
    if (!isReal()) return { text: t.demo };
    if (wanted === 'coverage') return { text: t.coverage, stats: [{ l: t.coveredLabel, v: t.covered, h: '' }, { l: t.waitingLabel, v: t.waiting, h: '' }] };
    var lines = activeLines((opts && opts.role) || tier());
    if (!lines.length) return { text: '<b>' + t.empty + '</b> ' + t.emptyNote };
    return { text: '<b>' + t.title + '</b>', stats: lines.map(function (line) { return { l: line.kind || t.title, v: lineText(line, opts && opts.lang), h: line.evidence.count + ' · ' + line.evidence.window + ' · ' + line.evidence.source }; }) };
  }
  function attachCloud() {
    if (cloud || !isReal() || !slug() || !window.KiwiCloudDoc || !window.KiwiCloudDoc.attach) return;
    cloud = window.KiwiCloudDoc.attach({
      feature: FEATURE, slug: slug, localKey: localKey,
      read: function () { return doc; }, write: writeLocal, merge: mergeDocs,
      isEmpty: function (x) { return !x || !Array.isArray(x.days) || !x.days.length; },
      onPulled: function () { compute(); }
    });
  }
  function boot() {
    installStyle();
    if (!isReal()) return;
    doc = readLocal(); attachCloud();
    Promise.resolve(cloud && cloud.bind ? cloud.bind() : false).catch(function () {}).then(function () { compute(); });
    try { if (window.KiwiVenue && window.KiwiVenue.subscribe) window.KiwiVenue.subscribe(function () { doc = readLocal(); attachCloud(); compute(); }); } catch (_) {}
    window.addEventListener('kiwi:langchange', function () { render(); });
    window.addEventListener('kiwi:cancellation-history', function () { compute(); });
    window.addEventListener('kiwi:cash-sessions', function () { compute(); });
    window.addEventListener('kiwi:order-course', function () { compute(); });
    document.addEventListener('kiwi:live-backfill-complete', function (event) {
      if (!event.detail || event.detail.merchant === slug()) compute();
    });
  }
  document.addEventListener('click', function (event) {
    var handled = event.target.closest && event.target.closest('[data-briefing-handled]');
    var dismissed = event.target.closest && event.target.closest('[data-briefing-dismiss]');
    var proposed = event.target.closest && event.target.closest('[data-briefing-propose]');
    if (proposed) proposeLine(proposed.getAttribute('data-briefing-propose'));
    if (handled) setState(handled.getAttribute('data-briefing-handled'), 'handled');
    if (dismissed) setState(dismissed.getAttribute('data-briefing-dismiss'), 'dismissed');
  });

  window.KiwiBriefing = {
    canHandle: canHandle, reply: reply, compute: function () { return compute(); }, lines: activeLines,
    dismiss: function (id) { return setState(id, 'dismissed'); }, handled: function (id) { return setState(id, 'handled'); },
    _test: { businessDay: businessDay, scopeKey: scopeKey, normalizeLine: normalizeLine, visibleLines: visibleLines, salesDropRule: salesDropRule, lowStockRule: lowStockRule, marginErosionRule: marginErosionRule, planningGapRule: planningGapRule, cancellationRateRule: cancellationRateRule, discountShareRule: discountShareRule, cashGapRule: cashGapRule, lateOrdersRule: lateOrdersRule, stockItems: stockItems, proposeLine: proposeLine, openPlanning: openPlanning, salesRows: salesRows, dayBoundsAt: dayBoundsAt, compute: compute, anchor: anchor, place: place, card: card, render: render, read: function () { return clone(doc); }, write: writeLocal }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
