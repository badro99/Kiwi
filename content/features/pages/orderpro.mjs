/* Page « OrderPro ». Voir pages/caisse.mjs pour la règle des promesses.
 * Ce que la page ne dit PAS, exprès : pas de paiement en ligne (il n'existe
 * pas, le client paie à table ou au comptoir), pas de livraison (l'API ne
 * connaît que la table et l'emporter), pas d'acceptation automatique (chaque
 * commande passe par la caisse). */
export default {
  fr: {
    nav: 'OrderPro',
    card: 'Le client scanne le QR de sa table, commande dans sa langue, et la commande passe par votre caisse avant la cuisine.',
    eyebrow: 'OrderPro · Kiwi Pro',
    h1: ['Commande par QR code à table :', 'le client commande, la caisse garde la main.'],
    deck: 'OrderPro met votre carte sur le téléphone du client. Il scanne le QR posé sur sa table, choisit sa langue, compose sa commande et l’envoie. La commande arrive d’abord à votre caisse, qui l’accepte, puis elle part en cuisine. Le paiement reste chez vous, à table ou au comptoir.',
    hero: { shot: 'orderpro-menu', alt: 'OrderPro sur un téléphone : la carte de Café Atlas, le restaurant de démonstration de Kiwi, avec ses catégories et ses boutons d’ajout.', phone: true },
    facts: [
      { claim: 'op.qr', text: 'Un QR par table. Le client scanne et commande depuis son téléphone, sans application à installer.' },
      { claim: 'op.inbox', text: 'La commande arrive d’abord à la caisse. Un membre de l’équipe l’accepte, puis elle part en cuisine.' },
      { claim: 'op.price', text: 'Le prix vient de votre carte publiée, jamais du téléphone.' },
    ],
    sections: [
      {
        id: 'carte', kicker: 'La carte',
        title: 'Votre carte, dans la langue du client.',
        body: [
          'À Marrakech ou à Tanger, une même salle peut accueillir une famille de Casablanca et des touristes qui ne lisent pas le français. Chacun lit la carte dans sa langue.',
        ],
        points: [
          { claim: 'op.langs', text: 'La carte s’affiche en français, en anglais et en arabe, et dans d’autres langues si vous publiez leurs traductions.' },
          { claim: 'op.options', text: 'Options, suppléments et formules : rien n’est coché d’avance, et un choix obligatoire manquant est signalé avant l’ajout.' },
          { claim: 'op.allergens', text: 'Les valeurs nutritionnelles et les 14 allergènes viennent de vos recettes complètes, et le client peut filtrer.' },
        ],
        shot: { name: 'orderpro-options', alt: 'La fiche d’un cappuccino dans OrderPro : les options à choisir avant de l’ajouter au panier.', phone: true },
      },
      {
        id: 'caisse', kicker: 'À la caisse',
        title: 'Rien ne part en cuisine sans votre accord.',
        body: [
          'Une commande par QR qui file directement en cuisine, c’est un plat lancé pour une table vide ou une blague d’adolescent. OrderPro fait passer chaque commande par l’équipe.',
        ],
        points: [
          { claim: 'op.inbox' },
          { claim: 'op.kitchen', text: 'Une fois acceptée, le bon cuisine s’imprime une seule fois et l’écran cuisine reçoit les options.' },
          { claim: 'op.price' },
          { claim: 'op.retry', text: 'Un double appui ou un réseau lent ne crée pas de commande en double.' },
          { claim: 'op.cancel', text: 'Une commande acceptée peut encore être annulée. Une commande déjà encaissée, non.' },
        ],
        shot: { name: 'orderpro-panier', alt: 'Le panier OrderPro d’un client : deux articles, le total et le bouton pour envoyer la commande.', phone: true },
      },
      {
        id: 'table', kicker: 'À table',
        title: 'Le client suit sa commande et appelle quand il veut.',
        body: [
          'Le serveur n’a plus à passer dix fois pour savoir si la table veut l’addition. La table le dit elle-même.',
        ],
        points: [
          { claim: 'op.status', text: 'Le client voit où en est sa commande, appelle un serveur ou demande l’addition depuis la table.' },
          { claim: 'op.split', text: 'À la caisse, l’addition se partage par article ou en parts égales. Sur son téléphone, le client calcule sa part, et l’encaissement se fait à la caisse.' },
          { claim: 'op.nopay', text: 'Aucun paiement en ligne : le client paie à table ou au comptoir, comme d’habitude.' },
        ],
      },
      {
        id: 'service', kicker: 'Le service',
        title: 'La carte suit ce qui se passe en salle.',
        body: [
          'Le tajine du jour est fini, la cuisine ferme à 23 h, quelqu’un veut emporter. OrderPro gère ces trois cas.',
        ],
        points: [
          { claim: 'op.soldout', text: 'Un plat épuisé se retire de la carte, au besoin jusqu’à une heure précise, et une commande sur ce plat est refusée.' },
          { claim: 'op.hours', text: 'Hors des horaires publiés, ou quand la caisse est éteinte, la carte ne prend plus de commande.' },
          { claim: 'op.takeaway', text: 'Un QR ou un lien pour la vente à emporter, payée au comptoir.' },
          { claim: 'op.booking', text: 'Un lien de réservation public, avec des créneaux calculés depuis vos tables et vos horaires.' },
        ],
      },
    ],
    plan: {
      title: 'OrderPro est inclus dans Kiwi Pro.',
      body: 'Kiwi Pro réunit OrderPro, le plan de salle, la prise de commande des serveurs, l’écran cuisine et la carte multilingue. L’équipe Kiwi active OrderPro sur votre établissement pendant la mise en place.',
      demo: 'Bonjour, je voudrais une démo d’OrderPro, la commande par QR code de Kiwi, pour mon restaurant.',
    },
    faq: [
      ['Le client doit-il télécharger une application ?', 'Non. Le QR ouvre une page web dans le navigateur du téléphone. Le client choisit sa langue et commande.'],
      ['Les commandes partent-elles directement en cuisine ?', 'Non. Chaque commande arrive d’abord à la caisse. Un membre de l’équipe l’accepte, et c’est seulement là que le bon part en cuisine.'],
      ['Le client peut-il payer depuis son téléphone ?', 'Non. OrderPro ne prend aucun paiement en ligne. Le client paie à table ou au comptoir, et l’addition peut se partager à la caisse, par article ou en parts égales.'],
      ['Dans quelles langues s’affiche la carte ?', 'En français, en anglais et en arabe, et dans d’autres langues si vous publiez la traduction de vos plats.'],
      ['Combien coûte OrderPro ?', 'OrderPro est inclus dans Kiwi Pro, à 399 MAD par mois, ou 349 MAD par mois en annuel. Les 15 premiers jours sont gratuits et sans engagement, et Kiwi ne prend aucune commission sur les commandes.'],
    ],
  },
  en: {
    nav: 'OrderPro',
    card: 'Guests scan the QR code on their table, order in their language, and the order goes through your till before the kitchen.',
    eyebrow: 'OrderPro · Kiwi Pro',
    h1: ['QR code ordering at the table:', 'guests order, your till stays in charge.'],
    deck: 'OrderPro puts your menu on the guest’s phone. They scan the QR code on their table, pick their language, build their order and send it. The order reaches your till first, the team accepts it, then it goes to the kitchen. Payment stays with you, at the table or at the counter.',
    hero: { shot: 'orderpro-menu', alt: 'OrderPro on a phone: the menu of Café Atlas, Kiwi’s demo restaurant, with its categories and add buttons.', phone: true },
    facts: [
      { claim: 'op.qr', text: 'One QR code per table. Guests scan and order from their phone, with no app to install.' },
      { claim: 'op.inbox', text: 'The order reaches the till first. A team member accepts it, then it goes to the kitchen.' },
      { claim: 'op.price', text: 'The price comes from your published menu, never from the phone.' },
    ],
    sections: [
      {
        id: 'menu', kicker: 'The menu',
        title: 'Your menu, in the guest’s language.',
        body: [
          'In Marrakech or Tangier, the same room can seat a family from Casablanca and tourists who do not read French. Each of them reads the menu in their own language.',
        ],
        points: [
          { claim: 'op.langs', text: 'The menu shows in French, English and Arabic, and in other languages if you publish their translations.' },
          { claim: 'op.options', text: 'Options, extras and set menus: nothing is pre-selected, and a missing required choice is flagged before adding.' },
          { claim: 'op.allergens', text: 'Nutrition values and the 14 allergens come from your complete recipes, and guests can filter.' },
        ],
        shot: { name: 'orderpro-options', alt: 'A cappuccino’s sheet in OrderPro: the options to choose before adding it to the basket.', phone: true },
      },
      {
        id: 'till', kicker: 'At the till',
        title: 'Nothing goes to the kitchen without your say.',
        body: [
          'A QR order that goes straight to the kitchen means a dish cooked for an empty table, or a teenager’s prank. OrderPro sends every order through the team.',
        ],
        points: [
          { claim: 'op.inbox' },
          { claim: 'op.kitchen', text: 'Once accepted, the kitchen ticket prints exactly once and the kitchen display receives the options.' },
          { claim: 'op.price' },
          { claim: 'op.retry', text: 'A double tap or a slow network does not create a duplicate order.' },
          { claim: 'op.cancel', text: 'An accepted order can still be cancelled. An order already paid cannot.' },
        ],
        shot: { name: 'orderpro-panier', alt: 'A guest’s OrderPro basket: two items, the total and the button to send the order.', phone: true },
      },
      {
        id: 'table', kicker: 'At the table',
        title: 'Guests follow their order and call when they want.',
        body: [
          'The waiter no longer has to walk by ten times to find out if the table wants the bill. The table says so itself.',
        ],
        points: [
          { claim: 'op.status', text: 'Guests see where their order is, call a waiter or ask for the bill from the table.' },
          { claim: 'op.split', text: 'At the till, the bill splits by item or into equal shares. On their phone, guests work out their share, and payment is taken at the till.' },
          { claim: 'op.nopay', text: 'No online payment: guests pay at the table or at the counter, as usual.' },
        ],
      },
      {
        id: 'service', kicker: 'The service',
        title: 'The menu keeps up with the room.',
        body: [
          'The dish of the day has run out, the kitchen closes at 11 pm, someone wants takeaway. OrderPro handles all three.',
        ],
        points: [
          { claim: 'op.soldout', text: 'A sold-out dish comes off the menu, until a set time if you want, and an order for it is refused.' },
          { claim: 'op.hours', text: 'Outside your published hours, or when the till is off, the menu stops taking orders.' },
          { claim: 'op.takeaway', text: 'A QR code or a link for takeaway, paid at the counter.' },
          { claim: 'op.booking', text: 'A public booking link, with time slots calculated from your tables and opening hours.' },
        ],
      },
    ],
    plan: {
      title: 'OrderPro is included in Kiwi Pro.',
      body: 'Kiwi Pro brings together OrderPro, the floor plan, waiter order taking, the kitchen display and the multilingual menu. The Kiwi team switches OrderPro on for your venue during setup.',
      demo: 'Hello, I would like a demo of OrderPro, Kiwi’s QR code ordering, for my restaurant.',
    },
    faq: [
      ['Do guests have to download an app?', 'No. The QR code opens a web page in the phone’s browser. Guests pick their language and order.'],
      ['Do orders go straight to the kitchen?', 'No. Every order reaches the till first. A team member accepts it, and only then does the ticket go to the kitchen.'],
      ['Can guests pay from their phone?', 'No. OrderPro takes no online payment. Guests pay at the table or at the counter, and the bill can be split at the till, by item or into equal shares.'],
      ['Which languages does the menu show in?', 'French, English and Arabic, and other languages if you publish the translation of your dishes.'],
      ['How much does OrderPro cost?', 'OrderPro is included in Kiwi Pro, at 399 MAD a month, or 349 MAD a month on the annual plan. The first 15 days are free with no commitment, and Kiwi takes no commission on orders.'],
    ],
  },
  ar: {
    nav: 'OrderPro',
    card: 'يمسح الزبون رمز QR الموجود على طاولته، ويطلب بلغته، ويمر الطلب عبر الكاشير قبل المطبخ.',
    eyebrow: 'OrderPro · Kiwi Pro',
    h1: ['الطلب عبر رمز QR من الطاولة:', 'الزبون يطلب، والكاشير يبقى المتحكم.'],
    deck: 'يضع OrderPro قائمتك على هاتف الزبون. يمسح رمز QR الموجود على طاولته، ويختار لغته، ويكوّن طلبه ويرسله. يصل الطلب أولا إلى الكاشير، فيقبله الفريق، ثم يذهب إلى المطبخ. ويبقى الدفع عندك، على الطاولة أو في الكونتوار.',
    hero: { shot: 'orderpro-menu', alt: 'OrderPro على الهاتف: قائمة Café Atlas، مطعم العرض التجريبي لدى Kiwi، بأصنافها وأزرار الإضافة.', phone: true },
    facts: [
      { claim: 'op.qr', text: 'رمز QR لكل طاولة. يمسحه الزبون ويطلب من هاتفه دون تثبيت أي تطبيق.' },
      { claim: 'op.inbox', text: 'يصل الطلب أولا إلى الكاشير. يقبله أحد أفراد الفريق، ثم يذهب إلى المطبخ.' },
      { claim: 'op.price', text: 'السعر يأتي من قائمتك المنشورة، وليس من الهاتف أبدا.' },
    ],
    sections: [
      {
        id: 'menu', kicker: 'القائمة',
        title: 'قائمتك، بلغة الزبون.',
        body: [
          'في مراكش أو طنجة، قد تستقبل القاعة نفسها عائلة من الدار البيضاء وسياحا لا يقرؤون الفرنسية. كل واحد يقرأ القائمة بلغته.',
        ],
        points: [
          { claim: 'op.langs', text: 'تظهر القائمة بالفرنسية والإنجليزية والعربية، وبلغات أخرى إذا نشرت ترجماتها.' },
          { claim: 'op.options', text: 'الاختيارات والإضافات والوجبات المركبة: لا شيء محدد مسبقا، والاختيار الإجباري الناقص يُنبَّه إليه قبل الإضافة.' },
          { claim: 'op.allergens', text: 'القيم الغذائية ومسببات الحساسية الأربعة عشر تأتي من وصفاتك المكتملة، ويمكن للزبون التصفية بها.' },
        ],
        shot: { name: 'orderpro-options', alt: 'بطاقة كابتشينو في OrderPro: الاختيارات المطلوبة قبل إضافته إلى السلة.', phone: true },
      },
      {
        id: 'till', kicker: 'في الكاشير',
        title: 'لا شيء يذهب إلى المطبخ دون موافقتك.',
        body: [
          'طلب QR يذهب مباشرة إلى المطبخ قد يعني طبقا يُطهى لطاولة فارغة أو مزحة مراهق. يمرر OrderPro كل طلب عبر الفريق.',
        ],
        points: [
          { claim: 'op.inbox' },
          { claim: 'op.kitchen', text: 'بعد القبول، تُطبع تذكرة المطبخ مرة واحدة فقط، وتستقبل شاشة المطبخ الاختيارات.' },
          { claim: 'op.price' },
          { claim: 'op.retry', text: 'النقر المزدوج أو الشبكة البطيئة لا يُنشئان طلبا مكررا.' },
          { claim: 'op.cancel', text: 'الطلب المقبول يمكن إلغاؤه بعد ذلك. أما الطلب المحصَّل فلا.' },
        ],
        shot: { name: 'orderpro-panier', alt: 'سلة زبون في OrderPro: سلعتان، والمجموع، وزر إرسال الطلب.', phone: true },
      },
      {
        id: 'table', kicker: 'على الطاولة',
        title: 'الزبون يتابع طلبه وينادي متى شاء.',
        body: [
          'لم يعد النادل مضطرا للمرور عشر مرات ليعرف إن كانت الطاولة تريد الحساب. الطاولة تقول ذلك بنفسها.',
        ],
        points: [
          { claim: 'op.status', text: 'يرى الزبون أين وصل طلبه، وينادي النادل أو يطلب الحساب من الطاولة.' },
          { claim: 'op.split', text: 'في الكاشير، يُقسَّم الحساب حسب الأطباق أو بالتساوي. وعلى هاتفه، يحسب الزبون حصته، ويتم التحصيل في الكاشير.' },
          { claim: 'op.nopay', text: 'لا دفع عبر الإنترنت: يدفع الزبون على الطاولة أو في الكونتوار، كالعادة.' },
        ],
      },
      {
        id: 'service', kicker: 'الخدمة',
        title: 'القائمة تواكب ما يجري في القاعة.',
        body: [
          'نفد طبق اليوم، والمطبخ يغلق في الحادية عشرة ليلا، وأحدهم يريد طلبا سفريا. يتعامل OrderPro مع هذه الحالات الثلاث.',
        ],
        points: [
          { claim: 'op.soldout', text: 'يُسحب الطبق النافد من القائمة، حتى ساعة محددة إن شئت، ويُرفض أي طلب عليه.' },
          { claim: 'op.hours', text: 'خارج الأوقات المنشورة، أو حين يكون الكاشير مطفأ، تتوقف القائمة عن استقبال الطلبات.' },
          { claim: 'op.takeaway', text: 'رمز QR أو رابط للطلبات السفرية، تُدفع في الكونتوار.' },
          { claim: 'op.booking', text: 'رابط حجز عمومي، بمواعيد محسوبة من طاولاتك وأوقات عملك.' },
        ],
      },
    ],
    plan: {
      title: 'OrderPro مشمول في Kiwi Pro.',
      body: 'يجمع Kiwi Pro بين OrderPro ومخطط الصالة وتسجيل الطلبات بواسطة النُّدُل وشاشة المطبخ والقائمة متعددة اللغات. ويفعّل فريق Kiwi خدمة OrderPro لمطعمك أثناء الإعداد.',
      demo: 'مرحبا، أريد عرضا توضيحيا لـ OrderPro، الطلب عبر رمز QR من Kiwi، لمطعمي.',
    },
    faq: [
      ['هل يجب على الزبون تحميل تطبيق؟', 'لا. يفتح رمز QR صفحة ويب في متصفح الهاتف. يختار الزبون لغته ويطلب.'],
      ['هل تذهب الطلبات مباشرة إلى المطبخ؟', 'لا. يصل كل طلب أولا إلى الكاشير. يقبله أحد أفراد الفريق، وعندها فقط تذهب التذكرة إلى المطبخ.'],
      ['هل يمكن للزبون الدفع من هاتفه؟', 'لا. لا يستقبل OrderPro أي دفع عبر الإنترنت. يدفع الزبون على الطاولة أو في الكونتوار، ويمكن تقسيم الحساب في الكاشير حسب الأطباق أو بالتساوي.'],
      ['بأي لغات تظهر القائمة؟', 'بالفرنسية والإنجليزية والعربية، وبلغات أخرى إذا نشرت ترجمة أطباقك.'],
      ['كم يكلف OrderPro؟', 'OrderPro مشمول في Kiwi Pro، بمبلغ 399 درهما في الشهر، أو 349 درهما في الشهر في الاشتراك السنوي. الأيام الخمسة عشر الأولى مجانية ودون التزام، ولا يأخذ Kiwi أي عمولة على الطلبات.'],
    ],
  },
};
