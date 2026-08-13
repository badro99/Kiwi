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
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return p && p.merchant ? String(p.merchant).slice(0, 64) : '';
    } catch (_) { return ''; }
  }
  function key() { return PREFIX + slug(); }
  function blank() {
    return { items: [], sups: [], cats: [], itemOv: {}, supOv: {}, stockOv: {}, delItems: [], delSups: [] };
  }
  function read() {
    if (!slug()) return blank();
    try {
      var d = JSON.parse(localStorage.getItem(key()) || 'null');
      if (!d || typeof d !== 'object') return blank();
      return Object.assign(blank(), d, {
        items: Array.isArray(d.items) ? d.items : [],
        sups: Array.isArray(d.sups) ? d.sups : [],
        cats: Array.isArray(d.cats) ? d.cats : [],
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
  function save(d) {
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
    mine = Object.assign(blank(), mine || {});
    theirs = Object.assign(blank(), theirs || {});
    var M = window.KiwiCloudDoc && window.KiwiCloudDoc.mergeDefault;
    var out = M ? M(mine, theirs) : Object.assign({}, theirs, mine);
    out.items = mergeRows(mine.items, theirs.items);
    out.sups = mergeRows(mine.sups, theirs.sups);
    out.cats = mergeRows(mine.cats, theirs.cats);
    out.itemOv = mergeMap(mine.itemOv, theirs.itemOv);
    out.supOv = mergeMap(mine.supOv, theirs.supOv);
    out.delItems = Array.from(new Set([].concat(mine.delItems || [], theirs.delItems || [])));
    out.delSups = Array.from(new Set([].concat(mine.delSups || [], theirs.delSups || [])));
    return out;
  }
  function empty(d) {
    return !d || !(
      (d.items && d.items.length) || (d.sups && d.sups.length) || (d.cats && d.cats.length)
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
  function snapshot() { return { items: materialize(), suppliers: suppliers(), categories: categories() }; }

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
    d.items.push(row); save(d);
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
    d.itemOv[id] = ov; save(d);
    if (patch.stock != null) count(id, Math.max(0, +patch.stock || 0), 'caisse-edit');
    return true;
  }
  function move(id, qty, reason, refId, unitCost) {
    qty = Math.round((+qty || 0) * 1000) / 1000;
    if (!id || !qty || !window.KiwiInventory) return null;
    var it = materialize().find(function (row) { return row.id === String(id); });
    return window.KiwiInventory.add({
      itemId: String(id), qty: qty, reason: reason || 'manual', refType: reason || 'manual',
      refId: String(refId || ('caisse-' + Date.now().toString(36))),
      note: 'Mouvement saisi depuis la caisse',
      unitCost: unitCost == null ? (it ? it.cost || null : null) : unitCost,
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
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    slug: slug,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
}());
