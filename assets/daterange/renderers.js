/* Dashboard renderer entry. The parser-time dependency registry preserves the
 * synchronous dateRange factory contract. Exports __kiwiDateRangeParts; reads
 * only the declared child factories and passes the single live state owner on.
 * No merchant state is read while registering. */
(function () {
  'use strict';
  const scripts = [
    'assets/daterange/hero.js?v=5',
    'assets/daterange/kpi.js?v=6',
    'assets/daterange/revenue.js?v=5',
    'assets/daterange/activity.js?v=5',
    'assets/daterange/date-picker.js?v=5',
    'assets/daterange/cards.js?v=5',
    'assets/daterange/ledger.js?v=5',
    'assets/daterange/presentation.js?v=5',
  ];
  if (typeof document !== 'undefined' && document.readyState === 'loading' && typeof document.write === 'function' && !window.__kiwiHomeRenderers) {
    document.write(scripts.map(url => '<script src="' + url + '"><\/script>').join('\n'));
  }
  window.__kiwiDateRangeParts = function (__state) {
    const registry = window.__kiwiHomeRenderers;
    return Object.freeze(Object.assign({},
      registry['hero'](__state),
      registry['kpi'](__state),
      registry['revenue'](__state),
      registry['activity'](__state),
      registry['date-picker'](__state),
      registry['cards'](__state),
      registry['ledger'](__state),
      registry['presentation'](__state)));
  };
})();
