/* Owner: dashboard ledger. Exports: aggFusion, zeroClone, vData, priorLedgerRows, demoLedgerProjection, demoPreviousAt, demoRole, merchantTimeZone, merchantParts, merchantBoundary, merchantDayKey, calendarStartKey, calendarBounds, rangeBounds, realInsightSummary, buildRealHeroRec, buildRealHeatmapRec, screenBook, realClosedTips, realClientMix, openDays, realDeltaPct, deltaTenths, operatorLedgerPending, buildHeatmap.
 * Sibling calls via live owner: none.
 * Reads live owner: DEFAULT_MERCHANT_TZ, DEMO_ROLE, FUSION_AVG_KEYS, HH_COVERS_BY_VENUE, HH_HOURS, HH_RAW_BY_VENUE, RANGE_DAYS, REAL_MIX, TENDER_NAME, activeMerchantSlug, addMerchantDays, closedBounds, currentRange, customRange, dateToIso, dayCutoffH, deliveryDue, effRange, frInt, getCurrentVenue, getLang, goalByVenue, halfUpDiv, heroDataByVenue, isPlainObj, kpiByVenue, ledgerSum, merchantDayBounds, mixByVenue, ownData, realRefundList, realSalesList, realWindowStats, revChartByVenue, saleHour, salesMath, shiftedBusinessBounds, tenderAmounts, tenderBucket.
 * Reads globalThis: KiwiZoneLaw.
 * Reads window: KiwiClients, KiwiConfig, KiwiDayReport, KiwiDemoClock, KiwiLive, KiwiSalesHistory, KiwiSalesMath, KiwiSalesReconcile, KiwiVenue. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['ledger'] = function (__state) {
function aggFusion(values, parentKey, rateCtx) {
    const defined = values.filter(v => v !== undefined && v !== null);
    if (defined.length === 0) return values[0] ?? null;
    const first = defined[0];
    // Rate context: once an ancestor key is "rate-like" (success/ratio/taux/
    // delta…) every numeric descendant averages instead of sums. This keeps
    // a fused success of 95% × 92% × 88% reading as ~91%, not 275%.
    const myRateCtx = rateCtx || __state.FUSION_AVG_KEYS.test(String(parentKey || ''));
    if (typeof first === 'number') {
      const sum = defined.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
      return myRateCtx ? sum / defined.length : sum;
    }
    if (typeof first === 'string' || typeof first === 'boolean') {
      // Take cafeAtlas (index 0 in source order) — labels/copy don't aggregate.
      return values[0] ?? first;
    }
    if (Array.isArray(first)) {
      const maxLen = Math.max(...defined.map(a => Array.isArray(a) ? a.length : 0));
      const out = [];
      for (let i = 0; i < maxLen; i++) {
        const slice = defined.map(a => Array.isArray(a) ? a[i] : undefined);
        out.push(aggFusion(slice, parentKey, myRateCtx));
      }
      return out;
    }
    if (__state.isPlainObj(first)) {
      const keys = new Set();
      defined.forEach(o => __state.isPlainObj(o) && Object.keys(o).forEach(k => keys.add(k)));
      const out = {};
      keys.forEach(k => {
        const slice = defined.map(o => __state.isPlainObj(o) ? o[k] : undefined);
        out[k] = aggFusion(slice, k, myRateCtx);
      });
      return out;
    }
    return first;
  }

function zeroClone(x) {
    if (typeof x === 'number') return 0;
    if (Array.isArray(x)) return x.map(zeroClone);
    if (x && typeof x === 'object') {
      const o = {};
      for (const k in x) o[k] = zeroClone(x[k]);
      return o;
    }
    return x; // strings (labels), booleans, null — preserved
  }

function vData(table, range) {
    const v = __state.getCurrentVenue();
    const knownRanges = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'personnalise'];
    const requested = range === 'personnalise' ? __state.effRange() : range;
    const hasRequested = !!(table?.[v]?.[requested] ?? table?.cafeAtlas?.[requested]);
    const eff = knownRanges.includes(range) || hasRequested ? requested : 'trenteJours';
    // A user-created venue has no demo data — hand back a zeroed clone of its
    // base type's demo sibling so the dashboard renders empty rather than
    // borrowing live numbers via the fallback below. The shape must match the
    // vertical (a boutique-based venue needs tauxRetour, a spa needs tips…),
    // otherwise vertical-specific KPI tiles silently drop.
    if (__state.ownData(v)) {
      const baseIds = { restaurant: 'cafeAtlas', boutique: 'maisonMansour', spa: 'spaBahia' };
      const baseId = baseIds[window.KiwiVenue?.getVenueType?.() || 'restaurant'] || 'cafeAtlas';
      const shape = table?.[baseId]?.[eff] ?? table?.[baseId]?.trenteJours
                 ?? table?.cafeAtlas?.[eff] ?? table?.cafeAtlas?.trenteJours;
      return shape == null ? shape : zeroClone(shape);
    }
    if (v === 'fusion') {
      const slices = [
        table?.cafeAtlas?.[eff],
        table?.maisonMansour?.[eff],
        table?.spaBahia?.[eff],
      ];
      const merged = aggFusion(slices, '');
      // If every slice was null/undefined fallback gracefully.
      return merged ?? table?.cafeAtlas?.[eff] ?? table?.cafeAtlas?.trenteJours;
    }
    const shape = table?.[v]?.[eff] ?? table?.cafeAtlas?.[eff] ?? table?.[v]?.trenteJours ?? table?.cafeAtlas?.trenteJours;
    return demoLedgerProjection(table, eff, shape);

  }

function priorLedgerRows(range, selected, days, day) {
    const clock = window.KiwiDemoClock, dr = window.KiwiDayReport;
    if (days === 1) {
      const before = dr.shiftDay(selected,-1), b = dr.dayBounds(selected), o = dr.dayBounds(before);
      const cut = range === 'aujourdhui' ? o.from + (Date.now() - b.from) : o.to;
      return clock.getDaySales(before).filter(r=>r.ts<=cut);
    }
    let prior = [];
    for (let i = days; i < days * 2; i++) prior = prior.concat(clock.getDaySales(dr.shiftDay(day,-i)));
    return prior;
  }

function demoLedgerProjection(table, range, shape) {
    const clock = window.KiwiDemoClock, dr = window.KiwiDayReport;
    if (!shape || !dr || !['aujourdhui','hier','septJours','trenteJours'].includes(range)
      || ![__state.heroDataByVenue,__state.goalByVenue,__state.kpiByVenue,__state.revChartByVenue,__state.mixByVenue].includes(table) || !clock?.getSimState?.()) return shape;
    const day = dr.today(), days = range === 'septJours' ? 7 : range === 'trenteJours' ? 30 : 1;
    const selected = range === 'hier' ? dr.shiftDay(day,-1) : day;
    const rows = days === 1 ? clock.getDaySales(selected) : clock.getSales(days);
    const sum = __state.ledgerSum;
    const total = sum(rows), count = rows.length;
    if (table === __state.heroDataByVenue) return {...shape,amount:total,netAfterKiwi:total,deltaHier:null,deltaSemaine:null,deltaMois:null};
    if (table === __state.goalByVenue) return {...shape,current:total};
    // One ledger, one tender definition across the donut and card/cash KPI.
    const tenders = entries => {
      const by = {};
      entries.forEach(entry => __state.tenderAmounts(entry).forEach(part => {
        if (part.key) by[part.key] = (by[part.key] || 0) + Math.round(part.amount * 100);
      }));
      return by;
    };
    const by = tenders(rows);
    if (table === __state.mixByVenue) {
      const collectedCents = Object.values(by).reduce((s, value) => s + value, 0);
      const lang = __state.getLang();
      return {...shape, _demoLedger:true, centerMad:collectedCents / 100,
        mixRows:__state.REAL_MIX.filter(m => by[m.key] > 0).map(m => ({
          color:m.color, label:m[lang] || m.fr, pct:by[m.key] / collectedCents * 100}))};
    }
    if (table === __state.kpiByVenue) {
      // Same-length previous window (priorLedgerRows). Deltas come from the
      // ledger, never a constant.
      const prior = priorLedgerRows(range, selected, days, day);
      const pct = (now, then) => then ? Math.round((now - then) / then * 1000) / 10 : 0;
      const priorTotal = sum(prior), priorCount = prior.length;
      const cardShare = tender => {
        const card = (tender.card || 0) + (tender.tap || 0), cash = tender.cash || 0;
        return card + cash ? card / (card + cash) * 100 : null;
      };
      const share = cardShare(by), oldShare = cardShare(tenders(prior));
      const roundedShare = Math.round(share || 0);
      return {...shape,
        ratio:shape.ratio && {...shape.ratio,
          text:share == null ? '·' : `${roundedShare} / ${100 - roundedShare}`,
          unit:share == null ? '' : '%', delta:share == null || oldShare == null ? null : pct(share, oldShare)},
        tx:shape.tx && {...shape.tx,value:count,delta:pct(count,priorCount)},
        panier:shape.panier && {...shape.panier,value:count ? total/count : 0,
          delta:pct(count ? total/count : 0, priorCount ? priorTotal/priorCount : 0)}};
    }
    let rev, revPrev, xLabels, visibleXIdx, cursor = {};
    if (days > 1) {
      const keys = Array.from({length:days},(_,i)=>dr.shiftDay(day,i-days+1));
      rev = keys.map(key=>sum(clock.getDaySales(key)));
      revPrev = keys.map(key=>sum(clock.getDaySales(dr.shiftDay(key,-days))));
      xLabels = keys.map(key=>new Date(key+'T12:00:00').toLocaleDateString(__state.getLang()==='ar'?'ar-MA':__state.getLang()==='en'?'en-GB':'fr-FR',{weekday:'short',day:'numeric'}));
      visibleXIdx = keys.map((_,i)=>i).filter(i=>days===7 || i%5===0 || i===days-1);
    } else {
      const bounds=dr.dayBounds(selected), before=dr.shiftDay(selected,-1), prior=clock.getDaySales(before), old=dr.dayBounds(before);
      const progress = range==='aujourdhui' ? Math.min(24,(Date.now()-bounds.from)/(bounds.to-bounds.from)*24) : 24;
      const index=Math.min(23,Math.floor(progress));
      rev = Array.from({length:25},(_,i)=>i>Math.ceil(progress)?null:sum(rows.filter(r=>r.ts<=bounds.from+Math.min(i,progress)/24*(bounds.to-bounds.from))));
      revPrev = Array.from({length:25},(_,i)=>sum(prior.filter(r=>r.ts<=old.from+i/24*(old.to-old.from))));
      xLabels=Array.from({length:25},(_,i)=>String((5+i)%24).padStart(2,'0')+'h');
      visibleXIdx=xLabels.map((_,i)=>i);
      if(range==='aujourdhui') cursor={_simIdx:index,_simWithin:progress-index};
    }
    const maximum=Math.max(1,...rev.filter(v=>v!=null),...revPrev);
    const ceiling=Math.ceil(maximum/4000)*4000;
    return {...shape,...cursor,_demoLedger:true,rev,revPrev,xLabels,visibleXIdx,total,
      yTicks:[0,.25,.5,.75,1].map(n=>Math.round(n*ceiling)),
      legendPrimary:shape.legendPrimary.split(' · ')[0]+' · '+__state.frInt(total)+' MAD',
      legendCompare:shape.legendCompare.split(' · ')[0]+' · '+__state.frInt(days>1?sum(revPrev.map(amount=>({amount}))):revPrev.at(-1))+' MAD'};
  }

function demoPreviousAt(sim) {
    const dr=window.KiwiDayReport, clock=window.KiwiDemoClock;
    if (sim && dr && clock?.getDaySales) {
      const day=dr.shiftDay(dr.today(),-1), bounds=dr.dayBounds(day);
      const before=bounds.from+sim.fraction*(bounds.to-bounds.from);
      return clock.getDaySales(day).filter(r=>r.ts<=before).reduce((s,r)=>s+Math.round(r.amount*100),0)/100;
    }
    const series = vData(__state.revChartByVenue, __state.currentRange)?.revPrev;
    if (!sim || !series?.length) return null;
    const index = Math.min(series.length - 1, Math.max(0, sim.simIdx));
    const next = Math.min(series.length - 1, index + 1);
    return series[index] + (series[next] - series[index]) * sim.simWithin;
  }

function demoRole(text, lang) {
    if (!text || lang === 'fr' || (lang !== 'en' && lang !== 'ar')) return text;
    return String(text).split(' · ').map((part) => {
      const hit = __state.DEMO_ROLE[part]; if (hit) return hit[lang];
      let m;
      if ((m = /^(\d+) jours?( de service)?$/.exec(part))) return lang === 'en' ? `${m[1]} days` : `${m[1]} أيام`;
      if ((m = /^pause depuis (\d\d:\d\d)$/.exec(part))) return lang === 'en' ? `on break since ${m[1]}` : `في استراحة منذ ${m[1]}`;
      if ((m = /^fini(?: son service)? (\d\d:\d\d)$/.exec(part))) return lang === 'en' ? `shift ended ${m[1]}` : `انتهت ورديته ${m[1]}`;
      return part;
    }).join(' · ');
  }

function merchantTimeZone(slug) {
    try {
      const R = window.KiwiDayReport;
      if (R?.timezone) return R.timezone(slug);
    } catch (_) {}
    try {
      const vd = window.KiwiVenue?.getCurrentVenueData?.();
      const zone = vd?.timezone || vd?.timeZone || vd?.tz || window.KiwiConfig?.timezone || window.KiwiConfig?.timeZone;
      if (zone) { new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: zone }).format(); return zone; }
    } catch (_) {}
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || __state.DEFAULT_MERCHANT_TZ; } catch (_) { return __state.DEFAULT_MERCHANT_TZ; }
  }

function merchantParts(ts, slug) {
    const f = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', {
      timeZone: merchantTimeZone(slug), year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    const out = {};
    f.formatToParts(new Date(ts)).forEach(p => { if (p.type !== 'literal') out[p.type] = p.value; });
    return out;
  }

function merchantBoundary(day, hour, slug) {
    const zone = merchantTimeZone(slug);
    const target = Date.parse(String(day) + 'T00:00:00Z') + hour * 3600000;
    let guess = target;
    for (let i = 0; i < 6; i++) {
      const p = merchantParts(guess, slug);
      const observed = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
      if (observed === target) return guess;
      guess += target - observed;
    }
    return guess;
  }

function merchantDayKey(ts, slug) {
    try {
      const R = window.KiwiDayReport;
      if (R?.businessDay) return R.businessDay(ts, slug);
    } catch (_) {}
    const p = merchantParts(ts, slug);
    const day = `${p.year}-${p.month}-${p.day}`;
    return +p.hour < __state.dayCutoffH(slug) ? __state.addMerchantDays(day, -1) : day;
  }

function calendarStartKey(dayKey, unit, back) {
    let y = +dayKey.slice(0, 4), m = +dayKey.slice(5, 7) - 1;
    if (unit === 'year') { y -= back; m = 0; }
    else {
      m = (unit === 'quarter' ? Math.floor(m / 3) * 3 : m) - (unit === 'quarter' ? 3 : 1) * back;
      while (m < 0) { m += 12; y--; }
      while (m > 11) { m -= 12; y++; }
    }
    return y + '-' + String(m + 1).padStart(2, '0') + '-01';
  }

function calendarBounds(range, back) {
    const unit = range === 'moisDernier' ? 'month' : range === 'trimestre' ? 'quarter' : range === 'annee' ? 'year' : '';
    if (!unit) return null;
    const slug = __state.activeMerchantSlug();
    const todayDay = merchantDayKey(Date.now(), slug);
    const shift = (range === 'moisDernier' ? 1 : 0) + (back || 0);
    const from = __state.merchantDayBounds(calendarStartKey(todayDay, unit, shift), slug).from;
    if (range !== 'moisDernier' && !back) return [from, Infinity];
    return [from, __state.merchantDayBounds(calendarStartKey(todayDay, unit, shift - 1), slug).from];
  }

function rangeBounds(range) {
    /* A merchant-picked range is exact. Demo tables may use a presentation
     * bucket, but live ledgers must never turn "3–5 August" into "last 7
     * days" while keeping the precise dates on screen. */
    if ((range === 'personnalise' || (range == null && __state.currentRange === 'personnalise')) && __state.customRange) {
      const slug = __state.activeMerchantSlug();
      const start = __state.merchantDayBounds(__state.dateToIso(__state.customRange.start), slug).from;
      const end = __state.merchantDayBounds(__state.dateToIso(__state.customRange.end), slug).to;
      return [start, end];
    }
    const slug = __state.activeMerchantSlug();
    const todayDay = merchantDayKey(Date.now(), slug);
    const today = __state.merchantDayBounds(todayDay, slug).from;
    if (range === 'aujourdhui') return [today, Infinity];
    if (range === 'hier') {
      const yesterday = __state.merchantDayBounds(__state.addMerchantDays(todayDay, -1), slug);
      return [yesterday.from, yesterday.to];
    }
    const calendar = calendarBounds(range, 0);
    if (calendar) return calendar;
    const days = __state.RANGE_DAYS[range] || 1;
    return [__state.merchantDayBounds(__state.addMerchantDays(todayDay, -(days - 1)), slug).from, Infinity];
  }

function realInsightSummary(range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const rows = __state.realSalesList().filter((e) => {
      const ts = +e.ts || 0;
      return ts >= from && ts < to;
    });
    let revenue = 0, gross = 0, refunds = 0, collected = 0, receivable = 0;
    const byHour = window.KiwiSalesMath.hoursFromSales(rows, from, to, __state.saleHour), byTender = {};
    rows.forEach((e) => {
      const amount = Math.max(0, +e.amount || 0);
      revenue += amount; gross += amount;
      const tender = __state.tenderBucket(e && e.method);
      if (tender && amount) {
        __state.tenderAmounts(e).forEach(part => {
          if (part.key) byTender[part.key] = (byTender[part.key] || 0) + part.amount;
        });
        collected += amount;
      } else if (__state.salesMath().RECEIVABLE_METHODS.includes(String(e && e.method || '').trim().toLowerCase())) {
        receivable += amount;
      }
    });
    __state.realRefundList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amount = Math.abs(+e.amount || 0);
      revenue -= Math.abs(+e.amount || 0); refunds += amount;
      const hour = __state.saleHour(ts);
      byHour[hour] = (byHour[hour] || 0) - amount;
      const tender = __state.tenderBucket(e && e.method);
      if (tender) { byTender[tender] = (byTender[tender] || 0) - amount; collected -= amount; }
      else if (__state.salesMath().RECEIVABLE_METHODS.includes(String(e && e.method || '').trim().toLowerCase())) receivable -= amount;
    });
    receivable += __state.deliveryDue(from, to);
    const topKey = (obj) => Object.keys(obj).reduce((best, key) =>
      best == null || obj[key] > obj[best] ? key : best, null);
    const peakHour = topKey(byHour);
    const topTender = topKey(byTender);
    return {
      from, to, count: rows.length, revenue, gross, refunds, collected, receivable,
      basket: rows.length ? revenue / rows.length : 0,
      peakHour: peakHour == null ? null : +peakHour,
      peakRevenue: peakHour == null ? 0 : byHour[peakHour],
      activeHours: Object.keys(byHour).length,
      topTender,
      tenderAmount: topTender == null ? 0 : byTender[topTender],
      collected,
    };
  }

function buildRealHeroRec() {
    const s = realInsightSummary();
    if (!s.count || !s.revenue) return null;
    const lang = __state.getLang();
    const today = __state.currentRange === 'aujourdhui';
    const num = (n) => __state.frInt(Math.round(n));
    const tender = s.topTender && s.collected ? Math.round((s.tenderAmount / s.collected) * 100) : null;
    const tenderName = s.topTender ? (__state.TENDER_NAME[lang] || __state.TENDER_NAME.fr)[s.topTender] : '';
    const peakFr = s.peakHour == null ? '' : ` Votre meilleure heure : ${s.peakHour}h.`;
    const payFr = tender == null ? '' : ` ${tender} % des encaissements identifiés sont en ${tenderName}.`;
    const peakEn = s.peakHour == null ? '' : ` Your best hour: ${s.peakHour}:00.`;
    const payEn = tender == null ? '' : ` ${tender}% of identified payments are ${tenderName}.`;
    const peakAr = s.peakHour == null ? '' : ` أفضل ساعة: ${s.peakHour}.`;
    const payAr = tender == null ? '' : ` ${tender}٪ من المدفوعات المحددة عبر ${tenderName}.`;
    const W = {
      fr: { title: today ? 'Votre journée en cours' : 'La période sélectionnée', obs: `${s.count} vente${s.count > 1 ? 's' : ''} ${today ? "aujourd'hui" : 'sur la période'} pour ${num(s.revenue)} MAD, panier moyen ${num(s.basket)} MAD.${peakFr}${payFr}`, act: '→ Calculé à partir des ventes affichées sur cette période.', basisLabel: 'mesuré' },
      en: { title: today ? 'Your day so far' : 'Selected period', obs: `${s.count} sale${s.count > 1 ? 's' : ''} ${today ? 'today' : 'in this period'} for ${num(s.revenue)} MAD, average basket ${num(s.basket)} MAD.${peakEn}${payEn}`, act: '→ Calculated from the sales shown for this period.', basisLabel: 'measured' },
      ar: { title: today ? 'يومك حتى الآن' : 'الفترة المحددة', obs: `${s.count} عملية بيع ${today ? 'اليوم' : 'خلال هذه الفترة'} بقيمة ${num(s.revenue)} درهم، ومتوسط السلة ${num(s.basket)} درهم.${peakAr}${payAr}`, act: '← محسوب من المبيعات المعروضة لهذه الفترة.', basisLabel: 'مقاس' },
    };
    return W[lang] || W.fr;
  }

function buildRealHeatmapRec() {
    const s = realInsightSummary();
    if (!s.count || !s.revenue || s.peakHour == null) return null;
    const lang = __state.getLang();
    const share = Math.round((s.peakRevenue / s.revenue) * 100);
    const num = (n) => __state.frInt(Math.round(n));
    const W = {
      fr: { title: `Votre pic : ${s.peakHour}h`, obs: `${num(s.peakRevenue)} MAD de ventes nettes à ${s.peakHour}h, soit ${share} % de la période, réparties sur ${s.activeHours} heure${s.activeHours > 1 ? 's' : ''} d’activité.`, cta: '' },
      en: { title: `Your peak: ${s.peakHour}:00`, obs: `${num(s.peakRevenue)} MAD in net sales at ${s.peakHour}:00, ${share}% of the period across ${s.activeHours} active hour${s.activeHours > 1 ? 's' : ''}.`, cta: '' },
      ar: { title: `ذروتك: ${s.peakHour}`, obs: `${num(s.peakRevenue)} درهم من صافي المبيعات عند الساعة ${s.peakHour}، أي ${share}٪ من الفترة موزعة على ${s.activeHours} ساعة نشاط.`, cta: '' },
    };
    return W[lang] || W.fr;
  }

function screenBook() {
    try {
      const KV = window.KiwiVenue;
      if (!KV || !KV.isCustom || !KV.isCustom() || !KV.getCurrentVenueData) return '';
      const vd = KV.getCurrentVenueData();
      if (!vd) return '';
      if (vd.slug) return String(vd.slug);
      return String(vd.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    } catch (_) { return ''; }
  }

function realClosedTips(range) {
    const DR = window.KiwiDayReport;
    if (!DR || typeof DR.list !== 'function') return null;
    const book = screenBook();
    if (!book) return null;
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const slug = __state.activeMerchantSlug();
    const coverage = window.KiwiSalesReconcile?.coverage();
    const first = merchantDayKey(from + 1, slug);
    const last = to === Infinity ? merchantDayKey(Date.now(), slug) : merchantDayKey(to - 1, slug);
    /* Tout en centimes entiers : des dirhams flottants (le Z) et des centimes
       (la caisse, le résumé) s'additionnaient en flottants et s'arrondissaient
       une fois à la fin. */
    let cents = 0, days = 0;
    let reports = [];
    try { reports = DR.list(book) || []; } catch (_) { return null; }
    const closed = new Set();
    reports.forEach((r) => {
      if (!r || !r.closed || !r.day || r.day < first || r.day > last) return;
      const t = Number(r.tips);
      days++; closed.add(r.day);
      if (Number.isFinite(t) && t > 0) cents += Math.round(t * 100);
    });
    const live = new Set();
    let sales = [];
    try { sales = typeof __state.realSalesList === 'function' ? __state.realSalesList() : []; } catch (_) { sales = []; }
    (sales || []).forEach((e) => {
      const tipCents = Math.round(Number(e && e.tipCents));
      if (!(tipCents > 0)) return;
      const ts = +e.ts || 0;
      if (ts < from || ts >= to || (coverage != null && ts < coverage)) return;
      const day = merchantDayKey(ts, slug);
      if (closed.has(day)) return;
      live.add(day);
      cents += tipCents;
    });
    const old = window.KiwiSalesHistory?.oldTips(from, to, closed);
    /* L'historique ancien (avant la couverture des ventes locales) vient du
       résumé serveur, qui peut tarder ou échouer. Les pourboires déjà connus
       (Z clos et caisse) restent comptés et la tuile le DIT (partial), au lieu
       de les taire. */
    if (!old?.partial) { cents += Math.round((old?.sum || 0) * 100); days += old?.days || 0; }
    days += live.size;
    const out = { sum: cents / 100, days, liveDays: live.size };
    if (old?.partial) out.partial = true;
    return out;
  }

function realClientMix(from, to) {
    const KC = window.KiwiClients;
    const book = screenBook();
    let list = [];
    try { list = (book && KC && typeof KC.list === 'function' && KC.list(book)) || []; } catch (_) { list = []; }
    let visitors = 0, regulars = 0;
    list.forEach((c) => {
      const stamps = (Array.isArray(c && c.history) ? c.history : [])
        .map((h) => Number(h && h.ts)).filter((t) => Number.isFinite(t) && t > 0);
      if (!stamps.some((t) => t >= from && t < to)) return;
      visitors++;
      if (stamps.some((t) => t < from) || Number(c.visits || 0) > stamps.length) regulars++;
    });
    return { visitors, regulars, newcomers: visitors - regulars };
  }

function openDays(range) {
    const [from, to] = __state.closedBounds(range);
    const slug = __state.activeMerchantSlug();
    const days = new Set();
    __state.realSalesList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts >= from && ts < to) days.add(merchantDayKey(ts, slug));
    });
    return Math.max(1, days.size);
  }

function realDeltaPct(range, pick, backDays, stats = __state.realWindowStats) {
    const [from, to] = __state.closedBounds(range);
    const startDay = merchantDayKey(from + 1, __state.activeMerchantSlug());
    const endDay = merchantDayKey(to - 1, __state.activeMerchantSlug());
    const spanDays = Math.max(1, Math.round((Date.parse(endDay + 'T00:00:00Z') - Date.parse(startDay + 'T00:00:00Z')) / 864e5) + 1);
    /* « vs mois préc. », « vs trimestre préc. », « vs année préc. » : la période
       du calendrier d'avant, pas les N jours qui précèdent. */
    const calendarBase = backDays ? null : calendarBounds(range == null ? __state.currentRange : range, 1);
    const baseBounds = calendarBase || __state.shiftedBusinessBounds(from, to, backDays || spanDays);
    /* The promise above, kept. shiftedBusinessBounds returns WHOLE business
       days, so a live range (« Aujourd'hui », « 7 jours » ending now) was
       weighed against complete days: at 11h42, six hours of trading against
       all of yesterday, and every morning tile read −80 % to −100 %. A live
       window's baseline stops at the same point of its own day. */
    if (rangeBounds(range == null ? __state.currentRange : range)[1] === Infinity) {
      baseBounds[1] = Math.min(baseBounds[1], baseBounds[0] + (to - from));
    }
    const base = pick(stats(baseBounds[0], baseBounds[1]));
    if (!base) return null;
    const cur = pick(stats(from, to));
    return deltaTenths(cur, base);
  }

function deltaTenths(cur, base) {
    const c = Math.round(cur * 100), b = Math.round(base * 100);
    const onCents = (v, k) => Math.abs(v * 100 - k) <= 1e-6 * Math.max(1, Math.abs(k));
    const num = (c - b) * 1000;
    if (b && onCents(cur, c) && onCents(base, b) && Number.isSafeInteger(2 * num + 2 * Math.abs(b))) {
      return __state.halfUpDiv(num, b) / 10;
    }
    return Math.round(((cur - base) / base) * 1000) / 10;
  }

function operatorLedgerPending() {
    if (!/[?&]op=1(?:&|$)/.test(location.search)) return false;
    const live = window.KiwiLive;
    const state = live?.snapshotStatus?.();
    const requested = new URLSearchParams(location.search).get('merchant');
    const venue = window.KiwiVenue?.getCurrentVenueData?.();
    return !state || state.phase !== 'complete' || (requested && state.merchant !== requested) ||
      !venue || (venue.slug && venue.slug !== state.merchant) ||
      !state.venue || state.venue !== window.KiwiVenue?.getVenue?.();
  }

function buildHeatmap(rng) {
    const v = __state.getCurrentVenue();
    /* A real merchant's peak hours come from their OWN tickets: every sale
     * carries a `ts`, so bucket the active window by hour of day. Before the
     * first sale this still draws flat — the honest answer — but it no longer
     * STAYS flat once the till has rung, which is the one thing a merchant
     * opens this card to find out. Never borrows Café Atlas's shape. */
    if (__state.ownData(v)) {
      const [from, to] = __state.closedBounds(rng);
      const span = __state.HH_HOURS.length;                          // 16 créneaux, la largeur de la carte
      /* ── La bande suit le commerce, elle ne lui est plus imposée ───────────
       * Les heures affichées étaient figées de 11 h à 02 h — les heures d'un
       * restaurant. Toute vente en dehors était JETÉE en silence
       * (`if (i >= HH_HOURS.length) return`). Une boulangerie qui ouvre à 6 h,
       * un café qui sert les petits-déjeuners à 8 h : leur matinée entière
       * disparaissait de la carte « Heures de pointe ». Et la carte ne restait
       * pas vide — elle affichait un pic à midi, c'est-à-dire le contraire de
       * la réponse. Un commerçant qui déplace du personnel là-dessus le déplace
       * à l'envers.
       *
       * On garde les seize créneaux (la carte est dessinée pour eux) mais on
       * choisit OÙ ils commencent : la fenêtre de seize heures qui capte le
       * plus de recette. À égalité, celle qui commence le plus près de la
       * première vente, pour ne pas ouvrir sur des créneaux vides. Un
       * restaurant retombe naturellement sur 11 h–02 h ; une boulangerie sur
       * 06 h–21 h. Aucun réglage à saisir, et rien n'est plus jeté tant que le
       * commerce tient dans seize heures d'affilée. */
      const byHour = new Array(24).fill(0);
      const covByHour = new Array(24).fill(0);
      __state.realSalesList().forEach((e) => {
        const ts = +e.ts || 0;
        if (ts < from || ts >= to) return;
        const h = __state.saleHour(ts);
        byHour[h] += Math.max(0, +e.amount || 0);
        covByHour[h] += 1;
      });
      let start = 11, bestSum = -1, bestLead = 99;
      for (let s = 0; s < 24; s++) {
        let sum = 0, lead = 0, counting = true;
        for (let k = 0; k < span; k++) {
          const val = byHour[(s + k) % 24];
          sum += val;
          if (counting) { if (val > 0) counting = false; else lead++; }
        }
        if (sum > bestSum || (sum === bestSum && lead < bestLead)) { bestSum = sum; bestLead = lead; start = s; }
      }
      if (bestSum <= 0) start = 11;                          // rien encore vendu : la bande d'origine
      const rev = [], cov = [], labels = [];
      for (let k = 0; k < span; k++) {
        const h = (start + k) % 24;
        rev.push(byHour[h]);
        cov.push(covByHour[h]);
        labels.push(String(h).padStart(2, '0') + 'h');
      }
      const max = Math.max(...rev);
      return labels.map((h, i) => ({
        hour: h, revenue: rev[i], covers: cov[i], unit: 'orders', intensity: max ? rev[i] / max : 0,
      }));
    }
    // Demo fixtures only carry base ranges; mapping is confined to that path.
    rng = ({ personnalise: 'aujourdhui', moisDernier: 'trenteJours', trimestre: 'trenteJours', annee: 'trenteJours' })[rng] || rng;
    const rev = __state.HH_RAW_BY_VENUE[v]?.[rng] || __state.HH_RAW_BY_VENUE.cafeAtlas[rng]
      || __state.HH_RAW_BY_VENUE.cafeAtlas.trenteJours || __state.HH_RAW_BY_VENUE.cafeAtlas.aujourdhui;
    const cov = __state.HH_COVERS_BY_VENUE[v]?.[rng] || __state.HH_COVERS_BY_VENUE.cafeAtlas[rng]
      || __state.HH_COVERS_BY_VENUE.cafeAtlas.trenteJours || __state.HH_COVERS_BY_VENUE.cafeAtlas.aujourdhui;
    const max = Math.max(...rev);
    return __state.HH_HOURS.map((h, i) => ({
      hour: h, revenue: rev[i], covers: cov[i],
      intensity: max ? rev[i] / max : 0,
    }));
  }

    return Object.freeze({ aggFusion, zeroClone, vData, priorLedgerRows, demoLedgerProjection, demoPreviousAt, demoRole, merchantTimeZone, merchantParts, merchantBoundary, merchantDayKey, calendarStartKey, calendarBounds, rangeBounds, realInsightSummary, buildRealHeroRec, buildRealHeatmapRec, screenBook, realClosedTips, realClientMix, openDays, realDeltaPct, deltaTenths, operatorLedgerPending, buildHeatmap });
  };
})();
