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
function aggFusion(values, parentKey, rateCtx) {
    const defined = values.filter(v => v !== undefined && v !== null);
    if (defined.length === 0) return values[0] ?? null;
    const first = defined[0];
    // Rate context: once an ancestor key is "rate-like" (success/ratio/taux/
    // delta…) every numeric descendant averages instead of sums. This keeps
    // a fused success of 95% × 92% × 88% reading as ~91%, not 275%.
    const myRateCtx = rateCtx || __state.FUSION_AVG_KEYS.test(String(parentKey || ''));
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
    if (__state.isPlainObj(first)) {
      const keys = new Set();
      defined.forEach(o => __state.isPlainObj(o) && Object.keys(o).forEach(k => keys.add(k)));
      const out = {};
      keys.forEach(k => {
        const slice = defined.map(o => __state.isPlainObj(o) ? o[k] : undefined);
        out[k] = aggFusion(slice, k, myRateCtx);
      });
      return out;
    }
    return first;
  }

function zeroClone(x) {
    if (typeof x === 'number') return 0;
    if (Array.isArray(x)) return x.map(zeroClone);
    if (x && typeof x === 'object') {
      const o = {};
      for (const k in x) o[k] = zeroClone(x[k]);
      return o;
    }
    return x; // strings (labels), booleans, null — preserved
  }

function vData(table, range) {
    const v = __state.getCurrentVenue();
    const knownRanges = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'personnalise'];
    const requested = range === 'personnalise' ? __state.effRange() : range;
    const hasRequested = !!(table?.[v]?.[requested] ?? table?.cafeAtlas?.[requested]);
    const eff = knownRanges.includes(range) || hasRequested ? requested : 'trenteJours';
    // A user-created venue has no demo data — hand back a zeroed clone of its
    // base type's demo sibling so the dashboard renders empty rather than
    // borrowing live numbers via the fallback below. The shape must match the
    // vertical (a boutique-based venue needs tauxRetour, a spa needs tips…),
    // otherwise vertical-specific KPI tiles silently drop.
    if (__state.ownData(v)) {
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
    const shape = table?.[v]?.[eff] ?? table?.cafeAtlas?.[eff] ?? table?.[v]?.trenteJours ?? table?.cafeAtlas?.trenteJours;
    return demoLedgerProjection(table, eff, shape);

  }

function priorLedgerRows(range, selected, days, day) {
    const clock = window.KiwiDemoClock, dr = window.KiwiDayReport;
    if (days === 1) {
      const before = dr.shiftDay(selected,-1), b = dr.dayBounds(selected), o = dr.dayBounds(before);
      const cut = range === 'aujourdhui' ? o.from + (Date.now() - b.from) : o.to;
      return clock.getDaySales(before).filter(r=>r.ts<=cut);
    }
    let prior = [];
    for (let i = days; i < days * 2; i++) prior = prior.concat(clock.getDaySales(dr.shiftDay(day,-i)));
    return prior;
  }

function demoLedgerProjection(table, range, shape) {
    const clock = window.KiwiDemoClock, dr = window.KiwiDayReport;
    if (!shape || !dr || !['aujourdhui','hier','septJours','trenteJours'].includes(range)
      || ![__state.heroDataByVenue,__state.goalByVenue,__state.kpiByVenue,__state.revChartByVenue,__state.mixByVenue].includes(table) || !clock?.getSimState?.()) return shape;
    const day = dr.today(), days = range === 'septJours' ? 7 : range === 'trenteJours' ? 30 : 1;
    const selected = range === 'hier' ? dr.shiftDay(day,-1) : day;
    const rows = days === 1 ? clock.getDaySales(selected) : clock.getSales(days);
    const sum = __state.ledgerSum;
    const total = sum(rows), count = rows.length;
    if (table === __state.heroDataByVenue) return {...shape,amount:total,netAfterKiwi:total,deltaHier:null,deltaSemaine:null,deltaMois:null};
    if (table === __state.goalByVenue) return {...shape,current:total};
    // One ledger, one tender definition across the donut and card/cash KPI.
    const tenders = entries => {
      const by = {};
      entries.forEach(entry => __state.tenderAmounts(entry).forEach(part => {
        if (part.key) by[part.key] = (by[part.key] || 0) + Math.round(part.amount * 100);
      }));
      return by;
    };
    const by = tenders(rows);
    if (table === __state.mixByVenue) {
      const collectedCents = Object.values(by).reduce((s, value) => s + value, 0);
      const lang = __state.getLang();
      return {...shape, _demoLedger:true, centerMad:collectedCents / 100,
        mixRows:__state.REAL_MIX.filter(m => by[m.key] > 0).map(m => ({
          color:m.color, label:m[lang] || m.fr, pct:by[m.key] / collectedCents * 100}))};
    }
    if (table === __state.kpiByVenue) {
      // Same-length previous window (priorLedgerRows). Deltas come from the
      // ledger, never a constant.
      const prior = priorLedgerRows(range, selected, days, day);
      const pct = (now, then) => then ? Math.round((now - then) / then * 1000) / 10 : 0;
      const priorTotal = sum(prior), priorCount = prior.length;
      const cardShare = tender => {
        const card = (tender.card || 0) + (tender.tap || 0), cash = tender.cash || 0;
        return card + cash ? card / (card + cash) * 100 : null;
      };
      const share = cardShare(by), oldShare = cardShare(tenders(prior));
      const roundedShare = Math.round(share || 0);
      return {...shape,
        ratio:shape.ratio && {...shape.ratio,
          text:share == null ? '·' : `${roundedShare} / ${100 - roundedShare}`,
          unit:share == null ? '' : '%', delta:share == null || oldShare == null ? null : pct(share, oldShare)},
        tx:shape.tx && {...shape.tx,value:count,delta:pct(count,priorCount)},
        panier:shape.panier && {...shape.panier,value:count ? total/count : 0,
          delta:pct(count ? total/count : 0, priorCount ? priorTotal/priorCount : 0)}};
    }
    let rev, revPrev, xLabels, visibleXIdx, cursor = {};
    if (days > 1) {
      const keys = Array.from({length:days},(_,i)=>dr.shiftDay(day,i-days+1));
      rev = keys.map(key=>sum(clock.getDaySales(key)));
      revPrev = keys.map(key=>sum(clock.getDaySales(dr.shiftDay(key,-days))));
      xLabels = keys.map(key=>new Date(key+'T12:00:00').toLocaleDateString(__state.getLang()==='ar'?'ar-MA':__state.getLang()==='en'?'en-GB':'fr-FR',{weekday:'short',day:'numeric'}));
      visibleXIdx = keys.map((_,i)=>i).filter(i=>days===7 || i%5===0 || i===days-1);
    } else {
      const bounds=dr.dayBounds(selected), before=dr.shiftDay(selected,-1), prior=clock.getDaySales(before), old=dr.dayBounds(before);
      const progress = range==='aujourdhui' ? Math.min(24,(Date.now()-bounds.from)/(bounds.to-bounds.from)*24) : 24;
      const index=Math.min(23,Math.floor(progress));
      rev = Array.from({length:25},(_,i)=>i>Math.ceil(progress)?null:sum(rows.filter(r=>r.ts<=bounds.from+Math.min(i,progress)/24*(bounds.to-bounds.from))));
      revPrev = Array.from({length:25},(_,i)=>sum(prior.filter(r=>r.ts<=old.from+i/24*(old.to-old.from))));
      xLabels=Array.from({length:25},(_,i)=>String((5+i)%24).padStart(2,'0')+'h');
      visibleXIdx=xLabels.map((_,i)=>i);
      if(range==='aujourdhui') cursor={_simIdx:index,_simWithin:progress-index};
    }
    const maximum=Math.max(1,...rev.filter(v=>v!=null),...revPrev);
    const ceiling=Math.ceil(maximum/4000)*4000;
    return {...shape,...cursor,_demoLedger:true,rev,revPrev,xLabels,visibleXIdx,total,
      yTicks:[0,.25,.5,.75,1].map(n=>Math.round(n*ceiling)),
      legendPrimary:shape.legendPrimary.split(' · ')[0]+' · '+__state.frInt(total)+' MAD',
      legendCompare:shape.legendCompare.split(' · ')[0]+' · '+__state.frInt(days>1?sum(revPrev.map(amount=>({amount}))):revPrev.at(-1))+' MAD'};
  }

function demoPreviousAt(sim) {
    const dr=window.KiwiDayReport, clock=window.KiwiDemoClock;
    if (sim && dr && clock?.getDaySales) {
      const day=dr.shiftDay(dr.today(),-1), bounds=dr.dayBounds(day);
      const before=bounds.from+sim.fraction*(bounds.to-bounds.from);
      return clock.getDaySales(day).filter(r=>r.ts<=before).reduce((s,r)=>s+Math.round(r.amount*100),0)/100;
    }
    const series = vData(__state.revChartByVenue, __state.currentRange)?.revPrev;
    if (!sim || !series?.length) return null;
    const index = Math.min(series.length - 1, Math.max(0, sim.simIdx));
    const next = Math.min(series.length - 1, index + 1);
    return series[index] + (series[next] - series[index]) * sim.simWithin;
  }

function demoRole(text, lang) {
    if (!text || lang === 'fr' || (lang !== 'en' && lang !== 'ar')) return text;
    return String(text).split(' · ').map((part) => {
      const hit = __state.DEMO_ROLE[part]; if (hit) return hit[lang];
      let m;
      if ((m = /^(\d+) jours?( de service)?$/.exec(part))) return lang === 'en' ? `${m[1]} days` : `${m[1]} أيام`;
      if ((m = /^pause depuis (\d\d:\d\d)$/.exec(part))) return lang === 'en' ? `on break since ${m[1]}` : `في استراحة منذ ${m[1]}`;
      if ((m = /^fini(?: son service)? (\d\d:\d\d)$/.exec(part))) return lang === 'en' ? `shift ended ${m[1]}` : `انتهت ورديته ${m[1]}`;
      return part;
    }).join(' · ');
  }

function setDateRange(id) {
    if (!__state.VALID.includes(id)) id = __state.DEFAULT_RANGE;
    // 'personnalise' is only meaningful with a date pair behind it.
    if (id === 'personnalise' && !__state.customRange) id = __state.DEFAULT_RANGE;
    __state.currentRange = id;
    try { localStorage.setItem(__state.STORAGE_KEY, id); } catch (_) {}
    __state.renderSelector();
    __state.subscribers.forEach(fn => { try { fn(id); } catch (_) {} });
  }

function commitCustomRange(start, end) {
    if (!start || !end) return;
    __state.customRange = start <= end ? { start, end } : { start: end, end: start };
    try {
      localStorage.setItem(__state.CUSTOM_KEY,
        __state.dateToIso(__state.customRange.start) + '|' + __state.dateToIso(__state.customRange.end));
    } catch (_) {}
    setDateRange('personnalise');
  }

function setShowComparison(v) {
    __state.showComparison = !!v;
    try { localStorage.setItem(__state.CMP_KEY, __state.showComparison ? '1' : '0'); } catch (_) {}
    const btn = document.querySelector('[data-rev-compare-btn]');
    if (btn) {
      btn.classList.toggle('on', __state.showComparison);
      btn.setAttribute('aria-pressed', String(__state.showComparison));
    }
    __state.renderRevChart();
  }

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

function revealDayPill(pill) {
    const track = pill.parentElement;
    if (!track) return;
    const p = pill.getBoundingClientRect(), r = track.getBoundingClientRect();
    const delta = p.left < r.left ? p.left - r.left : p.right > r.right ? p.right - r.right : 0;
    // Only this horizontal track moves. scrollIntoView also pulled the entire
    // page vertically on each live re-render, sometimes during a user's swipe.
    if (delta) track.scrollBy({left: delta, behavior: 'instant'});
  }

function merchantTimeZone(slug) {
    try {
      const R = window.KiwiDayReport;
      if (R?.timezone) return R.timezone(slug);
    } catch (_) {}
    try {
      const vd = window.KiwiVenue?.getCurrentVenueData?.();
      const zone = vd?.timezone || vd?.timeZone || vd?.tz || window.KiwiConfig?.timezone || window.KiwiConfig?.timeZone;
      if (zone) { new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: zone }).format(); return zone; }
    } catch (_) {}
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || __state.DEFAULT_MERCHANT_TZ; } catch (_) { return __state.DEFAULT_MERCHANT_TZ; }
  }

function merchantParts(ts, slug) {
    const f = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', {
      timeZone: merchantTimeZone(slug), year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    const out = {};
    f.formatToParts(new Date(ts)).forEach(p => { if (p.type !== 'literal') out[p.type] = p.value; });
    return out;
  }

function merchantBoundary(day, hour, slug) {
    const zone = merchantTimeZone(slug);
    const target = Date.parse(String(day) + 'T00:00:00Z') + hour * 3600000;
    let guess = target;
    for (let i = 0; i < 6; i++) {
      const p = merchantParts(guess, slug);
      const observed = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
      if (observed === target) return guess;
      guess += target - observed;
    }
    return guess;
  }

function merchantDayKey(ts, slug) {
    try {
      const R = window.KiwiDayReport;
      if (R?.businessDay) return R.businessDay(ts, slug);
    } catch (_) {}
    const p = merchantParts(ts, slug);
    const day = `${p.year}-${p.month}-${p.day}`;
    return +p.hour < __state.dayCutoffH(slug) ? __state.addMerchantDays(day, -1) : day;
  }

function calendarStartKey(dayKey, unit, back) {
    let y = +dayKey.slice(0, 4), m = +dayKey.slice(5, 7) - 1;
    if (unit === 'year') { y -= back; m = 0; }
    else {
      m = (unit === 'quarter' ? Math.floor(m / 3) * 3 : m) - (unit === 'quarter' ? 3 : 1) * back;
      while (m < 0) { m += 12; y--; }
      while (m > 11) { m -= 12; y++; }
    }
    return y + '-' + String(m + 1).padStart(2, '0') + '-01';
  }

function calendarBounds(range, back) {
    const unit = range === 'moisDernier' ? 'month' : range === 'trimestre' ? 'quarter' : range === 'annee' ? 'year' : '';
    if (!unit) return null;
    const slug = __state.activeMerchantSlug();
    const todayDay = merchantDayKey(Date.now(), slug);
    const shift = (range === 'moisDernier' ? 1 : 0) + (back || 0);
    const from = __state.merchantDayBounds(calendarStartKey(todayDay, unit, shift), slug).from;
    if (range !== 'moisDernier' && !back) return [from, Infinity];
    return [from, __state.merchantDayBounds(calendarStartKey(todayDay, unit, shift - 1), slug).from];
  }

function rangeBounds(range) {
    /* A merchant-picked range is exact. Demo tables may use a presentation
     * bucket, but live ledgers must never turn "3–5 August" into "last 7
     * days" while keeping the precise dates on screen. */
    if ((range === 'personnalise' || (range == null && __state.currentRange === 'personnalise')) && __state.customRange) {
      const slug = __state.activeMerchantSlug();
      const start = __state.merchantDayBounds(__state.dateToIso(__state.customRange.start), slug).from;
      const end = __state.merchantDayBounds(__state.dateToIso(__state.customRange.end), slug).to;
      return [start, end];
    }
    const slug = __state.activeMerchantSlug();
    const todayDay = merchantDayKey(Date.now(), slug);
    const today = __state.merchantDayBounds(todayDay, slug).from;
    if (range === 'aujourdhui') return [today, Infinity];
    if (range === 'hier') {
      const yesterday = __state.merchantDayBounds(__state.addMerchantDays(todayDay, -1), slug);
      return [yesterday.from, yesterday.to];
    }
    const calendar = calendarBounds(range, 0);
    if (calendar) return calendar;
    const days = __state.RANGE_DAYS[range] || 1;
    return [__state.merchantDayBounds(__state.addMerchantDays(todayDay, -(days - 1)), slug).from, Infinity];
  }

function realInsightSummary(range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const rows = __state.realSalesList().filter((e) => {
      const ts = +e.ts || 0;
      return ts >= from && ts < to;
    });
    let revenue = 0, gross = 0, refunds = 0, collected = 0, receivable = 0;
    const byHour = window.KiwiSalesMath.hoursFromSales(rows, from, to, __state.saleHour), byTender = {};
    rows.forEach((e) => {
      const amount = Math.max(0, +e.amount || 0);
      revenue += amount; gross += amount;
      const tender = __state.tenderBucket(e && e.method);
      if (tender && amount) {
        __state.tenderAmounts(e).forEach(part => {
          if (part.key) byTender[part.key] = (byTender[part.key] || 0) + part.amount;
        });
        collected += amount;
      } else if (__state.salesMath().RECEIVABLE_METHODS.includes(String(e && e.method || '').trim().toLowerCase())) {
        receivable += amount;
      }
    });
    __state.realRefundList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amount = Math.abs(+e.amount || 0);
      revenue -= Math.abs(+e.amount || 0); refunds += amount;
      const hour = __state.saleHour(ts);
      byHour[hour] = (byHour[hour] || 0) - amount;
      const tender = __state.tenderBucket(e && e.method);
      if (tender) { byTender[tender] = (byTender[tender] || 0) - amount; collected -= amount; }
      else if (__state.salesMath().RECEIVABLE_METHODS.includes(String(e && e.method || '').trim().toLowerCase())) receivable -= amount;
    });
    receivable += __state.deliveryDue(from, to);
    const topKey = (obj) => Object.keys(obj).reduce((best, key) =>
      best == null || obj[key] > obj[best] ? key : best, null);
    const peakHour = topKey(byHour);
    const topTender = topKey(byTender);
    return {
      from, to, count: rows.length, revenue, gross, refunds, collected, receivable,
      basket: rows.length ? revenue / rows.length : 0,
      peakHour: peakHour == null ? null : +peakHour,
      peakRevenue: peakHour == null ? 0 : byHour[peakHour],
      activeHours: Object.keys(byHour).length,
      topTender,
      tenderAmount: topTender == null ? 0 : byTender[topTender],
      collected,
    };
  }

function buildRealHeroRec() {
    const s = realInsightSummary();
    if (!s.count || !s.revenue) return null;
    const lang = __state.getLang();
    const today = __state.currentRange === 'aujourdhui';
    const num = (n) => __state.frInt(Math.round(n));
    const tender = s.topTender && s.collected ? Math.round((s.tenderAmount / s.collected) * 100) : null;
    const tenderName = s.topTender ? (__state.TENDER_NAME[lang] || __state.TENDER_NAME.fr)[s.topTender] : '';
    const peakFr = s.peakHour == null ? '' : ` Votre meilleure heure : ${s.peakHour}h.`;
    const payFr = tender == null ? '' : ` ${tender} % des encaissements identifiés sont en ${tenderName}.`;
    const peakEn = s.peakHour == null ? '' : ` Your best hour: ${s.peakHour}:00.`;
    const payEn = tender == null ? '' : ` ${tender}% of identified payments are ${tenderName}.`;
    const peakAr = s.peakHour == null ? '' : ` أفضل ساعة: ${s.peakHour}.`;
    const payAr = tender == null ? '' : ` ${tender}٪ من المدفوعات المحددة عبر ${tenderName}.`;
    const W = {
      fr: { title: today ? 'Votre journée en cours' : 'La période sélectionnée', obs: `${s.count} vente${s.count > 1 ? 's' : ''} ${today ? "aujourd'hui" : 'sur la période'} pour ${num(s.revenue)} MAD, panier moyen ${num(s.basket)} MAD.${peakFr}${payFr}`, act: '→ Calculé à partir des ventes affichées sur cette période.', basisLabel: 'mesuré' },
      en: { title: today ? 'Your day so far' : 'Selected period', obs: `${s.count} sale${s.count > 1 ? 's' : ''} ${today ? 'today' : 'in this period'} for ${num(s.revenue)} MAD, average basket ${num(s.basket)} MAD.${peakEn}${payEn}`, act: '→ Calculated from the sales shown for this period.', basisLabel: 'measured' },
      ar: { title: today ? 'يومك حتى الآن' : 'الفترة المحددة', obs: `${s.count} عملية بيع ${today ? 'اليوم' : 'خلال هذه الفترة'} بقيمة ${num(s.revenue)} درهم، ومتوسط السلة ${num(s.basket)} درهم.${peakAr}${payAr}`, act: '← محسوب من المبيعات المعروضة لهذه الفترة.', basisLabel: 'مقاس' },
    };
    return W[lang] || W.fr;
  }

function buildRealHeatmapRec() {
    const s = realInsightSummary();
    if (!s.count || !s.revenue || s.peakHour == null) return null;
    const lang = __state.getLang();
    const share = Math.round((s.peakRevenue / s.revenue) * 100);
    const num = (n) => __state.frInt(Math.round(n));
    const W = {
      fr: { title: `Votre pic : ${s.peakHour}h`, obs: `${num(s.peakRevenue)} MAD de ventes nettes à ${s.peakHour}h, soit ${share} % de la période, réparties sur ${s.activeHours} heure${s.activeHours > 1 ? 's' : ''} d’activité.`, cta: '' },
      en: { title: `Your peak: ${s.peakHour}:00`, obs: `${num(s.peakRevenue)} MAD in net sales at ${s.peakHour}:00, ${share}% of the period across ${s.activeHours} active hour${s.activeHours > 1 ? 's' : ''}.`, cta: '' },
      ar: { title: `ذروتك: ${s.peakHour}`, obs: `${num(s.peakRevenue)} درهم من صافي المبيعات عند الساعة ${s.peakHour}، أي ${share}٪ من الفترة موزعة على ${s.activeHours} ساعة نشاط.`, cta: '' },
    };
    return W[lang] || W.fr;
  }

function screenBook() {
    try {
      const KV = window.KiwiVenue;
      if (!KV || !KV.isCustom || !KV.isCustom() || !KV.getCurrentVenueData) return '';
      const vd = KV.getCurrentVenueData();
      if (!vd) return '';
      if (vd.slug) return String(vd.slug);
      return String(vd.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    } catch (_) { return ''; }
  }

function realClosedTips(range) {
    const DR = window.KiwiDayReport;
    if (!DR || typeof DR.list !== 'function') return null;
    const book = screenBook();
    if (!book) return null;
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const slug = __state.activeMerchantSlug();
    const coverage = window.KiwiSalesReconcile?.coverage();
    const first = merchantDayKey(from + 1, slug);
    const last = to === Infinity ? merchantDayKey(Date.now(), slug) : merchantDayKey(to - 1, slug);
    let sum = 0, days = 0;
    let reports = [];
    try { reports = DR.list(book) || []; } catch (_) { return null; }
    const closed = new Set();
    reports.forEach((r) => {
      if (!r || !r.closed || !r.day || r.day < first || r.day > last) return;
      const t = Number(r.tips);
      days++; closed.add(r.day);
      if (Number.isFinite(t) && t > 0) sum += t;
    });
    const live = new Set();
    let sales = [];
    try { sales = typeof __state.realSalesList === 'function' ? __state.realSalesList() : []; } catch (_) { sales = []; }
    (sales || []).forEach((e) => {
      const cents = Math.round(Number(e && e.tipCents));
      if (!(cents > 0)) return;
      const ts = +e.ts || 0;
      if (ts < from || ts >= to || (coverage != null && ts < coverage)) return;
      const day = merchantDayKey(ts, slug);
      if (closed.has(day)) return;
      live.add(day);
      sum += cents / 100;
    });
    const old = window.KiwiSalesHistory?.oldTips(from, to, closed);
    if (old?.partial) return { partial: true };
    sum += old?.sum || 0; days += old?.days || 0;
    days += live.size;
    return { sum: Math.round(sum * 100) / 100, days, liveDays: live.size };
  }

function realClientMix(from, to) {
    const KC = window.KiwiClients;
    const book = screenBook();
    let list = [];
    try { list = (book && KC && typeof KC.list === 'function' && KC.list(book)) || []; } catch (_) { list = []; }
    let visitors = 0, regulars = 0;
    list.forEach((c) => {
      const stamps = (Array.isArray(c && c.history) ? c.history : [])
        .map((h) => Number(h && h.ts)).filter((t) => Number.isFinite(t) && t > 0);
      if (!stamps.some((t) => t >= from && t < to)) return;
      visitors++;
      if (stamps.some((t) => t < from) || Number(c.visits || 0) > stamps.length) regulars++;
    });
    return { visitors, regulars, newcomers: visitors - regulars };
  }

function openDays(range) {
    const [from, to] = __state.closedBounds(range);
    const slug = __state.activeMerchantSlug();
    const days = new Set();
    __state.realSalesList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts >= from && ts < to) days.add(merchantDayKey(ts, slug));
    });
    return Math.max(1, days.size);
  }

function realDeltaPct(range, pick, backDays, stats = __state.realWindowStats) {
    const [from, to] = __state.closedBounds(range);
    const startDay = merchantDayKey(from + 1, __state.activeMerchantSlug());
    const endDay = merchantDayKey(to - 1, __state.activeMerchantSlug());
    const spanDays = Math.max(1, Math.round((Date.parse(endDay + 'T00:00:00Z') - Date.parse(startDay + 'T00:00:00Z')) / 864e5) + 1);
    /* « vs mois préc. », « vs trimestre préc. », « vs année préc. » : la période
       du calendrier d'avant, pas les N jours qui précèdent. */
    const calendarBase = backDays ? null : calendarBounds(range == null ? __state.currentRange : range, 1);
    const baseBounds = calendarBase || __state.shiftedBusinessBounds(from, to, backDays || spanDays);
    /* The promise above, kept. shiftedBusinessBounds returns WHOLE business
       days, so a live range (« Aujourd'hui », « 7 jours » ending now) was
       weighed against complete days: at 11h42, six hours of trading against
       all of yesterday, and every morning tile read −80 % to −100 %. A live
       window's baseline stops at the same point of its own day. */
    if (rangeBounds(range == null ? __state.currentRange : range)[1] === Infinity) {
      baseBounds[1] = Math.min(baseBounds[1], baseBounds[0] + (to - from));
    }
    const base = pick(stats(baseBounds[0], baseBounds[1]));
    if (!base) return null;
    const cur = pick(stats(from, to));
    return deltaTenths(cur, base);
  }

function deltaTenths(cur, base) {
    const c = Math.round(cur * 100), b = Math.round(base * 100);
    const onCents = (v, k) => Math.abs(v * 100 - k) <= 1e-6 * Math.max(1, Math.abs(k));
    const num = (c - b) * 1000;
    if (b && onCents(cur, c) && onCents(base, b) && Number.isSafeInteger(2 * num + 2 * Math.abs(b))) {
      return __state.halfUpDiv(num, b) / 10;
    }
    return Math.round(((cur - base) / base) * 1000) / 10;
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

function operatorLedgerPending() {
    if (!/[?&]op=1(?:&|$)/.test(location.search)) return false;
    const live = window.KiwiLive;
    const state = live?.snapshotStatus?.();
    const requested = new URLSearchParams(location.search).get('merchant');
    const venue = window.KiwiVenue?.getCurrentVenueData?.();
    return !state || state.phase !== 'complete' || (requested && state.merchant !== requested) ||
      !venue || (venue.slug && venue.slug !== state.merchant) ||
      !state.venue || state.venue !== window.KiwiVenue?.getVenue?.();
  }

function buildHeatmap(rng) {
    const v = __state.getCurrentVenue();
    /* A real merchant's peak hours come from their OWN tickets: every sale
     * carries a `ts`, so bucket the active window by hour of day. Before the
     * first sale this still draws flat — the honest answer — but it no longer
     * STAYS flat once the till has rung, which is the one thing a merchant
     * opens this card to find out. Never borrows Café Atlas's shape. */
    if (__state.ownData(v)) {
      const [from, to] = __state.closedBounds(rng);
      const span = __state.HH_HOURS.length;                          // 16 créneaux, la largeur de la carte
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
      __state.realSalesList().forEach((e) => {
        const ts = +e.ts || 0;
        if (ts < from || ts >= to) return;
        const h = __state.saleHour(ts);
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
        hour: h, revenue: rev[i], covers: cov[i], unit: 'orders', intensity: max ? rev[i] / max : 0,
      }));
    }
    // Demo fixtures only carry base ranges; mapping is confined to that path.
    rng = ({ personnalise: 'aujourdhui', moisDernier: 'trenteJours', trimestre: 'trenteJours', annee: 'trenteJours' })[rng] || rng;
    const rev = __state.HH_RAW_BY_VENUE[v]?.[rng] || __state.HH_RAW_BY_VENUE.cafeAtlas[rng]
      || __state.HH_RAW_BY_VENUE.cafeAtlas.trenteJours || __state.HH_RAW_BY_VENUE.cafeAtlas.aujourdhui;
    const cov = __state.HH_COVERS_BY_VENUE[v]?.[rng] || __state.HH_COVERS_BY_VENUE.cafeAtlas[rng]
      || __state.HH_COVERS_BY_VENUE.cafeAtlas.trenteJours || __state.HH_COVERS_BY_VENUE.cafeAtlas.aujourdhui;
    const max = Math.max(...rev);
    return __state.HH_HOURS.map((h, i) => ({
      hour: h, revenue: rev[i], covers: cov[i],
      intensity: max ? rev[i] / max : 0,
    }));
  }

function hotelPerfEntry(w) {
    const merchant = __state.hotelMerchant();
    const key = merchant + '|' + w.from + '|' + w.to;
    let e = __state.hotelPerf.get(key);
    if (!e) { e = { data: null, error: '', ts: 0, loading: false }; __state.hotelPerf.set(key, e); }
    if (merchant && !e.loading && Date.now() - e.ts > __state.HOTEL_PERF_TTL) {
      e.loading = true;
      fetch('/api/hotel/performance?' + new URLSearchParams({ merchant, from: w.from, to: w.to }), { cache: 'no-store', credentials: 'same-origin' })
        .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
        .then(({ ok, b }) => {
          const next = ok && b && b.ok ? b : null;
          const before = JSON.stringify([e.data, e.error]);
          e.data = next; e.error = next ? '' : String((b && b.error) || 'unavailable');
          e.changed = before !== JSON.stringify([e.data, e.error]);
        })
        .catch(() => { if (!e.data) { e.error = 'unavailable'; e.changed = true; } })
        .finally(() => {
          e.loading = false; e.ts = Date.now();
          /* Repeindre seulement si quelque chose a bougé : le rafraîchissement
           * périodique ne doit pas rejouer l'animation des tuiles pour rien. */
          if (e.changed) { e.changed = false; try { __state.renderKpiBand(); } catch (_) {} }
        });
    }
    return e;
  }

function hotelTilesFrom(cur, prev, clean) {
    const dash = { text: '·', unit: '', delta: null };
    const wait = { text: '…', unit: '', delta: null };
    const pd = prev && prev.data;
    let out;
    if (cur && cur.data) {
      const d = cur.data;
      const num = (v, unit, fmt, prevV) => (v == null ? { ...dash } : { value: v, unit, fmt, delta: __state.hotelDelta(v, prevV) });
      out = {
        occupation: num(d.occupancyPct, '%', 'pct1', pd && pd.occupancyPct),
        adr: num(d.adr, 'MAD', 'int', pd && pd.adr),
        revpar: num(d.revpar, 'MAD', 'int', pd && pd.revpar),
        /* Mouvements de la période : une arrivée attendue compte. Aucun
         * dossier = « 0 / 0 » est ici une mesure (il n'y a pas de mouvement). */
        arrdep: { text: `${d.arrivals} / ${d.departures}`, unit: '', delta: null },
      };
    } else {
      const blank = cur && cur.error ? dash : wait;
      out = { occupation: { ...blank }, adr: { ...blank }, revpar: { ...blank }, arrdep: { ...blank } };
    }
    out.menage = clean && clean.total > 0
      ? { value: clean.toClean, unit: `/ ${clean.total}`, fmt: 'int', delta: null }
      : { ...(clean && clean.loading ? wait : dash) };
    /* « Mix revenu · ch · resto · spa » : aucune source n'attribue encore le
     * revenu par point de vente. */
    out.mixRev = { ...dash };
    return out;
  }

function tableTimeEntry(from, to) {
    const merchant = __state.hotelMerchant();
    const key = merchant + '|' + from + '|' + to;
    let e = __state.tableTime.get(key);
    if (!e) { e = { data: null, error: '', ts: 0, loading: false }; __state.tableTime.set(key, e); }
    if (merchant && !e.loading && Date.now() - e.ts > __state.TABLE_TIME_TTL) {
      e.loading = true;
      fetch('/api/table-time?' + new URLSearchParams({ merchant, from: String(from), to: String(to) }), { cache: 'no-store', credentials: 'same-origin' })
        .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
        .then(({ ok, b }) => {
          const next = ok && b && b.ok ? { visits: +b.visits || 0, avgMin: b.avgMin == null ? null : +b.avgMin } : null;
          const before = JSON.stringify([e.data, e.error]);
          e.data = next; e.error = next ? '' : String((b && b.error) || 'unavailable');
          e.changed = before !== JSON.stringify([e.data, e.error]);
        })
        .catch(() => { if (!e.data) { e.error = 'unavailable'; e.changed = true; } })
        .finally(() => {
          e.loading = false; e.ts = Date.now();
          if (e.changed) { e.changed = false; try { __state.renderKpiBand(); } catch (_) {} }
        });
    }
    return e;
  }

function openKpiCustomizer() {
    const Kiwi = window.Kiwi;
    if (!Kiwi || !Kiwi.drawer) return;
    const lang = __state.getLang();
    const kc = __state.KC_STR[lang] || __state.KC_STR.fr;
    const venueType = window.KiwiVenue?.getVenueType?.() || 'restaurant';
    /* Les tuiles du sélecteur montrent les chiffres de la bande : un vrai
     * commerçant voyait ici « Café Atlas » (le tableau de démo) en choisissant
     * ses indicateurs. */
    if (!(__state.lastBand && __state.lastBand.range === __state.currentRange)) { try { __state.renderKpiBand(); } catch (_) {} }
    const data = (__state.lastBand && __state.lastBand.range === __state.currentRange && __state.lastBand.data)
      || (__state.ownData() ? {} : vData(__state.kpiByVenue, __state.currentRange)) || {};
    const ctx = { venueType, range: __state.effRange(), nbDays: (__state.ownData() && window.KiwiSales) ? openDays(__state.effRange()) : (__state.RANGE_DAYS[__state.effRange()] || 1) };

    // Only offer KPIs that actually resolve for this venue + range.
    const available = Object.keys(__state.KPI_CATALOG).filter((k) => {
      try { return !!__state.KPI_CATALOG[k].derive(data, ctx); } catch (_) { return false; }
    });
    const maxKpis = __state.KPI_MAX;
    let selected = (__state.getKpiLayout(venueType) || __state.defaultKpiKeys(venueType))
      .filter((k) => available.includes(k)).slice(0, maxKpis);

    const deltaSuffix = __state.KPI_DELTA_SUFFIX[lang]?.[__state.currentRange] || __state.KPI_DELTA_SUFFIX.fr[__state.currentRange];
    // Each picker tile is a faithful preview of the dashboard KPI card —
    // label + icon, the period value, its delta and a sparkline.
    const cardHtml = (k) => {
      const c = __state.KPI_CATALOG[k];
      const iconName = __state.KPI_MATERIAL_ICONS[k] || 'credit-card';
      const sparkPath = __state.KPI_SPARKS[k] || __state.KPI_SPARKS.tx;
      let tile = null;
      try { tile = c.derive(data, ctx); } catch (_) { tile = null; }
      tile = tile || { value: 0, delta: 0 };
      const valHtml = tile.text != null ? __state.fmtKpiVal(tile, 0) : __state.fmtKpiVal(tile, tile.value || 0);
      const dv = tile.delta || 0;
      const dCls = dv < 0 ? ' dn' : dv === 0 ? ' neutral' : '';
      return `
        <button class="kpi-pick" data-kc="${k}" type="button" aria-pressed="false">
          <span class="kc-badge"></span>
          <span class="l"><span>${__state.kpiLabel(k, venueType, lang)}</span><span class="ico"><i data-lucide="${iconName}" style="width:13px;height:13px" aria-hidden="true"></i></span></span>
          <span class="v">${valHtml}</span>
          <span class="d${dCls}">${__state.arrowSvg(dv >= 0)}${__state.fmtPct(dv)} ${deltaSuffix}</span>
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
             <button data-activation=write class="kb atlas" data-kc-save type="button" style="flex:1; justify-content:center;">${kc.save}</button>`,
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
        __state.saveKpiLayout(venueType, selected);
        res.close();
        __state.renderKpiBand();
        Kiwi.toast?.(kc.savedT, { type: 'success', desc: kc.savedD });
        return;
      }
      if (e.target.closest('[data-kc-reset]')) {
        __state.resetKpiLayout(venueType);
        res.close();
        __state.renderKpiBand();
        Kiwi.toast?.(kc.resetT, { type: 'info', desc: kc.resetD });
        return;
      }
    });
    refresh();
  }

function realMixRows(lang, range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const by = {};
    let total = 0;
    __state.realSalesList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.max(0, +e.amount || 0);
      if (!amt) return;
      const k = __state.tenderBucket(e && e.method);
      if (!k) return; // crédit client / créance livraison ≠ argent encaissé
      __state.tenderAmounts(e).forEach(part => {
        if (part.key) by[part.key] = (by[part.key] || 0) + part.amount;
      });
      total += amt;
    });
    /* The ring says « MAD encaissé »: money kept, after refunds, the way the
     * till's « Moyens de paiement · net » and the day report count it. It used
     * to add sales only, so a day with a 20,40 card refund read 425 here and
     * 404,10 everywhere else, on the same screen as the 404,10 band. A refund
     * goes back on the tender it was paid with (realWindowStats does the same
     * for the card/cash tile). */
    __state.realRefundList().forEach((e) => {
      const ts = +e.ts || 0;
      if (ts < from || ts >= to) return;
      const amt = Math.abs(+e.amount || 0);
      const k = __state.tenderBucket(e && e.method);
      if (!amt || !k) return;
      by[k] = (by[k] || 0) - amt;
      total -= amt;
    });
    total = Math.round(total * 100) / 100;
    const kept = __state.REAL_MIX.filter((m) => by[m.key] > 0.004);
    const keptSum = kept.reduce((s, m) => s + by[m.key], 0);
    if (!(total > 0) || !keptSum) return { rows: [], total: 0, cardTotal: 0 };
    return {
      total,
      rows: kept.map((m) => ({
        color: m.color, label: m[lang] || m.fr, pct: (by[m.key] / keptSum) * 100,
      })),
    };
  }

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

    const fmt = (n) => (window.KiwiNumber?.format(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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

function buildLiveFeed(venue) {
    const rows = window.KiwiDemoClock?.getDaySales?.() || [];
    const fmt = n => (window.KiwiNumber?.format(n, {minimumFractionDigits:2, maximumFractionDigits:2}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}));
    return rows.slice(-10).reverse().map((sale, slot) => ({
      method:sale.method === 'card' ? 'visa' : sale.method === 'wallet' ? 'qr' : 'cash',
      primary:sale.method === 'card' ? 'Visa' : sale.method === 'wallet' ? 'Kiwi Wallet QR' : ({en:'Cash',ar:'نقداً'}[(window.KiwiI18n?.getLang?.() || 'fr')] || 'Espèces'),
      sub:'', flag:'ma', customer:sale.customer, table:sale.table,
      ctx:sale.customer + ' · T' + sale.table,
      amt:fmt(sale.amount), amtRaw:sale.amount, neg:false, receiptNo:sale.ref,
      server:sale.staff, covers:1, serviceMinutes:0,
      items:sale.lines.map(line => ({n:line.name, name:line.name, q:line.qty, qty:line.qty, p:line.price, price:line.price, total:line.total})),
      subtotal:fmt(sale.amount), tva:fmt(0), tvaRate:0, total:fmt(sale.amount),
      t:new Date(sale.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:(globalThis.KiwiZoneLaw?.effectiveZone(window.KiwiDayReport?.timezone?.(), sale.ts) || window.KiwiDayReport?.timezone?.())}), isNew:slot===0
    }));
  }

function buildCustomFeed(venue) {
    /* Bornées à la MÊME période que le sous-titre affiché juste au-dessus.
     * Ce `.slice(-8)` prenait les huit dernières ventes de tout l'historique,
     * pendant que le sous-titre, lui, comptait « N commandes aujourd'hui » sur
     * la seule journée. Un commerçant qui n'avait encore rien vendu ce matin
     * lisait donc « 0 commande aujourd'hui » posé sur trois tickets d'hier — et
     * comme les lignes ne portent que l'heure, rien ne trahissait leur date. Le
     * titre du panneau rendait la chose pire : ces ventes-là n'étaient ni en
     * direct, ni du jour. */
    const [lo, hi] = rangeBounds(__state.currentRange);
    const sales = (window.KiwiSales?.list?.(venue) || []).concat(
      (window.KiwiRefunds?.list?.(venue) || []).map((r) => ({ ...r, amount: -Math.abs(+r.amount || 0), kind: 'refund' }))
    )
      .filter((s) => { const ts = +(s && s.ts) || 0; return ts >= lo && ts < hi; })
      .sort((a, b) => (+a.ts || 0) - (+b.ts || 0)).slice(-8).reverse();
    const lang = __state.getLang();
    /* Every method the till can actually record (see live-link METHOD_LABEL).
     * `cash` was missing, so `L[s.method] || L.card` relabelled EVERY cash sale
     * as "Carte bancaire" — on a Moroccan boutique dashboard, where cash is the
     * dominant tender, the owner could not tell cash from card on their own
     * feed. */
    const ML = {
      fr: { cash: 'Espèces', card: 'Carte bancaire', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'Lien de paiement', transfer: 'Virement / Versement', cheque: 'Chèque', split: 'Paiement partagé', credit: 'Crédit client', delivery: 'Livraison · à recevoir', sub: 'Vente encaissée', deliverySub: 'Vente enregistrée · non encaissée' },
      en: { cash: 'Cash', card: 'Bank card', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'Payment link', transfer: 'Bank transfer', cheque: 'Cheque', split: 'Split payment', credit: 'Customer credit', delivery: 'Delivery · receivable', sub: 'Sale recorded', deliverySub: 'Sale recorded · unpaid' },
      ar: { cash: 'نقدًا', card: 'بطاقة بنكية', tap: 'Kiwi Tap', qr: 'QR Kiwi Wallet', wallet: 'Kiwi Wallet', link: 'رابط الدفع', transfer: 'تحويل بنكي', cheque: 'شيك', split: 'دفع مقسّم', credit: 'دين العميل', delivery: 'توصيل · مبلغ مستحق', sub: 'عملية بيع مسجّلة', deliverySub: 'بيع مسجّل · غير محصّل' },
    };
    /* Chip art per method. The till records the TENDER, never the card network,
     * so a card sale gets the neutral card chip — printing a Visa or Mastercard
     * mark here would invent a fact the sale does not carry. */
    const ICON_FOR = { cash: 'cash', card: 'cmi', tap: 'tap', qr: 'qr', wallet: 'qr', link: 'qr', transfer: 'qr', cheque: 'qr', split: 'cmi', credit: 'qr', delivery: 'qr' };
    const L = ML[lang] || ML.fr;
    return sales.map((s, i) => {
      const d = new Date(s.ts);
      const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const isRefund = s.kind === 'refund' || Number(s.amount) < 0;
      return {
        t,
        method: ICON_FOR[s.method] || 'cmi',
        primary: isRefund ? (lang === 'en' ? 'Refund' : lang === 'ar' ? 'استرداد' : 'Remboursement') : (L[s.method] || L.card),
        /* The "who/what" column. On a boutique the useful identifier is the item,
         * which the sale now carries — a row reading "Chemise en lin" is what the
         * owner needs to find the original sale when that customer returns. Falls
         * back to the generic subtitle only when the till sent no label. */
        sub: isRefund ? (s.ref || '') : ((s.method === 'delivery' || s.method === 'credit') ? L.deliverySub : L.sub), flag: '', ctx: s.label || '',
        // Amount ONLY — the row template appends its own <span class="cur">MAD</span>,
        // so spelling the unit here too printed "450,00 MADMAD" on every real sale.
        amt: (isRefund ? '− ' : '') + (window.KiwiNumber?.number(Math.abs(s.amount || 0), 2) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(s.amount || 0))),
        tip: '·', neg: isRefund, isNew: i === 0,
        saleId: String(s.id || ''),
        ref: String(s.ref || s.receiptRef || s.id || '').trim(),
        receiptNo: String(s.ref || s.receiptRef || '').trim(),
      };
    });
  }

function realLowStock() {
    try {
      const type = window.KiwiVenue?.getVenueType?.();
      if (type === 'restaurant' && window.KiwiRestaurantStock?.items) {
        const items = window.KiwiRestaurantStock.items() || [];
        if (!items.length) return null;
        const configured = items.filter((it) => Number(it.reorderLevel) > 0);
        const rows = configured.map((it) => {
          const stock = Number(it.currentStock) || 0; // Montrer aussi le déficit réel.
          const threshold = Math.max(0, Number(it.reorderLevel) || 0);
          const par = Math.max(threshold, Number(it.parLevel) || threshold);
          const suggested = Math.max(0, Math.round((par * 1.2 - stock) * 10) / 10);
          return { id: it.id, name: it.name, stock, threshold, par, suggested,
            unit: it.unit || 'unité', cost: Math.max(0, Number(it.costPerUnit) || 0) };
        }).filter((r) => r.stock < r.threshold)
          .sort((a, b) => (a.stock / a.threshold) - (b.stock / b.threshold))
          .slice(0, 5);
        return { rows, tracked: items.length, configured: configured.length, source: 'restaurant' };
      }
      if (type === 'boutique') {
        const cat = window.KiwiBoutiqueCatalog;
        if (!cat) return null;
        const key = window.KiwiBoutiqueVenueKey && window.KiwiBoutiqueVenueKey();
        if (key) cat.use(key);
        const prods = cat.listProducts() || [];
        if (!prods.length) return null;
        const rows = prods.map((p) => ({ id: p.id, name: p.name, stock: cat.productStock(p.id), threshold: __state.LOW_STOCK_SEUIL }))
          .filter((r) => r.stock <= __state.LOW_STOCK_SEUIL).sort((a, b) => a.stock - b.stock).slice(0, 5);
        return { rows, tracked: prods.length, configured: prods.length, source: 'boutique' };
      }
    } catch (_) { return null; }
    return null;
  }

function realTopProducts(range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const sales = __state.realSalesList().filter((e) => (+e.ts || 0) >= from && (+e.ts || 0) < to);
    const by = new Map(); let covered = 0;
    sales.forEach((sale) => {
      const lines = Array.isArray(sale.lines) ? sale.lines.filter((l) => l && l.name && (+l.qty || 0) > 0) : [];
      if (!lines.length) return;
      covered++;
      lines.forEach((line) => {
        const key = String(line.itemId || line.variantId || line.name).trim().toLowerCase();
        const qty = Math.max(0, Number(line.qty) || 0);
        const revenue = Math.max(0, Number(line.total) || ((Number(line.price) || 0) * qty));
        const row = by.get(key) || { name: line.name, qty: 0, revenue: 0 };
        row.qty += qty; row.revenue += revenue; by.set(key, row);
      });
    });
    const rows = [...by.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
    return { rows, sales: sales.length, covered };
  }

function realPairs(range) {
    const [from, to] = rangeBounds(range == null ? __state.currentRange : range);
    const seen = new Map(), names = new Map(), together = new Map();
    let baskets = 0;
    __state.realSalesList().forEach((sale) => {
      const ts = +sale.ts || 0;
      if (ts < from || ts >= to) return;
      const keys = new Set();
      (Array.isArray(sale.lines) ? sale.lines : []).forEach((l) => {
        if (!l || !l.name || !((+l.qty || 0) > 0)) return;
        const k = String(l.itemId || l.variantId || l.name).trim().toLowerCase();
        if (!k || keys.size >= __state.PAIRS_MAX_KEYS) return;
        keys.add(k);
        if (!names.has(k)) names.set(k, String(l.name));
      });
      keys.forEach((k) => seen.set(k, (seen.get(k) || 0) + 1));
      if (keys.size < 2) return;
      baskets++;
      const ks = [...keys].sort();
      for (let i = 0; i < ks.length; i++) {
        for (let j = i + 1; j < ks.length; j++) {
          const pk = ks[i] + '\u0000' + ks[j];
          together.set(pk, (together.get(pk) || 0) + 1);
        }
      }
    });
    if (baskets < __state.PAIRS_MIN_BASKETS) return { rows: [], baskets };
    const rows = [...together].filter(([, n]) => n >= __state.PAIRS_MIN_TOGETHER).map(([pk, n]) => {
      const [x, y] = pk.split('\u0000');
      const lead = (seen.get(x) || 0) <= (seen.get(y) || 0) ? x : y;
      const other = lead === x ? y : x;
      return { lead: names.get(lead), other: names.get(other), together: n, share: n / Math.max(1, seen.get(lead) || 0) };
    }).sort((p, q) => q.together - p.together || q.share - p.share || String(p.lead).localeCompare(String(q.lead))).slice(0, 3);
    return { rows, baskets };
  }

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

function dutyBand(lang, t) {
    const W = window.KiwiTradeWorkspaces, S = window.KiwiTradeSchema;
    if (!W || !S || !W.config || !W.config('duty')) return null;
    const rows = (W.rows('duty') || []).map((r) => ({ r, v: r.values || {} }));
    const now = S.wallNow();
    const cur = rows.filter((x) => (+x.r.status || 0) === 2 || ((+x.r.status || 0) < 3 && String(x.v.startAt || '') <= now && now <= String(x.v.endAt || ''))).sort((a, b) => String(a.v.startAt).localeCompare(String(b.v.startAt)))[0];
    const next = rows.filter((x) => (+x.r.status || 0) < 2 && String(x.v.startAt || '') > now).sort((a, b) => String(a.v.startAt).localeCompare(String(b.v.startAt)))[0];
    const S2 = {
      fr: { on: 'EN GARDE', until: (x) => `jusqu’à ${x}`, since: (x) => `depuis ${x}`, next: 'PROCHAINE GARDE', open: 'Ouvrir Gardes & relève' },
      en: { on: 'ON DUTY', until: (x) => `until ${x}`, since: (x) => `since ${x}`, next: 'NEXT DUTY', open: 'Open Duty & handover' },
      ar: { on: 'في الحراسة', until: (x) => `حتى ${x}`, since: (x) => `منذ ${x}`, next: 'الحراسة القادمة', open: 'فتح الحراسة والتسليم' },
    }[lang] || null;
    const L2 = S2 || { on: 'EN GARDE', until: (x) => `jusqu’à ${x}`, since: (x) => `depuis ${x}`, next: 'PROCHAINE GARDE', open: 'Ouvrir Gardes & relève' };
    const fmt = (k) => { try { return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(String(k).slice(0, 16) + ':00')); } catch (_) { return String(k); } };
    const cta = `<div class="instant" data-action="${__state.BAND_NAV.duty}"><div style="font-weight:500;">${L2.open}</div></div>`;
    const hand = (x) => (x.v.handover ? `<div style="font-size:12px;opacity:.7;margin-top:8px;line-height:1.45;">${__state.escTxt(String(x.v.handover).slice(0, 160))}</div>` : '');
    if (cur) {
      return `<div class="lbl">${L2.on}</div><div class="big" style="font-size:30px;">${__state.escTxt(cur.r.title || '')}</div>` +
        `<div class="sub">${L2.since(__state.escTxt(fmt(cur.v.startAt)))} · ${L2.until(__state.escTxt(fmt(cur.v.endAt)))}</div>${hand(cur)}${cta}`;
    }
    if (next) {
      return `<div class="lbl">${L2.next}</div><div class="big" style="font-size:30px;">${__state.escTxt(fmt(next.v.startAt))}</div>` +
        `<div class="sub">${__state.escTxt(next.r.title || '')} · ${L2.until(__state.escTxt(fmt(next.v.endAt)))}</div>${hand(next)}${cta}`;
    }
    return `<div class="lbl">${t.lbl}</div><div style="padding:28px 4px 8px;text-align:center;">` +
      `<div style="font-size:14px;font-weight:600;">${t.head}</div>` +
      `<div style="font-size:12px;opacity:.7;margin-top:6px;line-height:1.5;">${t.msg}</div></div>${cta}`;
  }

function retailBand(lang, t) {
    let trade = '', base = '';
    try { const v = window.KiwiVenue?.getCurrentVenueData?.() || {}; trade = String(v.subtype || v.type || ''); } catch (_) {}
    try { base = String(window.KiwiVenue?.getVenueType?.() || ''); } catch (_) {}
    if (trade !== 'librairie' && trade !== 'epicerie' && base !== 'boutique') return null;
    const W = window.KiwiTradeWorkspaces;
    const T = {
      fr: { lbl: 'COMMANDES SPÉCIALES', arrived: (n) => `${n} ${n > 1 ? 'arrivées' : 'arrivée'} à retirer`, waiting: (n) => `${n} en attente de livraison`, open: 'Ouvrir Commandes de livres' },
      en: { lbl: 'SPECIAL ORDERS', arrived: (n) => `${n} arrived, to collect`, waiting: (n) => `${n} awaiting delivery`, open: 'Open Special orders' },
      ar: { lbl: 'الطلبات الخاصة', arrived: (n) => `${n} وصلت للاستلام`, waiting: (n) => `${n} في انتظار التسليم`, open: 'فتح الطلبات الخاصة' },
    }[lang] || null;
    const L2 = T || { lbl: 'COMMANDES SPÉCIALES', arrived: (n) => `${n} ${n > 1 ? 'arrivées' : 'arrivée'} à retirer`, waiting: (n) => `${n} en attente de livraison`, open: 'Ouvrir Commandes de livres' };
    if (trade === 'librairie' && W && W.config && W.config('bookorders')) {
      const rows = (W.rows('bookorders') || []).filter((r) => (+r.status || 0) < 2);
      const arrived = rows.filter((r) => (+r.status || 0) === 1).length, waiting = rows.length - arrived;
      if (rows.length) {
        return `<div class="lbl">${L2.lbl}</div><div class="big">${rows.length}</div>` +
          `<div class="sub">${L2.arrived(arrived)} · ${L2.waiting(waiting)}</div>` +
          `<div class="instant" data-action="${__state.BAND_NAV.bookorders}"><div style="font-weight:500;">${L2.open}</div></div>`;
      }
    }
    return `<div class="lbl">${t.lbl}</div><div style="padding:28px 4px 8px;text-align:center;">` +
      `<div style="font-size:14px;font-weight:600;">${t.head}</div>` +
      `<div style="font-size:12px;opacity:.7;margin-top:6px;line-height:1.5;">${t.msg}</div></div>`;
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

function fmtHumanRange(s, e, lang) {
    if (__state.sameDay(s, e)) return `${s.getDate()} ${__state.monthOnly(s, lang, 'long')} ${s.getFullYear()}`;
    const sameYear = s.getFullYear() === e.getFullYear();
    if (sameYear && s.getMonth() === e.getMonth())
      return `${s.getDate()} – ${e.getDate()} ${__state.monthOnly(e, lang, 'long')} ${e.getFullYear()}`;
    if (sameYear)
      return `${s.getDate()} ${__state.monthOnly(s, lang, 'short')} – ${e.getDate()} ${__state.monthOnly(e, lang, 'short')} ${e.getFullYear()}`;
    return `${s.getDate()} ${__state.monthOnly(s, lang, 'short')} ${s.getFullYear()} – `
         + `${e.getDate()} ${__state.monthOnly(e, lang, 'short')} ${e.getFullYear()}`;
  }

function closeCustomPicker() {
    if (!__state.dpEl) return;
    const pop = __state.dpEl;
    __state.dpEl = null;
    pop.classList.remove('open');
    pop.removeAttribute('aria-modal');
    if (pop.__releaseScroll) pop.__releaseScroll();
    if (pop.__focusBefore?.isConnected) pop.__focusBefore.focus({ preventScroll: true });
    const veil = pop.__veil;
    if (veil) { veil.classList.remove('in'); setTimeout(() => veil.remove(), 260); }
    if (__state.dpOutside) document.removeEventListener('mousedown', __state.dpOutside);
    if (__state.dpKey) document.removeEventListener('keydown', __state.dpKey);
    __state.dpOutside = __state.dpKey = null;
    const pill = __state.dpControl?.querySelector('.dr-pill-custom');
    if (pill) pill.setAttribute('aria-expanded', 'false');
    __state.dpControl = null;
    let gone = false;
    const drop = () => { if (gone) return; gone = true; pop.remove(); };
    pop.addEventListener('transitionend', drop, { once: true });
    setTimeout(drop, 300);
  }

function openCustomPicker(options) {
    if (__state.dpEl) { closeCustomPicker(); return; }          // second click → toggle shut
    const dayMode = options?.mode === 'day';
    const control = options?.control || document.querySelector('.dash-date-range .dr-control');
    if (!control) return;
    __state.dpControl = control;
    const lang = __state.getLang();
    const S = __state.PICKER_STR[lang] || __state.PICKER_STR.fr;
    const today = dayMode && __state.isoToDate(options.maxDay) ? __state.isoToDate(options.maxDay) : __state.startOfDay(new Date());
    const monIdx = (y, m) => y * 12 + m;
    const maxLeft = monIdx(today.getFullYear(), today.getMonth()) - 1;  // right pane never future

    const selectedDay = dayMode ? __state.isoToDate(options.selected) : null;
    let selStart = dayMode ? selectedDay : __state.customRange ? __state.startOfDay(__state.customRange.start) : null;
    let selEnd   = dayMode ? selectedDay : __state.customRange ? __state.startOfDay(__state.customRange.end)   : null;
    let hoverD   = null;
    let view = selEnd
      ? __state.shiftMonth(selEnd.getFullYear(), selEnd.getMonth(), -1)
      : __state.shiftMonth(today.getFullYear(), today.getMonth(), -1);

    const pop = document.createElement('div');
    pop.className = 'dr-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', S.title);
    if (lang === 'ar') pop.setAttribute('dir', 'rtl');
    __state.dpEl = pop;
    // On a phone the two-month popover is taller than the screen and its
    // Apply button ends up under the tab bar (ticket #0108): present it as a
    // bottom sheet instead, with a scrolling calendar and a pinned footer.
    const asSheet = window.matchMedia && matchMedia('(max-width: 640px)').matches;
    if (asSheet) {
      const veil = document.createElement('div');
      veil.className = 'dr-sheet-veil';
      document.body.appendChild(veil);
      pop.__veil = veil;
      pop.classList.add('dr-sheet');
      veil.addEventListener('click', closeCustomPicker);
      pop.setAttribute('aria-modal', 'true');
      pop.__focusBefore = document.activeElement;
      pop.__releaseScroll = window.Kiwi?.scrollLock?.acquire();
      document.body.appendChild(pop);
      requestAnimationFrame(() => veil.classList.add('in'));
    } else if (dayMode) document.body.appendChild(pop);
    else control.appendChild(pop);

    const presets = [['p7', S.p7], ['p14', S.p14], ['p30', S.p30],
                     ['pMonth', S.pMonth], ['pLast', S.pLast], ['p90', S.p90]];
    function presetRange(key) {
      if (key === 'p7')  return [__state.addDays(today, -6), today];
      if (key === 'p14') return [__state.addDays(today, -13), today];
      if (key === 'p30') return [__state.addDays(today, -29), today];
      if (key === 'p90') return [__state.addDays(today, -89), today];
      if (key === 'pMonth') return [new Date(today.getFullYear(), today.getMonth(), 1), today];
      if (key === 'pLast')  return [new Date(today.getFullYear(), today.getMonth() - 1, 1),
                                    new Date(today.getFullYear(), today.getMonth(), 0)];
      return null;
    }
    function activePreset() {
      if (!selStart || !selEnd) return null;
      for (let i = 0; i < presets.length; i++) {
        const r = presetRange(presets[i][0]);
        if (r && __state.sameDay(__state.startOfDay(r[0]), selStart) && __state.sameDay(__state.startOfDay(r[1]), selEnd))
          return presets[i][0];
      }
      return null;
    }
    const chev = (dir) => `<span class="dr-icon dr-icon-${dir === 'prev' ? 'prev' : 'next'}" aria-hidden="true"></span>`;

    function weekdayRow() {
      const mon = __state.addDays(today, -((today.getDay() + 6) % 7));
      let h = '';
      for (let i = 0; i < 7; i++) {
        const wd = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(__state.LOCALES[lang] || __state.LOCALES.fr, { weekday: 'short' })
          .format(__state.addDays(mon, i)).replace('.', '');
        h += `<span class="drp-wd">${__state.dpEsc(wd)}</span>`;
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
        const future = __state.ymdInt(date) > __state.ymdInt(today);
        let cls = 'drp-day';
        if (future) cls += ' is-disabled';
        if (__state.sameDay(date, today)) cls += ' is-today';
        cells += `<button type="button" class="${cls}" data-day="${__state.dateToIso(date)}"`
          + `${future ? ' disabled' : ''}><span class="drp-dn">${d}</span></button>`;
      }
      return cells;
    }
    function monthCard(y, m, side) {
      const canNext = monIdx(view.y, view.m) < maxLeft;
      const lBtn = side === 'left'
        ? `<button type="button" class="drp-nav" data-nav="prev" aria-label="${__state.dpEsc({fr:'Mois précédent',en:'Previous month',ar:'الشهر السابق'}[lang])}">${chev('prev')}</button>`
        : '<span class="drp-nav-gap"></span>';
      const rBtn = side === 'right'
        ? `<button type="button" class="drp-nav" data-nav="next" aria-label="${__state.dpEsc({fr:'Mois suivant',en:'Next month',ar:'الشهر التالي'}[lang])}"${canNext ? '' : ' disabled'}>${chev('next')}</button>`
        : '<span class="drp-nav-gap"></span>';
      return `<div class="drp-month"><div class="drp-mhead">${lBtn}`
        + `<span class="drp-mname">${__state.dpEsc(__state.monthLabel(y, m, lang))}</span>${rBtn}</div>`
        + `<div class="drp-wdrow">${weekdayRow()}</div>`
        + `<div class="drp-grid">${monthGrid(y, m)}</div></div>`;
    }

    function decorate() {
      let lo = selStart, hi = selEnd;
      if (selStart && !selEnd && hoverD) {
        lo = __state.ymdInt(hoverD) < __state.ymdInt(selStart) ? hoverD : selStart;
        hi = __state.ymdInt(hoverD) < __state.ymdInt(selStart) ? selStart : hoverD;
      }
      const a = lo ? __state.ymdInt(lo) : null;
      const b = hi ? __state.ymdInt(hi) : null;
      pop.querySelectorAll('.drp-day').forEach((btn) => {
        btn.classList.remove('in-range', 'is-start', 'is-end', 'is-edge', 'is-solo');
        if (!btn.dataset.day) return;
        const v = __state.ymdInt(__state.isoToDate(btn.dataset.day));
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
        // Nothing picked yet: name the period in effect, in the muted colour,
        // instead of a lone dot.
        else ro.textContent = __state.RANGE_STR[lang]?.[__state.currentRange] || __state.RANGE_STR.fr[__state.currentRange] || S.hintStart;
        ro.classList.toggle('is-set', !!(lo || selStart));
      }
      const hint = pop.querySelector('[data-drp-hint]');
      if (hint) {
        if (lo && hi) {
          const n = __state.spanDays(lo, hi);
          hint.innerHTML = `<b>${n}</b> ${__state.dpEsc(n > 1 ? S.days : S.day)}`;
        } else {
          hint.textContent = selStart ? S.hintEnd : S.hintStart;
        }
      }
      const apply = pop.querySelector('[data-drp-apply]');
      if (apply) apply.disabled = !(selStart && selEnd);
      const ap = dayMode ? null : activePreset();
      pop.querySelectorAll('.drp-preset').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.preset === ap);
      });
    }

    function render() {
      const scrollTop = pop.querySelector('.drp-body')?.scrollTop || 0;
      const r = __state.shiftMonth(view.y, view.m, 1);
      pop.innerHTML =
        `<div class="drp-head"><div><div class="drp-eyebrow">${__state.dpEsc(dayMode ? ({ fr: 'Choisir une date', en: 'Pick a date', ar: 'اختر تاريخاً' }[lang] || 'Choisir une date') : S.title)}</div>`
        + `<div class="drp-readout" data-drp-readout></div></div>`
        + `<button type="button" class="drp-x" data-drp-cancel aria-label="${__state.dpEsc(S.cancel)}">`
        + `<span class="dr-icon dr-icon-close" aria-hidden="true"></span></button></div>`
        + `<div class="drp-body">${dayMode ? '' : `<div class="drp-presets">`
        + `<div class="drp-presets-lbl">${__state.dpEsc(S.presets)}</div>`
        + presets.map(([k, lbl]) =>
            `<button type="button" class="drp-preset" data-preset="${k}">${__state.dpEsc(lbl)}</button>`).join('')
        + `</div>`}<div class="drp-cal"><div class="drp-months">`
        + monthCard(view.y, view.m, 'left') + monthCard(r.y, r.m, 'right')
        + `</div></div></div>`
        + `<div class="drp-foot"><div class="drp-hint" data-drp-hint></div>`
        + `<div class="drp-acts">`
        + `<button type="button" class="drp-btn drp-btn-ghost" data-drp-cancel>${__state.dpEsc(S.cancel)}</button>`
        + `<button type="button" class="drp-btn drp-btn-go" data-drp-apply>${__state.dpEsc(S.apply)}</button>`
        + `</div></div>`;
      decorate();
      pop.querySelector('.drp-body').scrollTop = scrollTop;
    }

    function pickDay(iso) {
      const d = __state.isoToDate(iso);
      if (!d) return;
      if (dayMode) { selStart = d; selEnd = d; hoverD = null; render(); return; }
      if (!selStart || (selStart && selEnd)) { selStart = d; selEnd = null; }
      else if (__state.ymdInt(d) < __state.ymdInt(selStart)) { selEnd = selStart; selStart = d; }
      else { selEnd = d; }
      hoverD = null;
      render();
    }
    function applyPreset(key) {
      const r = presetRange(key);
      if (!r) return;
      selStart = __state.startOfDay(r[0]);
      selEnd = __state.startOfDay(r[1]);
      hoverD = null;
      view = __state.shiftMonth(selEnd.getFullYear(), selEnd.getMonth(), -1);
      render();
    }
    function shiftView(n) {
      const nv = __state.shiftMonth(view.y, view.m, n);
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
        if (dayMode) options.onApply(__state.dateToIso(selStart));
        else commitCustomRange(selStart, selEnd);
        closeCustomPicker();
      }
    });
    pop.addEventListener('mouseover', (e) => {
      if (dayMode || !selStart || selEnd) return;
      const day = e.target.closest('.drp-day');
      const nd = (day && day.dataset.day && !day.disabled) ? __state.isoToDate(day.dataset.day) : null;
      if ((nd ? __state.ymdInt(nd) : 0) === (hoverD ? __state.ymdInt(hoverD) : 0)) return;
      hoverD = nd;
      decorate();
    });
    pop.addEventListener('mouseleave', () => {
      if (selStart && !selEnd && hoverD) { hoverD = null; decorate(); }
    });

    // Swipe the calendar sideways to change month, like the iOS date picker.
    let swipeX = null, swipeY = 0;
    pop.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.drp-cal') || e.touches.length !== 1) { swipeX = null; return; }
      swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY;
    }, { passive: true });
    pop.addEventListener('touchend', (e) => {
      if (swipeX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeX, dy = t.clientY - swipeY;
      swipeX = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const forward = lang === 'ar' ? dx > 0 : dx < 0;
      shiftView(forward ? 1 : -1);
    }, { passive: true });

    render();
    if (dayMode && !asSheet) {
      // Drawers clip their scrollable bodies with contain:paint. Portal the
      // SAME calendar above them and anchor it to the shared pill.
      const rect = control.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.insetInlineEnd = 'auto';
      const anchorX = lang === 'ar' ? rect.right - pop.offsetWidth : rect.left;
      pop.style.left = Math.max(8, Math.min(anchorX, innerWidth - pop.offsetWidth - 8)) + 'px';
      pop.style.top = Math.max(8, Math.min(rect.bottom + 10, innerHeight - pop.offsetHeight - 8)) + 'px';
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (__state.dpEl === pop) pop.classList.add('open');
    }));

    __state.dpOutside = (e) => {
      if (pop.contains(e.target)) return;
      if (control.contains(e.target)) return;   // the control's own click toggles
      closeCustomPicker();
    };
    __state.dpKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeCustomPicker(); return; }
      if (!asSheet || e.key !== 'Tab') return;
      const buttons = [...pop.querySelectorAll('button:not([disabled])')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || !pop.contains(document.activeElement))) {
        e.preventDefault(); last?.focus({preventScroll:true});
      } else if (!e.shiftKey && (document.activeElement === last || !pop.contains(document.activeElement))) {
        e.preventDefault(); first?.focus({preventScroll:true});
      }
    };
    setTimeout(() => {
      if (__state.dpEl !== pop) return;
      document.addEventListener('mousedown', __state.dpOutside);
      document.addEventListener('keydown', __state.dpKey);
    }, 0);

    const pill = control.querySelector('.dr-pill-custom');
    if (pill) pill.setAttribute('aria-expanded', 'true');
  }

function mountDaySelector(host, options = {}) {
    if (!host) return;
    const report = window.KiwiDayReport;
    const today = report?.today?.(options.merchant) || __state.dateToIso(new Date());
    const shift = (n) => report?.shiftDay?.(today, -n, options.merchant) || __state.dateToIso(__state.addDays(__state.isoToDate(today), -n));
    const chosen = __state.isoToDate(options.value) ? options.value : today;
    const offsets = options.offsets || [0, 1];
    const lang = __state.getLang();
    const labels = {
      fr: ["Aujourd'hui", 'Hier', 'Avant-hier', 'Choisir une date'],
      en: ['Today', 'Yesterday', 'Day before yesterday', 'Pick a date'],
      ar: ['اليوم', 'أمس', 'أول أمس', 'اختر تاريخاً'],
    }[lang] || ["Aujourd'hui", 'Hier', 'Avant-hier', 'Choisir une date'];
    const relative = offsets.find(n => shift(n) === chosen);
    const custom = relative == null;
    const customLabel = custom ? new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang === 'ar' ? 'ar-MA' : lang,
      { day: 'numeric', month: 'short', year: 'numeric' }).format(__state.isoToDate(chosen)) : labels[3];
    host.innerHTML = `<div class="dr-control dr-day-control"><div class="dr-pills" role="group" aria-label="${__state.dpEsc(options.ariaLabel || labels[3])}">`
      + offsets.map(n => `<button type="button" class="dr-pill${relative === n ? ' on' : ''}" data-dr-day-offset="${n}" aria-pressed="${relative === n}">${__state.dpEsc(labels[n])}</button>`).join('')
      + `<button type="button" class="dr-pill dr-pill-custom${custom ? ' on' : ''}" data-dr-day-custom aria-pressed="${custom}" aria-haspopup="dialog" aria-expanded="false">`
      + `<span class="dr-icon dr-icon-calendar" aria-hidden="true"></span>${__state.dpEsc(customLabel)}</button></div></div>`;
    const control = host.querySelector('.dr-control');
    requestAnimationFrame(() => { const selected = control.querySelector('.dr-pill.on'); if (selected) revealDayPill(selected); });
    host.querySelectorAll('[data-dr-day-offset]').forEach(button => {
      button.addEventListener('click', () => options.onChange?.(shift(+button.dataset.drDayOffset)));
    });
    host.querySelector('[data-dr-day-custom]').addEventListener('click', () => openCustomPicker({
      mode: 'day', control, selected: chosen, maxDay: today, onApply: day => options.onChange?.(day),
    }));
    window.KiwiLens?.rescan?.();
  }

function registerHandler() {
    const tryReg = () => {
      if (window.Kiwi?.handlers) {
        window.Kiwi.handlers['date-range'] = __state.onAction;
        window.Kiwi.handlers['open-date-picker'] = openCustomPicker;
        window.Kiwi.handlers['rev-compare'] = __state.onCompareToggle;
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
            __state.renderRevChart();
          }
        };
        window.Kiwi.handlers['hh-ai-glovo'] = () => {
          const gl = __state.GLOVO_TOAST[__state.getLang()] || __state.GLOVO_TOAST.fr;
          window.Kiwi?.toast?.(gl.t, { type: 'info', desc: gl.d });
        };
        return;
      }
      setTimeout(tryReg, 30);
    };
    tryReg();
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
    return { renderHero, renderHeroAi, renderHeatmapAi, renderGoal, renderHeatmap, renderKpiBand, renderRevChart, renderMix, renderMixPlan, renderFeed, renderSettle, renderPairs, renderInteg, renderNotifBadge, renderEvening, renderStock, renderTimeline, renderHealth, renderBench, renderProducts, renderStaff, aggFusion, zeroClone, vData, priorLedgerRows, demoLedgerProjection, demoPreviousAt, demoRole, setDateRange, commitCustomRange, setShowComparison, homeSet, paintNumber, animateNumber, fitHeroAmount, revealDayPill, merchantTimeZone, merchantParts, merchantBoundary, merchantDayKey, calendarStartKey, calendarBounds, rangeBounds, realInsightSummary, buildRealHeroRec, buildRealHeatmapRec, screenBook, realClosedTips, realClientMix, openDays, realDeltaPct, deltaTenths, hourlyCumul, dailyTotals, realRevSeries, operatorLedgerPending, buildHeatmap, hotelPerfEntry, hotelTilesFrom, tableTimeEntry, openKpiCustomizer, realMixRows, buildOrder, buildLiveFeed, buildCustomFeed, realLowStock, realTopProducts, realPairs, growBars, dutyBand, retailBand, hookI18n, fmtHumanRange, closeCustomPicker, openCustomPicker, mountDaySelector, registerHandler, tickLiveRevenue, kpiByVenue, revChartByVenue, heroDataByVenue };
  };
})();
