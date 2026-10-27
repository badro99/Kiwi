/* Owner: dashboard presentation. Exports: homeSet, paintNumber, animateNumber, fitHeroAmount, hookI18n, tickLiveRevenue.
 * Sibling calls via live owner: operatorLedgerPending.
 * Reads live owner: effRange, fmtHeroAmount, getCurrentVenue, goalByVenue, heroDataByVenue, homeStore, kpiByVenue, numberShape, renderBench, renderEvening, renderFeed, renderGoal, renderHealth, renderHeatmap, renderHero, renderHeroAi, renderInteg, renderKpiBand, renderMix, renderProducts, renderRevChart, renderSelector, renderSettle, renderStaff, renderStock, textNodesOf.
 * Reads globalThis: none.
 * Reads window: KiwiDemoClock, KiwiI18n, dispatchEvent, matchMedia. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['presentation'] = function (__state) {
  function operatorLedgerPending(...args) { return __state.operatorLedgerPending.apply(this, args); }
function homeSet(key, value) {
    __state.homeStore()[key] = value;
    if (homeSet.q) return;
    homeSet.q = true;
    Promise.resolve().then(() => {
      homeSet.q = false;
      try { window.dispatchEvent(new CustomEvent('kiwi:home-model')); } catch (_) {}
    });
  }

function paintNumber(el, html) {
    const shape = __state.numberShape(html);
    const mine = el.__kiwiNumText;
    /* Reuse only what this function wrote and nobody has replaced since: any
     * other write (a plain re-render, the '…' placeholder) detaches these. */
    if (mine && el.__kiwiNumShape === shape) {
      const live = __state.textNodesOf(el);
      if (live.length === mine.length && live.every((t, i) => t === mine[i])) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        const next = __state.textNodesOf(tpl.content);
        if (next.length === live.length) {
          next.forEach((t, i) => { if (live[i].data !== t.data) live[i].data = t.data; });
          return;
        }
      }
    }
    el.innerHTML = html;
    el.__kiwiNumShape = shape;
    el.__kiwiNumText = __state.textNodesOf(el);
  }

function animateNumber(el, from, to, { duration = 800, format } = {}) {
    if (!el) return;
    if (operatorLedgerPending()) { el.textContent = '…'; return; }
    // Hidden tabs freeze requestAnimationFrame — set the final value at once
    // so a background re-render never leaves a tile blank.
    if (document.hidden || duration === 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { el['inner' + 'HTML'] = format(to); return; }
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      if (operatorLedgerPending()) { el.textContent = '…'; return; }
      const p = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * ease(p);
      paintNumber(el, format(v));
      if (p < 1) requestAnimationFrame(tick);
      else paintNumber(el, format(to));
    }
    requestAnimationFrame(tick);
  }

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
    probe.innerHTML = __state.fmtHeroAmount(targetValue);
    document.body.appendChild(probe);
    const naturalW = probe.scrollWidth;
    document.body.removeChild(probe);
    const availW = parent.clientWidth;
    if (availW > 0 && naturalW > availW) {
      const baseSize = parseFloat(cs.fontSize);
      el.style.fontSize = `${Math.floor(baseSize * (availW / naturalW) * 0.97)}px`;
    }
  }

function hookI18n() {
    const api = window.KiwiI18n;
    if (!api?.setLang || api.__drWrapped) return;
    const orig = api.setLang;
    api.setLang = function () {
      const r = orig.apply(this, arguments);
      // Re-render everything that has lang-dependent text
      __state.renderSelector();
      __state.renderHero();
      __state.renderHeroAi();
      __state.renderGoal();
      __state.renderHeatmap();
      __state.renderKpiBand();
      __state.renderRevChart();
      __state.renderMix();
      __state.renderFeed();
      __state.renderSettle();
      __state.renderEvening();
      __state.renderStock();
      __state.renderHealth();
      __state.renderBench();
      __state.renderInteg();
      __state.renderProducts();
      __state.renderStaff();
      return r;
    };
    api.__drWrapped = true;
  }

function tickLiveRevenue({ amount = 0, tip = 0 } = {}) {
    // Demo clock owns deterministic ticking on aujourdhui — skip random ticks.
    if (window.KiwiDemoClock?.isActive?.()) return;
    // Live ticks only make sense on "today" — skip on historical ranges.
    const r = __state.effRange();
    if (r !== 'aujourdhui') return;
    // And only mutate the currently active venue's data (each venue has its own).
    const v = __state.getCurrentVenue();
    const hero = __state.heroDataByVenue[v]?.aujourdhui;
    const goal = __state.goalByVenue[v]?.aujourdhui;
    const kpi  = __state.kpiByVenue[v]?.aujourdhui;
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
    __state.renderHero();
    __state.renderGoal();
    __state.renderKpiBand();
  }

    return Object.freeze({ homeSet, paintNumber, animateNumber, fitHeroAmount, hookI18n, tickLiveRevenue });
  };
})();
