/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · growth kit — shared premium primitives for the Croissance features.
 *
 * One source of truth for the things that make a surface feel 10/10 rather than
 * average: a real branded QR (not a raw grid), the hero's atmosphere/glow, an
 * Instrument-Serif display accent, refined toggles/segmented controls, and a
 * staggered reveal on open. Loaded once; used by growth-ordering/qr/crm/giftcards.
 *
 * window.KiwiKit.qr(size, opts)  → branded QR markup (string)
 * window.KiwiKit.reveal(rootEl)  → stagger-in the direct children of rootEl
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ── A branded, real-looking QR: three finder patterns + a deterministic
   *    module field with rounded modules, a quiet zone, and the Kiwi mark in
   *    the centre. Decorative (demo), but indistinguishable from a real one. ── */
  function qr(size, opts) {
    opts = opts || {};
    const n = 25, px = size || 128, m = px / n;
    /* Literal ink, not the token: the QR tile is deliberately theme-locked
     * white, and var(--ink) inverts to near-white in dark mode (blank QR). */
    const dark = opts.color || '#0A0F0D';
    const inFinder = (r, c, fr, fc) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7;
    const finderOn = (r, c, fr, fc) => {
      const rr = r - fr, cc = c - fc;
      if (rr === 0 || rr === 6 || cc === 0 || cc === 6) return true;
      return rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
    };
    let rects = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let on;
      if (inFinder(r, c, 0, 0)) on = finderOn(r, c, 0, 0);
      else if (inFinder(r, c, 0, n - 7)) on = finderOn(r, c, 0, n - 7);
      else if (inFinder(r, c, n - 7, 0)) on = finderOn(r, c, n - 7, 0);
      else if ((r < 8 && c < 8) || (r < 8 && c > n - 9) || (r > n - 9 && c < 8)) on = false;
      else on = ((r * 31 + c * 17 + r * c * 7) % 11) < 5;   // deterministic field
      if (on) rects += `<rect x="${(c * m).toFixed(2)}" y="${(r * m).toFixed(2)}" width="${(m * 0.84).toFixed(2)}" height="${(m * 0.84).toFixed(2)}" rx="${(m * 0.3).toFixed(2)}"/>`;
    }
    return `<span class="gk-qr" style="width:${px}px;height:${px}px;">` +
      `<svg viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" fill="${dark}" aria-hidden="true">${rects}</svg>` +
      `<span class="gk-qr-mark"></span></span>`;
  }

  /* Stagger-reveal the direct children of a container (called after a drawer
   * paints). Respects reduced-motion via the CSS guard below. */
  function reveal(root) {
    if (!root) return;
    const kids = Array.prototype.slice.call(root.children);
    kids.forEach((el, i) => {
      el.style.setProperty('--gk-i', i);
      el.classList.add('gk-rise');
    });
  }

  const CSS = `
  /* ── Branded QR ── */
  .gk-qr { position:relative; display:inline-flex; align-items:center; justify-content:center;
    background:var(--surface); border-radius:16px; padding:11px;
    box-shadow:0 4px 16px -6px rgba(10,15,13,.22), inset 0 0 0 1px rgba(10,15,13,.05); }
  .gk-qr svg { display:block; }
  .gk-qr-mark { position:absolute; inset:0; margin:auto; width:24%; height:24%; border-radius:50%;
    background:var(--atlas); box-shadow:0 0 0 5px #fff, 0 2px 6px -2px rgba(10,15,13,.4); }
  .gk-qr-mark::after { content:''; position:absolute; inset:0; margin:auto; width:34%; height:34%;
    background:var(--mint); border-radius:50%; }

  /* ── Hero atmosphere — the deep-green glow used on the dashboard hero ── */
  .gk-hero { position:relative; overflow:hidden; color:var(--paper);
    background:linear-gradient(152deg, var(--riad) 0%, var(--atlas) 78%); border-radius:20px; }
  .gk-hero::before { content:''; position:absolute; inset:0; pointer-events:none;
    background:radial-gradient(120% 90% at 88% -10%, rgba(125,242,176,.20), transparent 55%); }
  .gk-hero::after { content:''; position:absolute; inset:0; pointer-events:none; opacity:.5;
    background-image:radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px); background-size:5px 5px; }
  .gk-hero > * { position:relative; }

  /* ── Editorial display accent (Instrument Serif) ── */
  .gk-serif { font-family:var(--serif); font-weight:400; letter-spacing:-.01em; font-feature-settings:"tnum" 1; }

  /* ── Premium toggle (replaces the flat checkbox toggles) ── */
  .gk-tg { position:relative; width:42px; height:24px; border-radius:999px; flex:0 0 auto;
    background:var(--n-300); cursor:pointer; transition:background .2s cubic-bezier(.32,.72,0,1); border:0; padding:0; }
  .gk-tg::after { content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
    background:var(--surface); box-shadow:0 1px 3px rgba(10,15,13,.3); transition:transform .2s cubic-bezier(.32,.72,0,1); }
  .gk-tg.on { background:var(--atlas); }
  .gk-tg.on::after { transform:translateX(18px); }
  /* On the dark hero, use mint for contrast against the green gradient. */
  .gk-hero .gk-tg { background:rgba(255,255,255,.22); }
  .gk-hero .gk-tg.on { background:var(--mint); }
  .gk-hero .gk-tg.on::after { background:var(--riad); }

  /* ── Staggered rise-in ── */
  @keyframes gkRise { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  .gk-rise { opacity:0; animation:gkRise .55s cubic-bezier(.32,.72,0,1) forwards; animation-delay:calc(var(--gk-i, 0) * 55ms); }
  @media (prefers-reduced-motion: reduce) { .gk-rise { animation:none; opacity:1; } }

  /* QR stays dark-on-white in every theme (a white tile pops on dark surfaces). */
  html[data-theme="dark"] .gk-qr { box-shadow:0 8px 22px -8px rgba(0,0,0,.6), inset 0 0 0 1px rgba(10,15,13,.06); }
  `;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  window.KiwiKit = { qr, reveal };
})();
