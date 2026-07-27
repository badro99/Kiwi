/* Kiwi Caisse — PWA registration, install affordance, offline reflection. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/kiwi-sw.js').then(function (reg) {
        if (window.KiwiPWAUpdate) window.KiwiPWAUpdate.watch(reg);
      }).catch(function () {});
    });
  }

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    showInstall();
  });

  function showInstall() {
    if (document.getElementById('kiwi-install')) return;
    var b = document.createElement('button');
    b.id = 'kiwi-install';
    b.textContent = 'Installer la caisse';
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9998;padding:12px 18px;' +
      'border:0;border-radius:12px;background:#0B6E4F;color:#F7F5F0;font:600 14px/1 "Inter Tight",system-ui;' +
      'box-shadow:0 8px 24px -8px rgba(11,110,79,.5);cursor:pointer';
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

  // Offline/online + real server queue reflection — visible enough to act on.
  function status() {
    var d = document.getElementById('kiwi-net') || (function () {
      var s = document.createElement('div'); s.id = 'kiwi-net';
      s.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9998;padding:7px 10px;border-radius:999px;' +
        'font:600 11px/1.2 system-ui;color:white;box-shadow:0 4px 14px rgba(0,0,0,.18);pointer-events:none';
      document.body.appendChild(s); return s;
    })();
    var q = { pending: 0, blocked: 0, storageError: false };
    try { if (window.KiwiLive?.queueStatus) q = window.KiwiLive.queueStatus(); } catch (_) {}
    if (q.storageError || q.blocked) {
      d.style.background = '#9F3028';
      d.textContent = q.storageError ? 'Stockage ventes saturé · support requis' : q.blocked + ' vente bloquée · support requis';
    } else if (!navigator.onLine) {
      d.style.background = '#B85245';
      d.textContent = 'Hors ligne' + (q.pending ? ' · ' + q.pending + ' vente(s) en attente' : '');
    } else if (q.pending) {
      d.style.background = '#A56A16';
      d.textContent = q.pending + ' vente(s) à synchroniser';
    } else {
      d.style.background = '#287B55';
      d.textContent = 'En ligne · synchronisé';
    }
    d.title = d.textContent;
  }
  window.addEventListener('online', status);
  window.addEventListener('offline', status);
  window.addEventListener('kiwi:sale-queue', status);
  window.setInterval(status, 5000);

  /* The 14 vertical POS screens originally shipped a clickable "simulate
     outage" control backed by an in-memory boolean. In production that boolean
     did not follow navigator.onLine, so a real Wi-Fi loss still looked online
     to payment guards. Keep manual simulation for localhost demos only; on a
     real/paired till, drive every mounted vertical from the browser signal. */
  function realTill() {
    try {
      return !!window.KiwiEnv?.isReal?.() || !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return false; }
  }
  function netButtons() {
    return Array.prototype.slice.call(document.querySelectorAll('button[title="Simuler une coupure réseau"], button[data-kiwi-real-net]'));
  }
  function syncVerticalNetwork() {
    if (!realTill()) return;
    var shouldBeOffline = !navigator.onLine;
    netButtons().forEach(function (b) {
      b.dataset.kiwiRealNet = '1';
      b.title = shouldBeOffline ? 'Connexion indisponible' : 'Connexion active';
      b.setAttribute('aria-label', b.title);
      b.style.cursor = 'default';
      if (b.classList.contains('is-off') === shouldBeOffline) return;
      b.dataset.kiwiNetworkSync = '1';
      try { b.click(); } catch (_) {}
      delete b.dataset.kiwiNetworkSync;
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button[title="Simuler une coupure réseau"], button[data-kiwi-real-net]');
    if (!b || !realTill() || b.dataset.kiwiNetworkSync === '1') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    syncVerticalNetwork();
  }, true);
  window.addEventListener('online', syncVerticalNetwork);
  window.addEventListener('offline', syncVerticalNetwork);
  function watchVerticals() {
    syncVerticalNetwork();
    try { new MutationObserver(syncVerticalNetwork).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  }
  if (document.readyState !== 'loading') watchVerticals();
  else document.addEventListener('DOMContentLoaded', watchVerticals);

  window.KiwiNetworkState = { sync: syncVerticalNetwork, isRealTill: realTill };
  if (document.readyState !== 'loading') status();
  else document.addEventListener('DOMContentLoaded', status);
})();
