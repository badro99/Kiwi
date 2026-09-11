// Langues proposées pour la carte publique. Cette table est recopiée dans
// assets/menu-i18n.js, qui ne peut pas importer un module Pages Functions.
export const CORE = ['fr','ar','en'];
export const EXTRA = ['es','de','it','pt','nl','ru','zh-Hans','zh-Hant','ja','ko','tr','he','pl','sv','no','da','hi','id','el','uk'];
export const RTL = ['ar','he'];

export const NATIVE_NAMES = Object.freeze({
  fr: 'Français', ar: 'العربية', en: 'English', es: 'Español', de: 'Deutsch',
  it: 'Italiano', pt: 'Português', nl: 'Nederlands', ru: 'Русский',
  'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', ja: '日本語', ko: '한국어',
  tr: 'Türkçe', he: 'עברית', pl: 'Polski', sv: 'Svenska', no: 'Norsk',
  da: 'Dansk', hi: 'हिन्दी', id: 'Bahasa Indonesia', el: 'Ελληνικά', uk: 'Українська',
});

export const MENU_LANGS = Object.freeze(CORE.concat(EXTRA));

export function canonicalMenuLang(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (lower === 'zh-hans' || lower === 'zh-cn' || lower === 'zh-sg') return 'zh-Hans';
  if (lower === 'zh-hant' || lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-Hant';
  const base = lower.split('-')[0];
  return MENU_LANGS.find((code) => code.toLowerCase() === lower)
    || MENU_LANGS.find((code) => code.toLowerCase() === base)
    || null;
}

export function isMenuLang(value) {
  return canonicalMenuLang(value) !== null;
}

export function normalizeMenuLangs(raw) {
  const out = CORE.slice();
  (Array.isArray(raw) ? raw : []).forEach((value) => {
    const code = canonicalMenuLang(value);
    if (code && !out.includes(code) && out.length < 24) out.push(code);
  });
  return out;
}
