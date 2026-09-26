import assert from 'node:assert/strict';
import fs from 'node:fs';

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const manifest = fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
const tablerLicense = fs.readFileSync(new URL('../assets/icons/tabler/LICENSE.txt', import.meta.url), 'utf8');

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
assert.match(caisse, /let art = semantic && semantic\[1\];[\s\S]*if \(!art\) art = MENU_ART\[id\]/,
  'semantic artwork also supersedes legacy demo-id artwork');
assert.match(caisse, /MENU_LIBRARY_ART = \{[\s\S]*salad:[\s\S]*soup:[\s\S]*teapot:[\s\S]*coffee:[\s\S]*pancake:/,
  'the menu includes distinct, recognizable food and drink silhouettes');
assert.match(caisse, /const _tajine = \(g\) => `[\s\S]*M29 18c0-3[\s\S]*M16 43c8-7[\s\S]*M22 38l3-3[\s\S]*M13 47h38[\s\S]*M13 49H9[\s\S]*M51 49h4/,
  'the original Moroccan tajine keeps a crown, conical lid, zellige band, ceramic base and handles');
assert.match(caisse, /const _brochettes = `[\s\S]*M12 56L47 9[\s\S]*M17 43l6-7[\s\S]*M48 24l5-6/,
  'brochettes use two readable skewers with six distinct food pieces');
assert.match(caisse, /const _orangeJuice = `[\s\S]*M17 24h27[\s\S]*M34 28l7-17[\s\S]*cx="46" cy="24" r="9"/,
  'orange juice uses a filled glass, bent straw and segmented citrus garnish');
assert.match(caisse, /\/brochette\|grillade\|kebab\/, _brochettes/,
  'published brochettes resolve to the Kiwi skewer artwork');
assert.match(caisse, /\/orange\|jus\.\*agrume\/, _orangeJuice/,
  'published orange drinks resolve to the Kiwi orange-juice artwork');
assert.match(caisse, /viewBox = '0 0 24 24'/,
  'library artwork keeps its native optical grid instead of being distorted');
assert.match(caisse, /menu-art--library/,
  'open-source silhouettes receive an optical-size treatment');
assert.match(tablerLicense, /MIT License[\s\S]*Paweł Kuna/,
  'the bundled Tabler-derived silhouettes retain their license notice');

// Exercise the same resolver that renders merchant cards, rather than merely
// checking that artwork names appear somewhere in the HTML source.
const artStart = caisse.indexOf('    const _bowl = (x) =>');
const artEnd = caisse.indexOf('    /* Une carte vide', artStart);
assert.ok(artStart > 0 && artEnd > artStart, 'the card-art resolver is extractable');
const resolveArt = new Function('catOrder', 'catLabels',
  `${caisse.slice(artStart, artEnd)}; return menuArt;`)([], {
    pasta: 'Choisissez vos Pâtes', signatures: 'Signatures', desserts: 'Desserts',
    drinks: 'Boissons', soda: 'Soda+eau'
  });
const liveCards = [
  ['Agnollotti del Pin', 'signatures'],
  ['Ravioli Ricotta e Spinaci', 'signatures'],
  ['Pappardelle aux champignons', 'signatures'],
  ['Lasagna', 'signatures'],
  ['Parmigiana Di Melanzane', 'signatures'],
  ['Tiramisù', 'desserts'],
  ['Bonet', 'desserts'],
  ['Eau', 'soda'],
  ['Coca-Cola', 'soda'],
  ["Jus D'orange", 'drinks'],
  ['Jus citron', 'drinks']
];
const liveArt = liveCards.map(([name, cat]) => resolveArt(`it_${name.length}`, cat, name));
assert.equal(new Set(liveArt).size, liveCards.length,
  'published pasta, desserts and drinks must not collapse to the same generic pictogram');
assert.notEqual(resolveArt('it_x', 'desserts', 'Spécial maison'),
  resolveArt('it_x', 'drinks', 'Spécial maison'),
  'unknown products use a category-relevant silhouette, not category index modulo four');
assert.match(resolveArt('it_x', 'pasta', 'Spécial maison'), /M17 12v16/,
  'the pasta category uses a pasta silhouette for unnamed dishes');
assert.match(resolveArt('it_x', 'signatures', 'Spécial maison'), /<circle[^>]+r="20"/,
  'an unknown signature has a neutral plate rather than a misleading bowl or drink');
assert.equal(resolveArt('it_x', 'drinks', 'Jus de kiwi et pommes'),
  resolveArt('it_x', 'drinks', 'Jus citron'),
  'apple in a juice name cannot be misclassified as a canned soda');
assert.equal(resolveArt('it_x', 'soda', 'Hawaii'),
  resolveArt('it_x', 'soda', 'Coca-Cola'),
  'the published Hawaii soda uses a can, not a generic juice glass');
assert.notEqual(resolveArt('it_x', 'signatures', 'Supplément Fromage'),
  resolveArt('it_x', 'signatures', 'Spécial maison'),
  'cheese supplements have their own silhouette');
assert.equal(resolveArt('it_x', 'desserts', 'Panacotta'),
  resolveArt('it_x', 'desserts', 'Bonet'),
  'the published panacotta renders as a moulded dessert');

console.log('caisse-product-art-test: 35 controls passed');
