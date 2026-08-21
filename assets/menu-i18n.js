/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · MENU I18N — window.KiwiMenuI18n
 * ---------------------------------------------------------------------------
 * Résolution multilingue automatique et dynamique de la carte restaurant :
 * articles, descriptions, sections, sous-catégories, groupes de modificateurs
 * et choix d'options vers Français (fr), Arabe (ar) et Anglais (en).
 *
 * Dès qu'un utilisateur change de langue sur le dashboard, la caisse ou l'app
 * serveur, la carte s'adapte instantanément et directement.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const DICTIONARY = {
    // ─── Catégories & Sections ───
    'hot drinks': { fr: 'Boissons chaudes', ar: 'مشروبات ساخنة', en: 'Hot Drinks' },
    'boissons chaudes': { fr: 'Boissons chaudes', ar: 'مشروبات ساخنة', en: 'Hot Drinks' },
    'مشروبات ساخنة': { fr: 'Boissons chaudes', ar: 'مشروبات ساخنة', en: 'Hot Drinks' },

    'cold drinks': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },
    'boissons fraîches': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },
    'boissons fraiches': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },
    'مشروبات باردة': { fr: 'Boissons fraîches', ar: 'مشروبات باردة', en: 'Cold Drinks' },

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

  const WORDS = {
    fr: {
      'hot': 'chaud', 'cold': 'frais', 'iced': 'glacé', 'ice': 'glacé',
      'milk': 'lait', 'flavour': 'saveur', 'flavor': 'saveur',
      'eggs': 'œufs', 'fried': 'au plat', 'scrambled': 'brouillés',
      'sweet': 'douceur', 'fruits': 'fruits', 'red fruits': 'fruits rouges',
      'chocolate': 'chocolat', 'vanilla': 'vanille', 'caramel': 'caramel',
      'salted': 'salé', 'hazelnut': 'noisette', 'almond': 'amande',
      'coconut': 'coco', 'sugar free': 'sans sucre', 'fresh': 'frais',
      'juice': 'jus', 'water': 'eau', 'bread': 'pain', 'cheese': 'fromage',
    },
    ar: {
      'hot': 'ساخن', 'cold': 'بارد', 'iced': 'مثلج', 'ice': 'مثلج',
      'milk': 'حليب', 'flavour': 'نكهة', 'flavor': 'نكهة',
      'eggs': 'بيض', 'fried': 'عيون', 'scrambled': 'مخفوق',
      'sweet': 'حلوى', 'fruits': 'فواكه', 'red fruits': 'فواكه حمراء',
      'chocolate': 'شوكولاتة', 'vanilla': 'فانيلا', 'caramel': 'كراميل',
      'salted': 'مملح', 'hazelnut': 'بندق', 'almond': 'لوز',
      'coconut': 'جوز الهند', 'sugar free': 'بدون سكر', 'fresh': 'طازج',
      'juice': 'عصير', 'water': 'ماء', 'bread': 'خبز', 'cheese': 'جبن',
    },
    en: {
      'chaud': 'Hot', 'glacé': 'Iced', 'frais': 'Fresh',
      'lait': 'Milk', 'saveur': 'Flavour', 'œufs': 'Eggs',
      'chocolat': 'Chocolate', 'vanille': 'Vanilla',
      'noisette': 'Hazelnut', 'amande': 'Almond', 'coco': 'Coconut',
      'sans sucre': 'Sugar Free', 'jus': 'Juice', 'pain': 'Bread', 'fromage': 'Cheese',
    }
  };

  function activeLang() {
    try {
      if (window.KiwiI18n && typeof window.KiwiI18n.getLang === 'function') {
        const l = window.KiwiI18n.getLang();
        if (l === 'ar' || l === 'en') return l;
      }
      const ls = localStorage.getItem('kiwiLang') || localStorage.getItem('kiwiCaisseLang');
      if (ls === 'ar' || ls === 'en') return ls;
      const htmlLang = document.documentElement.lang;
      if (htmlLang === 'ar' || htmlLang === 'en') return htmlLang;
    } catch (_) {}
    return 'fr';
  }

  function norm(str) {
    return String(str || '').trim().toLowerCase();
  }

  function translate(str, lang) {
    if (!str || typeof str !== 'string') return str;
    const target = lang || activeLang();
    const clean = str.trim();
    if (!clean) return str;

    const key = norm(clean);
    const entry = DICTIONARY[key];
    if (entry && entry[target]) {
      return entry[target];
    }

    // Lookup with punctuation/parentheses handling (e.g. "Dried Meat (Khlii)" -> "خليع مغربي")
    const simplifiedKey = key.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (DICTIONARY[simplifiedKey] && DICTIONARY[simplifiedKey][target]) {
      return DICTIONARY[simplifiedKey][target];
    }

    // Partial compound replacement if available
    const wordDict = WORDS[target];
    if (wordDict) {
      let out = clean;
      let changed = false;
      for (const [w, repl] of Object.entries(wordDict)) {
        const regex = new RegExp(`\\b${w}\\b`, 'gi');
        if (regex.test(out)) {
          out = out.replace(regex, repl);
          changed = true;
        }
      }
      if (changed) return out;
    }

    return clean;
  }

  function translateItem(it, lang) {
    if (!it) return it;
    const l = lang || activeLang();
    return Object.assign({}, it, {
      name: translate(it.name, l),
      desc: it.desc ? translate(it.desc, l) : (it.desc || ''),
    });
  }

  function translateCategory(cat, lang) {
    if (!cat) return cat;
    const l = lang || activeLang();
    return Object.assign({}, cat, {
      name: translate(cat.name, l),
      sub: (cat.sub || []).map(s => Object.assign({}, s, { name: translate(s.name, l) })),
    });
  }

  function translateOptGroup(g, lang) {
    if (!g) return g;
    const l = lang || activeLang();
    return Object.assign({}, g, {
      name: translate(g.name, l),
      choices: (g.choices || []).map(c => Object.assign({}, c, { name: translate(c.name, l) })),
    });
  }

  function translateDataset(d, lang) {
    if (!d || typeof d !== 'object') return d;
    const l = lang || activeLang();
    return {
      cats: (d.cats || []).map(c => translateCategory(c, l)),
      items: (d.items || []).map(it => translateItem(it, l)),
      opts: (d.opts || []).map(g => translateOptGroup(g, l)),
      stations: d.stations || [],
    };
  }

  window.KiwiMenuI18n = {
    t: translate,
    lang: activeLang,
    item: translateItem,
    category: translateCategory,
    optGroup: translateOptGroup,
    dataset: translateDataset,
    DICT: DICTIONARY,
  };
})();
