/* ═══════════════════════════════════════════════════════════════════════
 * Kiwi · assets/finance.js
 * ───────────────────────────────────────────────────────────────────────
 * Full-page financial visibility (no banking — read-only insight).
 *
 *   1. Real-time P&L · today's revenue, ingredient cost, labour cost,
 *      gross margin — same row every owner should know off by heart.
 *   2. Budget vs actual · monthly revenue target + month-to-date
 *      progress, projected landing.
 *   3. Break-even · fixed costs / month + minimum revenue per working
 *      day to cover them.
 *   4. Profitability per service · lunch / dinner / weekend
 *      revenue, food cost, labour cost, margin %.
 *   5. Pricing suggestions · AI cards synthesised from KiwiRecipes
 *      variance data + menu mix.
 *
 * Pattern mirrors assets/stock.js and assets/team.js — body.page-finance
 * swaps the dashboard for a finance root, sidebar item stays highlighted
 * (Kiwi.setActivePage), all interactions in-memory, resets on refresh.
 *
 * Data sources (with sensible per-venue fallbacks when an upstream is
 *   unavailable):
 *   · window.KiwiVenue     · revenue per period (today/MTD)
 *   · window.KiwiRecipes   · food-cost % + variance per dish
 *   · TEAM block in venues.js · hours × hourly rate → labour cost
 *   · FIXED_COSTS / MONTHLY_TARGET / SERVICE_SPLIT inlined below
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ──────────────────────────── i18n ──────────────────────────── */
  const STR = {
    fr: {
      breadcrumb: 'Marges & budget',
      pageTitle: 'Marges & budget',
      pageSub: (n) => `Vos résultats à jour · ${n}`,
      // P&L
      pnlEyebrow: 'Résultat aujourd\'hui',
      pnlUpdated: (h) => `mis à jour à ${h}`,
      pnlRevenue: 'Revenu',
      pnlFood: 'Coût ingrédients',
      pnlLabor: 'Coût personnel',
      pnlMargin: 'Marge brute',
      pnlKeep: (m) => `Soit <b>${m} MAD</b> que vous gardez aujourd'hui, avant loyer, énergie et fournitures.`,
      pnlOk: 'conforme',
      pnlWatch: 'à surveiller',
      pnlBad: 'élevé',
      // Budget
      budgetTitle: 'Budget du mois',
      budgetTarget: 'Cible',
      budgetMtd: 'Réalisé',
      budgetLeft: (d, mad, perDay) => `Reste <b>${mad} MAD</b> en ${d} jour${d > 1 ? 's' : ''} (~<b>${perDay} MAD/jour</b>)`,
      budgetForecast: (mad) => `À ce rythme → fin de mois ≈ <b>${mad} MAD</b>`,
      budgetWillMiss: (mad) => `Vous risquez de manquer la cible de <b>${mad} MAD</b>.`,
      budgetWillBeat: (mad) => `Vous êtes parti·e pour la dépasser de <b>${mad} MAD</b>.`,
      budgetOnTrack: 'Vous êtes pile sur la trajectoire.',
      // Break-even
      bevTitle: 'Seuil de rentabilité',
      bevSub: 'Combien il faut vendre chaque jour pour couvrir vos charges fixes',
      bevRent: 'Loyer',
      bevSalaries: 'Salaires fixes',
      bevUtilities: 'Énergie',
      bevOther: 'Autres charges',
      bevTotal: 'Charges fixes / mois',
      bevDaily: 'Seuil quotidien',
      bevDailySub: (n) => `pour rester rentable (sur ${n} jours ouvrés)`,
      bevAboveBy: (n) => `Aujourd'hui vous êtes <b>${n} %</b> au-dessus du seuil.`,
      bevBelowBy: (n) => `Aujourd'hui vous êtes <b>${n} %</b> en dessous du seuil, la journée doit être rattrapée.`,
      // Service
      serviceTitle: 'Rentabilité par service',
      serviceSub: 'Où se cache vraiment votre marge',
      serviceLunch: 'Midi (12h–15h)',
      serviceDinner: 'Soir (19h–23h)',
      serviceWeekend: 'Brunch & week-end',
      serviceMarginCol: 'Marge nette',
      serviceRevCol: 'CA estimé',
      serviceAi: (best, worst, gap) => `Le service <b>${best}</b> est votre plus rentable. <b>${worst}</b> a une marge inférieure de <b>${gap} pts</b>, examinez le ratio personnel/couverts.`,
      // Pricing
      priceTitle: 'Recommandations de prix',
      priceSub: 'Décisions data-driven plutôt qu\'à l\'intuition',
      priceAiEyebrow: 'Kiwi AI · prix',
      priceFoot: 'Ces suggestions reposent sur l\'évolution réelle de vos coûts matière + votre mix de ventes des 30 derniers jours.',
      priceAbody: (v, m) => `Le coût matière a glissé de <b>+${v} %</b> sur 30 jours, votre marge est tombée à <b>${m} %</b>.`,
      priceAaction: (d, nm, imp) => `+${d} MAD restaure votre marge à <b>${nm} %</b>. Impact CA estimé : <b>+${imp} MAD/mois</b>.`,
      priceBbody: (m) => `Marge à <b>${m} %</b> (la plus haute de votre menu), demande très stable. Boisson la plus vendue de la catégorie.`,
      priceBaction: (d, p, u, imp) => `+${d} MAD = <b>+${p} %</b> sur ${u} unités/mois. Impact CA : <b>+${imp} MAD/mois</b>, risque demande nul.`,
      priceCpromo: ' (promo test)',
      priceCbody: (u, m) => `Plat sous-vendu (<b>${u} unités/mois</b>) malgré une bonne marge à <b>${m} %</b>. Le prix actuel décourage l'essai.`,
      priceCaction: (np, old, nw) => `Tester <b>${np} MAD</b> pendant 2 semaines. Si le volume monte de +40 %, le CA mensuel sur ce plat passe de <b>${old}</b> à <b>${nw} MAD</b>.`,
      priceFbTitle: 'Complétez vos recettes pour activer les suggestions de prix',
      priceFbBody: `Une fois que Kiwi connaît la composition exacte de chaque plat, l'algorithme peut détecter dérives de coût matière, marges anormales, et volumes décevants.`,
      priceFbAction: 'Direction : Menu › Recettes → ouvrir un plat → ajouter ses ingrédients.',
      // Footer note
      noteUpdatePolicy: 'Toutes les valeurs sont calculées à partir des ventes du jour, du stock et de votre effectif. Aucune écriture comptable n\'est produite.',
    },
    en: {
      breadcrumb: 'Margins & budget',
      pageTitle: 'Margins & budget',
      pageSub: (n) => `Live financials · ${n}`,
      pnlEyebrow: 'Today\'s result',
      pnlUpdated: (h) => `updated at ${h}`,
      pnlRevenue: 'Revenue',
      pnlFood: 'Ingredient cost',
      pnlLabor: 'Labour cost',
      pnlMargin: 'Gross margin',
      pnlKeep: (m) => `That's <b>${m} MAD</b> you keep today, before rent, utilities and supplies.`,
      pnlOk: 'on target',
      pnlWatch: 'watch',
      pnlBad: 'high',
      budgetTitle: 'Monthly budget',
      budgetTarget: 'Target',
      budgetMtd: 'Actual',
      budgetLeft: (d, mad, perDay) => `<b>${mad} MAD</b> left over ${d} day${d > 1 ? 's' : ''} (~<b>${perDay} MAD/day</b>)`,
      budgetForecast: (mad) => `At this pace → month-end ≈ <b>${mad} MAD</b>`,
      budgetWillMiss: (mad) => `You may miss the target by <b>${mad} MAD</b>.`,
      budgetWillBeat: (mad) => `You are on track to beat it by <b>${mad} MAD</b>.`,
      budgetOnTrack: 'You are right on track.',
      bevTitle: 'Break-even',
      bevSub: 'How much you must sell each day to cover fixed costs',
      bevRent: 'Rent',
      bevSalaries: 'Fixed salaries',
      bevUtilities: 'Utilities',
      bevOther: 'Other',
      bevTotal: 'Fixed costs / month',
      bevDaily: 'Daily break-even',
      bevDailySub: (n) => `to stay profitable (over ${n} working days)`,
      bevAboveBy: (n) => `Today you are <b>${n} %</b> above break-even.`,
      bevBelowBy: (n) => `Today you are <b>${n} %</b> below break-even, the day needs catching up.`,
      serviceTitle: 'Profit per service',
      serviceSub: 'Where your margin actually hides',
      serviceLunch: 'Lunch (12pm–3pm)',
      serviceDinner: 'Dinner (7pm–11pm)',
      serviceWeekend: 'Brunch & weekend',
      serviceMarginCol: 'Net margin',
      serviceRevCol: 'Est. revenue',
      serviceAi: (best, worst, gap) => `<b>${best}</b> is your most profitable service. <b>${worst}</b> trails by <b>${gap} pts</b>, review labour-to-covers ratio.`,
      priceTitle: 'Pricing recommendations',
      priceSub: 'Data-driven price moves, not gut feelings',
      priceAiEyebrow: 'Kiwi AI · pricing',
      priceFoot: 'Suggestions are based on actual food-cost drift + your sales mix over the last 30 days.',
      priceAbody: (v, m) => `Food cost slipped <b>+${v} %</b> over 30 days, your margin fell to <b>${m} %</b>.`,
      priceAaction: (d, nm, imp) => `+${d} MAD restores your margin to <b>${nm} %</b>. Est. revenue impact: <b>+${imp} MAD/mo</b>.`,
      priceBbody: (m) => `Margin at <b>${m} %</b> (the highest on your menu), very stable demand. Best-selling drink in its category.`,
      priceBaction: (d, p, u, imp) => `+${d} MAD = <b>+${p} %</b> on ${u} units/mo. Revenue impact: <b>+${imp} MAD/mo</b>, zero demand risk.`,
      priceCpromo: ' (promo test)',
      priceCbody: (u, m) => `Under-sold dish (<b>${u} units/mo</b>) despite a healthy <b>${m} %</b> margin. The current price discourages trial.`,
      priceCaction: (np, old, nw) => `Test <b>${np} MAD</b> for 2 weeks. If volume rises +40 %, this dish's monthly revenue goes from <b>${old}</b> to <b>${nw} MAD</b>.`,
      priceFbTitle: 'Complete your recipes to unlock price suggestions',
      priceFbBody: `Once Kiwi knows the exact composition of each dish, the algorithm can flag food-cost drift, abnormal margins, and disappointing volumes.`,
      priceFbAction: 'Go to: Menu › Recipes → open a dish → add its ingredients.',
      noteUpdatePolicy: 'All values are computed from today\'s sales, stock and headcount. No accounting entries are produced.',
    },
    ar: {
      breadcrumb: 'الهامش والميزانية',
      pageTitle: 'الهامش والميزانية',
      pageSub: (n) => `النتائج المالية مباشرة · ${n}`,
      pnlEyebrow: 'نتيجة اليوم',
      pnlUpdated: (h) => `حُدِّثت ${h}`,
      pnlRevenue: 'الإيرادات',
      pnlFood: 'تكلفة المكونات',
      pnlLabor: 'تكلفة العمالة',
      pnlMargin: 'الهامش الإجمالي',
      pnlKeep: (m) => `أي <b>${m} درهم</b> تحتفظ بها اليوم، قبل الإيجار والطاقة والمستلزمات.`,
      pnlOk: 'مطابق',
      pnlWatch: 'يحتاج مراقبة',
      pnlBad: 'مرتفع',
      budgetTitle: 'ميزانية الشهر',
      budgetTarget: 'الهدف',
      budgetMtd: 'المُحقق',
      budgetLeft: (d, mad, perDay) => `يبقى <b>${mad} درهم</b> في ${d} يوم (~<b>${perDay} درهم/يوم</b>)`,
      budgetForecast: (mad) => `بهذا الإيقاع → نهاية الشهر ≈ <b>${mad} درهم</b>`,
      budgetWillMiss: (mad) => `قد تفوتك الهدف بـ <b>${mad} درهم</b>.`,
      budgetWillBeat: (mad) => `أنت في طريقك لتجاوز الهدف بـ <b>${mad} درهم</b>.`,
      budgetOnTrack: 'أنت على المسار الصحيح تمامًا.',
      bevTitle: 'نقطة التعادل',
      bevSub: 'كم يجب أن تبيع يوميًا لتغطية المصاريف الثابتة',
      bevRent: 'الإيجار',
      bevSalaries: 'الرواتب الثابتة',
      bevUtilities: 'الطاقة',
      bevOther: 'مصاريف أخرى',
      bevTotal: 'المصاريف الثابتة / شهر',
      bevDaily: 'نقطة التعادل اليومية',
      bevDailySub: (n) => `للحفاظ على الربحية (على ${n} يومًا)`,
      bevAboveBy: (n) => `اليوم أنت أعلى من نقطة التعادل بـ <b>${n} %</b>.`,
      bevBelowBy: (n) => `اليوم أنت أدنى من نقطة التعادل بـ <b>${n} %</b>، يجب تعويض اليوم.`,
      serviceTitle: 'الربحية حسب الخدمة',
      serviceSub: 'أين يختبئ هامشك فعلاً',
      serviceLunch: 'خدمة الغداء',
      serviceDinner: 'خدمة العشاء',
      serviceWeekend: 'الفطور وعطلة نهاية الأسبوع',
      serviceMarginCol: 'الهامش الصافي',
      serviceRevCol: 'الإيرادات المُقدَّرة',
      serviceAi: (best, worst, gap) => `<b>${best}</b> هي الأكثر ربحية. <b>${worst}</b> أقل بـ <b>${gap}</b> نقطة، راجع نسبة الموظفين/الزبائن.`,
      priceTitle: 'توصيات التسعير',
      priceSub: 'قرارات مبنية على البيانات لا على الحدس',
      priceAiEyebrow: 'كيوي AI · الأسعار',
      priceFoot: 'هذه الاقتراحات مبنية على تطور تكاليف المكونات + مزيج المبيعات خلال 30 يومًا.',
      priceAbody: (v, m) => `ارتفعت تكلفة المكوّنات بـ <b>+${v} %</b> خلال 30 يومًا، وتراجع هامشك إلى <b>${m} %</b>.`,
      priceAaction: (d, nm, imp) => `<b>+${d} درهم</b> يُعيد هامشك إلى <b>${nm} %</b>. الأثر المُقدَّر على رقم المعاملات: <b>+${imp} درهم/شهر</b>.`,
      priceBbody: (m) => `هامش <b>${m} %</b> (الأعلى في قائمتك) والطلب مستقرّ جدًا. المشروب الأكثر مبيعًا في فئته.`,
      priceBaction: (d, p, u, imp) => `<b>+${d} درهم</b> = <b>+${p} %</b> على ${u} وحدة/شهر. الأثر على رقم المعاملات: <b>+${imp} درهم/شهر</b>، دون أي خطر على الطلب.`,
      priceCpromo: ' (تجربة ترويجية)',
      priceCbody: (u, m) => `طبق ضعيف المبيعات (<b>${u} وحدة/شهر</b>) رغم هامش جيّد بلغ <b>${m} %</b>. السعر الحالي يُثبّط تجربته.`,
      priceCaction: (np, old, nw) => `جرّب <b>${np} درهم</b> لمدة أسبوعين. إذا ارتفع الحجم بـ +40%، ينتقل رقم معاملات هذا الطبق من <b>${old}</b> إلى <b>${nw} درهم</b>.`,
      priceFbTitle: 'أكمل وصفاتك لتفعيل اقتراحات التسعير',
      priceFbBody: `بمجرد أن يعرف كيوي التركيبة الدقيقة لكل طبق، تستطيع الخوارزمية رصد انحرافات تكلفة المكوّنات والهوامش غير الطبيعية والكميات المخيّبة.`,
      priceFbAction: 'الوجهة: القائمة › الوصفات → افتح طبقًا → أضِف مكوّناته.',
      noteUpdatePolicy: 'جميع القيم محسوبة من مبيعات اليوم والمخزون وعدد الموظفين. لا يتم إنتاج أي قيود محاسبية.',
    },
  };

  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const t = (k, ...args) => {
    const dict = STR[lang()] || STR.fr;
    const v = dict[k];
    return typeof v === 'function' ? v(...args) : (v == null ? k : v);
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtMad = (n) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} MAD`;
  const fmtInt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  /* locPeriod() et ses tables de mois vivaient ici pour traduire « Mai 2026 » et
     « 30 juin 2026 » sur la déclaration de TVA. La déclaration est partie
     (section 6), et rien d'autre n'affichait de mois : elles partent avec elle
     plutôt que de rester à attendre un appelant qui n'existe plus. */
  const fmtPct = (n, d = 1) => `${(n).toFixed(d)} %`;

  /* ─────────────── Per-venue demo data (in MAD) ─────────────── */
  /* Fixed monthly costs — rent, fixed salaries (cuisine + permanent staff),
   * utilities (electricity, water, gas), other (cleaning, marketing, etc.).
   * Real-world numbers for an established Tangier/Casablanca venue. */
  const FIXED_COSTS = {
    cafeAtlas:     { rent: 22000, salaries: 78000, utilities: 9500,  other: 3500 },
    maisonMansour: { rent: 18000, salaries: 42000, utilities: 6500,  other: 2200 },
    spaBahia:      { rent: 32000, salaries: 95000, utilities: 12000, other: 5800 },
  };
  /* Monthly revenue ambition — what the owner targets in MAD/month. */
  const MONTHLY_TARGET = {
    cafeAtlas:     825000,
    maisonMansour: 365000,
    spaBahia:      275000,
  };
  /* Working days in the demo month (used for break-even daily computation). */
  const WORKING_DAYS = 26;
  /* Day index in the demo month — kept stable so the page is reproducible. */
  const DEMO_DAY_OF_MONTH = 19;

  /* Three service segments with revenue-share, food-cost % and labour %.
   * These shape the "profit per service" card and are tuned to look
   * realistic — dinner outperforms lunch on margin, weekend trails. */
  const SERVICE_SPLIT = {
    cafeAtlas: [
      { key: 'lunch',   revPct: 42, foodPct: 28, laborPct: 31, eyebrow: 'serviceLunch' },
      { key: 'dinner',  revPct: 38, foodPct: 23, laborPct: 26, eyebrow: 'serviceDinner' },
      { key: 'weekend', revPct: 20, foodPct: 27, laborPct: 32, eyebrow: 'serviceWeekend' },
    ],
    maisonMansour: [
      { key: 'lunch',   revPct: 30, foodPct: 26, laborPct: 28, eyebrow: 'serviceLunch' },
      { key: 'dinner',  revPct: 45, foodPct: 22, laborPct: 24, eyebrow: 'serviceDinner' },
      { key: 'weekend', revPct: 25, foodPct: 24, laborPct: 27, eyebrow: 'serviceWeekend' },
    ],
    spaBahia: [
      { key: 'lunch',   revPct: 25, foodPct: 18, laborPct: 38, eyebrow: 'serviceLunch' },
      { key: 'dinner',  revPct: 35, foodPct: 16, laborPct: 36, eyebrow: 'serviceDinner' },
      { key: 'weekend', revPct: 40, foodPct: 17, laborPct: 34, eyebrow: 'serviceWeekend' },
    ],
  };

  /* Monthly-to-date revenue (matches the homepage "Mois" period totals). */
  const MTD_REVENUE = {
    cafeAtlas:     512400,
    maisonMansour: 218300,
    spaBahia:      164200,
  };

  /* Today's revenue — pulled from the homepage "Aujourd'hui" demo data
   * when KiwiVenue exposes it; sensible fallback if not. */
  function todayRevenue(venueId) {
    const fallback = { cafeAtlas: 27512, maisonMansour: 11820, spaBahia: 8950 };
    return Math.round(fallback[venueId] || 27000);
  }

  /* ─────────────── Live cost computations ─────────────── */

  /* Food-cost % comes from KiwiRecipes.recipeStats when available — that
   * surfaces the avgFoodCostPct across all complete recipes. Falls back to
   * a venue-specific industry ratio when no recipes are wired. */
  function foodCostPct(venueId) {
    const stats = window.KiwiRecipes?.recipeStats?.(venueId);
    if (stats && stats.avgFoodCostPct > 0 && stats.complete > 0) return stats.avgFoodCostPct;
    return { cafeAtlas: 27.5, maisonMansour: 24.0, spaBahia: 18.0 }[venueId] || 26.0;
  }

  /* Labour cost % comes from the TEAM block when KiwiTeam exposes it.
   * Otherwise compute from inlined daily-rate × headcount estimate. */
  function laborCostPct(venueId) {
    const T = window.KiwiTeam;
    if (T && typeof T.getDailyLaborCost === 'function') {
      const dailyLabor = T.getDailyLaborCost(venueId);
      const dailyRev = todayRevenue(venueId);
      if (dailyLabor && dailyRev) return Math.min(45, (dailyLabor / dailyRev) * 100);
    }
    /* Industry baselines for the demo venues. */
    return { cafeAtlas: 30.0, maisonMansour: 26.0, spaBahia: 36.0 }[venueId] || 30.0;
  }

  /* Severity classes for ratios — mirrors the recettes engine bands. */
  function fcSev(pct) { return pct > 32 ? 'crit' : pct > 28 ? 'warn' : 'ok'; }
  function lcSev(pct) { return pct > 35 ? 'crit' : pct > 30 ? 'warn' : 'ok'; }

  /* ─────────────── Venue resolution ─────────────── */
  function currentVenueId() {
    return (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'cafeAtlas';
  }
  function venueName(venueId) {
    const d = window.KiwiVenue && window.KiwiVenue.getVenueData?.(venueId);
    return (d && d.name) || 'Café Atlas';
  }

  /* ─────────────── State ─────────────── */
  let pageActive = false;
  let venueUnsub = null;

  /* ═══════════════════════════════════════════════════════════════════════
   * Section 1 · Real-time P&L
   * ═══════════════════════════════════════════════════════════════════════ */
  function pnlHtml() {
    const v = currentVenueId();
    const rev = todayRevenue(v);
    const fcPct = foodCostPct(v);
    const lcPct = laborCostPct(v);
    const foodCost = rev * fcPct / 100;
    const laborCost = rev * lcPct / 100;
    const margin = rev - foodCost - laborCost;
    const marginPct = rev > 0 ? (margin / rev) * 100 : 0;
    const fcSevCls = fcSev(fcPct);
    const lcSevCls = lcSev(lcPct);
    const sevLabel = (s) => s === 'ok' ? t('pnlOk') : s === 'warn' ? t('pnlWatch') : t('pnlBad');
    const now = new Date();
    const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return `
      <div class="fin-pnl fin-card">
        <div class="fin-eyebrow"><span>${esc(t('pnlEyebrow'))}</span><span class="fin-eyebrow-sub">${esc(t('pnlUpdated', hh))}</span></div>
        <div class="fin-pnl-rows">
          <div class="fin-pnl-row">
            <span class="fin-pnl-l">${esc(t('pnlRevenue'))}</span>
            <span class="fin-pnl-v">${fmtMad(rev)}</span>
            <span class="fin-pnl-p">100 %</span>
          </div>
          <div class="fin-pnl-row fin-pnl-row-sub">
            <span class="fin-pnl-l">− ${esc(t('pnlFood'))}</span>
            <span class="fin-pnl-v">${fmtMad(foodCost)}</span>
            <span class="fin-pnl-p">${fmtPct(fcPct)}</span>
            <span class="fin-pip fin-pip-${fcSevCls}">${esc(sevLabel(fcSevCls))}</span>
          </div>
          <div class="fin-pnl-row fin-pnl-row-sub">
            <span class="fin-pnl-l">− ${esc(t('pnlLabor'))}</span>
            <span class="fin-pnl-v">${fmtMad(laborCost)}</span>
            <span class="fin-pnl-p">${fmtPct(lcPct)}</span>
            <span class="fin-pip fin-pip-${lcSevCls}">${esc(sevLabel(lcSevCls))}</span>
          </div>
          <div class="fin-pnl-row fin-pnl-total">
            <span class="fin-pnl-l">= ${esc(t('pnlMargin'))}</span>
            <span class="fin-pnl-v">${fmtMad(margin)}</span>
            <span class="fin-pnl-p">${fmtPct(marginPct)}</span>
          </div>
        </div>
        <div class="fin-pnl-foot">${t('pnlKeep', fmtInt(margin))}</div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Section 2 · Budget vs actual
   * ═══════════════════════════════════════════════════════════════════════ */
  function budgetHtml() {
    const v = currentVenueId();
    const target = MONTHLY_TARGET[v] || 800000;
    const mtd = MTD_REVENUE[v] || 500000;
    const todaysRev = todayRevenue(v);
    const dayOfMonth = DEMO_DAY_OF_MONTH;
    const daysLeft = Math.max(1, WORKING_DAYS - Math.floor(dayOfMonth * (WORKING_DAYS / 30)));
    const left = Math.max(0, target - mtd);
    const dailyPace = mtd / dayOfMonth;
    const forecast = dailyPace * 30;
    const variance = forecast - target;
    const pctReached = Math.min(100, (mtd / target) * 100);
    const verdictHtml = variance >= 0
      ? `<div class="fin-budget-verdict fin-budget-verdict-ok">✓ ${t('budgetWillBeat', fmtInt(variance))}</div>`
      : Math.abs(variance) < target * 0.02
        ? `<div class="fin-budget-verdict fin-budget-verdict-warn">○ ${t('budgetOnTrack')}</div>`
        : `<div class="fin-budget-verdict fin-budget-verdict-bad">▲ ${t('budgetWillMiss', fmtInt(Math.abs(variance)))}</div>`;
    return `
      <div class="fin-budget fin-card">
        <div class="fin-eyebrow"><span>${esc(t('budgetTitle'))}</span></div>
        <div class="fin-budget-grid">
          <div class="fin-budget-stat">
            <div class="fin-budget-stat-l">${esc(t('budgetTarget'))}</div>
            <div class="fin-budget-stat-v">${fmtMad(target)}</div>
          </div>
          <div class="fin-budget-stat">
            <div class="fin-budget-stat-l">${esc(t('budgetMtd'))}</div>
            <div class="fin-budget-stat-v">${fmtMad(mtd)}</div>
          </div>
        </div>
        <div class="fin-budget-bar"><i style="width:${pctReached}%"></i></div>
        <div class="fin-budget-bar-l">${pctReached.toFixed(0)} %</div>
        <div class="fin-budget-rows">
          <div class="fin-budget-row">${t('budgetLeft', daysLeft, fmtInt(left), fmtInt(left / Math.max(1, daysLeft)))}</div>
          <div class="fin-budget-row">${t('budgetForecast', fmtInt(forecast))}</div>
        </div>
        ${verdictHtml}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Section 3 · Break-even calculator
   * ═══════════════════════════════════════════════════════════════════════ */
  function breakevenHtml() {
    const v = currentVenueId();
    const fc = FIXED_COSTS[v] || FIXED_COSTS.cafeAtlas;
    const total = fc.rent + fc.salaries + fc.utilities + fc.other;
    const fcPct = foodCostPct(v);
    const lcPct = laborCostPct(v);
    const contributionPct = Math.max(0.05, (100 - fcPct - lcPct) / 100);
    /* Daily break-even revenue = fixed costs / (working days × contribution margin). */
    const dailyBE = total / (WORKING_DAYS * contributionPct);
    const todaysRev = todayRevenue(v);
    const aboveBy = todaysRev >= dailyBE
      ? Math.round((todaysRev / dailyBE - 1) * 100)
      : Math.round((1 - todaysRev / dailyBE) * 100);
    const verdictHtml = todaysRev >= dailyBE
      ? `<div class="fin-bev-verdict fin-bev-verdict-ok">✓ ${t('bevAboveBy', aboveBy)}</div>`
      : `<div class="fin-bev-verdict fin-bev-verdict-bad">▲ ${t('bevBelowBy', aboveBy)}</div>`;
    return `
      <div class="fin-bev fin-card">
        <div class="fin-eyebrow"><span>${esc(t('bevTitle'))}</span><span class="fin-eyebrow-sub">${esc(t('bevSub'))}</span></div>
        <div class="fin-bev-split">
          <div class="fin-bev-fixed">
            <div class="fin-bev-row"><span>${esc(t('bevRent'))}</span><span>${fmtMad(fc.rent)}</span></div>
            <div class="fin-bev-row"><span>${esc(t('bevSalaries'))}</span><span>${fmtMad(fc.salaries)}</span></div>
            <div class="fin-bev-row"><span>${esc(t('bevUtilities'))}</span><span>${fmtMad(fc.utilities)}</span></div>
            <div class="fin-bev-row"><span>${esc(t('bevOther'))}</span><span>${fmtMad(fc.other)}</span></div>
            <div class="fin-bev-row fin-bev-row-total"><span>${esc(t('bevTotal'))}</span><span>${fmtMad(total)}</span></div>
          </div>
          <div class="fin-bev-right">
            <div class="fin-bev-daily">
              <div class="fin-bev-daily-l">${esc(t('bevDaily'))}</div>
              <div class="fin-bev-daily-v">${fmtMad(dailyBE)}</div>
              <div class="fin-bev-daily-sub">${esc(t('bevDailySub', WORKING_DAYS))}</div>
            </div>
            ${verdictHtml}
          </div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Section 4 · Profitability per service
   * ═══════════════════════════════════════════════════════════════════════ */
  function serviceHtml() {
    const v = currentVenueId();
    const mtd = MTD_REVENUE[v] || 500000;
    const segs = (SERVICE_SPLIT[v] || SERVICE_SPLIT.cafeAtlas).map((s) => {
      const rev = mtd * s.revPct / 100;
      const cost = rev * (s.foodPct + s.laborPct) / 100;
      const margin = rev - cost;
      const marginPct = rev > 0 ? (margin / rev) * 100 : 0;
      const sev = marginPct >= 45 ? 'ok' : marginPct >= 38 ? 'warn' : 'crit';
      return { ...s, rev, margin, marginPct, sev };
    });
    /* Sort by margin to find best / worst for the AI prose. */
    const sorted = [...segs].sort((a, b) => b.marginPct - a.marginPct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gap = (best.marginPct - worst.marginPct).toFixed(1);

    const rows = segs.map((s) => `
      <div class="fin-service-row">
        <div class="fin-service-name">${esc(t(s.eyebrow))}</div>
        <div class="fin-service-rev">${fmtMad(s.rev)}</div>
        <div class="fin-service-bar"><i style="width:${Math.min(100, s.marginPct * 2)}%; background:${s.sev === 'ok' ? 'var(--atlas)' : s.sev === 'warn' ? 'var(--warning)' : 'var(--danger)'};"></i></div>
        <div class="fin-service-pct fin-service-pct-${s.sev}">${fmtPct(s.marginPct)}</div>
      </div>`).join('');
    return `
      <div class="fin-service fin-card">
        <div class="fin-eyebrow"><span>${esc(t('serviceTitle'))}</span><span class="fin-eyebrow-sub">${esc(t('serviceSub'))}</span></div>
        <div class="fin-service-head">
          <span>Service</span>
          <span>${esc(t('serviceRevCol'))}</span>
          <span></span>
          <span>${esc(t('serviceMarginCol'))}</span>
        </div>
        <div class="fin-service-rows">${rows}</div>
        <div class="fin-service-ai">${t('serviceAi', t(best.eyebrow), t(worst.eyebrow), gap)}</div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Section 5 · Pricing recommendations
   * ═══════════════════════════════════════════════════════════════════════ */
  function priceHtml() {
    const v = currentVenueId();
    /* When KiwiRecipes is available, mine the engine for 3 real items:
     *   – worst variance (cost-pressure → raise price)
     *   – best variance + low units (low velocity → test promo)
     *   – best margin item (beverage typically → raise small) */
    const cards = [];
    const list = window.KiwiRecipes?.listRecipes?.(v) || [];
    const enriched = list
      .filter((r) => r.recipe && r.recipe.status === 'complete')
      .map((r) => {
        const va = window.KiwiRecipes.varianceByRecipe(r.menuItem.id);
        const variancePts = va && va.theoreticalFoodCostPct > 0
          ? ((va.actualFoodCostPct - va.theoreticalFoodCostPct) / va.theoreticalFoodCostPct) * 100
          : 0;
        const price = r.menuItem.price || 0;
        const marginPct = price > 0 ? ((price - (r.menuItem.cost || price * 0.3)) / price) * 100 : 0;
        return { it: r.menuItem, va, variancePts, marginPct };
      });

    /* Card A — biggest cost overrun: suggest +5 MAD price increase. */
    const overrun = enriched.filter((r) => r.variancePts > 10).sort((a, b) => b.variancePts - a.variancePts)[0];
    if (overrun) {
      const newPrice = Math.round(overrun.it.price * 1.06 / 5) * 5;
      const margenRecovery = Math.min(8, Math.round(overrun.variancePts * 0.4));
      cards.push({
        tone: 'up',
        symbol: '↗',
        title: `${overrun.it.name} · ${fmtInt(overrun.it.price)} → ${fmtInt(newPrice)} MAD`,
        body: t('priceAbody', overrun.variancePts.toFixed(0), overrun.marginPct.toFixed(0)),
        action: t('priceAaction', newPrice - overrun.it.price, (overrun.marginPct + margenRecovery).toFixed(0), fmtInt((newPrice - overrun.it.price) * (overrun.it.unitsThisMonth || 200))),
      });
    }

    /* Card B — best margin item with high volume: raise small (drinks). */
    const drinkCats = new Set(['boissons', 'boisson', 'bar', 'drinks']);
    const highMargin = enriched
      .filter((r) => drinkCats.has((r.it.category || '').toLowerCase()))
      .sort((a, b) => b.marginPct - a.marginPct)[0];
    if (highMargin) {
      const newP = highMargin.it.price + (highMargin.it.price >= 30 ? 5 : 3);
      cards.push({
        tone: 'up',
        symbol: '⇧',
        title: `${highMargin.it.name} · ${fmtInt(highMargin.it.price)} → ${fmtInt(newP)} MAD`,
        body: t('priceBbody', highMargin.marginPct.toFixed(0)),
        action: t('priceBaction', newP - highMargin.it.price, Math.round((newP - highMargin.it.price) / highMargin.it.price * 100), fmtInt(highMargin.it.unitsThisMonth || 800), fmtInt((newP - highMargin.it.price) * (highMargin.it.unitsThisMonth || 800))),
      });
    }

    /* Card C — under-performing item: test promo. */
    const underperf = enriched
      .filter((r) => (r.it.unitsThisMonth || 0) < 80 && r.marginPct > 35)
      .sort((a, b) => (a.it.unitsThisMonth || 0) - (b.it.unitsThisMonth || 0))[0];
    if (underperf) {
      const newP = Math.round(underperf.it.price * 0.9 / 5) * 5;
      cards.push({
        tone: 'down',
        symbol: '↘',
        title: `${underperf.it.name} · ${fmtInt(underperf.it.price)} → ${fmtInt(newP)} MAD${t('priceCpromo')}`,
        body: t('priceCbody', underperf.it.unitsThisMonth || 0, underperf.marginPct.toFixed(0)),
        action: t('priceCaction', fmtInt(newP), fmtInt(underperf.it.price * (underperf.it.unitsThisMonth || 50)), fmtInt(newP * (underperf.it.unitsThisMonth || 50) * 1.4)),
      });
    }

    /* Fallback when no recipes are wired — show a "complete your recipes" prompt. */
    if (!cards.length) {
      cards.push({
        tone: 'neutral', symbol: '○',
        title: t('priceFbTitle'),
        body: t('priceFbBody'),
        action: t('priceFbAction'),
      });
    }

    const cardsHtml = cards.map((c) => `
      <div class="fin-price-card fin-price-card-${c.tone}">
        <div class="fin-price-symbol">${c.symbol}</div>
        <div class="fin-price-body">
          <div class="fin-price-eyebrow">${esc(t('priceAiEyebrow'))}</div>
          <div class="fin-price-t">${esc(c.title)}</div>
          <div class="fin-price-b">${c.body}</div>
          <div class="fin-price-a">→ ${c.action}</div>
        </div>
      </div>`).join('');
    return `
      <div class="fin-price fin-card">
        <div class="fin-eyebrow"><span>${esc(t('priceTitle'))}</span><span class="fin-eyebrow-sub">${esc(t('priceSub'))}</span></div>
        <div class="fin-price-grid">${cardsHtml}</div>
        <div class="fin-price-foot">${esc(t('priceFoot'))}</div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Section 6 · TVA — RETIRÉE
   *
   * Il y avait ici une déclaration de TVA marocaine complète : bases et taux
   * ventilés (10 / 20 / 14 / 0 %), un montant « à payer », une date limite de
   * dépôt, un historique de douze mois de déclarations, et l'adresse e-mail
   * d'un cabinet comptable nommé — la MÊME pour les trois établissements.
   * Les trois boutons (PDF, Excel, « envoyer à mon comptable ») n'envoyaient
   * rien : ils affichaient « téléchargement simulé ».
   *
   * Tout était inventé. Sur cette page, c'est le seul élément qui n'était pas
   * seulement faux mais RISQUÉ : une pièce fiscale fabriquée, avec un montant
   * et une échéance, qu'un commerçant pouvait croire et transmettre.
   *
   * Une vraie TVA se calculera un jour depuis les ventes réelles et le taux
   * que le patron a lui-même activé sur sa fiche reçu (KiwiReceipt.config().vat,
   * `mode:'none'` par défaut parce que beaucoup de petits commerces marocains
   * ne la facturent pas). Ce sera un chantier à part, pas un panneau.
   * ═══════════════════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════════════════
   * Top-level page render
   * ═══════════════════════════════════════════════════════════════════════ */
  // Every figure in this page is Café Atlas demo data (P&L, fixed costs, service
  // split, VAT history, the accountant email). A REAL session — hosted, a signed-in
  // merchant, an operator-scoped client, or a custom venue — must see none of it.
  function finShowReal(v) {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom(v)) return true;
    } catch (_) {}
    return false;
  }
  /* L'écran d'attente d'un vrai commerçant.
   *
   * Il promettait « dès vos premières ventes et dépenses, Kiwi calcule votre
   * compte de résultat, votre point mort, vos marges par service et votre TVA,
   * automatiquement ». Aucune de ces quatre choses n'existait, et aucune vente
   * n'a jamais fait apparaître quoi que ce soit : la promesse ne pouvait pas se
   * tenir, et le commerçant revenait vérifier.
   *
   * Ce qu'il dit maintenant : ce qu'il manque, combien il en manque, et où
   * aller le saisir. Le seul chiffre affiché — le nombre de produits pas encore
   * chiffrés — est compté pour de vrai. */
  function finCoverage() {
    try {
      const M = window.KiwiMenuStore;
      const items = (M && typeof M.items === 'function' && M.items()) || [];
      const costs = (window.KiwiCost && window.KiwiCost.doc && window.KiwiCost.doc().items) || {};
      const total = items.length;
      let done = 0;
      items.forEach((it) => { if (it && costs[it.id] && +costs[it.id].cost > 0) done++; });
      return { total, done };
    } catch (_) { return { total: 0, done: 0 }; }
  }
  function finEmpty() {
    const cv = finCoverage();
    const left = Math.max(0, cv.total - cv.done);
    const L = lang();
    const c = ({
      fr: {
        h: 'Chiffrez votre carte, et vos marges se calculent',
        p: 'Kiwi connaît déjà ce que vous vendez. Il lui manque ce que chaque produit vous coûte — vous le saisissez une fois dans votre carte, et la marge de chaque vente se calcule toute seule.',
        n: (a, b) => `${a} produit${a > 1 ? 's' : ''} sur ${b} reste${a > 1 ? 'nt' : ''} à chiffrer.`,
        ok: (b) => `Vos ${b} produits sont chiffrés. Vos marges apparaissent sur le tableau de bord.`,
        none: 'Créez d’abord votre carte : c’est elle qui porte vos produits.',
        cta: 'Ouvrir ma carte',
      },
      en: {
        h: 'Cost your menu, and your margins compute themselves',
        p: 'Kiwi already knows what you sell. What it is missing is what each product costs you — enter it once in your menu, and every sale’s margin follows.',
        n: (a, b) => `${a} of ${b} product${b > 1 ? 's' : ''} still need${a > 1 ? '' : 's'} a cost.`,
        ok: (b) => `All ${b} products are costed. Your margins now show on the dashboard.`,
        none: 'Start with your menu: that is what carries your products.',
        cta: 'Open my menu',
      },
      ar: {
        h: 'حسب تكلفة قائمتك، والهوامش كتحسب بوحدها',
        p: 'Kiwi عارف فاش كتبيع. اللي خاصو هو شحال كيكلفك كل منتج — دخّلو مرة وحدة فالقائمة، والهامش ديال كل بيعة كيتحسب بوحدو.',
        n: (a, b) => `${a} منتج من ${b} مازال خاصهم التكلفة.`,
        ok: (b) => `${b} منتج كاملين محسوبين. الهوامش ديالك كتبان فلوحة التحكم.`,
        none: 'بدا بالقائمة ديالك: هي اللي فيها المنتجات.',
        cta: 'افتح القائمة',
      },
    })[L] || {};
    const line = cv.total === 0 ? c.none : (left > 0 ? c.n(left, cv.total) : c.ok(cv.total));
    return `<div class="fin-page"><div class="fin-empty" style="padding:56px 24px;text-align:center;max-width:520px;margin:0 auto;">
      <div style="font-size:17px;font-weight:640;letter-spacing:-.01em;margin-bottom:8px;">${esc(c.h)}</div>
      <div style="font-size:13.5px;color:var(--n-500);line-height:1.6;">${esc(c.p)}</div>
      <div style="font-size:13px;color:var(--ink);font-weight:560;margin-top:14px;">${esc(line)}</div>
      <button class="kb atlas" type="button" data-action="nav-menu" style="margin-top:18px;">${esc(c.cta)}</button>
    </div></div>`;
  }

  function render() {
    const root = document.querySelector('[data-finance-root]');
    if (!root) return;
    const v = currentVenueId();
    if (finShowReal(v)) { root.innerHTML = finEmpty(); return; }
    root.innerHTML = `
      <div class="fin-page">
        <div class="fin-head">
          <div>
            <div class="fin-title">${esc(t('pageTitle'))}</div>
            <div class="fin-sub">${esc(t('pageSub', venueName(v)))}</div>
          </div>
        </div>
        <div class="fin-grid">
          ${pnlHtml()}
          ${budgetHtml()}
          ${breakevenHtml()}
          ${serviceHtml()}
          ${priceHtml()}
        </div>
        <div class="fin-note">${esc(t('noteUpdatePolicy'))}</div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Page show/hide — mirrors Stock pattern
   * ═══════════════════════════════════════════════════════════════════════ */
  function showPage() {
    pageActive = true;
    // Exactly one page shell at a time — see Kiwi.pageShell.
    if (window.Kiwi && Kiwi.pageShell) Kiwi.pageShell('finance');
    else document.body.classList.add('page-finance');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = `Accueil <span class="sep">/</span> <b>${esc(t('breadcrumb'))}</b>`;
    window.Kiwi?.setActivePage?.('finance');
    document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.remove('active'));
    document.querySelector('.sidebar nav a[data-nav="finance"]')?.classList.add('active');
    window.scrollTo({ top: 0 });
    render();
    /* Re-render on venue change so KPIs swap accordingly. */
    if (!venueUnsub && window.KiwiVenue?.subscribe) {
      venueUnsub = window.KiwiVenue.subscribe(() => { if (pageActive) render(); });
    }
  }
  function showDashboard() {
    if (!document.body.classList.contains('page-finance')) return;
    pageActive = false;
    document.body.classList.remove('page-finance');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = 'Accueil <span class="sep">/</span> <b>Tableau de bord</b>';
    if (venueUnsub) { try { venueUnsub(); } catch (_) {} venueUnsub = null; }
    window.Kiwi?.setActivePage?.('accueil');
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Wire nav-finance handler + back-to-dashboard hooks.
   * Loads AFTER assets/venues.js + pages-pro.js so its nav-finance
   * registration wins.
   * ═══════════════════════════════════════════════════════════════════════ */
  function wire() {
    if (!window.Kiwi || !window.Kiwi.handlers) {
      return setTimeout(wire, 80);
    }
    /* Role gate — only the owner reaches Marges & budget, even if the entry is
     * somehow triggered. Bounce to dashboard + a soft toast.
     * Was `=== 'manager'`: the sidebar hides this page from manager AND staff,
     * so checking for the manager alone let the more restricted badge in. */
    window.Kiwi.handlers['nav-finance'] = () => {
      if ((window.__kiwiRole || 'owner') !== 'owner') {
        window.Kiwi.toast?.('Accès propriétaire uniquement', { type: 'info' });
        return;
      }
      showPage();
    };
    /* Any other nav-* handler returns the user to the dashboard. */
    ['nav-accueil', 'nav-tables', 'nav-menu', 'nav-kds', 'nav-stock', 'nav-equipe',
      'nav-payroll', 'nav-reservations', 'nav-orders', 'nav-terminals', 'nav-conformite']
      .forEach((k) => {
        const prev = window.Kiwi.handlers[k];
        window.Kiwi.handlers[k] = (...args) => { showDashboard(); return prev ? prev(...args) : undefined; };
      });
  }

  /* Public surface for any external hooks. */
  window.KiwiFinance = {
    showPage, showDashboard, render,
    /* Computation helpers — exposed for tests + the KPI strip if needed. */
    todayRevenue, foodCostPct, laborCostPct,
    FIXED_COSTS, MONTHLY_TARGET, SERVICE_SPLIT, MTD_REVENUE,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
