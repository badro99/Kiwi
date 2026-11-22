/* ═══════════════════════════════════════════════════════════
 * Kiwi · CALME AU REPEINT — une entrée se joue une fois, pas à chaque repeint.
 * ---------------------------------------------------------------------------
 * Les écrans de Kiwi se redessinent en remplaçant leur HTML (innerHTML) : un
 * toucher sur l'écran déjà ouvert, un repeint après synchronisation, une
 * réponse du serveur qui arrive. Et ~220 règles CSS donnent aux cartes et aux
 * lignes un fondu d'entrée (opacité 0 → 1). Le navigateur rejoue une animation
 * CSS chaque fois qu'un élément est CRÉÉ : chaque repeint faisait donc
 * disparaître puis réapparaître toutes les cartes, même identiques. C'est le
 * « clignotement » filmé sur la caisse d'Amira Boutique le 21 novembre 2026
 * (Échanges & avoirs, iPad), et le même mécanisme partout ailleurs.
 *
 * La règle, en un seul endroit plutôt que dans quarante feuilles :
 *   · un élément qui remplace un élément IDENTIQUE (même balise, mêmes
 *     classes, même texte) arrive déjà posé : son fondu d'entrée est terminé
 *     avant la première image ;
 *   · un élément NOUVEAU (une vente qui arrive, une ligne ajoutée au ticket,
 *     un montant qui change) garde son entrée ;
 *   · un écran qu'on OUVRE garde son entrée : si le conteneur ou un parent
 *     change de classe / d'état visible dans le même geste, c'est une
 *     navigation, pas un repeint ;
 *   · les animations en boucle (chargement, pulsation) ne sont jamais touchées,
 *     ni rien qui ne commence pas transparent ;
 *   · `data-enter-always` sur un élément (ou un parent) le laisse rejouer.
 * Un conteneur vidé puis rempli un peu plus tard (un « chargement… » entre les
 * deux) compte comme le même repeint pendant 2 s.
 *
 * Le travail se fait dans le rappel du MutationObserver, avant que la page ne
 * soit peinte : l'image avec les cartes transparentes n'existe jamais. Rien à
 * faire sans getAnimations (vieux navigateur) : la page reste comme avant.
 * tools/calm-rerender-browser-test.mjs, mouvement ALLUMÉ. Chargé par
 * assets/kit/haptics.js, que les trois coquilles (tableau de bord, caisse,
 * serveur) chargent en premier : elles sont à leur plafond de balises <script>,
 * et le noyau du kit à son budget de 35 Ko (tools/kit-size-test.js).
 * ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function' || typeof Element === 'undefined' || !Element.prototype.getAnimations) return;

  var WINDOW_MS = 2000;           // vidé puis rempli dans ce délai : même repeint
  var MAX_ROOTS = 4000;           // racines retirées gardées par conteneur (une grille d'articles en compte des centaines)
  var removed = new WeakMap();    // conteneur → { at, roots: [éléments détachés] }

  function sig(el) {
    var cls = typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '';
    return el.tagName + '|' + cls + '|' + String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  /* Une entrée : animation CSS finie, qui commence transparente ou presque. */
  function isEntrance(a) {
    if (!a || a.playState === 'finished' || !a.effect || typeof a.animationName !== 'string') return false;
    var timing = a.effect.getComputedTiming ? a.effect.getComputedTiming() : a.effect.getTiming();
    if (!timing || timing.iterations === Infinity) return false;
    var frames = a.effect.getKeyframes ? a.effect.getKeyframes() : [];
    if (!frames.length || frames[0].opacity === undefined || frames[0].opacity === '') return false;
    return parseFloat(frames[0].opacity) < 0.5;
  }

  /* Le conteneur ou un parent a changé d'état visible dans ce même geste. */
  function navigated(node, moved) {
    if (!moved.size) return false;
    for (var n = node; n && n.nodeType === 1; n = n.parentNode) if (moved.has(n)) return true;
    return false;
  }

  function remember(target, nodes) {
    var now = Date.now(), slot = removed.get(target);
    if (!slot || now - slot.at > WINDOW_MS) { slot = { at: now, roots: [] }; removed.set(target, slot); }
    slot.at = now;
    for (var i = 0; i < nodes.length && slot.roots.length < MAX_ROOTS; i++) if (nodes[i].nodeType === 1) slot.roots.push(nodes[i]);
  }

  /* Les signatures des éléments retirés qui portent les mêmes classes qu'un
     élément qui s'anime : on ne lit que ce qui peut correspondre. */
  function seen(target, classes) {
    var slot = removed.get(target), out = new Set();
    if (!slot || Date.now() - slot.at > WINDOW_MS) return out;
    slot.roots.forEach(function (root) {
      classes.forEach(function (cls) {
        var pick = cls ? '.' + cls.split(/\s+/).filter(Boolean).map(CSS.escape).join('.') : '*';
        if (root.matches && root.matches(pick)) out.add(sig(root));
        if (root.querySelectorAll) root.querySelectorAll(pick).forEach(function (el) { out.add(sig(el)); });
      });
    });
    return out;
  }

  function settle(target, added) {
    var playing = [];
    added.forEach(function (node) {
      if (!node.isConnected) return;
      node.getAnimations({ subtree: true }).forEach(function (a) { if (isEntrance(a)) playing.push(a); });
    });
    if (!playing.length) return;
    var classes = new Set();
    playing.forEach(function (a) {
      var el = a.effect.target;
      if (el && el.nodeType === 1) classes.add(typeof el.className === 'string' ? el.className.trim() : '');
    });
    var known = seen(target, classes);
    if (!known.size) return;
    playing.forEach(function (a) {
      var el = a.effect.target;
      if (!el || el.nodeType !== 1 || (el.closest && el.closest('[data-enter-always]'))) return;
      if (known.has(sig(el))) { try { a.finish(); } catch (_) {} }
    });
  }

  var observer = new MutationObserver(function (records) {
    var moved = new Set(), adds = new Map();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'attributes') { moved.add(r.target); continue; }
      if (r.removedNodes.length) remember(r.target, r.removedNodes);
      if (r.addedNodes.length) {
        var list = adds.get(r.target);
        if (!list) { list = []; adds.set(r.target, list); }
        for (var j = 0; j < r.addedNodes.length; j++) if (r.addedNodes[j].nodeType === 1) list.push(r.addedNodes[j]);
      }
    }
    adds.forEach(function (list, target) {
      var slot = removed.get(target);
      /* Pas de retrait récent dans ce conteneur : c'est un ajout (une vente qui
         arrive), il garde son entrée et ne coûte rien ici. */
      if (!list.length || !slot || Date.now() - slot.at > WINDOW_MS || navigated(target, moved)) return;
      try { settle(target, list); } catch (_) {}
    });
  });

  function start() {
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'hidden', 'open', 'aria-hidden'],
    });
  }
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
