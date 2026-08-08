/* ═══════════════════════════════════════════════════════════════════════════
   caisse-dna.js — greffe la bascule jour/nuit dans le rail des quinze
   caisses métier.

   La caisse restaurant a son propre bouton (#theme-toggle, kiwi-caisse.html) ;
   les verticaux n'en ont aucun. Même mécanique que la pastille de langue
   d'assets/caisse-lang.js : on repère le bouton réseau du rail ouvert
   (`button[class$="-net"]` dans un .vx-screen), on insère la bascule juste
   avant, et on regreffe à chaque mutation — le rail d'un métier est
   reconstruit à chaque montage.

   Le thème lui-même appartient à kiwi-caisse.html (window.KiwiCaisseTheme,
   événement `kiwi:caisse-theme`) ; ici on ne fait que poser le bouton.
   Les styles vivent dans assets/caisse-dna.css (.kdt).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SUN = '<svg class="kdt-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var MOON = '<svg class="kdt-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

  function label() {
    var dark = window.KiwiCaisseTheme && window.KiwiCaisseTheme.current() === 'dark';
    return dark ? 'Mode jour' : 'Mode nuit';
  }

  function paint() {
    Array.prototype.forEach.call(document.querySelectorAll('.kdt-label'), function (s) {
      s.textContent = label();
    });
  }

  function graft() {
    if (!window.KiwiCaisseTheme) return;
    var nets = document.querySelectorAll('button[class$="-net"], button.bq-net');
    Array.prototype.forEach.call(nets, function (net) {
      /* Uniquement les rails des verticaux (montés dans un .vx-screen) —
         le restaurant garde son #theme-toggle. */
      if (!net.closest || !net.closest('.vx-screen')) return;
      var host = net.parentElement;
      if (!host || host.querySelector('.kdt')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kdt';
      btn.setAttribute('data-nolang', '');
      btn.innerHTML = SUN + MOON + '<span class="kdt-label">' + label() + '</span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        window.KiwiCaisseTheme.toggle();
      });
      host.insertBefore(btn, net);
    });
  }

  var t = null;
  function schedule() {
    if (t) return;
    t = setTimeout(function () { t = null; try { graft(); } catch (_) {} }, 150);
  }

  /* L'horloge de la caisse restaurant mute le DOM chaque seconde — on ne
     replanifie la greffe que si la mutation touche un rail vertical
     (.vx-screen), pas pour le reste de la page. */
  function touchesVertical(muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i], target = m.target;
      if (target && target.nodeType === 1 && target.closest && target.closest('.vx-screen')) return true;
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (n.nodeType === 1 && ((n.matches && n.matches('.vx-screen')) || (n.querySelector && n.querySelector('.vx-screen')))) return true;
      }
    }
    return false;
  }

  function boot() {
    try { graft(); } catch (_) {}
    document.addEventListener('kiwi:caisse-theme', paint);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function (muts) {
        if (touchesVertical(muts)) schedule();
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
