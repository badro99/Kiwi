/* The till's dish pictures. Since 25 October 2026 they are photographs,
 * cut out on transparency and generated in one series so every dish shares
 * the same light, angle and scale (assets/dishes/<key>.webp, 128 px). They
 * replaced 45 hand-drawn line drawings with uneven strokes.
 *
 * What this holds: the shell icons; that a dish is matched by its published
 * NAME first (a published menu's ids, it_1…, are not the demo's m-001…), then
 * by its demo id, then by its category, then a neutral cloche; that the real
 * Pasta Corner menu does not collapse onto a few pictures; the traps already
 * met (a lemon chicken tajine is not a juice, Hawaii is a soda, apple in a
 * juice name is not a can); and that every key has its file and every file a
 * key. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const caisse = read('kiwi-caisse.html');
const manifest = read('manifest.webmanifest');
const app = read('assets/caisse-app.js');
const catalogue = read('assets/caisse/catalogue.js');
let n = 0;
const ok = (v, m) => { assert.ok(v, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ne = (a, b, m) => { assert.notEqual(a, b, m); n++; };

ok(/rel="icon" href="assets\/kiwi-favicon-new\.svg\?v=3"/.test(caisse), 'the caisse browser tab declares the current Kiwi favicon');
ok(/apple-touch-icon[^>]*kiwi-employee-180\.png\?v=2/.test(caisse), 'the iPhone home-screen icon uses the current Kiwi mark');
ok(!/kiwi-employee-k-/.test(manifest), 'the caisse manifest cannot reuse a legacy letter-k icon');
ok(/kiwi-employee-192\.png\?v=2/.test(manifest) && /kiwi-employee-512\.png\?v=2/.test(manifest), 'the manifest icons are the current mark');

ok(/menuArt\(m\.id, m\.cat, m\.name\)/.test(catalogue), 'the renderer passes the real product name to the picture resolver');
ok(!/<svg class="menu-art/.test(catalogue) && !/const _bowl|const _tajine|MENU_LIVE_ART|MENU_LIBRARY_ART/.test(app + catalogue),
  'no hand-drawn dish path is left: the pictures are the photographs');

// Run the resolver the cards run, not a text search.
const tables = app.slice(app.indexOf('    const MENU_ART = {'), app.indexOf('/* The language module loads deferred'));
const resolver = catalogue.slice(catalogue.indexOf('    const normalizeMenuArtName'), catalogue.indexOf('    /* Une carte vide'));
ok(tables.includes('CAT_GLYPH_RULES') && resolver.includes('menuArtKey'), 'the picture tables and resolver are extractable');
const { key, html, MENU_ART, MENU_ART_RULES, CAT_GLYPH_RULES } = new Function('catLabels',
  `${tables}\n${resolver}\nreturn { key: menuArtKey, html: menuArt, MENU_ART, MENU_ART_RULES, CAT_GLYPH_RULES };`)({
    pasta: 'Choisissez vos Pâtes', signatures: 'Signatures', desserts: 'Desserts',
    drinks: 'Boissons', soda: 'Soda+eau', tajines: 'Tajines'
  });

const liveCards = [
  ['Agnollotti del Pin', 'signatures'], ['Ravioli Ricotta e Spinaci', 'signatures'],
  ['Pappardelle aux champignons', 'signatures'], ['Lasagna', 'signatures'],
  ['Parmigiana Di Melanzane', 'signatures'], ['Tiramisù', 'desserts'], ['Bonet', 'desserts'],
  ['Eau', 'soda'], ['Coca-Cola', 'soda'], ["Jus D'orange", 'drinks'], ['Jus citron', 'drinks']
];
const live = liveCards.map(([name, cat]) => key(`it_${name.length}`, cat, name));
eq(new Set(live).size, liveCards.length, 'published pasta, desserts and drinks keep a picture each: ' + live.join(', '));
eq(key('it_x', 'pasta', 'Spécial maison'), 'pasta', 'the pasta category shows pasta for an unnamed dish');
eq(key('it_x', 'signatures', 'Spécial maison'), 'plate', 'an unknown signature gets the neutral cloche, not a misleading dish');
ne(key('it_x', 'desserts', 'Spécial maison'), key('it_x', 'drinks', 'Spécial maison'), 'unknown products follow their category');
eq(key('it_x', 'drinks', 'Jus de kiwi et pommes'), key('it_x', 'drinks', 'Jus citron'), 'apple in a juice name is not a can');
eq(key('it_x', 'soda', 'Hawaii'), key('it_x', 'soda', 'Coca-Cola'), 'the published Hawaii soda is a can');
eq(key('it_x', 'signatures', 'Supplément Fromage'), 'cheese', 'cheese supplements have their own picture');
eq(key('it_x', 'desserts', 'Panacotta'), key('it_x', 'desserts', 'Bonet'), 'panna cotta renders as a moulded dessert');
eq(key('m-008', 'tajines', 'Tajine poulet citron'), 'tajine-poulet', 'a lemon chicken tajine is a tajine, not a juice glass');
eq(key('it_x', 'tajines', 'Tajine agneau pruneaux'), 'tajine-agneau', 'a lamb and prune tajine has its own picture');
eq(key('it_x', 'x', 'Couscous tfaya'), 'couscous-tfaya', 'couscous tfaya is told from the royal');
eq(key('it_x', 'x', 'Pastilla fruits de mer'), 'pastilla-seafood', 'a seafood pastilla is not the chicken one');
eq(key('it_x', 'x', 'Crème brûlée'), 'creme-brulee', 'crème brûlée is not taken by the coffee rule');
eq(key('it_x', 'x', 'Sandwich thon'), 'sandwich-thon', 'a tuna sandwich is its own picture');
eq(key('m-030', 'boissons', 'Spécial'), 'soda', 'a demo id still finds its picture when the name says nothing');

// Every demo dish, by its own name, reaches the photo drawn for it.
const demo = [...app.matchAll(/\{ id: '(m-\d{3})', cat: '([a-z]+)',\s*name: (?:'([^']*)'|"([^"]*)")/g)].map((m) => [m[1], m[2], m[3] || m[4]]);
ok(demo.length >= 30, `the demo menu is read (${demo.length} dishes)`);
for (const [id, cat, name] of demo) eq(key(id, cat, name), MENU_ART[id], `${name} shows its own photo`);

const src = html('it_x', 'signatures', 'Lasagna');
ok(/^<img class="menu-photo" src="assets\/dishes\/lasagna\.webp\?v=\d+" alt=""[^>]* width="64" height="64"[^>]* loading="lazy"/.test(src),
  'a card draws the photo as a decorative, lazily loaded 64 px image: ' + src);

// Every key the tables can return has its file, and every file is reachable.
const keys = new Set(['plate', ...Object.values(MENU_ART), ...MENU_ART_RULES.map((r) => r[1]), ...CAT_GLYPH_RULES.map((r) => r[1])]);
const files = new Set(fs.readdirSync(new URL('../assets/dishes/', import.meta.url)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)));
const missing = [...keys].filter((k) => !files.has(k));
eq(missing.length, 0, 'every picture key has its photo: missing ' + missing.join(', '));
const orphan = [...files].filter((f) => !keys.has(f));
eq(orphan.length, 0, 'every photo is reachable from a rule: unused ' + orphan.join(', '));
for (const f of files) {
  const b = fs.readFileSync(new URL(`../assets/dishes/${f}.webp`, import.meta.url));
  ok(b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' && b.length < 24000, `${f}.webp is a small WebP (${b.length} B)`);
}

console.log(`caisse-product-art-test: ${n} controls passed`);
