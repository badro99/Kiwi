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
check(L.tr('Bonjour,') === 'Hello,', 'the native greeting translates its punctuation');
check(L.tr('Acomptes') === 'Deposits', 'the boutique deposits navigation translates in English');
check(L.tr('Boutique') === 'Shop', 'the shared boutique rail section label translates in English');
check(L.tr('Imprimantes') === 'Printers', 'the boutique printers navigation translates in English');
check(L.tr('Notes internes') === 'Internal notes', 'the full profile notes label translates in English');
check(L.tr('Communication') === 'Contact preferences', 'the contact preferences heading translates in English');
check(L.tr('Avoir 350 MAD') === 'Store credit 350 MAD', 'store credit translates without changing the balance');
check(L.tr('Avoir 1 250,50 MAD') === 'Store credit 1 250,50 MAD', 'store credit keeps the exact money formatting');
check(L.tr("CODE D'ACCÈS · 4 CHIFFRES") === 'ACCESS CODE · 4 DIGITS', 'the static native entry prompt translates');
const pairedPinSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caisse-pairing.js'), 'utf8');
const pairedPinCopy = [
  ['CODE PERSONNEL · 4 CHIFFRES', 'PERSONAL CODE · 4 DIGITS', 'الرمز الشخصي · 4 أرقام'],
  ['Code personnel géré depuis votre tableau de bord Kiwi', 'Personal code managed from your Kiwi dashboard', 'يُدار الرمز الشخصي من لوحة التحكم في كيوي'],
  ['Code personnel', 'Personal code', 'الرمز الشخصي'],
];
for (const [fr, en, ar] of pairedPinCopy) {
  check(pairedPinSource.includes(fr), 'paired staff PIN guard targets the actual source literal: ' + fr);
  L.set('fr');
  check(L.tr(fr) === fr, 'French paired staff PIN copy remains unchanged: ' + fr);
  L.set('en');
  check(L.tr(fr) === en, 'English paired staff PIN copy: ' + fr);
  L.set('ar');
  check(L.tr(fr) === ar, 'Arabic paired staff PIN copy: ' + fr);
  L.set('en');
}
const lockToastCopy = 'Terminal verrouillé';
for (const file of ['pos-dispatch.js', 'pressing-caisse.js']) {
  const actualSource = fs.readFileSync(path.join(__dirname, '..', 'assets', file), 'utf8');
  check(actualSource.includes("toast('" + lockToastCopy + "')"), 'lock toast guard targets the actual source call: ' + file);
}
for (const [language, expected] of [['fr', lockToastCopy], ['en', 'Terminal locked'], ['ar', 'تم قفل الجهاز']]) {
  L.set(language);
  check(L.tr(lockToastCopy) === expected, 'normal terminal lock feedback: ' + language);
}
L.set('en');
/* Real SE Arabic scan view stayed entirely French. Guard the actual rendered
 * literals, including the placeholder and demo/unsupported-camera branches. */
const scanCopy = [
  ['Scan produit', 'Product scan', 'مسح المنتج'],
  ["Scannez un article pour voir son prix, ses tailles et son stock. Rien n'est ajouté au ticket.", 'Scan an item to see its price, sizes and stock. Nothing is added to the receipt.', 'امسح منتجاً لعرض سعره ومقاساته ومخزونه. لا يُضاف شيء إلى التذكرة.'],
  ['Scannez ou tapez un code-barres…', 'Scan or type a barcode…', 'امسح رمزاً شريطياً أو اكتبه…'],
  ['ou', 'or', 'أو'],
  ['Scanner avec la caméra', 'Scan with the camera', 'المسح بالكاميرا'],
  ['Scanner un article (douchette démo)', 'Scan an item (demo scanner)', 'مسح منتج (ماسح تجريبي)'],
  ['Tester la douchette', 'Test the scanner', 'اختبار الماسح'],
  ['Derniers articles vérifiés', 'Recently checked items', 'آخر المنتجات التي تم التحقق منها'],
  ['Code inconnu, non référencé', 'Unknown code, not registered', 'رمز غير معروف، غير مسجّل'],
  ["Aucun article vérifié pour l'instant, la douchette USB tape ici toute seule.", 'No items checked yet. The USB scanner enters the code here automatically.', 'لم يتم التحقق من أي منتج بعد. يُدخل الماسح USB الرمز هنا تلقائياً.'],
  ['Ce navigateur ne sait pas lire un code-barres par la caméra. La douchette USB fonctionne, elle tape directement dans le champ ci-dessus.', 'This browser cannot scan barcodes with the camera. The USB scanner works and enters the code in the field above.', 'لا يدعم هذا المتصفح مسح الرموز الشريطية بالكاميرا. يعمل الماسح USB ويُدخل الرمز مباشرة في الحقل أعلاه.'],
];
const boutiqueSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pos-boutique.js'), 'utf8');
for (const [fr, en, ar] of scanCopy) {
  check(boutiqueSource.includes(fr), 'scanner guard targets the actual source literal: ' + fr);
  check(L.tr(fr) === en, 'English scanner copy: ' + fr);
  L.set('ar');
  check(L.tr(fr) === ar, 'Arabic scanner copy: ' + fr);
  L.set('en');
}
check(L.tr('taille $& {x}') === 'size $& {x}', 'data in the size template cannot become replacement syntax');
/* Only these three complete UI sentences may translate an unknown barcode.
 * The entire code is data, including dots, numeric formatting and markup. */
const unknownCodeCopy = [
  ['inconnu, enregistrez-le sur un article', 'Unknown code {code}, register it on an item', 'الرمز {code} غير معروف، سجّله على منتج'],
  ['inconnu, aucun article ne le porte', 'Unknown code {code}, no item uses it', 'الرمز {code} غير معروف، لا يحمله أي منتج'],
  ['inconnu, à enregistrer', 'Unknown code {code}, register it', 'الرمز {code} غير معروف، يجب تسجيله'],
];
const unknownCodes = ['qqq', '0000123-045', 'R&D · Total <img src=x> $& {code} {n}', 'Produits inconnu, à enregistrer\npar Salma'];
for (const [suffix, en, ar] of unknownCodeCopy) {
  check(boutiqueSource.includes('toast(`Code ${code} ' + suffix + '`'), 'unknown-code guard targets the actual complete toast: ' + suffix);
  check(boutiqueSource.includes('toast(`Code ${code} ' + suffix + '`, undefined, \'warn\')'), 'unknown-code feedback explicitly warns instead of reporting success: ' + suffix);
  for (const code of unknownCodes) for (const [lang, expected] of [['fr', 'Code {code} ' + suffix], ['en', en], ['ar', ar]]) {
    L.set(lang);
    check(L.tr('Code ' + code + ' ' + suffix) === expected.replace('{code}', () => code),
      lang + ' unknown-code toast preserves the complete code: ' + code + ' / ' + suffix);
  }
}
for (const lang of ['en', 'ar']) {
  L.set(lang);
  for (const merchant of ['Code Produits', 'Code 0000123-045', 'Code robe inconnu, personnalisé']) {
    check(L.tr(merchant) === merchant, lang + ' no generic Code prefix translation: ' + merchant);
  }
}
L.set('en');
check(L.tr('Salma Bennis · taille S · 480 pts · un avoir actif') === 'Salma Bennis · size S · 480 pts · active store credit', 'customer attachment toast translates without changing the name or balance');
const intakeCopy = [
  ['Reprise de stock', 'Stock intake', 'إدخال المخزون'],
  ["Scannez le code déjà présent sur l'article. Kiwi le garde tel quel · aucune étiquette à réimprimer.", 'Scan the code already on the item. Kiwi keeps it unchanged · no labels to reprint.', 'امسح الرمز الموجود على المنتج. يحتفظ به كيوي كما هو · لا حاجة لإعادة طباعة الملصقات.'],
  ['Scannez un article…', 'Scan an item…', 'امسح منتجًا…'],
  ['Valider le code saisi', 'Validate the entered code', 'التحقق من الرمز المدخل'],
  ['Douchette prête. Pas de douchette ? Tapez le code puis Entrée.', 'Scanner ready. No scanner? Type the code, then press Enter.', 'الماسح جاهز. لا يوجد ماسح؟ اكتب الرمز ثم اضغط إدخال.'],
  ['La douchette ne répond pas ?', 'Scanner not responding?', 'الماسح لا يستجيب؟'],
  ['Terminer la reprise', 'Finish stock intake', 'إنهاء إدخال المخزون'],
  ['Rien encore. La douchette écrit directement dans le champ ci-dessus · pas besoin de cliquer.', 'Nothing yet. The scanner enters the code directly in the field above · no need to click.', 'لا شيء بعد. يُدخل الماسح الرمز مباشرة في الحقل أعلاه · لا حاجة إلى النقر.'],
  ['Tapez ou scannez un code.', 'Type or scan a code.', 'اكتب رمزًا أو امسحه.'],
  ["Rien n'a été lu. Rapprochez la douchette de l'étiquette, ou tapez le code.", 'Nothing was read. Move the scanner closer to the label, or type the code.', 'لم يُقرأ شيء. قرّب الماسح من الملصق أو اكتب الرمز.'],
  ['Lecture incomplète · la douchette a envoyé des caractères parasites. Rescannez, ou tapez le code à la main.', 'Incomplete scan · the scanner sent stray characters. Scan again, or type the code manually.', 'مسح غير مكتمل · أرسل الماسح أحرفًا غير مرغوبة. أعد المسح أو اكتب الرمز يدويًا.'],
  ['Lecture partielle : trop peu de caractères pour être un code-barres. Rescannez plus lentement, ou tapez-le.', 'Partial scan: too few characters for a barcode. Scan again more slowly, or type it.', 'مسح جزئي: عدد الأحرف غير كافٍ لرمز شريطي. أعد المسح ببطء أكبر أو اكتبه.'],
  ["Ce code est anormalement long. Vérifiez qu'un seul article est passé devant la douchette.", 'This code is unusually long. Check that only one item passed in front of the scanner.', 'هذا الرمز طويل بشكل غير معتاد. تأكد من مرور منتج واحد فقط أمام الماسح.'],
  ['Code illisible, rescannez.', 'Unreadable code, scan again.', 'رمز غير مقروء، أعد المسح.'],
  ['Lecture refusée · vide', 'Scan rejected · empty code', 'تم رفض المسح · الرمز فارغ'],
  ['Lecture refusée · illisible', 'Scan rejected · unreadable code', 'تم رفض المسح · الرمز غير مقروء'],
  ['Lecture refusée · trop-court', 'Scan rejected · code too short', 'تم رفض المسح · الرمز قصير جدًا'],
  ['Lecture refusée · trop-long', 'Scan rejected · code too long', 'تم رفض المسح · الرمز طويل جدًا'],
];
for (const [fr,en,ar] of intakeCopy) for (const [lang,expected] of [['fr',fr],['en',en],['ar',ar]]) {
  L.set(lang);
  check(L.tr(fr)===expected,lang+' exact waiting/invalid stock-intake copy: '+fr);
}
check(boutiqueSource.includes("toast('Scan incomplet, rien n\\'a été enregistré', undefined, 'warn')"), 'invalid intake explicitly warns without reporting success or changing default lifetime');
L.set('en');
/* Lower native drawer destinations must translate beyond their rail heading.
 * These are rendered copies from balances, sold insights and printer routing;
 * numeric examples exercise templates without changing merchant amounts. */
const secondaryCopy = [
  ['PAIEMENTS ÉCHELONNÉS', 'INSTALMENT PAYMENTS', 'دفعات على أقساط'],
  ['Retrouvez une note ouverte et encaissez son solde. Chaque paiement compte le jour où il est reçu.', 'Find an open bill and collect its balance. Each payment counts on the day it is received.', 'ابحث عن فاتورة مفتوحة وحصّل رصيدها. يُحتسب كل دفع في يوم استلامه.'],
  ['Cliente ou numéro de ticket', 'Customer or receipt number', 'العميلة أو رقم الإيصال'],
  ['Chercher une cliente ou un ticket', 'Search for a customer or receipt', 'ابحث عن عميلة أو إيصال'],
  ['Chercher une cliente ou un ticket…', 'Search for a customer or receipt…', 'ابحث عن عميلة أو إيصال…'],
  ['Aucune note ouverte pour cette recherche.', 'No open bills for this search.', 'لا توجد فواتير مفتوحة لهذا البحث.'],
  ['Reste 350.50 MAD', 'Remaining 350.50 MAD', 'المتبقي 350.50 MAD'],
  ['Synchronisation en attente', 'Sync pending', 'المزامنة معلّقة'],
  ['Stock vendu, catégories et détail des tickets', 'Sold stock, categories and receipt details', 'المخزون المباع والفئات وتفاصيل الإيصالات'],
  ['Dates', 'Dates', 'التواريخ'],
  ['Jour exact', 'Exact day', 'يوم محدد'],
  ['Période', 'Period', 'الفترة'],
  ['Du', 'From', 'من'],
  ['Au', 'To', 'إلى'],
  ['Appliquer', 'Apply', 'تطبيق'],
  ['Choisissez la date.', 'Choose the date.', 'اختر التاريخ.'],
  ['La fin doit venir après le début.', 'The end must come after the start.', 'يجب أن تأتي النهاية بعد البداية.'],
  ['La période ne peut pas finir dans le futur.', 'The period cannot end in the future.', 'لا يمكن أن تنتهي الفترة في المستقبل.'],
  ['Pièces vendues', 'Units sold', 'القطع المباعة'],
  ['Produits actifs', 'Active products', 'المنتجات النشطة'],
  ['Tickets analysés', 'Receipts analysed', 'الإيصالات المحللة'],
  ['Chiffre produits', 'Product revenue', 'إيرادات المنتجات'],
  ['Aucune vente détaillée aujourd’hui', 'No detailed sales today', 'لا توجد مبيعات مفصّلة اليوم'],
  ['Aucune vente détaillée sur la période choisie', 'No detailed sales in the selected period', 'لا توجد مبيعات مفصّلة في الفترة المختارة'],
  ['dernière vente', 'latest sale', 'آخر بيع'],
  ['en stock', 'in stock', 'في المخزون'],
  ['synchronisation…', 'syncing…', 'جارٍ المزامنة…'],
  ['Aucune vente détaillée sur les 7 derniers jours', 'No detailed sales in the last 7 days', 'لا توجد مبيعات مفصّلة خلال آخر 7 أيام'],
  ['Dès qu’un ticket est encaissé à la caisse avec ses produits, il apparaît ici : quantités, catégories, paniers associés et recommandations.', 'Once a receipt with its products is paid at the till, it appears here: quantities, categories, associated baskets and recommendations.', 'عند دفع إيصال بمنتجاته في الصندوق، يظهر هنا: الكميات والفئات والسلات المرتبطة والتوصيات.'],
  ['Produits', 'Products', 'المنتجات'],
  ['Catégories', 'Categories', 'الفئات'],
  ['Produits vendus ensemble', 'Products sold together', 'منتجات بيعت معًا'],
  ['Quantité, chiffre et dernière vente', 'Quantity, revenue and latest sale', 'الكمية والإيرادات وآخر بيع'],
  ['Associations constatées sur les tickets', 'Combinations observed on receipts', 'توليفات لوحظت في الإيصالات'],
  ['Contribution par rayon', 'Contribution by category', 'مساهمة كل فئة'],
  ['Historique détaillé', 'Detailed history', 'السجل المفصّل'],
  ['Quand et dans quel panier chaque produit a été vendu', 'When and in which basket each product was sold', 'متى وفي أي سلة بيع كل منتج'],
  ['Même ticket', 'Same receipt', 'نفس الإيصال'],
  ['Aucune association répétée pour l’instant.', 'No repeated combinations yet.', 'لا توجد توليفات متكررة بعد.'],
  ['1 pce', '1 unit', '1 قطعة'],
  ['2 pces', '2 units', '2 قطع'],
  ['1 pièce', '1 unit', '1 قطعة'],
  ['2 pièces', '2 units', '2 قطع'],
  ['2 fois', '2 times', '2 مرات'],
  ['Caisse (comptoir)', 'Till (counter)', 'الصندوق (الكاونتر)'],
  ['Reçus clients', 'Customer receipts', 'إيصالات العملاء'],
  ['· Imprimante par défaut (actuelle) ·', '· Default printer (current) ·', '· الطابعة الافتراضية (الحالية) ·'],
  ['· Même imprimante que la caisse ·', '· Same printer as the till ·', '· نفس طابعة الصندوق ·'],
  ['Imprimante de la caisse', 'Till printer', 'طابعة الصندوق'],
  ['Ticket test', 'Test receipt', 'إيصال تجريبي'],
  ['Tester le tiroir', 'Test the drawer', 'اختبار الدرج'],
  ['Production', 'Production', 'الإنتاج'],
  ['Cet appareil n’est pas reconnu comme la caisse d’un commerce · appairez-le d’abord.', 'This device is not recognised as a merchant’s till · pair it first.', 'لم يُتعرّف على هذا الجهاز كصندوق متجر · أقرنه أولًا.'],
  ['Relais pas encore activé côté serveur.', 'Relay not yet enabled on the server.', 'الوسيط غير مفعّل على الخادم بعد.'],
  ['Aucun pont associé à ce commerce.', 'No bridge paired with this merchant.', 'لا يوجد جسر مقترن بهذا المتجر.'],
  ['Pont associé mais hors ligne · lancez Kiwi Printer Bridge sur l’ordinateur du comptoir.', 'Bridge paired but offline · start Kiwi Printer Bridge on the counter computer.', 'الجسر مقترن لكنه غير متصل · شغّل Kiwi Printer Bridge على حاسوب الكاونتر.'],
  ['Connexion directe à l’imprimante depuis l’app Kiwi.', 'Direct connection to the printer from the Kiwi app.', 'اتصال مباشر بالطابعة من تطبيق كيوي.'],
  ['Aucune cible réseau enregistrée.', 'No network target saved.', 'لا توجد وجهة شبكة محفوظة.'],
  ['Adresse IP de l’imprimante', 'Printer IP address', 'عنوان IP للطابعة'],
  ['Rechercher sur le réseau', 'Search the network', 'البحث في الشبكة'],
  ['Exporter le diagnostic d’impression', 'Export printing diagnostics', 'تصدير تشخيص الطباعة'],
  ['Port', 'Network port', 'منفذ الشبكة'],
  ['Largeur papier', 'Paper width', 'عرض الورق'],
  ["Format d'étiquette", 'Label format', 'تنسيق الملصق'],
  ['Modèle', 'Model', 'الطراز'],
  ['Tester', 'Test', 'اختبار'],
  ['80 mm (standard)', '80 mm (standard)', '80 مم (قياسي)'],
  ['Le pont tourne sur l’ordinateur de la caisse et ne communique qu’avec votre imprimante locale.', 'The bridge runs on the till computer and communicates only with your local printer.', 'يعمل الجسر على حاسوب الصندوق ولا يتواصل إلا مع طابعتك المحلية.'],
  ['Télécharger le pont', 'Download the bridge', 'تنزيل الجسر'],
];
for (const [fr, en, ar] of secondaryCopy) {
  L.set('en');
  check(L.tr(fr) === en, 'English secondary-screen copy: ' + fr);
  L.set('ar');
  check(L.tr(fr) === ar, 'Arabic secondary-screen copy: ' + fr);
  L.set('fr');
  check(L.tr(fr) === fr, 'French secondary-screen copy stays original: ' + fr);
}
L.set('en');
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

/* Search data is one template argument, never another segment to translate.
 * Apostrophes, markup and replacement-string markers must remain literal. */
const searchQueries = ["Aïcha d'El Jadida", '+212 645 64 77 33', 'R&D · Total <img src=x> $& {n}', '« atelier »'];
for (const query of searchQueries) {
  check(L.tr('Aucun résultat pour « ' + query + ' »') === 'No results for « ' + query + ' »',
    'English empty search preserves the complete query: ' + query);
  check(L.tr('Nouveau client · « ' + query + ' »') === 'New customer · « ' + query + ' »',
    'English new-customer action preserves the complete query: ' + query);
  check(L.tr('Aucune fiche pour « ' + query + ' »') === 'No customer for « ' + query + ' »',
    'English ticket search preserves the complete query: ' + query);
  check(L.tr('Nouvelle cliente · « ' + query + ' »') === 'New customer · « ' + query + ' »',
    'English ticket create action preserves the complete query: ' + query);
}
L.set('ar');
check(L.tr('Bonjour,') === 'مرحباً،', 'the Arabic native greeting uses Arabic punctuation');
check(L.tr('Acomptes') === 'العربون', 'the boutique deposits navigation translates in Arabic');
check(L.tr('Boutique') === 'متجر', 'the shared boutique rail section label translates in Arabic');
check(L.tr('Imprimantes') === 'الطابعات', 'the boutique printers navigation translates in Arabic');
check(L.tr('Notes internes') === 'ملاحظات داخلية', 'the full profile notes label translates in Arabic');
check(L.tr('Communication') === 'تفضيلات التواصل', 'the contact preferences heading translates in Arabic');
check(L.tr('Avoir 350 MAD') === 'رصيد متجر 350 MAD', 'Arabic store credit preserves the balance');
check(L.tr("CODE D'ACCÈS · 4 CHIFFRES") === 'رمز الدخول · 4 أرقام', 'the Arabic entry prompt translates');
for (const query of searchQueries) {
  check(L.tr('Aucun résultat pour « ' + query + ' »') === 'لا توجد نتائج عن « ' + query + ' »',
    'Arabic empty search preserves the complete query: ' + query);
  check(L.tr('Nouveau client · « ' + query + ' »') === 'عميل جديد · « ' + query + ' »',
    'Arabic new-customer action preserves the complete query: ' + query);
  check(L.tr('Aucune fiche pour « ' + query + ' »') === 'لا يوجد عميل باسم « ' + query + ' »',
    'Arabic ticket search preserves the complete query: ' + query);
  check(L.tr('Nouvelle cliente · « ' + query + ' »') === 'عميلة جديدة · « ' + query + ' »',
    'Arabic ticket create action preserves the complete query: ' + query);
}
L.set('fr');
check(L.tr('Aucun résultat pour « Aïcha »') === 'Aucun résultat pour « Aïcha »', 'French search stays original');
L.set('en');

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
const IDENTICAL_OK = new Set(['Scan', 'Promotions', 'Total', 'Divers', 'Nom', 'Fin', 'Ticket', 'Dormant', 'Email', 'Notes', 'Dates', 'Production', 'Stock', '80 mm (standard)', 'Transactions']);
const lazy = enKeys.filter((k) => EN[k] === k && !IDENTICAL_OK.has(k));
check(!lazy.length, `aucune traduction anglaise oubliée${lazy.length ? ' — ' + lazy.slice(0, 5).join(', ') : ''}`);
const lazyAr = arKeys.filter((k) => AR[k] === k);
check(!lazyAr.length, `aucune traduction arabe oubliée${lazyAr.length ? ' — ' + lazyAr.slice(0, 5).join(', ') : ''}`);
check(enKeys.length >= 100, `le dictionnaire couvre le comptoir (${enKeys.length} phrases)`);

/* La caisse restaurant du téléphone (app native) : ce qu'un serveur touche en
   premier ne doit plus rester en français sur un appareil réglé en anglais. */
for (const fr of ['À emporter', 'Tout', 'Plan de salle', 'Libre', 'Envoyer en cuisine', 'Payer en espèces', 'Pourboire', 'Confirmer', 'Nouvelle table', 'Ouvrir la table', 'Combien de couverts?', "Liste d'attente", 'Vider la commande']) {
  check(EN[fr] && EN[fr] !== fr && AR[fr], `caisse restaurant traduite : « ${fr} »`);
}
check(EN['En cours'] === 'In progress', '« En cours » se lit « In progress » (une table n\'est pas « Running »)');
// #0160 exact interface tuples supplement the real-renderer guard.
const closingCopy = [
  ["Service ouvert à","Shift opened at","بدأ العمل في"],
  ["Durée du service","Shift duration","مدة العمل"],
  ["Transactions","Transactions","المعاملات"],
  ["Articles vendus","Items sold","المنتجات المباعة"],
  ["Total encaissé","Total received","إجمالي المبالغ المحصلة"],
  ["dont Carte","of which card","منها بالبطاقة"],
  ["dont Espèces","of which cash","منها نقدًا"],
  ["dont Autres","of which other payments","منها بطرق دفع أخرى"],
  ["dont Virement / Versement","of which transfer / deposit","منها بتحويل أو إيداع"],
  ["dont Chèque","of which cheque","منها بشيك"],
  ["Acomptes reçus","Deposits received","العربون المحصل"],
  ["Soldes restant à régler","Remaining balances due","الأرصدة المتبقية للدفع"],
  ["Livraisons · à recevoir","Deliveries · receivable","التوصيلات · مبالغ مستحقة"],
  ["Ticket moyen","Average receipt","متوسط التذكرة"],
  ["Promotions du magasin","Store promotions","عروض المتجر"],
  ["Réductions accordées","Discounts granted","التخفيضات الممنوحة"],
  ["Avoirs émis","Store credits issued","أرصدة المتجر الصادرة"],
  ["Réglé en avoir ({n})","Paid with store credit ({n})","مدفوع برصيد المتجر ({n})"],
  ["Clôture de caisse","Close register","إغلاق الصندوق"],
  ["Tiroir-caisse","Cash drawer","درج النقد"],
  ["Espèces encaissées","Cash received","النقد المحصل"],
  ["Attendu en caisse","Expected cash","النقد المتوقع"],
  ["Espèces comptées","Counted cash","النقد المعدود"],
  ["Écart","Difference","الفرق"],
  ["Aucune vente sur ce service.","No sales on this shift.","لا توجد مبيعات خلال فترة العمل هذه."],
  ["Imprimer le rapport Z","Print the Z report","طباعة تقرير Z"],
  ["Fermer la caisse","Close register","إغلاق الصندوق"],
  ["Continuer le service","Continue shift","متابعة العمل"],
  ["Journée clôturée","Day closed","تم إغلاق اليوم"],
  ["Rapport journalier","Daily report","التقرير اليومي"],
  ["Imprimer le rapport","Print report","طباعة التقرير"],
  ["Réimprimer","Reprint","إعادة الطباعة"],
  ["Continuer sans imprimer","Continue without printing","المتابعة دون طباعة"],
  ["Le rapport reste disponible dans le tableau de bord, section Rapport journalier · même après un rechargement ou depuis un autre appareil.","The report remains available in the dashboard’s Daily report section · even after reloading or from another device.","يبقى التقرير متاحًا في قسم التقرير اليومي بلوحة التحكم · حتى بعد إعادة التحميل أو من جهاز آخر."],
  ["Caisse fermée · à bientôt","Register closed · see you soon","تم إغلاق الصندوق · إلى اللقاء"],
  ["Propriétaire","Owner","المالك"],
  ["Tickets","Receipts","التذاكر"],
  ["Rayons","Departments","الأقسام"],
];
for (const [fr, en, ar] of closingCopy) {
  for (const [language, expected] of [['fr', fr], ['en', en], ['ar', ar]]) {
    L.set(language);
    check(L.tr(fr) === expected, "Boutique opening/closing exact copy: " + language + " · " + fr);
  }
}
if (failed) { console.error(`\n✗ ${failed} vérification(s) de langue en échec.`); process.exit(1); }
console.log(`\n✓ ${ran} règles de langue vérifiées (${enKeys.length} phrases × 2 langues).`);
