/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ENV — window.KiwiEnv  (must load FIRST, before venues.js / app code)
 * ---------------------------------------------------------------------------
 * One runtime signal that separates the owner's LOCAL demo copy from the HOSTED
 * app real merchants use. The same repo serves both, so the switch is by
 * hostname:
 *   · local desktop  (file://, localhost, 127.0.0.1, *.local)  → demos ALLOWED
 *   · hosted (Cloudflare / GitHub Pages, any real domain)      → demos OFF
 *
 * On hosted, the demo venues (Café Atlas / Maison Mansour / Spa Bahia) and the
 * caisse demo verticals are hidden — a real signed-up merchant only ever sees
 * their own store. Locally, everything demos exactly as before.
 *
 * Airtight rule: a HOSTED domain can NEVER show a demo — not even with a forced
 * flag. Demos are a localhost-only affordance for pitching. The only override
 * that works is localStorage.kiwiDemos = '0', which forces demos OFF even on
 * localhost (to preview the real hosted experience locally). kiwiDemos = '1' is
 * honoured only when already local; it can never turn a real domain into a demo.
 * Later this tightens to the authenticated session once /api/me exists.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var h = '';
  try { h = (location.hostname || '').toLowerCase(); } catch (_) {}
  var local =
    (typeof location !== 'undefined' && location.protocol === 'file:') ||
    h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' ||
    h === '' || /\.local$/.test(h);

  var forced = null;
  try {
    var f = localStorage.getItem('kiwiDemos');
    if (f === '1') forced = true;
    else if (f === '0') forced = false;
  } catch (_) {}

  /* Hosted is never a demo, whatever the flag says. Local is a demo by default,
   * and only an explicit kiwiDemos='0' can turn it off. */
  // Capacitor's localhost is a transport origin, not permission to seed a
  // pitching tenant. A real paired till is also real before /api/me resolves.
  var native = false;
  try { native = !!(window.KiwiApiBase?.native || window.Capacitor?.isNativePlatform?.()); } catch (_) {}
  var demosAllowed = local && (forced !== false);
  function paired() {
    try { return localStorage.getItem('kiwiPaired') === '1'
      && !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null')?.merchant; } catch (_) { return false; }
  }

  window.KiwiEnv = {
    local: local,
    demosAllowed: demosAllowed,
    hosted: !demosAllowed,
    /* THE gate for demo-data leaks. True whenever the app must show REAL data,
     * never the built-in demo (Rachid / Café Atlas / fabricated legal IDs):
     *   · any hosted domain (demos are a localhost-only affordance), OR
     *   · a real signed-in merchant / operator-scoped client — both set
     *     window.KiwiMe (see assets/identity.js), which may be populated AFTER
     *     this file loads, so this is evaluated lazily at call time.
     * Every surface that renders identity/legal/named demo data should gate on
     * window.KiwiEnv.isReal() so the demo is preserved locally and never leaks. */
    isReal: function () {
      try { return !demosAllowed || !!window.KiwiMe || paired()
        || (native && !!localStorage.getItem('kiwiAccountKey')); } catch (_) { return !demosAllowed; }
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
 * FILET D'ERREURS — window.KiwiErrors
 * ---------------------------------------------------------------------------
 * L'application n'avait AUCUN gestionnaire global : ni window.onerror, ni
 * unhandledrejection. Une exception dans un rendu laissait donc un écran à
 * moitié dessiné, sans un mot, et le commerçant appelait pour dire « ça
 * marche plus » sans que personne puisse savoir quoi. Sur 585 blocs catch du
 * projet, 355 sont vides : le silence était la règle, pas l'exception.
 *
 * Ce filet ne CORRIGE rien — il garde une trace. Les vingt dernières erreurs
 * restent lisibles dans window.KiwiErrors.list(), avec le message, la source
 * et l'heure, pour que le support puisse demander une capture au lieu de
 * deviner. Rien n'est envoyé nulle part : pas de collecte à l'insu du
 * commerçant, et ça continue de fonctionner hors-ligne.
 *
 * Volontairement discret : on n'affiche pas de bandeau rouge à un commerçant en
 * plein service pour une icône qui n'a pas su se charger. La console garde le
 * détail complet ; le tampon garde l'historique.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MAX = 20;
  var buf = [];
  function push(kind, msg, src, line, err) {
    try {
      buf.push({
        at: new Date().toISOString(), kind: kind,
        msg: String(msg || '').slice(0, 300),
        src: String(src || '').split('/').pop().slice(0, 80),
        line: line || 0,
        stack: (err && err.stack ? String(err.stack).slice(0, 600) : ''),
      });
      if (buf.length > MAX) buf.shift();
    } catch (_) {}
  }
  window.addEventListener('error', function (e) {
    // Une ressource qui ne charge pas (image, script) remonte ici sans message :
    // on la note comme telle plutôt que d'enregistrer une ligne vide.
    if (e && e.target && e.target !== window && e.target.tagName) {
      push('resource', e.target.tagName + ' ' + (e.target.src || e.target.href || ''), '', 0, null);
      return;
    }
    push('error', e && e.message, e && e.filename, e && e.lineno, e && e.error);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    push('promise', (r && (r.message || r)) || 'rejet non traité', '', 0, r);
  });
  window.KiwiErrors = {
    list: function () { return buf.slice(); },
    clear: function () { buf.length = 0; },
    // Un bloc que le commerçant peut copier-coller au support.
    report: function () {
      return buf.map(function (e) {
        return e.at + '  [' + e.kind + '] ' + e.msg + (e.src ? '  (' + e.src + ':' + e.line + ')' : '');
      }).join('\n') || 'Aucune erreur enregistrée.';
    },
  };
})();

/* Shared read admission. Legacy timers may tick faster, but authenticated
 * reads cannot cross the network more often than the server's quiet budget.
 * Reject suppressed reads so callers keep their last good data, and so their
 * request deadlines and AbortSignals remain valid. Money writes bypass pacing. */
(function () {
  'use strict';
  if (!window.fetch || window.KiwiPoll) return;
  var original = window.fetch.bind(window), mode = 'live', reads = new Map(), bootRetries = new Set();
  var activeUntil = 0, refusedUntil = 0, discovered = false, configTicket = 0;
  function demo() {
    // A kitchen binding and the employee sign-in surface can be real before
    // owner identity or the full paired venue has been restored.
    try {
      if (localStorage.getItem('kiwiLiveMerchant') || localStorage.getItem('kiwiPaired') === '1'
          || /kiwi-serveur/.test(location.pathname)) return false;
    } catch (_) {}
    return !window.KiwiEnv.isReal();
  }
  function currentMode() { return demo() ? 'off' : Date.now() < activeUntil ? 'live' : mode; }
  function hint(value) {
    if ((value === 'live' || value === 'quiet') && mode !== value) {
      mode = value; document.dispatchEvent(new CustomEvent('kiwi:poll-mode'));
    }
  }
  function wake(event) {
    if (event && event.isTrusted === false) return;
    // A delayed quiet hint must not put an ongoing checkout or setup to sleep.
    activeUntil = Date.now() + 60000;
    if (mode === 'live' || demo()) return;
    mode = 'live'; reads.clear();
    document.dispatchEvent(new CustomEvent('kiwi:request-wake'));
  }
  window.KiwiPoll = { mode: currentMode, hint: hint,
    retryAfter: function () { return Math.max(0, refusedUntil - Date.now()); },
    delay: function (base) { return Math.max(base, refusedUntil - Date.now(), currentMode() === 'live' ? 0 : 600000); } };
  document.addEventListener('kiwi-paired', function () { refusedUntil = 0; reads.clear(); bootRetries.clear(); });
  ['pointerdown', 'keydown'].forEach(function (name) { document.addEventListener(name, wake, true); });
  ['kiwi:sale-paid', 'kiwi:order'].forEach(function (name) { window.addEventListener(name, function () { wake(); }); });
  window.fetch = function (input, options) {
    var url;
    try { url = new URL(typeof input === 'string' ? input : (input.url || String(input)), location.href); }
    catch (_) { return original(input, options); }
    var method = String((options && options.method) || (input && input.method) || 'GET').toUpperCase();
    var apiOrigin = location.origin;
    try { if (window.KiwiApiBase) apiOrigin = new URL(window.KiwiApiBase.url('/api/'), location.href).origin; } catch (_) {}
    if ((url.origin !== location.origin && url.origin !== apiOrigin) || !/^\/api\//.test(url.pathname)) return original(input, options);
    // One identity discovery lets a signed-in local merchant leave fixture mode.
    // It is a boot read, never a periodic exemption.
    if (demo() && url.pathname === '/api/me' && !discovered) {
      discovered = true; return original(input, options);
    }
    // Demo ledger timers never create or fetch merchant books. Authentication
    // and explicit operations still need the API, including on local origins.
    if (demo() && (url.pathname === '/api/feed' || url.pathname === '/api/store')) return Promise.reject(new Error('Local demo: API disabled'));
    // Job status and print lease reads belong to delivery of an existing job.
    var urgent = url.pathname === '/api/print/jobs'
      || (url.pathname === '/api/store' && url.searchParams.get('feature') === 'printhub');
    var identity = /^\/api\/(?:me|employee|auth)(?:\/|$)/.test(url.pathname);
    if (!identity && Date.now() < refusedUntil && !urgent) {
      return Promise.reject(new Error('Authentication retry paused for thirty minutes'));
    }
    // A refused action reports its own failure; it must not suspend unrelated
    // boot reads (onboarding may still be creating the merchant).
    if (method !== 'GET' || urgent) return original(input, options).then(function (response) {
      if (method !== 'GET' && response.ok) {
        refusedUntil = 0; reads.clear(); bootRetries.clear();
        wake();
      }
      return response;
    });
    var budgetUrl = new URL(url.href);
    ['since', 'cursor', 'after', 'changeFence', '_', 'ts'].forEach(function (name) { budgetUrl.searchParams.delete(name); });
    budgetUrl.searchParams.sort();
    var key = budgetUrl.href, last = reads.has(key) ? reads.get(key) : -Infinity;
    // A local card may retry one failed boot read, while explicit demo tours
    // and hidden tabs remain silent. This is not a periodic polling exemption.
    var bootRetry = demo() && !new URLSearchParams(location.search).has('demo')
      && bootRetries.has(key) && Date.now() - last < 5000;
    if (((document.hidden || (demo() && !bootRetry)) && reads.has(key)) || (!identity && Date.now() < refusedUntil)
        || (currentMode() === 'quiet' && Date.now() - last < 600000)) {
      var error = new Error('Read paused by device poll policy');
      error.name = 'PollPaused';
      return Promise.reject(error);
    }
    if (bootRetry) bootRetries.delete(key);
    reads.set(key, Date.now());
    var ticket = url.pathname === '/api/config' ? ++configTicket : 0;
    return original(input, options).then(function (response) {
      if (response.ok) bootRetries.delete(key);
      else if (demo() && !bootRetry) bootRetries.add(key);
      if (response.status === 401 && !/^\/api\/(?:me|employee|auth|config)(?:\/|$)/.test(url.pathname)) refusedUntil = Date.now() + 1800000;
      if (response.ok && (url.pathname === '/api/config' || url.pathname === '/api/me')) {
        response.clone().json().then(function (data) {
          if (!ticket || ticket === configTicket) hint(data.pollMode);
        }).catch(function () {});
      }
      return response;
    });
  };
})();
