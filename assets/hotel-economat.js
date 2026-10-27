/* Kiwi Hotel · Économat workspace. Builds on KiwiInventory and KiwiProcurement. */
(function () {
  'use strict';

  var Kiwi = window.Kiwi;
  var handlers = Kiwi && Kiwi.handlers;
  if (!handlers) return;

  var modalRef = null;
  var unsubscribe = null;
  var busy = false;
  var STR = {
    fr: {
      title:'Économat', eyebrow:'STOCK CENTRAL · HÔTEL', intro:'Linge, boissons, produits d’accueil et consommables, avec les réceptions et mouvements en attente au même endroit.',
      sync:'Synchroniser', receive:'Réceptionner', products:'Articles suivis', low:'Stock bas', queued:'Mouvements en attente', orders:'Commandes ouvertes', stock:'Stock disponible', stockSub:'Quantités du périmètre autorisé', activity:'Réceptions & commandes', activitySub:'Dernières opérations d’approvisionnement', noStock:'Aucun stock dans cet Économat', noStockD:'Réceptionnez un premier article pour démarrer le suivi.', noActivity:'Aucune opération récente', noActivityD:'Les réceptions et commandes fournisseurs apparaîtront ici.',
      healthy:'Disponible', lowState:'À commander', out:'Rupture', location:'Emplacement', receiptTitle:'Réceptionner une livraison', receiptTag:'BON DE RÉCEPTION', item:'Article ou référence', qty:'Quantité reçue', cost:'Coût unitaire · MAD', supplier:'Fournisseur', reference:'Bon / facture', cancel:'Annuler', confirm:'Ajouter au stock', invalid:'Article, quantité et coût positif requis.', saved:'Réception enregistrée', syncOk:'Stock synchronisé', syncFail:'Synchronisation indisponible', unavailable:'Économat indisponible pour cet établissement', unit:'unité', pending:'En cours', received:'Reçu', outlets:'Points de vente', hidden:'{n} autres lignes non affichées. Les totaux ci-dessus les comptent. Recherchez un article pour l’afficher.', showMore:'Afficher plus', search:'Rechercher un article', noMatch:'Aucun article ne correspond à cette recherche.'
    },
    en: {
      title:'Central storeroom', eyebrow:'CENTRAL STOCK · HOTEL', intro:'Linen, drinks, guest supplies and consumables, with receipts and pending movements in one place.',
      sync:'Sync', receive:'Receive delivery', products:'Tracked items', low:'Low stock', queued:'Queued movements', orders:'Open orders', stock:'Available stock', stockSub:'Quantities in the authorised scope', activity:'Receipts & orders', activitySub:'Recent procurement operations', noStock:'No stock in this storeroom', noStockD:'Receive the first item to start tracking it.', noActivity:'No recent operation', noActivityD:'Supplier receipts and orders will appear here.',
      healthy:'Available', lowState:'Reorder', out:'Out of stock', location:'Location', receiptTitle:'Receive a delivery', receiptTag:'GOODS RECEIPT', item:'Item or reference', qty:'Quantity received', cost:'Unit cost · MAD', supplier:'Supplier', reference:'Delivery note / invoice', cancel:'Cancel', confirm:'Add to stock', invalid:'Item, positive quantity and cost are required.', saved:'Receipt recorded', syncOk:'Stock synced', syncFail:'Sync unavailable', unavailable:'Storeroom unavailable for this property', unit:'unit', pending:'Pending', received:'Received', outlets:'Outlets', hidden:'{n} more rows not shown. The totals above include them. Search for an item to show it.', showMore:'Show more', search:'Search an item', noMatch:'No item matches this search.'
    },
    ar: {
      title:'المخزن المركزي', eyebrow:'المخزون المركزي · الفندق', intro:'البياضات والمشروبات ولوازم الضيوف والمواد الاستهلاكية، مع الاستلامات والحركات المعلّقة في مكان واحد.',
      sync:'مزامنة', receive:'استلام توريد', products:'المواد المتتبعة', low:'مخزون منخفض', queued:'حركات معلّقة', orders:'طلبات مفتوحة', stock:'المخزون المتاح', stockSub:'الكميات ضمن النطاق المسموح', activity:'الاستلامات والطلبات', activitySub:'آخر عمليات التوريد', noStock:'لا يوجد مخزون في هذا المستودع', noStockD:'استلم أول مادة لبدء التتبع.', noActivity:'لا توجد عملية حديثة', noActivityD:'ستظهر الاستلامات وطلبات الموردين هنا.',
      healthy:'متاح', lowState:'يجب طلبه', out:'نفد', location:'الموقع', receiptTitle:'استلام توريد', receiptTag:'وصل استلام', item:'المادة أو المرجع', qty:'الكمية المستلمة', cost:'تكلفة الوحدة · درهم', supplier:'المورد', reference:'وصل / فاتورة', cancel:'إلغاء', confirm:'إضافة للمخزون', invalid:'المادة والكمية والتكلفة الإيجابية مطلوبة.', saved:'تم تسجيل الاستلام', syncOk:'تمت مزامنة المخزون', syncFail:'المزامنة غير متاحة', unavailable:'المخزن غير متاح لهذا الفندق', unit:'وحدة', pending:'قيد المعالجة', received:'مستلم', outlets:'نقاط البيع', hidden:'{n} سطرًا إضافيًا غير معروض، والمجاميع أعلاه تحتسبها. ابحث عن مادة لعرضها.', showMore:'عرض المزيد', search:'ابحث عن مادة', noMatch:'لا توجد مادة مطابقة لهذا البحث.'
    }
  };

  STR.fr.noThreshold = 'Seuil non défini'; STR.fr.noThresholdN = '{n} sans seuil défini';
  STR.en.noThreshold = 'No reorder level set'; STR.en.noThresholdN = '{n} without a reorder level';
  STR.ar.noThreshold = 'لم يُحدد حد إعادة الطلب'; STR.ar.noThresholdN = '{n} دون حد لإعادة الطلب';
  STR.fr.requestsFail = 'Chargement des demandes impossible.'; STR.fr.retry = 'Réessayer';
  STR.en.requestsFail = 'Could not load requests.'; STR.en.retry = 'Retry';
  STR.ar.requestsFail = 'تعذر تحميل الطلبات.'; STR.ar.retry = 'إعادة المحاولة';

  function lang() { return window.KiwiI18n && window.KiwiI18n.getLang ? window.KiwiI18n.getLang() : 'fr'; }
  function text() { return STR[lang()] || STR.fr; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function venue() { return window.KiwiVenue && window.KiwiVenue.getCurrentVenueData ? window.KiwiVenue.getCurrentVenueData() : null; }
  function isHotel() { var v = venue(); return !!v && (v.type === 'hotel' || v.subtype === 'hotel'); }
  function qty(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function fmt(value) { return qty(value).toLocaleString(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits:3 }); }

  /* Seule la liste affichée est bornée ; les compteurs lisent toutes les lignes. */
  var DISPLAY_LIMIT = 120;

  /* Catalogue du stock (assets/stock.js) indexé par id : nom, unité et seuil
   * de réapprovisionnement propres à chaque article. */
  function catalogueIndex() {
    var list;
    try { list = window.KiwiStockOperatingDay && window.KiwiStockOperatingDay.catalogue ? window.KiwiStockOperatingDay.catalogue() : []; } catch (_) { list = []; }
    var map = Object.create(null);
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (item && typeof item === 'object' && item.id != null && !(String(item.id) in map)) map[String(item.id)] = item;
    });
    return map;
  }
  function reorderLevel(item) { var n = Number(item && item.reorderLevel); return Number.isFinite(n) && n > 0 ? n : null; }
  /* Même règle que la page Stock (stockAlertState) : rupture à zéro, bas sous
   * le seuil de l'article. Sans seuil renseigné, l'Économat n'en invente pas
   * (l'ancien « 5 ou moins » classait « bas » un linge qui se compte en
   * centaines) : la ligne le dit, et un compteur dit combien en manquent. */
  function isLow(row) { return row.qty <= 0 || (row.threshold != null && row.qty < row.threshold); }

  /* Recherche locale : chaque ajout affiche DISPLAY_LIMIT lignes, et la
   * recherche parcourt toutes les lignes (nom, référence, emplacement), sans
   * tenir compte des accents ni de la casse. */
  var query = '';
  var receiveRows = [];
  var shownLimit = DISPLAY_LIMIT, receiveLimit = DISPLAY_LIMIT;
  var receiveQuery = '';
  function fold(value) { return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function matching(rows, q) {
    var needle = fold(q);
    if (!needle) return rows;
    return rows.filter(function (row) { return fold(row.name + ' ' + row.id + ' ' + row.location).indexOf(needle) >= 0; });
  }

  function inventoryRows() {
    var inv = window.KiwiInventory;
    var raw;
    try { raw = inv && inv.snapshot ? inv.snapshot() : []; } catch (_) { raw = []; }
    var source = Array.isArray(raw) ? raw : Array.isArray(raw && raw.rows) ? raw.rows : Array.isArray(raw && raw.items) ? raw.items : null;
    if (!source && raw && typeof raw === 'object') {
      var map = raw.balances && typeof raw.balances === 'object' ? raw.balances : raw;
      source = Object.keys(map).filter(function (key) {
        var value = map[key];
        return typeof value === 'number' || (value && typeof value === 'object' && ('itemId' in value || 'qty' in value || 'balance' in value || 'onHand' in value));
      }).map(function (key) {
        /* Clé du registre : article|variante|emplacement. */
        var parts = key.split('|'), value = map[key], base = { itemId:parts[0], locationId:parts[2] || '' };
        return typeof value === 'number' ? Object.assign(base, { qty:value }) : Object.assign(base, value);
      });
    }
    var catalogue = catalogueIndex();
    return (source || []).map(function (row, index) {
      row = row && typeof row === 'object' ? row : {};
      var id = String(row.itemId || row.id || row.sku || ('article-' + (index + 1))).slice(0, 100);
      var item = catalogue[id] || null;
      var out = { id:id, name:String((item && item.name) || row.name || row.itemName || row.label || id).slice(0, 140), unit:String((item && item.unit) || row.unit || '').slice(0, 40), location:String(row.locationId || row.location || '').slice(0, 100), qty:qty(row.qty != null ? row.qty : row.balance != null ? row.balance : row.onHand != null ? row.onHand : row.quantity), threshold:reorderLevel(item) };
      out.low = isLow(out);
      return out;
    }).sort(function (a, b) { return (a.low ? -1 : 1) - (b.low ? -1 : 1) || a.name.localeCompare(b.name); });
  }

  function procurement() {
    try { return window.KiwiProcurement && window.KiwiProcurement.doc ? window.KiwiProcurement.doc() : {}; } catch (_) { return {}; }
  }

  function state() {
    var inv = window.KiwiInventory;
    var rows = inventoryRows();
    var doc = procurement();
    var orders = Array.isArray(doc.orders) ? doc.orders : [];
    var receipts = Array.isArray(doc.receipts) ? doc.receipts : [];
    var found = matching(rows, query);
    return { rows:rows, found:found, shown:found.slice(0, shownLimit), low:rows.filter(function (row) { return row.low; }).length, noThreshold:rows.filter(function (row) { return row.threshold == null && row.qty > 0; }).length, queued:inv && inv.pending ? qty(inv.pending()) : 0, orders:orders, receipts:receipts, openOrders:orders.filter(function (order) { return ['draft','sent','partial'].indexOf(order && order.status) >= 0; }).length, location:inv && inv.locationId ? String(inv.locationId() || '') : '' };
  }

  function pill(row, T) {
    if (row.qty <= 0) return '<span class="hx-pill late hx-eco-state">' + esc(T.out) + '</span>';
    if (row.low) return '<span class="hx-pill pend hx-eco-state">' + esc(T.lowState) + '</span>';
    return '<span class="hx-pill ok hx-eco-state">' + esc(T.healthy) + '</span>';
  }

  function stockListHtml(s, T) {
    if (!s.found.length) return '<div class="hx-eco-empty"><p>' + esc(T.noMatch) + '</p></div>';
    var hidden = s.found.length - s.shown.length;
    return '<div class="hx-eco-table">' + s.shown.map(function (row) {
      return '<div class="hx-eco-row"><div class="hx-eco-item"><b>' + esc(row.name) + '</b><small>' + esc(row.id) + (row.unit ? ' · ' + esc(row.unit) : '') + (row.location ? ' · ' + esc(row.location) : '') + (row.threshold == null && row.qty > 0 ? ' · ' + esc(T.noThreshold) : '') + '</small></div><div class="hx-eco-qty">' + fmt(row.qty) + '</div>' + pill(row, T) + '</div>';
    }).join('') + '</div>' + (hidden > 0 ? '<p class="hx-eco-more" role="note">' + esc(T.hidden.replace('{n}', fmt(hidden))) + '</p><button type="button" class="hx-btn ghost" data-action="eco-show-more">' + esc(T.showMore) + '</button>' : '');
  }

  function stockHtml(s, T) {
    if (!s.rows.length) return '<div class="hx-eco-empty"><b>' + esc(T.noStock) + '</b><p>' + esc(T.noStockD) + '</p></div>';
    return '<label class="hx-eco-search"><input type="search" data-eco-search value="' + esc(query) + '" placeholder="' + esc(T.search) + '" aria-label="' + esc(T.search) + '" autocomplete="off"></label><div data-eco-stock>' + stockListHtml(s, T) + '</div>';
  }

  /* Une seule chronologie : commandes et réceptions mêlées, triées par la date
   * de leur dernière opération, la plus récente d'abord, puis coupées à six.
   * (Avant : quatre commandes puis quatre réceptions dans l'ordre du stockage,
   * coupées à six, et une réception récente pouvait passer sous de vieilles
   * commandes.) */
  function when(value) { var n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
  function activityHtml(s, T) {
    var rows = s.orders.filter(Boolean).map(function (order) { return { at:when(order.updatedAt) || when(order.sentAt) || when(order.createdAt), id:order.number || order.id || 'Commande', sub:order.expectedDate || order.status || T.pending, status:order.status || 'pending', value:order.status === 'received' ? T.received : T.pending }; });
    s.receipts.filter(Boolean).forEach(function (receipt) { rows.push({ at:when(receipt.receivedAt) || when(receipt.updatedAt) || when(receipt.createdAt), id:receipt.number || receipt.externalRef || receipt.id || T.received, sub:receipt.externalRef || T.received, status:'received', value:T.received }); });
    rows = rows.map(function (row, i) { row.i = i; return row; }).sort(function (a, b) { return (b.at - a.at) || (a.i - b.i); }).slice(0, 6);
    if (!rows.length) return '<div class="hx-eco-empty"><b>' + esc(T.noActivity) + '</b><p>' + esc(T.noActivityD) + '</p></div>';
    return '<div class="hx-eco-activity">' + rows.map(function (row) { return '<div class="hx-eco-event ' + (row.status === 'received' ? '' : 'pending') + '"><i></i><div><b>' + esc(row.id) + '</b><small>' + esc(row.sub) + '</small></div><span>' + esc(row.value) + '</span></div>'; }).join('') + '</div>';
  }

  function render() {
    var T = text(), s = state(), v = venue() || {};
    Kiwi.appPage('economat', {
      title:T.title,
      subtitle:esc(v.name || T.eyebrow) + (s.location ? ' · ' + esc(T.location) + ' ' + esc(s.location) : ''),
      body:'<div class="hx-page hx-eco">' +
        '<section class="hx-eco-hero"><div><div class="eyebrow">' + esc(T.eyebrow) + '</div><h2>' + esc(T.title) + '</h2><p>' + esc(T.intro) + '</p></div><div class="hx-eco-actions"><button class="hx-btn ghost" data-action="nav-points-vente">' + esc(T.outlets) + '</button><button class="hx-btn ghost" data-action="eco-sync"' + (busy ? ' disabled aria-busy="true"' : '') + '>' + esc(T.sync) + '</button><button class="hx-btn atlas" data-action="eco-receive">' + esc(T.receive) + '</button></div></section>' +
        '<div class="hx-strip" tabindex="0" role="region" aria-label="' + esc(T.title) + '"><div class="hx-kpi"><div class="l">' + esc(T.products) + '</div><div class="v">' + s.rows.length + '</div><div class="d">' + esc(T.stock) + '</div></div><div class="hx-kpi"><div class="l">' + esc(T.low) + '</div><div class="v">' + s.low + '</div><div class="d ' + (s.low ? 'warn' : s.noThreshold ? '' : 'up') + '">' + esc(s.low ? T.lowState : s.noThreshold ? T.noThresholdN.replace('{n}', fmt(s.noThreshold)) : T.healthy) + '</div></div><div class="hx-kpi"><div class="l">' + esc(T.queued) + '</div><div class="v">' + s.queued + '</div><div class="d">' + esc(T.sync) + '</div></div><div class="hx-kpi"><div class="l">' + esc(T.orders) + '</div><div class="v">' + s.openOrders + '</div><div class="d">' + esc(T.activity) + '</div></div></div>' +
        '<div class="hx-eco-grid"><section class="hx-eco-card"><div class="hx-eco-card-head"><div><b>' + esc(T.stock) + '</b><span>' + esc(T.stockSub) + '</span></div><span class="hx-pill ' + (s.queued ? 'pend' : 'ok') + '">' + esc(s.queued ? T.pending : T.healthy) + '</span></div>' + stockHtml(s,T) + '</section><aside class="hx-eco-side"><section class="hx-eco-card"><div class="hx-eco-card-head"><div><b>' + esc(T.activity) + '</b><span>' + esc(T.activitySub) + '</span></div></div>' + activityHtml(s,T) + '</section></aside></div>' +
        '<div data-eco-requests-host></div>' +
      '</div>'
    });
    mountRequests();
  }

  /* Demandes des services : assets/hotel-economat-requests.js (+ .css),
   * chargé à la première visite de l'Économat plutôt que par la coquille. */
  var REQUESTS_JS = 'assets/hotel-economat-requests.js?v=5';
  var REQUESTS_CSS = 'assets/hotel-economat-requests.css?v=2';
  var requestsLoading = null;
  function loadRequests() {
    if (window.KiwiEconomatRequests) return Promise.resolve();
    if (requestsLoading) return requestsLoading;
    requestsLoading = new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = REQUESTS_CSS;
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = REQUESTS_JS; script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { requestsLoading = null; script.remove(); reject(new Error('requests-unavailable')); };
      document.head.appendChild(script);
    });
    return requestsLoading;
  }
  function mountRequests() {
    var host = document.querySelector('[data-eco-requests-host]');
    if (!host) return;
    if (window.KiwiEconomatRequests) { window.KiwiEconomatRequests.mount(host); return; }
    loadRequests().then(function () {
      if (!window.KiwiEconomatRequests) { requestsLoading = null; throw new Error('requests-unavailable'); }
      var live = document.querySelector('[data-eco-requests-host]');
      if (live && Kiwi.activePage === 'economat' && window.KiwiEconomatRequests) window.KiwiEconomatRequests.mount(live);
    }).catch(function () {
      if (document.querySelector('[data-eco-requests-host]') !== host || Kiwi.activePage !== 'economat') return;
      host.innerHTML = '<p role="alert">' + esc(text().requestsFail) + '</p><button type="button" class="hx-btn" data-action="eco-requests-retry">' + esc(text().retry) + '</button>';
    });
  }
  handlers['eco-requests-retry'] = function () { mountRequests(); };
  /* Le stock lu ici aide la validation d'une demande (quantité en stock). */
  window.KiwiEconomatStock = { rows: inventoryRows };

  /* Suggestions du bon de réception : les DISPLAY_LIMIT premières, puis, dès
   * qu'on tape, celles qui correspondent parmi TOUS les articles. Afficher plus
   * ajoute une page sans perdre la recherche ni les champs du formulaire. */
  function itemMoreHtml(count, T) {
    return '<button type="button" class="hx-btn ghost wide" id="eco-items-more" data-action="eco-items-more"' + (count <= receiveLimit ? ' hidden' : '') + '>' + esc(T.showMore) + '</button>';
  }
  function itemOptions(rows, q) {
    return matching(rows, q).slice(0, receiveLimit).map(function (row) { return '<option value="' + esc(row.id) + '">' + esc(row.name) + '</option>'; }).join('');
  }
  function onInput(event) {
    var el = event && event.target;
    if (!el) return;
    if (el.matches && el.matches('[data-eco-search]')) {
      query = String(el.value || '');
      shownLimit = DISPLAY_LIMIT;
      var box = document.querySelector('[data-eco-stock]');
      if (box) box.innerHTML = stockListHtml(state(), text());
      return;
    }
    if (el.id === 'eco-item') {
      receiveQuery = String(el.value || '');
      receiveLimit = DISPLAY_LIMIT;
      updateItemOptions();
    }
  }
  if (typeof document !== 'undefined' && document && document.addEventListener) document.addEventListener('input', onInput);

  handlers['nav-economat'] = function () {
    if (!isHotel()) { Kiwi.toast(text().unavailable, { type:'warning' }); return; }
    query = '';
    shownLimit = DISPLAY_LIMIT;
    if (window.KiwiEconomatRequests) window.KiwiEconomatRequests.reset();
    if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
    if (window.KiwiInventory && window.KiwiInventory.subscribe) unsubscribe = window.KiwiInventory.subscribe(function () { if (Kiwi.activePage === 'economat') render(); });
    render();
  };

  handlers['eco-sync'] = async function () {
    if (busy) return;
    busy = true; render();
    try { await window.KiwiInventory.sync(); Kiwi.toast(text().syncOk, { type:'success' }); }
    catch (_) { Kiwi.toast(text().syncFail, { type:'warning' }); }
    finally { busy = false; render(); }
  };

  handlers['eco-show-more'] = function () {
    shownLimit += DISPLAY_LIMIT;
    var box = document.querySelector('[data-eco-stock]');
    if (box) box.innerHTML = stockListHtml(state(), text());
  };
  function updateItemOptions() {
    var list = document.getElementById('eco-items');
    if (list) list.innerHTML = itemOptions(receiveRows, receiveQuery);
    var more = document.getElementById('eco-items-more');
    if (more) more.hidden = matching(receiveRows, receiveQuery).length <= receiveLimit;
  }
  handlers['eco-items-more'] = function () {
    receiveLimit += DISPLAY_LIMIT;
    updateItemOptions();
  };

  handlers['eco-receive'] = function () {
    var T = text(), rows = receiveRows = inventoryRows();
    receiveLimit = DISPLAY_LIMIT; receiveQuery = '';
    modalRef = Kiwi.modal({
      tag:T.receiptTag, title:T.receiptTitle, width:580,
      body:'<div class="hx-eco-form"><label class="wide">' + esc(T.item) + '<input id="eco-item" list="eco-items" autocomplete="off"><datalist id="eco-items">' + itemOptions(rows, '') + '</datalist></label>' + itemMoreHtml(rows.length, T) + '<label>' + esc(T.qty) + '<input id="eco-qty" type="number" min="0.001" step="0.001" inputmode="decimal"></label><label>' + esc(T.cost) + '<input id="eco-cost" type="number" min="0.01" step="0.01" inputmode="decimal"></label><label>' + esc(T.supplier) + '<input id="eco-supplier" autocomplete="organization"></label><label>' + esc(T.reference) + '<input id="eco-ref" autocomplete="off"></label></div>',
      foot:'<button class="kb ghost" data-dismiss>' + esc(T.cancel) + '</button><button data-activation=write class="kb atlas" data-action="eco-receive-save">' + esc(T.confirm) + '</button>'
    });
    setTimeout(function () { document.getElementById('eco-item')?.focus(); }, 30);
  };

  handlers['eco-receive-save'] = async function () {
    var T = text(), itemId = String(document.getElementById('eco-item')?.value || '').trim(), amount = qty(document.getElementById('eco-qty')?.value), cost = qty(document.getElementById('eco-cost')?.value);
    if (!itemId || amount <= 0 || cost <= 0) { Kiwi.toast(T.invalid, { type:'warning' }); return; }
    var procurementEngine = window.KiwiProcurement;
    if (!procurementEngine || !procurementEngine.receiveDirect) { Kiwi.toast(T.unavailable, { type:'warning' }); return; }
    var result = procurementEngine.receiveDirect({ supplierId:String(document.getElementById('eco-supplier')?.value || '').trim(), externalRef:String(document.getElementById('eco-ref')?.value || '').trim(), receivedBy:'dashboard', lines:[{ itemId:itemId, name:itemId, qty:amount, unit:T.unit, unitCost:cost }] });
    if (result && result.error) { Kiwi.toast(result.error, { type:'warning' }); return; }
    modalRef && modalRef.close && modalRef.close();
    Kiwi.toast(T.saved, { type:'success' });
    try { await window.KiwiInventory.sync(); } catch (_) {}
    render();
  };
}());
