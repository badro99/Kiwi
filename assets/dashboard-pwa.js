/* Kiwi (owner app) — PWA registration, install affordance, offline banner,
 * standalone detection. Registers the shared root service worker (/kiwi-sw.js).
 * FR-only injected UI (matches caisse-pwa.js); no data-action / data-i18n. */
(function () {
  'use strict';

  // Standalone (installed) detection → body.standalone gates the native layer.
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }
  function markStandalone() { if (isStandalone() && document.body) document.body.classList.add('standalone'); }
  if (document.readyState !== 'loading') markStandalone();
  else document.addEventListener('DOMContentLoaded', markStandalone);

  // Register the shared root service worker.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/kiwi-sw.js').then(function (reg) {
        if (window.KiwiPWAUpdate) window.KiwiPWAUpdate.watch(reg);
      }).catch(function () {});
    });
  }

  // Install affordance — a branded button surfaced when the browser offers install.
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; showInstall();
  });
  function showInstall() {
    if (document.getElementById('kiwi-install') || !document.body) return;
    var b = document.createElement('button');
    b.id = 'kiwi-install';
    b.type = 'button';
    b.textContent = 'Installer Kiwi';
    b.style.cssText = 'position:fixed;right:16px;bottom:96px;z-index:9998;padding:12px 18px;' +
      'border:0;border-radius:12px;background:#0B6E4F;color:#F7F5F0;font:600 14px/1 "Inter Tight",system-ui;' +
      'box-shadow:0 10px 24px -16px rgba(10,15,13,.52);cursor:pointer';
    b.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; b.remove(); });
    });
    document.body.appendChild(b);
  }
  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('kiwi-install'); if (b) b.remove();
  });

  // Offline banner — honest "showing last-cached data" reflection (styled in
  // dashboard-native.css as #kiwi-offline).
  function banner() {
    var el = document.getElementById('kiwi-offline');
    if (navigator.onLine) { if (el) el.remove(); return; }
    if (el || !document.body) return;
    el = document.createElement('div');
    el.id = 'kiwi-offline';
    el.setAttribute('role', 'status');
    el.textContent = 'Hors ligne, données de la dernière synchronisation';
    document.body.appendChild(el);
  }
  window.addEventListener('online', banner);
  window.addEventListener('offline', banner);
  if (document.readyState !== 'loading') banner();
  else document.addEventListener('DOMContentLoaded', banner);
})();
