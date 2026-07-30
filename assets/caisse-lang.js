/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LANGUE DE LA CAISSE — window.KiwiCaisseLang
 * ---------------------------------------------------------------------------
 * Le tableau de bord parle trois langues depuis toujours (assets/i18n.js, 129
 * `data-i18n` dans dashboard.html). La caisse, zéro. Un commerçant pouvait
 * choisir sa langue au bureau et retrouver son comptoir en français, alors que
 * c'est AU COMPTOIR que la langue compte : la personne qui tient la caisse
 * n'est pas toujours celle qui a signé le contrat.
 *
 * ── Pourquoi pas le motif `data-i18n` du tableau de bord ──────────────────
 * Là-bas les libellés sont dans le HTML, on peut les baliser. Ici l'écrasante
 * majorité des textes est FABRIQUÉE en JavaScript, à chaque rendu, dans des
 * gabarits (`renderGrid`, `renderTicket`, `renderPromos`…). Baliser voudrait
 * dire réécrire quinze fichiers de caisse et rebaliser chaque nouvelle ligne
 * pour toujours — un travail qui se défait tout seul à la première évolution.
 *
 * On prend donc le français comme CLÉ. C'est déjà la langue de référence du
 * dépôt : ce qui est écrit dans le code est la version française, mot pour mot.
 * Un balayage des nœuds de texte après chaque rendu remplace ce qu'il
 * reconnaît, et laisse le reste tel quel.
 *
 * ── Ce que ça implique, dit franchement ───────────────────────────────────
 * Une phrase absente du dictionnaire reste en français. C'est volontaire : un
 * écran à moitié traduit reste utilisable, un écran traduit à moitié FAUX ne
 * l'est pas. Le dictionnaire couvre le rail, l'écran de vente, le ticket, les
 * promotions et les écrans que touche une caissière ; les profondeurs de
 * l'inventaire et les quatorze autres métiers se complètent au fil de l'usage.
 *
 * Ce qui n'est JAMAIS traduit : les données du commerçant. Les noms d'articles,
 * de clientes, les montants, les codes-barres ne traversent pas le
 * dictionnaire — on ne remplace qu'une correspondance EXACTE avec une phrase
 * d'interface connue.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'kiwiCaisseLang';
  var LANGS = [
    { id: 'fr', code: 'FR', label: 'Français', dir: 'ltr' },
    { id: 'en', code: 'EN', label: 'English', dir: 'ltr' },
    { id: 'ar', code: 'ع', label: 'العربية', dir: 'rtl' },
  ];

  /* ───────────────────────── le dictionnaire ─────────────────────────
     Clé = la phrase française EXACTE telle qu'elle est écrite dans le code.
     Une clé qui ne correspond plus (parce que le français a changé) cesse
     simplement de s'appliquer : la caisse retombe en français, elle ne casse
     pas. C'est la bonne défaillance pour une caisse. */
  var DICT = {
    en: {
      /* ── rail ── */
      'Vente': 'Sale', 'Scan': 'Scan', 'Inventaire': 'Stock',
      'Échanges & avoirs': 'Returns & credit', 'Clientes': 'Customers',
      'Clients': 'Customers', 'Promotions': 'Promotions',
      'Plein écran': 'Fullscreen', 'Quitter le plein écran': 'Exit fullscreen',
      'Fin de service': 'End of shift', 'Verrouiller': 'Lock',
      'Rafraîchir': 'Refresh', 'Réimprimer': 'Reprint',
      'En ligne': 'Online', 'Hors-ligne': 'Offline', 'Hors ligne': 'Offline',
      'En ligne · synchronisé': 'Online · synced', 'Langue': 'Language',
      'Le même Kiwi, un seul compte.': 'One Kiwi, one account.',
      /* La signature du rail est coupée par un `<b>` : « Le même Kiwi,
         <b>un seul compte</b>. » Le balayage travaille nœud par nœud, il ne voit
         donc JAMAIS la phrase entière — seulement ses deux moitiés. On donne les
         deux, dans le même ordre dans les trois langues : le gras tombe au bon
         endroit sans qu'on ait à toucher au gabarit. */
      'Le même Kiwi,': 'One Kiwi,', 'un seul compte': 'one account',

      /* ── écran de vente ── */
      'Scannez un code-barres, ou touchez un article': 'Scan a barcode, or tap an item',
      'Scannez un code-barres pour l’ajouter au ticket…': 'Scan a barcode to add it to the sale…',
      'Scannez un code-barres pour l\'ajouter au ticket…': 'Scan a barcode to add it to the sale…',
      'Entrée': 'Enter', 'ENTRÉE': 'ENTER', 'Tous': 'All', 'En promo': 'On sale',
      'Divers': 'Other', 'épuisé': 'out of stock', 'ÉPUISÉ': 'OUT OF STOCK',
      'stock bas': 'low stock', 'Épuisé': 'Out of stock', 'Stock bas': 'Low stock',
      'Disponible': 'In stock', 'Envoyer vers la vente': 'Send to the sale',

      /* ── ticket ── */
      'Ticket': 'Sale', 'Vider': 'Clear', 'Total': 'Total',
      'Attacher une cliente': 'Attach a customer',
      'Téléphone d’abord, points et taille suivent': 'Phone first, points and size follow',
      'Téléphone d\'abord, points et taille suivent': 'Phone first, points and size follow',
      'Chercher': 'Search', 'Changer': 'Change', 'Cliente de passage': 'Walk-in customer',
      'Sans fiche, retrouvable par n° de ticket': 'No record, findable by receipt number',
      'Le ticket est vide.': 'The sale is empty.',
      'Touchez un article dans la grille, ou scannez son code-barres.': 'Tap an item in the grid, or scan its barcode.',
      'Encaisser': 'Take payment', 'Remise': 'Discount', 'Récompense': 'Reward',
      'article': 'item', 'articles': 'items',
      'Récompense appliquée': 'Reward applied', 'Récompense prête': 'Reward ready',
      'Points débités à l’encaissement': 'Points deducted at payment',
      'Utiliser': 'Use', 'Annuler': 'Cancel', 'Ajouter au ticket': 'Add to the sale',
      'Quantité': 'Quantity', 'Couleur': 'Colour', 'Taille': 'Size', 'Sans': 'None',
      'accord gérante': 'manager approval', 'en stock': 'in stock',
      'habituelle': 'usual', 'Choisir cet article': 'Choose this item',

      /* ── promotions ── */
      'de remise': 'off', 'prix fixe': 'fixed price',
      '{n} article concerné': '{n} item covered', '{n} articles concernés': '{n} items covered',
      '{n} promotion en cours': '{n} promotion running', '{n} promotions en cours': '{n} promotions running',
      '{n} article remisé': '{n} item discounted', '{n} articles remisés': '{n} items discounted',
      'Se termine dans {n} jours': 'Ends in {n} days', 'Démarre dans {n} jours': 'Starts in {n} days',
      'Se termine demain': 'Ends tomorrow', 'Démarre demain': 'Starts tomorrow',
      'Il en reste {n} ou moins': '{n} left or fewer',
      /* Le bandeau du carnet clients : « 1 pt / MAD · palier 100 ». */
      '{n} pt / MAD': '{n} pt per MAD', 'palier {n}': 'tier {n}',
      /* Les segments d'une fiche cliente. « Nouveau » est un mot courant : il ne
         se traduit que seul, dans son propre nœud — jamais au milieu d'un nom. */
      'Régulier': 'Regular', 'Nouveau': 'New', 'Dormant': 'Dormant',
      /* La fiche cliente et son formulaire — le carnet est une page à part
         entière, il se lit en entier dans la langue du comptoir. */
      'Récompense prête': 'Reward ready', 'récompense {x}': 'reward {x}',
      'Visites': 'Visits', 'Dépensé (MAD)': 'Spent (MAD)', 'Dernière visite': 'Last visit',
      'Email': 'Email', 'Ville': 'City', 'Adresse': 'Address', 'Anniversaire': 'Birthday',
      'Genre': 'Gender', 'Notes': 'Notes', 'Consentement': 'Consent', 'Aucun': 'None',
      'Enregistrer un achat': 'Record a purchase', 'Ajouter un tampon': 'Add a stamp',
      'Valider': 'Confirm', 'Ajouter': 'Add', 'Retour': 'Back', 'Sans nom': 'No name',
      'Offrir la récompense': 'Give the reward', 'réinitialiser': 'reset',
      'Montant en MAD': 'Amount in MAD',
      'Modifier le client': 'Edit customer', 'Nom complet': 'Full name', 'Téléphone': 'Phone',
      'Femme': 'Woman', 'Homme': 'Man', 'Autre': 'Other',
      'Renseignez un maximum d’informations — elles nourrissent la fidélité et le marketing.':
        'Fill in as much as you can — it feeds loyalty and marketing.',
      'Accepte les messages': 'Accepts messages via', 'Accepte les': 'Accepts',
      'emails marketing': 'marketing emails',
      '(offres, fidélité). Consentement requis': '(offers, loyalty). Consent required',
      'CNDP loi 09-08.': 'CNDP law 09-08.',
      'Prénom Nom': 'First name Last name', 'nom@email.com': 'name@email.com',
      'Quartier, rue…': 'District, street…',
      'Préférences, tailles, allergies…': 'Preferences, sizes, allergies…',
      'visite': 'visit', 'visites': 'visits', 'achat': 'purchase', 'achats': 'purchases',
      '{n} j': '{n} d',
      '+1 tampon': '+1 stamp',
      'Client ajouté': 'Customer added', 'Client mis à jour': 'Customer updated',
      'Client supprimé': 'Customer deleted', 'Client déjà enregistré': 'Customer already on file',
      'Achat enregistré': 'Purchase recorded', 'Saisissez un montant': 'Enter an amount',
      'Récompense offerte': 'Reward given', 'Carte réinitialisée.': 'Card reset.',
      'Renseignez au moins un nom ou un numéro': 'Enter at least a name or a number',
      'Le consentement est requis': 'Consent is required',
      'Cochez la case WhatsApp / SMS pour enregistrer.': 'Tick the WhatsApp / SMS box to save.',
      'Sans date de fin, jusqu’à ce que vous l’arrêtiez': 'No end date, until you stop it',
      'Sans date de fin, jusqu\'à ce que vous l\'arrêtiez': 'No end date, until you stop it',
      'En pause, aucun prix n’est modifié': 'Paused, no price is changed',
      'En pause, aucun prix n\'est modifié': 'Paused, no price is changed',
      '{n} ou moins': '{n} or fewer', '{n} jours': '{n} days',
      /* Le bandeau du jour : « jeu. 30 juil. · 18:55 · 5 ventes · 5 550 MAD
         aujourd'hui ». C'est la ligne la plus regardée de l'écran de vente. */
      '{n} vente': '{n} sale', '{n} ventes': '{n} sales',
      '{n} MAD aujourd’hui': '{n} MAD today', '{n} MAD aujourd\'hui': '{n} MAD today',
      /* « par Salma » — un mot d'interface suivi d'une donnée du commerçant.
         Le {x} traverse intact : c'est le prénom de la caissière. */
      'par {x}': 'by {x}',
      'Nouvelle promotion': 'New promotion', 'Modifier la promotion': 'Edit promotion',
      'En cours': 'Running', 'À venir': 'Upcoming', 'Terminées': 'Finished',
      'Programmée': 'Scheduled', 'En pause': 'Paused', 'Terminée': 'Finished',
      'Tout le magasin': 'The whole shop', 'Un rayon': 'One category',
      'Des articles': 'Chosen items', 'Ancien stock': 'Old stock', 'Fin de série': 'Last few',
      'De combien': 'By how much', 'Sur quoi': 'On what', 'Jusqu’à quand': 'Until when',
      'Jusqu\'à quand': 'Until when',
      'En pourcentage': 'Percentage', 'En dirhams': 'In dirhams', 'Prix fixe': 'Fixed price',
      'Aujourd’hui': 'Today', 'Aujourd\'hui': 'Today', 'Ce week-end': 'This weekend',
      '7 jours': '7 days', '30 jours': '30 days', 'Sans fin': 'No end date',
      'Début': 'Start', 'Fin': 'End', 'Nom': 'Name',
      'Ce que ça touche': 'What it covers', 'Valeur au prix plein': 'Value at full price',
      'Au prix promo': 'At the promo price', 'Vous offrez': 'You give away',
      'Lancer la promotion': 'Launch the promotion', 'Enregistrer': 'Save',
      'Chaque article du magasin, sans exception.': 'Every item in the shop, no exception.',
      'Baissez vos prix une fois, la caisse s’en souvient': 'Set your prices once, the till remembers',
      'Déstocker l’ancienne saison': 'Clear last season',
      'Écouler les fins de série': 'Move the last few',
      'Animer le week-end': 'Liven up the weekend',
      'Déstockage': 'Clearance', 'Fins de série': 'Last few', 'Week-end': 'Weekend',
      'Étiquettes': 'Labels', 'étiquette': 'label', 'étiquettes': 'labels',
      'Imprimer les étiquettes': 'Print the labels',
      'Rien ici': 'Nothing here',
      'Aucune promotion ne tourne en ce moment.': 'No promotion is running right now.',
      'Aucune promotion en attente.': 'No promotion waiting.',
      'Aucune promotion terminée.': 'No finished promotion.',
      'Supprimer': 'Delete', 'Garder': 'Keep', 'Modifier': 'Edit',
      'Mettre en pause': 'Pause', 'Reprendre': 'Resume', 'Fermer': 'Close',

      /* ── réimprimer un ticket ──
         Le panneau n'était pas traduit du tout : le bouton du rail disait bien
         « Reprint », et la fenêtre qui s'ouvrait derrière restait en français.
         Les jours (aujourd'hui, hier, samedi 25) ne passent pas par ici — ils
         portent un quantième, donc pos-reprint.js les écrit lui-même dans la
         langue en cours. */
      'Réimprimer un ticket': 'Reprint a receipt',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l’heure d’origine, et porte la mention « duplicata ».':
        'Sales taken on this terminal. The copy keeps the original number and time, and is marked as a duplicate.',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l\'heure d\'origine, et porte la mention « duplicata ».':
        'Sales taken on this terminal. The copy keeps the original number and time, and is marked as a duplicate.',
      'Aucun ticket à ressortir sur ce terminal.': 'No receipt to reprint on this terminal.',
      'La liste tient les ventes du jour, et celles des jours précédents dont le ticket a été gardé.':
        'The list holds today’s sales, plus earlier ones whose receipt was kept.',
      'sans numéro': 'no number',
      'Impression du reçu…': 'Printing the receipt…',
      'Duplicata imprimé': 'Duplicate printed',
      'Impression échouée, le ticket n’est pas sorti': 'Printing failed — no receipt came out',
      'Impression échouée, le ticket n\'est pas sorti': 'Printing failed — no receipt came out',
      'Impression indisponible sur cet appareil': 'Printing is unavailable on this device',
      'Ticket introuvable': 'Receipt not found',
      'Imprimer la liste': 'Print the list',
      'Impression de la liste…': 'Printing the list…',
      'Liste imprimée': 'List printed',
      'Impression échouée, la liste n’est pas sortie': 'Printing failed — no list came out',
      'Impression échouée, la liste n\'est pas sortie': 'Printing failed — no list came out',
      'Aucune vente à imprimer': 'No sale to print',
      'Récapitulatif indisponible': 'Summary unavailable',

      /* ── clientes / carnet ── */
      'Carnet clients': 'Customer book', 'Nouveau client': 'New customer',
      'Rechercher un nom ou 06…': 'Search a name or 06…', '06… ou nom': '06… or name',
      'Aucun client pour l’instant': 'No customer yet',
      'Ajoutez votre premier client — il apparaîtra aussitôt sur le tableau de bord.':
        'Add your first customer — they appear on the dashboard straight away.',
      'Le téléphone d’abord, la fiche suit la cliente, pas le ticket':
        'Phone first — the record follows the customer, not the receipt',

      /* ── échanges & inventaire ── */
      'Avoirs actifs': 'Active credit notes', 'Avoir': 'Credit note',
      'Retour sous 7 jours avec ticket, échange ou avoir, jamais de remboursement espèces':
        'Returns within 7 days with receipt — exchange or credit, never cash back',
      'Reprendre le stock': 'Take stock in', 'produits': 'products', 'variantes': 'variants',

      /* ── paiement ── */
      'Encaissement': 'Payment', 'Espèces': 'Cash', 'espèces': 'cash',
      'Carte': 'Card', 'carte': 'card', 'Livraison': 'Delivery',
    },

    ar: {
      /* ── rail ── */
      'Vente': 'البيع', 'Scan': 'المسح', 'Inventaire': 'المخزون',
      'Échanges & avoirs': 'التبديل والأرصدة', 'Clientes': 'الزبونات',
      'Clients': 'الزبناء', 'Promotions': 'العروض',
      'Plein écran': 'ملء الشاشة', 'Quitter le plein écran': 'الخروج من ملء الشاشة',
      'Fin de service': 'نهاية الخدمة', 'Verrouiller': 'قفل',
      'Rafraîchir': 'تحديث', 'Réimprimer': 'إعادة الطباعة',
      'En ligne': 'متصل', 'Hors-ligne': 'غير متصل', 'Hors ligne': 'غير متصل',
      'En ligne · synchronisé': 'متصل · متزامن', 'Langue': 'اللغة',
      'Le même Kiwi, un seul compte.': 'نفس كيوي، حساب واحد.',
      'Le même Kiwi,': 'نفس كيوي،', 'un seul compte': 'حساب واحد',

      /* ── écران de vente ── */
      'Scannez un code-barres, ou touchez un article': 'امسح رمزاً شريطياً، أو المس منتجاً',
      'Scannez un code-barres pour l’ajouter au ticket…': 'امسح رمزاً شريطياً لإضافته إلى التذكرة…',
      'Scannez un code-barres pour l\'ajouter au ticket…': 'امسح رمزاً شريطياً لإضافته إلى التذكرة…',
      'Entrée': 'إدخال', 'ENTRÉE': 'إدخال', 'Tous': 'الكل', 'En promo': 'في العرض',
      'Divers': 'متنوع', 'épuisé': 'نفد', 'ÉPUISÉ': 'نفد',
      'stock bas': 'مخزون منخفض', 'Épuisé': 'نفد', 'Stock bas': 'مخزون منخفض',
      'Disponible': 'متوفر', 'Envoyer vers la vente': 'إرسال إلى البيع',

      /* ── ticket ── */
      'Ticket': 'التذكرة', 'Vider': 'إفراغ', 'Total': 'المجموع',
      'Attacher une cliente': 'ربط زبونة',
      'Téléphone d’abord, points et taille suivent': 'الهاتف أولاً، النقاط والمقاس يتبعان',
      'Téléphone d\'abord, points et taille suivent': 'الهاتف أولاً، النقاط والمقاس يتبعان',
      'Chercher': 'بحث', 'Changer': 'تغيير', 'Cliente de passage': 'زبونة عابرة',
      'Sans fiche, retrouvable par n° de ticket': 'بدون بطاقة، تُسترجع برقم التذكرة',
      'Le ticket est vide.': 'التذكرة فارغة.',
      'Touchez un article dans la grille, ou scannez son code-barres.': 'المس منتجاً في الشبكة، أو امسح رمزه الشريطي.',
      'Encaisser': 'تحصيل', 'Remise': 'تخفيض', 'Récompense': 'مكافأة',
      'article': 'منتج', 'articles': 'منتجات',
      'Récompense appliquée': 'المكافأة مطبَّقة', 'Récompense prête': 'المكافأة جاهزة',
      'Points débités à l’encaissement': 'تُخصم النقاط عند الأداء',
      'Utiliser': 'استعمال', 'Annuler': 'إلغاء', 'Ajouter au ticket': 'أضف إلى التذكرة',
      'Quantité': 'الكمية', 'Couleur': 'اللون', 'Taille': 'المقاس', 'Sans': 'بدون',
      'accord gérante': 'بموافقة المسؤولة', 'en stock': 'في المخزون',
      'habituelle': 'المعتاد', 'Choisir cet article': 'اختر هذا المنتج',

      /* ── promotions ── */
      'de remise': 'تخفيض', 'prix fixe': 'ثمن ثابت',
      '{n} article concerné': '{n} منتج معني', '{n} articles concernés': '{n} منتجات معنية',
      '{n} promotion en cours': '{n} عرض جارٍ', '{n} promotions en cours': '{n} عروض جارية',
      '{n} article remisé': '{n} منتج مخفَّض', '{n} articles remisés': '{n} منتجات مخفَّضة',
      'Se termine dans {n} jours': 'ينتهي بعد {n} أيام', 'Démarre dans {n} jours': 'يبدأ بعد {n} أيام',
      'Se termine demain': 'ينتهي غداً', 'Démarre demain': 'يبدأ غداً',
      'Il en reste {n} ou moins': 'يبقى منه {n} أو أقل',
      '{n} pt / MAD': '{n} نقطة لكل MAD', 'palier {n}': 'عتبة {n}',
      'Régulier': 'منتظم', 'Nouveau': 'جديد', 'Dormant': 'خامل',
      'Récompense prête': 'المكافأة جاهزة', 'récompense {x}': 'مكافأة {x}',
      'Visites': 'الزيارات', 'Dépensé (MAD)': 'المصروف (MAD)', 'Dernière visite': 'آخر زيارة',
      'Email': 'البريد الإلكتروني', 'Ville': 'المدينة', 'Adresse': 'العنوان', 'Anniversaire': 'تاريخ الميلاد',
      'Genre': 'النوع', 'Notes': 'ملاحظات', 'Consentement': 'الموافقة', 'Aucun': 'لا شيء',
      'Enregistrer un achat': 'تسجيل شراء', 'Ajouter un tampon': 'إضافة طابع',
      'Valider': 'تأكيد', 'Ajouter': 'إضافة', 'Retour': 'رجوع', 'Sans nom': 'بدون اسم',
      'Offrir la récompense': 'منح المكافأة', 'réinitialiser': 'إعادة البدء',
      'Montant en MAD': 'المبلغ بالدرهم',
      'Modifier le client': 'تعديل الزبون', 'Nom complet': 'الاسم الكامل', 'Téléphone': 'الهاتف',
      'Femme': 'أنثى', 'Homme': 'ذكر', 'Autre': 'آخر',
      'Renseignez un maximum d’informations — elles nourrissent la fidélité et le marketing.':
        'املأ أكبر قدر من المعلومات — منها يتغذّى الوفاء والتسويق.',
      'Accepte les messages': 'يقبل الرسائل عبر', 'Accepte les': 'يقبل',
      'emails marketing': 'الرسائل التسويقية',
      '(offres, fidélité). Consentement requis': '(عروض، وفاء). الموافقة إلزامية',
      'CNDP loi 09-08.': 'قانون CNDP 09-08.',
      'Prénom Nom': 'الاسم والنسب', 'nom@email.com': 'name@email.com',
      'Quartier, rue…': 'الحي، الشارع…',
      'Préférences, tailles, allergies…': 'التفضيلات، المقاسات، الحساسية…',
      'visite': 'زيارة', 'visites': 'زيارات', 'achat': 'شراء', 'achats': 'مشتريات',
      '{n} j': '{n} ي',
      '+1 tampon': '+1 طابع',
      'Client ajouté': 'تمت إضافة الزبون', 'Client mis à jour': 'تم تحديث الزبون',
      'Client supprimé': 'تم حذف الزبون', 'Client déjà enregistré': 'الزبون مسجَّل من قبل',
      'Achat enregistré': 'تم تسجيل الشراء', 'Saisissez un montant': 'أدخل مبلغاً',
      'Récompense offerte': 'تم منح المكافأة', 'Carte réinitialisée.': 'تمت إعادة البطاقة.',
      'Renseignez au moins un nom ou un numéro': 'أدخل على الأقل اسماً أو رقماً',
      'Le consentement est requis': 'الموافقة إلزامية',
      'Cochez la case WhatsApp / SMS pour enregistrer.': 'فعّل خانة WhatsApp / SMS للتسجيل.',
      'Sans date de fin, jusqu’à ce que vous l’arrêtiez': 'بدون تاريخ نهاية، إلى أن توقفه',
      'Sans date de fin, jusqu\'à ce que vous l\'arrêtiez': 'بدون تاريخ نهاية، إلى أن توقفه',
      'En pause, aucun prix n’est modifié': 'موقوف، لا يتغيّر أي ثمن',
      'En pause, aucun prix n\'est modifié': 'موقوف، لا يتغيّر أي ثمن',
      '{n} ou moins': '{n} أو أقل', '{n} jours': '{n} أيام',
      '{n} vente': '{n} مبيعة', '{n} ventes': '{n} مبيعات',
      '{n} MAD aujourd’hui': '{n} MAD اليوم', '{n} MAD aujourd\'hui': '{n} MAD اليوم',
      'par {x}': 'بواسطة {x}',
      'Nouvelle promotion': 'عرض جديد', 'Modifier la promotion': 'تعديل العرض',
      'En cours': 'جارٍ', 'À venir': 'قادم', 'Terminées': 'منتهية',
      'Programmée': 'مبرمج', 'En pause': 'موقوف', 'Terminée': 'منتهٍ',
      'Tout le magasin': 'كل المحل', 'Un rayon': 'قسم واحد',
      'Des articles': 'منتجات مختارة', 'Ancien stock': 'مخزون قديم', 'Fin de série': 'آخر القطع',
      'De combien': 'بكم', 'Sur quoi': 'على ماذا', 'Jusqu’à quand': 'إلى متى',
      'Jusqu\'à quand': 'إلى متى',
      'En pourcentage': 'بالنسبة المئوية', 'En dirhams': 'بالدرهم', 'Prix fixe': 'ثمن ثابت',
      'Aujourd’hui': 'اليوم', 'Aujourd\'hui': 'اليوم', 'Ce week-end': 'نهاية الأسبوع',
      '7 jours': '7 أيام', '30 jours': '30 يوماً', 'Sans fin': 'بدون نهاية',
      'Début': 'البداية', 'Fin': 'النهاية', 'Nom': 'الاسم',
      'Ce que ça touche': 'ما يشمله', 'Valeur au prix plein': 'القيمة بالثمن الكامل',
      'Au prix promo': 'بثمن العرض', 'Vous offrez': 'تمنح',
      'Lancer la promotion': 'إطلاق العرض', 'Enregistrer': 'حفظ',
      'Chaque article du magasin, sans exception.': 'كل منتج في المحل، بدون استثناء.',
      'Baissez vos prix une fois, la caisse s’en souvient': 'خفّض أثمانك مرة واحدة، والصندوق يتذكّر',
      'Déstocker l’ancienne saison': 'تصفية الموسم الماضي',
      'Écouler les fins de série': 'تصريف آخر القطع',
      'Animer le week-end': 'تنشيط نهاية الأسبوع',
      'Déstockage': 'تصفية', 'Fins de série': 'آخر القطع', 'Week-end': 'نهاية الأسبوع',
      'Étiquettes': 'الملصقات', 'étiquette': 'ملصق', 'étiquettes': 'ملصقات',
      'Imprimer les étiquettes': 'طباعة الملصقات',
      'Rien ici': 'لا شيء هنا',
      'Aucune promotion ne tourne en ce moment.': 'لا يوجد عرض جارٍ حالياً.',
      'Aucune promotion en attente.': 'لا يوجد عرض في الانتظار.',
      'Aucune promotion terminée.': 'لا يوجد عرض منتهٍ.',
      'Supprimer': 'حذف', 'Garder': 'إبقاء', 'Modifier': 'تعديل',
      'Mettre en pause': 'إيقاف مؤقت', 'Reprendre': 'استئناف', 'Fermer': 'إغلاق',

      /* ── réimprimer un ticket ── (voir la note côté anglais) */
      'Réimprimer un ticket': 'إعادة طباعة تذكرة',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l’heure d’origine, et porte la mention « duplicata ».':
        'المبيعات المسجَّلة على هذا الصندوق. النسخة تحتفظ برقم وساعة التذكرة الأصلية، وتحمل عبارة « نسخة ».',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l\'heure d\'origine, et porte la mention « duplicata ».':
        'المبيعات المسجَّلة على هذا الصندوق. النسخة تحتفظ برقم وساعة التذكرة الأصلية، وتحمل عبارة « نسخة ».',
      'Aucun ticket à ressortir sur ce terminal.': 'لا توجد تذكرة لإعادة طباعتها على هذا الصندوق.',
      'La liste tient les ventes du jour, et celles des jours précédents dont le ticket a été gardé.':
        'اللائحة تضم مبيعات اليوم، ومبيعات الأيام السابقة التي حُفظت تذكرتها.',
      'sans numéro': 'بدون رقم',
      'Impression du reçu…': 'جارٍ طبع الوصل…',
      'Duplicata imprimé': 'طُبعت النسخة',
      'Impression échouée, le ticket n’est pas sorti': 'فشل الطبع، لم تخرج التذكرة',
      'Impression échouée, le ticket n\'est pas sorti': 'فشل الطبع، لم تخرج التذكرة',
      'Impression indisponible sur cet appareil': 'الطبع غير متاح على هذا الجهاز',
      'Ticket introuvable': 'التذكرة غير موجودة',
      'Imprimer la liste': 'طبع اللائحة',
      'Impression de la liste…': 'جارٍ طبع اللائحة…',
      'Liste imprimée': 'طُبعت اللائحة',
      'Impression échouée, la liste n’est pas sortie': 'فشل الطبع، لم تخرج اللائحة',
      'Impression échouée, la liste n\'est pas sortie': 'فشل الطبع، لم تخرج اللائحة',
      'Aucune vente à imprimer': 'لا توجد مبيعات للطبع',
      'Récapitulatif indisponible': 'التقرير غير متاح',

      /* ── clientes / carnet ── */
      'Carnet clients': 'دفتر الزبناء', 'Nouveau client': 'زبون جديد',
      'Rechercher un nom ou 06…': 'ابحث باسم أو 06…', '06… ou nom': '06… أو الاسم',
      'Aucun client pour l’instant': 'لا يوجد زبون بعد',
      'Ajoutez votre premier client — il apparaîtra aussitôt sur le tableau de bord.':
        'أضف أول زبون — سيظهر فوراً في لوحة القيادة.',
      'Le téléphone d’abord, la fiche suit la cliente, pas le ticket':
        'الهاتف أولاً، البطاقة تتبع الزبونة لا التذكرة',

      /* ── échanges & inventaire ── */
      'Avoirs actifs': 'الأرصدة النشطة', 'Avoir': 'رصيد',
      'Retour sous 7 jours avec ticket, échange ou avoir, jamais de remboursement espèces':
        'الإرجاع خلال 7 أيام بالتذكرة، تبديل أو رصيد، بدون إرجاع نقدي',
      'Reprendre le stock': 'إدخال المخزون', 'produits': 'منتجات', 'variantes': 'تشكيلات',

      /* ── paiement ── */
      'Encaissement': 'الأداء', 'Espèces': 'نقداً', 'espèces': 'نقداً',
      'Carte': 'بطاقة', 'carte': 'بطاقة', 'Livraison': 'توصيل',
    },
  };

  /* ───────────────────────── les dates ─────────────────────────
     Une date n'est pas une phrase, c'est un GABARIT À JETONS : « jeu. 30 juil. »
     n'apparaîtra jamais deux fois de suite, aucune clé fixe ne peut l'attraper,
     et il y en a 366 par an. On traduit donc les jetons — le jour, le mois —
     et on laisse le nombre à sa place.

     Les mois sont ceux du Maroc (يوليوز, غشت, شتنبر…), pas ceux du Levant : une
     caissière de Casablanca ne lit pas « تموز ». Et ces jetons vivent à part du
     dictionnaire : « mai » est aussi un mot, et une robe appelée « Mai » ne doit
     pas devenir un mois parce qu'elle passe dans le même balayage. */
  var DATES = {
    en: {
      'lun.': 'Mon', 'mar.': 'Tue', 'mer.': 'Wed', 'jeu.': 'Thu',
      'ven.': 'Fri', 'sam.': 'Sat', 'dim.': 'Sun',
      'janv.': 'Jan', 'févr.': 'Feb', 'mars': 'Mar', 'avr.': 'Apr',
      'mai': 'May', 'juin': 'Jun', 'juil.': 'Jul', 'août': 'Aug',
      'sept.': 'Sep', 'oct.': 'Oct', 'nov.': 'Nov', 'déc.': 'Dec',
      'auj.': 'today', 'hier': 'yesterday', 'demain': 'tomorrow',
    },
    ar: {
      'lun.': 'الاثنين', 'mar.': 'الثلاثاء', 'mer.': 'الأربعاء', 'jeu.': 'الخميس',
      'ven.': 'الجمعة', 'sam.': 'السبت', 'dim.': 'الأحد',
      'janv.': 'يناير', 'févr.': 'فبراير', 'mars': 'مارس', 'avr.': 'أبريل',
      'mai': 'ماي', 'juin': 'يونيو', 'juil.': 'يوليوز', 'août': 'غشت',
      'sept.': 'شتنبر', 'oct.': 'أكتوبر', 'nov.': 'نونبر', 'déc.': 'دجنبر',
      'auj.': 'اليوم', 'hier': 'أمس', 'demain': 'غدًا',
    },
  };
  /* Le garde-fou : on ne remplace un jeton que si le segment RESSEMBLE à une
     date de bout en bout — jour, quantième, mois, heure, rien d'autre. */
  var DATE_LIKE = new RegExp(
    '^(?:(lun|mar|mer|jeu|ven|sam|dim)\\.|auj\\.|hier|demain)?\\s*' +
    '(?:\\d{1,2})?\\s*' +
    '(?:(janv|févr|avr|juil|sept|oct|nov|déc)\\.|mars|mai|juin|août)?\\s*' +
    '(?:\\d{1,2}:\\d{2})?$');
  var DATE_TOK = /(lun|mar|mer|jeu|ven|sam|dim|janv|févr|avr|juil|sept|oct|nov|déc|auj)\.|\b(mars|mai|juin|août|hier|demain)\b/g;

  /* ───────────────────────── état ───────────────────────── */
  var cur = 'fr';
  try { var saved = localStorage.getItem(KEY); if (saved && DICT[saved]) cur = saved; else if (saved === 'fr') cur = 'fr'; } catch (_) {}
  var subs = [];

  function dict() { return DICT[cur] || null; }
  function t(fr) { var d = dict(); return (d && d[fr]) || fr; }

  /* La phrase d'origine, retenue nœud par nœud. Sans elle, revenir au français
     serait impossible sur tout ce que la caisse n'a pas redessiné entre-temps :
     le texte anglais aurait écrasé la seule copie du français. Une WeakMap pour
     que les nœuds jetés par un re-rendu disparaissent avec leur souvenir. */
  var origText = new WeakMap();
  var origAttr = new WeakMap();

  // Un nombre, éventuellement écrit avec des séparateurs de milliers.
  var NUM = /\d[\d\s\u202f\u00a0.,]*\d|\d/g;
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, CANVAS: 1 };

  /* ───────────────── les montants, en arabe ─────────────────
     « 4 785 MAD » s'affichait « MAD 4 785 », et « −1 115 MAD » devenait
     « MAD 1 115− ». Ce n'est pas une faute de traduction, c'est l'algorithme
     bidirectionnel : l'espace entre le nombre et la devise est un caractère
     NEUTRE, il revient donc au sens du paragraphe (l'arabe), et la séquence se
     coupe en deux morceaux que l'affichage remet de droite à gauche.

     La parade se pose sur le texte, pas sur des classes CSS : une règle nommée
     ne protège que ce qu'elle nomme, et il y a quinze métiers. On entoure chaque
     montant de U+2066 / U+2069 — deux caractères invisibles qui disent « ceci
     est un îlot latin, garde-le tel quel ». Sans effet en français ni en
     anglais : l'isolement n'est posé que si la langue s'écrit à l'envers. */
  var LRI = '\u2066', PDI = '\u2069';
  /* Le préfixe latin collé au nombre fait partie de l'îlot : « MM-1208 » est
     UN code de ticket, pas un « MM » suivi d'un « −1208 ». Isolé en deux
     morceaux, il s'affichait « 1208MM- » sur le ticket. */
  /* Le trait d'union INTERNE — celui qui est collé des deux côtés à un chiffre —
     appartient lui aussi à l'îlot. « 1985-04-12 » découpé en trois morceaux se
     relisait « -12-041985 » sur la date de naissance d'une fiche cliente. Un
     tiret suivi d'une espace, lui, reste dehors : c'est une ponctuation. */
  var AMOUNT = /(?:[A-Za-z]{1,8}-)?[-\u2212+]?\d(?:[\d\s\u202f\u00a0.,:]|-(?=\d))*(?:MAD|DH|dh|%|pts)?/g;
  function isolate(s) {
    /* On repart toujours d'un texte nu. Le balayage rejoue à chaque rendu de la
       caisse — une vente, un scan, un changement de rayon — et empiler les
       marques ferait grossir le nœud d'un caractère invisible par frappe. */
    if (s.indexOf(LRI) >= 0 || s.indexOf(PDI) >= 0) s = s.replace(/[\u2066\u2069]/g, '');
    return s.replace(AMOUNT, function (m0) {
      var core = m0.replace(/\s+$/, '');       // l'espace de fin reste dehors
      return core ? LRI + core + PDI + m0.slice(core.length) : m0;
    });
  }
  function isRtl() {
    var l = LANGS.filter(function (x) { return x.id === cur; })[0];
    return !!l && l.dir === 'rtl';
  }

  // `tagName` garde sa casse sur les éléments SVG ('svg', pas 'SVG') : sans le
  // passage en majuscules, tout l'intérieur des icônes serait balayé.
  var tag = function (n) { return String(n.tagName || '').toUpperCase(); };
  function skipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (SKIP_TAGS[tag(n)]) return true;
      if (n.hasAttribute && n.hasAttribute('data-nolang')) return true;
    }
    return false;
  }

  function applyText(node) {
    var had = origText.has(node);
    var fr = had ? origText.get(node) : node.nodeValue;
    // Une phrase peut être entourée d'espaces / retours à la ligne dans le
    // gabarit ; on traduit le cœur et on remet l'habillage tel quel, sinon la
    // mise en page bouge à chaque changement de langue.
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(fr);
    var core = m[2];
    if (!core) return;
    var hit = translateCore(core);
    var out = hit == null ? fr : (m[1] + hit + m[3]);
    /* L'isolement des montants s'applique APRÈS la traduction et sur TOUS les
       nœuds — y compris ceux que le dictionnaire ne connaît pas. Un prix
       d'article est une donnée du commerçant : elle n'est pas traduite, mais
       elle doit quand même s'afficher à l'endroit. */
    if (isRtl()) out = isolate(out);
    if (!had && out !== fr) origText.set(node, fr);
    if (node.nodeValue !== out) node.nodeValue = out;
  }

  /* Une phrase d'interface se présente rarement seule dans son nœud : le code
     écrit `Encaisser · ${total}`, `3 articles`, `Ticket · MM-1208 · par Rania`.
     Un dictionnaire qui n'accepte que la correspondance exacte laisse tout ça
     en français — et ce sont précisément les libellés les plus regardés.
     Deux découpes, toutes deux prudentes : on ne réécrit QUE si un morceau a
     réellement été reconnu, et les morceaux inconnus (montants, numéros de
     ticket, noms) traversent intacts. */
  function translateCore(core) {
    var d = dict();
    if (!d) return null;
    if (d[core]) return d[core];

    // 1 · segments séparés par « · » — la ponctuation maison de la caisse.
    if (core.indexOf(' · ') >= 0) {
      var any = false;
      var parts = core.split(' · ').map(function (seg) {
        var s2 = translateSegment(seg, d);
        if (s2 != null) { any = true; return s2; }
        return seg;
      });
      if (any) return parts.join(' · ');
    }
    return translateSegment(core, d);
  }

  /* Un segment, éventuellement précédé d'un nombre : « 3 articles »,
     « 12 400 pts ». Le nombre reste tel quel — il n'a pas de traduction, et le
     toucher casserait les milliers. */
  function translateSegment(seg, d) {
    if (d[seg]) return d[seg];

    /* Le gabarit à trous. La caisse écrit « Se termine dans 3 jours », « Il en
       reste 5 ou moins », « 20 articles concernés » — le nombre est au milieu,
       donc aucune clé fixe ne peut les attraper. On remplace chaque nombre par
       {n}, on cherche le gabarit, et on remet les nombres dans l'ordre.
       Le sens de la phrase peut déplacer le trou d'une langue à l'autre, c'est
       exactement pourquoi la traduction porte ses propres {n}. */
    var nums = [];
    var tpl = seg.replace(NUM, function (m0) { nums.push(m0); return '{n}'; });
    if (nums.length && d[tpl]) {
      var i = 0;
      return d[tpl].replace(/\{n\}/g, function () { return nums[i] != null ? nums[i++] : ''; });
    }

    // Repli : un nombre EN TÊTE suivi d'un mot connu (« 2 articles »).
    var m = /^([\d][\d\s\u202f\u00a0.,]*)\s(.+)$/.exec(seg);
    if (m && d[m[2]]) return m[1] + ' ' + d[m[2]];

    /* Un mot d'interface suivi d'une DONNÉE : « par Salma ». La clé porte son
       propre {x} — la donnée traverse sans être lue, et une langue qui préfère
       mettre le nom devant peut le faire. */
    var px = /^(\S+)\s+([\s\S]+)$/.exec(seg);
    if (px && d[px[1] + ' {x}']) return d[px[1] + ' {x}'].replace('{x}', px[2]);

    // Une date : des jetons, pas une phrase.
    return translateDate(seg);
  }

  /* On ne touche aux jetons de date QUE si le segment RESSEMBLE de bout en bout
     à une date. « mai » tout seul dans un nom d'article n'est pas un mois ;
     « sam. 14:32 » en est une. Le garde-fou est le motif, pas le mot. */
  function translateDate(seg) {
    var tok = DATES[cur];
    if (!tok || !DATE_LIKE.test(seg)) return null;
    var any = false;
    var out = seg.replace(DATE_TOK, function (m0) {
      var v = tok[m0];
      if (v == null) return m0;
      any = true;
      return v;
    });
    return any ? out : null;
  }

  function applyAttrs(el) {
    var store = origAttr.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var fr = (store && store[a] != null) ? store[a] : el.getAttribute(a);
      var d = dict();
      var out = (d && d[fr]) ? d[fr] : fr;
      if (out !== fr) {
        if (!store) { store = {}; origAttr.set(el, store); }
        if (store[a] == null) store[a] = fr;
      }
      if (el.getAttribute(a) !== out) el.setAttribute(a, out);
    }
  }

  function sweep(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var n = root.nodeType === 1 ? root : null;
    if (n) applyAttrs(n);
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) { if (!skipped(n.parentElement)) applyText(n); }
      else if (!SKIP_TAGS[tag(n)]) applyAttrs(n);
    }
  }

  /* ───────────────────────── le repeint ─────────────────────────
     La caisse redessine sans arrêt (une vente, un scan, un changement de
     rayon). On réagit aux mutations, mais DÉBRANCHÉ pendant notre propre
     passage : sinon chaque traduction déclencherait une nouvelle observation,
     et on tournerait en rond au lieu de vendre. */
  var obs = null, pending = false;
  /* Un `setTimeout`, pas un `requestAnimationFrame`. Un onglet en arrière-plan
     ne reçoit AUCUNE image d'animation : la caisse posée sur une tablette qu'on
     réveille, ou l'onglet passé au second plan pendant qu'un autre écran sert,
     se serait rouvert en français au premier rendu — la traduction n'aurait
     jamais été rejouée. Le balayage ne dessine rien, il n'a rien à
     synchroniser avec l'écran ; il doit juste avoir lieu. */
  function schedule() {
    if (pending || cur === 'fr') return;
    pending = true;
    setTimeout(function () { pending = false; run(document.body); }, 0);
  }
  function run(root) {
    if (obs) obs.disconnect();
    try { sweep(root); } catch (_) {}
    if (obs && cur !== 'fr') obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function watch() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(schedule);
    if (cur !== 'fr') obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function paintDir() {
    var l = LANGS.filter(function (x) { return x.id === cur; })[0] || LANGS[0];
    var el = document.documentElement;
    el.setAttribute('lang', cur);
    /* L'arabe s'écrit de droite à gauche, et une caisse n'est pas un texte :
       ce sont des colonnes, un rail, un ticket. `dir` retourne les
       dispositions en flex et en grille toutes seules. Ce qui est positionné
       en dur (`left`/`right`) ne suit pas — c'est la limite connue de ce
       premier passage, et elle se corrige règle par règle. */
    el.setAttribute('dir', l.dir);
    document.body.classList.toggle('kiwi-rtl', l.dir === 'rtl');
  }

  function set(id) {
    if (!LANGS.some(function (x) { return x.id === id; })) return;
    cur = id;
    try { localStorage.setItem(KEY, id); } catch (_) {}
    paintDir();
    watch();                 // crée l'observateur au premier changement de langue
    run(document.body);      // balaye, puis se remet à l'écoute si on n'est pas en français
    paintPickers();
    subs.forEach(function (fn) { try { fn(cur); } catch (_) {} });
  }

  /* ───────────────────────── le sélecteur ─────────────────────────
     Il prend la place du bouton « Simuler une coupure réseau » : une bascule de
     panne réseau SIMULÉE n'a rien à faire sur le comptoir d'un vrai commerce,
     et l'état réel du réseau est déjà porté, en plus juste, par la pastille de
     synchronisation en bas du rail (assets/caisse-pwa.js).
     On le MASQUE sans le retirer : caisse-pwa.js le clique par programme pour
     répercuter `navigator.onLine` dans chaque métier, et un bouton supprimé
     emporterait avec lui la mise en file hors-ligne des ventes. */
  function pickerHtml() {
    return LANGS.map(function (l) {
      return '<button type="button" class="kcl-it' + (l.id === cur ? ' on' : '') + '"'
        + ' data-kcl="' + l.id + '" lang="' + l.id + '" title="' + l.label + '"'
        + ' aria-label="' + l.label + '" aria-pressed="' + (l.id === cur) + '" data-nolang>'
        + l.code + '</button>';
    }).join('');
  }
  function paintPickers() {
    Array.prototype.forEach.call(document.querySelectorAll('.kcl'), function (p) {
      Array.prototype.forEach.call(p.querySelectorAll('[data-kcl]'), function (b) {
        var on = b.getAttribute('data-kcl') === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    });
  }
  function netButtons() {
    return Array.prototype.slice.call(document.querySelectorAll(
      'button[title="Simuler une coupure réseau"], button[data-kiwi-real-net], button.bq-net, button[class$="-net"]'));
  }
  function graft() {
    netButtons().forEach(function (net) {
      var host = net.parentElement;
      if (!host || host.querySelector('.kcl')) return;
      var box = document.createElement('div');
      box.className = 'kcl';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Langue');
      box.setAttribute('data-nolang', '');
      box.innerHTML = pickerHtml();
      host.insertBefore(box, net);
      net.classList.add('kcl-hidden-net');
      box.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-kcl]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        set(b.getAttribute('data-kcl'));
      });
    });
  }

  function css() {
    if (document.getElementById('kcl-css')) return;
    var st = document.createElement('style');
    st.id = 'kcl-css';
    st.textContent = [
      /* Le bouton de panne simulée sort de l'écran mais reste dans le document :
         caisse-pwa.js a besoin de pouvoir le cliquer. `visibility` plutôt que
         `display:none` — un élément sans boîte reste cliquable par programme,
         mais autant ne rien changer à sa géométrie interne. */
      '.kcl-hidden-net{position:absolute!important;width:1px;height:1px;overflow:hidden;',
      '  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;pointer-events:none;}',
      '.kcl{display:flex;gap:3px;padding:3px;border-radius:11px;',
      '  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);}',
      '.kcl-it{flex:1;min-width:0;padding:6px 0;border:0;border-radius:8px;background:transparent;',
      '  color:rgba(255,255,255,.55);font:inherit;font-size:11.5px;font-weight:600;letter-spacing:.02em;',
      '  cursor:pointer;text-align:center;line-height:1.1;',
      '  transition:background 180ms ease,color 180ms ease;}',
      '.kcl-it:hover{color:rgba(255,255,255,.85);}',
      '.kcl-it.on{background:var(--atlas,#0B6E4F);color:#fff;',
      '  box-shadow:0 1px 6px -2px rgba(11,110,79,.8);}',
      '.kcl-it[lang="ar"]{font-size:14px;line-height:.95;}',
      /* Rail clair (certains métiers) : la même pastille, en négatif. */
      '.bq-rail-foot .kcl,.pos-rail-foot .kcl{background:rgba(255,255,255,.06);}',
      /* RTL — ce que le retournement automatique ne couvre pas. */
      '.kiwi-rtl .kcl-it{letter-spacing:0;}',
      /* Les deux pastilles flottantes d'assets/caisse-pwa.js sont posées en
         coordonnées PHYSIQUES, dans un style en ligne (`left:12px` pour l'état
         réseau, `right:16px` pour l'invite d'installation). `dir` ne retourne
         pas ça : en arabe l'état de synchronisation restait dans le coin
         gauche, du côté que l'œil quitte, pendant que tout le reste avait
         basculé. Le `!important` n'est pas un caprice — il faut battre un style
         en ligne. */
      '.kiwi-rtl #kiwi-net{left:auto!important;right:12px!important;}',
      '.kiwi-rtl #kiwi-install{right:auto!important;left:16px!important;}',
    ].join('');
    document.head.appendChild(st);
  }

  /* ───────────────────────── démarrage ─────────────────────────
     Le rail d'un métier n'existe qu'une fois la caisse déverrouillée, et il est
     reconstruit à chaque montage : on regreffe donc à chaque mutation, comme
     assets/clients-book.js le fait pour son entrée de carnet. */
  var wireT = null;
  function scheduleGraft() {
    if (wireT) return;
    wireT = setTimeout(function () { wireT = null; try { css(); graft(); paintPickers(); } catch (_) {} }, 150);
  }
  function boot() {
    css(); paintDir(); graft(); watch();
    if (cur !== 'fr') run(document.body);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(scheduleGraft).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiCaisseLang = {
    get: function () { return cur; },
    set: set,
    t: t,
    // Exposé pour tools/caisse-lang-test.js : c'est ICI que vit la découpe des
    // phrases interpolées, et une découpe qui se casse ne se voit pas à l'œil —
    // l'écran reste simplement en français.
    tr: function (core) { var r = translateCore(String(core)); return r == null ? String(core) : r; },
    /* Exposé pour la même raison que `tr` : un montant mal isolé s'affiche
       « MAD 4 785 » au lieu de « 4 785 MAD », et ça ne lève aucune erreur —
       c'est juste un prix que la cliente lit de travers au comptoir. */
    bidi: function (s) { return isRtl() ? isolate(String(s)) : String(s); },
    langs: LANGS.slice(),
    dict: function () { return dict(); },
    apply: function (root) { run(root || document.body); },
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; },
  };
})();
