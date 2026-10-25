/* Owner: daterange dashboard renderers.
 * Registers functions on KiwiDateRange.__internal; needs its live private-state accessors.
 * No merchant data, DOM work or requests run at registration. */
(function () {
  'use strict';
  window.__kiwiDateRangeParts = function (__state) {
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
function renderKpiBand() {
    if (__state.guardOperatorFigures('[data-kpi-band]')) {
      const wrap = document.querySelector('[data-kpi-band]');
      if (wrap) wrap.textContent = __state.operatorUnavailableText();
      typeof __state.homeSet === 'function' && __state.homeSet('tiles', null);
      return;
    }
    const lang = __state.getLang();
    let data = __state.vData(__state.kpiByVenue, __state.currentRange);
    if (!data) return;
    const suffix = __state.KPI_DELTA_SUFFIX[lang]?.[__state.currentRange] || __state.KPI_DELTA_SUFFIX.fr[__state.currentRange];

    const wrap = document.querySelector('[data-kpi-band]');
    if (!wrap) return;
    // A signed-in merchant on a fresh browser has a transient `own` venue
    // until /api/me resolves. No restaurant KPIs may flash for a hotel/shop.
    const activeVenue = window.KiwiVenue?.getCurrentVenueData?.();
    if (activeVenue?.id === 'own' && !activeVenue.type) {
      wrap.replaceChildren();
      return;
    }

    // Live-demo override: tx/panier/regulars all scale with sim time.
    // The ratio is already projected from ledger tenders above.
    if (__state.isLiveDemo()) {
      const sim = __state.getSim();
      if (sim && !(sim.cumTx > 0) && __state.effRange() === 'aujourdhui') {
        /* Before the demo's first sale of the day (05:00 cut to about 07:00)
         * there is no basket, no margin and no rate to show, and nothing to
         * compare with a full yesterday. It said « Marge brute 71,4 % » and
         * « Taux succès 99,34 % » on zero orders; it now says « · », exactly
         * what a real merchant's band says when there is nothing to measure. */
        const dash = { text: '·', unit: '', delta: null };
        const quiet = (tile) => (tile ? { ...tile, ...dash } : tile);
        data = {
          ...data,
          tx:         data.tx       ? { ...data.tx, value: 0, delta: null } : data.tx,
          panier:     quiet(data.panier),
          regulars:   quiet(data.regulars),
          marge:      quiet(data.marge),
          profit:     quiet(data.profit),
          cogs:       quiet(data.cogs),
          success:    quiet(data.success),
          tauxRetour: quiet(data.tauxRetour),
        };
      } else if (sim) {
        data = {
          ...data,
          tx:         data.tx       ? { ...data.tx,       value: sim.cumTx } : data.tx,
          panier:     data.panier   ? { ...data.panier,   value: sim.panierMoyen || data.panier.value } : data.panier,
          regulars:   data.regulars ? { ...data.regulars, value: sim.cumRegulars, unit: `/ ${Math.max(1, sim.cumTx)}` } : data.regulars,
          // success / tauxRetour stay at their static daily values
        };
      }
    }
    // User-created venue — tx / panier (and the revenue derived from them)
    // come from the merchant's recorded sales.
    if (__state.ownData() && window.KiwiSales) {
      const t = __state.realSalesTotals();
      const rng = __state.currentRange;
      const [wFrom, wTo] = __state.closedBounds(rng);
      const w = __state.realWindowStats(wFrom, wTo);
      const mix = __state.realClientMix(wFrom, wTo);
      /* Le ratio se lit « card / cash ». Les deux parts sortent des ventes
       * encaissées — la même source que l'anneau Mix de paiement juste à côté,
       * pour que deux cartes affichant la même donnée ne puissent plus se
       * contredire. La part espèces est le complément à 100, donc l'addition
       * tombe toujours juste. Sans encaissement : le tiret, il n'y a rien à
       * répartir. */
      const tender = w.card + w.cash;
      const cardPct = tender ? Math.round((w.card / tender) * 100) : 0;
      /* Pressing : « Dépôts » et « Bon moyen » comptent les BONS déposés, pas les
       * encaissements. Le journal des ventes enregistre un bon quand il est payé
       * (au retrait pour un « payer au retrait », deux fois pour un acompte puis
       * son solde) : trois bons déposés (226, 64, 90 MAD) s'affichaient
       * « 2 dépôts · bon moyen 57 MAD ». Les bons viennent du document
       * pressing-orders, par date de dépôt, annulés exclus. Tant que ce document
       * n'est pas arrivé, on garde le journal plutôt qu'un zéro faux. */
      const pressingStats = (() => {
        const ops = window.KiwiPressingOps;
        if (!ops?.dropoffStats || (activeVenue?.subtype || activeVenue?.trade) !== 'pressing') return null;
        try { if (!ops.read().length) return null; } catch (_) { return null; }
        return (from, to) => ops.dropoffStats(from, to);
      })();
      const txNow = pressingStats ? pressingStats(wFrom, wTo) : null;
      data = {
        ...data,
        tx:     { ...(data.tx || {}),     value: txNow ? txNow.count : t.count,
                  delta: txNow ? __state.realDeltaPct(rng, (s) => s.count, undefined, pressingStats) : __state.realDeltaPct(rng, (s) => s.count) },
        /* Au centime, comme le rouleau de la caisse : 424,50 / 5 tickets se lit
                  84,90, pas 85 (la tuile l'écrit par KiwiNumber.amount). */
        panier: { ...(data.panier || {}), value: __state.basketCents(txNow || t) / 100,
                  delta: txNow ? __state.realDeltaPct(rng, (s) => s.basket, undefined, pressingStats) : __state.realDeltaPct(rng, (s) => s.basket) },
        /* Le CA EXACT, additionné vente par vente. Il n'était pas transmis, si
         * bien que revOf() le reconstituait à partir du panier arrondi
         * ci-dessus et que le tableau de bord ne tombait jamais juste face au
         * rouleau de caisse (voir revOf). */
        revenue: { value: t.revenue, unit: 'MAD', fmt: 'int', delta: __state.realDeltaPct(rng, (s) => s.revenue) },
        collected: { value: t.collected, unit: 'MAD', fmt: 'int', delta: __state.realDeltaPct(rng, (s) => s.collected) },
        receivable: { value: t.receivable, unit: 'MAD', fmt: 'int', delta: __state.realDeltaPct(rng, (s) => s.receivable) },
        ratio:    data.ratio    ? { ...data.ratio,    text: tender ? `${cardPct} / ${100 - cardPct}` : '·', unit: tender ? '%' : '', delta: __state.realDeltaPct(rng, (s) => (s.card + s.cash ? (s.card / (s.card + s.cash)) * 100 : 0)) } : data.ratio,
        /* « Réguliers », « Fidélité » et « Nouveaux clients » se lisent au
         * carnet clients (realClientMix) : les clients identifiés à la caisse
         * qui sont venus sur la période, déjà vus avant ou non. Ils valaient
         * « · » faute de source ; avant ça, un 0 faisait dire à « Nouveaux
         * clients » que TOUTES les ventes étaient des premières visites. Sans
         * client identifié sur la période, le tiret reste, et la bande remplace
         * les tuiles mortes. Le dénominateur est le nombre de clients venus,
         * jamais le nombre de ventes : un client et un ticket ne se divisent
         * pas l'un par l'autre. */
        clientMix: mix.visitors ? { ...mix,
          deltaNew: __state.realDeltaPct(rng, (s) => s.newcomers, undefined, __state.realClientMix),
          deltaRate: __state.realDeltaPct(rng, (s) => (s.visitors ? (s.regulars / s.visitors) * 100 : 0), undefined, __state.realClientMix) } : null,
        regulars: data.regulars ? (mix.visitors
          ? { ...data.regulars, text: undefined, value: mix.regulars, unit: `/ ${mix.visitors}`, fmt: 'int', delta: __state.realDeltaPct(rng, (s) => s.regulars, undefined, __state.realClientMix) }
          : { ...data.regulars, text: '·', value: 0, unit: '', delta: null }) : data.regulars,
        /* ── Un tiret, pas un zéro ──────────────────────────────────────────
         * Le taux de succès n'a encore aucune source chez un vrai commerçant :
         * Kiwi ne compte pas les paiements refusés. Le clone de
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
        success:    data.success    ? { ...data.success,    text: '·', unit: '', delta: null } : data.success,
        /* « Temps moyen à table / en cabine » part de « · » : le clone remis à
         * zéro affichait « 0 min », une table libérée à l'instant où elle est
         * prise. La vraie mesure (visites de table fermées, /api/table-time)
         * le remplace plus bas quand la tuile est sur la bande ; une cabine de
         * spa n'a pas de visite de table et garde « · ». */
        tempsTable: data.tempsTable ? { ...data.tempsTable, text: '·', unit: '', delta: null } : data.tempsTable,
        /* Le taux de retour, lui, a une source : les remboursements passés à
         * la caisse (/api/sale/refund) arrivent dans le même journal que les
         * ventes. C'est la part, en valeur, de ce qui a été vendu sur la
         * période et remboursé sur la même période. Sans vente sur la
         * période : « · » (rien à rapporter) ; avec des ventes et aucun
         * remboursement : un vrai 0 %. Un remboursement d'une vente plus
         * ancienne compte le jour où il est fait, comme dans le CA. */
        tauxRetour: data.tauxRetour ? (w.gross > 0
          ? { ...data.tauxRetour, text: undefined, value: Math.round((w.refunds / w.gross) * 1000) / 10, unit: '%', fmt: 'pct1',
              delta: __state.realDeltaPct(rng, (s) => (s.gross ? (s.refunds / s.gross) * 100 : 0)) }
          : { ...data.tauxRetour, text: '·', unit: '', delta: null }) : data.tauxRetour,
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
      const gp = w.revenue > 0 ? __state.realGrossProfit(wFrom, wTo) : null;
      if (gp && gp.marginPct != null && gp.revenueCosted > 0) {
        data.marge = { value: gp.marginPct, unit: '%', fmt: 'pct1', delta: null, costedPct: gp.pctCosted };
      } else {
        /* Rien de chiffré ⇒ le tiret, sur les TROIS tuiles. Un zéro se lirait
         * « vous ne gagnez rien », ce qui est une affirmation, et fausse. Le
         * tiret est déjà le mot de la maison pour « rien à montrer » — c'est ce
         * qu'affichent « Taux succès » et le ratio carte/espèces plus haut. */
        const dash = { text: '·', unit: '', delta: null };
        data.marge = { ...dash };
        data.profit = { ...dash };
        data.cogs = { ...dash };
      }
      /* Hôtel : les tuiles viennent du registre des séjours (voir
       * hotelBandTiles), plus des zéros écrits à la main. Le dénominateur du
       * ménage suit les chambres réellement déclarées, pas la réponse
       * facultative de l'étape 2 de l'installation. */
      if (window.KiwiVenue?.getVenueType?.() === 'hotel') {
        data = { ...data, ...__state.hotelBandTiles(rng) };
        try { window.KiwiHotelRooms?.warm?.(); } catch (_) {}
      }
      /* Le temps à table n'est demandé au serveur que si la tuile est sur la
       * bande de ce commerce : pas de requête pour une tuile que personne ne voit. */
      if (data.tempsTable) {
        const vt = window.KiwiVenue?.getVenueType?.() || 'restaurant';
        const shown = __state.getKpiLayout(vt) || __state.defaultKpiKeys(vt);
        if (Array.isArray(shown) && shown.includes('tempsTable')) data = { ...data, tempsTable: { ...data.tempsTable, ...__state.tableTimeTile(rng) } };
      }

      /* Tout le reste de la bande vient du clone démo remis à zéro : la valeur
       * affichée est bien neutre, mais son delta, lui, est resté le chiffre de
       * Café Atlas. « Taux retour 0,0 % · 0 % vs hier » se lisait donc comme un
       * taux stable alors qu'il n'y a jamais eu de retour à comparer. On coupe
       * la comparaison partout où elle n'a PAS été recalculée depuis les ventes
       * réelles, plutôt que d'énumérer les tuiles une à une — une tuile ajoutée
       * demain est couverte sans y penser. */
      const REAL_DELTAS = new Set(['tx', 'panier', 'ratio', 'revenue', 'collected', 'receivable', 'regulars', 'tauxRetour', 'tempsTable', 'occupation', 'adr', 'revpar']);
      Object.keys(data).forEach((k) => {
        const tile = data[k];
        if (tile && typeof tile === 'object' && 'delta' in tile && !REAL_DELTAS.has(k)) {
          data[k] = { ...tile, delta: null };
        }
      });
    }

    /* « Personnaliser » prévisualise exactement ces chiffres-là : ceux de la
     * bande, ventes réelles comprises, et non le tableau de démo. */
    __state.lastBand = { range: __state.currentRange, data };

    // Resolve which 6 KPI keys to render — owner's saved layout, or the
    // vertical default. Derived KPIs are merged into `data` so the tile
    // builder and value loop below keep working unchanged.
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const savedLayout = __state.getKpiLayout(venueType);
    let layout = savedLayout || __state.defaultKpiKeys(venueType);
    const ctx = { venueType, range: __state.effRange(), nbDays: (__state.ownData() && window.KiwiSales) ? __state.openDays(__state.effRange()) : (__state.RANGE_DAYS[__state.effRange()] || 1) };
    const deriveTile = (k) => {
      const c = __state.KPI_CATALOG[k];
      return c ? c.derive(data, ctx) : (data[k] || null);
    };
    const derived = {};
    layout.forEach((k) => {
      const t = deriveTile(k);
      if (t) derived[k] = t;
    });
    data = { ...data, ...derived };

    /* Une tuile qui ne PEUT rien afficher n'a pas sa place dans la bande.
     *
     * Chez un vrai commerçant, trois indicateurs de la grille par défaut n'ont
     * aucune source : le taux de succès (Kiwi n'enregistre pas les refus de
     * paiement), les clients réguliers (aucun client identifié venu sur la
     * période, voir realClientMix), et la marge tant que le
     * catalogue n'est pas costé. Le tiret reste la bonne réponse — inventer un
     * 0 mentirait — mais trois tirets alignés dans la bande donnent à lire
     * « le tableau de bord est cassé » alors que les ventes, elles, sont là.
     *
     * On remplace donc les cases mortes par un indicateur qui, lui, a une
     * valeur, et à défaut on rétrécit la bande. Deux garde-fous :
     *   · seulement si la grille est celle par défaut (savedLayout === null) —
     *     un commerçant qui a choisi ses six tuiles garde les siennes, tirets
     *     compris, c'est sa décision ;
     *   · le vivier est court. « CA/jour » et « ventes/jour » valent
     *     exactement « CA » et « ventes » sur une journée : on ne les propose
     *     que sur une plage multi-jours, sinon la bande afficherait deux fois
     *     le même nombre sous deux titres. Pourboires (journées closes), marge et
     *     coût (marge inconnue), rétention et nouveaux clients (morts avec
     *     les réguliers, ils lisent le même carnet) sont exclus par construction.
     *
     * Auto-réparateur : le jour où le commerçant saisit ses coûts, `marge` a
     * une valeur, n'est plus morte, et reprend sa place. */
    const isDeadTile = (k) => {
      const t = data[k];
      return !t || (t.text != null && String(t.text).replace(/\s/g, '') === '·');
    };
    if (__state.ownData() && !savedLayout && layout.some(isDeadTile)) {
      const pool = (ctx.nbDays > 1 ? ['revenue', 'revPerDay', 'txPerDay'] : ['revenue'])
        .filter((k) => !layout.includes(k));
      const ready = [];
      pool.forEach((k) => {
        const t = deriveTile(k);
        if (!t) return;
        data[k] = t;
        if (!isDeadTile(k)) ready.push(k);
      });
      const shrunk = layout
        .map((k) => (isDeadTile(k) && ready.length ? ready.shift() : k))
        .filter((k) => !isDeadTile(k));
      if (shrunk.length) layout = shrunk;
    }
    /* De l'argent dehors s'affiche. Une livraison que le transporteur n'a pas
     * encore payée n'est dans aucune tuile par défaut : le commerçant ne la
     * voyait nulle part. Tant qu'il reste quelque chose à recevoir sur la
     * période, « Créances » prend place dans la bande par défaut (en plus si
     * la bande est courte, sinon à la dernière place), et un clic dessus ouvre
     * la liste des livraisons. Une bande choisie par le commerçant ne bouge pas. */
    if (__state.ownData() && !savedLayout && !layout.includes('receivable')) {
      const owed = deriveTile('receivable');
      if (owed && +owed.value > 0) {
        data.receivable = owed;
        layout = layout.length < __state.KPI_MAX ? layout.concat('receivable') : layout.slice(0, __state.KPI_MAX - 1).concat('receivable');
      }
    }
    /* La grille est figée à six colonnes (dashboard.html) : une bande plus
     * courte laisserait des pistes vides à droite. On lui passe le compte
     * réel — repeat() n'accepte pas min(), le clamp se fait donc ici. */
    const nCols = Math.max(1, layout.length);
    wrap.style.setProperty('--kpi-cols', String(nCols));
    wrap.style.setProperty('--kpi-cols-md', String(Math.min(3, nCols)));
    wrap.style.setProperty('--kpi-cols-sm', String(Math.min(2, nCols)));
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
      i18n: profLabels[k] ? '' : (__state.KPI_CATALOG[k] || {}).i18n,
      label: profLabels[k] || __state.kpiLabel(k, venueType, lang),
    }));

    // Read previous values (for count-up animation continuity within same venue)
    const prevVals = {};
    wrap.querySelectorAll('.kpi-m').forEach(card => {
      const k = card.dataset.kpi;
      const v = card.querySelector('[data-kpi-val]');
      if (k && v) prevVals[k] = __state.parseAmountFromEl(v);
    });
    const prevVenue = wrap.dataset.venue || '';
    const currentVenue = __state.getCurrentVenue();
    const isVenueSwitch = prevVenue !== currentVenue;

    // Build tiles for each KPI key in the spec, skipping missing data
    const tiles = spec.map(s => {
      const tileData = data[s.key];
      if (!tileData) return ''; // tile hidden for this vertical/range
      // A user-created venue has no trend history yet — show a flat baseline
      // instead of a borrowed demo sparkline.
      const sparkPath = __state.ownData()
        ? 'M0 18 L120 18'
        : (__state.KPI_SPARKS[s.key] || __state.KPI_SPARKS.tx);
      const iconName = __state.KPI_MATERIAL_ICONS[s.key] || 'credit-card';
      const i18nAttr = s.i18n ? ` data-i18n="${s.i18n}"` : '';
      // If a translation exists in T, use it as initial label; otherwise the FR label.
      const T = window.KiwiI18n?.T?.[lang] || {};
      const label = T[s.i18n] || s.label;
      return `
        <div class="kpi-m" data-kpi="${s.key}" tabindex="0" role="button">
          <div class="l"><span${i18nAttr}>${label}</span><div class="ico"><i data-lucide="${iconName}" style="width:13px;height:13px" aria-hidden="true"></i></div></div>
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
          valEl.innerHTML = __state.fmtKpiVal(tileSpec, 0);
        } else if (isVenueSwitch) {
          // Venue change: set value instantly (DOM was rebuilt anyway)
          valEl.innerHTML = __state.fmtKpiVal(tileSpec, tileSpec.value);
        } else {
          const from = prevVals[s.key] ?? 0;
          __state.animateNumber(valEl, from, tileSpec.value, { duration: 700, format: v => __state.fmtKpiVal(tileSpec, v) });
        }
      }
      if (deltaEl) {
        const d = tileSpec.delta;
        /* Pas de période précédente = pas de comparaison. Ni « 0 % » (qui
         * affirmerait que rien n'a bougé au premier jour du commerçant), ni
         * flèche (elle pointerait dans une direction inventée) — et pas non
         * plus « — vs hier », qui n'apprend rien et fait lire la tuile comme
         * une panne. On laisse la ligne vide ; le CSS en réserve la hauteur
         * (.kpi-m .d:empty) pour que les tuiles restent alignées. */
        if (d == null) {
          deltaEl.className = 'd neutral';
          deltaEl.innerHTML = '';
        } else {
          deltaEl.className = `d${d < 0 ? ' dn' : d === 0 ? ' neutral' : ''}`;
          deltaEl.innerHTML = `${__state.arrowSvg(d >= 0)}${__state.fmtPct(d)} ${suffix}`;
        }
      }
    });
    if (typeof __state.homeSet === 'function') {
      const T = window.KiwiI18n?.T?.[lang] || {};
      typeof __state.homeSet === 'function' && __state.homeSet('tiles', { suffix, items: spec.filter((sp) => data[sp.key]).map((sp) => {
        const tl = data[sp.key];
        const unit = tl.unit ? String(tl.unit === 'MAD' ? __state.curUnit() : tl.unit).replace(/d{4,}/g, n => __state.frInt(Number(n))) : '';
        const value = __state.fmtKpiVal({ ...tl, unit: '' }, tl.text != null ? 0 : tl.value);
        return { key: sp.key, label: T[sp.i18n] || sp.label, value: String(value).replace(/<[^>]*>/g, ''), unit, dash: tl.text != null && String(tl.text).replace(/s/g, '') === '·',
          delta: tl.delta == null ? null : tl.delta, deltaText: tl.delta == null ? '' : __state.fmtPct(tl.delta) };
      }) });
    }
  }
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
function renderMix() {
    const effective = __state.effRange();
    const data = __state.vData(__state.mixByVenue, __state.currentRange);
    if (!data) return;
    const lang = __state.getLang();

    // Real and active-demo venues both render tenders actually in their ledger.
    // The static preview is only a fallback when no demo clock is running.
    const custom = !!(__state.ownData() && window.KiwiSales);
    __state.renderMixPlan(custom, lang);
    const real = custom ? __state.realMixRows(lang, __state.currentRange) : null;
    const rows = custom ? real.rows : data._demoLedger ? data.mixRows : [
      { color: '#0B6E4F', label: 'Visa',       pct: data.visa },
      { color: '#46A878', label: 'Mastercard', pct: data.mc   },
      { color: '#7DF2B0', label: 'Kiwi Tap',   pct: data.tap  },
      { color: '#D99A2B', label: 'QR',         pct: data.qr   },
    ];
    const rawCenterMad = custom ? real.total : data.centerMad;
    const centerMad = Number.isFinite(Number(rawCenterMad)) ? Number(rawCenterMad) : 0;

    const donut = document.querySelector('[data-mix-donut]');
    if (donut) {
      // Segments draw clockwise from 12 o'clock. Each segment carries its FINAL
      // dashoffset from the start; only stroke-dasharray animates from "0 100" → "P 100".
      // Clockwise from 12 o'clock. pathLength=100 → dash/offset are exact
      // percentages; a hairline GAP between segments keeps them legible. A
      // light→deep green ramp + amber makes all four methods distinguishable.
      const GAP = 1.6;
      const SW = 2.89;
      let acc = 0;
      const segs = rows.map((r) => {
        const pct = r.pct || 0;
        const seg = { stroke: r.color, pct, dash: Math.max(0, pct - GAP), offset: 25 - acc };
        acc += pct;
        return seg;
      });
      /* The built DOM caches one <circle> per segment, addressed by index. A real
       * store's tender set grows as it takes its first card or QR payment, so the
       * cached ring must be discarded whenever the shape changes — otherwise the
       * new tranche would have no element to draw into. */
      const sig = segs.map((s) => s.stroke).join('|');
      if (donut.dataset.sig !== sig) donut.dataset.built = '';
      donut.dataset.sig = sig;
      const built = donut.dataset.built === '1';
      const STAGGER_MS = 150;
      const FILL_MS = 850; // matches CSS transition duration

      if (!built) {
        donut['inner' + 'HTML'] = `
          <circle class="track" cx="21" cy="21" r="15.9155" fill="transparent" stroke="#EBE8E0" stroke-width="${SW}" pathLength="100"/>
          ${segs.map((s, i) => `
            <circle class="seg" data-seg="${i}"
              cx="21" cy="21" r="15.9155" fill="transparent"
              stroke="${s.stroke}" stroke-width="${SW}" pathLength="100"
              stroke-dasharray="0 100"
              stroke-dashoffset="${s.offset}"
              stroke-linecap="butt"/>
          `).join('')}
        `;
        donut.dataset.built = '1';
        // Initial entrance: segments wipe in clockwise, sequentially from visa → qr.
        segs.forEach((s, i) => {
          setTimeout(() => {
            const el = donut.querySelector(`[data-seg="${i}"]`);
            if (el) el.setAttribute('stroke-dasharray', `${s.dash} ${100 - s.dash}`);
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
            el.setAttribute('stroke-dasharray', `${s.dash} ${100 - s.dash}`);
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
    if (center) __state.animateNumber(center, __state.parseAmountFromEl(center), centerMad, { duration: 700, format: v => __state.frMoney(v) });

    /* On retire data-i18n côté venue réelle, sinon i18n.js réimposerait la
     * légende démo au prochain changement de langue ; on le remet pour la démo
     * afin qu'un retour en arrière retrouve sa traduction. */
    const centerUnit = center && center.parentElement
      ? center.parentElement.querySelector('.slash') : null;
    if (centerUnit) {
      if (custom || data._demoLedger) {
        centerUnit.removeAttribute('data-i18n');
        centerUnit.textContent = __state.MIX_CENTER_ALL[lang] || __state.MIX_CENTER_ALL.fr;
      } else {
        const T = window.KiwiI18n?.T?.[lang] || {};
        centerUnit.setAttribute('data-i18n', 'dash.mix.center.unit');
        centerUnit.textContent = T['dash.mix.center.unit'] || 'MAD carte';
      }
    }

    const sub = document.querySelector('[data-mix-sub]');
    if (sub) sub.textContent = __state.RANGE_STR[lang]?.[__state.currentRange] || __state.RANGE_STR.fr[__state.currentRange];

    const legend = document.querySelector('[data-mix-legend]');
    if (legend) {
      // No sales yet is a real answer — say so, rather than print rails at 0 %.
      if (!rows.length) {
        legend.innerHTML = `<div class="li"><div class="n" style="color:var(--n-500,#77807b);">${__state.MIX_EMPTY[lang] || __state.MIX_EMPTY.fr}</div></div>`;
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
        __state.animateNumber(el, from, r.pct, { duration: 600, format: v => `${Math.round(v)} %` });
      });
    }
  }
function renderMixPlan(custom, lang) {
    const label = document.querySelector('[data-mix-plan-name]');
    const status = document.querySelector('[data-mix-plan-status]');
    if (!label || !status) return;
    if (document.documentElement.classList.contains('kiwi-native')) {
      label.removeAttribute('data-i18n'); status.removeAttribute('data-i18n');
      label.textContent = 'Kiwi Pro';
      status.textContent = ({fr:'Votre espace de travail', en:'Your workspace', ar:'مساحة عملك'})[lang] || 'Kiwi Pro';
      return;
    }
    if (!custom) {
      label.setAttribute('data-i18n', 'dash.mix.subscription');
      status.setAttribute('data-i18n', 'dash.mix.subscription.price');
      /* The keys stay on the nodes for the next language switch, but this
         render runs after i18n has applied them: writing the French original
         here left « 399 MAD/mois · tout inclus » under English and Arabic. */
      const T = (window.KiwiI18n && window.KiwiI18n.T && window.KiwiI18n.T[lang]) || {};
      label.textContent = T['dash.mix.subscription'] || 'Abonnement Kiwi Pro';
      status.textContent = T['dash.mix.subscription.price'] || '399 MAD/mois · tout inclus';
      return;
    }
    label.removeAttribute('data-i18n');
    status.removeAttribute('data-i18n');
    const raw = String(window.KiwiConfig?.plan || '').toLowerCase();
    label.textContent = __state.PLAN_NAME[raw] ? `Kiwi ${__state.PLAN_NAME[raw]}` : 'Abonnement Kiwi';
    status.textContent = __state.PLAN_NAME[raw]
      ? (__state.PLAN_ACTIVE[lang] || __state.PLAN_ACTIVE.fr)
      : (__state.PLAN_PENDING[lang] || __state.PLAN_PENDING.fr);
  }
function renderFeed() {
    const lang = __state.getLang();
    const effective = __state.effRange();
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
    const rows = __state.ownData(venue) ? __state.buildCustomFeed(venue)
      : isLive ? __state.buildLiveFeed(venue) : __state.vData(__state.FEED_BY_VENUE, __state.currentRange);
    const wrap = document.querySelector('[data-feed]');

    if (wrap) {
      if (!rows || rows.length === 0) {
        /* Empty state — start of hour, no orders yet. */
        const fe = __state.tradeStr('feedEmpty', __state.FEED_EMPTY[lang] || __state.FEED_EMPTY.fr);
        wrap['inner' + 'HTML'] = `
          <div style="padding: 38px 18px 42px; text-align: center; display: flex; flex-direction: column; align-items: center;">
            <div style="width: 44px; height: 44px; border-radius: 13px; background: rgba(11,110,79,0.10); border: 1px solid rgba(11,110,79,0.18); color: var(--atlas); display: grid; place-items: center; margin-bottom: 14px;">
              <svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg>
            </div>
            <div style="display:inline-flex; align-items:center; gap:8px; padding:4px 12px; background:var(--paper-soft); border-radius:999px; font-family:var(--mono); font-size:11px; letter-spacing:0.06em; color:var(--n-600); margin-bottom:8px; border:1px solid var(--n-200);">
              <span class="pulse-dot" style="width:6px; height:6px; background:var(--atlas);"></span>${__state.escTxt(fe.badge)}
            </div>
            <div style="font-weight: 600; color: var(--ink); font-size: 14.5px; letter-spacing: -0.01em;">${__state.escTxt(fe.title)}</div>
            <div style="margin-top: 4px; font-size: 12.5px; color: var(--n-500); max-width: 36ch; line-height: 1.45;">${__state.escTxt(fe.sub)}</div>
          </div>
        `;
      } else {
        /* Cache the rich order objects so the click handler can pull full
         * detail (items, server, breakdown) from a stable key — avoids
         * round-tripping JSON through DOM attributes. */
        window.__kiwiFeedOrders = {};
        /* Rows cascade on data changes; live ticks rebuild without replay
         * (the .new row keeps its own slide-in). */
        wrap.classList.toggle('feed-anim', !__state.liveTickInProgress);
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
            tap:  `<i data-lucide="contactless" aria-hidden="true"></i>`,
            qr:   `<img src="assets/icons/qr-code.png" alt="QR">`,
            /* Neutral card chip — used when we know a card was tapped/inserted
             * but not which network. Never substitute a Visa/MC mark here. */
            cmi:  `<i data-lucide="credit-card" aria-hidden="true"></i>`,
          };
          const chipInner = ICONS[r.method] || '';

          /* Table promoted to a circular badge so the row scans as
           * "seat → person → amount" instead of running text together. */
          const tableChip = (r.table != null)
            ? `<span class="t-chip" aria-label="Table ${__state.escTxt(r.table)}">T${__state.escTxt(r.table)}</span>`
            : '';
          /* `ctx` is the till's sale label and `sub` a refund's ref: free text
           * typed at any till, stored raw by POST /api/sale. It goes through
           * innerHTML here, so every user-controlled field is escaped. */
          const who = __state.escTxt(r.customer ? r.customer : (r.ctx || ''));

          return `
          <div class="feed-row${r.isNew ? ' new' : ''}" style="--i:${idx};" tabindex="0" role="button" data-action="open-order" data-order-key="${key}">
            <div class="t">${__state.escTxt(r.t)}</div>
            <div class="method">
              <div class="ci ${__state.escTxt(r.method)}">${chipInner}</div>
              <div class="desc">
                <div class="primary">${__state.escTxt(trPay(r.primary))}</div>
                <div class="sub"><span class="flag ${__state.escTxt(r.flag)}"></span>${__state.escTxt(trPay(r.sub))}</div>
              </div>
            </div>
            <div class="ctx">${tableChip}<span class="who">${who}</span></div>
            <div class="amt"${r.neg ? ' style="color: var(--danger);"' : ''}>${r.amt}<span class="cur">${__state.curUnit()}</span></div>
            <div class="more" aria-hidden="true"><i data-lucide="chevron-right" width="14" height="14"></i></div>
          </div>
        `;
        }).join('');
      }
    }
    const titleEl = document.querySelector('[data-feed-title]');
    if (titleEl) titleEl.textContent = __state.FEED_TITLE[lang]?.[__state.currentRange] || __state.FEED_TITLE.fr[__state.currentRange];
    const subEl = document.querySelector('[data-feed-sub]');
    if (subEl) {
      if (isLive && rows && rows.length === 0) {
        subEl.textContent = __state.tradeStr('feedAwait',
            lang === 'en' ? 'Service open · awaiting first order'
          : lang === 'ar' ? 'الخدمة مفتوحة · في انتظار الطلب الأول'
          : 'Service ouvert · en attente de la 1ʳᵉ commande');
      } else if (isLive) {
        /* Live subtitle reflects the actual row count + total today.
         * A REAL merchant's count must come from their OWN sales: the demo
         * clock keeps simulating in the background, so reading its cumTx here
         * printed "98 commandes aujourd'hui" on a store that had rung 2. */
        let cumTx;
        if (__state.ownData() && window.KiwiSales) {
          const [t0, t1] = __state.rangeBounds('aujourdhui');
          let sales = [];
          try { sales = window.KiwiSales.list(__state.getCurrentVenue()) || []; } catch (_) { sales = []; }
          cumTx = sales.filter((s) => {
            const ts = +(s && s.ts) || 0;
            return ts >= t0 && ts < t1 && String(s.kind || '') !== 'refund' && Number(s.amount) > 0;
          }).length;
        } else {
          const sim = window.KiwiDemoClock?.getSimState?.();
          cumTx = sim?.cumTx ?? 0;
        }
        const n = rows.length;
        const word = lang === 'en' ? 'last' : lang === 'ar' ? 'آخر' : (n < 2 ? 'dernière' : 'dernières');
        const total = lang === 'en' ? `· ${cumTx} today`
                    : lang === 'ar' ? `· ${cumTx} اليوم`
                    : `· ${cumTx} commande${cumTx > 1 ? 's' : ''} aujourd'hui`;
        subEl.textContent = `${n} ${word} ${total}`;
      } else {
        subEl.textContent = __state.FEED_SUB[lang]?.[__state.currentRange] || __state.FEED_SUB.fr[__state.currentRange];
      }
    }
    const strip = (x) => String(x == null ? '' : x).replace(/<[^>]*>/g, '');
    const feedEmpty = __state.tradeStr('feedEmpty', __state.FEED_EMPTY[lang] || __state.FEED_EMPTY.fr);
    typeof __state.homeSet === 'function' && __state.homeSet('feed', {
      title: titleEl ? titleEl.textContent : '', sub: subEl ? subEl.textContent : '', unit: __state.curUnit(),
      empty: { title: feedEmpty.title, sub: feedEmpty.sub },
      rows: (rows || []).map((r, idx) => ({ key: `o${idx}`, time: strip(r.t), primary: strip(trPay(r.primary)), sub: strip(trPay(r.sub)),
        table: r.table == null ? null : r.table, who: strip(r.customer ? r.customer : (r.ctx || '')), amount: strip(r.amt), neg: !!r.neg })),
    });
  }
function renderSettle() {
    const lang = __state.getLang();
    const effective = __state.effRange();
    const data = __state.vData(__state.settleByVenue, __state.currentRange);
    if (!data) return;

    const lblEl = document.querySelector('[data-settle-lbl]');
    if (lblEl) lblEl.textContent = __state.SETTLE_LBL[lang]?.[__state.currentRange] || __state.SETTLE_LBL.fr[__state.currentRange];

    const amtEl = document.querySelector('[data-settle-amt]');
    if (amtEl) __state.animateNumber(amtEl, __state.parseIntFromEl(amtEl), data.amt, { duration: 800, format: __state.fmtSettleAmount });

    const subEl = document.querySelector('[data-settle-sub]');
    if (subEl) subEl.textContent = data.sub;

    const detailEl = document.querySelector('[data-settle-detail]');
    if (detailEl) {
      detailEl.innerHTML = `
        <span>${__state.SETTLE_DETAIL_LBL[lang] || __state.SETTLE_DETAIL_LBL.fr}</span>
        <span style="color: var(--mint); font-family: var(--mono);">${data.detailVal}</span>
      `;
    }
  }
function renderPairs(card, isCustom, lang) {
    const host = card && card.querySelector('[data-products-pairs]');
    if (!host) return;
    const p = isCustom ? __state.realPairs(__state.currentRange) : null;
    if (!p || !p.baskets) { host.hidden = true; host.replaceChildren(); return; }
    const S = __state.PAIRS_STR[lang] || __state.PAIRS_STR.fr;
    const head = `<div class="pp-t">${__state.escTxt(S.t)}</div>`;
    if (p.baskets < __state.PAIRS_MIN_BASKETS) {
      host.innerHTML = head + `<div class="pp-wait">${__state.escTxt(S.wait(__state.frInt(p.baskets), __state.frInt(__state.PAIRS_MIN_BASKETS)))}</div>`;
    } else if (!p.rows.length) {
      host.innerHTML = head + `<div class="pp-wait">${__state.escTxt(S.none(__state.frInt(p.baskets)))}</div>`;
    } else {
      host.innerHTML = head + p.rows.map((r) => `
        <div class="pp-row">
          <div class="pp-n">${__state.escTxt(r.lead)}<span class="pp-plus" aria-hidden="true">+</span>${__state.escTxt(r.other)}</div>
          <div class="pp-why">${__state.escTxt(S.why(__state.frInt(r.together), __state.frInt(Math.round(r.share * 100)), r.lead))}</div>
        </div>`).join('');
    }
    host.hidden = false;
  }
function renderInteg() {
    const card = document.querySelector('[data-integ-card]');
    if (!card) return;
    if (__state._integOrig == null) __state._integOrig = card['inner' + 'HTML'];
    if (__state.ownData()) {
      const lang = __state.getLang();
      const notConn = __state.INTEG_NOTCONN[lang] || __state.INTEG_NOTCONN.fr;
      const addLbl = (window.KiwiI18n?.t?.('dash.integ.add')) || '+ Ajouter une intégration';
      const cards = __state.INTEG_LIST.map(it =>
        `<div class="integ-card" data-action="${it.channel ? 'integration-connect' : 'add-integration'}"` +
        ` data-arg="${it.n}" data-channel="${it.channel || ''}">` +
        `<div class="logo" style="background:${it.bg};opacity:.55;">${it.logo}</div>` +
        `<div class="info"><div class="n">${it.n}</div>` +
        `<div class="s"><span class="dot warn"></span><span>${notConn}</span></div></div></div>`
      ).join('');
      card['inner' + 'HTML'] =
        `<div class="block-head"><div>` +
        `<div class="t">${__state.INTEG_TITLE[lang] || __state.INTEG_TITLE.fr}</div>` +
        `<div class="s">${__state.INTEG_SUB[lang] || __state.INTEG_SUB.fr}</div></div>` +
        `<a data-activation=write href="#" data-action="add-integration" style="font-size:13px;color:var(--atlas);font-weight:500;">${addLbl}</a>` +
        `</div><div class="integ-grid">${cards}</div>`;
    } else if (__state._integOrig != null && card['inner' + 'HTML'] !== __state._integOrig) {
      card['inner' + 'HTML'] = __state._integOrig;
    }
  }
function renderNotifBadge() {
    const b = document.querySelector('[data-notif-badge]');
    if (!b) return;
    b.style.display = __state.ownData() ? 'none' : '';
  }
function renderEvening() {
    const el = document.querySelector('[data-evening-card]');
    if (!el) return;
    if (__state._eveningOrig == null) __state._eveningOrig = el['inner' + 'HTML'];
    if (__state.ownData()) {
      const lang = __state.getLang();
      const t = __state.tradeStr('eveningEmpty', __state.EVENING_EMPTY[lang] || __state.EVENING_EMPTY.fr);
      /* Pharmacie : ce soir = la garde (fiches « Gardes & relève », que la caisse ouvre et ferme),
         pas des réservations de tables. */
      const dutyHtml = __state.dutyBand(lang, t) || __state.retailBand(lang, t);
      if (dutyHtml) { el['inner' + 'HTML'] = dutyHtml; return; }
      let doc = null;
      try { doc = window.KiwiReservations?.get?.(); } catch (_) {}
      const now = Date.now(), currentDay = __state.merchantDayKey(now, __state.activeMerchantSlug()), currentWindow = __state.merchantDayBounds(currentDay, __state.activeMerchantSlug()), start = currentWindow.from, end = currentWindow.to;
      const active = doc && Array.isArray(doc.bookings) ? doc.bookings.filter((b) =>
        ['requested', 'confirmed', 'checked_in'].includes(b.status) && +b.startAt >= start && +b.startAt < end && +b.endAt >= now
      ).sort((a, b) => +a.startAt - +b.startAt) : [];
      if (active.length) {
        const covers = active.reduce((n, b) => n + Math.max(1, +b.partySize || 1), 0);
        const resource = new Map((doc.resources || []).map((r) => [String(r.id), r.name]));
        const labels = {
          fr: { lbl: 'RÉSERVATIONS À VENIR · AUJOURD’HUI', unit: 'couverts', sub: (n) => `${n} réservation${n > 1 ? 's actives' : ' active'}`, pending: 'À confirmer', confirmed: 'Confirmée', checked_in: 'Arrivé', open: 'Ouvrir Réservations', more: (n) => `+${n} autre${n > 1 ? 's' : ''}` },
          en: { lbl: 'UPCOMING BOOKINGS · TODAY', unit: 'guests', sub: (n) => `${n} active booking${n > 1 ? 's' : ''}`, pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in', open: 'Open Reservations', more: (n) => `+${n} more` },
          ar: { lbl: 'الحجوزات القادمة · اليوم', unit: 'ضيف', sub: (n) => `${n} حجوزات نشطة`, pending: 'في انتظار التأكيد', confirmed: 'مؤكد', checked_in: 'وصل', open: 'فتح الحجوزات', more: (n) => `+${n} أخرى` },
        }[lang] || null;
        const L = labels || { lbl: 'RÉSERVATIONS À VENIR · AUJOURD’HUI', unit: 'couverts', sub: (n) => `${n} réservations actives`, pending: 'À confirmer', confirmed: 'Confirmée', checked_in: 'Arrivé', open: 'Ouvrir Réservations', more: (n) => `+${n} autres` };
        el['inner' + 'HTML'] = `<div class="lbl">${L.lbl}</div>` +
          `<div class="big">${covers} <span style="font-size:.42em;opacity:.72;">${L.unit}</span></div>` +
          `<div class="sub">${L.sub(active.length)}</div>` +
          `<div style="margin-top:16px;padding-top:12px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);display:flex;flex-direction:column;gap:9px;">` +
          active.slice(0, 3).map((b) => {
            const status = b.status === 'requested' ? L.pending : (L[b.status] || L.confirmed);
            const at = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(+b.startAt));
            const place = resource.get(String(b.resourceId));
            return `<div style="display:grid;grid-template-columns:48px 1fr auto;gap:9px;align-items:center;font-size:12px;">` +
              `<span style="font-family:var(--mono);color:var(--mint);font-weight:600;">${__state.escTxt(at)}</span>` +
              `<div style="min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${__state.escTxt(b.customer?.name)}</div>` +
              `<div style="opacity:.7;margin-top:1px;">${Math.max(1, +b.partySize || 1)} ${L.unit}${place ? ` · ${__state.escTxt(place)}` : ''}</div></div>` +
              `<span style="font-size:11px;opacity:.7;">${status}</span></div>`;
          }).join('') + `</div>` +
          `<div class="instant" data-action="nav-reservations"><div class="ico"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z"/></svg></div>` +
          `<div style="font-weight:500;">${L.open}</div><div class="cost">${active.length > 3 ? L.more(active.length - 3) : ''}</div></div>`;
      } else {
        const configured = !!(doc && doc.settings && doc.services?.length && doc.resources?.length);
        const head = configured ? t.head : ({ fr: 'Réservations non configurées', en: 'Bookings not configured', ar: 'الحجوزات غير مهيأة' }[lang]);
        const msg = configured ? t.msg : ({ fr: 'Ajoutez vos tables et vos horaires pour recevoir des réservations.', en: 'Add tables and opening hours to accept bookings.', ar: 'أضف الطاولات وساعات العمل لاستقبال الحجوزات.' }[lang]);
        el['inner' + 'HTML'] = `<div class="lbl">${t.lbl}</div><div style="padding:28px 4px 8px;text-align:center;">` +
          `<div style="font-size:14px;font-weight:600;">${head}</div>` +
          `<div style="font-size:12px;opacity:.7;margin-top:6px;line-height:1.5;">${msg}</div></div>` +
          `<div class="instant" data-action="nav-reservations"><div style="font-weight:500;">${lang === 'en' ? 'Open Reservations' : lang === 'ar' ? 'فتح الحجوزات' : 'Ouvrir Réservations'}</div></div>`;
      }
    } else if (el['inner' + 'HTML'] !== __state._eveningOrig) {
      el['inner' + 'HTML'] = __state._eveningOrig;
    }
  }
function renderStock() {
    const el = document.querySelector('[data-stock-card]');
    if (!el) return;
    if (__state._stockOrig == null) __state._stockOrig = el['inner' + 'HTML'];
    if (__state.ownData()) {
      const lang = __state.getLang();
      const t = __state.tradeStr('stockEmpty', __state.STOCK_EMPTY[lang] || __state.STOCK_EMPTY.fr);
      /* L'accueil porte DEUX cartes « Stock à recommander » : celle-ci, dans la
       * colonne de droite, et la liste [data-products-list]. Seule la seconde
       * avait été rebranchée sur le catalogue — le commerçant lisait donc
       * « Aucune alerte de stock » à droite pendant que la gauche affichait
       * l'article sous le seuil. Même source, même seuil, plus de contradiction. */
      const low = __state.realLowStock();
      if (low && low.rows.length) {
        el['inner' + 'HTML'] =
          `<div class="block-head" style="margin-bottom:6px;"><div>` +
          `<div class="t">${__state.STOCK_TITLE_STR[lang] || __state.STOCK_TITLE_STR.fr}</div>` +
          `<div class="s">${(__state.STOCK_SUB_STR[lang] || __state.STOCK_SUB_STR.fr)(low.rows.length)}</div>` +
          `</div></div>` +
          low.rows.map((r) => {
            const dead = r.stock === 0;
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;` +
              `padding:9px 2px;border-top:1px solid var(--n-200);">` +
              `<div style="min-width:0;">` +
              `<div style="font-size:13px;font-weight:500;color:var(--ink);overflow:hidden;` +
              `text-overflow:ellipsis;white-space:nowrap;">${__state.escTxt(r.name)}</div>` +
              `<div style="font-size:11.5px;margin-top:2px;color:${dead ? 'var(--danger)' : 'var(--n-500)'};">` +
              `${dead ? (__state.RUPTURE_STR[lang] || __state.RUPTURE_STR.fr) : (__state.LOWSTK_STR[lang] || __state.LOWSTK_STR.fr)(r.threshold)}</div>` +
              `</div>` +
              `<div style="text-align:right;font-family:var(--mono);color:${dead ? 'var(--danger)' : 'var(--ink)'};">` +
              `<div style="font-size:14px;font-weight:600;">${r.stock} ${__state.escTxt(r.unit || '')}</div>` +
              `${r.suggested ? `<div style="font-size:11px;color:var(--n-500);">+${r.suggested} ${__state.escTxt(r.unit)}${r.cost ? ` · ${__state.frInt(r.suggested * r.cost)} ${__state.curUnit()}` : ''}</div>` : ''}</div>` +
              `</div>`;
          }).join('');
        el['inner' + 'HTML'] += `<a href="#" data-action="nav-stock" style="display:block;margin-top:12px;text-align:center;font-size:12.5px;color:var(--atlas);font-weight:600;">${lang === 'en' ? 'Open inventory & purchasing →' : lang === 'ar' ? 'فتح المخزون والمشتريات ←' : 'Ouvrir Stock & approvisionnement →'}</a>`;
        return;
      }
      el['inner' + 'HTML'] =
        `<div class="block-head" style="margin-bottom:14px;"><div>` +
        `<div class="t">${t.title}</div></div></div>` +
        `<div style="padding:16px 8px 12px;text-align:center;">` +
        `<div style="width:36px;height:36px;border-radius:10px;background:rgba(63,182,122,0.12);color:var(--mint);display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px;">` +
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
        `</div>` +
        `<div style="font-size:14px;font-weight:600;color:var(--ink);">${t.head}</div>` +
        `<div style="font-size:12px;color:var(--n-500);margin-top:6px;line-height:1.5;max-width:280px;margin-inline:auto;">${low && !low.configured ? (__state.STOCK_NO_THRESHOLDS[lang] || __state.STOCK_NO_THRESHOLDS.fr)(low.tracked) : low ? (__state.STOCK_OK_STR[lang] || __state.STOCK_OK_STR.fr)(low.tracked) : t.msg}</div>` +
        `</div>`;
    } else if (el['inner' + 'HTML'] !== __state._stockOrig) {
      el['inner' + 'HTML'] = __state._stockOrig;
    }
  }
function renderTimeline() {
    const effective = __state.effRange();
    const totalEl = document.querySelector('[data-timeline-week-total]');
    if (!totalEl) return;
    /* Le repli `|| timelineWeekTotalByVenue.cafeAtlas` servait le total du CAFÉ
     * ATLAS à tout commerçant absent de cette table — c'est-à-dire à tous les
     * vrais. Ce n'était pas un état vide, c'était le chiffre d'affaires de
     * quelqu'un d'autre affiché comme le sien. Une venue réelle additionne ses
     * propres ventes ; le tilde disparaît, ce total-là est exact. */
    if (__state.ownData() && window.KiwiSales) {
      totalEl.textContent = `${__state.frInt(__state.realSalesTotals(__state.currentRange).revenue)} ${__state.curUnit()}`;
      return;
    }
    const total = (__state.timelineWeekTotalByVenue[__state.getCurrentVenue()] || __state.timelineWeekTotalByVenue.cafeAtlas)[effective];
    if (total) totalEl.textContent = total;
  }
function renderHealth() {
    const lang = __state.getLang();
    const card = document.querySelector('[data-health-card]');
    if (card && __state._healthOrig == null) __state._healthOrig = card['inner' + 'HTML'];
    if (__state.ownData()) {
      if (card) {
        const t = __state.HEALTH_EMPTY[lang] || __state.HEALTH_EMPTY.fr;
        card.hidden = true;
        card.classList.add('is-empty-state');
        card['inner' + 'HTML'] =
          `<div class="block-head"><div><div class="t">${t.title}</div></div></div>` +
          __state.emptyBlockBody(t.head, t.msg);
      }
      return;
    }
    if (card) {
      card.hidden = false;
      card.classList.remove('is-empty-state');
      if (__state._healthOrig != null && card['inner' + 'HTML'] !== __state._healthOrig) card['inner' + 'HTML'] = __state._healthOrig;
    }
    const effective = __state.effRange();
    const data = __state.vData(__state.healthByVenue, __state.currentRange);
    if (!data) return;

    const subEl = document.querySelector('[data-health-sub]');
    if (subEl) subEl.textContent = __state.HEALTH_SUB[lang]?.[__state.currentRange] || __state.HEALTH_SUB.fr[__state.currentRange];

    const chipEl = document.querySelector('[data-health-chip]');
    if (chipEl) chipEl.textContent = __state.HEALTH_CHIP[lang]?.[data.chipKey] || __state.HEALTH_CHIP.fr[data.chipKey];

    const scoreEl = document.querySelector('[data-health-score]');
    if (scoreEl) __state.animateNumber(scoreEl, __state.parseIntFromEl(scoreEl), data.score, { duration: 700, format: v => `${Math.round(v)}` });

    const arc = document.querySelector('[data-health-arc]');
    if (arc) arc.setAttribute('stroke-dasharray', `${data.score} 100`);
  }
function renderBench() {
    const lang = __state.getLang();
    const card = document.querySelector('[data-bench-card]');
    if (card && __state._benchOrig == null) __state._benchOrig = card['inner' + 'HTML'];
    /* "#12 sur 147 cafés à Casablanca · top 8 %" is a cohort Kiwi does not
     * have. It is fine in the demo, where every number is openly a rehearsal,
     * and it is not fine anywhere else — an invented peer benchmark is worse
     * than an invented figure, because it reads like data somebody else
     * collected and a merchant reasonably prices against it. The gate was
     * isCustom() alone, which left the real-but-not-custom session showing a
     * ranking among 147 cafés that were never counted. */
    if (__state.ownData() || window.KiwiEnv?.isReal?.()) {
      if (card) {
        const t = __state.BENCH_EMPTY[lang] || __state.BENCH_EMPTY.fr;
        card.hidden = true;
        card.classList.add('is-empty-state');
        card['inner' + 'HTML'] =
          `<div class="block-head"><div><div class="t">${t.title}</div></div></div>` +
          __state.emptyBlockBody(t.head, t.msg);
      }
      return;
    }
    if (card) {
      card.hidden = false;
      card.classList.remove('is-empty-state');
      if (__state._benchOrig != null && card['inner' + 'HTML'] !== __state._benchOrig) card['inner' + 'HTML'] = __state._benchOrig;
    }
    const effective = __state.effRange();
    const data = __state.vData(__state.benchByVenue, __state.currentRange);
    if (!data) return;

    // Title + sub vary by venue type (cafés / boutiques / spas similaires)
    const benchLabels = window.KiwiVenue?.getBenchLabels?.() || { title: __state.BENCH_TITLE_FALLBACK[lang] || __state.BENCH_TITLE_FALLBACK.fr, sub: __state.BENCH_SUB.fr[__state.currentRange] };
    const titleEl = document.querySelector('[data-bench-title]');
    if (titleEl) titleEl.textContent = benchLabels.title;
    const subEl = document.querySelector('[data-bench-sub]');
    if (subEl) subEl.textContent = benchLabels.sub || __state.BENCH_SUB[lang]?.[__state.currentRange] || __state.BENCH_SUB.fr[__state.currentRange];

    const rankEl = document.querySelector('[data-bench-rank]');
    if (rankEl) __state.animateNumber(rankEl, __state.parseIntFromEl(rankEl), data.rank, { duration: 650, format: v => `#${Math.round(v)}` });

    // Match the rank-sub wording to the vertical
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    const peerLabel = (__state.BENCH_PEER[lang] || __state.BENCH_PEER.fr)[venueType] || (__state.BENCH_PEER[lang] || __state.BENCH_PEER.fr).restaurant;
    const cityLabel = (__state.BENCH_CITY[lang] || __state.BENCH_CITY.fr)[venueType === 'spa' ? 'spa' : 'default'];
    const rankSubEl = document.querySelector('[data-bench-rank-sub]');
    if (rankSubEl) rankSubEl['inner' + 'HTML'] = (__state.BENCH_RANK_SUB[lang] || __state.BENCH_RANK_SUB.fr)(data.total, peerLabel, cityLabel, data.top);

    const comp = document.querySelector('[data-bench-comp]');
    if (comp) {
      comp.innerHTML = data.rows.map((r, i) => `
        <div class="bench-row" style="--i:${i};">
          <div class="lbl">${__state.trStr(r.lbl, __state.BENCH_LBL)}</div>
          <div class="bench-bar">
            <div class="you" style="width: 0%;" data-grow="${r.you}%"></div>
            <div class="peer" style="left: ${r.peer}%;"></div>
          </div>
          <div class="v"${r.warn ? ' style="color: var(--warning);"' : ''}>${r.v}</div>
        </div>
      `).join('');
      __state.growBars(comp);
    }
  }
function renderProducts() {
    const lang = __state.getLang();
    const effective = __state.effRange();
    const isCustom = __state.ownData();
    const data = isCustom ? [] : __state.vData(__state.productsByVenue, __state.currentRange);
    const pe = __state.tradeStr('productsEmpty', __state.PRODUCTS_EMPTY[lang] || __state.PRODUCTS_EMPTY.fr);
    const real = isCustom ? __state.realTopProducts(__state.currentRange) : null;
    const titleEl = document.querySelector('[data-products-title]');
    if (titleEl) titleEl.textContent = (isCustom && pe.title) || __state.PRODUCTS_TITLE[lang] || __state.PRODUCTS_TITLE.fr;
    const manageEl = document.querySelector('[data-products-manage]');
    if (manageEl) manageEl.textContent = (isCustom && pe.manage) || __state.PRODUCTS_MANAGE[lang] || __state.PRODUCTS_MANAGE.fr;
    const list = document.querySelector('[data-products-list]');
    const card = list?.closest('.block');
    if (list && real && real.rows.length) {
      const cap = Math.max(1, ...real.rows.map((r) => r.qty));
      list.innerHTML = real.rows.map((r, i) => `
        <div class="prod-row" style="--i:${i};">
          <div class="rank${i === 0 ? ' top' : ''}">${i + 1}</div>
          <div class="info">
            <div class="n">${__state.escTxt(r.name)}</div>
            <div class="r">${__state.frInt(r.revenue)} MAD</div>
          </div>
          <div class="mini-bar"><div style="width: 0%;" data-grow="${Math.round((r.qty / cap) * 100)}%"></div></div>
          <div class="sales">${(__state.PRODUCT_SOLD[lang] || __state.PRODUCT_SOLD.fr)(r.qty)}</div>
        </div>
      `).join('');
      __state.growBars(list);
    } else if (list && isCustom) {
      list.innerHTML = __state.emptyListBody(real && real.sales ? (__state.PRODUCTS_NO_LINES[lang] || __state.PRODUCTS_NO_LINES.fr)(real.sales) : pe.msg);
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
      __state.growBars(list);
    }
    if (card) card.classList.toggle('is-empty-state', !!list && !list.querySelector('.prod-row'));
    try { __state.renderPairs(card, isCustom, lang); } catch (_) {}
    const sub = document.querySelector('[data-products-sub]');
    if (sub) sub.textContent = isCustom
      ? (real && real.rows.length ? (__state.PRODUCTS_COVERAGE[lang] || __state.PRODUCTS_COVERAGE.fr)(real.rows.length, real.covered, real.sales) : pe.sub)
      : (__state.PRODUCTS_SUB[lang]?.[__state.currentRange] || __state.PRODUCTS_SUB.fr[__state.currentRange]);
  }
function renderStaff() {
    const lang = __state.getLang();
    const effective = __state.effRange();
    const isCustom = __state.ownData();
    const data = isCustom ? [] : __state.vData(__state.staffByVenue, __state.currentRange);
    const se = __state.tradeStr('staffEmpty', __state.STAFF_EMPTY[lang] || __state.STAFF_EMPTY.fr);
    const titleEl = document.querySelector('[data-staff-title]');
    if (titleEl) titleEl.textContent = (isCustom && se.title) || __state.STAFF_TITLE[lang] || __state.STAFF_TITLE.fr;
    const list = document.querySelector('[data-staff-list]');
    const card = list?.closest('.block');
    /* Une équipe existe dès qu'un membre est saisi côté Équipe — la carte ne peut
     * plus prétendre le contraire. Les heures viennent de la grille de Paie, donc
     * « en service » veut dire ici exactement ce qu'il veut dire là-bas.
     * Le montant reste « — » : Kiwi ne rattache pas encore une vente à un
     * vendeur, et inventer un chiffre par personne serait pire que le tiret. */
    const roster = isCustom ? __state.realRoster() : null;
    if (list && roster && roster.length) {
      list.innerHTML = roster.map((s, i) => {
        const on = s.hoursToday > 0;
        return `
        <div class="staff-row" style="--i:${i};">
          <div class="av${on ? '' : ' offline'}"${on ? '' : ' style="background: var(--n-400);"'}>${__state.escTxt(s.avatar)}</div>
          <div class="info">
            <div class="n">${__state.escTxt(s.name)}</div>
            <div class="role">${__state.escTxt(s.role)}</div>
          </div>
          <div class="shift"${on ? '' : ' style="color: var(--n-500);"'}>${on ? __state.fmtHeures(s.hoursToday) : '·'}</div>
          <div class="tx-n" style="color: var(--n-500);">·</div>
        </div>`;
      }).join('');
    } else if (list && isCustom) {
      list.innerHTML = __state.emptyListBody(se.msg);
    } else if (list && data) {
      list.innerHTML = data.map((s, i) => `
        <div class="staff-row" style="--i:${i};">
          <div class="av ${s.cls}"${s.cls === 'offline' ? ' style="background: var(--n-400);"' : ''}>${s.av}</div>
          <div class="info">
            <div class="n">${s.name}</div>
            <div class="role">${__state.demoRole(s.role, __state.getLang())}</div>
          </div>
          <div class="shift"${s.shift === '·' ? ' style="color: var(--n-500);"' : ''}>${s.shift}</div>
          <div class="tx-n"${s.amt === '·' ? ' style="color: var(--n-500);"' : ''}>${s.amt}${s.tx ? `<br/><span style="color: var(--success); font-size: 11px;">${s.tx}</span>` : ''}</div>
        </div>
      `).join('');
    }
    if (card) card.classList.toggle('is-empty-state', !!list && !list.querySelector('.staff-row'));
    const sub = document.querySelector('[data-staff-sub]');
    if (sub) sub.textContent = (roster && roster.length)
      ? (__state.STAFF_ONDUTY_STR[lang] || __state.STAFF_ONDUTY_STR.fr)(roster.filter((s) => s.hoursToday > 0).length, roster.length)
      : (isCustom
        ? se.sub
        : (__state.STAFF_SUB[lang]?.[__state.currentRange] || __state.STAFF_SUB.fr[__state.currentRange]));
  }
    return { renderHero, renderHeroAi, renderHeatmapAi, renderGoal, renderHeatmap, renderKpiBand, renderRevChart, renderMix, renderMixPlan, renderFeed, renderSettle, renderPairs, renderInteg, renderNotifBadge, renderEvening, renderStock, renderTimeline, renderHealth, renderBench, renderProducts, renderStaff };
  };
})();
