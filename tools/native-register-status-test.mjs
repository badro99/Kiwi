#!/usr/bin/env node
// Execute the actual native status decision with an active/hidden retail rail.
// This is a code regression, not a replacement for the simulator screenshots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/src/native-runtime.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app/src/native-runtime.css', import.meta.url), 'utf8');
function actualFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, 'Actual native function exists: ' + name);
  const end = source.indexOf('\n  function ', start + 15);
  assert.ok(end > start, 'Function boundary exists: ' + name);
  return source.slice(start, end);
}
let currentDrawer = null, workspaceDark = false;
const styles = [];
const body = { classList: { contains: () => false } };
const document = {
  body,
  querySelector(selector) {
    if (selector === 'body.is-pos .vx-screen.is-on.vx-nav-open') return currentDrawer;
    return null;
  },
  getElementById() { return null; },
};
const context = vm.createContext({
  document,
  getComputedStyle: el => el.style,
  root: { getAttribute: key => key === 'data-caisse-theme' && workspaceDark ? 'dark' : 'light' },
  location: { pathname: '/kiwi-caisse.html' },
  openNativeLayers: () => [], themedDashboardGate: () => false,
  statusBar: {}, cap: { getPlatform: () => 'ios' },
  call(_plugin, method, options) { assert.equal(method, 'setStyle'); styles.push(options.style); },
});
vm.runInContext('var lastStatusBarStyle = "";\n' +
  ['nativeRegisterDrawerOpen', 'nativeBlockingLayer', 'paintStatusBar'].map(actualFunction).join('\n'), context);

function decide(drawer, dark, expected, blocked) {
  currentDrawer = drawer; workspaceDark = dark;
  assert.equal(vm.runInContext('nativeRegisterDrawerOpen()', context), blocked);
  assert.equal(vm.runInContext('nativeBlockingLayer()', context), blocked);
  vm.runInContext('lastStatusBarStyle = ""; paintStatusBar()', context);
  assert.equal(styles.at(-1), expected);
}
const visible = { hidden: false, style: { display: 'flex', visibility: 'visible' } };
decide(visible, false, 'DARK', true);
decide(null, false, 'LIGHT', false); // Closing immediately restores day status ink.
decide({ hidden: true, style: visible.style }, false, 'LIGHT', false);
decide({ hidden: false, style: { display: 'none', visibility: 'visible' } }, false, 'LIGHT', false);
decide({ hidden: false, style: { display: 'flex', visibility: 'hidden' } }, false, 'LIGHT', false);
decide(visible, true, 'DARK', true);
decide(null, true, 'DARK', false);
assert.match(source, /node\.matches\('\.vx-screen'\)/, 'Observe both open and close screen-class changes');
assert.match(css, /vx-screen\.is-on\.vx-nav-open::before\{[^}]*height:var\(--kiwi-safe-top\)[^}]*background:var\(--ink-bg/, 'The whole status area has one Ink backing, independent of direction');
console.log('Native retail status: 7 actual-code cases plus observer and safe-area backing guards passed.');
