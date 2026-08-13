import { operatorActor } from '../auth/_lib.js';

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
export const STARTER_ARTICLES = [
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

// Bump only the affected key when a shipped workflow materially changes. The
// operator library then marks its guide stale until it is reviewed and republished.
export const FEATURE_VERSIONS = Object.freeze({
  caisse:1, receipts:1, team:1, planning:1, reservations:1, inventory:1,
  scanner:1, tables:1, kds:1, 'pressing-services':1, 'pressing-orders':1,
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
