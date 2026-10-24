/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-phone.js · the dashboard's phone chrome on the kit
 * (spec §18.1, §10.18, §10.20; stage 5). Loaded only when the dashboard's
 * flag is on (kiwiSkin2027:dashboard, or ?skin=2027 for one load), and drawn
 * only below 900 px, where the shipped page itself is in its phone form (its
 * sidebar becomes a column at 900): a phone, and an iPad in portrait, get
 * this layout whole rather than the shipped header beside kit pages.
 *
 *   · the nav bar: on Home, the wordmark, the venue switcher, the Kiwi AI
 *     capsule and the bell (§18.1); on any other page, Back and the page's
 *     inline title (Body strong, centred) with the bell (§10.18), so the
 *     page's key figure stays its largest text;
 *   · the tab capsule (<k-tabbar>): Home, Orders, Report, Customers, More,
 *     labelled, the lens on the page shown (§10.20).
 *
 * Every tap goes to the shipped control (assets/mobile-nav.js's tabs, the
 * sidebar's links and its venue switcher, the shipped bell), so the pages and
 * drawers open exactly as before; this file only draws. html[data-k-phone]
 * then lets kit.css hide the shipped phone header and tab bar. Above 899 px,
 * or with the flag off, nothing here runs.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  var doc = root.document;
  if (!K || !root.customElements || !root.customElements.get('k-tabbar')) return;
  if (doc.documentElement.getAttribute('data-skin-2027') !== 'dashboard') return;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc, icon = K.icon;
  var mq = root.matchMedia ? root.matchMedia('(max-width: 899px)') : { matches: false, addEventListener: function () {} };

  var bar = null, tabs = null, page = '', sig = '';

  function $(sel) { return doc.querySelector(sel); }
  function press(sel) { var el = $(sel); if (el) el.click(); return !!el; }
  function shown(el) {
    if (!el) return false;
    var cs = root.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  }
  function handler(name) {
    var H = root.Kiwi && root.Kiwi.handlers;
    return H && typeof H[name] === 'function' ? H[name] : null;
  }

  /* Each tab runs the shipped way there. */
  var GO = {
    home: function () { press('.kw-tabbar .kw-tab[data-kw-tab="accueil"]'); },
    orders: function () { press('.kw-tabbar .kw-tab[data-kw-tab="commandes"]'); },
    report: function () { press('.sidebar nav a[data-nav="rapport"]'); },
    customers: function () { var h = handler('clients-directory'); if (h) h(); },
    more: function () { press('.kw-tabbar .kw-tab[data-kw-tab="menu"]'); }
  };

  /* A destination is offered only when the shipped one is (§10.20: an
     unavailable destination is not shown). */
  function items() {
    var list = [{ id: 'home', icon: 'dashboard', label: t('nav.home') }];
    if ($('.kw-tabbar .kw-tab[data-kw-tab="commandes"]')) list.push({ id: 'orders', icon: 'receipt_long', label: t('nav.orders') });
    var rep = $('.sidebar nav a[data-nav="rapport"]');
    if (rep && root.getComputedStyle(rep).display !== 'none') list.push({ id: 'report', icon: 'bar_chart', label: t('nav.report') });
    if (handler('clients-directory')) list.push({ id: 'customers', icon: 'group', label: t('nav.customers') });
    list.push({ id: 'more', icon: 'more_horiz', label: t('nav.more') });
    return list;
  }

  /* Which page is up: Home is the shipped standard view; a full page is the
     shipped genpage, named by the kit page it holds. */
  function current() {
    var gp = $('#kw-main .dash-genpage');
    if (gp && shown(gp)) {
      if (gp.querySelector('#kit-orders')) return 'orders';
      if (gp.querySelector('#kit-customers, .cd')) return 'customers';
      if (gp.querySelector('#kit-report, .kdr-nav')) return 'report';
      return 'page';
    }
    var std = $('#kw-main .dash-standard');
    if (std && shown(std)) return 'home';
    return 'page';
  }
  /* The inline title of a page that is not Home: its shipped heading. */
  function titleOf() {
    var c = $('#kw-main .container');
    if (!c) return '';
    var kids = c.children;
    for (var i = 0; i < kids.length; i++) {
      if (!shown(kids[i])) continue;
      /* Compliance names itself in its own head (.cf-title), not a heading. */
      var h = kids[i].querySelector('.genpage-head h1, h1, h2, .cf-head .cf-title');
      if (h) return h.textContent.replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function venueName() {
    var n = $('.sidebar [data-loc-name]');
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function bellCount() {
    var b = $('.topbar .icon-btn[data-mobile-notifications] .badge');
    /* The shipped bell is not drawn on a phone now; its badge still counts. */
    var v = b && !b.hidden && b.style.display !== 'none' ? b.textContent.trim() : '';
    return /^\d+$/.test(v) ? v : '';
  }

  function paint() {
    if (!bar) return;
    var on = mq.matches;
    var html = doc.documentElement;
    if (on !== html.hasAttribute('data-k-phone')) {
      if (on) html.setAttribute('data-k-phone', '');
      else html.removeAttribute('data-k-phone');
    }
    if (!on) return;
    page = current();
    var venue = venueName(), count = bellCount(), title = page === 'home' ? '' : titleOf();
    var list = items();
    var s = JSON.stringify([page, venue, count, title, list, doc.documentElement.lang]);
    if (s === sig) return;
    sig = s;

    var bell = '<button type="button" class="k-pnav__ic" data-k="bell" aria-label="' + esc(count ? t('nav.notifications') + ', ' + count : t('nav.notifications')) + '">' +
      icon('notifications', 24) + (count ? '<span class="k-pnav__bd k-foot-s k-num" aria-hidden="true">' + esc(count) + '</span>' : '') + '</button>';
    if (page === 'home') {
      bar.setAttribute('data-mode', 'home');
      bar.innerHTML = '<span class="k-pnav__logo" aria-hidden="true"></span>' +
        '<button type="button" class="k-pnav__venue k-body-s" data-k="venue" aria-label="' + esc(t('nav.venue', { venue: venue })) + '">' +
        '<span class="k-pnav__vn" dir="auto">' + esc(venue) + '</span>' + icon('expand_more', 20) + '</button>' +
        '<button type="button" class="k-pnav__ai k-callout-s" data-k="ai">' + icon('auto_awesome', 24) + '<span>' + esc(t('nav.ai')) + '</span></button>' + bell;
      var logo = bar.querySelector('.k-pnav__logo');
      [].forEach.call(doc.querySelectorAll('.sidebar .brand img'), function (img) {
        var c = img.cloneNode(false);
        /* Its own classes: the skins hide the shipped ones by the sidebar's ground. */
        c.className = /brand-logo-dark/.test(img.className) ? 'k-pnav__lg k-pnav__lg--dark' : 'k-pnav__lg';
        c.removeAttribute('width'); c.removeAttribute('height');
        c.alt = ''; c.setAttribute('aria-hidden', 'true');
        logo.appendChild(c);
      });
    } else {
      /* A tab's page has no Back (the tabs are the way back, §10.18); a page
         reached from the menu does. */
      bar.setAttribute('data-mode', 'page');
      bar.innerHTML = (page === 'page' ? '<button type="button" class="k-pnav__ic" data-k="back" aria-label="' + esc(t('action.back')) + '">' + icon('chevron_left', 24) + '</button>' : '<span class="k-pnav__ic" aria-hidden="true"></span>') +
        '<h1 class="k-pnav__title k-body-s">' + esc(title) + '</h1>' + bell;
    }

    tabs.items = list;
    var v = page === 'page' ? '' : page;
    if (tabs.getAttribute('value') !== v) tabs.setAttribute('value', v);
  }

  var queued = false;
  function soon() {
    if (queued) return;
    queued = true;
    root.setTimeout(function () { queued = false; paint(); }, 16);
  }

  function onBar(e) {
    var b = e.target.closest && e.target.closest('[data-k]');
    if (!b) return;
    var k = b.getAttribute('data-k');
    if (k === 'bell') { press('.topbar .icon-btn[data-mobile-notifications]'); return; }
    if (k === 'ai') { press('.kw-tabbar .kw-tab[data-kw-tab="ai"]'); return; }
    if (k === 'back') { GO.home(); soon(); return; }
    if (k === 'venue') {
      /* The switcher lives at the head of the menu, as shipped. */
      GO.more();
      root.setTimeout(function () { var sw = $('.sidebar .loc-switch'); if (sw && sw.getAttribute('aria-expanded') !== 'true') sw.click(); }, 60);
    }
  }

  function onTab(e) {
    var d = e.detail || {};
    if (d.action !== 'k.tabbar.select' || !GO[d.id]) return;
    GO[d.id]();
    /* More is a sheet over the page, not a page: the lens stays where it was. */
    if (d.id === 'more') { sig = ''; }
    root.setTimeout(soon, 60);
  }

  function mount() {
    if (bar) return;
    var inner = $('.topbar > .topbar-inner');
    if (!inner || !$('.kw-tabbar')) return;
    bar = doc.createElement('div');
    bar.className = 'k-pnav';
    bar.addEventListener('click', onBar);
    inner.insertBefore(bar, inner.firstChild);
    tabs = doc.createElement('k-tabbar');
    tabs.className = 'k-ptabs';
    tabs.setAttribute('label', t('nav.home'));
    tabs.addEventListener('kiwi:action', onTab);
    doc.body.appendChild(tabs);

    var c = $('#kw-main .container');
    if (c && root.MutationObserver) new root.MutationObserver(soon).observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    var n = $('.sidebar [data-loc-name]');
    if (n && root.MutationObserver) new root.MutationObserver(soon).observe(n, { childList: true, characterData: true, subtree: true });
    var bd = $('.topbar .icon-btn[data-mobile-notifications]');
    if (bd && root.MutationObserver) new root.MutationObserver(soon).observe(bd, { childList: true, characterData: true, subtree: true, attributes: true });
    if (mq.addEventListener) mq.addEventListener('change', function () { sig = ''; paint(); });
    root.addEventListener('kiwi:langchange', function () { sig = ''; soon(); });
    paint();
  }

  root.KiwiDashPhone = { paint: function () { sig = ''; paint(); }, current: current };

  /* mobile-nav.js builds the shipped phone chrome at DOMContentLoaded; this
     runs after it. */
  function start() { mount(); if (!bar) root.setTimeout(mount, 300); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { root.setTimeout(start, 0); }, { once: true });
  else root.setTimeout(start, 0);
})(typeof window !== 'undefined' ? window : globalThis);
