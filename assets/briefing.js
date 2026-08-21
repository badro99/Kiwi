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
  var RULES = [salesDropRule, lowStockRule];
  var doc = { days: [] };
  var cloud = null;

  var COPY = {
    fr: {
      eyebrow: 'KIWI AI', title: 'Le point du matin', empty: 'Rien d’urgent à signaler.',
      emptyNote: 'Kiwi surveille uniquement les données mesurées de cet établissement.', ask: 'Voir le point du matin',
      coverage: 'Je surveille quatre familles déjà mesurables, sans inventer les données manquantes.',
      coveredLabel: 'Couverture active', covered: 'Ventes · stock · marge · planning',
      waitingLabel: 'En attente de données durables', waiting: 'Remises · annulations · caisse · délais de service',
      demo: 'Le point du matin s’active sur un établissement réel connecté. La démonstration ne fabrique aucune alerte.',
      handled: 'Traité', dismiss: 'Masquer', propose: 'Proposer'
    },
    en: {
      eyebrow: 'KIWI AI', title: 'Morning briefing', empty: 'Nothing urgent to flag.',
      emptyNote: 'Kiwi monitors only measured data from this venue.', ask: 'Open morning briefing',
      coverage: 'I monitor four areas that are already measurable, without inventing missing data.',
      coveredLabel: 'Active coverage', covered: 'Sales · stock · margin · staffing',
      waitingLabel: 'Waiting for durable data', waiting: 'Discounts · cancellations · cash · service timing',
      demo: 'Morning briefing activates for a connected real venue. The demo never fabricates alerts.',
      handled: 'Handled', dismiss: 'Dismiss', propose: 'Propose'
    },
    ar: {
      eyebrow: 'KIWI AI', title: 'ملخص الصباح', empty: 'لا توجد أمور عاجلة الآن.',
      emptyNote: 'يراقب Kiwi فقط البيانات المقاسة لهذا المحل.', ask: 'عرض ملخص الصباح',
      coverage: 'أراقب أربع فئات قابلة للقياس حاليا، من دون اختراع البيانات الناقصة.',
      coveredLabel: 'التغطية الحالية', covered: 'المبيعات · المخزون · الهامش · جدول العمل',
      waitingLabel: 'في انتظار بيانات دائمة', waiting: 'التخفيضات · الإلغاءات · الصندوق · مدة الخدمة',
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
  function proposeLine(id) {
    var line = activeLines(tier()).find(function (x) { return x.id === id; });
    if (!line || !line.action || !window.KiwiAgentActions || typeof window.KiwiAgentActions.request !== 'function') return { ok: false, reason: 'unavailable' };
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
  function card() {
    var el = document.querySelector('[data-briefing-card]');
    if (el || !isReal()) return el;
    var hero = document.querySelector('.hero-today');
    if (!hero || !hero.parentNode) return null;
    el = document.createElement('section');
    el.className = 'briefing-card block'; el.setAttribute('data-briefing-card', '');
    hero.parentNode.insertBefore(el, hero.nextSibling);
    return el;
  }
  function installStyle() {
    if (document.querySelector('[data-briefing-style]')) return;
    var s = document.createElement('style'); s.setAttribute('data-briefing-style', '');
    s.textContent = '.briefing-card{margin:0 0 16px;padding:20px 22px}.briefing-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.briefing-kicker{font:600 10.5px/1 var(--mono);letter-spacing:.12em;color:var(--atlas)}.briefing-title{font-size:19px;font-weight:650;letter-spacing:-.02em;margin-top:6px}.briefing-empty{margin-top:15px;padding-top:15px;border-top:1px solid var(--n-200);color:var(--n-600);font-size:13px;line-height:1.5}.briefing-empty strong{display:block;color:var(--ink);font-size:14px;margin-bottom:3px}.briefing-line{padding:14px 0;border-top:1px solid var(--n-200)}.briefing-evidence{font:500 10.5px/1.4 var(--mono);color:var(--n-500);margin-top:7px}.briefing-actions{display:flex;gap:8px;margin-top:10px}.briefing-actions button{border:1px solid var(--n-200);background:var(--paper-soft);color:var(--ink);border-radius:999px;padding:6px 10px;font:600 11px/1 var(--sans);cursor:pointer}';
    document.head.appendChild(s);
  }
  function render() {
    var el = card(); if (!el) return;
    var t = tr(), lines = activeLines(tier());
    var body = lines.length ? lines.map(function (line) {
      return '<article class="briefing-line"><strong>' + esc(lineText(line)) + '</strong><div class="briefing-evidence">' +
        esc(line.evidence.count + ' · ' + line.evidence.window + ' · ' + line.evidence.source) + '</div><div class="briefing-actions">' + (line.action ? '<button data-briefing-propose="' + esc(line.id) + '">' + esc(t.propose) + '</button>' : '') + '<button data-briefing-handled="' + esc(line.id) + '">' + esc(t.handled) + '</button><button data-briefing-dismiss="' + esc(line.id) + '">' + esc(t.dismiss) + '</button></div></article>';
    }).join('') : '<div class="briefing-empty"><strong>' + esc(t.empty) + '</strong>' + esc(t.emptyNote) + '</div>';
    el.innerHTML = '<div class="briefing-head"><div><div class="briefing-kicker">' + esc(t.eyebrow) + '</div><div class="briefing-title">' + esc(t.title) + '</div></div></div>' + body;
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
  function injectAssistantEntry() {
    if (!isReal() || document.querySelector('[data-briefing-entry]')) return;
    var chips = document.querySelector('.hai-chips'); if (!chips) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'hai-chip'; b.setAttribute('data-briefing-entry', ''); b.textContent = tr().ask;
    b.addEventListener('click', function () { var i = document.querySelector('[data-hai-input]'); if (i) { i.value = tr().title; i.focus(); } });
    chips.insertBefore(b, chips.firstChild);
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
    Promise.resolve(cloud && cloud.bind ? cloud.bind() : false).catch(function () {}).then(function () { compute(); injectAssistantEntry(); });
    try { if (window.KiwiVenue && window.KiwiVenue.subscribe) window.KiwiVenue.subscribe(function () { doc = readLocal(); attachCloud(); compute(); }); } catch (_) {}
    window.addEventListener('kiwi:langchange', function () { render(); injectAssistantEntry(); });
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
    _test: { businessDay: businessDay, scopeKey: scopeKey, normalizeLine: normalizeLine, visibleLines: visibleLines, salesDropRule: salesDropRule, lowStockRule: lowStockRule, stockItems: stockItems, proposeLine: proposeLine, salesRows: salesRows, dayBoundsAt: dayBoundsAt, compute: compute, read: function () { return clone(doc); }, write: writeLocal }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
