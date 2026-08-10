/* Kiwi — small operational documents that are not fiscal receipts.
 * Opens the real browser/system print dialog in an isolated iframe and never
 * claims paper came out: the browser cannot know whether the operator finally
 * pressed Print. Fiscal receipts continue to use KiwiReceipt/KiwiPrinter. */
(function operationalPrintModule(global) {
  'use strict';
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function printText(options) {
    options = options || {};
    var lines = Array.isArray(options.lines) ? options.lines : [];
    var copies = Math.max(1, Math.min(3, Number(options.copies || 1)));
    var width = options.paper === 'A4' ? '190mm' : '72mm';
    var pages = [];
    for (var copy = 0; copy < copies; copy++) {
      pages.push('<article class="doc">' +
        '<header><strong>' + esc(options.title || 'Document Kiwi') + '</strong>' +
        (options.subtitle ? '<small>' + esc(options.subtitle) + '</small>' : '') + '</header>' +
        '<main>' + lines.map(function (line) {
          if (line && typeof line === 'object') {
            return '<div class="row"><span>' + esc(line.label) + '</span><b>' + esc(line.value) + '</b></div>';
          }
          return '<p>' + esc(line) + '</p>';
        }).join('') + '</main>' +
        (copies > 1 ? '<footer>Exemplaire ' + (copy + 1) + ' / ' + copies + '</footer>' : '') +
        '</article>');
    }
    var frame = document.createElement('iframe');
    frame.setAttribute('title', 'Impression Kiwi');
    frame.style.position = 'fixed'; frame.style.width = '1px'; frame.style.height = '1px';
    frame.style.right = '0'; frame.style.bottom = '0'; frame.style.opacity = '0';
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(options.title || 'Document Kiwi') + '</title><style>' +
      '@page{margin:8mm}*{box-sizing:border-box}body{margin:0;color:#0A0F0D;font:13px/1.45 Arial,sans-serif}.doc{width:' + width + ';max-width:100%;margin:0 auto;page-break-after:always}.doc:last-child{page-break-after:auto}header{padding-bottom:12px;border-bottom:2px solid #0B6E4F;margin-bottom:12px}header strong{display:block;font-size:20px}header small{display:block;margin-top:3px;color:#66706b}.row{display:flex;justify-content:space-between;gap:18px;padding:7px 0;border-bottom:1px solid #ddd}.row b{text-align:right}p{white-space:pre-wrap;margin:7px 0}footer{margin-top:18px;color:#66706b;font-size:11px}' +
      '</style></head><body>' + pages.join('') + '</body></html>');
    doc.close();
    return new Promise(function (resolve) {
      setTimeout(function () {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); resolve({ ok:true, via:'browser' }); }
        catch (err) { resolve({ ok:false, error:String(err && err.message || err) }); }
        setTimeout(function () { frame.remove(); }, 1200);
      }, 80);
    });
  }
  global.KiwiOperationalPrint = { printText: printText };
})(window);
