
  /* ═══════════════ HELPERS ═══════════════ */
  const fmt = (n) => (window.KiwiNumber?.format(Math.round(n), {}) ?? Math.round(n).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  /* An amount reads left to right inside Arabic: the isolate keeps « MAD »
   * after the figure in a toast as well as in markup. */
  const MAD = (n) => (hxLang() === 'ar' ? '⁦' + fmt(n) + ' MAD⁩' : fmt(n) + ' MAD');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  /* Editors are declared outside register(), so they cannot see the
   * register-local `toast` destructuring. Always resolve the shared UI helper
   * at call time; this keeps reservation and OTA actions usable without
   * duplicating notification code in each workflow. */
  const toast = (message, options) => window.Kiwi?.toast?.(message, options);
  const TAX_PP_NIGHT = 25; // taxe de séjour (TPT + taxe communale) · MAD / adulte / nuit

  const { hxLang, hxLocale, tx, txk, HX_N, txn, ltr, hxTo, hxColon, HX_T } = window.__kiwiHotelInternal.language();
