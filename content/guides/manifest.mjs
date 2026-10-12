export const ASSET_VERSIONS = Object.freeze({ css: 12, js: 5, library: 2 });
export const PUBLISHED_LOCALES = Object.freeze(['fr', 'en', 'ar']);
// Landing languages are independent of the three published guide languages:
// a landing without guides of its own links to the English hub.
export const LANDING_LOCALES = Object.freeze(['fr', 'en', 'ar', 'de', 'it', 'nl', 'es']);

const article = (title, description, ogTitle, ogDescription, image, imageAlt, section, datePublished, options = {}) => ({
  title, description, ogTitle, ogDescription, image, imageAlt, section,
  datePublished, dateModified: datePublished, ...options,
});

const collection = (title, description, ogTitle, ogDescription, image, imageAlt) => ({
  title, description, ogTitle, ogDescription, image, imageAlt,
});

export const HUBS = Object.freeze({
  fr: collection(
    'Guides de gestion pour restaurants au Maroc · Kiwi',
    'Guides pour restaurants au Maroc : caisse, food cost, stock, carte, seuil de rentabilité et fidélisation client, avec des méthodes et exemples en MAD.',
    'Kiwi Guides · Gérer un restaurant au Maroc avec de meilleurs chiffres',
    'Méthodes, formules et protocoles concrets pour décider, mesurer et agir.',
    'assets/articles/guides-restaurant-maroc.png',
    'Sept méthodes Kiwi pour préparer, choisir, mesurer, expliquer, arbitrer et planifier dans un restaurant.',
  ),
  en: collection(
    'Restaurant management guides for Morocco · Kiwi',
    'Restaurant guides for Morocco: opening, POS, food cost, inventory, menu engineering, break-even and customer loyalty, with practical MAD examples.',
    'Kiwi Guides · Better restaurant decisions in Morocco',
    'Testable protocols, explicit formulas and worked MAD examples for restaurant operators.',
    'assets/articles/guides-restaurant-morocco-en.png',
    'Seven Kiwi methods for preparing, choosing, measuring, explaining, prioritising and planning in a restaurant.',
  ),
  ar: collection(
    'أدلة إدارة المطاعم في المغرب · Kiwi',
    'أدلة عملية لفتح مطعم في المغرب واختيار برنامج الكاشير وحساب تكلفة الطعام وإدارة المخزون وهندسة القائمة ونقطة التعادل وولاء العملاء بأمثلة قابلة للتطبيق بالدرهم.',
    'أدلة Kiwi · قرارات أفضل لإدارة المطعم',
    'بروتوكولات قابلة للاختبار وصيغ واضحة وأمثلة مفصلة بالدرهم.',
    'assets/articles/guides-restaurant-morocco-ar.png',
    'سبع طرق من Kiwi للتحضير والاختيار والقياس والتفسير والمفاضلة والتخطيط في المطعم.',
  ),
});

export const TOPICS = Object.freeze([
  {
    id: 'pos',
    legalReviewRequired: true,
    routes: {
      fr: '/fr/guides/logiciel-caisse-restaurant-maroc/',
      en: '/en/guides/restaurant-pos-software-morocco/',
      ar: '/ar/guides/برنامج-كاشير-للمطعم-في-المغرب/',
    },
    pages: {
      fr: article(
        'Logiciel de caisse restaurant au Maroc : 7 tests · Kiwi',
        'Sept tests concrets pour choisir un logiciel de caisse restaurant au Maroc : service, coupure réseau, matériel, données, support et coût total.',
        'Logiciel de caisse restaurant au Maroc : les 7 tests avant de signer',
        'Un protocole d’essai concret pour choisir une caisse qui tient pendant le vrai service.',
        'assets/articles/logiciel-caisse-restaurant-maroc.png',
        'Les sept tests à faire passer à un logiciel de caisse restaurant au Maroc.',
        'Caisse restaurant', '2026-08-23T18:00:00+01:00',
        {
          dateModified: '2026-08-24T00:45:00+02:00',
          legalReviewDate: '2026-08-24',
          twitterTitle: 'Logiciel de caisse restaurant au Maroc : 7 tests',
          twitterDescription: 'Testez le service, le hors-ligne, le matériel, les données, le support et le vrai coût.',
          twitterImageAlt: 'Un protocole de soixante minutes pour tester une caisse restaurant.',
        },
      ),
      en: article(
        'Restaurant POS software in Morocco: 7 tests before you sign · Kiwi',
        'Seven practical tests for restaurant POS software in Morocco: service speed, offline continuity, hardware, data ownership, support and total cost.',
        'Restaurant POS software in Morocco: 7 tests before you sign',
        'A sixty-minute trial protocol for choosing a POS that survives a real restaurant service.',
        'assets/articles/restaurant-pos-software-morocco-en.png',
        'Seven practical tests for restaurant POS software in Morocco, covering service, offline sales, hardware and data.',
        'Restaurant POS', '2026-08-23T22:00:00+02:00',
        { dateModified: '2026-08-24T00:45:00+02:00', legalReviewDate: '2026-08-24' },
      ),
      ar: article(
        'برنامج كاشير للمطعم في المغرب: 7 اختبارات قبل التوقيع · Kiwi',
        'سبعة اختبارات عملية لاختيار برنامج كاشير للمطعم في المغرب: سرعة الخدمة، العمل دون إنترنت، الطابعات، ملكية البيانات، الدعم والتكلفة الكاملة.',
        'برنامج كاشير للمطعم في المغرب: 7 اختبارات قبل التوقيع',
        'بروتوكول تجربة من ستين دقيقة لاختيار نظام نقطة بيع يتحمل الخدمة الحقيقية.',
        'assets/articles/restaurant-pos-software-morocco-ar.png',
        'سبعة اختبارات لبرنامج كاشير المطعم في المغرب تشمل الخدمة والعمل دون إنترنت والمعدات والبيانات.',
        'نقطة بيع المطعم', '2026-08-23T22:00:00+02:00',
        { dateModified: '2026-08-24T00:45:00+02:00', legalReviewDate: '2026-08-24' },
      ),
    },
  },
  {
    id: 'food',
    legalReviewRequired: true,
    routes: {
      fr: '/fr/guides/calcul-food-cost-restaurant/',
      en: '/en/guides/restaurant-food-cost/',
      ar: '/ar/guides/حساب-تكلفة-الطعام-للمطعم/',
    },
    pages: {
      fr: article(
        'Food cost restaurant : formule et exemple en MAD · Kiwi',
        'Calculez le food cost d’un plat et du restaurant : formule, exemple détaillé en MAD, rendement, inventaire et écart entre coût théorique et réel.',
        'Food cost restaurant : formule, exemple en MAD et coût réel',
        'Du prix fournisseur à l’écart d’inventaire, calculez une marge que vous pouvez vraiment piloter.',
        'assets/articles/calcul-food-cost-restaurant.png',
        'Exemple de calcul d’un food cost de 27,3 pour cent à partir de 20,50 et 75 dirhams.',
        'Marge restaurant', '2026-08-23T18:00:00+01:00',
        {
          dateModified: '2026-08-24T00:45:00+02:00',
          legalReviewDate: '2026-08-24',
          twitterTitle: 'Food cost restaurant : formule et exemple en MAD',
          twitterDescription: 'Calculez le coût matière par plat, le coût réel de la période et leur écart.',
          twitterImageAlt: 'La formule du food cost restaurant expliquée avec un exemple en MAD.',
        },
      ),
      en: article(
        'Restaurant food cost: formula, MAD example and calculator · Kiwi',
        'Calculate restaurant food cost per dish and period with a detailed MAD example, yield conversions, inventory consumption and theoretical-versus-actual variance.',
        'Restaurant food cost: formula, MAD example and actual cost',
        'Move from supplier price to inventory variance and calculate a food margin you can actually manage.',
        'assets/articles/restaurant-food-cost-en.png',
        'Restaurant food cost example: 20.50 MAD divided by a 75 MAD selling price equals 27.3 percent.',
        'Restaurant margin', '2026-08-23T22:00:00+02:00',
        { dateModified: '2026-08-24T00:45:00+02:00', legalReviewDate: '2026-08-24' },
      ),
      ar: article(
        'حساب تكلفة الطعام للمطعم: الصيغة ومثال بالدرهم · Kiwi',
        'احسب تكلفة الطعام لكل طبق وللفترة: صيغة واضحة، مثال مفصل بالدرهم، تحويل الوحدات والمردودية، استهلاك المخزون والفرق بين النظري والفعلي.',
        'تكلفة الطعام للمطعم: الصيغة ومثال بالدرهم والتكلفة الفعلية',
        'من ثمن المورد إلى فرق الجرد، احسب هامشا تستطيع متابعته واتخاذ القرار عليه.',
        'assets/articles/restaurant-food-cost-ar.png',
        'مثال تكلفة الطعام: 20.50 درهما مقسومة على سعر بيع 75 درهما تساوي 27.3 بالمئة.',
        'هامش المطعم', '2026-08-23T22:00:00+02:00',
        { dateModified: '2026-08-24T00:45:00+02:00', legalReviewDate: '2026-08-24' },
      ),
    },
  },
  {
    id: 'stock',
    legalReviewRequired: true,
    routes: {
      fr: '/fr/guides/gestion-stock-restaurant/',
      en: '/en/guides/restaurant-inventory-management/',
      ar: '/ar/guides/إدارة-مخزون-المطعم/',
    },
    pages: {
      fr: article(
        'Gestion de stock restaurant : méthode et exemple · Kiwi',
        'Une méthode concrète de gestion de stock restaurant : unités, recettes, inventaire, pertes, écart en MAD et seuil de réapprovisionnement.',
        'Gestion de stock restaurant : la méthode qui explique les écarts',
        'Du bon de livraison à l’inventaire, suivez chaque mouvement et traduisez l’écart en quantité puis en MAD.',
        'assets/articles/gestion-stock-restaurant.png',
        'Un écart de stock restaurant calculé entre quantité attendue et quantité comptée.',
        'Stock restaurant', '2026-08-23T18:00:00+01:00',
        {
          dateModified: '2026-08-24T00:45:00+02:00',
          legalReviewDate: '2026-08-24',
          twitterTitle: 'Gestion de stock restaurant : méthode et exemple en MAD',
          twitterDescription: 'Unités, mouvements, comptage, écarts et seuil de réapprovisionnement expliqués pas à pas.',
          twitterImageAlt: 'La méthode Kiwi pour expliquer un écart de stock restaurant.',
        },
      ),
      en: article(
        'Restaurant inventory management: method and MAD example · Kiwi',
        'A practical restaurant inventory method for units, recipes, receiving, counts, waste, MAD variance analysis and supplier-aware reorder points.',
        'Restaurant inventory management: the method that explains variance',
        'Trace every movement from delivery to count, then translate inventory variance into quantity and MAD.',
        'assets/articles/restaurant-inventory-management-en.png',
        'Restaurant chicken inventory compares 23.4 expected kilograms with 21.9 counted kilograms and a minus 63 MAD variance.',
        'Restaurant inventory', '2026-08-23T22:00:00+02:00',
        { dateModified: '2026-08-24T00:45:00+02:00', legalReviewDate: '2026-08-24' },
      ),
      ar: article(
        'إدارة مخزون المطعم: الطريقة ومثال بالدرهم · Kiwi',
        'طريقة عملية لإدارة مخزون المطعم: الوحدات والوصفات والاستلام والجرد والخسائر وتحليل الفرق بالدرهم ونقطة إعادة الطلب حسب مدة المورد.',
        'إدارة مخزون المطعم: الطريقة التي تفسر الفروق',
        'تتبع كل حركة من الاستلام إلى الجرد، ثم حوّل فرق المخزون إلى كمية وقيمة بالدرهم.',
        'assets/articles/restaurant-inventory-management-ar.png',
        'مثال مخزون الدجاج يقارن 23.4 كيلوغراما متوقعة مع 21.9 محسوبة وفرق ناقص 63 درهما.',
        'مخزون المطعم', '2026-08-23T22:00:00+02:00',
        { dateModified: '2026-08-24T00:45:00+02:00', legalReviewDate: '2026-08-24' },
      ),
    },
  },
  {
    id: 'menu',
    routes: {
      fr: '/fr/guides/menu-engineering-restaurant/',
      en: '/en/guides/restaurant-menu-engineering/',
      ar: '/ar/guides/هندسة-قائمة-الطعام-للمطعم/',
    },
    pages: {
      fr: article(
        'Menu engineering restaurant : matrice et exemple en MAD · Kiwi',
        'Faites un menu engineering restaurant fiable : marge de contribution, popularité, matrice Stars, Plowhorses, Puzzles, Dogs et exemple en MAD.',
        'Menu engineering restaurant : la matrice expliquée avec un exemple en MAD',
        'Classez chaque plat par popularité et marge de contribution, puis décidez quoi protéger, corriger, promouvoir ou retirer.',
        'assets/articles/menu-engineering-restaurant-fr.png',
        'Matrice de menu engineering avec quatre plats classés selon leur popularité et leur marge.',
        'Rentabilité du menu', '2026-08-23T21:00:00+02:00',
      ),
      en: article(
        'Restaurant menu engineering: matrix and MAD example · Kiwi',
        'Run a reliable restaurant menu engineering analysis: contribution margin, popularity, Stars, Plowhorses, Puzzles, Dogs and a worked MAD example.',
        'Restaurant menu engineering: the matrix, formulas and a worked MAD example',
        'Classify every dish by popularity and contribution margin, then decide what to protect, repair, promote or remove.',
        'assets/articles/restaurant-menu-engineering-en.png',
        'A restaurant menu engineering matrix classifying four dishes by popularity and contribution margin.',
        'Menu profitability', '2026-08-23T21:00:00+02:00',
      ),
      ar: article(
        'هندسة قائمة الطعام للمطعم: المصفوفة ومثال بالدرهم · Kiwi',
        'دليل عملي لهندسة قائمة طعام المطعم: هامش المساهمة، شعبية الأطباق، مصفوفة النجوم والخيول والألغاز والضعفاء، مع مثال مفصل بالدرهم.',
        'هندسة قائمة الطعام للمطعم: الصيغ والمصفوفة مع مثال عملي بالدرهم',
        'صنّف كل طبق حسب شعبيته وهامش مساهمته، ثم قرر ما الذي تحميه أو تصلحه أو تروّجه أو تستبعده.',
        'assets/articles/restaurant-menu-engineering-ar.png',
        'مصفوفة لهندسة قائمة الطعام تصنف أربعة أطباق حسب الشعبية وهامش المساهمة.',
        'ربحية قائمة الطعام', '2026-08-23T21:00:00+02:00',
      ),
    },
  },
  {
    id: 'breakEven',
    routes: {
      fr: '/fr/guides/seuil-rentabilite-restaurant/',
      en: '/en/guides/restaurant-break-even-point/',
      ar: '/ar/guides/نقطة-التعادل-للمطعم/',
    },
    pages: {
      fr: article(
        'Seuil de rentabilité restaurant : formule et calcul en MAD · Kiwi',
        'Calculez le seuil de rentabilité d’un restaurant : coûts fixes, taux de marge sur coûts variables, exemple en MAD, couverts par jour et calculateur.',
        'Seuil de rentabilité restaurant : formule, exemple en MAD et objectif par jour',
        'Transformez vos charges fixes et variables en chiffre d’affaires mensuel, couverts par jour et marge de sécurité.',
        'assets/articles/seuil-rentabilite-restaurant-fr.png',
        'Calcul du seuil de rentabilité d’un restaurant : 100 000 MAD divisés par 58 pour cent donnent 172 414 MAD.',
        'Pilotage financier restaurant', '2026-08-23T21:00:00+02:00',
        { dateModified: '2026-10-07T20:30:00+02:00' },
      ),
      en: article(
        'Restaurant break-even point: formula and MAD calculator · Kiwi',
        'Calculate a restaurant break-even point from fixed costs and contribution margin, then convert it into monthly sales and daily covers with a MAD calculator.',
        'Restaurant break-even point: formula, MAD example and daily cover target',
        'Turn fixed and variable costs into a monthly sales threshold, daily cover target and margin of safety.',
        'assets/articles/restaurant-break-even-en.png',
        'Restaurant break-even calculation: 100,000 MAD divided by 58 percent equals 172,414 MAD.',
        'Restaurant financial planning', '2026-08-23T21:00:00+02:00',
        { dateModified: '2026-10-07T20:30:00+02:00' },
      ),
      ar: article(
        'نقطة التعادل للمطعم: الصيغة والحساب بالدرهم · Kiwi',
        'احسب نقطة التعادل للمطعم من التكاليف الثابتة ونسبة هامش المساهمة، ثم حوّلها إلى مبيعات شهرية وعدد زبائن يومي باستعمال حاسبة بالدرهم.',
        'نقطة التعادل للمطعم: الصيغة ومثال بالدرهم والهدف اليومي',
        'حوّل التكاليف الثابتة والمتغيرة إلى عتبة مبيعات شهرية وهدف يومي وهامش أمان.',
        'assets/articles/restaurant-break-even-ar.png',
        'حساب نقطة تعادل مطعم: مئة ألف درهم مقسومة على 58 في المئة تساوي 172414 درهما.',
        'التخطيط المالي للمطعم', '2026-08-23T21:00:00+02:00',
        { dateModified: '2026-10-07T20:30:00+02:00' },
      ),
    },
  },
  {
    id: 'openRestaurant',
    legalReviewRequired: true,
    routes: {
      fr: '/fr/guides/ouvrir-restaurant-maroc/',
      en: '/en/guides/open-restaurant-morocco/',
      ar: '/ar/guides/فتح-مطعم-في-المغرب/',
    },
    pages: {
      fr: article(
        'Ouvrir un restaurant au Maroc : 9 vérifications avant le bail · Kiwi',
        'Ouvrir un restaurant au Maroc : local, autorisations, création, hygiène, budget et plan d’ouverture. Checklist vérifiable et exemple en MAD.',
        'Ouvrir un restaurant au Maroc : 9 vérifications avant de signer le bail',
        'Validez le projet, le local et les démarches applicables avant d’engager les travaux, puis testez le service complet.',
        'assets/articles/ouvrir-restaurant-maroc.png',
        'Tableau de préparation pour ouvrir un restaurant au Maroc, du local au test de service.',
        'Ouverture de restaurant', '2026-08-24T00:30:00+02:00',
        { legalReviewDate: '2026-08-24' },
      ),
      en: article(
        'How to open a restaurant in Morocco: a pre-lease checklist · Kiwi',
        'How to open a restaurant in Morocco: validate the premises, permits, company, food safety, budget and opening plan with a practical checklist.',
        'How to open a restaurant in Morocco: 9 checks before you sign a lease',
        'Validate the project, premises and applicable procedures before fit-out, then rehearse the complete service flow.',
        'assets/articles/open-restaurant-morocco-en.png',
        'A launch-control board for opening a restaurant in Morocco, from premises checks to service rehearsal.',
        'Restaurant opening', '2026-08-24T00:30:00+02:00',
        { legalReviewDate: '2026-08-24' },
      ),
      ar: article(
        'فتح مطعم في المغرب: 9 نقاط قبل توقيع عقد الكراء · Kiwi',
        'دليل عملي لفتح مطعم في المغرب: صلاحية المحل، مسار الرخص، إنشاء المقاولة، السلامة الصحية، ميزانية مثال بالدرهم واختبار ما قبل الافتتاح.',
        'فتح مطعم في المغرب: 9 نقاط قبل توقيع عقد الكراء',
        'تحقق من المشروع والمحل والإجراءات المطبقة قبل الأشغال، ثم اختبر مسار الخدمة كاملا قبل الافتتاح.',
        'assets/articles/open-restaurant-morocco-ar.png',
        'لوحة تحضير لفتح مطعم في المغرب من فحص المحل إلى تجربة الخدمة.',
        'فتح مطعم', '2026-08-24T00:30:00+02:00',
        { legalReviewDate: '2026-08-24' },
      ),
    },
  },
  {
    id: 'loyalty',
    routes: {"fr": "/fr/guides/fidelisation-client-remises-restaurant/", "en": "/en/guides/restaurant-customer-loyalty-discounts/", "ar": "/ar/guides/ولاء-عملاء-المطعم-والخصومات/"},
    pages: {
      fr: article("Fidélisation restaurant : tous les clients n’ont pas besoin de la même remise · Kiwi", "Fidélisez les clients de votre restaurant : adaptez vos offres aux visites, calculez le coût des remises en MAD et mesurez les retours.", "Fidélisation restaurant : tous les clients n’ont pas besoin de la même remise", "Adaptez vos offres aux visites enregistrées, calculez leur coût en MAD et mesurez les retours pour construire une relation qui dure.", "assets/articles/fidelisation-client-remises-restaurant-fr.png", "Trois situations client et trois réponses : reconnaître, comprendre et inviter à revenir.", "Fidélisation restaurant", "2026-10-07T20:30:00+02:00"),
      en: article("Restaurant loyalty: not every customer needs the same discount · Kiwi", "Build restaurant customer loyalty: match offers to recorded visits, calculate discount costs in MAD and measure returns with a practical checklist.", "Restaurant loyalty: not every customer needs the same discount", "Match offers to recorded visits, calculate their cost in MAD and measure returns to build a lasting customer relationship.", "assets/articles/restaurant-customer-loyalty-discounts-en.png", "Three customer situations and responses: recognise, understand and invite back.", "Restaurant customer loyalty", "2026-10-07T20:30:00+02:00"),
      ar: article("ولاء عملاء المطعم: ليس كل زبون بحاجة إلى الخصم نفسه · Kiwi", "عزز ولاء عملاء مطعمك: اربط العروض بالزيارات المسجلة، واحسب تكلفة الخصومات بالدرهم، وقس العودة والهامش بخطوات عملية تناسب نشاطك.", "ولاء عملاء المطعم: ليس كل زبون بحاجة إلى الخصم نفسه", "اربط العرض بالزيارات المسجلة واحسب تكلفته بالدرهم وقس العودة لبناء علاقة مستمرة مع زبائن مطعمك.", "assets/articles/restaurant-customer-loyalty-discounts-ar.png", "ثلاث حالات للعملاء وثلاث استجابات: التقدير والفهم والدعوة إلى العودة.", "ولاء عملاء المطعم", "2026-10-07T20:30:00+02:00"),
    },
  },
]);

/* ── Bibliothèque · taxonomie, entrées par objectif et parcours ──────────────
 * Ces tables sont ADDITIVES : elles décrivent comment la bibliothèque classe,
 * filtre et enchaîne les guides déjà publiés ci-dessus. Aucune ne touche aux
 * métadonnées d'un article, donc aucune URL, aucun canonical et aucun hreflang
 * ne dépend d'elles. Le générateur refuse de construire si un sujet manque de
 * catégorie, d'objectif ou de résumé de carte dans les trois langues.
 *
 * Le temps de lecture ne vit PAS ici : il est calculé à la construction depuis
 * le fragment réel de chaque langue, donc il ne peut pas se désynchroniser du
 * texte publié. */

export const CATEGORIES = Object.freeze([
  { id: 'ops', labels: { fr: 'Caisse & opérations', en: 'POS & operations', ar: 'الكاشير والتشغيل' } },
  { id: 'stock', labels: { fr: 'Stock & food cost', en: 'Inventory & food cost', ar: 'المخزون وتكلفة الطعام' } },
  { id: 'finance', labels: { fr: 'Rentabilité & finance', en: 'Profitability & finance', ar: 'الربحية والمالية' } },
  { id: 'menu', labels: { fr: 'Menu & ventes', en: 'Menu & sales', ar: 'القائمة والمبيعات' } },
  { id: 'clients', labels: { fr: 'Clients & fidélisation', en: 'Customers & loyalty', ar: 'العملاء والولاء' } },
  { id: 'opening', labels: { fr: 'Ouverture & réglementation', en: 'Opening & regulation', ar: 'الافتتاح والتنظيم' } },
]);

export const GOALS = Object.freeze([
  { id: 'open', labels: { fr: 'Préparer l’ouverture', en: 'Prepare an opening', ar: 'التحضير للافتتاح' } },
  { id: 'choose-pos', labels: { fr: 'Choisir une caisse', en: 'Choose a POS', ar: 'اختيار نظام كاشير' } },
  { id: 'cut-costs', labels: { fr: 'Réduire les coûts', en: 'Cut costs', ar: 'تقليل التكاليف' } },
  { id: 'understand-stock', labels: { fr: 'Comprendre le stock', en: 'Understand inventory', ar: 'فهم المخزون' } },
  { id: 'improve-menu', labels: { fr: 'Améliorer le menu', en: 'Improve the menu', ar: 'تحسين القائمة' } },
  { id: 'grow-sales', labels: { fr: 'Augmenter les ventes', en: 'Grow sales', ar: 'زيادة المبيعات' } },
  { id: 'keep-clients', labels: { fr: 'Fidéliser les clients', en: 'Keep customers', ar: 'الحفاظ على العملاء' } },
]);

/* Un sujet appartient à une seule catégorie, mais peut répondre à plusieurs
 * objectifs : « réduire les coûts » passe autant par le food cost que par le
 * stock. */
export const TOPIC_CATEGORY = Object.freeze({
  pos: 'ops',
  food: 'stock',
  stock: 'stock',
  menu: 'menu',
  breakEven: 'finance',
  openRestaurant: 'opening',
  loyalty: 'clients',
});

export const TOPIC_GOALS = Object.freeze({
  pos: ['choose-pos', 'open'],
  food: ['cut-costs', 'improve-menu'],
  stock: ['understand-stock', 'cut-costs'],
  menu: ['improve-menu', 'grow-sales'],
  breakEven: ['cut-costs', 'open'],
  openRestaurant: ['open'],
  loyalty: ['keep-clients', 'grow-sales'],
});

/* Résumé de carte : une promesse courte et orientée bénéfice. Il ne reprend
 * pas la meta description, qui parle au moteur de recherche, ni les deux
 * paragraphes que la bibliothèque affichait auparavant pour chaque article. */
export const TOPIC_CARDS = Object.freeze({
  pos: {
    fr: 'Un protocole de soixante minutes pour vérifier qu’une caisse tient votre service, vos imprimantes et vos coupures réseau avant de signer.',
    en: 'A sixty-minute protocol to check that a POS survives your service, your printers and your network drops before you sign.',
    ar: 'بروتوكول من ستين دقيقة للتأكد من أن نظام الكاشير يتحمل خدمتك وطابعاتك وانقطاع الإنترنت قبل التوقيع.',
  },
  food: {
    fr: 'Séparez le coût prévu par la fiche recette du coût réellement constaté entre deux inventaires, puis testez votre prix par portion.',
    en: 'Separate the cost your recipe sheet predicts from the cost you actually observe between two counts, then test your price per portion.',
    ar: 'افصل التكلفة التي تتوقعها بطاقة الوصفة عن التكلفة الفعلية بين جردين، ثم اختبر سعر الحصة.',
  },
  stock: {
    fr: 'Une unité par matière, chaque mouvement tracé, et un écart expliqué en quantité avant d’être chiffré en dirhams.',
    en: 'One unit per ingredient, every movement recorded, and a variance explained in quantity before it is valued in dirhams.',
    ar: 'وحدة واحدة لكل مادة، وتتبع كل حركة، وفارق يُشرح بالكمية قبل أن يُقيَّم بالدرهم.',
  },
  menu: {
    fr: 'Croisez les ventes et la marge de contribution pour savoir quel plat garder, remonter, retravailler ou retirer.',
    en: 'Cross unit sales with contribution margin to see which dish to keep, promote, rework or retire.',
    ar: 'اربط عدد المبيعات بهامش المساهمة لتعرف أي طبق تحتفظ به أو تبرزه أو تعيد صياغته أو تسحبه.',
  },
  breakEven: {
    fr: 'Transformez vos charges fixes en objectif de ventes, de couverts et de jours d’ouverture, étape par étape.',
    en: 'Turn your fixed costs into a target for sales, covers and operating days, one step at a time.',
    ar: 'حوّل تكاليفك الثابتة إلى هدف للمبيعات وعدد الزبائن وأيام العمل، خطوة بخطوة.',
  },
  openRestaurant: {
    fr: 'Vérifiez le projet, le local et les démarches applicables avant d’engager un loyer, puis reliez budget, carte, stock et service.',
    en: 'Check the project, the premises and the paperwork that applies before you commit to a lease, then connect budget, menu, stock and service.',
    ar: 'تحقق من المشروع والمحل والإجراءات المطلوبة قبل الالتزام بالإيجار، ثم اربط الميزانية والقائمة والمخزون والخدمة.',
  },
  loyalty: {
    fr: 'Reliez l’offre au comportement réellement enregistré du client plutôt que de distribuer la même remise à tout le monde.',
    en: 'Match the offer to what a customer actually did, instead of handing the same discount to everyone.',
    ar: 'اربط العرض بسلوك العميل المسجَّل فعلا بدل منح الخصم نفسه للجميع.',
  },
});

/* Mis en avant : les sujets les plus récemment vérifiés, pas les plus longs. */
export const FEATURED = Object.freeze(['openRestaurant', 'loyalty', 'breakEven']);

/* Un parcours n'ajoute aucun contenu : il ordonne des guides déjà publiés dans
 * l'ordre où un restaurateur en a besoin. */
export const PATHS = Object.freeze([
  {
    id: 'open',
    steps: ['openRestaurant', 'pos', 'menu'],
    titles: { fr: 'Ouvrir un restaurant', en: 'Open a restaurant', ar: 'افتتاح مطعم' },
    decks: {
      fr: 'Du projet vérifié au premier service, sans engager le local trop tôt.',
      en: 'From a checked project to the first service, without committing to the premises too early.',
      ar: 'من مشروع متحقَّق منه إلى أول خدمة، دون الالتزام بالمحل مبكرا.',
    },
  },
  {
    id: 'costs',
    steps: ['food', 'stock', 'breakEven'],
    titles: { fr: 'Maîtriser ses coûts', en: 'Master your costs', ar: 'التحكم في التكاليف' },
    decks: {
      fr: 'Mesurer le coût d’un plat, expliquer l’écart de stock, puis en déduire un objectif.',
      en: 'Measure what a dish costs, explain the stock variance, then turn both into a target.',
      ar: 'قياس تكلفة الطبق، وشرح فارق المخزون، ثم تحويلهما إلى هدف.',
    },
  },
  {
    id: 'operations',
    steps: ['pos', 'stock'],
    titles: { fr: 'Fiabiliser ses opérations', en: 'Make operations reliable', ar: 'تحسين موثوقية التشغيل' },
    decks: {
      fr: 'Une caisse qui tient le service et un stock dont chaque mouvement est traçable.',
      en: 'A POS that holds through service, and stock whose every movement can be traced.',
      ar: 'نظام كاشير يتحمل الخدمة، ومخزون يمكن تتبع كل حركة فيه.',
    },
  },
  {
    id: 'menu-profit',
    steps: ['menu', 'food', 'breakEven'],
    titles: { fr: 'Améliorer la rentabilité du menu', en: 'Improve menu profitability', ar: 'تحسين ربحية القائمة' },
    decks: {
      fr: 'Classer les plats, vérifier leur coût réel, puis confronter le résultat au seuil.',
      en: 'Classify the dishes, verify what they really cost, then test the result against break-even.',
      ar: 'تصنيف الأطباق، والتحقق من تكلفتها الفعلية، ثم مقارنة النتيجة بنقطة التعادل.',
    },
  },
]);
