/* Console opérateur · « Annuaire » : la modération de l'annuaire Kiwi
 * (/api/admin/directory). Même coque que les Démos (classes ks-* de
 * assets/admin-support.css) : les onglets à gauche, la fiche à droite.
 *   · À vérifier : les inscriptions publiques en attente → Approuver / Refuser
 *     / Modifier, avec le contact de la personne pour la rappeler ;
 *   · Signalements : corrections et demandes de retrait → Retirer la fiche
 *     (un geste, la demande est close avec) / Traité / Ignorer ;
 *   · Publiées, Clients Kiwi, Retirées, Refusées : Retirer ou Rétablir.
 * Le bouton du haut compte ce qui attend (inscriptions + signalements). */
(function () {
  'use strict';
  var launch = document.getElementById('directory-console'); if (!launch) return;
  var TABS = [['pending', 'À vérifier'], ['requests', 'Signalements'], ['approved', 'Publiées'], ['clients', 'Clients Kiwi'], ['removed', 'Retirées'], ['rejected', 'Refusées']];
  var STATUS = { pending: 'En attente', approved: 'Publiée', rejected: 'Refusée', removed: 'Retirée', off: 'Éteinte par le client' };
  var state = { view: 'pending', listings: [], requests: [], counts: {}, selected: '', editing: false };
  var root = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dt(ts) { return ts ? new Date(Number(ts)).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }) : '·'; }
  function req(url, opts) { return window.KiwiAdminApi.request(url, opts); }
  function tell(s) { if (typeof window.notify === 'function') { window.notify(s); return; } var n = document.createElement('div'); n.className = 'ks-toast show'; n.setAttribute('role', 'status'); n.textContent = s; document.body.appendChild(n); setTimeout(function () { n.remove(); }, 3600); }
  function waiting() { return (state.counts.pending || 0) + (state.counts.requests || 0); }
  function setBadge() { var n = waiting(); launch.innerHTML = 'Annuaire' + (n ? '<span class="ks-launch-count">' + n + '</span>' : ''); launch.setAttribute('aria-label', n ? 'Annuaire, ' + n + ' à traiter' : 'Annuaire'); }
  function pageUrl(slug) { return '/fr/annuaire/' + encodeURIComponent(slug) + '/'; }

  function shell() {
    var el = document.createElement('div'); el.className = 'ks-shell'; el.setAttribute('data-kdir', '');
    el.innerHTML = '<style>.ks-shell[data-kdir] a.ks-btn{display:inline-flex;align-items:center;text-decoration:none}.ks-shell[data-kdir] .ks-form input,.ks-shell[data-kdir] .ks-form textarea{width:100%;box-sizing:border-box}</style>'
      + '<header class="ks-head"><div><h2>Annuaire Kiwi</h2><p>Inscriptions publiques à vérifier, signalements, fiches des clients</p></div><span class="ks-space"></span><a class="ks-btn" href="/fr/annuaire/" target="_blank" rel="noopener">Voir l’annuaire</a><button data-kdir-refresh>Rafraîchir</button><button data-kdir-close>Fermer</button></header>'
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
    }).catch(function (e) { tell(e.message === 'directory-not-ready' ? 'Annuaire : la migration 0024 n’est pas encore appliquée.' : 'Annuaire indisponible · ' + e.message); });
  }
  function act(action) {
    var l = state.listings.find(function (x) { return x.id === state.selected; }); if (!l) return;
    if (action === 'remove' && !confirm('Retirer « ' + l.name + ' » de l’annuaire ?')) return;
    return req('/api/admin/directory', { method: 'PATCH', body: JSON.stringify({ id: l.id, action: action }) })
      .then(function () { tell(l.name + ' · ' + ({ approve: 'publiée', reject: 'refusée', remove: 'retirée', restore: 'rétablie' })[action]); return load(); })
      .catch(function (e) { tell('Action refusée · ' + e.message); });
  }
  function actRequest(action) {
    var r = state.requests.find(function (x) { return x.id === state.selected; }); if (!r) return;
    if (action === 'remove' && !confirm('Retirer « ' + (r.name || r.slug) + ' » de l’annuaire ?')) return;
    return req('/api/admin/directory', { method: 'PATCH', body: JSON.stringify({ requestId: r.id, action: action }) })
      .then(function () { tell(action === 'remove' ? 'Fiche retirée, demande close' : 'Demande close'); return load(); })
      .catch(function (e) { tell('Action refusée · ' + e.message); });
  }
  function saveEdit() {
    var l = state.listings.find(function (x) { return x.id === state.selected; }); if (!l) return;
    var v = function (k) { var el = root.querySelector('[data-kdir-f="' + k + '"]'); return el.type === 'checkbox' ? el.checked : el.value; };
    var fields = { name: v('name'), address: v('address'), description: v('description'), website: v('website'), phone: v('phone'), showPhone: v('showPhone') };
    return req('/api/admin/directory', { method: 'PATCH', body: JSON.stringify({ id: l.id, action: 'edit', fields: fields }) })
      .then(function () { state.editing = false; tell(l.name + ' · modifiée'); return load(); })
      .catch(function (e) { tell('Modification refusée · ' + e.message); });
  }

  function tabs() { return TABS.map(function (t) { var n = state.counts[t[0]] || 0; return '<button class="ks-tab' + (state.view === t[0] ? ' on' : '') + '" data-kdir-tab="' + t[0] + '">' + t[1] + (n ? ' · ' + n : '') + '</button>'; }).join(''); }
  function row(x) {
    var title = state.view === 'requests' ? (x.name || x.slug || 'Fiche supprimée') : x.name;
    var pill = state.view === 'requests' ? (x.kind === 'removal' ? 'Retrait' : 'Correction') : (x.kind === 'client' ? 'Client Kiwi' : STATUS[x.status] || x.status);
    var sub = state.view === 'requests' ? esc(String(x.message || '').slice(0, 90)) : esc(x.trade) + ' · ' + esc(x.city) + ' · ' + esc(dt(x.updated_ts));
    return '<button class="ks-row' + (x.id === state.selected ? ' on' : '') + '" data-kdir-row="' + esc(x.id) + '"><span class="ks-row-top"><b>' + esc(title) + '</b><span class="ks-pill">' + esc(pill) + '</span></span><p>' + sub + '</p></button>';
  }
  function field(label, value) { return '<div><span class="ks-label">' + label + '</span><div>' + (value || '·') + '</div></div>'; }
  function input(k, label, value, area) {
    return '<label><span class="ks-label">' + label + '</span>' + (area ? '<textarea rows="4" data-kdir-f="' + k + '">' + esc(value) + '</textarea>' : '<input data-kdir-f="' + k + '" value="' + esc(value) + '">') + '</label>';
  }
  function detailListing(l) {
    var b = function (a, t, primary) { return '<button class="ks-btn' + (primary ? ' primary' : '') + '" data-kdir-act="' + a + '">' + t + '</button>'; };
    var actions = [];
    if (l.status === 'pending') actions.push(b('approve', 'Approuver et publier', true), b('reject', 'Refuser'));
    if (l.status === 'approved') actions.push('<a class="ks-btn" href="' + pageUrl(l.slug) + '" target="_blank" rel="noopener">Voir la fiche</a>', b('remove', 'Retirer de l’annuaire'));
    if (l.status === 'removed' || l.status === 'rejected') actions.push(b('restore', l.kind === 'client' ? 'Rendre la main au client' : 'Remettre en attente'));
    if (l.status === 'off') actions.push(b('remove', 'Retirer (le client ne pourra plus la rallumer)'));
    if (!state.editing && l.status !== 'removed') actions.push('<button class="ks-btn" data-kdir-edit>Modifier</button>');
    var contact = l.kind === 'client' ? field('Établissement Kiwi', esc(l.merchant)) : field('Contact (privé)', esc(l.contact_name) + (l.contact_email ? ' · <a href="mailto:' + esc(l.contact_email) + '">' + esc(l.contact_email) + '</a>' : '') + (l.contact_phone ? ' · <a href="tel:' + esc(l.contact_phone) + '">' + esc(l.contact_phone) + '</a>' : ''));
    var body = state.editing
      ? '<div class="ks-form">' + input('name', 'Nom', l.name) + input('address', 'Adresse', l.address) + input('description', 'Présentation', l.description, true) + input('website', 'Site web', l.website) + input('phone', 'Téléphone', l.contact_phone)
        + '<label><input type="checkbox" data-kdir-f="showPhone"' + (Number(l.show_phone) ? ' checked' : '') + '> Téléphone affiché sur la fiche</label>'
        + '<div class="ks-actions"><button class="ks-btn primary" data-kdir-save>Enregistrer</button><button class="ks-btn" data-kdir-cancel>Annuler</button></div></div>'
      : '<div class="ks-form"><div class="ks-form-row">' + field('Métier', esc(l.trade)) + field('Ville', esc(l.city)) + field('Adresse', esc(l.address)) + field('Site web', esc(l.website)) + '</div>'
        + field('Téléphone', esc(l.contact_phone) + (l.contact_phone ? (Number(l.show_phone) ? ' · affiché' : ' · non affiché') : '')) + contact
        + (l.description ? '<div class="ks-msg"><small>Présentation</small><p>' + esc(l.description) + '</p></div>' : '') + '</div>';
    return '<div class="ks-detail"><h3>' + esc(l.name) + '</h3><div class="ks-meta">' + esc(l.kind === 'client' ? 'Client Kiwi' : 'Inscription publique') + ' · ' + esc(STATUS[l.status] || l.status) + ' · reçue le ' + esc(dt(l.created_ts)) + (l.reviewed_by ? ' · vue par ' + esc(l.reviewed_by) : '') + '</div>'
      + '<div class="ks-actions">' + actions.join('') + '</div>' + body + '</div>';
  }
  function detailRequest(r) {
    return '<div class="ks-detail"><h3>' + esc(r.kind === 'removal' ? 'Demande de retrait' : 'Demande de correction') + '</h3><div class="ks-meta">' + esc(r.name || r.slug || 'fiche') + ' · ' + esc(r.city || '') + ' · reçue le ' + esc(dt(r.created_ts)) + (r.listing_kind === 'client' ? ' · fiche d’un client Kiwi' : '') + '</div>'
      + '<div class="ks-actions">' + (r.slug && r.listing_status === 'approved' ? '<a class="ks-btn" href="' + pageUrl(r.slug) + '" target="_blank" rel="noopener">Voir la fiche</a><button class="ks-btn primary" data-kdir-req="remove">Retirer la fiche</button>' : '') + '<button class="ks-btn" data-kdir-req="done">Traité</button><button class="ks-btn" data-kdir-req="dismiss">Ignorer</button></div>'
      + '<div class="ks-form"><div class="ks-msg"><small>Message</small><p>' + esc(r.message) + '</p></div>' + field('Contact laissé (privé)', esc(r.contact)) + '</div></div>';
  }
  function render() {
    if (!root) return;
    root.querySelector('[data-kdir-tabs]').innerHTML = tabs();
    var items = state.view === 'requests' ? state.requests : state.listings;
    var cur = items.find(function (x) { return x.id === state.selected; });
    root.querySelector('[data-kdir-work]').innerHTML = '<div class="ks-grid"><section class="ks-panel"><div class="ks-list">' + (items.length ? items.map(row).join('') : '<div class="ks-empty">Rien dans cette vue.</div>') + '</div></section><section class="ks-panel">'
      + (cur ? (state.view === 'requests' ? detailRequest(cur) : detailListing(cur)) : '<div class="ks-empty">Choisissez une ligne.</div>') + '</section></div>';
  }
  launch.addEventListener('click', function () { open(); });
  setTimeout(function () { req('/api/admin/directory?view=pending').then(function (j) { state.counts = j.counts || {}; setBadge(); }).catch(function () {}); }, 1600);
  window.KiwiDirectoryConsole = { open: open, close: close };
})();
