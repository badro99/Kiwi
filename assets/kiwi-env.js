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
  var demosAllowed = local && (forced !== false);

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
      try { return !demosAllowed || !!window.KiwiMe; } catch (_) { return !demosAllowed; }
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
