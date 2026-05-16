/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Multi-venue state + sidebar dropdown + dynamic vertical section
 *
 * The merchant account contains 3 venues across 3 verticals
 * (restaurant, boutique, spa). Switching the venue swaps:
 *   - the sidebar's mid section ("Restauration" → "Boutique" / "Espace bien-être")
 *   - the dashboard's data (via dateRange.js subscribing to KiwiVenue changes)
 *   - the header sub-line, demo bar account, footer ICE, sidebar counts
 *   - the KPI band keys + labels (Pourboires hidden for boutique, etc.)
 *
 * The default selected venue on first paint is `cafeAtlas`.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const STORAGE_KEY = 'kiwiVenue';
  const DEFAULT_VENUE = 'cafeAtlas';
  const VALID = ['cafeAtlas', 'maisonMansour', 'spaBahia'];
  const subscribers = new Set();
  let currentVenue = DEFAULT_VENUE;
  let dropdownOpen = false;

  /* ═══════════════ VENUES REGISTRY ═══════════════ */

  const VENUES = {
    cafeAtlas: {
      id: 'cafeAtlas',
      name: 'Café Atlas',
      location: 'Maarif',
      fullDisplay: 'Café Atlas · Maarif',
      type: 'restaurant',
      typeLabel: 'Restaurant',
      siblings: '2 autres emplacements · Casa / Marrakech',
      status: 'En service',
      ice: '0025938400014',
      txCount: 182,
      staffCount: 8,
    },
    maisonMansour: {
      id: 'maisonMansour',
      name: 'Maison Mansour',
      location: 'Gueliz',
      fullDisplay: 'Maison Mansour · Gueliz',
      type: 'boutique',
      typeLabel: 'Boutique',
      siblings: '2 autres emplacements · Casa / Marrakech',
      status: 'En service',
      ice: '0028471900033',
      txCount: 42,
      staffCount: 3,
    },
    spaBahia: {
      id: 'spaBahia',
      name: 'Spa Bahia',
      location: 'Hivernage',
      fullDisplay: 'Spa Bahia · Hivernage',
      type: 'spa',
      typeLabel: 'Spa',
      siblings: '2 autres emplacements · Casa / Marrakech',
      status: 'En service',
      ice: '0029502800027',
      txCount: 20,
      staffCount: 3,
    },
  };

  /* ═══════════════ VERTICAL → SIDEBAR SECTION ═══════════════ */

  // Inline SVGs match the existing sidebar's rendering style (24x24 viewBox, stroke 2)
  const ICONS = {
    // restaurant
    tables: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    kds: '<path d="M5 12h14M12 5v14"/>',
    stock: '<path d="M3 6h18M6 10h12M9 14h6"/>',
    // boutique
    inventory: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a4 4 0 018 0v2"/>',
    categories: '<path d="M3 6h7l2 2h9v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"/>',
    promos: '<circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="15" r="1.5"/><path d="M5 19L19 5"/>',
    returns: '<path d="M3 12a9 9 0 119 9 9 9 0 01-6.36-2.64L3 21l.36-2.64"/><path d="M3 12h6M3 21v-6"/>',
    // spa
    appointments: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    services: '<path d="M12 2l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z"/>',
    practitioners: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/><path d="M16 11l2 2 4-4"/>',
    clients: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 14h6M9 18h6M9 10h2"/>',
  };

  const VERTICAL_SECTIONS = {
    restaurant: {
      header: 'Restauration',
      i18nHeader: 'sidebar.section.restaurant',
      items: [
        { nav: 'tables', label: 'Tables & additions',   i18n: 'sidebar.restaurant.tables', tag: 'LIVE', icon: ICONS.tables },
        { nav: 'menu',   label: 'Menu & modificateurs', i18n: 'sidebar.restaurant.menu',                icon: ICONS.menu },
        { nav: 'kds',    label: 'Écran cuisine (KDS)',  i18n: 'sidebar.restaurant.kds',                 icon: ICONS.kds },
        { nav: 'stock',  label: 'Stock ingrédients',    i18n: 'sidebar.restaurant.stock',               icon: ICONS.stock },
      ],
    },
    boutique: {
      header: 'Boutique',
      i18nHeader: 'sidebar.section.boutique',
      items: [
        { nav: 'inventory',  label: 'Inventaire produits', i18n: 'sidebar.boutique.inventory',  tag: 'LIVE', icon: ICONS.inventory },
        { nav: 'categories', label: 'Catégories',          i18n: 'sidebar.boutique.categories',              icon: ICONS.categories },
        { nav: 'promos',     label: 'Promotions & offres', i18n: 'sidebar.boutique.promos',                  icon: ICONS.promos },
        { nav: 'returns',    label: 'Retours & échanges',  i18n: 'sidebar.boutique.returns',                 icon: ICONS.returns },
      ],
    },
    spa: {
      header: 'Espace bien-être',
      i18nHeader: 'sidebar.section.spa',
      items: [
        { nav: 'appointments',  label: 'Calendrier rendez-vous', i18n: 'sidebar.spa.appointments',  tag: 'LIVE', icon: ICONS.appointments },
        { nav: 'services',      label: 'Services & forfaits',    i18n: 'sidebar.spa.services',                   icon: ICONS.services },
        { nav: 'practitioners', label: 'Praticien·ne·s',         i18n: 'sidebar.spa.practitioners',              icon: ICONS.practitioners },
        { nav: 'clients',       label: 'Fiches clients',         i18n: 'sidebar.spa.clients',                    icon: ICONS.clients },
      ],
    },
  };

  /* ═══════════════ VERTICAL → KPI BAND SPEC ═══════════════
   * Drives renderKpiBand() in dateRange.js. Each entry lists which 6 KPI keys
   * to surface for that vertical, plus the i18n label key. Keep at 6 tiles.
   * Sparkline shape per key is owned by dateRange.js. */
  const KPI_BY_TYPE = {
    restaurant: [
      { key: 'tx',         label: 'Transactions',      i18n: 'dash.kpi.tx' },
      { key: 'panier',     label: 'Panier moyen',      i18n: 'dash.kpi.basket' },
      { key: 'tips',       label: 'Pourboires',        i18n: 'dash.kpi.tips' },
      { key: 'success',    label: 'Taux succès',       i18n: 'dash.kpi.success' },
      { key: 'ratio',      label: 'Ratio card / cash', i18n: 'dash.kpi.ratio' },
      { key: 'regulars',   label: 'Clients réguliers', i18n: 'dash.kpi.regular' },
    ],
    boutique: [
      { key: 'tx',         label: 'Transactions',      i18n: 'dash.kpi.tx' },
      { key: 'panier',     label: 'Panier moyen',      i18n: 'dash.kpi.basket' },
      { key: 'tauxRetour', label: 'Taux retour',       i18n: 'dash.kpi.returnRate' },
      { key: 'success',    label: 'Taux succès',       i18n: 'dash.kpi.success' },
      { key: 'ratio',      label: 'Ratio card / cash', i18n: 'dash.kpi.ratio' },
      { key: 'regulars',   label: 'Clients fidèles',   i18n: 'dash.kpi.loyalCustomers' },
    ],
    spa: [
      { key: 'tx',         label: 'Rendez-vous',       i18n: 'dash.kpi.appointments' },
      { key: 'panier',     label: 'Panier moyen',      i18n: 'dash.kpi.basket' },
      { key: 'tips',       label: 'Pourboires',        i18n: 'dash.kpi.tips' },
      { key: 'success',    label: 'Taux remplissage',  i18n: 'dash.kpi.fillRate' },
      { key: 'ratio',      label: 'Ratio card / cash', i18n: 'dash.kpi.ratio' },
      { key: 'regulars',   label: 'Clients fidèles',   i18n: 'dash.kpi.loyalCustomers' },
    ],
  };

  /* ═══════════════ HEADER + DEMO BAR + FOOTER PER VENUE ═══════════════ */

  const HEADER_SUB = {
    fr: { cafeAtlas: 'Service midi en cours', maisonMansour: 'Boutique ouverte · 10h–20h', spaBahia: 'Espace ouvert · réservations en cours' },
    en: { cafeAtlas: 'Lunch service in progress', maisonMansour: 'Boutique open · 10am–8pm', spaBahia: 'Spa open · bookings in progress' },
    ar: { cafeAtlas: 'خدمة الغداء جارية', maisonMansour: 'البوتيك مفتوح · 10ص–8م', spaBahia: 'الفضاء مفتوح · الحجوزات جارية' },
  };

  const HERO_AI_REC = {
    cafeAtlas: {
      title: 'Votre heure creuse de 15h-17h représente un potentiel inexploité',
      obs: "Entre 15h et 17h, vous réalisez seulement 8% de votre chiffre d'affaires quotidien. Pourtant, c'est l'heure où vos clients restent le plus longtemps assis (temps moyen : 47 minutes, contre 31 minutes au déjeuner).",
      act: '→ Proposer un menu « goûter » avec thé à la menthe et msemen à prix réduit pourrait augmenter la rotation des tables de 20-30%.',
    },
    maisonMansour: {
      title: 'Vos clients touristes dépensent en moyenne +35 % par panier',
      obs: 'Les paniers réglés sur cartes étrangères (38 % des transactions) atteignent en moyenne 380 MAD, contre 282 MAD sur les cartes marocaines. Les acheteurs allemands et espagnols sont sur-représentés.',
      act: '→ Activer un catalogue PDF en anglais sur le terminal Kiwi et un onglet « Tax-free » pourrait lifter le panier moyen de 6-9 %.',
    },
    spaBahia: {
      title: 'Le créneau 14h-15h du mardi est sous-utilisé (38 % rempli)',
      obs: 'Sur les 4 dernières semaines, ce créneau affiche un taux de remplissage de 38 % seulement, contre 87 % en moyenne sur la semaine. Vos clientes fidèles n\'y sont jamais venues.',
      act: '→ Pousser un message WhatsApp aux 47 clients fidèles avec une offre « -20 % mardi 14h-15h » pourrait combler 4-6 créneaux/semaine.',
    },
  };

  const HEATMAP_AI_REC = {
    cafeAtlas: {
      title: 'Lancer un combo livraison Glovo pour 15h–17h',
      obs: "Pendant cette fenêtre creuse, votre salle tourne à 22 % de capacité mais l'équipe reste disponible. Un combo Tajine kefta + thé à la menthe à 75 MAD sur Glovo capte typiquement 8–12 commandes par après-midi dans les cafés similaires de Maarif.",
      cta: '→ Configurer le combo Glovo',
    },
    maisonMansour: {
      title: 'Programmer un push Instagram Shopping pour 14h–16h',
      obs: "L'après-midi (14h–16h) ne représente que 11 % de vos ventes alors que vos posts Instagram captent 64 % de leur engagement à ces heures. Lancer un carousel « Caftans · pièces uniques » avec lien d'achat direct pourrait convertir.",
      cta: '→ Programmer la campagne Instagram',
    },
    spaBahia: {
      title: 'Campagne WhatsApp pour combler les créneaux 14h–16h',
      obs: 'Sur les 4 dernières semaines, 11 créneaux/semaine restent vacants l\'après-midi (14h–16h). Vos 47 clientes fidèles ont un taux d\'ouverture WhatsApp de 92 %.',
      cta: '→ Lancer la campagne WhatsApp',
    },
  };

  /* Mix de paiement bottom callout — savings vs CMI scales with revenue */
  const MIX_CMI_SAVINGS = {
    cafeAtlas:     '~3 900 MAD ce mois',
    maisonMansour: '~1 700 MAD ce mois',
    spaBahia:     '~1 350 MAD ce mois',
  };

  /* Vous vs … benchmark labels */
  const BENCH_LABELS = {
    cafeAtlas:     { title: 'Vous vs cafés similaires',     sub: '147 cafés casablancais · même gamme de ticket moyen' },
    maisonMansour: { title: 'Vous vs boutiques similaires', sub: '89 boutiques marocaines · gamme premium' },
    spaBahia:     { title: 'Vous vs spas similaires',      sub: '42 spas haut de gamme · Casa / Marrakech' },
  };

  /* ═══════════════ STATE ═══════════════ */

  const getVenue = () => currentVenue;
  const getVenueData = id => VENUES[id] || VENUES[currentVenue];
  const getCurrentVenueData = () => VENUES[currentVenue];
  const getVenueType = id => (VENUES[id] || VENUES[currentVenue])?.type;

  function setVenue(id) {
    if (!VALID.includes(id)) return;
    if (id === currentVenue) return;
    currentVenue = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
    renderAll();
    subscribers.forEach(fn => { try { fn(id); } catch (_) {} });
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  /* ═══════════════ RENDER: SIDEBAR LOC-SWITCH (top of sidebar) ═══════════════ */

  function renderLocSwitch() {
    const v = VENUES[currentVenue];
    const nameEl = document.querySelector('[data-loc-name]');
    const metaEl = document.querySelector('[data-loc-meta]');
    if (nameEl) nameEl.textContent = v.fullDisplay;
    if (metaEl) metaEl.textContent = v.siblings;
    // Chevron rotation tied to dropdownOpen handled in toggleDropdown()
  }

  /* ═══════════════ RENDER: SIDEBAR DROPDOWN ═══════════════ */

  // Type-icon SVG used inside each dropdown row
  const TYPE_ICONS = {
    restaurant: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h2v11M11 2v20M11 11h8a3 3 0 003-3V4M19 4v17"/></svg>',
    boutique:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a4 4 0 018 0v2"/></svg>',
    spa:        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z"/></svg>',
  };

  function renderDropdown() {
    const wrap = document.querySelector('[data-venue-dropdown]');
    if (!wrap) return;
    wrap.innerHTML = VALID.map(id => {
      const v = VENUES[id];
      const isActive = id === currentVenue;
      return `
        <button type="button" class="venue-row${isActive ? ' active' : ''}" data-action="venue-pick" data-venue="${id}">
          <div class="venue-row-icon">${TYPE_ICONS[v.type] || TYPE_ICONS.restaurant}</div>
          <div class="venue-row-body">
            <div class="venue-row-name">${v.name} · ${v.location}</div>
            <div class="venue-row-type">${v.typeLabel}</div>
          </div>
          <div class="venue-row-status" aria-label="${v.status}"><i></i></div>
        </button>
      `;
    }).join('');
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
    applyDropdownState();
  }
  function closeDropdown() {
    if (!dropdownOpen) return;
    dropdownOpen = false;
    applyDropdownState();
  }
  function applyDropdownState() {
    const dd = document.querySelector('[data-venue-dropdown]');
    const sw = document.querySelector('.loc-switch');
    if (dd) dd.classList.toggle('open', dropdownOpen);
    if (sw) sw.classList.toggle('open', dropdownOpen);
  }

  /* Click-outside + Escape closers (registered once) */
  function setupDropdownClosers() {
    document.addEventListener('click', (e) => {
      if (!dropdownOpen) return;
      const inside = e.target.closest('.loc-switch, [data-venue-dropdown]');
      if (!inside) closeDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdownOpen) closeDropdown();
    });
  }

  /* ═══════════════ RENDER: SIDEBAR VERTICAL SECTION ═══════════════ */

  function renderVerticalSection(opts = {}) {
    const wrap = document.querySelector('[data-vertical-section]');
    if (!wrap) return;
    const v = VENUES[currentVenue];
    const sect = VERTICAL_SECTIONS[v.type];
    if (!sect) return;

    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const T = window.KiwiI18n?.T?.[lang] || {};
    const headerTxt = T[sect.i18nHeader] || sect.header;

    const html = `
      <div class="sect" data-i18n="${sect.i18nHeader}">${headerTxt}</div>
      ${sect.items.map(it => {
        const lbl = T[it.i18n] || it.label;
        return `
          <a href="#" data-nav="${it.nav}" data-i18n-attr="aria-label:${it.i18n}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${it.icon}</svg>
            <span data-i18n="${it.i18n}">${lbl}</span>
            ${it.tag ? `<span class="tag">${it.tag}</span>` : ''}
          </a>
        `;
      }).join('')}
    `;

    if (opts.skipFade) {
      wrap.innerHTML = html;
      return;
    }
    // 150ms fade-out → swap → fade-in
    wrap.classList.add('vert-fading');
    setTimeout(() => {
      wrap.innerHTML = html;
      // Force reflow then re-trigger the fade-in
      // eslint-disable-next-line no-unused-expressions
      wrap.offsetHeight;
      wrap.classList.remove('vert-fading');
    }, 150);
  }

  /* ═══════════════ RENDER: HEADER SUB-LINE ═══════════════ */

  function renderHeaderSub() {
    const sub = document.querySelector('[data-header-sub]');
    if (!sub) return;
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    sub.textContent = HEADER_SUB[lang]?.[currentVenue] || HEADER_SUB.fr[currentVenue];
  }

  /* ═══════════════ RENDER: DEMO BAR + FOOTER ═══════════════ */

  function renderDemoBar() {
    const el = document.querySelector('[data-demo-account]');
    if (el) el.textContent = VENUES[currentVenue].name;
  }
  function renderFooter() {
    const el = document.querySelector('[data-footer-line]');
    if (!el) return;
    const v = VENUES[currentVenue];
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const T = window.KiwiI18n?.T?.[lang] || {};
    const sponsor = T['dash.footer.sponsor'] || 'opéré sous sponsoring Bank Al-Maghrib';
    const help = T['dash.footer.help'] || 'aide WhatsApp';
    el.innerHTML = `${v.name} · ICE ${v.ice} · ${sponsor} · Kiwi v2.38.1 · <a href="#">${help}</a>`;
  }

  /* ═══════════════ RENDER: SIDEBAR COUNTS ═══════════════ */

  function renderSidebarCounts() {
    const txCountEl = document.querySelector('a[data-nav="transactions"] .count');
    if (txCountEl) txCountEl.textContent = String(VENUES[currentVenue].txCount);
    const staffCountEl = document.querySelector('a[data-nav="equipe"] .count');
    if (staffCountEl) staffCountEl.textContent = String(VENUES[currentVenue].staffCount);
  }

  /* ═══════════════ ACTION HANDLERS ═══════════════ */

  function onVenueToggle() { toggleDropdown(); }
  function onVenuePick(el) {
    const id = el?.dataset?.venue;
    if (id && VALID.includes(id)) {
      setVenue(id);
      closeDropdown();
    }
  }

  function registerHandlers() {
    const tryReg = () => {
      if (window.Kiwi?.handlers) {
        window.Kiwi.handlers['venue-toggle'] = onVenueToggle;
        window.Kiwi.handlers['venue-pick'] = onVenuePick;
        // Override the legacy 'location-switch' handler so the old
        // Casa/Marrakech menu doesn't pop when the user clicks the venue tile.
        window.Kiwi.handlers['location-switch'] = onVenueToggle;
        return;
      }
      setTimeout(tryReg, 30);
    };
    tryReg();
  }

  /* ═══════════════ I18N HOOK — re-render lang-bound bits when lang changes ═══════════════ */

  function hookI18n() {
    const api = window.KiwiI18n;
    if (!api?.setLang || api.__venueWrapped) return;
    const orig = api.setLang;
    api.setLang = function () {
      const r = orig.apply(this, arguments);
      // Re-render the bits we own that have lang-dependent text
      renderHeaderSub();
      renderFooter();
      renderVerticalSection({ skipFade: true });
      renderDropdown();
      return r;
    };
    api.__venueWrapped = true;
  }

  /* ═══════════════ AGGREGATE RENDER ═══════════════ */

  function renderAll(opts = {}) {
    renderLocSwitch();
    renderDropdown();
    renderVerticalSection(opts);
    renderHeaderSub();
    renderDemoBar();
    renderFooter();
    renderSidebarCounts();
  }

  /* ═══════════════ INIT ═══════════════ */

  function init() {
    if (!/dashboard\.html/.test(location.pathname)) return;
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    currentVenue = VALID.includes(stored) ? stored : DEFAULT_VENUE;

    registerHandlers();
    setupDropdownClosers();
    hookI18n();
    renderAll({ skipFade: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ═══════════════ PUBLIC API ═══════════════ */

  window.KiwiVenue = {
    getVenue,
    setVenue,
    subscribe,
    getVenueData,
    getCurrentVenueData,
    getVenueType,
    getKpiSpec: type => KPI_BY_TYPE[type] || KPI_BY_TYPE.restaurant,
    getHeroAiRec: id => HERO_AI_REC[id || currentVenue] || HERO_AI_REC.cafeAtlas,
    getHeatmapAiRec: id => HEATMAP_AI_REC[id || currentVenue] || HEATMAP_AI_REC.cafeAtlas,
    getMixCmiSavings: id => MIX_CMI_SAVINGS[id || currentVenue] || MIX_CMI_SAVINGS.cafeAtlas,
    getBenchLabels: id => BENCH_LABELS[id || currentVenue] || BENCH_LABELS.cafeAtlas,
    VENUES,
    KPI_BY_TYPE,
  };
})();
