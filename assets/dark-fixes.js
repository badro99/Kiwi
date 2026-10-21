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
  html[data-theme="dark"] .dkfix-text  { color: var(--ink) !important; }
  html.dkfix-instant .dkfix-card, html.dkfix-instant .dkfix-bd, html.dkfix-instant .dkfix-text { transition: none !important; }`;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  const parse = (s) => { const m = (s || '').match(/[\d.]+/g) || []; return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m[3] === undefined ? 1 : +m[3]]; };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const sat = (p) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
  const isNearWhite = (p) => p[3] > 0.85 && Math.min(p[0], p[1], p[2]) >= 234 && sat(p) <= 12;
  // Any dark text that has ended up on a dark background is invisible regardless of hue —
  // so this also covers deep brand colours (e.g. --riad green) gone dark-on-dark, not just greys.
  const isDarkText = (p) => p[3] > 0.5 && lum(p) < 0.25 && sat(p) <= 120;
  /* Couleur de fond effective : on remonte jusqu'au premier ancêtre peint.
   * Un dégradé est un fond peint : `background-color` reste transparent sur un
   * bouton rempli par `linear-gradient(...)`, et la remontée filait jusqu'à la
   * barre noire — le libellé encre du bouton Kiwi AI (menthe) passait pour du
   * sombre-sur-sombre et était forcé en blanc. Le premier arrêt opaque du
   * dégradé sert de teinte de référence. */
  function gradStop(img) {
    if (!img || img === 'none' || img.indexOf('gradient(') < 0) return null;
    const m = img.match(/rgba?\([^)]*\)/g) || [];
    for (const c of m) { const p = parse(c); if (p[3] >= 0.6) return p; }
    return null;
  }
  function effBg(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      const p = parse(cs.backgroundColor); if (p[3] >= 0.6) return p;
      const g = gradStop(cs.backgroundImage); if (g) return g;
      n = n.parentElement;
    }
    return [11, 18, 16, 1];
  }
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
  /* `.ai-btn` : le bouton Kiwi AI de la barre — la peau Vexel le remplit en
   * menthe avec un libellé encre, volontairement ; rien à corriger dessus. */
  /* `.bqx-vr-bc svg` : le code-barres d'une variante, posé sur du papier en
   * sombre pour rester lisible, comme l'étiquette imprimée. L'assombrir, c'est
   * remettre des barres encre sur fond noir. */
  const SKIP = '.gk-qr, .btn-slim, .kc-sw, mark, .ai-btn, .bqx-vr-bc svg';

  /* Each pass reads every element first, then writes the tags. Reading a
   * computed style right after a class was added forces the browser to
   * restyle the page again; interleaving the two made a pass cost one restyle
   * per tag. The decisions are the same: pass 1 reads backgrounds and borders,
   * which tagging a neighbour never changes, and pass 2 runs after pass 1 is
   * applied so effBg sees the darkened cards. A child whose ink colour comes
   * from a parent that pass 2 tags is tagged too, with the same var(--ink):
   * the colour that paints does not change. */
  function elementsOf(root) {
    return root === document.body ? root.querySelectorAll('*') : [root, ...root.querySelectorAll('*')];
  }
  function fixAll(roots) {
    if (!roots.length || document.documentElement.getAttribute('data-theme') !== 'dark') return;
    const lists = roots.map(elementsOf);
    // Pass 1: near-white card/panel/input backgrounds, and their light borders.
    const cards = [], borders = [];
    lists.forEach((els) => els.forEach((el) => {
      if (el.closest(SKIP)) return;              // QR tiles + already-themed controls
      const cs = getComputedStyle(el);
      if (isNearWhite(parse(cs.backgroundColor))) cards.push(el);
      if (parseFloat(cs.borderTopWidth) > 0 && isNearWhite(parse(cs.borderTopColor))) borders.push(el);
    }));
    cards.forEach((el) => el.classList.add('dkfix-card'));
    borders.forEach((el) => el.classList.add('dkfix-bd'));
    // Pass 2: dark text now sitting on a dark background.
    const texts = [];
    lists.forEach((els) => els.forEach((el) => {
      if (el.closest(SKIP) || !hasDirectText(el)) return;
      const col = parse(getComputedStyle(el).color);
      if (isDarkText(col) && lum(effBg(el)) < 0.22) texts.push(el);
    }));
    texts.forEach((el) => el.classList.add('dkfix-text'));
  }
  function fix(root) { if (root) fixAll([root]); }

  const MARKS = ['dkfix-card', 'dkfix-bd', 'dkfix-text'];

  // A tag decided against a dark background is wrong once the page is light again
  // — and wrong a second time if the surface goes back to dark while still wearing
  // it, because the pass then reads its own repaint instead of the real colour.
  function clear(root) {
    if (!root || root.nodeType !== 1) return;
    const marked = root.matches('.dkfix-card, .dkfix-bd, .dkfix-text')
      ? [root, ...root.querySelectorAll('.dkfix-card, .dkfix-bd, .dkfix-text')]
      : root.querySelectorAll('.dkfix-card, .dkfix-bd, .dkfix-text');
    marked.forEach((el) => el.classList.remove(...MARKS));
  }

  // Start from untagged computed styles on every theme transition. Run the dark
  // pass twice because inner content can render one frame after its surface.
  /* The pass runs inside the MutationObserver callback, i.e. before the browser
   * paints the new surface. It used to wait 30 to 150 ms, and every drawer,
   * page and card painted white first, then flipped to dark (Orders summary
   * cards, 2026-10-10). Transitions are off for the frame the tags land in,
   * or a card with `transition: all` would fade from white instead. */
  /* The class stays on until two frames pass with no new tagging. It used to
   * be added and removed per pass: during a count-up animation that is
   * hundreds of toggles a second, and a later pass could lose it mid-frame. */
  let instantSeq = 0, instantWaiting = false;
  function instant() {
    const html = document.documentElement;
    if (!html || !html.classList) return;
    instantSeq++;
    if (!html.classList.contains('dkfix-instant')) html.classList.add('dkfix-instant');
    if (instantWaiting) return;
    instantWaiting = true;
    const settle = (seq) => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (seq !== instantSeq) { settle(instantSeq); return; }
      instantWaiting = false;
      html.classList.remove('dkfix-instant');
    }));
    settle(instantSeq);
  }

  /* The second look, one frame later, is shared: every root themed during a
   * frame is looked at again in one batch, so the page is restyled once for
   * all of them instead of once per root. */
  const again = new Set();
  let againQueued = false;
  function lookAgain(root) {
    again.add(root);
    if (againQueued) return;
    againQueued = true;
    requestAnimationFrame(() => {
      againQueued = false;
      const roots = Array.from(again);
      again.clear();
      fixAll(roots.filter((n) => document.contains(n)
        && !roots.some((r) => r !== n && r.contains && r.contains(n))));
    });
  }

  function run(root) {
    clear(root);
    if (document.documentElement.getAttribute('data-theme') !== 'dark') return;
    instant();
    fix(root);
    lookAgain(root);
  }

  /* Surfaces (overlays, the live order drawer) are children of the body, so
   * the subtree watcher below themes them as they open. A second watcher used
   * to run them again in the same task. */

  // Unguarded on purpose: the light transition is the one that has to strip the
  // tags, so run() decides — not the caller.
  new MutationObserver(() => {
    setTimeout(() => run(document.body), 30);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // The fullpage destination views (Menu, Stock, KDS, Tables, Conformité, …)
  // mount inside .container — NOT as direct .app children — so this watches the
  // whole app subtree. To keep it cheap it re-themes ONLY the subtrees that were
  // actually added (deduped, debounced), never a full-app rescan per mutation.
  /* The native app mounts .app after this script runs, and a null here meant
   * no live pass at all: new screens waited for the next theme change to be
   * fixed. The body is always there and covers .app and every overlay. */
  const app = document.body;
  if (app) {
    /* One callback per task already batches every node that task added, so
     * no debounce: deduped against ancestors, then themed before paint. */
    new MutationObserver((muts) => {
      if (document.documentElement.getAttribute('data-theme') !== 'dark') return;
      const pending = new Set();
      muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) pending.add(n); }));
      if (!pending.size) return;
      const roots = Array.from(pending);
      roots.forEach((n) => {
        if (!document.contains(n)) return;
        if (roots.some((r) => r !== n && r.contains(n))) return; // covered by an ancestor root
        run(n);
      });
    }).observe(app, { childList: true, subtree: true });
  }

  window.KiwiDarkFix = () => run(document.body);
})();
