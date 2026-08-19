#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES MODÈLES DE RAYONS (assets/store-templates.js)
 *
 * Un modèle écrit dans le catalogue d'un vrai commerce. Ce qu'il y met, le
 * commerçant le retrouvera dans ses KPI le soir même — d'où les deux garde-fous
 * qui comptent ici :
 *
 *  1. LE STOCK RESTE À ZÉRO. Un catalogue livré avec des quantités plausibles
 *     ment sur la valeur du stock, les ruptures et la marge dès la première
 *     seconde, et personne ne peut voir que le chiffre est inventé.
 *  2. POSER DEUX FOIS LE MÊME MODÈLE NE DOUBLE RIEN. Sans ça, le commerçant qui
 *     ajoute un second rayon un mois plus tard se retrouve avec deux catalogues
 *     empilés, et c'est à la caisse qu'il s'en aperçoit.
 *
 * Le reste tient de la charte : les icônes viennent de assets/icons/material/
 * aux octets près, aucun tracé n'est dessiné à la main, rien n'est en italique.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else { failures.push(msg); console.error(`  ✗ ${msg}`); } };

console.log('■ Modèles de rayons (store-templates)');

const src = fs.readFileSync(path.join(ROOT, 'assets/store-templates.js'), 'utf8');
const proSrc = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
const onbSrc = fs.readFileSync(path.join(ROOT, 'assets/onboarding.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
const trades = fs.readFileSync(path.join(ROOT, 'assets/trades.js'), 'utf8');

/* ── Le module tourne ici même, avec un catalogue en carton ───────────────── */
function stubCatalog() {
  const cats = [], prods = [], vars = [], codes = [];
  let n = 0;
  return {
    _cats: cats, _prods: prods, _vars: vars, _codes: codes,
    use() {}, batch: (fn) => fn(),
    listCategories: () => cats.slice(),
    listProducts: () => prods.slice(),
    addCategory(name, color) { const c = { id: 'c' + (++n), name, color }; cats.push(c); return c; },
    addProduct(d) { const p = Object.assign({ id: 'p' + (++n) }, d); prods.push(p); return p; },
    addVariant(d) { const v = Object.assign({ id: 'v' + (++n) }, d); vars.push(v); return v; },
    generateBarcode(id) { codes.push(id); return '2000000000000'; },
  };
}
function load(cat) {
  const w = { KiwiBoutiqueCatalog: cat };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(w);
  return w.KiwiStoreTemplates;
}

const T = load(stubCatalog());
ok(T && typeof T.apply === 'function' && typeof T.offer === 'function' && typeof T.open === 'function',
  'le module s’expose sous window.KiwiStoreTemplates');

/* ── 1. LE MÉTIER SERVI ──────────────────────────────────────────────────── */
ok(T.has('maison'), '« Maison » a des rayons tout prêts');
ok(!T.has('restaurant') && !T.has('') && !T.has('pharmacie'),
  'un métier sans modèle n’en reçoit pas un d’emprunt');
ok(/id: 'maison'/.test(trades), '« maison » est bien le sous-type écrit par le registre des métiers');

const packs = T.packs('maison');
ok(packs.length >= 5, `${packs.length} rayons proposés`);
ok(new Set(packs.map((p) => p.id)).size === packs.length, 'deux rayons ne partagent pas un identifiant');
ok(packs.every((p) => p.label && p.label.fr && p.label.en && p.label.ar),
  'chaque rayon est nommé dans les trois langues');
ok(packs.every((p) => p.hint && p.hint.fr && p.hint.en && p.hint.ar),
  'chaque rayon dit en une ligne ce qu’il contient');
ok(packs.every((p) => p.icon && /viewBox="0 -960 960 960"/.test(p.icon)),
  'chaque rayon porte une icône Material Symbols dans son viewBox natif');
ok(packs.every((p) => p.items.length >= 5), 'aucun rayon ne se réduit à deux articles');
ok(T.total('maison') >= 35, `${T.total('maison')} articles au total, de quoi ouvrir un magasin`);

/* ── 2. CE QUE CHAQUE ARTICLE PROMET ─────────────────────────────────────── */
const items = packs.flatMap((p) => p.items);
ok(items.every((i) => typeof i.name === 'string' && i.name.trim().length > 3), 'chaque article a un nom lisible');
ok(items.every((i) => Number.isFinite(i.price) && i.price > 0), 'chaque article a un prix positif');
ok(new Set(items.map((i) => i.name.toLowerCase())).size === items.length,
  'aucun nom d’article n’est proposé deux fois');
ok(items.every((i) => Array.isArray(i.colors) && i.colors.length), 'chaque article propose au moins une couleur');
const services = items.filter((i) => i.format === 'service');
ok(services.length >= 4, `${services.length} articles vendus en service complet`);
ok(services.every((i) => i.servicePieces >= 2 && i.piecePriceMAD > 0),
  'un service annonce son nombre de pièces ET le prix de la pièce détachée');
ok(items.filter((i) => i.format !== 'service').every((i) => i.servicePieces == null && i.piecePriceMAD == null),
  'un article vendu à la pièce ne traîne pas un compte de pièces');
ok(items.some((i) => i.fragile) && items.some((i) => !i.fragile),
  'la fragilité est renseignée article par article, pas posée en bloc');
ok(!items.some((i) => i.marque),
  'aucun fournisseur n’est inventé à la place du commerçant');

/* ── 3. LE STOCK RESTE À ZÉRO — le garde-fou qui compte ──────────────────── */
ok(!items.some((i) => 'stock' in i || 'sizes' in i),
  'les données d’un modèle ne portent aucune quantité');
const cat1 = stubCatalog();
const T1 = load(cat1);
const res = T1.apply('maison', ['arts_table', 'verrerie']);
ok(res.products > 0 && res.categories === 2, `${res.products} articles créés dans 2 rayons`);
ok(cat1._vars.length > res.products, 'chaque article se décline en plusieurs couleurs');
ok(cat1._vars.every((v) => v.stock === 0),
  'AUCUNE déclinaison ne naît avec du stock — le commerçant le saisit à la réception');
ok(cat1._prods.every((p) => p.cost === 0),
  'aucun coût d’achat n’est inventé : une marge fabriquée est un mensonge de plus');
ok(cat1._codes.length === cat1._vars.length,
  'chaque déclinaison repart avec son code-barres, prête à être douchée');
ok(cat1._prods.every((p) => p.kind === 'tu'),
  'la maison se vend en taille unique, pas en tailles de vêtement');
ok(cat1._prods.every((p) => p.categoryId && cat1._cats.some((c) => c.id === p.categoryId)),
  'aucun article n’atterrit hors catégorie');

/* ── 4. POSER DEUX FOIS NE DOUBLE RIEN ───────────────────────────────────── */
const again = T1.apply('maison', ['arts_table', 'verrerie']);
ok(again.products === 0 && again.categories === 0 && again.skipped === res.products,
  'le même modèle posé deux fois n’ajoute rien et le dit');
ok(cat1._prods.length === res.products, 'le catalogue n’a pas doublé de taille');
const third = T1.apply('maison', ['bougies']);
ok(third.products > 0 && third.categories === 1,
  'un rayon ajouté plus tard s’ajoute quand même');
ok(T1.apply('maison', ['rayon-qui-nexiste-pas']).products === 0,
  'un identifiant inconnu ne crée rien');

/* ── 5. QUAND ON LE PROPOSE TOUT SEUL ────────────────────────────────────── */
const offerSrc = src.slice(src.indexOf('function offer('), src.indexOf('window.KiwiStoreTemplates'));
ok(/listProducts\(\{ includeArchived: true \}\)\.length\) return false;/.test(offerSrc),
  'un magasin qui a déjà des articles ne se fait pas proposer un point de départ');
const catFull = stubCatalog();
const T2 = load(catFull);
catFull.addProduct({ name: 'Déjà là' });
ok(T2.offer('maison') === false, 'catalogue non vide : rien ne s’ouvre');
ok(T2.offer('restaurant') === false, 'métier sans modèle : rien ne s’ouvre');

/* ── 6. LES DEUX PORTES D’ENTRÉE ─────────────────────────────────────────── */
ok(/handlers\['bqx-templates'\]/.test(proSrc), 'l’Inventaire a son gestionnaire');
ok(/data-action="bqx-templates"/.test(proSrc), 'et le bouton qui l’appelle');
ok(/_bqxTemplatesOn\(\)/.test(proSrc) && /KiwiStoreTemplates[\s\S]{0,40}currentTrade\(\)/.test(proSrc),
  'le bouton n’apparaît que pour un métier qui a des rayons');
ok(/onApplied: \(\) => _renderInventory\(\)/.test(proSrc),
  'la page se redessine une fois les articles créés');
ok(/KiwiStoreTemplates\.offer\(S\.typeId/.test(onbSrc),
  'l’assistant d’installation le propose avec le métier choisi');
ok(/then: function \(\) \{ setTimeout\(pair, 500\); \}/.test(onbSrc) && /if \(!offered\) pair\(\);/.test(onbSrc),
  'appairage de la caisse et modèles s’ENCHAÎNENT — deux fenêtres ne s’empilent pas');

/* ── 7. LA CHARTE ────────────────────────────────────────────────────────── */
const icons = fs.readdirSync(path.join(ROOT, 'assets/icons/material')).filter((f) => f.endsWith('.svg'));
const vendored = new Set(icons.map((f) => {
  const s = fs.readFileSync(path.join(ROOT, 'assets/icons/material', f), 'utf8');
  const m = s.match(/<path d="([^"]*)"/);
  return m ? m[1] : '';
}).filter(Boolean));
const drawn = Array.from(src.matchAll(/mi\('([^']+)'/g)).map((m) => m[1])
  .concat(Array.from(src.matchAll(/D_[A-Z]+ = '([^']+)'/g)).map((m) => m[1]));
ok(drawn.length >= 6, `${drawn.length} tracés d’icône dans le fichier`);
ok(drawn.every((d) => vendored.has(d)),
  'chaque tracé est celui d’un fichier de assets/icons/material, aux octets près');
ok(!/<path(?![^>]*\$\{d\})/.test(src), 'aucun <path> dessiné à la main en dehors du gabarit Material');
ok(!/font-style\s*:\s*italic/.test(src), 'rien n’est mis en italique');
ok(!/background\s*:\s*var\(--ink\)/.test(src), 'pas de fond posé sur l’encre');

/* ── 8. LA COQUILLE ──────────────────────────────────────────────────────── */
const inShell = shell.match(/assets\/store-templates\.js\?v=(\d+)/);
const inSw = sw.match(/assets\/store-templates\.js\?v=(\d+)/);
ok(!!inShell, 'le tableau de bord charge le fichier');
ok(!!inSw && inShell && inSw[1] === inShell[1],
  'et la coquille hors ligne le précache SOUS LA MÊME empreinte (sinon elle sert l’ancien)');
ok(/store-templates\.js[^\n]*defer/.test(shell), 'chargé en defer, comme ses voisins');
ok(shell.indexOf('assets/boutique-catalog.js') < shell.indexOf('assets/store-templates.js'),
  'chargé APRÈS le catalogue dont il écrit les articles');

console.log(`\n✓ ${passed} contrôles verts (${failures.length} échec(s))`);
if (failures.length) process.exit(1);
