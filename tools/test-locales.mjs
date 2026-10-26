// Browser scenario locales. Static translation checks keep their full language set.
export const LOCALES = process.env.KIWI_LOCALES ? process.env.KIWI_LOCALES.split(',') : ['fr'];

// Tuple matrices carry their locale in the first column. Preserve suite order.
export function forLocales(list) {
  return list.filter(item => LOCALES.includes(Array.isArray(item) ? item[0] : item));
}
