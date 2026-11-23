/* Le ticket cadeau · God mode › « Ticket cadeau (sans les prix) »,
 * features.giftReceipt, éteint par défaut.
 *
 * C'est le reçu que la boutique a réglé dans Réglages › Reçu (logo, enseigne,
 * adresse, mentions légales, politique d'échange, largeur du rouleau), sans un
 * seul montant : ni prix, ni total, ni paiement, ni rendu, ni la fiche de
 * celle qui offre. Le numéro et la date restent, c'est ce qu'il faut pour
 * retrouver la vente le jour de l'échange. À la place de l'argent, un mot pour
 * la personne qui reçoit le cadeau.
 *
 * receipt.js garde ses trois rendus et passe la main ici dès que `doc.gift` est
 * posé (KiwiReceipt.ext.gift) : il est à son plafond de taille
 * (tools/file-size-ratchet-test.mjs). Le document passe par KiwiReceipt.print
 * comme un reçu, donc par la même imprimante, la même file et le même repli. */
(function () {
  'use strict';
  var K = window.KiwiReceipt;
  if (!K || !K.ext) return;

  var WORDS = {
    fr: {
      title: 'TICKET CADEAU', hello: 'Un cadeau rien que pour vous',
      wish: ['Quelqu’un a pensé à vous,', 'et c’est une très belle chose.', 'Félicitations, et belle fête !'],
      swap: 'Échange ou avoir sur présentation de ce ticket.',
    },
    en: {
      title: 'GIFT RECEIPT', hello: 'A gift just for you',
      wish: ['Someone was thinking of you,', 'and that is a lovely thing.', 'Congratulations, and enjoy the day!'],
      swap: 'Exchange or store credit on presentation of this receipt.',
    },
    ar: {
      title: 'تذكرة هدية', hello: 'هدية خاصة لك',
      wish: ['شخص ما فكّر فيك،', 'وهذا شيء جميل.', 'مبروك، وأيام سعيدة!'],
      swap: 'الاستبدال أو قسيمة شراء عند تقديم هذه التذكرة.',
    },
  };
  var words = function (l) { return WORDS[l] || WORDS.fr; };
  var ORN = '~  *  ~  *  ~  *  ~';
  /* Material Symbols « redeem », tel qu'il est vendu dans assets/icons/material. */
  var REDEEM = 'M160-280v80h640v-80H160Zm0-440h88q-5-9-6.5-19t-1.5-21q0-50 35-85t85-35q30 0 55.5 15.5T460-826l20 26 20-26q18-24 44-39t56-15q50 0 85 35t35 85q0 11-1.5 21t-6.5 19h88q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720Zm0 320h640v-240H596l84 114-64 46-136-184-136 184-64-46 82-114H160v240Zm228.5-331.5Q400-743 400-760t-11.5-28.5Q377-800 360-800t-28.5 11.5Q320-777 320-760t11.5 28.5Q343-720 360-720t28.5-11.5ZM600-720q17 0 28.5-11.5T640-760q0-17-11.5-28.5T600-800q-17 0-28.5 11.5T560-760q0 17 11.5 28.5T600-720Z';

  function enabled() {
    try { var f = window.KiwiConfig && window.KiwiConfig.features; return !!f && f.giftReceipt === true; } catch (_) { return false; }
  }

  /* Un reçu construit (KiwiReceipt.build / fromSnapshot) devient son ticket
     cadeau. Tout ce qui dit un montant, un paiement ou une personne s'en va. */
  function of(doc) {
    if (!doc) return null;
    var T = doc.T, d;
    try { d = JSON.parse(JSON.stringify(Object.assign({}, doc, { T: null }))); } catch (_) { return null; }
    d.T = T;
    d.gift = true;
    d.kind = 'sale';
    d.copy = ''; d.second = ''; d.welcome = '';
    d.pay = []; d.cash = null; d.customer = null; d.acompte = null; d.refund = null; d.voucher = null; d.summary = null;
    d.totals = { subtotal: 0, discount: 0, promo: 0, promoLabel: '', tip: 0, total: 0, vat: null };
    d.meta = { ref: (d.meta && d.meta.ref) || '', date: (d.meta && d.meta.date) || '', time: (d.meta && d.meta.time) || '' };
    d.lines = (d.lines || []).map(function (l) { return { qty: (l && +l.qty) || 1, name: (l && l.name) || '', barcode: (l && l.barcode) || '' }; });
    d.foot = d.foot || {};
    return d;
  }

  /* ── thermique (ESC/POS), appelé par receipt.js › escpos après l'en-tête ── */
  function escpos(b, doc, h) {
    var W = words(doc.lang), cols = h.cols;
    var wrapped = function (s) { h.wrap(s, cols).forEach(function (x) { b.line(x); }); };
    b.feed(1).align('center').line(ORN);
    b.size(1, 2).line('*  ' + W.title + '  *').size(1, 1);
    b.line(W.hello).line(ORN);
    b.align('left'); h.rule();
    if (doc.meta.ref) h.row(h.T.no, doc.meta.ref);
    if (doc.meta.date) h.row(h.T.date, doc.meta.date + '  ' + doc.meta.time);
    h.rule();
    doc.lines.forEach(function (l) {
      h.wrap(l.qty + '× ' + l.name, cols - 2).forEach(function (x) { b.line(' ' + x); });
      if (l.barcode) b.line('    ' + l.barcode);
    });
    h.rule();
    b.align('center').feed(1);
    W.wish.forEach(wrapped);
    b.feed(1); wrapped(W.swap);
    if (doc.foot.policy) wrapped(doc.foot.policy);
    if (doc.foot.social) b.line(doc.foot.social);
    if (doc.foot.web) b.line(doc.foot.web);
    if (doc.foot.whatsapp) b.line('WhatsApp ' + doc.foot.whatsapp);
    b.feed(1).line(h.credit);
    b.feed(2).cut();
    return b.bytes();
  }

  /* ── écran et impression système, appelé par receipt.js › html ── */
  function html(doc, out, h) {
    var W = words(doc.lang), e = h.esc;
    var C = function (style, txt) { out.push('<div style="text-align:center;' + style + '">' + e(txt) + '</div>'); };
    out.push('<div class="kr-rule"></div>');
    out.push('<div style="text-align:center;margin:3mm 0 1mm;"><svg viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" aria-hidden="true" style="display:block;margin:0 auto;"><path d="' + REDEEM + '"/></svg></div>');
    C('font-weight:700;font-size:15px;letter-spacing:.18em;', W.title);
    C('font-size:12px;margin:1mm 0 2mm;', W.hello);
    C('font-size:10px;letter-spacing:.2em;opacity:.6;', ORN);
    out.push('<div class="kr-rule"></div>');
    if (doc.meta.ref) h.Rh(h.T.no, h.code(doc.meta.ref));
    if (doc.meta.date) h.Rh(h.T.date, h.code(doc.meta.date + '  ' + doc.meta.time));
    out.push('<div class="kr-rule"></div>');
    doc.lines.forEach(function (l) {
      out.push('<div class="kr-r kr-item"><span>' + e(l.qty + '× ' + l.name) + '</span><span></span></div>');
      if (l.barcode) out.push('<div class="kr-sub">' + h.code(l.barcode) + '</div>');
    });
    out.push('<div class="kr-rule"></div>');
    W.wish.forEach(function (x, i) { C(i === W.wish.length - 1 ? 'font-weight:700;margin-top:1mm;' : '', x); });
    C('font-size:9px;opacity:.85;margin-top:2.4mm;', W.swap);
    if (doc.foot.policy) h.P('kr-c kr-xs', doc.foot.policy);
    if (doc.foot.social) h.P('kr-c kr-xs', doc.foot.social);
    if (doc.foot.web) h.P('kr-c kr-xs', doc.foot.web);
    if (doc.foot.whatsapp) h.P('kr-c kr-xs', 'WhatsApp ' + doc.foot.whatsapp);
    h.P('kr-c kr-xs kr-kiwi', h.credit);
    out.push('</div>');
    return out.join('');
  }

  /* ── texte brut, appelé par receipt.js › text ── */
  function text(doc, out, h) {
    var W = words(doc.lang), rule = new Array(h.cols + 1).join('-');
    out.push(W.title, W.hello, rule);
    if (doc.meta.ref) out.push(h.row(h.T.no, doc.meta.ref));
    if (doc.meta.date) out.push(h.row(h.T.date, doc.meta.date + ' ' + doc.meta.time));
    out.push(rule);
    doc.lines.forEach(function (l) { out.push(l.qty + '× ' + l.name); });
    out.push(rule);
    return out.concat(W.wish, ['', W.swap]).join('\n');
  }

  /* Imprimer le ticket cadeau d'un reçu. `key` (« boutique:<vente> ») le fait
     passer par la file d'impression du poste, derrière le reçu qu'elle vient
     d'accepter ; sans file, il part directement, comme une réimpression. */
  function ready() {
    var KP = window.KiwiPrinter;
    try {
      if (!KP) return false;
      if (KP.isConnected ? KP.isConnected() : (KP.isConfigured && KP.isConfigured())) return true;
      return !!((KP.getConfig && KP.getConfig()) || {}).browserFallback;
    } catch (_) { return false; }
  }
  /* `auto` : sorti tout seul après un paiement. Sans imprimante, il ne part pas
     vers la boîte d'impression du système (même règle que le reçu, checkout.js
     › printReceiptNow) ; il se réimprime depuis « Réimprimer ». */
  function print(base, key, auto) {
    var g = of(base);
    if (!g) return Promise.resolve({ ok: false, reason: 'ticket introuvable' });
    var q = window.KiwiKitchenPrint;
    if (key && q && typeof q.enqueueReceipt === 'function') {
      try {
        var r = q.enqueueReceipt(key + ':gift', g, 'original');
        if (r && (r.accepted || r.pending)) return Promise.resolve({ ok: true, via: 'queue' });
      } catch (_) {}
    }
    if (auto && !ready()) return Promise.resolve({ ok: false, reason: 'aucune imprimante' });
    return Promise.resolve(K.print(g));
  }

  K.ext.gift = { enabled: enabled, of: of, print: print, escpos: escpos, html: html, text: text, WORDS: WORDS };
})();
