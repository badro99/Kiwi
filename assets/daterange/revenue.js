/* Owner: dashboard revenue. Exports: renderRevChart, hourlyCumul, dailyTotals, realRevSeries, revChartByVenue.
 * Sibling calls via live owner: merchantDayKey, merchantParts.
 * Reads live owner: CMP_EMPTY_TITLE, COMPARE_CAPTION, COMPARE_SHORT, DAY_ABBR, LEGEND_PREFIX, REV_BADGE, REV_SUB, activeMerchantSlug, addMerchantDays, animateNumber, arrowSvg, closedBounds, curUnit, currentRange, demoHeroSim, demoPreviousAt, effRange, frInt, frMoney, getCurrentVenue, getLang, getSim, guardOperatorFigures, homeSet, isLiveDemo, liveTickInProgress, localDayTick, merchantDayBounds, merchantDayKey, niceCeil, operatorUnavailableText, ownData, parseAmountFromEl, realMoneyList, realRevSeries, revChartByVenue, showComparison, trLegend, trStr, vData.
 * Reads globalThis: KiwiZoneLaw.
 * Reads window: KiwiNumber, KiwiSales. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['revenue'] = function (__state) {
  function merchantDayKey(...args) { return __state.merchantDayKey.apply(this, args); }
  function merchantParts(...args) { return __state.merchantParts.apply(this, args); }
function renderRevChart() {
    if (__state.guardOperatorFigures('[data-rev-svg], [data-rev-legend], [data-rev-hero-delta], [data-rev-range-badge], [data-rev-compare-caption]')) {
      const value = document.querySelector('[data-rev-hero-val]');
      if (value) value.textContent = '…';
      const sub = document.querySelector('[data-rev-sub]');
      if (sub) sub.textContent = __state.operatorUnavailableText();
      return;
    }
    const lang = __state.getLang();
    const effective = __state.effRange();
    let data = __state.vData(__state.revChartByVenue, __state.currentRange);
    if (!data) return;
    const svg = document.querySelector('[data-rev-svg]');
    if (!svg) return;

    // User-created venue — plot the merchant's REAL sales for the active range
    // (bucketed from KiwiSales), replacing the zeroed demo clone that draws a
    // flat line AND leaks the demo legend total. Matches the hero / KPI window.
    if (__state.ownData() && window.KiwiSales) {
      data = { ...data, ...__state.realRevSeries(__state.currentRange) };
    }

    // ─── Live-demo override on aujourdhui ────────────────────────────────
    // Build a "today so far" curve from the demo clock. Line truncates to
    // the current sim position; pulse + tooltip anchor at that live point.
    let liveSimIdx = -1;     // -1 = no live cursor
    let liveSimWithin = 0;   // 0..1 within liveSimIdx hour
    if (__state.isLiveDemo() && !data._demoLedger) {
      const sim = __state.getSim();
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
          legendPrimary: `Cumul aujourd'hui · ${__state.frInt(sim.cumRevenue)} MAD`,
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
    const H = Math.max(150, Math.round(svg.clientHeight || 240));
    const measured = Math.round(svg.clientWidth || svg.parentElement?.clientWidth || 820);
    // Phones draw at their real width: a 620-unit floor scaled a 375px chart
    // down to 60 %, shrinking the hour labels to 7px and letterboxing the curve.
    const W = measured < 620 ? Math.max(300, measured) : measured;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Detect why we're re-rendering: full (range change) vs resize vs compare-toggle vs live-tick.
    const lastW = parseInt(svg.dataset.lastW || '0', 10);
    const lastRange = svg.dataset.lastRange || '';
    const lastShowCmp = svg.dataset.lastShowCmp === '1';
    const showCmpFlag = !!__state.showComparison;
    const sameRange = lastRange === effective;
    const sameW = lastW > 0 && Math.abs(W - lastW) <= 2;
    const isResizeOnly = sameRange && lastW > 0 && Math.abs(W - lastW) > 2;
    const isCmpToggle  = sameRange && sameW && (lastShowCmp !== showCmpFlag);
    // On live ticks the line GROWS — no draw-in animation, no halo replay.
    const suppressAnim = isResizeOnly || (sameRange && __state.liveTickInProgress);
    svg.dataset.lastW = String(W);
    svg.dataset.lastRange = effective;
    svg.dataset.lastShowCmp = showCmpFlag ? '1' : '0';
    svg.classList.toggle('no-anim', suppressAnim);
    svg.classList.toggle('cmp-toggle', isCmpToggle);

    // Hourly ranges plot a running total; daily ranges plot one total per
    // business day, and their hover snaps to whole days. It used to read out
    // « Mar 6 · 14h », a value interpolated between two days that nobody sold.
    const isHourly = !!data.xLabels?.[0]?.endsWith('h');
    const N = data.rev.length;
    const daily = !isHourly && N > 1;
    const PAD = { left: 20, right: 26, top: daily ? 34 : 26, bottom: 40 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const slot = innerW / Math.max(1, N - 1);
    const xAt = i => PAD.left + (N <= 1 ? innerW / 2 : (i * innerW) / (N - 1));
    const xs = data.rev.map((_, i) => xAt(i));

    const yTicks = data.yTicks;
    let yMin = Math.min(...yTicks);
    // Guard the all-zero case (empty user-created venue) — yMax===yMin would
    // make yScale divide by zero.
    let yMax = Math.max(...yTicks) || (yMin + 1);
    // A daily line is read for its shape, and the hero carries the amount: fit
    // the box to the days' own range (both periods, so « Comparer » never
    // rescales), never below zero. From zero, ±15 % days drew a flat rule.
    if (daily) {
      const vals = data.rev.concat(data.revPrev || []).filter(v => v != null).map(Number);
      const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || hi || 1;
      yMin = Math.max(0, lo - span * 0.45);
      yMax = hi + span * 0.32;
    }
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

    // Resting hero readout:
    // - On hourly ranges (aujourdhui / hier), points are cumulative so the last
    //   non-null point is the day's total.
    // - On daily/multi-day ranges (7j, 30j, personnalisé...), points are discrete
    //   daily buckets. The hero number must show the full period's total revenue,
    //   not just the revenue of the last single day.
    let restingVal, restingPrev;
    if (isHourly) {
      restingVal = lastIdx >= 0 ? (data.rev[lastIdx] || 0) : 0;
      restingPrev = (data.revPrev && lastIdx >= 0) ? (data.revPrev[lastIdx] || 0) : null;
      if (__state.isLiveDemo()) {
        // Resize and hydration must reuse the goal card snapshot, not sample
        // a later sub-second demo time and round to a different percentage.
        const sim = __state.demoHeroSim?.venue === __state.getCurrentVenue() ? __state.demoHeroSim : __state.getSim();
        if (sim) { restingVal = sim.cumRevenue; restingPrev = __state.demoPreviousAt(sim); }
      }
    } else {
      if (data.total != null) {
        restingVal = data.total;
      } else {
        restingVal = data.rev.reduce((s, x) => s + (x || 0), 0);
      }
      if (data.prevTotal != null) {
        restingPrev = data.prevTotal;
      } else if (data.revPrev) {
        restingPrev = data.revPrev.reduce((s, x) => s + (x || 0), 0);
      } else {
        restingPrev = null;
      }
    }
    /* Design 2027 (kiwiSkin2027:dashboard) : la même série, pour la courbe du
     * kit sur téléphone ; le point vivant garde sa fraction d'heure. */
    typeof __state.homeSet === 'function' && __state.homeSet('chart', {
      range: effective, hourly: isHourly, labels: (data.xLabels || []).slice(), rev: data.rev.slice(),
      prev: data.revPrev ? data.revPrev.slice() : null, tip: liveTipIdx, within: data._simWithin || 0,
      value: restingVal, prevValue: restingPrev,
    });
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
    const liveIdx = __state.isLiveDemo() ? lastIdx : Math.min(3, lastIdx);
    const liveX = showLive ? xForIdx(liveIdx) : 0;
    const liveY = (showLive && data.rev[liveIdx] != null) ? yScale(data.rev[liveIdx]) : 0;

    const AVG_LBL = { fr: 'Moyenne', en: 'Average', ar: 'المتوسط' };
    const SO_FAR = { fr: 'en cours', en: 'so far', ar: 'حتى الآن' };
    const LOCALE = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
    const keys = daily ? (data.dayKeys || keysFromLabels(data.xLabels)) : null;
    const sold = daily ? data.rev.filter(v => +v > 0) : [];
    const bestIdx = sold.length >= 2 ? data.rev.reduce((b, v, i) => ((+v || 0) > (+data.rev[b] || 0) ? i : b), 0) : -1;
    const todayIdx = daily && data.dayKeys && data.dayKeys[N - 1] === __state.merchantDayKey(Date.now(), __state.activeMerchantSlug()) ? N - 1 : -1;
    // Demo/partial series can have fewer points than the template's tick list.
    // Ignore stale ticks rather than aborting every language-change subscriber.
    const allIdx = (data.visibleXIdx || data.rev.map((_, i) => i))
      .filter(i => Number.isInteger(i) && i >= 0 && i < xs.length && Number.isFinite(xs[i]));
    // Keep at least ~34px per label so hour ticks never touch on a phone.
    const labelStep = Math.max(1, Math.ceil(allIdx.length / Math.max(1, Math.floor(W / 34))));
    const visibleIdx = labelStep === 1 ? allIdx : allIdx.filter((_, k) => k % labelStep === 0);
    let xLabelsHtml = visibleIdx.map(i =>
      `<text x="${xs[i].toFixed(1)}" y="${(H - 14).toFixed(1)}" text-anchor="middle">${__state.localDayTick(data.xLabels[i] || '')}</text>`
    ).join('');
    // Past ten days the axis is read by the week: a date and a short tick on
    // each Monday (on each first of the month past a hundred days).
    if (daily && keys && N > 10) {
      const monthly = N > 100, by = baseY;
      const fmt = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(LOCALE[lang] || 'fr-FR', monthly ? { month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
      let lastX = -Infinity;
      xLabelsHtml = keys.map((k, i) => {
        const d = new Date(k + 'T12:00:00Z');
        if (i === 0 || (monthly ? d.getUTCDate() !== 1 : d.getUTCDay() !== 1)) return '';
        const x = xs[i], txt = fmt.format(d);
        if (x - lastX < (monthly ? 34 : 52)) return '';
        lastX = x;
        const tx = Math.max(PAD.left + 18, Math.min(W - PAD.right - 18, x));
        return `<line class="rev-week" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${(by + 4).toFixed(1)}" y2="${(by + 9).toFixed(1)}" stroke="rgba(247,245,240,0.25)"/>` +
          `<text x="${tx.toFixed(1)}" y="${(H - 14).toFixed(1)}" text-anchor="middle">${txt}</text>`;
      }).join('');
    }
    // Robinhood-clean: no y-axis labels — the hero readout + scrubber carry
    // the exact figures, so the line floats free of gridline clutter.
    const yLabelsHtml = '';

    const showCmp = !!__state.showComparison;
    const captionFull = __state.COMPARE_CAPTION[lang]?.[__state.currentRange] || __state.COMPARE_CAPTION.fr[__state.currentRange] || '';
    const captionShort = __state.COMPARE_SHORT[lang]?.[__state.currentRange] || __state.COMPARE_SHORT.fr[__state.currentRange] || '';

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
      ${daily ? dailyMarks() : ''}
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
        <text class="rev-tip-label" x="0" text-anchor="middle" font-family="Inter Tight" font-weight="500" font-size="12" fill="#7DF2B0" opacity="0.92"></text>
        <text class="rev-tip-value" x="0" text-anchor="middle" font-family="Inter Tight" font-weight="600" font-size="17" fill="#FFFFFF" letter-spacing="-0.01em"></text>
        <text class="rev-tip-cmp"   x="0" text-anchor="middle" font-family="Inter Tight" font-weight="500" font-size="11" letter-spacing="0"></text>
        ${daily ? `<line class="rev-tip-rule" stroke="rgba(247,245,240,0.12)" stroke-width="1"/>
        <line class="rev-tip-swatch" stroke="rgba(247,245,240,0.55)" stroke-width="1.5" stroke-linecap="round"/>
        <rect class="rev-tip-pill" rx="9" ry="9" height="18"/>
        <text class="rev-tip-delta" font-family="Inter Tight" font-weight="600" font-size="11" text-anchor="middle"></text>` : ''}
      </g>
      <rect class="rev-hit" x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent" pointer-events="all"/>
    `;

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
      const txt = (Math.abs(abs - Math.round(abs)) < 0.05) ? String(Math.round(abs)) : (window.KiwiNumber?.number(abs, 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format(abs));
      return `${sign}${txt} %`;
    }

    // Robinhood-style hero readout: a big live figure that the scrubber drives.
    function setHero(val, prev, animate) {
      const vEl = document.querySelector('[data-rev-hero-val]');
      const dEl = document.querySelector('[data-rev-hero-delta]');
      if (vEl) {
        // The group space is U+202F; at the hero's tight tracking it closed up
        // and 944 489,70 read as 944489,70. It gets its own untracked span.
        const fmtV = (v) => `${String(__state.frMoney(v)).replace(/[\u202F\u00A0 ]/g, '<span class="rev-hero-sep">\u202F</span>')}<span class="rev-hero-cur">${__state.curUnit()}</span>`;
        if (animate) __state.animateNumber(vEl, __state.parseAmountFromEl(vEl), val, { duration: 720, format: fmtV });
        else vEl['inner' + 'HTML'] = fmtV(val);
      }
      if (dEl) {
        if (prev != null && prev > 0) {
          const diff = Math.round(val - prev);
          const up = diff >= 0;
          dEl.className = 'rev-hero-delta ' + (up ? 'up' : 'down');
          dEl['inner' + 'HTML'] = `${__state.arrowSvg(up)}<span>${up ? '+' : '−'}${__state.frInt(Math.abs(diff))} MAD · ${fmtDeltaPct(val, prev)}</span><span class="lbl">${captionShort || 'vs préc.'}</span>`;
        } else {
          dEl.className = 'rev-hero-delta is-empty';
          dEl['inner' + 'HTML'] = '';
        }
      }
    }

    /* ── Daily columns ──────────────────────────────────────────────────
     * Rest state: every day a quiet column, the best day solid and named,
     * a dashed line at the average of the days that sold. Comparing adds a
     * thin mark per day at the previous period's same day. The pointer
     * snaps to whole days and lights one column. */
    // Demo series carry « Mar 22 » ticks and no dates: walk back from today to
    // the last tick's weekday and day of month, then count backwards.
    function keysFromLabels(labels) {
      const m = /^(dim|lun|mar|mer|jeu|ven|sam)\.?\s+(\d{1,2})$/i.exec(labels?.[labels.length - 1] || '');
      if (!m) return null;
      let t = Date.parse(__state.merchantDayKey(Date.now(), __state.activeMerchantSlug()) + 'T12:00:00Z');
      for (let k = 0; k < 40; k++, t -= 864e5) {
        const d = new Date(t);
        if (d.getUTCDate() === +m[2] && d.getUTCDay() === __state.DAY_ABBR.findIndex(a => a.toLowerCase() === m[1].toLowerCase())) {
          return labels.map((_, i) => new Date(t - (labels.length - 1 - i) * 864e5).toISOString().slice(0, 10));
        }
      }
      return null;
    }
    function dayName(i, shift) {
      if (!keys?.[0]) return shift ? '' : __state.localDayTick(data.xLabels[i] || '');
      const t = Date.parse(keys[0] + 'T12:00:00Z') + (i + shift) * 864e5;
      const s = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(LOCALE[lang] || 'fr-FR', { weekday: 'long', day: 'numeric', month: shift ? 'short' : 'long', timeZone: 'UTC' }).format(t);
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function compact(v) {
      return v >= 10000 ? (window.KiwiNumber?.number?.(v / 1000, 1) ?? (v / 1000).toFixed(1)) + ' k' : __state.frInt(v);
    }
    /* Rest-state reading of a daily line: a dashed average of the days that
     * sold, the best day marked and named, and the last day closed by a dot. */
    function dailyMarks() {
      let out = '';
      if (sold.length >= 2) {
        const mean = sold.reduce((a, v) => a + (+v), 0) / sold.length, ay = yScale(mean).toFixed(1);
        out += `<line class="rev-avg" x1="${PAD.left}" x2="${(W - PAD.right).toFixed(1)}" y1="${ay}" y2="${ay}" stroke="rgba(247,245,240,0.4)" stroke-dasharray="2 5"/>` +
          `<text class="rev-avg-lbl" x="${(W - PAD.right).toFixed(1)}" y="${(+ay - 8).toFixed(1)}" text-anchor="end">${AVG_LBL[lang] || AVG_LBL.fr} · ${__state.frInt(mean)} ${__state.curUnit()}</text>`;
      }
      if (bestIdx >= 0) {
        const bx = xs[bestIdx], by = yScale(+data.rev[bestIdx]);
        const lx = Math.max(PAD.left + 20, Math.min(W - PAD.right - 20, bx));
        out += `<circle class="rev-best-halo" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="9" fill="#7DF2B0" fill-opacity="0.16"/>` +
          `<circle class="rev-best-dot" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4" fill="#7DF2B0" stroke="#053B2C" stroke-width="2"/>` +
          `<text class="rev-best-lbl" x="${lx.toFixed(1)}" y="${(by - 15).toFixed(1)}" text-anchor="middle">${compact(+data.rev[bestIdx])}</text>`;
      }
      if (lastIdx >= 0 && lastIdx !== bestIdx) {
        out += `<circle class="rev-end-dot" cx="${xs[lastIdx].toFixed(1)}" cy="${yScale(+data.rev[lastIdx] || 0).toFixed(1)}" r="3.5" fill="#7DF2B0" stroke="#053B2C" stroke-width="2"/>`;
      }
      return `<g class="rev-marks" font-family="Inter Tight" font-size="10.5" font-weight="600" fill="rgba(247,245,240,0.7)">${out}</g>`;
    }
    function moveDaily(evt) {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const xVB = ((evt.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(N - 1, Math.round((xVB - PAD.left) / slot)));
      if (data.rev[i] == null) { leave(); return; }
      const v = +data.rev[i] || 0;
      const p = data.revPrev ? (+data.revPrev[i] || 0) : null;
      const cmpOn = !!__state.showComparison && p != null;
      const sx = xs[i], sy = yScale(v);
      aDot.setAttribute('cx', sx.toFixed(1)); aDot.setAttribute('cy', sy.toFixed(1));
      aCmp.style.display = cmpOn ? '' : 'none';
      if (cmpOn) { aCmp.setAttribute('cx', sx.toFixed(1)); aCmp.setAttribute('cy', yScale(p).toFixed(1)); }
      cross?.setAttribute('x1', sx.toFixed(1)); cross?.setAttribute('x2', sx.toFixed(1));
      /* The day's card: date, then the amount with its unit set small. When
       * comparing, a hairline, then the same day of the previous period keyed
       * by a swatch of its line, with the change in a pill. */
      const q = c => svg.querySelector(c);
      const rule = q('.rev-tip-rule'), swatch = q('.rev-tip-swatch'), pill = q('.rev-tip-pill'), delta = q('.rev-tip-delta');
      const d = cmpOn ? fmtDeltaPct(v, p) : '';
      tip.classList.add('is-day');
      tip.classList.toggle('is-cmp', cmpOn);
      [tipLabel, tipValue, tipCmp].forEach(t => t.setAttribute('text-anchor', 'start'));
      tipLabel.textContent = dayName(i, 0) + (i === todayIdx ? ' · ' + (SO_FAR[lang] || SO_FAR.fr) : '');
      tipValue.innerHTML = `${__state.frMoney(v)}<tspan class="rev-tip-cur" dx="5" font-size="11" font-weight="600" fill="rgba(247,245,240,0.55)">${__state.curUnit()}</tspan>`;
      tipCmp.textContent = cmpOn ? `${dayName(i, -N) || captionShort} · ${__state.frInt(p)} ${__state.curUnit()}` : '';
      delta.textContent = d;
      [tipCmp, rule, swatch].forEach(el => { el.style.display = cmpOn ? '' : 'none'; });
      [pill, delta].forEach(el => { el.style.display = cmpOn && d ? '' : 'none'; });
      pill.classList.toggle('down', v < p); delta.classList.toggle('down', v < p);
      pill.setAttribute('fill', v < p ? 'rgba(252,165,151,0.16)' : 'rgba(125,242,176,0.16)');
      delta.setAttribute('fill', v < p ? '#FCA597' : '#7DF2B0');
      const PX = 16, pillW = d ? Math.ceil(delta.getComputedTextLength()) + 14 : 0;
      const cmpW = cmpOn ? 18 + tipCmp.getComputedTextLength() + (pillW ? 12 + pillW : 0) : 0;
      const tipW = Math.ceil(Math.max(150, tipLabel.getComputedTextLength(), tipValue.getComputedTextLength(), cmpW)) + PX * 2;
      const tipH = cmpOn ? 100 : 66, GAP = 14;
      // Beside the day, never over its point: right of it, left near the end.
      const left = sx + GAP + tipW <= W - 4 ? sx + GAP : sx - GAP - tipW;
      const ty = Math.max(4, Math.min(H - PAD.bottom - tipH, sy - tipH / 2));
      tipRect.setAttribute('x', '0'); tipRect.setAttribute('y', '0');
      tipRect.setAttribute('width', tipW); tipRect.setAttribute('height', tipH);
      tipLabel.setAttribute('x', PX); tipLabel.setAttribute('y', '25');
      tipValue.setAttribute('x', PX); tipValue.setAttribute('y', '50');
      if (cmpOn) {
        rule.setAttribute('x1', PX); rule.setAttribute('x2', tipW - PX); rule.setAttribute('y1', '66.5'); rule.setAttribute('y2', '66.5');
        swatch.setAttribute('x1', PX); swatch.setAttribute('x2', PX + 10); swatch.setAttribute('y1', '83'); swatch.setAttribute('y2', '83');
        tipCmp.setAttribute('x', PX + 18); tipCmp.setAttribute('y', '87');
        pill.setAttribute('x', tipW - PX - pillW); pill.setAttribute('y', '74'); pill.setAttribute('width', pillW);
        delta.setAttribute('x', tipW - PX - pillW / 2); delta.setAttribute('y', '87');
      }
      tip.setAttribute('transform', `translate(${Math.max(4, left).toFixed(1)}, ${ty.toFixed(1)})`);
      svg.classList.add('is-hover');
      setHero(v, null, false);
    }
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
        // Single-day series (a one-day custom range): no columns to snap to.
        sx = xs[0]; sy = yScale(data.rev[0] || 0);
        valueAtCursor = data.rev[0] || 0; prevAtCursor = data.revPrev ? data.revPrev[0] : null;
        cmpY = prevAtCursor != null ? yScale(prevAtCursor) : null;
        timeLabel = __state.localDayTick(data.xLabels[0] || ''); refIdx = 0;
      }

      const showCmpNow = !!__state.showComparison && cmpY != null;

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

      // Tooltip — two heights: compact (180×54) when no compare, expanded (224×84) with compare
      const tipW = showCmpNow ? 224 : 180;
      const tipH = showCmpNow ? 84  : 54;
      const ANCHOR_GAP = 16;        // gap between tooltip edge and the hovered dot
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
      tipRect.setAttribute('width',  tipW);
      tipRect.setAttribute('height', tipH);

      // Vertical layout inside the rect: text positions are relative to
      // rectY, so they flip automatically with the rect.
      if (showCmpNow) {
        tipLabel.setAttribute('y', (rectY + 22).toFixed(1));   // top row
        tipValue.setAttribute('y', (rectY + 48).toFixed(1));   // middle
        tipCmp  .setAttribute('y', (rectY + 70).toFixed(1));   // bottom
      } else {
        tipLabel.setAttribute('y', (rectY + 22).toFixed(1));
        tipValue.setAttribute('y', (rectY + 44).toFixed(1));
      }

      // Anchor at the dot; horizontal clamping keeps it on-canvas.
      const tipDy = sy;
      const halfW = tipW / 2 + 8;
      let tipDx = 0;
      if (sx - halfW < 4)         tipDx = halfW + 8 - sx;          // push right
      else if (sx + halfW > W - 4) tipDx = -((sx + halfW) - (W - 4)); // push left
      tip.setAttribute('transform', `translate(${(sx + tipDx).toFixed(1)}, ${tipDy.toFixed(1)})`);

      // Content — time label + interpolated value
      tipLabel.textContent = timeLabel;
      tipValue.textContent = `${__state.frInt(valueAtCursor)} ${__state.curUnit()}`;
      if (showCmpNow && prevAtCursor != null) {
        const delta = fmtDeltaPct(valueAtCursor, prevAtCursor);
        // Green tooltip bg: positive delta = mint, negative = warm red. Label muted mint.
        const deltaColor = (valueAtCursor >= prevAtCursor) ? '#7DF2B0' : '#FCA597';
        tipCmp.innerHTML =
          `<tspan fill="rgba(199,234,212,0.85)">${captionShort} · ${__state.frInt(prevAtCursor)} MAD&#160;&#160;</tspan>` +
          `<tspan fill="${deltaColor}" font-weight="600">${delta}</tspan>`;
        tipCmp.style.display = '';
      } else {
        tipCmp.style.display = 'none';
      }
      svg.classList.add('is-hover');
      setHero(valueAtCursor, prevAtCursor, false);
    }
    function leave() {
      svg.classList.remove('is-hover');
      setHero(restingVal, restingPrev, false);
    }
    hit.addEventListener('pointermove', daily ? moveDaily : move);
    hit.addEventListener('pointerenter', daily ? moveDaily : move);
    hit.addEventListener('pointerleave', leave);

    // Hero readout — latest cumulative figure + delta vs the comparison.
    setHero(restingVal, restingPrev, !suppressAnim);

    // Header text
    const badge = document.querySelector('[data-rev-range-badge]');
    if (badge) badge.textContent = __state.trStr(data.rangeBadge, __state.REV_BADGE);
    const sub = document.querySelector('[data-rev-sub]');
    if (sub) sub.textContent = __state.trStr(data.sub, __state.REV_SUB);

    /* No previous period, no comparison to make. Left enabled the button reads
     * as broken — you press it and the chart doesn't move. Disabled, with the
     * reason on the tooltip, it reads as what it is: there is nothing yet to
     * compare this period against. */
    const cmpBtn = document.querySelector('[data-rev-compare-btn]');
    if (cmpBtn) {
      const canCompare = Array.isArray(data.revPrev) && data.revPrev.length > 0;
      cmpBtn.disabled = !canCompare;
      if (canCompare) cmpBtn.removeAttribute('title');
      else cmpBtn.setAttribute('title', __state.trStr('Aucune période précédente à comparer', __state.CMP_EMPTY_TITLE));
    }

    // Legend (revenue lines only — transactions count moved to KPI band)
    const legend = document.querySelector('[data-rev-legend]');
    if (legend) {
      legend['inner' + 'HTML'] = `
        <label><i class="leg-line leg-line-primary"></i>${__state.trLegend(data.legendPrimary || '', __state.LEGEND_PREFIX)}</label>
        ${showCmp && data.legendCompare
          ? `<label class="leg-cmp"><i class="leg-line leg-line-compare"></i>${__state.trLegend(data.legendCompare, __state.LEGEND_PREFIX)}</label>`
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
function hourlyCumul(list, base, end) {
    const hours = Math.max(1, Math.ceil((end - base) / 3600000));
    const per = new Array(hours).fill(0);
    list.forEach(e => {
      const ts = +e.ts || 0;
      if (ts >= base && ts < end) {
        const idx = Math.floor((ts - base) / 3600000);
        if (idx >= 0 && idx < hours) per[idx] += (+e.amount || 0);
      }
    });
    const out = [];
    let acc = 0;
    for (let h = 0; h < hours; h++) { acc += per[h]; out.push(acc); }
    return out;
  }

function dailyTotals(list, start, days) {
    const out = new Array(days).fill(0);
    const startDay = merchantDayKey(start, __state.activeMerchantSlug());
    list.forEach(e => {
      const ts = +e.ts || 0;
      if (ts >= start) {
        const day = merchantDayKey(ts, __state.activeMerchantSlug());
        const idx = Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(startDay + 'T00:00:00Z')) / 864e5);
        if (idx >= 0 && idx < days) out[idx] += (+e.amount || 0);
      }
    });
    return out;
  }

function realRevSeries(range) {
    range = range == null ? __state.currentRange : range;
    const list = __state.realMoneyList();
    const hourly = (range === 'aujourdhui' || range === 'hier');
    let rev = [], prev = [], xLabels = [], visibleXIdx = [], dayKeys = null, sub = '', rangeBadge = '', cmpPrefix = '', total = 0, prevTotal = 0;

    if (hourly) {
      const slug = __state.activeMerchantSlug();
      const todayDay = merchantDayKey(Date.now(), slug);
      const day = __state.addMerchantDays(todayDay, range === 'hier' ? -1 : 0);
      const previousDay = __state.addMerchantDays(day, -1);
      const currentWindow = __state.merchantDayBounds(day, slug);
      const previousWindow = __state.merchantDayBounds(previousDay, slug);
      const base = currentWindow.from;
      rev = hourlyCumul(list, currentWindow.from, currentWindow.to);
      prev = hourlyCumul(list, previousWindow.from, previousWindow.to);
      total = rev[rev.length - 1];
      prevTotal = prev[prev.length - 1];
      for (let h = 0; h < rev.length; h++) {
        const hr = +merchantParts(base + h * 3600000, slug).hour;
        xLabels.push((hr < 10 ? '0' : '') + hr + 'h');
      }
      visibleXIdx = Array.from({ length: rev.length }, (_, i) => i).filter(i => i % Math.max(1, Math.floor(rev.length / 8)) === 0);
      // Today is unfinished. Truncate at current hour elapsed in this business window.
      if (range === 'aujourdhui') {
        const nowIdx = Math.min(rev.length - 1, Math.max(0, Math.floor((Date.now() - base) / 3600000)));
        for (let i = nowIdx + 1; i < rev.length; i++) rev[i] = null;
      }
      rangeBadge = (range === 'hier') ? 'HIER' : "AUJOURD'HUI";
      sub = (range === 'hier') ? 'Cumul horaire · hier' : 'Cumul horaire · aujourd\'hui';
      cmpPrefix = (range === 'hier') ? 'Cumul avant-hier' : 'Cumul hier';
    } else {
      const [start, end] = __state.closedBounds(range);
      const startDay = merchantDayKey(start + 1, __state.activeMerchantSlug());
      const endDay = merchantDayKey(end - 1, __state.activeMerchantSlug());
      const days = Math.max(1, Math.round((Date.parse(endDay + 'T00:00:00Z') - Date.parse(startDay + 'T00:00:00Z')) / 864e5) + 1);
      rev = dailyTotals(list, start, days);
      const previousStart = __state.merchantDayBounds(__state.addMerchantDays(startDay, -days), __state.activeMerchantSlug()).from;
      prev = dailyTotals(list, previousStart, days);
      dayKeys = [];
      for (let i = 0; i < days; i++) { dayKeys.push(__state.addMerchantDays(startDay, i)); const d = new Date(Date.parse(dayKeys[i] + 'T12:00:00Z')); xLabels.push(__state.DAY_ABBR[d.getUTCDay()] + ' ' + d.getUTCDate()); }
      const step = Math.max(1, Math.round(days / 6));
      for (let i = 0; i < days; i += step) visibleXIdx.push(i);
      if (visibleXIdx[visibleXIdx.length - 1] !== days - 1) visibleXIdx.push(days - 1);
      total = rev.reduce((s, x) => s + x, 0);
      prevTotal = prev.reduce((s, x) => s + x, 0);
      const named = { moisDernier: ['MOIS DERNIER', 'mois dernier'], trimestre: ['CE TRIMESTRE', 'ce trimestre'], annee: ['CETTE ANNÉE', 'cette année'] }[range];
      rangeBadge = range === 'personnalise' ? 'PÉRIODE PERSONNALISÉE' : named ? named[0] : days + ' DERNIERS JOURS';
      sub = range === 'personnalise' ? 'Total journalier · période sélectionnée' : 'Total journalier · ' + (named ? named[1] : days + ' derniers jours');
      cmpPrefix = days + ' jours précédents';
    }

    const hasPrev = prevTotal > 0;
    // The ceiling has to clear BOTH curves, or a stronger previous period gets
    // clipped off the top of the box the moment the comparison is switched on.
    const top = __state.niceCeil(Math.max(1, ...rev.filter(v => v != null), ...(hasPrev ? prev : [])));
    const yTicks = [0, top * 0.25, top * 0.5, top * 0.75, top].map(Math.round);
    const legendPrimary = (hourly ? 'Cumul' : ('Total ' + rev.length + ' jours')) + ' · ' + __state.frInt(total) + ' MAD';
    return {
      rev, revPrev: hasPrev ? prev : null, total, prevTotal: hasPrev ? prevTotal : null,
      yTicks, xLabels, visibleXIdx, dayKeys, sub, rangeBadge, legendPrimary,
      legendCompare: hasPrev ? (cmpPrefix + ' · ' + __state.frInt(prevTotal) + ' MAD') : '',
    };
  }

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
    return Object.freeze({ renderRevChart, hourlyCumul, dailyTotals, realRevSeries, revChartByVenue });
  };
})();
