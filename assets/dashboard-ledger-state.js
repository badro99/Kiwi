/* A small, persistent local-durability notice beside the home KPIs. */
(function () {
  'use strict';
  function t() {
    var lang = document.documentElement.lang;
    return lang === 'ar' ? 'البيانات المحلية غير محفوظة' : lang === 'en' ? 'Local data not saved' : 'Données locales non enregistrées';
  }
  function paint() {
    var sales = window.KiwiSales, venue = window.KiwiVenue;
    if (!sales || !sales.freshness || !venue) return;
    var state = sales.freshness(venue.getVenue()), host = document.querySelector('.kpi-band-head');
    if (!host) return;
    var el = document.getElementById('ledger-local-unsaved');
    if (state.saved || state.pending) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('small'); el.id = 'ledger-local-unsaved'; el.setAttribute('role', 'status'); host.appendChild(el); }
    el.textContent = t();
  }
  if (window.KiwiSales) window.KiwiSales.subscribe(paint);
  if (window.KiwiVenue) window.KiwiVenue.subscribe(paint);
  window.addEventListener('kiwi:langchange', paint);
  paint();
})();
