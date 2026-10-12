#!/usr/bin/env node
/* « Analyse du menu » · phase 1 : la page restaurant « Marges » devient
 * « Analyse du menu », et Performance + Heures de pointe y déménagent depuis
 * Menu & modificateurs sans changer de données ni de comportement.
 *
 * Ce que ce fichier tient :
 *   1. Menu & modificateurs ne montre plus les deux onglets ; un ancien lien
 *      vers l'un d'eux ouvre l'analyse sur le bon onglet.
 *   2. Les panneaux déplacés sont les mêmes fonctions (pas de copie) : les
 *      suites restaurant-menu-performance / peak-hours / ledger-reconciliation
 *      les vérifient chiffre par chiffre par KiwiRestaurantMenuWorkspace.analysis.
 *   3. finance.js : restaurant ⇒ titre, fil d'Ariane, quatre onglets sur la
 *      lentille liquide ; autre métier ⇒ « Marges » sans onglets.
 *   4. La page reste réservée au propriétaire, y compris par l'ancien lien.
 *   5. Libellés FR / EN / AR et console alignés ; les autres métiers gardent
 *      « Marges ». */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '\n      ' + String(extra).slice(0, 300) : '')); }
};
console.log('■ Analyse du menu (tools/menu-analysis-test.mjs)');

/* ── 1 · Menu & modificateurs : le vrai fichier, sans les deux onglets ── */
function bootWorkspace({ finance } = {}) {
  const root = { hidden: true, innerHTML: '' };
  const classList = { add() {}, remove() {}, toggle() {}, contains: (x) => x === 'page-menu' };
  const node = () => ({ id: '', textContent: '', innerHTML: '', style: {}, classList, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const document = {
    readyState: 'complete', body: { classList }, head: { appendChild() {} },
    querySelector: (s) => (s === '[data-menu-root]' ? root : null),
    querySelectorAll: () => [], createElement: node, addEventListener() {},
  };
  const data = { cats: [{ id: 'plats', name: 'Plats' }], items: [{ id: 'a', name: 'Tajine', price: 80, catId: 'plats', avail: true }], stations: [], opts: [] };
  const window = {
    Kiwi: { handlers: {}, pageShell() {}, setActivePage() {} },
    KiwiVenue: { getCurrentVenueData: () => ({ id: 'resto', name: 'Restaurant test', type: 'restaurant' }), getVenueType: () => 'restaurant', subscribe() {} },
    KiwiMenuStore: { data: () => data, subscribe() {}, kitchenId: () => '' },
    KiwiSales: { list: () => [] },
    KiwiRestaurantRecipes: { get: () => null, metrics: () => ({ costComplete: false, theoreticalCost: null, actualCost: null }) },
    addEventListener() {},
  };
  if (finance) window.KiwiFinance = finance;
  const context = { window, document, console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900 };
  window.window = window; window.document = document;
  vm.createContext(context);
  new vm.Script(R('assets/restaurant-menu-workspace.js'), { filename: 'restaurant-menu-workspace.js' }).runInContext(context);
  return { window, root };
}
{
  const src = R('assets/restaurant-menu-workspace.js');
  const tabListSrc = (src.match(/function tabList\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  const tabsSrc = (src.match(/function tabs\(\)\{[\s\S]*?\.join\(''\);/) || [''])[0];
  const panelSrc = (src.match(/function panel\(\)\{[^\n]*/) || [''])[0];
  ok(tabListSrc && !/'performance'|'hours'/.test(tabListSrc), 'Menu & modificateurs : la liste d’onglets (téléphone) n’a plus Performance ni Heures', tabListSrc);
  ok(tabsSrc && !/'performance'|'hours'/.test(tabsSrc), 'Menu & modificateurs : la rangée d’onglets n’a plus Performance ni Heures', tabsSrc);
  ok(panelSrc && !/performancePanel|hoursPanel/.test(panelSrc), 'Menu & modificateurs : aucun onglet interne ne rend plus ces panneaux', panelSrc);
  ok(/analysis:\{[\s\S]*?performancePanel\(\)[\s\S]*?hoursPanel\(\)/.test(src), 'les panneaux exportés sont les fonctions d’origine, pas une copie');

  const opened = [];
  const { window, root } = bootWorkspace({ finance: { open: (k) => opened.push(k), isActive: () => false, render() {} } });
  const H = window.Kiwi.handlers;
  ok(typeof H['rmw-tab'] === 'function' && window.KiwiRestaurantMenuWorkspace && window.KiwiRestaurantMenuWorkspace.analysis, 'le workspace démarre et exporte .analysis');
  H['rmw-tab']({ dataset: { tab: 'menu' } });
  const menuHtml = root.innerHTML;
  ok(menuHtml.length > 200 && !/data-tab="performance"|data-tab="hours"/.test(menuHtml), 'rendu réel de Menu & modificateurs : pas de bouton Performance ni Heures', menuHtml.slice(0, 200));
  ok(/data-tab="recipes"/.test(menuHtml) && /data-tab="nutrition"/.test(menuHtml) && /data-tab="alerts"/.test(menuHtml) && /data-tab="nfc"/.test(menuHtml), 'Recettes, Nutrition, Alertes et NFC restent dans Menu & modificateurs');
  H['rmw-tab']({ dataset: { tab: 'performance' } });
  H['rmw-tab']({ dataset: { tab: 'hours' } });
  ok(opened.join(',') === 'performance,hours', 'un ancien lien vers Performance / Heures ouvre l’analyse sur le bon onglet', opened.join(','));
  ok(root.innerHTML === menuHtml, 'l’ancien lien ne rend rien dans Menu & modificateurs');

  const perf = window.KiwiRestaurantMenuWorkspace.analysis.performance();
  const hours = window.KiwiRestaurantMenuWorkspace.analysis.hours();
  ok(/rmw-analysis-panel/.test(perf) && /rmw-perf/.test(perf), 'analysis.performance() rend le panneau Performance', perf.slice(0, 160));
  ok(/rmw-analysis-panel/.test(hours) && hours.length > 120, 'analysis.hours() rend le panneau Heures de pointe', hours.slice(0, 160));

  /* Sans finance.js chargé, l'ancien lien ne casse rien et ne bascule pas d'onglet. */
  const lone = bootWorkspace();
  lone.window.Kiwi.handlers['rmw-tab']({ dataset: { tab: 'menu' } });
  const before = lone.root.innerHTML;
  lone.window.Kiwi.handlers['rmw-tab']({ dataset: { tab: 'performance' } });
  ok(lone.root.innerHTML === before, 'sans page d’analyse, l’ancien lien laisse Menu & modificateurs tel quel');
}

/* ── 2 · finance.js : la page « Analyse du menu » ── */
function bootFinance({ restaurant = true, role = 'owner', lang = 'fr', saved = null } = {}) {
  const noop = () => {};
  const root = { innerHTML: '' };
  /* finance.js hands its title to Kiwi.breadcrumb() (interactive.js paints the
     localized « Accueil / … » and repaints it on a language switch). The stub
     keeps what it was handed, read the way the painter reads it. */
  const breadcrumb = { title: null, read() { const t = typeof this.title === 'function' ? this.title() : this.title; return t == null ? '' : String(t); } };
  const el = () => ({ classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop,
    removeAttribute: noop, appendChild: noop, addEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], innerHTML: '', textContent: '', style: {}, dataset: {} });
  const store = new Map(saved == null ? [] : [['kiwiMenuAnalysisTab', saved]]);
  const win = {
    Kiwi: { handlers: {}, toast: noop, setActivePage: noop, pageShell: noop, modal: noop, breadcrumb: (t) => { breadcrumb.title = t; } },
    KiwiVenue: { getVenue: () => 'v-test', getVenueData: () => ({ name: 'Restaurant test' }), isCustom: () => true, subscribe: noop },
    KiwiEnv: { isReal: () => true, demosAllowed: false },
    KiwiI18n: { getLang: () => lang },
    KiwiMenuStore: { items: () => [] },
    KiwiCost: { subscribe: noop },
    KiwiSales: { list: () => [], subscribe: noop },
    KiwiRestaurantMenuWorkspace: {
      isRestaurant: () => restaurant,
      analysis: { performance: () => '<section data-stub="perf">PERF</section>', hours: () => '<section data-stub="hours">HOURS</section>' },
    },
    __kiwiRole: role,
    addEventListener: noop, setTimeout, clearTimeout, console, scrollTo: noop,
  };
  win.window = win;
  const document = { readyState: 'complete', body: el(), documentElement: el(), head: el(),
    addEventListener: noop, createElement: el, getElementById: () => null,
    querySelector: (s) => (s === '[data-finance-root]' ? root : null), querySelectorAll: () => [] };
  const ctx = vm.createContext({ window: win, Kiwi: win.Kiwi, document, console, setTimeout, clearTimeout,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } });
  vm.runInContext(R('assets/finance.js'), ctx, { filename: 'finance.js' });
  return { win, root, breadcrumb, store };
}
{
  const f = bootFinance();
  f.win.Kiwi.handlers['nav-finance']();
  const html = f.root.innerHTML;
  ok(/class="fin-title">Analyse du menu</.test(html), 'restaurant : la page s’appelle « Analyse du menu »', html.slice(0, 300));
  ok(f.breadcrumb.read() === 'Analyse du menu', 'restaurant : le fil d’Ariane dit « Analyse du menu »', f.breadcrumb.read());
  const tabs = html.match(/data-fin-tab="(\w+)"/g) || [];
  ok(tabs.join() === 'data-fin-tab="overview",data-fin-tab="sales",data-fin-tab="performance",data-fin-tab="hours"', 'quatre onglets : Vue d’ensemble · Ventes · Performance · Heures de pointe', tabs.join());
  ok(/class="fin-seg fin-tabs" data-lens-demo role="tablist"/.test(html) && (html.match(/role="tab" data-lens-item/g) || []).length === 4, 'les onglets passent par la lentille liquide (data-lens-demo / data-lens-item)');
  ok(/data-fin-tab="overview" class="on" aria-selected="true"/.test(html) && /data-fin-tab-open="overview"/.test(html), 'par défaut, la vue d’ensemble est ouverte');
  ok(!/data-stub=/.test(html), 'la vue d’ensemble ne rend ni Performance ni Heures');

  f.win.KiwiFinance.open('performance');
  const p = f.root.innerHTML;
  ok(/data-stub="perf"/.test(p) && /data-fin-tab-open="performance"/.test(p), 'open("performance") rend le panneau Performance', p.slice(0, 200));
  ok(!/data-fin-period=/.test(p), 'le choix de période (Aujourd’hui / 7 j / 30 j) reste sur la vue d’ensemble : Performance garde ses 30 journées');
  ok(f.store.get('kiwiMenuAnalysisTab') === 'performance', 'l’onglet ouvert est retenu pour la prochaine visite');
  f.win.KiwiFinance.open('hours');
  ok(/data-stub="hours"/.test(f.root.innerHTML), 'open("hours") rend le panneau Heures de pointe');
  f.win.KiwiFinance.open('nimporte');
  ok(/data-stub="hours"/.test(f.root.innerHTML), 'un onglet inconnu ne change pas l’onglet ouvert');

  const remembered = bootFinance({ saved: 'hours' });
  remembered.win.Kiwi.handlers['nav-finance']();
  ok(/data-stub="hours"/.test(remembered.root.innerHTML), 'au retour, l’onglet retenu se rouvre');
  const garbage = bootFinance({ saved: '<img onerror=x>' });
  garbage.win.Kiwi.handlers['nav-finance']();
  ok(/data-fin-tab-open="overview"/.test(garbage.root.innerHTML) && !/onerror/.test(garbage.root.innerHTML), 'une valeur retenue inconnue retombe sur la vue d’ensemble');

  const mgr = bootFinance({ role: 'manager' });
  mgr.win.KiwiFinance.open('performance');
  ok(mgr.root.innerHTML === '', 'un gérant ne l’ouvre pas, même par l’ancien lien Performance (page réservée au propriétaire)');

  const other = bootFinance({ restaurant: false });
  other.win.Kiwi.handlers['nav-finance']();
  ok(other.root.innerHTML.length > 100 && !/Analyse du menu/.test(other.root.innerHTML) && !/data-fin-tab=/.test(other.root.innerHTML), 'autre métier : la page « Marges » d’avant, sans onglets ni titre d’analyse', other.root.innerHTML.slice(0, 200));
  ok(other.breadcrumb.read() === 'Marges', 'autre métier : le fil d’Ariane reste « Marges »', other.breadcrumb.read());

  const en = bootFinance({ lang: 'en' }); en.win.Kiwi.handlers['nav-finance']();
  ok(/Menu analysis/.test(en.root.innerHTML) && /Peak hours/.test(en.root.innerHTML) && en.breadcrumb.read() === 'Menu analysis', 'anglais : « Menu analysis », « Peak hours », et le fil d’Ariane aussi');
  const ar = bootFinance({ lang: 'ar' }); ar.win.Kiwi.handlers['nav-finance']();
  ok(/تحليل القائمة/.test(ar.root.innerHTML) && /ساعات الذروة/.test(ar.root.innerHTML), 'arabe : « تحليل القائمة », « ساعات الذروة »');
  const all = [html, en.root.innerHTML, ar.root.innerHTML].join('');
  ok(!/—/.test(all.replace(/<[^>]+>/g, '')), 'aucun tiret cadratin dans le texte affiché');
}

/* ── 3 · libellés ── */
{
  const venues = R('assets/venues.js');
  ok(/\{ nav: 'finance', label: 'Analyse du menu',\s+i18n: 'sidebar\.restaurant\.finance'/.test(venues), 'barre latérale restaurant : « Analyse du menu »');
  const i18n = R('assets/i18n.js');
  ok(/'sidebar\.restaurant\.finance': 'Menu analysis'/.test(i18n) && /'sidebar\.restaurant\.finance': 'تحليل القائمة'/.test(i18n), 'barre latérale : EN « Menu analysis », AR « تحليل القائمة »');
  ok(/\{ key:'finance',\s+label:'Analyse du menu' \}/.test(R('kiwi-admin.html')), 'console : le module restaurant s’appelle « Analyse du menu » (même clé finance)');
  ok(/fr: 'Marges'|label: 'Marges'|fr:'Marges'/.test(venues.replace(/\{ nav: 'finance', label: 'Analyse du menu'[^\n]*/, '')), 'les autres métiers gardent « Marges »');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} contrôles verts${fail ? `, ${fail} en échec` : ''}`);
process.exit(fail ? 1 : 0);
