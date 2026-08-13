import { operatorActor } from '../auth/_lib.js';

// Public Kiwi Support destination. Keep digits only for wa.me deep links.
export const SUPPORT_WHATSAPP_PHONE = '491722451278';

export const SUPPORT_TABLES = [
  `CREATE TABLE IF NOT EXISTS support_articles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL, store_types TEXT NOT NULL DEFAULT '["all"]', feature_key TEXT NOT NULL DEFAULT '', feature_hash TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', revision INTEGER NOT NULL DEFAULT 1, title_fr TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '', title_ar TEXT NOT NULL DEFAULT '', body_fr TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '', body_ar TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, published_ts INTEGER, actor TEXT NOT NULL DEFAULT 'system')`,
  `CREATE TABLE IF NOT EXISTS support_article_versions (id TEXT PRIMARY KEY, article_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, actor TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, merchant TEXT NOT NULL, store_type TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', channel TEXT NOT NULL, contact TEXT NOT NULL, summary TEXT NOT NULL, diagnostics TEXT NOT NULL DEFAULT '{}', assignee TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, closed_ts INTEGER)`,
  `CREATE TABLE IF NOT EXISTS support_messages (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, kind TEXT NOT NULL, channel TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, delivery TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS support_attachments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, merchant TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS support_searches (id TEXT PRIMARY KEY, phrase TEXT NOT NULL, lang TEXT NOT NULL, store_type TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS support_feedback (id TEXT PRIMARY KEY, article_id TEXT NOT NULL, helpful INTEGER NOT NULL, store_type TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_support_articles_status ON support_articles (status, category, updated_ts)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_support_article_revision ON support_article_versions (article_id, revision)`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_queue ON support_tickets (status, priority, updated_ts)`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_merchant ON support_tickets (merchant, updated_ts)`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON support_attachments (ticket_id, created_ts)`,
  `CREATE INDEX IF NOT EXISTS idx_support_feedback_article ON support_feedback (article_id, ts)`,
];

export async function ensureSupport(env) {
  if (!env || !env.DB) throw new Error('no-db');
  for (const sql of SUPPORT_TABLES) await env.DB.prepare(sql).run();
}

const L = (fr, en, ar) => ({ fr, en, ar });
const article = (slug, category, types, feature, title, body) => ({ slug, category, types, feature, title, body });

// Product-owned starter library. Every statement below describes a shipped
// module and links to its real screen; these are not generated support claims.
const CORE_ARTICLES = [
  article('connecter-la-caisse', 'caisse', ['all'], 'caisse', L('Connecter une caisse', 'Connect a till', 'ربط الصندوق'), L(
    'Prérequis : un établissement Kiwi actif.\n\n1. Ouvrez **Terminaux** dans le tableau de bord.\n2. Générez un code d’appairage.\n3. Ouvrez Kiwi Caisse sur le terminal et saisissez les six chiffres.\n4. Vérifiez le nom de l’établissement avant la première vente.\n\nSi le code expire, générez-en un nouveau. Succès : la caisse affiche le bon établissement et son catalogue.',
    'Prerequisite: an active Kiwi location.\n\n1. Open **Terminals** in the dashboard.\n2. Generate a pairing code.\n3. Open Kiwi Till on the terminal and enter all six digits.\n4. Check the location name before the first sale.\n\nIf the code expires, generate a new one. Success: the till shows the correct location and catalogue.',
    'المتطلب: مؤسسة Kiwi نشطة.\n\n1. افتح **الأجهزة** في لوحة التحكم.\n2. أنشئ رمز الربط.\n3. افتح صندوق Kiwi وأدخل الأرقام الستة.\n4. تحقق من اسم المؤسسة قبل أول بيع.\n\nإذا انتهت صلاحية الرمز أنشئ رمزاً جديداً. النجاح: يظهر الصندوق المؤسسة والكتالوج الصحيحين.')),
  article('imprimante-bluetooth', 'materiel', ['all'], 'receipts', L('Connecter et tester l’imprimante', 'Connect and test the printer', 'ربط الطابعة واختبارها'), L(
    'Prérequis : imprimante allumée et papier chargé.\n\n1. Ouvrez **Terminaux**, puis l’imprimante.\n2. Choisissez Bluetooth, USB, pont réseau ou impression système.\n3. Autorisez la connexion dans le navigateur.\n4. Lancez un ticket test avant le service.\n\nSuccès : le test sort sur papier clair, avec le bon établissement.',
    'Prerequisite: printer on and paper loaded.\n\n1. Open **Terminals**, then Printer.\n2. Choose Bluetooth, USB, network bridge or system print.\n3. Approve the browser connection.\n4. Print a test before service.\n\nSuccess: a light paper receipt prints with the correct location.',
    'المتطلب: تشغيل الطابعة ووضع الورق.\n\n1. افتح **الأجهزة** ثم الطابعة.\n2. اختر Bluetooth أو USB أو الشبكة أو طباعة النظام.\n3. اسمح بالاتصال في المتصفح.\n4. اطبع اختباراً قبل الخدمة.\n\nالنجاح: يخرج وصل واضح باسم المؤسسة الصحيح.')),
  article('equipe-acces', 'equipe', ['all'], 'team', L('Ajouter l’équipe et régler les accès', 'Add staff and set access', 'إضافة الفريق وضبط الصلاحيات'), L(
    '1. Ouvrez **Équipe** et ajoutez chaque personne.\n2. Choisissez son rôle et ses pages autorisées.\n3. Créez son accès personnel à la caisse.\n4. Testez avec son compte avant de lui remettre l’accès.\n\nLes salaires restent réservés aux rôles autorisés. Succès : l’employé ne voit que son travail.',
    '1. Open **Team** and add each person.\n2. Choose their role and authorised pages.\n3. Create their personal till access.\n4. Test their account before handing it over.\n\nPay figures remain restricted to authorised roles. Success: staff see only their work.',
    '1. افتح **الفريق** وأضف كل شخص.\n2. اختر دوره والصفحات المسموحة.\n3. أنشئ دخوله الشخصي للصندوق.\n4. اختبر الحساب قبل تسليمه.\n\nتبقى الأجور للأدوار المصرح لها. النجاح: يرى الموظف عمله فقط.')),
  article('planning-equipe', 'equipe', ['all'], 'planning', L('Créer et publier le planning', 'Create and publish the schedule', 'إنشاء جدول العمل ونشره'), L(
    '1. Ouvrez **Planning** et vérifiez horaires d’ouverture, fermetures et jours fériés.\n2. Saisissez les disponibilités et règles de couverture.\n3. Composez ou répartissez les services équitablement.\n4. Résolvez les conflits, puis publiez.\n5. Reportez les heures validées vers la paie.\n\nSuccès : chaque salarié retrouve ses services dans l’app Équipe.',
    '1. Open **Planning** and check opening hours, closures and public holidays.\n2. Enter availability and coverage rules.\n3. Build or fairly distribute shifts.\n4. Resolve conflicts, then publish.\n5. Carry approved hours into payroll.\n\nSuccess: each employee sees their shifts in the Team app.',
    '1. افتح **التخطيط** وتحقق من أوقات العمل والإغلاقات والعطل.\n2. أدخل التوفر وقواعد التغطية.\n3. أنشئ الورديات أو وزعها بعدل.\n4. حل التعارضات ثم انشر.\n5. انقل الساعات المعتمدة إلى الأجور.\n\nالنجاح: يجد كل موظف وردياته في تطبيق الفريق.')),
  article('reservations-en-ligne', 'reservations', ['restaurant','cafe','spa','coiffure','hotel','riad','gym'], 'reservations', L('Activer les réservations en ligne', 'Enable online bookings', 'تفعيل الحجز عبر الإنترنت'), L(
    '1. Ouvrez **Réservations & RDV**, puis Configurer.\n2. Vérifiez horaires, capacité, services et personnes disponibles.\n3. Activez la réservation en ligne.\n4. Ouvrez le lien public dans une fenêtre privée et faites un test.\n\nUn créneau fermé ou sans ressource n’est jamais proposé. Succès : le test apparaît dans l’agenda.',
    '1. Open **Bookings**, then Configure.\n2. Check hours, capacity, services and available staff.\n3. Enable online booking.\n4. Open the public link privately and make a test booking.\n\nClosed or unstaffed slots are never offered. Success: the test appears in the calendar.',
    '1. افتح **الحجوزات والمواعيد** ثم الإعداد.\n2. تحقق من الساعات والسعة والخدمات والموظفين.\n3. فعّل الحجز عبر الإنترنت.\n4. افتح الرابط العام في نافذة خاصة وأنشئ حجزاً تجريبياً.\n\nلا تُعرض الفترات المغلقة أو دون موظف. النجاح: يظهر الاختبار في الأجندة.')),
  article('stock-initial', 'stock', ['boutique','epicerie','pharmacie','librairie','fleuriste','restaurant','cafe'], 'inventory', L('Démarrer un stock fiable', 'Start reliable inventory', 'بدء مخزون موثوق'), L(
    '1. Ouvrez **Stock** ou **Inventaire produits**.\n2. Importez les articles ou créez-les un par un.\n3. Saisissez le comptage initial, les unités et les seuils bas.\n4. Ajoutez les fournisseurs utiles.\n5. Faites une vente test et vérifiez le mouvement.\n\nNe corrigez pas un ancien mouvement : créez un ajustement. Succès : le stock se reconstruit depuis le journal.',
    '1. Open **Stock** or **Product inventory**.\n2. Import items or create them individually.\n3. Enter opening counts, units and low-stock thresholds.\n4. Add relevant suppliers.\n5. Run a test sale and verify its movement.\n\nDo not rewrite an old movement; add an adjustment. Success: stock rebuilds from the ledger.',
    '1. افتح **المخزون**.\n2. استورد المنتجات أو أنشئها.\n3. أدخل الكمية الأولية والوحدات وحدود النقص.\n4. أضف الموردين.\n5. نفذ بيعاً تجريبياً وتحقق من الحركة.\n\nلا تعدّل حركة قديمة؛ أنشئ تسوية. النجاح: يُعاد حساب المخزون من السجل.')),
  article('scan-mobile', 'caisse', ['boutique','epicerie','pharmacie','librairie','fleuriste'], 'scanner', L('Scanner des produits avec le téléphone', 'Scan products with a phone', 'مسح المنتجات بالهاتف'), L(
    'Prérequis : site HTTPS et autorisation caméra.\n\n1. Dans la caisse, ouvrez **Scan continu**.\n2. Sur iPhone, autorisez Safari dans Réglages › Safari › Caméra.\n3. Présentez un code-barres net et bien éclairé.\n4. Si le produit est inconnu, créez-le puis confirmez prix et stock.\n\nLa saisie manuelle reste disponible. Succès : prix, stock et promotion apparaissent avant l’ajout au panier.',
    'Prerequisite: HTTPS and camera permission.\n\n1. In the till, open **Continuous scan**.\n2. On iPhone allow Safari under Settings › Safari › Camera.\n3. Hold a clear, well-lit barcode in view.\n4. If unknown, create the item and confirm price and stock.\n\nManual entry remains available. Success: price, stock and promotion appear before cart insertion.',
    'المتطلب: اتصال HTTPS وإذن الكاميرا.\n\n1. افتح **المسح المستمر** في الصندوق.\n2. على iPhone اسمح لكاميرا Safari من الإعدادات.\n3. وجّه رمزاً واضحاً ومضاءً.\n4. إذا كان المنتج غير معروف فأنشئه وأكد السعر والمخزون.\n\nيبقى الإدخال اليدوي متاحاً. النجاح: يظهر السعر والمخزون والعرض قبل الإضافة.')),
  article('plan-de-salle', 'restaurant', ['restaurant','cafe'], 'tables', L('Configurer le plan de salle', 'Set up the floor plan', 'إعداد خريطة القاعة'), L(
    '1. Ouvrez **Plan de salle**.\n2. Créez zones et tables avec leur capacité.\n3. Placez-les comme dans le restaurant.\n4. Affectez les zones aux serveurs.\n5. Testez ouverture, demande d’addition et règlement depuis caisse et app Serveur.\n\nSuccès : les deux apps affichent le même état de table en direct.',
    '1. Open **Floor plan**.\n2. Create areas and tables with capacity.\n3. Place them like the venue.\n4. Assign server areas.\n5. Test opening, bill request and settlement from till and Server app.\n\nSuccess: both apps show the same live table state.',
    '1. افتح **خريطة القاعة**.\n2. أنشئ المناطق والطاولات وسعتها.\n3. ضعها مثل المطعم.\n4. عيّن مناطق النوادل.\n5. اختبر الفتح وطلب الحساب والدفع من الصندوق وتطبيق النادل.\n\nالنجاح: يعرض التطبيقان نفس حالة الطاولة مباشرة.')),
  article('router-cuisine', 'restaurant', ['restaurant','cafe','fastfood','pizzeria','foodtruck','boulangerie'], 'kds', L('Router les commandes en cuisine', 'Route kitchen orders', 'توجيه الطلبات إلى المطبخ'), L(
    '1. Dans **Menu**, créez les stations de production.\n2. Affectez chaque article ou catégorie à une station.\n3. Ouvrez **Écran cuisine (KDS)** sur chaque poste.\n4. Envoyez une commande test.\n\nLe ticket papier et le KDS sont indépendants. Succès : chaque poste ne reçoit que ses articles et les statuts remontent à la caisse.',
    '1. In **Menu**, create production stations.\n2. Assign each item or category to a station.\n3. Open **Kitchen screen (KDS)** at each station.\n4. Send a test order.\n\nPaper tickets and KDS are independent. Success: each station receives only its items and statuses return to the till.',
    '1. في **القائمة** أنشئ محطات الإنتاج.\n2. عيّن كل منتج أو فئة لمحطة.\n3. افتح **شاشة المطبخ** في كل محطة.\n4. أرسل طلباً تجريبياً.\n\nالتذكرة الورقية وشاشة المطبخ مستقلتان. النجاح: تستقبل كل محطة منتجاتها وتعود الحالات للصندوق.')),
  article('pressing-tarifs', 'pressing', ['pressing'], 'pressing-services', L('Modifier les services et tarifs du pressing', 'Edit pressing services and prices', 'تعديل خدمات وأسعار المصبنة'), L(
    '1. Dans le tableau de bord, ouvrez **Services & tarifs**.\n2. Recherchez le vêtement, modifiez son nom, sa catégorie et les traitements proposés.\n3. Saisissez chaque prix ; un prix vide rend le traitement indisponible.\n4. Choisissez sa visibilité à la caisse et enregistrez.\n\nSuccès : la caisse appairée affiche le nouveau nom et le bon tarif, sans modifier les anciens tickets.',
    '1. In the dashboard open **Services & pricing**.\n2. Find the garment and edit its name, category and treatments.\n3. Enter each price; a blank price makes that treatment unavailable.\n4. Choose till visibility and save.\n\nSuccess: the paired till shows the new name and price without changing old tickets.',
    '1. افتح **الخدمات والأسعار** في لوحة التحكم.\n2. ابحث عن القطعة وعدّل الاسم والفئة والمعالجات.\n3. أدخل كل سعر؛ السعر الفارغ يجعل المعالجة غير متاحة.\n4. اختر الظهور في الصندوق واحفظ.\n\nالنجاح: يظهر الاسم والسعر الجديدان في الصندوق دون تغيير الطلبات القديمة.')),
  article('pressing-depot-retrait', 'pressing', ['pressing'], 'pressing-orders', L('Du dépôt au retrait au pressing', 'From drop-off to pressing pickup', 'من الإيداع إلى الاستلام في المصبنة'), L(
    '1. À **Comptoir**, identifiez le client, les pièces, traitements et date promise.\n2. Confirmez l’acompte, puis imprimez ticket et une étiquette par pièce.\n3. Faites avancer les pièces dans **Atelier & flux**.\n4. À la fin, attribuez le rack.\n5. Au retrait, scannez l’étiquette, vérifiez le solde et confirmez la remise.\n\nSuccès : client, pièces, rack et paiement restent sur le même numéro.',
    '1. At **Counter**, identify customer, garments, treatments and promised date.\n2. Confirm the deposit, then print the receipt and one label per garment.\n3. Move garments through **Workshop & flow**.\n4. Assign a rack when ready.\n5. At pickup scan the label, check the balance and confirm hand-off.\n\nSuccess: customer, garments, rack and payment share one reference.',
    '1. في **الاستقبال** حدد العميل والقطع والمعالجات والموعد.\n2. أكد التسبيق ثم اطبع الوصل وملصقاً لكل قطعة.\n3. مرّر القطع عبر **الورشة**.\n4. عيّن الرف عند الجاهزية.\n5. عند الاستلام امسح الملصق وتحقق من الرصيد وأكد التسليم.\n\nالنجاح: يبقى العميل والقطع والرف والدفع تحت نفس المرجع.')),
];

// Short, task-led guides for the workflows merchants use after onboarding.
// They deliberately describe only screens and behaviours shipped in Kiwi.
const MORE_ARTICLES = [
  article('encaisser-une-vente', 'caisse', ['all'], 'payments', L('Encaisser une vente', 'Complete a sale', 'إتمام عملية بيع'), L(
    '1. Choisissez les articles ou saisissez un montant libre.\n2. Vérifiez quantités, remises et client.\n3. Ouvrez **Encaisser** et choisissez le moyen de paiement réellement reçu.\n4. Confirmez une seule fois, puis imprimez ou partagez le reçu.\n\nSuccès : la vente apparaît dans le rapport journalier.',
    '1. Choose items or enter a free amount.\n2. Check quantities, discounts and customer.\n3. Open **Checkout** and select the payment actually received.\n4. Confirm once, then print or share the receipt.\n\nSuccess: the sale appears in the daily report.',
    '1. اختر المنتجات أو أدخل مبلغاً حراً.\n2. تحقق من الكميات والخصم والعميل.\n3. افتح **الدفع** واختر وسيلة الدفع المستلمة فعلاً.\n4. أكد مرة واحدة ثم اطبع أو شارك الوصل.\n\nالنجاح: تظهر العملية في التقرير اليومي.')),
  article('paiement-partage', 'caisse', ['restaurant','cafe','boutique','epicerie','pharmacie','librairie','fleuriste'], 'payments', L('Partager un paiement', 'Split a payment', 'تقسيم الدفع'), L(
    '1. Dans **Encaisser**, choisissez Paiement partagé.\n2. Saisissez la part carte, espèces ou crédit client.\n3. Vérifiez que le restant atteint zéro.\n4. Confirmez chaque part avec le moyen réellement utilisé.\n\nN’utilisez le crédit que pour un client identifié.',
    '1. In **Checkout**, choose Split payment.\n2. Enter the card, cash or customer-credit share.\n3. Check that the remainder reaches zero.\n4. Confirm each part with the method actually used.\n\nUse credit only for an identified customer.',
    '1. من **الدفع** اختر الدفع المقسم.\n2. أدخل حصة البطاقة أو النقد أو دين العميل.\n3. تحقق من وصول الباقي إلى صفر.\n4. أكد كل حصة بالوسيلة المستخدمة فعلاً.\n\nلا تستخدم الدين إلا لعميل مسجل.')),
  article('reimprimer-ou-rembourser', 'caisse', ['all'], 'receipts', L('Réimprimer ou rembourser une vente', 'Reprint or refund a sale', 'إعادة طباعة أو إرجاع بيع'), L(
    '1. Retrouvez la vente dans **Transactions** ou **Rapport journalier**.\n2. Pour un duplicata, choisissez Réimprimer sans recréer la vente.\n3. Pour un remboursement, vérifiez articles, montant et autorisation manager.\n4. Confirmez le moyen de remboursement.\n\nLe journal conserve la vente et son remboursement séparément.',
    '1. Find the sale under **Transactions** or **Daily report**.\n2. For a copy, choose Reprint without recreating the sale.\n3. For a refund, check items, amount and manager approval.\n4. Confirm the refund method.\n\nThe ledger keeps the sale and refund separately.',
    '1. ابحث عن البيع في **المعاملات** أو **التقرير اليومي**.\n2. لنسخة إضافية اختر إعادة الطباعة دون بيع جديد.\n3. للإرجاع تحقق من المنتجات والمبلغ وموافقة المسؤول.\n4. أكد وسيلة الإرجاع.\n\nيحتفظ السجل بالبيع والإرجاع منفصلين.')),
  article('travailler-hors-ligne', 'caisse', ['all'], 'offline', L('Travailler sans connexion', 'Work without internet', 'العمل دون إنترنت'), L(
    'Avant le service, ouvrez la caisse en ligne afin de charger établissement et catalogue. Si Internet coupe, continuez les opérations autorisées : Kiwi les garde sur cet appareil. Ne videz pas les données du navigateur et ne changez pas d’établissement. Au retour du réseau, attendez l’état **Synchronisé** avant de fermer.',
    'Before service, open the till online so the location and catalogue load. If internet drops, continue authorised operations: Kiwi keeps them on this device. Do not clear browser data or switch locations. When the network returns, wait for **Synced** before closing.',
    'قبل الخدمة افتح الصندوق متصلاً لتحميل المؤسسة والكتالوج. عند انقطاع الإنترنت واصل العمليات المسموحة؛ يحفظها Kiwi على الجهاز. لا تمسح بيانات المتصفح ولا تغير المؤسسة. عند عودة الشبكة انتظر حالة **تمت المزامنة** قبل الإغلاق.')),
  article('installer-application-kiwi', 'materiel', ['all'], 'pwa', L('Installer Kiwi comme application', 'Install Kiwi as an app', 'تثبيت Kiwi كتطبيق'), L(
    'Sur iPhone : ouvrez Kiwi dans Safari, touchez Partager puis **Sur l’écran d’accueil**. Sur Android ou ordinateur : utilisez **Installer Kiwi** dans le tableau de bord ou le menu du navigateur. Ouvrez ensuite l’icône installée et reconnectez-vous si demandé.',
    'On iPhone, open Kiwi in Safari, tap Share, then **Add to Home Screen**. On Android or desktop, use **Install Kiwi** in the dashboard or browser menu. Open the installed icon and sign in again if requested.',
    'على iPhone افتح Kiwi في Safari ثم مشاركة وبعدها **إضافة إلى الشاشة الرئيسية**. على Android أو الحاسوب استخدم **تثبيت Kiwi** من لوحة التحكم أو قائمة المتصفح. افتح الأيقونة وسجل الدخول إذا طُلب.')),
  article('verifier-rapport-journalier', 'caisse', ['all'], 'reporting', L('Vérifier le rapport journalier', 'Check the daily report', 'مراجعة التقرير اليومي'), L(
    '1. Ouvrez **Rapport journalier** après les encaissements.\n2. Comparez total, nombre de ventes et répartition des paiements avec la caisse.\n3. Contrôlez remboursements, annulations et écarts.\n4. Clôturez uniquement après la dernière synchronisation.\n\nUne valeur indisponible reste signalée comme telle ; elle n’est pas inventée.',
    '1. Open **Daily report** after taking payments.\n2. Compare total, sale count and payment mix with the till.\n3. Review refunds, voids and differences.\n4. Close only after the last sync.\n\nUnavailable values remain labelled unavailable; they are not invented.',
    '1. افتح **التقرير اليومي** بعد عمليات الدفع.\n2. قارن الإجمالي وعدد المبيعات ووسائل الدفع بالصندوق.\n3. راجع الإرجاعات والإلغاءات والفروقات.\n4. أغلق بعد آخر مزامنة فقط.\n\nالقيمة غير المتاحة تبقى موضحة ولا يتم اختراعها.')),
  article('importer-un-catalogue', 'stock', ['boutique','epicerie','pharmacie','librairie','fleuriste','restaurant','cafe'], 'catalog', L('Importer un catalogue', 'Import a catalogue', 'استيراد الكتالوج'), L(
    '1. Téléchargez le modèle depuis la page catalogue ou stock.\n2. Gardez une ligne par article ou variante et ne modifiez pas les en-têtes.\n3. Renseignez nom, prix, catégorie, code-barres et stock si disponibles.\n4. Importez, corrigez les lignes refusées, puis testez un article à la caisse.',
    '1. Download the template from the catalogue or stock page.\n2. Keep one row per item or variant and do not change headers.\n3. Enter name, price, category, barcode and stock when available.\n4. Import, fix rejected rows, then test one item at the till.',
    '1. حمّل النموذج من صفحة الكتالوج أو المخزون.\n2. اجعل كل منتج أو نوع في سطر ولا تغيّر العناوين.\n3. أدخل الاسم والسعر والفئة والباركود والمخزون إن توفر.\n4. استورد وصحح الأسطر المرفوضة ثم اختبر منتجاً في الصندوق.')),
  article('prix-et-promotions', 'stock', ['boutique','epicerie','pharmacie','librairie','fleuriste'], 'promotions', L('Créer un prix ou une promotion', 'Set a price or promotion', 'تحديد سعر أو عرض'), L(
    'Modifiez le prix permanent dans la fiche article. Pour une offre temporaire, ouvrez **Promotions**, choisissez articles, remise et dates, puis vérifiez l’aperçu. Faites un scan test : la caisse doit afficher prix normal, promotion et total avant paiement.',
    'Edit the permanent price on the item record. For a temporary offer, open **Promotions**, choose items, discount and dates, then check the preview. Run a test scan: the till must show regular price, promotion and total before payment.',
    'عدّل السعر الدائم في بطاقة المنتج. للعرض المؤقت افتح **العروض** واختر المنتجات والتخفيض والتواريخ ثم راجع المعاينة. اختبر المسح: يجب أن يظهر السعر العادي والعرض والإجمالي قبل الدفع.')),
  article('disponibilites-et-conges', 'equipe', ['all'], 'team-availability', L('Gérer disponibilités et congés', 'Manage availability and leave', 'إدارة التوفر والإجازات'), L(
    'Les salariés envoient disponibilité, indisponibilité ou demande de congé depuis l’app Équipe. Le manager les retrouve dans **Planning › Demandes**, accepte ou refuse avec un commentaire, puis recompose les services concernés. Une demande n’est pas un congé validé avant acceptation.',
    'Staff send availability, unavailability or leave requests from the Team app. The manager reviews them under **Planning › Requests**, accepts or declines with a note, then rebuilds affected shifts. A request is not approved leave until accepted.',
    'يرسل الموظفون التوفر أو عدم التوفر أو طلب الإجازة من تطبيق الفريق. يراجع المسؤول ذلك في **التخطيط › الطلبات** ويقبل أو يرفض مع ملاحظة ثم يعدّل الورديات. الطلب لا يصبح إجازة معتمدة قبل القبول.')),
  article('pointer-les-heures', 'equipe', ['all'], 'timeclock', L('Pointer et valider les heures', 'Clock and approve hours', 'تسجيل واعتماد الساعات'), L(
    '1. Chaque salarié utilise son accès personnel pour pointer arrivée et départ.\n2. Le manager compare les pointages au planning dans **Heures travaillées**.\n3. Corrigez uniquement avec motif et trace.\n4. Validez la période avant report vers la paie.\n\nNe partagez jamais un code de pointage.',
    '1. Each employee uses personal access to clock in and out.\n2. The manager compares punches with the schedule under **Worked hours**.\n3. Correct only with a reason and audit trail.\n4. Approve the period before carrying it into payroll.\n\nNever share a clock-in code.',
    '1. يستخدم كل موظف دخوله الشخصي لتسجيل الحضور والانصراف.\n2. يقارن المسؤول التسجيلات بالجدول في **الساعات المنجزة**.\n3. صحح فقط مع سبب وأثر مسجل.\n4. اعتمد الفترة قبل نقلها للأجور.\n\nلا تشارك رمز الحضور.')),
  article('repartir-planning-equitablement', 'equipe', ['all'], 'planning', L('Répartir le planning équitablement', 'Distribute shifts fairly', 'توزيع الورديات بعدل'), L(
    'Dans **Planning**, renseignez d’abord disponibilités, rôles, personnes nécessaires par service et limites horaires. Choisissez **Répartir équitablement** : Kiwi propose les services selon disponibilité, rôle et heures déjà attribuées. Relisez conflits et couverture, ajustez si besoin, puis publiez. La proposition n’est jamais publiée automatiquement.',
    'In **Planning**, first enter availability, roles, people needed per shift and hour limits. Choose **Distribute fairly**: Kiwi proposes shifts using availability, role and already assigned hours. Review conflicts and coverage, adjust, then publish. The proposal is never auto-published.',
    'في **التخطيط** أدخل التوفر والأدوار وعدد المطلوبين وحدود الساعات. اختر **التوزيع العادل**: يقترح Kiwi الورديات حسب التوفر والدور والساعات الموزعة. راجع التعارض والتغطية وعدّل ثم انشر. لا يُنشر الاقتراح تلقائياً.')),
  article('menu-et-modificateurs', 'restaurant', ['restaurant','cafe','fastfood','pizzeria','foodtruck'], 'menu', L('Créer le menu et ses modificateurs', 'Build a menu and modifiers', 'إنشاء القائمة والإضافات'), L(
    '1. Ouvrez **Menu & modificateurs** et créez catégories et articles.\n2. Ajoutez prix, station de préparation et disponibilité.\n3. Créez les groupes obligatoires ou facultatifs : cuisson, taille, accompagnement, supplément.\n4. Testez une commande complète à la caisse avant service.',
    '1. Open **Menu & modifiers** and create categories and items.\n2. Add price, preparation station and availability.\n3. Create required or optional groups: cooking, size, side or add-on.\n4. Test a complete order at the till before service.',
    '1. افتح **القائمة والإضافات** وأنشئ الفئات والمنتجات.\n2. أضف السعر ومحطة التحضير والتوفر.\n3. أنشئ مجموعات إجبارية أو اختيارية مثل الطهي والحجم والمرافقة والإضافة.\n4. اختبر طلباً كاملاً في الصندوق قبل الخدمة.')),
  article('impression-cuisine-automatique', 'restaurant', ['restaurant','cafe','fastfood','pizzeria','foodtruck','boulangerie'], 'kitchen-printing', L('Imprimer automatiquement en cuisine', 'Auto-print in the kitchen', 'الطباعة التلقائية في المطبخ'), L(
    '1. Ouvrez **Terminaux › Impression cuisine**.\n2. Installez le relais Kiwi sur l’appareil relié à l’imprimante.\n3. Affectez imprimante et stations, puis imprimez un test.\n4. Envoyez une commande réelle de test.\n\nLe relais doit rester ouvert et connecté. Chaque identifiant de travail n’est imprimé qu’une fois ; une réimpression manuelle reste marquée comme telle.',
    '1. Open **Terminals › Kitchen printing**.\n2. Install the Kiwi relay on the device connected to the printer.\n3. Assign printer and stations, then print a test.\n4. Send one real test order.\n\nThe relay must remain open and connected. Each job ID prints once; manual reprints remain identified.',
    '1. افتح **الأجهزة › طباعة المطبخ**.\n2. ثبّت وسيط Kiwi على الجهاز المتصل بالطابعة.\n3. عيّن الطابعة والمحطات ثم اطبع اختباراً.\n4. أرسل طلباً تجريبياً حقيقياً.\n\nيجب أن يبقى الوسيط مفتوحاً ومتصلًا. يطبع كل معرف مرة واحدة وتبقى إعادة الطباعة مميزة.')),
  article('application-serveur', 'restaurant', ['restaurant','cafe'], 'server-app', L('Démarrer l’app Serveur', 'Set up the Server app', 'إعداد تطبيق النادل'), L(
    '1. Ajoutez le serveur dans **Équipe** avec accès personnel.\n2. Affectez-lui une zone dans **Plan de salle › Affectation**.\n3. Ouvrez l’app Serveur, connectez son compte et vérifiez ses tables.\n4. Testez ouverture, commande, demande d’addition et clôture.\n\nLa caisse et l’app Serveur doivent afficher le même état.',
    '1. Add the server under **Team** with personal access.\n2. Assign an area under **Floor plan › Assignment**.\n3. Open the Server app, sign in and check assigned tables.\n4. Test opening, ordering, bill request and closing.\n\nTill and Server app must show the same state.',
    '1. أضف النادل في **الفريق** بدخول شخصي.\n2. عيّن له منطقة في **خريطة القاعة › التعيين**.\n3. افتح تطبيق النادل وسجل الدخول وتحقق من طاولاته.\n4. اختبر الفتح والطلب وطلب الحساب والإغلاق.\n\nيجب أن تعرض الشاشة والتطبيق نفس الحالة.')),
  article('demande-addition-table', 'restaurant', ['restaurant','cafe'], 'table-service', L('Traiter une demande d’addition', 'Handle a bill request', 'معالجة طلب الحساب'), L(
    'Quand le serveur marque **Addition demandée**, la table change d’état sur la caisse. Ouvrez la table, relisez commandes, remises et responsable, puis encaissez. Une fois le paiement validé, clôturez la table : elle redevient libre sur la caisse et l’app Serveur. Ne libérez jamais une table avant le paiement ou l’annulation autorisée.',
    'When a server marks **Bill requested**, the table changes state at the till. Open it, review orders, discounts and owner, then take payment. Once payment is approved, close the table: it becomes free on both till and Server app. Never free a table before payment or an authorised void.',
    'عندما يحدد النادل **طلب الحساب** تتغير حالة الطاولة في الصندوق. افتحها وراجع الطلبات والتخفيضات والمسؤول ثم استلم الدفع. بعد تأكيد الدفع أغلق الطاولة لتصبح حرة في الصندوق وتطبيق النادل. لا تحررها قبل الدفع أو إلغاء مصرح.')),
  article('stock-recettes-ingredients', 'stock', ['restaurant','cafe','fastfood','pizzeria','foodtruck','boulangerie'], 'recipes', L('Relier recettes et stock', 'Link recipes to inventory', 'ربط الوصفات بالمخزون'), L(
    '1. Créez les ingrédients avec unité, coût et stock initial.\n2. Dans chaque recette, ajoutez les quantités réellement consommées.\n3. Enregistrez pertes et ajustements comme mouvements séparés.\n4. Faites une vente test et contrôlez consommation et marge.\n\nUne recette incomplète reste signalée ; Kiwi ne fabrique pas son coût.',
    '1. Create ingredients with unit, cost and opening stock.\n2. Add actual consumed quantities to each recipe.\n3. Record waste and adjustments as separate movements.\n4. Run a test sale and check consumption and margin.\n\nAn incomplete recipe remains flagged; Kiwi does not invent its cost.',
    '1. أنشئ المكونات مع الوحدة والتكلفة والمخزون الأولي.\n2. أضف الكميات المستهلكة فعلاً لكل وصفة.\n3. سجل الهدر والتسويات كحركات مستقلة.\n4. نفذ بيعاً تجريبياً وراجع الاستهلاك والهامش.\n\nتبقى الوصفة الناقصة موضحة ولا يخترع Kiwi تكلفتها.')),
  article('tailles-couleurs-variantes', 'stock', ['boutique','epicerie','pharmacie','librairie','fleuriste'], 'variants', L('Gérer tailles, couleurs et variantes', 'Manage sizes, colours and variants', 'إدارة المقاسات والألوان والأنواع'), L(
    'Créez d’abord le produit, puis ses variantes. Donnez à chaque combinaison son code-barres, prix éventuel et quantité. Scannez au moins une variante à la caisse et vérifiez que seul son stock diminue. N’utilisez pas le même code-barres pour deux variantes.',
    'Create the product first, then its variants. Give every combination its own barcode, optional price and quantity. Scan at least one variant at the till and check that only its stock decreases. Never reuse one barcode for two variants.',
    'أنشئ المنتج أولاً ثم أنواعه. أعط كل تركيبة باركوداً وسعراً اختيارياً وكمية خاصة. امسح نوعاً في الصندوق وتحقق من انخفاض مخزونه وحده. لا تستخدم نفس الباركود لنوعين.')),
  article('retours-et-echanges', 'caisse', ['boutique','epicerie','pharmacie','librairie','fleuriste'], 'returns', L('Faire un retour ou un échange', 'Process a return or exchange', 'تنفيذ إرجاع أو استبدال'), L(
    '1. Ouvrez **Retours & échanges** et retrouvez le reçu.\n2. Sélectionnez uniquement les articles rendus et leur état.\n3. Choisissez remboursement, avoir ou échange selon votre règle.\n4. Pour un échange, ajoutez le nouvel article et encaissez ou rendez la différence.\n\nKiwi enregistre les mouvements de stock et de paiement séparément.',
    '1. Open **Returns & exchanges** and find the receipt.\n2. Select only returned items and their condition.\n3. Choose refund, credit note or exchange under your policy.\n4. For an exchange, add the new item and collect or return the difference.\n\nKiwi records stock and payment movements separately.',
    '1. افتح **الإرجاع والاستبدال** وابحث عن الوصل.\n2. اختر المنتجات المعادة وحالتها فقط.\n3. اختر رد المبلغ أو رصيداً أو استبدالاً حسب السياسة.\n4. في الاستبدال أضف المنتج الجديد واستلم أو أرجع الفرق.\n\nيسجل Kiwi حركات المخزون والدفع منفصلة.')),
  article('credit-client-epicerie', 'caisse', ['epicerie'], 'credit', L('Vendre à crédit à l’épicerie', 'Sell on customer credit', 'البيع بالدين في البقالة'), L(
    'Identifiez obligatoirement le client avant de choisir **Crédit client**. Vérifiez son solde et la limite autorisée, saisissez le montant, puis confirmez. Lors d’un règlement, ouvrez sa fiche et enregistrez le paiement reçu. Le carnet conserve chaque dette et règlement ; ne remplacez jamais le solde manuellement.',
    'Identify the customer before choosing **Customer credit**. Check balance and authorised limit, enter the amount, then confirm. When they pay, open the customer record and register the payment received. The ledger keeps each debt and payment; never overwrite the balance manually.',
    'يجب تحديد العميل قبل اختيار **دين العميل**. تحقق من الرصيد والحد المسموح وأدخل المبلغ ثم أكد. عند السداد افتح بطاقة العميل وسجل المبلغ المستلم. يحتفظ السجل بكل دين ودفعة؛ لا تستبدل الرصيد يدوياً.')),
  article('lots-et-peremptions-pharmacie', 'stock', ['pharmacie'], 'expiry', L('Suivre lots et péremptions', 'Track batches and expiry', 'تتبع الدفعات والصلاحية'), L(
    'À la réception, saisissez produit, lot, date de péremption et quantité. Stockez les lots séparément même pour le même produit. Servez d’abord le lot qui expire le plus tôt lorsque la règle le permet. Consultez les alertes avant commande et retirez tout lot expiré par un mouvement tracé.',
    'At receipt, enter product, batch, expiry date and quantity. Keep batches separate even for the same product. Use the earliest-expiring batch first when policy allows. Review alerts before ordering and remove expired batches with a traced movement.',
    'عند الاستلام أدخل المنتج ورقم الدفعة وتاريخ الصلاحية والكمية. افصل الدفعات حتى للمنتج نفسه. اصرف الأقرب انتهاءً أولاً عندما تسمح القاعدة. راجع التنبيهات قبل الطلب وأخرج المنتهي بحركة مسجلة.')),
  article('photos-et-incidents-pressing', 'pressing', ['pressing'], 'pressing-quality', L('Documenter l’état et un incident', 'Document condition and issues', 'توثيق الحالة والمشكلة'), L(
    'Au dépôt, photographiez les taches ou dommages avec l’accord du client et ajoutez une note précise. Si un incident survient, ouvrez **Qualité & incidents**, rattachez-le au bon, décrivez reprise et responsable, puis clôturez seulement après résolution. Les photos restent liées à la commande concernée.',
    'At drop-off, photograph stains or damage with customer consent and add a precise note. If an issue occurs, open **Quality & issues**, link it to the order, describe rework and owner, then close only after resolution. Photos remain attached to that order.',
    'عند الإيداع صوّر البقع أو الأضرار بموافقة العميل وأضف ملاحظة دقيقة. عند مشكلة افتح **الجودة والملاحظات** واربطها بالطلب وحدد إعادة المعالجة والمسؤول ثم أغلقها بعد الحل فقط. تبقى الصور مرتبطة بالطلب.')),
  article('rack-et-scan-pressing', 'pressing', ['pressing'], 'pressing-pickup', L('Ranger et retrouver une commande', 'Rack and retrieve an order', 'ترتيب الطلب والعثور عليه'), L(
    'Quand toutes les pièces sont prêtes, ouvrez **Retraits & rack**, attribuez un emplacement libre et confirmez le nombre de pièces. Au retrait, scannez une étiquette ou saisissez exactement le numéro, contrôlez client, pièces et solde, puis confirmez la remise. Le rack n’est libéré qu’après la remise.',
    'When all garments are ready, open **Pickup & rack**, assign a free slot and confirm the garment count. At pickup, scan a label or enter the exact number, check customer, garments and balance, then confirm hand-off. The rack is freed only after hand-off.',
    'عند جاهزية كل القطع افتح **الاستلام والرف** وعيّن مكاناً حراً وأكد عدد القطع. عند الاستلام امسح الملصق أو أدخل الرقم بدقة وتحقق من العميل والقطع والرصيد ثم أكد التسليم. لا يتحرر الرف إلا بعد التسليم.')),
  article('collecte-livraison-pressing', 'pressing', ['pressing'], 'pressing-delivery', L('Organiser collecte et livraison', 'Plan collection and delivery', 'تنظيم الجمع والتوصيل'), L(
    '1. Définissez zones, créneaux et frais dans **Collecte & livraison**.\n2. Ajoutez adresse et téléphone vérifiés à la commande.\n3. Affectez la course et suivez collecte, atelier, départ et remise.\n4. Confirmez la remise uniquement devant le client.\n\nLa course reste liée au même bon et au même solde.',
    '1. Define zones, slots and fees under **Collection & delivery**.\n2. Add a verified address and phone to the order.\n3. Assign the run and track collection, workshop, departure and hand-off.\n4. Confirm delivery only with the customer present.\n\nThe run stays linked to the same order and balance.',
    '1. حدد المناطق والمواعيد والرسوم في **الجمع والتوصيل**.\n2. أضف عنواناً وهاتفاً مؤكدين للطلب.\n3. عيّن الجولة وتتبع الجمع والورشة والخروج والتسليم.\n4. أكد التسليم أمام العميل فقط.\n\nتبقى الجولة مرتبطة بنفس الطلب والرصيد.')),
  article('rdv-spa-coiffure', 'reservations', ['spa','coiffure'], 'appointments', L('Configurer les rendez-vous beauté', 'Set up beauty appointments', 'إعداد مواعيد التجميل'), L(
    'Créez les prestations avec durée, prix, temps de préparation et compétences requises. Ajoutez praticiens, postes ou cabines et leurs disponibilités. Activez seulement les services réservables, puis testez le lien public. Un créneau apparaît uniquement si personne, ressource et horaire sont libres ensemble.',
    'Create services with duration, price, preparation time and required skills. Add practitioners, chairs or rooms and their availability. Enable only bookable services, then test the public link. A slot appears only when staff, resource and hours are all available.',
    'أنشئ الخدمات مع المدة والسعر ووقت التحضير والمهارات. أضف المختصين والكراسي أو الغرف وتوفرهم. فعّل الخدمات القابلة للحجز فقط ثم اختبر الرابط العام. يظهر الموعد عندما يتوفر الموظف والمورد والوقت معاً.')),
  article('arrivees-et-chambres-hotel', 'reservations', ['hotel','riad'], 'hotel-ops', L('Préparer arrivées et chambres', 'Prepare arrivals and rooms', 'تحضير الوصول والغرف'), L(
    'Vérifiez réservation, identité, dates, chambre, tarif et solde avant l’arrivée. Affectez une chambre propre et disponible, puis effectuez le check-in réel. Pendant le séjour, ajoutez les consommations au folio. Au départ, relisez le folio, encaissez, faites le check-out et passez la chambre à nettoyer.',
    'Check booking, identity, dates, room, rate and balance before arrival. Assign a clean available room, then perform the real check-in. During the stay, add charges to the folio. At departure, review the folio, take payment, check out and mark the room for cleaning.',
    'تحقق من الحجز والهوية والتواريخ والغرفة والسعر والرصيد قبل الوصول. عيّن غرفة نظيفة ومتاحة ثم نفذ الدخول الحقيقي. أثناء الإقامة أضف المصاريف للحساب. عند المغادرة راجع الحساب واستلم الدفع وسجل الخروج وضع الغرفة للتنظيف.')),
  article('abonnements-et-entrees-gym', 'caisse', ['gym','sport'], 'gym-members', L('Gérer abonnements et entrées', 'Manage memberships and check-ins', 'إدارة الاشتراكات والدخول'), L(
    'Créez les formules avec durée, prix et règles d’accès. Identifiez l’adhérent, choisissez sa formule et enregistrez le paiement. À chaque entrée, recherchez ou scannez l’adhérent : Kiwi vérifie statut et échéance avant de confirmer. Un gel ou renouvellement doit être enregistré sur sa fiche.',
    'Create plans with duration, price and access rules. Identify the member, choose a plan and record payment. At every check-in, search or scan the member: Kiwi checks status and expiry before confirmation. Record freezes and renewals on the member record.',
    'أنشئ الباقات بمدتها وسعرها وقواعد الدخول. حدد العضو واختر الباقة وسجل الدفع. عند كل دخول ابحث أو امسح العضو؛ يتحقق Kiwi من الحالة والانتهاء قبل التأكيد. سجل التجميد والتجديد في بطاقة العضو.')),
  article('fournees-boulangerie', 'stock', ['boulangerie'], 'bakery-production', L('Planifier les fournées', 'Plan bakery batches', 'تخطيط دفعات المخبز'), L(
    'Dans le module production, créez une fournée avec produit, quantité prévue, heure et responsable. Au défournement, saisissez quantité réellement produite et pertes. Les ventes diminuent ensuite le stock disponible. Comparez prévu, produit, vendu et invendu avant de lancer la fournée suivante.',
    'In production, create a batch with product, planned quantity, time and owner. When finished, enter actual output and waste. Sales then reduce available stock. Compare planned, produced, sold and unsold before launching the next batch.',
    'في الإنتاج أنشئ دفعة مع المنتج والكمية المتوقعة والوقت والمسؤول. عند الانتهاء أدخل المنتج فعلاً والهدر. تخفض المبيعات المخزون المتاح. قارن المتوقع والمنتج والمباع والمتبقي قبل الدفعة التالية.')),
  article('bouquets-et-livraisons-fleuriste', 'caisse', ['fleuriste'], 'florist-delivery', L('Préparer un bouquet à livrer', 'Prepare a bouquet delivery', 'تحضير باقة للتوصيل'), L(
    'Créez la composition avec fleurs, quantité, occasion, carte et consignes. Vérifiez fraîcheur et stock avant confirmation. Ajoutez destinataire, téléphone, adresse et créneau, puis encaissez selon le moyen reçu. Suivez préparation, départ et remise sans séparer la livraison de la commande.',
    'Create the arrangement with flowers, quantity, occasion, card and instructions. Check freshness and stock before confirmation. Add recipient, phone, address and slot, then take the actual payment. Track preparation, departure and hand-off without separating delivery from the order.',
    'أنشئ التشكيلة مع الزهور والكمية والمناسبة والبطاقة والتعليمات. تحقق من الطراوة والمخزون قبل التأكيد. أضف المستلم والهاتف والعنوان والموعد ثم سجل الدفع المستلم. تتبع التحضير والخروج والتسليم ضمن نفس الطلب.')),
  article('four-et-cuisson-pizzeria', 'restaurant', ['pizzeria'], 'pizzeria-production', L('Piloter le four à pizza', 'Run the pizza oven queue', 'إدارة طابور فرن البيتزا'), L(
    'Affectez pizzas et suppléments à la station four. Quand une commande arrive, acceptez-la puis placez chaque pizza dans la file avec son état. Faites avancer préparation, au four et prête dans l’ordre réel. Une pizza refaite doit garder la référence de commande et être signalée comme reprise.',
    'Assign pizzas and add-ons to the oven station. When an order arrives, accept it and place each pizza in the queue with its state. Move preparation, in oven and ready in the real order. A remade pizza must keep its order reference and be marked as a remake.',
    'عيّن البيتزا والإضافات لمحطة الفرن. عند وصول الطلب اقبله وضع كل بيتزا في الطابور بحالتها. انقلها بين التحضير والفرن والجاهز حسب الواقع. البيتزا المعادة تحتفظ بمرجع الطلب وتُعلّم كإعادة.')),
  article('evenement-et-devis-traiteur', 'caisse', ['traiteur'], 'catering-events', L('Créer un événement traiteur', 'Create a catering event', 'إنشاء مناسبة تموين'), L(
    'Créez l’événement avec client, date, lieu, invités et prestations. Préparez le devis avec quantités, prix, acompte et échéances, puis confirmez seulement après accord. Affectez production, matériel, livraison et équipe. À la fin, enregistrez suppléments, solde et remise du matériel sur le même dossier.',
    'Create the event with customer, date, venue, guest count and services. Prepare the quote with quantities, prices, deposit and due dates, then confirm only after approval. Assign production, equipment, delivery and staff. Finally record extras, balance and equipment return in the same file.',
    'أنشئ المناسبة مع العميل والتاريخ والمكان وعدد الضيوف والخدمات. جهز العرض بالكميات والأسعار والتسبيق والمواعيد ثم أكد بعد الموافقة. عيّن الإنتاج والمعدات والتوصيل والفريق. في النهاية سجل الإضافات والرصيد وإرجاع المعدات في نفس الملف.')),
];

export const STARTER_ARTICLES = CORE_ARTICLES.concat(MORE_ARTICLES);

// Bump only the affected key when a shipped workflow materially changes. The
// operator library then marks its guide stale until it is reviewed and republished.
export const FEATURE_VERSIONS = Object.freeze({
  caisse:1, receipts:1, team:1, planning:1, reservations:1, inventory:1,
  scanner:1, tables:1, kds:1, payments:1, offline:1, pwa:1, reporting:1,
  catalog:1, promotions:1, 'team-availability':1, timeclock:1, menu:1,
  'kitchen-printing':1, 'server-app':1, 'table-service':1, recipes:1,
  variants:1, returns:1, credit:1, expiry:1, appointments:1, 'hotel-ops':1,
  'gym-members':1, 'bakery-production':1, 'florist-delivery':1,
  'pizzeria-production':1, 'catering-events':1, 'pressing-services':1,
  'pressing-orders':1, 'pressing-quality':1, 'pressing-pickup':1,
  'pressing-delivery':1,
});
export function featureHash(key) {
  key = cleanText(key, 80);
  return key ? key + ':' + (FEATURE_VERSIONS[key] || 1) : '';
}

export async function seedArticles(env) {
  await ensureSupport(env);
  const now = Date.now();
  for (const a of STARTER_ARTICLES) {
    const id = 'art-' + a.slug;
    const hash = featureHash(a.feature);
    await env.DB.prepare(`INSERT OR IGNORE INTO support_articles
      (id,slug,category,store_types,feature_key,feature_hash,status,revision,title_fr,title_en,title_ar,body_fr,body_en,body_ar,created_ts,updated_ts,published_ts,actor)
      VALUES (?,?,?,?,?,?,'published',1,?,?,?,?,?,?,?,?,?,'system')`)
      .bind(id,a.slug,a.category,JSON.stringify(a.types),a.feature,hash,a.title.fr,a.title.en,a.title.ar,a.body.fr,a.body.en,a.body.ar,now,now,now).run();
  }
}

export function cleanText(value, max = 4000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}
export function parseJson(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
export function classify(summary) {
  const s = cleanText(summary, 4000).toLowerCase();
  const urgent = /bloqu|impossible|perdu|double|débité|debite|paiement|sécur|secur|vol|urgent|down|panne/.test(s);
  const category = /imprim|ticket|bluetooth|usb/.test(s) ? 'materiel'
    : /stock|invent|produit|article/.test(s) ? 'stock'
    : /equipe|employ|planning|salaire|pin|accès/.test(s) ? 'equipe'
    : /reservation|rendez|rdv|créneau/.test(s) ? 'reservations'
    : /caisse|paiement|encaisse|table|commande/.test(s) ? 'caisse' : 'autre';
  return { category, priority: urgent ? 'urgent' : 'normal' };
}
export async function supportActor(request, env) {
  const actor = await operatorActor(request, env);
  return actor.label || actor.id || 'equipe';
}
