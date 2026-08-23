/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · MENU I18N — window.KiwiMenuI18n
 * ---------------------------------------------------------------------------
 * La carte dans la langue de celui qui la lit — sans jamais perdre celle du
 * patron.
 *
 * Modèle (v2, 2026-08-22) : chaque entité de la carte (catégorie, sous-catégorie,
 * article, groupe d'options, choix) garde son libellé CANONIQUE dans `name` /
 * `desc` — ce que le commerçant a écrit — et porte en plus :
 *
 *   i18n: { fr: {name, desc?, h, m?}, ar: {…}, en: {…} }
 *
 *   h = empreinte du texte source au moment de la traduction (hash()) ;
 *       si le patron renomme l'article, h ne correspond plus → la traduction est
 *       PÉRIMÉE et on affiche le canonique jusqu'à la prochaine traduction ;
 *   m = 1 quand le patron a corrigé la traduction à la main → jamais écrasée
 *       par la machine (seul « Tout retraduire » la remplace, sur demande).
 *
 * Les traductions sont produites UNE FOIS par Kiwi AI (/api/ai/menu-translate),
 * pour les entrées manquantes ou périmées seulement (needs() → apply()), depuis
 * le tableau de bord (assets/restaurant-menu-workspace.js), et voyagent dans la
 * carte publiée (/api/menu — functions/api/menu.js les laisse passer). Chaque
 * surface résout ensuite l'affichage avec name()/desc()/t() dans SA langue :
 * dashboard, caisse, app serveur, écran cuisine, page QR, OrderPro. La cuisine
 * affiche le canonique d'abord (c'est ce que le chef a écrit), la traduction
 * dessous ; les lignes de commande et les tickets gardent le canonique.
 *
 * t(str, lang) — l'API « par chaîne » des surfaces qui ne tiennent qu'un
 * libellé (une ligne de commande, une étiquette de catégorie) : elle retrouve
 * l'entité par son libellé canonique dans l'index posé par index(dataset), puis
 * retombe sur le mini-dictionnaire exact ci-dessous (cartes jamais traduites,
 * démo). Il n'y a PLUS de substitution mot à mot : « Strawberry lait » n'existe
 * plus.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CORE = ['fr','ar','en'];
  const EXTRA = ['es','de','it','pt','nl','ru','zh-Hans','zh-Hant','ja','ko','tr','he','pl','sv','no','da','hi','id','el','uk'];
  const RTL = ['ar','he'];
  const LANGS = CORE;
  const ALL_LANGS = CORE.concat(EXTRA);
  const NAMES = Object.freeze({
    fr:'Français',ar:'العربية',en:'English',es:'Español',de:'Deutsch',it:'Italiano',pt:'Português',nl:'Nederlands',ru:'Русский',
    'zh-Hans':'简体中文','zh-Hant':'繁體中文',ja:'日本語',ko:'한국어',tr:'Türkçe',he:'עברית',pl:'Polski',sv:'Svenska',no:'Norsk',
    da:'Dansk',hi:'हिन्दी',id:'Bahasa Indonesia',el:'Ελληνικά',uk:'Українська',
  });

  /* Mini-dictionnaire de repli — correspondance EXACTE uniquement. */
  const DICTIONARY = {
    // ─── Catégories & Sections ───
    'hot drinks': { fr: 'Boissons chaudes', ar: 'مشروبات ساخنة', en: 'Hot Drinks' },
    'boissons chaudes': { fr: 'Boissons chaudes', ar: 'مشروبات ساخنة', en: 'Hot Drinks' },
    'مشروبات ساخنة': { fr: 'Boissons chaudes', ar: 'مشروبات ساخنة', en: 'Hot Drinks' },

    'cold drinks': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },
    'boissons fraîches': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },
    'boissons fraiches': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },
    'مشروبات باردة': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },

    'drinks': { fr: 'Boissons', ar: 'مشروبات', en: 'Drinks' },
    'boissons': { fr: 'Boissons', ar: 'مشروبات', en: 'Drinks' },
    'مشروبات': { fr: 'Boissons', ar: 'مشروبات', en: 'Drinks' },

    'breakfast & brunch': { fr: 'Brunch & Petit-déjeuner', ar: 'فطور الصباح و برانش', en: 'Breakfast & Brunch' },
    'brunch & breakfast': { fr: 'Brunch & Petit-déjeuner', ar: 'فطور الصباح و برانش', en: 'Breakfast & Brunch' },
    'brunch & petit-déjeuner': { fr: 'Brunch & Petit-déjeuner', ar: 'فطور الصباح و برانش', en: 'Breakfast & Brunch' },
    'breakfast': { fr: 'Petit-déjeuner', ar: 'فطور الصباح', en: 'Breakfast' },
    'petit-déjeuner': { fr: 'Petit-déjeuner', ar: 'فطور الصباح', en: 'Breakfast' },
    'petit dejeuner': { fr: 'Petit-déjeuner', ar: 'فطور الصباح', en: 'Breakfast' },
    'brunch': { fr: 'Brunch', ar: 'برانش', en: 'Brunch' },

    'sweets': { fr: 'Desserts & Douceurs', ar: 'حلويات و تحليات', en: 'Sweets & Desserts' },
    'desserts': { fr: 'Desserts', ar: 'حلويات', en: 'Desserts' },
    'desserts & douceurs': { fr: 'Desserts & Douceurs', ar: 'حلويات و تحليات', en: 'Sweets & Desserts' },
    'bakery': { fr: 'Boulangerie & Viennoiserie', ar: 'مخبوزات و فطائر', en: 'Bakery' },
    'boulangerie': { fr: 'Boulangerie', ar: 'مخبوزات', en: 'Bakery' },
    'viennoiserie': { fr: 'Viennoiserie', ar: 'فطائر', en: 'Pastries' },
    'pastries': { fr: 'Pâtisseries', ar: 'حلويات فرنسية', en: 'Pastries' },
    'pâtisseries': { fr: 'Pâtisseries', ar: 'حلويات فرنسية', en: 'Pastries' },

    'sandwiches': { fr: 'Sandwiches', ar: 'سندويشات', en: 'Sandwiches' },
    'burgers': { fr: 'Burgers', ar: 'برغر', en: 'Burgers' },
    'pizzas': { fr: 'Pizzas', ar: 'بيتزا', en: 'Pizzas' },
    'pastas': { fr: 'Pâtes', ar: 'معكرونة', en: 'Pastas' },
    'pâtes': { fr: 'Pâtes', ar: 'معكرونة', en: 'Pastas' },
    'salads': { fr: 'Salades', ar: 'سلطات', en: 'Salads' },
    'salades': { fr: 'Salades', ar: 'سلطات', en: 'Salads' },
    'starters': { fr: 'Entrées', ar: 'مقبلات', en: 'Starters' },
    'entrées': { fr: 'Entrées', ar: 'مقبلات', en: 'Starters' },
    'main courses': { fr: 'Plats principaux', ar: 'أطباق رئيسية', en: 'Main Courses' },
    'plats principaux': { fr: 'Plats principaux', ar: 'أطباق رئيسية', en: 'Main Courses' },
    'mains': { fr: 'Plats', ar: 'أطباق', en: 'Mains' },
    'plats': { fr: 'Plats', ar: 'أطباق', en: 'Mains' },
    'snacks': { fr: 'En-cas', ar: 'وجبات خفيفة', en: 'Snacks' },
    'en-cas': { fr: 'En-cas', ar: 'وجبات خفيفة', en: 'Snacks' },
    'juices': { fr: 'Jus frais', ar: 'عصائر طازجة', en: 'Fresh Juices' },
    'jus frais': { fr: 'Jus frais', ar: 'عصائر طازجة', en: 'Fresh Juices' },
    'tea': { fr: 'Thés & Infusions', ar: 'شاي و أعشاب', en: 'Tea & Infusions' },
    'thés & infusions': { fr: 'Thés & Infusions', ar: 'شاي و أعشاب', en: 'Tea & Infusions' },
    'coffee': { fr: 'Cafés', ar: 'قهوة', en: 'Coffee' },
    'cafés': { fr: 'Cafés', ar: 'قهوة', en: 'Coffee' },
    'matcha bar': { fr: 'Bar à Matcha', ar: 'ركن الماتشا', en: 'Matcha Bar' },
    'smoothies': { fr: 'Smoothies', ar: 'سموذي', en: 'Smoothies' },
    'milkshakes': { fr: 'Milkshakes', ar: 'ميلك شيك', en: 'Milkshakes' },
    'ice cream': { fr: 'Glaces', ar: 'مثلجات', en: 'Ice Cream' },
    'glaces': { fr: 'Glaces', ar: 'مثلجات', en: 'Ice Cream' },
    'cuisine': { fr: 'Cuisine', ar: 'المطبخ', en: 'Kitchen' },
    'comptoir': { fr: 'Comptoir', ar: 'المكتب', en: 'Counter' },
    'bar': { fr: 'Bar', ar: 'بار', en: 'Bar' },
    'four': { fr: 'Four', ar: 'فرن', en: 'Oven' },
    'grill': { fr: 'Grill', ar: 'شواية', en: 'Grill' },
    'sans section': { fr: 'Sans section', ar: 'بدون قسم', en: 'Uncategorized' },

    // ─── Groupes d'Options & Modificateurs ───
    'hot or ice': { fr: 'Chaud ou Glacé', ar: 'ساخن أو مثلج', en: 'Hot or Ice' },
    'hot or cold': { fr: 'Chaud ou Froid', ar: 'ساخن أو بارد', en: 'Hot or Cold' },
    'chaud ou glacé': { fr: 'Chaud ou Glacé', ar: 'ساخن أو مثلج', en: 'Hot or Ice' },
    'milk': { fr: 'Choix du lait', ar: 'نوع الحليب', en: 'Milk' },
    'type of milk': { fr: 'Choix du lait', ar: 'نوع الحليب', en: 'Milk' },
    'choice of milk': { fr: 'Choix du lait', ar: 'نوع الحليب', en: 'Milk' },
    'choix du lait': { fr: 'Choix du lait', ar: 'نوع الحليب', en: 'Milk' },
    'flavour': { fr: 'Saveur & Sirop', ar: 'النكهة', en: 'Flavour' },
    'flavor': { fr: 'Saveur & Sirop', ar: 'النكهة', en: 'Flavor' },
    'saveur': { fr: 'Saveur & Sirop', ar: 'النكهة', en: 'Flavour' },
    'eggs': { fr: 'Préparation des œufs', ar: 'طريقة طهي البيض', en: 'Eggs' },
    'choice of eggs': { fr: 'Préparation des œufs', ar: 'طريقة طهي البيض', en: 'Choice of Eggs' },
    'egg flavour': { fr: 'Garniture des œufs', ar: 'إضافات البيض', en: 'Egg Flavour' },
    'egg flavor': { fr: 'Garniture des œufs', ar: 'إضافات البيض', en: 'Egg Flavor' },
    'garniture des œufs': { fr: 'Garniture des œufs', ar: 'إضافات البيض', en: 'Egg Flavour' },
    'brunch sweet': { fr: 'Douceur Brunch', ar: 'حلويات البرانش', en: 'Brunch Sweet' },
    'douceur brunch': { fr: 'Douceur Brunch', ar: 'حلويات البرانش', en: 'Brunch Sweet' },
    'yogurt': { fr: 'Yaourt & Bowls', ar: 'زبادي وياغورت', en: 'Yogurt' },
    'yaourt': { fr: 'Yaourt & Bowls', ar: 'زبادي وياغورت', en: 'Yogurt' },
    'choice of bread': { fr: 'Choix du pain', ar: 'نوع الخبز', en: 'Choice of Bread' },
    'bread': { fr: 'Choix du pain', ar: 'نوع الخبز', en: 'Bread' },
    'cooking': { fr: 'Cuisson', ar: 'درجة الطهي', en: 'Cooking' },
    'cuisson': { fr: 'Cuisson', ar: 'درجة الطهي', en: 'Cooking' },
    'sauce': { fr: 'Sauce', ar: 'الصلصة', en: 'Sauce' },
    'choice of sauce': { fr: 'Choix de la sauce', ar: 'اختيار الصلصة', en: 'Choice of Sauce' },
    'sugar level': { fr: 'Niveau de sucre', ar: 'مستوى السكر', en: 'Sugar Level' },
    'sugar': { fr: 'Niveau de sucre', ar: 'مستوى السكر', en: 'Sugar' },
    'sucre': { fr: 'Niveau de sucre', ar: 'مستوى السكر', en: 'Sugar' },
    'sides': { fr: 'Accompagnement', ar: 'المقبلات الجانبية', en: 'Sides' },
    'side dish': { fr: 'Accompagnement', ar: 'المقبلات الجانبية', en: 'Side Dish' },
    'toppings': { fr: 'Suppléments & Toppings', ar: 'إضافات وتوبينغ', en: 'Toppings' },
    'extras': { fr: 'Suppléments', ar: 'إضافات', en: 'Extras' },

    // ─── Choix d'Options / Modificateurs ───
    'hot': { fr: 'Chaud', ar: 'ساخن', en: 'Hot' },
    'ice': { fr: 'Glacé', ar: 'مثلج', en: 'Ice' },
    'iced': { fr: 'Glacé', ar: 'مثلج', en: 'Iced' },
    'cold': { fr: 'Froid', ar: 'بارد', en: 'Cold' },

    'regular milk': { fr: 'Lait classique', ar: 'حليب عادي', en: 'Regular Milk' },
    'lait classique': { fr: 'Lait classique', ar: 'حليب عادي', en: 'Regular Milk' },
    'lactose free milk': { fr: 'Lait sans lactose', ar: 'حليب خالي من اللاكتوز', en: 'Lactose Free Milk' },
    'lait sans lactose': { fr: 'Lait sans lactose', ar: 'حليب خالي من اللاكتوز', en: 'Lactose Free Milk' },
    'almond milk': { fr: 'Lait d’amande', ar: 'حليب اللوز', en: 'Almond Milk' },
    'lait d’amande': { fr: 'Lait d’amande', ar: 'حليب اللوز', en: 'Almond Milk' },
    'lait d\'amande': { fr: 'Lait d’amande', ar: 'حليب اللوز', en: 'Almond Milk' },
    'oat milk': { fr: 'Lait d’avoine', ar: 'حليب الشوفان', en: 'Oat Milk' },
    'lait d’avoine': { fr: 'Lait d’avoine', ar: 'حليب الشوفان', en: 'Oat Milk' },
    'lait d\'avoine': { fr: 'Lait d’avoine', ar: 'حليب الشوفان', en: 'Oat Milk' },
    'soja milk': { fr: 'Lait de soja', ar: 'حليب الصويا', en: 'Soy Milk' },
    'soy milk': { fr: 'Lait de soja', ar: 'حليب الصويا', en: 'Soy Milk' },
    'lait de soja': { fr: 'Lait de soja', ar: 'حليب الصويا', en: 'Soy Milk' },
    'coconut milk': { fr: 'Lait de coco', ar: 'حليب جوز الهند', en: 'Coconut Milk' },
    'lait de coco': { fr: 'Lait de coco', ar: 'حليب جوز الهند', en: 'Coconut Milk' },

    'vanilla': { fr: 'Vanille', ar: 'فانيلا', en: 'Vanilla' },
    'vanille': { fr: 'Vanille', ar: 'فانيلا', en: 'Vanilla' },
    'hazelnut': { fr: 'Noisette', ar: 'بندق', en: 'Hazelnut' },
    'noisette': { fr: 'Noisette', ar: 'بندق', en: 'Hazelnut' },
    'caramel': { fr: 'Caramel', ar: 'كراميل', en: 'Caramel' },
    'salted caramel': { fr: 'Caramel beurre salé', ar: 'كراميل مملح', en: 'Salted Caramel' },
    'caramel beurre salé': { fr: 'Caramel beurre salé', ar: 'كراميل مملح', en: 'Salted Caramel' },
    'sugar free vanilla': { fr: 'Vanille sans sucre', ar: 'فانيلا بدون سكر', en: 'Sugar Free Vanilla' },
    'sugar free hazelnut': { fr: 'Noisette sans sucre', ar: 'بندق بدون سكر', en: 'Sugar Free Hazelnut' },
    'sugar free caramel': { fr: 'Caramel sans sucre', ar: 'كراميل بدون سكر', en: 'Sugar Free Caramel' },

    'fried eggs': { fr: 'Œufs au plat', ar: 'بيض عيون', en: 'Fried eggs' },
    'œufs au plat': { fr: 'Œufs au plat', ar: 'بيض عيون', en: 'Fried eggs' },
    'oeufs au plat': { fr: 'Œufs au plat', ar: 'بيض عيون', en: 'Fried eggs' },
    'scrambled eggs': { fr: 'Œufs brouillés', ar: 'بيض مخفوق', en: 'Scrambled eggs' },
    'œufs brouillés': { fr: 'Œufs brouillés', ar: 'بيض مخفوق', en: 'Scrambled eggs' },
    'oeufs brouilles': { fr: 'Œufs brouillés', ar: 'بيض مخفوق', en: 'Scrambled eggs' },
    'poached eggs': { fr: 'Œufs pochés', ar: 'بيض بوشيه', en: 'Poached eggs' },
    'omlet': { fr: 'Omelette', ar: 'أومليت', en: 'Omelette' },
    'omelette': { fr: 'Omelette', ar: 'أومليت', en: 'Omelette' },

    'normal': { fr: 'Nature', ar: 'عادي', en: 'Normal' },
    'nature': { fr: 'Nature', ar: 'عادي', en: 'Normal' },
    'plain': { fr: 'Nature', ar: 'عادي', en: 'Plain' },
    'herb': { fr: 'Fines herbes', ar: 'أعشاب منسمة', en: 'Herbs' },
    'herbs': { fr: 'Fines herbes', ar: 'أعشاب منسمة', en: 'Herbs' },
    'fines herbes': { fr: 'Fines herbes', ar: 'أعشاب منسمة', en: 'Herbs' },
    'fromage': { fr: 'Fromage', ar: 'جبن', en: 'Cheese' },
    'cheese': { fr: 'Fromage', ar: 'جبن', en: 'Cheese' },
    'dried meat (khlii)': { fr: 'Khlii (viande séchée)', ar: 'خليع مغربي', en: 'Khlii (Dried meat)' },
    'khlii': { fr: 'Khlii', ar: 'خليع مغربي', en: 'Khlii' },
    'khlea': { fr: 'Khlii', ar: 'خليع مغربي', en: 'Khlii' },
    'salmon': { fr: 'Saumon', ar: 'سلمون', en: 'Salmon' },
    'saumon': { fr: 'Saumon', ar: 'سلمون', en: 'Salmon' },
    'smoked salmon': { fr: 'Saumon fumé', ar: 'سلمون مدخن', en: 'Smoked Salmon' },
    'saumon fumé': { fr: 'Saumon fumé', ar: 'سلمون مدخن', en: 'Smoked Salmon' },

    'pancakes chocolat': { fr: 'Pancakes Chocolat', ar: 'بان كيك بالشوكولاتة', en: 'Chocolate Pancakes' },
    'pancakes chocolate': { fr: 'Pancakes Chocolat', ar: 'بان كيك بالشوكولاتة', en: 'Chocolate Pancakes' },
    'pancakes fruits rouges': { fr: 'Pancakes Fruits rouges', ar: 'بان كيك بالفواكه الحمراء', en: 'Red Fruits Pancakes' },
    'pancakes red fruits': { fr: 'Pancakes Fruits rouges', ar: 'بان كيك بالفواكه الحمراء', en: 'Red Fruits Pancakes' },
    'pancakes berries': { fr: 'Pancakes Fruits rouges', ar: 'بان كيك بالفواكه الحمراء', en: 'Berry Pancakes' },

    'granola & fruit': { fr: 'Granola & Fruits frais', ar: 'غرانولا و فواكه', en: 'Granola & Fruit' },
    'granola & fruits': { fr: 'Granola & Fruits frais', ar: 'غرانولا و فواكه', en: 'Granola & Fruit' },
    'chia bowl': { fr: 'Chia Bowl', ar: 'بودينغ بذور الشيا', en: 'Chia Bowl' },
    'acai bowl': { fr: 'Açaí Bowl', ar: 'وعاء أساي', en: 'Acai Bowl' },

    // ─── Articles Fréquents (Café & Cuisine) ───
    'café au lait': { fr: 'Café au lait', ar: 'قهوة بالحليب', en: 'Coffee with Milk' },
    'coffee with milk': { fr: 'Café au lait', ar: 'قهوة بالحليب', en: 'Coffee with Milk' },
    'قهوة بالحليب': { fr: 'Café au lait', ar: 'قهوة بالحليب', en: 'Coffee with Milk' },
    'café noir': { fr: 'Café noir', ar: 'قهوة سوداء', en: 'Black Coffee' },
    'black coffee': { fr: 'Café noir', ar: 'قهوة سوداء', en: 'Black Coffee' },
    'espresso': { fr: 'Espresso', ar: 'إسبريسو', en: 'Espresso' },
    'double espresso': { fr: 'Double Espresso', ar: 'دبل إسبريسو', en: 'Double Espresso' },
    'americano': { fr: 'Americano', ar: 'أمريكانو', en: 'Americano' },
    'iced americano': { fr: 'Americano Glacé', ar: 'أمريكانو مثلج', en: 'Iced Americano' },
    'latte': { fr: 'Latte', ar: 'لاتيه', en: 'Latte' },
    'iced latte': { fr: 'Latte Glacé', ar: 'لاتيه مثلج', en: 'Iced Latte' },
    'caramel latte': { fr: 'Latte Caramel', ar: 'كراميل لاتيه', en: 'Caramel Latte' },
    'salted caramel latte': { fr: 'Latte Caramel Beurre Salé', ar: 'كراميل لاتيه مملح', en: 'Salted Caramel Latte' },
    'vanilla latte': { fr: 'Latte Vanille', ar: 'فانيلا لاتيه', en: 'Vanilla Latte' },
    'spanish latte': { fr: 'Latte Espagnol', ar: 'لاتيه إسباني', en: 'Spanish Latte' },
    'cappuccino': { fr: 'Cappuccino', ar: 'كابتشينو', en: 'Cappuccino' },
    'flat white': { fr: 'Flat White', ar: 'فلات وايت', en: 'Flat White' },
    'cortado': { fr: 'Cortado', ar: 'كورتادو', en: 'Cortado' },
    'macchiato': { fr: 'Macchiato', ar: 'ماكياتو', en: 'Macchiato' },
    'mocha': { fr: 'Mocha', ar: 'موكا', en: 'Mocha' },
    'hot chocolate': { fr: 'Chocolat Chaud', ar: 'شوكولاتة ساخنة', en: 'Hot Chocolate' },
    'chocolat chaud': { fr: 'Chocolat Chaud', ar: 'شوكولاتة ساخنة', en: 'Hot Chocolate' },
    'matcha latte': { fr: 'Matcha Latte', ar: 'ماتشا لاتيه', en: 'Matcha Latte' },
    'coconut matcha': { fr: 'Matcha Coco', ar: 'ماتشا جوز الهند', en: 'Coconut Matcha' },
    'matcha coco': { fr: 'Matcha Coco', ar: 'ماتشا جوز الهند', en: 'Coconut Matcha' },
    'mango matcha': { fr: 'Matcha Mangue', ar: 'ماتشا مانجو', en: 'Mango Matcha' },
    'matcha mangue': { fr: 'Matcha Mangue', ar: 'ماتشا مانجو', en: 'Mango Matcha' },
    'strawberry matcha': { fr: 'Matcha Fraise', ar: 'ماتشا فراولة', en: 'Strawberry Matcha' },
    'matcha fraise': { fr: 'Matcha Fraise', ar: 'ماتشا فراولة', en: 'Strawberry Matcha' },
    'fresh orange juice': { fr: 'Jus d’orange frais', ar: 'عصير برتقال طازج', en: 'Fresh Orange Juice' },
    'jus d’orange frais': { fr: 'Jus d’orange frais', ar: 'عصير برتقال طازج', en: 'Fresh Orange Juice' },
    'lemon mint': { fr: 'Citronnade Menthe', ar: 'عصير ليمون بالنعناع', en: 'Lemon Mint Juice' },
    'citronnade menthe': { fr: 'Citronnade Menthe', ar: 'عصير ليمون بالنعناع', en: 'Lemon Mint Juice' },
    'avocado toast': { fr: 'Toast Avocat', ar: 'توست أفوكادو', en: 'Avocado Toast' },
    'toast avocat': { fr: 'Toast Avocat', ar: 'توست أفوكادو', en: 'Avocado Toast' },
    'french toast': { fr: 'Pain Perdu', ar: 'فرنش توست', en: 'French Toast' },
    'pain perdu': { fr: 'Pain Perdu', ar: 'فرنش توست', en: 'French Toast' },
    'croissant': { fr: 'Croissant', ar: 'كرواسون', en: 'Croissant' },
    'pain au chocolat': { fr: 'Pain au Chocolat', ar: 'بتي بان بالشوكولاتة', en: 'Chocolate Croissant' },
    'waffles': { fr: 'Gaufres', ar: 'وافل', en: 'Waffles' },
    'gaufres': { fr: 'Gaufres', ar: 'وافل', en: 'Waffles' },
    'cheesecake': { fr: 'Cheesecake', ar: 'تشيز كيك', en: 'Cheesecake' },
    'tiramisu': { fr: 'Tiramisu', ar: 'تيراميسو', en: 'Tiramisu' },
    'cookies': { fr: 'Cookies', ar: 'كوكيز', en: 'Cookies' },
    'cookie': { fr: 'Cookie', ar: 'كوكيز', en: 'Cookie' },
    'brownie': { fr: 'Brownie', ar: 'براوني', en: 'Brownie' },
  };

  /* ───────────────── utilitaires ───────────────── */
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function canonical(l) {
    const raw = String(l || '').trim().toLowerCase().replace(/_/g, '-');
    if (raw === 'zh-hans' || raw === 'zh-cn' || raw === 'zh-sg') return 'zh-Hans';
    if (raw === 'zh-hant' || raw === 'zh-tw' || raw === 'zh-hk' || raw === 'zh-mo') return 'zh-Hant';
    const base = raw.split('-')[0];
    return ALL_LANGS.find((code) => code.toLowerCase() === raw) || ALL_LANGS.find((code) => code.toLowerCase() === base) || null;
  }
  function asLang(l) { return canonical(l); }
  function langs(d) {
    const out = CORE.slice();
    const raw = d && Array.isArray(d.langs) ? d.langs : [];
    raw.forEach((value) => { const code = canonical(value); if (code && !out.includes(code) && out.length < 24) out.push(code); });
    return out;
  }
  function isRtl(l) { const code = canonical(l); return !!code && RTL.includes(code); }
  function autoPick(available, browserLangs) {
    const allowed = langs({ langs: available });
    for (const value of (Array.isArray(browserLangs) ? browserLangs : [])) {
      const code = canonical(value);
      if (code && allowed.includes(code)) return code;
    }
    return allowed[0] || 'fr';
  }
  function activeLang() {
    try {
      if (window.KiwiI18n && typeof window.KiwiI18n.getLang === 'function') {
        const l = asLang(window.KiwiI18n.getLang()); if (l) return l;
      }
      if (window.KiwiCaisseLang && typeof window.KiwiCaisseLang.get === 'function') {
        const l = asLang(window.KiwiCaisseLang.get()); if (l) return l;
      }
      const ls = asLang(localStorage.getItem('kiwiLang')) || asLang(localStorage.getItem('kiwiCaisseLang'));
      if (ls) return ls;
      const hl = asLang(document.documentElement.lang); if (hl) return hl;
    } catch (_) {}
    return 'fr';
  }
  /* djb2 → base36. La même fonction est inlinée dans kiwi-order.html et
     OrderPro.html : une empreinte qui diverge rendrait toute traduction
     « périmée » sur la page client. */
  function hash(name, desc) {
    const s = String(name == null ? '' : name).trim() + '\u001f' + String(desc == null ? '' : desc).trim();
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  const ARABIC = /[؀-ۿ]/;
  function hasArabic(s) { return ARABIC.test(String(s || '')); }

  /* ───────────────── résolution ───────────────── */
  function entry(e, lang) {
    if (!e || !e.i18n || typeof e.i18n !== 'object') return null;
    const x = e.i18n[lang];
    return (x && typeof x === 'object' && x.name) ? x : null;
  }
  /* Fraîche = corrigée à la main, ou produite pour le texte source actuel. */
  function fresh(e, lang) {
    const x = entry(e, lang);
    if (!x) return false;
    if (x.m) return true;
    return x.h === hash(e.name, e.desc);
  }
  function status(e, lang) {
    const x = entry(e, lang);
    if (!x) return 'missing';
    if (x.m) return 'manual';
    return x.h === hash(e.name, e.desc) ? 'ok' : 'stale';
  }

  /* Index libellé canonique → entité, pour t(str). */
  let INDEX = new Map();
  function register(e) {
    if (!e || !e.name) return;
    const k = norm(e.name);
    if (k && !INDEX.has(k)) INDEX.set(k, e);
  }
  function index(d) {
    INDEX = new Map();
    if (!d) return INDEX;
    const cats = Array.isArray(d.cats) ? d.cats : [];
    const items = Array.isArray(d) ? d : (Array.isArray(d.items) ? d.items : []);
    const extra = Array.isArray(d.formulaItems) ? d.formulaItems : [];
    const opts = Array.isArray(d.opts) ? d.opts : [];
    cats.forEach((c) => { register(c); (c.sub || []).forEach(register); });
    items.forEach(register); extra.forEach(register);
    opts.forEach((g) => { register(g); (g.choices || []).forEach(register); });
    return INDEX;
  }

  function translate(str, lang) {
    if (!str || typeof str !== 'string') return str;
    const target = asLang(lang) || activeLang();
    const clean = str.trim();
    if (!clean) return str;
    const e = INDEX.get(norm(clean));
    if (e && fresh(e, target)) return e.i18n[target].name;
    const k = norm(clean);
    const dict = DICTIONARY[k] || DICTIONARY[k.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()];
    if (dict && dict[target]) return dict[target];
    return clean;
  }
  function name(e, lang) {
    if (!e) return '';
    const target = asLang(lang) || activeLang();
    if (fresh(e, target)) return e.i18n[target].name;
    return translate(String(e.name || ''), target);
  }
  function desc(e, lang) {
    if (!e) return '';
    const target = asLang(lang) || activeLang();
    if (fresh(e, target) && e.i18n[target].desc != null) return String(e.i18n[target].desc);
    return String(e.desc || '');
  }
  /* Copies localisées — le canonique reste lisible dans _src. */
  function localizeItem(it, lang) {
    if (!it) return it;
    const l = asLang(lang) || activeLang();
    return Object.assign({}, it, { name: name(it, l), desc: desc(it, l), _src: { name: it.name, desc: it.desc || '' } });
  }
  function localizeCategory(c, lang) {
    if (!c) return c;
    const l = asLang(lang) || activeLang();
    return Object.assign({}, c, { name: name(c, l), _src: { name: c.name },
      sub: (c.sub || []).map((s) => Object.assign({}, s, { name: name(s, l), _src: { name: s.name } })) });
  }
  function localizeOptGroup(g, lang) {
    if (!g) return g;
    const l = asLang(lang) || activeLang();
    return Object.assign({}, g, { name: name(g, l), _src: { name: g.name },
      choices: (g.choices || []).map((c) => Object.assign({}, c, { name: name(c, l), _src: { name: c.name } })) });
  }
  function localizeDataset(d, lang) {
    if (!d || typeof d !== 'object') return d;
    const l = asLang(lang) || activeLang();
    return Object.assign({}, d, {
      cats: (d.cats || []).map((c) => localizeCategory(c, l)),
      items: (d.items || []).map((it) => localizeItem(it, l)),
      opts: (d.opts || []).map((g) => localizeOptGroup(g, l)),
    });
  }

  /* ───────────────── ce qui reste à traduire ─────────────────
     needs(d, langs, {force}) → { fr: {cats, items, opts, count}, ar: …, en: … }
     au format exact qu'attend POST /api/ai/menu-translate (identifiants +
     libellés), en n'envoyant QUE les entrées sans traduction fraîche. `force`
     renvoie tout sauf les corrections manuelles ; `force:'all'` tout. */
  function wants(e, lang, force) {
    if (!e || !e.name) return false;
    if (force === 'all') return true;
    const x = entry(e, lang);
    if (x && x.m) return false;
    if (force) return true;
    return !fresh(e, lang);
  }
  function needs(d, langs, opts) {
    const o = opts || {};
    const force = o.force || false;
    const out = {};
    (langs || LANGS).forEach((lang) => {
      if (!asLang(lang)) return;
      const cats = [];
      ((d && d.cats) || []).forEach((c) => {
        if (!c || !c.id) return;
        const sub = (c.sub || []).filter((s) => s && s.id && wants(s, lang, force)).map((s) => ({ id: s.id, name: s.name }));
        if (wants(c, lang, force) || sub.length) cats.push({ id: c.id, name: c.name, sub });
      });
      const items = ((d && d.items) || []).filter((it) => it && it.id && !it.archived && wants(it, lang, force))
        .map((it) => ({ id: it.id, name: it.name, desc: it.desc || '' }));
      const optsOut = [];
      ((d && d.opts) || []).forEach((g) => {
        if (!g || !g.id) return;
        const choices = (g.choices || []).filter((c) => c && c.id && wants(c, lang, force)).map((c) => ({ id: c.id, name: c.name }));
        if (wants(g, lang, force) || choices.length) optsOut.push({ id: g.id, name: g.name, choices });
      });
      const count = cats.reduce((n, c) => n + 1 + c.sub.length, 0) + items.length + optsOut.reduce((n, g) => n + 1 + g.choices.length, 0);
      out[lang] = { cats, items, opts: optsOut, count };
    });
    return out;
  }

  /* apply(d, lang, res, {manual, force}) — écrit les traductions reçues dans
     le dataset (muté, à appeler dans store.update) et renvoie le nombre écrit.
     Une correction manuelle n'est jamais écrasée par la machine. Une « traduction »
     vers l'arabe sans une seule lettre arabe est ignorée (le modèle a rendu le
     texte inchangé : mieux vaut la laisser manquante, elle sera retentée). */
  function write(e, lang, name_, desc_, o) {
    if (!e || !name_) return false;
    const cur = entry(e, lang);
    if (cur && cur.m && !o.manual && o.force !== 'all') return false;
    const n = String(name_).trim().slice(0, 120);
    if (!n) return false;
    if (!o.manual && lang === 'ar' && !hasArabic(n) && !hasArabic(e.name)) return false;
    if (!e.i18n || typeof e.i18n !== 'object') e.i18n = {};
    const x = { name: n, h: hash(e.name, e.desc) };
    if (desc_ != null && e.desc !== undefined) x.desc = String(desc_).trim().slice(0, 400);
    if (o.manual) x.m = 1;
    e.i18n[lang] = x;
    return true;
  }
  function apply(d, lang, res, opts) {
    const o = opts || {};
    if (!d || !asLang(lang) || !res) return 0;
    let n = 0;
    const byId = (arr) => new Map((arr || []).filter((x) => x && x.id).map((x) => [String(x.id), x]));
    const rc = byId(res.cats);
    (d.cats || []).forEach((c) => {
      const t = rc.get(String(c.id)); if (!t) return;
      if (write(c, lang, t.name, null, o)) n++;
      const rs = byId(t.sub);
      (c.sub || []).forEach((s) => { const ts = rs.get(String(s.id)); if (ts && write(s, lang, ts.name, null, o)) n++; });
    });
    const ri = byId(res.items);
    (d.items || []).forEach((it) => { const t = ri.get(String(it.id)); if (t && write(it, lang, t.name, t.desc, o)) n++; });
    const ro = byId(res.opts);
    (d.opts || []).forEach((g) => {
      const t = ro.get(String(g.id)); if (!t) return;
      if (write(g, lang, t.name, null, o)) n++;
      const rch = byId(t.choices);
      (g.choices || []).forEach((c) => { const tc = rch.get(String(c.id)); if (tc && write(c, lang, tc.name, null, o)) n++; });
    });
    return n;
  }
  /* Une correction du patron sur UNE entité. Vide = retirer la traduction. */
  function setManual(e, lang, name_, desc_) {
    if (!e || !asLang(lang)) return false;
    if (!String(name_ || '').trim()) { if (e.i18n) { delete e.i18n[lang]; if (!Object.keys(e.i18n).length) delete e.i18n; } return true; }
    return write(e, lang, name_, desc_, { manual: true });
  }
  function clear(d, lang, keepManual) {
    const targets = asLang(lang) ? [asLang(lang)] : langs(d);
    const each = (e) => {
      if (!e || !e.i18n) return;
      targets.forEach((l) => { const x = e.i18n[l]; if (x && !(keepManual && x.m)) delete e.i18n[l]; });
      if (!Object.keys(e.i18n).length) delete e.i18n;
    };
    ((d && d.cats) || []).forEach((c) => { each(c); (c.sub || []).forEach(each); });
    ((d && d.items) || []).forEach(each);
    ((d && d.opts) || []).forEach((g) => { each(g); (g.choices || []).forEach(each); });
  }
  /* Tableau de bord : combien d'entités par statut et par langue. */
  function summary(d, requested) {
    const out = {};
    const targets = Array.isArray(requested) ? requested.map(asLang).filter(Boolean) : langs(d);
    targets.forEach((l) => { out[l] = { ok: 0, stale: 0, missing: 0, manual: 0, total: 0 }; });
    const each = (e) => { if (!e || !e.name) return; targets.forEach((l) => { const s = status(e, l); out[l][s]++; out[l].total++; }); };
    ((d && d.cats) || []).forEach((c) => { each(c); (c.sub || []).forEach(each); });
    ((d && d.items) || []).filter((it) => it && !it.archived).forEach(each);
    ((d && d.opts) || []).forEach((g) => { each(g); (g.choices || []).forEach(each); });
    return out;
  }

  window.KiwiMenuI18n = {
    LANGS: LANGS.slice(),
    CORE: CORE.slice(), EXTRA: EXTRA.slice(), RTL: RTL.slice(), NAMES,
    langs, asLang, rtl: isRtl, autoPick,
    lang: activeLang,
    hash, fresh, status, hasArabic,
    t: translate, name, desc,
    item: localizeItem, category: localizeCategory, optGroup: localizeOptGroup, dataset: localizeDataset,
    index, needs, apply, setManual, clear, summary,
    DICT: DICTIONARY,
  };
})();
