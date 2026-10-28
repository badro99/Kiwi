#!/usr/bin/env node
import menuWorkspaceSource from './menu-workspace-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Menu scan test — « Scanner un menu » : route AI, garde SSRF,
 * validation bornée, CSV → revue d'import (seul chemin d'écriture).
 *
 *   node tools/menu-scan-test.mjs
 *
 * Discipline : les contrôles exécutés font tourner du code EXTRAIT des
 * fichiers livrés (vm / new Function), jamais une réimplémentation.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

console.log('■ Menu scan test (tools/menu-scan-test.mjs)');

const routeSrc = fs.readFileSync(path.join(ROOT, 'functions/api/ai/menu-import.js'), 'utf8');
const scanSrc = fs.readFileSync(path.join(ROOT, 'assets/menu-scan.js'), 'utf8');
const importSrc = fs.readFileSync(path.join(ROOT, 'assets/catalog-import.js'), 'utf8');
const wsSrc = menuWorkspaceSource();
const html = dashboardDependencies(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8'));
const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');

/* Les fonctions pures de la route sont importées telles quelles ; la route elle-même
 * (auth, quota, modèles, bornes, js-only) tourne dans tools/menu-scan-route-test.mjs. */
const route = await import('../functions/api/ai/menu-import.js');

// ── 1. Garde SSRF sur les liens — exécutée ───────────────────────────────────
const { urlAllowed } = route;
ok(urlAllowed('https://oddmenu.com/p/browse-coffee-brunch') === true, 'un lien https public passe');
ok(urlAllowed('http://oddmenu.com/menu') === false, 'http refusé — https uniquement');
ok(urlAllowed('https://localhost/menu') === false, 'localhost refusé');
ok(urlAllowed('https://192.168.1.10/menu') === false, 'IP privée refusée');
ok(urlAllowed('https://10.0.0.5/x') === false && urlAllowed('https://172.20.3.4/x') === false && urlAllowed('https://169.254.1.1/x') === false, 'plages privées 10/172/169.254 refusées');
ok(urlAllowed('https://41.77.12.9/menu') === false, 'IP publique nue refusée — un menu public a un nom de domaine');
ok(urlAllowed('https://imprimante.local/menu') === false && urlAllowed('https://db.internal/x') === false, '.local et .internal refusés');
ok(urlAllowed('pas-une-url') === false && urlAllowed('') === false, 'entrée illisible refusée');

// ── 2. HTML → texte — exécuté ────────────────────────────────────────────────
const { htmlToText } = route;
const sample = '<head><title>x</title></head><style>.a{color:red}</style><script>var secret=1;</script><div><h1>CARTE</h1><p>Tajine &amp; l&eacute;gumes</p><li>Th&#233; 24 MAD</li></div>';
const textOut = htmlToText(sample);
ok(!/secret|color:red/.test(textOut), 'scripts et styles retirés du texte');
ok(/Tajine & /.test(textOut) && /Thé 24 MAD/.test(textOut.normalize('NFC')) || /Th. 24 MAD/.test(textOut), 'entités HTML décodées (&amp;, numériques)');
ok(/CARTE\n/.test(textOut), 'les blocs produisent des retours de ligne');

// ── 3. Validation bornée des articles — exécutée ─────────────────────────────
const { validateMenuItems } = route;
ok(validateMenuItems(null) === null && validateMenuItems({}) === null && validateMenuItems({ items: [] }) === null, 'vide → null (repli côté client)');
ok(validateMenuItems({ items: [{ price: 45 }] }) === null, 'un article sans nom ne compte pas');
const v1 = validateMenuItems({ currency: 'MAD', items: [{ name: 'Tajine', price: '95.567', cat: 'Plats', sub: 'Four', desc: 'Bon' }] });
ok(v1 && v1.items[0].price === 95.57, 'un prix en chaîne numérique est accepté et arrondi (les modèles en produisent)');
const v2 = validateMenuItems({ items: [{ name: 'Thé', price: 24.456 }, { name: 'X', price: -5 }, { name: 'Y', price: 1e9 }] });
ok(v2.items[0].price === 24.46 && v2.items[1].price === 0 && v2.items[2].price === 99999, 'prix arrondi au centime, borné [0, 99999]');
const long = validateMenuItems({ items: [{ name: 'N'.repeat(300), cat: 'C'.repeat(300), sub: 'S'.repeat(300), desc: 'D'.repeat(900), price: 1 }] });
ok(long.items[0].name.length === 120 && long.items[0].cat.length === 60 && long.items[0].sub.length === 60 && long.items[0].desc.length === 400, 'chaque champ est tronqué à sa borne');
const many = validateMenuItems({ items: Array.from({ length: 450 }, (_, i) => ({ name: 'A' + i, price: 1 })) });
ok(many.items.length === 400, 'au plus 400 articles par appel');

// ── 4. Client : CSV + dédoublonnage — exécutés depuis le fichier livré ───────
const mkWin = () => {
  const doc = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), head: { appendChild() {} }, addEventListener() {}, documentElement: { appendChild() {} } };
  const win = { document: doc, addEventListener() {}, Kiwi: {} };
  win.window = win;
  return { win, doc };
};
const s1 = mkWin();
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/menu-scan.js'), 'utf8'), vm.createContext({ window: s1.win, document: s1.doc, console, URL, Image: function () {}, setTimeout }));
const MS = s1.win.KiwiMenuScan;
ok(!!MS && typeof MS.open === 'function', 'window.KiwiMenuScan.open existe');
const csv = MS._toCsvText([
  { name: 'Tajine; "spécial"', cat: 'Plats', sub: 'Four', price: 95, desc: 'Avec citron; confit' },
  { name: 'Thé', cat: 'Boissons', sub: '', price: 24, desc: '' },
]);
ok(csv.startsWith('article;categorie;sous_categorie;prix_mad;description;disponible'), 'le CSV porte exactement les colonnes de l\'import carte');
ok(/"Tajine; ""spécial"""/.test(csv), 'point-virgule et guillemets échappés dans les champs');
const dd = MS._dedupe([{ name: 'Thé', cat: 'B' }, { name: 'thé ', cat: 'b' }, { name: 'Thé', cat: 'Autre' }, { name: '', cat: 'B' }]);
ok(dd.length === 2, 'dédoublonnage nom+catégorie (pages multiples), noms vides écartés');

// ── 5. Bout en bout : articles AI → CSV → parseur → plan d'import ────────────
const s2 = mkWin();
s2.win.KiwiMenuStore = { categories: () => [], items: () => [] };
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/catalog-import.js'), 'utf8'), vm.createContext({ window: s2.win, document: s2.doc, console, setTimeout, FileReader: function () {}, Intl }));
const KCI = s2.win.KiwiCatalogImport;
ok(typeof KCI.openMenuWithCsv === 'function', 'KiwiCatalogImport.openMenuWithCsv exporté');
const plan = KCI.analyseMenu(KCI.parse(csv));
ok(plan.ok && plan.counts.rows === 2 && plan.counts.newItems === 2 && plan.counts.newCategories === 2 && plan.counts.newSubs === 1, 'le CSV du scan traverse parse() + analyseMenu() : 2 articles, 2 catégories, 1 sous-catégorie');
ok(plan.rows[0].desc === 'Avec citron; confit', 'la description survit à l\'aller-retour CSV');

// ── 6. Route : sécurité, quota, modèles, bornes, js-only → tools/menu-scan-route-test.mjs (la route tourne) ──
ok(/import \{ parseModelResponse \} from '\.\/invoice\.js'/.test(routeSrc), 'lecture des réponses modèle partagée avec invoice.js (pas de copie)');

// ── 7. Client : un seul chemin d'écriture, repli propre ─────────────────────
ok(/callApi\('\/api\/ai\/menu-import'/.test(scanSrc), 'le client appelle /api/ai/menu-import');
ok(/kind: 'text'/.test(scanSrc) && /kind: 'url'/.test(scanSrc) && /kind: 'image'/.test(scanSrc), 'les trois formes (texte, lien, image) sont envoyées');
ok(/toDataURL\('image\/jpeg', 0\.85\)/.test(scanSrc) && /MAX_IMG_EDGE/.test(scanSrc), 'les photos sont réduites côté client avant envoi');
ok(/KiwiCatalogImport\.openMenuWithCsv\(toCsvText\(items\)/.test(scanSrc), 'le résultat AI entre dans la revue d\'import — rien n\'est écrit avant confirmation');
ok(!/\.addItem\(|\.updateItem\(|\.addCategory\(/.test(scanSrc), 'menu-scan.js n\'écrit JAMAIS dans la carte directement');
ok(/files.length > MAX_FILES/.test(scanSrc), 'au plus ' + (scanSrc.match(/MAX_FILES = (\d+)/) || [])[1] + ' fichiers par scan');

// ── 8. Câblage : bouton, handler, coquille ───────────────────────────────────
ok(/data-action="rmw-menu-scan"/.test(wsSrc) && /H\['rmw-menu-scan'\]/.test(wsSrc), 'bouton « Scanner un menu » + handler dans l\'espace restaurant');
const tagOf = (src, name) => (src.match(new RegExp(name.replace('.', '\\.') + '\\?v=(\\d+)')) || [])[1];
ok(tagOf(html, 'assets/menu-scan.js') != null && tagOf(html, 'assets/menu-scan.js') === tagOf(sw, 'assets/menu-scan.js'), 'menu-scan.js : estampille identique entre dashboard.html et kiwi-sw.js');
ok(tagOf(html, 'assets/catalog-import.js') != null && tagOf(html, 'assets/catalog-import.js') === tagOf(sw, 'assets/catalog-import.js'), 'catalog-import.js : estampille identique entre dashboard.html et kiwi-sw.js');

// ── 9. Verrou du nombre de contrôles ─────────────────────────────────────────
const EXPECTED_COUNT = 35;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
}
