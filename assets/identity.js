/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · IDENTITY — replace the demo owner/business with the REAL logged-in one.
 * ---------------------------------------------------------------------------
 * The dashboard ships with a hardcoded demo identity ("Rachid Benhima" · "Café
 * Atlas") for pitching. A real merchant who signs up and logs in must never see
 * it. This fetches /api/me (session-scoped) and, when a real account answers,
 * (a) writes the name/business/email into the localStorage keys the rest of the
 * app already reads (so the Account drawer, greeting, etc. all follow) and
 * (b) patches the visible identity in place: greeting, business subtext,
 * location label, and the sidebar profile chip + avatar initials.
 *
 * No account session (the local demo, the staff-bypass gate, or an operator
 * cookie) → /api/me returns { authenticated:false } and this does NOTHING, so the
 * demo identity is left exactly as it was. Fail-safe: no endpoint / offline →
 * silent no-op. Vanilla, self-contained.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════ THE IDENTITY GATE — window.KiwiIdentity ══════════════════
   * Anything that must know WHO is signed in before it acts has to wait for the
   * fetch below, and until now nothing could. The setup wizard is the case that
   * mattered: assets/onboarding.js runs a few lines after this file (both are
   * `defer`, so they execute in document order) and decided "is this merchant
   * new?" synchronously, a full network round-trip before /api/me answered. An
   * established merchant on a fresh browser was therefore read as a brand-new
   * signup and asked to create their business a second time.
   *
   * So publish a promise, settled exactly once from every terminal branch of the
   * fetch — including the failures — and let callers await it. No timers and no
   * polling: this file is loaded before its callers, so the promise already
   * exists by the time anyone asks for it.
   *
   * The settled value is a decision, not the raw payload:
   *   { authenticated, operator, onboarded, stores, reloading, noBackend, unreachable }
   * `noBackend` = a host with no API at all (static mirror) — callers may fall
   * back to local behaviour. `unreachable` = there IS a backend and it failed to
   * answer, which is never a licence to guess. */
  var settleGate;
  var gateSettled = false;
  window.KiwiIdentity = {
    ready: new Promise(function (res) { settleGate = res; }),
    state: null,
  };
  function settle(state) {
    if (gateSettled) return;
    gateSettled = true;
    try { window.KiwiIdentity.state = state; } catch (_) {}
    try { settleGate(state); } catch (_) {}
  }

  function ls(k, v) { try { if (v) localStorage.setItem(k, v); } catch (_) {} }
  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
  function initialsOf(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function setText(el, s) {
    if (!el || s == null || s === '') return;
    el.textContent = s;
    if (el.removeAttribute) el.removeAttribute('data-i18n');  // don't let langchange revert it
  }

  /* ══════════════ ACCOUNT-SCOPED TENANT ISOLATION ══════════════
   * Tenant data (the establishment list, PINs, pairing, live-feed target,
   * onboarding flag, and every per-venue store) lives in browser-GLOBAL
   * localStorage keys. When a DIFFERENT account signs in on this browser, the
   * previous account's state must be purged, or the new merchant inherits it —
   * foreign stores in the switcher, another store's PINs, leaked sales, a stale
   * venue/type. Same account reload = untouched (no data loss, no re-onboarding).
   *
   * Safety: we purge ONLY when we can positively tell the active account differs
   * from what this browser last held (a set kiwiAccountKey that differs, or a
   * prior owner email/business that mismatches). On the very first run after this
   * ships, an existing client whose local identity matches their session is
   * ADOPTED, not wiped. kiwiAccountKey is written BEFORE any reload, so a reload
   * loop is impossible (the next load sees key===email). Never runs on the demo
   * (no account → not authenticated). */
  var TENANT_KEYS = [
    'kiwiCustomVenues', 'kiwiVenue', 'kiwiVenueCount', 'kiwiOnboarded', 'kiwiSkipOnboard',
    'kiwiOwnerName', 'kiwiBizName', 'kiwiBizType', 'kiwiCity', 'kiwiTeamSize', 'kiwiGoals',
    'kiwiPins', 'kiwiLiveMerchant', 'kiwiLive', 'kiwiPaired', 'kiwiPairedVenue', 'kiwiPairings',
    'kiwiBizExtra', 'kiwiTeamV2:custom', 'kiwiSet:ownerName', 'kiwiSet:ownerEmail',
    'kiwiOwnerEmail', 'kiwiRole',
  ];
  // Any key starting with one of these is per-venue tenant data → purge on switch.
  var TENANT_PREFIXES = ['kiwi:', 'kiwiSales:', 'kiwiBoutiqueCatalog:', 'kiwiLiveIngested:', 'kiwiBarcodeSeq:', 'kiwiSet:biz:'];
  // Device/UI chrome that is NOT tenant data — must survive an account switch.
  var PRESERVE = {
    kiwiAccountKey: 1, kiwiLang: 1, kiwiTheme: 1, kiwiMode: 1, kiwiDesign2026: 1,
    // kiwiDateRange is deliberately NOT preserved. It is a view into ONE tenant's
    // data, not a device preference: carrying it across an account switch landed a
    // brand-new store on "Hier", printing ENCAISSÉ HIER 0,00 MAD directly above a
    // live 450 MAD sale. A store that has just been created has no yesterday.
    kiwiDesignIOS27: 1, kiwiRamadan: 1, kiwiRevCompare: 1,
    kiwiHeroView: 1, kiwiKpiLayout: 1, kiwiGlassLevel: 1, cafeAtlasLang: 1, kiwiDemos: 1,
  };
  function slugish(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function purgeTenantState() {
    try {
      TENANT_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
      var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || PRESERVE[k]) continue;
        for (var p = 0; p < TENANT_PREFIXES.length; p++) {
          if (k.indexOf(TENANT_PREFIXES[p]) === 0) { kill.push(k); break; }
        }
      }
      kill.forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
    } catch (_) {}
  }
  // Returns true when it purged (caller should reload for a clean re-init).
  function reconcileAccount(me) {
    var email = String(me && me.email || '').trim().toLowerCase();
    if (!email) return false;
    var key = null; try { key = localStorage.getItem('kiwiAccountKey'); } catch (_) {}
    if (key && key.toLowerCase() === email) return false;   // same account → keep everything
    var different;
    if (key) {
      different = true;                                     // key set and differs → different account
    } else {                                                // first run / migration: infer from prior identity
      var priorEmail = null, priorBiz = null;
      try { priorEmail = localStorage.getItem('kiwiOwnerEmail'); } catch (_) {}
      try { priorBiz = localStorage.getItem('kiwiBizName'); } catch (_) {}
      if (priorEmail) different = priorEmail.trim().toLowerCase() !== email;
      else if (priorBiz && me.business) different = slugish(priorBiz) !== slugish(me.business);
      else different = false;                               // can't tell → keep (safe for existing clients)
    }
    try { localStorage.setItem('kiwiAccountKey', email); } catch (_) {}  // BEFORE any reload → no loop
    if (!different) return false;
    purgeTenantState();
    return true;
  }

  /* The venue engine OWNS the store-switcher label ([data-loc-name]) and the
   * vertical-section type whenever a REAL store the merchant created is active
   * (a custom 'vXXX' venue). Account-level /api/me identity may drive those two
   * surfaces ONLY for the synthetic placeholders: the empty 'own' venue
   * synthesized at boot before /api/me resolves, and the operator's 'scoped'
   * God-mode view. On a MULTI-store account /api/me carries only the PRIMARY
   * store's business + type, so writing it over a selected custom store is what
   * flipped a merchant's restaurant view to the boutique — the switcher label
   * and sidebar section snapped to the boutique ~0.7s after load while the store
   * itself (and its team) stayed the restaurant. Returns true when the engine
   * owns the store → identity.js must NOT touch the label or the type. */
  function venueEngineOwnsStore() {
    try {
      var v = window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue();
      return !!v && v !== 'own' && v !== 'scoped';
    } catch (_) { return false; }
  }

  function apply(id) {
    var first = firstName(id.name);

    // Greeting — "Bonjour Rachid," (dashboard hero + lock copy, two elements).
    if (first) {
      var greets = document.querySelectorAll('[data-i18n="dash.hello"], .greet-text');
      for (var i = 0; i < greets.length; i++) setText(greets[i], 'Bonjour ' + first + ',');
      try { if (window.__kiwiLock && window.__kiwiLock.setGreetName) window.__kiwiLock.setGreetName(first); } catch (_) {}
    }

    // Business — greeting subtext always follows the account; the store-switcher
    // label ([data-loc-name]) only when a synthetic placeholder is active. Once a
    // real store is selected the venue engine owns that label — overwriting it
    // with the account's primary business is what desynced a multi-store switcher
    // (see venueEngineOwnsStore).
    if (id.business) {
      var sub = document.querySelector('[data-kiwi-greet-sub]');
      if (sub) sub.textContent = id.business + ' · service ouvert';
      if (!venueEngineOwnsStore()) {
        var locs = document.querySelectorAll('[data-loc-name]');
        for (var j = 0; j < locs.length; j++) locs[j].textContent = id.business;
      }
    }

    // Sidebar profile chip — the name the owner sees they're "connected as", + avatar.
    if (id.name) {
      setText(document.querySelector('.merchant .n'), id.name);
      var av = document.querySelector('.merchant .avatar');
      if (av) av.textContent = initialsOf(id.name);
    }
  }

  function isRealSession() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  }
  function venueLabel() {
    try {
      var vd = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData();
      if (vd && (vd.fullDisplay || vd.name)) return vd.fullDisplay || vd.name;
    } catch (_) {}
    return '';
  }

  /* A real (hosted) session with NO signed-in account still must never show the
   * demo identity ("Rachid Benhima" / "Café Atlas"). Drop the demo name from the
   * greetings (hero + entry flash) and show the venue label ("Mon établissement")
   * in the sidebar/subtext instead. Never runs on the local demo (isReal false). */
  function neutralize() {
    var biz = venueLabel();
    var greets = document.querySelectorAll('[data-i18n="dash.hello"], .greet-text, .kiwi-greet h1 > span:not(.em-clip)');
    for (var i = 0; i < greets.length; i++) { greets[i].textContent = 'Bonjour,'; if (greets[i].removeAttribute) greets[i].removeAttribute('data-i18n'); }
    var subs = document.querySelectorAll('[data-kiwi-greet-sub], .kiwi-greet-sub');
    for (var s = 0; s < subs.length; s++) subs[s].textContent = biz ? (biz + ' · service ouvert') : 'service ouvert';
    var nameEl = document.querySelector('.merchant .n');
    if (nameEl) nameEl.textContent = biz || 'Mon établissement';
    var av = document.querySelector('.merchant .avatar');
    if (av) av.textContent = initialsOf(biz) || '·';
  }
  function runNeutral() {
    var go = function () { if (isRealSession()) neutralize(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
    setTimeout(go, 700);   // re-apply after the venue engine + entry-flash render
  }

  // Make the server-stored business type authoritative for a real merchant's OWN
  // dashboard. init() synthesizes the empty "own" venue at boot — BEFORE /api/me
  // resolves — so it can't know the trade yet and defaults to 'restaurant'. Once
  // identity resolves, push the real type into the venue engine so a boutique is
  // never rendered as a restaurant (P6/P7). Retried after the async venue render.
  function applyOwnType(type) {
    if (!type) return;
    var go = function () {
      // Only the synthetic 'own' boot placeholder (or a 'scoped' operator view)
      // may take its type from the ACCOUNT. A real selected store owns its type:
      // a multi-store account's me.type is only the PRIMARY store, and pushing it
      // here flipped the active store's sidebar section ~0.7s after load (a
      // selected restaurant rendered the boutique section). See venueEngineOwnsStore.
      if (venueEngineOwnsStore()) return;
      try { if (window.KiwiVenue && window.KiwiVenue.applyServerType) window.KiwiVenue.applyServerType(type); } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
    setTimeout(go, 750);
  }

  // Drive the venue engine so the switcher/header show the scoped client, not the
  // operator's own local venues. Retried alongside the DOM patch for async nav.
  function applyScopedVenue(label, type) {
    try {
      if (window.KiwiVenue && window.KiwiVenue.applyScopedVenue) {
        window.KiwiVenue.applyScopedVenue({ name: label, type: type || '' });
      }
    } catch (_) {}
  }

  function run(id, scoped, label, type) {
    var go = function () {
      // In a God-mode scoped view, take over the venue FIRST so the switcher and
      // header render the client; then patch identity on top.
      if (scoped) applyScopedVenue(label, type);
      apply(id);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
    // Re-apply once after the venue engine finishes its async render (it rewrites
    // the location label / chip), so our real identity wins the last word.
    setTimeout(go, 700);
  }

  // "kandisky-boutique" → "Kandisky Boutique" — a readable fallback label when an
  // operator scopes into a slug that has no account row yet.
  function prettifySlug(slug) {
    return String(slug || '').split('-').filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  // A scoped view is an operator opening a client (?op / ?merchant). Compute the
  // merchant slug the same way merchant-config.js does, so /api/me can resolve the
  // client server-side (the query param alone grants nothing — the operator cookie
  // does). Empty string ⇒ a plain, non-scoped load (a real client on their own).
  function scopedMerchant() {
    try {
      var p = new URLSearchParams(location.search);
      var m = p.get('merchant');
      if (m) return m;
      if (p.has('op')) { try { return localStorage.getItem('kiwiLiveMerchant') || ''; } catch (_) { return ''; } }
    } catch (_) {}
    return '';
  }

  var slug = scopedMerchant();
  var meUrl = '/api/me' + (slug ? '?merchant=' + encodeURIComponent(slug) : '');

  // Neutralize the demo identity up front on any REAL session — this must not
  // depend on /api/me resolving (offline, missing endpoint, or a service worker
  // that stalls the request would otherwise leave "Rachid / Café Atlas" showing).
  // Idempotent: if a real account or operator scope resolves below, apply()
  // overwrites these with the real identity. Local demo → isReal false → no-op.
  runNeutral();

  fetch(meUrl, { headers: { Accept: 'application/json' } })
    .then(function (r) {
      if (r && r.ok) return r.json();
      // 404 = this host simply has no API (a static mirror). Everything else —
      // 500 from a database blip, 503 not-configured — means there IS a backend
      // and it failed to answer. Callers treat those very differently: the first
      // is "no account system here", the second is "we do not know yet", and
      // only the first may fall back to local guesses.
      return { __httpFail: (r && r.status) || 0 };
    })
    .then(function (me) {
      if (!me || me.__httpFail != null) {
        settle(me && me.__httpFail === 404
          ? { authenticated: false, noBackend: true }
          : { authenticated: false, unreachable: true });
        runNeutral(); return;
      }

      // Operator (God mode) scoped into a client. Show that client — its real
      // identity if an account exists, else the slug as a readable label — and
      // hand the venue engine a single scoped venue so the operator's own local
      // venues never appear. Crucially, do NOT write the client's name into the
      // localStorage keys account.js reads: that store belongs to THIS browser's
      // owner, and polluting it would leak the client into the operator's own view.
      if (me.operator) {
        var label = (me.business || '').trim() || (me.name || '').trim() || prettifySlug(me.slug || slug);
        var opId = {
          name: (me.name || '').trim() || label,
          business: (me.business || '').trim() || label,
          email: (me.email || '').trim(),
          type: (me.type || '').trim(),
        };
        window.KiwiMe = opId;
        // An operator looking at somebody else's shop is never doing their own
        // setup — the wizard must not open in their face (test G).
        settle({ authenticated: !!me.authenticated, operator: true, onboarded: true, stores: [] });
        run(opId, true, label, (me.type || '').trim());
        return;
      }

      // A real merchant on their own device.
      if (!me.authenticated) { settle({ authenticated: false }); runNeutral(); return; }   // hosted-no-account → neutral, not demo; local demo → isReal false, untouched
      // Isolate accounts: if a DIFFERENT account previously used this browser,
      // purge its tenant state now so foreign stores / PINs / sales can't leak in.
      var purged = reconcileAccount(me);
      var id = {
        name: (me.name || '').trim(),
        business: (me.business || '').trim(),
        email: (me.email || '').trim(),
        type: (me.type || '').trim(),
      };
      // Feed the keys the rest of the app already reads (account.js reads
      // kiwiSet:*, onboarding/personalize read kiwiOwnerName/kiwiBizName).
      if (id.name) { ls('kiwiOwnerName', id.name); ls('kiwiSet:ownerName', id.name); }
      if (id.business) { ls('kiwiBizName', id.business); }
      if (id.email) { ls('kiwiSet:ownerEmail', id.email); ls('kiwiOwnerEmail', id.email); }
      window.KiwiMe = id;
      if (purged) {
        // We wiped a different account's local state → reload so the venue engine,
        // onboarding gate and caisse re-initialise clean for THIS account. The new
        // kiwiAccountKey is already written, so this reload cannot loop.
        // `reloading` keeps the wizard shut in the meantime: this page is already
        // leaving, and the flag it would have read has just been purged.
        settle({ authenticated: true, reloading: true });
        try { location.reload(); } catch (_) {}
        return;
      }
      // Server-authoritative answer to "does this account already have a
      // business?" — the whole point of the gate. `onboarded` is only ever
      // trusted when the server actually said so.
      settle({
        authenticated: true,
        onboarded: me.onboarded === true,
        stores: Array.isArray(me.stores) ? me.stores : [],
      });
      // Put this merchant's real établissements back on a browser that has none
      // (new device, cleared data). No-op when they already have their stores
      // here — see KiwiVenue.adoptServerStores.
      if (Array.isArray(me.stores) && me.stores.length) {
        try {
          if (window.KiwiVenue && window.KiwiVenue.adoptServerStores) window.KiwiVenue.adoptServerStores(me.stores);
        } catch (_) {}
      }
      run(id, false);
      applyOwnType(id.type);   // boutique renders as boutique, not restaurant (F3)
    })
    .catch(function () {
      /* offline / missing endpoint → keep the demo locally, but a real (hosted) session still gets neutralized */
      settle({ authenticated: false, unreachable: true });
      runNeutral();
    });
})();
