/* L'addition · la note qu'on pose sur la table AVANT l'encaissement.
 *
 * Elle porte l'en-tête du vrai reçu (logo, enseigne, adresse, téléphone, tels
 * que Réglages › Reçu les donne) pour que le client sache où il est, mais elle
 * ne peut pas passer pour un reçu : pas de numéro, pas d'identifiants fiscaux,
 * pas de moyen de paiement, et un cadre « CECI N'EST PAS UN REÇU ». Ne rien écrire du paiement, c'est aussi ce qui laisse le client
 * choisir carte ou espèces après l'avoir lue.
 *
 * receipt.js garde ses trois rendus et passe la main ici dès que `doc.prebill`
 * est posé (KiwiReceipt.ext.prebill), comme pour le ticket cadeau : il est à
 * son plafond de taille. Le document passe par KiwiReceipt.print, donc par la
 * même imprimante et le même repli (pilote système) que le reçu. */
(function () {
  'use strict';
  var K = window.KiwiReceipt;
  if (!K || !K.ext) return;

  var WORDS = {
    fr: {
      title: 'ADDITION', toPay: 'TOTAL À PAYER', subtotal: 'Sous-total', discount: 'Remise',
      notReceipt: 'CECI N’EST PAS UN REÇU', notProof: 'Non valable comme justificatif de paiement.',
      after: 'Votre reçu vous sera remis après le paiement.', thanks: 'Merci de votre visite',
    },
    en: {
      title: 'BILL', toPay: 'TOTAL TO PAY', subtotal: 'Subtotal', discount: 'Discount',
      notReceipt: 'THIS IS NOT A RECEIPT', notProof: 'Not valid as proof of payment.',
      after: 'Your receipt will be given after payment.', thanks: 'Thank you for your visit',
    },
    ar: {
      title: 'الفاتورة', toPay: 'المجموع للأداء', subtotal: 'المجموع الفرعي', discount: 'تخفيض',
      notReceipt: 'هذه ليست وصلا', notProof: 'لا تصلح كإثبات للأداء.',
      after: 'سيسلم لك الوصل بعد الأداء.', thanks: 'شكرا على زيارتكم',
    },
  };
  var words = function (l) { return WORDS[l] || WORDS.fr; };
  function spaced(s) { return s.split('').join(' '); }
  var mad = function (n, doc) { return K.moneyMAD(n, doc); };

  /* Un reçu construit (KiwiReceipt.build) devient une addition : tout ce qui
     ferait d'elle une pièce de caisse s'en va. `label` est le nom de la
     commande à l'écran (« Table 4 », « À emporter »). */
  function of(doc, label) {
    if (!doc) return null;
    var T = doc.T, d;
    try { d = JSON.parse(JSON.stringify(Object.assign({}, doc, { T: null }))); } catch (_) { return null; }
    d.T = T;
    d.prebill = { label: String(label || '').slice(0, 40) };
    d.kind = 'sale';
    d.copy = ''; d.second = ''; d.welcome = '';
    d.pay = []; d.cash = null; d.customer = null; d.acompte = null; d.refund = null; d.voucher = null; d.summary = null;
    d.shop = Object.assign({}, d.shop, { legal: [] });
    if (d.totals) d.totals.vat = null;
    d.meta = { ref: '', date: (d.meta && d.meta.date) || '', time: (d.meta && d.meta.time) || '' };
    d.foot = d.foot || {};
    return d;
  }
  function moneyRows(doc, W, R) {
    var t = doc.totals || {};
    if (t.discount > 0 || t.promo > 0) R(W.subtotal, mad(t.subtotal, doc));
    if (t.promo > 0) R(t.promoLabel || W.discount, '- ' + mad(t.promo, doc));
    if (t.discount > 0) R(W.discount, '- ' + mad(t.discount, doc));
  }

  /* ── thermique (ESC/POS), appelé par receipt.js › escpos après l'en-tête ── */
  function escpos(b, doc, h) {
    var W = words(doc.lang), cols = h.cols, ar = doc.lang === 'ar';
    var wrapped = function (s) { h.wrap(s, cols).forEach(function (x) { b.line(x); }); };
    var frame = ' ' + new Array(cols - 1).join('=');
    b.feed(1).align('center').bold(true).size(2, 2);
    b.line(ar ? W.title : spaced(W.title));
    b.size(1, 1).feedDots(10);
    if (doc.prebill.label) b.size(1, 2).line(doc.prebill.label).size(1, 1);
    if (doc.meta.date) b.line(doc.meta.date + '  ' + doc.meta.time);
    b.align('left');
    h.rule();
    doc.lines.forEach(function (l) {
      var right = mad(l.total, doc);
      var left = (l.formulaChoice ? '   + ' : l.qty + '× ') + l.name;
      var room = cols - 3 - right.length;
      if (left.length > room && room > 8) {
        var w = h.wrap(left, room); left = w.pop();
        w.forEach(function (x) { b.line(' ' + x); });
      }
      h.row(left, right);
      if (l.unit && !l.formulaChoice) b.line('    ' + K.money(l.unit, doc) + ' × ' + l.qty);
      if (l.note) b.line('    > ' + l.note);
    });
    h.rule();
    moneyRows(doc, W, h.row);
    b.size(1, 2);
    h.row(W.toPay, mad(doc.totals.total + (doc.totals.tip || 0), doc), true);
    b.size(1, 1);
    h.rule();
    b.feed(1).line(frame).align('center');
    b.size(1, 2).line(W.notReceipt).size(1, 1);
    wrapped(W.notProof);
    b.align('left').line(frame).align('center');
    b.feed(1);
    wrapped(W.after);
    b.feed(1).line(W.thanks);
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
    var R = function (k, v, style) { out.push('<div class="kr-r"' + (style ? ' style="' + style + '"' : '') + '><span>' + e(k) + '</span><span>' + e(v) + '</span></div>'); };
    out.push('<div class="kr-rule" style="margin-top:3mm;"></div>');
    out.push('<div style="text-align:center;margin:2.6mm 0 0;font-weight:700;font-size:20px;letter-spacing:.3em;padding-left:.3em;">' + e(W.title) + '</div>');
    if (doc.prebill.label) C('font-weight:700;font-size:16px;margin-top:2.4mm;', doc.prebill.label);
    if (doc.meta.date) C('font-size:11px;margin:.6mm 0 2.4mm;', doc.meta.date + '  ' + doc.meta.time);
    out.push('<div class="kr-rule"></div>');
    doc.lines.forEach(function (l) {
      var name = l.formulaChoice ? '<span style="padding-left:6mm;">+ ' + e(l.name) + '</span>'
        : '<b style="display:inline-block;min-width:7mm;">' + e(l.qty) + '×</b>' + e(l.name);
      out.push('<div class="kr-r kr-item"><span>' + name + '</span><span>' + e(mad(l.total, doc)) + '</span></div>');
      var sub = [];
      if (l.unit && !l.formulaChoice) sub.push(h.code(K.money(l.unit, doc) + ' × ' + l.qty));
      if (l.note) sub.push(e('> ' + l.note));
      if (sub.length) out.push('<div class="kr-sub">' + sub.join(' · ') + '</div>');
    });
    out.push('<div class="kr-rule"></div>');
    moneyRows(doc, W, function (k, v) { R(k, v); });
    R(W.toPay, mad(doc.totals.total + (doc.totals.tip || 0), doc), 'font-weight:700;font-size:17px;margin-top:1mm;');
    out.push('<div class="kr-rule"></div>');
    out.push('<div style="margin:3.4mm 0 0;padding:2.2mm 2mm;border:1.5px solid #111;border-radius:2mm;text-align:center;">'
      + '<div style="font-weight:700;font-size:13px;letter-spacing:.06em;">' + e(W.notReceipt) + '</div>'
      + '<div style="font-size:10px;margin-top:.6mm;">' + e(W.notProof) + '</div></div>');
    C('font-size:10px;margin-top:2.4mm;', W.after);
    C('font-weight:700;margin-top:2.4mm;', W.thanks);
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
    out.push(W.title);
    if (doc.prebill.label) out.push(doc.prebill.label);
    if (doc.meta.date) out.push(doc.meta.date + ' ' + doc.meta.time);
    out.push(rule);
    doc.lines.forEach(function (l) { out.push(h.row((l.formulaChoice ? '  + ' : l.qty + '× ') + l.name, mad(l.total, doc))); });
    out.push(rule);
    moneyRows(doc, W, function (k, v) { out.push(h.row(k, v)); });
    out.push(h.row(W.toPay, mad(doc.totals.total + (doc.totals.tip || 0), doc)), rule, W.notReceipt, W.notProof, '', W.after);
    return out.join('\n');
  }

  function print(doc, label) {
    var d = of(doc, label);
    if (!d) return Promise.resolve({ ok: false, reason: 'addition introuvable' });
    return Promise.resolve(K.print(d));
  }

  K.ext.prebill = { of: of, print: print, escpos: escpos, html: html, text: text, WORDS: WORDS };
})();

/* L'addition de la commande à l'écran, telle que la caisse la tend
   (assets/caisse/receipts.js › printPreBill, qui charge ce module au premier
   tirage) : lignes, total affiché, options du reçu et nom de la commande. */
export function printPreBill(a) {
  var K = window.KiwiReceipt;
  if (!K || !K.build || !K.ext || !K.ext.prebill) return Promise.reject(new Error('prebill'));
  var lines = a.lines || [];
  var sum = lines.reduce(function (s, l) { return s + (+l.total || 0); }, 0);
  var shown = a.total;
  var total = isFinite(shown) && shown > 0 && shown <= sum + 0.005 ? shown : sum;
  var discount = Math.max(0, Math.round((sum - total) * 100) / 100);
  var doc = K.build({ lines: lines, subtotal: sum, total: total, discount: discount, ts: Date.now() }, a.opts || {});
  return K.ext.prebill.print(doc, a.label);
}
