/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LE PAYS D'EXPLOITATION · window.KiwiCountryCatalog
 * ---------------------------------------------------------------------------
 * Owner, 24 nov. 2026 (CHICTRATEC SL, la boutique Startoner, en Espagne) :
 * « this company is mainly in spain, so please also change what needs to be
 * changed for that, and add a toggle in godmode so that we can choose the
 * country of operations ».
 *
 * Une seule table, trois lecteurs :
 *   - le serveur (functions/api/_country.js) : /api/config, la console, le
 *     webhook Shopify (une commande en euros est une vente d'un commerce espagnol) ;
 *   - les écrans (assets/kiwi-country.js) : la devise et le format des montants ;
 *   - la console God Mode (assets/admin-country.js) : le sélecteur.
 *
 * Le Maroc reste la valeur par défaut : un commerce sans pays (toutes les lignes
 * d'avant ce jour) reste exactement ce qu'il était, au dirham près.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (/** @type {any} */ root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.KiwiCountryCatalog = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var COUNTRIES = {
    MA: {
      code: 'MA', name: { fr: 'Maroc', en: 'Morocco', ar: 'المغرب' },
      currency: 'MAD', symbol: 'MAD', decimals: 2, locale: 'fr-MA', zone: 'Africa/Casablanca',
      vatLabel: 'TVA', vat: [20, 14, 10, 7, 0], defaultVat: 20,
      taxId: 'ICE', phone: '+212', receiptTitle: 'Ticket de caisse',
    },
    ES: {
      code: 'ES', name: { fr: 'Espagne', en: 'Spain', ar: 'إسبانيا' },
      currency: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES', zone: 'Europe/Madrid',
      vatLabel: 'IVA', vat: [21, 10, 4, 0], defaultVat: 21,
      taxId: 'NIF', phone: '+34', receiptTitle: 'Factura simplificada',
      // Le portefeuille (moyen « wallet ») : PayPal en ligne, Bizum au comptoir.
      walletLabel: 'PayPal / Bizum',
    },
  };
  var DEFAULT = 'MA';
  var CODES = Object.keys(COUNTRIES);

  function normalize(code) {
    var c = String(code == null ? '' : code).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(COUNTRIES, c) ? c : DEFAULT;
  }
  /* Une copie : un lecteur qui la modifie ne change pas le pays des autres. */
  function profile(code) {
    var p = COUNTRIES[normalize(code)];
    return JSON.parse(JSON.stringify(p));
  }
  function label(code, lang) {
    var n = COUNTRIES[normalize(code)].name;
    return n[lang] || n.fr;
  }
  /* La devise qu'un commerce de ce pays encaisse. Le webhook Shopify n'accepte
   * qu'elle : une commande dans une autre devise reste une anomalie visible. */
  function currencyOf(code) { return COUNTRIES[normalize(code)].currency; }

  return Object.freeze({ DEFAULT: DEFAULT, CODES: CODES.slice(), normalize: normalize, profile: profile, label: label, currencyOf: currencyOf });
});
