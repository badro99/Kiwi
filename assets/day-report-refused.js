/* The server refused the day-report book (413, over budget). The local Z stays complete on this device but
   will not leave it: say so on the report page instead of leaving a silent "saved" look, and point at the
   export, which reads the local book. Strings are keyed by language here (the dashboard dictionary is frozen). */
(function () {
  'use strict';
  var words = {
    fr: ['Les rapports de journée sont gardés sur cet appareil seulement : le serveur les a refusés (trop volumineux). Exportez le Z maintenant.', 'Exporter le Z'],
    en: ['Day reports are kept on this device only: the server refused them (too large). Export the Z now.', 'Export the Z'],
    ar: ['تقارير اليوم محفوظة على هذا الجهاز فقط: رفضها الخادم (حجمها كبير). صدّر تقرير Z الآن.', 'تصدير تقرير Z']
  };
  var refused = '', box = null;
  function lang() { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || (document.documentElement.lang || 'fr').slice(0, 2); } catch (_) { return 'fr'; } }
  function w(i) { return (words[lang()] || words.fr)[i]; }
  function paint() {
    try {
      if (box && box.parentNode) box.parentNode.removeChild(box);
      box = null;
      if (!refused) return;
      var page = document.querySelector('.dash-genpage') || document.body;
      if (!page) return;
      box = document.createElement('div');
      box.setAttribute('role', 'alert'); box.setAttribute('data-kdr-refused', refused);
      box.style.cssText = 'padding:12px;margin:8px 0;background:var(--paper);color:var(--ink);border:1px solid var(--atlas)';
      var text = document.createElement('span'); text.textContent = w(0);
      var button = document.createElement('button'); button.type = 'button'; button.textContent = w(1); button.style.cssText = 'min-height:44px;margin-inline-start:8px';
      button.onclick = function () { try { if (window.KiwiReportPage && window.KiwiReportPage.exportDay) window.KiwiReportPage.exportDay(); } catch (_) {} };
      box.appendChild(text); box.appendChild(button);
      page.insertBefore(box, page.firstChild);
    } catch (_) {}
  }
  window.addEventListener('kiwi-day-report-refused', function (event) { refused = (event && event.detail && event.detail.why) || 'too-large'; paint(); });
  /* The report page rebuilds itself on every render: put the notice back. */
  window.addEventListener('kiwi:report-model', paint);
  window.addEventListener('kiwi:langchange', paint);
  window.KiwiDayReportRefused = { refused: function () { return refused; }, paint: paint };
})();
