/* Kiwi Inventory Ledger — append-only stock truth shared by dashboard/caisse.
 * Quantities are movements, never overwritten snapshots. Local-first writes are
 * queued and replayed idempotently to /api/inventory/movements. */
(function () {
  'use strict';

  var PREFIX = 'kiwi:inventoryLedger:v1:';
  var subs = new Set();
  var syncing = false;

  function real() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!paired(); }
    catch (_) { return !!paired(); }
  }
  function paired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function merchant() {
    var p = paired();
    if (p && p.merchant) return String(p.merchant).slice(0, 64);
    try {
      if (window.KiwiStore && window.KiwiStore.slugFor) {
        var s = window.KiwiStore.slugFor(); if (s) return String(s).slice(0, 64);
      }
    } catch (_) {}
    try {
      if (window.KiwiLive && window.KiwiLive.merchant) {
        var m = window.KiwiLive.merchant(); if (m) return String(m).slice(0, 64);
      }
    } catch (_) {}
    return '';
  }
  function key() { return PREFIX + merchant(); }
  function blank() { return { cursor: 0, base: {}, rows: [], queued: [] }; }
  function read() {
    if (!real() || !merchant()) return blank();
    try {
      var d = JSON.parse(localStorage.getItem(key()) || 'null');
      if (!d || typeof d !== 'object') return blank();
      d.base = d.base && typeof d.base === 'object' ? d.base : {};
      d.rows = Array.isArray(d.rows) ? d.rows : [];
      d.queued = Array.isArray(d.queued) ? d.queued : [];
      d.cursor = Math.max(0, +d.cursor || 0);
      return d;
    } catch (_) { return blank(); }
  }
  function balanceKey(r) { return [r.itemId || '', r.variantId || '', r.locationId || 'principal'].join('|'); }
  function compact(d) {
    if (d.rows.length <= 6000) return d;
    var keep = d.rows.slice(-4000);
    var kept = new Set(keep.map(function (r) { return r.id; }));
    d.rows.forEach(function (r) {
      if (kept.has(r.id) || !(+r.cursor > 0)) return;
      var k = balanceKey(r);
      d.base[k] = Math.round(((+d.base[k] || 0) + (+r.qty || 0)) * 1000) / 1000;
    });
    d.rows = keep;
    return d;
  }
  function write(d) {
    try { localStorage.setItem(key(), JSON.stringify(compact(d))); } catch (_) {}
    subs.forEach(function (fn) { try { fn(); } catch (_) {} });
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function uuid() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function clean(raw) {
    raw = raw || {};
    var qty = Math.round((+raw.qty || 0) * 1000) / 1000;
    return {
      id: String(raw.id || ('inv-' + uuid())).slice(0, 80),
      itemId: String(raw.itemId || '').slice(0, 80),
      variantId: String(raw.variantId || '').slice(0, 80),
      locationId: String(raw.locationId || 'principal').slice(0, 80),
      qty: qty, reason: String(raw.reason || 'manual').slice(0, 32),
      unitCost: raw.unitCost == null || !Number.isFinite(+raw.unitCost) ? null : Math.max(0, Math.round(+raw.unitCost * 100) / 100),
      currency: String(raw.currency || 'MAD').slice(0, 3),
      refType: String(raw.refType || 'manual').slice(0, 32),
      refId: String(raw.refId || '').slice(0, 100),
      note: String(raw.note || '').slice(0, 500), actor: String(raw.actor || '').slice(0, 100),
      occurredTs: Math.max(1, Math.round(+raw.occurredTs || Date.now())),
      reversalOf: String(raw.reversalOf || '').slice(0, 80),
      meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : null,
      cursor: Math.max(0, +raw.cursor || 0),
    };
  }
  function add(raw) {
    if (!real() || !merchant()) return null;
    var m = clean(raw);
    if (!m.itemId || !m.qty) return null;
    var d = read();
    if (d.rows.some(function (r) { return r.id === m.id; })) return m;
    d.rows.push(m); d.queued.push(m.id); write(d);
    setTimeout(sync, 0);
    return m;
  }
  function ensureOpening(itemId, qty, opts) {
    opts = opts || {};
    qty = Math.round((+qty || 0) * 1000) / 1000;
    if (!itemId || !qty) return null;
    var seed = [merchant(), itemId, opts.variantId || '', opts.locationId || 'principal'].join('|');
    return add({
      id: 'inv-open-' + hash(seed), itemId: itemId, variantId: opts.variantId,
      locationId: opts.locationId, qty: qty, reason: 'opening', unitCost: opts.unitCost,
      refType: 'opening', refId: itemId, note: opts.note || 'Solde initial migré',
    });
  }
  function snapshot() {
    var d = read(); var out = Object.assign({}, d.base);
    d.rows.forEach(function (r) {
      var k = balanceKey(r); out[k] = Math.round(((+out[k] || 0) + (+r.qty || 0)) * 1000) / 1000;
    });
    return out;
  }
  function balance(itemId, opts) {
    opts = opts || {}; var snap = snapshot(); var total = 0;
    Object.keys(snap).forEach(function (k) {
      var p = k.split('|');
      if (p[0] !== String(itemId)) return;
      if (opts.variantId != null && p[1] !== String(opts.variantId)) return;
      if (opts.locationId != null && p[2] !== String(opts.locationId)) return;
      total += +snap[k] || 0;
    });
    return Math.round(total * 1000) / 1000;
  }
  function history(itemId) {
    return read().rows.filter(function (r) { return !itemId || r.itemId === itemId; })
      .sort(function (a, b) { return b.occurredTs - a.occurredTs; });
  }
  async function push(d, m) {
    var ids = d.queued.slice(0, 200);
    if (!ids.length) return d;
    var set = new Set(ids);
    var movements = d.rows.filter(function (r) { return set.has(r.id); });
    if (!movements.length) { d.queued = d.queued.filter(function (id) { return !set.has(id); }); return d; }
    var res = await fetch('/api/inventory/movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ merchant: m, movements: movements }),
    });
    if (!res.ok) throw new Error('inventory-push-' + res.status);
    var body = await res.json();
    var cursors = new Map((body.accepted || []).map(function (x) { return [x.id, +x.cursor || 0]; }));
    d.rows.forEach(function (r) { if (cursors.has(r.id)) r.cursor = cursors.get(r.id); });
    d.queued = d.queued.filter(function (id) { return !cursors.has(id); });
    return d;
  }
  async function pull(d, m) {
    do {
      var res = await fetch('/api/inventory/movements?merchant=' + encodeURIComponent(m) + '&since=' + encodeURIComponent(d.cursor), { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('inventory-pull-' + res.status);
      var body = await res.json(); var byId = new Map(d.rows.map(function (r) { return [r.id, r]; }));
      (body.movements || []).forEach(function (raw) {
        var r = clean(raw); r.cursor = +raw.cursor || 0;
        if (!byId.has(r.id)) { d.rows.push(r); byId.set(r.id, r); }
        else if (r.cursor) byId.get(r.id).cursor = r.cursor;
      });
      d.cursor = Math.max(d.cursor, +body.cursor || 0);
      if (!body.more) break;
    } while (true);
    return d;
  }
  async function sync() {
    var online = typeof navigator === 'undefined' || navigator.onLine !== false;
    var m = merchant(); if (syncing || !real() || !m || !online) return false;
    syncing = true;
    try { var d = read(); d = await push(d, m); d = await pull(d, m); write(d); return true; }
    catch (_) { return false; }
    finally { syncing = false; }
  }
  function reverse(movement, reason, note, opts) {
    if (!movement || !movement.id || !movement.qty) return null;
    opts = opts || {};
    return add({
      id: opts.id,
      itemId: movement.itemId, variantId: movement.variantId, locationId: movement.locationId,
      qty: -movement.qty, reason: reason || 'manual', unitCost: movement.unitCost,
      refType: movement.refType, refId: movement.refId, note: note || 'Contre-mouvement',
      reversalOf: movement.id,
    });
  }

  window.addEventListener('online', sync);
  window.addEventListener('focus', sync);
  window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf(PREFIX) === 0) subs.forEach(function (fn) { try { fn(); } catch (_) {} }); });
  setInterval(sync, 20000);
  setTimeout(sync, 1200);

  window.KiwiInventory = {
    isReal: real, merchant: merchant, add: add, reverse: reverse,
    ensureOpening: ensureOpening, balance: balance, snapshot: snapshot, history: history,
    sync: sync, pending: function () { return read().queued.length; },
    subscribe: function (fn) { subs.add(fn); return function () { subs.delete(fn); }; },
  };
}());
