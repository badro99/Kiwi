#!/usr/bin/env node
'use strict';

/* La langue du comptoir, vérifiée sans navigateur.
 *
 * Ce qui casse ici ne se voit pas : quand la traduction échoue, l'écran reste
 * simplement en français. Personne ne signale un bug, la fonctionnalité meurt
 * en silence. Les deux choses qu'on vérifie donc :
 *
 *  · la DÉCOUPE des phrases interpolées. « Encaisser · 4 785 MAD » n'est pas
 *    une clé du dictionnaire et ne le sera jamais — le montant change à chaque
 *    ticket. Sans la découpe, le bouton le plus regardé de la caisse reste en
 *    français dans les trois langues.
 *  · l'INTÉGRITÉ du dictionnaire. Une clé anglaise sans jumelle arabe, c'est un
 *    écran à moitié traduit pour la moitié des utilisateurs.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caisse-lang.js'), 'utf8');

/* Un décor minimal : le module greffe un sélecteur et observe le document, mais
   la logique qu'on teste est purement textuelle. */
const store = new Map();
const el = () => ({
  style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  attributes: [], childNodes: [], children: [],
  setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
  appendChild() {}, insertBefore() {}, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
});
const document = {
  readyState: 'complete',
  documentElement: el(), body: Object.assign(el(), { classList: { toggle() {} } }), head: el(),
  createElement: el, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }),
};
const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const context = {
  window, document, localStorage: window.localStorage, console,
  MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
  NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
  WeakMap, Map, Set, Array, Object, String, Number, JSON, Math, RegExp,
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
};
vm.runInNewContext(source, context, { filename: 'caisse-lang.js' });
const L = window.KiwiCaisseLang;

let failed = 0, ran = 0;
function check(ok, label) {
  ran++;
  if (!ok) { console.error(`  ✗ ${label}`); failed++; return; }
  console.log(`  ✓ ${label}`);
}

/* ── les trois langues existent et le français est le défaut ─────────────── */
check(L.get() === 'fr', 'la caisse démarre en français');
check(L.langs.map((x) => x.id).join(',') === 'fr,en,ar', 'trois langues proposées, dans cet ordre');
check(L.langs.filter((x) => x.id === 'ar')[0].dir === 'rtl', 'l\'arabe est déclaré de droite à gauche');

/* ── correspondance exacte ───────────────────────────────────────────────── */
L.set('en');
check(L.t('Encaisser') === 'Take payment', 'une phrase connue est traduite');
check(L.t('Caftan Fassi') === 'Caftan Fassi', 'un nom d\'article du commerçant traverse intact');

/* ── LA DÉCOUPE : ce qui rend le dictionnaire utilisable ─────────────────── */
check(L.tr('Encaisser · 4 785 MAD') === 'Take payment · 4 785 MAD', 'le bouton d\'encaissement se traduit sans toucher au montant');
check(L.tr('2 articles') === '2 items', 'un compte suivi d\'un mot connu se traduit, le nombre reste');
check(L.tr('1 article') === '1 item', 'le singulier aussi');
/* « par Salma » : le mot d'interface passe, le prénom NON. C'est la frontière
   qui compte — le dictionnaire s'arrête net où commence la donnée. */
check(L.tr('Ticket · MM-1208 · par Salma') === 'Sale · MM-1208 · by Salma', 'le mot « par » se traduit, le numéro de ticket et le prénom de la caissière non');
check(L.tr('par Yasmine El Fassi') === 'by Yasmine El Fassi', 'un nom composé traverse entier');
/* Un segment inconnu ne doit pas empêcher les autres de passer, et surtout ne
   doit RIEN inventer. */
check(L.tr('Bonjour · Total') === 'Bonjour · Total', 'une phrase dont aucun morceau n\'est connu reste intacte');
check(L.tr('Aïcha · Total') === 'Aïcha · Total', 'un prénom ne devient jamais un mot du dictionnaire');
check(L.tr('12 400 pts') === '12 400 pts', 'un nombre suivi d\'un mot inconnu reste tel quel');

/* ── le gabarit à trous ──────────────────────────────────────────────────── */
check(L.tr('20 articles concernés') === '20 items covered', 'un nombre AU MILIEU de la phrase est reconnu');
check(L.tr('Se termine dans 3 jours') === 'Ends in 3 days', 'le compte à rebours d\'une promotion se traduit');
check(L.tr('Il en reste 5 ou moins') === '5 left or fewer', 'le seuil de fin de série se traduit, le nombre garde sa place');
/* Le trou peut CHANGER DE PLACE d'une langue à l'autre — c'est tout l'intérêt
   de porter {n} dans la traduction plutôt que de recoller le nombre en tête. */
check(L.tr('Il en reste 5 ou moins').indexOf('5') === 0, 'et il se déplace là où la langue le demande');
check(L.tr('4 785 MAD') === '4 785 MAD', 'un montant n\'est pas un gabarit : il traverse intact');

/* ── les dates ───────────────────────────────────────────────────────────── */
check(L.tr('jeu. 30 juil.') === 'Thu 30 Jul', 'le jour et le mois se traduisent, le quantième reste');
check(L.tr('auj. 14:32') === 'today 14:32', '« auj. » devient un mot, l\'heure ne bouge pas');
check(L.tr('hier 09:05') === 'yesterday 09:05', 'hier aussi');
check(L.tr('sam. 18:00') === 'Sat 18:00', 'un jour seul suivi d\'une heure');
check(L.tr('Encaisser · jeu. 30 juil.') === 'Take payment · Thu 30 Jul', 'une date à l\'intérieur d\'une phrase découpée');
/* LE garde-fou. « mai » et « mars » sont des mois ET des mots ; un article de la
   boutique qui s'appelle « Robe Mai » ne doit pas repartir traduit. On ne
   remplace un jeton que si le segment ENTIER a la forme d'une date. */
check(L.tr('Robe mai') === 'Robe mai', 'un nom d\'article contenant un mois n\'est pas une date');
check(L.tr('mars') === 'Mar', 'un mois SEUL en est une, en revanche');
check(L.tr('Caftan mars soirée') === 'Caftan mars soirée', 'et un mois au milieu d\'un nom ne l\'est pas');

/* ── arabe ───────────────────────────────────────────────────────────────── */
L.set('ar');
check(L.tr('jeu. 30 juil.') === 'الخميس 30 يوليوز', 'la date passe en arabe, avec les mois du Maroc');
check(L.tr('août') === 'غشت', 'غشت et non أغسطس — c\'est un comptoir marocain');

/* ── les montants, en arabe ──────────────────────────────────────────────────
   « 4 785 MAD » s'affichait « MAD 4 785 » : l'espace avant la devise est un
   caractère neutre, l'algorithme bidirectionnel le rend au paragraphe arabe, et
   la séquence se coupe en deux morceaux qui s'inversent. On vérifie donc que
   chaque montant repart entouré de U+2066 / U+2069, et rien d'autre. */
const LRI = '⁦', PDI = '⁩';
const wrapped = (s, inner) => s.indexOf(LRI + inner + PDI) >= 0;
check(wrapped(L.bidi('4 785 MAD'), '4 785 MAD'), 'un montant part isolé, devise comprise');
check(wrapped(L.bidi('−1 115 MAD'), '−1 115 MAD'), 'le signe négatif reste collé au montant');
check(wrapped(L.bidi('−10 %'), '−10 %'), 'un pourcentage aussi');
check(wrapped(L.bidi('18:55'), '18:55'), 'une heure ne se relit pas « 55:18 »');
check(wrapped(L.bidi('المجموع 4 785 MAD'), '4 785 MAD'), 'un montant au milieu d\'une phrase arabe');
check(L.bidi('المجموع').indexOf(LRI) < 0, 'un texte sans chiffre n\'est pas touché');
/* Un code de ticket est UN bloc. Coupé entre « MM » et « -1208 », il
   s'affichait « 1208MM- » en tête de ticket — le numéro qu'on dicte au
   téléphone quand une cliente rappelle. */
check(wrapped(L.bidi('MM-1208'), 'MM-1208'), 'un numéro de ticket ne se coupe pas en deux');
/* Idempotence : le balayage repasse à chaque rendu de la caisse — une vente,
   un scan, un changement de rayon. S'il ré-isolait ce qu'il a déjà isolé, le
   nœud grossirait d'un caractère invisible à chaque frappe. */
const once = L.bidi('4 785 MAD');
check(L.bidi(once) === once, 'ré-isoler un montant déjà isolé ne l\'empile pas');
L.set('fr');
check(L.bidi('4 785 MAD') === '4 785 MAD', 'en français on ne pose aucun caractère invisible');
L.set('ar');
check(L.t('Promotions') === 'العروض', 'le rail parle arabe');
check(L.tr('Encaisser · 4 785 MAD') === 'تحصيل · 4 785 MAD', 'le montant reste lisible en arabe');
check(L.t('Caftan Fassi') === 'Caftan Fassi', 'le nom de l\'article reste celui du commerçant');

/* ── retour au français ──────────────────────────────────────────────────── */
L.set('fr');
check(L.t('Encaisser') === 'Encaisser', 'revenir au français rend les phrases d\'origine');
check(L.tr('2 articles') === '2 articles', 'et la découpe ne s\'applique plus');

/* ── intégrité du dictionnaire ───────────────────────────────────────────── */
L.set('en'); const EN = L.dict();
L.set('ar'); const AR = L.dict();
L.set('fr');
const enKeys = Object.keys(EN), arKeys = Object.keys(AR);
const missingAr = enKeys.filter((k) => !(k in AR));
const missingEn = arKeys.filter((k) => !(k in EN));
check(!missingAr.length, `chaque phrase traduite en anglais l'est aussi en arabe${missingAr.length ? ' — manque : ' + missingAr.slice(0, 5).join(', ') : ''}`);
check(!missingEn.length, `et réciproquement${missingEn.length ? ' — manque : ' + missingEn.slice(0, 5).join(', ') : ''}`);
check(enKeys.every((k) => k.trim() === k && k.length > 0), 'aucune clé ne traîne d\'espace en trop (elle ne correspondrait jamais)');
/* Une clé qui se traduit par elle-même est du bruit : soit elle est inutile,
   soit quelqu'un a oublié de la traduire en croyant l'avoir fait. On tolère les
   mots identiques dans les deux langues (Scan, Promotions, Total). */
const IDENTICAL_OK = new Set(['Scan', 'Promotions', 'Total', 'Divers', 'Nom', 'Fin', 'Ticket']);
const lazy = enKeys.filter((k) => EN[k] === k && !IDENTICAL_OK.has(k));
check(!lazy.length, `aucune traduction anglaise oubliée${lazy.length ? ' — ' + lazy.slice(0, 5).join(', ') : ''}`);
const lazyAr = arKeys.filter((k) => AR[k] === k);
check(!lazyAr.length, `aucune traduction arabe oubliée${lazyAr.length ? ' — ' + lazyAr.slice(0, 5).join(', ') : ''}`);
check(enKeys.length >= 100, `le dictionnaire couvre le comptoir (${enKeys.length} phrases)`);

if (failed) { console.error(`\n✗ ${failed} vérification(s) de langue en échec.`); process.exit(1); }
console.log(`\n✓ ${ran} règles de langue vérifiées (${enKeys.length} phrases × 2 langues).`);
