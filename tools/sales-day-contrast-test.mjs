import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = fs.readFileSync(new URL('../assets/pages-pro.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

const selectedDay = pages.match(/\.rtx-day\.on\{([^}]+)\}/)?.[1] || '';

assert.match(selectedDay, /background:var\(--inverse-surface\)/,
  'the selected day must use a theme-stable dark surface');
assert.match(selectedDay, /border-color:var\(--inverse-surface\)/,
  'the selected-day border must follow its stable surface');
assert.match(selectedDay, /color:var\(--inverse-ink\)/,
  'the selected-day label must remain light in both themes');
assert.doesNotMatch(selectedDay, /var\(--ink\)|var\(--surface\)/,
  'theme-inverted foreground/background tokens must not be paired here');
assert.match(dashboard, /assets\/pages-pro\.js\?v=2059/,
  'the dashboard must load the corrected sales-page asset');
assert.match(sw, /var CACHE = 'kiwi-app-v409'/,
  'the service worker must invalidate the stale selected-day CSS');

console.log('sales-day-contrast-test: 6 controls passed');
