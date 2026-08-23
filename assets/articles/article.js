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

  var calculator = document.querySelector('[data-food-cost-calculator]');
  if (calculator) {
    var costInput = calculator.querySelector('[data-cost-input]');
    var priceInput = calculator.querySelector('[data-price-input]');
    var targetInput = calculator.querySelector('[data-target-input]');
    var foodCostOutput = calculator.querySelector('[data-food-cost-output]');
    var marginOutput = calculator.querySelector('[data-margin-output]');
    var targetPriceOutput = calculator.querySelector('[data-target-price-output]');
    var decimal = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var percent = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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

}());
