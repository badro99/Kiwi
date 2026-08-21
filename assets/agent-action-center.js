/* Kiwi AI Action Center
 *
 * Durable, tenant-scoped review queue for the assistant's existing guarded
 * actions. This module never creates a second mutation path: request/confirm
 * still run through KiwiAgentActions, and undo is an explicit audited inverse
 * operation only for action types that can genuinely be reversed.
 */
(function () {
  'use strict';

  var FEATURE = 'agentactions';
  var PREFIX = 'kiwi:agent-actions:v1:';
  var MAX_ITEMS = 120;
  var MAX_VERSIONS = 360;
  var state = { items: [], versions: [] };
  var cloud = null;
  var rawRequest = null;
  var rawConfirm = null;
  var openRoots = [];

  var COPY = {
    fr: { title: 'Centre d’actions', subtitle: 'Chaque action attend votre décision et garde son historique.', button: 'Actions', empty: 'Aucune action à examiner.', pending: 'À confirmer', approved: 'Exécutée', rejected: 'Refusée', failed: 'Échec', undone: 'Annulée', confirm: 'Confirmer', reject: 'Refuser', undo: 'Annuler l’action', retry: 'Réessayer', reversible: 'Réversible', final: 'Sans annulation', restored: 'État précédent restauré', expired: 'La proposition a été renouvelée avant confirmation.', unavailable: 'Action indisponible', open: 'Ouvrir le Centre d’actions' },
    en: { title: 'Action Center', subtitle: 'Every action waits for your decision and keeps its history.', button: 'Actions', empty: 'No actions need review.', pending: 'Pending approval', approved: 'Completed', rejected: 'Rejected', failed: 'Failed', undone: 'Undone', confirm: 'Confirm', reject: 'Reject', undo: 'Undo action', retry: 'Retry', reversible: 'Reversible', final: 'Cannot be undone', restored: 'Previous state restored', expired: 'The proposal was renewed before confirmation.', unavailable: 'Action unavailable', open: 'Open Action Center' },
    ar: { title: 'مركز الإجراءات', subtitle: 'كل إجراء ينتظر موافقتك ويحتفظ بسجله.', button: 'الإجراءات', empty: 'لا توجد إجراءات للمراجعة.', pending: 'بانتظار الموافقة', approved: 'تم التنفيذ', rejected: 'مرفوض', failed: 'فشل', undone: 'تم التراجع', confirm: 'تأكيد', reject: 'رفض', undo: 'تراجع عن الإجراء', retry: 'إعادة المحاولة', reversible: 'قابل للتراجع', final: 'غير قابل للتراجع', restored: 'تمت استعادة الحالة السابقة', expired: 'تم تجديد الاقتراح قبل التأكيد.', unavailable: 'الإجراء غير متاح', open: 'فتح مركز الإجراءات' }
  };

  function lang() {
    var v = String(document.documentElement.lang || localStorage.getItem('kiwiLang') || 'fr').slice(0, 2);
    return COPY[v] ? v : 'fr';
  }
  function tr() { return COPY[lang()]; }
  function allowed() {
    try { var r = window.KiwiFeatureTruth && window.KiwiFeatureTruth.role ? window.KiwiFeatureTruth.role() : 'staff'; return r === 'owner' || r === 'manager'; }
    catch (_) { return false; }
  }
  function slug() {
    try {
      return String((window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) ||
        (window.KiwiVenue && window.KiwiVenue.getCurrentVenueId && window.KiwiVenue.getCurrentVenueId()) || '');
    } catch (_) { return ''; }
  }
  function localKey() { return PREFIX + slug(); }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
  function safeDoc(doc) {
    doc = doc && typeof doc === 'object' ? doc : {};
    var items = Array.isArray(doc.items) ? doc.items.filter(function (x) { return x && x.id; }) : [];
    var versions = Array.isArray(doc.versions) ? doc.versions.filter(function (x) { return x && x.itemId; }) : [];
    items.sort(function (a, b) { return (+b.updatedAt || 0) - (+a.updatedAt || 0); });
    versions.sort(function (a, b) { return (+b.at || 0) - (+a.at || 0); });
    return { items: items.slice(0, MAX_ITEMS), versions: versions.slice(0, MAX_VERSIONS) };
  }
  function readLocal() {
    if (!slug()) return { items: [], versions: [] };
    try { return safeDoc(JSON.parse(localStorage.getItem(localKey()) || 'null')); }
    catch (_) { return { items: [], versions: [] }; }
  }
  function writeLocal(doc) {
    state = safeDoc(doc);
    if (slug()) { try { localStorage.setItem(localKey(), JSON.stringify(state)); } catch (_) {} }
    refresh();
  }
  function mergeDocs(a, b) {
    a = safeDoc(a); b = safeDoc(b);
    var items = Object.create(null), versions = Object.create(null);
    a.items.concat(b.items).forEach(function (x) {
      var old = items[x.id]; if (!old || (+x.updatedAt || 0) >= (+old.updatedAt || 0)) items[x.id] = x;
    });
    a.versions.concat(b.versions).forEach(function (x) {
      var id = String(x.id || (x.itemId + ':' + x.at + ':' + x.status)); versions[id] = x;
    });
    return safeDoc({ items: Object.keys(items).map(function (k) { return items[k]; }), versions: Object.keys(versions).map(function (k) { return versions[k]; }) });
  }
  function save() {
    writeLocal(state);
    if (cloud) {
      Promise.resolve(cloud.bind()).then(function () { cloud.push(0); }).catch(function () {});
    }
  }
  function version(item, status, detail) {
    var at = Date.now();
    state.versions.unshift({ id: item.id + ':' + at + ':' + status, itemId: item.id, status: status, at: at, detail: String(detail || '').slice(0, 240) });
  }
  function update(item, status, extra) {
    item.status = status;
    item.updatedAt = Date.now();
    if (extra) Object.keys(extra).forEach(function (k) { item[k] = clone(extra[k]); });
    version(item, status, extra && (extra.reason || extra.detail));
    save();
    return item;
  }
  function findById(id) { return state.items.find(function (x) { return x.id === id; }); }
  function findByToken(token) { return state.items.find(function (x) { return x.token === token; }); }
  function priorOrderStatus(orderId) {
    try {
      var raw = window.KiwiOrderInbox && window.KiwiOrderInbox.orders ? window.KiwiOrderInbox.orders() : null;
      var rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.keys(raw).map(function (k) { return raw[k]; }) : [];
      var row = rows.find(function (x) { return x && String(x.id) === String(orderId); });
      return row ? String(row.status || '') : '';
    } catch (_) { return ''; }
  }
  function enqueue(name, args, req) {
    if (!allowed() || !req || !req.confirmationRequired || !req.token) return;
    var commandId = String((args && args.commandId) || req.token).slice(0, 80);
    var existing = findById(commandId);
    var before = name === 'order-status' ? { status: priorOrderStatus(args && args.orderId) } : null;
    var item = existing || { id: commandId, createdAt: Date.now() };
    item.action = String(name || '');
    item.summary = String((args && args.said) || name || '').slice(0, 240);
    item.args = clone(req.summary || {}) || {};
    item.before = before;
    item.token = req.token;
    item.expiresAt = Date.now() + 120000;
    /* An order is reversible only when the captured prior status is itself a
     * status accepted by the existing action validator. Never widen that
     * allow-list merely to make an Undo button appear. */
    item.undoable = name === 'stock-adjust' || (name === 'order-status' && !!(before && /^(accepted|rejected|ready|served)$/.test(before.status)));
    if (item.status !== 'approved' && item.status !== 'undone') item.status = 'pending';
    item.updatedAt = Date.now();
    if (!existing) state.items.unshift(item);
    version(item, 'pending', item.summary);
    save();
  }
  function settle(token, result) {
    var item = findByToken(token);
    if (!item) return result;
    if (result && result.ok) update(item, 'approved', { result: result, reason: '' });
    else update(item, 'failed', { result: result || null, reason: (result && result.reason) || 'refused' });
    return result;
  }

  function installActionBridge() {
    var A = window.KiwiAgentActions;
    if (!A || typeof A.request !== 'function' || typeof A.confirm !== 'function') return setTimeout(installActionBridge, 40);
    if (A.__kiwiActionCenter) return;
    rawRequest = A.request.bind(A);
    rawConfirm = A.confirm.bind(A);
    A.request = function (name, args) {
      var req = rawRequest(name, args);
      if (req && req.confirmationRequired) enqueue(name, args || {}, req);
      return req;
    };
    A.confirm = function (token) {
      return Promise.resolve(rawConfirm(token)).then(function (res) { return settle(token, res); }, function () { return settle(token, { ok: false, reason: 'network' }); });
    };
    A.cancel = function (token) {
      var item = findByToken(token);
      if (item && item.status === 'pending') update(item, 'rejected', { reason: 'merchant-rejected' });
      return { ok: true, cancelled: true };
    };
    A.__kiwiActionCenter = true;
  }

  async function approve(item) {
    if (!item || item.status !== 'pending' || !rawRequest || !rawConfirm) return;
    var res = await rawConfirm(item.token);
    if (res && res.reason === 'expired') {
      var args = Object.assign({}, item.args || {}, { commandId: item.id, said: item.summary });
      var renewed = rawRequest(item.action, args);
      if (renewed && renewed.replayed) { update(item, 'approved', { result: renewed.result, detail: tr().expired }); return; }
      if (!renewed || !renewed.ok || !renewed.token) { update(item, 'failed', { reason: (renewed && renewed.reason) || 'renewal-refused' }); return; }
      item.token = renewed.token;
      item.expiresAt = Date.now() + 120000;
      res = await rawConfirm(item.token);
    }
    settle(item.token, res);
  }

  async function undo(item) {
    if (!item || item.status !== 'approved' || !item.undoable || !rawRequest || !rawConfirm) return;
    var name = item.action;
    var args = clone(item.args) || {};
    if (name === 'stock-adjust') {
      args.qty = -(+args.qty || 0);
      args.reason = 'assistant-undo';
      args.note = ('Undo: ' + item.summary).slice(0, 300);
    } else if (name === 'order-status' && item.before && item.before.status) {
      args.status = item.before.status;
    } else return;
    args.commandId = ('undo-' + item.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    args.said = ('Undo: ' + item.summary).slice(0, 240);
    var req = rawRequest(name, args);
    var res = req && req.replayed ? req.result : req && req.ok && req.token ? await rawConfirm(req.token) : { ok: false, reason: (req && req.reason) || 'undo-refused' };
    if (res && res.ok) update(item, 'undone', { undoResult: res, detail: tr().restored });
    else update(item, 'approved', { reason: (res && res.reason) || 'undo-refused' });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function icon(name) { return '<i data-lucide="' + name + '" aria-hidden="true"></i>'; }
  function statusLabel(status) { return tr()[status] || status; }
  function actionLabel(name) { return String(name || '').replace(/-/g, ' '); }
  function time(ts) { try { return new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); } catch (_) { return ''; } }
  function itemHtml(item) {
    var pending = item.status === 'pending', approved = item.status === 'approved';
    var detail = item.action === 'stock-adjust' ? ((+item.args.qty > 0 ? '+' : '') + item.args.qty + ' · ' + (item.args.itemId || ''))
      : item.action === 'order-status' ? ((item.args.orderId || '') + ' → ' + (item.args.status || ''))
      : item.action === 'reprint' ? (item.args.ref || '') : item.action === 'customer-message-draft' ? (item.args.phone || '') : '';
    var buttons = pending ? '<button class="kac-primary" data-kac-approve="' + esc(item.id) + '">' + tr().confirm + '</button><button data-kac-reject="' + esc(item.id) + '">' + tr().reject + '</button>'
      : approved && item.undoable ? '<button data-kac-undo="' + esc(item.id) + '">' + icon('undo') + tr().undo + '</button>' : '';
    return '<article class="kac-card ' + esc(item.status) + '"><div class="kac-card-top"><span class="kac-kind">' + esc(actionLabel(item.action)) + '</span><span class="kac-status">' + esc(statusLabel(item.status)) + '</span></div>'
      + '<h3>' + esc(item.summary || item.action) + '</h3>'
      + (detail ? '<div class="kac-detail">' + esc(detail) + '</div>' : '')
      + '<div class="kac-meta"><span>' + esc(time(item.updatedAt)) + '</span><span>' + (item.undoable ? tr().reversible : tr().final) + '</span></div>'
      + (item.reason ? '<div class="kac-error">' + esc(item.reason) + '</div>' : '')
      + (buttons ? '<div class="kac-actions">' + buttons + '</div>' : '') + '</article>';
  }
  function listHtml() {
    var rows = state.items.slice().sort(function (a, b) {
      if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
      return (+b.updatedAt || 0) - (+a.updatedAt || 0);
    });
    return rows.length ? rows.map(itemHtml).join('') : '<div class="kac-empty">' + icon('task_alt') + '<p>' + tr().empty + '</p></div>';
  }
  function refresh() {
    openRoots = openRoots.filter(function (root) { return root && root.isConnected; });
    openRoots.forEach(function (root) { var list = root.querySelector('[data-kac-list]'); if (list) list.innerHTML = listHtml(); });
    var n = state.items.filter(function (x) { return x.status === 'pending'; }).length;
    document.querySelectorAll('[data-kac-count]').forEach(function (b) { b.textContent = String(n); b.hidden = !n; });
    try { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (_) {}
  }
  function open() {
    if (!allowed() || !window.Kiwi || !window.Kiwi.drawer) return;
    var res = window.Kiwi.drawer({ title: tr().title, subtitle: tr().subtitle, width: 680, body: '<div class="kac" data-kac-list>' + listHtml() + '</div>' });
    res.el.classList.add('kac-drawer');
    openRoots.push(res.el);
    res.el.addEventListener('click', function (e) {
      var a = e.target.closest('[data-kac-approve]');
      var r = e.target.closest('[data-kac-reject]');
      var u = e.target.closest('[data-kac-undo]');
      if (a) { a.disabled = true; approve(findById(a.getAttribute('data-kac-approve'))); }
      else if (r) { var it = findById(r.getAttribute('data-kac-reject')); if (it) { update(it, 'rejected', { reason: 'merchant-rejected' }); } }
      else if (u) { u.disabled = true; undo(findById(u.getAttribute('data-kac-undo'))); }
    });
    refresh();
  }
  function injectButton(node) {
    if (!allowed()) return;
    var roots = [];
    if (node && node.nodeType === 1 && node.matches('.fa-toolbar')) roots.push(node);
    if (node && node.querySelectorAll) roots = roots.concat(Array.from(node.querySelectorAll('.fa-toolbar')));
    roots.forEach(function (bar) {
      if (bar.querySelector('[data-kac-open]')) return;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'fa-tool kac-trigger'; btn.setAttribute('data-kac-open', ''); btn.title = tr().open;
      btn.innerHTML = icon('pending_actions') + '<span>' + tr().button + '</span><b data-kac-count hidden>0</b>';
      var hint = bar.querySelector('.fa-hint'); bar.insertBefore(btn, hint || null);
    });
    refresh();
  }
  function injectCss() {
    if (document.getElementById('kiwi-action-center-css')) return;
    var s = document.createElement('style'); s.id = 'kiwi-action-center-css';
    s.textContent = '.fa-toolbar{gap:8px}.fa-toolbar .fa-hint{margin-inline-start:auto}.kac-trigger{position:relative}.kac-trigger b{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--atlas,#0b6e4f);color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center}.kac-trigger b[hidden]{display:none}.kac{display:grid;gap:12px;padding:4px}.kac-card{border:1px solid var(--n-200);border-radius:18px;background:var(--surface);padding:17px 18px;box-shadow:0 12px 30px -26px rgba(10,15,13,.34)}.kac-card.pending{border-color:rgba(11,110,79,.34);box-shadow:0 16px 34px -24px rgba(11,110,79,.42)}.kac-card-top,.kac-meta,.kac-actions{display:flex;align-items:center;gap:9px}.kac-card-top{justify-content:space-between}.kac-kind{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--n-500);font-weight:650}.kac-status{font-size:11px;font-weight:650;border-radius:999px;padding:5px 9px;background:var(--paper-soft);color:var(--n-600)}.kac-card.pending .kac-status{background:rgba(11,110,79,.1);color:var(--atlas)}.kac-card h3{font-size:15px;line-height:1.35;margin:12px 0 5px;color:var(--ink)}.kac-detail{font:12px/1.5 var(--mono,monospace);color:var(--n-600);word-break:break-word}.kac-meta{font-size:10.5px;color:var(--n-500);margin-top:12px}.kac-meta span+span:before{content:"·";margin-inline-end:9px}.kac-actions{margin-top:14px}.kac-actions button{border:1px solid var(--n-200);background:var(--surface);color:var(--ink);padding:9px 13px;border-radius:999px;font:600 12px inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.kac-actions button.kac-primary{background:var(--atlas);border-color:var(--atlas);color:#fff}.kac-actions button:disabled{opacity:.45}.kac-actions svg{width:15px;height:15px}.kac-error{font-size:11px;color:var(--danger,#b3392f);margin-top:8px}.kac-empty{min-height:240px;border:1px dashed var(--n-300);border-radius:20px;display:grid;place-content:center;text-align:center;color:var(--n-500);gap:10px}.kac-empty svg{width:30px;height:30px;margin:auto;color:var(--atlas)}';
    document.head.appendChild(s);
  }

  function initCloud() {
    if (!window.KiwiCloudDoc || typeof window.KiwiCloudDoc.attach !== 'function') return setTimeout(initCloud, 50);
    state = readLocal();
    cloud = window.KiwiCloudDoc.attach({ feature: FEATURE, slug: slug, localKey: localKey, read: function () { return state; }, write: writeLocal, merge: mergeDocs, isEmpty: function (d) { return !d || (!d.items.length && !d.versions.length); } });
    cloud.bind(); refresh();
  }
  injectCss();
  installActionBridge();
  initCloud();
  injectButton(document);
  new MutationObserver(function (muts) { muts.forEach(function (m) { m.addedNodes.forEach(injectButton); }); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-kac-open]')) { e.preventDefault(); open(); } });
  window.addEventListener('kiwi:langchange', function () { document.querySelectorAll('[data-kac-open]').forEach(function (b) { b.remove(); }); injectButton(document); refresh(); });
  window.KiwiActionCenter = { open: open, list: function () { return clone(state.items) || []; }, undo: function (id) { return undo(findById(id)); } };
}());
