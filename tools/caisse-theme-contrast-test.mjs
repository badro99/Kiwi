import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');
const caissePwa = readFileSync(new URL('../assets/caisse-pwa.js', import.meta.url), 'utf8');
const dashboardPwa = readFileSync(new URL('../assets/dashboard-pwa.js', import.meta.url), 'utf8');

const toastRule = html.match(/\.toast\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
const titleRule = html.match(/\.toast-title\s*\{[^}]*\}/)?.[0] || '';
const descRule = html.match(/\.toast-desc\s*\{[^}]*\}/)?.[0] || '';

assert.match(toastRule, /background:\s*rgba\(255,255,255,\.96\)/, 'toast stays a light plate');
assert.match(toastRule, /color:\s*#0A0F0D/, 'toast has local dark ink');
assert.match(toastRule, /color-scheme:\s*light/, 'toast form controls and UA paint stay light');
assert.doesNotMatch(toastRule, /color:\s*var\(--ink\)/, 'toast must not inherit dark-mode ink');
assert.match(titleRule, /color:\s*#0A0F0D/, 'toast title remains visible');
assert.match(descRule, /color:\s*#59615D/, 'toast description remains visible');
assert.match(sw, /kiwi-app-v337/, 'offline shell generation advanced');
assert.match(caissePwa, /kiwi-sw\.js\?v=337/, 'caisse requests the new worker');
assert.match(dashboardPwa, /kiwi-sw\.js\?v=337/, 'dashboard requests the new worker');

console.log('caisse-theme-contrast-test: 9 controls passed');
