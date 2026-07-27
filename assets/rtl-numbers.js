/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · les milliers, en arabe (assets/rtl-numbers.js)
 * ---------------------------------------------------------------------------
 * EN ARABE, « 31 500 MAD » S'AFFICHAIT « MAD 500 31 ».
 *
 * Ce n'est pas une faute de style, c'est un chiffre faux sous les yeux d'un
 * commerçant. L'algorithme bidirectionnel d'Unicode traite l'espace ordinaire
 * (U+0020) comme un caractère neutre : placé entre deux nombres dans un
 * paragraphe de droite à gauche, il prend la direction du paragraphe et coupe
 * « 31 500 » en DEUX nombres, que le moteur pose alors de droite à gauche. Le
 * lecteur voit « 500 » à gauche de « 31 ». L'objectif du jour de Café Atlas se
 * lisait « 500 31 ».
 *
 * Mesuré dans le navigateur, pas déduit — les quatre séparateurs plausibles,
 * position réelle des groupes à l'écran :
 *
 *     U+0020 espace ordinaire  ✗ 31 à DROITE de 500
 *     U+2009 espace fine       ✗ 31 à DROITE de 500
 *     U+00A0 espace insécable  ✓
 *     U+202F fine insécable    ✓
 *
 * Une espace INSÉCABLE n'est pas neutre au sens de l'algorithme : elle reste
 * accrochée aux chiffres, le nombre demeure un seul bloc, et l'ordre tient.
 *
 * ENTRE LES DEUX QUI MARCHENT, ON PREND U+00A0 — pour une raison mesurée, pas
 * théorique. À la fonte du chiffre héros, l'espace ordinaire fait 4,12 px ;
 * U+00A0 fait 4,12 px ; U+202F fait 1,94 px. U+202F est la convention de
 * `toLocaleString('fr-FR')`, mais l'adopter ici rétrécirait de moitié la
 * respiration de chaque nombre déjà à l'écran : « 842 300 » devenait
 * « 842300 » à l'œil, illisible d'un coup d'œil sur un tableau de bord dont
 * c'est la fonction. U+00A0 corrige l'ordre sans déplacer un pixel.
 *
 * Les nombres passés par `toLocaleString('fr-FR')` étaient DÉJÀ corrects en
 * arabe — il produit U+202F, insécable lui aussi. Les seuls cassés sont ceux
 * écrits à la main : littéraux figés dans le HTML, et
 * `replace(/\B(?=(\d{3})+(?!\d))/g, ' ')` dans une poignée de modules.
 *
 * POURQUOI À L'EXÉCUTION plutôt qu'à la source. Les nombres cassés viennent de
 * deux endroits à la fois : des littéraux figés dans le HTML et des formateurs
 * appelés à chaque rendu. Les corriger un par un, c'est des centaines de lignes
 * dans quarante fichiers, chacune une occasion de casser un numéro de
 * téléphone ou une plage de codes — pour un défaut qui n'existe que dans une
 * langue sur trois. Ici : un fichier, une règle, et le futur code est couvert
 * sans qu'on ait à y penser.
 *
 * NE FAIT RIEN HORS ARABE. Tant que le document n'est pas en `dir="rtl"`, le
 * module ne touche pas un caractère : le français et l'anglais gardent leurs
 * pixels, et la démo reste identique. Les tickets thermiques ne passent pas non
 * plus par ici — une espace insécable n'existe pas dans les tables de caractères
 * CP437/CP858 des imprimantes, et le reçu est de toute façon en français.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SEP = ' ';   /* NO-BREAK SPACE — exactement la largeur de l'espace ordinaire */

  /* Un groupe de milliers, et rien d'autre. La sentinelle `(?!\d)` est ce qui
   * distingue un nombre d'une suite de chiffres qui n'en est pas une :
   *
   *   « 31 500 »        → 3 chiffres puis la fin du nombre   ✓ corrigé
   *   « 1 234 567 »     → deux fois de suite                 ✓ corrigé
   *   « 0002 0015 »     → la plage de codes de la caisse : « 001 » est suivi
   *                        d'un « 5 », donc ce n'est pas un groupe de milliers
   *                                                          ✓ laissé tel quel
   *   « 28 07 2026 »    → « 202 » est suivi d'un « 6 »       ✓ laissé tel quel
   *   « 06 12 34 56 78 » → groupes de deux                   ✓ laissé tel quel
   */
  var GROUP = /(\d) (?=\d{3}(?!\d))/g;

  /* Pure, exportée, et c'est elle que la garde vérifie (tools/rtl-numbers-test.js). */
  function fix(s) { return String(s == null ? '' : s).replace(GROUP, '$1' + SEP); }

  /* Là où un espace n'est pas de la mise en page : du code, une saisie en cours,
   * un champ que l'utilisateur relira. On n'y touche jamais. */
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1 };

  function skip(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (SKIP[n.tagName]) return true;
      if (n.isContentEditable) return true;
      if (n.hasAttribute && n.hasAttribute('data-no-num-fix')) return true;
    }
    return false;
  }

  var busy = false;   /* nos propres écritures ne doivent pas nous rappeler */

  function sweep(root) {
    if (!root || busy) return;
    var start = root.nodeType === 3 ? root.parentNode : root;
    if (!start || !start.ownerDocument) return;
    busy = true;
    try {
      var walk = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, null);
      var node, hits = [];
      /* On collecte d'abord, on écrit ensuite : modifier un nœud pendant que le
       * TreeWalker le parcourt est le genre de chose qui marche jusqu'au jour
       * où elle ne marche plus. */
      while ((node = walk.nextNode())) {
        var v = node.nodeValue;
        if (!v || v.indexOf(' ') < 0) continue;
        GROUP.lastIndex = 0;
        if (!GROUP.test(v)) continue;
        if (skip(node.parentElement)) continue;
        hits.push(node);
      }
      for (var i = 0; i < hits.length; i++) hits[i].nodeValue = fix(hits[i].nodeValue);
    } catch (_) { /* jamais au prix de la page */ }
    busy = false;
  }

  function on() {
    try { return document.documentElement.getAttribute('dir') === 'rtl'; } catch (_) { return false; }
  }

  /* Un minuteur, PAS requestAnimationFrame. Un onglet en arrière-plan ne reçoit
   * aucune frame d'animation : mesuré ici même, `document.hidden === true` et le
   * rAF n'est jamais appelé, donc le balayage restait en attente et les nombres
   * restaient à l'envers. Un commerçant qui ouvre son tableau de bord dans un
   * onglet et va travailler ailleurs est exactement ce cas-là. Les minuteurs,
   * eux, continuent de tomber — plus lentement, mais ils tombent. */
  var queued = false;
  function later() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; if (on()) sweep(document.body); }, 0);
  }

  function start() {
    if (!document.body) return;
    if (on()) sweep(document.body);

    /* Le tableau de bord se redessine sans arrêt — flux en direct, changement
     * de période, ouverture d'un tiroir. Un passage unique au chargement ne
     * tiendrait pas trois secondes. */
    try {
      new MutationObserver(function (recs) {
        if (busy || !on()) return;
        for (var i = 0; i < recs.length; i++) {
          if (recs[i].type === 'characterData' || recs[i].addedNodes.length) { later(); return; }
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (_) {}

    /* `dir` bascule au changement de langue : arabe → on repasse, français → on
     * ne défait rien. Rien à défaire, d'ailleurs : U+00A0 a la largeur de
     * l'espace ordinaire, donc un nombre corrigé en arabe puis relu en français
     * est identique au pixel près. */
    try {
      new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.KiwiRtlNumbers = { fix: fix, sweep: sweep, SEP: SEP };
})();
