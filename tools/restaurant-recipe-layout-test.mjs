import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../assets/restaurant-menu-workspace.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

assert.match(js, /class="rmw-recipe-costs"/, 'recipe summary uses a dedicated metric grid');
assert.match(js, /rmw-recipe-costs\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, 'desktop recipe metrics form a compact four-column row');
assert.match(js, /\.rmw-recipe-modal[^}]*background:var\(--paper\)/, 'recipe modal follows the active theme surface');
assert.match(js, /\.rmw-recipe-section\{[^}]*background:var\(--surface\)/, 'recipe sections use the shared surface token');
assert.match(js, /@media\(max-width:800px\)[\s\S]*\.rmw-recipe-costs\{grid-template-columns:1fr 1fr\}/, 'recipe metrics collapse to a compact two-column phone grid');
assert.match(dashboard, /assets\/restaurant-menu-workspace\.js\?v=2/);
assert.match(sw, /assets\/restaurant-menu-workspace\.js\?v=2/);

console.log('restaurant-recipe-layout-test: 7 controls passed');
