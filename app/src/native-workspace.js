/* Kiwi Pro · espaces de travail. La caisse (plan de salle, addition,
 * iPad), et les espaces Équipe, Cuisine et propriétaire hébergés par la coque.
 * Partie du runtime natif (native-runtime.js). */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var root = N.root, nativeHostPost = N.nativeHostPost, khPlay = N.khPlay,
      hapticLight = N.hapticLight, hapticFailed = N.hapticFailed,
      nativeBlockingLayer = N.nativeBlockingLayer, nativeWorkspaceAction = N.nativeWorkspaceAction,
      mountNativeAccountGroup = N.mountNativeAccountGroup, nativeMenuButton = N.nativeMenuButton,
      nativeSideMenu = N.nativeSideMenu, followSystemTheme = N.followSystemTheme,
      initNativeOwnerKeypad = N.initNativeOwnerKeypad, initNativeEntry = N.initNativeEntry,
      initNativeOwnerUx = N.initNativeOwnerUx;
  /* A métier register (boutique, maison, pressing, pharmacy…) is painted over
     the restaurant till, which stays mounted underneath with data-mode="salle".
     The host capsule is built from that hidden till, so it kept offering Floor,
     Takeaway and Waiting on top of a clothes shop and covered the register's
     own bottom rows (tickets #0137, #0138). The register owns the whole screen;
     its own menu is the way out. */
  function nativeRegisterOpen() {
    return !!(document.body && document.body.classList.contains('is-pos'));
  }
  /* iPad portrait (and a wide Split View pane): too wide for the phone's bill
     sheet, too narrow for the desktop's three columns. The bill docks beside
     the menu, like the desktop till, and the drawer stays off-canvas. */
  function nativeDockedTill() {
    if (!document.body || !document.body.classList.contains('kiwi-native-till') || nativeRegisterOpen()) return false;
    var width = window.innerWidth, height = window.innerHeight;
    return width >= 700 && width <= 900 && height >= 700;
  }

  function nativeTillCopy() {
    var lang = String(root.lang || 'fr').toLowerCase();
    if (lang.indexOf('ar') === 0) return { label: 'التنقل الرئيسي', salle: 'الصالة', vrap: 'طلبات خارجية', waitlist: 'الانتظار', more: 'المزيد', card: 'بطاقة', actions: 'إجراءات أخرى', less: 'إخفاء الإجراءات', close: 'طي الفاتورة', view: 'عرض الفاتورة' };
    if (lang.indexOf('en') === 0) return { label: 'Primary navigation', salle: 'Floor', vrap: 'Takeaway', waitlist: 'Waiting', more: 'More', card: 'Card', actions: 'More actions', less: 'Hide actions', close: 'Collapse bill', view: 'View bill' };
    return { label: 'Navigation principale', salle: 'Salle', vrap: 'À emporter', waitlist: 'Attente', more: 'Plus', card: 'Carte', actions: 'Autres actions', less: 'Masquer les actions', close: 'Replier l’addition', view: 'Voir la note' };
  }


  /* Phones get the floor as a list first. The plan is held at 640px on purpose
     (caisse-skin.css: squeezing it puts the server chip on the table number), so
     on a 390px screen a third of the room sat off-screen with nothing saying it
     pans. Each row taps the real table node, so the till's own flow runs. */
  function initNativeFloorList() {
    var view = document.querySelector('.view-salle');
    if (!view || view.querySelector('.kiwi-native-floor')) return;
    var lang = String(root.lang || 'fr').slice(0, 2);
    var words = lang === 'en' ? { list: 'List', map: 'Map', view: 'Floor view', empty: 'No tables on this floor.' }
      : lang === 'ar' ? { list: 'قائمة', map: 'المخطط', view: 'عرض القاعة', empty: 'لا توجد طاولات في هذا الطابق.' }
      : { list: 'Liste', map: 'Plan', view: 'Affichage de la salle', empty: 'Aucune table à cet étage.' };
    var STATUS = { 'khawya': ['Libre', 'st-khawya'], 'a-commander': ['À commander', 'st-acmd'], 'ka-yaklo': ['En cours', 'st-yaklo'], 'bgha-ykhlass': ['Addition', 'st-bill'], 'khlass': ['Réglée', 'st-khlass'] };
    var tr = function (fr) { try { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(fr) : fr; } catch (_) { return fr; } };
    var box = document.createElement('div');
    box.className = 'kiwi-native-floor';
    box.innerHTML = '<div class="kiwi-native-floor-switch" role="tablist"><button type="button" role="tab" data-floor-view="list"></button><button type="button" role="tab" data-floor-view="map"></button></div><div class="kiwi-native-table-list" role="list"></div>';
    box.setAttribute('data-nolang', '');
    box.firstChild.setAttribute('aria-label', words.view);
    box.querySelector('[data-floor-view="list"]').textContent = words.list;
    box.querySelector('[data-floor-view="map"]').textContent = words.map;
    var anchor = view.querySelector('.legend');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor); else view.insertBefore(box, view.firstChild);
    var list = box.querySelector('.kiwi-native-table-list');
    var mode = 'list';
    try { mode = localStorage.getItem('kiwiNativeFloorView') === 'map' ? 'map' : 'list'; } catch (_) {}
    function tablesOnFloor() {
      return Array.prototype.filter.call(view.querySelectorAll('.cplan-tbl[data-table]'), function (node) {
        var canvas = node.closest('.plan-canvas');
        if (canvas && !canvas.classList.contains('is-active')) return false;
        var real = node.closest('.plan-real');
        return !(real && real.hidden);
      });
    }
    function paint() {
      var rows = tablesOnFloor().map(function (node) {
        var status = STATUS[node.getAttribute('data-status')] || STATUS.khawya;
        var parts = String(node.getAttribute('aria-label') || '').split(', ');
        var server = node.querySelector('.tbl-server, .cplan-server');
        return '<button type="button" role="listitem" class="kiwi-native-table-row" data-row-table="' + String(node.getAttribute('data-table')).replace(/"/g, '') + '">' +
          '<span class="kiwi-native-table-id"></span><span class="legend-swatch ' + status[1] + '" aria-hidden="true"></span>' +
          '<span class="kiwi-native-table-status"></span><span class="kiwi-native-table-covers"></span>' +
          (server && server.textContent.trim() ? '<span class="kiwi-native-table-server"></span>' : '') + '</button>';
      });
      list.innerHTML = rows.length ? rows.join('') : '<p class="kiwi-native-table-empty"></p>';
      var empty = list.querySelector('.kiwi-native-table-empty'); if (empty) empty.textContent = words.empty;
      tablesOnFloor().forEach(function (node, index) {
        var row = list.children[index]; if (!row) return;
        var status = STATUS[node.getAttribute('data-status')] || STATUS.khawya;
        var parts = String(node.getAttribute('aria-label') || '').split(', ');
        row.querySelector('.kiwi-native-table-id').textContent = node.getAttribute('data-table');
        row.querySelector('.kiwi-native-table-status').textContent = tr(status[0]);
        row.querySelector('.kiwi-native-table-covers').textContent = parts[2] ? tr(parts[2]) : '';
        var server = node.querySelector('.tbl-server, .cplan-server'), chip = row.querySelector('.kiwi-native-table-server');
        if (chip && server) chip.textContent = server.textContent.trim();
        row.setAttribute('aria-label', (node.getAttribute('data-table') || '') + ', ' + tr(status[0]) + (parts[2] ? ', ' + tr(parts[2]) : ''));
      });
    }
    function setMode(next) {
      mode = next;
      try { localStorage.setItem('kiwiNativeFloorView', next); } catch (_) {}
      document.body.classList.toggle('kiwi-native-floor-list', next === 'list');
      box.querySelectorAll('[data-floor-view]').forEach(function (button) {
        var on = button.getAttribute('data-floor-view') === next;
        button.classList.toggle('is-active', on); button.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (next === 'list') paint();
    }
    box.addEventListener('click', function (event) {
      var toggle = event.target.closest('[data-floor-view]');
      if (toggle) { setMode(toggle.getAttribute('data-floor-view')); hapticLight(); return; }
      var row = event.target.closest('[data-row-table]');
      if (!row) return;
      var node = Array.prototype.filter.call(view.querySelectorAll('.cplan-tbl[data-table]'), function (n) { return n.getAttribute('data-table') === row.getAttribute('data-row-table'); })[0];
      if (node) { hapticLight(); node.click(); }
    });
    var pending = false;
    new MutationObserver(function (records) {
      if (mode !== 'list' || pending) return;
      if (records.every(function (r) { return box.contains(r.target); })) return;
      pending = true;
      setTimeout(function () { pending = false; paint(); }, 60);
    }).observe(view, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-status', 'class', 'aria-label', 'hidden'] });
    setMode(mode);
  }

  function initNativeTillUx() {
    if (!/kiwi-caisse\.html$/i.test(location.pathname) || !document.body) return;
    document.body.classList.add('kiwi-native-till');
    if (window.innerWidth <= 600) { try { initNativeFloorList(); } catch (_) {} }
    var copy = nativeTillCopy();
    /* The card button is icon-only on the web till. On a phone it sits beside the
       labelled primary and read as an unexplained black block. */
    var cardButton = document.getElementById('pay-card');
    if (cardButton && !cardButton.querySelector('.kiwi-native-pay-label')) {
      var cardLabel = document.createElement('span');
      cardLabel.className = 'kiwi-native-pay-label';
      cardLabel.setAttribute('data-nolang', '');
      cardLabel.textContent = copy.card;
      cardButton.appendChild(cardLabel);
    }
    var nav = document.createElement('nav');
    nav.className = 'kiwi-native-tabbar';
    nav.setAttribute('aria-label', copy.label);
    nav.setAttribute('data-lens-demo', '');
    var tabItems = [
      ['salle', copy.salle, 'table_restaurant.svg'],
      ['vrap', copy.vrap, 'lunch_dining.svg'],
      ['waitlist', copy.waitlist, 'group.svg']
    ];
    nav.innerHTML = tabItems.map(function (item) {
      return '<button type="button" data-lens-item data-native-tab="' + item[0] + '"><i style="--native-tab-icon:url(assets/icons/material/' + item[2] + ')" aria-hidden="true"></i><span>' + item[1] + '</span></button>';
    }).join('');
    document.body.appendChild(nav);
    if (window.KiwiLens && typeof window.KiwiLens.rescan === 'function') {
      window.KiwiLens.rescan();
      window.KiwiLens.refresh();
    }

    var dockedCart = document.querySelector('.rightpanel');
    function syncDock() {
      var docked = nativeDockedTill();
      if (document.body.classList.contains('kiwi-native-docked') !== docked) document.body.classList.toggle('kiwi-native-docked', docked);
      // A docked bill is always open; the sheet state would hide its actions.
      if (docked && document.body.classList.contains('ticket-open')) document.body.classList.remove('ticket-open');
      return docked;
    }
    function syncTabs() {
      var docked = syncDock();
      var mode = document.body.dataset.mode || 'salle';
      var drawerOpen = document.body.classList.contains('nav-open');
      var selected = drawerOpen ? 'more' : mode;
      /* While the bill sheet is up on a phone it owns the bottom of the screen:
         the capsule floated over its Pay button. Swift hides the host when the
         list is empty and publishes a zero tab height, so the sheet reaches
         the bottom on its own. */
      var sheetUp = !docked && document.body.classList.contains('ticket-open');
      var trailingInset = 0;
      if (docked && dockedCart && dockedCart.getClientRects().length) trailingInset = Math.round(dockedCart.getBoundingClientRect().width);
      nav.querySelectorAll('[data-native-tab]').forEach(function (button) {
        var tab = button.getAttribute('data-native-tab');
        var active = tab === selected;
        button.classList.toggle('on', active);
        button.setAttribute('aria-current', active ? 'page' : 'false');
      });
      nativeHostPost({
        version:1, screen:'workspace', role:'caisse', locale:String(root.lang || 'fr'), rtl:root.dir === 'rtl', selected:selected, trailingInset:trailingInset,
        tabs:nativeBlockingLayer() || nativeRegisterOpen() || sheetUp || window.innerWidth > 900 ? [] : tabItems.map(function (item) { return { id:item[0], label:item[1] }; })
      });
    }
    function activateNativeTab(mode) {
      if (nativeBlockingLayer()) return false;
      if (mode === 'more') {
        document.body.classList.add('nav-open');
        khPlay('Choose', 'native-tab', { trigger: 'tap' });
        syncTabs();
        return true;
      }
      var source = document.querySelector('.mode-pill[data-mode="' + mode + '"]');
      if (source && !source.disabled && !source.hidden) source.click();
      document.body.classList.remove('nav-open');
      khPlay('Choose', 'native-tab', { trigger: 'tap' });
      syncTabs();
      return true;
    }
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('[data-native-tab]');
      if (!button) return;
      activateNativeTab(button.getAttribute('data-native-tab'));
    });
    window.KiwiNativeHostAction = function (payload) { if (nativeWorkspaceAction(payload)) return; if (payload && payload.action === 'navigate') activateNativeTab(String(payload.id || '')); };
    window.KiwiNativeHostRequestState = syncTabs;
    new MutationObserver(syncTabs).observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'class'] });
    // Rotating an iPad or resizing a Split View pane crosses the 900 pt line
    // without any class changing; the tab list and the dock follow the size.
    var tabsResizeQueued = false;
    window.addEventListener('resize', function () {
      if (tabsResizeQueued) return;
      tabsResizeQueued = true;
      requestAnimationFrame(function () { tabsResizeQueued = false; syncTabs(); });
    });
    syncTabs();

    var openTillMenu = function () { document.body.classList.add('nav-open'); syncTabs(); };
    document.querySelectorAll('.main-head').forEach(function (head) {
      if (head.querySelector('.main-title') && !head.querySelector(':scope > .kiwi-native-burger')) head.insertBefore(nativeMenuButton(openTillMenu), head.firstChild);
    });
    var tillSidebar = document.querySelector('.sidebar');
    var mountTillAccount = function () { mountNativeAccountGroup(tillSidebar); };
    mountTillAccount();
    new MutationObserver(mountTillAccount).observe(root, { attributes:true, attributeFilter:['lang'] });
    /* A register has no restaurant sidebar, so the account actions (change role,
       sign out…) the till drawer carries were nowhere on a boutique or pressing
       till: the only way to another workspace was to kill the app (ticket
       #0138). Mount the same group at the end of the register's own drawer. The
       registers re-render their rail, so look again after each burst of changes. */
    var registerAccountQueued = false;
    var mountRegisterAccount = function () {
      registerAccountQueued = false;
      if (!nativeRegisterOpen()) return;
      document.querySelectorAll('body.is-pos .vx-rail').forEach(function (rail) { mountNativeAccountGroup(rail); });
    };
    new MutationObserver(function () {
      if (registerAccountQueued || !nativeRegisterOpen()) return;
      registerAccountQueued = true;
      requestAnimationFrame(mountRegisterAccount);
    }).observe(document.body, { childList:true, subtree:true });
    followSystemTheme('caisse');

    var cart = document.querySelector('.rightpanel');
    if (cart) {
      var peek = cart.querySelector('.rp-peek');
      var activeCart = cart.querySelector('.rp-active');
      var grabber = document.createElement('button');
      grabber.type = 'button';
      grabber.className = 'kiwi-native-sheet-grabber';
      grabber.setAttribute('aria-label', copy.close);
      grabber.setAttribute('aria-controls', 'rp-active');
      grabber.addEventListener('click', function () { document.body.classList.remove('ticket-open'); });
      cart.insertBefore(grabber, cart.firstChild);
      var scrim = document.createElement('div');
      scrim.className = 'kiwi-native-sheet-scrim';
      scrim.setAttribute('aria-hidden', 'true');
      scrim.addEventListener('click', function () { document.body.classList.remove('ticket-open'); });
      cart.parentNode.insertBefore(scrim, cart);
      var startY = 0, dragY = 0;
      grabber.addEventListener('touchstart', function (event) {
        startY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
        dragY = 0;
      }, { passive: true });
      grabber.addEventListener('touchmove', function (event) {
        if (!startY || !event.touches || !event.touches[0]) return;
        dragY = Math.max(0, event.touches[0].clientY - startY);
        cart.style.transform = 'translateY(' + dragY + 'px)';
      }, { passive: true });
      grabber.addEventListener('touchend', function () {
        cart.style.removeProperty('transform');
        if (dragY > 72) document.body.classList.remove('ticket-open');
        startY = dragY = 0;
      }, { passive: true });

      var meta = cart.querySelector('.rp-meta');
      var more = null;
      if (meta) {
        more = document.createElement('button');
        more.type = 'button';
        more.className = 'kiwi-native-cart-more';
        more.setAttribute('aria-expanded', 'false');
        more.textContent = copy.actions;
        more.addEventListener('click', function () {
          var expanded = document.body.classList.toggle('kiwi-native-cart-actions');
          more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          more.textContent = expanded ? copy.less : copy.actions;
        });
        meta.parentNode.insertBefore(more, meta);
      }

      /* On a phone the bill is a sheet, and the X at the top of a sheet means
         "put it away". In takeaway the caisse wired that X to clearCart(), so
         one tap meant to glance back at the menu threw the order away. Here the
         X only folds the sheet; emptying the order stays the explicit, red
         "Vider la commande" under More actions. */
      var closeX = cart.querySelector('#rp-close');
      if (closeX) {
        document.addEventListener('click', function (event) {
          if (event.target.closest('#rp-close') !== closeX) return;
          if (document.body.getAttribute('data-mode') !== 'vrap' || !document.body.classList.contains('ticket-open')) return;
          event.preventDefault();
          event.stopPropagation();
          document.body.classList.remove('ticket-open');
        }, true);
        closeX.setAttribute('aria-label', copy.close);
      }

      /* On phones the bill is a bottom sheet. Do not reserve a second bottom
         shelf when no table/cart is selected, and keep the sheet's expanded
         state truthful for VoiceOver as the existing caisse code opens/closes
         the panel. The observer watches state only; no money or cart data is
         duplicated here. */
      function syncCartSheet() {
        var empty = !activeCart || activeCart.hidden || activeCart.style.display === 'none';
        /* An empty takeaway has nothing to show: a "0 items · 0 MAD" shelf only hid products.
           A table with no lines keeps its sheet, which carries the table and its cancel action. */
        if (!empty && document.body.getAttribute('data-mode') === 'vrap' && !activeCart.querySelector('#rp-items .rp-item')) empty = true;
        var expanded = !empty && document.body.classList.contains('ticket-open');
        if (document.body.classList.contains('kiwi-native-cart-empty') !== empty) {
          document.body.classList.toggle('kiwi-native-cart-empty', empty);
        }
        if (empty || !expanded) {
          if (document.body.classList.contains('kiwi-native-cart-actions')) document.body.classList.remove('kiwi-native-cart-actions');
          if (more) {
            more.setAttribute('aria-expanded', 'false');
            if (more.textContent !== copy.actions) more.textContent = copy.actions;
          }
        }
        if (empty && document.body.classList.contains('ticket-open')) document.body.classList.remove('ticket-open');
        if (peek) {
          peek.setAttribute('aria-controls', 'rp-active');
          peek.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          var rows = activeCart ? activeCart.querySelectorAll('#rp-items .rp-item:not(.rp-item--discount)') : [];
          var count = Array.prototype.reduce.call(rows, function (sum, row) {
            var quantity = row.querySelector('.qty-num,.rp-item-qty,.rp-sent-qty');
            return sum + (quantity ? (parseInt(quantity.textContent, 10) || 1) : 1);
          }, 0);
          var label = peek.firstElementChild;
          var total = peek.querySelector('#rp-peek-total');
          var liveTotal = activeCart && activeCart.querySelector('#rp-total');
          var nextLabel = nativeTillCopy().view;
          if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
          if (label && label.getAttribute('data-count') !== String(count)) label.setAttribute('data-count', String(count));
          var spoken = count + ' ' + (root.lang === 'en' ? (count === 1 ? 'item' : 'items') : root.lang === 'ar' ? 'عناصر' : (count === 1 ? 'article' : 'articles'));
          if (peek.getAttribute('aria-description') !== spoken) peek.setAttribute('aria-description', spoken);
          if (total && liveTotal && total.textContent !== liveTotal.textContent) total.textContent = liveTotal.textContent;
        }
        grabber.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
      if (activeCart) new MutationObserver(syncCartSheet).observe(activeCart, { attributes: true, childList: true, characterData: true, subtree: true, attributeFilter: ['hidden', 'style'] });
      new MutationObserver(syncCartSheet).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-mode'] });
      syncCartSheet();
    }

    function syncCategory() {
      var active = document.querySelector('.cat-pill.is-active[data-cat]');
      document.body.classList.toggle('kiwi-native-category-filtered', !!active && active.getAttribute('data-cat') !== 'all');
    }
    var categories = document.getElementById('cat-pills');
    if (categories) new MutationObserver(syncCategory).observe(categories, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
    syncCategory();

    var welcome = document.getElementById('welcome-banner');
    if (welcome) {
      function syncWelcome() {
        var visible = !welcome.hidden && welcome.classList.contains('is-visible');
        welcome.inert = !visible;
        welcome.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
      new MutationObserver(syncWelcome).observe(welcome, { attributes: true, attributeFilter: ['class', 'hidden'] });
      welcome.addEventListener('animationend', function () {
        welcome.inert = true;
        welcome.setAttribute('aria-hidden', 'true');
      });
      syncWelcome();
    }
  }

  function initNativeHostWorkspace() {
    if (/kiwi-caisse\.html$/i.test(location.pathname)) return;
    var role = /kiwi-serveur\.html$/i.test(location.pathname) ? 'equipe' : /kiwi-cuisine\.html$/i.test(location.pathname) ? 'cuisine' : /dashboard\.html$/i.test(location.pathname) ? 'dashboard' : '';
    if (!role) return;
    var owner = role === 'dashboard' ? initNativeOwnerUx() : null;
    if (role === 'dashboard') { initNativeOwnerKeypad(); initNativeEntry(); }
    if (role === 'cuisine') {
      /* Nothing on the kitchen screen buzzes, its pairing pad included (§15.6). */
      var pairingGate = document.getElementById('pair');
      if (pairingGate && !pairingGate.querySelector('.kiwi-native-role-back')) {
        var roleBack = document.createElement('a');
        roleBack.className = 'kiwi-native-role-back'; roleBack.href = 'index.html?choose=1';
        var updateRoleBack = function () { roleBack.textContent = root.lang === 'ar' ? 'تغيير الدور' : root.lang === 'en' ? 'Change role' : 'Changer de rôle'; };
        updateRoleBack(); pairingGate.appendChild(roleBack);
        new MutationObserver(updateRoleBack).observe(root, {attributes:true, attributeFilter:['lang']});
      }
    }
    if (role === 'equipe') {
      /* Team code: Failed on the shake. A successful code fires nothing (§15.1). */
      new MutationObserver(function (records) {
        records.forEach(function (r) {
          var el = r.target, was = (r.oldValue || '').split(' ');
          if (!el.classList) return;
          if (el.classList.contains('pin-dots') && el.classList.contains('shake') && was.indexOf('shake') < 0) hapticFailed('pin-wrong:' + Math.round(N.lastPressAt));
        });
      }).observe(document.getElementById('pin-dots') || document.body, { subtree:true, attributes:true, attributeFilter:['class'], attributeOldValue:true });
    }
    document.body.classList.add('kiwi-native-' + (role === 'equipe' ? 'team' : role === 'cuisine' ? 'kitchen' : 'owner'));
    followSystemTheme(role);
    if (role === 'equipe' || role === 'cuisine') {
      var openSideMenu = nativeSideMenu(role === 'equipe' ? 'team' : 'kitchen');
      var header = document.querySelector(role === 'equipe' ? '#screen-main header.topbar' : 'header.top .brand');
      if (header && !header.querySelector('.kiwi-native-burger')) header.insertBefore(nativeMenuButton(openSideMenu), header.firstChild);
    }
    var teamButtons = function () { return Array.from(document.querySelectorAll('#screen-main .bottom-tabs button[data-tab]')); };
    var teamReady = function () { return role === 'equipe' && document.querySelector('#screen-main.is-active') && !document.body.classList.contains('is-browse-mode'); };
    var lastPushed = '';
    var push = function () {
      var tabs = nativeBlockingLayer() || window.innerWidth > 900 || !owner ? [] : owner.tabs();
      var selected = owner ? owner.selected() : '';
      if (teamReady() && !nativeBlockingLayer() && window.innerWidth <= 600) {
        tabs = teamButtons().map(function (b) { return { id:b.dataset.tab, label:b.getAttribute('aria-label') || b.textContent.trim() }; });
        var active = teamButtons().filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0];
        selected = active ? active.dataset.tab : '';
      }
      var showTeamTabs = !!(teamReady() && tabs.length > 1);
      if (document.body.classList.contains('kiwi-native-team-tabs') !== showTeamTabs) document.body.classList.toggle('kiwi-native-team-tabs', showTeamTabs);
      var payload = { version:1, screen:'workspace', role:role, locale:String(root.lang || 'fr'), rtl:root.dir === 'rtl', selected:selected, tabs:tabs };
      var key = JSON.stringify(payload);
      if (key === lastPushed) return;
      lastPushed = key;
      nativeHostPost(payload);
    };
    window.KiwiNativeHostRequestState = function () { lastPushed = ''; push(); };
    // Popovers (profile, venue switcher) are appended to body without a class
    // change; without this the tab capsule stayed on top of their last rows.
    new MutationObserver(function (records) {
      if (records.some(function (r) { return Array.prototype.some.call(r.addedNodes || [], isMenu) || Array.prototype.some.call(r.removedNodes || [], isMenu); })) push();
      function isMenu(node) { return node.nodeType === 1 && node.classList.contains('kiwi-menu'); }
    }).observe(document.body, { childList:true });
    window.KiwiNativeHostAction = function (payload) {
      if (owner && payload && payload.action === 'open-tools') { owner.openMenu(); return; }
      if (!owner && payload && payload.action === 'open-tools') { var sideOpen = document.querySelector('.kiwi-native-burger'); if (sideOpen) sideOpen.click(); return; }
      if (nativeWorkspaceAction(payload)) return;
      if (owner && payload && payload.action === 'navigate') owner.go(String(payload.id || ''));
      if (teamReady() && payload && payload.action === 'navigate' && !nativeBlockingLayer()) {
        var button = teamButtons().filter(function (b) { return b.dataset.tab === payload.id; })[0];
        if (button) { button.click(); push(); }
      }
    };
    if (owner) owner.onChange(push);
    if (role === 'equipe') {
      var team = document.getElementById('screen-main');
      if (team) new MutationObserver(push).observe(team, { subtree:true, attributes:true, attributeFilter:['aria-pressed','aria-label','class'] });
    }
    window.addEventListener('resize', push);
    new MutationObserver(push).observe(root, { attributes:true, attributeFilter:['lang','dir'] });
    push(); setTimeout(push, 300); setTimeout(push, 1200);
  }
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.initNativeTillUx = initNativeTillUx; N.initNativeHostWorkspace = initNativeHostWorkspace;
})();
