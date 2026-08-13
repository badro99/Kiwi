import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const pwa = fs.readFileSync(new URL('../assets/dashboard-pwa.js', import.meta.url), 'utf8');
const venues = fs.readFileSync(new URL('../assets/venues.js', import.meta.url), 'utf8');

for (const [name, source] of [['initial PWA renderer', pwa], ['venue-switch renderer', venues]]) {
  assert.match(source, /<img src=["`]assets\/kiwi-favicon-new\.svg["`]/, `${name} must use the canonical Kiwi favicon`);
  assert.doesNotMatch(source, /M4 3v12c0 3\.3/, `${name} must not revive the retired generic leaf glyph`);
}

assert.match(dashboard, /\.kiwi-install-mark img\s*\{[^}]*width:\s*18px[^}]*object-fit:\s*contain/s);
assert.match(dashboard, /\.kiwi-install-mark\s*\{[^}]*background:\s*rgba\(247,245,240,\.96\)/s,
  'the two-tone mark needs a stable light chip in both themes');
assert.match(dashboard, /assets\/venues\.js\?v=10/);
assert.match(dashboard, /assets\/dashboard-pwa\.js\?v=373/);

console.log('install-card-icon-test: 8 controls passed');
