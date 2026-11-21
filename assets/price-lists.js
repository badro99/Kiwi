/* Kiwi · les TARIFS côté navigateur (listes de prix : détail, gros, en ligne,
 * factures, livraison). Le serveur décide de tout (functions/api/price-lists/) ;
 * ce fichier n'est qu'un client mince, sans copie ni prix inventé.
 *
 * window.KiwiPriceLists — le contrat du tableau d'édition en masse (le grid le
 * détecte ; NE PAS changer cette forme) :
 *   list()            → Promise<[{ id, name, isMain }]>   le principal d'abord
 *   prices(listId)    → Promise<Map<itemKey, priceCents>> prix posés dans ce tarif
 *                       (pour 'main' : le prix du catalogue de chaque article)
 *   setPrices(rows)   → Promise<{ ok, written, removed }>
 *                       rows : [{ itemKey, listId, price }] — `price` en CENTIMES
 *                       entiers, comme prices() ; null retire le prix (l'article
 *                       retombe sur le principal). 0 n'est accepté qu'avec
 *                       `free: true` (offert exprès), sinon zero-price. Les
 *                       lignes 'main' s'écrivent dans le catalogue (KiwiBoutiqueCatalog.updateProduct), les
 *                       autres en un seul appel serveur, tout ou rien.
 *
 * window.KiwiPriceListsApi — le reste, pour l'écran Tarifs et les factures :
 *   lists({archived}), create(spec), update(id, patch), archive(id, replacement),
 *   remove(id, replacement), derive(listId, pct, step, items), itemPrices(itemKey),
 *   clients(listId), assignClient(clientId, listId), resolve(spec)
 * Chaque appel rejette avec une Error dont `.code` est le code serveur.
 */
(function () {
  'use strict';
  if (window.KiwiPriceLists) return;

  function slug() {
    try { var s = window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug(); if (s) return String(s); } catch (_) {}
    try { var m = window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant(); if (m) return String(m); } catch (_) {}
    return '';
  }
  function fail(code, status) { var e = new Error(code || 'unavailable'); e.code = code || 'unavailable'; e.status = status || 0; return e; }
  function call(path, body) {
    var m = slug();
    if (!m) return Promise.reject(fail('no-merchant'));
    var url = '/api/price-lists' + path;
    var init = { credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body) { init.method = 'POST'; init.body = JSON.stringify(Object.assign({ merchant: m }, body)); }
    else url += (url.indexOf('?') < 0 ? '?' : '&') + 'merchant=' + encodeURIComponent(m);
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j || j.ok === false) throw fail((j && j.error) || 'http-' + r.status, r.status);
        return j;
      });
    }, function () { throw fail('offline'); });
  }
  var q = encodeURIComponent;

  function list() {
    return call('').then(function (j) { return (j.lists || []).map(function (l) { return { id: l.id, name: window.KiwiPriceListsApi.nameOf(l), isMain: !!l.isMain }; }); });
  }
  function prices(listId) {
    return call('/prices?list=' + q(listId)).then(function (j) {
      var out = new Map();
      (j.prices || []).forEach(function (p) { if (!p.variantKey) out.set(p.itemKey, p.cents); });
      return out;
    });
  }
  function setPrices(rows) {
    var all = Array.isArray(rows) ? rows : [];
    var main = all.filter(function (r) { return r && r.listId === 'main'; });
    var other = all.filter(function (r) { return r && r.listId !== 'main'; }).map(function (r) {
      var row = { listId: r.listId, itemKey: r.itemKey, variantKey: r.variantKey || '', price: r.price == null ? null : Math.round(Number(r.price)) };
      if (r.free === true) row.free = true;   // 0 MAD n'est accepté qu'offert exprès (sinon zero-price)
      return row;
    });
    var done = { ok: true, written: 0, removed: 0 };
    if (main.length) {
      var C = window.KiwiBoutiqueCatalog;
      if (!C || typeof C.updateProduct !== 'function') return Promise.reject(fail('catalogue-unavailable'));
      for (var i = 0; i < main.length; i++) {
        var cents = Math.round(Number(main[i].price));
        if (main[i].price == null || !Number.isFinite(cents) || cents < 0) return Promise.reject(fail('bad-price'));
      }
      main.forEach(function (r) { if (C.updateProduct(r.itemKey, { priceMAD: Math.round(Number(r.price)) / 100 })) done.written++; });
    }
    if (!other.length) return Promise.resolve(done);
    return call('/prices', { rows: other }).then(function (j) {
      done.written += j.written || 0; done.removed += j.removed || 0; return done;
    });
  }

  window.KiwiPriceLists = { list: list, prices: prices, setPrices: setPrices };

  window.KiwiPriceListsApi = {
    lists: function (o) { return call(o && o.archived ? '?archived=1' : '').then(function (j) { return j.lists || []; }); },
    create: function (spec) { return call('', Object.assign({ action: 'create' }, spec)); },
    update: function (id, patch) { return call('', Object.assign({ action: 'update', id: id }, patch)); },
    archive: function (id, replacement) { return call('', { action: 'archive', id: id, replacement: replacement || 'main' }); },
    remove: function (id, replacement) { return call('', { action: 'delete', id: id, replacement: replacement || 'main' }); },
    reorder: function (ids) { return call('', { action: 'reorder', ids: ids }); },
    derive: function (listId, pct, step, items, preview) { return call('/prices', { action: 'derive', listId: listId, pct: pct, step: step, items: items, preview: !!preview }); },
    listPrices: function (listId) { return call('/prices?list=' + q(listId)).then(function (j) { return j.prices || []; }); },
    itemPrices: function (itemKey) { return call('/prices?item=' + q(itemKey)); },
    clients: function (listId) { return call('/clients' + (listId ? '?list=' + q(listId) : '')).then(function (j) { return j.clients || []; }); },
    assignClient: function (clientId, listId) { return call('/clients', { clientId: clientId, listId: listId || null }); },
    resolve: function (spec) { return call('/resolve', spec || {}); },
    sales: function (days) { return call('/sales?days=' + q(days || 30)); },
    /* Le principal non renommé, dans la langue de l'écran. */
    nameOf: function (l) { return l && l.isMain && (l.defaultName || !l.name) ? L('Prix principal', 'Main price', 'الثمن الأساسي') : String((l && l.name) || ''); },
  };

  /* ── FACTURES ET DEVIS : des articles du catalogue au prix d'un tarif ──────
   * Le compositeur de factures (assets/invoicing/, découpe scellée) n'est pas
   * touché : cette carte se pose à côté de ses lignes. On choisit un tarif (par
   * défaut celui de la fiche client choisie), on cherche un article, et la
   * ligne arrive au prix que le SERVEUR résout (/api/price-lists/resolve,
   * canal factures), converti en HT avec le taux de TVA de la ligne. Le choix
   * part avec le document : le sélecteur porte data-f="pricelist", que
   * composerPayload (assets/invoicing/composer.js) envoie en `priceListId`.
   * « Selon la fiche client » (valeur vide) n'envoie rien : le serveur garde le
   * tarif du document, ou à la création celui de la fiche
   * (functions/api/_price-lists.js › invoicePriceList). */
  function L(fr, en, ar) { var l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang(); return l === 'en' ? en : l === 'ar' ? ar : fr; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var invLists = null;
  function invoiceLists() {
    if (invLists) return Promise.resolve(invLists);
    return window.KiwiPriceListsApi.lists().then(function (ls) {
      invLists = ls.filter(function (l) { return l.isMain || (l.channels || []).indexOf('invoices') >= 0; });
      setTimeout(function () { invLists = null; }, 60000);
      return invLists;
    });
  }
  function book() {
    try {
      var rows = window.KiwiClientsDirectory && window.KiwiClientsDirectory.load && window.KiwiClientsDirectory.load().rows;
      if (Array.isArray(rows)) return rows.filter(function (r) { return r && r.name; });
      var list = window.KiwiClients && window.KiwiClients.list && window.KiwiClients.list();
      if (Array.isArray(list)) return list.filter(function (r) { return r && r.name; });
    } catch (_) {}
    return [];
  }
  function addCatalogLine(card, itemKey) {
    var compose = card.closest('[data-inv-compose]');
    var sel = card.querySelector('[data-plinv-list]');
    if (!compose || !sel) return;
    var spec = { channel: 'invoices', items: [{ itemKey: itemKey, qty: 1 }] };
    if (sel.value) spec.listId = sel.value; else if (card.getAttribute('data-plinv-client')) spec.clientId = card.getAttribute('data-plinv-client');
    window.KiwiPriceListsApi.resolve(spec).then(function (j) {
      var line = j.lines && j.lines[0];
      if (!line || line.unitCents == null) throw new Error('unknown');
      var rows = compose.querySelectorAll('.inv-line-row');
      var last = rows[rows.length - 1];
      var empty = last && !last.querySelector('[data-l="desc"]').value.trim() && !last.querySelector('[data-l="unit"]').value.trim();
      if (!empty) {
        var add = compose.querySelector('[data-inv-act="add-line"]');
        if (add) add.click();
        rows = compose.querySelectorAll('.inv-line-row');
        last = rows[rows.length - 1];
      }
      if (!last) return;
      var C = window.KiwiBoutiqueCatalog, p = null;
      try { p = C && C.getProduct ? C.getProduct(itemKey) : null; } catch (_) {}
      var rate = Number(last.querySelector('[data-l="vat"]').value) || 0;
      var ht = Math.round(line.unitCents * 100 / (100 + rate));
      var set = function (k, v) { var el = last.querySelector('[data-l="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('desc', (p && p.name) || itemKey);
      set('qty', '1');
      set('unit', (ht / 100).toFixed(2).replace('.', ','));
    }).catch(function () {
      try { window.Kiwi.toast(L('Prix introuvable pour cet article', 'No price found for this item', 'لا يوجد ثمن لهذه السلعة'), { type: 'error' }); } catch (_) {}
    });
  }
  function autoOption() { return '<option value="">' + esc(L('Selon la fiche client', 'As on the customer record', 'حسب بطاقة الزبون')) + '</option>'; }
  function paintCard(card) {
    var q = (card.querySelector('[data-plinv-q]').value || '').trim().toLowerCase();
    var out = card.querySelector('[data-plinv-hits]');
    var C = window.KiwiBoutiqueCatalog, prods = [];
    try { prods = C ? C.listProducts().filter(function (p) { return p && !p.archived; }) : []; } catch (_) {}
    var hits = q ? prods.filter(function (p) { return String(p.name || '').toLowerCase().indexOf(q) >= 0 || String(p.sku || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8) : [];
    out.innerHTML = hits.map(function (p) { return '<button type="button" class="inv-btn small" data-plinv-add="' + esc(p.id) + '">' + esc(p.name) + '</button>'; }).join(' ');
  }
  function mountInvoiceCard() {
    var linesBox = document.querySelector('[data-inv-compose] [data-inv-lines]');
    if (!linesBox || !window.KiwiBoutiqueCatalog) return;
    var compose = linesBox.closest('[data-inv-compose]');
    if (compose.querySelector('[data-plinv]')) return;
    var addBtn = compose.querySelector('[data-inv-act="add-line"]');
    if (!addBtn || addBtn.disabled) return;
    var section = linesBox.closest('.inv-form-card');
    if (!section) return;
    var card = document.createElement('section');
    card.className = 'inv-form-card';
    card.setAttribute('data-plinv', '');
    card.innerHTML = '<h4 class="inv-section-title">' + esc(L('Articles du catalogue', 'Catalogue items', 'سلع الكتالوج')) + '</h4><div class="inv-fields">'
      + '<div class="inv-field"><label>' + esc(L('Tarif', 'Price list', 'التسعيرة')) + '</label><select data-plinv-list data-f="pricelist">' + autoOption() + '</select></div>'
      + '<div class="inv-field"><label>' + esc(L('Ajouter un article', 'Add an item', 'إضافة سلعة')) + '</label><input data-plinv-q type="search" autocomplete="off"></div>'
      + '<div class="inv-field wide" data-plinv-hits></div></div>';
    card.querySelector('[data-plinv-q]').placeholder = L('Nom ou référence', 'Name or reference', 'الاسم أو المرجع');
    section.parentNode.insertBefore(card, section);
    invoiceLists().then(function (ls) {
      var sel = card.querySelector('[data-plinv-list]');
      var was = sel.value;
      sel.innerHTML = autoOption() + ls.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(window.KiwiPriceListsApi.nameOf(l)) + '</option>'; }).join('');
      if (was && sel.querySelector('option[value="' + was + '"]')) sel.value = was;
    }).catch(function () { /* hors ligne : le principal seul */ });
    card.querySelector('[data-plinv-q]').addEventListener('input', function () { paintCard(card); });
    card.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-plinv-add]');
      if (b) addCatalogLine(card, b.getAttribute('data-plinv-add'));
    });
    var pick = compose.querySelector('[data-f="pick"]');
    if (pick) pick.addEventListener('change', function () {
      var row = book()[Number(pick.value)];
      if (!row || !row.id) return;
      card.setAttribute('data-plinv-client', String(row.id));
      call('/clients?client=' + q(row.id)).then(function (j) {
        var hit = (j.clients || [])[0], sel = card.querySelector('[data-plinv-list]');
        if (sel) sel.value = hit && sel.querySelector('option[value="' + hit.listId + '"]') ? hit.listId : '';
      }).catch(function () {});
    });
  }
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(function () { scheduled = false; try { mountInvoiceCard(); } catch (_) {} });
  }
  if (typeof MutationObserver === 'function' && document.body) new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var t = records[i].target;
      if (t && t.nodeType === 1 && (t.hasAttribute('data-inv-compose') || t.hasAttribute('data-inv-lines'))) { schedule(); return; }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
