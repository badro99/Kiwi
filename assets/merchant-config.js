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

  function merchant() {
    try {
      // A ?merchant= in the URL is authoritative (operator "Ouvrir dashboard"
      // opens the client scoped this way) and is pinned to localStorage so the
      // rest of the session stays on that client. Falls back to the last pick.
      var q = new URLSearchParams(location.search).get('merchant');
      if (q) { try { localStorage.setItem('kiwiLiveMerchant', q); } catch (_) {} return q; }
      return localStorage.getItem('kiwiLiveMerchant') || 'cafe-atlas';
    } catch (_) { return 'cafe-atlas'; }
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
    apply: applyFeatures, syncPins: syncPins, syncType: syncType };
  window.KiwiConfig = cfg;

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
  function storeSlug() { return slugMerchant(storeName()); }

  function post(payload) {
    var name = storeName();
    var slug = slugMerchant(name);
    if (slug) { payload.merchant = slug; payload.name = name; }
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
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
    fetch(configUrl(), { headers: { Accept: 'application/json' } })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (data) {
        if (!data) return;                     // no backend → keep defaults
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
      })
      .catch(function () { /* offline / missing endpoint → app keeps its defaults */ });
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

  /* One extra read, on the dashboard only: the ACCOUNT's own config, with no
   * store named. It feeds nothing but seenPins.
   *
   * The owner's code was filed once, against whichever store existed at the
   * time. Ask only about the shop currently on screen and you will not find it
   * from the other one — which is exactly how an owner ended up locked out of
   * their own dashboard while their newest shop's cashier could walk in. This
   * costs one request and is session-derived, so it can only ever return codes
   * belonging to the person already signed in. */
  function fetchAccountPins() {
    if (isScoped() || !onDashboard()) return;
    fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.pins)) rememberPins(d.pins); })
      .catch(function () {});
  }

  function boot() { fetchConfig(); fetchAccountPins(); watchStore(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
