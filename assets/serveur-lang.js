/* Kiwi Serveur · l'app serveur en anglais et en arabe.
 *
 * Le français est la clé : kiwi-serveur.html écrit son interface en français
 * et employeeTranslation() remplace chaque texte, info-bulle et libellé
 * d'accessibilité par sa traduction (un dictionnaire de phrases entières,
 * puis des motifs pour les phrases qui portent un nom de table ou un nombre).
 *
 * Ce fichier tient les deux listes. Elles vivaient dans la page, qui dépasse
 * douze mille lignes (tools/file-size-baseline.json) ; une phrase de plus à
 * traduire ne doit pas la faire grossir. Chargé SANS defer, avant le script
 * de la page qui les lit au démarrage. S'il manque, l'app reste en français :
 * jamais une page cassée.
 *
 * Toute nouvelle clé va dans `en` ET dans `ar` :
 * tools/serveur-lang-coverage-test.mjs le vérifie, avec chaque texte du
 * balisage de la page. */
(function () {
  'use strict';
  const EMPLOYEE_TRANSLATIONS = {
    en: {
      "Annulation déjà en attente de la cuisine": "Cancellation already waiting for the kitchen",
      "Annulation en cours · attendez la réponse du serveur": "Cancelling · waiting for the server",
      "Article non vendable individuellement": "This item cannot be sold on its own",
      "Choisissez les options obligatoires": "Choose the required options",
      "Choix dupliqués pour toutes les portions": "Choices copied to every portion",
      "Commande en attente envoyée · cuisine": "Held order sent · kitchen",
      "Commande envoyée en cuisine": "Order sent to the kitchen",
      "Commande introuvable": "Order not found",
      "Complétez tous les choix obligatoires": "Complete every required choice",
      "Copié": "Copied",
      "Envoyé · SMS / WhatsApp": "Sent · SMS / WhatsApp",
      "Plat déjà en cuisine · parlez au chef ou annulez": "Dish already in the kitchen · talk to the chef or cancel",
      "Pointage non synchronisé · vérifiez la connexion": "Clock-in not synced · check the connection",
      "Pointage enregistré sur ce téléphone · envoi dès le retour du réseau": "Saved on this phone · it will be sent when the connection is back",
      "Pointage du téléphone envoyé": "Clock entry from this phone sent",
      "Pointage du téléphone refusé · voyez avec votre responsable": "Clock entry from this phone refused · check with your manager",
      "Reprenez le service pour prendre une commande": "Resume your shift to take an order",
      "Pointez votre arrivée pour prendre une commande ou un paiement": "Clock in to take an order or a payment",
      "Saisissez le code de la caisse pour pointer le départ": "Enter the till code to clock out",
      "Session de service expirée · reconnectez-vous": "Service session expired · sign in again",
      "Session fermée": "Signed out",
      "Split annulé": "Split cancelled",
      "Ticket en impression…": "Printing receipt…",
      "Pas vous ? Changer d'employé": "Not you? Switch employee",
      "Cet établissement est suspendu": "This establishment is suspended",
      "Service momentanément indisponible": "Service temporarily unavailable",
      "Code de pointage incorrect ou expiré": "Clock-in code is incorrect or expired",
      "Trop d'essais · réessayez plus tard": "Too many attempts · try again later",
      "Email ou code personnel incorrect": "Incorrect email or personal code",
      "Email ou code personnel incorrect.": "Incorrect email or personal code.",
      "Entrez votre email et votre code à 4 chiffres.": "Enter your email and your 4-digit code.",
      "Trop d’essais. Réessayez dans quelques minutes.": "Too many attempts. Try again in a few minutes.",
      "Cet établissement est suspendu.": "This establishment is suspended.",
      "Cet email existe dans plusieurs établissements. Contactez votre responsable.": "This email exists in several establishments. Contact your manager.",
      "Service momentanément indisponible. Réessayez.": "Service temporarily unavailable. Try again.",
      "Connexion indisponible. Vérifiez le réseau et réessayez.": "Connection unavailable. Check the network and try again.",
      "Session expirée · reconnectez-vous": "Session expired · sign in again",
      "Pointage non enregistré · réessayez": "Clock-in not recorded · try again",
      "Connexion indisponible · vérifiez le réseau": "Connection unavailable · check the network",
      "Opération impossible · réessayez": "Could not complete · try again",
      "Code saisi · il sera vérifié au pointage": "Code entered · it is checked when you clock",
      "Équipe": "Team",
      "Bonjour": "Hello",
      "Entrez votre code": "Enter your code",
      "Votre compte est créé par votre responsable dans Équipe": "Your manager creates your account in Team",
      "Connexion équipe": "Team sign in",
      "Email professionnel": "Work email",
      "Code personnel": "Personal code",
      "Se connecter": "Sign in",
      "Saisissez le code affiché dans la caisse": "Enter the code displayed on the till",
      "Saisissez le code de la caisse pour ouvrir le service": "Enter the till code to start your shift",
      "Saisissez le code de la caisse pour terminer le service": "Enter the till code to end your shift",
      "Pointer l'arrivée": "Clock in",
      "Pointer l’arrivée": "Clock in",
      "Pointer le départ": "Clock out",
      "Consulter sans pointer": "View without clocking in",
      "Consulter l'application sans pointer": "View without clocking in",
      "Apparence": "Appearance",
      "Jour": "Light",
      "Nuit": "Dark",
      "Système": "System",
      "Apparence de l'application": "App appearance",
      "Apparence : jour": "Appearance: light",
      "Apparence : nuit": "Appearance: dark",
      "Apparence : suivre le système": "Appearance: system",
      "Connexion PIN": "Code sign in",
      "Clavier numérique": "Number pad",
      "Effacer": "Delete",
      "Code de pointage à six chiffres": "Six-digit clock-in code",
      "Application équipe": "Team app",
      "Rafraîchir": "Refresh",
      'Notifications': 'Notifications',
      'Tables': 'Tables',
      "Rafraîchir l'application": 'Refresh app',
      'Votre service en direct': 'Your shift live',
      "Vous n'êtes pas en service": 'You are not on shift',
      'Consultation seulement · pointez votre arrivée pour commencer.': 'View only · clock in to start.',
      'Pointer mon arrivée': 'Clock in',
      'Se déconnecter': 'Log out',
      'Début de service': 'Shift started',
      'Durée actuelle': 'Current duration',
      'Tables actives': 'Active tables',
      'Tables réglées': 'Paid tables',
      'Cette semaine': 'This week',
      'Voir le mois': 'View month',
      'Prochain service': 'Next shift',
      'Heures travaillées': 'Hours worked',
      'Historique': 'History',
      "Aujourd'hui": 'Today',
      'Ce mois': 'This month',
      'Grade': 'Rank',
      'Aucun grade': 'No rank yet',
      'XP totale': 'Total XP',
      'Records personnels': 'Personal records',
      'Vos records apparaîtront après votre première table réglée.': 'Your records will appear after your first paid table.',
      'À établir': 'Pending',
      'Meilleur soir': 'Best evening',
      'Tables en série': 'Tables in a row',
      'Vitesse moyenne': 'Average speed',
      '+ Nouveau record': '+ New record',
      'Défi du soir': "Tonight's challenge",
      'Pause gérée depuis la caisse': 'Break managed from the register',
      'En pause · gérée depuis la caisse': 'On break · managed from the register',
      'Pointer le départ': 'Clock out',
      "Langue de l'application": 'App language',
      'Mes tables': 'My tables',
      'Toutes les tables': 'All tables',
      'Afficher toutes les tables': 'Show all tables',
      'Vos tables ce matin': 'Your tables this morning',
      'Vos tables ce midi': 'Your tables at lunch',
      'Vos tables cet après-midi': 'Your tables this afternoon',
      'Vos tables ce soir': 'Your tables tonight',
      'Vos tables cette nuit': 'Your tables tonight',
      'Disponible': 'Available',
      'Libre': 'Available',
      'À commander': 'To order',
      'En cours': 'In progress',
      'Addition demandée': 'Bill requested',
      'Paiement…': 'Payment…',
      'Réglée': 'Paid',
      'Menu': 'Menu',
      'Profil': 'Profile',
      'Planning du mois': 'Monthly schedule',
      'Vos services planifiés par votre responsable.': 'Your shifts scheduled by your manager.',
      'Mois précédent': 'Previous month',
      'Mois suivant': 'Next month',
      'Fermer': 'Close',
      'Historique des heures': 'Hours history',
      'Heures issues de vos pointages Kiwi, conservées séparément et partagées avec le tableau de bord.': 'Hours from your Kiwi time clock, saved separately and shared with the dashboard.',
      'Total du mois': 'Monthly total',
      'Aucune heure enregistrée pour ce mois.': 'No hours recorded this month.',
      'Aucune notification': 'No notifications',
      'Tables installées, commandes OrderPro, plats prêts et additions apparaîtront ici.': 'Seated tables, OrderPro orders, ready dishes and bills will appear here.',
      'Ajouter articles': 'Add items',
      'Prendre la commande': 'Take order',
      'Addition': 'Bill',
      'Encaisser': 'Take payment',
      'Annuler': 'Cancel',
      'Ouvrir': 'Open',
      'Combien de couverts?': 'How many guests?',
      'Client & fidélité': 'Customer & loyalty',
      'Client de passage': 'Walk-in customer',
      'Payer par carte': 'Pay by card',
      'Payer en espèces': 'Pay cash',
      "Partager l'addition": 'Split bill',
      'Confirmer': 'Confirm',
      'Rendu': 'Change',
      'Rendu au client': 'Change due',
      'Espèces confirmées': 'Cash confirmed',
      'Montant reçu': 'Amount received',
      'Encaissez sur le terminal carte, puis confirmez': 'Take the card payment on the terminal, then confirm',
      'Paiement reçu': 'Payment received',
      'Paiement carte confirmé': 'Card payment confirmed',
      'Nom ou téléphone': 'Name or phone',
      'Retour': 'Back',
      'Repos': 'Off',
      'Toutes': 'All',
      'Occupées': 'Occupied',
      'Libres': 'Available',
      'Filtrer les tables': 'Filter tables',
      'Aucune table ici': 'No tables here',
      'Modifiez le filtre pour retrouver vos tables.': 'Change the filter to find your tables.',
      'En service': 'On shift',
      'Hors service': 'Off shift'
      ,'Mon planning':'My schedule'
      ,'Disponibilités & congés':'Availability & leave'
      ,'Envoyez une demande au responsable sans message séparé.':'Send a request to your manager without a separate message.'
      ,'Mes disponibilités':'My availability'
      ,'Demander un congé':'Request leave'
      ,'Aucune demande envoyée.':'No request sent.'
      ,'Indiquer mes disponibilités':'Set my availability'
      ,'Date de début':'Start date'
      ,'Date de fin':'End date'
      ,'Jours concernés':'Days concerned'
      ,'Je suis disponible ces jours':'I am available on these days'
      ,'À partir de':'From'
      ,'Jusqu’à':'Until'
      ,'Note au responsable (facultatif)':'Note to manager (optional)'
      ,'Envoyer la demande':'Send request'
      ,'En attente':'Pending'
      ,'Approuvée':'Approved'
      ,'Refusée':'Rejected'
      ,'Annulée':'Cancelled'
      ,'Hors ligne · pas encore synchronisé':'Offline · not synced yet'
      ,'Chargement de la carte…':'Loading the menu…'
      ,"Impossible de charger la carte. Elle s'affichera au retour du réseau.":'Could not load the menu. It will appear when the network is back.'
      ,'Synchronisation des tables…':'Syncing tables…'
      ,"Serveur injoignable · l'état des tables n'est peut-être pas à jour":'Server unreachable · table status may be out of date'
      ,'Chargement des tables…':'Loading tables…'
      ,'Le plan de salle arrive du serveur.':'The floor plan is coming from the server.'
      ,'Serveur injoignable':'Server unreachable'
      ,"Les tables s'afficheront au retour du réseau.":'Tables will appear when the network is back.'
      ,'Aucune table dans le plan de salle':'No tables in the floor plan'
      ,'Le responsable compose le plan de salle depuis le tableau de bord.':'A manager sets up the floor plan from the dashboard.'
      ,'Envoi en cours…':'Sending…'
      ,"Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.":'No network. The payment is not recorded, try again when the network is back.'
      ,"Pas de réseau. L'addition n'est pas transmise, réessayez au retour du réseau.":'No network. The bill request was not sent, try again when the network is back.'
      ,"Nouvelle table":"New table"
      ,"Aucun article, appuyez sur":"No items yet, tap"
      ,"pour ouvrir le menu.":"to open the menu."
      ,"Fermer la table":"Close the table"
      ,"Annuler toute la table":"Cancel the whole table"
      ,"Changer table":"Move table"
      ,"Changer la table":"Move table"
      ,"Fusionner":"Merge"
      ,"Tout":"All"
      ,"Voir la commande":"View order"
      ,"Installer l’app":"Install the app"
      ,"Détail de la table":"Table details"
      ,"Déplacement":"Move"
      ,"Choisissez la nouvelle table libre pour ces convives :":"Choose a free table for these guests:"
      ,"Déplacer":"Move"
      ,"Rattacher cette table et son addition à :":"Attach this table and its bill to:"
      ,"Grand groupe":"Large group"
      ,"Cuisine & Pertes":"Kitchen & waste"
      ,"Ce plat a déjà été transmis en cuisine. Motif de l'annulation :":"This dish has already gone to the kitchen. Reason for cancelling:"
      ,"Changement client":"Customer changed their mind"
      ,"Le client change d'avis · pas de perte":"The customer changed their mind · no waste"
      ,"Erreur de saisie":"Entry mistake"
      ,"Erreur serveur avant cuisson":"Waiter mistake before cooking"
      ,"Perte cuisine":"Kitchen waste"
      ,"Déjà sur le feu / jeté · décompte stock":"Already cooking or thrown away · taken out of stock"
      ,"Retour qualité":"Sent back"
      ,"Plat refusé ou non conforme · perte":"Dish refused or not right · waste"
      ,"Conserver le plat":"Keep the dish"
      ,"Confirmer l'annulation":"Confirm cancellation"
      ,"Attachez un client existant à cette addition.":"Attach an existing customer to this bill."
      ,"Approchez la carte ou le téléphone":"Hold the card or phone close"
      ,"Choisissez un mode de partage.":"Choose how to split."
      ,"Parts égales":"Equal shares"
      ,"Part égale":"Equal share"
      ,"Part équilibrée":"Balanced share"
      ,"Assignez à un convive":"Assign to a guest"
      ,"Par article":"By item"
      ,"Nombre de parts":"Number of shares"
      ,"Par convive":"Per guest"
      ,"Combien de convives?":"How many guests?"
      ,"+ pourboire 10%":"+ 10% tip"
      ,"Pourboire":"Tip"
      ,"Total à diviser":"Total to split"
      ,"Attribuez chaque article entier à un convive avant d’encaisser. Aucun article restant ne sera divisé automatiquement.":"Give each whole item to a guest before taking payment. Nothing left over is split automatically."
      ,"Sélectionnez le convive":"Select the guest"
      ,"Tapez les articles consommés":"Tap the items they had"
      ,"Lancer le split":"Start the split"
      ,"Encaisser les parts":"Collect the shares"
      ,"Encaisser les articles attribués":"Collect the assigned items"
      ,"Attribution invalide : vérifiez les articles":"Invalid assignment: check the items"
      ,"Non assigné":"Not assigned"
      ,"Annuler le split":"Cancel the split"
      ,"Tout khlass!":"All settled!"
      ,"L'addition est soldée · choukran":"The bill is settled · thank you"
      ,"Carte du soir":"Tonight's report"
      ,"Fin de service":"End of service"
      ,"Ce soir":"Tonight"
      ,"Partager":"Share"
      ,"Plus tard":"Later"
      ,"bon service":"have a good shift"
      ,"bon service.":"have a good shift."
      ,"Demande de l’eau":"Asking for water"
      ,"Demande du pain":"Asking for bread"
      ,"Demande des serviettes":"Asking for napkins"
      ,"Demande de débarrasser":"Asking to clear the table"
      ,"Appelle un serveur":"Calling a waiter"
      ,"Clients installés · menus à apporter":"Guests seated · bring the menus"
      ,"Table ouverte · commande en cours":"Table open · order in progress"
      ,"Paiement en cours":"Payment in progress"
      ,"Paiement en cours…":"Payment in progress…"
      ,"Addition réglée":"Bill paid"
      ,"Table libérée":"Table freed"
      ,"Vérification des notes indisponible":"Bill check unavailable"
      ,"Vérification indisponible":"Check unavailable"
      ,"La caisse peut encaisser. Le serveur ne peut pas confirmer ici qu’une note rouverte est encore due.":"The till can take payment. This app cannot confirm here that a reopened bill is still due."
      ,"Vérification en cours · encaisser au comptoir":"Checking · take payment at the counter"
      ,"Note rouverte · règlement au comptoir":"Bill reopened · pay at the counter"
      ,"Note rouverte":"Bill reopened"
      ,"Encaisser cette note au comptoir":"Take this bill at the counter"
      ,"prend la commande sur cette table":"is taking the order at this table"
      ,"Arrivée par le menu en ligne · elle n'est pas encore partie en cuisine.":"Came in from the online menu · not sent to the kitchen yet."
      ,"En attente de la cuisine":"Waiting for the kitchen"
      ,"Envoyez d’abord les modifications":"Send the changes first"
      ,"erreur réseau":"network error"
      ,"Aucune table libre disponible actuellement.":"No free table right now."
      ,"commande déjà envoyée en cuisine":"order already sent to the kitchen"
      ,"Aucune autre table active à fusionner.":"No other active table to merge with."
      ,"Sélectionné":"Selected"
      ,"Modifier":"Edit"
      ,"Sélectionnez une table d'abord":"Select a table first"
      ,"Carte approuvée":"Card approved"
      ,"Lancer la commande":"Send the order"
      ,"Ajouter":"Add"
      ,"Table réglée":"Table paid"
      ,"Sélectionnez une table d'abord pour ajouter des articles. Vous pouvez parcourir le menu pour information.":"Select a table first to add items. You can still browse the menu."
      ,"Sous-total":"Subtotal"
      ,"Service (compris)":"Service (included)"
      ,"Total":"Total"
      ,"Ajouter encore":"Add more"
      ,"Imprimer":"Print"
      ,"inclus":"included"
      ,"Formule":"Set menu"
      ,"Options":"Options"
      ,"autre":"other"
      ,"Option indisponible":"Option unavailable"
      ,"Oui":"Yes"
      ,"Diviser ·":"Split ·"
      ,"Combien de couverts ?":"How many guests?"
      ,"Combien de couverts ?":"How many guests?"
      ,"Même chose pour tous":"Same for everyone"
      ,"Aucun client trouvé.":"No customer found."
      ,"Note cuisine, ex. bien chaud, sans oignon":"Kitchen note, e.g. extra hot, no onion"
      ,"Service momentanément indisponible.":"Service briefly unavailable."
      ,"Tables servies":"Tables served"
      ,"Revenu encaissé":"Revenue collected"
      ,"Ticket moyen":"Average ticket"
      ,"Durée du service":"Shift length"
      ,"Vitesse moyenne / table":"Average time per table"
      ,"Réglé · Carte":"Paid · Card"
      ,"Réglé · Espèces":"Paid · Cash"
    },
    ar: {
      "Annulation déjà en attente de la cuisine": "الإلغاء بانتظار المطبخ",
      "Annulation en cours · attendez la réponse du serveur": "جارٍ الإلغاء · بانتظار الخادم",
      "Article non vendable individuellement": "لا يمكن بيع هذا الصنف منفرداً",
      "Choisissez les options obligatoires": "اختر الخيارات الإلزامية",
      "Choix dupliqués pour toutes les portions": "نُسخت الاختيارات لكل الحصص",
      "Commande en attente envoyée · cuisine": "أُرسل الطلب المعلّق · المطبخ",
      "Commande envoyée en cuisine": "أُرسل الطلب إلى المطبخ",
      "Commande introuvable": "الطلب غير موجود",
      "Complétez tous les choix obligatoires": "أكمل كل الاختيارات الإلزامية",
      "Copié": "تم النسخ",
      "Envoyé · SMS / WhatsApp": "أُرسل · SMS / واتساب",
      "Plat déjà en cuisine · parlez au chef ou annulez": "الطبق في المطبخ · كلّم الشيف أو ألغِ",
      "Pointage non synchronisé · vérifiez la connexion": "لم تتم مزامنة التسجيل · تحقّق من الاتصال",
      "Pointage enregistré sur ce téléphone · envoi dès le retour du réseau": "محفوظ على هذا الهاتف · سيُرسل عند عودة الاتصال",
      "Pointage du téléphone envoyé": "تم إرسال التسجيل المحفوظ على الهاتف",
      "Pointage du téléphone refusé · voyez avec votre responsable": "تم رفض التسجيل المحفوظ على الهاتف · راجع مسؤولك",
      "Reprenez le service pour prendre une commande": "استأنف ورديتك لأخذ طلب",
      "Pointez votre arrivée pour prendre une commande ou un paiement": "سجّل حضورك لأخذ طلب أو تسجيل دفعة",
      "Saisissez le code de la caisse pour pointer le départ": "أدخل رمز الصندوق لتسجيل الخروج",
      "Session de service expirée · reconnectez-vous": "انتهت جلسة الخدمة · سجّل الدخول مجدداً",
      "Session fermée": "تم تسجيل الخروج",
      "Split annulé": "أُلغي التقسيم",
      "Ticket en impression…": "جارٍ طباعة الإيصال…",
      "Pas vous ? Changer d'employé": "لست أنت؟ غيّر الموظف",
      "Cet établissement est suspendu": "هذا الفرع موقوف",
      "Service momentanément indisponible": "الخدمة غير متاحة مؤقتاً",
      "Code de pointage incorrect ou expiré": "رمز بدء الوردية غير صحيح أو منتهي الصلاحية",
      "Trop d'essais · réessayez plus tard": "محاولات كثيرة · أعد المحاولة لاحقاً",
      "Email ou code personnel incorrect": "البريد الإلكتروني أو الرمز الشخصي غير صحيح",
      "Email ou code personnel incorrect.": "البريد الإلكتروني أو الرمز الشخصي غير صحيح.",
      "Entrez votre email et votre code à 4 chiffres.": "أدخل بريدك الإلكتروني ورمزك المكوّن من 4 أرقام.",
      "Trop d’essais. Réessayez dans quelques minutes.": "محاولات كثيرة. أعد المحاولة بعد دقائق.",
      "Cet établissement est suspendu.": "هذا الفرع موقوف.",
      "Cet email existe dans plusieurs établissements. Contactez votre responsable.": "هذا البريد موجود في عدة فروع. تواصل مع مسؤولك.",
      "Service momentanément indisponible. Réessayez.": "الخدمة غير متاحة مؤقتاً. أعد المحاولة.",
      "Connexion indisponible. Vérifiez le réseau et réessayez.": "لا يوجد اتصال. تحقّق من الشبكة وأعد المحاولة.",
      "Session expirée · reconnectez-vous": "انتهت الجلسة · سجّل الدخول من جديد",
      "Pointage non enregistré · réessayez": "لم يُسجَّل الحضور · أعد المحاولة",
      "Connexion indisponible · vérifiez le réseau": "لا يوجد اتصال · تحقّق من الشبكة",
      "Opération impossible · réessayez": "تعذّر إتمام العملية · أعد المحاولة",
      "Code saisi · il sera vérifié au pointage": "تم إدخال الرمز · سيُتحقَّق منه عند التسجيل",
      "Équipe": "الفريق",
      "Bonjour": "مرحباً",
      "Entrez votre code": "أدخل رمزك",
      "Votre compte est créé par votre responsable dans Équipe": "ينشئ مديرك حسابك في قسم الفريق",
      "Connexion équipe": "تسجيل دخول الفريق",
      "Email professionnel": "البريد الإلكتروني للعمل",
      "Code personnel": "الرمز الشخصي",
      "Se connecter": "تسجيل الدخول",
      "Saisissez le code affiché dans la caisse": "أدخل الرمز المعروض على الصندوق",
      "Saisissez le code de la caisse pour ouvrir le service": "أدخل رمز الصندوق لبدء الوردية",
      "Saisissez le code de la caisse pour terminer le service": "أدخل رمز الصندوق لإنهاء الوردية",
      "Pointer l'arrivée": "بدء الوردية",
      "Pointer l’arrivée": "بدء الوردية",
      "Pointer le départ": "إنهاء الوردية",
      "Consulter sans pointer": "عرض دون بدء الوردية",
      "Consulter l'application sans pointer": "عرض دون بدء الوردية",
      "Apparence": "المظهر",
      "Jour": "فاتح",
      "Nuit": "داكن",
      "Système": "النظام",
      "Apparence de l'application": "مظهر التطبيق",
      "Apparence : jour": "المظهر: فاتح",
      "Apparence : nuit": "المظهر: داكن",
      "Apparence : suivre le système": "المظهر: النظام",
      "Connexion PIN": "تسجيل الدخول بالرمز",
      "Clavier numérique": "لوحة الأرقام",
      "Effacer": "مسح",
      "Code de pointage à six chiffres": "رمز بدء الوردية من ستة أرقام",
      "Application équipe": "تطبيق الفريق",
      "Rafraîchir": "تحديث",
      'Notifications': 'الإشعارات',
      'Tables': 'الطاولات',
      "Rafraîchir l'application": 'تحديث التطبيق',
      'Votre service en direct': 'حالة ورديتك مباشرة',
      "Vous n'êtes pas en service": 'لست في وردية عمل الآن',
      'Consultation seulement · pointez votre arrivée pour commencer.': 'العرض فقط · سجّل حضورك للبدء.',
      'Pointer mon arrivée': 'تسجيل الحضور',
      'Se déconnecter': 'تسجيل الخروج من الحساب',
      'Début de service': 'بداية الوردية',
      'Durée actuelle': 'المدة الحالية',
      'Tables actives': 'الطاولات النشطة',
      'Tables réglées': 'الطاولات المسددة',
      'Cette semaine': 'هذا الأسبوع',
      'Voir le mois': 'عرض الشهر',
      'Prochain service': 'الوردية القادمة',
      'Heures travaillées': 'ساعات العمل',
      'Historique': 'السجل',
      "Aujourd'hui": 'اليوم',
      'Ce mois': 'هذا الشهر',
      'Grade': 'المستوى',
      'Aucun grade': 'لا يوجد مستوى بعد',
      'XP totale': 'إجمالي نقاط الخبرة',
      'Records personnels': 'الأرقام القياسية الشخصية',
      'Vos records apparaîtront après votre première table réglée.': 'ستظهر أرقامك القياسية بعد تسديد أول طاولة.',
      'À établir': 'قيد الاحتساب',
      'Meilleur soir': 'أفضل وردية مسائية',
      'Tables en série': 'الطاولات المتتالية',
      'Vitesse moyenne': 'متوسط السرعة',
      '+ Nouveau record': '+ رقم قياسي جديد',
      'Défi du soir': 'تحدي الوردية',
      'Pause gérée depuis la caisse': 'الاستراحة تُدار من نقطة البيع',
      'En pause · gérée depuis la caisse': 'في استراحة · تُدار من نقطة البيع',
      'Pointer le départ': 'تسجيل الانصراف',
      "Langue de l'application": 'لغة التطبيق',
      'Mes tables': 'طاولاتي',
      'Toutes les tables': 'جميع الطاولات',
      'Afficher toutes les tables': 'عرض جميع الطاولات',
      'Vos tables ce matin': 'طاولاتك هذا الصباح',
      'Vos tables ce midi': 'طاولاتك وقت الظهيرة',
      'Vos tables cet après-midi': 'طاولاتك بعد الظهر',
      'Vos tables ce soir': 'طاولاتك هذا المساء',
      'Vos tables cette nuit': 'طاولاتك هذه الليلة',
      'Disponible': 'متاحة',
      'Libre': 'شاغرة',
      'À commander': 'بانتظار الطلب',
      'En cours': 'قيد الخدمة',
      'Addition demandée': 'طُلبت الفاتورة',
      'Paiement…': 'جارٍ الدفع…',
      'Réglée': 'مسددة',
      'Menu': 'القائمة',
      'Profil': 'الملف الشخصي',
      'Planning du mois': 'جدول الشهر',
      'Vos services planifiés par votre responsable.': 'وردياتك التي حددها المسؤول.',
      'Mois précédent': 'الشهر السابق',
      'Mois suivant': 'الشهر التالي',
      'Fermer': 'إغلاق',
      'Historique des heures': 'سجل ساعات العمل',
      'Heures issues de vos pointages Kiwi, conservées séparément et partagées avec le tableau de bord.': 'ساعات العمل المسجلة عبر نظام الحضور في Kiwi، محفوظة بشكل مستقل ومشتركة مع لوحة التحكم.',
      'Total du mois': 'إجمالي الشهر',
      'Aucune heure enregistrée pour ce mois.': 'لا توجد ساعات مسجلة لهذا الشهر.',
      'Aucune notification': 'لا توجد إشعارات',
      'Tables installées, commandes OrderPro, plats prêts et additions apparaîtront ici.': 'ستظهر هنا الطاولات المشغولة وطلبات OrderPro والأطباق الجاهزة والفواتير.',
      'Ajouter articles': 'إضافة أصناف',
      'Prendre la commande': 'أخذ الطلب',
      'Addition': 'الفاتورة',
      'Encaisser': 'تحصيل الدفع',
      'Annuler': 'إلغاء',
      'Ouvrir': 'فتح',
      'Combien de couverts?': 'كم عدد الضيوف؟',
      'Client & fidélité': 'العميل والولاء',
      'Client de passage': 'عميل عابر',
      'Payer par carte': 'الدفع بالبطاقة',
      'Payer en espèces': 'الدفع نقداً',
      "Partager l'addition": 'تقسيم الفاتورة',
      'Confirmer': 'تأكيد',
      'Rendu': 'الباقي',
      'Rendu au client': 'الباقي للعميل',
      'Espèces confirmées': 'تم تأكيد الدفع النقدي',
      'Montant reçu': 'المبلغ المستلم',
      'Encaissez sur le terminal carte, puis confirmez': 'حصّل الدفع على جهاز البطاقة ثم أكّد',
      'Paiement reçu': 'تم استلام الدفع',
      'Paiement carte confirmé': 'تم تأكيد الدفع بالبطاقة',
      'Nom ou téléphone': 'الاسم أو رقم الهاتف',
      'Retour': 'رجوع',
      'Repos': 'عطلة',
      'Toutes': 'الكل',
      'Occupées': 'المشغولة',
      'Libres': 'الشاغرة',
      'Filtrer les tables': 'تصفية الطاولات',
      'Aucune table ici': 'لا توجد طاولات هنا',
      'Modifiez le filtre pour retrouver vos tables.': 'غيّر عامل التصفية لعرض الطاولات.',
      'En service': 'في الوردية',
      'Hors service': 'خارج الوردية'
      ,'Mon planning':'جدولي'
      ,'Disponibilités & congés':'أوقات التوفر والإجازات'
      ,'Envoyez une demande au responsable sans message séparé.':'أرسل طلبك إلى المسؤول مباشرة من التطبيق.'
      ,'Mes disponibilités':'أوقات توفري'
      ,'Demander un congé':'طلب إجازة'
      ,'Aucune demande envoyée.':'لم يتم إرسال أي طلب.'
      ,'Indiquer mes disponibilités':'تحديد أوقات التوفر'
      ,'Date de début':'تاريخ البداية'
      ,'Date de fin':'تاريخ النهاية'
      ,'Jours concernés':'الأيام المعنية'
      ,'Je suis disponible ces jours':'أنا متاح في هذه الأيام'
      ,'À partir de':'من الساعة'
      ,'Jusqu’à':'إلى الساعة'
      ,'Note au responsable (facultatif)':'ملاحظة للمسؤول (اختيارية)'
      ,'Envoyer la demande':'إرسال الطلب'
      ,'En attente':'قيد المراجعة'
      ,'Approuvée':'تمت الموافقة'
      ,'Refusée':'مرفوضة'
      ,'Annulée':'ملغاة'
      ,'Hors ligne · pas encore synchronisé':'غير متصل · لم تتم المزامنة بعد'
      ,'Chargement de la carte…':'جارٍ تحميل القائمة…'
      ,"Impossible de charger la carte. Elle s'affichera au retour du réseau.":'تعذّر تحميل القائمة. ستظهر عند عودة الشبكة.'
      ,'Synchronisation des tables…':'جارٍ مزامنة الطاولات…'
      ,"Serveur injoignable · l'état des tables n'est peut-être pas à jour":'تعذّر الوصول إلى الخادم · قد لا تكون حالة الطاولات محدّثة'
      ,'Chargement des tables…':'جارٍ تحميل الطاولات…'
      ,'Le plan de salle arrive du serveur.':'مخطط القاعة قادم من الخادم.'
      ,'Serveur injoignable':'تعذّر الوصول إلى الخادم'
      ,"Les tables s'afficheront au retour du réseau.":'ستظهر الطاولات عند عودة الشبكة.'
      ,'Aucune table dans le plan de salle':'لا توجد طاولات في مخطط القاعة'
      ,'Le responsable compose le plan de salle depuis le tableau de bord.':'يُعِدّ المسؤول مخطط القاعة من لوحة التحكم.'
      ,'Envoi en cours…':'جارٍ الإرسال…'
      ,"Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.":'لا توجد شبكة. لم يُسجَّل الدفع، أعد المحاولة عند عودة الشبكة.'
      ,"Pas de réseau. L'addition n'est pas transmise, réessayez au retour du réseau.":'لا توجد شبكة. لم يُرسَل طلب الفاتورة، أعد المحاولة عند عودة الشبكة.'
      ,"Nouvelle table":"طاولة جديدة"
      ,"Aucun article, appuyez sur":"لا أصناف بعد، اضغط على"
      ,"pour ouvrir le menu.":"لفتح القائمة."
      ,"Fermer la table":"إغلاق الطاولة"
      ,"Annuler toute la table":"إلغاء الطاولة بالكامل"
      ,"Changer table":"تغيير الطاولة"
      ,"Changer la table":"تغيير الطاولة"
      ,"Fusionner":"دمج"
      ,"Tout":"الكل"
      ,"Voir la commande":"عرض الطلب"
      ,"Installer l’app":"تثبيت التطبيق"
      ,"Détail de la table":"تفاصيل الطاولة"
      ,"Déplacement":"نقل"
      ,"Choisissez la nouvelle table libre pour ces convives :":"اختر طاولة شاغرة لهؤلاء الضيوف:"
      ,"Déplacer":"نقل"
      ,"Rattacher cette table et son addition à :":"ضمّ هذه الطاولة وفاتورتها إلى:"
      ,"Grand groupe":"مجموعة كبيرة"
      ,"Cuisine & Pertes":"المطبخ والهدر"
      ,"Ce plat a déjà été transmis en cuisine. Motif de l'annulation :":"وصل هذا الطبق إلى المطبخ. سبب الإلغاء:"
      ,"Changement client":"تغيير من الزبون"
      ,"Le client change d'avis · pas de perte":"غيّر الزبون رأيه · بلا هدر"
      ,"Erreur de saisie":"خطأ في الإدخال"
      ,"Erreur serveur avant cuisson":"خطأ من النادل قبل الطهي"
      ,"Perte cuisine":"هدر المطبخ"
      ,"Déjà sur le feu / jeté · décompte stock":"على النار أو رُمي · يُخصم من المخزون"
      ,"Retour qualité":"أُرجع لعيب"
      ,"Plat refusé ou non conforme · perte":"طبق مرفوض أو غير مطابق · هدر"
      ,"Conserver le plat":"الاحتفاظ بالطبق"
      ,"Confirmer l'annulation":"تأكيد الإلغاء"
      ,"Attachez un client existant à cette addition.":"اربط زبوناً موجوداً بهذه الفاتورة."
      ,"Approchez la carte ou le téléphone":"قرّب البطاقة أو الهاتف"
      ,"Choisissez un mode de partage.":"اختر طريقة التقسيم."
      ,"Parts égales":"حصص متساوية"
      ,"Part égale":"حصة متساوية"
      ,"Part équilibrée":"حصة متوازنة"
      ,"Assignez à un convive":"خصّص لضيف"
      ,"Par article":"حسب الصنف"
      ,"Nombre de parts":"عدد الحصص"
      ,"Par convive":"حسب الضيف"
      ,"Combien de convives?":"كم عدد الضيوف؟"
      ,"+ pourboire 10%":"+ بقشيش 10%"
      ,"Pourboire":"بقشيش"
      ,"Total à diviser":"المبلغ المراد تقسيمه"
      ,"Attribuez chaque article entier à un convive avant d’encaisser. Aucun article restant ne sera divisé automatiquement.":"خصّص كل صنف كامل لضيف قبل التحصيل. لن يُقسَّم أي صنف متبقٍّ تلقائياً."
      ,"Sélectionnez le convive":"اختر الضيف"
      ,"Tapez les articles consommés":"اضغط على الأصناف التي تناولها"
      ,"Lancer le split":"بدء التقسيم"
      ,"Encaisser les parts":"تحصيل الحصص"
      ,"Encaisser les articles attribués":"تحصيل الأصناف المخصّصة"
      ,"Attribution invalide : vérifiez les articles":"تخصيص غير صالح: راجع الأصناف"
      ,"Non assigné":"غير مخصّص"
      ,"Annuler le split":"إلغاء التقسيم"
      ,"Tout khlass!":"تم الدفع بالكامل!"
      ,"L'addition est soldée · choukran":"سُدّدت الفاتورة · شكراً"
      ,"Carte du soir":"حصيلة المساء"
      ,"Fin de service":"نهاية الخدمة"
      ,"Ce soir":"هذا المساء"
      ,"Partager":"مشاركة"
      ,"Plus tard":"لاحقاً"
      ,"bon service":"نتمنى لك وردية موفقة"
      ,"bon service.":"نتمنى لك وردية موفقة."
      ,"Demande de l’eau":"يطلب الماء"
      ,"Demande du pain":"يطلب الخبز"
      ,"Demande des serviettes":"يطلب مناديل"
      ,"Demande de débarrasser":"يطلب رفع الأطباق"
      ,"Appelle un serveur":"ينادي نادلاً"
      ,"Clients installés · menus à apporter":"الزبائن جالسون · أحضر القوائم"
      ,"Table ouverte · commande en cours":"الطاولة مفتوحة · الطلب جارٍ"
      ,"Paiement en cours":"الدفع جارٍ"
      ,"Paiement en cours…":"الدفع جارٍ…"
      ,"Addition réglée":"الفاتورة مدفوعة"
      ,"Table libérée":"الطاولة شاغرة"
      ,"Vérification des notes indisponible":"التحقق من الفواتير غير متاح"
      ,"Vérification indisponible":"التحقق غير متاح"
      ,"La caisse peut encaisser. Le serveur ne peut pas confirmer ici qu’une note rouverte est encore due.":"يمكن للصندوق التحصيل. لا يمكن لهذا التطبيق التأكد هنا من أن فاتورة أُعيد فتحها ما زالت مستحقة."
      ,"Vérification en cours · encaisser au comptoir":"جارٍ التحقق · حصّل عند الصندوق"
      ,"Note rouverte · règlement au comptoir":"فاتورة أُعيد فتحها · الدفع عند الصندوق"
      ,"Note rouverte":"فاتورة أُعيد فتحها"
      ,"Encaisser cette note au comptoir":"حصّل هذه الفاتورة عند الصندوق"
      ,"prend la commande sur cette table":"يأخذ الطلب على هذه الطاولة"
      ,"Arrivée par le menu en ligne · elle n'est pas encore partie en cuisine.":"وصل من القائمة الإلكترونية · لم يُرسل إلى المطبخ بعد."
      ,"En attente de la cuisine":"بانتظار المطبخ"
      ,"Envoyez d’abord les modifications":"أرسل التعديلات أولاً"
      ,"erreur réseau":"خطأ في الشبكة"
      ,"Aucune table libre disponible actuellement.":"لا توجد طاولة شاغرة حالياً."
      ,"commande déjà envoyée en cuisine":"الطلب أُرسل إلى المطبخ مسبقاً"
      ,"Aucune autre table active à fusionner.":"لا توجد طاولة نشطة أخرى للدمج."
      ,"Sélectionné":"محدّد"
      ,"Modifier":"تعديل"
      ,"Sélectionnez une table d'abord":"اختر طاولة أولاً"
      ,"Carte approuvée":"البطاقة مقبولة"
      ,"Lancer la commande":"إرسال الطلب"
      ,"Ajouter":"إضافة"
      ,"Table réglée":"الطاولة مدفوعة"
      ,"Sélectionnez une table d'abord pour ajouter des articles. Vous pouvez parcourir le menu pour information.":"اختر طاولة أولاً لإضافة أصناف. يمكنك تصفح القائمة للاطلاع."
      ,"Sous-total":"المجموع الفرعي"
      ,"Service (compris)":"الخدمة (مشمولة)"
      ,"Total":"المجموع"
      ,"Ajouter encore":"إضافة المزيد"
      ,"Imprimer":"طباعة"
      ,"inclus":"مشمول"
      ,"Formule":"وجبة"
      ,"Options":"خيارات"
      ,"autre":"آخر"
      ,"Option indisponible":"خيار غير متاح"
      ,"Oui":"نعم"
      ,"Diviser ·":"تقسيم ·"
      ,"Combien de couverts ?":"كم عدد الضيوف؟"
      ,"Combien de couverts ?":"كم عدد الضيوف؟"
      ,"Même chose pour tous":"نفس الشيء للجميع"
      ,"Aucun client trouvé.":"لم يُعثر على زبون."
      ,"Note cuisine, ex. bien chaud, sans oignon":"ملاحظة للمطبخ، مثلاً ساخن جداً، بدون بصل"
      ,"Service momentanément indisponible.":"الخدمة غير متاحة مؤقتاً."
      ,"Tables servies":"الطاولات المخدومة"
      ,"Revenu encaissé":"الإيراد المحصّل"
      ,"Ticket moyen":"متوسط التذكرة"
      ,"Durée du service":"مدة الخدمة"
      ,"Vitesse moyenne / table":"متوسط الوقت لكل طاولة"
      ,"Réglé · Carte":"مدفوع · بطاقة"
      ,"Réglé · Espèces":"مدفوع · نقداً"
    }
  };
  const EMPLOYEE_PATTERNS = [
    [/^Table (.+?) · réglée ✓$/, 'Table $1 · paid ✓', 'الطاولة $1 · مدفوعة ✓'],
    [/^Table (.+?) déjà réglée$/, 'Table $1 already paid', 'الطاولة $1 مدفوعة مسبقاً'],
    [/^Table (.+?) · rien de nouveau à envoyer$/, 'Table $1 · nothing new to send', 'الطاولة $1 · لا جديد للإرسال'],
    [/^Table (.+?) · paiement impossible$/, 'Table $1 · payment failed', 'الطاولة $1 · تعذّر الدفع'],
    [/^Table (.+?) · paiement non enregistré, réessayez$/, 'Table $1 · payment not saved, try again', 'الطاولة $1 · لم يُسجَّل الدفع، أعد المحاولة'],
    [/^Table (.+?) · addition non transmise, réessayez$/, 'Table $1 · bill not sent, try again', 'الطاولة $1 · لم تُرسل الفاتورة، أعد المحاولة'],
    [/^Table (.+?) déplacée vers Table (.+)$/, 'Table $1 moved to Table $2', 'نُقلت الطاولة $1 إلى الطاولة $2'],
    [/^Table (.+?) fusionnée dans Table (.+)$/, 'Table $1 merged into Table $2', 'دُمجت الطاولة $1 في الطاولة $2'],
    [/^Addition demandée pour (.+)$/, 'Bill requested for $1', 'طُلبت الفاتورة لـ $1'],
    [/^\+1 (.+) ajouté$/, '+1 $1 added', '+1 $1 أُضيف'],
    [/^(.+) ajouté$/, '$1 added', 'أُضيف $1'],
    [/^(.+) annulé en cuisine$/, '$1 cancelled in the kitchen', 'أُلغي $1 في المطبخ'],
    [/^(.+) · fidélité mise à jour$/, '$1 · loyalty updated', '$1 · تم تحديث الوفاء'],
    [/^Erreur réseau : (.+)$/, 'Network error: $1', 'خطأ في الشبكة: $1'],
    [/^Hors ligne · dernière mise à jour (\d{1,2}:\d{2})$/, 'Offline · last updated $1', 'غير متصل · آخر تحديث $1'],
    [/^Table (.+?) · paiement non confirmé, réessayez$/, 'Table $1 · payment not confirmed, try again', 'الطاولة $1 · لم يتأكد الدفع، أعد المحاولة'],
    [/^Table (.+?) · paiement non confirmé, ne repassez pas la carte, réessayez$/, 'Table $1 · payment not confirmed, do not run the card again, just retry', 'الطاولة $1 · لم يتأكد الدفع، لا تمرّر البطاقة مرة أخرى، أعد المحاولة فقط'],
    [/^Table (.+?) · hors ligne · commande NON envoyée, réessayez$/, 'Table $1 · offline · order NOT sent, try again', 'الطاولة $1 · غير متصل · لم يُرسَل الطلب، أعد المحاولة'],
    [/^Table (.+?) · pas de réponse du serveur · commande NON confirmée, réessayez$/, 'Table $1 · no answer from the server · order NOT confirmed, try again', 'الطاولة $1 · لا رد من الخادم · لم يتأكد الطلب، أعد المحاولة'],
    [/^Table (.*?) · part (\d+) non confirmée, réessayez$/, 'Table $1 · share $2 not confirmed, try again', 'الطاولة $1 · لم يتأكد الجزء $2، أعد المحاولة'],
    [/^Table (.*?) · part (\d+) non confirmée, ne repassez pas la carte, réessayez$/, 'Table $1 · share $2 not confirmed, do not run the card again, just retry', 'الطاولة $1 · لم يتأكد الجزء $2، لا تمرّر البطاقة مرة أخرى، أعد المحاولة فقط'],
    [/^Table (.*?) · part (\d+) non enregistrée, réessayez$/, 'Table $1 · share $2 not saved, try again', 'الطاولة $1 · لم يُسجَّل الجزء $2، أعد المحاولة'],
    [/^Commande pour (.+)$/, "Order for $1", "طلب $1"],
    [/^1 couvert · ajoutez des articles ci-dessous$/, "1 guest · add items below", "ضيف واحد · أضف الأصناف أدناه"],
    [/^(\d+) couverts · ajoutez des articles ci-dessous$/, "$1 guests · add items below", "$1 ضيوف · أضف الأصناف أدناه"],
    [/^Fusionner avec (.+)$/, "Merge with $1", "دمج مع $1"],
    [/^Déplacer vers (.+)$/, "Move to $1", "نقل إلى $1"],
    [/^(\d+) parts · (.+) chacun$/, "$1 shares · $2 each", "$1 حصص · $2 لكل واحد"],
    [/^Split en cours · (\d+)\/(\d+) réglées$/, "Split in progress · $1/$2 paid", "التقسيم جارٍ · $1/$2 مدفوعة"],
    [/^(\d+) \/ (\d+) réglées$/, "$1 / $2 paid", "$1 / $2 مدفوعة"],
    [/^\/ (\d+) restants? · (.+) chacun$/, "/ $1 left · $2 each", "/ $1 متبقية · $2 للواحد"],
    [/^1 article à attribuer$/, "1 item left to assign", "صنف واحد للتخصيص"],
    [/^(\d+) articles à attribuer$/, "$1 items left to assign", "$1 أصناف للتخصيص"],
    [/^[Cc]ommande (.+) prête$/, "Order $1 ready", "الطلب $1 جاهز"],
    [/^Commande (.+) en attente$/, "Order $1 waiting", "الطلب $1 في الانتظار"],
    [/^Commande OrderPro à valider · (.+)$/, "OrderPro order to confirm · $1", "طلب OrderPro للتأكيد · $1"],
    [/^Départ autorisé · (.+)$/, "Clock-out allowed · $1", "الخروج مسموح · $1"],
    [/^Arrivée autorisée · (.+)$/, "Clock-in allowed · $1", "الدخول مسموح · $1"],
    [/^Note (.*) rouverte en caisse$/, "Bill $1 reopened at the till", "أُعيد فتح الفاتورة $1 في الصندوق"],
    [/^Partie à régler : (.+?)\. Les autres parties déjà payées restent réglées\.$/, "Left to pay: $1. Shares already paid stay paid.", "المتبقي للدفع: $1. الحصص المدفوعة تبقى مدفوعة."],
    [/^Annuler un (.+)$/, "Cancel one $1", "إلغاء $1 واحد"],
    [/^Note cuisine · (.+)$/, "Kitchen note · $1", "ملاحظة للمطبخ · $1"],
    [/^Note cuisine, (.+)$/, "Kitchen note, $1", "ملاحظة للمطبخ، $1"],
    [/^(\d+) à (\d+) choix$/, "$1 to $2 choices", "من $1 إلى $2 اختيارات"],
    [/^(.+) MAD · Choisissez la formule et ses options$/, "$1 MAD · Choose the set menu and its options", "$1 MAD · اختر الوجبة وخياراتها"],
    [/^Ajouter · (.+)$/, "Add · $1", "إضافة · $1"],
    [/^Table (.+?) · envoyez d'abord la commande en cuisine$/, "Table $1 · send the order to the kitchen first", "الطاولة $1 · أرسل الطلب إلى المطبخ أولاً"],
    [/^Prise en cours par (.+)$/, "Being taken by $1", "يتولاها $1"],
    [/^Table (.+?) annulée · cuisine prévenue · plan en cours de synchronisation$/, "Table $1 cancelled · kitchen told · floor plan syncing", "أُلغيت الطاولة $1 · أُبلغ المطبخ · جارٍ مزامنة المخطط"],
    [/^Table (.+?) annulée · 1 commande retirée · cuisine prévenue$/, "Table $1 cancelled · 1 order withdrawn · kitchen told", "أُلغيت الطاولة $1 · سُحب طلب واحد · أُبلغ المطبخ"],
    [/^Table (.+?) annulée · (\d+) commandes retirées · cuisine prévenue$/, "Table $1 cancelled · $2 orders withdrawn · kitchen told", "أُلغيت الطاولة $1 · سُحبت $2 طلبات · أُبلغ المطبخ"],
    [/^Clients installé · (\d+) pers\. · menus à apporter$/, "Guests seated · $1 people · bring the menus", "الزبائن جالسون · $1 أشخاص · أحضر القوائم"],
    [/^Clients installé · menus à apporter$/, "Guests seated · bring the menus", "الزبائن جالسون · أحضر القوائم"],
    [/^(.+?) installé · (\d+) pers\. · menus à apporter$/, "$1 seated · $2 people · bring the menus", "$1 جالس · $2 أشخاص · أحضر القوائم"],
    [/^(.+?) installé · menus à apporter$/, "$1 seated · bring the menus", "$1 جالس · أحضر القوائم"],
    [/^(.+?) · 1 couvert$/, "$1 · 1 guest", "$1 · ضيف واحد"],
    [/^(.+?) · (\d+) couverts?$/, "$1 · $2 guests", "$1 · $2 ضيوف"],
    [/^En service · (\d+)h (\d{2})$/, 'On shift · $1h $2', 'في الوردية · $1:$2'],
    [/^(\d+) MAD · \+(\d+) MAD d'options · personnalisez avant d'ajouter à la commande$/, "$1 MAD · +$2 MAD of options · customise before adding to the order", "$1 MAD · +$2 MAD خيارات · خصّص الصنف قبل إضافته إلى الطلب"],
    [/^(\d+) MAD · personnalisez avant d'ajouter à la commande$/, "$1 MAD · customise before adding to the order", "$1 MAD · خصّص الصنف قبل إضافته إلى الطلب"],
    [/^1 choix$/, '1 choice', 'اختيار واحد'],
    [/^(\d+) choix$/, '$1 choices', '$1 اختيارات'],
    [/^Encaisser (\d[\d\s\u202f]*(?:,\d+)? MAD)$/, 'Take payment $1', 'تحصيل $1'],
    [/^Table (.+?) · commande envoyée · notes transmises$/, 'Table $1 · order sent · notes passed on', 'الطاولة $1 · أُرسل الطلب · نُقلت الملاحظات'],
    [/^Table (.+?) · commande envoyée · (.+) · notes transmises$/, 'Table $1 · order sent · $2 · notes passed on', 'الطاولة $1 · أُرسل الطلب · $2 · نُقلت الملاحظات'],
    [/^Table (.+?) · commande envoyée · (.+)$/, 'Table $1 · order sent · $2', 'الطاولة $1 · أُرسل الطلب · $2'],
    [/^Table (.+?) · commande envoyée$/, 'Table $1 · order sent', 'الطاولة $1 · أُرسل الطلب'],
    [/^Serveur · (.+)$/, 'Server · $1', 'مقدّم خدمة · $1'],
    [/^Caissier · (.+)$/, 'Cashier · $1', 'أمين الصندوق · $1'],
    [/^Cuisinier · (.+)$/, 'Kitchen · $1', 'طاقم المطبخ · $1'],
    [/^Plongeur · (.+)$/, 'Dishwasher · $1', 'عامل نظافة الأواني · $1'],
    [/^Manager · (.+)$/, 'Manager · $1', 'مدير · $1'],
  ];
  window.KiwiServeurLang = { translations: EMPLOYEE_TRANSLATIONS, patterns: EMPLOYEE_PATTERNS };
})();
