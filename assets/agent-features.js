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
  var norm = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); };
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
      steps: L('Connecter la caisse → choisir les accès employés → faire une vente test', 'Pair the till → choose staff access → run a test sale', 'ربط الصندوق ← تحديد دخول الموظفين ← تنفيذ بيع تجريبي'), keywords: 'caisse pos comptoir encaissement till checkout', nav: 'terminaux' },
    payments: { label: L('Paiements et partage', 'Payments and split tender', 'الدفع وتقسيم المبلغ'),
      summary: L('Espèces, carte, paiement partagé et crédit client sont conservés avec leur ventilation réelle sur le ticket.', 'Cash, card, split tender and customer credit retain their real breakdown on the receipt.', 'يحفظ النقد والبطاقة والدفع المقسم ودين العميل بتفاصيله الحقيقية.'),
      steps: L('Configurer les moyens → connecter le terminal carte → tester chaque combinaison', 'Configure methods → connect the card terminal → test each combination', 'ضبط طرق الدفع ← ربط جهاز البطاقة ← اختبار كل تركيبة'), keywords: 'paiement paye cash carte split partage credit client dette tender', nav: 'reglements' },
    inventory: { label: L('Inventaire traçable', 'Traceable inventory', 'مخزون قابل للتتبع'),
      summary: L('Chaque réception, vente, ajustement et annulation devient un mouvement append-only : le stock se reconstruit sans écraser l’historique.', 'Every receipt, sale, adjustment and reversal becomes an append-only movement, so stock is rebuilt without erasing history.', 'كل استلام وبيع وتعديل وإلغاء يصبح حركة محفوظة دون مسح التاريخ.'),
      steps: L('Importer ou créer les articles → saisir les soldes initiaux → régler les seuils et fournisseurs', 'Import or create items → enter opening balances → set thresholds and suppliers', 'استيراد أو إنشاء المنتجات ← إدخال الرصيد الأولي ← ضبط الحدود والموردين'), keywords: 'stock inventaire inventory rupture reapprovisionnement mouvement lot fournisseur ingredient', nav: 'stock' },
    scanner: { label: L('Scan continu mobile', 'Continuous mobile scanning', 'المسح المستمر بالهاتف'),
      summary: L('La caméra lit les codes en continu, retrouve prix, stock et promotion, puis permet de créer immédiatement un produit inconnu.', 'The camera continuously reads codes, shows price, stock and promotion, and can immediately create an unknown product.', 'تقرأ الكاميرا الرموز باستمرار وتعرض السعر والمخزون والعرض وتسمح بإنشاء منتج غير معروف.'),
      steps: L('Autoriser la caméra Safari → vérifier les codes-barres → faire un encaissement et une impression test', 'Allow the camera in Safari → verify barcodes → run a checkout and print test', 'السماح للكاميرا في Safari ← التحقق من الرموز ← اختبار البيع والطباعة'), keywords: 'scan scanner camera iphone code barre barcode produit inconnu douchette', nav: 'inventory', trades: ['boutique', 'epicerie', 'pharmacie', 'librairie', 'fleuriste', 'autre'] },
    offline: { label: L('Mode local et synchronisation', 'Local-first and sync', 'العمل المحلي والمزامنة'),
      summary: L('Les opérations prises en charge restent utilisables sans réseau et sont rejouées avec des identifiants idempotents dès le retour de la connexion.', 'Supported operations keep working without a network and replay with idempotent IDs when connectivity returns.', 'تستمر العمليات المدعومة دون شبكة وتُزامن بمعرّفات تمنع التكرار عند عودة الاتصال.'),
      steps: L('Installer la caisse → ouvrir une fois en ligne → vérifier l’indicateur de synchronisation', 'Install the till → open once online → verify the sync indicator', 'تثبيت الصندوق ← فتحه مرة متصلاً ← التحقق من مؤشر المزامنة'), keywords: 'offline hors ligne sans internet synchronisation sync reseau connexion', nav: 'terminaux' },
    receipts: { label: L('Tickets, reçus et impression', 'Receipts and printing', 'التذاكر والطباعة'),
      summary: L('Le même moteur produit l’aperçu, le reçu thermique et l’impression système ; l’apparence se règle une fois dans le tableau de bord.', 'One engine produces the preview, thermal receipt and system print; appearance is configured once in the dashboard.', 'ينتج محرك واحد المعاينة والوصل الحراري والطباعة ويُضبط الشكل مرة واحدة.'),
      steps: L('Renseigner l’identité légale → choisir le modèle → connecter l’imprimante Bluetooth → imprimer un test', 'Enter legal identity → choose a template → connect the Bluetooth printer → print a test', 'إدخال الهوية القانونية ← اختيار النموذج ← ربط طابعة Bluetooth ← طباعة اختبار'), keywords: 'ticket recu facture impression imprimer imprimante bluetooth etiquette printer receipt', nav: 'terminaux' },
    clients: { label: L('Clients et fidélité', 'Customers and loyalty', 'العملاء والولاء'),
      summary: L('Les fiches, consentements, visites, dépenses et avantages suivent le client entre la caisse et le tableau de bord.', 'Profiles, consent, visits, spend and rewards follow the customer between till and dashboard.', 'تنتقل الملفات والموافقات والزيارات والمصاريف والمكافآت بين الصندوق ولوحة التحكم.'),
      steps: L('Choisir le modèle de fidélité → définir la récompense → identifier un client test en caisse', 'Choose the loyalty model → set the reward → identify a test customer at checkout', 'اختيار نظام الولاء ← تحديد المكافأة ← تعريف عميل تجريبي في الصندوق'), keywords: 'client fidelite points recompense crm habitue loyalty customer', nav: 'clients' },
    team: { label: L('Équipe et accès', 'Team and access', 'الفريق والصلاحيات'),
      summary: L('Chaque rôle reçoit uniquement les pages et chiffres autorisés, avec son propre accès caisse et son planning.', 'Each role receives only authorised pages and figures, with its own till access and schedule.', 'يحصل كل دور فقط على الصفحات والأرقام المسموحة مع دخوله وجدوله.'),
      steps: L('Créer les rôles → ajouter l’équipe → attribuer accès et planning → tester un compte employé', 'Create roles → add staff → assign access and schedule → test an employee account', 'إنشاء الأدوار ← إضافة الفريق ← تحديد الصلاحيات والجدول ← اختبار حساب موظف'), keywords: 'equipe employe staff role acces pin planning paie', nav: 'equipe' },
    hours: { label: L('Horaires partagés', 'Shared opening hours', 'ساعات العمل المشتركة'),
      summary: L('Une seule fiche alimente réservations, commande en ligne, caisse, rapport et réponses de l’assistant.', 'One schedule feeds reservations, online ordering, till, reports and assistant answers.', 'جدول واحد يغذي الحجوزات والطلب والصندوق والتقارير وإجابات المساعد.'),
      steps: L('Saisir la semaine → ajouter Ramadan, Aïd ou congés → vérifier un créneau test', 'Enter the week → add Ramadan, Eid or holidays → verify a test slot', 'إدخال الأسبوع ← إضافة رمضان أو العيد أو العطل ← اختبار موعد'), keywords: 'horaire ouverture fermeture ramadan conge open hours', nav: 'equipe' },
    reporting: { label: L('Rapport journalier et ventes', 'Daily report and sales', 'التقرير اليومي والمبيعات'),
      summary: L('Les ventes validées alimentent le chiffre, les moyens de paiement, les articles et les clôtures sans ressaisie.', 'Validated sales feed revenue, payment methods, items and closures without re-entry.', 'تغذي المبيعات المؤكدة الإيرادات وطرق الدفع والمنتجات والإغلاقات دون إعادة إدخال.'),
      steps: L('Faire une vente test → vérifier le journal → contrôler le rapport Z', 'Run a test sale → verify the journal → check the Z report', 'تنفيذ بيع تجريبي ← التحقق من السجل ← مراجعة تقرير Z'), keywords: 'rapport journalier ventes chiffre transaction cloture z report sales', nav: 'transactions' },

    tables: { label: L('Plan de salle et tables', 'Floor plan and tables', 'خريطة القاعة والطاولات'), summary: L('Ouvrez les tables, suivez leur état et gardez chaque addition attachée au bon service.', 'Open tables, track their state and keep each bill attached to the right service.', 'افتح الطاولات وتتبع حالتها واربط كل فاتورة بالخدمة الصحيحة.'), steps: L('Dessiner les zones → créer les tables → tester ouverture, déplacement et règlement', 'Draw areas → create tables → test open, move and settle', 'رسم المناطق ← إنشاء الطاولات ← اختبار الفتح والنقل والدفع'), keywords: 'table salle terrasse addition plan floor', nav: 'tables' },
    menu: { label: L('Carte, options et stations', 'Menu, options and stations', 'القائمة والخيارات والمحطات'), summary: L('Produits, variantes, suppléments et routage cuisine restent communs au tableau de bord et à la caisse.', 'Products, variants, add-ons and kitchen routing stay shared between dashboard and till.', 'تتشارك لوحة التحكم والصندوق المنتجات والخيارات وتوجيه المطبخ.'), steps: L('Créer les catégories → ajouter produits et options → affecter les stations → publier', 'Create categories → add products and options → assign stations → publish', 'إنشاء الفئات ← إضافة المنتجات والخيارات ← تعيين المحطات ← النشر'), keywords: 'menu carte produit plat option supplement station recette tarif prix', nav: 'menu' },
    kds: { label: L('Écran de production', 'Production screen', 'شاشة الإنتاج'), summary: L('Les commandes avancent par station et statut jusqu’à la remise, sans réimprimer la même information.', 'Orders move by station and status through hand-off without reprinting the same information.', 'تتحرك الطلبات حسب المحطة والحالة حتى التسليم دون إعادة طباعة.'), steps: L('Créer les stations → router les articles → connecter l’écran → tester une commande', 'Create stations → route items → connect the screen → test an order', 'إنشاء المحطات ← توجيه المنتجات ← ربط الشاشة ← اختبار طلب'), keywords: 'kds cuisine ecran preparation production four barista', nav: 'kds' },
    reservations: { label: L('Réservations', 'Reservations', 'الحجوزات'), summary: L('Les créneaux respectent les horaires de l’établissement et restent liés au client et à la capacité.', 'Slots respect business hours and stay linked to the customer and capacity.', 'تحترم المواعيد ساعات العمل وترتبط بالعميل والسعة.'), steps: L('Régler les horaires → définir la capacité → créer une réservation test', 'Set opening hours → define capacity → create a test booking', 'ضبط الساعات ← تحديد السعة ← إنشاء حجز تجريبي'), keywords: 'reservation reserver booking rdv rendez vous creneau', nav: 'reservations' },

    'pressing-orders': { label: L('Dépôts et commandes', 'Drop-offs and orders', 'الإيداعات والطلبات'), summary: L('Chaque dépôt relie client, pièces, traitements, échéance, acompte et solde dans un seul bon.', 'Each drop-off links customer, garments, treatments, due date, deposit and balance in one order.', 'يربط كل إيداع العميل والقطع والمعالجة والموعد والتسبيق والرصيد في طلب واحد.'), steps: L('Créer les services → faire un dépôt test → imprimer ticket et étiquettes', 'Create services → run a test drop-off → print receipt and labels', 'إنشاء الخدمات ← تجربة إيداع ← طباعة التذكرة والملصقات'), keywords: 'depot commande pressing acompte solde piece vetement', nav: 'pressing-orders' },
    'pressing-workshop': { label: L('Atelier et flux', 'Workshop workflow', 'الورشة وسير العمل'), summary: L('Les pièces avancent de la réception au traitement, contrôle et prêt, avec priorité sur les retards.', 'Garments move from intake through treatment, quality control and ready status, with overdue work prioritised.', 'تنتقل القطع من الاستلام إلى المعالجة والمراقبة والجاهزية مع أولوية للمتأخر.'), steps: L('Valider les étapes → attribuer les postes → tester le passage d’une commande', 'Validate stages → assign stations → move a test order through them', 'تأكيد المراحل ← تعيين المحطات ← تمرير طلب تجريبي'), keywords: 'atelier flux traitement lavage repassage detacher pret retard', nav: 'pressing-workshop' },
    'pressing-pickup': { label: L('Retraits, rack et étiquettes', 'Pickup, rack and labels', 'الاستلام والرف والملصقات'), summary: L('Le code d’étiquette retrouve exactement la commande, son rack, son client et le solde restant.', 'A label code retrieves the exact order, rack, customer and outstanding balance.', 'يعثر رمز الملصق على الطلب والرف والعميل والرصيد المتبقي بدقة.'), steps: L('Imprimer les étiquettes → attribuer les racks → tester scan, retrait et réimpression', 'Print labels → assign racks → test scan, pickup and reprint', 'طباعة الملصقات ← تعيين الرفوف ← اختبار المسح والاستلام وإعادة الطباعة'), keywords: 'retrait rack rangement etiquette code scan reimprimer', nav: 'pressing-pickup' },
    'pressing-services': { label: L('Services et tarifs', 'Services and pricing', 'الخدمات والأسعار'), summary: L('Noms, catégories, traitements, suppléments, délais et visibilité caisse sont modifiables depuis une grille unique.', 'Names, categories, treatments, add-ons, turnaround and till visibility are editable from one grid.', 'يمكن تعديل الأسماء والفئات والمعالجات والإضافات والمدة وظهورها في الصندوق من شاشة واحدة.'), steps: L('Créer les catégories → saisir les tarifs par traitement → masquer les services indisponibles → enregistrer', 'Create categories → enter prices per treatment → hide unavailable services → save', 'إنشاء الفئات ← إدخال أسعار المعالجة ← إخفاء الخدمات غير المتاحة ← الحفظ'), keywords: 'service tarif prix nom renommer categorie chemise lavage sec repassage supplement pressing visible caisse', nav: 'pressing-services' },
    'pressing-quality': { label: L('Qualité et incidents', 'Quality and issues', 'الجودة والملاحظات'), summary: L('Photos, état d’entrée, incident, reprise et résolution restent attachés au bon concerné.', 'Photos, intake condition, incident, rework and resolution stay attached to the relevant order.', 'تبقى الصور وحالة الاستلام والمشكلة وإعادة المعالجة والحل مرتبطة بالطلب.'), steps: L('Définir les contrôles → photographier un cas test → ouvrir et clôturer un incident', 'Define checks → photograph a test case → open and close an issue', 'تحديد الفحوص ← تصوير حالة تجريبية ← فتح وإغلاق ملاحظة'), keywords: 'qualite incident photo tache dommage reprise reclamation', nav: 'pressing-quality' },
    'pressing-delivery': { label: L('Collecte et livraison', 'Collection and delivery', 'الجمع والتوصيل'), summary: L('Adresses, créneaux et statuts organisent les tournées sans séparer la livraison de la commande.', 'Addresses, slots and statuses organise routes without separating delivery from the order.', 'تنظم العناوين والمواعيد والحالات الجولات دون فصل التوصيل عن الطلب.'), steps: L('Définir la zone → choisir les créneaux → créer une course test → confirmer la remise', 'Define the area → choose slots → create a test run → confirm hand-off', 'تحديد المنطقة ← اختيار المواعيد ← إنشاء جولة تجريبية ← تأكيد التسليم'), keywords: 'collecte livraison course adresse zone ramassage pressing', nav: 'pressing-delivery' },
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
    var words = norm(q).split(/[^a-z0-9\u0600-\u06ff]+/).filter(function (x) { return x.length > 2; });
    var score = 0;
    words.forEach(function (w) { if (hay.indexOf(w) >= 0) score += w.length > 7 ? 3 : 1; });
    if (f.key === 'scanner' && /scan|camera|barcode|code.?barre|iphone/.test(norm(q))) score += 8;
    if (f.key === 'payments' && /split|partag|credit client|cash|carte/.test(norm(q))) score += 6;
    if (f.key === 'receipts' && /imprim|ticket|recu|etiquette|bluetooth/.test(norm(q))) score += 6;
    if (f.key === 'offline' && /hors ligne|offline|sans internet|synchron/.test(norm(q))) score += 8;
    if (f.key === 'pressing-services' && /prix|tarif|nom|renomm|service|traitement/.test(norm(q))) score += 7;
    if (f.key === 'pressing-orders' && /depot|acompte|solde|commande/.test(norm(q))) score += 7;
    if (f.key === 'pressing-pickup' && /retrait|rack|rangement|etiquette/.test(norm(q))) score += 7;
    if (f.key === 'pressing-workshop' && /atelier|flux|lavage|repassage|retard/.test(norm(q))) score += 7;
    if (f.key === 'pressing-quality' && /incident|qualite|photo|dommage|reprise/.test(norm(q))) score += 7;
    if (f.key === 'pressing-delivery' && /collecte|livraison|ramassage|tournee/.test(norm(q))) score += 7;
    if (f.key === 'tables' && /table|salle|terrasse|addition/.test(norm(q))) score += 6;
    if (f.key === 'kds' && /kds|cuisine|production|station/.test(norm(q))) score += 6;
    return score;
  }
  function matchFeature(raw, t) {
    var fs = features(t); var ranked = fs.map(function (f, i) { return { f: f, score: scoreFeature(f, raw), i: i }; })
      .filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return ranked.length && ranked[0].score >= 3 ? ranked[0].f : null;
  }

  var LIST_RX = /(?:quelles?|what|which|ما|شنو).{0,24}(?:fonction|feature|outil|module|kiwi)|(?:tout|all).{0,12}(?:fonction|feature)|que (?:peut|sait) faire kiwi|what can kiwi do|fonctionnalites/;
  var SETUP_RX = /configur|parametr|integr|mise en place|mettre en place|onboard|setup|set up|ضبط|اعداد|تهيئ/;
  var GUIDE_RX = /^(?:comment|how|ou |where|peut.?on|puis.?je|can (?:i|we)|explique|tell me|a quoi|what is|comment fonctionne|كيف|اين|هل يمكن)|\b(?:activer|utiliser|imprimer|scanner|connecter|configurer|integrer)\b/;
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
      return { text: c.featureLead(pick(feature.label, l)), stats: [{ l: c.q + ' 1/3', v: state.pending.questions[0], h: '' }], follow: ['Oui', 'Non', 'Partiellement'] };
    }
    if (CANCEL_RX.test(norm(raw))) { state.pending = null; return { text: c.cancel, follow: [c.all] }; }
    state.pending.answers.push(String(raw || '').slice(0, 240)); state.pending.i++;
    if (state.pending.i < state.pending.questions.length) {
      return { text: c.saved + '.', stats: [{ l: c.q + ' ' + (state.pending.i + 1) + '/3', v: state.pending.questions[state.pending.i], h: '' }], follow: ['Oui', 'Non', 'Partiellement'] };
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
    return { text: '<b>' + pick(f.label, l) + '</b> — ' + pick(f.summary, l), stats: [
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
      return { text: c.setupLead(tradeLabel(t, l)), stats: [{ l: c.q + ' 1/3', v: state.pending.questions[0], h: '' }], follow: ['Oui', 'Non', 'Partiellement'] };
    }
    if (CANCEL_RX.test(norm(raw))) { state.pending = null; return { text: c.cancel, follow: [c.all] }; }
    state.pending.answers.push(String(raw || '').slice(0, 240)); state.pending.i++;
    if (state.pending.i < state.pending.questions.length) {
      return { text: c.saved + '.', stats: [{ l: c.q + ' ' + (state.pending.i + 1) + '/3', v: state.pending.questions[state.pending.i], h: '' }], follow: ['Oui', 'Non', 'Partiellement'] };
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

  function canHandle(raw) {
    var q = norm(raw), t = trade();
    if (state.pending && state.pending.trade === t) return true;
    if (LIST_RX.test(q) || SETUP_RX.test(q)) return true;
    return GUIDE_RX.test(q) && !!matchFeature(raw, t);
  }
  function reply(raw, opts) {
    var l = (opts && opts.lang) || lang(raw); if (l !== 'en' && l !== 'ar') l = 'fr';
    var q = norm(raw), t = trade();
    if (state.pending && state.pending.trade === t) {
      if (state.pending.kind === 'feature') {
        var pendingFeature = features(t).find(function (x) { return x.key === state.pending.featureKey; });
        if (pendingFeature) return featureSetupReply(raw, t, l, pendingFeature);
      }
      return setupReply(raw, t, l);
    }
    if (SETUP_RX.test(q)) {
      var sf = matchFeature(raw, t);
      /* A named feature gets its detailed prerequisites first; the merchant can
       * open it immediately or launch the complete three-question setup. */
      if (sf && !/(mon etablissement|my business|kiwi|tout|all|مؤسس)/.test(q)) return featureSetupReply(raw, t, l, sf);
      return setupReply(raw, t, l);
    }
    if (LIST_RX.test(q)) return listReply(t, l);
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
    trade: trade, features: features, canHandle: canHandle, reply: reply,
    promptContext: promptContext, assistantSubtitle: assistantSubtitle,
    isPending: function () { return !!state.pending; },
    _test: { match: matchFeature, reset: function () { state.pending = null; state.trade = ''; } },
  };
}());
