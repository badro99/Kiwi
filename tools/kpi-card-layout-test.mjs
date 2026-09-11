import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../assets/design-vexel.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

const baseline = css.match(/body\.design-vexel \.vexel-kpi-baseline\s*\{([^}]+)\}/)?.[1] || '';
const value = css.match(/body\.design-vexel \.vexel-kpi-baseline > \.v\s*\{([^}]+)\}/)?.[1] || '';
const delta = css.match(/body\.design-vexel \.vexel-kpi-delta\s*\{([^}]+)\}/)?.[1] || '';

assert.match(baseline, /display:\s*flex/);
assert.match(baseline, /flex-wrap:\s*wrap/, 'large comparisons must wrap instead of overlaying revenue');
assert.match(value, /flex:\s*0\s+0\s+auto/, 'the financial value must remain indivisible');
assert.match(value, /max-width:\s*100%/, 'the financial value stays bounded by its card');
assert.match(delta, /margin-inline-start:\s*auto/, 'a wrapped comparison remains aligned to the trailing edge');
assert.match(delta, /white-space:\s*nowrap/, 'the sign, number and percentage unit stay together');
/* Des planchers, pas des épingles — voir sales-day-contrast-test.mjs. */
const skin = +(dashboard.match(/assets\/design-vexel\.css\?v=(\d+)/) || [])[1];
assert.ok(Number.isFinite(skin) && skin >= 2085, `the dashboard loads the corrected skin (v${skin} ≥ v2085)`);
const swCache = +(sw.match(/var CACHE = 'kiwi-app-v(\d+)'/) || [])[1];
assert.ok(Number.isFinite(swCache) && swCache >= 409, `the cache was invalidated (v${swCache} ≥ v409)`);

console.log('kpi-card-layout-test: 8 controls passed');
