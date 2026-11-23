/* Kiwi · la caisse se met à jour toute seule, au bon moment.
 *
 * Une caisse de comptoir reste ouverte des jours. pwa-update.js trouve bien la
 * nouvelle version (toutes les 30 min) et pose la pastille « Nouvelle version
 * prête · Rafraîchir », mais personne ne la touche : le 23 novembre la tablette
 * de Santos refusait encore « Vendre quand même » une heure après sa mise en
 * ligne. Le patron a demandé que la caisse recharge seule (owner, 23 Nov 2026).
 *
 * Elle ne recharge QUE quand rien n'est en cours :
 *   · une nouvelle version est prête (KiwiPWAUpdate.readySince()),
 *   · aucun geste depuis IDLE_MS (ou LONG_IDLE_MS si le métier ouvert ne sait
 *     pas dire si un ticket est en cours), jamais si le métier dit « occupé »,
 *   · aucune fenêtre, feuille ou voile ouvert, aucun champ en saisie,
 *   · pas déjà rechargée par ici depuis GUARD_MS (garde anti-boucle).
 * Le métier dit s'il est libre par `idle()` dans sa fiche KiwiPosDispatch
 * (boutique, maison) ; la caisse sauvegarde déjà son service sur beforeunload.
 * Tant qu'elle attend sans geste, elle demande aussi une nouvelle version
 * toutes les CHECK_MS, pour qu'une mise en ligne arrive en minutes, pas en
 * demi-heures. Pure logique dans `decide()`, vérifiée par
 * tools/till-auto-update-test.mjs. */
(function () {
  'use strict';
  var IDLE_MS = 90 * 1000;
  var LONG_IDLE_MS = 15 * 60 * 1000;
  var GUARD_MS = 10 * 60 * 1000;
  var CHECK_MS = 10 * 60 * 1000;
  var TICK_MS = 20 * 1000;
  var KEY = 'kiwiTillAutoUpdateAt';

  /* La règle, sans DOM : { ready, readyAgeMs, idleMs, busyUi, tillIdle (true |
     false | null), online, sinceLastAutoMs } → 'reload' ou la raison d'attendre. */
  function decide(s) {
    if (!s.ready) return 'no-update';
    if (s.readyAgeMs < 5000) return 'settling';
    if (!s.online) return 'offline';
    if (s.sinceLastAutoMs < GUARD_MS) return 'guard';
    if (s.busyUi) return 'ui-busy';
    if (s.tillIdle === false) return 'sale-in-progress';
    var need = s.tillIdle === true ? IDLE_MS : LONG_IDLE_MS;
    if (s.idleMs < need) return 'recent-activity';
    return 'reload';
  }

  var lastGesture = Date.now();
  var lastCheck = Date.now();
  ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'].forEach(function (ev) {
    try { window.addEventListener(ev, function () { lastGesture = Date.now(); }, { capture: true, passive: true }); } catch (_) {}
  });

  function visible(el) {
    if (!el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none';
  }
  /* Une fenêtre ouverte, un voile de paiement, une feuille d'article, ou un
     champ en cours de saisie : quelqu'un fait quelque chose. */
  function busyUi() {
    var a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
    var list = document.querySelectorAll('.kiwi-backdrop, [aria-modal="true"], dialog[open], .is-open');
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return true;
    return false;
  }
  function tillIdle() {
    try {
      var d = window.KiwiPosDispatch;
      if (d && typeof d.idle === 'function') return d.idle();
    } catch (_) { return false; }
    return null;
  }
  function lastAuto() {
    try { return Number(sessionStorage.getItem(KEY) || 0); } catch (_) { return Date.now(); }
  }

  function state() {
    var U = window.KiwiPWAUpdate;
    var since = 0;
    try { since = (U && U.readySince && Number(U.readySince())) || 0; } catch (_) {}
    var now = Date.now();
    return {
      ready: since > 0,
      readyAgeMs: now - since,
      idleMs: now - lastGesture,
      busyUi: busyUi(),
      tillIdle: tillIdle(),
      online: navigator.onLine !== false,
      sinceLastAutoMs: now - lastAuto(),
    };
  }

  function tick() {
    var s = state();
    var why = decide(s);
    if (why === 'no-update') {
      /* Sans geste depuis un moment, on va chercher la version nous-mêmes. */
      var U = window.KiwiPWAUpdate;
      if (U && U.check && s.idleMs >= IDLE_MS && Date.now() - lastCheck >= CHECK_MS) {
        lastCheck = Date.now();
        try { U.check(); } catch (_) {}
      }
      return why;
    }
    if (why !== 'reload') return why;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch (_) { return 'guard'; }
    try { sessionStorage.setItem('kiwiSwRefreshedAt', String(Date.now())); } catch (_) {}
    window.location.reload();
    return why;
  }

  window.KiwiTillAutoUpdate = { decide: decide, tick: tick, state: state,
    IDLE_MS: IDLE_MS, LONG_IDLE_MS: LONG_IDLE_MS, GUARD_MS: GUARD_MS };
  /* L'app native embarque sa version (pas de service worker) : rien à faire. */
  if (!('serviceWorker' in navigator)) return;
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return;
  setInterval(tick, TICK_MS);
})();
