/* Console opérateur · « Annuaire » : la modération de l'annuaire Kiwi
 * (/api/admin/directory). Même coque que les Démos (classes ks-* de
 * assets/admin-support.css) : les onglets à gauche, la fiche à droite.
 *   · À vérifier : les inscriptions publiques en attente → Approuver / Refuser
 *     / Modifier, avec le contact de la personne pour la rappeler ;
 *   · Signalements : corrections et demandes de retrait → Retirer la fiche
 *     (un geste, la demande est close avec) / Traité / Ignorer ;
 *   · Publiées, Clients Kiwi, Retirées, Refusées : Retirer ou Rétablir.
 * Le bouton du haut compte ce qui attend (inscriptions + signalements).
 * Libellés en FR/EN/AR (table C), dans la langue de la console (<html lang>,
 * posée par admin-legacy.js) ; les noms, messages et contacts ne sont jamais traduits. */
(function () {
  'use strict';
  var launch = document.getElementById('directory-console'); if (!launch) return;
  var C = {
    directory: ['Annuaire', 'Directory', 'الدليل'],
    waiting: ['Annuaire, {n} à traiter', 'Directory, {n} to review', 'الدليل، {n} للمراجعة'],
    title: ['Annuaire Kiwi', 'Kiwi directory', 'دليل Kiwi'],
    lede: ['Inscriptions publiques à vérifier, signalements, fiches des clients', 'Public submissions to review, reports, client listings', 'تسجيلات عامة للمراجعة، بلاغات، بطاقات العملاء'],
    viewAll: ['Voir l’annuaire', 'View the directory', 'عرض الدليل'],
    refresh: ['Rafraîchir', 'Refresh', 'تحديث'],
    close: ['Fermer', 'Close', 'إغلاق'],
    pending: ['À vérifier', 'To review', 'للمراجعة'],
    requests: ['Signalements', 'Reports', 'البلاغات'],
    approved: ['Publiées', 'Published', 'منشورة'],
    clients: ['Clients Kiwi', 'Kiwi clients', 'عملاء Kiwi'],
    removed: ['Retirées', 'Removed', 'محذوفة'],
    rejected: ['Refusées', 'Rejected', 'مرفوضة'],
    stPending: ['En attente', 'Pending', 'في الانتظار'],
    stApproved: ['Publiée', 'Published', 'منشورة'],
    stRejected: ['Refusée', 'Rejected', 'مرفوضة'],
    stRemoved: ['Retirée', 'Removed', 'محذوفة'],
    stOff: ['Éteinte par le client', 'Switched off by the client', 'أوقفها العميل'],
    notReady: ['Annuaire : la migration 0024 n’est pas encore appliquée.', 'Directory: migration 0024 is not applied yet.', 'الدليل: الترحيل 0024 غير مطبق بعد.'],
    unavailable: ['Annuaire indisponible · {e}', 'Directory unavailable · {e}', 'الدليل غير متاح · {e}'],
    confirmRemove: ['Retirer « {name} » de l’annuaire ?', 'Remove “{name}” from the directory?', 'حذف «{name}» من الدليل؟'],
    approve: ['publiée', 'published', 'نُشرت'],
    reject: ['refusée', 'rejected', 'رُفضت'],
    remove: ['retirée', 'removed', 'حُذفت'],
    restore: ['rétablie', 'restored', 'أُعيدت'],
    edited: ['modifiée', 'updated', 'عُدّلت'],
    refused: ['Action refusée · {e}', 'Action refused · {e}', 'رُفض الإجراء · {e}'],
    editRefused: ['Modification refusée · {e}', 'Edit refused · {e}', 'رُفض التعديل · {e}'],
    reqRemoved: ['Fiche retirée, demande close', 'Listing removed, request closed', 'حُذفت البطاقة وأُغلق الطلب'],
    reqClosed: ['Demande close', 'Request closed', 'أُغلق الطلب'],
    deleted: ['Fiche supprimée', 'Deleted listing', 'بطاقة محذوفة'],
    removal: ['Retrait', 'Removal', 'حذف'],
    correction: ['Correction', 'Correction', 'تصحيح'],
    approveBtn: ['Approuver et publier', 'Approve and publish', 'الموافقة والنشر'],
    rejectBtn: ['Refuser', 'Reject', 'رفض'],
    seeListing: ['Voir la fiche', 'View listing', 'عرض البطاقة'],
    removeBtn: ['Retirer de l’annuaire', 'Remove from the directory', 'حذف من الدليل'],
    giveBack: ['Rendre la main au client', 'Hand back to the client', 'إعادتها إلى العميل'],
    requeue: ['Remettre en attente', 'Back to pending', 'إرجاعها إلى الانتظار'],
    removeOff: ['Retirer (le client ne pourra plus la rallumer)', 'Remove (the client cannot switch it back on)', 'حذف (لن يتمكن العميل من إعادة تفعيلها)'],
    edit: ['Modifier', 'Edit', 'تعديل'],
    kiwiStore: ['Établissement Kiwi', 'Kiwi store', 'متجر Kiwi'],
    contactPrivate: ['Contact (privé)', 'Contact (private)', 'جهة الاتصال (خاصة)'],
    name: ['Nom', 'Name', 'الاسم'],
    address: ['Adresse', 'Address', 'العنوان'],
    description: ['Présentation', 'Description', 'التقديم'],
    website: ['Site web', 'Website', 'الموقع'],
    phone: ['Téléphone', 'Phone', 'الهاتف'],
    showPhone: ['Téléphone affiché sur la fiche', 'Phone shown on the listing', 'الهاتف ظاهر في البطاقة'],
    save: ['Enregistrer', 'Save', 'حفظ'],
    cancel: ['Annuler', 'Cancel', 'إلغاء'],
    trade: ['Métier', 'Trade', 'النشاط'],
    city: ['Ville', 'City', 'المدينة'],
    shown: ['affiché', 'shown', 'ظاهر'],
    hidden: ['non affiché', 'hidden', 'غير ظاهر'],
    publicKind: ['Inscription publique', 'Public submission', 'تسجيل عام'],
    received: ['reçue le {d}', 'received {d}', 'استُلمت في {d}'],
    seenBy: ['vue par {who}', 'reviewed by {who}', 'راجعها {who}'],
    reqRemoval: ['Demande de retrait', 'Removal request', 'طلب حذف'],
    reqCorrection: ['Demande de correction', 'Correction request', 'طلب تصحيح'],
    listingWord: ['fiche', 'listing', 'بطاقة'],
    clientListing: ['fiche d’un client Kiwi', 'a Kiwi client’s listing', 'بطاقة عميل Kiwi'],
    removeListing: ['Retirer la fiche', 'Remove listing', 'حذف البطاقة'],
    handled: ['Traité', 'Handled', 'تمت المعالجة'],
    ignore: ['Ignorer', 'Ignore', 'تجاهل'],
    message: ['Message', 'Message', 'الرسالة'],
    contactLeft: ['Contact laissé (privé)', 'Contact left (private)', 'جهة الاتصال المتروكة (خاصة)'],
    empty: ['Rien dans cette vue.', 'Nothing in this view.', 'لا شيء في هذا العرض.'],
    choose: ['Choisissez une ligne.', 'Pick a row.', 'اختر سطرًا.'],
  };
  var LANGS = ['fr', 'en', 'ar'];
  function lang() { var l = String(document.documentElement.lang || '').slice(0, 2); return LANGS.indexOf(l) >= 0 ? l : 'fr'; }
  function tr(key, vars) {
    var row = C[key], s = row ? row[LANGS.indexOf(lang())] || row[0] : key;
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? '' : String(vars[k]); }) : s;
  }
  var TABS = ['pending', 'requests', 'approved', 'clients', 'removed', 'rejected'];
  var STATUS = { pending: 'stPending', approved: 'stApproved', rejected: 'stRejected', removed: 'stRemoved', off: 'stOff' };
  var BASE = { fr: '/fr/annuaire/', en: '/en/directory/', ar: '/ar/annuaire/' };
  var state = { view: 'pending', listings: [], requests: [], counts: {}, selected: '', editing: false };
  var root = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dt(ts) { return ts ? new Date(Number(ts)).toLocaleString({ fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' }[lang()], { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }) : '·'; }
  function status(s) { return STATUS[s] ? tr(STATUS[s]) : s; }
  function req(url, opts) { return window.KiwiAdminApi.request(url, opts); }
  function tell(s) { if (typeof window.notify === 'function') { window.notify(s); return; } var n = document.createElement('div'); n.className = 'ks-toast show'; n.setAttribute('role', 'status'); n.textContent = s; document.body.appendChild(n); setTimeout(function () { n.remove(); }, 3600); }
  function waiting() { return (state.counts.pending || 0) + (state.counts.requests || 0); }
  function setBadge() {
    var n = waiting();
    launch.textContent = tr('directory');
    if (n) { var count = document.createElement('span'); count.className = 'ks-launch-count'; count.textContent = String(n); launch.appendChild(count); }
    launch.setAttribute('aria-label', n ? tr('waiting', { n: n }) : tr('directory'));
  }
  function pageUrl(slug) { return BASE[lang()] + encodeURIComponent(slug) + '/'; }

  function shell() {
    var el = document.createElement('div'); el.className = 'ks-shell'; el.setAttribute('data-kdir', '');
    el.innerHTML = '<style>.ks-shell[data-kdir] a.ks-btn{display:inline-flex;align-items:center;text-decoration:none}.ks-shell[data-kdir] .ks-form input,.ks-shell[data-kdir] .ks-form textarea{width:100%;box-sizing:border-box}</style>'
      + `<header class="ks-head"><div><h2>${esc(tr('title'))}</h2><p>${esc(tr('lede'))}</p></div><span class="ks-space"></span><a class="ks-btn" href="${BASE[lang()]}" target="_blank" rel="noopener">${esc(tr('viewAll'))}</a><button data-kdir-refresh>${esc(tr('refresh'))}</button><button data-kdir-close>${esc(tr('close'))}</button></header>`
      + '<main class="ks-body"><nav class="ks-tabs" data-kdir-tabs></nav><div class="ks-work" data-kdir-work></div></main>';
    document.body.appendChild(el); return el;
  }
  function bind() {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-kdir-close')) return close();
      if (b.hasAttribute('data-kdir-refresh')) return load();
      if (b.dataset.kdirTab) { state.view = b.dataset.kdirTab; state.selected = ''; state.editing = false; return load(); }
      if (b.dataset.kdirRow) { state.selected = b.dataset.kdirRow; state.editing = false; return render(); }
      if (b.dataset.kdirAct) return act(b.dataset.kdirAct);
      if (b.dataset.kdirReq) return actRequest(b.dataset.kdirReq);
      if (b.hasAttribute('data-kdir-edit')) { state.editing = true; return render(); }
      if (b.hasAttribute('data-kdir-cancel')) { state.editing = false; return render(); }
      if (b.hasAttribute('data-kdir-save')) return saveEdit();
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hidden) close(); });
  }
  function open() { if (!root) { root = shell(); bind(); } root.hidden = false; return load(); }
  function close() { if (root) root.hidden = true; }
  function load() {
    return req('/api/admin/directory?view=' + encodeURIComponent(state.view)).then(function (j) {
      state.counts = j.counts || {}; state.listings = j.listings || []; state.requests = j.requests || [];
      var items = state.view === 'requests' ? state.requests : state.listings;
      if (!items.some(function (x) { return x.id === state.selected; })) state.selected = items[0] ? items[0].id : '';
      setBadge(); render();
    }).catch(function (e) { tell(e.message === 'directory-not-ready' ? tr('notReady') : tr('unavailable', { e: e.message })); });
  }
  function act(action) {
    var l = state.listings.find(function (x) { return x.id === state.selected; }); if (!l) return;
    if (action === 'remove' && !confirm(tr('confirmRemove', { name: l.name }))) return;
    return req('/api/admin/directory', { method: 'PATCH', body: JSON.stringify({ id: l.id, action: action }) })
      .then(function () { tell(l.name + ' · ' + tr(action)); return load(); })
      .catch(function (e) { tell(tr('refused', { e: e.message })); });
  }
  function actRequest(action) {
    var r = state.requests.find(function (x) { return x.id === state.selected; }); if (!r) return;
    if (action === 'remove' && !confirm(tr('confirmRemove', { name: r.name || r.slug }))) return;
    return req('/api/admin/directory', { method: 'PATCH', body: JSON.stringify({ requestId: r.id, action: action }) })
      .then(function () { tell(tr(action === 'remove' ? 'reqRemoved' : 'reqClosed')); return load(); })
      .catch(function (e) { tell(tr('refused', { e: e.message })); });
  }
  function saveEdit() {
    var l = state.listings.find(function (x) { return x.id === state.selected; }); if (!l) return;
    var v = function (k) { var el = root.querySelector('[data-kdir-f="' + k + '"]'); return el.type === 'checkbox' ? el.checked : el.value; };
    var fields = { name: v('name'), address: v('address'), description: v('description'), website: v('website'), phone: v('phone'), showPhone: v('showPhone') };
    return req('/api/admin/directory', { method: 'PATCH', body: JSON.stringify({ id: l.id, action: 'edit', fields: fields }) })
      .then(function () { state.editing = false; tell(l.name + ' · ' + tr('edited')); return load(); })
      .catch(function (e) { tell(tr('editRefused', { e: e.message })); });
  }

  function tabs() { return TABS.map(function (t) { var n = state.counts[t] || 0; return '<button class="ks-tab' + (state.view === t ? ' on' : '') + '" data-kdir-tab="' + t + '">' + esc(tr(t)) + (n ? ' · ' + n : '') + '</button>'; }).join(''); }
  function row(x) {
    var title = state.view === 'requests' ? (x.name || x.slug || tr('deleted')) : x.name;
    var pill = state.view === 'requests' ? tr(x.kind === 'removal' ? 'removal' : 'correction') : (x.kind === 'client' ? tr('clients') : status(x.status));
    var sub = state.view === 'requests' ? esc(String(x.message || '').slice(0, 90)) : esc(x.trade) + ' · ' + esc(x.city) + ' · ' + esc(dt(x.updated_ts));
    return '<button class="ks-row' + (x.id === state.selected ? ' on' : '') + '" data-kdir-row="' + esc(x.id) + '"><span class="ks-row-top"><b>' + esc(title) + '</b><span class="ks-pill">' + esc(pill) + '</span></span><p>' + sub + '</p></button>';
  }
  function field(key, value) { return '<div><span class="ks-label">' + esc(tr(key)) + '</span><div>' + (value || '·') + '</div></div>'; }
  function input(k, value, area) {
    return '<label><span class="ks-label">' + esc(tr(k)) + '</span>' + (area ? '<textarea rows="4" data-kdir-f="' + k + '">' + esc(value) + '</textarea>' : '<input data-kdir-f="' + k + '" value="' + esc(value) + '">') + '</label>';
  }
  function button(attr, key, primary) { return '<button class="ks-btn' + (primary ? ' primary' : '') + '" ' + attr + '>' + esc(tr(key)) + '</button>'; }
  function detailListing(l) {
    var b = function (a, key, primary) { return button('data-kdir-act="' + a + '"', key, primary); };
    var actions = [];
    if (l.status === 'pending') actions.push(b('approve', 'approveBtn', true), b('reject', 'rejectBtn'));
    if (l.status === 'approved') actions.push('<a class="ks-btn" href="' + pageUrl(l.slug) + '" target="_blank" rel="noopener">' + esc(tr('seeListing')) + '</a>', b('remove', 'removeBtn'));
    if (l.status === 'removed' || l.status === 'rejected') actions.push(b('restore', l.kind === 'client' ? 'giveBack' : 'requeue'));
    if (l.status === 'off') actions.push(b('remove', 'removeOff'));
    if (!state.editing && l.status !== 'removed') actions.push(button('data-kdir-edit', 'edit'));
    var contact = l.kind === 'client' ? field('kiwiStore', esc(l.merchant)) : field('contactPrivate', esc(l.contact_name) + (l.contact_email ? ' · <a href="mailto:' + esc(l.contact_email) + '">' + esc(l.contact_email) + '</a>' : '') + (l.contact_phone ? ' · <a href="tel:' + esc(l.contact_phone) + '">' + esc(l.contact_phone) + '</a>' : ''));
    var body = state.editing
      ? '<div class="ks-form">' + input('name', l.name) + input('address', l.address) + input('description', l.description, true) + input('website', l.website) + input('phone', l.contact_phone)
        + '<label><input type="checkbox" data-kdir-f="showPhone"' + (Number(l.show_phone) ? ' checked' : '') + '> ' + esc(tr('showPhone')) + '</label>'
        + '<div class="ks-actions">' + button('data-kdir-save', 'save', true) + button('data-kdir-cancel', 'cancel') + '</div></div>'
      : '<div class="ks-form"><div class="ks-form-row">' + field('trade', esc(l.trade)) + field('city', esc(l.city)) + field('address', esc(l.address)) + field('website', esc(l.website)) + '</div>'
        + field('phone', esc(l.contact_phone) + (l.contact_phone ? ' · ' + esc(tr(Number(l.show_phone) ? 'shown' : 'hidden')) : '')) + contact
        + (l.description ? '<div class="ks-msg"><small>' + esc(tr('description')) + '</small><p>' + esc(l.description) + '</p></div>' : '') + '</div>';
    var meta = [tr(l.kind === 'client' ? 'clients' : 'publicKind'), status(l.status), tr('received', { d: dt(l.created_ts) })];
    if (l.reviewed_by) meta.push(tr('seenBy', { who: l.reviewed_by }));
    return '<div class="ks-detail"><h3>' + esc(l.name) + '</h3><div class="ks-meta">' + esc(meta.join(' · ')) + '</div>'
      + '<div class="ks-actions">' + actions.join('') + '</div>' + body + '</div>';
  }
  function detailRequest(r) {
    var meta = [r.name || r.slug || tr('listingWord'), r.city || '', tr('received', { d: dt(r.created_ts) })];
    if (r.listing_kind === 'client') meta.push(tr('clientListing'));
    var live = r.slug && r.listing_status === 'approved'
      ? '<a class="ks-btn" href="' + pageUrl(r.slug) + '" target="_blank" rel="noopener">' + esc(tr('seeListing')) + '</a>' + button('data-kdir-req="remove"', 'removeListing', true) : '';
    return '<div class="ks-detail"><h3>' + esc(tr(r.kind === 'removal' ? 'reqRemoval' : 'reqCorrection')) + '</h3><div class="ks-meta">' + esc(meta.join(' · ')) + '</div>'
      + '<div class="ks-actions">' + live + button('data-kdir-req="done"', 'handled') + button('data-kdir-req="dismiss"', 'ignore') + '</div>'
      + '<div class="ks-form"><div class="ks-msg"><small>' + esc(tr('message')) + '</small><p>' + esc(r.message) + '</p></div>' + field('contactLeft', esc(r.contact)) + '</div></div>';
  }
  function render() {
    if (!root) return;
    root.querySelector('[data-kdir-tabs]').innerHTML = tabs();
    var items = state.view === 'requests' ? state.requests : state.listings;
    var cur = items.find(function (x) { return x.id === state.selected; });
    var list = items.length ? items.map(row).join('') : '<div class="ks-empty">' + esc(tr('empty')) + '</div>';
    var detail = cur ? (state.view === 'requests' ? detailRequest(cur) : detailListing(cur)) : '<div class="ks-empty">' + esc(tr('choose')) + '</div>';
    root.querySelector('[data-kdir-work]').innerHTML = '<div class="ks-grid"><section class="ks-panel"><div class="ks-list">' + list + '</div></section><section class="ks-panel">' + detail + '</section></div>';
  }
  launch.addEventListener('click', function () { open(); });
  setTimeout(function () { req('/api/admin/directory?view=pending').then(function (j) { state.counts = j.counts || {}; setBadge(); }).catch(function () {}); }, 1600);
  window.KiwiDirectoryConsole = { open: open, close: close };
})();
