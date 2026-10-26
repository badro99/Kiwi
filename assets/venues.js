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
  /* <<split:bridge:profiles>> */
  const { VENUES, ICONS, MATERIAL_PRESSING, VERTICAL_SECTIONS, subLang, pickL, SUBTYPE_PROFILES, BASE_VOCAB, KPI_BY_TYPE, SIBLINGS, TYPE_LABELS, typeLabelOf, HEADER_SUB, HERO_AI_REC, HEATMAP_AI_REC, MIX_CMI_SAVINGS, BENCH_LABELS } = window.__kiwiVenueParts.profiles.call(this, {  });
  /* <</split:bridge:profiles>> */

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
  /* <<split:bridge:types>> */
  const { TYPE_BASES, SUBTYPE_BASE } = window.__kiwiVenueParts.types.call(this, {  });
  /* <</split:bridge:types>> */
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
  /* <<split:bridge:upsell>> */
  const { UPSELL_STR, APP_INSTALL_STR } = window.__kiwiVenueParts.upsell.call(this, {  });
  /* <</split:bridge:upsell>> */
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
  /* <<split:bridge:icon>> */
  const { MATERIAL_VENUE_FALLBACK, typeIconOf } = window.__kiwiVenueParts.icon.call(this, {  });
  /* <</split:bridge:icon>> */
  /* <<split:bridge:dropdown>> */
  const { DROPDOWN_CTA } = window.__kiwiVenueParts.dropdown.call(this, {  });
  /* <</split:bridge:dropdown>> */

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
  /* <<split:bridge:sidebar>> */
  const { fusionSidebarHtml } = window.__kiwiVenueParts.sidebar.call(this, { currentPlan });
  /* <</split:bridge:sidebar>> */

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
  /* <<split:bridge:navigation>> */
  const { NAV_ORDERS_STR, DASHBOARD_HIDDEN_NAV, NAV_TAG_TEXT, navTag } = window.__kiwiVenueParts.navigation.call(this, {  });
  /* <</split:bridge:navigation>> */
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
  /* <<split:bridge:overlay>> */
  const { buildOverlayMarkup } = window.__kiwiVenueParts.overlay.call(this, {  });
  /* <</split:bridge:overlay>> */

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
  /* <<split:bridge:theme>> */
  const { themeChoiceIsDark, restoreThemeChoice } = window.__kiwiVenueParts.theme.call(this, {  });
  /* <</split:bridge:theme>> */

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
  /* <<split:bridge:fusion>> */
  const { FUSION_PER_VENUE_TARGETS, FUSION_PER_VENUE_WEIGHTS, FUSION_HOUR_LABELS, FUSION_N, FUSION_PORTFOLIO_GOAL, FUSION_VENUE_IDS, fusionCumulativeAt, computePerVenueLive, fusionAnimateNumber, fusionFrInt, fusionFmtMad, fusionFmtMadCents, fusionFmtPct, fusionParseAmount, FUSION_DELTA_LABELS, FS_ULTRA_STR, FUSION_HERO_LABELS, fusionLang, fusionEffectiveRange, FUSION_MATERIAL_ICONS, fusionIcon, fusionTypeIcon, fusionSparkPath, fusionSparkSvg, fusionStackedAreaSvg } = window.__kiwiVenueParts.fusion.call(this, { VENUES, typeIconOf });
  /* <</split:bridge:fusion>> */

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
  /* <<split:bridge:staff>> */
  const { STAFF, EQ_MONTH_WEEKS } = window.__kiwiVenueParts.staff.call(this, {  });
  /* <</split:bridge:staff>> */
  /* <<split:bridge:escaping>> */
  const { eqEsc, eqAllStaff } = window.__kiwiVenueParts.escaping.call(this, { STAFF });
  /* <</split:bridge:escaping>> */
  /* Staff in the active venue scope · fusion shows all three venues. */
  function eqScopedStaff() {
    if (isRealMerchant() && !isCustom(currentVenue)) return [];
    return currentVenue === 'fusion' ? eqAllStaff() : (STAFF[currentVenue] || []).slice();
  }
  function eqPresentCount() { return eqScopedStaff().filter(s => s.status === 'present').length; }
  /* <<split:bridge:menu>> */
  const { MENU, MI_STATION_STATE, miStations } = window.__kiwiVenueParts.menu.call(this, {  });
  /* <</split:bridge:menu>> */

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
  /* <<split:bridge:stations>> */
  const { MI_STATION_ALIASES, miStationState } = window.__kiwiVenueParts.stations.call(this, { MI_STATION_STATE });
  /* <</split:bridge:stations>> */
  /* <<split:bridge:menuTypes>> */
  const { MENU_TYPES, MENU_FALLBACK_NAVS, MENU_NONE } = window.__kiwiVenueParts.menuTypes.call(this, {  });
  /* <</split:bridge:menuTypes>> */
  let menuWait = 0;
  /* <<split:bridge:menuRouting>> */
  const { menuWorkspace, menuOwnedByWorkspace } = window.__kiwiVenueParts.menuRouting.call(this, { MENU_TYPES, getVenueType });
  /* <</split:bridge:menuRouting>> */
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
  /* <<split:bridge:menuDashboard>> */
  const { menuShowDashboard, menuWireHandlers } = window.__kiwiVenueParts.menuDashboard.call(this, { menuNavHandler });
  /* <</split:bridge:menuDashboard>> */
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
  /* <<split:bridge:cache>> */
  const { ledgerCache, deepFreeze, cachedLedger } = window.__kiwiVenueParts.cache.call(this, {  });
  /* <</split:bridge:cache>> */
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
  /* <<split:bridge:entries>> */
  const { salesEntry, annotatedEntry } = window.__kiwiVenueParts.entries.call(this, {  });
  /* <</split:bridge:entries>> */
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
    const existing = rows.find(r => (cursor && Number(r && r.cursor) === cursor) || (saleId && r && r.saleId === saleId));
    if (existing) {
      if (Array.isArray(refund.lines) && JSON.stringify(existing.lines) !== JSON.stringify(refund.lines)) {
        existing.lines = refund.lines;
        if (refundsWrite(id, rows)) salesSubs.forEach(fn => { try { fn(id); } catch (_) {} });
      }
      return false;
    }
    const entry = {
      ts: Number(refund && refund.ts) || Date.now(), amount: Math.abs(Number(refund && refund.amount) || 0),
      method: String((refund && refund.method) || 'cash').slice(0, 16), kind: 'refund',
      label: String((refund && refund.label) || 'Remboursement').slice(0, 80),
      ref: String((refund && refund.ref) || '').slice(0, 80), cursor, saleId,
      lines: Array.isArray(refund && refund.lines) ? refund.lines : [],
    };
    if (!(entry.amount > 0 || entry.lines.length) || !refundsWrite(id, rows.concat(entry))) return false;
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
  /* <<split:bridge:reconcile>> */
  const { salesReconcile } = window.__kiwiVenueParts.reconcile.call(this, { refundSubs, refundsList, refundsWrite, salesEntry, salesList, salesSubs, salesWrite });
  /* <</split:bridge:reconcile>> */
  /* <<split:bridge:totals>> */
  const { salesTotals } = window.__kiwiVenueParts.totals.call(this, { refundsList, salesList });
  /* <</split:bridge:totals>> */
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
  /* <<split:bridge:recipes>> */
  const { INVENTORY, SUPPLIERS, PLACEHOLDER_COSTS, RECIPES, RECIPES_SESSION, STAFF_DISH_RESPONSIBILITY, recFindInventoryItem, recResolveIngredient, recPortionCost, recFindMenuItem, recGetRecipe, recSetRecipe, recListRecipes, recRecipeStats, recTheoreticalConsumption, recActualConsumption, recComputeVariance, recVarianceByRecipe, recVarianceByCategory, recVariancePerStaffMember } = window.__kiwiVenueParts.recipes.call(this, { EQ_MONTH_WEEKS, MENU, REAL_VENUES, STAFF });
  /* <</split:bridge:recipes>> */

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
