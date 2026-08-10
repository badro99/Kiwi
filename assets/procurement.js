/* Kiwi Procurement — supplier and purchasing documents linked to the stock
 * movement ledger. Basic keeps suppliers + direct receipts. Ultra adds purchase
 * orders and three-way invoice matching. No document mutates a stock snapshot. */
(function () {
  'use strict';
  if (!window.KiwiStore?.define) return;

  var store = window.KiwiStore.define('procurement', {
    cloud: 'procurement',
    blank: function () { return { suppliers: [], orders: [], receipts: [], invoices: [], seq: 0 }; },
    isEmpty: function (d) { return !d || !(d.suppliers?.length || d.orders?.length || d.receipts?.length || d.invoices?.length); },
    merge: function (mine, theirs) {
      var out = { suppliers: [], orders: [], receipts: [], invoices: [], seq: Math.max(+(mine?.seq || 0), +(theirs?.seq || 0)) };
      ['suppliers', 'orders', 'receipts', 'invoices'].forEach(function (key) {
        var map = new Map();
        (theirs?.[key] || []).concat(mine?.[key] || []).forEach(function (row) {
          if (!row?.id) return; var old = map.get(row.id);
          if (!old || +(row.updatedAt || row.createdAt || 0) >= +(old.updatedAt || old.createdAt || 0)) map.set(row.id, row);
        });
        out[key] = Array.from(map.values()).sort(function (a, b) { return +(b.createdAt || 0) - +(a.createdAt || 0); }).slice(0, 1000);
      });
      return out;
    },
  });

  function ultra() {
    var p = String(window.KiwiVenue?.getPlan?.() || window.KiwiConfig?.plan || '').toLowerCase();
    return p === 'ultra' || p === 'ultimate';
  }
  function id(prefix, seq) { return prefix + '-' + Date.now().toString(36) + '-' + String(seq || 0).padStart(3, '0'); }
  function cleanLine(x) {
    var qty = Math.round(Math.max(0, +(x?.qty || 0)) * 1000) / 1000;
    var cost = Math.round(Math.max(0, +(x?.unitCost || 0)) * 100) / 100;
    return { itemId: String(x?.itemId || '').slice(0, 80), name: String(x?.name || '').slice(0, 120), qty: qty, unit: String(x?.unit || 'unité').slice(0, 24), unitCost: cost };
  }
  function next(prefix) {
    var out = '';
    store.update(function (d) { d.seq = (+d.seq || 0) + 1; out = id(prefix, d.seq); return d; });
    return out;
  }
  function addSupplier(input) {
    input = input || {}; var now = Date.now(); var row;
    store.update(function (d) {
      row = { id: nextId(d, 'sup'), name: String(input.name || '').trim().slice(0, 120), phone: String(input.phone || '').trim().slice(0, 40), email: String(input.email || '').trim().slice(0, 120), leadDays: Math.max(0, Math.round(+input.leadDays || 0)), active: input.active !== false, createdAt: now, updatedAt: now };
      if (!row.name) return d; d.suppliers.unshift(row); return d;
    });
    return row?.name ? row : null;
  }
  function nextId(d, prefix) { d.seq = (+d.seq || 0) + 1; return id(prefix, d.seq); }
  function createOrder(input) {
    if (!ultra()) return { error: 'ultra-required' };
    input = input || {}; var lines = (input.lines || []).map(cleanLine).filter(function (x) { return x.itemId && x.qty > 0; });
    if (!input.supplierId || !lines.length) return { error: 'invalid-order' };
    var row; store.update(function (d) {
      var now = Date.now(); row = { id: nextId(d, 'po'), number: 'BC-' + String(d.seq).padStart(5, '0'), supplierId: String(input.supplierId), status: 'draft', currency: 'MAD', expectedDate: String(input.expectedDate || ''), note: String(input.note || '').slice(0, 500), lines: lines.map(function (x) { return Object.assign({}, x, { receivedQty: 0 }); }), createdAt: now, updatedAt: now };
      d.orders.unshift(row); return d;
    }); return row;
  }
  function markSent(orderId) {
    if (!ultra()) return { error: 'ultra-required' }; var hit = null;
    store.update(function (d) { hit = d.orders.find(function (x) { return x.id === orderId; }); if (hit && hit.status === 'draft') { hit.status = 'sent'; hit.sentAt = Date.now(); hit.updatedAt = hit.sentAt; } return d; });
    return hit;
  }
  function writeReceipt(input, order) {
    var lines = (input.lines || []).map(cleanLine).filter(function (x) { return x.itemId && x.qty > 0; });
    if (!lines.length) return { error: 'invalid-receipt' };
    var row; store.update(function (d) {
      var liveOrder = order?.id ? d.orders.find(function (x) { return x.id === order.id; }) : null;
      var now = Date.now(); row = { id: nextId(d, 'grn'), number: 'BR-' + String(d.seq).padStart(5, '0'), orderId: liveOrder?.id || '', supplierId: String(input.supplierId || liveOrder?.supplierId || ''), externalRef: String(input.externalRef || '').slice(0, 100), lines: lines, receivedAt: +input.receivedAt || now, receivedBy: String(input.receivedBy || '').slice(0, 100), createdAt: now, updatedAt: now };
      d.receipts.unshift(row);
      if (liveOrder) {
        lines.forEach(function (line) { var ol = liveOrder.lines.find(function (x) { return x.itemId === line.itemId; }); if (ol) ol.receivedQty = Math.round(((+ol.receivedQty || 0) + line.qty) * 1000) / 1000; });
        var complete = liveOrder.lines.every(function (x) { return +x.receivedQty >= +x.qty; });
        liveOrder.status = complete ? 'received' : 'partial'; liveOrder.updatedAt = now;
      }
      return d;
    });
    lines.forEach(function (line, idx) {
      window.KiwiInventory?.add?.({ id: `inv-${row.id}-${idx}`, itemId: line.itemId, qty: line.qty, reason: 'receipt', unitCost: line.unitCost || null, refType: 'receipt', refId: row.id, occurredTs: row.receivedAt, note: row.externalRef || row.number });
      if (line.unitCost > 0) window.KiwiCost?.setItemCost?.(line.itemId, line.unitCost, row.supplierId);
    });
    return row;
  }
  function receiveDirect(input) { return writeReceipt(input || {}, null); }
  function receiveOrder(orderId, input) {
    if (!ultra()) return { error: 'ultra-required' };
    var order = store.get().orders.find(function (x) { return x.id === orderId; });
    if (!order || ['cancelled', 'received'].includes(order.status)) return { error: 'invalid-order-state' };
    input = Object.assign({}, input || {}, { supplierId: order.supplierId }); return writeReceipt(input, order);
  }
  function attachInvoice(input) {
    if (!ultra()) return { error: 'ultra-required' };
    input = input || {}; var lines = (input.lines || []).map(cleanLine).filter(function (x) { return x.itemId && x.qty > 0; });
    if (!input.supplierId || !lines.length) return { error: 'invalid-invoice' };
    var row; store.update(function (d) { var now = Date.now(); row = { id: nextId(d, 'inv'), number: String(input.number || ('FA-' + d.seq)).slice(0, 100), supplierId: String(input.supplierId), orderId: String(input.orderId || ''), receiptId: String(input.receiptId || ''), lines: lines, status: 'received', issuedAt: +input.issuedAt || now, createdAt: now, updatedAt: now }; d.invoices.unshift(row); return d; });
    row.match = matchInvoice(row.id); return row;
  }
  function matchInvoice(invoiceId) {
    var d = store.get(); var inv = d.invoices.find(function (x) { return x.id === invoiceId; }); if (!inv) return null;
    var order = d.orders.find(function (x) { return x.id === inv.orderId; });
    var receipt = d.receipts.find(function (x) { return x.id === inv.receiptId; });
    var issues = [];
    inv.lines.forEach(function (ln) {
      var po = order?.lines.find(function (x) { return x.itemId === ln.itemId; });
      var grn = receipt?.lines.find(function (x) { return x.itemId === ln.itemId; });
      if (!po) issues.push({ itemId: ln.itemId, type: 'not-ordered' });
      else if (Math.abs(ln.unitCost - po.unitCost) > 0.01) issues.push({ itemId: ln.itemId, type: 'price', ordered: po.unitCost, invoiced: ln.unitCost });
      if (!grn || Math.abs(ln.qty - grn.qty) > 0.001) issues.push({ itemId: ln.itemId, type: 'quantity', received: grn?.qty || 0, invoiced: ln.qty });
    });
    var result = { ok: !!order && !!receipt && !issues.length, issues: issues, checkedAt: Date.now() };
    store.update(function (x) { var live = x.invoices.find(function (y) { return y.id === invoiceId; }); if (live) { live.match = result; live.status = result.ok ? 'matched' : 'exception'; live.updatedAt = result.checkedAt; } return x; });
    return result;
  }
  function message(orderId) {
    var d = store.get(); var o = d.orders.find(function (x) { return x.id === orderId; }); if (!o) return '';
    var s = d.suppliers.find(function (x) { return x.id === o.supplierId; });
    return [`Bonjour ${s?.name || ''},`, `Commande ${o.number}`, ...o.lines.map(function (x) { return `• ${x.name || x.itemId} — ${x.qty} ${x.unit}`; }), o.expectedDate ? `Livraison souhaitée : ${o.expectedDate}` : '', 'Merci.'].filter(Boolean).join('\n');
  }

  window.KiwiProcurement = { store: store, isUltra: ultra, addSupplier: addSupplier, createOrder: createOrder, markSent: markSent, receiveDirect: receiveDirect, receiveOrder: receiveOrder, attachInvoice: attachInvoice, matchInvoice: matchInvoice, message: message, doc: function () { return store.get(); } };
})();
