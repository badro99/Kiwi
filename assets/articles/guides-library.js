/* Kiwi Guides · bibliothèque (recherche, filtres, tri)
 *
 * Chargé UNIQUEMENT sur /{fr,en,ar}/guides/. Zéro dépendance, zéro requête,
 * zéro cookie : tout se passe sur les attributs data-* déjà rendus par
 * tools/build-guides.mjs, donc la recherche fonctionne sans compte et sans
 * backend.
 *
 * Amélioration progressive, dans ce sens précis : le HTML servi contient la
 * grille complète et les parcours, et les commandes (recherche, filtre par
 * problème) sont masquées par le CSS jusqu'à ce que ce script ajoute
 * `.js-library`. Sans JavaScript, un visiteur ou un robot voit donc les sept
 * guides, pas des boutons inertes.
 *
 * Depuis la refonte d'octobre 2026, chaque guide n'apparaît qu'une fois (les
 * mises en avant ouvrent la grille) et il n'y a plus qu'un filtre : le
 * problème à régler. La recherche et ce filtre vivent dans l'en-tête du hub,
 * hors de [data-guides-library], d'où les requêtes sur `document`. */
(function () {
  'use strict';

  var root = document.querySelector('[data-guides-library]');
  if (!root) return;

  var grid = root.querySelector('[data-guides-grid]');
  var gridCards = Array.prototype.slice.call(root.querySelectorAll('[data-guide]'));
  var searchInput = document.querySelector('[data-guides-search]');
  var empty = root.querySelector('[data-guides-empty]');
  var counter = root.querySelector('[data-guides-count]');
  var resetButton = root.querySelector('[data-guides-reset]');
  var goalButtons = Array.prototype.slice.call(document.querySelectorAll('[data-goal]'));
  var secondary = Array.prototype.slice.call(root.querySelectorAll('.paths'));
  if (!grid || !gridCards.length) return;

  var total = gridCards.length;
  var emit = (window.kiwiGuides && window.kiwiGuides.emit) || function () { return null; };

  var state = { query: '', goal: '' };

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

  function apply() {
    var shown = 0;
    gridCards.forEach(function (card) {
      var visible = matches(card);
      card.hidden = !visible;
      if (visible) shown += 1;
    });

    var filtering = Boolean(state.query || state.goal);
    if (empty) empty.hidden = shown !== 0;
    /* Pendant un filtrage, les parcours proposeraient des guides que le
     * visiteur vient justement d'exclure, et la grande carte d'ouverture
     * redevient une carte comme les autres. */
    secondary.forEach(function (section) { section.hidden = filtering; });
    grid.classList.toggle('is-filtered', filtering);

    if (counter) counter.innerHTML = countLabel(shown);
    return shown;
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

  goalButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      /* Un objectif se rappuie pour revenir à la bibliothèque complète ;
       * « Tous les guides » porte data-goal="". */
      var goal = button.getAttribute('data-goal');
      state.goal = state.goal === goal ? '' : goal;
      setPressed(goalButtons, 'data-goal', state.goal);
      emit('library_filter_goal', { goal: state.goal, results: apply() });
    });
  });

  if (resetButton) {
    resetButton.addEventListener('click', function () {
      state = { query: '', goal: '' };
      if (searchInput) searchInput.value = '';
      setPressed(goalButtons, 'data-goal', '');
      apply();
      emit('library_reset', {});
      if (searchInput) searchInput.focus();
    });
  }

  /* Dernière étape : révéler les commandes seulement maintenant qu'elles
   * répondent toutes. */
  document.documentElement.classList.add('js-library');
  apply();
}());
