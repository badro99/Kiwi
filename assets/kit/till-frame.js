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
 *   KiwiTillFrame.openPane(kind, props) / closePane(kind)   <k-split> or
 *                               <k-discount> pushed over the bill (§10.30,
 *                               §10.31); their gestures reach api.act as
 *                               split.<verb> | discount.<verb>
 *   KiwiTillFrame.busy()        true while any pane is out
 *   api.rail (mount) + view.rail (paint) {value, items, footer, label}: the
 *                               <k-rail>; its taps reach api.act as
 *                               rail.select | rail.cashier | rail.sync
 *   KiwiTillFrame.openMore(sections, heading)   the More sheet; a row reaches
 *                               api.act as more.select with its id
 *   api.tabbar (mount)          the phone's <k-tabbar> (§10.20, §13.3): below
 *                               768 wide it takes the rail's place, painted
 *                               from the same view.rail items, and its taps
 *                               reach api.act as rail.select, so the host
 *                               keeps every decision. html[data-k-tabs] is set
 *                               while it shows; the sync state rides on More as
 *                               a dot (view.rail.footer.sync, §10.26 item 3)
 *   KiwiTillFrame.capsule()     true while the tab bar is the navigation
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

  /* Which hand moves focus in the till: a tap or click sets "pointer", a
     navigation key (Tab, arrows, Home, End, Page) sets "key", and kit.css
     draws the focus ring only for the keyboard. Chrome lights :focus-visible
     on a clicked tile at the next key of any kind, so Shift, a Cmd shortcut,
     a screenshot or a scanner's Enter ringed the last dish tapped (owner,
     26 Oct 2026). Before the first input nothing is set and rings draw. */
  (function () {
    var NAV = /^(Tab|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/;
    function set(v) { if (doc.documentElement.getAttribute('data-k-nav') !== v) doc.documentElement.setAttribute('data-k-nav', v); }
    doc.addEventListener('pointerdown', function () { set('pointer'); }, true);
    doc.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || !NAV.test(e.key)) return;
      set('key');
    }, true);
  })();

  var api = null, grid = null, bill = null, pay = null, rail = null, more = null, tabs = null, railValue = '';
  var railSig = '', tabsSig = '';
  /* The panes that push over the bill (§18.3, §10.30, §10.31): one at a time. */
  var panes = {};
  var menuSig = '', billSig = '', qtys = {};

  function onAction(e) {
    var d = e.detail || {};
    var m = /^k\.(menu-grid|bill|pay|split|discount|rail|tabbar)\.(.+)$/.exec(d.action || '');
    if (!m || !api || typeof api.act !== 'function') return;
    /* The tab bar is the rail on a phone: the same verbs, the same host path. */
    var pre = (m[1] === 'menu-grid' || m[1] === 'bill') ? '' : m[1] === 'tabbar' ? 'rail.' : m[1] + '.';
    api.act(pre + m[2], d.id == null ? null : String(d.id), d.value || {});
  }

  function mount(a) {
    api = a || {};
    if (!api.menu || !api.bill) return false;
    if (!grid) { grid = doc.createElement('k-menu-grid'); grid.addEventListener('kiwi:action', onAction); }
    if (!bill) { bill = doc.createElement('k-bill'); bill.addEventListener('kiwi:action', onAction); }
    ['pay', 'split', 'discount'].forEach(function (k) {
      if (panes[k] || !CE.get('k-' + k)) return;
      var el = panes[k] = doc.createElement('k-' + k);
      el.hidden = true;
      el.addEventListener('kiwi:action', onAction);
    });
    pay = panes.pay;
    /* The rail (§10.20, §18.3), when the host gives it a box. */
    if (api.rail && !rail && CE.get('k-rail')) { rail = doc.createElement('k-rail'); rail.addEventListener('kiwi:action', onAction); }
    if (rail) api.rail.appendChild(rail);
    /* The phone's tab bar (§10.20, §13.3), when the host gives it a box. */
    /* A trade that mounts the frame with its own boxes (pos-dispatch) and no
       tab-bar box keeps its own navigation: the capsule is not its. */
    if (api.tabbar && !tabs && CE.get('k-tabbar')) { tabs = doc.createElement('k-tabbar'); tabs.addEventListener('kiwi:action', onAction); }
    tabsHost = !!(tabs && api.tabbar);
    if (tabsHost) api.tabbar.appendChild(tabs);
    if (tabs) watchCapsule();
    api.menu.appendChild(grid);
    api.bill.appendChild(bill);
    Object.keys(panes).forEach(function (k) { api.bill.appendChild(panes[k]); });
    return true;
  }

  /* Split and Discount push inside the pane as the payment does; the bill
     waits under them. props are the component's own (bill, paidShares,
     policy). */
  function openPane(kind, props) {
    var el = panes[kind];
    if (!el) return null;
    Object.keys(panes).forEach(function (k) { if (k !== kind && k !== 'pay') panes[k].hidden = true; });
    Object.keys(props || {}).forEach(function (p) { el[p] = props[p]; });
    el.hidden = false;
    bill.hidden = true;
    api.bill.setAttribute('data-paying', '');
    return el;
  }
  function closePane(kind) {
    var el = panes[kind];
    if (!el || el.hidden) return;
    el.hidden = true;
    if (Object.keys(panes).every(function (k) { return panes[k].hidden; })) {
      bill.hidden = false;
      api.bill.removeAttribute('data-paying');
    }
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

  /* Below 768 the navigation is the tab capsule (§13.3, layout.js
     tillLayout): a matchMedia listener, no layout read. A phone held sideways
     is still a phone: 844 x 390 kept the rail, which showed four of its six
     places above the bill bar (2026-10-25). The landscape line is the one the
     rest of the till calls a phone (clients-book.js PHONE_Q, pos-mobile.css). */
  var capsuleMq = null, tabsHost = false, setCapsule = null;
  function capsuleOn() { return !!(tabs && tabsHost && capsuleMq && capsuleMq.matches); }
  function watchCapsule() {
    if (setCapsule) { setCapsule(); return; }
    if (!root.matchMedia) return;
    var md = root.KiwiLayout && root.KiwiLayout.BREAKS ? root.KiwiLayout.BREAKS.md : 768;
    capsuleMq = root.matchMedia('(max-width:' + (md - 0.02) + 'px), (orientation: landscape) and (max-width: 1024px) and (max-height: 600px)');
    var set = setCapsule = function () {
      if (capsuleOn()) doc.documentElement.setAttribute('data-k-tabs', ''); else doc.documentElement.removeAttribute('data-k-tabs');
    };
    set();
    if (capsuleMq.addEventListener) capsuleMq.addEventListener('change', set); else if (capsuleMq.addListener) capsuleMq.addListener(set);
  }

  /* The tab bar carries the rail's items as they are (badges, accessible
     names); the rail's footer has no room there, so the sync state becomes a
     dot on More, its words in More's accessible name (§10.26 item 3). The
     cashier lives in More on a phone. */
  function paintTabs(r) {
    var sync = (r.footer || {}).sync;
    var items = (r.items || []).map(function (it) {
      var o = Object.assign({}, it);
      if (o.id === 'more' && sync) {
        o.dot = sync.tone === 'danger' || sync.tone === 'warning' ? sync.tone : 'neutral';
        if (sync.a11y) o.a11y = sync.a11y;
      }
      return o;
    });
    var sig = JSON.stringify([r.value, r.label, items]);
    /* A tap moves the bar's own value before the host answers; More is not a
       destination, so the lens goes back to the page the host says is open. */
    if (sig === tabsSig) { if (tabs.getAttribute('value') !== (r.value || '')) tabs.setAttribute('value', r.value || ''); return; }
    tabsSig = sig;
    if (r.label) tabs.setAttribute('label', r.label);
    tabs.items = items;
    tabs.setAttribute('value', r.value || '');
  }

  function paint(view) {
    if (!grid || !bill || !view) return;
    if (view.rail && tabs) paintTabs(view.rail);
    if (view.rail && rail) {
      var rs = JSON.stringify(view.rail);
      if (rs !== railSig) {
        railSig = rs;
        if (view.rail.label) rail.setAttribute('label', view.rail.label);
        rail.items = view.rail.items.map(function (it) { return Object.assign({}, it); });
        rail.footer = Object.assign({}, view.rail.footer || {});
        rail.setAttribute('value', view.rail.value || '');
      } else if (rail.getAttribute('value') !== (view.rail.value || '')) rail.setAttribute('value', view.rail.value || '');
      railValue = view.rail.value || '';
    }
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
    Object.keys(panes).forEach(function (k) { if (k !== 'pay') panes[k].hidden = true; });
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
  /* The compact layer sizes its keys column to the bill PANE beside the menu.
     Up to 900 wide (and on a short landscape screen) the shipped skin keeps
     the bill a full-width sheet instead, so the keys took the whole width and
     the summary column (amount, tip, methods) shrank to nothing: a blank
     payment on an iPad held upright in Safari, 768 x 954 (2026-10-25). While
     the bill is a sheet, the payment stays in it, as on the phone. */
  function billIsSheet() {
    var panel = api.bill && api.bill.closest ? api.bill.closest('.rightpanel') : null;
    return !!panel && root.getComputedStyle(panel).position === 'fixed';
  }
  function place() {
    var L = root.KiwiLayout;
    /* The phone (§13.2): the bill is a sheet, not a side pane, so the payment
       stays in it, under its own header, and the sheet scrolls if it must. */
    var f = (pay && !pay.hidden && !capsuleOn() && !billIsSheet() && L && L.paymentForm) ? L.paymentForm(root.innerHeight) : { form: 'regular' };
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

  /* More (§18.3): a sheet of sections, each a <k-list> of rows the host
     chose; a row reaches api.act as more.select with its id. */
  function openMore(sections, heading) {
    if (!CE.get('k-sheet') || !CE.get('k-list')) return false;
    if (!more) {
      more = doc.createElement('k-sheet');
      more.setAttribute('detent', 'large');
      more.addEventListener('kiwi:action', function (e) {
        var d = e.detail || {};
        if (d.action === 'k.sheet.close') { more.removeAttribute('open'); return; }
        if (d.action !== 'k.list.select') return;
        e.stopPropagation();
        more.removeAttribute('open');
        if (api && typeof api.act === 'function') api.act('more.select', d.id == null ? null : String(d.id), {});
      });
      doc.body.appendChild(more);
      /* More is not a destination: however the sheet closes (a row, the close
         button, Escape, the scrim), the rail's lens goes back to the mode it
         left. It stayed on More after Escape (owner, 2026-10-24). */
      new MutationObserver(function () {
        if (more.hasAttribute('open') || !rail) return;
        rail.setAttribute('value', railValue);
      }).observe(more, { attributes: true, attributeFilter: ['open'] });
    }
    more.setAttribute('heading', heading || '');
    more.textContent = '';
    (sections || []).forEach(function (sec) {
      if (!sec.rows || !sec.rows.length) return;
      var h = doc.createElement('p');
      h.className = 'k-foot k-ink2';
      h.style.cssText = 'margin:16px 0 4px;font-weight:var(--k-fw-footnote-strong)';
      h.textContent = sec.title || '';
      var list = doc.createElement('k-list');
      list.rows = sec.rows.map(function (r) {
        var row = { id: r.id, title: r.title, trailing: 'chevron' };
        if (r.icon) row.icon = r.icon;
        if (r.subtitle) row.subtitle = r.subtitle;
        return row;
      });
      /* A section without a title (the phone's sync row) draws no heading. */
      if (sec.title) more.appendChild(h);
      more.appendChild(list);
    });
    more.setAttribute('open', '');
    return true;
  }

  root.KiwiTillFrame = {
    openMore: openMore,
    rail: function () { return rail; },
    tabs: function () { return tabs; },
    capsule: capsuleOn,
    mount: mount, paint: paint, openPay: openPay, closePay: closePay, openPane: openPane, closePane: closePane,
    paying: function () { return !!(pay && !pay.hidden); },
    /* any pane out over the bill: the menu and the bill take no gesture */
    busy: function () { return Object.keys(panes).some(function (k) { return !panes[k].hidden; }); },
    pane: function (k) { return panes[k] || null; },
    grid: function () { return grid; },
    bill: function () { return bill; },
    pay: function () { return pay; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
