/* Kiwi AI · product truth and guided feature setup.
 *
 * The financial assistant used to know sales figures but not the product that
 * produced them. This adapter reads the SAME trade/profile/workspace registries
 * as the dashboard, adds the shared cross-trade capabilities, and turns them
 * into concise explanations plus a question-led setup hand-off.
 *
 * It deliberately does not mutate stock, orders or configuration. A setup
 * conversation ends on the real owner page; that page keeps its own validation,
 * permissions, confirmation and audit trail. */
(function () {
  'use strict';

  var state = { trade: '', pending: null };
  var aliases = { boulangerie: 'bakery', gym: 'sport' };
  var pick = function (o, l) { return o == null ? '' : (typeof o === 'string' ? o : (o[l] != null ? o[l] : (o.fr != null ? o.fr : ''))); };
  var MIXMAP = { b: 'ب', t: 'ت', j: 'ج', d: 'د', r: 'ر', z: 'ز', s: 'س', f: 'ف', q: 'ق', k: 'ك', l: 'ل', m: 'م', n: 'ن', h: 'ه', w: 'و', y: 'ي', g: 'ك', 3: 'ع', 7: 'ح', 9: 'ق', 2: 'ء', 5: 'خ', 8: 'غ' };
  /* « kifach nخرج »: an arabizi prefix on an Arabic stem reads as one Arabic word. */
  var unmix = function (s) { return s.replace(/(^|\s)([a-z0-9]{1,5})(?=[\u0621-\u064a])/gi, function (m, sp, p) { return sp + p.toLowerCase().replace(/ch/g, 'ش').replace(/kh/g, 'خ').replace(/gh/g, 'غ').replace(/[aeiou]/g, '').replace(/[a-z0-9]/g, function (c) { return MIXMAP[c] || ''; }); }); };
  var norm = function (s) { return unmix(String(s == null ? '' : s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); };
  var L = function (fr, en, ar) { return { fr: fr, en: en, ar: ar }; };

  function lang(raw) {
    if (/[\u0600-\u06ff]/.test(String(raw || ''))) return 'ar';
    try { var x = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang(); return x === 'en' || x === 'ar' ? x : 'fr'; }
    catch (_) { return 'fr'; }
  }
  function venue() { try { return window.KiwiVenue && window.KiwiVenue.getCurrentVenueData ? (window.KiwiVenue.getCurrentVenueData() || {}) : {}; } catch (_) { return {}; } }
  function trade() {
    var v = venue();
    var raw = String(v.subtype || v.trade || v.type || (window.KiwiMe && window.KiwiMe.type) || '');
    var resolved = '';
    try { resolved = window.KiwiTrades && window.KiwiTrades.resolve ? window.KiwiTrades.resolve(raw) : ''; } catch (_) {}
    raw = resolved || aliases[raw] || raw || 'autre';
    if (state.trade && state.trade !== raw) state.pending = null;
    state.trade = raw;
    return raw;
  }
  function base(t) {
    try { return (window.KiwiTrades && window.KiwiTrades.base && window.KiwiTrades.base(t)) || ({ pressing: 'boutique', epicerie: 'boutique', pharmacie: 'boutique', librairie: 'boutique', fleuriste: 'boutique', coiffure: 'spa', sport: 'spa' }[t]) || t; }
    catch (_) { return t; }
  }
  function tradeLabel(t, l) {
    try { return (window.KiwiTrades && window.KiwiTrades.label && window.KiwiTrades.label(t)) || t; }
    catch (_) { return t; }
  }

  var COPY = {
    fr: {
      list: function (n) { return 'Kiwi adapte ses outils à votre activité. Pour <b>' + n + '</b>, voici les fonctions réellement disponibles.'; },
      common: 'Commun à votre établissement', vertical: 'Conçu pour votre métier', open: 'Ouvrir et configurer',
      setupLead: function (n) { return 'Je vais configurer le parcours de <b>' + n + '</b> avec vous. Trois réponses suffisent ; je vous donnerai ensuite l’ordre exact des pages à ouvrir.'; },
      featureLead: function (n) { return 'Je vais préparer <b>' + n + '</b> avec vous. Trois réponses suffisent avant d’ouvrir la page de validation.'; },
      featureDone: function (n) { return 'Le plan d’intégration de <b>' + n + '</b> est prêt. Vérifiez ces points, puis ouvrez la page pour valider.'; },
      q: 'Question de configuration', saved: 'Réponse notée', done: 'Votre parcours recommandé est prêt. Ouvrez les pages dans cet ordre : Kiwi conserve les réglages par établissement et les partage avec la caisse.',
      cancel: 'Configuration interrompue. Aucun réglage n’a été modifié.', no: 'Cette fonction ne fait pas partie du parcours actif de cet établissement.',
      setup: 'Aide-moi à configurer mon établissement', all: 'Quelles fonctions Kiwi ai-je ?', details: 'Comment fonctionne cette fonction ?',
      safe: 'Je vous guide jusqu’au bon écran ; Kiwi ne change jamais un réglage sensible sans votre validation sur cette page.',
      purpose: 'À quoi ça sert', steps: 'Mise en place', availability: 'Disponibilité', active: 'Incluse pour votre métier',
      readiness: 'État réel', ready: 'Prête', attention: 'À compléter', validation: 'À valider', gaps: 'Points manquants', checked: 'Vérifié sur cet établissement',
    },
    en: {
      list: function (n) { return 'Kiwi adapts its tools to your business. These are the capabilities actually available for <b>' + n + '</b>.'; },
      common: 'Shared business tools', vertical: 'Built for your trade', open: 'Open and configure',
      setupLead: function (n) { return 'I will configure the <b>' + n + '</b> workflow with you. Three answers are enough; I will then give you the exact pages to open, in order.'; },
      featureLead: function (n) { return 'I will prepare <b>' + n + '</b> with you. Three answers are enough before opening the validation page.'; },
      featureDone: function (n) { return 'The integration plan for <b>' + n + '</b> is ready. Check these points, then open the page to validate.'; },
      q: 'Setup question', saved: 'Answer noted', done: 'Your recommended setup path is ready. Open these pages in order. Kiwi keeps configuration per location and shares it with the till.',
      cancel: 'Setup stopped. No setting was changed.', no: 'This capability is not part of this location’s active workflow.',
      setup: 'Help me configure my business', all: 'Which Kiwi features do I have?', details: 'How does this feature work?',
      safe: 'I guide you to the right screen; Kiwi never changes a sensitive setting without confirmation on that page.',
      purpose: 'What it does', steps: 'Setup', availability: 'Availability', active: 'Included for your trade',
      readiness: 'Live readiness', ready: 'Ready', attention: 'Needs completion', validation: 'Needs validation', gaps: 'Missing points', checked: 'Checked for this location',
    },
    ar: {
      list: function (n) { return 'يكيّف Kiwi أدواته مع نشاطك. هذه هي الوظائف المتاحة فعلاً لـ <b>' + n + '</b>.'; },
      common: 'أدوات مشتركة', vertical: 'مصمم لنشاطك', open: 'فتح وضبط',
      setupLead: function (n) { return 'سأضبط مسار <b>' + n + '</b> معك. تكفي ثلاثة أجوبة، ثم أعطيك الصفحات بالترتيب.'; },
      featureLead: function (n) { return 'سأجهز <b>' + n + '</b> معك. تكفي ثلاثة أجوبة قبل فتح صفحة التأكيد.'; },
      featureDone: function (n) { return 'خطة دمج <b>' + n + '</b> جاهزة. راجع هذه النقاط ثم افتح الصفحة للتأكيد.'; },
      q: 'سؤال الإعداد', saved: 'تم تسجيل الجواب', done: 'مسار الإعداد المقترح جاهز. افتح الصفحات بهذا الترتيب؛ يحفظ Kiwi الإعدادات لكل مؤسسة ويشاركها مع الصندوق.',
      cancel: 'تم إيقاف الإعداد ولم يتغير أي ضبط.', no: 'هذه الوظيفة ليست ضمن المسار النشط لهذه المؤسسة.',
      setup: 'ساعدني في إعداد مؤسستي', all: 'ما هي وظائف Kiwi المتاحة؟', details: 'كيف تعمل هذه الوظيفة؟',
      safe: 'أرشدك إلى الشاشة الصحيحة، ولا يغيّر Kiwi أي إعداد حساس دون تأكيدك داخل الصفحة.',
      purpose: 'الفائدة', steps: 'الإعداد', availability: 'التوفر', active: 'متاح لنشاطك',
      readiness: 'الحالة الفعلية', ready: 'جاهزة', attention: 'تحتاج الإكمال', validation: 'تحتاج التحقق', gaps: 'النقاط الناقصة', checked: 'تم التحقق لهذه المؤسسة',
    },
  };

  /* Shared features exist independently from the exact-trade workspace. */
  var DEFS = {
    caisse: { label: L('Caisse adaptée au métier', 'Trade-specific till', 'صندوق مناسب للنشاط'),
      summary: L('La caisse reprend le vocabulaire et le flux de votre activité, tout en alimentant le même journal de ventes que le tableau de bord.', 'The till follows your trade’s vocabulary and workflow while writing to the same sales journal as the dashboard.', 'يتبع الصندوق لغة ومسار نشاطك ويسجل في نفس دفتر المبيعات.'),
      steps: L('Connecter la caisse → choisir les accès employés → faire une vente test', 'Pair the till → choose staff access → run a test sale', 'ربط الصندوق ← تحديد دخول الموظفين ← تنفيذ بيع تجريبي'), keywords: 'caisse pos comptoir encaissement till checkout appairer jumeler pairing tablette ipad صندوق كاسة', nav: 'terminaux' },
    payments: { label: L('Paiements et partage', 'Payments and split tender', 'الدفع وتقسيم المبلغ'),
      summary: L('Espèces, carte, paiement partagé et crédit client sont conservés avec leur ventilation réelle sur le ticket.', 'Cash, card, split tender and customer credit retain their real breakdown on the receipt.', 'يحفظ النقد والبطاقة والدفع المقسم ودين العميل بتفاصيله الحقيقية.'),
      steps: L('Configurer les moyens → connecter le terminal carte → tester chaque combinaison', 'Configure methods → connect the card terminal → test each combination', 'ضبط طرق الدفع ← ربط جهاز البطاقة ← اختبار كل تركيبة'), keywords: 'paiement paye cash carte split partage credit client dette tender diviser addition separer خلاص كارط الدفع', nav: 'reglements' },
    inventory: { label: L('Inventaire traçable', 'Traceable inventory', 'مخزون قابل للتتبع'),
      summary: L('Chaque réception, vente, ajustement et annulation devient un mouvement append-only : le stock se reconstruit sans écraser l’historique.', 'Every receipt, sale, adjustment and reversal becomes an append-only movement, so stock is rebuilt without erasing history.', 'كل استلام وبيع وتعديل وإلغاء يصبح حركة محفوظة دون مسح التاريخ.'),
      steps: L('Importer ou créer les articles → saisir les soldes initiaux → régler les seuils et fournisseurs', 'Import or create items → enter opening balances → set thresholds and suppliers', 'استيراد أو إنشاء المنتجات ← إدخال الرصيد الأولي ← ضبط الحدود والموردين'), keywords: 'stock inventaire inventory rupture reapprovisionnement mouvement lot fournisseur ingredient produit article ajouter creer importer quantite مخزون ستوك سلعة منتوج منتج montoj sel3a', nav: 'stock' },
    scanner: { label: L('Scan continu mobile', 'Continuous mobile scanning', 'المسح المستمر بالهاتف'),
      summary: L('La caméra lit les codes en continu, retrouve prix, stock et promotion, puis permet de créer immédiatement un produit inconnu.', 'The camera continuously reads codes, shows price, stock and promotion, and can immediately create an unknown product.', 'تقرأ الكاميرا الرموز باستمرار وتعرض السعر والمخزون والعرض وتسمح بإنشاء منتج غير معروف.'),
      steps: L('Autoriser la caméra Safari → vérifier les codes-barres → faire un encaissement et une impression test', 'Allow the camera in Safari → verify barcodes → run a checkout and print test', 'السماح للكاميرا في Safari ← التحقق من الرموز ← اختبار البيع والطباعة'), keywords: 'scan scanner camera iphone code barre barcode produit inconnu douchette', nav: 'inventory', trades: ['boutique', 'epicerie', 'pharmacie', 'librairie', 'fleuriste', 'autre'] },
    offline: { label: L('Mode local et synchronisation', 'Local-first and sync', 'العمل المحلي والمزامنة'),
      summary: L('Les opérations prises en charge restent utilisables sans réseau et sont rejouées avec des identifiants idempotents dès le retour de la connexion.', 'Supported operations keep working without a network and replay with idempotent IDs when connectivity returns.', 'تستمر العمليات المدعومة دون شبكة وتُزامن بمعرّفات تمنع التكرار عند عودة الاتصال.'),
      steps: L('Installer la caisse → ouvrir une fois en ligne → vérifier l’indicateur de synchronisation', 'Install the till → open once online → verify the sync indicator', 'تثبيت الصندوق ← فتحه مرة متصلاً ← التحقق من مؤشر المزامنة'), keywords: 'offline hors ligne sans internet synchronisation sync reseau connexion انترنت كونيكسيون internet', nav: 'terminaux' },
    receipts: { label: L('Tickets, reçus et impression', 'Receipts and printing', 'التذاكر والطباعة'),
      summary: L('Le même moteur produit l’aperçu, le reçu thermique et l’impression système ; l’apparence se règle une fois dans le tableau de bord.', 'One engine produces the preview, thermal receipt and system print; appearance is configured once in the dashboard.', 'ينتج محرك واحد المعاينة والوصل الحراري والطباعة ويُضبط الشكل مرة واحدة.'),
      steps: L('Renseigner l’identité légale → choisir le modèle → connecter l’imprimante Bluetooth → imprimer un test', 'Enter legal identity → choose a template → connect the Bluetooth printer → print a test', 'إدخال الهوية القانونية ← اختيار النموذج ← ربط طابعة Bluetooth ← طباعة اختبار'), keywords: 'ticket recu facture impression imprimer imprimante bluetooth etiquette printer receipt print طابعة طباعة نطبع تيكي فاتورة tabi3a ntb3 tiki', nav: 'terminaux' },
    clients: { label: L('Clients et fidélité', 'Customers and loyalty', 'العملاء والولاء'),
      summary: L('Les fiches, consentements, visites, dépenses et avantages suivent le client entre la caisse et le tableau de bord.', 'Profiles, consent, visits, spend and rewards follow the customer between till and dashboard.', 'تنتقل الملفات والموافقات والزيارات والمصاريف والمكافآت بين الصندوق ولوحة التحكم.'),
      steps: L('Choisir le modèle de fidélité → définir la récompense → identifier un client test en caisse', 'Choose the loyalty model → set the reward → identify a test customer at checkout', 'اختيار نظام الولاء ← تحديد المكافأة ← تعريف عميل تجريبي في الصندوق'), keywords: 'client fidelite points recompense crm habitue loyalty customer carte stamps tampons زبون كليان الوفاء نقط klyan zboun', nav: 'clients' },
    team: { label: L('Équipe et accès', 'Team and access', 'الفريق والصلاحيات'),
      summary: L('Chaque rôle reçoit uniquement les pages et chiffres autorisés, avec son propre accès caisse et son planning.', 'Each role receives only authorised pages and figures, with its own till access and schedule.', 'يحصل كل دور فقط على الصفحات والأرقام المسموحة مع دخوله وجدوله.'),
      steps: L('Créer les rôles → ajouter l’équipe → attribuer accès et planning → tester un compte employé', 'Create roles → add staff → assign access and schedule → test an employee account', 'إنشاء الأدوار ← إضافة الفريق ← تحديد الصلاحيات والجدول ← اختبار حساب موظف'), keywords: 'equipe employe staff role acces pin planning paie salaire payer serveur caissier employee pointage موظف خدام خدامة فريق khdam khddam', nav: 'equipe' },
    hours: { label: L('Horaires partagés', 'Shared opening hours', 'ساعات العمل المشتركة'),
      summary: L('Une seule fiche alimente réservations, commande en ligne, caisse, rapport et réponses de l’assistant.', 'One schedule feeds reservations, online ordering, till, reports and assistant answers.', 'جدول واحد يغذي الحجوزات والطلب والصندوق والتقارير وإجابات المساعد.'),
      steps: L('Saisir la semaine → ajouter Ramadan, Aïd ou congés → vérifier un créneau test', 'Enter the week → add Ramadan, Eid or holidays → verify a test slot', 'إدخال الأسبوع ← إضافة رمضان أو العيد أو العطل ← اختبار موعد'), keywords: 'horaire ouverture fermeture ramadan conge open hours closing ساعات الفتح الاغلاق', nav: 'equipe' },
    reporting: { label: L('Rapport journalier et ventes', 'Daily report and sales', 'التقرير اليومي والمبيعات'),
      summary: L('Les ventes validées alimentent le chiffre, les moyens de paiement, les articles et les clôtures sans ressaisie.', 'Validated sales feed revenue, payment methods, items and closures without re-entry.', 'تغذي المبيعات المؤكدة الإيرادات وطرق الدفع والمنتجات والإغلاقات دون إعادة إدخال.'),
      steps: L('Faire une vente test → vérifier le journal → contrôler le rapport Z', 'Run a test sale → verify the journal → check the Z report', 'تنفيذ بيع تجريبي ← التحقق من السجل ← مراجعة تقرير Z'), keywords: 'rapport journalier chiffre transaction cloture z report export excel exporter rapport تقرير', nav: 'transactions' },

    tables: { label: L('Plan de salle et tables', 'Floor plan and tables', 'خريطة القاعة والطاولات'), summary: L('Ouvrez les tables, suivez leur état et gardez chaque addition attachée au bon service.', 'Open tables, track their state and keep each bill attached to the right service.', 'افتح الطاولات وتتبع حالتها واربط كل فاتورة بالخدمة الصحيحة.'), steps: L('Dessiner les zones → créer les tables → tester ouverture, déplacement et règlement', 'Draw areas → create tables → test open, move and settle', 'رسم المناطق ← إنشاء الطاولات ← اختبار الفتح والنقل والدفع'), keywords: 'table salle terrasse addition plan floor طاولة طابلة tabla', nav: 'tables' },
    menu: { label: L('Carte, options et stations', 'Menu, options and stations', 'القائمة والخيارات والمحطات'), summary: L('Produits, variantes, suppléments et routage cuisine restent communs au tableau de bord et à la caisse.', 'Products, variants, add-ons and kitchen routing stay shared between dashboard and till.', 'تتشارك لوحة التحكم والصندوق المنتجات والخيارات وتوجيه المطبخ.'), steps: L('Créer les catégories → ajouter produits et options → affecter les stations → publier', 'Create categories → add products and options → assign stations → publish', 'إنشاء الفئات ← إضافة المنتجات والخيارات ← تعيين المحطات ← النشر'), keywords: 'menu carte produit plat option supplement station recette tarif prix article dish ajouter creer منيو المنيو طبق بلات قائمة plat', nav: 'menu' },
    kds: { label: L('Écran de production', 'Production screen', 'شاشة الإنتاج'), summary: L('Les commandes avancent par station et statut jusqu’à la remise, sans réimprimer la même information.', 'Orders move by station and status through hand-off without reprinting the same information.', 'تتحرك الطلبات حسب المحطة والحالة حتى التسليم دون إعادة طباعة.'), steps: L('Créer les stations → router les articles → connecter l’écran → tester une commande', 'Create stations → route items → connect the screen → test an order', 'إنشاء المحطات ← توجيه المنتجات ← ربط الشاشة ← اختبار طلب'), keywords: 'kds cuisine ecran preparation production four barista', nav: 'kds' },
    reservations: { label: L('Réservations', 'Reservations', 'الحجوزات'), summary: L('Les créneaux respectent les horaires de l’établissement et restent liés au client et à la capacité.', 'Slots respect business hours and stay linked to the customer and capacity.', 'تحترم المواعيد ساعات العمل وترتبط بالعميل والسعة.'), steps: L('Régler les horaires → définir la capacité → créer une réservation test', 'Set opening hours → define capacity → create a test booking', 'ضبط الساعات ← تحديد السعة ← إنشاء حجز تجريبي'), keywords: 'reservation reserver booking rdv rendez vous creneau حجز reservi', nav: 'reservations' },

    'pressing-orders': { label: L('Dépôts et commandes', 'Drop-offs and orders', 'الإيداعات والطلبات'), summary: L('Chaque dépôt relie client, pièces, traitements, échéance, acompte et solde dans un seul bon.', 'Each drop-off links customer, garments, treatments, due date, deposit and balance in one order.', 'يربط كل إيداع العميل والقطع والمعالجة والموعد والتسبيق والرصيد في طلب واحد.'), steps: L('Créer les services → faire un dépôt test → imprimer ticket et étiquettes', 'Create services → run a test drop-off → print receipt and labels', 'إنشاء الخدمات ← تجربة إيداع ← طباعة التذكرة والملصقات'), keywords: 'depot commande pressing acompte solde piece vetement', nav: 'pressing-orders' },
    'pressing-workshop': { label: L('Atelier et flux', 'Workshop workflow', 'الورشة وسير العمل'), summary: L('Les commandes avancent de la réception au traitement puis au prêt, avec les promesses dépassées en tête de file.', 'Orders move from intake through treatment to ready, with passed promise dates first in the queue.', 'تنتقل الطلبات من الاستلام إلى المعالجة ثم الجاهزية، مع المواعيد المتجاوزة في المقدمة.'), steps: L('Faire un dépôt test → suivre son état dans l’atelier → le marquer prêt', 'Run a test drop-off → follow its status in the workshop → mark it ready', 'تجربة إيداع ← متابعة حالته في الورشة ← تحديده جاهزًا'), keywords: 'atelier flux traitement lavage repassage detacher pret retard', nav: 'pressing-workshop' },
    'pressing-pickup': { label: L('Retraits, rack et étiquettes', 'Pickup, rack and labels', 'الاستلام والرف والملصقات'), summary: L('Le code d’étiquette retrouve exactement la commande, son rack, son client et le solde restant.', 'A label code retrieves the exact order, rack, customer and outstanding balance.', 'يعثر رمز الملصق على الطلب والرف والعميل والرصيد المتبقي بدقة.'), steps: L('Imprimer les étiquettes → attribuer les racks → tester scan, retrait et réimpression', 'Print labels → assign racks → test scan, pickup and reprint', 'طباعة الملصقات ← تعيين الرفوف ← اختبار المسح والاستلام وإعادة الطباعة'), keywords: 'retrait rack rangement etiquette code scan reimprimer', nav: 'pressing-pickup' },
    'pressing-services': { label: L('Services et tarifs', 'Services and pricing', 'الخدمات والأسعار'), summary: L('Noms, catégories, prix par traitement et visibilité à la caisse sont modifiables depuis une grille unique.', 'Names, categories, prices per treatment and till visibility are editable from one grid.', 'يمكن تعديل الأسماء والفئات وأسعار المعالجات وظهورها في الصندوق من شاشة واحدة.'), steps: L('Créer les catégories → saisir les tarifs par traitement → masquer les services indisponibles → enregistrer', 'Create categories → enter prices per treatment → hide unavailable services → save', 'إنشاء الفئات ← إدخال أسعار المعالجة ← إخفاء الخدمات غير المتاحة ← الحفظ'), keywords: 'service tarif prix nom renommer categorie chemise lavage sec repassage supplement pressing visible caisse', nav: 'pressing-services' },
    'pressing-quality': { label: L('Qualité et vigilances', 'Quality and care notes', 'الجودة والملاحظات'), summary: L('Les taches et instructions saisies au comptoir restent attachées au vêtement concerné jusqu’à la remise.', 'Stains and instructions entered at the counter stay attached to the garment until hand-over.', 'تبقى البقع والتعليمات المسجلة في الصندوق مرتبطة بالقطعة حتى التسليم.'), steps: L('Saisir une tache ou une consigne au dépôt → la retrouver sur la page Qualité', 'Enter a stain or instruction at drop-off → find it on the Quality page', 'تسجيل بقعة أو تعليمة عند الإيداع ← العثور عليها في صفحة الجودة'), keywords: 'qualite incident photo tache dommage reprise reclamation', nav: 'pressing-quality' },
    'pressing-delivery': { label: L('Collecte et livraison', 'Collection and delivery', 'الجمع والتوصيل'), summary: L('Kiwi n’organise pas encore de tournées : les dépôts et les retraits se font au comptoir.', 'Kiwi does not organise delivery rounds yet: drop-offs and pick-ups happen at the counter.', 'لا ينظم Kiwi جولات توصيل بعد: الإيداع والاستلام يتمان في الصندوق.'), steps: L('Utiliser le retrait au comptoir et la notification WhatsApp du client', 'Use counter pick-up and the WhatsApp customer notification', 'استخدام الاستلام في الصندوق وإبلاغ الزبون عبر واتساب'), keywords: 'collecte livraison course adresse zone ramassage pressing', nav: 'pressing-delivery' },
  };

  var BASE_FEATURES = {
    restaurant: ['caisse', 'payments', 'receipts', 'offline', 'clients', 'team', 'hours', 'reporting', 'tables', 'menu', 'kds', 'inventory', 'reservations'],
    boutique: ['caisse', 'payments', 'receipts', 'offline', 'clients', 'team', 'hours', 'reporting', 'inventory', 'scanner'],
    spa: ['caisse', 'payments', 'receipts', 'offline', 'clients', 'team', 'hours', 'reporting'],
    hotel: ['caisse', 'payments', 'receipts', 'offline', 'clients', 'team', 'hours', 'reporting'],
  };
  var PRESSING = ['pressing-orders', 'pressing-workshop', 'pressing-pickup', 'pressing-services', 'pressing-quality', 'pressing-delivery'];

  function profileItems(t) {
    try { var p = window.KiwiVenue && window.KiwiVenue.getSubtypeProfile && window.KiwiVenue.getSubtypeProfile(t); return p && Array.isArray(p.items) ? p.items : []; }
    catch (_) { return []; }
  }
  function workspace(t, nav) {
    try {
      var P = window.KiwiTradeWorkspaces && window.KiwiTradeWorkspaces.pages;
      if (!Array.isArray(P)) return null;
      return P.find(function (x) { return x.trade === t && x.nav === nav; }) || null;
    } catch (_) { return null; }
  }
  function navDetail(t, item) {
    var w = workspace(t, item.nav);
    return {
      key: item.nav, nav: item.nav, vertical: true,
      label: item.label || (w && w.title) || item.nav,
      summary: (w && w.subtitle) || L('Cette page centralise « ' + pick(item.label, 'fr') + ' » pour cet établissement.', 'This page centralises ' + pick(item.label, 'en') + ' for this location.', 'تجمع هذه الصفحة ' + pick(item.label, 'ar') + ' لهذه المؤسسة.'),
      steps: L('Ouvrir la page → saisir un premier dossier test → vérifier son passage entre les étapes', 'Open the page → enter a first test record → move it through its stages', 'فتح الصفحة ← إدخال ملف تجريبي ← تمريره بين المراحل'),
      keywords: [item.nav, pick(item.label, 'fr'), pick(item.label, 'en'), pick(item.label, 'ar')].join(' '),
    };
  }
  function features(t) {
    t = t || trade(); var b = base(t); var out = [], seen = {};
    function add(key, vertical) {
      var d = DEFS[key]; if (!d || seen[key]) return;
      if (d.bases && d.bases.indexOf(b) < 0) return;
      if (d.trades && d.trades.indexOf(t) < 0) return;
      seen[key] = true; out.push(Object.assign({ key: key, vertical: !!vertical }, d));
    }
    (BASE_FEATURES[b] || BASE_FEATURES.boutique).forEach(function (k) { add(k, false); });
    /* Boutique is a base family, not a promise that every specialised trade
     * owns the retail scanner. Pressing, for example, scans its own garment
     * labels during rack/pickup instead of EAN retail products. */
    if (b === 'boutique' && t !== 'boutique') out = out.filter(function (f) { return f.key !== 'scanner'; });
    /* The retail family calls its product page Inventaire; restaurant uses the
     * ingredient Stock page. Keep the explanation shared but open the page
     * that is actually present for this merchant. */
    if (b === 'boutique') out.forEach(function (f) { if (f.key === 'inventory') f.nav = 'inventory'; });
    if (t === 'pressing') PRESSING.forEach(function (k) { add(k, true); });
    profileItems(t).forEach(function (item) {
      if (!item || !item.nav || seen[item.nav]) return;
      var d = DEFS[item.nav];
      if (d) add(item.nav, true);
      else { seen[item.nav] = true; out.push(navDetail(t, item)); }
    });
    return out;
  }

  function registerHandler(f) {
    if (!f || !f.nav) return '';
    var name = 'kiwi-feature-' + f.key;
    try {
      window.Kiwi = window.Kiwi || {}; window.Kiwi.handlers = window.Kiwi.handlers || {};
      if (!window.Kiwi.handlers[name]) window.Kiwi.handlers[name] = function () {
        var normal = window.Kiwi.handlers['nav-' + f.nav];
        if (typeof normal === 'function') return normal();
        if (trade() === 'pressing' && window.KiwiPressingDashboard && window.KiwiPressingDashboard.showPage) return window.KiwiPressingDashboard.showPage(f.nav);
        if (window.KiwiTradeWorkspaces && window.KiwiTradeWorkspaces.render && window.KiwiTradeWorkspaces.render(f.nav)) return true;
        var a = document.querySelector && document.querySelector('.sidebar a[data-nav="' + f.nav + '"]');
        if (a && a.click) a.click();
      };
      return name;
    } catch (_) { return ''; }
  }
  function openFor(f, l) {
    var h = registerHandler(f); if (!h) return [];
    return [{ label: (COPY[l] || COPY.fr).open + ' · ' + pick(f.label, l), handler: h }];
  }

  function readiness(f) {
    try {
      if (window.KiwiFeatureTruth && typeof window.KiwiFeatureTruth.readiness === 'function') return window.KiwiFeatureTruth.readiness(f.key, f.nav);
    } catch (_) {}
    return { key: f.key, status: 'needs-validation', ready: false, gaps: ['page-validation'], source: 'merchant-navigation' };
  }
  function readinessText(r, l) {
    var c = COPY[l] || COPY.fr;
    return r && r.status === 'ready' ? c.ready : r && r.status === 'needs-attention' ? c.attention : c.validation;
  }
  var GAP_COPY = {
    fr: { 'inventory-source': 'source inventaire', 'opening-stock': 'stock initial', 'receipt-engine': 'moteur de reçu', 'receipt-template': 'modèle de reçu', 'printer-configuration': 'configuration imprimante', 'printer-connection': 'connexion imprimante', floorplan: 'plan de salle', 'floorplan-only': 'réservations du plan uniquement', 'production-relay': 'relais de production', 'pressing-operations': 'flux pressing', 'scanner-module': 'module scanner', 'secure-context': 'connexion HTTPS', 'page-validation': 'test réel de la page' },
    en: { 'inventory-source': 'inventory source', 'opening-stock': 'opening stock', 'receipt-engine': 'receipt engine', 'receipt-template': 'receipt template', 'printer-configuration': 'printer setup', 'printer-connection': 'printer connection', floorplan: 'floor plan', 'floorplan-only': 'floor-plan bookings only', 'production-relay': 'production relay', 'pressing-operations': 'pressing workflow', 'scanner-module': 'scanner module', 'secure-context': 'HTTPS connection', 'page-validation': 'real page test' },
    ar: { 'inventory-source': 'مصدر المخزون', 'opening-stock': 'المخزون الأولي', 'receipt-engine': 'محرك الوصل', 'receipt-template': 'نموذج الوصل', 'printer-configuration': 'إعداد الطابعة', 'printer-connection': 'اتصال الطابعة', floorplan: 'خريطة القاعة', 'floorplan-only': 'حجوزات الخريطة فقط', 'production-relay': 'مسار الإنتاج', 'pressing-operations': 'مسار المصبنة', 'scanner-module': 'وحدة المسح', 'secure-context': 'اتصال HTTPS', 'page-validation': 'اختبار الصفحة فعلياً' },
  };
  function gapText(gaps, l) {
    var map = GAP_COPY[l] || GAP_COPY.fr;
    return (gaps || []).map(function (g) { return /^legal:/.test(g) ? (l === 'ar' ? 'بيانات قانونية: ' : l === 'en' ? 'legal field: ' : 'mention légale : ') + g.slice(6) : (map[g] || g); }).join(' · ');
  }

  function scoreFeature(f, q) {
    var hay = norm([f.key, f.nav, f.keywords, pick(f.label, 'fr'), pick(f.label, 'en'), pick(f.label, 'ar')].join(' '));
    var words = norm(q).split(/[^a-z0-9\u0600-\u06ff]+/).filter(function (x) { return x.length > 2; })
      .map(function (x) { return x.length > 4 ? x.replace(/s$/, '') : x; });
    var score = 0;
    words.forEach(function (w) { if (hay.indexOf(w) >= 0) score += w.length > 7 ? 3 : 1; });
    if (f.key === 'scanner' && /scan|camera|barcode|code.?barre|iphone|باركود|الباركود|سكان|نسكاني|كاميرا/.test(norm(q))) score += 8;
    if (f.key === 'payments' && /split|partag|credit client|paiement|payment|moyen de paiement|\btpe\b|terminal|(?:cash|especes) (?:et|and|ou|or|w) (?:carte|card)|(?:carte|card) (?:et|and|ou|or|w) (?:cash|especes)/.test(norm(q)) && !/fidel|loyal|points/.test(norm(q))) score += 6;
    if (f.key === 'clients' && /fidel|loyal|points|wallet|نقط|ولاء/.test(norm(q))) score += 6;
    if (f.key === 'receipts' && /imprim|ticket|recu|etiquette|bluetooth|printer|طابعة|الطابعة|طباعة|\btabi3a\b/.test(norm(q))) score += 6;
    if (f.key === 'team' && /موظف|خدام|employe|staff|equipe/.test(norm(q))) score += 5;
    if (f.key === 'offline' && /انترنت|إنترنت|internet|reseau|ريزو|كونيكسيون/.test(norm(q))) score += 8;
    if (f.key === 'caisse' && /الكيسا|كيسا|جهاز الصندوق|الصندوق|caisse/.test(norm(q))) score += 5;
    if (f.key === 'receipts' && /ايصال|إيصال|الإيصال|البرانط|برانط|imprimante|printer/.test(norm(q))) score += 6;
    if (f.key === 'menu' && /برودوي|منتج|منتوج|plat|produit|article|طبق|\bproducts?\b|\bsizes?\b|\btailles?\b|variant|option|مقاس|حجم/.test(norm(q))) score += 4;
    if (f.key === 'reporting' && /\bz\b|rapport z|cloture|\bexport|excel|\bcsv\b|تقرير/.test(norm(q))) score += 8;
    if (f.key === 'caisse' && /\bipad\b|tablette|\btablet\b|appareil|device|جهاز|تابليت|connecte|connect/.test(norm(q)) && !/imprim|printer|طابعة/.test(norm(q)) && !/(?:me|se|m') connect|log ?in|sign ?in|mot de passe|password|\bcompte\b|account|identifiant/.test(norm(q))) score += 6;
    if (f.key === 'offline' && /hors ligne|offline|sans internet|synchron/.test(norm(q))) score += 8;
    if (f.key === 'pressing-services' && /prix|tarif|nom|renomm|service|traitement/.test(norm(q))) score += 7;
    if (f.key === 'pressing-orders' && /depot|acompte|solde|commande/.test(norm(q))) score += 7;
    if (f.key === 'pressing-pickup' && /retrait|\brack|rangement|etiquette/.test(norm(q))) score += 7;
    if (f.key === 'pressing-workshop' && /atelier|flux|lavage|repassage|retard/.test(norm(q))) score += 7;
    if (f.key === 'pressing-quality' && /incident|qualite|photo|dommage|reprise/.test(norm(q))) score += 7;
    if (f.key === 'pressing-delivery' && /collecte|livraison|ramassage|tournee/.test(norm(q))) score += 7;
    if (f.key === 'tables' && /table|salle|terrasse|addition/.test(norm(q))) score += 6;
    if (f.key === 'kds' && /kds|cuisine|production|station/.test(norm(q))) score += 6;
    return score;
  }
  /* A login problem has no guide card: « pair the till » or « inventory » would be a guess (27 Nov 2026). */
  var LOGIN_RX = /(?:me|se|m') connect|log ?in\b|sign ?in\b|mot de passe|password|identifiant|\bmon compte\b|my account|كلمة السر|الرقم السري|نسيت الكود|\bcode pin\b|\bpin code\b/;
  function matchFeature(raw, t) {
    if (LOGIN_RX.test(norm(raw))) return null;
    var fs = features(t); var ranked = fs.map(function (f, i) { return { f: f, score: scoreFeature(f, raw), i: i }; })
      .filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    /* « comment ajouter un produit » names one short word; a how-to verb on
     * a Kiwi object is enough to pick the feature. */
    var need = HOWTO_VERB.test(norm(raw)) || /\b(?:dans|avec|sur|in|on|with|f|b) kiwi\b|فكيوي|في كيوي/.test(norm(raw)) ? 1 : 3;
    return ranked.length && ranked[0].score >= need ? ranked[0].f : null;
  }

  /* « comment scanner un code-barres » in a restaurant names a real Kiwi
   * capability that this venue's workflow does not include. Saying so beats
   * a guess from the model or an unrelated active feature. */
  function offFeature(raw, t) {
    var on = {}; features(t).forEach(function (f) { on[f.key] = 1; });
    var best = null, bs = 0;
    Object.keys(DEFS).forEach(function (k) {
      if (on[k]) return;
      var f = Object.assign({ key: k }, DEFS[k]); var sc = scoreFeature(f, raw);
      if (sc > bs) { bs = sc; best = f; }
    });
    if (bs < 8) return null;
    var act = features(t).map(function (f) { return scoreFeature(f, raw); }).sort(function (a, b) { return b - a; })[0] || 0;
    return act < bs ? best : null;
  }
  function offReply(f, l) {
    var c = COPY[l] || COPY.fr;
    return { text: '<b>' + pick(f.label, l) + '</b> · ' + c.no, stats: [{ l: c.availability, v: c.no, h: tradeLabel(trade(), l) }] };
  }

  var LIST_RX = /(?:quelles?|what|which|ما|شنو).{0,24}(?:fonction|feature|outil|module|kiwi)|(?:tout|all).{0,12}(?:fonction|feature)|que (?:peut|sait) faire kiwi|what can kiwi do|fonctionnalites/;
  var SETUP_RX = /configur|parametr|integr|mise en place|mettre en place|onboard|setup|set up|ضبط|اعداد|تهيئ/;
  var HOWTO_VERB = /تقسيم|\bnscann?\w*|\b(?:referenc\w*|sortir|sors|link|close|clotur\w*|enter|saisi\w*|enregistr\w*|record|refund|rembours\w*|remise|discount)\b|اضيف|اضبط|اربط|امسح|اطبع|استخدم|اغير|افعل|اقسم|نسكاني|نمسح|نخدم|نكونيكتي|نبدل|\bnscani\b|\bnkonekti\b|\bnbdel\b|\b(?:ajout\w*|cre(?:e|er)|modifi\w*|supprim\w*|imprim\w*|connect\w*|activ\w*|configur\w*|scann?\w*|export\w*|install\w*|jumel\w*|appair\w*|divis\w*|separ\w*|pai\w*|pay|use|utilis\w*|ger(?:er|e)|set ?up|setup|parametr\w*|mettre en place|add|create|edit|delete|print|connect|enable|export|install|pair|split|nzid|nzidou|ndir|ntb3|nrbet|nfa3el|n9sem)\b|نزيد|نضيف|نطبع|نربط|نفعل|نقسم|نصاوب|ندير/;
  var GUIDE_RX = /^(?:comment|how|ou |where|كيفاش|كيفاه|كيف |\bkifa?c?h\b|\bkifash\b|wach n9der|واش نقدر|est.ce que je peux|peut.?on|puis.?je|can (?:i|we)|explique|tell me|a quoi|what is|comment fonctionne|كيف|اين|هل يمكن|kifa?c?h|كيفاش)|\b(?:activer|utiliser|imprimer|scanner|connecter|configurer|integrer)\b/;
  var CANCEL_RX = /annul|arrete|stop|cancel|إلغاء|توقف/;

  function setupQuestions(t, l) {
    var b = base(t);
    var Q = {
      restaurant: L(['Quels canaux utilisez-vous : salle, emporter, livraison ?', 'Avez-vous un plan de salle et des stations de production définis ?', 'Votre carte, vos recettes et vos stocks ingrédients sont-ils déjà saisis ?'], ['Which channels do you use: dining, takeaway or delivery?', 'Have you defined a floor plan and production stations?', 'Are your menu, recipes and ingredient stocks already entered?'], ['ما القنوات التي تستعملها: القاعة أم السفري أم التوصيل؟', 'هل حددت خريطة القاعة ومحطات الإنتاج؟', 'هل أدخلت القائمة والوصفات ومخزون المكونات؟']),
      boutique: L(['Avez-vous déjà un fichier de produits, prix et quantités ?', 'Utilisez-vous des codes-barres et la caméra du téléphone ?', 'Souhaitez-vous suivre fournisseurs, seuils bas et crédit client ?'], ['Do you already have a product, price and quantity file?', 'Do you use barcodes and the phone camera?', 'Do you want supplier, low-stock and customer-credit tracking?'], ['هل لديك ملف المنتجات والأسعار والكميات؟', 'هل تستخدم الرموز وكاميرا الهاتف؟', 'هل تريد تتبع الموردين والمخزون المنخفض وديون العملاء؟']),
      spa: L(['Vos services, durées et prix sont-ils déjà définis ?', 'Combien de praticiens et de ressources faut-il planifier ?', 'Utilisez-vous forfaits, cartes cadeaux ou fiches de préférences client ?'], ['Are your services, durations and prices already defined?', 'How many practitioners and resources need scheduling?', 'Do you use packages, gift cards or client preference records?'], ['هل حددت الخدمات والمدد والأسعار؟', 'كم ممارساً ومورداً يجب جدولته؟', 'هل تستخدم الباقات أو بطاقات الهدايا أو تفضيلات العملاء؟']),
      hotel: L(['Vos chambres, types et tarifs sont-ils déjà définis ?', 'Quels canaux de réservation utilisez-vous ?', 'Souhaitez-vous piloter ménage, folios et arrivées depuis Kiwi ?'], ['Are your rooms, types and rates already defined?', 'Which booking channels do you use?', 'Do you want to manage housekeeping, folios and arrivals in Kiwi?'], ['هل حددت الغرف والأنواع والأسعار؟', 'ما قنوات الحجز التي تستخدمها؟', 'هل تريد إدارة النظافة والحسابات والوصول في Kiwi؟']),
    };
    var q = pick(Q[b] || Q.boutique, l).slice();
    if (t === 'pressing') q = pick(L(['Vos catégories, traitements et tarifs sont-ils prêts ?', 'Voulez-vous imprimer une étiquette par pièce et utiliser le rack au retrait ?', 'Proposez-vous collecte, livraison ou suivi des incidents qualité ?'], ['Are your categories, treatments and prices ready?', 'Do you want one label per garment and rack-assisted pickup?', 'Do you offer collection, delivery or quality-issue tracking?'], ['هل الفئات والمعالجات والأسعار جاهزة؟', 'هل تريد ملصقاً لكل قطعة واستخدام الرف عند الاستلام؟', 'هل تقدم الجمع أو التوصيل أو تتبع مشاكل الجودة؟']), l);
    return q;
  }

  /* Each question maps to the pages that implement it. Negative/partial
   * answers are deliberately placed first in the final roadmap; a merchant
   * who already completed a step should not be sent through it again before
   * the missing work. */
  function setupPaths(t) {
    var byBase = {
      restaurant: [['caisse', 'payments'], ['tables', 'kds'], ['menu', 'inventory']],
      boutique: [['inventory'], ['scanner', 'caisse'], ['inventory', 'clients']],
      spa: [['services'], ['practitioners', 'appointments'], ['packages', 'clients']],
      hotel: [['rooms', 'rates'], ['reservations', 'channels'], ['housekeeping', 'folios', 'arrivals']],
    };
    if (t === 'pressing') return [['pressing-services'], ['pressing-pickup'], ['pressing-delivery', 'pressing-quality']];
    return byBase[base(t)] || byBase.boutique;
  }
  function incompleteAnswer(s) {
    return /\b(?:non|no|not|pas encore|partiel|partial|un peu|jamais|لا|ليس|جزئ)\b/.test(norm(s));
  }

  /* Shortcut answers must describe the question being asked.  The old global
   * Oui / Non / Partiellement trio was acceptable for readiness checks, but it
   * became absurd for questions such as “Which channels do you use?” or “How
   * many practitioners?”.  Free text remains available; these are simply the
   * useful one-tap answers shown under each question. */
  function answerOptions(question, l) {
    var q = norm(question);
    var sets = {
      fr: {
        yes: ['Oui', 'Pas encore', 'Partiellement'],
        channels: ['Sur place', 'À emporter', 'Livraison', 'Plusieurs canaux'],
        booking: ['Direct', 'Site web', 'OTA / plateformes', 'Plusieurs canaux'],
        people: ['1 personne', '2 à 5', '6 ou plus'],
        who: ['Moi seul', 'Responsables', 'Toute l’équipe'],
        devices: ['iPhone', 'Tablette', 'Ordinateur', 'Plusieurs appareils'],
        format: ['Ticket 80 mm', 'Étiquette', 'A4', 'À définir'],
      },
      en: {
        yes: ['Yes', 'Not yet', 'Partly'],
        channels: ['On premises', 'Takeaway', 'Delivery', 'Several channels'],
        booking: ['Direct', 'Website', 'OTA / platforms', 'Several channels'],
        people: ['1 person', '2 to 5', '6 or more'],
        who: ['Only me', 'Managers', 'The whole team'],
        devices: ['iPhone', 'Tablet', 'Computer', 'Several devices'],
        format: ['80 mm receipt', 'Label', 'A4', 'To be decided'],
      },
      ar: {
        yes: ['نعم', 'ليس بعد', 'جزئياً'],
        channels: ['داخل المحل', 'سفري', 'توصيل', 'عدة قنوات'],
        booking: ['مباشر', 'الموقع', 'منصات الحجز', 'عدة قنوات'],
        people: ['شخص واحد', 'من 2 إلى 5', '6 أو أكثر'],
        who: ['أنا فقط', 'المسؤولون', 'كل الفريق'],
        devices: ['iPhone', 'لوحة', 'حاسوب', 'عدة أجهزة'],
        format: ['وصل 80 مم', 'ملصق', 'A4', 'نحدده لاحقاً'],
      },
    };
    var s = sets[l] || sets.fr;
    if (/canaux de reservation|booking channels|قنوات الحجز/.test(q)) return s.booking;
    if (/quels canaux|which channels|ما القنوات/.test(q)) return s.channels;
    if (/combien de (?:praticiens|personnes)|how many (?:practitioners|people)|كم (?:ممارس|شخص)/.test(q)) return s.people;
    if (/qui utilisera|who will use|من سيستخدم/.test(q)) return s.who;
    if (/quels? (?:iphone|appareils|ecrans)|which (?:iphones|devices|screens)|ما (?:اجهزة|شاشات)/.test(q)) return s.devices;
    if (/quel format|which format|ما تنسيق/.test(q)) return s.format;
    return s.yes;
  }

  function featureQuestions(f, l) {
    var generic = L([
      'Avez-vous déjà les données de départ à importer ou saisir ?',
      'Qui utilisera cette fonction, sur quels appareils et avec quels droits ?',
      'Quel cas réel voulez-vous tester avant de l’utiliser en production ?',
    ], [
      'Do you already have the starting data to import or enter?',
      'Who will use this feature, on which devices and with which permissions?',
      'Which real case do you want to test before using it in production?',
    ], [
      'هل لديك بيانات البداية للاستيراد أو الإدخال؟',
      'من سيستخدم هذه الوظيفة وعلى أي أجهزة وبأي صلاحيات؟',
      'ما الحالة الحقيقية التي تريد اختبارها قبل الاستعمال الفعلي؟',
    ]);
    var specific = {
      inventory: L(['Avez-vous un fichier articles, fournisseurs et quantités ?', 'Avez-vous compté le stock de départ par emplacement ?', 'Quels seuils bas et droits d’ajustement faut-il appliquer ?'], ['Do you have an item, supplier and quantity file?', 'Have you counted opening stock by location?', 'Which low-stock thresholds and adjustment permissions should apply?'], ['هل لديك ملف المنتجات والموردين والكميات؟', 'هل أحصيت المخزون الأولي حسب الموقع؟', 'ما حدود المخزون المنخفض وصلاحيات التعديل؟']),
      scanner: L(['Vos produits portent-ils tous un code EAN lisible ?', 'Quels iPhone ou terminaux utiliseront la caméra ou la douchette ?', 'Voulez-vous créer immédiatement un article quand son code est inconnu ?'], ['Do all products have a readable EAN barcode?', 'Which iPhones or terminals will use the camera or scanner?', 'Should an unknown barcode offer immediate item creation?'], ['هل لكل المنتجات رمز EAN مقروء؟', 'ما أجهزة iPhone أو المحطات التي ستستعمل الكاميرا؟', 'هل تريد إنشاء المنتج فوراً عند قراءة رمز مجهول؟']),
      receipts: L(['L’identité légale et les coordonnées du commerce sont-elles prêtes ?', 'Quel format et quelle imprimante utilisez-vous ?', 'Quel ticket réel faut-il imprimer pour valider le rendu ?'], ['Are the legal identity and business details ready?', 'Which format and printer do you use?', 'Which real receipt should be printed to validate the result?'], ['هل الهوية القانونية وبيانات المؤسسة جاهزة؟', 'ما التنسيق والطابعة المستخدمة؟', 'ما الوصل الحقيقي الذي سنطبعه للتحقق؟']),
      tables: L(['Quelles zones et combien de tables faut-il créer ?', 'Qui peut déplacer une table, offrir un article ou clôturer une addition ?', 'Quel service complet voulez-vous simuler avant l’ouverture ?'], ['Which areas and how many tables should be created?', 'Who may move a table, comp an item or close a bill?', 'Which complete service should be simulated before opening?'], ['ما المناطق وعدد الطاولات المطلوبة؟', 'من يمكنه نقل طاولة أو تقديم منتج أو إغلاق فاتورة؟', 'ما الخدمة الكاملة التي تريد محاكاتها قبل الافتتاح؟']),
      kds: L(['Quelles stations préparent chaque famille d’articles ?', 'Quels écrans et imprimantes sont présents en production ?', 'Quelle commande multi-stations faut-il tester de bout en bout ?'], ['Which stations prepare each item family?', 'Which screens and printers are present in production?', 'Which multi-station order should be tested end to end?'], ['ما المحطات التي تحضر كل فئة؟', 'ما الشاشات والطابعات الموجودة في الإنتاج؟', 'ما الطلب متعدد المحطات الذي سنختبره كاملاً؟']),
      'pressing-services': L(['Avez-vous votre grille actuelle de vêtements, traitements et prix ?', 'Quels suppléments, délais et services indisponibles faut-il représenter ?', 'Quel article doit être testé à la caisse après l’enregistrement ?'], ['Do you have the current garment, treatment and price list?', 'Which add-ons, turnaround times and unavailable services must be represented?', 'Which item should be tested at the till after saving?'], ['هل لديك قائمة القطع والمعالجات والأسعار الحالية؟', 'ما الإضافات والمدد والخدمات غير المتاحة؟', 'ما القطعة التي سنختبرها في الصندوق بعد الحفظ؟']),
      'pressing-pickup': L(['Quel format d’étiquette et quelle imprimante utilisez-vous ?', 'Comment vos racks sont-ils numérotés aujourd’hui ?', 'Quel scénario de scan, solde et remise voulez-vous tester ?'], ['Which label format and printer do you use?', 'How are your racks numbered today?', 'Which scan, balance and hand-off case should be tested?'], ['ما تنسيق الملصق والطابعة؟', 'كيف ترقم الرفوف حالياً؟', 'ما حالة المسح والرصيد والتسليم التي سنختبرها؟']),
    };
    return pick(specific[f.key] || generic, l).slice();
  }

  function featureSetupReply(raw, t, l, feature) {
    var c = COPY[l] || COPY.fr;
    if (!state.pending || state.pending.kind !== 'feature' || state.pending.trade !== t || state.pending.featureKey !== feature.key) {
      state.pending = { kind: 'feature', trade: t, featureKey: feature.key, i: 0, answers: [], questions: featureQuestions(feature, l) };
      return { text: c.featureLead(pick(feature.label, l)), stats: [{ l: c.q + ' 1/3', v: state.pending.questions[0], h: '' }], follow: answerOptions(state.pending.questions[0], l) };
    }
    if (CANCEL_RX.test(norm(raw))) { state.pending = null; return { text: c.cancel, follow: [c.all] }; }
    state.pending.answers.push(String(raw || '').slice(0, 240)); state.pending.i++;
    if (state.pending.i < state.pending.questions.length) {
      return { text: c.saved + '.', stats: [{ l: c.q + ' ' + (state.pending.i + 1) + '/3', v: state.pending.questions[state.pending.i], h: '' }], follow: answerOptions(state.pending.questions[state.pending.i], l) };
    }
    var detail = detailReply(feature, l);
    detail.text = c.featureDone(pick(feature.label, l));
    detail.stats = [{ l: c.steps, v: pick(feature.steps, l), h: '' }];
    state.pending = null;
    return detail;
  }

  function listReply(t, l) {
    var c = COPY[l] || COPY.fr, fs = features(t), core = fs.filter(function (f) { return !f.vertical; }), vert = fs.filter(function (f) { return f.vertical; });
    var stats = [];
    if (vert.length) stats.push({ l: c.vertical, v: vert.slice(0, 7).map(function (f) { return pick(f.label, l); }).join(' · '), h: vert.length > 7 ? '+ ' + (vert.length - 7) : '' });
    stats.push({ l: c.common, v: core.slice(0, 8).map(function (f) { return pick(f.label, l); }).join(' · '), h: core.length > 8 ? '+ ' + (core.length - 8) : '' });
    var live = fs.map(function (f) { return readiness(f); });
    stats.push({ l: c.readiness, v: c.ready + ' ' + live.filter(function (r) { return r.ready; }).length + '/' + fs.length,
      h: live.some(function (r) { return !r.ready; }) ? c.attention + ' ' + live.filter(function (r) { return !r.ready; }).length : c.checked });
    return { text: c.list(tradeLabel(t, l)), stats: stats, note: c.safe, follow: [c.setup] };
  }
  function detailReply(f, l) {
    var c = COPY[l] || COPY.fr, r = readiness(f);
    return { text: '<b>' + pick(f.label, l) + '</b> · ' + pick(f.summary, l), stats: [
      { l: c.purpose, v: pick(f.summary, l), h: '' },
      { l: c.steps, v: pick(f.steps, l), h: '' },
      { l: c.availability, v: c.active, h: tradeLabel(trade(), l) },
      { l: c.readiness, v: readinessText(r, l), h: r.gaps && r.gaps.length ? c.gaps + ' · ' + gapText(r.gaps, l) : c.checked },
    ], note: c.safe, follow: [c.setup, c.all], open: openFor(f, l) };
  }
  function setupReply(raw, t, l) {
    var c = COPY[l] || COPY.fr;
    if (!state.pending || state.pending.trade !== t) {
      state.pending = { kind: 'trade', trade: t, i: 0, answers: [], questions: setupQuestions(t, l) };
      return { text: c.setupLead(tradeLabel(t, l)), stats: [{ l: c.q + ' 1/3', v: state.pending.questions[0], h: '' }], follow: answerOptions(state.pending.questions[0], l) };
    }
    if (CANCEL_RX.test(norm(raw))) { state.pending = null; return { text: c.cancel, follow: [c.all] }; }
    state.pending.answers.push(String(raw || '').slice(0, 240)); state.pending.i++;
    if (state.pending.i < state.pending.questions.length) {
      return { text: c.saved + '.', stats: [{ l: c.q + ' ' + (state.pending.i + 1) + '/3', v: state.pending.questions[state.pending.i], h: '' }], follow: answerOptions(state.pending.questions[state.pending.i], l) };
    }
    var fs = features(t), byKey = {};
    fs.forEach(function (f) { byKey[f.key] = f; byKey[f.nav] = byKey[f.nav] || f; });
    var paths = setupPaths(t), ordered = [], used = {};
    function recommend(key) { var f = byKey[key]; if (f && !used[f.key]) { used[f.key] = true; ordered.push(f); } }
    /* A stated missing trade prerequisite is the first job. Product state then
     * catches gaps the interview missed (empty opening stock, disconnected
     * printer, incomplete legal fields), with vertical modules before shared
     * administration so the roadmap still feels native to the merchant. */
    state.pending.answers.forEach(function (answer, i) {
      if (incompleteAnswer(answer)) (paths[i] || []).forEach(recommend);
    });
    fs.filter(function (f) { return f.vertical && readiness(f).status === 'needs-attention'; }).forEach(function (f) { recommend(f.key); });
    fs.filter(function (f) { return !f.vertical && readiness(f).status === 'needs-attention'; }).forEach(function (f) { recommend(f.key); });
    fs.filter(function (f) { return readiness(f).status === 'needs-validation'; }).forEach(function (f) { recommend(f.key); });
    /* Completed answers still get a verification page after missing work. */
    state.pending.answers.forEach(function (answer, i) {
      if (!incompleteAnswer(answer)) (paths[i] || []).forEach(recommend);
    });
    fs.filter(function (f) { return f.vertical; }).forEach(function (f) { recommend(f.key); });
    fs.forEach(function (f) { recommend(f.key); });
    var recommended = ordered.slice(0, 5);
    var out = { text: c.done, stats: recommended.map(function (f, i) { return { l: String(i + 1), v: pick(f.label, l), h: pick(f.steps, l) }; }), note: c.safe, open: [] };
    recommended.slice(0, 3).forEach(function (f) { out.open = out.open.concat(openFor(f, l)); });
    state.pending = null; return out;
  }

  /* Kiwi's own offers: public prices from the landing (CLAUDE.md §7). */
  var PLAN_RX = /\b(?:pro|plus|basic|ultra)\s+(?:wla|ou|or|vs|wela)\s+(?:pro|plus|basic|ultra)\b|\bforfaits?\s+(?:kiwi|dispo|disponibles?)\b|(?:برو|بلس)\s+مزايا|مزايا\s+(?:برو|بلس)|الابوني|لابوني|ابوني|\babonnement\b|\bplans?\b.{0,20}\bkiwi\b|\bkiwi\b.{0,20}\bplans?\b|offres?\s+kiwi|عروض\s+كيوي|باقات\s+كيوي|باقتي|\bengagement\b.{0,20}kiwi|kiwi.{0,20}\bengagement\b|\bcommitment\b|\bupgrade\b.{0,20}\b(?:plan|pro|plus|ultra)\b|كيوي\s+(?:برو|بلس|بيزيك|الترا)|\bplan\s+dyali\b|\blfar9\s+bin\s+plans\b|\bkiwi\s+(?:basic|plus|pro|ultra|ultimate)\b|\b(?:basic|plus|pro|ultra|ultimate)\b.{0,25}\b(?:plan|offre|abonnement|formule|forfait|coute|cost|price|prix)\b|\b(?:mon|ma|my|quel|quelle|which|what)\s+(?:plan|offre|forfait|abonnement|formule|subscription)\b|\babonnement\b|\bsubscription\b|\bforfait\b|(?:prix|tarifs?|price|pricing|cout)\s+(?:de\s+|of\s+)?kiwi\b|\bkiwi\b.{0,12}\b(?:coute|cost|price|prix|tarif)|اشتراك|الاشتراك|الباقة|باقة|\babonnma\b|عرض كيوي|ثمن كيوي|بشحال كيوي/;
  var PLANS = [
    { id: 'basic', name: 'Kiwi Basic', m: 150, y: 99, fr: 'caisse simple : codes-barres, stock, reçus, carnet de crédit, rapport du jour, caisse hors ligne, un établissement', en: 'simple till: barcodes, stock, receipts, credit book, daily report, offline till, one location', ar: 'صندوق بسيط: الباركود، المخزون، الوصولات، دفتر الكريدي، تقرير اليوم، العمل بلا انترنت، محل واحد' },
    { id: 'plus', name: 'Kiwi Plus', m: 300, y: 249, fr: 'Basic + boutique : tailles et couleurs, retours et avoirs, promotions, fidélité, fiches clients, marges', en: 'Basic + shop: sizes and colours, returns and credit notes, promotions, loyalty, customer records, margins', ar: 'Basic + المحل: المقاسات والألوان، الإرجاع، العروض، الوفاء، ملفات الزبناء، الهوامش' },
    { id: 'pro', name: 'Kiwi Pro', m: 399, y: 349, fr: 'Plus + restaurant : plan de salle, prise de commande serveur, écran cuisine, carte multilingue, réservations, recettes et coût matière, accès employés, planning et paie', en: 'Plus + restaurant: floor plan, waiter ordering, kitchen screen, multilingual menu, bookings, recipes and food cost, staff access, scheduling and payroll', ar: 'Plus + المطعم: خريطة القاعة، طلبات النادل، شاشة المطبخ، قائمة بعدة لغات، الحجز، الوصفات وتكلفة المواد، دخول الموظفين، التوقيت والأجور' },
    { id: 'ultra', name: 'Kiwi Ultra', m: 1499, y: null, fr: 'Pro + établissements illimités, pilotage multi-sites, multi-pays, API, chargé de compte', en: 'Pro + unlimited locations, multi-site control, multi-country, API, account manager', ar: 'Pro + محلات بلا حدود، تسيير عدة فروع، عدة دول، API، مسؤول حساب' },
    { id: 'ultimate', name: 'Kiwi Ultimate', m: null, y: null, fr: 'sur devis, périmètre sur mesure', en: 'on quote, bespoke scope', ar: 'حسب الطلب' },
  ];
  var PLAN_T = {
    fr: { mo: function (m, y) { return m == null ? 'sur devis' : m + ' MAD/mois' + (y ? ' (' + y + ' MAD/mois en annuel)' : ''); }, lead: 'Les offres Kiwi :', mine: function (n) { return 'Votre offre actuelle : <b>' + n + '</b>.'; }, one: function (n, p) { return '<b>' + n + '</b> · ' + p + '.'; } },
    en: { mo: function (m, y) { return m == null ? 'on quote' : m + ' MAD/month' + (y ? ' (' + y + ' MAD/month billed yearly)' : ''); }, lead: 'Kiwi’s plans:', mine: function (n) { return 'Your current plan: <b>' + n + '</b>.'; }, one: function (n, p) { return '<b>' + n + '</b> · ' + p + '.'; } },
    ar: { mo: function (m, y) { return m == null ? 'حسب الطلب' : m + ' درهم/الشهر' + (y ? ' (' + y + ' درهم/الشهر سنوياً)' : ''); }, lead: 'عروض كيوي:', mine: function (n) { return 'عرضك الحالي: <b>' + n + '</b>.'; }, one: function (n, p) { return '<b>' + n + '</b> · ' + p + '.'; } },
  };
  function currentPlan() {
    /* getPlan() already reads the merchant's config plan for a real merchant. */
    try { return String((window.KiwiVenue && window.KiwiVenue.getPlan && window.KiwiVenue.getPlan()) || '').toLowerCase(); } catch (_) { return ''; }
  }
  function plansReply(raw, l) {
    var q = norm(raw), t = PLAN_T[l] || PLAN_T.fr;
    var named = PLANS.filter(function (p) { return new RegExp('\\b' + p.id + '\\b').test(q); });
    var mine = PLANS.filter(function (p) { return p.id === currentPlan(); })[0];
    var asksMine = /\b(?:mon|ma|my|j'?ai|i have|je suis)\b|عندي|ديالي|\b3ndi\b|\bdyali\b/.test(q);
    var rows = named.length === 1 && !asksMine ? [{ l: named[0].name, v: named[0][l] || named[0].fr, h: '' }]
      : (named.length ? named : PLANS).map(function (p) { return { l: p.name, v: t.mo(p.m, p.y), h: p[l] || p.fr }; });
    var text = asksMine && mine ? t.mine(mine.name) : named.length === 1 ? t.one(named[0].name, t.mo(named[0].m, named[0].y)) : t.lead;
    return { text: text, stats: rows };
  }
  function isPlans(raw) { var q = norm(raw); return PLAN_RX.test(q) && !/الضمان|\bcnss\b|\bamo\b/.test(q); }
  /* « wach kayn mode hors ligne », « is there a kitchen screen » ask whether Kiwi has it. */
  var TROUBLE_RX = /probleme|\bmarche pas\b|fonctionne pas|n'?imprime pas|ne s'?allume|ne se connecte|connecte pas|\bbug\b|\bbloque|\bplante\b|not working|doesn'?t work|does not work|won'?t (?:print|connect|start)|\bbroken\b|ما خدام|ماخدام|ما كيخدمش|ماكيخدمش|ما كتخدمش|\bmakhdam\w*|\bma khdam\w*|\bmakaykhdamch\b|خاسر|عطل|مشكل/;
  var EXISTS_RX = /\bwach kayn\b|واش كاين|كاين شي|est.ce qu'?il y a|\by a.t.il\b|\bil y a\b.{0,10}\b(?:un|une)\b|\bis there\b|\bdo you have\b|\bdoes kiwi\b|\bkiwi (?:a|fait|gere|peut)\b|\bca existe\b/;
  /* A how-to about a Kiwi feature outranks a simulation that shares a word
   * with it: « how do I add an employee » is the team page, not a hire. */
  function isHowTo(raw) {
    var q = norm(raw);
    /* « can I add a worker » is a hiring question; only an explicit « how »,
     * « is there » or a question naming Kiwi is about the product. */
    var how = /^(?:comment\b|how\b(?! (?:much|many|long|often)\b)|كيف\s|كيفاش|كيفاه|كيف\b|kifa?c?h\b|kifash\b)/.test(q) || EXISTS_RX.test(q) || /kiwi|كيوي/.test(q)
      || /\b(?:je fais comment|on fait comment|comment (?:faire|on fait)|(?:ca )?se trouve ou|marche (?:a )?suivre|les etapes|how do i|how to|how can i|kif|kifach|montre moi kifach)\b|طريقة|تشرح ليا|كيفاش|(?:^|\s)كيف(?=\s)/.test(q);
    /* « l'imprimante n'imprime pas », « الطابعة ما خدامةش », « export my sales
     * to excel », « imprime le rapport z »: a fault or a product task. */
    var task = TROUBLE_RX.test(q) || /^(?:exporte?\w*|export|imprime\w*|print|telecharge\w*|download|fais(?: moi)? le z|sors? le z)\b/.test(q);
    var t = trade();
    return (how || task) && (HOWTO_VERB.test(q) || EXISTS_RX.test(q) || /kiwi|كيوي/.test(q) || task) && !!(offFeature(raw, t) || matchFeature(raw, t));
  }

  function canHandle(raw) {
    var q = norm(raw), t = trade();
    if (state.pending && state.pending.trade === t) return true;
    if (LIST_RX.test(q) || SETUP_RX.test(q) || PLAN_RX.test(q)) return true;
    return ((GUIDE_RX.test(q) || EXISTS_RX.test(q)) && !!matchFeature(raw, t)) || isHowTo(raw);
  }
  /* A setup in progress takes the next message as its answer, unless that
   * message is a question of its own: a plan, or how to use another feature. */
  function isNewQuestion(raw) {
    var q = norm(raw);
    if (PLAN_RX.test(q)) return true;
    if (!isHowTo(raw)) return false;
    var f = matchFeature(raw, trade());
    return !(state.pending.kind === 'feature' && f && f.key === state.pending.featureKey);
  }
  function drop() { state.pending = null; }
  function reply(raw, opts) {
    var l = (opts && opts.lang) || lang(raw); if (l !== 'en' && l !== 'ar') l = 'fr';
    var q = norm(raw), t = trade();
    if (state.pending && isNewQuestion(raw)) state.pending = null;
    if (state.pending && state.pending.trade === t) {
      if (state.pending.kind === 'feature') {
        var pendingFeature = features(t).find(function (x) { return x.key === state.pending.featureKey; });
        if (pendingFeature) return featureSetupReply(raw, t, l, pendingFeature);
      }
      return setupReply(raw, t, l);
    }
    if (PLAN_RX.test(q)) return plansReply(raw, l);
    if (SETUP_RX.test(q)) {
      var sf = matchFeature(raw, t);
      /* A named feature gets its detailed prerequisites first; the merchant can
       * open it immediately or launch the complete three-question setup. */
      if (sf && !/(mon etablissement|my business|kiwi|tout|all|مؤسس)/.test(q)) return featureSetupReply(raw, t, l, sf);
      return setupReply(raw, t, l);
    }
    if (LIST_RX.test(q)) return listReply(t, l);
    var off = offFeature(raw, t);
    if (off) return offReply(off, l);
    var f = matchFeature(raw, t);
    return f ? detailReply(f, l) : null;
  }
  function promptContext(t, l) {
    t = t || trade(); l = l || 'fr';
    return features(t).map(function (f) { return '- ' + pick(f.label, l) + ': ' + pick(f.summary, l); }).join('\n');
  }
  function assistantSubtitle(l, t) {
    t = t || trade(); var n = tradeLabel(t, l);
    if (l === 'en') return 'It knows your ' + n + ': operations, sales, stock and finance';
    if (l === 'ar') return 'يعرف نشاطك ' + n + ': التشغيل والمبيعات والمخزون والمال';
    return 'Il connaît votre ' + n + ' : opérations, ventes, stock et finances';
  }

  window.KiwiFeatureGuide = {
    trade: trade, features: features, canHandle: canHandle, reply: reply, isPlans: isPlans, isHowTo: isHowTo,
    promptContext: promptContext, assistantSubtitle: assistantSubtitle,
    isPending: function () { return !!state.pending; },
    drop: drop,
    _test: { match: matchFeature, reset: function () { state.pending = null; state.trade = ''; } },
  };
}());
