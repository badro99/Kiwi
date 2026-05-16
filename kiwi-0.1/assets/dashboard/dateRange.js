/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Global dashboard date-range selector
 *
 * Holds the selected range ('aujourdhui' | 'hier' | 'septJours' |
 * 'trenteJours' | 'personnalise'), persists to localStorage, lets sections
 * subscribe to changes, and renders every data-bearing block on the dashboard.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const STORAGE_KEY = 'kiwiDateRange';
  const CMP_KEY = 'kiwiRevCompare';
  const DEFAULT_RANGE = 'aujourdhui';
  const VALID = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'personnalise'];
  const subscribers = new Set();
  let currentRange = DEFAULT_RANGE;
  let showComparison = false;

  const getLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const getDateRange = () => currentRange;
  const getShowComparison = () => showComparison;
  const getCurrentVenue = () => (window.KiwiVenue?.getVenue?.() || 'cafeAtlas');
  // Resolve a venue-keyed table for the active venue + range, with cafeAtlas fallback.
  function vData(table, range) {
    const v = getCurrentVenue();
    const eff = range === 'personnalise' ? 'aujourdhui' : range;
    return table?.[v]?.[eff] ?? table?.cafeAtlas?.[eff];
  }

  /* ═══════════════ STRINGS ═══════════════ */

  const RANGE_STR = {
    fr: { aujourdhui: "Aujourd'hui", hier: 'Hier', septJours: '7 derniers jours', trenteJours: '30 derniers jours', personnalise: 'Période personnalisée' },
    en: { aujourdhui: 'Today',       hier: 'Yesterday', septJours: 'Last 7 days', trenteJours: 'Last 30 days', personnalise: 'Custom period' },
    ar: { aujourdhui: 'اليوم',       hier: 'أمس',       septJours: 'آخر 7 أيام',  trenteJours: 'آخر 30 يوما', personnalise: 'فترة مخصصة' },
  };

  const HERO_LABEL = {
    fr: { aujourdhui: "ENCAISSÉ AUJOURD'HUI", hier: 'ENCAISSÉ HIER', septJours: 'ENCAISSÉ 7 JOURS', trenteJours: 'ENCAISSÉ 30 JOURS' },
    en: { aujourdhui: 'CASHED TODAY',         hier: 'CASHED YESTERDAY', septJours: 'CASHED 7 DAYS', trenteJours: 'CASHED 30 DAYS' },
    ar: { aujourdhui: 'المقبوض اليوم',        hier: 'المقبوض أمس',     septJours: 'المقبوض في 7 أيام', trenteJours: 'المقبوض في 30 يومًا' },
  };

  const DELTA_LABELS = {
    fr: {
      aujourdhui:   { hier: 'VS HIER', semaine: 'VS SEMAINE', mois: 'VS MOIS DERNIER' },
      hier:         { hier: 'VS AVANT-HIER', semaine: 'VS SEMAINE', mois: 'VS MOIS' },
      septJours:    { semaine: 'VS 7 JOURS PRÉCÉDENTS', mois: 'VS MOIS' },
      trenteJours:  { mois: 'VS 30 JOURS PRÉCÉDENTS' },
      personnalise: { hier: 'VS HIER', semaine: 'VS SEMAINE', mois: 'VS MOIS DERNIER' },
    },
    en: {
      aujourdhui:   { hier: 'VS YESTERDAY', semaine: 'VS WEEK', mois: 'VS LAST MONTH' },
      hier:         { hier: 'VS DAY BEFORE', semaine: 'VS WEEK', mois: 'VS MONTH' },
      septJours:    { semaine: 'VS PREVIOUS 7 DAYS', mois: 'VS MONTH' },
      trenteJours:  { mois: 'VS PREVIOUS 30 DAYS' },
      personnalise: { hier: 'VS YESTERDAY', semaine: 'VS WEEK', mois: 'VS LAST MONTH' },
    },
    ar: {
      aujourdhui:   { hier: 'مقابل أمس', semaine: 'مقابل الأسبوع', mois: 'مقابل الشهر الماضي' },
      hier:         { hier: 'مقابل أول أمس', semaine: 'مقابل الأسبوع', mois: 'مقابل الشهر' },
      septJours:    { semaine: 'مقابل 7 أيام السابقة', mois: 'مقابل الشهر' },
      trenteJours:  { mois: 'مقابل 30 يومًا السابقة' },
      personnalise: { hier: 'مقابل أمس', semaine: 'مقابل الأسبوع', mois: 'مقابل الشهر الماضي' },
    },
  };
  const NET_LABEL = { fr: 'NET APRÈS KIWI', en: 'NET AFTER KIWI', ar: 'الصافي بعد كيوي' };

  const KPI_DELTA_SUFFIX = {
    fr: { aujourdhui: 'vs hier', hier: 'vs avant-hier', septJours: 'vs 7 jours préc.', trenteJours: 'vs 30 jours préc.', personnalise: 'vs hier' },
    en: { aujourdhui: 'vs yesterday', hier: 'vs day before', septJours: 'vs prev. 7 days', trenteJours: 'vs prev. 30 days', personnalise: 'vs yesterday' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام السابقة', trenteJours: 'مقابل 30 يومًا السابقة', personnalise: 'مقابل أمس' },
  };

  // Caption shown under the chart title when "Comparer" is on, by selected range.
  const COMPARE_CAPTION = {
    fr: { aujourdhui: 'vs. Hier', hier: 'vs. Avant-hier', septJours: 'vs. 7 jours précédents', trenteJours: 'vs. 30 jours précédents', personnalise: 'vs. Période précédente' },
    en: { aujourdhui: 'vs. Yesterday', hier: 'vs. Day before', septJours: 'vs. Previous 7 days', trenteJours: 'vs. Previous 30 days', personnalise: 'vs. Previous period' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام السابقة', trenteJours: 'مقابل 30 يومًا السابقة', personnalise: 'مقابل الفترة السابقة' },
  };
  // Short label used inside the on-chart tooltip — must fit in ~210px.
  const COMPARE_SHORT = {
    fr: { aujourdhui: 'vs hier', hier: 'vs avant-hier', septJours: 'vs 7j préc.', trenteJours: 'vs 30j préc.', personnalise: 'vs préc.' },
    en: { aujourdhui: 'vs yest.', hier: 'vs day before', septJours: 'vs prev. 7d', trenteJours: 'vs prev. 30d', personnalise: 'vs prev.' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام', trenteJours: 'مقابل 30 يومًا', personnalise: 'مقابل السابق' },
  };

  const HH_SUB = {
    fr: { aujourdhui: "Intensité horaire aujourd'hui", hier: 'Intensité horaire hier', septJours: 'Intensité horaire moyenne — 7 derniers jours', trenteJours: 'Intensité horaire moyenne — 30 derniers jours', personnalise: 'Intensité horaire — période personnalisée' },
    en: { aujourdhui: 'Hourly intensity today', hier: 'Hourly intensity yesterday', septJours: 'Average hourly intensity — last 7 days', trenteJours: 'Average hourly intensity — last 30 days', personnalise: 'Hourly intensity — custom period' },
    ar: { aujourdhui: 'كثافة الساعات اليوم', hier: 'كثافة الساعات أمس', septJours: 'متوسط الكثافة الساعية — آخر 7 أيام', trenteJours: 'متوسط الكثافة الساعية — آخر 30 يومًا', personnalise: 'كثافة الساعات — فترة مخصصة' },
  };
  const COVERS_LABEL = { fr: 'couverts', en: 'guests', ar: 'زبون' };

  const FEED_TITLE = { fr: { aujourdhui: 'Transactions en direct', hier: 'Transactions · hier', septJours: 'Transactions · 7 derniers jours', trenteJours: 'Transactions · 30 derniers jours', personnalise: 'Transactions en direct' },
                       en: { aujourdhui: 'Live transactions', hier: 'Yesterday\'s transactions', septJours: 'Transactions · last 7 days', trenteJours: 'Transactions · last 30 days', personnalise: 'Live transactions' },
                       ar: { aujourdhui: 'المعاملات المباشرة', hier: 'معاملات أمس', septJours: 'معاملات · آخر 7 أيام', trenteJours: 'معاملات · آخر 30 يومًا', personnalise: 'المعاملات المباشرة' } };
  const FEED_SUB =   { fr: { aujourdhui: '6 dernières · flux temps réel', hier: 'Dernières du service de hier', septJours: 'Échantillon · 7 derniers jours', trenteJours: 'Échantillon · 30 derniers jours', personnalise: '6 dernières · flux temps réel' },
                       en: { aujourdhui: 'Last 6 · real-time feed', hier: 'Last 6 from yesterday', septJours: 'Sample · last 7 days', trenteJours: 'Sample · last 30 days', personnalise: 'Last 6 · real-time feed' },
                       ar: { aujourdhui: 'آخر 6 · تدفّق لحظي', hier: 'آخر 6 من أمس', septJours: 'عيّنة · آخر 7 أيام', trenteJours: 'عيّنة · آخر 30 يومًا', personnalise: 'آخر 6 · تدفّق لحظي' } };

  const PRODUCTS_SUB = { fr: { aujourdhui: "Aujourd'hui · tous les items", hier: 'Hier · tous les items', septJours: '7 derniers jours · tous les items', trenteJours: '30 derniers jours · tous les items', personnalise: 'Période personnalisée · tous les items' },
                         en: { aujourdhui: 'Today · all items', hier: 'Yesterday · all items', septJours: 'Last 7 days · all items', trenteJours: 'Last 30 days · all items', personnalise: 'Custom period · all items' },
                         ar: { aujourdhui: 'اليوم · جميع العناصر', hier: 'أمس · جميع العناصر', septJours: 'آخر 7 أيام · جميع العناصر', trenteJours: 'آخر 30 يومًا · جميع العناصر', personnalise: 'فترة مخصصة · جميع العناصر' } };
  const STAFF_SUB =    { fr: { aujourdhui: 'Service en cours · PIN connecté', hier: 'Service de hier · clos', septJours: 'Cumul 7 jours · par employé', trenteJours: 'Cumul 30 jours · par employé', personnalise: 'Période personnalisée · par employé' },
                         en: { aujourdhui: 'Service in progress · PIN connected', hier: 'Yesterday\'s service · closed', septJours: '7-day total · per employee', trenteJours: '30-day total · per employee', personnalise: 'Custom period · per employee' },
                         ar: { aujourdhui: 'الخدمة جارية · رموز PIN متّصلة', hier: 'خدمة أمس · مغلقة', septJours: 'إجمالي 7 أيام · لكل موظف', trenteJours: 'إجمالي 30 يومًا · لكل موظف', personnalise: 'فترة مخصصة · لكل موظف' } };
  const HEALTH_SUB =   { fr: { aujourdhui: 'Mesuré sur 90 jours · facteurs activés', hier: 'Mesuré au close de hier', septJours: 'Mesuré sur les 7 derniers jours', trenteJours: 'Mesuré sur les 30 derniers jours', personnalise: 'Période personnalisée · facteurs activés' },
                         en: { aujourdhui: 'Measured over 90 days · active factors', hier: 'Measured at yesterday\'s close', septJours: 'Measured over the last 7 days', trenteJours: 'Measured over the last 30 days', personnalise: 'Custom period · active factors' },
                         ar: { aujourdhui: 'محسوب على 90 يومًا · عوامل مُفعَّلة', hier: 'محسوب عند إقفال أمس', septJours: 'محسوب على آخر 7 أيام', trenteJours: 'محسوب على آخر 30 يومًا', personnalise: 'فترة مخصصة · عوامل مُفعَّلة' } };
  const BENCH_SUB =    { fr: { aujourdhui: '147 cafés casablancais · même gamme de ticket moyen', hier: 'Snapshot du close de hier · 147 cafés', septJours: 'Moyennes sur 7 jours · 147 cafés', trenteJours: 'Moyennes sur 30 jours · 147 cafés', personnalise: '147 cafés · période personnalisée' },
                         en: { aujourdhui: '147 Casablanca cafés · same avg ticket range', hier: 'Yesterday\'s close · 147 cafés', septJours: '7-day averages · 147 cafés', trenteJours: '30-day averages · 147 cafés', personnalise: '147 cafés · custom period' },
                         ar: { aujourdhui: '147 مقهى بالدار البيضاء · نفس متوسّط التذكرة', hier: 'إقفال أمس · 147 مقهى', septJours: 'متوسّطات على 7 أيام · 147 مقهى', trenteJours: 'متوسّطات على 30 يومًا · 147 مقهى', personnalise: '147 مقهى · فترة مخصصة' } };

  /* ═══════════════ DATA TABLES ═══════════════ */

  const heroDataByVenue = {
    cafeAtlas: {
      aujourdhui:  { amount: 27512.50, deltaHier: 3.2,  deltaSemaine: 18,   deltaMois: 9,  netAfterKiwi: 23091  },
      hier:        { amount: 24820.00, deltaHier: -1.8, deltaSemaine: 12,   deltaMois: 6,  netAfterKiwi: 20640  },
      septJours:   { amount: 198400.00,deltaHier: null, deltaSemaine: 22,   deltaMois: 11, netAfterKiwi: 165280 },
      trenteJours: { amount: 842300.00,deltaHier: null, deltaSemaine: null, deltaMois: 15, netAfterKiwi: 702800 },
      personnalise: null,
    },
    maisonMansour: {
      aujourdhui:  { amount: 11820.00, deltaHier: -2.4, deltaSemaine: 11,   deltaMois: 7,  netAfterKiwi: 9920   },
      hier:        { amount: 12110.00, deltaHier: 1.8,  deltaSemaine: 8,    deltaMois: 5,  netAfterKiwi: 10170  },
      septJours:   { amount: 84800.00, deltaHier: null, deltaSemaine: 14,   deltaMois: 8,  netAfterKiwi: 71200  },
      trenteJours: { amount: 358200.00,deltaHier: null, deltaSemaine: null, deltaMois: 12, netAfterKiwi: 300700 },
      personnalise: null,
    },
    spaBahia: {
      aujourdhui:  { amount: 8950.00,  deltaHier: 6.8,  deltaSemaine: 22,   deltaMois: 14, netAfterKiwi: 7510   },
      hier:        { amount: 8380.00,  deltaHier: -3.1, deltaSemaine: 16,   deltaMois: 9,  netAfterKiwi: 7035   },
      septJours:   { amount: 64200.00, deltaHier: null, deltaSemaine: 19,   deltaMois: 11, netAfterKiwi: 53890  },
      trenteJours: { amount: 269400.00,deltaHier: null, deltaSemaine: null, deltaMois: 16, netAfterKiwi: 226300 },
      personnalise: null,
    },
  };

  // Goal bar — current revenue vs target for the selected venue + range.
  const goalByVenue = {
    cafeAtlas: {
      aujourdhui:  { goal: 28000,  current: 27512.50 },
      hier:        { goal: 28000,  current: 24820   },
      septJours:   { goal: 196000, current: 198400  },
      trenteJours: { goal: 840000, current: 842300  },
    },
    maisonMansour: {
      aujourdhui:  { goal: 12000,  current: 11820   },
      hier:        { goal: 12000,  current: 12110   },
      septJours:   { goal: 84000,  current: 84800   },
      trenteJours: { goal: 360000, current: 358200  },
    },
    spaBahia: {
      aujourdhui:  { goal: 9000,   current: 8950    },
      hier:        { goal: 9000,   current: 8380    },
      septJours:   { goal: 63000,  current: 64200   },
      trenteJours: { goal: 270000, current: 269400  },
    },
  };
  const GOAL_LABEL = {
    fr: { aujourdhui: 'OBJECTIF JOUR', hier: 'OBJECTIF JOUR', septJours: 'OBJECTIF SEMAINE', trenteJours: 'OBJECTIF MOIS', personnalise: 'OBJECTIF JOUR' },
    en: { aujourdhui: 'DAILY GOAL', hier: 'DAILY GOAL', septJours: 'WEEKLY GOAL', trenteJours: 'MONTHLY GOAL', personnalise: 'DAILY GOAL' },
    ar: { aujourdhui: 'هدف اليوم', hier: 'هدف اليوم', septJours: 'هدف الأسبوع', trenteJours: 'هدف الشهر', personnalise: 'هدف اليوم' },
  };

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

  const kpiByVenue = {
    cafeAtlas: {
      aujourdhui: {
        tx:       { value: 182,    unit: '',     fmt: 'int',  delta: 15.2 },
        panier:   { value: 134,    unit: 'MAD',  fmt: 'int',  delta: 1.5 },
        tips:     { value: 1867,   unit: 'MAD',  fmt: 'int',  delta: 32 },
        success:  { value: 99.34,  unit: '%',    fmt: 'pct2', delta: 0.2 },
        ratio:    { text: '68 / 32', unit: '%',                delta: 4 },
        regulars: { value: 47,     unit: '/ 182',fmt: 'int',  delta: 26 },
      },
      hier: {
        tx:       { value: 168,    unit: '',     fmt: 'int',  delta: 8.4 },
        panier:   { value: 132,    unit: 'MAD',  fmt: 'int',  delta: 0.8 },
        tips:     { value: 1620,   unit: 'MAD',  fmt: 'int',  delta: 24 },
        success:  { value: 99.18,  unit: '%',    fmt: 'pct2', delta: 0.1 },
        ratio:    { text: '64 / 36', unit: '%',                delta: 2 },
        regulars: { value: 42,     unit: '/ 168',fmt: 'int',  delta: 25 },
      },
      septJours: {
        tx:       { value: 1240,   unit: '',     fmt: 'int',  delta: 18 },
        panier:   { value: 138,    unit: 'MAD',  fmt: 'int',  delta: 3 },
        tips:     { value: 11200,  unit: 'MAD',  fmt: 'int',  delta: 35 },
        success:  { value: 99.28,  unit: '%',    fmt: 'pct2', delta: 0.3 },
        ratio:    { text: '66 / 34', unit: '%',                delta: 5 },
        regulars: { value: 286,    unit: '/ 1240',fmt:'int',  delta: 23 },
      },
      trenteJours: {
        tx:       { value: 5320,   unit: '',     fmt: 'int',  delta: 21 },
        panier:   { value: 142,    unit: 'MAD',  fmt: 'int',  delta: 5 },
        tips:     { value: 48300,  unit: 'MAD',  fmt: 'int',  delta: 40 },
        success:  { value: 99.32,  unit: '%',    fmt: 'pct2', delta: 0.5 },
        ratio:    { text: '68 / 32', unit: '%',                delta: 6 },
        regulars: { value: 1240,   unit: '/ 5320',fmt:'int',  delta: 24 },
      },
      personnalise: null,
    },
    maisonMansour: {
      aujourdhui: {
        tx:         { value: 42,    unit: '',     fmt: 'int',  delta: 12 },
        panier:     { value: 282,   unit: 'MAD',  fmt: 'int',  delta: 4.5 },
        tauxRetour: { value: 6.2,   unit: '%',    fmt: 'pct1', delta: -1.3 },
        success:    { value: 99.6,  unit: '%',    fmt: 'pct2', delta: 0.1 },
        ratio:      { text: '85 / 15', unit: '%',               delta: 3 },
        regulars:   { value: 11,    unit: '/ 42', fmt: 'int',  delta: 18 },
      },
      hier: {
        tx:         { value: 43,    unit: '',     fmt: 'int',  delta: 8 },
        panier:     { value: 282,   unit: 'MAD',  fmt: 'int',  delta: 1.2 },
        tauxRetour: { value: 5.8,   unit: '%',    fmt: 'pct1', delta: -1.8 },
        success:    { value: 99.5,  unit: '%',    fmt: 'pct2', delta: 0.0 },
        ratio:      { text: '83 / 17', unit: '%',               delta: 2 },
        regulars:   { value: 12,    unit: '/ 43', fmt: 'int',  delta: 20 },
      },
      septJours: {
        tx:         { value: 295,   unit: '',     fmt: 'int',  delta: 14 },
        panier:     { value: 287,   unit: 'MAD',  fmt: 'int',  delta: 3 },
        tauxRetour: { value: 6.4,   unit: '%',    fmt: 'pct1', delta: -0.8 },
        success:    { value: 99.4,  unit: '%',    fmt: 'pct2', delta: 0.2 },
        ratio:      { text: '84 / 16', unit: '%',               delta: 4 },
        regulars:   { value: 78,    unit: '/ 295',fmt: 'int',  delta: 16 },
      },
      trenteJours: {
        tx:         { value: 1240,  unit: '',     fmt: 'int',  delta: 18 },
        panier:     { value: 289,   unit: 'MAD',  fmt: 'int',  delta: 5 },
        tauxRetour: { value: 6.1,   unit: '%',    fmt: 'pct1', delta: -1.4 },
        success:    { value: 99.5,  unit: '%',    fmt: 'pct2', delta: 0.3 },
        ratio:      { text: '85 / 15', unit: '%',               delta: 5 },
        regulars:   { value: 320,   unit: '/ 1240',fmt:'int',  delta: 21 },
      },
      personnalise: null,
    },
    spaBahia: {
      aujourdhui: {
        tx:       { value: 20,    unit: '',     fmt: 'int',  delta: 14 },
        panier:   { value: 447,   unit: 'MAD',  fmt: 'int',  delta: 6.5 },
        tips:     { value: 1340,  unit: 'MAD',  fmt: 'int',  delta: 28 },
        success:  { value: 92.5,  unit: '%',    fmt: 'pct1', delta: 3.2 },
        ratio:    { text: '92 / 8', unit: '%',                 delta: 2 },
        regulars: { value: 14,    unit: '/ 20', fmt: 'int',  delta: 12 },
      },
      hier: {
        tx:       { value: 18,    unit: '',     fmt: 'int',  delta: 5 },
        panier:   { value: 466,   unit: 'MAD',  fmt: 'int',  delta: 2 },
        tips:     { value: 1260,  unit: 'MAD',  fmt: 'int',  delta: 18 },
        success:  { value: 89.3,  unit: '%',    fmt: 'pct1', delta: -1.5 },
        ratio:    { text: '90 / 10', unit: '%',                 delta: -2 },
        regulars: { value: 13,    unit: '/ 18', fmt: 'int',  delta: 14 },
      },
      septJours: {
        tx:       { value: 142,   unit: '',     fmt: 'int',  delta: 19 },
        panier:   { value: 452,   unit: 'MAD',  fmt: 'int',  delta: 4 },
        tips:     { value: 9140,  unit: 'MAD',  fmt: 'int',  delta: 24 },
        success:  { value: 91.8,  unit: '%',    fmt: 'pct1', delta: 2.7 },
        ratio:    { text: '91 / 9', unit: '%',                 delta: 3 },
        regulars: { value: 92,    unit: '/ 142',fmt: 'int',  delta: 18 },
      },
      trenteJours: {
        tx:       { value: 580,   unit: '',     fmt: 'int',  delta: 22 },
        panier:   { value: 464,   unit: 'MAD',  fmt: 'int',  delta: 6 },
        tips:     { value: 38600, unit: 'MAD',  fmt: 'int',  delta: 34 },
        success:  { value: 92.1,  unit: '%',    fmt: 'pct1', delta: 4.5 },
        ratio:    { text: '92 / 8', unit: '%',                 delta: 5 },
        regulars: { value: 412,   unit: '/ 580',fmt: 'int',  delta: 20 },
      },
      personnalise: null,
    },
  };

  const revChartByVenue = {
    cafeAtlas: {
    // Today: hourly cumulative across the full opening band (11h → 02h).
    // Past hours (≤14h) are real cumul; post-14h are projected forward to end of service.
    // Compare line is yesterday's full-day cumul at the same hours.
    aujourdhui: {
      rangeBadge: "AUJOURD'HUI · LIVE",
      sub: 'Cumul horaire · service en cours',
      xLabels: ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'],
      visibleXIdx: [1, 3, 5, 7, 9, 11, 13, 15], // every 2h: 12h, 14h, 16h, 18h, 20h, 22h, 00h, 02h
      rev:    [0, 4800, 12200, 27512.50, 29400, 30600, 31800, 35200, 39400, 43000, 45200, 47000, 48200, 49000, 49600, 50000],
      revPrev:[0,  600,  2200,  4400,    5400,  6000,  6800,  9400, 13800, 18200, 21400, 23200, 24200, 24600, 24800, 24820],
      yTicks: [0, 12500, 25000, 37500, 50000],
      legendPrimary: "Cumul aujourd'hui · 27 512,50 MAD",
      legendCompare: 'Cumul hier · 24 820 MAD',
    },
    hier: {
      rangeBadge: 'HIER · COMPLET',
      sub: "Cumul horaire · journée d'hier",
      xLabels: ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'],
      visibleXIdx: [1, 3, 5, 7, 9, 11, 13, 15],
      rev:    [0,  600,  2200,  4400,  5400,  6000,  6800,  9400, 13800, 18200, 21400, 23200, 24200, 24600, 24800, 24820],
      revPrev:[0,  500,  1900,  3800,  4700,  5300,  6000,  8400, 12500, 16400, 19400, 21000, 21800, 22200, 22600, 22800],
      yTicks: [0, 6500, 13000, 19500, 26000],
      legendPrimary: 'Cumul hier · 24 820 MAD',
      legendCompare: 'Cumul avant-hier · 22 800 MAD',
    },
    septJours: {
      rangeBadge: '7 DERNIERS JOURS',
      sub: 'Total journalier · 7 derniers jours',
      xLabels: ['Sam 18','Dim 19','Lun 20','Mar 21','Mer 22','Jeu 23','Ven 24'],
      visibleXIdx: [0, 1, 2, 3, 4, 5, 6],
      rev:    [18200, 22500, 17800, 19200, 21300, 25600, 27512],
      revPrev:[15400, 19200, 15600, 17400, 17800, 21000, 21800],
      yTicks: [0, 8000, 16000, 24000, 32000],
      legendPrimary: 'Total 7 jours · 198 400 MAD',
      legendCompare: '7 jours précédents · 126 200 MAD',
    },
    trenteJours: {
      rangeBadge: '30 DERNIERS JOURS',
      sub: 'Total journalier · 30 derniers jours',
      // 30 daily totals; labels visible every 5 days (idx 0,5,10,15,20,25,29).
      xLabels: [
        '26 mar','27 mar','28 mar','29 mar','30 mar',
        '31 mar','1 avr','2 avr','3 avr','4 avr',
        '5 avr','6 avr','7 avr','8 avr','9 avr',
        '10 avr','11 avr','12 avr','13 avr','14 avr',
        '15 avr','16 avr','17 avr','18 avr','19 avr',
        '20 avr','21 avr','22 avr','23 avr','24 avr',
      ],
      visibleXIdx: [0, 5, 10, 15, 20, 25, 29],
      rev: [
        22400, 23600, 24100, 24400, 24800,
        25200, 25800, 26000, 26100, 26200,
        26500, 26800, 27000, 27200, 27800,
        28000, 28200, 28000, 28100, 28400,
        28600, 28900, 29100, 29200, 29600,
        29400, 28800, 28200, 28000, 27512,
      ],
      revPrev: [
        19200, 20100, 20400, 20800, 21400,
        21800, 22200, 22500, 22600, 22800,
        23200, 23600, 23900, 24200, 24600,
        24900, 25200, 25400, 25600, 25800,
        26100, 26400, 26500, 26700, 26900,
        26800, 26200, 25600, 25200, 24800,
      ],
      yTicks: [0, 8000, 16000, 24000, 32000],
      legendPrimary: 'Total 30 jours · 842 300 MAD',
      legendCompare: '30 jours précédents · 731 200 MAD',
    },
    personnalise: null,
    },
    maisonMansour: {
      aujourdhui: {
        rangeBadge: "AUJOURD'HUI · LIVE",
        sub: 'Cumul horaire · boutique ouverte',
        xLabels: ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'],
        visibleXIdx: [1, 3, 5, 7, 9, 11, 13, 15],
        rev:    [0, 2400, 6400, 11820, 11900, 12000, 12200, 12500, 12900, 13400, 13800, 14000, 14100, 14200, 14200, 14200],
        revPrev:[0, 1100, 2400,  3400,  3800,  4100,  4500,  5800,  7400,  9100, 11000, 11800, 12000, 12080, 12100, 12110],
        yTicks: [0, 4000, 8000, 12000, 16000],
        legendPrimary: "Cumul aujourd'hui · 11 820 MAD",
        legendCompare: 'Cumul hier · 12 110 MAD',
      },
      hier: {
        rangeBadge: 'HIER · COMPLET',
        sub: "Cumul horaire · journée d'hier",
        xLabels: ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'],
        visibleXIdx: [1, 3, 5, 7, 9, 11, 13, 15],
        rev:    [0, 1100, 2400, 3400, 3800, 4100, 4500, 5800, 7400, 9100, 11000, 11800, 12000, 12080, 12100, 12110],
        revPrev:[0, 1080, 2380, 3380, 3780, 4080, 4480, 5780, 7380, 9080, 10940, 11700, 11800, 11800, 11800, 11800],
        yTicks: [0, 3500, 7000, 10500, 14000],
        legendPrimary: 'Cumul hier · 12 110 MAD',
        legendCompare: 'Cumul avant-hier · 11 800 MAD',
      },
      septJours: {
        rangeBadge: '7 DERNIERS JOURS',
        sub: 'Total journalier · 7 derniers jours',
        xLabels: ['Sam 18','Dim 19','Lun 20','Mar 21','Mer 22','Jeu 23','Ven 24'],
        visibleXIdx: [0, 1, 2, 3, 4, 5, 6],
        rev:    [10800, 13200, 11400, 12100, 12400, 13100, 11800],
        revPrev:[ 9100, 11400,  9700, 10300, 10500, 11100, 10000],
        yTicks: [0, 4000, 8000, 12000, 16000],
        legendPrimary: 'Total 7 jours · 84 800 MAD',
        legendCompare: '7 jours précédents · 72 100 MAD',
      },
      trenteJours: {
        rangeBadge: '30 DERNIERS JOURS',
        sub: 'Total journalier · 30 derniers jours',
        xLabels: [
          '26 mar','27 mar','28 mar','29 mar','30 mar','31 mar','1 avr','2 avr','3 avr','4 avr',
          '5 avr','6 avr','7 avr','8 avr','9 avr','10 avr','11 avr','12 avr','13 avr','14 avr',
          '15 avr','16 avr','17 avr','18 avr','19 avr','20 avr','21 avr','22 avr','23 avr','24 avr',
        ],
        visibleXIdx: [0, 5, 10, 15, 20, 25, 29],
        rev: [
          10800, 11200, 11400, 11600, 11800, 12000, 12200, 12000, 11800, 11900,
          12100, 12300, 12400, 12200, 12000, 11900, 12000, 12200, 12400, 12600,
          12400, 12200, 12000, 11800, 11600, 11400, 11600, 11800, 12000, 12110,
        ],
        revPrev: [
          9700, 10100, 10300, 10500, 10700, 10900, 11000, 10900, 10700, 10800,
          11000, 11200, 11200, 11000, 10800, 10700, 10800, 11000, 11200, 11400,
          11200, 11000, 10800, 10600, 10400, 10300, 10500, 10700, 10800, 10900,
        ],
        yTicks: [0, 4000, 8000, 12000, 16000],
        legendPrimary: 'Total 30 jours · 358 200 MAD',
        legendCompare: '30 jours précédents · 322 100 MAD',
      },
      personnalise: null,
    },
    spaBahia: {
      aujourdhui: {
        rangeBadge: "AUJOURD'HUI · LIVE",
        sub: 'Cumul horaire · réservations en cours',
        xLabels: ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'],
        visibleXIdx: [1, 3, 5, 7, 9, 11, 13, 15],
        rev:    [0, 1500, 4200, 8950, 9050, 9300, 9700, 10100, 10500, 10800, 10950, 11000, 11000, 11000, 11000, 11000],
        revPrev:[0,  600, 1900, 3200, 3700, 4500, 5300,  6100,  7100,  7900,  8200,  8350,  8380,  8380,  8380,  8380],
        yTicks: [0, 3000, 6000, 9000, 12000],
        legendPrimary: "Cumul aujourd'hui · 8 950 MAD",
        legendCompare: 'Cumul hier · 8 380 MAD',
      },
      hier: {
        rangeBadge: 'HIER · COMPLET',
        sub: "Cumul horaire · journée d'hier",
        xLabels: ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'],
        visibleXIdx: [1, 3, 5, 7, 9, 11, 13, 15],
        rev:    [0, 600, 1900, 3200, 3700, 4500, 5300, 6100, 7100, 7900, 8200, 8350, 8380, 8380, 8380, 8380],
        revPrev:[0, 580, 1850, 3100, 3600, 4400, 5200, 5950, 6900, 7700, 8000, 8100, 8100, 8100, 8100, 8100],
        yTicks: [0, 2500, 5000, 7500, 10000],
        legendPrimary: 'Cumul hier · 8 380 MAD',
        legendCompare: 'Cumul avant-hier · 8 100 MAD',
      },
      septJours: {
        rangeBadge: '7 DERNIERS JOURS',
        sub: 'Total journalier · 7 derniers jours',
        xLabels: ['Sam 18','Dim 19','Lun 20','Mar 21','Mer 22','Jeu 23','Ven 24'],
        visibleXIdx: [0, 1, 2, 3, 4, 5, 6],
        rev:    [8200, 9400, 8800, 9100, 9300, 10100, 9300],
        revPrev:[7000, 8000, 7500, 7800, 7900,  8600, 7900],
        yTicks: [0, 3000, 6000, 9000, 12000],
        legendPrimary: 'Total 7 jours · 64 200 MAD',
        legendCompare: '7 jours précédents · 54 700 MAD',
      },
      trenteJours: {
        rangeBadge: '30 DERNIERS JOURS',
        sub: 'Total journalier · 30 derniers jours',
        xLabels: [
          '26 mar','27 mar','28 mar','29 mar','30 mar','31 mar','1 avr','2 avr','3 avr','4 avr',
          '5 avr','6 avr','7 avr','8 avr','9 avr','10 avr','11 avr','12 avr','13 avr','14 avr',
          '15 avr','16 avr','17 avr','18 avr','19 avr','20 avr','21 avr','22 avr','23 avr','24 avr',
        ],
        visibleXIdx: [0, 5, 10, 15, 20, 25, 29],
        rev: [
          7800, 8100, 8400, 8600, 8800, 9000, 9200, 9000, 8800, 8900,
          9100, 9300, 9400, 9200, 9000, 8900, 9000, 9200, 9400, 9600,
          9400, 9200, 9000, 8800, 8600, 8400, 8600, 8800, 9000, 9100,
        ],
        revPrev: [
          6700, 7000, 7200, 7400, 7500, 7700, 7900, 7700, 7500, 7600,
          7800, 8000, 8000, 7900, 7700, 7600, 7700, 7900, 8100, 8200,
          8100, 7900, 7700, 7500, 7300, 7200, 7300, 7500, 7700, 7800,
        ],
        yTicks: [0, 3000, 6000, 9000, 12000],
        legendPrimary: 'Total 30 jours · 269 400 MAD',
        legendCompare: '30 jours précédents · 232 100 MAD',
      },
      personnalise: null,
    },
  };

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
      { t: '14:32', method: 'tap',  primary: 'Kiwi Tap',        sub: 'Client #3412 · Kiwi Wallet',     flag: 'ma', ctx: 'Client #3412 · T7',amt: '180,00',  tip: '—',       neg: false },
      { t: '14:18', method: 'mc',   primary: 'Mastercard •• 7820', sub: 'Carte française · BNP Paribas', flag: 'fr', ctx: 'Sara L. · T2',  amt: '85,50',   tip: '+8,55',  neg: false },
      { t: '14:03', method: 'qr',   primary: 'Kiwi Wallet QR',  sub: 'Nawal K. · abonnée',             flag: 'ma', ctx: 'Nawal K. · T6',    amt: '62,00',   tip: '—',       neg: false },
      { t: '13:57', method: 'visa', primary: 'Visa •• 0043',   sub: 'Carte espagnole · CaixaBank',    flag: 'es', ctx: 'Youssef A. · T1',  amt: '312,00',  tip: '+30,00', neg: false },
      { t: '13:41', method: 'mc',   primary: 'Mastercard •• 1209', sub: 'Remboursement · CMI',         flag: 'ma', ctx: 'Hassan J. · T3',   amt: '−155,00', tip: '—',       neg: true },
    ],
    hier: [
      { t: '22:48', method: 'visa', primary: 'Visa •• 8841',   sub: 'Carte marocaine · BMCE',         flag: 'ma', ctx: 'Imane S. · T5',    amt: '276,00',  tip: '+27,60', neg: false },
      { t: '22:14', method: 'tap',  primary: 'Kiwi Tap',        sub: 'Client #3287 · contactless',     flag: 'ma', ctx: 'Client #3287 · T8',amt: '142,00',  tip: '—',       neg: false },
      { t: '21:52', method: 'mc',   primary: 'Mastercard •• 4509', sub: 'Carte française · LCL',      flag: 'fr', ctx: 'Pierre D. · T2',   amt: '198,50',  tip: '+19,85', neg: false },
      { t: '21:18', method: 'qr',   primary: 'Kiwi Wallet QR',  sub: 'Mehdi C. · régulier',            flag: 'ma', ctx: 'Mehdi C. · T6',    amt: '88,00',   tip: '—',       neg: false },
      { t: '20:42', method: 'visa', primary: 'Visa •• 6612',   sub: 'Carte américaine · Chase',       flag: 'us', ctx: 'Diana K. · T1',    amt: '384,00',  tip: '+38,40', neg: false },
      { t: '20:09', method: 'mc',   primary: 'Mastercard •• 8830', sub: 'Carte marocaine · CIH',      flag: 'ma', ctx: 'Anas L. · T3',     amt: '124,00',  tip: '+12,40', neg: false },
    ],
    septJours: [
      { t: 'Ven 23', method: 'visa', primary: 'Visa •• 2914',  sub: 'Top transaction de la semaine', flag: 'fr', ctx: 'Nicolas R. · T4', amt: '1 240,00', tip: '+124,00', neg: false },
      { t: 'Jeu 22', method: 'qr',   primary: 'Kiwi Wallet QR', sub: 'Soirée d\'anniversaire',        flag: 'ma', ctx: 'Hicham B. · T8', amt: '684,00',   tip: '+50,00',  neg: false },
      { t: 'Mer 21', method: 'mc',   primary: 'Mastercard •• 1456', sub: 'Carte espagnole · Sabadell', flag: 'es', ctx: 'Lucia G. · T2', amt: '420,00',   tip: '+42,00',  neg: false },
      { t: 'Mar 20', method: 'tap',  primary: 'Kiwi Tap',       sub: 'Service midi · Tap',            flag: 'ma', ctx: 'Client #2945 · T6', amt: '208,00', tip: '—',       neg: false },
      { t: 'Lun 19', method: 'visa', primary: 'Visa •• 7740',  sub: 'Carte marocaine · BMCE',        flag: 'ma', ctx: 'Salma F. · T1',  amt: '162,00',   tip: '+16,20',  neg: false },
      { t: 'Dim 18', method: 'mc',   primary: 'Mastercard •• 3308', sub: 'Annulation client',         flag: 'ma', ctx: 'Khalid A. · T3', amt: '−240,00',  tip: '—',       neg: true },
    ],
    trenteJours: [
      { t: 'S22 J1', method: 'visa', primary: 'Visa •• 0921',  sub: 'Réservation groupe · 12 couverts', flag: 'ma', ctx: 'Mariage Bensouda · T1-T4', amt: '4 280,00', tip: '+428,00', neg: false },
      { t: 'S21 J3', method: 'qr',   primary: 'Kiwi Wallet QR', sub: 'Soirée privée',                   flag: 'ma', ctx: 'Wissam · T7', amt: '1 920,00', tip: '+150,00', neg: false },
      { t: 'S20 J5', method: 'mc',   primary: 'Mastercard •• 6612', sub: 'Carte française · BNP',     flag: 'fr', ctx: 'Sophie M. · T2', amt: '780,00', tip: '+78,00', neg: false },
      { t: 'S19 J6', method: 'visa', primary: 'Visa •• 5544',  sub: 'Carte espagnole · La Caixa',    flag: 'es', ctx: 'Manuel V. · T5', amt: '512,00', tip: '+50,00', neg: false },
      { t: 'S18 J2', method: 'tap',  primary: 'Kiwi Tap',       sub: 'Pic samedi · service du soir',  flag: 'ma', ctx: 'Client #1882 · T8', amt: '342,00', tip: '—',     neg: false },
      { t: 'S17 J4', method: 'mc',   primary: 'Mastercard •• 9982', sub: 'Reversement Glovo',         flag: 'ma', ctx: 'Réconciliation', amt: '−380,00', tip: '—', neg: true },
    ],
    },
    maisonMansour: {
      aujourdhui: [
        { t: '14:38', method: 'visa', primary: 'Visa •• 5821',     sub: 'Carte allemande · Sparkasse', flag: 'fr', ctx: 'Anna M. · Caftan brodé',   amt: '1 890,00', tip: '—', neg: false, isNew: true },
        { t: '14:14', method: 'mc',   primary: 'Mastercard •• 7714', sub: 'Carte française · LCL',     flag: 'fr', ctx: 'Sophie L. · Babouches',    amt: '450,00',   tip: '—', neg: false },
        { t: '13:42', method: 'tap',  primary: 'Kiwi Tap',          sub: 'Client #4521 · Kiwi Wallet', flag: 'ma', ctx: 'Client #4521 · Coussin',   amt: '240,00',   tip: '—', neg: false },
        { t: '13:18', method: 'visa', primary: 'Visa •• 0987',     sub: 'Carte espagnole · BBVA',     flag: 'es', ctx: 'Carmen R. · Théière',      amt: '680,00',   tip: '—', neg: false },
        { t: '12:54', method: 'mc',   primary: 'Mastercard •• 3344', sub: 'Carte américaine · Chase',  flag: 'us', ctx: 'Karen B. · Tapis berbère', amt: '3 200,00', tip: '—', neg: false },
        { t: '12:21', method: 'mc',   primary: 'Mastercard •• 8830', sub: 'Retour boutique · CIH',    flag: 'ma', ctx: 'Hassan J. · Babouches',    amt: '−450,00',  tip: '—', neg: true },
      ],
      hier: [
        { t: '19:52', method: 'visa', primary: 'Visa •• 4421',     sub: 'Carte française · BNP',      flag: 'fr', ctx: 'Camille D. · Caftan',      amt: '1 890,00', tip: '—', neg: false },
        { t: '19:18', method: 'tap',  primary: 'Kiwi Tap',          sub: 'Client #4488 · contactless', flag: 'ma', ctx: 'Client #4488 · Théière',   amt: '680,00',   tip: '—', neg: false },
        { t: '18:46', method: 'mc',   primary: 'Mastercard •• 2298', sub: 'Carte espagnole · Sabadell',flag: 'es', ctx: 'Marta G. · Coussin',       amt: '240,00',   tip: '—', neg: false },
        { t: '18:14', method: 'visa', primary: 'Visa •• 6643',     sub: 'Carte américaine · Citi',    flag: 'us', ctx: 'David W. · Tapis',          amt: '3 200,00', tip: '—', neg: false },
        { t: '17:32', method: 'mc',   primary: 'Mastercard •• 5512', sub: 'Carte marocaine · BMCE',    flag: 'ma', ctx: 'Yasmine F. · Lampe',       amt: '920,00',   tip: '—', neg: false },
        { t: '16:48', method: 'visa', primary: 'Visa •• 8801',     sub: 'Carte française · Crédit Agricole', flag: 'fr', ctx: 'Léa M. · Babouches', amt: '450,00',   tip: '—', neg: false },
      ],
      septJours: [
        { t: 'Ven 23', method: 'mc',   primary: 'Mastercard •• 1144', sub: 'Top transaction de la semaine', flag: 'us', ctx: 'Karen B. · Tapis berbère', amt: '3 200,00', tip: '—', neg: false },
        { t: 'Jeu 22', method: 'visa', primary: 'Visa •• 5821',      sub: 'Tax-free · Allemagne',          flag: 'fr', ctx: 'Anna M. · Caftan brodé',   amt: '1 890,00', tip: '—', neg: false },
        { t: 'Mer 21', method: 'visa', primary: 'Visa •• 0987',      sub: 'Carte espagnole · BBVA',        flag: 'es', ctx: 'Carmen R. · Théière',      amt: '680,00',   tip: '—', neg: false },
        { t: 'Mar 20', method: 'mc',   primary: 'Mastercard •• 7714', sub: 'Carte française · LCL',         flag: 'fr', ctx: 'Sophie L. · Babouches',    amt: '450,00',   tip: '—', neg: false },
        { t: 'Lun 19', method: 'tap',  primary: 'Kiwi Tap',           sub: 'Client #4521 · contactless',    flag: 'ma', ctx: 'Client #4521 · Coussin',   amt: '240,00',   tip: '—', neg: false },
        { t: 'Dim 18', method: 'mc',   primary: 'Mastercard •• 8830', sub: 'Retour boutique · CIH',         flag: 'ma', ctx: 'Hassan J. · Babouches',    amt: '−450,00',  tip: '—', neg: true },
      ],
      trenteJours: [
        { t: 'S22 J3', method: 'visa', primary: 'Visa •• 9912',     sub: 'Caftans haut de gamme · paire',   flag: 'fr', ctx: 'Marion K. · 2 caftans',    amt: '3 780,00', tip: '—', neg: false },
        { t: 'S20 J5', method: 'mc',   primary: 'Mastercard •• 1144', sub: 'Tapis premium · Berbère',       flag: 'us', ctx: 'Karen B. · Tapis',          amt: '3 200,00', tip: '—', neg: false },
        { t: 'S19 J2', method: 'visa', primary: 'Visa •• 5821',     sub: 'Caftan brodé Tax-free',          flag: 'fr', ctx: 'Anna M.',                   amt: '1 890,00', tip: '—', neg: false },
        { t: 'S18 J6', method: 'tap',  primary: 'Kiwi Tap',          sub: 'Lampe artisanale · cliente VIP', flag: 'ma', ctx: 'Salma O. · Lampe',          amt: '920,00',   tip: '—', neg: false },
        { t: 'S17 J4', method: 'visa', primary: 'Visa •• 0987',     sub: 'Théière argentée',               flag: 'es', ctx: 'Carmen R.',                 amt: '680,00',   tip: '—', neg: false },
        { t: 'S16 J1', method: 'mc',   primary: 'Mastercard •• 4477', sub: 'Échange · taille différente',   flag: 'ma', ctx: 'Hicham B. · Caftan',        amt: '−1 890,00',tip: '—', neg: true },
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
        { t: 'S17 J4', method: 'mc',   primary: 'Mastercard •• 8821', sub: 'Annulation rendez-vous',         flag: 'ma', ctx: 'Anonyme',                        amt: '−550,00',  tip: '—',       neg: true },
      ],
    },
  };

  const settleByVenue = {
    cafeAtlas: {
      aujourdhui:  { lbl: 'PROCHAIN RÈGLEMENT',    amt: 23091,  sub: 'Arrive demain matin à 9 h 00 sur votre IBAN BMCE •• 3291.', detailVal: '−289 MAD' },
      hier:        { lbl: 'RÈGLEMENT REÇU',         amt: 20640,  sub: 'Crédité ce matin à 9 h 02 sur votre IBAN BMCE •• 3291.',     detailVal: '−248 MAD' },
      septJours:   { lbl: 'RÉGLÉ SUR 7 JOURS',      amt: 165280, sub: '7 règlements T+1 cumulés sur la semaine.',                    detailVal: '−2 230 MAD' },
      trenteJours: { lbl: 'RÉGLÉ SUR 30 JOURS',     amt: 702800, sub: '30 règlements T+1 cumulés sur le mois.',                       detailVal: '−9 480 MAD' },
    },
    maisonMansour: {
      aujourdhui:  { lbl: 'PROCHAIN RÈGLEMENT',    amt: 9920,   sub: 'Arrive demain matin à 9 h 00 sur votre IBAN BMCE •• 8842.', detailVal: '−146 MAD' },
      hier:        { lbl: 'RÈGLEMENT REÇU',         amt: 10170,  sub: 'Crédité ce matin à 9 h 02 sur votre IBAN BMCE •• 8842.',     detailVal: '−149 MAD' },
      septJours:   { lbl: 'RÉGLÉ SUR 7 JOURS',      amt: 71200,  sub: '7 règlements T+1 cumulés sur la semaine.',                    detailVal: '−1 020 MAD' },
      trenteJours: { lbl: 'RÉGLÉ SUR 30 JOURS',     amt: 300700, sub: '30 règlements T+1 cumulés sur le mois.',                       detailVal: '−4 280 MAD' },
    },
    spaBahia: {
      aujourdhui:  { lbl: 'PROCHAIN RÈGLEMENT',    amt: 7510,   sub: 'Arrive demain matin à 9 h 00 sur votre IBAN BMCE •• 4416.', detailVal: '−108 MAD' },
      hier:        { lbl: 'RÈGLEMENT REÇU',         amt: 7035,   sub: 'Crédité ce matin à 9 h 02 sur votre IBAN BMCE •• 4416.',     detailVal: '−105 MAD' },
      septJours:   { lbl: 'RÉGLÉ SUR 7 JOURS',      amt: 53890,  sub: '7 règlements T+1 cumulés sur la semaine.',                    detailVal: '−770 MAD' },
      trenteJours: { lbl: 'RÉGLÉ SUR 30 JOURS',     amt: 226300, sub: '30 règlements T+1 cumulés sur le mois.',                       detailVal: '−3 240 MAD' },
    },
  };
  const SETTLE_LBL = {
    fr: { aujourdhui: 'PROCHAIN RÈGLEMENT', hier: 'RÈGLEMENT REÇU', septJours: 'RÉGLÉ SUR 7 JOURS', trenteJours: 'RÉGLÉ SUR 30 JOURS', personnalise: 'PROCHAIN RÈGLEMENT' },
    en: { aujourdhui: 'NEXT SETTLEMENT', hier: 'SETTLEMENT RECEIVED', septJours: 'SETTLED OVER 7 DAYS', trenteJours: 'SETTLED OVER 30 DAYS', personnalise: 'NEXT SETTLEMENT' },
    ar: { aujourdhui: 'التسوية القادمة', hier: 'تسوية مستلمة', septJours: 'مسوّى على 7 أيام', trenteJours: 'مسوّى على 30 يومًا', personnalise: 'التسوية القادمة' },
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

  const staffByVenue = {
    cafeAtlas: {
      aujourdhui: [
        { av: 'FK', cls: '',         name: 'Fatima Khalki',  role: 'Serveuse senior · service en salle', shift: '5h 32', amt: '5 240 MAD', tx: '42 tx' },
        { av: 'HJ', cls: 'b',        name: 'Hamid Jelloul',  role: 'Serveur · terrasse',                   shift: '5h 10', amt: '4 680 MAD', tx: '38 tx' },
        { av: 'SB', cls: 'c',        name: 'Sofia Belkadi',  role: 'Barista · comptoir',                   shift: '4h 48', amt: '3 920 MAD', tx: '54 tx' },
        { av: 'YA', cls: 'd',        name: 'Youssef Amrani', role: 'Serveur · pause depuis 14:12',          shift: '3h 22', amt: '2 110 MAD', tx: '25 tx' },
        { av: 'MM', cls: 'offline',  name: 'Mehdi Mansouri', role: 'Cuisine · fini son service 14:00',      shift: '—',     amt: '—',         tx: '' },
      ],
      hier: [
        { av: 'FK', cls: 'offline', name: 'Fatima Khalki',  role: 'Serveuse senior · service de hier',   shift: '8h 12', amt: '7 420 MAD', tx: '58 tx' },
        { av: 'HJ', cls: 'offline', name: 'Hamid Jelloul',  role: 'Serveur · terrasse',                   shift: '7h 48', amt: '6 980 MAD', tx: '52 tx' },
        { av: 'SB', cls: 'offline', name: 'Sofia Belkadi',  role: 'Barista · comptoir',                   shift: '6h 30', amt: '5 240 MAD', tx: '64 tx' },
        { av: 'YA', cls: 'offline', name: 'Youssef Amrani', role: 'Serveur · service du soir',            shift: '5h 50', amt: '3 240 MAD', tx: '38 tx' },
        { av: 'MM', cls: 'offline', name: 'Mehdi Mansouri', role: 'Cuisine · fini 23:00',                  shift: '7h 00', amt: '—',         tx: '' },
      ],
      septJours: [
        { av: 'FK', cls: '', name: 'Fatima Khalki',  role: 'Serveuse senior · 6 jours de service',   shift: '48h 20', amt: '36 800 MAD', tx: '298 tx' },
        { av: 'HJ', cls: 'b',name: 'Hamid Jelloul',  role: 'Serveur · 6 jours',                       shift: '46h 10', amt: '32 400 MAD', tx: '256 tx' },
        { av: 'SB', cls: 'c',name: 'Sofia Belkadi',  role: 'Barista · 7 jours',                       shift: '42h 00', amt: '28 700 MAD', tx: '342 tx' },
        { av: 'YA', cls: 'd',name: 'Youssef Amrani', role: 'Serveur · 5 jours',                       shift: '34h 40', amt: '18 200 MAD', tx: '184 tx' },
        { av: 'MM', cls: 'd',name: 'Mehdi Mansouri', role: 'Cuisine · 6 jours',                       shift: '44h 30', amt: '—',          tx: '' },
      ],
      trenteJours: [
        { av: 'FK', cls: '', name: 'Fatima Khalki',  role: 'Serveuse senior · 26 jours',              shift: '208h 40', amt: '152 600 MAD', tx: '1 240 tx' },
        { av: 'HJ', cls: 'b',name: 'Hamid Jelloul',  role: 'Serveur · 25 jours',                      shift: '198h 20', amt: '138 800 MAD', tx: '1 086 tx' },
        { av: 'SB', cls: 'c',name: 'Sofia Belkadi',  role: 'Barista · 28 jours',                      shift: '174h 00', amt: '118 400 MAD', tx: '1 458 tx' },
        { av: 'YA', cls: 'd',name: 'Youssef Amrani', role: 'Serveur · 21 jours',                      shift: '146h 20', amt: '76 400 MAD',  tx: '784 tx' },
        { av: 'MM', cls: 'd',name: 'Mehdi Mansouri', role: 'Cuisine · 24 jours',                      shift: '184h 00', amt: '—',           tx: '' },
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

  function setDateRange(id) {
    if (!VALID.includes(id)) id = DEFAULT_RANGE;
    currentRange = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
    renderSelector();
    subscribers.forEach(fn => { try { fn(id); } catch (_) {} });
  }
  function setShowComparison(v) {
    showComparison = !!v;
    try { localStorage.setItem(CMP_KEY, showComparison ? '1' : '0'); } catch (_) {}
    const btn = document.querySelector('[data-rev-compare-btn]');
    if (btn) {
      btn.classList.toggle('on', showComparison);
      btn.setAttribute('aria-pressed', String(showComparison));
    }
    renderRevChart();
  }
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
    if (id === 'septJours')   return `${fmtShort(offsetDays(-6))} — ${fmtDate(today)}`;
    if (id === 'trenteJours') return `${fmtShort(offsetDays(-30))} — ${fmtDate(today)}`;
    return '—';
  }

  const frInt = n => Math.floor(n).toLocaleString('fr-FR').replace(/,/g, ' ').replace(/ /g, ' ');

  function fmtHeroAmount(v) {
    const int = Math.floor(v);
    const cents = Math.round((v - int) * 100);
    return `${frInt(int)}<span class="cents">,${String(cents).padStart(2,'0')}</span><span class="currency">MAD</span>`;
  }
  const fmtNetAmount = v => `${frInt(v)} MAD`;
  const fmtSettleAmount = v => `${frInt(v)} <span style="font-size:0.42em; opacity: 0.7;">MAD</span>`;
  const fmtPct = v => {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    const abs = Math.abs(v);
    const formatted = (Math.abs(abs - Math.round(abs)) < 0.001) ? String(Math.round(abs)) : abs.toFixed(1).replace('.', ',');
    return `${sign}${formatted} %`;
  };

  function animateNumber(el, from, to, { duration = 800, format } = {}) {
    if (!el) return;
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * ease(p);
      el.innerHTML = format(v);
      if (p < 1) requestAnimationFrame(tick);
      else el.innerHTML = format(to);
    }
    requestAnimationFrame(tick);
  }

  /* Auto-size the hero amount so it always sits on a single line.
   * Renders the target value in a hidden mirror (same fonts/letter-spacing),
   * measures, and shrinks font-size if it would overflow the column. */
  function fitHeroAmount(el, targetValue) {
    if (!el) return;
    el.style.fontSize = '';
    const parent = el.parentElement;
    if (!parent) return;
    const cs = getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.cssText = `position: absolute; left: -9999px; top: -9999px; visibility: hidden; white-space: nowrap; pointer-events: none;`;
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontSize = cs.fontSize;
    probe.style.letterSpacing = cs.letterSpacing;
    probe.style.fontFeatureSettings = cs.fontFeatureSettings;
    probe.innerHTML = fmtHeroAmount(targetValue);
    document.body.appendChild(probe);
    const naturalW = probe.scrollWidth;
    document.body.removeChild(probe);
    const availW = parent.clientWidth;
    if (availW > 0 && naturalW > availW) {
      const baseSize = parseFloat(cs.fontSize);
      el.style.fontSize = `${Math.floor(baseSize * (availW / naturalW) * 0.97)}px`;
    }
  }

  function parseAmountFromEl(el) {
    if (!el) return 0;
    const txt = el.textContent.replace(/[^\d,.\-−]/g, '').replace('−', '-');
    return parseFloat(txt.replace(/\s/g, '').replace(',', '.')) || 0;
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

  function renderSelector() {
    const lang = getLang();
    const labelEl = document.querySelector('[data-dr-label]');
    const subEl = document.querySelector('[data-dr-sub]');
    if (labelEl) labelEl.textContent = RANGE_STR[lang]?.[currentRange] || RANGE_STR.fr[currentRange];
    if (subEl)   subEl.textContent = computeSubLine(currentRange);
    document.querySelectorAll('.dr-pill').forEach(p => p.classList.toggle('on', p.dataset.range === currentRange));
  }

  /* ═══════════════ RENDER: HERO ═══════════════ */

  function renderHero() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(heroDataByVenue, currentRange);
    if (!data) return;

    const labelEl = document.querySelector('[data-hero-label]');
    if (labelEl) labelEl.textContent = HERO_LABEL[lang]?.[effective] || HERO_LABEL.fr[effective];

    const amtEl = document.querySelector('[data-hero-amount]');
    if (amtEl) {
      const fromVal = parseAmountFromEl(amtEl);
      // Resize font to fit the wider of from/to so the number never wraps mid-animation.
      fitHeroAmount(amtEl, Math.max(fromVal, data.amount));
      animateNumber(amtEl, fromVal, data.amount, { duration: 800, format: fmtHeroAmount });
    }

    const breakdown = document.querySelector('.hero-breakdown');
    if (breakdown) {
      const labels = DELTA_LABELS[lang]?.[currentRange] || DELTA_LABELS.fr[currentRange];

      const existing = {};
      breakdown.querySelectorAll('[data-hero-delta]').forEach(el => {
        const k = el.dataset.heroDelta;
        const v = el.querySelector('[data-hero-delta-val]');
        if (v) existing[k] = parsePctFromEl(v);
      });
      const existingNet = parseIntFromEl(breakdown.querySelector('[data-hero-net-val]'));

      const items = [];
      if (data.deltaHier    != null) items.push({ key: 'hier',    value: data.deltaHier,    label: labels.hier });
      if (data.deltaSemaine != null) items.push({ key: 'semaine', value: data.deltaSemaine, label: labels.semaine });
      if (data.deltaMois    != null) items.push({ key: 'mois',    value: data.deltaMois,    label: labels.mois });

      breakdown.innerHTML = items.map(it => `
        <div class="b" data-hero-delta="${it.key}">
          <div class="l">${it.label}</div>
          <div class="v" data-hero-delta-val></div>
        </div>
      `).join('') + `
        <div class="b">
          <div class="l">${NET_LABEL[lang] || NET_LABEL.fr}</div>
          <div class="v" data-hero-net-val></div>
        </div>
      `;

      items.forEach(it => {
        const valEl = breakdown.querySelector(`[data-hero-delta="${it.key}"] [data-hero-delta-val]`);
        if (!valEl) return;
        const from = existing[it.key] ?? 0;
        animateNumber(valEl, from, it.value, {
          duration: 600,
          format: v => `${fmtPct(v)} <span class="d${v < 0 ? ' dn' : ''}">${v < 0 ? '↓' : '↑'}</span>`,
        });
      });

      const netEl = breakdown.querySelector('[data-hero-net-val]');
      if (netEl) animateNumber(netEl, existingNet || 0, data.netAfterKiwi, { duration: 800, format: fmtNetAmount });
    }
  }

  /* ═══════════════ RENDER: HERO AI PANEL (per venue) ═══════════════ */

  function renderHeroAi() {
    const rec = window.KiwiVenue?.getHeroAiRec?.();
    if (!rec) return;
    const titleEl = document.querySelector('.hai-rec-title');
    const obsEl   = document.querySelector('.hai-rec-obs');
    const actEl   = document.querySelector('.hai-rec-act');
    if (titleEl) titleEl.textContent = rec.title;
    if (obsEl)   obsEl.textContent = rec.obs;
    if (actEl)   actEl.textContent = rec.act;
  }

  /* ═══════════════ RENDER: HEATMAP AI HINT (per venue) ═══════════════ */

  function renderHeatmapAi() {
    const rec = window.KiwiVenue?.getHeatmapAiRec?.();
    if (!rec) return;
    const titleEl = document.querySelector('.hh-ai-title');
    const obsEl   = document.querySelector('.hh-ai-obs');
    const ctaEl   = document.querySelector('.hh-ai-cta');
    if (titleEl) titleEl.textContent = rec.title;
    if (obsEl)   obsEl.textContent = rec.obs;
    if (ctaEl)   ctaEl.textContent = rec.cta;
  }

  /* ═══════════════ RENDER: HERO GOAL BAR ═══════════════ */

  function renderGoal() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(goalByVenue, currentRange);
    if (!data) return;

    const labelTxt = GOAL_LABEL[lang]?.[currentRange] || GOAL_LABEL.fr[currentRange];
    const labelEl = document.querySelector('[data-goal-label]');
    if (labelEl) labelEl.textContent = `${labelTxt} · ${frInt(data.goal)} MAD`;

    const ratio = data.goal > 0 ? data.current / data.goal : 0;
    const pctRound = Math.round(ratio * 100);
    const widthPct = Math.min(100, ratio * 100);

    const pctEl = document.querySelector('[data-goal-pct]');
    if (pctEl) {
      const from = parseInt((pctEl.textContent || '').replace(/\D/g, ''), 10) || 0;
      animateNumber(pctEl, from, pctRound, { duration: 700, format: v => `${Math.round(v)} %` });
    }
    const fillEl = document.querySelector('[data-goal-fill]');
    if (fillEl) fillEl.style.width = `${widthPct.toFixed(1)}%`;
  }

  /* ═══════════════ RENDER: HOURLY HEATMAP ═══════════════ */

  function intensityClass(v) {
    if (v < 0.2) return 'i0';
    if (v < 0.4) return 'i1';
    if (v < 0.6) return 'i2';
    if (v < 0.8) return 'i3';
    return 'i4';
  }
  function buildHeatmap(rng) {
    if (rng === 'personnalise') rng = 'aujourdhui';
    const v = getCurrentVenue();
    const rev = (HH_RAW_BY_VENUE[v]?.[rng]) || HH_RAW_BY_VENUE.cafeAtlas[rng];
    const cov = (HH_COVERS_BY_VENUE[v]?.[rng]) || HH_COVERS_BY_VENUE.cafeAtlas[rng];
    const max = Math.max(...rev);
    return HH_HOURS.map((h, i) => ({
      hour: h, revenue: rev[i], covers: cov[i],
      intensity: max ? rev[i] / max : 0,
    }));
  }
  function renderHeatmap() {
    const lang = getLang();
    const data = buildHeatmap(currentRange);
    const row = document.querySelector('[data-hh-row]');
    if (row) {
      row.innerHTML = data.map(d => `
        <div class="hh-col">
          <div class="hh-cell ${intensityClass(d.intensity)}">
            <div class="hh-tooltip">
              <div class="hour">${d.hour}</div>
              <div class="met"><b>${frInt(d.revenue)} MAD</b></div>
              <div class="met">${d.covers} ${COVERS_LABEL[lang] || COVERS_LABEL.fr}</div>
            </div>
          </div>
          <div class="hh-h">${d.hour}</div>
        </div>
      `).join('');
    }
    const subEl = document.querySelector('[data-hh-sub]');
    if (subEl) subEl.textContent = HH_SUB[lang]?.[currentRange] || HH_SUB.fr[currentRange];
  }

  /* ═══════════════ RENDER: KPI BAND ═══════════════ */

  const arrowSvg = up => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="${up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;

  function fmtKpiVal(spec, v) {
    const unit = spec.unit ? `<span class="u">${spec.unit}</span>` : '';
    if (spec.text) return spec.text + unit;
    if (spec.fmt === 'pct2') return v.toFixed(2).replace('.', ',') + unit;
    return frInt(v) + unit;
  }

  // Per-key icon glyphs (single SVG path per key, restyled per render).
  const KPI_ICONS = {
    tx:           '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    panier:       '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V5a4 4 0 018 0v3"/>',
    tips:         '<path d="M12 2v20M15 5H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H8"/>',
    success:      '<path d="M5 12l5 5L20 7"/>',
    ratio:        '<circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>',
    regulars:     '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/>',
    tauxRetour:   '<path d="M3 12a9 9 0 119 9 9 9 0 01-6.36-2.64L3 21l.36-2.64"/><path d="M3 12h6M3 21v-6"/>',
  };
  // One sparkline path per key. Colour stays atlas; deltas drive the up/down chip.
  const KPI_SPARKS = {
    tx:         'M0 18 L15 15 L30 16 L45 12 L60 10 L75 7 L90 11 L105 6 L120 4',
    panier:     'M0 11 L15 13 L30 10 L45 14 L60 11 L75 12 L90 10 L105 13 L120 11',
    tips:       'M0 18 L15 16 L30 14 L45 15 L60 10 L75 11 L90 7 L105 4 L120 2',
    success:    'M0 7 L15 6 L30 8 L45 5 L60 6 L75 4 L90 5 L105 3 L120 2',
    ratio:      'M0 14 L15 13 L30 12 L45 11 L60 10 L75 9 L90 7 L105 6 L120 5',
    regulars:   'M0 15 L15 14 L30 15 L45 13 L60 10 L75 11 L90 9 L105 8 L120 6',
    tauxRetour: 'M0 4 L15 6 L30 5 L45 8 L60 9 L75 11 L90 10 L105 13 L120 14',
  };

  function renderKpiBand() {
    const lang = getLang();
    const data = vData(kpiByVenue, currentRange);
    if (!data) return;
    const suffix = KPI_DELTA_SUFFIX[lang]?.[currentRange] || KPI_DELTA_SUFFIX.fr[currentRange];

    const wrap = document.querySelector('[data-kpi-band]');
    if (!wrap) return;

    // Resolve which 6 KPI keys to render for this venue's vertical
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const spec = window.KiwiVenue?.getKpiSpec?.(venueType) || [];

    // Read previous values (for count-up animation continuity within same venue)
    const prevVals = {};
    wrap.querySelectorAll('.kpi-m').forEach(card => {
      const k = card.dataset.kpi;
      const v = card.querySelector('[data-kpi-val]');
      if (k && v) prevVals[k] = parseAmountFromEl(v);
    });
    const prevVenue = wrap.dataset.venue || '';
    const currentVenue = getCurrentVenue();
    const isVenueSwitch = prevVenue !== currentVenue;

    // Build tiles for each KPI key in the spec, skipping missing data
    const tiles = spec.map(s => {
      const tileData = data[s.key];
      if (!tileData) return ''; // tile hidden for this vertical/range
      const sparkPath = KPI_SPARKS[s.key] || KPI_SPARKS.tx;
      const iconPath = KPI_ICONS[s.key] || KPI_ICONS.tx;
      const i18nAttr = s.i18n ? ` data-i18n="${s.i18n}"` : '';
      // If a translation exists in T, use it as initial label; otherwise the FR label.
      const T = window.KiwiI18n?.T?.[lang] || {};
      const label = T[s.i18n] || s.label;
      return `
        <div class="kpi-m" data-kpi="${s.key}">
          <div class="l"><span${i18nAttr}>${label}</span><div class="ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconPath}</svg></div></div>
          <div class="v" data-kpi-val></div>
          <div class="d" data-kpi-delta></div>
          <svg class="sp" viewBox="0 0 120 22" preserveAspectRatio="none">
            <path d="${sparkPath}" stroke="#0B6E4F" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          </svg>
        </div>
      `;
    }).join('');
    wrap.innerHTML = tiles;
    wrap.dataset.venue = currentVenue;

    // Populate values + deltas (count-up animation only when same venue)
    spec.forEach(s => {
      const tileSpec = data[s.key];
      if (!tileSpec) return;
      const card = wrap.querySelector(`[data-kpi="${s.key}"]`);
      if (!card) return;
      const valEl = card.querySelector('[data-kpi-val]');
      const deltaEl = card.querySelector('[data-kpi-delta]');
      if (valEl) {
        if (tileSpec.text != null) {
          valEl.innerHTML = fmtKpiVal(tileSpec, 0);
        } else if (isVenueSwitch) {
          // Venue change: set value instantly (DOM was rebuilt anyway)
          valEl.innerHTML = fmtKpiVal(tileSpec, tileSpec.value);
        } else {
          const from = prevVals[s.key] ?? 0;
          animateNumber(valEl, from, tileSpec.value, { duration: 700, format: v => fmtKpiVal(tileSpec, v) });
        }
      }
      if (deltaEl) {
        const d = tileSpec.delta;
        deltaEl.className = `d${d < 0 ? ' dn' : d === 0 ? ' neutral' : ''}`;
        deltaEl.innerHTML = `${arrowSvg(d >= 0)}${fmtPct(d)} ${suffix}`;
      }
    });
  }

  /* ═══════════════ RENDER: REVENUE LINE CHART ═══════════════ */

  function fmtYTick(v) {
    if (v === 0) return '0';
    if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1).replace('.', ',') + 'M';
    if (v >= 1000) return Math.round(v / 1000) + 'k';
    return String(v);
  }

  function renderRevChart() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(revChartByVenue, currentRange);
    if (!data) return;
    const svg = document.querySelector('[data-rev-svg]');
    if (!svg) return;

    // Measure actual rendered width so 1 viewBox unit = 1 pixel (no stretching).
    const H = 280;
    const measured = Math.round(svg.clientWidth || svg.parentElement?.clientWidth || 820);
    const W = Math.max(620, measured);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Detect why we're re-rendering: full (range change) vs resize vs compare-toggle.
    // - resize → suppress all entrance animations
    // - compare-toggle (same range, same width, only showComparison flipped) → keep
    //   the primary line still, only the cmp line draws in / fades out
    const lastW = parseInt(svg.dataset.lastW || '0', 10);
    const lastRange = svg.dataset.lastRange || '';
    const lastShowCmp = svg.dataset.lastShowCmp === '1';
    const showCmpFlag = !!showComparison;
    const sameRange = lastRange === effective;
    const sameW = lastW > 0 && Math.abs(W - lastW) <= 2;
    const isResizeOnly = sameRange && lastW > 0 && Math.abs(W - lastW) > 2;
    const isCmpToggle  = sameRange && sameW && (lastShowCmp !== showCmpFlag);
    svg.dataset.lastW = String(W);
    svg.dataset.lastRange = effective;
    svg.dataset.lastShowCmp = showCmpFlag ? '1' : '0';
    svg.classList.toggle('no-anim', isResizeOnly);
    svg.classList.toggle('cmp-toggle', isCmpToggle);

    const PAD = { left: 60, right: 30, top: 22, bottom: 40 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const N = data.rev.length;
    const xAt = i => PAD.left + (N <= 1 ? innerW / 2 : (i * innerW) / (N - 1));
    const xs = data.rev.map((_, i) => xAt(i));

    const yTicks = data.yTicks;
    const yMin = Math.min(...yTicks), yMax = Math.max(...yTicks);
    const yScale = v => PAD.top + innerH * (1 - (v - yMin) / (yMax - yMin));
    const baseY = yScale(yMin);

    const pathFor = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ');
    const linePath = pathFor(data.rev);
    const cmpPath  = data.revPrev ? pathFor(data.revPrev) : '';
    const areaPath = `${linePath} L${xs[N-1].toFixed(1)} ${baseY.toFixed(1)} L${xs[0].toFixed(1)} ${baseY.toFixed(1)} Z`;

    const visibleIdx = data.visibleXIdx || data.rev.map((_, i) => i);
    const xLabelsHtml = visibleIdx.map(i =>
      `<text x="${xs[i].toFixed(1)}" y="${(H - 14).toFixed(1)}" text-anchor="middle">${data.xLabels[i] || ''}</text>`
    ).join('');
    const yLabelsHtml = yTicks.map(v => {
      const y = yScale(v);
      return `<text x="${(PAD.left - 12).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-family="JetBrains Mono" font-size="11" fill="#9A9A9A">${fmtYTick(v)}</text>`;
    }).join('');

    const showCmp = !!showComparison;
    const captionFull = COMPARE_CAPTION[lang]?.[currentRange] || COMPARE_CAPTION.fr[currentRange] || '';
    const captionShort = COMPARE_SHORT[lang]?.[currentRange] || COMPARE_SHORT.fr[currentRange] || '';

    svg.innerHTML = `
      <defs>
        <linearGradient id="gfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#053B2C" stop-opacity="0.20"/>
          <stop offset="1" stop-color="#053B2C" stop-opacity="0"/>
        </linearGradient>
        <!-- Layered Apple-style soft shadow -->
        <filter id="rev-tip-shadow" x="-50%" y="-50%" width="200%" height="240%">
          <feDropShadow dx="0" dy="2"  stdDeviation="2"  flood-color="#0A0F0D" flood-opacity="0.06"/>
          <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0A0F0D" flood-opacity="0.10"/>
        </filter>
      </defs>
      ${yLabelsHtml}
      <g font-family="Inter Tight" font-size="11" fill="#9A9A9A">${xLabelsHtml}</g>
      ${cmpPath ? `<path class="rev-cmp" d="${cmpPath}" stroke="#9A9A9A" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" pathLength="1" style="opacity:${showCmp ? 1 : 0};"/>` : ''}
      <path class="rev-area" d="${areaPath}" fill="url(#gfill)"/>
      <path class="rev-line" d="${linePath}" stroke="#053B2C" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
      <g class="rev-active" style="display:none;">
        <circle class="rev-active-cmp" cx="0" cy="0" r="4" fill="#9A9A9A" stroke="#fff" stroke-width="2"/>
        <circle class="rev-active-dot" cx="0" cy="0" r="5.5" fill="#053B2C" stroke="#fff" stroke-width="2"/>
      </g>
      <g class="rev-tip" style="opacity:0;">
        <rect class="rev-tip-rect" rx="14" ry="14" fill="#fff" stroke="rgba(10,15,13,0.06)" stroke-width="1" filter="url(#rev-tip-shadow)"/>
        <text class="rev-tip-label" x="0" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#9A9A9A" letter-spacing="1.6"></text>
        <text class="rev-tip-value" x="0" text-anchor="middle" font-family="Inter Tight" font-weight="600" font-size="17" fill="#0A0F0D" letter-spacing="-0.01em"></text>
        <text class="rev-tip-cmp"   x="0" text-anchor="middle" font-family="Inter Tight" font-weight="500" font-size="11" letter-spacing="0"></text>
      </g>
      <rect class="rev-hit" x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent" pointer-events="all"/>
    `;

    // Pointer-driven tooltip + active dots
    const hit = svg.querySelector('.rev-hit');
    const active = svg.querySelector('.rev-active');
    const aDot = svg.querySelector('.rev-active-dot');
    const aCmp = svg.querySelector('.rev-active-cmp');
    const tip = svg.querySelector('.rev-tip');
    const tipRect  = svg.querySelector('.rev-tip-rect');
    const tipLabel = svg.querySelector('.rev-tip-label');
    const tipValue = svg.querySelector('.rev-tip-value');
    const tipCmp   = svg.querySelector('.rev-tip-cmp');

    function fmtDeltaPct(now, prev) {
      if (!prev || prev <= 0) return '';
      const pct = ((now - prev) / prev) * 100;
      const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
      const abs = Math.abs(pct);
      const txt = (Math.abs(abs - Math.round(abs)) < 0.05) ? String(Math.round(abs)) : abs.toFixed(1).replace('.', ',');
      return `${sign}${txt} %`;
    }

    function move(evt) {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const xVB = ((evt.clientX - rect.left) / rect.width) * W;
      let idx = 0, best = Infinity;
      for (let i = 0; i < xs.length; i++) {
        const d = Math.abs(xs[i] - xVB);
        if (d < best) { best = d; idx = i; }
      }
      const sx = xs[idx];
      const sy = yScale(data.rev[idx]);
      const cmpY = data.revPrev ? yScale(data.revPrev[idx]) : null;
      const showCmpNow = !!showComparison && cmpY != null;

      // Active dots
      aDot.setAttribute('cx', sx.toFixed(1));
      aDot.setAttribute('cy', sy.toFixed(1));
      aCmp.style.display = showCmpNow ? '' : 'none';
      if (showCmpNow) {
        aCmp.setAttribute('cx', sx.toFixed(1));
        aCmp.setAttribute('cy', cmpY.toFixed(1));
      }
      active.style.display = '';

      // Tooltip — two heights: compact (180×54) when no compare, expanded (224×84) with compare
      const tipW = showCmpNow ? 224 : 180;
      const tipH = showCmpNow ? 84  : 54;
      const ANCHOR_GAP = 16;        // gap between tooltip bottom and the hovered dot
      const rectX = -tipW / 2;
      const rectY = -tipH - ANCHOR_GAP;

      tipRect.setAttribute('x', rectX.toFixed(1));
      tipRect.setAttribute('y', rectY.toFixed(1));
      tipRect.setAttribute('width',  tipW);
      tipRect.setAttribute('height', tipH);

      // Vertical layout inside the rect: top→bottom = label, value, (cmp)
      if (showCmpNow) {
        tipLabel.setAttribute('y', (rectY + 22).toFixed(1));   // top row
        tipValue.setAttribute('y', (rectY + 48).toFixed(1));   // middle
        tipCmp  .setAttribute('y', (rectY + 70).toFixed(1));   // bottom
      } else {
        tipLabel.setAttribute('y', (rectY + 22).toFixed(1));
        tipValue.setAttribute('y', (rectY + 44).toFixed(1));
      }

      // Position the tip group near the hovered dot, kept on-canvas
      const minTipY = PAD.top + tipH + ANCHOR_GAP + 4;     // keep tip below top edge
      const tipDy = Math.max(sy, minTipY);
      const halfW = tipW / 2 + 8;
      let tipDx = 0;
      if (sx - halfW < 4)         tipDx = halfW + 8 - sx;          // push right
      else if (sx + halfW > W - 4) tipDx = -((sx + halfW) - (W - 4)); // push left
      tip.setAttribute('transform', `translate(${(sx + tipDx).toFixed(1)}, ${tipDy.toFixed(1)})`);

      // Content
      tipLabel.textContent = (data.xLabels[idx] || '').toUpperCase();
      tipValue.textContent = `${frInt(data.rev[idx])} MAD`;
      if (showCmpNow) {
        const delta = fmtDeltaPct(data.rev[idx], data.revPrev[idx]);
        const deltaColor = (data.rev[idx] >= data.revPrev[idx]) ? '#0B6E4F' : '#C94A3A';
        tipCmp.innerHTML =
          `<tspan fill="#9A9A9A">${captionShort} · ${frInt(data.revPrev[idx])} MAD&#160;&#160;</tspan>` +
          `<tspan fill="${deltaColor}" font-weight="600">${delta}</tspan>`;
        tipCmp.style.display = '';
      } else {
        tipCmp.style.display = 'none';
      }
      tip.style.opacity = '1';
    }
    function leave() { active.style.display = 'none'; tip.style.opacity = '0'; }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerenter', move);
    hit.addEventListener('pointerleave', leave);

    // Header text
    const badge = document.querySelector('[data-rev-range-badge]');
    if (badge) badge.textContent = data.rangeBadge;
    const sub = document.querySelector('[data-rev-sub]');
    if (sub) sub.textContent = data.sub;

    // Legend (revenue lines only — transactions count moved to KPI band)
    const legend = document.querySelector('[data-rev-legend]');
    if (legend) {
      legend.innerHTML = `
        <label><i class="leg-line leg-line-primary"></i>${data.legendPrimary || ''}</label>
        ${showCmp && data.legendCompare
          ? `<label class="leg-cmp"><i class="leg-line leg-line-compare"></i>${data.legendCompare}</label>`
          : ''}
      `;
    }

    // Caption under the chart title — language-aware
    const cap = document.querySelector('[data-rev-compare-caption]');
    if (cap) {
      if (showCmp && captionFull) {
        cap.textContent = captionFull;
        cap.hidden = false;
      } else {
        cap.hidden = true;
      }
    }
  }

  /* ═══════════════ RENDER: PAYMENT MIX DONUT ═══════════════ */

  function renderMix() {
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(mixByVenue, currentRange);
    if (!data) return;
    const lang = getLang();

    const donut = document.querySelector('[data-mix-donut]');
    if (donut) {
      // Segments draw clockwise from 12 o'clock. Each segment carries its FINAL
      // dashoffset from the start; only stroke-dasharray animates from "0 100" → "P 100".
      const segs = [
        { stroke: '#0B6E4F', pct: data.visa, offset: 25 },                                          // visa
        { stroke: '#7DF2B0', pct: data.mc,   offset: -(data.visa - 25) },                            // mc
        { stroke: '#053B2C', pct: data.tap,  offset: -(data.visa + data.mc - 25) },                  // tap
        { stroke: '#D99A2B', pct: data.qr,   offset: -(data.visa + data.mc + data.tap - 25) },       // qr
      ];
      const built = donut.dataset.built === '1';
      const STAGGER_MS = 150;
      const FILL_MS = 850; // matches CSS transition duration

      if (!built) {
        donut.innerHTML = `
          <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#F2F0EA" stroke-width="7"/>
          ${segs.map((s, i) => `
            <circle class="seg" data-seg="${i}"
              cx="21" cy="21" r="15.9" fill="transparent"
              stroke="${s.stroke}" stroke-width="7"
              stroke-dasharray="0 100"
              stroke-dashoffset="${s.offset}"
              transform="rotate(-90 21 21)"
              stroke-linecap="butt"/>
          `).join('')}
        `;
        donut.dataset.built = '1';
        // Initial entrance: segments wipe in clockwise, sequentially from visa → qr.
        segs.forEach((s, i) => {
          setTimeout(() => {
            const el = donut.querySelector(`[data-seg="${i}"]`);
            if (el) el.setAttribute('stroke-dasharray', `${s.pct} 100`);
          }, 80 + i * STAGGER_MS);
        });
      } else {
        // Range change: stagger the per-segment update so the user sees the donut
        // redistribute sector by sector rather than morph all 4 at once (too subtle).
        segs.forEach((s, i) => {
          const el = donut.querySelector(`[data-seg="${i}"]`);
          if (!el) return;
          el.setAttribute('stroke', s.stroke);
          setTimeout(() => {
            el.setAttribute('stroke-dasharray', `${s.pct} 100`);
            el.setAttribute('stroke-dashoffset', String(s.offset));
          }, i * STAGGER_MS);
        });
      }

      // Center text re-fade on every render (load + range change). Force a reflow
      // between the .in removal and re-add so the transition actually replays.
      const ringCenter = donut.parentElement?.querySelector('.ring-center');
      if (ringCenter) {
        ringCenter.classList.remove('in');
        // eslint-disable-next-line no-unused-expressions
        ringCenter.offsetWidth; // force reflow
        const startOffset = built ? 0 : 80;
        const totalMs = startOffset + (segs.length - 1) * STAGGER_MS + FILL_MS - 280;
        setTimeout(() => ringCenter.classList.add('in'), totalMs);
      }
    }

    const center = document.querySelector('[data-mix-center-amt]');
    if (center) animateNumber(center, parseAmountFromEl(center), data.centerMad, { duration: 700, format: v => frInt(v) });

    // Per-venue CMI savings line under the donut
    const savingsEl = document.querySelector('[data-mix-savings]');
    if (savingsEl) savingsEl.textContent = window.KiwiVenue?.getMixCmiSavings?.() || '~3 900 MAD ce mois';

    const sub = document.querySelector('[data-mix-sub]');
    if (sub) sub.textContent = RANGE_STR[lang]?.[currentRange] || RANGE_STR.fr[currentRange];

    const legend = document.querySelector('[data-mix-legend]');
    if (legend) {
      const built = legend.dataset.built === '1';
      const rows = [
        { color: 'var(--atlas)', label: 'Visa',       pct: data.visa },
        { color: 'var(--mint)',  label: 'Mastercard', pct: data.mc   },
        { color: 'var(--riad)',  label: 'Kiwi Tap',   pct: data.tap  },
        { color: '#D99A2B',      label: 'QR',         pct: data.qr   },
      ];
      if (!built) {
        legend.innerHTML = rows.map(r =>
          `<div class="li"><div class="n"><i style="background:${r.color};"></i>${r.label}</div><div class="v" data-mix-pct="${r.label}">0 %</div></div>`
        ).join('');
        legend.dataset.built = '1';
      }
      rows.forEach(r => {
        const el = legend.querySelector(`[data-mix-pct="${r.label}"]`);
        if (!el) return;
        const from = parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0;
        animateNumber(el, from, r.pct, { duration: 600, format: v => `${Math.round(v)} %` });
      });
    }
  }

  /* ═══════════════ RENDER: LIVE FEED ═══════════════ */

  function renderFeed() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const rows = vData(FEED_BY_VENUE, currentRange);
    const wrap = document.querySelector('[data-feed]');
    if (wrap && rows) {
      wrap.innerHTML = rows.map(r => `
        <div class="feed-row${r.isNew ? ' new' : ''}">
          <div class="t">${r.t}</div>
          <div class="method">
            <div class="ci ${r.method}">${r.method === 'tap' ? 'NFC' : r.method === 'qr' ? 'QR' : ''}</div>
            <div class="desc">
              <div class="primary">${r.primary}</div>
              <div class="sub"><span class="flag ${r.flag}"></span>${r.sub}</div>
            </div>
          </div>
          <div class="ctx">${r.ctx}</div>
          <div class="amt"${r.neg ? ' style="color: var(--danger);"' : ''}>${r.amt}</div>
          <div class="tip"${r.tip === '—' ? ' style="color: var(--n-400);"' : ''}>${r.tip}</div>
          <div class="more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
        </div>
      `).join('');
    }
    const titleEl = document.querySelector('[data-feed-title]');
    if (titleEl) titleEl.textContent = FEED_TITLE[lang]?.[currentRange] || FEED_TITLE.fr[currentRange];
    const subEl = document.querySelector('[data-feed-sub]');
    if (subEl) subEl.textContent = FEED_SUB[lang]?.[currentRange] || FEED_SUB.fr[currentRange];
  }

  /* ═══════════════ RENDER: SETTLEMENT ═══════════════ */

  function renderSettle() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(settleByVenue, currentRange);
    if (!data) return;

    const lblEl = document.querySelector('[data-settle-lbl]');
    if (lblEl) lblEl.textContent = SETTLE_LBL[lang]?.[currentRange] || SETTLE_LBL.fr[currentRange];

    const amtEl = document.querySelector('[data-settle-amt]');
    if (amtEl) animateNumber(amtEl, parseIntFromEl(amtEl), data.amt, { duration: 800, format: fmtSettleAmount });

    const subEl = document.querySelector('[data-settle-sub]');
    if (subEl) subEl.textContent = data.sub;

    const detailEl = document.querySelector('[data-settle-detail]');
    if (detailEl) {
      detailEl.innerHTML = `
        <span>${SETTLE_DETAIL_LBL[lang] || SETTLE_DETAIL_LBL.fr}</span>
        <span style="color: var(--mint); font-family: var(--mono);">${data.detailVal}</span>
      `;
    }
  }

  /* ═══════════════ RENDER: TIMELINE WEEK TOTAL ═══════════════ */

  function renderTimeline() {
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const total = (timelineWeekTotalByVenue[getCurrentVenue()] || timelineWeekTotalByVenue.cafeAtlas)[effective];
    const totalEl = document.querySelector('[data-timeline-week-total]');
    if (totalEl && total) totalEl.textContent = total;
  }

  /* ═══════════════ RENDER: HEALTH SCORE ═══════════════ */

  function renderHealth() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(healthByVenue, currentRange);
    if (!data) return;

    const subEl = document.querySelector('[data-health-sub]');
    if (subEl) subEl.textContent = HEALTH_SUB[lang]?.[currentRange] || HEALTH_SUB.fr[currentRange];

    const chipEl = document.querySelector('[data-health-chip]');
    if (chipEl) chipEl.textContent = HEALTH_CHIP[lang]?.[data.chipKey] || HEALTH_CHIP.fr[data.chipKey];

    const scoreEl = document.querySelector('[data-health-score]');
    if (scoreEl) animateNumber(scoreEl, parseIntFromEl(scoreEl), data.score, { duration: 700, format: v => `${Math.round(v)}` });

    const arc = document.querySelector('[data-health-arc]');
    if (arc) arc.setAttribute('stroke-dasharray', `${data.score} 100`);
  }

  /* ═══════════════ RENDER: BENCHMARK ═══════════════ */

  function renderBench() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(benchByVenue, currentRange);
    if (!data) return;

    // Title + sub vary by venue type (cafés / boutiques / spas similaires)
    const benchLabels = window.KiwiVenue?.getBenchLabels?.() || { title: 'Vous vs cafés similaires', sub: BENCH_SUB.fr[currentRange] };
    const titleEl = document.querySelector('[data-bench-title]');
    if (titleEl) titleEl.textContent = benchLabels.title;
    const subEl = document.querySelector('[data-bench-sub]');
    if (subEl) subEl.textContent = benchLabels.sub || BENCH_SUB[lang]?.[currentRange] || BENCH_SUB.fr[currentRange];

    const rankEl = document.querySelector('[data-bench-rank]');
    if (rankEl) rankEl.textContent = `#${data.rank}`;

    // Match the rank-sub wording to the vertical
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const peerLabel = venueType === 'boutique' ? 'boutiques' : venueType === 'spa' ? 'spas' : 'cafés';
    const cityLabel = venueType === 'spa' ? 'Casa / Marrakech' : 'Casablanca';
    const rankSubEl = document.querySelector('[data-bench-rank-sub]');
    if (rankSubEl) rankSubEl.innerHTML = `sur <b>${data.total} ${peerLabel}</b> à ${cityLabel} · top <b>${data.top} %</b>`;

    const comp = document.querySelector('[data-bench-comp]');
    if (comp) {
      comp.innerHTML = data.rows.map(r => `
        <div class="bench-row">
          <div class="lbl">${r.lbl}</div>
          <div class="bench-bar">
            <div class="you" style="width: ${r.you}%;"></div>
            <div class="peer" style="left: ${r.peer}%;"></div>
          </div>
          <div class="v"${r.warn ? ' style="color: var(--warning);"' : ''}>${r.v}</div>
        </div>
      `).join('');
    }
  }

  /* ═══════════════ RENDER: TOP PRODUCTS ═══════════════ */

  function renderProducts() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(productsByVenue, currentRange);
    const list = document.querySelector('[data-products-list]');
    if (list && data) {
      list.innerHTML = data.map((p, i) => `
        <div class="prod-row">
          <div class="rank${i === 0 ? ' top' : ''}">${p.rank}</div>
          <div class="info">
            <div class="n">${p.name}</div>
            <div class="r">${p.sub}</div>
          </div>
          <div class="mini-bar"><div style="width: ${p.bar}%;"></div></div>
          <div class="sales">${p.sales}</div>
        </div>
      `).join('');
    }
    const sub = document.querySelector('[data-products-sub]');
    if (sub) sub.textContent = PRODUCTS_SUB[lang]?.[currentRange] || PRODUCTS_SUB.fr[currentRange];
  }

  /* ═══════════════ RENDER: STAFF ═══════════════ */

  function renderStaff() {
    const lang = getLang();
    const effective = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    const data = vData(staffByVenue, currentRange);
    const list = document.querySelector('[data-staff-list]');
    if (list && data) {
      list.innerHTML = data.map(s => `
        <div class="staff-row">
          <div class="av ${s.cls}"${s.cls === 'offline' ? ' style="background: var(--n-400);"' : ''}>${s.av}</div>
          <div class="info">
            <div class="n">${s.name}</div>
            <div class="role">${s.role}</div>
          </div>
          <div class="shift"${s.shift === '—' ? ' style="color: var(--n-400);"' : ''}>${s.shift}</div>
          <div class="tx-n"${s.amt === '—' ? ' style="color: var(--n-400);"' : ''}>${s.amt}${s.tx ? `<br/><span style="color: var(--success); font-size: 10.5px;">${s.tx}</span>` : ''}</div>
        </div>
      `).join('');
    }
    const sub = document.querySelector('[data-staff-sub]');
    if (sub) sub.textContent = STAFF_SUB[lang]?.[currentRange] || STAFF_SUB.fr[currentRange];
  }

  /* ═══════════════ ACTION HANDLER + I18N HOOK ═══════════════ */

  function onAction(el) {
    const id = el?.dataset?.range;
    if (!id) return;
    setDateRange(id);
  }
  function onCompareToggle() { setShowComparison(!showComparison); }

  function hookI18n() {
    const api = window.KiwiI18n;
    if (!api?.setLang || api.__drWrapped) return;
    const orig = api.setLang;
    api.setLang = function () {
      const r = orig.apply(this, arguments);
      // Re-render everything that has lang-dependent text
      renderSelector();
      renderHero();
      renderGoal();
      renderHeatmap();
      renderKpiBand();
      renderRevChart();
      renderMix();
      renderFeed();
      renderSettle();
      renderHealth();
      renderBench();
      renderProducts();
      renderStaff();
      return r;
    };
    api.__drWrapped = true;
  }

  function registerHandler() {
    const tryReg = () => {
      if (window.Kiwi?.handlers) {
        window.Kiwi.handlers['date-range'] = onAction;
        window.Kiwi.handlers['rev-compare'] = onCompareToggle;
        window.Kiwi.handlers['hh-ai-glovo'] = () => {
          window.Kiwi?.toast?.('Combo Glovo · bientôt disponible', {
            type: 'info',
            desc: "Disponible quand l'intégration Glovo passe en live (Phase 2 · Kiwi Pay)."
          });
        };
        return;
      }
      setTimeout(tryReg, 30);
    };
    tryReg();
  }

  function init() {
    if (!/dashboard\.html/.test(location.pathname)) return;
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    currentRange = VALID.includes(stored) ? stored : DEFAULT_RANGE;
    try { showComparison = localStorage.getItem(CMP_KEY) === '1'; } catch (_) {}

    registerHandler();
    hookI18n();

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
    subscribe(renderTimeline);
    subscribe(renderHealth);
    subscribe(renderBench);
    subscribe(renderProducts);
    subscribe(renderStaff);

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
          renderTimeline();
          renderHealth();
          renderBench();
          renderProducts();
          renderStaff();
        });
        return;
      }
      setTimeout(subVenue, 30);
    };
    subVenue();

    // Re-fit hero amount + re-flow chart on viewport resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const amtEl = document.querySelector('[data-hero-amount]');
        if (amtEl) {
          const eff = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
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
    renderTimeline();
    renderHealth();
    renderBench();
    renderProducts();
    renderStaff();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ─── Live tick API · called from polish.js when a new fake tx lands ─── */
  function tickLiveRevenue({ amount = 0, tip = 0 } = {}) {
    // Live ticks only make sense on "today" — skip on historical ranges.
    const r = currentRange === 'personnalise' ? 'aujourdhui' : currentRange;
    if (r !== 'aujourdhui') return;
    // And only mutate the currently active venue's data (each venue has its own).
    const v = getCurrentVenue();
    const hero = heroDataByVenue[v]?.aujourdhui;
    const goal = goalByVenue[v]?.aujourdhui;
    const kpi  = kpiByVenue[v]?.aujourdhui;
    if (!hero || !goal || !kpi) return;

    hero.amount += amount;
    goal.current = hero.amount;
    // Keep "Net après Kiwi" roughly proportional (~83.9 % after commission)
    hero.netAfterKiwi = Math.round(hero.amount * 0.839);

    // Bump KPI counters that the live tx affects
    if (kpi.tx)     kpi.tx.value += 1;
    if (kpi.tips)   kpi.tips.value += tip;
    if (kpi.panier && kpi.tx?.value > 0) {
      kpi.panier.value = Math.round(hero.amount / kpi.tx.value);
    }
    if (kpi.regulars) kpi.regulars.unit = `/ ${kpi.tx.value}`;

    // Re-render the affected blocks (each respects its own animation)
    renderHero();
    renderGoal();
    renderKpiBand();
  }

  window.KiwiDateRange = { getDateRange, setDateRange, subscribe, tickLiveRevenue, getShowComparison, setShowComparison };
})();
