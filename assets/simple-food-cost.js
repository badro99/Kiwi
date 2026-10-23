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
      rPrice: 'prix manquant', rPackQty: 'quantité du lot manquante', rUseQty: 'quantité utilisée manquante', rUnit: 'unités incompatibles',
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
      rPrice: 'missing price', rPackQty: 'missing pack quantity', rUseQty: 'missing quantity used', rUnit: 'incompatible units',
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
      rPrice: 'السعر ناقص', rPackQty: 'كمية الدفعة ناقصة', rUseQty: 'الكمية المستعملة ناقصة', rUnit: 'وحدات غير متوافقة',
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

  /* ── le calcul, pur ──────────────────────────────────────────────────── */
  const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  function daysBetween(isoDay, today) {
    const a = Date.parse(isoDay + 'T00:00:00Z'), b = Date.parse(today + 'T00:00:00Z');
    return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 864e5) : null;
  }
  function compute(sheet, opts) {
    const s = sheet || {}, o = opts || {};
    const convert = o.convert || ((q, a, b) => (a === b ? q : null));
    const today = o.today || new Date().toISOString().slice(0, 10);
    const lines = (Array.isArray(s.lines) ? s.lines : []).map((l) => {
      const r = { id: l.id, name: l.name || '', type: l.type === 'packaging' ? 'packaging' : 'food', cost: null, reason: '', stale: false, undated: false, age: null };
      if (!isNum(l.packPrice)) r.reason = 'price';
      else if (!isNum(l.packQty) || +l.packQty <= 0) r.reason = 'packQty';
      else if (!isNum(l.useQty)) r.reason = 'useQty';
      else {
        const q = convert(+l.useQty, l.useUnit || l.packUnit, l.packUnit);
        if (q == null) r.reason = 'unit';
        else {
          const y = isNum(l.yieldPct) && +l.yieldPct > 0 && +l.yieldPct <= 100 ? +l.yieldPct / 100 : 1;
          r.cost = (+l.packPrice / +l.packQty) * q / y;
        }
      }
      if (l.priceDate) { r.age = daysBetween(l.priceDate, today); r.stale = r.age != null && r.age > STALE_DAYS; }
      else if (isNum(l.packPrice)) r.undated = true;
      return r;
    });
    let food = 0, pack = 0, known = 0;
    const unknown = [], stale = [];
    lines.forEach((r) => {
      if (r.cost == null) unknown.push(r); else { known += r.cost; if (r.type === 'packaging') pack += r.cost; else food += r.cost; }
      if (r.stale) stale.push(r);
    });
    const complete = lines.length > 0 && !unknown.length;
    const portions = isNum(s.portions) && +s.portions >= 1 ? Math.round(+s.portions) : 1;
    const vatOn = s.vatIncluded === true && isNum(s.vatRate) && +s.vatRate > 0;
    const price = isNum(s.sellingPrice) ? +s.sellingPrice : null;
    const priceHT = price == null ? null : (vatOn ? price / (1 + s.vatRate / 100) : price);
    const total = complete ? known : null;
    const perPortion = complete ? known / portions : null;
    const pctOfPrice = perPortion != null && priceHT > 0 ? perPortion / priceHT * 100 : null;
    const contribution = perPortion != null && priceHT != null ? priceHT - perPortion : null;
    const target = isNum(s.targetPct) && +s.targetPct > 0 ? +s.targetPct : null;
    const suggestedHT = perPortion != null && target ? perPortion / (target / 100) : null;
    const suggested = suggestedHT == null ? null : (vatOn ? suggestedHT * (1 + s.vatRate / 100) : suggestedHT);
    const status = !lines.length ? 'empty' : !complete ? 'incomplete' : stale.length ? 'stale' : 'ok';
    return {
      lines, unknown, stale, complete, status, portions, vatOn, vatRate: vatOn ? +s.vatRate : null,
      known, food: complete ? food : null, packaging: complete ? pack : null, total, perPortion,
      knownPerPortion: known / portions, price, priceHT, pct: pctOfPrice, contribution, target, suggested,
    };
  }

  /* ── état ────────────────────────────────────────────────────────────── */
  const S = {
    status: 'idle', enabled: false, canEdit: false, sheets: [], merchant: '', showArchived: false,
    openId: null, draft: null, baseVersion: 0, dirty: false, saving: false, message: '', messageKind: '',
    conflict: null, history: null, snapshot: null, pendingSave: false,
  };
  const units = () => window.KiwiRestaurantUnits;
  const convert = (q, a, b) => { try { return units() ? units().convert(q, a, b) : (a === b ? q : null); } catch (_) { return null; } };
  const today = () => { try { const DR = window.KiwiDayReport; if (DR && DR.today) return DR.today(); } catch (_) {} return new Date().toISOString().slice(0, 10); };
  const calc = (sheet) => compute(sheet, { convert, today: today() });
  function merchant() {
    try { return (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && (window.KiwiVenue.getCurrentVenueData() || {}).slug) || ''; } catch (_) { return ''; }
  }
  const online = () => { try { return navigator.onLine !== false; } catch (_) { return true; } };
  /* La saisie non enregistrée survit au rechargement. Hors ligne, « l’enregistrement
     attendra la connexion » doit être vrai : sans copie locale, un rechargement
     effaçait le calcul en silence. Une clé par compte (kiwiAccountKey) ET par
     magasin, sous le préfixe `kiwi:` que tenant-purge.js efface au changement de
     commerçant : la fiche d’un magasin ne réapparaît jamais dans un autre. */
  function draftKey() {
    if (!S.merchant) return '';
    let acct = '';
    try { acct = String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { acct = ''; }
    return 'kiwi:sfcDraft:' + acct + '@' + S.merchant;
  }
  function rememberDraft() {
    const k = draftKey();
    if (!k || !S.draft) return;
    try {
      if (S.dirty) localStorage.setItem(k, JSON.stringify({ openId: S.openId, baseVersion: S.baseVersion, draft: S.draft, pendingSave: !!S.pendingSave, at: Date.now() }));
      else localStorage.removeItem(k);
    } catch (_) {}
  }
  function forgetDraft() { const k = draftKey(); if (k) { try { localStorage.removeItem(k); } catch (_) {} } }
  function restoreDraft() {
    const k = draftKey();
    if (!k || S.draft || !editable()) return false;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { saved = null; }
    if (!saved || !saved.draft || typeof saved.draft !== 'object' || !Array.isArray(saved.draft.lines)) return false;
    S.openId = saved.openId || null; S.draft = saved.draft; S.baseVersion = +saved.baseVersion || 0;
    S.dirty = true; S.pendingSave = !!saved.pendingSave; S.conflict = null; S.history = null; S.snapshot = null;
    S.message = tr('restored'); S.messageKind = 'warn';
    return true;
  }
  function available() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && !window.KiwiEnv.isReal()) return false;
      return !!(window.KiwiConfig && window.KiwiConfig.features && window.KiwiConfig.features.simple_food_cost === true);
    } catch (_) { return false; }
  }
  const editable = () => S.enabled && S.canEdit;
  function menuItems() {
    try { const st = window.KiwiMenuStore; const items = st && (st.items ? st.items() : (st.data && st.data().items)) || []; return items.filter((x) => x && !x.archived); } catch (_) { return []; }
  }
  const menuItem = (id) => menuItems().find((x) => String(x.id) === String(id)) || null;
  function vatDefault() {
    try { const v = window.KiwiReceipt && window.KiwiReceipt.config && window.KiwiReceipt.config().vat; if (v && v.mode === 'rate') return { vatIncluded: v.included !== false, vatRate: +v.rate || null }; } catch (_) {}
    return { vatIncluded: false, vatRate: null };
  }
  let lineSeq = 0;
  const lineId = () => 'l' + Date.now().toString(36) + (lineSeq++).toString(36);
  function blankSheet() {
    return { name: tr('newName'), kind: 'sheet', menuItemId: '', menuItemName: '', sellingPrice: null, ...vatDefault(), portions: 1, targetPct: 30, note: '', lines: [] };
  }

  /* Fiche → brouillon de recette. Seules les lignes alimentaires nommées
     passent ; la quantité devient brute (utilisée ÷ rendement), puisque c'est
     ce qui sort du stock. Rien n'est écrit ici : l'éditeur de recette s'ouvre
     pré-rempli et seul son bouton Enregistrer crée la recette. */
  function recipeSeed(d) {
    const U = units(), lines = Array.isArray(d && d.lines) ? d.lines : [];
    const food = lines.filter((l) => l && l.type !== 'packaging' && String(l.name || '').trim());
    const ingredients = food.map((l) => {
      const y = isNum(l.yieldPct) && +l.yieldPct > 0 && +l.yieldPct <= 100 ? +l.yieldPct / 100 : 1;
      const unit = l.useUnit || l.packUnit || '';
      return { stockId: '', name: String(l.name).trim(), qty: isNum(l.useQty) ? Math.round(+l.useQty / y * 1000) / 1000 : 0, unit: (U && U.normalize ? U.normalize(unit, '') : unit) || '' };
    });
    return { seed: { itemName: d.menuItemName || d.name || '', portions: isNum(d.portions) && +d.portions >= 1 ? Math.round(+d.portions) : 1, prepMinutes: 0, ingredients, steps: [], note: d.note || '' }, packaging: lines.filter((l) => l && l.type === 'packaging').length };
  }
  const recipeBridge = () => { try { const w = window.KiwiRestaurantMenuWorkspace; return w && typeof w.recipeFromSheet === 'function' ? w : null; } catch (_) { return null; } };
  function toRecipe() {
    const d = S.draft, it = d && d.menuItemId ? menuItem(d.menuItemId) : null, bridge = recipeBridge();
    if (!d || !it || !bridge) return false;
    const r = recipeSeed(d);
    if (!r.seed.ingredients.length) { S.message = tr('toRecipeEmpty'); S.messageKind = 'warn'; paint(); return false; }
    let existing = false;
    try { existing = !!(window.KiwiRestaurantRecipes && window.KiwiRestaurantRecipes.get && window.KiwiRestaurantRecipes.get(it.id, it.name)); } catch (_) { existing = false; }
    const text = tr('toRecipeConfirm', { item: it.name, n: r.seed.ingredients.length, pack: r.packaging }) + (existing ? tr('toRecipeExisting') : '');
    /* La question passe par la fenêtre partagée : l'éditeur de recette ne
       s'ouvre que sur « Ouvrir le brouillon » ; Annuler, Échap ou le fond ne
       font rien. Renvoie vrai quand la question est posée. */
    return ask({ title: tr('toRecipe'), body: text, yes: tr('toRecipeYes') }, () => { bridge.recipeFromSheet(it.id, r.seed, { sheet: d.name || '' }); });
  }

  /* ── question oui / non ─────────────────────────────────────────────────
     Plus de boîte native (window.confirm) : elle sortait de la langue du
     tableau de bord et de sa gestion du focus. Kiwi.modal (interactive.js)
     met le focus dans la fenêtre, le rend au bouton d'origine à la fermeture,
     et Échap, la croix ou le fond ferment sans rien faire. Le focus part sur
     Annuler : le choix sûr est celui par défaut. Sans Kiwi.modal, rien ne se
     passe (la saisie reste). */
  function ask(o, onYes) {
    const K = window.Kiwi;
    if (!K || typeof K.modal !== 'function') return false;
    const m = K.modal({
      title: o.title, width: 480,
      body: `<p style="margin:0;line-height:1.55;">${esc(o.body).replace(/\n/g, '<br>')}</p>`,
      foot: `<button type="button" class="kb ghost" data-sfc-ask="no" data-dismiss data-autofocus>${esc(tr('cancel'))}</button><button type="button" class="kb" data-sfc-ask="yes">${esc(o.yes)}</button>`,
    });
    const yes = m && m.el && m.el.querySelector('[data-sfc-ask="yes"]');
    if (yes) yes.addEventListener('click', () => { m.close(); onYes(); });
    return true;
  }

  /* ── réseau ──────────────────────────────────────────────────────────── */
  async function api(method, query, body) {
    const url = '/api/foodcost' + (query ? '?' + query : '');
    const res = await fetch(url, method === 'GET' ? { headers: { Accept: 'application/json' }, credentials: 'same-origin' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { status: res.status, data: data || {} };
  }
  async function load() {
    S.merchant = merchant();
    if (!S.merchant) { S.status = 'error'; paint(); return; }
    S.status = 'loading'; paint();
    try {
      const r = await api('GET', 'merchant=' + encodeURIComponent(S.merchant));
      if (r.status === 403) { S.status = 'forbidden'; }
      else if (r.status !== 200) { S.status = 'error'; }
      else { S.status = 'ready'; S.enabled = r.data.enabled === true; S.canEdit = r.data.canEdit === true; S.sheets = Array.isArray(r.data.sheets) ? r.data.sheets : []; }
    } catch (_) { S.status = online() ? 'error' : 'offline-empty'; }
    const restored = S.status === 'ready' && restoreDraft();
    paint();
    changed();
    /* Un enregistrement demandé hors ligne part dès que la connexion est là ;
       un 409 éventuel passe par l’écran de conflit, comme à la main. */
    if (restored && S.pendingSave && online()) save(false);
  }
  /* La Performance lit les estimations : elle se redessine quand elles bougent. */
  function changed() { try { window.dispatchEvent(new CustomEvent('kiwi:simple-food-cost')); } catch (_) {} }
  function replaceSheet(sheet) {
    const i = S.sheets.findIndex((x) => x.id === sheet.id);
    if (i < 0) S.sheets.unshift(sheet); else S.sheets[i] = sheet;
    changed();
  }
  /* Une estimation par plat, pour la Performance : seules les fiches (pas les
     modèles) non archivées et liées à un plat comptent, la plus récente
     l'emporte. null tant que les fiches ne sont pas lues : jamais un 0. */
  function estimates() {
    if (!available()) return null;
    if (S.merchant && S.merchant !== merchant()) { S.status = 'idle'; S.sheets = []; S.draft = null; S.openId = null; S.pendingSave = false; }
    if (S.status === 'idle') { S.status = 'loading'; setTimeout(load, 0); }
    if (S.status !== 'ready') return null;
    const out = {};
    S.sheets.filter((x) => x && !x.archived && x.kind !== 'template' && x.data && x.data.menuItemId)
      .sort((a, b) => (b.updatedTs || 0) - (a.updatedTs || 0))
      .forEach((x) => {
        const id = String(x.data.menuItemId);
        if (out[id]) return;
        const c = calc(x.data);
        out[id] = { sheetId: x.id, name: x.name || x.data.name || '', perPortion: c.perPortion, complete: c.complete, stale: c.stale.length > 0, status: c.status, pct: c.pct };
      });
    return out;
  }
  function openSheet(sheet) {
    S.openId = sheet ? sheet.id : null;
    S.draft = sheet ? JSON.parse(JSON.stringify(sheet.data)) : blankSheet();
    S.baseVersion = sheet ? sheet.version : 0;
    S.dirty = !sheet; S.pendingSave = false; S.conflict = null; S.history = null; S.snapshot = null; S.message = '';
    paint();
  }
  async function save(force) {
    if (!S.draft || S.saving) return;
    if (!String(S.draft.name || '').trim()) { S.message = tr('nameRequired'); S.messageKind = 'warn'; paint(); return; }
    if (!online()) { S.pendingSave = true; S.message = tr('offline'); S.messageKind = 'warn'; paint(); return; }
    S.pendingSave = false;
    S.saving = true; S.message = ''; paint();
    const base = force && S.conflict ? S.conflict.version : S.baseVersion;
    try {
      const r = await api('POST', '', { merchant: S.merchant, action: 'save', sheet: { ...S.draft, id: S.openId || '' }, baseVersion: base });
      if (r.status === 200 || r.status === 201) {
        replaceSheet(r.data.sheet); S.openId = r.data.sheet.id; S.baseVersion = r.data.sheet.version; S.dirty = false; S.conflict = null;
        S.message = tr('saved', { v: r.data.sheet.version }); S.messageKind = 'ok';
        if (S.history) loadHistory();
      } else if (r.status === 409 && r.data.sheet) {
        S.conflict = r.data.sheet; S.message = ''; replaceSheet(r.data.sheet);
      } else if (r.status === 403 && r.data.error === 'disabled') {
        S.enabled = false; S.canEdit = false; S.message = tr('disabledError'); S.messageKind = 'warn';
      } else { S.message = tr('saveError'); S.messageKind = 'warn'; }
    } catch (_) { S.message = tr('saveError'); S.messageKind = 'warn'; }
    S.saving = false; paint();
  }
  async function action(body) {
    if (!online()) { S.message = tr('offline'); S.messageKind = 'warn'; paint(); return null; }
    try {
      const r = await api('POST', '', { merchant: S.merchant, ...body });
      if (r.status === 200 || r.status === 201) { replaceSheet(r.data.sheet); return r.data.sheet; }
      if (r.status === 409 && r.data.sheet) { S.conflict = r.data.sheet; replaceSheet(r.data.sheet); paint(); return null; }
      S.message = r.data.error === 'disabled' ? tr('disabledError') : tr('saveError'); S.messageKind = 'warn'; paint(); return null;
    } catch (_) { S.message = tr('saveError'); S.messageKind = 'warn'; paint(); return null; }
  }
  async function loadHistory() {
    if (!S.openId) return;
    try {
      const r = await api('GET', 'merchant=' + encodeURIComponent(S.merchant) + '&id=' + encodeURIComponent(S.openId));
      S.history = r.status === 200 ? (r.data.history || []) : [];
    } catch (_) { S.history = []; }
    paint();
  }
  async function loadSnapshot(v) {
    try {
      const r = await api('GET', 'merchant=' + encodeURIComponent(S.merchant) + '&id=' + encodeURIComponent(S.openId) + '&version=' + v);
      S.snapshot = r.status === 200 ? r.data.snapshot : null;
    } catch (_) { S.snapshot = null; }
    paint();
  }

  /* ── export ──────────────────────────────────────────────────────────── */
  /* Une cellule qui commence par = + - @ serait une formule dans un tableur. */
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const n2 = (v) => (v == null || !Number.isFinite(+v) ? '' : (+v).toFixed(2).replace('.', ','));
  function download(name, rows) {
    const text = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {}
    return text;
  }
  function sheetRows(data) {
    const c = calc(data);
    const rows = [[tr('csvSheet'), data.name], [tr('lName'), tr('lType'), tr('lPackPrice'), tr('lPackQty'), tr('lPackUnit'), tr('lUseQty'), tr('lUseUnit'), tr('lYield'), tr('lDate'), tr('lCost')]];
    (data.lines || []).forEach((l, i) => rows.push([l.name, l.type === 'packaging' ? tr('packaging') : tr('food'), n2(l.packPrice), l.packQty ?? '', l.packUnit, l.useQty ?? '', l.useUnit || l.packUnit, l.yieldPct ?? 100, l.priceDate, c.lines[i].cost == null ? tr('unknown') : n2(c.lines[i].cost)]));
    rows.push([tr('csvTotal'), c.total == null ? tr('unknown') : n2(c.total)], [tr('csvPortion'), c.perPortion == null ? tr('unknown') : n2(c.perPortion)], [tr('sumPct'), c.pct == null ? '' : n2(c.pct)]);
    return rows;
  }
  function exportSheet() { if (S.draft) return download(slugFile(S.draft.name) + '.csv', sheetRows(S.draft)); return ''; }
  function exportAll() {
    const rows = [[tr('colName'), tr('kindTemplate'), tr('colPortion'), tr('colPct'), tr('colStatus'), tr('colUpdated')]];
    visibleSheets().forEach((s) => { const c = calc(s.data); rows.push([s.name, s.kind === 'template' ? tr('kindTemplate') : '', c.perPortion == null ? tr('unknown') : n2(c.perPortion), c.pct == null ? '' : n2(c.pct), statusLabel(c.status), new Date(s.updatedTs).toISOString().slice(0, 10)]); });
    return download('kiwi-couts.csv', rows);
  }
  const slugFile = (s) => String(s || 'fiche').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'fiche';

  /* ── rendu ───────────────────────────────────────────────────────────── */
  const statusLabel = (st) => tr({ ok: 'stOk', incomplete: 'stIncomplete', stale: 'stStale', empty: 'stEmpty' }[st] || 'stEmpty');
  const visibleSheets = () => S.sheets.filter((s) => S.showArchived || !s.archived);
  function banner() {
    const out = [];
    if (!online()) out.push(`<p class="sfc-note warn" data-sfc-state="offline">${esc(tr('offline'))}</p>`);
    if (S.status === 'ready' && !S.enabled) out.push(`<p class="sfc-note warn" data-sfc-state="readonly">${esc(tr('readOnly'))}</p>`);
    return out.join('');
  }
  function head() {
    return `<div class="sfc-head"><div><div class="mi-title">${esc(tr('title'))}</div><div class="mi-sub">${esc(tr('sub'))}</div></div></div>`;
  }
  function listView() {
    const toolbar = `<div class="sfc-toolbar">${editable() ? `<button type="button" class="sfc-btn primary" data-sfc="new">${esc(tr('newSheet'))}</button>` : ''}<button type="button" class="sfc-btn" data-sfc="export-all"${S.sheets.length ? '' : ' disabled'}>${esc(tr('exportAll'))}</button>${S.sheets.some((s) => s.archived) ? `<button type="button" class="sfc-btn ghost" data-sfc="toggle-archived">${esc(tr(S.showArchived ? 'hideArchived' : 'showArchived'))}</button>` : ''}</div>`;
    const list = visibleSheets();
    if (!list.length) return toolbar + `<div class="rmw-empty" data-sfc-state="empty"><h3>${esc(tr('empty'))}</h3><p>${esc(tr('emptyDesc'))}</p></div>`;
    const row = (s) => {
      const c = calc(s.data);
      const portion = c.perPortion != null ? money(c.perPortion) : c.lines.length ? `<span class="sfc-unknown">${esc(tr('atLeast', { amount: money(c.knownPerPortion) }))}</span>` : '·';
      return `<tr data-sfc-row="${esc(s.id)}"><td><b>${esc(s.name)}</b>${s.archived ? `<small>${esc(tr('archived'))}</small>` : ''}</td><td>${portion}</td><td>${pct(c.pct)}</td><td><span class="sfc-st ${c.status}">${esc(statusLabel(c.status))}</span></td><td><small>${esc(when(s.updatedTs))}<br>${esc(s.updatedBy || '')}</small></td><td>${s.kind === 'template' && editable() ? `<button type="button" class="sfc-btn" data-sfc="use-template" data-id="${esc(s.id)}">${esc(tr('useTemplate'))}</button> ` : ''}<button type="button" class="sfc-btn" data-sfc="open" data-id="${esc(s.id)}">${esc(tr('open'))}</button></td></tr>`;
    };
    const table = (rows) => `<div class="mi-list-wrap"><table class="mi-list sfc-table"><thead><tr><th>${esc(tr('colName'))}</th><th>${esc(tr('colPortion'))}</th><th>${esc(tr('colPct'))}</th><th>${esc(tr('colStatus'))}</th><th>${esc(tr('colUpdated'))}</th><th></th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
    const sheets = list.filter((s) => s.kind !== 'template'), tpls = list.filter((s) => s.kind === 'template');
    return toolbar + (sheets.length ? `<h3 class="sfc-h3">${esc(tr('sheets'))}</h3>${table(sheets)}` : '') + (tpls.length ? `<h3 class="sfc-h3">${esc(tr('templates'))}</h3>${table(tpls)}` : '');
  }
  function unitOptions(selected) {
    const list = units() ? units().list() : [{ id: 'g' }, { id: 'kg' }, { id: 'ml' }, { id: 'L' }, { id: 'unité' }];
    const sel = selected || '';
    return `<option value=""${sel ? '' : ' selected'}>·</option>` + list.map((u) => `<option value="${esc(u.id)}"${u.id === sel ? ' selected' : ''}>${esc(u.id)}</option>`).join('');
  }
  const inp = (field, value, attrs) => `<input data-sfc-field="${field}" value="${esc(value == null ? '' : value)}"${attrs || ''}${editable() ? '' : ' disabled'}>`;
  /* Les champs d'une ligne n'avaient pour nom que l'en-tête de leur colonne,
     que le lecteur d'écran ne relie pas au champ (et que le téléphone masque) :
     des « Prix du lot » indiscernables d'une ligne à l'autre. Chacun porte
     désormais l'ingrédient ET le champ, « Poulet · Prix du lot », dans la
     langue de l'écran (axe, 23 octobre). */
  const lineWho = (l, i) => String((l && l.name) || '').trim() || tr('lineN', { n: i + 1 });
  const lineLabel = (l, i, key) => (key === 'lName' ? `${tr('lName')} · ${lineWho(l, i)}` : `${lineWho(l, i)} · ${tr(key)}`);
  const named = (l, i, key) => ` data-sfc-label="${key}" aria-label="${esc(lineLabel(l, i, key))}"`;
  function relabelLine(row, l, i) {
    row.querySelectorAll('[data-sfc-label]').forEach((el) => el.setAttribute('aria-label', lineLabel(l, i, el.getAttribute('data-sfc-label'))));
  }
  const numIn = (field, value, extra) => inp(field, value, ` type="number" inputmode="decimal" step="any" min="0"${extra || ''}`);
  function lineCostCell(r) {
    if (r.cost != null) return `${money(r.cost)}${r.stale ? `<small class="warn">${esc(tr('oldPrice', { days: r.age }))}</small>` : r.undated ? `<small>${esc(tr('undated'))}</small>` : ''}`;
    return `<span class="sfc-unknown">${esc(tr('unknown'))}</span><small>${esc(tr({ price: 'rPrice', packQty: 'rPackQty', useQty: 'rUseQty', unit: 'rUnit' }[r.reason] || 'rPrice'))}</small>`;
  }
  function summary(c, d) {
    const notes = [];
    if (c.unknown.length) notes.push(`<p class="warn">${esc(tr('incompleteNote', { n: c.unknown.length, names: c.unknown.map((r) => r.name || '·').join(', ') }))}</p>`);
    if (c.stale.length) notes.push(`<p class="warn">${esc(tr('staleNote', { n: c.stale.length }))}</p>`);
    if (c.price == null) notes.push(`<p>${esc(tr('noPrice'))}</p>`);
    else if (c.vatOn) notes.push(`<p>${esc(tr('vatNote', { rate: c.vatRate }))}</p>`);
    const cellv = (label, v, cls) => `<div${cls ? ` class="${cls}"` : ''}><span>${esc(label)}</span><b>${v}</b></div>`;
    const portion = c.perPortion != null ? money(c.perPortion) : `<span class="sfc-unknown">${esc(c.lines.length ? tr('atLeast', { amount: money(c.knownPerPortion) }) : tr('unknown'))}</span>`;
    return `<div class="sfc-summary" data-sfc-summary data-sfc-status="${c.status}">${cellv(tr('sumFood'), money(c.food))}${cellv(tr('sumPack'), money(c.packaging))}${cellv(tr('sumTotal'), c.total != null ? money(c.total) : `<span class="sfc-unknown">${esc(tr('atLeast', { amount: money(c.known) }))}</span>`)}${cellv(tr('sumPortion'), portion, 'hl')}${cellv(tr('sumPriceHT'), money(c.priceHT))}${cellv(tr('sumPct'), pct(c.pct), 'hl')}${cellv(tr('sumContribution'), money(c.contribution))}${cellv(tr('sumSuggested'), c.target ? money(c.suggested) : '·')}</div>${notes.length ? `<div class="rmw-perf-notes sfc-notes">${notes.join('')}</div>` : ''}`;
  }
  function editorView() {
    const d = S.draft, c = calc(d), sheet = S.sheets.find((s) => s.id === S.openId) || null;
    const items = menuItems(), it = d.menuItemId ? menuItem(d.menuItemId) : null;
    const priceHint = it && isNum(it.price) && +it.price !== +d.sellingPrice ? `<small class="sfc-hint">${esc(tr('menuPriceNow', { amount: money(it.price) }))} ${editable() ? `<button type="button" class="sfc-link" data-sfc="use-menu-price">${esc(tr('usePrice'))}</button>` : ''}</small>` : '';
    const conflict = S.conflict ? `<div class="sfc-note warn" data-sfc-state="conflict"><p>${esc(tr('conflict', { who: S.conflict.updatedBy || '·', when: when(S.conflict.updatedTs) }))}</p><button type="button" class="sfc-btn" data-sfc="take-server">${esc(tr('reloadServer'))}</button> <button type="button" class="sfc-btn" data-sfc="keep-mine">${esc(tr('keepMine'))}</button></div>` : '';
    const msg = S.message ? `<p class="sfc-note ${S.messageKind === 'ok' ? 'ok' : 'warn'}" role="status">${esc(S.message)}</p>` : '';
    const lines = (d.lines || []).map((l, i) => `<tr data-sfc-line="${i}"><td>${inp('name', l.name, ` maxlength="120"${named(l, i, 'lName')}`)}</td><td data-sfc-linecost="${i}">${lineCostCell(c.lines[i])}</td><td><select data-sfc-field="type"${named(l, i, 'lType')}${editable() ? '' : ' disabled'}><option value="food"${l.type !== 'packaging' ? ' selected' : ''}>${esc(tr('food'))}</option><option value="packaging"${l.type === 'packaging' ? ' selected' : ''}>${esc(tr('packaging'))}</option></select></td><td>${numIn('packPrice', l.packPrice, named(l, i, 'lPackPrice'))}</td><td>${numIn('packQty', l.packQty, named(l, i, 'lPackQty'))}</td><td><select data-sfc-field="packUnit"${named(l, i, 'lPackUnit')}${editable() ? '' : ' disabled'}>${unitOptions(l.packUnit)}</select></td><td>${numIn('useQty', l.useQty, named(l, i, 'lUseQty'))}</td><td><select data-sfc-field="useUnit"${named(l, i, 'lUseUnit')}${editable() ? '' : ' disabled'}>${unitOptions(l.useUnit || l.packUnit)}</select></td><td>${numIn('yieldPct', l.yieldPct == null ? 100 : l.yieldPct, ' max="100"' + named(l, i, 'lYield'))}</td><td>${inp('priceDate', l.priceDate, ' type="date"' + named(l, i, 'lDate'))}</td><td>${editable() ? `<button type="button" class="sfc-btn ghost" data-sfc="remove-line" data-i="${i}" data-sfc-label="remove" aria-label="${esc(lineLabel(l, i, 'remove'))}">${esc(tr('remove'))}</button>` : ''}</td></tr>`).join('');
    const lbl = ['lName', 'lCost', 'lType', 'lPackPrice', 'lPackQty', 'lPackUnit', 'lUseQty', 'lUseUnit', 'lYield', 'lDate'].map((k, i) => `--l${i + 1}:${JSON.stringify(tr(k))}`).join(';');
    const history = S.history ? `<div class="sfc-history" data-sfc-history><div class="sfc-history-h"><b>${esc(tr('historyTitle'))}</b><button type="button" class="sfc-btn ghost" data-sfc="close-history">${esc(tr('close'))}</button></div>${S.history.map((h) => `<div class="sfc-hrow"><span>${esc(tr('version', { v: h.version }))} · ${esc(when(h.ts))} · ${esc(h.actor || '')}</span><button type="button" class="sfc-btn ghost" data-sfc="view-version" data-v="${h.version}">${esc(tr('view'))}</button></div>`).join('')}${S.snapshot ? snapshotView(S.snapshot) : ''}</div>` : '';
    const actions = `<div class="sfc-actions">${editable() ? `<button type="button" class="sfc-btn primary" data-sfc="save"${S.saving ? ' disabled' : ''}>${esc(tr(S.saving ? 'saving' : 'save'))}</button>` : ''}${sheet && editable() ? `<button type="button" class="sfc-btn" data-sfc="duplicate">${esc(tr('duplicate'))}</button><button type="button" class="sfc-btn" data-sfc="save-template">${esc(tr('saveTemplate'))}</button><button type="button" class="sfc-btn" data-sfc="archive">${esc(tr(sheet.archived ? 'unarchive' : 'archive'))}</button>` : ''}${d.kind !== 'template' && it && recipeBridge() ? `<button type="button" class="sfc-btn" data-sfc="to-recipe">${esc(tr('toRecipe'))}</button>` : ''}${sheet ? `<button type="button" class="sfc-btn" data-sfc="history">${esc(tr('history'))}</button>` : ''}<button type="button" class="sfc-btn" data-sfc="export-sheet">${esc(tr('exportSheet'))}</button></div>`;
    return `<div class="sfc-toolbar"><button type="button" class="sfc-btn ghost" data-sfc="back">${esc(tr('back'))}</button>${d.kind === 'template' ? `<span class="sfc-st tpl">${esc(tr('kindTemplate'))}</span>` : ''}${sheet ? `<small class="sfc-hint">${esc(tr('version', { v: sheet.version }))} · ${esc(when(sheet.updatedTs))} · ${esc(sheet.updatedBy || '')}</small>` : ''}</div>${conflict}${msg}
      <div class="sfc-form">
        <label class="wide"><span>${esc(tr('name'))}</span>${inp('sheet.name', d.name, ' maxlength="120"')}</label>
        <label><span>${esc(tr('menuItem'))}</span><select data-sfc-field="sheet.menuItemId"${editable() ? '' : ' disabled'}><option value="">${esc(tr('none'))}</option>${items.map((x) => `<option value="${esc(x.id)}"${String(x.id) === String(d.menuItemId) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}${d.menuItemId && !it ? `<option value="${esc(d.menuItemId)}" selected>${esc(d.menuItemName || d.menuItemId)}</option>` : ''}</select></label>
        <label><span>${esc(tr('sellingPrice'))}</span>${numIn('sheet.sellingPrice', d.sellingPrice)}${priceHint}</label>
        <label class="check"><input type="checkbox" data-sfc-field="sheet.vatIncluded"${d.vatIncluded ? ' checked' : ''}${editable() ? '' : ' disabled'}><span>${esc(tr('vatIncluded'))}</span></label>
        <label><span>${esc(tr('vatRate'))}</span>${numIn('sheet.vatRate', d.vatRate, ' max="100"')}</label>
        <label><span>${esc(tr('portions'))}</span>${numIn('sheet.portions', d.portions, ' min="1" step="1"')}</label>
        <label><span>${esc(tr('target'))}</span>${numIn('sheet.targetPct', d.targetPct, ' max="100"')}</label>
        <label class="wide"><span>${esc(tr('note'))}</span>${inp('sheet.note', d.note, ' maxlength="1000"')}</label>
      </div>
      <h3 class="sfc-h3">${esc(tr('lines'))}</h3>
      <div class="mi-list-wrap"><table class="mi-list sfc-lines" style="${esc(lbl)}"><thead><tr><th>${esc(tr('lName'))}</th><th>${esc(tr('lCost'))}</th><th>${esc(tr('lType'))}</th><th>${esc(tr('lPackPrice'))}</th><th>${esc(tr('lPackQty'))}</th><th>${esc(tr('lPackUnit'))}</th><th>${esc(tr('lUseQty'))}</th><th>${esc(tr('lUseUnit'))}</th><th>${esc(tr('lYield'))}</th><th>${esc(tr('lDate'))}</th><th></th></tr></thead><tbody>${lines}</tbody></table></div>
      ${editable() ? `<div class="sfc-toolbar"><button type="button" class="sfc-btn" data-sfc="add-food">${esc(tr('addFood'))}</button><button type="button" class="sfc-btn" data-sfc="add-pack">${esc(tr('addPack'))}</button></div>` : ''}
      <div data-sfc-summary-host>${summary(c, d)}</div>
      ${actions}${history}`;
  }
  function snapshotView(snap) {
    const c = calc(snap.data || {});
    return `<div class="sfc-snapshot" data-sfc-snapshot="${snap.version}"><p><b>${esc(tr('snapshotOf', { v: snap.version, when: when(snap.ts), who: snap.actor || '' }))}</b> · ${esc(tr('frozen'))}</p>${summary(c, snap.data || {})}</div>`;
  }
  function inner() {
    if (S.status === 'idle' || S.status === 'loading') return head() + `<div class="rmw-empty" data-sfc-state="loading"><p>${esc(tr('loading'))}</p></div>`;
    if (S.status === 'forbidden') return head() + `<div class="rmw-empty" data-sfc-state="forbidden"><h3>${esc(tr('forbidden'))}</h3></div>`;
    if (S.status === 'error' || S.status === 'offline-empty') return head() + banner() + `<div class="rmw-empty" data-sfc-state="error"><h3>${esc(tr('loadError'))}</h3><button type="button" class="sfc-btn" data-sfc="retry">${esc(tr('retry'))}</button></div>`;
    return head() + banner() + (S.draft ? editorView() : listView());
  }
  function paint() {
    style();
    rememberDraft();
    const root = document.querySelector('[data-sfc-root]');
    if (root) root.innerHTML = inner();
  }
  function panel() {
    style();
    if (S.status === 'idle' || (S.merchant && S.merchant !== merchant())) {
      S.status = 'idle'; S.sheets = []; S.draft = null; S.openId = null; S.pendingSave = false;
      setTimeout(load, 0);
    }
    return `<div class="rmw-analysis-panel"><section class="mi-section sfc" data-sfc-root>${inner()}</section></div>`;
  }

  /* Pendant la saisie, seuls le coût de la ligne et le résumé se redessinent :
     le champ en cours garde le focus et le curseur. */
  function repaintFigures() {
    const root = document.querySelector('[data-sfc-root]');
    rememberDraft();
    if (!root || !S.draft) return;
    const c = calc(S.draft);
    c.lines.forEach((r, i) => { const cellEl = root.querySelector(`[data-sfc-linecost="${i}"]`); if (cellEl) cellEl.innerHTML = lineCostCell(r); });
    const host = root.querySelector('[data-sfc-summary-host]');
    if (host) host.innerHTML = summary(c, S.draft);
  }
  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return el.value === '' ? null : Number(el.value);
    return el.value;
  }
  function onInput(e) {
    const el = e.target && e.target.closest && e.target.closest('[data-sfc-field]');
    if (!el || !S.draft || !el.closest('[data-sfc-root]')) return;
    const field = el.getAttribute('data-sfc-field'), v = readValue(el);
    if (field.indexOf('sheet.') === 0) {
      const k = field.slice(6);
      S.draft[k] = v;
      if (k === 'menuItemId') {
        const it = menuItem(v);
        S.draft.menuItemName = it ? String(it.name || '') : '';
        if (it && isNum(it.price) && !isNum(S.draft.sellingPrice)) S.draft.sellingPrice = +it.price;
        S.dirty = true; paint(); return;
      }
    } else {
      const row = el.closest('[data-sfc-line]');
      const line = row && S.draft.lines[+row.getAttribute('data-sfc-line')];
      if (!line) return;
      line[field] = v;
      if (field === 'packUnit' && !line.useUnit) line.useUnit = v;
      /* le nom tapé passe dans le nom de chaque champ de la ligne, sans redessiner */
      if (field === 'name' && row.querySelectorAll) relabelLine(row, line, +row.getAttribute('data-sfc-line'));
    }
    S.dirty = true;
    repaintFigures();
  }
  /* Quitter une fiche modifiée : la question passe par ask() ; sans
     modification, on part tout de suite. */
  function leaveThen(run) {
    if (!S.dirty) return run();
    ask({ title: tr('leaveTitle'), body: tr('unsaved'), yes: tr('leaveYes') }, run);
  }
  async function onClick(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-sfc]');
    if (!b || !b.closest('[data-sfc-root]')) return;
    const act = b.getAttribute('data-sfc');
    const sheet = S.sheets.find((s) => s.id === (b.getAttribute('data-id') || S.openId));
    if (act === 'retry') return load();
    if (act === 'new') return openSheet(null);
    if (act === 'open') return openSheet(sheet);
    if (act === 'use-template' && sheet) {
      const d = JSON.parse(JSON.stringify(sheet.data));
      S.openId = null; S.draft = { ...d, kind: 'sheet', name: tr('copyName', { name: sheet.name }) }; S.baseVersion = 0; S.dirty = true; S.pendingSave = false; S.history = null; S.conflict = null; S.message = '';
      return paint();
    }
    if (act === 'toggle-archived') { S.showArchived = !S.showArchived; return paint(); }
    if (act === 'export-all') return exportAll();
    if (act === 'export-sheet') return exportSheet();
    if (act === 'back') return leaveThen(() => { forgetDraft(); S.pendingSave = false; S.draft = null; S.openId = null; S.dirty = false; S.history = null; S.message = ''; S.conflict = null; paint(); });
    if (!S.draft) return;
    if (act === 'add-food' || act === 'add-pack') {
      S.draft.lines = S.draft.lines || [];
      S.draft.lines.push({ id: lineId(), name: '', type: act === 'add-pack' ? 'packaging' : 'food', packPrice: null, packQty: 1, packUnit: act === 'add-pack' ? 'unité' : 'kg', useQty: null, useUnit: act === 'add-pack' ? 'unité' : 'g', yieldPct: 100, priceDate: today() });
      S.dirty = true; return paint();
    }
    if (act === 'remove-line') { S.draft.lines.splice(+b.getAttribute('data-i'), 1); S.dirty = true; return paint(); }
    if (act === 'use-menu-price') { const it = menuItem(S.draft.menuItemId); if (it) { S.draft.sellingPrice = +it.price; S.dirty = true; paint(); } return; }
    if (act === 'to-recipe') return toRecipe();
    if (act === 'save') return save(false);
    if (act === 'keep-mine') return save(true);
    if (act === 'take-server' && S.conflict) { const srv = S.conflict; S.conflict = null; return openSheet(srv); }
    if (act === 'duplicate' && sheet) return leaveThen(async () => { const copy = await action({ action: 'duplicate', id: sheet.id, kind: 'sheet', name: tr('copyName', { name: sheet.name }) }); if (copy) openSheet(copy); });
    if (act === 'save-template' && sheet) { const copy = await action({ action: 'duplicate', id: sheet.id, kind: 'template', name: tr('templateName', { name: sheet.name }) }); if (copy) { S.message = tr('saved', { v: copy.version }); S.messageKind = 'ok'; paint(); } return; }
    if (act === 'archive' && sheet) return leaveThen(async () => { const upd = await action({ action: 'archive', id: sheet.id, archived: !sheet.archived, baseVersion: sheet.version }); if (upd) openSheet(upd); });
    if (act === 'history') return loadHistory();
    if (act === 'close-history') { S.history = null; S.snapshot = null; return paint(); }
    if (act === 'view-version') return loadSnapshot(+b.getAttribute('data-v'));
  }
  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    document.addEventListener('click', onClick);
    window.addEventListener('online', () => {
      if (S.pendingSave && S.dirty && S.draft && editable()) { save(false); return; }
      if (document.querySelector('[data-sfc-root]')) paint();
    });
    window.addEventListener('offline', () => { if (document.querySelector('[data-sfc-root]')) paint(); });
    window.addEventListener('kiwi:langchange', () => { if (document.querySelector('[data-sfc-root]')) paint(); });
    /* L'option arrive avec /api/config : l'onglet apparaît sans recharger. */
    document.addEventListener('kiwi-config', () => { try { if (window.KiwiFinance && window.KiwiFinance.isActive && window.KiwiFinance.isActive()) window.KiwiFinance.render(); } catch (_) {} });
    window.addEventListener('beforeunload', (e) => { if (S.dirty && S.draft) { e.preventDefault(); e.returnValue = ''; } });
  }

  function style() {
    if (document.getElementById('sfc-css')) return;
    const s = document.createElement('style');
    s.id = 'sfc-css';
    s.textContent = `
.sfc-head{margin-bottom:14px}
.sfc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0}
.sfc-btn{font:inherit;font-size:13px;padding:8px 13px;border-radius:999px;border:1px solid var(--n-200);background:var(--surface);color:var(--ink);cursor:pointer;transition:background-color .17s,border-color .17s}
.sfc-btn:hover{border-color:var(--n-400,#9aa29e)}
.sfc-btn.primary{background:var(--atlas);border-color:var(--atlas);color:var(--paper)}
.sfc-btn.ghost{background:transparent}
.sfc-btn[disabled]{opacity:.5;cursor:default}
.sfc-link{font:inherit;background:none;border:0;padding:0;color:var(--atlas);text-decoration:underline;cursor:pointer}
.sfc-h3{font-size:14px;font-weight:600;margin:18px 0 6px}
.sfc-note{margin:10px 0;padding:10px 13px;border-radius:11px;border:1px solid var(--n-200);background:var(--paper-soft);font-size:13px}
.sfc-note.warn{border-color:color-mix(in srgb,var(--atlas) 35%,var(--n-200))}
.sfc-note.ok{border-color:var(--atlas)}
.sfc-unknown{color:var(--n-500)}
.sfc-hint{display:block;margin-top:4px;color:var(--n-500);font-size:12px}
.sfc-st{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;border:1px solid var(--n-200);background:var(--paper-soft)}
.sfc-st.ok{border-color:var(--atlas);color:var(--atlas)}
.sfc-st.incomplete,.sfc-st.stale{color:var(--n-600)}
.sfc-table td small,.sfc-lines td small{display:block;margin-top:3px;color:var(--n-500);font-size:11px}
.sfc-table td:last-child{text-align:end;white-space:nowrap}
.sfc-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.sfc-form label{display:grid;gap:5px;font-size:12px;color:var(--n-600)}
.sfc-form label.wide{grid-column:1/-1}
.sfc-form label.check{display:flex;align-items:center;gap:8px;align-self:end}
.sfc input,.sfc select{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--n-200);border-radius:9px;padding:7px 9px;min-width:0;width:100%;box-sizing:border-box}
.sfc input[type=checkbox]{width:auto}
.sfc input:disabled,.sfc select:disabled{opacity:.7}
.sfc-lines td{vertical-align:top}
.sfc-lines{min-width:1120px}
.sfc-lines td:nth-child(1){min-width:150px}
.sfc-lines td:nth-child(2){min-width:104px;white-space:nowrap}
.sfc-lines td:nth-child(3){min-width:130px}
.sfc-lines td:nth-child(6),.sfc-lines td:nth-child(8){min-width:96px}
.sfc-lines td:nth-child(10){min-width:140px}
.sfc-lines .kiwi-select{min-width:100%}
.sfc-lines td:nth-child(n+4):nth-child(-n+9) input{max-width:110px}
.sfc-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 8px}
.sfc-summary>div{display:grid;gap:6px;padding:14px 15px;background:var(--surface);border:1px solid var(--n-200);border-radius:13px}
.sfc-summary>div.hl{border-color:var(--atlas)}
.sfc-summary span{font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}
.sfc-summary b{font-size:19px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sfc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sfc-history{margin-top:16px;padding:14px;border:1px solid var(--n-200);border-radius:13px;background:var(--paper-soft)}
.sfc-history-h,.sfc-hrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0}
.sfc-hrow{border-top:1px solid var(--n-200);font-size:13px}
.sfc-snapshot{margin-top:12px}
@media (max-width:900px){.sfc-summary{grid-template-columns:1fr 1fr}.sfc-form{grid-template-columns:1fr 1fr}}
@media (max-width:720px){.sfc-form{grid-template-columns:1fr}
.sfc-lines thead,.sfc-table thead{display:none}
.sfc-lines,.sfc-lines tbody,.sfc-table,.sfc-table tbody{display:block}
.sfc-lines tr,.sfc-table tr{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;padding:12px 0;border-bottom:1px solid var(--n-200)}
.sfc-lines td,.sfc-table td{display:block;padding:0}
.sfc-lines td:first-child,.sfc-table td:first-child{grid-column:1/-1}
.sfc-lines td:nth-child(2)::before{content:var(--l2)}.sfc-lines td:nth-child(3)::before{content:var(--l3)}.sfc-lines td:nth-child(4)::before{content:var(--l4)}.sfc-lines td:nth-child(5)::before{content:var(--l5)}.sfc-lines td:nth-child(6)::before{content:var(--l6)}.sfc-lines td:nth-child(7)::before{content:var(--l7)}.sfc-lines td:nth-child(8)::before{content:var(--l8)}.sfc-lines td:nth-child(9)::before{content:var(--l9)}.sfc-lines td:nth-child(10)::before{content:var(--l10)}
.sfc-lines td::before{display:block;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:3px}
.sfc-lines td:nth-child(n+4):nth-child(-n+9) input{max-width:none}
.sfc-lines{min-width:0}.sfc-lines td{min-width:0!important}
.sfc-table td:last-child{text-align:start}}
`;
    document.head.appendChild(s);
  }

  bind();
  window.KiwiSimpleFoodCost = { available, panel, compute, estimates, recipeSeed, tabLabel: () => tr('tab'), _state: S, _toRecipe: toRecipe, _exportRows: sheetRows };
}());
