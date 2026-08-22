/* Kiwi · api-base.js — le seul endroit où l'app native apprend où vit l'API.
 *
 * Sur le web ce fichier n'est PAS chargé (aucune page ne le référence) ; même
 * chargé, il ne fait rien tant que window.KIWI_API_BASE est vide et que la page
 * ne tourne pas dans Capacitor. Dans l'app (docs/roadmaps/KIWI_APP_PLAN.md §1.4),
 * l'origine est capacitor://localhost (iOS) ou https://localhost (Android) :
 * `/api/…` et `/auth/…` n'existent pas là. Plutôt que d'éditer 118 sites d'appel,
 * tools/build-app-www.mjs injecte ce script EN PREMIER dans chaque page du
 * bundle, et il enveloppe les cinq portes de sortie du navigateur :
 *
 *   fetch · XMLHttpRequest · EventSource · WebSocket · navigator.sendBeacon
 *
 * plus les liens <a href="/auth/…"> (déconnexion), pour préfixer toute URL
 * relative `/api/…` ou `/auth/…` — et les URL absolues que certains modules
 * construisent à partir de location.host (assets/live-socket.js fabrique
 * ws://localhost/api/live/socket) — par window.KIWI_API_BASE.
 *
 * Aucun autre fichier ne doit savoir qu'il tourne dans une app ; s'il en a
 * besoin, il lit window.KiwiApiBase.native.
 *
 * Cookies : dans l'app, CapacitorHttp (capacitor.config.ts) fait passer fetch et
 * XHR par URLSession/OkHttp et leur pot à cookies natif, donc le cookie de
 * session HttpOnly est « same-site » de leur point de vue. EventSource et
 * WebSocket, eux, ne sont PAS interceptés par CapacitorHttp — c'est le point à
 * mesurer sur l'appareil (plan §1.4, point ouvert). On pose `credentials:
 * 'include'` / `withCredentials` partout où on réécrit, pour le cas d'un bundle
 * testé dans un navigateur de bureau contre un déploiement (CORS, voir
 * functions/_middleware.js, origines app). */
(function () {
  'use strict';
  var w = typeof window !== 'undefined' ? window : null;
  if (!w) return;

  function detectNative() {
    try {
      var c = w.Capacitor;
      return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
    } catch (_) { return false; }
  }

  var native = detectNative();
  var base = '';
  try { base = String(w.KIWI_API_BASE || '').trim(); } catch (_) {}
  if (!base && native) base = 'https://kiwi-os.com';
  base = base.replace(/\/+$/, '');
  var wsBase = base.replace(/^http/i, 'ws');

  // `/api/me`, `/auth/login`, `/api/sale?x=1` — mais pas `/apiary` ni `/authors`.
  var PATH = /^\/(?:api|auth)(?:\/|\?|#|$)/;
  // Ce qu'un module fabrique depuis location : ws://localhost/api/…,
  // https://localhost:8787/api/…, capacitor://localhost/auth/… (URL.href).
  var ABS = /^(wss?|https?|capacitor|ionic):\/\/localhost(?::\d+)?(\/(?:api|auth)(?:\/|\?|#|$)[^]*)$/i;

  function rewrite(u) {
    if (!base || typeof u !== 'string') return u;
    if (PATH.test(u)) return base + u;
    var m = ABS.exec(u);
    if (m) return (/^wss?$/i.test(m[1]) ? wsBase : base) + m[2];
    return u;
  }

  w.KiwiApiBase = {
    native: native,
    base: base,
    url: rewrite,
    rewrites: function (u) { return rewrite(u) !== u; }
  };

  if (!base) return; // web — no-op absolu

  /* fetch ------------------------------------------------------------------ */
  if (typeof w.fetch === 'function') {
    var nativeFetch = w.fetch;
    w.fetch = function kiwiFetch(input, init) {
      var target = input, changed = false;
      try {
        if (typeof input === 'string') {
          target = rewrite(input); changed = target !== input;
        } else if (typeof URL !== 'undefined' && input instanceof URL) {
          var href = rewrite(input.href); changed = href !== input.href; if (changed) target = href;
        } else if (input && typeof input.url === 'string') {
          var nu = rewrite(input.url);
          if (nu !== input.url) { target = new Request(nu, input); changed = true; }
        }
      } catch (_) { target = input; changed = false; }
      if (changed) {
        init = init ? Object.assign({}, init) : {};
        if (!init.credentials) init.credentials = 'include';
      }
      return nativeFetch.call(w, target, init);
    };
  }

  /* XMLHttpRequest (assets/platform-ops.js envoie les médias en XHR) --------- */
  var XHR = w.XMLHttpRequest;
  if (XHR && XHR.prototype && typeof XHR.prototype.open === 'function') {
    var nativeOpen = XHR.prototype.open;
    XHR.prototype.open = function kiwiOpen(method, url) {
      var args = Array.prototype.slice.call(arguments);
      try {
        var s = String(url), nu = rewrite(s);
        if (nu !== s) { args[1] = nu; this.__kiwiCrossSite = true; }
      } catch (_) {}
      var r = nativeOpen.apply(this, args);
      if (this.__kiwiCrossSite) { try { this.withCredentials = true; } catch (_) {} }
      return r;
    };
  }

  /* navigator.sendBeacon (assets/err-reporter.js → /api/error) -------------- */
  if (w.navigator && typeof w.navigator.sendBeacon === 'function') {
    var nativeBeacon = w.navigator.sendBeacon;
    try {
      w.navigator.sendBeacon = function kiwiBeacon(url, data) {
        var u; try { u = rewrite(String(url)); } catch (_) { u = url; }
        return nativeBeacon.call(w.navigator, u, data);
      };
    } catch (_) {}
  }

  /* EventSource --------------------------------------------------------------- */
  if (typeof w.EventSource === 'function') {
    var ES = w.EventSource;
    var KES = function EventSource(url, init) {
      var s = String(url), u = rewrite(s);
      if (u !== s) {
        init = init ? Object.assign({}, init) : {};
        if (init.withCredentials == null) init.withCredentials = true;
      }
      return init === undefined ? new ES(u) : new ES(u, init);
    };
    KES.prototype = ES.prototype;
    KES.CONNECTING = ES.CONNECTING; KES.OPEN = ES.OPEN; KES.CLOSED = ES.CLOSED;
    w.EventSource = KES;
  }

  /* WebSocket (assets/live-socket.js) ---------------------------------------- */
  if (typeof w.WebSocket === 'function') {
    var WS = w.WebSocket;
    var KWS = function WebSocket(url, protocols) {
      var u; try { u = rewrite(String(url)); } catch (_) { u = url; }
      return protocols === undefined ? new WS(u) : new WS(u, protocols);
    };
    KWS.prototype = WS.prototype;
    KWS.CONNECTING = WS.CONNECTING; KWS.OPEN = WS.OPEN; KWS.CLOSING = WS.CLOSING; KWS.CLOSED = WS.CLOSED;
    w.WebSocket = KWS;
  }

  /* Liens <a href="/auth/logout"> : une navigation vers capacitor://localhost/auth/…
   * tomberait sur un 404 du bundle. On fait l'appel en arrière-plan puis on
   * revient à l'écran d'accueil de l'app. Les liens /api/… (exports) s'ouvrent
   * en absolu. Capture, pour passer avant les délégations de clic des pages. */
  function closestAnchor(el) {
    while (el && el !== w.document) {
      if (el.tagName === 'A' && el.getAttribute && el.getAttribute('href')) return el;
      el = el.parentNode;
    }
    return null;
  }
  if (w.document && typeof w.document.addEventListener === 'function') {
    w.document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      var a = closestAnchor(e.target);
      if (!a) return;
      var href = a.getAttribute('href');
      if (!PATH.test(href)) return;
      e.preventDefault();
      if (/^\/auth\/logout(?:[?#]|$)/.test(href)) {
        var done = function () { try { w.location.replace('/'); } catch (_) {} };
        try {
          w.fetch(href, { credentials: 'include', redirect: 'manual' }).then(done, done);
        } catch (_) { done(); }
        return;
      }
      try { w.open(rewrite(href), '_blank'); } catch (_) {}
    }, true);
  }
})();
