/* Keep the existing recovery list reachable at the point of failure. */
(function () {
  'use strict';
  function tr(text) { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(text) : text; }
  var localCount = 0, relayCount = 0;
  /* A failed receipt is its own entry, not part of the relay count. Failures are tracked by receipt identity
     (meta.ref; '' when unknown): printing the next customer's receipt must not hide this customer's unprinted one,
     and reprinting THIS receipt clears only its own entry. */
  var receiptFailed = new Set();
  function paint() {
    var count = localCount + relayCount + receiptFailed.size;
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
    var ok = !!(event.detail && event.detail.ok), id = String(event.detail && event.detail.id || '');
    if (!ok) receiptFailed.add(id);
    else if (receiptFailed.has(id)) receiptFailed.delete(id);
    else return;
    paint();
  });
})();
