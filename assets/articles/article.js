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

}());
