/* Kiwi Vexel skin · reversible home-layout adapter.
 *
 * The source dashboard is intentionally left alone.  While the skin is on,
 * this adapter gathers its existing live widgets into the same four-block
 * composition as the marketing surface.  Comment placeholders preserve every
 * original insertion point so disabling the skin restores the DOM exactly.
 */
(function () {
  'use strict';

  var CLASS = 'design-vexel';
  var state = {
    active: false, root: null, moves: [], concealed: [], observer: null,
    rangeUnsubscribe: null, venueUnsubscribe: null, langHandler: null, raf: 0,
    goalSignature: ''
  };

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function setText(node, value) {
    value = value == null ? '' : String(value);
    if (node && node.textContent !== value) node.textContent = value;
  }

  function rememberMove(node, parent) {
    if (!node || !parent) return;
    var marker = document.createComment('vexel-layout-origin');
    node.parentNode.insertBefore(marker, node);
    state.moves.push({ node: node, marker: marker });
    parent.appendChild(node);
  }

  function restoreMoves() {
    for (var i = state.moves.length - 1; i >= 0; i -= 1) {
      var move = state.moves[i];
      if (move.marker.parentNode) {
        move.marker.parentNode.insertBefore(move.node, move.marker);
        move.marker.remove();
      }
    }
    state.moves = [];
  }

  function conceal(node) {
    if (!node) return;
    state.concealed.push({
      node: node,
      display: node.style.getPropertyValue('display'),
      priority: node.style.getPropertyPriority('display'),
      ariaHidden: node.getAttribute('aria-hidden')
    });
    node.style.setProperty('display', 'none', 'important');
    node.setAttribute('aria-hidden', 'true');
  }

  function restoreConcealed() {
    state.concealed.forEach(function (item) {
      if (item.display) item.node.style.setProperty('display', item.display, item.priority);
      else item.node.style.removeProperty('display');
      if (item.ariaHidden == null) item.node.removeAttribute('aria-hidden');
      else item.node.setAttribute('aria-hidden', item.ariaHidden);
    });
    state.concealed = [];
  }

  function reportButton() {
    var labels = { fr: 'Générer le rapport', en: 'Generate report', ar: 'إنشاء التقرير' };
    var button = el('button', 'vexel-report-btn');
    button.type = 'button';
    button.dataset.action = 'export';
    button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>' +
      '</svg><span>' + labels[lang()] + '</span>';
    return button;
  }

  function topbarMerchant() {
    var source = document.querySelector('.sidebar .merchant');
    if (!source) return null;
    var profile = source.cloneNode(true);
    profile.classList.add('vexel-topbar-merchant');
    profile.dataset.action = 'profile-menu';
    profile.setAttribute('aria-label', (profile.querySelector('.n') || {}).textContent || 'Compte');
    return profile;
  }

  function revenueLegend() {
    return el('div', 'vexel-revenue-legend',
      '<span><i></i>Période</span>' +
      '<span><i></i>Comparaison</span>');
  }

  function goalRail() {
    var rail = el('aside', 'vexel-revenue-rail');
    rail.innerHTML =
      '<section class="vexel-rail-card vexel-day-goal">' +
        '<div class="vexel-rail-label" data-vexel-goal-label></div>' +
        '<div class="vexel-goal-values"><strong data-vexel-goal-current>—</strong><span data-vexel-goal-target></span></div>' +
        '<div class="vexel-goal-track"><i data-vexel-goal-fill></i></div>' +
        '<div class="vexel-goal-foot"><span data-vexel-goal-pct>—</span><span data-vexel-goal-rest></span></div>' +
      '</section>' +
      '<section class="vexel-rail-card vexel-clients">' +
        '<div class="vexel-client-label" data-vexel-client-label></div>' +
        '<svg width="340" height="76" viewBox="0 0 340 76" preserveAspectRatio="none" role="img">' +
          '<title data-vexel-client-chart-title></title>' +
          // Ce degrade remplissait l'aire sous une courbe : il pouvait s'effacer
          // vers le bas sans rien coûter. Il porte maintenant une PART, dont le
          // bord droit est le chiffre lui-meme -- s'il s'efface, la part devient
          // illisible sur fond clair. D'ou un bas qui reste teinte.
          '<defs><linearGradient id="vexelClientFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00ffae" stop-opacity=".5"/><stop offset="1" stop-color="#00ffae" stop-opacity=".14"/></linearGradient></defs>' +
          '<path class="fill" data-vexel-client-fill d=""/>' +
          '<path class="line" data-vexel-client-line d=""/>' +
          '<circle data-vexel-client-start cx="2" cy="68" r="3" opacity=".42"/>' +
          '<circle data-vexel-client-end cx="338" cy="68" r="5"/>' +
        '</svg>' +
        '<div class="vexel-client-foot"><div><strong data-vexel-client-value>—</strong><span data-vexel-client-caption></span></div><b data-vexel-client-delta></b></div>' +
      '</section>';
    return rail;
  }

  /* La carte montre une PART, pas un objectif : aucun objectif par canal
   * n'existe côté produit, et en inventer un ferait lire « 74 % de l'objectif
   * salle atteint » à un commerçant qui n'en a jamais fixé. Une part de
   * chiffre d'affaires, elle, se déduit honnêtement du total de la période. */
  var SERVICE_STR = {
    fr: { title: 'Ventes par canal', share: 'Part du chiffre d’affaires', unavailable: 'Ventilation par canal indisponible', goalUnavailable: 'Objectif indisponible', noData: 'Donnée indisponible' },
    en: { title: 'Sales by channel', share: 'Share of revenue', unavailable: 'Channel breakdown unavailable', goalUnavailable: 'Goal unavailable', noData: 'Data unavailable' },
    ar: { title: 'المبيعات حسب القناة', share: 'حصة رقم المعاملات', unavailable: 'التوزيع حسب القناة غير متاح', goalUnavailable: 'الهدف غير متاح', noData: 'البيانات غير متاحة' }
  };
  var RANGE_STR = {
    fr: { aujourdhui: "Aujourd'hui", hier: 'Hier', septJours: '7 derniers jours', trenteJours: '30 derniers jours', moisDernier: 'Mois dernier', trimestre: 'Ce trimestre', annee: 'Cette année', personnalise: 'Période personnalisée' },
    en: { aujourdhui: 'Today', hier: 'Yesterday', septJours: 'Last 7 days', trenteJours: 'Last 30 days', moisDernier: 'Last month', trimestre: 'This quarter', annee: 'This year', personnalise: 'Custom period' },
    ar: { aujourdhui: 'اليوم', hier: 'أمس', septJours: 'آخر 7 أيام', trenteJours: 'آخر 30 يوما', moisDernier: 'الشهر الماضي', trimestre: 'هذا الربع', annee: 'هذه السنة', personnalise: 'فترة مخصصة' }
  };
  /* La carte lit la tuile « Clients réguliers » du bandeau, dont la valeur est
   * un RAPPORT — réguliers sur clients vus (dateRange.js · realRegularsTile).
   * Elle l'intitulait « Croissance clients · Clients ce mois ». Trois mots,
   * trois erreurs : ce n'est pas une croissance, ce ne sont pas les clients du
   * mois, et la période affichée est celle que le commerçant a choisie dans les
   * pastilles, pas le mois. Un patron qui lit « 286 clients ce mois » sur un
   * rapport réguliers/total prend une décision sur un chiffre qui n'existe pas.
   * Le libellé dit maintenant ce que la tuile mesure, et la légende reprend la
   * plage réellement sélectionnée. */
  var CLIENT_STR = {
    fr: { label: 'Clients réguliers', caption: 'Clients vus · ' },
    en: { label: 'Returning customers', caption: 'Customers seen · ' },
    ar: { label: 'العملاء المنتظمون', caption: 'العملاء المسجلون · ' }
  };

  function lang() {
    var l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang();
    return l === 'en' || l === 'ar' ? l : 'fr';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function activeTrade() {
    var raw = '';
    /* The selected venue wins over the onboarding default. Otherwise a venue
     * switch can leave the service card showing the previous trade's channels. */
    try {
      var data = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData();
      raw = data && (data.subtype || data.type) || '';
    } catch (_) {}
    if (!raw) try { raw = localStorage.getItem('kiwiBizType') || ''; } catch (_) {}
    if (!raw) {
      try { raw = window.KiwiVenue && window.KiwiVenue.getVenueType && window.KiwiVenue.getVenueType() || ''; } catch (_) {}
    }
    return raw || 'autre';
  }

  function currentChannels() {
    var registry = window.KiwiTrades;
    return registry && registry.channels ? registry.channels(activeTrade()) : [];
  }

  /* Keep each establishment on its own operational surface. Universal cards
   * remain shared; restaurant-only fixtures declare data-venue-types in the
   * source markup. Integration cards can be rebuilt by dateRange.js, so tag
   * the restaurant delivery partners again before applying the gate. */
  function applyVenueRelevance() {
    var type = 'restaurant';
    try { type = window.KiwiVenue && window.KiwiVenue.getVenueType && window.KiwiVenue.getVenueType() || type; } catch (_) {}
    document.body.dataset.venueType = type;

    document.querySelectorAll('.integ-card').forEach(function (card) {
      var name = ((card.querySelector('.n') || {}).textContent || '').trim();
      if (name === 'Glovo' || name === 'Yassir Express') card.dataset.venueTypes = 'restaurant';
    });

    document.querySelectorAll('[data-venue-types]').forEach(function (node) {
      var allowed = String(node.dataset.venueTypes || '').split(/\s+/).filter(Boolean);
      var relevant = allowed.indexOf(type) >= 0;
      node.hidden = !relevant;
      if (relevant) {
        node.removeAttribute('aria-hidden');
        node.style.removeProperty('display');
      } else {
        node.setAttribute('aria-hidden', 'true');
        /* `hidden` on its own is a suggestion: .integ-card carries its own
         * `display: flex`, which outranks the browser's [hidden] rule — so the
         * gate was setting the attribute while a spa carried on being offered
         * Glovo and Yassir Express. Say it in a voice the cascade can hear. */
        node.style.setProperty('display', 'none', 'important');
      }
    });

    scheduleBackfill(true);
  }

  /* The gate is the adapter's, so its verdict leaves with the adapter — without
   * this, turning the skin off left a boutique's restaurant cards hidden. */
  function ungate() {
    document.querySelectorAll('[data-venue-types]').forEach(function (node) {
      node.hidden = false;
      node.removeAttribute('aria-hidden');
      node.style.removeProperty('display');
    });
    delete document.body.dataset.venueType;
  }

  /* ── Backfill the cells venue gating empties ────────────────────────────────
   *
   * .dash-cols is a THREE-column grid whose .dash-col children are
   * display:contents — the cards themselves are the grid items, the columns are
   * only DOM grouping. So hiding a card does not shrink a column, it leaves a
   * cell. A boutique loses both of the side column's cards (evening service,
   * stock reorder) and the row renders two cards across three tracks: a third
   * of the row is blank paper.
   *
   * Meanwhile five genuinely venue-agnostic analyses sit collapsed behind
   * "Plus d'analyses". Promote them into the empty cells.
   *
   * Selection is by FIT, not by topic: take whichever card's height sits
   * closest to the cards already in the row, so the promoted card completes the
   * row instead of introducing a new silhouette. Cards MOVE rather than copy —
   * each lives in exactly one place and the toggle's count follows. */
  var backfilled = [];
  var pinned = [];
  var backfillTimer = 0;
  var backfillTries = 0;

  /* The venue gate fires before the row is laid out, so a pass triggered
   * straight off it reads every height as 0 and would pick blind. Give the
   * layout a moment, and retry a bounded number of times until the geometry the
   * fit depends on actually exists. */
  function scheduleBackfill(fresh) {
    if (fresh) backfillTries = 0;
    clearTimeout(backfillTimer);
    backfillTimer = setTimeout(backfillVacatedCells, 120);
  }

  function restoreBackfill() {
    for (var i = backfilled.length - 1; i >= 0; i -= 1) {
      var move = backfilled[i];
      if (move.marker.parentNode) {
        move.marker.parentNode.insertBefore(move.node, move.marker);
        move.marker.remove();
      }
    }
    backfilled = [];
  }

  /* Move a card, leaving a marker where it stood so disable() can put it back
   * exactly — the adapter never destroys markup it did not create. */
  function relocate(node, host) {
    var marker = document.createComment('vexel-backfill-origin');
    node.parentNode.insertBefore(marker, node);
    backfilled.push({ node: node, marker: marker });
    host.appendChild(node);
  }

  /* Inline overrides this pass writes, each remembering what it displaced. */
  function pin(node, prop, value) {
    pinned.push({ node: node, prop: prop, prev: node.style[prop] });
    node.style[prop] = value;
  }

  function restorePins() {
    for (var i = pinned.length - 1; i >= 0; i -= 1) pinned[i].node.style[pinned[i].prop] = pinned[i].prev;
    pinned = [];
  }

  /* The toggle's count chip is filled once at page load from the pool size.
   * Promoting a card out of the pool makes that number a lie. */
  function syncMoreCount() {
    var pool = document.querySelector('[data-dash-more]');
    var chip = document.querySelector('[data-dmt-count]');
    if (!pool || !chip) return;
    var left = [].filter.call(pool.querySelectorAll('.block'), function (b) { return !b.hidden; }).length;
    chip.textContent = String(left);
    chip.hidden = left === 0;
  }

  function itemHeight(node) {
    return (!node || node.hidden) ? 0 : node.getBoundingClientRect().height;
  }

  /* Count TRACK CELLS, not cards. A card carrying `grid-column: 1 / span 2`
   * fills two of them, which is how a row holding five cells across three
   * tracks first read as "three cards, nothing missing". */
  function cellSpan(node) {
    var match = /span\s+(\d+)/.exec(getComputedStyle(node).gridColumn);
    return match ? Math.min(parseInt(match[1], 10), 12) : 1;
  }

  /* A seat this session emptied: gated away by venue, or given up by a card
   * that had nothing to show. A row that was always short keeps its shape. */
  function vacated(node) {
    return node.hidden
      && (node.hasAttribute('data-venue-types') || node.hasAttribute('data-vexel-vacated'));
  }

  /* Grid items of a .dash-cols row: the cards themselves, reached through the
   * display:contents columns. */
  function rowItems(row) {
    var items = [];
    var kids = row.children;
    for (var i = 0; i < kids.length; i += 1) {
      if (kids[i].classList.contains('dash-col')) {
        var inner = kids[i].children;
        for (var j = 0; j < inner.length; j += 1) items.push(inner[j]);
      } else {
        items.push(kids[i]);
      }
    }
    return items;
  }

  function backfillVacatedCells() {
    restoreBackfill();
    restorePins();

    var pool = document.querySelector('[data-dash-more]');

    var rows = document.querySelectorAll('.dash-cols, .vexel-bottom-row, .integ-grid');
    for (var r = 0; r < rows.length; r += 1) {
      var row = rows[r];
      var tracks = getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (tracks < 2) continue;

      /* Count by the `hidden` attribute, not by measured height. The gate that
       * creates the hole runs before the row has been laid out, so heights are
       * still 0 at this point; only the FIT below needs real geometry. */
      var items = rowItems(row);
      var visible = items.filter(function (n) { return !n.hidden; });
      if (!visible.length) continue;

      /* Only close what this session emptied. A trailing gap the row always
       * had — four cards across three tracks on a restaurant — is the grid's
       * own remainder, not dead space, and rewriting it would change the
       * default dashboard for the one venue type that has no problem. */
      var gated = items.filter(vacated).length;
      if (!gated) continue;

      var cells = visible.reduce(function (sum, n) { return sum + cellSpan(n); }, 0);
      var trailing = (tracks - (cells % tracks)) % tracks;
      var vacant = Math.min(trailing, gated);
      if (!vacant) continue;

      /* Promotion only makes sense for the main grid, where the cards in the
       * pool are the same species as the cards around the hole — and never for
       * a row inside the pool itself, which would rob it to fill it. Those rows
       * still get re-gridded below; the integrations live in one. */
      var filled = 0;
      if (pool && row.classList.contains('dash-cols') && !row.closest('[data-dash-more]')) {
        /* Fit needs real geometry. If the row has not been laid out yet, come
         * back rather than pick on zeroes. */
        var measured = visible.some(function (n) { return itemHeight(n) > 0; });
        if (!measured) {
          if (backfillTries < 12) { backfillTries += 1; scheduleBackfill(false); }
          return;
        }

        /* Height to match: the mean of what is already in the row. */
        var target = visible.reduce(function (sum, n) { return sum + itemHeight(n); }, 0) / visible.length;

        /* The empty column is the natural landing spot — appending there keeps
         * DOM order aligned with visual order. Fall back to the row itself. */
        var host = row.querySelector('.dash-col:last-of-type') || row;

        for (var v = 0; v < vacant; v += 1) {
          var candidates = [].slice.call(pool.querySelectorAll('.block')).filter(function (b) {
            return !b.hidden;
          });
          if (!candidates.length) break;

          var best = candidates[0];
          var bestGap = Math.abs(itemHeight(best) - target);
          for (var c = 1; c < candidates.length; c += 1) {
            var gap = Math.abs(itemHeight(candidates[c]) - target);
            if (gap < bestGap) { best = candidates[c]; bestGap = gap; }
          }

          relocate(best, host);
          filled += 1;
        }
      }

      /* Whatever nothing was promoted into stays blank paper. When every
       * surviving card fits on one line, drop the empty tracks instead and let
       * the row re-grid to the cards it actually has: a spa's two integrations
       * become two half-width tiles rather than two tiles and a void. Grids
       * that run to a second row keep their tracks — re-gridding those would
       * break the cards spanning two of them. */
      if (filled < vacant && cells + filled < tracks) {
        pin(row, 'gridTemplateColumns', 'repeat(' + (cells + filled) + ', minmax(0, 1fr))');
      }
    }

    balancePool();
    syncMoreCount();
  }

  /* "Plus d'analyses" is a two-column grid. An odd number of cards leaves the
   * short column trailing a card-sized hole — and promoting one out of the pool
   * is exactly what flips it odd. Give the last card the full width instead. */
  function balancePool() {
    var grid = document.querySelector('[data-dash-more] .dash-cols');
    if (!grid) return;
    if (getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length !== 2) return;

    var cols = grid.querySelectorAll('.dash-col');
    if (cols.length !== 2) return;

    var left = [].filter.call(cols[0].children, function (n) { return !n.hidden; });
    var right = [].filter.call(cols[1].children, function (n) { return !n.hidden; });
    if ((left.length + right.length) % 2 === 0) return;

    var longer = left.length > right.length ? left : right;
    if (!longer.length) return;
    var odd = longer[longer.length - 1];

    /* The per-column CSS pins each card to its own track, so the odd one has to
     * sit in the first column's flow before a full-width span reads as the last
     * row rather than a stray third row. */
    if (longer === right) relocate(odd, cols[0]);
    pin(odd, 'gridColumn', '1 / -1');
  }

  function realSession() {
    try {
      return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal())
        || !!(window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom());
    } catch (_) { return false; }
  }

  function channelKey(raw, channelIds) {
    var key = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    var direct = {
      salle: 'dining', dining: 'dining', surplace: channelIds.indexOf('dining') >= 0 ? 'dining' : (channelIds.indexOf('cabin') >= 0 ? 'cabin' : (channelIds.indexOf('counter') >= 0 ? 'counter' : 'onsite')),
      terrasse: 'terrace', terrace: 'terrace', comptoir: 'counter', counter: 'counter',
      emporter: 'takeaway', takeaway: 'takeaway', retrait: 'pickup', pickup: 'pickup', clickcollect: 'pickup',
      livraison: 'delivery', delivery: 'delivery', glovo: 'delivery', yassir: 'delivery',
      boutique: 'store', store: 'store', cabine: 'cabin', cabin: 'cabin', domicile: 'home', home: 'home',
      produit: 'products', products: 'products', club: 'club', distance: 'remote', remote: 'remote',
      direct: 'direct', online: 'online', evenement: 'catering', catering: 'catering'
    };
    var resolved = direct[key] || key;
    return channelIds.indexOf(resolved) >= 0 ? resolved : '';
  }

  /* Le journal de ventes ne porte actuellement pas de canal. Cette lecture est
   * prête pour le jour où il en portera un, mais ne déduit jamais un canal du
   * moyen de paiement ou du libellé du ticket. */
  function channelAmounts(channels) {
    var out = Object.create(null);
    if (!realSession() || !window.KiwiSales || !window.KiwiSales.list) return out;
    var venue = window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue();
    var rows = [];
    try { rows = window.KiwiSales.list(venue) || []; } catch (_) { return out; }
    var bounds = window.KiwiDateRange && window.KiwiDateRange.bounds && window.KiwiDateRange.bounds();
    var from = bounds ? bounds[0] : -Infinity;
    var to = bounds && bounds[1] !== Infinity ? bounds[1] : Date.now() + 1;
    var ids = channels.map(function (c) { return c.id; });
    rows.forEach(function (sale) {
      var ts = +(sale && sale.ts) || 0;
      if (ts < from || ts >= to) return;
      var key = channelKey(sale && sale.channel, ids);
      if (!key) return;
      out[key] = (out[key] || 0) + Math.max(0, +(sale && sale.amount || 0));
    });
    return out;
  }

  /* Poids de démonstration, un par canal du registre métier. Ils ne sont pas
   * une donnée : ils habillent le jeu de démo au même titre que « Visa 48 % »
   * dans le mix de paiement, et ne sortent jamais de ce chemin — `realSession()`
   * renvoie les vraies ventes, et une venue créée par un client n'a aucun
   * chiffre de démo à emprunter. Normalisés sur les canaux réellement présents,
   * donc un café (salle · terrasse · comptoir · à emporter) et une boutique
   * (comptoir · retrait · livraison) se répartissent chacun 100 %. */
  var DEMO_CHANNEL_WEIGHT = {
    dining: 100, terrace: 52, counter: 74, takeaway: 38, delivery: 27,
    catering: 30, pickup: 22, store: 88, cabin: 96, home: 27,
    products: 19, club: 92, remote: 24, direct: 40, online: 26, onsite: 88
  };

  /* Le total de la période, lu là où le tableau de bord l'affiche déjà. */
  function periodRevenue() {
    var node = document.querySelector('[data-hero-amount]');
    return node ? numberFrom(node.textContent) : 0;
  }

  function demoChannelAmounts(channels) {
    if (realSession()) return {};
    var total = periodRevenue();
    if (!(total > 0) || !channels.length) return {};
    var weights = channels.map(function (c) { return DEMO_CHANNEL_WEIGHT[c.id] || 20; });
    var sum = weights.reduce(function (a, b) { return a + b; }, 0);
    if (!sum) return {};
    var out = Object.create(null);
    channels.forEach(function (channel, index) {
      out[channel.id] = total * (weights[index] / sum);
    });
    return out;
  }

  function serviceAmount(value) {
    if (!(value >= 0)) return '—';
    var locale = lang() === 'en' ? 'en-GB' : 'fr-FR';
    /* Intl groupe en fr-FR avec une espace fine insécable (U+202F) ; le reste
     * du tableau de bord sépare ses milliers par une espace normale. Deux
     * largeurs pour le même chiffre se voient dès qu'on empile les cartes. */
    return Math.round(value).toLocaleString(locale).replace(/\u202F/g, ' ');
  }

  function servicePeriodLabel(range, l) {
    var fallback = (RANGE_STR[l] || RANGE_STR.fr)[range] || RANGE_STR.fr.aujourdhui;
    if (range !== 'personnalise') return fallback;
    try {
      var raw = localStorage.getItem('kiwiCustomRange') || '';
      var dates = raw.split('|');
      if (/^\d{4}-\d{2}-\d{2}$/.test(dates[0]) && /^\d{4}-\d{2}-\d{2}$/.test(dates[1])) return dates[0] + ' — ' + dates[1];
    } catch (_) {}
    return fallback;
  }

  function ringMarkup(amount, share, label, tone, caption) {
    var radius = 48;
    var circumference = 2 * Math.PI * radius;
    var empty = amount == null;
    /* L'arc porte la part du canal dans le total de la période. Sans part
     * connue il reste vide — un anneau plein par défaut mentirait. */
    var dash = empty ? 0 : Math.max(0, Math.min(1, share)) * circumference;
    var pct = empty ? '—' : Math.round(share * 100) + ' %';
    return '<div class="vexel-ring-item' + (empty ? ' is-empty' : '') + '">' +
      '<svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true"><circle class="track" cx="55" cy="55" r="' + radius + '"/>' +
      '<circle class="value ' + tone + '" cx="55" cy="55" r="' + radius + '" data-dash="' + dash.toFixed(1) + '" stroke-dasharray="0 ' + circumference.toFixed(1) + '" transform="rotate(-90 55 55)"/>' +
      '<text x="55" y="57">' + esc(pct) + '</text></svg>' +
      (empty ? '' : '<strong>' + esc(serviceAmount(amount)) + '</strong>') + '<span>' + esc(label) + '</span>' +
      (empty ? '' : '<small>' + esc(caption) + '</small>') +
    '</div>';
  }

  function serviceGoals() {
    return el('section', 'vexel-goals-card', '<h2></h2><p data-vexel-service-sub></p><div class="vexel-rings"></div>');
  }

  function renderServiceGoals(range) {
    var card = document.querySelector('.vexel-goals-card');
    if (!card) return;
    var l = lang();
    var copy = SERVICE_STR[l] || SERVICE_STR.fr;
    var clientCopy = CLIENT_STR[l] || CLIENT_STR.fr;
    var channels = currentChannels();
    var amounts = channelAmounts(channels);
    if (!Object.keys(amounts).length) amounts = demoChannelAmounts(channels);
    var hasAmounts = Object.keys(amounts).length > 0;
    var period = servicePeriodLabel(range, l);
    var total = channels.reduce(function (sum, channel) {
      return sum + (amounts[channel.id] > 0 ? amounts[channel.id] : 0);
    }, 0);

    /* Le rendu est relancé à chaque mutation du tableau de bord ; réécrire les
     * anneaux à l'identique casserait leur animation d'arc en boucle. */
    var signature = [l, range, total.toFixed(0), channels.map(function (c) { return c.id; }).join(',')].join('|');
    if (state.goalSignature === signature) return;
    state.goalSignature = signature;
    var reportLabel = { fr: 'Générer le rapport', en: 'Generate report', ar: 'إنشاء التقرير' };
    setText(document.querySelector('.vexel-report-btn span'), reportLabel[l]);
    setText(document.querySelector('[data-vexel-client-label]'), clientCopy.label);
    setText(document.querySelector('[data-vexel-client-caption]'), clientCopy.caption + period);
    setText(card.querySelector('h2'), copy.title);
    setText(card.querySelector('[data-vexel-service-sub]'), (hasAmounts ? copy.share : copy.unavailable) + ' · ' + period);
    /* Dégradé monochrome, du canal le plus fort au plus faible. L'ambre est la
     * couleur d'alerte du tableau de bord : l'employer ici ferait lire « à
     * emporter » comme un problème alors que c'est une part comme une autre. */
    var tones = ['t1', 't2', 't3', 't4'];
    /* Le ton suit le RANG, pas l'ordre du registre métier : sur une boutique
     * la livraison passe devant le retrait, et une rampe posée dans l'ordre de
     * déclaration donnerait le vert le plus pâle à la part la plus grosse. */
    var rank = channels.map(function (channel, index) { return index; }).sort(function (a, b) {
      return (amounts[channels[b].id] || 0) - (amounts[channels[a].id] || 0);
    });
    var toneFor = [];
    rank.forEach(function (channelIndex, position) { toneFor[channelIndex] = tones[Math.min(position, tones.length - 1)]; });
    var rings = channels.map(function (channel, index) {
      var amount = hasAmounts && amounts[channel.id] != null ? amounts[channel.id] : null;
      return ringMarkup(amount, total > 0 && amount != null ? amount / total : 0, channel.label, toneFor[index], 'MAD');
    });
    var ringHost = card.querySelector('.vexel-rings');
    ringHost.innerHTML = rings.join('');
    /* Un timer, pas un requestAnimationFrame : un onglet en arrière-plan n'en
     * exécute aucun, et la signature interne empêche un second rendu — les
     * anneaux resteraient vides jusqu'au prochain changement de plage. */
    ringHost.querySelectorAll('.value[data-dash]').forEach(function (arc, index) {
      setTimeout(function () {
        arc.setAttribute('stroke-dasharray', arc.dataset.dash + ' ' + (2 * Math.PI * 48).toFixed(1));
      }, 60 + index * 110);
    });

    /* Every ring empty means the card is 342px of paper showing three dashes —
     * on a boutique that is exactly the dead real estate this pass is removing.
     * Reserve the space only when there is something to put in it. */
    var allEmpty = !channels.length || rings.every(function (markup) {
      return markup.indexOf('is-empty') >= 0;
    });
    card.hidden = allEmpty;
    if (allEmpty) {
      card.setAttribute('aria-hidden', 'true');
      /* Tell the dead-cell pass this seat was vacated, not merely absent — it
       * only re-grids rows that lost something. */
      card.setAttribute('data-vexel-vacated', '');
    } else {
      card.removeAttribute('aria-hidden');
      card.removeAttribute('data-vexel-vacated');
    }
    scheduleBackfill(true);
  }

  function updateGoalRangeLabel(range) {
    var target = document.querySelector('[data-vexel-goal-label]');
    if (!target) return;

    if (range === 'aujourdhui') {
      setText(target, 'Objectif du jour');
      return;
    }
    if (range === 'hier') {
      setText(target, "Objectif d'hier");
      return;
    }
    if (range === 'personnalise') {
      setText(target, 'Objectif · période');
      return;
    }

    /* The selector is dateRange.js's rendered source of truth.  Prefer the
     * range's own pill copy ("7 jours", "30 jours"), then its headline for
     * ranges that do not have a compact pill. */
    var ownLabel = document.querySelector('.dr-pill[data-range="' + range + '"]');
    var text = ownLabel ? ownLabel.textContent : '';
    if (!text) {
      var headline = document.querySelector('[data-dr-label]');
      text = headline ? headline.textContent : '';
    }
    text = String(text || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr-FR');
    setText(target, text ? 'Objectif · ' + text : '');
  }

  function bindRangeLabel() {
    var api = window.KiwiDateRange;
    if (!api || typeof api.subscribe !== 'function' || typeof api.getDateRange !== 'function') {
      setText(document.querySelector('[data-vexel-goal-label]'), '');
      return;
    }
    var update = function (range) {
      updateGoalRangeLabel(range);
      renderServiceGoals(range);
      applyVenueRelevance();
    };
    update(api.getDateRange());
    state.rangeUnsubscribe = api.subscribe(update);
    if (window.KiwiVenue && typeof window.KiwiVenue.subscribe === 'function') {
      state.venueUnsubscribe = window.KiwiVenue.subscribe(function () {
        update(api.getDateRange());
      });
    }
    state.langHandler = function () { update(api.getDateRange()); };
    window.addEventListener('kiwi:langchange', state.langHandler);
  }

  function createLayout() {
    var standard = document.querySelector('#kw-main > .container .dash-standard');
    var header = document.querySelector('#kw-main > .container > .dash-date-range');
    var pageHead = document.querySelector('#kw-main > .container > .page-head');
    var kpis = standard && standard.querySelector('[data-kpi-band]');
    var kpiHead = standard && standard.querySelector('.kpi-band-head');
    var paymentLink = pageHead && pageHead.querySelector('[data-action="payment-link"]');
    var hero = standard && standard.querySelector('.hero-today');
    var mix = standard && standard.querySelector('[data-mix-block]');
    var dateControl = header && header.querySelector('.dr-control');
    var topbarInner = document.querySelector('.topbar > .topbar-inner');
    if (!standard || !header || !kpis || !hero || !mix) return false;

    var root = el('div', 'vexel-compose');
    var kpiSection = el('section', 'vexel-kpi-section');
    var revenue = el('div', 'vexel-revenue-row');
    var bottom = el('div', 'vexel-bottom-row');
    var utilities = el('div', 'vexel-utilities');

    standard.insertBefore(root, standard.firstChild);
    state.root = root;

    rememberMove(header, root);
    rememberMove(dateControl, header);
    header.appendChild(reportButton());

    root.appendChild(kpiSection);
    rememberMove(kpiHead, kpiSection);
    rememberMove(paymentLink, kpiHead);
    rememberMove(kpis, kpiSection);

    root.appendChild(revenue);
    conceal(hero.querySelector('.hero-right'));
    rememberMove(hero, revenue);
    hero.appendChild(revenueLegend());
    revenue.appendChild(goalRail());

    root.appendChild(bottom);
    bottom.appendChild(serviceGoals());
    rememberMove(mix, bottom);

    root.appendChild(utilities);
    rememberMove(pageHead, utilities);

    var profile = topbarMerchant();
    if (profile && topbarInner) topbarInner.appendChild(profile);

    state.active = true;
    bindRangeLabel();
    return true;
  }

  function splitDelta(card) {
    var source = card.querySelector(':scope > .d');
    if (!source) return;
    var baseline = card.querySelector('.vexel-kpi-baseline');
    if (baseline) return;

    var text = (source.textContent || '').replace(/\s+/g, ' ').trim();
    var match = text.match(/^([^\s]+(?:\s*%)?|—)(?:\s+(.*))?$/);
    var delta = match ? match[1] : text;
    var comparison = match && match[2] ? match[2] : '';

    baseline = el('div', 'vexel-kpi-baseline');
    var value = card.querySelector(':scope > .v');
    source._vexelOriginalHTML = source.innerHTML;
    source._vexelOriginalClass = source.className;
    source.classList.add('vexel-kpi-delta');
    setText(source, delta);
    if (value) baseline.appendChild(value);
    baseline.appendChild(source);
    card.insertBefore(baseline, card.querySelector(':scope > .sp'));

    var compareNode = el('div', 'vexel-kpi-comparison');
    setText(compareNode, comparison || 'par rapport à la période précédente');
    card.insertBefore(compareNode, card.querySelector(':scope > .sp'));
  }

  function cleanDecorations() {
    document.querySelectorAll('[data-kpi-band] .vexel-kpi-baseline').forEach(function (baseline) {
      var card = baseline.closest('.kpi-m');
      var value = baseline.querySelector(':scope > .v');
      var source = baseline.querySelector(':scope > .vexel-kpi-delta');
      if (card && value) card.insertBefore(value, baseline);
      if (card && source) {
        card.insertBefore(source, baseline);
        if (source._vexelOriginalHTML != null) source.innerHTML = source._vexelOriginalHTML;
        if (source._vexelOriginalClass != null) source.className = source._vexelOriginalClass;
      }
      baseline.remove();
    });
    document.querySelectorAll('[data-kpi-band] .vexel-kpi-comparison').forEach(function (node) { node.remove(); });
    document.querySelectorAll('.vexel-report-btn, .vexel-revenue-legend, .vexel-topbar-merchant').forEach(function (node) { node.remove(); });
  }

  function numberFrom(text) {
    var cleaned = String(text || '').replace(/[^0-9,.-]/g, '').replace(',', '.');
    var value = parseFloat(cleaned);
    return Number.isFinite(value) ? value : 0;
  }

  /* Customer growth has two measured values: the selected period and the
   * previous equal period encoded by its delta. The old sparkline drew nine
   * decorative bends that were not backed by nine observations. Plot exactly
   * the two values Kiwi knows, with a monotonic curve and a zero-based scale,
   * so the direction and amplitude agree with the number printed below it. */
  /* Une capsule pleine a X %, et non une courbe.
   *
   * Ce graphique n'a jamais eu qu'UN point reel. Il reconstituait le
   * « precedent » en divisant la valeur affichee par (1 + delta / 100), puis
   * tracait une spline lissee entre les deux. La courbe montante qu'on voyait
   * n'etait donc pas un historique : c'etait le meme chiffre, dessine deux fois
   * et relie a lui-meme. Aucune serie jour par jour n'existe pour cet
   * indicateur, ni en demo ni en reel -- `sales` n'a pas de client rattache
   * (schema.sql), donc personne ne peut dire combien de clients sont passes
   * mardi dernier.
   *
   * Ce que la donnee dit vraiment, c'est une PART : tant de clients deja venus
   * sur tant de clients vus. C'est donc une part qu'on dessine. Le contour
   * (.line) porte le total, le remplissage (.fill) la portion fidele. Quand le
   * livre client est vide, le contour reste seul : la forme est connue, le
   * chiffre ne l'est pas. */
  function clientCapsule(a, b, top, bottom) {
    var r = Math.min((bottom - top) / 2, (b - a) / 2);
    if (!(r > 0)) return '';
    return 'M' + (a + r).toFixed(2) + ' ' + top +
      ' L' + (b - r).toFixed(2) + ' ' + top +
      ' A' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 0 1 ' + (b - r).toFixed(2) + ' ' + bottom +
      ' L' + (a + r).toFixed(2) + ' ' + bottom +
      ' A' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 0 1 ' + (a + r).toFixed(2) + ' ' + top + ' Z';
  }

  function renderClientChart(currentText) {
    var line = document.querySelector('[data-vexel-client-line]');
    var fill = document.querySelector('[data-vexel-client-fill]');
    var start = document.querySelector('[data-vexel-client-start]');
    var end = document.querySelector('[data-vexel-client-end]');
    var title = document.querySelector('[data-vexel-client-chart-title]');
    if (!line || !fill) return;

    // Les pastilles de debut / fin appartenaient a la courbe. `hidden` ne fait
    // rien sur un noeud SVG (ce n'est pas un HTMLElement), d'ou le style.
    if (start) start.style.display = 'none';
    if (end) end.style.display = 'none';

    var top = 14, bottom = 62, x0 = 2, x1 = 338;
    var parts = String(currentText || '').split('/');
    var current = /\d/.test(parts[0] || '') ? Math.max(0, numberFrom(parts[0])) : NaN;
    var total = parts.length > 1 && /\d/.test(parts[1]) ? Math.max(0, numberFrom(parts[1])) : NaN;
    var known = Number.isFinite(current) && Number.isFinite(total) && total > 0;

    line.setAttribute('d', clientCapsule(x0, x1, top, bottom));
    if (!known) {
      fill.setAttribute('d', '');
      setText(title, '');
      return;
    }

    var share = Math.min(1, current / total);
    fill.setAttribute('d', clientCapsule(x0, x0 + share * (x1 - x0), top, bottom));
    line.dataset.share = (share * 100).toFixed(1);

    var l = lang();
    var pct = Math.round(share * 100) + ' %';
    setText(title, l === 'en' ? Math.round(current) + ' of ' + Math.round(total) + ' customers seen had come before · ' + pct
      : l === 'ar' ? Math.round(current) + ' من ' + Math.round(total) + ' من العملاء سبق أن زاروا · ' + pct
      : Math.round(current) + ' clients déjà venus sur ' + Math.round(total) + ' clients vus · ' + pct);
  }

  function refresh() {
    state.raf = 0;
    if (!state.active || !document.body.classList.contains(CLASS)) return;

    document.querySelectorAll('.vexel-compose [data-kpi-band] .kpi-m').forEach(splitDelta);

    /* Les anneaux se déduisent du total de la période, qui n'est écrit qu'après
     * le changement de plage — d'où une seconde passe ici. La signature interne
     * absorbe les appels qui ne changent rien. */
    try {
      var api = window.KiwiDateRange;
      if (api && typeof api.getDateRange === 'function') renderServiceGoals(api.getDateRange());
    } catch (_) {}

    var amountSource = document.querySelector('[data-hero-amount]');
    var goalLabel = document.querySelector('[data-goal-label]');
    var goalPct = document.querySelector('[data-goal-pct]');
    var goalFill = document.querySelector('[data-goal-fill]');
    var currentTarget = document.querySelector('[data-vexel-goal-current]');
    var targetTarget = document.querySelector('[data-vexel-goal-target]');
    var pctTarget = document.querySelector('[data-vexel-goal-pct]');
    var fillTarget = document.querySelector('[data-vexel-goal-fill]');
    var restTarget = document.querySelector('[data-vexel-goal-rest]');
    var amountText = amountSource ? amountSource.textContent.replace(/MAD/i, '').trim() : '—';
    var targetText = goalLabel ? goalLabel.textContent.split('·').pop().trim() : '';
    var pctText = goalPct ? goalPct.textContent.trim() : '—';
    setText(currentTarget, amountText);
    setText(targetTarget, targetText ? '/ ' + targetText : '');
    setText(pctTarget, pctText + ' atteint');
    if (fillTarget) {
      var width = goalFill ? goalFill.style.width : pctText;
      if (fillTarget.style.width !== width) fillTarget.style.width = width;
    }
    if (restTarget) {
      var remaining = Math.max(0, numberFrom(targetText) - numberFrom(amountText));
      setText(restTarget, remaining ? 'Reste ' + Math.round(remaining).toLocaleString('fr-FR') + ' MAD' : '');
    }

    var clientCard = document.querySelector('[data-kpi="regulars"], [data-kpi="clients"]');
    var clientValue = document.querySelector('[data-vexel-client-value]');
    var clientDelta = document.querySelector('[data-vexel-client-delta]');
    var clientText = clientCard ? (clientCard.querySelector('.v') || {}).textContent || '—' : '—';
    var clientDeltaText = clientCard ? (clientCard.querySelector('.vexel-kpi-delta, :scope > .d') || {}).textContent || '' : '';
    setText(clientValue, String(clientText).replace(/\s*\/\s*/g, '/').trim());
    setText(clientDelta, clientDeltaText);
    renderClientChart(clientText);
  }

  function scheduleRefresh() {
    if (!state.raf) state.raf = requestAnimationFrame(refresh);
  }

  function enable() {
    if (state.active || !createLayout()) return;
    state.observer = new MutationObserver(scheduleRefresh);
    state.observer.observe(document.querySelector('.dash-standard'), {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['style', 'class']
    });
    scheduleRefresh();
  }

  function disable() {
    if (!state.active) return;
    if (state.observer) state.observer.disconnect();
    state.observer = null;
    if (state.rangeUnsubscribe) state.rangeUnsubscribe();
    state.rangeUnsubscribe = null;
    if (state.venueUnsubscribe) state.venueUnsubscribe();
    state.venueUnsubscribe = null;
    if (state.langHandler) window.removeEventListener('kiwi:langchange', state.langHandler);
    state.langHandler = null;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.goalSignature = '';

    cleanDecorations();
    restoreConcealed();
    /* Before restoreMoves(), so promoted cards go home to "Plus d'analyses"
     * rather than travelling with whatever container the adapter unwinds. */
    restoreBackfill();
    restorePins();
    ungate();
    syncMoreCount();
    restoreMoves();
    if (state.root) state.root.remove();
    state.root = null;
    state.active = false;
  }

  function sync() {
    if (document.body.classList.contains(CLASS)) enable();
    else disable();
  }

  function init() {
    sync();
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
