/* Owner: dashboard kpi. Exports: renderKpiBand, hotelPerfEntry, hotelTilesFrom, tableTimeEntry, openKpiCustomizer, dutyBand, retailBand, kpiByVenue.
 * Sibling calls via live owner: openDays, vData.
 * Reads live owner: BAND_NAV, HOTEL_PERF_TTL, KC_STR, KPI_CATALOG, KPI_DELTA_SUFFIX, KPI_MATERIAL_ICONS, KPI_MAX, KPI_SPARKS, RANGE_DAYS, TABLE_TIME_TTL, animateNumber, arrowSvg, basketCents, closedBounds, curUnit, currentRange, defaultKpiKeys, effRange, escTxt, fmtKpiVal, fmtPct, frInt, getCurrentVenue, getKpiLayout, getLang, getSim, guardOperatorFigures, homeSet, hotelBandTiles, hotelDelta, hotelMerchant, hotelPerf, isLiveDemo, kpiByVenue, kpiLabel, lastBand, openDays, operatorUnavailableText, ownData, parseAmountFromEl, realClientMix, realDeltaPct, realGrossProfit, realSalesTotals, realWindowStats, renderKpiBand, resetKpiLayout, saveKpiLayout, tableTime, tableTimeTile, vData.
 * Reads globalThis: KiwiZoneLaw.
 * Reads window: Kiwi, KiwiHotelRooms, KiwiI18n, KiwiPressingOps, KiwiSales, KiwiTradeSchema, KiwiTradeWorkspaces, KiwiVenue. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['kpi'] = function (__state) {
  function openDays(...args) { return __state.openDays.apply(this, args); }
  function vData(...args) { return __state.vData.apply(this, args); }
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
          <svg class="sp" viewBox="0 0 120 22" preserveAspectRatio="none" aria-hidden="true" focusable="false">
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
          <svg class="sp" viewBox="0 0 120 22" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${sparkPath}" stroke="#0B6E4F" stroke-width="4" stroke-opacity="0.16" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${sparkPath}" stroke="#0B6E4F" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
    return Object.freeze({ renderKpiBand, hotelPerfEntry, hotelTilesFrom, tableTimeEntry, openKpiCustomizer, dutyBand, retailBand, kpiByVenue });
  };
})();
