/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · ASSISTANT — « LE RELEVÉ », la couche vivante.
 *
 * assets/agent-skin.css fait la forme ; ce fichier fait les trois choses que
 * le CSS ne peut pas faire seul, et RIEN d'autre :
 *
 *   1. numéroter les feuillets (I, II, III… sur le filet de reliure) ;
 *   2. sortir le chiffre de tête en display (la première statistique d'une
 *      réponse est toujours la métrique du titre — c'est un fait de agent.js,
 *      pas une supposition) ;
 *   3. L'ANCRAGE VISIBLE : allumer, dans le volet de droite, les lignes dont
 *      la valeur apparaît littéralement dans la réponse, et lier les deux au
 *      survol.
 *
 * ── POURQUOI L'ANCRAGE EST UNE CORRESPONDANCE DE TEXTE, ET PAS UN GRAPHE ───
 * On pourrait faire déclarer à chaque scénario ses entrées de calcul, et
 * dessiner le vrai graphe de dépendances. Ce serait plus riche — et ce serait
 * une deuxième vérité à maintenir à côté du calcul, qui dériverait au premier
 * scénario modifié sans que rien ne le signale. Une interface qui prétend
 * montrer la provenance et se trompe est pire que pas d'interface du tout :
 * c'est exactement la faute que l'audit de juillet a relevée côté chiffres.
 *
 * Donc on n'affirme que ce qu'on peut prouver sur place : « ce montant, dans
 * la réponse, est le même que celui-ci, sur vos livres ». Correspondance
 * exacte, chaîne contre chaîne, après normalisation des espaces (fine,
 * insécable, ordinaire — toLocaleString('fr-FR') émet les trois). Aucun lien
 * approché, aucune tolérance : un chiffre qui ne correspond pas ne s'allume
 * pas, et c'est une information en soi.
 *
 * ── RÉVERSIBILITÉ ──────────────────────────────────────────────────────────
 *   KiwiAiSkin.disable()  → l'ancien assistant, au pixel près.
 *   KiwiAiSkin.enable()   → le relevé.
 *   KiwiAiSkin.toggle()
 * L'attribut <html data-kiwi-ai="releve"> est le seul interrupteur ; retirer
 * le <link> et le <script> de dashboard.html suffit à revenir en arrière.
 *
 * Zéro dépendance. N'entre jamais dans agent.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KiwiAiSkin) return;

  var ROOT_ATTR = 'data-kiwi-ai';
  var SKIN = 'releve';
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  /* Espaces fine / insécable / insécable étroite / ordinaire : toLocaleString
     ('fr-FR') n'émet pas le même selon le moteur, et deux chaînes qui
     s'affichent pareil doivent se comparer pareil. */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[    \s]+/g, ' ')
      .trim().toLowerCase();
  }

  /* ─── 1 · les feuillets et le chiffre de tête ─────────────────────────── */
  function dressAnswer(msg, index) {
    if (!msg || msg.dataset.rlvDone === '1') return;
    msg.dataset.rlvDone = '1';
    msg.setAttribute('data-rlv-turn', ROMAN[index] || String(index));
    var lead = msg.querySelector('.fa-stats > .fa-stat');
    if (lead) lead.classList.add('rlv-lead');
  }

  /* ─── 2 · l'ancrage visible ───────────────────────────────────────────── */
  function railRows(scope) {
    return Array.prototype.slice.call(
      scope.querySelectorAll('.fa-ctx-kpi, .fa-ctx-item, .fa-ctx-net')
    );
  }
  /* La valeur portée par une ligne du volet — « 842 300 MAD ». Assez longue
     pour ne pas s'allumer par hasard : « 134 » se retrouve partout, « 842 300
     MAD » n'apparaît que là où on l'a écrit. */
  function rowValue(row) {
    var v = row.querySelector('.v');
    var t = norm(v ? v.textContent : '');
    if (t.length < 6) return '';           /* trop court pour prouver quoi que ce soit */
    /* Certaines lignes portent deux faits (« 581 300 MAD · 69,0 % ») : on ne
       retient que le premier, le seul dont on soit sûr de la frontière. */
    return t.split(' · ')[0].trim();
  }

  /* Entoure chaque occurrence de `needle` dans les nœuds texte de `el`.
     N'opère QUE sur des nœuds texte : le HTML de la réponse (gras, liens)
     ressort intact, il n'est jamais reconstruit à partir d'une chaîne. */
  function markOccurrences(el, needle, key) {
    if (!needle) return 0;
    var hits = 0;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (n.parentNode && n.parentNode.classList && n.parentNode.classList.contains('rlv-cite')) {
          return NodeFilter.FILTER_REJECT;      /* déjà cité, on ne réentoure pas */
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);

    texts.forEach(function (node) {
      var hay = norm(node.nodeValue);
      var at = hay.indexOf(needle);
      if (at === -1) return;
      /* norm() peut avoir changé la longueur (espaces multiples) ; on
         relocalise sur le texte BRUT avec une comparaison normalisée
         glissante, sinon la découpe tomberait à côté. */
      var raw = node.nodeValue;
      var start = -1, end = -1;
      for (var i = 0; i < raw.length && start === -1; i++) {
        for (var j = i + needle.length - 2; j <= Math.min(raw.length, i + needle.length + 6); j++) {
          if (norm(raw.slice(i, j)) === needle) { start = i; end = j; break; }
        }
      }
      if (start === -1) return;
      /* norm() avale les espaces de tête, donc la fenêtre trouvée peut
         commencer un caractère avant le chiffre — et on soulignait l'espace
         qui précède « 842 300 MAD ». On recale sur le premier caractère utile. */
      while (start < end && /\s/.test(raw[start])) start++;
      while (end > start && /\s/.test(raw[end - 1])) end--;
      var after = node.splitText(start);
      after.splitText(end - start);
      var mark = document.createElement('span');
      mark.className = 'rlv-cite';
      mark.setAttribute('data-rlv-cite', key);
      mark.textContent = after.nodeValue;
      after.parentNode.replaceChild(mark, after);
      hits++;
    });
    return hits;
  }

  function ground(fa) {
    var rows = railRows(fa);
    if (!rows.length) return;
    var bubbles = fa.querySelectorAll('.fa-msg.agent .fa-bubble');
    if (!bubbles.length) return;

    rows.forEach(function (row) {
      var needle = rowValue(row);
      if (!needle) return;
      /* La clé vient de la VALEUR, pas du rang de la ligne : le volet se
         reconstruit (« voir tous les chiffres »), et une clé positionnelle
         aurait relié la trésorerie d'une réponse à la marge de la suivante. */
      var key = 'c' + needle.replace(/[^a-z0-9]/g, '');
      var hits = 0;
      Array.prototype.forEach.call(bubbles, function (b) { hits += markOccurrences(b, needle, key); });
      /* markOccurrences() ignore ce qui est DÉJÀ marqué — sans quoi chaque
         passage réentourerait le même chiffre. Il faut donc compter aussi les
         marques posées aux tours précédents, ou la ligne du volet perdait son
         point dès la deuxième réponse. */
      hits += fa.querySelectorAll('.fa-msg.agent [data-rlv-cite="' + key + '"]').length;
      if (!hits) { row.classList.remove('is-cited'); row.removeAttribute('data-rlv-cite'); return; }
      row.classList.add('is-cited');
      row.setAttribute('data-rlv-cite', key);
    });
  }

  /* Le survol lie les deux sens. Délégué sur le conteneur : les réponses
     arrivent après coup, et un écouteur par élément fuirait à chaque tour. */
  function wireHover(fa) {
    if (fa.dataset.rlvHover === '1') return;
    fa.dataset.rlvHover = '1';
    var light = function (key, on) {
      if (!key) return;
      fa.querySelectorAll('[data-rlv-cite="' + key + '"]').forEach(function (el) {
        el.classList.toggle('is-lit', !!on);
      });
    };
    var keyOf = function (t) {
      var el = t && t.closest ? t.closest('[data-rlv-cite]') : null;
      return el ? el.getAttribute('data-rlv-cite') : null;
    };
    fa.addEventListener('mouseover', function (e) { light(keyOf(e.target), true); });
    fa.addEventListener('mouseout', function (e) { light(keyOf(e.target), false); });
    /* Au clavier et au doigt, le survol n'existe pas : le focus fait le même
       travail, sinon l'ancrage ne serait visible qu'à la souris. */
    fa.addEventListener('focusin', function (e) { light(keyOf(e.target), true); });
    fa.addEventListener('focusout', function (e) { light(keyOf(e.target), false); });
  }

  /* ─── 3 · l'état de service dans le bandeau ───────────────────────────── */
  function stamp(head) {
    if (!head || head.querySelector('.rlv-status')) return;
    var live = null;
    try { live = window.KiwiLive && window.KiwiLive.status ? window.KiwiLive.status() : null; } catch (_) { live = null; }
    var lang = 'FR';
    try { lang = String((window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr').toUpperCase(); } catch (_) {}
    var el = document.createElement('div');
    el.className = 'rlv-status';
    /* Construit nœud par nœud : `lang` vient d'un module tiers, et une ligne
       d'état n'a aucune raison d'être un point d'injection. */
    el.appendChild(document.createElement('i'));
    var label = document.createElement('span');
    label.textContent = (live && live.on ? 'en direct' : 'local') + ' · ' + lang.replace(/[^A-Z]/g, '').slice(0, 3);
    el.appendChild(label);
    head.appendChild(el);
  }

  /* ─── 4 · la boucle ───────────────────────────────────────────────────── */
  var observer = null;
  function refresh(fa) {
    var msgs = fa.querySelectorAll('.fa-msg.agent');
    Array.prototype.forEach.call(msgs, function (m, i) { dressAnswer(m, i + 1); });
    ground(fa);
  }
  function attach() {
    var fa = document.querySelector('.fa-drawer .fa');
    if (!fa) return false;
    wireHover(fa);
    var head = document.querySelector('.fa-drawer .kiwi-drawer-head');
    if (head) { head.style.position = head.style.position || 'relative'; stamp(head); }
    refresh(fa);
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () { refresh(fa); });
    var thread = fa.querySelector('[data-fa-thread]');
    if (thread) observer.observe(thread, { childList: true, subtree: true });
    return true;
  }

  /* Le tiroir naît et meurt au fil des ouvertures : on guette son arrivée sur
     le document plutôt que d'espérer un événement que agent.js n'émet pas. */
  var docWatcher = null;
  function watch() {
    if (docWatcher) return;
    docWatcher = new MutationObserver(function () {
      if (document.documentElement.getAttribute(ROOT_ATTR) !== SKIN) return;
      var fa = document.querySelector('.fa-drawer .fa');
      if (fa && fa.dataset.rlvHover !== '1') attach();
    });
    docWatcher.observe(document.body, { childList: true, subtree: true });
  }

  function enable() {
    document.documentElement.setAttribute(ROOT_ATTR, SKIN);
    watch();
    attach();
  }
  function disable() {
    document.documentElement.removeAttribute(ROOT_ATTR);
    if (observer) { observer.disconnect(); observer = null; }
    /* On rend l'écran d'origine : les marques d'ancrage repartent, les
       feuillets perdent leur numéro. Le CSS, lui, ne s'applique plus du tout
       — c'est l'attribut racine qui le porte en entier. */
    document.querySelectorAll('.rlv-cite').forEach(function (m) {
      var t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
    document.querySelectorAll('[data-rlv-turn]').forEach(function (m) {
      m.removeAttribute('data-rlv-turn'); delete m.dataset.rlvDone;
    });
    document.querySelectorAll('.rlv-lead').forEach(function (m) { m.classList.remove('rlv-lead'); });
    document.querySelectorAll('.is-cited').forEach(function (m) { m.classList.remove('is-cited'); });
    document.querySelectorAll('.rlv-status').forEach(function (m) { m.remove(); });
  }

  window.KiwiAiSkin = {
    enable: enable,
    disable: disable,
    toggle: function () {
      if (document.documentElement.getAttribute(ROOT_ATTR) === SKIN) disable(); else enable();
    },
    name: SKIN,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enable);
  } else {
    enable();
  }
}());
