export const ASSET_VERSIONS = Object.freeze({ css: 10, js: 4 });
export const PUBLISHED_LOCALES = Object.freeze(['fr', 'en', 'ar']);

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
    'Des guides concrets pour choisir sa caisse, calculer le food cost, gérer le stock, analyser la carte et trouver le seuil de rentabilité d’un restaurant au Maroc.',
    'Kiwi Guides · Gérer un restaurant au Maroc avec de meilleurs chiffres',
    'Méthodes, formules et protocoles concrets pour décider, mesurer et agir.',
    'assets/articles/guides-restaurant-maroc.png',
    'Cinq méthodes Kiwi pour choisir, mesurer, expliquer, arbitrer et planifier dans un restaurant.',
  ),
  en: collection(
    'Restaurant management guides for Morocco · Kiwi',
    'Practical guides for choosing restaurant POS, calculating food cost, controlling inventory, engineering the menu and finding break-even in Morocco.',
    'Kiwi Guides · Better restaurant decisions in Morocco',
    'Testable protocols, explicit formulas and worked MAD examples for restaurant operators.',
    'assets/articles/guides-restaurant-morocco-en.png',
    'Five Kiwi methods for choosing, measuring, explaining, prioritising and planning in a restaurant.',
  ),
  ar: collection(
    'أدلة إدارة المطاعم في المغرب · Kiwi',
    'أدلة عملية للمطاعم المغربية لاختيار برنامج الكاشير، وحساب تكلفة الطعام، وإدارة المخزون، وهندسة القائمة، وحساب نقطة التعادل بصيغ وأمثلة قابلة للتطبيق بالدرهم.',
    'أدلة Kiwi · قرارات أفضل لإدارة المطعم',
    'بروتوكولات قابلة للاختبار وصيغ واضحة وأمثلة مفصلة بالدرهم.',
    'assets/articles/guides-restaurant-morocco-ar.png',
    'خمس طرق من Kiwi للاختيار والقياس والتفسير والمفاضلة والتخطيط في المطعم.',
  ),
});

export const TOPICS = Object.freeze([
  {
    id: 'pos',
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
      ),
      ar: article(
        'برنامج كاشير للمطعم في المغرب: 7 اختبارات قبل التوقيع · Kiwi',
        'سبعة اختبارات عملية لاختيار برنامج كاشير للمطعم في المغرب: سرعة الخدمة، العمل دون إنترنت، الطابعات، ملكية البيانات، الدعم والتكلفة الكاملة.',
        'برنامج كاشير للمطعم في المغرب: 7 اختبارات قبل التوقيع',
        'بروتوكول تجربة من ستين دقيقة لاختيار نظام نقطة بيع يتحمل الخدمة الحقيقية.',
        'assets/articles/restaurant-pos-software-morocco-ar.png',
        'سبعة اختبارات لبرنامج كاشير المطعم في المغرب تشمل الخدمة والعمل دون إنترنت والمعدات والبيانات.',
        'نقطة بيع المطعم', '2026-08-23T22:00:00+02:00',
      ),
    },
  },
  {
    id: 'food',
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
      ),
      ar: article(
        'حساب تكلفة الطعام للمطعم: الصيغة ومثال بالدرهم · Kiwi',
        'احسب تكلفة الطعام لكل طبق وللفترة: صيغة واضحة، مثال مفصل بالدرهم، تحويل الوحدات والمردودية، استهلاك المخزون والفرق بين النظري والفعلي.',
        'تكلفة الطعام للمطعم: الصيغة ومثال بالدرهم والتكلفة الفعلية',
        'من ثمن المورد إلى فرق الجرد، احسب هامشا تستطيع متابعته واتخاذ القرار عليه.',
        'assets/articles/restaurant-food-cost-ar.png',
        'مثال تكلفة الطعام: 20.50 درهما مقسومة على سعر بيع 75 درهما تساوي 27.3 بالمئة.',
        'هامش المطعم', '2026-08-23T22:00:00+02:00',
      ),
    },
  },
  {
    id: 'stock',
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
      ),
      ar: article(
        'إدارة مخزون المطعم: الطريقة ومثال بالدرهم · Kiwi',
        'طريقة عملية لإدارة مخزون المطعم: الوحدات والوصفات والاستلام والجرد والخسائر وتحليل الفرق بالدرهم ونقطة إعادة الطلب حسب مدة المورد.',
        'إدارة مخزون المطعم: الطريقة التي تفسر الفروق',
        'تتبع كل حركة من الاستلام إلى الجرد، ثم حوّل فرق المخزون إلى كمية وقيمة بالدرهم.',
        'assets/articles/restaurant-inventory-management-ar.png',
        'مثال مخزون الدجاج يقارن 23.4 كيلوغراما متوقعة مع 21.9 محسوبة وفرق ناقص 63 درهما.',
        'مخزون المطعم', '2026-08-23T22:00:00+02:00',
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
      ),
      en: article(
        'Restaurant break-even point: formula and MAD calculator · Kiwi',
        'Calculate a restaurant break-even point from fixed costs and contribution margin, then convert it into monthly sales and daily covers with a MAD calculator.',
        'Restaurant break-even point: formula, MAD example and daily cover target',
        'Turn fixed and variable costs into a monthly sales threshold, daily cover target and margin of safety.',
        'assets/articles/restaurant-break-even-en.png',
        'Restaurant break-even calculation: 100,000 MAD divided by 58 percent equals 172,414 MAD.',
        'Restaurant financial planning', '2026-08-23T21:00:00+02:00',
      ),
      ar: article(
        'نقطة التعادل للمطعم: الصيغة والحساب بالدرهم · Kiwi',
        'احسب نقطة التعادل للمطعم من التكاليف الثابتة ونسبة هامش المساهمة، ثم حوّلها إلى مبيعات شهرية وعدد زبائن يومي باستعمال حاسبة بالدرهم.',
        'نقطة التعادل للمطعم: الصيغة ومثال بالدرهم والهدف اليومي',
        'حوّل التكاليف الثابتة والمتغيرة إلى عتبة مبيعات شهرية وهدف يومي وهامش أمان.',
        'assets/articles/restaurant-break-even-ar.png',
        'حساب نقطة تعادل مطعم: مئة ألف درهم مقسومة على 58 في المئة تساوي 172414 درهما.',
        'التخطيط المالي للمطعم', '2026-08-23T21:00:00+02:00',
      ),
    },
  },
]);
