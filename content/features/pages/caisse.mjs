/* Page « Caisse ». Chaque phrase qui décrit ce que fait le logiciel porte un
 * identifiant de promesse (`claim`) ; tools/feature-claims-map.json relie cet
 * identifiant au test qui le prouve. Le texte autour (le pourquoi, le
 * contexte) n'affirme rien que le logiciel doive tenir. */
export default {
  fr: {
    nav: 'Caisse',
    card: 'Encaisser sans Internet, scanner, imprimer en arabe, fermer la caisse et tenir le carnet de crédit.',
    eyebrow: 'Caisse · dès Kiwi Basic',
    h1: ['Logiciel de caisse pour commerce au Maroc,', 'même sans Internet.'],
    deck: 'Kiwi est une caisse qui tourne dans le navigateur, sur PC, tablette ou iPad. Elle continue d’encaisser quand le réseau coupe, lit les codes-barres, imprime des tickets en français et en arabe, et vous rend une journée qui tombe juste. À partir de 150 MAD par mois.',
    hero: { shot: 'caisse-restaurant', alt: 'La caisse Kiwi d’un restaurant de démonstration : la carte en tuiles, un ticket à emporter et le bouton Encaisser.' },
    facts: [
      { claim: 'caisse.offline', text: 'Sans Internet, la caisse continue d’encaisser. Les ventes attendent dans l’appareil et partent dès que le réseau revient, sans doublon.' },
      { claim: 'caisse.scan', text: 'Une douchette USB ou la caméra du téléphone lit les codes-barres, zéros de tête compris.' },
      { claim: 'caisse.carnet', text: 'Le carnet de crédit garde ce que doit chaque client, et chaque règlement, total ou partiel.' },
    ],
    sections: [
      {
        id: 'hors-ligne', kicker: 'Hors ligne',
        title: 'Le réseau coupe, la vente continue.',
        body: [
          'Au Maroc, une coupure de fibre ou une 4G saturée un samedi soir, ça arrive. Une caisse qui attend le serveur pour encaisser vous fait perdre la file.',
          'Kiwi enregistre chaque vente sur l’appareil d’abord. Quand la connexion revient, les ventes remontent dans l’ordre vers votre tableau de bord.',
        ],
        points: [
          { claim: 'caisse.offline' },
          { claim: 'caisse.devices', text: 'La caisse s’ouvre dans le navigateur : PC, Mac, tablette Android ou iPad. Il n’y a rien à installer pour vendre.' },
        ],
        shot: { name: 'caisse-boutique', alt: 'La caisse boutique de démonstration : les articles par famille, deux caftans au ticket et le total de 5 900 MAD.' },
      },
      {
        id: 'scan', kicker: 'Scan et tickets',
        title: 'Le scan et le ticket, sans attendre.',
        body: [
          'À la caisse, chaque seconde se voit dans la file. On bipe, on encaisse, et le ticket doit suivre sans qu’on y pense.',
        ],
        points: [
          { claim: 'caisse.scan' },
          { claim: 'caisse.receipt', text: 'Le ticket sort tout seul à l’encaissement quand une imprimante est réglée. Une réimpression porte la mention duplicata.' },
          { claim: 'caisse.arabic', text: 'Les tickets en arabe s’impriment en vraies lettres. Si l’appareil ne sait pas les dessiner, Kiwi refuse d’imprimer des points d’interrogation.' },
        ],
      },
      {
        id: 'imprimantes', kicker: 'Imprimantes',
        title: 'Votre imprimante thermique, branchée comme vous voulez.',
        body: [
          'Vous gardez souvent l’imprimante déjà posée sur le comptoir. Kiwi parle ESC/POS, le langage de la plupart des imprimantes ticket, et passe par le chemin qui marche chez vous.',
        ],
        points: [
          { claim: 'caisse.print-direct', text: 'En Bluetooth ou en USB, directement depuis Chrome ou Edge, sans logiciel en plus.' },
          { claim: 'caisse.bridge', text: 'Avec Kiwi Printer Bridge, sur l’ordinateur du comptoir (même un vieux Windows 7) ou sur un appareil Android, pour les imprimantes réseau ou déjà installées.' },
          { claim: 'caisse.cloudprint', text: 'Sur iPad, la caisse dépose le ticket en ligne et le bridge du comptoir l’imprime. Il s’appaire une seule fois, avec un code à 6 chiffres.' },
          { claim: 'caisse.drawer', text: 'Sur la caisse restaurant et la caisse épicerie, le tiroir s’ouvre à l’encaissement en espèces. Un paiement par carte ne l’ouvre pas.' },
        ],
      },
      {
        id: 'tiroir', kicker: 'Fond de caisse',
        title: 'Un fond au début, un comptage à la fin.',
        body: [
          'Une caisse qui ne tombe pas juste, c’est une discussion désagréable en fin de journée. Kiwi la remplace par des chiffres que tout le monde voit.',
        ],
        points: [
          { claim: 'caisse.session', text: 'On ouvre la caisse avec un fond, on la ferme en comptant. Kiwi montre l’écart entre l’attendu et le compté, et ne laisse pas cacher un manque.' },
          { claim: 'caisse.manager', text: 'Chaque employé a son code personnel. Annuler une vente encaissée demande le code d’un manager.' },
          { claim: 'caisse.discount', text: 'Une remise se fait avec un motif. Celle qui sort de vos règles est signalée au propriétaire.' },
        ],
        shot: { name: 'caisse-ouverture', alt: 'L’écran d’ouverture de la caisse Kiwi : le caissier choisit son fond de caisse, 300, 500 ou 1 000 MAD.' },
      },
      {
        id: 'journee', kicker: 'Fin de journée',
        title: 'La journée, sur un seul ticket.',
        body: [
          'Le soir, vous voulez savoir combien est entré, par quel moyen, et ce qui reste dehors. Sans refaire les comptes à la main.',
        ],
        points: [
          { claim: 'caisse.dayreport', text: 'Le rapport journalier totalise les ventes par moyen de paiement, remboursements déduits, et s’imprime sur l’imprimante ticket.' },
          { claim: 'caisse.invoice', text: 'Les factures portent l’ICE, l’IF et le RC du commerce. La TVA de la facture est celle du ticket, au centime près.' },
        ],
        shot: { name: 'caisse-journee', alt: 'La journée de l’épicerie de démonstration : ventes encaissées, crédit en cours, produits les plus vendus et moyens de paiement.' },
      },
      {
        id: 'carnet', kicker: 'Carnet de crédit',
        title: 'Le carnet de crédit, sans le cahier.',
        body: [
          'Dans un quartier, on fait crédit aux voisins. Le cahier se perd, se tache, et personne ne se souvient du montant exact. Kiwi garde l’ardoise de chaque client.',
        ],
        points: [
          { claim: 'caisse.carnet' },
          { claim: 'caisse.returns', text: 'À partir de Kiwi Plus : retours, échanges et avoirs, remboursement partiel compris.' },
        ],
        shot: { name: 'caisse-carnet', alt: 'Le carnet de crédit de l’épicerie de démonstration : chaque voisin avec ce qu’il doit et la date de son dernier mouvement.' },
      },
    ],
    plan: {
      title: 'La caisse est dans Kiwi Basic.',
      body: 'Tout ce qui est décrit sur cette page est inclus dès Basic, sauf les retours, échanges et avoirs, qui commencent à Plus.',
      demo: 'Bonjour, je voudrais une démo de la caisse Kiwi pour mon commerce.',
    },
    faq: [
      ['La caisse Kiwi fonctionne-t-elle sans Internet ?', 'Oui. La caisse enregistre chaque vente sur l’appareil, puis l’envoie quand la connexion revient. Une vente rejouée plusieurs fois n’est comptée qu’une fois.'],
      ['Quel matériel faut-il pour commencer ?', 'Un navigateur récent sur PC, Mac, tablette ou iPad suffit pour vendre. Pour aller plus loin : une imprimante ticket ESC/POS, un tiroir-caisse branché sur l’imprimante et une douchette USB. Vous pouvez souvent garder votre matériel actuel.'],
      ['Peut-on imprimer depuis un iPad ?', 'Oui. Safari sur iPad n’a ni Bluetooth ni USB pour l’imprimante, alors la caisse dépose le ticket en ligne et Kiwi Printer Bridge, installé sur un ordinateur ou un appareil Android du comptoir, l’imprime.'],
      ['Les tickets peuvent-ils être en arabe ?', 'Oui. Kiwi dessine l’arabe pour l’imprimante thermique, ce qui évite les points d’interrogation que beaucoup d’imprimantes affichent à la place des lettres.'],
      ['Combien coûte la caisse Kiwi ?', 'Kiwi Basic coûte 150 MAD par mois, ou 99 MAD par mois en annuel, soit 1 188 MAD payés en une fois. Les 15 premiers jours sont gratuits et sans engagement. Kiwi ne prend aucune commission sur vos ventes.'],
    ],
  },
  en: {
    nav: 'Point of sale',
    card: 'Sell offline, scan barcodes, print in Arabic, close the till and keep the credit book.',
    eyebrow: 'Point of sale · from Kiwi Basic',
    h1: ['Point of sale software for shops in Morocco,', 'even offline.'],
    deck: 'Kiwi is a till that runs in the browser, on a PC, a tablet or an iPad. It keeps selling when the network drops, reads barcodes, prints receipts in French and Arabic, and gives you a day that adds up. From 150 MAD a month.',
    hero: { shot: 'caisse-restaurant', alt: 'The Kiwi till in a demo restaurant: the menu as tiles, a takeaway ticket and the Charge button.' },
    facts: [
      { claim: 'caisse.offline', text: 'Without internet, the till keeps taking payments. Sales wait on the device and go out as soon as the network is back, with no duplicates.' },
      { claim: 'caisse.scan', text: 'A USB scanner or the phone camera reads barcodes, leading zeros included.' },
      { claim: 'caisse.carnet', text: 'The credit book keeps what each customer owes, and every repayment, in full or in part.' },
    ],
    sections: [
      {
        id: 'offline', kicker: 'Offline',
        title: 'The network drops, the sale goes on.',
        body: [
          'In Morocco, a fibre cut or a saturated 4G line on a Saturday night happens. A till that waits for the server before it can charge loses you the queue.',
          'Kiwi records every sale on the device first. When the connection comes back, sales travel up to your dashboard in order.',
        ],
        points: [
          { claim: 'caisse.offline' },
          { claim: 'caisse.devices', text: 'The till opens in the browser: PC, Mac, Android tablet or iPad. You do not need to install anything to start selling.' },
        ],
        shot: { name: 'caisse-boutique', alt: 'The demo boutique till: items by family, two caftans on the ticket and a 5,900 MAD total.' },
      },
      {
        id: 'scan', kicker: 'Scanning and receipts',
        title: 'Scanning and the receipt, without the wait.',
        body: [
          'At the till, every second shows in the queue. You beep, you charge, and the receipt should follow without anyone thinking about it.',
        ],
        points: [
          { claim: 'caisse.scan' },
          { claim: 'caisse.receipt', text: 'The receipt prints by itself at checkout when a printer is set up. A reprint is marked as a duplicate.' },
          { claim: 'caisse.arabic', text: 'Arabic receipts print as real letters. If the device cannot draw them, Kiwi refuses to print question marks.' },
        ],
      },
      {
        id: 'printers', kicker: 'Printers',
        title: 'Your thermal printer, connected the way you want.',
        body: [
          'You often keep the printer already sitting on the counter. Kiwi speaks ESC/POS, the language of most receipt printers, and uses whichever route works in your shop.',
        ],
        points: [
          { claim: 'caisse.print-direct', text: 'Over Bluetooth or USB, straight from Chrome or Edge, with no extra software.' },
          { claim: 'caisse.bridge', text: 'With Kiwi Printer Bridge, on the counter computer (even an old Windows 7) or on an Android device, for network printers or printers already installed.' },
          { claim: 'caisse.cloudprint', text: 'On an iPad, the till drops the receipt online and the counter bridge prints it. It pairs once, with a 6-digit code.' },
          { claim: 'caisse.drawer', text: 'On the restaurant and grocery tills, the drawer opens when you take cash. A card payment does not open it.' },
        ],
      },
      {
        id: 'cash-drawer', kicker: 'Cash float',
        title: 'A float at the start, a count at the end.',
        body: [
          'A till that does not balance means an awkward conversation at closing time. Kiwi replaces it with numbers everyone can see.',
        ],
        points: [
          { claim: 'caisse.session', text: 'You open the till with a float and close it by counting. Kiwi shows the gap between expected and counted cash, and does not let a shortage be hidden.' },
          { claim: 'caisse.manager', text: 'Each employee has a personal code. Voiding a completed sale needs a manager’s code.' },
          { claim: 'caisse.discount', text: 'A discount needs a reason. One that falls outside your rules is flagged to the owner.' },
        ],
        shot: { name: 'caisse-ouverture', alt: 'The Kiwi till opening screen: the cashier picks the float, 300, 500 or 1,000 MAD.' },
      },
      {
        id: 'end-of-day', kicker: 'End of day',
        title: 'The whole day, on one receipt.',
        body: [
          'In the evening you want to know how much came in, by which method, and what is still owed. Without redoing the sums by hand.',
        ],
        points: [
          { claim: 'caisse.dayreport', text: 'The daily report totals sales by payment method, net of refunds, and prints on the receipt printer.' },
          { claim: 'caisse.invoice', text: 'Invoices carry the shop’s ICE, IF and RC numbers. The VAT on the invoice matches the receipt to the centime.' },
        ],
        shot: { name: 'caisse-journee', alt: 'The demo grocery’s day: takings, credit outstanding, best sellers and payment methods.' },
      },
      {
        id: 'credit-book', kicker: 'Credit book',
        title: 'The credit book, without the notebook.',
        body: [
          'In a neighbourhood shop, you give credit to the neighbours. The notebook gets lost or stained, and nobody remembers the exact amount. Kiwi keeps each customer’s tab.',
        ],
        points: [
          { claim: 'caisse.carnet' },
          { claim: 'caisse.returns', text: 'From Kiwi Plus: returns, exchanges and credit notes, partial refunds included.' },
        ],
        shot: { name: 'caisse-carnet', alt: 'The demo grocery’s credit book: each neighbour with what they owe and the date of their last movement.' },
      },
    ],
    plan: {
      title: 'The till is in Kiwi Basic.',
      body: 'Everything on this page is included from Basic, except returns, exchanges and credit notes, which start with Plus.',
      demo: 'Hello, I would like a demo of the Kiwi till for my business.',
    },
    faq: [
      ['Does the Kiwi till work without internet?', 'Yes. The till records every sale on the device, then sends it when the connection comes back. A sale replayed several times is counted once.'],
      ['What hardware do I need to start?', 'A recent browser on a PC, Mac, tablet or iPad is enough to sell. To go further: an ESC/POS receipt printer, a cash drawer connected to the printer and a USB scanner. You can often keep the hardware you already have.'],
      ['Can I print from an iPad?', 'Yes. Safari on iPad has no Bluetooth or USB access for the printer, so the till drops the receipt online and Kiwi Printer Bridge, installed on a computer or an Android device at the counter, prints it.'],
      ['Can receipts be in Arabic?', 'Yes. Kiwi draws Arabic for the thermal printer, which avoids the question marks many printers show instead of the letters.'],
      ['How much does the Kiwi till cost?', 'Kiwi Basic costs 150 MAD a month, or 99 MAD a month on the annual plan, which is 1,188 MAD paid once. The first 15 days are free, with no commitment. Kiwi takes no commission on your sales.'],
    ],
  },
  ar: {
    nav: 'الكاشير',
    card: 'البيع دون إنترنت، قراءة الباركود، الطباعة بالعربية، إغلاق الصندوق وحفظ دفتر الديون.',
    eyebrow: 'الكاشير · ابتداء من Kiwi Basic',
    h1: ['برنامج كاشير للمتاجر في المغرب،', 'حتى دون إنترنت.'],
    deck: 'Kiwi كاشير يعمل داخل المتصفح، على الحاسوب أو اللوحة أو الآيباد. يواصل البيع حين ينقطع الإنترنت، ويقرأ الباركود، ويطبع التذاكر بالفرنسية والعربية، ويعطيك حساب يوم مضبوطا. ابتداء من 150 درهما في الشهر.',
    hero: { shot: 'caisse-restaurant', alt: 'كاشير Kiwi في مطعم تجريبي: القائمة في مربعات، وتذكرة طلب سفري، وزر التحصيل.' },
    facts: [
      { claim: 'caisse.offline', text: 'دون إنترنت، يواصل الكاشير التحصيل. تبقى المبيعات في الجهاز وتُرسل فور عودة الشبكة، دون تكرار.' },
      { claim: 'caisse.scan', text: 'قارئ باركود USB أو كاميرا الهاتف يقرأ الرموز، بما فيها الأصفار في بدايتها.' },
      { claim: 'caisse.carnet', text: 'دفتر الديون يحفظ ما على كل زبون، وكل تسديد كامل أو جزئي.' },
    ],
    sections: [
      {
        id: 'offline', kicker: 'دون إنترنت',
        title: 'تنقطع الشبكة، ويستمر البيع.',
        body: [
          'في المغرب، انقطاع الألياف أو ازدحام شبكة 4G ليلة السبت أمر وارد. والكاشير الذي ينتظر الخادم ليحصّل يجعلك تخسر الطابور.',
          'يسجل Kiwi كل عملية بيع على الجهاز أولا. وحين يعود الاتصال، تصعد المبيعات بالترتيب إلى لوحة التحكم.',
        ],
        points: [
          { claim: 'caisse.offline' },
          { claim: 'caisse.devices', text: 'يُفتح الكاشير في المتصفح: حاسوب PC أو Mac أو لوحة Android أو آيباد. لا شيء يحتاج إلى تثبيت لتبدأ البيع.' },
        ],
        shot: { name: 'caisse-boutique', alt: 'كاشير البوتيك التجريبي: السلع حسب العائلة، وقفطانان في التذكرة، ومجموع 5900 درهم.' },
      },
      {
        id: 'scan', kicker: 'الباركود والتذاكر',
        title: 'المسح والتذكرة، دون انتظار.',
        body: [
          'الحركة الأساسية يجب أن تكون سريعة: تمسح، تحصّل، فتخرج التذكرة. والباقي يأتي بعد ذلك.',
        ],
        points: [
          { claim: 'caisse.scan' },
          { claim: 'caisse.receipt', text: 'تخرج التذكرة وحدها عند التحصيل إذا كانت الطابعة مضبوطة. وتحمل إعادة الطباعة عبارة نسخة.' },
          { claim: 'caisse.arabic', text: 'تُطبع التذاكر العربية بحروف حقيقية. وإذا عجز الجهاز عن رسمها، يرفض Kiwi طباعة علامات استفهام.' },
        ],
      },
      {
        id: 'printers', kicker: 'الطابعات',
        title: 'طابعتك الحرارية، موصولة بالطريقة التي تناسبك.',
        body: [
          'غالبا تحتفظ بالطابعة الموجودة أصلا على الكونتوار. يتكلم Kiwi لغة ESC/POS، وهي لغة أغلب طابعات التذاكر، ويمر من الطريق الذي يعمل عندك.',
        ],
        points: [
          { claim: 'caisse.print-direct', text: 'عبر البلوتوث أو USB، مباشرة من Chrome أو Edge، دون برنامج إضافي.' },
          { claim: 'caisse.bridge', text: 'عبر Kiwi Printer Bridge، على حاسوب الكونتوار (ولو كان Windows 7 قديما) أو على جهاز Android، للطابعات الشبكية أو المثبتة مسبقا.' },
          { claim: 'caisse.cloudprint', text: 'على الآيباد، يضع الكاشير التذكرة على الإنترنت ويطبعها جسر الكونتوار. يُربط مرة واحدة برمز من 6 أرقام.' },
          { claim: 'caisse.drawer', text: 'في كاشير المطعم وكاشير البقالة، يُفتح الدرج عند التحصيل نقدا. والدفع بالبطاقة لا يفتحه.' },
        ],
      },
      {
        id: 'cash-drawer', kicker: 'رصيد الصندوق',
        title: 'رصيد في البداية، وعدّ في النهاية.',
        body: [
          'الصندوق الذي لا يتطابق يعني نقاشا مزعجا آخر النهار. يعوضه Kiwi بأرقام يراها الجميع.',
        ],
        points: [
          { claim: 'caisse.session', text: 'تفتح الصندوق برصيد، وتغلقه بالعدّ. يعرض Kiwi الفارق بين المتوقع والمعدود، ولا يسمح بإخفاء أي نقص.' },
          { claim: 'caisse.manager', text: 'لكل موظف رمزه الشخصي. وإلغاء بيع محصَّل يتطلب رمز المسؤول.' },
          { claim: 'caisse.discount', text: 'يتم الخصم بسبب محدد. والخصم الذي يخرج عن قواعدك يُبلَّغ به المالك.' },
        ],
        shot: { name: 'caisse-ouverture', alt: 'شاشة فتح كاشير Kiwi: يختار الكاشير رصيد الصندوق، 300 أو 500 أو 1000 درهم.' },
      },
      {
        id: 'end-of-day', kicker: 'نهاية اليوم',
        title: 'اليوم كله، في تذكرة واحدة.',
        body: [
          'في المساء تريد أن تعرف كم دخل، وبأي وسيلة، وما بقي في الخارج. دون إعادة الحساب باليد.',
        ],
        points: [
          { claim: 'caisse.dayreport', text: 'يجمع التقرير اليومي المبيعات حسب وسيلة الدفع، بعد خصم المبالغ المستردة، ويُطبع على طابعة التذاكر.' },
          { claim: 'caisse.invoice', text: 'تحمل الفواتير رقم ICE وIF وRC الخاص بالمحل. والضريبة على القيمة المضافة في الفاتورة هي نفسها في التذكرة، بالسنتيم.' },
        ],
        shot: { name: 'caisse-journee', alt: 'يوم البقالة التجريبية: المبالغ المحصلة، والديون الجارية، والمنتجات الأكثر مبيعا، ووسائل الدفع.' },
      },
      {
        id: 'credit-book', kicker: 'دفتر الديون',
        title: 'دفتر الديون، دون الكُنّاش.',
        body: [
          'في الحي، نبيع للجيران بالدين. الكُنّاش يضيع أو يتلطخ، ولا أحد يتذكر المبلغ بالضبط. يحفظ Kiwi حساب كل زبون.',
        ],
        points: [
          { claim: 'caisse.carnet' },
          { claim: 'caisse.returns', text: 'ابتداء من Kiwi Plus: المرتجعات والاستبدال والإشعارات الدائنة، بما فيها الاسترداد الجزئي.' },
        ],
        shot: { name: 'caisse-carnet', alt: 'دفتر ديون البقالة التجريبية: كل جار وما عليه وتاريخ آخر حركة.' },
      },
    ],
    plan: {
      title: 'الكاشير مشمول في Kiwi Basic.',
      body: 'كل ما في هذه الصفحة مشمول ابتداء من Basic، باستثناء المرتجعات والاستبدال والإشعارات الدائنة التي تبدأ مع Plus.',
      demo: 'مرحبا، أريد عرضا توضيحيا لكاشير Kiwi لمحلي التجاري.',
    },
    faq: [
      ['هل يعمل كاشير Kiwi دون إنترنت؟', 'نعم. يسجل الكاشير كل عملية بيع على الجهاز، ثم يرسلها حين يعود الاتصال. والبيع الذي يُعاد إرساله عدة مرات يُحتسب مرة واحدة.'],
      ['ما المعدات اللازمة للبدء؟', 'يكفي متصفح حديث على حاسوب PC أو Mac أو لوحة أو آيباد للبيع. وللتوسع: طابعة تذاكر ESC/POS، ودرج نقود موصول بالطابعة، وقارئ باركود USB. وغالبا يمكنك الاحتفاظ بمعداتك الحالية.'],
      ['هل يمكن الطباعة من آيباد؟', 'نعم. متصفح Safari على الآيباد لا يصل إلى البلوتوث ولا إلى USB الخاص بالطابعة، لذلك يضع الكاشير التذكرة على الإنترنت، ويطبعها Kiwi Printer Bridge المثبت على حاسوب أو جهاز Android في الكونتوار.'],
      ['هل يمكن أن تكون التذاكر بالعربية؟', 'نعم. يرسم Kiwi الحروف العربية للطابعة الحرارية، فيتجنب علامات الاستفهام التي تظهرها طابعات كثيرة مكان الحروف.'],
      ['كم يكلف كاشير Kiwi؟', 'يكلف Kiwi Basic مبلغ 150 درهما في الشهر، أو 99 درهما في الشهر في الاشتراك السنوي، أي 1188 درهما تُدفع مرة واحدة. الأيام الخمسة عشر الأولى مجانية ودون التزام. ولا يأخذ Kiwi أي عمولة على مبيعاتك.'],
    ],
  },
};
