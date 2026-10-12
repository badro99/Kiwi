#!/usr/bin/env node
/* Anciens écrans Équipe, Paie et Menu de assets/venues.js · retirés, et le
 * « menu » d'une activité sans carte mène à son propre catalogue.
 *
 * 2026-10-12. venues.js dessinait encore ses propres pages Équipe, Paie et
 * Menu, en français seulement : « Nouveau membre », « Fiche membre »,
 * « Nouveau groupe d'options », « Marquer un article comme 86 »… Vérifié dans
 * un vrai navigateur, en démo (Café Atlas, Spa Bahia, Maison Mansour, Go Ultra)
 * et sur la pile locale avec un vrai compte spa :
 *  · Équipe et Paie ne s'affichaient plus jamais, team.js prend les deux routes ;
 *  · le Menu, si. Un spa, une boutique ou la vue Go Ultra qui demandait à
 *    l'assistant « ouvre le menu » recevait la carte de restaurant héritée,
 *    tajines, « Stations cuisine » et modales comprises.
 * Ce banc garde les trois écrans retirés, garde la couche de données que
 * d'autres modules lisent encore, exécute le vrai routeur du menu, et refuse
 * toute règle CSS .eq-*, .mi-* ou .pay-* que plus rien n'affiche.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.env.KIWI_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const venues = read('assets/venues.js');

/* 1 · Les écrans hérités sont partis, modales et gestionnaires compris. */
const GONE = [
  'eqShowPage', 'renderEquipe', 'eqOpenStaffModal', 'eqOpenProfileModal', 'eqOpenPlannerModal',
  'eqOpenRowMenu', 'eqWireHandlers',
  'miShowPage', 'renderMenu', 'miWireHandlers', 'miOpenItemModal', 'miOpenGroupModal',
  'miOpenAddStationModal', 'miOpenMark86Modal', 'miOpenAddSubcatModal', 'miOpenClassifyModal',
  'miOpenHowtoModal', 'miDeleteItem', 'miConfirmDeleteGroup',
  'payShowPage', 'renderPayroll', 'payOpenShiftModal', 'payWireHandlers',
];
const left = GONE.filter((n) => new RegExp(`\\b${n}\\b`).test(venues));
check(left.length === 0, `venues.js no longer defines or calls the legacy pages and modals (${GONE.length} names)${left.length ? ' · still there: ' + left.join(', ') : ''}`);
check(!/\bH\[\s*'(?:eq|mi|pay)-[a-z0-9-]+'\s*\]\s*=/.test(venues), 'venues.js registers no eq-*, mi-* or pay-* handler');
check(!/data-action="(?:eq|mi|pay)-/.test(venues), 'venues.js draws no control carrying an eq-*, mi-* or pay-* action');
check(!/'Nouveau membre'|'Fiche membre'|Nouveau groupe d.options|comme 86/.test(venues), 'the French-only modal titles went with them');
const html = read('dashboard.html');
check(!/data-payroll-root/.test(html), 'the empty section only the legacy payroll page painted is gone from dashboard.html');
check(/<section class="dash-equipe" data-equipe-root hidden><\/section>/.test(html) && /<section class="dash-menu" data-menu-root hidden><\/section>/.test(html),
  'the Équipe and Menu hosts stay, team.js and the restaurant workspace render into them');

/* 2 · La couche de données que d'autres modules lisent est intacte. */
for (const [name, why] of [
  ['const STAFF = {', 'the demo roster (sidebar Équipe badge, KiwiRecipes per-staff variance)'],
  ['const MENU = {', 'the demo carte (KiwiMenu for the assistant, live feed, recipes)'],
  ['function miItems(', 'menu items for KiwiVenue.getMenuItems (live feed order contents)'],
  ['function miStationState(', 'station timing for the KDS'],
  ['function eqPresentCount(', 'the present-staff count behind the sidebar badge'],
]) check(venues.includes(name), `venues.js keeps ${why}`);
check(/getStationState: \(s\) => miStationState\(s\)/.test(venues) && /getStations: \(id\) => miGetStations\(/.test(venues) && /getMenuItems: \(venue\) =>/.test(venues),
  'KiwiVenue still exports getStationState, getStations and getMenuItems');

/* 3 · Équipe et Paie appartiennent à team.js seul. */
const team = read('assets/team.js');
check(/H\['nav-equipe'\] = \(\) => showPage\(\);/.test(team) && /window\.addEventListener\('load', \(\) => setTimeout\(installNavHandlers, 0\)\);/.test(team),
  'team.js installs nav-equipe and nav-payroll at load and again after every load listener');
check(!/H\['nav-(?:equipe|payroll)'\]\s*=/.test(venues), 'venues.js no longer claims nav-equipe or nav-payroll, at start or on load');

/* 4 · Le vrai routeur du menu, exécuté. */
const start = venues.indexOf('  /* ═══════════ MENU · ROUTING');
const LOAD = "  window.addEventListener('load', menuWireHandlers);";
const loadAt = venues.indexOf(LOAD, start);
assert.ok(start > 0 && loadAt > start, 'the MENU · ROUTING block is still in venues.js');
const routerSrc = venues.slice(start, loadAt + LOAD.length);
check(!/—/.test(routerSrc), 'the router\'s copy carries no em dash');

function world({ type, sidebar = [], workspace = 'ready', lang = 'fr', pageMenu = false }) {
  const calls = [];
  const timers = [];
  const handlers = {};
  for (const nav of ['services', 'inventory', 'tarifs', 'accueil']) handlers['nav-' + nav] = () => calls.push('nav-' + nav);
  const bodyClasses = new Set(pageMenu ? ['page-menu'] : []);
  const crumb = { innerHTML: 'Accueil / Menu' };
  const loads = [];
  const W = {
    show: (force) => calls.push('workspace.show:' + force),
    render: () => calls.push('workspace.render'),
    isRestaurant: () => ['restaurant', 'cafe', 'café', 'restauration'].includes(type),
  };
  const win = {
    Kiwi: {
      handlers,
      toast: (title, opts) => calls.push('toast:' + title + ' | ' + (opts && opts.desc)),
      setActivePage: (p) => calls.push('active:' + p),
    },
    KiwiI18n: { getLang: () => lang },
    KiwiRestaurantMenuWorkspace: workspace === 'ready' ? W : undefined,
    addEventListener: (ev, fn) => { if (ev === 'load') loads.push(fn); },
  };
  const doc = {
    body: { classList: { contains: (c) => bodyClasses.has(c), remove: (c) => bodyClasses.delete(c), add: (c) => bodyClasses.add(c) } },
    querySelector: (sel) => {
      const m = /^\.sidebar nav a\[data-nav="([^"]+)"\]$/.exec(sel);
      if (m) return sidebar.includes(m[1]) ? {} : null;
      if (sel === '.breadcrumb') return crumb;
      return null;
    },
  };
  const ctx = vm.createContext({
    window: win, document: doc,
    getVenueType: () => type,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
  });
  vm.runInContext(routerSrc + '\nthis.showMenu = showMenu; this.menuOwnedByWorkspace = menuOwnedByWorkspace;', ctx);
  return {
    ctx, calls, handlers, win, W, bodyClasses, crumb,
    tick: () => { const fns = timers.splice(0); fns.forEach((f) => f()); },
    fireLoad: () => loads.forEach((f) => f()),
  };
}

{
  const w = world({ type: 'restaurant', sidebar: ['menu', 'tables'] });
  check(w.ctx.showMenu() === true && w.calls.join() === 'workspace.show:true', 'a restaurant opens the restaurant workspace, nothing else');
}
{
  const w = world({ type: 'restaurant', sidebar: ['menu'], workspace: 'late' });
  w.ctx.showMenu();
  check(w.calls.length === 0, 'while the workspace script is still loading, a restaurant waits rather than opening anything else');
  w.win.KiwiRestaurantMenuWorkspace = w.W;
  w.tick();
  check(w.calls.join() === 'workspace.show:true', 'and opens the workspace as soon as it is there');
}
{
  const w = world({ type: 'spa', sidebar: ['appointments', 'services', 'practitioners', 'clients', 'products'] });
  check(w.ctx.showMenu() === true && w.calls.join() === 'nav-services', 'a spa asking for « le menu » lands on its own Soins / Services page');
}
{
  const w = world({ type: 'boutique', sidebar: ['inventory', 'categories', 'promos'] });
  w.ctx.showMenu();
  check(w.calls.join() === 'nav-inventory', 'a boutique lands on its inventory');
}
{
  const w = world({ type: 'hotel', sidebar: ['reception', 'chambres', 'tarifs'] });
  w.ctx.showMenu();
  check(w.calls.join() === 'nav-tarifs', 'a hotel lands on its rates');
}
for (const [lang, title] of [['fr', 'Pas de carte ici'], ['en', 'No menu here'], ['ar', 'لا توجد قائمة هنا']]) {
  const w = world({ type: 'fusion', sidebar: ['accueil', 'equipe', 'payroll'], lang });
  const opened = w.ctx.showMenu();
  check(opened === false && w.calls.length === 1 && w.calls[0].startsWith('toast:' + title + ' | '),
    `with no catalogue at all (the Go Ultra overview) it says so in ${lang.toUpperCase()}, and paints no restaurant carte`);
}
{
  const w = world({ type: 'spa', sidebar: ['services'] });
  check(typeof w.handlers['nav-menu'] === 'function', 'the router takes nav-menu as soon as venues.js runs');
  w.handlers['nav-menu'] = () => w.calls.push('legacy drawer');
  w.fireLoad();
  w.handlers['nav-menu']();
  check(w.calls.join() === 'nav-services', 'and takes it back on load from the pages.js / pages-pro.js drawers, so the workspace\'s fallback is this router');
}
{
  const w = world({ type: 'restaurant', sidebar: ['menu'], pageMenu: true });
  /* pages.js / pages-pro.js run after venues.js and REPLACE nav-accueil:
     the teardown has to come back on load, or the dashboard stays hidden
     behind the menu page (caught in the browser on 2026-10-12). */
  w.handlers['nav-accueil'] = () => w.calls.push('pages-pro accueil');
  w.fireLoad();
  w.handlers['nav-accueil']();
  check(w.calls.includes('pages-pro accueil') && !w.bodyClasses.has('page-menu') && /Tableau de bord/.test(w.crumb.innerHTML) && w.calls.includes('active:accueil'),
    'going home from the workspace still clears the menu page, even after pages.js / pages-pro.js replaced nav-accueil');
}
check(/refreshMenu: \(\) => \{\n\s+if \(!document\.body\.classList\.contains\('page-menu'\) \|\| !menuOwnedByWorkspace\(\)\) return;\n\s+menuWorkspace\(\)\?\.render\?\.\(\);/.test(venues),
  'KiwiVenue.refreshMenu only ever repaints the workspace, never a legacy carte');
const rmw = read('assets/restaurant-menu-workspace.js');
check(/if\(legacyMenuHandler\)return legacyMenuHandler\.apply\(this,arguments\);/.test(rmw),
  'the workspace still hands non-restaurant activities to the handler it replaced, the router above');

/* 5 · Pas de CSS pour des classes que plus rien n'affiche. */
const PFX = '(?:eq|mi|pay)-[a-z0-9][a-z0-9-]*';
const listFiles = (dir, rx) => fs.readdirSync(path.join(root, dir)).filter((f) => rx.test(f)).map((f) => path.posix.join(dir, f));
const stripStyles = (s) => s.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ');
const emitters = [...listFiles('assets', /\.js$/), ...listFiles('.', /\.html$/)]
  .map((f) => (f.endsWith('.html') ? stripStyles(read(f)) : read(f))).join('\n');
const emitted = new Set(emitters.match(new RegExp(`(?<![a-z0-9-])${PFX}(?![a-z0-9-])`, 'g')) || []);
const dynamic = [...emitters.matchAll(new RegExp(`(${PFX}-)\\$\\{`, 'g'))].map((m) => m[1]);
const cssFiles = ['dashboard.html', ...listFiles('assets', /\.css$/)];
const orphans = [];
for (const f of cssFiles) {
  let css = read(f);
  if (f.endsWith('.html')) css = (css.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n');
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(new RegExp(`\\.(${PFX})(?![a-z0-9-])`, 'g'))) {
    const c = m[1];
    if (!emitted.has(c) && !dynamic.some((p) => c.startsWith(p))) orphans.push(`${f}: .${c}`);
  }
}
check(orphans.length === 0, `every .eq-*, .mi-* and .pay-* class styled in dashboard.html and assets/*.css is drawn by some script or page${orphans.length ? ' · orphans: ' + [...new Set(orphans)].slice(0, 12).join(', ') : ''}`);

/* 6 · Chaque page pleine cache encore l'accueil. Retirer `.dash-payroll` du
 * bout d'une liste « body.page-x … { display: none } » emportait l'accolade :
 * la liste se collait à la règle suivante, `.dash-x { display: block }`, et
 * l'Équipe s'ouvrait sous le tableau de bord, 5 500 px plus bas. */
const pageCss = (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const cssRules = [...pageCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sels: m[1].split(',').map((s) => s.trim()), body: m[2] }));
const notHidden = [];
for (const page of ['equipe', 'menu', 'stock', 'finance', 'conformite']) {
  for (const part of ['.page-head', '.dash-date-range', '.dash-standard', '.dash-fusion']) {
    const sel = `body.page-${page} ${part}`;
    const own = cssRules.filter((r) => r.sels.includes(sel));
    if (!own.length || !own.every((r) => /display:\s*none\s*!important/.test(r.body))) notHidden.push(sel);
  }
}
check(notHidden.length === 0, `Équipe, Menu, Stock, Finance and Conformité still hide the home dashboard while they are open${notHidden.length ? ' · not hidden: ' + notHidden.join(', ') : ''}`);

console.log(`\nlegacy-venue-modals: ${checks} passed, 0 failed`);
