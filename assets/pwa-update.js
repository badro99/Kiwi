/* Kiwi — safe update notice for long-lived dashboard, caisse and Serveur tabs.
 * A new worker may control the app, but JavaScript already running in an open
 * service cannot replace itself. Never force-reload during a payment: announce
 * the update and let the operator refresh at a safe moment. */
(function () {
  'use strict';

  var shown = false;
  function show() {
    if (shown || document.getElementById('kiwi-update-ready')) return;
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
    button.addEventListener('click', function () {
      button.disabled = true;
      button.style.opacity = '.65';
      window.location.reload();
    });
    (document.body || document.documentElement).appendChild(button);
  }

  function watch(registration) {
    if (!registration || !navigator.serviceWorker) return;
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
