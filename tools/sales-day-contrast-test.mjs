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
/* Des planchers, pas des épingles. Un correctif ultérieur bumpe forcément le
 * stamp et la génération de cache ; épingler le numéro exact ferait échouer ce
 * contrôle pour la seule raison qu'il a fait son travail. Ce qui compte ici :
 * l'asset corrigé est bien servi, et le cache a été invalidé au moins jusqu'à
 * la génération livrée le jour où ce contrôle a été écrit. */
const pagesPro = +(dashboard.match(/assets\/pages-pro\.js\?v=(\d+)/) || [])[1];
assert.ok(Number.isFinite(pagesPro) && pagesPro >= 2059,
  `the dashboard must load the corrected sales-page asset (v${pagesPro} ≥ v2059)`);
const swCache = +(sw.match(/var CACHE = 'kiwi-app-v(\d+)'/) || [])[1];
assert.ok(Number.isFinite(swCache) && swCache >= 409,
  `the service worker must invalidate the stale selected-day CSS (v${swCache} ≥ v409)`);

console.log('sales-day-contrast-test: 6 controls passed');
