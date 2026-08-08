#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

let legacyCalls = 0;
const root = { hidden: true, innerHTML: '' };
const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
const document = {
  readyState: 'complete',
  body: { classList },
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
  Kiwi: { handlers: { 'nav-menu': () => { legacyCalls += 1; } }, pageShell() {} },
  KiwiVenue: {
    getCurrentVenueData: () => ({ id: 'resto', type: 'restaurant' }),
    getVenueType: () => 'restaurant',
  },
  addEventListener() {},
};
const context = {
  window, document, console, clearTimeout() {}, setTimeout() { return 1; },
  innerWidth: 1200, innerHeight: 800, Intl, Date, Math, Map, Number, String,
  Array, Object, RegExp,
};
window.window = window;
window.document = document;
vm.createContext(context);
new vm.Script(fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8')).runInContext(context);

assert.equal(typeof window.Kiwi.handlers['nav-menu'], 'function');
window.Kiwi.handlers['nav-menu']();
assert.equal(legacyCalls, 0, 'first restaurant click must never invoke the obsolete menu renderer');
assert.equal(root.hidden, false, 'the current menu shell should open immediately');
assert.match(root.innerHTML, /Chargement du menu/);

console.log('✓ first restaurant menu click is owned by the current workspace before MenuStore hydration');
