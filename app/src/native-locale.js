/* One device-wide locale. Compatibility keys serve the existing web modules;
 * kiwiNativeLocale is authoritative on the next native launch. */
(function () {
  'use strict';
  var root = document.documentElement;
  var keys = ['kiwiNativeLocale', 'kiwiLang', 'kiwiCaisseLang', 'kiwiCuisineLang'];
  function valid(value) { return /^(fr|en|ar)$/.test(value || ''); }
  function read(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  var saved = keys.map(read).filter(valid)[0];
  var device = String((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').toLowerCase().split('-')[0];
  var current = saved || (valid(device) ? device : 'fr');
  function set(lang) {
    if (!valid(lang)) return current;
    current = lang;
    keys.forEach(function (key) { try { if (read(key) !== lang) localStorage.setItem(key, lang); } catch (_) {} });
    if (root.lang !== lang) root.lang = lang;
    var dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (root.dir !== dir) root.dir = dir;
    return lang;
  }
  root.classList.add('kiwi-native');
  window.KiwiNativeLocale = { get: function () { return current; }, set: set };
  set(current);
  // Kitchen and Team also own language pickers. Their root language is the
  // common event boundary, without replacing any of their translation engines.
  new MutationObserver(function () { if (valid(root.lang) && root.lang !== current) set(root.lang); })
    .observe(root, { attributes:true, attributeFilter:['lang'] });
})();
