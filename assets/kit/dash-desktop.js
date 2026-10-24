/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-desktop.js · the dashboard on a desktop window
 * (900 and wider) on the kit (spec §10.20, §12, §13.5). Loaded only when
 * the dashboard's flag is on (kiwiSkin2027:dashboard, or ?skin=2027 for one
 * load); off, nothing here runs and the shipped dashboard is untouched.
 *
 * What it adds, and nothing else (the layout itself is dash-desktop.css):
 *   · the sidebar: a <k-sidebar> built from the shipped sidebar's own links,
 *     in their order, with their labels and sections; a tap clicks the
 *     shipped link, so every destination and handler stays the shipped one.
 *     It follows the shipped link marked active, its language and the
 *     features the store has (a link the shipped page hides is not listed);
 *   · Home: the goal card (the shipped goal of KiwiDateRange.home(), the
 *     one dash-home.js draws on the phone) and the two card grounds the
 *     grid puts behind the key figure with its chart, and behind the latest
 *     orders;
 *   · the KPI tiles' column count, read from --k-kpi-cols, which the layout
 *     sets per width (two beside the chart, three under it).
 * Every rule is scoped to (min-width: 900px) in the stylesheet, so below
 * that width these nodes are not drawn and the phone layout is unchanged.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var doc = root.document;
  var html = doc.documentElement;
  if (html.getAttribute('data-skin-2027') !== 'dashboard') return;
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-sidebar')) return;
  var esc = K.esc;

  /* §8: Material Symbols only. The shipped destination key (data-nav, or
     the action for the two that open a page by action) to its glyph; a key
     not listed takes the generic category glyph. */
  var ICON = {
    accueil: 'dashboard', transactions: 'receipt_long', rapport: 'description',
    'clients-directory': 'contacts', 'customer-retention': 'favorite',
    terminaux: 'credit_card', conformite: 'verified_user', equipe: 'group',
    payroll: 'today', reservations: 'event_available', promos: 'sell',
    tables: 'table_restaurant', menu: 'restaurant', stock: 'inventory_2', inventory: 'inventory_2',
    finance: 'monitoring', kds: 'skillet', clients: 'contacts', appointments: 'calendar_clock',
    services: 'spa', practitioners: 'group', products: 'shopping_bag', shop: 'storefront',
    'points-vente': 'storefront', delivery: 'local_shipping', suppliers: 'local_shipping',
    chambres: 'bed', sejours: 'hotel', drugs: 'medication', prescriptions: 'medication',
    'pressing-orders': 'local_laundry_service', 'pressing-services': 'local_laundry_service',
    'pressing-workshop': 'local_laundry_service', 'pressing-delivery': 'local_shipping',
    'pressing-pickup': 'local_shipping', 'pressing-quality': 'verified_user'
  };

  /* ── The sidebar ─────────────────────────────────────────────────────── */
  var side = null, sideSig = '';

  function shippedNav() { return doc.querySelector('aside.sidebar > nav'); }
  /* A shipped link is a destination (its nav key) or opens a page through
     the shipped router (its action, read through dataset: the kit only
     reads the router's markup, it never writes it, §20.3). */
  function keyOf(a) {
    var d = a.dataset || {};
    if (d.nav) return d.nav;
    return d.action ? 'act:' + d.action : '';
  }
  var links = {};
  function labelOf(a) {
    var s = a.querySelector('[data-i18n]') || a.querySelector('span:not(.count):not(.tag)');
    return String((s || a).textContent || '').replace(/\s+/g, ' ').trim();
  }
  function shown(el) {
    if (el.hidden) return false;
    try { return root.getComputedStyle(el).display !== 'none'; } catch (_) { return true; }
  }
  /* The shipped links, in order, cut into sections at each .sect title. */
  function readNav() {
    var nav = shippedNav();
    if (!nav) return null;
    var sections = [{ label: '', items: [] }], value = '';
    links = {};
    nav.querySelectorAll('a, .sect').forEach(function (el) {
      if (el.classList.contains('sect')) {
        if (!shown(el)) return;
        sections.push({ label: String(el.textContent || '').trim(), items: [] });
        return;
      }
      var id = keyOf(el);
      if (!id || !shown(el)) return;
      links[id] = el;
      var raw = id.indexOf('act:') === 0 ? id.slice(4) : id;
      sections[sections.length - 1].items.push({ id: id, label: labelOf(el), icon: ICON[raw] || 'category' });
      if (el.classList.contains('active')) value = id;
    });
    return { sections: sections.filter(function (s) { return s.items.length; }), value: value };
  }
  function paintSide() {
    if (!side) return;
    var m = readNav();
    if (!m) return;
    var s = JSON.stringify(m);
    if (s === sideSig) return;
    sideSig = s;
    side.sections = m.sections;
    if (m.value) side.setAttribute('value', m.value);
    else side.removeAttribute('value');
  }
  var sideQueued = false;
  function queueSide() {
    if (sideQueued) return;
    sideQueued = true;
    (root.requestAnimationFrame || setTimeout)(function () { sideQueued = false; paintSide(); });
  }
  function mountSide() {
    var nav = shippedNav();
    if (!nav || doc.getElementById('kit-side')) return;
    side = doc.createElement('k-sidebar');
    side.id = 'kit-side';
    var aria = nav.getAttribute('aria-label');
    if (aria) side.setAttribute('label', aria);
    nav.parentNode.insertBefore(side, nav);
    side.addEventListener('kiwi:action', function (e) {
      var d = e.detail || {};
      if (d.action !== 'k.sidebar.select' || !d.id) return;
      var a = links[String(d.id)];
      if (a && a.isConnected) a.click();
    });
    try { new MutationObserver(queueSide).observe(nav, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] }); } catch (_) {}
    try { new MutationObserver(queueSide).observe(doc.body, { attributes: true, attributeFilter: ['class'] }); } catch (_) {}
    root.addEventListener('kiwi:langchange', function () { sideSig = ''; queueSide(); });
    html.setAttribute('data-k-side', '');
    paintSide();
  }

  /* ── Home: the goal card and the two card grounds ────────────────────── */
  var goal = null;
  function model() {
    var D = root.KiwiDateRange;
    try { return D && D.home ? D.home() : null; } catch (_) { return null; }
  }
  function paintGoal() {
    if (!goal) return;
    var m = model(), g = m && m.goal;
    var on = !!(g && (m.range === 'aujourdhui' || m.range === 'hier'));
    goal.hidden = !on;
    html.setAttribute('data-k-goal', on ? '1' : '0');
    if (!on) return;
    if (g.unset) {
      goal.innerHTML = '<p class="k-foot k-ink2">' + esc(g.label || '') + '</p>';
      return;
    }
    var w = Math.max(0, Math.min(100, (g.ratio || 0) * 100)).toFixed(1);
    /* The shipped label writes the goal ungrouped ("31500 MAD"); every other
       amount on the page is grouped ("31 500 MAD"). */
    var F = root.KiwiFormat;
    var label = String(g.label || '').replace(/\d{4,}/g, function (n) { return F && F.num ? F.num(Number(n), 0) : n; });
    goal.innerHTML = '<p class="k-foot k-ink2">' + esc(label) + '</p>' +
      '<p class="k-dd-goal__v"><bdi dir="ltr" class="k-title k-num">' + esc(String(g.pct)) + '</bdi><span class="k-heading k-ink2"> %</span></p>' +
      '<span class="k-dd-goal__bar" aria-hidden="true"><i style="width:' + w + '%"></i></span>';
  }
  function mountHome() {
    var std = doc.querySelector('#kw-main .dash-standard');
    if (!std || !doc.getElementById('kit-home') || doc.getElementById('kit-dd-goal')) return !!doc.getElementById('kit-dd-goal');
    var hero = doc.createElement('div');
    hero.className = 'k-dd-ground k-dd-ground--hero';
    hero.setAttribute('aria-hidden', 'true');
    var feed = doc.createElement('div');
    feed.className = 'k-dd-ground k-dd-ground--feed';
    feed.setAttribute('aria-hidden', 'true');
    goal = doc.createElement('section');
    goal.id = 'kit-dd-goal';
    goal.className = 'k-dd-goal';
    std.insertBefore(goal, std.firstChild);
    std.insertBefore(feed, std.firstChild);
    std.insertBefore(hero, std.firstChild);
    root.addEventListener('kiwi:home-model', paintGoal);
    paintGoal();
    return true;
  }

  /* ── Tiles: the column count from --k-kpi-cols ───────────────────────── */
  var tileSheet = null;
  function tileCss() {
    if (tileSheet !== null) return tileSheet;
    tileSheet = false;
    try {
      var s = new CSSStyleSheet();
      s.replaceSync(':host{height:100%}' +
        '.grid{height:100%;grid-template-columns:repeat(var(--k-kpi-cols,2),minmax(0,1fr));grid-auto-rows:minmax(108px,1fr);gap:var(--k-kpi-gap,var(--k-grid-gap,12px))}' +
        '@media (min-width:700px){.grid{grid-template-columns:repeat(var(--k-kpi-cols,4),minmax(0,1fr))}}' +
        /* A tile taller than its content (the row follows the chart's
           card) keeps its label and figure together at the top and sets its
           comparison on the bottom edge, rather than floating the figure. */
        '.tile{justify-content:flex-start}.tile>.ft{margin-top:auto}');
      tileSheet = s;
    } catch (_) {}
    return tileSheet;
  }
  /* The sidebar's labels on one line: a long one ends in an ellipsis
     rather than doubling its row. */
  var sideSheet = null;
  function adoptSide() {
    var r = side && side.shadowRoot;
    if (!r || !r.adoptedStyleSheets) return;
    if (sideSheet === null) {
      sideSheet = false;
      try {
        sideSheet = new CSSStyleSheet();
        sideSheet.replaceSync('.sb{width:auto;padding-block:8px}.it .lb{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
          'font-size:var(--k-fs-callout);line-height:var(--k-lh-callout);letter-spacing:var(--k-track-callout)}' +
          '.it:not([aria-current="page"]) .ic{color:var(--k-ink-2)}.sec{margin:20px 12px 4px}');
      } catch (_) { sideSheet = false; }
    }
    if (sideSheet && r.adoptedStyleSheets.indexOf(sideSheet) < 0) r.adoptedStyleSheets = r.adoptedStyleSheets.concat([sideSheet]);
  }
  /* A segment's label sits in the middle of its segment (§10.6): the kit's
     button reset inherits text-align, so a segment wider than its label
     (spare width is shared) read flush to its start. */
  var segSheet = null;
  function adoptSegs() {
    if (segSheet === null) {
      segSheet = false;
      try { segSheet = new CSSStyleSheet(); segSheet.replaceSync('.sg{text-align:center}'); } catch (_) { segSheet = false; }
    }
    if (!segSheet) return;
    doc.querySelectorAll('#kw-main k-segmented').forEach(function (g) {
      var r = g.shadowRoot;
      if (!r || !r.adoptedStyleSheets || r.adoptedStyleSheets.indexOf(segSheet) >= 0) return;
      r.adoptedStyleSheets = r.adoptedStyleSheets.concat([segSheet]);
      watchFit(g);
    });
  }
  /* §10.6: "when the labels plus padding are measured not to fit, the
     control becomes the scrolling track". The kit scrolls only past five
     options, so five that do not fit (Orders' filter in French on a phone,
     "Remboursements" pressed against the track's edge) were squeezed under
     their labels. Each label is measured as set (a Range, which the squeeze
     does not change), plus the segment's 24 and the track's 8. */
  function fits(g) {
    var r = g.shadowRoot, need = 8, w = g.clientWidth;
    if (!r || !w) return true;
    [].forEach.call(r.querySelectorAll('.sg'), function (b) {
      var rg = doc.createRange();
      rg.selectNodeContents(b);
      need += Math.max(44, Math.ceil(rg.getBoundingClientRect().width) + 24);
    });
    return need <= w;
  }
  function refit(g) {
    if (!g.isConnected || (g.options && g.options.length > 5)) return;
    var want = !fits(g);
    if (want !== g.hasAttribute('scroll')) g.toggleAttribute('scroll', want);
  }
  function watchFit(g) {
    var q = false;
    function soon() { if (q) return; q = true; (root.requestAnimationFrame || setTimeout)(function () { q = false; refit(g); }); }
    if (root.ResizeObserver) { try { new ResizeObserver(soon).observe(g); } catch (_) {} }
    try { new MutationObserver(soon).observe(g.shadowRoot, { childList: true, subtree: true, characterData: true }); } catch (_) {}
    var fonts = doc.fonts;
    if (fonts && fonts.ready) fonts.ready.then(soon);
    soon();
  }
  function adoptTiles() {
    adoptSide();
    adoptSegs();
    var s = tileCss();
    if (!s) return;
    doc.querySelectorAll('#kit-home k-kpi-grid, #kit-retention k-kpi-grid').forEach(function (g) {
      var r = g.shadowRoot;
      if (!r || !r.adoptedStyleSheets || r.adoptedStyleSheets.indexOf(s) >= 0) return;
      r.adoptedStyleSheets = r.adoptedStyleSheets.concat([s]);
    });
  }

  /* §9.4: a few shipped labels are written in capitals (the venue card's
     "EN SERVICE", in dashboard.html and i18n.js; the app card's "APPLICATION
     KIWI", in dashboard-pwa.js). With the flag on they read in sentence case,
     at every width, the brand keeping its capital; each is rewritten again if
     i18n puts the capitals back, and the app card, which redraws whole, is
     watched as a card. Only an all-caps text is touched, so this never loops. */
  var CAPS = ['.sidebar .loc-switch .badge > span[data-i18n]', '[data-upsell] .kiwi-install-head > .t',
    /* Home's shipped sections below the kit's figures: "POUR VOUS", "HEURES
       DE POINTE", "KIWI INSIGHTS · MESURÉ", "SERVICE DU SOIR · CE SOIR". */
    '.dash-standard .oppo-eyebrow', '.dash-standard .block-head .t', '.dash-standard .hai-eyebrow',
    '.dash-standard .hh-ai-eyebrow', '.dash-standard .settle > .lbl'];
  var CAPS_HOSTS = ['[data-upsell]'];
  function sentence(el) {
    /* Text only: a label holding other nodes is never flattened. */
    if (el.children.length) return;
    var s = el.textContent;
    if (!/[A-ZÀ-Ý]{2}/.test(s) || s !== s.toUpperCase()) return;
    var low = s.toLowerCase();
    el.textContent = (low.charAt(0).toUpperCase() + low.slice(1)).replace(/\bkiwi\b/g, 'Kiwi');
  }
  /* Seen nodes, held weakly: Home's sections redraw under the poller. */
  var capsSeen = root.WeakSet ? new root.WeakSet() : { list: [], has: function (x) { return this.list.indexOf(x) >= 0; }, add: function (x) { this.list.push(x); } };
  function caps() {
    CAPS_HOSTS.forEach(function (sel) {
      doc.querySelectorAll(sel).forEach(function (host) {
        if (capsSeen.has(host)) return;
        capsSeen.add(host);
        try { new MutationObserver(caps).observe(host, { childList: true }); } catch (_) {}
      });
    });
    CAPS.forEach(function (sel) {
      doc.querySelectorAll(sel).forEach(function (el) {
        sentence(el);
        if (capsSeen.has(el)) return;
        capsSeen.add(el);
        try { new MutationObserver(function () { sentence(el); }).observe(el, { childList: true, characterData: true, subtree: true }); } catch (_) {}
      });
    });
  }

  function boot() {
    caps();
    mountSide();
    mountHome();
    adoptTiles();
  }
  /* The kit pages mount late (after the shipped page draws); a light
     observer catches each new one, then stops looking once all are in. */
  function watch() {
    var main = doc.getElementById('kw-main') || doc.body;
    try {
      var capsQueued = false;
      new MutationObserver(function () {
        if (!doc.getElementById('kit-side') || !doc.getElementById('kit-dd-goal')) boot();
        adoptTiles();
        /* A shipped section redrawn whole comes back in capitals. */
        if (!capsQueued) { capsQueued = true; (root.requestAnimationFrame || setTimeout)(function () { capsQueued = false; caps(); }); }
      }).observe(main, { childList: true, subtree: true });
    } catch (_) {}
  }
  function start() { boot(); watch(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  root.KiwiDashDesktop = { paint: function () { sideSig = ''; paintSide(); paintGoal(); } };
})(typeof window !== 'undefined' ? window : globalThis);
