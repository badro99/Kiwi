/* Page « Stock et catalogue ». Voir pages/caisse.mjs pour la règle des
 * promesses (`claim`). */
export default {
  fr: {
    nav: 'Stock et catalogue',
    card: 'Un stock qui suit les ventes, des inventaires qui montrent les écarts, un catalogue par tailles et couleurs.',
    eyebrow: 'Stock et catalogue · dès Kiwi Basic',
    h1: ['Gestion de stock pour commerce et restaurant,', 'reliée à la caisse.'],
    deck: 'Dans Kiwi, chaque vente fait bouger le stock et chaque correction garde son auteur. L’inventaire vous montre où sont les écarts. Pour une boutique, le catalogue se gère par tailles et couleurs. Pour un restaurant, les recettes sortent les ingrédients.',
    hero: { shot: 'stock-inventaire', alt: 'L’inventaire de la caisse boutique de démonstration : chaque modèle avec ses couleurs, ses tailles, son stock et son prix.' },
    facts: [
      { claim: 'stock.sale', text: 'Chaque vente sort le stock de l’article vendu. Au restaurant, elle sort aussi les ingrédients de la recette.' },
      { claim: 'stock.count', text: 'À l’inventaire, vous comptez, Kiwi montre les écarts et le propriétaire valide.' },
      { claim: 'stock.moves', text: 'Chaque correction devient un mouvement daté, avec son auteur, et jamais une vente.' },
    ],
    sections: [
      {
        id: 'ventes', kicker: 'Stock en direct',
        title: 'Le stock bouge quand vous vendez.',
        body: [
          'Un stock juste commence à la caisse. Si les ventes et le stock vivent dans deux outils, ils se contredisent dès la première semaine.',
          'Dans Kiwi, la caisse et le stock partagent la même base. Le tableau de bord montre la valeur du stock, les ruptures et ce qui est à traiter.',
        ],
        points: [
          { claim: 'stock.sale' },
          { claim: 'stock.lowstock', text: 'Fixez un seuil par article. En dessous, Kiwi vous alerte, et de nouveau si l’article tombe à zéro.' },
          { claim: 'stock.expiry', text: 'Les lots peuvent porter une date limite, et Kiwi repère ceux qui sont périmés.' },
        ],
        shot: { name: 'stock-tableau', alt: 'La page Stock et approvisionnement du tableau de bord de démonstration : valeur du stock, ruptures et articles à traiter.' },
      },
      {
        id: 'inventaire', kicker: 'Inventaire',
        title: 'Un inventaire qui explique l’écart.',
        body: [
          'Un écart n’est utile que si on sait d’où il vient : une perte, une casse, une erreur de saisie. Kiwi garde la trace de chaque mouvement pour que vous puissiez remonter le fil.',
        ],
        points: [
          { claim: 'stock.count' },
          { claim: 'stock.moves' },
          { claim: 'stock.waste', text: 'Pertes et casse s’enregistrent avec leur motif précis.' },
        ],
        shot: { name: 'stock-reassort', alt: 'Le stock rapide de l’épicerie de démonstration : les articles bientôt épuisés, avec leur seuil, et la liste de réassort.' },
      },
      {
        id: 'boutique', kicker: 'Boutique',
        title: 'Un modèle, toutes ses tailles et ses couleurs.',
        body: [
          'Un caftan en quatre tailles et trois couleurs tient sur une seule fiche, avec un stock pour chaque déclinaison. Personne n’a envie de créer douze articles.',
        ],
        points: [
          { claim: 'stock.variants', text: 'À partir de Kiwi Plus : une fiche par modèle, un stock par taille et par couleur. Vendre le noir ne touche pas au blanc.' },
          { claim: 'stock.margin', text: 'À partir de Kiwi Plus : le prix d’achat de chaque article, et la marge qui en découle.' },
          { claim: 'stock.labels', text: 'À la réception, Kiwi prépare autant d’étiquettes code-barres que de pièces reçues.' },
        ],
        shot: { name: 'stock-variantes', alt: 'La fiche d’un caftan dans la caisse boutique de démonstration : le stock par taille, le choix de la couleur et la remise.' },
      },
      {
        id: 'fournisseurs', kicker: 'Fournisseurs',
        title: 'Ce qui entre, et de chez qui.',
        body: [
          'Le stock ne bouge pas que par les ventes. La marchandise arrive, repart parfois chez le fournisseur, et chaque entrée doit laisser une trace.',
        ],
        points: [
          { claim: 'stock.suppliers', text: 'Fournisseurs, réceptions de marchandise et retours fournisseur sont inclus. Les bons de commande et le rapprochement des factures sont réservés à Kiwi Ultra.' },
          { claim: 'stock.import', text: 'Le catalogue s’importe depuis un fichier CSV, y compris un export Excel en français.' },
        ],
      },
      {
        id: 'recettes', kicker: 'Restaurant',
        title: 'Des recettes qui sortent les ingrédients.',
        body: [
          'Au restaurant, on vend un tajine, mais on stocke du poulet, des oignons et des barquettes. Kiwi fait le lien entre les deux.',
        ],
        points: [
          { claim: 'stock.recipes', text: 'À partir de Kiwi Pro : une fiche recette par plat, avec son coût matière calculé depuis le prix de vos ingrédients.' },
        ],
      },
    ],
    plan: {
      title: 'Le suivi du stock est dans Kiwi Basic.',
      body: 'Basic suit le stock, les inventaires, les mouvements et les fournisseurs. Plus ajoute le catalogue par tailles et couleurs et la marge par article. Pro ajoute les recettes et le coût matière.',
      demo: 'Bonjour, je voudrais une démo de la gestion de stock Kiwi pour mon commerce.',
    },
    faq: [
      ['Le stock baisse-t-il tout seul quand je vends ?', 'Oui. Chaque vente encaissée à la caisse sort le stock de l’article. Au restaurant, une vente sort aussi les ingrédients de la recette, selon leur rendement.'],
      ['Comment se passe un inventaire dans Kiwi ?', 'Vous comptez les articles, Kiwi compare avec le stock attendu et montre les écarts. Le propriétaire valide l’inventaire, et chaque correction reste dans l’historique avec son auteur.'],
      ['Puis-je gérer des tailles et des couleurs ?', 'Oui, à partir de Kiwi Plus. Un modèle a une seule fiche et un stock pour chaque taille et chaque couleur.'],
      ['Puis-je importer mon catalogue existant ?', 'Oui, depuis un fichier CSV. Un export Excel en français, avec ses points-virgules, est accepté.'],
      ['Combien coûte la gestion de stock Kiwi ?', 'Le suivi du stock est inclus dans Kiwi Basic, à 150 MAD par mois ou 99 MAD par mois en annuel. Le catalogue par tailles et couleurs est dans Plus, à 300 MAD par mois. Les recettes et le coût matière sont dans Pro, à 399 MAD par mois. Les 15 premiers jours sont gratuits.'],
    ],
  },
  en: {
    nav: 'Inventory and catalogue',
    card: 'Stock that follows sales, counts that show the variances, a catalogue by size and colour.',
    eyebrow: 'Inventory and catalogue · from Kiwi Basic',
    h1: ['Inventory management for shops and restaurants,', 'linked to the till.'],
    deck: 'In Kiwi, every sale moves the stock and every correction keeps its author. A count shows you where the variances are. For a boutique, the catalogue works by size and colour. For a restaurant, recipes draw down the ingredients.',
    hero: { shot: 'stock-inventaire', alt: 'The demo boutique till inventory: each model with its colours, sizes, stock and price.' },
    facts: [
      { claim: 'stock.sale', text: 'Every sale takes the item out of stock. In a restaurant, it also takes out the recipe’s ingredients.' },
      { claim: 'stock.count', text: 'At a stock count, you count, Kiwi shows the variances and the owner approves.' },
      { claim: 'stock.moves', text: 'Every correction becomes a dated movement with its author, never a sale.' },
    ],
    sections: [
      {
        id: 'live-stock', kicker: 'Live stock',
        title: 'Stock moves when you sell.',
        body: [
          'Accurate stock starts at the till. If sales and stock live in two tools, they contradict each other within the first week.',
          'In Kiwi, the till and the stock share the same data. The dashboard shows stock value, stock-outs and what needs attention.',
        ],
        points: [
          { claim: 'stock.sale' },
          { claim: 'stock.lowstock', text: 'Set a threshold per item. Below it, Kiwi alerts you, and again if the item runs out.' },
          { claim: 'stock.expiry', text: 'Batches can carry an expiry date, and Kiwi spots the ones that have expired.' },
        ],
        shot: { name: 'stock-tableau', alt: 'The Stock and purchasing page of the demo dashboard: stock value, stock-outs and items to handle.' },
      },
      {
        id: 'stock-count', kicker: 'Stock count',
        title: 'A count that explains the variance.',
        body: [
          'A variance is only useful if you know where it comes from: a loss, a breakage, a typing mistake. Kiwi keeps a record of every movement so you can trace it back.',
        ],
        points: [
          { claim: 'stock.count' },
          { claim: 'stock.moves' },
          { claim: 'stock.waste', text: 'Losses and breakage are recorded with their exact reason.' },
        ],
        shot: { name: 'stock-reassort', alt: 'The demo grocery’s quick stock view: items about to run out, with their threshold, and the restock list.' },
      },
      {
        id: 'boutique', kicker: 'Boutique',
        title: 'One model, all its sizes and colours.',
        body: [
          'A caftan in four sizes and three colours fits on one record, with stock for each variant. Nobody wants to create twelve items.',
        ],
        points: [
          { claim: 'stock.variants', text: 'From Kiwi Plus: one record per model, stock per size and per colour. Selling the black one leaves the white one untouched.' },
          { claim: 'stock.margin', text: 'From Kiwi Plus: the purchase price of each item, and the margin that follows.' },
          { claim: 'stock.labels', text: 'When goods arrive, Kiwi prepares as many barcode labels as pieces received.' },
        ],
        shot: { name: 'stock-variantes', alt: 'A caftan’s record in the demo boutique till: stock per size, colour choice and discount.' },
      },
      {
        id: 'suppliers', kicker: 'Suppliers',
        title: 'What comes in, and from whom.',
        body: [
          'Stock does not only move through sales. Goods arrive, sometimes go back to the supplier, and every delivery should leave a trace.',
        ],
        points: [
          { claim: 'stock.suppliers', text: 'Suppliers, goods received and supplier returns are included. Purchase orders and invoice matching are reserved for Kiwi Ultra.' },
          { claim: 'stock.import', text: 'The catalogue imports from a CSV file, including a French-format Excel export.' },
        ],
      },
      {
        id: 'recipes', kicker: 'Restaurant',
        title: 'Recipes that draw down the ingredients.',
        body: [
          'In a restaurant you sell a tagine, but you stock chicken, onions and takeaway boxes. Kiwi links the two.',
        ],
        points: [
          { claim: 'stock.recipes', text: 'From Kiwi Pro: a recipe sheet per dish, with its food cost calculated from your ingredient prices.' },
        ],
      },
    ],
    plan: {
      title: 'Stock tracking is in Kiwi Basic.',
      body: 'Basic tracks stock, counts, movements and suppliers. Plus adds the size and colour catalogue and margin per item. Pro adds recipes and food cost.',
      demo: 'Hello, I would like a demo of Kiwi inventory management for my business.',
    },
    faq: [
      ['Does stock go down by itself when I sell?', 'Yes. Every sale charged at the till takes the item out of stock. In a restaurant, a sale also takes out the recipe’s ingredients, according to their yield.'],
      ['How does a stock count work in Kiwi?', 'You count the items, Kiwi compares them with the expected stock and shows the variances. The owner approves the count, and every correction stays in the history with its author.'],
      ['Can I manage sizes and colours?', 'Yes, from Kiwi Plus. A model has a single record and stock for each size and each colour.'],
      ['Can I import my existing catalogue?', 'Yes, from a CSV file. A French-format Excel export, with its semicolons, is accepted.'],
      ['How much does Kiwi inventory management cost?', 'Stock tracking is included in Kiwi Basic, at 150 MAD a month or 99 MAD a month on the annual plan. The size and colour catalogue is in Plus, at 300 MAD a month. Recipes and food cost are in Pro, at 399 MAD a month. The first 15 days are free.'],
    ],
  },
  ar: {
    nav: 'المخزون والكتالوج',
    card: 'مخزون يتبع المبيعات، وجرد يُظهر الفوارق، وكتالوج بالمقاسات والألوان.',
    eyebrow: 'المخزون والكتالوج · ابتداء من Kiwi Basic',
    h1: ['تسيير المخزون للمتاجر والمطاعم،', 'مرتبط بالكاشير.'],
    deck: 'في Kiwi، المخزون ليس جدولا تملؤه في المساء. كل عملية بيع تحركه، وكل تصحيح يحفظ اسم صاحبه، والجرد يريك أين توجد الفوارق. في البوتيك، يُدار الكتالوج بالمقاسات والألوان. وفي المطعم، تُنقص الوصفات المكونات.',
    hero: { shot: 'stock-inventaire', alt: 'جرد كاشير البوتيك التجريبي: كل موديل بألوانه ومقاساته ومخزونه وثمنه.' },
    facts: [
      { claim: 'stock.sale', text: 'كل عملية بيع تُنقص مخزون السلعة المبيعة. وفي المطعم، تُنقص أيضا مكونات الوصفة.' },
      { claim: 'stock.count', text: 'في الجرد، تعدّ أنت، ويعرض Kiwi الفوارق، ويصادق المالك.' },
      { claim: 'stock.moves', text: 'كل تصحيح يصبح حركة مؤرخة باسم صاحبها، ولا يُحسب أبدا كبيع.' },
    ],
    sections: [
      {
        id: 'live-stock', kicker: 'مخزون مباشر',
        title: 'المخزون يتحرك حين تبيع.',
        body: [
          'المخزون الدقيق يبدأ من الكاشير. إذا عاشت المبيعات والمخزون في أداتين، تناقضتا منذ الأسبوع الأول.',
          'في Kiwi، يتقاسم الكاشير والمخزون المعطيات نفسها. وتعرض لوحة التحكم قيمة المخزون والسلع النافدة وما يحتاج إلى معالجة.',
        ],
        points: [
          { claim: 'stock.sale' },
          { claim: 'stock.lowstock', text: 'حدد عتبة لكل سلعة. تحتها ينبهك Kiwi، ثم ينبهك مجددا إذا نفدت السلعة.' },
          { claim: 'stock.expiry', text: 'يمكن أن تحمل الدفعات تاريخ انتهاء الصلاحية، ويرصد Kiwi المنتهية منها.' },
        ],
        shot: { name: 'stock-tableau', alt: 'صفحة المخزون والتموين في لوحة التحكم التجريبية: قيمة المخزون، والسلع النافدة، وما يجب معالجته.' },
      },
      {
        id: 'stock-count', kicker: 'الجرد',
        title: 'جرد يشرح الفارق.',
        body: [
          'الفارق لا ينفع إلا إذا عرفت مصدره: ضياع، أو كسر، أو خطأ في الإدخال. يحفظ Kiwi أثر كل حركة لتتمكن من تتبع الخيط.',
        ],
        points: [
          { claim: 'stock.count' },
          { claim: 'stock.moves' },
          { claim: 'stock.waste', text: 'يُسجَّل الضياع والكسر مع سببه بالتحديد.' },
        ],
        shot: { name: 'stock-reassort', alt: 'المخزون السريع للبقالة التجريبية: السلع القريبة من النفاد مع عتبتها، ولائحة إعادة التموين.' },
      },
      {
        id: 'boutique', kicker: 'البوتيك',
        title: 'موديل واحد، بكل مقاساته وألوانه.',
        body: [
          'قفطان بأربعة مقاسات وثلاثة ألوان ليس اثنتي عشرة سلعة تُنشأ. إنه بطاقة واحدة، بمخزون لكل نسخة.',
        ],
        points: [
          { claim: 'stock.variants', text: 'ابتداء من Kiwi Plus: بطاقة لكل موديل، ومخزون لكل مقاس ولون. بيع الأسود لا يمس الأبيض.' },
          { claim: 'stock.margin', text: 'ابتداء من Kiwi Plus: ثمن شراء كل سلعة، وهامش الربح الناتج عنه.' },
          { claim: 'stock.labels', text: 'عند الاستلام، يجهز Kiwi ملصقات باركود بعدد القطع المستلمة.' },
        ],
        shot: { name: 'stock-variantes', alt: 'بطاقة قفطان في كاشير البوتيك التجريبي: المخزون حسب المقاس، واختيار اللون، والخصم.' },
      },
      {
        id: 'suppliers', kicker: 'الموردون',
        title: 'ما يدخل، ومن عند من.',
        body: [
          'المخزون لا يتحرك بالمبيعات وحدها. تصل السلع، وتعود أحيانا إلى المورد، وكل دخول يجب أن يترك أثرا.',
        ],
        points: [
          { claim: 'stock.suppliers', text: 'الموردون واستلام السلع والإرجاع إلى المورد مشمولة. أما طلبيات الشراء ومطابقة الفواتير فهي خاصة بـ Kiwi Ultra.' },
          { claim: 'stock.import', text: 'يُستورد الكتالوج من ملف CSV، بما في ذلك ملف Excel بالصيغة الفرنسية.' },
        ],
      },
      {
        id: 'recipes', kicker: 'المطعم',
        title: 'وصفات تُنقص المكونات.',
        body: [
          'في المطعم تبيع طاجينا، لكنك تخزن الدجاج والبصل وعلب السفري. يربط Kiwi بين الاثنين.',
        ],
        points: [
          { claim: 'stock.recipes', text: 'ابتداء من Kiwi Pro: بطاقة وصفة لكل طبق، بتكلفة المواد محسوبة من أثمنة مكوناتك.' },
        ],
      },
    ],
    plan: {
      title: 'تتبع المخزون مشمول في Kiwi Basic.',
      body: 'يتتبع Basic المخزون والجرد والحركات والموردين. ويضيف Plus الكتالوج بالمقاسات والألوان وهامش الربح لكل سلعة. ويضيف Pro الوصفات وتكلفة المواد.',
      demo: 'مرحبا، أريد عرضا توضيحيا لتسيير المخزون في Kiwi لمحلي التجاري.',
    },
    faq: [
      ['هل ينقص المخزون وحده حين أبيع؟', 'نعم. كل عملية بيع تُحصَّل في الكاشير تُنقص مخزون السلعة. وفي المطعم، تُنقص أيضا مكونات الوصفة حسب مردودها.'],
      ['كيف يتم الجرد في Kiwi؟', 'تعدّ السلع، فيقارنها Kiwi بالمخزون المتوقع ويعرض الفوارق. يصادق المالك على الجرد، ويبقى كل تصحيح في السجل باسم صاحبه.'],
      ['هل يمكنني تسيير المقاسات والألوان؟', 'نعم، ابتداء من Kiwi Plus. للموديل بطاقة واحدة ومخزون لكل مقاس ولكل لون.'],
      ['هل يمكنني استيراد كتالوجي الحالي؟', 'نعم، من ملف CSV. ويُقبل ملف Excel بالصيغة الفرنسية، بفواصله المنقوطة.'],
      ['كم يكلف تسيير المخزون في Kiwi؟', 'تتبع المخزون مشمول في Kiwi Basic، بمبلغ 150 درهما في الشهر أو 99 درهما في الشهر في الاشتراك السنوي. والكتالوج بالمقاسات والألوان في Plus، بمبلغ 300 درهم في الشهر. والوصفات وتكلفة المواد في Pro، بمبلغ 399 درهما في الشهر. الأيام الخمسة عشر الأولى مجانية.'],
    ],
  },
};
