/* The till's dish pictures. Since 25 October 2026 they are photographs,
 * cut out on transparency and generated in one series so every dish shares
 * the same light, angle and scale (assets/dishes/<key>.webp, 128 px). They
 * replaced 45 hand-drawn line drawings with uneven strokes.
 *
 * What this holds: the shell icons; that a dish is matched by its published
 * NAME first, through the keyword dictionary (a published menu's ids, it_1…,
 * are not the demo's m-001…), then by its demo id, then by its category, then
 * a neutral cloche; that the real Pasta Corner menu does not collapse onto a
 * few pictures; the traps already met (a lemon chicken tajine is not a juice,
 * Hawaii is a soda, a strawberry ice cream is an ice cream); that a broad
 * sample of real menu names finds a photo instead of the cloche; and that
 * every key has its file and every file a key. */
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

ok(/menuArt\(m\.id, m\.cat, m\.name, m\.subLabel\)/.test(catalogue), 'the renderer passes the real product name and subcategory to the picture resolver');
ok(!/<svg class="menu-art/.test(catalogue) && !/const _bowl|const _tajine|MENU_LIVE_ART|MENU_LIBRARY_ART/.test(app + catalogue),
  'no hand-drawn dish path is left: the pictures are the photographs');

// Run the resolver the cards run, not a text search.
const tables = app.slice(app.indexOf('    const MENU_ART = {'), app.indexOf('/* The language module loads deferred'));
const resolver = catalogue.slice(catalogue.indexOf('    const normalizeMenuArtName'), catalogue.indexOf('    /* Une carte vide'));
ok(tables.includes('CAT_GLYPH_RULES') && resolver.includes('menuArtKey') && resolver.includes('DISH_WORDS'), 'the picture tables and resolver are extractable');
ok(!/MENU_ART_RULES/.test(app + catalogue), 'the old hand-ordered regex list is gone: the dictionary decides');
const { key, html, MENU_ART, DISH_WORDS, CAT_GLYPH_RULES, SODA_CANS } = new Function('catLabels',
  `${tables}\n${resolver}\nreturn { key: menuArtKey, html: menuArt, MENU_ART, DISH_WORDS, CAT_GLYPH_RULES, SODA_CANS };`)({
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
eq(key('it_x', 'drinks', 'Jus de kiwi et pommes'), 'jus-pomme', 'apple in a juice name is an apple juice, not a can');
ok(/^soda/.test(key('it_x', 'soda', 'Hawaii')) && key('it_x', 'soda', 'Hawaii') !== key('it_x', 'soda', 'Coca-Cola'), 'the published Hawaii soda is a can, in its own colours');
eq(key('it_x', 'signatures', 'Supplément Fromage'), 'cheese', 'cheese supplements have their own picture');
eq(key('it_x', 'desserts', 'Panacotta'), key('it_x', 'desserts', 'Bonet'), 'panna cotta renders as a moulded dessert');
eq(key('m-008', 'tajines', 'Tajine poulet citron'), 'tajine-poulet', 'a lemon chicken tajine is a tajine, not a juice glass');
eq(key('it_x', 'tajines', 'Tajine agneau pruneaux'), 'tajine-agneau', 'a lamb and prune tajine has its own picture');
eq(key('it_x', 'x', 'Couscous tfaya'), 'couscous-tfaya', 'couscous tfaya is told from the royal');
eq(key('it_x', 'x', 'Pastilla fruits de mer'), 'pastilla-seafood', 'a seafood pastilla is not the chicken one');
eq(key('it_x', 'x', 'Crème brûlée'), 'creme-brulee', 'crème brûlée is not taken by the coffee rule');
eq(key('it_x', 'x', 'Sandwich thon'), 'sandwich-thon', 'a tuna sandwich is its own picture');
eq(key('m-030', 'boissons', 'Spécial'), 'soda-cola', 'a demo id still finds its picture when the name says nothing');

// The ranking: more words first, then the word that comes first in the name,
// and an ingredient or flavour only when nothing else speaks.
const traps = [
  ['Glace fraise', 'glace'], ['Jus de fraise', 'jus-fraise'], ['Soupe de poisson', 'soup'],
  ['Poisson du jour', 'poisson-grille'], ['Pizza poulet', 'pizza'], ['Tacos poulet', 'tacos'],
  ['Burger poulet', 'chicken-burger'], ['Brochettes de poulet', 'brochettes-poulet'],
  ['The Classic Burger', 'burger'], ['Thé', 'mint-tea'], ['Thé à la menthe', 'mint-tea'],
  ['Thé glacé', 'ice-tea'], ['Café crème', 'cafe-au-lait'], ['Café glacé', 'cafe-glace'],
  ['Pain au chocolat', 'pain-chocolat'], ['Chocolat chaud', 'chocolat-chaud'],
  ['Mousse au chocolat', 'mousse-chocolat'], ['Pizza 4 fromages', 'pizza-4-fromages'],
  ['Plateau de fruits de mer', 'fruits-de-mer'], ['Salade de fruits', 'salade-fruits'],
  ['Tarte au citron', 'tarte-citron'], ['Gâteaux marocains', 'patisserie'],
  ['Menu enfant', 'menu-enfant'], ['Menu burger', 'burger'], ['Couscous aux sept légumes', 'couscous-legumes'],
  ['Tajine aux pruneaux', 'tajine-agneau'], ['Poulet aux olives', 'tajine-poulet'],
  ['Briouates au miel', 'briouates-miel'], ['Pâtes sauce tomate', 'pasta'], ['Supplément sauce', 'sauce'],
  ['Eau gazeuse', 'eau-gazeuse'], ['Nous nous', 'nous-nous'], ['Crème glacée vanille', 'glace'],
  ['Spaghetti carbonara', 'carbonara'], ['Penne au pesto', 'pesto'], ['Tagliatelle saumon', 'alfredo'],
  ['Spaghetti', 'pasta'], ['Penne poulet', 'pasta'], ['Sandwich falafel', 'falafel'], ['Sandwich shawarma', 'shawarma'],
  ['Soupe harira', 'harira'], ['Salade quinoa', 'quinoa'], ['Salade verte', 'salad'],
  ['شاي', 'mint-tea'], ['طاجين دجاج', 'tajine-poulet'], ['طاجين', 'tajine-legumes'],
  // The world kitchens, café drinks and Moroccan street food added on 30 October 2026.
  ['Café latte', 'latte'], ['Café au lait', 'cafe-au-lait'], ['Latte macchiato', 'macchiato'], ['Bubble tea taro', 'bubble-tea'],
  ['Citronnade menthe', 'citronnade'], ['Jus d\'orange', 'orange-juice'], ['Kebbé', 'kebbe'], ['Assiette mezze', 'mezze'],
  ['Manakish zaatar', 'manakish'], ['Moussaka', 'moussaka'], ['Gratin dauphinois', 'gratin'], ['Gyros poulet', 'gyros'],
  ['Lahmacun', 'lahmacun'], ['Tapas variées', 'tapas'], ['Patatas bravas', 'patatas-bravas'], ['Churros chocolat', 'churros'],
  ['Entrecôte frites', 'entrecote'], ['Steak haché', 'steak'], ['Dim sum vapeur', 'dim-sum'], ['Pad thaï crevettes', 'pad-thai'],
  ['Bo bun boeuf', 'bo-bun'], ['Butter chicken', 'butter-chicken'], ['Biryani poulet', 'biryani'], ['Cheese naan', 'naan'],
  ['Curry vert', 'curry-thai'], ['Curry de poulet', 'curry'], ['Karantika', 'karantika'], ['Sandwich merguez', 'merguez'],
  ['Medfouna', 'medfouna'], ['Seffa medfouna', 'seffa'], ['Poulet tikka', 'tikka'], ['Berkoukes', 'berkoukes'],
  ['Cordon bleu frites', 'cordon-bleu'], ['Escalope de poulet', 'escalope'], ['Oeufs brouillés', 'oeufs']
];
for (const [name, want] of traps) eq(key('it_x', 'x', name), want, `« ${name} » shows ${want}`);

// What the published menus (25 October 2026) taught: the subcategory speaks
// when the name only names a flavour, and a drink shelf beats a food name.
const shelved = [
  ['Brownie & Chocolate', 'Milkshake', 'milkshake'], ['Caramel cookie', 'B Frappé', 'milkshake'],
  ['Mocca Cake', 'Black tea', 'the-noir'], ['Chocolat Banane', 'B Frappé', 'milkshake'],
  ['Coconut Kiss', 'Smoothies', 'smoothie'], ['Le Nordique', 'All Day Brunch', 'petit-dejeuner'],
  ['Smash Bacon', 'Smash Burgers', 'burger'], ['Rosa Pomodoro', 'Sauce', 'pasta'],
  ['Tiramisu latte', 'Signatures', 'latte'], ['Kinder Bueno Crêpe', 'Crêpes', 'crepe'],
  ['Brownie Mini Pancakes', 'Mini Pancakes', 'pancakes'], ['Tacos Cordon Bleu', '', 'tacos'],
  ['Œufs bénédicte', '', 'oeufs-benedicte'], ['Spaghetti Fruits de Mer', '', 'pasta'],
  ['Crispy Fried Chicken Burger', 'Burger', 'chicken-burger'], ['Salmon Bagel', 'Sandwich', 'bagel'],
  ['Tiramisu', 'Desserts', 'tiramisu'], ['Cheese burger', 'Menu Enfants', 'cheeseburger']
];
for (const [name, sub, want] of shelved) eq(key('it_x', 'x', name, sub), want, `« ${name} » under « ${sub} » shows ${want}`);

// A broad sample of what Moroccan cafés, snacks and restaurants actually
// sell: every one finds a photo of its own, none falls back to the cloche.
const sample = ['Msemen au miel', 'Harcha fromage', 'Bissara', 'Rfissa poulet', 'Tanjia marrakchia',
  'Mechoui', 'Seffa medfouna', 'Sardines grillées', 'Calamars frits', 'Crevettes pil pil', 'Paella',
  'Entrecôte grillée', 'Poulet rôti', 'Nuggets x6', 'Frites', 'Cheeseburger', 'Hot dog', 'Tacos mixte',
  'Panini thon', 'Club sandwich', 'Croque monsieur', 'Shawarma poulet', 'Falafel', 'Houmous', 'Taboulé',
  'Quesadilla', 'Poke bowl saumon', 'Sushi mix', 'Ramen', 'Nems', 'Riz cantonais', 'Curry de poulet',
  'Spaghetti bolognaise', 'Penne arrabbiata', 'Gnocchi', 'Risotto aux champignons', 'Burrata',
  'Salade César', 'Salade niçoise', 'Croissant', 'Pain aux raisins', 'Cookie', 'Muffin', 'Brownie',
  'Cheesecake', 'Éclair au café', 'Mille-feuille', 'Macarons', 'Riz au lait', 'Yaourt', 'Lben',
  'Smoothie mangue', 'Milkshake vanille', 'Mojito', 'Red Bull', 'Américano', 'Café turc', 'Matcha latte',
  'Verveine', 'Chebakia', 'Ghriba', 'Fekkas', 'Baklava', 'Kunafa', 'Basboussa', 'Sellou', 'Omelette',
  'Oeufs au plat', 'Pancakes', 'Gaufre', 'Petit déjeuner marocain', 'Amlou', 'Sfenj', 'Dattes'];
const cloche = sample.filter((name) => key('it_x', 'x', name) === 'plate');
eq(cloche.length, 0, 'every sample dish finds its photo: cloche for ' + cloche.join(', '));
eq(new Set(sample.map((name) => key('it_x', 'x', name))).size, sample.length, 'the sample dishes do not collapse onto shared photos');
eq(key('it_x', 'cafe', 'Spécial'), 'espresso', 'an unknown hot drink falls back to a coffee');

// Every demo dish, by its own name, reaches the photo drawn for it.
const demo = [...app.matchAll(/\{ id: '(m-\d{3})', cat: '([a-z]+)',\s*name: (?:'([^']*)'|"([^"]*)")/g)].map((m) => [m[1], m[2], m[3] || m[4]]);
ok(demo.length >= 30, `the demo menu is read (${demo.length} dishes)`);
for (const [id, cat, name] of demo) eq(key(id, cat, name), MENU_ART[id], `${name} shows its own photo`);

const src = html('it_x', 'signatures', 'Lasagna');
ok(/^<img class="menu-photo" src="assets\/dishes\/lasagna\.webp\?v=\d+" alt=""[^>]* width="64" height="64"[^>]* loading="lazy"/.test(src),
  'a card draws the photo as a decorative, lazily loaded 64 px image: ' + src);

// A can takes its brand's colour (owner, 25 October 2026), on the shelf and by name.
for (const [name, want] of [['Coca-Cola', 'soda-cola'], ['Fanta Orange', 'soda-orange'], ['Sprite', 'soda-citron'],
  ['Pommes', 'soda-pomme'], ['Poms', 'soda-pomme'], ['Coca-Cola Zero', 'soda-zero'], ['Coca light', 'soda-light'],
  ['Pepsi', 'soda-bleu'], ['Schweppes Tonic', 'soda-tonic'], ['Hawai tropical', 'soda-tropical'], ['Canette', 'soda']])
  eq(key('it_x', 'soda', name, 'Soda+Eau'), want, `${name} on the Soda+Eau shelf shows ${want}`);
eq(key('it_x', 'drinks', 'Fanta'), 'soda-orange', 'a brand name alone finds its can');
ne(key('it_x', 'desserts', 'Tarte aux pommes'), 'soda-pomme', 'an apple tart is not an apple soda');
ne(key('it_x', 'signatures', 'Pommes frites'), 'soda-pomme', 'fries are not an apple soda');

// Every key the tables can return has its file, and every file is reachable.
const keys = new Set(['plate', ...Object.values(MENU_ART), ...Object.keys(DISH_WORDS), ...CAT_GLYPH_RULES.map((r) => r[1]), ...SODA_CANS.map((r) => r[0])]);
ok(Object.keys(DISH_WORDS).length >= 200, `the dictionary covers ${Object.keys(DISH_WORDS).length} dishes`);
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
