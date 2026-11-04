/* Keep the existing recovery list reachable at the point of failure. */
(function () {
  'use strict';
  function tr(text) { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(text) : text; }
  var localCount = 0, relayCount = 0;
  function paint() {
    var count = localCount + relayCount;
    var entry = document.getElementById('caisse-print-recovery');
    if (!count) { if (entry) entry.remove(); return; }
    if (!entry) {
      entry = document.createElement('button');
      entry.id = 'caisse-print-recovery'; entry.type = 'button'; entry.className = 'toast is-warn'; entry.style.pointerEvents = 'auto';
      entry.addEventListener('click', function () {
        if (window.KiwiPrinter) window.KiwiPrinter.openSetup({ kind: 'recovery' });
      });
      (document.getElementById('toast-stack') || document.body).appendChild(entry);
    }
    entry.textContent = tr('Voir les tickets non imprimés') + ' (' + count + ')';
  }
  if (window.KiwiCaisseLang && window.KiwiCaisseLang.subscribe) window.KiwiCaisseLang.subscribe(paint);
  window.addEventListener('kiwi:kitchen-print-unprinted', function (event) { relayCount = Number(event.detail && event.detail.count) || 0; paint(); });
  window.addEventListener('kiwi:kitchen-print-recovery', function (event) { localCount = Number(event.detail && event.detail.recoverable) || 0; paint(); });
  window.addEventListener('kiwi:toast', function (event) {
    var title = String(event.detail && event.detail.title || '');
    if (title.indexOf(tr('Impression échouée')) >= 0 || title.indexOf(tr('Imprimante injoignable')) >= 0) { relayCount = Math.max(1, relayCount); paint(); }
  });
})();
