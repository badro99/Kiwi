/* ═══════════════════════════════════════════════════════════════════════
   KIWI · PREMIUM BRAND OVERLAY (sidebar icon injector)
   ─────────────────────────────────────────────────────────────────────
   Replaces the generic stroke-SVGs in the sidebar with Moroccan PNG
   icons from /assets/icons/ . Mapping is by data-nav / data-action
   so it stays decoupled from order or markup tweaks.

   The vertical section ([data-vertical-section]) is re-rendered by
   venues.js whenever the merchant switches venue (restaurant ↔
   boutique ↔ spa). A MutationObserver on the sidebar makes the
   injection idempotent — it runs on every re-render, only swapping
   the SVGs that haven't been swapped yet.

   Black PNGs are recolored to mint via CSS filter chain in
   kiwi-premium.css (.nav-ico).
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Map data-nav → icon filename in /assets/icons/
  // Covers all three verticals: restaurant, boutique, spa.
  const NAV_ICONS = {
    /* ── core nav (always present) ── */
    accueil:       'kasbah.png',           // home / restaurant building
    transactions:  'tap-to-pay.png',       // contactless flow
    terminaux:     'terminal-hand.png',    // POS in hand
    reglements:    'dirham-bill.png',      // payouts in MAD
    conformite:    'vault.png',            // compliance / safe
    equipe:        'person.png',           // team
    payroll:       'clock.png',            // shifts / time
    reservations:  'storefront.png',       // bookings

    /* ── restaurant vertical ── */
    tables:        'restaurant-table.png',
    menu:          'plate.png',
    kds:           'lightning.png',        // kitchen display, real-time
    stock:         'souk-basket.png',      // ingredients, market basket

    /* ── boutique vertical ── */
    inventory:     'souk-basket.png',      // shop inventory
    categories:    'storefront.png',       // shop categories
    promos:        'star.png',             // offers
    returns:       'handshake.png',        // returns / exchanges

    /* ── spa vertical ── */
    appointments:  'clock.png',            // calendar
    services:      'tea-glass.png',        // hospitality service
    practitioners: 'person.png',           // practitioners
    clients:       'merchant.png',         // client files
  };

  // Map data-action → icon filename
  const ACTION_ICONS = {
    'kiwi-compte':  'vault.png',
    'capital':      'briefcase.png',
    'loyalty':      'star.png',
    'payment-link': 'handshake.png',
  };

  function iconForLink(a) {
    const key = a.dataset.nav || a.dataset.action;
    return NAV_ICONS[key] || ACTION_ICONS[key] || null;
  }

  // Inject the PNG icon on every sidebar link that still has its SVG glyph.
  // Idempotent — safe to call any number of times.
  function applyIcons(root) {
    const scope = root || document;
    const links = scope.querySelectorAll('.sidebar nav a');
    links.forEach((a) => {
      // Already swapped? skip.
      if (a.querySelector(':scope > .nav-ico')) return;
      const icon = iconForLink(a);
      if (!icon) return;
      const svg = a.querySelector(':scope > svg');
      if (!svg) return;
      const img = new Image(18, 18);
      img.src = 'assets/icons/' + icon;
      img.alt = '';
      img.className = 'nav-ico';
      img.decoding = 'async';
      img.loading = 'eager';
      svg.replaceWith(img);
    });
  }

  // Observe the sidebar so dynamically-injected nav items
  // (vertical section swap on venue change) get their icons too.
  function watchSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const obs = new MutationObserver(() => applyIcons(sidebar));
    obs.observe(sidebar, { childList: true, subtree: true });
  }

  function init() {
    applyIcons();
    watchSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
