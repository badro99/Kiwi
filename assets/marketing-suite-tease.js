/* ═══════════════════════════════════════════════════════════════
 * marketing-suite-tease.js
 * ───────────────────────────────────────────────────────────────
 * Apple-keynote × Adobe Sensei × Robinhood × Linear style
 * "Introducing Kiwi Marketing Suite" full-screen reveal.
 *
 * Trigger: PIN 0505 on the lock screen → after the "Bonjour Rachid"
 *          greeting fully fades (handled by the lock controller),
 *          dashboard.html calls window.KiwiMarketingTease.play().
 *
 * Choreography:
 *   Stage 0  ·  Overlay fade + backdrop blur                 (0 ms)
 *   Stage 1  ·  "INTRODUCING" eyebrow + draw-in line         (300 ms)
 *   Stage 2  ·  Hero title reveal — word by word stagger     (1200 ms)
 *   Stage 3  ·  Title shrinks up + verb rotation showcase    (3500 ms)
 *               Create → Imagine → Design → Post → Run
 *               (the tail "marketing campaigns." stays fixed,
 *                width animates so it never jumps)
 *   Stage 4  ·  Coda: "Bientôt disponible · Kiwi Pro · Été 2026"
 *
 * Top-right "Passer ›" skip + ESC dismiss at any time.
 * Self-contained: own <style> block injected, idempotent play(),
 * clean dismiss() (no leaked listeners or timers).
 * Honors prefers-reduced-motion.
 * ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Re-entrancy guard — installing twice would duplicate <style>. */
  if (window.KiwiMarketingTease && window.KiwiMarketingTease.__installed) return;

  /* ─────────────── CSS ─────────────── */
  const CSS = `
  .kw-msu {
    position: fixed; inset: 0;
    z-index: var(--z-overlay, 600);
    overflow: hidden;
    color: #F7F5F0;
    font-family: 'Inter Tight', system-ui, sans-serif;
    background:
      radial-gradient(ellipse 90vw 70vh at 22% 28%, rgba(125,242,176,0.12), transparent 55%),
      radial-gradient(ellipse 80vw 60vh at 78% 72%, rgba(11,110,79,0.22), transparent 60%),
      linear-gradient(180deg, #04241a 0%, #000 50%, #04241a 100%);
    opacity: 0;
    -webkit-backdrop-filter: blur(0px);
    backdrop-filter: blur(0px);
    transition: opacity 600ms cubic-bezier(0.32, 0.72, 0, 1),
                -webkit-backdrop-filter 600ms cubic-bezier(0.32, 0.72, 0, 1),
                backdrop-filter 600ms cubic-bezier(0.32, 0.72, 0, 1);
    will-change: opacity, backdrop-filter;
  }
  .kw-msu.is-in {
    opacity: 1;
    -webkit-backdrop-filter: blur(24px) saturate(1.2);
    backdrop-filter: blur(24px) saturate(1.2);
  }
  .kw-msu.is-out {
    opacity: 0 !important;
    -webkit-backdrop-filter: blur(0) !important;
    backdrop-filter: blur(0) !important;
    transition-duration: 420ms !important;
  }

  /* ─── Background detail layers ─── */
  .kw-msu__orb {
    position: absolute; inset: -20vmax;
    pointer-events: none;
    background:
      radial-gradient(ellipse at 30% 30%, rgba(125,242,176,0.18), transparent 55%),
      radial-gradient(ellipse at 75% 65%, rgba(11,110,79,0.28), transparent 60%),
      radial-gradient(ellipse at 50% 50%, rgba(5,59,44,0.32), transparent 70%);
    filter: blur(40px);
    opacity: 0.85;
    animation: kw-msu-orb 60s linear infinite;
    will-change: transform;
  }
  @keyframes kw-msu-orb {
    0%   { transform: rotate(0deg)   scale(1); }
    50%  { transform: rotate(180deg) scale(1.08); }
    100% { transform: rotate(360deg) scale(1); }
  }

  .kw-msu__grid {
    position: absolute; inset: 0;
    pointer-events: none;
    opacity: 0.05;
    background-image: radial-gradient(circle, #7DF2B0 0.75px, transparent 0.75px);
    background-size: 24px 24px;
    mask-image: radial-gradient(ellipse 80vw 60vh at center, #000 30%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse 80vw 60vh at center, #000 30%, transparent 75%);
  }

  .kw-msu__scan {
    position: absolute; left: 0; right: 0;
    top: -8%;
    height: 2px;
    pointer-events: none;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(125,242,176,0) 10%,
      rgba(125,242,176,0.18) 40%,
      rgba(125,242,176,0.22) 50%,
      rgba(125,242,176,0.18) 60%,
      rgba(125,242,176,0) 90%,
      transparent 100%);
    opacity: 0.0;
    animation: kw-msu-scan 14s linear infinite;
  }
  @keyframes kw-msu-scan {
    0%   { transform: translateY(0);    opacity: 0; }
    8%   { opacity: 0.22; }
    92%  { opacity: 0.22; }
    100% { transform: translateY(120vh); opacity: 0; }
  }

  .kw-msu__vignette {
    position: absolute; inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse at center,
      transparent 40%,
      rgba(0,0,0,0.55) 100%);
  }

  /* ─── Skip button ─── */
  .kw-msu-skip {
    position: absolute;
    top: 24px; right: 28px;
    padding: 10px 14px;
    background: transparent;
    border: 0;
    color: #F7F5F0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    opacity: 0;
    transition: opacity 600ms cubic-bezier(0.32, 0.72, 0, 1), color 220ms ease;
    z-index: 2;
    border-radius: 6px;
  }
  .kw-msu.is-in .kw-msu-skip {
    opacity: 0.55;
  }
  .kw-msu-skip:hover, .kw-msu-skip:focus-visible {
    opacity: 1;
    outline: none;
    color: #7DF2B0;
  }
  .kw-msu-skip:focus-visible {
    box-shadow: 0 0 0 1px rgba(125,242,176,0.4);
  }
  .kw-msu-skip__chev {
    display: inline-block;
    margin-left: 4px;
    transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .kw-msu-skip:hover .kw-msu-skip__chev {
    transform: translateX(3px);
  }

  /* ─── Stage container (centered composition) ─── */
  .kw-msu__stage {
    position: absolute; inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 6vw;
    text-align: center;
    z-index: 1;
  }

  /* Ambient ring behind title */
  .kw-msu__ring {
    position: absolute;
    width: min(680px, 60vmin);
    height: min(680px, 60vmin);
    border-radius: 50%;
    border: 1px solid rgba(125,242,176,0.08);
    box-shadow: 0 0 80px rgba(125,242,176,0.08) inset,
                0 0 60px rgba(125,242,176,0.05);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 1200ms cubic-bezier(0.16, 1, 0.3, 1) 600ms;
    pointer-events: none;
  }
  .kw-msu__ring.is-in {
    opacity: 1;
    animation: kw-msu-ring-pulse 4s ease-in-out infinite;
  }
  .kw-msu__ring.is-pulse {
    animation:
      kw-msu-ring-flash 380ms cubic-bezier(0.32, 0.72, 0, 1),
      kw-msu-ring-pulse 4s ease-in-out infinite 380ms;
  }
  @keyframes kw-msu-ring-pulse {
    0%, 100% { transform: scale(0.95); opacity: 0.85; }
    50%      { transform: scale(1.05); opacity: 1; }
  }
  @keyframes kw-msu-ring-flash {
    0%   { box-shadow: 0 0 80px rgba(125,242,176,0.08) inset, 0 0 60px rgba(125,242,176,0.05); }
    35%  { box-shadow: 0 0 140px rgba(125,242,176,0.28) inset, 0 0 140px rgba(125,242,176,0.22); }
    100% { box-shadow: 0 0 80px rgba(125,242,176,0.08) inset, 0 0 60px rgba(125,242,176,0.05); }
  }

  /* ─── Eyebrow ─── */
  .kw-msu__eyebrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
    opacity: 0;
    transform: translateY(8px);
    filter: blur(6px);
    transition: opacity 700ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 700ms cubic-bezier(0.16, 1, 0.3, 1),
                filter 700ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .kw-msu__eyebrow.is-in {
    opacity: 1;
    transform: none;
    filter: blur(0);
  }
  .kw-msu__eyebrow-text {
    font-family: 'Inter Tight', system-ui, sans-serif;
    font-weight: 500;
    font-size: clamp(18px, 1.6vw, 26px);
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: #7DF2B0;
    text-shadow: 0 0 22px rgba(125,242,176,0.32);
  }
  .kw-msu__eyebrow-line {
    width: 56px;
    height: 1.5px;
    background: linear-gradient(90deg, transparent, #7DF2B0, transparent);
    box-shadow: 0 0 14px rgba(125,242,176,0.6);
    transform: scaleX(0);
    transition: transform 400ms cubic-bezier(0.32, 0.72, 0, 1) 200ms;
  }
  .kw-msu__eyebrow.is-in .kw-msu__eyebrow-line {
    transform: scaleX(1);
  }

  /* ─── Hero title ─── */
  .kw-msu__title {
    margin: 0;
    font-family: 'Inter Tight', system-ui, sans-serif;
    font-weight: 400;
    font-size: clamp(56px, 7vw, 128px);
    line-height: 1.02;
    letter-spacing: -0.04em;
    color: #F7F5F0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.22em;
    justify-content: center;
    transform-origin: 50% 50%;
    transition: transform 800ms cubic-bezier(0.32, 0.72, 0, 1),
                opacity 600ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .kw-msu__title-word {
    display: inline-block;
    opacity: 0;
    transform: translateY(20px) scale(0.96);
    filter: blur(8px);
    transition: opacity 900ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 900ms cubic-bezier(0.16, 1, 0.3, 1),
                filter 900ms cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity, transform, filter;
  }
  .kw-msu__title-word.is-in {
    opacity: 1;
    transform: none;
    filter: blur(0);
  }
  .kw-msu__title-word--accent {
    font-family: 'Instrument Serif', 'Inter Tight', serif;
    color: #7DF2B0;
    text-shadow: 0 0 28px rgba(125,242,176,0.3);
    letter-spacing: -0.02em;
  }
  /* Shrunken state — title slides up + scales down ahead of the verb showcase. */
  .kw-msu__title.is-shrunk {
    transform: translateY(-26vh) scale(0.6);
    opacity: 0.78;
  }

  /* ─── Verb showcase line ─── */
  .kw-msu__verbline {
    position: absolute;
    left: 50%; top: 50%;
    transform: translate(-50%, 4%);
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.22em;
    font-family: 'Inter Tight', system-ui, sans-serif;
    font-weight: 400;
    font-size: clamp(36px, 4.6vw, 78px);
    line-height: 1.0;
    letter-spacing: -0.03em;
    color: #F7F5F0;
    opacity: 0;
    transition: opacity 600ms cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
    will-change: opacity, transform;
  }
  .kw-msu__verbline.is-in {
    opacity: 1;
  }
  .kw-msu__verb {
    display: inline-block;
    position: relative;
    overflow: visible;
    text-align: right;
    /* Same family as the tail so verb + tail read as one sentence,
       same baseline math, no visual disconnect. Weight 500 + mint
       gives the emphasis without the Instrument Serif italic feel. */
    font-family: 'Inter Tight', system-ui, sans-serif;
    font-weight: 500;
    font-style: normal;
    color: #7DF2B0;
    text-shadow: 0 0 36px rgba(125,242,176,0.28);
    letter-spacing: -0.03em;
    line-height: 1;
    vertical-align: baseline;
    /* Phantom glyph (::before, visibility:hidden) gives the container a real
       text line-box and baseline — without it, absolute-positioned tokens
       leave the container baseline-less and the verb drops below the tail. */
    transition: width 320ms cubic-bezier(0.32, 0.72, 0, 1);
    will-change: width;
  }
  .kw-msu__verb::before {
    content: 'M';
    display: inline-block;
    width: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .kw-msu__verb-token {
    position: absolute;
    right: 0;
    bottom: 0;
    display: inline-block;
    white-space: nowrap;
    line-height: 1;
    transform: translateY(0);
    opacity: 1;
    filter: blur(0);
    will-change: transform, opacity, filter;
  }
  .kw-msu__verb-token.is-out {
    transition: transform 260ms cubic-bezier(0.6, 0, 0.4, 1),
                opacity 260ms cubic-bezier(0.6, 0, 0.4, 1),
                filter 260ms cubic-bezier(0.6, 0, 0.4, 1);
    transform: translateY(-24px);
    opacity: 0;
    filter: blur(10px);
  }
  .kw-msu__verb-token.is-incoming {
    transform: translateY(28px);
    opacity: 0;
    filter: blur(10px);
  }
  .kw-msu__verb-token.is-settled {
    transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1),
                opacity 280ms cubic-bezier(0.16, 1, 0.3, 1),
                filter 280ms cubic-bezier(0.16, 1, 0.3, 1);
    transform: translateY(0);
    opacity: 1;
    filter: blur(0);
  }
  .kw-msu__verb-token.is-pulse {
    animation: kw-msu-verb-pulse 1.4s ease-in-out infinite;
  }
  @keyframes kw-msu-verb-pulse {
    0%, 100% { transform: translateY(0) scale(1); }
    50%      { transform: translateY(0) scale(1.02); }
  }
  .kw-msu__tail {
    display: inline-block;
    color: #F7F5F0;
    opacity: 0;
    transform: translateX(-12px);
    transition: opacity 700ms cubic-bezier(0.16, 1, 0.3, 1) 80ms,
                transform 700ms cubic-bezier(0.16, 1, 0.3, 1) 80ms;
  }
  .kw-msu__verbline.is-in .kw-msu__tail {
    opacity: 1;
    transform: none;
  }
  /* Off-screen measuring span — needs to compute true natural width. */
  .kw-msu__measure {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    white-space: nowrap;
    font-family: 'Instrument Serif', 'Inter Tight', serif;
    letter-spacing: -0.02em;
    left: -9999px; top: -9999px;
  }

  /* ─── Coda ─── */
  .kw-msu__coda {
    position: absolute;
    left: 50%;
    bottom: 14vh;
    transform: translate(-50%, 8px);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(247,245,240,0.55);
    opacity: 0;
    transition: opacity 800ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 800ms cubic-bezier(0.16, 1, 0.3, 1);
    text-align: center;
    white-space: nowrap;
  }
  .kw-msu__coda.is-in {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  .kw-msu__coda-sep {
    color: rgba(125,242,176,0.55);
    margin: 0 8px;
  }

  /* ─── Reduced motion ─── */
  @media (prefers-reduced-motion: reduce) {
    .kw-msu,
    .kw-msu *,
    .kw-msu *::before,
    .kw-msu *::after {
      animation-duration: 80ms !important;
      animation-delay: 0ms !important;
      transition-duration: 120ms !important;
      transition-delay: 0ms !important;
      filter: none !important;
    }
    .kw-msu__orb { animation: none !important; }
    .kw-msu__scan { display: none !important; }
  }
  `;

  /* ─────────────── DOM templates ─────────────── */
  const VERBS = ['Create.', 'Imagine.', 'Design.', 'Post.', 'Run.'];

  /* Stage timing (ms, all relative to play() start). Reduced motion
   * keeps the structure but shortens each beat dramatically. */
  function timings(reduced) {
    if (reduced) {
      return {
        eyebrowIn:   80,
        titleIn:     180,
        titleStagger: 40,
        shrinkAt:    900,
        verblineIn:  1000,
        firstVerbAt: 1100,
        verbHold:    420,
        verbCross:   100,
        codaAt:      1100 + 420 * VERBS.length + 200,
        autoEnd:     1100 + 420 * VERBS.length + 1800,
      };
    }
    return {
      eyebrowIn:   300,
      titleIn:     1200,
      titleStagger: 180,
      shrinkAt:    3500,
      verblineIn:  3600,
      firstVerbAt: 4100,
      verbHold:    1000,
      verbCross:   250,
      codaAt:      9500,
      autoEnd:     14500,
    };
  }

  /* ─────────────── State ─────────────── */
  let installed = false;
  let playing = false;
  let dismissing = false;
  let overlay = null;
  let timers = [];
  let listeners = [];
  let verbCycleAbort = false;

  function setTimer(fn, ms) {
    const id = setTimeout(() => {
      timers = timers.filter(t => t !== id);
      try { fn(); } catch (e) { /* swallow — tease is non-critical */ }
    }, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(id => clearTimeout(id));
    timers = [];
  }
  function on(target, ev, handler, opts) {
    target.addEventListener(ev, handler, opts);
    listeners.push([target, ev, handler, opts]);
  }
  function offAll() {
    listeners.forEach(([t, ev, h, o]) => t.removeEventListener(ev, h, o));
    listeners = [];
  }

  function ensureStyleInjected() {
    if (document.querySelector('style[data-kw-msu-style]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-kw-msu-style', '');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildOverlay() {
    const root = document.createElement('div');
    root.className = 'kw-msu';
    root.setAttribute('data-kw-msu', '');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Présentation : Kiwi Marketing Suite');
    root.innerHTML = `
      <div class="kw-msu__orb"></div>
      <div class="kw-msu__grid"></div>
      <div class="kw-msu__scan"></div>
      <div class="kw-msu__vignette"></div>
      <button type="button" class="kw-msu-skip" data-kw-msu-skip>
        Passer<span class="kw-msu-skip__chev">›</span>
      </button>
      <div class="kw-msu__stage">
        <div class="kw-msu__ring" data-ring></div>
        <div class="kw-msu__eyebrow" data-eyebrow>
          <span class="kw-msu__eyebrow-text">Introducing</span>
          <span class="kw-msu__eyebrow-line"></span>
        </div>
        <h1 class="kw-msu__title" data-title>
          <span class="kw-msu__title-word">Kiwi</span><span class="kw-msu__title-word kw-msu__title-word--accent">Marketing</span><span class="kw-msu__title-word">Suite</span>
        </h1>
        <div class="kw-msu__verbline" data-verbline aria-hidden="true">
          <span class="kw-msu__verb" data-verb><span class="kw-msu__verb-token is-settled" data-verb-token>Create.</span></span>
          <span class="kw-msu__tail">marketing campaigns.</span>
        </div>
        <div class="kw-msu__coda" data-coda>
          Bientôt disponible<span class="kw-msu__coda-sep">·</span>Kiwi Pro<span class="kw-msu__coda-sep">·</span>Été 2026
        </div>
      </div>
      <span class="kw-msu__measure" data-measure aria-hidden="true"></span>
    `;
    return root;
  }

  /* Measure a verb's natural rendered width against the current font
   * scale. The measure node mirrors font-style/weight/letter-spacing so
   * width matches what will actually paint. */
  function measureVerb(word) {
    const measure = overlay.querySelector('[data-measure]');
    const verbToken = overlay.querySelector('[data-verb-token]');
    if (!measure || !verbToken) return 0;
    const styles = getComputedStyle(verbToken);
    measure.style.fontSize = styles.fontSize;
    measure.style.fontWeight = styles.fontWeight;
    measure.style.letterSpacing = styles.letterSpacing;
    measure.textContent = word;
    /* Serif glyphs can paint a hair past advance-width — small safety pad. */
    const w = measure.getBoundingClientRect().width;
    return Math.ceil(w) + 2;
  }

  /* Run a single verb swap. Returns a promise that settles when the
   * new token has snapped to its settled state. */
  function swapVerb(nextWord, crossMs) {
    return new Promise(resolve => {
      if (verbCycleAbort || !overlay) { resolve(); return; }
      const verbEl = overlay.querySelector('[data-verb]');
      const currentToken = overlay.querySelector('[data-verb-token]');
      if (!verbEl || !currentToken) { resolve(); return; }

      /* 1. Pre-measure the incoming word, animate the container width. */
      const nextW = measureVerb(nextWord);
      verbEl.style.width = nextW + 'px';

      /* 2. Mount the incoming token in the entry state. */
      const incoming = document.createElement('span');
      incoming.className = 'kw-msu__verb-token is-incoming';
      incoming.setAttribute('data-verb-token', '');
      incoming.textContent = nextWord;
      verbEl.appendChild(incoming);

      /* 3. Drop the [data-verb-token] selector on the outgoing element
       *    so future measure/swap calls find the *new* token. */
      currentToken.removeAttribute('data-verb-token');

      /* 4. Trigger outgoing animation immediately. setTimeout(0) rather
       * than requestAnimationFrame so the cycle still runs when the tab
       * is backgrounded (rAF is throttled when document.hidden). */
      setTimeout(() => {
        currentToken.classList.add('is-out');
      }, 0);

      /* 5. Stagger the incoming entry by 80ms (overlap with outgoing). */
      setTimer(() => {
        incoming.classList.remove('is-incoming');
        incoming.classList.add('is-settled');
      }, 80);

      /* 6. Ambient ring flash to punctuate the swap. */
      const ring = overlay.querySelector('[data-ring]');
      if (ring) {
        ring.classList.add('is-pulse');
        setTimer(() => ring.classList.remove('is-pulse'), 400);
      }

      /* 7. Remove the outgoing token once its fade finishes. */
      setTimer(() => {
        if (currentToken.parentNode) currentToken.remove();
        resolve();
      }, 300);
    });
  }

  async function runVerbCycle(t) {
    /* Set the very first verb width before reveal so the line lands
     * at a width that matches token #0 ("Create."). */
    const verbEl = overlay && overlay.querySelector('[data-verb]');
    if (verbEl) {
      const w0 = measureVerb(VERBS[0]);
      verbEl.style.width = w0 + 'px';
    }

    /* Walk through verbs 1..n. Verb 0 ("Create.") is already mounted. */
    for (let i = 1; i < VERBS.length; i++) {
      if (verbCycleAbort) return;
      await new Promise(r => setTimer(r, t.verbHold));
      if (verbCycleAbort) return;
      await swapVerb(VERBS[i], t.verbCross);
    }
  }

  function reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) { return false; }
  }

  /* ─────────────── Public API ─────────────── */
  function play() {
    if (playing || dismissing) return;
    playing = true;
    ensureStyleInjected();

    overlay = buildOverlay();
    document.body.appendChild(overlay);

    const reduced = reducedMotion();
    const t = timings(reduced);

    /* Stage 0 — overlay fades in next tick so the transition fires.
     * Use setTimeout(0) rather than requestAnimationFrame: rAF is
     * throttled / paused when document.hidden is true (headless test
     * runs, backgrounded tabs), which would leave the overlay stuck
     * at opacity 0. setTimeout(0) is unconditional and still gives
     * the browser one tick to register the initial state before the
     * .is-in class flip triggers the CSS transition. */
    setTimeout(() => {
      if (!overlay) return;
      /* Force a style flush so the from-state is committed before
       * the to-state is requested — without this, both states can
       * collapse into a single computed paint and skip the transition. */
      void overlay.offsetWidth;
      overlay.classList.add('is-in');
    }, 16);

    /* Ambient ring fades in on its own delayed transition (CSS). */
    setTimer(() => {
      const ring = overlay && overlay.querySelector('[data-ring]');
      if (ring) ring.classList.add('is-in');
    }, 50);

    /* Stage 1 — eyebrow. */
    setTimer(() => {
      const eyebrow = overlay && overlay.querySelector('[data-eyebrow]');
      if (eyebrow) eyebrow.classList.add('is-in');
    }, t.eyebrowIn);

    /* Stage 2 — title words stagger in. */
    setTimer(() => {
      if (!overlay) return;
      const words = overlay.querySelectorAll('.kw-msu__title-word');
      words.forEach((w, i) => {
        setTimer(() => w.classList.add('is-in'), i * t.titleStagger);
      });
    }, t.titleIn);

    /* Stage 3 — title shrinks up + verb showcase begins. */
    setTimer(() => {
      const title = overlay && overlay.querySelector('[data-title]');
      if (title) title.classList.add('is-shrunk');
    }, t.shrinkAt);

    setTimer(() => {
      const verbline = overlay && overlay.querySelector('[data-verbline]');
      if (verbline) verbline.classList.add('is-in');
    }, t.verblineIn);

    setTimer(() => {
      runVerbCycle(t).then(() => {
        /* On the final verb ("Run."), gentle pulse during the coda hold. */
        if (verbCycleAbort || !overlay) return;
        const finalToken = overlay.querySelector('[data-verb-token]');
        if (finalToken) finalToken.classList.add('is-pulse');
      });
    }, t.firstVerbAt);

    /* Stage 4 — coda. */
    setTimer(() => {
      const coda = overlay && overlay.querySelector('[data-coda]');
      if (coda) coda.classList.add('is-in');
    }, t.codaAt);

    /* Auto-dismiss at the end. The user can skip earlier with ESC or
     * the Passer button; both paths route through dismiss(). */
    setTimer(() => { dismiss(); }, t.autoEnd);

    /* Skip + ESC bindings. */
    const skipBtn = overlay.querySelector('[data-kw-msu-skip]');
    if (skipBtn) on(skipBtn, 'click', () => dismiss());

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    };
    /* Capture-phase so we run before any other ESC handler (including
     * the lock controller's, though that one has already removed
     * itself by the time the tease plays). */
    on(document, 'keydown', escHandler, true);
  }

  function dismiss() {
    if (dismissing || !overlay) return;
    dismissing = true;
    verbCycleAbort = true;

    overlay.classList.remove('is-in');
    overlay.classList.add('is-out');

    /* Wait the fade duration, then clean up DOM + listeners. */
    setTimeout(() => {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      clearTimers();
      offAll();
      playing = false;
      dismissing = false;
      verbCycleAbort = false;
    }, 460);
  }

  window.KiwiMarketingTease = {
    play: play,
    dismiss: dismiss,
    __installed: true,
  };
})();
