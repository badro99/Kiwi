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

}());
