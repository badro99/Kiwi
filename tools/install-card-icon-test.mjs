import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const pwa = fs.readFileSync(new URL('../assets/dashboard-pwa.js', import.meta.url), 'utf8');
const venues = fs.readFileSync(new URL('../assets/venues.js', import.meta.url), 'utf8');

for (const [name, source] of [['initial PWA renderer', pwa], ['venue-switch renderer', venues]]) {
  assert.match(source, /<img src=["`]assets\/kiwi-favicon-new\.svg["`]/, `${name} must use the canonical Kiwi favicon`);
  assert.doesNotMatch(source, /M4 3v12c0 3\.3/, `${name} must not revive the retired generic leaf glyph`);
}

assert.match(dashboard, /\.kiwi-install-head\s*\{[^}]*gap:\s*6px[^}]*min-height:\s*27px/s,
  'the light lockup must be compact and optically aligned');
assert.match(dashboard, /\.kiwi-install-head \.t\s*\{[^}]*line-height:\s*1[^}]*white-space:\s*nowrap/s);
assert.match(dashboard, /\.kiwi-install-mark img\s*\{[^}]*width:\s*24px[^}]*object-fit:\s*contain[^}]*transform:\s*translateY\(-2px\)/s,
  'the favicon must use its visual bounds and align optically with the title');
assert.match(dashboard, /\.kiwi-install-mark\s*\{[^}]*border:\s*1px solid transparent[^}]*background:\s*transparent/s,
  'the shared lockup must not add a tile behind the favicon');
assert.doesNotMatch(dashboard, /html\[data-theme="dark"\] \.sidebar \.kiwi-install-(?:head|mark)/,
  'light and dark modes must use the exact same favicon lockup');
/* Des planchers, pas des épingles : ce que ces deux lignes protègent, c'est que
   le tableau de bord charge bien ces deux modules avec une empreinte de cache —
   pas qu'elle vaille encore le numéro du jour où le test a été écrit.  Une
   épingle exacte transforme chaque montée de version légitime en échec rouge. */
const stamp = (file, floor) => {
  const found = dashboard.match(new RegExp('assets/' + file + '\\.js\\?v=(\\d+)'));
  assert.ok(found, `the dashboard must load assets/${file}.js with a cache stamp`);
  assert.ok(Number(found[1]) >= floor, `assets/${file}.js?v= must not fall below ${floor}`);
};
stamp('venues', 11);
stamp('dashboard-pwa', 374);

console.log('install-card-icon-test: 11 controls passed');
