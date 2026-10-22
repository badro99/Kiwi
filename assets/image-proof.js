/* Kiwi — real, local image capture for operational proofs.
 *
 * The vertical caisses used to animate a shutter and then claim a photo had
 * been saved without ever asking the device for one.  This helper opens the
 * native camera/file picker, downsizes the chosen image before persistence,
 * and returns a small serialisable record suitable for the vertical state
 * document.  Nothing is uploaded merely by choosing a photo.
 */
(function imageProofModule(global) {
  'use strict';

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('Lecture de la photo impossible')); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Photo illisible')); };
      img.src = src;
    });
  }

  async function compact(file, options) {
    var source = await readFile(file);
    var img = await loadImage(source);
    var max = Math.max(320, Number(options.maxDimension || 720));
    var scale = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Compression de la photo indisponible');
    ctx.drawImage(img, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', Number(options.quality || 0.68)),
      name: String(file.name || 'photo.jpg'),
      originalType: String(file.type || 'image/*'),
      width: width,
      height: height,
      capturedAt: new Date().toISOString()
    };
  }

  function pick(options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      /* Leave capture unset by default so mobile offers camera AND library.
         A caller may force a camera with { camera: 'environment' }. */
      if (options.camera) input.setAttribute('capture', options.camera === true ? 'environment' : options.camera);
      input.style.position = 'fixed';
      input.style.left = '-10000px';
      input.setAttribute('aria-hidden', 'true');
      document.body.appendChild(input);
      var done = false;
      function finish(value, err) {
        if (done) return;
        done = true;
        input.remove();
        if (err) reject(err); else resolve(value || null);
      }
      input.addEventListener('cancel', function () { finish(null); }, { once: true });
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) { finish(null); return; }
        compact(file, options).then(function (photo) { finish(photo); }, function (err) { finish(null, err); });
      }, { once: true });
      input.click();
    });
  }

  global.KiwiImageProof = { pick: pick, compact: compact };
})(window);

/* ── Ci-dessous, l'ancien assets/operational-print.js (réuni ici le 22 octobre 2026, corps inchangé). ── */
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
      '@page{margin:8mm}*{box-sizing:border-box}html,body{color-scheme:light;background:#fff;color:#0A0F0D}body{margin:0;font:13px/1.45 Arial,sans-serif}.doc{width:' + width + ';max-width:100%;margin:0 auto;page-break-after:always;background:#fff;color:#0A0F0D}.doc:last-child{page-break-after:auto}header{padding-bottom:12px;border-bottom:2px solid #0B6E4F;margin-bottom:12px}header strong{display:block;font-size:20px}header small{display:block;margin-top:3px;color:#66706b}.row{display:flex;justify-content:space-between;gap:18px;padding:7px 0;border-bottom:1px solid #ddd}.row b{text-align:right}p{white-space:pre-wrap;margin:7px 0}footer{margin-top:18px;color:#66706b;font-size:11px}' +
      '</style></head><body>' + pages.join('') + '</body></html>');
    doc.close();
    return new Promise(function (resolve) {
      setTimeout(function () {
        try {
          frame.contentWindow.focus();
          /* L'app n'a pas de dialogue d'impression : le même document part en
           * PDF à imprimer ou partager (native-runtime.js). */
          if (global.KiwiNativeDocuments && global.KiwiApiBase && global.KiwiApiBase.native) {
            global.KiwiNativeDocuments.print(frame.contentWindow);
            resolve({ ok:true, via:'pdf' });
          } else { frame.contentWindow.print(); resolve({ ok:true, via:'browser' }); }
        }
        catch (err) { resolve({ ok:false, error:String(err && err.message || err) }); }
        setTimeout(function () { frame.remove(); }, 1200);
      }, 80);
    });
  }
  global.KiwiOperationalPrint = { printText: printText };
})(window);
