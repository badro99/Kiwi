/* Keep the existing recovery list reachable at the point of failure. */
(function () {
  'use strict';
  function tr(text) { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(text) : text; }
  var localCount = 0, relayCount = 0;
  /* A failed receipt is its own entry, not part of the relay count: a later
     printed receipt must be able to clear it without hiding real relay jobs. */
  var receiptFailed = false;
  function paint() {
    var count = localCount + relayCount + (receiptFailed ? 1 : 0);
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
  /* Le résultat vient de receipt.js en donnée ({ ok }), pas du texte d'un toast : un changement de
     libellé ou de langue ne casse plus l'entrée. */
  window.addEventListener('kiwi:receipt-print', function (event) {
    var ok = !!(event.detail && event.detail.ok);
    if (!ok) receiptFailed = true;
    else if (receiptFailed) receiptFailed = false;
    else return;
    paint();
  });
})();
