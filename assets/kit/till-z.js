/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/till-z.js · the Z report sheet that follows the close
 * (spec §18.9 "Z report"; stage 4). Loaded only when the till's flag is on;
 * with it off the till keeps its post-close sheet (#zsheet-modal).
 *
 *   KiwiTillZ.open({report, n, onPrint, onDone})
 *     report   the shipped day report the close just saved (buildDayReport)
 *     n        the Z number
 *     onPrint  the shipped print (doPrintDayReport); resolves {ok}
 *     onDone   the shipped end of the close (finishClose)
 *
 * It draws only what the shipped report knows: sales by method (summing to
 * the total), refunds, cancelled sales, discounts, tips apart from sales, the
 * cash summary and who closed. A section with nothing in it is not drawn.
 * Voided items and VAT by rate are not in the shipped report and are not
 * drawn (stage 4's open items). The sheet cannot be dismissed: Done ends the
 * close, as the shipped sheet's Continue does.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-sheet')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;
  var F = function () { return root.KiwiFormat || null; };
  var money = function (n) { return K.money(Number(n) || 0, 2); };
  var num = function (n) { var f = F(); return f ? f.num(n) : String(n); };
  var cents = function (n) { return Math.round((Number(n) || 0) * 100); };

  var METHOD = { cash: 'pay.cash', card: 'z.method.card', credit: 'z.method.account', delivery: 'z.method.account' };
  function methodRows(methods) {
    var acc = {};
    Object.keys(methods || {}).forEach(function (m) {
      var key = METHOD[m] || 'z.method.other';
      acc[key] = (acc[key] || 0) + cents(methods[m]);
    });
    return ['pay.cash', 'z.method.card', 'z.method.account', 'z.method.other']
      .filter(function (k) { return acc[k]; })
      .map(function (k) { return { label: t(k), cents: acc[k] }; });
  }

  function row(label, value, cls) {
    return '<li class="k-z__r' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span><span class="k-num" data-k-part>' + esc(value) + '</span></li>';
  }
  function section(title, rows) {
    if (!rows) return '';
    return '<section class="k-z__s"><h3 class="k-foot k-ink2 k-z__h">' + esc(title) + '</h3><ul class="k-z__l">' + rows + '</ul></section>';
  }
  function counted(n, amount) { return money(amount) + ' (' + num(n) + ')'; }

  function body(r) {
    var html = '';
    var cut = Number(r.cutoff);
    if (!(cut >= 0 && cut <= 12)) cut = 5;
    var pad = function (h) { return ('0' + h).slice(-2); };
    var f = F();
    var date = f && r.day ? f.date(r.day) : String(r.day || '');
    html += '<p class="k-foot k-ink2 k-z__day">' + esc(t('z.day', { date: date, start: f ? f.time(pad(cut) + ':00') : pad(cut) + ':00', end: f ? f.time(pad((cut + 23) % 24) + ':59') : pad((cut + 23) % 24) + ':59' })) + '</p>';

    var ms = methodRows(r.methods);
    if (ms.length) {
      var total = ms.reduce(function (s, m) { return s + m.cents; }, 0);
      html += section(t('z.by_method'), ms.map(function (m) { return row(m.label, money(m.cents / 100)); }).join('') +
        '<li class="k-z__r k-z__t"><span>' + esc(t('bill.total')) + '</span><span class="k-num">' + esc(money(total / 100)) + '</span></li>');
    }
    var ref = r.refunds || {};
    if (ref.count) html += section(t('z.refunds'), row(t('bill.total'), counted(ref.count, ref.amount)));
    if (r.cancels) html += section(t('z.cancelled'), row(t('bill.total'), num(r.cancels)));
    var dis = r.discounts || {};
    if (dis.count || dis.amount) html += section(t('z.discounts'), row(t('bill.total'), counted(dis.count || 0, dis.amount)));
    var c = r.cash || {};
    var tips = cents(r.tips), cashTips = cents(c.tips);
    if (tips) {
      html += section(t('z.tips'), (tips - cashTips ? row(t('z.method.card'), money((tips - cashTips) / 100)) : '') +
        (cashTips ? row(t('pay.cash'), money(cashTips / 100)) : '') +
        '<li class="k-z__r k-z__t"><span>' + esc(t('bill.total')) + '</span><span class="k-num">' + esc(money(tips / 100)) + '</span></li>');
    }
    if (c.expected != null) {
      var sign = function (n, s) { return s + money(Math.abs(Number(n) || 0)); };
      var lines = row(t('count.opening_float'), money(c.opening)) +
        row(t('count.cash_sales'), sign(c.sales, '+ ')) +
        (cashTips ? row(t('count.cash_tips'), sign(c.tips, '+ ')) : '') +
        (c.movesIn ? row(t('count.cash_in'), sign(c.movesIn, '+ ')) : '') +
        (c.movesOut ? row(t('count.cash_out'), sign(c.movesOut, '− ')) : '') +
        '<li class="k-z__r k-z__t"><span>' + esc(t('count.expected')) + '</span><span class="k-num">' + esc(money(c.expected)) + '</span></li>';
      if (c.counted != null) {
        lines += '<li class="k-z__r"><span>' + esc(t('count.counted')) + '</span><span class="k-num">' + esc(money(c.counted)) + '</span></li>';
        var d = Number(c.ecart) || 0;
        lines += '<li class="k-z__r k-z__t"><span>' + esc(t('count.difference')) + '</span><span class="k-num">' + esc(f && f.signedMoney ? f.signedMoney(d, 2) : money(d)) + '</span></li>';
      }
      html += section(t('z.cash'), lines);
    }
    if (r.closedBy && r.closedAt) html += '<p class="k-foot k-ink2 k-z__by">' + esc(t('z.closed_by', { name: r.closedBy, time: f ? f.time(r.closedAt) : '' })) + '</p>';
    return html;
  }

  var current = null;
  function open(o) {
    o = o || {};
    var r = o.report;
    if (!r) return false;
    if (current) current.remove();
    var sheet = doc.createElement('k-sheet');
    sheet.setAttribute('size', 'count');
    sheet.setAttribute('no-close', '');
    var nStr = String(o.n == null ? '' : o.n);
    if (/^\d+$/.test(nStr)) nStr = ('0000' + nStr).slice(-Math.max(4, nStr.length));
    sheet.setAttribute('heading', t('z.title', { n: nStr }));
    sheet.innerHTML = '<div class="k-z">' + body(r) + '</div>' +
      '<div slot="footer" class="k-z__ft">' +
      '<k-button variant="secondary" size="L" label="' + esc(t('z.print')) + '" data-z="print"></k-button>' +
      '<k-button variant="primary" size="L" label="' + esc(t('action.done')) + '" data-z="done"></k-button></div>';
    doc.body.appendChild(sheet);
    current = sheet;
    sheet.addEventListener('kiwi:action', function (e) {
      var d = e.detail || {};
      if (d.action !== 'k.button.press') return;
      var el = e.target && e.target.closest ? e.target.closest('[data-z]') : null;
      if (!el) return;
      var w = el.getAttribute('data-z');
      if (w === 'print') {
        if (typeof o.onPrint !== 'function') return;
        el.setAttribute('loading', '');
        Promise.resolve(o.onPrint()).then(function () { el.removeAttribute('loading'); }, function () { el.removeAttribute('loading'); });
      } else if (w === 'done') {
        if (typeof o.onDone === 'function') o.onDone();
      }
    });
    sheet.setAttribute('open', '');
    return true;
  }

  root.KiwiTillZ = { open: open, close: function () { if (current) { current.removeAttribute('open'); current = null; } } };
})(typeof window !== 'undefined' ? window : globalThis);
