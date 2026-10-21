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
check(L.tr('Mot inconnu · valeur inconnue') === 'Mot inconnu · valeur inconnue', 'une phrase dont aucun morceau n\'est connu reste intacte');
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
/* Le bandeau du carnet clients, découpé en deux segments par le « · ». */
check(L.tr('1 pt / MAD · palier 100') === '1 pt per MAD · tier 100', 'le programme de fidélité du carnet se traduit des deux côtés du point');
check(L.t('Régulier') === 'Regular', 'le segment d\'une fiche cliente se traduit');
check(L.tr('Caftan Nouveau Souss') === 'Caftan Nouveau Souss', '… mais « Nouveau » dans un nom d\'article ne bouge pas');

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
/* En toutes lettres : l'en-tête de la clôture écrit « Lundi 12 octobre ». */
check(L.tr('Lundi 12 octobre') === 'Monday 12 October', 'un jour et un mois en toutes lettres se traduisent');
check(L.tr('Caftan octobre') === 'Caftan octobre', '… mais pas un mois dans un nom d\'article');
check(L.tr('lundi') === 'lundi', 'un jour en minuscules n\'est pas un en-tête de clôture');

/* ── le trou {x} au milieu d'une phrase ──────────────────────────────────── */
check(L.tr('Imprimante « Bar » enregistrée') === 'Printer “Bar” saved', 'une donnée encadrée par la phrase traverse sans être lue');
check(L.tr('Ticket test envoyé (Cuisine 2)') === 'Test receipt sent (Cuisine 2)', 'même quand elle contient un nombre');
check(L.tr('Imprimante Bar') === 'Imprimante Bar', 'un gabarit qui ne colle pas des deux côtés ne s\'applique pas');

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
/* La clôture écrit « + 5 848 MAD » et « − 8 MAD », le signe séparé par une
   espace. Laissé hors de l'îlot, il passait de l'autre côté du nombre. */
check(wrapped(L.bidi('+ 5 848 MAD'), '+ 5 848 MAD'), 'un signe en tête, suivi d\'une espace, reste avec son montant');
check(wrapped(L.bidi('− 8 MAD'), '− 8 MAD'), 'un écart négatif aussi');
check(L.bidi('الجهاز + 78 MAD').indexOf(LRI + '+') < 0, '… mais pas un « + » au milieu d\'une phrase');
check(wrapped(L.bidi('18:55'), '18:55'), 'une heure ne se relit pas « 55:18 »');
check(wrapped(L.bidi('المجموع 4 785 MAD'), '4 785 MAD'), 'un montant au milieu d\'une phrase arabe');
check(L.bidi('المجموع').indexOf(LRI) < 0, 'un texte sans chiffre n\'est pas touché');
/* Un code de ticket est UN bloc. Coupé entre « MM » et « -1208 », il
   s'affichait « 1208MM- » en tête de ticket — le numéro qu'on dicte au
   téléphone quand une cliente rappelle. */
check(wrapped(L.bidi('MM-1208'), 'MM-1208'), 'un numéro de ticket ne se coupe pas en deux');
/* Une date ISO — la date de naissance d'une fiche cliente — se coupait en trois
   îlots (1985 / -04 / -12) qui s'inversaient : « -12-041985 ». */
check(wrapped(L.bidi('1985-04-12'), '1985-04-12'), 'une date ISO reste d\'un seul tenant');
check(wrapped(L.bidi('10-20 MAD'), '10-20 MAD'), 'une fourchette de prix aussi');
/* … mais un tiret qui n'est PAS collé à un chiffre reste dehors : c'est de la
   ponctuation, et l'îlot ne doit pas avaler la moitié de la phrase. */
check(L.bidi('3 - 4').indexOf(LRI + '3 - 4' + PDI) < 0, 'un tiret entouré d\'espaces n\'est pas un lien');
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
const IDENTICAL_OK = new Set(['Scan', 'Promotions', 'Total', 'Divers', 'Nom', 'Fin', 'Ticket', 'Dormant', 'Email', 'Notes', 'Correction',
  // Le dialogue d'imprimante et la clôture (2026-10-12) : l'arabe change, l'anglais non.
  'Type', 'Port', 'Transactions', '{n} mm', '{n} mm (standard)', '{n}h {n}', 'Terminal + {n} MAD', '{n} transaction', '{n} transactions',
  // Le rail et l'encaissement de la caisse restaurant (2026-10-13).
  'Menu', 'Stock', 'Exact',
  // La vue Vendus de la boutique, la cuisine du restaurant (2026-10-21).
  'Dates', 'Table {n}', 'navigation', 'Date']);
const lazy = enKeys.filter((k) => EN[k] === k && !IDENTICAL_OK.has(k));
check(!lazy.length, `aucune traduction anglaise oubliée${lazy.length ? ' — ' + lazy.slice(0, 5).join(', ') : ''}`);
/* Une paire mal tapée (['Ready'] sans l'arabe, ou une chaîne vide) fusionne
   quand même : la clé existe des deux côtés, le texte non. */
const empty = enKeys.filter((k) => typeof EN[k] !== 'string' || !EN[k].trim() || typeof AR[k] !== 'string' || !AR[k].trim());
check(!empty.length, `aucune traduction vide${empty.length ? ' — ' + empty.slice(0, 5).join(', ') : ''}`);
const lazyAr = arKeys.filter((k) => AR[k] === k);
check(!lazyAr.length, `aucune traduction arabe oubliée${lazyAr.length ? ' — ' + lazyAr.slice(0, 5).join(', ') : ''}`);
check(enKeys.length >= 100, `le dictionnaire couvre le comptoir (${enKeys.length} phrases)`);

/* La caisse restaurant du téléphone (app native) : ce qu'un serveur touche en
   premier ne doit plus rester en français sur un appareil réglé en anglais. */
for (const fr of ['À emporter', 'Tout', 'Plan de salle', 'Libre', 'Envoyer en cuisine', 'Payer en espèces', 'Pourboire', 'Confirmer', 'Nouvelle table', 'Ouvrir la table', 'Combien de couverts?', "Liste d'attente", 'Vider la commande']) {
  check(EN[fr] && EN[fr] !== fr && AR[fr], `caisse restaurant traduite : « ${fr} »`);
}
/* Annuler ou rouvrir une vente depuis « Réimprimer » (pos-reprint.js) : la
   fenêtre du code manager et ses refus restaient en français. */
for (const fr of ['Annuler et rouvrir la note', 'Confirmer l’annulation', 'Annuler définitivement', 'Code manager incorrect.',
  'Cette vente est déjà annulée.', 'Annulation impossible. Vérifiez la connexion et réessayez.', 'Note rouverte', 'Vente annulée']) {
  check(EN[fr] && EN[fr] !== fr && AR[fr], `annulation depuis Réimprimer traduite : « ${fr} »`);
}
check(EN['En cours'] === 'In progress', '« En cours » se lit « In progress » (une table n\'est pas « Running »)');
/* La carte « À emporter » (vrapOrderCard, kiwi-caisse.html) : une commande
   payée affichait son détail en français sur un téléphone réglé en anglais,
   et ses boutons de suivi aussi. */
for (const fr of ['Commande payée', 'Remise au client.', 'En attente de remise. « Retirer du suivi » ne modifie ni le paiement ni les ventes.',
  'Retirer du suivi', 'Remettre au client', 'Marquer prêt', 'Prévenir le client que la commande est prête', 'En attente de paiement',
  'Reprendre le split', 'Partiel']) {
  check(EN[fr] && EN[fr] !== fr && AR[fr], `carte à emporter traduite : « ${fr} »`);
}
L.set('en');
check(L.tr('Commande payée · 12/10/2026 17:25:05') === 'Order paid · 12/10/2026 17:25:05', 'l\'en-tête de commande payée se traduit, la date reste');
check(L.tr('Partiel · reste 120 MAD') === 'Partial · 120 MAD left', 'un paiement partiel se traduit sans toucher au reste dû');
/* La caisse tablette (iPad) : rail, en-tête du constructeur et chiffres du
   service restaient en français sur un appareil réglé en anglais. */
for (const fr of ['· vente au comptoir', 'Commandes à emporter', 'Montant libre', 'Salle', 'Attente', 'catégories']) {
  check(EN[fr] && EN[fr] !== fr && AR[fr], `caisse tablette traduite : « ${fr} »`);
}
check(L.tr('Service depuis 15:35') === 'On shift since 15:35', 'le début de service se traduit, l\'heure reste');
check(L.tr('Carte 47% · Cash 53%') === 'Card 47% · Cash 53%', 'la répartition carte / espèces se traduit, les pourcentages restent');
check(L.tr('7 catégories') === '7 categories', 'le compte de catégories se traduit');
/* La caisse boutique (2026-10-21) : la fenêtre d'encaissement, l'inventaire
   et les toasts qui portent un nom d'article restaient en français en arabe
   et en anglais. Les toasts mettent le nom AVANT la phrase : la clé commence
   donc par {x}, lue par la fin du segment. */
for (const fr of ['Montant…', 'Rendu calculé, flous comptés une fois', 'Terminal de la banque, montant à saisir dessus',
  'Virement / Versement', 'Confirmer uniquement après réception en banque', 'Chèque', 'Confirmer après réception du chèque',
  'Vente enregistrée, paiement à recevoir du transporteur', 'Code d’avoir', 'Scanner ou saisir le code du bon', 'Partager le paiement',
  'Kiwi affiche, le lecteur encaisse', 'Valeur de stock', 'Stock bas / rupture', 'Scannez un article, ou tapez un code…',
  'Imprimer toutes les étiquettes', 'N° de ticket ou téléphone…', 'Tester la douchette', 'Configurer les imprimantes']) {
  check(EN[fr] && EN[fr] !== fr && AR[fr], `caisse boutique traduite : « ${fr} »`);
}
L.set('en');
check(L.tr('Caftan Fassi · M, sur le ticket') === 'Caftan Fassi · M, on the ticket', 'le toast d\'ajout se traduit, le nom et la taille restent');
check(L.tr('Bip, Caftan Fassi · M, sur le ticket · 2 400 MAD') === 'Beep, Caftan Fassi · M, on the ticket · 2 400 MAD', 'le toast du scan se traduit, le prix reste');
check(L.tr('Caftan Fassi · Rouge · M, épuisé') === 'Caftan Fassi · Rouge · M, sold out', 'le toast d\'article épuisé se traduit');
check(L.tr('· stock par taille en direct') === '· live stock by size', 'un morceau qui commence par « · » se traduit');
check(L.tr('Caftans · 4 coul. · 4 tailles · 16/16 codes-barres') === 'Caftans · 4 col. · 4 sizes · 16/16 barcodes', 'la ligne d\'inventaire se traduit, la catégorie reste');
check(L.tr('Imprimante de la caisse: · Imprimante par défaut (actuelle) ·') === 'Till printer: · Default printer (current) ·', 'une info-bulle qui finit par « · » se traduit');
check(L.tr('Robe, sur') === 'Robe, sur', 'une fin trop courte n\'est jamais prise pour une phrase');
check(L.tr(', sur le ticket') === ', sur le ticket', 'le trou d\'une clé par la fin n\'est jamais vide');
L.set('ar');
check(L.tr('Caftan Fassi · M, sur le ticket') === 'Caftan Fassi · M، أُضيف إلى التذكرة', 'le toast d\'ajout se lit en arabe, le nom reste');
L.set('en');
/* Le reste des toasts de la boutique (2026-10-21) : stock insuffisant, avoirs
   émis, échanges, inventaire. Le nom d'article, le code et le montant passent
   tels quels ; un mot connu dans le trou (« Étiquette ») suit la langue. */
L.set('en');
for (const [fr, en] of [
  ['Caftan Fassi · Vert · M, stock insuffisant', 'Caftan Fassi · Vert · M, not enough stock'],
  ['Caftan Fassi · Vert · M, 2 en stock, pas plus', 'Caftan Fassi · Vert · M, only 2 in stock'],
  ['Vente · MM-1208, enregistré sur cette caisse (3 ventes à synchroniser)', 'Sale · MM-1208, saved on this till (3 sales to sync)'],
  ['Remise −10 %, accord Salma', 'Discount −10 %, approved by Salma'],
  ['AV-0042 émis, 1 200 MAD, pièces remises en stock', 'AV-0042 issued, 1 200 MAD, pieces back in stock'],
  ['AV-0042 appliqué, reste 300 MAD à payer', 'AV-0042 applied, 300 MAD left to pay'],
  ['Code 2000000000015 inconnu, aucun article ne le porte', 'Unknown code 2000000000015, no item carries it'],
  ["Caftan Neuf ajouté à l'inventaire", 'Caftan Neuf added to the inventory'],
  ['3 pièces · taille M · code fournisseur conservé', '3 pieces · size M · supplier code kept'],
  ["Étiquette envoyée à l'imprimante", 'Label sent to the printer'],
  ['Caftan Vente ajouté', 'Caftan Vente added'],
]) check(L.tr(fr) === en, `toast boutique traduit : « ${fr} » → « ${L.tr(fr)} »`);
check(L.tr('Robe Rouge 2024') === 'Robe Rouge 2024', 'un nom d\'article avec un nombre ne devient pas un gabarit');
/* La caisse restaurant (2026-10-21) : passation, remise, tiroir, cuisine,
   Stock & appro, équipe et disponibilité du menu restaient en français. */
for (const fr of ['Passation de caisse', 'Poste ouvert à', 'Fond du poste', 'Espèces comptées dans le tiroir', "Écart avec l'attendu",
  'Caissier entrant', 'Recompte les espèces', 'Ouvrir le tiroir sans vente', 'Autorisation manager', 'Pourcentage de remise',
  'Appliquer la remise', 'Client habitué', "Prêtes aujourd'hui", 'Stock & appro', 'Réceptionner du stock', 'Alertes stock',
  "Message à toute l'équipe", 'Donner une pause', 'Masquez immédiatement les articles épuisés', 'Disponibilité du menu',
  'Jusqu’à la fin du service', 'Tout est disponible']) {
  check(EN[fr] && EN[fr] !== fr && AR[fr], `caisse restaurant traduite : « ${fr} »`);
}
L.set('en');
for (const [fr, en] of [
  ['Othmane N. termine son poste, compte le tiroir.', 'Othmane N. is ending the shift and counts the drawer.'],
  ['File de préparation · mise à jour en direct', 'Prep queue · live updates'],
  ['Prête 13:46', 'Ready 13:46'],
  ['En service depuis 08:12 · 4 tables actives', 'On shift since 08:12 · 4 active tables'],
  ['0 kg en stock · niveau par 12 kg · Boucherie Zerktouni', '0 kg in stock · par level 12 kg · Boucherie Zerktouni'],
  ['Harira masqué sur OrderPro et l’app équipe · revient à 15:30', 'Harira hidden on OrderPro and the team app · back at 15:30'],
  ['Passation enregistrée · Salma T. prend la caisse', 'Handover saved · Salma T. takes over the till'],
  ['Addition 45 MAD', 'Bill 45 MAD'],
  ['Bonjour Othmane,', 'Hello Othmane,'],
]) check(L.tr(fr) === en, `caisse restaurant : « ${fr} » → « ${L.tr(fr)} »`);
check(L.tr('mercredi 21 octobre') === 'Wednesday 21 October', 'la date du rail, en minuscule, se traduit');
check(L.tr('mercredi') === 'mercredi', 'un jour seul en minuscule reste tel quel');
check(L.tr('Bonjour Salma / Reda') === 'Bonjour Salma / Reda', 'un « Bonjour » sans sa virgule reste tel quel');
/* « Annuler une vente » affichait le code brut du serveur et l'identifiant
   interne : « card · sale-ref-827e7680-seed-46 ». Le mode de paiement passe
   maintenant par methodLabel (en français, donc traduisible) et la ligne montre
   le numéro de ticket (« Table 9 #99 »), pas l'identifiant. */
{
  const rp = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pos-reprint.js'), 'utf8');
  const ctxRp = {};
  vm.createContext(ctxRp);
  vm.runInContext(rp.slice(rp.indexOf('  var METHOD_FR = {'), rp.indexOf('  function hm(ts) {')) + ';this.methodLabel = methodLabel; this.ticketNo = ticketNo;', ctxRp);
  check(ctxRp.methodLabel('card') === 'Carte' && ctxRp.methodLabel('cash') === 'Espèces' && ctxRp.methodLabel('delivery') === 'Livraison', 'le mode de paiement s\'affiche en français, pas en code serveur');
  check(ctxRp.methodLabel('') === 'mode inconnu', 'un mode absent se dit « mode inconnu »');
  check(ctxRp.ticketNo({ saleId: 'employee-3760-emp', ref: 'Table 9 #99' }) === 'Table 9 #99', 'la ligne montre le numéro de ticket, pas l\'identifiant interne');
  check(!/e\.method \|\| 'mode inconnu'|entry\.method \|\| 'mode inconnu'/.test(rp), 'aucune ligne n\'affiche plus le code de paiement brut');
}
/* L'inventaire physique de la boutique et ses voisins (2026-10-21). */
L.set('en');
for (const [fr, en] of [
  ['0 / 191 articles (0%)', '0 / 191 items (0%)'],
  ['Vérifier et transmettre (0)', 'Review and submit (0)'],
  ['Catégorie: Tous', 'Category: All'],
  ['Largeur papier: 80 mm (standard)', 'Paper width: 80 mm (standard)'],
  ['mer. 21 oct., 06:03', 'Wed 21 Oct, 06:03'],
  ['Saisie à l\'aveugle des quantités réelles. La transmission sera soumise à la validation du propriétaire.', 'Blind entry of the real quantities. The owner approves the submission.'],
]) check(L.tr(fr) === en, `boutique : « ${fr} » → « ${L.tr(fr)} »`);
if (failed) { console.error(`\n✗ ${failed} vérification(s) de langue en échec.`); process.exit(1); }
console.log(`\n✓ ${ran} règles de langue vérifiées (${enKeys.length} phrases × 2 langues).`);
