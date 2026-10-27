/* Owner: dashboard hero. Exports: renderHero, renderHeroAi, renderHeatmapAi, renderGoal, renderHeatmap, heroDataByVenue.
 * Sibling calls via live owner: none.
 * Reads live owner: COVERS_LABEL, GOAL_LABEL, GOAL_UNSET, HERO_LABEL, HH_SUB, ORDERS_LABEL, animateNumber, arrowSvg, buildHeatmap, buildRealHeatmapRec, buildRealHeroRec, curUnit, currentRange, deltaLabels, demoHeroSim, demoPreviousAt, effRange, fitHeroAmount, fmtHeroAmount, fmtPct, frInt, getLang, getSim, goalByVenue, guardOperatorFigures, heroDataByVenue, homeSet, intensityClass, isLiveDemo, kitCase, liveTickInProgress, operatorUnavailableText, ownData, parseAmountFromEl, parsePctFromEl, realDeltaPct, realSalesTotals, vData.
 * Reads globalThis: none.
 * Reads window: KiwiSales, KiwiVenue, KiwiZReconciliation. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['hero'] = function (__state) {
function renderHero() {
    __state.demoHeroSim = null;
    if (__state.guardOperatorFigures('.hero-breakdown')) {
      const amount = document.querySelector('[data-hero-amount]');
      if (amount) { amount.textContent = '…'; amount.setAttribute('aria-label', __state.operatorUnavailableText()); }
      const label = document.querySelector('[data-hero-label]');
      if (label) label.textContent = __state.operatorUnavailableText();
      const greet = document.querySelector('.hero-left-today .greet');
      if (greet) greet.style.display = 'none';
      typeof __state.homeSet === 'function' && __state.homeSet('hero', { unavailable: __state.operatorUnavailableText() });
      return;
    }
    const lang = __state.getLang();
    const effective = __state.effRange();
    let data = __state.vData(__state.heroDataByVenue, __state.currentRange);
    if (!data) return;

    // Live-demo override on aujourdhui — hero amount + net come from the clock,
    // deltas remain comparative (vs hier / semaine / mois).
    if (__state.isLiveDemo()) {
      const sim = __state.getSim();
      if (sim) {
        __state.demoHeroSim = sim;
        const previous = __state.demoPreviousAt(sim);
        data = { ...data, amount: sim.cumRevenue, netAfterKiwi: Math.round(sim.cumRevenue * 0.839),
          deltaHier: previous > 0 ? (sim.cumRevenue - previous) / previous * 100 : null };
      }
    }
    // User-created venue — hero figures come from the merchant's real sales,
    // windowed to the active range so the number tracks the selected period.
    if (__state.ownData() && window.KiwiSales) {
      const t = __state.realSalesTotals();
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
        netAfterKiwi: Math.round(t.revenue * 0.839),
        deltaHier:    __state.realDeltaPct(__state.currentRange, rev),
        deltaSemaine: __state.realDeltaPct(__state.currentRange, rev, 7),
        deltaMois:    __state.realDeltaPct(__state.currentRange, rev, 28),
      };
    }

    const reference = __state.ownData() && window.KiwiZReconciliation?.reference?.();
    if (reference) {
      data = { ...data, amount: reference.referenceCents / 100,
        deltaHier: null, deltaSemaine: null, deltaMois: null };
    }
    const labelEl = document.querySelector('[data-hero-label]');
    if (labelEl) labelEl.textContent = reference ? __state.kitCase(reference.source === 'closed-z' ? 'RAPPORT Z DE LA CAISSE · ' : 'VENTES ENREGISTRÉES · ') + reference.day : __state.kitCase(__state.HERO_LABEL[lang]?.[__state.currentRange] || __state.HERO_LABEL.fr[__state.currentRange]);

    // The live-session row ("LIVE · HH:MM · 24 heures · session continue
    // depuis 08h12") is a today-only concept — a ticking LIVE clock over a
    // 7-day or 30-day aggregate is misleading. Show it only on aujourd'hui.
    const greetEl = document.querySelector('.hero-left-today .greet');
    if (greetEl) greetEl.style.display = (effective === 'aujourdhui' && !/[?&]op=1(?:&|$)/.test(location.search)) ? '' : 'none';

    const amtEl = document.querySelector('[data-hero-amount]');
    if (amtEl) {
      amtEl.removeAttribute('aria-label');
      const fromVal = __state.parseAmountFromEl(amtEl);
      // Resize font to fit the wider of from/to so the number never wraps mid-animation.
      __state.fitHeroAmount(amtEl, Math.max(fromVal, data.amount));
      // Live-tick: shorter duration so the count keeps up with the 3s cadence
      const dur = __state.liveTickInProgress ? 600 : 800;
      __state.animateNumber(amtEl, fromVal, data.amount, { duration: dur, format: __state.fmtHeroAmount });
    }

    const breakdown = document.querySelector('.hero-breakdown');
    if (breakdown) {
      const labels = __state.deltaLabels(lang, __state.currentRange);

      const existing = {};
      breakdown.querySelectorAll('[data-hero-delta]').forEach(el => {
        const k = el.dataset.heroDelta;
        const v = el.querySelector('[data-hero-delta-val]');
        if (v) existing[k] = __state.parsePctFromEl(v);
      });
      const items = [];
      if (data.deltaHier    != null && labels && labels.hier)    items.push({ key: 'hier',    value: data.deltaHier,    label: labels.hier });
      if (data.deltaSemaine != null && labels && labels.semaine) items.push({ key: 'semaine', value: data.deltaSemaine, label: labels.semaine });
      if (data.deltaMois    != null && labels && labels.mois)    items.push({ key: 'mois',    value: data.deltaMois,    label: labels.mois });

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
        __state.animateNumber(valEl, from, it.value, {
          duration: __state.isLiveDemo() ? 0 : 600,
          format: v => `${__state.fmtPct(v)} <span class="d${v < 0 ? ' dn' : ''}">${__state.arrowSvg(v >= 0)}</span>`,
        });
      });
    }
    if (typeof __state.homeSet === 'function') {
      const dl = __state.deltaLabels(lang, __state.currentRange) || {};
      const deltas = [['hier', data.deltaHier], ['semaine', data.deltaSemaine], ['mois', data.deltaMois]]
        .filter(([k, v]) => v != null && dl[k]).map(([k, v]) => ({ key: k, value: v, text: __state.fmtPct(v), label: dl[k] }));
      const amount = Number(data.amount) || 0;
      typeof __state.homeSet === 'function' && __state.homeSet('hero', { label: labelEl ? labelEl.textContent : '', amount, amountText: __state.fmtHeroAmount(amount).replace(/<[^>]*>/g, '').replace(__state.curUnit(), '').trim(), unit: __state.curUnit(), deltas, reference: !!reference });
    }
  }
function renderHeroAi() {
    /* Ask-bar placeholder follows the trade — a gym owner asks about their
     * salle, not their restaurant. Defaults mirror i18n.js so switching back
     * to a demo venue restores the stock copy without waiting for setLang. */
    const input = document.querySelector('[data-hai-input]');
    if (input) {
      const trade = window.KiwiVenue?.getVocab?.('askPlaceholder');
      const lang = __state.getLang();
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

    const rec = __state.ownData() ? __state.buildRealHeroRec() : window.KiwiVenue?.getHeroAiRec?.();
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
      if (obsEl)   obsEl.textContent = empty[__state.getLang()] || empty.fr;
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
function renderHeatmapAi() {
    const rec = __state.ownData() ? __state.buildRealHeatmapRec() : window.KiwiVenue?.getHeatmapAiRec?.();
    const titleEl = document.querySelector('.hh-ai-title');
    const obsEl   = document.querySelector('.hh-ai-obs');
    const ctaEl   = document.querySelector('.hh-ai-cta');
    /* Same rule as renderHeroAi: no hint has to LOOK like no hint. Returning
     * early left the markup's own copy standing, and that copy used to be a
     * finished recommendation quoting a peer benchmark Kiwi cannot measure. */
    if (!rec) {
      const empty = { fr: 'Vos heures creuses apparaîtront ici dès vos premières ventes.', en: 'Your quiet hours will appear here once you record sales.', ar: 'ستظهر ساعاتك الهادئة هنا بمجرد تسجيل مبيعاتك.' };
      if (titleEl) titleEl.textContent = '';
      if (obsEl)   obsEl.textContent = empty[__state.getLang()] || empty.fr;
      // An empty link has no name for a screen reader: hide it with its text.
      if (ctaEl)   { ctaEl.textContent = ''; ctaEl.hidden = true; ctaEl.style.display = 'none'; }
      return;
    }
    if (ctaEl)   { ctaEl.hidden = false; ctaEl.style.display = ''; }
    if (titleEl) titleEl.textContent = rec.title;
    if (obsEl)   obsEl.textContent = rec.obs;
    if (ctaEl)   ctaEl.textContent = rec.cta;
  }
function renderGoal() {
    if (__state.guardOperatorFigures('[data-goal-label], [data-goal-pct]')) {
      const fill = document.querySelector('[data-goal-fill]');
      if (fill) fill.style.width = '0%';
      typeof __state.homeSet === 'function' && __state.homeSet('goal', null);
      return;
    }
    const lang = __state.getLang();
    const effective = __state.effRange();
    let data = __state.vData(__state.goalByVenue, __state.currentRange);
    if (!data) return;

    // Live-demo override: goal stays at venue's daily target (matches the
    // demo target), `current` ticks up from 0 → daily total each real hour.
    if (__state.isLiveDemo()) {
      const sim = __state.getSim();
      if (sim) data = { ...data, goal: sim.target.revenue, current: sim.cumRevenue };
    }
    // User-created venue — goal comes from the merchant's setting, progress
    // from their recorded sales.
    if (__state.ownData() && window.KiwiSales) {
      const vd = window.KiwiVenue.getCurrentVenueData?.() || {};
      data = { ...data, goal: +vd.goal || 0, current: __state.realSalesTotals(__state.currentRange).revenue };
    }

    // Settings → "Objectif journalier" override for the default demo venue: the
    // merchant's daily target wins on the day ranges (week/month keep theirs).
    if (!(window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom())) {
      try {
        const ov = localStorage.getItem('kiwiSet:goal');
        if (ov && (__state.currentRange === 'aujourdhui' || __state.currentRange === 'hier')) {
          const n = +String(ov).replace(/[^\d]/g, '');
          if (n > 0) data = { ...data, goal: n };
        }
      } catch (_) {}
    }

    /* Objectif jamais saisi. Un commerçant qui n'a rien fixé lisait
     * « OBJECTIF JOUR · 0 MAD » puis « 0 % atteint » le jour où il avait fait
     * 2 254 MAD : la division par un objectif nul retombait sur 0, ce qui se
     * lit comme un échec au lieu d'une case vide. On dit ce qui est — aucun
     * objectif — et on ne calcule pas un pourcentage qui n'existe pas. Le
     * drapeau sur le libellé sert à la carte Vexel, qui recopie ce DOM. */
    const unset = !(data.goal > 0);
    const labelTxt = __state.kitCase(__state.GOAL_LABEL[lang]?.[__state.currentRange] || __state.GOAL_LABEL.fr[__state.currentRange]);
    const labelEl = document.querySelector('[data-goal-label]');
    if (labelEl) {
      labelEl.textContent = unset
        ? `${labelTxt} · ${__state.GOAL_UNSET[lang] || __state.GOAL_UNSET.fr}`
        : `${labelTxt} · ${__state.frInt(data.goal)} ${__state.curUnit()}`;
      if (unset) labelEl.dataset.goalUnset = '1';
      else delete labelEl.dataset.goalUnset;
    }

    const ratio = unset ? 0 : data.current / data.goal;
    const pctRound = Math.round(ratio * 100);
    const widthPct = Math.min(100, ratio * 100);

    const pctEl = document.querySelector('[data-goal-pct]');
    if (pctEl) {
      if (unset) {
        pctEl.textContent = '·';
      } else {
        const from = parseInt((pctEl.textContent || '').replace(/\D/g, ''), 10) || 0;
        __state.animateNumber(pctEl, from, pctRound, { duration: 700, format: v => `${Math.round(v)} %` });
      }
    }
    const fillEl = document.querySelector('[data-goal-fill]');
    if (fillEl) fillEl.style.width = `${widthPct.toFixed(1)}%`;
    typeof __state.homeSet === 'function' && __state.homeSet('goal', { range: __state.currentRange, unset, label: labelEl ? labelEl.textContent : '', goal: unset ? 0 : data.goal, current: data.current, pct: unset ? null : pctRound, ratio });
  }
function renderHeatmap() {
    const lang = __state.getLang();
    const data = __state.buildHeatmap(__state.ownData() ? __state.currentRange : __state.effRange());
    // Determine sim cursor for past/current/future state on aujourdhui
    let simIdx = -1;
    if (__state.isLiveDemo()) {
      const sim = __state.getSim();
      if (sim) simIdx = sim.simIdx;
    }
    const row = document.querySelector('[data-hh-row]');
    if (row) {
      /* Bars rise into place on real data changes; a 3s live tick rebuilds
       * silently (no replay while the demo clock runs). */
      row.classList.toggle('hh-anim', !__state.liveTickInProgress);
      row.innerHTML = data.map((d, i) => {
        let stateCls = '';
        if (simIdx >= 0) {
          if (i < simIdx) stateCls = 'past';
          else if (i === simIdx) stateCls = 'now';
          else stateCls = 'future';
        }
        return `
        <div class="hh-col" style="--i:${i};">
          <div class="hh-cell ${__state.intensityClass(d.intensity)}${stateCls ? ' ' + stateCls : ''}">
            <div class="hh-tooltip">
              <div class="hour">${d.hour}</div>
              <div class="met"><b>${__state.frInt(d.revenue)} MAD</b></div>
              <div class="met">${d.covers} ${d.unit === 'orders' ? (__state.ORDERS_LABEL[lang] || __state.ORDERS_LABEL.fr)(d.covers) : (__state.COVERS_LABEL[lang] || __state.COVERS_LABEL.fr)}</div>
            </div>
          </div>
          <div class="hh-h">${d.hour}</div>
        </div>
      `;
      }).join('');
    }
    const subEl = document.querySelector('[data-hh-sub]');
    if (subEl) subEl.textContent = __state.HH_SUB[lang]?.[__state.currentRange] || __state.HH_SUB.fr[__state.currentRange];
  }
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
    return Object.freeze({ renderHero, renderHeroAi, renderHeatmapAi, renderGoal, renderHeatmap, heroDataByVenue });
  };
})();
