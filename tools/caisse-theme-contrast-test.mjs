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
const shellVersion = sw.match(/var CACHE = 'kiwi-app-v(\d+)'/)?.[1];
assert.ok(shellVersion && Number(shellVersion) >= 340, 'offline shell generation advanced');
assert.match(caissePwa, new RegExp(`kiwi-sw\\.js\\?v=${shellVersion}`), 'caisse requests the current worker');
assert.match(dashboardPwa, new RegExp(`kiwi-sw\\.js\\?v=${shellVersion}`), 'dashboard requests the current worker');

console.log('caisse-theme-contrast-test: 9 controls passed');
