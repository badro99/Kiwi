/* Keep the existing recovery list reachable at the point of failure. */
(function () {
  'use strict';
  function tr(text) { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(text) : text; }
  var localCount = 0, relayCount = 0, relayIds = [], relayLabels = '', reprintNote = '', reprinting = false;
  /* A failed receipt is its own entry, not part of the relay count. Failures are tracked by receipt identity
     (meta.ref; '' when unknown): printing the next customer's receipt must not hide this customer's unprinted one,
     and reprinting THIS receipt clears only its own entry. */
  var receiptFailed = new Set();
  /* Un bon de cuisine qui n'est jamais sorti (Browse, 25 nov. 2026) : l'alerte nomme la table et porte
     « Réimprimer » sur place, sans passer par les réglages en plein service. « Voir » ouvre la liste complète. */
  function reprint() {
    var K = window.KiwiKitchenPrint;
    if (reprinting || !K || typeof K.reprintUnprinted !== 'function' || !relayIds.length) return;
    reprinting = true; reprintNote = ''; paint();
    K.reprintUnprinted(relayIds.slice()).then(function (r) {
      reprinting = false;
      if (r && r.ok) setTimeout(function () { if (!reprinting) { reprintNote = ''; paint(); } }, 8000);
      reprintNote = r && r.ok ? tr('Réimpression envoyée.')
        : r && r.why === 'relay-offline' ? tr('Le pont d’impression est hors ligne : allumez la tablette du pont, puis réessayez.')
        : tr('Réimpression non confirmée. Vérifiez la connexion et le pont, puis réessayez.');
      paint();
    }, function () { reprinting = false; reprintNote = tr('Réimpression non confirmée. Vérifiez la connexion et le pont, puis réessayez.'); paint(); });
  }
  function paint() {
    var count = localCount + relayCount + receiptFailed.size;
    var entry = document.getElementById('caisse-print-recovery');
    if (!count && !reprintNote) { if (entry) entry.remove(); return; }
    if (!entry) {
      entry = document.createElement('div');
      entry.id = 'caisse-print-recovery'; entry.className = 'toast is-warn'; entry.style.pointerEvents = 'auto';
      entry.setAttribute('role', 'alert');
      var btn = 'font:inherit;font-size:12px;font-weight:650;border-radius:10px;padding:7px 11px;cursor:pointer;min-height:34px;';
      entry.innerHTML = '<div class="toast-copy"><span class="toast-title" data-msg></span>'
        + '<span class="toast-desc" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">'
        + '<button type="button" data-reprint style="' + btn + 'border:0;background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)"></button>'
        + '<button type="button" data-view style="' + btn + 'border:1px solid rgba(10,15,13,.18);background:transparent;color:#0A0F0D"></button></span></div>';
      entry.querySelector('[data-reprint]').addEventListener('click', reprint);
      entry.querySelector('[data-view]').addEventListener('click', function () {
        if (window.KiwiPrinter) window.KiwiPrinter.openSetup({ kind: 'recovery' });
      });
      (document.getElementById('toast-stack') || document.body).appendChild(entry);
    }
    var msg = relayCount
      ? (relayCount > 1 ? tr(relayCount + ' bons de cuisine non imprimés') : tr('Bon de cuisine non imprimé')) + (relayLabels ? ' · ' + relayLabels : '')
      : '';
    if (reprintNote) msg = (msg ? msg + ' · ' : '') + reprintNote;
    entry.querySelector('[data-msg]').textContent = msg;
    var again = entry.querySelector('[data-reprint]');
    again.hidden = !relayIds.length || !(window.KiwiKitchenPrint && window.KiwiKitchenPrint.reprintUnprinted);
    again.disabled = reprinting;
    again.textContent = tr(reprinting ? 'Réimpression…' : 'Réimprimer');
    var view = entry.querySelector('[data-view]');
    view.hidden = !count;
    view.textContent = tr('Voir les tickets non imprimés') + ' (' + count + ')';
  }
  if (window.KiwiCaisseLang && window.KiwiCaisseLang.subscribe) window.KiwiCaisseLang.subscribe(paint);
  window.addEventListener('kiwi:kitchen-print-unprinted', function (event) {
    var d = event.detail || {};
    relayCount = Number(d.count) || 0;
    relayIds = Array.isArray(d.ids) ? d.ids.slice(0, 20) : [];
    relayLabels = String(d.labels || '');
    if (!relayCount && reprintNote && !reprinting) reprintNote = '';   // tout est ressorti : l'alerte s'en va
    paint();
  });
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
