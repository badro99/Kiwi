/* Kiwi Guides · bibliothèque (recherche, filtres, tri)
 *
 * Chargé UNIQUEMENT sur /{fr,en,ar}/guides/. Zéro dépendance, zéro requête,
 * zéro cookie : tout se passe sur les attributs data-* déjà rendus par
 * tools/build-guides.mjs, donc la recherche fonctionne sans compte et sans
 * backend.
 *
 * Amélioration progressive, dans ce sens précis : le HTML servi contient la
 * grille complète, les mises en avant et les parcours, et les commandes
 * (recherche, objectifs, catégories, tri) sont masquées par le CSS jusqu'à ce
 * que ce script ajoute `.js-library`. Sans JavaScript, un visiteur ou un
 * robot voit donc les sept guides, pas des boutons inertes. */
(function () {
  'use strict';

  var root = document.querySelector('[data-guides-library]');
  if (!root) return;

  var grid = root.querySelector('[data-guides-grid]');
  var cards = Array.prototype.slice.call(root.querySelectorAll('[data-guide]'));
  var searchInput = root.querySelector('[data-guides-search]');
  var sortSelect = root.querySelector('[data-guides-sort]');
  var empty = root.querySelector('[data-guides-empty]');
  var counter = root.querySelector('[data-guides-count]');
  var resetButton = root.querySelector('[data-guides-reset]');
  var goalButtons = Array.prototype.slice.call(root.querySelectorAll('[data-goal]'));
  var categoryButtons = Array.prototype.slice.call(root.querySelectorAll('[data-category]'));
  var secondary = Array.prototype.slice.call(root.querySelectorAll('.featured, .paths'));
  if (!grid || !cards.length) return;

  /* Les cartes de la grille principale seulement : les mises en avant sont des
   * doublons volontaires du même guide, et les filtrer ferait disparaître un
   * résultat deux fois. */
  var gridCards = cards.filter(function (card) { return card.parentNode === grid; });
  var total = gridCards.length;
  var emit = (window.kiwiGuides && window.kiwiGuides.emit) || function () { return null; };

  var state = { query: '', category: 'all', goal: '' };

  /* Les trois formulations du compteur sont rendues par le générateur, dans la
   * langue de la page : « 7 guides publiés », « 1 guide affiché sur 7 » et
   * « 3 guides affichés sur 7 ». Aucune traduction n'est redéclarée ici, et
   * l'arabe garde ses <bdi> autour des nombres. */
  function countLabel(shown) {
    if (!counter) return '';
    if (shown === total) return counter.getAttribute('data-count-total') || '';
    var template = counter.getAttribute(shown === 1 ? 'data-count-one' : 'data-count-many') || '';
    return template.replace('{n}', String(shown));
  }

  function normalise(value) {
    var text = String(value || '').toLowerCase();
    /* Un visiteur francophone tape « rentabilite » sans accent, un arabophone
     * peut taper avec ou sans harakat. On compare donc des formes aplaties. */
    if (text.normalize) {
      text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
      text = text.replace(/[ً-ْٰـ]/g, '');
    }
    return text.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  }

  function matches(card) {
    if (state.category !== 'all' && card.getAttribute('data-category') !== state.category) return false;
    if (state.goal) {
      var goals = (card.getAttribute('data-goals') || '').split(/\s+/);
      if (goals.indexOf(state.goal) === -1) return false;
    }
    if (!state.query) return true;
    var haystack = normalise(card.getAttribute('data-haystack'));
    var terms = state.query.split(/\s+/).filter(Boolean);
    for (var i = 0; i < terms.length; i += 1) {
      if (haystack.indexOf(terms[i]) === -1) return false;
    }
    return true;
  }

  function sortCards() {
    var mode = sortSelect ? sortSelect.value : 'recommended';
    var ordered = gridCards.slice().sort(function (a, b) {
      if (mode === 'recent') {
        var left = a.getAttribute('data-modified');
        var right = b.getAttribute('data-modified');
        if (left !== right) return left < right ? 1 : -1;
      } else if (mode === 'reading') {
        var fast = Number(a.getAttribute('data-reading')) - Number(b.getAttribute('data-reading'));
        if (fast) return fast;
      }
      return Number(a.getAttribute('data-order')) - Number(b.getAttribute('data-order'));
    });
    ordered.forEach(function (card) { grid.appendChild(card); });
  }

  function apply() {
    var shown = 0;
    gridCards.forEach(function (card) {
      var visible = matches(card);
      card.hidden = !visible;
      if (visible) shown += 1;
    });

    var filtering = Boolean(state.query || state.goal || state.category !== 'all');
    if (empty) empty.hidden = shown !== 0;
    /* Pendant un filtrage, « À lire en premier » et les parcours proposeraient
     * des guides que le visiteur vient justement d'exclure. */
    secondary.forEach(function (section) { section.hidden = filtering; });

    if (counter) counter.innerHTML = countLabel(shown);
    return shown;
  }

  function refresh() {
    sortCards();
    apply();
  }

  /* La frappe ne doit pas émettre un événement par caractère ni recalculer la
   * grille à chaque touche. */
  var searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.query = normalise(searchInput.value).trim();
      apply();
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        if (state.query) emit('library_search', { term: state.query, results: apply() });
      }, 600);
    });
    /* Entrée dans un champ de recherche isolé soumettrait la page sur certains
     * navigateurs. */
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') event.preventDefault();
      if (event.key === 'Escape') { searchInput.value = ''; state.query = ''; apply(); }
    });
  }

  function setPressed(buttons, attribute, value) {
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute(attribute) === value));
    });
  }

  categoryButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.category = button.getAttribute('data-category');
      setPressed(categoryButtons, 'data-category', state.category);
      emit('library_filter_category', { category: state.category, results: apply() });
    });
  });

  goalButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      /* Un objectif se rappuie pour revenir à la bibliothèque complète. */
      var goal = button.getAttribute('data-goal');
      state.goal = state.goal === goal ? '' : goal;
      setPressed(goalButtons, 'data-goal', state.goal);
      emit('library_filter_goal', { goal: state.goal, results: apply() });
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      refresh();
      emit('library_sort', { mode: sortSelect.value });
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', function () {
      state = { query: '', category: 'all', goal: '' };
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'recommended';
      setPressed(categoryButtons, 'data-category', 'all');
      setPressed(goalButtons, 'data-goal', '');
      refresh();
      emit('library_reset', {});
      if (searchInput) searchInput.focus();
    });
  }

  /* Dernière étape : révéler les commandes seulement maintenant qu'elles
   * répondent toutes. */
  document.documentElement.classList.add('js-library');
  refresh();
}());
