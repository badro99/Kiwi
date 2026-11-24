/* Kiwi · le ticket d'un commerce hors du Maroc · KiwiReceipt.ext.country
 *
 * Owner, 24 nov. 2026 (CHICTRATEC SL, Startoner, en Espagne). Le ticket part
 * chez le client : pour un commerce espagnol il est en espagnol, en euros, titré
 * « FACTURA SIMPLIFICADA », avec l'IVA et le NIF, quelle que soit la langue de
 * la caisse (l'interface du commerçant reste en français). receipt.js est à son
 * plafond de taille : il appelle ces fonctions par une ligne chacune, et sans ce
 * fichier il reste le ticket marocain d'avant.
 * Le pays : window.KiwiCurrency.profile() (assets/kiwi-country.js).
 */
(function () {
  'use strict';
  var K = window.KiwiReceipt;
  if (!K || !K.ext) return;

  var ES = {
    __lang: 'es', article: 'Artículo', receipt: 'FACTURA SIMPLIFICADA', refund: 'DEVOLUCIÓN', no: 'N.º', date: 'Fecha', time: 'Hora',
    cashier: 'Cajero', terminal: 'Terminal', client: 'Cliente', owed: 'Total pendiente', points: 'Puntos', subtotal: 'Subtotal',
    discount: 'Descuento', promo: 'Promoción', saved: 'Ha ahorrado', ht: 'Base imponible', vat: 'IVA', total: 'TOTAL',
    totalRefund: 'TOTAL DEVUELTO', tip: 'Propina', paid: 'Pagado', received: 'Entregado', change: 'Cambio', origin: 'Ticket original',
    reason: 'Motivo', thanks: 'Gracias por su compra', copy: 'DUPLICADO', report: 'INFORME DE VENTAS', period: 'Periodo',
    count: 'Ventas', avg: 'Ticket medio', ref: 'Ref.', share: 'parte', takeaway: 'Para llevar',
  };
  var ES_METHODS = { cash: 'Efectivo', card: 'Tarjeta', tap: 'Sin contacto', qr: 'QR', wallet: 'Transferencia', avoir: 'Vale', mixed: 'Mixto' };

  function profile() { try { return (window.KiwiCurrency && window.KiwiCurrency.profile()) || null; } catch (_) { return null; } }
  function spanish() { var p = profile(); return !!(p && p.code === 'ES'); }

  K.ext.country = {
    /* La langue du ticket : l'espagnol pour un commerce espagnol, sauf une caisse
       réglée en anglais ou en arabe (receipt.js garde alors son choix). */
    lang: function () { return spanish() ? 'es' : ''; },
    dict: function (l) {
      return l === 'es' ? ES : null;   // ailleurs : le dictionnaire de receipt.js, inchangé
    },
    methods: function (l) { return l === 'es' ? ES_METHODS : null; },
    symbol: function () { var p = profile(); return (p && p.symbol) || 'MAD'; },
    /* Le taux d'IVA d'un ticket que le commerçant n'a pas réglé : 21 % inclus en Espagne
       (une factura simplificada dit son IVA). Ailleurs rien : le ticket marocain reste sans TVA par défaut. */
    vatDefault: function () { var p = profile(); return p && p.code !== 'MA' && p.defaultVat ? p.defaultVat : 0; },
    taxId: function () { var p = profile(); return (p && p.taxId) || 'ICE'; },
    /* Le libellé du champ « ICE » des réglages : « NIF » pour un commerce espagnol. */
    taxLabel: function () { var p = profile(); if (!p || !p.taxId || p.taxId === 'ICE') return null; return { fr: p.taxId, en: p.taxId, ar: p.taxId }; },
    ES: ES,
  };
})();
