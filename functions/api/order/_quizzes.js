/* Kiwi · les quiz livrés avec Order Pro, en français, anglais et arabe.
 *
 * Un restaurant qui vient d'allumer les jeux n'a encore rien écrit : ces trois
 * quiz lui donnent de quoi jouer dès le premier jour. Ses propres quiz
 * (tableau de bord → Order Pro → Jeux) s'ajoutent à côté.
 *
 * La BONNE réponse est toujours la première de `choices` : c'est plus sûr à
 * relire. Le serveur mélange l'ordre avant d'envoyer la question
 * (_guest.js › shuffledQuestion) et ne livre jamais la réponse avant la fin
 * de la partie. Une question peut se poser autrement selon la langue (en
 * arabe, « رأس الحانوت » ne se traduit pas) : seules les positions des
 * réponses doivent correspondre. */

const Q = (fr, en, ar) => ({ fr, en, ar });

export const BUILTIN_QUIZZES = [
  {
    id: 'kiwi-cuisine',
    title: Q('La cuisine marocaine', 'Moroccan cuisine', 'المطبخ المغربي'),
    questions: [
      { q: Q('Quel plat cuit dans un récipient en terre au couvercle conique ?', 'Which dish is cooked in a clay pot with a cone-shaped lid?', 'ما الطبق الذي يُطهى في إناء فخاري بغطاء مخروطي؟'),
        choices: Q(['Le tajine', 'Le couscous', 'La harira', 'La pastilla'], ['Tajine', 'Couscous', 'Harira', 'Pastilla'], ['الطاجين', 'الكسكس', 'الحريرة', 'البسطيلة']) },
      { q: Q('Traditionnellement, la famille se retrouve autour du couscous le…', 'Traditionally, families gather around couscous on…', 'تقليديًا، تجتمع العائلة على الكسكس يوم…'),
        choices: Q(['Vendredi', 'Lundi', 'Mercredi', 'Samedi'], ['Friday', 'Monday', 'Wednesday', 'Saturday'], ['الجمعة', 'الاثنين', 'الأربعاء', 'السبت']) },
      { q: Q('La harira est la soupe reine du…', 'Harira is the signature soup of…', 'الحريرة هي الحساء الأشهر في…'),
        choices: Q(['Ftour du Ramadan', 'Petit-déjeuner de l’Aïd', 'Repas de mariage', 'Pique-nique d’été'], ['Ramadan iftar', 'Eid breakfast', 'Wedding dinners', 'Summer picnics'], ['فطور رمضان', 'فطور العيد', 'عشاء الأعراس', 'نزهات الصيف']) },
      { q: Q('La pastilla de Fès marie traditionnellement…', 'Traditional Fez pastilla combines…', 'تجمع البسطيلة الفاسية تقليديًا بين…'),
        choices: Q(['Pigeon et amandes', 'Agneau et pruneaux', 'Poisson et olives', 'Bœuf et petits pois'], ['Pigeon and almonds', 'Lamb and prunes', 'Fish and olives', 'Beef and peas'], ['الحمام واللوز', 'اللحم والبرقوق', 'السمك والزيتون', 'اللحم البقري والجلبانة']) },
      { q: Q('La tanjia, cuite dans les cendres du hammam, est une spécialité de…', 'Tanjia, slow-cooked in the hammam’s embers, is a speciality of…', 'الطنجية التي تُطهى في رماد الفرناتشي هي من أطباق…'),
        choices: Q(['Marrakech', 'Tanger', 'Agadir', 'Oujda'], ['Marrakech', 'Tangier', 'Agadir', 'Oujda'], ['مراكش', 'طنجة', 'أكادير', 'وجدة']) },
      { q: Q('L’arganier pousse surtout dans la région du…', 'The argan tree mainly grows in the region of…', 'تنمو شجرة الأركان أساسًا في منطقة…'),
        choices: Q(['Souss', 'Rif', 'Tafilalet', 'Gharb'], ['Souss', 'Rif', 'Tafilalet', 'Gharb'], ['سوس', 'الريف', 'تافيلالت', 'الغرب']) },
      { q: Q('« Ras el hanout » veut dire littéralement…', '“Ras el hanout” literally means…', 'رأس الحانوت هو…'),
        choices: Q(['La tête de la boutique', 'Le cœur du marché', 'Le roi des épices', 'La poudre d’or'], ['Head of the shop', 'Heart of the market', 'King of spices', 'Golden powder'], ['خليط من التوابل', 'نوع من الخبز', 'حلوى باللوز', 'شاي بالأعشاب']) },
      { q: Q('Le msemen, c’est…', 'Msemen is…', 'المسمن هو…'),
        choices: Q(['Une crêpe feuilletée carrée', 'Un pain rond cuit au four', 'Un gâteau aux amandes', 'Une soupe de légumes'], ['A square, flaky flatbread', 'A round oven-baked bread', 'An almond cake', 'A vegetable soup'], ['رغيف مورّق مربّع', 'خبز دائري يُطهى في الفرن', 'حلوى باللوز', 'حساء خضر']) },
      { q: Q('Les cornes de gazelle sont fourrées de…', 'Gazelle horns are filled with…', 'كعب الغزال محشو بـ…'),
        choices: Q(['Pâte d’amande', 'Dattes', 'Noix de coco', 'Chocolat'], ['Almond paste', 'Dates', 'Coconut', 'Chocolate'], ['عجينة اللوز', 'التمر', 'جوز الهند', 'الشوكولاتة']) },
      { q: Q('La bissara est une purée de…', 'Bissara is a purée of…', 'تُحضَّر البيصارة من…'),
        choices: Q(['Fèves sèches', 'Lentilles', 'Pois chiches', 'Haricots blancs'], ['Dried fava beans', 'Lentils', 'Chickpeas', 'White beans'], ['الفول اليابس', 'العدس', 'الحمص', 'اللوبيا']) },
    ],
  },
  {
    id: 'kiwi-the-cafe',
    title: Q('Thé et café', 'Tea and coffee', 'الشاي والقهوة'),
    questions: [
      { q: Q('Le thé à la menthe se prépare avec du thé…', 'Moroccan mint tea is made with…', 'يُحضَّر الشاي المغربي بالنعناع بـ…'),
        choices: Q(['Vert', 'Noir', 'Blanc', 'Rooibos'], ['Green tea', 'Black tea', 'White tea', 'Rooibos'], ['الشاي الأخضر', 'الشاي الأسود', 'الشاي الأبيض', 'الرويبوس']) },
      { q: Q('Le thé vert le plus servi au Maroc est le…', 'The green tea most served in Morocco is…', 'أكثر شاي أخضر يُقدَّم في المغرب هو…'),
        choices: Q(['Gunpowder', 'Darjeeling', 'Earl Grey', 'Sencha'], ['Gunpowder', 'Darjeeling', 'Earl Grey', 'Sencha'], ['غانبودر', 'دارجيلنغ', 'إيرل غراي', 'سينشا']) },
      { q: Q('Pourquoi verse-t-on le thé de haut ?', 'Why is tea poured from high up?', 'لماذا يُصَبّ الشاي من الأعلى؟'),
        choices: Q(['Pour l’aérer et faire la mousse', 'Pour le rendre plus sucré', 'Pour porter chance', 'Pour retenir la menthe'], ['To aerate it and make foam', 'To make it sweeter', 'For good luck', 'To hold back the mint'], ['لتهويته وصنع الرغوة', 'لجعله أحلى', 'لجلب الحظ', 'لحبس النعناع']) },
      { q: Q('En hiver, on parfume parfois le thé avec…', 'In winter, tea is sometimes flavoured with…', 'في الشتاء يُعطَّر الشاي أحيانًا بـ…'),
        choices: Q(['L’absinthe (chiba)', 'Le basilic', 'Le laurier', 'Le persil'], ['Wormwood (chiba)', 'Basil', 'Bay leaf', 'Parsley'], ['الشيبة', 'الحبق', 'ورق الرند', 'المعدنوس']) },
      { q: Q('Un « nous-nous », c’est…', 'A “nous-nous” is…', '«نص نص» هو…'),
        choices: Q(['Moitié café, moitié lait', 'Un double expresso', 'Un café glacé', 'Un thé au lait'], ['Half coffee, half milk', 'A double espresso', 'An iced coffee', 'Tea with milk'], ['نصف قهوة ونصف حليب', 'إسبريسو مضاعف', 'قهوة مثلجة', 'شاي بالحليب']) },
      { q: Q('Le café arabica est originaire d’…', 'Arabica coffee originally comes from…', 'الموطن الأصلي للبن العربي هو…'),
        choices: Q(['Éthiopie', 'Brésil', 'Colombie', 'Inde'], ['Ethiopia', 'Brazil', 'Colombia', 'India'], ['إثيوبيا', 'البرازيل', 'كولومبيا', 'الهند']) },
      { q: Q('La théière marocaine s’appelle…', 'The Moroccan teapot is called…', 'ما اسم الإناء الذي يُحضَّر فيه الشاي؟'),
        choices: Q(['Le berrad', 'La siniya', 'Le tbsil', 'La guedra'], ['Berrad', 'Siniya', 'Tbsil', 'Guedra'], ['البرّاد', 'الصينية', 'الطبسيل', 'القدرة']) },
      { q: Q('L’expresso est né en…', 'Espresso was born in…', 'وُلدت قهوة الإسبريسو في…'),
        choices: Q(['Italie', 'France', 'Espagne', 'Turquie'], ['Italy', 'France', 'Spain', 'Turkey'], ['إيطاليا', 'فرنسا', 'إسبانيا', 'تركيا']) },
    ],
  },
  {
    id: 'kiwi-maroc',
    title: Q('Le Maroc', 'Morocco', 'المغرب'),
    questions: [
      { q: Q('Quelle est la capitale du Maroc ?', 'What is the capital of Morocco?', 'ما عاصمة المغرب؟'),
        choices: Q(['Rabat', 'Casablanca', 'Fès', 'Marrakech'], ['Rabat', 'Casablanca', 'Fez', 'Marrakech'], ['الرباط', 'الدار البيضاء', 'فاس', 'مراكش']) },
      { q: Q('Quel est le plus haut sommet du Maroc ?', 'What is the highest peak in Morocco?', 'ما أعلى قمة في المغرب؟'),
        choices: Q(['Le Toubkal', 'Le jbel Ayachi', 'Le M’Goun', 'Le Bou Naceur'], ['Toubkal', 'Jbel Ayachi', 'M’Goun', 'Bou Naceur'], ['توبقال', 'جبل العياشي', 'مكون', 'بوناصر']) },
      { q: Q('Quelle est la monnaie du Maroc ?', 'What is Morocco’s currency?', 'ما عملة المغرب؟'),
        choices: Q(['Le dirham', 'Le dinar', 'Le riyal', 'La livre'], ['Dirham', 'Dinar', 'Riyal', 'Pound'], ['الدرهم', 'الدينار', 'الريال', 'الجنيه']) },
      { q: Q('Quelle ville est surnommée « la perle bleue » ?', 'Which town is nicknamed “the blue pearl”?', 'أي مدينة تُلقَّب بـ«الجوهرة الزرقاء»؟'),
        choices: Q(['Chefchaouen', 'Essaouira', 'Ifrane', 'Asilah'], ['Chefchaouen', 'Essaouira', 'Ifrane', 'Asilah'], ['شفشاون', 'الصويرة', 'إفران', 'أصيلة']) },
      { q: Q('Dans quelle ville se trouve l’université Al Quaraouiyine ?', 'In which city is the University of al-Qarawiyyin?', 'في أي مدينة توجد جامعة القرويين؟'),
        choices: Q(['Fès', 'Meknès', 'Rabat', 'Tétouan'], ['Fez', 'Meknes', 'Rabat', 'Tetouan'], ['فاس', 'مكناس', 'الرباط', 'تطوان']) },
      { q: Q('Quel détroit sépare le Maroc de l’Espagne ?', 'Which strait separates Morocco from Spain?', 'أي مضيق يفصل المغرب عن إسبانيا؟'),
        choices: Q(['Gibraltar', 'Le Bosphore', 'Messine', 'Ormuz'], ['Gibraltar', 'The Bosphorus', 'Messina', 'Hormuz'], ['جبل طارق', 'البوسفور', 'مسينا', 'هرمز']) },
      { q: Q('La place Jemaa el-Fna se trouve à…', 'Jemaa el-Fna square is in…', 'تقع ساحة جامع الفنا في…'),
        choices: Q(['Marrakech', 'Fès', 'Rabat', 'Tanger'], ['Marrakech', 'Fez', 'Rabat', 'Tangier'], ['مراكش', 'فاس', 'الرباط', 'طنجة']) },
      { q: Q('La mosquée Hassan II se trouve à…', 'The Hassan II Mosque is in…', 'يقع مسجد الحسن الثاني في…'),
        choices: Q(['Casablanca', 'Rabat', 'Tanger', 'Agadir'], ['Casablanca', 'Rabat', 'Tangier', 'Agadir'], ['الدار البيضاء', 'الرباط', 'طنجة', 'أكادير']) },
      { q: Q('En quelle année le Maroc a-t-il atteint la demi-finale de la Coupe du monde ?', 'In which year did Morocco reach the World Cup semi-final?', 'في أي سنة بلغ المغرب نصف نهائي كأس العالم؟'),
        choices: Q(['2022', '2018', '2014', '1986'], ['2022', '2018', '2014', '1986'], ['2022', '2018', '2014', '1986']) },
      { q: Q('Depuis 2011, les langues officielles du Maroc sont…', 'Since 2011, Morocco’s official languages are…', 'منذ 2011، اللغتان الرسميتان للمغرب هما…'),
        choices: Q(['L’arabe et l’amazighe', 'L’arabe et le français', 'L’arabe seulement', 'Le français et l’amazighe'], ['Arabic and Amazigh', 'Arabic and French', 'Arabic only', 'French and Amazigh'], ['العربية والأمازيغية', 'العربية والفرنسية', 'العربية فقط', 'الفرنسية والأمازيغية']) },
    ],
  },
];
