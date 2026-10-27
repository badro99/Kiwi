/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Global dashboard date-range selector
 *
 * Holds the selected range ('aujourdhui' | 'hier' | 'septJours' |
 * 'trenteJours' | 'personnalise'), persists to localStorage, lets sections
 * subscribe to changes, and renders every data-bearing block on the dashboard.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  /* Private split bridge: live bindings, not a second copy of range/profile state. */
  const partState = Object.seal(Object.defineProperties({}, {
    BENCH_CITY: { get: () => BENCH_CITY },
    BENCH_EMPTY: { get: () => BENCH_EMPTY },
    BENCH_LBL: { get: () => BENCH_LBL },
    BENCH_PEER: { get: () => BENCH_PEER },
    BENCH_RANK_SUB: { get: () => BENCH_RANK_SUB },
    BENCH_SUB: { get: () => BENCH_SUB },
    BENCH_TITLE_FALLBACK: { get: () => BENCH_TITLE_FALLBACK },
    CMP_EMPTY_TITLE: { get: () => CMP_EMPTY_TITLE },
    COMPARE_CAPTION: { get: () => COMPARE_CAPTION },
    COMPARE_SHORT: { get: () => COMPARE_SHORT },
    COVERS_LABEL: { get: () => COVERS_LABEL },
    DAY_ABBR: { get: () => DAY_ABBR },
    EVENING_EMPTY: { get: () => EVENING_EMPTY },
    FEED_BY_VENUE: { get: () => FEED_BY_VENUE },
    FEED_EMPTY: { get: () => FEED_EMPTY },
    FEED_SUB: { get: () => FEED_SUB },
    FEED_TITLE: { get: () => FEED_TITLE },
    GOAL_LABEL: { get: () => GOAL_LABEL },
    GOAL_UNSET: { get: () => GOAL_UNSET },
    HEALTH_CHIP: { get: () => HEALTH_CHIP },
    HEALTH_EMPTY: { get: () => HEALTH_EMPTY },
    HEALTH_SUB: { get: () => HEALTH_SUB },
    HERO_LABEL: { get: () => HERO_LABEL },
    HH_SUB: { get: () => HH_SUB },
    INTEG_LIST: { get: () => INTEG_LIST },
    INTEG_NOTCONN: { get: () => INTEG_NOTCONN },
    INTEG_SUB: { get: () => INTEG_SUB },
    INTEG_TITLE: { get: () => INTEG_TITLE },
    KPI_CATALOG: { get: () => KPI_CATALOG },
    KPI_DELTA_SUFFIX: { get: () => KPI_DELTA_SUFFIX },
    KPI_MATERIAL_ICONS: { get: () => KPI_MATERIAL_ICONS },
    KPI_MAX: { get: () => KPI_MAX },
    KPI_SPARKS: { get: () => KPI_SPARKS },
    LEGEND_PREFIX: { get: () => LEGEND_PREFIX },
    LOWSTK_STR: { get: () => LOWSTK_STR },
    MIX_CENTER_ALL: { get: () => MIX_CENTER_ALL },
    MIX_EMPTY: { get: () => MIX_EMPTY },
    ORDERS_LABEL: { get: () => ORDERS_LABEL },
    PAIRS_MIN_BASKETS: { get: () => PAIRS_MIN_BASKETS },
    PAIRS_STR: { get: () => PAIRS_STR },
    PLAN_ACTIVE: { get: () => PLAN_ACTIVE },
    PLAN_NAME: { get: () => PLAN_NAME },
    PLAN_PENDING: { get: () => PLAN_PENDING },
    PRODUCTS_COVERAGE: { get: () => PRODUCTS_COVERAGE },
    PRODUCTS_EMPTY: { get: () => PRODUCTS_EMPTY },
    PRODUCTS_MANAGE: { get: () => PRODUCTS_MANAGE },
    PRODUCTS_NO_LINES: { get: () => PRODUCTS_NO_LINES },
    PRODUCTS_SUB: { get: () => PRODUCTS_SUB },
    PRODUCTS_TITLE: { get: () => PRODUCTS_TITLE },
    PRODUCT_SOLD: { get: () => PRODUCT_SOLD },
    RANGE_DAYS: { get: () => RANGE_DAYS },
    RANGE_STR: { get: () => RANGE_STR },
    REV_BADGE: { get: () => REV_BADGE },
    REV_SUB: { get: () => REV_SUB },
    RUPTURE_STR: { get: () => RUPTURE_STR },
    SETTLE_DETAIL_LBL: { get: () => SETTLE_DETAIL_LBL },
    SETTLE_LBL: { get: () => SETTLE_LBL },
    STAFF_EMPTY: { get: () => STAFF_EMPTY },
    STAFF_ONDUTY_STR: { get: () => STAFF_ONDUTY_STR },
    STAFF_SUB: { get: () => STAFF_SUB },
    STAFF_TITLE: { get: () => STAFF_TITLE },
    STOCK_EMPTY: { get: () => STOCK_EMPTY },
    STOCK_NO_THRESHOLDS: { get: () => STOCK_NO_THRESHOLDS },
    STOCK_OK_STR: { get: () => STOCK_OK_STR },
    STOCK_SUB_STR: { get: () => STOCK_SUB_STR },
    STOCK_TITLE_STR: { get: () => STOCK_TITLE_STR },
    _benchOrig: { get: () => _benchOrig, set: value => { _benchOrig = value; } },
    _eveningOrig: { get: () => _eveningOrig, set: value => { _eveningOrig = value; } },
    _healthOrig: { get: () => _healthOrig, set: value => { _healthOrig = value; } },
    _integOrig: { get: () => _integOrig, set: value => { _integOrig = value; } },
    _stockOrig: { get: () => _stockOrig, set: value => { _stockOrig = value; } },
    activeMerchantSlug: { get: () => activeMerchantSlug },
    animateNumber: { get: () => animateNumber },
    arrowSvg: { get: () => arrowSvg },
    basketCents: { get: () => basketCents },
    benchByVenue: { get: () => benchByVenue },
    buildCustomFeed: { get: () => buildCustomFeed },
    buildHeatmap: { get: () => buildHeatmap },
    buildLiveFeed: { get: () => buildLiveFeed },
    buildRealHeatmapRec: { get: () => buildRealHeatmapRec },
    buildRealHeroRec: { get: () => buildRealHeroRec },
    closedBounds: { get: () => closedBounds },
    curUnit: { get: () => curUnit },
    currentRange: { get: () => currentRange, set: value => { currentRange = value; } },
    defaultKpiKeys: { get: () => defaultKpiKeys },
    deltaLabels: { get: () => deltaLabels },
    demoHeroSim: { get: () => demoHeroSim, set: value => { demoHeroSim = value; } },
    demoPreviousAt: { get: () => demoPreviousAt },
    demoRole: { get: () => demoRole },
    dutyBand: { get: () => dutyBand },
    effRange: { get: () => effRange },
    emptyBlockBody: { get: () => emptyBlockBody },
    emptyListBody: { get: () => emptyListBody },
    escTxt: { get: () => escTxt },
    fitHeroAmount: { get: () => fitHeroAmount },
    fmtHeroAmount: { get: () => fmtHeroAmount },
    fmtHeures: { get: () => fmtHeures },
    fmtKpiVal: { get: () => fmtKpiVal },
    fmtPct: { get: () => fmtPct },
    fmtSettleAmount: { get: () => fmtSettleAmount },
    frInt: { get: () => frInt },
    frMoney: { get: () => frMoney },
    getCurrentVenue: { get: () => getCurrentVenue },
    getKpiLayout: { get: () => getKpiLayout },
    getLang: { get: () => getLang },
    getSim: { get: () => getSim },
    goalByVenue: { get: () => goalByVenue },
    growBars: { get: () => growBars },
    guardOperatorFigures: { get: () => guardOperatorFigures },
    healthByVenue: { get: () => healthByVenue },
    heroDataByVenue: { get: () => heroDataByVenue },
    homeSet: { get: () => homeSet },
    hotelBandTiles: { get: () => hotelBandTiles },
    intensityClass: { get: () => intensityClass },
    isLiveDemo: { get: () => isLiveDemo },
    kitCase: { get: () => kitCase },
    kpiByVenue: { get: () => kpiByVenue },
    kpiLabel: { get: () => kpiLabel },
    lastBand: { get: () => lastBand, set: value => { lastBand = value; } },
    liveTickInProgress: { get: () => liveTickInProgress, set: value => { liveTickInProgress = value; } },
    localDayTick: { get: () => localDayTick },
    merchantDayBounds: { get: () => merchantDayBounds },
    merchantDayKey: { get: () => merchantDayKey },
    mixByVenue: { get: () => mixByVenue },
    openDays: { get: () => openDays },
    operatorUnavailableText: { get: () => operatorUnavailableText },
    ownData: { get: () => ownData },
    parseAmountFromEl: { get: () => parseAmountFromEl },
    parseIntFromEl: { get: () => parseIntFromEl },
    parsePctFromEl: { get: () => parsePctFromEl },
    productsByVenue: { get: () => productsByVenue },
    rangeBounds: { get: () => rangeBounds },
    realClientMix: { get: () => realClientMix },
    realDeltaPct: { get: () => realDeltaPct },
    realGrossProfit: { get: () => realGrossProfit },
    realLowStock: { get: () => realLowStock },
    realMixRows: { get: () => realMixRows },
    realPairs: { get: () => realPairs },
    realRevSeries: { get: () => realRevSeries },
    realRoster: { get: () => realRoster },
    realSalesTotals: { get: () => realSalesTotals },
    realTopProducts: { get: () => realTopProducts },
    realWindowStats: { get: () => realWindowStats },
    renderMixPlan: { get: () => renderMixPlan },
    renderPairs: { get: () => renderPairs },
    retailBand: { get: () => retailBand },
    revChartByVenue: { get: () => revChartByVenue },
    settleByVenue: { get: () => settleByVenue },
    showComparison: { get: () => showComparison, set: value => { showComparison = value; } },
    staffByVenue: { get: () => staffByVenue },
    tableTimeTile: { get: () => tableTimeTile },
    timelineWeekTotalByVenue: { get: () => timelineWeekTotalByVenue },
    trLegend: { get: () => trLegend },
    trStr: { get: () => trStr },
    tradeStr: { get: () => tradeStr },
    vData: { get: () => vData },
    FUSION_AVG_KEYS: { get: () => FUSION_AVG_KEYS },
    isPlainObj: { get: () => isPlainObj },
    ledgerSum: { get: () => ledgerSum },
    tenderAmounts: { get: () => tenderAmounts },
    REAL_MIX: { get: () => REAL_MIX },
    DEMO_ROLE: { get: () => DEMO_ROLE },
    VALID: { get: () => VALID },
    DEFAULT_RANGE: { get: () => DEFAULT_RANGE },
    customRange: { get: () => customRange, set: value => { customRange = value; } },
    STORAGE_KEY: { get: () => STORAGE_KEY },
    renderSelector: { get: () => renderSelector },
    subscribers: { get: () => subscribers },
    CUSTOM_KEY: { get: () => CUSTOM_KEY },
    dateToIso: { get: () => dateToIso },
    CMP_KEY: { get: () => CMP_KEY },
    renderRevChart: { get: () => renderRevChart },
    homeStore: { get: () => homeStore },
    numberShape: { get: () => numberShape },
    textNodesOf: { get: () => textNodesOf },
    DEFAULT_MERCHANT_TZ: { get: () => DEFAULT_MERCHANT_TZ },
    dayCutoffH: { get: () => dayCutoffH },
    addMerchantDays: { get: () => addMerchantDays },
    realSalesList: { get: () => realSalesList },
    saleHour: { get: () => saleHour },
    tenderBucket: { get: () => tenderBucket },
    salesMath: { get: () => salesMath },
    realRefundList: { get: () => realRefundList },
    deliveryDue: { get: () => deliveryDue },
    TENDER_NAME: { get: () => TENDER_NAME },
    shiftedBusinessBounds: { get: () => shiftedBusinessBounds },
    halfUpDiv: { get: () => halfUpDiv },
    realMoneyList: { get: () => realMoneyList },
    niceCeil: { get: () => niceCeil },
    HH_HOURS: { get: () => HH_HOURS },
    HH_RAW_BY_VENUE: { get: () => HH_RAW_BY_VENUE },
    HH_COVERS_BY_VENUE: { get: () => HH_COVERS_BY_VENUE },
    hotelMerchant: { get: () => hotelMerchant },
    hotelPerf: { get: () => hotelPerf },
    HOTEL_PERF_TTL: { get: () => HOTEL_PERF_TTL },
    renderKpiBand: { get: () => renderKpiBand },
    hotelDelta: { get: () => hotelDelta },
    tableTime: { get: () => tableTime },
    TABLE_TIME_TTL: { get: () => TABLE_TIME_TTL },
    KC_STR: { get: () => KC_STR },
    saveKpiLayout: { get: () => saveKpiLayout },
    resetKpiLayout: { get: () => resetKpiLayout },
    LOW_STOCK_SEUIL: { get: () => LOW_STOCK_SEUIL },
    PAIRS_MAX_KEYS: { get: () => PAIRS_MAX_KEYS },
    PAIRS_MIN_TOGETHER: { get: () => PAIRS_MIN_TOGETHER },
    BAND_NAV: { get: () => BAND_NAV },
    renderHero: { get: () => renderHero },
    renderHeroAi: { get: () => renderHeroAi },
    renderGoal: { get: () => renderGoal },
    renderHeatmap: { get: () => renderHeatmap },
    renderMix: { get: () => renderMix },
    renderFeed: { get: () => renderFeed },
    renderSettle: { get: () => renderSettle },
    renderEvening: { get: () => renderEvening },
    renderStock: { get: () => renderStock },
    renderHealth: { get: () => renderHealth },
    renderBench: { get: () => renderBench },
    renderInteg: { get: () => renderInteg },
    renderProducts: { get: () => renderProducts },
    renderStaff: { get: () => renderStaff },
    sameDay: { get: () => sameDay },
    monthOnly: { get: () => monthOnly },
    dpEl: { get: () => dpEl, set: value => { dpEl = value; } },
    dpOutside: { get: () => dpOutside, set: value => { dpOutside = value; } },
    dpKey: { get: () => dpKey, set: value => { dpKey = value; } },
    dpControl: { get: () => dpControl, set: value => { dpControl = value; } },
    PICKER_STR: { get: () => PICKER_STR },
    isoToDate: { get: () => isoToDate },
    startOfDay: { get: () => startOfDay },
    shiftMonth: { get: () => shiftMonth },
    addDays: { get: () => addDays },
    LOCALES: { get: () => LOCALES },
    dpEsc: { get: () => dpEsc },
    ymdInt: { get: () => ymdInt },
    monthLabel: { get: () => monthLabel },
    spanDays: { get: () => spanDays },
    onAction: { get: () => onAction },
    onCompareToggle: { get: () => onCompareToggle },
    GLOVO_TOAST: { get: () => GLOVO_TOAST },
    /* Sibling calls between parts go through this owner too. */
    merchantParts: { get: () => merchantParts },
    operatorLedgerPending: { get: () => operatorLedgerPending },
    openKpiCustomizer: { get: () => openKpiCustomizer },
  }));
  let partFunctions = null, partLoading = null;
  const partUrl = 'assets/daterange/renderers.js?v=14';
  function installPart() {
    if (!partFunctions && window.__kiwiDateRangeParts) partFunctions = window.__kiwiDateRangeParts(partState);
    return partFunctions;
  }
  function loadPart() {
    if (installPart()) return Promise.resolve(partFunctions);
    if (partLoading) return partLoading;
    partLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = partUrl;
      script.onload = () => {
        if (installPart()) resolve(partFunctions);
        else { partLoading = null; script.remove(); reject(new Error(partUrl)); }
      };
      script.onerror = () => { partLoading = null; script.remove(); reject(new Error(partUrl)); };
      document.head.appendChild(script);
    });
    return partLoading;
  }
  function callPart(name, self, args) {
    const functions = installPart();
    if (functions) return functions[name].apply(self, args);
    return loadPart().then(functions => functions[name].apply(self, args), () => {
      // Leave the loader retryable on the next render/open after a network error.
    });
  }


  const STORAGE_KEY = 'kiwiDateRange';
  const CMP_KEY = 'kiwiRevCompare';
  const DEFAULT_RANGE = 'aujourdhui';
  /* 'personnalise' is a first-class range again: the "Personnalisé" pill
   * opens a calendar popover (openCustomPicker) that commits a { start,
   * end } pair. The custom range carries no data table of its own —
   * effRange() buckets it onto an existing range by span, so every
   * dashboard block stays internally consistent. */
  const VALID = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'moisDernier', 'trimestre', 'annee', 'personnalise'];
  const subscribers = new Set();
  let currentRange = DEFAULT_RANGE;
  let showComparison = false;

  /* ─── Custom range state · the picked { start, end } Date pair ───────
   * Persisted to localStorage as "YYYY-MM-DD|YYYY-MM-DD". */
  const CUSTOM_KEY = 'kiwiCustomRange';
  let customRange = null;

  const z2 = (n) => String(n).padStart(2, '0');
  const dateToIso = (d) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
  function isoToDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }
  function parseCustom(str) {
    const p = String(str || '').split('|');
    const a = isoToDate(p[0]), b = isoToDate(p[1]);
    if (!a || !b) return null;
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }
  // Inclusive whole-day span between two Dates (same day → 1).
  function spanDays(a, b) {
    const d0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const d1 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round(Math.abs(d1 - d0) / 864e5) + 1;
  }
  /* Borrow the shape of a real data-bearing range, picked by how many
   * days the custom range spans — hier / septJours / trenteJours are the
   * buckets every venue-keyed table is guaranteed to carry. */
  function customBucket() {
    if (!customRange) return 'trenteJours';
    const n = spanDays(customRange.start, customRange.end);
    if (n <= 1) return 'hier';
    if (n <= 10) return 'septJours';
    return 'trenteJours';
  }
  // Resolve currentRange to a range key that actually carries data.
  function effRange() {
    return currentRange === 'personnalise' ? customBucket() : currentRange;
  }

  const getLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  /* La devise se lit comme ailleurs dans le tableau de bord : « درهم » sous
   * l'arabe (inventaire, fiche produit, insights, répartition des paiements),
   * « MAD » sinon. L'accueil seul écrivait « 0 MAD » sous l'arabe, à côté
   * d'un inventaire en « 4 500 درهم ». */
  const curUnit = () => (getLang() === 'ar' ? 'درهم' : 'MAD');
  // Translate a captured-FR string through a { frString: {en,ar} } map.
  // FR locale or an unmapped string falls through to the original — the
  // same graceful pattern used by the [lang]?.[key] || .fr[key] lookups.
  function trStr(fr, map) {
    const lang = getLang();
    if (lang === 'fr' || !fr) return fr;
    return (map[fr] && map[fr][lang]) || trTemplate(fr, map, lang) || fr;
  }
  /* Les libellés à nombre (« 31 DERNIERS JOURS », « Total 92 jours ») : la clé
   * exacte d'abord, puis le gabarit « # ». Sans lui, la plage réelle d'un
   * commerçant retombait en français dès qu'elle ne faisait pas 7 ou 30 jours. */
  function trTemplate(fr, map, lang) {
    const m = /\d+/.exec(fr);
    if (!m) return null;
    const e = map[fr.replace(m[0], '#')];
    const f = e && e[lang];
    return typeof f === 'function' ? f(+m[0]) : null;
  }
  function arDays(n) {
    if (n === 1) return 'يوم واحد';
    if (n === 2) return 'يومين';
    return (n % 100 >= 3 && n % 100 <= 10) ? n + ' أيام' : n + ' يومًا';
  }
  // Translate "PREFIX · rest" — only the prefix is localized, the rest
  // (usually a formatted amount) is kept verbatim.
  function trLegend(fr, map) {
    const lang = getLang();
    if (lang === 'fr' || !fr) return fr;
    const i = fr.indexOf(' · ');
    if (i < 0) return (map[fr] && map[fr][lang]) || trTemplate(fr, map, lang) || fr;
    const pre = fr.slice(0, i);
    return ((map[pre] && map[pre][lang]) || trTemplate(pre, map, lang) || pre) + fr.slice(i);
  }
  const getDateRange = () => currentRange;
  const getShowComparison = () => showComparison;
  const getCurrentVenue = () => (window.KiwiVenue?.getVenue?.() || 'cafeAtlas');

  /* ─── WHOSE DATA IS THIS? ────────────────────────────────────────────────
   * Every card below picks between the merchant's OWN store and the demo
   * model, and every one of them used to ask isCustom() — "did the user
   * create this venue?". That misses the state a real merchant is actually
   * in for their first minutes, and after any venue-resolution hiccup: a
   * hosted, signed-in session sitting on a venue id that is not flagged
   * custom. In that state the hero, the payment mix, the KPI band and the
   * revenue chart all fell through to the demo model and painted somebody
   * else's day, while the assistant — which asks isReal() || isCustom() —
   * correctly answered that there were no sales yet.
   *
   * That disagreement is the single worst thing this product can do: the
   * merchant reads two Kiwi surfaces, they contradict each other about
   * whether their own money exists, and neither is obviously the liar. So
   * the question is asked ONCE, here, and it is the assistant's question.
   * A real session shows its own data or an empty state — never a demo's.
   * Local demo: isReal() is false, so nothing about it changes. */
  const ownData = (id) => {
    const KV = window.KiwiVenue;
    if (KV && KV.isCustom && KV.isCustom(id)) return true;
    return !!(window.KiwiEnv?.isReal?.());
  };

  /* ─── Fusion-mode aggregator ───────────────────────────────────────────
   * When the merchant has activated "Fusionner les 3 emplacements", every
   * venue-keyed table is summed across cafeAtlas + maisonMansour + spaBahia.
   *
   * Strategy: recursive merge that sums numerics and arrays of numerics,
   * deep-merges objects, and falls back to cafeAtlas for non-aggregable
   * shapes (strings, booleans, null). Keys flagged as "rate-like" (delta*,
   * pct, taux, rate, success, ratio) are averaged instead of summed so
   * percentages don't blow past 100. */
  const FUSION_AVG_KEYS = /(^delta|^pct$|^percent$|^rate$|^success$|^ratio$|^taux|^score$|^health$|^panier$|^basket$|^avg|^moy)/i;
  function isPlainObj(o) {
    return o && typeof o === 'object' && !Array.isArray(o);
  }
  function aggFusion(...args) { return callPart('aggFusion', this, args); }
  // Deep clone of a data slice with every number zeroed and every array kept
  // at the same length — used to give a brand-new user-created venue a
  // structurally-valid but empty dataset, so every renderer paints its real
  // "no data yet" state instead of crashing or falling back to demo numbers.
  function zeroClone(...args) { return callPart('zeroClone', this, args); }

  // Resolve a venue-keyed table for the active venue + range, with cafeAtlas fallback.
  function vData(...args) { return callPart('vData', this, args); }
  const ledgerSum = rows => rows.reduce((s,r)=>s+Math.round(r.amount*100),0)/100;
  /* The same-length window before the selected one: yesterday up to the same
     point of its business day for Today, the day before for Yesterday, the
     previous 7 or 30 days otherwise. */
  function priorLedgerRows(...args) { return callPart('priorLedgerRows', this, args); }
  /* Today against yesterday at the same time, from the same ledger, for Kiwi
     AI's Today card on the kit (§18.6); null where that ledger is not running. */
  function todayPace() {
    const clock = window.KiwiDemoClock, dr = window.KiwiDayReport;
    if (!dr || !clock?.getSimState?.()) return null;
    const day = dr.today(), rows = clock.getDaySales(day) || [];
    return { total:ledgerSum(rows), count:rows.length, priorTotal:ledgerSum(priorLedgerRows('aujourdhui', day, 1, day)), at:Date.now() };
  }
  function demoLedgerProjection(...args) { return callPart('demoLedgerProjection', this, args); }

  // True only on the live "today" range, with the demo clock active.
  function isLiveDemo() {
    const eff = effRange();
    // A user-created venue has no synthetic demo clock — it stays at zero
    // until the merchant records real sales.
    if (ownData(getCurrentVenue())) return false;
    return eff === 'aujourdhui' && !!window.KiwiDemoClock?.isActive?.();
  }
  let demoRenderSim = null, demoHeroSim = null;
  function getSim() { return demoRenderSim || window.KiwiDemoClock?.getSimState?.() || null; }
  // One same-time yesterday comparator for both demo cards. The old goal
  // breakdown kept a fixed +3.2% while the chart used a future hour boundary.
  // Called only from the demo branch; merchant sales/reconciliation stay intact.
  function demoPreviousAt(...args) { return callPart('demoPreviousAt', this, args); }
  // Set true while a demoClock tick is fanning out renders — used to suppress
  // entrance animations on the chart (would otherwise replay every 3s).
  let liveTickInProgress = false;

  /* ═══════════════ STRINGS ═══════════════ */

  const RANGE_STR = {
    fr: { aujourdhui: "Aujourd'hui", hier: 'Hier', septJours: '7 derniers jours', trenteJours: '30 derniers jours', moisDernier: 'Mois dernier', trimestre: 'Ce trimestre', annee: 'Cette année', personnalise: 'Période personnalisée' },
    en: { aujourdhui: 'Today', hier: 'Yesterday', septJours: 'Last 7 days', trenteJours: 'Last 30 days', moisDernier: 'Last month', trimestre: 'This quarter', annee: 'This year', personnalise: 'Custom period' },
    ar: { aujourdhui: 'اليوم', hier: 'أمس', septJours: 'آخر 7 أيام', trenteJours: 'آخر 30 يوما', moisDernier: 'الشهر الماضي', trimestre: 'هذا الربع', annee: 'هذه السنة', personnalise: 'فترة مخصصة' },
  };

  const HERO_LABEL = {
    fr: { aujourdhui: "ENCAISSÉ AUJOURD'HUI", hier: 'ENCAISSÉ HIER', septJours: 'ENCAISSÉ 7 JOURS', trenteJours: 'ENCAISSÉ 30 JOURS', moisDernier: 'ENCAISSÉ, MOIS DERNIER', trimestre: 'ENCAISSÉ, TRIMESTRE', annee: 'ENCAISSÉ, ANNÉE', personnalise: 'ENCAISSÉ, PÉRIODE' },
    en: { aujourdhui: 'CASHED TODAY', hier: 'CASHED YESTERDAY', septJours: 'CASHED 7 DAYS', trenteJours: 'CASHED 30 DAYS', moisDernier: 'CASHED, LAST MONTH', trimestre: 'CASHED, QUARTER', annee: 'CASHED, YEAR', personnalise: 'CASHED, PERIOD' },
    ar: { aujourdhui: 'المقبوض اليوم', hier: 'المقبوض أمس', septJours: 'المقبوض في 7 أيام', trenteJours: 'المقبوض في 30 يومًا', moisDernier: 'المقبوض، الشهر الماضي', trimestre: 'المقبوض، الربع', annee: 'المقبوض، السنة', personnalise: 'المقبوض، الفترة' },
  };

  /* §9.4: with the 2027 dashboard on, the shipped capitals below read in
     sentence case; with it off they stay as shipped. Currency codes and the
     Z of a Z report keep their capitals. A comparison ("vs hier") follows a
     figure, so it starts in lower case. */
  function kitCase(s, lead) {
    s = String(s == null ? '' : s);
    const de = typeof document !== 'undefined' && document.documentElement;
    if (!de || !de.getAttribute || de.getAttribute('data-skin-2027') !== 'dashboard' || s !== s.toUpperCase()) return s;
    const low = s.toLowerCase().replace(/\b(mad|eur|usd|aed|gbp|z|tva|ice)\b/g, (m) => m.toUpperCase());
    return lead === false ? low : low.charAt(0).toUpperCase() + low.slice(1);
  }
  function deltaLabels(lang, range) {
    const src = DELTA_LABELS[lang]?.[range] || DELTA_LABELS.fr[range];
    if (!src) return src;
    const out = {};
    for (const k in src) out[k] = kitCase(src[k], false);
    return out;
  }

  const DELTA_LABELS = {
    fr: {
      aujourdhui:   { hier: 'VS HIER', semaine: 'VS SEMAINE', mois: 'VS MOIS DERNIER' },
      hier:         { hier: 'VS AVANT-HIER', semaine: 'VS SEMAINE', mois: 'VS MOIS' },
      septJours:    { semaine: 'VS 7 JOURS PRÉCÉDENTS', mois: 'VS MOIS' },
      trenteJours:  { mois: 'VS 30 JOURS PRÉCÉDENTS' },
      moisDernier:  { mois: 'VS MOIS PRÉC.' },
      trimestre:    { mois: 'VS TRIMESTRE PRÉC.' },
      annee:        { mois: 'VS ANNÉE PRÉC.' },
      personnalise: { hier: 'VS HIER', semaine: 'VS SEMAINE', mois: 'VS MOIS DERNIER' },
    },
    en: {
      aujourdhui:   { hier: 'VS YESTERDAY', semaine: 'VS WEEK', mois: 'VS LAST MONTH' },
      hier:         { hier: 'VS DAY BEFORE', semaine: 'VS WEEK', mois: 'VS MONTH' },
      septJours:    { semaine: 'VS PREVIOUS 7 DAYS', mois: 'VS MONTH' },
      trenteJours:  { mois: 'VS PREVIOUS 30 DAYS' },
      moisDernier:  { mois: 'VS PREV. MONTH' },
      trimestre:    { mois: 'VS PREV. QUARTER' },
      annee:        { mois: 'VS PREV. YEAR' },
      personnalise: { hier: 'VS YESTERDAY', semaine: 'VS WEEK', mois: 'VS LAST MONTH' },
    },
    ar: {
      aujourdhui:   { hier: 'مقابل أمس', semaine: 'مقابل الأسبوع', mois: 'مقابل الشهر الماضي' },
      hier:         { hier: 'مقابل أول أمس', semaine: 'مقابل الأسبوع', mois: 'مقابل الشهر' },
      septJours:    { semaine: 'مقابل 7 أيام السابقة', mois: 'مقابل الشهر' },
      trenteJours:  { mois: 'مقابل 30 يومًا السابقة' },
      moisDernier:  { mois: 'مقابل الشهر السابق' },
      trimestre:    { mois: 'مقابل الربع السابق' },
      annee:        { mois: 'مقابل السنة السابقة' },
      personnalise: { hier: 'مقابل أمس', semaine: 'مقابل الأسبوع', mois: 'مقابل الشهر الماضي' },
    },
  };

  const KPI_DELTA_SUFFIX = {
    fr: { aujourdhui: 'vs hier', hier: 'vs avant-hier', septJours: 'vs 7 jours préc.', trenteJours: 'vs 30 jours préc.', moisDernier: 'vs mois préc.', trimestre: 'vs trimestre préc.', annee: 'vs année préc.', personnalise: 'vs hier' },
    en: { aujourdhui: 'vs yesterday', hier: 'vs day before', septJours: 'vs previous 7 days', trenteJours: 'vs previous 30 days', moisDernier: 'vs previous month', trimestre: 'vs previous quarter', annee: 'vs previous year', personnalise: 'vs previous period' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام السابقة', trenteJours: 'مقابل 30 يومًا السابقة', moisDernier: 'مقابل الشهر السابق', trimestre: 'مقابل الربع السابق', annee: 'مقابل السنة السابقة', personnalise: 'مقابل أمس' },
  };

  // Caption shown under the chart title when "Comparer" is on, by selected range.
  const COMPARE_CAPTION = {
    fr: { aujourdhui: 'vs. Hier', hier: 'vs. Avant-hier', septJours: 'vs. 7 jours précédents', trenteJours: 'vs. 30 jours précédents', moisDernier: 'vs. Mois précédent', trimestre: 'vs. Trimestre précédent', annee: 'vs. Année précédente', personnalise: 'vs. Période précédente' },
    en: { aujourdhui: 'vs. Yesterday', hier: 'vs. Day before', septJours: 'vs. Previous 7 days', trenteJours: 'vs. Previous 30 days', moisDernier: 'vs. Previous month', trimestre: 'vs. Previous quarter', annee: 'vs. Previous year', personnalise: 'vs. Previous period' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام السابقة', trenteJours: 'مقابل 30 يومًا السابقة', moisDernier: 'مقابل الشهر السابق', trimestre: 'مقابل الربع السابق', annee: 'مقابل السنة السابقة', personnalise: 'مقابل الفترة السابقة' },
  };
  // Short label used inside the on-chart tooltip — must fit in ~210px.
  const COMPARE_SHORT = {
    fr: { aujourdhui: 'vs hier', hier: 'vs avant-hier', septJours: 'vs 7j préc.', trenteJours: 'vs 30j préc.', moisDernier: 'vs mois préc.', trimestre: 'vs trim. préc.', annee: 'vs année préc.', personnalise: 'vs préc.' },
    en: { aujourdhui: 'vs yest.', hier: 'vs day before', septJours: 'vs prev. 7d', trenteJours: 'vs prev. 30d', moisDernier: 'vs prev. mo.', trimestre: 'vs prev. qtr.', annee: 'vs prev. yr.', personnalise: 'vs prev.' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام', trenteJours: 'مقابل 30 يومًا', moisDernier: 'مقابل الشهر', trimestre: 'مقابل الربع', annee: 'مقابل السنة', personnalise: 'مقابل السابق' },
  };

  // Why « Comparer » is greyed out: this merchant has no takings in the window
  // before the one on screen, so there is no second line to draw.
  const CMP_EMPTY_TITLE = {
    'Aucune période précédente à comparer': {
      en: 'No previous period to compare against',
      ar: 'لا توجد فترة سابقة للمقارنة',
    },
  };

  const HH_SUB = {
    // moisDernier/trimestre/annee reuse the 30-day hourly profile (buildHeatmap
    // maps them onto trenteJours), so their labels say "typical profile" rather
    // than claim period-exact data.
    fr: { aujourdhui: "Intensité horaire aujourd'hui", hier: 'Intensité horaire hier', septJours: 'Intensité horaire moyenne, 7 derniers jours', trenteJours: 'Intensité horaire moyenne, 30 derniers jours', moisDernier: 'Profil horaire type, moyenne longue période', trimestre: 'Profil horaire type, moyenne longue période', annee: 'Profil horaire type, moyenne longue période', personnalise: 'Intensité horaire, période personnalisée' },
    en: { aujourdhui: 'Hourly intensity today', hier: 'Hourly intensity yesterday', septJours: 'Average hourly intensity, last 7 days', trenteJours: 'Average hourly intensity, last 30 days', moisDernier: 'Typical hourly profile, long-run average', trimestre: 'Typical hourly profile, long-run average', annee: 'Typical hourly profile, long-run average', personnalise: 'Hourly intensity, custom period' },
    ar: { aujourdhui: 'كثافة الساعات اليوم', hier: 'كثافة الساعات أمس', septJours: 'متوسط الكثافة الساعية، آخر 7 أيام', trenteJours: 'متوسط الكثافة الساعية، آخر 30 يومًا', moisDernier: 'النمط الساعي النموذجي، متوسط طويل المدى', trimestre: 'النمط الساعي النموذجي، متوسط طويل المدى', annee: 'النمط الساعي النموذجي، متوسط طويل المدى', personnalise: 'كثافة الساعات، فترة مخصصة' },
  };
  const COVERS_LABEL = { fr: 'couverts', en: 'guests', ar: 'زبون' };
  /* Une vente ne porte pas de nombre de couverts : la carte réelle compte des
   * tickets. « 4 couverts » pour une table de quatre et trois cafés au comptoir
   * aurait dit 4 dans les deux cas. */
  const ORDERS_LABEL = {
    fr: (n) => (n > 1 ? 'commandes' : 'commande'),
    en: (n) => (n === 1 ? 'order' : 'orders'),
    ar: () => 'طلب',
  };

  const FEED_TITLE = { fr: { aujourdhui: 'Commandes en direct', hier: 'Commandes · hier', septJours: 'Commandes · 7 derniers jours', trenteJours: 'Commandes · 30 derniers jours', moisDernier: 'Commandes · mois dernier', trimestre: 'Commandes · trimestre', annee: 'Commandes · année', personnalise: 'Commandes en direct' },
                       en: { aujourdhui: 'Live orders', hier: 'Yesterday\'s orders', septJours: 'Orders · last 7 days', trenteJours: 'Orders · last 30 days', moisDernier: 'Orders · last month', trimestre: 'Orders · quarter', annee: 'Orders · year', personnalise: 'Live orders' },
                       ar: { aujourdhui: 'الطلبات المباشرة', hier: 'طلبات أمس', septJours: 'طلبات · آخر 7 أيام', trenteJours: 'طلبات · آخر 30 يومًا', moisDernier: 'طلبات · الشهر الماضي', trimestre: 'طلبات · الربع', annee: 'طلبات · السنة', personnalise: 'الطلبات المباشرة' } };
  const FEED_SUB =   { fr: { aujourdhui: '6 dernières · flux temps réel', hier: 'Dernières du service de hier', septJours: 'Échantillon · 7 derniers jours', trenteJours: 'Échantillon · 30 derniers jours', moisDernier: 'Échantillon · mois dernier', trimestre: 'Échantillon · trimestre', annee: 'Échantillon · année', personnalise: '6 dernières · flux temps réel' },
                       en: { aujourdhui: 'Last 6 · real-time feed', hier: 'Last 6 from yesterday', septJours: 'Sample · last 7 days', trenteJours: 'Sample · last 30 days', moisDernier: 'Sample · last month', trimestre: 'Sample · quarter', annee: 'Sample · year', personnalise: 'Last 6 · real-time feed' },
                       ar: { aujourdhui: 'آخر 6 · تدفّق لحظي', hier: 'آخر 6 من أمس', septJours: 'عيّنة · آخر 7 أيام', trenteJours: 'عيّنة · آخر 30 يومًا', moisDernier: 'عيّنة · الشهر الماضي', trimestre: 'عيّنة · الربع', annee: 'عيّنة · السنة', personnalise: 'آخر 6 · تدفّق لحظي' } };

  const FEED_EMPTY = {
    fr: { badge: 'SERVICE OUVERT', title: 'Première commande à venir', sub: "Le flux s'active dès la première vente saisie sur la caisse." },
    en: { badge: 'SERVICE OPEN',  title: 'First order coming up',     sub: 'The feed starts as soon as the first sale is rung up.' },
    ar: { badge: 'الخدمة مفتوحة',  title: 'أول طلب قادم',              sub: 'يبدأ التدفّق فور تسجيل أول عملية بيع على الصندوق.' },
  };

  const PRODUCTS_SUB = { fr: { aujourdhui: "Aujourd'hui · tous les items", hier: 'Hier · tous les items', septJours: '7 derniers jours · tous les items', trenteJours: '30 derniers jours · tous les items', moisDernier: 'Mois dernier · tous les items', trimestre: 'Trimestre · tous les items', annee: 'Année · tous les items', personnalise: 'Période personnalisée · tous les items' },
                         en: { aujourdhui: 'Today · all items', hier: 'Yesterday · all items', septJours: 'Last 7 days · all items', trenteJours: 'Last 30 days · all items', moisDernier: 'Last month · all items', trimestre: 'Quarter · all items', annee: 'Year · all items', personnalise: 'Custom period · all items' },
                         ar: { aujourdhui: 'اليوم · جميع العناصر', hier: 'أمس · جميع العناصر', septJours: 'آخر 7 أيام · جميع العناصر', trenteJours: 'آخر 30 يومًا · جميع العناصر', moisDernier: 'الشهر الماضي · جميع العناصر', trimestre: 'الربع · جميع العناصر', annee: 'السنة · جميع العناصر', personnalise: 'فترة مخصصة · جميع العناصر' } };
  const STAFF_SUB =    { fr: { aujourdhui: 'Service en cours · PIN connecté', hier: 'Service de hier · clos', septJours: 'Cumul 7 jours · par employé', trenteJours: 'Cumul 30 jours · par employé', moisDernier: 'Cumul mois dernier · par employé', trimestre: 'Cumul trimestre · par employé', annee: 'Cumul année · par employé', personnalise: 'Période personnalisée · par employé' },
                         en: { aujourdhui: 'Service in progress · PIN connected', hier: 'Yesterday\'s service · closed', septJours: '7-day total · per employee', trenteJours: '30-day total · per employee', moisDernier: 'Last month total · per employee', trimestre: 'Quarter total · per employee', annee: 'Year total · per employee', personnalise: 'Custom period · per employee' },
                         ar: { aujourdhui: 'الخدمة جارية · رموز PIN متّصلة', hier: 'خدمة أمس · مغلقة', septJours: 'إجمالي 7 أيام · لكل موظف', trenteJours: 'إجمالي 30 يومًا · لكل موظف', moisDernier: 'إجمالي الشهر الماضي · لكل موظف', trimestre: 'إجمالي الربع · لكل موظف', annee: 'إجمالي السنة · لكل موظف', personnalise: 'فترة مخصصة · لكل موظف' } };
  const HEALTH_SUB =   { fr: { aujourdhui: 'Mesuré sur 90 jours · facteurs activés', hier: 'Mesuré au close de hier', septJours: 'Mesuré sur les 7 derniers jours', trenteJours: 'Mesuré sur les 30 derniers jours', moisDernier: 'Mesuré sur le mois dernier', trimestre: 'Mesuré sur le trimestre', annee: "Mesuré sur l'année", personnalise: 'Période personnalisée · facteurs activés' },
                         en: { aujourdhui: 'Measured over 90 days · active factors', hier: 'Measured at yesterday\'s close', septJours: 'Measured over the last 7 days', trenteJours: 'Measured over the last 30 days', moisDernier: 'Measured over last month', trimestre: 'Measured over the quarter', annee: 'Measured over the year', personnalise: 'Custom period · active factors' },
                         ar: { aujourdhui: 'محسوب على 90 يومًا · عوامل مُفعَّلة', hier: 'محسوب عند إقفال أمس', septJours: 'محسوب على آخر 7 أيام', trenteJours: 'محسوب على آخر 30 يومًا', moisDernier: 'محسوب على الشهر الماضي', trimestre: 'محسوب على الربع', annee: 'محسوب على السنة', personnalise: 'فترة مخصصة · عوامل مُفعَّلة' } };
  const BENCH_SUB =    { fr: { aujourdhui: '147 cafés casablancais · même gamme de ticket moyen', hier: 'Snapshot du close de hier · 147 cafés', septJours: 'Moyennes sur 7 jours · 147 cafés', trenteJours: 'Moyennes sur 30 jours · 147 cafés', moisDernier: 'Moyennes du mois dernier · 147 cafés', trimestre: 'Moyennes du trimestre · 147 cafés', annee: "Moyennes de l'année · 147 cafés", personnalise: '147 cafés · période personnalisée' },
                         en: { aujourdhui: '147 Casablanca cafés · same avg ticket range', hier: 'Yesterday\'s close · 147 cafés', septJours: '7-day averages · 147 cafés', trenteJours: '30-day averages · 147 cafés', moisDernier: 'Last month averages · 147 cafés', trimestre: 'Quarter averages · 147 cafés', annee: 'Year averages · 147 cafés', personnalise: '147 cafés · custom period' },
                         ar: { aujourdhui: '147 مقهى بالدار البيضاء · نفس متوسّط التذكرة', hier: 'إقفال أمس · 147 مقهى', septJours: 'متوسّطات على 7 أيام · 147 مقهى', trenteJours: 'متوسّطات على 30 يومًا · 147 مقهى', moisDernier: 'متوسّطات الشهر الماضي · 147 مقهى', trimestre: 'متوسّطات الربع · 147 مقهى', annee: 'متوسّطات السنة · 147 مقهى', personnalise: '147 مقهى · فترة مخصصة' } };

  /* ─── Revenue chart · range badge / sub-line / legend (FR captured in data) ─── */
  const REV_BADGE = {
    "AUJOURD'HUI · LIVE": { en: 'TODAY · LIVE',          ar: 'اليوم · مباشر' },
    'HIER · COMPLET':     { en: 'YESTERDAY · COMPLETE',  ar: 'أمس · مكتمل' },
    '7 DERNIERS JOURS':   { en: 'LAST 7 DAYS',           ar: 'آخر 7 أيام' },
    '30 DERNIERS JOURS':  { en: 'LAST 30 DAYS',          ar: 'آخر 30 يومًا' },
    /* Ce que dit la carte d'un commerçant réel (realRevSeries) : ces clés
     * manquaient, et la carte restait en français sous EN et AR. */
    "AUJOURD'HUI":           { en: 'TODAY',          ar: 'اليوم' },
    'HIER':                  { en: 'YESTERDAY',      ar: 'أمس' },
    'PÉRIODE PERSONNALISÉE': { en: 'CUSTOM PERIOD',  ar: 'فترة مخصّصة' },
    'MOIS DERNIER':          { en: 'LAST MONTH',     ar: 'الشهر الماضي' },
    'CE TRIMESTRE':          { en: 'THIS QUARTER',   ar: 'هذا الربع' },
    'CETTE ANNÉE':           { en: 'THIS YEAR',      ar: 'هذه السنة' },
    '# DERNIERS JOURS':      { en: (n) => `LAST ${n} DAYS`, ar: (n) => `آخر ${arDays(n)}` },
  };
  const REV_SUB = {
    'Cumul horaire · service en cours':      { en: 'Hourly cumulative · service in progress', ar: 'تراكم بالساعة · الخدمة جارية' },
    "Cumul horaire · journée d'hier":        { en: "Hourly cumulative · yesterday",           ar: 'تراكم بالساعة · يوم أمس' },
    'Cumul horaire · boutique ouverte':      { en: 'Hourly cumulative · shop open',           ar: 'تراكم بالساعة · المتجر مفتوح' },
    'Cumul horaire · réservations en cours': { en: 'Hourly cumulative · bookings in progress',ar: 'تراكم بالساعة · الحجوزات جارية' },
    'Total journalier · 7 derniers jours':   { en: 'Daily total · last 7 days',               ar: 'الإجمالي اليومي · آخر 7 أيام' },
    'Total journalier · 30 derniers jours':  { en: 'Daily total · last 30 days',              ar: 'الإجمالي اليومي · آخر 30 يومًا' },
    "Cumul horaire · aujourd'hui":            { en: 'Hourly cumulative · today',               ar: 'تراكم بالساعة · اليوم' },
    'Cumul horaire · hier':                   { en: 'Hourly cumulative · yesterday',           ar: 'تراكم بالساعة · أمس' },
    'Total journalier · période sélectionnée': { en: 'Daily total · selected period',          ar: 'الإجمالي اليومي · الفترة المحدّدة' },
    'Total journalier · mois dernier':        { en: 'Daily total · last month',                ar: 'الإجمالي اليومي · الشهر الماضي' },
    'Total journalier · ce trimestre':        { en: 'Daily total · this quarter',              ar: 'الإجمالي اليومي · هذا الربع' },
    'Total journalier · cette année':         { en: 'Daily total · this year',                 ar: 'الإجمالي اليومي · هذه السنة' },
    'Total journalier · # derniers jours':    { en: (n) => `Daily total · last ${n} days`,     ar: (n) => `الإجمالي اليومي · آخر ${arDays(n)}` },
  };
  // Legend prefix (the part before the " · NN MAD" amount).
  const LEGEND_PREFIX = {
    "Cumul aujourd'hui":   { en: 'Today cumulative',      ar: 'تراكم اليوم' },
    'Cumul hier':          { en: 'Yesterday cumulative',  ar: 'تراكم أمس' },
    'Cumul avant-hier':    { en: 'Day-before cumulative', ar: 'تراكم أول أمس' },
    'Total 7 jours':       { en: '7-day total',           ar: 'إجمالي 7 أيام' },
    '7 jours précédents':  { en: 'Previous 7 days',       ar: '7 أيام السابقة' },
    'Total 30 jours':      { en: '30-day total',          ar: 'إجمالي 30 يومًا' },
    '30 jours précédents': { en: 'Previous 30 days',      ar: '30 يومًا السابقة' },
    'Cumul':               { en: 'Cumulative',            ar: 'التراكم' },
    'Total # jours':       { en: (n) => `${n}-day total`,  ar: (n) => `إجمالي ${arDays(n)}` },
    '# jours précédents':  { en: (n) => `Previous ${n} days`, ar: (n) => `${arDays(n)} السابقة` },
  };

  /* ─── Benchmark · row metric labels + peer/city wording (FR captured in data) ─── */
  const BENCH_LBL = {
    'Ticket moyen':        { en: 'Average ticket',       ar: 'متوسّط التذكرة' },
    'Pourboire moyen':     { en: 'Average tip',          ar: 'متوسّط الإكرامية' },
    '% clients réguliers': { en: '% regular customers',  ar: '% الزبائن الدائمون' },
    'Marge brute %':       { en: 'Gross margin %',       ar: 'الهامش الإجمالي %' },
    'Rétention 90j':       { en: '90-day retention',     ar: 'الاحتفاظ على 90 يومًا' },
    'Tx / jour':           { en: 'Tx / day',             ar: 'معاملات / يوم' },
    'Transactions / jour': { en: 'Transactions / day',   ar: 'المعاملات / اليوم' },
    'Conversion visite':   { en: 'Visit conversion',     ar: 'تحويل الزيارة' },
    'Tx tax-free':         { en: 'Tax-free tx',          ar: 'معاملات معفاة' },
    'RDV / jour':          { en: 'Appts / day',          ar: 'مواعيد / يوم' },
    'Taux remplissage':    { en: 'Fill rate',            ar: 'نسبة الإشغال' },
    'Vélocité table':      { en: 'Table velocity',       ar: 'سرعة الطاولة' },
  };
  const BENCH_PEER = {
    fr: { restaurant: 'cafés', boutique: 'boutiques', spa: 'spas' },
    en: { restaurant: 'cafés', boutique: 'boutiques', spa: 'spas' },
    ar: { restaurant: 'مقهى',  boutique: 'متجرًا',    spa: 'منتجعًا' },
  };
  const BENCH_CITY = {
    fr: { default: 'Casablanca', spa: 'Casa / Marrakech' },
    en: { default: 'Casablanca', spa: 'Casa / Marrakech' },
    ar: { default: 'الدار البيضاء', spa: 'الدار البيضاء / مراكش' },
  };
  const BENCH_RANK_SUB = {
    fr: (total, peer, city, top) => `sur <b>${total} ${peer}</b> à ${city} · top <b>${top} %</b>`,
    en: (total, peer, city, top) => `out of <b>${total} ${peer}</b> in ${city} · top <b>${top} %</b>`,
    ar: (total, peer, city, top) => `من <b>${total} ${peer}</b> في ${city} · ضمن أفضل <b>${top} %</b>`,
  };
  const BENCH_TITLE_FALLBACK = { fr: 'Vous vs cafés similaires', en: 'You vs similar cafés', ar: 'أنتم مقابل المقاهي المماثلة' };

  /* ─── KPI customizer drawer strings ─── */
  const KC_STR = {
    fr: {
      intro: 'Choisissez les 6 indicateurs affichés en haut de votre tableau de bord. Ils s’adaptent automatiquement à la période sélectionnée.',
      counter: 'indicateurs sélectionnés',
      title: 'Personnaliser les indicateurs',
      subtitle: 'Votre tableau de bord, vos priorités',
      reset: 'Réinitialiser',
      save: 'Enregistrer la sélection',
      maxT: '6 indicateurs maximum', maxD: 'Désélectionnez-en un pour en ajouter un autre.',
      savedT: 'Indicateurs mis à jour', savedD: 'Votre sélection est enregistrée pour ce type d’établissement.',
      resetT: 'Indicateurs réinitialisés', resetD: 'Retour à la sélection par défaut.',
    },
    en: {
      intro: 'Choose the 6 indicators shown at the top of your dashboard. They adapt automatically to the selected period.',
      counter: 'indicators selected',
      title: 'Customize indicators',
      subtitle: 'Your dashboard, your priorities',
      reset: 'Reset',
      save: 'Save selection',
      maxT: '6 indicators maximum', maxD: 'Deselect one to add another.',
      savedT: 'Indicators updated', savedD: 'Your selection is saved for this venue type.',
      resetT: 'Indicators reset', resetD: 'Back to the default selection.',
    },
    ar: {
      intro: 'اختر المؤشرات الستة المعروضة أعلى لوحة التحكم. تتكيّف تلقائيًا مع الفترة المحدّدة.',
      counter: 'مؤشرات محدّدة',
      title: 'تخصيص المؤشرات',
      subtitle: 'لوحة تحكّمك، أولوياتك',
      reset: 'إعادة تعيين',
      save: 'حفظ الاختيار',
      maxT: '6 مؤشرات كحد أقصى', maxD: 'ألغِ تحديد واحد لإضافة آخر.',
      savedT: 'تم تحديث المؤشرات', savedD: 'تم حفظ اختيارك لهذا النوع من المحلات.',
      resetT: 'تمت إعادة تعيين المؤشرات', resetD: 'العودة إلى الاختيار الافتراضي.',
    },
  };
  // Heatmap-AI "set up Glovo combo" toast.
  const GLOVO_TOAST = {
    fr: { t: 'Combo Glovo · bientôt disponible', d: "Disponible quand l'intégration Glovo passe en live (Phase 2 · Kiwi Pay)." },
    en: { t: 'Glovo combo · coming soon',        d: 'Available once the Glovo integration goes live (Phase 2 · Kiwi Pay).' },
    ar: { t: 'كومبو Glovo · قريبًا',             d: 'متاح عندما يصبح تكامل Glovo مباشرًا (المرحلة 2 · Kiwi Pay).' },
  };

  /* ═══════════════ DATA TABLES ═══════════════ */

  const heroDataByVenue = installPart().heroDataByVenue;

  // Goal bar — current revenue vs target for the selected venue + range.
  const goalByVenue = {
    cafeAtlas: {
      aujourdhui:  { goal: 28000,  current: 27512.50 },
      hier:        { goal: 28000,  current: 24820   },
      septJours:   { goal: 196000, current: 198400  },
      trenteJours: { goal: 840000, current: 842300  },
      moisDernier: { goal: 781200, current: 783339  },
      trimestre:   { goal: 2520000, current: 2526900 },
      annee:       { goal: 10080000, current: 10107600 },
    },
    maisonMansour: {
      aujourdhui:  { goal: 12000,  current: 11820   },
      hier:        { goal: 12000,  current: 12110   },
      septJours:   { goal: 84000,  current: 84800   },
      trenteJours: { goal: 360000, current: 358200  },
      moisDernier: { goal: 334800, current: 333126  },
      trimestre:   { goal: 1080000, current: 1074600 },
      annee:       { goal: 4320000, current: 4298400 },
    },
    spaBahia: {
      aujourdhui:  { goal: 9000,   current: 8950    },
      hier:        { goal: 9000,   current: 8380    },
      septJours:   { goal: 63000,  current: 64200   },
      trenteJours: { goal: 270000, current: 269400  },
      moisDernier: { goal: 251100, current: 250542  },
      trimestre:   { goal: 810000, current: 808200  },
      annee:       { goal: 3240000, current: 3232800 },
    },
  };
  const GOAL_LABEL = {
    fr: { aujourdhui: 'OBJECTIF JOUR', hier: 'OBJECTIF JOUR', septJours: 'OBJECTIF SEMAINE', trenteJours: 'OBJECTIF MOIS', moisDernier: 'OBJECTIF MOIS DERNIER', trimestre: 'OBJECTIF TRIMESTRE', annee: 'OBJECTIF ANNÉE', personnalise: 'OBJECTIF PÉRIODE' },
    en: { aujourdhui: 'DAILY GOAL', hier: 'DAILY GOAL', septJours: 'WEEKLY GOAL', trenteJours: 'MONTHLY GOAL', moisDernier: 'LAST MONTH GOAL', trimestre: 'QUARTERLY GOAL', annee: 'YEARLY GOAL', personnalise: 'PERIOD GOAL' },
    ar: { aujourdhui: 'هدف اليوم', hier: 'هدف اليوم', septJours: 'هدف الأسبوع', trenteJours: 'هدف الشهر', moisDernier: 'هدف الشهر الماضي', trimestre: 'هدف الربع', annee: 'هدف السنة', personnalise: 'هدف الفترة' },
  };
  // Objectif non saisi : on le dit, on n'écrit pas « 0 MAD ».
  const GOAL_UNSET = { fr: 'à définir', en: 'not set', ar: 'غير محدد' };

  const HH_HOURS = ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'];
  const HH_RAW_BY_VENUE = {
    cafeAtlas: {
      aujourdhui:  [480,1240,1880,1340,620,480,540,920,1620,2040,1880,1480,980,620,380,220],
      hier:        [440,1160,1780,1240,580,440,500,860,1520,1840,1720,1360,920,580,340,200],
      septJours:   [380, 880,1140, 920,480,380,440,740,1320,1700,1640,1240,820,500,300,180],
      trenteJours: [360, 820,1080, 880,460,360,420,720,1280,1620,1560,1180,780,480,280,160],
    },
    // Boutique pattern: morning peak 11h-13h (tourist arrivals), midday lull,
    // evening peak 17h-20h (after-work shoppers). Closes around 20h.
    maisonMansour: {
      aujourdhui:  [1100,1380,1100, 540, 380, 540,1180,1480,1620,1380, 720, 280, 100,  20,  0,  0],
      hier:        [1140,1420,1100, 560, 400, 560,1200,1500,1640,1400, 760, 300, 120,  30,  0,  0],
      septJours:   [1080,1360,1080, 540, 380, 540,1160,1440,1580,1360, 720, 280, 110,  30,  0,  0],
      trenteJours: [1060,1340,1060, 530, 370, 530,1140,1420,1560,1340, 700, 270, 100,  20,  0,  0],
    },
    // Spa pattern: scheduled appointments throughout the day. Peaks 11-13h
    // and 15-17h. Evening tapering, closes ~22h.
    spaBahia: {
      aujourdhui:  [ 600,1100,1300, 800,1000,1300,1100, 800, 500, 300, 150,  50,  0,  0,  0,  0],
      hier:        [ 560,1040,1220, 750, 940,1220,1040, 750, 480, 280, 140,  50,  0,  0,  0,  0],
      septJours:   [ 620,1140,1340, 820,1020,1340,1140, 820, 510, 310, 160,  60,  0,  0,  0,  0],
      trenteJours: [ 600,1100,1300, 800,1000,1300,1100, 800, 500, 300, 150,  60,  0,  0,  0,  0],
    },
  };
  const HH_COVERS_BY_VENUE = {
    cafeAtlas: {
      aujourdhui:  [4,11,16,12,6,4,5,8,14,18,16,13,9,6,4,2],
      hier:        [4,10,15,11,5,4,4,7,13,16,15,12,8,5,3,2],
      septJours:   [3, 8,10, 8,5,3,4,7,12,15,14,11,7,4,3,2],
      trenteJours: [3, 7,10, 8,4,3,4,7,11,14,14,11,7,4,2,1],
    },
    maisonMansour: {
      aujourdhui:  [4, 5, 4, 2, 1, 2, 4, 5, 6, 5, 3, 1, 0, 0, 0, 0],
      hier:        [4, 5, 4, 2, 1, 2, 4, 5, 6, 6, 3, 1, 0, 0, 0, 0],
      septJours:   [3, 5, 4, 2, 1, 2, 4, 5, 6, 5, 3, 1, 0, 0, 0, 0],
      trenteJours: [3, 5, 4, 2, 1, 2, 4, 5, 6, 5, 3, 1, 0, 0, 0, 0],
    },
    spaBahia: {
      aujourdhui:  [1, 2, 3, 2, 2, 3, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0],
      hier:        [1, 2, 3, 2, 2, 3, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      septJours:   [1, 2, 3, 2, 2, 3, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0],
      trenteJours: [1, 2, 3, 2, 2, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0],
    },
  };

  const kpiByVenue = installPart().kpiByVenue;

  /* tempsTable seed — average time a covert occupies a table (restaurant)
   * or a cabin (spa). Lower is better for restaurants (faster turnover ⇒
   * more sittings per service); higher is better for spas (longer treatment
   * ⇒ higher revenue per booking). Delta convention: negative = went down.
   * Boutique has no tables → key absent → KPI excluded from its catalog. */
  const TEMPS_TABLE_SEED = {
    cafeAtlas: {
      aujourdhui:  { value: 47, unit: 'min', fmt: 'int', delta: -2.1 },
      hier:        { value: 49, unit: 'min', fmt: 'int', delta:  1.2 },
      septJours:   { value: 46, unit: 'min', fmt: 'int', delta: -3.4 },
      trenteJours: { value: 47, unit: 'min', fmt: 'int', delta: -1.8 },
      moisDernier: { value: 48, unit: 'min', fmt: 'int', delta:  0.4 },
      trimestre:   { value: 47, unit: 'min', fmt: 'int', delta: -2.3 },
      annee:       { value: 46, unit: 'min', fmt: 'int', delta: -4.1 },
    },
    spaBahia: {
      aujourdhui:  { value: 62, unit: 'min', fmt: 'int', delta:  3.8 },
      hier:        { value: 58, unit: 'min', fmt: 'int', delta:  1.4 },
      septJours:   { value: 60, unit: 'min', fmt: 'int', delta:  4.2 },
      trenteJours: { value: 59, unit: 'min', fmt: 'int', delta:  2.6 },
      moisDernier: { value: 57, unit: 'min', fmt: 'int', delta:  1.1 },
      trimestre:   { value: 58, unit: 'min', fmt: 'int', delta:  3.0 },
      annee:       { value: 56, unit: 'min', fmt: 'int', delta:  2.2 },
    },
  };
  Object.keys(TEMPS_TABLE_SEED).forEach((v) => {
    const venueData = kpiByVenue[v]; if (!venueData) return;
    Object.keys(TEMPS_TABLE_SEED[v]).forEach((period) => {
      if (venueData[period]) venueData[period].tempsTable = TEMPS_TABLE_SEED[v][period];
    });
  });

  const revChartByVenue = installPart().revChartByVenue;

  const mixByVenue = {
    cafeAtlas: {
      aujourdhui:  { visa: 48, mc: 24, tap: 18, qr: 10, centerMad: 16590,  fee: '288,50 MAD · 1,19 %' },
      hier:        { visa: 50, mc: 23, tap: 17, qr: 10, centerMad: 14920,  fee: '264,80 MAD · 1,19 %' },
      septJours:   { visa: 47, mc: 25, tap: 19, qr:  9, centerMad: 134700, fee: '2 230 MAD · 1,19 %' },
      trenteJours: { visa: 46, mc: 26, tap: 19, qr:  9, centerMad: 568200, fee: '9 480 MAD · 1,19 %' },
      personnalise: null,
    },
    maisonMansour: {
      aujourdhui:  { visa: 52, mc: 28, tap: 12, qr: 8, centerMad: 6150,   fee: '141 MAD · 1,19 %' },
      hier:        { visa: 51, mc: 29, tap: 12, qr: 8, centerMad: 6175,   fee: '144 MAD · 1,19 %' },
      septJours:   { visa: 53, mc: 27, tap: 12, qr: 8, centerMad: 44944,  fee: '1 010 MAD · 1,19 %' },
      trenteJours: { visa: 52, mc: 28, tap: 12, qr: 8, centerMad: 186264, fee: '4 260 MAD · 1,19 %' },
      personnalise: null,
    },
    spaBahia: {
      aujourdhui:  { visa: 58, mc: 30, tap: 8, qr: 4, centerMad: 5191,   fee: '107 MAD · 1,19 %' },
      hier:        { visa: 57, mc: 31, tap: 8, qr: 4, centerMad: 4777,   fee: '100 MAD · 1,19 %' },
      septJours:   { visa: 59, mc: 29, tap: 8, qr: 4, centerMad: 37878,  fee: '764 MAD · 1,19 %' },
      trenteJours: { visa: 58, mc: 30, tap: 8, qr: 4, centerMad: 156252, fee: '3 206 MAD · 1,19 %' },
      personnalise: null,
    },
  };

  // Live feed: 6 transactions per venue per range
  const FEED_BY_VENUE = {
    cafeAtlas: {
    aujourdhui: [
      { t: '14:37', method: 'visa', primary: 'Visa •• 4291',   sub: 'Carte marocaine · Attijariwafa', flag: 'ma', ctx: 'Karim B. · T4',     amt: '240,00',  tip: '+24,00', neg: false, isNew: true },
      { t: '14:32', method: 'tap',  primary: 'Kiwi Tap',        sub: 'Client #3412 · Kiwi Wallet',     flag: 'ma', ctx: 'Client #3412 · T7',amt: '180,00',  tip: '·',       neg: false },
      { t: '14:18', method: 'mc',   primary: 'Mastercard •• 7820', sub: 'Carte française · BNP Paribas', flag: 'fr', ctx: 'Sara L. · T2',  amt: '85,50',   tip: '+8,55',  neg: false },
      { t: '14:03', method: 'qr',   primary: 'Kiwi Wallet QR',  sub: 'Nawal K. · abonnée',             flag: 'ma', ctx: 'Nawal K. · T6',    amt: '62,00',   tip: '·',       neg: false },
      { t: '13:57', method: 'visa', primary: 'Visa •• 0043',   sub: 'Carte espagnole · CaixaBank',    flag: 'es', ctx: 'Youssef A. · T1',  amt: '312,00',  tip: '+30,00', neg: false },
      { t: '13:41', method: 'mc',   primary: 'Mastercard •• 1209', sub: 'Remboursement · CMI',         flag: 'ma', ctx: 'Hassan J. · T3',   amt: '−155,00', tip: '·',       neg: true },
    ],
    hier: [
      { t: '22:48', method: 'visa', primary: 'Visa •• 8841',   sub: 'Carte marocaine · BMCE',         flag: 'ma', ctx: 'Imane S. · T5',    amt: '276,00',  tip: '+27,60', neg: false },
      { t: '22:14', method: 'tap',  primary: 'Kiwi Tap',        sub: 'Client #3287 · contactless',     flag: 'ma', ctx: 'Client #3287 · T8',amt: '142,00',  tip: '·',       neg: false },
      { t: '21:52', method: 'mc',   primary: 'Mastercard •• 4509', sub: 'Carte française · LCL',      flag: 'fr', ctx: 'Pierre D. · T2',   amt: '198,50',  tip: '+19,85', neg: false },
      { t: '21:18', method: 'qr',   primary: 'Kiwi Wallet QR',  sub: 'Mehdi C. · régulier',            flag: 'ma', ctx: 'Mehdi C. · T6',    amt: '88,00',   tip: '·',       neg: false },
      { t: '20:42', method: 'visa', primary: 'Visa •• 6612',   sub: 'Carte américaine · Chase',       flag: 'us', ctx: 'Diana K. · T1',    amt: '384,00',  tip: '+38,40', neg: false },
      { t: '20:09', method: 'mc',   primary: 'Mastercard •• 8830', sub: 'Carte marocaine · CIH',      flag: 'ma', ctx: 'Anas L. · T3',     amt: '124,00',  tip: '+12,40', neg: false },
    ],
    septJours: [
      { t: 'Ven 23', method: 'visa', primary: 'Visa •• 2914',  sub: 'Top transaction de la semaine', flag: 'fr', ctx: 'Nicolas R. · T4', amt: '1 240,00', tip: '+124,00', neg: false },
      { t: 'Jeu 22', method: 'qr',   primary: 'Kiwi Wallet QR', sub: 'Soirée d\'anniversaire',        flag: 'ma', ctx: 'Hicham B. · T8', amt: '684,00',   tip: '+50,00',  neg: false },
      { t: 'Mer 21', method: 'mc',   primary: 'Mastercard •• 1456', sub: 'Carte espagnole · Sabadell', flag: 'es', ctx: 'Lucia G. · T2', amt: '420,00',   tip: '+42,00',  neg: false },
      { t: 'Mar 20', method: 'tap',  primary: 'Kiwi Tap',       sub: 'Service midi · Tap',            flag: 'ma', ctx: 'Client #2945 · T6', amt: '208,00', tip: '·',       neg: false },
      { t: 'Lun 19', method: 'visa', primary: 'Visa •• 7740',  sub: 'Carte marocaine · BMCE',        flag: 'ma', ctx: 'Salma F. · T1',  amt: '162,00',   tip: '+16,20',  neg: false },
      { t: 'Dim 18', method: 'mc',   primary: 'Mastercard •• 3308', sub: 'Annulation client',         flag: 'ma', ctx: 'Khalid A. · T3', amt: '−240,00',  tip: '·',       neg: true },
    ],
    trenteJours: [
      { t: 'S22 J1', method: 'visa', primary: 'Visa •• 0921',  sub: 'Réservation groupe · 12 couverts', flag: 'ma', ctx: 'Mariage Bensouda · T1-T4', amt: '4 280,00', tip: '+428,00', neg: false },
      { t: 'S21 J3', method: 'qr',   primary: 'Kiwi Wallet QR', sub: 'Soirée privée',                   flag: 'ma', ctx: 'Wissam · T7', amt: '1 920,00', tip: '+150,00', neg: false },
      { t: 'S20 J5', method: 'mc',   primary: 'Mastercard •• 6612', sub: 'Carte française · BNP',     flag: 'fr', ctx: 'Sophie M. · T2', amt: '780,00', tip: '+78,00', neg: false },
      { t: 'S19 J6', method: 'visa', primary: 'Visa •• 5544',  sub: 'Carte espagnole · La Caixa',    flag: 'es', ctx: 'Manuel V. · T5', amt: '512,00', tip: '+50,00', neg: false },
      { t: 'S18 J2', method: 'tap',  primary: 'Kiwi Tap',       sub: 'Pic samedi · service du soir',  flag: 'ma', ctx: 'Client #1882 · T8', amt: '342,00', tip: '·',     neg: false },
      { t: 'S17 J4', method: 'mc',   primary: 'Mastercard •• 9982', sub: 'Reversement Glovo',         flag: 'ma', ctx: 'Réconciliation', amt: '−380,00', tip: '·', neg: true },
    ],
    },
    maisonMansour: {
      aujourdhui: [
        { t: '14:38', method: 'visa', primary: 'Visa •• 5821',     sub: 'Carte allemande · Sparkasse', flag: 'fr', ctx: 'Anna M. · Caftan brodé',   amt: '1 890,00', tip: '·', neg: false, isNew: true },
        { t: '14:14', method: 'mc',   primary: 'Mastercard •• 7714', sub: 'Carte française · LCL',     flag: 'fr', ctx: 'Sophie L. · Babouches',    amt: '450,00',   tip: '·', neg: false },
        { t: '13:42', method: 'tap',  primary: 'Kiwi Tap',          sub: 'Client #4521 · Kiwi Wallet', flag: 'ma', ctx: 'Client #4521 · Coussin',   amt: '240,00',   tip: '·', neg: false },
        { t: '13:18', method: 'visa', primary: 'Visa •• 0987',     sub: 'Carte espagnole · BBVA',     flag: 'es', ctx: 'Carmen R. · Théière',      amt: '680,00',   tip: '·', neg: false },
        { t: '12:54', method: 'mc',   primary: 'Mastercard •• 3344', sub: 'Carte américaine · Chase',  flag: 'us', ctx: 'Karen B. · Tapis berbère', amt: '3 200,00', tip: '·', neg: false },
        { t: '12:21', method: 'mc',   primary: 'Mastercard •• 8830', sub: 'Retour boutique · CIH',    flag: 'ma', ctx: 'Hassan J. · Babouches',    amt: '−450,00',  tip: '·', neg: true },
      ],
      hier: [
        { t: '19:52', method: 'visa', primary: 'Visa •• 4421',     sub: 'Carte française · BNP',      flag: 'fr', ctx: 'Camille D. · Caftan',      amt: '1 890,00', tip: '·', neg: false },
        { t: '19:18', method: 'tap',  primary: 'Kiwi Tap',          sub: 'Client #4488 · contactless', flag: 'ma', ctx: 'Client #4488 · Théière',   amt: '680,00',   tip: '·', neg: false },
        { t: '18:46', method: 'mc',   primary: 'Mastercard •• 2298', sub: 'Carte espagnole · Sabadell',flag: 'es', ctx: 'Marta G. · Coussin',       amt: '240,00',   tip: '·', neg: false },
        { t: '18:14', method: 'visa', primary: 'Visa •• 6643',     sub: 'Carte américaine · Citi',    flag: 'us', ctx: 'David W. · Tapis',          amt: '3 200,00', tip: '·', neg: false },
        { t: '17:32', method: 'mc',   primary: 'Mastercard •• 5512', sub: 'Carte marocaine · BMCE',    flag: 'ma', ctx: 'Yasmine F. · Lampe',       amt: '920,00',   tip: '·', neg: false },
        { t: '16:48', method: 'visa', primary: 'Visa •• 8801',     sub: 'Carte française · Crédit Agricole', flag: 'fr', ctx: 'Léa M. · Babouches', amt: '450,00',   tip: '·', neg: false },
      ],
      septJours: [
        { t: 'Ven 23', method: 'mc',   primary: 'Mastercard •• 1144', sub: 'Top transaction de la semaine', flag: 'us', ctx: 'Karen B. · Tapis berbère', amt: '3 200,00', tip: '·', neg: false },
        { t: 'Jeu 22', method: 'visa', primary: 'Visa •• 5821',      sub: 'Tax-free · Allemagne',          flag: 'fr', ctx: 'Anna M. · Caftan brodé',   amt: '1 890,00', tip: '·', neg: false },
        { t: 'Mer 21', method: 'visa', primary: 'Visa •• 0987',      sub: 'Carte espagnole · BBVA',        flag: 'es', ctx: 'Carmen R. · Théière',      amt: '680,00',   tip: '·', neg: false },
        { t: 'Mar 20', method: 'mc',   primary: 'Mastercard •• 7714', sub: 'Carte française · LCL',         flag: 'fr', ctx: 'Sophie L. · Babouches',    amt: '450,00',   tip: '·', neg: false },
        { t: 'Lun 19', method: 'tap',  primary: 'Kiwi Tap',           sub: 'Client #4521 · contactless',    flag: 'ma', ctx: 'Client #4521 · Coussin',   amt: '240,00',   tip: '·', neg: false },
        { t: 'Dim 18', method: 'mc',   primary: 'Mastercard •• 8830', sub: 'Retour boutique · CIH',         flag: 'ma', ctx: 'Hassan J. · Babouches',    amt: '−450,00',  tip: '·', neg: true },
      ],
      trenteJours: [
        { t: 'S22 J3', method: 'visa', primary: 'Visa •• 9912',     sub: 'Caftans haut de gamme · paire',   flag: 'fr', ctx: 'Marion K. · 2 caftans',    amt: '3 780,00', tip: '·', neg: false },
        { t: 'S20 J5', method: 'mc',   primary: 'Mastercard •• 1144', sub: 'Tapis premium · Berbère',       flag: 'us', ctx: 'Karen B. · Tapis',          amt: '3 200,00', tip: '·', neg: false },
        { t: 'S19 J2', method: 'visa', primary: 'Visa •• 5821',     sub: 'Caftan brodé Tax-free',          flag: 'fr', ctx: 'Anna M.',                   amt: '1 890,00', tip: '·', neg: false },
        { t: 'S18 J6', method: 'tap',  primary: 'Kiwi Tap',          sub: 'Lampe artisanale · cliente VIP', flag: 'ma', ctx: 'Salma O. · Lampe',          amt: '920,00',   tip: '·', neg: false },
        { t: 'S17 J4', method: 'visa', primary: 'Visa •• 0987',     sub: 'Théière argentée',               flag: 'es', ctx: 'Carmen R.',                 amt: '680,00',   tip: '·', neg: false },
        { t: 'S16 J1', method: 'mc',   primary: 'Mastercard •• 4477', sub: 'Échange · taille différente',   flag: 'ma', ctx: 'Hicham B. · Caftan',        amt: '−1 890,00',tip: '·', neg: true },
      ],
    },
    spaBahia: {
      aujourdhui: [
        { t: '14:30', method: 'visa', primary: 'Visa •• 7741',     sub: 'Carte marocaine · Attijariwafa', flag: 'ma', ctx: 'Fatima B. · Forfait Argan',       amt: '850,00', tip: '+85,00', neg: false, isNew: true },
        { t: '14:00', method: 'mc',   primary: 'Mastercard •• 3329', sub: 'Carte française · BNP',         flag: 'fr', ctx: 'Sara K. · Massage 60min',         amt: '550,00', tip: '+55,00', neg: false },
        { t: '13:30', method: 'visa', primary: 'Visa •• 1102',     sub: 'Carte marocaine · BMCE',         flag: 'ma', ctx: 'Karim L. · Hammam',                amt: '350,00', tip: '+35,00', neg: false },
        { t: '13:00', method: 'visa', primary: 'Visa •• 8826',     sub: 'Carte espagnole · La Caixa',     flag: 'es', ctx: 'Imane S. · Soin du visage',        amt: '650,00', tip: '+65,00', neg: false },
        { t: '12:30', method: 'mc',   primary: 'Mastercard •• 5530', sub: 'Carte marocaine · CIH',          flag: 'ma', ctx: 'Nadia M. · Gommage corps',         amt: '400,00', tip: '+40,00', neg: false },
        { t: '12:00', method: 'visa', primary: 'Visa •• 4408',     sub: 'Carte marocaine · CFG',          flag: 'ma', ctx: 'Yasmine T. · Forfait Argan',       amt: '850,00', tip: '+90,00', neg: false },
      ],
      hier: [
        { t: '18:42', method: 'visa', primary: 'Visa •• 9912',     sub: 'Carte américaine · Wells Fargo', flag: 'us', ctx: 'Lisa P. · Forfait Argan',         amt: '850,00', tip: '+100,00', neg: false },
        { t: '17:50', method: 'mc',   primary: 'Mastercard •• 6611', sub: 'Carte française · LCL',         flag: 'fr', ctx: 'Camille R. · Massage 60min',       amt: '550,00', tip: '+50,00',  neg: false },
        { t: '16:24', method: 'visa', primary: 'Visa •• 2230',     sub: 'Carte marocaine · BCP',          flag: 'ma', ctx: 'Lina C. · Soin du visage',         amt: '650,00', tip: '+65,00',  neg: false },
        { t: '15:08', method: 'visa', primary: 'Visa •• 7720',     sub: 'Carte marocaine · Attijari',     flag: 'ma', ctx: 'Khadija R. · Hammam',              amt: '350,00', tip: '+35,00',  neg: false },
        { t: '14:32', method: 'mc',   primary: 'Mastercard •• 1145', sub: 'Carte espagnole · Santander',   flag: 'es', ctx: 'Lucia M. · Gommage corps',         amt: '400,00', tip: '+40,00',  neg: false },
        { t: '11:46', method: 'visa', primary: 'Visa •• 9933',     sub: 'Carte marocaine · BMCE',         flag: 'ma', ctx: 'Sofia A. · Modelage pieds',        amt: '280,00', tip: '+30,00',  neg: false },
      ],
      septJours: [
        { t: 'Ven 23', method: 'visa', primary: 'Visa •• 4408',     sub: 'Top forfait de la semaine',       flag: 'ma', ctx: 'Yasmine T. · Forfait Argan',       amt: '850,00', tip: '+100,00', neg: false },
        { t: 'Jeu 22', method: 'mc',   primary: 'Mastercard •• 1145', sub: 'Carte espagnole · Santander',   flag: 'es', ctx: 'Lucia M. · Massage 60min + Hammam', amt: '900,00', tip: '+90,00',  neg: false },
        { t: 'Mer 21', method: 'visa', primary: 'Visa •• 9912',     sub: 'Cliente VIP · 3e visite',         flag: 'us', ctx: 'Lisa P. · Forfait Argan',         amt: '850,00', tip: '+100,00', neg: false },
        { t: 'Mar 20', method: 'visa', primary: 'Visa •• 8826',     sub: 'Soin du visage premium',          flag: 'es', ctx: 'Imane S.',                        amt: '650,00', tip: '+65,00',  neg: false },
        { t: 'Lun 19', method: 'mc',   primary: 'Mastercard •• 5530', sub: 'Gommage corps complet',         flag: 'ma', ctx: 'Nadia M.',                        amt: '400,00', tip: '+40,00',  neg: false },
        { t: 'Dim 18', method: 'visa', primary: 'Visa •• 1102',     sub: 'Hammam traditionnel',             flag: 'ma', ctx: 'Karim L.',                        amt: '350,00', tip: '+35,00',  neg: false },
      ],
      trenteJours: [
        { t: 'S22 J6', method: 'visa', primary: 'Visa •• 9912',     sub: 'Forfait premium · cliente fidèle', flag: 'us', ctx: 'Lisa P. · Forfait Argan x2',     amt: '1 700,00', tip: '+200,00', neg: false },
        { t: 'S21 J3', method: 'mc',   primary: 'Mastercard •• 1145', sub: 'Carte espagnole · Santander',    flag: 'es', ctx: 'Lucia M. · Soirée détente',      amt: '1 200,00', tip: '+120,00', neg: false },
        { t: 'S20 J1', method: 'visa', primary: 'Visa •• 4408',     sub: 'Forfait Argan · cliente VIP',     flag: 'ma', ctx: 'Yasmine T.',                     amt: '850,00',   tip: '+100,00', neg: false },
        { t: 'S19 J5', method: 'mc',   primary: 'Mastercard •• 3329', sub: 'Massage couple',                 flag: 'fr', ctx: 'Camille & Pierre R.',           amt: '1 100,00', tip: '+110,00', neg: false },
        { t: 'S18 J2', method: 'visa', primary: 'Visa •• 8826',     sub: 'Soin visage premium',             flag: 'es', ctx: 'Imane S.',                       amt: '650,00',   tip: '+65,00',  neg: false },
        { t: 'S17 J4', method: 'mc',   primary: 'Mastercard •• 8821', sub: 'Annulation rendez-vous',         flag: 'ma', ctx: 'Anonyme',                        amt: '−550,00',  tip: '·',       neg: true },
      ],
    },
  };

  const settleByVenue = {
    cafeAtlas: {
      aujourdhui:  { lbl: 'PROCHAIN RÈGLEMENT',    amt: 23091,  sub: 'Arrive demain matin à 9 h 00 sur votre IBAN Bank of Africa •• 3291.', detailVal: '−289 MAD' },
      hier:        { lbl: 'RÈGLEMENT REÇU',         amt: 20640,  sub: 'Crédité ce matin à 9 h 02 sur votre IBAN Bank of Africa •• 3291.',     detailVal: '−248 MAD' },
      septJours:   { lbl: 'RÉGLÉ SUR 7 JOURS',      amt: 165280, sub: '7 règlements T+1 cumulés sur la semaine.',                    detailVal: '−2 230 MAD' },
      trenteJours: { lbl: 'RÉGLÉ SUR 30 JOURS',     amt: 702800, sub: '30 règlements T+1 cumulés sur le mois.',                       detailVal: '−9 480 MAD' },
    },
    maisonMansour: {
      aujourdhui:  { lbl: 'PROCHAIN RÈGLEMENT',    amt: 9920,   sub: 'Arrive demain matin à 9 h 00 sur votre IBAN Bank of Africa •• 8842.', detailVal: '−146 MAD' },
      hier:        { lbl: 'RÈGLEMENT REÇU',         amt: 10170,  sub: 'Crédité ce matin à 9 h 02 sur votre IBAN Bank of Africa •• 8842.',     detailVal: '−149 MAD' },
      septJours:   { lbl: 'RÉGLÉ SUR 7 JOURS',      amt: 71200,  sub: '7 règlements T+1 cumulés sur la semaine.',                    detailVal: '−1 020 MAD' },
      trenteJours: { lbl: 'RÉGLÉ SUR 30 JOURS',     amt: 300700, sub: '30 règlements T+1 cumulés sur le mois.',                       detailVal: '−4 280 MAD' },
    },
    spaBahia: {
      aujourdhui:  { lbl: 'PROCHAIN RÈGLEMENT',    amt: 7510,   sub: 'Arrive demain matin à 9 h 00 sur votre IBAN Bank of Africa •• 4416.', detailVal: '−108 MAD' },
      hier:        { lbl: 'RÈGLEMENT REÇU',         amt: 7035,   sub: 'Crédité ce matin à 9 h 02 sur votre IBAN Bank of Africa •• 4416.',     detailVal: '−105 MAD' },
      septJours:   { lbl: 'RÉGLÉ SUR 7 JOURS',      amt: 53890,  sub: '7 règlements T+1 cumulés sur la semaine.',                    detailVal: '−770 MAD' },
      trenteJours: { lbl: 'RÉGLÉ SUR 30 JOURS',     amt: 226300, sub: '30 règlements T+1 cumulés sur le mois.',                       detailVal: '−3 240 MAD' },
    },
  };
  const SETTLE_LBL = {
    fr: { aujourdhui: 'PROCHAIN RÈGLEMENT', hier: 'RÈGLEMENT REÇU', septJours: 'RÉGLÉ SUR 7 JOURS', trenteJours: 'RÉGLÉ SUR 30 JOURS', moisDernier: 'RÉGLÉ LE MOIS DERNIER', trimestre: 'RÉGLÉ SUR LE TRIMESTRE', annee: "RÉGLÉ SUR L'ANNÉE", personnalise: 'PROCHAIN RÈGLEMENT' },
    en: { aujourdhui: 'NEXT SETTLEMENT', hier: 'SETTLEMENT RECEIVED', septJours: 'SETTLED OVER 7 DAYS', trenteJours: 'SETTLED OVER 30 DAYS', moisDernier: 'SETTLED LAST MONTH', trimestre: 'SETTLED OVER QUARTER', annee: 'SETTLED OVER YEAR', personnalise: 'NEXT SETTLEMENT' },
    ar: { aujourdhui: 'التسوية القادمة', hier: 'تسوية مستلمة', septJours: 'مسوّى على 7 أيام', trenteJours: 'مسوّى على 30 يومًا', moisDernier: 'مسوّى في الشهر الماضي', trimestre: 'مسوّى خلال الربع', annee: 'مسوّى خلال السنة', personnalise: 'التسوية القادمة' },
  };
  const SETTLE_DETAIL_LBL = { fr: 'Commission Kiwi déduite', en: 'Kiwi commission deducted', ar: 'عمولة كيوي مخصومة' };

  const timelineWeekTotalByVenue = {
    cafeAtlas: {
      aujourdhui:  '~ 172 100 MAD',
      hier:        '~ 165 800 MAD',
      septJours:   '~ 198 400 MAD',
      trenteJours: '~ 842 300 MAD',
    },
    maisonMansour: {
      aujourdhui:  '~ 78 600 MAD',
      hier:        '~ 76 200 MAD',
      septJours:   '~ 84 800 MAD',
      trenteJours: '~ 358 200 MAD',
    },
    spaBahia: {
      aujourdhui:  '~ 60 800 MAD',
      hier:        '~ 58 200 MAD',
      septJours:   '~ 64 200 MAD',
      trenteJours: '~ 269 400 MAD',
    },
  };

  const healthByVenue = {
    cafeAtlas: {
      aujourdhui:  { score: 91, chip: 'EXCELLENT', chipKey: 'excellent' },
      hier:        { score: 90, chip: 'EXCELLENT', chipKey: 'excellent' },
      septJours:   { score: 89, chip: 'TRÈS BON',  chipKey: 'verygood' },
      trenteJours: { score: 88, chip: 'TRÈS BON',  chipKey: 'verygood' },
    },
    maisonMansour: {
      aujourdhui:  { score: 88, chip: 'TRÈS BON',  chipKey: 'verygood' },
      hier:        { score: 87, chip: 'TRÈS BON',  chipKey: 'verygood' },
      septJours:   { score: 86, chip: 'TRÈS BON',  chipKey: 'verygood' },
      trenteJours: { score: 85, chip: 'TRÈS BON',  chipKey: 'verygood' },
    },
    spaBahia: {
      aujourdhui:  { score: 93, chip: 'EXCELLENT', chipKey: 'excellent' },
      hier:        { score: 92, chip: 'EXCELLENT', chipKey: 'excellent' },
      septJours:   { score: 91, chip: 'EXCELLENT', chipKey: 'excellent' },
      trenteJours: { score: 90, chip: 'EXCELLENT', chipKey: 'excellent' },
    },
  };
  const HEALTH_CHIP = {
    fr: { excellent: 'EXCELLENT', verygood: 'TRÈS BON' },
    en: { excellent: 'EXCELLENT', verygood: 'VERY GOOD' },
    ar: { excellent: 'ممتاز', verygood: 'جيّد جدًا' },
  };

  const benchByVenue = {
    cafeAtlas: {
      aujourdhui: {
        rank: 12, total: 147, top: 8,
        rows: [
          { lbl: 'Ticket moyen',       you: 74, peer: 58, v: '+16 MAD',   pos: true },
          { lbl: 'Transactions / jour',you: 82, peer: 62, v: '+34',       pos: true },
          { lbl: '% clients réguliers',you: 68, peer: 55, v: '+7 pts',    pos: true },
          { lbl: 'Pourboire moyen',    you: 55, peer: 58, v: '−0,4 pts',  pos: false, warn: true },
          { lbl: 'Vélocité table',     you: 71, peer: 60, v: '+12 %',     pos: true },
        ],
      },
      hier: {
        rank: 14, total: 147, top: 9,
        rows: [
          { lbl: 'Ticket moyen',       you: 71, peer: 58, v: '+13 MAD',   pos: true },
          { lbl: 'Transactions / jour',you: 78, peer: 62, v: '+28',       pos: true },
          { lbl: '% clients réguliers',you: 66, peer: 55, v: '+6 pts',    pos: true },
          { lbl: 'Pourboire moyen',    you: 53, peer: 58, v: '−0,6 pts',  pos: false, warn: true },
          { lbl: 'Vélocité table',     you: 69, peer: 60, v: '+9 %',      pos: true },
        ],
      },
      septJours: {
        rank: 11, total: 147, top: 7,
        rows: [
          { lbl: 'Ticket moyen',       you: 76, peer: 58, v: '+18 MAD',   pos: true },
          { lbl: 'Transactions / jour',you: 84, peer: 62, v: '+42',       pos: true },
          { lbl: '% clients réguliers',you: 70, peer: 55, v: '+9 pts',    pos: true },
          { lbl: 'Pourboire moyen',    you: 56, peer: 58, v: '−0,3 pts',  pos: false, warn: true },
          { lbl: 'Vélocité table',     you: 73, peer: 60, v: '+14 %',     pos: true },
        ],
      },
      trenteJours: {
        rank: 9, total: 147, top: 6,
        rows: [
          { lbl: 'Ticket moyen',       you: 78, peer: 58, v: '+22 MAD',   pos: true },
          { lbl: 'Transactions / jour',you: 86, peer: 62, v: '+58',       pos: true },
          { lbl: '% clients réguliers',you: 72, peer: 55, v: '+11 pts',   pos: true },
          { lbl: 'Pourboire moyen',    you: 58, peer: 58, v: '0 pt',      pos: true },
          { lbl: 'Vélocité table',     you: 75, peer: 60, v: '+18 %',     pos: true },
        ],
      },
    },
    maisonMansour: {
      aujourdhui: {
        rank: 8, total: 89, top: 9,
        rows: [
          { lbl: 'Ticket moyen',         you: 76, peer: 60, v: '+34 MAD', pos: true },
          { lbl: 'Tx / jour',            you: 64, peer: 50, v: '+8',      pos: true },
          { lbl: 'Conversion visite',    you: 71, peer: 58, v: '+8 pts',  pos: true },
          { lbl: 'Tx tax-free',          you: 48, peer: 60, v: '−12 pts', pos: false, warn: true },
          { lbl: 'Marge brute %',        you: 78, peer: 64, v: '+10 pts', pos: true },
        ],
      },
      hier: {
        rank: 9, total: 89, top: 10,
        rows: [
          { lbl: 'Ticket moyen',         you: 75, peer: 60, v: '+32 MAD', pos: true },
          { lbl: 'Tx / jour',            you: 65, peer: 50, v: '+10',     pos: true },
          { lbl: 'Conversion visite',    you: 70, peer: 58, v: '+7 pts',  pos: true },
          { lbl: 'Tx tax-free',          you: 47, peer: 60, v: '−13 pts', pos: false, warn: true },
          { lbl: 'Marge brute %',        you: 77, peer: 64, v: '+9 pts',  pos: true },
        ],
      },
      septJours: {
        rank: 7, total: 89, top: 8,
        rows: [
          { lbl: 'Ticket moyen',         you: 77, peer: 60, v: '+36 MAD', pos: true },
          { lbl: 'Tx / jour',            you: 66, peer: 50, v: '+12',     pos: true },
          { lbl: 'Conversion visite',    you: 73, peer: 58, v: '+10 pts', pos: true },
          { lbl: 'Tx tax-free',          you: 49, peer: 60, v: '−11 pts', pos: false, warn: true },
          { lbl: 'Marge brute %',        you: 79, peer: 64, v: '+11 pts', pos: true },
        ],
      },
      trenteJours: {
        rank: 6, total: 89, top: 7,
        rows: [
          { lbl: 'Ticket moyen',         you: 80, peer: 60, v: '+40 MAD', pos: true },
          { lbl: 'Tx / jour',            you: 68, peer: 50, v: '+15',     pos: true },
          { lbl: 'Conversion visite',    you: 74, peer: 58, v: '+11 pts', pos: true },
          { lbl: 'Tx tax-free',          you: 51, peer: 60, v: '−9 pts',  pos: false, warn: true },
          { lbl: 'Marge brute %',        you: 81, peer: 64, v: '+13 pts', pos: true },
        ],
      },
    },
    spaBahia: {
      aujourdhui: {
        rank: 4, total: 42, top: 9,
        rows: [
          { lbl: 'Ticket moyen',         you: 82, peer: 65, v: '+58 MAD', pos: true },
          { lbl: 'Taux remplissage',     you: 78, peer: 64, v: '+12 pts', pos: true },
          { lbl: 'RDV / jour',           you: 68, peer: 56, v: '+5',      pos: true },
          { lbl: 'Pourboire moyen',      you: 62, peer: 50, v: '+3 pts',  pos: true },
          { lbl: 'Rétention 90j',        you: 71, peer: 58, v: '+13 pts', pos: true },
        ],
      },
      hier: {
        rank: 5, total: 42, top: 11,
        rows: [
          { lbl: 'Ticket moyen',         you: 83, peer: 65, v: '+62 MAD', pos: true },
          { lbl: 'Taux remplissage',     you: 75, peer: 64, v: '+9 pts',  pos: true },
          { lbl: 'RDV / jour',           you: 64, peer: 56, v: '+3',      pos: true },
          { lbl: 'Pourboire moyen',      you: 60, peer: 50, v: '+2 pts',  pos: true },
          { lbl: 'Rétention 90j',        you: 70, peer: 58, v: '+12 pts', pos: true },
        ],
      },
      septJours: {
        rank: 3, total: 42, top: 7,
        rows: [
          { lbl: 'Ticket moyen',         you: 84, peer: 65, v: '+64 MAD', pos: true },
          { lbl: 'Taux remplissage',     you: 80, peer: 64, v: '+14 pts', pos: true },
          { lbl: 'RDV / jour',           you: 70, peer: 56, v: '+6',      pos: true },
          { lbl: 'Pourboire moyen',      you: 64, peer: 50, v: '+4 pts',  pos: true },
          { lbl: 'Rétention 90j',        you: 73, peer: 58, v: '+15 pts', pos: true },
        ],
      },
      trenteJours: {
        rank: 2, total: 42, top: 5,
        rows: [
          { lbl: 'Ticket moyen',         you: 86, peer: 65, v: '+68 MAD', pos: true },
          { lbl: 'Taux remplissage',     you: 82, peer: 64, v: '+16 pts', pos: true },
          { lbl: 'RDV / jour',           you: 72, peer: 56, v: '+8',      pos: true },
          { lbl: 'Pourboire moyen',      you: 66, peer: 50, v: '+5 pts',  pos: true },
          { lbl: 'Rétention 90j',        you: 75, peer: 58, v: '+17 pts', pos: true },
        ],
      },
    },
  };

  const productsByVenue = {
    cafeAtlas: {
      aujourdhui: [
        { rank: '#1', name: 'Tajine kefta œuf',    sub: '28 portions · 85 MAD chacune', bar: 100, sales: '2 380' },
        { rank: '#2', name: 'Thé à la menthe',     sub: '94 verres · 12 MAD',           bar: 68,  sales: '1 128' },
        { rank: '#3', name: 'Msemen beurre & miel',sub: '62 · 12 MAD',                   bar: 44,  sales: '744' },
        { rank: '#4', name: 'Orange pressée',      sub: '34 · 18 MAD',                   bar: 36,  sales: '612' },
        { rank: '#5', name: 'Couscous végétarien', sub: '11 · 45 MAD',                   bar: 29,  sales: '495' },
        { rank: '#6', name: 'Salade marocaine',    sub: '13 · 32 MAD',                   bar: 25,  sales: '416' },
      ],
      hier: [
        { rank: '#1', name: 'Tajine kefta œuf',    sub: '24 portions · 85 MAD',          bar: 100, sales: '2 040' },
        { rank: '#2', name: 'Thé à la menthe',     sub: '88 verres · 12 MAD',            bar: 70,  sales: '1 056' },
        { rank: '#3', name: 'Msemen beurre & miel',sub: '54 · 12 MAD',                   bar: 41,  sales: '648' },
        { rank: '#4', name: 'Orange pressée',      sub: '32 · 18 MAD',                   bar: 36,  sales: '576' },
        { rank: '#5', name: 'Couscous végétarien', sub: '9 · 45 MAD',                    bar: 25,  sales: '405' },
        { rank: '#6', name: 'Salade marocaine',    sub: '11 · 32 MAD',                   bar: 22,  sales: '352' },
      ],
      septJours: [
        { rank: '#1', name: 'Tajine kefta œuf',     sub: '198 portions · 85 MAD',         bar: 100, sales: '16 830' },
        { rank: '#2', name: 'Thé à la menthe',      sub: '648 verres · 12 MAD',           bar: 71,  sales: '7 776' },
        { rank: '#3', name: 'Msemen beurre & miel', sub: '432 · 12 MAD',                  bar: 47,  sales: '5 184' },
        { rank: '#4', name: 'Couscous végétarien',  sub: '78 · 45 MAD',                   bar: 38,  sales: '3 510' },
        { rank: '#5', name: 'Orange pressée',       sub: '218 · 18 MAD',                  bar: 35,  sales: '3 924' },
        { rank: '#6', name: 'Salade marocaine',     sub: '92 · 32 MAD',                   bar: 27,  sales: '2 944' },
      ],
      trenteJours: [
        { rank: '#1', name: 'Tajine kefta œuf',     sub: '820 portions · 85 MAD',         bar: 100, sales: '69 700' },
        { rank: '#2', name: 'Thé à la menthe',      sub: '2 760 verres · 12 MAD',         bar: 73,  sales: '33 120' },
        { rank: '#3', name: 'Msemen beurre & miel', sub: '1 840 · 12 MAD',                bar: 47,  sales: '22 080' },
        { rank: '#4', name: 'Couscous végétarien',  sub: '348 · 45 MAD',                  bar: 41,  sales: '15 660' },
        { rank: '#5', name: 'Orange pressée',       sub: '900 · 18 MAD',                  bar: 35,  sales: '16 200' },
        { rank: '#6', name: 'Salade marocaine',     sub: '420 · 32 MAD',                  bar: 30,  sales: '13 440' },
      ],
    },
    maisonMansour: {
      aujourdhui: [
        { rank: '#1', name: 'Caftan brodé',         sub: '2 pièces · 1 890 MAD',          bar: 100, sales: '3 780' },
        { rank: '#2', name: 'Tapis berbère',        sub: '1 · 3 200 MAD',                  bar: 85,  sales: '3 200' },
        { rank: '#3', name: 'Théière argentée',     sub: '3 · 680 MAD',                    bar: 54,  sales: '2 040' },
        { rank: '#4', name: 'Babouches en cuir',    sub: '3 paires · 450 MAD',             bar: 36,  sales: '1 350' },
        { rank: '#5', name: 'Coussin tissé',        sub: '4 · 240 MAD',                    bar: 26,  sales: '960' },
        { rank: '#6', name: 'Lampe artisanale',     sub: '1 · 920 MAD',                    bar: 24,  sales: '920' },
      ],
      hier: [
        { rank: '#1', name: 'Caftan brodé',         sub: '2 pièces · 1 890 MAD',          bar: 100, sales: '3 780' },
        { rank: '#2', name: 'Tapis berbère',        sub: '1 · 3 200 MAD',                  bar: 85,  sales: '3 200' },
        { rank: '#3', name: 'Théière argentée',     sub: '3 · 680 MAD',                    bar: 54,  sales: '2 040' },
        { rank: '#4', name: 'Babouches en cuir',    sub: '4 paires · 450 MAD',             bar: 48,  sales: '1 800' },
        { rank: '#5', name: 'Coussin tissé',        sub: '4 · 240 MAD',                    bar: 26,  sales: '960' },
        { rank: '#6', name: 'Lampe artisanale',     sub: '1 · 920 MAD',                    bar: 24,  sales: '920' },
      ],
      septJours: [
        { rank: '#1', name: 'Caftan brodé',         sub: '12 pièces · 1 890 MAD',         bar: 100, sales: '22 680' },
        { rank: '#2', name: 'Tapis berbère',        sub: '6 · 3 200 MAD',                  bar: 85,  sales: '19 200' },
        { rank: '#3', name: 'Babouches en cuir',    sub: '28 paires · 450 MAD',            bar: 56,  sales: '12 600' },
        { rank: '#4', name: 'Théière argentée',     sub: '18 · 680 MAD',                   bar: 54,  sales: '12 240' },
        { rank: '#5', name: 'Coussin tissé',        sub: '32 · 240 MAD',                   bar: 34,  sales: '7 680' },
        { rank: '#6', name: 'Lampe artisanale',     sub: '8 · 920 MAD',                    bar: 32,  sales: '7 360' },
      ],
      trenteJours: [
        { rank: '#1', name: 'Caftan brodé',         sub: '52 pièces · 1 890 MAD',         bar: 100, sales: '98 280' },
        { rank: '#2', name: 'Tapis berbère',        sub: '26 · 3 200 MAD',                 bar: 85,  sales: '83 200' },
        { rank: '#3', name: 'Babouches en cuir',    sub: '118 paires · 450 MAD',           bar: 54,  sales: '53 100' },
        { rank: '#4', name: 'Théière argentée',     sub: '74 · 680 MAD',                   bar: 51,  sales: '50 320' },
        { rank: '#5', name: 'Coussin tissé',        sub: '140 · 240 MAD',                  bar: 34,  sales: '33 600' },
        { rank: '#6', name: 'Lampe artisanale',     sub: '32 · 920 MAD',                   bar: 30,  sales: '29 440' },
      ],
    },
    spaBahia: {
      aujourdhui: [
        { rank: '#1', name: 'Forfait Argan',        sub: '3 forfaits · 850 MAD',          bar: 100, sales: '2 550' },
        { rank: '#2', name: 'Massage relaxant 60min',sub: '3 · 550 MAD',                   bar: 65,  sales: '1 650' },
        { rank: '#3', name: 'Soin du visage',       sub: '2 · 650 MAD',                    bar: 51,  sales: '1 300' },
        { rank: '#4', name: 'Hammam traditionnel',  sub: '3 · 350 MAD',                    bar: 41,  sales: '1 050' },
        { rank: '#5', name: 'Gommage corps',        sub: '2 · 400 MAD',                    bar: 31,  sales: '800' },
        { rank: '#6', name: 'Modelage pieds',       sub: '2 · 280 MAD',                    bar: 22,  sales: '560' },
      ],
      hier: [
        { rank: '#1', name: 'Forfait Argan',        sub: '3 forfaits · 850 MAD',          bar: 100, sales: '2 550' },
        { rank: '#2', name: 'Soin du visage',       sub: '2 · 650 MAD',                    bar: 51,  sales: '1 300' },
        { rank: '#3', name: 'Massage relaxant 60min',sub: '2 · 550 MAD',                   bar: 43,  sales: '1 100' },
        { rank: '#4', name: 'Hammam traditionnel',  sub: '3 · 350 MAD',                    bar: 41,  sales: '1 050' },
        { rank: '#5', name: 'Gommage corps',        sub: '2 · 400 MAD',                    bar: 31,  sales: '800' },
        { rank: '#6', name: 'Modelage pieds',       sub: '2 · 280 MAD',                    bar: 22,  sales: '560' },
      ],
      septJours: [
        { rank: '#1', name: 'Forfait Argan',        sub: '22 forfaits · 850 MAD',         bar: 100, sales: '18 700' },
        { rank: '#2', name: 'Massage relaxant 60min',sub: '24 · 550 MAD',                  bar: 71,  sales: '13 200' },
        { rank: '#3', name: 'Soin du visage',       sub: '16 · 650 MAD',                   bar: 56,  sales: '10 400' },
        { rank: '#4', name: 'Hammam traditionnel',  sub: '28 · 350 MAD',                   bar: 53,  sales: '9 800' },
        { rank: '#5', name: 'Gommage corps',        sub: '18 · 400 MAD',                   bar: 38,  sales: '7 200' },
        { rank: '#6', name: 'Modelage pieds',       sub: '16 · 280 MAD',                   bar: 24,  sales: '4 480' },
      ],
      trenteJours: [
        { rank: '#1', name: 'Forfait Argan',        sub: '90 forfaits · 850 MAD',         bar: 100, sales: '76 500' },
        { rank: '#2', name: 'Massage relaxant 60min',sub: '98 · 550 MAD',                  bar: 70,  sales: '53 900' },
        { rank: '#3', name: 'Soin du visage',       sub: '66 · 650 MAD',                   bar: 56,  sales: '42 900' },
        { rank: '#4', name: 'Hammam traditionnel',  sub: '114 · 350 MAD',                  bar: 52,  sales: '39 900' },
        { rank: '#5', name: 'Gommage corps',        sub: '74 · 400 MAD',                   bar: 39,  sales: '29 600' },
        { rank: '#6', name: 'Modelage pieds',       sub: '66 · 280 MAD',                   bar: 24,  sales: '18 480' },
      ],
    },
  };

  /* The demo rosters below are written in French. Each line is « role · status »;
   * under English and Arabic both halves are translated here, from a closed
   * list, so a demo never shows « Serveur · pause depuis 14:12 » in English. */
  const DEMO_ROLE = {
    'Serveuse senior': { en: 'Senior waitress', ar: 'نادلة أولى' }, 'Serveur': { en: 'Waiter', ar: 'نادل' },
    'Barista': { en: 'Barista', ar: 'باريستا' }, 'Cuisine': { en: 'Kitchen', ar: 'المطبخ' },
    'Vendeuse principale': { en: 'Head sales associate', ar: 'بائعة رئيسية' }, 'Vendeuse': { en: 'Sales associate', ar: 'بائعة' },
    'Praticienne senior': { en: 'Senior therapist', ar: 'معالجة أولى' }, 'Praticienne': { en: 'Therapist', ar: 'معالجة' },
    'service en salle': { en: 'dining room', ar: 'القاعة' }, 'terrasse': { en: 'terrace', ar: 'التراس' },
    'comptoir': { en: 'counter', ar: 'الكونطوار' }, 'service de hier': { en: "yesterday's shift", ar: 'وردية الأمس' },
    'service du soir': { en: 'evening shift', ar: 'الوردية المسائية' }, 'service en cours': { en: 'on shift', ar: 'في الخدمة' },
    'vitrine': { en: 'window display', ar: 'الواجهة' }, 'journée complète': { en: 'full day', ar: 'يوم كامل' },
    'soins du visage': { en: 'facials', ar: 'العناية بالوجه' }, 'hammam & gommage': { en: 'hammam & scrub', ar: 'حمام وتقشير' },
    'hammam': { en: 'hammam', ar: 'حمام' }, 'massages': { en: 'massages', ar: 'تدليك' },
  };
  function demoRole(...args) { return callPart('demoRole', this, args); }

  const staffByVenue = {
    cafeAtlas: {
      aujourdhui: [
        { av: 'FK', cls: '',         name: 'Fatima Khalki',  role: 'Serveuse senior · service en salle', shift: '5h 32', amt: '5 240 MAD', tx: '42 tx' },
        { av: 'HJ', cls: 'b',        name: 'Hamid Jelloul',  role: 'Serveur · terrasse',                   shift: '5h 10', amt: '4 680 MAD', tx: '38 tx' },
        { av: 'SB', cls: 'c',        name: 'Sofia Belkadi',  role: 'Barista · comptoir',                   shift: '4h 48', amt: '3 920 MAD', tx: '54 tx' },
        { av: 'YA', cls: 'd',        name: 'Youssef Amrani', role: 'Serveur · pause depuis 14:12',          shift: '3h 22', amt: '2 110 MAD', tx: '25 tx' },
        { av: 'MM', cls: 'offline',  name: 'Mehdi Mansouri', role: 'Cuisine · fini son service 14:00',      shift: '·',     amt: '·',         tx: '' },
      ],
      hier: [
        { av: 'FK', cls: 'offline', name: 'Fatima Khalki',  role: 'Serveuse senior · service de hier',   shift: '8h 12', amt: '7 420 MAD', tx: '58 tx' },
        { av: 'HJ', cls: 'offline', name: 'Hamid Jelloul',  role: 'Serveur · terrasse',                   shift: '7h 48', amt: '6 980 MAD', tx: '52 tx' },
        { av: 'SB', cls: 'offline', name: 'Sofia Belkadi',  role: 'Barista · comptoir',                   shift: '6h 30', amt: '5 240 MAD', tx: '64 tx' },
        { av: 'YA', cls: 'offline', name: 'Youssef Amrani', role: 'Serveur · service du soir',            shift: '5h 50', amt: '3 240 MAD', tx: '38 tx' },
        { av: 'MM', cls: 'offline', name: 'Mehdi Mansouri', role: 'Cuisine · fini 23:00',                  shift: '7h 00', amt: '·',         tx: '' },
      ],
      septJours: [
        { av: 'FK', cls: '', name: 'Fatima Khalki',  role: 'Serveuse senior · 6 jours de service',   shift: '48h 20', amt: '36 800 MAD', tx: '298 tx' },
        { av: 'HJ', cls: 'b',name: 'Hamid Jelloul',  role: 'Serveur · 6 jours',                       shift: '46h 10', amt: '32 400 MAD', tx: '256 tx' },
        { av: 'SB', cls: 'c',name: 'Sofia Belkadi',  role: 'Barista · 7 jours',                       shift: '42h 00', amt: '28 700 MAD', tx: '342 tx' },
        { av: 'YA', cls: 'd',name: 'Youssef Amrani', role: 'Serveur · 5 jours',                       shift: '34h 40', amt: '18 200 MAD', tx: '184 tx' },
        { av: 'MM', cls: 'd',name: 'Mehdi Mansouri', role: 'Cuisine · 6 jours',                       shift: '44h 30', amt: '·',          tx: '' },
      ],
      trenteJours: [
        { av: 'FK', cls: '', name: 'Fatima Khalki',  role: 'Serveuse senior · 26 jours',              shift: '208h 40', amt: '152 600 MAD', tx: '1 240 tx' },
        { av: 'HJ', cls: 'b',name: 'Hamid Jelloul',  role: 'Serveur · 25 jours',                      shift: '198h 20', amt: '138 800 MAD', tx: '1 086 tx' },
        { av: 'SB', cls: 'c',name: 'Sofia Belkadi',  role: 'Barista · 28 jours',                      shift: '174h 00', amt: '118 400 MAD', tx: '1 458 tx' },
        { av: 'YA', cls: 'd',name: 'Youssef Amrani', role: 'Serveur · 21 jours',                      shift: '146h 20', amt: '76 400 MAD',  tx: '784 tx' },
        { av: 'MM', cls: 'd',name: 'Mehdi Mansouri', role: 'Cuisine · 24 jours',                      shift: '184h 00', amt: '·',           tx: '' },
      ],
    },
    maisonMansour: {
      aujourdhui: [
        { av: 'KI', cls: '',  name: 'Karima Idrissi', role: 'Vendeuse principale · service en cours', shift: '5h 30', amt: '6 200 MAD', tx: '18 tx' },
        { av: 'AB', cls: 'b', name: 'Aicha Benali',   role: 'Vendeuse · pause depuis 14:30',          shift: '4h 12', amt: '3 100 MAD', tx: '14 tx' },
        { av: 'RT', cls: 'c', name: 'Rania Tazi',     role: 'Vendeuse · vitrine',                     shift: '4h 48', amt: '2 520 MAD', tx: '10 tx' },
      ],
      hier: [
        { av: 'KI', cls: 'offline', name: 'Karima Idrissi', role: 'Vendeuse principale · service de hier', shift: '8h 30', amt: '6 850 MAD', tx: '20 tx' },
        { av: 'AB', cls: 'offline', name: 'Aicha Benali',   role: 'Vendeuse · journée complète',           shift: '7h 50', amt: '3 280 MAD', tx: '15 tx' },
        { av: 'RT', cls: 'offline', name: 'Rania Tazi',     role: 'Vendeuse · vitrine',                    shift: '7h 30', amt: '1 980 MAD', tx: '8 tx' },
      ],
      septJours: [
        { av: 'KI', cls: '',  name: 'Karima Idrissi', role: 'Vendeuse principale · 6 jours', shift: '48h 30', amt: '38 200 MAD', tx: '128 tx' },
        { av: 'AB', cls: 'b', name: 'Aicha Benali',   role: 'Vendeuse · 6 jours',            shift: '44h 10', amt: '24 800 MAD', tx: '102 tx' },
        { av: 'RT', cls: 'c', name: 'Rania Tazi',     role: 'Vendeuse · 5 jours',            shift: '36h 50', amt: '15 400 MAD', tx: '65 tx' },
      ],
      trenteJours: [
        { av: 'KI', cls: '',  name: 'Karima Idrissi', role: 'Vendeuse principale · 26 jours', shift: '210h 30', amt: '162 800 MAD', tx: '548 tx' },
        { av: 'AB', cls: 'b', name: 'Aicha Benali',   role: 'Vendeuse · 25 jours',             shift: '194h 50', amt: '105 200 MAD', tx: '432 tx' },
        { av: 'RT', cls: 'c', name: 'Rania Tazi',     role: 'Vendeuse · 22 jours',             shift: '162h 30', amt: '64 800 MAD',  tx: '260 tx' },
      ],
    },
    spaBahia: {
      aujourdhui: [
        { av: 'NH', cls: '',  name: 'Nour El Hassan',     role: 'Praticienne senior · soins du visage',   shift: '6h 30', amt: '3 850 MAD', tx: '8 RDV' },
        { av: 'SB', cls: 'b', name: 'Salma Benkirane',    role: 'Praticienne · massages',                 shift: '5h 50', amt: '3 200 MAD', tx: '7 RDV' },
        { av: 'YB', cls: 'c', name: 'Yasmine Bouchikhi',  role: 'Praticienne · hammam & gommage',         shift: '4h 30', amt: '1 900 MAD', tx: '5 RDV' },
      ],
      hier: [
        { av: 'NH', cls: 'offline', name: 'Nour El Hassan',     role: 'Praticienne senior · journée complète', shift: '8h 00', amt: '3 600 MAD', tx: '7 RDV' },
        { av: 'SB', cls: 'offline', name: 'Salma Benkirane',    role: 'Praticienne · massages',                shift: '7h 30', amt: '3 050 MAD', tx: '6 RDV' },
        { av: 'YB', cls: 'offline', name: 'Yasmine Bouchikhi',  role: 'Praticienne · hammam',                  shift: '6h 30', amt: '1 730 MAD', tx: '5 RDV' },
      ],
      septJours: [
        { av: 'NH', cls: '',  name: 'Nour El Hassan',     role: 'Praticienne senior · 6 jours', shift: '46h 00', amt: '26 800 MAD', tx: '54 RDV' },
        { av: 'SB', cls: 'b', name: 'Salma Benkirane',    role: 'Praticienne · 6 jours',        shift: '42h 30', amt: '22 400 MAD', tx: '48 RDV' },
        { av: 'YB', cls: 'c', name: 'Yasmine Bouchikhi',  role: 'Praticienne · 5 jours',        shift: '32h 00', amt: '15 000 MAD', tx: '40 RDV' },
      ],
      trenteJours: [
        { av: 'NH', cls: '',  name: 'Nour El Hassan',     role: 'Praticienne senior · 27 jours', shift: '198h 00', amt: '112 800 MAD', tx: '224 RDV' },
        { av: 'SB', cls: 'b', name: 'Salma Benkirane',    role: 'Praticienne · 26 jours',        shift: '184h 30', amt: '94 200 MAD',  tx: '198 RDV' },
        { av: 'YB', cls: 'c', name: 'Yasmine Bouchikhi',  role: 'Praticienne · 23 jours',        shift: '142h 00', amt: '62 400 MAD',  tx: '158 RDV' },
      ],
    },
  };

  /* ═══════════════ STATE + EVENTS ═══════════════ */

  function setDateRange(...args) { return callPart('setDateRange', this, args); }
  /* Commit a calendar-picked pair and switch the dashboard onto it —
   * called by the custom-range popover's "Appliquer" button. */
  function commitCustomRange(...args) { return callPart('commitCustomRange', this, args); }
  function setShowComparison(...args) { return callPart('setShowComparison', this, args); }
  function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }

  /* ═══════════════ DATE / NUMBER HELPERS ═══════════════ */

  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
  const fmtShort = d => `${pad(d.getDate())}.${pad(d.getMonth()+1)}`;
  const offsetDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

  function computeSubLine(id) {
    const today = new Date();
    if (id === 'aujourdhui')  return fmtDate(today);
    if (id === 'hier')        return fmtDate(offsetDays(-1));
    if (id === 'septJours')   return `${fmtShort(offsetDays(-6))}, ${fmtDate(today)}`;
    if (id === 'trenteJours') return `${fmtShort(offsetDays(-30))}, ${fmtDate(today)}`;
    return '·';
  }

  const frInt = n => window.KiwiNumber?.number(Math.round(n)) || Math.round(n).toLocaleString('fr-FR');
  /* Money as the till prints it (KiwiNumber.amount): 404,10 stays 404,10. The
   * band, the hero and the payment ring used frInt and showed 404 for a day
   * the till, the day report and Commandes all closed at 404,10. Counts and
   * percentages keep frInt. */
  const frMoney = n => window.KiwiNumber?.amount?.(n) || (Math.round((+n || 0) * 100) % 100
    ? (Math.round((+n || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : frInt(n));

  function fmtHeroAmount(v) {
    const int = Math.floor(v);
    const cents = Math.round((v - int) * 100);
    const separator = getLang() === 'en' ? '.' : ',';
    return `${frInt(int)}<span class="cents">${separator}${String(cents).padStart(2,'0')}</span><span class="currency">${curUnit()}</span>`;
  }
  const fmtSettleAmount = v => `${frInt(v)} <span style="font-size:0.42em; opacity: 0.7;">${curUnit()}</span>`;
  /* Design 2027, étape 5 (kiwiSkin2027:dashboard) : l'accueil du kit dessine
   * les chiffres que CES rendus calculent, et aucun autre. Chaque rendu dépose
   * ici ce qu'il vient d'écrire dans le DOM livré ; un évènement par image
   * (kiwi:home-model) prévient le kit. Drapeau éteint : personne n'écoute. */
  function homeStore() { return homeStore.m || (homeStore.m = {}); }
  function homeSet(...args) { return callPart('homeSet', this, args); }
  const fmtPct = v => {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    const abs = Math.abs(v);
    const digits = Math.abs(abs - Math.round(abs)) < 0.001 ? 0 : 1;
    const formatted = window.KiwiNumber?.number(abs, digits)
      ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:digits,maximumFractionDigits:digits}).format(abs);
    return `${sign}${formatted} %`;
  };

  /* One frame of a count-up. When the markup keeps its shape and only the
   * digits move, the text is updated in place: rebuilding the spans every
   * frame made each counter add new elements sixty times a second, and in
   * dark mode every new element is re-checked for contrast (dark-fixes.js),
   * about 0.9 s of a dashboard start on its own. */
  const numberShape = (html) => html.replace(/>[^<]*</g, '><').replace(/^[^<]*|[^>]*$/g, '');
  function textNodesOf(root) {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  function paintNumber(...args) { return callPart('paintNumber', this, args); }

  function animateNumber(...args) { return callPart('animateNumber', this, args); }

  /* Auto-size the hero amount so it always sits on a single line.
   * Renders the target value in a hidden mirror (same fonts/letter-spacing),
   * measures, and shrinks font-size if it would overflow the column. */
  function fitHeroAmount(...args) { return callPart('fitHeroAmount', this, args); }

  function parseAmountFromEl(el) {
    if (!el) return 0;
    const m = el.textContent.replace('−', '-').match(/-?\d+(?:[\s ]\d{3})*(?:[.,]\d+)?/);
    if (!m) return 0;
    return parseFloat(m[0].replace(/[\s ]/g, '').replace(',', '.')) || 0;
  }
  function parseIntFromEl(el) {
    if (!el) return 0;
    const txt = el.textContent.replace(/\s/g, '').replace('−', '-');
    const m = txt.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  function parsePctFromEl(el) {
    if (!el) return 0;
    const txt = el.textContent.replace('−', '-').replace(',', '.');
    const m = txt.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }

  /* ═══════════════ RENDER: SELECTOR ═══════════════ */

  function revealDayPill(...args) { return callPart('revealDayPill', this, args); }

  function renderSelector() {
    const lang = getLang();
    const labelEl = document.querySelector('[data-dr-label]');
    const subEl = document.querySelector('[data-dr-sub]');
    if (currentRange === 'personnalise' && customRange) {
      // The custom range owns the headline: show its human date span, with
      // the day count standing in for the usual single-date sub-line.
      const ps = PICKER_STR[lang] || PICKER_STR.fr;
      const n = spanDays(customRange.start, customRange.end);
      if (labelEl) labelEl.textContent = fmtHumanRange(customRange.start, customRange.end, lang);
      if (subEl) subEl.textContent =
        `${RANGE_STR[lang]?.personnalise || RANGE_STR.fr.personnalise} · ${n} ${n > 1 ? ps.days : ps.day}`;
    } else {
      if (labelEl) labelEl.textContent = RANGE_STR[lang]?.[currentRange] || RANGE_STR.fr[currentRange];
      if (subEl)   subEl.textContent = computeSubLine(currentRange);
    }
    // A period without a pill of its own (Mois dernier, Ce trimestre, Cette
    // année, kept from the old range menu) is chosen from the calendar, so the
    // calendar pill is the one lit. Lighting none left the lens on
    // « Aujourd'hui » under a « Mois dernier » title.
    const pills = [...document.querySelectorAll('.dash-date-range .dr-pill')];
    const lit = pills.some(p => p.dataset.range === currentRange) ? currentRange : 'personnalise';
    pills.forEach(p => {
      const on = p.dataset.range === lit;
      p.classList.toggle('on', on);
      p.setAttribute('aria-pressed', String(on));
      if (on) requestAnimationFrame(() => p.isConnected && revealDayPill(p));
    });
  }

  /* ═══════════════ REAL SALES · time-windowed (user-created venues) ═══════════════
   * KiwiSales entries carry a real `ts` (millis). The hero, KPI band, goal bar
   * and revenue chart all derive from the SAME window here — so a single sale
   * moves every surface and the figures can never disagree with each other.
   * Placed before renderHero but hoisted as function declarations, so every
   * renderer below can call them. */
  /* ── Où commence « aujourd'hui » ────────────────────────────────────────
   * À la même heure que sur le rapport Z, et pas à minuit.
   *
   * Le tableau de bord coupait la journée à minuit. Le rapport de clôture, lui,
   * la coupe à la bascule commerciale du commerçant — 5 h par défaut, ou
   * l'heure déduite de ses horaires (assets/day-report.js · cutoff). Pour un
   * restaurant qui ferme à 1 h du matin, les deux surfaces ne pouvaient donc
   * pas tomber d'accord : le Z du soir rangeait les ventes de 00 h–01 h dans la
   * recette de la soirée, la tuile « Aujourd'hui » les comptait dans le
   * lendemain. Le patron voyait un Z à 8 400 MAD et un tableau de bord qui
   * n'en montrait que 7 900, sans qu'aucun des deux ne soit faux ni réparable :
   * ils répondaient à deux questions différentes en prétendant répondre à la
   * même. Et le décalage frappe précisément les commerces de service du soir,
   * c'est-à-dire ceux dont la soirée EST le chiffre d'affaires.
   *
   * Une seule définition, donc, et c'est celle du rapport — parce que c'est
   * celle que le commerçant imprime, signe et compare à sa caisse.
   *
   * Repli à minuit quand le module de rapport n'est pas chargé : c'est
   * exactement le comportement d'avant, donc rien ne peut se dégrader. */
  const DEFAULT_MERCHANT_TZ = 'Africa/Casablanca';
  function activeMerchantSlug() {
    try { return getCurrentVenue(); } catch (_) { return ''; }
  }
  function merchantTimeZone(...args) { return callPart('merchantTimeZone', this, args); }
  function merchantParts(...args) { return callPart('merchantParts', this, args); }
  function addMerchantDays(day, delta) {
    const p = String(day || '').split('-');
    return new Date(Date.UTC(+p[0], (+p[1] || 1) - 1, +p[2] || 1) + delta * 864e5).toISOString().slice(0, 10);
  }
  function merchantBoundary(...args) { return callPart('merchantBoundary', this, args); }
  function merchantDayKey(...args) { return callPart('merchantDayKey', this, args); }
  function merchantDayBounds(day, slug) {
    try {
      const R = window.KiwiDayReport;
      if (R?.dayBounds) return R.dayBounds(day, slug);
    } catch (_) {}
    const h = dayCutoffH(slug);
    return { from: merchantBoundary(day, h, slug), to: merchantBoundary(addMerchantDays(day, 1), h, slug) };
  }
  function dayCutoffH(slug) { /* repli = 05:00 comme la caisse, jamais minuit */
    try {
      const h = window.KiwiDayReport?.cutoff?.(slug);
      return (typeof h === 'number' && isFinite(h) && h >= 0 && h <= 12) ? h : 5;
    } catch (_) { return 5; }
  }
  function dayStartMs(t) {
    const slug = activeMerchantSlug();
    return merchantDayBounds(merchantDayKey(t, slug), slug).from;
  }
  function realSalesList() {
    try { return (window.KiwiSales?.list?.(getCurrentVenue()) || []); } catch (_) { return []; }
  }
  function realRefundList() {
    try { return (window.KiwiRefunds?.list?.(getCurrentVenue()) || []); } catch (_) { return []; }
  }
  function realMoneyList() {
    return realSalesList().concat(realRefundList().map((r) => ({ ...r, amount: -Math.abs(+r.amount || 0), kind: 'refund' })));
  }
  // Window bounds [from, to) in ms for a range, relative to now.
  /* « Mois dernier », « Ce trimestre », « Cette année » sont des périodes du
   * CALENDRIER. Le sélecteur les affiche ainsi (« Septembre 2026 »,
   * « 1 Jul – 12 Oct 2026 », « 2026 ») et les tuiles disent « vs mois préc. » ;
   * les bornes, elles, étaient les 30, 90 et 365 derniers jours. Le 12
   * octobre, « Septembre 2026 » totalisait du 13 septembre au 12 octobre, et
   * « 2026 » remontait au 13 octobre 2025. Clés de journée en texte : pas de
   * fuseau, la journée de caisse reste celle de merchantDayBounds. */
  function calendarStartKey(...args) { return callPart('calendarStartKey', this, args); }
  /* [début, fin) de la période, `back` périodes en arrière. « Mois dernier »
   * est le mois précédent ENTIER ; trimestre et année courent depuis leur
   * premier jour, ouverts jusqu'à maintenant. null hors calendrier. */
  function calendarBounds(...args) { return callPart('calendarBounds', this, args); }
  function rangeBounds(...args) { return callPart('rangeBounds', this, args); }
  /* Les livraisons pas encore payées par le transporteur. Une vente partie en
   * livraison est enregistrée à 0 MAD, et le magasin des ventes ne garde que
   * l'argent : elle n'était donc dans aucune créance. Le montant dû vient de
   * /api/receivables (assets/delivery-receivables.js), daté du jour de la
   * vente ; une livraison reçue en sort et entre comme une vente ordinaire. */
  const deliveryDue = (from, to) => {
    try { return Math.max(0, +(window.KiwiDeliveries && window.KiwiDeliveries.dueIn(from, to)) || 0); } catch (_) { return 0; }
  };
  /* assets/sales-history.js loads just before this file. Read it on use, so a
     page that loads dateRange.js alone still boots and only the totals wait. */
  const salesMath = () => window.KiwiSalesMath;
  const tenderBucket = (m) => salesMath().tenderBucket(m);
  const tenderAmounts = (e) => salesMath().tenderAmounts(e);
  function realSalesTotals(range) {
    const [from, to] = rangeBounds(range == null ? currentRange : range);
    const { card, cash, ...totals } = realWindowStats(from, to);
    return totals;
  }
  function realWindowStats(from, to) {
    const summary = window.KiwiSalesSummary;
    const totals = summary ? summary.stats(realSalesList(), realRefundList(), from, to, getCurrentVenue())
      : window.KiwiSalesMath.statsFromSales(realSalesList(), realRefundList(), from, to);
    totals.receivable += deliveryDue(from, to);
    return totals;
  }

  /* One read model for every headline and insight sentence. Nothing falls back
   * to older rows when the selected period is empty: zero today means zero
   * today, even when the venue sold yesterday. */
  /* L'heure d'une vente dans le fuseau du COMMERCE (day-report.js), pas celui de
     l'appareil : un patron qui ouvre le tableau de bord depuis l'étranger voyait
     une « heure de pointe » décalée. Repli sur l'appareil si le module du rapport
     du jour n'est pas chargé. */
  function saleHour(ts) {
    try {
      const R = window.KiwiDayReport;
      if (R && typeof R.hourOf === 'function') { const h = R.hourOf(ts); if (isFinite(h) && h >= 0 && h < 24) return h; }
    } catch (_) {}
    return new Date(ts).getHours();
  }
  function realInsightSummary(...args) { return callPart('realInsightSummary', this, args); }

  const TENDER_NAME = {
    fr: { cash: 'espèces', card: 'carte bancaire', tap: 'Kiwi Tap', qr: 'QR / wallet', link: 'lien de paiement', transfer: 'virement', cheque: 'chèque', split: 'paiement partagé', other: 'autre mode' },
    en: { cash: 'cash', card: 'bank card', tap: 'Kiwi Tap', qr: 'QR / wallet', link: 'payment link', transfer: 'bank transfer', cheque: 'cheque', split: 'split payment', other: 'other tender' },
    ar: { cash: 'نقدًا', card: 'بطاقة بنكية', tap: 'Kiwi Tap', qr: 'QR / محفظة', link: 'رابط دفع', transfer: 'تحويل بنكي', cheque: 'شيك', split: 'دفع مقسّم', other: 'طريقة أخرى' },
  };
  function buildRealHeroRec(...args) { return callPart('buildRealHeroRec', this, args); }
  function buildRealHeatmapRec(...args) { return callPart('buildRealHeatmapRec', this, args); }
  /* Coût matière RÉEL — délégué à window.KiwiCost (assets/cost.js), qui est
   * désormais le seul endroit de l'application qui sache répondre « combien me
   * coûte ce produit ».
   *
   * ── CE QUE FAISAIT CETTE FONCTION, ET POURQUOI C'ÉTAIT FAUX ───────────────
   * Elle rapprochait le LIBELLÉ du ticket du nom d'un produit du catalogue. Or
   * le libellé est un RÉSUMÉ de panier — « Pain complet +3 art. », « Table 4 »
   * (voir schema.sql, colonne `lines`, qui existe précisément parce que le
   * libellé ne désigne pas un produit). Trois conséquences mesurées :
   *
   *   · un panier de plusieurs articles ne se résolvait jamais ;
   *   · quand il se résolvait, on retranchait UN coût unitaire du montant du
   *     ticket ENTIER : quatre pains à 5 MAD donnaient 18 MAD de bénéfice au
   *     lieu de 12 ;
   *   · tout le reste retombait sur DEFAULT_MARGIN. Pour un café, dont aucune
   *     vente ne se résolvait jamais, la tuile « Marge brute » affichait donc
   *     exactement 69,0 % tous les jours, à vie. Une constante présentée comme
   *     une mesure — et « Bénéfice brut » et « Coût matière » en dérivant, les
   *     trois tuiles se confirmaient mutuellement.
   *
   * ── CE QU'ELLE FAIT MAINTENANT ────────────────────────────────────────────
   * Elle lit `e.lines[]` — le panier réel, avec ses quantités, qui remonte déjà
   * de la caisse jusqu'ici — multiplie le coût par la quantité, et n'invente
   * RIEN : une ligne dont le coût est inconnu sort du calcul de marge et entre
   * dans un compteur de couverture. Mieux vaut « marge calculée sur 62 % de vos
   * ventes » qu'un pourcentage complet en apparence et faux en réalité.
   *
   * `revenueCosted`/`pctCosted` remontent jusqu'aux tuiles : sans eux la marge
   * ne s'affiche pas du tout (un tiret), au lieu de se déguiser en mesure. */
  function realGrossProfit(from, to) {
    const C = window.KiwiCost;
    if (!C || !C.coverage) return null;
    try { return C.coverage(realSalesList(), from, to); } catch (_) { return null; }
  }
  /* rangeBounds leaves `to` open at Infinity for live ranges; a comparison
   * needs a closed window it can shift backwards, so pin the open end to now. */
  function closedBounds(range) {
    const [from, to] = rangeBounds(range == null ? currentRange : range);
    return [from, to === Infinity ? Date.now() + 1 : to];
  }
  function shiftedBusinessBounds(from, to, deltaDays) {
    const slug = activeMerchantSlug();
    const startDay = merchantDayKey(from + 1, slug);
    const endDay = merchantDayKey((to === Infinity ? Date.now() : to - 1), slug);
    const shiftedStart = addMerchantDays(startDay, -deltaDays);
    const shiftedEnd = addMerchantDays(endDay, -deltaDays);
    return [merchantDayBounds(shiftedStart, slug).from, merchantDayBounds(shiftedEnd, slug).to];
  }
  /* A percentage change needs something to change FROM. A merchant on their
   * first day has no yesterday, and printing « 0 % vs hier » beside their
   * opening sales claims the day was flat when it was in fact their first.
   * null means "no baseline" — every caller hides the comparison rather than
   * inventing one. Without `backDays` the baseline is the window immediately
   * before this one; with it, the SAME slice N days earlier — so at 14h « vs
   * semaine » weighs today-so-far against last week up to 14h, not against a
   * full day it hasn't finished yet. */
  /* Le nombre de journées de caisse que couvre la fenêtre, aujourd'hui
   * compris : le dénominateur honnête de « CA moyen par jour ». RANGE_DAYS
   * divisait une période personnalisée par 1 (la moyenne valait le total) et
   * l'année en cours par 365. */
  /* Le carnet (clôtures, clients) de l'établissement À L'ÉCRAN, et de lui
   * seul. KiwiDayReport et KiwiClients savent retrouver un carnet par défaut,
   * mais leur repli passe par kiwiLiveMerchant ou l'appairage, un réglage
   * global au navigateur : sur une session réelle dont l'établissement n'est
   * pas (encore) identifié, ou après qu'un opérateur a consulté un autre
   * commerce, ce repli désigne un AUTRE commerce. Ces tuiles s'affichent à
   * côté des ventes de l'établissement à l'écran ; elles lisent donc le même
   * établissement, par son slug gravé (le même calcul que ces deux carnets en
   * mode tableau de bord), ou rien du tout. */
  function screenBook(...args) { return callPart('screenBook', this, args); }
  /* Les pourboires déclarés par les journées CLOSES de la fenêtre, et, pour une
   * journée encore ouverte, ceux que la caisse a saisis à l'encaissement
   * (sales.tip_cents, porté par le flux). Une journée close garde son chiffre
   * déclaré, jamais additionné aux saisies : c'est le Z qui fait foi. Une
   * journée ouverte sans aucun pourboire saisi n'est pas comptée : rien à dire,
   * plutôt qu'un 0 qu'une caisse plus ancienne n'aurait simplement pas envoyé.
   * null quand le classeur n'est pas chargé (rien à dire). */
  function realClosedTips(...args) { return callPart('realClosedTips', this, args); }
  /* Les clients du carnet (KiwiClients) venus sur [from, to) : ceux qu'on a
   * déjà vus avant `from` sont des réguliers, les autres des nouveaux. Seuls
   * comptent les passages DATÉS, c'est-à-dire l'historique d'achats que la
   * caisse écrit à chaque vente rattachée (les 50 derniers par client, aussi
   * côté serveur). Un client créé sans achat n'est pas venu ; une fiche
   * ancienne sans historique ne peut pas être placée dans le temps, elle ne
   * compte pas. Un compteur de passages plus grand que l'historique veut dire
   * que des passages plus anciens existent : le client était déjà venu.
   * Un client anonyme n'est pas dans le carnet : ces chiffres portent sur les
   * clients identifiés, jamais sur toutes les ventes. */
  function realClientMix(...args) { return callPart('realClientMix', this, args); }
  function windowDays(range) {
    const [from, to] = closedBounds(range);
    const slug = activeMerchantSlug();
    const a = merchantDayKey(from + 1, slug), b = merchantDayKey(to - 1, slug);
    return Math.max(1, Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5) + 1);
  }
  /* Les journées d'ouverture de la fenêtre : celles où la caisse a enregistré
   * au moins une vente (journée de caisse, coupure à 5 h). « CA par jour » et
   * « Ventes par jour » divisaient par la longueur de la période : un commerce
   * fermé le dimanche voyait sa moyenne amputée d'un septième, une semaine de
   * congés la divisait encore. Une période sans aucune vente vaut 1 (la
   * moyenne est alors 0, pas une division par zéro). */
  function openDays(...args) { return callPart('openDays', this, args); }
  function realDeltaPct(...args) { return callPart('realDeltaPct', this, args); }
  /* round(num / den), une demie vers le haut, en entiers : 2,01 MAD sur deux
     tickets fait 1,005, que le flottant range sous 1,005 et arrondit à 1,00. */
  function halfUpDiv(num, den) {
    if (den < 0) { num = -num; den = -den; }
    const n = 2 * num + den, d = 2 * den;
    let q = Math.floor(n / d);
    if (q * d > n) q--; else if ((q + 1) * d <= n) q++;
    return q;
  }
  /* L'écart en dixièmes de pour cent. Deux montants au centime se comparent en
     centimes entiers : 0,80 → 0,79 fait −1,25 %, que (0,79 − 0,80) / 0,80 en
     flottant poussait à −1,3. Un taux (part carte, fidèles…) garde le calcul
     flottant, il n'a pas de centime. */
  function deltaTenths(...args) { return callPart('deltaTenths', this, args); }
  // Le panier moyen au centime, une demie vers le haut, depuis la somme en centimes.
  function basketCents(s) {
    const n = s && s.count > 0 ? s.count : 0;
    return n ? halfUpDiv(Math.round(s.basket * n * 100), n) : Math.round(((s && s.basket) || 0) * 100);
  }
  // Round a max value up to a clean axis ceiling (1/2/5 × 10ⁿ).
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  }
  const DAY_ABBR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  /* Day ticks are built in French ("Sam 18"), including the demo series.
   * Translate the weekday at paint time so an English or Arabic dashboard
   * does not show "Sam 18 … Ven 24". */
  const DAY_ABBR_BY_LANG = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  };
  function localDayTick(label) {
    const table = DAY_ABBR_BY_LANG[getLang()];
    if (!table || typeof label !== 'string') return label;
    const m = /^(Dim|Lun|Mar|Mer|Jeu|Ven|Sam)(\s.*)$/.exec(label);
    return m ? table[DAY_ABBR.indexOf(m[1])] + m[2] : label;
  }
  /* One day, bucketed by hour and accumulated — 24 running totals. Shared by
   * the plotted day and the day it is compared against so both curves are
   * built by the same code and are readable point-for-point.
   * Bucketing is relative to `base` (the business day start, e.g. 5:00 AM)
   * so late-night sales after midnight are attributed to their service. */
  function hourlyCumul(...args) { return callPart('hourlyCumul', this, args); }
  // Same idea over N whole days: one total per day from `start`.
  function dailyTotals(...args) { return callPart('dailyTotals', this, args); }
  // Build a REAL revenue-chart series for the active range from KiwiSales — the
  // custom-venue replacement for the zeroed demo clone (which plots a flat line
  // and leaks the demo legend total). Hourly-cumulative on day ranges, daily
  // totals on 7/30-day ranges; axis + legend computed from the real numbers.
  //
  // `revPrev` is the window immediately before this one, bucketed identically —
  // this is what « Comparer » draws. It used to be `rev.map(() => 0)`, so on a
  // real merchant the button faded in a flat line pinned to the axis with an
  // empty legend: indistinguishable from a dead control. A window with no sale
  // at all returns null, not zeros — same rule realDeltaPct states above: a
  // fabricated baseline claims a comparison that was never possible.
  function realRevSeries(...args) { return callPart('realRevSeries', this, args); }

  /* ═══════════════ RENDER: HERO ═══════════════ */

  // dateRange loads before live-link. An operator URL starts unverified even
  // before identity/feed initialization; cached or partial totals are not zero.
  function operatorLedgerPending(...args) { return callPart('operatorLedgerPending', this, args); }
  function operatorUnavailableText() {
    const state = window.KiwiLive?.snapshotStatus?.();
    const loading = !state || state.phase === 'loading';
    const lang = getLang();
    return (loading
      ? { fr: 'Chargement du journal…', en: 'Loading ledger…', ar: 'جارٍ تحميل السجل…' }
      : { fr: 'Chiffres indisponibles · actualiser le journal', en: 'Figures unavailable · refresh the ledger', ar: 'الأرقام غير متاحة · حدّث السجل' })[lang] || 'Journal indisponible';
  }
  function guardOperatorFigures(selector) {
    if (!operatorLedgerPending()) return false;
    document.querySelectorAll(selector).forEach(el => { el.textContent = ''; });
    return true;
  }

  function renderHero(...args) { return callPart('renderHero', this, args); }

  /* ═══════════════ RENDER: HERO AI PANEL (per venue) ═══════════════ */

  function renderHeroAi(...args) { return callPart('renderHeroAi', this, args); }

  /* ═══════════════ RENDER: HEATMAP AI HINT (per venue) ═══════════════ */

  function renderHeatmapAi(...args) { return callPart('renderHeatmapAi', this, args); }

  /* ═══════════════ RENDER: HERO GOAL BAR ═══════════════ */

  function renderGoal(...args) { return callPart('renderGoal', this, args); }

  /* ═══════════════ RENDER: HOURLY HEATMAP ═══════════════ */

  function intensityClass(v) {
    if (v < 0.2) return 'i0';
    if (v < 0.4) return 'i1';
    if (v < 0.6) return 'i2';
    if (v < 0.8) return 'i3';
    return 'i4';
  }
  function buildHeatmap(...args) { return callPart('buildHeatmap', this, args); }
  function renderHeatmap(...args) { return callPart('renderHeatmap', this, args); }

  /* ═══════════════ RENDER: KPI BAND ═══════════════ */

  const arrowSvg = up => `<i data-lucide="${up ? 'arrow-up' : 'arrow-down'}" style="width:11px;height:11px" aria-hidden="true"></i>`;

  function fmtKpiVal(spec, v) {
    /* A "/ 5320" denominator is data too: group it like the value beside it. */
    const unit = spec.unit ? `<span class="u">${String(spec.unit === 'MAD' ? curUnit() : spec.unit).replace(/\d{4,}/g, n => frInt(Number(n)))}</span>` : '';
    if (spec.text) return spec.text + unit;
    if (spec.fmt === 'pct2') return (window.KiwiNumber?.number(v, 2) || v.toFixed(2).replace('.', ',')) + unit;
    if (spec.fmt === 'pct1') return (window.KiwiNumber?.number(v, 1) || v.toFixed(1).replace('.', ',')) + unit;
    return (spec.unit === 'MAD' ? frMoney(v) : frInt(v)) + unit;
  }

  const KPI_MATERIAL_ICONS = {
    tx: 'credit-card', panier: 'shopping-bag', tips: 'hand-coins', marge: 'percent',
    success: 'check-circle-2', ratio: 'pie-chart', regulars: 'users',
    tauxRetour: 'rotate-ccw', revenue: 'banknote', profit: 'trending-up',
    cogs: 'package', retention: 'heart', newClients: 'user-plus',
    revPerDay: 'calendar', txPerDay: 'list', tempsTable: 'clock',
    occupation: 'bed', adr: 'tag', revpar: 'trending-up',
    arrdep: 'swap-vert', menage: 'sparkles', mixRev: 'pie-chart'
  };
  // One sparkline path per key. Colour stays atlas; deltas drive the up/down chip.
  const KPI_SPARKS = {
    tx:         'M0 18 L15 15 L30 16 L45 12 L60 10 L75 7 L90 11 L105 6 L120 4',
    panier:     'M0 11 L15 13 L30 10 L45 14 L60 11 L75 12 L90 10 L105 13 L120 11',
    tips:       'M0 18 L15 16 L30 14 L45 15 L60 10 L75 11 L90 7 L105 4 L120 2',
    marge:      'M0 13 L15 12 L30 13 L45 10 L60 11 L75 9 L90 8 L105 6 L120 5',
    success:    'M0 7 L15 6 L30 8 L45 5 L60 6 L75 4 L90 5 L105 3 L120 2',
    ratio:      'M0 14 L15 13 L30 12 L45 11 L60 10 L75 9 L90 7 L105 6 L120 5',
    regulars:   'M0 15 L15 14 L30 15 L45 13 L60 10 L75 11 L90 9 L105 8 L120 6',
    tauxRetour: 'M0 4 L15 6 L30 5 L45 8 L60 9 L75 11 L90 10 L105 13 L120 14',
    revenue:    'M0 17 L15 15 L30 13 L45 14 L60 10 L75 9 L90 6 L105 5 L120 3',
    profit:     'M0 18 L15 15 L30 14 L45 12 L60 11 L75 8 L90 7 L105 4 L120 2',
    cogs:       'M0 9 L15 10 L30 9 L45 11 L60 10 L75 12 L90 11 L105 12 L120 13',
    retention:  'M0 15 L15 14 L30 13 L45 13 L60 11 L75 10 L90 9 L105 7 L120 6',
    newClients: 'M0 16 L15 14 L30 15 L45 12 L60 13 L75 10 L90 9 L105 7 L120 5',
    revPerDay:  'M0 16 L15 14 L30 15 L45 12 L60 10 L75 11 L90 8 L105 6 L120 4',
    txPerDay:   'M0 15 L15 13 L30 14 L45 11 L60 12 L75 9 L90 10 L105 6 L120 4',
    tempsTable: 'M0 6 L15 8 L30 7 L45 9 L60 11 L75 10 L90 12 L105 14 L120 13',
    occupation: 'M0 14 L15 12 L30 13 L45 10 L60 9 L75 7 L90 8 L105 5 L120 4',
    adr:        'M0 12 L15 11 L30 12 L45 10 L60 11 L75 9 L90 8 L105 7 L120 6',
    revpar:     'M0 16 L15 14 L30 13 L45 12 L60 10 L75 8 L90 9 L105 6 L120 4',
    arrdep:     'M0 12 L15 9 L30 13 L45 8 L60 12 L75 7 L90 11 L105 6 L120 9',
    menage:     'M0 6 L15 9 L30 7 L45 11 L60 8 L75 12 L90 10 L105 13 L120 12',
    mixRev:     'M0 11 L15 11 L30 10 L45 11 L60 10 L75 10 L90 9 L105 10 L120 9',
  };

  /* ═══════════════ KPI CATALOG · personnalisation ═══════════════
   * The owner can pick any 6 of these for the band; the choice persists
   * per vertical in localStorage ('kiwiKpiLayout'). Each entry derives
   * its tile spec from the current range data, so every KPI works across
   * all date ranges without extra datasets. */
  const DEFAULT_MARGIN = { restaurant: 69, spa: 78, boutique: 54, fusion: 69 };
  const TIP_RATE = { restaurant: 0.072, spa: 0.055, boutique: 0, fusion: 0.06 };
  const RANGE_DAYS = { aujourdhui: 1, hier: 1, septJours: 7, trenteJours: 30, moisDernier: 30, trimestre: 90, annee: 365, personnalise: 1 };
  const r1 = (n) => Math.round(n * 10) / 10;
  /* Derived tiles combine the deltas of their inputs. A null input means "no
   * baseline to compare against" — and `null + null` is 0 in JS, which would
   * quietly resurrect the « 0 % » the null exists to suppress. So: any missing
   * component ⇒ the derived tile has no comparison either. With demo data
   * every component is a number, so this behaves exactly like the old r1(sum). */
  const withDelta = (parts, fn) => parts.some((p) => p == null) ? null : r1(fn(...parts));
  /* ── Le chiffre d'affaires ──────────────────────────────────────────────
   * Il se LIT quand on l'a, il ne se reconstitue qu'en dernier recours.
   *
   * Avant, il était toujours reconstitué : nombre de ventes × panier moyen. Or
   * le panier moyen affiché est ARRONDI à l'entier (Math.round, plus bas dans
   * le chemin réel) — 37 ventes pour 4 618 MAD donnent un panier de 124,81 qui
   * s'affiche 125, et le CA reconstitué sort à 4 625. Sept dirhams de trop, nés
   * d'un arrondi d'affichage. Sur trois cents ventes l'écart passe la centaine,
   * et il grandit avec le volume : c'est précisément le commerçant le plus
   * occupé qui voit son tableau de bord s'éloigner le plus de sa caisse.
   *
   * Le total exact existait déjà — realSalesTotals() l'additionne vente par
   * vente et il n'était utilisé nulle part ici. Bénéfice brut, coût matière,
   * pourboires et CA par jour en dérivent tous, donc les cinq tuiles se
   * décalaient ensemble et de façon cohérente : impossible à repérer à l'œil,
   * et faux à chaque fois qu'on rapproche du rouleau de caisse.
   *
   * La démo n'a pas de clé `revenue` : elle continue de passer par le produit,
   * comme avant, avec des paniers déjà entiers — donc rien n'y change. */
  const revOf = (d) => {
    if (d.revenue && d.revenue.value != null) return d.revenue.value;
    return (d.tx && d.panier) ? d.tx.value * d.panier.value : null;
  };
  /* DEFAULT_MARGIN est une marge TYPE DE MÉTIER, bonne pour habiller la démo et
   * rien d'autre. Sur les chiffres d'un vrai commerçant elle n'a aucun droit :
   * appliquée là, elle transformait « je ne connais pas vos coûts » en « votre
   * marge est de 69 % », tous les jours, à l'identique, sur les trois tuiles à
   * la fois. Chez un vrai commerçant, pas de coût saisi ⇒ pas de marge affichée. */
  const margeOf = (d, ctx) => {
    if (d.marge) return d.marge.value;
    if (ownData()) return null;
    return DEFAULT_MARGIN[ctx.venueType] ?? null;
  };
  /* La VARIATION du chiffre d'affaires, même discipline que sa valeur : réelle
   * quand la période la connaît, sinon l'approximation d'origine (la somme des
   * variations du nombre de ventes et du panier moyen). Tout ce qui dérive du
   * CA la reprend, pour que CA, CA/jour, bénéfice, coût matière et pourboires
   * ne puissent pas afficher cinq comparaisons différentes de la même chose. */
  const revDelta = (d) => (d.revenue && d.revenue.delta != null)
    ? d.revenue.delta
    : withDelta([d.tx && d.tx.delta, d.panier && d.panier.delta], (a, b) => a + b);

  const KPI_CATALOG = {
    tx:         { labels: { default: 'Commandes', spa: 'Rendez-vous' }, i18n: 'dash.kpi.tx',
                  desc: 'Nombre de ventes sur la période', derive: (d) => d.tx || null },
    panier:     { labels: { default: 'Panier moyen' }, i18n: 'dash.kpi.basket',
                  desc: 'Montant moyen dépensé par vente', derive: (d) => d.panier || null },
    revenue:    { labels: { default: 'Ventes nettes', en: 'Net sales', ar: 'صافي المبيعات' }, i18n: '',
                  desc: 'Ventes enregistrées moins remboursements; le paiement est ventilé séparément', derive: (d) => { const r = revOf(d); return r == null ? null : { value: r, unit: 'MAD', fmt: 'int', delta: revDelta(d) }; } },
    collected:  { labels: { default: 'Encaissé', en: 'Collected', ar: 'المقبوض' }, i18n: '',
                  desc: 'Paiements identifiés comme encaissés, après remboursements', derive: (d) => d.collected ? { value: d.collected.value, unit: 'MAD', fmt: 'int', delta: d.collected.delta } : null },
    receivable: { labels: { default: 'Créances', en: 'Receivable', ar: 'المستحق' }, i18n: '',
                  desc: 'Ventes à crédit ou livraison non encore encaissées', derive: (d) => d.receivable ? { value: d.receivable.value, unit: 'MAD', fmt: 'int', delta: d.receivable.delta } : null },
    revPerDay:  { labels: { default: 'CA par jour' }, i18n: 'dash.kpi.revPerDay',
                  desc: 'Chiffre d’affaires moyen par jour d’ouverture', derive: (d, ctx) => { const r = revOf(d); return r == null ? null : { value: r / ctx.nbDays, unit: 'MAD', fmt: 'int', delta: revDelta(d) }; } },
    marge:      { labels: { default: 'Marge brute' }, i18n: 'dash.kpi.margin',
                  desc: 'Part du CA conservée après coût matière', derive: (d) => d.marge || null },
    profit:     { labels: { default: 'Bénéfice brut' }, i18n: 'dash.kpi.grossProfit',
                  desc: 'Chiffre d’affaires moins le coût matière', derive: (d, ctx) => { const r = revOf(d), m = margeOf(d, ctx); return (r == null || m == null) ? null : { value: r * m / 100, unit: 'MAD', fmt: 'int', delta: withDelta([revDelta(d), d.marge ? d.marge.delta : 0], (a, b) => a + b) }; } },
    cogs:       { labels: { default: 'Coût matière' }, i18n: 'dash.kpi.cogs',
                  desc: 'Dépense en matières premières', derive: (d, ctx) => { const r = revOf(d), m = margeOf(d, ctx); return (r == null || m == null) ? null : { value: r * (1 - m / 100), unit: 'MAD', fmt: 'int', delta: withDelta([revDelta(d), d.marge ? d.marge.delta : 0], (a, b) => a - b) }; } },
    /* Chez un vrai commerçant, les pourboires sont ceux que la caisse a
       DÉCLARÉS à la clôture des journées de la période (KiwiDayReport, synchro
       store_docs « dayreports »). Ils valaient jusqu'ici CA × 7,2 % : un
       montant inventé, affiché sous « Pourboires » sans qu'un seul dirham de
       pourboire ait été saisi. Aucune journée close sur la période : « · »,
       et la bande par défaut le remplace par un indicateur qui a une valeur.
       La démo garde son estimation : tout y est illustratif. */
    tips:       { labels: { default: 'Pourboires' }, i18n: 'dash.kpi.tips',
                  desc: 'Pourboires déclarés à la clôture, ou saisis à l’encaissement pour une journée ouverte', derive: (d, ctx) => {
                    if (ownData()) {
                      const real = realClosedTips(ctx.range);
                      if (!real) return null;
                      /* Plage à cheval sur l'historique ancien : tant que le résumé n'est pas là, la tuile
                         montre ce que la caisse et les Z connaissent, et le dit (note), plutôt que rien. */
                      if (real.partial) return real.days
                        ? { value: real.sum, unit: 'MAD', fmt: 'int', delta: null, note: 'Partiel · historique ancien en chargement', noteKey: 'dash.kpi.tipsPartial' }
                        : { text: '…', value: 0, unit: '', delta: null };
                      return real.days ? { value: real.sum, unit: 'MAD', fmt: 'int', delta: null } : { text: '·', value: 0, unit: '', fmt: 'int', delta: null };
                    }
                    const r = revOf(d), rate = TIP_RATE[ctx.venueType] || 0;
                    return (r == null || !rate) ? null : { value: r * rate, unit: 'MAD', fmt: 'int', delta: revDelta(d) };
                  } },
    success:    { labels: { default: 'Taux succès', spa: 'Taux remplissage' }, i18n: 'dash.kpi.success',
                  desc: 'Paiements aboutis · créneaux remplis', derive: (d) => d.success || null },
    ratio:      { labels: { default: 'Ratio card / cash' }, i18n: 'dash.kpi.ratio',
                  desc: 'Répartition carte vs espèces', derive: (d) => d.ratio || null },
    regulars:   { labels: { default: 'Clients réguliers', boutique: 'Clients fidèles', spa: 'Clients fidèles' }, i18n: 'dash.kpi.regular',
                  desc: 'Clients déjà venus sur la période', derive: (d) => d.regulars || null },
    retention:  { labels: { default: 'Taux de fidélité' }, i18n: 'dash.kpi.retention',
                  desc: 'Part de clients réguliers parmi les clients venus', derive: (d) => {
                    /* Vrai commerçant : la part des clients identifiés venus sur la
                       période qui étaient déjà venus avant (carnet clients). */
                    if (d.clientMix) return { value: d.clientMix.regulars / d.clientMix.visitors * 100, unit: '%', fmt: 'pct1', delta: d.clientMix.deltaRate };
                    if (!d.tx || !d.regulars) return null; if (d.regulars.text === '·') return { text: '·', value: 0, unit: '', fmt: 'pct1', delta: null }; const pct = d.tx.value ? d.regulars.value / d.tx.value * 100 : 0; return { value: pct, unit: '%', fmt: 'pct1', delta: withDelta([d.regulars.delta, d.tx.delta], (a, b) => a - b) }; } },
    newClients: { labels: { default: 'Nouveaux clients' }, i18n: 'dash.kpi.newClients',
                  desc: 'Premières visites sur la période', derive: (d) => {
                    /* Vrai commerçant : les clients identifiés dont la première
                       visite tombe dans la période (carnet clients). */
                    if (d.clientMix) return { value: d.clientMix.newcomers, unit: '', fmt: 'int', delta: d.clientMix.deltaNew };
                    if (!d.tx || !d.regulars) return null; if (d.regulars.text === '·') return { text: '·', value: 0, unit: '', fmt: 'int', delta: null }; return { value: Math.max(0, d.tx.value - d.regulars.value), unit: '', fmt: 'int', delta: withDelta([d.tx.delta, d.regulars.delta], (a, b) => a - b * 0.3) }; } },
    txPerDay:   { labels: { default: 'Ventes par jour', spa: 'RDV par jour' }, i18n: 'dash.kpi.txPerDay',
                  desc: 'Nombre de ventes moyen par jour d’ouverture', derive: (d, ctx) => d.tx ? { value: d.tx.value / ctx.nbDays, unit: '', fmt: 'int', delta: d.tx.delta } : null },
    occupation: { labels: { default: "Taux d'occupation" }, i18n: 'dash.kpi.occupancy',
                  desc: 'Chambres occupées vs chambres disponibles', derive: (d) => d.occupation || null },
    adr:        { labels: { default: 'ADR · prix moyen / nuit' }, i18n: 'dash.kpi.adr',
                  desc: 'Prix moyen par nuit vendue (Average Daily Rate)', derive: (d) => d.adr || null },
    revpar:     { labels: { default: 'RevPAR' }, i18n: 'dash.kpi.revpar',
                  desc: 'Revenu par chambre disponible · ADR × occupation', derive: (d) => d.revpar || null },
    arrdep:     { labels: { default: 'Arrivées / départs' }, i18n: 'dash.kpi.arrdep',
                  desc: 'Mouvements à la réception sur la période', derive: (d) => d.arrdep || null },
    menage:     { labels: { default: 'Chambres à nettoyer' }, i18n: 'dash.kpi.toClean',
                  desc: 'File ménage · chambres à remettre à blanc', derive: (d) => d.menage || null },
    mixRev:     { labels: { default: 'Mix revenu · ch · resto · spa' }, i18n: 'dash.kpi.revMix',
                  desc: 'Répartition du revenu : chambres / restaurant / hammam', derive: (d) => d.mixRev || null },
    tauxRetour: { labels: { default: 'Taux retour' }, i18n: 'dash.kpi.returnRate',
                  desc: 'Part des ventes remboursée', derive: (d) => d.tauxRetour || null },
    tempsTable: { labels: { default: 'Temps moyen à table', spa: 'Temps moyen en cabine', 'en:spa': 'Average time in treatment room', 'ar:spa': 'متوسط المدة في غرفة العلاج' }, i18n: 'dash.kpi.tableTime',
                  desc: 'Durée moyenne d\'une table, de l\'installation au départ', derive: (d) => d.tempsTable || null },
  };

  function loadKpiLayouts() {
    try { return JSON.parse(localStorage.getItem('kiwiKpiLayout')) || {}; }
    catch (_) { return {}; }
  }
  /* KPI band always shows 6 tiles. Owners can swap any of them via the
   * Personnaliser drawer (e.g. include "Temps moyen à table" instead of
   * one of the defaults). The cap is uniform across all venue types. */
  const KPI_MAX = 6;
  function getKpiLayout(venueType) {
    const L = loadKpiLayouts()[venueType];
    return (Array.isArray(L) && L.length === KPI_MAX && L.every((k) => KPI_CATALOG[k])) ? L : null;
  }
  function saveKpiLayout(venueType, keys) {
    const all = loadKpiLayouts(); all[venueType] = keys;
    try { localStorage.setItem('kiwiKpiLayout', JSON.stringify(all)); } catch (_) {}
  }
  function resetKpiLayout(venueType) {
    const all = loadKpiLayouts(); delete all[venueType];
    try { localStorage.setItem('kiwiKpiLayout', JSON.stringify(all)); } catch (_) {}
  }
  function defaultKpiKeys(venueType) {
    return (window.KiwiVenue?.getKpiSpec?.(venueType) || []).map((s) => s.key);
  }
  function kpiLabel(key, venueType, lang) {
    const c = KPI_CATALOG[key]; if (!c) return key;
    const T = window.KiwiI18n?.T?.[lang] || {};
    return c.labels[lang + ':' + venueType] || T[c.i18n] || c.labels[lang] || c.labels[venueType] || c.labels.default;
  }

  /* ═══════════════ HÔTEL · performance réelle de la bande ═══════════════
   * La bande d'un vrai hôtel affichait « Occupation 0,0 % · ADR 0 MAD · RevPAR
   * 0 MAD · 0 / 0 » codés en dur : deux chambres vendues sur huit se lisaient
   * « 0 % », et un zéro écrit à la main se lit comme une mesure. Les chiffres
   * viennent maintenant de /api/hotel/performance (registre `hotel_reservations`
   * + inventaire du document `rooms`), la même source que la Production mensuelle.
   * Ce qui ne peut pas être calculé honnêtement s'affiche « · », jamais 0. */
  const HOTEL_PERF_TTL = 30000;
  const hotelPerf = new Map();
  function hotelMerchant() {
    try {
      const id = window.KiwiVenue?.getVenue?.();
      return String(window.KiwiStore?.slugFor?.(id) || window.KiwiVenue?.getCurrentVenueData?.()?.slug || window.KiwiMe?.merchant || '').trim();
    } catch (_) { return ''; }
  }
  /* Les nuits d'une plage : la journée d'activité du commerçant, pas minuit de
   * l'appareil. À 02 h, « Aujourd'hui » est encore la nuit d'hier. */
  function hotelRangeNights(range) {
    const [from, to] = closedBounds(range);
    const slug = activeMerchantSlug();
    return { from: merchantDayKey(from + 1, slug), to: merchantDayKey(to - 1, slug) };
  }
  function hotelPreviousNights(w) {
    const span = Math.max(1, Math.round((Date.parse(w.to + 'T00:00:00Z') - Date.parse(w.from + 'T00:00:00Z')) / 864e5) + 1);
    return { from: addMerchantDays(w.from, -span), to: addMerchantDays(w.from, -1) };
  }
  /* Lit (et au besoin recharge) la performance d'une plage. Rend toujours une
   * entrée : { data } quand on sait, { error } quand le serveur ne sait pas,
   * ni l'un ni l'autre tant que la première réponse n'est pas arrivée. */
  function hotelPerfEntry(...args) { return callPart('hotelPerfEntry', this, args); }
  const hotelDelta = (cur, prev) => (cur != null && prev != null && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
  /* Pure : les six tuiles hôtel à partir de deux lectures (période, période
   * précédente de même durée) et de l'état du ménage. Une valeur inconnue est
   * « · » ; une lecture pas encore arrivée est « … » pour que la bande ne
   * clignote pas entre trois et six tuiles. */
  function hotelTilesFrom(...args) { return callPart('hotelTilesFrom', this, args); }
  function hotelBandTiles(range) {
    const w = hotelRangeNights(range);
    const cur = hotelPerfEntry(w);
    const prev = hotelPerfEntry(hotelPreviousNights(w));
    let clean = null;
    try { clean = window.KiwiHotelRooms?.housekeeping?.() || null; } catch (_) {}
    return hotelTilesFrom(cur, prev, clean);
  }
  /* Une réservation prise (réception, page publique, canal) ou un séjour qui
   * bouge doit atteindre la bande sans recharger la page. */
  function hotelPerfInvalidate() {
    hotelPerf.forEach((e) => { e.ts = 0; });
    if (window.KiwiVenue?.getVenueType?.() === 'hotel') { try { renderKpiBand(); } catch (_) {} }
  }
  window.addEventListener('kiwi-hotel-stays-changed', hotelPerfInvalidate);
  window.addEventListener('kiwi-hotel-stays-loaded', () => {
    if (window.KiwiVenue?.getVenueType?.() === 'hotel') { try { renderKpiBand(); } catch (_) {} }
  });
  /* Un hôtel ouvert toute la journée au comptoir : la bande se relit toute seule.
   * Les harnais qui chargent ce fichier sans minuteur (vm nu) ne la reçoivent pas. */
  if (typeof setInterval === 'function') setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    if (window.KiwiVenue?.getVenueType?.() !== 'hotel' || !document.querySelector('[data-kpi-band]')) return;
    hotelPerf.forEach((e) => { e.ts = Math.min(e.ts, Date.now() - HOTEL_PERF_TTL - 1); });
    try { hotelBandTiles(currentRange); } catch (_) {}
  }, HOTEL_PERF_TTL);

  /* « Temps moyen à table » d'un vrai restaurant : la durée des visites de
   * table fermées sur la période (/api/table-time, qui ne retient que les
   * vrais départs : addition réglée, table libérée par un serveur). Même
   * mécanique que l'hôtel : une entrée par fenêtre, relue toutes les cinq
   * minutes au plus, la bande repeinte seulement quand la réponse change. */
  const TABLE_TIME_TTL = 5 * 60 * 1000;
  const tableTime = new Map();
  function tableTimeEntry(...args) { return callPart('tableTimeEntry', this, args); }
  /* Pure : la tuile à partir de la période et de la précédente. Pas encore
   * de réponse : « … ». Pas de source, ou moins de cinq visites : « · ». */
  function tableTimeTileFrom(cur, prev) {
    if (!cur || (!cur.data && !cur.error)) return { text: '…', unit: '', delta: null };
    const d = cur.data;
    if (!d || d.avgMin == null) return { text: '·', unit: '', delta: null };
    const p = prev && prev.data && prev.data.avgMin;
    /* text: null efface le « · » posé plus haut sur le clone remis à zéro. */
    return { text: null, value: d.avgMin, unit: 'min', fmt: 'int', delta: p > 0 ? Math.round(((d.avgMin - p) / p) * 1000) / 10 : null };
  }
  function tableTimeTile(range) {
    const [from, open] = rangeBounds(range);
    /* Une période encore ouverte (aujourd'hui, 7 derniers jours) s'arrête à
     * la fin de la journée commerciale : une clé stable, pas Date.now(). */
    const to = open === Infinity ? merchantDayBounds(merchantDayKey(Date.now(), activeMerchantSlug()), activeMerchantSlug()).to : open;
    const span = Math.max(1, to - from);
    return tableTimeTileFrom(tableTimeEntry(from, to), tableTimeEntry(from - span, from));
  }

  let lastBand = null;
  function renderKpiBand(...args) { return callPart('renderKpiBand', this, args); }

  /* ═══════════════ KPI BAND · personnalisation drawer ═══════════════ */
  function openKpiCustomizer(...args) { return callPart('openKpiCustomizer', this, args); }

  /* ═══════════════ RENDER: REVENUE LINE CHART ═══════════════ */

  function renderRevChart(...args) { return callPart('renderRevChart', this, args); }

  /* ═══════════════ RENDER: PAYMENT MIX DONUT ═══════════════ */

  /* Ventilation réelle des encaissements (venues créées par le marchand).
   * La caisse enregistre un MODE DE PAIEMENT — espèces, carte, tap, QR, lien —
   * et jamais le réseau de la carte : le partage Visa / Mastercard de la démo ne
   * peut pas exister ici. La carte n'avait aucune branche « venue personnalisée »,
   * donc un vrai magasin voyait un anneau vide et quatre rails figés à 0 % malgré
   * ses ventes, et surtout AUCUNE ligne Espèces — le tender dominant d'une
   * boutique marocaine. */
  const REAL_MIX = [
    { key: 'cash', color: '#0B6E4F', fr: 'Espèces',          en: 'Cash',         ar: 'نقدًا' },
    { key: 'card', color: '#46A878', fr: 'Carte bancaire',   en: 'Bank card',    ar: 'بطاقة بنكية' },
    { key: 'tap',  color: '#7DF2B0', fr: 'Kiwi Tap',         en: 'Kiwi Tap',     ar: 'Kiwi Tap' },
    { key: 'qr',   color: '#D99A2B', fr: 'QR / Wallet',      en: 'QR / Wallet',  ar: 'QR / محفظة' },
    { key: 'link', color: '#B08CC8', fr: 'Lien de paiement', en: 'Payment link', ar: 'رابط الدفع' },
    { key: 'transfer', color: 'var(--n-500)', fr: 'Virement', en: 'Bank transfer', ar: 'تحويل بنكي' },
    { key: 'cheque', color: 'var(--n-300)', fr: 'Chèque', en: 'Cheque', ar: 'شيك' },
    { key: 'split', color: 'var(--n-700)', fr: 'Paiement partagé', en: 'Split payment', ar: 'دفع مقسّم' },
    { key: 'other', color: 'var(--n-300)', fr: 'Autre mode', en: 'Other tender', ar: 'طريقة أخرى' },
  ];
  const MIX_EMPTY = {
    fr: 'Aucun encaissement sur la période',
    en: 'No payments in this period',
    ar: 'لا توجد مدفوعات في هذه الفترة',
  };
  // Rows for the active range: only tenders actually used, so a store that takes
  // cash only is not told it has four dead card rails.
  /* Au centre de l'anneau, la démo affiche le total CARTE — d'où « MAD carte »
   * dans le HTML. Une venue réelle y affiche le total TOUS MODES, donc la même
   * légende ferait lire « 1 350 MAD carte » à un commerçant qui n'a encaissé
   * que 450 MAD par carte. Deux légendes, un seul centre. */
  const MIX_CENTER_ALL = { fr: 'MAD encaissé', en: 'MAD collected', ar: 'درهم محصّل' };

  function realMixRows(...args) { return callPart('realMixRows', this, args); }

  function renderMix(...args) { return callPart('renderMix', this, args); }

  const PLAN_NAME = { basic: 'Basic', plus: 'Plus', pro: 'Pro', ultra: 'Ultra', ultimate: 'Ultimate' };
  const PLAN_ACTIVE = { fr: 'Plan en cours', en: 'Current plan', ar: 'الخطة الحالية' };
  const PLAN_PENDING = { fr: 'Plan en cours de vérification', en: 'Plan being verified', ar: 'جارٍ التحقق من الخطة' };
  function renderMixPlan(...args) { return callPart('renderMixPlan', this, args); }

  /* ═══════════════ RENDER: LIVE FEED ═══════════════
   * On "aujourdhui" the feed is driven by KiwiDemoClock.cumTx — same
   * source as the dashboard's Commandes KPI tile + the Commandes drawer.
   * At minute :00 of each real hour cumTx = 0 → feed is empty. As the
   * hour progresses, cumTx grows and the feed shows the last 6 orders
   * (cards + mobile + cash, deterministic seeded by venue+date+orderIdx
   * so the same order #57 always looks the same).
   *
   * For non-today ranges (hier / 7j / 30j) the static FEED_BY_VENUE
   * historical samples are still used. */

  /* Deterministic order generator — same (venue, date, idx) always
   * yields the same order object, so the feed visually stabilises and
   * doesn't shuffle on every clock tick. */
  function buildOrder(...args) { return callPart('buildOrder', this, args); }

  /* Pull the last 6 orders from the simulator's current cumTx. */
  function buildLiveFeed(...args) { return callPart('buildLiveFeed', this, args); }

  // Feed rows for a user-created venue — newest 8 of the merchant's sales.
  function buildCustomFeed(...args) { return callPart('buildCustomFeed', this, args); }

  function renderFeed(...args) { return callPart('renderFeed', this, args); }

  /* ═══════════════ RENDER: SETTLEMENT ═══════════════ */

  function renderSettle(...args) { return callPart('renderSettle', this, args); }

  /* ═══════════════ RENDER: EVENING SERVICE + STOCK (custom-venue aware) ═══
   * These two right-rail cards are static Café Atlas markup. On a user-created
   * venue they would otherwise leak Café Atlas reservations / stock alerts, so
   * we capture the original HTML once and swap in a clean empty state. */
  let _eveningOrig = null, _stockOrig = null;

  const EVENING_EMPTY = {
    fr: { lbl: 'SERVICE DU SOIR · CE SOIR', head: 'Aucune réservation',
          msg: 'Vos réservations du soir s’afficheront ici dès qu’un client réserve une table.' },
    en: { lbl: 'EVENING SERVICE · TONIGHT', head: 'No reservations',
          msg: 'Your evening reservations will appear here as soon as a guest books a table.' },
    ar: { lbl: 'خدمة المساء · الليلة', head: 'لا توجد حجوزات',
          msg: 'ستظهر حجوزات المساء هنا بمجرد أن يحجز أحد الزبائن طاولة.' },
  };
  const STOCK_EMPTY = {
    fr: { title: 'Stock à recommander', head: 'Aucune alerte de stock',
          msg: 'Dès que vous suivez vos ingrédients, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
    en: { title: 'Stock to reorder', head: 'No stock alerts',
          msg: 'Once you track your ingredients, Kiwi flags what drops below your alert level.' },
    ar: { title: 'مخزون للطلب', head: 'لا توجد تنبيهات مخزون',
          msg: 'بمجرد تتبّع مكوّناتك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' },
  };

  /* Ces deux cartes n'existent que dans la démo. Pour un vrai commerce, Kiwi
   * ne calcule aucun score de santé et ne détient aucune cohorte de
   * comparaison : l'état vide promettait « après vos premières semaines » un
   * chiffre qui ne serait jamais venu. La carte est donc masquée ; le texte
   * ci-dessous ne sert qu'à ne laisser aucun chiffre de démo dans le DOM. */
  const HEALTH_EMPTY = {
    fr: { title: 'Score de santé Kiwi', head: 'Non disponible', msg: 'Kiwi ne calcule pas de score de santé pour votre établissement.' },
    en: { title: 'Kiwi health score', head: 'Not available', msg: 'Kiwi does not compute a health score for your venue.' },
    ar: { title: 'نقاط صحة Kiwi', head: 'غير متاح', msg: 'لا يحسب Kiwi نقاط صحة لمنشأتك.' },
  };
  const BENCH_EMPTY = {
    fr: { title: 'Vous vs établissements similaires', head: 'Non disponible', msg: 'Kiwi ne dispose d’aucune donnée d’établissements comparables.' },
    en: { title: 'You vs similar venues', head: 'Not available', msg: 'Kiwi holds no data on comparable venues.' },
    ar: { title: 'أنت مقابل منشآت مماثلة', head: 'غير متاح', msg: 'لا يملك Kiwi بيانات عن منشآت مماثلة.' },
  };
  const PRODUCTS_EMPTY = {
    fr: { sub: 'Aucune vente enregistrée', msg: 'Vos meilleures ventes s’afficheront ici dès la première commande.' },
    en: { sub: 'No sales recorded', msg: 'Your best sellers will appear here after the first order.' },
    ar: { sub: 'لا مبيعات مسجّلة', msg: 'ستظهر أفضل مبيعاتك هنا بعد أوّل طلب.' },
  };
  const PRODUCTS_COVERAGE = {
    fr: (items, covered, total) => `${items} article${items > 1 ? 's' : ''} · détail disponible sur ${covered}/${total} vente${total > 1 ? 's' : ''}`,
    en: (items, covered, total) => `${items} item${items > 1 ? 's' : ''} · line detail available for ${covered}/${total} sale${total > 1 ? 's' : ''}`,
    ar: (items, covered, total) => `${items} منتج · تفاصيل ${covered}/${total} عملية بيع متاحة`,
  };
  const PRODUCTS_NO_LINES = {
    fr: (n) => `Aucune ligne article enregistrée dans ${n} vente${n > 1 ? 's' : ''}. Les totaux restent exacts, mais Kiwi ne peut pas classer les produits.`,
    en: (n) => `No item lines were recorded in ${n} sale${n > 1 ? 's' : ''}. Totals remain accurate, but Kiwi cannot rank products.`,
    ar: (n) => `لا توجد تفاصيل منتجات في ${n} عملية بيع. الإجماليات صحيحة، لكن لا يمكن ترتيب المنتجات.`,
  };
  const PRODUCT_SOLD = {
    fr: (n) => `${n} vendu${n > 1 ? 's' : ''}`,
    en: (n) => `${n} sold`,
    ar: (n) => `${n} مبيع`,
  };
  /* ── Stock à recommander · inventaire réel ───────────────────────────────
   * Boutique and restaurant use different stores and different thresholds;
   * both adapters return the same small, auditable shape to the card. */
  const LOW_STOCK_SEUIL = 5;
  const STOCK_TITLE_STR = { fr: 'Stock à recommander', en: 'Stock to reorder', ar: 'مخزون لإعادة الطلب' };
  const RUPTURE_STR = { fr: 'Rupture · à racheter', en: 'Out of stock · reorder', ar: 'نفد المخزون · أعد الطلب' };
  const LOWSTK_STR = {
    fr: (s) => `Stock bas · seuil ${s}`,
    en: (s) => `Low stock · threshold ${s}`,
    ar: (s) => `مخزون منخفض · العتبة ${s}`,
  };
  const STOCK_SUB_STR = {
    fr: (n) => `${n} article${n > 1 ? 's' : ''} sous le seuil`,
    en: (n) => `${n} item${n > 1 ? 's' : ''} below threshold`,
    ar: (n) => `${n} منتج تحت العتبة`,
  };
  const STOCK_OK_STR = {
    fr: (n) => `Rien à recommander : ${n > 1 ? `${n} articles sont au-dessus de leur seuil configuré` : `${n} article est au-dessus de son seuil configuré`}.`,
    en: (n) => `Nothing to reorder: ${n > 1 ? `${n} items are above their configured thresholds` : `${n} item is above its configured threshold`}.`,
    ar: (n) => `لا شيء لإعادة طلبه: ${n} منتج فوق العتبة المحددة.`,
  };
  const STOCK_NO_THRESHOLDS = {
    fr: (n) => `${n} article${n > 1 ? 's sont suivis' : ' est suivi'}, mais aucun seuil de réapprovisionnement n’est configuré.`,
    en: (n) => `${n} item${n > 1 ? 's are' : ' is'} tracked, but no reorder threshold is configured.`,
    ar: (n) => `يتم تتبع ${n} منتج، لكن لم يتم تحديد عتبة إعادة الطلب.`,
  };
  /* Les noms d'articles sont saisis par le commerçant : ils passent par du HTML,
   * donc ils s'échappent. dateRange.js n'avait pas d'esc() — les autres listes
   * n'affichent que des libellés de démo. */
  const escTxt = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function realLowStock(...args) { return callPart('realLowStock', this, args); }

  function realTopProducts(...args) { return callPart('realTopProducts', this, args); }

  /* ── « Souvent pris ensemble » ─────────────────────────────────────────────
   * Les paires d'articles que les tickets RÉELS de la période réunissent. On
   * ne montre une paire que si elle a été prise ensemble au moins
   * PAIRS_MIN_TOGETHER fois, et seulement à partir de PAIRS_MIN_BASKETS
   * tickets à plusieurs articles : en dessous, trois tickets « thé + msemen »
   * feraient une règle de ce qui n'est qu'un hasard. Chaque paire dit sa
   * preuve : combien de tickets, et quelle part des tickets de l'article le
   * moins vendu des deux contenaient aussi l'autre. Mêmes clés d'article que
   * le classement juste au-dessus (realTopProducts). */
  const PAIRS_MIN_BASKETS = 20, PAIRS_MIN_TOGETHER = 5, PAIRS_MAX_KEYS = 40;
  function realPairs(...args) { return callPart('realPairs', this, args); }
  const PAIRS_STR = {
    fr: { t: 'Souvent pris ensemble',
          why: (n, pct, lead) => `${n} tickets · ${pct} % des tickets avec ${lead}`,
          wait: (n, min) => `Les articles souvent pris ensemble apparaîtront à partir de ${min} tickets à plusieurs articles sur la période (${n} pour l’instant).`,
          none: (n) => `Aucune paire ne revient encore assez souvent sur ces ${n} tickets à plusieurs articles.` },
    en: { t: 'Often bought together',
          why: (n, pct, lead) => `${n} tickets · ${pct}% of tickets with ${lead}`,
          wait: (n, min) => `Items often bought together will appear from ${min} multi-item tickets in the period (${n} so far).`,
          none: (n) => `No pair comes back often enough yet across these ${n} multi-item tickets.` },
    ar: { t: 'يُشترى معاً غالباً',
          why: (n, pct, lead) => `${n} تذاكر · ${pct}٪ من التذاكر التي فيها ${lead}`,
          wait: (n, min) => `ستظهر المنتجات التي تُشترى معاً ابتداءً من ${min} تذكرة بعدة منتجات خلال الفترة (${n} حتى الآن).`,
          none: (n) => `لا يتكرر أي زوج بما يكفي بعد في هذه التذاكر الـ${n} ذات المنتجات المتعددة.` },
  };
  function renderPairs(...args) { return callPart('renderPairs', this, args); }

  const STAFF_ONDUTY_STR = {
    fr: (n, tot) => `${n} sur ${tot} en service aujourd'hui`,
    en: (n, tot) => `${n} of ${tot} on shift today`,
    ar: (n, tot) => `${n} من ${tot} في الخدمة اليوم`,
  };
  const fmtHeures = (h) => `${(window.KiwiNumber?.format(h, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? h.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} h`;
  /* team.js se charge APRÈS ce fichier : au premier rendu KiwiTeam n'existe pas
   * encore et on renvoie null, ce qui laisse l'état vide d'origine. Le listener
   * 'kiwi-team-ready' plus bas repeint la carte dès que le roster est publié. */
  function realRoster() {
    try { return (window.KiwiTeam && window.KiwiTeam.roster) ? window.KiwiTeam.roster() : null; }
    catch (_) { return null; }
  }

  const STAFF_EMPTY = {
    fr: { sub: 'Aucun membre d’équipe', msg: 'Ajoutez votre équipe pour suivre les performances par personne.' },
    en: { sub: 'No team members', msg: 'Add your team to track performance per person.' },
    ar: { sub: 'لا أعضاء فريق', msg: 'أضِف فريقك لتتبّع الأداء لكل شخص.' },
  };
  const INTEG_TITLE = { fr: 'Intégrations', en: 'Integrations', ar: 'عمليات الدمج' };
  const INTEG_SUB = {
    fr: 'Aucune connexion active · choisissez un outil à connecter',
    en: 'No active connection · choose a tool to connect',
    ar: 'لا يوجد اتصال نشط · اختر أداة لربطها',
  };
  const INTEG_NOTCONN = { fr: 'Non connecté', en: 'Not connected', ar: 'غير متّصل' };
  const INTEG_LIST = [
    { n: 'Glovo', logo: 'G', bg: '#F29137' },
    { n: 'Yassir Express', logo: 'Y', bg: '#2B5AA8' },
    { n: 'Shopify', logo: 'S', bg: '#5E8E3E', channel: 'shopify' },
    { n: 'Comptabilité', logo: 'A', bg: '#1D3F6B' },
    { n: 'Bank of Africa', logo: 'B', bg: '#00613E' },
  ];

  /* Standard padded empty-state body for a light .block card. */
  function emptyBlockBody(head, msg) {
    return `<div style="padding:26px 8px 14px;text-align:center;">` +
      `<div style="font-size:14px;font-weight:600;color:var(--ink);">${head}</div>` +
      `<div style="font-size:12.5px;color:var(--n-500);margin-top:6px;line-height:1.5;max-width:340px;margin-inline:auto;">${msg}</div>` +
      `</div>`;
  }
  /* Message-only empty body — for cards whose header already labels them. */
  function emptyListBody(msg) {
    return `<div style="padding:30px 8px 20px;text-align:center;font-size:12.5px;` +
      `color:var(--n-500);line-height:1.5;max-width:320px;margin-inline:auto;">${msg}</div>`;
  }

  /* Grow [data-grow] elements from width 0 to their target — bars draw in
   * on every data change. The double-rAF lets the 0-width frame paint first
   * so the CSS width transition has something to animate from. */
  function growBars(...args) { return callPart('growBars', this, args); }

  /* Merge the current venue's trade vocabulary over a default empty-state
   * dict — a gym's cards talk passages/adhérents, a boutique's talk ventes.
   * KiwiVenue.getVocab returns null for demo venues and plain restaurants,
   * so the defaults pass through untouched. */
  function tradeStr(section, base) {
    const v = window.KiwiVenue?.getVocab?.(section);
    if (!v) return base;
    return typeof base === 'string' ? v : { ...base, ...v };
  }

  /* Card titles owned by JS (not data-i18n) so the trade vocabulary can
   * relabel them per venue. Values mirror the former i18n.js entries. */
  const PRODUCTS_TITLE  = { fr: 'Top produits', en: 'Top products', ar: 'المنتجات الأكثر مبيعًا' };
  const PRODUCTS_MANAGE = { fr: 'Gérer menu →', en: 'Manage menu →', ar: 'إدارة القائمة →' };
  const STAFF_TITLE     = { fr: 'Performance équipe', en: 'Team performance', ar: 'أداء الفريق' };

  let _healthOrig = null, _benchOrig = null, _integOrig = null;

  /* Integrations — for custom venues, show the tools as available-to-connect
   * rather than leaking Café Atlas's live sync figures. */
  function renderInteg(...args) { return callPart('renderInteg', this, args); }

  /* Notification badge — no fake alerts on a fresh custom venue. */
  function renderNotifBadge(...args) { return callPart('renderNotifBadge', this, args); }

  /* Le bandeau « garde » de la pharmacie. Lit les fiches du tableau de bord ; les heures sont
     celles du magasin (KiwiTradeSchema.wallNow), jamais celles de l'appareil. */
  /* Ces destinations n'ont pas de gestionnaire écrit à la main : trade-workspaces.js enregistre
     « nav-<route> » pour chaque fiche du métier. On les nomme ici pour que le lien soit lisible. */
  const BAND_NAV = { duty: 'nav-duty', bookorders: 'nav-bookorders' };
  function dutyBand(...args) { return callPart('dutyBand', this, args); }

  /* Librairie, épicerie : « fin de journée » n'est pas un service du soir avec des tables à réserver.
     L'ancien bandeau disait « Réservations non configurées, ajoutez vos tables » à un libraire. La
     librairie y voit ses commandes spéciales (fiches du tableau de bord, que la caisse écrit) ;
     l'épicerie, qui n'a aucune donnée à y mettre, un état vide honnête sans renvoi vers les tables.
     Même chose pour TOUT commerce de détail (boutique, maison, fleuriste, autre) : ils tombaient
     dans la branche des réservations et lisaient « Réservations non configurées, ajoutez vos
     tables ». Une boutique ne prend pas de réservation ; son état vide est celui de son métier. */
  function retailBand(...args) { return callPart('retailBand', this, args); }

  function renderEvening(...args) { return callPart('renderEvening', this, args); }

  function renderStock(...args) { return callPart('renderStock', this, args); }

  /* ═══════════════ RENDER: TIMELINE WEEK TOTAL ═══════════════ */

  function renderTimeline(...args) { return callPart('renderTimeline', this, args); }

  /* ═══════════════ RENDER: HEALTH SCORE ═══════════════ */

  function renderHealth(...args) { return callPart('renderHealth', this, args); }

  /* ═══════════════ RENDER: BENCHMARK ═══════════════ */

  function renderBench(...args) { return callPart('renderBench', this, args); }

  /* ═══════════════ RENDER: TOP PRODUCTS ═══════════════ */

  function renderProducts(...args) { return callPart('renderProducts', this, args); }

  /* ═══════════════ RENDER: STAFF ═══════════════ */

  function renderStaff(...args) { return callPart('renderStaff', this, args); }

  /* ═══════════════ ACTION HANDLER + I18N HOOK ═══════════════ */

  function onAction(el) {
    const id = el?.dataset?.range;
    if (!id) return;
    setDateRange(id);
  }
  function onCompareToggle() { setShowComparison(!showComparison); }

  function hookI18n(...args) { return callPart('hookI18n', this, args); }

  /* ═══════════════ CUSTOM RANGE · calendar popover ═══════════════
   * A branded two-month range picker that drops under the "Personnalisé"
   * pill and commits a { start, end } pair via commitCustomRange().
   * Self-contained — its own event delegation, no data-action hooks, no
   * Kiwi.modal — so it can be lifted into the caisse app untouched. */

  const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
  const PICKER_STR = {
    fr: { title: 'Période personnalisée', apply: 'Appliquer', cancel: 'Annuler',
          presets: 'Raccourcis', hintStart: 'Sélectionnez la date de début',
          hintEnd: 'Sélectionnez la date de fin', day: 'jour', days: 'jours',
          p7: '7 derniers jours', p14: '14 derniers jours', p30: '30 derniers jours',
          pMonth: 'Ce mois-ci', pLast: 'Mois dernier', p90: '90 derniers jours' },
    en: { title: 'Custom period', apply: 'Apply', cancel: 'Cancel',
          presets: 'Shortcuts', hintStart: 'Pick a start date',
          hintEnd: 'Pick an end date', day: 'day', days: 'days',
          p7: 'Last 7 days', p14: 'Last 14 days', p30: 'Last 30 days',
          pMonth: 'This month', pLast: 'Last month', p90: 'Last 90 days' },
    ar: { title: 'فترة مخصّصة', apply: 'تطبيق', cancel: 'إلغاء',
          presets: 'اختصارات', hintStart: 'اختر تاريخ البداية',
          hintEnd: 'اختر تاريخ النهاية', day: 'يوم', days: 'أيام',
          p7: 'آخر 7 أيام', p14: 'آخر 14 يومًا', p30: 'آخر 30 يومًا',
          pMonth: 'هذا الشهر', pLast: 'الشهر الماضي', p90: 'آخر 90 يومًا' },
  };

  const dpEsc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
  const ymdInt = (d) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
  const sameDay = (a, b) => !!a && !!b && ymdInt(a) === ymdInt(b);
  const shiftMonth = (y, m, n) => { const t = new Date(y, m + n, 1); return { y: t.getFullYear(), m: t.getMonth() }; };
  const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const monthOnly = (d, lang, style) =>
    new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(LOCALES[lang] || LOCALES.fr, { month: style }).format(d);
  const monthLabel = (y, m, lang) => capFirst(new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(
    LOCALES[lang] || LOCALES.fr, { month: 'long', year: 'numeric' }).format(new Date(y, m, 1)));

  /* Human span — "14 mai 2026" · "1 – 14 mai 2026" · "28 avr. – 3 mai 2026"
   * · "28 déc. 2025 – 4 janv. 2026". */
  function fmtHumanRange(...args) { return callPart('fmtHumanRange', this, args); }

  let dpEl = null, dpOutside = null, dpKey = null, dpControl = null;

  function closeCustomPicker(...args) { return callPart('closeCustomPicker', this, args); }

  function openCustomPicker(...args) { return callPart('openCustomPicker', this, args); }

  /* A business-day version of the SAME control and two-month calendar used on
   * Accueil. Rapport journalier and restaurant Commandes supply only their
   * relative-day choices; neither owns another native date input or picker. */
  function mountDaySelector(...args) { return callPart('mountDaySelector', this, args); }

  function registerHandler(...args) { return callPart('registerHandler', this, args); }

  function restoreRange() {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    try { customRange = parseCustom(localStorage.getItem(CUSTOM_KEY)); } catch (_) {}
    currentRange = VALID.includes(stored) ? stored : DEFAULT_RANGE;
    // A stored 'personnalise' only stands if its date pair survived too.
    if (currentRange === 'personnalise' && !customRange) currentRange = DEFAULT_RANGE;
  }

  function init() {
    if (!installPart()) { loadPart().then(init, () => {}); return; }
    if (!/dashboard(?:\.html)?(?:$|\/)/.test(location.pathname)) return;
    restoreRange();
    try { showComparison = localStorage.getItem(CMP_KEY) === '1'; } catch (_) {}

    // Own the custom-picker trigger at capture phase. The shared action router is
    // intentionally extensible and can be registered or wrapped by later bundles;
    // this control must still open even if that registry is temporarily unavailable.
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest?.('.dr-pill-custom[data-action="open-date-picker"]');
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      openCustomPicker();
    }, true);

    registerHandler();
    hookI18n();

    // Restore persisted hero view (today ⇄ chart). Applied before the first
    // renderRevChart() so the chart pane is visible and measures real width.
    try {
      if (localStorage.getItem('kiwiHeroView') === 'chart') {
        const hero = document.querySelector('.hero-today');
        if (hero) {
          hero.classList.add('chart-view');
          const btn = hero.querySelector('.hero-view-toggle');
          if (btn) btn.setAttribute('aria-pressed', 'true');
        }
      }
    } catch (_) {}

    // Reflect persisted compare state into the toggle button on first paint
    queueMicrotask(() => {
      const btn = document.querySelector('[data-rev-compare-btn]');
      if (btn) {
        btn.classList.toggle('on', showComparison);
        btn.setAttribute('aria-pressed', String(showComparison));
      }
    });

    subscribe(renderHero);
    subscribe(renderHeroAi);
    subscribe(renderGoal);
    subscribe(renderHeatmap);
    subscribe(renderHeatmapAi);
    subscribe(renderKpiBand);
    subscribe(renderRevChart);
    subscribe(renderMix);
    subscribe(renderFeed);
    subscribe(renderSettle);
    subscribe(renderEvening);
    subscribe(renderStock);
    subscribe(renderTimeline);
    subscribe(renderHealth);
    subscribe(renderBench);
    subscribe(renderInteg);
    subscribe(renderNotifBadge);
    subscribe(renderProducts);
    subscribe(renderStaff);

    // Re-fire all renders when the UI language changes, so dynamically-rendered
    // copy (feed title/subtitle and other non-data-i18n strings) re-translates
    // immediately — not only on the next date-range switch.
    window.addEventListener('kiwi:langchange', () => {
      subscribers.forEach(fn => { try { fn(currentRange); } catch (_) {} });
    });

    // Subscribe to venue changes — refire all renders so dashboard
    // reskins when user picks a different venue from the sidebar.
    const subVenue = () => {
      if (window.KiwiVenue?.subscribe) {
        window.KiwiVenue.subscribe(() => {
          renderHero();
          renderHeroAi();
          renderGoal();
          renderHeatmap();
          renderHeatmapAi();
          renderKpiBand();
          renderRevChart();
          renderMix();
          renderFeed();
          renderSettle();
          renderEvening();
          renderStock();
          renderTimeline();
          renderHealth();
          renderBench();
          renderInteg();
          renderNotifBadge();
          renderProducts();
          renderStaff();
        });
        return;
      }
      setTimeout(subVenue, 30);
    };
    subVenue();

    // Subscribe to the demo clock — every 3 seconds the "today" data ticks
    // forward (revenue/tx/tips count up); at the top of every real hour the
    // sim restarts at 11h with 0 MAD. Only re-renders if currently viewing
    // the live "aujourdhui" range.
    const subDemo = () => {
      if (window.KiwiDemoClock?.subscribe) {
        window.KiwiDemoClock.subscribe((state, isReset) => {
          const eff = effRange();
          if (eff !== 'aujourdhui') return;
          liveTickInProgress = true;
          demoRenderSim = state;
          try {
            renderHero();
            renderGoal();
            renderKpiBand();
            renderRevChart();
            renderHeatmap();
            renderFeed();
          } finally {
            liveTickInProgress = false;
            demoRenderSim = null;
          }
        });
        return;
      }
      setTimeout(subDemo, 30);
    };
    subDemo();

    // Subscribe to the sales store — when a sale is rung on a user-created venue,
    // whether on this device's keypad or on a till across the room (Live Link
    // bridges those into the same store), every surface that reads it recomputes
    // live. The revenue chart is in that list: it buckets the same KiwiSales rows
    // (see renderRevChart), so leaving it out meant the hero moved on a new sale
    // and the graph underneath it stayed on the last reload's shape.
    const subSales = () => {
      if (window.KiwiSales?.subscribe) {
        window.KiwiSales.subscribe(() => {
          renderHero();
          renderHeroAi();
          renderGoal();
          renderKpiBand();
          renderRevChart();
          renderHeatmap();
          renderHeatmapAi();
          renderFeed();
          renderMix();   // la ventilation par mode de paiement bouge avec chaque vente
          renderProducts();
        });
        /* Une livraison listée ou reçue change les créances, sans vente nouvelle. */
        window.addEventListener('kiwi:deliveries', () => { renderKpiBand(); renderHero(); });
        return;
      }
      setTimeout(subSales, 30);
    };
    subSales();
    window.KiwiSalesSummary?.subscribe(() => {
      subscribers.forEach(fn => { try { fn(currentRange); } catch (_) {} });
    });
    /* « Pourboires » lit les journées closes du classeur, qui arrive du
     * serveur après le premier rendu (et à chaque clôture d'une autre caisse) :
     * la bande se repeint quand il change. day-report.js est chargé en différé. */
    const subDayReports = (tries = 0) => {
      if (window.KiwiDayReport?.subscribe) { window.KiwiDayReport.subscribe(() => { try { renderKpiBand(); } catch (_) {} }); return; }
      if (tries < 200) setTimeout(() => subDayReports(tries + 1), 80);
    };
    subDayReports();
    /* Réguliers, fidélité et nouveaux clients lisent le carnet clients, qui
     * se synchronise après le premier rendu et bouge à chaque vente rattachée. */
    const subClientBook = (tries = 0) => {
      if (window.KiwiClients?.subscribe) { window.KiwiClients.subscribe(() => { try { renderKpiBand(); } catch (_) {} }); return; }
      if (tries < 200) setTimeout(() => subClientBook(tries + 1), 80);
    };
    subClientBook();

    /* Operational cards repaint from their own domain stores. Previously they
     * only refreshed after a page reload, which made a truthful source look
     * stale immediately after a booking or stock count. */
    window.addEventListener('kiwi-reservations-changed', renderEvening);
    window.addEventListener('kiwi-reservations-ready', renderEvening);
    window.addEventListener('kiwi-stock-changed', renderStock);
    window.addEventListener('kiwi-stock-ready', renderStock);
    const subInventory = () => {
      if (window.KiwiInventory?.subscribe) window.KiwiInventory.subscribe(() => renderStock());
      else setTimeout(subInventory, 80);
    };
    subInventory();
    const subCatalog = () => {
      if (window.KiwiBoutiqueCatalog?.subscribe) {
        window.KiwiBoutiqueCatalog.subscribe(() => { renderStock(); renderProducts(); });
      } else setTimeout(subCatalog, 80);
    };
    subCatalog();

    /* day-report.js loads later because it depends on CloudDoc. Until it
     * publishes the venue's business-day cutoff, midnight is only a temporary
     * fallback. Repaint every time-sensitive card when that cutoff arrives. */
    window.addEventListener('kiwi-day-report-ready', () => {
      renderHero(); renderHeroAi(); renderGoal(); renderKpiBand();
      renderRevChart(); renderHeatmap(); renderHeatmapAi(); renderMix();
      renderFeed(); renderEvening(); renderProducts();
    });
    document.addEventListener('kiwi-config', () => renderMix());

    // Re-fit hero amount + re-flow chart on viewport resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const amtEl = document.querySelector('[data-hero-amount]');
        if (amtEl) {
          const eff = effRange();
          const data = vData(heroDataByVenue, eff);
          if (data) fitHeroAmount(amtEl, data.amount);
        }
        // Re-render chart at the new pixel width — no entrance animation
        // because lastRange matches and lastW differs (handled by .no-anim flag).
        renderRevChart();
      }, 140);
    });

    renderSelector();
    renderHero();
    renderHeroAi();
    renderGoal();
    renderHeatmap();
    renderHeatmapAi();
    renderKpiBand();
    renderRevChart();
    renderMix();
    renderFeed();
    renderSettle();
    renderEvening();
    renderStock();
    renderTimeline();
    renderHealth();
    renderBench();
    renderInteg();
    renderNotifBadge();
    renderProducts();
    renderStaff();
  }

  /* Publish before init. The truth reader remains available even if an optional
   * dashboard renderer fails during first paint. */
  window.KiwiDateRange = {
    getDateRange, setDateRange, subscribe, tickLiveRevenue,
    kpiComparisonLabel: () => KPI_DELTA_SUFFIX[getLang()]?.[currentRange] || KPI_DELTA_SUFFIX.fr[currentRange],
    mountDaySelector: mountDaySelector,
    selectedBusinessDay: (range = currentRange) => {
      // Same civil timezone/cutoff as functions/api/_business-day.js, including
      // boutiques. This reference must not inherit a midnight chart cutoff.
      const parts = Object.fromEntries(new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', {
        timeZone:merchantTimeZone(activeMerchantSlug()),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
      }).formatToParts(new Date()).map(p => [p.type,p.value]));
      const civil = `${parts.year}-${parts.month}-${parts.day}`;
      const today = +parts.hour < 5 ? addMerchantDays(civil,-1) : civil;
      if (range === 'aujourdhui') return today;
      if (range === 'hier') return addMerchantDays(today,-1);
      return range === 'personnalise' && customRange && dateToIso(customRange.start) === dateToIso(customRange.end)
        ? dateToIso(customRange.start) : null;
    },
    getShowComparison, setShowComparison,
    bounds: (range) => rangeBounds(range == null ? currentRange : range),
    /* L'accueil du kit (étape 5) : ce que les rendus viennent de dessiner. */
    home: () => Object.assign({ range: currentRange }, homeStore()),
    todayPace,
    insights: { summary: realInsightSummary, hero: buildRealHeroRec, heatmap: buildRealHeatmapRec },
    _truth: { tenderBucket, realMixRows, realTopProducts, realLowStock, realInsightSummary, buildRealHeroRec, buildRealHeatmapRec },
  };

  Object.defineProperty(window.KiwiDateRange, '__internal', { value: partState });
  function startDashboardRendering() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  window.addEventListener('kiwi:z-reference', () => { renderHero(); });
  document.addEventListener('kiwi:operator-snapshot', () => {
    renderHero(); renderGoal(); renderKpiBand(); renderRevChart();
  });
  /* Les dépôts du pressing arrivent par le document pressing-orders, après le
     premier rendu : sans cet abonnement la tuile restait sur le journal des
     ventes jusqu'au prochain changement de période. */
  window.addEventListener('kiwi:pressing-ops', () => { try { renderKpiBand(); } catch (_) {} });
  /* Le titre et les pastilles ne lisent aucune donnée : ils se peignent
   * derrière l'écran de code, sur la période enregistrée et dans la langue de
   * l'écran. Ils attendaient le premier rendu complet, qui passe après le
   * message d'accueil : un commerçant en arabe lisait alors « Aujourd'hui »,
   * en français, sous la pastille « اليوم » allumée, alors que sa période
   * était « Mois dernier ». init() repeint ensuite, à l'identique. */
  function paintSelectorEarly() {
    if (!/dashboard(?:\.html)?(?:$|\/)/.test(location.pathname)) return;
    try { restoreRange(); renderSelector(); } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintSelectorEarly, { once: true });
  else paintSelectorEarly();
  if (window.KiwiDashboardBoot?.whenUnlocked) window.KiwiDashboardBoot.whenUnlocked(startDashboardRendering);
  else startDashboardRendering();

  /* Ce fichier est `defer` : à son exécution readyState vaut déjà 'interactive',
   * donc init() part TOUT DE SUITE — avant pages-pro.js, chargé plus bas, qui
   * publie la clé du catalogue. Le premier rendu de la bande ne pouvait donc pas
   * résoudre les coûts et retombait sur la marge forfaitaire : le commerçant
   * voyait 729 MAD, puis 736 dès qu'il touchait une pastille de période. On
   * rejoue la bande une fois, quand la clé est publiée. */
  window.addEventListener('kiwi-catalog-key', () => {
    try { renderKpiBand(); } catch (_) {}
    try { renderProducts(); } catch (_) {}
    try { renderStock(); } catch (_) {}
  }, { once: true });

  /* Même problème pour l'équipe : team.js est chargé après pages-pro.js, donc
   * encore plus tard. Il annonce son roster et la carte se repeint une fois. */
  window.addEventListener('kiwi-team-ready', () => {
    try { renderStaff(); } catch (_) {}
  }, { once: true });

  /* Et à CHAQUE changement de roster ou d'heures — pas une seule fois : on
   * saisit les heures sur Paie puis on revient à l'accueil, la carte doit déjà
   * le savoir. */
  window.addEventListener('kiwi-team-changed', () => {
    try { renderStaff(); } catch (_) {}
  });

  /* ─── Live tick API · called from polish.js when a new fake tx lands ─── */
  function tickLiveRevenue(...args) { return callPart('tickLiveRevenue', this, args); }

  /* `bounds` sort d'ici parce que la fenêtre « en ce moment » doit avoir UNE
   * définition, pas une par écran. Elle était privée, alors trois surfaces se
   * sont mises à compter sans fenêtre du tout : la pastille « Commandes » de la
   * barre latérale (venues.js), la page Ventes (pages-pro.js) et les lignes du
   * fil en direct (buildCustomFeed, plus haut) additionnaient TOUT l'historique
   * du navigateur pendant que la tuile « Commandes » — le même mot, à trente
   * centimètres — ne comptait que la période choisie. Au troisième jour d'un
   * vrai commerçant, la pastille disait 47 et la tuile 6. Aucune des deux ne
   * mentait ; elles ne répondaient simplement pas à la même question, et rien
   * à l'écran ne le disait.
   *
   * Exporter la fonction plutôt que recopier ses quatre lignes : une borne
   * recopiée est une borne qu'on corrigera à un seul endroit sur trois. */
})();
