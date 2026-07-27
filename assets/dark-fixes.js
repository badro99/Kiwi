/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · dark-mode completion pass.
 *
 * Several older surfaces (the fullpage destination drawers — Menu, Tables, KDS,
 * Stock, Conformité…) hardcode `background:var(--surface)` on their inner cards instead of
 * using a token, so they stay bright white when the rest of the app is dark —
 * and any token text (var(--ink) → light in dark) becomes light-on-white.
 *
 * Rather than hand-theme dozens of inconsistent surfaces, this does a computed
 * pass when a surface renders in dark mode: it tags genuinely near-white card
 * backgrounds and the neutral-dark text sitting on a dark background. The tags
 * only take effect under html[data-theme="dark"] (see CSS below), so switching
 * back to light auto-reverts with zero cleanup. Colored chips/badges (yellow,
 * mint, etc.) and the branded QR tiles are deliberately left untouched.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const CSS = `
  html[data-theme="dark"] .dkfix-card { background: var(--paper-soft) !important; }
  html[data-theme="dark"] .dkfix-bd   { border-color: var(--n-200) !important; }
  html[data-theme="dark"] .dkfix-text  { color: var(--ink) !important; }`;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  const parse = (s) => { const m = (s || '').match(/[\d.]+/g) || []; return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m[3] === undefined ? 1 : +m[3]]; };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const sat = (p) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
  const isNearWhite = (p) => p[3] > 0.85 && Math.min(p[0], p[1], p[2]) >= 234 && sat(p) <= 12;
  // Any dark text that has ended up on a dark background is invisible regardless of hue —
  // so this also covers deep brand colours (e.g. --riad green) gone dark-on-dark, not just greys.
  const isDarkText = (p) => p[3] > 0.5 && lum(p) < 0.25 && sat(p) <= 120;
  function effBg(el) { let n = el; while (n && n.nodeType === 1) { const p = parse(getComputedStyle(n).backgroundColor); if (p[3] >= 0.6) return p; n = n.parentElement; } return [11, 18, 16, 1]; }
  function hasDirectText(el) { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; }

  // Surfaces the CSS dark system already themes intentionally — never re-touch them.
  // .btn-slim(.primary) is the big one: theme.css gives it a deliberately light fill in
  // dark mode (an inverted button); our near-white test would wrongly clobber it.
  // .kc-sw is the product-colour swatch (assets/color-palette.js): its fill IS the
  // information. The white one is white on purpose, and darkening it turns "Blanc"
  // into a black dot — the one thing a colour picker must never do. It carries its
  // own theme-aware rim, so it needs nothing from this pass.
  /* `mark` porte le morceau que la personne vient de taper dans la recherche.
   * Sa couleur EST son intérêt : repeint en couleur de texte ordinaire, le
   * surlignage disparaît et la ligne redevient un pavé illisible. */
  const SKIP = '.gk-qr, .btn-slim, .kc-sw, mark';

  function fix(root) {
    if (!root || document.documentElement.getAttribute('data-theme') !== 'dark') return;
    const els = root.querySelectorAll('*');
    // Pass 1 — darken near-white card/panel/input backgrounds (and their light borders).
    els.forEach((el) => {
      if (el.closest(SKIP)) return;              // QR tiles + already-themed controls
      const cs = getComputedStyle(el);
      if (isNearWhite(parse(cs.backgroundColor))) el.classList.add('dkfix-card');
      if (parseFloat(cs.borderTopWidth) > 0 && isNearWhite(parse(cs.borderTopColor))) el.classList.add('dkfix-bd');
    });
    // Pass 2 — lighten dark text now sitting on a dark background (the getComputedStyle
    // calls above already flushed pass-1 so effBg is current).
    els.forEach((el) => {
      if (el.closest(SKIP) || !hasDirectText(el)) return;
      const col = parse(getComputedStyle(el).color);
      if (isDarkText(col) && lum(effBg(el)) < 0.22) el.classList.add('dkfix-text');
    });
  }

  // Run twice: pass-2 depends on pass-1's freshly-applied backgrounds, and some
  // surfaces render their inner content a frame late. A second rAF pass settles both.
  function run(root) { fix(root); requestAnimationFrame(() => fix(root)); }

  // Re-theme each surface as it opens (overlays + the live order drawer), and the
  // whole page when dark mode is switched on with surfaces already open.
  const SURFACE = '.kiwi-drawer-backdrop, .kiwi-backdrop';
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.matches && n.matches(SURFACE)) setTimeout(() => run(n), 30);
    }));
  }).observe(document.body, { childList: true });

  new MutationObserver(() => {
    if (document.documentElement.getAttribute('data-theme') === 'dark') setTimeout(() => run(document.body), 30);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // The fullpage destination views (Menu, Stock, KDS, Tables, Conformité, …)
  // mount inside .container — NOT as direct .app children — so this watches the
  // whole app subtree. To keep it cheap it re-themes ONLY the subtrees that were
  // actually added (deduped, debounced), never a full-app rescan per mutation.
  const app = document.querySelector('.app');
  if (app) {
    let t; const pending = new Set();
    new MutationObserver((muts) => {
      if (document.documentElement.getAttribute('data-theme') !== 'dark') return;
      muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) pending.add(n); }));
      if (!pending.size) return;
      clearTimeout(t);
      t = setTimeout(() => {
        const roots = Array.from(pending); pending.clear();
        roots.forEach((n) => {
          if (!document.contains(n)) return;
          if (roots.some((r) => r !== n && r.contains(n))) return; // covered by an ancestor root
          run(n);
        });
      }, 120);
    }).observe(app, { childList: true, subtree: true });
  }

  window.KiwiDarkFix = () => run(document.body);
})();
