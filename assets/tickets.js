import { createData, createTicketState } from './tickets-data.js?v=3';
import { createBoard } from './tickets-board.js?v=7';
import { createComposer } from './tickets-composer.js?v=5';
import { createThread } from './tickets-thread.js?v=3';
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
      'filter.saveFailed': 'Filtres non enregistrés sur cet appareil. Ils seront perdus au rechargement.',
      'draft.failed': 'Brouillon non sauvegardé sur cet appareil. Gardez cette page ouverte.',
      'draft.policy': 'Brouillon local : texte et 6 images maximum, 10 Mo chacune, conservés sur cet appareil jusqu’à l’envoi.',
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
      'filter.saveFailed': 'Filters not saved on this device. They will be lost on reload.',
      'draft.failed': 'Draft not saved on this device. Keep this page open.',
      'draft.policy': 'Local draft: text and up to 6 images, 10 MB each, kept on this device until sent.',
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
      'filter.saveFailed': 'لم تُحفظ المرشحات على هذا الجهاز. ستُفقد عند إعادة التحميل.',
      'draft.failed': 'لم يتم حفظ المسودة على هذا الجهاز. أبقِ هذه الصفحة مفتوحة.',
      'draft.policy': 'مسودة محلية: النص وحتى 6 صور، 10 ميغابايت لكل صورة، محفوظة على هذا الجهاز حتى الإرسال.',
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
  const ticketState = createTicketState({ readFilters });
  const state = ticketState.view();
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

  const icons = {
    clock: '<img class="material-icon" src="assets/icons/material/schedule.svg" alt="" aria-hidden="true" />',
    photo: '<img class="material-icon" src="assets/icons/material/photo_frame.svg" alt="" aria-hidden="true" />',
  };

  function saveFilters(...args) { return boardPart.saveFilters(...args); }

  function labelOf(...args) { return boardPart.labelOf(...args); }

  function taxonomyItem(...args) { return boardPart.taxonomyItem(...args); }

  function replaceSelectOptions(...args) { return boardPart.replaceSelectOptions(...args); }

  function subkindsFor(...args) { return boardPart.subkindsFor(...args); }

  function showToast(message, isError) {
    const toast = $('toast');
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', Boolean(isError));
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function make(...args) { return boardPart.make(...args); }

  function formatTime(...args) { return boardPart.formatTime(...args); }

  function daysRemaining(...args) { return boardPart.daysRemaining(...args); }

  function actionButton(...args) { return boardPart.actionButton(...args); }

  function actionArea(...args) { return boardPart.actionArea(...args); }

  function copyButton(...args) { return boardPart.copyButton(...args); }

  function imageGallery(...args) { return boardPart.imageGallery(...args); }

  function followupHistory(...args) { return threadPart.followupHistory(...args); }

  function classificationSummary(...args) { return boardPart.classificationSummary(...args); }

  function classificationEditor(...args) { return boardPart.classificationEditor(...args); }

  function ticketCard(...args) { return boardPart.ticketCard(...args); }

  function emptyState(...args) { return boardPart.emptyState(...args); }

  function filterButton(...args) { return boardPart.filterButton(...args); }

  function renderFilters(...args) { return boardPart.renderFilters(...args); }

  function ticketMatchesFilters(...args) { return boardPart.ticketMatchesFilters(...args); }

  function render(...args) { return boardPart.render(...args); }

  function renderLoading(...args) { return boardPart.renderLoading(...args); }

  function friendlyError(code) {
    /* Les codes de l'API (error.<code>) ont chacun leur phrase ; un code
       inconnu reçoit le message générique, jamais le code brut. */
    const key = 'error.' + code;
    return code && Object.prototype.hasOwnProperty.call(COPY.fr, key) ? t(key) : t('error.generic');
  }

  function syncComposerSubkinds(...args) { return composerPart.syncComposerSubkinds(...args); }

  function configureComposerClassification(...args) { return composerPart.configureComposerClassification(...args); }

  function loadTickets(...args) { return dataPart.loadTickets(...args); }

  const draftController = import('./tickets-draft.mjs').then(({composerDraft}) => composerDraft({
    $, state, composer, syncComposerSubkinds, renderSelectedImages, resetComposer, t,
  })).catch(() => ({ store: null, saveDraft() { $('formError').textContent = t('draft.failed'); }, restoreDraft() { $('formError').textContent = t('draft.failed'); } }));
  /* The draft logic lives in tickets-draft.mjs; these are its two entry points here. */
  const draft = { save: () => draftController.then((c) => c.saveDraft()), restore: (scope) => draftController.then((c) => c.restoreDraft(scope)) };

  function openComposer(...args) { return composerPart.openComposer(...args); }

  function resetComposer(...args) { return composerPart.resetComposer(...args); }

  function closeComposer(...args) { return composerPart.closeComposer(...args); }

  function openFollowup(...args) { return threadPart.openFollowup(...args); }

  function resetFollowup(...args) { return threadPart.resetFollowup(...args); }

  function closeFollowup(...args) { return threadPart.closeFollowup(...args); }

  function fileKey(...args) { return composerPart.fileKey(...args); }

  function renderSelectedImages(...args) { return composerPart.renderSelectedImages(...args); }

  function addFiles(...args) { return composerPart.addFiles(...args); }

  function renderFollowupImages(...args) { return threadPart.renderFollowupImages(...args); }

  function addFollowupFiles(...args) { return threadPart.addFollowupFiles(...args); }

  function newIdempotencyKey(...args) { return dataPart.newIdempotencyKey(...args); }

  function publish(...args) { return dataPart.publish(...args); }

  function publishFollowup(...args) { return dataPart.publishFollowup(...args); }

  function fallbackCopyText(...args) { return composerPart.fallbackCopyText(...args); }

  function copyText(...args) { return composerPart.copyText(...args); }

  function blobToPng(...args) { return composerPart.blobToPng(...args); }

  function showImageCopyFallback(...args) { return composerPart.showImageCopyFallback(...args); }

  function copyImage(...args) { return composerPart.copyImage(...args); }

  function moveTicket(...args) { return dataPart.moveTicket(...args); }

  function toggleClassification(...args) { return boardPart.toggleClassification(...args); }

  function saveClassification(...args) { return dataPart.saveClassification(...args); }

  function applyFilter(...args) { return boardPart.applyFilter(...args); }

  function activateTab(...args) { return boardPart.activateTab(...args); }

  const dataPart = createData({ $, API, activateTab, closeFollowup, composer, configureComposerClassification, draft, draftController, followupComposer, friendlyError, lists, make, render, renderLoading, resetComposer, resetFollowup, showToast, state, t });
  const boardPart = createBoard({ $, FILTER_KEY, LANG, LOCALE, TAXONOMY_AR, board, followupHistory, icons, lists, plural, state, t });
  const composerPart = createComposer({ $, MAX_IMAGES, MAX_IMAGE_BYTES, composer, draft, draftController, fileInput, form, make, replaceSelectOptions, showToast, state, subkindsFor, t });
  const threadPart = createThread({ $, MAX_IMAGES, MAX_IMAGE_BYTES, fileKey, followupComposer, followupFileInput, followupForm, formatTime, imageGallery, make, state, t });

  $('openComposer').addEventListener('click', openComposer);
  $('closeComposer').addEventListener('click', closeComposer);
  $('cancelComposer').addEventListener('click', closeComposer);
  form.addEventListener('submit', publish);
  form.addEventListener('input', draft.save);
  form.addEventListener('change', draft.save);
  composer.addEventListener('cancel', draft.save);
  $('ticketKind').addEventListener('change', () => syncComposerSubkinds(''));
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  $('selectedImages').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-file]');
    if (!button) return;
    state.files.splice(Number(button.dataset.removeFile), 1);
    renderSelectedImages();
    draft.save();
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
