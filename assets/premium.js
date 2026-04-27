/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · premium polish runtime
 *  - Body scroll-tracking for pill nav
 *  - Rotating verb carousel in hero
 *  - Morocco map random pulse pings (Vercel-style)
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ─── Pill nav scroll tracker ─── */
  function initPillNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    nav.classList.add('pill-morph');
    const threshold = 24;
    let ticking = false;
    function check() {
      if (window.scrollY > threshold) document.body.classList.add('scrolled');
      else document.body.classList.remove('scrolled');
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(check);
        ticking = true;
      }
    }, { passive: true });
    check();
  }

  /* ─── Rotating verb in hero ─── */
  function initVerbRotator() {
    const el = document.querySelector('.verb-rotator .verb-txt');
    if (!el) return;
    const verbs = ['encaisse', 'rembourse', 'collecte la Zakat', 'prête', 'transfère', 'fidélise', 'pilote', 'paie les factures', 'protège'];
    let idx = 0;
    setInterval(() => {
      idx = (idx + 1) % verbs.length;
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.style.animation = '';
      el.textContent = verbs[idx];
    }, 2200);
  }

  /* ─── Morocco map random pings (ripple expanding from random city) ─── */
  function initMapPings() {
    const svg = document.querySelector('.ma-map svg');
    if (!svg) return;
    // Find existing city dots to ping
    const cities = [
      { x: 168, y: 152, c: 'Casablanca' }, // biggest
      { x: 158, y: 118, c: 'Rabat' },
      { x: 180, y: 228, c: 'Marrakech' },
      { x: 140, y: 68, c: 'Tanger' },
      { x: 220, y: 118, c: 'Fès' },
      { x: 130, y: 274, c: 'Agadir' },
    ];
    setInterval(() => {
      if (document.hidden) return;
      const c = cities[Math.floor(Math.random() * cities.length)];
      const ping = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ping.setAttribute('class', 'ma-ping');
      ping.setAttribute('cx', c.x);
      ping.setAttribute('cy', c.y);
      ping.setAttribute('r', '3');
      svg.appendChild(ping);
      setTimeout(() => ping.remove(), 2100);
    }, 1400);
  }

  function init() {
    initPillNav();
    initVerbRotator();
    initMapPings();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
