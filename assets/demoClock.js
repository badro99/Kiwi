/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Demo Clock
 *
 * Compresses the restaurant's full operating day (11h → 02h, 16 simulated
 * hours) into ONE real-world hour. So the dashboard's "live" data progresses
 * from "start of day" at minute :00 to "end of day" at minute :59 of every
 * real hour — then hard-resets at the top of the next hour and replays.
 *
 *   real-world second within hour ──→ fraction f ∈ [0, 1]
 *   sim hour position              ──→ f × 16     (11h .. 02h)
 *   cumulative metric              ──→ ∑ hour-weights × daily target
 *
 * Only the `aujourdhui` range pulls from the clock. Historical ranges
 * (hier / septJours / trenteJours) stay static.
 *
 * Public API on window.KiwiDemoClock:
 *   getSimState()  → current snapshot (cumRevenue, cumTx, cumTips, simIdx, …)
 *   subscribe(fn)  → fn(state, isReset) called every tick
 *   isActive()     → boolean
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const TICK_MS = 3000;        // re-render cadence — fast enough to feel live, slow enough to read
  const HOURS = ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'];
  const N = HOURS.length;      // 16

  /* ═══════════════ DAILY TARGETS PER VENUE ═══════════════ */

  const TARGETS = {
    cafeAtlas:    { revenue: 31500, tx: 215, tips: 2400, panierAvg: 146, ratioCard: 68, regularsRatio: 0.26, successRate: 99.34 },
    maisonMansour:{ revenue: 14000, tx: 48,  tips: 0,    panierAvg: 292, ratioCard: 85, regularsRatio: 0.23, successRate: 99.6 },
    spaBahia:     { revenue: 10500, tx: 22,  tips: 1500, panierAvg: 477, ratioCard: 92, regularsRatio: 0.65, successRate: 92.5 },
  };

  /* ═══════════════ HOUR-BY-HOUR WEIGHTS — each row sums to ~1.0 ═══════════════ */

  const HOUR_WEIGHTS = {
    cafeAtlas: {
      // Restaurant rhythm: lunch peak 12-14h, dinner peak 19-22h, late-night tail.
      rev:  [0.018, 0.075, 0.110, 0.090, 0.040, 0.028, 0.040, 0.062, 0.100, 0.135, 0.130, 0.090, 0.052, 0.018, 0.008, 0.004],
      tx:   [0.020, 0.085, 0.130, 0.105, 0.040, 0.025, 0.035, 0.055, 0.095, 0.120, 0.110, 0.080, 0.050, 0.025, 0.018, 0.007],
      tips: [0.012, 0.065, 0.115, 0.100, 0.030, 0.020, 0.030, 0.060, 0.110, 0.150, 0.140, 0.090, 0.050, 0.020, 0.005, 0.003],
    },
    maisonMansour: {
      // Boutique rhythm: morning tourists 11-13h, evening shoppers 17-20h, closes 20h.
      rev:  [0.080, 0.130, 0.105, 0.050, 0.038, 0.052, 0.110, 0.135, 0.150, 0.130, 0.018, 0.002, 0.000, 0.000, 0.000, 0.000],
      tx:   [0.082, 0.135, 0.108, 0.050, 0.040, 0.054, 0.108, 0.130, 0.145, 0.125, 0.015, 0.005, 0.003, 0.000, 0.000, 0.000],
      tips: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    },
    spaBahia: {
      // Spa rhythm: morning + afternoon appointments, closes ~22h.
      rev:  [0.050, 0.115, 0.140, 0.085, 0.105, 0.140, 0.115, 0.085, 0.055, 0.035, 0.020, 0.005, 0.000, 0.000, 0.000, 0.000],
      tx:   [0.045, 0.110, 0.135, 0.085, 0.100, 0.140, 0.115, 0.090, 0.060, 0.045, 0.045, 0.018, 0.007, 0.005, 0.000, 0.000],
      tips: [0.040, 0.110, 0.140, 0.090, 0.110, 0.150, 0.110, 0.080, 0.060, 0.045, 0.035, 0.020, 0.008, 0.002, 0.000, 0.000],
    },
  };

  /* ═══════════════ STATE ═══════════════ */

  const subscribers = new Set();
  let lastFraction = 0;
  let started = false;

  function getRealFraction() {
    const now = new Date();
    const m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
    return ((m * 60) + s + ms / 1000) / 3600;  // 0..1 with sub-second precision
  }

  /* Cumulative weight at sim position (0..N), linear-interpolated within an hour. */
  function cumulativeAt(weights, fraction) {
    if (!weights || !weights.length) return 0;
    const pos = fraction * N;
    const idx = Math.min(N - 1, Math.floor(pos));
    const within = Math.min(1, Math.max(0, pos - idx));
    let cum = 0;
    for (let i = 0; i < idx; i++) cum += weights[i];
    cum += (weights[idx] || 0) * within;
    return cum;
  }

  /* ═══════════════ PUBLIC: SIM STATE SNAPSHOT ═══════════════ */

  function getSimState() {
    const f = getRealFraction();
    const venue = window.KiwiVenue?.getVenue?.() || 'cafeAtlas';
    const target = TARGETS[venue] || TARGETS.cafeAtlas;
    const weights = HOUR_WEIGHTS[venue] || HOUR_WEIGHTS.cafeAtlas;

    const pos = f * N;
    const simIdx = Math.min(N - 1, Math.floor(pos));
    const simWithin = Math.min(1, Math.max(0, pos - simIdx));
    const simHourLabel = HOURS[simIdx] || '11h';
    const simMinute = Math.floor(simWithin * 60);

    const wRev  = cumulativeAt(weights.rev,  f);
    const wTx   = cumulativeAt(weights.tx,   f);
    const wTips = cumulativeAt(weights.tips, f);

    const cumRevenue = wRev * target.revenue;
    const cumTx      = Math.round(wTx * target.tx);
    const cumTips    = wTips * target.tips;

    // Derived KPIs
    const panierMoyen = cumTx > 0 ? Math.round(cumRevenue / cumTx) : 0;
    const cumRegulars = Math.round(cumTx * target.regularsRatio);

    return {
      fraction: f,
      simIdx, simWithin, simHourLabel, simMinute,
      cumRevenue, cumTx, cumTips, cumRegulars,
      panierMoyen,
      target, weights,
      venue,
    };
  }

  /* ═══════════════ TICK LOOP ═══════════════ */

  function tick() {
    const state = getSimState();
    const isReset = state.fraction < lastFraction - 0.05;  // wrapped past :59
    lastFraction = state.fraction;
    subscribers.forEach(fn => { try { fn(state, isReset); } catch (_) {} });
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function start() {
    if (started) return;
    if (!/dashboard\.html/.test(location.pathname)) return;
    started = true;
    window.__kiwiDemoActive = true;

    // First tick on next frame so subscribers attach first
    requestAnimationFrame(() => {
      lastFraction = getRealFraction();
      tick();
      setInterval(tick, TICK_MS);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.KiwiDemoClock = {
    getSimState,
    subscribe,
    isActive: () => started,
    HOURS,
  };
})();
