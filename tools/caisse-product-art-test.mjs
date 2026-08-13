import assert from 'node:assert/strict';
import fs from 'node:fs';

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const manifest = fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');

assert.match(caisse, /rel="icon" href="assets\/kiwi-favicon-new\.svg\?v=3"/,
  'the caisse browser tab declares the current Kiwi favicon');
assert.match(caisse, /apple-touch-icon[^>]*kiwi-employee-180\.png\?v=2/,
  'the iPhone home-screen icon uses the current Kiwi mark');
assert.doesNotMatch(manifest, /kiwi-employee-k-/,
  'the caisse manifest cannot reuse a legacy letter-k icon');
assert.match(manifest, /kiwi-employee-192\.png\?v=2/);
assert.match(manifest, /kiwi-employee-512\.png\?v=2/);

assert.match(caisse, /const normalizeMenuArtName/,
  'published menu artwork is resolved from stable product names, not only demo ids');
for (const term of ['salade', 'harira', 'tajine', 'brochette', 'menthe', 'cafe', 'orange', 'msemen']) {
  assert.match(caisse, new RegExp(term), `the live restaurant menu recognizes ${term}`);
}
assert.match(caisse, /menuArt\(m\.id, m\.cat, m\.name\)/,
  'the renderer passes the real product name to the artwork resolver');
assert.match(caisse, /const semantic = MENU_ART_RULES\.find/,
  'semantic artwork takes precedence before the category fallback');

console.log('caisse-product-art-test: 16 controls passed');
