/* Shared delivery of persistence notices, translated by the active surface. */
(function () {
  'use strict';
  var seen = new Set();
  var french = {
    'persist.promoConflict': 'Une modification de promotion a été remplacée par la version enregistrée sur un autre appareil.',
    'persist.orders': 'Commandes non enregistrées sur cet appareil. Gardez cette page ouverte.',
    'persist.archive': 'Archive non enregistrée sur cet appareil. Gardez cette page ouverte.'
  };
  window.addEventListener('kiwi:persistence-notice', function (event) {
    var detail = event.detail || {}, key = detail.key, identity = detail.edit || key;
    if (!french[key] || seen.has(identity)) return;
    seen.add(identity);
    var till = window.KiwiCaisseLang, dashboard = window.KiwiI18n;
    var message = till ? till.tr(french[key]) :
      (dashboard && dashboard.T[dashboard.getLang()][key]) || french[key];
    var notice = document.createElement('p');
    notice.className = 'px-note'; notice.setAttribute('role', 'status');
    notice.setAttribute('style', 'position:fixed;bottom:16px;left:16px;right:16px;z-index:10020;padding:16px;background:var(--paper);color:var(--ink);border:1px solid var(--n-200);border-radius:12px');
    notice.textContent = message; notice.onclick = function () { notice.remove(); };
    document.body.appendChild(notice);
  });
})();
