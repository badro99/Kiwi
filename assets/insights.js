/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · insight engine — REAL, data-derived recommendations.
 *
 * No canned copy: every recommendation is computed from the active venue's
 * actual menu (price / cost / units → margin × popularity) and the live hourly
 * revenue distribution (KiwiDemoClock weights).
 *
 * Four DISTINCT, non-overlapping insights — each headlines a different item or
 * lever, none contradicts another:
 *   star    — the single biggest monthly-margin contributor → feature it
 *   dog     — the least-sold item → rework or drop it
 *   offpeak — the weakest 2-hour window → fill it
 *   price   — a menu-wide 5 % price lever (at constant volume) → quick margin
 *
 * Shared by BOTH the hero "Recommandations du jour" card (venues.js →
 * getHeroAiRec) AND the AI assistant (agent.js → "advice" intent), so the
 * dashboard and the agent are always conscious of — and agree on — the same
 * grounded facts.
 *
 * window.KiwiInsights.compute(venueKey?, lang?) → ranked insight[]
 * window.KiwiInsights.heroRec(venueKey?)        → {title, obs, act} | null
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const fmt  = (n) => Math.round(n).toLocaleString('fr-FR');             // 1 234
  const pct1 = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR'); // 22,3
  const uiLang = () => (window.KiwiI18n?.getLang?.() || 'fr');

  /* ── Provenance ────────────────────────────────────────────────────────────
   * Two of these insights are counted and two are projected, and until now they
   * looked identical on screen. "Thé à la menthe est votre moteur de marge" is
   * a fact taken from the ledger; "+5 % sur la carte ≈ +42 000 MAD/mois" is an
   * arithmetic guess that assumes not one customer walks away. A merchant is
   * entitled to know which one they are reading before they act on it. */
  const BASIS = {
    fr: { measured: 'MESURÉ', estimated: 'ESTIMÉ' },
    en: { measured: 'MEASURED', estimated: 'ESTIMATED' },
    ar: { measured: 'مقاس', estimated: 'تقديري' },
  };
  const basisLabel = (b, lang) => (BASIS[lang] || BASIS[uiLang()] || BASIS.fr)[b] || '';

  /* Localized renderers — each takes the computed data object `d` (numbers
   * already derived from real data) and returns {kpi, title, obs, act}. */
  const T = {
    fr: {
      star: (d) => ({ kpi: 'MOTEUR DE MARGE',
        title: `${d.name} est votre moteur de marge`,
        obs: `${fmt(d.units)} ventes/mois × ${fmt(d.margin)} MAD de marge = ${fmt(d.monthly)} MAD de marge mensuelle, votre plus gros contributeur, et de loin.`,
        act: `→ Mettez-le en avant (combo, suggestion en caisse, photo). +10 % de ventes ≈ +${fmt(d.monthly * 0.1)} MAD/mois.` }),
      dog: (d) => ({ kpi: 'À ARBITRER',
        title: `${d.name} est votre article le moins vendu`,
        obs: `Seulement ${fmt(d.units)} ventes/mois, il occupe une ligne de carte et une place en cuisine pour très peu de retour.`,
        act: `→ Retravaillez-le (recette, prix, photo) ou retirez-le pour alléger la carte et accélérer le service.` }),
      offpeak: (d) => ({ kpi: 'CREUX HORAIRE',
        title: `Votre creux de ${d.h1}h–${d.h2}h est sous-exploité`,
        obs: `Ce créneau ne pèse que ${pct1(d.pct)} % de votre chiffre du jour, c'est votre plus grande marge de progression horaire.`,
        act: `→ Une offre ciblée sur ce créneau (formule goûter, happy hour) peut lisser la journée et la rotation des tables.` }),
      price: (d) => ({ kpi: 'LEVIER PRIX',
        title: `+5 % sur la carte, c'est votre levier le plus rapide`,
        obs: `Votre carte fait ${fmt(d.rev)} MAD de ventes/mois sur ${fmt(d.units)} articles. À volume constant, une hausse se répercute presque entièrement en marge.`,
        act: `→ +5 % ≈ +${fmt(d.price5)} MAD/mois. Commencez par vos best-sellers, peu sensibles au prix.` }),
    },
    en: {
      star: (d) => ({ kpi: 'MARGIN ENGINE',
        title: `${d.name} is your margin engine`,
        obs: `${fmt(d.units)} sales/mo × ${fmt(d.margin)} MAD margin = ${fmt(d.monthly)} MAD of monthly margin, your biggest contributor, by far.`,
        act: `→ Feature it (combo, till prompt, photo). +10 % sales ≈ +${fmt(d.monthly * 0.1)} MAD/mo.` }),
      dog: (d) => ({ kpi: 'REVIEW',
        title: `${d.name} is your worst-selling item`,
        obs: `Only ${fmt(d.units)} sales/mo, it takes up a menu line and kitchen space for very little return.`,
        act: `→ Rework it (recipe, price, photo) or drop it to lighten the menu and speed up service.` }),
      offpeak: (d) => ({ kpi: 'OFF-PEAK',
        title: `Your ${d.h1}:00–${d.h2}:00 lull is under-used`,
        obs: `That window is only ${pct1(d.pct)} % of your daily revenue, your biggest hour-of-day upside.`,
        act: `→ A targeted offer in that window (afternoon set, happy hour) can smooth the day and table turnover.` }),
      price: (d) => ({ kpi: 'PRICE LEVER',
        title: `+5 % on the menu is your fastest lever`,
        obs: `Your menu does ${fmt(d.rev)} MAD of sales/mo across ${fmt(d.units)} items. At constant volume, a rise flows almost entirely into margin.`,
        act: `→ +5 % ≈ +${fmt(d.price5)} MAD/mo. Start with your best-sellers, the least price-sensitive.` }),
    },
    ar: {
      star: (d) => ({ kpi: 'محرّك الهامش',
        title: `${d.name} هو محرّك هامشك`,
        obs: `${fmt(d.units)} مبيعة/شهر × ${fmt(d.margin)} درهم هامش = ${fmt(d.monthly)} درهم هامش شهري، أكبر مساهم لديك بفارق كبير.`,
        act: `→ أبرزه (كومبو، اقتراح عند الصندوق، صورة). +10٪ مبيعات ≈ +${fmt(d.monthly * 0.1)} درهم/شهر.` }),
      dog: (d) => ({ kpi: 'للمراجعة',
        title: `${d.name} هو أقل أصنافك مبيعًا`,
        obs: `${fmt(d.units)} مبيعة/شهر فقط، يشغل سطرًا في القائمة ومكانًا في المطبخ مقابل عائد ضئيل جدًا.`,
        act: `→ أعد صياغته (وصفة، سعر، صورة) أو احذفه لتبسيط القائمة وتسريع الخدمة.` }),
      offpeak: (d) => ({ kpi: 'ساعة الركود',
        title: `فترة الركود ${d.h1}–${d.h2} غير مستغلّة`,
        obs: `هذه الفترة لا تمثّل سوى ${pct1(d.pct)}٪ من رقم معاملاتك اليومي، أكبر فرصة لديك حسب الساعة.`,
        act: `→ عرض موجّه في هذه الفترة (منيو العصر، عرض خاص) يمكن أن يوازن اليوم ودوران الطاولات.` }),
      price: (d) => ({ kpi: 'رافعة السعر',
        title: `+5٪ على القائمة هي أسرع رافعة لديك`,
        obs: `قائمتك تحقق ${fmt(d.rev)} درهم مبيعات/شهر على ${fmt(d.units)} صنفًا. بحجم ثابت، الزيادة تذهب كلها تقريبًا إلى الهامش.`,
        act: `→ +5٪ ≈ +${fmt(d.price5)} درهم/شهر. ابدأ بالأكثر مبيعًا، الأقل حساسية للسعر.` }),
    },
  };

  /* Compute ranked, data-derived insights. Returns [] when there isn't enough
   * real data (e.g. a brand-new custom venue) so callers can fall back. */
  function compute(venueKey, langOverride) {
    const KV = window.KiwiVenue;
    if (!KV || !KV.getMenuItems) return [];
    /* Whose carte is this? getMenuItems() answers for a custom venue with the
     * merchant's own menu, and for a demo venue id with Café Atlas's. A real
     * session sitting on a demo venue id — which happens, it is the case
     * buildProfile() calls "real-but-not-custom" — would therefore get a
     * beautifully computed, entirely genuine insight about somebody else's
     * restaurant. The arithmetic being real does not make the answer true. */
    try {
      const real = !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
      const custom = !!(KV.isCustom && KV.isCustom(venueKey));
      if (real && !custom) return [];
    } catch (_) { return []; }
    let items;
    try { items = KV.getMenuItems(venueKey) || []; } catch (_) { return []; }

    // Real sellable items only: a positive price, a known cost, actual sales.
    const sell = items
      .filter((it) => it && it.price > 0 && it.cost >= 0 && it.unitsThisMonth > 0)
      .map((it) => {
        const margin = it.price - it.cost;
        return { name: it.name, price: it.price, units: it.unitsThisMonth,
                 margin, monthly: margin * it.unitsThisMonth, revenue: it.price * it.unitsThisMonth };
      });
    if (sell.length < 3) return [];

    const L = T[langOverride] || T[uiLang()] || T.fr;
    const out = [];
    const used = new Set();   // keep every insight on a DISTINCT item

    // A · Star — the single biggest monthly-margin contributor.
    const star = [...sell].sort((a, b) => b.monthly - a.monthly)[0];
    if (star) { used.add(star.name); out.push(Object.assign({ id: 'star', score: star.monthly, basis: 'measured' }, L.star(star))); }

    // B · Dog — the least-sold item (a genuine low-volume signal, not a margin
    // judgement — food naturally runs a lower margin % than drinks).
    const dog = [...sell].filter((s) => !used.has(s.name)).sort((a, b) => a.units - b.units)[0];
    if (dog) { used.add(dog.name); out.push(Object.assign({ id: 'dog', score: 2200, basis: 'measured' }, L.dog(dog))); }

    // C · Off-peak — the weakest consecutive 2-hour daytime window, from the
    // live hourly revenue weights (index 0 = 11h). % = its share of the day.
    const sim = window.KiwiDemoClock && window.KiwiDemoClock.getSimState && window.KiwiDemoClock.getSimState();
    const w = sim && sim.weights && sim.weights.rev;
    if (w && w.length >= 12) {
      let lo = Infinity, loIdx = 0;
      for (let i = 0; i <= Math.min(11, w.length - 2); i++) {
        const s = (w[i] || 0) + (w[i + 1] || 0);
        if (s < lo) { lo = s; loIdx = i; }
      }
      /* The hourly curve is a distribution, not a count of tickets per hour. */
      out.push(Object.assign({ id: 'offpeak', score: 2600, basis: 'estimated' },
        L.offpeak({ h1: 11 + loIdx, h2: 11 + loIdx + 2, pct: lo * 100 })));
    }

    // D · Price — a menu-wide 5 % lever at constant volume (real menu revenue).
    const totalUnits = sell.reduce((s, x) => s + x.units, 0);
    const totalRev   = sell.reduce((s, x) => s + x.revenue, 0);
    if (totalRev > 0) {
      /* Assumes constant volume — nobody trades down, nobody leaves. */
      out.push(Object.assign({ id: 'price', score: totalRev * 0.05, basis: 'estimated' },
        L.price({ rev: totalRev, units: totalUnits, price5: totalRev * 0.05 })));
    }

    return out.sort((a, b) => b.score - a.score);
  }

  /* One recommendation for the hero card. Rotates by day-of-month across all
   * real insights so "Recommandations du jour" genuinely changes day to day. */
  function heroRec(venueKey) {
    const ins = compute(venueKey);
    if (!ins.length) return null;
    let day = 1;
    try { day = new Date().getDate(); } catch (_) {}
    const pick = ins[day % ins.length];
    return { title: pick.title, obs: pick.obs, act: pick.act, basis: pick.basis || 'estimated', basisLabel: basisLabel(pick.basis || 'estimated') };
  }

  window.KiwiInsights = { compute, heroRec, basisLabel };
})();
