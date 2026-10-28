/* Parser-time startup dependencies. These classic deferred scripts must execute
 * before DOMContentLoaded: kit adapters and role guards capture their handlers.
 * Keep the proven shell order; optional workspace owners stay in dashboard-loader. */
(() => {
  'use strict';
  if (document.currentScript?.dataset.startup === 'menu') {
    if (document.readyState !== 'loading') throw new Error('Dashboard startup requires the HTML parser');
    const menuScripts = [
      'assets/menu-catalog/state.js?v=5',
      'assets/menu-catalog/modifiers.js?v=3',
      'assets/menu-catalog/item-list.js?v=3',
      'assets/menu-catalog/formulas.js?v=3',
      'assets/menu-catalog/item-editor.js?v=7',
      'assets/menu-catalog/media.js?v=3',
      'assets/menu-catalog/availability.js?v=3',
      'assets/menu-catalog.js?v=41',
    ];
    document.write(menuScripts.map(url => '<script src="' + url + '" defer fetchpriority="low"><\/script>').join('\n'));
    return;
  }
  const scripts = [
    'assets/pages-pro-office.js?v=3',
    'assets/pages-pro.js?v=2192',
    'assets/pages-pro-boutique.js?v=12',
    'assets/pages-pro-spa-starter.js?v=2',
    'assets/restaurant-units.js?v=2',
    'assets/stock-identity.js?v=3',
    'assets/menu-nutrition.js?v=4',
    'assets/restaurant-recipes.js?v=14',
    'assets/menu-i18n.js?v=6',
    'assets/kiwi-select.js?v=4',
    'assets/food-trade-settings.js?v=2',
    'assets/menu-promos.js?v=8',
    'assets/menu-promos-dashboard.js?v=6',
    'assets/restaurant-menu/strings.js?v=2',
    'assets/restaurant-menu/recipes.js?v=3',
    'assets/restaurant-menu/styles.js?v=2',
    'assets/restaurant-menu-workspace.js?v=125',
    'assets/sold-insights.js?v=17',
    'assets/boutique-promos-dashboard.js?v=23',
    'assets/day-report.js?v=38',
    'assets/z-reconciliation.js?v=29',
    'assets/month-report.js?v=16',
    'assets/day-report-export.js?v=18',
    'assets/day-report-conflicts.js?v=2',
    'assets/day-report-dash.js?v=44',
    'assets/stock/strings.js?v=10',
    'assets/stock/state.js?v=4',
    'assets/stock.js?v=101',
    'assets/catalog-workspace.js?v=5',
    'assets/planning-core.js?v=13',
    'assets/team/catalog.js?v=2',
    'assets/team.js?v=343',
    'assets/team/profile-ui.js?v=13',
    'assets/team-hours.js?v=17',
    'assets/cancellation-history.js?v=3',
    'assets/cash-sessions.js?v=8',
    'assets/weather.js?v=1',
    'assets/briefing-rules.js?v=2',
    'assets/briefing-persistence.js?v=2',
    'assets/briefing.js?v=38',
    'assets/simple-food-cost.js?v=18',
    'assets/finance.js?v=14',
    'assets/conformite.js?v=8',
    'assets/production-action-guard.js?v=6',
    'assets/staff-roles.js?v=2',
    'assets/help-centre.js?v=7',
    'assets/account.js?v=33',
    'assets/design-2026.js?v=2',
    'assets/design-vexel-layout.js?v=2097',
    'assets/liquid-glass.js?v=1',
    'assets/hotel-language.js?v=3',
    'assets/hotel-housekeeping.js?v=1',
    'assets/hotel/model.js?v=8',
    'assets/hotel.js?v=91',
  ];
  if (document.readyState !== 'loading') throw new Error('Dashboard startup requires the HTML parser');
  const normalPriority = new Set(['assets/kiwi-select.js', 'assets/catalog-workspace.js', 'assets/staff-roles.js', 'assets/design-vexel-layout.js']);
  document.write(scripts.map(url => '<script' + (['assets/team.js', 'assets/team-hours.js'].includes(url.split('?')[0]) ? ' type="module"' : '') + ' src="' + url + '" defer' + (normalPriority.has(url.split('?')[0]) ? '' : ' fetchpriority="low"') + '><\/script>').join('\n'));
})();
