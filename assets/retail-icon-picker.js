/* La photo d'un article à la caisse, choisie dans la fiche produit du tableau
   de bord (owner, 28 octobre 2026 : « quand un commerçant saisit un produit,
   a-t-il des suggestions ? »).

   La caisse boutique ou Maison dessine chaque article avec une photo détourée
   qu'elle choisit d'après le nom (assets/retail-photos.js). Ce module montre ce
   choix pendant la saisie, sous la carte d'aperçu : « À la caisse : Djellaba
   femme, d'après le nom ». La photo suit le nom tant que le commerçant n'en
   a pas touché une autre ; une photo touchée reste (`artPicked`), et « Laisser
   le nom choisir » rend la main au nom. La recherche connaît les mots du
   métier (« zarbia », « berrad », « bdaia »), pas seulement les libellés.

   Branché par une ligne de assets/pages-pro-boutique.js (import dynamique : le
   fichier est plafonné, la fonctionnalité vit ici). L'état part avec la fiche
   par `root.__kiwiTillPhoto = { art, artPicked }`, que _bqxPfRead recopie. */
import { PHOTO_KEYS, keyForName, photoKey, photoFile, photoSrc, nameTokens, wordsOf } from './retail-photos.js?v=5';

/* [fr, en, ar] pour chaque pièce. */
const NAMES = {
  tshirt: ['T-shirt', 'T-shirt', 'تيشيرت'], polo: ['Polo', 'Polo shirt', 'بولو'], chemise: ['Chemise', 'Shirt', 'قميص'],
  debardeur: ['Débardeur', 'Tank top', 'قميص بلا أكمام'], pull: ['Pull', 'Sweater', 'كنزة'], sweat: ['Sweat à capuche', 'Hoodie', 'هودي'],
  tunique: ['Tunique', 'Tunic', 'تونيك'], kimono: ['Kimono', 'Kimono', 'كيمونو'],
  pantalon: ['Pantalon', 'Trousers', 'سروال'], jean: ['Jean', 'Jeans', 'جينز'], short: ['Short', 'Shorts', 'شورت'],
  jupe: ['Jupe', 'Skirt', 'تنورة'], sarwal: ['Sarwal', 'Sarwal trousers', 'سروال تقليدي'],
  robe: ['Robe', 'Dress', 'فستان'], combinaison: ['Combinaison', 'Jumpsuit', 'جمبسوت'], ensemble: ['Ensemble', 'Two-piece set', 'طقم'],
  ensemble_jean: ['Ensemble en jean', 'Denim set', 'طقم جينز'], survetement: ['Survêtement', 'Tracksuit', 'بدلة رياضية'],
  costume: ['Costume', 'Suit', 'بدلة'],
  veste: ['Veste', 'Jacket', 'سترة'], manteau: ['Manteau', 'Coat', 'معطف'], trench: ['Trench', 'Trench coat', 'معطف ترانش'],
  cape: ['Cape', 'Cape', 'كاب'], doudoune: ['Doudoune', 'Puffer jacket', 'جاكيت منفوخ'], gilet_doudoune: ['Gilet doudoune', 'Puffer vest', 'صدرية منفوخة'],
  caftan: ['Caftan', 'Kaftan', 'قفطان'], caftan_perle: ['Caftan perlé', 'Beaded kaftan', 'قفطان مطرز بالجوهر'],
  caftan_jawhara: ['Caftan brodé', 'Embroidered kaftan', 'قفطان مطرز'], caftan_ete: ["Caftan d'été", 'Summer kaftan', 'قفطان صيفي'],
  caftan_velours: ['Caftan velours', 'Velvet kaftan', 'قفطان مخمل'], caftan_enfant: ['Caftan enfant', "Children's kaftan", 'قفطان أطفال'],
  takchita: ['Takchita', 'Takchita', 'تكشيطة'], takchita_mariage: ['Takchita de mariée', 'Bridal takchita', 'تكشيطة العروس'],
  djellaba: ['Djellaba', 'Djellaba', 'جلابة'], djellaba_femme: ['Djellaba femme', "Women's djellaba", 'جلابة نسائية'],
  djellaba_enfant: ['Djellaba enfant', "Children's djellaba", 'جلابة أطفال'], gandoura: ['Gandoura', 'Gandoura', 'قندورة'],
  jabador: ['Jabador', 'Jabador', 'جابادور'], selham: ['Selham', 'Burnous', 'سلهام'], gilet_brode: ['Gilet brodé', 'Embroidered waistcoat', 'بدعية'],
  chech: ['Chèche', 'Chèche turban', 'شاش'], melhfa: ['Melhfa', 'Melhfa', 'ملحفة'],
  abaya: ['Abaya', 'Abaya', 'عباية'], hijab: ['Hijab', 'Hijab', 'حجاب'], burkini: ['Burkini', 'Burkini', 'بوركيني'],
  maillot: ['Maillot de bain', 'Swimsuit', 'لباس سباحة'],
  chaussures: ['Chaussures', 'Shoes', 'أحذية'], basket: ['Baskets', 'Sneakers', 'حذاء رياضي'], botte: ['Bottes', 'Boots', 'بوط'],
  sandale: ['Sandales', 'Sandals', 'صندل'], babouche: ['Babouches', 'Babouches', 'بلغة'], babouche_brodee: ['Babouches brodées', 'Embroidered babouches', 'بلغة مطرزة'],
  cherbil: ['Cherbil', 'Cherbil slippers', 'شربيل'], babouche_enfant: ['Babouches enfant', "Children's babouches", 'بلغة أطفال'],
  chaussettes: ['Chaussettes', 'Socks', 'جوارب'],
  chapeau: ['Chapeau', 'Hat', 'قبعة'], casquette: ['Casquette', 'Cap', 'كاسكيط'], bonnet: ['Bonnet', 'Beanie', 'طاقية'], tarbouche: ['Tarbouche', 'Fez', 'طربوش'],
  ceinture: ['Ceinture', 'Belt', 'حزام'], mdamma: ['Mdamma', 'Mdamma belt', 'مضمة'], cravate: ['Cravate', 'Tie', 'ربطة عنق'],
  echarpe: ['Écharpe', 'Scarf', 'وشاح'], foulard: ['Foulard', 'Silk scarf', 'فولار'], chale: ['Châle', 'Shawl', 'شال'], gants: ['Gants', 'Gloves', 'قفازات'],
  lunettes: ['Lunettes', 'Glasses', 'نظارات'], montre: ['Montre', 'Watch', 'ساعة'], bracelet: ['Bracelet', 'Bracelet', 'سوار'], bague: ['Bague', 'Ring', 'خاتم'],
  collier: ['Collier', 'Necklace', 'قلادة'], boucles: ["Boucles d'oreilles", 'Earrings', 'أقراط'], broche: ['Broche', 'Brooch', 'بروش'],
  khlala: ['Khlala', 'Berber fibula', 'خلالة'], parfum: ['Parfum', 'Perfume', 'عطر'],
  sac_main: ['Sac à main', 'Handbag', 'حقيبة يد'], sac: ['Sac', 'Bag', 'حقيبة'], sac_dos: ['Sac à dos', 'Backpack', 'حقيبة ظهر'], cabas: ['Cabas', 'Tote bag', 'قفة'],
  panier: ['Panier en doum', 'Doum basket', 'قفة دوم'], pochette: ['Pochette', 'Clutch', 'حقيبة صغيرة'], portefeuille: ['Portefeuille', 'Wallet', 'محفظة'],
  valise: ['Valise', 'Suitcase', 'حقيبة سفر'], parapluie: ['Parapluie', 'Umbrella', 'مظلة'],
  bougie: ['Bougie', 'Candle', 'شمعة'], diffuseur: ['Diffuseur', 'Diffuser', 'معطر'], diffuseur_voiture: ['Diffuseur voiture', 'Car diffuser', 'معطر سيارة'],
  coffret: ['Coffret', 'Gift box', 'علبة هدايا'], eteignoir: ['Éteignoir', 'Candle snuffer', 'مطفأة شموع'], coupe_meche: ['Coupe-mèche', 'Wick trimmer', 'مقص الفتيل'],
  cloche: ['Cloche', 'Glass dome', 'قبة زجاجية'], bougeoir: ['Bougeoir', 'Candle holder', 'شمعدان'], bkhour: ['Bkhour', 'Bakhoor incense', 'بخور'],
  assiette: ['Assiette', 'Plate', 'صحن'], bol: ['Bol', 'Bowl', 'زلافة'], tasse: ['Tasse', 'Cup', 'فنجان'], verre: ['Verre', 'Glass', 'كأس'],
  verre_the: ['Verres à thé', 'Tea glasses', 'كيسان أتاي'], carafe: ['Carafe', 'Carafe', 'إبريق'], coupe: ['Coupe', 'Serving bowl', 'كأس تقديم'],
  plateau: ['Plateau', 'Tray', 'صينية'], theiere: ['Théière', 'Teapot', 'براد'], tajine: ['Tajine', 'Tagine', 'طاجين'], miroir: ['Miroir', 'Mirror', 'مرآة'],
  vase: ['Vase', 'Vase', 'مزهرية'], coussin: ['Coussin', 'Cushion', 'وسادة'], plaid: ['Plaid', 'Throw', 'غطاء'], tapis: ['Tapis', 'Rug', 'زربية'],
  pouf: ['Pouf', 'Pouf', 'بوف'], lanterne: ['Lanterne', 'Lantern', 'فانوس'],
  kessa: ['Kessa', 'Hammam glove', 'كيس الحمام'], ghassoul: ['Ghassoul', 'Ghassoul clay', 'غاسول'], savon_noir: ['Savon beldi', 'Black soap', 'صابون بلدي'],
  henne: ['Henné', 'Henna', 'حناء'], argan: ["Huile d'argan", 'Argan oil', 'زيت أركان'],
  tag: ['Étiquette', 'Label', 'بطاقة'], cintre: ['Cintre', 'Hanger', 'علاقة'],
  /* 30 octobre 2026 */
  mocassin: ['Mocassin', 'Loafer', 'حذاء موكاسان'],
  derby: ['Derby', 'Derby shoe', 'حذاء ديربي'],
  escarpin: ['Escarpin', 'Pump', 'حذاء بكعب'],
  ballerine: ['Ballerine', 'Ballet flat', 'حذاء باليرينا'],
  mule: ['Mule', 'Mule', 'حذاء مفتوح من الخلف'],
  espadrille: ['Espadrille', 'Espadrille', 'إسبادريل'],
  tong: ['Tong', 'Flip-flop', 'شبشب إصبع'],
  claquette: ['Claquette', 'Slide sandal', 'شبشب'],
  bottine: ['Bottine', 'Ankle boot', 'حذاء بوت قصير'],
  sabot: ['Sabot', 'Clog', 'قبقاب'],
  running: ['Chaussure de running', 'Running shoe', 'حذاء جري'],
  compensee: ['Compensée', 'Wedge', 'حذاء بكعب عريض'],
  chausson: ['Chausson', 'House slipper', 'خف منزلي'],
  chaussure_bebe: ['Chaussure bébé', 'Baby shoe', 'حذاء رضيع'],
  chemisier: ['Chemisier', 'Blouse', 'بلوزة'],
  top: ['Top', 'Top', 'توب'],
  crop_top: ['Crop top', 'Crop top', 'كروب توب'],
  body: ['Body', 'Bodysuit', 'بودي'],
  cardigan: ['Cardigan', 'Cardigan', 'كارديغان'],
  gilet: ['Gilet sans manches', 'Sleeveless vest', 'صدرية بلا أكمام'],
  col_roule: ['Col roulé', 'Turtleneck', 'كنزة بياقة عالية'],
  legging: ['Legging', 'Leggings', 'ليغينغ'],
  jogging: ['Jogging', 'Sweatpants', 'سروال رياضي'],
  salopette: ['Salopette', 'Dungarees', 'سالوبيت'],
  cargo: ['Cargo', 'Cargo trousers', 'سروال كارغو'],
  blazer: ['Blazer', 'Blazer', 'بليزر'],
  blouson_cuir: ['Blouson en cuir', 'Leather jacket', 'جاكيت جلد'],
  parka: ['Parka', 'Parka', 'باركا'],
  pyjama: ['Pyjama', 'Pyjamas', 'بيجامة'],
  chemise_nuit: ['Chemise de nuit', 'Nightgown', 'قميص نوم'],
  soutien_gorge: ['Soutien-gorge', 'Bra', 'حمالة صدر'],
  boxer: ['Boxer', 'Boxer briefs', 'بوكسر'],
  bikini: ['Bikini', 'Bikini', 'بيكيني'],
  peignoir: ['Peignoir', 'Bathrobe', 'برنس حمام'],
  khimar: ['Khimar', 'Khimar', 'خمار'],
  body_bebe: ['Body bébé', 'Baby bodysuit', 'بودي رضيع'],
  grenouillere: ['Grenouillère', 'Baby sleepsuit', 'بيجامة رضيع'],
  ensemble_enfant: ['Ensemble enfant', 'Children\'s outfit', 'طقم أطفال'],
  robe_fille: ['Robe fille', 'Girl\'s dress', 'فستان بنات'],
  noeud_papillon: ['Nœud papillon', 'Bow tie', 'ربطة عنق فراشة'],
  bretelles: ['Bretelles', 'Braces', 'حمالات سروال'],
  boutons_manchette: ['Boutons de manchette', 'Cufflinks', 'أزرار أكمام'],
  pochette_costume: ['Pochette de costume', 'Pocket square', 'منديل جيب'],
  chouchou: ['Chouchou', 'Scrunchie', 'ربطة شعر'],
  barrette: ['Barrette', 'Hair clip', 'مشبك شعر'],
  collants: ['Collants', 'Tights', 'جوارب طويلة'],
  pendentif: ['Pendentif', 'Pendant', 'قلادة بدلاية'],
  porte_cles: ['Porte-clés', 'Keyring', 'حامل مفاتيح'],
  sac_banane: ['Sac banane', 'Belt bag', 'حقيبة خصر'],
  sac_bandouliere: ['Sac bandoulière', 'Crossbody bag', 'حقيبة كتف'],
  cartable: ['Cartable', 'School bag', 'محفظة مدرسية'],
  porte_cartes: ['Porte-cartes', 'Card holder', 'حافظة بطاقات'],
  porte_documents: ['Porte-documents', 'Briefcase', 'حقيبة أوراق'],
  sac_sport: ['Sac de sport', 'Gym bag', 'حقيبة رياضة'],
  plat: ['Plat de service', 'Serving dish', 'طبق تقديم'],
  couvert: ['Ménagère', 'Cutlery set', 'طقم أدوات المائدة'],
  sucrier: ['Sucrier', 'Sugar bowl', 'سكرية'],
  seau: ['Seau à glace', 'Ice bucket', 'دلو ثلج'],
  photophore: ['Photophore', 'Candle holder', 'حامل شمعة زجاجي'],
  encens: ['Encens', 'Incense', 'بخور أعواد'],
  mijmar: ['Mijmar', 'Incense burner', 'مبخرة'],
  nappe: ['Nappe', 'Tablecloth', 'غطاء مائدة'],
  serviette: ['Serviette de table', 'Napkin', 'منديل مائدة'],
  set_table: ['Set de table', 'Placemat', 'مفرش طاولة فردي'],
  chemin_table: ['Chemin de table', 'Table runner', 'مفرش طاولة طويل'],
  saladier: ['Saladier', 'Salad bowl', 'سلطانية'],
  mug: ['Mug', 'Mug', 'كوب مج'],
  pichet: ['Pichet', 'Jug', 'إبريق'],
  saliere: ['Salière et poivrier', 'Salt and pepper', 'مملحة وفلفل'],
  corbeille: ['Corbeille à pain', 'Bread basket', 'سلة خبز'],
  cadre: ['Cadre photo', 'Photo frame', 'إطار صور'],
  boite: ['Boîte à bijoux', 'Jewellery box', 'علبة مجوهرات'],
  suspension: ['Suspension', 'Pendant lamp', 'ثريا'],
  lampe: ['Lampe', 'Lamp', 'مصباح'],
  tabouret: ['Tabouret', 'Stool', 'كرسي صغير'],
  gueridon: ['Guéridon', 'Side table', 'طاولة جانبية'],
  sous_assiette: ['Sous-assiette', 'Charger plate', 'صحن تحت الصحن'],
  assiette_creuse: ['Assiette creuse', 'Soup plate', 'صحن عميق'],
  assiette_dessert: ['Assiette à dessert', 'Dessert plate', 'صحن حلويات'],
  ramequin: ['Ramequin', 'Ramekin', 'وعاء صغير للفرن'],
  plat_four: ['Plat à four', 'Baking dish', 'صينية فرن'],
  soupiere: ['Soupière', 'Soup tureen', 'وعاء حساء'],
  sauciere: ['Saucière', 'Gravy boat', 'وعاء صلصة'],
  beurrier: ['Beurrier', 'Butter dish', 'علبة زبدة'],
  coquetier: ['Coquetier', 'Egg cup', 'حامل بيض'],
  presentoir: ['Présentoir à gâteau', 'Cake stand', 'حامل حلويات'],
  fourchette: ['Fourchette', 'Fork', 'شوكة'],
  couteau: ['Couteau', 'Knife', 'سكين'],
  cuillere: ['Cuillère', 'Spoon', 'ملعقة'],
  petite_cuillere: ['Petite cuillère', 'Teaspoon', 'ملعقة صغيرة'],
  couverts_salade: ['Couverts à salade', 'Salad servers', 'ملاعق سلطة'],
  pelle_tarte: ['Pelle à tarte', 'Cake server', 'مجرفة حلويات'],
  louche: ['Louche', 'Ladle', 'مغرفة'],
  porte_couteau: ['Porte-couteau', 'Knife rest', 'مسند سكين'],
  cafetiere: ['Cafetière', 'Coffee maker', 'آلة قهوة'],
  cafetiere_italienne: ['Cafetière italienne', 'Moka pot', 'موكا إيطالية'],
  bouilloire: ['Bouilloire', 'Kettle', 'غلاية'],
  boite_the: ['Boîte à thé', 'Tea tin', 'علبة شاي'],
  tasse_expresso: ['Tasse expresso', 'Espresso cup', 'فنجان قهوة'],
  soucoupe: ['Soucoupe', 'Saucer', 'صحن فنجان'],
  samovar: ['Samovar', 'Samovar', 'سماور'],
  flute: ['Flûte', 'Champagne flute', 'كأس شمبانيا'],
  verre_pied: ['Verre à pied', 'Stemmed glass', 'كأس بساق'],
  gobelet: ['Gobelet', 'Tumbler', 'كوب زجاجي'],
  bocal: ['Bocal', 'Jar', 'برطمان'],
  huilier: ['Huilier', 'Oil cruet', 'قنينة زيت'],
  sous_verre: ['Sous-verre', 'Coaster', 'قاعدة كأس'],
  pot_miel: ['Pot à miel', 'Honey pot', 'وعاء عسل'],
  casserole: ['Casserole', 'Saucepan', 'قدر'],
  poele: ['Poêle', 'Frying pan', 'مقلاة'],
  couscoussier: ['Couscoussier', 'Couscous steamer', 'كسكاس'],
  planche: ['Planche à découper', 'Cutting board', 'لوح تقطيع'],
  passoire: ['Passoire', 'Colander', 'مصفاة'],
  tablier: ['Tablier', 'Apron', 'مريلة'],
  gant_four: ['Gant de four', 'Oven mitt', 'قفاز فرن'],
  boite_conservation: ['Boîte de conservation', 'Food container', 'علبة حفظ'],
  boite_epices: ['Boîte à épices', 'Spice box', 'علبة توابل'],
  housse_couette: ['Housse de couette', 'Duvet cover', 'غطاء لحاف'],
  drap: ['Drap', 'Bed sheet', 'شرشف'],
  oreiller: ['Oreiller', 'Pillow', 'وسادة نوم'],
  serviette_bain: ['Serviette de bain', 'Bath towel', 'منشفة حمام'],
  rideau: ['Rideau', 'Curtain', 'ستارة'],
  torchon: ['Torchon', 'Tea towel', 'منشفة مطبخ'],
  tapis_bain: ['Tapis de bain', 'Bath mat', 'سجادة حمام'],
  horloge: ['Horloge', 'Clock', 'ساعة حائط'],
  statuette: ['Statuette', 'Figurine', 'تمثال صغير'],
  plante: ['Plante', 'Plant', 'نبتة'],
  cache_pot: ['Cache-pot', 'Plant pot cover', 'غطاء أصيص'],
  tableau: ['Tableau', 'Wall art', 'لوحة'],
  vide_poche: ['Vide-poche', 'Catch-all tray', 'صينية أغراض'],
  coupe_fruits: ['Coupe à fruits', 'Fruit bowl', 'سلة فواكه'],
  chauffe_plat: ['Bougies chauffe-plat', 'Tea lights', 'شموع صغيرة'],
  cendrier: ['Cendrier', 'Ashtray', 'منفضة سجائر'],
  zellige: ['Zellige', 'Zellige tile', 'زليج'],
  boule_deco: ['Boule déco', 'Decorative ball', 'كرة ديكور']
};

/* [clé, [fr, en, ar], pièces] : l'ordre de la grille. La Maison commence par
   ce qu'elle vend : bougies, table, hammam. */
const GROUPS = [
  ['tops', ['Hauts', 'Tops', 'الملابس العلوية'], ['tshirt', 'polo', 'chemise', 'debardeur', 'pull', 'sweat', 'tunique', 'kimono', 'chemisier', 'top', 'crop_top', 'body', 'cardigan', 'gilet', 'col_roule']],
  ['bottom', ['Bas', 'Bottoms', 'السراويل والتنانير'], ['pantalon', 'jean', 'short', 'jupe', 'sarwal', 'legging', 'jogging', 'salopette', 'cargo']],
  ['whole', ['Pièces entières', 'Dresses and sets', 'الفساتين والأطقم'], ['robe', 'combinaison', 'ensemble', 'ensemble_jean', 'survetement', 'costume']],
  ['outer', ['Vestes et manteaux', 'Jackets and coats', 'السترات والمعاطف'], ['veste', 'manteau', 'trench', 'cape', 'doudoune', 'gilet_doudoune', 'blazer', 'blouson_cuir', 'parka']],
  ['night', ['Nuit et lingerie', 'Nightwear and underwear', 'ملابس النوم والداخلية'], ['pyjama', 'chemise_nuit', 'peignoir', 'soutien_gorge', 'boxer']],
  ['kids', ['Enfant et bébé', 'Kids and baby', 'الأطفال والرضع'], ['body_bebe', 'grenouillere', 'ensemble_enfant', 'robe_fille']],
  ['trad', ['Traditionnel', 'Traditional', 'اللباس التقليدي'], ['caftan', 'caftan_perle', 'caftan_jawhara', 'caftan_ete', 'caftan_velours', 'caftan_enfant',
    'takchita', 'takchita_mariage', 'djellaba', 'djellaba_femme', 'djellaba_enfant', 'gandoura', 'jabador', 'selham', 'gilet_brode', 'chech', 'melhfa']],
  ['modest', ['Mode pudique et bain', 'Modest and swimwear', 'اللباس المحتشم والسباحة'], ['abaya', 'hijab', 'burkini', 'maillot', 'khimar', 'bikini']],
  ['shoes', ['Chaussures', 'Shoes', 'الأحذية'], ['chaussures', 'basket', 'botte', 'sandale', 'babouche', 'babouche_brodee', 'cherbil', 'babouche_enfant', 'chaussettes', 'mocassin', 'derby', 'escarpin', 'ballerine', 'mule', 'espadrille', 'tong', 'claquette', 'bottine', 'sabot', 'running', 'compensee', 'chausson', 'chaussure_bebe']],
  ['head', ['Couvre-chef', 'Headwear', 'أغطية الرأس'], ['chapeau', 'casquette', 'bonnet', 'tarbouche']],
  ['acc', ['Accessoires et bijoux', 'Accessories and jewellery', 'الإكسسوارات والمجوهرات'], ['ceinture', 'mdamma', 'cravate', 'echarpe', 'foulard', 'chale', 'gants',
    'lunettes', 'montre', 'bracelet', 'bague', 'collier', 'boucles', 'broche', 'khlala', 'parfum', 'noeud_papillon', 'bretelles', 'boutons_manchette', 'pochette_costume', 'pendentif', 'chouchou', 'barrette', 'collants', 'porte_cles']],
  ['bags', ['Sacs', 'Bags', 'الحقائب'], ['sac_main', 'sac', 'sac_dos', 'cabas', 'panier', 'pochette', 'portefeuille', 'valise', 'parapluie', 'sac_banane', 'sac_bandouliere', 'cartable', 'porte_cartes', 'porte_documents', 'sac_sport']],
  ['candle', ["Bougies et parfum d'intérieur", 'Candles and home fragrance', 'الشموع والعطور المنزلية'], ['bougie', 'diffuseur', 'diffuseur_voiture', 'coffret', 'eteignoir', 'coupe_meche', 'cloche', 'bougeoir', 'bkhour', 'photophore', 'chauffe_plat', 'encens', 'mijmar']],
  ['table', ['Table et décoration', 'Tableware and decor', 'المائدة والديكور'], ['assiette', 'bol', 'tasse', 'verre', 'verre_the', 'carafe', 'coupe', 'plateau', 'theiere', 'tajine',
    'miroir', 'vase', 'coussin', 'plaid', 'tapis', 'pouf', 'lanterne', 'plat']],
  ['dishes', ['Vaisselle et couverts', 'Dinnerware and cutlery', 'الأواني وأدوات المائدة'], ['couvert', 'saladier', 'saliere', 'corbeille', 'sous_assiette', 'assiette_creuse', 'assiette_dessert', 'ramequin', 'soupiere', 'sauciere', 'beurrier', 'coquetier', 'presentoir', 'fourchette', 'couteau', 'cuillere', 'petite_cuillere', 'couverts_salade', 'pelle_tarte', 'porte_couteau', 'coupe_fruits']],
  ['tea', ['Thé, café et verrerie', 'Tea, coffee and glassware', 'الشاي والقهوة والكؤوس'], ['sucrier', 'seau', 'mug', 'pichet', 'cafetiere', 'cafetiere_italienne', 'bouilloire', 'boite_the', 'tasse_expresso', 'soucoupe', 'samovar', 'flute', 'verre_pied', 'gobelet', 'sous_verre']],
  ['kitchen', ['Cuisine', 'Kitchen', 'المطبخ'], ['plat_four', 'louche', 'bocal', 'huilier', 'pot_miel', 'casserole', 'poele', 'couscoussier', 'planche', 'passoire', 'tablier', 'gant_four', 'boite_conservation', 'boite_epices']],
  ['linen', ['Linge de maison', 'Household linen', 'مفروشات المنزل'], ['nappe', 'serviette', 'set_table', 'chemin_table', 'housse_couette', 'drap', 'oreiller', 'serviette_bain', 'rideau', 'torchon', 'tapis_bain']],
  ['decor', ['Décoration et mobilier', 'Decor and furniture', 'الديكور والأثاث'], ['cadre', 'boite', 'suspension', 'lampe', 'tabouret', 'gueridon', 'horloge', 'statuette', 'plante', 'cache_pot', 'tableau', 'vide_poche', 'cendrier', 'zellige', 'boule_deco']],
  ['hammam', ['Hammam et beauté', 'Hammam and beauty', 'الحمام والتجميل'], ['kessa', 'ghassoul', 'savon_noir', 'henne', 'argan']],
  ['misc', ['Divers', 'Other', 'متفرقات'], ['tag', 'cintre']],
];
const GROUP_NAMES = Object.fromEntries(GROUPS.map((g) => [g[0], g[1]]));
const MAISON_FIRST = ['candle', 'table', 'dishes', 'tea', 'kitchen', 'linen', 'decor', 'hammam'];
export const PICKER_KEYS = GROUPS.flatMap((g) => g[2]);

const T = {
  fr: { head: 'À la caisse', byName: (n) => `D'après le nom « ${n} »`, picked: 'Choisie à la main. Le nom ne la change plus.',
    form: 'Choisie dans la fiche', none: 'Aucun mot du nom ne la désigne : précisez le nom, ou choisissez une photo.',
    empty: 'Tapez le nom : la photo de la caisse suit.', own: 'Votre photo s’affiche à la caisse.', change: 'Changer la photo', close: 'Fermer',
    reset: 'Laisser le nom choisir', search: 'Chercher : abaya, bougie, zarbia…', nothing: 'Aucune photo pour ce mot.' },
  en: { head: 'At the till', byName: (n) => `From the name “${n}”`, picked: 'Picked by hand. The name no longer changes it.',
    form: 'Picked on the product sheet', none: 'No word in the name points to a photo: refine the name, or pick one.',
    empty: 'Type the name: the till photo follows it.', own: 'Your own photo shows at the till.', change: 'Change the photo', close: 'Close',
    reset: 'Let the name decide', search: 'Search: abaya, candle, rug…', nothing: 'No photo for this word.' },
  ar: { head: 'في الصندوق', byName: (n) => `حسب الاسم «${n}»`, picked: 'اخترتها بنفسك. الاسم لا يغيرها بعد الآن.',
    form: 'مختارة في بطاقة المنتج', none: 'لا كلمة في الاسم تدل على صورة: وضّح الاسم أو اختر صورة.',
    empty: 'اكتب الاسم: صورة الصندوق تتبعه.', own: 'صورتك أنت هي التي تظهر في الصندوق.', change: 'تغيير الصورة', close: 'إغلاق',
    reset: 'دع الاسم يختار', search: 'ابحث: عباية، شمعة، زربية…', nothing: 'لا صورة لهذه الكلمة.' },
};
const LANG_I = { fr: 0, en: 1, ar: 2 };
export const pieceName = (key, lang = 'fr') => (NAMES[key] || [key])[LANG_I[lang] || 0] || NAMES[key]?.[0] || key;

/* Les pièces qu'une recherche désigne : chaque mot tapé commence un mot du
   libellé (dans les trois langues), un mot du métier ou la clé. */
const HAY = {};
const hay = (key) => HAY[key] || (HAY[key] = [...new Set([...(NAMES[key] || []), ...wordsOf(key), key.replace(/_/g, ' ')]
  .flatMap((w) => [...nameTokens(w), ...String(w).toLowerCase().split(/\s+/)]))]);
export function searchPieces(q) {
  const toks = nameTokens(q);
  if (!toks.length) return PICKER_KEYS.slice();
  return PICKER_KEYS.filter((k) => toks.every((t) => hay(k).some((w) => w.startsWith(t))));
}

/* Ce que la fiche enregistre. Sans choix à la main, la clé que la caisse
   dessinera (le nom d'abord) ; une icône d'avant, hors T-shirt par défaut,
   reste tant que le nom ne dit rien. */
export function tillPhotoState(name, art, picked) {
  if (picked && PHOTO_KEYS.includes(art)) return { art, artPicked: true };
  const fromName = keyForName(name);
  return { art: fromName || (art && art !== 'tshirt' && PHOTO_KEYS.includes(art) ? art : ''), artPicked: false };
}

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const style = document.createElement('style');
  style.id = 'kiwi-till-photo-css';
  style.textContent = `
.bqx-pf-side:has(> .ktp) { align-content: start; }
.ktp { margin-top: 6px; display: grid; gap: 10px; align-self: start; align-content: start; }
.ktp-h { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; opacity: .62; font-weight: 600; }
.ktp-now { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: center; }
.ktp-img { width: 64px; height: 64px; border-radius: 12px; background: var(--paper, #F7F5F0); display: grid; place-items: center; overflow: hidden;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
.ktp-img img { width: 56px; height: 56px; object-fit: contain; }
.ktp-t b { display: block; font-weight: 600; }
.ktp-t span { display: block; font-size: 12.5px; opacity: .72; line-height: 1.35; margin-top: 2px; }
.ktp-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.ktp-panel { display: grid; gap: 8px; }
.ktp-panel[hidden] { display: none; }
.ktp-q { width: 100%; box-sizing: border-box; }
.ktp-grid { max-height: 260px; overflow-y: auto; padding: 2px 4px 2px 0; display: grid; gap: 10px; overscroll-behavior: contain; }
.ktp-g { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 6px; }
.ktp-g[hidden] { display: none; }
.ktp-gh { grid-column: 1 / -1; font-size: 11px; font-weight: 600; opacity: .62; margin-top: 2px; }
.ktp-c { aspect-ratio: 1; border-radius: 10px; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); background: var(--paper, #F7F5F0);
  padding: 4px; cursor: pointer; display: grid; place-items: center; }
.ktp-c img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.ktp-c[hidden] { display: none; }
.ktp-c:hover { border-color: color-mix(in srgb, var(--atlas, #0B6E4F) 55%, transparent); }
.ktp-c.on { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 1px; border-color: transparent; }
.ktp-c:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 2px; }
.ktp-nothing { font-size: 12.5px; opacity: .7; }`;
  document.head.appendChild(style);
}

/* Monte le bloc « À la caisse » dans la fiche produit ouverte `root`.
   o: { lang, trade ('boutique' | 'maison'), media: () => bool } */
export function mountTillPhoto(root, product, o = {}) {
  if (!root || (o.trade !== 'boutique' && o.trade !== 'maison')) return null;
  const nameIn = root.querySelector('[data-bqx-name]');
  const side = root.querySelector('.bqx-pf-side');
  if (!nameIn || !side || side.querySelector('[data-ktp]')) return null;
  css();
  const lang = LANG_I[o.lang] != null ? o.lang : 'fr';
  /* Les deux traductions du bloc : ses phrases (T), et le nom d'une pièce ou
     d'une famille (NAMES, GROUPS), dans la langue du tableau de bord. */
  const tr = (key, arg) => { const v = T[lang][key]; return typeof v === 'function' ? v(arg) : v; };
  const L = (key) => (GROUP_NAMES[key] ? GROUP_NAMES[key][LANG_I[lang]] : pieceName(key, lang));
  const fallback = o.trade === 'maison' ? 'tag' : 'cintre';
  const media = typeof o.media === 'function' ? o.media : () => false;
  let art = (product && product.art) || '';
  let picked = !!(product && product.artPicked);
  const order = o.trade === 'maison'
    ? [...GROUPS.filter((g) => MAISON_FIRST.includes(g[0])), ...GROUPS.filter((g) => !MAISON_FIRST.includes(g[0]))]
    : GROUPS;

  /* Le bloc est construit nœud par nœud : chaque texte visible sort de tr()
     ou de L(), jamais d'un gabarit HTML. */
  const el = (tag, cls, attrs, kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const [k, v] of Object.entries(attrs || {})) { if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v); }
    for (const kid of kids || []) n.append(kid);
    return n;
  };
  const headEl = el('div', 'ktp-h'); headEl.textContent = tr('head');
  const img = el('img', '', { alt: '' });
  const nameEl = el('b'), whyEl = el('span');
  const openBtn = el('button', 'bqx-pf-btn', { type: 'button', 'aria-expanded': 'false' }); openBtn.textContent = tr('change');
  const resetBtn = el('button', 'bqx-pf-btn', { type: 'button', hidden: true }); resetBtn.textContent = tr('reset');
  const search = el('input', 'bqx-pf-in ktp-q', { type: 'search', autocomplete: 'off' });
  search.placeholder = tr('search'); search.setAttribute('aria-label', tr('search'));
  const nothing = el('p', 'ktp-nothing', { hidden: true }); nothing.textContent = tr('nothing');
  const cells = [];
  const groupEls = order.map(([id, , keys]) => {
    const gh = el('div', 'ktp-gh'); gh.textContent = L(id);
    const g = el('div', 'ktp-g', { role: 'group', 'data-ktp-g': id }, [gh]);
    g.setAttribute('aria-label', L(id));
    for (const k of keys) {
      const c = el('button', 'ktp-c', { type: 'button', 'data-ktp-k': k, 'aria-pressed': 'false' },
        [el('img', '', { src: photoSrc(k), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' })]);
      c.title = L(k); c.setAttribute('aria-label', L(k));
      cells.push(c); g.append(c);
    }
    return g;
  });
  const grid = el('div', 'ktp-grid', {}, [...groupEls, nothing]);
  const panel = el('div', 'ktp-panel', { hidden: true }, [search, grid]);
  const box = el('div', 'ktp', { 'data-ktp': true }, [
    headEl,
    el('div', 'ktp-now', { 'aria-live': 'polite' }, [el('div', 'ktp-img', {}, [img]), el('div', 'ktp-t', {}, [nameEl, whyEl])]),
    el('div', 'ktp-acts', {}, [openBtn, resetBtn]),
    panel,
  ]);
  side.appendChild(box);
  let shownKey = null;

  const render = () => {
    const name = (nameIn.value || '').trim();
    const st = tillPhotoState(name, art, picked);
    root.__kiwiTillPhoto = st;
    const own = media();
    const prod = { name, art: st.art, artPicked: st.artPicked };
    const key = photoKey(prod, fallback);
    const src = photoSrc(photoFile(prod, fallback));
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    nameEl.textContent = L(key);
    whyEl.textContent = own ? tr('own')
      : st.artPicked ? tr('picked')
      : keyForName(name) ? tr('byName', name)
      : st.art ? tr('form')
      : name ? tr('none') : tr('empty');
    resetBtn.hidden = !st.artPicked;
    cells.forEach((c) => { const on = c.dataset.ktpK === key; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (key !== shownKey) { shownKey = key; if (!panel.hidden && !search.value) reveal(); }
  };
  /* Fait défiler la grille, et elle seule, jusqu'à la photo retenue. */
  const reveal = () => {
    const on = cells.find((c) => c.classList.contains('on'));
    if (!on || on.hidden) return;
    const g = grid.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.top < g.top || r.bottom > g.bottom) grid.scrollTop += r.top - g.top - 28;
  };
  const filter = () => {
    const hits = new Set(searchPieces(search.value));
    cells.forEach((c) => { c.hidden = !hits.has(c.dataset.ktpK); });
    groupEls.forEach((g) => { g.hidden = !g.querySelector('[data-ktp-k]:not([hidden])'); });
    nothing.hidden = hits.size > 0;
  };

  nameIn.addEventListener('input', render);
  openBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    openBtn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    openBtn.textContent = panel.hidden ? tr('change') : tr('close');
    if (!panel.hidden) requestAnimationFrame(reveal);
  });
  resetBtn.addEventListener('click', () => { picked = false; art = ''; render(); });
  search.addEventListener('input', filter);
  grid.addEventListener('click', (e) => {
    const c = e.target.closest('[data-ktp-k]');
    if (!c) return;
    const k = c.dataset.ktpK;
    /* Toucher la photo que le nom donne déjà, c'est laisser le nom choisir. */
    picked = k !== keyForName(nameIn.value);
    art = k;
    render();
  });
  /* Cent dix-sept photos d'un coup : sur un réseau faible, une requête qui
     échoue laisserait une case cassée. Chaque photo réessaie deux fois. */
  box.addEventListener('error', (e) => {
    const im = e.target;
    if (!(im instanceof HTMLImageElement)) return;
    const n = +(im.dataset.retry || 0);
    if (n >= 2) return;
    im.dataset.retry = String(n + 1);
    setTimeout(() => { const s = im.getAttribute('src'); im.removeAttribute('src'); im.setAttribute('src', s); }, 600 * (n + 1));
  }, true);
  /* La carte d'aperçu se redessine quand une photo est envoyée ou retirée. */
  const thumb = root.querySelector('[data-bqx-photo-box]');
  if (thumb && typeof MutationObserver === 'function') new MutationObserver(render).observe(thumb, { childList: true });
  render();
  return { render, state: () => root.__kiwiTillPhoto };
}
