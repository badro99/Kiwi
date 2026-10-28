(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KiwiBriefingRules = factory();
}(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function createRules(deps) {
  function shareThreshold(L) {
    var share = num(limit('share'), L), multiple = num(limit('multiple'), L);
    return { fr: ' Seuil : au moins ' + share + ' % et ' + multiple + '× la référence.', en: ' Threshold: at least ' + share + '% and ' + multiple + '× baseline.', ar: ' العتبة: ' + share + '٪ على الأقل و' + multiple + '× المرجع.' }[L];
  }
  var limit = deps.limit, businessDay = deps.businessDay, dayBoundsAt = deps.dayBoundsAt;
  var now = deps.now, money = deps.money;
  function said(count, win, src) {
    var out = {};
    ['fr', 'en', 'ar'].forEach(function (L) { out[L] = count + ' · ' + (typeof win === 'string' ? win : win[L]) + ' · ' + src[L]; });
    return out;
  }
  function num(value, L) {
    var loc = L === 'en' ? 'en-GB' : 'fr-FR';
    if (!NUM[loc]) NUM[loc] = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
    return NUM[loc].format(value);
  }
  var NUM = {};
  var VOID_REASON = {
    'employee-cancel': { fr: 'annulation à la caisse', en: 'cancelled at the till', ar: 'إلغاء من الصندوق' },
    'dashboard-cancel': { fr: 'annulation depuis le tableau de bord', en: 'cancelled from the dashboard', ar: 'إلغاء من لوحة التحكم' },
    'non-renseigne': { fr: 'sans motif', en: 'no reason given', ar: 'بدون سبب' },
    'client-change': { fr: 'changement du client', en: 'customer changed their mind', ar: 'تغيير من الزبون' },
    duplicate: { fr: 'doublon', en: 'duplicate', ar: 'تكرار' }
  };
  function actorName(id, roster) {
    id = String(id || '');
    var kind = /^(staff|account|operator):/.exec(id), raw = kind ? id.slice(kind[0].length) : id;
    if (kind && kind[1] === 'account') return { fr: 'le compte propriétaire', en: 'the owner account', ar: 'حساب المالك' };
    if (kind && kind[1] === 'operator') return { fr: 'un opérateur Kiwi', en: 'a Kiwi operator', ar: 'مشغّل من Kiwi' };
    var list = roster;
    if (!Array.isArray(list)) list = [];
    var hit = raw && (list || []).filter(function (m) { return m && String(m.id) === raw; })[0];
    var name = hit && String(hit.name || '').trim();
    if (name && name !== '·') return { fr: name, en: name, ar: name };
    var ref = raw ? raw.slice(-6) : '';
    return ref
      ? { fr: 'une personne absente de l’équipe actuelle (réf. ' + ref + ')', en: 'someone no longer in the team (ref. ' + ref + ')', ar: 'شخص لم يعد ضمن الفريق (مرجع ' + ref + ')' }
      : { fr: 'une personne non identifiée', en: 'an unidentified person', ar: 'شخص غير معروف' };
  }
  function reasonWords(key) {
    var k = String(key || 'non-renseigne'), hit = VOID_REASON[k];
    if (hit) return hit;
    var plain = k.replace(/-+/g, ' ');
    return { fr: plain, en: plain, ar: plain };
  }
  function spans(from, to) {
    var a = minute(from), b = minute(to);
    if (a == null || b == null || a === b) return [];
    return b > a ? [[a, b]] : [[a, 1440], [0, b]];
  }
  function minute(value) {
    var match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    var out = (+match[1] * 60) + +match[2];
    return out >= 0 && out < 1440 ? out : null;
  }
  function median(values) {
    var a = values.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }
  function windowStats(rows, from, to) {
    var revenue = 0, count = 0;
    rows.forEach(function (row) {
      var ts = Number(row && row.ts) || 0;
      if (ts < from || ts >= to || row.voided || row.void_ts) return;
      var cents = row.amountCents != null ? Number(row.amountCents) : Math.round((Number(row.amount) || 0) * 100);
      if (!Number.isFinite(cents)) return;
      revenue += cents; if (cents >= 0) count++;
    });
    return { revenue: revenue / 100, count: count };
  }
  function salesDropRule(input) {
    input = input || {};
    var now = input.now;
    var rows = input.rows;
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
    if (sameWeekday.length < limit('samples') || trailing.length < limit('samples')) return null;
    var weekdayMedian = median(sameWeekday.map(function (x) { return x.revenue; }));
    var trailingMedian = median(trailing.map(function (x) { return x.revenue; }));
    var threshold = limit('salesDrop') / 100;
    if (!(weekdayMedian > 0) || !(trailingMedian > 0)) return null;
    if (current.revenue > weekdayMedian * (1 - threshold) || current.revenue > trailingMedian * (1 - threshold)) return null;
    var weekdayDrop = 100 * (1 - current.revenue / weekdayMedian);
    var trailingDrop = 100 * (1 - current.revenue / trailingMedian);
    var drop = Math.max(0, Math.round(Math.min(weekdayDrop, trailingDrop)));
    var day = businessDay(now);
    var end = new Date(currentBounds.from + elapsed);
    var time = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
    var cur = money(current.revenue), wd = money(weekdayMedian), tr7 = money(trailingMedian);
    return {
      id: 'sales-drop:' + day, kind: 'sales-drop', tone: 'warn', roles: ['owner', 'manager', 'staff'],
      copy: {
        fr: 'Ventes en baisse de ' + drop + ' % : ' + cur + ' MAD à ' + time + ', contre ' + wd + ' MAD les mêmes jours et ' + tr7 + ' MAD sur les 7 derniers jours. Seuil : -' + limit('salesDrop') + ' %.',
        en: 'Sales are down ' + drop + '%: ' + cur + ' MAD by ' + time + ', versus ' + wd + ' MAD on matching weekdays and ' + tr7 + ' MAD over the last 7 days. Threshold: -' + limit('salesDrop') + '%.',
        ar: 'انخفضت المبيعات بنسبة ' + drop + '٪: ' + cur + ' درهم حتى ' + time + '، مقابل ' + wd + ' درهم في الأيام المماثلة و' + tr7 + ' درهم خلال آخر 7 أيام. العتبة: -' + limit('salesDrop') + '٪.'
      },
      evidence: { count: current.count, window: day + ' · 05:00-' + time, source: 'KiwiSales.list · backfill complet',
        text: said(current.count, day + ' · 05:00-' + time, { fr: 'ventes de la caisse, historique complet', en: 'till sales, full history', ar: 'مبيعات الصندوق، السجل كاملا' }) }
    };
  }
  function marginErosionRule(input) {
    input = input || {};
    var currentDay = input.currentDay;
    var baselineDay = input.baselineDay;
    var current = input.current;
    var baseline = input.baseline;
    var currentCoverage = +(current && current.pctCosted);
    var baselineCoverage = +(baseline && baseline.pctCosted);
    var currentMargin = +(current && current.marginPct);
    var baselineMargin = +(baseline && baseline.marginPct);
    if (!(current && baseline) || !(current.revenueCosted > 0) || !(baseline.revenueCosted > 0)
      || !isFinite(currentCoverage) || !isFinite(baselineCoverage)
      || currentCoverage < limit('coverage') || baselineCoverage < limit('coverage')
      || Math.abs(currentCoverage - baselineCoverage) > limit('coverageGap')
      || !isFinite(currentMargin) || !isFinite(baselineMargin)) return null;
    var erosion = baselineMargin - currentMargin;
    if (erosion < limit('marginDrop')) return null;
    var pct = function (n) { return Math.round(n * 10) / 10; };
    return {
      id: 'margin-erosion:' + String(currentDay || 'period'),
      kind: 'margin-erosion', roles: ['owner'],
      copy: {
        fr: 'La marge brute baisse de ' + pct(erosion) + ' points (alerte dès ' + limit('marginDrop') + ' points). Couverture des coûts : ' + pct(currentCoverage) + ' % contre ' + pct(baselineCoverage) + ' %.',
        en: 'Gross margin fell by ' + pct(erosion) + ' points (alert from ' + limit('marginDrop') + ' points). Cost coverage: ' + pct(currentCoverage) + '% vs ' + pct(baselineCoverage) + '%.',
        ar: 'انخفض الهامش الإجمالي بمقدار ' + pct(erosion) + ' نقاط (التنبيه من ' + limit('marginDrop') + ' نقاط). تغطية التكلفة: ' + pct(currentCoverage) + '% مقابل ' + pct(baselineCoverage) + '٪.'
      },
      evidence: {
        count: 2,
        window: String(currentDay || 'période') + ' vs ' + String(baselineDay || 'référence'),
        source: 'KiwiCost.coverage · ' + pct(currentCoverage) + '% / ' + pct(baselineCoverage) + '% chiffré',
        text: said(2, {
          fr: String(currentDay || 'période') + ' comparé à ' + String(baselineDay || 'la référence'),
          en: String(currentDay || 'period') + ' versus ' + String(baselineDay || 'baseline'),
          ar: String(currentDay || 'الفترة') + ' مقارنة ب' + String(baselineDay || 'المرجع')
        }, {
          fr: 'ventes avec un coût renseigné : ' + num(pct(currentCoverage), 'fr') + ' % contre ' + num(pct(baselineCoverage), 'fr') + ' %',
          en: 'sales with a known cost: ' + num(pct(currentCoverage), 'en') + '% versus ' + num(pct(baselineCoverage), 'en') + '%',
          ar: 'مبيعات بتكلفة مسجلة: ' + num(pct(currentCoverage), 'ar') + '٪ مقابل ' + num(pct(baselineCoverage), 'ar') + '٪'
        })
      }
    };
  }
  function lowStockRule(input) {
    input = input || {};
    var items = input.items;
    var tracked = items.filter(function (item) {
      return item && item.tracked === true && Number.isFinite(+item.balance) && Number.isFinite(+item.threshold) && +item.threshold > 0;
    });
    var low = tracked.filter(function (item) { return +item.balance < +item.threshold * (typeof limit === 'function' ? limit('stockFactor') : 1); }).sort(function (a, b) {
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
      var factor = typeof limit === 'function' ? limit('stockFactor') : 1;
      var target = Number(first.par) > Number(first.balance) ? Number(first.par) : Number(first.threshold);
      if (factor !== 1) target = Math.max(target, Number(first.threshold) * factor);
      var qty = Number((target - Number(first.balance)).toPrecision(15));
      action = { name: 'create-po', args: { supplierName: String(first.supplier), lines: [{ itemId: String(first.id), name: String(first.name || first.id), qty: qty, unit: String(first.unit || '') }], note: 'Proposition du point du matin · stock sous seuil' } };
    }
    return {
      id: 'low-stock:' + businessDay(now()), kind: 'low-stock', tone: 'warn', roles: ['owner', 'manager'], action: action,
      copy: {
        fr: low.length + ' article' + (low.length > 1 ? 's sont' : ' est') + ' sous le seuil : ' + names + extra + '. Couverture : ' + coverageFr + '.',
        en: low.length + ' item' + (low.length > 1 ? 's are' : ' is') + ' below reorder level: ' + names + extra + '. Coverage: ' + coverageEn + '.',
        ar: low.length + ' من الأصناف تحت عتبة إعادة الطلب: ' + names + extra + '. التغطية: ' + coverageAr + '.'
      },
      evidence: { count: tracked.length, window: 'stock actuel · ' + businessDay(now()), source: 'KiwiInventory.balance',
        text: typeof said !== 'function' ? undefined : said(tracked.length, { fr: 'stock actuel · ' + businessDay(now()), en: 'current stock · ' + businessDay(now()), ar: 'المخزون الحالي · ' + businessDay(now()) }, { fr: 'articles suivis en stock', en: 'tracked stock items', ar: 'أصناف المخزون المتابعة' }) }
    };
  }
  function planningGapRule(input) {
    input = input || {};
    var day = input.day;
    var plan = input.plan;
    var periods = input.periods;
    if (!plan || plan.configured !== true || plan.published !== true || !Array.isArray(periods) || !periods.length) return null;
    var openings = [];
    periods.forEach(function (p) { openings = openings.concat(spans(p && p.from, p && p.to)); });
    if (!openings.length) return null;
    var shifts = [];
    (Array.isArray(plan.members) ? plan.members : []).forEach(function (m) {
      if (!m || m.off) return;
      spans(m.start, m.end).forEach(function (range) { shifts.push({ from: range[0], to: range[1], firstName: String(m.firstName || '').slice(0, 40) }); });
    });
    shifts.sort(function (a, b) { return a.from - b.from; });
    var gap = openings.some(function (opening) {
      var coveredTo = opening[0];
      for (var i = 0; i < shifts.length && coveredTo < opening[1]; i++) {
        if (shifts[i].to <= coveredTo) continue;
        if (Math.min(shifts[i].from, opening[1]) - coveredTo >= limit('planningMinutes')) return true;
        coveredTo = Math.max(coveredTo, shifts[i].to);
      }
      return opening[1] - coveredTo >= limit('planningMinutes');
    });
    if (!gap) return null;
    return {
      id: 'planning-gap:' + String(day || 'day'), kind: 'planning-gap', tone: 'warn', roles: ['owner', 'manager'],
      copy: {
        fr: 'Le planning publié laisse une partie des horaires d’ouverture sans couverture.',
        en: 'The published schedule leaves part of an opening period uncovered.',
        ar: 'يترك الجدول المنشور جزءًا من فترة الافتتاح دون تغطية.'
      },
      evidence: { count: openings.length, window: String(day || '') + ' · ' + periods.map(function (p) { return p.from + '-' + p.to; }).join(', '), source: 'planning publié + KiwiHours.periodsOn',
        text: said(openings.length, String(day || '') + ' · ' + periods.map(function (p) { return p.from + '-' + p.to; }).join(', '), { fr: 'planning publié et horaires d’ouverture', en: 'published schedule and opening hours', ar: 'الجدول المنشور وساعات الافتتاح' }) },
      action: { name: 'open-planning', args: {}, summary: 'Ouvrir le planning' }
    };
  }
  function cancellationRateRule(input) {
    input = input || {};
    var current = input.current;
    var baselineRates = input.baselineRates;
    var day = input.day;
    if (!current || baselineRates.length < limit('samples') || !(current.total > 0) || current.cancellations < limit('events')) return null;
    var currentRate = (current.cancellations / current.total) * 100;
    var baseline = median(baselineRates);
    if (!Number.isFinite(baseline) || currentRate < Math.max(limit('share'), baseline * limit('multiple'))) return null;
    var reasonRows = Object.keys(current.reasons || {}).map(function (key) { return { key: key, count: +current.reasons[key] || 0 }; }).sort(function (a, b) { return b.count - a.count; });
    var top = reasonRows[0] || { key: 'non-renseigne', count: current.cancellations };
    var rate = Math.round(currentRate * 10) / 10, base = Math.round(baseline * 10) / 10;
    /* Une seule personne derrière au moins la moitié des annulations (et au
     * moins deux) : on la nomme. Sinon, rien : l'écart est collectif. */
    var who = Object.keys(current.actors || {}).map(function (id) { return { id: id, count: +current.actors[id] || 0 }; }).sort(function (a, b) { return b.count - a.count; })[0];
    var motive = reasonWords(top.key);
    var named = who && who.count >= 2 && who.count * 2 >= current.cancellations ? actorName(who.id, input.roster) : null;
    var by = named ? { fr: ' Dont ' + who.count + ' par ' + named.fr + '.', en: ' ' + who.count + ' of them by ' + named.en + '.', ar: ' منها ' + who.count + ' بواسطة ' + named.ar + '.' } : { fr: '', en: '', ar: '' };
    return {
      id: 'cancellation-rate:' + String(day || 'day'), kind: 'cancellation-rate', tone: 'warn', roles: ['owner', 'manager'],
      copy: {
        fr: 'Annulations à ' + rate + ' % contre ' + base + ' % habituellement. Motif principal : ' + motive.fr + ' (' + top.count + ').' + by.fr + shareThreshold('fr'),
        en: 'Cancellations are ' + rate + '% versus a usual ' + base + '%. Main reason: ' + motive.en + ' (' + top.count + ').' + by.en + shareThreshold('en'),
        ar: 'بلغت الإلغاءات ' + rate + '٪ مقابل ' + base + '٪ عادةً. السبب الرئيسي: ' + motive.ar + ' (' + top.count + ').' + by.ar + shareThreshold('ar')
      },
      evidence: { count: current.cancellations, window: String(day || '') + ' · 4 mêmes jours de semaine', source: 'sale_void_history + KiwiSales.list',
        text: said(current.cancellations, { fr: String(day || '') + ' · comparé au même jour des 4 semaines précédentes', en: String(day || '') + ' · compared with the same weekday over the previous 4 weeks', ar: String(day || '') + ' · مقارنة بنفس اليوم خلال الأسابيع الأربعة السابقة' }, { fr: 'annulations et ventes de la caisse', en: 'till cancellations and sales', ar: 'إلغاءات ومبيعات الصندوق' }) }
    };
  }
  function discountShareRule(input) {
    input = input || {};
    var current = input.current;
    var baselineShares = input.baselineShares;
    var day = input.day;
    if (!current || baselineShares.length < limit('samples') || !(current.gross > 0) || current.discountedCount < limit('events') || !(current.discount > 0)) return null;
    var share = (current.discount / current.gross) * 100, baseline = median(baselineShares);
    if (!Number.isFinite(baseline) || share < Math.max(limit('share'), baseline * limit('multiple'))) return null;
    var actorRows = Object.keys(current.actors || {}).map(function (id) { return { id: id, amount: +current.actors[id] || 0 }; }).sort(function (a, b) { return b.amount - a.amount; });
    var actor = actorName(actorRows[0] ? actorRows[0].id : '', input.roster);
    var pct = Math.round(share * 10) / 10, base = Math.round(baseline * 10) / 10;
    return {
      id: 'discount-share:' + String(day || 'day'), kind: 'discount-share', tone: 'warn', roles: ['owner'],
      copy: {
        fr: 'Les remises représentent ' + pct + ' % du brut contre ' + base + ' % habituellement. Surtout accordées par ' + actor.fr + '.' + shareThreshold('fr'),
        en: 'Discounts represent ' + pct + '% of gross versus a usual ' + base + '%. Mostly granted by ' + actor.en + '.' + shareThreshold('en'),
        ar: 'تمثل الخصومات ' + pct + '٪ من الإجمالي مقابل ' + base + '٪ عادةً. منحها أساساً: ' + actor.ar + '.' + shareThreshold('ar')
      },
      evidence: { count: current.discountedCount, window: String(day || '') + ' · 4 mêmes jours de semaine', source: 'sales.discount_amount_cents / gross_amount_cents',
        text: said(current.discountedCount, { fr: String(day || '') + ' · comparé au même jour des 4 semaines précédentes', en: String(day || '') + ' · compared with the same weekday over the previous 4 weeks', ar: String(day || '') + ' · مقارنة بنفس اليوم خلال الأسابيع الأربعة السابقة' }, { fr: 'remises et ventes brutes de la caisse', en: 'till discounts and gross sales', ar: 'تخفيضات الصندوق والمبيعات الإجمالية' }) }
    };
  }
  function cashGapRule(input) {
    input = input || {};
    var rows = input.rows;
    var wantedMerchant = input.wantedMerchant;
    var day = input.day;
    var threshold = input.threshold;
    var dayOf = input.dayOf;
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
        fr: 'Écart de caisse de ' + gapLabel.replace('.', ',') + ' MAD, seuil visible ' + thresholdLabel.replace('.', ',') + ' MAD.',
        en: 'Cash gap of ' + gapLabel + ' MAD, visible threshold ' + thresholdLabel + ' MAD.',
        ar: 'فرق الصندوق ' + gapLabel.replace('.', ',') + ' MAD، والحد الظاهر ' + thresholdLabel.replace('.', ',') + ' MAD.'
      },
      evidence: { count: reconciliations.length, window: day, source: 'cash_session_events · seuil ' + thresholdLabel + ' MAD',
        text: said(reconciliations.length, day, { fr: 'clôtures et passations de caisse', en: 'till closings and handovers', ar: 'إغلاقات الصندوق وعمليات التسليم' }) }
    };
  }
  function weatherRule(input) {
    input = input || {};
    var effect = input.effect;
    var target = input.target;
    var today = input.today;
    var data = input.data;
    if (!effect || Math.abs(effect.change) < limit('weatherEffect') / 100) return null;
    var pct = Math.round(Math.abs(effect.change) * 100), down = effect.change < 0;
    var tomorrow = target.day > today, mm = String(target.precip).replace('.', ',');
    var mmEn = String(target.precip);
    return {
      id: 'weather-rain:' + target.day, kind: 'weather', tone: down ? 'warn' : 'info', roles: ['owner', 'manager'],
      copy: {
        fr: 'Pluie annoncée ' + (tomorrow ? 'demain' : 'aujourd’hui') + ' à ' + data.city + ' (' + mm + ' mm). Les jours de pluie, votre chiffre a été ' + pct + ' % ' + (down ? 'plus bas' : 'plus haut') + ' que les jours secs.',
        en: 'Rain forecast ' + (tomorrow ? 'tomorrow' : 'today') + ' in ' + data.city + ' (' + mmEn + ' mm). On rainy days your takings have been ' + pct + '% ' + (down ? 'lower' : 'higher') + ' than on dry days.',
        ar: 'يُتوقع المطر ' + (tomorrow ? 'غدا' : 'اليوم') + ' في ' + data.city + ' (' + mm + ' مم). في الأيام الممطرة كان رقم معاملاتك ' + (down ? 'أقل' : 'أعلى') + ' بنسبة ' + pct + '٪ من الأيام الجافة.'
      },
      evidence: { count: effect.rainDays + effect.dryDays, window: effect.rainDays + ' j. de pluie · ' + effect.dryDays + ' j. secs', source: 'MET Norway · KiwiSales',
        text: said(effect.rainDays + effect.dryDays, { fr: effect.rainDays + ' j. de pluie · ' + effect.dryDays + ' j. secs', en: effect.rainDays + ' rainy days · ' + effect.dryDays + ' dry days', ar: effect.rainDays + ' أيام ممطرة · ' + effect.dryDays + ' أيام جافة' }, { fr: 'MET Norway et vos ventes', en: 'MET Norway and your sales', ar: 'MET Norway ومبيعاتك' }) }
    };
  }
  function lateOrdersRule(input) {
    input = input || {};
    var rows = input.rows;
    var wantedMerchant = input.wantedMerchant;
    var day = input.day;
    var dayOf = input.dayOf;
    var dayMs = input.dayMs;
    var end = input.end;
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
      if (nowRows.length < limit('samples') || baseRows.length < limit('lateSamples')) return null;
      var nowMedian = median(nowRows), baseMedian = median(baseRows);
      if (!(baseMedian > 0) || nowMedian < baseMedian * limit('lateMultiple') || nowMedian - baseMedian < limit('lateMinutes') * 60000) return null;
      var nowMin = Math.round(nowMedian / 60000), baseMin = Math.round(baseMedian / 60000);
      return {
        id: 'late-orders:' + key + ':' + day, kind: 'late-orders-' + key, tone: 'warn', roles: ['owner', 'manager'],
        copy: {
          fr: labelFr + ' médian ' + nowMin + ' min contre ' + baseMin + ' min, alerte à ' + num(limit('lateMultiple'), 'fr') + '× et +' + limit('lateMinutes') + ' min.',
          en: labelEn + ' median ' + nowMin + ' min versus ' + baseMin + ' min, alert at ' + num(limit('lateMultiple'), 'en') + 'x and +' + limit('lateMinutes') + ' min.',
          ar: labelAr + ' ' + nowMin + ' دقيقة مقابل ' + baseMin + ' دقيقة، التنبيه عند ' + num(limit('lateMultiple'), 'ar') + 'x و+' + limit('lateMinutes') + ' دقائق.'
        },
        evidence: { count: nowRows.length, window: day + ' · baseline 28 jours (' + baseRows.length + ')', source: 'order_course.' + key,
          text: said(nowRows.length, { fr: day + ' · référence sur 28 jours (' + baseRows.length + ')', en: day + ' · 28-day reference (' + baseRows.length + ')', ar: day + ' · مرجع 28 يوما (' + baseRows.length + ')' },
            key === 'kitchen' ? { fr: 'commandes envoyées en cuisine', en: 'orders sent to the kitchen', ar: 'الطلبات المرسلة إلى المطبخ' } : { fr: 'commandes servies après préparation', en: 'orders served after preparation', ar: 'الطلبات المقدمة بعد التحضير' }) }
      };
    }
    return [
      stage('kitchen', 'Préparation', 'Preparation', 'مدة التحضير'),
      stage('service', 'Service après préparation', 'Service after ready', 'مدة التقديم بعد الجاهزية')
    ].filter(Boolean);
  }
  return { salesDropRule: salesDropRule, marginErosionRule: marginErosionRule, lowStockRule: lowStockRule, planningGapRule: planningGapRule, cancellationRateRule: cancellationRateRule, discountShareRule: discountShareRule, cashGapRule: cashGapRule, weatherRule: weatherRule, lateOrdersRule: lateOrdersRule, actorName: actorName };
  }
  return { createRules: createRules };
}));
