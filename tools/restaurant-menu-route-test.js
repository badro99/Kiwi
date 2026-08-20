#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8');

assert.ok(source.includes('data-action="rmw-sub-add"'), 'the restaurant workspace exposes subsection creation');
assert.ok(!source.includes("if(!subs.length&&all.length<2)return ''"),
  'subsection creation must stay visible even in an empty or partially restored section');
assert.ok(source.includes('data-action="rmw-formula-duplicate"') && source.includes("handlers['rmw-formula-duplicate']"),
  'saved composed menus expose a wired reuse action');
assert.ok(source.includes('data-formula-template') && source.includes('data-apply-formula-template'),
  'the item editor exposes saved composed menus as reusable formula templates');
assert.ok(source.includes('data-save-formula-template') && source.includes('saveFormulaTemplate(name,clean)'),
  'empty and existing composed menus expose an explicit save-as-template action');
assert.ok(source.includes("Aucune formule enregistrée") && source.includes('Copier dans cet article'),
  'the reuse controls stay visible even before the first formula template exists');
assert.ok(source.includes('template.formula.slots') && source.includes('JSON.parse(JSON.stringify'),
  'reusing a saved formula copies its stages instead of sharing mutable state');
['rmw-cat-move','rmw-cat-edit','rmw-cat-delete','rmw-sub-rename','rmw-sub-delete'].forEach((action) => {
  assert.ok(source.includes(`data-action="${action}"`) && source.includes(`H['${action}']`),
    `${action} must have a visible control and a wired handler`);
});

/* Builds an isolated DOM/window stand-in and evaluates the workspace inside it.
 * `venueType` drives isRestaurant(); the returned handle exposes the body class
 * set, the pending timer queue and a counter of pageShell('menu') calls, which
 * is what a page hijack actually looks like from the outside. */
function boot(venueType) {
  const classes = new Set();
  const timers = [];
  const shell = { menuCalls: 0, lastName: null };
  let legacyCalls = 0;
  const root = { hidden: true, innerHTML: '' };
  const document = {
    readyState: 'complete',
    body: {
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        toggle() {},
        contains(c) { return classes.has(c); },
      },
    },
    head: { appendChild() {} },
    querySelector(selector) {
      if (selector === '[data-menu-root]') return root;
      if (selector === '.sidebar nav a[data-nav="menu"]') return {};
      return null;
    },
    querySelectorAll() { return []; },
    createElement() { return { id: '', textContent: '', appendChild() {}, style: {} }; },
    addEventListener() {},
  };
  const window = {
    Kiwi: {
      handlers: { 'nav-menu': () => { legacyCalls += 1; } },
      pageShell(name) { shell.lastName = name; if (name === 'menu') shell.menuCalls += 1; },
    },
    KiwiVenue: {
      getCurrentVenueData: () => ({ id: 'v', type: venueType }),
      getVenueType: () => venueType,
    },
    addEventListener() {},
  };
  const context = {
    window, document, console,
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    innerWidth: 1200, innerHeight: 800, Intl, Date, Math, Map, Number, String,
    Array, Object, RegExp,
  };
  window.window = window;
  window.document = document;
  vm.createContext(context);
  new vm.Script(source).runInContext(context);
  return {
    window, root, classes, shell, timers,
    legacy: () => legacyCalls,
    /* Runs queued callbacks until the queue empties or `cap` is exceeded.
     * Returns how many actually fired. */
    drain(cap) {
      let fired = 0;
      while (timers.length) {
        if (fired > cap) return fired;
        timers.shift()();
        fired += 1;
      }
      return fired;
    },
  };
}

/* 1 · A restaurant click still claims the route before MenuStore hydration. */
{
  const t = boot('restaurant');
  assert.equal(typeof t.window.Kiwi.handlers['nav-menu'], 'function');
  t.window.Kiwi.handlers['nav-menu']();
  assert.equal(t.legacy(), 0, 'first restaurant click must never invoke the obsolete menu renderer');
  assert.equal(t.root.hidden, false, 'the current menu shell should open immediately');
  assert.match(t.root.innerHTML, /Chargement du menu/);
}

/* 2 · The hydration retry must stop the moment the merchant leaves the menu.
 * This is the "menu keeps popping over Accueil" defect: the retry re-paints the
 * page shell on every tick, so without this guard it drags the merchant back
 * from whatever page they just opened. */
{
  const t = boot('restaurant');
  t.window.Kiwi.handlers['nav-menu']();
  const before = t.shell.menuCalls;
  assert.ok(t.timers.length > 0, 'a hydration retry should be queued');
  t.classes.delete('page-menu'); // merchant clicks Accueil
  t.drain(500);
  assert.equal(t.shell.menuCalls, before, 'a queued retry must never repaint the page the merchant navigated to');
  assert.equal(t.classes.has('page-menu'), false, 'page-menu must not come back behind the merchant');
}

/* 3 · The retry is bounded. isRestaurant() is a four-value whitelist, so a
 * boutique or a pressing never satisfies it — an uncapped loop would repaint
 * the shell for the life of the tab. */
{
  const t = boot('boutique');
  t.window.Kiwi.handlers['nav-menu']();
  t.drain(600); // the merchant stays put, so only the cap can end this
  assert.ok(t.shell.menuCalls < 120, `the retry must give up rather than repaint forever (${t.shell.menuCalls} paints)`);
  assert.equal(t.legacy(), 1, 'on giving up, a non-restaurant venue hands the route back to the legacy renderer');
}

console.log('✓ menu route: claimed before hydration, released on navigation, bounded on non-restaurant venues');
