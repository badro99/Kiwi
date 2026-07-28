/* Kiwi — merchant config consumer (client side of the operator console).
 *
 * Reads the per-merchant config an operator set in kiwi-admin.html:
 *   • features — modules toggled OFF (pricing/tier control) are hidden here.
 *   • pins     — staff PINs the operator manages remotely.
 *
 * Fail-safe by design: if /api/config is missing (GitHub Pages, local static
 * server) or the request errors, NOTHING changes — every app keeps its current
 * hardcoded behavior. So this can ship to all surfaces without touching the demo.
 *
 * A module is hidden by tagging its entry point  data-feature="<key>"  in the
 * app; when the operator sets features[key] === false, every matching node is
 * hidden and  body.feat-off-<key>  is added (for CSS that needs it). Apps that
 * build nav dynamically can call  window.KiwiConfig.apply()  after rendering, or
 * listen for the  kiwi-config  event. PINs are exposed on window.KiwiConfig.pins
 * for the caisse/serveur to consult additively (never replacing their defaults).
 * Vanilla, no deps, no innerHTML.
 */
(function () {
  'use strict';

  /* ── UN ?merchant= N'EST PAS UNE PREUVE ────────────────────────────────────
   * L'opérateur ouvre un client par « Ouvrir dashboard », c'est-à-dire par un
   * ?merchant=<slug> dans l'adresse. Ce paramètre était pris pour argent
   * comptant ET ÉCRIT dans kiwiLiveMerchant — la clé qui désigne le locataire
   * pour tout le reste : les ventes remontées, le rapport de journée, la
   * caisse appairée. Conséquence, chez n'importe qui : ouvrir une seule fois
   * une adresse portant le slug d'un autre commerce faisait basculer la
   * session entière sous ce slug, et elle y restait après la fermeture de
   * l'onglet. Observé sur le navigateur du propriétaire pendant la recette.
   *
   * Le paramètre vaut donc pour CETTE page, et rien de plus. Il ne s'écrit
   * nulle part tant que /api/me n'a pas confirmé que l'appelant est bien un
   * opérateur portant sur ce magasin — c'est identity.js qui appelle alors
   * confirmScope(). Un commerçant ordinaire qui atterrit sur une telle adresse
   * regarde une page qui ne lui répond pas, puis retrouve son magasin ; sa
   * session, elle, n'a pas bougé. */
  var urlScope = '';
  try { urlScope = new URLSearchParams(location.search).get('merchant') || ''; } catch (_) {}

  function merchant() {
    if (urlScope) return urlScope;
    try { return localStorage.getItem('kiwiLiveMerchant') || 'cafe-atlas'; } catch (_) { return 'cafe-atlas'; }
  }

  /* Le serveur a confirmé la portée : on peut l'inscrire. Appelé par
     identity.js quand /api/me répond operator + scoped. */
  function confirmScope(slug) {
    var s = String(slug || urlScope || '').trim();
    if (!s) return false;
    urlScope = s;
    try { localStorage.setItem('kiwiLiveMerchant', s); } catch (_) {}
    return true;
  }

  /* `pins` is the ACTIVE store's staff list — the till pad's answer to "who is
   * standing here". `seenPins` is every pin list this session has been handed,
   * across every store of this account, deduped by code.
   *
   * The dashboard needs the second one. It is the OWNER's surface and it spans
   * all their shops, so the code that opens it cannot be scoped to whichever
   * shop happens to be selected: once the staff list went per-store, an owner
   * whose code was filed under their first shop could no longer open the
   * dashboard from their second, while that second shop's cashier could. */
  var cfg = { features: {}, pins: [], seenPins: [], type: '', loaded: false,
    apply: applyFeatures, syncPins: syncPins, syncType: syncType,
    newStore: registerNewStore, off: featureOff,
    /* Le slug serveur du magasin à l'écran. menu-catalog.js le demandait déjà
     * (`C.storeSlug`) — il n'a jamais été exposé, donc il retombait sur sa
     * propre re-slugification du nom, et la carte déménageait au premier
     * renommage. Une seule réponse à « où écrire », pour tout le monde. */
    storeSlug: storeSlug,
    /* Voir merchant() : un ?merchant= ne s'inscrit qu'une fois le serveur
       d'accord. identity.js est le seul appelant légitime. */
    confirmScope: confirmScope,
    /* Relire la config MAINTENANT. L'opérateur vient d'allumer un module pour ce
     * commerçant : sans ceci, la caisse ne l'apprend qu'au prochain chargement de
     * page — et une caisse de comptoir reste ouverte des jours entiers. */
    reload: function () { return fetchConfig(); } };
  window.KiwiConfig = cfg;

  /* Un module coupé par l'opérateur. `=== false` et rien d'autre : une clé
   * absente veut dire ALLUMÉ (c'est ce qui laisse les clients d'avant
   * intacts), et une config jamais reçue — pas de backend, hors ligne — ne
   * doit fermer aucune porte. */
  function featureOff(key) { return cfg.features[key] === false; }

  var pinSeen = Object.create(null);
  function rememberPins(list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (x) {
      var code = String((x && (x.code || x.pin)) || '').trim();
      if (!/^\d{4}$/.test(code) || pinSeen[code]) return;
      pinSeen[code] = 1;
      cfg.seenPins.push({ code: code, name: (x && x.name) || '', role: (x && x.role) || '' });
    });
  }

  /* ── WHICH store is on screen ──────────────────────────────────────────────
   * One login can hold several établissements — a boutique and a restaurant —
   * and each is its own store: its own type, its own modules, its own staff, its
   * own till, its own money. The session says who is signed in; it cannot say
   * which shop they are currently looking at. So every sync names the active
   * store, and the server accepts the name only after checking the store really
   * belongs to that account.
   *
   * Without this the server had one slug per LOGIN, so a client who added a
   * second shop had its type overwrite the first shop's and its staff PINs merge
   * into one list. Empty on the caisse/serveur (no venue engine) and before the
   * venue engine settles — both fall back to the session-derived slug, which is
   * exactly the old behaviour. */
  function slugMerchant(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  /* Two venue ids are synthetic and must never be registered as a store:
   * 'own' is the empty placeholder shown to a merchant who has not created one
   * yet (it borrows the account name, or reads "Mon établissement" when there
   * isn't one), and 'scoped' is the operator's view of somebody else's client.
   * Registering either would invent a shop in the console that nobody owns. */
  var TRANSIENT = { own: 1, scoped: 1 };
  function storeName() {
    try {
      var KV = window.KiwiVenue;
      if (!KV || !KV.isCustom || !KV.isCustom() || !KV.getCurrentVenueData) return '';
      var v = KV.getCurrentVenueData();
      if (!v || !v.custom || !v.name || TRANSIENT[v.id]) return '';
      return String(v.name).trim();
    } catch (_) { return ''; }
  }
  /* Le slug ne se déduit PLUS du nom : il est porté par l'établissement, gravé
   * une fois (venues.js › slugOf). Sinon corriger l'orthographe de son enseigne
   * changeait l'identité du magasin, et le POST ci-dessous en faisait naître un
   * neuf, vide, chez le serveur. Le nom, lui, continue de partir à chaque envoi :
   * c'est ce qui fait que la correction s'affiche dans la console — sous le même
   * magasin. Repli sur l'ancien calcul quand le moteur de venues est absent. */
  function storeSlug() {
    try {
      var KV = window.KiwiVenue;
      if (KV && KV.slugOf && storeName()) { var s = KV.slugOf(); if (s) return s; }
    } catch (_) {}
    return slugMerchant(storeName());
  }

  function postRaw(payload) {
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  function post(payload) {
    var name = storeName();
    var slug = storeSlug();
    if (slug) {
      payload.merchant = slug; payload.name = name;
      // Une boutique créée hors ligne n'a jamais pu se déclarer neuve. Le drapeau
      // attend dans `kiwiFreshStores` et repart avec le premier envoi qui passe.
      if (isFresh(slug)) payload.fresh = true;
    }
    return postRaw(payload).then(function (r) {
      if (r && r.ok && payload.fresh && slug) freshDrop(slug);
      return r;
    });
  }

  /* ── « Cet établissement vient d'être créé » ────────────────────────────────
   * Le serveur ne peut pas deviner la différence entre une boutique ouverte à
   * l'instant et une boutique de six mois qui dit simplement bonjour : les deux
   * envoient le même POST. Ce drapeau-là est la différence, et c'est lui qui
   * décide si la fiche naît avec les cinq modules coupés (voir
   * functions/api/config.js › NEW_STORE_FEATURES) ou tout allumé comme avant.
   *
   * Il ne peut RIEN allumer : côté serveur il n'écrit des valeurs par défaut que
   * dans une fiche qui n'a aucune configuration. Un client existant qui ouvre son
   * tableau de bord ne passe jamais par ici.
   *
   * La liste d'attente survit à un échec réseau — une boutique créée dans le
   * métro se déclarera au prochain envoi réussi. Bornée à 8 pour ne pas laisser
   * traîner un slug abandonné pour toujours. */
  var FRESH_KEY = 'kiwiFreshStores';
  function freshList() { try { return JSON.parse(localStorage.getItem(FRESH_KEY)) || []; } catch (_) { return []; } }
  function freshSave(a) { try { localStorage.setItem(FRESH_KEY, JSON.stringify(a.slice(-8))); } catch (_) {} }
  function freshAdd(slug) { var a = freshList(); if (a.indexOf(slug) < 0) { a.push(slug); freshSave(a); } }
  function freshDrop(slug) { var a = freshList(); var i = a.indexOf(slug); if (i >= 0) { a.splice(i, 1); freshSave(a); } }
  function isFresh(slug) { return !!slug && freshList().indexOf(slug) >= 0; }

  /* Appelé au moment exact de la création : par l'onboarding (première boutique
   * d'un compte) et par le sélecteur d'établissement (venues.js › createVenue).
   * Le nom est passé en clair parce que le moteur de venues n'a pas encore
   * basculé dessus — on ne peut pas lire « le magasin à l'écran », il n'existe
   * pas encore. Sans nom, le serveur retombe sur le slug du compte, ce qui est
   * précisément la première boutique. */
  function registerNewStore(opts) {
    opts = opts || {};
    var name = String(opts.name || '').trim();
    var slug = slugMerchant(name);
    var payload = { fresh: true };
    if (slug) { payload.merchant = slug; payload.name = name; freshAdd(slug); }
    if (opts.type) payload.type = String(opts.type);
    return postRaw(payload).then(function (r) {
      var ok = !!(r && r.ok);
      if (ok && slug) freshDrop(slug);
      return ok;
    }).catch(function () { return false; });
  }

  /* Push this store's business type (onboarding kiwiBizType) up to the server so
   * the operator console shows the RIGHT module set (a boutique gets boutique
   * modules, not restaurant ones). This POST is also what REGISTERS a newly
   * created établissement against its owner, which is how a client's second shop
   * reaches God mode at all. Fire-and-forget + fail-safe. */
  function syncType(type) {
    if (!type) return Promise.resolve(false);
    return post({ type: String(type) })
      .then(function (r) { return !!(r && r.ok); }).catch(function () { return false; });
  }

  /* Push this store's own staff PINs up to the server so the operator console
   * (God mode) can see and manage them. The server still decides WHO is writing
   * from the session cookie — the slug we send only says which of this account's
   * stores, and is refused if it is not one of them. Fire-and-forget + fail-safe:
   * on a static host (GitHub Pages, local) or offline the POST just fails and
   * nothing changes. `pins` is the client's local shape [{ role, name, code }]. */
  function syncPins(pins) {
    if (!Array.isArray(pins)) return Promise.resolve(false);
    return post({ pins: pins }).then(function (r) {
      if (r && r.ok) { cfg.loaded = true; try { return r.json().then(function (d) { if (d && Array.isArray(d.pins)) cfg.pins = d.pins; return true; }).catch(function () { return true; }); } catch (_) { return true; } }
      return false;
    }).catch(function () { return false; });
  }

  /* A section header with nothing under it is worse than no section at all:
   * "BOUTIQUE" over empty space reads as a broken page, not as a module this
   * client doesn't pay for. So after every pass a sidebar `.sect` whose every
   * following link is one WE hid disappears with them, and comes back the moment
   * one returns. Only our own hides count — the Croissance band is hidden by CSS
   * (body.growth-locked) and must not be read as a switched-off section. */
  function syncSectionHeaders() {
    var nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    var nodes = nav.querySelectorAll('.sect, a');
    var head = null, total = 0, off = 0;
    function settle() {
      if (!head) return;
      if (total && total === off) {
        head.setAttribute('data-feat-empty', '');
        head.style.display = 'none';
      } else if (head.hasAttribute('data-feat-empty')) {
        head.removeAttribute('data-feat-empty');
        head.style.display = '';
      }
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('sect')) { settle(); head = el; total = 0; off = 0; continue; }
      total++;
      if (el.hasAttribute('hidden')) off++;
    }
    settle();
  }

  var appliedOff = [];
  function applyFeatures() {
    var features = cfg.features || {};
    if (!document.body) return;
    // First, un-hide anything a PREVIOUS store had switched off. The venue
    // switcher moves between shops that don't buy the same modules, so a hide
    // left over from the boutique would blank a section the restaurant pays for.
    appliedOff.forEach(function (key) {
      if (features[key] === false) return;                 // still off — leave it
      document.body.classList.remove('feat-off-' + key);
      var was = document.querySelectorAll('[data-feature="' + key + '"]');
      for (var j = 0; j < was.length; j++) { was[j].removeAttribute('hidden'); was[j].style.display = ''; }
    });
    appliedOff = [];
    Object.keys(features).forEach(function (key) {
      if (features[key] === false) {
        appliedOff.push(key);
        document.body.classList.add('feat-off-' + key);
        var nodes = document.querySelectorAll('[data-feature="' + key + '"]');
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].setAttribute('hidden', '');
          nodes[i].style.display = 'none';
        }
      }
    });
    syncSectionHeaders();
    gateHandlers();
    watchLateNodes();
  }

  /* ── La deuxième moitié : les portes, pas seulement les panneaux ────────────
   * Cacher le lien de la barre latérale ne suffit pas. La même destination
   * s'atteint depuis la recherche (⌘K), une carte de l'accueil, une action
   * rapide, la barre du mobile, un raccourci de la caisse, et Kiwi AI qui répond
   * « j'ouvre les terminaux » avec un bouton. Tout cela finit au même endroit :
   * `Kiwi.handlers[nom]`. On garde donc la porte plutôt que de courir après
   * chaque panneau — un module coupé ne s'ouvre plus, d'où qu'on frappe.
   *
   * Le test est fait À L'APPEL, pas au moment où on enveloppe : rallumer un
   * module le rouvre aussitôt, sans rien à restaurer, et une config qui n'est
   * jamais arrivée (hors ligne, hôte statique) ne ferme rien du tout.
   *
   * Les identifiants de nav SONT les clés de modules (venues.js), donc
   * `nav-<clé>` se déduit. Les alias sont les entrées qui portent un autre nom.
   */
  var HANDLER_ALIASES = {
    terminaux: ['nav-terminals'],
    depenses: ['open-depenses'],
    orderpro: ['orderpro-tags'],
    crm: ['clients-directory', 'growth-crm'],
    loyalty: ['loyalty'],
    reservations: ['new-reservation'],
  };
  function gateOne(H, name, key) {
    var fn = H[name];
    if (typeof fn !== 'function' || fn.__kiwiGate) return;
    var wrapped = function () {
      if (featureOff(key)) return;          // ce module ne fait pas partie de leur Kiwi
      return fn.apply(this, arguments);
    };
    wrapped.__kiwiGate = key;
    H[name] = wrapped;
  }
  function gateHandlers() {
    var H = null;
    try { H = window.Kiwi && window.Kiwi.handlers; } catch (_) {}
    if (!H) return;
    Object.keys(cfg.features).forEach(function (key) {
      gateOne(H, 'nav-' + key, key);
      (HANDLER_ALIASES[key] || []).forEach(function (n) { gateOne(H, n, key); });
    });
  }

  /* Half this app paints on demand — a drawer, an in-flow page, a re-rendered
   * sidebar section. Those nodes are born after the config landed, so a hide
   * applied once at boot never reaches them and a switched-off module reappears
   * the moment the client opens the surface that offers it.
   *
   * The observer only exists while something is actually switched off, which for
   * most clients is never: the common path costs nothing. When it does run it is
   * debounced to one pass per task and skips subtrees with no [data-feature] in
   * them. setTimeout, not requestAnimationFrame: a dashboard opened in a
   * background tab paints no frames, and the module would be back on screen the
   * moment the merchant looked at it. */
  var mo = null, moQueued = false;
  function watchLateNodes() {
    if (!appliedOff.length) {
      if (mo) { mo.disconnect(); mo = null; }
      return;
    }
    if (mo || typeof MutationObserver !== 'function' || !document.body) return;
    mo = new MutationObserver(function (records) {
      if (moQueued) return;
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (!n.hasAttribute('data-feature') && !n.querySelector('[data-feature]')) continue;
          moQueued = true;
          setTimeout(function () { moQueued = false; applyFeatures(); }, 0);
          return;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Push the server-stored business type into the dashboard's venue engine so the
  // sidebar's vertical section reflects the real trade. Gated to an EXPLICITLY
  // scoped context — the operator's God-mode view (?op=1) or a pinned ?merchant —
  // which is the only place that needs it. A plain demo session (default
  // cafe-atlas slug) is deliberately left alone, so a stray config row can never
  // hijack the multi-venue demo; a real client's own venue is already the right
  // trade from onboarding. Fail-safe: no type, not scoped, or a page without
  // KiwiVenue (caisse/serveur) → does nothing.
  function isScoped() {
    try { var p = new URLSearchParams(location.search); return p.has('op') || p.has('merchant'); }
    catch (_) { return false; }
  }
  function applyServerType() {
    // Apply on the operator's scoped view AND on a real merchant's own dashboard.
    // The dashboard reads bare /api/config (session-derived), so the demo — which
    // has no session — gets an empty type here and this stays a no-op. A boutique
    // must render as a boutique on a plain login, not just under God mode (F3).
    if (!cfg.type || !(isScoped() || onDashboard())) return;
    try { if (window.KiwiVenue && window.KiwiVenue.applyServerType) window.KiwiVenue.applyServerType(cfg.type); } catch (_) {}
  }

  // Where to read config from. An operator (God mode, ?op/?merchant) reads a
  // specific client by slug. A real merchant on their OWN dashboard names the
  // STORE they are looking at — one login can hold several, and the boutique's
  // modules are not the restaurant's. The server verifies the store belongs to
  // this account and otherwise falls back to the account's own; that check is why
  // naming a slug here is safe, where taking the client's word used to let a
  // stale kiwiLiveMerchant read another merchant's PINs → "code incorrect". No
  // store resolved yet (venue engine still booting) ⇒ the bare, session-derived
  // URL, exactly as before. A paired caisse/serveur has no account session, so it
  // keeps passing its paired slug explicitly.
  function onDashboard() { try { return /\/dashboard(?:\.html)?$/.test(location.pathname); } catch (_) { return false; } }
  function configUrl() {
    if (isScoped()) return '/api/config?merchant=' + encodeURIComponent(merchant());
    if (onDashboard()) {
      var s = storeSlug();
      return s ? '/api/config?merchant=' + encodeURIComponent(s) : '/api/config';
    }
    return '/api/config?merchant=' + encodeURIComponent(merchant());
  }

  var lastSlug = null;
  function fetchConfig() {
    lastSlug = storeSlug();
    return fetch(configUrl(), { headers: { Accept: 'application/json' } })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (data) {
        if (!data) return false;               // no backend → keep defaults
        cfg.features = data.features || {};
        cfg.pins = Array.isArray(data.pins) ? data.pins : [];
        rememberPins(cfg.pins);
        cfg.type = data.type || '';
        cfg.loaded = true;
        applyFeatures();
        // Make the server-stored business type authoritative for the dashboard's
        // vertical section (a boutique shows boutique modules, never restaurant),
        // incl. the operator's scoped God-mode view. No-op without a type or when
        // KiwiVenue isn't present (caisse/serveur). Retried once for async nav.
        applyServerType();
        setTimeout(applyServerType, 500);
        // Re-apply shortly after, in case the app built its nav asynchronously.
        setTimeout(applyFeatures, 400);
        try { document.dispatchEvent(new CustomEvent('kiwi-config', { detail: cfg })); } catch (_) {}
        return true;
      })
      .catch(function () { return false; });  /* offline / missing endpoint → app keeps its defaults */
  }

  /* Follow the venue switcher. Two reasons this can't be a one-shot fetch:
   *   · the venue engine settles AFTER this file's first read, so the first
   *     answer is the account-level one and has to be corrected once the store
   *     resolves;
   *   · switching from the boutique to the restaurant switches store, and with it
   *     the modules, the type and the staff list.
   * The short poll is the safety net for load order — it stops the moment a store
   * resolves, and gives up after ~4 s (a caisse, a demo, or a login with no
   * établissement of its own, where there is nothing to follow). */
  /* Claim the store on sight.
   *
   * Registration used to be a side effect of syncing something else — the trade
   * at onboarding, or the staff codes when the team page republished them. That
   * covers a shop created from today on and nothing else: an établissement the
   * merchant opened last month has no reason to sync again, so it would stay
   * unknown to the server, and a store the operator cannot see is a store they
   * cannot configure. So the dashboard claims whichever store is on screen, once
   * per store per session.
   *
   * Cheap and safe: the body carries only the slug and the name, the server's
   * upsert leaves features, plan and type alone, a slug belonging to someone else
   * is refused (403), and with no backend the POST fails and nothing changes. */
  var claimed = {};
  function registerStore() {
    var slug = storeSlug();
    if (!slug || claimed[slug]) return;
    claimed[slug] = true;
    post({}).catch(function () { claimed[slug] = false; });   // retry on the next switch
  }

  function refetchStore() {
    var s = storeSlug();
    if (!s) return false;
    registerStore();
    if (s !== lastSlug) fetchConfig();
    return true;
  }
  function watchStore() {
    if (!onDashboard() || isScoped()) return;
    var subscribed = false;
    function trySubscribe() {
      if (subscribed) return true;
      try {
        if (window.KiwiVenue && window.KiwiVenue.subscribe) {
          window.KiwiVenue.subscribe(refetchStore);
          subscribed = true;
        }
      } catch (_) {}
      return subscribed;
    }
    trySubscribe();                      // venues.js may already be up
    var tries = 0;
    var t = setInterval(function () {
      var subbed = trySubscribe();       // …or it may load after this file
      var resolved = refetchStore();
      if ((subbed && resolved) || ++tries > 10) clearInterval(t);
    }, 400);
  }

  /* UN code, pour toute la maison.
   *
   * Les codes du personnel sont rangés par BOUTIQUE (`staff_pins.merchant`) —
   * c'est juste pour une caisse : le serveur du restaurant n'ouvre pas le tiroir
   * de l'épicerie. Le dashboard, lui, est la surface du PATRON et il embrasse
   * tous ses établissements : son code doit l'ouvrir depuis n'importe lequel.
   *
   * Le code du patron n'est déposé qu'UNE fois, sous la boutique qui existait ce
   * jour-là. On ne demandait qu'à celle affichée, plus la boutique « primaire »
   * de la session — donc un patron dont le code dormait sous son TROISIÈME
   * magasin restait à la porte de son propre dashboard, pendant que le caissier
   * du magasin affiché entrait. On demande maintenant à TOUS ses magasins et on
   * réunit les réponses ; `configuredPins()` côté page ne retient de toute façon
   * que les codes patron/manager.
   *
   * La liste des magasins vient de /api/me, déjà lue par identity.js — aucun
   * appel de plus pour l'obtenir. Chaque lecture reste dérivée de la session :
   * le serveur refuse un slug qui n'appartient pas au compte, donc ceci n'élargit
   * rien, ça finit de poser la question. Compte d'un seul magasin, base pas
   * encore migrée, ou identity.js absent ⇒ la lecture nue d'avant, à l'identique.
   * Jamais sur une vue portée : là, l'opérateur entre par son propre code. */
  function readPinsFrom(url) {
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.pins)) rememberPins(d.pins); })
      .catch(function () {});
  }
  function fetchAccountPins() {
    if (isScoped() || !onDashboard()) return;
    /* On attend le portillon d'identité au lieu de le lire tout de suite : ce
     * fichier est chargé AVANT identity.js dans dashboard.html, et deux scripts
     * `defer` s'exécutent à la suite avant DOMContentLoaded — donc au moment où
     * boot() tourne ici, window.KiwiIdentity n'existe pas encore. Lu une seule
     * fois, la liste des magasins était toujours vide et on retombait chaque fois
     * sur la lecture nue, c'est-à-dire sur le bug qu'on répare. ~1 s d'attente
     * maximum, puis on se rabat quand même — jamais de blocage. */
    var tries = 0;
    (function waitForIdentity() {
      var gate = null;
      try { gate = window.KiwiIdentity && window.KiwiIdentity.ready; } catch (_) {}
      if (!gate || typeof gate.then !== 'function') {
        if (++tries > 20) { readPinsFrom('/api/config'); return; }
        setTimeout(waitForIdentity, 50);
        return;
      }
      gate.then(function (st) {
        var stores = (st && Array.isArray(st.stores)) ? st.stores : [];
        // Compte d'un seul magasin, base pas encore migrée, ou rechargement en
        // cours après un changement de compte ⇒ la lecture nue d'avant.
        if (!stores.length) { readPinsFrom('/api/config'); return; }
        var asked = Object.create(null);
        stores.forEach(function (s) {
          var m = String((s && s.merchant) || '').trim();
          if (!m || asked[m]) return;
          asked[m] = 1;
          readPinsFrom('/api/config?merchant=' + encodeURIComponent(m));
        });
      }).catch(function () { readPinsFrom('/api/config'); });
    })();
  }

  function boot() { fetchConfig(); fetchAccountPins(); watchStore(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
