/* Kiwi — safe update notice for long-lived dashboard, caisse and Serveur tabs.
 * A new worker may control the app, but JavaScript already running in an open
 * service cannot replace itself. Never force-reload during a payment: announce
 * the update and let the operator refresh at a safe moment.
 *
 * Deux garde-fous d'expérience (2026-08) :
 *  · Premier chargement du jour : la mise à jour arrive dans les toutes
 *    premières secondes, avant le moindre geste de l'opérateur — on recharge
 *    en silence au lieu de lui demander de cliquer sur une page qu'il vient
 *    à peine d'ouvrir. Une seule fois par onglet, jamais après un geste.
 *  · « Rafraîchir » attend que le nouveau worker contrôle la page avant de
 *    recharger ; recharger trop tôt resservait l'ancien shell depuis le
 *    cache et l'avis revenait une deuxième fois. Un clic, un rechargement. */
(function () {
  'use strict';

  var shown = false;
  var reg = null;
  var interacted = false;
  var born = Date.now();

  /* Le moindre geste (toucher, clavier) marque la page comme « en cours
     d'usage » : plus aucun rechargement silencieux possible ensuite. */
  try {
    ['pointerdown', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function () { interacted = true; }, { capture: true, passive: true });
    });
  } catch (_) {}

  function markRefreshed() {
    try { sessionStorage.setItem('kiwiSwRefreshedAt', String(Date.now())); } catch (_) {}
  }
  /* Vrai dans les 10 s qui suivent un rechargement déclenché ici : les
     événements résiduels du worker ne doivent pas re-montrer l'avis. */
  function justRefreshed() {
    try { return (Date.now() - Number(sessionStorage.getItem('kiwiSwRefreshedAt') || 0)) < 10000; } catch (_) { return false; }
  }

  /* Recharge la page une fois le NOUVEAU worker aux commandes. Recharger
     avant la prise de contrôle ressort l'ancien shell — c'était la cause
     du double avis. Secours à 1,5 s si l'activation ne vient pas. */
  function refresh(button) {
    if (button) { button.disabled = true; button.style.opacity = '.65'; }
    var waiting = null;
    try { waiting = reg && reg.waiting; } catch (_) {}
    var done = false;
    function go() { if (done) return; done = true; markRefreshed(); window.location.reload(); }
    if (waiting && navigator.serviceWorker) {
      try { waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
      navigator.serviceWorker.addEventListener('controllerchange', go, { once: true });
      setTimeout(go, 1500);
    } else {
      go();
    }
  }

  /* Mise à jour invisible : page plus jeune que 45 s, jamais touchée, et pas
     déjà auto-rechargée dans cet onglet (garde anti-boucle). */
  function silentReload() {
    if (interacted || (Date.now() - born) > 45000) return false;
    try {
      if (sessionStorage.getItem('kiwiSwAutoReloaded')) return false;
      sessionStorage.setItem('kiwiSwAutoReloaded', '1');
    } catch (_) { return false; }
    refresh(null);
    return true;
  }

  function show() {
    if (shown || document.getElementById('kiwi-update-ready')) return;
    if (justRefreshed()) return;
    if (silentReload()) return;
    shown = true;
    var button = document.createElement('button');
    button.id = 'kiwi-update-ready';
    button.type = 'button';
    button.setAttribute('aria-label', 'Nouvelle version Kiwi prête. Rafraîchir maintenant.');
    button.innerHTML = '<span aria-hidden="true">↻</span><span>Nouvelle version prête</span><strong>Rafraîchir</strong>';
    button.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:max(18px,env(safe-area-inset-bottom))',
      'transform:translateX(-50%)', 'z-index:2147483000', 'display:flex',
      'align-items:center', 'gap:10px', 'max-width:calc(100vw - 32px)',
      'padding:12px 16px', 'border:1px solid rgba(125,242,176,.45)',
      'border-radius:999px', 'background:#053B2C', 'color:#F7F5F0',
      'box-shadow:0 14px 36px rgba(5,59,44,.32)',
      'font:600 14px/1.2 "Inter Tight",system-ui,sans-serif', 'cursor:pointer'
    ].join(';');
    var strong = button.querySelector('strong');
    if (strong) strong.style.cssText = 'color:#7DF2B0;font-weight:750';
    button.addEventListener('click', function () { refresh(button); });
    (document.body || document.documentElement).appendChild(button);
  }

  function watch(registration) {
    if (!registration || !navigator.serviceWorker) return;
    reg = registration;
    if (registration.waiting && navigator.serviceWorker.controller) show();
    registration.addEventListener('updatefound', function () {
      var worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) show();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', show, { once: true });
  }

  window.KiwiPWAUpdate = { watch: watch, show: show };
})();
