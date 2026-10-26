/* Propriétaire : venues · aides de présentation et normalisation.
 * Corps déplacés sans modification, vérifiés par venues-split-test.mjs.
 * Enregistrement inerte, les fabriques sont appelées par le noyau. */
(function () {
  'use strict';
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).overlay = function (__deps) {
    const {  } = __deps;
/* <<split:overlay>> */

  /* ═══════════════ FUSION MODE — glass melt transition + state swap ═══════════════ */

  // Build the overlay's internal markup fresh on each activation so every
  // glass-melt animation (incl. the SMIL <animate> elements driving the SVG
  // turbulence/displacement filter) replays from t=0.
  function buildOverlayMarkup(overlay, opts = {}) {
    const isExit = !!opts.exit;
    // Entry vs exit: same filter shape, slightly tighter displacement on exit
    // so the surface "snaps back into place" rather than fully liquefying.
    const meltDuration = isExit ? 900 : 1100;
    const turbValues   = isExit
      ? '0.024 0.038; 0.034 0.054; 0.018 0.026; 0.012 0.020'
      : '0.020 0.030; 0.038 0.058; 0.026 0.040; 0.014 0.022';
    const scaleValues  = isExit
      ? '0; 18; 32; 14; 4; 0'
      : '0; 14; 40; 22; 6; 0';

    overlay.innerHTML = `
      <svg class="fo-svg-filters" aria-hidden="true" focusable="false">
        <defs>
          <filter id="kiwi-melt-distort" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.020 0.030" numOctaves="2" seed="4" result="turb">
              <animate attributeName="baseFrequency"
                       values="${turbValues}"
                       keyTimes="0; 0.4; 0.75; 1"
                       dur="${meltDuration}ms"
                       fill="freeze"
                       begin="0s" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="turb" scale="0">
              <animate attributeName="scale"
                       values="${scaleValues}"
                       keyTimes="0; 0.10; 0.40; 0.65; 0.85; 1"
                       dur="${meltDuration}ms"
                       fill="freeze"
                       begin="0s" />
            </feDisplacementMap>
          </filter>
        </defs>
      </svg>
      <div class="fo-frost"></div>
      <div class="fo-gloss"></div>
      <div class="fo-glow-frame"></div>
      <div class="fo-label">
        <span class="fo-mark"><img src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></span>
        <span class="fo-ultra">
          <span class="fo-ultra-r">✦</span>
          <span class="fo-ultra-b">✦</span>
          <span class="fo-ultra-g">✦</span>
          <span class="fo-ultra-core">✦</span>
        </span>
      </div>
    `;
  }
/* <</split:overlay>> */
    return { buildOverlayMarkup };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).theme = function (__deps) {
    const {  } = __deps;
/* <<split:theme>> */

  /* Le sombre est un CHOIX du commerçant (kiwiDashTheme, amorcé dans <head>
   * avant la première peinture). L'attribut data-theme ne survit jamais à un
   * rechargement, donc le retirer « défensivement » au boot ne nettoyait
   * aucune fusion périmée — il peignait l'écran de verrouillage en blanc une
   * seconde à chaque chargement, le temps que le choix soit ré-appliqué.
   * Partout où la fusion rend l'antenne, on RESTAURE le choix au lieu de
   * l'effacer : même chaîne de repli que le script de <head>. */
  function themeChoiceIsDark() {
    try {
      /* The dashboard's <head> starts light unless kiwiDashTheme says dark,
       * whatever the system or the public site prefer (it marks <html> with
       * data-vexel-mode). Falling back to the system here painted the page
       * dark for a second on every load on a Mac in dark mode, until
       * design-vexel.js put it back to light (owner, 2026-10-23). */
      if (document.documentElement.hasAttribute('data-vexel-mode')) return localStorage.getItem('kiwiDashTheme') === 'dark';
      const t = localStorage.getItem('kiwiDashTheme') || localStorage.getItem('kiwiTheme');
      if (t) return t === 'dark';
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (_) { return false; }
  }
  function restoreThemeChoice() {
    if (themeChoiceIsDark()) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
/* <</split:theme>> */
    return { themeChoiceIsDark, restoreThemeChoice };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).fusion = function (__deps) {
    const { VENUES, typeIconOf } = __deps;
/* <<split:fusion>> */

  /* ═══════════════════════════════════════════════════════════════════════
   * FUSION VIEW — dedicated portfolio layout
   * ─────────────────────────────────────────────────────────────────────
   * Paints <section class="dash-fusion"> in dashboard.html with 6 sections
   * (hero, KPI cards, venue rows, chart, intel, alerts). Reads from the
   * enriched VENUES.fusion data above. On Aujourd'hui, ticks per-venue
   * values from window.KiwiDemoClock every 3 seconds.
   *
   * Render entrypoints:
   *   renderFusionView()             — full re-paint (range change, init)
   *   renderFusionLiveUpdate(state)  — per-tick update (clock subscriber)
   * ═══════════════════════════════════════════════════════════════════════ */

  // ── MIRROR of demoClock.js · TARGETS + HOUR_WEIGHTS ─────────────────
  // demoClock.js holds these as private IIFE constants and only exposes
  // single-venue state. To render per-venue live values for fusion (3
  // venue rows ticking independently) we mirror them here and recompute
  // each venue's cumulatives from state.fraction.
  // ⚠ KEEP IN SYNC if you change demoClock.js TARGETS / HOUR_WEIGHTS.
  const FUSION_PER_VENUE_TARGETS = {
    cafeAtlas:     { revenue: 31500, tx: 215, tips: 2400 },
    maisonMansour: { revenue: 14000, tx: 48,  tips: 0    },
    spaBahia:      { revenue: 10500, tx: 22,  tips: 1500 },
  };
  const FUSION_PER_VENUE_WEIGHTS = {
    cafeAtlas: {
      rev:  [0.018, 0.075, 0.110, 0.090, 0.040, 0.028, 0.040, 0.062, 0.100, 0.135, 0.130, 0.090, 0.052, 0.018, 0.008, 0.004],
      tx:   [0.020, 0.085, 0.130, 0.105, 0.040, 0.025, 0.035, 0.055, 0.095, 0.120, 0.110, 0.080, 0.050, 0.025, 0.018, 0.007],
      tips: [0.012, 0.065, 0.115, 0.100, 0.030, 0.020, 0.030, 0.060, 0.110, 0.150, 0.140, 0.090, 0.050, 0.020, 0.005, 0.003],
    },
    maisonMansour: {
      rev:  [0.080, 0.130, 0.105, 0.050, 0.038, 0.052, 0.110, 0.135, 0.150, 0.130, 0.018, 0.002, 0.000, 0.000, 0.000, 0.000],
      tx:   [0.082, 0.135, 0.108, 0.050, 0.040, 0.054, 0.108, 0.130, 0.145, 0.125, 0.015, 0.005, 0.003, 0.000, 0.000, 0.000],
      tips: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    },
    spaBahia: {
      rev:  [0.050, 0.115, 0.140, 0.085, 0.105, 0.140, 0.115, 0.085, 0.055, 0.035, 0.020, 0.005, 0.000, 0.000, 0.000, 0.000],
      tx:   [0.045, 0.110, 0.135, 0.085, 0.100, 0.140, 0.115, 0.090, 0.060, 0.045, 0.045, 0.018, 0.007, 0.005, 0.000, 0.000],
      tips: [0.040, 0.110, 0.140, 0.090, 0.110, 0.150, 0.110, 0.080, 0.060, 0.045, 0.035, 0.020, 0.008, 0.002, 0.000, 0.000],
    },
  };
  const FUSION_HOUR_LABELS = ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'];
  const FUSION_N = FUSION_HOUR_LABELS.length;
  const FUSION_PORTFOLIO_GOAL = 55000;         // daily target — referenced by spec
  const FUSION_VENUE_IDS = ['cafeAtlas', 'maisonMansour', 'spaBahia'];

  function fusionCumulativeAt(weights, fraction) {
    if (!weights || !weights.length) return 0;
    const pos = fraction * FUSION_N;
    const idx = Math.min(FUSION_N - 1, Math.floor(pos));
    const within = Math.min(1, Math.max(0, pos - idx));
    let cum = 0;
    for (let i = 0; i < idx; i++) cum += weights[i];
    cum += (weights[idx] || 0) * within;
    return cum;
  }

  /* Compute per-venue cumulatives at this tick.
   * Returns { cafeAtlas: {revenue, tx, tips}, maisonMansour: …, spaBahia: …,
   *           portfolio: {revenue, tx, tips, panierMoyen, top, topRevenue} } */
  function computePerVenueLive(state) {
    const f = state?.fraction ?? 0;
    const out = { portfolio: { revenue: 0, tx: 0, tips: 0 } };
    let top = null, topRev = -1;
    FUSION_VENUE_IDS.forEach(id => {
      const t = FUSION_PER_VENUE_TARGETS[id];
      const w = FUSION_PER_VENUE_WEIGHTS[id];
      const cumRev  = fusionCumulativeAt(w.rev,  f) * t.revenue;
      const cumTx   = Math.round(fusionCumulativeAt(w.tx,   f) * t.tx);
      const cumTips = fusionCumulativeAt(w.tips, f) * t.tips;
      out[id] = { revenue: cumRev, tx: cumTx, tips: cumTips };
      out.portfolio.revenue += cumRev;
      out.portfolio.tx      += cumTx;
      out.portfolio.tips    += cumTips;
      if (cumRev > topRev) { topRev = cumRev; top = VENUES[id]?.name || id; }
    });
    out.portfolio.panierMoyen = out.portfolio.tx > 0 ? Math.round(out.portfolio.revenue / out.portfolio.tx) : 0;
    out.portfolio.top = top;
    out.portfolio.topRevenue = topRev;
    out.simIdx = state?.simIdx ?? 0;
    out.simHourLabel = state?.simHourLabel || FUSION_HOUR_LABELS[0];
    out.simMinute = state?.simMinute ?? 0;
    return out;
  }

  // ── Local twin of dateRange.animateNumber — identical easing/duration ──
  function fusionAnimateNumber(el, from, to, opts = {}) {
    if (!el) return;
    const duration = opts.duration ?? 800;
    const format = opts.format || (v => String(Math.round(v)));
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

  // ── French number formatters (mirror dateRange.js style) ──
  const fusionFrInt = n => (window.KiwiNumber?.format(Math.floor(n), {}) ?? Math.floor(n).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  const fusionFmtMad = v => `${fusionFrInt(v)} MAD`;
  const fusionFmtMadCents = v => {
    const int = Math.floor(v);
    const cents = Math.round((v - int) * 100);
    return `${fusionFrInt(int)},${String(cents).padStart(2,'0')} <span class="currency">MAD</span>`;
  };
  const fusionFmtPct = v => {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    const abs = Math.abs(v);
    const formatted = (Math.abs(abs - Math.round(abs)) < 0.001) ? String(Math.round(abs)) : (window.KiwiNumber?.number(abs, 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format(abs));
    return `${sign}${formatted} %`;
  };

  function fusionParseAmount(el) {
    if (!el) return 0;
    const m = el.textContent.replace('−', '-').match(/-?\d+(?:[\s ]\d{3})*(?:[.,]\d+)?/);
    if (!m) return 0;
    return parseFloat(m[0].replace(/[\s ]/g, '').replace(',', '.')) || 0;
  }

  // ── Delta label per range (matches single-venue convention) ──
  const FUSION_DELTA_LABELS = {
    fr: { aujourdhui: 'vs hier', hier: 'vs avant-hier', septJours: 'vs 7 jours précédents', trenteJours: 'vs 30 jours précédents' },
    en: { aujourdhui: 'vs yesterday', hier: 'vs day before', septJours: 'vs previous 7 days', trenteJours: 'vs previous 30 days' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام السابقة', trenteJours: 'مقابل 30 يومًا السابقة' },
  };
  /* ── Exclusif Ultra band — the pillars the 1 499 buys, lived in-product.
   * Projection math is honest demo data: the staff-transfer rec uses real
   * roster names; the ROI line matches the sidebar's 1,47 M MAD/month. ── */
  const FS_ULTRA_STR = {
    fr: {
      roi: '1 499 MAD/mois ≈ 0,1 % du CA du portefeuille (1,47 M MAD/mois)',
      aiEyebrow: '✦ IA PORTEFEUILLE · ACTION SUGGÉRÉE',
      aiTitle: 'Transfert d\'équipe · vendredi 19h–22h',
      aiBody: 'Café Atlas refuse ~12 couverts chaque vendredi soir pendant que Spa Bahia tourne à 54 % de capacité. Hamid J. et Sofia B. (formés salle) sont disponibles côté spa sur ce créneau.',
      aiProj: '≈ +3 800 MAD/semaine · +15 200 MAD/mois',
      aiCta: 'Planifier le transfert →',
      amEyebrow: 'ACCOUNT MANAGER DÉDIÉE',
      amRole: 'Connaît vos 3 établissements · Casablanca',
      amNote: 'Ligne directe 24/7, réponse médiane 11 min sur les 30 derniers jours. Revue stratégique trimestrielle incluse.',
      amCall: 'Planifier un appel',
      apiEyebrow: 'API ENTERPRISE · TEMPS RÉEL',
      apiKey: 'Clé de production', apiActive: 'actifs',
      apiExport: 'Export comptable', apiDocs: 'Documentation API →',
      transferToast: 'Transfert planifié, proposé à Hamid J. et Sofia B.',
      transferToastD: 'En attente de leur confirmation WhatsApp. Yasmine est en copie.',
      callToast: 'Appel demandé, Yasmine vous rappelle',
      callToastD: 'Créneau confirmé par WhatsApp d\'ici 30 min.',
      apiToast: 'kiwi-os.com/api',
      apiToastD: 'Référence complète : endpoints, webhooks, exports SFTP.',
    },
    en: {
      roi: '1,499 MAD/mo ≈ 0.1% of portfolio revenue (1.47M MAD/mo)',
      aiEyebrow: '✦ PORTFOLIO AI · SUGGESTED ACTION',
      aiTitle: 'Staff transfer · Friday 7–10pm',
      aiBody: 'Café Atlas turns away ~12 covers every Friday night while Spa Bahia runs at 54% capacity. Hamid J. and Sofia B. (floor-trained) are free on the spa side in that window.',
      aiProj: '≈ +3,800 MAD/week · +15,200 MAD/month',
      aiCta: 'Schedule the transfer →',
      amEyebrow: 'DEDICATED ACCOUNT MANAGER',
      amRole: 'Knows your 3 venues · Casablanca',
      amNote: 'Direct line 24/7, median response 11 min over the last 30 days. Quarterly strategy review included.',
      amCall: 'Schedule a call',
      apiEyebrow: 'ENTERPRISE API · REAL-TIME',
      apiKey: 'Production key', apiActive: 'active',
      apiExport: 'Accounting export', apiDocs: 'API documentation →',
      transferToast: 'Transfer scheduled, proposed to Hamid J. and Sofia B.',
      transferToastD: 'Awaiting their WhatsApp confirmation. Yasmine is cc\'d.',
      callToast: 'Call requested, Yasmine will call you back',
      callToastD: 'Slot confirmed by WhatsApp within 30 min.',
      apiToast: 'kiwi-os.com/api',
      apiToastD: 'Full reference: endpoints, webhooks, SFTP exports.',
    },
    ar: {
      roi: '1 499 درهم/شهر ≈ 0,1% من مداخيل المحفظة (1,47 مليون درهم/شهر)',
      aiEyebrow: '✦ ذكاء المحفظة · إجراء مقترح',
      aiTitle: 'نقل فريق · الجمعة 19:00–22:00',
      aiBody: 'مقهى أطلس يرفض ~12 مقعدًا كل جمعة مساءً بينما سبا باهية يعمل بـ 54% من طاقته. حميد ج. وصوفيا ب. (مدرّبان على الصالة) متاحان في تلك الفترة.',
      aiProj: '≈ +3 800 درهم/أسبوع · +15 200 درهم/شهر',
      aiCta: 'جدولة النقل ←',
      amEyebrow: 'مديرة حساب مخصصة',
      amRole: 'تعرف مؤسساتك الثلاث · الدار البيضاء',
      amNote: 'خط مباشر 24/7، متوسط الرد 11 دقيقة خلال آخر 30 يومًا. مراجعة استراتيجية فصلية مشمولة.',
      amCall: 'جدولة مكالمة',
      apiEyebrow: 'API للمؤسسات · في الوقت الفعلي',
      apiKey: 'مفتاح الإنتاج', apiActive: 'نشطة',
      apiExport: 'تصدير محاسبي', apiDocs: 'وثائق الـ API ←',
      transferToast: 'تمت جدولة النقل، اقتُرح على حميد ج. وصوفيا ب.',
      transferToastD: 'في انتظار تأكيدهما عبر واتساب. ياسمين في النسخة.',
      callToast: 'تم طلب المكالمة، ياسمين ستتصل بك',
      callToastD: 'تأكيد الموعد عبر واتساب خلال 30 دقيقة.',
      apiToast: 'kiwi-os.com/api',
      apiToastD: 'مرجع كامل: النقاط، الويبهوكس، تصدير SFTP.',
    },
  };
  const FUSION_HERO_LABELS = {
    fr: { aujourdhui: "ENCAISSÉ AUJOURD'HUI · PORTEFEUILLE", hier: 'ENCAISSÉ HIER · PORTEFEUILLE', septJours: 'ENCAISSÉ 7 JOURS · PORTEFEUILLE', trenteJours: 'ENCAISSÉ 30 JOURS · PORTEFEUILLE' },
    en: { aujourdhui: 'CASHED TODAY · PORTFOLIO', hier: 'CASHED YESTERDAY · PORTFOLIO', septJours: 'CASHED 7 DAYS · PORTFOLIO', trenteJours: 'CASHED 30 DAYS · PORTFOLIO' },
    ar: { aujourdhui: 'المقبوض اليوم · المحفظة', hier: 'المقبوض أمس · المحفظة', septJours: 'المقبوض في 7 أيام · المحفظة', trenteJours: 'المقبوض في 30 يومًا · المحفظة' },
  };
  const fusionLang = () => (window.KiwiI18n?.getLang?.() || 'fr');

  // ── Effective range with personnalise→aujourdhui fallback ──
  function fusionEffectiveRange() {
    const r = window.KiwiDateRange?.getDateRange?.() ?? 'aujourdhui';
    return r === 'personnalise' ? 'aujourdhui' : r;
  }

  const FUSION_MATERIAL_ICONS = { users: 'users', pie: 'pie-chart', link: 'link', alert: 'alert-triangle' };
  const fusionIcon = (key) => `<i data-lucide="${FUSION_MATERIAL_ICONS[key] || 'help'}" style="width:14px;height:14px" aria-hidden="true"></i>`;
  /* Portfolio rows use the same Material trade truth as the switcher. */
  const fusionTypeIcon = (type) => typeIconOf({ type });

  // ── SVG sparkline (80×32) — line stroke only, no axes ──
  function fusionSparkPath(values) {
    if (!values || values.length < 2) return '';
    const W = 80, H = 32, PAD = 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
  function fusionSparkSvg(values, positive) {
    const path = fusionSparkPath(values);
    const stroke = positive ? 'var(--atlas)' : 'var(--warning)';
    return `<svg class="fs-spark" width="80" height="32" viewBox="0 0 80 32" aria-hidden="true">
      <path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  // ── Stacked-area chart (Mode A intraday OR Mode B 30-day) ──
  // Axes rendered as HTML overlays (not <text> inside the SVG) so text
  // doesn't distort when the SVG stretches non-uniformly to fill its
  // container width via preserveAspectRatio="none".
  function fusionStackedAreaSvg(points, opts = {}) {
    const W = opts.width || 700;
    const H = opts.height || 220;
    if (!points || points.length === 0) {
      return `<div class="fs-chart-empty">Données en cours d'arrivée…</div>`;
    }
    const totals = points.map(p => (p.cafeAtlas || 0) + (p.maisonMansour || 0) + (p.spaBahia || 0));
    const maxY = Math.max(opts.minMax || 0, Math.max(...totals)) * 1.05 || 1;
    // Use the full SVG viewport for the plot area — y axis lives outside
    // (HTML overlay) so we don't reserve PAD_L inside the SVG anymore.
    const xOf = i => points.length <= 1 ? W / 2 : (i / (points.length - 1)) * W;
    const yOf = v => H - (v / maxY) * H;

    // Build stacked paths bottom-to-top: spaBahia base, then mansour, then atlas on top.
    const stack = (key, baseKeys) => {
      const pts = points.map((p, i) => {
        const base = baseKeys.reduce((acc, k) => acc + (p[k] || 0), 0);
        return { x: xOf(i), top: yOf(base + (p[key] || 0)), bot: yOf(base) };
      });
      const upper = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.top.toFixed(1)}`).join(' ');
      const lower = pts.slice().reverse().map(p => `L${p.x.toFixed(1)},${p.bot.toFixed(1)}`).join(' ');
      return `${upper} ${lower} Z`;
    };
    const pathSpa     = stack('spaBahia', []);
    const pathMansour = stack('maisonMansour', ['spaBahia']);
    const pathAtlas   = stack('cafeAtlas', ['spaBahia', 'maisonMansour']);

    // Y axis · HTML overlay (no distortion)
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const v = maxY * t;
      const label = v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`;
      return { pct: (1 - t) * 100, label };
    });
    const yHtml = yTicks.map(t => `<span style="top:${t.pct.toFixed(1)}%">${t.label}</span>`).join('');

    // Grid lines · still inside SVG so they stretch with the plot
    const gridSvg = yTicks.map(t => {
      const y = (t.pct / 100) * H;
      return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="0.10"/>`;
    }).join('');

    // X axis · HTML overlay, % positioning
    const every = opts.showXEvery || 1;
    const xLabels = points
      .map((p, i) => (i % every === 0 || i === points.length - 1)
        ? { pct: points.length <= 1 ? 50 : (i / (points.length - 1)) * 100, label: p.label }
        : null)
      .filter(Boolean);
    const xHtml = xLabels.map(l => `<span style="left:${l.pct.toFixed(1)}%">${l.label}</span>`).join('');

    return `
      <div class="fs-chart-frame">
        <div class="fs-chart-y-axis">${yHtml}</div>
        <div class="fs-chart-plot">
          <svg class="fs-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            ${gridSvg}
            <path d="${pathSpa}"     fill="var(--fs-bahia)"   opacity="0.92"/>
            <path d="${pathMansour}" fill="var(--fs-mansour)" opacity="0.92"/>
            <path d="${pathAtlas}"   fill="var(--fs-atlas)"   opacity="0.92"/>
          </svg>
        </div>
        <div class="fs-chart-x-axis">${xHtml}</div>
      </div>`;
  }
/* <</split:fusion>> */
    return { FUSION_PER_VENUE_TARGETS, FUSION_PER_VENUE_WEIGHTS, FUSION_HOUR_LABELS, FUSION_N, FUSION_PORTFOLIO_GOAL, FUSION_VENUE_IDS, fusionCumulativeAt, computePerVenueLive, fusionAnimateNumber, fusionFrInt, fusionFmtMad, fusionFmtMadCents, fusionFmtPct, fusionParseAmount, FUSION_DELTA_LABELS, FS_ULTRA_STR, FUSION_HERO_LABELS, fusionLang, fusionEffectiveRange, FUSION_MATERIAL_ICONS, fusionIcon, fusionTypeIcon, fusionSparkPath, fusionSparkSvg, fusionStackedAreaSvg };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).entries = function (__deps) {
    const {  } = __deps;
/* <<split:entries>> */
  function salesEntry(sale) {
    const entry = { ts: (sale && +sale.ts) || Date.now(), amount: Math.max(0, +(sale && sale.amount) || 0), method: (sale && sale.method) || 'card' };
    // What was actually sold. The till sends it and the live card shows it, but it
    // used to stop there — so the Ventes list read "Vente · Vente · Vente" and the
    // owner could not tell which row was the shirt a customer now wants to return.
    // Capped to match the server's own 80-char column.
    const lbl = String((sale && sale.label) || '').trim().slice(0, 80);
    if (lbl) entry.label = lbl;
    const ref = String((sale && sale.ref) || '').trim().slice(0, 80);
    const receiptRef = String((sale && sale.receiptRef) || '').trim().slice(0, 80);
    const origin = String((sale && sale.origin) || '').trim().slice(0, 16);
    const server = String((sale && sale.server) || '').trim().slice(0, 80);
    const channel = String((sale && sale.channel) || '').trim().slice(0, 24);
    const saleId = String((sale && (sale.saleId || sale.id)) || '').trim().slice(0, 80);
    if (ref) entry.ref = ref;
    if (receiptRef) entry.receiptRef = receiptRef;
    if (origin) entry.origin = origin;
    if (server) entry.server = server;
    if (channel) entry.channel = channel;
    if (saleId) entry.saleId = saleId;
    /* Le pourboire saisi à l'encaissement, en centimes, hors du montant. */
    const tipCents = Math.round(Number(sale && sale.tipCents));
    if (Number.isSafeInteger(tipCents) && tipCents > 0) entry.tipCents = tipCents;
    if (sale && Array.isArray(sale.paymentParts) && sale.paymentParts.length) {
      entry.paymentParts = sale.paymentParts.slice(0, 8).map(part => ({
        method: String((part && part.method) || '').slice(0, 16),
        amountCents: Math.round(Number(part && part.amountCents)),
      })).filter(part => /^[a-z-]{1,16}$/.test(part.method) && Number.isSafeInteger(part.amountCents) && part.amountCents > 0);
    }
    /* Optional discount facts are server-validated and stay attached to the
       immutable sale. Reject partial/code-shaped metadata at this second
       boundary rather than teaching analytics to guess. */
    if (sale && sale.discountAmountCents != null) {
      const gross = Math.round(Number(sale.grossAmountCents));
      const discount = Math.round(Number(sale.discountAmountCents));
      const reason = String(sale.discountReason || '');
      const actorId = String(sale.actorId || '').slice(0, 96);
      if (Number.isFinite(gross) && gross > 0 && Number.isFinite(discount) && discount > 0 && discount <= gross
        && /^(commercial|loyal-customer|kitchen-error|other)$/.test(reason)
        && /^[A-Za-z0-9:_-]{1,96}$/.test(actorId) && !/^\d{4}$/.test(actorId)) {
        entry.grossAmountCents = gross; entry.discountAmountCents = discount;
        entry.discountReason = reason; entry.actorId = actorId;
      }
    }
    // Live-Link sales carry the feed rowid as `cursor` — persisted so the bridge
    // dedups against the store itself and can never double-count or drift below it.
    if (sale && sale.cursor) entry.cursor = sale.cursor;
    /* Le panier, quand la caisse l'a envoyé. C'est la seule source de vérité
       par article pour un commerçant réel : le libellé est un résumé de ticket
       (« Pain +3 art. »), le classer reviendrait à classer des tickets en
       prétendant classer des produits. Absent ⇒ inconnu, jamais « panier vide ». */
    if (sale && Array.isArray(sale.lines) && sale.lines.length) {
      entry.lines = sale.lines.slice(0, 40).map(function (l) {
        var qty = Math.round(Math.max(0, +(l && (l.qty ?? l.quantity)) || 0) * 1000) / 1000;
        var total = Math.round(Math.max(0, +(l && l.total) || 0) * 100) / 100;
        var o = { name: String((l && l.name) || 'Article').slice(0, 60), qty: qty, total: total };
        var baseName = String((l && l.baseName) || '').slice(0, 60);
        if (baseName) o.baseName = baseName;
        /* La catégorie, telle que la caisse la connaissait AU MOMENT de la vente.
           Sans elle, le rapport journalier d'une journée pas encore clôturée
           reclasse les ventes d'après le catalogue actuel — et se trompe dès
           qu'un rayon a été renommé depuis. Absente ⇒ inconnue, jamais inventée. */
        var c = String((l && (l.cat || l.category)) || '').slice(0, 40);
        if (c) o.cat = c;
        var itemId = String((l && (l.itemId || l.id)) || '').slice(0, 80);
        var variantId = String((l && l.variantId) || '').slice(0, 80);
        var unit = String((l && l.unit) || '').slice(0, 24);
        var kind = String((l && l.kind) || '').slice(0, 24);
        var recipeVersionId = String((l && l.recipeVersionId) || '').slice(0, 80);
        if (itemId) o.itemId = itemId;
        if (variantId) o.variantId = variantId;
        if (unit) o.unit = unit;
        if (kind) o.kind = kind;
        if (recipeVersionId) o.recipeVersionId = recipeVersionId;
        var unitCost = +(l && l.unitCost);
        if (Number.isFinite(unitCost) && unitCost >= 0) o.unitCost = Math.round(unitCost * 100) / 100;
        if (Array.isArray(l && l.options)) o.options = l.options.slice(0, 16);
        return o;
      }).filter(function (l) { return l.qty > 0; });
      if (!entry.lines.length) delete entry.lines;
    }
    return entry;
  }
  /* Copie l'entrée et y pose les métadonnées du serveur. Rend la copie si
   * quelque chose a changé, sinon null (l'entrée d'origine, gelée, est intacte). */
  function annotatedEntry(original, meta) {
    const entry = Object.assign({}, original);
    let changed = false;
    [['ref', 80], ['receiptRef', 80], ['origin', 16], ['server', 80], ['channel', 24], ['saleId', 80]].forEach(([key, limit]) => {
      const value = String(meta && (meta[key] || (key === 'saleId' ? (meta.saleId || meta.id) : '')) || '').trim().slice(0, limit);
      if (value && entry[key] !== value) { entry[key] = value; changed = true; }
    });
    if (meta && Array.isArray(meta.paymentParts) && meta.paymentParts.length && !entry.paymentParts) {
      entry.paymentParts = meta.paymentParts.slice(0, 8).map(part => ({
        method: String((part && part.method) || '').slice(0, 16), amountCents: Math.round(Number(part && part.amountCents)),
      })).filter(part => /^[a-z-]{1,16}$/.test(part.method) && Number.isSafeInteger(part.amountCents) && part.amountCents > 0);
      changed = true;
    }
    /* Le pourboire peut être posé APRÈS la vente (reprise d'un dépôt déjà
     * enregistré) : une vente déjà copiée le reçoit ici, jamais à la baisse. */
    const tip = Math.round(Number(meta && meta.tipCents));
    if (Number.isSafeInteger(tip) && tip > (Number(entry.tipCents) || 0)) { entry.tipCents = tip; changed = true; }
    return changed ? entry : null;
  }
/* <</split:entries>> */
    return { salesEntry, annotatedEntry };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).totals = function (__deps) {
    const { refundsList, salesList } = __deps;
/* <<split:totals>> */
  /* Bornes FACULTATIVES. Sans elles le total reste ce qu'il a toujours été —
   * tout l'historique — parce que plusieurs appelants veulent précisément ça :
   * « ce commerce a-t-il déjà vendu une seule fois ? » (interactive.js) n'a pas
   * de période. Mais la pastille « Commandes » de la barre latérale, elle, en a
   * une : celle du tableau de bord, affichée juste à côté sous le même mot. */
  function salesTotals(id, from, to) {
    const list = salesList(id);
    const lo = (from == null) ? -Infinity : from;
    const hi = (to == null) ? Infinity : to;
    let revenue = 0, gross = 0, count = 0;
    list.forEach((x) => {
      const ts = +(x && x.ts) || 0;
      if (ts < lo || ts >= hi) return;
      revenue += (x.amount || 0); gross += (x.amount || 0);
      count++;
    });
    refundsList(id).forEach((x) => {
      const ts = +(x && x.ts) || 0;
      if (ts >= lo && ts < hi) revenue -= Math.abs(x.amount || 0);
    });
    return { revenue, count, basket: count ? gross / count : 0 };
  }
/* <</split:totals>> */
    return { salesTotals };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).stations = function (__deps) {
    const { MI_STATION_STATE } = __deps;
/* <<split:stations>> */
  /* The KDS uses a different (shorter) station vocabulary than the menu.
   * This maps KDS ids onto menu ids so one configuration drives both. */
  const MI_STATION_ALIASES = {
    cuisson:  'cuisine-chaude',
    salade:   'cuisine-froide',
    boissons: 'bar-jus',
    pastry:   'patisserie',
    crepes:   'creperie',
    bbq:      'cuisine-chaude',
  };
  /* Resolve a station's state with sensible defaults for any missing field,
   * KDS-style aliases included (cuisson → cuisine-chaude etc.). */
  function miStationState(s) {
    const key = MI_STATION_ALIASES[s] || s;
    const base = MI_STATION_STATE[key] || {};
    return {
      dot: base.dot || 'on',
      meta: base.meta || 'Opérationnelle',
      avgPrepMin: typeof base.avgPrepMin === 'number' ? base.avgPrepMin : 10,
      sync: typeof base.sync === 'boolean' ? base.sync : true,
    };
  }
/* <</split:stations>> */
    return { MI_STATION_ALIASES, miStationState };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).sidebar = function (__deps) {
    const { currentPlan } = __deps;
/* <<split:sidebar>> */

  /* ═══════════════ RENDER: SIDEBAR VERTICAL SECTION ═══════════════ */

  /* Sidebar block shown in fusion mode in place of the per-vertical section.
   * 4 cross-store KPIs that only make sense at the portfolio level. */
  function fusionSidebarHtml() {
    const ultraPill = currentPlan === 'ultra'
      ? '<span class="fk-ultra">✦ ULTRA</span>'
      : '';
    return `
      <div class="fusion-kpis">
        <div class="fk-head"><i></i><span>VUE PORTFOLIO</span>${ultraPill}</div>
        <div class="fk-row"><span class="fk-l">Emplacements actifs</span><span class="fk-v">3 / 3</span></div>
        <div class="fk-row"><span class="fk-l">CA cumulé · 30j</span><span class="fk-v">1,47 M MAD</span></div>
        <div class="fk-row"><span class="fk-l">Top site</span><span class="fk-v">Café Atlas</span></div>
        <div class="fk-row"><span class="fk-l">Personnel total</span><span class="fk-v">14</span></div>
        <div class="fk-row"><span class="fk-l">Clients cross-site</span><span class="fk-v">312</span></div>
      </div>
    `;
  }
/* <</split:sidebar>> */
    return { fusionSidebarHtml };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).icon = function (__deps) {
    const {  } = __deps;
/* <<split:icon>> */

  /* ═══════════════ RENDER: SIDEBAR DROPDOWN ═══════════════ */

  /* One icon truth for every surface. The old switcher had a second, family-
   * level Lucide table, so a pressing inherited Boutique's shopping bag and a
   * café inherited Restaurant's cutlery. KiwiTrades already owns the precise
   * Material Symbol for every trade; resolve the subtype first and use the
   * broad family only as a fallback for older venue records. */
  const MATERIAL_VENUE_FALLBACK = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m260-520 220-360 220 360H260ZM700-80q-75 0-127.5-52.5T520-260q0-75 52.5-127.5T700-440q75 0 127.5 52.5T880-260q0 75-52.5 127.5T700-80Zm-580-20v-320h320v320H120Z"/></svg>';
  function typeIconOf(v) {
    const trades = window.KiwiTrades;
    if (trades?.get) {
      const exact = trades.get(v?.subtype || '');
      if (exact?.icon) return exact.icon;
      const family = trades.get(v?.type || '');
      if (family?.icon) return family.icon;
    }
    return MATERIAL_VENUE_FALLBACK;
  }
/* <</split:icon>> */
    return { MATERIAL_VENUE_FALLBACK, typeIconOf };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).cache = function (__deps) {
    const {  } = __deps;
/* <<split:cache>> */
  /* One parse per change of the stored text, not per read. A dashboard
   * redraw reads the ledger about fifty times; with 2 848 sales (1.2 MB) each
   * JSON.parse cost ~5 ms, so one click on a date range spent ~350 ms
   * re-parsing the same string. The stored text is still read every time, so
   * another tab's write is seen at once. The cached rows are frozen, nested
   * objects included: a reader can never alter the shared copy, and the few
   * writers below copy before changing anything. */
  const ledgerCache = new Map();
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
    return o;
  }
  function cachedLedger(key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) { return []; }
    const hit = ledgerCache.get(key);
    if (hit && hit.raw === raw) return hit.rows;
    let rows = [];
    try { const a = JSON.parse(raw || '[]'); rows = Array.isArray(a) ? a : []; } catch (_) { rows = []; }
    ledgerCache.set(key, { raw, rows: deepFreeze(rows) });
    return rows;
  }
/* <</split:cache>> */
    return { ledgerCache, deepFreeze, cachedLedger };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).reconcile = function (__deps) {
    const { refundSubs, refundsList, refundsWrite, salesEntry, salesList, salesSubs, salesWrite } = __deps;
/* <<split:reconcile>> */
  function salesReconcile(id, raw, proof) {
    const helper = window.KiwiSalesReconcile;
    if (!helper || helper.coverage(id) !== proof.from || helper.scope(id) !== proof.scope) throw new Error('scope');
    const sales = helper.reconcile(salesList(id), raw, proof, 1, salesEntry);
    const refunds = helper.reconcile(refundsList(id), raw, proof, -1, row => ({
      ts: row.ts, amount: row.amount, method: row.method, kind: 'refund',
      label: row.label || 'Remboursement', ref: row.ref || '', cursor: row.cursor, saleId: row.saleId,
    }));
    const salesChanged = JSON.stringify(sales) !== JSON.stringify(salesList(id));
    const refundsChanged = JSON.stringify(refunds) !== JSON.stringify(refundsList(id));
    if ((salesChanged && !salesWrite(id, sales)) || (refundsChanged && !refundsWrite(id, refunds))) throw new Error('ledger');
    const verified = helper.verify(salesList(id), refundsList(id), raw, proof);
    if (salesChanged || refundsChanged) salesSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    if (refundsChanged) refundSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    return verified;
  }
/* <</split:reconcile>> */
    return { salesReconcile };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).menuRouting = function (__deps) {
    const { MENU_TYPES, getVenueType } = __deps;
/* <<split:menuRouting>> */
  function menuWorkspace() {
    const W = window.KiwiRestaurantMenuWorkspace;
    return W && typeof W.show === 'function' ? W : null;
  }
  function menuOwnedByWorkspace() {
    const W = menuWorkspace();
    if (W && typeof W.isRestaurant === 'function') return W.isRestaurant();
    return MENU_TYPES.includes(String(getVenueType() || '').toLowerCase());
  }
/* <</split:menuRouting>> */
    return { menuWorkspace, menuOwnedByWorkspace };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).menuDashboard = function (__deps) {
    const { menuNavHandler } = __deps;
/* <<split:menuDashboard>> */
  /* The workspace never wraps nav-accueil: leaving its page for the dashboard
   * clears the menu shell here. */
  function menuShowDashboard() {
    if (!document.body.classList.contains('page-menu')) return;
    document.body.classList.remove('page-menu');
    window.Kiwi?.breadcrumb?.();
    window.Kiwi?.setActivePage?.('accueil');
  }
  function menuWireHandlers() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) { setTimeout(menuWireHandlers, 30); return; }
    H['nav-menu'] = menuNavHandler;
    const origAccueil = H['nav-accueil'];
    H['nav-accueil'] = function () {
      try { if (origAccueil) origAccueil.apply(this, arguments); } catch (_) {}
      menuShowDashboard();
    };
  }
/* <</split:menuDashboard>> */
    return { menuShowDashboard, menuWireHandlers };
  };
  (window.__kiwiVenueParts = window.__kiwiVenueParts || {}).escaping = function (__deps) {
    const { STAFF } = __deps;
/* <<split:escaping>> */                         // weeks per month

  function eqEsc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function eqAllStaff() { return [...STAFF.cafeAtlas, ...STAFF.spaBahia, ...STAFF.maisonMansour]; }
/* <</split:escaping>> */
    return { eqEsc, eqAllStaff };
  };
})();
