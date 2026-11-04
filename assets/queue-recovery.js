/* Local corrupt sale evidence: export is non-destructive; acknowledgement is explicit. */
(function () {
  'use strict';
  var box;
  var words = {
    fr: ['Copies de ventes à vérifier', 'Exporter', 'Accuser réception et supprimer', 'Confirmer la suppression de cette copie ? Vérifiez sa récupération avant de continuer.', 'Stockage des copies presque plein. Exportez et vérifiez les copies avant de les supprimer.'],
    en: ['Sale copies to review', 'Export', 'Acknowledge and delete', 'Confirm deletion of this copy? Verify its recovery before continuing.', 'Copy storage nearly full. Export and verify copies before deleting them.'],
    ar: ['نسخ المبيعات للمراجعة', 'تصدير', 'إقرار وحذف', 'تأكيد حذف هذه النسخة؟ تحقق من استعادتها قبل المتابعة.', 'مساحة النسخ ممتلئة تقريباً. صدّر النسخ وتحقق منها قبل حذفها.']
  };
  function text(i) {
    var C = window.KiwiCaisseLang, I = window.KiwiI18n;
    if (C) return C.tr(words.fr[i]);
    if (I) { Object.keys(words).forEach(function (lang) { I.T[lang] = I.T[lang] || {}; I.T[lang]['queueRecovery.' + i] = words[lang][i]; }); return I.T[I.getLang() || 'fr']['queueRecovery.' + i]; }
    return words.fr[i];
  }
  function paint(target) {
    if (!target || !target.append) target = null;
    var api = window.KiwiLive && window.KiwiLive.queueRecoveryCopies, rows = [], bytes = 0;
    if (!api) return;
    try { rows = api().map(function (row) { bytes += row.bytes; return { key: row.key, raw: api(row.key) }; }); } catch (_) { return; }
    if (box) box.remove();
    if (!rows.length) return;
    box = document.createElement('details'); box.style.cssText = 'position:fixed;inset-inline:12px;bottom:12px;max-height:50vh;overflow:auto;padding:12px;background:var(--paper);color:var(--ink);border:1px solid var(--atlas);z-index:10001';
    var summary = document.createElement('summary'); summary.textContent = text(0) + ' · ' + rows.length; box.append(summary);
    if (bytes >= 838860) { var warning = document.createElement('p'); warning.setAttribute('role', 'alert'); warning.textContent = text(4); box.append(warning); }
    rows.forEach(function (row) {
      var line = document.createElement('p'); line.textContent = row.key + ' · ' + (row.raw.length * 2) + ' B ';
      var save = document.createElement('button'); save.type = 'button'; save.style.cssText = 'min-height:44px;margin:4px'; save.textContent = text(1);
      save.onclick = function () { var url = URL.createObjectURL(new Blob([row.raw], { type: 'application/octet-stream' })); var a = document.createElement('a'); a.href = url; a.download = row.key.replace(/:/g, '-') + '.txt'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      line.append(save);
      // Deleting evidence of unsent money needs a manager: the till's server-checked
      // manager code, or the owner's own quarantine review on the dashboard.
      // Elsewhere (waiter page, floating panel) a copy can only be exported.
      var manager = typeof window.requireManager === 'function' ? window.requireManager : null;
      if (manager || target) {
        var ack = document.createElement('button'); ack.type = 'button'; ack.style.cssText = 'min-height:44px;margin:4px'; ack.textContent = text(2);
        var drop = function () { try { if (api(row.key) !== row.raw) return paint(target); api(row.key, true); paint(target); } catch (_) {} };
        ack.onclick = function () { if (manager) manager(text(2), drop); else if (window.confirm(text(3))) drop(); };
        line.append(ack);
      }
      box.append(line);
    });
    if (target) { box.style.cssText = 'padding:12px;background:var(--paper);color:var(--ink);border:1px solid var(--atlas)'; box.open = true; }
    (target || document.body).append(box);
  }
  window.addEventListener('kiwi:quarantine-review', function (event) { paint(event.detail); });
  window.addEventListener('kiwi:sale-queue', paint);
  window.addEventListener('storage', paint);
  window.addEventListener('kiwi:langchange', paint);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
})();
