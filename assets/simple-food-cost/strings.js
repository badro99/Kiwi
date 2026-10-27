/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · COÛT SIMPLE — l'onglet « Coût simple » d'Analyse du menu
 * ---------------------------------------------------------------------------
 * Une calculatrice de coût de revient : prix d'achat d'un lot, quantité
 * utilisée, rendement, emballages, portions. Elle ne touche jamais au stock :
 * rien n'est déduit, rien n'est réservé, aucune quantité en réserve n'existe
 * ici. Les fiches vivent dans leur propre stockage (functions/api/foodcost.js),
 * lisible par le propriétaire et les opérateurs nommés seulement.
 *
 * Règles de calcul (compute) :
 *   · un champ vide est INCONNU. Une ligne inconnue rend la fiche incomplète :
 *     le coût total n'est pas affiché comme un chiffre, seulement « au moins X »
 *     pour ce qui est connu. Jamais 0 à la place d'un inconnu.
 *   · coût d'une ligne = prix du lot ÷ quantité du lot × quantité utilisée
 *     (convertie dans l'unité du lot) ÷ rendement. Unités incompatibles
 *     (500 g d'un produit acheté à la bouteille) : inconnu, et dit.
 *   · coût matière en % du prix de vente HORS TVA quand la TVA est incluse
 *     dans le prix de la carte (décision du 2026-10-11).
 *   · un prix d'achat daté de plus de 90 jours est signalé « ancien ».
 *   · la fiche garde le prix de vente et la TVA qu'elle avait à
 *     l'enregistrement : une version passée ne bouge pas quand la carte change.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KiwiSimpleFoodCost) return;

  const STALE_DAYS = 90;
  const T = {
    fr: {
      tab: 'Coût simple',
      title: 'Coût simple',
      sub: 'Ce que coûte un plat à partir de vos prix d’achat. Une calculatrice : rien ne bouge dans le stock.',
      newSheet: 'Nouvelle fiche', exportAll: 'Exporter les fiches (CSV)', showArchived: 'Voir les archivées', hideArchived: 'Masquer les archivées',
      sheets: 'Fiches', templates: 'Modèles', useTemplate: 'Utiliser ce modèle', open: 'Ouvrir',
      colName: 'Fiche', colPortion: 'Coût par portion', colPct: 'Coût matière', colStatus: 'État', colUpdated: 'Modifiée',
      stOk: 'Complète', stIncomplete: 'Incomplète', stStale: 'Prix anciens', stEmpty: 'Sans ligne', archived: 'Archivée',
      atLeast: 'au moins {amount}', unknown: 'Inconnu',
      loading: 'Chargement des fiches…', loadError: 'Les fiches n’ont pas pu être lues. Rien n’a été modifié.', retry: 'Réessayer',
      forbidden: 'Réservé au propriétaire du magasin ou à un opérateur Kiwi.',
      offline: 'Hors ligne : vous pouvez calculer, l’enregistrement attendra la connexion.',
      restored: 'Calcul non enregistré retrouvé sur cet appareil. Enregistrez-le pour le garder.',
      readOnly: 'Option désactivée pour ce magasin : les fiches restent lisibles, rien n’a été effacé.',
      empty: 'Aucune fiche pour l’instant', emptyDesc: 'Créez une fiche pour un plat : prix d’achat, quantités utilisées, emballages. Le coût par portion se calcule pendant la saisie.',
      back: 'Toutes les fiches', name: 'Nom de la fiche', kindTemplate: 'Modèle',
      menuItem: 'Plat de la carte', none: 'Aucun', sellingPrice: 'Prix de vente', vatIncluded: 'TVA incluse dans le prix', vatRate: 'Taux de TVA (%)',
      portions: 'Portions produites', target: 'Objectif de coût matière (%)', note: 'Note',
      menuPriceNow: 'Prix actuel de la carte : {amount}', usePrice: 'Reprendre ce prix',
      lines: 'Lignes', addFood: 'Ajouter un ingrédient', addPack: 'Ajouter un emballage',
      lName: 'Produit', lType: 'Type', food: 'Matière', packaging: 'Emballage', lPackPrice: 'Prix du lot', lPackQty: 'Qté du lot', lPackUnit: 'Unité du lot',
      lUseQty: 'Qté utilisée', lUseUnit: 'Unité', lYield: 'Rendement %', lDate: 'Date du prix', lCost: 'Coût', remove: 'Retirer',
      rYield: 'rendement requis entre 0 exclu et 100 %', readError: 'Lecture de l’historique impossible.', retryRead: 'Réessayer', rPrice: 'prix manquant', rPackQty: 'quantité du lot manquante', rUseQty: 'quantité utilisée manquante', rUnit: 'unités incompatibles',
      oldPrice: 'prix de {days} j', undated: 'non daté',
      sumFood: 'Matière (lot)', sumPack: 'Emballages (lot)', sumTotal: 'Total du lot', sumPortion: 'Par portion', sumPriceHT: 'Prix de vente HT',
      sumPct: 'Coût matière', sumContribution: 'Contribution par portion', sumSuggested: 'Prix pour l’objectif',
      incompleteNote: '{n} ligne(s) sans coût connu : {names}. Le total n’est pas calculé.', staleNote: '{n} prix d’achat datent de plus de 90 jours.',
      noPrice: 'Sans prix de vente, le coût matière ne peut pas être exprimé en %.',
      vatNote: 'Pourcentage calculé sur le prix hors TVA ({rate} % incluse).',
      save: 'Enregistrer', saving: 'Enregistrement…', saved: 'Enregistrée · version {v}', duplicate: 'Dupliquer', saveTemplate: 'Copier en modèle',
      archive: 'Archiver', unarchive: 'Désarchiver', history: 'Historique', exportSheet: 'Exporter la fiche (CSV)',
      nameRequired: 'Donnez un nom à la fiche.', saveError: 'Enregistrement impossible. Votre saisie est gardée ici.', disabledError: 'L’option Coût simple est désactivée pour ce magasin.',
      conflict: 'Cette fiche a été modifiée ailleurs ({who}, {when}). Votre saisie est gardée ici.', reloadServer: 'Prendre la version en ligne', keepMine: 'Enregistrer ma version par-dessus',
      unsaved: 'Des modifications ne sont pas enregistrées. Quitter quand même ?',
      leaveTitle: 'Modifications non enregistrées', leaveYes: 'Quitter sans enregistrer', cancel: 'Annuler', toRecipeYes: 'Ouvrir le brouillon',
      historyTitle: 'Versions enregistrées', version: 'Version {v}', view: 'Voir', close: 'Fermer', snapshotOf: 'Version {v} · {when} · {who}', frozen: 'Version figée, lecture seule.',
      toRecipe: 'Créer un brouillon de recette', toRecipeConfirm: 'Créer un brouillon de recette pour « {item} » à partir de cette fiche ?\n\n· {n} ingrédient(s) repris, en quantité brute (le rendement est appliqué).\n· {pack} ligne(s) d’emballage non reprises.\n· Rien n’est enregistré : l’éditeur de recette s’ouvre, vous vérifiez, puis vous enregistrez.\n· Une fois enregistrée, la recette pilote le stock et le coût théorique. Cette fiche ne change pas.', toRecipeExisting: '\n· Ce plat a déjà une recette : elle reste en place tant que vous n’enregistrez pas le brouillon.', toRecipeEmpty: 'Aucune ligne alimentaire nommée à reprendre.',
      copyName: '{name} (copie)', templateName: 'Modèle · {name}', newName: 'Nouvelle fiche',
      csvSheet: 'Fiche', csvTotal: 'Total du lot', csvPortion: 'Par portion',
      lineN: 'Ligne {n}',
    },
    en: {
      tab: 'Simple cost',
      title: 'Simple cost',
      sub: 'What a dish costs from your purchase prices. A calculator: nothing moves in stock.',
      newSheet: 'New sheet', exportAll: 'Export sheets (CSV)', showArchived: 'Show archived', hideArchived: 'Hide archived',
      sheets: 'Sheets', templates: 'Templates', useTemplate: 'Use this template', open: 'Open',
      colName: 'Sheet', colPortion: 'Cost per portion', colPct: 'Food cost', colStatus: 'Status', colUpdated: 'Updated',
      stOk: 'Complete', stIncomplete: 'Incomplete', stStale: 'Old prices', stEmpty: 'No lines', archived: 'Archived',
      atLeast: 'at least {amount}', unknown: 'Unknown',
      loading: 'Loading sheets…', loadError: 'The sheets could not be read. Nothing was changed.', retry: 'Retry',
      forbidden: 'Reserved for the store owner or a Kiwi operator.',
      offline: 'Offline: you can calculate, saving will wait for the connection.',
      restored: 'Unsaved calculation recovered on this device. Save it to keep it.',
      readOnly: 'This option is turned off for this store: sheets stay readable, nothing was deleted.',
      empty: 'No sheets yet', emptyDesc: 'Create a sheet for a dish: purchase prices, quantities used, packaging. The cost per portion updates as you type.',
      back: 'All sheets', name: 'Sheet name', kindTemplate: 'Template',
      menuItem: 'Menu item', none: 'None', sellingPrice: 'Selling price', vatIncluded: 'VAT included in the price', vatRate: 'VAT rate (%)',
      portions: 'Portions produced', target: 'Food cost target (%)', note: 'Note',
      menuPriceNow: 'Current menu price: {amount}', usePrice: 'Use this price',
      lines: 'Lines', addFood: 'Add an ingredient', addPack: 'Add packaging',
      lName: 'Product', lType: 'Type', food: 'Food', packaging: 'Packaging', lPackPrice: 'Pack price', lPackQty: 'Pack qty', lPackUnit: 'Pack unit',
      lUseQty: 'Qty used', lUseUnit: 'Unit', lYield: 'Yield %', lDate: 'Price date', lCost: 'Cost', remove: 'Remove',
      rYield: 'yield must be above 0 and at most 100%', readError: 'Could not read version history.', retryRead: 'Retry', rPrice: 'missing price', rPackQty: 'missing pack quantity', rUseQty: 'missing quantity used', rUnit: 'incompatible units',
      oldPrice: '{days}-day-old price', undated: 'undated',
      sumFood: 'Food (batch)', sumPack: 'Packaging (batch)', sumTotal: 'Batch total', sumPortion: 'Per portion', sumPriceHT: 'Selling price excl. VAT',
      sumPct: 'Food cost', sumContribution: 'Contribution per portion', sumSuggested: 'Price for the target',
      incompleteNote: '{n} line(s) without a known cost: {names}. The total is not calculated.', staleNote: '{n} purchase prices are more than 90 days old.',
      noPrice: 'Without a selling price, food cost cannot be shown as a %.',
      vatNote: 'Percentage of the price excluding VAT ({rate} % included).',
      save: 'Save', saving: 'Saving…', saved: 'Saved · version {v}', duplicate: 'Duplicate', saveTemplate: 'Copy as template',
      archive: 'Archive', unarchive: 'Unarchive', history: 'History', exportSheet: 'Export sheet (CSV)',
      nameRequired: 'Give the sheet a name.', saveError: 'Could not save. Your input is kept here.', disabledError: 'Simple cost is turned off for this store.',
      conflict: 'This sheet was changed elsewhere ({who}, {when}). Your input is kept here.', reloadServer: 'Take the online version', keepMine: 'Save my version over it',
      unsaved: 'Some changes are not saved. Leave anyway?',
      leaveTitle: 'Unsaved changes', leaveYes: 'Leave without saving', cancel: 'Cancel', toRecipeYes: 'Open the draft',
      historyTitle: 'Saved versions', version: 'Version {v}', view: 'View', close: 'Close', snapshotOf: 'Version {v} · {when} · {who}', frozen: 'Frozen version, read only.',
      toRecipe: 'Create a draft recipe', toRecipeConfirm: 'Create a draft recipe for "{item}" from this sheet?\n\n· {n} ingredient(s) carried over, as gross quantities (yield applied).\n· {pack} packaging line(s) left out.\n· Nothing is saved: the recipe editor opens, you check, then you save.\n· Once saved, the recipe drives stock and theoretical cost. This sheet does not change.', toRecipeExisting: '\n· This dish already has a recipe: it stays in place until you save the draft.', toRecipeEmpty: 'No named food line to carry over.',
      copyName: '{name} (copy)', templateName: 'Template · {name}', newName: 'New sheet',
      csvSheet: 'Sheet', csvTotal: 'Batch total', csvPortion: 'Per portion',
      lineN: 'Line {n}',
    },
    ar: {
      tab: 'التكلفة المبسطة',
      title: 'التكلفة المبسطة',
      sub: 'ما يكلفه طبق انطلاقاً من أسعار الشراء. آلة حاسبة: لا شيء يتحرك في المخزون.',
      newSheet: 'بطاقة جديدة', exportAll: 'تصدير البطاقات (CSV)', showArchived: 'عرض المؤرشفة', hideArchived: 'إخفاء المؤرشفة',
      sheets: 'البطاقات', templates: 'النماذج', useTemplate: 'استعمال هذا النموذج', open: 'فتح',
      colName: 'البطاقة', colPortion: 'التكلفة لكل حصة', colPct: 'تكلفة المواد', colStatus: 'الحالة', colUpdated: 'آخر تعديل',
      stOk: 'كاملة', stIncomplete: 'ناقصة', stStale: 'أسعار قديمة', stEmpty: 'بدون سطور', archived: 'مؤرشفة',
      atLeast: '{amount} على الأقل', unknown: 'غير معروف',
      loading: 'جارٍ تحميل البطاقات…', loadError: 'تعذرت قراءة البطاقات. لم يتغير شيء.', retry: 'إعادة المحاولة',
      forbidden: 'مخصص لصاحب المتجر أو لمشغّل Kiwi.',
      offline: 'غير متصل: يمكنك الحساب، والحفظ ينتظر عودة الاتصال.',
      restored: 'تم استرجاع حساب غير محفوظ على هذا الجهاز. احفظه للاحتفاظ به.',
      readOnly: 'هذا الخيار متوقف لهذا المتجر: البطاقات تبقى مقروءة، ولم يُحذف شيء.',
      empty: 'لا توجد بطاقات بعد', emptyDesc: 'أنشئ بطاقة لطبق: أسعار الشراء، الكميات المستعملة، التغليف. تُحسب التكلفة لكل حصة أثناء الإدخال.',
      back: 'كل البطاقات', name: 'اسم البطاقة', kindTemplate: 'نموذج',
      menuItem: 'طبق من القائمة', none: 'لا شيء', sellingPrice: 'سعر البيع', vatIncluded: 'الضريبة مشمولة في السعر', vatRate: 'نسبة الضريبة (%)',
      portions: 'الحصص المنتجة', target: 'هدف تكلفة المواد (%)', note: 'ملاحظة',
      menuPriceNow: 'السعر الحالي في القائمة: {amount}', usePrice: 'استعمال هذا السعر',
      lines: 'السطور', addFood: 'إضافة مكوّن', addPack: 'إضافة تغليف',
      lName: 'المنتج', lType: 'النوع', food: 'مادة', packaging: 'تغليف', lPackPrice: 'سعر الدفعة', lPackQty: 'كمية الدفعة', lPackUnit: 'وحدة الدفعة',
      lUseQty: 'الكمية المستعملة', lUseUnit: 'الوحدة', lYield: 'المردود %', lDate: 'تاريخ السعر', lCost: 'التكلفة', remove: 'حذف',
      rYield: 'يجب أن يكون المردود أكبر من 0 وحتى 100٪', readError: 'تعذرت قراءة سجل النسخ.', retryRead: 'أعد المحاولة', rPrice: 'السعر ناقص', rPackQty: 'كمية الدفعة ناقصة', rUseQty: 'الكمية المستعملة ناقصة', rUnit: 'وحدات غير متوافقة',
      oldPrice: 'سعر عمره {days} يوماً', undated: 'بدون تاريخ',
      sumFood: 'المواد (الدفعة)', sumPack: 'التغليف (الدفعة)', sumTotal: 'مجموع الدفعة', sumPortion: 'لكل حصة', sumPriceHT: 'سعر البيع دون ضريبة',
      sumPct: 'تكلفة المواد', sumContribution: 'المساهمة لكل حصة', sumSuggested: 'السعر المناسب للهدف',
      incompleteNote: '{n} سطر بدون تكلفة معروفة: {names}. لا يُحسب المجموع.', staleNote: '{n} من أسعار الشراء عمرها أكثر من 90 يوماً.',
      noPrice: 'بدون سعر بيع، لا يمكن التعبير عن تكلفة المواد كنسبة.',
      vatNote: 'النسبة محسوبة على السعر دون ضريبة ({rate} % مشمولة).',
      save: 'حفظ', saving: 'جارٍ الحفظ…', saved: 'محفوظة · النسخة {v}', duplicate: 'نسخ', saveTemplate: 'نسخ كنموذج',
      archive: 'أرشفة', unarchive: 'إلغاء الأرشفة', history: 'السجل', exportSheet: 'تصدير البطاقة (CSV)',
      nameRequired: 'أعطِ البطاقة اسماً.', saveError: 'تعذر الحفظ. إدخالك محفوظ هنا.', disabledError: 'خيار التكلفة المبسطة متوقف لهذا المتجر.',
      conflict: 'عُدّلت هذه البطاقة في مكان آخر ({who}، {when}). إدخالك محفوظ هنا.', reloadServer: 'أخذ النسخة المحفوظة', keepMine: 'حفظ نسختي فوقها',
      unsaved: 'هناك تعديلات غير محفوظة. المغادرة رغم ذلك؟',
      leaveTitle: 'تعديلات غير محفوظة', leaveYes: 'المغادرة دون حفظ', cancel: 'إلغاء', toRecipeYes: 'فتح المسودة',
      historyTitle: 'النسخ المحفوظة', version: 'النسخة {v}', view: 'عرض', close: 'إغلاق', snapshotOf: 'النسخة {v} · {when} · {who}', frozen: 'نسخة مثبتة، للقراءة فقط.',
      toRecipe: 'إنشاء مسودة وصفة', toRecipeConfirm: 'إنشاء مسودة وصفة لـ «{item}» انطلاقاً من هذه البطاقة؟\n\n· {n} مكوّن منقول، بالكمية الإجمالية (مع تطبيق المردود).\n· {pack} سطر تغليف غير منقول.\n· لا يُحفظ شيء: يُفتح محرر الوصفة، تتحقق ثم تحفظ.\n· بعد الحفظ، تتحكم الوصفة في المخزون والتكلفة النظرية. هذه البطاقة لا تتغير.', toRecipeExisting: '\n· لهذا الطبق وصفة: تبقى كما هي حتى تحفظ المسودة.', toRecipeEmpty: 'لا يوجد سطر غذائي مسمّى لنقله.',
      copyName: '{name} (نسخة)', templateName: 'نموذج · {name}', newName: 'بطاقة جديدة',
      csvSheet: 'البطاقة', csvTotal: 'مجموع الدفعة', csvPortion: 'لكل حصة',
      lineN: 'السطر {n}',
    },
  };
  const lang = () => {
    try { const l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang(); if (T[l]) return l; } catch (_) {}
    const d = (document.documentElement && document.documentElement.lang) || 'fr';
    return T[d] ? d : 'fr';
  };
  function tr(key, params) {
    let s = (T[lang()] && T[lang()][key]) || T.fr[key] || key;
    if (params) Object.keys(params).forEach((k) => { s = s.split('{' + k + '}').join(String(params[k])); });
    return s;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const locale = () => (lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR');
  function money(n) {
    if (n == null || !Number.isFinite(+n)) return '·';
    const v = +n, o = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    try { return (window.KiwiNumber && window.KiwiNumber.format ? window.KiwiNumber.format(v, o) : v.toLocaleString(locale(), o)) + ' MAD'; } catch (_) { return v.toFixed(2) + ' MAD'; }
  }
  const pct = (n) => (n == null || !Number.isFinite(+n) ? '·' : (+n).toLocaleString(locale(), { maximumFractionDigits: 1 }) + ' %');
  const when = (ts) => { try { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); } catch (_) { return ''; } };

