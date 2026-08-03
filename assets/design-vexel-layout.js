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
    rangeUnsubscribe: null, venueUnsubscribe: null, langHandler: null, raf: 0
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
        '<svg width="340" height="76" viewBox="0 0 340 76" preserveAspectRatio="none" aria-hidden="true">' +
          '<defs><linearGradient id="vexelClientFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00ffae" stop-opacity=".28"/><stop offset="1" stop-color="#00ffae" stop-opacity="0"/></linearGradient></defs>' +
          '<path class="fill" d="M0 58 C28 52 43 62 70 50 S112 38 137 45 S183 29 207 34 S250 17 278 24 S318 9 340 12 L340 76 L0 76 Z"/>' +
          '<path class="line" d="M0 58 C28 52 43 62 70 50 S112 38 137 45 S183 29 207 34 S250 17 278 24 S318 9 340 12"/>' +
          '<circle cx="338" cy="12" r="5"/>' +
        '</svg>' +
        '<div class="vexel-client-foot"><div><strong data-vexel-client-value>—</strong><span data-vexel-client-caption></span></div><b data-vexel-client-delta></b></div>' +
      '</section>';
    return rail;
  }

  var SERVICE_STR = {
    fr: { title: 'Objectifs par service', unavailable: 'Ventilation par canal indisponible', goalUnavailable: 'Objectif indisponible', noData: 'Donnée indisponible' },
    en: { title: 'Goals by service', unavailable: 'Channel breakdown unavailable', goalUnavailable: 'Goal unavailable', noData: 'Data unavailable' },
    ar: { title: 'الأهداف حسب الخدمة', unavailable: 'التوزيع حسب القناة غير متاح', goalUnavailable: 'الهدف غير متاح', noData: 'البيانات غير متاحة' }
  };
  var RANGE_STR = {
    fr: { aujourdhui: "Aujourd'hui", hier: 'Hier', septJours: '7 derniers jours', trenteJours: '30 derniers jours', moisDernier: 'Mois dernier', trimestre: 'Ce trimestre', annee: 'Cette année', personnalise: 'Période personnalisée' },
    en: { aujourdhui: 'Today', hier: 'Yesterday', septJours: 'Last 7 days', trenteJours: 'Last 30 days', moisDernier: 'Last month', trimestre: 'This quarter', annee: 'This year', personnalise: 'Custom period' },
    ar: { aujourdhui: 'اليوم', hier: 'أمس', septJours: 'آخر 7 أيام', trenteJours: 'آخر 30 يوما', moisDernier: 'الشهر الماضي', trimestre: 'هذا الربع', annee: 'هذه السنة', personnalise: 'فترة مخصصة' }
  };
  var CLIENT_STR = {
    fr: { label: 'Croissance clients', caption: 'Clients ce mois' },
    en: { label: 'Customer growth', caption: 'Customers this month' },
    ar: { label: 'نمو العملاء', caption: 'عملاء هذا الشهر' }
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

  function serviceAmount(value) {
    if (!(value >= 0)) return '—';
    var locale = lang() === 'en' ? 'en-GB' : 'fr-FR';
    return Math.round(value).toLocaleString(locale);
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

  function ringMarkup(amount, label, tone, copy) {
    var radius = 48;
    var circumference = 2 * Math.PI * radius;
    /* Aucun objectif par canal n'existe : l'anneau reste honnêtement vide. */
    var dash = '0';
    return '<div class="vexel-ring-item' + (amount == null ? ' is-empty' : '') + '">' +
      '<svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true"><circle class="track" cx="55" cy="55" r="' + radius + '"/>' +
      '<circle class="value ' + tone + '" cx="55" cy="55" r="' + radius + '" stroke-dasharray="' + dash + ' ' + circumference.toFixed(1) + '" transform="rotate(-90 55 55)"/>' +
      '<text x="55" y="57">—</text></svg>' +
      (amount == null ? '' : '<strong>' + esc(serviceAmount(amount)) + '</strong>') + '<span>' + esc(label) + '</span>' +
      (amount == null ? '' : '<small>MAD · ' + esc(copy.goalUnavailable) + '</small>') +
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
    var hasAmounts = Object.keys(amounts).length > 0;
    var period = servicePeriodLabel(range, l);
    var reportLabel = { fr: 'Générer le rapport', en: 'Generate report', ar: 'إنشاء التقرير' };
    setText(document.querySelector('.vexel-report-btn span'), reportLabel[l]);
    setText(document.querySelector('[data-vexel-client-label]'), clientCopy.label);
    setText(document.querySelector('[data-vexel-client-caption]'), clientCopy.caption);
    setText(card.querySelector('h2'), copy.title);
    setText(card.querySelector('[data-vexel-service-sub]'), (hasAmounts ? copy.goalUnavailable : copy.unavailable) + ' · ' + period);
    var tones = ['mint', 'deep', 'amber', 'deep'];
    var rings = channels.map(function (channel, index) {
      return ringMarkup(hasAmounts && amounts[channel.id] != null ? amounts[channel.id] : null, channel.label, tones[index % tones.length], copy);
    });
    card.querySelector('.vexel-rings').innerHTML = rings.join('');

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

  function refresh() {
    state.raf = 0;
    if (!state.active || !document.body.classList.contains(CLASS)) return;

    document.querySelectorAll('.vexel-compose [data-kpi-band] .kpi-m').forEach(splitDelta);

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
    setText(clientValue, String(clientText).replace(/\s*\/\s*/g, '/').trim());
    setText(clientDelta, clientCard ? (clientCard.querySelector('.vexel-kpi-delta, :scope > .d') || {}).textContent || '' : '');
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
