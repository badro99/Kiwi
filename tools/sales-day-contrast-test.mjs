import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = fs.readFileSync(new URL('../assets/pages-pro.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

const darkPill = dashboard.match(/\.dr-pill\.on\s*\{([^}]+)\}/)?.[1] || '';
const lightPill = dashboard.match(/:root\[data-theme="light"\] \.dr-pill\.on\s*\{([^}]+)\}/)?.[1] || '';
assert.match(pages, /\[data-rtx-day-selector\]/,
  'Commandes must use the dashboard date pill, not its retired duplicate');
assert.match(darkPill, /color:\s*#FFFFFF\s*!important/,
  'the shared selected day stays legible in dark mode');
assert.match(lightPill, /color:\s*#0B1210\s*!important/,
  'the shared selected day stays legible in light mode');
assert.doesNotMatch(pages, /\.rtx-day\.on\{/,
  'the retired selected-day CSS must not override the shared control');
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
