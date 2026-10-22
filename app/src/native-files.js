/* Exports et documents imprimables (audit natif 2026-10-12).
   WKWebView ne suit ni un téléchargement `blob:` ni une fenêtre vide
   `window.open('')` : Capacitor annule l'un et renvoie null pour l'autre.
   Une vingtaine d'exports CSV et une dizaine de documents à imprimer (rapport
   du jour, factures, bons, chevalets QR, plan de salle) échouaient donc, en
   silence pour les CSV. Ici, sans toucher aux sites d'appel :
     · un lien de fichier en mémoire part dans la feuille de partage système ;
     · une fenêtre vide devient un document plein écran dans l'app, avec
       Fermer et Imprimer ou partager ; son print() produit un vrai PDF A4. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
  // Every path here starts from a blob URL or a document; a host without them has nothing to export.
  if (typeof URL !== 'function' || typeof URL.createObjectURL !== 'function' || typeof document === 'undefined') return;
  var plugin = (cap.Plugins || {}).KiwiPrinterSocket;
  var root = document.documentElement;
  var COPY = {
    fr: { close:'Fermer', share:'Imprimer ou partager', failed:'Impossible de préparer le fichier. Réessayez.', untitled:'Document' },
    en: { close:'Close', share:'Print or share', failed:'Could not prepare the file. Try again.', untitled:'Document' },
    ar: { close:'إغلاق', share:'طباعة أو مشاركة', failed:'تعذّر تجهيز الملف. حاول مرة أخرى.', untitled:'مستند' }
  };
  function copy() {
    var lang = String(root.lang || 'fr').toLowerCase().slice(0, 2);
    return COPY[lang] || COPY.fr;
  }
  function notify(message) {
    // The till's toast takes a duration before the kind: toast(msg, ms, kind).
    try { if (typeof window.KiwiCaisseToast === 'function') { window.KiwiCaisseToast(message, 4200, 'danger'); return; } } catch (_) {}
    try { if (window.Kiwi && typeof window.Kiwi.toast === 'function') { window.Kiwi.toast(message, { type:'error' }); return; } } catch (_) {}
  }
  function can(method) { return !!(plugin && typeof plugin[method] === 'function'); }

  /* ── Fichiers en mémoire ─────────────────────────────────────────────── */
  var blobs = Object.create(null);
  var createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  function remember(obj, url) {
    if (url && obj && typeof obj === 'object' && typeof obj.size === 'number') blobs[url] = obj;
    return url;
  }
  URL.createObjectURL = function (obj) { return remember(obj, createURL.apply(URL, arguments)); };
  // Sites revoke right after click(); the share reads the bytes a beat later.
  URL.revokeObjectURL = function (url) {
    var args = arguments;
    setTimeout(function () { delete blobs[url]; revokeURL.apply(URL, args); }, 60000);
  };
  function blobFor(href) {
    if (blobs[href]) return Promise.resolve(blobs[href]);
    if (/^data:/i.test(href)) {
      return new Promise(function (resolve, reject) {
        try {
          var comma = href.indexOf(',');
          var meta = href.slice(5, comma), body = href.slice(comma + 1);
          var mime = meta.split(';')[0] || 'application/octet-stream';
          var raw = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
          var bytes = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 255;
          resolve(new Blob([bytes], { type: mime }));
        } catch (error) { reject(error); }
      });
    }
    return Promise.reject(new Error('unknown-blob'));
  }
  function base64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { var s = String(reader.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }
  function isFileLink(a) {
    var href = a && a.getAttribute && a.getAttribute('href');
    return !!href && /^(blob:|data:)/i.test(href);
  }
  function shareLink(a) {
    var href = a.getAttribute('href');
    var name = a.getAttribute('download') || 'kiwi-export';
    if (!can('shareFile')) { notify(copy().failed); return; }
    blobFor(href).then(function (blob) {
      return base64(blob).then(function (data) {
        return plugin.shareFile({ name: name, mime: blob.type || 'application/octet-stream', data: data });
      });
    }).catch(function () { notify(copy().failed); });
  }
  function onFileLinkClick(event) {
    var a = event.target && event.target.closest && event.target.closest('a[href]');
    if (!a || !isFileLink(a)) return;
    event.preventDefault();
    event.stopPropagation();
    shareLink(a);
  }
  function armFileLinks(win) {
    try {
      var proto = win.HTMLAnchorElement && win.HTMLAnchorElement.prototype;
      if (proto && !proto.__kiwiShareArmed) {
        var click = proto.click;
        proto.click = function () { if (isFileLink(this)) { shareLink(this); return; } return click.apply(this, arguments); };
        Object.defineProperty(proto, '__kiwiShareArmed', { value: true });
      }
      // document.open() erases a document's listeners; re-adding the same
      // function is a no-op otherwise, so arm on every write.
      win.document.addEventListener('click', onFileLinkClick, true);
    } catch (_) {}
  }
  armFileLinks(window);

  /* ── Documents à imprimer ────────────────────────────────────────────── */
  var nativeOpen = window.open;
  var lastPrint = 0;
  function sendToPdf(html, title) {
    var now = Date.now();
    if (now - lastPrint < 1500) return; // onload + bouton : un seul PDF
    lastPrint = now;
    var name = String(title || copy().untitled).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    var method = can('printHtml') ? 'printHtml' : (can('exportInvoice') ? 'exportInvoice' : '');
    if (!method) { notify(copy().failed); return; }
    plugin[method]({ html: html, name: name || 'Document', baseUrl: location.origin + '/' }).catch(function () { notify(copy().failed); });
  }
  function printDocument(win) {
    var doc = win.document;
    sendToPdf('<!doctype html>' + doc.documentElement.outerHTML, doc.title);
  }
  /* Tickets, additions, rapports Z et étiquettes sans imprimante thermique :
     la page peint un « #…-print-root » et appelle window.print(), qui ne fait
     rien dans WKWebView. On envoie ce seul nœud, avec ses règles d'impression. */
  var PRINT_TITLES = { 'kpr-print-root':'Ticket', 'kr-print-root':'Recu', 'kbl-print-root':'Etiquettes' };
  window.print = function () {
    var roots = document.querySelectorAll('[id$="-print-root"]');
    var target = roots[roots.length - 1];
    if (!target) return;
    /* Print rules live inline (receipts, labels) or in a linked sheet (the
       pressing ticket and its tags, pressing-caisse.css). A linked sheet is
       re-linked by its absolute URL so its own url()s still resolve. */
    var PRINT_RULES = /print-root|\.k(?:pr|r|bl)-|\.px-print|\.ho-slip/;
    var css = Array.prototype.map.call(document.querySelectorAll('style,link[rel~="stylesheet"]'), function (node) {
      if (node.tagName === 'STYLE') return PRINT_RULES.test(node.textContent || '') ? node.outerHTML : '';
      var text = '';
      try { text = Array.prototype.map.call(node.sheet.cssRules, function (rule) { return rule.cssText; }).join('\n'); } catch (_) {}
      return PRINT_RULES.test(text) ? '<link rel="stylesheet" href="' + node.href.replace(/"/g, '&quot;') + '">' : '';
    }).join('')
      // Screen media hides the root on the page; the PDF must show it either way.
      + '<style>#' + target.id + '{display:block!important;visibility:visible!important;position:static!important;opacity:1!important}</style>';
    sendToPdf('<!doctype html><html lang="' + String(root.lang || 'fr') + '"><head><meta charset="utf-8">' + css + '</head><body>' + target.outerHTML + '</body></html>',
      target.getAttribute('data-print-title') || PRINT_TITLES[target.id] || copy().untitled);
  };
  function openDocumentSheet() {
    var c = copy();
    var sheet = document.createElement('div');
    sheet.className = 'kiwi-native-doc';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = '<div class="kiwi-native-doc-bar"><button type="button" class="kiwi-native-doc-close"></button>'
      + '<span class="kiwi-native-doc-title"></span><button type="button" class="kiwi-native-doc-share"></button></div>'
      + '<iframe class="kiwi-native-doc-frame" title=""></iframe>';
    sheet.querySelector('.kiwi-native-doc-close').textContent = c.close;
    sheet.querySelector('.kiwi-native-doc-share').textContent = c.share;
    document.body.appendChild(sheet);
    var frame = sheet.querySelector('iframe');
    var win = frame.contentWindow;
    var title = sheet.querySelector('.kiwi-native-doc-title');
    function arm() {
      try {
        Object.defineProperty(win, 'print', { configurable: true, writable: true, value: function () { printDocument(win); } });
        Object.defineProperty(win, 'close', { configurable: true, writable: true, value: function () { dismiss(); } });
        armFileLinks(win);
        var name = win.document.title || '';
        title.textContent = name;
        frame.title = name;
      } catch (_) {}
    }
    function dismiss() {
      if (!sheet.parentNode) return;
      try { win.dispatchEvent(new win.Event('unload')); } catch (_) {}
      sheet.parentNode.removeChild(sheet);
    }
    var doc = win.document, write = doc.write, open = doc.open, closeDoc = doc.close;
    doc.open = function () { var out = open.apply(doc, arguments); arm(); return out; };
    doc.write = function () { var out = write.apply(doc, arguments); arm(); return out; };
    doc.close = function () { var out = closeDoc.apply(doc, arguments); arm(); return out; };
    frame.addEventListener('load', arm);
    sheet.querySelector('.kiwi-native-doc-close').addEventListener('click', dismiss);
    sheet.querySelector('.kiwi-native-doc-share').addEventListener('click', function () { lastPrint = 0; printDocument(win); });
    arm();
    return win;
  }
  /* Kiwi's own pages (privacy policy, help, the employee app) open in the
     in-app Safari sheet on iOS instead of throwing the merchant out to Safari
     mid-service. Other sites keep the system route; Android keeps its own. */
  function kiwiPage(href) {
    try {
      var u = new URL(href, location.href);
      return u.protocol === 'https:' && (u.hostname === 'kiwi-os.com' || /\.kiwi-os\.com$/.test(u.hostname)) ? u.href : '';
    } catch (_) { return ''; }
  }
  function safariSheet(href) {
    var ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kiwiShell;
    if (!ios || typeof ios.postMessage !== 'function') return false;
    try { ios.postMessage({ openURL: href }); return true; } catch (_) { return false; }
  }
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button) return;
    var a = event.target.closest && event.target.closest('a[href]');
    if (!a || a.hasAttribute('download')) return;
    var href = kiwiPage(a.getAttribute('href'));
    if (href && safariSheet(href)) event.preventDefault();
  });
  window.open = function (url) {
    var target = url == null ? '' : String(url).trim();
    if (target === '' || target === 'about:blank') return openDocumentSheet();
    var page = kiwiPage(target);
    if (page && safariSheet(page)) return { closed: false, opener: null, close: function () {}, focus: function () {} };
    return nativeOpen.apply(window, arguments);
  };
  window.KiwiNativeDocuments = { open: openDocumentSheet, print: printDocument };
})();
