/* Kiwi Caisse · stock bridge
 *
 * The owner dashboard stores the catalog and its descriptive fields in the
 * tenant-scoped `stock` cloud document. Quantities themselves live in the
 * append-only KiwiInventory ledger. The caisse used to ignore both contracts
 * and kept a second, in-memory `stockItems` array: a reload emptied it and a
 * delivery received at the till never reached the owner dashboard.
 *
 * This adapter deliberately speaks the dashboard's existing document shape.
 * It is local-first, cloud-backed and uses inventory movements for every
 * quantity change; there is no second stock truth anymore. */
(function () {
  'use strict';

  var PREFIX = 'kiwi:stockOverlay:';
  var doc = null;
  var bound = '';
  var listeners = new Set();
  var ledgerUnsub = null;

  function slug() {
    try {
      var s = window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug();
      if (s) return String(s).slice(0, 64);
    } catch (_) {}
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
        var pm = window.KiwiPlatform.pairedMerchant();
        if (pm) return pm;
      }
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return p && p.merchant ? String(p.merchant).slice(0, 64) : '';
    } catch (_) { return ''; }
  }
  function key() { return PREFIX + slug(); }
  function migrateStockDocV2(d) {
    if (!d || typeof d !== 'object') return d;
    if ((d.schemaVersion || 1) >= 2 && Array.isArray(d.subcategories)) return d;

    var categories = Array.isArray(d.cats) ? d.cats.slice() : (Array.isArray(d.categories) ? d.categories.slice() : []);
    var knownCatIds = new Set(categories.map(function (c) { return c && c.id; }));
    var subcategories = [];

    var originals = {};
    (Array.isArray(d.items) ? d.items : []).forEach(function (item) {
      if (!item || !item.id) return;
      originals[String(item.id)] = item;
      var catId = String(item.category || item.cat || 'epicerie');
      if (!knownCatIds.has(catId)) {
        categories.push({ id: catId, label: String(item.category || item.cat || 'Épicerie') });
        knownCatIds.add(catId);
      }
      var supCards = [];
      if (item.supplier) {
        supCards.push({
          id: 'sup-card-' + item.id,
          supplierName: String(item.supplier),
          defaultPrice: Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : (Number.isFinite(+item.cost) ? +item.cost : 0),
          purchaseUnit: String(item.unit || 'unité'),
          factor: 1,
          rank: 1,
        });
      }
      subcategories.push({
        id: String(item.id),
        categoryId: catId,
        name: String(item.name || 'Article'),
        unit: String(item.unit || 'unité'),
        defaultCost: Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : (Number.isFinite(+item.cost) ? +item.cost : 0),
        suppliers: supCards,
        currentStock: Number.isFinite(+item.currentStock) ? +item.currentStock : (Number.isFinite(+item.stock) ? +item.stock : 0),
        parLevel: item.parLevel != null ? +item.parLevel : (item.par != null ? +item.par : null),
        reorderLevel: item.reorderLevel != null ? +item.reorderLevel : (item.reorder != null ? +item.reorder : null),
        usageThisWeek: +item.usageThisWeek || 0,
        theoreticalUsage: +item.theoreticalUsage || 0,
        updatedAt: +item.updatedAt || Date.now(),
      });
    });

    d.schemaVersion = 2;
    d.cats = categories;
    d.categories = categories;
    d.subcategories = subcategories;

    /* Enveloppe de compatibilité. On PART de l'article d'origine et on n'écrase
       que les champs projetés : une reconstruction à partir d'une liste fixe
       détruit en silence tout champ hors liste (lastDelivery, status, sku, notes…)
       et la migration se réécrit dans localStorage dès la lecture — la perte est
       immédiate et définitive. */
    d.items = subcategories.map(function (s) {
      return Object.assign({}, originals[s.id] || {}, {
        id: s.id,
        name: s.name,
        category: s.categoryId,
        unit: s.unit,
        costPerUnit: s.defaultCost,
        supplier: (s.suppliers && s.suppliers[0] && s.suppliers[0].supplierName) || '',
        currentStock: s.currentStock != null ? +s.currentStock : 0,
        parLevel: s.parLevel,
        reorderLevel: s.reorderLevel,
        usageThisWeek: s.usageThisWeek != null ? +s.usageThisWeek : 0,
        theoreticalUsage: s.theoreticalUsage != null ? +s.theoreticalUsage : 0,
        updatedAt: s.updatedAt,
      });
    });
    return d;
  }

  function blank() {
    return { schemaVersion: 2, items: [], subcategories: [], sups: [], cats: [], categories: [], itemOv: {}, supOv: {}, stockOv: {}, delItems: [], delSups: [] };
  }
  function read() {
    if (!slug()) return blank();
    try {
      var raw = localStorage.getItem(key());
      var d = JSON.parse(raw || 'null');
      if (!d || typeof d !== 'object') return blank();
      var hadV2 = (d.schemaVersion || 1) >= 2 && Array.isArray(d.subcategories);
      d = migrateStockDocV2(d);
      if (!hadV2) {
        try { localStorage.setItem(key(), JSON.stringify(d)); } catch (_) {}
      }
      return Object.assign(blank(), d, {
        items: Array.isArray(d.items) ? d.items : [],
        subcategories: Array.isArray(d.subcategories) ? d.subcategories : [],
        sups: Array.isArray(d.sups) ? d.sups : [],
        cats: Array.isArray(d.cats) ? d.cats : [],
        categories: Array.isArray(d.categories) ? d.categories : (Array.isArray(d.cats) ? d.cats : []),
        itemOv: d.itemOv && typeof d.itemOv === 'object' ? d.itemOv : {},
        supOv: d.supOv && typeof d.supOv === 'object' ? d.supOv : {},
        stockOv: d.stockOv && typeof d.stockOv === 'object' ? d.stockOv : {},
        delItems: Array.isArray(d.delItems) ? d.delItems : [],
        delSups: Array.isArray(d.delSups) ? d.delSups : [],
      });
    } catch (_) { return blank(); }
  }
  function emit(source) {
    listeners.forEach(function (fn) { try { fn(snapshot()); } catch (_) {} });
    try {
      window.dispatchEvent(new CustomEvent('kiwi-stock-changed', {
        detail: { venue: slug(), source: source || 'caisse' },
      }));
    } catch (_) {}
  }
  function write(d, fromCloud) {
    if (!slug()) return;
    try { localStorage.setItem(key(), JSON.stringify(d)); } catch (_) {}
    emit(fromCloud ? 'cloud' : 'caisse');
  }
  function syncEnvelope(d) {
    if (!d || typeof d !== 'object') return d;
    d.schemaVersion = 2;
    if (Array.isArray(d.subcategories)) {
      /* Même règle que la migration : on part de l'article existant. Sans ça,
         chaque synchronisation détruit les champs hors liste projetée. */
      var prev = {};
      (Array.isArray(d.items) ? d.items : []).forEach(function (it) {
        if (it && it.id != null) prev[String(it.id)] = it;
      });
      d.items = d.subcategories.map(function (s) {
        var ov = d.itemOv && d.itemOv[s.id] ? d.itemOv[s.id] : {};
        return Object.assign({}, prev[s.id] || {}, {
          id: s.id,
          name: ov.name != null ? String(ov.name) : s.name,
          category: ov.category != null ? String(ov.category) : (ov.cat != null ? String(ov.cat) : s.categoryId),
          unit: ov.unit != null ? String(ov.unit) : s.unit,
          costPerUnit: ov.costPerUnit != null ? +ov.costPerUnit : (ov.cost != null ? +ov.cost : s.defaultCost),
          supplier: ov.supplier != null ? String(ov.supplier) : ((s.suppliers && s.suppliers[0] && s.suppliers[0].supplierName) || ''),
          currentStock: s.currentStock != null ? +s.currentStock : 0,
          parLevel: ov.parLevel != null ? +ov.parLevel : (ov.par != null ? +ov.par : s.parLevel),
          reorderLevel: ov.reorderLevel != null ? +ov.reorderLevel : (ov.reorder != null ? +ov.reorder : s.reorderLevel),
          usageThisWeek: s.usageThisWeek != null ? +s.usageThisWeek : 0,
          theoreticalUsage: s.theoreticalUsage != null ? +s.theoreticalUsage : 0,
          updatedAt: Math.max(+s.updatedAt || 0, +ov.updatedAt || 0),
        });
      });
    }
    return d;
  }
  function save(d) {
    d = syncEnvelope(migrateStockDocV2(d));
    write(d, false);
    if (doc) doc.push();
  }

  function updated(row) { return Math.max(0, +(row && row.updatedAt) || 0); }
  function mergeRows(mine, theirs) {
    var out = []; var by = Object.create(null);
    (Array.isArray(theirs) ? theirs : []).forEach(function (row) {
      if (!row || !row.id) return;
      by[row.id] = row;
    });
    (Array.isArray(mine) ? mine : []).forEach(function (row) {
      if (!row || !row.id) return;
      var other = by[row.id];
      if (!other || updated(row) >= updated(other)) by[row.id] = row;
    });
    Object.keys(by).forEach(function (id) { out.push(by[id]); });
    return out;
  }
  function mergeMap(mine, theirs) {
    var out = Object.assign({}, theirs || {});
    Object.keys(mine || {}).forEach(function (id) {
      var a = mine[id]; var b = out[id];
      out[id] = !b || updated(a) >= updated(b) ? a : b;
    });
    return out;
  }
  function merge(mine, theirs) {
    mine = Object.assign(blank(), migrateStockDocV2(mine) || {});
    theirs = Object.assign(blank(), migrateStockDocV2(theirs) || {});
    var M = window.KiwiCloudDoc && window.KiwiCloudDoc.mergeDefault;
    var out = M ? M(mine, theirs) : Object.assign({}, theirs, mine);
    out.schemaVersion = 2;
    out.subcategories = mergeRows(mine.subcategories, theirs.subcategories);
    out.items = mergeRows(mine.items, theirs.items);
    out.sups = mergeRows(mine.sups, theirs.sups);
    out.cats = mergeRows(mine.cats, theirs.cats);
    out.categories = out.cats;
    out.itemOv = mergeMap(mine.itemOv, theirs.itemOv);
    out.supOv = mergeMap(mine.supOv, theirs.supOv);
    out.delItems = Array.from(new Set([].concat(mine.delItems || [], theirs.delItems || [])));
    out.delSups = Array.from(new Set([].concat(mine.delSups || [], theirs.delSups || [])));
    return syncEnvelope(out);
  }
  function empty(d) {
    return !d || !(
      (d.items && d.items.length) || (d.subcategories && d.subcategories.length)
      || (d.sups && d.sups.length) || (d.cats && d.cats.length)
      || (d.itemOv && Object.keys(d.itemOv).length) || (d.supOv && Object.keys(d.supOv).length)
      || (d.stockOv && Object.keys(d.stockOv).length)
      || (d.delItems && d.delItems.length) || (d.delSups && d.delSups.length)
    );
  }
  function opening(row, d) {
    return d.stockOv[row.id] != null ? +d.stockOv[row.id] || 0 : +row.currentStock || 0;
  }
  function balance(row, d) {
    var L = window.KiwiInventory;
    var initial = opening(row, d);
    if (!L || !L.isReal || !L.isReal()) return initial;
    L.ensureOpening(row.id, initial, { unitCost: +row.costPerUnit || null });
    return L.balance(row.id);
  }
  function materialize() {
    var d = read(); var deleted = new Set(d.delItems || []);
    return (d.items || []).filter(function (row) { return row && row.id && !deleted.has(row.id); })
      .map(function (row) {
        var merged = Object.assign({}, row, d.itemOv[row.id] || {});
        return {
          id: String(merged.id),
          name: String(merged.name || 'Article'),
          cat: String(merged.category || merged.cat || 'epicerie'),
          unit: String(merged.unit || 'unité'),
          supplier: String(merged.supplier || ''),
          stock: balance(merged, d),
          par: Math.max(0, +(merged.parLevel != null ? merged.parLevel : merged.par) || 0),
          reorder: Math.max(0, +(merged.reorderLevel != null ? merged.reorderLevel : merged.reorder) || 0),
          cost: Math.max(0, +(merged.costPerUnit != null ? merged.costPerUnit : merged.cost) || 0),
        };
      });
  }
  function suppliers() {
    var d = read(); var deleted = new Set(d.delSups || []);
    return (d.sups || []).filter(function (row) { return row && row.id && !deleted.has(row.id); })
      .map(function (row) { return Object.assign({}, row, d.supOv[row.id] || {}); });
  }
  function categories() { return (read().cats || []).slice(); }
  function snapshot() {
    var d = read();
    return {
      schemaVersion: d.schemaVersion,
      items: materialize(),
      suppliers: suppliers(),
      categories: categories(),
      subcategories: (d.subcategories || []).slice(),
    };
  }

  function addItem(raw) {
    raw = raw || {}; var d = read(); var now = Date.now();
    var id = String(raw.id || ('usr-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 6)));
    var current = Math.max(0, +raw.stock || 0);
    var row = {
      id: id, name: String(raw.name || 'Article'),
      category: String(raw.cat || raw.category || 'epicerie'), unit: String(raw.unit || 'unité'),
      supplier: String(raw.supplier || ''), currentStock: current,
      parLevel: Math.max(0, +(raw.par != null ? raw.par : raw.parLevel) || 0),
      reorderLevel: Math.max(0, +(raw.reorder != null ? raw.reorder : raw.reorderLevel) || 0),
      costPerUnit: Math.max(0, +(raw.cost != null ? raw.cost : raw.costPerUnit) || 0),
      usageThisWeek: 0, theoreticalUsage: 0, updatedAt: now,
    };
    d.items = (d.items || []).filter(function (it) { return String(it.id) !== id; });
    d.items.push(row);
    var sub = {
      id: id,
      categoryId: String(raw.cat || raw.category || 'epicerie'),
      name: String(raw.name || 'Article'),
      unit: String(raw.unit || 'unité'),
      defaultCost: Math.max(0, +(raw.cost != null ? raw.cost : raw.costPerUnit) || 0),
      suppliers: raw.supplier ? [{
        id: 'sup-card-' + id,
        supplierName: String(raw.supplier),
        defaultPrice: Math.max(0, +(raw.cost != null ? raw.cost : raw.costPerUnit) || 0),
        purchaseUnit: String(raw.unit || 'unité'),
        factor: 1,
        rank: 1,
      }] : [],
      currentStock: current,
      parLevel: Math.max(0, +(raw.par != null ? raw.par : raw.parLevel) || 0),
      reorderLevel: Math.max(0, +(raw.reorder != null ? raw.reorder : raw.reorderLevel) || 0),
      usageThisWeek: 0,
      theoreticalUsage: 0,
      updatedAt: now,
    };
    d.subcategories = (d.subcategories || []).filter(function (s) { return String(s.id) !== id; });
    d.subcategories.push(sub);
    save(d);
    try { window.KiwiInventory && window.KiwiInventory.ensureOpening(id, current, { unitCost: row.costPerUnit || null }); } catch (_) {}
    emit('ledger');
    return id;
  }
  function updateItem(id, patch) {
    id = String(id || ''); if (!id) return false;
    var d = read(); var before = materialize().find(function (it) { return it.id === id; });
    if (!before) return false;
    var ov = Object.assign({}, d.itemOv[id] || {}, { updatedAt: Date.now() });
    if (patch.name != null) ov.name = String(patch.name);
    if (patch.cat != null || patch.category != null) ov.category = String(patch.cat || patch.category);
    if (patch.unit != null) ov.unit = String(patch.unit);
    if (patch.supplier != null) ov.supplier = String(patch.supplier);
    if (patch.par != null || patch.parLevel != null) ov.parLevel = Math.max(0, +(patch.par != null ? patch.par : patch.parLevel) || 0);
    if (patch.reorder != null || patch.reorderLevel != null) ov.reorderLevel = Math.max(0, +(patch.reorder != null ? patch.reorder : patch.reorderLevel) || 0);
    if (patch.cost != null || patch.costPerUnit != null) ov.costPerUnit = Math.max(0, +(patch.cost != null ? patch.cost : patch.costPerUnit) || 0);
    if (patch.suppliers != null && Array.isArray(patch.suppliers)) ov.suppliers = patch.suppliers.slice();
    d.itemOv[id] = ov;
    var sub = (d.subcategories || []).find(function (s) { return s.id === id; });
    if (sub) {
      if (patch.name != null) sub.name = String(patch.name);
      if (patch.cat != null || patch.category != null) sub.categoryId = String(patch.cat || patch.category);
      if (patch.unit != null) sub.unit = String(patch.unit);
      if (patch.cost != null || patch.costPerUnit != null) sub.defaultCost = Math.max(0, +(patch.cost != null ? patch.cost : patch.costPerUnit) || 0);
      if (patch.par != null || patch.parLevel != null) sub.parLevel = Math.max(0, +(patch.par != null ? patch.par : patch.parLevel) || 0);
      if (patch.reorder != null || patch.reorderLevel != null) sub.reorderLevel = Math.max(0, +(patch.reorder != null ? patch.reorder : patch.reorderLevel) || 0);
      if (patch.suppliers != null && Array.isArray(patch.suppliers)) sub.suppliers = patch.suppliers.slice();
      sub.updatedAt = Date.now();
    }
    save(d);
    if (patch.stock != null) count(id, Math.max(0, +patch.stock || 0), 'caisse-edit');
    return true;
  }
  function move(id, qty, reason, refId, unitCost, meta) {
    qty = Math.round((+qty || 0) * 1000) / 1000;
    if (!id || !qty || !window.KiwiInventory) return null;
    var it = materialize().find(function (row) { return row.id === String(id); });
    return window.KiwiInventory.add({
      itemId: String(id), qty: qty, reason: reason || 'manual', refType: reason || 'manual',
      refId: String(refId || ('caisse-' + Date.now().toString(36))),
      note: 'Mouvement saisi depuis la caisse',
      unitCost: unitCost == null ? (it ? it.cost || null : null) : unitCost,
      meta: meta || null,
    });
  }
  function count(id, value, refId) {
    var it = materialize().find(function (row) { return row.id === String(id); });
    if (!it) return 0;
    var diff = Math.round((Math.max(0, +value || 0) - it.stock) * 1000) / 1000;
    if (diff) move(id, diff, 'count', refId || ('caisse-count-' + Date.now().toString(36)));
    return diff;
  }

  function bind() {
    var s = slug();
    if (!s || !window.KiwiCloudDoc) return Promise.resolve(false);
    if (bound === s && doc) return doc.bind();
    bound = s;
    doc = window.KiwiCloudDoc.attach({
      feature: 'stock', slug: slug, read: read,
      write: function (d) { write(d, true); }, merge: merge, isEmpty: empty,
      localKey: key,
    });
    if (!ledgerUnsub && window.KiwiInventory && window.KiwiInventory.subscribe) {
      ledgerUnsub = window.KiwiInventory.subscribe(function () { emit('ledger'); });
    }
    return doc.bind().then(function (changed) {
      var ledger = false;
      try { ledger = window.KiwiInventory && window.KiwiInventory.sync(); } catch (_) {}
      return Promise.resolve(ledger).then(function () { emit('bind'); return changed; });
    });
  }
  window.addEventListener('storage', function (e) {
    if (e.key === key()) emit('storage');
  });
  /* Pairing announces on document (caisse-pairing.js). Rebind immediately so
     a newly paired till cannot stay attached to the empty pre-pair tenant. */
  document.addEventListener('kiwi-paired', function () { bound = ''; doc = null; bind(); });

  function resolveSupplierCard(id, supplierName) {
    id = String(id || ''); if (!id || !supplierName) return null;
    var d = read();
    var sub = (d.subcategories || []).find(function (s) { return s.id === id; });
    var cards = sub && Array.isArray(sub.suppliers) ? sub.suppliers : [];
    var normName = String(supplierName).trim().toLowerCase();
    var card = cards.find(function (c) { return String(c.supplierName || '').trim().toLowerCase() === normName; });
    if (card) return card;
    return {
      id: 'sup-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      supplierName: String(supplierName).trim(),
      defaultPrice: null,
      purchaseUnit: sub ? sub.unit : 'unité',
      factor: 1,
      rank: cards.length + 1,
      isNew: true,
    };
  }

  function updateSupplierPrice(id, supplierName, price) {
    id = String(id || ''); if (!id || !supplierName || !(+price > 0)) return false;
    var d = read();
    var sub = (d.subcategories || []).find(function (s) { return s.id === id; });
    if (!sub) return false;
    var cards = Array.isArray(sub.suppliers) ? sub.suppliers.slice() : [];
    var normName = String(supplierName).trim().toLowerCase();
    var card = cards.find(function (c) { return String(c.supplierName || '').trim().toLowerCase() === normName; });
    if (card) {
      card.defaultPrice = Math.round(+price * 10000) / 10000;
    } else {
      card = {
        id: 'sup-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        supplierName: String(supplierName).trim(),
        defaultPrice: Math.round(+price * 10000) / 10000,
        purchaseUnit: sub.unit || 'unité',
        factor: 1,
        rank: cards.length + 1,
      };
      cards.push(card);
    }
    sub.suppliers = cards;
    sub.updatedAt = Date.now();
    var ov = Object.assign({}, d.itemOv[id] || {}, { updatedAt: Date.now() });
    ov.suppliers = cards;
    d.itemOv[id] = ov;
    save(d);
    return card;
  }

  window.KiwiCaisseStock = {
    bind: bind,
    pull: function () {
      var catalog = doc ? doc.pull(false) : bind();
      var ledger = false;
      try { ledger = window.KiwiInventory && window.KiwiInventory.sync(); } catch (_) {}
      return Promise.all([Promise.resolve(catalog), Promise.resolve(ledger)]).then(function (r) {
        emit('pull'); return !!(r[0] || r[1]);
      });
    },
    snapshot: snapshot, items: materialize, suppliers: suppliers, categories: categories,
    addItem: addItem, updateItem: updateItem, move: move, count: count,
    resolveSupplierCard: resolveSupplierCard, updateSupplierPrice: updateSupplierPrice,
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    slug: slug,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
}());
