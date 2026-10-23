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
  // Real venues the merchant can switch between, plus the synthetic 'fusion'
  // venue that aggregates all three (multi-site view).
  const REAL_VENUES = ['cafeAtlas', 'maisonMansour', 'spaBahia'];
  const VALID = [...REAL_VENUES, 'fusion'];
  const subscribers = new Set();
  let currentVenue = DEFAULT_VENUE;
  let dropdownOpen = false;
  // Snapshot of the venue we came from before fusion was engaged, so the
  // "Revenir" affordance returns the merchant where they were.
  let preFusionVenue = DEFAULT_VENUE;
  let fusionAnimating = false;
  // Subscription plan — currently always 'ultra' for the demo account.
  // Drives the sidebar status card + Ultra identity markers (see
  // renderLocSwitch + fusionSidebarHtml below).
  const currentPlan = 'ultra';

  /* ═══════════════ VENUES REGISTRY ═══════════════ */

  const VENUES = {
    cafeAtlas: {
      id: 'cafeAtlas',
      name: 'Café Atlas',
      location: 'Maarif',
      fullDisplay: 'Café Atlas · Maarif',
      type: 'restaurant',
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
      siblings: '2 autres emplacements · Casa / Marrakech',
      status: 'En service',
      ice: '0029502800027',
      txCount: 20,
      staffCount: 3,
    },
    // Synthetic "fusion" venue — represents the merchant's full portfolio.
    // Numeric fields are sums; dateRange.js fans this out for every table.
    // The snapshot/venueBreakdown/kpis/intelligence/portfolioTrend/alerts
    // sub-objects below are consumed by renderFusionView() (defined later in
    // this file) to paint the dedicated <section class="dash-fusion"> layout.
    fusion: {
      id: 'fusion',
      name: 'Go Ultra',
      location: '3 emplacements',
      fullDisplay: 'Go Ultra · 3 emplacements',
      type: 'fusion',
      siblings: 'Café Atlas · Maison Mansour · Spa Bahia',
      status: 'En service',
      ice: 'multi-ICE',
      txCount: 244,           // 182 + 42 + 20
      staffCount: 14,         // 8 + 3 + 3

      // ── END-OF-DAY TARGETS (clock fallback for Aujourd'hui) ────────
      // Aujourd'hui values match the sum of individual venue TARGETS in
      // demoClock.js (cafeAtlas 31500 + maisonMansour 14000 + spaBahia
      // 10500 = 56000 raw → adjusted to 48282.78 to reflect realised
      // shrinkage by 02h close). Live view always reads the clock — these
      // values are only used as fallback if the clock is inactive.
      snapshot: {
        aujourdhui: {
          totalRevenue: 48282.78,
          netAfterKiwi: 40557.13,
          totalTransactions: 273,
          topVenueToday: 'Café Atlas',
          topVenueRevenue: 27512.50,
          deltaHier: 2.5,
          deltaSemaine: 17,
          deltaMois: 10,
          objectifJour: 55000,
        },
        hier: {
          totalRevenue: 45310.00,
          netAfterKiwi: 38060.00,
          totalTransactions: 251,
          topVenueToday: 'Café Atlas',
          topVenueRevenue: 25890.00,
          deltaHier: -1.2,
          deltaSemaine: 12,
          deltaMois: 8,
          objectifJour: 55000,
        },
        septJours: {
          totalRevenue: 334100.00,
          netAfterKiwi: 280500.00,
          totalTransactions: 1820,
          topVenueToday: 'Café Atlas',
          topVenueRevenue: 198400.00,
          deltaHier: null,
          deltaSemaine: 19,
          deltaMois: 11,
          objectifJour: null,
        },
        trenteJours: {
          totalRevenue: 1470200.00,
          netAfterKiwi: 1234900.00,
          totalTransactions: 7820,
          topVenueToday: 'Café Atlas',
          topVenueRevenue: 842300.00,
          deltaHier: null,
          deltaSemaine: null,
          deltaMois: 14,
          objectifJour: null,
        },
      },

      // ── PER-VENUE BREAKDOWN ────────────────────────────────────────
      // Aujourd'hui rows hold END-OF-DAY targets — live render overrides
      // revenue/share/spark-last-point from the clock per-tick.
      venueBreakdown: {
        aujourdhui: [
          { id: 'cafeAtlas',     name: 'Café Atlas',     location: 'Maarif',    type: 'restaurant', revenue: 27512.50, portfolioShare: 57.0, deltaVsHier: 3.2,  trend: [22100,23400,25100,24800,26200,25900,27512], status: 'en-service', signal: 'objectif-atteint', signalLabel: 'Objectif dépassé · +8 %' },
          { id: 'maisonMansour', name: 'Maison Mansour', location: 'Guéliz',    type: 'boutique',   revenue: 11820.00, portfolioShare: 24.5, deltaVsHier: -2.4, trend: [10200,11100,12400,11800,12100,12300,11820], status: 'en-service', signal: 'attention',        signalLabel: '−2,4 % vs hier' },
          { id: 'spaBahia',      name: 'Spa Bahia',      location: 'Hivernage', type: 'spa',        revenue: 8950.28,  portfolioShare: 18.5, deltaVsHier: 6.8,  trend: [7200,7800,8100,8400,8200,8600,8950],       status: 'en-service', signal: 'croissance',       signalLabel: 'Meilleure journée du mois ↑' },
        ],
        hier: [
          { id: 'cafeAtlas',     name: 'Café Atlas',     location: 'Maarif',    type: 'restaurant', revenue: 25890.00, portfolioShare: 57.1, deltaVsHier: -1.1, trend: [22100,23400,25100,24800,26200,25900,25890], status: 'en-service', signal: 'stable',     signalLabel: 'Stable · ±1 %' },
          { id: 'maisonMansour', name: 'Maison Mansour', location: 'Guéliz',    type: 'boutique',   revenue: 12110.00, portfolioShare: 26.7, deltaVsHier: 1.8,  trend: [10200,11100,12400,11800,12100,12300,12110], status: 'en-service', signal: 'croissance', signalLabel: '+1,8 % vs avant-hier' },
          { id: 'spaBahia',      name: 'Spa Bahia',      location: 'Hivernage', type: 'spa',        revenue: 8380.00,  portfolioShare: 18.5, deltaVsHier: -3.1, trend: [7200,7800,8100,8400,8200,8600,8380],       status: 'en-service', signal: 'attention',  signalLabel: '−3,1 % vs avant-hier' },
        ],
        septJours: [
          { id: 'cafeAtlas',     name: 'Café Atlas',     location: 'Maarif',    type: 'restaurant', revenue: 198400.00, portfolioShare: 59.4, deltaVsHier: null, trend: [168000,172000,181000,188000,192000,196000,198400], status: 'en-service', signal: 'objectif-atteint', signalLabel: 'Top performer' },
          { id: 'maisonMansour', name: 'Maison Mansour', location: 'Guéliz',    type: 'boutique',   revenue: 84800.00,  portfolioShare: 25.4, deltaVsHier: null, trend: [72000,75000,78000,80000,82000,83000,84800],         status: 'en-service', signal: 'stable',           signalLabel: 'Croissance régulière' },
          { id: 'spaBahia',      name: 'Spa Bahia',      location: 'Hivernage', type: 'spa',        revenue: 51200.00,  portfolioShare: 15.3, deltaVsHier: null, trend: [42000,44000,46000,47000,48000,50000,51200],         status: 'en-service', signal: 'croissance',       signalLabel: '+22 % vs semaine précédente' },
        ],
        trenteJours: [
          { id: 'cafeAtlas',     name: 'Café Atlas',     location: 'Maarif',    type: 'restaurant', revenue: 842300.00, portfolioShare: 57.3, deltaVsHier: null, trend: [700000,720000,750000,780000,800000,820000,842300], status: 'en-service', signal: 'stable',     signalLabel: '57 % du portefeuille' },
          { id: 'maisonMansour', name: 'Maison Mansour', location: 'Guéliz',    type: 'boutique',   revenue: 358200.00, portfolioShare: 24.4, deltaVsHier: null, trend: [290000,305000,318000,330000,340000,350000,358200], status: 'en-service', signal: 'croissance', signalLabel: '+12 % vs mois précédent' },
          { id: 'spaBahia',      name: 'Spa Bahia',      location: 'Hivernage', type: 'spa',        revenue: 269400.00, portfolioShare: 18.3, deltaVsHier: null, trend: [210000,222000,235000,245000,255000,263000,269400], status: 'en-service', signal: 'croissance', signalLabel: 'Croissance la plus rapide · +16 %' },
        ],
      },

      // ── PORTFOLIO KPI CARDS ────────────────────────────────────────
      kpis: {
        aujourdhui: {
          transactionsTotales: { value: 273,  delta: 13.7, label: 'Transactions totales' },
          panierMoyenPondere:  { value: 132,  unit: 'MAD', delta: 4.2,  label: 'Panier moyen pondéré' },
          margeBrute:          { value: 71.8, unit: '%',   delta: 1.6,  label: 'Marge brute moyenne' },
          tauxSuccesMoyen:     { value: 97.15, unit: '%',  delta: 1.2,  label: 'Taux succès moyen' },
          ratioCardCash:       { value: '68 / 32', unit: '%', delta: 3, label: 'Ratio card / cash' },
          clientsFideles:      { value: 23,   subValue: 90, delta: 18.7, label: 'Clients fidèles' },
        },
        hier: {
          transactionsTotales: { value: 251,  delta: -2.3, label: 'Transactions totales' },
          panierMoyenPondere:  { value: 128,  unit: 'MAD', delta: 1.8,  label: 'Panier moyen pondéré' },
          margeBrute:          { value: 70.4, unit: '%',   delta: 0.5,  label: 'Marge brute moyenne' },
          tauxSuccesMoyen:     { value: 96.80, unit: '%',  delta: 0.8,  label: 'Taux succès moyen' },
          ratioCardCash:       { value: '67 / 33', unit: '%', delta: 2, label: 'Ratio card / cash' },
          clientsFideles:      { value: 19,   subValue: 90, delta: 8.2,  label: 'Clients fidèles' },
        },
        septJours: {
          transactionsTotales: { value: 1820, delta: 18.4, label: 'Transactions totales' },
          panierMoyenPondere:  { value: 135,  unit: 'MAD', delta: 6.1,  label: 'Panier moyen pondéré' },
          margeBrute:          { value: 72.1, unit: '%',   delta: 2.0,  label: 'Marge brute moyenne' },
          tauxSuccesMoyen:     { value: 97.42, unit: '%',  delta: 1.5,  label: 'Taux succès moyen' },
          ratioCardCash:       { value: '69 / 31', unit: '%', delta: 4, label: 'Ratio card / cash' },
          clientsFideles:      { value: 142,  subValue: 312, delta: 22.4, label: 'Clients fidèles' },
        },
        trenteJours: {
          transactionsTotales: { value: 7820, delta: 21.2, label: 'Transactions totales' },
          panierMoyenPondere:  { value: 138,  unit: 'MAD', delta: 8.4,  label: 'Panier moyen pondéré' },
          margeBrute:          { value: 72.6, unit: '%',   delta: 2.8,  label: 'Marge brute moyenne' },
          tauxSuccesMoyen:     { value: 97.80, unit: '%',  delta: 2.1,  label: 'Taux succès moyen' },
          ratioCardCash:       { value: '70 / 30', unit: '%', delta: 5, label: 'Ratio card / cash' },
          clientsFideles:      { value: 312,  subValue: 312, delta: 28.6, label: 'Clients fidèles' },
        },
      },

      // ── CROSS-VENUE INTELLIGENCE ───────────────────────────────────
      intelligence: {
        crossVenueCustomers: 312,
        crossVenueRevenueShare: 28.4,
        topCrossVenuePair: 'Café Atlas × Spa Bahia',
        concentrationIndex: 57.3,
        concentrationRisk: 'modéré',
        aiInsights: [
          {
            title: 'Café Atlas génère 58 % du CA · concentration à diversifier',
            body: 'Sur les 30 derniers jours, Café Atlas (58 %) tire le portefeuille, devant Maison Mansour (24 %) et Spa Bahia (18 %). Les 3 sites partagent 312 clients communs, déjà fidèles à l\'écosystème, qu\'on peut activer en cross-sell.',
            action: 'Lancer une carte fidélité unifiée Kiwi pour les 312 clients cross-site pourrait lifter le CA global de 4–7 %.',
            type: 'warning',
          },
          {
            title: '312 clients fréquentent plusieurs emplacements',
            body: 'Ces clients cross-site dépensent en moyenne 2,4× plus que les clients mono-site. Le duo Café Atlas × Spa Bahia est la paire la plus fréquentée, 184 clients communs.',
            action: 'Un forfait "Déjeuner + Soin" couplant Café Atlas et Spa Bahia pourrait convertir 60+ clients mono-site en clients cross-site.',
            type: 'opportunity',
          },
          {
            title: 'Pic simultané 12h–14h sur 2 emplacements',
            body: 'Café Atlas et Spa Bahia atteignent leur pic de fréquentation en même temps. Votre attention managériale est divisée exactement au moment critique.',
            action: 'Décaler les ouvertures du spa de 30 min ou former un manager adjoint pour Café Atlas libérerait votre présence au pic.',
            type: 'operational',
          },
        ],
      },

      // ── PORTFOLIO TREND (30-day, static; consumed by Section 4 Mode B) ──
      portfolioTrend: {
        labels: ['25/03','27/03','29/03','31/03','02/04','04/04','06/04','08/04','10/04','12/04','14/04','16/04','18/04','20/04','22/04','24/04','26/04','28/04','30/04','02/05','04/05','06/05','08/05','10/05','12/05','14/05'],
        cafeAtlas:     [24100,25200,23800,26100,25400,27200,26800,28100,27400,29200,28600,30100,29400,31200,30600,32100,31400,33200,32600,34100,33400,35200,34600,36100,35400,27512],
        maisonMansour: [9800,10200,9600,10800,10400,11200,10800,11600,11200,12000,11600,12400,11800,12600,12200,13000,12600,13400,12800,13600,13200,14000,13400,14200,13800,11820],
        spaBahia:      [6200,6600,6400,7000,6800,7400,7200,7800,7600,8200,8000,8600,8400,9000,8800,9400,9200,9800,9400,10000,9600,10200,9800,10400,10000,8950],
      },

      // ── OPERATIONAL ALERTS (Section 6, conditional) ────────────────
      alerts: [
        {
          venueId: 'maisonMansour',
          venueName: 'Maison Mansour',
          type: 'underperforming',
          message: 'CA aujourd\'hui −2,4 % vs hier · en dessous de la moyenne 7 j de 12 400 MAD',
          severity: 'medium',
        },
      ],
    },
  };

  /* ═══════════════ VERTICAL → SIDEBAR SECTION ═══════════════ */

  // Semantic names are rendered by the shared Material Symbols Outlined
  // runtime (assets/material-icons.js). Keep navigation iconography
  // consistent across every vertical.
  const ICONS = {
    // restaurant
    tables: 'layout-grid',
    menu: 'clipboard-list',
    kds: 'monitor',
    stock: 'package',
    finance: 'trending-up',
    // boutique
    inventory: 'archive',
    categories: 'folder',
    promos: 'tag',
    returns: 'rotate-ccw',
    sold: 'bar-chart-3',
    // spa
    appointments: 'calendar',
    services: 'gift',
    practitioners: 'user-check',
    clients: 'contact',
    operations: 'clipboard-list',
    route: 'git-branch',
    book: 'book-open',
    card: 'credit-card',
    alert: 'alert-triangle',
    truck: 'truck',
    usercheck: 'user-check',
    // hotel — onboarding vertical, reached only through the 0000 wizard
    // (no demo hotel venue ships)
    reception: 'bell',
    chambres: 'bed-double',
    sejours: 'calendar-days',
    menage: 'sparkles',
    tarifs: 'tag',
    hotes: 'user-check',
    folios: 'receipt-text',
    canaux: 'globe',
    intel: 'sparkles',
  };

  /* Pressing navigation uses Google's current Material Symbols, not the old
   * hand-drawn stroke approximations. Outlined 400 · 24px optical grid. */
  const MATERIAL_PRESSING = {
    orders: '<path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h168q13-36 43.5-58t68.5-22q38 0 68.5 22t43.5 58h168q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm80-80h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Z"/>',
    workshop: '<path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640q0 33-23.5 56.5T720-80H240Zm0-80h480v-640H240v640Zm381.5-98.5Q680-317 680-400t-58.5-141.5Q563-600 480-600t-141.5 58.5Q280-483 280-400t58.5 141.5Q397-200 480-200t141.5-58.5ZM480-268q-26 0-50.5-9.5T386-306l188-188q19 19 28.5 43.5T612-400q0 55-38.5 93.5T480-268ZM320-680q17 0 28.5-11.5T360-720q0-17-11.5-28.5T320-760q-17 0-28.5 11.5T280-720q0 17 11.5 28.5T320-680Zm120 0q17 0 28.5-11.5T480-720q0-17-11.5-28.5T440-760q-17 0-28.5 11.5T400-720q0 17 11.5 28.5T440-680Z"/>',
    pickup: '<path d="M120-160q-17 0-28.5-11.5T80-200q0-10 4-18.5T96-232l344-258v-70q0-17 12-28.5t29-11.5q25 0 42-18t17-43q0-25-17.5-42T480-720q-25 0-42.5 17.5T420-660h-80q0-58 41-99t99-41q58 0 99 40.5t41 98.5q0 47-27.5 84T520-526v36l344 258q8 5 12 13.5t4 18.5q0 17-11.5 28.5T840-160H120Zm120-80h480L480-420 240-240Z"/>',
    services: '<path d="M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Z"/>',
    quality: '<path d="M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 132-90.5 256.5T480-80Zm-42-240 226-226-56-56-170 170-86-86-56 56 142 142Z"/>',
    delivery: '<path d="M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm85-45q17 0 28.5-11.5T280-280q0-17-11.5-28.5T240-320q-17 0-28.5 11.5T200-280q0 17 11.5 28.5T240-240ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm600 120q17 0 28.5-11.5T760-280q0-17-11.5-28.5T720-320q-17 0-28.5 11.5T680-280q0 17 11.5 28.5T720-240Zm-40-200h170l-90-120h-80v120Z"/>'
  };

  const VERTICAL_SECTIONS = {
    restaurant: {
      header: 'Restauration',
      i18nHeader: 'sidebar.section.restaurant',
      items: [
        { nav: 'tables',  label: 'Plan de salle',        i18n: 'sidebar.restaurant.tables',  tag: 'LIVE', icon: ICONS.tables },
        { nav: 'menu',    label: 'Menu & modificateurs', i18n: 'sidebar.restaurant.menu',                 icon: ICONS.menu },
        { nav: 'kds',     label: 'Écran cuisine (KDS)',  i18n: 'sidebar.restaurant.kds',                  icon: ICONS.kds },
        { nav: 'stock',   label: 'Stock & approvisionnement', i18n: 'sidebar.restaurant.stock',           icon: ICONS.stock },
        { nav: 'finance', label: 'Analyse du menu',      i18n: 'sidebar.restaurant.finance', tag: 'LIVE', icon: ICONS.finance },
      ],
    },
    boutique: {
      header: 'Boutique',
      i18nHeader: 'sidebar.section.boutique',
      items: [
        { nav: 'inventory',  label: 'Inventaire produits', i18n: 'sidebar.boutique.inventory',  tag: 'LIVE', icon: ICONS.inventory },
        { nav: 'categories', label: 'Catégories',          i18n: 'sidebar.boutique.categories',              icon: ICONS.categories },
        { nav: 'promos',     label: 'Promotions',          i18n: 'sidebar.boutique.promos',                  icon: ICONS.promos },
        { nav: 'returns',    label: 'Retours & échanges',  i18n: 'sidebar.boutique.returns',                 icon: ICONS.returns },
        { nav: 'sold',       label: 'Vendus',              i18n: 'sidebar.boutique.sold',                    icon: ICONS.sold },
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
    /* Hotel — reachable only via the 0000 onboarding (custom venues);
     * assets/hotel.js renders these pages on the live rack/folio engine. */
    hotel: {
      header: 'Hôtel & Riad',
      i18nHeader: 'sidebar.section.hotel',
      items: [
        { nav: 'reception',  label: 'Réception',              i18n: 'sidebar.hotel.reception', tag: 'LIVE', icon: ICONS.reception },
        { nav: 'chambres',   label: 'Plan des chambres',      i18n: 'sidebar.hotel.chambres',               icon: ICONS.chambres },
        { nav: 'sejours',    label: 'Réservations & séjours', i18n: 'sidebar.hotel.sejours',                icon: ICONS.sejours },
        { nav: 'menage',     label: 'Ménage',                 i18n: 'sidebar.hotel.menage',                 icon: ICONS.menage },
        { nav: 'economat',   label: 'Économat',               i18n: 'sidebar.hotel.economat',               icon: ICONS.stock },
        { nav: 'tarifs',     label: 'Tarifs & occupation',    i18n: 'sidebar.hotel.tarifs',                 icon: ICONS.tarifs },
        { nav: 'points-vente', label: 'Points de vente',      i18n: 'sidebar.hotel.outlets',                icon: 'store' },
        { nav: 'folios',     label: 'Notes clients · folios', i18n: 'sidebar.hotel.folios',                 icon: ICONS.folios },
        { nav: 'canaux',     label: 'Canaux & OTA',           i18n: 'sidebar.hotel.canaux',                 icon: ICONS.canaux },
        { nav: 'hotelintel', label: 'Intelligence hôtel',     i18n: 'sidebar.hotel.intel',     tag: 'IA',   icon: ICONS.intel },
      ],
    },
  };

  /* ═══════════════ SUBTYPE PROFILES ═══════════════
   * Every onboarding activity is its OWN trade — not a relabeled restaurant.
   * Each profile speaks the trade's language: sidebar section (nav keys stay
   * on the base family's real modules; labels are the métier's), a KPI band
   * picked for that business, and 2-3 OPTIONAL onboarding questions (step 2,
   * skippable). The three primaries (restaurant/boutique/spa) keep their
   * native sections/KPIs and only define questions. */
  const subLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const pickL = (o) => (o == null ? '' : (o[subLang()] ?? o.fr ?? ''));
  const SUBTYPE_PROFILES = {
    restaurant: { base: 'restaurant', questions: [
      { k: 'covers',  type: 'number', ph: 'Ex. 60',            label: { fr: 'Nombre de couverts', en: 'Number of covers', ar: 'عدد المقاعد' } },
      { k: 'services', type: 'text',  ph: 'Ex. Midi + soir',   label: { fr: 'Services assurés', en: 'Services you run', ar: 'فترات الخدمة' } },
      { k: 'terrace', type: 'number', ph: 'Ex. 20',            label: { fr: 'Places en terrasse', en: 'Terrace seats', ar: 'مقاعد التراس' } },
    ] },
    boutique: { base: 'boutique', questions: [
      { k: 'skus',    type: 'number', ph: 'Ex. 800',           label: { fr: '≈ Nombre de références', en: '≈ Number of SKUs', ar: '≈ عدد المنتجات' } },
      { k: 'surface', type: 'number', ph: 'Ex. 45',            label: { fr: 'Surface (m²)', en: 'Floor area (m²)', ar: 'المساحة (م²)' } },
      /* Plus de question « Horaires » ici. C'était un champ de texte libre posé
       * à l'inscription, donc rempli à la va-vite (« 9h–20h », « 12-02 ») et
       * illisible ensuite par la caisse, les réservations ou l'assistant. Les
       * horaires se règlent une fois, dans Réglages → Heures d'ouverture, avec
       * de vrais sélecteurs — et de là tout le produit les lit. */
      { k: 'surface2', type: 'number', ph: 'Ex. 2',            label: { fr: 'Nombre de vendeurs', en: 'Sales staff', ar: 'عدد البائعين' } },
    ] },
    maison: { base: 'boutique',
      header: { fr: 'Maison & décoration', en: 'Home & decor', ar: 'المنزل والديكور' },
      items: [
        { nav: 'inventory', tag: 'LIVE', label: { fr: 'Pièces & collections', en: 'Pieces & collections', ar: 'القطع والمجموعات' } },
        { nav: 'stock', label: { fr: 'Fournisseurs & achats', en: 'Suppliers & purchasing', ar: 'الموردون والمشتريات' } },
        { nav: 'categories', label: { fr: 'Rayons & matières', en: 'Departments & materials', ar: 'الأقسام والمواد' } },
        { nav: 'promos', label: { fr: 'Offres & coffrets', en: 'Offers & gift sets', ar: 'العروض ومجموعات الهدايا' } },
        { nav: 'returns', label: { fr: 'Retours & échanges', en: 'Returns & exchanges', ar: 'المرتجعات والاستبدالات' } },
        { nav: 'sold', label: { fr: 'Pièces vendues', en: 'Pieces sold', ar: 'القطع المباعة' } },
      ],
      kpis: [
        { key: 'tx', label: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' } },
        { key: 'panier', label: { fr: 'Panier moyen', en: 'Average basket', ar: 'متوسط السلة' } },
        { key: 'tauxRetour', label: { fr: 'Taux de retour', en: 'Return rate', ar: 'معدل الإرجاع' } },
        { key: 'success', label: { fr: 'Taux succès', en: 'Success rate', ar: 'معدل النجاح' } },
        { key: 'ratio', label: { fr: 'Carte / espèces', en: 'Card / cash', ar: 'بطاقة / نقد' } },
        { key: 'regulars', label: { fr: 'Clients fidèles', en: 'Loyal customers', ar: 'العملاء الأوفياء' } },
      ],
      questions: [
        { k: 'collections', type: 'number', ph: 'Ex. 12', label: { fr: 'Collections suivies', en: 'Collections tracked', ar: 'المجموعات المتابعة' } },
        { k: 'fragile', type: 'text', ph: 'Ex. Vaisselle, luminaires', label: { fr: 'Pièces fragiles', en: 'Fragile pieces', ar: 'القطع الهشة' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'MAISON OUVERTE', title: 'Première vente à venir', sub: 'Le flux s’active dès la première pièce encaissée.' },
                     en: { badge: 'HOME STORE OPEN', title: 'First sale coming up', sub: 'The feed starts after the first piece is sold.' },
                     ar: { badge: 'متجر المنزل مفتوح', title: 'أول عملية بيع قادمة', sub: 'يبدأ التدفق عند تحصيل أول قطعة.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre maison...', en: 'Ask about your home store...', ar: 'اسأل عن متجر المنزل...' },
      },
    },
    spa: { base: 'spa',
      header: { fr: 'Spa & bien-être', en: 'Spa & wellness', ar: 'السبا والعناية' },
      items: [
        { nav: 'appointments', tag: 'LIVE', label: { fr: 'Agenda & cabines', en: 'Diary & rooms', ar: 'المواعيد والغرف' } },
        { nav: 'services', label: { fr: 'Soins & rituels', en: 'Treatments & rituals', ar: 'العلاجات والطقوس' } },
        { nav: 'practitioners', label: { fr: 'Praticien·ne·s', en: 'Practitioners', ar: 'الممارسون' } },
        { nav: 'clients', label: { fr: 'Parcours clients', en: 'Guest journeys', ar: 'مسار العملاء' } },
        { nav: 'packages', icon: ICONS.card, label: { fr: 'Cures & cartes cadeaux', en: 'Packages & gift cards', ar: 'الباقات وبطاقات الهدايا' } },
        { nav: 'products', icon: ICONS.card, label: { fr: 'Boutique & produits', en: 'Shop & products', ar: 'المتجر والمنتجات' } },
      ],
      questions: [
      { k: 'cabins',  type: 'number', ph: 'Ex. 4',             label: { fr: 'Cabines de soin', en: 'Treatment rooms', ar: 'غرف العناية' } },
      { k: 'staff',   type: 'number', ph: 'Ex. 6',             label: { fr: 'Praticien·ne·s', en: 'Practitioners', ar: 'الممارسون' } },
      { k: 'signature', type: 'text', ph: 'Ex. Hammam + argan', label: { fr: 'Soins signature', en: 'Signature treatments', ar: 'علاجات مميزة' } },
    ] },
    autre: { base: 'boutique',
      header: { fr: 'Mon activité', en: 'My business', ar: 'نشاطي' },
      items: [
        { nav: 'inventory', tag: 'LIVE', label: { fr: 'Catalogue & inventaire', en: 'Catalogue & inventory', ar: 'الكتالوج والمخزون' } },
        { nav: 'categories', label: { fr: 'Catégories', en: 'Categories', ar: 'الفئات' } },
        { nav: 'promos', label: { fr: 'Offres', en: 'Offers', ar: 'العروض' } },
        { nav: 'workflows', icon: ICONS.operations, label: { fr: 'Suivi d’activité', en: 'Work tracking', ar: 'تتبع النشاط' } },
        { nav: 'returns', label: { fr: 'Retours & incidents', en: 'Returns & incidents', ar: 'المرتجعات والحوادث' } },
      ],
      questions: [
        { k: 'activity', type: 'text', ph: 'Ex. Atelier, service, commerce', label: { fr: 'Votre activité', en: 'Your activity', ar: 'نوع نشاطك' } },
        { k: 'workflow', type: 'text', ph: 'Ex. Commande → préparation → remise', label: { fr: 'Étapes principales', en: 'Main workflow', ar: 'المراحل الرئيسية' } },
      ] },
    /* 4th primary trade — native sections (VERTICAL_SECTIONS.hotel) +
     * native KPI band (KPI_BY_TYPE.hotel); like the 3 base primaries it
     * only defines its step-2 questions. `rooms` sizes the starter room
     * rack in assets/hotel.js. */
    hotel: { base: 'hotel', questions: [
      { k: 'rooms',   type: 'number', ph: 'Ex. 24',                   label: { fr: 'Nombre de chambres', en: 'Number of rooms', ar: 'عدد الغرف' } },
      { k: 'resto',   type: 'text',   ph: 'Ex. Restaurant + terrasse', label: { fr: 'Restauration sur place', en: 'On-site dining', ar: 'مطعم في الموقع' } },
      { k: 'spa',     type: 'text',   ph: 'Ex. Hammam + massages',     label: { fr: 'Spa / hammam', en: 'Spa / hammam', ar: 'سبا / حمّام' } },
    ] },
    cafe: { base: 'restaurant',
      header: { fr: 'Café', en: 'Café', ar: 'المقهى' },
      items: [
        { nav: 'tables',  tag: 'LIVE', label: { fr: 'Salle & terrasse', en: 'Room & terrace', ar: 'القاعة والتراس' } },
        { nav: 'menu',    label: { fr: 'Carte & boissons', en: 'Menu & drinks', ar: 'القائمة والمشروبات' } },
        { nav: 'kds',     label: { fr: 'Écran barista', en: 'Barista screen', ar: 'شاشة الباريستا' } },
        { nav: 'stock',   label: { fr: 'Stock café & frais', en: 'Coffee & fresh stock', ar: 'مخزون القهوة والطازج' } },
        { nav: 'finance', tag: 'LIVE', label: { fr: 'Marges', en: 'Margins', ar: 'الهوامش' } },
      ],
      kpis: [
        { key: 'tx',       label: { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' } },
        { key: 'panier',   label: { fr: 'Ticket moyen', en: 'Avg ticket', ar: 'متوسط التذكرة' } },
        { key: 'marge',    label: { fr: 'Marge brute', en: 'Gross margin', ar: 'الهامش الإجمالي' } },
        { key: 'regulars', label: { fr: 'Habitués', en: 'Regulars', ar: 'الزبائن الدائمون' } },
        { key: 'tips',     label: { fr: 'Pourboires', en: 'Tips', ar: 'الإكراميات' } },
        { key: 'success',  label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'seats',    type: 'number', ph: 'Ex. 24', label: { fr: 'Places assises', en: 'Seats', ar: 'المقاعد' } },
        { k: 'terrace',  type: 'number', ph: 'Ex. 12', label: { fr: 'Places en terrasse', en: 'Terrace seats', ar: 'مقاعد التراس' } },
        { k: 'machines', type: 'number', ph: 'Ex. 2',  label: { fr: 'Machines espresso', en: 'Espresso machines', ar: 'آلات الإسبريسو' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'CAFÉ OUVERT', sub: 'Le flux s\'active dès le premier café encaissé.' },
                     en: { badge: 'CAFÉ OPEN', sub: 'The feed starts with the first coffee rung up.' },
                     ar: { badge: 'المقهى مفتوح', sub: 'يبدأ التدفّق مع أول قهوة محصّلة.' } },
        feedAwait: { fr: 'Café ouvert · en attente de la 1ʳᵉ commande', en: 'Café open · awaiting first order', ar: 'المقهى مفتوح · في انتظار الطلب الأول' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos grains, lait et douceurs, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your beans, milk and pastries, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع حبوب البن والحليب والحلويات، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top boissons', manage: 'Gérer la carte →', msg: 'Vos boissons et douceurs les plus vendues s\'afficheront ici dès la première commande.' },
                         en: { title: 'Top drinks', manage: 'Manage menu →', msg: 'Your best-selling drinks and pastries will appear here after the first order.' },
                         ar: { title: 'أفضل المشروبات', manage: 'إدارة القائمة ←', msg: 'ستظهر أكثر مشروباتك وحلوياتك مبيعًا هنا بعد أول طلب.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre café...', en: 'Ask a question about your café...', ar: 'اطرح سؤالاً حول مقهاك...' },
      } },
    fastfood: { base: 'restaurant',
      header: { fr: 'Fast-food', en: 'Fast food', ar: 'الوجبات السريعة' },
      items: [
        { nav: 'tables',  tag: 'LIVE', label: { fr: 'Comptoir & bornes', en: 'Counter & kiosks', ar: 'الكاونتر والأكشاك' } },
        { nav: 'menu',    label: { fr: 'Menu & combos', en: 'Menu & combos', ar: 'القائمة والكومبو' } },
        { nav: 'kds',     label: { fr: 'Écran cuisine (KDS)', en: 'Kitchen display (KDS)', ar: 'شاشة المطبخ' } },
        { nav: 'channels', icon: ICONS.route, label: { fr: 'Livraison & canaux', en: 'Delivery & channels', ar: 'التوصيل والقنوات' } },
        { nav: 'stock',   label: { fr: 'Stock & surgelés', en: 'Stock & frozen', ar: 'المخزون والمجمدات' } },
        { nav: 'finance', tag: 'LIVE', label: { fr: 'Marges', en: 'Margins', ar: 'الهوامش' } },
      ],
      kpis: [
        { key: 'tx',       label: { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' } },
        { key: 'txPerDay', label: { fr: 'Commandes / jour', en: 'Orders / day', ar: 'طلبات/يوم' } },
        { key: 'panier',   label: { fr: 'Ticket moyen', en: 'Avg ticket', ar: 'متوسط التذكرة' } },
        { key: 'marge',    label: { fr: 'Marge brute', en: 'Gross margin', ar: 'الهامش الإجمالي' } },
        { key: 'ratio',    label: { fr: 'Ratio card / cash', en: 'Card / cash ratio', ar: 'بطاقة/نقد' } },
        { key: 'success',  label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'kiosks',   type: 'number', ph: 'Ex. 2',                label: { fr: 'Bornes de commande', en: 'Order kiosks', ar: 'أكشاك الطلب' } },
        { k: 'delivery', type: 'text',   ph: 'Ex. Glovo + Yassir',    label: { fr: 'Plateformes de livraison', en: 'Delivery platforms', ar: 'منصات التوصيل' } },
        { k: 'peak',     type: 'text',   ph: 'Ex. 12h–14h, 19h–21h', label: { fr: 'Heures de pointe', en: 'Peak hours', ar: 'ساعات الذروة' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'COMPTOIR OUVERT', sub: 'Le flux s\'active dès la première commande au comptoir ou à la borne.' },
                     en: { badge: 'COUNTER OPEN', sub: 'The feed starts with the first counter or kiosk order.' },
                     ar: { badge: 'الكاونتر مفتوح', sub: 'يبدأ التدفّق مع أول طلب من الكاونتر أو الكشك.' } },
        feedAwait: { fr: 'Comptoir ouvert · en attente de la 1ʳᵉ commande', en: 'Counter open · awaiting first order', ar: 'الكاونتر مفتوح · في انتظار الطلب الأول' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos ingrédients et emballages, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your ingredients and packaging, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع مكوّناتك وعبواتك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top combos', manage: 'Gérer le menu →', msg: 'Vos menus et combos les plus vendus s\'afficheront ici dès la première commande.' },
                         en: { title: 'Top combos', manage: 'Manage menu →', msg: 'Your best-selling combos will appear here after the first order.' },
                         ar: { title: 'أفضل الكومبو', manage: 'إدارة القائمة ←', msg: 'ستظهر أكثر وجباتك مبيعًا هنا بعد أول طلب.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre fast-food...', en: 'Ask a question about your fast food...', ar: 'اطرح سؤالاً حول مطعمك السريع...' },
      } },
    bakery: { base: 'restaurant',
      header: { fr: 'Boulangerie', en: 'Bakery', ar: 'المخبزة' },
      items: [
        { nav: 'tables',  tag: 'LIVE', label: { fr: 'Comptoir & précommandes', en: 'Counter & pre-orders', ar: 'الكاونتر والطلبات المسبقة' } },
        { nav: 'menu',    label: { fr: 'Catalogue & fournées', en: 'Catalogue & batches', ar: 'الكتالوج والدفعات' } },
        { nav: 'kds',     label: { fr: 'Écran fournil', en: 'Bakehouse screen', ar: 'شاشة المخبز' } },
        { nav: 'waste',   icon: ICONS.alert, label: { fr: 'Invendus & dons', en: 'Unsold & donations', ar: 'غير المباع والتبرعات' } },
        { nav: 'stock',   label: { fr: 'Farines & matières', en: 'Flour & ingredients', ar: 'الدقيق والمواد' } },
        { nav: 'finance', tag: 'LIVE', label: { fr: 'Marges', en: 'Margins', ar: 'الهوامش' } },
      ],
      kpis: [
        { key: 'tx',       label: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' } },
        { key: 'txPerDay', label: { fr: 'Ventes / jour', en: 'Sales / day', ar: 'مبيعات/يوم' } },
        { key: 'panier',   label: { fr: 'Ticket moyen', en: 'Avg ticket', ar: 'متوسط التذكرة' } },
        { key: 'marge',    label: { fr: 'Marge brute', en: 'Gross margin', ar: 'الهامش الإجمالي' } },
        { key: 'regulars', label: { fr: 'Habitués', en: 'Regulars', ar: 'الزبائن الدائمون' } },
        { key: 'success',  label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'batches', type: 'number', ph: 'Ex. 3',                  label: { fr: 'Fournées / jour', en: 'Batches / day', ar: 'دفعات/يوم' } },
        { k: 'ovens',   type: 'number', ph: 'Ex. 2',                  label: { fr: 'Fours', en: 'Ovens', ar: 'الأفران' } },
        { k: 'unsold',  type: 'text',   ph: 'Ex. -50 % à 19h, dons',  label: { fr: 'Gestion des invendus', en: 'Unsold management', ar: 'إدارة غير المباع' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'FOURNIL OUVERT', title: 'Première vente à venir', sub: 'Le flux s\'active dès la première vente au comptoir.' },
                     en: { badge: 'BAKEHOUSE OPEN', title: 'First sale coming up', sub: 'The feed starts with the first counter sale.' },
                     ar: { badge: 'المخبز مفتوح', title: 'أول عملية بيع قادمة', sub: 'يبدأ التدفّق مع أول عملية بيع في الكاونتر.' } },
        feedAwait: { fr: 'Fournil ouvert · en attente de la 1ʳᵉ vente', en: 'Bakehouse open · awaiting first sale', ar: 'المخبز مفتوح · في انتظار أول عملية بيع' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez farines, levures et matières, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your flour, yeast and ingredients, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع الدقيق والخميرة والمواد، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top fournées', manage: 'Gérer la gamme →', msg: 'Vos pains et viennoiseries les plus vendus s\'afficheront ici dès la première vente.' },
                         en: { title: 'Top bakes', manage: 'Manage range →', msg: 'Your best-selling breads and pastries will appear here after the first sale.' },
                         ar: { title: 'أفضل المخبوزات', manage: 'إدارة التشكيلة ←', msg: 'ستظهر أكثر أنواع الخبز والمعجنات مبيعًا هنا بعد أول عملية بيع.' } },
        eveningEmpty: { fr: { lbl: 'DEMAIN · PRÉCOMMANDES', head: 'Aucune précommande', msg: 'Vos commandes clients, gâteaux, pièces montées, s\'afficheront ici.' },
                        en: { lbl: 'TOMORROW · PRE-ORDERS', head: 'No pre-orders', msg: 'Your customer orders, cakes, celebration pieces, will appear here.' },
                        ar: { lbl: 'غدًا · الطلبات المسبقة', head: 'لا طلبات مسبقة', msg: 'ستظهر طلبات عملائك، الكعك وقطع المناسبات، هنا.' } },
        navOrders: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' },
        askPlaceholder: { fr: 'Posez votre question sur votre boulangerie...', en: 'Ask a question about your bakery...', ar: 'اطرح سؤالاً حول مخبزتك...' },
      } },
    pizzeria: { base: 'restaurant',
      header: { fr: 'Pizzeria', en: 'Pizzeria', ar: 'البيتزيريا' },
      items: [
        { nav: 'tables',  tag: 'LIVE', label: { fr: 'Salle & livraison', en: 'Room & delivery', ar: 'القاعة والتوصيل' } },
        { nav: 'menu',    label: { fr: 'Carte & tailles', en: 'Menu & sizes', ar: 'القائمة والأحجام' } },
        { nav: 'kds',     label: { fr: 'Écran four', en: 'Oven screen', ar: 'شاشة الفرن' } },
        { nav: 'delivery', icon: ICONS.route, label: { fr: 'Livraisons', en: 'Deliveries', ar: 'التوصيلات' } },
        { nav: 'stock',   label: { fr: 'Pâte & ingrédients', en: 'Dough & toppings', ar: 'العجين والمكونات' } },
        { nav: 'finance', tag: 'LIVE', label: { fr: 'Marges', en: 'Margins', ar: 'الهوامش' } },
      ],
      kpis: [
        { key: 'tx',       label: { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' } },
        { key: 'panier',   label: { fr: 'Ticket moyen', en: 'Avg ticket', ar: 'متوسط التذكرة' } },
        { key: 'marge',    label: { fr: 'Marge brute', en: 'Gross margin', ar: 'الهامش الإجمالي' } },
        { key: 'ratio',    label: { fr: 'Ratio card / cash', en: 'Card / cash ratio', ar: 'بطاقة/نقد' } },
        { key: 'regulars', label: { fr: 'Habitués', en: 'Regulars', ar: 'الزبائن الدائمون' } },
        { key: 'success',  label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'oven',     type: 'text',   ph: 'Ex. Bois',           label: { fr: 'Type de four', en: 'Oven type', ar: 'نوع الفرن' } },
        { k: 'tables',   type: 'number', ph: 'Ex. 14',             label: { fr: 'Nombre de tables', en: 'Number of tables', ar: 'عدد الطاولات' } },
        { k: 'delivery', type: 'text',   ph: 'Ex. Glovo + maison', label: { fr: 'Livraison', en: 'Delivery', ar: 'التوصيل' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'FOUR ALLUMÉ', sub: 'Le flux s\'active dès la première pizza encaissée.' },
                     en: { badge: 'OVEN FIRED UP', sub: 'The feed starts with the first pizza rung up.' },
                     ar: { badge: 'الفرن مشتعل', sub: 'يبدأ التدفّق مع أول بيتزا محصّلة.' } },
        feedAwait: { fr: 'Four allumé · en attente de la 1ʳᵉ commande', en: 'Oven fired up · awaiting first order', ar: 'الفرن مشتعل · في انتظار الطلب الأول' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez pâte, mozzarella et garnitures, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your dough, mozzarella and toppings, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع العجين والموزاريلا والمكوّنات، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top pizzas', manage: 'Gérer la carte →', msg: 'Vos pizzas les plus vendues s\'afficheront ici dès la première commande.' },
                         en: { title: 'Top pizzas', manage: 'Manage menu →', msg: 'Your best-selling pizzas will appear here after the first order.' },
                         ar: { title: 'أفضل البيتزا', manage: 'إدارة القائمة ←', msg: 'ستظهر أكثر أنواع البيتزا مبيعًا هنا بعد أول طلب.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre pizzeria...', en: 'Ask a question about your pizzeria...', ar: 'اطرح سؤالاً حول البيتزيريا...' },
      } },
    traiteur: { base: 'restaurant',
      header: { fr: 'Traiteur', en: 'Catering', ar: 'خدمة الطعام' },
      items: [
        { nav: 'tables',  tag: 'LIVE', label: { fr: 'Événements & planning', en: 'Events & schedule', ar: 'الفعاليات والتخطيط' } },
        { nav: 'menu',    label: { fr: 'Menus & formules', en: 'Menus & packages', ar: 'القوائم والعروض' } },
        { nav: 'kds',     label: { fr: 'Production cuisine', en: 'Kitchen production', ar: 'إنتاج المطبخ' } },
        { nav: 'quotes',   icon: ICONS.operations, label: { fr: 'Devis & événements', en: 'Quotes & events', ar: 'العروض والفعاليات' } },
        { nav: 'deposits', icon: ICONS.card, label: { fr: 'Acomptes & soldes', en: 'Deposits & balances', ar: 'التسبيقات والأرصدة' } },
        { nav: 'stock',   label: { fr: 'Stock & commandes', en: 'Stock & purchasing', ar: 'المخزون والمشتريات' } },
        { nav: 'finance', tag: 'LIVE', label: { fr: 'Marges', en: 'Margins', ar: 'الهوامش' } },
      ],
      kpis: [
        { key: 'tx',         label: { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' } },
        { key: 'panier',     label: { fr: 'Commande moyenne', en: 'Avg order', ar: 'متوسط الطلب' } },
        { key: 'marge',      label: { fr: 'Marge brute', en: 'Gross margin', ar: 'الهامش الإجمالي' } },
        { key: 'newClients', label: { fr: 'Nouveaux clients', en: 'New clients', ar: 'عملاء جدد' } },
        { key: 'retention',  label: { fr: 'Clients fidèles', en: 'Returning clients', ar: 'عملاء عائدون' } },
        { key: 'success',    label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'capacity', type: 'number', ph: 'Ex. 300',     label: { fr: 'Capacité couverts / événement', en: 'Covers capacity / event', ar: 'سعة المقاعد/فعالية' } },
        { k: 'zone',     type: 'text',   ph: 'Ex. Casa–Rabat', label: { fr: 'Zone de livraison', en: 'Delivery zone', ar: 'منطقة التوصيل' } },
        { k: 'leadTime', type: 'text',   ph: 'Ex. 48h',      label: { fr: 'Délai minimum de commande', en: 'Minimum lead time', ar: 'أقل مهلة للطلب' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'ATELIER OUVERT', sub: 'Le flux s\'active dès la première commande encaissée.' },
                     en: { badge: 'KITCHEN OPEN', sub: 'The feed starts with the first order rung up.' },
                     ar: { badge: 'الورشة مفتوحة', sub: 'يبدأ التدفّق مع أول طلب محصّل.' } },
        feedAwait: { fr: 'Atelier ouvert · en attente de la 1ʳᵉ commande', en: 'Kitchen open · awaiting first order', ar: 'الورشة مفتوحة · في انتظار الطلب الأول' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos ingrédients et contenants, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your ingredients and containers, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع مكوّناتك وعبواتك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top menus', manage: 'Gérer les formules →', msg: 'Vos menus et formules les plus demandés s\'afficheront ici dès la première commande.' },
                         en: { title: 'Top menus', manage: 'Manage packages →', msg: 'Your most requested menus and packages will appear here after the first order.' },
                         ar: { title: 'أفضل القوائم', manage: 'إدارة العروض ←', msg: 'ستظهر أكثر قوائمك وعروضك طلبًا هنا بعد أول طلب.' } },
        eveningEmpty: { fr: { lbl: 'PROCHAIN ÉVÉNEMENT', head: 'Aucun événement planifié', msg: 'Vos mariages, séminaires et réceptions s\'afficheront ici dès la première réservation.' },
                        en: { lbl: 'NEXT EVENT', head: 'No events scheduled', msg: 'Your weddings, corporate events and receptions will appear here after the first booking.' },
                        ar: { lbl: 'الفعالية القادمة', head: 'لا فعاليات مجدولة', msg: 'ستظهر أعراسك وفعالياتك وحفلاتك هنا بعد أول حجز.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre activité traiteur...', en: 'Ask a question about your catering business...', ar: 'اطرح سؤالاً حول نشاطك في خدمة الطعام...' },
      } },
    foodtruck: { base: 'restaurant',
      header: { fr: 'Food truck', en: 'Food truck', ar: 'شاحنة الطعام' },
      items: [
        { nav: 'tables',  tag: 'LIVE', label: { fr: 'Emplacements & tournées', en: 'Spots & rounds', ar: 'المواقع والجولات' } },
        { nav: 'menu',    label: { fr: 'Carte du jour', en: 'Daily menu', ar: 'قائمة اليوم' } },
        { nav: 'kds',     label: { fr: 'Écran cuisine', en: 'Kitchen screen', ar: 'شاشة المطبخ' } },
        { nav: 'vehicle',  icon: ICONS.truck, label: { fr: 'Camion & tournée', en: 'Truck & route', ar: 'الشاحنة والجولة' } },
        { nav: 'stock',   label: { fr: 'Stock embarqué', en: 'Onboard stock', ar: 'المخزون المحمول' } },
        { nav: 'finance', tag: 'LIVE', label: { fr: 'Marges', en: 'Margins', ar: 'الهوامش' } },
      ],
      kpis: [
        { key: 'tx',       label: { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' } },
        { key: 'txPerDay', label: { fr: 'Commandes / jour', en: 'Orders / day', ar: 'طلبات/يوم' } },
        { key: 'panier',   label: { fr: 'Ticket moyen', en: 'Avg ticket', ar: 'متوسط التذكرة' } },
        { key: 'marge',    label: { fr: 'Marge brute', en: 'Gross margin', ar: 'الهامش الإجمالي' } },
        { key: 'ratio',    label: { fr: 'Ratio card / cash', en: 'Card / cash ratio', ar: 'بطاقة/نقد' } },
        { key: 'success',  label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'spots',    type: 'text',   ph: 'Ex. Marina, Technopark', label: { fr: 'Emplacements habituels', en: 'Usual spots', ar: 'المواقع المعتادة' } },
        { k: 'days',     type: 'text',   ph: 'Ex. Mar–Sam',            label: { fr: 'Jours de tournée', en: 'Service days', ar: 'أيام العمل' } },
        { k: 'capacity', type: 'number', ph: 'Ex. 40',                 label: { fr: 'Capacité / heure', en: 'Capacity / hour', ar: 'السعة/ساعة' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'EN TOURNÉE', sub: 'Le flux s\'active dès la première vente sur l\'emplacement.' },
                     en: { badge: 'ON THE ROAD', sub: 'The feed starts with the first sale at your spot.' },
                     ar: { badge: 'في جولة', sub: 'يبدأ التدفّق مع أول عملية بيع في الموقع.' } },
        feedAwait: { fr: 'En tournée · en attente de la 1ʳᵉ commande', en: 'On the road · awaiting first order', ar: 'في جولة · في انتظار الطلب الأول' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez votre stock embarqué, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your onboard stock, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع مخزونك المحمول، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top du jour', manage: 'Gérer la carte →', msg: 'Vos plats les plus vendus s\'afficheront ici dès la première commande.' },
                         en: { title: 'Today\'s top sellers', manage: 'Manage menu →', msg: 'Your best-selling dishes will appear here after the first order.' },
                         ar: { title: 'الأكثر مبيعًا اليوم', manage: 'إدارة القائمة ←', msg: 'ستظهر أكثر أطباقك مبيعًا هنا بعد أول طلب.' } },
        eveningEmpty: { fr: { lbl: 'PROCHAIN EMPLACEMENT', head: 'Aucun emplacement planifié', msg: 'Vos prochains spots et événements s\'afficheront ici.' },
                        en: { lbl: 'NEXT SPOT', head: 'No spot scheduled', msg: 'Your upcoming spots and events will appear here.' },
                        ar: { lbl: 'الموقع القادم', head: 'لا موقع مجدول', msg: 'ستظهر مواقعك وفعالياتك القادمة هنا.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre food truck...', en: 'Ask a question about your food truck...', ar: 'اطرح سؤالاً حول شاحنة طعامك...' },
      } },
    epicerie: { base: 'boutique',
      header: { fr: 'Épicerie', en: 'Grocery', ar: 'البقالة' },
      items: [
        { nav: 'inventory',  tag: 'LIVE', label: { fr: 'Inventaire & rayons', en: 'Inventory & aisles', ar: 'المخزون والأرفف' } },
        { nav: 'categories', label: { fr: 'Rayons & familles', en: 'Aisles & families', ar: 'الأرفف والعائلات' } },
        { nav: 'promos',     label: { fr: 'Promotions & paniers', en: 'Promos & bundles', ar: 'العروض والسلال' } },
        { nav: 'returns',    label: { fr: 'Retours & casse', en: 'Returns & breakage', ar: 'المرتجعات والتالف' } },
        { nav: 'credit',      icon: ICONS.card, label: { fr: 'Carnet de crédit', en: 'Credit ledger', ar: 'دفتر الديون' } },
        { nav: 'suppliers',   icon: ICONS.truck, label: { fr: 'Fournisseurs', en: 'Suppliers', ar: 'الموردون' } },
        { nav: 'weighed',     icon: ICONS.stock, label: { fr: 'Produits au poids', en: 'Weighed products', ar: 'المنتجات بالوزن' } },
      ],
      kpis: [
        { key: 'tx',         label: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' } },
        { key: 'panier',     label: { fr: 'Panier moyen', en: 'Avg basket', ar: 'متوسط السلة' } },
        { key: 'tauxRetour', label: { fr: 'Casse & retours', en: 'Breakage & returns', ar: 'التالف والمرتجع' } },
        { key: 'regulars',   label: { fr: 'Habitués', en: 'Regulars', ar: 'الزبائن الدائمون' } },
        { key: 'ratio',      label: { fr: 'Ratio card / cash', en: 'Card / cash ratio', ar: 'بطاقة/نقد' } },
        { key: 'success',    label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'skus',      type: 'number', ph: 'Ex. 1200',          label: { fr: '≈ Références en rayon', en: '≈ SKUs on shelf', ar: '≈ المنتجات بالأرفف' } },
        { k: 'suppliers', type: 'number', ph: 'Ex. 8',             label: { fr: 'Fournisseurs réguliers', en: 'Regular suppliers', ar: 'الموردون الدائمون' } },
        { k: 'delivery',  type: 'text',   ph: 'Ex. Oui, < 2 km',   label: { fr: 'Livraison quartier', en: 'Local delivery', ar: 'توصيل الحي' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'ÉPICERIE OUVERTE' }, en: { badge: 'GROCERY OPEN' }, ar: { badge: 'البقالة مفتوحة' } },
        feedAwait: { fr: 'Épicerie ouverte · en attente de la 1ʳᵉ vente', en: 'Grocery open · awaiting first sale', ar: 'البقالة مفتوحة · في انتظار أول عملية بيع' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos rayons, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your aisles, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع أرففك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { manage: 'Gérer les rayons →' }, en: { manage: 'Manage aisles →' }, ar: { manage: 'إدارة الأرفف ←' } },
        askPlaceholder: { fr: 'Posez votre question sur votre épicerie...', en: 'Ask a question about your grocery...', ar: 'اطرح سؤالاً حول بقالتك...' },
      } },
    pressing: { base: 'boutique',
      header: { fr: 'Pressing', en: 'Dry cleaning', ar: 'المصبنة' },
      items: [
        { nav: 'pressing-orders',   tag: 'LIVE', icon: MATERIAL_PRESSING.orders,   material: true, label: { fr: 'Dépôts & commandes', en: 'Drop-offs & orders', ar: 'الإيداعات والطلبات' } },
        { nav: 'pressing-workshop', icon: MATERIAL_PRESSING.workshop,               material: true, label: { fr: 'Atelier & flux', en: 'Workshop & workflow', ar: 'الورشة وسير العمل' } },
        { nav: 'pressing-pickup',   icon: MATERIAL_PRESSING.pickup,                 material: true, label: { fr: 'Retraits & rack', en: 'Pick-up & rack', ar: 'الاستلام والتعليق' } },
        { nav: 'pressing-services', icon: MATERIAL_PRESSING.services,               material: true, label: { fr: 'Services & tarifs', en: 'Services & pricing', ar: 'الخدمات والأسعار' } },
        { nav: 'pressing-quality',  icon: MATERIAL_PRESSING.quality,                material: true, label: { fr: 'Qualité & vigilances', en: 'Quality & care notes', ar: 'الجودة والملاحظات' } },
        { nav: 'pressing-delivery', icon: MATERIAL_PRESSING.delivery,               material: true, label: { fr: 'Collecte & livraison', en: 'Collection & delivery', ar: 'الجمع والتوصيل' } },
      ],
      kpis: [
        { key: 'tx',         label: { fr: 'Dépôts', en: 'Drop-offs', ar: 'الإيداعات' } },
        { key: 'panier',     label: { fr: 'Bon moyen', en: 'Avg order', ar: 'متوسط الطلب' } },
        { key: 'regulars',   label: { fr: 'Clients réguliers', en: 'Regular clients', ar: 'الزبناء الدائمون' } },
        { key: 'success',    label: { fr: 'Remises à l’heure', en: 'On-time handovers', ar: 'التسليم في الموعد' } },
        { key: 'ratio',      label: { fr: 'Carte / espèces', en: 'Card / cash', ar: 'بطاقة / نقد' } },
        { key: 'tauxRetour', label: { fr: 'Reprises qualité', en: 'Quality rework', ar: 'إعادة المعالجة' } },
      ],
      questions: [
        { k: 'machines', type: 'number', ph: 'Ex. 4', label: { fr: 'Machines de traitement', en: 'Treatment machines', ar: 'آلات المعالجة' } },
        { k: 'turnaround', type: 'text', ph: 'Ex. 48 h', label: { fr: 'Délai standard', en: 'Standard turnaround', ar: 'مدة الإنجاز العادية' } },
        { k: 'delivery', type: 'text', ph: 'Ex. Tanger centre', label: { fr: 'Zone de collecte', en: 'Collection area', ar: 'منطقة الجمع' } },
      ],
      vocab: {
        navOrders: { fr: 'Encaissements', en: 'Payments', ar: 'التحصيلات' },
        feedEmpty: { fr: { badge: 'ATELIER OUVERT', title: 'Premier dépôt à venir', sub: 'Le flux démarre avec le premier vêtement confié.' },
                     en: { badge: 'WORKSHOP OPEN', title: 'First drop-off coming up', sub: 'The workflow starts with the first garment received.' },
                     ar: { badge: 'الورشة مفتوحة', title: 'أول إيداع قادم', sub: 'يبدأ سير العمل مع أول قطعة مستلمة.' } },
        feedAwait: { fr: 'Atelier ouvert · en attente du premier dépôt', en: 'Workshop open · awaiting first drop-off', ar: 'الورشة مفتوحة · في انتظار أول إيداع' },
        askPlaceholder: { fr: 'Posez votre question sur votre pressing...', en: 'Ask a question about your dry cleaner...', ar: 'اطرح سؤالاً حول المصبنة...' },
      } },
    pharmacie: { base: 'boutique',
      header: { fr: 'Pharmacie', en: 'Pharmacy', ar: 'الصيدلية' },
      items: [
        { nav: 'inventory',  tag: 'LIVE', label: { fr: 'Stock & péremptions', en: 'Stock & expiries', ar: 'المخزون والصلاحيات' } },
        { nav: 'categories', label: { fr: 'Familles & ordonnances', en: 'Families & prescriptions', ar: 'العائلات والوصفات' } },
        { nav: 'promos',     label: { fr: 'Parapharmacie & offres', en: 'Parapharmacy & offers', ar: 'الباراصيدلية والعروض' } },
        { nav: 'returns',    label: { fr: 'Retours laboratoires', en: 'Lab returns', ar: 'مرتجعات المختبرات' } },
        { nav: 'prescriptions', icon: ICONS.operations, label: { fr: 'Ordonnances', en: 'Prescriptions', ar: 'الوصفات الطبية' } },
        { nav: 'insurers',      icon: ICONS.card, label: { fr: 'Tiers payant', en: 'Third-party payer', ar: 'الدفع من طرف ثالث' } },
        { nav: 'expiries',      icon: ICONS.alert, label: { fr: 'Lots à surveiller', en: 'Expiry watch', ar: 'مراقبة الصلاحية' } },
        { nav: 'drugs',         icon: ICONS.operations, label: { fr: 'Fiches médicaments', en: 'Drug sheets', ar: 'بطاقات الأدوية' } },
        { nav: 'payers',        icon: ICONS.card, label: { fr: 'Organismes & taux', en: 'Payers & rates', ar: 'الجهات والنسب' } },
        { nav: 'duty',          icon: ICONS.operations, label: { fr: 'Gardes & relève', en: 'Duty & handover', ar: 'الحراسة والتسليم' } },
      ],
      kpis: [
        { key: 'tx',         label: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' } },
        { key: 'panier',     label: { fr: 'Panier moyen', en: 'Avg basket', ar: 'متوسط السلة' } },
        { key: 'regulars',   label: { fr: 'Patients réguliers', en: 'Regular patients', ar: 'المرضى الدائمون' } },
        { key: 'tauxRetour', label: { fr: 'Retours labo', en: 'Lab returns', ar: 'مرتجعات المختبر' } },
        { key: 'ratio',      label: { fr: 'Ratio card / cash', en: 'Card / cash ratio', ar: 'بطاقة/نقد' } },
        { key: 'success',    label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'guard',         type: 'text',   ph: 'Ex. 1 semaine / 8', label: { fr: 'Rotation de garde', en: 'On-call rotation', ar: 'مناوبة الحراسة' } },
        { k: 'prescriptions', type: 'number', ph: 'Ex. 60',            label: { fr: 'Ordonnances / jour', en: 'Prescriptions / day', ar: 'وصفات/يوم' } },
        { k: 'labs',          type: 'number', ph: 'Ex. 12',            label: { fr: 'Laboratoires partenaires', en: 'Partner labs', ar: 'المختبرات الشريكة' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'PHARMACIE OUVERTE' }, en: { badge: 'PHARMACY OPEN' }, ar: { badge: 'الصيدلية مفتوحة' } },
        feedAwait: { fr: 'Pharmacie ouverte · en attente de la 1ʳᵉ vente', en: 'Pharmacy open · awaiting first sale', ar: 'الصيدلية مفتوحة · في انتظار أول عملية بيع' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos références et péremptions, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your references and expiry dates, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع مراجعك وتواريخ الصلاحية، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top ventes', manage: 'Gérer les familles →', msg: 'Vos références les plus vendues s\'afficheront ici dès la première vente.' },
                         en: { title: 'Top sellers', manage: 'Manage families →', msg: 'Your best-selling references will appear here after the first sale.' },
                         ar: { title: 'الأكثر مبيعًا', manage: 'إدارة العائلات ←', msg: 'ستظهر أكثر مراجعك مبيعًا هنا بعد أول عملية بيع.' } },
        eveningEmpty: { fr: { lbl: 'GARDE', head: 'Pas de garde ce soir', msg: 'Vos nuits de garde planifiées s\'afficheront ici.' },
                        en: { lbl: 'ON-CALL', head: 'No on-call duty tonight', msg: 'Your scheduled on-call nights will appear here.' },
                        ar: { lbl: 'الحراسة', head: 'لا مناوبة الليلة', msg: 'ستظهر ليالي مناوبتك المجدولة هنا.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre pharmacie...', en: 'Ask a question about your pharmacy...', ar: 'اطرح سؤالاً حول صيدليتك...' },
      } },
    librairie: { base: 'boutique',
      header: { fr: 'Librairie', en: 'Bookshop', ar: 'المكتبة' },
      items: [
        { nav: 'inventory',  tag: 'LIVE', label: { fr: 'Inventaire & rayonnages', en: 'Inventory & shelves', ar: 'المخزون والرفوف' } },
        { nav: 'categories', label: { fr: 'Rayons & collections', en: 'Sections & collections', ar: 'الأقسام والمجموعات' } },
        { nav: 'promos',     label: { fr: 'Rentrée & sélections', en: 'Back-to-school & picks', ar: 'الدخول المدرسي والمختارات' } },
        { nav: 'returns',    label: { fr: 'Retours éditeurs', en: 'Publisher returns', ar: 'مرتجعات الناشرين' } },
        { nav: 'bookorders',  icon: ICONS.book, label: { fr: 'Commandes spéciales', en: 'Special orders', ar: 'الطلبات الخاصة' } },
        { nav: 'schoollists', icon: ICONS.operations, label: { fr: 'Listes scolaires', en: 'School lists', ar: 'اللوائح المدرسية' } },
      ],
      kpis: [
        { key: 'tx',         label: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' } },
        { key: 'panier',     label: { fr: 'Panier moyen', en: 'Avg basket', ar: 'متوسط السلة' } },
        { key: 'tauxRetour', label: { fr: 'Retours éditeurs', en: 'Publisher returns', ar: 'مرتجعات الناشرين' } },
        { key: 'regulars',   label: { fr: 'Lecteurs fidèles', en: 'Loyal readers', ar: 'القراء الأوفياء' } },
        { key: 'newClients', label: { fr: 'Nouveaux clients', en: 'New customers', ar: 'عملاء جدد' } },
        { key: 'success',    label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'skus',     type: 'number', ph: 'Ex. 4000',              label: { fr: '≈ Titres en stock', en: '≈ Titles in stock', ar: '≈ العناوين بالمخزون' } },
        { k: 'school',   type: 'text',   ph: 'Ex. 40 % du CA en sept.', label: { fr: 'Période scolaire', en: 'School season', ar: 'الموسم المدرسي' } },
        { k: 'ordering', type: 'text',   ph: 'Ex. Oui · 48h',          label: { fr: 'Commandes à la demande', en: 'Special orders', ar: 'طلبات خاصة' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'LIBRAIRIE OUVERTE' }, en: { badge: 'BOOKSHOP OPEN' }, ar: { badge: 'المكتبة مفتوحة' } },
        feedAwait: { fr: 'Librairie ouverte · en attente de la 1ʳᵉ vente', en: 'Bookshop open · awaiting first sale', ar: 'المكتبة مفتوحة · في انتظار أول عملية بيع' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos titres et fournitures, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your titles and supplies, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع عناوينك وقرطاسيتك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top titres', msg: 'Vos meilleures ventes, livres, presse, fournitures, s\'afficheront ici dès la première vente.' },
                         en: { title: 'Top titles', msg: 'Your best sellers, books, press, supplies, will appear here after the first sale.' },
                         ar: { title: 'أفضل العناوين', msg: 'ستظهر أفضل مبيعاتك، كتب وصحافة وقرطاسية، هنا بعد أول عملية بيع.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre librairie...', en: 'Ask a question about your bookshop...', ar: 'اطرح سؤالاً حول مكتبتك...' },
      } },
    fleuriste: { base: 'boutique',
      header: { fr: 'Fleuriste', en: 'Florist', ar: 'محل الأزهار' },
      items: [
        { nav: 'inventory',  tag: 'LIVE', label: { fr: 'Stock frais & arrivages', en: 'Fresh stock & arrivals', ar: 'المخزون الطازج والوارد' } },
        { nav: 'categories', label: { fr: 'Compositions & gammes', en: 'Arrangements & ranges', ar: 'التنسيقات والفئات' } },
        { nav: 'promos',     label: { fr: 'Occasions & fêtes', en: 'Occasions & holidays', ar: 'المناسبات والأعياد' } },
        { nav: 'returns',    label: { fr: 'Pertes & invendus', en: 'Waste & unsold', ar: 'الفاقد وغير المباع' } },
        { nav: 'flowerorders', icon: ICONS.operations, label: { fr: 'Commandes & occasions', en: 'Orders & occasions', ar: 'الطلبات والمناسبات' } },
        { nav: 'delivery',     icon: ICONS.route, label: { fr: 'Tournée livraisons', en: 'Delivery route', ar: 'جولة التوصيل' } },
        { nav: 'freshness',    icon: ICONS.alert, label: { fr: 'Fraîcheur & pertes', en: 'Freshness & waste', ar: 'الطزاجة والفاقد' } },
      ],
      kpis: [
        { key: 'tx',         label: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' } },
        { key: 'panier',     label: { fr: 'Panier moyen', en: 'Avg basket', ar: 'متوسط السلة' } },
        { key: 'tauxRetour', label: { fr: 'Pertes fraîcheur', en: 'Freshness waste', ar: 'فاقد الطزاجة' } },
        { key: 'newClients', label: { fr: 'Nouvelles occasions', en: 'New occasions', ar: 'مناسبات جديدة' } },
        { key: 'regulars',   label: { fr: 'Clients fidèles', en: 'Loyal customers', ar: 'العملاء الأوفياء' } },
        { key: 'success',    label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'arrivals', type: 'number', ph: 'Ex. 2',             label: { fr: 'Arrivages / semaine', en: 'Arrivals / week', ar: 'وارد/أسبوع' } },
        { k: 'events',   type: 'text',   ph: 'Ex. 2–3 / mois',    label: { fr: 'Mariages & événements', en: 'Weddings & events', ar: 'الأعراس والمناسبات' } },
        { k: 'subs',     type: 'text',   ph: 'Ex. 15 abonnés',    label: { fr: 'Abonnements bouquets', en: 'Bouquet subscriptions', ar: 'اشتراكات الباقات' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'ATELIER OUVERT', title: 'Premier bouquet à venir', sub: 'Le flux s\'active dès le premier bouquet encaissé.' },
                     en: { badge: 'SHOP OPEN', title: 'First bouquet coming up', sub: 'The feed starts with the first bouquet rung up.' },
                     ar: { badge: 'المحل مفتوح', title: 'أول باقة قادمة', sub: 'يبدأ التدفّق مع أول باقة محصّلة.' } },
        feedAwait: { fr: 'Atelier ouvert · en attente du 1ᵉʳ bouquet', en: 'Shop open · awaiting first bouquet', ar: 'المحل مفتوح · في انتظار أول باقة' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos fleurs fraîches et arrivages, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your fresh flowers and arrivals, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع أزهارك الطازجة ووارداتك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top compositions', manage: 'Gérer les gammes →', msg: 'Vos bouquets et compositions les plus vendus s\'afficheront ici dès la première vente.' },
                         en: { title: 'Top arrangements', manage: 'Manage ranges →', msg: 'Your best-selling bouquets and arrangements will appear here after the first sale.' },
                         ar: { title: 'أفضل التنسيقات', manage: 'إدارة الفئات ←', msg: 'ستظهر أكثر باقاتك وتنسيقاتك مبيعًا هنا بعد أول عملية بيع.' } },
        eveningEmpty: { fr: { lbl: 'CE SOIR · LIVRAISONS', head: 'Aucune livraison planifiée', msg: 'Vos livraisons se suivent sur la caisse, onglet Livraisons, et dans le suivi Livraisons.' },
                        en: { lbl: 'TONIGHT · DELIVERIES', head: 'No deliveries scheduled', msg: 'Deliveries are tracked on the till, Deliveries tab, and in the Deliveries board.' },
                        ar: { lbl: 'الليلة · التوصيلات', head: 'لا توصيلات مجدولة', msg: 'تُتابع التوصيلات على الصندوق، تبويب التوصيلات، وفي لوحة التوصيلات.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre boutique de fleurs...', en: 'Ask a question about your flower shop...', ar: 'اطرح سؤالاً حول محل أزهارك...' },
      } },
    coiffure: { base: 'spa',
      header: { fr: 'Salon', en: 'Salon', ar: 'الصالون' },
      items: [
        { nav: 'appointments',  tag: 'LIVE', label: { fr: 'Agenda & rendez-vous', en: 'Diary & appointments', ar: 'المفكرة والمواعيد' } },
        { nav: 'services',      label: { fr: 'Prestations & forfaits', en: 'Services & packages', ar: 'الخدمات والباقات' } },
        { nav: 'practitioners', label: { fr: 'Coiffeur·euse·s', en: 'Stylists', ar: 'المصففون' } },
        { nav: 'clients',       label: { fr: 'Fiches clients', en: 'Client records', ar: 'ملفات العملاء' } },
        { nav: 'formulas',      icon: ICONS.book, label: { fr: 'Formules couleur', en: 'Colour formulas', ar: 'تركيبات الصبغة' } },
        { nav: 'chairs',        icon: ICONS.operations, label: { fr: 'Fauteuils & flux', en: 'Chairs & flow', ar: 'الكراسي والتدفق' } },
      ],
      kpis: [
        { key: 'tx',        label: { fr: 'Rendez-vous', en: 'Appointments', ar: 'المواعيد' } },
        { key: 'panier',    label: { fr: 'Ticket moyen', en: 'Avg ticket', ar: 'متوسط التذكرة' } },
        { key: 'retention', label: { fr: 'Taux de retour', en: 'Return rate', ar: 'نسبة العودة' } },
        { key: 'regulars',  label: { fr: 'Clients fidèles', en: 'Loyal clients', ar: 'العملاء الأوفياء' } },
        { key: 'tips',      label: { fr: 'Pourboires', en: 'Tips', ar: 'الإكراميات' } },
        { key: 'success',   label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'chairs',   type: 'number', ph: 'Ex. 6',                 label: { fr: 'Fauteuils', en: 'Chairs', ar: 'الكراسي' } },
        { k: 'duration', type: 'number', ph: 'Ex. 45',                label: { fr: 'Durée moyenne RDV (min)', en: 'Avg appointment (min)', ar: 'متوسط الموعد (د)' } },
        { k: 'specialty', type: 'text',  ph: 'Ex. Balayage, soins',   label: { fr: 'Spécialités', en: 'Specialties', ar: 'التخصصات' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'SALON OUVERT', title: 'Premier rendez-vous à venir' },
                     en: { badge: 'SALON OPEN', title: 'First appointment coming up' },
                     ar: { badge: 'الصالون مفتوح', title: 'أول موعد قادم' } },
        feedAwait: { fr: 'Salon ouvert · en attente du 1ᵉʳ rendez-vous', en: 'Salon open · awaiting first appointment', ar: 'الصالون مفتوح · في انتظار أول موعد' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos produits et colorations, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your products and colour stock, Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع منتجاتك وأصباغك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        staffEmpty: { fr: { title: 'Performance coiffeurs', sub: 'Aucun coiffeur', msg: 'Ajoutez votre équipe pour suivre les performances par fauteuil.' },
                      en: { title: 'Stylist performance', sub: 'No stylists yet', msg: 'Add your team to track performance per chair.' },
                      ar: { title: 'أداء المصففين', sub: 'لا مصففون بعد', msg: 'أضِف فريقك لتتبّع الأداء لكل كرسي.' } },
        askPlaceholder: { fr: 'Posez votre question sur votre salon...', en: 'Ask a question about your salon...', ar: 'اطرح سؤالاً حول صالونك...' },
      } },
    sport: { base: 'spa',
      header: { fr: 'Salle de sport', en: 'Gym', ar: 'النادي الرياضي' },
      items: [
        { nav: 'appointments',  tag: 'LIVE', label: { fr: 'Planning & cours', en: 'Schedule & classes', ar: 'الجدول والحصص' } },
        { nav: 'services',      label: { fr: 'Abonnements & cours', en: 'Memberships & classes', ar: 'الاشتراكات والحصص' } },
        { nav: 'practitioners', label: { fr: 'Coachs', en: 'Coaches', ar: 'المدربون' } },
        { nav: 'clients',       label: { fr: 'Adhérents', en: 'Members', ar: 'الأعضاء' } },
        { nav: 'checkins',      icon: ICONS.usercheck, label: { fr: 'Contrôle d’accès', en: 'Access control', ar: 'مراقبة الدخول' } },
        { nav: 'renewals',      icon: ICONS.card, label: { fr: 'Renouvellements', en: 'Renewals', ar: 'التجديدات' } },
        { nav: 'shop',          icon: ICONS.card, label: { fr: 'Comptoir, coaching & pass', en: 'Counter, coaching & passes', ar: 'الكاونتر والتدريب والتذاكر' } },
      ],
      kpis: [
        { key: 'tx',         label: { fr: 'Passages', en: 'Check-ins', ar: 'الدخول' } },
        { key: 'regulars',   label: { fr: 'Adhérents actifs', en: 'Active members', ar: 'أعضاء نشطون' } },
        { key: 'retention',  label: { fr: 'Rétention', en: 'Retention', ar: 'الاحتفاظ' } },
        { key: 'newClients', label: { fr: 'Nouveaux adhérents', en: 'New members', ar: 'أعضاء جدد' } },
        { key: 'panier',     label: { fr: 'Panier moyen', en: 'Avg basket', ar: 'متوسط السلة' } },
        { key: 'success',    label: { fr: 'Taux succès', en: 'Success rate', ar: 'نسبة النجاح' } },
      ],
      questions: [
        { k: 'members', type: 'number', ph: 'Ex. 250',                label: { fr: '≈ Adhérents actifs', en: '≈ Active members', ar: '≈ الأعضاء النشطون' } },
        { k: 'surface', type: 'number', ph: 'Ex. 400',                label: { fr: 'Surface (m²)', en: 'Floor area (m²)', ar: 'المساحة (م²)' } },
        { k: 'classes', type: 'text',   ph: 'Ex. 12 cours / semaine', label: { fr: 'Cours collectifs', en: 'Group classes', ar: 'الحصص الجماعية' } },
      ],
      vocab: {
        feedEmpty: { fr: { badge: 'SALLE OUVERTE', title: 'Premier passage à venir', sub: 'Le flux s\'active dès le premier passage ou la première vente à l\'accueil.' },
                     en: { badge: 'GYM OPEN', title: 'First check-in coming up', sub: 'The feed starts with the first check-in or front-desk sale.' },
                     ar: { badge: 'النادي مفتوح', title: 'أول دخول قادم', sub: 'يبدأ التدفّق مع أول دخول أو أول عملية بيع في الاستقبال.' } },
        feedAwait: { fr: 'Salle ouverte · en attente du 1ᵉʳ passage', en: 'Gym open · awaiting first check-in', ar: 'النادي مفتوح · في انتظار أول دخول' },
        stockEmpty: { fr: { msg: 'Dès que vous suivez vos consommables (boissons, serviettes…), Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                      en: { msg: 'Once you track your consumables (drinks, towels…), Kiwi flags what drops below your alert level.' },
                      ar: { msg: 'بمجرد تتبّع مستلزماتك (مشروبات، مناشف…)، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
        productsEmpty: { fr: { title: 'Top abonnements', manage: 'Gérer les offres →', sub: 'Aucune adhésion enregistrée', msg: 'Vos formules les plus vendues s\'afficheront ici dès la première adhésion.' },
                         en: { title: 'Top memberships', manage: 'Manage plans →', sub: 'No sign-ups recorded', msg: 'Your best-selling plans will appear here after the first sign-up.' },
                         ar: { title: 'أفضل الاشتراكات', manage: 'إدارة العروض ←', sub: 'لا اشتراكات مسجّلة', msg: 'ستظهر أكثر صيغك مبيعًا هنا بعد أول اشتراك.' } },
        staffEmpty: { fr: { title: 'Performance coachs', sub: 'Aucun coach', msg: 'Ajoutez vos coachs pour suivre les performances par personne.' },
                      en: { title: 'Coach performance', sub: 'No coaches yet', msg: 'Add your coaches to track performance per person.' },
                      ar: { title: 'أداء المدربين', sub: 'لا مدربون بعد', msg: 'أضِف مدربيك لتتبّع الأداء لكل شخص.' } },
        eveningEmpty: { fr: { lbl: 'CE SOIR · COURS', head: 'Aucun cours planifié', msg: 'Vos cours du soir s\'afficheront ici dès qu\'un adhérent s\'inscrit.' },
                        en: { lbl: 'TONIGHT · CLASSES', head: 'No classes scheduled', msg: 'Your evening classes will appear here as soon as a member signs up.' },
                        ar: { lbl: 'الليلة · الحصص', head: 'لا حصص مجدولة', msg: 'ستظهر حصص المساء هنا بمجرد تسجيل أحد الأعضاء.' } },
        navOrders: { fr: 'Passages', en: 'Check-ins', ar: 'الدخول' },
        askPlaceholder: { fr: 'Posez votre question sur votre salle...', en: 'Ask a question about your gym...', ar: 'اطرح سؤالاً حول ناديك...' },
      } },
  };

  /* ── Trade vocabulary for the home cards ──────────────────────────
   * The dashboard's empty states were written for restaurants ("première
   * commande", "ingrédients", "Gérer menu"). A custom venue speaks its
   * trade's language instead: the base vertical's vocab first (boutique /
   * spa — restaurant keeps the default strings), refined per subtype via
   * SUBTYPE_PROFILES[*].vocab where the trade needs its own words (salle
   * de sport above). Resolved by getVocab(section) for the current venue
   * and language; dateRange.js merges the result over its default dicts,
   * so a missing field falls back cleanly. */
  const BASE_VOCAB = {
    boutique: {
      feedEmpty: { fr: { badge: 'BOUTIQUE OUVERTE', title: 'Première vente à venir', sub: 'Le flux s\'active dès la première vente saisie sur la caisse.' },
                   en: { badge: 'SHOP OPEN', title: 'First sale coming up', sub: 'The feed starts as soon as the first sale is rung up.' },
                   ar: { badge: 'المتجر مفتوح', title: 'أول عملية بيع قادمة', sub: 'يبدأ التدفّق فور تسجيل أول عملية بيع على الصندوق.' } },
      feedAwait: { fr: 'Boutique ouverte · en attente de la 1ʳᵉ vente', en: 'Shop open · awaiting first sale', ar: 'المتجر مفتوح · في انتظار أول عملية بيع' },
      stockEmpty: { fr: { msg: 'Dès que vous suivez vos articles, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                    en: { msg: 'Once you track your items, Kiwi flags what drops below your alert level.' },
                    ar: { msg: 'بمجرد تتبّع منتجاتك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
      productsEmpty: { fr: { title: 'Top articles', manage: 'Gérer le catalogue →', msg: 'Vos meilleures ventes s\'afficheront ici dès la première vente.' },
                       en: { title: 'Top items', manage: 'Manage catalog →', msg: 'Your best sellers will appear here after the first sale.' },
                       ar: { title: 'أفضل المنتجات', manage: 'إدارة الكتالوج ←', msg: 'ستظهر أفضل مبيعاتك هنا بعد أول عملية بيع.' } },
      /* A shop's day ends at closing, not with an evening service — "CE SOIR"
         belonged to the restaurant this vocabulary was cloned from. */
      eveningEmpty: { fr: { lbl: 'FIN DE JOURNÉE', head: 'Rien de planifié', msg: 'Une boutique ne prend pas de réservation : les ventes du jour sont dans les indicateurs ci-dessus.' },
                      en: { lbl: 'END OF DAY', head: 'Nothing scheduled', msg: 'A shop takes no bookings: today\'s sales are in the figures above.' },
                      ar: { lbl: 'نهاية اليوم', head: 'لا شيء مجدول', msg: 'لا يستقبل المتجر حجوزات: مبيعات اليوم في المؤشرات أعلاه.' } },
      staffEmpty: { fr: { title: 'Performance vendeurs', sub: 'Aucun vendeur', msg: 'Ajoutez votre équipe pour suivre les ventes par personne.' },
                    en: { title: 'Sales team performance', sub: 'No salespeople yet', msg: 'Add your team to track sales per person.' },
                    ar: { title: 'أداء البائعين', sub: 'لا بائعون بعد', msg: 'أضِف فريقك لتتبّع المبيعات لكل شخص.' } },
      navOrders: { fr: 'Ventes', en: 'Sales', ar: 'المبيعات' },
      askPlaceholder: { fr: 'Posez votre question sur votre boutique...', en: 'Ask a question about your shop...', ar: 'اطرح سؤالاً حول متجرك...' },
      /* The three starter questions above the ask bar were hard-coded in
         dashboard.html for a restaurant, so a clothing shop was invited to ask
         "Quel plat retirer de ma carte ?". They follow the trade now. */
      aiChips: { fr: ['Quel article ne se vend pas ?', 'Prévision des ventes cette semaine', 'Pourquoi mon panier moyen baisse ?'],
                 en: ['Which item is not selling?', 'Sales forecast this week', 'Why is my average basket falling?'],
                 ar: ['أي منتج لا يُباع ؟', 'توقّع المبيعات هذا الأسبوع', 'لماذا ينخفض متوسط سلّتي ؟'] },
    },
    spa: {
      feedEmpty: { fr: { badge: 'INSTITUT OUVERT', title: 'Premier encaissement à venir', sub: 'Le flux s\'active dès le premier rendez-vous encaissé.' },
                   en: { badge: 'OPEN', title: 'First checkout coming up', sub: 'The feed starts with the first appointment checked out.' },
                   ar: { badge: 'مفتوح', title: 'أول تحصيل قادم', sub: 'يبدأ التدفّق مع أول موعد يتم تحصيله.' } },
      feedAwait: { fr: 'Ouvert · en attente du 1ᵉʳ encaissement', en: 'Open · awaiting first checkout', ar: 'مفتوح · في انتظار أول تحصيل' },
      stockEmpty: { fr: { msg: 'Dès que vous suivez vos consommables, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                    en: { msg: 'Once you track your consumables, Kiwi flags what drops below your alert level.' },
                    ar: { msg: 'بمجرد تتبّع مستلزماتك، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
      productsEmpty: { fr: { title: 'Top prestations', manage: 'Gérer les prestations →', msg: 'Vos meilleures prestations s\'afficheront ici dès le premier encaissement.' },
                       en: { title: 'Top services', manage: 'Manage services →', msg: 'Your best-selling services will appear here after the first checkout.' },
                       ar: { title: 'أفضل الخدمات', manage: 'إدارة الخدمات ←', msg: 'ستظهر أفضل خدماتك هنا بعد أول تحصيل.' } },
      eveningEmpty: { fr: { lbl: 'CE SOIR · RENDEZ-VOUS', head: 'Aucun rendez-vous', msg: 'Vos rendez-vous du soir s\'afficheront ici dès qu\'un client réserve.' },
                      en: { lbl: 'TONIGHT · APPOINTMENTS', head: 'No appointments', msg: 'Your evening appointments will appear here as soon as a client books.' },
                      ar: { lbl: 'الليلة · المواعيد', head: 'لا مواعيد', msg: 'ستظهر مواعيد المساء هنا بمجرد حجز أحد العملاء.' } },
      staffEmpty: { fr: { title: 'Performance praticiens', sub: 'Aucun praticien', msg: 'Ajoutez vos praticien·ne·s pour suivre les performances par cabine.' },
                    en: { title: 'Practitioner performance', sub: 'No practitioners yet', msg: 'Add your practitioners to track performance per room.' },
                    ar: { title: 'أداء الممارسين', sub: 'لا ممارسون بعد', msg: 'أضِف ممارسيك لتتبّع الأداء لكل غرفة.' } },
      navOrders: { fr: 'Encaissements', en: 'Checkouts', ar: 'التحصيلات' },
      askPlaceholder: { fr: 'Posez votre question sur votre institut...', en: 'Ask a question about your spa...', ar: 'اطرح سؤالاً حول معهدك...' },
      aiChips: { fr: ['Quelle prestation remplit mes creux ?', 'Prévision des encaissements cette semaine', 'Pourquoi mon panier moyen baisse ?'],
                 en: ['Which service fills my quiet hours?', 'Revenue forecast this week', 'Why is my average basket falling?'],
                 ar: ['أي خدمة تملأ ساعات الركود ؟', 'توقّع المداخيل هذا الأسبوع', 'لماذا ينخفض متوسط سلّتي ؟'] },
    },
    hotel: {
      feedEmpty: { fr: { badge: 'RÉCEPTION OUVERTE', title: 'Premier encaissement à venir', sub: 'Le flux s\'active dès le premier check-in ou la première vente encaissée.' },
                   en: { badge: 'FRONT DESK OPEN', title: 'First checkout coming up', sub: 'The feed starts with the first check-in or sale rung up.' },
                   ar: { badge: 'الاستقبال مفتوح', title: 'أول تحصيل قادم', sub: 'يبدأ التدفّق مع أول تسجيل وصول أو أول عملية بيع.' } },
      feedAwait: { fr: 'Réception ouverte · en attente du 1ᵉʳ encaissement', en: 'Front desk open · awaiting first checkout', ar: 'الاستقبال مفتوح · في انتظار أول تحصيل' },
      stockEmpty: { fr: { msg: 'Dès que vous suivez votre linge et vos consommables, Kiwi vous signale ce qui passe sous votre seuil d\'alerte.' },
                    en: { msg: 'Once you track your linen and supplies, Kiwi flags what drops below your alert level.' },
                    ar: { msg: 'بمجرد تتبّع البياضات والمستلزمات، ينبّهك Kiwi إلى ما ينزل تحت حدّ التنبيه.' } },
      productsEmpty: { fr: { title: 'Top chambres & prestations', manage: 'Gérer les tarifs →', msg: 'Vos chambres et prestations les plus vendues s\'afficheront ici dès la première nuitée.' },
                       en: { title: 'Top rooms & services', manage: 'Manage rates →', msg: 'Your best-selling rooms and services will appear here after the first night sold.' },
                       ar: { title: 'أفضل الغرف والخدمات', manage: 'إدارة الأسعار ←', msg: 'ستظهر غرفك وخدماتك الأكثر مبيعًا هنا بعد أول ليلة.' } },
      eveningEmpty: { fr: { lbl: 'CE SOIR · ARRIVÉES', head: 'Aucune arrivée prévue', msg: 'Vos arrivées du soir s\'afficheront ici dès votre première réservation.' },
                      en: { lbl: 'TONIGHT · ARRIVALS', head: 'No arrivals expected', msg: 'Your evening arrivals will appear here as soon as a booking lands.' },
                      ar: { lbl: 'الليلة · الوصول', head: 'لا وصول متوقع', msg: 'ستظهر وصولات المساء هنا بمجرد أول حجز.' } },
      staffEmpty: { fr: { title: 'Performance équipe', sub: 'Aucun membre', msg: 'Ajoutez réception, ménage et restauration pour suivre l\'activité par personne.' },
                    en: { title: 'Team performance', sub: 'No staff yet', msg: 'Add front desk, housekeeping and F&B to track activity per person.' },
                    ar: { title: 'أداء الفريق', sub: 'لا موظفون بعد', msg: 'أضِف الاستقبال والتنظيف والمطعم لتتبّع النشاط لكل شخص.' } },
      navOrders: { fr: 'Encaissements', en: 'Checkouts', ar: 'التحصيلات' },
      askPlaceholder: { fr: 'Posez votre question sur votre établissement...', en: 'Ask a question about your property...', ar: 'اطرح سؤالاً حول منشأتك...' },
      aiChips: { fr: ['Comment remplir mes chambres vides ?', 'Prévision des arrivées cette semaine', 'Pourquoi mon panier moyen baisse ?'],
                 en: ['How do I fill my empty rooms?', 'Arrivals forecast this week', 'Why is my average basket falling?'],
                 ar: ['كيف أملأ غرفي الشاغرة ؟', 'توقّع الوصول هذا الأسبوع', 'لماذا ينخفض متوسط سلّتي ؟'] },
    },
  };

  /* ═══════════════ VERTICAL → KPI BAND SPEC ═══════════════
   * Drives renderKpiBand() in dateRange.js. Each entry lists which 6 KPI keys
   * to surface for that vertical, plus the i18n label key. Keep at 6 tiles.
   * Sparkline shape per key is owned by dateRange.js. */
  const KPI_BY_TYPE = {
    restaurant: [
      { key: 'tx',         label: 'Commandes',         i18n: 'dash.kpi.tx' },
      { key: 'panier',     label: 'Panier moyen',      i18n: 'dash.kpi.basket' },
      { key: 'marge',      label: 'Marge brute',       i18n: 'dash.kpi.margin' },
      { key: 'success',    label: 'Taux succès',       i18n: 'dash.kpi.success' },
      { key: 'ratio',      label: 'Ratio card / cash', i18n: 'dash.kpi.ratio' },
      { key: 'regulars',   label: 'Clients réguliers', i18n: 'dash.kpi.regular' },
      /* "Temps moyen à table" (key: tempsTable) is available in the
       * Personnaliser picker — owner can swap it in instead of one of
       * the six above. Stays off the default so the strip keeps its
       * familiar layout. */
    ],
    boutique: [
      { key: 'tx',         label: 'Commandes',         i18n: 'dash.kpi.tx' },
      { key: 'panier',     label: 'Panier moyen',      i18n: 'dash.kpi.basket' },
      { key: 'tauxRetour', label: 'Taux retour',       i18n: 'dash.kpi.returnRate' },
      { key: 'success',    label: 'Taux succès',       i18n: 'dash.kpi.success' },
      { key: 'ratio',      label: 'Ratio card / cash', i18n: 'dash.kpi.ratio' },
      { key: 'regulars',   label: 'Clients fidèles',   i18n: 'dash.kpi.loyalCustomers' },
    ],
    spa: [
      { key: 'tx',         label: 'Rendez-vous',       i18n: 'dash.kpi.appointments' },
      { key: 'panier',     label: 'Panier moyen',      i18n: 'dash.kpi.basket' },
      { key: 'marge',      label: 'Marge brute',       i18n: 'dash.kpi.margin' },
      { key: 'success',    label: 'Taux remplissage',  i18n: 'dash.kpi.fillRate' },
      { key: 'ratio',      label: 'Ratio card / cash', i18n: 'dash.kpi.ratio' },
      { key: 'regulars',   label: 'Clients fidèles',   i18n: 'dash.kpi.loyalCustomers' },
      /* "Temps moyen en cabine" available in Personnaliser. */
    ],
    hotel: [
      { key: 'occupation', label: "Taux d'occupation",         i18n: 'dash.kpi.occupancy' },
      { key: 'adr',        label: 'ADR · prix moyen / nuit',   i18n: 'dash.kpi.adr' },
      { key: 'revpar',     label: 'RevPAR',                    i18n: 'dash.kpi.revpar' },
      { key: 'arrdep',     label: 'Arrivées / départs',        i18n: 'dash.kpi.arrdep' },
      { key: 'menage',     label: 'Chambres à nettoyer',       i18n: 'dash.kpi.toClean' },
      { key: 'mixRev',     label: 'Mix revenu · ch · resto · spa', i18n: 'dash.kpi.revMix' },
      /* tx / panier / marge / regulars stay available in Personnaliser. */
    ],
    // Fusion = portfolio-wide KPIs. Same six tiles render in the band, but
    // the values are aggregated sums (see dateRange.js · vData fusion path).
    fusion: [
      { key: 'tx',         label: 'Transactions totales', i18n: 'dash.kpi.tx' },
      { key: 'panier',     label: 'Panier moyen pondéré', i18n: 'dash.kpi.basket' },
      { key: 'marge',      label: 'Marge brute moyenne',  i18n: 'dash.kpi.margin' },
      { key: 'success',    label: 'Taux succès moyen',    i18n: 'dash.kpi.success' },
      { key: 'ratio',      label: 'Ratio card / cash',    i18n: 'dash.kpi.ratio' },
      { key: 'regulars',   label: 'Clients fidèles',      i18n: 'dash.kpi.regular' },
    ],
  };

  /* ═══════════════ HEADER + DEMO BAR + FOOTER PER VENUE ═══════════════ */

  /* The location-switcher sub-line. It used to be read straight off the venue
   * record (`v.siblings`), which only ever existed in French — so an Arabic or
   * English dashboard showed "2 autres emplacements · Casa / Marrakech". The
   * fusion entry is proper nouns, so it is intentionally identical in all three. */
  const SIBLINGS = {
    fr: {
      cafeAtlas: '2 autres emplacements · Casa / Marrakech',
      maisonMansour: '2 autres emplacements · Casa / Marrakech',
      spaBahia: '2 autres emplacements · Casa / Marrakech',
      fusion: 'Café Atlas · Maison Mansour · Spa Bahia',
    },
    en: {
      cafeAtlas: '2 other locations · Casa / Marrakech',
      maisonMansour: '2 other locations · Casa / Marrakech',
      spaBahia: '2 other locations · Casa / Marrakech',
      fusion: 'Café Atlas · Maison Mansour · Spa Bahia',
    },
    ar: {
      cafeAtlas: 'موقعان آخران · الدار البيضاء / مراكش',
      maisonMansour: 'موقعان آخران · الدار البيضاء / مراكش',
      spaBahia: 'موقعان آخران · الدار البيضاء / مراكش',
      fusion: 'Café Atlas · Maison Mansour · Spa Bahia',
    },
  };

  /* The venue's activity label — the second line of every switcher row.
   * It used to be BAKED into the venue record (`typeLabel`) at creation time,
   * in whatever language the merchant happened to be using, and five copies of
   * a French literal map wrote it. So an Arabic dashboard read "Restaurant" for
   * good. The stored keys are the truth — `type` (the family) and `subtype`
   * (the precise trade, when the merchant picked one at onboarding) — and the
   * words are resolved here, at render time, like SIBLINGS above.
   * assets/trades.js owns the trade vocabulary and already translates it live;
   * this literal is the net for when venues.js runs without it. */
  const TYPE_LABELS = {
    fr: { restaurant: 'Restaurant', boutique: 'Boutique', spa: 'Spa', hotel: 'Hôtel', fusion: 'Multi-sites · Casa / Marrakech' },
    en: { restaurant: 'Restaurant', boutique: 'Shop', spa: 'Spa', hotel: 'Hotel', fusion: 'Multi-site · Casa / Marrakech' },
    ar: { restaurant: 'مطعم', boutique: 'متجر', spa: 'سبا', hotel: 'فندق', fusion: 'مواقع متعدّدة · الدار البيضاء / مراكش' },
  };
  function typeLabelOf(v) {
    if (!v) return '';
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const lit = TYPE_LABELS[lang] || TYPE_LABELS.fr;
    if (v.type === 'fusion') return lit.fusion || TYPE_LABELS.fr.fusion;
    /* A precise trade beats its family: a bakery is not just "Restaurant". */
    if (v.subtype) {
      try { const l = window.KiwiTrades?.label?.(v.subtype); if (l) return l; } catch (_) {}
    }
    try { const l = window.KiwiTrades?.baseLabel?.(v.type); if (l) return l; } catch (_) {}
    /* Last resort: a label an older build stored on the record (French, and
     * only ever a string — never render the {fr,en,ar} object two wizards
     * used to hand createVenue). */
    return lit[v.type] || TYPE_LABELS.fr[v.type]
      || (typeof v.typeLabel === 'string' ? v.typeLabel : '');
  }

  const HEADER_SUB = {
    fr: { cafeAtlas: 'Service midi en cours', maisonMansour: 'Boutique ouverte · 10h–20h', spaBahia: 'Espace ouvert · réservations en cours', fusion: '3 emplacements actifs · vue consolidée' },
    en: { cafeAtlas: 'Lunch service in progress', maisonMansour: 'Boutique open · 10am–8pm', spaBahia: 'Spa open · bookings in progress', fusion: '3 active locations · consolidated view' },
    ar: { cafeAtlas: 'خدمة الغداء جارية', maisonMansour: 'البوتيك مفتوح · 10ص–8م', spaBahia: 'الفضاء مفتوح · الحجوزات جارية', fusion: '3 مواقع نشطة · عرض موحّد' },
  };

  const HERO_AI_REC = {
    fr: {
      cafeAtlas: {
        title: 'Votre heure creuse de 15h-17h représente un potentiel inexploité',
        obs: "Entre 15h et 17h, vous réalisez seulement 8% de votre chiffre d'affaires quotidien. Pourtant, c'est l'heure où vos clients restent le plus longtemps assis (temps moyen : 47 minutes, contre 31 minutes au déjeuner).",
        act: '→ Proposer un menu « goûter » avec thé à la menthe et msemen à prix réduit pourrait augmenter la rotation des tables de 20-30%.',
      },
      maisonMansour: {
        title: 'Vos clients touristes dépensent en moyenne +35 % par panier',
        obs: 'Les paniers réglés sur cartes étrangères (38 % des commandes) atteignent en moyenne 380 MAD, contre 282 MAD sur les cartes marocaines. Les acheteurs allemands et espagnols sont sur-représentés.',
        act: '→ Activer un catalogue PDF en anglais sur le terminal Kiwi et un onglet « Tax-free » pourrait lifter le panier moyen de 6-9 %.',
      },
      spaBahia: {
        title: 'Le créneau 14h-15h du mardi est sous-utilisé (38 % rempli)',
        obs: 'Sur les 4 dernières semaines, ce créneau affiche un taux de remplissage de 38 % seulement, contre 87 % en moyenne sur la semaine. Vos clientes fidèles n\'y sont jamais venues.',
        act: '→ Pousser un message WhatsApp aux 47 clients fidèles avec une offre « -20 % mardi 14h-15h » pourrait combler 4-6 créneaux/semaine.',
      },
      fusion: {
        title: 'Café Atlas génère 58 % du CA · concentration à diversifier',
        obs: 'Sur les 30 derniers jours, Café Atlas (58 %) tire le portefeuille, devant Maison Mansour (24 %) et Spa Bahia (18 %). Les 3 sites partagent 312 clients communs, déjà fidèles à l\'écosystème, qu\'on peut activer en cross-sell.',
        act: '→ Lancer une carte fidélité unifiée Kiwi pour les 312 clients cross-site pourrait lifter le CA global de 4-7 %.',
      },
    },
    en: {
      cafeAtlas: {
        title: 'Your 3pm-5pm lull is untapped potential',
        obs: "Between 3pm and 5pm you bring in only 8% of daily revenue. Yet it's when guests stay seated the longest (47 min average, vs 31 min at lunch).",
        act: '→ A « goûter » menu with mint tea and msemen at a reduced price could lift table turnover by 20-30%.',
      },
      maisonMansour: {
        title: 'Your tourist customers spend on average +35% per basket',
        obs: 'Baskets paid with foreign cards (38% of orders) average 380 MAD, versus 282 MAD on Moroccan cards. German and Spanish shoppers are over-represented.',
        act: '→ Enabling an English PDF catalogue on the Kiwi terminal and a « Tax-free » tab could lift the average basket by 6-9%.',
      },
      spaBahia: {
        title: 'The Tuesday 2pm-3pm slot is underused (38% filled)',
        obs: 'Over the last 4 weeks, this slot shows a fill rate of only 38%, versus 87% on average across the week. Your loyal clients have never come at that time.',
        act: '→ Sending a WhatsApp message to the 47 loyal clients with a « -20% Tuesday 2pm-3pm » offer could fill 4-6 slots/week.',
      },
      fusion: {
        title: 'Café Atlas generates 58% of revenue · concentration to diversify',
        obs: 'Over the last 30 days, Café Atlas (58%) drives the portfolio, ahead of Maison Mansour (24%) and Spa Bahia (18%). The 3 sites share 312 common customers, already loyal to the ecosystem, who can be activated through cross-sell.',
        act: '→ Launching a unified Kiwi loyalty card for the 312 cross-site customers could lift overall revenue by 4-7%.',
      },
    },
    ar: {
      cafeAtlas: {
        title: 'فترة الركود بين 15h و17h تمثّل فرصة غير مستغلّة',
        obs: 'بين الساعة 15h و17h، تحقّقون فقط 8% من رقم معاملاتكم اليومي. ومع ذلك، هذه هي الساعات التي يجلس فيها زبائنكم أطول مدة (47 دقيقة في المتوسط، مقابل 31 دقيقة وقت الغداء).',
        act: '→ اقتراح قائمة « العصرونة » بالأتاي والمسمن بسعر مخفّض قد يرفع دوران الطاولات بـ 20-30%.',
      },
      maisonMansour: {
        title: 'زبائنكم السيّاح ينفقون في المتوسّط +35٪ لكل سلّة',
        obs: 'السلال المدفوعة ببطاقات أجنبية (38٪ من الطلبات) تبلغ في المتوسّط 380 درهمًا، مقابل 282 درهمًا على البطاقات المغربية. المشترون الألمان والإسبان ممثّلون بكثرة.',
        act: '→ تفعيل كتالوج PDF بالإنجليزية على جهاز كيوي وعلامة تبويب « معفى من الضريبة » قد يرفع متوسّط السلّة بـ 6-9٪.',
      },
      spaBahia: {
        title: 'فترة الثلاثاء بين 14h و15h غير مستغلّة بما يكفي (38٪ ممتلئة)',
        obs: 'خلال الأسابيع الأربعة الأخيرة، تُظهر هذه الفترة نسبة إشغال لا تتجاوز 38٪، مقابل 87٪ في المتوسّط خلال الأسبوع. زبوناتكم الوفيات لم يأتين فيها قط.',
        act: '→ إرسال رسالة واتساب إلى الزبناء الأوفياء الـ47 بعرض « -20٪ الثلاثاء 14h-15h » قد يملأ 4-6 فترات في الأسبوع.',
      },
      fusion: {
        title: 'مقهى أطلس يحقّق 58٪ من المداخيل · تركّز يجب تنويعه',
        obs: 'خلال الـ30 يومًا الأخيرة، يقود مقهى أطلس (58٪) المحفظة، متقدّمًا على ميزون منصور (24٪) وسبا باهية (18٪). تتقاسم المواقع الثلاثة 312 زبونًا مشتركًا، أوفياء للمنظومة، يمكن تفعيلهم عبر البيع المتقاطع.',
        act: '→ إطلاق بطاقة وفاء كيوي موحّدة للزبناء الـ312 المشتركين بين المواقع قد يرفع المداخيل الإجمالية بـ 4-7٪.',
      },
    },
  };

  const HEATMAP_AI_REC = {
    fr: {
      cafeAtlas: {
        title: 'Lancer un combo livraison Glovo pour 15h–17h',
        obs: "Pendant cette fenêtre creuse, votre salle tourne à 22 % de capacité mais l'équipe reste disponible. Un combo Tajine kefta + thé à la menthe à 75 MAD sur Glovo capte typiquement 8–12 commandes par après-midi dans des cafés similaires de votre quartier.",
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
      fusion: {
        title: 'Synchroniser les heures creuses inter-sites sur le même mardi',
        obs: 'Vos 3 sites partagent une même fenêtre creuse 15h–17h (22 % de capacité moyenne). Une campagne unifiée « Mardi Kiwi · -15 % cross-site » programmée sur les 3 caisses simultanément multiplie la portée par 3.',
        cta: '→ Programmer la campagne tri-site',
      },
    },
    en: {
      cafeAtlas: {
        title: 'Launch a Glovo delivery combo for 3pm–5pm',
        obs: 'During this lull, your dining room runs at 22% capacity but staff is available. A Tajine kefta + mint tea combo at 75 MAD on Glovo typically captures 8–12 orders per afternoon at similar Maarif cafés.',
        cta: '→ Set up the Glovo combo',
      },
      maisonMansour: {
        title: 'Schedule an Instagram Shopping push for 2pm–4pm',
        obs: 'The afternoon (2pm–4pm) accounts for only 11% of your sales, yet your Instagram posts capture 64% of their engagement at those hours. Launching a « Caftans · one-of-a-kind » carousel with a direct buy link could convert.',
        cta: '→ Schedule the Instagram campaign',
      },
      spaBahia: {
        title: 'WhatsApp campaign to fill the 2pm–4pm slots',
        obs: 'Over the last 4 weeks, 11 slots/week stay empty in the afternoon (2pm–4pm). Your 47 loyal clients have a 92% WhatsApp open rate.',
        cta: '→ Launch the WhatsApp campaign',
      },
      fusion: {
        title: 'Sync the cross-site lulls on the same Tuesday',
        obs: 'Your 3 sites share the same 3pm–5pm lull (22% average capacity). A unified « Kiwi Tuesday · -15% cross-site » campaign scheduled on all 3 registers at once multiplies reach by 3.',
        cta: '→ Schedule the tri-site campaign',
      },
    },
    ar: {
      cafeAtlas: {
        title: 'أطلق وجبة توصيل عبر Glovo بين 15h و17h',
        obs: 'خلال هذه الفترة الهادئة، تشتغل قاعتك بـ 22% من طاقتها بينما الفريق متاح. كومبو طاجين الكفتة + أتاي بالنعناع بـ 75 درهم على Glovo يجلب عادة 8–12 طلب في فترة الزوال لدى مقاهي معاريف المماثلة.',
        cta: '→ إعداد كومبو Glovo',
      },
      maisonMansour: {
        title: 'برمجة دفعة Instagram Shopping بين 14h و16h',
        obs: 'لا يمثّل بعد الظهر (14h–16h) سوى 11٪ من مبيعاتكم، بينما تجمع منشورات Instagram الخاصة بكم 64٪ من تفاعلها في تلك الساعات. إطلاق عرض دوّار « قفاطين · قطع فريدة » برابط شراء مباشر قد يحقّق تحويلات.',
        cta: '→ برمجة حملة Instagram',
      },
      spaBahia: {
        title: 'حملة واتساب لملء فترات 14h–16h',
        obs: 'خلال الأسابيع الأربعة الأخيرة، تبقى 11 فترة في الأسبوع شاغرة بعد الظهر (14h–16h). زبوناتكم الوفيات الـ47 لديهنّ نسبة فتح واتساب تبلغ 92٪.',
        cta: '→ إطلاق حملة واتساب',
      },
      fusion: {
        title: 'مزامنة ساعات الركود بين المواقع في نفس يوم الثلاثاء',
        obs: 'تتقاسم مواقعكم الثلاثة نفس فترة الركود بين 15h و17h (22٪ متوسّط الطاقة). حملة موحّدة « ثلاثاء كيوي · -15٪ بين المواقع » مبرمجة على الصناديق الثلاثة في آن واحد تضاعف المدى ثلاث مرّات.',
        cta: '→ برمجة الحملة ثلاثية المواقع',
      },
    },
  };

  /* Mix CMI savings · fusion sums the 3 venues' monthly savings */
  /* Bench labels · fusion override */

  /* Mix de paiement bottom callout — savings vs CMI scales with revenue */
  const MIX_CMI_SAVINGS = {
    fr: {
      cafeAtlas:     '~3 900 MAD ce mois',
      maisonMansour: '~1 700 MAD ce mois',
      spaBahia:      '~1 350 MAD ce mois',
      fusion:        '~6 950 MAD ce mois · 3 sites',
    },
    en: {
      cafeAtlas:     '~3,900 MAD this month',
      maisonMansour: '~1,700 MAD this month',
      spaBahia:      '~1,350 MAD this month',
      fusion:        '~6,950 MAD this month · 3 sites',
    },
    ar: {
      cafeAtlas:     '~3 900 درهم هذا الشهر',
      maisonMansour: '~1 700 درهم هذا الشهر',
      spaBahia:      '~1 350 درهم هذا الشهر',
      fusion:        '~6 950 درهم هذا الشهر · 3 مواقع',
    },
  };

  /* Vous vs … benchmark labels */
  const BENCH_LABELS = {
    fr: {
      cafeAtlas:     { title: 'Vous vs cafés similaires',     sub: '147 cafés casablancais · même gamme de ticket moyen' },
      maisonMansour: { title: 'Vous vs boutiques similaires', sub: '89 boutiques marocaines · gamme premium' },
      spaBahia:      { title: 'Vous vs spas similaires',      sub: '42 spas haut de gamme · Casa / Marrakech' },
      fusion:        { title: 'Portfolio vs marchands multi-sites', sub: '38 marchands Kiwi · 3+ emplacements actifs' },
    },
    en: {
      cafeAtlas:     { title: 'You vs similar cafés',     sub: '147 Casablanca cafés · same avg ticket range' },
      maisonMansour: { title: 'You vs similar boutiques', sub: '89 Moroccan boutiques · premium range' },
      spaBahia:      { title: 'You vs similar spas',      sub: '42 high-end spas · Casa / Marrakech' },
      fusion:        { title: 'Portfolio vs multi-site merchants', sub: '38 Kiwi merchants · 3+ active locations' },
    },
    ar: {
      cafeAtlas:     { title: 'أنتم مقابل المقاهي المماثلة',   sub: '147 مقهى بالدار البيضاء · نفس متوسّط التذكرة' },
      maisonMansour: { title: 'أنتم مقابل المتاجر المماثلة',   sub: '89 متجرًا مغربيًا · الفئة الراقية' },
      spaBahia:      { title: 'أنتم مقابل المنتجعات المماثلة', sub: '42 منتجعًا راقيًا · الدار البيضاء / مراكش' },
      fusion:        { title: 'المحفظة مقابل التجار متعددي المواقع', sub: '38 تاجرًا في كيوي · 3+ مواقع نشطة' },
    },
  };

  /* ═══════════════ CUSTOM (USER-CREATED) VENUES ═══════════════
   * The onboarding wizard lets a merchant create their own venue. These carry
   * no demo data — dateRange.js's vData() hands back a zeroed dataset for them
   * — and persist in localStorage so they survive reloads. */
  const CUSTOM_KEY = 'kiwiCustomVenues';
  const customIds = new Set();

  /* Ids that exist only for the lifetime of a page: 'scoped' is the operator's
   * God-mode view of someone else's client, 'own' is the empty placeholder we
   * synthesize for a real merchant with nothing cached yet. Neither is a store
   * the merchant created, so neither may ever be written to localStorage. */
  const TRANSIENT_IDS = ['scoped', 'own'];
  function loadCustomVenues() {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch (_) {}
    if (!Array.isArray(saved)) saved = [];
    /* Drop any transient id an older build leaked into storage. 'own' used to be
     * persisted by the next persistCustomVenues() call after ensureOwnEmptyVenue()
     * ran — so creating a second store wrote the placeholder alongside it and the
     * merchant grew a phantom "Mon établissement · Restaurant" they never made,
     * which then sat in the switcher for good. Heal it on read. */
    const clean = saved.filter(v => v && v.id && TRANSIENT_IDS.indexOf(v.id) < 0);
    clean.forEach(v => { VENUES[v.id] = v; customIds.add(v.id); });
    if (clean.length !== saved.length) {
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(clean)); } catch (_) {}
    }
  }
  function persistCustomVenues() {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(
        [...customIds].filter(id => TRANSIENT_IDS.indexOf(id) < 0).map(id => VENUES[id])));
    } catch (_) {}
  }
  const isCustom = id => customIds.has(id || currentVenue);

  /* ═══ L'IDENTITÉ RÉSEAU D'UN ÉTABLISSEMENT ═════════════════════════════════
   * Le serveur ne connaît un magasin que par un slug — `merchant` — et c'est la
   * clé primaire de TOUT ce qui lui appartient : sa configuration, ses horaires,
   * son reçu, sa carte, son catalogue, ses codes équipe, ses clôtures, ses
   * ventes, l'appairage de sa caisse.
   *
   * Ce slug se calculait, partout, en slugifiant le NOM AFFICHÉ. Un nom
   * s'affiche, donc un nom se corrige — et corriger l'orthographe de son enseigne
   * ne devrait pas être un acte comptable. C'en était un : « Cafe Amira » devenu
   * « Amira Café » passait de `cafe-amira` à `amira-cafe`, un slug que personne
   * n'avait jamais vu. Rien ne suivait. Le serveur, lui, ne voyait pas un magasin
   * renommé mais un magasin INCONNU, et le premier bonjour venu lui en fabriquait
   * un neuf (functions/api/config.js › claimStore). La cliente se retrouvait avec
   * un établissement vide à reconfigurer, son historique orphelin sous l'ancien
   * slug, et la console en affichait trois là où son sélecteur en montrait deux.
   *
   * Le nom et l'identité sont donc séparés pour de bon. `venue.slug` est fixé une
   * fois — à la création, ou au premier regard pour les établissements d'avant —
   * et plus jamais recalculé. Renommer ne touche que l'étiquette ; le nouveau nom
   * part quand même au serveur (merchant-config.js › post), qui le range dans
   * `merchant_config.name` : la console affiche la correction, sous le même
   * magasin.
   *
   * Jumeau de functions/auth/_lib.js › slugMerchant. */
  function slugMerchant(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /* Le slug de CE magasin, la seule réponse à « où écrire ». Vide = on ne sait
   * pas, et l'appelant ne doit alors rien synchroniser (mieux vaut une page
   * locale qu'une écriture chez le voisin).
   *
   * Le rattrapage des établissements d'avant se fait ICI plutôt qu'au
   * renommage, et l'instant compte : au premier chargement qui suit le
   * déploiement, le nom local est encore celui que le serveur connaît, donc le
   * slug qu'on grave est le bon. Attendre le renommage pour le graver, c'est le
   * graver depuis un nom qu'on est en train de changer. */
  function slugOf(id) {
    const vid = id || currentVenue;
    const v = VENUES[vid];
    if (!v || !v.custom) return '';
    if (v.slug) return String(v.slug);
    const s = slugMerchant(v.name);
    if (!s) return '';
    v.slug = s;
    if (TRANSIENT_IDS.indexOf(vid) < 0) persistCustomVenues();
    return s;
  }

  /* Build + register a venue from the wizard config. Returns the new id. */
  function createVenue(cfg) {
    cfg = cfg || {};
    const plan = (isRealMerchant() ? (window.KiwiConfig?.plan || '') : currentPlan).toLowerCase();
    /* Ticket #0010 · the one-venue gate fires only on an explicitly stored
     * basic/pro tier. Legacy rows (plan unset server-side) read as Basic for
     * display, but the server lets them create — the client must agree, or
     * every second store is refused with "Création impossible". */
    const planExplicit = !!window.KiwiConfig?.planExplicit;
    const customCount = Object.keys(VENUES).filter(id => VENUES[id] && VENUES[id].custom && TRANSIENT_IDS.indexOf(id) < 0).length;
    if (isRealMerchant() && planExplicit && (plan === 'basic' || plan === 'pro') && customCount >= 1) {
      if (window.Kiwi && window.Kiwi.toast) {
        window.Kiwi.toast("Votre forfait couvre un établissement. Kiwi Ultra en gère un nombre illimité.", 6000);
      }
      return null;
    }
    const type = ['restaurant', 'boutique', 'spa', 'hotel'].includes(cfg.type) ? cfg.type : 'restaurant';
    const name = (cfg.name || 'Mon activité').trim();
    const location = (cfg.location || '').trim();
    const commit = () => {
      const id = 'v' + Date.now().toString(36);
      VENUES[id] = {
        id, name, location,
        fullDisplay: location ? `${name} · ${location}` : name,
        /* L'identité réseau, gravée au même nom que la déclaration acceptée par
         * le serveur. Elle ne suit plus les futurs changements de nom. */
        slug: slugMerchant(name),
        type,
        /* The trade picked at onboarding drives the subtype profile and label. */
        subtype: cfg.subtype || '',
        profileInfo: cfg.profile || null,
        siblings: '', status: 'En service', ice: '·',
        txCount: 0, staffCount: Math.max(0, +cfg.staffCount || 0), custom: true,
        hours: cfg.hours || '', methods: cfg.methods || '', goal: +cfg.goal || 0,
      };
      customIds.add(id);
      persistCustomVenues();
      /* The account switcher learns the new shop as soon as the server confirms
       * it, including when the owner creates it from Mon profil. */
      try { renderLocSwitch(); renderDropdown(); } catch (_) {}
      return id;
    };
    // Never persist a new real shop until its server row is confirmed.
    if (!isRealMerchant()) return commit();
    if (!window.KiwiConfig?.newStore) return Promise.resolve(null);
    return Promise.resolve(window.KiwiConfig.newStore({
      name, type: cfg.subtype || type, city: location, pins: cfg.pins,
    })).then((ok) => ok ? commit() : null).catch(() => null);
  }

  /* Patch an existing custom venue (name / location / trade / methods / goal)
   * from the Settings editor — persists and re-renders if it's active. */
  function updateVenue(id, patch) {
    id = id || currentVenue;
    const v = VENUES[id];
    if (!v || !customIds.has(id) || !patch) return false;
    /* LE MÉTIER. Il ne se modifiait nulle part : choisi une fois à
     * l'inscription, il était ensuite gravé. Un café qui devient restaurant,
     * une boutique qui ouvre un salon — le propriétaire n'avait aucun moyen de
     * le dire, et la fiche établissement lui offrait à la place un champ libre
     * qui ne changeait rien. On n'accepte qu'un métier connu (assets/trades.js
     * via SUBTYPE_BASE) : un métier inventé ne correspond à aucun écran.
     * Changer le métier change la famille, donc les modules — c'est le but. */
    if (patch.subtype != null) {
      const want = String(patch.subtype).trim();
      const nb = SUBTYPE_BASE[want] || (TYPE_BASES.indexOf(want) >= 0 ? want : null);
      if (nb) {
        v.subtype = want;
        v.type = nb;
        /* Un type poussé par le serveur ne doit pas écraser le choix que le
         * propriétaire vient de faire de sa main sur SON établissement. */
        if (id === currentVenue) typeOverride = null;
      }
    }
    /* Graver l'identité AVANT de toucher au nom, jamais après : c'est tout le
     * correctif. Un établissement d'avant ce code arrive ici sans slug, et le
     * seul nom qui désigne encore son magasin côté serveur est celui qu'on
     * s'apprête à remplacer. Le lire une ligne trop tard, c'est fabriquer le
     * magasin fantôme qu'on cherche à empêcher. */
    if (patch.name != null && !v.slug) v.slug = slugMerchant(v.name);
    if (patch.name != null)     v.name = String(patch.name).trim() || v.name;
    if (patch.location != null) v.location = String(patch.location).trim();
    if (patch.hours != null)    v.hours = String(patch.hours).trim();
    if (patch.methods != null)  v.methods = String(patch.methods).trim();
    if (patch.goal != null)     v.goal = Math.max(0, +patch.goal || 0);
    v.fullDisplay = v.location ? `${v.name} · ${v.location}` : v.name;
    persistCustomVenues();
    if (id === currentVenue) {
      renderAll();
      subscribers.forEach(fn => { try { fn(id); } catch (_) {} });
    }
    return true;
  }
  loadCustomVenues();

  /* ═══════════════ STATE ═══════════════ */

  const getVenue = () => currentVenue;
  /* Public venue metadata is also a data boundary. During the short identity /
     pairing gap, currentVenue may still name Café Atlas; no consumer should be
     able to obtain that demo identity simply because reconciliation has not
     painted yet. */
  const safeVenueData = (id) => {
    const key = id || currentVenue;
    if (isRealMerchant() && !isCustom(key)) {
      if (!VENUES.own) ensureOwnEmptyVenue();
      return VENUES.own;
    }
    return VENUES[key] || VENUES[currentVenue];
  };
  const getVenueData = id => safeVenueData(id);
  const getCurrentVenueData = () => safeVenueData(currentVenue);
  // typeOverride: the authoritative business type for the ACTIVE venue, pushed in
  // from the server (merchant_config.type) via applyServerType. Transient — never
  // persisted — so it fixes what the operator sees when scoped into a client
  // (?op=1&merchant=…) without mutating their own local venue. null = use the
  // venue's own type (the multi-venue demo is untouched: no server type ⇒ no call).
  let typeOverride = null;
  // scopedActive: the OPERATOR (God mode) is viewing a client via ?op/?merchant.
  // The switcher then lists ONLY that client as a single zeroed venue (the custom
  // venue data path already hands back zeros), never the operator's own local
  // venues — so one browser's test venues can never bleed into a client view.
  // Transient: the synthetic 'scoped' venue is never persisted (see
  // persistCustomVenues) and is rebuilt from the server on each scoped load.
  let scopedActive = false;
  // Les AUTRES établissements du même client, quand l'opérateur en regarde un.
  // Un compte peut tenir une boutique et un restaurant ; n'en montrer qu'un
  // laissait croire que le client n'en avait qu'un, et il n'existait aucun
  // chemin vers le second — il fallait ressortir vers la console. Ce sont des
  // lignes de NAVIGATION, pas des venues : elles n'entrent jamais dans VENUES ni
  // dans customIds (donc ni persistance, ni comptage, ni fusion), et un clic
  // recharge la page sur le slug voulu — le seul moyen sûr de faire suivre
  // d'un coup la config, le flux de ventes, l'identité et le rapport du jour.
  // [{ slug, name, location, type }]
  let scopedSiblings = [];
  const getVenueType = id => ((!id || id === currentVenue) && typeOverride)
    ? typeOverride
    : safeVenueData(id)?.type;

  // Map an onboarding subtype (or a base) to its base vertical.
  const TYPE_BASES = ['restaurant', 'boutique', 'spa', 'hotel'];
  /* Cette table doit connaître TOUS les métiers que les assistants proposent.
   * Écrite à la main, elle a raté « traiteur » et « librairie » — proposés au
   * PIN 0000 mais absents ici, donc un traiteur retombait sur la famille par
   * défaut et le type renvoyé par le serveur ne s'appliquait jamais chez lui.
   * On la construit maintenant depuis la liste unique (assets/trades.js) ; le
   * littéral reste le filet quand venues.js tourne seul. */
  const SUBTYPE_BASE = (() => {
    const m = {
      restaurant: 'restaurant', cafe: 'restaurant', fastfood: 'restaurant',
      bakery: 'restaurant', pizzeria: 'restaurant', foodtruck: 'restaurant',
      traiteur: 'restaurant',
      boutique: 'boutique', epicerie: 'boutique', pharmacie: 'boutique',
      fleuriste: 'boutique', librairie: 'boutique', autre: 'boutique',
      spa: 'spa', coiffure: 'spa', sport: 'spa',
      hotel: 'hotel',
    };
    try {
      const T = window.KiwiTrades;
      if (T && T.LIST) T.LIST.forEach((t) => { if (TYPE_BASES.indexOf(t.base) >= 0) m[t.id] = t.base; });
    } catch (_) {}
    return m;
  })();
  // Make the server-stored type authoritative for the current venue's sidebar
  // section + KPI band. Only ever changes anything when a real type is supplied
  // and it differs from what's shown, so a plain demo session is a no-op.
  let lastServerTypeSig = '';
  function serverTypeSig() {
    const v = VENUES[currentVenue] || {};
    const C = window.KiwiConfig || {};
    return [currentVenue, getVenueType(), v.subtype || '', C.timezone || '', C.businessCutoff == null ? '' : C.businessCutoff].join('|');
  }
  function applyServerType(subtypeOrBase) {
    const base = SUBTYPE_BASE[subtypeOrBase] ||
      (TYPE_BASES.indexOf(subtypeOrBase) >= 0 ? subtypeOrBase : null);
    if (!base || currentVenue === 'fusion') return false;
    const exactSubtype = SUBTYPE_PROFILES[subtypeOrBase] ? subtypeOrBase : '';
    const active = VENUES[currentVenue];
    /* The family alone is not enough for a specialist workspace. A server can
       correctly say `pressing`, resolve it to family `boutique`, and still be
       ignored here because the transient venue was already a boutique. That is
       exactly how a pressing inherited retail returns/promotions forever. Keep
       the precise trade on transient server-backed venues before the early exit. */
    if (exactSubtype && active && (currentVenue === 'own' || currentVenue === 'scoped')) {
      active.subtype = exactSubtype;
    }
    if (base === getVenueType() && (!exactSubtype || (active && active.subtype === exactSubtype))) {
      try { renderVerticalSection({ skipFade: true }); } catch (_) {}
      /* The config is fetched again on every window focus, and applied twice
         each time (now, and 500 ms later). Notifying every subscriber for an
         unchanged store re-rendered the whole dashboard twice per return to
         the tab: 1.2 s of frozen page on Santos (2026-10-22). Subscribers hear
         it once per store, trade and day boundary, as they need to. */
      if (serverTypeSig() !== lastServerTypeSig) {
        lastServerTypeSig = serverTypeSig();
        subscribers.forEach(fn => { try { fn(currentVenue); } catch (_) {} });
      }
      return false;
    }
    typeOverride = base;
    // If the ACTIVE venue is a transient synthetic one (a real merchant's empty
    // "own" venue, or the operator 'scoped' venue), also correct its stored type
    // so surfaces that read venue.type directly agree with getVenueType() — the
    // displayed label follows from it (typeLabelOf). Otherwise the sidebar section
    // flips to boutique while the header chip / KPI band still read the boot-time
    // 'restaurant'. Transient venues only.
    if ((currentVenue === 'own' || currentVenue === 'scoped') && VENUES[currentVenue]) {
      VENUES[currentVenue].type = base;
      if (exactSubtype) VENUES[currentVenue].subtype = exactSubtype;
    }
    try { renderVerticalSection({ skipFade: true }); } catch (_) {}
    /* Same guard: a trade that is also a subtype profile (`restaurant`) on a
       store that cannot hold a subtype lands here on every application. */
    if (serverTypeSig() !== lastServerTypeSig) {
      lastServerTypeSig = serverTypeSig();
      subscribers.forEach(fn => { try { fn(currentVenue); } catch (_) {} });
    }
    return true;
  }

  /* Un opérateur ouvre plusieurs clients l'un après l'autre, et TOUS passent
   * sous le même identifiant local `scoped` : `kiwi:hours:v1:scoped` contient
   * donc encore les horaires du client précédent quand le suivant s'affiche.
   * Ce n'est pas seulement un affichage faux — cloud-doc.js fusionne la copie
   * locale avec celle du serveur avant de repousser, donc la semaine du client A
   * finirait ÉCRITE sur le document du client B. On efface la copie portée dès
   * que le magasin regardé change. Rien n'est perdu : ces enregistrements ne
   * sont qu'un cache de ce que le serveur détient. */
  const SCOPE_MARK = 'kiwiScopedSlug';
  const SCOPED_REC = /^kiwi:[^:]+:v1:scoped$/;
  /* Le cache des ventes de la vue opérateur est nommé par locataire
   * (`kiwiSales:scoped@<slug>`) : on garde CELUI du client regardé et on jette
   * les autres. Sans ce ménage, un opérateur qui visite vingt magasins traîne
   * vingt historiques et finit par saturer le quota du navigateur. */
  const SCOPED_SALES = /^kiwiSales:scoped@(.+)$/;
  const SCOPED_PDS = /^kiwiPlanDeSalle:scoped@(.+)$/;
  function resetScopedRecords(slug) {
    try {
      const mark = slug || '-';                       // '-' : magasin inconnu
      if (localStorage.getItem(SCOPE_MARK) === mark) return;
      const doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (SCOPED_REC.test(k) || k === 'kiwiPlanDeSalle:scoped' || k === 'kiwiPlanDeSalle:own')) { doomed.push(k); continue; }
        const m = k && SCOPED_SALES.exec(k);
        if (m && m[1] !== mark) { doomed.push(k); continue; }
        const mp = k && SCOPED_PDS.exec(k);
        if (mp && mp[1] !== mark) doomed.push(k);
      }
      doomed.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
      localStorage.setItem(SCOPE_MARK, mark);
    } catch (_) {}
  }

  /* Enter operator-scoped mode: replace whatever the operator's browser has
   * locally with a single synthetic venue that IS the scoped client. Called by
   * identity.js only after the server confirms an operator cookie (God mode), so
   * a real client can never trigger it. The venue carries no data (custom path ⇒
   * zeros); the figures come from the live feed, which ?op=1 forces on.
   * Transient + never persisted.
   *
   * `info.siblings` = les autres établissements du même compte, s'il y en a. Ils
   * ne deviennent pas des venues (voir scopedSiblings) : ils s'affichent sous
   * l'établissement regardé et un clic recharge la page sur eux.
   *
   * `info.slug` = le magasin CÔTÉ SERVEUR, tel que /api/me l'a résolu. Sans lui
   * la vue portée n'avait aucune identité réseau : cloud-doc.js refusait de
   * synchroniser un identifiant transitoire, donc l'opérateur voyait tous les
   * documents d'établissement (horaires, reçu, équipe, fidélité, plan de salle,
   * rapports de clôture) vides alors qu'ils existaient bel et bien en ligne. On
   * ne le devine PAS du nom affiché : un magasin peut s'appeler autrement que
   * son slug d'inscription, et se tromper de slug fait écrire chez le voisin. */
  function applyScopedVenue(info) {
    info = info || {};
    const slug = String(info.slug || '').trim();
    resetScopedRecords(slug);
    const name = String(info.name || '').trim() || 'Client';
    const location = String(info.location || '').trim();
    const base = SUBTYPE_BASE[info.type] ||
      (TYPE_BASES.indexOf(info.type) >= 0 ? info.type : 'restaurant');
    /* Le métier précis, pas seulement sa famille. Le serveur range « cafe », et
     * la famille de « cafe » est « restaurant » : ne garder que la famille faisait
     * lire « Restaurant » au-dessus d'un café, et privait la vue portée du
     * vocabulaire de son métier. On garde donc les deux — subtype quand c'est un
     * métier connu de la liste (assets/trades.js), la famille pour le reste. */
    const subtypeOf = t => (SUBTYPE_BASE[t] ? String(t) : '');
    scopedSiblings = (Array.isArray(info.siblings) ? info.siblings : [])
      .filter(s => s && String(s.slug || '').trim())
      .map(s => ({
        slug: String(s.slug).trim(),
        name: String(s.name || '').trim() || String(s.slug).trim(),
        location: String(s.location || '').trim(),
        type: SUBTYPE_BASE[s.type] || (TYPE_BASES.indexOf(s.type) >= 0 ? s.type : 'restaurant'),
        subtype: subtypeOf(s.type),
      }));
    VENUES.scoped = {
      id: 'scoped', name, location, slug,
      fullDisplay: location ? `${name} · ${location}` : name,
      type: base,
      subtype: subtypeOf(info.type), profileInfo: null,
      siblings: '', status: 'En service', ice: '·',
      txCount: 0, staffCount: 0, custom: true,
      hours: '', methods: '', goal: 0,
    };
    customIds.add('scoped');   // zeroed-data custom path (never persisted)
    scopedActive = true;
    typeOverride = null;
    currentVenue = 'scoped';   // set directly — do NOT write STORAGE_KEY for a scoped view
    document.body.classList.remove('fusion-mode');
    try { renderAll(); } catch (_) {}
    subscribers.forEach(fn => { try { fn('scoped'); } catch (_) {} });
    return true;
  }

  /* Synthesize a single EMPTY "own" venue for a real merchant who is signed in /
   * onboarded but has NONE of their own venues cached in this browser (fresh
   * device, cleared storage, or a stale kiwiOnboarded='1' with no kiwiVenue).
   * Without this, init() used to fall through to DEFAULT_VENUE = 'cafeAtlas' and
   * the whole dashboard rendered the Café Atlas demo (its KPIs, ICE footer,
   * suppliers, benchmarks…). An 'own' custom venue makes isCustom() true, so
   * every demo surface zeroes out. Unlike applyScopedVenue this is NOT operator
   * God-mode — scopedActive stays false so the onboarding CTA can still show.
   * The name comes from the real session (KiwiMe) when known; identity.js /
   * onboarding overwrite it once the store is set up. Returns the venue id. */
  function ensureOwnEmptyVenue() {
    const me = window.KiwiMe || {};
    let paired = null;
    try {
      paired = (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function' && window.KiwiPlatform.pairedVenue())
        || window.KiwiCaissePairing?.pairedVenue?.()
        || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) {}
    const ownType = me.type || (paired && (paired.subtype || paired.type)) || '';
    const name = String(me.business || me.name || (paired && paired.name) || '').trim() || 'Mon établissement';
    // No trade is known before /api/me answers. A fresh hotel or boutique must
    // not briefly render the restaurant workspace as if it were theirs.
    const base = SUBTYPE_BASE[ownType] ||
      (TYPE_BASES.indexOf(ownType) >= 0 ? ownType : '');
    const location = String(me.city || (paired && paired.location) || '').trim();
    VENUES.own = {
      id: 'own', name, location,
      fullDisplay: location ? `${name} · ${location}` : name,
      type: base,
      subtype: ownType, profileInfo: null,
      siblings: '', status: 'En service', ice: '·',
      txCount: 0, staffCount: 0, custom: true,
      hours: '', methods: '', goal: 0,
    };
    customIds.add('own');   // zeroed-data custom path (never persisted)
    return 'own';
  }

  /* Put the merchant's REAL établissements back on a browser that has none.
   *
   * A store's data lives in D1 under the slug of its NAME (assets/merchant-config
   * .js → storeSlug), but the LIST of stores lived only in this browser's
   * kiwiCustomVenues. So a merchant who opened Kiwi on a second device saw one
   * synthetic "Mon établissement" instead of their shops. /api/me now returns the
   * stores the account owns (functions/api/me.js → establishments); identity.js
   * hands them here.
   *
   * Two rules keep this from ever inventing or resurrecting anything:
   *   · It only fills an EMPTY browser. A merchant who already has stores here
   *     keeps precisely what they have — adopting into a populated list is how
   *     you would bring back a store somebody removed on this device.
   *   · Ids derive from the slug, never from the clock, so a reload or a second
   *     tab re-running this cannot grow a duplicate établissement.
   * Restored stores carry no figures, which is the honest truth: sales and
   * catalogues are fetched per store, they are not part of the registry. */
  function adoptServerStores(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    // Anything real already cached → leave this browser alone.
    for (const id of customIds) if (TRANSIENT_IDS.indexOf(id) < 0) return 0;

    const seen = new Set();
    let first = null;
    list.forEach((s) => {
      const slug = String((s && s.merchant) || '').trim();
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      const id = 'v-' + slug;
      if (VENUES[id]) return;
      const name = String((s && s.name) || '').trim()
        || slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const base = SUBTYPE_BASE[s && s.type] ||
        (TYPE_BASES.indexOf(s && s.type) >= 0 ? s.type : 'restaurant');
      const location = String((s && s.city) || '').trim();
      VENUES[id] = {
        id, name, location,
        fullDisplay: location ? `${name} · ${location}` : name,
        /* Ici le slug ne se déduit pas, il se sait : il vient du registre du
         * serveur. C'est même la seule source qui ne peut pas se tromper — et
         * elle vaut mieux que le nom, qui n'est qu'un reflet. */
        slug,
        type: base,
        subtype: (s && s.type) || '', profileInfo: null,
        siblings: '', status: 'En service', ice: '·',
        txCount: 0, staffCount: 0, custom: true,
        hours: '', methods: '', goal: 0,
      };
      customIds.add(id);
      if (!first) first = id;
    });
    if (!first) return 0;
    persistCustomVenues();
    // They were looking at the synthetic placeholder; move them into a real
    // store of theirs. setVenue persists the choice and re-renders.
    if (currentVenue === 'own') setVenue(first);
    else { try { renderAll({ skipFade: true }); } catch (_) {} }
    return seen.size;
  }

  function setVenue(id) {
    if (!VALID.includes(id) && !customIds.has(id)) return;
    if (id === currentVenue) return;
    typeOverride = null;   // switching venues drops any server-type override
    // Switching to a real / custom venue from anywhere → ensure fusion-mode is off.
    // (Switching INTO fusion goes through enterFusion(), not setVenue.)
    if (REAL_VENUES.includes(id) || customIds.has(id)) document.body.classList.remove('fusion-mode');
    currentVenue = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
    /* A venue switch is a context change, not a deep link. Always return to
       that venue's dashboard so a restaurant never inherits the previous
       venue's Menu (or any other full-page module). */
    try {
      window.Kiwi?.pageShell?.();
      window.Kiwi?.setActivePage?.('accueil');
      window.Kiwi?.breadcrumb?.();
      window.scrollTo({ top: 0 });
    } catch (_) {}
    renderAll();
    subscribers.forEach(fn => { try { fn(id); } catch (_) {} });
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  /* ═══════════════ RENDER: SIDEBAR LOC-SWITCH (top of sidebar) ═══════════════ */

  function renderLocSwitch() {
    const v = safeVenueData(currentVenue);
    const nameEl = document.querySelector('[data-loc-name]');
    const metaEl = document.querySelector('[data-loc-meta]');
    if (nameEl) nameEl.textContent = v.fullDisplay;
    const slang = window.KiwiI18n?.getLang?.() || 'fr';
    if (metaEl) metaEl.textContent = (isRealMerchant() && !isCustom(currentVenue))
      ? (v.siblings || '')
      : (SIBLINGS[slang]?.[currentVenue] || SIBLINGS.fr[currentVenue] || v.siblings || '');
    // ✦ Kiwi Ultra · only visible when fusion + ultra plan
    const ultraEl = document.querySelector('[data-loc-ultra]');
    if (ultraEl) {
      if (currentVenue === 'fusion' && currentPlan === 'ultra') ultraEl.removeAttribute('hidden');
      else ultraEl.setAttribute('hidden', '');
    }
    // Chevron rotation tied to dropdownOpen handled in toggleDropdown()
  }

  /* ═══════════════ RENDER: SIDEBAR APP INSTALL / PLAN STATUS ═══════════════
   * The sidebar slot is the install card, not a price tag. dashboard-pwa.js
   * enhances the same markup into the live browser install flow; writing it
   * here too means a slow or cached PWA controller can never resurrect the
   * retired "Passer à Ultra" promotion on a venue switch or a language change.
   * The fusion + ultra branch below is the fail-soft path only: it is the
   * billing-status card (not a sell), and it surfaces just when the PWA
   * controller is absent — otherwise dashboard-pwa.js writes the install
   * card over it, which is the same behaviour prod already had. */
  const UPSELL_STR = {
    fr: { active: 'Actif · renouvellement 14.06.2026', manage: 'Gérer mon abonnement →' },
    en: { active: 'Active · renews 14.06.2026', manage: 'Manage my subscription →' },
    ar: { active: 'نشط · يتجدد 14.06.2026', manage: 'إدارة اشتراكي ←' },
  };
  const APP_INSTALL_STR = {
    fr: { eye: 'APPLICATION KIWI', title: 'Kiwi, toujours à portée de main.', body: 'Installez votre tableau de bord pour un accès rapide, même avec une connexion instable.', quick: 'Accès rapide', offline: 'Prêt hors ligne', cta: 'Installer Kiwi' },
    en: { eye: 'KIWI APP', title: 'Kiwi, always within reach.', body: 'Install your dashboard for faster access, even when your connection is unreliable.', quick: 'Quick access', offline: 'Offline ready', cta: 'Install Kiwi' },
    ar: { eye: 'تطبيق KIWI', title: 'Kiwi في متناول يدك دائماً.', body: 'ثبّت لوحة التحكم للوصول السريع حتى عندما يكون الاتصال غير مستقر.', quick: 'وصول سريع', offline: 'يعمل دون اتصال', cta: 'تثبيت Kiwi' },
  };
  function renderUpsell() {
    const wrap = document.querySelector('[data-upsell]');
    if (!wrap) return;
    if (currentVenue === 'fusion' && currentPlan === 'ultra') {
      const U = UPSELL_STR[fusionLang()] || UPSELL_STR.fr;
      wrap.className = 'upsell upsell-status';
      wrap.innerHTML = `
        <div class="t">✦ KIWI ULTRA</div>
        <div class="us-line">${U.active}</div>
        <a href="#" class="us-manage" data-action="manage-billing">${U.manage}</a>
      `;
      return;
    }
    const A = APP_INSTALL_STR[fusionLang()] || APP_INSTALL_STR.fr;
    wrap.className = 'upsell kiwi-app-install-card';
    wrap.innerHTML = `
      <div class="kiwi-install-head"><span class="kiwi-install-mark" aria-hidden="true"><img src="assets/kiwi-favicon-new.svg" alt="" width="18" height="18"></span><span class="t">${A.eye}</span></div>
      <h4>${A.title}</h4>
      <p>${A.body}</p>
      <div class="kiwi-install-benefits"><span><i></i>${A.quick}</span><span><i></i>${A.offline}</span></div>
      <button type="button" data-pwa-install><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/></svg><span>${A.cta}</span></button>
    `;
  }

  /* ═══════════════ RENDER: SIDEBAR DROPDOWN ═══════════════ */

  /* One icon truth for every surface. The old switcher had a second, family-
   * level Lucide table, so a pressing inherited Boutique's shopping bag and a
   * café inherited Restaurant's cutlery. KiwiTrades already owns the precise
   * Material Symbol for every trade; resolve the subtype first and use the
   * broad family only as a fallback for older venue records. */
  const MATERIAL_VENUE_FALLBACK = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m260-520 220-360 220 360H260ZM700-80q-75 0-127.5-52.5T520-260q0-75 52.5-127.5T700-440q75 0 127.5 52.5T880-260q0 75-52.5 127.5T700-80Zm-580-20v-320h320v320H120Z"/></svg>';
  function typeIconOf(v) {
    const trades = window.KiwiTrades;
    if (trades?.get) {
      const exact = trades.get(v?.subtype || '');
      if (exact?.icon) return exact.icon;
      const family = trades.get(v?.type || '');
      if (family?.icon) return family.icon;
    }
    return MATERIAL_VENUE_FALLBACK;
  }

  const DROPDOWN_CTA = {
    fr: { exitT: 'Revenir à la vue simple', exitS: 'Repasser sur un seul emplacement', enterT: 'Go Ultra', enterS: 'Vue consolidée · données multi-sites', addT: 'Ajouter un établissement', addS: 'Une autre activité, un autre lieu' },
    en: { exitT: 'Back to single view', exitS: 'Return to a single location', enterT: 'Go Ultra', enterS: 'Consolidated view · multi-site data', addT: 'Add a venue', addS: 'Another business, another location' },
    ar: { exitT: 'العودة إلى العرض البسيط', exitS: 'الرجوع إلى موقع واحد', enterT: 'Go Ultra', enterS: 'عرض موحّد · بيانات متعدّدة المواقع', addT: 'إضافة منشأة', addS: 'نشاط آخر، موقع آخر' },
  };

  function renderDropdown() {
    const wrap = document.querySelector('[data-venue-dropdown]');
    if (!wrap) return;
    const dd = DROPDOWN_CTA[fusionLang()] || DROPDOWN_CTA.fr;
    const inFusion = currentVenue === 'fusion';
    /* Client account — their switcher lists ONLY their own venues. Café Atlas,
     * Maison Mansour & Spa Bahia are demo-session material and must never leak
     * into a real merchant's switcher (nor the fusion/portfolio view, whose
     * data is hardcoded from those demo venues). Two ways in: the in-session
     * 0000 flag, or a persisted onboarding (kiwiOnboarded) from the setup
     * wizard — a returning client logs in with their own PIN, not 0000, so the
     * session flag alone isn't enough. */
    let persistedClient = false;
    try { persistedClient = localStorage.getItem('kiwiOnboarded') === '1'; } catch (_) {}
    const onboard = !!window.__kiwiOnboard || persistedClient || isRealMerchant();
    // Operator-scoped (God mode): show ONLY the scoped client, never the
    // operator's own local venues (those are this browser's test cache). Les
    // autres établissements DU CLIENT s'ajoutent en dessous (scopeRows).
    const listIds = scopedActive
      ? ['scoped']
      : onboard
        /* Transient ids ('own' placeholder, 'scoped' operator view) are listed
         * only while one of them IS the active venue — i.e. the genuine empty
         * state. Once the merchant has real stores, the placeholder must not sit
         * in the switcher next to them pretending to be a fourth business. */
        ? Object.keys(VENUES).filter(id => VENUES[id] && VENUES[id].custom &&
            (TRANSIENT_IDS.indexOf(id) < 0 || id === currentVenue))
        : REAL_VENUES;
    /* Custom venue names/locations are merchant-typed — escape them. */
    const escD = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const venueRows = listIds.map(id => {
      const v = VENUES[id];
      const isActive = !inFusion && id === currentVenue;
      return `
        <button data-activation=write type="button" class="venue-row${isActive ? ' active' : ''}" data-action="venue-pick" data-venue="${escD(id)}">
          <div class="venue-row-icon">${typeIconOf(v)}</div>
          <div class="venue-row-body">
            <div class="venue-row-name">${escD(v.name)}${v.location ? ' · ' + escD(v.location) : ''}</div>
            <div class="venue-row-type">${escD(typeLabelOf(v))}</div>
          </div>
          <div class="venue-row-status" aria-label="${escD(v.status || 'en service')}"><i></i></div>
        </button>
      `;
    }).join('');

    // CTA appended at the bottom of the dropdown — toggles fusion mode.
    // Fresh-merchant session: the fusion view aggregates DEMO venues, so the
    // CTA becomes "add a venue" (opens the onboarding wizard) instead.
    const cta = scopedActive ? '' : onboard ? `
        <button type="button" class="venue-action fusion-cta" data-action="onboard">
          <div class="va-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <div class="va-body">
            <div class="va-title">${dd.addT}</div>
            <div class="va-sub">${dd.addS}</div>
          </div>
        </button>
      ` : inFusion ? `
        <button type="button" class="venue-action return-cta" data-action="venue-exit-fusion">
          <div class="va-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </div>
          <div class="va-body">
            <div class="va-title">${dd.exitT}</div>
            <div class="va-sub" style="font-size:11px;color:var(--n-500);margin-top:1px;">${dd.exitS}</div>
          </div>
        </button>
      ` : `
        <button type="button" class="venue-action fusion-cta" data-action="venue-enter-fusion">
          <div class="va-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M8 8l3.5 7M16 8l-3.5 7"/></svg>
          </div>
          <div class="va-body">
            <div class="va-title">${dd.enterT}</div>
            <div class="va-sub">${dd.enterS}</div>
          </div>
        </button>
      `;

    /* Les autres établissements du client regardé (God mode). Même dessin que
     * les vraies lignes — pour l'opérateur c'est le même geste — mais une action
     * distincte : on ne bascule pas une venue en mémoire, on RECHARGE sur le
     * slug. Tout ce qui est porté sur l'établissement (config, PINs, flux de
     * ventes, rapport du jour, identité) est dérivé de ?merchant= au chargement ;
     * un basculement à chaud en laisserait la moitié sur le magasin précédent. */
    const scopeRows = scopedActive ? scopedSiblings.map(s => `
        <button type="button" class="venue-row" data-action="venue-scope" data-scope-slug="${escD(s.slug)}">
          <div class="venue-row-icon">${typeIconOf(s)}</div>
          <div class="venue-row-body">
            <div class="venue-row-name">${escD(s.name)}${s.location ? ' · ' + escD(s.location) : ''}</div>
            <div class="venue-row-type">${escD(typeLabelOf({ type: s.type, subtype: s.subtype || '' }))}</div>
          </div>
          <div class="venue-row-status" aria-label="en service"><i></i></div>
        </button>
      `).join('') : '';

    wrap.innerHTML = venueRows + scopeRows + cta;
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
    if (sw) sw.setAttribute('aria-expanded', dropdownOpen ? 'true' : 'false');
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

  /* Sidebar block shown in fusion mode in place of the per-vertical section.
   * 4 cross-store KPIs that only make sense at the portfolio level. */
  function fusionSidebarHtml() {
    const ultraPill = currentPlan === 'ultra'
      ? '<span class="fk-ultra">✦ ULTRA</span>'
      : '';
    return `
      <div class="fusion-kpis">
        <div class="fk-head"><i></i><span>VUE PORTFOLIO</span>${ultraPill}</div>
        <div class="fk-row"><span class="fk-l">Emplacements actifs</span><span class="fk-v">3 / 3</span></div>
        <div class="fk-row"><span class="fk-l">CA cumulé · 30j</span><span class="fk-v">1,47 M MAD</span></div>
        <div class="fk-row"><span class="fk-l">Top site</span><span class="fk-v">Café Atlas</span></div>
        <div class="fk-row"><span class="fk-l">Personnel total</span><span class="fk-v">14</span></div>
        <div class="fk-row"><span class="fk-l">Clients cross-site</span><span class="fk-v">312</span></div>
      </div>
    `;
  }

  /* Trade vocabulary for the current venue's home cards — subtype vocab
   * wins, base-vertical vocab fills the gaps, null means "use defaults".
   * Returns the section resolved for the current language: an object for
   * card dicts ({title, head, msg…}), a string for one-liners. */
  function getVocab(section) {
    const v = safeVenueData(currentVenue);
    if (!v || !v.custom) return null;
    const prof = v.subtype && SUBTYPE_PROFILES[v.subtype];
    const fromProf = prof && prof.vocab && prof.vocab[section];
    const fromBase = BASE_VOCAB[v.type] && BASE_VOCAB[v.type][section];
    if (!fromProf && !fromBase) return null;
    const lang = subLang();
    const pickSec = sec => (sec == null ? null : (sec[lang] ?? sec.fr ?? null));
    const b = pickSec(fromBase), p = pickSec(fromProf);
    if (typeof p === 'string' || typeof b === 'string') return p || b;
    // Lists (aiChips…) are replaced wholesale, never merged — spreading an array
    // into the object branch below would hand the caller {0:…,1:…,2:…}.
    if (Array.isArray(p) || Array.isArray(b)) return p || b;
    return { ...(b || {}), ...(p || {}) };
  }

  /* The sidebar's "Commandes" nav entry follows the trade too — a gym logs
   * passages, a boutique ventes. Defaults mirror i18n.js dash.sidebar.orders
   * (this runs after i18n's langchange listener, so it has the last word). */
  const NAV_ORDERS_STR = { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' };
  /* The kitchen display is an operational caisse surface, not a dashboard
   * workspace. Keep the KDS implementation available to the caisse while
   * omitting its shortcut from every dashboard vertical/subtype sidebar. */
  const DASHBOARD_HIDDEN_NAV = new Set(['kds']);
  /* A nav tag is written in the screen's language. « LIVE » is what French and
   * English both say; Arabic says « مباشر », as dash.live already does. « IA »
   * is French only: English reads « AI », Arabic « ذكاء اصطناعي ». */
  const NAV_TAG_TEXT = { LIVE: { ar: 'مباشر' }, IA: { en: 'AI', ar: 'ذكاء اصطناعي' } };
  const navTag = (tag, lang) => (NAV_TAG_TEXT[tag] && NAV_TAG_TEXT[tag][lang]) || tag;
  function relabelOrdersNav() {
    const span = document.querySelector('[data-nav="transactions"] span[data-i18n="dash.sidebar.orders"]');
    if (!span) return;
    const trade = getVocab('navOrders');
    span.textContent = trade || NAV_ORDERS_STR[subLang()] || NAV_ORDERS_STR.fr;
  }

  function renderVerticalSection(opts = {}) {
    relabelOrdersNav();
    const wrap = document.querySelector('[data-vertical-section]');
    if (!wrap) return;
    /* Hotels use the same client book as every other Kiwi store. The former
     * `hotes` entry opened a second, hotel-only mock page, so a guest captured
     * at reception and a client visible to the owner could become unrelated
     * records. Keep one shared entry below Rapport journalier, and give it the
     * hotel-facing Hospitality+ name while this venue is active. */
    const crmLabel = document.querySelector('.sidebar nav a[data-action="clients-directory"] span');
    if (crmLabel) {
      const activeType = currentVenue === 'fusion' ? '' : (typeOverride || safeVenueData(currentVenue)?.type || '');
      if (activeType === 'hotel') {
        crmLabel.removeAttribute('data-i18n');
        crmLabel.textContent = 'Hospitality+';
      } else {
        crmLabel.setAttribute('data-i18n', 'dash.sidebar.crm');
        /* « & Marketing » seulement quand les campagnes existent pour ce
           commerce (ultraCampaigns) : sans elles, la page est un carnet de
           clients, et les relances vivent dans Fidélisation. */
        const campaigns = window.KiwiConfig?.features?.ultraCampaigns === true;
        const labels = campaigns
          ? { fr: 'Clients & Marketing', en: 'Customers & Marketing', ar: 'العملاء والتسويق' }
          : { fr: 'Clients', en: 'Customers', ar: 'العملاء' };
        crmLabel.textContent = labels[subLang()] || labels.fr;
      }
    }
    // In fusion mode: replace the per-vertical menu with the aggregated
    // portfolio KPI block. Same fade-in/out as the regular swap.
    if (currentVenue === 'fusion') {
      if (isRealMerchant()) { wrap.innerHTML = ''; return; }
      const html = fusionSidebarHtml();
      if (opts.skipFade) { wrap.innerHTML = html; return; }
      wrap.classList.add('vert-fading');
      setTimeout(() => {
        wrap.innerHTML = html;
        wrap.offsetHeight;
        wrap.classList.remove('vert-fading');
      }, 150);
      return;
    }
    const v = safeVenueData(currentVenue);
    let sect = VERTICAL_SECTIONS[typeOverride || v.type];
    /* Subtype profile override — a custom venue created as e.g. a pharmacy
     * gets ITS trade's section labels (nav keys stay on the base family's
     * real modules). No data-i18n keys here: labels resolve per-language at
     * render time and the section re-renders on kiwi:langchange.
     * Skipped when a server typeOverride is in force: that means "render this
     * base's standard section" for a scoped view, so the LOCAL venue's own
     * subtype must not relabel it into a different trade. */
    const prof = !typeOverride && v.custom && v.subtype && SUBTYPE_PROFILES[v.subtype];
    if (prof && prof.items && sect) {
      const baseItems = sect.items;
      sect = {
        header: pickL(prof.header),
        i18nHeader: '',
        items: prof.items.map((pi) => {
          const b = baseItems.find((x) => x.nav === pi.nav) || {};
          return { nav: pi.nav, label: pickL(pi.label), i18n: '', tag: pi.tag || '', icon: pi.icon || b.icon || '', material: !!pi.material };
        }),
      };
    }
    /* Tous les sous-métiers boutique gardent la vue Vendus, même si leur
       profil plus ancien remplace la liste de navigation de la base. */
    if (sect && (typeOverride || v.type) === 'boutique' && v.subtype !== 'pressing' && !sect.items.some((x) => x.nav === 'sold')) {
      const sold = VERTICAL_SECTIONS.boutique.items.find((x) => x.nav === 'sold');
      sect = { ...sect, items: sect.items.concat(sold) };
    }
    if (!sect) { wrap.innerHTML = ''; return; }

    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const T = window.KiwiI18n?.T?.[lang] || {};
    const headerTxt = (sect.i18nHeader && T[sect.i18nHeader]) || sect.header;

    /* data-feature="<nav>" is what makes the operator console's per-module
     * switches reach this section. The keys are the nav ids, which is exactly
     * what kiwi-admin.html lists per vertical — so "Inventaire produits" off in
     * God mode hides this <a>. Without the attribute the switch existed but did
     * nothing, because merchant-config.js can only hide what is tagged. Subtype
     * profiles relabel these items but keep the base nav id, so a pharmacy's
     * "Stock & péremptions" answers to the same `inventory` switch. */
    const html = `
      <div class="sect"${sect.i18nHeader ? ` data-i18n="${sect.i18nHeader}"` : ''}>${headerTxt}</div>
      ${sect.items.filter(it => !DASHBOARD_HIDDEN_NAV.has(it.nav)).map(it => {
        const lbl = (it.i18n && T[it.i18n]) || it.label;
        return `
          <a href="#" data-nav="${it.nav}" data-feature="${it.nav}"${it.i18n ? ` data-i18n-attr="aria-label:${it.i18n}"` : ` aria-label="${lbl}"`}>
            ${it.material
              ? `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">${it.icon}</svg>`
              : `<i data-lucide="${it.icon}" aria-hidden="true"></i>`}
            <span${it.i18n ? ` data-i18n="${it.i18n}"` : ''}>${lbl}</span>
            ${it.tag ? `<span class="tag">${navTag(it.tag, lang)}</span>` : ''}
          </a>
        `;
      }).join('')}
    `;

    /* These <a data-activation=write> are brand new nodes, so the operator's hides have to be replayed
     * over them — merchant-config.js applied them to the markup that was here a
     * moment ago. Cheap (a querySelectorAll per disabled key) and a no-op when
     * there is no backend or nothing is switched off. */
    const reapplyConfig = () => { try { window.KiwiConfig?.apply?.(); } catch (_) {} };

    if (opts.skipFade) {
      wrap.innerHTML = html;
      reapplyConfig();
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
      reapplyConfig();
    }, 150);
  }

  /* ═══════════════ RENDER: HEADER SUB-LINE ═══════════════ */

  function renderHeaderSub() {
    const sub = document.querySelector('[data-header-sub]');
    if (!sub) return;
    if (isRealMerchant() || isCustom(currentVenue)) { sub.textContent = ''; return; }
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    sub.textContent = HEADER_SUB[lang]?.[currentVenue] || HEADER_SUB.fr[currentVenue] || '';
  }

  /* ═══════════════ RENDER: DEMO BAR + FOOTER ═══════════════ */

  function renderDemoBar() {
    const line = document.querySelector('[data-demo-line]');
    if (!line) {
      const el = document.querySelector('[data-demo-account]');
      if (el) el.textContent = (isRealMerchant() && !isCustom(currentVenue))
        ? String(safeVenueData(currentVenue).name || 'Mon établissement')
        : VENUES[currentVenue].name;
      return;
    }
    const name = (isRealMerchant() && !isCustom(currentVenue))
      ? String(safeVenueData(currentVenue).name || 'Mon établissement')
      : VENUES[currentVenue].name;
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const L = ({
      fr: { custom: 'Votre tableau de bord · ', prefix: 'Démo live · compte ', suffix: ' · données de démonstration mises à jour en temps réel' },
      en: { custom: 'Your dashboard · ',        prefix: 'Live demo · ',        suffix: ' account · demo data updated in real time' },
      ar: { custom: 'لوحة تحكمك · ',            prefix: 'عرض مباشر · حساب ',     suffix: ' · بيانات تجريبية محدّثة في الوقت الفعلي' },
    })[lang] || { custom: 'Votre tableau de bord · ', prefix: 'Démo live · compte ', suffix: ' · données de démonstration mises à jour en temps réel' };
    line.textContent = '';
    const b = document.createElement('b');
    b.style.color = 'var(--paper)';
    b.textContent = name;
    if (isCustom(currentVenue) || isRealMerchant()) {
      // A user-created venue isn't the synthetic demo account.
      line.appendChild(document.createTextNode(L.custom));
      line.appendChild(b);
    } else {
      b.setAttribute('data-demo-account', '');
      line.appendChild(document.createTextNode(L.prefix));
      line.appendChild(b);
      line.appendChild(document.createTextNode(L.suffix));
    }
  }
  function renderFooter() {
    const el = document.querySelector('[data-footer-line]');
    if (!el) return;
    const v = VENUES[currentVenue];
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const T = window.KiwiI18n?.T?.[lang] || {};
    const help = T['dash.footer.help'] || 'Centre d’aide';
    // The merchant name already sits in the demo bar — keep the footer to
    // legal / system info so the two bars don't echo each other.
    // No acquiring-sponsorship line: Kiwi holds no Bank Al-Maghrib licence,
    // and a demo footer is still a public claim. See mentions-legales.html.
    const legal = (isCustom(currentVenue) || isRealMerchant()) ? '' : `ICE ${v.ice} · `;
    el['inner' + 'HTML'] = `${legal}Kiwi v2.38.1 · <a href="#" data-action="account-help">${help}</a>`;
  }

  /* ═══════════════ RENDER: SIDEBAR COUNTS ═══════════════ */

  function renderSidebarCounts() {
    const txCountEl = document.querySelector('a[data-nav="transactions"] .count');
    if (txCountEl) {
      // Pull the live count from the demo clock so this badge stays in lockstep
      // with the dashboard's Commandes KPI tile. If the clock isn't running yet
      // (initial paint before the simulator's first tick), fall back to the
      // venue's end-of-day target so the badge isn't empty.
      // User-created venue → count its recorded sales; demo venue → demo clock.
      const ownV = isCustom(currentVenue) || isRealMerchant();
      /* La MÊME fenêtre que la tuile « Commandes ». Cette pastille additionnait
       * tout l'historique du navigateur : au troisième jour elle affichait 47
       * en face d'une tuile qui affichait 6, sous le même mot. Deux compteurs
       * identiquement nommés qui divergent à partir du deuxième jour — le
       * commerçant ne peut pas savoir lequel est sa caisse. */
      const win = (() => {
        try { return window.KiwiDateRange?.bounds?.() || []; } catch (_) { return []; }
      })();
      const live = ownV
        ? (isCustom(currentVenue) ? ((window.KiwiSales && window.KiwiSales.totals(currentVenue, win[0], win[1]).count) || 0) : 0)
        : window.KiwiDemoClock?.getSimState?.()?.cumTx;
      txCountEl.textContent = String(live != null ? live : (VENUES[currentVenue].txCount || 0));
    }
    // Terminals + compliance badges — a brand-new venue has neither yet.
    const cv = isCustom(currentVenue) || isRealMerchant();
    const termEl = document.querySelector('a[data-nav="terminaux"] .count');
    if (termEl) termEl.textContent = cv ? '0' : '4';
    const confEl = document.querySelector('a[data-nav="conformite"] .tag');
    /* A real store has no compliance grade to show: the pill used to hold a lone
     * « · ». It steps aside instead of saying nothing. */
    if (confEl) { confEl.textContent = cv ? '' : 'AAA'; confEl.style.display = cv ? 'none' : ''; }
    const staffCountEl = document.querySelector('a[data-nav="equipe"] .count');
    // Sidebar "Équipe" badge → number of staff currently clocked in (present),
    // scoped to the active venue (all 3 venues in fusion). See STAFF below.
    if (staffCountEl) staffCountEl.textContent = String(isRealMerchant() && !isCustom(currentVenue) ? 0 : eqPresentCount());
  }

  /* Keep the sidebar count in sync with each demo-clock tick (every 3 s). */
  if (window.KiwiDemoClock?.subscribe) {
    window.KiwiDemoClock.subscribe(() => renderSidebarCounts());
  } else {
    // Demo clock may not be loaded yet — retry once on DOMContentLoaded.
    document.addEventListener('DOMContentLoaded', () => {
      window.KiwiDemoClock?.subscribe?.(() => renderSidebarCounts());
    });
  }

  /* ═══════════════ ACTION HANDLERS ═══════════════ */

  function onVenueToggle() { toggleDropdown(); }
  function onVenuePick(el) {
    const id = el?.dataset?.venue;
    // The merchant's OWN stores are custom ids, not REAL_VENUES (that list is the
    // three demo venues). Gating on REAL_VENUES alone made every row in a real
    // merchant's switcher inert — a second store could be created but never
    // opened, and there was no way back to the first.
    if (id && (REAL_VENUES.includes(id) || customIds.has(id))) {
      // If switching from fusion → real venue: also tear down fusion mode.
      if (currentVenue === 'fusion') {
        exitFusion({ targetVenue: id });
      } else {
        setVenue(id);
      }
      closeDropdown();
    }
  }
  /* God mode : passer à un AUTRE établissement du même client. On recharge sur
   * son slug plutôt que de basculer en mémoire — voir scopeRows. Le paramètre
   * n'autorise rien par lui-même : /api/me revérifie le cookie opérateur, et
   * sans lui la page redemande un code. */
  function onVenueScope(el) {
    const slug = el?.dataset?.scopeSlug;
    if (!slug) return;
    closeDropdown();
    try {
      const u = new URL(location.href);
      u.searchParams.set('op', '1');
      u.searchParams.set('merchant', slug);
      location.href = u.toString();
    } catch (_) {
      location.href = '/dashboard.html?op=1&merchant=' + encodeURIComponent(slug);
    }
  }
  function onVenueEnterFusion() {
    closeDropdown();
    enterFusion();
  }
  function onVenueExitFusion() {
    closeDropdown();
    exitFusion();
  }

  /* ═══════════════ FUSION MODE — glass melt transition + state swap ═══════════════ */

  // Build the overlay's internal markup fresh on each activation so every
  // glass-melt animation (incl. the SMIL <animate> elements driving the SVG
  // turbulence/displacement filter) replays from t=0.
  function buildOverlayMarkup(overlay, opts = {}) {
    const isExit = !!opts.exit;
    // Entry vs exit: same filter shape, slightly tighter displacement on exit
    // so the surface "snaps back into place" rather than fully liquefying.
    const meltDuration = isExit ? 900 : 1100;
    const turbValues   = isExit
      ? '0.024 0.038; 0.034 0.054; 0.018 0.026; 0.012 0.020'
      : '0.020 0.030; 0.038 0.058; 0.026 0.040; 0.014 0.022';
    const scaleValues  = isExit
      ? '0; 18; 32; 14; 4; 0'
      : '0; 14; 40; 22; 6; 0';

    overlay.innerHTML = `
      <svg class="fo-svg-filters" aria-hidden="true" focusable="false">
        <defs>
          <filter id="kiwi-melt-distort" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.020 0.030" numOctaves="2" seed="4" result="turb">
              <animate attributeName="baseFrequency"
                       values="${turbValues}"
                       keyTimes="0; 0.4; 0.75; 1"
                       dur="${meltDuration}ms"
                       fill="freeze"
                       begin="0s" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="turb" scale="0">
              <animate attributeName="scale"
                       values="${scaleValues}"
                       keyTimes="0; 0.10; 0.40; 0.65; 0.85; 1"
                       dur="${meltDuration}ms"
                       fill="freeze"
                       begin="0s" />
            </feDisplacementMap>
          </filter>
        </defs>
      </svg>
      <div class="fo-frost"></div>
      <div class="fo-gloss"></div>
      <div class="fo-glow-frame"></div>
      <div class="fo-label">
        <span class="fo-mark"><img src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></span>
        <span class="fo-ultra">
          <span class="fo-ultra-r">✦</span>
          <span class="fo-ultra-b">✦</span>
          <span class="fo-ultra-g">✦</span>
          <span class="fo-ultra-core">✦</span>
        </span>
      </div>
    `;
  }

  function enterFusion() {
    if (fusionAnimating) return;
    if (currentVenue === 'fusion') return;
    fusionAnimating = true;
    preFusionVenue = currentVenue;

    const overlay = document.querySelector('[data-fusion-overlay]');
    if (!overlay) {
      // No overlay → just swap state silently (graceful fallback).
      currentVenue = 'fusion';
      document.body.classList.add('fusion-mode');
      try { localStorage.setItem(STORAGE_KEY, 'fusion'); } catch (_) {}
      renderAll();
      subscribers.forEach(fn => { try { fn('fusion'); } catch (_) {} });
      fusionAnimating = false;
      return;
    }

    /* GLASS MELT ACTIVATION (matches the .fo-* CSS + SVG filter timings):
     *   t=0.00  overlay fades in (280ms), violet-blue radial wash
     *   t=0.00  SVG turbulence/displacement filter applied to .main + .sidebar
     *            + .topbar via body.fusion-glass-melt — UI liquefies
     *   t=0.00  glass frost layer fades in (backdrop-blur ramps to 10px)
     *   t=0.06  diagonal gloss highlight sweeps across the surface
     *   t=0.28  ripple wave expands outward from centre
     *   t=0.44  displacement peaks (scale ~40), heaviest melt frame
     *   t=0.90  body.fusion-mode + body.fusion-reconstruct ON — palette
     *            swaps to Atlas Dark and cards "liquid-settle" under the
     *            distortion (blur lift + saturation decay)
     *   t=1.10  body.fusion-glass-melt OFF — displacement filter drops,
     *            UI crisp again
     *   t=1.10  glow-frame stabilises (inset edge glow fades in)
     *   t=1.24  kiwi lockup fades in (blur 8px → 0)
     *   t=1.60  ✦ star prismatic refraction begins (R/B fan apart, white
     *            core flashes, mint settles)
     *   t=2.10  body.fusion-reconstruct OFF (card stagger done)
     *   t=3.30  overlay fades out, Ultra dashboard revealed
     *   t=3.80  cleanup
     */

    // Build the overlay markup first — this places the SVG filter defs in
    // the DOM so the CSS `filter: url(#kiwi-melt-distort)` below resolves.
    overlay.classList.remove('exiting');
    buildOverlayMarkup(overlay, { exit: false });
    overlay.offsetHeight; // reflow → SMIL animations + CSS keyframes replay

    // Activate the overlay AND apply the displacement filter in the same tick
    // so the SVG <animate> begins at t=0 aligned with the rest of the scene.
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('fusion-glass-melt');

    // Engage Ultra under the glass distortion — palette swaps, cards reform.
    setTimeout(() => {
      document.body.classList.add('fusion-mode', 'fusion-reconstruct');
      // Engage the existing dark theme so every modal/drawer/menu (defined
      // in theme.css) re-skins automatically. body.fusion-mode then layers
      // the Atlas Dark brand tokens on top of the dark surface tokens.
      document.documentElement.setAttribute('data-theme', 'dark');
      currentVenue = 'fusion';
      try { localStorage.setItem(STORAGE_KEY, 'fusion'); } catch (_) {}
      renderAll();
      subscribers.forEach(fn => { try { fn('fusion'); } catch (_) {} });
    }, 900);

    // Drop the displacement filter once the new state is locked in — UI
    // crisp again, glow-frame takes over from here.
    setTimeout(() => {
      document.body.classList.remove('fusion-glass-melt');
    }, 1100);

    // Card stagger ends ~1040ms after the class is added (320ms delay + 720ms
    // duration on the latest block); strip the class so it doesn't replay on
    // future re-renders.
    setTimeout(() => {
      document.body.classList.remove('fusion-reconstruct');
    }, 2100);

    // Hold the lockup so the ✦ refracted shine (starts t=1.6s, 1.7s long)
    // plays through, then fade the overlay out and clear markup.
    setTimeout(() => {
      overlay.classList.add('exiting');
      overlay.classList.remove('active');
    }, 3300);
    setTimeout(() => {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '';
      overlay.classList.remove('exiting');
      fusionAnimating = false;
    }, 3800);
  }

  /* Le sombre est un CHOIX du commerçant (kiwiDashTheme, amorcé dans <head>
   * avant la première peinture). L'attribut data-theme ne survit jamais à un
   * rechargement, donc le retirer « défensivement » au boot ne nettoyait
   * aucune fusion périmée — il peignait l'écran de verrouillage en blanc une
   * seconde à chaque chargement, le temps que le choix soit ré-appliqué.
   * Partout où la fusion rend l'antenne, on RESTAURE le choix au lieu de
   * l'effacer : même chaîne de repli que le script de <head>. */
  function themeChoiceIsDark() {
    try {
      const t = localStorage.getItem('kiwiDashTheme') || localStorage.getItem('kiwiTheme');
      if (t) return t === 'dark';
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (_) { return false; }
  }
  function restoreThemeChoice() {
    if (themeChoiceIsDark()) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }

  function exitFusion(opts = {}) {
    if (fusionAnimating) return;
    if (currentVenue !== 'fusion') return;

    const target = opts.targetVenue || preFusionVenue || DEFAULT_VENUE;
    const nextVenue = REAL_VENUES.includes(target) ? target : DEFAULT_VENUE;
    const overlay = document.querySelector('[data-fusion-overlay]');

    // Graceful fallback — no overlay element → soft swap.
    if (!overlay) {
      document.body.classList.remove('fusion-mode');
      restoreThemeChoice();
      currentVenue = nextVenue;
      try { localStorage.setItem(STORAGE_KEY, currentVenue); } catch (_) {}
      renderAll();
      subscribers.forEach(fn => { try { fn(currentVenue); } catch (_) {} });
      return;
    }

    fusionAnimating = true;

    /* GLASS MELT EXIT — surface re-liquefies briefly, then re-solidifies as
     * the palette reverts to the standard theme.
     *   t=0.00  overlay fades in, glass-melt filter applied to UI
     *   t=0.10  gloss sheen sweeps back, frost ramps up
     *   t=0.30  ripple wave expands outward (one ring this time)
     *   t=0.75  body.fusion-mode OFF — palette + data revert under distortion
     *   t=0.95  body.fusion-glass-melt OFF — filter drops, UI crisp
     *   t=1.40  overlay fades out
     *   t=1.95  cleanup
     */
    overlay.classList.remove('exiting');
    buildOverlayMarkup(overlay, { exit: true });
    // On exit we don't need the lockup centred — hide it so the user reads
    // "the surface melts away to reveal the underlying view" rather than
    // "another logo flashes".
    const exitLabel = overlay.querySelector('.fo-label');
    if (exitLabel) exitLabel.style.display = 'none';
    overlay.offsetHeight; // reflow → animations replay

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('fusion-glass-melt');

    setTimeout(() => {
      document.body.classList.remove('fusion-mode');
      restoreThemeChoice();
      currentVenue = nextVenue;
      try { localStorage.setItem(STORAGE_KEY, currentVenue); } catch (_) {}
      renderAll();
      subscribers.forEach(fn => { try { fn(currentVenue); } catch (_) {} });
    }, 750);

    setTimeout(() => {
      document.body.classList.remove('fusion-glass-melt');
    }, 950);

    setTimeout(() => {
      overlay.classList.add('exiting');
      overlay.classList.remove('active');
    }, 1400);
    setTimeout(() => {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '';
      overlay.classList.remove('exiting');
      fusionAnimating = false;
    }, 1950);
  }

  function registerHandlers() {
    const tryReg = () => {
      if (window.Kiwi?.handlers) {
        window.Kiwi.handlers['venue-toggle']        = onVenueToggle;
        window.Kiwi.handlers['venue-pick']          = onVenuePick;
        window.Kiwi.handlers['venue-scope']         = onVenueScope;
        window.Kiwi.handlers['venue-enter-fusion']  = onVenueEnterFusion;
        window.Kiwi.handlers['venue-exit-fusion']   = onVenueExitFusion;
        /* Exclusif Ultra band CTAs — honest demo confirmations. */
        window.Kiwi.handlers['fs-ultra-transfer'] = () => {
          const U = FS_ULTRA_STR[fusionLang()] || FS_ULTRA_STR.fr;
          window.Kiwi.toast(U.transferToast, { type: 'success', desc: U.transferToastD, force: true });
        };
        window.Kiwi.handlers['fs-ultra-call'] = () => {
          const U = FS_ULTRA_STR[fusionLang()] || FS_ULTRA_STR.fr;
          window.Kiwi.toast(U.callToast, { type: 'success', desc: U.callToastD, force: true });
        };
        window.Kiwi.handlers['fs-ultra-api'] = () => {
          const U = FS_ULTRA_STR[fusionLang()] || FS_ULTRA_STR.fr;
          window.Kiwi.toast(U.apiToast, { type: 'info', desc: U.apiToastD, force: true });
        };
        // Override the legacy 'location-switch' handler so the old
        // Casa/Marrakech menu doesn't pop when the user clicks the venue tile.
        window.Kiwi.handlers['location-switch']     = onVenueToggle;
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
      // Re-render the bits we own that have lang-dependent text. The
      // loc-switch is handled by the kiwi:langchange listener in init(),
      // which orig.apply() above has already fired.
      renderHeaderSub();
      renderFooter();
      renderDemoBar();
      renderVerticalSection({ skipFade: true });
      renderDropdown();
      if (currentVenue === 'fusion') { try { renderFusionView(); } catch (_) {} }
      return r;
    };
    api.__venueWrapped = true;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * FUSION VIEW — dedicated portfolio layout
   * ─────────────────────────────────────────────────────────────────────
   * Paints <section class="dash-fusion"> in dashboard.html with 6 sections
   * (hero, KPI cards, venue rows, chart, intel, alerts). Reads from the
   * enriched VENUES.fusion data above. On Aujourd'hui, ticks per-venue
   * values from window.KiwiDemoClock every 3 seconds.
   *
   * Render entrypoints:
   *   renderFusionView()             — full re-paint (range change, init)
   *   renderFusionLiveUpdate(state)  — per-tick update (clock subscriber)
   * ═══════════════════════════════════════════════════════════════════════ */

  // ── MIRROR of demoClock.js · TARGETS + HOUR_WEIGHTS ─────────────────
  // demoClock.js holds these as private IIFE constants and only exposes
  // single-venue state. To render per-venue live values for fusion (3
  // venue rows ticking independently) we mirror them here and recompute
  // each venue's cumulatives from state.fraction.
  // ⚠ KEEP IN SYNC if you change demoClock.js TARGETS / HOUR_WEIGHTS.
  const FUSION_PER_VENUE_TARGETS = {
    cafeAtlas:     { revenue: 31500, tx: 215, tips: 2400 },
    maisonMansour: { revenue: 14000, tx: 48,  tips: 0    },
    spaBahia:      { revenue: 10500, tx: 22,  tips: 1500 },
  };
  const FUSION_PER_VENUE_WEIGHTS = {
    cafeAtlas: {
      rev:  [0.018, 0.075, 0.110, 0.090, 0.040, 0.028, 0.040, 0.062, 0.100, 0.135, 0.130, 0.090, 0.052, 0.018, 0.008, 0.004],
      tx:   [0.020, 0.085, 0.130, 0.105, 0.040, 0.025, 0.035, 0.055, 0.095, 0.120, 0.110, 0.080, 0.050, 0.025, 0.018, 0.007],
      tips: [0.012, 0.065, 0.115, 0.100, 0.030, 0.020, 0.030, 0.060, 0.110, 0.150, 0.140, 0.090, 0.050, 0.020, 0.005, 0.003],
    },
    maisonMansour: {
      rev:  [0.080, 0.130, 0.105, 0.050, 0.038, 0.052, 0.110, 0.135, 0.150, 0.130, 0.018, 0.002, 0.000, 0.000, 0.000, 0.000],
      tx:   [0.082, 0.135, 0.108, 0.050, 0.040, 0.054, 0.108, 0.130, 0.145, 0.125, 0.015, 0.005, 0.003, 0.000, 0.000, 0.000],
      tips: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    },
    spaBahia: {
      rev:  [0.050, 0.115, 0.140, 0.085, 0.105, 0.140, 0.115, 0.085, 0.055, 0.035, 0.020, 0.005, 0.000, 0.000, 0.000, 0.000],
      tx:   [0.045, 0.110, 0.135, 0.085, 0.100, 0.140, 0.115, 0.090, 0.060, 0.045, 0.045, 0.018, 0.007, 0.005, 0.000, 0.000],
      tips: [0.040, 0.110, 0.140, 0.090, 0.110, 0.150, 0.110, 0.080, 0.060, 0.045, 0.035, 0.020, 0.008, 0.002, 0.000, 0.000],
    },
  };
  const FUSION_HOUR_LABELS = ['11h','12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h','00h','01h','02h'];
  const FUSION_N = FUSION_HOUR_LABELS.length;
  const KIWI_NET_RATIO = 0.839;                // matches dateRange.js fee constant
  const FUSION_PORTFOLIO_GOAL = 55000;         // daily target — referenced by spec
  const FUSION_VENUE_IDS = ['cafeAtlas', 'maisonMansour', 'spaBahia'];

  function fusionCumulativeAt(weights, fraction) {
    if (!weights || !weights.length) return 0;
    const pos = fraction * FUSION_N;
    const idx = Math.min(FUSION_N - 1, Math.floor(pos));
    const within = Math.min(1, Math.max(0, pos - idx));
    let cum = 0;
    for (let i = 0; i < idx; i++) cum += weights[i];
    cum += (weights[idx] || 0) * within;
    return cum;
  }

  /* Compute per-venue cumulatives at this tick.
   * Returns { cafeAtlas: {revenue, tx, tips}, maisonMansour: …, spaBahia: …,
   *           portfolio: {revenue, tx, tips, panierMoyen, top, topRevenue} } */
  function computePerVenueLive(state) {
    const f = state?.fraction ?? 0;
    const out = { portfolio: { revenue: 0, tx: 0, tips: 0 } };
    let top = null, topRev = -1;
    FUSION_VENUE_IDS.forEach(id => {
      const t = FUSION_PER_VENUE_TARGETS[id];
      const w = FUSION_PER_VENUE_WEIGHTS[id];
      const cumRev  = fusionCumulativeAt(w.rev,  f) * t.revenue;
      const cumTx   = Math.round(fusionCumulativeAt(w.tx,   f) * t.tx);
      const cumTips = fusionCumulativeAt(w.tips, f) * t.tips;
      out[id] = { revenue: cumRev, tx: cumTx, tips: cumTips };
      out.portfolio.revenue += cumRev;
      out.portfolio.tx      += cumTx;
      out.portfolio.tips    += cumTips;
      if (cumRev > topRev) { topRev = cumRev; top = VENUES[id]?.name || id; }
    });
    out.portfolio.panierMoyen = out.portfolio.tx > 0 ? Math.round(out.portfolio.revenue / out.portfolio.tx) : 0;
    out.portfolio.top = top;
    out.portfolio.topRevenue = topRev;
    out.simIdx = state?.simIdx ?? 0;
    out.simHourLabel = state?.simHourLabel || FUSION_HOUR_LABELS[0];
    out.simMinute = state?.simMinute ?? 0;
    return out;
  }

  // ── Local twin of dateRange.animateNumber — identical easing/duration ──
  function fusionAnimateNumber(el, from, to, opts = {}) {
    if (!el) return;
    const duration = opts.duration ?? 800;
    const format = opts.format || (v => String(Math.round(v)));
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * ease(p);
      el.innerHTML = format(v);
      if (p < 1) requestAnimationFrame(tick);
      else el.innerHTML = format(to);
    }
    requestAnimationFrame(tick);
  }

  // ── French number formatters (mirror dateRange.js style) ──
  const fusionFrInt = n => (window.KiwiNumber?.format(Math.floor(n), {}) ?? Math.floor(n).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  const fusionFmtMad = v => `${fusionFrInt(v)} MAD`;
  const fusionFmtMadCents = v => {
    const int = Math.floor(v);
    const cents = Math.round((v - int) * 100);
    return `${fusionFrInt(int)},${String(cents).padStart(2,'0')} <span class="currency">MAD</span>`;
  };
  const fusionFmtPct = v => {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    const abs = Math.abs(v);
    const formatted = (Math.abs(abs - Math.round(abs)) < 0.001) ? String(Math.round(abs)) : (window.KiwiNumber?.number(abs, 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format(abs));
    return `${sign}${formatted} %`;
  };

  function fusionParseAmount(el) {
    if (!el) return 0;
    const m = el.textContent.replace('−', '-').match(/-?\d+(?:[\s ]\d{3})*(?:[.,]\d+)?/);
    if (!m) return 0;
    return parseFloat(m[0].replace(/[\s ]/g, '').replace(',', '.')) || 0;
  }

  // ── Delta label per range (matches single-venue convention) ──
  const FUSION_DELTA_LABELS = {
    fr: { aujourdhui: 'vs hier', hier: 'vs avant-hier', septJours: 'vs 7 jours précédents', trenteJours: 'vs 30 jours précédents' },
    en: { aujourdhui: 'vs yesterday', hier: 'vs day before', septJours: 'vs previous 7 days', trenteJours: 'vs previous 30 days' },
    ar: { aujourdhui: 'مقابل أمس', hier: 'مقابل أول أمس', septJours: 'مقابل 7 أيام السابقة', trenteJours: 'مقابل 30 يومًا السابقة' },
  };
  /* ── Exclusif Ultra band — the pillars the 1 499 buys, lived in-product.
   * Projection math is honest demo data: the staff-transfer rec uses real
   * roster names; the ROI line matches the sidebar's 1,47 M MAD/month. ── */
  const FS_ULTRA_STR = {
    fr: {
      roi: '1 499 MAD/mois ≈ 0,1 % du CA du portefeuille (1,47 M MAD/mois)',
      aiEyebrow: '✦ IA PORTEFEUILLE · ACTION SUGGÉRÉE',
      aiTitle: 'Transfert d\'équipe · vendredi 19h–22h',
      aiBody: 'Café Atlas refuse ~12 couverts chaque vendredi soir pendant que Spa Bahia tourne à 54 % de capacité. Hamid J. et Sofia B. (formés salle) sont disponibles côté spa sur ce créneau.',
      aiProj: '≈ +3 800 MAD/semaine · +15 200 MAD/mois',
      aiCta: 'Planifier le transfert →',
      amEyebrow: 'ACCOUNT MANAGER DÉDIÉE',
      amRole: 'Connaît vos 3 établissements · Casablanca',
      amNote: 'Ligne directe 24/7, réponse médiane 11 min sur les 30 derniers jours. Revue stratégique trimestrielle incluse.',
      amCall: 'Planifier un appel',
      apiEyebrow: 'API ENTERPRISE · TEMPS RÉEL',
      apiKey: 'Clé de production', apiActive: 'actifs',
      apiExport: 'Export comptable', apiDocs: 'Documentation API →',
      transferToast: 'Transfert planifié, proposé à Hamid J. et Sofia B.',
      transferToastD: 'En attente de leur confirmation WhatsApp. Yasmine est en copie.',
      callToast: 'Appel demandé, Yasmine vous rappelle',
      callToastD: 'Créneau confirmé par WhatsApp d\'ici 30 min.',
      apiToast: 'kiwi-os.com/api',
      apiToastD: 'Référence complète : endpoints, webhooks, exports SFTP.',
    },
    en: {
      roi: '1,499 MAD/mo ≈ 0.1% of portfolio revenue (1.47M MAD/mo)',
      aiEyebrow: '✦ PORTFOLIO AI · SUGGESTED ACTION',
      aiTitle: 'Staff transfer · Friday 7–10pm',
      aiBody: 'Café Atlas turns away ~12 covers every Friday night while Spa Bahia runs at 54% capacity. Hamid J. and Sofia B. (floor-trained) are free on the spa side in that window.',
      aiProj: '≈ +3,800 MAD/week · +15,200 MAD/month',
      aiCta: 'Schedule the transfer →',
      amEyebrow: 'DEDICATED ACCOUNT MANAGER',
      amRole: 'Knows your 3 venues · Casablanca',
      amNote: 'Direct line 24/7, median response 11 min over the last 30 days. Quarterly strategy review included.',
      amCall: 'Schedule a call',
      apiEyebrow: 'ENTERPRISE API · REAL-TIME',
      apiKey: 'Production key', apiActive: 'active',
      apiExport: 'Accounting export', apiDocs: 'API documentation →',
      transferToast: 'Transfer scheduled, proposed to Hamid J. and Sofia B.',
      transferToastD: 'Awaiting their WhatsApp confirmation. Yasmine is cc\'d.',
      callToast: 'Call requested, Yasmine will call you back',
      callToastD: 'Slot confirmed by WhatsApp within 30 min.',
      apiToast: 'kiwi-os.com/api',
      apiToastD: 'Full reference: endpoints, webhooks, SFTP exports.',
    },
    ar: {
      roi: '1 499 درهم/شهر ≈ 0,1% من مداخيل المحفظة (1,47 مليون درهم/شهر)',
      aiEyebrow: '✦ ذكاء المحفظة · إجراء مقترح',
      aiTitle: 'نقل فريق · الجمعة 19:00–22:00',
      aiBody: 'مقهى أطلس يرفض ~12 مقعدًا كل جمعة مساءً بينما سبا باهية يعمل بـ 54% من طاقته. حميد ج. وصوفيا ب. (مدرّبان على الصالة) متاحان في تلك الفترة.',
      aiProj: '≈ +3 800 درهم/أسبوع · +15 200 درهم/شهر',
      aiCta: 'جدولة النقل ←',
      amEyebrow: 'مديرة حساب مخصصة',
      amRole: 'تعرف مؤسساتك الثلاث · الدار البيضاء',
      amNote: 'خط مباشر 24/7، متوسط الرد 11 دقيقة خلال آخر 30 يومًا. مراجعة استراتيجية فصلية مشمولة.',
      amCall: 'جدولة مكالمة',
      apiEyebrow: 'API للمؤسسات · في الوقت الفعلي',
      apiKey: 'مفتاح الإنتاج', apiActive: 'نشطة',
      apiExport: 'تصدير محاسبي', apiDocs: 'وثائق الـ API ←',
      transferToast: 'تمت جدولة النقل، اقتُرح على حميد ج. وصوفيا ب.',
      transferToastD: 'في انتظار تأكيدهما عبر واتساب. ياسمين في النسخة.',
      callToast: 'تم طلب المكالمة، ياسمين ستتصل بك',
      callToastD: 'تأكيد الموعد عبر واتساب خلال 30 دقيقة.',
      apiToast: 'kiwi-os.com/api',
      apiToastD: 'مرجع كامل: النقاط، الويبهوكس، تصدير SFTP.',
    },
  };
  const FUSION_HERO_LABELS = {
    fr: { aujourdhui: "ENCAISSÉ AUJOURD'HUI · PORTEFEUILLE", hier: 'ENCAISSÉ HIER · PORTEFEUILLE', septJours: 'ENCAISSÉ 7 JOURS · PORTEFEUILLE', trenteJours: 'ENCAISSÉ 30 JOURS · PORTEFEUILLE' },
    en: { aujourdhui: 'CASHED TODAY · PORTFOLIO', hier: 'CASHED YESTERDAY · PORTFOLIO', septJours: 'CASHED 7 DAYS · PORTFOLIO', trenteJours: 'CASHED 30 DAYS · PORTFOLIO' },
    ar: { aujourdhui: 'المقبوض اليوم · المحفظة', hier: 'المقبوض أمس · المحفظة', septJours: 'المقبوض في 7 أيام · المحفظة', trenteJours: 'المقبوض في 30 يومًا · المحفظة' },
  };
  const fusionLang = () => (window.KiwiI18n?.getLang?.() || 'fr');

  // ── Effective range with personnalise→aujourdhui fallback ──
  function fusionEffectiveRange() {
    const r = window.KiwiDateRange?.getDateRange?.() ?? 'aujourdhui';
    return r === 'personnalise' ? 'aujourdhui' : r;
  }

  const FUSION_INTEL_ICONS = {
    users:     '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    pie:       '<path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>',
    link:      '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
    alert:     '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  };
  const FUSION_MATERIAL_ICONS = { users: 'users', pie: 'pie-chart', link: 'link', alert: 'alert-triangle' };
  const fusionIcon = (key) => `<i data-lucide="${FUSION_MATERIAL_ICONS[key] || 'help'}" style="width:14px;height:14px" aria-hidden="true"></i>`;
  /* Portfolio rows use the same Material trade truth as the switcher. */
  const fusionTypeIcon = (type) => typeIconOf({ type });

  // ── SVG sparkline (80×32) — line stroke only, no axes ──
  function fusionSparkPath(values) {
    if (!values || values.length < 2) return '';
    const W = 80, H = 32, PAD = 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
  function fusionSparkSvg(values, positive) {
    const path = fusionSparkPath(values);
    const stroke = positive ? 'var(--atlas)' : 'var(--warning)';
    return `<svg class="fs-spark" width="80" height="32" viewBox="0 0 80 32" aria-hidden="true">
      <path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  // ── Stacked-area chart (Mode A intraday OR Mode B 30-day) ──
  // Axes rendered as HTML overlays (not <text> inside the SVG) so text
  // doesn't distort when the SVG stretches non-uniformly to fill its
  // container width via preserveAspectRatio="none".
  function fusionStackedAreaSvg(points, opts = {}) {
    const W = opts.width || 700;
    const H = opts.height || 220;
    if (!points || points.length === 0) {
      return `<div class="fs-chart-empty">Données en cours d'arrivée…</div>`;
    }
    const totals = points.map(p => (p.cafeAtlas || 0) + (p.maisonMansour || 0) + (p.spaBahia || 0));
    const maxY = Math.max(opts.minMax || 0, Math.max(...totals)) * 1.05 || 1;
    // Use the full SVG viewport for the plot area — y axis lives outside
    // (HTML overlay) so we don't reserve PAD_L inside the SVG anymore.
    const xOf = i => points.length <= 1 ? W / 2 : (i / (points.length - 1)) * W;
    const yOf = v => H - (v / maxY) * H;

    // Build stacked paths bottom-to-top: spaBahia base, then mansour, then atlas on top.
    const stack = (key, baseKeys) => {
      const pts = points.map((p, i) => {
        const base = baseKeys.reduce((acc, k) => acc + (p[k] || 0), 0);
        return { x: xOf(i), top: yOf(base + (p[key] || 0)), bot: yOf(base) };
      });
      const upper = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.top.toFixed(1)}`).join(' ');
      const lower = pts.slice().reverse().map(p => `L${p.x.toFixed(1)},${p.bot.toFixed(1)}`).join(' ');
      return `${upper} ${lower} Z`;
    };
    const pathSpa     = stack('spaBahia', []);
    const pathMansour = stack('maisonMansour', ['spaBahia']);
    const pathAtlas   = stack('cafeAtlas', ['spaBahia', 'maisonMansour']);

    // Y axis · HTML overlay (no distortion)
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const v = maxY * t;
      const label = v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`;
      return { pct: (1 - t) * 100, label };
    });
    const yHtml = yTicks.map(t => `<span style="top:${t.pct.toFixed(1)}%">${t.label}</span>`).join('');

    // Grid lines · still inside SVG so they stretch with the plot
    const gridSvg = yTicks.map(t => {
      const y = (t.pct / 100) * H;
      return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="0.10"/>`;
    }).join('');

    // X axis · HTML overlay, % positioning
    const every = opts.showXEvery || 1;
    const xLabels = points
      .map((p, i) => (i % every === 0 || i === points.length - 1)
        ? { pct: points.length <= 1 ? 50 : (i / (points.length - 1)) * 100, label: p.label }
        : null)
      .filter(Boolean);
    const xHtml = xLabels.map(l => `<span style="left:${l.pct.toFixed(1)}%">${l.label}</span>`).join('');

    return `
      <div class="fs-chart-frame">
        <div class="fs-chart-y-axis">${yHtml}</div>
        <div class="fs-chart-plot">
          <svg class="fs-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            ${gridSvg}
            <path d="${pathSpa}"     fill="var(--fs-bahia)"   opacity="0.92"/>
            <path d="${pathMansour}" fill="var(--fs-mansour)" opacity="0.92"/>
            <path d="${pathAtlas}"   fill="var(--fs-atlas)"   opacity="0.92"/>
          </svg>
        </div>
        <div class="fs-chart-x-axis">${xHtml}</div>
      </div>`;
  }

  // ── Intraday data buffer (Mode A) ──
  // Built incrementally on each tick: one point per simIdx visited.
  let fusionIntradayBuffer = [];
  function fusionResetIntradayBuffer() { fusionIntradayBuffer = []; }
  function fusionAppendIntradayPoint(live) {
    const lastIdx = fusionIntradayBuffer.length > 0
      ? fusionIntradayBuffer[fusionIntradayBuffer.length - 1].simIdx
      : -1;
    // Only append when we cross into a new hour OR when buffer is empty.
    // Within the same hour we update the last point in place so the chart
    // grows smoothly without spiking at hour boundaries.
    if (live.simIdx > lastIdx) {
      fusionIntradayBuffer.push({
        simIdx: live.simIdx,
        label: FUSION_HOUR_LABELS[live.simIdx] || '',
        cafeAtlas:     live.cafeAtlas?.revenue || 0,
        maisonMansour: live.maisonMansour?.revenue || 0,
        spaBahia:      live.spaBahia?.revenue || 0,
      });
    } else if (fusionIntradayBuffer.length > 0) {
      const last = fusionIntradayBuffer[fusionIntradayBuffer.length - 1];
      last.cafeAtlas     = live.cafeAtlas?.revenue || 0;
      last.maisonMansour = live.maisonMansour?.revenue || 0;
      last.spaBahia      = live.spaBahia?.revenue || 0;
    }
  }

  /* ═════════════════ MAIN RENDER: full re-paint ═════════════════
   * Called on:  fusion mode activation, range change, manual refresh.
   * Reads:      VENUES.fusion.{snapshot,venueBreakdown,kpis,intelligence,
   *             portfolioTrend,alerts} + clock state if range=aujourdhui. */
  function renderFusionView() {
    /* Fusion is a three-demo-venue portfolio, not a real multi-site source.
       If identity or pairing resolves while it is open, leave it immediately
       before reading a single snapshot. */
    if (isRealMerchant()) {
      if (currentVenue === 'fusion') pickOwnVenue();
      return;
    }
    const root = document.querySelector('[data-fusion-root]');
    if (!root) return;
    if (currentVenue !== 'fusion') {
      // Defensive — should never happen; root is hidden by CSS anyway.
      return;
    }
    root.removeAttribute('hidden');

    const range = fusionEffectiveRange();
    const isToday = range === 'aujourdhui';
    const f = VENUES.fusion;
    const snap = f.snapshot[range] || f.snapshot.aujourdhui;
    const breakdown = f.venueBreakdown[range] || f.venueBreakdown.aujourdhui;
    const kpis = f.kpis[range] || f.kpis.aujourdhui;

    // For Aujourd'hui, prefer live clock state as the initial paint values
    // so the view isn't blank waiting for the next tick.
    const liveState = isToday && window.KiwiDemoClock?.getSimState ? window.KiwiDemoClock.getSimState() : null;
    const live = liveState ? computePerVenueLive(liveState) : null;

    // ── Section 1 · Hero ──
    const heroLabel = root.querySelector('[data-fs-hero-label]');
    if (heroLabel) heroLabel.textContent = (FUSION_HERO_LABELS[fusionLang()] || FUSION_HERO_LABELS.fr)[range] || FUSION_HERO_LABELS.fr.aujourdhui;
    const livePill = root.querySelector('[data-fs-live-pill]');
    if (livePill) livePill.style.display = isToday ? '' : 'none';
    if (isToday && livePill) {
      const t = new Date();
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      livePill.querySelector('[data-fs-live-time]').textContent = `${hh}:${mm}`;
    }

    const heroAmt = root.querySelector('[data-fs-hero-amount]');
    const heroTarget = isToday && live ? live.portfolio.revenue : snap.totalRevenue;
    if (heroAmt) {
      fusionAnimateNumber(heroAmt, fusionParseAmount(heroAmt), heroTarget, { format: fusionFmtMadCents });
    }

    // Deltas — hide null values
    const deltaWrap = root.querySelector('[data-fs-deltas]');
    if (deltaWrap) {
      const lbl = (FUSION_DELTA_LABELS[fusionLang()] || FUSION_DELTA_LABELS.fr)[range];
      const items = [];
      if (snap.deltaHier    != null) items.push({ k: 'hier',    label: lbl, value: snap.deltaHier });
      if (snap.deltaSemaine != null) items.push({ k: 'semaine', label: 'vs semaine dernière', value: snap.deltaSemaine });
      if (snap.deltaMois    != null) items.push({ k: 'mois',    label: 'vs mois dernier',    value: snap.deltaMois });
      // "Net après Kiwi" removed by product decision (same rationale as the
      // single-venue hero) — no "what's left after Kiwi's cut" line.
      deltaWrap.innerHTML = items.map(it => `
        <div class="b">
          <div class="l">${it.label.toUpperCase()}</div>
          <div class="v ${it.value >= 0 ? 'up' : 'down'}">${fusionFmtPct(it.value)}</div>
        </div>`).join('');
    }

    // Progress bar — only when objectifJour not null
    const progressWrap = root.querySelector('[data-fs-progress]');
    if (progressWrap) {
      if (snap.objectifJour) {
        progressWrap.style.display = '';
        const pct = Math.min(100, (heroTarget / snap.objectifJour) * 100);
        const fill = progressWrap.querySelector('[data-fs-progress-bar]');
        const pctEl = progressWrap.querySelector('[data-fs-progress-pct]');
        if (fill) fill.style.width = `${pct.toFixed(1)}%`;
        if (pctEl) pctEl.textContent = `${Math.round(pct)} %`;
        const lblEl = progressWrap.querySelector('[data-fs-progress-label]');
        if (lblEl) lblEl.textContent = `OBJECTIF PORTEFEUILLE · ${fusionFrInt(snap.objectifJour)} MAD`;
      } else {
        progressWrap.style.display = 'none';
      }
    }

    // Top site line
    const topEl = root.querySelector('[data-fs-top-site]');
    if (topEl) {
      const topName = isToday && live ? live.portfolio.top : snap.topVenueToday;
      const topRev  = isToday && live ? live.portfolio.topRevenue : snap.topVenueRevenue;
      topEl.innerHTML = `Top site · <b>${topName}</b> · ${fusionFmtMad(topRev)}`;
    }

    // AI insights panel (right column, static across ranges)
    const aiWrap = root.querySelector('[data-fs-ai-insights]');
    if (aiWrap) {
      aiWrap.innerHTML = f.intelligence.aiInsights.slice(0, 1).map(ins => `
        <div class="fs-ai-item">
          <div class="fs-ai-title">${ins.title}</div>
          <div class="fs-ai-body">${ins.body}</div>
          <div class="fs-ai-action">→ ${ins.action}</div>
        </div>`).join('');
    }

    // ── Section 2 · KPI Cards ──
    const kpiWrap = root.querySelector('[data-fs-kpis]');
    if (kpiWrap) {
      const lbl = (FUSION_DELTA_LABELS[fusionLang()] || FUSION_DELTA_LABELS.fr)[range];
      const txVal     = isToday && live ? live.portfolio.tx          : kpis.transactionsTotales.value;
      const panierVal = isToday && live ? live.portfolio.panierMoyen : kpis.panierMoyenPondere.value;
      const margeVal  = kpis.margeBrute.value;
      const cards = [
        { key: 'tx',      label: kpis.transactionsTotales.label, value: txVal,                                  unit: '',                                        delta: kpis.transactionsTotales.delta },
        { key: 'panier',  label: kpis.panierMoyenPondere.label,  value: panierVal,                              unit: kpis.panierMoyenPondere.unit || 'MAD',     delta: kpis.panierMoyenPondere.delta },
        { key: 'marge',   label: kpis.margeBrute.label,          value: margeVal,                               unit: kpis.margeBrute.unit || '%',               delta: kpis.margeBrute.delta, isPct: true },
        { key: 'success', label: kpis.tauxSuccesMoyen.label,     value: kpis.tauxSuccesMoyen.value,             unit: kpis.tauxSuccesMoyen.unit || '%',          delta: kpis.tauxSuccesMoyen.delta, isPct: true },
        { key: 'ratio',   label: kpis.ratioCardCash.label,       value: kpis.ratioCardCash.value, isString: true, unit: kpis.ratioCardCash.unit || '%',          delta: kpis.ratioCardCash.delta },
        { key: 'loyal',   label: kpis.clientsFideles.label,      value: kpis.clientsFideles.value,              unit: kpis.clientsFideles.subValue ? `/ ${kpis.clientsFideles.subValue}` : '', delta: kpis.clientsFideles.delta },
      ];
      kpiWrap.innerHTML = cards.map(c => `
        <div class="fs-kpi" data-fs-kpi="${c.key}">
          <div class="fs-kpi-l">${c.label.toUpperCase()}</div>
          <div class="fs-kpi-v">
            <span data-fs-kpi-val>${c.isString ? c.value : (c.isPct ? (window.KiwiNumber?.number(c.value, 2) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(c.value)) : fusionFrInt(c.value))}</span>
            ${c.unit ? `<span class="fs-kpi-u">${c.unit}</span>` : ''}
          </div>
          <div class="fs-kpi-d ${c.delta >= 0 ? 'up' : 'down'}">${fusionFmtPct(c.delta)} <span class="fs-kpi-dlbl">${lbl}</span></div>
        </div>`).join('');
    }

    // ── Section 3 · Venue rows ──
    const venuesWrap = root.querySelector('[data-fs-venues]');
    if (venuesWrap) {
      const portfolioTotal = isToday && live ? live.portfolio.revenue : breakdown.reduce((a, v) => a + v.revenue, 0);
      venuesWrap.innerHTML = breakdown.map(v => {
        const liveRev = isToday && live ? (live[v.id]?.revenue || 0) : v.revenue;
        const share = portfolioTotal > 0 ? (liveRev / portfolioTotal) * 100 : 0;
        const sparkTrend = isToday && live
          ? [...v.trend.slice(0, -1), liveRev]
          : v.trend;
        const isPositive = (v.deltaVsHier ?? 0) >= 0;
        return `
          <div class="fs-venue-row" data-fs-venue-row="${v.id}">
            <div class="fs-venue-left">
              <div class="fs-venue-icon">${fusionTypeIcon(v.type)}</div>
              <div>
                <div class="fs-venue-name">${eqEsc(v.name)}</div>
                <div class="fs-venue-loc">${eqEsc(v.location)}</div>
              </div>
            </div>
            <div class="fs-venue-rev">
              <div class="fs-venue-rev-v" data-fs-venue-revenue>${fusionFmtMad(liveRev)}</div>
              ${v.deltaVsHier != null
                ? `<div class="fs-venue-rev-d ${isPositive ? 'up' : 'down'}">${fusionFmtPct(v.deltaVsHier)} <span>vs hier</span></div>`
                : '<div class="fs-venue-rev-d muted">·</div>'}
            </div>
            <div class="fs-venue-spark-wrap" data-fs-venue-spark>${fusionSparkSvg(sparkTrend, isPositive)}</div>
            <div class="fs-venue-share">
              <div class="fs-venue-share-bar"><div class="fs-venue-share-fill" data-fs-venue-share-fill style="width:${share.toFixed(1)}%"></div></div>
              <div class="fs-venue-share-pct" data-fs-venue-share-pct>${Math.round(share)} %</div>
            </div>
            <div class="fs-venue-signal sig-${v.signal}">${v.signal === 'objectif-atteint' ? '✓ ' : v.signal === 'croissance' ? '↑ ' : ''}${v.signalLabel}</div>
          </div>`;
      }).join('');
    }

    // ── Section 4 · Chart (Mode A intraday OR Mode B 30-day) ──
    const chartWrap = root.querySelector('[data-fs-chart]');
    if (chartWrap) {
      const titleEl = chartWrap.querySelector('[data-fs-chart-title]');
      const subEl   = chartWrap.querySelector('[data-fs-chart-sub]');
      const bodyEl  = chartWrap.querySelector('[data-fs-chart-body]');
      if (isToday) {
        if (titleEl) titleEl.textContent = 'Revenu portefeuille · en cours';
        if (subEl)   subEl.textContent   = 'Cumul horaire · toutes enseignes · LIVE';
        // First paint: seed buffer from current state.
        if (live) fusionAppendIntradayPoint(live);
        if (bodyEl) {
          bodyEl.innerHTML = fusionIntradayBuffer.length > 0
            ? fusionStackedAreaSvg(fusionIntradayBuffer, { showXEvery: 1, minMax: FUSION_PORTFOLIO_GOAL * 0.4 })
              + `<div class="fs-chart-legend">
                  <span><i style="background:var(--fs-atlas)"></i> Café Atlas</span>
                  <span><i style="background:var(--fs-mansour)"></i> Maison Mansour</span>
                  <span><i style="background:var(--fs-bahia)"></i> Spa Bahia</span>
                </div>`
            : `<div class="fs-chart-empty">En attente du premier tick du démo-clock…</div>`;
        }
      } else if (range === 'hier') {
        if (titleEl) titleEl.textContent = 'Évolution du portefeuille';
        if (subEl)   subEl.textContent   = 'Sélectionnez 7 jours ou 30 jours pour voir le graphique';
        if (bodyEl)  bodyEl.innerHTML    = `<div class="fs-chart-empty">Sélectionnez 7 jours ou 30 jours pour voir l'évolution du portefeuille.</div>`;
      } else {
        const trend = f.portfolioTrend;
        const sliceN = range === 'septJours' ? 7 : trend.labels.length;
        const points = trend.labels.slice(-sliceN).map((label, i) => ({
          label,
          cafeAtlas:     trend.cafeAtlas[trend.labels.length - sliceN + i],
          maisonMansour: trend.maisonMansour[trend.labels.length - sliceN + i],
          spaBahia:      trend.spaBahia[trend.labels.length - sliceN + i],
        }));
        if (titleEl) titleEl.textContent = range === 'septJours' ? 'Évolution du portefeuille · 7 jours' : 'Évolution du portefeuille · 30 jours';
        if (subEl)   subEl.textContent   = '3 enseignes empilées · CA quotidien';
        if (bodyEl)  bodyEl.innerHTML    = fusionStackedAreaSvg(points, { showXEvery: range === 'septJours' ? 1 : 5 })
          + `<div class="fs-chart-legend">
              <span><i style="background:var(--fs-atlas)"></i> Café Atlas</span>
              <span><i style="background:var(--fs-mansour)"></i> Maison Mansour</span>
              <span><i style="background:var(--fs-bahia)"></i> Spa Bahia</span>
            </div>`;
      }
    }

    // ── Section 5 · Cross-venue intelligence tiles (static) ──
    const intelWrap = root.querySelector('[data-fs-intel]');
    if (intelWrap) {
      const I = f.intelligence;
      const conc = I.concentrationIndex;
      const concClass = conc > 55 ? 'warn' : conc < 40 ? 'good' : 'neutral';
      intelWrap.innerHTML = `
        <div class="fs-intel-tile">
          <div class="fs-intel-ico">${fusionIcon('users')}</div>
          <div class="fs-intel-v">${fusionFrInt(I.crossVenueCustomers)}</div>
          <div class="fs-intel-l">fréquentent plusieurs emplacements</div>
          <div class="fs-intel-n">Dépensent en moyenne 2,4× plus que les clients mono-site</div>
        </div>
        <div class="fs-intel-tile">
          <div class="fs-intel-ico">${fusionIcon('pie')}</div>
          <div class="fs-intel-v"><span class="${concClass}">${(window.KiwiNumber?.number(conc, 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format(conc))} %</span></div>
          <div class="fs-intel-l">du CA généré par Café Atlas</div>
          <div class="fs-intel-n ${concClass}">${conc > 55 ? '⚠ Concentration à diversifier' : conc < 40 ? '✓ Portefeuille équilibré' : 'Équilibre modéré'}</div>
        </div>
        <div class="fs-intel-tile">
          <div class="fs-intel-ico">${fusionIcon('link')}</div>
          <div class="fs-intel-v fs-intel-v-text">${I.topCrossVenuePair}</div>
          <div class="fs-intel-l">184 clients en commun</div>
          <div class="fs-intel-n">Duo le plus rentable du portefeuille</div>
        </div>`;
    }

    // ── Section 5b · Exclusif Ultra — the 1 499 pillars, lived ──
    const ultraWrap = root.querySelector('[data-fs-ultra]');
    if (ultraWrap) {
      const U = FS_ULTRA_STR[fusionLang()] || FS_ULTRA_STR.fr;
      const roiEl = root.querySelector('[data-fs-ultra-roi]');
      if (roiEl) roiEl.textContent = U.roi;
      ultraWrap.innerHTML = `
        <div class="fs-ultra-card">
          <div class="fs-ultra-eyebrow">${U.aiEyebrow}</div>
          <div class="fs-ultra-t">${U.aiTitle}</div>
          <div class="fs-ultra-d">${U.aiBody}</div>
          <div class="fs-ultra-proj">${U.aiProj}</div>
          <button type="button" class="fs-ultra-cta" data-action="fs-ultra-transfer">${U.aiCta}</button>
        </div>
        <div class="fs-ultra-card">
          <div class="fs-ultra-eyebrow">${U.amEyebrow}</div>
          <div class="fs-ultra-am">
            <div class="fs-ultra-av">YK</div>
            <div>
              <div class="fs-ultra-am-n">Yasmine Kabbaj</div>
              <div class="fs-ultra-am-r">${U.amRole}</div>
            </div>
          </div>
          <div class="fs-ultra-d">${U.amNote}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="fs-ultra-cta" data-action="help-whatsapp">WhatsApp</button>
            <button type="button" class="fs-ultra-cta" data-action="fs-ultra-call">${U.amCall}</button>
          </div>
        </div>
        <div class="fs-ultra-card">
          <div class="fs-ultra-eyebrow">${U.apiEyebrow}</div>
          <div class="fs-ultra-row"><span>${U.apiKey}</span><b>kiwi_live_••••7XK2</b></div>
          <div class="fs-ultra-row"><span>Webhooks</span><b>3 ${U.apiActive}</b></div>
          <div class="fs-ultra-row"><span>${U.apiExport}</span><b>02:00 · SFTP</b></div>
          <div class="fs-ultra-row"><span>SLA · 30j</span><b class="fs-ultra-ok">99,99 % ✓</b></div>
          <button type="button" class="fs-ultra-cta" data-action="fs-ultra-api">${U.apiDocs}</button>
        </div>`;
    }

    // ── Section 6 · Alerts (conditional, hidden when empty) ──
    const alertsWrap = root.querySelector('[data-fs-alerts]');
    if (alertsWrap) {
      if (!f.alerts || f.alerts.length === 0) {
        alertsWrap.setAttribute('hidden', '');
        alertsWrap.innerHTML = '';
      } else {
        alertsWrap.removeAttribute('hidden');
        alertsWrap.innerHTML = `
          <div class="fs-section-head"><h3>Signaux à surveiller</h3></div>
          <div class="fs-alerts-list">${f.alerts.map(a => `
            <div class="fs-alert">
              <div class="fs-alert-ico">${fusionIcon('alert')}</div>
              <div class="fs-alert-body">
                <div class="fs-alert-venue">${a.venueName}</div>
                <div class="fs-alert-msg">${a.message}</div>
              </div>
              <button class="fs-alert-cta" data-action="venue-pick" data-venue="${a.venueId}">Voir l'emplacement →</button>
            </div>`).join('')}
          </div>`;
      }
    }
  }

  /* ═════════════════ LIVE TICK: clock subscriber ═════════════════
   * Called every 3s by KiwiDemoClock when range === 'aujourdhui'.
   * Updates hero amount, NET, progress, top site, KPI cards, venue
   * rows, spark-lines, share bars, and intraday chart in place. */
  function renderFusionLiveUpdate(state, isReset) {
    if (isRealMerchant()) return;
    const root = document.querySelector('[data-fusion-root]');
    if (!root) return;
    if (currentVenue !== 'fusion') return;
    if (fusionEffectiveRange() !== 'aujourdhui') return;

    if (isReset) {
      // Snap all live values to 0, clear intraday buffer, return early —
      // next tick (~3s away) animates from 0 naturally.
      fusionResetIntradayBuffer();
      const heroAmt = root.querySelector('[data-fs-hero-amount]');
      if (heroAmt) heroAmt.innerHTML = fusionFmtMadCents(0);
      const fill = root.querySelector('[data-fs-progress-bar]');
      if (fill) fill.style.width = '0%';
      const pctEl = root.querySelector('[data-fs-progress-pct]');
      if (pctEl) pctEl.textContent = '0 %';
      root.querySelectorAll('[data-fs-kpi-val]').forEach(el => { el.textContent = '0'; });
      root.querySelectorAll('[data-fs-venue-revenue]').forEach(el => { el.textContent = fusionFmtMad(0); });
      root.querySelectorAll('[data-fs-venue-share-fill]').forEach(el => { el.style.width = '0%'; });
      root.querySelectorAll('[data-fs-venue-share-pct]').forEach(el => { el.textContent = '0 %'; });
      const chartBody = root.querySelector('[data-fs-chart-body]');
      if (chartBody) chartBody.innerHTML = `<div class="fs-chart-empty">Reset · le portefeuille redémarre à zéro…</div>`;
      return;
    }

    const live = computePerVenueLive(state);
    fusionAppendIntradayPoint(live);

    // ── Hero amount + LIVE time pill ──
    const heroAmt = root.querySelector('[data-fs-hero-amount]');
    if (heroAmt) fusionAnimateNumber(heroAmt, fusionParseAmount(heroAmt), live.portfolio.revenue, { duration: 600, format: fusionFmtMadCents });

    const liveTime = root.querySelector('[data-fs-live-time]');
    if (liveTime) {
      const t = new Date();
      liveTime.textContent = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    }

    // ── Progress bar ──
    const fill = root.querySelector('[data-fs-progress-bar]');
    const pctEl = root.querySelector('[data-fs-progress-pct]');
    const pct = Math.min(100, (live.portfolio.revenue / FUSION_PORTFOLIO_GOAL) * 100);
    if (fill) fill.style.width = `${pct.toFixed(1)}%`;
    if (pctEl) pctEl.textContent = `${Math.round(pct)} %`;

    // ── Top site ──
    const topEl = root.querySelector('[data-fs-top-site]');
    if (topEl) topEl.innerHTML = `Top site · <b>${live.portfolio.top}</b> · ${fusionFmtMad(live.portfolio.topRevenue)}`;

    // ── KPI cards (tx, panier, tips) ──
    const txCard     = root.querySelector('[data-fs-kpi="tx"] [data-fs-kpi-val]');
    const panierCard = root.querySelector('[data-fs-kpi="panier"] [data-fs-kpi-val]');
    const tipsCard   = root.querySelector('[data-fs-kpi="tips"] [data-fs-kpi-val]');
    if (txCard)     fusionAnimateNumber(txCard,     fusionParseAmount(txCard),     live.portfolio.tx,                       { duration: 600, format: v => fusionFrInt(v) });
    if (panierCard) fusionAnimateNumber(panierCard, fusionParseAmount(panierCard), live.portfolio.panierMoyen,              { duration: 600, format: v => fusionFrInt(v) });
    if (tipsCard)   fusionAnimateNumber(tipsCard,   fusionParseAmount(tipsCard),   Math.round(live.portfolio.tips),         { duration: 600, format: v => fusionFrInt(v) });

    // ── Venue rows: revenue + share bar + last spark point ──
    const breakdown = VENUES.fusion.venueBreakdown.aujourdhui;
    breakdown.forEach(v => {
      const row = root.querySelector(`[data-fs-venue-row="${v.id}"]`);
      if (!row) return;
      const liveRev = live[v.id]?.revenue || 0;
      const share = live.portfolio.revenue > 0 ? (liveRev / live.portfolio.revenue) * 100 : 0;

      const revEl = row.querySelector('[data-fs-venue-revenue]');
      if (revEl) fusionAnimateNumber(revEl, fusionParseAmount(revEl), liveRev, { duration: 600, format: fusionFmtMad });

      const fillEl = row.querySelector('[data-fs-venue-share-fill]');
      if (fillEl) fillEl.style.width = `${share.toFixed(1)}%`;
      const sharePct = row.querySelector('[data-fs-venue-share-pct]');
      if (sharePct) sharePct.textContent = `${Math.round(share)} %`;

      const sparkWrap = row.querySelector('[data-fs-venue-spark]');
      if (sparkWrap) {
        const trend = [...v.trend.slice(0, -1), liveRev];
        sparkWrap.innerHTML = fusionSparkSvg(trend, (v.deltaVsHier ?? 0) >= 0);
      }
    });

    // ── Intraday chart re-render ──
    const chartBody = root.querySelector('[data-fs-chart-body]');
    if (chartBody && fusionIntradayBuffer.length > 0) {
      chartBody.innerHTML = fusionStackedAreaSvg(fusionIntradayBuffer, { showXEvery: 1, minMax: FUSION_PORTFOLIO_GOAL * 0.4 })
        + `<div class="fs-chart-legend">
            <span><i style="background:var(--fs-atlas)"></i> Café Atlas</span>
            <span><i style="background:var(--fs-mansour)"></i> Maison Mansour</span>
            <span><i style="background:var(--fs-bahia)"></i> Spa Bahia</span>
          </div>`;
    }
  }

  // ── Subscribe to clock for live ticks (fusion + aujourdhui only) ──
  if (window.KiwiDemoClock?.subscribe) {
    window.KiwiDemoClock.subscribe((state, isReset) => {
      if (currentVenue !== 'fusion') return;
      if (fusionEffectiveRange() !== 'aujourdhui') return;
      renderFusionLiveUpdate(state, isReset);
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      window.KiwiDemoClock?.subscribe?.((state, isReset) => {
        if (currentVenue !== 'fusion') return;
        if (fusionEffectiveRange() !== 'aujourdhui') return;
        renderFusionLiveUpdate(state, isReset);
      });
    });
  }

  // ── Subscribe to date-range changes for full re-paint ──
  if (window.KiwiDateRange?.subscribe) {
    window.KiwiDateRange.subscribe(() => {
      if (currentVenue !== 'fusion') return;
      fusionResetIntradayBuffer();
      renderFusionView();
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      window.KiwiDateRange?.subscribe?.(() => {
        if (currentVenue !== 'fusion') return;
        fusionResetIntradayBuffer();
        renderFusionView();
      });
    });
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
    renderUpsell();
    if (currentVenue === 'fusion') {
      fusionResetIntradayBuffer();
      renderFusionView();
    }
  }

  /* ═══════════════ INIT ═══════════════ */

  /* A real signed-up merchant: on the HOSTED app (demos off) OR anyone who
     completed onboarding. They only ever see their own store — never the demo
     venues (Café Atlas / Maison Mansour / Spa Bahia). */
  function isRealMerchant() {
    try {
      if (window.KiwiEnv?.isReal?.()) return true;
      if (window.KiwiMe) return true;
      if (localStorage.getItem('kiwiOnboarded') === '1') return true;
      if (window.KiwiPlatform && typeof window.KiwiPlatform.isPaired === 'function') {
        const pv = window.KiwiPlatform.pairedVenue();
        if (window.KiwiPlatform.isPaired() && pv?.merchant) return true;
      }
      const P = window.KiwiCaissePairing;
      const pv = P?.pairedVenue?.();
      if (P?.isPaired?.() && pv?.merchant) return true;
      if (localStorage.getItem('kiwiPaired') === '1') {
        const saved = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
        if (saved?.merchant || localStorage.getItem('kiwiLiveMerchant')) return true;
      }
    } catch (_) {}
    return false;
  }

  function init() {
    if (!/dashboard(?:\.html)?(?:$|\/)/.test(location.pathname)) return;
    /* Sidebar upsell + dropdown CTA + subtype-profiled vertical section +
     * loc-switch render their own copy — re-translate live. The loc-switch
     * sub-line (SIBLINGS) was missing from this list: switching to Arabic
     * after load left "2 autres emplacements · Casa / Marrakech" at the top of
     * the sidebar until some other destination happened to re-render it. */
    window.addEventListener('kiwi:langchange', () => {
      renderUpsell(); renderDropdown(); renderLocSwitch();
      renderVerticalSection({ skipFade: true });
    });

    /* Operator (God-mode) scoped view (?op=1 &/or ?merchant=slug) — DO NOT
     * initialize the venue from THIS browser's localStorage. That path was
     * leaking the operator's own last-active venue (in particular a deleted
     * account's stale custom venue) into every scoped client dashboard: the
     * operator clicked "Ouvrir dashboard" on Client B and saw their own dead
     * Client A because init() picked up kiwiCustomVenues/kiwiVenue before
     * identity.js finished /api/me. Start with a transient empty venue so the
     * initial paint has no data to leak, then applyScopedVenue (called from
     * identity.js the moment /api/me confirms the operator cookie) hands us
     * the real client. Nothing is written back to STORAGE_KEY. */
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.has('op') || qs.has('merchant')) {
        currentVenue = ensureOwnEmptyVenue();
        document.body.classList.remove('fusion-mode', 'fusion-glass-melt', 'fusion-reconstruct');
        restoreThemeChoice();
        registerHandlers();
        setupDropdownClosers();
        hookI18n();
        renderAll({ skipFade: true });
        return;
      }
    } catch (_) { /* URLSearchParams missing → fall through to normal init */ }

    pickOwnVenue();
  }

  /* Le choix de vitrine ORDINAIRE — un commerçant chez lui. Extrait d'init()
   * pour que cancelScope() puisse le rejouer APRÈS coup : la vue portée décide
   * au premier rendu, avant que /api/me ait répondu, et il faut bien un chemin
   * de retour quand la réponse est « non ». */
  let wired = false;
  function pickOwnVenue() {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    // Fusion mode is intentionally NOT persisted across reloads — the merchant
    // always lands in single-store view and must re-trigger the merge.
    if (stored === 'fusion') {
      stored = null;
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
    if (isRealMerchant()) {
      /* Real merchant → their OWN store only. Never a demo venue — even a stale
         kiwiVenue=cafeAtlas persisted by an earlier (broken) session; heal it so
         "my boutique opens as Café Atlas with demo numbers" can't happen. */
      /* …et jamais un identifiant TRANSITOIRE non plus ('own', 'scoped'). Sans
         ce filtre, un retour de portée refusée retenait l'établissement vide
         fabriqué pour le premier rendu, ET l'inscrivait dans kiwiVenue — le
         magasin fantôme devenait alors permanent. */
      const firstCustom = [...customIds].filter(id => TRANSIENT_IDS.indexOf(id) < 0)[0] || null;
      if (customIds.has(stored) && TRANSIENT_IDS.indexOf(stored) < 0) {
        currentVenue = stored;
      } else if (firstCustom) {
        currentVenue = firstCustom;
        try { localStorage.setItem(STORAGE_KEY, currentVenue); } catch (_) {}
      } else {
        /* No own venue cached → synthesize an EMPTY one. NEVER DEFAULT_VENUE
           (Café Atlas): that was the root leak — a real merchant on a fresh
           device saw the full demo. Transient, like the scoped path; not
           persisted so a later real venue cleanly takes over. */
        currentVenue = ensureOwnEmptyVenue();
      }
    } else {
      currentVenue = (REAL_VENUES.includes(stored) || customIds.has(stored)) ? stored : DEFAULT_VENUE;
    }
    // Defensive: strip any stale fusion classes + dark theme attribute.
    document.body.classList.remove('fusion-mode', 'fusion-glass-melt', 'fusion-reconstruct');
    restoreThemeChoice();

    /* Une seule fois : cancelScope() rejoue ce bloc alors que le chemin porté a
       déjà branché les écouteurs, et les rebrancher les doublerait. */
    if (!wired) {
      registerHandlers();
      setupDropdownClosers();
      hookI18n();
      wired = true;
    }
    renderAll({ skipFade: true });
  }

  /* ── RETOUR DE PORTÉE REFUSÉE ──────────────────────────────────────────────
   * init() se met en attente sur un établissement vide dès qu'il voit ?op ou
   * ?merchant dans l'adresse — c'est volontaire, et c'est ce qui empêche la
   * vitrine du navigateur de s'afficher une fraction de seconde à la place de
   * celle du client. Mais rien ne l'en sortait quand /api/me répondait « vous
   * n'êtes pas opérateur » : le commerçant restait devant « Mon établissement »,
   * vide, définitivement. C'est le magasin fantôme du rapport de recette.
   *
   * Appelé par identity.js, et seulement là. */
  function cancelScope() {
    if (scopedActive) {
      scopedActive = false;
      scopedSiblings = [];
      customIds.delete('scoped');
      try { delete VENUES.scoped; } catch (_) { VENUES.scoped = undefined; }
    }
    pickOwnVenue();
    subscribers.forEach(fn => { try { fn(currentVenue); } catch (_) {} });
    return true;
  }

  /* init() is invoked at the very end of this IIFE — AFTER the Équipe block
   * below — because renderAll() → renderSidebarCounts() reads the STAFF
   * roster, and `const STAFF` must be initialised before init() can run. */

  /* ═══════════════════════════════════════════════════════════════════════
   * ÉQUIPE · PAIE · MENU, the demo data layer
   * ─────────────────────────────────────────────────────────────────────
   * The pages live elsewhere:
   *   · Équipe, Paie & planning → assets/team.js (kt-* handlers)
   *   · Menu & modificateurs   → assets/restaurant-menu-workspace.js (rmw-*)
   * What stays here is the demo roster and carte other modules read through
   * KiwiVenue: the sidebar Équipe badge, KDS station timing, the live feed's
   * order contents, KiwiMenu for the assistant, KiwiRecipes variance.
   *
   * Until 2026-10-12 this file also drew its own French-only Équipe, Paie and
   * Menu pages (eq-*, pay-*, mi-* handlers and their modals). Équipe and Paie
   * could no longer be reached: team.js takes both routes. The Menu page still
   * surfaced for activities without a menu (a spa asking the assistant to
   * « ouvrir la carte »). It now routes, see MENU · ROUTING below, and
   * tools/legacy-venue-modals-test.mjs keeps the old screens from returning.
   * ═══════════════════════════════════════════════════════════════════════ */

  /* ── STAFF roster, demo venues ────────────────────────────────────────── */
  const STAFF = {
    cafeAtlas: [
      { id: 'ca01', name: 'Mohammed Karimi', role: 'Chef de cuisine', department: 'cuisine', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 45, contractHours: 44, avatar: 'MK', status: 'present', clockedInAt: '08:14', shiftsThisMonth: 22, hoursThisMonth: 96.5, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca02', name: 'Youssef Bennani', role: 'Cuisinier', department: 'cuisine', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 32, contractHours: 44, avatar: 'YB', status: 'present', clockedInAt: '08:30', shiftsThisMonth: 20, hoursThisMonth: 88.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca03', name: 'Fatima Zahra Idrissi', role: 'Cuisinière', department: 'cuisine', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 30, contractHours: 40, avatar: 'FZ', status: 'present', clockedInAt: '09:00', shiftsThisMonth: 19, hoursThisMonth: 76.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca04', name: 'Hassan Tazi', role: 'Plongeur / Préparation', department: 'cuisine', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 22, contractHours: 40, avatar: 'HT', status: 'present', clockedInAt: '09:15', shiftsThisMonth: 21, hoursThisMonth: 84.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca05', name: 'Rachid Alami', role: 'Pizzaïolo / Crêpes', department: 'cuisine', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 28, contractHours: 40, avatar: 'RA', status: 'off', clockedInAt: null, shiftsThisMonth: 18, hoursThisMonth: 72.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca06', name: 'Omar El Fassi', role: 'Aide de cuisine', department: 'cuisine', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 20, contractHours: 40, avatar: 'OE', status: 'present', clockedInAt: '10:00', shiftsThisMonth: 17, hoursThisMonth: 68.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca07', name: 'Youssef Amrani', role: 'Serveur senior', department: 'salle', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 28, contractHours: 44, avatar: 'YA', status: 'present', clockedInAt: '10:45', shiftsThisMonth: 22, hoursThisMonth: 96.0, tipsThisMonth: 2840, salesThisMonth: 38200, voids: 1, rating: 4.9 },
      { id: 'ca08', name: 'Hamid Jelloul', role: 'Serveur', department: 'salle', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 24, contractHours: 44, avatar: 'HJ', status: 'present', clockedInAt: '11:00', shiftsThisMonth: 20, hoursThisMonth: 88.0, tipsThisMonth: 1920, salesThisMonth: 29400, voids: 4, rating: 4.2 },
      { id: 'ca09', name: 'Sofia Belkadi', role: 'Serveuse', department: 'salle', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 24, contractHours: 44, avatar: 'SB', status: 'present', clockedInAt: '11:00', shiftsThisMonth: 21, hoursThisMonth: 92.0, tipsThisMonth: 2210, salesThisMonth: 34100, voids: 2, rating: 4.7 },
      { id: 'ca10', name: 'Nadia Chraibi', role: 'Serveuse', department: 'salle', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 22, contractHours: 40, avatar: 'NC', status: 'late', clockedInAt: null, shiftsThisMonth: 18, hoursThisMonth: 72.0, tipsThisMonth: 1640, salesThisMonth: 24800, voids: 3, rating: 4.1 },
      { id: 'ca11', name: 'Karim Mansouri', role: 'Serveur', department: 'salle', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 22, contractHours: 40, avatar: 'KM', status: 'present', clockedInAt: '11:05', shiftsThisMonth: 19, hoursThisMonth: 76.0, tipsThisMonth: 1780, salesThisMonth: 26900, voids: 2, rating: 4.4 },
      { id: 'ca12', name: 'Leila Benkirane', role: 'Serveuse', department: 'salle', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 22, contractHours: 40, avatar: 'LB', status: 'present', clockedInAt: '11:10', shiftsThisMonth: 20, hoursThisMonth: 80.0, tipsThisMonth: 1920, salesThisMonth: 28400, voids: 1, rating: 4.6 },
      { id: 'ca13', name: 'Rachid B.', role: 'Caissier principal', department: 'caisse', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 35, contractHours: 44, avatar: 'RB', status: 'present', clockedInAt: '08:00', shiftsThisMonth: 22, hoursThisMonth: 96.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca14', name: 'Amina Tazi', role: "Hôtesse d'accueil", department: 'caisse', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 25, contractHours: 40, avatar: 'AT', status: 'present', clockedInAt: '10:30', shiftsThisMonth: 20, hoursThisMonth: 80.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca15', name: 'Mehdi Alaoui', role: 'Agent de propreté', department: 'support', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 18, contractHours: 40, avatar: 'MA', status: 'present', clockedInAt: '07:30', shiftsThisMonth: 22, hoursThisMonth: 88.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca16', name: 'Saida Benmoussa', role: 'Agente de propreté', department: 'support', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 18, contractHours: 40, avatar: 'SB2', status: 'off', clockedInAt: null, shiftsThisMonth: 20, hoursThisMonth: 80.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca17', name: 'Brahim Kettani', role: 'Livreur', department: 'support', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 20, contractHours: 40, avatar: 'BK', status: 'present', clockedInAt: '10:00', shiftsThisMonth: 21, hoursThisMonth: 84.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'ca18', name: 'Khadija Filali', role: 'Agente polyvalente', department: 'support', venue: 'cafeAtlas', venueName: 'Café Atlas', hourlyRate: 20, contractHours: 40, avatar: 'KF', status: 'present', clockedInAt: '09:45', shiftsThisMonth: 19, hoursThisMonth: 76.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
    ],
    spaBahia: [
      { id: 'sp01', name: 'Karima Idrissi', role: 'Manager spa', department: 'management', venue: 'spaBahia', venueName: 'Spa Bahia', hourlyRate: 55, contractHours: 44, avatar: 'KI', status: 'present', clockedInAt: '09:00', shiftsThisMonth: 22, hoursThisMonth: 96.0, tipsThisMonth: 1200, salesThisMonth: 18400, voids: 0, rating: 5.0 },
      { id: 'sp02', name: 'Nour El Hassan', role: 'Praticienne senior', department: 'soin', venue: 'spaBahia', venueName: 'Spa Bahia', hourlyRate: 40, contractHours: 40, avatar: 'NH', status: 'present', clockedInAt: '09:30', shiftsThisMonth: 20, hoursThisMonth: 80.0, tipsThisMonth: 2100, salesThisMonth: 24800, voids: 0, rating: 4.9 },
      { id: 'sp03', name: 'Salma Benkirane', role: 'Praticienne', department: 'soin', venue: 'spaBahia', venueName: 'Spa Bahia', hourlyRate: 35, contractHours: 40, avatar: 'SBK', status: 'present', clockedInAt: '10:00', shiftsThisMonth: 19, hoursThisMonth: 76.0, tipsThisMonth: 1840, salesThisMonth: 21200, voids: 0, rating: 4.8 },
      { id: 'sp04', name: 'Yasmine Bouchikhi', role: 'Praticienne', department: 'soin', venue: 'spaBahia', venueName: 'Spa Bahia', hourlyRate: 35, contractHours: 40, avatar: 'YBC', status: 'off', clockedInAt: null, shiftsThisMonth: 18, hoursThisMonth: 72.0, tipsThisMonth: 1620, salesThisMonth: 19400, voids: 0, rating: 4.7 },
      { id: 'sp05', name: 'Houda Chraibi', role: 'Praticienne', department: 'soin', venue: 'spaBahia', venueName: 'Spa Bahia', hourlyRate: 32, contractHours: 40, avatar: 'HC', status: 'present', clockedInAt: '10:30', shiftsThisMonth: 17, hoursThisMonth: 68.0, tipsThisMonth: 1480, salesThisMonth: 17800, voids: 0, rating: 4.6 },
      { id: 'sp06', name: 'Zineb Alami', role: 'Réceptionniste', department: 'accueil', venue: 'spaBahia', venueName: 'Spa Bahia', hourlyRate: 25, contractHours: 40, avatar: 'ZA', status: 'present', clockedInAt: '09:00', shiftsThisMonth: 21, hoursThisMonth: 84.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
      { id: 'sp07', name: 'Amine Tazi', role: "Agent d'entretien", department: 'support', venue: 'spaBahia', venueName: 'Spa Bahia', hourlyRate: 18, contractHours: 40, avatar: 'ATA', status: 'present', clockedInAt: '08:00', shiftsThisMonth: 22, hoursThisMonth: 88.0, tipsThisMonth: 0, salesThisMonth: 0, voids: 0, rating: null },
    ],
    maisonMansour: [
      { id: 'mm01', name: 'Aicha Benali', role: 'Conseillère senior', department: 'vente', venue: 'maisonMansour', venueName: 'Maison Mansour', hourlyRate: 30, contractHours: 44, avatar: 'AB', status: 'present', clockedInAt: '10:00', shiftsThisMonth: 22, hoursThisMonth: 96.0, tipsThisMonth: 0, salesThisMonth: 42800, voids: 1, rating: 4.8 },
      { id: 'mm02', name: 'Rania Tazi', role: 'Conseillère de vente', department: 'vente', venue: 'maisonMansour', venueName: 'Maison Mansour', hourlyRate: 24, contractHours: 40, avatar: 'RT', status: 'present', clockedInAt: '10:15', shiftsThisMonth: 20, hoursThisMonth: 80.0, tipsThisMonth: 0, salesThisMonth: 31200, voids: 2, rating: 4.5 },
    ],
  };
  const EQ_MONTH_WEEKS = 4.33;                         // weeks per month

  function eqEsc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function eqAllStaff() { return [...STAFF.cafeAtlas, ...STAFF.spaBahia, ...STAFF.maisonMansour]; }
  /* Staff in the active venue scope · fusion shows all three venues. */
  function eqScopedStaff() {
    if (isRealMerchant() && !isCustom(currentVenue)) return [];
    return currentVenue === 'fusion' ? eqAllStaff() : (STAFF[currentVenue] || []).slice();
  }
  function eqPresentCount() { return eqScopedStaff().filter(s => s.status === 'present').length; }

  /* ── MENU, demo carte per venue ───────────────────────────────────────── */
  const MENU = {
    cafeAtlas: [
      { id: 'ca-e01', name: 'Salade marocaine', category: 'entrees', price: 45, cost: 9, unitsThisMonth: 412, station: 'cuisine-froide', tags: ['vegan'], times: { matin: 0, midi: 280, soir: 132 } },
      { id: 'ca-e02', name: 'Briouates au fromage', category: 'entrees', price: 60, cost: 14, unitsThisMonth: 218, station: 'cuisine-chaude', tags: ['veg'], times: { matin: 0, midi: 140, soir: 78 } },
      { id: 'ca-e03', name: 'Harira', category: 'entrees', price: 35, cost: 6, unitsThisMonth: 386, station: 'cuisine-chaude', tags: ['signature'], times: { matin: 80, midi: 180, soir: 126 } },
      { id: 'ca-e04', name: 'Zaalouk', category: 'entrees', price: 40, cost: 8, unitsThisMonth: 154, station: 'cuisine-froide', tags: ['vegan'], times: { matin: 0, midi: 96, soir: 58 } },
      { id: 'ca-e05', name: 'Taktouka', category: 'entrees', price: 40, cost: 9, unitsThisMonth: 87, station: 'cuisine-froide', tags: ['vegan'], times: { matin: 0, midi: 48, soir: 39 } },
      { id: 'ca-e06', name: 'Soupe du jour', category: 'entrees', price: 35, cost: 7, unitsThisMonth: 64, station: 'cuisine-chaude', tags: [], times: { matin: 0, midi: 38, soir: 26 } },
      { id: 'ca-t01', name: 'Tajine kefta', category: 'tajines', price: 180, cost: 52, unitsThisMonth: 542, station: 'cuisine-chaude', tags: ['signature', 'top'], times: { matin: 0, midi: 312, soir: 230 } },
      { id: 'ca-t02', name: 'Tajine poulet citron', category: 'tajines', price: 150, cost: 44, unitsThisMonth: 318, station: 'cuisine-chaude', tags: [], times: { matin: 0, midi: 184, soir: 134 } },
      { id: 'ca-t03', name: 'Tajine agneau pruneaux', category: 'tajines', price: 220, cost: 78, unitsThisMonth: 142, station: 'cuisine-chaude', tags: ['premium'], times: { matin: 0, midi: 62, soir: 80 } },
      { id: 'ca-t04', name: 'Tajine 4 légumes', category: 'tajines', price: 120, cost: 22, unitsThisMonth: 96, station: 'cuisine-chaude', tags: ['vegan'], times: { matin: 0, midi: 58, soir: 38 } },
      { id: 'ca-t05', name: 'Tajine poisson', category: 'tajines', price: 200, cost: 68, unitsThisMonth: 78, station: 'cuisine-chaude', tags: [], times: { matin: 0, midi: 36, soir: 42 } },
      { id: 'ca-c01', name: 'Couscous royal', category: 'couscous', price: 220, cost: 64, unitsThisMonth: 284, station: 'cuisine-chaude', tags: ['signature'], times: { matin: 0, midi: 168, soir: 116 } },
      { id: 'ca-c02', name: 'Couscous tfaya', category: 'couscous', price: 180, cost: 48, unitsThisMonth: 168, station: 'cuisine-chaude', tags: [], times: { matin: 0, midi: 98, soir: 70 } },
      { id: 'ca-c03', name: 'Couscous légumes', category: 'couscous', price: 140, cost: 26, unitsThisMonth: 72, station: 'cuisine-chaude', tags: ['vegan'], times: { matin: 0, midi: 42, soir: 30 } },
      { id: 'ca-p01', name: 'Pastilla poulet', category: 'pastillas', price: 140, cost: 38, unitsThisMonth: 218, station: 'cuisine-chaude', tags: ['signature'], times: { matin: 0, midi: 124, soir: 94 } },
      { id: 'ca-p02', name: 'Pastilla seafood', category: 'pastillas', price: 180, cost: 62, unitsThisMonth: 124, station: 'cuisine-chaude', tags: ['premium'], times: { matin: 0, midi: 68, soir: 56 } },
      { id: 'ca-p03', name: 'Pastilla pigeon', category: 'pastillas', price: 220, cost: 84, unitsThisMonth: 38, station: 'cuisine-chaude', tags: ['premium'], times: { matin: 0, midi: 14, soir: 24 } },
      { id: 'ca-s01', name: 'Sandwich kefta', category: 'sandwiches', price: 50, cost: 16, unitsThisMonth: 312, station: 'comptoir', tags: [], times: { matin: 84, midi: 168, soir: 60 } },
      { id: 'ca-s02', name: 'Sandwich poulet', category: 'sandwiches', price: 45, cost: 14, unitsThisMonth: 286, station: 'comptoir', tags: [], times: { matin: 76, midi: 152, soir: 58 } },
      { id: 'ca-s03', name: 'Sandwich thon', category: 'sandwiches', price: 40, cost: 12, unitsThisMonth: 198, station: 'comptoir', tags: [], times: { matin: 58, midi: 102, soir: 38 } },
      { id: 'ca-s04', name: 'Bocadillo merguez', category: 'sandwiches', price: 55, cost: 18, unitsThisMonth: 142, station: 'comptoir', tags: [], times: { matin: 32, midi: 78, soir: 32 } },
      { id: 'ca-s05', name: 'Wrap végé', category: 'sandwiches', price: 42, cost: 13, unitsThisMonth: 64, station: 'comptoir', tags: ['vegan'], times: { matin: 18, midi: 32, soir: 14 } },
      { id: 'ca-s06', name: 'Croque-monsieur', category: 'sandwiches', price: 50, cost: 17, unitsThisMonth: 48, station: 'comptoir', tags: [], times: { matin: 14, midi: 22, soir: 12 } },
      { id: 'ca-s07', name: 'Panini fromage', category: 'sandwiches', price: 45, cost: 15, unitsThisMonth: 32, station: 'comptoir', tags: ['veg'], times: { matin: 8, midi: 18, soir: 6 } },
      { id: 'ca-s08', name: 'Hot-dog classique', category: 'sandwiches', price: 38, cost: 14, unitsThisMonth: 18, station: 'comptoir', tags: [], times: { matin: 4, midi: 8, soir: 6 } },
      { id: 'ca-b01', name: 'Thé à la menthe', category: 'boissons', price: 30, cost: 4, unitsThisMonth: 1842, station: 'bar', tags: ['signature', 'top'], times: { matin: 480, midi: 720, soir: 642 } },
      { id: 'ca-b02', name: 'Café noir', category: 'boissons', price: 15, cost: 3, unitsThisMonth: 1684, station: 'bar', tags: ['top'], times: { matin: 820, midi: 460, soir: 404 } },
      { id: 'ca-b03', name: 'Café au lait', category: 'boissons', price: 18, cost: 4, unitsThisMonth: 1218, station: 'bar', tags: ['top'], times: { matin: 642, midi: 320, soir: 256 } },
      { id: 'ca-b04', name: "Jus d'avocat", category: 'boissons', price: 50, cost: 12, unitsThisMonth: 684, station: 'bar-jus', tags: ['signature'], times: { matin: 102, midi: 318, soir: 264 } },
      { id: 'ca-b05', name: 'Jus orange pressé', category: 'boissons', price: 45, cost: 11, unitsThisMonth: 542, station: 'bar-jus', tags: [], times: { matin: 218, midi: 184, soir: 140 } },
      { id: 'ca-b06', name: 'Coca-Cola', category: 'boissons', price: 25, cost: 9, unitsThisMonth: 486, station: 'bar', tags: [], times: { matin: 84, midi: 234, soir: 168 } },
      { id: 'ca-b07', name: 'Eau minérale 50cl', category: 'boissons', price: 15, cost: 4, unitsThisMonth: 824, station: 'bar', tags: [], times: { matin: 142, midi: 412, soir: 270 } },
      { id: 'ca-b08', name: 'Smoothie fruits rouges', category: 'boissons', price: 55, cost: 16, unitsThisMonth: 38, station: 'bar-jus', tags: [], times: { matin: 4, midi: 18, soir: 16 } },
      { id: 'ca-d01', name: 'Crêpe nutella', category: 'desserts', price: 45, cost: 8, unitsThisMonth: 412, station: 'creperie', tags: ['signature'], times: { matin: 64, midi: 168, soir: 180 } },
      { id: 'ca-d02', name: 'Pancakes sirop érable', category: 'desserts', price: 50, cost: 10, unitsThisMonth: 286, station: 'creperie', tags: [], times: { matin: 102, midi: 84, soir: 100 } },
      { id: 'ca-d03', name: 'Tarte du jour', category: 'desserts', price: 40, cost: 9, unitsThisMonth: 168, station: 'patisserie', tags: [], times: { matin: 28, midi: 78, soir: 62 } },
      { id: 'ca-d04', name: 'Crème brûlée', category: 'desserts', price: 45, cost: 11, unitsThisMonth: 124, station: 'patisserie', tags: ['premium'], times: { matin: 8, midi: 42, soir: 74 } },
      { id: 'ca-d05', name: 'Glace 2 boules', category: 'desserts', price: 35, cost: 9, unitsThisMonth: 86, station: 'glacier', tags: [], times: { matin: 14, midi: 38, soir: 34 } },
    ],
    maisonMansour: [
      { id: 'mm-b01', name: 'Thé à la menthe', category: 'boissons', price: 25, cost: 3, unitsThisMonth: 142, station: 'comptoir', tags: ['signature'], times: { matin: 38, midi: 64, soir: 40 } },
      { id: 'mm-b02', name: 'Café espresso', category: 'boissons', price: 18, cost: 3, unitsThisMonth: 98, station: 'comptoir', tags: [], times: { matin: 28, midi: 42, soir: 28 } },
      { id: 'mm-b03', name: 'Eau minérale', category: 'boissons', price: 12, cost: 4, unitsThisMonth: 84, station: 'comptoir', tags: [], times: { matin: 18, midi: 36, soir: 30 } },
    ],
    spaBahia: [
      { id: 'sp-s01', name: 'Hammam traditionnel', category: 'soins', price: 280, cost: 42, unitsThisMonth: 142, station: 'hammam', tags: ['signature', 'top'], times: { matin: 38, midi: 56, soir: 48 } },
      { id: 'sp-s02', name: 'Massage relaxant 60min', category: 'soins', price: 450, cost: 64, unitsThisMonth: 86, station: 'cabine-1', tags: ['signature'], times: { matin: 24, midi: 32, soir: 30 } },
      { id: 'sp-s03', name: 'Soin visage', category: 'soins', price: 380, cost: 58, unitsThisMonth: 64, station: 'cabine-2', tags: [], times: { matin: 18, midi: 24, soir: 22 } },
      { id: 'sp-s04', name: 'Forfait Argan complet', category: 'soins', price: 680, cost: 94, unitsThisMonth: 38, station: 'cabine-1', tags: ['premium'], times: { matin: 8, midi: 14, soir: 16 } },
      { id: 'sp-s05', name: 'Manucure pédicure', category: 'soins', price: 220, cost: 28, unitsThisMonth: 52, station: 'cabine-3', tags: [], times: { matin: 14, midi: 22, soir: 16 } },
      { id: 'sp-s06', name: 'Gommage corps', category: 'soins', price: 250, cost: 32, unitsThisMonth: 42, station: 'hammam', tags: [], times: { matin: 12, midi: 16, soir: 14 } },
    ],
  };

  /* Kitchen stations, demo state.
   * avgPrepMin · average minutes to prep an item at this station.
   *              The KDS scheduler uses this to time multi-station
   *              tickets so plates finish together.
   * sync       · when true, items here are delayed so they finish at the
   *              same time as the slowest sync-enabled station on the
   *              ticket. When false, items fire immediately (typical for
   *              drinks the owner wants served first as apéritif). */
  const MI_STATION_STATE = {
    'cuisine-chaude': { dot: 'busy',    meta: '142 tickets aujourd\'hui',       avgPrepMin: 18, sync: true  },
    'cuisine-froide': { dot: 'on',      meta: 'Opérationnelle',                 avgPrepMin: 6,  sync: true  },
    'comptoir':       { dot: 'on',      meta: 'Opérationnelle',                 avgPrepMin: 4,  sync: true  },
    'bar':            { dot: 'on',      meta: 'Opérationnelle',                 avgPrepMin: 5,  sync: false },
    'bar-jus':        { dot: 'on',      meta: 'Opérationnelle',                 avgPrepMin: 3,  sync: false },
    'creperie':       { dot: 'pending', meta: '1 modificateur en attente',      avgPrepMin: 8,  sync: true  },
    'patisserie':     { dot: 'on',      meta: 'Opérationnelle',                 avgPrepMin: 12, sync: true  },
    'glacier':        { dot: 'off',     meta: 'Station fermée',                 avgPrepMin: 4,  sync: false },
  };
  /* Station list per venue, derived once from the demo carte. */
  const miStations = {};

  function miMenuVenue() {
    // Identity/pairing can prove a real merchant one tick before pickOwnVenue()
    // replaces the stale demo id. During that tick the safe menu is empty.
    if (isRealMerchant() && !isCustom(currentVenue)) return 'own';
    if (currentVenue === 'fusion') return 'cafeAtlas';
    // A custom / operator-scoped venue keeps its OWN (empty) carte, never the
    // Café Atlas demo menu. Only a genuine demo venue falls back to cafeAtlas.
    if (isCustom(currentVenue)) return currentVenue;
    return REAL_VENUES.includes(currentVenue) ? currentVenue : 'cafeAtlas';
  }
  function miLiveStore(venue) {
    const v = venue || miMenuVenue();
    return isCustom(v) && window.KiwiMenuStore ? window.KiwiMenuStore : null;
  }
  function miLiveData(venue) {
    const S = miLiveStore(venue);
    return S ? (S.data(venue || miMenuVenue()) || { cats: [], items: [], stations: [], opts: [] }) : null;
  }
  function miItems(venue) {
    const v = venue || miMenuVenue();
    const d = miLiveData(v);
    if (!d) return MENU[v] || [];
    const stations = d.stations || [];
    const kitchenId = window.KiwiMenuStore.kitchenId(v);
    return (d.items || []).map((it) => {
      const cat = (d.cats || []).find((c) => c.id === it.catId);
      const stationId = (cat && cat.station) || kitchenId;
      const station = stations.find((s) => s.id === stationId);
      const sub = cat && it.subId ? (cat.sub || []).find((s) => s.id === it.subId) : null;
      let cost = null;
      try { cost = window.KiwiCost?.itemCost?.(it.id); } catch (_) {}
      return {
        id: it.id, name: it.name, desc: it.desc || '', category: it.catId,
        subId: sub ? sub.id : null, subLabel: sub ? sub.name : null,
        price: +it.price || 0, cost: cost == null ? null : +cost,
        unitsThisMonth: null, station: stationId,
        stationLabel: (station && station.name) || 'Cuisine',
        tags: [], times: {}, venue: v, avail: it.avail !== false,
        optionCount: Array.isArray(it.opts) ? it.opts.length : 0, live: true,
      };
    });
  }
  function miGetStations(venue) {
    venue = venue || miMenuVenue();
    const d = miLiveData(venue);
    if (d) return (d.stations || []).map(s => s.id);
    if (!miStations[venue]) miStations[venue] = [...new Set((MENU[venue] || []).map(i => i.station))];
    return miStations[venue];
  }
  /* The KDS uses a different (shorter) station vocabulary than the menu.
   * This maps KDS ids onto menu ids so one configuration drives both. */
  const MI_STATION_ALIASES = {
    cuisson:  'cuisine-chaude',
    salade:   'cuisine-froide',
    boissons: 'bar-jus',
    pastry:   'patisserie',
    crepes:   'creperie',
    bbq:      'cuisine-chaude',
  };
  /* Resolve a station's state with sensible defaults for any missing field,
   * KDS-style aliases included (cuisson → cuisine-chaude etc.). */
  function miStationState(s) {
    const key = MI_STATION_ALIASES[s] || s;
    const base = MI_STATION_STATE[key] || {};
    return {
      dot: base.dot || 'on',
      meta: base.meta || 'Opérationnelle',
      avgPrepMin: typeof base.avgPrepMin === 'number' ? base.avgPrepMin : 10,
      sync: typeof base.sync === 'boolean' ? base.sync : true,
    };
  }

  /* ═══════════ MENU · ROUTING ═══════════
   * The menu page has one owner: the restaurant workspace, for the
   * restaurant family (restaurant, café, fast-food, boulangerie…). An activity
   * with no menu (spa, boutique, hôtel, the Go Ultra overview) has no menu
   * page, so « ouvre le menu », a palette entry or KiwiVenue.showMenu() opens
   * what its own sidebar calls its catalogue: soins, articles, tarifs. With
   * none of those, it says so instead of drawing a restaurant carte. */
  const MENU_TYPES = ['restaurant', 'cafe', 'café', 'restauration'];
  const MENU_FALLBACK_NAVS = ['services', 'inventory', 'tarifs'];
  const MENU_NONE = {
    fr: ['Pas de carte ici', 'Cette activité n’a pas de menu de restaurant.'],
    en: ['No menu here', 'This business has no restaurant menu.'],
    ar: ['لا توجد قائمة هنا', 'هذا النشاط ليس له قائمة مطعم.'],
  };
  let menuWait = 0;
  function menuWorkspace() {
    const W = window.KiwiRestaurantMenuWorkspace;
    return W && typeof W.show === 'function' ? W : null;
  }
  function menuOwnedByWorkspace() {
    const W = menuWorkspace();
    if (W && typeof W.isRestaurant === 'function') return W.isRestaurant();
    return MENU_TYPES.includes(String(getVenueType() || '').toLowerCase());
  }
  function showMenu() {
    clearTimeout(menuWait);
    if (menuOwnedByWorkspace()) {
      const W = menuWorkspace();
      if (W) { W.show(true); return true; }
      /* The workspace loads late (fetchpriority=low). Wait for it rather than
       * open anything else for a restaurant. */
      let tries = 0;
      const retry = () => {
        const w = menuWorkspace();
        if (w) { w.show(true); return; }
        if (++tries < 80) menuWait = setTimeout(retry, 50);
      };
      menuWait = setTimeout(retry, 50);
      return true;
    }
    const H = window.Kiwi && window.Kiwi.handlers;
    for (const nav of MENU_FALLBACK_NAVS) {
      if (!document.querySelector(`.sidebar nav a[data-nav="${nav}"]`)) continue;
      const go = H && H['nav-' + nav];
      if (typeof go === 'function') { go(); return true; }
    }
    const lang = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
    const [title, desc] = MENU_NONE[lang] || MENU_NONE.fr;
    window.Kiwi?.toast?.(title, { type: 'info', desc });
    return false;
  }
  function menuNavHandler() { showMenu(); }
  /* The workspace never wraps nav-accueil: leaving its page for the dashboard
   * clears the menu shell here. */
  function menuShowDashboard() {
    if (!document.body.classList.contains('page-menu')) return;
    document.body.classList.remove('page-menu');
    window.Kiwi?.breadcrumb?.();
    window.Kiwi?.setActivePage?.('accueil');
  }
  function menuWireHandlers() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) { setTimeout(menuWireHandlers, 30); return; }
    H['nav-menu'] = menuNavHandler;
    const origAccueil = H['nav-accueil'];
    H['nav-accueil'] = function () {
      try { if (origAccueil) origAccueil.apply(this, arguments); } catch (_) {}
      menuShowDashboard();
    };
  }
  menuWireHandlers();

  /* pages.js / pages-pro.js load AFTER this file: they install their own
   * nav-menu drawers and REPLACE nav-accueil, dropping the menu teardown.
   * Wire again once every deferred script has run, so leaving the workspace
   * clears its page, and so the restaurant workspace, which keeps the
   * handler it replaces as its fallback for non-restaurant activities, falls
   * back to the router above and not to a legacy drawer. (Équipe and Paie
   * are team.js's alone.) */
  window.addEventListener('load', menuWireHandlers);

  /* ═══════════════ INIT (deferred to here so STAFF is defined) ═══════════════ */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* On localhost the page can begin as the sales demo, then /api/me proves a
     real signed-in merchant a moment later. Reconcile after that proof: a real
     account with no cached/custom venue must move to the transient empty venue,
     never remain on Café Atlas. This closes the real-but-not-custom gap without
     making the public localhost demo disappear before identity is known. */
  function reconcileRealVenue() {
    if (!isRealMerchant() || isCustom(currentVenue)) return;
    pickOwnVenue();
    subscribers.forEach(fn => { try { fn(currentVenue); } catch (_) {} });
  }
  const wireIdentity = () => {
    try { window.KiwiIdentity?.ready?.then?.(reconcileRealVenue); } catch (_) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireIdentity, { once: true });
  else wireIdentity();
  document.addEventListener('kiwi-paired', reconcileRealVenue);

  /* ═══════════════ SALES STORE (user-created venues) ═══════════════
   * A custom venue starts empty; the merchant rings up real sales via the
   * "Nouvelle vente" keypad. Each sale is persisted per-venue and the
   * dashboard (hero / KPI band / feed) recomputes from this store. */
  const salesSubs = new Set();
  /* `own` and `scoped` are shared browser placeholders, not tenant ids: a plain
   * `kiwiSales:scoped` bucket leaked client A's takings into client B when one
   * browser served both accounts. The answer is a namespace, not a wipe — the
   * bucket is stamped with the merchant slug the view resolved to, so a cache
   * can survive a reload without ever being readable by the next tenant. A
   * transient id with no slug yet has no cache at all, which is the old
   * fail-closed behaviour. */
  function salesTenant(vid) {
    let s = '';
    try { s = slugOf(vid) || ''; } catch (_) { s = ''; }
    if (s) return s;
    /* `own` est le magasin de CE navigateur : à défaut de venue résolue, le
     * locataire apparié fait foi. Jamais pour `scoped` — là, l'appareil est
     * apparié à la caisse de l'opérateur, pas au client qu'il regarde, et se
     * rabattre dessus rangerait les ventes du client sous le nom de
     * l'opérateur. Sans slug servi par /api/me, `scoped` n'a pas de cache. */
    if (vid === 'scoped') return '';
    try { s = String(localStorage.getItem('kiwiLiveMerchant') || '').trim(); } catch (_) { s = ''; }
    return s;
  }
  function SALES_KEY(id) {
    const vid = id || currentVenue;
    if (TRANSIENT_IDS.indexOf(vid) < 0) return 'kiwiSales:' + vid;
    const slug = salesTenant(vid);
    return slug ? 'kiwiSales:' + vid + '@' + slug : '';
  }
  /* One parse per change of the stored text, not per read. A dashboard
   * redraw reads the ledger about fifty times; with 2 848 sales (1.2 MB) each
   * JSON.parse cost ~5 ms, so one click on a date range spent ~350 ms
   * re-parsing the same string. The stored text is still read every time, so
   * another tab's write is seen at once. The cached rows are frozen, nested
   * objects included: a reader can never alter the shared copy, and the few
   * writers below copy before changing anything. */
  const ledgerCache = new Map();
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
    return o;
  }
  function cachedLedger(key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) { return []; }
    const hit = ledgerCache.get(key);
    if (hit && hit.raw === raw) return hit.rows;
    let rows = [];
    try { const a = JSON.parse(raw || '[]'); rows = Array.isArray(a) ? a : []; } catch (_) { rows = []; }
    ledgerCache.set(key, { raw, rows: deepFreeze(rows) });
    return rows;
  }
  function salesList(id) {
    const key = SALES_KEY(id || currentVenue);
    if (!key) return [];
    return cachedLedger(key);
  }
  /* Pas de clé ⇒ pas d'écriture. `localStorage.setItem('', …)` est légal et
   * rangerait les ventes d'un locataire non résolu sous une clé vide, partagée
   * par tout le navigateur : exactement la fuite que le nommage évite. */
  function salesWrite(id, list) {
    const key = SALES_KEY(id || currentVenue);
    if (!key) return false;
    try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch (_) { return false; }
  }

  /* Legacy un-namespaced placeholder buckets written by older builds. They are
   * the unsafe shape this file used to delete on every load; heal them once. */
  TRANSIENT_IDS.forEach((tid) => {
    try { localStorage.removeItem('kiwiSales:' + tid); } catch (_) {}
    try { localStorage.removeItem('kiwiRefunds:' + tid); } catch (_) {}
    try { localStorage.removeItem('kiwiPlanDeSalle:' + tid); } catch (_) {}
  });
  function salesAdd(id, sale) {
    id = id || currentVenue;
    const list = salesList(id).slice();
    const entry = salesEntry(sale);
    list.push(entry);
    salesWrite(id, list);
    salesSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    return entry;
  }
  /* A history arriving all at once (first open on a device, a stale cache):
     one read, one write and one redraw for the whole batch. Adding 2 848
     sales one by one re-read and re-wrote the ledger and redrew the
     dashboard 2 848 times, which froze Santos Store's page for minutes. */
  function salesAddMany(id, sales) {
    id = id || currentVenue;
    const rows = Array.isArray(sales) ? sales : [];
    if (!rows.length) return [];
    const list = salesList(id).slice(), out = [];
    for (let i = 0; i < rows.length; i++) { const entry = salesEntry(rows[i]); list.push(entry); out.push(entry); }
    salesWrite(id, list);
    salesSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    return out;
  }
  function salesEntry(sale) {
    const entry = { ts: (sale && +sale.ts) || Date.now(), amount: Math.max(0, +(sale && sale.amount) || 0), method: (sale && sale.method) || 'card' };
    // What was actually sold. The till sends it and the live card shows it, but it
    // used to stop there — so the Ventes list read "Vente · Vente · Vente" and the
    // owner could not tell which row was the shirt a customer now wants to return.
    // Capped to match the server's own 80-char column.
    const lbl = String((sale && sale.label) || '').trim().slice(0, 80);
    if (lbl) entry.label = lbl;
    const ref = String((sale && sale.ref) || '').trim().slice(0, 80);
    const receiptRef = String((sale && sale.receiptRef) || '').trim().slice(0, 80);
    const origin = String((sale && sale.origin) || '').trim().slice(0, 16);
    const server = String((sale && sale.server) || '').trim().slice(0, 80);
    const channel = String((sale && sale.channel) || '').trim().slice(0, 24);
    const saleId = String((sale && (sale.saleId || sale.id)) || '').trim().slice(0, 80);
    if (ref) entry.ref = ref;
    if (receiptRef) entry.receiptRef = receiptRef;
    if (origin) entry.origin = origin;
    if (server) entry.server = server;
    if (channel) entry.channel = channel;
    if (saleId) entry.saleId = saleId;
    /* Le pourboire saisi à l'encaissement, en centimes, hors du montant. */
    const tipCents = Math.round(Number(sale && sale.tipCents));
    if (Number.isSafeInteger(tipCents) && tipCents > 0) entry.tipCents = tipCents;
    if (sale && Array.isArray(sale.paymentParts) && sale.paymentParts.length) {
      entry.paymentParts = sale.paymentParts.slice(0, 8).map(part => ({
        method: String((part && part.method) || '').slice(0, 16),
        amountCents: Math.round(Number(part && part.amountCents)),
      })).filter(part => /^[a-z-]{1,16}$/.test(part.method) && Number.isSafeInteger(part.amountCents) && part.amountCents > 0);
    }
    /* Optional discount facts are server-validated and stay attached to the
       immutable sale. Reject partial/code-shaped metadata at this second
       boundary rather than teaching analytics to guess. */
    if (sale && sale.discountAmountCents != null) {
      const gross = Math.round(Number(sale.grossAmountCents));
      const discount = Math.round(Number(sale.discountAmountCents));
      const reason = String(sale.discountReason || '');
      const actorId = String(sale.actorId || '').slice(0, 96);
      if (Number.isFinite(gross) && gross > 0 && Number.isFinite(discount) && discount > 0 && discount <= gross
        && /^(commercial|loyal-customer|kitchen-error|other)$/.test(reason)
        && /^[A-Za-z0-9:_-]{1,96}$/.test(actorId) && !/^\d{4}$/.test(actorId)) {
        entry.grossAmountCents = gross; entry.discountAmountCents = discount;
        entry.discountReason = reason; entry.actorId = actorId;
      }
    }
    // Live-Link sales carry the feed rowid as `cursor` — persisted so the bridge
    // dedups against the store itself and can never double-count or drift below it.
    if (sale && sale.cursor) entry.cursor = sale.cursor;
    /* Le panier, quand la caisse l'a envoyé. C'est la seule source de vérité
       par article pour un commerçant réel : le libellé est un résumé de ticket
       (« Pain +3 art. »), le classer reviendrait à classer des tickets en
       prétendant classer des produits. Absent ⇒ inconnu, jamais « panier vide ». */
    if (sale && Array.isArray(sale.lines) && sale.lines.length) {
      entry.lines = sale.lines.slice(0, 40).map(function (l) {
        var qty = Math.round(Math.max(0, +(l && (l.qty ?? l.quantity)) || 0) * 1000) / 1000;
        var total = Math.round(Math.max(0, +(l && l.total) || 0) * 100) / 100;
        var o = { name: String((l && l.name) || 'Article').slice(0, 60), qty: qty, total: total };
        var baseName = String((l && l.baseName) || '').slice(0, 60);
        if (baseName) o.baseName = baseName;
        /* La catégorie, telle que la caisse la connaissait AU MOMENT de la vente.
           Sans elle, le rapport journalier d'une journée pas encore clôturée
           reclasse les ventes d'après le catalogue actuel — et se trompe dès
           qu'un rayon a été renommé depuis. Absente ⇒ inconnue, jamais inventée. */
        var c = String((l && (l.cat || l.category)) || '').slice(0, 40);
        if (c) o.cat = c;
        var itemId = String((l && (l.itemId || l.id)) || '').slice(0, 80);
        var variantId = String((l && l.variantId) || '').slice(0, 80);
        var unit = String((l && l.unit) || '').slice(0, 24);
        var kind = String((l && l.kind) || '').slice(0, 24);
        var recipeVersionId = String((l && l.recipeVersionId) || '').slice(0, 80);
        if (itemId) o.itemId = itemId;
        if (variantId) o.variantId = variantId;
        if (unit) o.unit = unit;
        if (kind) o.kind = kind;
        if (recipeVersionId) o.recipeVersionId = recipeVersionId;
        var unitCost = +(l && l.unitCost);
        if (Number.isFinite(unitCost) && unitCost >= 0) o.unitCost = Math.round(unitCost * 100) / 100;
        if (Array.isArray(l && l.options)) o.options = l.options.slice(0, 16);
        return o;
      }).filter(function (l) { return l.qty > 0; });
      if (!entry.lines.length) delete entry.lines;
    }
    return entry;
  }
  /* Copie l'entrée et y pose les métadonnées du serveur. Rend la copie si
   * quelque chose a changé, sinon null (l'entrée d'origine, gelée, est intacte). */
  function annotatedEntry(original, meta) {
    const entry = Object.assign({}, original);
    let changed = false;
    [['ref', 80], ['receiptRef', 80], ['origin', 16], ['server', 80], ['channel', 24], ['saleId', 80]].forEach(([key, limit]) => {
      const value = String(meta && (meta[key] || (key === 'saleId' ? (meta.saleId || meta.id) : '')) || '').trim().slice(0, limit);
      if (value && entry[key] !== value) { entry[key] = value; changed = true; }
    });
    if (meta && Array.isArray(meta.paymentParts) && meta.paymentParts.length && !entry.paymentParts) {
      entry.paymentParts = meta.paymentParts.slice(0, 8).map(part => ({
        method: String((part && part.method) || '').slice(0, 16), amountCents: Math.round(Number(part && part.amountCents)),
      })).filter(part => /^[a-z-]{1,16}$/.test(part.method) && Number.isSafeInteger(part.amountCents) && part.amountCents > 0);
      changed = true;
    }
    /* Le pourboire peut être posé APRÈS la vente (reprise d'un dépôt déjà
     * enregistré) : une vente déjà copiée le reçoit ici, jamais à la baisse. */
    const tip = Math.round(Number(meta && meta.tipCents));
    if (Number.isSafeInteger(tip) && tip > (Number(entry.tipCents) || 0)) { entry.tipCents = tip; changed = true; }
    return changed ? entry : null;
  }
  function salesAnnotate(id, cursor, meta) {
    return salesAnnotateMany(id, [{ cursor, meta }]) > 0;
  }
  /* Plusieurs annotations, une écriture, un seul réaffichage. Un registre ancien
   * à qui il manque un champ du serveur en réclamait une par vente : 2 848
   * réécritures de 1,2 Mo et autant de réaffichages, le gel du tableau de bord.
   * Rend le nombre de ventes modifiées. */
  function salesAnnotateMany(id, patches) {
    id = id || currentVenue;
    const list = salesList(id).slice();
    const at = new Map();
    list.forEach((sale, i) => { const c = Number(sale && sale.cursor) || 0; if (c && !at.has(c)) at.set(c, i); });
    let changed = 0;
    (Array.isArray(patches) ? patches : []).forEach((p) => {
      const i = at.get(Number(p && p.cursor) || 0);
      if (i == null) return;
      const entry = annotatedEntry(list[i], p.meta);
      if (entry) { list[i] = entry; changed++; }
    });
    if (!changed) return 0;
    /* Passe par salesWrite comme les autres écritures : la clé d'un locataire
     * non résolu est vide, et `localStorage.setItem('', …)` rangerait la vente
     * dans un seau partagé par tout le navigateur. */
    if (!salesWrite(id, list)) return 0;
    salesSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    return changed;
  }
  /* ═══ RETIRER UNE VENTE DU MAGASIN LOCAL ═══
   * Une vente de test sortie des livres par la console opérateur cesse d'être
   * servie par /api/feed — mais celles que ce navigateur a DÉJÀ recopiées sont
   * ici, dans localStorage, et le flux est un curseur : il ne repasse jamais sur
   * ce qu'il a déjà donné. Sans cette porte de sortie, la vente resterait dans
   * le chiffre d'affaires de cet appareil pour toujours, alors que le serveur ne
   * la compte plus — deux vérités pour un même commerce, exactement ce qu'on
   * cherchait à éviter.
   *
   * On enlève par CURSEUR (le rowid du flux), la seule clé que le serveur et le
   * navigateur partagent : `ts + montant` confondrait deux ventes identiques
   * encaissées dans la même seconde, ce qu'une caisse fait tous les jours à
   * l'heure de pointe.
   *
   * Ne notifie que si quelque chose a bougé : le sondage passe toutes les 2,5 s
   * avec la même liste, et redessiner le tableau de bord à chaque fois pour ne
   * rien changer ferait clignoter les cartes en continu. Les ventes saisies à la
   * main (pavé « Nouvelle vente », donc sans curseur) ne sont jamais touchées :
   * elles n'ont pas d'existence côté serveur, il n'y a rien à retirer. */
  function salesRemove(id, cursors) {
    id = id || currentVenue;
    if (!cursors || !cursors.length) return 0;
    const kill = new Set();
    cursors.forEach((c) => { const n = Number(c); if (n) kill.add(n); });
    if (!kill.size) return 0;
    const list = salesList(id);
    const kept = list.filter((s) => !(s && s.cursor && kill.has(Number(s.cursor))));
    const gone = list.length - kept.length;
    if (!gone) return 0;
    salesWrite(id, kept);
    salesSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
    return gone;
  }
  /* Repair devices contaminated before tenant isolation. After Live Link has
   * replayed the complete authoritative feed, cursor-backed rows absent from
   * that feed cannot belong to this store. Local/manual rows have no cursor and
   * remain untouched. */
  function salesRetainCursors(id, cursors, proof) {
    id = id || currentVenue;
    if (!proof && window.KiwiSalesReconcile?.coverage(id) != null) return 0;
    const keep = new Set((cursors || []).map(Number).filter(Boolean));
    const list = salesList(id);
    const clean = proof
      ? (window.KiwiSalesReconcile?.coverage(id) === proof.from && window.KiwiSalesReconcile.scope(id) === proof.scope
        ? window.KiwiSalesReconcile.retain(list, cursors, proof) : list)
      : list.filter((s) => !(s && s.cursor) || keep.has(Number(s.cursor)));
    const gone = list.length - clean.length;
    if (!gone) return 0;
    salesWrite(id, clean);
    salesSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
    return gone;
  }
  /* Refunds are financial events, not sales. Keep them in a sibling store so
     product rankings, units sold and cost coverage never count returned money
     as another item sold, while revenue readers can subtract the same durable
     events the till and God Mode see. */
  const refundSubs = new Set();
  function REFUNDS_KEY(id) {
    const saleKey = SALES_KEY(id || currentVenue);
    return saleKey ? saleKey.replace(/^kiwiSales:/, 'kiwiRefunds:') : '';
  }
  function refundsList(id) {
    const key = REFUNDS_KEY(id || currentVenue); if (!key) return [];
    return cachedLedger(key);
  }
  function refundsWrite(id, rows) {
    const key = REFUNDS_KEY(id || currentVenue); if (!key) return false;
    try { localStorage.setItem(key, JSON.stringify(rows)); return true; } catch (_) { return false; }
  }
  function refundsAdd(id, refund) {
    id = id || currentVenue;
    const rows = refundsList(id);
    const cursor = Number(refund && refund.cursor) || 0;
    const saleId = String((refund && (refund.saleId || refund.id)) || '').slice(0, 80);
    if ((cursor && rows.some((r) => Number(r && r.cursor) === cursor))
      || (saleId && rows.some((r) => String(r && r.saleId) === saleId))) return false;
    const entry = {
      ts: Number(refund && refund.ts) || Date.now(), amount: Math.abs(Number(refund && refund.amount) || 0),
      method: String((refund && refund.method) || 'cash').slice(0, 16), kind: 'refund',
      label: String((refund && refund.label) || 'Remboursement').slice(0, 80),
      ref: String((refund && refund.ref) || '').slice(0, 80), cursor, saleId,
    };
    if (!(entry.amount > 0) || !refundsWrite(id, rows.concat(entry))) return false;
    refundSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
    salesSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
    return true;
  }
  function refundsRetainCursors(id, cursors, proof) {
    id = id || currentVenue;
    if (!proof && window.KiwiSalesReconcile?.coverage(id) != null) return 0;
    const keep = new Set((cursors || []).map(Number).filter(Boolean));
    const rows = refundsList(id);
    const clean = proof
      ? (window.KiwiSalesReconcile?.coverage(id) === proof.from && window.KiwiSalesReconcile.scope(id) === proof.scope
        ? window.KiwiSalesReconcile.retain(rows, cursors, proof) : rows)
      : rows.filter((r) => !(r && r.cursor) || keep.has(Number(r.cursor)));
    const gone = rows.length - clean.length;
    if (gone && refundsWrite(id, clean)) {
      refundSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
      salesSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
    }
    return gone;
  }
  function salesReconcile(id, raw, proof) {
    const helper = window.KiwiSalesReconcile;
    if (!helper || helper.coverage(id) !== proof.from || helper.scope(id) !== proof.scope) throw new Error('scope');
    const sales = helper.reconcile(salesList(id), raw, proof, 1, salesEntry);
    const refunds = helper.reconcile(refundsList(id), raw, proof, -1, row => ({
      ts: row.ts, amount: row.amount, method: row.method, kind: 'refund',
      label: row.label || 'Remboursement', ref: row.ref || '', cursor: row.cursor, saleId: row.saleId,
    }));
    const salesChanged = JSON.stringify(sales) !== JSON.stringify(salesList(id));
    const refundsChanged = JSON.stringify(refunds) !== JSON.stringify(refundsList(id));
    if ((salesChanged && !salesWrite(id, sales)) || (refundsChanged && !refundsWrite(id, refunds))) throw new Error('ledger');
    const verified = helper.verify(salesList(id), refundsList(id), raw, proof);
    if (salesChanged || refundsChanged) salesSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    if (refundsChanged) refundSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    return verified;
  }
  /* Bornes FACULTATIVES. Sans elles le total reste ce qu'il a toujours été —
   * tout l'historique — parce que plusieurs appelants veulent précisément ça :
   * « ce commerce a-t-il déjà vendu une seule fois ? » (interactive.js) n'a pas
   * de période. Mais la pastille « Commandes » de la barre latérale, elle, en a
   * une : celle du tableau de bord, affichée juste à côté sous le même mot. */
  function salesTotals(id, from, to) {
    const list = salesList(id);
    const lo = (from == null) ? -Infinity : from;
    const hi = (to == null) ? Infinity : to;
    let revenue = 0, gross = 0, count = 0;
    list.forEach((x) => {
      const ts = +(x && x.ts) || 0;
      if (ts < lo || ts >= hi) return;
      revenue += (x.amount || 0); gross += (x.amount || 0);
      count++;
    });
    refundsList(id).forEach((x) => {
      const ts = +(x && x.ts) || 0;
      if (ts >= lo && ts < hi) revenue -= Math.abs(x.amount || 0);
    });
    return { revenue, count, basket: count ? gross / count : 0 };
  }
  /* Live dashboard recommendations are owned by KiwiDateRange. Keeping a
   * second calculator here previously let the insight fall back to all-time
   * sales while the KPI band showed today. */

  window.KiwiSales = {
    scope: id => SALES_KEY(id).replace(/^kiwiSales:/, ''),
    reconcile: salesReconcile,
    trimWrite(id, sales, refunds, scope) {
      if (window.KiwiSalesReconcile?.scope(id) !== scope || window.KiwiSalesReconcile.coverage(id) == null) throw new Error('scope');
      if (!salesWrite(id, sales) || !refundsWrite(id, refunds)) throw new Error('ledger');
      salesSubs.forEach(fn => { try { fn(id); } catch (_) {} });
      refundSubs.forEach(fn => { try { fn(id); } catch (_) {} });
    },
    add: salesAdd,
    addMany: salesAddMany,
    annotate: salesAnnotate,
    annotateMany: salesAnnotateMany,
    list: salesList,
    remove: salesRemove,
    retainCursors: salesRetainCursors,
    totals: salesTotals,
    subscribe: fn => { salesSubs.add(fn); return () => salesSubs.delete(fn); },
  };
  /* Un remboursement annulé sur le serveur quitte le journal local tout de
   * suite, comme une vente annulée : sinon il pèse sur le net jusqu'à la fin du
   * prochain flux complet. */
  function refundsRemove(id, cursors) {
    id = id || currentVenue;
    const kill = new Set((cursors || []).map(Number).filter(Boolean));
    if (!kill.size) return 0;
    const rows = refundsList(id);
    const clean = rows.filter((r) => !(r && r.cursor && kill.has(Number(r.cursor))));
    const gone = rows.length - clean.length;
    if (gone && refundsWrite(id, clean)) {
      refundSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
      salesSubs.forEach((fn) => { try { fn(id); } catch (_) {} });
    }
    return gone;
  }
  window.KiwiRefunds = {
    add: refundsAdd, list: refundsList, retainCursors: refundsRetainCursors, remove: refundsRemove,
    subscribe: fn => { refundSubs.add(fn); return () => refundSubs.delete(fn); },
  };
  // Keep the sidebar "Commandes" badge in lockstep with recorded sales.
  salesSubs.add(() => renderSidebarCounts());
  /* …et avec la PÉRIODE. Depuis que la pastille compte une fenêtre, changer de
   * plage sans la redessiner la laissait sur le compte de la plage précédente —
   * on aurait remplacé un désaccord permanent par un désaccord intermittent,
   * plus difficile à croire et bien plus difficile à signaler.
   *
   * Abonnement DIFFÉRÉ, et c'est la partie qui compte : dashboard.html charge
   * venues.js AVANT dateRange.js. Au moment où cette ligne s'exécute,
   * window.KiwiDateRange n'existe donc pas encore, et un `?.subscribe?.()`
   * optimiste ici ne lève rien — il ne fait simplement RIEN, en silence, ce qui
   * est la pire façon de rater un abonnement. Les deux fichiers sont `defer`,
   * donc tous deux ont fini avant DOMContentLoaded : c'est le premier instant
   * où l'on est sûr que l'autre module est là. */
  (function wireRangeToSidebar() {
    const wire = () => { try { window.KiwiDateRange?.subscribe?.(() => renderSidebarCounts()); } catch (_) {} };
    if (window.KiwiDateRange) wire();
    else document.addEventListener('DOMContentLoaded', wire, { once: true });
  })();

  /* Active venue's real menu — lets the financial assistant answer menu
   * questions (best/worst sellers, prices, margins) from data instead of
   * inventing dishes. */
  window.KiwiMenu = {
    items: () => (MENU[miMenuVenue()] || []).map(it => ({
      name: it.name, category: it.category, price: it.price, cost: it.cost, units: it.unitsThisMonth,
    })),
  };


  /* ═══════════════ INVENTORY · per-venue ingredient catalogue ═══════════════
   * Drives the Stock & approvisionnement page (assets/stock.js).
   * status: 'ok' (>= reorderLevel), 'low' (< reorderLevel, > 0), 'out' (= 0).
   * usageThisWeek and theoreticalUsage drive variance reporting (actual vs
   * what POS-recorded sales × recipes would imply). costPerUnit in MAD. */
  const INVENTORY = {
    cafeAtlas: [
      // ── Viandes & volailles ──
      { id: 'inv01', name: 'Viande hachée bœuf', category: 'viandes', unit: 'kg', currentStock: 12.4, parLevel: 18, reorderLevel: 8, costPerUnit: 95, supplier: 'Boucherie Errazi · Maarif', lastDelivery: '2026-05-13', deliveryFrequency: 'mardi-vendredi', usageThisWeek: 28.6, theoreticalUsage: 29.2, status: 'low' },
      { id: 'inv02', name: 'Poulet entier', category: 'viandes', unit: 'kg', currentStock: 24.8, parLevel: 30, reorderLevel: 12, costPerUnit: 52, supplier: 'Volailles Atlas · Bouskoura', lastDelivery: '2026-05-14', deliveryFrequency: 'lundi-jeudi', usageThisWeek: 18.4, theoreticalUsage: 18.0, status: 'ok' },
      { id: 'inv03', name: 'Agneau épaule', category: 'viandes', unit: 'kg', currentStock: 0, parLevel: 14, reorderLevel: 5, costPerUnit: 168, supplier: 'Boucherie Errazi · Maarif', lastDelivery: '2026-05-12', deliveryFrequency: 'mardi-vendredi', usageThisWeek: 9.2, theoreticalUsage: 11.4, status: 'out' },
      { id: 'inv04', name: 'Merguez', category: 'viandes', unit: 'kg', currentStock: 6.8, parLevel: 8, reorderLevel: 3, costPerUnit: 78, supplier: 'Boucherie Errazi · Maarif', lastDelivery: '2026-05-13', deliveryFrequency: 'mardi-vendredi', usageThisWeek: 4.2, theoreticalUsage: 4.6, status: 'ok' },
      { id: 'inv05', name: 'Thon en conserve', category: 'viandes', unit: 'boîte', currentStock: 48, parLevel: 60, reorderLevel: 24, costPerUnit: 14, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 36, theoreticalUsage: 38, status: 'ok' },
      // ── Poissons & fruits de mer ──
      { id: 'inv06', name: 'Poisson frais (sole)', category: 'poissons', unit: 'kg', currentStock: 0, parLevel: 6, reorderLevel: 2, costPerUnit: 142, supplier: 'Marché Central · Port Casablanca', lastDelivery: '2026-05-13', deliveryFrequency: 'tous-les-jours', usageThisWeek: 4.8, theoreticalUsage: 5.2, status: 'out' },
      { id: 'inv07', name: 'Crevettes', category: 'poissons', unit: 'kg', currentStock: 3.2, parLevel: 4, reorderLevel: 1.5, costPerUnit: 168, supplier: 'Marché Central · Port Casablanca', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 2.8, theoreticalUsage: 3.0, status: 'ok' },
      // ── Légumes & herbes ──
      { id: 'inv08', name: 'Tomates fraîches', category: 'legumes', unit: 'kg', currentStock: 18.6, parLevel: 25, reorderLevel: 10, costPerUnit: 8, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 32.4, theoreticalUsage: 31.0, status: 'low' },
      { id: 'inv09', name: 'Oignons', category: 'legumes', unit: 'kg', currentStock: 42, parLevel: 40, reorderLevel: 15, costPerUnit: 5, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-13', deliveryFrequency: 'lundi-mercredi-vendredi', usageThisWeek: 26.8, theoreticalUsage: 27.2, status: 'ok' },
      { id: 'inv10', name: 'Pommes de terre', category: 'legumes', unit: 'kg', currentStock: 28, parLevel: 35, reorderLevel: 12, costPerUnit: 6, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-13', deliveryFrequency: 'lundi-mercredi-vendredi', usageThisWeek: 38.4, theoreticalUsage: 37.0, status: 'ok' },
      { id: 'inv11', name: 'Courgettes', category: 'legumes', unit: 'kg', currentStock: 4.2, parLevel: 12, reorderLevel: 5, costPerUnit: 9, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-13', deliveryFrequency: 'tous-les-jours', usageThisWeek: 14.8, theoreticalUsage: 13.6, status: 'low' },
      { id: 'inv12', name: 'Carottes', category: 'legumes', unit: 'kg', currentStock: 16.4, parLevel: 18, reorderLevel: 7, costPerUnit: 5, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 11.2, theoreticalUsage: 11.6, status: 'ok' },
      { id: 'inv13', name: 'Coriandre fraîche', category: 'legumes', unit: 'botte', currentStock: 28, parLevel: 40, reorderLevel: 15, costPerUnit: 4, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 64, theoreticalUsage: 62, status: 'ok' },
      { id: 'inv14', name: 'Persil', category: 'legumes', unit: 'botte', currentStock: 32, parLevel: 35, reorderLevel: 12, costPerUnit: 4, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 56, theoreticalUsage: 54, status: 'ok' },
      { id: 'inv15', name: 'Menthe fraîche', category: 'legumes', unit: 'botte', currentStock: 18, parLevel: 60, reorderLevel: 20, costPerUnit: 3, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-13', deliveryFrequency: 'tous-les-jours', usageThisWeek: 142, theoreticalUsage: 138, status: 'low' },
      { id: 'inv16', name: 'Citrons', category: 'legumes', unit: 'kg', currentStock: 14, parLevel: 18, reorderLevel: 6, costPerUnit: 12, supplier: 'Marché de gros · Inezgane', lastDelivery: '2026-05-13', deliveryFrequency: 'lundi-mercredi-vendredi', usageThisWeek: 12.6, theoreticalUsage: 12.8, status: 'ok' },
      { id: 'inv17', name: 'Avocats', category: 'legumes', unit: 'kg', currentStock: 9.4, parLevel: 14, reorderLevel: 5, costPerUnit: 32, supplier: 'Fruits Premium · Casablanca', lastDelivery: '2026-05-14', deliveryFrequency: 'mardi-vendredi', usageThisWeek: 18.2, theoreticalUsage: 17.6, status: 'low' },
      // ── Épicerie sèche ──
      { id: 'inv18', name: 'Semoule fine', category: 'epicerie', unit: 'kg', currentStock: 32, parLevel: 40, reorderLevel: 15, costPerUnit: 12, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 18, theoreticalUsage: 18.4, status: 'ok' },
      { id: 'inv19', name: 'Riz long', category: 'epicerie', unit: 'kg', currentStock: 26, parLevel: 30, reorderLevel: 10, costPerUnit: 14, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 14, theoreticalUsage: 14.2, status: 'ok' },
      { id: 'inv20', name: "Huile d'olive extra vierge", category: 'epicerie', unit: 'L', currentStock: 18, parLevel: 24, reorderLevel: 8, costPerUnit: 78, supplier: 'Huileries Sefrioui · Meknès', lastDelivery: '2026-05-07', deliveryFrequency: 'bi-mensuel', usageThisWeek: 11.6, theoreticalUsage: 12.0, status: 'ok' },
      { id: 'inv21', name: 'Huile de tournesol', category: 'epicerie', unit: 'L', currentStock: 32, parLevel: 30, reorderLevel: 12, costPerUnit: 28, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 18.4, theoreticalUsage: 18.0, status: 'ok' },
      { id: 'inv22', name: 'Couscous fin', category: 'epicerie', unit: 'kg', currentStock: 14, parLevel: 20, reorderLevel: 8, costPerUnit: 18, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 12.2, theoreticalUsage: 12.4, status: 'low' },
      { id: 'inv23', name: 'Farine blé tendre', category: 'epicerie', unit: 'kg', currentStock: 48, parLevel: 50, reorderLevel: 20, costPerUnit: 8, supplier: 'Minoterie Lazaar · Casablanca', lastDelivery: '2026-05-09', deliveryFrequency: 'hebdomadaire', usageThisWeek: 32, theoreticalUsage: 31.6, status: 'ok' },
      { id: 'inv24', name: 'Sucre blanc', category: 'epicerie', unit: 'kg', currentStock: 26, parLevel: 30, reorderLevel: 10, costPerUnit: 9, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 14.8, theoreticalUsage: 14.4, status: 'ok' },
      // ── Épices ──
      { id: 'inv25', name: 'Cumin moulu', category: 'epices', unit: 'kg', currentStock: 1.8, parLevel: 2, reorderLevel: 0.8, costPerUnit: 142, supplier: 'Épices Bab Marrakech', lastDelivery: '2026-05-01', deliveryFrequency: 'mensuel', usageThisWeek: 0.42, theoreticalUsage: 0.40, status: 'ok' },
      { id: 'inv26', name: 'Paprika doux', category: 'epices', unit: 'kg', currentStock: 0.6, parLevel: 1.5, reorderLevel: 0.5, costPerUnit: 96, supplier: 'Épices Bab Marrakech', lastDelivery: '2026-05-01', deliveryFrequency: 'mensuel', usageThisWeek: 0.38, theoreticalUsage: 0.36, status: 'low' },
      { id: 'inv27', name: 'Ras el hanout', category: 'epices', unit: 'kg', currentStock: 1.2, parLevel: 1.5, reorderLevel: 0.5, costPerUnit: 218, supplier: 'Épices Bab Marrakech', lastDelivery: '2026-05-01', deliveryFrequency: 'mensuel', usageThisWeek: 0.32, theoreticalUsage: 0.30, status: 'ok' },
      { id: 'inv28', name: 'Safran', category: 'epices', unit: 'g', currentStock: 24, parLevel: 30, reorderLevel: 10, costPerUnit: 18, supplier: 'Coopérative Taliouine', lastDelivery: '2026-04-22', deliveryFrequency: 'mensuel', usageThisWeek: 4.2, theoreticalUsage: 4.0, status: 'ok' },
      // ── Produits laitiers ──
      { id: 'inv29', name: 'Lait entier', category: 'laitiers', unit: 'L', currentStock: 28, parLevel: 40, reorderLevel: 15, costPerUnit: 8, supplier: 'Centrale Danone · Casablanca', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 142, theoreticalUsage: 138, status: 'low' },
      { id: 'inv30', name: 'Yaourt nature', category: 'laitiers', unit: 'pot', currentStock: 38, parLevel: 50, reorderLevel: 20, costPerUnit: 3, supplier: 'Centrale Danone · Casablanca', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 86, theoreticalUsage: 84, status: 'ok' },
      { id: 'inv31', name: 'Fromage frais', category: 'laitiers', unit: 'kg', currentStock: 4.8, parLevel: 6, reorderLevel: 2, costPerUnit: 62, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-13', deliveryFrequency: 'lundi-jeudi', usageThisWeek: 5.4, theoreticalUsage: 5.2, status: 'ok' },
      { id: 'inv32', name: 'Beurre', category: 'laitiers', unit: 'kg', currentStock: 9.2, parLevel: 10, reorderLevel: 4, costPerUnit: 78, supplier: 'Centrale Danone · Casablanca', lastDelivery: '2026-05-12', deliveryFrequency: 'lundi-jeudi', usageThisWeek: 7.4, theoreticalUsage: 7.6, status: 'ok' },
      { id: 'inv33', name: 'Œufs', category: 'laitiers', unit: 'unité', currentStock: 142, parLevel: 240, reorderLevel: 80, costPerUnit: 1.4, supplier: 'Avicole Atlas · Bouskoura', lastDelivery: '2026-05-13', deliveryFrequency: 'lundi-jeudi', usageThisWeek: 386, theoreticalUsage: 392, status: 'low' },
      // ── Boissons ──
      { id: 'inv34', name: 'Coca-Cola 33cl', category: 'boissons', unit: 'bouteille', currentStock: 144, parLevel: 240, reorderLevel: 96, costPerUnit: 6, supplier: 'NABC · Casablanca', lastDelivery: '2026-05-12', deliveryFrequency: 'hebdomadaire', usageThisWeek: 486, theoreticalUsage: 478, status: 'low' },
      { id: 'inv35', name: 'Eau minérale 50cl', category: 'boissons', unit: 'bouteille', currentStock: 286, parLevel: 360, reorderLevel: 120, costPerUnit: 3, supplier: 'Sidi Ali · Distributeur', lastDelivery: '2026-05-13', deliveryFrequency: 'bi-hebdomadaire', usageThisWeek: 824, theoreticalUsage: 818, status: 'ok' },
      { id: 'inv36', name: 'Thé vert en vrac', category: 'boissons', unit: 'kg', currentStock: 4.2, parLevel: 5, reorderLevel: 2, costPerUnit: 168, supplier: 'Thé Asma · Tanger', lastDelivery: '2026-04-28', deliveryFrequency: 'mensuel', usageThisWeek: 0.84, theoreticalUsage: 0.86, status: 'ok' },
      // ── Produits finis / semi ──
      { id: 'inv37', name: 'Pâte à pastilla', category: 'epicerie', unit: 'paquet', currentStock: 24, parLevel: 30, reorderLevel: 10, costPerUnit: 18, supplier: 'Bakery El Ouafy · Maarif', lastDelivery: '2026-05-14', deliveryFrequency: 'lundi-mercredi-vendredi', usageThisWeek: 38, theoreticalUsage: 36, status: 'ok' },
      { id: 'inv38', name: 'Pain rond traditionnel', category: 'epicerie', unit: 'unité', currentStock: 38, parLevel: 80, reorderLevel: 30, costPerUnit: 2, supplier: 'Bakery El Ouafy · Maarif', lastDelivery: '2026-05-14', deliveryFrequency: 'tous-les-jours', usageThisWeek: 286, theoreticalUsage: 282, status: 'low' },
      // ── Consommables ──
      { id: 'inv39', name: 'Serviettes papier', category: 'consommables', unit: 'paquet', currentStock: 14, parLevel: 18, reorderLevel: 6, costPerUnit: 32, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 8, theoreticalUsage: 8, status: 'ok' },
      { id: 'inv40', name: 'Sacs poubelle 100L', category: 'consommables', unit: 'paquet', currentStock: 6, parLevel: 8, reorderLevel: 3, costPerUnit: 48, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'jeudi', usageThisWeek: 3, theoreticalUsage: 3, status: 'ok' },
    ],
    maisonMansour: [
      { id: 'inv-mm01', name: 'Caftans (stock)', category: 'produits', unit: 'unité', currentStock: 48, parLevel: 60, reorderLevel: 20, costPerUnit: 1200, supplier: 'Atelier Marrakech · Médina', lastDelivery: '2026-04-22', deliveryFrequency: 'mensuel', usageThisWeek: 8, theoreticalUsage: 8, status: 'ok' },
      { id: 'inv-mm02', name: 'Babouches cuir', category: 'produits', unit: 'paire', currentStock: 24, parLevel: 40, reorderLevel: 15, costPerUnit: 280, supplier: 'Tannerie Fès · Médina', lastDelivery: '2026-05-02', deliveryFrequency: 'bi-mensuel', usageThisWeek: 6, theoreticalUsage: 7, status: 'low' },
      { id: 'inv-mm03', name: 'Tapis berbères', category: 'produits', unit: 'unité', currentStock: 18, parLevel: 25, reorderLevel: 8, costPerUnit: 2400, supplier: 'Coopérative Anti-Atlas', lastDelivery: '2026-04-15', deliveryFrequency: 'mensuel', usageThisWeek: 2, theoreticalUsage: 2, status: 'ok' },
      { id: 'inv-mm04', name: 'Sachets cadeau', category: 'consommables', unit: 'unité', currentStock: 142, parLevel: 200, reorderLevel: 80, costPerUnit: 8, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'mensuel', usageThisWeek: 38, theoreticalUsage: 36, status: 'low' },
    ],
    spaBahia: [
      { id: 'inv-sp01', name: "Huile d'argan", category: 'produits-soin', unit: 'L', currentStock: 6.4, parLevel: 8, reorderLevel: 3, costPerUnit: 320, supplier: 'Coopérative Tiznit', lastDelivery: '2026-05-08', deliveryFrequency: 'bi-mensuel', usageThisWeek: 1.8, theoreticalUsage: 2.0, status: 'ok' },
      { id: 'inv-sp02', name: 'Savon noir traditionnel', category: 'produits-soin', unit: 'kg', currentStock: 12, parLevel: 15, reorderLevel: 5, costPerUnit: 95, supplier: 'Cosmétiques Médina · Fès', lastDelivery: '2026-05-08', deliveryFrequency: 'bi-mensuel', usageThisWeek: 3.4, theoreticalUsage: 3.2, status: 'ok' },
      { id: 'inv-sp03', name: 'Gants de gommage', category: 'consommables', unit: 'unité', currentStock: 18, parLevel: 40, reorderLevel: 15, costPerUnit: 12, supplier: 'Cosmétiques Médina · Fès', lastDelivery: '2026-05-08', deliveryFrequency: 'bi-mensuel', usageThisWeek: 24, theoreticalUsage: 22, status: 'low' },
      { id: 'inv-sp04', name: 'Serviettes éponge', category: 'consommables', unit: 'unité', currentStock: 84, parLevel: 100, reorderLevel: 40, costPerUnit: 38, supplier: 'Linge pro · Casablanca', lastDelivery: '2026-05-05', deliveryFrequency: 'bi-mensuel', usageThisWeek: 12, theoreticalUsage: 12, status: 'ok' },
      { id: 'inv-sp05', name: 'Bougies aromatiques', category: 'consommables', unit: 'unité', currentStock: 28, parLevel: 40, reorderLevel: 15, costPerUnit: 24, supplier: 'Métro Casablanca · Aïn Sebaâ', lastDelivery: '2026-05-10', deliveryFrequency: 'mensuel', usageThisWeek: 8, theoreticalUsage: 8, status: 'ok' },
      { id: 'inv-sp06', name: 'Henné poudre', category: 'produits-soin', unit: 'kg', currentStock: 0, parLevel: 2, reorderLevel: 0.5, costPerUnit: 140, supplier: 'Coopérative Tiznit', lastDelivery: '2026-04-28', deliveryFrequency: 'bi-mensuel', usageThisWeek: 0.4, theoreticalUsage: 0.42, status: 'out' },
    ],
  };

  /* ═══════════════ SUPPLIERS · deduplicated catalogue ═══════════════
   * Maps the supplier strings referenced in INVENTORY to richer profile data
   * (contact, schedule, monthly spend, last 30d price change). Used in the
   * Suppliers tab of the Stock page and in the Supplier Profile modal. */
  const SUPPLIERS = [
    { id: 'sup01', name: 'Boucherie Errazi', location: 'Maarif', category: 'viandes', contact: '+212 6 22 14 28 36', deliverySchedule: 'mardi · vendredi', avgInvoice: 3840, paymentTerms: 'Net 15', rating: 4.8, monthlySpend: 28400, priceChangeLast30d: 4.2 },
    { id: 'sup02', name: 'Volailles Atlas', location: 'Bouskoura', category: 'viandes', contact: '+212 6 14 82 47 19', deliverySchedule: 'lundi · jeudi', avgInvoice: 1280, paymentTerms: 'Net 30', rating: 4.6, monthlySpend: 10240, priceChangeLast30d: 0 },
    { id: 'sup03', name: 'Marché Central · Port', location: 'Casablanca', category: 'poissons', contact: '+212 6 38 19 47 02', deliverySchedule: 'tous les jours · 06h', avgInvoice: 820, paymentTerms: 'Comptant', rating: 4.4, monthlySpend: 16400, priceChangeLast30d: 8.4 },
    { id: 'sup04', name: 'Marché de gros · Inezgane', location: 'Casablanca', category: 'legumes', contact: '+212 6 47 82 91 14', deliverySchedule: 'tous les jours · 05h30', avgInvoice: 1840, paymentTerms: 'Comptant', rating: 4.5, monthlySpend: 36800, priceChangeLast30d: -2.1 },
    { id: 'sup05', name: 'Fruits Premium', location: 'Casablanca', category: 'legumes', contact: '+212 6 19 27 84 51', deliverySchedule: 'mardi · vendredi', avgInvoice: 1240, paymentTerms: 'Net 15', rating: 4.7, monthlySpend: 4960, priceChangeLast30d: 6.8 },
    { id: 'sup06', name: 'Métro Casablanca', location: 'Aïn Sebaâ', category: 'epicerie', contact: '+212 5 22 67 84 00', deliverySchedule: 'jeudi · 14h', avgInvoice: 4620, paymentTerms: 'Net 30', rating: 4.9, monthlySpend: 18480, priceChangeLast30d: 1.4 },
    { id: 'sup07', name: 'Huileries Sefrioui', location: 'Meknès', category: 'epicerie', contact: '+212 5 35 52 18 47', deliverySchedule: 'bi-mensuel', avgInvoice: 1680, paymentTerms: 'Net 30', rating: 4.8, monthlySpend: 3360, priceChangeLast30d: 0 },
    { id: 'sup08', name: 'Minoterie Lazaar', location: 'Casablanca', category: 'epicerie', contact: '+212 5 22 30 14 28', deliverySchedule: 'hebdomadaire', avgInvoice: 480, paymentTerms: 'Net 15', rating: 4.6, monthlySpend: 1920, priceChangeLast30d: 0 },
    { id: 'sup09', name: 'Épices Bab Marrakech', location: 'Marrakech', category: 'epices', contact: '+212 6 24 81 47 92', deliverySchedule: 'mensuel', avgInvoice: 1840, paymentTerms: 'Net 30', rating: 4.9, monthlySpend: 1840, priceChangeLast30d: 0 },
    { id: 'sup10', name: 'Coopérative Taliouine', location: 'Taliouine', category: 'epices', contact: '+212 5 28 53 49 18', deliverySchedule: 'mensuel', avgInvoice: 432, paymentTerms: 'Comptant', rating: 5.0, monthlySpend: 432, priceChangeLast30d: 12.4 },
    { id: 'sup11', name: 'Centrale Danone', location: 'Casablanca', category: 'laitiers', contact: '+212 5 22 87 14 00', deliverySchedule: 'tous les jours · 07h', avgInvoice: 1240, paymentTerms: 'Net 30', rating: 4.7, monthlySpend: 24800, priceChangeLast30d: 2.8 },
    { id: 'sup12', name: 'Avicole Atlas', location: 'Bouskoura', category: 'laitiers', contact: '+212 6 28 47 19 84', deliverySchedule: 'lundi · jeudi', avgInvoice: 480, paymentTerms: 'Net 15', rating: 4.5, monthlySpend: 3840, priceChangeLast30d: 5.4 },
    { id: 'sup13', name: 'NABC', location: 'Casablanca', category: 'boissons', contact: '+212 5 22 14 80 47', deliverySchedule: 'hebdomadaire', avgInvoice: 2160, paymentTerms: 'Net 30', rating: 4.6, monthlySpend: 8640, priceChangeLast30d: 0 },
    { id: 'sup14', name: 'Sidi Ali · Distributeur', location: 'Oulmès', category: 'boissons', contact: '+212 5 37 84 19 28', deliverySchedule: 'bi-hebdomadaire', avgInvoice: 1080, paymentTerms: 'Net 30', rating: 4.7, monthlySpend: 8640, priceChangeLast30d: 0 },
    { id: 'sup15', name: 'Thé Asma', location: 'Tanger', category: 'boissons', contact: '+212 6 39 47 28 14', deliverySchedule: 'mensuel', avgInvoice: 680, paymentTerms: 'Comptant', rating: 4.8, monthlySpend: 680, priceChangeLast30d: 0 },
    { id: 'sup16', name: 'Bakery El Ouafy', location: 'Maarif', category: 'epicerie', contact: '+212 6 18 27 84 91', deliverySchedule: 'lundi · mercredi · vendredi', avgInvoice: 320, paymentTerms: 'Comptant', rating: 4.9, monthlySpend: 3840, priceChangeLast30d: 0 },
  ];

  /* ═══════════════════════════════════════════════════════════════════════
   *  PLACEHOLDER_COSTS — ingredients referenced in recipes that don't yet
   *  exist in INVENTORY. Cost / unit used by the variance engine when an
   *  ingredient ID doesn't resolve to an inv## entry. Owner can promote
   *  any placeholder to a real inventory entry from Stock in Phase 2.
   * ═══════════════════════════════════════════════════════════════════════ */
  const PLACEHOLDER_COSTS = {
    'placeholder-coffee':  { name: 'Café en grains', unit: 'kg', costPerUnit: 180 },
    'placeholder-nutella': { name: 'Nutella',        unit: 'kg', costPerUnit: 190 },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *  RECIPES — recipe cards bound to MENU items by ID.
   *
   *  Demo contract: pre-populated entries below load fresh on every page
   *  reload. Edits during a session live in RECIPES_SESSION (declared
   *  below). All variance calculations derive from RECIPES_SESSION at
   *  runtime — never from RECIPES directly.
   *
   *  Schema:
   *    { yield: <portions>,
   *      ingredients: [{ invId, qty, unit }],
   *      status: 'complete' | 'incomplete',
   *      notes: string,
   *      lastUpdated: 'YYYY-MM-DD' | null,
   *      updatedBy: '<Staff name>' | null }
   *
   *  Pre-populated recipes (13 total):
   *    cafeAtlas (10): ca-t01 ca-t02 ca-t03 ca-c01 ca-p01 ca-s01
   *                    ca-b01 ca-b02 ca-b04 ca-d01
   *    spaBahia  (3) : sp-s01 sp-s02 sp-s04
   *    maisonMansour (3): mm-b01 mm-b02 mm-b03
   *  Remaining items pre-populate as stubs with status 'incomplete'.
   * ═══════════════════════════════════════════════════════════════════════ */
  const RECIPES = {
    /* ─── CAFÉ ATLAS · 10 pre-populated, 28 stubbed ─── */
    'ca-t01': {
      yield: 1,
      ingredients: [
        { invId: 'inv01', qty: 0.180, unit: 'kg' },   // viande hachée bœuf
        { invId: 'inv08', qty: 0.150, unit: 'kg' },   // tomates fraîches
        { invId: 'inv09', qty: 0.080, unit: 'kg' },   // oignons
        { invId: 'inv33', qty: 1,     unit: 'unité' },// œuf
        { invId: 'inv20', qty: 0.030, unit: 'L' },    // huile d'olive
        { invId: 'inv13', qty: 0.5,   unit: 'botte' },// coriandre
        { invId: 'inv14', qty: 0.5,   unit: 'botte' },// persil
        { invId: 'inv25', qty: 0.003, unit: 'kg' },   // cumin
        { invId: 'inv26', qty: 0.003, unit: 'kg' },   // paprika
      ],
      status: 'complete', notes: 'Servir bien chaud avec pain rond.',
      lastUpdated: '2026-05-12', updatedBy: 'Mohammed Karimi',
    },
    'ca-t02': {
      yield: 1,
      ingredients: [
        { invId: 'inv02', qty: 0.250, unit: 'kg' },   // poulet entier
        { invId: 'inv16', qty: 0.080, unit: 'kg' },   // citrons (confits)
        { invId: 'inv09', qty: 0.080, unit: 'kg' },   // oignons
        { invId: 'inv20', qty: 0.030, unit: 'L' },    // huile d'olive
        { invId: 'inv13', qty: 0.5,   unit: 'botte' },// coriandre
        { invId: 'inv14', qty: 0.5,   unit: 'botte' },// persil
        { invId: 'inv27', qty: 0.004, unit: 'kg' },   // ras el hanout
        { invId: 'inv28', qty: 0.020, unit: 'g' },    // safran (pincée)
      ],
      status: 'complete', notes: 'Marinade poulet 30min avant cuisson.',
      lastUpdated: '2026-05-12', updatedBy: 'Mohammed Karimi',
    },
    'ca-t03': {
      yield: 1,
      ingredients: [
        { invId: 'inv03', qty: 0.220, unit: 'kg' },   // agneau épaule
        { invId: 'inv09', qty: 0.080, unit: 'kg' },   // oignons
        { invId: 'inv20', qty: 0.030, unit: 'L' },    // huile d'olive
        { invId: 'inv24', qty: 0.020, unit: 'kg' },   // sucre (pruneaux)
        { invId: 'inv27', qty: 0.005, unit: 'kg' },   // ras el hanout
        { invId: 'inv28', qty: 0.030, unit: 'g' },    // safran
        { invId: 'inv32', qty: 0.020, unit: 'kg' },   // beurre
      ],
      status: 'complete', notes: 'Cuisson lente 2h. Pruneaux ajoutés en fin.',
      lastUpdated: '2026-05-10', updatedBy: 'Mohammed Karimi',
    },
    'ca-c01': {
      yield: 1,
      ingredients: [
        { invId: 'inv22', qty: 0.180, unit: 'kg' },   // couscous fin
        { invId: 'inv02', qty: 0.150, unit: 'kg' },   // poulet
        { invId: 'inv03', qty: 0.100, unit: 'kg' },   // agneau
        { invId: 'inv04', qty: 0.080, unit: 'kg' },   // merguez
        { invId: 'inv11', qty: 0.080, unit: 'kg' },   // courgettes
        { invId: 'inv12', qty: 0.080, unit: 'kg' },   // carottes
        { invId: 'inv10', qty: 0.060, unit: 'kg' },   // pommes de terre
        { invId: 'inv09', qty: 0.060, unit: 'kg' },   // oignons
        { invId: 'inv20', qty: 0.030, unit: 'L' },    // huile d'olive
        { invId: 'inv25', qty: 0.003, unit: 'kg' },   // cumin
        { invId: 'inv27', qty: 0.004, unit: 'kg' },   // ras el hanout
      ],
      status: 'complete', notes: 'Vapeur 45min minimum.',
      lastUpdated: '2026-05-08', updatedBy: 'Fatima Zahra Idrissi',
    },
    'ca-p01': {
      yield: 1,
      ingredients: [
        { invId: 'inv37', qty: 2,     unit: 'paquet' }, // pâte à pastilla (feuilles)
        { invId: 'inv02', qty: 0.200, unit: 'kg' },   // poulet
        { invId: 'inv33', qty: 2,     unit: 'unité' },// œufs
        { invId: 'inv09', qty: 0.080, unit: 'kg' },   // oignons
        { invId: 'inv24', qty: 0.020, unit: 'kg' },   // sucre glace
        { invId: 'inv32', qty: 0.030, unit: 'kg' },   // beurre
        { invId: 'inv28', qty: 0.020, unit: 'g' },    // safran
      ],
      status: 'complete', notes: 'Saupoudrer sucre glace + cannelle au service.',
      lastUpdated: '2026-05-09', updatedBy: 'Fatima Zahra Idrissi',
    },
    'ca-s01': {
      yield: 1,
      ingredients: [
        { invId: 'inv38', qty: 1,     unit: 'unité' },// pain rond
        { invId: 'inv01', qty: 0.120, unit: 'kg' },   // viande hachée
        { invId: 'inv08', qty: 0.060, unit: 'kg' },   // tomates
        { invId: 'inv09', qty: 0.040, unit: 'kg' },   // oignons
        { invId: 'inv25', qty: 0.002, unit: 'kg' },   // cumin
        { invId: 'inv26', qty: 0.002, unit: 'kg' },   // paprika
      ],
      status: 'complete', notes: 'Servir avec frites ou salade.',
      lastUpdated: '2026-05-13', updatedBy: 'Youssef Bennani',
    },
    'ca-b01': {
      yield: 1,
      ingredients: [
        { invId: 'inv36', qty: 0.005, unit: 'kg' },   // thé vert vrac
        { invId: 'inv15', qty: 0.25,  unit: 'botte' },// menthe fraîche
        { invId: 'inv24', qty: 0.015, unit: 'kg' },   // sucre
      ],
      status: 'complete', notes: 'Thé infusé 3-5min. Trois services par théière.',
      lastUpdated: '2026-05-14', updatedBy: 'Hamid Jelloul',
    },
    'ca-b02': {
      yield: 1,
      ingredients: [
        { invId: 'placeholder-coffee', qty: 0.012, unit: 'kg' }, // café en grains
      ],
      status: 'complete', notes: 'Espresso double 30ml.',
      lastUpdated: '2026-05-14', updatedBy: 'Hamid Jelloul',
    },
    'ca-b04': {
      yield: 1,
      ingredients: [
        { invId: 'inv17', qty: 0.150, unit: 'kg' },   // avocats
        { invId: 'inv29', qty: 0.200, unit: 'L' },    // lait
        { invId: 'inv24', qty: 0.025, unit: 'kg' },   // sucre
      ],
      status: 'complete', notes: 'Mixer avocat mûr + lait + sucre. Servir frais.',
      lastUpdated: '2026-05-11', updatedBy: 'Youssef Bennani',
    },
    'ca-d01': {
      yield: 1,
      ingredients: [
        { invId: 'inv23', qty: 0.060, unit: 'kg' },   // farine
        { invId: 'inv29', qty: 0.150, unit: 'L' },    // lait
        { invId: 'inv33', qty: 1,     unit: 'unité' },// œuf
        { invId: 'inv32', qty: 0.010, unit: 'kg' },   // beurre
        { invId: 'placeholder-nutella', qty: 0.040, unit: 'kg' }, // nutella
      ],
      status: 'complete', notes: 'Crêpe française fine, garniture chaude.',
      lastUpdated: '2026-05-13', updatedBy: 'Rachid Alami',
    },
    /* ── Stubs (28 cafeAtlas items) ── */
    'ca-e01': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-e02': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-e03': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-e04': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-e05': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-e06': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-t04': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-t05': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-c02': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-c03': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-p02': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-p03': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-s02': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-s03': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-s04': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-s05': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-s06': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-s07': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-s08': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-b03': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-b05': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-b06': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-b07': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-b08': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-d02': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-d03': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-d04': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'ca-d05': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },

    /* ─── SPA BAHIA · 3 pre-populated (consumables), 3 stubs ─── */
    'sp-s01': {
      yield: 1,
      ingredients: [
        { invId: 'inv-sp02', qty: 0.050, unit: 'kg' },   // savon noir
        { invId: 'inv-sp03', qty: 0.5,   unit: 'unité' },// gant gommage (réutilisable, demi-vie)
        { invId: 'inv-sp04', qty: 2,     unit: 'unité' },// serviettes éponge
      ],
      status: 'complete', notes: 'Gommage savon noir + rinçage + serviettes propres.',
      lastUpdated: '2026-05-10', updatedBy: 'Karima Idrissi',
    },
    'sp-s02': {
      yield: 1,
      ingredients: [
        { invId: 'inv-sp01', qty: 0.030, unit: 'L' },    // huile d'argan
        { invId: 'inv-sp04', qty: 1,     unit: 'unité' },// serviette éponge
        { invId: 'inv-sp05', qty: 1,     unit: 'unité' },// bougie aromatique
      ],
      status: 'complete', notes: 'Modelage corps entier · huile tiède.',
      lastUpdated: '2026-05-10', updatedBy: 'Nour El Hassan',
    },
    'sp-s04': {
      yield: 1,
      ingredients: [
        { invId: 'inv-sp01', qty: 0.050, unit: 'L' },    // huile d'argan
        { invId: 'inv-sp02', qty: 0.025, unit: 'kg' },   // savon noir
        { invId: 'inv-sp04', qty: 2,     unit: 'unité' },// serviettes éponge
        { invId: 'inv-sp05', qty: 1,     unit: 'unité' },// bougie aromatique
      ],
      status: 'complete', notes: 'Rituel argan 90min · hammam + gommage + modelage.',
      lastUpdated: '2026-05-09', updatedBy: 'Karima Idrissi',
    },
    'sp-s03': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'sp-s05': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },
    'sp-s06': { yield: 1, ingredients: [], status: 'incomplete', notes: '', lastUpdated: null, updatedBy: null },

    /* ─── MAISON MANSOUR · 3 pre-populated (boissons d'accueil) ─── */
    'mm-b01': {
      yield: 1,
      ingredients: [
        { invId: 'inv36', qty: 0.005, unit: 'kg' },   // thé vert vrac (partagé inv catalog)
        { invId: 'inv15', qty: 0.20,  unit: 'botte' },// menthe
        { invId: 'inv24', qty: 0.012, unit: 'kg' },   // sucre
      ],
      status: 'complete', notes: 'Boisson d\'accueil clients · service en argenterie.',
      lastUpdated: '2026-05-12', updatedBy: 'Aicha Benali',
    },
    'mm-b02': {
      yield: 1,
      ingredients: [
        { invId: 'placeholder-coffee', qty: 0.010, unit: 'kg' },
      ],
      status: 'complete', notes: 'Espresso simple offert clients VIP.',
      lastUpdated: '2026-05-12', updatedBy: 'Aicha Benali',
    },
    'mm-b03': {
      yield: 1,
      ingredients: [
        // Eau minérale 33cl — produit fini, achat direct
      ],
      status: 'complete', notes: 'Bouteille 33cl offerte essayage cabine.',
      lastUpdated: '2026-05-12', updatedBy: 'Aicha Benali',
    },
  };

  /* RECIPES_SESSION — mutable working copy. Variance + UI read from here.
   * Re-derived from RECIPES on every page reload (correct demo behavior). */
  let RECIPES_SESSION = JSON.parse(JSON.stringify(RECIPES));

  /* ═══════════════════════════════════════════════════════════════════════
   *  STAFF_DISH_RESPONSIBILITY — which staff member is accountable for which
   *  menu items. Powers variancePerStaffMember() for the Phase 2 staff coach.
   *  Verified against MENU.cafeAtlas / spaBahia / maisonMansour at write
   *  time — every ID listed below exists in the corresponding MENU array.
   * ═══════════════════════════════════════════════════════════════════════ */
  const STAFF_DISH_RESPONSIBILITY = {
    'ca01': ['ca-t01','ca-t02','ca-t03','ca-c01','ca-p01','ca-p02','ca-p03'],
    'ca02': ['ca-t01','ca-t02','ca-s01','ca-s02','ca-s03'],
    'ca03': ['ca-c01','ca-c02','ca-c03','ca-p01','ca-p02','ca-p03'],
    'ca04': ['ca-e01','ca-e04','ca-e05'],
    'ca05': ['ca-d01','ca-d02','ca-d03'],
    'ca06': ['ca-e02','ca-e03','ca-e06'],
    'sp01': ['sp-s01','sp-s04'],
    'sp02': ['sp-s02','sp-s03'],
    'mm01': ['mm-b01','mm-b02','mm-b03'],
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *  KiwiRecipes — variance + cost engine.
   *
   *  Pure functions: no DOM, no side effects. Every read goes through
   *  RECIPES_SESSION + MENU + INVENTORY + STAFF at runtime, so updates to
   *  the session state propagate without re-renders being needed in the
   *  data layer.
   *
   *  Severity bands:
   *    |Δ%| ≤ 5   → 'normal'
   *    |Δ%| ≤ 15  → 'warning'
   *    |Δ%| > 15  → 'critical'
   *
   *  Monthly window: we treat INVENTORY usageThisWeek × 4.33 as the
   *  monthly actual usage (EQ_MONTH_WEEKS is reused implicitly: 4.33).
   *  Theoretical comes from RECIPES_SESSION × MENU.unitsThisMonth.
   * ═══════════════════════════════════════════════════════════════════════ */

  /* Find which venue an inventory ID belongs to. */
  function recFindInventoryItem(invId) {
    for (const v of REAL_VENUES) {
      const arr = INVENTORY[v] || [];
      const hit = arr.find(i => i.id === invId);
      if (hit) return { item: hit, venue: v };
    }
    return null;
  }
  /* Resolve cost / unit / name for any ingredient reference (inv## or
   * placeholder-*). Returns null if the reference is unknown. */
  function recResolveIngredient(invId) {
    if (PLACEHOLDER_COSTS[invId]) return { id: invId, name: PLACEHOLDER_COSTS[invId].name, unit: PLACEHOLDER_COSTS[invId].unit, costPerUnit: PLACEHOLDER_COSTS[invId].costPerUnit, isPlaceholder: true };
    const found = recFindInventoryItem(invId);
    if (!found) return null;
    const { item } = found;
    return { id: invId, name: item.name, unit: item.unit, costPerUnit: item.costPerUnit, isPlaceholder: false };
  }
  /* Cost of one portion (yield-adjusted) for a single recipe. */
  function recPortionCost(recipe) {
    if (!recipe || !recipe.ingredients || !recipe.ingredients.length) return 0;
    const y = Math.max(1, recipe.yield || 1);
    let total = 0;
    for (const ing of recipe.ingredients) {
      const ref = recResolveIngredient(ing.invId);
      if (!ref) continue;
      total += (ing.qty || 0) * ref.costPerUnit;
    }
    return total / y;
  }
  /* Find the MENU item for an id across all real venues. */
  function recFindMenuItem(itemId) {
    for (const v of REAL_VENUES) {
      const it = (MENU[v] || []).find(x => x.id === itemId);
      if (it) return { item: it, venue: v };
    }
    return null;
  }

  /* ─── Public-facing engine ─────────────────────────────────────────── */

  function recGetRecipe(itemId) {
    return RECIPES_SESSION[itemId] || null;
  }
  function recSetRecipe(itemId, recipe) {
    if (!itemId || !recipe) return;
    RECIPES_SESSION[itemId] = recipe;
  }
  function recListRecipes(venueKey) {
    const items = MENU[venueKey] || [];
    return items.map(it => ({ menuItem: it, recipe: RECIPES_SESSION[it.id] || null }));
  }

  function recRecipeStats(venueKey) {
    const items = MENU[venueKey] || [];
    let complete = 0;
    let totalFcSum = 0; let totalFcCount = 0;
    let totalVarSum = 0; let totalVarCount = 0;
    for (const it of items) {
      const r = RECIPES_SESSION[it.id];
      if (!r) continue;
      if (r.status === 'complete') {
        complete++;
        const cost = recPortionCost(r);
        if (it.price > 0) { totalFcSum += (cost / it.price) * 100; totalFcCount++; }
        const v = recVarianceByRecipe(it.id);
        if (v && Number.isFinite(v.totalCostImpact) && it.unitsThisMonth > 0 && cost > 0) {
          // Express variance as % of monthly recipe cost
          const monthlyRecipeCost = cost * it.unitsThisMonth;
          if (monthlyRecipeCost > 0) {
            totalVarSum += (v.totalCostImpact / monthlyRecipeCost) * 100;
            totalVarCount++;
          }
        }
      }
    }
    const total = items.length;
    const incomplete = total - complete;
    return {
      total,
      complete,
      incomplete,
      completionPct: total > 0 ? Math.round((complete / total) * 100) : 0,
      avgFoodCostPct: totalFcCount > 0 ? +(totalFcSum / totalFcCount).toFixed(1) : 0,
      avgVariancePct: totalVarCount > 0 ? +(totalVarSum / totalVarCount).toFixed(1) : 0,
    };
  }

  function recTheoreticalConsumption(invItemId, venueKey) {
    const items = MENU[venueKey] || [];
    let qty = 0;
    for (const it of items) {
      const r = RECIPES_SESSION[it.id];
      if (!r || r.status !== 'complete') continue;
      const y = Math.max(1, r.yield || 1);
      const ing = (r.ingredients || []).find(x => x.invId === invItemId);
      if (!ing) continue;
      qty += (ing.qty / y) * (it.unitsThisMonth || 0);
    }
    const ref = recResolveIngredient(invItemId);
    const unit = ref ? ref.unit : '';
    const costMAD = ref ? qty * ref.costPerUnit : 0;
    return { qty: +qty.toFixed(3), costMAD: +costMAD.toFixed(2), unit };
  }

  function recActualConsumption(invItemId, venueKey) {
    const arr = INVENTORY[venueKey] || [];
    const item = arr.find(i => i.id === invItemId);
    if (!item) {
      const ph = PLACEHOLDER_COSTS[invItemId];
      // Placeholders have no measured actual — fall back to theoretical scaled
      // by a small noise factor so the variance pip isn't misleadingly zero.
      const th = recTheoreticalConsumption(invItemId, venueKey);
      return { qty: +(th.qty * 1.04).toFixed(3), costMAD: +(th.costMAD * 1.04).toFixed(2), unit: ph ? ph.unit : '' };
    }
    // INVENTORY exposes usageThisWeek + theoreticalUsage — scale weekly to
    // monthly via EQ_MONTH_WEEKS (4.33). Actual = usageThisWeek × 4.33.
    const monthly = (item.usageThisWeek || 0) * EQ_MONTH_WEEKS;
    return { qty: +monthly.toFixed(3), costMAD: +(monthly * item.costPerUnit).toFixed(2), unit: item.unit };
  }

  function recComputeVariance(invItemId, venueKey) {
    const theoretical = recTheoreticalConsumption(invItemId, venueKey);
    const actual      = recActualConsumption(invItemId, venueKey);
    const deltaAbs    = actual.qty - theoretical.qty;
    const deltaPct    = theoretical.qty > 0 ? (deltaAbs / theoretical.qty) * 100 : 0;
    const ref         = recResolveIngredient(invItemId);
    const costImpact  = ref ? deltaAbs * ref.costPerUnit : 0;
    const mag         = Math.abs(deltaPct);
    const severity    = mag > 15 ? 'critical' : (mag > 5 ? 'warning' : 'normal');
    return {
      theoretical,
      actual,
      deltaAbsolute: +deltaAbs.toFixed(3),
      deltaPct: +deltaPct.toFixed(1),
      costImpact: +costImpact.toFixed(2),
      severity,
    };
  }

  function recVarianceByRecipe(menuItemId) {
    const found = recFindMenuItem(menuItemId);
    if (!found) return null;
    const { item, venue } = found;
    const recipe = RECIPES_SESSION[menuItemId];
    if (!recipe || recipe.status !== 'complete' || !recipe.ingredients.length) return null;

    const y = Math.max(1, recipe.yield || 1);
    const units = item.unitsThisMonth || 0;

    const ingredients = [];
    let totalTheoreticalCost = 0;
    let totalActualCost = 0;
    let totalCostImpact = 0;

    for (const ing of recipe.ingredients) {
      const ref = recResolveIngredient(ing.invId);
      if (!ref) continue;
      const perPortion = ing.qty / y;
      const monthlyTheoretical = perPortion * units;
      const theoreticalCost = monthlyTheoretical * ref.costPerUnit;
      // For inventory items we have actuals; for placeholders we infer +4%
      let monthlyActual = monthlyTheoretical * 1.04;
      const inv = recFindInventoryItem(ing.invId);
      if (inv) {
        // Pro-rata: how much of this ingredient's monthly actual usage is
        // attributable to this specific dish (by theoretical share)?
        const totalTheoreticalForInv = recTheoreticalConsumption(ing.invId, venue).qty;
        const actualForInv = recActualConsumption(ing.invId, venue).qty;
        if (totalTheoreticalForInv > 0) {
          monthlyActual = (monthlyTheoretical / totalTheoreticalForInv) * actualForInv;
        }
      }
      const actualCost = monthlyActual * ref.costPerUnit;
      const deltaPct = monthlyTheoretical > 0 ? ((monthlyActual - monthlyTheoretical) / monthlyTheoretical) * 100 : 0;
      const impact = actualCost - theoreticalCost;

      ingredients.push({
        invId: ing.invId,
        name: ref.name,
        unit: ref.unit,
        perPortion: +perPortion.toFixed(4),
        theoretical: +monthlyTheoretical.toFixed(3),
        actual: +monthlyActual.toFixed(3),
        theoreticalCost: +theoreticalCost.toFixed(2),
        actualCost: +actualCost.toFixed(2),
        costPerUnit: ref.costPerUnit,
        deltaPct: +deltaPct.toFixed(1),
        costImpact: +impact.toFixed(2),
        isPlaceholder: ref.isPlaceholder === true,
      });
      totalTheoreticalCost += theoreticalCost;
      totalActualCost      += actualCost;
      totalCostImpact      += impact;
    }
    const monthlyRevenue = (item.price || 0) * units;
    const theoreticalFoodCostPct = monthlyRevenue > 0 ? (totalTheoreticalCost / monthlyRevenue) * 100 : 0;
    const actualFoodCostPct      = monthlyRevenue > 0 ? (totalActualCost / monthlyRevenue) * 100 : 0;
    const portionCost            = recPortionCost(recipe);

    return {
      menuItemId,
      menuItemName: item.name,
      venue,
      yield: y,
      portionCost: +portionCost.toFixed(2),
      ingredients,
      totalTheoreticalCost: +totalTheoreticalCost.toFixed(2),
      totalActualCost: +totalActualCost.toFixed(2),
      totalCostImpact: +totalCostImpact.toFixed(2),
      theoreticalFoodCostPct: +theoreticalFoodCostPct.toFixed(1),
      actualFoodCostPct: +actualFoodCostPct.toFixed(1),
    };
  }

  function recVarianceByCategory(categoryKey, venueKey) {
    const items = (MENU[venueKey] || []).filter(it => it.category === categoryKey);
    let totalImpact = 0; let varianceSum = 0; let varianceCount = 0;
    for (const it of items) {
      const v = recVarianceByRecipe(it.id);
      if (!v) continue;
      totalImpact += v.totalCostImpact;
      if (v.theoreticalFoodCostPct > 0) {
        const pct = ((v.actualFoodCostPct - v.theoreticalFoodCostPct) / v.theoreticalFoodCostPct) * 100;
        varianceSum += pct; varianceCount++;
      }
    }
    return {
      category: categoryKey,
      venue: venueKey,
      totalCostImpact: +totalImpact.toFixed(2),
      avgVariancePct: varianceCount > 0 ? +(varianceSum / varianceCount).toFixed(1) : 0,
    };
  }

  function recVariancePerStaffMember(staffId) {
    const ids = STAFF_DISH_RESPONSIBILITY[staffId] || [];
    let staffEntry = null;
    for (const v of REAL_VENUES) {
      const hit = (STAFF[v] || []).find(s => s.id === staffId);
      if (hit) { staffEntry = hit; break; }
    }
    const dishes = [];
    let varSum = 0; let varCount = 0; let totalImpact = 0;
    for (const dishId of ids) {
      const v = recVarianceByRecipe(dishId);
      if (!v) {
        // Surface incomplete dishes so the UI can prompt the staffer.
        const found = recFindMenuItem(dishId);
        if (found) dishes.push({ menuItemId: dishId, name: found.item.name, variancePct: null, costImpact: 0, status: 'incomplete' });
        continue;
      }
      const pct = v.theoreticalFoodCostPct > 0
        ? ((v.actualFoodCostPct - v.theoreticalFoodCostPct) / v.theoreticalFoodCostPct) * 100
        : 0;
      dishes.push({ menuItemId: dishId, name: v.menuItemName, variancePct: +pct.toFixed(1), costImpact: v.totalCostImpact, status: 'complete' });
      varSum += pct; varCount++; totalImpact += v.totalCostImpact;
    }
    return {
      staffId,
      staffName: staffEntry ? staffEntry.name : null,
      avgVariancePct: varCount > 0 ? +(varSum / varCount).toFixed(1) : 0,
      totalCostImpact: +totalImpact.toFixed(2),
      dishes,
    };
  }

  /* Expose the engine on window. Stable function names; the Phase 2 editor
   * and the Stock variance panel both consume this surface. */
  window.KiwiRecipes = {
    getRecipe:               recGetRecipe,
    setRecipe:               recSetRecipe,
    listRecipes:             recListRecipes,
    recipeStats:             recRecipeStats,
    theoreticalConsumption:  recTheoreticalConsumption,
    actualConsumption:       recActualConsumption,
    computeVariance:         recComputeVariance,
    varianceByRecipe:        recVarianceByRecipe,
    varianceByCategory:      recVarianceByCategory,
    variancePerStaffMember:  recVariancePerStaffMember,
    /* Constants / helpers — exposed for the Recettes tab + Stock page. */
    resolveIngredient:       recResolveIngredient,
    portionCost:             recPortionCost,
    PLACEHOLDER_COSTS,
  };

  /* ═══════════════ PUBLIC API ═══════════════ */

  window.KiwiVenue = {
    /* Menu: the restaurant workspace for the restaurant family, the
     * activity's own catalogue otherwise (see MENU · ROUTING). */
    showMenu,
    refreshMenu: () => {
      if (!document.body.classList.contains('page-menu') || !menuOwnedByWorkspace()) return;
      menuWorkspace()?.render?.();
    },
    getVenue,
    setVenue,
    /* Demo fixtures keep their Ultra showcase. Real stores use the plan D1
     * returned through KiwiConfig; an unresolved/offline config is not Ultra. */
    getPlan: () => isRealMerchant() ? (window.KiwiConfig?.plan || '') : currentPlan,
    subscribe,
    getVenueData,
    getCurrentVenueData,
    getVenueType,
    /* The activity label to DISPLAY, in the language showing right now.
     * Never read venue.typeLabel — older records carry a stale French string
     * (and two wizards used to store the raw {fr,en,ar} object). */
    getTypeLabel: id => typeLabelOf(VENUES[id || currentVenue]),
    applyServerType,
    applyScopedVenue,
    /* L'inverse : le serveur a refusé la portée demandée dans l'adresse, on
       rend au commerçant son propre magasin plutôt qu'un écran vide. */
    cancelScope,
    adoptServerStores,
    getKpiSpec: type => {
      /* Subtype profile first: a custom venue's KPI band speaks its trade's
       * language (labels resolve per-language; dateRange re-renders the band
       * on kiwi:langchange so they stay current). */
      const v = VENUES[currentVenue];
      if (v && v.id === 'own' && !v.type && !v.subtype) return [];
      const prof = v && v.custom && v.subtype && SUBTYPE_PROFILES[v.subtype];
      if (prof && prof.kpis) return prof.kpis.map(k => ({ key: k.key, label: pickL(k.label) }));
      return KPI_BY_TYPE[type] || KPI_BY_TYPE.restaurant;
    },
    getSubtypeProfile: sid => SUBTYPE_PROFILES[sid] || null,
    getVocab,
    /* Stock & approvisionnement page data — see assets/stock.js */
    getInventory: id => (isRealMerchant() && !isCustom(id || currentVenue)) ? [] : (INVENTORY[id || currentVenue] || []),
    getSuppliers: () => (isCustom(currentVenue) || isRealMerchant()) ? [] : SUPPLIERS,
    /* Kitchen station state — used by the KDS to compute fire schedules
     * so multi-station tickets finish together (avgPrepMin + sync flag,
     * from the demo station table in the MENU data layer above). */
    getStationState: (s) => miStationState(s),
    getStations: (id) => miGetStations(id || currentVenue),
    getHeroAiRec: id => {
      const v = id || currentVenue;
      if (isCustom(v)) {
        /* This panel used to return "Aucune donnée pour l'instant" unconditionally
         * — it sat in the same viewport as a live 450 MAD / 1 commande hero and
         * flatly contradicted it. A merchant who is told their own sales do not
         * exist stops trusting every other number on the page. So: once there ARE
         * sales, read them and say something true; only a genuinely empty store
         * gets the welcome copy. */
        const real = window.KiwiDateRange?.insights?.hero?.();
        if (real) return real;
        const W = {
          /* This used to promise margins. It cannot: a margin needs the cost of
           * what was sold, and a till only ever knows the price. Recording
           * sales gets the merchant their hours, their best sellers and their
           * average basket — real, immediately, from the first ticket. Margin
           * arrives when they enter their costs, and the copy now says which
           * is which instead of promising the second to sell the first. */
          fr: { title: 'Votre tableau de bord est prêt', obs: "Aucune donnée pour l'instant. Dès votre première vente, Kiwi lit vos heures fortes, vos articles qui partent et votre panier moyen. Pour vos marges, il faudra aussi renseigner vos coûts, une vente seule ne les dit pas.", act: '→ Enregistrez votre première vente pour démarrer.' },
          en: { title: 'Your dashboard is ready', obs: 'No data yet. From your first sale, Kiwi reads your peak hours, what is selling and your average basket. Margins need your costs on top, a sale alone does not carry them.', act: '→ Record your first sale to get started.' },
          ar: { title: 'لوحة التحكم جاهزة', obs: 'لا توجد بيانات بعد. من أول عملية بيع، يقرأ كيوي ساعات الذروة والأصناف التي تُباع ومتوسط السلة. أما الهوامش فتحتاج تكاليفك أيضاً، فالبيع وحده لا يحملها.', act: '→ سجّل أول عملية بيع للبدء.' },
        };
        return W[fusionLang()] || W.fr;
      }
      // Prefer a REAL, data-derived recommendation (menu margins × popularity,
      // live hourly distribution) computed by the shared insight engine — the
      // same one the AI agent uses.
      const real = window.KiwiInsights && window.KiwiInsights.heroRec && window.KiwiInsights.heroRec(v);
      if (real) return real;
      /* The static rec below is Café Atlas's, written by hand. It is the right
       * fallback for the local demo and the wrong one for anybody else: a real
       * session that lands here is a merchant whose own data was too thin to
       * compute anything, and handing them a stranger's recommendation is the
       * worst possible answer to that. Say nothing instead — renderHeroAi()
       * blanks the card. */
      if (isRealMerchant()) return null;
      const L = HERO_AI_REC[fusionLang()] || HERO_AI_REC.fr; return L[v] || L.cafeAtlas;
    },
    getHeatmapAiRec: id => {
      const v = id || currentVenue;
      if (isCustom(v)) {
        // Des ventes existent ⇒ on dit quelque chose de vrai. Seule une boutique
        // réellement vide garde le message d'accueil.
        const real = window.KiwiDateRange?.insights?.heatmap?.();
        if (real) return real;
        const W = {
          /* "Kiwi AI" on what is an hour-by-hour count of the merchant's own
           * tickets. It is arithmetic, and calling arithmetic AI is how the
           * label stops meaning anything by the time it sits on something that
           * genuinely is. Kiwi Insights, and a promise limited to what the
           * count can actually deliver. */
          fr: { title: 'Vos heures de pointe apparaîtront ici', obs: 'Dès vos premières ventes, Kiwi compte vos tickets heure par heure et vous montre vos creux et vos pics de la journée.', cta: '' },
          en: { title: 'Your peak hours will show up here', obs: 'As soon as you record sales, Kiwi counts your tickets hour by hour and shows you the lulls and the rushes.', cta: '' },
          ar: { title: 'ساعات الذروة ستظهر هنا', obs: 'بمجرد تسجيل مبيعاتك، يحصي كيوي تذاكرك ساعة بساعة ويعرض لك فترات الركود والذروة.', cta: '' },
        };
        return W[fusionLang()] || W.fr;
      }
      // Same rule as getHeroAiRec: the canned copy is Café Atlas's, so a real
      // session gets nothing rather than somebody else's peak hours.
      if (isRealMerchant()) return null;
      const L = HEATMAP_AI_REC[fusionLang()] || HEATMAP_AI_REC.fr; return L[v] || L.cafeAtlas;
    },
    // Custom / scoped venues have no benchmark cohort — return empty so callers
    // show a neutral label (dateRange falls back), never Café Atlas's figures.
    getMixCmiSavings: id => { const v = id || currentVenue; if (isCustom(v) || isRealMerchant()) return ''; const L = MIX_CMI_SAVINGS[fusionLang()] || MIX_CMI_SAVINGS.fr; return L[v] || L.cafeAtlas; },
    getBenchLabels: id => { const v = id || currentVenue; if (isCustom(v) || isRealMerchant()) return undefined; const L = BENCH_LABELS[fusionLang()] || BENCH_LABELS.fr; return L[v] || L.cafeAtlas; },
    isFusion: () => currentVenue === 'fusion',
    isCustom,
    createVenue,
    updateVenue,
    /* Le slug serveur de cet établissement. TOUT ce qui écrit chez le serveur
     * doit passer par ici plutôt que de re-slugifier le nom dans son coin —
     * cinq modules le faisaient, donc cinq occasions de changer d'identité au
     * prochain renommage. */
    slugOf,
    tenantOf: salesTenant,
    salesTenant,
    TRANSIENT_IDS,
    enterFusion,
    exitFusion,
    REAL_VENUES,
    VENUES,
    KPI_BY_TYPE,
    /* Menu items for the given venue (or current). Used by the live feed to
     * generate realistic order contents — items, qty, unit prices — that
     * match the venue's actual carte. */
    getMenuItems: (venue) => (isRealMerchant() && !isCustom(venue || currentVenue)) ? [] : miItems(venue || currentVenue),
  };
})();
