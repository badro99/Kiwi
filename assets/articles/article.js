(function () {
  'use strict';

  var progress = document.querySelector('[data-reading-progress]');
  var article = document.querySelector('article');
  var ticking = false;

  function updateProgress() {
    ticking = false;
    if (!progress || !article) return;
    var articleTop = article.offsetTop;
    var distance = Math.max(1, article.offsetHeight - window.innerHeight);
    var ratio = Math.min(1, Math.max(0, (window.scrollY - articleTop) / distance));
    progress.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
  }

  function requestProgressUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateProgress);
  }

  window.addEventListener('scroll', requestProgressUpdate, { passive: true });
  window.addEventListener('resize', requestProgressUpdate, { passive: true });
  updateProgress();

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  var sections = tocLinks.map(function (link) {
    return document.querySelector(link.getAttribute('href'));
  }).filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        tocLinks.forEach(function (link) {
          var active = link.getAttribute('href') === '#' + entry.target.id;
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-20% 0px -68% 0px', threshold: 0 });

    sections.forEach(function (section) { observer.observe(section); });
  }

  var pageLanguage = (document.documentElement.lang || 'fr').split('-')[0];
  var numberLocale = pageLanguage === 'ar' ? 'ar-MA' : pageLanguage === 'en' ? 'en-MA' : 'fr-MA';

  var calculator = document.querySelector('[data-food-cost-calculator]');
  if (calculator) {
    var costInput = calculator.querySelector('[data-cost-input]');
    var priceInput = calculator.querySelector('[data-price-input]');
    var targetInput = calculator.querySelector('[data-target-input]');
    var foodCostOutput = calculator.querySelector('[data-food-cost-output]');
    var marginOutput = calculator.querySelector('[data-margin-output]');
    var targetPriceOutput = calculator.querySelector('[data-target-price-output]');
    var decimal = new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var percent = new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    function finiteValue(input) {
      var value = Number(input && input.value);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    function updateCalculator() {
      var cost = finiteValue(costInput);
      var price = finiteValue(priceInput);
      var target = finiteValue(targetInput);
      foodCostOutput.textContent = price > 0 ? percent.format((cost / price) * 100) + ' %' : '—';
      marginOutput.textContent = price > 0 ? decimal.format(price - cost) + ' MAD' : '—';
      targetPriceOutput.textContent = target > 0 ? decimal.format(cost / (target / 100)) + ' MAD' : '—';
    }

    [costInput, priceInput, targetInput].forEach(function (input) {
      if (input) input.addEventListener('input', updateCalculator);
    });
    updateCalculator();
  }

  var breakEvenCalculator = document.querySelector('[data-break-even-calculator]');
  if (breakEvenCalculator) {
    var fixedInput = breakEvenCalculator.querySelector('[data-fixed-input]');
    var variableInput = breakEvenCalculator.querySelector('[data-variable-input]');
    var ticketInput = breakEvenCalculator.querySelector('[data-ticket-input]');
    var daysInput = breakEvenCalculator.querySelector('[data-days-input]');
    var salesOutput = breakEvenCalculator.querySelector('[data-break-even-sales-output]');
    var monthlyCoversOutput = breakEvenCalculator.querySelector('[data-monthly-covers-output]');
    var dailyCoversOutput = breakEvenCalculator.querySelector('[data-daily-covers-output]');
    var moneyFormat = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 });
    var countFormat = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 1 });

    function safeValue(input) {
      var value = Number(input && input.value);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    function updateBreakEvenCalculator() {
      var fixedCosts = safeValue(fixedInput);
      var variableRate = safeValue(variableInput);
      var averageTicket = safeValue(ticketInput);
      var operatingDays = safeValue(daysInput);
      var contributionRate = 1 - (variableRate / 100);
      var valid = fixedCosts > 0 && contributionRate > 0 && averageTicket > 0 && operatingDays > 0;
      var breakEvenSales = valid ? fixedCosts / contributionRate : 0;
      var monthlyCovers = valid ? breakEvenSales / averageTicket : 0;
      var dailyCovers = valid ? monthlyCovers / operatingDays : 0;

      salesOutput.textContent = valid ? moneyFormat.format(breakEvenSales) + ' MAD' : '…';
      monthlyCoversOutput.textContent = valid ? countFormat.format(monthlyCovers) : '…';
      dailyCoversOutput.textContent = valid ? countFormat.format(dailyCovers) : '…';
    }

    [fixedInput, variableInput, ticketInput, daysInput].forEach(function (input) {
      if (input) input.addEventListener('input', updateBreakEvenCalculator);
    });
    updateBreakEvenCalculator();
  }

  /* ── Mesure · première partie, sans cookie et sans réseau ──────────────────
   * docs/seo/MEASUREMENT.md pose la règle du dépôt : aucun chiffre inventé, et
   * la mesure d'audience passe par Search Console. On n'ajoute donc PAS de
   * traceur tiers ici : il faudrait un script externe (que
   * tools/article-template-test.mjs interdit à juste titre), une bannière de
   * consentement et une mise à jour de la page de confidentialité.
   *
   * Ce qui est fourni, c'est la couche d'événements : impressions, clics de
   * carte, termes de recherche, profondeur de lecture, clics de guides liés et
   * conversions CTA sont émis en clair dans la page, où un collecteur
   * first-party pourra les lire le jour où le propriétaire en choisit un.
   * Rien ne quitte le navigateur, rien n'est stocké, aucun identifiant n'est
   * fabriqué. */
  var api = window.kiwiGuides = window.kiwiGuides || {};
  api.events = api.events || [];

  api.emit = function (name, detail) {
    if (!name) return null;
    var payload = {
      event: name,
      locale: pageLanguage,
      path: location.pathname,
      at: Date.now(),
      detail: detail || {}
    };
    api.events.push(payload);
    if (api.events.length > 200) api.events.shift();
    try {
      document.dispatchEvent(new CustomEvent('kiwi:guides', { detail: payload }));
    } catch (error) { /* CustomEvent indisponible : la file reste lisible. */ }
    return payload;
  };

  var emit = api.emit;

  /* Profondeur de lecture : un palier n'est émis qu'une fois, et seulement
   * quand il est réellement atteint. */
  if (article) {
    var depthMarks = [25, 50, 75, 100];
    var depthSeen = {};
    var watchDepth = function () {
      var height = Math.max(1, article.offsetHeight - window.innerHeight);
      var reached = Math.round(Math.min(1, Math.max(0, (window.scrollY - article.offsetTop) / height)) * 100);
      for (var i = 0; i < depthMarks.length; i += 1) {
        var mark = depthMarks[i];
        if (reached >= mark && !depthSeen[mark]) {
          depthSeen[mark] = true;
          emit('read_depth', { percent: mark });
        }
      }
    };
    window.addEventListener('scroll', watchDepth, { passive: true });
    watchDepth();
  }

  emit(article ? 'article_view' : 'library_view', {
    title: (document.title || '').replace(/ · Kiwi$/, '')
  });

  /* Un seul écouteur délégué couvre les guides liés, le précédent/suivant, les
   * cartes de la bibliothèque, les parcours et les CTA. */
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var cta = target.closest('[data-cta]');
    if (cta) {
      emit('cta_click', { placement: cta.getAttribute('data-cta'), href: cta.getAttribute('href') || '' });
      return;
    }
    var card = target.closest('[data-guide-link]');
    if (card) {
      emit('card_click', { guide: card.getAttribute('data-guide-link'), href: card.getAttribute('href') || '' });
      return;
    }
    var path = target.closest('[data-path-link]');
    if (path) {
      emit('path_click', { path: path.getAttribute('data-path-link'), href: path.getAttribute('href') || '' });
      return;
    }
    var sequence = target.closest('.sequence-link');
    if (sequence) {
      emit('sequence_click', { rel: sequence.getAttribute('rel'), href: sequence.getAttribute('href') || '' });
      return;
    }
    var related = target.closest('.related-card');
    if (related) {
      emit('related_click', { href: related.getAttribute('href') || '' });
    }
  }, { passive: true });

}());
