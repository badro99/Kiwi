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
    rangeUnsubscribe: null, langHandler: null, raf: 0
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
    try { raw = localStorage.getItem('kiwiBizType') || ''; } catch (_) {}
    if (!raw) {
      try {
        var data = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData();
        raw = data && (data.subtype || data.type) || '';
      } catch (_) {}
    }
    if (!raw) {
      try { raw = window.KiwiVenue && window.KiwiVenue.getVenueType && window.KiwiVenue.getVenueType() || ''; } catch (_) {}
    }
    return raw || 'autre';
  }

  function currentChannels() {
    var registry = window.KiwiTrades;
    return registry && registry.channels ? registry.channels(activeTrade()) : [];
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
    card.querySelector('.vexel-rings').innerHTML = channels.map(function (channel, index) {
      return ringMarkup(hasAmounts && amounts[channel.id] != null ? amounts[channel.id] : null, channel.label, tones[index % tones.length], copy);
    }).join('');
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
    };
    update(api.getDateRange());
    state.rangeUnsubscribe = api.subscribe(update);
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
    if (state.langHandler) window.removeEventListener('kiwi:langchange', state.langHandler);
    state.langHandler = null;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;

    cleanDecorations();
    restoreConcealed();
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
