// Fixed order wording only. Merchant course and modifier names stay in the catalogue.
export const words = {
  fr: {
    "opt_choose_one": "choisir 1", "opt_choose_many": "plusieurs possibles", "opt_required": "obligatoire",
    "opt_required_missing": "Choisissez une option pour « {name} ».", "opt_unavailable": "Option indisponible", "opt_retirer_prefix": "Sans ",
    "custom_note_optional": "facultatif", "btn_add": "Ajouter", "bill_order_label": "Commande",
    "preparing": "En préparation", "ready": "Prête", "served": "Servie",
    "new": "Nouvelle", "suite": "Suite", "quantity": "×"
  },
  en: {
    "opt_choose_one": "pick 1", "opt_choose_many": "pick any", "opt_required": "required",
    "opt_required_missing": "Choose an option for “{name}”.", "opt_unavailable": "Option unavailable", "opt_retirer_prefix": "No ",
    "custom_note_optional": "optional", "btn_add": "Add", "bill_order_label": "Order",
    "preparing": "Preparing", "ready": "Ready", "served": "Served",
    "new": "New", "suite": "Next course", "quantity": "×"
  },
  ar: {
    "opt_choose_one": "اختار 1", "opt_choose_many": "اختار اللي بغيتي", "opt_required": "ضروري",
    "opt_required_missing": "اختار واحد الاختيار فـ «{name}».", "opt_unavailable": "خيار غير متوفر", "opt_retirer_prefix": "بلا ",
    "custom_note_optional": "اختياري", "btn_add": "زيد", "bill_order_label": "الطلب",
    "preparing": "قيد التحضير", "ready": "جاهزة", "served": "تم تقديمها",
    "new": "جديدة", "suite": "التالي", "quantity": "×"
  },
};
// Preserve the waiter sheet's shipped labels; guest spelling remains the default.
export const waiterWords = { fr: { opt_required: 'Obligatoire', custom_note_optional: 'Optionnel' },
  en: { opt_required: 'Required', custom_note_optional: 'Optional' }, ar: { opt_required: 'إجباري', custom_note_optional: 'اختياري', btn_add: 'إضافة' } };
export const word = (lang, key, surface) => {
  const locale = words[lang] ? lang : 'en';
  return (surface === 'waiter' ? waiterWords[locale][key] : undefined) ?? words[locale][key] ?? words.fr[key];
};
