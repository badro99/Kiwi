import fs from 'node:fs';
import assert from 'node:assert/strict';

const team = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const trades = fs.readFileSync(new URL('../assets/trades.js', import.meta.url), 'utf8');
const sale = fs.readFileSync(new URL('../assets/pos-sale.js', import.meta.url), 'utf8');
const dispatch = fs.readFileSync(new URL('../assets/pos-dispatch.js', import.meta.url), 'utf8');

const catalog = team.slice(team.indexOf('const CATALOG = {'), team.indexOf('function unionCatalog()'));
const tradeIds = [...trades.matchAll(/\{ id: '([^']+)', base: '(?:restaurant|boutique|spa|hotel)'/g)].map((m) => m[1]);
assert.ok(tradeIds.length >= 16, 'the canonical trade registry is present');
for (const id of tradeIds) {
  assert.match(catalog, new RegExp(`\\n\\s*${id}: \\{`), `${id} has a dedicated planning role catalogue`);
}
assert.match(team, /if \(venue\.subtype && CATALOG\[venue\.subtype\]\) return venue\.subtype/, 'custom venues resolve their real subtype');
assert.doesNotMatch(catalog.match(/pressing: \{[\s\S]*?\n\s*\},/)?.[0] || '', /Cuisine|Coiffure|Manucure|Plonge/, 'pressing roles do not leak unrelated trades');

const specialistFiles = [
  'pressing-caisse.js', 'pos-spa.js', 'pos-hotel.js', 'pos-fastfood.js',
  'pos-boulangerie.js', 'pos-pizzeria.js', 'pos-traiteur.js', 'pos-foodtruck.js',
  'pos-epicerie.js', 'pos-pharmacie.js', 'pos-librairie.js', 'pos-fleuriste.js',
  'pos-coiffure.js', 'pos-gym.js', 'pos-autre.js',
];
for (const file of specialistFiles) {
  const body = fs.readFileSync(new URL(`../assets/${file}`, import.meta.url), 'utf8');
  assert.match(body, /KiwiPosSale(?:\?\.)?\.record|KiwiPosSale\?\.record/, `${file} posts settled sales to the shared ledger`);
}
for (const file of ['pos-fastfood.js', 'pos-boulangerie.js', 'pos-foodtruck.js', 'pos-epicerie.js']) {
  const body = fs.readFileSync(new URL(`../assets/${file}`, import.meta.url), 'utf8');
  assert.match(body, /onSalesSync\(\)/, `${file} reconciles its native today counters`);
}
assert.match(sale, /\/api\/feed\?merchant=/, 'specialist tills read the tenant-bound server day');
assert.match(sale, /function ingest\(vertical, sales, who\)/, 'server sales merge through one shared reconciler');
assert.match(dispatch, /id !== 'boutique'[\s\S]{0,160}KiwiPosSale\.activate\(id\)/, 'the active specialist till starts reconciliation without replacing boutique\'s richer journal');
assert.match(dispatch, /KiwiPosSale\.deactivate\(\)/, 'locking the till stops reconciliation');

console.log(`✓ vertical feature parity (${tradeIds.length + specialistFiles.length + 10} controls)`);
