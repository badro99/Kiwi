/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/till-frame.js · the till's menu and bill on the kit
 * (spec §10.23, §10.24, §10.25, §10.26, §18.3; stage 4). Loaded only when the
 * till's flag is on (kiwiSkin2027:till, or ?skin=2027 for one load); with it
 * off kiwi-caisse.html keeps its shipped grid and panel.
 *
 *   KiwiTillFrame.mount(api)    puts a <k-menu-grid>, a <k-bill> and a hidden
 *                               <k-pay> in place
 *     api.menu, api.bill        the host boxes that receive them
 *     api.menuPane              the menu pane, whose start the compact
 *                               payment begins at (§18.3)
 *     api.act(verb, id, value)  every gesture, by the component's verb:
 *                               add | options (menu), step | remove | void |
 *                               send | pay | split | discount | print |
 *                               overflow | edit-options | line-select (bill),
 *                               pay.method | pay.quick | pay.tip |
 *                               pay.tip-open | pay.confirm | pay.back |
 *                               pay.leave (pay)
 *   KiwiTillFrame.paint(view)   { sections, bill }: <k-menu-grid>'s and
 *                               <k-bill>'s shapes, either may be left out
 *   KiwiTillFrame.openPay(pay)  pushes the <k-pay> inside the bill pane over
 *                               the bill (§18.3); pay is its .pay shape
 *   KiwiTillFrame.closePay()    back to the bill, as it was
 *   KiwiTillFrame.paying()      true while the pay pane is out
 *
 * The host keeps every decision: the cart, the table orders, the kitchen
 * send, the payment and its record. This file only draws what the host
 * already decided and hands each tap back to it by name, as kds-board.js does
 * for the kitchen.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  var CE = root.customElements;
  if (!K || !CE || !CE.get('k-menu-grid') || !CE.get('k-bill') || !CE.get('k-pay')) return;
  var doc = root.document;

  var api = null, grid = null, bill = null, pay = null;
  var menuSig = '', billSig = '', qtys = {};

  function onAction(e) {
    var d = e.detail || {};
    var m = /^k\.(menu-grid|bill|pay)\.(.+)$/.exec(d.action || '');
    if (!m || !api || typeof api.act !== 'function') return;
    api.act((m[1] === 'pay' ? 'pay.' : '') + m[2], d.id == null ? null : String(d.id), d.value || {});
  }

  function mount(a) {
    api = a || {};
    if (!api.menu || !api.bill) return false;
    if (!grid) { grid = doc.createElement('k-menu-grid'); grid.addEventListener('kiwi:action', onAction); }
    if (!bill) { bill = doc.createElement('k-bill'); bill.addEventListener('kiwi:action', onAction); }
    if (!pay) { pay = doc.createElement('k-pay'); pay.hidden = true; pay.addEventListener('kiwi:action', onAction); }
    api.menu.appendChild(grid);
    api.bill.appendChild(bill);
    api.bill.appendChild(pay);
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

  /* The payment pushes inside the pane (§18.3, --k-dur-5); the bill waits
     under it and comes back as it was. */
  function openPay(p) {
    if (!pay) return;
    pay.removeAttribute('state');
    pay.pay = Object.assign({}, p);
    pay.hidden = false;
    bill.hidden = true;
    api.bill.setAttribute('data-paying', '');
    place();
  }
  function closePay() {
    if (!pay || pay.hidden) return;
    pay.hidden = true;
    bill.hidden = false;
    api.bill.removeAttribute('data-paying');
    place();
  }

  /* §18.3 height forms, from the viewport height alone (layout.js), never by
     scrolling. Regular: <k-pay> stays in the bill pane. Compact and
     compact-short: it moves to a layer over the menu pane and the bill pane
     (the menu cannot be used while a bill is paid), summary over the menu,
     keys in the bill pane's width. Below 514 the page keeps min-height 514
     and the window scrolls as a whole, the keypad column never. */
  var layer = null, html = doc.documentElement;
  function place() {
    var L = root.KiwiLayout;
    var f = (pay && !pay.hidden && L && L.paymentForm) ? L.paymentForm(root.innerHeight) : { form: 'regular' };
    if (f.form === 'regular') {
      if (pay && pay.parentNode !== api.bill) api.bill.appendChild(pay);
      if (pay) pay.removeAttribute('layout');
      if (layer) layer.hidden = true;
      html.removeAttribute('data-k-pay');
      html.removeAttribute('data-k-pay-scroll');
      return;
    }
    if (!layer) { layer = doc.createElement('div'); layer.id = 'kit-pay-layer'; doc.body.appendChild(layer); }
    var pane = api.menuPane ? api.menuPane.getBoundingClientRect() : null;
    var rtl = root.getComputedStyle(html).direction === 'rtl';
    var start = pane ? (rtl ? root.innerWidth - pane.right : pane.left) : 0;
    layer.style.setProperty('--k-pay-start', Math.max(0, Math.round(start)) + 'px');
    layer.style.setProperty('--k-pay-keys', Math.round(api.bill.getBoundingClientRect().width || 432) + 'px');
    if (pay.parentNode !== layer) layer.appendChild(pay);
    pay.setAttribute('layout', f.form);
    layer.hidden = false;
    html.setAttribute('data-k-pay', f.form);
    if (f.scrollsPage) html.setAttribute('data-k-pay-scroll', ''); else html.removeAttribute('data-k-pay-scroll');
  }
  root.addEventListener('resize', function () { if (pay && !pay.hidden) place(); });

  root.KiwiTillFrame = {
    mount: mount, paint: paint, openPay: openPay, closePay: closePay,
    paying: function () { return !!(pay && !pay.hidden); },
    grid: function () { return grid; },
    bill: function () { return bill; },
    pay: function () { return pay; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
