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

  var cfg = { features: {}, pins: [], type: '', loaded: false, apply: applyFeatures, syncPins: syncPins, syncType: syncType };
  window.KiwiConfig = cfg;

  /* Push this merchant's business type (onboarding kiwiBizType) up to the server
   * so the operator console shows the RIGHT module set (a boutique gets boutique
   * modules, not restaurant ones). Same contract as syncPins: server derives the
   * merchant from the session, we only send the type. Fire-and-forget + fail-safe. */
  function syncType(type) {
    if (!type) return Promise.resolve(false);
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ type: String(type) }),
    }).then(function (r) { return !!(r && r.ok); }).catch(function () { return false; });
  }

  /* Push this merchant's own staff PINs up to the server so the operator console
   * (God mode) can see and manage them. The server derives the merchant from the
   * session — we never send a slug. Fire-and-forget + fail-safe: on a static host
   * (GitHub Pages, local) or offline the POST just fails and nothing changes.
   * `pins` is the client's local shape [{ role, name, code }]. */
  function syncPins(pins) {
    if (!Array.isArray(pins)) return Promise.resolve(false);
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pins: pins }),
    }).then(function (r) {
      if (r && r.ok) { cfg.loaded = true; try { return r.json().then(function (d) { if (d && Array.isArray(d.pins)) cfg.pins = d.pins; return true; }).catch(function () { return true; }); } catch (_) { return true; } }
      return false;
    }).catch(function () { return false; });
  }

  function applyFeatures() {
    var features = cfg.features || {};
    if (!document.body) return;
    Object.keys(features).forEach(function (key) {
      if (features[key] === false) {
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
    if (!cfg.type || !isScoped()) return;
    try { if (window.KiwiVenue && window.KiwiVenue.applyServerType) window.KiwiVenue.applyServerType(cfg.type); } catch (_) {}
  }

  // Where to read config from. An operator (God mode, ?op/?merchant) reads a
  // specific client by slug. A real merchant on their OWN dashboard reads WITHOUT
  // a slug so the server derives it from the session cookie — never from a stale
  // kiwiLiveMerchant a previous account left in this browser (that mismatch is
  // what made the lock validate against another merchant's PINs → "code
  // incorrect"). A paired caisse/serveur has no account session, so it keeps
  // passing its paired slug explicitly.
  function onDashboard() { try { return /\/dashboard(?:\.html)?$/.test(location.pathname); } catch (_) { return false; } }
  function configUrl() {
    if (isScoped()) return '/api/config?merchant=' + encodeURIComponent(merchant());
    if (onDashboard()) return '/api/config';
    return '/api/config?merchant=' + encodeURIComponent(merchant());
  }

  function fetchConfig() {
    fetch(configUrl(), { headers: { Accept: 'application/json' } })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (data) {
        if (!data) return;                     // no backend → keep defaults
        cfg.features = data.features || {};
        cfg.pins = Array.isArray(data.pins) ? data.pins : [];
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fetchConfig);
  else fetchConfig();
})();
