/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LIQUID LENS — the brand's signature selection motion.
 *
 * One bright pill — "la lentille" — lives under every segmented control and
 * physically TRAVELS to the option you pick: it first stretches to span the
 * old and the new choice, then settles on the target with a spring. The same
 * physics as the phone capsule bar and the serveur app, generalised so every
 * tab row on the dashboard and the website moves with one voice.
 *
 * Usage — additive and zero-risk by design:
 *   · Known groups (GROUPS below) are auto-attached on load and whenever one
 *     mounts later (drawer tabs, re-renders). Existing click handlers stay
 *     untouched: the lens just WATCHES active-state changes (class /
 *     aria-selected) and follows.
 *   · Opt-in for new markup: container `data-lens-demo` + items
 *     `data-lens-item` with `.on` toggling.
 *   · The lens carries the active fill; the active item's own background is
 *     made transparent per group (see the injected CSS) so nothing doubles.
 *
 * Brand spec (see brand.html · 07 MOTION):
 *   spring  cubic-bezier(0.34, 1.45, 0.5, 1) · 310 ms
 *   stretch phase ~115 ms, then settle
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var SPRING = 'cubic-bezier(0.34, 1.45, 0.5, 1)';

  var GROUPS = [
    /* dashboard date range — brand gradient lens */
    { sel: '.dr-pills', item: '.dr-pill', skin: 'brand',
      active: function (el) { return el.classList.contains('on'); } },
    /* partner-track tab rows (reservations, spa services, KDS) — surface chip lens */
    { sel: '.resv-tabs', item: '.resv-tab', skin: 'surface',
      active: function (el) { return el.classList.contains('on'); } },
    { sel: '.kds-pills', item: '.kds-pill', skin: 'surface',
      active: function (el) { return el.classList.contains('on'); } },
    /* Vexel-covered internal pages — same spring, no competing active fill. */
    { sel: '.pds-modes', item: '.pds-mode', skin: 'surface',
      active: function (el) { return el.classList.contains('active'); } },
    { sel: '.pds-zone-tabs', item: '.pds-zone:not(.pds-zone-add)', skin: 'surface',
      active: function (el) { return el.classList.contains('active'); } },
    { sel: '.sc-pills', item: '.sc-pill', skin: 'surface',
      active: function (el) { return el.classList.contains('on'); } },
    { sel: '.kw-menu-tabs', item: '.kw-menu-tab', skin: 'surface',
      active: function (el) { return el.classList.contains('on'); } },
    { sel: '.kx-tabs', item: '.kx-tab', skin: 'surface',
      active: function (el) { return el.classList.contains('on'); } },
    /* landing page audience switch — paper-glass lens on the dark section */
    { sel: '.audience-tabs', item: '.audience-tab', skin: 'paper',
      active: function (el) { return el.getAttribute('aria-selected') === 'true'; } },
    /* brand page demo + any future opt-in markup */
    { sel: '[data-lens-demo]', item: '[data-lens-item]', skin: 'brand',
      active: function (el) { return el.classList.contains('on'); } },
  ];

  var CSS = '' +
    '[data-kw-lens]{position:relative;}' +
    '[data-kw-lens]>:not(.kw-lens){position:relative;z-index:1;}' +
    '.kw-lens{position:absolute;left:0;top:0;width:0;height:0;border-radius:999px;' +
      'opacity:0;pointer-events:none;z-index:0;' +
      'transition:transform .31s ' + SPRING + ',width .31s ' + SPRING + ',' +
        'top .15s ease,height .15s ease;}' +
    '.kw-lens--brand{background:linear-gradient(135deg,var(--atlas) 0%,var(--riad) 100%);' +
      'box-shadow:0 4px 14px -4px rgba(11,110,79,0.45),inset 0 1px 0 rgba(255,255,255,0.16);}' +
    '.kw-lens--surface{background:var(--surface);' +
      'box-shadow:0 1px 2px rgba(0,0,0,0.05),inset 0 1px 0 rgba(255,255,255,0.35);}' +
    'html[data-theme="dark"] .kw-lens--surface{background:var(--ink-soft,#1c2420);' +
      'box-shadow:0 1px 2px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.07);}' +
    '.kw-lens--paper{background:rgba(247,245,240,0.13);' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,0.35),inset 0 0 0 1px rgba(255,255,255,0.07);}' +
    /* tab rows whose chips are rounded-rect, not full pills */
    '.resv-tabs .kw-lens,.kds-pills .kw-lens,.pds-modes .kw-lens,' +
      '.pds-zone-tabs .kw-lens,.sc-pills .kw-lens,.kw-menu-tabs .kw-lens,' +
      '.kx-tabs .kw-lens{border-radius:9px;}' +
    /* the lens carries the active fill — the item itself goes transparent */
    '.dr-pills[data-kw-lens] .dr-pill.on{background:transparent;box-shadow:none;}' +
    '.resv-tabs[data-kw-lens] .resv-tab.on{background:transparent;box-shadow:none;}' +
    '.kds-pills[data-kw-lens] .kds-pill.on{background:transparent;box-shadow:none;}' +
    '.pds-modes[data-kw-lens] .pds-mode.active{background:transparent;box-shadow:none;}' +
    '.pds-zone-tabs[data-kw-lens] .pds-zone.active{background:transparent;box-shadow:none;}' +
    '.sc-pills[data-kw-lens] .sc-pill.on{background:transparent;box-shadow:none;}' +
    '.kw-menu-tabs[data-kw-lens] .kw-menu-tab.on{background:transparent;box-shadow:none;}' +
    '.kx-tabs[data-kw-lens] .kx-tab.on{background:transparent;box-shadow:none;}' +
    /* the lens replaces the landing tabs\' old static ::after indicator */
    '.audience-tabs[data-kw-lens]::after{display:none !important;}' +
    '@media (prefers-reduced-motion:reduce){.kw-lens{transition:none;}}';

  var attached = [];

  function injectCss() {
    if (document.getElementById('kw-lens-css')) return;
    var st = document.createElement('style');
    st.id = 'kw-lens-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function attach(container, cfg) {
    if (container.__kwLens) return;
    var lens = document.createElement('span');
    lens.className = 'kw-lens kw-lens--' + cfg.skin;
    lens.setAttribute('aria-hidden', 'true');
    container.insertBefore(lens, container.firstChild);
    container.setAttribute('data-kw-lens', cfg.skin);

    var st = { l: null, w: null };
    function place(instant) {
      var list = container.querySelectorAll(cfg.item);
      var act = null;
      for (var i = 0; i < list.length; i++) {
        if (cfg.active(list[i])) { act = list[i]; break; }
      }
      if (!act || container.offsetWidth === 0) return;
      /* offsetLeft/Top are relative to the (positioned) container — immune to
       * page scroll AND to the row's own horizontal scroll, RTL included. */
      var l = act.offsetLeft, t = act.offsetTop, w = act.offsetWidth, h = act.offsetHeight;
      lens.style.top = t + 'px';
      lens.style.height = h + 'px';
      var set = function (x, width) {
        lens.style.transform = 'translateX(' + x + 'px)';
        lens.style.width = width + 'px';
      };
      lens.style.opacity = '1';
      if (instant || st.l === null) {
        lens.style.transition = 'none'; set(l, w);
        void lens.offsetWidth; lens.style.transition = '';
      } else if (l !== st.l || w !== st.w) {
        var spanL = Math.min(st.l, l);
        var spanW = Math.max(st.l + st.w, l + w) - spanL;
        set(spanL, spanW);                       /* phase 1 · stretch across */
        setTimeout(function () { set(l, w); }, 115); /* phase 2 · settle */
      }
      st.l = l; st.w = w;
    }

    container.__kwLens = { place: place };
    attached.push(container);

    /* Follow active-state changes made by ANY existing handler. */
    new MutationObserver(function () { place(false); })
      .observe(container, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-selected'] });
    /* Reposition silently when the row itself resizes or first becomes visible. */
    if (window.ResizeObserver) {
      new ResizeObserver(function () { place(true); }).observe(container);
    }
    requestAnimationFrame(function () { place(true); });
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    GROUPS.forEach(function (cfg) {
      if (root.matches && root.matches(cfg.sel)) attach(root, cfg);
      root.querySelectorAll(cfg.sel).forEach(function (el) { attach(el, cfg); });
    });
  }

  function placeAll(instant) {
    attached.forEach(function (c) {
      if (document.contains(c)) c.__kwLens.place(instant);
    });
  }

  function init() {
    injectCss();
    scan(document);
    /* Late-mounted groups (drawer tab rows, re-rendered sections). */
    var queued = false;
    new MutationObserver(function (muts) {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', function () { placeAll(true); });
    window.addEventListener('kiwi:langchange', function () {
      requestAnimationFrame(function () { placeAll(true); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiLens = { rescan: function () { scan(document); }, refresh: function () { placeAll(true); } };
})();
