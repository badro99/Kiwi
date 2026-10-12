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

  var COPY = {
    fr: { ready: 'Nouvelle version prête', go: 'Rafraîchir', aria: 'Nouvelle version de Kiwi prête. Rafraîchir maintenant.' },
    en: { ready: 'New version ready', go: 'Refresh', aria: 'A new version of Kiwi is ready. Refresh now.' },
    ar: { ready: 'إصدار جديد جاهز', go: 'تحديث', aria: 'إصدار جديد من كيوي جاهز. حدّث الآن.' }
  };
  function copy() {
    var l = '';
    try { l = document.documentElement.lang || localStorage.getItem('kiwiLang') || ''; } catch (_) {}
    l = String(l || 'fr').slice(0, 2).toLowerCase();
    return COPY[l] || COPY.fr;
  }

  /* Material Symbols « refresh » (rounded, as the lucide shim draws it): the
     pill used a Unicode arrow character, which each platform drew its own way. */
  var REFRESH_ICON = '<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false" style="flex:none"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-70q0-17 11.5-28.5T760-800q17 0 28.5 11.5T800-760v200q0 17-11.5 28.5T760-520H560q-17 0-28.5-11.5T520-560q0-17 11.5-28.5T560-600h128q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q68 0 124.5-34.5T692-367q8-14 22.5-19.5t29.5-.5q16 5 23 21t-1 30q-41 80-117 128t-169 48Z"/></svg>';

  /* Is a modal, a sheet or the code screen showing? The pill sat at the very
     top of the stack, bottom-centre, over the footer of every modal: over
     « Ajouter le membre », and on the till over the buttons of its sheets.
     It now waits behind them and comes back when they close. The till keeps
     its dialogs in the page and toggles them, so presence is not enough:
     only one that is laid out, visible and clickable counts. */
  function dialogUp() {
    var list = document.querySelectorAll('.kiwi-backdrop, [aria-modal="true"], dialog[open]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el.getClientRects().length) continue;
      var cs = window.getComputedStyle(el);
      /* Not opacity: a backdrop is still fading in when it is first seen. */
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
      return true;
    }
    return false;
  }
  /* The dashboard's phone tab bar (mobile.css, up to 860 px) owns the bottom
     edge. Centred there, the pill sat on « Vendre », the button a merchant
     reaches for most, after every deploy until they refreshed. While a bar
     is showing, the pill rides 12 px above the whole bottom cluster: the
     bar, the day-report chip on its left and the activation pill on its
     right. The caisse, Serveur and the employee portal have no bar and
     keep the bottom edge. */
  var BASE_BOTTOM = 'max(18px,env(safe-area-inset-bottom))';
  function shows(el) {
    if (!el || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  function floorTop() {
    if (!shows(document.querySelector('.kw-tabbar'))) return 0;
    var top = 0, list = document.querySelectorAll('.kw-tabbar, .kcl-chip, .kiwi-entitlement-pill');
    for (var i = 0; i < list.length; i++) {
      if (!shows(list[i])) continue;
      var t = list[i].getBoundingClientRect().top;
      if (t > 0 && t < window.innerHeight && (!top || t < top)) top = t;
    }
    return top;
  }
  function keepClear(button) {
    var queued = false;
    function sync() {
      queued = false;
      var hide = dialogUp();
      button.style.opacity = hide ? '0' : '1';
      button.style.visibility = hide ? 'hidden' : 'visible';
      button.style.pointerEvents = hide ? 'none' : 'auto';
      if (hide) button.setAttribute('aria-hidden', 'true'); else button.removeAttribute('aria-hidden');
      var top = floorTop();
      button.style.bottom = top ? Math.max(18, Math.round(window.innerHeight - top + 12)) + 'px' : BASE_BOTTOM;
    }
    function queue() { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(sync); } }
    sync();
    try {
      new MutationObserver(queue).observe(document.body || document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-modal']
      });
    } catch (_) {}
    window.addEventListener('transitionend', queue, true);
    window.addEventListener('animationend', queue, true);
    window.addEventListener('resize', queue);
  }

  function show() {
    if (shown || document.getElementById('kiwi-update-ready')) return;
    if (justRefreshed()) return;
    if (silentReload()) return;
    shown = true;
    var button = document.createElement('button');
    button.id = 'kiwi-update-ready';
    button.type = 'button';
    /* In the operator's language (the page's own <html lang>, which the
       dashboard, the caisse and Serveur each set), and on one line: on a
       phone the French copy used to wrap into a three-line pill. */
    var t = copy();
    button.setAttribute('aria-label', t.aria);
    button.innerHTML = REFRESH_ICON + '<span style="white-space:nowrap">' + t.ready + '</span><strong style="white-space:nowrap">' + t.go + '</strong>';
    button.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:' + BASE_BOTTOM,
      'transform:translateX(-50%)', 'z-index:2147483000', 'display:flex',
      'align-items:center', 'gap:10px', 'max-width:calc(100vw - 32px)',
      'padding:12px 16px', 'border:1px solid rgba(125,242,176,.45)',
      'border-radius:999px', 'background:#053B2C', 'color:#F7F5F0',
      'box-shadow:0 14px 36px rgba(5,59,44,.32)',
      'font:600 14px/1.2 "Inter Tight",system-ui,sans-serif', 'cursor:pointer',
      'transition:opacity 160ms ease,visibility 160ms'
    ].join(';');
    var strong = button.querySelector('strong');
    if (strong) strong.style.cssText = 'color:#7DF2B0;font-weight:700;white-space:nowrap';
    button.addEventListener('click', function () { refresh(button); });
    (document.body || document.documentElement).appendChild(button);
    keepClear(button);
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
