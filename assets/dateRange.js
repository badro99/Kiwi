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
  // Translate a captured-FR string through a { frString: {en,ar} } map.
  // FR locale or an unmapped string falls through to the original — the
  // same graceful pattern used by the [lang]?.[key] || .fr[key] lookups.
  function trStr(fr, map) {
    const lang = getLang();
    if (lang === 'fr' || !fr) return fr;
    return (map[fr] && map[fr][lang]) || fr;
  }
  // Translate "PREFIX · rest" — only the prefix is localized, the rest
  // (usually a formatted amount) is kept verbatim.
  function trLegend(fr, map) {
    const lang = getLang();
    if (lang === 'fr' || !fr) return fr;
    const i = fr.indexOf(' · ');
    if (i < 0) return (map[fr] && map[fr][lang]) || fr;
    const pre = fr.slice(0, i);
    return ((map[pre] && map[pre][lang]) || pre) + fr.slice(i);
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
  function pairedMerchant() {
    try {
      const P = window.KiwiCaissePairing;
      const pv = P?.pairedVenue?.();
      if (P?.isPaired?.() && pv?.merchant) return true;
    } catch (_) {}
    try {
      if (localStorage.getItem('kiwiPaired') !== '1') return false;
      const pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return !!(pv?.merchant || localStorage.getItem('kiwiLiveMerchant'));
    } catch (_) { return false; }
  }
  const ownData = (id) => {
    const KV = window.KiwiVenue;
    if (KV && KV.isCustom && KV.isCustom(id)) return true;
    return !!(window.KiwiEnv?.isReal?.() || window.KiwiMe || pairedMerchant());
  };

  /* A DIFFERENT question from ownData(), and the distinction matters enough to
   * have its own name. ownData() asks "is this my data?" — the one ownership
   * decision, answered above. customVenue() asks "has this merchant actually
   * configured this venue?", which is narrower: a hosted merchant sitting on a
   * seeded venue id owns their session but has configured nothing.
   *
   * Both used to be written as an inline optional-chained isCustom call at the
   * call site, which is how the two questions got confused in the first place —
   * cards asked "is it custom?" when they meant "is it mine?" and painted a
   * stranger's day. tools/agent-test.js bans that inline spelling outright (it
   * greps the source, so do not reproduce the literal form even in a comment);
   * asking either question now means calling one of these two named helpers. */
  const customVenue = (id) => {
    const KV = window.KiwiVenue;
    return !!(KV && KV.isCustom && KV.isCustom(id));
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
  function aggFusion(values, parentKey, rateCtx) {
    const defined = values.filter(v => v !== undefined && v !== null);
    if (defined.length === 0) return values[0] ?? null;
    const first = defined[0];
    // Rate context: once an ancestor key is "rate-like" (success/ratio/taux/
    // delta…) every numeric descendant averages instead of sums. This keeps
    // a fused success of 95% × 92% × 88% reading as ~91%, not 275%.
    const myRateCtx = rateCtx || FUSION_AVG_KEYS.test(String(parentKey || ''));
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
    if (isPlainObj(first)) {
      const keys = new Set();
      defined.forEach(o => isPlainObj(o) && Object.keys(o).forEach(k => keys.add(k)));
      const out = {};
      keys.forEach(k => {
        const slice = defined.map(o => isPlainObj(o) ? o[k] : undefined);
        out[k] = aggFusion(slice, k, myRateCtx);
      });
      return out;
    }
    return first;
  }
  // Safe empty clone of a fixture slice. Numeric series retain their shape;
  // merchant-facing strings and object rows are removed, so this accessor can
  // never hand a future renderer a demo identity, IBAN, label or transaction.
  const EMPTY_META_KEYS = new Set(['unit', 'fmt', 'color', 'chipKey', 'cls']);
  function zeroClone(x, key) {
    if (typeof x === 'number') return 0;
    /* Numeric series keep their shape so charts can render a truthful flat
       baseline. Object/string arrays are merchant facts (feed rows, products,
       staff, labels): keeping their length would keep the demo identities. */
    if (Array.isArray(x)) {
      return x.every((v) => typeof v === 'number' || v == null)
        ? x.map((v) => v == null ? null : 0)
        : [];
    }
    if (x && typeof x === 'object') {
      const o = {};
      for (const k in x) o[k] = zeroClone(x[k], k);
      return o;
    }
    if (typeof x === 'string') return EMPTY_META_KEYS.has(key) ? x : '';
    if (typeof x === 'boolean') return false;
    return x;
  }

  // Resolve a venue-keyed table for the active venue + range, with cafeAtlas fallback.
  function vData(table, range) {
    const v = getCurrentVenue();
    const knownRanges = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'personnalise'];
    const requested = range === 'personnalise' ? effRange() : range;
    const hasRequested = !!(table?.[v]?.[requested] ?? table?.cafeAtlas?.[requested]);
    const eff = knownRanges.includes(range) || hasRequested ? requested : 'trenteJours';
    // A user-created venue has no demo data — hand back a zeroed clone of its
    // base type's demo sibling so the dashboard renders empty rather than
    // borrowing live numbers via the fallback below. The shape must match the
    // vertical (a boutique-based venue needs tauxRetour, a spa needs tips…),
    // otherwise vertical-specific KPI tiles silently drop.
    if (ownData(v)) {
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
    return table?.[v]?.[eff] ?? table?.cafeAtlas?.[eff] ?? table?.[v]?.trenteJours ?? table?.cafeAtlas?.trenteJours;
  }
  // True only on the live "today" range, with the demo clock active.
  function isLiveDemo() {
    const eff = effRange();
    // A user-created venue has no synthetic demo clock — it stays at zero
    // until the merchant records real sales.
    if (ownData(getCurrentVenue())) return false;
    return eff === 'aujourdhui' && !!window.KiwiDemoClock?.isActive?.();
  }
  function getSim() { return window.KiwiDemoClock?.getSimState?.() || null; }
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
  const NET_LABEL = { fr: 'NET APRÈS KIWI', en: 'NET AFTER KIWI', ar: 'الصافي بعد كيوي' };

  const KPI_DELTA_SUFFIX = {
    fr: { aujourdhui: 'vs hier', hier: 'vs avant-hier', septJours: 'vs 7 jours préc.', trenteJours: 'vs 30 jours préc.', moisDernier: 'vs mois préc.', trimestre: 'vs trimestre préc.', annee: 'vs année préc.', personnalise: 'vs hier' },
    en: { aujourdhui: 'vs yesterday', hier: 'vs day before', septJours: 'vs prev. 7 days', trenteJours: 'vs prev. 30 days', moisDernier: 'vs prev. month', trimestre: 'vs prev. quarter', annee: 'vs prev. year', personnalise: 'vs yesterday' },
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

  const HH_SUB = {
    // moisDernier/trimestre/annee reuse the 30-day hourly profile (buildHeatmap
    // maps them onto trenteJours), so their labels say "typical profile" rather
    // than claim period-exact data.
    fr: { aujourdhui: "Intensité horaire aujourd'hui", hier: 'Intensité horaire hier', septJours: 'Intensité horaire moyenne, 7 derniers jours', trenteJours: 'Intensité horaire moyenne, 30 derniers jours', moisDernier: 'Profil horaire type, moyenne longue période', trimestre: 'Profil horaire type, moyenne longue période', annee: 'Profil horaire type, moyenne longue période', personnalise: 'Intensité horaire, période personnalisée' },
    en: { aujourdhui: 'Hourly intensity today', hier: 'Hourly intensity yesterday', septJours: 'Average hourly intensity, last 7 days', trenteJours: 'Average hourly intensity, last 30 days', moisDernier: 'Typical hourly profile, long-run average', trimestre: 'Typical hourly profile, long-run average', annee: 'Typical hourly profile, long-run average', personnalise: 'Hourly intensity, custom period' },
    ar: { aujourdhui: 'كثافة الساعات اليوم', hier: 'كثافة الساعات أمس', septJours: 'متوسط الكثافة الساعية، آخر 7 أيام', trenteJours: 'متوسط الكثافة الساعية، آخر 30 يومًا', moisDernier: 'النمط الساعي النموذجي، متوسط طويل المدى', trimestre: 'النمط الساعي النموذجي، متوسط طويل المدى', annee: 'النمط الساعي النموذجي، متوسط طويل المدى', personnalise: 'كثافة الساعات، فترة مخصصة' },
  };
  const COVERS_LABEL = { fr: 'couverts', en: 'guests', ar: 'زبون' };

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
  };
  const REV_SUB = {
    'Cumul horaire · service en cours':      { en: 'Hourly cumulative · service in progress', ar: 'تراكم بالساعة · الخدمة جارية' },
    "Cumul horaire · journée d'hier":        { en: "Hourly cumulative · yesterday",           ar: 'تراكم بالساعة · يوم أمس' },
    'Cumul horaire · boutique ouverte':      { en: 'Hourly cumulative · shop open',           ar: 'تراكم بالساعة · المتجر مفتوح' },
    'Cumul horaire · réservations en cours': { en: 'Hourly cumulative · bookings in progress',ar: 'تراكم بالساعة · الحجوزات جارية' },
    'Total journalier · 7 derniers jours':   { en: 'Daily total · last 7 days',               ar: 'الإجمالي اليومي · آخر 7 أيام' },
    'Total journalier · 30 derniers jours':  { en: 'Daily total · last 30 days',              ar: 'الإجمالي اليومي · آخر 30 يومًا' },
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

  const heroDataByVenue = {
    cafeAtlas: {
      aujourdhui:  { amount: 27512.50, deltaHier: 3.2,  deltaSemaine: 18,   deltaMois: 9,  netAfterKiwi: 23091  },
      hier:        { amount: 24820.00, deltaHier: -1.8, deltaSemaine: 12,   deltaMois: 6,  netAfterKiwi: 20640  },
      septJours:   { amount: 198400.00,deltaHier: null, deltaSemaine: 22,   deltaMois: 11, netAfterKiwi: 165280 },
      trenteJours: { amount: 842300.00,deltaHier: null, deltaSemaine: null, deltaMois: 15, netAfterKiwi: 702800 },
      moisDernier: { amount: 783339.00,deltaHier: null, deltaSemaine: null, deltaMois: 11, netAfterKiwi: 653604 },
      trimestre:   { amount: 2526900.00,deltaHier: null, deltaSemaine: null, deltaMois: 12, netAfterKiwi: 2108400 },
      annee:       { amount: 10107600.00,deltaHier: null, deltaSemaine: null, deltaMois: 18, netAfterKiwi: 8433600 },
      personnalise: null,
    },
    maisonMansour: {
      aujourdhui:  { amount: 11820.00, deltaHier: -2.4, deltaSemaine: 11,   deltaMois: 7,  netAfterKiwi: 9920   },
      hier:        { amount: 12110.00, deltaHier: 1.8,  deltaSemaine: 8,    deltaMois: 5,  netAfterKiwi: 10170  },
      septJours:   { amount: 84800.00, deltaHier: null, deltaSemaine: 14,   deltaMois: 8,  netAfterKiwi: 71200  },
      trenteJours: { amount: 358200.00,deltaHier: null, deltaSemaine: null, deltaMois: 12, netAfterKiwi: 300700 },
      moisDernier: { amount: 333126.00,deltaHier: null, deltaSemaine: null, deltaMois: 9,  netAfterKiwi: 279651 },
      trimestre:   { amount: 1074600.00,deltaHier: null, deltaSemaine: null, deltaMois: 11, netAfterKiwi: 902100 },
      annee:       { amount: 4298400.00,deltaHier: null, deltaSemaine: null, deltaMois: 16, netAfterKiwi: 3608400 },
      personnalise: null,
    },
    spaBahia: {
      aujourdhui:  { amount: 8950.00,  deltaHier: 6.8,  deltaSemaine: 22,   deltaMois: 14, netAfterKiwi: 7510   },
      hier:        { amount: 8380.00,  deltaHier: -3.1, deltaSemaine: 16,   deltaMois: 9,  netAfterKiwi: 7035   },
      septJours:   { amount: 64200.00, deltaHier: null, deltaSemaine: 19,   deltaMois: 11, netAfterKiwi: 53890  },
      trenteJours: { amount: 269400.00,deltaHier: null, deltaSemaine: null, deltaMois: 16, netAfterKiwi: 226300 },
      moisDernier: { amount: 250542.00,deltaHier: null, deltaSemaine: null, deltaMois: 12, netAfterKiwi: 210459 },
      trimestre:   { amount: 808200.00,deltaHier: null, deltaSemaine: null, deltaMois: 13, netAfterKiwi: 678900 },
      annee:       { amount: 3232800.00,deltaHier: null, deltaSemaine: null, deltaMois: 19, netAfterKiwi: 2715600 },
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
        marge:    { value: 71.4,   unit: '%',    fmt: 'pct1', delta: 1.8 },
        success:  { value: 99.34,  unit: '%',    fmt: 'pct2', delta: 0.2 },
        ratio:    { text: '68 / 32', unit: '%',                delta: 4 },
        regulars: { value: 47,     unit: '/ 182',fmt: 'int',  delta: 26 },
      },
      hier: {
        tx:       { value: 168,    unit: '',     fmt: 'int',  delta: 8.4 },
        panier:   { value: 132,    unit: 'MAD',  fmt: 'int',  delta: 0.8 },
        marge:    { value: 69.6,   unit: '%',    fmt: 'pct1', delta: 0.4 },
        success:  { value: 99.18,  unit: '%',    fmt: 'pct2', delta: 0.1 },
        ratio:    { text: '64 / 36', unit: '%',                delta: 2 },
        regulars: { value: 42,     unit: '/ 168',fmt: 'int',  delta: 25 },
      },
      septJours: {
        tx:       { value: 1240,   unit: '',     fmt: 'int',  delta: 18 },
        panier:   { value: 138,    unit: 'MAD',  fmt: 'int',  delta: 3 },
        marge:    { value: 70.8,   unit: '%',    fmt: 'pct1', delta: 2.1 },
        success:  { value: 99.28,  unit: '%',    fmt: 'pct2', delta: 0.3 },
        ratio:    { text: '66 / 34', unit: '%',                delta: 5 },
        regulars: { value: 286,    unit: '/ 1240',fmt:'int',  delta: 23 },
      },
      trenteJours: {
        tx:       { value: 5320,   unit: '',     fmt: 'int',  delta: 21 },
        panier:   { value: 142,    unit: 'MAD',  fmt: 'int',  delta: 5 },
        marge:    { value: 70.2,   unit: '%',    fmt: 'pct1', delta: 1.5 },
        success:  { value: 99.32,  unit: '%',    fmt: 'pct2', delta: 0.5 },
        ratio:    { text: '68 / 32', unit: '%',                delta: 6 },
        regulars: { value: 1240,   unit: '/ 5320',fmt:'int',  delta: 24 },
      },
      moisDernier: {
        tx:       { value: 4948,   unit: '',     fmt: 'int',  delta: 17 },
        panier:   { value: 140,    unit: 'MAD',  fmt: 'int',  delta: 3 },
        marge:    { value: 69.4,   unit: '%',    fmt: 'pct1', delta: 0.9 },
        success:  { value: 99.26,  unit: '%',    fmt: 'pct2', delta: 0.3 },
        ratio:    { text: '67 / 33', unit: '%',                delta: 4 },
        regulars: { value: 1153,   unit: '/ 4948',fmt:'int',  delta: 19 },
      },
      trimestre: {
        tx:       { value: 15960,  unit: '',     fmt: 'int',  delta: 12 },
        panier:   { value: 143,    unit: 'MAD',  fmt: 'int',  delta: 4 },
        marge:    { value: 70.0,   unit: '%',    fmt: 'pct1', delta: 1.2 },
        success:  { value: 99.30,  unit: '%',    fmt: 'pct2', delta: 0.4 },
        ratio:    { text: '68 / 32', unit: '%',                delta: 5 },
        regulars: { value: 3720,   unit: '/ 15960',fmt:'int', delta: 16 },
      },
      annee: {
        tx:       { value: 63840,  unit: '',     fmt: 'int',  delta: 18 },
        panier:   { value: 145,    unit: 'MAD',  fmt: 'int',  delta: 6 },
        marge:    { value: 70.6,   unit: '%',    fmt: 'pct1', delta: 2.4 },
        success:  { value: 99.35,  unit: '%',    fmt: 'pct2', delta: 0.6 },
        ratio:    { text: '69 / 31', unit: '%',                delta: 6 },
        regulars: { value: 14880,  unit: '/ 63840',fmt:'int', delta: 21 },
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
      moisDernier: {
        tx:         { value: 1153,  unit: '',     fmt: 'int',  delta: 14 },
        panier:     { value: 286,   unit: 'MAD',  fmt: 'int',  delta: 3 },
        tauxRetour: { value: 6.3,   unit: '%',    fmt: 'pct1', delta: -1.1 },
        success:    { value: 99.4,  unit: '%',    fmt: 'pct2', delta: 0.2 },
        ratio:      { text: '84 / 16', unit: '%',               delta: 4 },
        regulars:   { value: 298,   unit: '/ 1153',fmt:'int',  delta: 17 },
      },
      trimestre: {
        tx:         { value: 3720,  unit: '',     fmt: 'int',  delta: 11 },
        panier:     { value: 291,   unit: 'MAD',  fmt: 'int',  delta: 4 },
        tauxRetour: { value: 5.9,   unit: '%',    fmt: 'pct1', delta: -0.9 },
        success:    { value: 99.5,  unit: '%',    fmt: 'pct2', delta: 0.3 },
        ratio:      { text: '85 / 15', unit: '%',               delta: 4 },
        regulars:   { value: 960,   unit: '/ 3720',fmt:'int',  delta: 15 },
      },
      annee: {
        tx:         { value: 14880, unit: '',     fmt: 'int',  delta: 16 },
        panier:     { value: 294,   unit: 'MAD',  fmt: 'int',  delta: 6 },
        tauxRetour: { value: 5.7,   unit: '%',    fmt: 'pct1', delta: -1.2 },
        success:    { value: 99.6,  unit: '%',    fmt: 'pct2', delta: 0.4 },
        ratio:      { text: '86 / 14', unit: '%',               delta: 5 },
        regulars:   { value: 3840,  unit: '/ 14880',fmt:'int', delta: 19 },
      },
      personnalise: null,
    },
    spaBahia: {
      aujourdhui: {
        tx:       { value: 20,    unit: '',     fmt: 'int',  delta: 14 },
        panier:   { value: 447,   unit: 'MAD',  fmt: 'int',  delta: 6.5 },
        marge:    { value: 78.2,  unit: '%',    fmt: 'pct1', delta: 2.1 },
        success:  { value: 92.5,  unit: '%',    fmt: 'pct1', delta: 3.2 },
        ratio:    { text: '92 / 8', unit: '%',                 delta: 2 },
        regulars: { value: 14,    unit: '/ 20', fmt: 'int',  delta: 12 },
      },
      hier: {
        tx:       { value: 18,    unit: '',     fmt: 'int',  delta: 5 },
        panier:   { value: 466,   unit: 'MAD',  fmt: 'int',  delta: 2 },
        marge:    { value: 76.5,  unit: '%',    fmt: 'pct1', delta: -0.8 },
        success:  { value: 89.3,  unit: '%',    fmt: 'pct1', delta: -1.5 },
        ratio:    { text: '90 / 10', unit: '%',                 delta: -2 },
        regulars: { value: 13,    unit: '/ 18', fmt: 'int',  delta: 14 },
      },
      septJours: {
        tx:       { value: 142,   unit: '',     fmt: 'int',  delta: 19 },
        panier:   { value: 452,   unit: 'MAD',  fmt: 'int',  delta: 4 },
        marge:    { value: 77.8,  unit: '%',    fmt: 'pct1', delta: 1.6 },
        success:  { value: 91.8,  unit: '%',    fmt: 'pct1', delta: 2.7 },
        ratio:    { text: '91 / 9', unit: '%',                 delta: 3 },
        regulars: { value: 92,    unit: '/ 142',fmt: 'int',  delta: 18 },
      },
      trenteJours: {
        tx:       { value: 580,   unit: '',     fmt: 'int',  delta: 22 },
        panier:   { value: 464,   unit: 'MAD',  fmt: 'int',  delta: 6 },
        marge:    { value: 78.0,  unit: '%',    fmt: 'pct1', delta: 2.4 },
        success:  { value: 92.1,  unit: '%',    fmt: 'pct1', delta: 4.5 },
        ratio:    { text: '92 / 8', unit: '%',                 delta: 5 },
        regulars: { value: 412,   unit: '/ 580',fmt: 'int',  delta: 20 },
      },
      moisDernier: {
        tx:       { value: 539,   unit: '',     fmt: 'int',  delta: 18 },
        panier:   { value: 458,   unit: 'MAD',  fmt: 'int',  delta: 4 },
        marge:    { value: 77.2,  unit: '%',    fmt: 'pct1', delta: 1.1 },
        success:  { value: 91.6,  unit: '%',    fmt: 'pct1', delta: 3.6 },
        ratio:    { text: '91 / 9', unit: '%',                 delta: 4 },
        regulars: { value: 383,   unit: '/ 539',fmt: 'int',  delta: 16 },
      },
      trimestre: {
        tx:       { value: 1740,  unit: '',     fmt: 'int',  delta: 13 },
        panier:   { value: 466,   unit: 'MAD',  fmt: 'int',  delta: 5 },
        marge:    { value: 77.6,  unit: '%',    fmt: 'pct1', delta: 1.8 },
        success:  { value: 92.3,  unit: '%',    fmt: 'pct1', delta: 4.0 },
        ratio:    { text: '92 / 8', unit: '%',                 delta: 5 },
        regulars: { value: 1236,  unit: '/ 1740',fmt:'int',   delta: 17 },
      },
      annee: {
        tx:       { value: 6960,  unit: '',     fmt: 'int',  delta: 19 },
        panier:   { value: 472,   unit: 'MAD',  fmt: 'int',  delta: 7 },
        marge:    { value: 78.4,  unit: '%',    fmt: 'pct1', delta: 3.0 },
        success:  { value: 92.8,  unit: '%',    fmt: 'pct1', delta: 4.8 },
        ratio:    { text: '93 / 7', unit: '%',                 delta: 6 },
        regulars: { value: 4944,  unit: '/ 6960',fmt:'int',   delta: 21 },
      },
      personnalise: null,
    },
  };

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

  const revChartByVenue = {
    cafeAtlas: {
    // Today: hourly cumulative across the full opening band (11h → 02h).
    // Past hours (≤14h) are real cumul; post-14h are projected forward to end of service.
    // Compare line is yesterday's full-day cumul at the same hours.
    aujourdhui: {
      rangeBadge: "AUJOURD'HUI · LIVE",
      sub: 'Cumul horaire · service en cours',
      xLabels: ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'],
      visibleXIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // every 2h: 12h, 14h, 16h, 18h, 20h, 22h, 00h, 02h
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
      visibleXIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
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
        visibleXIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
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
        visibleXIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
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
        visibleXIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
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
        visibleXIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
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
      aujourdhui:  { card: 48, cash: 52, centerMad: 16590,  fee: '288,50 MAD · 1,19 %' },
      hier:        { card: 50, cash: 50, centerMad: 14920,  fee: '264,80 MAD · 1,19 %' },
      septJours:   { card: 47, cash: 53, centerMad: 134700, fee: '2 230 MAD · 1,19 %' },
      trenteJours: { card: 46, cash: 54, centerMad: 568200, fee: '9 480 MAD · 1,19 %' },
      personnalise: null,
    },
    maisonMansour: {
      aujourdhui:  { card: 52, cash: 48, centerMad: 6150,   fee: '141 MAD · 1,19 %' },
      hier:        { card: 51, cash: 49, centerMad: 6175,   fee: '144 MAD · 1,19 %' },
      septJours:   { card: 53, cash: 47, centerMad: 44944,  fee: '1 010 MAD · 1,19 %' },
      trenteJours: { card: 52, cash: 48, centerMad: 186264, fee: '4 260 MAD · 1,19 %' },
      personnalise: null,
    },
    spaBahia: {
      aujourdhui:  { card: 58, cash: 42, centerMad: 5191,   fee: '107 MAD · 1,19 %' },
      hier:        { card: 57, cash: 43, centerMad: 4777,   fee: '100 MAD · 1,19 %' },
      septJours:   { card: 59, cash: 41, centerMad: 37878,  fee: '764 MAD · 1,19 %' },
      trenteJours: { card: 58, cash: 42, centerMad: 156252, fee: '3 206 MAD · 1,19 %' },
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
    // 'personnalise' is only meaningful with a date pair behind it.
    if (id === 'personnalise' && !customRange) id = DEFAULT_RANGE;
    currentRange = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
    renderSelector();
    subscribers.forEach(fn => { try { fn(id); } catch (_) {} });
  }
  /* Commit a calendar-picked pair and switch the dashboard onto it —
   * called by the custom-range popover's "Appliquer" button. */
  function commitCustomRange(start, end) {
    if (!start || !end) return;
    customRange = start <= end ? { start, end } : { start: end, end: start };
    try {
      localStorage.setItem(CUSTOM_KEY,
        dateToIso(customRange.start) + '|' + dateToIso(customRange.end));
    } catch (_) {}
    setDateRange('personnalise');
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
    if (id === 'septJours')   return `${fmtShort(offsetDays(-6))}, ${fmtDate(today)}`;
    if (id === 'trenteJours') return `${fmtShort(offsetDays(-30))}, ${fmtDate(today)}`;
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
    // Hidden tabs freeze requestAnimationFrame — set the final value at once
    // so a background re-render never leaves a tile blank.
    if (document.hidden) { el['inner' + 'HTML'] = format(to); return; }
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
    document.querySelectorAll('.dr-pill').forEach(p => {
      const on = p.dataset.range === currentRange;
      p.classList.toggle('on', on);
      p.setAttribute('aria-pressed', String(on));
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
  function dayCutoffH() {
    try {
      const h = window.KiwiDayReport?.cutoff?.();
      return (typeof h === 'number' && isFinite(h) && h >= 0 && h <= 12) ? h : 0;
    } catch (_) { return 0; }
  }
  function dayStartMs(t) {
    const h = dayCutoffH();
    // Reculer de la bascule avant de prendre la date, puis la remettre : une
    // vente à 00 h 30 avec une bascule à 5 h retombe sur la veille 05 h 00.
    const d = new Date(t - h * 3600000);
    d.setHours(0, 0, 0, 0);
    return d.getTime() + h * 3600000;
  }
  function realSalesList() {
    try {
      const v = getCurrentVenue();
      /* In the documented real-but-not-custom gap, `v` can still be a demo id
         for one render. That id is not a source for this merchant. */
      if (ownData(v) && !customVenue(v)) return [];
      return (window.KiwiSales?.list?.(v) || []);
    } catch (_) { return []; }
  }
  // Window bounds [from, to) in ms for a range, relative to now.
  function rangeBounds(range) {
    const today = dayStartMs(Date.now());
    if (range === 'aujourdhui') return [today, Infinity];
    if (range === 'hier')       return [today - 864e5, today];
    const days = RANGE_DAYS[range] || 1;
    return [today - (days - 1) * 864e5, Infinity];
  }
  // Windowed revenue / count / basket from the merchant's real sales.
  function realSalesTotals(range) {
    const [from, to] = rangeBounds(range || effRange());
    let revenue = 0, count = 0;
    realSalesList().forEach(e => {
      const ts = +e.ts || 0;
      if (ts >= from && ts < to) { revenue += Math.max(0, +e.amount || 0); count++; }
    });
    return { revenue, count, basket: count ? revenue / count : 0 };
  }
  /* Same numbers over an EXPLICIT window, plus the tender split. Every
   * real-venue comparison below is built on this one primitive so the KPI
   * band, the hero deltas and the card/cash tile can never disagree. */
  function realWindowStats(from, to) {
    let revenue = 0, count = 0, card = 0, cash = 0;
    realSalesList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.max(0, +e.amount || 0);
      revenue += amt; count++;
      if (String(e.method || 'card') === 'cash') cash += amt; else card += amt;
    });
    return { revenue, count, basket: count ? revenue / count : 0, card, cash };
  }
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
    const [from, to] = rangeBounds(range || effRange());
    return [from, to === Infinity ? Date.now() + 1 : to];
  }
  /* A percentage change needs something to change FROM. A merchant on their
   * first day has no yesterday, and printing « 0 % vs hier » beside their
   * opening sales claims the day was flat when it was in fact their first.
   * null means "no baseline" — every caller hides the comparison rather than
   * inventing one. Without `backDays` the baseline is the window immediately
   * before this one; with it, the SAME slice N days earlier — so at 14h « vs
   * semaine » weighs today-so-far against last week up to 14h, not against a
   * full day it hasn't finished yet. */
  function realDeltaPct(range, pick, backDays) {
    const [from, to] = closedBounds(range);
    const span = Math.max(1, to - from);
    const off = backDays ? backDays * 864e5 : span;
    const base = pick(realWindowStats(from - off, to - off));
    if (!base) return null;
    const cur = pick(realWindowStats(from, to));
    return Math.round(((cur - base) / base) * 1000) / 10;
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
  // Build a REAL revenue-chart series for the active range from KiwiSales — the
  // custom-venue replacement for the zeroed demo clone (which plots a flat line
  // and leaks the demo legend total). Hourly-cumulative on day ranges, daily
  // totals on 7/30-day ranges; axis + legend computed from the real numbers.
  function realRevSeries(range) {
    range = range || effRange();
    const list = realSalesList();
    const hourly = (range === 'aujourdhui' || range === 'hier');
    let rev = [], xLabels = [], visibleXIdx = [], sub = '', rangeBadge = '', total = 0;

    if (hourly) {
      const base = (range === 'hier') ? dayStartMs(Date.now()) - 864e5 : dayStartMs(Date.now());
      const end = base + 864e5;
      const per = new Array(24).fill(0);
      list.forEach(e => { const ts = +e.ts || 0; if (ts >= base && ts < end) per[new Date(ts).getHours()] += Math.max(0, +e.amount || 0); });
      let acc = 0;
      for (let h = 0; h < 24; h++) { acc += per[h]; rev.push(acc); xLabels.push((h < 10 ? '0' : '') + h + 'h'); }
      visibleXIdx = [0, 3, 6, 9, 12, 15, 18, 21];
      total = acc;
      rangeBadge = (range === 'hier') ? 'HIER' : "AUJOURD'HUI";
      sub = (range === 'hier') ? 'Cumul horaire · hier' : 'Cumul horaire · aujourd\'hui';
    } else {
      const days = RANGE_DAYS[range] || 7;
      const start = dayStartMs(Date.now()) - (days - 1) * 864e5;
      const buckets = new Array(days).fill(0);
      list.forEach(e => {
        const ts = +e.ts || 0;
        if (ts >= start) { const idx = Math.floor((dayStartMs(ts) - start) / 864e5); if (idx >= 0 && idx < days) buckets[idx] += Math.max(0, +e.amount || 0); }
      });
      rev = buckets;
      for (let i = 0; i < days; i++) { const d = new Date(start + i * 864e5); xLabels.push(DAY_ABBR[d.getDay()] + ' ' + d.getDate()); }
      const step = Math.max(1, Math.round(days / 6));
      for (let i = 0; i < days; i += step) visibleXIdx.push(i);
      if (visibleXIdx[visibleXIdx.length - 1] !== days - 1) visibleXIdx.push(days - 1);
      total = buckets.reduce((s, x) => s + x, 0);
      rangeBadge = days + ' DERNIERS JOURS';
      sub = 'Total journalier · ' + days + ' derniers jours';
    }

    const top = niceCeil(Math.max(1, ...rev));
    const yTicks = [0, top * 0.25, top * 0.5, top * 0.75, top].map(Math.round);
    const legendPrimary = (hourly ? 'Cumul' : ('Total ' + (RANGE_DAYS[range] || rev.length) + ' jours')) + ' · ' + frInt(total) + ' MAD';
    return { rev, revPrev: rev.map(() => 0), yTicks, xLabels, visibleXIdx, sub, rangeBadge, legendPrimary, legendCompare: '' };
  }

  /* ═══════════════ RENDER: HERO ═══════════════ */

  function renderHero() {
    const lang = getLang();
    const effective = effRange();
    let data = vData(heroDataByVenue, currentRange);
    if (!data) return;

    // Live-demo override on aujourdhui — hero amount + net come from the clock,
    // deltas remain comparative (vs hier / semaine / mois).
    if (isLiveDemo()) {
      const sim = getSim();
      if (sim) {
        data = { ...data, amount: sim.cumRevenue };
      }
    }
    // User-created venue — hero figures come from the merchant's real sales,
    // windowed to the active range so the number tracks the selected period.
    if (ownData()) {
      const t = realSalesTotals();
      /* Les trois comparaisons du hero sortent des ventes réelles. Une période
       * de référence vide renvoie null, et le bloc entier disparaît au lieu
       * d'annoncer « 0 % » : le premier jour d'un commerçant n'a pas de veille,
       * et prétendre le contraire est la seule chose que ce chiffre ne doit
       * jamais faire. Les lignes reviennent d'elles-mêmes dès qu'il y a un
       * historique à comparer. */
      const rev = (s) => s.revenue;
      data = {
        ...data,
        amount: t.revenue,
        deltaHier:    realDeltaPct(effRange(), rev),
        deltaSemaine: realDeltaPct(effRange(), rev, 7),
        deltaMois:    realDeltaPct(effRange(), rev, 28),
      };
    }

    const labelEl = document.querySelector('[data-hero-label]');
    if (labelEl) labelEl.textContent = HERO_LABEL[lang]?.[currentRange] || HERO_LABEL.fr[currentRange];

    // The live-session row ("LIVE · HH:MM · 24 heures · session continue
    // depuis 08h12") is a today-only concept — a ticking LIVE clock over a
    // 7-day or 30-day aggregate is misleading. Show it only on aujourd'hui.
    const greetEl = document.querySelector('.hero-left-today .greet');
    if (greetEl) greetEl.style.display = (effective === 'aujourdhui') ? '' : 'none';

    const amtEl = document.querySelector('[data-hero-amount]');
    if (amtEl) {
      const fromVal = parseAmountFromEl(amtEl);
      // Resize font to fit the wider of from/to so the number never wraps mid-animation.
      fitHeroAmount(amtEl, Math.max(fromVal, data.amount));
      // Live-tick: shorter duration so the count keeps up with the 3s cadence
      const dur = liveTickInProgress ? 600 : 800;
      animateNumber(amtEl, fromVal, data.amount, { duration: dur, format: fmtHeroAmount });
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
      const items = [];
      if (data.deltaHier    != null) items.push({ key: 'hier',    value: data.deltaHier,    label: labels.hier });
      if (data.deltaSemaine != null) items.push({ key: 'semaine', value: data.deltaSemaine, label: labels.semaine });
      if (data.deltaMois    != null) items.push({ key: 'mois',    value: data.deltaMois,    label: labels.mois });

      // "Net après Kiwi" removed by product decision — the dashboard is the
      // merchant's own takings; a "what's left after Kiwi's cut" line is an
      // unwanted reminder of the fee and adds no operational value.
      breakdown.innerHTML = items.map(it => `
        <div class="b" data-hero-delta="${it.key}">
          <div class="l">${it.label}</div>
          <div class="v" data-hero-delta-val></div>
        </div>
      `).join('');

      items.forEach(it => {
        const valEl = breakdown.querySelector(`[data-hero-delta="${it.key}"] [data-hero-delta-val]`);
        if (!valEl) return;
        const from = existing[it.key] ?? 0;
        animateNumber(valEl, from, it.value, {
          duration: 600,
          format: v => `${fmtPct(v)} <span class="d${v < 0 ? ' dn' : ''}">${arrowSvg(v >= 0)}</span>`,
        });
      });
    }
  }

  /* ═══════════════ RENDER: HERO AI PANEL (per venue) ═══════════════ */

  function renderHeroAi() {
    /* Ask-bar placeholder follows the trade — a gym owner asks about their
     * salle, not their restaurant. Defaults mirror i18n.js so switching back
     * to a demo venue restores the stock copy without waiting for setLang. */
    const input = document.querySelector('[data-hai-input]');
    if (input) {
      const trade = window.KiwiVenue?.getVocab?.('askPlaceholder');
      const lang = getLang();
      input.placeholder = trade
        || (lang === 'en' ? 'Ask a question about your restaurant...'
          : lang === 'ar' ? 'اطرح سؤالاً حول مطعمك...'
          : 'Posez votre question sur votre restaurant...');
    }
    /* The three starter questions are hard-coded in dashboard.html for a
     * restaurant — a clothing shop was being invited to ask "Quel plat retirer
     * de ma carte ?". Swap them for the trade's own when the venue has one; a
     * demo venue keeps the captured originals so i18n still owns them. */
    const chipEls = document.querySelectorAll('.hai-chips .hai-chip');
    if (chipEls.length) {
      const chipTexts = window.KiwiVenue?.getVocab?.('aiChips');
      chipEls.forEach((btn, i) => {
        // Stash the captured original (and its i18n key) once, so switching back
        // to a demo venue restores the stock question instead of stranding the
        // trade copy. i18n owns the chip again the moment the key is back.
        if (btn.dataset.haiOrig == null) {
          btn.dataset.haiOrig = btn.textContent.trim();
          btn.dataset.haiKey = btn.getAttribute('data-i18n') || '';
        }
        const trade = Array.isArray(chipTexts) ? chipTexts[i] : null;
        if (trade) {
          btn.textContent = trade;
          btn.removeAttribute('data-i18n');   // sinon un changement de langue restaure la question restaurant
        } else {
          btn.textContent = btn.dataset.haiOrig;
          if (btn.dataset.haiKey) btn.setAttribute('data-i18n', btn.dataset.haiKey);
        }
      });
    }

    const rec = window.KiwiVenue?.getHeroAiRec?.();
    const titleEl = document.querySelector('.hai-rec-title');
    const obsEl   = document.querySelector('.hai-rec-obs');
    const actEl   = document.querySelector('.hai-rec-act');
    const eyebrow = document.querySelector('.hai-eyebrow');
    /* `return` on a null rec used to leave whatever was in the markup sitting
     * there — which was a finished, hand-written recommendation. Getting no
     * answer has to look like no answer, not like the last one. */
    if (!rec) {
      const empty = { fr: 'Pas encore assez de ventes pour une recommandation.', en: 'Not enough sales yet for a recommendation.', ar: 'لا توجد مبيعات كافية بعد لتقديم توصية.' };
      if (titleEl) titleEl.textContent = '';
      if (obsEl)   obsEl.textContent = empty[getLang()] || empty.fr;
      if (actEl)   actEl.textContent = '';
      if (eyebrow) eyebrow.textContent = 'KIWI INSIGHTS';
      return;
    }
    if (titleEl) titleEl.textContent = rec.title;
    if (obsEl)   obsEl.textContent = rec.obs;
    if (actEl)   actEl.textContent = rec.act;
    /* Measured or estimated, said out loud on the card. A counted best-seller
     * and a constant-volume price projection are not the same kind of claim,
     * and the merchant is the one carrying the risk of the difference. */
    if (eyebrow) {
      eyebrow.textContent = rec.basisLabel ? `KIWI INSIGHTS · ${rec.basisLabel}` : 'KIWI INSIGHTS';
      eyebrow.removeAttribute('data-i18n');
    }
  }

  /* ═══════════════ RENDER: HEATMAP AI HINT (per venue) ═══════════════ */

  function renderHeatmapAi() {
    const rec = window.KiwiVenue?.getHeatmapAiRec?.();
    const titleEl = document.querySelector('.hh-ai-title');
    const obsEl   = document.querySelector('.hh-ai-obs');
    const ctaEl   = document.querySelector('.hh-ai-cta');
    /* Same rule as renderHeroAi: no hint has to LOOK like no hint. Returning
     * early left the markup's own copy standing, and that copy used to be a
     * finished recommendation quoting a peer benchmark Kiwi cannot measure. */
    if (!rec) {
      const empty = { fr: 'Vos heures creuses apparaîtront ici dès vos premières ventes.', en: 'Your quiet hours will appear here once you record sales.', ar: 'ستظهر ساعاتك الهادئة هنا بمجرد تسجيل مبيعاتك.' };
      if (titleEl) titleEl.textContent = '';
      if (obsEl)   obsEl.textContent = empty[getLang()] || empty.fr;
      if (ctaEl)   ctaEl.textContent = '';
      return;
    }
    if (titleEl) titleEl.textContent = rec.title;
    if (obsEl)   obsEl.textContent = rec.obs;
    if (ctaEl)   ctaEl.textContent = rec.cta;
  }

  /* ═══════════════ RENDER: HERO GOAL BAR ═══════════════ */

  function renderGoal() {
    const lang = getLang();
    const effective = effRange();
    let data = vData(goalByVenue, currentRange);
    if (!data) return;

    // Live-demo override: goal stays at venue's daily target (matches the
    // demo target), `current` ticks up from 0 → daily total each real hour.
    if (isLiveDemo()) {
      const sim = getSim();
      if (sim) data = { ...data, goal: sim.target.revenue, current: sim.cumRevenue };
    }
    // User-created venue — goal comes from the merchant's setting, progress
    // from their recorded sales.
    if (ownData()) {
      const vd = window.KiwiVenue.getCurrentVenueData?.() || {};
      const ownVenue = customVenue();
      data = { ...data, goal: ownVenue ? (+vd.goal || 0) : 0, current: realSalesTotals().revenue };
    }

    // Settings → "Objectif journalier" override for the default demo venue: the
    // merchant's daily target wins on the day ranges (week/month keep theirs).
    if (!ownData()) {
      try {
        const ov = localStorage.getItem('kiwiSet:goal');
        if (ov && (currentRange === 'aujourdhui' || currentRange === 'hier')) {
          const n = +String(ov).replace(/[^\d]/g, '');
          if (n > 0) data = { ...data, goal: n };
        }
      } catch (_) {}
    }

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
    // The hourly heatmap only carries the 4 base ranges; map the rest onto
    // the closest one so it never crashes on moisDernier/trimestre/annee.
    rng = ({ personnalise: 'aujourdhui', moisDernier: 'trenteJours', trimestre: 'trenteJours', annee: 'trenteJours' })[rng] || rng;
    const v = getCurrentVenue();
    /* A real merchant's peak hours come from their OWN tickets: every sale
     * carries a `ts`, so bucket the active window by hour of day. Before the
     * first sale this still draws flat — the honest answer — but it no longer
     * STAYS flat once the till has rung, which is the one thing a merchant
     * opens this card to find out. Never borrows Café Atlas's shape. */
    if (ownData(v)) {
      const [from, to] = closedBounds(rng);
      const span = HH_HOURS.length;                          // 16 créneaux, la largeur de la carte
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
      realSalesList().forEach((e) => {
        const ts = +e.ts || 0;
        if (ts < from || ts >= to) return;
        const h = new Date(ts).getHours();
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
        hour: h, revenue: rev[i], covers: cov[i], intensity: max ? rev[i] / max : 0,
      }));
    }
    const rev = vData(HH_RAW_BY_VENUE, rng) || [];
    const cov = vData(HH_COVERS_BY_VENUE, rng) || [];
    const max = Math.max(...rev);
    return HH_HOURS.map((h, i) => ({
      hour: h, revenue: rev[i], covers: cov[i],
      intensity: max ? rev[i] / max : 0,
    }));
  }
  function renderHeatmap() {
    const lang = getLang();
    const data = buildHeatmap(effRange());
    // Determine sim cursor for past/current/future state on aujourdhui
    let simIdx = -1;
    if (isLiveDemo()) {
      const sim = getSim();
      if (sim) simIdx = sim.simIdx;
    }
    const row = document.querySelector('[data-hh-row]');
    if (row) {
      /* Bars rise into place on real data changes; a 3s live tick rebuilds
       * silently (no replay while the demo clock runs). */
      row.classList.toggle('hh-anim', !liveTickInProgress);
      row.innerHTML = data.map((d, i) => {
        let stateCls = '';
        if (simIdx >= 0) {
          if (i < simIdx) stateCls = 'past';
          else if (i === simIdx) stateCls = 'now';
          else stateCls = 'future';
        }
        return `
        <div class="hh-col" style="--i:${i};">
          <div class="hh-cell ${intensityClass(d.intensity)}${stateCls ? ' ' + stateCls : ''}">
            <div class="hh-tooltip">
              <div class="hour">${d.hour}</div>
              <div class="met"><b>${frInt(d.revenue)} MAD</b></div>
              <div class="met">${d.covers} ${COVERS_LABEL[lang] || COVERS_LABEL.fr}</div>
            </div>
          </div>
          <div class="hh-h">${d.hour}</div>
        </div>
      `;
      }).join('');
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
    if (spec.fmt === 'pct1') return v.toFixed(1).replace('.', ',') + unit;
    return frInt(v) + unit;
  }

  // Per-key icon glyphs (single SVG path per key, restyled per render).
  const KPI_ICONS = {
    tx:           '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    panier:       '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V5a4 4 0 018 0v3"/>',
    tips:         '<path d="M12 2v20M15 5H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H8"/>',
    marge:        '<path d="M19 5L5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    success:      '<path d="M5 12l5 5L20 7"/>',
    ratio:        '<circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>',
    regulars:     '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/>',
    tauxRetour:   '<path d="M3 12a9 9 0 119 9 9 9 0 01-6.36-2.64L3 21l.36-2.64"/><path d="M3 12h6M3 21v-6"/>',
    revenue:      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    profit:       '<path d="M3 17l6-6 4 4 7-7"/><path d="M17 7h4v4"/>',
    cogs:         '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8"/>',
    retention:    '<path d="M12 21s-7-4.5-9.5-9A5 5 0 0112 5a5 5 0 019.5 7c-2.5 4.5-9.5 9-9.5 9z"/>',
    newClients:   '<circle cx="9" cy="8" r="4"/><path d="M3 21v-2a4 4 0 014-4h4M18 9v6M15 12h6"/>',
    revPerDay:    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    txPerDay:     '<path d="M4 6h16M4 12h16M4 18h10"/>',
    tempsTable:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    // hotel (custom 0000 venues — see assets/hotel.js)
    occupation:   '<path d="M3 18v-7"/><path d="M3 16h18v-3a2 2 0 00-2-2h-9v5"/><circle cx="6.5" cy="11.5" r="1.5"/><path d="M21 18v-2"/>',
    adr:          '<path d="M20.6 13.4L11 3.8A2 2 0 009.6 3H5a2 2 0 00-2 2v4.6c0 .5.2 1 .6 1.4l9.6 9.6a2 2 0 002.8 0l4.6-4.6a2 2 0 000-2.6z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    revpar:       '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    arrdep:       '<path d="M7 4v12"/><path d="M3 12l4 4 4-4"/><path d="M17 20V8"/><path d="M13 12l4-4 4 4"/>',
    menage:       '<path d="M11 4l1.2 3.4 3.4 1.2-3.4 1.2L11 13.2 9.8 9.8 6.4 8.6l3.4-1.2z"/><path d="M18 13l.8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8z"/>',
    mixRev:       '<path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>',
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
    revenue:    { labels: { default: 'Chiffre d’affaires' }, i18n: 'dash.kpi.revenue',
                  desc: 'Total encaissé sur la période', derive: (d) => { const r = revOf(d); return r == null ? null : { value: r, unit: 'MAD', fmt: 'int', delta: revDelta(d) }; } },
    revPerDay:  { labels: { default: 'CA par jour' }, i18n: 'dash.kpi.revPerDay',
                  desc: 'Chiffre d’affaires moyen par jour', derive: (d, ctx) => { const r = revOf(d); return r == null ? null : { value: r / ctx.nbDays, unit: 'MAD', fmt: 'int', delta: revDelta(d) }; } },
    marge:      { labels: { default: 'Marge brute' }, i18n: 'dash.kpi.margin',
                  desc: 'Part du CA conservée après coût matière', derive: (d) => d.marge || null },
    profit:     { labels: { default: 'Bénéfice brut' }, i18n: 'dash.kpi.grossProfit',
                  desc: 'Chiffre d’affaires moins le coût matière', derive: (d, ctx) => { const r = revOf(d), m = margeOf(d, ctx); return (r == null || m == null) ? null : { value: r * m / 100, unit: 'MAD', fmt: 'int', delta: withDelta([revDelta(d), d.marge ? d.marge.delta : 0], (a, b) => a + b) }; } },
    cogs:       { labels: { default: 'Coût matière' }, i18n: 'dash.kpi.cogs',
                  desc: 'Dépense en matières premières', derive: (d, ctx) => { const r = revOf(d), m = margeOf(d, ctx); return (r == null || m == null) ? null : { value: r * (1 - m / 100), unit: 'MAD', fmt: 'int', delta: withDelta([revDelta(d), d.marge ? d.marge.delta : 0], (a, b) => a - b) }; } },
    tips:       { labels: { default: 'Pourboires' }, i18n: 'dash.kpi.tips',
                  desc: 'Pourboires estimés encaissés', derive: (d, ctx) => { const r = revOf(d), rate = TIP_RATE[ctx.venueType] || 0; return (r == null || !rate) ? null : { value: r * rate, unit: 'MAD', fmt: 'int', delta: revDelta(d) }; } },
    success:    { labels: { default: 'Taux succès', spa: 'Taux remplissage' }, i18n: 'dash.kpi.success',
                  desc: 'Paiements aboutis · créneaux remplis', derive: (d) => d.success || null },
    ratio:      { labels: { default: 'Ratio card / cash' }, i18n: 'dash.kpi.ratio',
                  desc: 'Répartition carte vs espèces', derive: (d) => d.ratio || null },
    regulars:   { labels: { default: 'Clients réguliers', boutique: 'Clients fidèles', spa: 'Clients fidèles' }, i18n: 'dash.kpi.regular',
                  desc: 'Clients déjà venus sur la période', derive: (d) => d.regulars || null },
    retention:  { labels: { default: 'Taux de fidélité' }, i18n: 'dash.kpi.retention',
                  desc: 'Part de clients réguliers parmi les ventes', derive: (d) => { if (!d.tx || !d.regulars) return null; const pct = d.tx.value ? d.regulars.value / d.tx.value * 100 : 0; return { value: pct, unit: '%', fmt: 'pct1', delta: withDelta([d.regulars.delta, d.tx.delta], (a, b) => a - b) }; } },
    newClients: { labels: { default: 'Nouveaux clients' }, i18n: 'dash.kpi.newClients',
                  desc: 'Premières visites estimées', derive: (d) => { if (!d.tx || !d.regulars) return null; return { value: Math.max(0, d.tx.value - d.regulars.value), unit: '', fmt: 'int', delta: withDelta([d.tx.delta, d.regulars.delta], (a, b) => a - b * 0.3) }; } },
    txPerDay:   { labels: { default: 'Ventes par jour', spa: 'RDV par jour' }, i18n: 'dash.kpi.txPerDay',
                  desc: 'Nombre de ventes moyen par jour', derive: (d, ctx) => d.tx ? { value: d.tx.value / ctx.nbDays, unit: '', fmt: 'int', delta: d.tx.delta } : null },
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
                  desc: 'Part des articles retournés', derive: (d) => d.tauxRetour || null },
    tempsTable: { labels: { default: 'Temps moyen à table', spa: 'Temps moyen en cabine' }, i18n: 'dash.kpi.tableTime',
                  desc: 'Durée moyenne d\'occupation d\'une table par couvert', derive: (d) => d.tempsTable || null },
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
    return T[c.i18n] || c.labels[venueType] || c.labels.default;
  }

  function renderKpiBand() {
    const lang = getLang();
    let data = vData(kpiByVenue, currentRange);
    if (!data) return;
    const suffix = KPI_DELTA_SUFFIX[lang]?.[currentRange] || KPI_DELTA_SUFFIX.fr[currentRange];

    const wrap = document.querySelector('[data-kpi-band]');
    if (!wrap) return;

    // Live-demo override: tx/panier/regulars all scale with sim time.
    // success and ratio stay near their static values (don't ramp from 0%).
    if (isLiveDemo()) {
      const sim = getSim();
      if (sim) {
        data = {
          ...data,
          tx:         data.tx       ? { ...data.tx,       value: sim.cumTx } : data.tx,
          panier:     data.panier   ? { ...data.panier,   value: sim.panierMoyen || data.panier.value } : data.panier,
          regulars:   data.regulars ? { ...data.regulars, value: sim.cumRegulars, unit: `/ ${Math.max(1, sim.cumTx)}` } : data.regulars,
          // success / ratio / tauxRetour stay at their static daily values
        };
      }
    }
    // User-created venue — tx / panier (and the revenue derived from them)
    // come from the merchant's recorded sales.
    if (ownData()) {
      const t = realSalesTotals();
      const rng = effRange();
      const [wFrom, wTo] = closedBounds(rng);
      const w = realWindowStats(wFrom, wTo);
      /* Le ratio se lit « card / cash ». Les deux parts sortent des ventes
       * encaissées — la même source que l'anneau Mix de paiement juste à côté,
       * pour que deux cartes affichant la même donnée ne puissent plus se
       * contredire. La part espèces est le complément à 100, donc l'addition
       * tombe toujours juste. Sans encaissement : le tiret, il n'y a rien à
       * répartir. */
      const tender = w.card + w.cash;
      const cardPct = tender ? Math.round((w.card / tender) * 100) : 0;
      data = {
        ...data,
        tx:     { ...(data.tx || {}),     value: t.count,              delta: realDeltaPct(rng, (s) => s.count) },
        panier: { ...(data.panier || {}), value: Math.round(t.basket), delta: realDeltaPct(rng, (s) => s.basket) },
        /* Le CA EXACT, additionné vente par vente. Il n'était pas transmis, si
         * bien que revOf() le reconstituait à partir du panier arrondi
         * ci-dessus et que le tableau de bord ne tombait jamais juste face au
         * rouleau de caisse (voir revOf). */
        revenue: { value: t.revenue, unit: 'MAD', fmt: 'int', delta: realDeltaPct(rng, (s) => s.revenue) },
        ratio:    data.ratio    ? { ...data.ratio,    text: tender ? `${cardPct} / ${100 - cardPct}` : '—', unit: tender ? '%' : '', delta: realDeltaPct(rng, (s) => (s.card + s.cash ? (s.card / (s.card + s.cash)) * 100 : 0)) } : data.ratio,
        regulars: data.regulars ? { ...data.regulars, value: 0, unit: '', delta: null } : data.regulars,
        /* ── Un tiret, pas un zéro ──────────────────────────────────────────
         * Ces deux taux n'ont encore aucune source chez un vrai commerçant :
         * Kiwi ne compte ni les paiements refusés ni les retours. Le clone de
         * démonstration remis à zéro les affichait donc « Taux succès 0,00 % »
         * — et un taux de succès à zéro ne se lit pas « on ne sait pas », il se
         * lit « AUCUN paiement n'aboutit ». C'est l'alarme la plus grave que
         * puisse afficher une caisse, sur une tuile qui ne mesure rien. Un
         * commerçant qui la croit appelle le support un jour d'ouverture ; un
         * commerçant qui finit par comprendre qu'elle ment cesse de croire les
         * cinq tuiles d'à côté, qui, elles, sont justes.
         *
         * Le tiret est déjà le vocabulaire de la maison pour « rien à
         * montrer » — c'est ce qu'affiche le ratio carte/espèces sans
         * encaissement, deux lignes plus haut. */
        success:    data.success    ? { ...data.success,    text: '—', unit: '', delta: null } : data.success,
        tauxRetour: data.tauxRetour ? { ...data.tauxRetour, text: '—', unit: '', delta: null } : data.tauxRetour,
      };

      /* Bénéfice brut, Coût matière et Marge brute dérivent TOUS de `marge` via
       * margeOf(). En injectant ici la marge réellement constatée, les trois
       * tuiles sortent d'une seule source et ne peuvent plus se contredire —
       * au lieu des 54 % forfaitaires qui ignoraient le coût que le commerçant
       * avait pris la peine de saisir.
       *
       * `marge: null` est un RÉSULTAT, pas une absence de calcul : il dit « ce
       * commerçant n'a chiffré aucun des produits qu'il a vendus sur cette
       * période ». Les trois tuiles affichent alors un tiret. C'est le même
       * vocabulaire que « Taux succès » deux lignes plus haut, et c'est la
       * seule réponse honnête tant que la carte n'est pas chiffrée : un
       * pourcentage inventé ici est celui sur lequel le patron changerait ses
       * prix. `costedPct` accompagne la valeur pour que l'écran puisse dire sur
       * quelle part des ventes elle porte. */
      const gp = w.revenue > 0 ? realGrossProfit(wFrom, wTo) : null;
      if (gp && gp.marginPct != null && gp.revenueCosted > 0) {
        data.marge = { value: gp.marginPct, unit: '%', fmt: 'pct1', delta: null, costedPct: gp.pctCosted };
      } else {
        /* Rien de chiffré ⇒ le tiret, sur les TROIS tuiles. Un zéro se lirait
         * « vous ne gagnez rien », ce qui est une affirmation, et fausse. Le
         * tiret est déjà le mot de la maison pour « rien à montrer » — c'est ce
         * qu'affichent « Taux succès » et le ratio carte/espèces plus haut. */
        const dash = { text: '—', unit: '', delta: null };
        data.marge = { ...dash };
        data.profit = { ...dash };
        data.cogs = { ...dash };
      }
      // A custom HOTEL's band needs the hotel tiles — there is no hotel demo
      // sibling on this dashboard to zero-clone, so build them blank here.
      // The ménage denominator follows the step-2 « Nombre de chambres ».
      if (window.KiwiVenue?.getVenueType?.() === 'hotel') {
        const rooms = +((window.KiwiVenue?.getCurrentVenueData?.() || {}).profileInfo?.rooms) || 0;
        data = {
          ...data,
          occupation: { value: 0, unit: '%',   fmt: 'pct1', delta: null },
          adr:        { value: 0, unit: 'MAD', fmt: 'int',  delta: null },
          revpar:     { value: 0, unit: 'MAD', fmt: 'int',  delta: null },
          arrdep:     { text: '0 / 0', unit: '', delta: null },
          menage:     { value: 0, unit: rooms ? `/ ${rooms}` : '', fmt: 'int', delta: null },
          mixRev:     { text: '—', unit: '', delta: null },
        };
      }

      /* Tout le reste de la bande vient du clone démo remis à zéro : la valeur
       * affichée est bien neutre, mais son delta, lui, est resté le chiffre de
       * Café Atlas. « Taux retour 0,0 % · 0 % vs hier » se lisait donc comme un
       * taux stable alors qu'il n'y a jamais eu de retour à comparer. On coupe
       * la comparaison partout où elle n'a PAS été recalculée depuis les ventes
       * réelles, plutôt que d'énumérer les tuiles une à une — une tuile ajoutée
       * demain est couverte sans y penser. */
      const REAL_DELTAS = new Set(['tx', 'panier', 'ratio', 'revenue']);
      Object.keys(data).forEach((k) => {
        const tile = data[k];
        if (tile && typeof tile === 'object' && 'delta' in tile && !REAL_DELTAS.has(k)) {
          data[k] = { ...tile, delta: null };
        }
      });
    }

    // Resolve which 6 KPI keys to render — owner's saved layout, or the
    // vertical default. Derived KPIs are merged into `data` so the tile
    // builder and value loop below keep working unchanged.
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const layout = getKpiLayout(venueType) || defaultKpiKeys(venueType);
    const ctx = { venueType, range: effRange(), nbDays: RANGE_DAYS[effRange()] || 1 };
    const derived = {};
    layout.forEach((k) => {
      const c = KPI_CATALOG[k];
      const t = c ? c.derive(data, ctx) : (data[k] || null);
      if (t) derived[k] = t;
    });
    data = { ...data, ...derived };
    // A custom venue with a subtype profile speaks its trade's vocabulary:
    // getKpiSpec returns {key,label} pairs (no i18n field) already resolved
    // for the current language. Those labels win over the generic catalog,
    // and the tile skips data-i18n so i18n.js doesn't overwrite them — the
    // langchange refire re-renders the band with freshly-picked labels.
    const profLabels = {};
    (window.KiwiVenue?.getKpiSpec?.(venueType) || []).forEach((s) => {
      if (s.label && !s.i18n) profLabels[s.key] = s.label;
    });
    const spec = layout.map((k) => ({
      key: k,
      i18n: profLabels[k] ? '' : (KPI_CATALOG[k] || {}).i18n,
      label: profLabels[k] || kpiLabel(k, venueType, lang),
    }));

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
      // A user-created venue has no trend history yet — show a flat baseline
      // instead of a borrowed demo sparkline.
      const sparkPath = ownData()
        ? 'M0 18 L120 18'
        : (KPI_SPARKS[s.key] || KPI_SPARKS.tx);
      const iconPath = KPI_ICONS[s.key] || KPI_ICONS.tx;
      const i18nAttr = s.i18n ? ` data-i18n="${s.i18n}"` : '';
      // If a translation exists in T, use it as initial label; otherwise the FR label.
      const T = window.KiwiI18n?.T?.[lang] || {};
      const label = T[s.i18n] || s.label;
      return `
        <div class="kpi-m" data-kpi="${s.key}" tabindex="0" role="button">
          <div class="l"><span${i18nAttr}>${label}</span><div class="ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconPath}</svg></div></div>
          <div class="v" data-kpi-val></div>
          <div class="d" data-kpi-delta></div>
          <svg class="sp" viewBox="0 0 120 22" preserveAspectRatio="none">
            <path d="${sparkPath}" style="stroke: var(--atlas)" stroke-width="4" stroke-opacity="0.16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${sparkPath}" style="stroke: var(--atlas)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
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
        /* Pas de période précédente = pas de comparaison. On écrit le tiret
         * plutôt qu'un « 0 % » qui affirmerait que rien n'a bougé, alors que
         * c'est le premier jour du commerçant. Pas de flèche non plus : elle
         * pointerait dans une direction inventée. */
        if (d == null) {
          deltaEl.className = 'd neutral';
          deltaEl.innerHTML = `— ${suffix}`;
        } else {
          deltaEl.className = `d${d < 0 ? ' dn' : d === 0 ? ' neutral' : ''}`;
          deltaEl.innerHTML = `${arrowSvg(d >= 0)}${fmtPct(d)} ${suffix}`;
        }
      }
    });
  }

  /* ═══════════════ KPI BAND · personnalisation drawer ═══════════════ */
  function openKpiCustomizer() {
    const Kiwi = window.Kiwi;
    if (!Kiwi || !Kiwi.drawer) return;
    const lang = getLang();
    const kc = KC_STR[lang] || KC_STR.fr;
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const data = vData(kpiByVenue, currentRange) || {};
    const ctx = { venueType, range: effRange(), nbDays: RANGE_DAYS[effRange()] || 1 };

    // Only offer KPIs that actually resolve for this venue + range.
    const available = Object.keys(KPI_CATALOG).filter((k) => {
      try { return !!KPI_CATALOG[k].derive(data, ctx); } catch (_) { return false; }
    });
    const maxKpis = KPI_MAX;
    let selected = (getKpiLayout(venueType) || defaultKpiKeys(venueType))
      .filter((k) => available.includes(k)).slice(0, maxKpis);

    const deltaSuffix = KPI_DELTA_SUFFIX[lang]?.[currentRange] || KPI_DELTA_SUFFIX.fr[currentRange];
    // Each picker tile is a faithful preview of the dashboard KPI card —
    // label + icon, the period value, its delta and a sparkline.
    const cardHtml = (k) => {
      const c = KPI_CATALOG[k];
      const icon = KPI_ICONS[k] || KPI_ICONS.tx;
      const sparkPath = KPI_SPARKS[k] || KPI_SPARKS.tx;
      let tile = null;
      try { tile = c.derive(data, ctx); } catch (_) { tile = null; }
      tile = tile || { value: 0, delta: 0 };
      const valHtml = tile.text != null ? fmtKpiVal(tile, 0) : fmtKpiVal(tile, tile.value || 0);
      const dv = tile.delta || 0;
      const dCls = dv < 0 ? ' dn' : dv === 0 ? ' neutral' : '';
      return `
        <button class="kpi-pick" data-kc="${k}" type="button" aria-pressed="false">
          <span class="kc-badge"></span>
          <span class="l"><span>${kpiLabel(k, venueType, lang)}</span><span class="ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg></span></span>
          <span class="v">${valHtml}</span>
          <span class="d${dCls}">${arrowSvg(dv >= 0)}${fmtPct(dv)} ${deltaSuffix}</span>
          <svg class="sp" viewBox="0 0 120 22" preserveAspectRatio="none"><path d="${sparkPath}" stroke="#0B6E4F" stroke-width="4" stroke-opacity="0.16" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${sparkPath}" stroke="#0B6E4F" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>`;
    };

    const body = `
      <div class="kc">
        <p class="kc-intro">${kc.intro}</p>
        <div class="kc-counter"><b data-kc-count>0 / ${maxKpis}</b> ${kc.counter}</div>
        <div class="kc-grid">${available.map(cardHtml).join('')}</div>
      </div>`;

    const res = Kiwi.drawer({
      title: kc.title,
      subtitle: kc.subtitle,
      width: 520,
      body,
      foot: `<button class="kb ghost" data-kc-reset type="button">${kc.reset}</button>
             <button class="kb atlas" data-kc-save type="button" style="flex:1; justify-content:center;">${kc.save}</button>`,
    });
    const root = res.el;

    function refresh() {
      root.querySelectorAll('.kpi-pick').forEach((card) => {
        const idx = selected.indexOf(card.getAttribute('data-kc'));
        const badge = card.querySelector('.kc-badge');
        card.setAttribute('aria-pressed', idx >= 0 ? 'true' : 'false');
        if (idx >= 0) { card.classList.add('sel'); badge.textContent = String(idx + 1); }
        else { card.classList.remove('sel'); badge.textContent = ''; }
      });
      const count = root.querySelector('[data-kc-count]');
      if (count) count.textContent = `${selected.length} / ${maxKpis}`;
      const cwrap = root.querySelector('.kc-counter');
      if (cwrap) cwrap.classList.toggle('full', selected.length === maxKpis);
      const save = root.querySelector('[data-kc-save]');
      if (save) save.toggleAttribute('disabled', selected.length !== maxKpis);
    }

    root.addEventListener('click', (e) => {
      const card = e.target.closest('.kpi-pick');
      if (card) {
        const k = card.getAttribute('data-kc');
        const idx = selected.indexOf(k);
        if (idx >= 0) selected.splice(idx, 1);
        else if (selected.length < maxKpis) selected.push(k);
        else { Kiwi.toast?.(kc.maxT, { type: 'info', desc: kc.maxD }); return; }
        refresh();
        return;
      }
      if (e.target.closest('[data-kc-save]')) {
        if (selected.length !== maxKpis) return;
        saveKpiLayout(venueType, selected);
        res.close();
        renderKpiBand();
        Kiwi.toast?.(kc.savedT, { type: 'success', desc: kc.savedD });
        return;
      }
      if (e.target.closest('[data-kc-reset]')) {
        resetKpiLayout(venueType);
        res.close();
        renderKpiBand();
        Kiwi.toast?.(kc.resetT, { type: 'info', desc: kc.resetD });
        return;
      }
    });
    refresh();
  }

  /* ═══════════════ RENDER: REVENUE LINE CHART ═══════════════ */

  function fmtYTick(v) {
    if (v === 0) return '0';
    if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1).replace('.', ',') + 'M';
    if (v >= 1000) return Math.round(v / 1000) + 'k';
    return String(v);
  }

  // Guards the post-layout re-fit scheduled at the end of every chart render.
  let revFitTimer = null;

  function renderRevChart() {
    const lang = getLang();
    const effective = effRange();
    let data = vData(revChartByVenue, currentRange);
    if (!data) return;
    const svg = document.querySelector('[data-rev-svg]');
    if (!svg) return;

    // User-created venue — plot the merchant's REAL sales for the active range
    // (bucketed from KiwiSales), replacing the zeroed demo clone that draws a
    // flat line AND leaks the demo legend total. Matches the hero / KPI window.
    if (ownData()) {
      data = { ...data, ...realRevSeries(effRange()) };
    }

    // ─── Live-demo override on aujourdhui ────────────────────────────────
    // Build a "today so far" curve from the demo clock. Line truncates to
    // the current sim position; pulse + tooltip anchor at that live point.
    let liveSimIdx = -1;     // -1 = no live cursor
    let liveSimWithin = 0;   // 0..1 within liveSimIdx hour
    if (isLiveDemo()) {
      const sim = getSim();
      if (sim) {
        liveSimIdx = sim.simIdx;
        liveSimWithin = sim.simWithin;
        // Y-axis is anchored to the daily target so the chart shape doesn't
        // jump as cumulative grows. yTicks span 0..target with 5 stops.
        const target = sim.target.revenue;
        const yMax = Math.ceil(target / 4000) * 4000 + 4000; // round up + headroom
        const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map(v => Math.round(v));

        // Build cumulative point at each hour boundary 0..15, scaled to target.
        // Then truncate to the live cursor position with an interpolated final point.
        const w = sim.weights.rev;
        const fullCum = [];
        let acc = 0;
        for (let i = 0; i < 16; i++) {
          acc += w[i] * target;
          fullCum.push(acc);
        }
        // Truncate: keep [0..simIdx] then interpolate within simIdx
        const partial = [];
        partial.push(0);                              // start at 0 at hour 11
        for (let i = 0; i <= liveSimIdx; i++) {
          if (i < liveSimIdx) {
            partial.push(fullCum[i]);
          } else {
            // Interpolated last point at sim position
            const prev = i === 0 ? 0 : fullCum[i - 1];
            partial.push(prev + (fullCum[i] - prev) * liveSimWithin);
          }
        }
        // Pad with nulls to keep array length 16 so x-axis labels stay positioned.
        // Clip first: late in the service (sim hour ≥ 15) partial can exceed 16,
        // and a negative Array length throws — which killed the whole render
        // chain (incl. setLang subscribers) for any night-time viewer.
        const clipped = partial.slice(0, 16);
        const padded = clipped.concat(new Array(16 - clipped.length).fill(null));

        data = {
          ...data,
          rev: padded,
          yTicks,
          // Update the legend to reflect the live cumulative
          legendPrimary: `Cumul aujourd'hui · ${frInt(sim.cumRevenue)} MAD`,
          // Live cursor markers — used by smoothPath, live-pulse, area path,
          // and hover-clamp logic so the live tip lands at the EXACT sim x
          // (not at the next hour boundary).
          _simIdx: liveSimIdx,
          _simWithin: liveSimWithin,
        };
      }
    }

    // Measure actual rendered width + height so 1 viewBox unit = 1 pixel.
    // Height is flex-driven (the chart fills its column) — measure it live.
    //
    // The 620/150 numbers are a HIDDEN-LAYER guard, not a minimum size:
    // .hero-left-chart is one of two stacked layers and measures 0 while the
    // "today" view is in front. Applying them via Math.max() to a real
    // measurement is what silently magnified the whole chart — a 620×174
    // viewBox stretched into a 738×245 box scales every stroke, glyph and
    // tooltip by 1.19 and letterboxes 19px of dead space above and below the
    // curve. Fall back only when the element genuinely has no box.
    // Measure the SVG's OWN box only. The old parent-clientWidth fallback fires
    // exactly when the layer is hidden — and a hidden layer's parent reports a
    // collapsed width (202px was observed), which is worse than a sane default.
    // When the box is unmeasurable, render at the default and let the
    // ResizeObserver re-render the moment the layer gains a real box.
    const measuredW = Math.round(svg.clientWidth || 0);
    const measuredH = Math.round(svg.clientHeight || 0);
    const W = measuredW > 80 ? measuredW : 820;
    const H = measuredH > 80 ? measuredH : 240;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Self-heal. The painted box can change AFTER this render returns — the
    // vexel layout adapter re-grids the card, a webfont swaps, the sidebar
    // collapses. A ResizeObserver alone loses that race (it reports the
    // pre-adapter box and then coalesces), which is how the chart shipped with
    // a 574-unit coordinate space inside a 738px box. Re-render once the layout
    // settles if the two have drifted. Converges: after the corrective pass the
    // viewBox matches the box, so the condition is false and it stops.
    clearTimeout(revFitTimer);
    revFitTimer = setTimeout(() => {
      const fitW = Math.round(svg.clientWidth);
      const fitH = Math.round(svg.clientHeight);
      if (fitW > 80 && fitH > 80 && (Math.abs(fitW - W) > 2 || Math.abs(fitH - H) > 2)) renderRevChart();
    }, 140);

    // Detect why we're re-rendering: full (range change) vs resize vs compare-toggle vs live-tick.
    const lastW = parseInt(svg.dataset.lastW || '0', 10);
    const lastRange = svg.dataset.lastRange || '';
    const lastShowCmp = svg.dataset.lastShowCmp === '1';
    const showCmpFlag = !!showComparison;
    const sameRange = lastRange === effective;
    const sameW = lastW > 0 && Math.abs(W - lastW) <= 2;
    const isResizeOnly = sameRange && lastW > 0 && Math.abs(W - lastW) > 2;
    const isCmpToggle  = sameRange && sameW && (lastShowCmp !== showCmpFlag);
    // On live ticks the line GROWS — no draw-in animation, no halo replay.
    const suppressAnim = isResizeOnly || (sameRange && liveTickInProgress);
    svg.dataset.lastW = String(W);
    svg.dataset.lastRange = effective;
    svg.dataset.lastShowCmp = showCmpFlag ? '1' : '0';
    svg.classList.toggle('no-anim', suppressAnim);
    svg.classList.toggle('cmp-toggle', isCmpToggle);

    const PAD = { left: 20, right: 26, top: 26, bottom: 40 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const N = data.rev.length;
    const xAt = i => PAD.left + (N <= 1 ? innerW / 2 : (i * innerW) / (N - 1));
    const xs = data.rev.map((_, i) => xAt(i));

    const yTicks = data.yTicks;
    const yMin = Math.min(...yTicks);
    // Guard the all-zero case (empty user-created venue) — yMax===yMin would
    // make yScale divide by zero.
    const yMax = Math.max(...yTicks) || (yMin + 1);
    const yScale = v => PAD.top + innerH * (1 - (v - yMin) / (yMax - yMin));
    const baseY = yScale(yMin);

    // Live cursor x — when in live demo, the truncated curve's tip should
    // land at the EXACT sim x position (between two hour boundaries), not at
    // the next hour's x. xForIdx() returns sim x for the live-tip entry,
    // canonical xs[i] otherwise.
    const hasSim = (data._simIdx != null && data._simIdx >= 0 && data._simIdx < xs.length - 1);
    const liveTipIdx = hasSim ? data._simIdx + 1 : -1;
    const liveTipX = hasSim
      ? xs[data._simIdx] + (xs[data._simIdx + 1] - xs[data._simIdx]) * data._simWithin
      : 0;
    const xForIdx = i => (i === liveTipIdx) ? liveTipX : xs[i];

    // Monotone cubic Hermite spline (Fritsch–Carlson). Smooth and organic
    // like Apple Stocks / Robinhood, but mathematically guaranteed never to
    // overshoot or wobble between points: a rising run stays rising, a flat
    // run (e.g. yesterday's evening plateau) stays perfectly flat — no kink.
    // Skips null entries — used for the live-truncated curve where the
    // post-cursor section of the array is null.
    function smoothPath(arr) {
      if (!arr || !arr.length) return '';
      const pts = [];
      arr.forEach((v, i) => {
        if (v != null) pts.push([xForIdx(i), yScale(v)]);
      });
      const n = pts.length;
      if (n === 0) return '';
      if (n === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;

      // Secant slopes between consecutive points.
      const dx = [], slope = [];
      for (let i = 0; i < n - 1; i++) {
        const h = pts[i + 1][0] - pts[i][0];
        dx.push(h);
        slope.push(h !== 0 ? (pts[i + 1][1] - pts[i][1]) / h : 0);
      }
      // Initial tangents — average of adjacent secants; 0 at local extrema.
      const m = new Array(n);
      m[0] = slope[0];
      m[n - 1] = slope[n - 2];
      for (let i = 1; i < n - 1; i++) {
        m[i] = (slope[i - 1] * slope[i] <= 0) ? 0 : (slope[i - 1] + slope[i]) / 2;
      }
      // Clamp tangents so each segment stays monotone (no overshoot).
      for (let i = 0; i < n - 1; i++) {
        if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / slope[i], b = m[i + 1] / slope[i];
        const s = a * a + b * b;
        if (s > 9) {
          const tau = 3 / Math.sqrt(s);
          m[i] = tau * a * slope[i];
          m[i + 1] = tau * b * slope[i];
        }
      }
      // Hermite tangents → cubic Bézier control points.
      let p = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < n - 1; i++) {
        const h = dx[i];
        const cp1x = pts[i][0] + h / 3;
        const cp1y = pts[i][1] + m[i] * h / 3;
        const cp2x = pts[i + 1][0] - h / 3;
        const cp2y = pts[i + 1][1] - m[i + 1] * h / 3;
        p += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`;
      }
      return p;
    }
    // Last non-null index in data.rev — needed for the area path's right edge
    // and for positioning the live pulse on the live-truncated curve.
    let lastIdx = -1;
    for (let i = 0; i < N; i++) { if (data.rev[i] != null) lastIdx = i; }
    // Resting hero readout = the latest cumulative point vs the same point
    // on the comparison curve.
    const restingVal  = lastIdx >= 0 ? data.rev[lastIdx] : 0;
    const restingPrev = (data.revPrev && lastIdx >= 0) ? data.revPrev[lastIdx] : null;
    const linePath = smoothPath(data.rev);
    const cmpPath  = smoothPath(data.revPrev);
    // Area's right edge follows the line's actual tip — sim x in live mode.
    const areaTipX = lastIdx >= 0 ? xForIdx(lastIdx) : 0;
    const areaPath = lastIdx >= 0
      ? `${linePath} L${areaTipX.toFixed(1)} ${baseY.toFixed(1)} L${xs[0].toFixed(1)} ${baseY.toFixed(1)} Z`
      : '';

    // Live "you are here" indicator — anchors at the truncated curve's tip
    // when demoClock is active, otherwise stays at the canonical 14h index.
    const showLive = effective === 'aujourdhui' && lastIdx >= 0;
    const liveIdx = isLiveDemo() ? lastIdx : Math.min(3, lastIdx);
    const liveX = showLive ? xForIdx(liveIdx) : 0;
    const liveY = (showLive && data.rev[liveIdx] != null) ? yScale(data.rev[liveIdx]) : 0;

    const visibleIdx = data.visibleXIdx || data.rev.map((_, i) => i);
    const xLabelsHtml = visibleIdx.map(i =>
      `<text x="${xs[i].toFixed(1)}" y="${(H - 14).toFixed(1)}" text-anchor="middle">${data.xLabels[i] || ''}</text>`
    ).join('');
    // Robinhood-clean: no y-axis labels — the hero readout + scrubber carry
    // the exact figures, so the line floats free of gridline clutter.
    const yLabelsHtml = '';

    const showCmp = !!showComparison;
    const captionFull = COMPARE_CAPTION[lang]?.[currentRange] || COMPARE_CAPTION.fr[currentRange] || '';
    const captionShort = COMPARE_SHORT[lang]?.[currentRange] || COMPARE_SHORT.fr[currentRange] || '';

    svg.innerHTML = `
      <defs>
        <!-- 3-stop gradient: punchy near the line, fades fast, Robinhood depth -->
        <linearGradient id="gfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0"    stop-color="#7DF2B0" stop-opacity="0.30"/>
          <stop offset="0.6"  stop-color="#7DF2B0" stop-opacity="0.06"/>
          <stop offset="1"    stop-color="#7DF2B0" stop-opacity="0"/>
        </linearGradient>
        <filter id="rev-line-glow" x="-2%" y="-30%" width="104%" height="160%">
          <feGaussianBlur stdDeviation="3"/>
        </filter>
        <!-- Atlas → riad gradient for the tooltip card -->
        <linearGradient id="rev-tip-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="#0B6E4F"/>
          <stop offset="100%" stop-color="#053B2C"/>
        </linearGradient>
        <!-- Green-tinted soft shadow under the tooltip -->
        <filter id="rev-tip-shadow" x="-50%" y="-50%" width="200%" height="240%">
          <feDropShadow dx="0" dy="2"  stdDeviation="2"  flood-color="#053B2C" flood-opacity="0.18"/>
          <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#053B2C" flood-opacity="0.32"/>
        </filter>
      </defs>
      ${yLabelsHtml}
      <g font-family="Inter Tight" font-size="10.5" fill="rgba(247,245,240,0.5)" letter-spacing="0.02em">${xLabelsHtml}</g>
      <line class="rev-cross-line" x1="${PAD.left}" x2="${PAD.left}" y1="${PAD.top}" y2="${(PAD.top + innerH).toFixed(1)}" stroke="rgba(255,255,255,0.32)" stroke-width="1"/>
      ${cmpPath ? `<path class="rev-cmp" d="${cmpPath}" stroke="rgba(247,245,240,0.4)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" pathLength="1" style="opacity:${showCmp ? 1 : 0};"/>` : ''}
      <path class="rev-area" d="${areaPath}" fill="url(#gfill)"/>
      <!-- Halo: wider, blurred sibling of the line, Apple Stocks soft glow -->
      <path class="rev-line-halo" d="${linePath}" stroke="#7DF2B0" stroke-width="5" stroke-opacity="0.20" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#rev-line-glow)" pathLength="1"/>
      <path class="rev-line" d="${linePath}" stroke="#7DF2B0" stroke-width="2.25" fill="none" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
      ${showLive ? `
      <g class="rev-live" transform="translate(${liveX.toFixed(1)} ${liveY.toFixed(1)})">
        <circle class="rev-live-ring" cx="0" cy="0" r="4"/>
        <circle class="rev-live-ring delay" cx="0" cy="0" r="4"/>
        <circle class="rev-live-dot" cx="0" cy="0" r="4"/>
      </g>` : ''}
      <g class="rev-active">
        <circle class="rev-active-cmp" cx="${PAD.left}" cy="${PAD.top}" r="4" fill="rgba(247,245,240,0.55)" stroke="#053B2C" stroke-width="2"/>
        <circle class="rev-active-dot" cx="${PAD.left}" cy="${PAD.top}" r="5.5" fill="#7DF2B0" stroke="#053B2C" stroke-width="2"/>
      </g>
      <g class="rev-tip">
        <rect class="rev-tip-rect" rx="14" ry="14" fill="url(#rev-tip-gradient)" stroke="rgba(125,242,176,0.18)" stroke-width="1" filter="url(#rev-tip-shadow)"/>
        <text class="rev-tip-label" x="0" text-anchor="middle" font-family="JetBrains Mono" font-size="9.5" fill="#7DF2B0" letter-spacing="0.6" opacity="0.9"></text>
        <text class="rev-tip-value" x="0" text-anchor="middle" font-family="Inter Tight" font-weight="600" font-size="14" fill="#FFFFFF" letter-spacing="-0.01em"></text>
        <text class="rev-tip-cmp"   x="0" text-anchor="middle" font-family="Inter Tight" font-weight="500" font-size="10.5" letter-spacing="0"></text>
      </g>
      <rect class="rev-hit" x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent" pointer-events="all"/>
    `;

    // The markup above is brand new, so the hover chrome inside it is back at
    // its default corner position (cx=PAD.left, cy=PAD.top) with no pointer
    // event to place it. Leaving .is-hover set from the previous render paints
    // an orphan dot and an empty chip in the top-left of the plot — visible
    // every time a live tick lands while the cursor is resting on the chart.
    // Drop the hover state; the next pointermove re-establishes it.
    svg.classList.remove('is-hover');

    // Pointer-driven tooltip + active dots — hover state controlled by .is-hover
    // class on the SVG; element opacity transitions in CSS handle the fade.
    const hit = svg.querySelector('.rev-hit');
    const aDot = svg.querySelector('.rev-active-dot');
    const aCmp = svg.querySelector('.rev-active-cmp');
    const cross = svg.querySelector('.rev-cross-line');
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

    // Robinhood-style hero readout: a big live figure that the scrubber drives.
    function setHero(val, prev, animate) {
      const vEl = document.querySelector('[data-rev-hero-val]');
      const dEl = document.querySelector('[data-rev-hero-delta]');
      if (vEl) {
        const fmtV = (v) => `${frInt(v)}<span class="rev-hero-cur">MAD</span>`;
        if (animate) animateNumber(vEl, parseAmountFromEl(vEl), val, { duration: 720, format: fmtV });
        else vEl['inner' + 'HTML'] = fmtV(val);
      }
      if (dEl) {
        if (prev != null && prev > 0) {
          const diff = Math.round(val - prev);
          const up = diff >= 0;
          dEl.className = 'rev-hero-delta ' + (up ? 'up' : 'down');
          dEl['inner' + 'HTML'] = `${arrowSvg(up)}<span>${up ? '+' : '−'}${frInt(Math.abs(diff))} MAD · ${fmtDeltaPct(val, prev)}</span><span class="lbl">${captionShort || 'vs préc.'}</span>`;
        } else {
          dEl.className = 'rev-hero-delta';
          dEl['inner' + 'HTML'] = '';
        }
      }
    }

    // True if the x-axis labels are hourly (e.g. "11h"). Hourly ranges
    // get per-minute interpolation; daily ranges (7j / 30j) get per-hour
    // interpolation so the hover feels equally fluid.
    const isHourly = !!data.xLabels?.[0]?.endsWith('h');

    function move(evt) {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const xVB = ((evt.clientX - rect.left) / rect.width) * W;

      let sx, sy, cmpY, valueAtCursor, prevAtCursor, timeLabel, refIdx;

      if (isHourly) {
        // ─── PER-MINUTE: linear interpolation between hour boundaries ───
        const fx = Math.max(0, Math.min(1, (xVB - PAD.left) / innerW));
        const TOTAL_MIN = (xs.length - 1) * 60;          // 15h × 60 = 900 min
        let totalMin = Math.round(fx * TOTAL_MIN);

        // Live demo: reject hover positions past the sim cursor (you can't peek
        // at hours that haven't happened yet).
        if (data._simIdx != null) {
          const simTotalMin = data._simIdx * 60 + Math.round(data._simWithin * 60);
          if (totalMin > simTotalMin) { svg.classList.remove('is-hover'); return; }
        }

        let hourIdx = Math.min(xs.length - 1, Math.floor(totalMin / 60));
        let minWithin = totalMin - hourIdx * 60;
        // Handle the rightmost edge
        if (hourIdx >= xs.length - 1) { hourIdx = xs.length - 1; minWithin = 0; }

        const vLow  = data.rev[hourIdx];
        const vHigh = data.rev[hourIdx + 1];

        // If we're past the live cursor (vLow null), don't render the hover.
        if (vLow == null) { svg.classList.remove('is-hover'); return; }

        // Interpolate value (linear) between the two surrounding hour boundaries.
        if (vHigh == null || hourIdx >= xs.length - 1) {
          valueAtCursor = vLow;
        } else {
          valueAtCursor = vLow + (vHigh - vLow) * (minWithin / 60);
        }

        // Interpolate compare line too if active.
        if (data.revPrev) {
          const pLow  = data.revPrev[hourIdx];
          const pHigh = data.revPrev[hourIdx + 1];
          if (pLow != null && pHigh != null && hourIdx < xs.length - 1) {
            prevAtCursor = pLow + (pHigh - pLow) * (minWithin / 60);
          } else if (pLow != null) {
            prevAtCursor = pLow;
          }
        }

        // Snap cursor x to the exact minute (60 minutes per hour-segment).
        const fSnap = totalMin / TOTAL_MIN;
        sx = PAD.left + fSnap * innerW;
        sy = yScale(valueAtCursor);
        cmpY = (prevAtCursor != null) ? yScale(prevAtCursor) : null;

        // Build "11h32" / "14h27" / "01h05" — wraps past 23h to 00h/01h/02h.
        const baseHour = parseInt((data.xLabels[hourIdx] || '11h').replace('h', ''), 10);
        const safeHour = isNaN(baseHour) ? 11 : baseHour;
        timeLabel = `${String(safeHour).padStart(2, '0')}h${String(minWithin).padStart(2, '0')}`;
        refIdx = hourIdx;
      } else {
        // ─── DAILY (7j / 30j): per-hour interpolation between day points.
        // The chart only has daily totals, so we lerp the value linearly
        // between two adjacent days and show "Mar 23 · 14h" as the label.
        // Visually identical fluidity to the hourly path. ───
        const fx = Math.max(0, Math.min(1, (xVB - PAD.left) / innerW));
        const dayCount = xs.length - 1;
        if (dayCount <= 0) {
          // Single-point fallback (shouldn't happen in practice)
          sx = xs[0]; sy = yScale(data.rev[0]);
          valueAtCursor = data.rev[0]; prevAtCursor = data.revPrev ? data.revPrev[0] : null;
          timeLabel = data.xLabels[0] || ''; refIdx = 0;
        } else {
          const TOTAL_H = dayCount * 24;
          let totalH = Math.round(fx * TOTAL_H);
          let dayIdx = Math.min(xs.length - 1, Math.floor(totalH / 24));
          let hourWithin = totalH - dayIdx * 24;
          if (dayIdx >= xs.length - 1) { dayIdx = xs.length - 1; hourWithin = 0; }

          const vLow  = data.rev[dayIdx];
          const vHigh = data.rev[dayIdx + 1];
          if (vLow == null) { svg.classList.remove('is-hover'); return; }

          if (vHigh == null || dayIdx >= xs.length - 1) {
            valueAtCursor = vLow;
          } else {
            valueAtCursor = vLow + (vHigh - vLow) * (hourWithin / 24);
          }

          if (data.revPrev) {
            const pLow  = data.revPrev[dayIdx];
            const pHigh = data.revPrev[dayIdx + 1];
            if (pLow != null && pHigh != null && dayIdx < xs.length - 1) {
              prevAtCursor = pLow + (pHigh - pLow) * (hourWithin / 24);
            } else if (pLow != null) {
              prevAtCursor = pLow;
            }
          }

          const fSnap = totalH / TOTAL_H;
          sx = PAD.left + fSnap * innerW;
          sy = yScale(valueAtCursor);
          cmpY = (prevAtCursor != null) ? yScale(prevAtCursor) : null;

          // "Mar 23 · 14h" — append hour only when between day boundaries
          const dayLabel = data.xLabels[dayIdx] || '';
          timeLabel = (hourWithin > 0 && dayIdx < xs.length - 1)
            ? `${dayLabel} · ${hourWithin}h`
            : dayLabel;
          refIdx = dayIdx;
        }
      }

      const showCmpNow = !!showComparison && cmpY != null;

      // Active dots — CSS transitions on cx/cy smooth-track the cursor
      aDot.setAttribute('cx', sx.toFixed(1));
      aDot.setAttribute('cy', sy.toFixed(1));
      aCmp.style.display = showCmpNow ? '' : 'none';
      if (showCmpNow) {
        aCmp.setAttribute('cx', sx.toFixed(1));
        aCmp.setAttribute('cy', cmpY.toFixed(1));
      }
      // Vertical crosshair — full-height dashed line, smooth-tracking
      if (cross) {
        cross.setAttribute('x1', sx.toFixed(1));
        cross.setAttribute('x2', sx.toFixed(1));
      }

      // ── Content first — the geometry below is measured off the real glyphs ──
      tipLabel.textContent = timeLabel.toUpperCase();
      tipValue.textContent = `${frInt(valueAtCursor)} MAD`;
      if (showCmpNow && prevAtCursor != null) {
        const delta = fmtDeltaPct(valueAtCursor, prevAtCursor);
        // Green tooltip bg: positive delta = mint, negative = warm red. Label muted mint.
        const deltaColor = (valueAtCursor >= prevAtCursor) ? '#7DF2B0' : '#FCA597';
        tipCmp.innerHTML =
          `<tspan fill="rgba(199,234,212,0.85)">${captionShort} · ${frInt(prevAtCursor)} MAD&#160;&#160;</tspan>` +
          `<tspan fill="${deltaColor}" font-weight="600">${delta}</tspan>`;
        tipCmp.style.display = '';
      } else {
        tipCmp.style.display = 'none';
      }

      // Tooltip box — fitted to its content, not to the longest string it could
      // ever hold. The old fixed 180×54 was sized for the compare case and then
      // magnified by the viewBox bug, so a plain hover dropped a slab over a
      // third of the plot. Without a comparison the time and the amount now sit
      // on ONE row: the big hero figure above already restates the value, so
      // this only has to say *when*.
      const textW = (el) => { try { return el.getComputedTextLength() || 0; } catch (e) { return 0; } };
      const TIP_PAD_X = 12;      // horizontal breathing room inside the box
      const TIP_COL_GAP = 9;     // between the time and the amount on one row
      const wLabel = Math.ceil(textW(tipLabel));
      const wValue = Math.ceil(textW(tipValue));
      const tipW = showCmpNow
        ? Math.ceil(Math.max(wLabel, wValue, textW(tipCmp))) + TIP_PAD_X * 2
        : wLabel + TIP_COL_GAP + wValue + TIP_PAD_X * 2;
      const tipH = showCmpNow ? 68 : 30;
      const ANCHOR_GAP = 12;     // gap between tooltip edge and the hovered dot
      const rectX = -tipW / 2;

      // Flip strategy — tooltip ABOVE the dot by default, but if the dot
      // is high (small sy) the tooltip would clip the top edge AND overlap
      // the dot itself. In that case flip BELOW the dot so the dot stays
      // visible. This is the bug the user reported: green box covering
      // the green hover point on high values.
      const tipFitsAbove = sy >= PAD.top + tipH + ANCHOR_GAP + 4;
      const tipBelow = !tipFitsAbove;
      const rectY = tipBelow ? ANCHOR_GAP : -tipH - ANCHOR_GAP;

      tipRect.setAttribute('x', rectX.toFixed(1));
      tipRect.setAttribute('y', rectY.toFixed(1));
      tipRect.setAttribute('width',  tipW.toFixed(1));
      tipRect.setAttribute('height', tipH.toFixed(1));

      // Text layout is relative to rectY, so it flips with the box.
      if (showCmpNow) {
        for (const t of [tipLabel, tipValue, tipCmp]) {
          t.setAttribute('text-anchor', 'middle');
          t.setAttribute('x', '0');
        }
        tipLabel.setAttribute('y', (rectY + 19).toFixed(1));   // top row
        tipValue.setAttribute('y', (rectY + 41).toFixed(1));   // middle
        tipCmp  .setAttribute('y', (rectY + 58).toFixed(1));   // bottom
      } else {
        // Single row: both runs left-aligned off the box's inner edge, so the
        // gap between them stays constant instead of breathing with the digits.
        const baseline = rectY + tipH / 2 + 4.5;
        tipLabel.setAttribute('text-anchor', 'start');
        tipLabel.setAttribute('x', (rectX + TIP_PAD_X).toFixed(1));
        tipLabel.setAttribute('y', baseline.toFixed(1));
        tipValue.setAttribute('text-anchor', 'start');
        tipValue.setAttribute('x', (rectX + TIP_PAD_X + wLabel + TIP_COL_GAP).toFixed(1));
        tipValue.setAttribute('y', baseline.toFixed(1));
      }

      // Anchor at the dot; horizontal clamping keeps it on-canvas.
      const tipDy = sy;
      const halfW = tipW / 2 + 8;
      let tipDx = 0;
      if (sx - halfW < 4)         tipDx = halfW + 8 - sx;          // push right
      else if (sx + halfW > W - 4) tipDx = -((sx + halfW) - (W - 4)); // push left
      tip.setAttribute('transform', `translate(${(sx + tipDx).toFixed(1)}, ${tipDy.toFixed(1)})`);
      svg.classList.add('is-hover');
      setHero(valueAtCursor, prevAtCursor, false);
    }
    function leave() {
      svg.classList.remove('is-hover');
      setHero(restingVal, restingPrev, false);
    }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerenter', move);
    hit.addEventListener('pointerleave', leave);

    // Hero readout — latest cumulative figure + delta vs the comparison.
    setHero(restingVal, restingPrev, !suppressAnim);

    // Header text
    const badge = document.querySelector('[data-rev-range-badge]');
    if (badge) badge.textContent = trStr(data.rangeBadge, REV_BADGE);
    const sub = document.querySelector('[data-rev-sub]');
    if (sub) sub.textContent = trStr(data.sub, REV_SUB);

    // Legend (revenue lines only — transactions count moved to KPI band)
    const legend = document.querySelector('[data-rev-legend]');
    if (legend) {
      legend['inner' + 'HTML'] = `
        <label><i class="leg-line leg-line-primary"></i>${trLegend(data.legendPrimary || '', LEGEND_PREFIX)}</label>
        ${showCmp && data.legendCompare
          ? `<label class="leg-cmp"><i class="leg-line leg-line-compare"></i>${trLegend(data.legendCompare, LEGEND_PREFIX)}</label>`
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

  /* Kiwi keeps the executive payment view binary: cash versus card. Tap, QR,
   * wallet and payment links are cashless, so they roll into the card rail. */
  const REAL_MIX = [
    { key: 'card', color: '#0B6E4F', fr: 'Carte',   en: 'Card', ar: 'بطاقة' },
    { key: 'cash', color: '#C9D2CE', fr: 'Espèces', en: 'Cash', ar: 'نقدًا' },
  ];
  const MIX_EMPTY = {
    fr: 'Aucun encaissement sur la période',
    en: 'No payments in this period',
    ar: 'لا توجد مدفوعات في هذه الفترة',
  };
  function realMixRows(lang, range) {
    const [from, to] = rangeBounds(range || effRange());
    const by = {};
    let total = 0;
    realSalesList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.max(0, +e.amount || 0);
      if (!amt) return;
      const k = String((e && e.method) || 'card') === 'cash' ? 'cash' : 'card';
      by[k] = (by[k] || 0) + amt;
      total += amt;
    });
    if (!total) return { rows: [], total: 0 };
    return {
      total,
      cardTotal: by.card || 0,
      rows: REAL_MIX.filter((m) => by[m.key] > 0).map((m) => ({
        key: m.key, color: m.color, label: m[lang] || m.fr, pct: (by[m.key] / total) * 100,
      })),
    };
  }

  function renderMix() {
    const effective = effRange();
    const data = vData(mixByVenue, currentRange);
    if (!data) return;
    const lang = getLang();

    /* Both demo and real venues now expose the same two executive rails. */
    const custom = ownData();
    const real = custom ? realMixRows(lang, effective) : null;
    const rows = custom ? real.rows : [
      { key: 'card', color: '#0B6E4F', label: REAL_MIX[0][lang] || REAL_MIX[0].fr, pct: data.card },
      { key: 'cash', color: '#C9D2CE', label: REAL_MIX[1][lang] || REAL_MIX[1].fr, pct: data.cash },
    ];
    const centerMad = custom ? real.cardTotal : data.centerMad;

    const donut = document.querySelector('[data-mix-donut]');
    if (donut) {
      /* The arc always means card share; the remainder is cash. */
      const cardPct = Number(rows.find((row) => row.key === 'card')?.pct) || 0;
      const ringValue = donut.querySelector('[data-mix-ring-value]');
      if (ringValue) {
        const pct = Math.max(0, Math.min(100, cardPct));
        ringValue.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
      }

      const centerPct = document.querySelector('[data-mix-center-pct]');
      if (centerPct) animateNumber(centerPct, parseAmountFromEl(centerPct), cardPct, {
        duration: 620,
        format: value => `${Math.round(value)} %`,
      });

      const ringCenter = donut.parentElement?.querySelector('.ring-center');
      if (ringCenter) {
        ringCenter.classList.remove('in');
        ringCenter.offsetWidth;
        ringCenter.classList.add('in');
      }
    }

    const center = document.querySelector('[data-mix-center-amt]');
    if (center) animateNumber(center, parseAmountFromEl(center), centerMad, { duration: 700, format: v => frInt(v) });

    const centerUnit = center && center.parentElement
      ? center.parentElement.querySelector('.slash') : null;
    if (centerUnit) {
      const T = window.KiwiI18n?.T?.[lang] || {};
      centerUnit.setAttribute('data-i18n', 'dash.mix.center.unit');
      centerUnit.textContent = T['dash.mix.center.unit'] || 'MAD carte';
    }

    const sub = document.querySelector('[data-mix-sub]');
    if (sub) sub.textContent = RANGE_STR[lang]?.[currentRange] || RANGE_STR.fr[currentRange];

    const legend = document.querySelector('[data-mix-legend]');
    if (legend) {
      // No sales yet is a real answer — say so, rather than print rails at 0 %.
      if (!rows.length) {
        legend.innerHTML = `<div class="li"><div class="n" style="color:var(--n-500,#77807b);">${MIX_EMPTY[lang] || MIX_EMPTY.fr}</div></div>`;
        legend.dataset.built = '';
        legend.dataset.sig = '';
        return;
      }
      // Rows are addressed by label, so a changed tender set needs a fresh build.
      const lsig = rows.map((r) => r.label).join('|');
      if (legend.dataset.sig !== lsig) legend.dataset.built = '';
      legend.dataset.sig = lsig;
      const built = legend.dataset.built === '1';
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
  function buildOrder(venue, dateKey, idx) {
    const seedStr = `${venue}-${dateKey}-${idx}`;
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    /* Payment-method mix: 20% Visa, 20% MC, 15% Tap, 15% QR, 30% cash —
     * realistic for a Moroccan café/restaurant. */
    const r = rnd();
    let method, primary, sub, flag;
    if (r < 0.20) {
      method = 'visa';
      const last4 = String(Math.floor(rnd() * 10000)).padStart(4, '0');
      primary = `Visa •• ${last4}`;
      const banks = [['ma', 'Carte marocaine · Attijariwafa'], ['ma', 'Carte marocaine · BMCE'], ['ma', 'Carte marocaine · CIH'], ['fr', 'Carte française · Société Générale'], ['es', 'Carte espagnole · CaixaBank']];
      const b = banks[Math.floor(rnd() * banks.length)]; flag = b[0]; sub = b[1];
    } else if (r < 0.40) {
      method = 'mc';
      const last4 = String(Math.floor(rnd() * 10000)).padStart(4, '0');
      primary = `Mastercard •• ${last4}`;
      const banks = [['ma', 'Carte marocaine · BOA'], ['ma', 'Carte marocaine · CIH'], ['fr', 'Carte française · BNP Paribas']];
      const b = banks[Math.floor(rnd() * banks.length)]; flag = b[0]; sub = b[1];
    } else if (r < 0.55) {
      method = 'tap'; primary = 'Kiwi Tap'; flag = 'ma'; sub = 'NFC · contactless';
    } else if (r < 0.70) {
      method = 'qr'; primary = 'Kiwi Wallet QR'; flag = 'ma'; sub = 'Client abonné';
    } else {
      method = 'cash'; primary = 'Espèces'; flag = 'ma'; sub = 'Cash · table';
    }

    const customers = ['Karim B.', 'Sara L.', 'Youssef A.', 'Nawal K.', 'Hassan J.', 'Imane M.', 'Mehdi R.', 'Fatima Z.', 'Rachid O.', 'Lina S.', 'Ahmed T.', 'Yasmine H.', 'Julie M.', 'Fadoua K.', 'Hind M.', 'Walid F.', 'Soukaina A.', 'Aïcha R.', 'Brahim K.', 'Salma F.'];
    const customer = customers[Math.floor(rnd() * customers.length)];
    const tableNum = 1 + Math.floor(rnd() * 12);
    const covers = 1 + Math.floor(rnd() * 5); // 1–5 people at the table

    /* Servers — small rotating crew per venue. The same hire roster appears
     * across the dashboard so the names feel familiar to the merchant. */
    const servers = ['Fatima K.', 'Omar B.', 'Naima R.', 'Hicham E.', 'Khadija M.'];
    const server = servers[Math.floor(rnd() * servers.length)];

    /* Items — pull the venue's real menu via KiwiVenue.getMenuItems(). Pick
     * 1–4 dishes with realistic quantities; if the menu isn't loaded yet
     * (early-render race) we fall back to a sensible Café Atlas-style mix. */
    const menu = (window.KiwiVenue?.getMenuItems?.(venue) || []);
    const itemCount = 1 + Math.floor(rnd() * 4); // 1–4 distinct items
    const items = [];
    const usedIds = new Set();
    let computedSubtotal = 0;
    if (menu.length) {
      for (let i = 0; i < itemCount && i < menu.length; i++) {
        let pick, guard = 0;
        do { pick = menu[Math.floor(rnd() * menu.length)]; guard++; }
        while (usedIds.has(pick.id) && guard < 12);
        if (usedIds.has(pick.id)) break;
        usedIds.add(pick.id);
        const qty = 1 + (rnd() < 0.3 ? 1 : 0) + (rnd() < 0.15 ? 1 : 0); // 1–3
        items.push({ id: pick.id, name: pick.name, qty, price: pick.price });
        computedSubtotal += qty * pick.price;
      }
    } else {
      const fallback = [
        { name: 'Tajine kefta',        price: 120 },
        { name: 'Thé à la menthe',     price: 30  },
        { name: 'Café noir',           price: 15  },
        { name: 'Pastilla poulet',     price: 140 },
        { name: "Jus d'avocat",        price: 50  },
        { name: 'Couscous royal',      price: 220 },
      ];
      for (let i = 0; i < itemCount; i++) {
        const pick = fallback[Math.floor(rnd() * fallback.length)];
        const qty = 1 + (rnd() < 0.3 ? 1 : 0);
        items.push({ name: pick.name, qty, price: pick.price });
        computedSubtotal += qty * pick.price;
      }
    }

    /* Tax (TVA 10% restauration au Maroc, 20% spa/services). Use the
     * computed subtotal for the displayed amount so the modal numbers add
     * up — the legacy amt range is dropped in favour of real menu math. */
    const tvaRate = venue === 'spaBahia' ? 0.20 : 0.10;
    const subtotal = Math.round(computedSubtotal * 100) / 100;
    const tva = Math.round(subtotal * tvaRate * 100) / 100;
    const amt = Math.round((subtotal + tva) * 100) / 100;

    /* Receipt number — deterministic, looks like a real POS sequence. */
    const receiptNo = 'TKT-' + String(10000 + Math.floor(rnd() * 89999));

    /* Service duration — 12–75 min, longer for tables with more covers. */
    const serviceMinutes = 12 + Math.floor(rnd() * 50) + covers * 4;

    const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      method, primary, sub, flag,
      customer, table: tableNum,
      ctx: `${customer} · T${tableNum}`,
      amt: fmt(amt),
      amtRaw: amt,
      neg: false,
      /* Rich detail used by the order-detail drawer. */
      receiptNo, server, covers, serviceMinutes,
      items,
      subtotal: fmt(subtotal),
      tva: fmt(tva),
      tvaRate: Math.round(tvaRate * 100),
      total: fmt(amt),
    };
  }

  /* Pull the last 6 orders from the simulator's current cumTx. */
  function buildLiveFeed(venue) {
    const sim = window.KiwiDemoClock?.getSimState?.();
    if (!sim) return [];
    const cumTx = sim.cumTx || 0;
    if (cumTx === 0) return [];

    const simHour = (11 + sim.simIdx) % 24;
    const simMin  = sim.simMinute || 0;
    const nowSimMins = simHour * 60 + simMin;

    /* Time offsets (sim minutes ago) — the latest order is right now,
     * the next a couple of sim-minutes back, etc. Up to 10 rows so the
     * feed fills the column height alongside the right-side widgets. */
    const offsets = [0, 2, 4, 7, 10, 14, 18, 23, 28, 34];
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const count = Math.min(offsets.length, cumTx);

    const out = [];
    for (let slot = 0; slot < count; slot++) {
      const orderIdx = cumTx - slot; // latest first
      const o = buildOrder(venue, dateKey, orderIdx);

      let tsMins = nowSimMins - offsets[slot];
      if (tsMins < 0) tsMins += 24 * 60;
      const th = Math.floor(tsMins / 60) % 24;
      const tm = Math.round(tsMins % 60);
      o.t = `${String(th).padStart(2, '0')}:${String(tm).padStart(2, '0')}`;
      o.isNew = (slot === 0);
      out.push(o);
    }
    return out;
  }

  // Feed rows for a user-created venue — newest 8 of the merchant's sales.
  function buildCustomFeed(venue) {
    /* Bornées à la MÊME période que le sous-titre affiché juste au-dessus.
     * Ce `.slice(-8)` prenait les huit dernières ventes de tout l'historique,
     * pendant que le sous-titre, lui, comptait « N commandes aujourd'hui » sur
     * la seule journée. Un commerçant qui n'avait encore rien vendu ce matin
     * lisait donc « 0 commande aujourd'hui » posé sur trois tickets d'hier — et
     * comme les lignes ne portent que l'heure, rien ne trahissait leur date. Le
     * titre du panneau rendait la chose pire : ces ventes-là n'étaient ni en
     * direct, ni du jour. */
    const [lo, hi] = rangeBounds(effRange());
    const sales = realSalesList()
      .filter((s) => { const ts = +(s && s.ts) || 0; return ts >= lo && ts < hi; })
      .slice(-8).reverse();
    const lang = getLang();
    /* Every method the till can actually record (see live-link METHOD_LABEL).
     * `cash` was missing, so `L[s.method] || L.card` relabelled EVERY cash sale
     * as "Carte bancaire" — on a Moroccan boutique dashboard, where cash is the
     * dominant tender, the owner could not tell cash from card on their own
     * feed. */
    const ML = {
      fr: { cash: 'Espèces', card: 'Carte bancaire', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'Lien de paiement', delivery: 'Livraison · à recevoir', sub: 'Vente encaissée', deliverySub: 'Vente enregistrée · non encaissée' },
      en: { cash: 'Cash', card: 'Bank card', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'Payment link', delivery: 'Delivery · receivable', sub: 'Sale recorded', deliverySub: 'Sale recorded · unpaid' },
      ar: { cash: 'نقدًا', card: 'بطاقة بنكية', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'رابط الدفع', delivery: 'توصيل · مبلغ مستحق', sub: 'عملية بيع مسجّلة', deliverySub: 'بيع مسجّل · غير محصّل' },
    };
    /* Chip art per method. The till records the TENDER, never the card network,
     * so a card sale gets the neutral card chip — printing a Visa or Mastercard
     * mark here would invent a fact the sale does not carry. */
    const ICON_FOR = { cash: 'cash', card: 'cmi', tap: 'tap', qr: 'qr', wallet: 'qr', link: 'qr', delivery: 'qr' };
    const L = ML[lang] || ML.fr;
    return sales.map((s, i) => {
      const d = new Date(s.ts);
      const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return {
        t,
        method: ICON_FOR[s.method] || 'cmi',
        primary: L[s.method] || L.card,
        /* The "who/what" column. On a boutique the useful identifier is the item,
         * which the sale now carries — a row reading "Chemise en lin" is what the
         * owner needs to find the original sale when that customer returns. Falls
         * back to the generic subtitle only when the till sent no label. */
        sub: s.method === 'delivery' ? L.deliverySub : L.sub, flag: '', ctx: s.label || '',
        // Amount ONLY — the row template appends its own <span class="cur">MAD</span>,
        // so spelling the unit here too printed "450,00 MADMAD" on every real sale.
        amt: (s.amount || 0).toFixed(2).replace('.', ','),
        tip: '—', neg: false, isNew: i === 0,
      };
    });
  }

  function renderFeed() {
    const lang = getLang();
    const effective = effRange();
    const isLive = effective === 'aujourdhui';

    /* Cached tx rows carry FR payment strings baked at generation time —
     * translate the known method strings at render time so a language switch
     * applies to feeds that were already generated. */
    const PAY_TR = {
      'Espèces': { en: 'Cash', ar: 'نقدًا' },
      'Cash · table': { en: 'Cash · at the table', ar: 'نقدًا · على الطاولة' },
      'Client abonné': { en: 'Subscribed client', ar: 'عميل مشترك' },
      'NFC · contactless': { en: 'NFC · contactless', ar: 'NFC · بدون تلامس' },
    };
    const PAY_PREFIX = [
      ['Carte marocaine', { en: 'Moroccan card', ar: 'بطاقة مغربية' }],
      ['Carte française', { en: 'French card', ar: 'بطاقة فرنسية' }],
      ['Carte espagnole', { en: 'Spanish card', ar: 'بطاقة إسبانية' }],
    ];
    const trPay = (s) => {
      if (!s || lang === 'fr') return s;
      const hit = PAY_TR[s];
      if (hit) return hit[lang] || s;
      for (const [pre, tr2] of PAY_PREFIX) {
        if (s.indexOf(pre) === 0) return (tr2[lang] || pre) + s.slice(pre.length);
      }
      return s;
    };

    const venue = window.KiwiVenue?.getVenue?.() || 'cafeAtlas';
    // A user-created venue's feed is built from the merchant's own recorded
    // sales — empty state until the first one is rung up.
    //
    // The `isReal` arm matters as much as the `isCustom` one. A real session on
    // a venue id that isn't flagged custom used to fall through to the static
    // demo feed, and those rows do not just sit on screen: renderFeed caches
    // them in window.__kiwiFeedOrders, which the assistant reads as "les
    // dernières commandes encaissées" and puts in the model's prompt. Demo
    // covers, demo servers, demo tickets, quoted back as the merchant's own.
    const rows = ownData(venue) ? buildCustomFeed(venue)
      : isLive ? buildLiveFeed(venue) : vData(FEED_BY_VENUE, currentRange);
    const wrap = document.querySelector('[data-feed]');

    if (wrap) {
      if (!rows || rows.length === 0) {
        /* Empty state — start of hour, no orders yet. */
        const fe = tradeStr('feedEmpty', FEED_EMPTY[lang] || FEED_EMPTY.fr);
        wrap['inner' + 'HTML'] = `
          <div style="padding: 36px 14px; text-align: center; color: var(--n-500); font-size: 13px;">
            <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px; background:var(--paper-soft); border-radius:999px; font-family:var(--mono); font-size:11px; letter-spacing:0.06em; color:var(--n-600); margin-bottom:10px;">
              <span class="pulse-dot" style="width:6px; height:6px; background:var(--atlas);"></span>${fe.badge}
            </div>
            <div style="font-weight: 500; color: var(--ink); font-size: 14px;">${fe.title}</div>
            <div style="margin-top: 4px; font-size: 12px;">${fe.sub}</div>
          </div>
        `;
      } else {
        /* Cache the rich order objects so the click handler can pull full
         * detail (items, server, breakdown) from a stable key — avoids
         * round-tripping JSON through DOM attributes. */
        window.__kiwiFeedOrders = {};
        /* Rows cascade on data changes; live ticks rebuild without replay
         * (the .new row keeps its own slide-in). */
        wrap.classList.toggle('feed-anim', !liveTickInProgress);
        wrap.innerHTML = rows.map((r, idx) => {
          const key = `o${idx}`;
          window.__kiwiFeedOrders[key] = r;

          /* Official brand assets live under assets/icons/ (downloaded by
           * the merchant): Visa SVG with proper gradient, Mastercard PNG
           * interlocking circles, illustrated cash bills, scannable QR.
           * NFC stays inline — there's no neutral third-party mark for it. */
          const ICONS = {
            visa: `<img src="assets/icons/visa.svg" alt="Visa">`,
            mc:   `<img src="assets/icons/mastercard.png" alt="Mastercard">`,
            cash: `<img src="assets/icons/cash.webp" alt="Espèces">`,
            tap:  `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M8.5 8a5 5 0 0 1 0 8M12 5a8 8 0 0 1 0 14M15.5 2a11 11 0 0 1 0 20"/></svg>`,
            qr:   `<img src="assets/icons/qr-code.png" alt="QR">`,
            /* Neutral card chip — used when we know a card was tapped/inserted
             * but not which network. Never substitute a Visa/MC mark here. */
            cmi:  `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg>`,
          };
          const chipInner = ICONS[r.method] || '';

          /* Table promoted to a circular badge so the row scans as
           * "seat → person → amount" instead of running text together. */
          const tableChip = (r.table != null)
            ? `<span class="t-chip" aria-label="Table ${r.table}">T${r.table}</span>`
            : '';
          const who = r.customer ? r.customer : (r.ctx || '');

          return `
          <div class="feed-row${r.isNew ? ' new' : ''}" style="--i:${idx};" tabindex="0" role="button" data-action="open-order" data-order-key="${key}">
            <div class="t">${r.t}</div>
            <div class="method">
              <div class="ci ${r.method}">${chipInner}</div>
              <div class="desc">
                <div class="primary">${trPay(r.primary)}</div>
                <div class="sub"><span class="flag ${r.flag}"></span>${trPay(r.sub)}</div>
              </div>
            </div>
            <div class="ctx">${tableChip}<span class="who">${who}</span></div>
            <div class="amt"${r.neg ? ' style="color: var(--danger);"' : ''}>${r.amt}<span class="cur">MAD</span></div>
            <div class="more" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></div>
          </div>
        `;
        }).join('');
      }
    }
    const titleEl = document.querySelector('[data-feed-title]');
    if (titleEl) titleEl.textContent = FEED_TITLE[lang]?.[currentRange] || FEED_TITLE.fr[currentRange];
    const subEl = document.querySelector('[data-feed-sub]');
    if (subEl) {
      if (isLive && rows && rows.length === 0) {
        subEl.textContent = tradeStr('feedAwait',
            lang === 'en' ? 'Service open · awaiting first order'
          : lang === 'ar' ? 'الخدمة مفتوحة · في انتظار الطلب الأول'
          : 'Service ouvert · en attente de la 1ʳᵉ commande');
      } else if (isLive) {
        /* Live subtitle reflects the actual row count + total today.
         * A REAL merchant's count must come from their OWN sales: the demo
         * clock keeps simulating in the background, so reading its cumTx here
         * printed "98 commandes aujourd'hui" on a store that had rung 2. */
        let cumTx;
        if (ownData()) {
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const t0 = start.getTime();
          let sales = [];
          try { sales = realSalesList(); } catch (_) { sales = []; }
          cumTx = sales.filter((s) => (s && s.ts) >= t0).length;
        } else {
          const sim = window.KiwiDemoClock?.getSimState?.();
          cumTx = sim?.cumTx ?? 0;
        }
        const n = rows.length;
        const word = lang === 'en' ? 'last' : lang === 'ar' ? 'آخر' : 'dernières';
        const total = lang === 'en' ? `· ${cumTx} today`
                    : lang === 'ar' ? `· ${cumTx} اليوم`
                    : `· ${cumTx} commande${cumTx > 1 ? 's' : ''} aujourd'hui`;
        subEl.textContent = `${n} ${word} ${total}`;
      } else {
        subEl.textContent = FEED_SUB[lang]?.[currentRange] || FEED_SUB.fr[currentRange];
      }
    }
  }

  /* ═══════════════ RENDER: SETTLEMENT ═══════════════ */

  function renderSettle() {
    const lang = getLang();
    const effective = effRange();
    const data = vData(settleByVenue, currentRange);
    if (!data) return;

    /* KiwiSales contains encaissements, not bank settlement batches, fees or
       destination IBANs. A real merchant therefore gets an explicit unknown
       state. Reusing the demo row here used to retain Café Atlas's masked IBAN
       even after its amount had been zeroed. */
    if (ownData()) {
      const empty = ({
        fr: { lbl: 'RÈGLEMENT', sub: 'Données de règlement indisponibles pour cette période.' },
        en: { lbl: 'SETTLEMENT', sub: 'Settlement data is unavailable for this period.' },
        ar: { lbl: 'التسوية', sub: 'بيانات التسوية غير متاحة لهذه الفترة.' },
      })[lang] || { lbl: 'RÈGLEMENT', sub: 'Données de règlement indisponibles pour cette période.' };
      const lblEl = document.querySelector('[data-settle-lbl]');
      const amtEl = document.querySelector('[data-settle-amt]');
      const subEl = document.querySelector('[data-settle-sub]');
      const detailEl = document.querySelector('[data-settle-detail]');
      if (lblEl) lblEl.textContent = empty.lbl;
      if (amtEl) amtEl.textContent = '—';
      if (subEl) subEl.textContent = empty.sub;
      if (detailEl) detailEl.innerHTML = '';
      return;
    }

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
          msg: 'Dès que vous suivez vos ingrédients, Kiwi AI estime les quantités à recommander.' },
    en: { title: 'Stock to reorder', head: 'No stock alerts',
          msg: 'Once you track your ingredients, Kiwi AI estimates the quantities to reorder.' },
    ar: { title: 'مخزون للطلب', head: 'لا توجد تنبيهات مخزون',
          msg: 'بمجرد تتبّع مكوّناتك، يقدّر Kiwi AI الكميات الواجب طلبها.' },
  };

  const HEALTH_EMPTY = {
    fr: { title: 'Score de santé Kiwi', head: 'Votre score se construit', msg: 'Le score de santé Kiwi s’affiche après vos premières semaines d’activité, succès des paiements, conformité, fidélité.' },
    en: { title: 'Kiwi health score', head: 'Your score is building', msg: 'Your Kiwi health score appears after your first weeks of activity, payment success, compliance, loyalty.' },
    ar: { title: 'نقاط صحة Kiwi', head: 'يُبنى مؤشّرك', msg: 'تظهر نقاط صحة Kiwi بعد أسابيعك الأولى من النشاط، نجاح المدفوعات والامتثال والولاء.' },
  };
  const BENCH_EMPTY = {
    fr: { title: 'Vous vs établissements similaires', head: 'Comparaison à venir', msg: 'Dès que vous accumulez de l’activité, comparez vos performances aux établissements similaires près de chez vous.' },
    en: { title: 'You vs similar venues', head: 'Benchmark coming soon', msg: 'Once you build up activity, compare your performance against similar venues near you.' },
    ar: { title: 'أنت مقابل منشآت مماثلة', head: 'المقارنة قريبًا', msg: 'بمجرد تجميع نشاطك، قارن أداءك بالمنشآت المماثلة القريبة منك.' },
  };
  const PRODUCTS_EMPTY = {
    fr: { sub: 'Aucune vente enregistrée', msg: 'Vos meilleures ventes s’afficheront ici dès la première commande.' },
    en: { sub: 'No sales recorded', msg: 'Your best sellers will appear here after the first order.' },
    ar: { sub: 'لا مبيعات مسجّلة', msg: 'ستظهر أفضل مبيعاتك هنا بعد أوّل طلب.' },
  };
  /* ── Stock à recommander · boutique réelle ──────────────────────────────
   * Le seuil reprend celui de boutique-catalog.stats() (0 = rupture, ≤ 5 = bas).
   * Les deux doivent bouger ensemble : sinon l'Inventaire annonce « 1 stock bas »
   * pendant que l'accueil jure n'avoir rien à recommander. */
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
    fr: (n, s) => `Rien à racheter : vos ${n} article${n > 1 ? 's sont tous' : ' est'} au-dessus de ${s} unités.`,
    en: (n, s) => `Nothing to reorder: all ${n} item${n > 1 ? 's are' : ' is'} above ${s} units.`,
    ar: (n, s) => `لا شيء لإعادة طلبه: ${n} منتج فوق ${s} وحدة.`,
  };
  /* Les noms d'articles sont saisis par le commerçant : ils passent par du HTML,
   * donc ils s'échappent. dateRange.js n'avait pas d'esc() — les autres listes
   * n'affichent que des libellés de démo. */
  const escTxt = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /* Une vraie boutique a un catalogue, donc la carte peut dire quoi racheter.
   * Avant, renderProducts faisait `isCustom ? []` et TOUT commerçant tombait sur
   * « dès que vous suivez vos articles » — y compris celui qui en suivait un, à
   * 5 unités, déjà sous le seuil. null = catalogue vide ou absent : le message
   * d'origine redevient le bon. Le catalogue démarre sur la venue de démo, d'où
   * le bind sur la clé canonique (même chemin que le coût matière). */
  function realLowStock() {
    try {
      if (window.KiwiVenue?.getVenueType?.() !== 'boutique') return null;
      const cat = window.KiwiBoutiqueCatalog;
      if (!cat) return null;
      const key = window.KiwiBoutiqueVenueKey && window.KiwiBoutiqueVenueKey();
      if (key) cat.use(key);
      const prods = cat.listProducts() || [];
      if (!prods.length) return null;
      const rows = prods
        .map((p) => ({ name: p.name, stock: cat.productStock(p.id) }))
        .filter((r) => r.stock <= LOW_STOCK_SEUIL)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5);
      return { rows, tracked: prods.length };
    } catch (_) { return null; }
  }

  const STAFF_ONDUTY_STR = {
    fr: (n, tot) => `${n} sur ${tot} en service aujourd'hui`,
    en: (n, tot) => `${n} of ${tot} on shift today`,
    ar: (n, tot) => `${n} من ${tot} في الخدمة اليوم`,
  };
  const fmtHeures = (h) => `${h.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;
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
  const INTEG_TITLE = { fr: 'Intégrations actives', en: 'Active integrations', ar: 'عمليات الدمج النشطة' };
  const INTEG_SUB = {
    fr: 'Connectez vos outils pour synchroniser ventes et paiements',
    en: 'Connect your tools to sync sales and payments',
    ar: 'اربط أدواتك لمزامنة المبيعات والمدفوعات',
  };
  const INTEG_NOTCONN = { fr: 'État indisponible', en: 'Status unavailable', ar: 'الحالة غير متاحة' };
  const INTEG_LIST = [
    { n: 'Glovo', logo: 'G', bg: '#F29137' },
    { n: 'Yassir Express', logo: 'Y', bg: '#2B5AA8' },
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
  function growBars(scope) {
    if (!scope) return;
    const els = scope.querySelectorAll('[data-grow]');
    if (!els.length) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => { el.style.width = el.dataset.grow; });
      return;
    }
    const apply = () => els.forEach((el) => { el.style.width = el.dataset.grow; });
    requestAnimationFrame(() => requestAnimationFrame(apply));
    /* rAF is frozen in hidden tabs — the timer guarantees the bars land at
     * their real widths even if the render happened in the background. */
    setTimeout(apply, 450);
  }

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

  /* Integrations — for real venues, show an explicit unknown status rather
   * than leaking Café Atlas's sync figures or asserting "not connected"
   * without a reliable status response. */
  function renderInteg() {
    const card = document.querySelector('[data-integ-card]');
    if (!card) return;
    if (_integOrig == null) _integOrig = card['inner' + 'HTML'];
    if (ownData()) {
      const lang = getLang();
      const notConn = INTEG_NOTCONN[lang] || INTEG_NOTCONN.fr;
      const addLbl = (window.KiwiI18n?.t?.('dash.integ.add')) || '+ Ajouter une intégration';
      const cards = INTEG_LIST.map(it =>
        `<div class="integ-card" data-action="add-integration">` +
        `<div class="logo" style="background:${it.bg};opacity:.55;">${it.logo}</div>` +
        `<div class="info"><div class="n">${it.n}</div>` +
        `<div class="s"><span class="dot warn"></span><span>${notConn}</span></div></div></div>`
      ).join('');
      card['inner' + 'HTML'] =
        `<div class="block-head"><div>` +
        `<div class="t">${INTEG_TITLE[lang] || INTEG_TITLE.fr}</div>` +
        `<div class="s">${INTEG_SUB[lang] || INTEG_SUB.fr}</div></div>` +
        `<a href="#" data-action="add-integration" style="font-size:13px;color:var(--atlas);font-weight:500;">${addLbl}</a>` +
        `</div><div class="integ-grid">${cards}</div>`;
    } else if (_integOrig != null && card['inner' + 'HTML'] !== _integOrig) {
      card['inner' + 'HTML'] = _integOrig;
    }
  }

  /* Notification badge — no fake alerts on a fresh custom venue. */
  function renderNotifBadge() {
    const b = document.querySelector('[data-notif-badge]');
    if (!b) return;
    b.style.display = ownData() ? 'none' : '';
  }

  function renderEvening() {
    const el = document.querySelector('[data-evening-card]');
    if (!el) return;
    if (_eveningOrig == null) _eveningOrig = el['inner' + 'HTML'];
    if (ownData()) {
      const t = tradeStr('eveningEmpty', EVENING_EMPTY[getLang()] || EVENING_EMPTY.fr);
      el['inner' + 'HTML'] =
        `<div class="lbl">${t.lbl}</div>` +
        `<div style="padding:28px 4px 8px;text-align:center;">` +
        `<div style="font-size:14px;font-weight:600;color:var(--paper);">${t.head}</div>` +
        `<div style="font-size:12px;color:#A8B0C8;margin-top:6px;line-height:1.5;">${t.msg}</div>` +
        `</div>`;
    } else if (el['inner' + 'HTML'] !== _eveningOrig) {
      el['inner' + 'HTML'] = _eveningOrig;
    }
  }

  function renderStock() {
    const el = document.querySelector('[data-stock-card]');
    if (!el) return;
    if (_stockOrig == null) _stockOrig = el['inner' + 'HTML'];
    if (ownData()) {
      const lang = getLang();
      const t = tradeStr('stockEmpty', STOCK_EMPTY[lang] || STOCK_EMPTY.fr);
      /* L'accueil porte DEUX cartes « Stock à recommander » : celle-ci, dans la
       * colonne de droite, et la liste [data-products-list]. Seule la seconde
       * avait été rebranchée sur le catalogue — le commerçant lisait donc
       * « Aucune alerte de stock » à droite pendant que la gauche affichait
       * l'article sous le seuil. Même source, même seuil, plus de contradiction. */
      const low = realLowStock();
      if (low && low.rows.length) {
        el['inner' + 'HTML'] =
          `<div class="block-head" style="margin-bottom:6px;"><div>` +
          `<div class="t">${STOCK_TITLE_STR[lang] || STOCK_TITLE_STR.fr}</div>` +
          `<div class="s">${(STOCK_SUB_STR[lang] || STOCK_SUB_STR.fr)(low.rows.length)}</div>` +
          `</div></div>` +
          low.rows.map((r) => {
            const dead = r.stock === 0;
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;` +
              `padding:9px 2px;border-top:1px solid var(--n-200);">` +
              `<div style="min-width:0;">` +
              `<div style="font-size:13px;font-weight:500;color:var(--ink);overflow:hidden;` +
              `text-overflow:ellipsis;white-space:nowrap;">${escTxt(r.name)}</div>` +
              `<div style="font-size:11.5px;margin-top:2px;color:${dead ? 'var(--danger)' : 'var(--n-500)'};">` +
              `${dead ? (RUPTURE_STR[lang] || RUPTURE_STR.fr) : (LOWSTK_STR[lang] || LOWSTK_STR.fr)(LOW_STOCK_SEUIL)}</div>` +
              `</div>` +
              `<div style="font-family:var(--mono);font-size:15px;font-weight:600;` +
              `color:${dead ? 'var(--danger)' : 'var(--ink)'};">${r.stock}</div>` +
              `</div>`;
          }).join('');
        return;
      }
      el['inner' + 'HTML'] =
        `<div class="block-head" style="margin-bottom:14px;"><div>` +
        `<div class="t">${t.title}</div></div></div>` +
        `<div style="padding:20px 4px 8px;text-align:center;">` +
        `<div style="font-size:13.5px;font-weight:600;color:var(--ink);">${t.head}</div>` +
        `<div style="font-size:12px;color:var(--n-500);margin-top:6px;line-height:1.5;">${t.msg}</div>` +
        `</div>`;
    } else if (el['inner' + 'HTML'] !== _stockOrig) {
      el['inner' + 'HTML'] = _stockOrig;
    }
  }

  /* ═══════════════ RENDER: TIMELINE WEEK TOTAL ═══════════════ */

  function renderTimeline() {
    const effective = effRange();
    const totalEl = document.querySelector('[data-timeline-week-total]');
    if (!totalEl) return;
    /* Le repli `|| timelineWeekTotalByVenue.cafeAtlas` servait le total du CAFÉ
     * ATLAS à tout commerçant absent de cette table — c'est-à-dire à tous les
     * vrais. Ce n'était pas un état vide, c'était le chiffre d'affaires de
     * quelqu'un d'autre affiché comme le sien. Une venue réelle additionne ses
     * propres ventes ; le tilde disparaît, ce total-là est exact. */
    if (ownData()) {
      totalEl.textContent = `${frInt(realSalesTotals(effective).revenue)} MAD`;
      return;
    }
    const total = vData(timelineWeekTotalByVenue, currentRange);
    if (total) totalEl.textContent = total;
  }

  /* ═══════════════ RENDER: HEALTH SCORE ═══════════════ */

  function renderHealth() {
    const lang = getLang();
    const card = document.querySelector('[data-health-card]');
    if (card && _healthOrig == null) _healthOrig = card['inner' + 'HTML'];
    if (ownData()) {
      if (card) {
        const t = HEALTH_EMPTY[lang] || HEALTH_EMPTY.fr;
        card['inner' + 'HTML'] =
          `<div class="block-head"><div><div class="t">${t.title}</div></div></div>` +
          emptyBlockBody(t.head, t.msg);
      }
      return;
    }
    if (card && _healthOrig != null && card['inner' + 'HTML'] !== _healthOrig) {
      card['inner' + 'HTML'] = _healthOrig;
    }
    const effective = effRange();
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
    const card = document.querySelector('[data-bench-card]');
    if (card && _benchOrig == null) _benchOrig = card['inner' + 'HTML'];
    /* "#12 sur 147 cafés à Casablanca · top 8 %" is a cohort Kiwi does not
     * have. It is fine in the demo, where every number is openly a rehearsal,
     * and it is not fine anywhere else — an invented peer benchmark is worse
     * than an invented figure, because it reads like data somebody else
     * collected and a merchant reasonably prices against it. The gate was
     * isCustom() alone, which left the real-but-not-custom session showing a
     * ranking among 147 cafés that were never counted. */
    if (ownData() || window.KiwiEnv?.isReal?.()) {
      if (card) {
        const t = BENCH_EMPTY[lang] || BENCH_EMPTY.fr;
        card['inner' + 'HTML'] =
          `<div class="block-head"><div><div class="t">${t.title}</div></div></div>` +
          emptyBlockBody(t.head, t.msg);
      }
      return;
    }
    if (card && _benchOrig != null && card['inner' + 'HTML'] !== _benchOrig) {
      card['inner' + 'HTML'] = _benchOrig;
    }
    const effective = effRange();
    const data = vData(benchByVenue, currentRange);
    if (!data) return;

    // Title + sub vary by venue type (cafés / boutiques / spas similaires)
    const benchLabels = window.KiwiVenue?.getBenchLabels?.() || { title: BENCH_TITLE_FALLBACK[lang] || BENCH_TITLE_FALLBACK.fr, sub: BENCH_SUB.fr[currentRange] };
    const titleEl = document.querySelector('[data-bench-title]');
    if (titleEl) titleEl.textContent = benchLabels.title;
    const subEl = document.querySelector('[data-bench-sub]');
    if (subEl) subEl.textContent = benchLabels.sub || BENCH_SUB[lang]?.[currentRange] || BENCH_SUB.fr[currentRange];

    const rankEl = document.querySelector('[data-bench-rank]');
    if (rankEl) animateNumber(rankEl, parseIntFromEl(rankEl), data.rank, { duration: 650, format: v => `#${Math.round(v)}` });

    // Match the rank-sub wording to the vertical
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const peerLabel = (BENCH_PEER[lang] || BENCH_PEER.fr)[venueType] || (BENCH_PEER[lang] || BENCH_PEER.fr).restaurant;
    const cityLabel = (BENCH_CITY[lang] || BENCH_CITY.fr)[venueType === 'spa' ? 'spa' : 'default'];
    const rankSubEl = document.querySelector('[data-bench-rank-sub]');
    if (rankSubEl) rankSubEl['inner' + 'HTML'] = (BENCH_RANK_SUB[lang] || BENCH_RANK_SUB.fr)(data.total, peerLabel, cityLabel, data.top);

    const comp = document.querySelector('[data-bench-comp]');
    if (comp) {
      comp.innerHTML = data.rows.map((r, i) => `
        <div class="bench-row" style="--i:${i};">
          <div class="lbl">${trStr(r.lbl, BENCH_LBL)}</div>
          <div class="bench-bar">
            <div class="you" style="width: 0%;" data-grow="${r.you}%"></div>
            <div class="peer" style="left: ${r.peer}%;"></div>
          </div>
          <div class="v"${r.warn ? ' style="color: var(--warning);"' : ''}>${r.v}</div>
        </div>
      `).join('');
      growBars(comp);
    }
  }

  /* ═══════════════ RENDER: TOP PRODUCTS ═══════════════ */

  function renderProducts() {
    const lang = getLang();
    const effective = effRange();
    const isCustom = ownData();
    const data = isCustom ? [] : vData(productsByVenue, currentRange);
    const pe = tradeStr('productsEmpty', PRODUCTS_EMPTY[lang] || PRODUCTS_EMPTY.fr);
    const lowEarly = isCustom ? realLowStock() : null;
    const titleEl = document.querySelector('[data-products-title]');
    /* Quand la carte liste ce qu'il faut racheter, elle doit le DIRE. Le titre
     * retombait sur « Top articles » — l'en-tête des meilleures ventes — au-dessus
     * d'une liste de stocks bas, soit exactement le contraire : une barre courte
     * y veut dire « à racheter », pas « se vend mal ». */
    if (titleEl) titleEl.textContent = (lowEarly && lowEarly.rows.length)
      ? (STOCK_TITLE_STR[lang] || STOCK_TITLE_STR.fr)
      : ((isCustom && pe.title) || PRODUCTS_TITLE[lang] || PRODUCTS_TITLE.fr);
    const manageEl = document.querySelector('[data-products-manage]');
    if (manageEl) manageEl.textContent = (isCustom && pe.manage) || PRODUCTS_MANAGE[lang] || PRODUCTS_MANAGE.fr;
    const list = document.querySelector('[data-products-list]');
    const low = lowEarly;
    if (list && low && low.rows.length) {
      /* Le rang est le degré d'urgence : rupture d'abord, puis le stock le plus
       * faible. La barre se lit « ce qu'il reste sur le seuil », donc une barre
       * courte = à racheter — l'inverse des meilleures ventes, où longue = bien. */
      const cap = Math.max(LOW_STOCK_SEUIL, ...low.rows.map((r) => r.stock));
      list.innerHTML = low.rows.map((r, i) => `
        <div class="prod-row" style="--i:${i};">
          <div class="rank${r.stock === 0 ? ' top' : ''}">${i + 1}</div>
          <div class="info">
            <div class="n">${escTxt(r.name)}</div>
            <div class="r">${r.stock === 0 ? RUPTURE_STR[lang] || RUPTURE_STR.fr : (LOWSTK_STR[lang] || LOWSTK_STR.fr)(LOW_STOCK_SEUIL)}</div>
          </div>
          <div class="mini-bar"><div style="width: 0%;" data-grow="${Math.round((r.stock / cap) * 100)}%"></div></div>
          <div class="sales">${r.stock}</div>
        </div>
      `).join('');
      growBars(list);
    } else if (list && low) {
      list.innerHTML = emptyListBody((STOCK_OK_STR[lang] || STOCK_OK_STR.fr)(low.tracked, LOW_STOCK_SEUIL));
    } else if (list && isCustom) {
      list.innerHTML = emptyListBody(pe.msg);
    } else if (list && data) {
      list.innerHTML = data.map((p, i) => `
        <div class="prod-row" style="--i:${i};">
          <div class="rank${i === 0 ? ' top' : ''}">${p.rank}</div>
          <div class="info">
            <div class="n">${p.name}</div>
            <div class="r">${p.sub}</div>
          </div>
          <div class="mini-bar"><div style="width: 0%;" data-grow="${p.bar}%"></div></div>
          <div class="sales">${p.sales}</div>
        </div>
      `).join('');
      growBars(list);
    }
    const sub = document.querySelector('[data-products-sub]');
    if (sub) sub.textContent = (low && low.rows.length)
      ? (STOCK_SUB_STR[lang] || STOCK_SUB_STR.fr)(low.rows.length)
      : (isCustom
        ? pe.sub
        : (PRODUCTS_SUB[lang]?.[currentRange] || PRODUCTS_SUB.fr[currentRange]));
  }

  /* ═══════════════ RENDER: STAFF ═══════════════ */

  function renderStaff() {
    const lang = getLang();
    const effective = effRange();
    const isCustom = ownData();
    const data = isCustom ? [] : vData(staffByVenue, currentRange);
    const se = tradeStr('staffEmpty', STAFF_EMPTY[lang] || STAFF_EMPTY.fr);
    const titleEl = document.querySelector('[data-staff-title]');
    if (titleEl) titleEl.textContent = (isCustom && se.title) || STAFF_TITLE[lang] || STAFF_TITLE.fr;
    const list = document.querySelector('[data-staff-list]');
    /* Une équipe existe dès qu'un membre est saisi côté Équipe — la carte ne peut
     * plus prétendre le contraire. Les heures viennent de la grille de Paie, donc
     * « en service » veut dire ici exactement ce qu'il veut dire là-bas.
     * Le montant reste « — » : Kiwi ne rattache pas encore une vente à un
     * vendeur, et inventer un chiffre par personne serait pire que le tiret. */
    const roster = isCustom ? realRoster() : null;
    if (list && roster && roster.length) {
      list.innerHTML = roster.map((s, i) => {
        const on = s.hoursToday > 0;
        return `
        <div class="staff-row" style="--i:${i};">
          <div class="av${on ? '' : ' offline'}"${on ? '' : ' style="background: var(--n-400);"'}>${escTxt(s.avatar)}</div>
          <div class="info">
            <div class="n">${escTxt(s.name)}</div>
            <div class="role">${escTxt(s.role)}</div>
          </div>
          <div class="shift"${on ? '' : ' style="color: var(--n-400);"'}>${on ? fmtHeures(s.hoursToday) : '—'}</div>
          <div class="tx-n" style="color: var(--n-400);">—</div>
        </div>`;
      }).join('');
    } else if (list && isCustom) {
      list.innerHTML = emptyListBody(se.msg);
    } else if (list && data) {
      list.innerHTML = data.map((s, i) => `
        <div class="staff-row" style="--i:${i};">
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
    if (sub) sub.textContent = (roster && roster.length)
      ? (STAFF_ONDUTY_STR[lang] || STAFF_ONDUTY_STR.fr)(roster.filter((s) => s.hoursToday > 0).length, roster.length)
      : (isCustom
        ? se.sub
        : (STAFF_SUB[lang]?.[currentRange] || STAFF_SUB.fr[currentRange]));
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
      renderHeroAi();
      renderGoal();
      renderHeatmap();
      renderKpiBand();
      renderRevChart();
      renderMix();
      renderFeed();
      renderSettle();
      renderEvening();
      renderStock();
      renderHealth();
      renderBench();
      renderInteg();
      renderProducts();
      renderStaff();
      return r;
    };
    api.__drWrapped = true;
  }

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
    new Intl.DateTimeFormat(LOCALES[lang] || LOCALES.fr, { month: style }).format(d);
  const monthLabel = (y, m, lang) => capFirst(new Intl.DateTimeFormat(
    LOCALES[lang] || LOCALES.fr, { month: 'long', year: 'numeric' }).format(new Date(y, m, 1)));

  /* Human span — "14 mai 2026" · "1 – 14 mai 2026" · "28 avr. – 3 mai 2026"
   * · "28 déc. 2025 – 4 janv. 2026". */
  function fmtHumanRange(s, e, lang) {
    if (sameDay(s, e)) return `${s.getDate()} ${monthOnly(s, lang, 'long')} ${s.getFullYear()}`;
    const sameYear = s.getFullYear() === e.getFullYear();
    if (sameYear && s.getMonth() === e.getMonth())
      return `${s.getDate()} – ${e.getDate()} ${monthOnly(e, lang, 'long')} ${e.getFullYear()}`;
    if (sameYear)
      return `${s.getDate()} ${monthOnly(s, lang, 'short')} – ${e.getDate()} ${monthOnly(e, lang, 'short')} ${e.getFullYear()}`;
    return `${s.getDate()} ${monthOnly(s, lang, 'short')} ${s.getFullYear()} – `
         + `${e.getDate()} ${monthOnly(e, lang, 'short')} ${e.getFullYear()}`;
  }

  let dpEl = null, dpOutside = null, dpKey = null;

  function closeCustomPicker() {
    if (!dpEl) return;
    const pop = dpEl;
    dpEl = null;
    pop.classList.remove('open');
    if (dpOutside) document.removeEventListener('mousedown', dpOutside);
    if (dpKey) document.removeEventListener('keydown', dpKey);
    dpOutside = dpKey = null;
    const pill = document.querySelector('.dr-pill-custom');
    if (pill) pill.setAttribute('aria-expanded', 'false');
    let gone = false;
    const drop = () => { if (gone) return; gone = true; pop.remove(); };
    pop.addEventListener('transitionend', drop, { once: true });
    setTimeout(drop, 300);
  }

  function openCustomPicker() {
    if (dpEl) { closeCustomPicker(); return; }          // second click → toggle shut
    const control = document.querySelector('.dr-control');
    if (!control) return;
    const lang = getLang();
    const S = PICKER_STR[lang] || PICKER_STR.fr;
    const today = startOfDay(new Date());
    const monIdx = (y, m) => y * 12 + m;
    const maxLeft = monIdx(today.getFullYear(), today.getMonth()) - 1;  // right pane never future

    let selStart = customRange ? startOfDay(customRange.start) : null;
    let selEnd   = customRange ? startOfDay(customRange.end)   : null;
    let hoverD   = null;
    let view = selEnd
      ? shiftMonth(selEnd.getFullYear(), selEnd.getMonth(), -1)
      : shiftMonth(today.getFullYear(), today.getMonth(), -1);

    const pop = document.createElement('div');
    pop.className = 'dr-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', S.title);
    if (lang === 'ar') pop.setAttribute('dir', 'rtl');
    dpEl = pop;
    control.appendChild(pop);

    const presets = [['p7', S.p7], ['p14', S.p14], ['p30', S.p30],
                     ['pMonth', S.pMonth], ['pLast', S.pLast], ['p90', S.p90]];
    function presetRange(key) {
      if (key === 'p7')  return [addDays(today, -6), today];
      if (key === 'p14') return [addDays(today, -13), today];
      if (key === 'p30') return [addDays(today, -29), today];
      if (key === 'p90') return [addDays(today, -89), today];
      if (key === 'pMonth') return [new Date(today.getFullYear(), today.getMonth(), 1), today];
      if (key === 'pLast')  return [new Date(today.getFullYear(), today.getMonth() - 1, 1),
                                    new Date(today.getFullYear(), today.getMonth(), 0)];
      return null;
    }
    function activePreset() {
      if (!selStart || !selEnd) return null;
      for (let i = 0; i < presets.length; i++) {
        const r = presetRange(presets[i][0]);
        if (r && sameDay(startOfDay(r[0]), selStart) && sameDay(startOfDay(r[1]), selEnd))
          return presets[i][0];
      }
      return null;
    }
    const chev = (dir) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="'
      + (dir === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6') + '"/></svg>';

    function weekdayRow() {
      const mon = addDays(today, -((today.getDay() + 6) % 7));
      let h = '';
      for (let i = 0; i < 7; i++) {
        const wd = new Intl.DateTimeFormat(LOCALES[lang] || LOCALES.fr, { weekday: 'short' })
          .format(addDays(mon, i)).replace('.', '');
        h += `<span class="drp-wd">${dpEsc(wd)}</span>`;
      }
      return h;
    }
    function monthGrid(y, m) {
      const lead = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span class="drp-day drp-empty"></span>';
      for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d);
        const future = ymdInt(date) > ymdInt(today);
        let cls = 'drp-day';
        if (future) cls += ' is-disabled';
        if (sameDay(date, today)) cls += ' is-today';
        cells += `<button type="button" class="${cls}" data-day="${dateToIso(date)}"`
          + `${future ? ' disabled' : ''}><span class="drp-dn">${d}</span></button>`;
      }
      return cells;
    }
    function monthCard(y, m, side) {
      const canNext = monIdx(view.y, view.m) < maxLeft;
      const lBtn = side === 'left'
        ? `<button type="button" class="drp-nav" data-nav="prev" aria-label="←">${chev('prev')}</button>`
        : '<span class="drp-nav-gap"></span>';
      const rBtn = side === 'right'
        ? `<button type="button" class="drp-nav" data-nav="next" aria-label="→"${canNext ? '' : ' disabled'}>${chev('next')}</button>`
        : '<span class="drp-nav-gap"></span>';
      return `<div class="drp-month"><div class="drp-mhead">${lBtn}`
        + `<span class="drp-mname">${dpEsc(monthLabel(y, m, lang))}</span>${rBtn}</div>`
        + `<div class="drp-wdrow">${weekdayRow()}</div>`
        + `<div class="drp-grid">${monthGrid(y, m)}</div></div>`;
    }

    function decorate() {
      let lo = selStart, hi = selEnd;
      if (selStart && !selEnd && hoverD) {
        lo = ymdInt(hoverD) < ymdInt(selStart) ? hoverD : selStart;
        hi = ymdInt(hoverD) < ymdInt(selStart) ? selStart : hoverD;
      }
      const a = lo ? ymdInt(lo) : null;
      const b = hi ? ymdInt(hi) : null;
      pop.querySelectorAll('.drp-day').forEach((btn) => {
        btn.classList.remove('in-range', 'is-start', 'is-end', 'is-edge', 'is-solo');
        if (!btn.dataset.day) return;
        const v = ymdInt(isoToDate(btn.dataset.day));
        if (a != null && b != null) {
          if (a === b) { if (v === a) btn.classList.add('is-edge', 'is-solo'); }
          else if (v === a) btn.classList.add('is-start', 'is-edge');
          else if (v === b) btn.classList.add('is-end', 'is-edge');
          else if (v > a && v < b) btn.classList.add('in-range');
        } else if (a != null && v === a) {
          btn.classList.add('is-edge', 'is-solo');
        }
      });
      const ro = pop.querySelector('[data-drp-readout]');
      if (ro) {
        if (lo && hi) ro.textContent = fmtHumanRange(lo, hi, lang);
        else if (selStart) ro.textContent = fmtHumanRange(selStart, selStart, lang);
        else ro.textContent = '—';
        ro.classList.toggle('is-set', !!(lo || selStart));
      }
      const hint = pop.querySelector('[data-drp-hint]');
      if (hint) {
        if (lo && hi) {
          const n = spanDays(lo, hi);
          hint.innerHTML = `<b>${n}</b> ${dpEsc(n > 1 ? S.days : S.day)}`;
        } else {
          hint.textContent = selStart ? S.hintEnd : S.hintStart;
        }
      }
      const apply = pop.querySelector('[data-drp-apply]');
      if (apply) apply.disabled = !(selStart && selEnd);
      const ap = activePreset();
      pop.querySelectorAll('.drp-preset').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.preset === ap);
      });
    }

    function render() {
      const r = shiftMonth(view.y, view.m, 1);
      pop.innerHTML =
        `<div class="drp-head"><div><div class="drp-eyebrow">${dpEsc(S.title)}</div>`
        + `<div class="drp-readout" data-drp-readout>—</div></div>`
        + `<button type="button" class="drp-x" data-drp-cancel aria-label="${dpEsc(S.cancel)}">`
        + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" `
        + `stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
        + `<div class="drp-body"><div class="drp-presets">`
        + `<div class="drp-presets-lbl">${dpEsc(S.presets)}</div>`
        + presets.map(([k, lbl]) =>
            `<button type="button" class="drp-preset" data-preset="${k}">${dpEsc(lbl)}</button>`).join('')
        + `</div><div class="drp-cal"><div class="drp-months">`
        + monthCard(view.y, view.m, 'left') + monthCard(r.y, r.m, 'right')
        + `</div></div></div>`
        + `<div class="drp-foot"><div class="drp-hint" data-drp-hint></div>`
        + `<div class="drp-acts">`
        + `<button type="button" class="drp-btn drp-btn-ghost" data-drp-cancel>${dpEsc(S.cancel)}</button>`
        + `<button type="button" class="drp-btn drp-btn-go" data-drp-apply>${dpEsc(S.apply)}</button>`
        + `</div></div>`;
      decorate();
    }

    function pickDay(iso) {
      const d = isoToDate(iso);
      if (!d) return;
      if (!selStart || (selStart && selEnd)) { selStart = d; selEnd = null; }
      else if (ymdInt(d) < ymdInt(selStart)) { selEnd = selStart; selStart = d; }
      else { selEnd = d; }
      hoverD = null;
      render();
    }
    function applyPreset(key) {
      const r = presetRange(key);
      if (!r) return;
      selStart = startOfDay(r[0]);
      selEnd = startOfDay(r[1]);
      hoverD = null;
      view = shiftMonth(selEnd.getFullYear(), selEnd.getMonth(), -1);
      render();
    }
    function shiftView(n) {
      const nv = shiftMonth(view.y, view.m, n);
      if (n > 0 && monIdx(nv.y, nv.m) > maxLeft) return;
      view = nv;
      render();
    }

    pop.addEventListener('click', (e) => {
      const day = e.target.closest('.drp-day');
      if (day && day.dataset.day && !day.disabled) { pickDay(day.dataset.day); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) { shiftView(nav.dataset.nav === 'next' ? 1 : -1); return; }
      const pre = e.target.closest('[data-preset]');
      if (pre) { applyPreset(pre.dataset.preset); return; }
      if (e.target.closest('[data-drp-cancel]')) { closeCustomPicker(); return; }
      if (e.target.closest('[data-drp-apply]') && selStart && selEnd) {
        commitCustomRange(selStart, selEnd);
        closeCustomPicker();
      }
    });
    pop.addEventListener('mouseover', (e) => {
      if (!selStart || selEnd) return;
      const day = e.target.closest('.drp-day');
      const nd = (day && day.dataset.day && !day.disabled) ? isoToDate(day.dataset.day) : null;
      if ((nd ? ymdInt(nd) : 0) === (hoverD ? ymdInt(hoverD) : 0)) return;
      hoverD = nd;
      decorate();
    });
    pop.addEventListener('mouseleave', () => {
      if (selStart && !selEnd && hoverD) { hoverD = null; decorate(); }
    });

    render();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (dpEl === pop) pop.classList.add('open');
    }));

    dpOutside = (e) => {
      if (pop.contains(e.target)) return;
      if (e.target.closest('.dr-pill-custom')) return;   // the pill's own click toggles
      closeCustomPicker();
    };
    dpKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeCustomPicker(); } };
    setTimeout(() => {
      if (dpEl !== pop) return;
      document.addEventListener('mousedown', dpOutside);
      document.addEventListener('keydown', dpKey);
    }, 0);

    const pill = document.querySelector('.dr-pill-custom');
    if (pill) pill.setAttribute('aria-expanded', 'true');
  }

  function registerHandler() {
    const tryReg = () => {
      if (window.Kiwi?.handlers) {
        window.Kiwi.handlers['date-range'] = onAction;
        window.Kiwi.handlers['open-date-picker'] = openCustomPicker;
        window.Kiwi.handlers['rev-compare'] = onCompareToggle;
        window.Kiwi.handlers['customize-kpi'] = openKpiCustomizer;
        window.Kiwi.handlers['hero-toggle-chart'] = () => {
          const hero = document.querySelector('.hero-today');
          if (!hero) return;
          const toChart = !hero.classList.contains('chart-view');
          hero.classList.toggle('chart-view', toChart);
          const btn = hero.querySelector('.hero-view-toggle');
          if (btn) btn.setAttribute('aria-pressed', String(toChart));
          try { localStorage.setItem('kiwiHeroView', toChart ? 'chart' : 'today'); } catch (_) {}
          if (toChart) {
            // Pane was display:none — SVG had no measurable width. Reset the
            // render cache so the chart re-measures and replays its draw-in.
            const svg = document.querySelector('[data-rev-svg]');
            if (svg) { svg.dataset.lastW = '0'; svg.dataset.lastRange = ''; }
            renderRevChart();
          }
        };
        window.Kiwi.handlers['hh-ai-glovo'] = () => {
          const gl = GLOVO_TOAST[getLang()] || GLOVO_TOAST.fr;
          window.Kiwi?.toast?.(gl.t, { type: 'info', desc: gl.d });
        };
        return;
      }
      setTimeout(tryReg, 30);
    };
    tryReg();
  }

  function init() {
    if (!/dashboard(?:\.html)?(?:$|\/)/.test(location.pathname)) return;
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    try { customRange = parseCustom(localStorage.getItem(CUSTOM_KEY)); } catch (_) {}
    currentRange = VALID.includes(stored) ? stored : DEFAULT_RANGE;
    // A stored 'personnalise' only stands if its date pair survived too.
    if (currentRange === 'personnalise' && !customRange) currentRange = DEFAULT_RANGE;
    try { showComparison = localStorage.getItem(CMP_KEY) === '1'; } catch (_) {}

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
          try {
            renderHero();
            renderGoal();
            renderKpiBand();
            renderRevChart();
            renderHeatmap();
            renderFeed();
          } finally {
            liveTickInProgress = false;
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
          renderGoal();
          renderKpiBand();
          renderRevChart();
          renderFeed();
          renderMix();   // la ventilation par mode de paiement bouge avec chaque vente
        });
        return;
      }
      setTimeout(subSales, 30);
    };
    subSales();

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

    // The window-resize listener above only catches VIEWPORT changes. It misses
    // every layout change that leaves the window alone — a skin adapter moving
    // the card into a new grid, the sidebar collapsing, a late webfont swap.
    // Those re-lay-out the SVG after renderRevChart() has already measured it,
    // and the viewBox stays pinned to the pre-layout box. Observe the element
    // itself so the coordinate space always matches the painted box.
    const revSvgEl = document.querySelector('[data-rev-svg]');
    if (revSvgEl && typeof ResizeObserver === 'function') {
      let roTimer = null;
      let roW = 0;
      let roH = 0;
      const ro = new ResizeObserver(() => {
        const w = Math.round(revSvgEl.clientWidth);
        const h = Math.round(revSvgEl.clientHeight);
        // Re-render only on a real size change. renderRevChart() does not
        // resize its own SVG, so this cannot feed back into itself.
        if (Math.abs(w - roW) < 2 && Math.abs(h - roH) < 2) return;
        roW = w; roH = h;
        clearTimeout(roTimer);
        roTimer = setTimeout(renderRevChart, 90);
      });
      ro.observe(revSvgEl);
    }

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

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
  function tickLiveRevenue({ amount = 0, tip = 0 } = {}) {
    // The mutation below belongs exclusively to the pitch-demo tables.
    if (ownData()) return;
    // Demo clock owns deterministic ticking on aujourdhui — skip random ticks.
    if (window.KiwiDemoClock?.isActive?.()) return;
    // Live ticks only make sense on "today" — skip on historical ranges.
    const r = effRange();
    if (r !== 'aujourdhui') return;
    // And only mutate the currently active venue's data (each venue has its own).
    const v = getCurrentVenue();
    const hero = heroDataByVenue[v]?.aujourdhui;
    const goal = goalByVenue[v]?.aujourdhui;
    const kpi  = kpiByVenue[v]?.aujourdhui;
    if (!hero || !goal || !kpi) return;

    hero.amount += amount;
    goal.current = hero.amount;

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
  window.KiwiDateRange = {
    getDateRange, setDateRange, subscribe, tickLiveRevenue,
    getShowComparison, setShowComparison,
    bounds: (range) => rangeBounds(range || effRange()),
  };
})();
