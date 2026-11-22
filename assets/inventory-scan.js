/* Kiwi · « Scanner » de l'inventaire boutique (21 nov. 2026).
 * Le bouton data-action="bqx-scan" (assets/pages-pro-boutique.js) prend une photo
 * ou un PDF, quel qu'il soit (carton, facture, reçu, article), ouvre l'assistant
 * et lui remet le fichier comme si on l'avait joint au trombone puis envoyé :
 * même lecture, même carte de résultat, rien n'est écrit sans confirmation.
 * Le compositeur de l'assistant n'existe qu'une fois le tiroir ouvert, d'où
 * l'attente bornée (5 s) avant de lui remettre le fichier. */
(function () {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  var WAIT_MS = 100, TRIES = 50;
  var FAIL = { fr: 'L’assistant ne s’est pas ouvert. Réessayez.', en: 'The assistant did not open. Try again.', ar: 'لم يُفتح المساعد. أعد المحاولة.' };

  function fail() {
    var l = (document.documentElement.lang || 'fr').slice(0, 2);
    if (window.Kiwi.toast) window.Kiwi.toast(FAIL[l] || FAIL.fr, { type: 'danger', force: true });
  }

  function handOver(file) {
    if (window.KiwiAgent && window.KiwiAgent.open) window.KiwiAgent.open();
    var tries = 0;
    (function attach() {
      var vision = window.KiwiVision;
      if (vision && vision.sweep) vision.sweep();
      var wrap = document.querySelector('.fa-drawer .fa-inputwrap[data-kv-attach-wired="1"]');
      if (wrap && vision && vision.scan) { vision.scan(wrap, file); return; }
      if (++tries < TRIES) { setTimeout(attach, WAIT_MS); return; }
      fail();
    })();
  }

  window.Kiwi.handlers['bqx-scan'] = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.hidden = true;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.remove();
      if (file) handOver(file);
    });
    document.body.appendChild(input);
    input.click();
  };
})();
