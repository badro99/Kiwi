(function(){
  'use strict';
  var P=window.KiwiAdminPolicy, bridge=window.KiwiOperator;
  if(!P||!bridge)return;
  var state={clients:[],now:0,live:null,overview:null,data:null,loadError:null,merchant:'',tab:'summary',route:'today',filter:'all',operators:[],loading:false};
  var root=document.getElementById('op-workspace'), dossier=document.getElementById('op-dossier-summary');
  // Translate software literals only. Merchant names, notes and outcomes never pass through L.
  var copy = {
    "Accès ouvert": {"fr": "Accès ouvert", "en": "Access open", "ar": "الدخول متاح"},
    "Accès en attente": {"fr": "Accès en attente", "en": "Access pending", "ar": "الدخول في الانتظار"},
    "Suspendu": {"fr": "Suspendu", "en": "Suspended", "ar": "موقوف"},
    "Essai": {"fr": "Essai", "en": "Trial", "ar": "تجربة"},
    "Échu": {"fr": "Échu", "en": "Expired", "ar": "منتهي"},
    "À venir": {"fr": "À venir", "en": "Upcoming", "ar": "قادم"},
    "Sans tarif": {"fr": "Sans tarif", "en": "No price", "ar": "بدون سعر"},
    "À faire": {"fr": "À faire", "en": "To do", "ar": "للإنجاز"},
    "En cours": {"fr": "En cours", "en": "In progress", "ar": "قيد الإنجاز"},
    "Reporté": {"fr": "Reporté", "en": "Snoozed", "ar": "مؤجل"},
    "Résolu": {"fr": "Résolu", "en": "Resolved", "ar": "تم الحل"},
    "Opérations à valider par le propriétaire": {"fr": "Opérations à valider par le propriétaire", "en": "Operations awaiting owner approval", "ar": "عمليات تنتظر موافقة المالك"},
    "Relais d’impression": {"fr": "Relais d’impression", "en": "Print bridges", "ar": "مرحلات الطباعة"},
    "Travaux d’impression · 24 h": {"fr": "Travaux d’impression · 24 h", "en": "Print jobs · 24 h", "ar": "مهام الطباعة · 24 ساعة"},
    "Erreurs applicatives · 7 j": {"fr": "Erreurs applicatives · 7 j", "en": "Application errors · 7 days", "ar": "أخطاء التطبيق · 7 أيام"},
    "Support": {"fr": "Support", "en": "Support", "ar": "الدعم"},
    "Commandes connectées": {"fr": "Commandes connectées", "en": "Connected orders", "ar": "الطلبات المتصلة"},
    "Synchronisation financière des caisses": {"fr": "Synchronisation financière des caisses", "en": "Till financial sync", "ar": "المزامنة المالية للصناديق"},
    "Synchronisation Shopify": {"fr": "Synchronisation Shopify", "en": "Shopify sync", "ar": "مزامنة Shopify"},
    "Connexion Shopify": {"fr": "Connexion Shopify", "en": "Shopify connection", "ar": "اتصال Shopify"},
    "Livraisons à encaisser · plus de 3 j": {"fr": "Livraisons à encaisser · plus de 3 j", "en": "Deliveries awaiting payment · over 3 days", "ar": "توصيلات تنتظر التحصيل · أكثر من 3 أيام"},
    "Tables fermées sans encaissement · 14 j": {"fr": "Tables fermées sans encaissement · 14 j", "en": "Tables closed without payment · 14 days", "ar": "طاولات أغلقت دون تحصيل · 14 يوما"},
    "Rapprochements Z · 14 j": {"fr": "Rapprochements Z · 14 j", "en": "Z reconciliation · 14 days", "ar": "مطابقة Z · 14 يوما"},
    "Conflits de vente · 14 j": {"fr": "Conflits de vente · 14 j", "en": "Sale conflicts · 14 days", "ar": "تعارضات المبيعات · 14 يوما"},
    "Copies entre établissements refusées · 14 j": {"fr": "Copies entre établissements refusées · 14 j", "en": "Cross-store copies refused · 14 days", "ar": "نسخ بين المؤسسات مرفوضة · 14 يوما"},
    "Remises hors réglage · 14 j": {"fr": "Remises hors réglage · 14 j", "en": "Discounts outside settings · 14 days", "ar": "خصومات خارج الإعدادات · 14 يوما"},
    "Activité ventes · 7 j": {"fr": "Activité ventes · 7 j", "en": "Sales activity · 7 days", "ar": "نشاط المبيعات · 7 أيام"},
    "Tickets produit": {"fr": "Tickets produit", "en": "Product tickets", "ar": "تذاكر المنتج"},
    "Suivis": {"fr": "Suivis", "en": "Follow-ups", "ar": "المتابعات"},
    "Notes": {"fr": "Notes", "en": "Notes", "ar": "الملاحظات"},
    "Historique des suivis": {"fr": "Historique des suivis", "en": "Follow-up history", "ar": "سجل المتابعات"},
    "Synthèse": {"fr": "Synthèse", "en": "Summary", "ar": "ملخص"},
    "Mise en route": {"fr": "Mise en route", "en": "Getting started", "ar": "بدء التشغيل"},
    "Diagnostic": {"fr": "Diagnostic", "en": "Diagnostics", "ar": "التشخيص"},
    "Commercial": {"fr": "Commercial", "en": "Commercial", "ar": "تجاري"},
    "Configuration": {"fr": "Configuration", "en": "Configuration", "ar": "الإعدادات"},
    "Ventes": {"fr": "Ventes", "en": "Sales", "ar": "المبيعات"},
    "Compte": {"fr": "Compte", "en": "Account", "ar": "الحساب"},
    "Historique": {"fr": "Historique", "en": "History", "ar": "السجل"},
    "Votre journée, en contexte": {"fr": "Votre journée, en contexte", "en": "Your day, in context", "ar": "يومك في سياقه"},
    "Aujourd’hui": {"fr": "Aujourd’hui", "en": "Today", "ar": "اليوم"},
    "Les problèmes à vérifier, les clients à accompagner et les prochaines étapes.": {"fr": "Les problèmes à vérifier, les clients à accompagner et les prochaines étapes.", "en": "Problems to check, customers to help and next steps.", "ar": "مشاكل للتحقق منها وعملاء لمواكبتهم وخطوات قادمة."},
    "Votre portefeuille": {"fr": "Votre portefeuille", "en": "Your portfolio", "ar": "محفظتك"},
    "Établissements": {"fr": "Établissements", "en": "Stores", "ar": "المؤسسات"},
    "Un dossier par établissement, relié à son compte propriétaire.": {"fr": "Un dossier par établissement, relié à son compte propriétaire.", "en": "One dossier per store, linked to its owner account.", "ar": "ملف لكل مؤسسة مرتبط بحساب مالكها."},
    "Qualité de service": {"fr": "Qualité de service", "en": "Service quality", "ar": "جودة الخدمة"},
    "Diagnostic du parc": {"fr": "Diagnostic du parc", "en": "Fleet diagnostics", "ar": "تشخيص الأجهزة"},
    "Des observations datées, sans confondre un relais connecté avec une impression réussie.": {"fr": "Des observations datées, sans confondre un relais connecté avec une impression réussie.", "en": "Dated observations: a connected bridge does not prove successful printing.", "ar": "ملاحظات مؤرخة، اتصال المرحل لا يثبت نجاح الطباعة."},
    "Pilotage commercial": {"fr": "Pilotage commercial", "en": "Commercial management", "ar": "التدبير التجاري"},
    "Revenus & échéances": {"fr": "Revenus & échéances", "en": "Revenue & deadlines", "ar": "الإيرادات والآجال"},
    "MRR configuré, échéances et ventes commerçants : trois faits distincts.": {"fr": "MRR configuré, échéances et ventes commerçants : trois faits distincts.", "en": "Configured MRR, deadlines and merchant sales: three distinct facts.", "ar": "الإيراد الشهري المضبوط والآجال ومبيعات التجار: ثلاث حقائق مستقلة."},
    "Accompagnement": {"fr": "Accompagnement", "en": "Guidance", "ar": "المواكبة"},
    "Mises en route": {"fr": "Mises en route", "en": "Onboarding", "ar": "بدء التشغيل"},
    "Des étapes adaptées au métier, validées avec une preuve ou un résultat.": {"fr": "Des étapes adaptées au métier, validées avec une preuve ou un résultat.", "en": "Trade-specific steps, confirmed with evidence or an outcome.", "ar": "خطوات حسب النشاط تؤكد بدليل أو نتيجة."},
    "Équipe Kiwi": {"fr": "Équipe Kiwi", "en": "Kiwi team", "ar": "فريق Kiwi"},
    "Accès équipe": {"fr": "Accès équipe", "en": "Team access", "ar": "دخول الفريق"},
    "Comptes opérateurs nommés et responsabilités.": {"fr": "Comptes opérateurs nommés et responsabilités.", "en": "Named operator accounts and responsibilities.", "ar": "حسابات مشغلين بأسمائهم ومسؤولياتهم."},
    "Non observé": {"fr": "Non observé", "en": "Not observed", "ar": "لم يرصد"},
    "Démonstration locale · les dossiers sont fictifs. Les nouveaux suivis et notes nécessitent le service authentifié ; aucune écriture réelle n’est simulée.": {"fr": "Démonstration locale · les dossiers sont fictifs. Les nouveaux suivis et notes nécessitent le service authentifié ; aucune écriture réelle n’est simulée.", "en": "Local demonstration · fictitious dossiers. New follow-ups and notes require the authenticated service; no real write is simulated.", "ar": "عرض محلي · ملفات وهمية. المتابعات والملاحظات الجديدة تتطلب الخدمة الموثقة؛ لا تتم محاكاة كتابة حقيقية."},
    "Chargement des sources opérationnelles…": {"fr": "Chargement des sources opérationnelles…", "en": "Loading operational sources…", "ar": "جار تحميل المصادر التشغيلية…"},
    "Lecture opérationnelle indisponible": {"fr": "Lecture opérationnelle indisponible", "en": "Operational data unavailable", "ar": "البيانات التشغيلية غير متاحة"},
    ". Aucun zéro n’est déduit de cet échec.": {"fr": ". Aucun zéro n’est déduit de cet échec.", "en": ". No zero is inferred from this failure.", "ar": ". لا يستنتج أي صفر من هذا الفشل."},
    "Réessayez ; si le problème persiste, vérifiez l’authentification, le déploiement et le réseau.": {"fr": "Réessayez ; si le problème persiste, vérifiez l’authentification, le déploiement et le réseau.", "en": "Try again; if the problem persists, check authentication, deployment and network.", "ar": "أعد المحاولة؛ إن استمر المشكل تحقق من المصادقة والنشر والشبكة."},
    "Sources indisponibles :": {"fr": "Sources indisponibles :", "en": "Unavailable sources:", "ar": "مصادر غير متاحة:"},
    ". Un résultat absent n’est pas un résultat sain.": {"fr": ". Un résultat absent n’est pas un résultat sain.", "en": ". A missing result is not a healthy result.", "ar": ". غياب النتيجة لا يعني سلامة الحالة."},
    "Causes à vérifier :": {"fr": "Causes à vérifier :", "en": "Causes to check:", "ar": "أسباب للتحقق:"},
    "Vue partielle :": {"fr": "Vue partielle :", "en": "Partial view:", "ar": "عرض جزئي:"},
    ". Ouvrez un dossier pour réduire le périmètre ; les compteurs ci-dessous concernent les lignes chargées.": {"fr": ". Ouvrez un dossier pour réduire le périmètre ; les compteurs ci-dessous concernent les lignes chargées.", "en": ". Open a dossier to narrow the scope; the counters below cover loaded rows.", "ar": ". افتح ملفا لتضييق النطاق؛ العدادات أدناه تخص الصفوف المحملة."},
    "Service authentifié requis.": {"fr": "Service authentifié requis.", "en": "Authenticated service required.", "ar": "الخدمة الموثقة مطلوبة."},
    "Ce suivi a changé. Fermez puis rouvrez-le pour charger sa nouvelle version.": {"fr": "Ce suivi a changé. Fermez puis rouvrez-le pour charger sa nouvelle version.", "en": "This follow-up has changed. Close and reopen it to load the new version.", "ar": "تغيرت هذه المتابعة. أغلقها وافتحها لتحميل النسخة الجديدة."},
    "Un résultat est requis pour clôturer.": {"fr": "Un résultat est requis pour clôturer.", "en": "An outcome is required to close.", "ar": "النتيجة مطلوبة للإغلاق."},
    "Cet opérateur n’est plus disponible.": {"fr": "Cet opérateur n’est plus disponible.", "en": "This operator is no longer available.", "ar": "هذا المشغل لم يعد متاحا."},
    "Stockage indisponible. Rien n’est confirmé ; vous pouvez réessayer.": {"fr": "Stockage indisponible. Rien n’est confirmé ; vous pouvez réessayer.", "en": "Storage unavailable. Nothing is confirmed; you can try again.", "ar": "التخزين غير متاح. لم يؤكد شيء؛ يمكنك إعادة المحاولة."},
    "Service indisponible.": {"fr": "Service indisponible.", "en": "Service unavailable.", "ar": "الخدمة غير متاحة."},
    "À traiter": {"fr": "À traiter", "en": "Needs action", "ar": "يتطلب إجراء"},
    "À surveiller": {"fr": "À surveiller", "en": "Watch", "ar": "للمراقبة"},
    "Normal": {"fr": "Normal", "en": "Normal", "ar": "عادي"},
    "Inactif": {"fr": "Inactif", "en": "Inactive", "ar": "غير نشط"},
    "État des établissements": {"fr": "État des établissements", "en": "Store health", "ar": "حالة المؤسسات"},
    "Aucun établissement actif": {"fr": "Aucun établissement actif", "en": "No active store", "ar": "لا توجد مؤسسة نشطة"},
    "à traiter ·": {"fr": "à traiter ·", "en": "need action ·", "ar": "تتطلب إجراء ·"},
    "à surveiller ·": {"fr": "à surveiller ·", "en": "to watch ·", "ar": "للمراقبة ·"},
    "Établissement": {"fr": "Établissement", "en": "Store", "ar": "المؤسسة"},
    "État": {"fr": "État", "en": "Status", "ar": "الحالة"},
    "Dernière vente": {"fr": "Dernière vente", "en": "Last sale", "ar": "آخر بيع"},
    "Caisses": {"fr": "Caisses", "en": "Tills", "ar": "الصناديق"},
    "Dernier Z": {"fr": "Dernier Z", "en": "Last Z", "ar": "آخر Z"},
    "Aucune caisse suivie": {"fr": "Aucune caisse suivie", "en": "No tracked till", "ar": "لا يوجد صندوق متابع"},
    "bloquée(s)": {"fr": "bloquée(s)", "en": "blocked", "ar": "محظورة"},
    "Tout confirmé": {"fr": "Tout confirmé", "en": "All confirmed", "ar": "الكل مؤكد"},
    "Aucun": {"fr": "Aucun", "en": "None", "ar": "لا شيء"},
    "Concorde ·": {"fr": "Concorde ·", "en": "Matched ·", "ar": "متطابق ·"},
    "Écart": {"fr": "Écart", "en": "Difference", "ar": "الفرق"},
    "Aucune vente sur 7 j": {"fr": "Aucune vente sur 7 j", "en": "No sales in 7 days", "ar": "لا مبيعات خلال 7 أيام"},
    "· caisses, Z et ventes reçues. Une caisse connectée ne prouve pas que ses ventes sont enregistrées : seuls le Z et les ventes confirmées le prouvent.": {"fr": "· caisses, Z et ventes reçues. Une caisse connectée ne prouve pas que ses ventes sont enregistrées : seuls le Z et les ventes confirmées le prouvent.", "en": "· tills, Z reports and received sales. A connected till does not prove its sales are recorded: only Z reports and confirmed sales do.", "ar": "· الصناديق وتقارير Z والمبيعات المستلمة. اتصال الصندوق لا يثبت تسجيل مبيعاته: تؤكد ذلك تقارير Z والمبيعات المؤكدة فقط."},
    "Argent en jeu": {"fr": "Argent en jeu", "en": "Money at risk", "ar": "أموال معرضة للخطر"},
    "En test": {"fr": "En test", "en": "Testing", "ar": "قيد الاختبار"},
    "Amélioration": {"fr": "Amélioration", "en": "Improvement", "ar": "تحسين"},
    "Problème": {"fr": "Problème", "en": "Problem", "ar": "مشكلة"},
    "Aucun ticket ouvert": {"fr": "Aucun ticket ouvert", "en": "No open ticket", "ar": "لا تذكرة مفتوحة"},
    "Queues non observées": {"fr": "Queues non observées", "en": "Queues not observed", "ar": "الطوابير غير مرصودة"},
    "Rapport de caisse absent, ancien ou incomplet. La santé actuelle des files de ventes et de stock reste inconnue. Reconnecter les appareils et vérifier leurs files.": {"fr": "Rapport de caisse absent, ancien ou incomplet. La santé actuelle des files de ventes et de stock reste inconnue. Reconnecter les appareils et vérifier leurs files.", "en": "Till report missing, stale or incomplete. Current sales and stock queue health is unknown. Reconnect devices and check their queues.", "ar": "تقرير الصندوق غائب أو قديم أو ناقص. حالة طوابير المبيعات والمخزون مجهولة. أعد توصيل الأجهزة وتحقق من طوابيرها."},
    "Impression à vérifier": {"fr": "Impression à vérifier", "en": "Check printing", "ar": "التحقق من الطباعة"},
    "Le relais rapporte «": {"fr": "Le relais rapporte «", "en": "The bridge reports “", "ar": "يبلغ المرحل عن «"},
    ". Vérifier le ticket avant toute réimpression.": {"fr": ". Vérifier le ticket avant toute réimpression.", "en": ". Check the receipt before reprinting.", "ar": ". تحقق من الوصل قبل إعادة الطباعة."},
    "Erreur applicative reçue": {"fr": "Erreur applicative reçue", "en": "Application error received", "ar": "خطأ تطبيق مستلم"},
    "Écart entre le Z et le serveur": {"fr": "Écart entre le Z et le serveur", "en": "Z and server discrepancy", "ar": "فرق بين Z والخادم"},
    "Z du": {"fr": "Z du", "en": "Z for", "ar": "Z ليوم"},
    "· écart": {"fr": "· écart", "en": "· difference", "ar": "· الفرق"},
    "MAD ·": {"fr": "MAD ·", "en": "MAD ·", "ar": "درهم ·"},
    "Opération à valider par le propriétaire": {"fr": "Opération à valider par le propriétaire", "en": "Operation awaiting owner approval", "ar": "عملية تنتظر موافقة المالك"},
    "Remboursement": {"fr": "Remboursement", "en": "Refund", "ar": "استرداد"},
    "Vente": {"fr": "Vente", "en": "Sale", "ar": "بيع"},
    ". Conservée sur le serveur, décision requise dans le tableau de bord du propriétaire.": {"fr": ". Conservée sur le serveur, décision requise dans le tableau de bord du propriétaire.", "en": ". Stored on the server; a decision is required in the owner's dashboard.", "ar": ". محفوظة على الخادم؛ يلزم قرار في لوحة المالك."},
    "Vente bloquée en caisse": {"fr": "Vente bloquée en caisse", "en": "Sale blocked at till", "ar": "بيع محظور في الصندوق"},
    "vente(s) refusée(s) par le serveur sur": {"fr": "vente(s) refusée(s) par le serveur sur", "en": "sale(s) refused by the server on", "ar": "مبيعات رفضها الخادم على"},
    "MAD · motif «": {"fr": "MAD · motif «", "en": "MAD · reason “", "ar": "درهم · السبب «"},
    ". Elle(s) n’apparaîtront pas au tableau de bord tant qu’elles ne sont pas refaites ou débloquées.": {"fr": ". Elle(s) n’apparaîtront pas au tableau de bord tant qu’elles ne sont pas refaites ou débloquées.", "en": ". They will not appear on the dashboard until redone or unblocked.", "ar": ". لن تظهر في اللوحة حتى إعادتها أو رفع الحظر عنها."},
    "Caisse sur une ancienne version": {"fr": "Caisse sur une ancienne version", "en": "Till running an old version", "ar": "صندوق يعمل بنسخة قديمة"},
    "Une mise à jour attend depuis": {"fr": "Une mise à jour attend depuis", "en": "An update has been waiting for", "ar": "تحديث ينتظر منذ"},
    ". Les correctifs publiés depuis n’y tournent pas. Demander à l’équipe d’appuyer sur « Rafraîchir » (en bas de l’écran) entre deux clients.": {"fr": ". Les correctifs publiés depuis n’y tournent pas. Demander à l’équipe d’appuyer sur « Rafraîchir » (en bas de l’écran) entre deux clients.", "en": ". Published fixes are not running there. Ask the team to press “Refresh” (bottom of the screen) between customers.", "ar": ". الإصلاحات المنشورة لا تعمل هناك. اطلب من الفريق الضغط على «تحديث» أسفل الشاشة بين عميلين."},
    "Stock bloqué en caisse": {"fr": "Stock bloqué en caisse", "en": "Stock blocked at till", "ar": "مخزون محظور في الصندوق"},
    "Stockage du navigateur plein sur": {"fr": "Stockage du navigateur plein sur", "en": "Browser storage full on", "ar": "تخزين المتصفح ممتلئ على"},
    "· dernier refus HTTP": {"fr": "· dernier refus HTTP", "en": "· last HTTP refusal", "ar": "· آخر رفض HTTP"},
    "mouvement(s) refusé(s) par le serveur": {"fr": "mouvement(s) refusé(s) par le serveur", "en": "stock movement(s) refused by the server", "ar": "حركات مخزون رفضها الخادم"},
    "Les ventes continuent ; le stock du tableau de bord ne les voit pas.": {"fr": "Les ventes continuent ; le stock du tableau de bord ne les voit pas.", "en": "Sales continue; dashboard stock does not reflect them.", "ar": "تستمر المبيعات؛ مخزون اللوحة لا يعكسها."},
    "Vente en conflit": {"fr": "Vente en conflit", "en": "Sale conflict", "ar": "تعارض بيع"},
    "La vente": {"fr": "La vente", "en": "Sale", "ar": "البيع"},
    "a été reçue deux fois avec des montants différents (": {"fr": "a été reçue deux fois avec des montants différents (", "en": "was received twice with different amounts (", "ar": "استلم مرتين بمبلغين مختلفين ("},
    "Données d’un autre établissement refusées": {"fr": "Données d’un autre établissement refusées", "en": "Another store's data refused", "ar": "بيانات مؤسسة أخرى مرفوضة"},
    "Un appareil de ce client a tenté": {"fr": "Un appareil de ce client a tenté", "en": "A device at this store attempted", "ar": "حاول جهاز هذه المؤسسة"},
    "» avec les données de": {"fr": "» avec les données de", "en": "” with data from", "ar": "» ببيانات من"},
    "· dernière tentative": {"fr": "· dernière tentative", "en": "· last attempt", "ar": "· آخر محاولة"},
    ". Le serveur a refusé ; recharger ou réappairer ses appareils, et vérifier quel onglet ou quelle caisse a changé de client.": {"fr": ". Le serveur a refusé ; recharger ou réappairer ses appareils, et vérifier quel onglet ou quelle caisse a changé de client.", "en": ". The server refused; reload or re-pair devices and check which tab or till switched stores.", "ar": ". رفض الخادم؛ أعد تحميل الأجهزة أو إقرانها وتحقق من التبويب أو الصندوق الذي غير المؤسسة."},
    "Remise hors réglage encaissée": {"fr": "Remise hors réglage encaissée", "en": "Discount outside settings collected", "ar": "تحصيل خصم خارج الإعدادات"},
    "Montant encaissé en désaccord avec son panier": {"fr": "Montant encaissé en désaccord avec son panier", "en": "Amount collected disagrees with its basket", "ar": "المبلغ المحصل لا يطابق سلة الشراء"},
    "Horloge de la caisse décalée": {"fr": "Horloge de la caisse décalée", "en": "Till clock is off", "ar": "ساعة الصندوق غير مضبوطة"},
    ". La vente est comptée ; vérifier la caisse concernée (panier, heure de l’appareil).": {"fr": ". La vente est comptée ; vérifier la caisse concernée (panier, heure de l’appareil).", "en": ". The sale is counted; check the till involved (basket, device clock).", "ar": ". البيع محسوب؛ تحقق من الصندوق المعني (السلة، ساعة الجهاز)."},
    "Ventes signalées par le serveur · 14 j": {"fr": "Ventes signalées par le serveur · 14 j", "en": "Sales flagged by the server · 14 d", "ar": "مبيعات أشار إليها الخادم · 14 ي"},
    "Ticket": {"fr": "Ticket", "en": "Receipt", "ar": "الوصل"},
    ". La vente est comptée ; vérifier qui a appliqué la remise et recharger la caisse concernée.": {"fr": ". La vente est comptée ; vérifier qui a appliqué la remise et recharger la caisse concernée.", "en": ". The sale is counted; check who applied the discount and reload the till.", "ar": ". البيع محسوب؛ تحقق ممن طبق الخصم وأعد تحميل الصندوق."},
    "Table fermée sans encaissement": {"fr": "Table fermée sans encaissement", "en": "Table closed without payment", "ar": "طاولة أغلقت دون تحصيل"},
    "Table": {"fr": "Table", "en": "Table", "ar": "الطاولة"},
    "MAD de commandes jamais encaissées (": {"fr": "MAD de commandes jamais encaissées (", "en": "MAD of orders never collected (", "ar": "درهم من طلبات لم تحصل ("},
    ") · fermée": {"fr": ") · fermée", "en": ") · closed", "ar": ") · أغلقت"},
    ". Demander au gérant si l’addition a été payée hors caisse ; sinon l’encaisser.": {"fr": ". Demander au gérant si l’addition a été payée hors caisse ; sinon l’encaisser.", "en": ". Ask the manager whether payment was taken outside the till; otherwise collect it.", "ar": ". اسأل المسير إن تم الدفع خارج الصندوق؛ وإلا حصله."},
    "Livraison non encaissée": {"fr": "Livraison non encaissée", "en": "Uncollected delivery", "ar": "توصيل غير محصل"},
    "MAD à encaisser · ticket": {"fr": "MAD à encaisser · ticket", "en": "MAD to collect · receipt", "ar": "درهم للتحصيل · الوصل"},
    "jours. Demander au client si le livreur a rapporté l’argent ; l’encaisser dans Acomptes ou Créances.": {"fr": "jours. Demander au client si le livreur a rapporté l’argent ; l’encaisser dans Acomptes ou Créances.", "en": "days. Ask whether the courier returned the money; collect it under Deposits or Receivables.", "ar": "أيام. اسأل إن أعاد الموصل المال؛ حصله في التسبيقات أو الديون."},
    "Shopify signale une erreur": {"fr": "Shopify signale une erreur", "en": "Shopify reports an error", "ar": "يبلغ Shopify عن خطأ"},
    "· dernière observation": {"fr": "· dernière observation", "en": "· last observation", "ar": "· آخر رصد"},
    ". Ouvrir le panneau Shopify du client. Une « boutique inattendue » sur un domaine myshopify est acceptée depuis le 21 octobre ; une signature invalide demande de reconnecter.": {"fr": ". Ouvrir le panneau Shopify du client. Une « boutique inattendue » sur un domaine myshopify est acceptée depuis le 21 octobre ; une signature invalide demande de reconnecter.", "en": ". Open the customer's Shopify panel. An “unexpected shop” on a myshopify domain is accepted since 21 October; an invalid signature requires reconnection.", "ar": ". افتح لوحة Shopify للعميل. يقبل «متجر غير متوقع» بنطاق myshopify منذ 21 أكتوبر؛ التوقيع غير الصالح يتطلب إعادة الاتصال."},
    "Support ·": {"fr": "Support ·", "en": "Support ·", "ar": "الدعم ·"},
    "Synchronisation à examiner": {"fr": "Synchronisation à examiner", "en": "Sync to examine", "ar": "مزامنة للفحص"},
    "Shopify": {"fr": "Shopify", "en": "Shopify", "ar": "Shopify"},
    "Nouvelle occurrence ·": {"fr": "Nouvelle occurrence ·", "en": "New occurrence ·", "ar": "حالة جديدة ·"},
    "Incidents": {"fr": "Incidents", "en": "Incidents", "ar": "الحوادث"},
    "Mes suivis": {"fr": "Mes suivis", "en": "My follow-ups", "ar": "متابعاتي"},
    "En retard": {"fr": "En retard", "en": "Overdue", "ar": "متأخرة"},
    "Sans responsable": {"fr": "Sans responsable", "en": "Unassigned", "ar": "بدون مسؤول"},
    "Reportés": {"fr": "Reportés", "en": "Snoozed", "ar": "مؤجلة"},
    "Résolus": {"fr": "Résolus", "en": "Resolved", "ar": "محلولة"},
    "Signal à qualifier": {"fr": "Signal à qualifier", "en": "Signal to assess", "ar": "إشارة للتقييم"},
    "Échéance :": {"fr": "Échéance :", "en": "Due:", "ar": "الأجل:"},
    "Résultat :": {"fr": "Résultat :", "en": "Outcome:", "ar": "النتيجة:"},
    "Mettre à jour": {"fr": "Mettre à jour", "en": "Update", "ar": "تحديث"},
    "Suivre": {"fr": "Suivre", "en": "Follow up", "ar": "متابعة"},
    "Examiner": {"fr": "Examiner", "en": "Examine", "ar": "فحص"},
    "Rien dans cette vue": {"fr": "Rien dans cette vue", "en": "Nothing in this view", "ar": "لا شيء في هذا العرض"},
    "Les sources indisponibles ne sont pas comptées comme résolues.": {"fr": "Les sources indisponibles ne sont pas comptées comme résolues.", "en": "Unavailable sources are not counted as resolved.", "ar": "لا تحسب المصادر غير المتاحة كمحلولة."},
    "Indisponible": {"fr": "Indisponible", "en": "Unavailable", "ar": "غير متاح"},
    "À vérifier en priorité": {"fr": "À vérifier en priorité", "en": "Check first", "ar": "للتحقق أولا"},
    "Signaux et suivis chargés": {"fr": "Signaux et suivis chargés", "en": "Loaded signals and follow-ups", "ar": "الإشارات والمتابعات المحملة"},
    "Suivis en retard": {"fr": "Suivis en retard", "en": "Overdue follow-ups", "ar": "متابعات متأخرة"},
    "Échéance dépassée, non résolus": {"fr": "Échéance dépassée, non résolus", "en": "Past due, unresolved", "ar": "تجاوزت الأجل ولم تحل"},
    "Hors démonstrations": {"fr": "Hors démonstrations", "en": "Excluding demonstrations", "ar": "باستثناء العروض التجريبية"},
    "Ventes reçues aujourd’hui": {"fr": "Ventes reçues aujourd’hui", "en": "Sales received today", "ar": "مبيعات مستلمة اليوم"},
    "Net des annulations · journée métier": {"fr": "Net des annulations · journée métier", "en": "Net of cancellations · business day", "ar": "صافي الإلغاءات · يوم العمل"},
    "Votre file de travail": {"fr": "Votre file de travail", "en": "Your work queue", "ar": "قائمة عملك"},
    "Qualifier, attribuer, suivre jusqu’au résultat.": {"fr": "Qualifier, attribuer, suivre jusqu’au résultat.", "en": "Assess, assign and follow through to an outcome.", "ar": "قيّم وعيّن وتابع حتى النتيجة."},
    "Parcours client": {"fr": "Parcours client", "en": "Customer journey", "ar": "مسار العميل"},
    "Activation à examiner": {"fr": "Activation à examiner", "en": "Activation to examine", "ar": "تفعيل للفحص"},
    "En essai": {"fr": "En essai", "en": "On trial", "ar": "في التجربة"},
    "Préparer le prochain point": {"fr": "Préparer le prochain point", "en": "Prepare the next check-in", "ar": "تحضير اللقاء القادم"},
    "Échéance dépassée": {"fr": "Échéance dépassée", "en": "Past due", "ar": "تجاوز الأجل"},
    "Vérifier le renouvellement": {"fr": "Vérifier le renouvellement", "en": "Check renewal", "ar": "التحقق من التجديد"},
    "Conditions à compléter": {"fr": "Conditions à compléter", "en": "Terms to complete", "ar": "شروط للإكمال"},
    "Ne signifie pas accès bloqué": {"fr": "Ne signifie pas accès bloqué", "en": "Does not mean blocked access", "ar": "لا يعني حظر الدخول"},
    "Couverture des sources": {"fr": "Couverture des sources", "en": "Source coverage", "ar": "تغطية المصادر"},
    "État à la dernière lecture": {"fr": "État à la dernière lecture", "en": "Status at last read", "ar": "الحالة عند آخر قراءة"},
    "Aucune opération en attente": {"fr": "Aucune opération en attente", "en": "No pending operation", "ar": "لا عملية معلقة"},
    "Lecture indisponible": {"fr": "Lecture indisponible", "en": "Read unavailable", "ar": "القراءة غير متاحة"},
    "La caisse conserve sa copie tant que la décision n’est pas réglée.": {"fr": "La caisse conserve sa copie tant que la décision n’est pas réglée.", "en": "The till keeps its copy until the decision is settled.", "ar": "يحتفظ الصندوق بنسخته حتى تسوية القرار."},
    "Copie serveur durable, sans limite d’âge. Seul le propriétaire peut décider.": {"fr": "Copie serveur durable, sans limite d’âge. Seul le propriétaire peut décider.", "en": "Durable server copy, with no age limit. Only the owner can decide.", "ar": "نسخة دائمة على الخادم دون حد زمني. المالك وحده يقرر."},
    "Établissement / caisse": {"fr": "Établissement / caisse", "en": "Store / till", "ar": "المؤسسة / الصندوق"},
    "Ventes non confirmées": {"fr": "Ventes non confirmées", "en": "Unconfirmed sales", "ar": "مبيعات غير مؤكدة"},
    "Plus ancienne": {"fr": "Plus ancienne", "en": "Oldest", "ar": "الأقدم"},
    "Dernier acquittement": {"fr": "Dernier acquittement", "en": "Last acknowledgement", "ar": "آخر تأكيد"},
    "Erreur HTTP": {"fr": "Erreur HTTP", "en": "HTTP error", "ar": "خطأ HTTP"},
    "Observation": {"fr": "Observation", "en": "Observation", "ar": "الرصد"},
    "Inconnu": {"fr": "Inconnu", "en": "Unknown", "ar": "مجهول"},
    "Déclaré par la caisse · connectée ≠ synchronisée": {"fr": "Déclaré par la caisse · connectée ≠ synchronisée", "en": "Reported by till · connected ≠ synced", "ar": "بتصريح الصندوق · متصل ≠ متزامن"},
    "Aucune caisse n’a signalé son état financier": {"fr": "Aucune caisse n’a signalé son état financier", "en": "No till reported its financial status", "ar": "لم يصرح أي صندوق بحالته المالية"},
    "État financier indisponible": {"fr": "État financier indisponible", "en": "Financial status unavailable", "ar": "الحالة المالية غير متاحة"},
    "Un appareil connecté ne prouve jamais que ses ventes sont enregistrées.": {"fr": "Un appareil connecté ne prouve jamais que ses ventes sont enregistrées.", "en": "A connected device never proves its sales are recorded.", "ar": "اتصال الجهاز لا يثبت أبدا تسجيل مبيعاته."},
    "État autodéclaré par les appareils ; vérifier les rapports Z et le journal central avant de conclure.": {"fr": "État autodéclaré par les appareils ; vérifier les rapports Z et le journal central avant de conclure.", "en": "Device-reported status; check Z reports and central journal before concluding.", "ar": "حالة بتصريح الأجهزة؛ تحقق من تقارير Z والسجل المركزي قبل الاستنتاج."},
    "Établissement / relais": {"fr": "Établissement / relais", "en": "Store / bridge", "ar": "المؤسسة / المرحل"},
    "Version": {"fr": "Version", "en": "Version", "ar": "النسخة"},
    "Dernière observation": {"fr": "Dernière observation", "en": "Last observation", "ar": "آخر رصد"},
    "Version inconnue": {"fr": "Version inconnue", "en": "Unknown version", "ar": "نسخة مجهولة"},
    "Observation récente": {"fr": "Observation récente", "en": "Recent observation", "ar": "رصد حديث"},
    "Présence actuelle inconnue": {"fr": "Présence actuelle inconnue", "en": "Current presence unknown", "ar": "الحضور الحالي مجهول"},
    "Aucun relais dans ce périmètre": {"fr": "Aucun relais dans ce périmètre", "en": "No bridge in this scope", "ar": "لا مرحل في هذا النطاق"},
    "Relais indisponibles": {"fr": "Relais indisponibles", "en": "Bridges unavailable", "ar": "المرحلات غير متاحة"},
    "La connexion et la sortie papier sont deux vérifications distinctes.": {"fr": "La connexion et la sortie papier sont deux vérifications distinctes.", "en": "Connection and paper output are two separate checks.", "ar": "الاتصال وخروج الورق تحققان مستقلان."},
    "Événements à examiner": {"fr": "Événements à examiner", "en": "Events to examine", "ar": "أحداث للفحص"},
    "Relais cloud uniquement. Les impressions locales ne sont pas toutes observables ici.": {"fr": "Relais cloud uniquement. Les impressions locales ne sont pas toutes observables ici.", "en": "Cloud bridges only. Local prints are not all observable here.", "ar": "مرحلات سحابية فقط. لا يمكن رصد كل الطباعة المحلية هنا."},
    "Commencer le suivi": {"fr": "Commencer le suivi", "en": "Start follow-up", "ar": "بدء المتابعة"},
    "étapes confirmées ·": {"fr": "étapes confirmées ·", "en": "confirmed steps ·", "ar": "خطوات مؤكدة ·"},
    "Périmètre du MRR": {"fr": "Périmètre du MRR", "en": "MRR scope", "ar": "نطاق الإيراد الشهري المتكرر"},
    "Montants mensuels configurés pour les contrats actifs. Les accès en attente, essais, contrats futurs et échus sont exclus. Ce n’est ni une facture ni une preuve d’encaissement.": {"fr": "Montants mensuels configurés pour les contrats actifs. Les accès en attente, essais, contrats futurs et échus sont exclus. Ce n’est ni une facture ni une preuve d’encaissement.", "en": "Configured monthly amounts for active contracts. Pending access, trials, future and expired contracts are excluded. This is neither an invoice nor proof of payment.", "ar": "مبالغ شهرية مضبوطة للعقود النشطة. يستثنى الدخول المعلق والتجارب والعقود المستقبلية والمنتهية. ليست فاتورة ولا إثبات تحصيل."},
    "Situation": {"fr": "Situation", "en": "Situation", "ar": "الوضع"},
    "Contribution MAD/mois": {"fr": "Contribution MAD/mois", "en": "Contribution MAD/month", "ar": "المساهمة درهم/شهر"},
    "Payant configuré": {"fr": "Payant configuré", "en": "Configured paid plan", "ar": "اشتراك مدفوع مضبوط"},
    "Non comptabilisé": {"fr": "Non comptabilisé", "en": "Not counted", "ar": "غير محسوب"},
    "Détail indisponible": {"fr": "Détail indisponible", "en": "Details unavailable", "ar": "التفاصيل غير متاحة"},
    "La version de la source ne fournit pas les contributions.": {"fr": "La version de la source ne fournit pas les contributions.", "en": "This source version does not provide contributions.", "ar": "نسخة المصدر لا توفر المساهمات."},
    "rapport(s) hors dossiers clients réels. Attribution à vérifier ; aucun client n’est deviné.": {"fr": "rapport(s) hors dossiers clients réels. Attribution à vérifier ; aucun client n’est deviné.", "en": "report(s) outside real customer dossiers. Check attribution; no customer is guessed.", "ar": "تقارير خارج ملفات العملاء الحقيقيين. تحقق من النسبة؛ لا يفترض أي عميل."},
    "Rapports reçus dans les 7 derniers jours. Les compteurs peuvent couvrir des occurrences antérieures.": {"fr": "Rapports reçus dans les 7 derniers jours. Les compteurs peuvent couvrir des occurrences antérieures.", "en": "Reports received in the last 7 days. Counts may cover earlier occurrences.", "ar": "تقارير مستلمة خلال آخر 7 أيام. قد تشمل العدادات حالات أقدم."},
    "Erreur": {"fr": "Erreur", "en": "Error", "ar": "الخطأ"},
    "Fichier / version": {"fr": "Fichier / version", "en": "File / version", "ar": "الملف / النسخة"},
    "Occurrences": {"fr": "Occurrences", "en": "Occurrences", "ar": "الحالات"},
    "Dernière réception": {"fr": "Dernière réception", "en": "Last received", "ar": "آخر استلام"},
    "Erreurs applicatives reçues": {"fr": "Erreurs applicatives reçues", "en": "Application errors received", "ar": "أخطاء التطبيق المستلمة"},
    "Fichier inconnu": {"fr": "Fichier inconnu", "en": "Unknown file", "ar": "ملف مجهول"},
    "Démonstration": {"fr": "Démonstration", "en": "Demonstration", "ar": "عرض تجريبي"},
    "Dossier non reconnu": {"fr": "Dossier non reconnu", "en": "Unrecognized dossier", "ar": "ملف غير معروف"},
    "Non attribué": {"fr": "Non attribué", "en": "Unattributed", "ar": "غير منسوب"},
    "Message non transmis": {"fr": "Message non transmis", "en": "Message not sent", "ar": "الرسالة غير مرسلة"},
    "Aucun rapport reçu dans ce périmètre": {"fr": "Aucun rapport reçu dans ce périmètre", "en": "No report received in this scope", "ar": "لا تقرير مستلم في هذا النطاق"},
    "Erreurs indisponibles": {"fr": "Erreurs indisponibles", "en": "Errors unavailable", "ar": "الأخطاء غير متاحة"},
    "Cela ne prouve pas l’absence d’erreurs sur les appareils.": {"fr": "Cela ne prouve pas l’absence d’erreurs sur les appareils.", "en": "This does not prove devices have no errors.", "ar": "لا يثبت ذلك خلو الأجهزة من الأخطاء."},
    "Note": {"fr": "Note", "en": "Note", "ar": "ملاحظة"},
    "Statut :": {"fr": "Statut :", "en": "Status:", "ar": "الحالة:"},
    "Suivi créé": {"fr": "Suivi créé", "en": "Follow-up created", "ar": "أنشئت المتابعة"},
    "Suivi mis à jour": {"fr": "Suivi mis à jour", "en": "Follow-up updated", "ar": "حدثت المتابعة"},
    "Pas encore de notes ou de suivi": {"fr": "Pas encore de notes ou de suivi", "en": "No notes or follow-ups yet", "ar": "لا ملاحظات أو متابعات بعد"},
    "Les anciennes actions de configuration restent dans l’onglet Historique.": {"fr": "Les anciennes actions de configuration restent dans l’onglet Historique.", "en": "Earlier configuration actions remain in History.", "ar": "تبقى إجراءات الإعداد السابقة في السجل."},
    "Ville non renseignée": {"fr": "Ville non renseignée", "en": "City not provided", "ar": "المدينة غير محددة"},
    "Métier non renseigné": {"fr": "Métier non renseigné", "en": "Trade not provided", "ar": "النشاط غير محدد"},
    "Le prochain point": {"fr": "Le prochain point", "en": "Next check-in", "ar": "اللقاء القادم"},
    "Contact à confirmer": {"fr": "Contact à confirmer", "en": "Contact to confirm", "ar": "جهة اتصال للتأكيد"},
    "Adresse à confirmer": {"fr": "Adresse à confirmer", "en": "Address to confirm", "ar": "عنوان للتأكيد"},
    "Abonnement payant configuré": {"fr": "Abonnement payant configuré", "en": "Configured paid subscription", "ar": "اشتراك مدفوع مضبوط"},
    "Dernière vente reçue :": {"fr": "Dernière vente reçue :", "en": "Last sale received:", "ar": "آخر بيع مستلم:"},
    "sujet(s) à examiner.": {"fr": "sujet(s) à examiner.", "en": "subject(s) to examine.", "ar": "مواضيع للفحص."},
    "Commencer par :": {"fr": "Commencer par :", "en": "Start with:", "ar": "ابدأ بـ:"},
    "Confirmer avec le commerçant que son parcours habituel fonctionne.": {"fr": "Confirmer avec le commerçant que son parcours habituel fonctionne.", "en": "Confirm with the merchant that their usual workflow works.", "ar": "أكد مع التاجر أن مساره المعتاد يعمل."},
    "Synthèse déterministe du dossier et des sources chargées · aucune conclusion générée.": {"fr": "Synthèse déterministe du dossier et des sources chargées · aucune conclusion générée.", "en": "Deterministic summary of dossier and loaded sources · no generated conclusion.", "ar": "ملخص محدد للملف والمصادر المحملة · دون استنتاج مولد."},
    "Ouvrir le support": {"fr": "Ouvrir le support", "en": "Open support", "ar": "فتح الدعم"},
    "Ajouter un suivi": {"fr": "Ajouter un suivi", "en": "Add follow-up", "ar": "إضافة متابعة"},
    "Journal de relation": {"fr": "Journal de relation", "en": "Relationship journal", "ar": "سجل العلاقة"},
    "Ajouter une note": {"fr": "Ajouter une note", "en": "Add a note", "ar": "إضافة ملاحظة"},
    "Note interne": {"fr": "Note interne", "en": "Internal note", "ar": "ملاحظة داخلية"},
    "Visible par l’équipe opérateur. Ne pas ajouter de PIN, mot de passe ou donnée de paiement.": {"fr": "Visible par l’équipe opérateur. Ne pas ajouter de PIN, mot de passe ou donnée de paiement.", "en": "Visible to the operator team. Do not add PINs, passwords or payment data.", "ar": "مرئية لفريق المشغلين. لا تضف رموزا شخصية أو كلمات مرور أو بيانات دفع."},
    "Échange, décision, engagement…": {"fr": "Échange, décision, engagement…", "en": "Conversation, decision, commitment…", "ar": "محادثة، قرار، التزام…"},
    "Enregistrer la note": {"fr": "Enregistrer la note", "en": "Save note", "ar": "حفظ الملاحظة"},
    "Suivis de l’établissement": {"fr": "Suivis de l’établissement", "en": "Store follow-ups", "ar": "متابعات المؤسسة"},
    "Dossier établissement": {"fr": "Dossier établissement", "en": "Store dossier", "ar": "ملف المؤسسة"},
    "Le contexte, les engagements et les outils du même établissement.": {"fr": "Le contexte, les engagements et les outils du même établissement.", "en": "Context, commitments and tools for the same store.", "ar": "سياق والتزامات وأدوات المؤسسة نفسها."},
    "Démonstration locale · aucune donnée opérationnelle en direct": {"fr": "Démonstration locale · aucune donnée opérationnelle en direct", "en": "Local demonstration · no live operational data", "ar": "عرض محلي · دون بيانات تشغيلية مباشرة"},
    "Dernière lecture :": {"fr": "Dernière lecture :", "en": "Last read:", "ar": "آخر قراءة:"},
    "· données anciennes": {"fr": "· données anciennes", "en": "· stale data", "ar": "· بيانات قديمة"},
    "· dossier à rafraîchir manuellement": {"fr": "· dossier à rafraîchir manuellement", "en": "· refresh dossier manually", "ar": "· حدث الملف يدويا"},
    "· dossier actualisé automatiquement": {"fr": "· dossier actualisé automatiquement", "en": "· dossier refreshed automatically", "ar": "· يُحدَّث الملف تلقائيا"},
    "En attente d’une lecture confirmée": {"fr": "En attente d’une lecture confirmée", "en": "Awaiting a confirmed read", "ar": "في انتظار قراءة مؤكدة"},
    "· Journée métier : Afrique/Casablanca, 05 h": {"fr": "· Journée métier : Afrique/Casablanca, 05 h", "en": "· Business day: Africa/Casablanca, 05:00", "ar": "· يوم العمل: Africa/Casablanca، 05:00"},
    "D1 · ancien": {"fr": "D1 · ancien", "en": "D1 · stale", "ar": "D1 · قديم"},
    "D1 · instantané": {"fr": "D1 · instantané", "en": "D1 · snapshot", "ar": "D1 · لقطة"},
    "Accès opérateur refusé ou session expirée. Réauthentifiez-vous puis réessayez.": {"fr": "Accès opérateur refusé ou session expirée. Réauthentifiez-vous puis réessayez.", "en": "Operator access refused or session expired. Sign in again and retry.", "ar": "دخول المشغل مرفوض أو انتهت الجلسة. سجل الدخول وأعد المحاولة."},
    "Service ou base indisponible. Vérifiez le déploiement puis réessayez.": {"fr": "Service ou base indisponible. Vérifiez le déploiement puis réessayez.", "en": "Service or database unavailable. Check deployment and retry.", "ar": "الخدمة أو القاعدة غير متاحة. تحقق من النشر وأعد المحاولة."},
    "Établissement introuvable.": {"fr": "Établissement introuvable.", "en": "Store not found.", "ar": "المؤسسة غير موجودة."},
    "Mettre à jour le suivi": {"fr": "Mettre à jour le suivi", "en": "Update follow-up", "ar": "تحديث المتابعة"},
    "Nouveau suivi": {"fr": "Nouveau suivi", "en": "New follow-up", "ar": "متابعة جديدة"},
    "Une prochaine étape, un responsable, un résultat.": {"fr": "Une prochaine étape, un responsable, un résultat.", "en": "A next step, an owner, an outcome.", "ar": "خطوة قادمة ومسؤول ونتيجة."},
    "Prochaine étape": {"fr": "Prochaine étape", "en": "Next step", "ar": "الخطوة القادمة"},
    "Contexte": {"fr": "Contexte", "en": "Context", "ar": "السياق"},
    "Responsable": {"fr": "Responsable", "en": "Owner", "ar": "المسؤول"},
    "Échéance": {"fr": "Échéance", "en": "Due date", "ar": "الأجل"},
    "Reprendre le suivi le (si reporté)": {"fr": "Reprendre le suivi le (si reporté)", "en": "Resume follow-up on (if snoozed)", "ar": "استئناف المتابعة في (إن أجلت)"},
    "Résultat / preuve (requis pour résoudre)": {"fr": "Résultat / preuve (requis pour résoudre)", "en": "Outcome / evidence (required to resolve)", "ar": "النتيجة / الدليل (مطلوب للحل)"},
    "Priorité": {"fr": "Priorité", "en": "Priority", "ar": "الأولوية"},
    "1 · Bloquant": {"fr": "1 · Bloquant", "en": "1 · Blocking", "ar": "1 · معطل"},
    "2 · À traiter": {"fr": "2 · À traiter", "en": "2 · Needs action", "ar": "2 · يتطلب إجراء"},
    "3 · Suivi": {"fr": "3 · Suivi", "en": "3 · Follow-up", "ar": "3 · متابعة"},
    "4 · Données à compléter": {"fr": "4 · Données à compléter", "en": "4 · Data to complete", "ar": "4 · بيانات للإكمال"},
    "Annuler": {"fr": "Annuler", "en": "Cancel", "ar": "إلغاء"},
    "Enregistrer": {"fr": "Enregistrer", "en": "Save", "ar": "حفظ"},
    "Ce signal dispose déjà d’un suivi.": {"fr": "Ce signal dispose déjà d’un suivi.", "en": "This signal already has a follow-up.", "ar": "لهذه الإشارة متابعة بالفعل."},
    "Suivi enregistré.": {"fr": "Suivi enregistré.", "en": "Follow-up saved.", "ar": "حفظت المتابعة."},
    "Aucun établissement": {"fr": "Aucun établissement", "en": "No store", "ar": "لا مؤسسة"},
    "Retour à la journée": {"fr": "Retour à la journée", "en": "Back to today", "ar": "العودة إلى اليوم"},
    "Note enregistrée.": {"fr": "Note enregistrée.", "en": "Note saved.", "ar": "حفظت الملاحظة."},
    "normal": {"fr": "normal", "en": "normal", "ar": "عادي"},
    "inactif": {"fr": "inactif", "en": "inactive", "ar": "غير نشط"},
    "active": {"fr": "active", "en": "active", "ar": "نشطة"},
    "en attente d’envoi": {"fr": "en attente d’envoi", "en": "awaiting send", "ar": "في انتظار الإرسال"},
    "ventes": {"fr": "ventes", "en": "sales", "ar": "مبيعات"},
    "vente(s)": {"fr": "vente(s)", "en": "sale(s)", "ar": "مبيعات"},
    "j actif": {"fr": "j actif", "en": "active days", "ar": "أيام نشطة"},
    "sur 7": {"fr": "sur 7", "en": "out of 7", "ar": "من 7"},
    "ouvert(s) sur kiwi-os.com/tickets": {"fr": "ouvert(s) sur kiwi-os.com/tickets", "en": "open on kiwi-os.com/tickets", "ar": "مفتوحة على kiwi-os.com/tickets"},
    "fichier inconnu": {"fr": "fichier inconnu", "en": "unknown file", "ar": "ملف مجهول"},
    "occurrence(s) ·": {"fr": "occurrence(s) ·", "en": "occurrence(s) ·", "ar": "حالات ·"},
    "· travail": {"fr": "· travail", "en": "· job", "ar": "· المهمة"},
    "· caisse": {"fr": "· caisse", "en": "· till", "ar": "· الصندوق"},
    "vente(s) absente(s) du serveur.": {"fr": "vente(s) absente(s) du serveur.", "en": "sale(s) missing from the server.", "ar": "مبيعات غائبة عن الخادم."},
    "h sur": {"fr": "h sur", "en": "h on", "ar": "ساعة على"},
    "la caisse": {"fr": "la caisse", "en": "the till", "ar": "الصندوق"},
    "l’appareil": {"fr": "l’appareil", "en": "the device", "ar": "الجهاز"},
    "(page ouverte depuis": {"fr": "(page ouverte depuis", "en": "(page open since", "ar": "(الصفحة مفتوحة منذ"},
    "mouvement(s) de stock en attente depuis": {"fr": "mouvement(s) de stock en attente depuis", "en": "stock movement(s) pending since", "ar": "حركات مخزون معلقة منذ"},
    "sur": {"fr": "sur", "en": "on", "ar": "على"},
    "· dernier :": {"fr": "· dernier :", "en": "· last:", "ar": "· الأخير:"},
    "fois d’enregistrer «": {"fr": "fois d’enregistrer «", "en": "times to save “", "ar": "مرات حفظ «"},
    "· fermée": {"fr": "· fermée", "en": "· closed", "ar": "· أغلقت"},
    "par": {"fr": "par", "en": "by", "ar": "بواسطة"},
    "le": {"fr": "le", "en": "on", "ar": "في"},
    "· ticket": {"fr": "· ticket", "en": "· receipt", "ar": "· الوصل"},
    "normal(s)": {"fr": "normal(s)", "en": "normal", "ar": "عادي"},
    "commerce": {"fr": "commerce", "en": "store", "ar": "متجر"},
    "n.d.": {"fr": "n.d.", "en": "n/a", "ar": "غير متاح"},
    "jamais": {"fr": "jamais", "en": "never", "ar": "أبدا"},
    "à l’instant": {"fr": "à l’instant", "en": "just now", "ar": "الآن"},
    "· actualisation automatique hors saisie": {"fr": "· actualisation automatique hors saisie", "en": "· refreshes automatically when not editing", "ar": "· تحديث آلي خارج الإدخال"},
    "Établissement suspendu": {"fr": "Établissement suspendu", "en": "Store suspended", "ar": "المؤسسة موقوفة"},
    "Vérifier les prérequis avant d’ouvrir les opérations.": {"fr": "Vérifier les prérequis avant d’ouvrir les opérations.", "en": "Check prerequisites before opening operations.", "ar": "تحقق من المتطلبات قبل فتح العمليات."},
    "Décider de la suite et consigner le suivi.": {"fr": "Décider de la suite et consigner le suivi.", "en": "Decide next steps and record the follow-up.", "ar": "قرر الخطوات القادمة وسجل المتابعة."},
    "Conditions commerciales à compléter": {"fr": "Conditions commerciales à compléter", "en": "Commercial terms to complete", "ar": "شروط تجارية للإكمال"},
    "L’accès est ouvert. Aucun tarif n’est enregistré.": {"fr": "L’accès est ouvert. Aucun tarif n’est enregistré.", "en": "Access is open. No price is recorded.", "ar": "الدخول متاح. لا سعر مسجل."},
    "Vérifier le renouvellement. Ce signal ne prouve pas un impayé.": {"fr": "Vérifier le renouvellement. Ce signal ne prouve pas un impayé.", "en": "Check renewal. This signal does not prove non-payment.", "ar": "تحقق من التجديد. لا تثبت هذه الإشارة عدم الدفع."},
    "Échéance dans {n} j": {"fr": "Échéance dans {n} j", "en": "Due in {n} days", "ar": "الأجل خلال {n} أيام"},
    "Préparer le point commercial et la prochaine étape.": {"fr": "Préparer le point commercial et la prochaine étape.", "en": "Prepare the commercial review and next step.", "ar": "حضر اللقاء التجاري والخطوة القادمة."},
    "Activité à vérifier": {"fr": "Activité à vérifier", "en": "Activity to check", "ar": "نشاط للتحقق"},
    "Aucune vente reçue depuis plus de 7 jours. Vérifier fermeture et synchronisation.": {"fr": "Aucune vente reçue depuis plus de 7 jours. Vérifier fermeture et synchronisation.", "en": "No sales received for over 7 days. Check closure and sync.", "ar": "لا مبيعات مستلمة منذ أكثر من 7 أيام. تحقق من الإغلاق والمزامنة."},
    "Premier usage à accompagner": {"fr": "Premier usage à accompagner", "en": "First use to support", "ar": "استخدام أول للمواكبة"},
    "Aucune vente reçue. Vérifier le parcours adapté au métier.": {"fr": "Aucune vente reçue. Vérifier le parcours adapté au métier.", "en": "No sales received. Check the trade-specific workflow.", "ar": "لا مبيعات مستلمة. تحقق من المسار المناسب للنشاط."},
    "Localisation à renseigner": {"fr": "Localisation à renseigner", "en": "Location to complete", "ar": "موقع للإكمال"},
    "Compléter la ville dans la fiche commerciale.": {"fr": "Compléter la ville dans la fiche commerciale.", "en": "Complete the city in commercial terms.", "ar": "أكمل المدينة في البيانات التجارية."},
    "Confirmer le contact et les conditions": {"fr": "Confirmer le contact et les conditions", "en": "Confirm contact and terms", "ar": "تأكيد جهة الاتصال والشروط"},
    "Contact de suivi, offre ou essai et prochain rendez-vous confirmés.": {"fr": "Contact de suivi, offre ou essai et prochain rendez-vous confirmés.", "en": "Follow-up contact, offer or trial and next appointment confirmed.", "ar": "تأكيد جهة المتابعة والعرض أو التجربة والموعد القادم."},
    "Préparer le catalogue": {"fr": "Préparer le catalogue", "en": "Prepare the catalogue", "ar": "تحضير الكتالوج"},
    "Articles, prix et catégories relus avec le commerçant.": {"fr": "Articles, prix et catégories relus avec le commerçant.", "en": "Items, prices and categories reviewed with the merchant.", "ar": "مراجعة المواد والأسعار والفئات مع التاجر."},
    "Vérifier les accès et appareils": {"fr": "Vérifier les accès et appareils", "en": "Check access and devices", "ar": "التحقق من الدخول والأجهزة"},
    "Chaque personne utilise le rôle prévu et le bon établissement.": {"fr": "Chaque personne utilise le rôle prévu et le bon établissement.", "en": "Everyone uses the intended role and correct store.", "ar": "يستخدم كل شخص الدور المخصص والمؤسسة الصحيحة."},
    "Valider le matériel sur place": {"fr": "Valider le matériel sur place", "en": "Validate hardware on site", "ar": "تأكيد المعدات في الموقع"},
    "Impression et équipements requis testés, résultat confirmé par le commerçant.": {"fr": "Impression et équipements requis testés, résultat confirmé par le commerçant.", "en": "Printing and required equipment tested, outcome confirmed by the merchant.", "ar": "اختبار الطباعة والمعدات المطلوبة وتأكيد النتيجة من التاجر."},
    "Réservation, arrivée, note client et règlement vérifiés.": {"fr": "Réservation, arrivée, note client et règlement vérifiés.", "en": "Booking, arrival, guest bill and payment checked.", "ar": "التحقق من الحجز والوصول وحساب الضيف والدفع."},
    "Dépôt, étiquettes, atelier et retrait vérifiés.": {"fr": "Dépôt, étiquettes, atelier et retrait vérifiés.", "en": "Drop-off, labels, workshop and collection checked.", "ar": "التحقق من الإيداع والملصقات والورشة والاستلام."},
    "Commande, cuisine, service, règlement et rapport vérifiés.": {"fr": "Commande, cuisine, service, règlement et rapport vérifiés.", "en": "Order, kitchen, service, payment and report checked.", "ar": "التحقق من الطلب والمطبخ والخدمة والدفع والتقرير."},
    "Vente, reçu, stock et rapport vérifiés.": {"fr": "Vente, reçu, stock et rapport vérifiés.", "en": "Sale, receipt, stock and report checked.", "ar": "التحقق من البيع والوصل والمخزون والتقرير."},
    "Vérifier un parcours complet": {"fr": "Vérifier un parcours complet", "en": "Check a complete workflow", "ar": "التحقق من مسار كامل"},
    "Former et transmettre": {"fr": "Former et transmettre", "en": "Train and hand over", "ar": "التدريب والتسليم"},
    "Équipe formée, guide partagé et prochaine vérification planifiée.": {"fr": "Équipe formée, guide partagé et prochaine vérification planifiée.", "en": "Team trained, guide shared and next check scheduled.", "ar": "تدريب الفريق ومشاركة الدليل وتحديد التحقق القادم."},
    "{n} vente(s) refusée(s) par le serveur, bloquée(s) en caisse": {"fr": "{n} vente(s) refusée(s) par le serveur, bloquée(s) en caisse", "en": "{n} sale(s) refused by server, blocked at till", "ar": "{n} مبيعات رفضها الخادم ومحظورة في الصندوق"},
    "{n} vente(s) non confirmée(s) depuis {time}": {"fr": "{n} vente(s) non confirmée(s) depuis {time}", "en": "{n} sale(s) unconfirmed for {time}", "ar": "{n} مبيعات غير مؤكدة منذ {time}"},
    "Z du {day} : écart {amount} MAD{missing}{blocked}": {"fr": "Z du {day} : écart {amount} MAD{missing}{blocked}", "en": "Z for {day}: difference {amount} MAD{missing}{blocked}", "ar": "Z ليوم {day}: فرق {amount} درهم{missing}{blocked}"},
    "{n} vente(s) reçue(s) deux fois avec des montants différents": {"fr": "{n} vente(s) reçue(s) deux fois avec des montants différents", "en": "{n} sale(s) received twice with different amounts", "ar": "{n} مبيعات مستلمة مرتين بمبالغ مختلفة"},
    "Aucune vente reçue depuis {time}, alors qu’il vend {n} jours sur 7": {"fr": "Aucune vente reçue depuis {time}, alors qu’il vend {n} jours sur 7", "en": "No sale received for {time}, despite selling on {n} of 7 days", "ar": "لا بيع مستلم منذ {time} مع البيع في {n} من 7 أيام"},
    "Aucune caisse n’a donné signe de vie depuis 24 h": {"fr": "Aucune caisse n’a donné signe de vie depuis 24 h", "en": "No till reported in 24 h", "ar": "لم يظهر أي صندوق منذ 24 ساعة"},
    "{n} erreur(s) applicative(s) sur 7 jours": {"fr": "{n} erreur(s) applicative(s) sur 7 jours", "en": "{n} application error(s) in 7 days", "ar": "{n} أخطاء تطبيق خلال 7 أيام"}
  };
  function language(){
    var selected=window.KiwiAdminI18n&&window.KiwiAdminI18n.lang;
    if(!selected){try{selected=new URLSearchParams(location.search).get('lang');selected=selected||localStorage.getItem('kiwiLang');}catch(_){} }
    return ['fr','en','ar'].includes(selected)?selected:'fr';
  }
  function locale(){return {fr:'fr-FR',en:'en-GB',ar:'ar-MA'}[language()];}
  function text(value){var key=value.trim(), row=copy[key];return row?value.replace(key,row[language()]):value;}
  function L(value){
    if(language()==='fr')return value;
    if(copy[value.trim()])return text(value);
    return value.replace(/(^|>)([^<>]+)(?=<|$)|((?:aria-label|placeholder|data-label)=")([^"]*)/g,function(all,tag,body,attr,label){return body!==undefined?tag+text(body):attr+text(label);});
  }
  var labels={active:L('Accès ouvert'),pending:L('Accès en attente'),suspended:L('Suspendu'),trial:L('Essai'),expired:L('Échu'),scheduled:L('À venir'),unpriced:L('Sans tarif'),open:L('À faire'),in_progress:L('En cours'),snoozed:L('Reporté'),resolved:L('Résolu')};
  var sources={quarantine:L('Opérations à valider par le propriétaire'),bridges:L('Relais d’impression'),print:L('Travaux d’impression · 24 h'),errors:L('Erreurs applicatives · 7 j'),support:L('Support'),integrations:L('Commandes connectées'),caisseSync:L('Synchronisation financière des caisses'),shopify:L('Synchronisation Shopify'),shopifyLink:L('Connexion Shopify'),receivables:L('Livraisons à encaisser · plus de 3 j'),unpaidTables:L('Tables fermées sans encaissement · 14 j'),zChecks:L('Rapprochements Z · 14 j'),conflicts:L('Conflits de vente · 14 j'),tenantGuard:L('Copies entre établissements refusées · 14 j'),discountPolicy:L('Remises hors réglage · 14 j'),saleFlags:L('Ventes signalées par le serveur · 14 j'),activity:L('Activité ventes · 7 j'),board:L('Tickets produit'),tasks:L('Suivis'),notes:L('Notes'),events:L('Historique des suivis')};
  var tabs={summary:L('Synthèse'),tasks:L('Suivis'),onboarding:L('Mise en route'),diagnostics:L('Diagnostic'),commercial:L('Commercial'),configuration:L('Configuration'),sales:L('Ventes'),account:L('Compte'),history:L('Historique')};
  var routes={today:[L('Votre journée, en contexte'),L('Aujourd’hui'),L('Les problèmes à vérifier, les clients à accompagner et les prochaines étapes.')],clients:[L('Votre portefeuille'),L('Établissements'),L('Un dossier par établissement, relié à son compte propriétaire.')],fleet:[L('Qualité de service'),L('Diagnostic du parc'),L('Des observations datées, sans confondre un relais connecté avec une impression réussie.')],revenue:[L('Pilotage commercial'),L('Revenus & échéances'),L('MRR configuré, échéances et ventes commerçants : trois faits distincts.')],onboarding:[L('Accompagnement'),L('Mises en route'),L('Des étapes adaptées au métier, validées avec une preuve ou un résultat.')],operators:[L('Équipe Kiwi'),L('Accès équipe'),L('Comptes opérateurs nommés et responsabilités.')]};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function date(ts){return ts?new Date(Number(ts)).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):L('Non observé');}
  function money(n){return Number(n||0).toLocaleString(locale(),{maximumFractionDigits:2});}
  function client(m){return state.clients.find(function(c){return c.merchant===m;});}
  function name(m){var c=client(m);return c&&(c.business||c.owner_business)||m;}
  function rows(k,m){var s=state.data&&state.data.sources[k];return (s&&s.available?s.rows:[]).filter(function(x){return !m||x.merchant===m;});}
  function available(k){return !!(state.data&&state.data.sources[k]&&state.data.sources[k].available);}
  function chip(text,kind){return '<span class="op-chip '+(kind||'')+'">'+esc(text)+'</span>';}
  function button(text,action,value,kind){return '<button class="op-btn '+(kind||'')+'" data-op="'+action+'" data-value="'+esc(value||'')+'">'+esc(text)+'</button>';}
  function link(m,tab){return '<button class="op-merchant-link" data-op="merchant" data-value="'+esc(m)+'" data-tab="'+(tab||'summary')+'">'+esc(name(m))+'</button>';}
  function empty(title,text){return '<div class="op-empty"><strong>'+esc(title)+'</strong>'+esc(text||'')+'</div>';}
  function card(title,body,subtitle){return '<section class="op-card"><div class="op-card-head"><div><h3>'+esc(title)+'</h3>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div></div>'+body+'</section>';}
  function notice(){
    if(state.live===false)return L('<div class="op-notice">Démonstration locale · les dossiers sont fictifs. Les nouveaux suivis et notes nécessitent le service authentifié ; aucune écriture réelle n’est simulée.</div>');
    if(!state.data){
      if(state.loading)return L('<div class="op-notice">Chargement des sources opérationnelles…</div>');
      var failure=state.loadError||{};
      return L('<div class="op-notice">Lecture opérationnelle indisponible')+(failure.code?' · '+esc(failure.code):'')+L('. Aucun zéro n’est déduit de cet échec. ')+esc(failure.action||L('Réessayez ; si le problème persiste, vérifiez l’authentification, le déploiement et le réseau.'))+'</div>';
    }
    var missing=Object.keys(sources).filter(function(k){return !available(k)&&!(k==='board'&&state.data.merchant);}), limited=Object.keys(sources).filter(function(k){return state.data.sources[k]&&state.data.sources[k].truncated;}), failures=missing.map(function(k){return {name:sources[k],failure:state.data.sources[k]&&state.data.sources[k].failure};});
    return (missing.length?L('<div class="op-notice">Sources indisponibles : ')+esc(missing.map(function(k){return sources[k];}).join(', '))+L('. Un résultat absent n’est pas un résultat sain.')+(failures.some(function(x){return x.failure;})?L(' Causes à vérifier : ')+esc(failures.filter(function(x){return x.failure;}).map(function(x){return x.name+' · '+(x.failure.action||x.failure.code);}).join(' ')):'')+'</div>':'')+(limited.length?L('<div class="op-notice">Vue partielle : ')+esc(limited.map(function(k){return sources[k];}).join(', '))+L('. Ouvrez un dossier pour réduire le périmètre ; les compteurs ci-dessous concernent les lignes chargées.</div>'):'');
  }
  function toast(s){var old=document.querySelector('.op-toast');if(old)old.remove();var el=document.createElement('div');el.className='op-toast';el.setAttribute('role','status');el.textContent=s;document.body.appendChild(el);setTimeout(function(){el.remove();},5000);}
  async function request(path,opts){
    if(state.live!==true)throw new Error(L('Service authentifié requis.'));
    try{return await bridge.api(path,opts);}catch(e){var code=e.body&&e.body.error,err=new Error(code==='version-conflict'?L('Ce suivi a changé. Fermez puis rouvrez-le pour charger sa nouvelle version.'):code==='outcome-required'?L('Un résultat est requis pour clôturer.'):code==='assignee-not-found'?L('Cet opérateur n’est plus disponible.'):code==='task-storage-unavailable'||code==='notes-storage-unavailable'?L('Stockage indisponible. Rien n’est confirmé ; vous pouvez réessayer.'):code||L('Service indisponible.'));err.code=code||'request-failed';err.status=e.status||0;throw err;}
  }
  function day(d){var p=String(d||'').split('-');return p.length===3?new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).toLocaleDateString(locale(),{day:'numeric',month:'short',timeZone:'UTC'}):String(d||'');}
  function ago(ts){if(language()==='fr')return P.ago(ts,Date.now());if(!ts)return L('jamais');var m=Math.max(0,Math.round((Date.now()-ts)/60000));return new Intl.RelativeTimeFormat(locale(),{numeric:'auto'}).format(m<60?-m:m<2880?-Math.round(m/60):-Math.round(m/1440),m<60?'minute':m<2880?'hour':'day');}
  function policyText(value){
    if(language()==='fr'||typeof value!=='string')return value;
    if(copy[value])return text(value);
    for(var key in copy){
      if(!key.includes('{'))continue;
      var names=[], pattern=key.split(/(\{\w+\})/).map(function(part){if(/^\{/.test(part)){names.push(part);return '(.*?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');
      var match=value.match(new RegExp('^'+pattern+'$'));
      if(match)return copy[key][language()].replace(/\{\w+\}/g,function(name){var part=match[names.indexOf(name)+1];return name==='{time}'?part.replace(/(\d+) (min|h|j)/g,function(_,n,u){return n+' '+({en:{min:'min',h:'h',j:'days'},ar:{min:'دقيقة',h:'ساعة',j:'أيام'}}[language()][u]);}):part;});
    }
    return value;
  }
  function localSignal(s){return Object.assign({},s,{title:policyText(s.title),detail:policyText(s.detail)});}
  function onboardingSteps(type){return P.onboarding(type).map(localSignal);}
  function healthOf(c){var h=P.storeHealth(c,{caisseSync:rows('caisseSync',c.merchant),zChecks:rows('zChecks',c.merchant),conflicts:rows('conflicts',c.merchant),activity:rows('activity',c.merchant),errors:rows('errors',c.merchant)},Date.now());h.problems=h.problems.map(function(problem){if(language()!=='fr'&&h.z&&problem.startsWith('Z du '))return L('Z du ')+day(h.z.business_day)+L(' · écart ')+money((Number(h.z.reported_cents)-Number(h.z.server_cents))/100)+' MAD'+(h.z.missing_count?' · '+h.z.missing_count+' '+L('vente(s) absente(s) du serveur.'):'')+(h.z.blocked_count?' · '+h.z.blocked_count+' '+L('bloquée(s)'):'');return policyText(problem);});h.watch=h.watch.map(policyText);return h;}
  function storeHealth(){
    var order={bad:0,warn:1,good:2,idle:3}, verdict={bad:L('À traiter'),warn:L('À surveiller'),good:L('Normal'),idle:L('Inactif')};
    var list=state.clients.filter(function(c){return !c.demo&&P.access(c)!=='suspended';}).map(healthOf).sort(function(a,b){return order[a.level]-order[b.level]||(b.client.today_amount||0)-(a.client.today_amount||0);});
    if(!list.length)return card(L('État des établissements'),empty(L('Aucun établissement actif'),''));
    var counts=list.reduce(function(o,h){o[h.level]=(o[h.level]||0)+1;return o;},{});
    var sub=(counts.bad?counts.bad+L(' à traiter · '):'')+(counts.warn?counts.warn+L(' à surveiller · '):'')+(counts.good||0)+L(' normal')+(language()==='fr'&&(counts.good||0)>1?'s':'')+(counts.idle?' · '+counts.idle+L(' inactif')+(language()==='fr'&&counts.idle>1?'s':''):'');
    var body=L('<div class="op-table-wrap" tabindex="0" role="region" aria-label="État des établissements"><table class="op-table op-health-table"><thead><tr><th>Établissement</th><th>État</th><th class="num">Aujourd’hui</th><th>Dernière vente</th><th>Caisses</th><th>Dernier Z</th></tr></thead><tbody>')+list.map(function(h){
      var c=h.client, notes=h.problems.concat(h.watch);
      var tillCell=!h.tills?L('<span class="op-muted">Aucune caisse suivie</span>'):h.live+' / '+h.tills+L(' active')+(language()==='fr'&&h.live>1?'s':'')+' · 24 h'+(h.blocked?'<small class="op-bad">'+h.blocked+L(' bloquée(s)</small>'):h.pending?'<small>'+h.pending+L(' en attente d’envoi</small>'):L('<small>Tout confirmé</small>'));
      var zCell=!h.z?L('<span class="op-muted">Aucun</span>'):h.z.status==='matched'?esc(day(h.z.business_day))+L('<small>Concorde · ')+esc(h.z.reported_count)+L(' ventes</small>'):'<span class="op-bad">'+esc(day(h.z.business_day))+L('</span><small>Écart ')+money((h.z.reported_cents-h.z.server_cents)/100)+' MAD</small>';
      return '<tr class="lvl-'+h.level+'"><td>'+link(c.merchant,h.level==='good'||h.level==='idle'?'summary':'diagnostics')+'<small>'+esc(c.type||'')+(c.city?' · '+esc(c.city):'')+'</small>'+(notes.length?'<ul class="op-health-notes">'+notes.map(function(n,i){return '<li class="'+(i<h.problems.length?'bad':'warn')+'">'+esc(n)+'</li>';}).join('')+'</ul>':'')+L('</td><td data-label="État">')+chip(verdict[h.level],h.level==='idle'?'':h.level)+L('</td><td class="num" data-label="Aujourd’hui">')+money(c.today_amount)+' MAD<small>'+esc(c.today_count||0)+L(' vente(s)</small></td><td data-label="Dernière vente">')+esc(ago(h.last))+'<small>'+(h.days?h.days+L(' j actif')+(language()==='fr'&&h.days>1?'s':'')+L(' sur 7'):L('Aucune vente sur 7 j'))+L('</small></td><td data-label="Caisses">')+tillCell+L('</td><td data-label="Dernier Z">')+zCell+'</td></tr>';
    }).join('')+'</tbody></table></div>';
    return card(L('État des établissements'),body,sub+L(' · caisses, Z et ventes reçues. Une caisse connectée ne prouve pas que ses ventes sont enregistrées : seuls le Z et les ventes confirmées le prouvent.'));
  }
  function boardCard(){
    if(!available('board'))return '';
    var list=rows('board');
    return card(L('Tickets produit'),list.length?'<div class="op-card-body op-board">'+list.map(function(t){return '<a class="op-board-item" href="/tickets" target="_blank" rel="noopener"><span class="op-board-id">#'+String(t.id).padStart(4,'0')+'</span><span>'+esc(t.summary)+'</span><span class="op-board-meta">'+(t.money_at_risk?chip(L('Argent en jeu'),'bad'):'')+chip(t.status==='testing'?L('En test'):t.kind==='improvement'?L('Amélioration'):L('Problème'),t.status==='testing'?'good':'')+'</span></a>';}).join('')+'</div>':empty(L('Aucun ticket ouvert'),''),list.length+L(' ouvert(s) sur kiwi-os.com/tickets'));
  }
  function allSignals(){
    var list=P.signals(state.clients,Date.now()).map(localSignal);
    function add(k,r,title,detail,priority,tab){if(!client(r.merchant)||client(r.merchant).demo)return;list.push({id:r.merchant+':'+k+':'+r.id,merchant:r.merchant,signal_key:k+':'+r.id,title:title,detail:detail,priority:priority,tab:tab||'diagnostics',source_ts:r.updated_ts||r.last_seen_ts||r.created_ts||0});}
    state.clients.filter(function(c){return !c.demo;}).forEach(function(c){var reports=rows('caisseSync',c.merchant).filter(function(r){return r.app==='caisse';}), uncertain=!reports.length||reports.some(function(r){return !r.updated_ts||Date.now()-r.updated_ts>24*3600000||!r.sync||!r.stock;});if(uncertain)add('unobserved',{id:'queues',merchant:c.merchant},L('Queues non observées'),L('Rapport de caisse absent, ancien ou incomplet. La santé actuelle des files de ventes et de stock reste inconnue. Reconnecter les appareils et vérifier leurs files.'),2);});
    rows('print').filter(function(r){return ['failed','expired'].includes(r.status);}).forEach(function(r){add('print',r,L('Impression à vérifier'),L('Le relais rapporte « ')+r.status+' » · '+date(r.created_ts)+L(' · travail ')+String(r.id).slice(-8)+L('. Vérifier le ticket avant toute réimpression.'),1);});
    rows('errors').forEach(function(r){add('error',r,L('Erreur applicative reçue'),(r.message?r.message+' · ':'')+(r.count||1)+L(' occurrence(s) · ')+(r.file||L('fichier inconnu'))+' · '+date(r.last_seen_ts),2);});
    rows('zChecks').filter(function(r){return r.status!=='matched';}).forEach(function(r){add('zgap',Object.assign({id:r.business_day+':'+r.terminal_id},r),L('Écart entre le Z et le serveur'),L('Z du ')+day(r.business_day)+L(' · caisse ')+String(r.terminal_id).slice(0,32)+L(' · écart ')+money((r.reported_cents-r.server_cents)/100)+L(' MAD · ')+r.missing_count+L(' vente(s) absente(s) du serveur.'),1);});
    rows('quarantine').forEach(function(r){add('quarantine',r,L('Opération à valider par le propriétaire'),(r.kind==='refund'?L('Remboursement'):L('Vente'))+' · '+money(r.amount_cents/100)+L(' MAD · ')+date(r.ts)+' · '+String(r.method||'')+' · '+String(r.reason||'')+(r.last_error?' · '+r.last_error:'')+L('. Conservée sur le serveur, décision requise dans le tableau de bord du propriétaire.'),1);});
    var tillSeen=new Set();rows('caisseSync').forEach(function(r){var key=r.merchant+':'+r.deviceId;if(r.app!=='caisse'||!r.deviceId||tillSeen.has(key))return;tillSeen.add(key);var s=r.sync;if(!s||!s.blocked||Date.now()-r.updated_ts>24*3600000)return;var e=(s.blockedEntries||[])[0];add('blocked',{id:r.deviceId+':'+(e?e.id:s.blocked),merchant:r.merchant,updated_ts:r.updated_ts},L('Vente bloquée en caisse'),s.blocked+L(' vente(s) refusée(s) par le serveur sur ')+r.deviceId+(e?' · '+money(e.amountCents/100)+L(' MAD · motif « ')+e.reason+' »':'')+L('. Elle(s) n’apparaîtront pas au tableau de bord tant qu’elles ne sont pas refaites ou débloquées.'),1);});
    /* La file de stock d'une caisse : refus du serveur, file qui n'avance plus, stockage plein. */
    /* Une mise à jour trouvée par la caisse, annoncée, et jamais prise : la caisse tourne l'ancien code. */
    var verSeen=new Set();rows('caisseSync').forEach(function(r){var key=r.merchant+':'+r.deviceId;if(!r.deviceId||verSeen.has(key))return;verSeen.add(key);var now=state.data.now||Date.now();if(!r.updateReadyAt||now-r.updated_ts>3600000||now-r.updateReadyAt<6*3600000)return;add('stale-build',{id:r.deviceId,merchant:r.merchant,updated_ts:r.updated_ts},L('Caisse sur une ancienne version'),L('Une mise à jour attend depuis ')+Math.floor((now-r.updateReadyAt)/3600000)+L(' h sur ')+(r.app==='caisse'?L('la caisse '):L('l’appareil '))+r.deviceId+(r.loadedAt?L(' (page ouverte depuis ')+date(r.loadedAt)+')':'')+L('. Les correctifs publiés depuis n’y tournent pas. Demander à l’équipe d’appuyer sur « Rafraîchir » (en bas de l’écran) entre deux clients.'),2);});
    var stockSeen=new Set();rows('caisseSync').forEach(function(r){var key=r.merchant+':'+r.deviceId;if(r.app!=='caisse'||!r.deviceId||stockSeen.has(key))return;stockSeen.add(key);var k=r.stock;if(!k||Date.now()-r.updated_ts>24*3600000)return;var stale=k.pending>0&&k.oldestPendingAt&&Date.now()-k.oldestPendingAt>2*3600000;if(!k.refused&&!stale&&!k.storageError)return;var e=(k.refusedEntries||[])[k.refusedEntries&&k.refusedEntries.length?k.refusedEntries.length-1:0];add('stockq',{id:r.deviceId,merchant:r.merchant,updated_ts:r.updated_ts},L('Stock bloqué en caisse'),(k.storageError?L('Stockage du navigateur plein sur ')+r.deviceId+'. ':'')+(stale?k.pending+L(' mouvement(s) de stock en attente depuis ')+date(k.oldestPendingAt)+L(' sur ')+r.deviceId+(k.lastStatus?L(' · dernier refus HTTP ')+k.lastStatus:'')+(k.lastError?' « '+k.lastError+' »':'')+'. ':'')+(k.refused?k.refused+L(' mouvement(s) refusé(s) par le serveur')+(e?L(' · dernier : ')+e.reason+' « '+e.why+' »':'')+'. ':'')+L('Les ventes continuent ; le stock du tableau de bord ne les voit pas.'),1);});
    rows('conflicts').forEach(function(r){add('conflict',Object.assign({},r,{updated_ts:r.updated_ts}),L('Vente en conflit'),L('La vente ')+String(r.id).slice(-8)+L(' a été reçue deux fois avec des montants différents (')+money(r.amount_cents/100)+L(' MAD · ')+r.method+').',1);});
    rows('tenantGuard').forEach(function(r){var from=client(r.source_merchant);add('foreign',Object.assign({id:r.feature+':'+r.source_merchant},r),L('Données d’un autre établissement refusées'),L('Un appareil de ce client a tenté ')+r.attempts+L(' fois d’enregistrer « ')+r.feature+L(' » avec les données de ')+(from?from.name:r.source_merchant)+L(' · dernière tentative ')+date(r.updated_ts)+L('. Le serveur a refusé ; recharger ou réappairer ses appareils, et vérifier quel onglet ou quelle caisse a changé de client.'),1);});
    rows('discountPolicy').forEach(function(r){add('discount',r,L('Remise hors réglage encaissée'),L('Ticket ')+(r.ref||String(r.id).slice(-8))+' · '+money(r.amount_cents/100)+L(' MAD · ')+r.note+' · '+date(r.sale_ts)+L('. La vente est comptée ; vérifier qui a appliqué la remise et recharger la caisse concernée.'),2);});
    rows('saleFlags').forEach(function(r){add('saleflag',r,r.action==='clock-flag'?L('Horloge de la caisse décalée'):L('Montant encaissé en désaccord avec son panier'),L('Ticket ')+(r.ref||String(r.id).slice(-8))+' · '+money(r.amount_cents/100)+L(' MAD · ')+r.note+' · '+date(r.sale_ts)+L('. La vente est comptée ; vérifier la caisse concernée (panier, heure de l’appareil).'),2);});
    rows('unpaidTables').forEach(function(r){add('unpaid-table',r,L('Table fermée sans encaissement'),L('Table ')+(r.table_no||'?')+' · '+money(Number(r.unpaid_mad)||0)+L(' MAD de commandes jamais encaissées (')+(Number(r.orders)||0)+L(') · fermée')+(r.closed_actor_name?L(' par ')+r.closed_actor_name:'')+L(' le ')+date(r.updated_ts)+L('. Demander au gérant si l’addition a été payée hors caisse ; sinon l’encaisser.'),2);});
    rows('receivables').forEach(function(r){add('receivable',r,L('Livraison non encaissée'),money(r.remaining_cents/100)+L(' MAD à encaisser · ticket ')+(r.ticket_ref||r.id)+' · '+Math.floor(((state.data.now||Date.now())-r.created_ts)/86400000)+L(' jours. Demander au client si le livreur a rapporté l’argent ; l’encaisser dans Acomptes ou Créances.'),2);});
    rows('shopifyLink').forEach(function(r){add('shopifyLink',r,L('Shopify signale une erreur'),r.last_error+L(' · dernière observation ')+date(r.updated_ts)+L('. Ouvrir le panneau Shopify du client. Une « boutique inattendue » sur un domaine myshopify est acceptée depuis le 21 octobre ; une signature invalide demande de reconnecter.'),1);});
    rows('support').forEach(function(r){add('support',r,r.reference+' · '+r.summary,L('Support · ')+r.status,r.priority==='urgent'?1:2,'summary');});
    rows('integrations').concat(rows('shopify')).filter(function(r){return /fail|blocked|dead|conflict/.test(r.status);}).forEach(function(r){add('integration',r,L('Synchronisation à examiner'),r.status+' · '+(r.domain||L('Shopify'))+' · '+date(r.updated_ts),2);});
    return list;
  }
  function queue(m,filter){
    var tasks=rows('tasks',m), signals=allSignals().filter(function(s){return !m||s.merchant===m;}), merged=tasks.slice();
    signals.forEach(function(s){var t=tasks.find(function(t){return t.merchant===s.merchant&&t.signal_key===s.signal_key;});if(!t)merged.push(s);else if(t.status==='resolved'&&s.source_ts>t.updated_ts)merged.push(Object.assign({},s,{id:s.id+':new',title:L('Nouvelle occurrence · ')+s.title,tracked:t}));});
    return merged.filter(function(t){if(filter==='resolved')return t.status==='resolved';if(filter==='snoozed')return t.status==='snoozed'&&t.snoozed_until>Date.now();if(t.status==='resolved'||t.status==='snoozed'&&t.snoozed_until>Date.now())return false;if(filter==='incidents')return /^(print|error|integration|support):/.test(t.signal_key||'');if(filter==='mine')return t.assignee&&state.data&&t.assignee===state.data.actor.id;if(filter==='unassigned')return !t.assignee;if(filter==='due')return t.due_ts&&t.due_ts<Date.now();return true;}).sort(function(a,b){return a.priority-b.priority||(a.due_ts||Infinity)-(b.due_ts||Infinity)||a.merchant.localeCompare(b.merchant);});
  }
  function taskRows(m){var q=queue(m,state.filter);return '<div class="op-tabs">'+[['all',L('À faire')],['incidents',L('Incidents')],['mine',L('Mes suivis')],['due',L('En retard')],['unassigned',L('Sans responsable')],['snoozed',L('Reportés')],['resolved',L('Résolus')]].map(function(f){return '<button data-op="filter" data-value="'+f[0]+'" aria-pressed="'+(state.filter===f[0])+'">'+f[1]+'</button>';}).join('')+'</div><div class="op-queue">'+(q.length?q.map(function(t,i){var tid='op-task-'+(m?'dossier':'day')+'-'+i,owner=state.operators.find(function(o){return o.id===t.assignee;});return '<article class="op-task"><span class="op-priority p'+t.priority+L('" role="img" aria-label="Priorité ')+t.priority+'"></span><div><h4 class="op-task-title" id="'+tid+'">'+esc(t.title)+'</h4>'+link(t.merchant,t.tab)+'<p>'+esc(t.detail)+'</p><div class="op-task-meta">'+chip(t.status?labels[t.status]:L('Signal à qualifier'),t.priority===1?'bad':'')+'<span>'+esc(owner?owner.label:t.assignee||L('Sans responsable'))+'</span>'+(t.due_ts?L('<span>Échéance : ')+date(t.due_ts)+'</span>':'')+(t.outcome?L('<span>Résultat : ')+esc(t.outcome)+'</span>':'')+'</div></div><div class="op-task-actions">'+button(t.version||t.tracked?L('Mettre à jour'):L('Suivre'),'task',t.id).replace('<button ','<button aria-describedby="'+tid+'" ')+(t.tab?'<button class="op-btn quiet" data-op="merchant" data-value="'+esc(t.merchant)+'" data-tab="'+t.tab+'" aria-describedby="'+tid+L('">Examiner</button>'):'')+'</div></article>';}).join(''):empty(L('Rien dans cette vue'),L('Les sources indisponibles ne sont pas comptées comme résolues.')))+'</div>';}
  function stats(items){return '<div class="op-stats">'+items.map(function(i){return '<div class="op-stat"><div class="op-stat-label">'+esc(i[0])+'</div><div class="op-stat-value">'+esc(i[1])+'</div><div class="op-stat-detail">'+esc(i[2])+'</div></div>';}).join('')+'</div>';}
  function healthSummary(){return '<div class="op-card-body op-health-list">'+Object.keys(sources).filter(function(k){return k!=='board'||!(state.data&&state.data.merchant);}).map(function(k){return '<div class="op-health-line"><span>'+sources[k]+'</span><b class="'+(!available(k)?'unknown':'')+'">'+(available(k)?rows(k).length+(state.data.sources[k].truncated?'+':''):L('Indisponible'))+'</b></div>';}).join('')+'</div>';}
  function today(){var real=state.clients.filter(function(c){return !c.demo;}), q=queue('', 'all');return notice()+storeHealth()+stats([[L('À vérifier en priorité'),q.filter(function(t){return t.priority<=2;}).length,L('Signaux et suivis chargés')],[L('Suivis en retard'),available('tasks')?queue('','due').length:L('n.d.'),L('Échéance dépassée, non résolus')],[L('Établissements'),real.length,L('Hors démonstrations')],[L('Ventes reçues aujourd’hui'),money(real.reduce(function(n,c){return n+c.today_amount;},0))+' MAD',L('Net des annulations · journée métier')]])+'<div class="op-columns"><div>'+card(L('Votre file de travail'),taskRows(''),L('Qualifier, attribuer, suivre jusqu’au résultat.'))+'</div><aside class="op-aside">'+boardCard()+card(L('Parcours client'),'<div class="op-card-body op-lifecycle">'+[['pending',L('Accès en attente'),L('Activation à examiner')],['trial',L('En essai'),L('Préparer le prochain point')],['expired',L('Échéance dépassée'),L('Vérifier le renouvellement')],['unpriced',L('Conditions à compléter'),L('Ne signifie pas accès bloqué')]].map(function(x){var n=real.filter(function(c){return P.commercial(c,Date.now())===x[0];}).length;return '<button data-op="segment" data-value="'+x[0]+'"><span>'+x[1]+'<small>'+x[2]+'</small></span><b>'+n+'</b></button>';}).join('')+'</div>')+card(L('Couverture des sources'),healthSummary(),L('État à la dernière lecture'))+'</aside></div>';}
  function quarantineCard(m){
    var list=rows('quarantine',m);
    return card(L('Opérations à valider par le propriétaire'),list.length?'<div class="op-card-body">'+list.map(function(r){return '<p>'+link(r.merchant,'diagnostics')+' · '+esc(r.kind==='refund'?L('Remboursement'):L('Vente'))+' · '+esc(money(r.amount_cents/100))+L(' MAD · ')+date(r.ts)+'<small>'+esc(r.id)+' · '+esc(r.method)+' · '+esc(r.reason)+(r.last_error?' · '+esc(r.last_error):'')+'</small></p>';}).join('')+'</div>':empty(available('quarantine')?L('Aucune opération en attente'):L('Lecture indisponible'),L('La caisse conserve sa copie tant que la décision n’est pas réglée.')),L('Copie serveur durable, sans limite d’âge. Seul le propriétaire peut décider.'));
  }
  function financialFleet(m){
    var seen=new Set(), list=[];
    rows('caisseSync',m).forEach(function(row){
      if(row.app!=='caisse'||!row.deviceId)return;
      var key=row.merchant+':'+row.deviceId;if(seen.has(key))return;seen.add(key);
      list.push({merchant:row.merchant,deviceId:String(row.deviceId),sync:row.sync,updated:row.updated_ts});
    });
    var body=list.length?L('<div class="op-table-wrap" tabindex="0" role="region" aria-label="Synchronisation financière des caisses"><table class="op-table"><thead><tr><th>Établissement / caisse</th><th>Ventes non confirmées</th><th>Plus ancienne</th><th>Dernier acquittement</th><th>Erreur HTTP</th><th>Observation</th></tr></thead><tbody>')+list.map(function(r){var s=r.sync||{},n=Math.max(0,Number(s.total)||0),blocked=Math.max(0,Number(s.blocked)||0);return '<tr><td>'+link(r.merchant,'diagnostics')+'<small>'+esc(r.deviceId)+'</small></td><td>'+(!r.sync?L('Inconnu'):esc(n)+(blocked?' · '+esc(blocked)+L(' bloquée(s)'):''))+'</td><td>'+date(s.oldestPendingAt)+'</td><td>'+date(s.lastAcknowledgedAt)+'</td><td>'+esc(s.lastStatus||'—')+'<small>'+esc(s.lastError||'')+'</small>'+((s.blockedEntries||[]).map(function(b){return '<small>'+esc(b.id)+' · '+esc((Number(b.amountCents)/100).toFixed(2))+L(' MAD · ')+esc(b.method)+' · '+date(b.ts)+' · '+esc(b.reason)+'</small>';}).join(''))+'</td><td>'+date(r.updated)+L('<small>Déclaré par la caisse · connectée ≠ synchronisée</small></td></tr>');}).join('')+'</tbody></table></div>':empty(available('caisseSync')?L('Aucune caisse n’a signalé son état financier'):L('État financier indisponible'),L('Un appareil connecté ne prouve jamais que ses ventes sont enregistrées.'));
    return card(L('Synchronisation financière des caisses'),body,L('État autodéclaré par les appareils ; vérifier les rapports Z et le journal central avant de conclure.'));
  }
  function fleet(m){var list=rows('bridges',m);return quarantineCard(m)+financialFleet(m)+card(L('Relais d’impression'),list.length?L('<div class="op-table-wrap" tabindex="0" role="region" aria-label="Relais d’impression"><table class="op-table"><thead><tr><th>Établissement / relais</th><th>Version</th><th>Dernière observation</th></tr></thead><tbody>')+list.map(function(r){return '<tr><td>'+link(r.merchant,'diagnostics')+'<small>'+esc(r.name||r.id)+'</small></td><td>'+esc(r.platform||'—')+'<small>'+esc(r.version||L('Version inconnue'))+'</small></td><td>'+date(r.last_seen_ts)+'<small>'+((Date.now()-r.last_seen_ts)<120000?L('Observation récente'):L('Présence actuelle inconnue'))+'</small></td></tr>';}).join('')+'</tbody></table></div>':empty(available('bridges')?L('Aucun relais dans ce périmètre'):L('Relais indisponibles'),L('La connexion et la sortie papier sont deux vérifications distinctes.')))+errorList(m)+card(L('Événements à examiner'),taskRows(m),L('Relais cloud uniquement. Les impressions locales ne sont pas toutes observables ici.'));}
  function onboarding(m){var cs=m?[client(m)]:state.clients.filter(function(c){return !c.demo;});return cs.filter(Boolean).map(function(c){var steps=onboardingSteps(c.type), done=steps.filter(function(s){return rows('tasks',c.merchant).some(function(t){return t.signal_key===s.key&&t.status==='resolved';});}).length;return card(c.business||c.merchant,steps.map(function(s,i){var task=rows('tasks',c.merchant).find(function(t){return t.signal_key===s.key;}), finished=task&&task.status==='resolved';return '<div class="op-step"><span class="op-step-number '+(finished?'done':'')+'">'+(finished?'✓':i+1)+'</span><div class="op-step-body"><h4>'+esc(s.title)+'</h4><p>'+esc(s.detail)+'</p>'+(task?'<p>'+esc(finished?task.outcome:labels[task.status])+'</p>':'')+'<button class="op-btn" data-op="step" data-value="'+esc(c.merchant)+'" data-step="'+s.key+'">'+(task?L('Mettre à jour'):L('Commencer le suivi'))+'</button></div></div>';}).join(''),done+' / '+steps.length+L(' étapes confirmées · ')+(c.type||L('commerce')));}).join('');}
  function revenue(){var mrr=state.overview&&state.overview.mrr;var contributions=mrr&&mrr.contributions;return notice()+card(L('Périmètre du MRR'),L('<div class="op-card-body"><p class="op-info">Montants mensuels configurés pour les contrats actifs. Les accès en attente, essais, contrats futurs et échus sont exclus. Ce n’est ni une facture ni une preuve d’encaissement.</p></div>')+(contributions?L('<div class="op-table-wrap" tabindex="0" role="region" aria-label="Périmètre du MRR"><table class="op-table"><thead><tr><th>Établissement</th><th>Situation</th><th>Contribution MAD/mois</th></tr></thead><tbody>')+contributions.map(function(c){return '<tr><td>'+link(c.merchant,'commercial')+'</td><td>'+esc(c.status===L('active')?L('Payant configuré'):labels[c.status]||c.status)+'</td><td class="num">'+(c.amount==null?L('Non comptabilisé'):money(c.amount))+'</td></tr>';}).join('')+'</tbody></table></div>':empty(L('Détail indisponible'),L('La version de la source ne fournit pas les contributions.'))));}
  function errorList(m){
    var entries=rows('errors',m), unmatched=entries.filter(function(e){return !client(e.merchant)||client(e.merchant).demo;}).length;
    var description=unmatched?unmatched+L(' rapport(s) hors dossiers clients réels. Attribution à vérifier ; aucun client n’est deviné.'):L('Rapports reçus dans les 7 derniers jours. Les compteurs peuvent couvrir des occurrences antérieures.');
    var body=entries.length?L('<div class="op-table-wrap" tabindex="0" role="region" aria-label="Erreurs applicatives reçues"><table class="op-table"><thead><tr><th>Établissement</th><th>Erreur</th><th>Fichier / version</th><th>Occurrences</th><th>Dernière réception</th></tr></thead><tbody>')+entries.map(function(e){var c=client(e.merchant),file=String(e.file||L('Fichier inconnu')).split(/[?#]/)[0];return '<tr><td>'+(c&&!c.demo?link(e.merchant,'diagnostics'):esc(c?L('Démonstration'):e.merchant?L('Dossier non reconnu'):L('Non attribué')))+'</td><td>'+esc(e.message||L('Message non transmis'))+'</td><td>'+esc(file)+'<small>'+esc(e.version||L('Version inconnue'))+'</small></td><td class="num">'+esc(e.count||1)+'</td><td>'+date(e.last_seen_ts)+'</td></tr>';}).join('')+'</tbody></table></div>':empty(available('errors')?L('Aucun rapport reçu dans ce périmètre'):L('Erreurs indisponibles'),L('Cela ne prouve pas l’absence d’erreurs sur les appareils.'));
    return card(L('Erreurs applicatives reçues'),body,description);
  }
  function timeline(m){var items=rows('notes',m).map(function(n){return {body:n.body,actor:n.actor,ts:n.ts,kind:L('Note')};}).concat(rows('events',m).map(function(e){var detail=e.detail;try{var d=JSON.parse(detail);detail=d.outcome||L('Statut : ')+(labels[d.after.status]||d.after.status);}catch(_){}return {body:detail,actor:e.actor,ts:e.ts,kind:e.action==='created'?L('Suivi créé'):L('Suivi mis à jour')};})).sort(function(a,b){return b.ts-a.ts;});return items.length?'<div class="op-card-body">'+items.map(function(i){return '<article class="op-timeline-item"><small>'+esc(i.kind)+' · '+esc(i.actor)+' · '+date(i.ts)+'</small><p>'+esc(i.body)+'</p></article>';}).join('')+'</div>':empty(L('Pas encore de notes ou de suivi'),L('Les anciennes actions de configuration restent dans l’onglet Historique.'));}
  function dossierView(){var c=client(state.merchant);if(!c)return;var el=document.getElementById('op-dossier-tabs');el.innerHTML=Object.keys(tabs).map(function(t){return '<button data-op="dossier-tab" data-value="'+t+'" aria-pressed="'+(state.tab===t)+'">'+tabs[t]+'</button>';}).join('');document.querySelectorAll('[data-dossier-panel]').forEach(function(p){p.hidden=p.dataset.dossierPanel!==state.tab;});
    var head='<div class="op-dossier-identity"><div class="op-avatar" aria-hidden="true">'+esc((c.business||c.merchant).slice(0,2).toUpperCase())+'</div><div><h3 id="op-dossier-heading" tabindex="-1">'+esc(c.business||c.merchant)+'</h3><p>'+esc(c.city||L('Ville non renseignée'))+' · '+esc(c.type||L('Métier non renseigné'))+' · '+esc(c.merchant)+'</p></div></div>';
    var body='';
    if(state.tab==='summary'){var tasks=queue(c.merchant,'all');body='<div class="op-dossier-grid"><div>'+card(L('Le prochain point'),'<div class="op-card-body"><div class="op-brief">'+esc((c.owner_name||c.name||L('Contact à confirmer'))+' · '+(c.owner||c.email||L('Adresse à confirmer'))+'\n'+(labels[P.access(c)])+' · '+(P.commercial(c,Date.now())===L('active')?L('Abonnement payant configuré'):labels[P.commercial(c,Date.now())])+L('\nDernière vente reçue : ')+date(c.last_ts)+'\n'+tasks.length+L(' sujet(s) à examiner.\n')+(tasks[0]?L('Commencer par : ')+tasks[0].title+'.':L('Confirmer avec le commerçant que son parcours habituel fonctionne.')))+L('</div><small class="op-brief-source">Synthèse déterministe du dossier et des sources chargées · aucune conclusion générée.</small><div class="op-form-actions">')+button(L('Ouvrir le support'),'support',c.merchant)+button(L('Ajouter un suivi'),'new',c.merchant,'primary')+'</div></div>')+card(L('Journal de relation'),timeline(c.merchant))+'</div><aside>'+card(L('Ajouter une note'),'<form class="op-form op-card-body" data-note="'+esc(c.merchant)+L('"><label class="op-field">Note interne<textarea name="body" maxlength="4000" required aria-describedby="op-note-help" placeholder="Échange, décision, engagement…"></textarea></label><p class="op-field-help" id="op-note-help">Visible par l’équipe opérateur. Ne pas ajouter de PIN, mot de passe ou donnée de paiement.</p><p class="op-error" id="op-note-error" role="alert"></p><button class="op-btn primary" type="submit" ')+(!available('notes')?'disabled':'')+L('>Enregistrer la note</button></form>'))+'</aside></div>';}
    if(state.tab==='tasks')body=card(L('Suivis de l’établissement'),taskRows(c.merchant));
    if(state.tab==='onboarding')body=onboarding(c.merchant);
    if(state.tab==='diagnostics')body=fleet(c.merchant);
    var note=dossier.querySelector('form[data-note]');
    if(state.tab==='summary'&&note&&note.dataset.note===state.merchant){
      var fresh=document.createElement('div');fresh.innerHTML=body;
      var panel=dossier.querySelector('.op-dossier-grid > div');
      if(panel){panel.innerHTML=fresh.querySelector('.op-dossier-grid > div').innerHTML;return;}
    }
    dossier.innerHTML=head+notice()+body;
  }
  function render(){
    var key=focusKey(document.activeElement);
    var meta=routes[state.route]||[L('Dossier établissement'),name(state.merchant),L('Le contexte, les engagements et les outils du même établissement.')];
    document.body.dataset.workspace=state.route;document.body.dataset.dossierTab=state.tab;document.getElementById('op-page-name').textContent=meta[1];document.getElementById('op-eyebrow').textContent=meta[0];document.getElementById('op-page-title').textContent=meta[1];document.getElementById('op-page-copy').textContent=meta[2];
    document.querySelectorAll('.op-navigation a').forEach(function(a){if(a.hash==='#'+state.route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    root.hidden=state.route==='merchant'||state.route==='operators';
    if(state.route==='merchant')dossierView();else if(state.route==='today')root.innerHTML=today();else if(state.route==='fleet')root.innerHTML=notice()+fleet('');else if(state.route==='revenue')root.innerHTML=revenue();else if(state.route==='onboarding')root.innerHTML=notice()+onboarding('');else root.innerHTML=notice();
    freshness();
    refocus(key);
  }
  /* A rebuild removes the button the keyboard was on (a section tab, a filter,
     a follow-up) and focus fell to <body>, so a keyboard or screen-reader user
     restarted from the top of a long dossier. Put it back on the same control,
     or on the dossier's name when that control is gone or hidden. */
  function focusKey(el){
    var tabsEl=document.getElementById('op-dossier-tabs');
    if(!el||el===document.body||!(root.contains(el)||dossier.contains(el)||(tabsEl&&tabsEl.contains(el))))return null;
    var op=el.closest('[data-op]');
    if(op)return '[data-op="'+CSS.escape(op.dataset.op)+'"][data-value="'+CSS.escape(op.dataset.value||'')+'"]'+(op.dataset.tab?'[data-tab="'+CSS.escape(op.dataset.tab)+'"]':'');
    var form=el.closest('form[data-note]');
    return form&&el.name?'form[data-note] [name="'+CSS.escape(el.name)+'"]':null;
  }
  function refocus(key){
    var a=document.activeElement, lost=!a||a===document.body||!a.isConnected||!!a.closest('[hidden]');
    var next=key&&Array.from(document.querySelectorAll(key)).find(function(x){return !x.closest('[hidden]');});
    if(next){if(next!==a)next.focus();return;}
    if(lost&&state.route==='merchant'){
      /* The dossier's visible title: the section heading that names the
         establishment, else the identity heading where it is displayed. */
      var head=[document.querySelector('#manage .sec-head h2'),document.getElementById('op-dossier-heading')].find(function(x){return x&&x.getClientRects().length&&!x.closest('[hidden]');});
      if(head){if(!head.hasAttribute('tabindex'))head.setAttribute('tabindex','-1');head.focus();}
    }
  }
  function freshness(){var el=document.getElementById('op-freshness'), times=[state.now,state.data&&state.data.now].filter(Boolean), at=times.length?Math.min.apply(Math,times):0, stale=!at||Date.now()-at>90000;el.classList.toggle('stale',stale);el.textContent=state.live===false?L('Démonstration locale · aucune donnée opérationnelle en direct'):(at?L('Dernière lecture : ')+date(at)+(stale?L(' · données anciennes'):state.route==='merchant'?L(' · dossier actualisé automatiquement'):L(' · actualisation automatique hors saisie')):L('En attente d’une lecture confirmée'))+L(' · Journée métier : Afrique/Casablanca, 05 h');var badge=document.getElementById('mode-badge');if(badge&&state.live===true)badge.textContent=stale?L('D1 · ancien'):L('D1 · instantané');}
  var generation=0;
  async function load(force){if(state.live!==true){render();return;}var g=++generation,m=state.route==='merchant'?state.merchant:'';if(state.data&&state.data.merchant!==m)state.data=null;state.loadError=null;state.loading=true;try{var result=await request('/workspace'+(m?'?merchant='+encodeURIComponent(m):''));if(g!==generation)return;state.data=result;}catch(err){if(g!==generation)return;state.data=null;state.loadError={code:err.code||'request-failed',status:err.status||0,action:err.status===403?L('Accès opérateur refusé ou session expirée. Réauthentifiez-vous puis réessayez.'):err.status===503?L('Service ou base indisponible. Vérifiez le déploiement puis réessayez.'):L('Réessayez ; si le problème persiste, vérifiez l’authentification, le déploiement et le réseau.')};}finally{if(g===generation){state.loading=false;render();}}}
  async function owners(){try{state.operators=(await request('/operators')).operators||[];render();}catch(_){state.operators=[];}}
  function navigate(){var parts=location.hash.slice(1).split('/'),route=parts[0];if(route==='merchant'){var m;try{m=decodeURIComponent(parts[1]||'');}catch(_){m='';}if(!client(m)){if(state.clients.length)toast(L('Établissement introuvable.'));return;}state.route='merchant';state.tab=tabs[parts[2]]?parts[2]:'summary';var changed=state.merchant!==m;state.merchant=m;render();if(changed)bridge.open(m);load();return;}
    state.route=routes[route]?route:'today';state.merchant='';state.filter=state.route==='fleet'?'incidents':'all';bridge.close();render();load();
  }
  function openMerchant(m,t){location.hash='merchant/'+encodeURIComponent(m)+'/'+(t||'summary');}
  function toInput(ts){if(!ts)return '';var d=new Date(Number(ts));return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  function field(label,html){return '<label class="op-field">'+label+html+'</label>';}
  async function taskDialog(input){
    var opener=document.activeElement, visibleTasks=function(){return Array.from(document.querySelectorAll('[data-op="task"]')).filter(function(b){return !b.closest('[hidden]');});}, openerAt=visibleTasks().indexOf(opener);
    function restoreFocus(){
      var list=visibleTasks(), replacement=existing&&list.find(function(b){return b.dataset.value===t.id;});
      var next=openerAt>=0&&list.length?list[Math.min(openerAt,list.length-1)]:null;
      var target=opener&&opener.isConnected&&!opener.closest('[hidden]')?opener:replacement||next||document.getElementById('op-new-task');
      if(target)target.focus();
    }
    var t=input||{}, existing=!!t.version, id=t.id&&existing?t.id:crypto.randomUUID(), merchant=t.merchant||state.merchant;
    var dialog=document.createElement('dialog');dialog.className='op-dialog';dialog.setAttribute('aria-labelledby','op-dialog-title');
    var options=state.clients.filter(function(c){return !c.demo;}).map(function(c){return '<option value="'+esc(c.merchant)+'" '+(c.merchant===merchant?'selected':'')+'>'+esc(c.business||c.merchant)+'</option>';}).join('');
    var ownersHtml=L('<option value="">Sans responsable</option>')+state.operators.map(function(o){return '<option value="'+esc(o.id)+'" '+(o.id===t.assignee?'selected':'')+'>'+esc(o.label)+'</option>';}).join('');
    dialog.innerHTML='<h2 id="op-dialog-title">'+(existing?L('Mettre à jour le suivi'):L('Nouveau suivi'))+L('</h2><p>Une prochaine étape, un responsable, un résultat.</p><form class="op-form">')+field(L('Établissement'),'<select name="merchant" required '+(existing||t.signal_key?'disabled':'')+'>'+options+'</select>')+(existing?'<p class="op-info">'+esc(t.title)+'</p>':field(L('Prochaine étape'),'<input name="title" required maxlength="160" value="'+esc(t.title||'')+'">')+field(L('Contexte'),'<textarea name="detail" maxlength="2000">'+esc(t.detail||'')+'</textarea>'))+'<div class="op-form-row">'+field(L('Responsable'),'<select name="assignee">'+ownersHtml+'</select>')+field(L('Échéance'),'<input type="datetime-local" name="due" value="'+toInput(t.due_ts)+'">')+'</div>'+(existing?field(L('État'),'<select name="status">'+['open','in_progress','snoozed','resolved'].map(function(s){return '<option value="'+s+'" '+(s===t.status?'selected':'')+'>'+labels[s]+'</option>';}).join('')+'</select>')+field(L('Reprendre le suivi le (si reporté)'),'<input type="datetime-local" name="snooze" value="'+toInput(t.snoozed_until)+'">')+field(L('Résultat / preuve (requis pour résoudre)'),'<textarea name="outcome" maxlength="2000">'+esc(t.outcome||'')+'</textarea>'):field(L('Priorité'),'<select name="priority">'+[1,2,3,4].map(function(p){return '<option value="'+p+'" '+(p===(t.priority||3)?'selected':'')+'>'+['',L('1 · Bloquant'),L('2 · À traiter'),L('3 · Suivi'),L('4 · Données à compléter')][p]+'</option>';}).join('')+'</select>'))+L('<p class="op-error" role="alert"></p><div class="op-form-actions"><button class="op-btn" type="button" data-cancel>Annuler</button><button class="op-btn primary" type="submit">Enregistrer</button></div></form>');
    document.body.appendChild(dialog);dialog.querySelector('[data-cancel]').onclick=function(){dialog.close();};dialog.onclose=function(){dialog.remove();restoreFocus();};dialog.addEventListener('keydown',function(e){if(e.key==='Escape')e.stopPropagation();});dialog.showModal();
    dialog.querySelector('form').onsubmit=async function(e){e.preventDefault();var f=e.currentTarget, data=new FormData(f), submit=f.querySelector('[type=submit]'), error=f.querySelector('.op-error');var payload={id:id,merchant:existing||t.signal_key?t.merchant:data.get('merchant'),assignee:data.get('assignee'),due_ts:data.get('due')?new Date(data.get('due')).getTime():null};if(existing)Object.assign(payload,{version:t.version,status:data.get('status'),outcome:data.get('outcome'),snoozed_until:data.get('snooze')?new Date(data.get('snooze')).getTime():null});else Object.assign(payload,{title:data.get('title'),detail:data.get('detail'),priority:Number(data.get('priority')),signal_key:t.signal_key||null,source_ts:t.source_ts||0});var outcomeEl=f.elements.outcome;error.id='op-dialog-error';function fail(msg,field){error.textContent=msg;if(!field)return;field.setAttribute('aria-invalid','true');var ids=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(function(x){return x&&x!==error.id;});ids.push(error.id);field.setAttribute('aria-describedby',ids.join(' '));field.focus();}
      if(existing&&data.get('status')==='resolved'&&!String(data.get('outcome')||'').trim()){fail(L('Un résultat est requis pour clôturer.'),outcomeEl);return;}
      submit.disabled=true;error.textContent='';try{var result=await request('/tasks',{method:existing?'PATCH':'POST',body:JSON.stringify(payload)});dialog.close();await load(true);restoreFocus();toast(result.replayed?L('Ce signal dispose déjà d’un suivi.'):L('Suivi enregistré.'));if(result.replayed)taskDialog(result.task);}catch(err){fail(err.message,err.code==='outcome-required'||/résultat est requis/i.test(err.message)?outcomeEl:null);if(err.code==='version-conflict'||/nouvelle version/.test(err.message))load();}finally{submit.disabled=false;}};
    var outcomeInput=dialog.querySelector('[name="outcome"]');if(outcomeInput)outcomeInput.addEventListener('input',function(){if(!outcomeInput.value.trim())return;outcomeInput.removeAttribute('aria-invalid');var ids=(outcomeInput.getAttribute('aria-describedby')||'').split(/\s+/).filter(function(x){return x&&x!=='op-dialog-error';});if(ids.length)outcomeInput.setAttribute('aria-describedby',ids.join(' '));else outcomeInput.removeAttribute('aria-describedby');});
  }
  document.addEventListener('click',function(e){var b=e.target.closest('[data-op]');if(!b)return;var v=b.dataset.value,action=b.dataset.op;
    if(action==='merchant')return openMerchant(v,b.dataset.tab);
    if(action==='dossier-tab')return openMerchant(state.merchant,v);
    if(action==='filter'){state.filter=v;render();return;}
    if(action==='new')return taskDialog({merchant:v});
    if(action==='support')return window.dispatchEvent(new CustomEvent('kiwi:open-support',{detail:{merchant:v}}));
    if(action==='task'){var t=queue(state.merchant,state.filter).find(function(t){return t.id===v;});if(t)taskDialog(t.tracked||t);return;}
    if(action==='step'){var step=onboardingSteps((client(v)||{}).type).find(function(s){return s.key===b.dataset.step;}),t=rows('tasks',v).find(function(t){return t.signal_key===step.key;});return taskDialog(t||{merchant:v,title:step.title,detail:step.detail,signal_key:step.key,priority:3});}
    if(action==='segment'){var cs=state.clients.filter(function(c){return !c.demo&&P.commercial(c,Date.now())===v;});root.innerHTML=notice()+card(labels[v],cs.length?'<div class="op-card-body op-health-list">'+cs.map(function(c){return link(c.merchant,'commercial');}).join('')+'</div>':empty(L('Aucun établissement')))+button(L('Retour à la journée'),'back');return;}
    if(action==='back')render();
  });
  document.addEventListener('submit',async function(e){var f=e.target.closest('[data-note]');if(!f)return;e.preventDefault();var merchant=f.dataset.note, body=f.elements.body.value.trim(), submit=f.querySelector('[type=submit]');if(!body)return;if(f.dataset.lastBody!==body){f.dataset.id=crypto.randomUUID();f.dataset.lastBody=body;}submit.disabled=true;try{await request('/notes',{method:'POST',body:JSON.stringify({id:f.dataset.id,merchant:merchant,body:body})});f.elements.body.value='';delete f.dataset.id;delete f.dataset.lastBody;await load(true);toast(L('Note enregistrée.'));var again=document.querySelector('#op-dossier-summary form[data-note] textarea[name="body"]');if(again)again.focus();}catch(err){var noteError=f.querySelector('.op-error'),field=f.elements.body;noteError.textContent=err.message;field.setAttribute('aria-describedby','op-note-help op-note-error');field.focus();submit.disabled=false;}});
  document.getElementById('op-new-task').onclick=function(){taskDialog();};
  function search(){location.hash='clients';setTimeout(function(){var input=document.getElementById('cli-q');if(input)input.focus();},80);}
  document.getElementById('op-search-shortcut').onclick=search;
  document.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search();}});
  window.addEventListener('hashchange',navigate);
  window.addEventListener('kiwi:operator-data',function(e){var initial=state.live===null;state.clients=e.detail.clients;state.now=e.detail.now;state.live=e.detail.live;if(state.route!=='merchant')render();if(initial){navigate();owners();}});
  window.addEventListener('kiwi:operator-overview',function(e){state.overview=e.detail;if(state.route!=='merchant')render();});
  window.addEventListener('kiwi:operator-select',function(e){if(state.merchant!==e.detail.merchant)openMerchant(e.detail.merchant,'summary');else{var key=focusKey(document.activeElement);dossierView();refocus(key);}});
  window.addEventListener('kiwi:operator-close',function(){if(state.route==='merchant')location.hash='clients';});
  window.KiwiOperatorWorkspace={refresh:load};
  Object.assign(state,bridge.snapshot());navigate();owners();
  document.getElementById('refresh').addEventListener('click',load);
  function refreshSources(){if(state.route==='merchant'){if(bridge.refreshMetrics)bridge.refreshMetrics();}else bridge.refresh();load();}
  setInterval(function(){freshness();if(!document.hidden&&!document.querySelector('dialog[open]')){refreshSources();}},30000);
  document.addEventListener('visibilitychange',function(){freshness();if(!document.hidden&&!document.querySelector('dialog[open]')){refreshSources();}});
})();
