/* Local corrupt evidence of money (sale queue, kitchen print queue, client outbox): export is non-destructive;
   acknowledgement is explicit, asked inside the page (no system dialog) and labelled for the merchant. */
(function () {
  'use strict';
  var box;
  var words = {
    fr: ['Copies de ventes à vérifier', 'Exporter', 'Accuser réception et supprimer', 'Confirmer la suppression de cette copie ? Vérifiez sa récupération avant de continuer.', 'Stockage des copies presque plein. Exportez et vérifiez les copies avant de les supprimer.',
      'Copie de ventes', 'Bons de cuisine', 'Fiches et achats clients', 'Annuler', 'Confirmer la suppression', 'Ventes clients gardées en mémoire seulement : le stockage est plein. Ne fermez pas l’application avant la synchronisation.', 'File de ventes active illisible', 'Bons de cuisine non envoyés, expirés après 6 h', 'File de bons de cuisine illisible'],
    en: ['Sale copies to review', 'Export', 'Acknowledge and delete', 'Confirm deletion of this copy? Verify its recovery before continuing.', 'Copy storage nearly full. Export and verify copies before deleting them.',
      'Sales copy', 'Kitchen tickets', 'Customer records and purchases', 'Cancel', 'Confirm deletion', 'Customer sales are held in memory only: storage is full. Do not close the app before they sync.', 'Active sales queue unreadable', 'Kitchen tickets never sent, expired after 6 h', 'Kitchen ticket queue unreadable'],
    ar: ['نسخ المبيعات للمراجعة', 'تصدير', 'إقرار وحذف', 'تأكيد حذف هذه النسخة؟ تحقق من استعادتها قبل المتابعة.', 'مساحة النسخ ممتلئة تقريباً. صدّر النسخ وتحقق منها قبل حذفها.',
      'نسخة مبيعات', 'تذاكر المطبخ', 'بطاقات العملاء ومشترياتهم', 'إلغاء', 'تأكيد الحذف', 'مبيعات العملاء محفوظة في الذاكرة فقط: التخزين ممتلئ. لا تغلق التطبيق قبل المزامنة.', 'طابور المبيعات النشط غير قابل للقراءة', 'تذاكر مطبخ لم تُرسل وانتهت صلاحيتها بعد 6 ساعات', 'طابور تذاكر المطبخ غير قابل للقراءة']
      'Copie de ventes', 'Bons de cuisine', 'Fiches et achats clients', 'Annuler', 'Confirmer la suppression', 'Ventes clients gardées en mémoire seulement : le stockage est plein. Ne fermez pas l’application avant la synchronisation.', 'File de ventes active illisible', 'Pointages à vérifier', 'Copies à vérifier'],
      'Sales copy', 'Kitchen tickets', 'Customer records and purchases', 'Cancel', 'Confirm deletion', 'Customer sales are held in memory only: storage is full. Do not close the app before they sync.', 'Active sales queue unreadable', 'Punches to review', 'Copies to review'],
      'نسخة مبيعات', 'تذاكر المطبخ', 'بطاقات العملاء ومشترياتهم', 'إلغاء', 'تأكيد الحذف', 'مبيعات العملاء محفوظة في الذاكرة فقط: التخزين ممتلئ. لا تغلق التطبيق قبل المزامنة.', 'طابور المبيعات النشط غير قابل للقراءة', 'تسجيلات حضور للمراجعة', 'نسخ للمراجعة']
  };
  function text(i) {
    var C = window.KiwiCaisseLang, I = window.KiwiI18n;
    if (C) {
      /* Strings 0-4 are in the till dictionary; the newer ones are translated here when the dictionary does not know them. */
      var fr = words.fr[i], t = C.tr(fr);
      if (t !== fr) return t;
      var cur = C.get ? C.get() : 'fr';
      return (words[cur] || words.fr)[i];
    }
    if (I) { Object.keys(words).forEach(function (lang) { I.T[lang] = I.T[lang] || {}; I.T[lang]['queueRecovery.' + i] = words[lang][i]; }); return I.T[I.getLang() || 'fr']['queueRecovery.' + i]; }
    return words.fr[i];
  }
  function lang() { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || (document.documentElement.lang || 'fr').slice(0, 2); } catch (_) { return 'fr'; } }
  /* What the merchant reads instead of a storage key: the kind of copy and, for a sale copy, when it was set aside. */
  function label(source, key) {
    if (source === 'relay') return text(/relay-expired/.test(key) ? 12 : 13);
    if (source === 'kitchen') return text(6);
    if (source === 'clients') return text(7);
    var m = /:quarantine:(\d+)$/.exec(key);
    if (!m) return source === 'punches' ? text(12) : text(11);
    var d = new Date(Number(m[1]));
    if (isNaN(d.getTime())) return text(5);
    var when = ''; try { when = d.toLocaleString(lang() === 'ar' ? 'ar' : lang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { when = d.toISOString().slice(0, 16); }
    return (source === 'punches' ? text(12) : text(5)) + ' · ' + when;
  }
  function sources() {
    var L = window.KiwiLive, K = window.KiwiKitchenPrint, C = window.KiwiOutboxVault, R = window.KiwiKitchenRelay, out = [];
    if (L && L.queueRecoveryCopies) out.push({ id: 'sales', api: L.queueRecoveryCopies });
    if (K && K.recoveryCopies) out.push({ id: 'kitchen', api: K.recoveryCopies });
    if (R && R.recoveryCopies) out.push({ id: 'relay', api: R.recoveryCopies });
    if (C && C.recoveryCopies) out.push({ id: 'clients', api: C.recoveryCopies });
    var P = window.KiwiEmployeePunchQueue;
    if (P && P.recoveryCopies) out.push({ id: 'punches', api: P.recoveryCopies });
    return out;
  }
  function el(tag, css, content) { var n = document.createElement(tag); if (css) n.style.cssText = css; if (content !== undefined) n.textContent = content; return n; }
  function paint(target) {
    if (!target || !target.append) target = null;
    var rows = [], bytes = 0, held = false;
    sources().forEach(function (src) {
      try {
        (src.api() || []).forEach(function (row) {
          var raw = src.api(row.key) || '';
          bytes += row.bytes || 2 * raw.length;
          rows.push({ source: src.id, api: src.api, key: row.key, raw: raw });
        });
      } catch (_) {}
    });
    try { var st = window.KiwiOutboxVault && window.KiwiOutboxVault.status && window.KiwiOutboxVault.status(); held = !!(st && st.memoryOnly && st.memoryOnly.length); } catch (_) {}
    if (box) box.remove();
    if (!rows.length && !held) return;
    box = el('details', 'position:fixed;inset-inline:12px;bottom:12px;max-height:50vh;overflow:auto;padding:12px;background:var(--paper);color:var(--ink);border:1px solid var(--atlas);z-index:10001');
    var summary = el('summary', '', (rows.length && rows.every(function (r) { return r.source === 'punches'; }) ? text(13) : text(0)) + ' · ' + rows.length); box.append(summary);
    if (held) { var memo = el('p', '', text(10)); memo.setAttribute('role', 'alert'); box.append(memo); }
    if (bytes >= 838860) { var warning = el('p', '', text(4)); warning.setAttribute('role', 'alert'); box.append(warning); }
    rows.forEach(function (row) {
      var line = el('p', '', label(row.source, row.key) + ' · ' + (row.raw.length * 2) + ' B ');
      var save = el('button', 'min-height:44px;margin:4px', text(1)); save.type = 'button';
      save.onclick = function () { var url = URL.createObjectURL(new Blob([row.raw], { type: 'application/octet-stream' })); var a = document.createElement('a'); a.href = url; a.download = row.key.replace(/[^A-Za-z0-9._-]/g, '-') + '.txt'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      line.append(save);
      // Deleting evidence of unsent money needs a manager: the till's server-checked
      // manager code, or the owner's own quarantine review on the dashboard.
      // Elsewhere (waiter page, floating panel) a copy can only be exported.
      var manager = typeof window.requireManager === 'function' ? window.requireManager : null;
      if (manager || target) {
        var ack = el('button', 'min-height:44px;margin:4px', text(2)); ack.type = 'button';
        var drop = function () { try { if (row.api(row.key) !== row.raw) return paint(target); row.api(row.key, true); paint(target); } catch (_) {} };
        var ask = function () {
          /* In-page confirmation, focus kept inside it: the system dialog is gone. */
          var sure = el('span', 'display:block;padding:4px'), message = el('span', '', text(3)); message.setAttribute('role', 'alert');
          var yes = el('button', 'min-height:44px;margin:4px', text(9)); yes.type = 'button';
          var no = el('button', 'min-height:44px;margin:4px', text(8)); no.type = 'button';
          yes.onclick = drop;
          no.onclick = function () { sure.remove(); ack.disabled = false; ack.focus(); };
          sure.append(message, yes, no); line.append(sure); ack.disabled = true; yes.focus();
        };
        ack.onclick = function () { if (manager) manager(text(2), drop); else ask(); };
        line.append(ack);
      }
      box.append(line);
    });
    if (target) { box.style.cssText = 'padding:12px;background:var(--paper);color:var(--ink);border:1px solid var(--atlas)'; box.open = true; }
    (target || document.body).append(box);
  }
  window.addEventListener('kiwi:quarantine-review', function (event) { paint(event.detail); });
  ['kiwi:sale-queue', 'storage', 'kiwi:langchange', 'kiwi:clients-quarantine', 'kiwi:clients-outbox', 'kiwi:kitchen-print-corrupt', 'kiwi:kitchen-relay-evidence'].forEach(function (name) { window.addEventListener(name, function () { paint(); }); });
  ['kiwi:sale-queue', 'storage', 'kiwi:langchange', 'kiwi:clients-quarantine', 'kiwi:clients-outbox', 'kiwi:kitchen-print-corrupt', 'kiwi:punch-quarantine'].forEach(function (name) { window.addEventListener(name, function () { paint(); }); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
})();
