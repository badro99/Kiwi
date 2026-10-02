#!/usr/bin/env node
/* Tickets #0149 + #0150 · Menu & modifiers tab bar and phone panels.
 *
 * #0149: tapping a tab rebuilt the whole page and the bar jumped back to the
 * first tab. Guard: render() preserves each pill row's scrollLeft and brings
 * the active tab into view; the row is registered with liquid-lens (surface
 * skin, no invented selection style) and becomes a swipeable row on phones.
 * #0150: desktop-wide panels bled past the phone viewport. Guard: the 7-column
 * perf table scrolls inside its wrapper, the rotated matrix axis becomes a
 * normal caption on phones, and the hours grid minimums fit 360px.
 *
 *   node tools/menu-phone-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rmw = readFileSync(path.join(ROOT, 'assets/restaurant-menu-workspace.js'), 'utf8');
const lens = readFileSync(path.join(ROOT, 'assets/liquid-lens.js'), 'utf8');
const mobile = readFileSync(path.join(ROOT, 'assets/mobile.css'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

ok('render() preserves pill-row scroll across re-render', () => {
  assert.ok(/\.map\(r => r\.scrollLeft \|\| 0\)/.test(rmw), 'must snapshot scrollLeft before innerHTML swap');
  assert.ok(/re-query after painting/.test(rmw), 'must restore onto post-swap nodes');
});

ok('active tab is scrolled into view (inline center)', () => {
  assert.ok(/scrollIntoView\(\{\s*block:\s*'nearest',\s*inline:\s*'center'\s*\}\)/.test(rmw), 'must scrollIntoView the .on pill');
});

ok('pill rows registered with liquid-lens (surface skin)', () => {
  assert.ok(/sel:\s*'\.mi-pill-row',\s*item:\s*'\.mi-pill',\s*skin:\s*'surface'/.test(lens), 'GROUPS entry missing');
  assert.ok(/\.mi-pill-row\[data-kw-lens\] \.mi-pill\.on\{background:transparent/.test(lens), 'transparency rule missing');
});

ok('phone turns pill rows into swipeable rows', () => {
  assert.ok(/\.mi-filters \.mi-pill-row[^{]*\{[^}]*overflow-x:\s*auto/.test(mobile), 'phone scroller missing in mobile.css');
});

ok('perf table scrolls inside its wrapper', () => {
  assert.ok(/\.mi-list-wrap\s*\{[^}]*overflow-x:\s*auto/.test(rmw), '.mi-list-wrap needs overflow-x:auto');
});

ok('matrix axis becomes a normal caption on phones', () => {
  assert.ok(/max-width:\s*700px[^{]*\{[^}]*\.rmw-perf-y\s*\{[^}]*position:\s*static/.test(rmw), 'phone caption rule missing');
});

ok('hours grid minimums fit a 360px phone', () => {
  const m = rmw.match(/\.rmw-hours-row\s*\{[^}]*grid-template-columns:\s*minmax\((\d+)px[^)]*\)\s*minmax\((\d+)px[^)]*\)\s*(\d+)px/);
  const phone = rmw.match(/max-width:\s*700px[\s\S]{0,600}?\.rmw-hours-row\s*\{[^}]*minmax\((\d+)px[^)]*\)\s*minmax\((\d+)px[^)]*\)\s*(\d+)px/);
  assert.ok(phone, 'phone hours-row rule missing');
  const total = +phone[1] + +phone[2] + +phone[3] + 20;
  assert.ok(total <= 340, `phone minimums total ${total}px, must fit 340px column`);
});

console.log(`\nmenu-phone: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
