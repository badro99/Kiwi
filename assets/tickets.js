(function () {
  'use strict';

  const API = '/api/tickets';
  const FILTER_KEY = 'kiwi:tickets:filters:v1';
  const MAX_IMAGES = 6;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  /* Trois langues, comme le reste du produit. Même règle que reset.html et la
     porte de compte : ?lang=, puis la langue partagée du produit (kiwiLang),
     puis celle du navigateur, puis le français. Les formes .two/.few/.many ne
     servent qu'aux pluriels arabes ; les autres langues retombent sur .other. */
  const COPY = {
    fr: {
      'doc.title': 'Kiwi Tickets',
      'brand.home': 'Accueil Kiwi Tickets',
      'brand.product': 'tickets',
      'add': 'Nouveau problème',
      'head.eyebrow': 'Opérations Kiwi',
      'head.title': 'Les problèmes, bien suivis.',
      'head.note': 'Les photos disparaissent après le test. Les tickets terminés disparaissent après 20 jours.',
      'filters.eyebrow': 'Affiner le tableau',
      'filters.title': 'Filtrer les tickets',
      'filters.reset': 'Réinitialiser',
      'filter.all': 'Tous',
      'field.type': 'Type',
      'field.area': 'Zone',
      'field.risk': 'Risque',
      'field.subkind': 'Sous-type',
      'tabs.label': 'Statut des tickets',
      'tab.problem': 'Problèmes',
      'tab.testing': 'À tester',
      'tab.done': 'Terminés',
      'lane.problem': 'Problèmes',
      'lane.testing': 'À tester',
      'lane.done': 'Corrigés et testés',
      'composer.eyebrow': 'Nouveau ticket',
      'composer.title': 'Signaler un problème',
      'composer.bodyLabel': 'Quel est le problème ?',
      'composer.placeholder': 'Décrivez ce qui s’est passé, où vous l’avez vu et ce que vous attendiez…',
      'composer.publish': 'Publier le problème',
      'class.title': 'Classement',
      'class.textOnly': 'Un texte seul suffit aussi',
      'class.save': 'Enregistrer le classement',
      'common.optional': 'Facultatif',
      'common.close': 'Fermer',
      'common.cancel': 'Annuler',
      'common.done': 'OK',
      'common.retry': 'Réessayer',
      'money.label': 'Argent en jeu',
      'money.hint': 'Ventes, caisse, paiements ou remboursements peut-être faux',
      'upload.images': 'Images',
      'upload.add': 'Ajouter des photos',
      'upload.hint': 'Choisissez dans votre galerie ou prenez une photo',
      'followup.eyebrow': 'Test échoué',
      'followup.title': 'Qu’est-ce qui ne marche toujours pas ?',
      'followup.intro': 'Notez ce qui s’est passé pendant ce test. La note reste liée au problème d’origine et le renvoie dans Problèmes.',
      'followup.bodyLabel': 'Notes du nouveau test',
      'followup.placeholder': 'Expliquez ce qui échoue encore, où, et ce que vous attendiez…',
      'followup.moreImages': 'Autres images',
      'followup.addPhotos': 'Ajouter de nouvelles photos',
      'followup.submit': 'Renvoyer comme non résolu',
      'copyFallback.title': 'Appui long pour copier',
      'copyFallback.body': 'Votre navigateur a bloqué la copie automatique de l’image.',
      'copyFallback.alt': 'Pièce jointe du ticket à copier',
      'time.today': 'Aujourd’hui, {time}',
      'time.yesterday': 'Hier, {time}',
      'action.fixed': 'Corrigé',
      'action.fixedAria': 'Corrigé, passer le ticket {number} en test',
      'action.tested': 'Testé',
      'action.testedAria': 'Testé, terminer le ticket {number}',
      'action.failed': 'Test échoué',
      'action.failedAria': 'Test échoué, ajouter des notes au ticket {number}',
      'copy.text': 'Copier le texte',
      'copy.image': 'Copier l’image',
      'copy.textAria': 'Copier le texte du ticket {number}',
      'copy.imageAria': 'Copier l’image du ticket {number}',
      'image.alt': '{number}, pièce jointe {index}',
      'image.followupAlt': '{number}, pièce jointe du test échoué {index}',
      'chip.unsorted': 'À classer',
      'classify': 'Classer',
      'classify.aria': 'Classer le ticket {number}',
      'area.none': 'Aucune zone',
      'subkind.none': 'Aucun sous-type',
      'expiry.today': 'Supprimé aujourd’hui',
      'expiry.days.one': 'Supprimé dans {n} jour',
      'expiry.days.other': 'Supprimé dans {n} jours',
      'empty.problem.title': 'Aucun problème ouvert',
      'empty.problem.body': 'Les nouveaux signalements apparaîtront ici.',
      'empty.testing.title': 'Rien à tester',
      'empty.testing.body': 'Les problèmes corrigés arrivent ici d’abord.',
      'empty.done.title': 'Rien de terminé pour l’instant',
      'empty.done.body': 'Les tickets testés restent ici 20 jours.',
      'load.failed': 'Impossible de charger les tickets',
      'error.schema-not-ready': 'La base des tickets est en préparation. Réessayez dans un instant.',
      'error.no-media': 'Le stockage des images est indisponible pour le moment.',
      'error.text-required': 'Écrivez une courte description avant de publier.',
      'error.note-required': 'Ajoutez une courte note sur ce qui échoue encore.',
      'error.text-too-long': 'La description est trop longue.',
      'error.too-many-images': 'Vous pouvez joindre jusqu’à 6 images.',
      'error.image-too-large': 'Une image dépasse 10 Mo.',
      'error.images-too-large': 'Les images choisies sont trop lourdes ensemble.',
      'error.bad-image-type': 'Utilisez des images JPEG, PNG, WebP ou GIF.',
      'error.invalid-kind': 'Choisissez un type de ticket valide.',
      'error.invalid-area': 'Choisissez une zone du produit valide.',
      'error.invalid-subkind': 'Choisissez un sous-type valide.',
      'error.subkind-kind-mismatch': 'Ce sous-type n’appartient pas au type choisi.',
      'error.invalid-money-at-risk': 'Choisissez un réglage valide pour l’argent en jeu.',
      'error.wrong-status': 'Ce ticket a déjà été déplacé sur un autre appareil.',
      'error.changed-elsewhere': 'Ce ticket a changé sur un autre appareil. Le tableau a été actualisé.',
      'error.not-found': 'Ce ticket n’existe plus. Le tableau a été actualisé.',
      'error.forbidden': 'Accès réservé aux opérateurs Kiwi nommés. Connectez-vous à la console opérateur.',
      'error.generic': 'Une erreur est survenue. Réessayez.',
      'file.tooLarge': '{name} dépasse 10 Mo.',
      'file.selectedAlt': 'Image choisie {index}',
      'file.followupAlt': 'Image de suivi choisie {index}',
      'file.remove': 'Retirer {name}',
      'file.image': 'l’image',
      'busy.uploading': 'Envoi des images…',
      'busy.publishing': 'Publication…',
      'busy.saving': 'Enregistrement…',
      'busy.copying': 'Copie…',
      'busy.moving': 'Déplacement…',
      'busy.deletingImages': 'Suppression des images…',
      'toast.published': '{number} publié',
      'toast.publishedPending': '{number} publié. Le classement sera disponible après la mise à jour de la base.',
      'toast.sentBack': '{number} renvoyé comme non résolu',
      'toast.textCopied': 'Texte du {number} copié',
      'toast.copyFailed': 'Impossible de copier le texte',
      'toast.imageCopied': 'Image du {number} copiée',
      'toast.readyToTest': '{number} prêt à tester',
      'toast.completed': '{number} terminé, images supprimées',
      'toast.classPending': 'Le classement attend la mise à jour de la base',
      'toast.classified': '{number} classé',
    },
    en: {
      'doc.title': 'Kiwi Tickets',
      'brand.home': 'Kiwi Tickets home',
      'brand.product': 'tickets',
      'add': 'Add problem',
      'head.eyebrow': 'Kiwi operations',
      'head.title': 'Problems, clearly handled.',
      'head.note': 'Photos disappear after testing. Completed tickets disappear after 20 days.',
      'filters.eyebrow': 'Focus the board',
      'filters.title': 'Filter tickets',
      'filters.reset': 'Reset',
      'filter.all': 'All',
      'field.type': 'Type',
      'field.area': 'Area',
      'field.risk': 'Risk',
      'field.subkind': 'Sub-kind',
      'tabs.label': 'Ticket status',
      'tab.problem': 'Problems',
      'tab.testing': 'Testing',
      'tab.done': 'Done',
      'lane.problem': 'Problems',
      'lane.testing': 'Requiring testing',
      'lane.done': 'Fixed and tested',
      'composer.eyebrow': 'New ticket',
      'composer.title': 'Add a problem',
      'composer.bodyLabel': 'What is the problem?',
      'composer.placeholder': 'Describe what happened, where you saw it, and what you expected…',
      'composer.publish': 'Publish problem',
      'class.title': 'Classification',
      'class.textOnly': 'Text-only filing still works',
      'class.save': 'Save classification',
      'common.optional': 'Optional',
      'common.close': 'Close',
      'common.cancel': 'Cancel',
      'common.done': 'Done',
      'common.retry': 'Try again',
      'money.label': 'Money at risk',
      'money.hint': 'Sales, cash, payments or refunds may be wrong',
      'upload.images': 'Images',
      'upload.add': 'Add photos',
      'upload.hint': 'Choose from your library or take a photo',
      'followup.eyebrow': 'Test failed',
      'followup.title': 'What is still broken?',
      'followup.intro': 'Add what happened in this test. The note stays linked to the original problem and moves it back to Problems.',
      'followup.bodyLabel': 'New test notes',
      'followup.placeholder': 'Explain what still fails, where it happened, and what you expected…',
      'followup.moreImages': 'More images',
      'followup.addPhotos': 'Add new photos',
      'followup.submit': 'Send back as still broken',
      'copyFallback.title': 'Touch and hold to copy',
      'copyFallback.body': 'Your browser blocked automatic image copying.',
      'copyFallback.alt': 'Ticket attachment to copy',
      'time.today': 'Today, {time}',
      'time.yesterday': 'Yesterday, {time}',
      'action.fixed': 'Fixed',
      'action.fixedAria': 'Fixed, move ticket {number} to testing',
      'action.tested': 'Tested',
      'action.testedAria': 'Tested, complete ticket {number}',
      'action.failed': 'Test failed',
      'action.failedAria': 'Test failed, add notes to ticket {number}',
      'copy.text': 'Copy text',
      'copy.image': 'Copy image',
      'copy.textAria': 'Copy text from ticket {number}',
      'copy.imageAria': 'Copy image from ticket {number}',
      'image.alt': '{number} attachment {index}',
      'image.followupAlt': '{number} failed test attachment {index}',
      'chip.unsorted': 'Unsorted',
      'classify': 'Classify',
      'classify.aria': 'Classify ticket {number}',
      'area.none': 'No area',
      'subkind.none': 'No sub-kind',
      'expiry.today': 'Deletes today',
      'expiry.days.one': 'Deletes in {n} day',
      'expiry.days.other': 'Deletes in {n} days',
      'empty.problem.title': 'No open problems',
      'empty.problem.body': 'New reports will appear here.',
      'empty.testing.title': 'Nothing to test',
      'empty.testing.body': 'Fixed problems move here first.',
      'empty.done.title': 'Nothing completed yet',
      'empty.done.body': 'Tested tickets stay here for 20 days.',
      'load.failed': 'Could not load tickets',
      'error.schema-not-ready': 'The ticket database is being prepared. Try again shortly.',
      'error.no-media': 'Image storage is not available right now.',
      'error.text-required': 'Write a short description before publishing.',
      'error.note-required': 'Add a short note about what still fails.',
      'error.text-too-long': 'The description is too long.',
      'error.too-many-images': 'You can attach up to 6 images.',
      'error.image-too-large': 'One image is larger than 10 MB.',
      'error.images-too-large': 'The selected images are too large together.',
      'error.bad-image-type': 'Use JPEG, PNG, WebP, or GIF images.',
      'error.invalid-kind': 'Choose a valid ticket type.',
      'error.invalid-area': 'Choose a valid product area.',
      'error.invalid-subkind': 'Choose a valid sub-kind.',
      'error.subkind-kind-mismatch': 'That sub-kind does not belong to the selected type.',
      'error.invalid-money-at-risk': 'Choose a valid money-risk setting.',
      'error.wrong-status': 'That ticket was already moved on another device.',
      'error.changed-elsewhere': 'That ticket changed on another device. The board has been refreshed.',
      'error.not-found': 'That ticket no longer exists. The board has been refreshed.',
      'error.forbidden': 'Access is restricted to named Kiwi operators. Sign in to the operator console.',
      'error.generic': 'Something went wrong. Please try again.',
      'file.tooLarge': '{name} is larger than 10 MB.',
      'file.selectedAlt': 'Selected image {index}',
      'file.followupAlt': 'Selected follow-up image {index}',
      'file.remove': 'Remove {name}',
      'file.image': 'image',
      'busy.uploading': 'Uploading…',
      'busy.publishing': 'Publishing…',
      'busy.saving': 'Saving…',
      'busy.copying': 'Copying…',
      'busy.moving': 'Moving…',
      'busy.deletingImages': 'Deleting images…',
      'toast.published': '{number} published',
      'toast.publishedPending': '{number} published. Classification will be available after the database update.',
      'toast.sentBack': '{number} sent back as still broken',
      'toast.textCopied': '{number} text copied',
      'toast.copyFailed': 'Could not copy the text',
      'toast.imageCopied': '{number} image copied',
      'toast.readyToTest': '{number} ready to test',
      'toast.completed': '{number} completed, images deleted',
      'toast.classPending': 'Classification is waiting for the database update',
      'toast.classified': '{number} classified',
    },
    ar: {
      'doc.title': 'Kiwi · التذاكر',
      'brand.home': 'الصفحة الرئيسية لتذاكر Kiwi',
      'brand.product': 'التذاكر',
      'add': 'إضافة مشكلة',
      'head.eyebrow': 'عمليات Kiwi',
      'head.title': 'المشاكل، تحت المتابعة.',
      'head.note': 'تُحذف الصور بعد الاختبار. وتُحذف التذاكر المنجزة بعد 20 يومًا.',
      'filters.eyebrow': 'حصر العرض',
      'filters.title': 'تصفية التذاكر',
      'filters.reset': 'إعادة الضبط',
      'filter.all': 'الكل',
      'field.type': 'النوع',
      'field.area': 'القسم',
      'field.risk': 'المخاطر',
      'field.subkind': 'النوع الفرعي',
      'tabs.label': 'حالة التذاكر',
      'tab.problem': 'المشاكل',
      'tab.testing': 'للاختبار',
      'tab.done': 'المنجزة',
      'lane.problem': 'المشاكل',
      'lane.testing': 'بانتظار الاختبار',
      'lane.done': 'تم الإصلاح والاختبار',
      'composer.eyebrow': 'تذكرة جديدة',
      'composer.title': 'إضافة مشكلة',
      'composer.bodyLabel': 'ما هي المشكلة؟',
      'composer.placeholder': 'صف ما حدث، وأين لاحظته، وما الذي كنت تتوقعه…',
      'composer.publish': 'نشر المشكلة',
      'class.title': 'التصنيف',
      'class.textOnly': 'يكفي النص وحده أيضًا',
      'class.save': 'حفظ التصنيف',
      'common.optional': 'اختياري',
      'common.close': 'إغلاق',
      'common.cancel': 'إلغاء',
      'common.done': 'تم',
      'common.retry': 'أعد المحاولة',
      'money.label': 'المال في خطر',
      'money.hint': 'قد تكون المبيعات أو النقد أو المدفوعات أو المبالغ المستردة خاطئة',
      'upload.images': 'الصور',
      'upload.add': 'إضافة صور',
      'upload.hint': 'اختر من معرض الصور أو التقط صورة',
      'followup.eyebrow': 'فشل الاختبار',
      'followup.title': 'ما الذي لا يزال معطلًا؟',
      'followup.intro': 'اكتب ما حدث في هذا الاختبار. تبقى الملاحظة مرتبطة بالمشكلة الأصلية وتعيدها إلى قائمة المشاكل.',
      'followup.bodyLabel': 'ملاحظات الاختبار الجديد',
      'followup.placeholder': 'اشرح ما الذي لا يزال يفشل، وأين حدث ذلك، وما الذي كنت تتوقعه…',
      'followup.moreImages': 'صور إضافية',
      'followup.addPhotos': 'إضافة صور جديدة',
      'followup.submit': 'إعادتها كمشكلة غير محلولة',
      'copyFallback.title': 'اضغط مطولًا للنسخ',
      'copyFallback.body': 'منع متصفحك النسخ التلقائي للصورة.',
      'copyFallback.alt': 'مرفق التذكرة للنسخ',
      'time.today': 'اليوم، {time}',
      'time.yesterday': 'أمس، {time}',
      'action.fixed': 'تم الإصلاح',
      'action.fixedAria': 'تم الإصلاح، نقل التذكرة {number} إلى الاختبار',
      'action.tested': 'تم الاختبار',
      'action.testedAria': 'تم الاختبار، إنهاء التذكرة {number}',
      'action.failed': 'فشل الاختبار',
      'action.failedAria': 'فشل الاختبار، أضف ملاحظات إلى التذكرة {number}',
      'copy.text': 'نسخ النص',
      'copy.image': 'نسخ الصورة',
      'copy.textAria': 'نسخ نص التذكرة {number}',
      'copy.imageAria': 'نسخ صورة التذكرة {number}',
      'image.alt': '{number}، المرفق {index}',
      'image.followupAlt': '{number}، مرفق الاختبار الفاشل {index}',
      'chip.unsorted': 'غير مصنفة',
      'classify': 'تصنيف',
      'classify.aria': 'تصنيف التذكرة {number}',
      'area.none': 'بدون قسم',
      'subkind.none': 'بدون نوع فرعي',
      'expiry.today': 'تُحذف اليوم',
      'expiry.days.one': 'تُحذف بعد يوم واحد',
      'expiry.days.two': 'تُحذف بعد يومين',
      'expiry.days.few': 'تُحذف بعد {n} أيام',
      'expiry.days.many': 'تُحذف بعد {n} يومًا',
      'expiry.days.other': 'تُحذف بعد {n} يوم',
      'empty.problem.title': 'لا توجد مشاكل مفتوحة',
      'empty.problem.body': 'ستظهر البلاغات الجديدة هنا.',
      'empty.testing.title': 'لا شيء للاختبار',
      'empty.testing.body': 'تنتقل المشاكل التي تم إصلاحها إلى هنا أولًا.',
      'empty.done.title': 'لا شيء منجز بعد',
      'empty.done.body': 'تبقى التذاكر المختبرة هنا لمدة 20 يومًا.',
      'load.failed': 'تعذر تحميل التذاكر',
      'error.schema-not-ready': 'قاعدة بيانات التذاكر قيد التجهيز. أعد المحاولة بعد قليل.',
      'error.no-media': 'تخزين الصور غير متاح حاليًا.',
      'error.text-required': 'اكتب وصفًا قصيرًا قبل النشر.',
      'error.note-required': 'أضف ملاحظة قصيرة عما لا يزال يفشل.',
      'error.text-too-long': 'الوصف طويل جدًا.',
      'error.too-many-images': 'يمكنك إرفاق 6 صور كحد أقصى.',
      'error.image-too-large': 'إحدى الصور أكبر من 10 ميغابايت.',
      'error.images-too-large': 'الصور المختارة كبيرة جدًا مجتمعة.',
      'error.bad-image-type': 'استخدم صور JPEG أو PNG أو WebP أو GIF.',
      'error.invalid-kind': 'اختر نوع تذكرة صالحًا.',
      'error.invalid-area': 'اختر قسمًا صالحًا من المنتج.',
      'error.invalid-subkind': 'اختر نوعًا فرعيًا صالحًا.',
      'error.subkind-kind-mismatch': 'هذا النوع الفرعي لا ينتمي إلى النوع المختار.',
      'error.invalid-money-at-risk': 'اختر إعدادًا صالحًا لخطر المال.',
      'error.wrong-status': 'نُقلت هذه التذكرة بالفعل من جهاز آخر.',
      'error.changed-elsewhere': 'تغيرت هذه التذكرة على جهاز آخر. تم تحديث اللوحة.',
      'error.not-found': 'هذه التذكرة لم تعد موجودة. تم تحديث اللوحة.',
      'error.forbidden': 'الوصول مخصص لمشغّلي Kiwi المسجلين بأسمائهم. سجّل الدخول إلى لوحة المشغّل.',
      'error.generic': 'حدث خطأ ما. أعد المحاولة.',
      'file.tooLarge': '{name} أكبر من 10 ميغابايت.',
      'file.selectedAlt': 'الصورة المختارة {index}',
      'file.followupAlt': 'صورة المتابعة المختارة {index}',
      'file.remove': 'إزالة {name}',
      'file.image': 'الصورة',
      'busy.uploading': 'جارٍ رفع الصور…',
      'busy.publishing': 'جارٍ النشر…',
      'busy.saving': 'جارٍ الحفظ…',
      'busy.copying': 'جارٍ النسخ…',
      'busy.moving': 'جارٍ النقل…',
      'busy.deletingImages': 'جارٍ حذف الصور…',
      'toast.published': 'نُشرت {number}',
      'toast.publishedPending': 'نُشرت {number}. سيتوفر التصنيف بعد تحديث قاعدة البيانات.',
      'toast.sentBack': 'أُعيدت {number} كمشكلة غير محلولة',
      'toast.textCopied': 'نُسخ نص {number}',
      'toast.copyFailed': 'تعذر نسخ النص',
      'toast.imageCopied': 'نُسخت صورة {number}',
      'toast.readyToTest': '{number} جاهزة للاختبار',
      'toast.completed': 'اكتملت {number} وحُذفت الصور',
      'toast.classPending': 'التصنيف بانتظار تحديث قاعدة البيانات',
      'toast.classified': 'صُنفت {number}',
    },
  };
  /* La taxonomie vient de l'API en français et en anglais. L'arabe vit ici,
     par identifiant, pour ne rien changer à la réponse de /api/tickets ; un
     label.ar envoyé un jour par le serveur passerait devant. */
  const TAXONOMY_AR = {
    bug: 'خلل', improvement: 'تحسين', feature: 'ميزة جديدة', question: 'سؤال', unsorted: 'غير مصنفة',
    caisse: 'الصندوق', dashboard: 'لوحة التحكم', serveur: 'تطبيق النادل', cuisine: 'المطبخ',
    printing: 'الطباعة', sync: 'المزامنة', 'reports-money': 'التقارير والمال', 'menu-stock': 'القائمة والمخزون',
    verticals: 'المهن', 'accounts-access': 'الحسابات والصلاحيات', site: 'الموقع العام', tooling: 'أدوات داخلية',
    'cross-product': 'مشترك بين الأقسام',
    'wrong-figures': 'أرقام خاطئة', 'not-syncing': 'لا تتم المزامنة', 'crash-blank': 'توقف أو شاشة فارغة',
    'wrong-behavior': 'سلوك غير صحيح', 'display-layout': 'العرض والتنسيق', 'printing-output': 'ناتج الطباعة',
    performance: 'الأداء', 'security-access': 'الأمان والصلاحيات', 'ux-flow': 'مسار الاستخدام',
    'copy-translation': 'النصوص والترجمة', 'visual-design': 'التصميم المرئي', 'adapt-to-vertical': 'تكييف حسب المهنة',
    'new-module': 'وحدة جديدة', integration: 'تكامل', reporting: 'التقارير', hardware: 'الأجهزة',
  };
  const LANGS = ['fr', 'en', 'ar'];
  function resolveLang() {
    const pick = (value) => {
      const lang = String(value || '').toLowerCase().split(/[-_]/)[0];
      return LANGS.includes(lang) ? lang : '';
    };
    let query = '';
    let saved = '';
    let browser = '';
    try { query = new URLSearchParams(window.location.search).get('lang') || ''; } catch (_) {}
    try { saved = window.localStorage.getItem('kiwiLang') || ''; } catch (_) {}
    try { browser = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (_) {}
    return pick(query) || pick(saved) || pick(browser) || 'fr';
  }
  const LANG = resolveLang();
  const LOCALE = { fr: 'fr-MA', en: 'en-GB', ar: 'ar-MA-u-nu-latn' }[LANG];
  /* Une clé absente retombe sur le français, jamais sur la clé nue. */
  function t(key, vars) {
    const dict = COPY[LANG] || COPY.fr;
    const raw = dict[key] != null ? dict[key] : (COPY.fr[key] != null ? COPY.fr[key] : key);
    return vars ? raw.replace(/\{(\w+)\}/g, (match, name) => (vars[name] != null ? String(vars[name]) : match)) : raw;
  }
  function plural(base, n) {
    let form = 'other';
    try { form = new Intl.PluralRules(LANG).select(n); } catch (_) {}
    const dict = COPY[LANG] || COPY.fr;
    return t(dict[base + '.' + form] != null ? base + '.' + form : base + '.other', { n });
  }
  function applyStaticCopy() {
    const root = document.documentElement;
    root.setAttribute('lang', LANG);
    root.setAttribute('dir', LANG === 'ar' ? 'rtl' : 'ltr');
    document.title = t('doc.title');
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
      String(element.getAttribute('data-i18n-attr')).split(',').forEach((pair) => {
        const [attr, key] = pair.split(':').map((part) => part.trim());
        if (attr && key) element.setAttribute(attr, t(key));
      });
    });
  }
  /* Lu par tools/tickets-i18n-test.mjs : parité des clés et couverture de la taxonomie. */
  window.KiwiTicketsCopy = Object.freeze({ COPY, TAXONOMY_AR, lang: LANG });
  applyStaticCopy();

  function readFilters() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FILTER_KEY) || '{}');
      return {
        kind: typeof saved.kind === 'string' ? saved.kind : '',
        area: typeof saved.area === 'string' ? saved.area : '',
        money: saved.money === true,
      };
    } catch (_) { return { kind: '', area: '', money: false }; }
  }
  const state = {
    tickets: [], files: [], followupFiles: [], followupTicketId: null,
    taxonomy: null, filters: readFilters(),
    loading: true, saving: false, savingFollowup: false, savingClassification: false,
    publishAttempt: null,
  };
  const $ = (id) => document.getElementById(id);
  const board = $('ticketBoard');
  const composer = $('composer');
  const form = $('ticketForm');
  const fileInput = $('ticketImages');
  const followupComposer = $('followupComposer');
  const followupForm = $('followupForm');
  const followupFileInput = $('followupImages');
  const lists = { problem: $('listProblem'), testing: $('listTesting'), done: $('listDone') };
  let toastTimer = 0;
  let previewUrls = [];
  let followupPreviewUrls = [];

  const icons = {
    clock: '<img class="material-icon" src="assets/icons/material/schedule.svg" alt="" aria-hidden="true" />',
    photo: '<img class="material-icon" src="assets/icons/material/photo_frame.svg" alt="" aria-hidden="true" />',
  };

  function saveFilters() {
    try { window.localStorage.setItem(FILTER_KEY, JSON.stringify(state.filters)); } catch (_) {}
  }

  function labelOf(item) {
    if (!item) return '';
    const label = item.label || {};
    return label[LANG] || (LANG === 'ar' ? TAXONOMY_AR[item.id] : '') || label.fr || label.en || item.id;
  }

  function taxonomyItem(group, id) {
    if (!state.taxonomy || !id) return null;
    const items = group === 'subkinds'
      ? Object.values(state.taxonomy.subkinds || {}).flat()
      : (state.taxonomy[group] || []);
    return items.find((item) => item.id === id) || null;
  }

  function replaceSelectOptions(select, items, emptyLabel, selected) {
    select.replaceChildren();
    if (emptyLabel !== null) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = emptyLabel;
      select.append(empty);
    }
    (items || []).forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = labelOf(item);
      select.append(option);
    });
    select.value = selected || '';
  }

  function subkindsFor(kind) {
    return state.taxonomy && state.taxonomy.subkinds
      ? (state.taxonomy.subkinds[kind] || [])
      : [];
  }

  function showToast(message, isError) {
    const toast = $('toast');
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', Boolean(isError));
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date);
    if (sameDay) return t('time.today', { time });
    if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday', { time });
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
  }

  function daysRemaining(timestamp) {
    return Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000));
  }

  function actionButton(ticket) {
    if (ticket.status === 'done') return null;
    const button = make('button', 'move-button' + (ticket.status === 'testing' ? ' move-testing' : ''));
    button.type = 'button';
    button.dataset.action = ticket.status === 'problem' ? 'fixed' : 'tested';
    button.dataset.id = String(ticket.id);
    const label = t(ticket.status === 'problem' ? 'action.fixed' : 'action.tested');
    button.setAttribute('aria-label', t(ticket.status === 'problem' ? 'action.fixedAria' : 'action.testedAria', { number: ticket.number }));
    button.append(document.createTextNode(label));
    return button;
  }

  function actionArea(ticket) {
    if (ticket.status === 'done') return null;
    const actions = make('div', 'ticket-actions' + (ticket.status === 'testing' ? ' has-failed-action' : ''));
    if (ticket.status === 'testing') {
      const failed = make('button', 'failed-test-button', t('action.failed'));
      failed.type = 'button';
      failed.dataset.action = 'test-failed';
      failed.dataset.id = String(ticket.id);
      failed.setAttribute('aria-label', t('action.failedAria', { number: ticket.number }));
      actions.append(failed);
    }
    actions.append(actionButton(ticket));
    return actions;
  }

  function copyButton(kind, ticket, image) {
    const button = make('button', 'copy-button');
    button.type = 'button';
    button.dataset.action = kind === 'text' ? 'copy-text' : 'copy-image';
    button.dataset.id = String(ticket.id);
    if (image) button.dataset.url = image.url;
    button.append(document.createTextNode(t(kind === 'text' ? 'copy.text' : 'copy.image')));
    button.setAttribute('aria-label', t(kind === 'text' ? 'copy.textAria' : 'copy.imageAria', { number: ticket.number }));
    return button;
  }

  function imageGallery(ticket, images, altKey) {
    if (!images || !images.length) return null;
    const gallery = make('div', 'ticket-gallery');
    gallery.classList.toggle('is-single', images.length === 1);
    images.forEach((image, index) => {
      const figure = make('figure', 'ticket-photo');
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = t(altKey || 'image.alt', { number: ticket.number, index: index + 1 });
      img.loading = 'lazy';
      img.decoding = 'async';
      figure.append(img, copyButton('image', ticket, image));
      gallery.append(figure);
    });
    return gallery;
  }

  function followupHistory(ticket) {
    if (!ticket.followups || !ticket.followups.length) return null;
    const history = make('div', 'ticket-followups');
    ticket.followups.forEach((followup, index) => {
      const item = make('section', 'ticket-followup');
      const head = make('div', 'ticket-followup-head');
      head.append(make('strong', '', `${t('action.failed')}${ticket.followups.length > 1 ? ` · ${index + 1}` : ''}`));
      head.append(make('span', '', formatTime(followup.createdAt)));
      item.append(head, make('p', '', followup.body));
      const gallery = imageGallery(ticket, followup.images, 'image.followupAlt');
      if (gallery) item.append(gallery);
      history.append(item);
    });
    return history;
  }

  function classificationSummary(ticket) {
    const wrap = make('div', 'classification-summary');
    const chips = make('div', 'classification-chips');
    const kind = taxonomyItem('kinds', ticket.kind || 'unsorted');
    chips.append(make('span', 'classification-chip kind-chip kind-' + (ticket.kind || 'unsorted'), labelOf(kind) || t('chip.unsorted')));
    const area = taxonomyItem('areas', ticket.area);
    if (area) chips.append(make('span', 'classification-chip area-chip', labelOf(area)));
    const subkind = taxonomyItem('subkinds', ticket.subkind);
    if (subkind) chips.append(make('span', 'classification-chip subkind-chip', labelOf(subkind)));
    if (ticket.moneyAtRisk) chips.append(make('span', 'classification-chip money-chip', t('money.label')));

    const edit = make('button', 'classify-button');
    edit.type = 'button';
    edit.dataset.action = 'toggle-classification';
    edit.dataset.id = String(ticket.id);
    edit.setAttribute('aria-expanded', 'false');
    edit.setAttribute('aria-label', t('classify.aria', { number: ticket.number }));
    const icon = document.createElement('img');
    icon.className = 'material-icon';
    icon.src = 'assets/icons/material/category.svg';
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    edit.append(icon, document.createTextNode(t('classify')));
    wrap.append(chips, edit);
    return wrap;
  }

  function classificationEditor(ticket) {
    const editor = make('form', 'classification-editor');
    editor.hidden = true;
    editor.dataset.classificationForm = String(ticket.id);

    const kindLabel = make('label', '', t('field.type'));
    const kind = document.createElement('select');
    kind.name = 'kind';
    kind.dataset.classificationKind = '';
    replaceSelectOptions(kind, state.taxonomy.kinds, null, ticket.kind || 'unsorted');
    kindLabel.append(kind);

    const areaLabel = make('label', '', t('field.area'));
    const area = document.createElement('select');
    area.name = 'area';
    replaceSelectOptions(area, state.taxonomy.areas, t('area.none'), ticket.area);
    areaLabel.append(area);

    const subkindLabel = make('label', '', t('field.subkind'));
    subkindLabel.dataset.classificationSubkindField = '';
    const subkind = document.createElement('select');
    subkind.name = 'subkind';
    subkindLabel.append(subkind);
    const syncSubkind = (selected) => {
      const items = subkindsFor(kind.value);
      replaceSelectOptions(subkind, items, t('subkind.none'), items.some((item) => item.id === selected) ? selected : '');
      subkindLabel.hidden = items.length === 0;
    };
    syncSubkind(ticket.subkind);
    kind.addEventListener('change', () => syncSubkind(''));

    const money = make('label', 'editor-money-toggle');
    const moneyInput = document.createElement('input');
    moneyInput.type = 'checkbox';
    moneyInput.name = 'money_at_risk';
    moneyInput.checked = Boolean(ticket.moneyAtRisk);
    money.append(moneyInput, document.createTextNode(t('money.label')));

    const save = make('button', 'classification-save', t('class.save'));
    save.type = 'submit';
    editor.append(kindLabel, areaLabel, subkindLabel, money, save);
    return editor;
  }

  function ticketCard(ticket) {
    const card = make('article', 'ticket-card' + (ticket.status === 'done' ? ' ticket-done' : ''));
    card.dataset.ticketId = String(ticket.id);
    const meta = make('div', 'ticket-meta');
    meta.append(make('span', 'ticket-number', ticket.number));
    meta.append(make('span', '', formatTime(ticket.createdAt)));
    card.append(meta, classificationSummary(ticket), classificationEditor(ticket));

    if (ticket.status === 'done') {
      card.append(make('p', '', ticket.body));
      const history = followupHistory(ticket);
      if (history) card.append(history);
      const expiry = make('div', 'expiry');
      expiry.insertAdjacentHTML('afterbegin', icons.clock);
      const days = daysRemaining(ticket.expiresAt);
      expiry.append(document.createTextNode(days === 0 ? t('expiry.today') : plural('expiry.days', days)));
      card.append(expiry);
      return card;
    }

    const copyRow = make('div', 'copy-row');
    copyRow.append(make('p', '', ticket.body));
    copyRow.append(copyButton('text', ticket));
    card.append(copyRow);

    const gallery = imageGallery(ticket, ticket.images, 'image.alt');
    if (gallery) card.append(gallery);
    const history = followupHistory(ticket);
    if (history) card.append(history);
    card.append(actionArea(ticket));
    return card;
  }

  function emptyState(status) {
    const empty = make('div', 'empty-state');
    empty.insertAdjacentHTML('afterbegin', status === 'done' ? icons.clock : icons.photo);
    empty.append(make('strong', '', t(`empty.${status}.title`)), make('span', '', t(`empty.${status}.body`)));
    return empty;
  }

  function filterButton(label, dimension, value, active) {
    const button = make('button', 'filter-pill' + (active ? ' on' : ''), label);
    button.type = 'button';
    button.dataset.lensItem = '';
    button.dataset.filterDimension = dimension;
    button.dataset.filterValue = value;
    button.setAttribute('aria-pressed', String(active));
    return button;
  }

  function renderFilters() {
    if (!state.taxonomy) return;
    const kindWrap = $('kindFilters');
    const areaWrap = $('areaFilters');
    const moneyWrap = $('moneyFilters');
    if (!kindWrap.dataset.ready) {
      kindWrap.append(filterButton(t('filter.all'), 'kind', '', !state.filters.kind));
      state.taxonomy.kinds.forEach((item) => {
        kindWrap.append(filterButton(labelOf(item), 'kind', item.id, state.filters.kind === item.id));
      });
      kindWrap.dataset.ready = '1';
    }
    if (!areaWrap.dataset.ready) {
      areaWrap.append(filterButton(t('filter.all'), 'area', '', !state.filters.area));
      state.taxonomy.areas.forEach((item) => {
        areaWrap.append(filterButton(labelOf(item), 'area', item.id, state.filters.area === item.id));
      });
      areaWrap.dataset.ready = '1';
    }
    if (!moneyWrap.dataset.ready) {
      moneyWrap.append(
        filterButton(t('filter.all'), 'money', '', !state.filters.money),
        filterButton(t('money.label'), 'money', '1', state.filters.money),
      );
      moneyWrap.dataset.ready = '1';
    }
    document.querySelectorAll('[data-filter-dimension]').forEach((button) => {
      const dimension = button.dataset.filterDimension;
      const value = button.dataset.filterValue || '';
      const active = dimension === 'money'
        ? state.filters.money === (value === '1')
        : state.filters[dimension] === value;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('resetFilters').disabled = !state.filters.kind && !state.filters.area && !state.filters.money;
    if (window.KiwiLens) window.KiwiLens.rescan();
  }

  function ticketMatchesFilters(ticket) {
    if (state.filters.kind && ticket.kind !== state.filters.kind) return false;
    if (state.filters.area && ticket.area !== state.filters.area) return false;
    if (state.filters.money && !ticket.moneyAtRisk) return false;
    return true;
  }

  function render() {
    ['problem', 'testing', 'done'].forEach((status) => {
      const tickets = state.tickets
        .filter((ticket) => ticket.status === status && ticketMatchesFilters(ticket))
        .sort((a, b) => Number(b.moneyAtRisk) - Number(a.moneyAtRisk) || b.id - a.id);
      lists[status].replaceChildren();
      if (!tickets.length) lists[status].append(emptyState(status));
      else tickets.forEach((ticket) => lists[status].append(ticketCard(ticket)));
      const suffix = status === 'problem' ? 'Problem' : status === 'testing' ? 'Testing' : 'Done';
      $('count' + suffix).textContent = String(tickets.length);
      $('tabCount' + suffix).textContent = String(tickets.length);
    });
    renderFilters();
  }

  function renderLoading() {
    Object.values(lists).forEach((list) => {
      const loading = make('div', 'loading-card');
      loading.innerHTML = '<span></span><span></span><span></span>';
      list.replaceChildren(loading);
    });
  }

  function friendlyError(code) {
    /* Les codes de l'API (error.<code>) ont chacun leur phrase ; un code
       inconnu reçoit le message générique, jamais le code brut. */
    const key = 'error.' + code;
    return code && Object.prototype.hasOwnProperty.call(COPY.fr, key) ? t(key) : t('error.generic');
  }

  function syncComposerSubkinds(selected) {
    const kind = $('ticketKind').value || 'unsorted';
    const items = subkindsFor(kind);
    replaceSelectOptions($('ticketSubkind'), items, t('subkind.none'), selected || '');
    $('ticketSubkindField').hidden = items.length === 0;
  }

  function configureComposerClassification() {
    replaceSelectOptions($('ticketKind'), state.taxonomy.kinds, null, 'unsorted');
    replaceSelectOptions($('ticketArea'), state.taxonomy.areas, t('area.none'), '');
    syncComposerSubkinds('');
  }

  async function loadTickets(options) {
    if (!options || !options.quiet) renderLoading();
    try {
      const response = await (await import('./request-deadline.mjs')).deadlineFetch(API, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(data.error || 'read-failed'), { code: data.error });
      if (!data.taxonomy || !Array.isArray(data.taxonomy.kinds) || !Array.isArray(data.taxonomy.areas)) {
        throw Object.assign(new Error('taxonomy-missing'), { code: 'taxonomy-missing' });
      }
      const taxonomyChanged = !state.taxonomy || state.taxonomy.version !== data.taxonomy.version;
      state.taxonomy = data.taxonomy;
      if (state.filters.kind && !state.taxonomy.kinds.some((item) => item.id === state.filters.kind)) state.filters.kind = '';
      if (state.filters.area && !state.taxonomy.areas.some((item) => item.id === state.filters.area)) state.filters.area = '';
      state.tickets = Array.isArray(data.tickets) ? data.tickets.map((ticket) => ({
        ...ticket,
        kind: ticket.kind || 'unsorted',
        area: ticket.area || null,
        subkind: ticket.subkind || null,
        moneyAtRisk: Boolean(ticket.moneyAtRisk),
      })) : [];
      if (taxonomyChanged) configureComposerClassification();
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      if (options && options.quiet) return;
      Object.values(lists).forEach((list) => {
        const failed = make('div', 'error-state');
        failed.append(make('strong', '', t('load.failed')), make('span', '', friendlyError(error.code)));
        const retry = make('button', '', t('common.retry'));
        retry.type = 'button';
        retry.addEventListener('click', () => loadTickets());
        failed.append(retry);
        list.replaceChildren(failed);
      });
    }
  }

  function openComposer() {
    $('formError').textContent = '';
    composer.showModal();
    window.setTimeout(() => $('ticketBody').focus(), 80);
  }

  function resetComposer() {
    form.reset();
    $('ticketKind').value = 'unsorted';
    $('ticketArea').value = '';
    $('ticketMoneyRisk').checked = false;
    syncComposerSubkinds('');
    state.files = [];
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    $('selectedImages').replaceChildren();
    $('imageCounter').textContent = '0 / 6';
    $('formError').textContent = '';
  }

  function closeComposer() {
    if (state.saving) return;
    composer.close();
    resetComposer();
  }

  function openFollowup(ticket) {
    state.followupTicketId = ticket.id;
    $('followupTicketNumber').textContent = ticket.number;
    $('followupError').textContent = '';
    followupComposer.showModal();
    window.setTimeout(() => $('followupBody').focus(), 80);
  }

  function resetFollowup() {
    followupForm.reset();
    state.followupFiles = [];
    state.followupTicketId = null;
    followupPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    followupPreviewUrls = [];
    $('followupSelectedImages').replaceChildren();
    $('followupImageCounter').textContent = '0 / 6';
    $('followupError').textContent = '';
  }

  function closeFollowup() {
    if (state.savingFollowup) return;
    followupComposer.close();
    resetFollowup();
  }

  function fileKey(file) {
    return [file.name, file.size, file.lastModified].join(':');
  }

  function renderSelectedImages() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    const container = $('selectedImages');
    container.replaceChildren();
    state.files.forEach((file, index) => {
      const item = make('div', 'selected-image');
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      img.src = url;
      img.alt = file.name || t('file.selectedAlt', { index: index + 1 });
      const remove = make('button');
      remove.type = 'button';
      remove.dataset.removeFile = String(index);
      remove.setAttribute('aria-label', t('file.remove', { name: file.name || t('file.image') }));
      remove.textContent = '×';
      item.append(img, remove);
      container.append(item);
    });
    $('imageCounter').textContent = `${state.files.length} / ${MAX_IMAGES}`;
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const accepted = [];
    let error = '';
    for (const file of incoming) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        error = t('error.bad-image-type');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error = file.name ? t('file.tooLarge', { name: file.name }) : t('error.image-too-large');
        continue;
      }
      if (!state.files.some((current) => fileKey(current) === fileKey(file))) accepted.push(file);
    }
    const before = state.files.length;
    state.files = state.files.concat(accepted).slice(0, MAX_IMAGES);
    if (incoming.length + before > MAX_IMAGES) error = t('error.too-many-images');
    $('formError').textContent = error;
    fileInput.value = '';
    renderSelectedImages();
  }

  function renderFollowupImages() {
    followupPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    followupPreviewUrls = [];
    const container = $('followupSelectedImages');
    container.replaceChildren();
    state.followupFiles.forEach((file, index) => {
      const item = make('div', 'selected-image');
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      followupPreviewUrls.push(url);
      img.src = url;
      img.alt = file.name || t('file.followupAlt', { index: index + 1 });
      const remove = make('button');
      remove.type = 'button';
      remove.dataset.removeFollowupFile = String(index);
      remove.setAttribute('aria-label', t('file.remove', { name: file.name || t('file.image') }));
      remove.textContent = '×';
      item.append(img, remove);
      container.append(item);
    });
    $('followupImageCounter').textContent = `${state.followupFiles.length} / ${MAX_IMAGES}`;
  }

  function addFollowupFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const accepted = [];
    let error = '';
    for (const file of incoming) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        error = t('error.bad-image-type');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error = file.name ? t('file.tooLarge', { name: file.name }) : t('error.image-too-large');
        continue;
      }
      if (!state.followupFiles.some((current) => fileKey(current) === fileKey(file))) accepted.push(file);
    }
    const before = state.followupFiles.length;
    state.followupFiles = state.followupFiles.concat(accepted).slice(0, MAX_IMAGES);
    if (incoming.length + before > MAX_IMAGES) error = t('error.too-many-images');
    $('followupError').textContent = error;
    followupFileInput.value = '';
    renderFollowupImages();
  }

  function newIdempotencyKey() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  async function publish(event) {
    event.preventDefault();
    if (state.saving) return;
    const text = $('ticketBody').value.trim();
    if (!text) {
      $('formError').textContent = t('error.text-required');
      $('ticketBody').focus();
      return;
    }
    state.saving = true;
    const button = $('publishTicket');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = t(state.files.length ? 'busy.uploading' : 'busy.publishing');
    $('formError').textContent = '';
    const data = new FormData();
    data.append('body', text);
    data.append('kind', $('ticketKind').value || 'unsorted');
    if ($('ticketArea').value) data.append('area', $('ticketArea').value);
    if (!$('ticketSubkindField').hidden && $('ticketSubkind').value) data.append('subkind', $('ticketSubkind').value);
    data.append('money_at_risk', $('ticketMoneyRisk').checked ? '1' : '0');
    state.files.forEach((file) => data.append('images', file, file.name));
    /* Une clé par envoi : le même contenu renvoyé après une réponse perdue
       retrouve le premier ticket au lieu d'en créer un second. Un contenu
       modifié reçoit une clé neuve. */
    const fingerprint = [text, $('ticketKind').value, $('ticketArea').value, $('ticketSubkind').value,
      $('ticketMoneyRisk').checked, ...state.files.map((file) => file.name + ':' + file.size)].join('\u0001');
    if (!state.publishAttempt || state.publishAttempt.fingerprint !== fingerprint) {
      state.publishAttempt = { fingerprint, key: newIdempotencyKey() };
    }
    data.append('idempotency_key', state.publishAttempt.key);
    try {
      const response = await (await import('./request-deadline.mjs')).deadlineFetch(API, { method: 'POST', body: data }, 60000);
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'publish-failed'), { code: result.error });
      composer.close();
      resetComposer();
      state.publishAttempt = null;
      showToast(t(result.classificationStored === false ? 'toast.publishedPending' : 'toast.published', { number: result.number }));
      await loadTickets({ quiet: true });
      activateTab('problem');
    } catch (error) {
      $('formError').textContent = friendlyError(error.code);
    } finally {
      state.saving = false;
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }

  async function publishFollowup(event) {
    event.preventDefault();
    if (state.savingFollowup) return;
    const ticket = state.tickets.find((item) => item.id === state.followupTicketId);
    if (!ticket) {
      closeFollowup();
      await loadTickets({ quiet: true });
      return;
    }
    const note = $('followupBody').value.trim();
    if (!note) {
      $('followupError').textContent = t('error.note-required');
      $('followupBody').focus();
      return;
    }
    state.savingFollowup = true;
    const button = $('publishFollowup');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = t(state.followupFiles.length ? 'busy.uploading' : 'busy.saving');
    $('followupError').textContent = '';
    const data = new FormData();
    data.append('action', 'failed');
    data.append('note', note);
    state.followupFiles.forEach((file) => data.append('images', file, file.name));
    try {
      const response = await (await import('./request-deadline.mjs')).deadlineFetch(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json' },
        body: data,
      }, 60000);
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      followupComposer.close();
      resetFollowup();
      showToast(t('toast.sentBack', { number: ticket.number }));
      await loadTickets({ quiet: true });
      activateTab('problem');
    } catch (error) {
      $('followupError').textContent = friendlyError(error.code);
      if (error.code === 'wrong-status' || error.code === 'changed-elsewhere' || error.code === 'not-found') {
        await loadTickets({ quiet: true });
      }
    } finally {
      state.savingFollowup = false;
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }

  function fallbackCopyText(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  }

  async function copyText(ticket) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(ticket.body);
      else if (!fallbackCopyText(ticket.body)) throw new Error('copy-blocked');
      showToast(t('toast.textCopied', { number: ticket.number }));
    } catch (_) {
      showToast(t('toast.copyFailed'), true);
    }
  }

  function blobToPng(blob) {
    if (blob.type === 'image/png') return Promise.resolve(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => png ? resolve(png) : reject(new Error('conversion-failed')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')); };
      img.src = url;
    });
  }

  function showImageCopyFallback(url) {
    $('copyFallbackImage').src = url;
    $('imageCopyFallback').showModal();
  }

  async function copyImage(url, ticket, button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = t('busy.copying');
    try {
      if (!navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem || !window.isSecureContext) throw new Error('clipboard-unavailable');
      const png = fetch(url, { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error('image-unavailable');
        return response.blob();
      }).then(blobToPng);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      showToast(t('toast.imageCopied', { number: ticket.number }));
    } catch (_) {
      showImageCopyFallback(url);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  async function moveTicket(ticket, action, button) {
    button.disabled = true;
    const original = button.innerHTML;
    button.textContent = t(action === 'fixed' ? 'busy.moving' : 'busy.deletingImages');
    try {
      const response = await (await import('./request-deadline.mjs')).deadlineFetch(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      showToast(t(action === 'fixed' ? 'toast.readyToTest' : 'toast.completed', { number: ticket.number }));
      await loadTickets({ quiet: true });
    } catch (error) {
      showToast(friendlyError(error.code), true);
      await loadTickets({ quiet: true });
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  function toggleClassification(ticket, button) {
    const card = button.closest('.ticket-card');
    const editor = card && card.querySelector('[data-classification-form]');
    if (!editor) return;
    const opening = editor.hidden;
    editor.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) editor.querySelector('select').focus();
  }

  async function saveClassification(event) {
    event.preventDefault();
    if (state.savingClassification) return;
    const editor = event.target.closest('[data-classification-form]');
    if (!editor) return;
    const ticket = state.tickets.find((item) => item.id === Number(editor.dataset.classificationForm));
    if (!ticket) return;
    const data = new FormData(editor);
    const button = editor.querySelector('.classification-save');
    state.savingClassification = true;
    button.disabled = true;
    const oldLabel = button.textContent;
    button.textContent = t('busy.saving');
    try {
      const response = await (await import('./request-deadline.mjs')).deadlineFetch(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          action: 'classify',
          kind: String(data.get('kind') || 'unsorted'),
          area: String(data.get('area') || ''),
          subkind: String(data.get('subkind') || ''),
          money_at_risk: data.get('money_at_risk') === 'on',
        }),
      });
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      if (result.classificationStored === false) {
        showToast(t('toast.classPending'), true);
      } else {
        showToast(t('toast.classified', { number: ticket.number }));
      }
      await loadTickets({ quiet: true });
    } catch (error) {
      showToast(friendlyError(error.code), true);
    } finally {
      state.savingClassification = false;
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = oldLabel;
      }
    }
  }

  function applyFilter(button) {
    const dimension = button.dataset.filterDimension;
    const value = button.dataset.filterValue || '';
    if (dimension === 'money') state.filters.money = value === '1';
    else if (dimension === 'kind' || dimension === 'area') state.filters[dimension] = value;
    saveFilters();
    render();
  }

  function activateTab(status) {
    board.dataset.mobileStatus = status;
    document.querySelectorAll('.mobile-tab').forEach((item) => {
      const active = item.dataset.status === status;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  }

  $('openComposer').addEventListener('click', openComposer);
  $('closeComposer').addEventListener('click', closeComposer);
  $('cancelComposer').addEventListener('click', closeComposer);
  form.addEventListener('submit', publish);
  $('ticketKind').addEventListener('change', () => syncComposerSubkinds(''));
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  $('selectedImages').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-file]');
    if (!button) return;
    state.files.splice(Number(button.dataset.removeFile), 1);
    renderSelectedImages();
  });
  $('closeFollowup').addEventListener('click', closeFollowup);
  $('cancelFollowup').addEventListener('click', closeFollowup);
  followupForm.addEventListener('submit', publishFollowup);
  followupFileInput.addEventListener('change', () => addFollowupFiles(followupFileInput.files));
  $('followupSelectedImages').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-followup-file]');
    if (!button) return;
    state.followupFiles.splice(Number(button.dataset.removeFollowupFile), 1);
    renderFollowupImages();
  });
  $('mobileTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-status]');
    if (tab) activateTab(tab.dataset.status);
  });
  document.querySelector('.ticket-filters').addEventListener('click', (event) => {
    const filter = event.target.closest('[data-filter-dimension]');
    if (filter) applyFilter(filter);
  });
  $('resetFilters').addEventListener('click', () => {
    state.filters = { kind: '', area: '', money: false };
    saveFilters();
    render();
  });
  board.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const ticket = state.tickets.find((item) => item.id === Number(button.dataset.id));
    if (!ticket) return;
    if (button.dataset.action === 'copy-text') copyText(ticket);
    else if (button.dataset.action === 'copy-image') copyImage(button.dataset.url, ticket, button);
    else if (button.dataset.action === 'test-failed') openFollowup(ticket);
    else if (button.dataset.action === 'toggle-classification') toggleClassification(ticket, button);
    else moveTicket(ticket, button.dataset.action, button);
  });
  board.addEventListener('submit', saveClassification);
  composer.addEventListener('click', (event) => { if (event.target === composer) closeComposer(); });
  followupComposer.addEventListener('click', (event) => { if (event.target === followupComposer) closeFollowup(); });
  $('closeImageFallback').addEventListener('click', () => $('imageCopyFallback').close());
  $('imageCopyFallback').addEventListener('click', (event) => { if (event.target === $('imageCopyFallback')) $('imageCopyFallback').close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadTickets({ quiet: true }); });
  window.setInterval(() => { if (!document.hidden) loadTickets({ quiet: true }); }, 30000);
  loadTickets();
})();
