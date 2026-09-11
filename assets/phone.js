/* Kiwi · shared international telephone rules
 *
 * One canonical rule for every merchant surface: Moroccan local numbers keep
 * their familiar 06… display, while visitors can use any international number
 * when it carries an explicit country code (+ or 00).  The same canonical key
 * is used for client matching and WhatsApp so two different countries can
 * never collide merely because their last digits happen to match. */
(function () {
  'use strict';

  function raw(value) { return String(value == null ? '' : value).trim(); }
  function compact(value) {
    var s = raw(value);
    if (!s || /[A-Za-z]/.test(s)) return '';
    // Common traveller notation: +33 (0)6… — the trunk zero is not dialled
    // outside the country.  Remove it only immediately after the country code.
    s = s.replace(/^(\+|00)(\d{1,3})\s*\(0\)/, '$1$2');
    if ((s.match(/\+/g) || []).length > 1 || (s.indexOf('+') > 0)) return '';
    return s.replace(/[\s().-]/g, '');
  }
  function moroccanLocal(digits) {
    if (/^212[567]\d{8}$/.test(digits)) return '0' + digits.slice(3);
    if (/^0[567]\d{8}$/.test(digits)) return digits;
    if (/^[567]\d{8}$/.test(digits)) return '0' + digits;
    return '';
  }
  function formatMorocco(local) {
    return local.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
  }
  function normalize(value) {
    var s = compact(value);
    if (!s) return '';
    var explicit = s.charAt(0) === '+' || s.slice(0, 2) === '00';
    var digits = s.replace(/^\+|^00/, '');
    var ma = moroccanLocal(digits);
    if (ma) return formatMorocco(ma);
    // A bare number is interpreted only as a Moroccan national number.  This
    // prevents ambiguous tourist numbers from being saved under the wrong flag.
    if (!explicit || !/^[1-9]\d{6,14}$/.test(digits)) return '';
    return '+' + digits;
  }
  function digits(value) {
    var n = normalize(value);
    if (!n) return '';
    var d = n.replace(/\D/g, '');
    return /^0[567]\d{8}$/.test(d) ? '212' + d.slice(1) : d;
  }
  function same(a, b) {
    var x = digits(a), y = digits(b);
    return !!x && x === y;
  }
  function whatsapp(value) { return digits(value); }
  function valid(value) { return !!normalize(value); }
  function normalizeInput(input) {
    if (!input || !raw(input.value)) return '';
    var n = normalize(input.value);
    if (n && input.value !== n) {
      input.value = n;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return n;
  }

  window.KiwiPhone = Object.freeze({
    normalize: normalize,
    digits: digits,
    same: same,
    whatsapp: whatsapp,
    valid: valid,
    normalizeInput: normalizeInput,
  });

  // Covers every current and lazy-loaded vertical without coupling this truth
  // library to their render cycles.  Blur happens before a save button's click,
  // so all forms read the canonical value while still allowing partial typing.
  document.addEventListener('focusout', function (event) {
    var el = event.target;
    // `type=tel,inputmode=numeric` is also used by the employee PIN gate.  It
    // is deliberately excluded: a four-digit PIN is not customer data.
    if (el && el.matches && el.matches('input[inputmode="tel"], input[type="tel"]:not([inputmode="numeric"])')) normalizeInput(el);
  }, true);
}());
