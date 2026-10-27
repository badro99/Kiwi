
  function isPaired() { return ls('kiwiPaired') === '1'; }
  function pairedVenue() { try { return JSON.parse(ls('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  /* Tenant data leaves with the pairing; hardware identity stays with the
     physical till. Implemented once in assets/pairing-commit.js — the kitchen
     screen pairs through the same door and must purge the same way. */
  function purgeTenantData() {
    var commit = window.KiwiPairingCommit;
    if (commit && commit.purgeTenantData) commit.purgeTenantData();
  }

  // Same-device hand-off: the dashboard opens kiwi-caisse.html?pair=1 in this
  // browser, having named the store in kiwiPairHandoff (caisse-link.js handOff).
  function wantsPair() { try { return /[?&]pair=1\b/.test(location.search || ''); } catch (_) { return false; } }
  function wantsOperatorAccess() { try { return /[?&]op=1\b/.test(location.search || ''); } catch (_) { return false; } }
  /* Read and CONSUME the hand-off. Consuming it matters: it is a one-shot
   * instruction from a specific click, and leaving it behind would re-bind the
   * device on some later unrelated visit. Stale ones are ignored — a record older
   * than a few minutes is a leftover, not an intent. */
  var HANDOFF = 'kiwiPairHandoff';
  function takeHandoff() {
    var raw = ls(HANDOFF);
    if (!raw) return null;
    del(HANDOFF);
    try {
      var h = JSON.parse(raw);
      if (!h || !h.merchant) return null;
      if (h.ts && (Date.now() - h.ts) > 10 * 60 * 1000) return null;
      return h;
    } catch (_) { return null; }
  }
  /* The register freezes "demo or real" when it mounts (kiwi-caisse.html
   * IS_DEMO, pos-boutique.js likewise) — on purpose, so a pairing mid-service
   * never rewrites a half-served menu. But the same-device hand-off pairs
   * DURING boot, after that freeze: a real café's till opened on the 35-dish
   * demo menu at invented prices, and would ring them up. Nothing has been
   * served yet at this point, so put the hand-off back and reload once; the
   * second boot mounts as the real store and runs the hand-off normally
   * (operator mode and the till-cookie repair included). The session flag
   * makes a loop impossible even if pairing somehow failed to stick. */
  var HANDOFF_RELOAD = 'kiwiHandoffReload';
  function reloadAsPaired(h) {
    if (window.__kiwiCaisseBootedAsDemo !== true || !isPaired()) return false;
    try {
      if (sessionStorage.getItem(HANDOFF_RELOAD) === '1') return false;
      sessionStorage.setItem(HANDOFF_RELOAD, '1');
    } catch (_) { return false; }
    set(HANDOFF, JSON.stringify(Object.assign({}, h, { ts: Date.now() })));
    try { location.reload(); } catch (_) { return false; }
    return true;
  }
  function newestPending() {
    var m = readMap(), now = Date.now(), best = null, bestT = -1;
    for (var c in m) { var e = m[c]; if (e && e.status === 'pending' && (!e.exp || e.exp > now)) { var t = e.createdAt || 0; if (t >= bestT) { bestT = t; best = c; } } }
    return best;
  }

  /* ── type/subtype → caisse vertical ─────────────────────────────────────
   * The onboarding trade id (subtype) maps 1:1 to a dispatcher vertical for
   * most trades; a couple are aliased. Operator and server hand-offs carry the
   * exact trade in `type` (and often no `subtype`), so both fields must pass
   * through the same registry lookup before the four base-type fallbacks.
   * restaurant/cafe → the main restaurant caisse (unlockApp), not a vertical. */
  var SUB_ALIAS = { bakery: 'boulangerie', sport: 'gym' };
  function registryIds() {
    var reg = (window.KiwiPosDispatch && window.KiwiPosDispatch.registry) || {};
    var ids = {};
    Object.keys(reg).forEach(function (pin) { ids[reg[pin].id] = true; });
    return ids;
  }
  function routeFor(v) {
    if (!v) return { kind: 'app' };
    var ids = registryIds();
    var sub = String(v.subtype || '').toLowerCase();
    sub = SUB_ALIAS[sub] || sub;
    if (sub && ids[sub]) return { kind: 'vertical', id: sub };
    var t = String(v.type || '').toLowerCase();
    t = SUB_ALIAS[t] || t;
    if (t && ids[t]) return { kind: 'vertical', id: t };
    if (t === 'boutique' && ids.boutique) return { kind: 'vertical', id: 'boutique' };
    if (t === 'spa' && ids.spa) return { kind: 'vertical', id: 'spa' };
    if (t === 'hotel' && ids.hotel) return { kind: 'vertical', id: 'hotel' };
    return { kind: 'app' };
  }

  function bootVertical(v) {
    var gate = document.getElementById('till-boot-gate');
    if (gate) gate.remove();
    hidePad();
    hideNativePin();
    var lockScr = document.getElementById('cp-pin-screen');
    if (lockScr) lockScr.style.display = 'none';
    var route = routeFor(v);
    if (route.kind === 'vertical' && window.KiwiPosDispatch && window.KiwiPosDispatch.unlockById) {
      /* Ticket #0022 · the boutique venue key must not outlive a boutique
       * pairing: any other vertical clears it, or maison keeps reading and
       * writing the wrong store's stock through the stale key. */
      window.__kiwiPairedBoutiqueVenue = route.id === 'boutique' ? ((v && v.venueId) || null) : null;
      window.KiwiPosDispatch.unlockById(route.id);
    } else if (typeof window.__kiwiUnlockApp === 'function') {
      window.__kiwiUnlockApp();
    }
  }
