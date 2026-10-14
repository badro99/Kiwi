/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/till-frame.js · the till's menu and bill on the kit
 * (spec §10.23, §10.24, §18.3; stage 4). Loaded only when the till's flag is
 * on (kiwiSkin2027:till, or ?skin=2027 for one load); with it off
 * kiwi-caisse.html keeps its shipped grid and panel.
 *
 *   KiwiTillFrame.mount(api)    puts a <k-menu-grid> and a <k-bill> in place
 *     api.menu, api.bill        the host boxes that receive them
 *     api.act(verb, id, value)  every gesture, by the component's verb:
 *                               add | options (menu), step | remove | void |
 *                               send | pay | split | discount | print |
 *                               overflow | edit-options | line-select (bill)
 *   KiwiTillFrame.paint(view)   { sections, bill }: <k-menu-grid>'s and
 *                               <k-bill>'s shapes, either may be left out
 *
 * The host keeps every decision: the cart, the table orders, the kitchen
 * send, the payment. This file only draws what the host already decided and
 * hands each tap back to it by name, as kds-board.js does for the kitchen.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  var CE = root.customElements;
  if (!K || !CE || !CE.get('k-menu-grid') || !CE.get('k-bill')) return;
  var doc = root.document;

  var api = null, grid = null, bill = null;
  var menuSig = '', billSig = '', qtys = {};

  function onAction(e) {
    var d = e.detail || {};
    var m = /^k\.(?:menu-grid|bill)\.(.+)$/.exec(d.action || '');
    if (!m || !api || typeof api.act !== 'function') return;
    api.act(m[1], d.id == null ? null : String(d.id), d.value || {});
  }

  function mount(a) {
    api = a || {};
    if (!api.menu || !api.bill) return false;
    if (!grid) { grid = doc.createElement('k-menu-grid'); grid.addEventListener('kiwi:action', onAction); }
    if (!bill) { bill = doc.createElement('k-bill'); bill.addEventListener('kiwi:action', onAction); }
    api.menu.appendChild(grid);
    api.bill.appendChild(bill);
    return true;
  }

  /* The grid is rebuilt only when its tiles change; a quantity alone moves
     the tile's badge in place, so 200 tiles are not redrawn per tap. */
  function paintMenu(sections) {
    var next = {};
    var bare = sections.map(function (s) {
      return {
        id: s.id, title: s.title,
        items: (s.items || []).map(function (it) {
          next[it.id] = it.qty || 0;
          return { id: it.id, name: it.name, price: it.price, options: !!it.options, soldOut: !!it.soldOut };
        })
      };
    });
    var sig = JSON.stringify(bare);
    if (sig !== menuSig) {
      menuSig = sig;
      grid.sections = sections.map(function (s) { return Object.assign({}, s, { items: (s.items || []).map(function (it) { return Object.assign({}, it); }) }); });
    } else if (typeof grid.setQty === 'function') {
      Object.keys(next).forEach(function (id) { if ((qtys[id] || 0) !== next[id]) grid.setQty(id, next[id]); });
    }
    qtys = next;
  }

  function paint(view) {
    if (!grid || !bill || !view) return;
    if (Array.isArray(view.sections)) paintMenu(view.sections);
    if (view.bill) {
      var sig = JSON.stringify(view.bill);
      if (sig !== billSig) { billSig = sig; bill.bill = Object.assign({}, view.bill); }
    }
  }

  root.KiwiTillFrame = {
    mount: mount, paint: paint,
    grid: function () { return grid; },
    bill: function () { return bill; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
