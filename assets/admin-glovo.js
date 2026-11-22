/* Console opérateur · « Glovo » : relier chaque adresse Glovo à son commerçant
 * (/api/admin/glovo-stores). Même coque que l'Annuaire (classes ks-* de
 * assets/admin-support.css) : la liste des magasins reliés à gauche, la fiche
 * à droite, et en tête le formulaire « Relier un magasin ».
 *   · Relier : commerçant (choisi dans la liste des commerçants), identifiant
 *     Glovo du magasin (l'« external id » de l'adresse), délai de préparation ;
 *   · sur la fiche : délai, Mettre en pause / Reprendre, Retirer, les dernières
 *     commandes et le dernier refus, lisibles sans les logs.
 * Un identifiant déjà relié à un autre commerçant est refusé (409) : on le
 * retire d'abord. Libellés FR/EN/AR dans la langue de la console (<html lang>). */
(function () {
  'use strict';
  var launch = document.getElementById('glovo-console'); if (!launch) return;
  var C = {
    glovo: ['Glovo', 'Glovo', 'Glovo'],
    title: ['Magasins Glovo', 'Glovo stores', 'متاجر Glovo'],
    lede: ['Quelle adresse Glovo envoie ses commandes à quel commerçant', 'Which Glovo address sends its orders to which merchant', 'أي عنوان Glovo يرسل طلباته إلى أي تاجر'],
    refresh: ['Rafraîchir', 'Refresh', 'تحديث'],
    close: ['Fermer', 'Close', 'إغلاق'],
    link: ['Relier un magasin', 'Link a store', 'ربط متجر'],
    merchant: ['Commerçant', 'Merchant', 'التاجر'],
    storeId: ['Identifiant Glovo du magasin', 'Glovo store ID', 'معرّف المتجر في Glovo'],
    prep: ['Préparation (min)', 'Prep time (min)', 'مدة التحضير (د)'],
    save: ['Enregistrer', 'Save', 'حفظ'],
    add: ['Relier', 'Link', 'ربط'],
    pause: ['Mettre en pause', 'Pause', 'إيقاف مؤقت'],
    resume: ['Reprendre', 'Resume', 'استئناف'],
    remove: ['Retirer', 'Remove', 'إزالة'],
    active: ['Actif', 'Active', 'نشط'],
    paused: ['En pause', 'Paused', 'متوقف'],
    lastOrder: ['Dernière commande', 'Last order', 'آخر طلب'],
    lastErr: ['Dernier refus', 'Last refusal', 'آخر رفض'],
    recent: ['Dernières commandes', 'Recent orders', 'آخر الطلبات'],
    cancelled: ['annulée', 'cancelled', 'ملغى'],
    none: ['Aucun magasin relié.', 'No store linked yet.', 'لا يوجد متجر مرتبط.'],
    choose: ['Choisissez un magasin.', 'Pick a store.', 'اختر متجرًا.'],
    noToken: ['Le jeton Glovo n’est pas encore configuré : les commandes ne passeront pas.', 'The Glovo token is not configured yet: orders will not come through.', 'رمز Glovo غير مُعدّ بعد: لن تصل الطلبات.'],
    webhooks: ['Adresses à donner à Glovo', 'URLs to give Glovo', 'العناوين التي تُعطى لـ Glovo'],
    confirmRemove: ['Retirer le magasin {id} ? Ses commandes Glovo n’arriveront plus.', 'Remove store {id}? Its Glovo orders will stop arriving.', 'إزالة المتجر {id}؟ لن تصل طلبات Glovo الخاصة به.'],
    linked: ['Magasin relié', 'Store linked', 'تم ربط المتجر'],
    saved: ['Enregistré', 'Saved', 'تم الحفظ'],
    removed: ['Magasin retiré', 'Store removed', 'تمت إزالة المتجر'],
    taken: ['Cet identifiant est déjà relié à {m}. Retirez-le d’abord.', 'This ID is already linked to {m}. Remove it first.', 'هذا المعرّف مرتبط بـ {m}. أزله أولًا.'],
    badStore: ['Identifiant Glovo invalide (lettres, chiffres, . _ : - seulement).', 'Invalid Glovo ID (letters, digits, . _ : - only).', 'معرّف Glovo غير صالح.'],
    noMerchant: ['Commerçant introuvable.', 'Merchant not found.', 'التاجر غير موجود.'],
    notReady: ['Glovo : la migration 0026 n’est pas appliquée.', 'Glovo: migration 0026 is not applied.', 'Glovo: الترحيل 0026 غير مطبق.'],
    refused: ['Action refusée · {e}', 'Action refused · {e}', 'رُفض الإجراء · {e}'],
    delivery: ['Livraison', 'Delivery', 'التوصيل'],
    byGlovo: ['Coursiers Glovo', 'Glovo couriers', 'موصّلو Glovo'],
    byStore: ['Livreurs du magasin (Marketplace)', 'Store riders (Marketplace)', 'موصّلو المتجر (Marketplace)'],
    setGlovo: ['Passer en coursiers Glovo', 'Switch to Glovo couriers', 'التحويل إلى موصّلي Glovo'],
    setStore: ['Passer en livreurs du magasin', 'Switch to store riders', 'التحويل إلى موصّلي المتجر'],
    closedUntil: ['Fermé jusqu’à {t}', 'Closed until {t}', 'مغلق إلى {t}'],
    openNow: ['Ouvert', 'Open', 'مفتوح'],
    stateLbl: ['État', 'Status', 'الحالة'],
    menuState: ['Carte chez Glovo', 'Menu on Glovo', 'القائمة على Glovo'],
    bulkState: ['Dernier lot dispo et prix', 'Last availability and price batch', 'آخر دفعة توفّر وأسعار'],
    uploads: ['{n}/5 envois aujourd’hui', '{n}/5 uploads today', '{n}/5 إرسالات اليوم'],
    apiErr: ['Dernière erreur de l’API Glovo', 'Last Glovo API error', 'آخر خطأ من واجهة Glovo'],
    never: ['jamais envoyée', 'never sent', 'لم تُرسل'],
    picked: ['récupérée', 'picked up', 'استُلمت'],
    out: ['partie', 'out', 'خرجت'],
    delivered: ['livrée', 'delivered', 'وصلت'],
    need0029: ['Ces informations arrivent avec la migration 0029.', 'This needs migration 0029.', 'هذه المعلومات تحتاج الترحيل 0029.'],
  };
  var LANGS = ['fr', 'en', 'ar'];
  function lang() { var l = String(document.documentElement.lang || '').slice(0, 2); return LANGS.indexOf(l) >= 0 ? l : 'fr'; }
  function tr(key, vars) {
    var row = C[key], s = row ? row[LANGS.indexOf(lang())] || row[0] : key;
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? '' : String(vars[k]); }) : s;
  }
  var state = { stores: [], recent: [], merchants: [], configured: true, selected: '' };
  var root = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dt(ts) { return ts ? new Date(Number(ts)).toLocaleString({ fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' }[lang()], { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }) : '·'; }
  function req(url, opts) { return window.KiwiAdminApi.request(url, opts); }
  function tell(s) { if (typeof window.notify === 'function') { window.notify(s); return; } var n = document.createElement('div'); n.className = 'ks-toast show'; n.setAttribute('role', 'status'); n.textContent = s; document.body.appendChild(n); setTimeout(function () { n.remove(); }, 3600); }
  function why(e) {
    var code = e && e.message, body = (e && e.body) || {};
    if (code === 'store-taken') return tr('taken', { m: body.merchant || '' });
    if (code === 'bad-store-id') return tr('badStore');
    if (code === 'merchant-not-found' || code === 'bad-merchant') return tr('noMerchant');
    if (code === 'not-migrated') return body.hint && /0029/.test(body.hint) ? tr('need0029') : tr('notReady');
    return tr('refused', { e: code });
  }
  function nameOf(slug) { var m = state.merchants.find(function (x) { return x.merchant === slug; }); return (m && m.name) || slug; }

  function shell() {
    var el = document.createElement('div'); el.className = 'ks-shell'; el.setAttribute('data-kglovo', '');
    el.innerHTML = '<style>.ks-shell[data-kglovo] .ks-form input,.ks-shell[data-kglovo] .ks-form select{width:100%;box-sizing:border-box}.ks-shell[data-kglovo] .kg-add{display:grid;grid-template-columns:2fr 2fr 1fr auto;gap:10px;align-items:end;margin-bottom:12px}.ks-shell[data-kglovo] .ks-body{grid-template-rows:1fr}.ks-shell[data-kglovo] .ks-grid{min-height:0;margin-top:14px}.ks-shell[data-kglovo] code{font-family:"JetBrains Mono",monospace;font-size:12px;word-break:break-all}@media (max-width:760px){.ks-shell[data-kglovo] .kg-add{grid-template-columns:1fr}}</style>'
      + '<header class="ks-head"><div><h2>' + esc(tr('title')) + '</h2><p>' + esc(tr('lede')) + '</p></div><span class="ks-space"></span><button data-kg-refresh>' + esc(tr('refresh')) + '</button><button data-kg-close>' + esc(tr('close')) + '</button></header>'
      + '<main class="ks-body"><div class="ks-work" data-kg-work></div></main>';
    document.body.appendChild(el); return el;
  }
  function bind() {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-kg-close')) return close();
      if (b.hasAttribute('data-kg-refresh')) return load();
      if (b.hasAttribute('data-kg-add')) return add();
      if (b.dataset.kgRow) { state.selected = b.dataset.kgRow; return render(); }
      if (b.dataset.kgAct) return act(b.dataset.kgAct);
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hidden) close(); });
  }
  function open() { if (!root) { root = shell(); bind(); } root.hidden = false; return load(); }
  function close() { if (root) root.hidden = true; }
  function load() {
    return req('/api/admin/glovo-stores', { cache: 'no-store' }).then(function (j) {
      state.stores = j.stores || []; state.recent = j.recent || []; state.merchants = j.merchants || []; state.configured = j.configured !== false;
      if (!state.stores.some(function (x) { return x.store_id === state.selected; })) state.selected = state.stores[0] ? state.stores[0].store_id : '';
      render();
    }).catch(function (e) { tell(why(e)); });
  }
  function val(k) { var el = root.querySelector('[data-kg-f="' + k + '"]'); return el ? el.value.trim() : ''; }
  function add() {
    var body = { merchant: val('merchant'), storeId: val('storeId'), prepMinutes: Number(val('prep')) || 15 };
    return req('/api/admin/glovo-stores', { method: 'POST', body: JSON.stringify(body) })
      .then(function () { tell(tr('linked') + ' · ' + body.storeId); state.selected = body.storeId; return load(); })
      .catch(function (e) { tell(why(e)); });
  }
  function act(action) {
    var s = state.stores.find(function (x) { return x.store_id === state.selected; }); if (!s) return;
    if (action === 'remove') {
      if (!confirm(tr('confirmRemove', { id: s.store_id }))) return;
      return req('/api/admin/glovo-stores', { method: 'DELETE', body: JSON.stringify({ storeId: s.store_id }) })
        .then(function () { tell(tr('removed') + ' · ' + s.store_id); state.selected = ''; return load(); })
        .catch(function (e) { tell(why(e)); });
    }
    var patch = { storeId: s.store_id };
    if (action === 'pause') patch.status = 'paused';
    else if (action === 'resume') patch.status = 'active';
    else if (action === 'prep') patch.prepMinutes = Number(val('editPrep')) || s.prep_minutes;
    else if (action === 'market-on') patch.marketplace = true;
    else if (action === 'market-off') patch.marketplace = false;
    else return;
    return req('/api/admin/glovo-stores', { method: 'PATCH', body: JSON.stringify(patch) })
      .then(function () { tell(tr('saved') + ' · ' + s.store_id); return load(); })
      .catch(function (e) { tell(why(e)); });
  }

  function addForm() {
    var opts = state.merchants.map(function (m) { return '<option value="' + esc(m.merchant) + '">' + esc((m.name || m.merchant) + ' · ' + m.merchant) + '</option>'; }).join('');
    return '<div class="ks-panel"><div class="ks-detail"><h3>' + esc(tr('link')) + '</h3>'
      + (state.configured ? '' : '<div class="ks-meta">' + esc(tr('noToken')) + '</div>')
      + '<div class="ks-form kg-add">'
      + '<label><span class="ks-label">' + esc(tr('merchant')) + '</span><select data-kg-f="merchant">' + opts + '</select></label>'
      + '<label><span class="ks-label">' + esc(tr('storeId')) + '</span><input data-kg-f="storeId" maxlength="64" autocomplete="off" spellcheck="false"></label>'
      + '<label><span class="ks-label">' + esc(tr('prep')) + '</span><input data-kg-f="prep" type="number" min="1" max="120" value="15"></label>'
      + '<button class="ks-btn primary" data-kg-add>' + esc(tr('add')) + '</button></div>'
      + '<div class="ks-meta">' + esc(tr('webhooks')) + ' · ' + ['dispatched', 'picked_up', 'cancelled'].map(function (h) { return '<code>' + esc(location.origin + '/api/channel/glovo/' + h) + '</code>'; }).join(' · ') + '</div>'
      + '</div></div>';
  }
  function row(s) {
    return '<button class="ks-row' + (s.store_id === state.selected ? ' on' : '') + '" data-kg-row="' + esc(s.store_id) + '"><span class="ks-row-top"><b>' + esc(s.name || nameOf(s.merchant)) + '</b><span class="ks-pill">' + esc(tr(s.status === 'paused' ? 'paused' : 'active')) + '</span></span><p><code>' + esc(s.store_id) + '</code> · ' + esc(tr('lastOrder')) + ' ' + esc(dt(s.last_ts)) + '</p></button>';
  }
  function field(key, html) { return '<div><span class="ks-label">' + esc(tr(key)) + '</span><div>' + (html || '·') + '</div></div>'; }
  function detail(s) {
    var orders = state.recent.filter(function (o) { return o.store_id === s.store_id; }).slice(0, 10).map(function (o) {
      var steps = [o.picked_up_ts ? tr('picked') : '', o.out_ts ? tr('out') : '', o.delivered_ts ? tr('delivered') : ''].filter(Boolean).join(', ');
      return '<li>' + esc(dt(o.created_ts)) + ' · ' + esc(o.order_code || o.order_id) + (steps ? ' · ' + esc(steps) : '') + (o.cancelled_ts ? ' · ' + esc(tr('cancelled')) : '') + (o.last_call_err ? ' · ' + esc(o.last_call_err) : '') + '</li>';
    }).join('');
    var b = function (a, key, primary) { return '<button class="ks-btn' + (primary ? ' primary' : '') + '" data-kg-act="' + a + '">' + esc(tr(key)) + '</button>'; };
    return '<div class="ks-detail"><h3>' + esc(s.name || nameOf(s.merchant)) + '</h3><div class="ks-meta">' + esc(s.merchant) + ' · ' + esc(tr(s.status === 'paused' ? 'paused' : 'active')) + '</div>'
      + '<div class="ks-actions">' + (s.status === 'paused' ? b('resume', 'resume', true) : b('pause', 'pause')) + b('remove', 'remove') + '</div>'
      + '<div class="ks-form"><div class="ks-form-row">' + field('storeId', '<code>' + esc(s.store_id) + '</code>') + field('lastOrder', esc(dt(s.last_ts))) + '</div>'
      + '<label><span class="ks-label">' + esc(tr('prep')) + '</span><input data-kg-f="editPrep" type="number" min="1" max="120" value="' + esc(s.prep_minutes) + '"></label>'
      + '<div class="ks-actions">' + b('prep', 'save') + '</div>'
      + (s.last_err ? field('lastErr', esc(s.last_err)) : '')
      + glovoFull(s, b)
      + (orders ? '<div class="ks-msg"><small>' + esc(tr('recent')) + '</small><ul>' + orders + '</ul></div>' : '')
      + '</div></div>';
  }
  /* Ce que la migration 0029 ajoute à la fiche : livraison, fermeture, carte, lot, erreur d'API. */
  function glovoFull(s, b) {
    if (s.marketplace === undefined) return '<div class="ks-meta">' + esc(tr('need0029')) + '</div>';
    var market = Number(s.marketplace) === 1;
    var shut = s.closing_until && Date.parse(s.closing_until) > Date.now();
    var today = new Date().toISOString().slice(0, 10);
    return '<div class="ks-form-row">' + field('delivery', esc(tr(market ? 'byStore' : 'byGlovo')))
      + field('stateLbl', esc(shut ? tr('closedUntil', { t: dt(Date.parse(s.closing_until)) }) : tr('openNow'))) + '</div>'
      + '<div class="ks-actions">' + (market ? b('market-off', 'setGlovo') : b('market-on', 'setStore')) + '</div>'
      + '<div class="ks-form-row">' + field('menuState', esc(s.menu_status ? s.menu_status + ' · ' + dt(s.menu_ts) : tr('never')) + '<br><small>' + esc(tr('uploads', { n: s.menu_day === today ? Number(s.menu_count) || 0 : 0 })) + '</small>')
      + field('bulkState', esc(s.bulk_status ? s.bulk_status + ' · ' + dt(s.bulk_ts) : '·')) + '</div>'
      + (s.api_err ? field('apiErr', esc(s.api_err) + ' <small>' + esc(dt(s.api_err_ts)) + '</small>') : '');
  }
  function render() {
    if (!root) return;
    var cur = state.stores.find(function (x) { return x.store_id === state.selected; });
    var list = state.stores.length ? state.stores.map(row).join('') : '<div class="ks-empty">' + esc(tr('none')) + '</div>';
    root.querySelector('[data-kg-work]').innerHTML = addForm()
      + '<div class="ks-grid"><div class="ks-panel"><div class="ks-list">' + list + '</div></div><div class="ks-panel">'
      + (cur ? detail(cur) : '<div class="ks-empty">' + esc(tr('choose')) + '</div>') + '</div></div>';
  }
  launch.addEventListener('click', function () { open(); });
  window.KiwiGlovoConsole = { open: open, close: close };
})();
