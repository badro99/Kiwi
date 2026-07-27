/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · mobile navigation
 * Builds the phone-only chrome: a bottom tab bar and a hamburger that turns
 * the desktop sidebar into an off-canvas menu drawer. Everything is injected
 * once and stays display:none until the phone breakpoint (see mobile.css), so
 * the desktop layout is never touched.
 *
 * The sidebar itself is reused as-is — its nav uses event delegation on
 * `.sidebar nav a`, so sliding it on-screen keeps every handler working.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* Icons — stroked, 24-grid */
  const I = {
    home:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.7V21h14V9.7"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>',
    team:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M3.5 20a5.6 5.6 0 0 1 11 0"/><path d="M16.2 5.3a3.4 3.4 0 0 1 0 5.4M17 20a5.6 5.6 0 0 0-3.2-5"/></svg>',
    menu:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    sale:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    ai:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.9 8.9 0 0 1-4-.9L3 21l1.9-5.5a8.9 8.9 0 0 1-.9-4A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/><path d="M12.5 8.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/></svg>',
  };
  const MERCHANT = 'assets/landing/icons/merchant.png';

  function runHandler(name) {
    const h = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers[name];
    if (typeof h === 'function') { h(); return true; }
    return false;
  }

  ready(function () {
    /* Idempotent — never inject the mobile chrome twice. */
    if (document.querySelector('.kw-tabbar')) return;
    const topbarInner = document.querySelector('.topbar > .topbar-inner');
    if (!topbarInner) return;

    const sidebar = document.querySelector('.sidebar');
    const app = document.querySelector('.app');
    if (sidebar && !sidebar.id) sidebar.id = 'kw-sidebar';
    if (sidebar) sidebar.setAttribute('aria-label', 'Menu principal');

    /* ── Re-home the sidebar so position:fixed actually anchors ──
     * .app carries a transform (reveal/lock animation) → it is a containing
     * block, which would trap a fixed-position sidebar in its coordinate
     * space. On phones the sidebar lives directly under <body>; on desktop
     * it returns to .app as the first grid column. */
    const phoneMq = window.matchMedia('(max-width: 860px)');
    /* aria-hidden only belongs on the sidebar at the phone breakpoint, where
     * it is an off-canvas drawer that is genuinely hidden when closed. On
     * desktop the sidebar is a permanent, visible landmark — leaving an
     * aria-hidden="true" there (a leak from this mobile layer) would drop the
     * entire navigation from assistive tech. */
    function syncSidebarAria() {
      if (!sidebar) return;
      if (phoneMq.matches) sidebar.setAttribute('aria-hidden', String(!isMenuOpen()));
      else sidebar.removeAttribute('aria-hidden');
    }
    function placeSidebar() {
      if (!sidebar || !app) return;
      if (phoneMq.matches) {
        if (sidebar.parentElement !== document.body) document.body.appendChild(sidebar);
      } else if (sidebar.parentElement !== app) {
        app.insertBefore(sidebar, app.firstElementChild);
      }
      syncSidebarAria();
    }
    placeSidebar();
    phoneMq.addEventListener('change', placeSidebar);

    /* ── Hamburger + centred wordmark into the topbar ── */
    topbarInner.insertAdjacentHTML('afterbegin',
      `<button class="kw-hamburger" type="button" aria-label="Ouvrir le menu"
               aria-controls="kw-sidebar" aria-expanded="false">${I.menu}</button>
       <button class="kw-topbar-brand" type="button" aria-label="Revenir en haut du tableau de bord">kiwi<i></i></button>`);
    const hamburger = topbarInner.querySelector('.kw-hamburger');
    /* Tapping the centred wordmark returns to the home dashboard —
     * from any sub-page, not just a scroll-to-top. */
    topbarInner.querySelector('.kw-topbar-brand').addEventListener('click', () => goHome());

    /* ── Backdrop for the off-canvas menu ── */
    const backdrop = document.createElement('div');
    backdrop.className = 'kw-menu-backdrop';
    document.body.appendChild(backdrop);

    /* ── Menu open / close — centralised so aria + focus stay correct ── */
    let lastFocus = null;
    function isMenuOpen() { return document.body.classList.contains('kw-menu-open'); }
    function openMenu() {
      if (isMenuOpen()) return;
      lastFocus = document.activeElement;
      document.body.classList.add('kw-menu-open');
      hamburger.setAttribute('aria-expanded', 'true');
      syncSidebarAria();
      if (sidebar) {
        const first = sidebar.querySelector('nav a, [role="button"]');
        if (first) setTimeout(() => first.focus(), 340);
      }
    }
    function closeMenu() {
      if (!isMenuOpen()) return;
      document.body.classList.remove('kw-menu-open');
      hamburger.setAttribute('aria-expanded', 'false');
      syncSidebarAria();
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
      lastFocus = null;
    }
    function toggleMenu() { isMenuOpen() ? closeMenu() : openMenu(); }

    hamburger.addEventListener('click', toggleMenu);
    backdrop.addEventListener('click', closeMenu);

    /* Close every open drawer / modal / palette cleanly — calling each
     * surface's real close path so the page scroll-lock stays balanced. */
    function closeOverlays() {
      document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => {
        if (typeof b.__kiwiClose === 'function') b.__kiwiClose();
        else b.remove();
      });
      document.querySelectorAll('.kiwi-backdrop').forEach((b) => {
        const btn = b.querySelector('.kiwi-modal-close');
        if (btn) btn.click();   // runs close() → unlockPageScroll()
        /* Sur `document.body` et non sur `document` : la cible de l'événement
         * devient un ÉLÉMENT, et les écouteurs qui filtrent la saisie avec
         * `e.target.matches(...)` ne trébuchent plus. `bubbles` est
         * indispensable — un KeyboardEvent ne remonte pas par défaut, et les
         * écouteurs concernés sont posés sur `document`. */
        else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
    }

    /* Return to the home dashboard from anywhere — closes the menu and any
     * open overlay, activates the real Accueil destination (which re-renders
     * the home view from a sub-page), and scrolls to the top. Shared by the
     * wordmark and the Accueil tab. */
    function goHome() {
      closeMenu(); syncMenuAria();
      closeOverlays();
      const home = document.querySelector('.sidebar nav a[data-nav="accueil"]');
      if (home) {
        home.parentElement.querySelectorAll('a').forEach((a) => a.classList.remove('active'));
        home.classList.add('active');
        home.click();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setActive('accueil');
    }

    /* ── Bottom tab bar — floating Liquid Glass capsule (serveur-app port).
     * Icon-first buttons inside a smoked-glass pill; a bright lens slides and
     * rubber-bands to the active tab. Labels stay in the DOM (sr-only) so the
     * buttons keep their accessible names and i18n. ── */
    const tabbar = document.createElement('nav');
    tabbar.className = 'kw-tabbar';
    tabbar.setAttribute('aria-label', 'Navigation');
    tabbar.insertAdjacentHTML('beforeend', `
      <div class="kw-capsule">
        <span class="kw-tab-pill" aria-hidden="true"></span>
        <button class="kw-tab on" data-kw-tab="accueil" type="button">
          ${I.home}<span class="kw-tab-l" data-i18n="dash.sidebar.home">Accueil</span>
        </button>
        <button class="kw-tab" data-kw-tab="commandes" type="button">
          ${I.orders}<span class="kw-tab-badge" data-kw-badge hidden></span><span class="kw-tab-l" data-i18n="dash.sidebar.orders">Commandes</span>
        </button>
        <button class="kw-tab kw-tab-ai kw-tab-sell" data-kw-tab="vente" type="button" aria-label="Nouvelle vente">
          <span class="kw-tab-ico">${I.sale}</span>
          <span class="kw-tab-l" data-i18n="dash.mobilenav.sale">Vente</span>
        </button>
        <button class="kw-tab" data-kw-tab="ai" type="button" aria-label="Kiwi AI">
          ${I.ai}<span class="kw-tab-l">Kiwi AI</span>
        </button>
        <button class="kw-tab" data-kw-tab="menu" type="button"
                aria-controls="kw-sidebar" aria-expanded="false">
          ${I.menu}<span class="kw-tab-l" data-i18n="dash.mobilenav.menu">Menu</span>
        </button>
      </div>
    `);
    document.body.appendChild(tabbar);
    /* The tab bar is injected after i18n's initial capture, so re-apply the
     * current language to translate its data-i18n labels on first paint
     * (otherwise a non-FR session would show French until the next switch). */
    if (window.KiwiI18n) window.KiwiI18n.setLang(window.KiwiI18n.getLang());

    const tabs = [...tabbar.querySelectorAll('.kw-tab')];
    const menuTab = tabbar.querySelector('[data-kw-tab="menu"]');

    /* ── Sliding highlight lens — the serveur app's rubber-band move:
     * phase 1 stretches the pill to span old + new, phase 2 settles on the
     * target. Instant (no animation) on first paint / resize / RTL flip. ── */
    const capsule = tabbar.querySelector('.kw-capsule');
    const pill = tabbar.querySelector('.kw-tab-pill');
    let pillL = null, pillW = null;
    function movePill(instant) {
      const active = capsule.querySelector('.kw-tab.on');
      if (!active || capsule.offsetWidth === 0) return;  // hidden (desktop) / not laid out
      const capR = capsule.getBoundingClientRect();
      const r = active.getBoundingClientRect();
      const left = Math.round(r.left - capR.left);
      const w = Math.round(r.width);
      const set = (l, width) => {
        pill.style.transform = 'translateX(' + l + 'px)';
        pill.style.width = width + 'px';
      };
      pill.style.opacity = '1';
      if (instant || pillL === null) {
        pill.style.transition = 'none'; set(left, w);
        void pill.offsetWidth; pill.style.transition = '';
      } else if (left !== pillL || w !== pillW) {
        const spanL = Math.min(pillL, left);
        const spanW = Math.max(pillL + pillW, left + w) - spanL;
        set(spanL, spanW);
        setTimeout(() => set(left, w), 115);
      }
      pillL = left; pillW = w;
    }
    window.addEventListener('resize', () => movePill(true));
    phoneMq.addEventListener('change', () => requestAnimationFrame(() => movePill(true)));
    /* RTL/LTR switches flip the geometry — reposition without animating. */
    window.addEventListener('kiwi:langchange', () => requestAnimationFrame(() => movePill(true)));
    requestAnimationFrame(() => movePill(true));

    function setActive(key) {
      tabs.forEach((t) => t.classList.toggle('on', t.dataset.kwTab === key));
      movePill();
    }

    /* ── Live Commandes badge — mirrors the sidebar's orders count ── */
    const badge = tabbar.querySelector('[data-kw-badge]');
    function syncBadge() {
      if (!badge) return;
      const c = document.querySelector('.sidebar a[data-nav="transactions"] .count');
      const v = c && c.textContent.trim();
      if (v) { badge.textContent = v; badge.hidden = false; }
      else badge.hidden = true;
    }
    syncBadge();
    if (window.KiwiVenue && typeof window.KiwiVenue.subscribe === 'function') {
      window.KiwiVenue.subscribe(() => setTimeout(syncBadge, 80));
    }
    /* Keep the menu tab's aria in sync whenever the menu state changes. */
    function syncMenuAria() {
      menuTab.setAttribute('aria-expanded', String(isMenuOpen()));
    }

    tabbar.addEventListener('click', (e) => {
      const tab = e.target.closest('.kw-tab');
      if (!tab) return;
      const key = tab.dataset.kwTab;

      if (key === 'menu') { toggleMenu(); syncMenuAria(); return; }
      closeMenu(); syncMenuAria();

      if (key === 'accueil') {
        goHome();
      } else if (key === 'commandes') {
        runHandler('nav-transactions'); setActive('commandes');
      } else if (key === 'vente') {
        /* The center bead is an ACTION, not a destination — ring up a sale and
         * leave the active tab where it was (the sale modal takes over). */
        runHandler('new-sale');
      } else if (key === 'ai') {
        runHandler('open-assistant'); setActive('ai');
      }
    });

    /* Tapping a destination inside the menu closes the menu. */
    if (sidebar) {
      sidebar.addEventListener('click', (e) => {
        if (e.target.closest('nav a[data-nav]') || e.target.closest('.merchant')) {
          setTimeout(() => { closeMenu(); syncMenuAria(); }, 60);
        }
      });
    }

    /* Esc closes the menu. */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMenuOpen()) { closeMenu(); syncMenuAria(); }
    });

    /* React to drawers opening/closing:
     *  · re-sync the active tab once every overlay is gone
     *  · tag the transactions table so the mobile card-list CSS kicks in
     *    (done here, not in pages.js, to stay inside the mobile layer) */
    function tagTxTables() {
      document.querySelectorAll('.p-table:not(.p-table--tx)').forEach((t) => {
        if (t.querySelector('tr[data-action="tx-detail"]')) t.classList.add('p-table--tx');
      });
    }

    /* Swipe-down-to-dismiss for bottom-sheet drawers — drag the header /
     * grab-handle down; past the threshold the sheet closes, otherwise it
     * springs back. The mobile CSS makes non-fullpage drawers bottom sheets. */
    function wireSheetSwipe(backdrop) {
      if (backdrop.__kwSwipe || backdrop.classList.contains('kiwi-fullpage')) return;
      const drawer = backdrop.querySelector('.kiwi-drawer');
      const head = drawer && drawer.querySelector('.kiwi-drawer-head');
      if (!drawer || !head) return;
      backdrop.__kwSwipe = true;
      let startY = 0, dy = 0, dragging = false;
      head.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY; dy = 0; dragging = true;
        drawer.style.setProperty('transition', 'none', 'important');
      }, { passive: true });
      head.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        dy = Math.max(0, e.touches[0].clientY - startY);
        drawer.style.setProperty('transform', 'translateY(' + dy + 'px)', 'important');
        backdrop.style.opacity = String(Math.max(0, 1 - dy / 520));
      }, { passive: true });
      head.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        drawer.style.removeProperty('transition');
        drawer.style.removeProperty('transform');
        backdrop.style.opacity = '';
        if (dy > 110) {
          if (typeof backdrop.__kiwiClose === 'function') backdrop.__kiwiClose();
          else backdrop.remove();
        }
      });
    }

    /* Observing <body> is unavoidable — drawers/modals/toasts all mount
     * there — but a confetti burst alone fires dozens of mutations. Coalesce
     * every batch into a single rAF-throttled pass. */
    let resyncQueued = false;
    const resync = new MutationObserver(() => {
      if (resyncQueued) return;
      resyncQueued = true;
      requestAnimationFrame(() => {
        resyncQueued = false;
        const anyOverlay = document.querySelector('.kiwi-drawer-backdrop, .kiwi-backdrop');
        if (!anyOverlay && !tabs[0].classList.contains('on')) setActive('accueil');
        tagTxTables();
        syncBadge();
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach(wireSheetSwipe);
      });
    });
    resync.observe(document.body, { childList: true });
    tagTxTables();
  });
})();
