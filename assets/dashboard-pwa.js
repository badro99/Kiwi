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
  function markStandalone() {
    if (isStandalone() && document.body) document.body.classList.add('standalone');
  }
  if (document.readyState !== 'loading') markStandalone();
  else document.addEventListener('DOMContentLoaded', markStandalone);

  // Register the shared root service worker.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/kiwi-sw.js?v=216').then(function (reg) {
        if (window.KiwiPWAUpdate) window.KiwiPWAUpdate.watch(reg);
      }).catch(function () {});
    });
  }

  // Install affordance — lives in the sidebar instead of floating over cards.
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; renderInstallCard();
  });

  var COPY = {
    fr: {
      eyebrow: 'APPLICATION KIWI', title: 'Kiwi, toujours à portée de main.',
      body: 'Installez votre tableau de bord pour un accès rapide, même avec une connexion instable.',
      quick: 'Accès rapide', offline: 'Prêt hors ligne', install: 'Installer Kiwi',
      installed: 'Kiwi est installée', hint: 'Ouvrez le menu du navigateur puis choisissez « Installer Kiwi ».'
    },
    en: {
      eyebrow: 'KIWI APP', title: 'Kiwi, always within reach.',
      body: 'Install your dashboard for faster access, even when your connection is unreliable.',
      quick: 'Quick access', offline: 'Offline ready', install: 'Install Kiwi',
      installed: 'Kiwi is installed', hint: 'Open your browser menu and choose “Install Kiwi”.'
    },
    ar: {
      eyebrow: 'تطبيق KIWI', title: 'Kiwi في متناول يدك دائماً.',
      body: 'ثبّت لوحة التحكم للوصول السريع حتى عندما يكون الاتصال غير مستقر.',
      quick: 'وصول سريع', offline: 'يعمل دون اتصال', install: 'تثبيت Kiwi',
      installed: 'تم تثبيت Kiwi', hint: 'افتح قائمة المتصفح ثم اختر «تثبيت Kiwi».'
    }
  };

  function language() {
    var l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang();
    return l === 'en' || l === 'ar' ? l : 'fr';
  }

  function renderInstallCard() {
    var wrap = document.querySelector('[data-upsell]');
    if (!wrap) return;
    var c = COPY[language()] || COPY.fr;
    var installed = isStandalone();
    wrap.className = 'upsell kiwi-app-install-card' + (installed ? ' is-installed' : '');
    wrap.innerHTML =
      '<div class="kiwi-install-head"><span class="kiwi-install-mark" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none"><path d="M4 3v12c0 3.3 2.7 6 6 6h10l-6-6H9V8L4 3z" fill="currentColor"/>' +
        '<path d="M10 15h4l6 6h-7c-1.7 0-3-1.3-3-3v-3z" fill="currentColor" opacity=".48"/></svg>' +
      '</span><span class="t">' + c.eyebrow + '</span></div>' +
      '<h4>' + c.title + '</h4>' +
      '<p>' + c.body + '</p>' +
      '<div class="kiwi-install-benefits"><span><i></i>' + c.quick + '</span><span><i></i>' + c.offline + '</span></div>' +
      '<button type="button" data-pwa-install' + (installed ? ' disabled' : '') + '>' +
        (installed
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/></svg>') +
        '<span>' + (installed ? c.installed : c.install) + '</span>' +
      '</button>';
  }

  function install() {
    if (isStandalone()) return;
    if (!deferred) {
      window.alert((COPY[language()] || COPY.fr).hint);
      return;
    }
    deferred.prompt();
    deferred.userChoice.finally(function () {
      deferred = null;
      renderInstallCard();
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-pwa-install]')) return;
    install();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    if (document.body) document.body.classList.add('standalone');
    renderInstallCard();
  });

  function bindVenue() {
    if (!window.KiwiVenue || typeof window.KiwiVenue.subscribe !== 'function') {
      setTimeout(bindVenue, 40);
      return;
    }
    window.KiwiVenue.subscribe(renderInstallCard);
    renderInstallCard();
  }
  window.addEventListener('kiwi:langchange', renderInstallCard);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindVenue);
  else bindVenue();

  window.KiwiPWAInstall = { install: install, render: renderInstallCard, isStandalone: isStandalone };

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
